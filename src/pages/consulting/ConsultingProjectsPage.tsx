// ConsultingProjectsPage — F1 (Consulting Rework, 2026-06-25)
//
// Founder-facing project LIST view. Replaces the old card-grid Board page
// (ConsultingProjectsBoardPage.tsx) as the canonical project surface.
// The Board page is intentionally LEFT IN PLACE behind the legacy
// `consulting_projects` service key so any existing bookmarks / deep links
// keep resolving; the new list view ships under `consulting_projects_v2`
// and is wired into the SubNav as "Projects".
//
// Locked Brandon decisions (2026-06-25, full F1 brief):
//   • List view, sorted by most recent activity (updated_at DESC)
//   • Status filter pills: Closed | Completed | Action Needed | Awaiting
//     Client Response | All
//   • Client dropdown — searchable, includes 'Internal' option that maps
//     to linked_tenant_id IS NULL (server-side via /consulting/projects
//     filter)
//   • Category dropdown — populated from /consulting/categories
//   • Closed projects auto-hidden — pill default ON, click to surface
//     (7-day grace already enforced server-side by the API)
//   • "+ New Project" → NewProjectModal (pick category → name + client →
//     POST /consulting/projects → redirect to project detail).
//   • "+ New Category" → disabled with tooltip "Coming in F6"
//   • Row click → opens ConsultingProjectModal (sibling-agent build).
//     Until that ships we navigate to the Project Workspace page so
//     deep-link behaviour stays useful even before the modal lands.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Folder, Plus, Search, AlertCircle, Clock, Pencil } from "lucide-react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { IadmModal } from "../../components/IadmModal";
import {
  ConsultingCategoryBuilderModal,
  iconComponentFor,
  type CategoryShape,
} from "./ConsultingCategoryBuilderModal";

// ── Types ───────────────────────────────────────────────────────────────

// Project.status values come from the consulting.project schema. Brandon's
// F1 brief defines five filter pills (Closed / Completed / Action Needed /
// Awaiting Client Response / All); those are derived/composite buckets, not
// raw status values. Mapping is handled in computePillForProject below so
// future status additions (planned in F2-F6) won't break the filter.
type RawProjectStatus =
  | "active"
  | "on_hold"
  | "awaiting_client"
  | "action_needed"
  | "completed"
  | "closed"
  | "cancelled";

type StatusPill =
  | "all"
  | "closed"
  | "completed"
  | "action_needed"
  | "awaiting_client";

interface Project {
  project_id: string;
  name: string;
  status: RawProjectStatus | string;
  category_name?: string | null;
  category_id?: string | null;
  client_name?: string | null;
  client_email?: string | null;
  linked_tenant_id?: string | null;
  owner_user_id?: string | null;
  updated_at: string;
  current_milestone_name?: string | null;
  milestones_complete_count?: number;
  milestones_total_count?: number;
}

interface Category {
  category_id: string;
  slug: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  milestone_template_json?: Array<{ name: string; sort_order?: number; description?: string }>;
  // F6 — extra fields surfaced so the Category Builder modal can populate
  // edit mode without a second round-trip. Optional because the GET list
  // endpoint hasn't always returned them on older deployments.
  default_duration_days?: number | null;
  default_budget_cap_cents?: number | null;
  is_system_seed?: boolean;
  is_archived?: boolean;
}

// Sentinel slug used by the client dropdown for "Internal" projects
// (linked_tenant_id IS NULL). Kept as a sentinel rather than empty-string so
// the dropdown's default "All clients" state remains distinct from explicit
// "Internal" filtering.
const CLIENT_INTERNAL_SENTINEL = "__internal__";

// ── Pill mapping ────────────────────────────────────────────────────────
// Map a raw project.status → which filter pill bucket it belongs in. The
// filter UI passes the pill key to the API as `?status=...` for the
// non-composite buckets (closed / completed). The composite buckets
// (action_needed / awaiting_client) are filtered client-side from the
// loaded set because they're derived states the server doesn't index yet.
function computePillForProject(p: Project): StatusPill {
  const s = String(p.status || "").toLowerCase();
  if (s === "closed" || s === "cancelled") return "closed";
  if (s === "completed") return "completed";
  if (s === "action_needed") return "action_needed";
  if (s === "awaiting_client") return "awaiting_client";
  // Default — active / on_hold / unknown statuses live under "all" and the
  // user can spot them via the status badge column.
  return "all";
}

