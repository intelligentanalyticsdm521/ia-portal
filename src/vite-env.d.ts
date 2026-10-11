/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PLATFORM_API_BASE_URL: string;
  readonly VITE_ARION_API_BASE_URL?: string;
  readonly VITE_AUTH_CLIENT_ID: string;
  readonly VITE_AUTH_AUTHORITY: string;
  readonly VITE_AUTH_KNOWN_AUTHORITIES?: string;
  readonly VITE_AUTH_REDIRECT_URI?: string;
  readonly VITE_AUTH_POST_LOGOUT_REDIRECT_URI?: string;
  readonly VITE_AUTH_SCOPES: string;
  readonly VITE_DEFAULT_TENANT_ID?: string;
  readonly VITE_DEFAULT_PORTAL_CONTEXT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
