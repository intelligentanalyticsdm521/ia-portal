// SparkWorkflowsAutomationsPage — UNIFIED list page for Automations + Rules.
//
// Phase 3A merger (2026-06-16): the old SPARK nav had two adjacent entries —
// "Automations" (trigger-based flows) and "Rules" (scoring + routing + auto-tag).
// They share a mental model ("configurable behavior that fires without me")
// and they belong on one page.
//
// Single "New Workflow" button → SparkUnifiedWorkflowModal asks "trigger-based
// automation or rule-based?" → opens the matching builder modal. No nav, no
// JSON textareas, no half-completed second page.
import { useCallback, useEffect, useMemo, useState } from "react";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { useSparkApi } from "../../hooks/useSparkApi";
import {
  Plus, Zap, GitBranch, Tag as TagIcon, Power, Trash2, AlertTriangle,
  Search,
} from "lucide-react";
import {
  SparkRuleEditorModal,
  type RuleType,
} from "../../components/spark/SparkRuleEditorModal";
import {
  SparkUnifiedWorkflowModal,
  type WorkflowChoice,
} from "../../components/spark/SparkUnifiedWorkflowModal";
import {
  SparkAutomationModal,
  type TriggerType,
} from "../../components/spark/SparkAutomationModal";

// ── Row types (kept narrow — page only reads list-shape fields) ──────────
interface AutomationRow {
  __type: "automation";
  id: number;
  name: string;
  description: string | null;
  trigger_type: string;
  is_active: boolean;
  execution_count: number;
}

interface ScoringRow {
  __type: "scoring";
  id: number;
  name: string;
  event_trigger: string;
  points: number;
  is_active?: boolean;
  sort_order?: number;
}
interface RoutingRow {
  __type: "routing";
  id: number;
  name: string;
  routing_type: string;
  is_active?: boolean;
  sort_order?: number;
}
interface AutoTagRow {
  __type: "autotag";
  id: number;
  name: string;
  tags_json?: string | null;
  is_active?: boolean;
  sort_order?: number;
}
type RuleRow = ScoringRow | RoutingRow | AutoTagRow;
type AnyRow = AutomationRow | RuleRow;

type Filter = "all" | "automations" | "rules";

const ROW_META: Record<AnyRow["__type"], { label: string; icon: typeof Zap; color: string; bg: string }> = {
  automation: { label: "Automation", icon: Zap,       color: "text-orange-700",  bg: "bg-orange-100" },
  scoring:    { label: "Scoring",    icon: Zap,       color: "text-indigo-700",  bg: "bg-indigo-100" },
  routing:    { label: "Routing",    icon: GitBranch, color: "text-emerald-700", bg: "bg-emerald-100" },
  autotag:    { label: "Auto-Tag",   icon: TagIcon,   color: "text-amber-700",   bg: "bg-amber-100" },
};

