// SparkAutomationsPage — live list of tenant automations.
//
// Backed by LUMEN-API /api/v1/automations CRUD. Each row links to the
// AutomationBuilder for editing. Toggle persists via PUT.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Plus, Settings, Zap, Trash2 } from "lucide-react";
import { ReportBar } from '../../components/insights/ReportBar';
import { useProductInsightsPayload } from '../../hooks/useProductInsightsPayload';

interface Automation {
  id: number;
  name: string;
  description: string | null;
  trigger_type: string;
  is_active: boolean;
  execution_count: number;
  created_at: string;
  updated_at: string;
}

export function SparkAutomationsPage() {
  // Reports covering THIS function (Brandon 2026-08-14). Above any early
  // return — a hook below one runs on some renders only.
  const insightsPayload = useProductInsightsPayload('spark').payload;

  const { get, put, del, ready } = useSparkApi();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState<"all" | "active" | "paused">("all");

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const r = await get<{ data: Automation[] } | Automation[]>("/api/v1/automations");
      // Defensive — accept either {data: [...]} envelope OR bare array
      // (route shape changed historically; both should render).
      const list = Array.isArray(r) ? r : (r?.data || []);
      // Normalize each row so optional fields can't crash render.
      setAutomations(
        list.map((a) => ({
          ...a,
          execution_count: Number(a?.execution_count) || 0,
          is_active: Boolean(a?.is_active),
          name: a?.name || "(untitled)",
          trigger_type: a?.trigger_type || "manual",
        }))
      );
    } catch (err) {
      console.error("[SparkAutomationsPage] load failed:", err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [get, ready]);

  useEffect(() => { load(); }, [load]);

  async function toggle(a: Automation) {
    try {
      await put(`/api/v1/automations/${a.id}`, { is_active: !a.is_active });
      await load();
    } catch (err) {
      console.error("[toggle automation]", err);
    }
  }

  async function remove(id: number) {
    if (!confirm("Delete this automation? This can't be undone.")) return;
    try {
      await del(`/api/v1/automations/${id}`);
      await load();
    } catch (err) {
      console.error("[delete automation]", err);
    }
  }

  const filtered = automations.filter((a) =>
    filter === "all" ? true : filter === "active" ? a.is_active : !a.is_active
  );

  return (
    <SparkPageShell title="Automations" subtitle="Trigger-based workflows that run automatically" error={error} loading={loading}>
      <ReportBar product="spark" detail={insightsPayload?.detail} reports={[
        { id: 'spark_automation_coverage', label: 'Built vs switched on' },
      ]} />
      <div className="p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
            {(["all", "active", "paused"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${filter === f ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                {f === "all" ? `All (${automations.length})` : f === "active" ? `Active (${automations.filter(a => a.is_active).length})` : `Paused (${automations.filter(a => !a.is_active).length})`}
              </button>
            ))}
          </div>
          <Link
            to="/app/services/spark_automation_builder"
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" /> New automation
          </Link>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl bg-white ring-1 ring-gray-200 p-10 text-center">
            <Zap className="h-10 w-10 mx-auto text-slate-300 mb-3" />
            <h3 className="text-base font-semibold text-slate-900">
              {automations.length === 0 ? "No automations yet" : `No ${filter} automations`}
            </h3>
            <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
              {automations.length === 0
                ? "Automations run lifecycle workflows (welcome series, re-engagement, post-job follow-up) without manual work. Build your first one to start compounding outcomes."
                : `You don't have any ${filter} automations right now. Switch filter or build a new one.`}
            </p>
            {automations.length === 0 && (
              <Link
                to="/app/services/spark_automation_builder"
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" /> Build first automation
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((a) => (
              <div key={a.id} className="rounded-xl bg-white ring-1 ring-gray-200 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-base font-semibold text-slate-900 truncate">{a.name}</h3>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${a.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {a.is_active ? "Active" : "Paused"}
                      </span>
                    </div>
                    {a.description && <p className="mt-0.5 text-sm text-slate-500 line-clamp-2">{a.description}</p>}
                    <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-400">
                      <span>Trigger: <strong className="text-slate-600">{a.trigger_type}</strong></span>
                      <span>·</span>
                      <span>{a.execution_count.toLocaleString()} executions</span>
                    </div>
                  </div>
                  <button
                    onClick={() => toggle(a)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${a.is_active ? "bg-blue-600" : "bg-gray-300"}`}
                    title={a.is_active ? "Pause" : "Activate"}
                  >
                    <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${a.is_active ? "translate-x-5.5" : "translate-x-0.5"}`} />
                  </button>
                </div>
                <div className="mt-3 flex items-center gap-2 pt-3 border-t border-slate-100">
                  <Link
                    to={`/app/services/spark_automation_builder?id=${a.id}`}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Settings className="h-3 w-3" /> Edit
                  </Link>
                  <button
                    onClick={() => remove(a.id)}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SparkPageShell>
  );
}

export default SparkAutomationsPage;
