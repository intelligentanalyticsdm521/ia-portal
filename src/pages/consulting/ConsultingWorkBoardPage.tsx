// ConsultingWorkBoardPage — AGENCY work board (2026-08-08).
//
// Replaces the founder-side "Service Requests" board. Same underlying object
// (consulting.service_request) and the SAME server-validated stage machine —
// this adds the planning layer from migration 150: estimates, releases,
// priority, platform, due dates, tags, and views.
//
// Scope guard: AGENCY side only. The client portal keeps its own limited
// Service Requests surface untouched, and a client-created request still lands
// as stage='new' / origin='client' — which IS the intake queue. The "Intake"
// view below is a saved filter over that, not a new concept.
//
// Why selects instead of drag-and-drop: a <select> is server-validated on every
// change (the API rejects illegal stage moves), keyboard-accessible, and needs
// no DnD library. Dragging is a nice-to-have; correct transitions are not.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { IadmModal } from "../../components/IadmModal";
import { Plus, AlertCircle, LayoutGrid, List as ListIcon } from "lucide-react";
import {
  TASK_STAGE_LABELS,
  TASK_STATUS_LABELS,
  TASK_ACTIONS,
  TaskDetailModal,
  type TaskDeliverable,
} from "../../components/consulting/ConsultingProjectModal";

// ── Types ───────────────────────────────────────────────────────────────────
interface WorkRow {
  id: string;
  tenant_id: string;
  project_id?: string | null;
  milestone_id?: string | null;
  title: string;
  description?: string | null;
  stage: string;
  status: string;
  origin: string;
  oliver_job_id?: string | null;
  assigned_to_user_id?: string | null;
  created_at: string;
  updated_at: string;
  // migration 150
  estimate_hours?: number | null;
  estimate_size?: string | null;
  actual_hours?: number | null;
  priority?: string | null;
  due_at?: string | null;
  sort_order?: number;
  release_id?: string | null;
  release_name?: string | null;
  release_target_date?: string | null;
  platform?: string | null;
  tags?: string[];
  deliverables?: TaskDeliverable[];
  project_name?: string | null;
  milestone_name?: string | null;
  client_display_name?: string | null;
  client_company?: string | null;
}

interface ReleaseRow {
  release_id: string;
  name: string;
  target_date?: string | null;
  status: string;
  shipped_at?: string | null;
  task_count: number;
  done_count: number;
  hours_total: number | null;
  unsized: number;
}

interface WorkMeta {
  priorities: string[];
  platforms: string[];
  estimate_sizes: string[];
  estimate_unit: string;
}

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

// A DATE column (release.target_date) carries no timezone. Passing it through
// `new Date(...)` parses it as UTC midnight and then toLocaleDateString shifts
// it back into local time — west of UTC that renders the day BEFORE, so a
// release targeted 2026-09-18 displayed as 9/17. Format the parts directly.
// (due_at is DATETIMEOFFSET — a real instant — so it localizes correctly and
// deliberately still uses toLocaleDateString.)
function fmtDateOnly(v?: string | null): string {
  if (!v) return "";
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(v);
  return `${Number(m[2])}/${Number(m[3])}/${m[1]}`;
}

type GroupBy = "stage" | "release" | "assignee" | "priority" | "platform";

const GROUP_LABEL: Record<GroupBy, string> = {
  stage: "Stage", release: "Release", assignee: "Assignee",
  priority: "Priority", platform: "Platform",
};

