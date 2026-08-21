import { useCallback, useEffect, useState } from 'react';

export function useArionData<T>(fetcher: () => Promise<T>, deps: any[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Structured arion-api error code, when the failure carried one —
  // ArionApiError.body is `{ error: { code, message, status } }` (e.g.
  // SEO_ADDON_REQUIRED on /arion/seo/*). Null for every other failure.
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [bumpKey, setBumpKey] = useState(0);

  const refetch = useCallback(() => setBumpKey(k => k + 1), []);

  useEffect(() => {
    let alive = true;
    async function run() {
      setLoading(true);
      setError(null);
      setErrorCode(null);
      try {
        const result = await fetcher();
        if (alive) setData(result);
      } catch (err: any) {
        if (alive) {
          setError(err?.message || 'Failed to load data');
          const code = err?.body?.error?.code;
          setErrorCode(typeof code === 'string' ? code : null);
        }
      } finally {
        if (alive) setLoading(false);
      }
    }
    run();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, bumpKey]);

  return { data, loading, error, errorCode, refetch };
}
