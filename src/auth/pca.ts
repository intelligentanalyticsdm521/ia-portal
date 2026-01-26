import { PublicClientApplication, type Configuration, type IPublicClientApplication } from '@azure/msal-browser';

let pca: IPublicClientApplication | null = null;
let initPromise: Promise<void> | null = null;

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

  const knownAuthorities = parseCsv(import.meta.env.VITE_AUTH_KNOWN_AUTHORITIES as string | undefined);

  // Optional, but you already have it.
  const postLogoutRedirectUri = (import.meta.env.VITE_AUTH_POST_LOGOUT_REDIRECT_URI as string | undefined) || '/';

  return {
    auth: {
      clientId,
      authority,
      knownAuthorities,
      redirectUri,
      postLogoutRedirectUri
    },
    cache: {
      cacheLocation: 'localStorage',
      storeAuthStateInCookie: false
    }
  };
}

/**
 * Initialize MSAL once (safe to call multiple times).
 * This prevents "uninitialized_public_client_application" in callback flows.
 */
export async function initMsal(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (!pca) {
      pca = new PublicClientApplication(buildConfigFromEnv());
    }

    // MSAL requires initialize() to be awaited for certain flows.
    await pca.initialize();
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
