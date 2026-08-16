import {
  PublicClientApplication,
  BrowserAuthError,
  type Configuration,
  type IPublicClientApplication,
  type AuthenticationResult,
  type AccountInfo
} from '@azure/msal-browser';
import { authScopes } from './msalConfig';

let pca: IPublicClientApplication | null = null;
let initPromise: Promise<void> | null = null;

// Ensures we only try to process the redirect once per page load.
let redirectHandled = false;

// Hard cap on how long we'll wait for MSAL's handleRedirectPromise. If it
// exceeds this the network is likely wedged; throw so the init promise
// resolves into an error UI instead of spinning forever.
const REDIRECT_PROCESS_TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${label}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Simple telemetry — writes structured events to console so we can see
// recovery activity in production logs without extra infrastructure.
function logAuthEvent(event: string, detail: Record<string, unknown> = {}) {
  const line = { ts: new Date().toISOString(), event, ...detail };
  // Use console.info so browser logs capture it at the default level
  console.info('[auth]', line);
}

function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildConfigFromEnv(): Configuration {
  const clientId = import.meta.env.VITE_AUTH_CLIENT_ID as string | undefined;
  const authority = import.meta.env.VITE_AUTH_AUTHORITY as string | undefined;
  const redirectUri = import.meta.env.VITE_AUTH_REDIRECT_URI as string | undefined;

  if (!clientId || !authority || !redirectUri) {
    throw new Error(
      'Missing MSAL env vars: VITE_AUTH_CLIENT_ID, VITE_AUTH_AUTHORITY, VITE_AUTH_REDIRECT_URI'
    );
  }

  const knownAuthorities = parseCsv(
    import.meta.env.VITE_AUTH_KNOWN_AUTHORITIES as string | undefined
  );

  const postLogoutRedirectUri =
    (import.meta.env.VITE_AUTH_POST_LOGOUT_REDIRECT_URI as string | undefined) || '/';

  return {
    auth: {
      clientId,
      authority,
      knownAuthorities,
      redirectUri,
      postLogoutRedirectUri,
      // IMPORTANT: this setting allows MSAL to return to the original URL after processing the callback.
      // Many apps land back on "/" after login; therefore redirect processing must not be limited to /auth/callback.
      navigateToLoginRequestUrl: true
    },
    cache: {
      cacheLocation: 'localStorage',
      storeAuthStateInCookie: false
    }
  };
}

async function ensureActiveAccount(msal: IPublicClientApplication, result?: AuthenticationResult | null) {
  const accountFromResult: AccountInfo | null = result?.account ?? null;

  if (accountFromResult) {
    msal.setActiveAccount(accountFromResult);
    return;
  }

  const existing = msal.getAllAccounts();
  if (existing.length > 0) {
    msal.setActiveAccount(existing[0]);
  }
}

/**
 * Clear any stale MSAL interaction-in-progress flags from session/local storage.
 * These get orphaned when a login redirect is interrupted (hard-refresh,
 * back button before callback finishes) and cause `hash_empty_error` on the
 * next load because MSAL thinks a redirect is in progress but the hash is gone.
 *
 * Only clears the interaction-tracking keys; real token cache is untouched.
 */
export function clearStaleInteractionFlags(): void {
  try {
    // MSAL tracks interaction state under keys like
    // `msal.<clientId>.interaction.status` and `msal.interaction.status`.
    const keysToCheck: Array<{ storage: Storage; keys: string[] }> = [
      { storage: sessionStorage, keys: [] },
      { storage: localStorage, keys: [] },
    ];
    for (const entry of keysToCheck) {
      for (let i = 0; i < entry.storage.length; i++) {
        const k = entry.storage.key(i);
        if (k && /\.interaction\.status$/i.test(k)) entry.keys.push(k);
      }
    }
    for (const { storage, keys } of keysToCheck) {
      for (const k of keys) storage.removeItem(k);
    }
  } catch { /* storage access denied — ignore */ }
}

