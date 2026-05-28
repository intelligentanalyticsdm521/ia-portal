// SparkRulesPage — unified library for Scoring + Routing + Auto-Tag rules.
//
// User: "I ALREADY SEE 3 PAGES FOR RULES, THAT SHOULD BE FUCKING 1."
// This is the 1.
//
// Replaces three separate nav entries (Scoring Rules / Routing Rules /
// Auto-Tag Rules) with ONE main-nav "Rules" entry under Workflow &
// Automations. Library grid shows all rules across all three types; type
// filter narrows the view. Click any row → SparkRuleEditorModal (adaptive
// by type). + New rule → type picker → editor modal.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import {
  Plus, X, Zap, GitBranch, Tag as TagIcon, AlertTriangle, Power,
} from "lucide-react";
import {
  SparkRuleEditorModal,
  type RuleType,
} from "../../components/spark/SparkRuleEditorModal";

interface BaseRow {
  id: number;
  name: string;
  is_active?: boolean;
  sort_order?: number;
}
interface ScoringRow extends BaseRow {
  __type: "scoring";
  event_trigger: string;
  points: number;
  decay_days?: number | null;
}
interface RoutingRow extends BaseRow {
  __type: "routing";
  routing_type: string;
  routing_target_json?: string | null;
}
interface AutoTagRow extends BaseRow {
  __type: "autotag";
  tags_json?: string | null;
}
type RuleRow = ScoringRow | RoutingRow | AutoTagRow;

const TYPE_META: Record<RuleType, { label: string; icon: typeof Zap; color: string; bg: string }> = {
  scoring: { label: "Scoring",  icon: Zap,        color: "text-indigo-700", bg: "bg-indigo-100" },
  routing: { label: "Routing",  icon: GitBranch,  color: "text-emerald-700", bg: "bg-emerald-100" },
  autotag: { label: "Auto-Tag", icon: TagIcon,    color: "text-amber-700",  bg: "bg-amber-100" },
};

