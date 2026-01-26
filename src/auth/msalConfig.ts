import type { Configuration } from '@azure/msal-browser';

function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const clientId = import.meta.env.VITE_AUTH_CLIENT_ID as string;
const authority = import.meta.env.VITE_AUTH_AUTHORITY as string;
const knownAuthorities = parseCsv(import.meta.env.VITE_AUTH_KNOWN_AUTHORITIES);

const redirectUri =
  (import.meta.env.VITE_AUTH_REDIRECT_URI as string) || `${window.location.origin}/auth/callback`;

const postLogoutRedirectUri =
  (import.meta.env.VITE_AUTH_POST_LOGOUT_REDIRECT_URI as string) || `${window.location.origin}/`;

export const msalConfig: Configuration = {
  auth: {
    clientId,
    authority,
    knownAuthorities,
    redirectUri,
    postLogoutRedirectUri,
    navigateToLoginRequestUrl: false
  },
  cache: {
    cacheLocation: 'localStorage',
    storeAuthStateInCookie: false
  }
};

export const authScopes = parseCsv(import.meta.env.VITE_AUTH_SCOPES);