// ── Quick-add: one input, Enter creates. The single most important control ──
// on this page. The board existed for two weeks with one row in prod because
// capture cost a modal and six fields; if adding an item isn't instant, the
// board goes stale no matter how good the views are.
function QuickAdd({ onCreate, placeholder }: { onCreate: (title: string) => Promise<void>; placeholder: string }) {
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
      value={value}
      disabled={busy}
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
  const [releases, setReleases] = useState<ReleaseRow[]>([]);
  const [meta, setMeta] = useState<WorkMeta | null>(null);
  const [tenantNames, setTenantNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<WorkRow | null>(null);
  const [planRow, setPlanRow] = useState<WorkRow | null>(null);
  const [projects, setProjects] = useState<Array<{ project_id: string; name: string }>>([]);
  const [showNewRelease, setShowNewRelease] = useState(false);

  // View state
  const [view, setView] = useState<"board" | "list">("board");
  const [groupBy, setGroupBy] = useState<GroupBy>("stage");
  const [fPlatform, setFPlatform] = useState("");
  const [fRelease, setFRelease] = useState("");
  const [fPriority, setFPriority] = useState("");
  const [fTag, setFTag] = useState("");
  const [openOnly, setOpenOnly] = useState(true);
  const [intakeOnly, setIntakeOnly] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!ready) return;
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (fPlatform) qs.set("platform", fPlatform);
      if (fRelease) qs.set("release_id", fRelease);
      if (fPriority) qs.set("priority", fPriority);
      if (fTag) qs.set("tag", fTag);
      if (openOnly) qs.set("open_only", "1");
      if (intakeOnly) qs.set("intake_only", "1");
      const q = qs.toString();
      const data = await getFounder<WorkRow[]>(`/consulting/requests${q ? `?${q}` : ""}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [getFounder, ready, fPlatform, fRelease, fPriority, fTag, openOnly, intakeOnly]);

  useEffect(() => { load(); }, [load]);

  const loadReleases = useCallback(async () => {
    if (!ready) return;
    try {
      const d = await getFounder<ReleaseRow[]>("/consulting/releases");
      setReleases(Array.isArray(d) ? d : []);
    } catch { /* releases are optional — an agile agency may have none */ }
  }, [getFounder, ready]);

  useEffect(() => { loadReleases(); }, [loadReleases]);

  useEffect(() => {
    if (!ready) return;
    getFounder<WorkMeta>("/consulting/work-meta").then(setMeta).catch(() => { /* fall back to no chips */ });
    // Projects for the plan editor's "file this under" picker.
    getFounder<Array<{ project_id: string; name: string }>>("/consulting/projects")
      .then((d) => setProjects(Array.isArray(d) ? d : []))
      .catch(() => { /* filing is optional */ });
    getFounder<{ clients?: Array<Record<string, string | null>> }>("/consulting/_/active-oliver-clients")
      .then((r) => {
        const map: Record<string, string> = {};
        (r?.clients || []).forEach((c) => {
          if (!c.tenant_id) return;
          map[String(c.tenant_id).toUpperCase()] =
            (c.business_name && c.business_name !== "(unnamed)" ? c.business_name : null) ||
            c.display_name || c.company_name || String(c.tenant_id);
        });
        setTenantNames(map);
      })
      .catch(() => { /* raw ids acceptable */ });
  }, [getFounder, ready]);

  // ── Mutations ─────────────────────────────────────────────────────────────
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

  // Quick-add. No tenant_id → the API files it against the agency's own tenant,
  // which is exactly what internal work is.
  const quickCreate = async (title: string, seed: Record<string, unknown> = {}) => {
    setError(null);
    try { await postFounder("/consulting/requests", { title, ...seed }); await load(); }
    catch (e) { setError((e as Error).message || "Could not create."); }
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const clientName = (r: WorkRow) =>
    r.client_display_name || r.client_company ||
    tenantNames[String(r.tenant_id).toUpperCase()] || null;

  const assigneeName = (r: WorkRow) =>
    r.assigned_to_user_id ? `User ${String(r.assigned_to_user_id).slice(0, 8)}` : "Unassigned";

  // Columns depend on the grouping. Stage keeps its fixed, always-visible
  // buckets; the others are derived from the data plus an explicit empty bucket
  // so "nothing is assigned / nothing is in a release" is visible, not absent.
  const { columns, colLabel, groupOf } = useMemo(() => {
    if (groupBy === "stage") {
      const cols = showCancelled ? [...STAGE_ORDER, "cancelled"] : [...STAGE_ORDER];
      return {
        columns: cols as string[],
        colLabel: (c: string) => TASK_STAGE_LABELS[c] || c,
        groupOf: (r: WorkRow) => r.stage,
      };
    }
    if (groupBy === "release") {
      const cols = ["__none", ...releases.map((x) => x.release_id)];
      const nameById = Object.fromEntries(releases.map((x) => [x.release_id, x.name]));
      return {
        columns: cols,
        colLabel: (c: string) => (c === "__none" ? "Backlog" : nameById[c] || "Release"),
        groupOf: (r: WorkRow) => r.release_id || "__none",
      };
    }
    if (groupBy === "assignee") {
      const ids = Array.from(new Set(rows.map((r) => r.assigned_to_user_id || "__none")));
      return {
        columns: ids,
        colLabel: (c: string) => (c === "__none" ? "Unassigned" : `User ${c.slice(0, 8)}`),
        groupOf: (r: WorkRow) => r.assigned_to_user_id || "__none",
      };
    }
    if (groupBy === "priority") {
      return {
        columns: ["urgent", "high", "normal", "low", "__none"],
        colLabel: (c: string) => (c === "__none" ? "No priority" : c[0].toUpperCase() + c.slice(1)),
        groupOf: (r: WorkRow) => r.priority || "__none",
      };
    }
    const plats = (meta?.platforms || Object.keys(PLATFORM_LABEL));
    return {
      columns: [...plats, "__none"],
      colLabel: (c: string) => (c === "__none" ? "Unassigned platform" : PLATFORM_LABEL[c] || c),
      groupOf: (r: WorkRow) => r.platform || "__none",
    };
  }, [groupBy, showCancelled, releases, rows, meta]);

  const grouped = useMemo(() => {
    const g: Record<string, WorkRow[]> = {};
    for (const c of columns) g[c] = [];
    for (const r of rows) {
      const k = groupOf(r);
      (g[k] || (g[k] = [])).push(r);
    }
    return g;
  }, [rows, columns, groupOf]);

  const unit = meta?.estimate_unit || "hours";

  // Capacity for a set of rows. Unsized is counted SEPARATELY and never folded
  // into the total as zero — an unestimated release must read as unknown.
  const capacity = (items: WorkRow[]) => {
    let hours = 0, unsized = 0, sized = 0;
    for (const r of items) {
      if (r.estimate_hours != null) { hours += Number(r.estimate_hours); sized++; }
      else if (r.estimate_size) { sized++; }
      else unsized++;
    }
    return { hours, unsized, sized };
  };

  const totals = useMemo(() => capacity(rows), [rows]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => (r.tags || []).forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [rows]);

  // ── Card ──────────────────────────────────────────────────────────────────
  const Card = ({ r }: { r: WorkRow }) => {
    const cn = clientName(r);
    const est = r.estimate_hours != null ? `${r.estimate_hours}h`
      : r.estimate_size ? r.estimate_size : null;
    const overdue = r.due_at && new Date(r.due_at) < new Date() && r.stage !== "completed";
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
        <div className="flex items-start gap-1">
          <button
            type="button"
            onClick={() => setOpenRow(r)}
            className="block flex-1 text-left text-xs font-semibold leading-snug text-slate-800 hover:text-[#EF6C33]"
          >
            {r.title}
          </button>
          {/* Plan = the agency-only fields. Separate from the detail modal,
              which is shared with the client surface. */}
          <button
            type="button"
            onClick={() => setPlanRow(r)}
            title="Plan — estimate, release, platform, due date"
            className="flex-shrink-0 rounded border border-slate-200 px-1 py-0.5 text-[10px] text-slate-500 hover:bg-slate-50 hover:text-slate-700"
          >
            Plan
          </button>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {r.platform && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
              {PLATFORM_LABEL[r.platform] || r.platform}
            </span>
          )}
          {r.priority && r.priority !== "normal" && (
            <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
                  style={{ background: PRIORITY_TINT[r.priority] || "#64748b" }}>
              {r.priority}
            </span>
          )}
          {est && (
            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">{est}</span>
          )}
          {groupBy !== "release" && r.release_name && (
            <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
              {r.release_name}
            </span>
          )}
          {r.origin === "client" && (
            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">client</span>
          )}
          {(r.tags || []).map((t) => (
            <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">#{t}</span>
          ))}
        </div>

        {(cn || r.project_name) && (
          <div className="mt-1 truncate text-[10px] text-slate-500">
            {cn}{cn && r.project_name ? " · " : ""}{r.project_name}
          </div>
        )}

        {r.due_at && (
          <div className={`mt-1 text-[10px] ${overdue ? "font-semibold text-red-600" : "text-slate-500"}`}>
            due {new Date(r.due_at).toLocaleDateString()}
          </div>
        )}

        {/* Stage/status control — server-validated, so illegal moves are rejected */}
        <select
          value={`${r.stage}|${r.status}`}
          disabled={busyId === r.id}
          onChange={(e) => transition(r, e.target.value)}
          className="mt-2 w-full rounded border border-slate-200 bg-slate-50 px-1.5 py-1 text-[10px] text-slate-700"
        >
          <option value={`${r.stage}|${r.status}`}>
            {TASK_STAGE_LABELS[r.stage] || r.stage} — {TASK_STATUS_LABELS[r.status] || r.status}
          </option>
          {(TASK_ACTIONS[r.stage] || [])
            .filter((a) => a.value !== `${r.stage}|${r.status}`)
            .map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>

        {/* When grouping by something other than stage, expose that field too so
            the board is a way to CHANGE the grouping dimension, not just view it. */}
        {groupBy === "release" && (
          <select
            value={r.release_id || ""}
            disabled={busyId === r.id}
            onChange={(e) => patchRow(r.id, { release_id: e.target.value || null })}
            className="mt-1 w-full rounded border border-slate-200 bg-white px-1.5 py-1 text-[10px] text-slate-700"
          >
            <option value="">Backlog (no release)</option>
            {releases.map((x) => <option key={x.release_id} value={x.release_id}>{x.name}</option>)}
          </select>
        )}
        {groupBy === "priority" && (
          <select
            value={r.priority || ""}
            disabled={busyId === r.id}
            onChange={(e) => patchRow(r.id, { priority: e.target.value || null })}
            className="mt-1 w-full rounded border border-slate-200 bg-white px-1.5 py-1 text-[10px] text-slate-700"
          >
            <option value="">No priority</option>
            {(meta?.priorities || ["low", "normal", "high", "urgent"]).map((p) =>
              <option key={p} value={p}>{p}</option>)}
          </select>
        )}
        {groupBy === "platform" && (
          <select
            value={r.platform || ""}
            disabled={busyId === r.id}
            onChange={(e) => patchRow(r.id, { platform: e.target.value || null })}
            className="mt-1 w-full rounded border border-slate-200 bg-white px-1.5 py-1 text-[10px] text-slate-700"
          >
            <option value="">No platform</option>
            {(meta?.platforms || []).map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p] || p}</option>)}
          </select>
        )}
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const selectCls = "rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700";

  return (
    <div className="mx-auto space-y-4" style={{ maxWidth: "80%" }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Work</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Every piece of work — internal and client. {rows.length} shown ·{" "}
            {unit === "hours"
              ? <>{totals.hours}h estimated{totals.unsized > 0 && <> · <strong className="text-amber-700">{totals.unsized} unsized</strong></>}</>
              : <>{totals.sized} sized{totals.unsized > 0 && <> · <strong className="text-amber-700">{totals.unsized} unsized</strong></>}</>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-slate-200">
            <button type="button" onClick={() => setView("board")}
              className={`flex items-center gap-1 px-2 py-1 text-xs ${view === "board" ? "bg-slate-800 text-white" : "bg-white text-slate-600"}`}>
              <LayoutGrid className="h-3 w-3" /> Board
            </button>
            <button type="button" onClick={() => setView("list")}
              className={`flex items-center gap-1 px-2 py-1 text-xs ${view === "list" ? "bg-slate-800 text-white" : "bg-white text-slate-600"}`}>
              <ListIcon className="h-3 w-3" /> List
            </button>
          </div>
          <button type="button" onClick={() => setShowNewRelease(true)}
            className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
            + Release
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        {view === "board" && (
          <label className="flex items-center gap-1 text-xs text-slate-600">
            Group by
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} className={selectCls}>
              {(Object.keys(GROUP_LABEL) as GroupBy[]).map((g) => (
                <option key={g} value={g}>{GROUP_LABEL[g]}</option>
              ))}
            </select>
          </label>
        )}
        <select value={fPlatform} onChange={(e) => setFPlatform(e.target.value)} className={selectCls}>
          <option value="">All platforms</option>
          {(meta?.platforms || []).map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p] || p}</option>)}
        </select>
        <select value={fRelease} onChange={(e) => setFRelease(e.target.value)} className={selectCls}>
          <option value="">All releases</option>
          <option value="backlog">Backlog (no release)</option>
          {releases.map((x) => <option key={x.release_id} value={x.release_id}>{x.name}</option>)}
        </select>
        <select value={fPriority} onChange={(e) => setFPriority(e.target.value)} className={selectCls}>
          <option value="">Any priority</option>
          {(meta?.priorities || []).map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        {allTags.length > 0 && (
          <select value={fTag} onChange={(e) => setFTag(e.target.value)} className={selectCls}>
            <option value="">Any tag</option>
            {allTags.map((t) => <option key={t} value={t}>#{t}</option>)}
          </select>
        )}
        <label className="flex items-center gap-1 text-xs text-slate-600">
          <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} /> Open only
        </label>
        <label className="flex items-center gap-1 text-xs text-slate-600" title="Client-raised requests still awaiting triage">
          <input type="checkbox" checked={intakeOnly} onChange={(e) => setIntakeOnly(e.target.checked)} /> Intake
        </label>
        {view === "board" && groupBy === "stage" && (
          <label className="flex items-center gap-1 text-xs text-slate-600">
            <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} /> Cancelled
          </label>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Release capacity strip — the answer to "can I fit this in September?" */}
      {view === "board" && groupBy === "release" && releases.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {releases.map((x) => (
            <div key={x.release_id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
              <div className="font-semibold text-slate-800">
                {x.name}
                {x.target_date && <span className="ml-1 font-normal text-slate-500">· {fmtDateOnly(x.target_date)}</span>}
              </div>
              <div className="mt-0.5 text-slate-600">
                {x.task_count} tasks · {x.hours_total ?? 0}h · {x.done_count} done
                {x.unsized > 0 && <span className="ml-1 font-semibold text-amber-700">· {x.unsized} unsized</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading…</div>
      ) : view === "list" ? (
        // ── Flat list: everything open, one screen, sortable by eye ──────────
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
            <QuickAdd onCreate={(t) => quickCreate(t)} placeholder="+ Add a task and press Enter…" />
          </div>
          {rows.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">Nothing matches these filters.</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Platform</th>
                  <th className="px-3 py-2">Stage</th>
                  <th className="px-3 py-2">Release</th>
                  <th className="px-3 py-2">Est</th>
                  <th className="px-3 py-2">Due</th>
                  <th className="px-3 py-2">Client</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => setOpenRow(r)}
                        className="text-left font-medium text-slate-800 hover:text-[#EF6C33]">
                        {r.title}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{r.platform ? PLATFORM_LABEL[r.platform] : "—"}</td>
                    <td className="px-3 py-2 text-slate-600">{TASK_STAGE_LABELS[r.stage] || r.stage}</td>
                    <td className="px-3 py-2 text-slate-600">{r.release_name || "—"}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {r.estimate_hours != null ? `${r.estimate_hours}h` : r.estimate_size || "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{r.due_at ? new Date(r.due_at).toLocaleDateString() : "—"}</td>
                    <td className="px-3 py-2 text-slate-600">{clientName(r) || "Internal"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="flex items-start gap-3" style={{ minWidth: `${columns.length * 252}px` }}>
            {columns.map((col) => {
              const items = grouped[col] || [];
              const cap = capacity(items);
              const tint = groupBy === "stage" ? STAGE_TINT[col]
                : groupBy === "priority" ? (PRIORITY_TINT[col] || "#cbd5e1") : "#cbd5e1";
              // What a card created in this column should inherit.
              const seed: Record<string, unknown> =
                groupBy === "release" && col !== "__none" ? { release_id: col }
                : groupBy === "priority" && col !== "__none" ? { priority: col }
                : groupBy === "platform" && col !== "__none" ? { platform: col }
                : {};
              return (
                <div key={col} className="w-60 flex-shrink-0 rounded-xl border border-slate-200 bg-slate-50/80">
                  <div className="flex items-center justify-between rounded-t-xl border-b-2 bg-white px-3 py-2"
                       style={{ borderBottomColor: tint }}>
                    <span className="text-xs font-semibold text-slate-700">{colLabel(col)}</span>
                    <span className="text-[10px] text-slate-500">
                      {items.length}
                      {unit === "hours" && cap.hours > 0 && ` · ${cap.hours}h`}
                      {cap.unsized > 0 && <span className="text-amber-700"> · {cap.unsized}?</span>}
                    </span>
                  </div>
                  <div className="space-y-2 p-2">
                    {/* Quick-add only where a new card makes sense: New stage, or
                        any non-stage grouping where the column IS the field. */}
                    {(groupBy !== "stage" || col === "new") && (
                      <QuickAdd onCreate={(t) => quickCreate(t, seed)} placeholder="+ Add…" />
                    )}
                    {items.map((r) => <Card key={r.id} r={r} />)}
                    {items.length === 0 && (
                      <div className="py-4 text-center text-[11px] text-slate-400">Nothing here</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {openRow && (
        <TaskDetailModal
          task={openRow as never}
          deliverables={openRow.deliverables || []}
          onClose={() => setOpenRow(null)}
          onChanged={() => { setOpenRow(null); load(); }}
        />
      )}

      {planRow && (
        <PlanModal
          row={planRow}
          releases={releases}
          meta={meta}
          projects={projects}
          onClose={() => setPlanRow(null)}
          onSaved={() => { setPlanRow(null); load(); loadReleases(); }}
        />
      )}

      {showNewRelease && (
        <NewReleaseModal
          onClose={() => setShowNewRelease(false)}
          onCreated={() => { setShowNewRelease(false); loadReleases(); }}
        />
      )}
    </div>
  );
}

// ── Plan editor ─────────────────────────────────────────────────────────────
// Deliberately NOT an extension of TaskDetailModal: that component is shared
// with the CLIENT-facing modal, and agency planning fields must never leak onto
// a client surface. This is agency-only and lives with the agency board.
function PlanModal({
  row, releases, meta, projects, onClose, onSaved,
}: {
  row: WorkRow;
  releases: ReleaseRow[];
  meta: WorkMeta | null;
  projects: Array<{ project_id: string; name: string }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { patchFounder, postFounder } = useOliverApi();
  const unit = meta?.estimate_unit || "hours";
  const [platform, setPlatform] = useState(row.platform || "");
  const [priority, setPriority] = useState(row.priority || "");
  const [hours, setHours] = useState(row.estimate_hours != null ? String(row.estimate_hours) : "");
  const [size, setSize] = useState(row.estimate_size || "");
  const [dueAt, setDueAt] = useState(row.due_at ? String(row.due_at).slice(0, 10) : "");
  const [releaseId, setReleaseId] = useState(row.release_id || "");
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
        // Blank stays NULL — "not sized", never 0.
        estimate_hours: hours === "" ? null : Number(hours),
        estimate_size: size || null,
        due_at: dueAt || null,
        release_id: releaseId || null,
        project_id: projectId || null,
      });
      if (newTag.trim()) {
        await postFounder(`/consulting/requests/${row.id}/tags`, { tag: newTag.trim() });
      }
      onSaved();
    } catch (e) { setErr((e as Error).message || "Save failed."); }
    finally { setBusy(false); }
  };

  const fieldCls = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm";
  const labelCls = "mb-1 block text-xs font-medium text-slate-600";

  return (
    <IadmModal open onClose={onClose} product="oliver" title="Plan" subtitle={row.title} size="md">
      <div className="space-y-3 p-1">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Platform</label>
            <select value={platform} onChange={(e) => setPlatform(e.target.value)} className={fieldCls}>
              <option value="">—</option>
              {(meta?.platforms || []).map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p] || p}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className={fieldCls}>
              <option value="">—</option>
              {(meta?.priorities || []).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>
              Estimate {unit === "hours" ? "(hours)" : "(size)"}
            </label>
            {unit === "hours" ? (
              <input type="number" min="0" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)}
                placeholder="leave blank if not sized" className={fieldCls} />
            ) : (
              <select value={size} onChange={(e) => setSize(e.target.value)} className={fieldCls}>
                <option value="">not sized</option>
                {(meta?.estimate_sizes || []).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            <p className="mt-1 text-[11px] text-slate-500">Blank means <strong>not sized</strong> — never counted as zero.</p>
          </div>
          <div>
            <label className={labelCls}>Due date</label>
            <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className={fieldCls} />
          </div>
        </div>

        <div>
          <label className={labelCls}>Release</label>
          <select value={releaseId} onChange={(e) => setReleaseId(e.target.value)} className={fieldCls}>
            <option value="">Backlog (no release)</option>
            {releases.map((x) => <option key={x.release_id} value={x.release_id}>{x.name}</option>)}
          </select>
        </div>

        <div>
          <label className={labelCls}>Project</label>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={fieldCls}>
            <option value="">No project</option>
            {projects.map((p) => <option key={p.project_id} value={p.project_id}>{p.name}</option>)}
          </select>
        </div>

        <div>
          <label className={labelCls}>Add tag</label>
          <input value={newTag} onChange={(e) => setNewTag(e.target.value)}
            placeholder="gate, blocked-on-data…" className={fieldCls} />
          {(row.tags || []).length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {(row.tags || []).map((t) => (
                <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">#{t}</span>
              ))}
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
          <input value={name} onChange={(e) => setName(e.target.value)}
            placeholder="September Release A"
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Target date</label>
          <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          <p className="mt-1 text-[11px] text-slate-500">
            Optional. Releases are optional entirely — work with no release sits in Backlog.
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
