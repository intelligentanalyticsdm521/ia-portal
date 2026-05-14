// ArgusTrendsPage — v9.4 ARGUS Trends section, now reading live data.
//
// 4 reports per spec §6.2. Two are wired to live data from
// argus.platform_events via platform-api endpoints:
//   - Automation Health → /argus/automation-health
//   - Event Flow → /argus/event-flow
//
// The other two (Workflow Performance, Cross-Product Trigger Chains)
// remain shells because their backing tables (workflow_run_log,
// workflow_registry) are Level 2 ARGUS work and don't exist yet.
import { useEffect, useState } from "react";
import { Activity, GitBranch, Network, AlertCircle, Lock, CheckCircle, XCircle, Clock } from "lucide-react";
import { useAccessToken } from "../../auth/useAccessToken";
import { useAppState } from "../../app/AppState";
import { evaluateRules } from "../../components/iainsights/insightRules";
import { ARGUS_AUTOMATION_HEALTH_RULES, ARGUS_EVENT_FLOW_RULES } from "../../components/iainsights/argusEventRules";
import { ArgusObservationsBox } from "../../components/iainsights/ArgusObservationsBox";

interface AutomationHealth {
  range: { days: number };
  totals: { total: number; processed: number; failed: number; pending: number; stuck_pending: number };
  success_rate: number | null;
  avg_latency_sec: number | null;
  processed_count: number;
  by_status: Record<string, number>;
}

interface EventFlow {
  range: { days: number };
  total_events: number;
  events_per_day: number;
  by_event_type: Array<{ event_type: string; n: number }>;
  by_source_product: Array<{ source: string; n: number }>;
  daily_series: Array<{ day: string; n: number }>;
}

