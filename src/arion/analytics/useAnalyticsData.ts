import { useEffect, useState } from 'react';
import { useAppState } from '../../app/AppState';
import { useAccessToken } from '../../auth/useAccessToken';

interface AnalyticsData {
  connected: boolean;
  error?: string;
  period?: number;
  dateRange?: { start: string; end: string };
  summary?: any;
  engagement?: any;
  sessionsByDay?: any[];
  usersByDay?: any[];
  pageviewsByDay?: any[];
  channelBreakdown?: any[];
  deviceSplit?: any;
  topPages?: any[];
  landingPages?: any[];
  trafficSources?: any[];
  countries?: any[];
  cities?: any[];
  browsers?: any[];
  newVsReturning?: any[];
  hourlyBreakdown?: any[];
  dayOfWeekBreakdown?: any[];
  comparison?: any;
}

export function useAnalyticsData(siteId: string | null, period: number = 30, compare: string = 'none') {
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function fetch_data() {
      if (!siteId || !activeTenantId) { setData(null); return; }
      setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        const baseUrl = import.meta.env.VITE_ARION_API_BASE_URL as string;
        const url = `${baseUrl}/arion/analytics?siteId=${encodeURIComponent(siteId)}&period=${period}&compare=${compare}`;
        const res = await globalThis.fetch(url, {
          headers: {
            Authorization: `Bearer ${token.accessToken}`,
            'x-tenant-key': activeTenantId,
            'Content-Type': 'application/json',
          },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (res.status === 403 && body?.error === 'tier_limit') {
            setError(`tier_limit:${body.upgrade_to || 'pro'}`);
          } else {
            setError(`API error ${res.status}`);
          }
          return;
        }
        const result = await res.json();
        if (alive) setData(result);
      } catch (err: any) {
        if (alive) setError(err.message || 'Failed to load analytics');
      } finally {
        if (alive) setLoading(false);
      }
    }
    fetch_data();
    return () => { alive = false; };
  }, [siteId, activeTenantId, period, compare, getToken]);

  return { data, loading, error };
}
