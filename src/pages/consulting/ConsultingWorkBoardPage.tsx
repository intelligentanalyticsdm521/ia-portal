// ConsultingWorkBoardPage — AGENCY work board (2026-08-08).
//
// STAGE COLUMNS ARE FIXED. A *view* does not replace them — it adds horizontal
// SWIMLANES across them (Brandon: "the columns would be the same but then the
// rows would now have segments for who is working on it").
//
// FILTER vs VIEW: a filter REMOVES cards (open only, priority, tag, assignee,
// intake, search). A view RESTRUCTURES the same cards into lanes.
//
// Lane rules: a bucket exists only when it holds cards; "No release" is a real
// bucket for work that just gets worked; Unassigned and No release sort LAST;
// lanes collapse, keyed per view. Over-capacity lanes tint yellow → orange → red.
//
// Scope guard: AGENCY side only. The client Service Requests surface and the
// server-validated stage machine are untouched.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { IadmModal } from "../../components/IadmModal";
import { Plus, AlertCircle, LayoutGrid, List as ListIcon, ChevronDown, ChevronRight, Search, Settings } from "lucide-react";
import { TASK_STAGE_LABELS, TASK_STATUS_LABELS, TASK_ACTIONS } from "../../components/consulting/ConsultingProjectModal";
import { TaskModal } from "./TaskModal";
import {
  type WorkRow, type ReleaseRow, type WorkerRow, type WorkMeta,
  PLATFORM_LABEL, STAGE_TINT, PRIORITY_TINT, loadBand, BAND_STYLE,
} from "./workTypes";

const STAGE_ORDER = [
  "new", "in_progress", "client_review", "revision",
  "client_revision_review", "approved", "completed",
] as const;

type View = "stage" | "worker" | "release";
const VIEW_LABEL: Record<View, string> = { stage: "Stage only", worker: "By worker", release: "By release" };

const PAGE_SIZE = 50;
const NO_LANE = "__none";

