import { useEffect, useMemo, useRef, useState } from 'react';
import { useIsAuthenticated } from '@azure/msal-react';
import { useAccessToken } from '../auth/useAccessToken';
import { useAppState } from './AppState';
import { PlatformApiError, selectTenant, sessionVerify } from '../lib/platformApi';

export function AppGate({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useIsAuthenticated();
  const { activeAccount, login, getToken } = useAccessToken();
  const { bootstrap, setBootstrap, active, setActive, activeTenantId, setActiveTenantId } = useAppState();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inFlightRef = useRef(false);
  const runIdRef = useRef(0);

  const tenantOptions = useMemo(() => bootstrap?.tenants || [], [bootstrap]);

  useEffect(() => {
    // reset view-level errors when auth state changes
    setError(null);
  }, [isAuthenticated, activeAccount]);

  useEffect(() => {
    const runId = ++runIdRef.current;

    async function run() {
      if (!isAuthenticated) return;
      if (!activeAccount) return;

      // If we already established an active session, do not re-bootstrap.
      if (active) return;

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

        setBootstrap(v);

        if (v.surface !== 'iadm_portal') {
          setError('This application is the IADM Portal. Your token indicates a different portal surface.');
          setActive(null);
          return;
        }

        const tenants = v.tenants || [];
        if (!tenants.length) {
          setError('Your account is authenticated, but no tenants are assigned. Contact IADM support.');
          setActive(null);
          return;
        }

        // 2) Determine active tenant
        const stored = activeTenantId;
        const storedMatch = stored ? tenants.find((t) => t.tenantId === stored) : null;

        const tenantToSelect = storedMatch?.tenantId || (tenants.length === 1 ? tenants[0].tenantId : null);

        if (!tenantToSelect) {
          // user must select tenant
          setActive(null);
          return;
        }

        // 3) Select tenant to load service entitlements
        const selected = await selectTenant({
          baseUrl: import.meta.env.VITE_PLATFORM_API_BASE_URL,
          bearerToken: accessToken,
          tenantId: tenantToSelect
        });

        // IMPORTANT: set active first so any effect re-run short-circuits immediately
        setActive(selected);
        setActiveTenantId(tenantToSelect);
      } catch (err) {
        if (err instanceof PlatformApiError) {
          if (err.status === 401) {
            setError('Authentication failed (401). Your token was rejected by platform-api.');
          } else if (err.status === 403) {
            setError('Not authorized (403). Your account is authenticated but not allowed for the requested tenant.');
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

        setBootstrap(null);
        setActive(null);
      } finally {
        inFlightRef.current = false;

        // Only the newest run is allowed to clear loading. This prevents "stuck loading"
        // when React re-runs effects and cleans up prior runs.
        if (runId === runIdRef.current) setLoading(false);
      }
    }

    run();
  }, [
    isAuthenticated,
    activeAccount,
    active,
    getToken,
    activeTenantId,
    setBootstrap,
    setActive,
    setActiveTenantId
  ]);

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

      setActive(selected);
      setActiveTenantId(tenantId);
    } catch (err) {
      if (err instanceof PlatformApiError) {
        setError(`platform-api error (${err.status}).`);
        console.error('platform-api error body:', err.body);
      } else {
        setError('Unexpected error selecting tenant.');
        console.error(err);
      }
      setActive(null);
    } finally {
      setLoading(false);
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-6 py-16">
        <h1 className="text-2xl font-semibold">IADM Portal</h1>
        <p className="text-gray-600">Sign in to access your services and Intelligence Layers.</p>
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

  // Tenant selection UI (multi-tenant)
  if (bootstrap && !active) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-lg font-semibold">Select your workspace</h1>
        <p className="mt-2 text-sm text-gray-700">You have access to multiple tenants. Choose one to continue.</p>

        <div className="mt-6 flex flex-col gap-2">
          {tenantOptions.map((t) => (
            <button
              key={t.tenantId}
              type="button"
              className="rounded-md border border-gray-200 px-4 py-3 text-left hover:bg-gray-50"
              onClick={() => handleSelectTenant(t.tenantId)}
            >
              <div className="font-medium">{t.tenantFullName || t.tenantName}</div>
              <div className="text-xs text-gray-600">{t.tenantId}</div>
            </button>
          ))}
        </div>

        <p className="mt-6 text-xs text-gray-500">This selection is saved in your browser until you switch tenants.</p>
      </div>
    );
  }

  if (!active) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-lg font-semibold">Session not established</h1>
        <p className="mt-2 text-sm text-gray-700">You are signed in, but platform-api did not return an active tenant session.</p>
      </div>
    );
  }

  return <>{children}</>;
}
