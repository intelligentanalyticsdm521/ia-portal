import { useEffect, useMemo, useRef, useState } from 'react';
import { useIsAuthenticated, useMsal } from '@azure/msal-react';
import { BrowserAuthError } from '@azure/msal-browser';
import { useAccessToken } from '../auth/useAccessToken';
import { useAppState } from './AppState';
import { PlatformApiError, selectTenant, sessionVerify } from '../lib/platformApi';
import { retryWithBackoff } from '../lib/authRetry';
import { getCurrentActAsSession } from '../lib/founderApi';
import { DEV_AUTH } from '../lib/devAuth';
import {
  setEmergencyActAsState,
  getEmergencyActAsState,
} from '../lib/emergencyActAs';
import { getActAsTenantId } from '../lib/actAsSession';

/**
 * Clear stale MSAL interaction-tracking flags from session/local storage.
 * Used when we catch hash_empty_error or similar transient states so the
 * user can retry without having to hard-refresh + clear cookies manually.
 */
function clearMsalInteractionFlags() {
  try {
    const stores: Storage[] = [sessionStorage, localStorage];
    for (const store of stores) {
      const toRemove: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k && /\.interaction\.status$/i.test(k)) toRemove.push(k);
      }
      for (const k of toRemove) store.removeItem(k);
    }
  } catch { /* storage denied — ignore */ }
}

/** Wrap a promise with a hard timeout; preserves original error if it wins. */
function withAuthTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const e: Error & { isAuthTimeout?: boolean } = new Error(`Timeout after ${ms}ms: ${label}`);
      e.isAuthTimeout = true;
      reject(e);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Retry a bootstrap step across the platform-api warm-up window. Historically
 * this retried ONCE on network-shape errors only, so a user who loaded the Portal
 * in the few-second window after a deploy/restart (API still warming → 5xx or a
 * timeout) got a hard error and had to Clear State & Retry. Now it retries
 * transient failures (network / timeout / status-0 / 5xx) a few times with
 * exponential backoff, and still surfaces a genuine 401/403/400 immediately.
 * See lib/authRetry.
 */
async function retryOnce<T>(fn: () => Promise<T>, label: string): Promise<T> {
  return retryWithBackoff(fn, {
    label,
    onRetry: ({ attempt, delayMs, error }) =>
      console.info('[auth]', {
        ts: new Date().toISOString(),
        event: 'bootstrap.retry',
        step: label,
        attempt,
        delayMs,
        first_error: error instanceof Error ? error.message : String(error),
      }),
  });
}

const BOOTSTRAP_STEP_TIMEOUT_MS = 12_000;

