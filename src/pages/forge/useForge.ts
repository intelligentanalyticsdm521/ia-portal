/**
 * useForge.ts — one place that turns app state + auth into a stable forge-api
 * params object, per the portal data-fetching convention (fetch once per page,
 * memoized api object — never a new object every render).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppState } from '../../app/AppState';
import { useAccessToken } from '../../auth/useAccessToken';
import {
  ForgeApiError, getLookups, type ForgeParams, type LookupSets,
} from '../../lib/forgeApi';

export function useForgeApi() {
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const baseUrl = import.meta.env.VITE_FORGE_API_BASE_URL as string | undefined;

  // Local dev needs no special case here: the portal's own fetch interceptor
  // (lib/devAuth.ts) attaches x-dev-tenant to loopback origins under
  // VITE_DEV_AUTH=1 and is compiled out of production builds.
  const ready = Boolean(activeTenantId && baseUrl);

  const withParams = useCallback(
    async <T,>(fn: (p: ForgeParams) => Promise<T>): Promise<T> => {
      if (!activeTenantId || !baseUrl) throw new ForgeApiError(0, 'FORGE is not configured for this session.');
      const token = await getToken();
      return fn({ baseUrl, bearerToken: token.accessToken, tenantId: activeTenantId });
    },
    [activeTenantId, baseUrl, getToken]
  );

  return useMemo(() => ({ ready, withParams, tenantId: activeTenantId }), [ready, withParams, activeTenantId]);
}

export function describeError(err: unknown, what: string) {
  if (err instanceof ForgeApiError) {
    if (err.status === 403) return `You do not have access to ${what}.`;
    if (err.status === 404) return `${what} was not found.`;
    return `Unable to load ${what} (${err.status}).`;
  }
  return `Unable to load ${what}.`;
}

/** Lookups are small and shared across every screen — fetched once per mount. */
export function useForgeLookups() {
  const { ready, withParams } = useForgeApi();
  const [lookups, setLookups] = useState<LookupSets>({});
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (!ready || loaded.current) return;
    loaded.current = true;
    withParams(getLookups)
      .then(setLookups)
      .catch((err) => { setError(describeError(err, 'lookup lists')); console.error(err); });
  }, [ready, withParams]);

  return { lookups, error };
}

/** Debounced value, for search boxes that must not fire per keystroke. */
export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
