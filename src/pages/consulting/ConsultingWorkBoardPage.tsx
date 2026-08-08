// ConsultingWorkBoardPage — AGENCY work board (2026-08-08, swimlane rebuild).
//
// THE MODEL (Brandon, corrected from my first attempt):
//   "if I select worker view the columns would be the same but then the rows
//    would now have segments for who is working on it. Same with a release view."
//
// So STAGE COLUMNS ARE FIXED. Always. A *view* does not replace them — it adds
// horizontal SWIMLANES cutting across them. My first build had group-by REPLACE
// the columns, which threw away the pipeline you actually need to see.
//
// FILTER vs VIEW, in Brandon's words:
//   "A filter is something that would filter the cards to only those items, open
//    only is a great example. The view is just restructuring the board to keep
//    the stages, but arrange the cards to a different view of the same list."
//
// Lane rules he set:
//   - buckets appear only when they hold cards
//   - "no release" is a real bucket (defects, quick client updates — work that
//     just gets worked), NOT an error state
//   - Unassigned sorts to the BOTTOM
//   - new items auto-assign to their creator, so Unassigned means a deliberate
//     hand-off rather than an oversight
//
// Scope guard: AGENCY side only. The client portal's Service Requests surface and
// the server-validated stage machine are untouched.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { IadmModal } from "../../components/IadmModal";
import { Plus, AlertCircle, LayoutGrid, List as ListIcon, ChevronDown, ChevronRight, Search } from "lucide-react";
import {
  TASK_STAGE_LABELS,
  TASK_STATUS_LABELS,
  TASK_ACTIONS,
  TaskDetailModal,
  type TaskDeliverable,
} from "../../components/consulting/ConsultingProjectModal";

interface WorkRow {
  id: string; tenant_id: string;
  project_id?: string | null; milestone_id?: string | null;
  title: string; description?: string | null;
  stage: string; status: string; origin: string;
  oliver_job_id?: string | null;
  assigned_to_worker_id?: string | null; assignee_name?: string | null;
  stage_changed_at?: string | null; days_in_stage?: number | null;
  estimate_hours?: number | null; estimate_size?: string | null; actual_hours?: number | null;
  priority?: string | null; due_at?: string | null; sort_order?: number;
  release_id?: string | null; release_name?: string | null; release_target_date?: string | null;
  platform?: string | null; tags?: string[];
  deliverables?: TaskDeliverable[];
  project_name?: string | null; milestone_name?: string | null;
  client_display_name?: string | null; client_company?: string | null;
  total_count?: number;
}
interface ReleaseRow {
  release_id: string; name: string; target_date?: string | null; status: string;
  task_count: number; done_count: number; hours_total: number | null; unsized: number;
}
interface WorkerRow {
  worker_id: string; display_name: string; status: string; hours_per_week: number | null;
}
interface WorkMeta { priorities: string[]; platforms: string[]; estimate_sizes: string[]; estimate_unit: string; }

const STAGE_ORDER = [
  "new", "in_progress", "client_review", "revision",
  "client_revision_review", "approved", "completed",
] as const;

const STAGE_TINT: Record<string, string> = {
  new: "#64748b", in_progress: "#d97706", client_review: "#2563eb",
  revision: "#b45309", client_revision_review: "#2563eb",
  approved: "#059669", completed: "#334155", cancelled: "#b91c1c",
};
const PRIORITY_TINT: Record<string, string> = {
  urgent: "#dc2626", high: "#ea580c", normal: "#64748b", low: "#94a3b8",
};
const PLATFORM_LABEL: Record<string, string> = {
  arion: "ARION", spark: "SPARK", oliver: "OLIVER", argus: "ARGUS",
  stella: "STELLA", forge: "FORGE", platform: "Platform", internal: "Internal",
};

type View = "stage" | "worker" | "release";
const VIEW_LABEL: Record<View, string> = { stage: "Stage only", worker: "By worker", release: "By release" };

const PAGE_SIZE = 50;
const NO_LANE = "__none";

