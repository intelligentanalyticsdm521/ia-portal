import {
  PublicClientApplication,
  type Configuration,
  type IPublicClientApplication,
  type AuthenticationResult,
  type AccountInfo
} from '@azure/msal-browser';

let pca: IPublicClientApplication | null = null;
let initPromise: Promise<void> | null = null;

// Ensures we only try to process the redirect once per page load.
let redirectHandled = false;

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
      const result = await pca.handleRedirectPromise();
      await ensureActiveAccount(pca, result);
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