export function SparkWorkflowsAutomationsPage() {
  const { get, put, del, ready } = useSparkApi();
  const [automations, setAutomations] = useState<AutomationRow[]>([]);
  const [scoring, setScoring] = useState<ScoringRow[]>([]);
  const [routing, setRouting] = useState<RoutingRow[]>([]);
  const [autotag, setAutotag] = useState<AutoTagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  // Modal state — only one open at a time
  const [chooser, setChooser] = useState(false);
  const [ruleEditor, setRuleEditor] = useState<{ type: RuleType; id: number | null } | null>(null);
  const [automationEditor, setAutomationEditor] = useState<{ id: number | null; initialTrigger: TriggerType | null } | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const [aRes, sRes, rRes, tRes] = await Promise.all([
        get<{ data: AutomationRow[] } | AutomationRow[]>("/api/v1/automations").catch(() => ({ data: [] })),
        get<{ data: Omit<ScoringRow, "__type">[] }>("/api/v1/scoring-rules").catch(() => ({ data: [] })),
        get<{ data: Omit<RoutingRow, "__type">[] }>("/api/v1/routing-rules").catch(() => ({ data: [] })),
        get<{ data: Omit<AutoTagRow, "__type">[] }>("/api/v1/lead-autotag-rules").catch(() => ({ data: [] })),
      ]);

      const aList = Array.isArray(aRes) ? aRes : (aRes?.data || []);
      setAutomations(
        aList.map((a) => ({
          __type: "automation" as const,
          id: a.id,
          name: a.name || "(untitled)",
          description: a.description ?? null,
          trigger_type: a.trigger_type || "manual",
          is_active: Boolean(a.is_active),
          execution_count: Number(a.execution_count) || 0,
        }))
      );
      setScoring((sRes.data || []).map((row) => ({ ...row, __type: "scoring" as const })));
      setRouting((rRes.data || []).map((row) => ({ ...row, __type: "routing" as const })));
      setAutotag((tRes.data || []).map((row) => ({ ...row, __type: "autotag" as const })));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [get, ready]);

  useEffect(() => { load(); }, [load]);

  // ── Filtered rows ──
  const rows: AnyRow[] = useMemo(() => {
    let list: AnyRow[] = [];
    if (filter === "all" || filter === "automations") list = list.concat(automations);
    if (filter === "all" || filter === "rules") list = list.concat(scoring, routing, autotag);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.name?.toLowerCase().includes(q));
    }
    return list;
  }, [automations, scoring, routing, autotag, filter, search]);

  // ── New workflow chooser handlers ──
  function handleChoice(choice: WorkflowChoice) {
    setChooser(false);
    if (choice.kind === "automation") {
      setAutomationEditor({ id: null, initialTrigger: choice.trigger ?? null });
    } else {
      setRuleEditor({ type: choice.ruleType, id: null });
    }
  }

  function openRow(r: AnyRow) {
    if (r.__type === "automation") {
      setAutomationEditor({ id: r.id, initialTrigger: r.trigger_type as TriggerType });
    } else {
      setRuleEditor({ type: r.__type as RuleType, id: r.id });
    }
  }

  async function toggleAutomation(a: AutomationRow) {
    try {
      await put(`/api/v1/automations/${a.id}`, { is_active: !a.is_active });
      await load();
    } catch (err) { console.error("[toggle automation]", err); }
  }

  async function deleteRow(r: AnyRow) {
    if (!confirm(`Delete "${r.name}"? This can't be undone.`)) return;
    try {
      if (r.__type === "automation") await del(`/api/v1/automations/${r.id}`);
      else if (r.__type === "scoring") await del(`/api/v1/scoring-rules/${r.id}`);
      else if (r.__type === "routing") await del(`/api/v1/routing-rules/${r.id}`);
      else if (r.__type === "autotag") await del(`/api/v1/lead-autotag-rules/${r.id}`);
      await load();
    } catch (err) { console.error("[delete row]", err); }
  }

  return (
    <SparkPageShell
      title="Workflows & Automations"
      subtitle={`${automations.length} automation${automations.length === 1 ? "" : "s"} · ${scoring.length + routing.length + autotag.length} rule${scoring.length + routing.length + autotag.length === 1 ? "" : "s"}`}
      help="Every passive behavior in SPARK lives here. Trigger-based automations run a sequence when something happens (contact created, stage changed, email opened). Rules adjust scores, route leads to owners, and auto-tag inbound contacts based on conditions you define."
      loading={loading}
      error={error}
      actions={
        <button
          onClick={() => setChooser(true)}
          className="rounded-lg bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#d75a25] inline-flex items-center gap-1"
        >
          <Plus className="h-3.5 w-3.5" /> New workflow
        </button>
      }
    >
      {/* Segmented filter + search */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {([
            { key: "all", label: `All (${automations.length + scoring.length + routing.length + autotag.length})` },
            { key: "automations", label: `Automations (Triggers) (${automations.length})` },
            { key: "rules", label: `Rules (${scoring.length + routing.length + autotag.length})` },
          ] as Array<{ key: Filter; label: string }>).map((c) => (
            <button
              key={c.key}
              onClick={() => setFilter(c.key)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                filter === c.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Search by name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-xs border border-slate-300 rounded-md pl-7 pr-2 py-1 w-56"
          />
        </div>
      </div>

      {/* Table */}
      {rows.length === 0 && !loading ? (
        <EmptyState onNew={() => setChooser(true)} filter={filter} />
      ) : (
        <div className="rounded-xl bg-white ring-1 ring-slate-200 overflow-hidden">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 w-28">Kind</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Summary</th>
                <th className="px-3 py-2 text-right w-24">Status</th>
                <th className="px-3 py-2 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => {
                const meta = ROW_META[row.__type];
                const Icon = meta.icon;
                return (
                  <tr key={`${row.__type}-${row.id}`} className="hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${meta.bg} ${meta.color}`}>
                        <Icon className="h-3 w-3" /> {meta.label}
                      </span>
                    </td>
                    <td onClick={() => openRow(row)} className="px-3 py-2 font-medium text-slate-900 cursor-pointer">{row.name}</td>
                    <td onClick={() => openRow(row)} className="px-3 py-2 text-xs text-slate-600 truncate max-w-md cursor-pointer">
                      <RowSummary row={row} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      {row.__type === "automation" ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleAutomation(row); }}
                          className={`text-[10px] uppercase font-bold ${row.is_active ? "text-emerald-700" : "text-amber-700"} inline-flex items-center gap-0.5`}
                        >
                          <Power className="h-2.5 w-2.5" /> {row.is_active ? "On" : "Off"}
                        </button>
                      ) : (
                        <span className={`text-[10px] uppercase font-bold ${row.is_active === false ? "text-amber-700" : "text-emerald-700"} inline-flex items-center gap-0.5`}>
                          <Power className="h-2.5 w-2.5" /> {row.is_active === false ? "Off" : "On"}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => deleteRow(row)} title="Delete" className="text-rose-600 hover:bg-rose-50 rounded p-1">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      <SparkUnifiedWorkflowModal
        open={chooser}
        onClose={() => setChooser(false)}
        onChoose={handleChoice}
      />
      {ruleEditor && (
        <SparkRuleEditorModal
          open={true}
          ruleType={ruleEditor.type}
          ruleId={ruleEditor.id}
          onClose={() => setRuleEditor(null)}
          onChanged={() => { setRuleEditor(null); load(); }}
        />
      )}
      {automationEditor && (
        <SparkAutomationModal
          open={true}
          automationId={automationEditor.id}
          initialTrigger={automationEditor.initialTrigger}
          onClose={() => setAutomationEditor(null)}
          onChanged={() => { setAutomationEditor(null); load(); }}
        />
      )}
    </SparkPageShell>
  );
}

function RowSummary({ row }: { row: AnyRow }) {
  if (row.__type === "automation") return <span>Trigger: <strong className="text-slate-700">{row.trigger_type}</strong> · {row.execution_count.toLocaleString()} runs</span>;
  if (row.__type === "scoring")    return <span>on <code className="bg-slate-100 px-1 rounded">{row.event_trigger}</code> → {row.points} pts</span>;
  if (row.__type === "routing")    return <span>route via <code className="bg-slate-100 px-1 rounded">{row.routing_type}</code></span>;
  return <span>apply tags: {summarizeTags(row.tags_json)}</span>;
}

function summarizeTags(j: string | null | undefined): string {
  if (!j) return "—";
  try {
    const arr = JSON.parse(j);
    if (Array.isArray(arr)) {
      if (arr.length === 0) return "—";
      if (arr.length === 1) return arr[0];
      if (arr.length === 2) return arr.join(", ");
      return `${arr[0]}, ${arr[1]} +${arr.length - 2}`;
    }
  } catch { /* ignore */ }
  return "—";
}

function EmptyState({ onNew, filter }: { onNew: () => void; filter: Filter }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white p-10 text-center">
      <div className="mx-auto w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-3">
        <AlertTriangle className="h-7 w-7 text-slate-400" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900">
        {filter === "all" ? "No workflows yet" : filter === "automations" ? "No automations yet" : "No rules yet"}
      </h3>
      <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
        Create your first workflow — a trigger-based automation that runs a sequence,
        or a passive rule that scores, routes, or tags inbound contacts.
      </p>
      <button
        onClick={onNew}
        className="mt-4 inline-flex items-center gap-1 rounded-lg bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#d75a25]"
      >
        <Plus className="h-3.5 w-3.5" /> New workflow
      </button>
    </div>
  );
}

export default SparkWorkflowsAutomationsPage;