// DATE columns carry no timezone; new Date() shifts them a day west of UTC.
function fmtDateOnly(v?: string | null): string {
  if (!v) return "";
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[2])}/${Number(m[3])}/${m[1]}` : String(v);
}

function QuickAdd({ onCreate, placeholder }: { onCreate: (t: string) => Promise<void>; placeholder: string }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const t = value.trim();
    if (!t || busy) return;
    setBusy(true);
    try { await onCreate(t); setValue(""); } finally { setBusy(false); }
  };
  return (
    <input
      value={value} disabled={busy}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
      onBlur={() => { if (value.trim()) submit(); }}
      placeholder={placeholder}
      className="w-full rounded-md border border-dashed border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-[#EF6C33] focus:outline-none disabled:opacity-50"
    />
  );
}

export function ConsultingWorkBoardPage() {
  const { getFounder, patchFounder, postFounder, ready } = useOliverApi();

  const [rows, setRows] = useState<WorkRow[]>([]);
  const [total, setTotal] = useState(0);
  const [releases, setReleases] = useState<ReleaseRow[]>([]);
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [projects, setProjects] = useState<Array<{ project_id: string; name: string }>>([]);
  const [meta, setMeta] = useState<WorkMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<WorkRow | null>(null);
  const [planRow, setPlanRow] = useState<WorkRow | null>(null);
  const [showNewRelease, setShowNewRelease] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const [mode, setMode] = useState<"board" | "list">("board");
  const [view, setView] = useState<View>("stage");
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  // FILTERS (reduce which cards exist) — distinct from VIEW (restructures them).
  const [fRelease, setFRelease] = useState("");
  const [fPriority, setFPriority] = useState("");
  const [fTag, setFTag] = useState("");
  const [fAssignee, setFAssignee] = useState("");
  const [openOnly, setOpenOnly] = useState(true);
  const [intakeOnly, setIntakeOnly] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    if (!ready) return;
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (fRelease) qs.set("release_id", fRelease);
      if (fPriority) qs.set("priority", fPriority);
      if (fTag) qs.set("tag", fTag);
      if (fAssignee) qs.set("assigned_to", fAssignee);
      if (openOnly) qs.set("open_only", "1");
      if (intakeOnly) qs.set("intake_only", "1");
      if (debounced.trim()) qs.set("q", debounced.trim());
      // The board needs every card to build lanes; the List view asks for a page.
      if (mode === "list") { qs.set("limit", String(PAGE_SIZE)); qs.set("offset", String(page * PAGE_SIZE)); }
      const q = qs.toString();
      const data = await getFounder<WorkRow[]>(`/consulting/requests${q ? `?${q}` : ""}`);
      const list = Array.isArray(data) ? data : [];
      setRows(list);
      // total_count rides on each row (COUNT(*) OVER) because the API envelope
      // unwrapper strips a sibling `meta` field.
      setTotal(list.length ? Number(list[0].total_count || list.length) : 0);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [getFounder, ready, fRelease, fPriority, fTag, fAssignee, openOnly, intakeOnly, debounced, mode, page]);

  useEffect(() => { load(); }, [load]);

  const loadRefs = useCallback(async () => {
    if (!ready) return;
    getFounder<ReleaseRow[]>("/consulting/releases").then((d) => setReleases(Array.isArray(d) ? d : [])).catch(() => {});
    getFounder<WorkerRow[]>("/consulting/team").then((d) => setWorkers(Array.isArray(d) ? d : [])).catch(() => {});
    getFounder<WorkMeta>("/consulting/work-meta").then(setMeta).catch(() => {});
    getFounder<Array<{ project_id: string; name: string }>>("/consulting/projects")
      .then((d) => setProjects(Array.isArray(d) ? d : [])).catch(() => {});
  }, [getFounder, ready]);
  useEffect(() => { loadRefs(); }, [loadRefs]);

  const patchRow = async (id: string, body: Record<string, unknown>) => {
    setBusyId(id); setError(null);
    try { await patchFounder(`/consulting/requests/${id}`, body); await load(); }
    catch (e) { setError((e as Error).message || "Update failed."); }
    finally { setBusyId(null); }
  };

  const transition = async (r: WorkRow, value: string) => {
    const [stage, status] = value.split("|");
    if (!stage || !status || (stage === r.stage && status === r.status)) return;
    await patchRow(r.id, { stage, status });
  };

  const quickCreate = async (title: string, seed: Record<string, unknown> = {}) => {
    setError(null);
    try { await postFounder("/consulting/requests", { title, ...seed }); await load(); }
    catch (e) { setError((e as Error).message || "Could not create."); }
  };

  const columns = useMemo(
    () => (showCancelled ? [...STAGE_ORDER, "cancelled"] : [...STAGE_ORDER]) as string[],
    [showCancelled],
  );

  // ── LANES. Stage view = one implicit lane. Worker/release = real swimlanes.
  //    A bucket exists only if it holds cards; the "none" bucket sorts LAST.
  const lanes = useMemo(() => {
    if (view === "stage") return [{ key: "__all", label: "", rows }];
    const byKey = new Map<string, WorkRow[]>();
    for (const r of rows) {
      const k = (view === "worker" ? r.assigned_to_worker_id : r.release_id) || NO_LANE;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k)!.push(r);
    }
    const labelFor = (k: string) => {
      if (k === NO_LANE) return view === "worker" ? "Unassigned" : "No release";
      if (view === "worker") return workers.find((w) => w.worker_id === k)?.display_name
        || byKey.get(k)?.[0]?.assignee_name || "Worker";
      return releases.find((x) => x.release_id === k)?.name
        || byKey.get(k)?.[0]?.release_name || "Release";
    };
    const ordered = [...byKey.keys()].filter((k) => k !== NO_LANE).sort((a, b) => {
      if (view === "release") {
        // Soonest target first — the release you're actually shipping next.
        const ta = releases.find((x) => x.release_id === a)?.target_date || "9999";
        const tb = releases.find((x) => x.release_id === b)?.target_date || "9999";
        return String(ta).localeCompare(String(tb));
      }
      return labelFor(a).localeCompare(labelFor(b));
    });
    if (byKey.has(NO_LANE)) ordered.push(NO_LANE);   // always the bottom lane
    return ordered.map((k) => ({ key: k, label: labelFor(k), rows: byKey.get(k)! }));
  }, [rows, view, workers, releases]);

  const unit = meta?.estimate_unit || "hours";
  const capacity = (items: WorkRow[]) => {
    let hours = 0, unsized = 0;
    for (const r of items) {
      if (r.estimate_hours != null) hours += Number(r.estimate_hours);
      else if (!r.estimate_size) unsized++;
    }
    return { hours, unsized };
  };
  const totals = useMemo(() => capacity(rows), [rows]);
  const allTags = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => (r.tags || []).forEach((t) => s.add(t)));
    return [...s].sort();
  }, [rows]);

  const clientOf = (r: WorkRow) => r.client_display_name || r.client_company || null;

  // ── Card ──────────────────────────────────────────────────────────────────
  const Card = ({ r }: { r: WorkRow }) => {
    const est = r.estimate_hours != null ? `${r.estimate_hours}h` : r.estimate_size || null;
    const overdue = r.due_at && new Date(r.due_at) < new Date() && r.stage !== "completed";
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
        <div className="flex items-start gap-1">
          <button type="button" onClick={() => setOpenRow(r)}
            className="block flex-1 text-left text-xs font-semibold leading-snug text-slate-800 hover:text-[#EF6C33]">
            {r.title}
          </button>
          <button type="button" onClick={() => setPlanRow(r)} title="Plan — estimate, release, owner, due date"
            className="flex-shrink-0 rounded border border-slate-200 px-1 py-0.5 text-[10px] text-slate-500 hover:bg-slate-50 hover:text-slate-700">
            Plan
          </button>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {r.platform && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{PLATFORM_LABEL[r.platform] || r.platform}</span>}
          {r.priority && r.priority !== "normal" && (
            <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white" style={{ background: PRIORITY_TINT[r.priority] || "#64748b" }}>{r.priority}</span>
          )}
          {est && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">{est}</span>}
          {/* Don't repeat what the lane already says. */}
          {view !== "release" && r.release_name && <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">{r.release_name}</span>}
          {view !== "worker" && r.assignee_name && <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">{r.assignee_name}</span>}
          {r.origin === "client" && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">client</span>}
          {(r.tags || []).map((t) => <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">#{t}</span>)}
        </div>

        {(clientOf(r) || r.project_name) && (
          <div className="mt-1 truncate text-[10px] text-slate-500">
            {clientOf(r)}{clientOf(r) && r.project_name ? " · " : ""}{r.project_name}
          </div>
        )}
        {r.due_at && (
          <div className={`mt-1 text-[10px] ${overdue ? "font-semibold text-red-600" : "text-slate-500"}`}>
            due {new Date(r.due_at).toLocaleDateString()}
          </div>
        )}
        {(r.days_in_stage ?? 0) >= 7 && r.stage !== "completed" && (
          <div className="mt-1 text-[10px] text-amber-700">{r.days_in_stage}d in this stage</div>
        )}

        <select value={`${r.stage}|${r.status}`} disabled={busyId === r.id}
          onChange={(e) => transition(r, e.target.value)}
          className="mt-2 w-full rounded border border-slate-200 bg-slate-50 px-1.5 py-1 text-[10px] text-slate-700">
          <option value={`${r.stage}|${r.status}`}>
            {TASK_STAGE_LABELS[r.stage] || r.stage} — {TASK_STATUS_LABELS[r.status] || r.status}
          </option>
          {(TASK_ACTIONS[r.stage] || []).filter((a) => a.value !== `${r.stage}|${r.status}`)
            .map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
      </div>
    );
  };

  // One row of stage columns, for a given set of cards.
  const StageColumns = ({ items, laneKey }: { items: WorkRow[]; laneKey: string }) => (
    <div className="flex items-start gap-3" style={{ minWidth: `${columns.length * 252}px` }}>
      {columns.map((stage) => {
        const cards = items.filter((r) => r.stage === stage);
        const cap = capacity(cards);
        const seed: Record<string, unknown> =
          view === "worker" && laneKey !== NO_LANE && laneKey !== "__all" ? { assigned_to_worker_id: laneKey }
          : view === "release" && laneKey !== NO_LANE && laneKey !== "__all" ? { release_id: laneKey }
          : {};
        return (
          <div key={stage} className="w-60 flex-shrink-0 rounded-xl border border-slate-200 bg-slate-50/80">
            <div className="flex items-center justify-between rounded-t-xl border-b-2 bg-white px-3 py-2"
                 style={{ borderBottomColor: STAGE_TINT[stage] }}>
              <span className="text-xs font-semibold text-slate-700">{TASK_STAGE_LABELS[stage] || stage}</span>
              <span className="text-[10px] text-slate-500">
                {cards.length}{unit === "hours" && cap.hours > 0 && ` · ${cap.hours}h`}
                {cap.unsized > 0 && <span className="text-amber-700"> · {cap.unsized}?</span>}
              </span>
            </div>
            <div className="space-y-2 p-2">
              {stage === "new" && <QuickAdd onCreate={(t) => quickCreate(t, seed)} placeholder="+ Add…" />}
              {cards.map((r) => <Card key={r.id} r={r} />)}
              {cards.length === 0 && stage !== "new" && (
                <div className="py-3 text-center text-[11px] text-slate-300">—</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  const selectCls = "rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700";
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto space-y-4 pb-8" style={{ maxWidth: "80%" }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Work</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Every piece of work — internal and client. {mode === "list" ? total : rows.length} shown ·{" "}
            {totals.hours}h estimated
            {totals.unsized > 0 && <> · <strong className="text-amber-700">{totals.unsized} unsized</strong></>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-slate-200">
            <button type="button" onClick={() => { setMode("board"); setPage(0); }}
              className={`flex items-center gap-1 px-2 py-1 text-xs ${mode === "board" ? "bg-slate-800 text-white" : "bg-white text-slate-600"}`}>
              <LayoutGrid className="h-3 w-3" /> Board
            </button>
            <button type="button" onClick={() => { setMode("list"); setPage(0); }}
              className={`flex items-center gap-1 px-2 py-1 text-xs ${mode === "list" ? "bg-slate-800 text-white" : "bg-white text-slate-600"}`}>
              <ListIcon className="h-3 w-3" /> List
            </button>
          </div>
          {/* Explicit front door — quick-add inside a column is easy to miss. */}
          <button type="button" onClick={() => setShowNewTask(true)}
            className="inline-flex items-center gap-1 rounded-md bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#d95d27]">
            <Plus className="h-3.5 w-3.5" /> New task
          </button>
          <button type="button" onClick={() => setShowNewRelease(true)}
            className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
            + Release
          </button>
        </div>
      </div>

      {/* VIEW — restructures the same cards. Stage columns never change. */}
      {mode === "board" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500">View</span>
          <div className="flex overflow-hidden rounded-md border border-slate-200">
            {(Object.keys(VIEW_LABEL) as View[]).map((v) => (
              <button key={v} type="button" onClick={() => setView(v)}
                className={`px-2.5 py-1 text-xs ${view === v ? "bg-[#0C4A60] text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
                {VIEW_LABEL[v]}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-slate-400">stages stay the columns; the view adds swimlanes</span>
        </div>
      )}

      {/* FILTERS — remove cards from the board entirely. */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1.5 h-3.5 w-3.5 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, description, project…"
            className="w-56 rounded-md border border-slate-200 bg-white py-1 pl-7 pr-2 text-xs text-slate-700" />
        </div>
        <select value={fRelease} onChange={(e) => { setFRelease(e.target.value); setPage(0); }} className={selectCls}>
          <option value="">All releases</option>
          <option value="backlog">No release</option>
          {releases.map((x) => <option key={x.release_id} value={x.release_id}>{x.name}</option>)}
        </select>
        <select value={fAssignee} onChange={(e) => { setFAssignee(e.target.value); setPage(0); }} className={selectCls}>
          <option value="">Anyone</option>
          <option value="unassigned">Unassigned</option>
          {workers.map((w) => <option key={w.worker_id} value={w.worker_id}>{w.display_name}</option>)}
        </select>
        <select value={fPriority} onChange={(e) => { setFPriority(e.target.value); setPage(0); }} className={selectCls}>
          <option value="">Any priority</option>
          {(meta?.priorities || []).map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        {allTags.length > 0 && (
          <select value={fTag} onChange={(e) => { setFTag(e.target.value); setPage(0); }} className={selectCls}>
            <option value="">Any tag</option>
            {allTags.map((t) => <option key={t} value={t}>#{t}</option>)}
          </select>
        )}
        <label className="flex items-center gap-1 text-xs text-slate-600">
          <input type="checkbox" checked={openOnly} onChange={(e) => { setOpenOnly(e.target.checked); setPage(0); }} /> Open only
        </label>
        <label className="flex items-center gap-1 text-xs text-slate-600" title="Client-raised requests awaiting triage">
          <input type="checkbox" checked={intakeOnly} onChange={(e) => { setIntakeOnly(e.target.checked); setPage(0); }} /> Intake
        </label>
        {mode === "board" && (
          <label className="flex items-center gap-1 text-xs text-slate-600">
            <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} /> Cancelled
          </label>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />{error}
        </div>
      )}

      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading…</div>
      ) : mode === "list" ? (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          {rows.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">Nothing matches these filters.</div>
          ) : (
            <>
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Title</th>
                    <th className="px-3 py-2">Project</th>
                    <th className="px-3 py-2">Owner</th>
                    <th className="px-3 py-2">Stage</th>
                    <th className="px-3 py-2">Release</th>
                    <th className="px-3 py-2">Est</th>
                    <th className="px-3 py-2">Due</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2">
                        <button type="button" onClick={() => setOpenRow(r)}
                          className="text-left font-medium text-slate-800 hover:text-[#EF6C33]">{r.title}</button>
                      </td>
                      {/* Lineage: the project this work belongs to, and its client. */}
                      <td className="px-3 py-2 text-slate-600">
                        {r.project_name || <span className="text-slate-400">—</span>}
                        {clientOf(r) && <div className="text-[10px] text-slate-400">{clientOf(r)}</div>}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{r.assignee_name || <span className="text-amber-700">Unassigned</span>}</td>
                      <td className="px-3 py-2 text-slate-600">{TASK_STAGE_LABELS[r.stage] || r.stage}</td>
                      <td className="px-3 py-2 text-slate-600">{r.release_name || "—"}</td>
                      <td className="px-3 py-2 text-slate-600">{r.estimate_hours != null ? `${r.estimate_hours}h` : r.estimate_size || "—"}</td>
                      <td className="px-3 py-2 text-slate-600">{r.due_at ? new Date(r.due_at).toLocaleDateString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2 text-xs text-slate-600">
                <span>
                  {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
                </span>
                <div className="flex gap-1">
                  <button type="button" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}
                    className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40">Previous</button>
                  <button type="button" disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)}
                    className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40">Next</button>
                </div>
              </div>
            </>
          )}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          Nothing matches these filters.
        </div>
      ) : (
        <div className="space-y-3 overflow-x-auto pb-2">
          {lanes.map((lane) => {
            const cap = capacity(lane.rows);
            const isCollapsed = !!collapsed[`${view}:${lane.key}`];
            return (
              <div key={lane.key}>
                {view !== "stage" && (
                  <button type="button"
                    onClick={() => setCollapsed((c) => ({ ...c, [`${view}:${lane.key}`]: !isCollapsed }))}
                    className="mb-1 flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-left hover:bg-slate-50"
                    style={{ minWidth: `${columns.length * 252}px` }}>
                    {isCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-slate-400" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
                    <span className={`text-xs font-bold ${lane.key === NO_LANE ? "text-amber-700" : "text-slate-800"}`}>{lane.label}</span>
                    <span className="text-[11px] text-slate-500">
                      {lane.rows.length} item{lane.rows.length === 1 ? "" : "s"}
                      {cap.hours > 0 && ` · ${cap.hours}h`}
                      {cap.unsized > 0 && <span className="text-amber-700"> · {cap.unsized} unsized</span>}
                    </span>
                  </button>
                )}
                {!isCollapsed && <StageColumns items={lane.rows} laneKey={lane.key} />}
              </div>
            );
          })}
        </div>
      )}

      {openRow && (
        <TaskDetailModal task={openRow as never} deliverables={openRow.deliverables || []}
          onClose={() => setOpenRow(null)} onChanged={() => { setOpenRow(null); load(); }} />
      )}
      {planRow && (
        <PlanModal row={planRow} releases={releases} workers={workers} meta={meta} projects={projects}
          onClose={() => setPlanRow(null)}
          onSaved={() => { setPlanRow(null); load(); loadRefs(); }} />
      )}
      {showNewTask && (
        <NewTaskModal releases={releases} workers={workers} meta={meta} projects={projects}
          onClose={() => setShowNewTask(false)}
          onCreated={() => { setShowNewTask(false); load(); }} />
      )}
      {showNewRelease && (
        <NewReleaseModal onClose={() => setShowNewRelease(false)}
          onCreated={() => { setShowNewRelease(false); loadRefs(); }} />
      )}
    </div>
  );
}

