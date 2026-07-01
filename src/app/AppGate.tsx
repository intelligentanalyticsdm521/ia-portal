import { useEffect, useMemo, useRef, useState } from 'react';
import { useIsAuthenticated, useMsal } from '@azure/msal-react';
import { BrowserAuthError } from '@azure/msal-browser';
import { useAccessToken } from '../auth/useAccessToken';
import { useAppState } from './AppState';
import { PlatformApiError, selectTenant, sessionVerify } from '../lib/platformApi';
import { getCurrentActAsSession } from '../lib/founderApi';
import {
  setEmergencyActAsState,
  getEmergencyActAsState,
} from '../lib/emergencyActAs';

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

/** Retry a promise-returning fn once on network-shape errors. */
async function retryOnce<T>(fn: () => Promise<T>, label: string): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const isRetryable =
      (err instanceof TypeError && /fetch|network|load failed/i.test(err.message)) ||
      (err instanceof Error && (err.name === 'AbortError' || (err as any).isAuthTimeout));
    if (!isRetryable) throw err;
    console.info('[auth]', { ts: new Date().toISOString(), event: 'bootstrap.retry', step: label, first_error: err instanceof Error ? err.message : String(err) });
    // Small backoff before retry (jittered)
    await new Promise((r) => setTimeout(r, 400 + Math.random() * 400));
    return await fn();
  }
}

const BOOTSTRAP_STEP_TIMEOUT_MS = 12_000;

export function AppGate({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useIsAuthenticated();
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
        const SESSION_ACT_AS_KEY = 'iadm.portal.actAsTenantId.v1';
        const sessionActAs = (() => {
          try { return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(SESSION_ACT_AS_KEY) : null; }
          catch { return null; }
        })();
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
        appState.setActiveTenantId(tenantToSelect);
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
            const RECOVERY_FLAG = 'iadm.portal.auth_auto_recovery';
            const alreadyRecovered = sessionStorage.getItem(RECOVERY_FLAG) === '1';
            console.warn('[AppGate] recoverable MSAL error:', err.errorCode, 'alreadyRecovered=', alreadyRecovered);

            clearMsalInteractionFlags();

            if (!alreadyRecovered) {
              // First encounter — auto-recover silently. Set the flag so we
              // don't loop, then reload the page to reinitialize MSAL clean.
              sessionStorage.setItem(RECOVERY_FLAG, '1');
              setTimeout(() => window.location.reload(), 50);
              return;   // Leave loading state true while reload completes
            }

            // Second encounter in this tab — stop auto-recovery and surface
            // an actionable message so the user can decide.
            setError(
              'Sign-in state appears to be stuck. Click "Clear & Retry" to fully reset ' +
              'your session storage and reload the page. Your browser tab may have kept ' +
              'a stale authentication handshake from a prior attempt.'
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
            setError(
              'Network timeout while verifying your session. This usually means the API is ' +
              'starting up or your connection dropped briefly. Click Retry in a few seconds. ' +
              'If this keeps happening, check your internet or contact support.'
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
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-6 py-16">
        <h1 className="text-2xl font-semibold">IADM Portal</h1>
        <p className="text-gray-600">
          Sign in to access your tenant dashboard, modules, and account settings.
        </p>
        <button
          type="button"
          className="inline-flex w-fit items-center justify-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
          onClick={() => login()}
        >
          Sign in
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