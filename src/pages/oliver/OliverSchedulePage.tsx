// OliverSchedulePage — F-130 rewrite.
//
// Was a custom month-grid that pulled from /schedule/calendar (jobs only).
// Now uses UnifiedCalendarGrid (filtered to OLIVER kinds: job + booking)
// so the page shows scheduled jobs AND booking-page reservations on the
// same calendar. Same component is used on the Command Center for cross-
// product view.
//
// A slim KPI strip on top reads from the same /calendar/unified data so
// numbers match what's on the grid.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { PageHeader } from "../../components/oliver/ui";
import { UnifiedCalendarGrid, type UnifiedEvent } from "../../components/UnifiedCalendarGrid";

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function OliverSchedulePage() {
  const { get, ready } = useOliverApi();
  const [events, setEvents] = useState<UnifiedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  // KPI data: fetch a 90-day window once for the strip on top so it
  // doesn't churn as the grid month changes.
  const now = useMemo(() => new Date(), []);
  const windowStart = useMemo(() => {
    const d = new Date(now); d.setDate(d.getDate() - 7); return d;
  }, [now]);
  const windowEnd = useMemo(() => {
    const d = new Date(now); d.setDate(d.getDate() + 60); return d;
  }, [now]);

  const loadKpis = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const qs = new URLSearchParams({
        start: ymd(windowStart),
        end: ymd(windowEnd),
        kinds: "job,booking",
      });
      const r = await get<{ data: { events: UnifiedEvent[] } }>(`/calendar/unified?${qs}`);
      setEvents(r.data?.events || []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [get, ready, windowStart, windowEnd]);

  useEffect(() => { loadKpis(); }, [loadKpis]);

  const today = useMemo(() => ymd(new Date()), []);
  const todayCount = events.filter((e) => e.start.slice(0, 10) === today).length;
  const upcomingCount = events.filter((e) => new Date(e.start) > new Date()).length;
  const bookingCount = events.filter((e) => e.kind === "booking").length;
  const jobCount = events.filter((e) => e.kind === "job").length;

  return (
    <OliverPageWrapper title="Schedule" subtitle="Jobs + booking-page reservations" error={error} loading={loading}>
      <PageHeader title="Schedule" subtitle="Drag jobs in the Job Board; manage availability under Team. This view is read-only." />

      {/* KPI strip — last 7d to next 60d */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <KpiCard label="Today" value={todayCount} color="#FEC82C" />
        <KpiCard label="Upcoming (60d)" value={upcomingCount} color="#3B82F6" />
        <KpiCard label="Jobs" value={jobCount} color="#3B82F6" />
        <KpiCard label="Bookings" value={bookingCount} color="#FEC82C" />
      </div>

      <div className="iadm-card">
        <div className="iadm-card-body">
          <UnifiedCalendarGrid kinds="job,booking" />
        </div>
      </div>
    </OliverPageWrapper>
  );
}

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border-2 bg-white px-4 py-3" style={{ borderLeftColor: color, borderLeftWidth: 4 }}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{value}</div>
    </div>
  );
}

export default OliverSchedulePage;