/**
 * Sign the user out — completely, with NO "pick an account to sign out of"
 * chooser. Used by BOTH the account-menu Sign out and the idle auto-logout, so
 * the two can never drift apart.
 *
 * 2026-08-06 — why the previous fix wasn't enough. We already passed `account`,
 * which only tells MSAL whose LOCAL cache to drop; it does not tell Entra which
 * server-side session to end, so Entra still rendered its account picker. The
 * missing piece is `logoutHint`, which MSAL's own docs describe as:
 *
 *   "A string that specifies the account that is being logged out in order to
 *    SKIP THE SERVER ACCOUNT PICKER on logout."
 *
 * Microsoft's guidance is to source it from the ID token's `login_hint` claim;
 * for our Entra External ID local accounts that's the email, so we fall back to
 * preferred_username / username when the optional claim isn't configured on the
 * app registration.
 *
 * 2026-08-14 — AND THAT STILL WASN'T ENOUGH, because we are not on workforce
 * Entra. Our authority is `iadmexternalid.ciamlogin.com` — Entra External ID
 * (CIAM). `logout_hint` is a workforce-Entra parameter; CIAM's end-session
 * endpoint skips the account picker on **`id_token_hint`**, which is the raw ID
 * token, not an email. MSAL exposes it as `idTokenHint` on the logout request
 * (verified in the installed @azure/msal-common: CommonEndSessionRequest has the
 * field, and RequestParameterBuilder.addIdTokenHint writes `id_token_hint` onto
 * the logout URL), and MSAL v3's AccountInfo carries the raw token as
 * `account.idToken`.
 *
 * Both hints are sent. They're independent, cost nothing together, and this way
 * the behaviour is right whichever authority a given environment points at.
 *
 * Also clears interaction flags first: if a user ever abandoned the old picker
 * page, a stale `interaction_in_progress` would otherwise make this call throw
 * and leave them wedged (that's what locked Brandon out previously).
 */
export async function hardLogout(instance: IPublicClientApplication): Promise<void> {
  const account =
    instance.getActiveAccount() ?? instance.getAllAccounts()[0] ?? undefined;

  const claims = (account?.idTokenClaims ?? {}) as Record<string, unknown>;
  const loginHint =
    (typeof claims.login_hint === 'string' && claims.login_hint) ||
    (typeof claims.preferred_username === 'string' && claims.preferred_username) ||
    account?.username ||
    undefined;

  // Get the RAW id token, trying every place MSAL can hold it. This is the
  // parameter CIAM actually acts on, and each earlier attempt failed because
  // the value silently came back undefined:
  //   1. AccountInfo.idToken — declared in MSAL v3 but NOT populated by
  //      getActiveAccount()/getAllAccounts(); those rebuild the account from
  //      the account cache and only fill idTokenClaims.
  //   2. acquireTokenSilent().idToken — correct, but throws if the token needs
  //      a network refresh and the session is already half-gone.
  //   3. the localStorage cache entry MSAL writes it to — the last resort, and
  //      the only one that still works when the other two have given up.
  const idToken = await resolveRawIdToken(instance, account);

  clearStaleInteractionFlags();
  try { await instance.clearCache?.(); } catch { /* ignore */ }

  // Build the end-session URL BY HAND rather than going through
  // logoutRedirect().
  //
  // 2026-08-14 — three fixes in a row "shipped" and changed nothing, because
  // each one handed MSAL a parameter that turned out to be undefined and MSAL
  // silently omitted it. Constructing the URL here means what we intend to send
  // is exactly what gets sent, and the log line below states it as fact instead
  // of another assumption. This is the same lesson as the phantom-column sweep:
  // stop trusting that a call did what it looked like it did.
  const authority = String(import.meta.env.VITE_AUTH_AUTHORITY || '').replace(/\/+$/, '');
  if (!authority) {
    window.location.assign('/');
    return;
  }

  const params = new URLSearchParams();
  params.set('post_logout_redirect_uri', window.location.origin);
  if (idToken) params.set('id_token_hint', idToken);
  // Harmless on CIAM, and correct if an environment ever points at workforce Entra.
  if (loginHint) params.set('logout_hint', loginHint);

  const url = `${authority}/oauth2/v2.0/logout?${params.toString()}`;
  console.info(
    '[logout] id_token_hint:', idToken ? `present (${idToken.length} chars)` : 'MISSING',
    '| logout_hint:', loginHint || 'MISSING',
  );

  window.location.assign(url);
}

