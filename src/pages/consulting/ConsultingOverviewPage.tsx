// ConsultingOverviewPage — F-140 redesign.
//
// Three sections:
//   1. Stats cards — completed-this-month / open / hours / cycle time
//   2. Alerts strip — overdue items (client review stale, no activity, phase stalled)
//   3. Notifications feed — recent activity the viewer hasn't authored
//
// Backend: GET /consulting-overview returns all three in one call.

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

interface OverviewResponse {
  viewer_side: "provider" | "client";
  notifications: Array<{
    kind: "request_status" | "request_comment" | "project_status";
    event_id: number; ref_id: string; ref_number: string; ref_title: string;
    from_status: string | null; to_status: string;
    actor_kind: "provider" | "client";
    created_at: string;
    project_id?: string | null;
  }>;
  alerts: Array<{
    kind: "request_client_review_stale" | "request_no_activity" | "project_phase_stalled";
    ref_id: string; ref_number: string; ref_title: string;
    days_old: number;
    project_id?: string | null;
  }>;
  stats: {
    requests_completed_30d: number;
    requests_open: number;
    projects_active: number;
    projects_completed_30d: number;
    hours_logged_30d: number;
    avg_request_cycle_days_90d: number | null;
  };
  sla_thresholds: {
    client_review_days: number;
    open_request_days: number;
    phase_stall_days: number;
  };
}

const ALERT_LABEL: Record<string, string> = {
  request_client_review_stale: "Awaiting client review",
  request_no_activity: "No activity",
  project_phase_stalled: "Phase stalled",
};

const NOTIF_LABEL: Record<string, (n: any) => string> = {
  request_status: (n) => `Request ${n.ref_number} moved to ${n.to_status.replace(/_/g, " ")}`,
  request_comment: (n) => `New comment on request ${n.ref_number}`,
  project_status: (n) => `Project ${n.ref_number}${n.from_status ? ` moved to ${n.to_status}` : " created"}`,
};

export function ConsultingOverviewPage() {
  const { get, ready } = useOliverApi();
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const r = await get<{ data: OverviewResponse }>("/consulting-overview");
      setData(r.data);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [get, ready]);

  useEffect(() => { load(); }, [load]);

  const stats = data?.stats;
  const cycleDays = stats?.avg_request_cycle_days_90d != null ? stats.avg_request_cycle_days_90d.toFixed(1) : "—";

  return (
    <OliverPageWrapper title="Consulting Overview" subtitle="IA Consulting · Snapshot of activity, alerts, and recent stats" error={error} loading={loading}>
      <div className="space-y-6 max-w-7xl">
        {/* Stats cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Requests completed (30d)" value={stats?.requests_completed_30d ?? "—"} color="#10b981" />
          <StatCard label="Open requests"           value={stats?.requests_open ?? "—"}           color="#3b82f6" />
          <StatCard label="Projects active"         value={stats?.projects_active ?? "—"}         color="#8b5cf6" />
          <StatCard label="Projects shipped (30d)"  value={stats?.projects_completed_30d ?? "—"}  color="#a855f7" />
          <StatCard label="Hours logged (30d)"      value={stats?.hours_logged_30d ?? "—"}        color="#f59e0b" />
          <StatCard label="Avg cycle (days, 90d)"   value={cycleDays}                              color="#334155" />
        </div>

        {/* Alerts */}
        <section>
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-base font-bold text-slate-900">Alerts</h2>
            <span className="text-[11px] text-slate-500">
              SLA: client review &gt; {data?.sla_thresholds.client_review_days}d ·
              no activity &gt; {data?.sla_thresholds.open_request_days}d ·
              phase stalled &gt; {data?.sla_thresholds.phase_stall_days}d
            </span>
          </div>
          {data?.alerts.length === 0 ? (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-6 text-sm text-emerald-700 text-center">
              ✓ Nothing overdue right now.
            </div>
          ) : (
            <div className="rounded-xl bg-white border border-slate-200 divide-y divide-slate-100">
              {data?.alerts.map((a, i) => {
                const route = a.project_id
                  ? `/app/admin/consulting/projects?open=${a.project_id}`
                  : `/app/admin/consulting/requests?open=${a.ref_id}`;
                return (
                  <Link to={route} key={`${a.kind}-${a.ref_id}-${i}`}
                    className="flex items-center gap-3 p-3 hover:bg-amber-50">
                    <span className="text-xs font-bold uppercase px-2 py-1 rounded bg-amber-100 text-amber-800 whitespace-nowrap">
                      {a.days_old}d
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-900 truncate">{a.ref_title}</div>
                      <div className="text-[11px] text-slate-500">
                        {a.ref_number} · {ALERT_LABEL[a.kind] || a.kind.replace(/_/g, " ")}
                      </div>
                    </div>
                    <span className="text-slate-400 text-xs">→</span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* Notifications */}
        <section>
          <h2 className="text-base font-bold text-slate-900 mb-2">Recent activity</h2>
          {data?.notifications.length === 0 ? (
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-6 text-sm text-slate-500 text-center">
              No new activity in the last 14 days.
            </div>
          ) : (
            <div className="rounded-xl bg-white border border-slate-200 divide-y divide-slate-100 max-h-[480px] overflow-y-auto">
              {data?.notifications.map((n, i) => {
                const route = n.kind === "project_status"
                  ? `/app/admin/consulting/projects?open=${n.ref_id}`
                  : `/app/admin/consulting/requests?open=${n.ref_id}`;
                const ageHrs = (Date.now() - new Date(n.created_at).getTime()) / 36e5;
                const ageLabel = ageHrs < 1 ? `${Math.round(ageHrs * 60)}m`
                              : ageHrs < 24 ? `${Math.round(ageHrs)}h`
                              : `${Math.round(ageHrs / 24)}d`;
                return (
                  <Link to={route} key={`${n.kind}-${n.event_id}-${i}`}
                    className="flex items-center gap-3 p-3 hover:bg-slate-50">
                    <span className={`w-2 h-2 rounded-full ${n.actor_kind === "client" ? "bg-emerald-500" : "bg-blue-500"}`}></span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-slate-800 truncate">
                        {NOTIF_LABEL[n.kind] ? NOTIF_LABEL[n.kind](n) : n.kind}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {n.ref_title} · by {n.actor_kind}
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-400 whitespace-nowrap">{ageLabel}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <p className="text-center text-[10px] text-slate-400">
          {data?.viewer_side === "provider" ? "Founder view" : "Client view"} · Updated {new Date().toLocaleString()}
        </p>
      </div>
    </OliverPageWrapper>
  );
}

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="rounded-xl bg-white border-2 px-4 py-3" style={{ borderLeftColor: color, borderLeftWidth: 4 }}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{value}</div>
    </div>
  );
}

export default ConsultingOverviewPage;
