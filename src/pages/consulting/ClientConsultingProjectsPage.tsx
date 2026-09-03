// ClientConsultingProjectsPage — F-Client.Consulting (2026-06-29).
//
// CLIENT-facing projects list. Mounts under /app/consulting/projects inside
// the ClientConsultingLayout. Reads from /consulting-projects (lumen
// schema, NOT founder-gated — see oliver-api/routes/consultingProjects.js
// :101 which filters by `provider_tenant_id = @tid OR client_tenant_id =
// @tid`, so a client tenant naturally sees only their own rows).
//
// Why /consulting-projects and not /consulting/projects:
//   /consulting/projects (consulting.js:338) is `requireFounder`-gated
//   today. The dual-schema reality from the audit context is real — the
//   client surface uses the LUMEN model because that's the one that ships
//   client-readable data via the existing endpoint. When the new
//   consulting.project schema grows a client-readable list endpoint, this
//   page swaps to that without changing the URL shape.
//
// Read-only card grid: name, project_type, status, current phase. Click
// → ClientConsultingProjectModal which shows phases + deliverables tab.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Folder, Clock } from "lucide-react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { ClientConsultingProjectModal } from "../../components/consulting/ClientConsultingProjectModal";
import { BookConsultationCTA } from "../../components/consulting/BookConsultationCTA";

interface ClientProject {
  project_id: string;
  project_number: string;
  title: string;
  status: string;
  project_type: string;
  project_type_display?: string | null;
  project_type_color?: string | null;
  current_phase_name?: string | null;
  phase_count?: number;
  phases_completed?: number;
  updated_at: string;
  created_at?: string;
  target_completion_date?: string | null;
  engagement_type?: string | null;
}

// Row shape returned by the NEW consulting.* list endpoint
// (GET /consulting/projects). Deliberately separate from ClientProject: the
// two models name the same concepts differently, and conflating them is what
// made this card render a blank title and "Current phase: —".
interface NewModelProject {
  project_id: string;
  name?: string | null;
  status: string;
  category_name?: string | null;
  client_name?: string | null;
  current_milestone_name?: string | null;
  milestones_total_count?: number;
  milestones_complete_count?: number;
  updated_at: string;
  created_at?: string;
}

function normalizeProject(p: NewModelProject): ClientProject {
  return {
    project_id: p.project_id,
    project_number: "",
    title: p.name || "Untitled project",
    status: p.status,
    project_type: p.category_name || "",
    project_type_display: p.category_name || null,
    project_type_color: null,
    current_phase_name: p.current_milestone_name || null,
    phase_count: p.milestones_total_count ?? 0,
    phases_completed: p.milestones_complete_count ?? 0,
    updated_at: p.updated_at,
    created_at: p.created_at,
  };
}

// Status → badge color. Mirrors ConsultingProjectsPage helper but trimmed
// to the lumen.consulting_project status vocabulary (active/on_hold/
// completed/cancelled — see migration 072).
function statusBadge(status: string): { bg: string; fg: string; label: string } {
  switch (String(status || "").toLowerCase()) {
    case "active":    return { bg: "#dbeafe", fg: "#1d4ed8", label: "Active" };
    case "on_hold":   return { bg: "#fef3c7", fg: "#a16207", label: "On Hold" };
    case "paused":    return { bg: "#fef3c7", fg: "#a16207", label: "Paused" };
    case "blocked":   return { bg: "#fee2e2", fg: "#b91c1c", label: "Blocked" };
    case "awaiting_client_response": return { bg: "#fef3c7", fg: "#a16207", label: "Awaiting You" };
    case "awaiting_internal_review": return { bg: "#e0e7ff", fg: "#3730a3", label: "In Review" };
    case "payment_required": return { bg: "#fce7f3", fg: "#9d174d", label: "Payment Required" };
    case "completed": return { bg: "#d1fae5", fg: "#047857", label: "Completed" };
    case "closed":    return { bg: "#e2e8f0", fg: "#475569", label: "Closed" };
    case "cancelled": return { bg: "#e2e8f0", fg: "#475569", label: "Cancelled" };
    default:          return { bg: "#e2e8f0", fg: "#334155", label: status || "—" };
  }
}