/** Raw id token from wherever MSAL is actually keeping it. Never throws. */
async function resolveRawIdToken(
  instance: IPublicClientApplication,
  account: AccountInfo | undefined,
): Promise<string | undefined> {
  if (account?.idToken) return account.idToken;

  if (account) {
    try {
      const r = await instance.acquireTokenSilent({ account, scopes: authScopes });
      if (r.idToken) return r.idToken;
    } catch { /* fall through to the cache scan */ }
  }

  // MSAL stores credentials in localStorage under keys shaped like
  // `<homeAccountId>-<env>-idtoken-<clientId>-<tenantId>---`, with the raw JWT
  // on the entry's `secret` field. Prefer the entry belonging to THIS account;
  // fall back to any id token if the account couldn't be resolved at all.
  try {
    const want = account?.homeAccountId?.toLowerCase();
    let fallback: string | undefined;
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key || !key.toLowerCase().includes('-idtoken-')) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      let secret: string | undefined;
      try { secret = JSON.parse(raw)?.secret; } catch { continue; }
      if (!secret) continue;
      if (want && key.toLowerCase().startsWith(want)) return secret;
      fallback ??= secret;
    }
    return fallback;
  } catch {
    return undefined;
  }
}

/**
 * Initialize MSAL once (safe to call multiple times).
 * ALSO processes redirect responses globally so login works even if the app lands back on "/".
 */
export async function initMsal(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (!pca) {
      pca = new PublicClientApplication(buildConfigFromEnv());
    }

    await pca.initialize();

    // Process redirect response ONCE globally (not only on /auth/callback).
    // If the browser returns to "/" after auth, this is where the code gets processed and stored.
    if (!redirectHandled) {
      redirectHandled = true;
      try {
        const result = await withTimeout(
          pca.handleRedirectPromise(),
          REDIRECT_PROCESS_TIMEOUT_MS,
          'handleRedirectPromise'
        );
        await ensureActiveAccount(pca, result);
        logAuthEvent('init.redirect_processed', { has_account: !!result?.account });
      } catch (err) {
        // `hash_empty_error` means MSAL thought a redirect was in progress
        // (sessionStorage has an interaction-in-progress flag) but the URL
        // hash is empty — usually because the user refreshed mid-login, hit
        // the back button after callback, or navigated directly to /. The
        // correct recovery is to wipe the stale flag and continue. This is
        // NOT a real auth failure.
        const isHashEmpty = err instanceof BrowserAuthError && err.errorCode === 'hash_empty_error';
        const isNoCachedAuth = err instanceof BrowserAuthError && err.errorCode === 'no_cached_authority_error';
        const isTimeout = err instanceof Error && err.message.startsWith('Timeout');
        if (isHashEmpty || isNoCachedAuth) {
          logAuthEvent('init.recovered', { code: (err as BrowserAuthError).errorCode });
          clearStaleInteractionFlags();
          await ensureActiveAccount(pca, null);
        } else if (isTimeout) {
          logAuthEvent('init.redirect_timeout', { ms: REDIRECT_PROCESS_TIMEOUT_MS });
          clearStaleInteractionFlags();
          // Fall through to cache-only — don't throw, so the app can still
          // show a sign-in prompt instead of a blank failure screen.
          await ensureActiveAccount(pca, null);
        } else {
          logAuthEvent('init.redirect_failed', { error: err instanceof Error ? err.message : String(err) });
          throw err;
        }
      }
    } else {
      // Ensure we still have an active account if cache is populated.
      await ensureActiveAccount(pca, null);
    }
  })();

  return initPromise;
}

/**
 * Get the MSAL instance (must be initialized first).
 */
export function getMsal(): IPublicClientApplication {
  if (!pca) {
    throw new Error('MSAL not constructed yet. Call initMsal() first.');
  }
  return pca;
}

/**
 * Convenience: ensure init and return the instance.
 */
export async function getMsalInitialized(): Promise<IPublicClientApplication> {
  await initMsal();
  return getMsal();
}