export function ArgusTrendsPage() {
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const [automation, setAutomation] = useState<AutomationHealth | null>(null);
  const [flow, setFlow] = useState<EventFlow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeTenantId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const token = await getToken();
        const base = (import.meta.env.VITE_PLATFORM_API_BASE_URL as string)?.replace(/\/$/, "");
        if (!base) {
          if (!cancelled) {
            setError("Platform API base URL not configured.");
            setLoading(false);
          }
          return;
        }
        const headers: HeadersInit = {
          Authorization: `Bearer ${token.accessToken}`,
          "x-tenant-key": activeTenantId,
        };
        const [healthRes, flowRes] = await Promise.all([
          globalThis.fetch(`${base}/argus/automation-health?days=30`, { headers }),
          globalThis.fetch(`${base}/argus/event-flow?days=30`, { headers }),
        ]);
        if (cancelled) return;
        if (healthRes.ok) {
          const j = await healthRes.json();
          setAutomation(j?.data || null);
        }
        if (flowRes.ok) {
          const j = await flowRes.json();
          setFlow(j?.data || null);
        }
      } catch (e) {
        if (!cancelled) setError(String((e as Error)?.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeTenantId, getToken]);

  // Evaluate rules against fetched data. Rules use any-typed access so the
  // strict InsightContext shape doesn't need a per-product extension.
  const automationFired = evaluateRules(ARGUS_AUTOMATION_HEALTH_RULES, { automation } as any, { maxObservations: 8, maxActions: 5 });
  const flowFired = evaluateRules(ARGUS_EVENT_FLOW_RULES, { flow } as any, { maxObservations: 8, maxActions: 5 });

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-slate-900">ARGUS Trends</h1>
        <p className="text-sm text-slate-500 mt-0.5">Operational reports on automation health + platform event flow. Live from <code className="text-xs">argus.platform_events</code>.</p>
      </div>

      {loading && !automation && !flow && (
        <div className="text-sm text-slate-500 py-8 text-center">Loading ARGUS event data…</div>
      )}
      {error && !loading && (
        <div className="mb-4 rounded-md border-l-4 border-rose-400 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <strong>Couldn't load event data:</strong> {error}
        </div>
      )}

      <div className="space-y-6">
        {/* ─── Automation Health (LIVE) ─────────────────────────────── */}
        <section>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center" style={{ background: "#84CC1620", color: "#84CC16" }}>
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Automation Health</h2>
              <p className="text-[11px] text-slate-500">Are my automations running reliably? · Live from argus.platform_events</p>
            </div>
            <span className="ml-auto text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">Live</span>
          </div>

          {automation && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                <Kpi label={`Events (${automation.range.days}d)`} value={fmtN(automation.totals.total)} sub={`${(automation.totals.total / automation.range.days).toFixed(1)}/day`} accent="#84CC16" />
                <Kpi label="Success Rate" value={automation.success_rate != null ? `${(automation.success_rate * 100).toFixed(1)}%` : "—"} sub={`${fmtN(automation.totals.processed)} processed`} accent={automation.success_rate == null ? "#94A3B8" : automation.success_rate > 0.98 ? "#16A34A" : automation.success_rate > 0.9 ? "#EAB308" : "#DC2626"} />
                <Kpi label="Failed" value={fmtN(automation.totals.failed)} sub={automation.totals.failed === 0 ? "no failures" : "investigate"} accent={automation.totals.failed === 0 ? "#16A34A" : automation.totals.failed < 5 ? "#EAB308" : "#DC2626"} />
                <Kpi label="Avg Latency" value={automation.avg_latency_sec != null ? `${automation.avg_latency_sec.toFixed(0)}s` : "—"} sub="insert → processed" accent={(automation.avg_latency_sec ?? 9999) < 120 ? "#16A34A" : (automation.avg_latency_sec ?? 9999) < 600 ? "#EAB308" : "#DC2626"} />
              </div>

              <div className="rounded-md border border-slate-200 overflow-hidden mb-3">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold text-slate-600">Status</th>
                      <th className="text-right px-3 py-2 font-semibold text-slate-600">Count</th>
                      <th className="text-right px-3 py-2 font-semibold text-slate-600">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(automation.by_status).map(([status, n]) => {
                      const share = automation.totals.total > 0 ? (Number(n) / automation.totals.total) * 100 : 0;
                      const Icon = status === "processed" ? CheckCircle : status === "failed" ? XCircle : Clock;
                      const color = status === "processed" ? "#16A34A" : status === "failed" ? "#DC2626" : "#EAB308";
                      return (
                        <tr key={status} className="border-t border-slate-100">
                          <td className="px-3 py-2 text-slate-900 flex items-center gap-2"><Icon className="h-3.5 w-3.5" style={{ color }} /> {status}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtN(Number(n))}</td>
                          <td className="px-3 py-2 text-right tabular-nums" style={{ color }}>{share.toFixed(0)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <ArgusObservationsBox
                observations={automationFired.observations}
                actions={automationFired.actions}
                reportLabel="Automation Health"
                tenantLabel="your workspace"
                periodLabel={`Last ${automation.range.days} days`}
              />
            </>
          )}
        </section>

        {/* ─── Event Flow (LIVE) ────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center" style={{ background: "#84CC1620", color: "#84CC16" }}>
              <Network className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Event Flow</h2>
              <p className="text-[11px] text-slate-500">How many platform events are flowing and where are they going? · Live from argus.platform_events</p>
            </div>
            <span className="ml-auto text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">Live</span>
          </div>

          {flow && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                <Kpi label={`Total Events (${flow.range.days}d)`} value={fmtN(flow.total_events)} sub={`${flow.events_per_day.toFixed(1)}/day`} accent="#84CC16" />
                <Kpi label="Event Types" value={String(flow.by_event_type.length)} sub="distinct kinds" accent="#1A3A4A" />
                <Kpi label="Source Products" value={String(flow.by_source_product.length)} sub="firing events" accent="#EF6C33" />
                <Kpi label="Top Source" value={flow.by_source_product[0]?.source || "—"} sub={flow.by_source_product[0] ? `${fmtN(flow.by_source_product[0].n)} events` : ""} accent="#38BDF8" />
              </div>

              {flow.by_event_type.length > 0 && (
                <div className="rounded-md border border-slate-200 overflow-hidden mb-3">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold text-slate-600">Event Type</th>
                        <th className="text-right px-3 py-2 font-semibold text-slate-600">Count</th>
                        <th className="text-right px-3 py-2 font-semibold text-slate-600">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {flow.by_event_type.slice(0, 10).map((row) => {
                        const share = flow.total_events > 0 ? (row.n / flow.total_events) * 100 : 0;
                        return (
                          <tr key={row.event_type} className="border-t border-slate-100">
                            <td className="px-3 py-2 text-slate-900 font-mono text-[10px]">{row.event_type}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{fmtN(row.n)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-500">{share.toFixed(0)}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <ArgusObservationsBox
                observations={flowFired.observations}
                actions={flowFired.actions}
                reportLabel="Event Flow"
                tenantLabel="your workspace"
                periodLabel={`Last ${flow.range.days} days`}
              />
            </>
          )}
        </section>

        {/* ─── Workflow Performance (SHELL) ─────────────────────────── */}
        <section>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center bg-slate-200 text-slate-500">
              <GitBranch className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Workflow Performance</h2>
              <p className="text-[11px] text-slate-500">Which workflows succeed, fail, and take longest?</p>
            </div>
            <span className="ml-auto text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 flex items-center gap-1"><Lock className="h-3 w-3" /> Shell</span>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
            Requires Level 2 ARGUS tables (<code>argus.workflow_run_log</code>) that don't exist yet. Goes live once the workflow engine is built post-launch.
          </div>
        </section>

        {/* ─── Trigger Chains (SHELL) ───────────────────────────────── */}
        <section>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center bg-slate-200 text-slate-500">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Cross-Product Trigger Chains</h2>
              <p className="text-[11px] text-slate-500">Which multi-platform automation chains are healthy?</p>
            </div>
            <span className="ml-auto text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 flex items-center gap-1"><Lock className="h-3 w-3" /> Shell</span>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
            Requires Level 2 ARGUS tables (<code>argus.workflow_registry</code>) for the chain definitions. Goes live once the workflow engine is built post-launch.
          </div>
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2" style={{ borderTopWidth: 3, borderTopColor: accent }}>
      <div className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide">{label}</div>
      <div className="text-lg font-bold text-slate-900 tabular-nums mt-0.5">{value}</div>
      <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>
    </div>
  );
}

function fmtN(n: number): string {
  if (!isFinite(n)) return "0";
  return n.toLocaleString();
}

export default ArgusTrendsPage;