export function AppGate({ children }: { children: React.ReactNode }) {
  // Call the hook unconditionally (rules of hooks), then OR the dev flag in.
  // Under VITE_DEV_AUTH=1 there is no MSAL session and never will be — the
  // backend authenticates on the x-dev-tenant header instead (lib/devAuth.ts).
  // Compiled out of production builds: Vite inlines import.meta.env at build
  // time, so DEV_AUTH is the literal `false` there.
  const msalAuthenticated = useIsAuthenticated();
  const isAuthenticated = DEV_AUTH || msalAuthenticated;
  const { instance: msal } = useMsal();
  const { activeAccount, login, getToken } = useAccessToken();
  const appState = useAppState();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs to avoid stale closures and prevent re-trigger loops
  const inFlightRef = useRef(false);
  const bootstrapDoneRef = useRef(false);

  const tenantOptions = useMemo(() => appState.bootstrap?.tenants || [], [appState.bootstrap]);

  useEffect(() => {
    // reset view-level errors when auth state changes
    setError(null);
    // Reset bootstrap flag so a new account triggers a fresh bootstrap
    bootstrapDoneRef.current = false;
  }, [isAuthenticated, activeAccount]);

  // Welcome/activation links (?welcome=1) are first-time clients. Skip the
  // interstitial sign-in screen and send them straight to Entra's Create-account
  // page (login() detects the welcome context → prompt=create + email hint).
  // Guarded by a ref + sessionStorage so a cancelled/returned redirect can't loop.
  const welcomeRedirectRef = useRef(false);
  useEffect(() => {
    if (isAuthenticated) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('welcome') !== '1') return;
    if (welcomeRedirectRef.current || sessionStorage.getItem('welcome_create_redirect') === '1') return;
    welcomeRedirectRef.current = true;
    sessionStorage.setItem('welcome_create_redirect', '1');
    login({ create: true, loginHint: params.get('prefill_email') || undefined });
  }, [isAuthenticated, login]);

  // Bootstrap effect — depends ONLY on auth identity, not on state it writes to
  useEffect(() => {
    async function run() {
      if (!isAuthenticated) return;
      if (!activeAccount) return;

      // Already bootstrapped for this session — don't re-run
      if (bootstrapDoneRef.current) return;

      // Prevent overlapping bootstraps (e.g., rapid auth/account churn).
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      setLoading(true);

      try {
        const tokenResult = await withAuthTimeout(getToken(), BOOTSTRAP_STEP_TIMEOUT_MS, 'getToken');
        const accessToken = tokenResult.accessToken;

        // 1) Verify session and fetch tenant memberships (no tenant header).
        // Retry once on network-shape errors to ride out transient Azure hiccups.
        const v = await retryOnce(() => withAuthTimeout(
          sessionVerify({
            baseUrl: import.meta.env.VITE_PLATFORM_API_BASE_URL,
            bearerToken: accessToken
          }),
          BOOTSTRAP_STEP_TIMEOUT_MS,
          'sessionVerify'
        ), 'sessionVerify');

        appState.setBootstrap(v);

        if (v.surface !== 'iadm_portal') {
          setError(
            'This application is the IADM Portal. Your token indicates a different portal surface.'
          );
          appState.setActive(null);
          bootstrapDoneRef.current = true;
          return;
        }

        const tenants = v.tenants || [];
        if (!tenants.length) {
          setError(
            'Your account is authenticated, but no tenants are assigned. Contact IADM support.'
          );
          appState.setActive(null);
          bootstrapDoneRef.current = true;
          return;
        }

        // 2) Determine active tenant.
        //
        // 2026-06-20 — only super-user (info@intelligentanalyticsdm.com)
        // sees the tenant picker. Brandon's rule: "this should only be a
        // super user function". For everyone else (Brandon.Sheriff +
        // client users), auto-route to their home tenant — never show
        // the picker, even if they accidentally have memberships in
        // multiple tenants (e.g. test invitations that slipped through
        // the new founder-team guard in onboardClient.js / verify.js).
        //
        // Order of preference:
        //   (a) explicit per-tab "act as" via sessionStorage — super-user
        //       picker writes here so a swap is scoped to the tab and gone
        //       on next browser launch
        //   (b) sole membership
        //   (c) backend-supplied homeTenantId (IA team → founder tenant,
        //       clients → oldest active membership)
        //   (d) first membership as last-resort fallback
        //
        // 2026-06-26 — REMOVED long-term `iadm.portal.activeTenantId`
        // localStorage pin for super-users. Brandon reported "ARION shows
        // Briarwood Dental on every tenant page" — root cause was the
        // localStorage pin from a previous super-user picker click, which
        // stuck the founder session in client tenant context across reloads
        // and across days. Now: pins live in sessionStorage (per-tab,
        // ephemeral). Founders default to home tenant on every fresh open;
        // explicit per-tab swap via super-user picker still works.
        const homeMatch = v.homeTenantId
          ? tenants.find((t) => t.tenantId === v.homeTenantId)
          : null;
        const isSuperUser = !!v.user?.isSuperUser;
        // Read through lib/actAsSession so the picker cannot write a key this
        // resolver does not read. It did exactly that until 2026-09-14: the
        // name was typed here and nowhere else, so an explicit pick was undone
        // by the picker's own hard navigation.
        const sessionActAs = getActAsTenantId();
        const sessionMatch = sessionActAs ? tenants.find((t) => t.tenantId === sessionActAs) : null;

        // One-time migration: nuke any stale long-term pin from before this
        // fix so it can't override the home-tenant default on next boot.
        if (isSuperUser) {
          try { localStorage.removeItem('iadm.portal.activeTenantId'); } catch {}
        }

        // ── Consultant workspace URL override ──────────────────────────────
        // 2026-06-27 — Founder (Brandon) can land on /c/:client_tenant_id to
        // open a consultant workspace scoped to a client tenant he holds a
        // `consultant_grant` for (not necessarily a full membership). See
        // memory: consultant-grant-model. Platform-api's /select-tenant
        // endpoint was patched the same day to accept consultant_grant
        // access, so we just override tenantToSelect with the URL-supplied
        // UUID here — the selectTenant call below will succeed against any
        // tenant Brandon has a grant for, even when it isn't in `tenants[]`.
        //
        // Additive: if the path doesn't match or the user isn't a founder,
        // we fall through to the normal homeMatch/sessionMatch logic below.
        const CONSULTANT_WORKSPACE_KEY = 'iadm.portal.consultantWorkspace.v1';
        const CONSULTANT_TARGET_KEY = 'iadm.portal.consultantTargetTid.v1';
        const consultantPathMatch = (() => {
          try {
            const path = typeof window !== 'undefined' ? window.location.pathname : '';
            const m = path.match(/^\/c\/([0-9a-f-]{36})\/?/i);
            return m ? m[1] : null;
          } catch { return null; }
        })();
        // sessionStorage backup of the target tid. ConsultantWorkspaceEntry
        // (the /c/:tid route element) writes this before redirecting to
        // /app/overview so we can read it here during bootstrap. Per-tab
        // session means each consultant workspace tab is independent — the
        // founder's main IA tab doesn't see this key.
        const consultantSessionTid = (() => {
          try {
            if (typeof sessionStorage === 'undefined') return null;
            const v = sessionStorage.getItem(CONSULTANT_TARGET_KEY) || '';
            return /^[0-9a-f-]{36}$/i.test(v) ? v : null;
          } catch { return null; }
        })();
        const consultantTargetTid = consultantPathMatch || consultantSessionTid;
        const isFounder = !!v.user?.isFounder;
        const isConsultantWorkspace = !!(consultantTargetTid && isFounder);
        try {
          if (typeof sessionStorage !== 'undefined') {
            if (isConsultantWorkspace) {
              sessionStorage.setItem(CONSULTANT_WORKSPACE_KEY, 'true');
            } else {
              sessionStorage.removeItem(CONSULTANT_WORKSPACE_KEY);
            }
          }
        } catch { /* storage denied — ignore */ }

        let tenantToSelect: string | null = null;
        if (isConsultantWorkspace) {
          // Founder opened /c/:tid in an iframe. Target tid comes from URL
          // (first paint) or sessionStorage (post-MSAL-redirect recovery —
          // the auth dance rewrites the URL to /auth/callback so we'd lose
          // the path match otherwise). platform-api's /select-tenant accepts
          // consultant_grant, so this tid resolves even if it's not in v.tenants.
          tenantToSelect = consultantTargetTid;
          // Rewrite URL to /app/* so React Router renders the AppShell tree
          // (the Portal has no /c/:tid Route).
          try {
            window.history.replaceState({}, '', '/app/overview');
          } catch { /* same-origin only — should always succeed */ }
        } else if (tenants.length === 1) {
          tenantToSelect = tenants[0].tenantId;
        } else if (isSuperUser) {
          // Super-user: per-tab session swap first, then HOME by default.
          tenantToSelect = sessionMatch?.tenantId || homeMatch?.tenantId || tenants[0].tenantId;
        } else {
          // Non-super-user: ALWAYS auto-route to home tenant.
          tenantToSelect = homeMatch?.tenantId || tenants[0].tenantId;
        }

        if (!tenantToSelect) {
          // Only reached for super-user with no stored choice — show picker.
          appState.setActive(null);
          bootstrapDoneRef.current = true;
          return;
        }

        // 3) Select tenant to load service entitlements
        const selected = await retryOnce(() => withAuthTimeout(
          selectTenant({
            baseUrl: import.meta.env.VITE_PLATFORM_API_BASE_URL,
            bearerToken: accessToken,
            tenantId: tenantToSelect
          }),
          BOOTSTRAP_STEP_TIMEOUT_MS,
          'selectTenant'
        ), 'selectTenant');

        appState.setActive(selected);
        // 2026-08-06 — in the consultant/view-as workspace, hold the client
        // tenant in MEMORY ONLY. Persisting it leaked the client's tenant into
        // the founder's own session: his portal reloaded into the client's
        // tenant (client's SPARK/OLIVER data, empty clients list, and
        // CONTACT_INSERT_NOT_ALLOWED_AS_CONSULTANT on writes).
        appState.setActiveTenantId(tenantToSelect, !isConsultantWorkspace);
        bootstrapDoneRef.current = true;
        // Clear any leftover auto-recovery flag from a prior broken session
        try { sessionStorage.removeItem('iadm.portal.auth_auto_recovery'); } catch {}

        // ── Emergency act-as rehydrate ─────────────────────────────────────
        // If this user is super-user (founder), ask oliver-api whether they
        // currently have an open 30-min emergency session. If so, repopulate
        // the in-memory singleton so:
        //   - the banner re-renders after a hard reload / new tab
        //   - every API client starts sending x-actas-mode: emergency again
        // For non-super-users this block is skipped — they can never have
        // an emergency session.
        //
        // We do this AFTER the tenant context is set so getCurrentActAsSession
        // has a valid x-tenant-key to send (oliver-api requires it). The
        // sessionStorage mirror in emergencyActAs.ts already covers
        // same-tab reloads; this network round-trip covers new tabs (where
        // sessionStorage is per-tab) and ensures the backend is the source
        // of truth on whether the session is still open.
        if (isSuperUser && !getEmergencyActAsState() && activeAccount) {
          try {
            const cur = await getCurrentActAsSession(msal, activeAccount, tenantToSelect);
            if (cur.session && cur.session.mode === 'emergency' && cur.session.expires_at) {
              // expires_at returned as ISO; Date.parse > now means still live.
              if (Date.parse(cur.session.expires_at) > Date.now()) {
                setEmergencyActAsState({
                  sessionId: cur.session.actas_log_id,
                  tenantId: cur.session.tenant_id,
                  tenantName: cur.session.tenant_full_name || cur.session.tenant_name,
                  startedAt: cur.session.started_at,
                  expiresAt: cur.session.expires_at,
                  reason: cur.session.reason,
                });
              }
            }
          } catch (rehydrateErr) {
            // Non-fatal — without a rehydrated session the user just sees the
            // normal Portal. They can re-open emergency from the picker.
            console.warn('[AppGate] emergency act-as rehydrate failed:', rehydrateErr);
          }
        }
      } catch (err) {
        if (err instanceof PlatformApiError) {
          if (err.status === 401) {
            setError('Authentication failed (401). Your token was rejected by platform-api.');
          } else if (err.status === 403) {
            setError(
              'Not authorized (403). Your account is authenticated but not allowed for the requested tenant.'
            );
          } else if (err.status === 408) {
            setError(
              'platform-api request timed out. This usually means the API is restarting or stuck connecting to SQL. Check /health and /__meta on platform-api.'
            );
          } else if (err.status === 400) {
            setError('Bad request (400).');
          } else {
            setError(`platform-api error (${err.status}).`);
          }
          console.error('platform-api error body:', err.body);
        } else if (err instanceof BrowserAuthError) {
          // Transient MSAL state (hash_empty_error, no_cached_authority_error,
          // interaction_in_progress, monitor_window_timeout) — the fix is to
          // clear the stale interaction flags AND force a full page reload so
          // MSAL reinitializes with clean in-memory state. Just clearing flags
          // isn't enough because the current MSAL instance still thinks an
          // interaction is running.
          //
          // We guard against reload-loops with a sessionStorage flag — if we
          // already auto-recovered once and the error still fires, show the
          // UI error instead of looping.
          const recoverableCodes = new Set([
            'hash_empty_error',
            'no_cached_authority_error',
            'interaction_in_progress',
            'monitor_window_timeout',
          ]);
          if (recoverableCodes.has(err.errorCode)) {
            // Auto-recover silently up to MAX_AUTO_RECOVERIES times (per tab)
            // before falling back to the manual UI. A restart-induced timeout
            // can leave MSAL's interaction lock stuck; clearing the flags + a
            // clean reload almost always fixes it, and giving it two shots
            // means the user effectively never has to click Clear & Retry.
            const RECOVERY_COUNT_KEY = 'iadm.portal.auth_auto_recovery';
            const MAX_AUTO_RECOVERIES = 2;
            const priorCount = Number(sessionStorage.getItem(RECOVERY_COUNT_KEY) || '0') || 0;
            console.warn('[AppGate] recoverable MSAL error:', err.errorCode, 'recoveryCount=', priorCount);

            clearMsalInteractionFlags();

            if (priorCount < MAX_AUTO_RECOVERIES) {
              // Auto-recover silently: bump the counter so we can't loop
              // forever, then reload to reinitialize MSAL with clean state.
              sessionStorage.setItem(RECOVERY_COUNT_KEY, String(priorCount + 1));
              setTimeout(() => window.location.reload(), 50);
              return;   // Leave loading state true while reload completes
            }

            // Exhausted auto-recovery in this tab — surface an actionable
            // message. (Flags were already cleared above, so the manual reload
            // starts from clean state.)
            /* Name the error code and say plainly that this is THIS BROWSER.
               The old wording read like the server had done something: the
               founder saw it on his office laptop, could sign in fine on
               another machine, and reasonably concluded platform-api was down.
               It was not — zero 5xx, alwaysOn, serving normally. The state that
               is stuck lives in this browser and nowhere else, and the code
               tells us which of the four causes it was. Printing it here means
               nobody has to open DevTools to find out. */
            setError(
              `Sign-in state is stuck in THIS browser (${err.errorCode}). ` +
              'Nothing is wrong with the server — signing in from another device will work. ' +
              'Click "Clear & Retry" to reset this browser’s session storage and reload. ' +
              'If it happens again, clear site data for this domain ' +
              '(DevTools → Application → Clear site data) and quote the code above.'
            );
          } else {
            console.error('[AppGate MSAL error]', err);
            setError(
              `Authentication error: [${err.errorCode}] ${err.errorMessage || err.message}.\n\n` +
              `Click Retry or Switch Tenant to reset. If this persists, contact support.`
            );
          }
        } else {
          // Non-MSAL, non-platform errors: network, timeout, unexpected
          const isTimeout = err instanceof Error && (err as any).isAuthTimeout;
          const isNetwork = err instanceof TypeError && /fetch|network|load failed/i.test(err.message);
          const msg = err instanceof Error ? err.message : String(err);
          const name = err instanceof Error ? err.name : 'Error';

          if (isTimeout || isNetwork) {
            // A timeout here (after the backoff retries above) can leave MSAL's
            // interaction lock stuck from the aborted getToken — clear it so the
            // user's Retry/reload starts clean and doesn't cascade into a
            // "sign-in stuck" state.
            clearMsalInteractionFlags();
            setError(
              'The API is taking a moment to wake up. This can happen right after an update. ' +
              'Click Retry — it should connect within a few seconds. If it keeps happening, ' +
              'check your internet or contact support.'
            );
            console.warn('[AppGate bootstrap network]', { name, msg });
          } else {
            setError(
              `Unexpected error during login verification: [${name}] ${msg}\n\n` +
              `If this keeps happening, hard-refresh (Ctrl+Shift+R). Otherwise, please share this message with support.`
            );
            console.error('[AppGate bootstrap error]', err);
          }
        }

        appState.setBootstrap(null);
        appState.setActive(null);
        bootstrapDoneRef.current = true; // Don't retry on error — show error UI instead
      } finally {
        inFlightRef.current = false;
        setLoading(false);
      }
    }

    run();
    // Only re-run when auth identity changes — NOT when appState changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, activeAccount]);

  async function handleSelectTenant(tenantId: string) {
    setError(null);
    setLoading(true);

    try {
      const tokenResult = await getToken();
      const accessToken = tokenResult.accessToken;

      const selected = await selectTenant({
        baseUrl: import.meta.env.VITE_PLATFORM_API_BASE_URL,
        bearerToken: accessToken,
        tenantId
      });

      appState.setActive(selected);
      appState.setActiveTenantId(tenantId);
    } catch (err) {
      if (err instanceof PlatformApiError) {
        setError(`platform-api error (${err.status}).`);
        console.error('platform-api error body:', err.body);
      } else {
        setError('Unexpected error selecting tenant.');
        console.error(err);
      }
      appState.setActive(null);
    } finally {
      setLoading(false);
    }
  }

  if (!isAuthenticated) {
    const isWelcome = new URLSearchParams(window.location.search).get('welcome') === '1';
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-6 px-6 py-16">
        <img src="/ia-lockup-horiz-white.svg" alt="Intelligent Analytics" className="h-12 w-auto self-start" />
        <div>
          <h1 className="text-2xl font-semibold">
            {isWelcome ? "Let's finish setting up your account" : 'Sign in'}
          </h1>
          <p className="mt-2 text-gray-600">
            {isWelcome
              ? 'Create your password and we’ll take you straight to your dashboard.'
              : 'Access your dashboard, modules, and account settings.'}
          </p>
        </div>
        <button
          type="button"
          className="iadm-btn-primary w-fit"
          onClick={() => login(isWelcome ? { create: true } : undefined)}
        >
          {isWelcome ? 'Create your account' : 'Sign in'}
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-lg font-medium">Signing you in…</h1>
        <p className="text-sm text-gray-600">Verifying your session with platform-api.</p>
      </div>
    );
  }

  if (error) {
    const handleClearAndReload = () => {
      // Full MSAL reset: remove every msal.* key from both storages, clear
      // recovery flag, then reload so MSAL reinitializes from scratch.
      try {
        clearMsalInteractionFlags();
        const stores: Storage[] = [sessionStorage, localStorage];
        for (const store of stores) {
          const toRemove: string[] = [];
          for (let i = 0; i < store.length; i++) {
            const k = store.key(i);
            if (k && /^msal\./i.test(k)) toRemove.push(k);
          }
          for (const k of toRemove) store.removeItem(k);
        }
        sessionStorage.removeItem('iadm.portal.auth_auto_recovery');
      } catch { /* storage denied */ }
      window.location.reload();
    };

    return (
      <div className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-lg font-semibold">Access error</h1>
        <p className="mt-2 text-sm text-red-600" style={{ whiteSpace: 'pre-wrap' }}>{error}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            className="inline-flex items-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-900"
            onClick={() => {
              setError(null);
              bootstrapDoneRef.current = false;
              inFlightRef.current = false;
            }}
          >
            Retry
          </button>
          <button
            type="button"
            className="inline-flex items-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700"
            onClick={handleClearAndReload}
          >
            Clear &amp; Retry
          </button>
          <button
            type="button"
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            onClick={() => {
              localStorage.removeItem('iadm.portal.activeTenantId');
              setError(null);
              appState.setActiveTenantId(null);
              appState.setActive(null);
              appState.setBootstrap(null);
              bootstrapDoneRef.current = false;
              inFlightRef.current = false;
            }}
          >
            Switch Tenant
          </button>
        </div>
        <p className="mt-4 text-xs text-gray-500">
          If this continues, contact <a href="mailto:info@intelligentanalyticsdm.com"
            className="underline"
          >
            info@intelligentanalyticsdm.com
          </a>
          .
        </p>
      </div>
    );
  }

  if (!appState.bootstrap) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-lg font-semibold">Session not established</h1>
        <p className="mt-2 text-sm text-gray-700">
          You are signed in, but platform-api did not return any bootstrap information.
        </p>
      </div>
    );
  }

  if (!appState.active) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-lg font-semibold">Select a tenant</h1>
        <p className="mt-2 text-sm text-gray-700">
          Choose which tenant you want to work with in this session.
        </p>
        <div className="mt-4 space-y-2">
          {tenantOptions.map((t) => (
            <button
              key={t.tenantId}
              type="button"
              className="block w-full rounded-md border border-gray-200 px-4 py-2 text-left text-sm hover:bg-gray-50"
              onClick={() => handleSelectTenant(t.tenantId)}
            >
              <div className="font-medium">{t.tenantFullName || t.tenantName}</div>
              <div className="text-xs text-gray-500">{t.tenantId}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}