const PILLS: Array<{ key: StatusPill; label: string }> = [
  { key: "all", label: "All" },
  { key: "action_needed", label: "Action Needed" },
  { key: "awaiting_client", label: "Awaiting Client Response" },
  { key: "completed", label: "Completed" },
  { key: "closed", label: "Closed" },
];

// ── Helpers ─────────────────────────────────────────────────────────────
function fmtRelative(iso?: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diffMs = Date.now() - t;
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function statusBadgeColor(status: string): { bg: string; fg: string; label: string } {
  const s = String(status || "").toLowerCase();
  switch (s) {
    case "active":            return { bg: "#dbeafe", fg: "#1d4ed8", label: "Active" };
    case "on_hold":           return { bg: "#fef3c7", fg: "#a16207", label: "On Hold" };
    case "awaiting_client":   return { bg: "#fef3c7", fg: "#a16207", label: "Awaiting Client" };
    case "action_needed":     return { bg: "#fee2e2", fg: "#b91c1c", label: "Action Needed" };
    case "completed":         return { bg: "#d1fae5", fg: "#047857", label: "Completed" };
    case "closed":            return { bg: "#e2e8f0", fg: "#475569", label: "Closed" };
    case "cancelled":         return { bg: "#e2e8f0", fg: "#475569", label: "Cancelled" };
    default:                  return { bg: "#e2e8f0", fg: "#334155", label: s || "—" };
  }
}

// ── Page ────────────────────────────────────────────────────────────────

export function ConsultingProjectsPage() {
  const { get, ready } = useOliverApi();
  const navigate = useNavigate();

  const [projects, setProjects] = useState<Project[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusPill, setStatusPill] = useState<StatusPill>("all");
  // Auto-hide Closed projects unless the user clicks the Closed pill (or
  // explicitly enables Show closed via the toggle). The toggle UI mirrors
  // SCOPE_WORKING.md F1: pill default ON, click to show.
  const [showClosed, setShowClosed] = useState(false);
  const [clientFilter, setClientFilter] = useState<string>(""); // tenant_id, sentinel, or ""
  const [clientSearch, setClientSearch] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [showCreate, setShowCreate] = useState(false);

  // F6 — Category Builder modal state. `editing` is null for "+ New
  // Category", or carries the existing CategoryShape for the inline edit
  // button on each category chip. `categoriesListOpen` controls the
  // founder-only Manage Categories panel.
  const [editingCategory, setEditingCategory] = useState<CategoryShape | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showManageCategories, setShowManageCategories] = useState(false);

  // Load projects whenever filter inputs change. Brandon's "fetch-once-per-
  // page" rule applies to the page mount, but filter changes are user-
  // initiated refreshes so the refetch is allowed.
  const loadProjects = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      // Map composite pills to API status param where possible. Only
      // closed/completed have direct server-side equivalents — action_needed
      // and awaiting_client are filtered client-side after fetch.
      if (statusPill === "closed") qs.set("status", "closed");
      else if (statusPill === "completed") qs.set("status", "completed");
      if (categoryId) qs.set("category_id", categoryId);
      if (clientSearch.trim()) qs.set("client_search", clientSearch.trim());
      if (showClosed || statusPill === "closed") qs.set("include_closed", "1");

      const r = await get<{ data: Project[] }>(`/consulting/projects?${qs.toString()}`);
      const list = Array.isArray(r?.data) ? r.data : [];
      setProjects(list);
    } catch (e) {
      setError((e as Error).message);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [get, ready, statusPill, categoryId, clientSearch, showClosed]);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  // Categories load on mount + on demand (after a category create/edit
  // via the Category Builder modal so the picker stays in sync).
  const reloadCategories = useCallback(() => {
    if (!ready) return Promise.resolve();
    return get<{ data: Category[] }>("/consulting/categories")
      .then((r) => { setCategories(Array.isArray(r?.data) ? r.data : []); })
      .catch(() => { setCategories([]); });
  }, [get, ready]);

  useEffect(() => {
    let cancelled = false;
    if (!ready) return;
    get<{ data: Category[] }>("/consulting/categories")
      .then((r) => { if (!cancelled) setCategories(Array.isArray(r?.data) ? r.data : []); })
      .catch(() => { if (!cancelled) setCategories([]); });
    return () => { cancelled = true; };
  }, [get, ready]);

  // Build the client dropdown from loaded projects. We derive distinct
  // client names from the rows we already have (no separate /clients fetch
  // — the consulting/projects payload already carries client_name). Sorted
  // alphabetically with the "Internal" sentinel surfaced when at least one
  // project has linked_tenant_id IS NULL.
  const clientOptions = useMemo(() => {
    const seen = new Map<string, string>();
    let hasInternal = false;
    for (const p of projects) {
      if (!p.linked_tenant_id) { hasInternal = true; continue; }
      const name = p.client_name || p.client_email || "(unnamed)";
      seen.set(p.linked_tenant_id, name);
    }
    const arr = Array.from(seen.entries())
      .map(([tenant_id, name]) => ({ value: tenant_id, label: name }))
      .sort((a, b) => a.label.localeCompare(b.label));
    if (hasInternal) arr.unshift({ value: CLIENT_INTERNAL_SENTINEL, label: "Internal" });
    return arr;
  }, [projects]);

  // Final visible rows — apply client + composite pill filters that aren't
  // handled server-side. Always sort by updated_at DESC; the API already
  // returns in that order but we re-sort defensively in case a refetch
  // shuffled things.
  const visibleProjects = useMemo(() => {
    let out = projects.slice();
    if (clientFilter === CLIENT_INTERNAL_SENTINEL) {
      out = out.filter((p) => !p.linked_tenant_id);
    } else if (clientFilter) {
      out = out.filter((p) => p.linked_tenant_id === clientFilter);
    }
    if (statusPill === "action_needed" || statusPill === "awaiting_client") {
      out = out.filter((p) => computePillForProject(p) === statusPill);
    }
    // Auto-hide closed projects unless the user explicitly asks for them
    // via the pill or the show-closed toggle (mirrors the SCOPE rule).
    if (!showClosed && statusPill !== "closed") {
      out = out.filter((p) => computePillForProject(p) !== "closed");
    }
    out.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    return out;
  }, [projects, clientFilter, statusPill, showClosed]);

  function handleRowClick(p: Project) {
    // ConsultingProjectModal is being built in a sibling agent. Until it
    // lands, route to the Project Workspace page so the row remains useful
    // — the workspace already loads /consulting/projects/:id. Once the
    // modal ships, swap this for setOpenProjectId(p.project_id) + render
    // the modal here.
    navigate(`/app/services/consulting_project_workspace?project_id=${encodeURIComponent(p.project_id)}`);
  }

  function handleCreated(projectId: string) {
    setShowCreate(false);
    // Same navigation contract as row-click so the founder lands on the
    // same surface whether they create or open.
    navigate(`/app/services/consulting_project_workspace?project_id=${encodeURIComponent(projectId)}`);
  }

  return (
    <OliverPageWrapper title="Projects" subtitle="IA Consulting · Project hub" error={error} loading={false}>
      <div className="space-y-3">
        {/* Header row: title + actions */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Folder className="h-5 w-5 text-slate-500" />
              Projects
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Every active engagement, sorted by recent activity.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#0C4A60] text-white text-xs font-semibold hover:bg-[#0a3d50]"
            >
              <Plus className="h-3.5 w-3.5" /> New Project
            </button>
            <button
              type="button"
              onClick={() => { setEditingCategory(null); setShowCategoryModal(true); }}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 bg-white"
            >
              <Plus className="h-3.5 w-3.5" /> New Category
            </button>
            <button
              type="button"
              onClick={() => setShowManageCategories(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 bg-white"
              title="Edit or archive existing categories"
            >
              <Pencil className="h-3.5 w-3.5" /> Manage Categories
            </button>
          </div>
        </div>

        {/* Filter row 1 — status pills + show-closed toggle */}
        <div className="flex items-center gap-2 flex-wrap">
          {PILLS.map((p) => {
            const active = statusPill === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setStatusPill(p.key)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                  active
                    ? "bg-[#0C4A60] text-white border border-[#0C4A60]"
                    : "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50"
                }`}
              >
                {p.label}
              </button>
            );
          })}
          <label className="ml-2 inline-flex items-center gap-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={showClosed}
              onChange={(e) => setShowClosed(e.target.checked)}
              className="rounded border-slate-300"
            />
            Show closed
          </label>
        </div>

        {/* Filter row 2 — client + category + client-search */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">Client</label>
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="rounded border border-slate-300 px-2 py-1 text-xs bg-white"
            >
              <option value="">All clients</option>
              {clientOptions.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="rounded border border-slate-300 px-2 py-1 text-xs bg-white"
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.category_id} value={c.category_id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5 flex-1 min-w-[200px] max-w-[320px] ml-auto">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <input
              type="search"
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              placeholder="Search by client name or email…"
              className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs bg-white"
            />
          </div>
          <span className="text-[11px] text-slate-500">
            {visibleProjects.length} project{visibleProjects.length === 1 ? "" : "s"}
          </span>
        </div>

        {/* List body */}
        {loading ? (
          <div className="card" style={{ padding: 24, color: "#5A7A8A", fontSize: 13 }}>Loading projects…</div>
        ) : visibleProjects.length === 0 ? (
          <div className="rounded-xl bg-slate-50 border border-slate-200 px-6 py-12 text-center">
            <div className="text-sm font-semibold text-slate-700">No projects match these filters.</div>
            <p className="text-xs text-slate-500 mt-1">
              Adjust filters above or click <strong>+ New Project</strong> to start one.
            </p>
          </div>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            <table className="tbl" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Project</th>
                  <th style={{ textAlign: "left" }}>Category</th>
                  <th style={{ textAlign: "left" }}>Client</th>
                  <th style={{ textAlign: "left" }}>Status</th>
                  <th style={{ textAlign: "left" }}>Current milestone</th>
                  <th style={{ textAlign: "right" }}>Updated</th>
                </tr>
              </thead>
              <tbody>
                {visibleProjects.map((p) => {
                  const badge = statusBadgeColor(p.status);
                  const milestoneTotal = p.milestones_total_count ?? 0;
                  const milestoneDone = p.milestones_complete_count ?? 0;
                  return (
                    <tr
                      key={p.project_id}
                      onClick={() => handleRowClick(p)}
                      style={{ cursor: "pointer" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#F8FAFC"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
                    >
                      <td>
                        <div className="text-sm font-semibold text-slate-900">{p.name}</div>
                      </td>
                      <td>
                        <div className="text-xs text-slate-600">{p.category_name || "—"}</div>
                      </td>
                      <td>
                        <div className="text-xs text-slate-700">
                          {p.linked_tenant_id ? (p.client_name || p.client_email || "(unnamed)") : (
                            <span className="italic text-slate-500">Internal</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span
                          style={{
                            background: badge.bg,
                            color: badge.fg,
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: "0.04em",
                            padding: "2px 8px",
                            borderRadius: 99,
                            textTransform: "uppercase",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td>
                        <div className="text-xs text-slate-700">
                          {p.current_milestone_name || "—"}
                          {milestoneTotal > 0 && (
                            <span className="ml-1 text-[10px] text-slate-500">
                              ({milestoneDone}/{milestoneTotal})
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div className="text-xs text-slate-600 inline-flex items-center gap-1">
                          <Clock className="h-3 w-3 text-slate-400" />
                          {fmtRelative(p.updated_at)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <NewProjectModal
          categories={categories}
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}

      {/* F6 — Category Builder modal. Opens for both "+ New Category"
          (editingCategory=null) and the inline Edit chip on each category
          tile in the Manage Categories panel. Refreshes the picker list
          after save so the New Project modal sees the new template
          immediately. */}
      {showCategoryModal && (
        <ConsultingCategoryBuilderModal
          category={editingCategory}
          onClose={() => { setShowCategoryModal(false); setEditingCategory(null); }}
          onSaved={async () => {
            setShowCategoryModal(false);
            setEditingCategory(null);
            await reloadCategories();
          }}
          onArchived={async () => {
            setShowCategoryModal(false);
            setEditingCategory(null);
            await reloadCategories();
          }}
        />
      )}

      {/* F6 — Manage Categories sheet. Lists every (non-archived) category
          with its icon + slug + "edit" + (system seed indicator). Clicking
          a row opens the Category Builder in edit mode. Kept as a separate
          modal from the Builder so we don't blow up the Builder canvas with
          a list. */}
      {showManageCategories && (
        <ManageCategoriesModal
          categories={categories}
          onClose={() => setShowManageCategories(false)}
          onEdit={(c) => {
            setShowManageCategories(false);
            setEditingCategory({
              category_id: c.category_id,
              slug: c.slug,
              name: c.name,
              description: c.description,
              icon: c.icon,
              milestone_template_json: c.milestone_template_json,
              default_duration_days: c.default_duration_days,
              default_budget_cap_cents: c.default_budget_cap_cents,
              is_system_seed: c.is_system_seed,
              is_archived: c.is_archived,
            });
            setShowCategoryModal(true);
          }}
          onCreateNew={() => {
            setShowManageCategories(false);
            setEditingCategory(null);
            setShowCategoryModal(true);
          }}
        />
      )}
    </OliverPageWrapper>
  );
}

// ── ManageCategoriesModal ───────────────────────────────────────────────
// Lightweight read-only listing of every category currently in the
// Project Hub picker, with an inline Edit button per row. Clicking Edit
// hands control off to the Category Builder modal (full edit form). The
// archival action lives inside the Builder so it's gated by the same
// confirmation flow as edits.
function ManageCategoriesModal({
  categories, onClose, onEdit, onCreateNew,
}: {
  categories: Category[];
  onClose: () => void;
  onEdit: (c: Category) => void;
  onCreateNew: () => void;
}) {
  // Sort: custom (non-seed) categories first so newly-added ones rise to
  // the top, then alphabetical within each bucket.
  const sorted = useMemo(() => {
    const list = categories.slice();
    list.sort((a, b) => {
      const aSeed = a.is_system_seed ? 1 : 0;
      const bSeed = b.is_system_seed ? 1 : 0;
      if (aSeed !== bSeed) return aSeed - bSeed;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [categories]);

  return (
    <IadmModal
      open
      onClose={onClose}
      product="oliver"
      eyebrow="CATEGORIES"
      title="Manage project categories"
      size="info"
    >
      <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-600">
            System seeds can be edited but not archived. Custom categories can be archived
            (soft-delete) when no active project uses them.
          </p>
          <button
            type="button"
            onClick={onCreateNew}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#0C4A60] text-white text-xs font-semibold"
          >
            <Plus className="h-3 w-3" /> New
          </button>
        </div>

        {sorted.length === 0 ? (
          <div className="text-xs text-slate-500 italic py-8 text-center">
            No categories yet. Click <strong>New</strong> to add one.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {sorted.map((c) => {
              const Icon = iconComponentFor(c.icon);
              return (
                <li
                  key={c.category_id}
                  className="flex items-center gap-2 p-2 rounded border border-slate-200 hover:border-slate-300 bg-white"
                >
                  <div className="flex items-center justify-center h-7 w-7 rounded bg-slate-50 text-slate-700">
                    {Icon ? <Icon className="h-4 w-4" /> : <Folder className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">{c.name}</div>
                    <div className="text-[10px] text-slate-500 truncate">
                      <span className="font-mono">{c.slug}</span>
                      {c.is_system_seed && <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">SYSTEM</span>}
                      {Array.isArray(c.milestone_template_json) && c.milestone_template_json.length > 0 && (
                        <span className="ml-2 text-slate-500">{c.milestone_template_json.length} milestone{c.milestone_template_json.length === 1 ? "" : "s"}</span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onEdit(c)}
                    className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50 inline-flex items-center gap-1"
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex justify-end pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded border border-slate-300 text-xs font-semibold text-slate-700 bg-white"
          >
            Close
          </button>
        </div>
      </div>
    </IadmModal>
  );
}

// ── NewProjectModal ─────────────────────────────────────────────────────
// Step 1: pick category. Step 2: name + client. Step 3 (skipped): server
// clones the milestone template, returns the new project_id, and the page
// navigates to the project detail surface.

interface ClientPickerRow {
  tenant_id: string;
  business_name: string;
}

function NewProjectModal({
  categories, onClose, onCreated,
}: {
  categories: Category[];
  onClose: () => void;
  onCreated: (projectId: string) => void;
}) {
  const { get, post } = useOliverApi();

  const [step, setStep] = useState<"category" | "details">("category");
  const [categoryId, setCategoryId] = useState<string>("");
  const [name, setName] = useState("");
  const [clientTenantId, setClientTenantId] = useState<string>("");
  const [description, setDescription] = useState("");
  const [clients, setClients] = useState<ClientPickerRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Reuse the consulting-tickets client list endpoint — same founder-gated
  // view of every linked client tenant. Avoids inventing a duplicate
  // /consulting/_/clients route.
  useEffect(() => {
    let cancelled = false;
    get<{ data: { clients: Array<{ tenant_id: string; business_name: string }> } }>("/consulting-tickets/_/clients")
      .then((r) => {
        if (cancelled) return;
        const list = r?.data?.clients || [];
        setClients(list.map((c) => ({ tenant_id: c.tenant_id, business_name: c.business_name })));
      })
      .catch(() => { if (!cancelled) setClients([]); });
    return () => { cancelled = true; };
  }, [get]);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.category_id === categoryId) || null,
    [categories, categoryId],
  );

  async function submit() {
    setErr(null);
    if (!categoryId) { setErr("Pick a category first."); setStep("category"); return; }
    if (!name.trim()) { setErr("Project name is required."); return; }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        category_id: categoryId,
        name: name.trim(),
      };
      if (description.trim()) body.description = description.trim();
      // Empty client tenant id ⇒ Internal project (linked_tenant_id NULL).
      if (clientTenantId && clientTenantId !== CLIENT_INTERNAL_SENTINEL) {
        body.linked_tenant_id = clientTenantId;
      }
      const r = await post<{ data: { project: { project_id: string } } }>("/consulting/projects", body);
      const newId = r?.data?.project?.project_id;
      if (!newId) throw new Error("Server did not return a project_id.");
      onCreated(newId);
    } catch (e) {
      setErr((e as Error).message || "Failed to create project.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <IadmModal
      open
      onClose={onClose}
      product="oliver"
      eyebrow="NEW PROJECT"
      title={step === "category" ? "Pick a category" : "Project details"}
      size="info"
    >
      <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
        {err && (
          <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2 inline-flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" /> {err}
          </div>
        )}

        {step === "category" ? (
          <>
            <p className="text-sm text-slate-600">
              Choose the project category — the milestone template clones from this pick.
            </p>
            {categories.length === 0 ? (
              <div className="text-xs text-slate-500 italic">Loading categories…</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {categories.map((c) => {
                  const active = categoryId === c.category_id;
                  return (
                    <button
                      key={c.category_id}
                      type="button"
                      onClick={() => setCategoryId(c.category_id)}
                      className={`text-left rounded-lg border p-3 transition ${
                        active
                          ? "border-[#0C4A60] bg-[#0C4A60]/5"
                          : "border-slate-200 hover:border-slate-300 bg-white"
                      }`}
                    >
                      <div className="text-sm font-semibold text-slate-900">{c.name}</div>
                      {c.description && (
                        <div className="text-xs text-slate-500 mt-1 line-clamp-2">{c.description}</div>
                      )}
                      {Array.isArray(c.milestone_template_json) && c.milestone_template_json.length > 0 && (
                        <div className="text-[10px] text-slate-500 mt-1.5">
                          Milestones: {c.milestone_template_json.map((m) => m.name).join(" → ")}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded border border-slate-300 text-xs font-semibold text-slate-700 bg-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!categoryId}
                onClick={() => setStep("details")}
                className="px-3 py-1.5 rounded bg-[#0C4A60] text-white text-xs font-semibold disabled:opacity-50"
              >
                Next: details
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-xs text-slate-500">
              Category: <strong className="text-slate-700">{selectedCategory?.name || "—"}</strong>
              <button
                type="button"
                onClick={() => setStep("category")}
                className="ml-2 underline text-[11px] text-slate-500 hover:text-slate-700"
              >
                Change
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Project name *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Briarwood Dental Spring Brand Refresh"
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Client</label>
              <select
                value={clientTenantId}
                onChange={(e) => setClientTenantId(e.target.value)}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm bg-white"
              >
                <option value="">Internal (no client tenant)</option>
                {clients.map((c) => (
                  <option key={c.tenant_id} value={c.tenant_id}>{c.business_name}</option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                Leave as Internal for IA-only projects (logo work, internal tooling, etc.).
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Description (optional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div className="flex justify-between gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setStep("category")}
                className="px-3 py-1.5 rounded border border-slate-300 text-xs font-semibold text-slate-700 bg-white"
              >
                Back
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 rounded border border-slate-300 text-xs font-semibold text-slate-700 bg-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submitting || !name.trim()}
                  onClick={submit}
                  className="px-3 py-1.5 rounded bg-[#0C4A60] text-white text-xs font-semibold disabled:opacity-50"
                >
                  {submitting ? "Creating…" : "Create project"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </IadmModal>
  );
}

export default ConsultingProjectsPage;