function fmtRelative(iso?: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function ClientConsultingProjectsPage() {
  const { get, ready } = useOliverApi();
  const [projects, setProjects] = useState<ClientProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  // Default to ACTIVE projects; completed/cancelled one click away.
  const [filter, setFilter] = useState<"active" | "all" | "completed" | "cancelled">("active");

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      // G3-S4: primary read is the new consulting.* endpoint
      // (oliver-api GET /consulting/projects). We fall back to the legacy
      // LUMEN /consulting-projects list on any error to keep tenants on
      // the old schema rendering during rollout.
      try {
        // GET /consulting/projects returns { data: [...] } — useOliverApi
        // auto-unwraps `data`, so the result IS the array. The old
        // `{ projects }` read left r.projects undefined and silently fell
        // back to the legacy LUMEN fork, which is why a NEW-model project
        // (e.g. RII "Post AI Website Design Updates") never rendered here.
        const r = await get<NewModelProject[] | { projects?: ClientProject[] }>("/consulting/projects");
        const rows = Array.isArray(r) ? r : r?.projects;
        if (Array.isArray(rows)) {
          // The new consulting.* model uses different field names than this
          // card was written for (name/current_milestone_name/
          // milestones_*_count vs title/current_phase_name/phase_*). Normalize
          // here so the card renders a real title and phase instead of blanks.
          setProjects(rows.map(normalizeProject));
          return;
        }
      } catch (newEndpointErr) {
        // eslint-disable-next-line no-console
        console.debug(
          "[ClientConsultingProjectsPage] new /consulting/projects failed, falling back to LUMEN:",
          (newEndpointErr as Error)?.message,
        );
      }

      // Legacy LUMEN fallback. Envelope stripped by useOliverApi
      // (lib/oliverApi.ts:74), so we type the INNER shape only.
      const legacy = await get<{ projects: ClientProject[] }>("/consulting-projects");
      setProjects(Array.isArray(legacy?.projects) ? legacy.projects : []);
    } catch (e) {
      setError((e as Error).message);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [get, ready]);

  useEffect(() => { load(); }, [load]);

  // Active first, then on_hold, then completed; cancelled at the bottom.
  // Within each bucket, most-recently-updated wins.
  const sorted = useMemo(() => {
    const weight: Record<string, number> = { active: 0, on_hold: 1, completed: 2, cancelled: 3 };
    return projects.slice().sort((a, b) => {
      const wa = weight[String(a.status).toLowerCase()] ?? 99;
      const wb = weight[String(b.status).toLowerCase()] ?? 99;
      if (wa !== wb) return wa - wb;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [projects]);

  if (loading) {
    return (
      <div className="card" style={{ padding: 24, color: "#5A7A8A", fontSize: 13 }}>
        Loading projects…
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <div className="text-sm font-semibold text-red-600">Couldn&apos;t load your projects.</div>
        <p className="text-xs text-slate-500 mt-1">{error}</p>
      </div>
    );
  }

  // 2026-08-29 (Brandon) — Consulting is open to every client, so "no
  // projects" is a normal state, not a locked one. Projects with nothing in
  // flight is the BOOK AN APPOINTMENT surface.
  if (sorted.length === 0) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl bg-slate-50 border border-slate-200 px-6 py-10 text-center">
          <Folder className="mx-auto h-8 w-8 text-slate-400 mb-2" />
          <div className="text-sm font-semibold text-slate-700">No projects yet.</div>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            When we kick off work for you, your projects appear here with their phases,
            deliverables, and status. Want to get something started? Book a time below.
          </p>
        </div>
        <BookConsultationCTA variant="compact" />
      </div>
    );
  }

  const shown = sorted.filter((p) => {
    const s = String(p.status).toLowerCase();
    if (filter === "all") return true;
    if (filter === "completed") return s === "completed";
    if (filter === "cancelled") return s === "cancelled";
    return s !== "completed" && s !== "cancelled"; // active (incl. on_hold)
  });

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-slate-900">Your projects</h2>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700"
        >
          <option value="active">Active</option>
          <option value="all">All</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      {shown.length === 0 && (
        <div className="rounded-xl bg-slate-50 border border-slate-200 px-6 py-8 text-center text-xs text-slate-500">
          No {filter} projects — switch the filter above to see others.
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {shown.map((p) => {
          const badge = statusBadge(p.status);
          const phaseTotal = p.phase_count ?? 0;
          const phaseDone = p.phases_completed ?? 0;
          const progress = phaseTotal > 0 ? Math.round((phaseDone / phaseTotal) * 100) : 0;
          const accent = p.project_type_color || "#0C4A60";
          return (
            <button
              key={p.project_id}
              type="button"
              onClick={() => setOpenId(p.project_id)}
              className="bg-white rounded-xl border border-slate-200 p-4 text-left hover:shadow-md hover:border-slate-300 transition flex flex-col"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1.5">
                    {p.project_type_display && (
                      <span
                        className="px-1.5 py-0.5 rounded text-white"
                        style={{ background: accent }}
                      >
                        {p.project_type_display}
                      </span>
                    )}
                    <span className="text-slate-400">{p.project_number}</span>
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-900 truncate">
                    {p.title}
                  </div>
                </div>
                <span
                  className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded whitespace-nowrap"
                  style={{ background: badge.bg, color: badge.fg }}
                >
                  {badge.label}
                </span>
              </div>

              <div className="text-xs text-slate-600 mb-2">
                <span className="font-medium">Current phase:</span>{" "}
                {p.current_phase_name || (p.status === "completed" ? "All phases complete" : "—")}
              </div>

              {phaseTotal > 0 && (
                <div className="mb-2">
                  <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                    <span>{phaseDone}/{phaseTotal} phases</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${progress}%`, background: accent }}
                    />
                  </div>
                </div>
              )}

              <div className="mt-auto pt-2 flex items-center justify-between text-[10px] text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Updated {fmtRelative(p.updated_at)}
                </span>
                {p.target_completion_date && (
                  <span>Target: {new Date(p.target_completion_date).toLocaleDateString()}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <ClientConsultingProjectModal
        open={!!openId}
        projectId={openId}
        onClose={() => setOpenId(null)}
        onChanged={load}
      />
    </>
  );
}

export default ClientConsultingProjectsPage;
