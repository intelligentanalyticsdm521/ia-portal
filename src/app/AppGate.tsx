import { useEffect, useMemo, useRef, useState } from 'react';
import { useIsAuthenticated } from '@azure/msal-react';
import { useAccessToken } from '../auth/useAccessToken';
import { useAppState } from './AppState';
import { PlatformApiError, selectTenant, sessionVerify } from '../lib/platformApi';

export function AppGate({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useIsAuthenticated();
  const { activeAccount, login, getToken, switchAccount } = useAccessToken();
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
        const tokenResult = await getToken();
        const accessToken = tokenResult.accessToken;

        // 1) Verify session and fetch tenant memberships (no tenant header)
        const v = await sessionVerify({
          baseUrl: import.meta.env.VITE_PLATFORM_API_BASE_URL,
          bearerToken: accessToken
        });

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

        // 2) Determine active tenant
        const stored = appState.activeTenantId;
        const storedMatch = stored ? tenants.find((t) => t.tenantId === stored) : null;

        const tenantToSelect =
          storedMatch?.tenantId || (tenants.length === 1 ? tenants[0].tenantId : null);

        if (!tenantToSelect) {
          // user must select tenant — show picker
          appState.setActive(null);
          bootstrapDoneRef.current = true;
          return;
        }

        // 3) Select tenant to load service entitlements
        const selected = await selectTenant({
          baseUrl: import.meta.env.VITE_PLATFORM_API_BASE_URL,
          bearerToken: accessToken,
          tenantId: tenantToSelect
        });

        appState.setActive(selected);
        appState.setActiveTenantId(tenantToSelect);
        bootstrapDoneRef.current = true;
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
        } else {
          setError('Unexpected error during login verification. See console for details.');
          console.error(err);
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
        <div className="flex gap-3">
          <button
            type="button"
            className="inline-flex w-fit items-center justify-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
            onClick={() => login()}
          >
            Sign in
          </button>
          <button
            type="button"
            className="inline-flex w-fit items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            onClick={() => login('login')}
          >
            Sign in as different account
          </button>
        </div>
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
      <div className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-lg font-semibold">Access error</h1>
        <p className="mt-2 text-sm text-red-600">{error}</p>
        <div className="mt-4 flex gap-3">
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
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            onClick={() => switchAccount()}
          >
            Switch Account
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