function fmtDateOnly(v?: string | null): string {
  if (!v) return "";
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[2])}/${Number(m[3])}` : String(v);
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
    <input value={value} disabled={busy}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
      onBlur={() => { if (value.trim()) submit(); }}
      placeholder={placeholder}
      className="w-full rounded-md border border-dashed border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-[#EF6C33] focus:outline-none disabled:opacity-50" />
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
  const [showNewTask, setShowNewTask] = useState(false);
  const [showReleaseSettings, setShowReleaseSettings] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Drag-to-move between stage columns. Native HTML5 DnD, no library — same
  // approach already used by ConsultingTicketsBoardPage and the category
  // builder. Restored 2026-08-13: the rebuilt board dropped it and the only
  // way to move work was the per-card status select.
  const [draggingRow, setDraggingRow] = useState<WorkRow | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const [mode, setMode] = useState<"board" | "list">("board");
  const [view, setView] = useState<View>("stage");
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

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
      if (mode === "list") { qs.set("limit", String(PAGE_SIZE)); qs.set("offset", String(page * PAGE_SIZE)); }
      const q = qs.toString();
      const data = await getFounder<WorkRow[]>(`/consulting/requests${q ? `?${q}` : ""}`);
      const list = Array.isArray(data) ? data : [];
      setRows(list);
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

  /** The legal "stage|status" for moving `r` into `stage`, or null if the stage
   *  machine has no such transition (e.g. new -> approved). Prefers a non-cancel
   *  action so dropping on a column never silently cancels work. */
  const actionTo = (r: WorkRow, stage: string): string | null => {
    const legal = (TASK_ACTIONS[r.stage] || []).filter((a) => a.value.split("|")[0] === stage);
    if (!legal.length) return null;
    return (legal.find((a) => !a.value.startsWith("cancelled|")) || legal[0]).value;
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

  const workerById = useMemo(() => {
    const m = new Map<string, WorkerRow>();
    workers.forEach((w) => m.set(w.worker_id, w));
    return m;
  }, [workers]);

  const lanes = useMemo(() => {
    if (view === "stage") return [{ key: "__all", label: "", rows, capacity: null as number | null }];
    const byKey = new Map<string, WorkRow[]>();
    for (const r of rows) {
      const k = (view === "worker" ? r.assigned_to_worker_id : r.release_id) || NO_LANE;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k)!.push(r);
    }
    const labelFor = (k: string) => {
      if (k === NO_LANE) return view === "worker" ? "Unassigned" : "No release";
      if (view === "worker") return workerById.get(k)?.display_name || byKey.get(k)?.[0]?.assignee_name || "Worker";
      return releases.find((x) => x.release_id === k)?.name || byKey.get(k)?.[0]?.release_name || "Release";
    };
    const ordered = [...byKey.keys()].filter((k) => k !== NO_LANE).sort((a, b) => {
      if (view === "release") {
        const ta = releases.find((x) => x.release_id === a)?.target_date || "9999";
        const tb = releases.find((x) => x.release_id === b)?.target_date || "9999";
        return String(ta).localeCompare(String(tb));
      }
      return labelFor(a).localeCompare(labelFor(b));
    });
    if (byKey.has(NO_LANE)) ordered.push(NO_LANE);
    return ordered.map((k) => ({
      key: k,
      label: labelFor(k),
      rows: byKey.get(k)!,
      // A worker's baseline is their week. A release's is the team-hours between
      // the previous release and this one — derived server-side so it can't go
      // stale when someone joins, leaves, or changes hours. Brandon: "I need to
      // know if a release is pushing it because we have a shit ton of work
      // outstanding or in-progress."
      capacity: k === NO_LANE ? null
        : view === "worker" ? (workerById.get(k)?.hours_per_week ?? null)
        : (releases.find((x) => x.release_id === k)?.capacity_hours ?? null),
    }));
  }, [rows, view, workerById, releases]);

  const unit = meta?.estimate_unit || "hours";
  // `open` is what the band measures. A lane holding 80 shipped hours is not
  // over capacity; one holding 80 unfinished hours is. Cancelled work is
  // excluded for the same reason — nobody has to absorb it.
  const capacityOf = (items: WorkRow[]) => {
    let hours = 0, open = 0, unsized = 0;
    for (const r of items) {
      const done = r.stage === "completed" || r.stage === "cancelled";
      if (r.estimate_hours != null) {
        hours += Number(r.estimate_hours);
        if (!done) open += Number(r.estimate_hours);
      } else if (!r.estimate_size && !done) unsized++;
    }
    return { hours, open, unsized };
  };
  const totals = useMemo(() => capacityOf(rows), [rows]);

  // Priority mix — Brandon 2026-08-08: "seeing all high/urgent priorities should
  // be flagged. I shouldn't have 50%+ of my tasks as a high/urgent priority."
  //
  // Measured over OPEN work only. Finished work was correctly urgent once and
  // counting it forever would keep the warning lit after the problem is gone.
  // Urgent gets its own lower ceiling: his definition is "do this right now
  // before any other work", and more than a handful of those means none of them
  // are actually first.
  const prioMix = useMemo(() => {
    const open = rows.filter((r) => r.stage !== "completed" && r.stage !== "cancelled");
    const urgent = open.filter((r) => r.priority === "urgent").length;
    const high = open.filter((r) => r.priority === "high").length;
    const total = open.length;
    if (!total) return null;
    const hu = urgent + high;
    return {
      total, urgent, high, hu,
      pct: Math.round((hu / total) * 100),
      urgentPct: Math.round((urgent / total) * 100),
      over: hu / total > 0.5,
      urgentOver: urgent / total > 0.15,
    };
  }, [rows]);
  const allTags = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => (r.tags || []).forEach((t) => s.add(t)));
    return [...s].sort();
  }, [rows]);

  // client_display_name/client_company only exist when the request hangs off a
  // PROJECT with a linked contact. A client filing a request directly has
  // neither, which is why RII's ticket showed only a bare "client" badge with
  // no indication of who sent it. tenant_name (the owning business) is the
  // reliable answer and is now returned by GET /consulting/requests.
  const clientOf = (r: WorkRow) =>
    r.client_label || r.client_display_name || r.client_company || r.tenant_name || null;

  const Card = ({ r }: { r: WorkRow }) => {
    const est = r.estimate_hours != null ? `${r.estimate_hours}h` : r.estimate_size || null;
    const overdue = r.due_at && new Date(r.due_at) < new Date() && r.stage !== "completed";
    const isDragging = draggingRow?.id === r.id;
    return (
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", r.id);
          e.dataTransfer.effectAllowed = "move";
          setDraggingRow(r);
        }}
        onDragEnd={() => { setDraggingRow(null); setDragOverStage(null); }}
        className={`rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm ${
          isDragging ? "opacity-40" : "cursor-grab active:cursor-grabbing"
        }`}
      >
        {/* One modal now — the separate "Plan" button is gone. */}
        <button type="button" onClick={() => setOpenRow(r)}
          className="block w-full text-left text-xs font-semibold leading-snug text-slate-800 hover:text-[#EF6C33]">
          {r.title}
        </button>

        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {r.platform && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{PLATFORM_LABEL[r.platform] || r.platform}</span>}
          {r.priority && r.priority !== "normal" && (
            <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white" style={{ background: PRIORITY_TINT[r.priority] || "#64748b" }}>{r.priority}</span>
          )}
          {est && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">{est}</span>}
          {/* Don't repeat what the lane already states. */}
          {view !== "release" && r.release_name && <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">{r.release_name}</span>}
          {view !== "worker" && r.assignee_name && <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">{r.assignee_name}</span>}
          {r.origin === "client" && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">client</span>}
          {(r.revision_count ?? 0) > 0 && (
            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700" title="Revision rounds">
              ↺{r.revision_count}
            </span>
          )}
          {(r.tags || []).map((t) => <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">#{t}</span>)}
        </div>

        {(clientOf(r) || r.project_name || r.created_at) && (
          <div className="mt-1 truncate text-[10px] text-slate-500">
            {clientOf(r)}{clientOf(r) && r.project_name ? " · " : ""}{r.project_name}
            {/* Filed-on date. It was always in the API response, just never
                rendered — a ticket with no date reads as though it appeared
                from nowhere. */}
            {r.created_at && (
              <>
                {(clientOf(r) || r.project_name) ? " · " : ""}
                {new Date(r.created_at).toLocaleDateString(undefined, {
                  month: "short", day: "numeric",
                })}
              </>
            )}
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

  const StageColumns = ({ items, laneKey }: { items: WorkRow[]; laneKey: string }) => (
    <div className="flex items-start gap-3" style={{ minWidth: `${columns.length * 252}px` }}>
      {columns.map((stage) => {
        const cards = items.filter((r) => r.stage === stage);
        const cap = capacityOf(cards);
        const isDropTarget = dragOverStage === `${laneKey}:${stage}`;
        const seed: Record<string, unknown> =
          view === "worker" && laneKey !== NO_LANE && laneKey !== "__all" ? { assigned_to_worker_id: laneKey }
          : view === "release" && laneKey !== NO_LANE && laneKey !== "__all" ? { release_id: laneKey }
          : {};
        return (
          <div key={stage}
            className={`w-60 flex-shrink-0 rounded-xl border bg-slate-50/80 transition-colors ${
              isDropTarget ? "border-[#EF6C33] ring-2 ring-[#EF6C33]/40" : "border-slate-200"
            }`}
            onDragOver={(e) => {
              // Only accept the drop if the move is actually legal for the
              // dragged card's current stage — the stage machine is
              // server-validated, so a drop we can't express as a legal
              // transition would just 4xx.
              if (!draggingRow || draggingRow.stage === stage) return;
              if (!actionTo(draggingRow, stage)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              const key = `${laneKey}:${stage}`;
              if (dragOverStage !== key) setDragOverStage(key);
            }}
            onDragLeave={(e) => {
              if (e.currentTarget.contains(e.relatedTarget as Node)) return;
              if (dragOverStage === `${laneKey}:${stage}`) setDragOverStage(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverStage(null);
              const id = e.dataTransfer.getData("text/plain");
              const r = rows.find((x) => x.id === id);
              if (!r || r.stage === stage) return;
              const value = actionTo(r, stage);
              if (!value) {
                setError(`Can't move "${r.title}" straight to ${TASK_STAGE_LABELS[stage] || stage}.`);
                return;
              }
              transition(r, value);
            }}>
            <div className="flex items-center justify-between rounded-t-xl border-b-2 bg-white px-3 py-2"
                 style={{ borderBottomColor: STAGE_TINT[stage] }}>
              <span className="text-xs font-semibold text-slate-700">{TASK_STAGE_LABELS[stage] || stage}</span>
              <span className="text-[11px] font-semibold text-slate-600">
                {cards.length}{unit === "hours" && cap.hours > 0 && ` · ${cap.hours}h`}
                {cap.unsized > 0 && <span className="font-normal text-amber-700"> · {cap.unsized}?</span>}
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
            Every piece of work — internal and client.{" "}
            <strong className="text-sm text-slate-800">{mode === "list" ? total : rows.length}</strong> items ·{" "}
            <strong className="text-sm text-slate-800">{totals.hours}h</strong> estimated
            {totals.unsized > 0 && <> · <strong className="text-amber-700">{totals.unsized} unsized</strong></>}
          </p>
          {prioMix && (prioMix.over || prioMix.urgentOver) && (
            <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              <span>
                <strong>{prioMix.pct}% of open work is high or urgent</strong>
                {prioMix.urgentOver && <> ({prioMix.urgent} urgent)</>} — when everything
                is a priority, nothing is. Re-rank the ones that can wait.
              </span>
            </p>
          )}
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
          <button type="button" onClick={() => setShowNewTask(true)}
            className="inline-flex items-center gap-1 rounded-md bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#d95d27]">
            <Plus className="h-3.5 w-3.5" /> New task
          </button>
          {/* Releases are configured, not hand-created one at a time. */}
          <button type="button" onClick={() => setShowReleaseSettings(true)} title="Release schedule"
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
            <Settings className="h-3.5 w-3.5" /> Releases
          </button>
        </div>
      </div>

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
                <span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}</span>
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
            const cap = capacityOf(lane.rows);
            const band = loadBand(cap.open, lane.capacity);
            const style = BAND_STYLE[band];
            const isCollapsed = !!collapsed[`${view}:${lane.key}`];
            return (
              <div key={lane.key}>
                {view !== "stage" && (
                  <button type="button"
                    onClick={() => setCollapsed((c) => ({ ...c, [`${view}:${lane.key}`]: !isCollapsed }))}
                    className="mb-1 flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors hover:brightness-[0.98]"
                    style={{ minWidth: `${columns.length * 252}px`, background: style.bg, borderColor: style.border }}>
                    {isCollapsed ? <ChevronRight className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                    <span className="text-sm font-bold" style={{ color: lane.key === NO_LANE ? "#92400e" : style.text }}>
                      {lane.label}
                    </span>
                    {/* Bigger, per Brandon — the counts are the point of the lane. */}
                    <span className="text-sm font-bold tabular-nums" style={{ color: style.text }}>
                      {lane.rows.length} <span className="text-xs font-medium opacity-70">{lane.rows.length === 1 ? "item" : "items"}</span>
                      {cap.open > 0 && <> · {cap.open}<span className="text-xs font-medium opacity-70">h open</span></>}
                      {lane.capacity != null && (
                        <span className="text-xs font-medium opacity-70"
                          title={view === "release"
                            ? "Team hours available between the previous release and this one"
                            : "This person's weekly hours"}>
                          {" "}/ {lane.capacity}h
                        </span>
                      )}
                    </span>
                    {cap.unsized > 0 && <span className="text-xs font-semibold text-amber-700">{cap.unsized} unsized</span>}
                    {style.note && (
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                        style={{ background: style.border, color: "#fff" }}>{style.note}</span>
                    )}
                  </button>
                )}
                {!isCollapsed && <StageColumns items={lane.rows} laneKey={lane.key} />}
              </div>
            );
          })}
        </div>
      )}

      {openRow && (
        <TaskModal row={openRow} releases={releases} workers={workers} meta={meta} projects={projects}
          onClose={() => setOpenRow(null)}
          onSaved={() => { setOpenRow(null); load(); loadRefs(); }} />
      )}
      {showNewTask && (
        <NewTaskModal releases={releases} workers={workers} meta={meta} projects={projects}
          onClose={() => setShowNewTask(false)} onCreated={() => { setShowNewTask(false); load(); }} />
      )}
      {showReleaseSettings && (
        // saving must NOT close the modal: the confirmation it returns ("12
        // created · 24 scheduled through …") is the only proof the cadence did
        // anything, and closing on save destroyed it before it could be read.
        <ReleaseSettingsModal releases={releases}
          onClose={() => setShowReleaseSettings(false)}
          onSaved={loadRefs} />
      )}
    </div>
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
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="What needs doing?" className={f} />
        </div>
        <div>
          <label className={l}>Description <span className="font-normal text-slate-400">(optional)</span></label>
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

