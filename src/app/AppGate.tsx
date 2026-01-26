import { useEffect, useState } from 'react';
import { useIsAuthenticated } from '@azure/msal-react';
import { useAccessToken } from '../auth/useAccessToken';
import { useAppState } from './AppState';
import { verifyAuth, PlatformApiError } from '../lib/platformApi';

export function AppGate({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useIsAuthenticated();
  const { activeAccount, login, getToken } = useAccessToken();
  const { tenantKey, portalContext, session, setSession } = useAppState();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
  }, [tenantKey, portalContext]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!isAuthenticated) return;
      if (!activeAccount) return;
      if (!tenantKey) {
        setError('Tenant identifier is required. Enter your tenant_id GUID (recommended) or tenant name in the header.');
        return;
      }

      setLoading(true);
      try {
        const tokenResult = await getToken();
        const accessToken = tokenResult.accessToken;

        // platform-api requires Authorization Bearer token + x-tenant-key + x-portal-context
        const v = await verifyAuth({
          baseUrl: import.meta.env.VITE_PLATFORM_API_BASE_URL,
          bearerToken: accessToken,
          tenantKey,
          portalContext
        });

        if (!cancelled) {
          setSession(v);
        }
      } catch (err) {
        if (cancelled) return;

        if (err instanceof PlatformApiError) {
          if (err.status === 401) {
            setError('Authentication failed (401). Your token was rejected by platform-api. Confirm tenant auth provider metadata_address and audience are correct.');
          } else if (err.status === 403) {
            setError('Not authorized (403). Your account is authenticated but not allowed for this tenant/portal context.');
          } else if (err.status === 400) {
            setError('Bad request (400). Confirm x-tenant-key is set to a valid tenant_id GUID or tenant name.');
          } else {
            setError(`platform-api error (${err.status}).`);
          }
          console.error('platform-api error body:', err.body);
        } else {
          setError('Unexpected error during verification. See console for details.');
          console.error(err);
        }
        setSession(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, activeAccount, tenantKey, portalContext, getToken, setSession, setError]);

  if (!isAuthenticated) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-6 py-16">
        <h1 className="text-2xl font-semibold">IADM Portal</h1>
        <p className="text-gray-600">
          Sign in to access your services and Intelligence Layers.
        </p>
        <button
          type="button"
          className="w-fit rounded-md bg-gray-900 px-4 py-2 text-white hover:bg-gray-800"
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
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-lg font-semibold">Access error</h1>
        <p className="mt-2 text-sm text-gray-700">{error}</p>
        <p className="mt-4 text-sm text-gray-600">
          If you believe this is incorrect, contact <span className="font-medium">info@intelligentanalyticsdm.com</span>.
        </p>
      </div>
    );
  }

  // We allow children even if session is null (e.g., if verify endpoint is down)
  // but we do not render protected content unless session exists.
  if (!session) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-lg font-semibold">Session not established</h1>
        <p className="mt-2 text-sm text-gray-700">
          You are signed in, but platform-api did not return a verified session.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
