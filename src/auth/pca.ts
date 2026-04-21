import {
  PublicClientApplication,
  BrowserAuthError,
  type Configuration,
  type IPublicClientApplication,
  type AuthenticationResult,
  type AccountInfo
} from '@azure/msal-browser';

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
function clearStaleInteractionFlags(): void {
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