// ── Plan editor ─────────────────────────────────────────────────────────────
// Agency-only fields. Deliberately NOT an extension of TaskDetailModal, which is
// shared with the CLIENT modal — agency planning must not leak onto a client surface.
function PlanModal({ row, releases, workers, meta, projects, onClose, onSaved }: {
  row: WorkRow; releases: ReleaseRow[]; workers: WorkerRow[]; meta: WorkMeta | null;
  projects: Array<{ project_id: string; name: string }>;
  onClose: () => void; onSaved: () => void;
}) {
  const { patchFounder, postFounder } = useOliverApi();
  const unit = meta?.estimate_unit || "hours";
  const [platform, setPlatform] = useState(row.platform || "");
  const [priority, setPriority] = useState(row.priority || "");
  const [hours, setHours] = useState(row.estimate_hours != null ? String(row.estimate_hours) : "");
  const [size, setSize] = useState(row.estimate_size || "");
  const [dueAt, setDueAt] = useState(row.due_at ? String(row.due_at).slice(0, 10) : "");
  const [releaseId, setReleaseId] = useState(row.release_id || "");
  const [workerId, setWorkerId] = useState(row.assigned_to_worker_id || "");
  const [projectId, setProjectId] = useState(row.project_id || "");
  const [newTag, setNewTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await patchFounder(`/consulting/requests/${row.id}`, {
        platform: platform || null,
        priority: priority || null,
        estimate_hours: hours === "" ? null : Number(hours),   // blank stays NULL = not sized
        estimate_size: size || null,
        due_at: dueAt || null,
        release_id: releaseId || null,
        assigned_to_worker_id: workerId || null,
        project_id: projectId || null,
      });
      if (newTag.trim()) await postFounder(`/consulting/requests/${row.id}/tags`, { tag: newTag.trim() });
      onSaved();
    } catch (e) { setErr((e as Error).message || "Save failed."); }
    finally { setBusy(false); }
  };

  const f = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm";
  const l = "mb-1 block text-xs font-medium text-slate-600";

  return (
    <IadmModal open onClose={onClose} product="oliver" title="Plan" subtitle={row.title} size="md">
      <div className="space-y-3 p-1">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={l}>Owner</label>
            <select value={workerId} onChange={(e) => setWorkerId(e.target.value)} className={f}>
              <option value="">Unassigned</option>
              {workers.map((w) => <option key={w.worker_id} value={w.worker_id}>{w.display_name}</option>)}
            </select>
          </div>
          <div>
            <label className={l}>Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className={f}>
              <option value="">—</option>
              {(meta?.priorities || []).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={l}>Estimate {unit === "hours" ? "(hours)" : "(size)"}</label>
            {unit === "hours" ? (
              <input type="number" min="0" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)}
                placeholder="blank = not sized" className={f} />
            ) : (
              <select value={size} onChange={(e) => setSize(e.target.value)} className={f}>
                <option value="">not sized</option>
                {(meta?.estimate_sizes || []).map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            )}
            <p className="mt-1 text-[11px] text-slate-500">Blank means <strong>not sized</strong> — never counted as zero.</p>
          </div>
          <div>
            <label className={l}>Due date</label>
            <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className={f} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={l}>Release</label>
            <select value={releaseId} onChange={(e) => setReleaseId(e.target.value)} className={f}>
              <option value="">No release</option>
              {releases.map((x) => <option key={x.release_id} value={x.release_id}>{x.name}</option>)}
            </select>
          </div>
          <div>
            <label className={l}>Platform</label>
            <select value={platform} onChange={(e) => setPlatform(e.target.value)} className={f}>
              <option value="">—</option>
              {(meta?.platforms || []).map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p] || p}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={l}>Project</label>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={f}>
            <option value="">No project</option>
            {projects.map((p) => <option key={p.project_id} value={p.project_id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className={l}>Add tag</label>
          <input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="gate, blocked-on-data…" className={f} />
          {(row.tags || []).length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {(row.tags || []).map((t) => <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">#{t}</span>)}
            </div>
          )}
        </div>
        {err && <div className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">{err}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs">Cancel</button>
          <button type="button" onClick={save} disabled={busy}
            className="rounded-md bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </IadmModal>
  );
}

// ── New task ────────────────────────────────────────────────────────────────
function NewTaskModal({ releases, workers, meta, projects, onClose, onCreated }: {
  releases: ReleaseRow[]; workers: WorkerRow[]; meta: WorkMeta | null;
  projects: Array<{ project_id: string; name: string }>;
  onClose: () => void; onCreated: () => void;
}) {
  const { postFounder } = useOliverApi();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("");
  const [releaseId, setReleaseId] = useState("");
  const [workerId, setWorkerId] = useState("");
  const [platform, setPlatform] = useState("");
  const [priority, setPriority] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!title.trim()) { setErr("Give the task a title."); return; }
    setBusy(true); setErr(null);
    try {
      await postFounder("/consulting/requests", {
        title: title.trim(), description: description.trim() || null,
        project_id: projectId || null, release_id: releaseId || null,
        assigned_to_worker_id: workerId || null,
        platform: platform || null, priority: priority || null,
      });
      onCreated();
    } catch (e) { setErr((e as Error).message || "Could not create."); }
    finally { setBusy(false); }
  };

  const f = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm";
  const l = "mb-1 block text-xs font-medium text-slate-600";

  return (
    <IadmModal open onClose={onClose} product="oliver" title="New task" size="md">
      <div className="space-y-3 p-1">
        <div>
          <label className={l}>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus
            placeholder="What needs doing?" className={f} />
        </div>
        <div>
          <label className={l}>Notes <span className="font-normal text-slate-400">(optional)</span></label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={f} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={l}>Owner</label>
            <select value={workerId} onChange={(e) => setWorkerId(e.target.value)} className={f}>
              <option value="">You (creator)</option>
              {workers.map((w) => <option key={w.worker_id} value={w.worker_id}>{w.display_name}</option>)}
            </select>
            <p className="mt-1 text-[11px] text-slate-500">Left blank it assigns to you; reassign any time.</p>
          </div>
          <div>
            <label className={l}>Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className={f}>
              <option value="">—</option>
              {(meta?.priorities || []).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={l}>Project</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={f}>
              <option value="">No project</option>
              {projects.map((p) => <option key={p.project_id} value={p.project_id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className={l}>Release</label>
            <select value={releaseId} onChange={(e) => setReleaseId(e.target.value)} className={f}>
              <option value="">No release</option>
              {releases.map((x) => <option key={x.release_id} value={x.release_id}>{x.name}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={l}>Platform</label>
          <select value={platform} onChange={(e) => setPlatform(e.target.value)} className={f}>
            <option value="">—</option>
            {(meta?.platforms || []).map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p] || p}</option>)}
          </select>
        </div>
        {err && <div className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">{err}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs">Cancel</button>
          <button type="button" onClick={submit} disabled={busy}
            className="rounded-md bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
            {busy ? "Creating…" : "Create task"}
          </button>
        </div>
      </div>
    </IadmModal>
  );
}

// ── New release ─────────────────────────────────────────────────────────────
function NewReleaseModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { postFounder } = useOliverApi();
  const [name, setName] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) { setErr("Give the release a name."); return; }
    setBusy(true); setErr(null);
    try {
      await postFounder("/consulting/releases", { name: name.trim(), target_date: targetDate || null });
      onCreated();
    } catch (e) { setErr((e as Error).message || "Could not create release."); }
    finally { setBusy(false); }
  };

  return (
    <IadmModal open onClose={onClose} product="oliver" title="New release" size="confirm">
      <div className="space-y-3 p-1">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="September Release A"
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Target date</label>
          <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          <p className="mt-1 text-[11px] text-slate-500">
            Optional — releases are optional entirely. Work with none sits in the No release lane.
          </p>
        </div>
        {err && <div className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">{err}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs">Cancel</button>
          <button type="button" onClick={submit} disabled={busy}
            className="rounded-md bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
            {busy ? "Creating…" : "Create release"}
          </button>
        </div>
      </div>
    </IadmModal>
  );
}

export default ConsultingWorkBoardPage;