export function SparkRulesPage() {
  const { get, ready } = useSparkApi();
  const [scoring, setScoring] = useState<ScoringRow[]>([]);
  const [routing, setRouting] = useState<RoutingRow[]>([]);
  const [autotag, setAutotag] = useState<AutoTagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [typeFilter, setTypeFilter] = useState<"all" | RuleType>("all");
  const [search, setSearch] = useState("");

  const [editor, setEditor] = useState<{ type: RuleType; id: number | null } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const [s, r, a] = await Promise.all([
        get<{ data: Omit<ScoringRow, "__type">[] }>("/api/v1/scoring-rules").catch(() => ({ data: [] })),
        get<{ data: Omit<RoutingRow, "__type">[] }>("/api/v1/routing-rules").catch(() => ({ data: [] })),
        get<{ data: Omit<AutoTagRow, "__type">[] }>("/api/v1/lead-autotag-rules").catch(() => ({ data: [] })),
      ]);
      setScoring((s.data || []).map((row) => ({ ...row, __type: "scoring" as const })));
      setRouting((r.data || []).map((row) => ({ ...row, __type: "routing" as const })));
      setAutotag((a.data || []).map((row) => ({ ...row, __type: "autotag" as const })));
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready]);

  useEffect(() => { load(); }, [load]);

  const rows: RuleRow[] = useMemo(() => {
    let list: RuleRow[] = [];
    if (typeFilter === "all" || typeFilter === "scoring") list = list.concat(scoring);
    if (typeFilter === "all" || typeFilter === "routing") list = list.concat(routing);
    if (typeFilter === "all" || typeFilter === "autotag") list = list.concat(autotag);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.name?.toLowerCase().includes(q));
    }
    return list.sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999));
  }, [scoring, routing, autotag, typeFilter, search]);

  function openNew(t: RuleType) {
    setPickerOpen(false);
    setEditor({ type: t, id: null });
  }
  function openExisting(r: RuleRow) {
    setEditor({ type: r.__type, id: r.id });
  }

  return (
    <SparkPageShell
      title="Rules"
      subtitle="Auto-scoring, routing, and auto-tagging for incoming leads"
      help="One library for every passive rule that fires on its own. Scoring rules adjust a contact's lead score on events. Routing rules pick an owner. Auto-tag rules apply tags based on criteria. Click any row to edit; + New rule asks the type first."
      loading={loading}
      error={error}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {([
              { key: "all",     label: "All" },
              { key: "scoring", label: "Scoring" },
              { key: "routing", label: "Routing" },
              { key: "autotag", label: "Auto-Tag" },
            ] as Array<{ key: typeof typeFilter; label: string }>).map((c) => (
              <button
                key={c.key}
                onClick={() => setTypeFilter(c.key)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  typeFilter === c.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <input
            type="search"
            placeholder="Search by name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-xs border border-slate-300 rounded-md px-2 py-1 w-44"
          />
        </div>
        <button
          onClick={() => setPickerOpen(true)}
          className="rounded-lg bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#d75a25] inline-flex items-center gap-1"
        >
          <Plus className="h-3.5 w-3.5" /> New rule
        </button>
      </div>

      {/* Grid */}
      {rows.length === 0 && !loading ? (
        <EmptyState onNew={() => setPickerOpen(true)} />
      ) : (
        <div className="rounded-xl bg-white ring-1 ring-slate-200 overflow-hidden">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2 w-20 text-right">Order</th>
                <th className="px-3 py-2 w-16 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => {
                const meta = TYPE_META[row.__type];
                const Icon = meta.icon;
                return (
                  <tr
                    key={`${row.__type}-${row.id}`}
                    onClick={() => openExisting(row)}
                    className="hover:bg-slate-50 cursor-pointer"
                  >
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${meta.bg} ${meta.color}`}>
                        <Icon className="h-3 w-3" /> {meta.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-900 truncate max-w-xs">{row.name}</td>
                    <td className="px-3 py-2 text-xs text-slate-600 truncate max-w-md">
                      {row.__type === "scoring" && (
                        <>on <code className="bg-slate-100 px-1 rounded">{(row as ScoringRow).event_trigger}</code> → {(row as ScoringRow).points} pts{(row as ScoringRow).decay_days ? ` (decays in ${(row as ScoringRow).decay_days}d)` : ""}</>
                      )}
                      {row.__type === "routing" && (
                        <>route via <code className="bg-slate-100 px-1 rounded">{(row as RoutingRow).routing_type}</code></>
                      )}
                      {row.__type === "autotag" && (
                        <>apply tags: {summarizeTags((row as AutoTagRow).tags_json)}</>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500 tabular-nums text-right">{row.sort_order ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      {row.is_active === false ? (
                        <span className="inline-flex items-center gap-0.5 text-[10px] uppercase font-bold text-amber-700"><Power className="h-2.5 w-2.5" /> off</span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-[10px] uppercase font-bold text-emerald-700"><Power className="h-2.5 w-2.5" /> on</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Type picker */}
      {pickerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setPickerOpen(false)}
        >
          <div className="relative w-full max-w-lg rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 bg-gradient-to-r from-[#0B1C24] to-[#1a3540] text-white rounded-t-xl">
              <h3 className="font-semibold text-base">Pick a rule type</h3>
              <button onClick={() => setPickerOpen(false)} aria-label="Close" className="rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 grid grid-cols-1 gap-3">
              {(["scoring", "routing", "autotag"] as RuleType[]).map((t) => {
                const meta = TYPE_META[t];
                const Icon = meta.icon;
                const tagline = t === "scoring"
                  ? "Adjust the lead's running score when an event fires."
                  : t === "routing"
                  ? "Pick an owner for inbound leads matching criteria."
                  : "Auto-tag leads matching criteria with a fixed tag set.";
                return (
                  <button
                    key={t}
                    onClick={() => openNew(t)}
                    className="group flex items-start gap-3 rounded-lg border-2 border-slate-200 bg-white p-4 text-left transition-colors hover:border-[#EF6C33] hover:bg-[#EF6C33]/5"
                  >
                    <div className={`flex h-10 w-10 items-center justify-center rounded-md ${meta.bg} ${meta.color} flex-shrink-0`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900">{meta.label}</div>
                      <div className="text-xs text-slate-500 leading-snug mt-0.5">{tagline}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Editor */}
      {editor && (
        <SparkRuleEditorModal
          open={true}
          ruleType={editor.type}
          ruleId={editor.id}
          onClose={() => setEditor(null)}
          onChanged={() => { setEditor(null); load(); }}
        />
      )}
    </SparkPageShell>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white p-10 text-center">
      <div className="mx-auto w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-3">
        <AlertTriangle className="h-7 w-7 text-slate-400" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900">No rules yet</h3>
      <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
        Start scoring engagement, routing leads to specific owners, or auto-tagging incoming prospects.
      </p>
      <button onClick={onNew} className="mt-4 inline-flex items-center gap-1 rounded-lg bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#d75a25]">
        <Plus className="h-3.5 w-3.5" /> New rule
      </button>
    </div>
  );
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

export default SparkRulesPage;