// ── Release schedule ────────────────────────────────────────────────────────
// Brandon: "we should probably have a configuration... if I set this up for
// bi-monthly I should be able to pick a day of the week — 1st and 3rd Thursday
// of every month, 1st and the 15th, or monthly maybe just the 15th. Then
// releases should automatically build lets say out to 1 year."
// Brandon: "I need the releases to be customizable. Not just Thursdays. I use
// Thursday's but maybe some people do a Sunday night, etc."
//
// So this is a RULE BUILDER, not one ordinal set sharing a single weekday. Each
// rule is its own (occurrence, weekday) pair, so "1st Monday AND 3rd Thursday"
// is expressible — and Last is an option, because "last Friday of the month"
// cannot be written as a fixed ordinal when months vary in length.
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const OCCURRENCES = [
  { v: 1, label: "1st" }, { v: 2, label: "2nd" }, { v: 3, label: "3rd" },
  { v: 4, label: "4th" }, { v: 5, label: "5th" }, { v: -1, label: "Last" },
];

interface WeekdayRule { n: number; weekday: number }

function ReleaseSettingsModal({ releases, onClose, onSaved }: {
  releases: ReleaseRow[]; onClose: () => void; onSaved: () => void;
}) {
  // patch, not put: useOliverApi exposes get/post/patch/upload only. An earlier
  // draft cast in a putFounder that does not exist — typecheck passed and it
  // would have thrown at runtime.
  const { getFounder, patchFounder, postFounder } = useOliverApi();
  const [kind, setKind] = useState<"none" | "nth_weekday" | "days_of_month">("none");
  const [rules, setRules] = useState<WeekdayRule[]>([{ n: 1, weekday: 4 }, { n: 3, weekday: 4 }]);
  const [days, setDays] = useState<number[]>([1, 15]);
  const [horizon, setHorizon] = useState(12);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    getFounder<{ kind: string; config: unknown; horizon_months: number }>("/consulting/release-cadence")
      .then((d) => {
        if (!d) return;
        setKind((d.kind as typeof kind) || "none");
        setHorizon(d.horizon_months || 12);
        const cfg = d.config;
        if (d.kind === "nth_weekday" && Array.isArray(cfg) && cfg.length) {
          setRules(cfg as WeekdayRule[]);
        } else if (d.kind === "days_of_month" && Array.isArray(cfg)) {
          setDays(cfg as number[]);
        }
      })
      .catch(() => { /* no cadence yet is a normal first-run state */ });
  }, [getFounder]);

  const setRule = (i: number, patch: Partial<WeekdayRule>) =>
    setRules((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRule = () => setRules((rs) => [...rs, { n: 1, weekday: 4 }]);
  const removeRule = (i: number) => setRules((rs) => rs.filter((_, j) => j !== i));
  const toggleDay = (d: number) =>
    setDays((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d].sort((a, b) => a - b)));

  // Plain-English echo of the rules, so the schedule is verifiable before saving
  // a year of dates against it.
  const describe = () => {
    if (kind === "none") return "No automatic releases.";
    if (kind === "days_of_month") {
      return days.length ? `The ${days.join(", ")} of every month.` : "Pick at least one day.";
    }
    if (!rules.length) return "Add at least one rule.";
    return rules
      .map((r) => `${OCCURRENCES.find((o) => o.v === r.n)?.label || r.n} ${WEEKDAYS[r.weekday]}`)
      .join(" and ") + " of every month.";
  };

  const save = async () => {
    setBusy(true); setErr(null); setResult(null);
    try {
      const config = kind === "nth_weekday" ? rules : kind === "days_of_month" ? days : [];
      const r = await patchFounder<{ generated?: { created: number; planned: number; through: string | null } }>(
        "/consulting/release-cadence", { kind, config, horizon_months: horizon });
      const g = r?.generated;
      setResult(g ? `${g.created} created · ${g.planned} scheduled through ${g.through || "—"}` : "Saved.");
      onSaved();
    } catch (e) { setErr((e as Error).message || "Could not save."); }
    finally { setBusy(false); }
  };

  const topUp = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await postFounder<{ generated?: { created: number } }>("/consulting/release-cadence/generate", {});
      setResult(`${r?.generated?.created ?? 0} added.`);
      onSaved();
    } catch (e) { setErr((e as Error).message || "Could not generate."); }
    finally { setBusy(false); }
  };

  const f = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm";
  const l = "mb-1 block text-xs font-medium text-slate-600";
  const chip = (on: boolean) =>
    `rounded-md border px-2 py-1 text-xs ${on ? "border-[#EF6C33] bg-[#EF6C33] text-white" : "border-slate-300 bg-white text-slate-600"}`;

  return (
    <IadmModal open onClose={onClose} product="oliver" title="Release schedule"
      subtitle="Set the cadence once; the calendar builds itself" size="md">
      <div className="space-y-3 p-1">
        <div>
          <label className={l}>Cadence</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={f}>
            <option value="none">No schedule — create releases by hand</option>
            <option value="nth_weekday">Nth weekday of the month (e.g. 1st &amp; 3rd Thursday)</option>
            <option value="days_of_month">Days of the month (e.g. 1st &amp; 15th)</option>
          </select>
        </div>

        {kind === "nth_weekday" && (
          <div>
            <label className={l}>Rules</label>
            <div className="space-y-2">
              {rules.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select value={r.n} onChange={(e) => setRule(i, { n: Number(e.target.value) })}
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                    {OCCURRENCES.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                  </select>
                  <select value={r.weekday} onChange={(e) => setRule(i, { weekday: Number(e.target.value) })}
                    className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                    {WEEKDAYS.map((w, wi) => <option key={w} value={wi}>{w}</option>)}
                  </select>
                  <button type="button" onClick={() => removeRule(i)} disabled={rules.length === 1}
                    title={rules.length === 1 ? "Keep at least one rule" : "Remove this rule"}
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-500 disabled:opacity-30">
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={addRule}
              className="mt-2 rounded-md border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">
              + Add another
            </button>
            <p className="mt-1 text-[11px] text-slate-500">
              Every rule carries its own weekday, so you can mix — 1st Monday and 3rd Thursday.
              A 5th occurrence is skipped in months that do not have one; Last never is.
            </p>
          </div>
        )}

        {kind === "days_of_month" && (
          <div>
            <label className={l}>Days</label>
            <div className="flex flex-wrap gap-1">
              {[1, 5, 10, 15, 20, 25, 28, 31].map((d) => (
                <button key={d} type="button" className={chip(days.includes(d))}
                  onClick={() => toggleDay(d)}>{d}</button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              31 lands on the last day in shorter months rather than rolling into the next one.
            </p>
          </div>
        )}

        {kind !== "none" && (
          <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
            <span className="font-semibold">Schedule:</span> {describe()}
          </div>
        )}

        {kind !== "none" && (
          <div>
            <label className={l}>Build ahead</label>
            <select value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} className={f}>
              <option value={6}>6 months</option>
              <option value={12}>12 months</option>
              <option value={24}>24 months</option>
            </select>
          </div>
        )}

        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <div className="font-semibold text-slate-700">{releases.length} releases on the calendar</div>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Changing the cadence never deletes existing releases — work may already be filed against them.
          </p>
        </div>

        {result && <div className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-800">{result}</div>}
        {err && <div className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">{err}</div>}

        <div className="flex justify-between gap-2 pt-1">
          <button type="button" onClick={topUp} disabled={busy || kind === "none"}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs disabled:opacity-40">Top up calendar</button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs">Close</button>
            <button type="button" onClick={save} disabled={busy}
              className="rounded-md bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              {busy ? "Saving…" : "Save schedule"}
            </button>
          </div>
        </div>
      </div>
    </IadmModal>
  );
}

export default ConsultingWorkBoardPage;
