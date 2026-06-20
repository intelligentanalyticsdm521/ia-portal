// ConsultingProjectWorkspacePage — Phase 1 v0
//
// Read-only workspace surface for the 4-tier Consulting hierarchy:
//   Project → Phase → Feature → Task
//
// Schema lives in migration 091_consulting_rework_phase1.sql:
//   lumen.consulting_project          (existed)
//   lumen.consulting_project_phase    (existed)
//   lumen.consulting_project_feature  (new — feature_id, phase_id, name, status, feature_order)
//   lumen.consulting_project_task     (new — task_id, feature_id, name, status, task_order)
//
// Two views controlled by `selectedProjectId`:
//   - LIST: card grid of projects (reuses GET /consulting-projects)
//   - DETAIL: project header + collapsible Phase → Feature → Task tree
//     (uses GET /consulting-projects/:id for phases; calls
//      GET /consulting-projects/:id/features-tree for the feature/task layer
//      and gracefully shows a "Backend endpoint pending" banner if that
//      route 404s — see final report for what oliver-api still owes us)
//
// Mirrors style of ConsultingProjectsBoardPage (F-140). Same envelope
// auto-unwrap convention via useOliverApi (lib/oliverApi.ts:74).

import { useCallback, useEffect, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

type ProjectStatus = "active" | "on_hold" | "completed" | "cancelled";
type PhaseStatus = "pending" | "in_progress" | "client_review" | "completed" | "skipped";
type FeatureStatus = "pending" | "in_progress" | "client_review" | "completed" | "skipped" | "blocked";
type TaskStatus = "pending" | "in_progress" | "completed" | "skipped" | "blocked";

interface Project {
  project_id: string;
  project_number: string;
  title: string;
  description?: string;
  status: ProjectStatus;
  project_type: string;
  project_type_display?: string;
  project_type_color?: string;
  client_business_name?: string | null;
  current_phase_name?: string | null;
  target_completion_date?: string | null;
  budget_hours?: number | null;
  hours_logged: number;
  phase_count: number;
  phases_completed: number;
  open_request_count: number;
  created_at: string;
  updated_at: string;
}

interface Phase {
  phase_id: number;
  name: string;
  description?: string;
  phase_order: number;
  status: PhaseStatus;
  target_completion_date?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
}

interface Feature {
  feature_id: number;
  phase_id: number;
  name: string;
  description?: string | null;
  feature_order: number;
  status: FeatureStatus;
  target_completion_date?: string | null;
  created_at: string;
}

interface Task {
  task_id: number;
  feature_id: number;
  name: string;
  description?: string | null;
  task_order: number;
  status: TaskStatus;
  due_at?: string | null;
  completed_at?: string | null;
  created_at: string;
}

interface ProjectDetail {
  project: Project;
  phases: Phase[];
}

interface FeatureTree {
  features: Feature[];
  tasks: Task[];
}

const PROJECT_STATUS_COLOR: Record<ProjectStatus, string> = {
  active: "#3b82f6",
  on_hold: "#f59e0b",
  completed: "#10b981",
  cancelled: "#94a3b8",
};

const PHASE_STATUS_COLOR: Record<PhaseStatus, string> = {
  pending: "#cbd5e1",
  in_progress: "#3b82f6",
  client_review: "#8b5cf6",
  completed: "#10b981",
  skipped: "#94a3b8",
};

const FEATURE_STATUS_COLOR: Record<FeatureStatus, string> = {
  pending: "#cbd5e1",
  in_progress: "#3b82f6",
  client_review: "#8b5cf6",
  completed: "#10b981",
  skipped: "#94a3b8",
  blocked: "#dc2626",
};

const TASK_STATUS_COLOR: Record<TaskStatus, string> = {
  pending: "#cbd5e1",
  in_progress: "#3b82f6",
  completed: "#10b981",
  skipped: "#94a3b8",
  blocked: "#dc2626",
};

export function ConsultingProjectWorkspacePage() {
  const { get, ready } = useOliverApi();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (statusFilter) qs.set("status", statusFilter);
      // Envelope is auto-stripped by useOliverApi — type the unwrapped shape
      // directly (per feedback_oliver_api_envelope_unwrap).
      const r = await get<{ projects: Project[] }>(`/consulting-projects?${qs}`);
      setProjects(r?.projects || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [get, ready, statusFilter]);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  // DETAIL view ────────────────────────────────────────────────────────
  if (selectedProjectId) {
    return (
      <ProjectDetailView
        projectId={selectedProjectId}
        onBack={() => setSelectedProjectId(null)}
      />
    );
  }

  // LIST view ──────────────────────────────────────────────────────────
  return (
    <OliverPageWrapper
      title="Project Workspace"
      subtitle="IA Consulting · Project → Phase → Feature → Task"
      error={error}
      loading={loading}
    >
      <div className="space-y-3">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="active">Active</option>
            <option value="on_hold">On hold</option>
            <option value="completed">Completed</option>
            <option value="">All statuses</option>
          </select>
          <span className="ml-auto text-xs text-slate-500">
            {projects.length} project{projects.length === 1 ? "" : "s"}
          </span>
        </div>

        {/* Empty state */}
        {projects.length === 0 ? (
          <div className="rounded-xl bg-slate-50 border border-slate-200 px-6 py-12 text-center text-sm text-slate-500">
            No projects match the current filter. Create a project from the{" "}
            <a href="/app/services/consulting_projects" className="text-[#EF6C33] hover:underline">
              Projects Board
            </a>{" "}
            to see it here.
          </div>
        ) : (
          /* Card grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {projects.map((p) => {
              const progressPct =
                p.phase_count > 0 ? Math.round((p.phases_completed / p.phase_count) * 100) : 0;
              return (
                <button
                  key={p.project_id}
                  onClick={() => setSelectedProjectId(p.project_id)}
                  className="text-left bg-white rounded-xl border-2 border-slate-200 hover:border-[#EF6C33] hover:shadow-md p-4 transition"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="text-[10px] font-mono text-slate-500">{p.project_number}</div>
                      {p.project_type_display && (
                        <span
                          className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded text-white"
                          style={{ background: p.project_type_color || "#64748b" }}
                        >
                          {p.project_type_display}
                        </span>
                      )}
                    </div>
                    <span
                      className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded text-white"
                      style={{ background: PROJECT_STATUS_COLOR[p.status] }}
                    >
                      {p.status}
                    </span>
                  </div>

                  <div className="text-base font-bold text-slate-900 mb-1">{p.title}</div>
                  {p.client_business_name && (
                    <div className="text-xs text-slate-600 mb-2">{p.client_business_name}</div>
                  )}

                  {/* Phase progress */}
                  <div className="mb-2">
                    <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                      <span>{p.current_phase_name || "—"}</span>
                      <span>
                        {p.phases_completed}/{p.phase_count} phases
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#EF6C33] rounded-full"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-[10px] text-slate-500">
                    <span>Updated {new Date(p.updated_at).toLocaleDateString()}</span>
                    {p.target_completion_date && (
                      <span>· Due {new Date(p.target_completion_date).toLocaleDateString()}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </OliverPageWrapper>
  );
}

// ─── Detail view ──────────────────────────────────────────────────────
function ProjectDetailView({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  const { get, ready } = useOliverApi();
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [tree, setTree] = useState<FeatureTree | null>(null);
  const [treeUnavailable, setTreeUnavailable] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    setTreeUnavailable(null);
    try {
      // 1) Project + phases (existing endpoint)
      const r = await get<ProjectDetail>(`/consulting-projects/${projectId}`);
      if (!r || !r.project) {
        throw new Error("Project not found or you don't have access.");
      }
      setDetail({ project: r.project, phases: r.phases || [] });

      // Expand all phases by default for v0 (small data sets).
      setExpanded(new Set((r.phases || []).map((p) => p.phase_id)));

      // 2) Features + tasks (NEW — endpoint may not exist yet).
      try {
        const t = await get<FeatureTree>(`/consulting-projects/${projectId}/features-tree`);
        setTree({
          features: t?.features || [],
          tasks: t?.tasks || [],
        });
      } catch (treeErr) {
        // Don't surface as a fatal error — the project header + phase tracker
        // still render. The tree section shows a clear "Backend endpoint
        // pending" banner so Brandon can see exactly what's missing.
        const msg = (treeErr as Error).message || "";
        setTreeUnavailable(msg);
        setTree({ features: [], tasks: [] });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [get, ready, projectId]);

  useEffect(() => { load(); }, [load]);

  const toggle = (phaseId: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(phaseId)) next.delete(phaseId);
      else next.add(phaseId);
      return next;
    });
  };

  return (
    <OliverPageWrapper
      title={detail?.project.title || "Project workspace"}
      subtitle={
        detail
          ? `${detail.project.project_number} · ${detail.project.client_business_name || "—"}`
          : "Loading project…"
      }
      error={error}
      loading={loading}
    >
      <div className="space-y-4">
        {/* Back button */}
        <div>
          <button
            onClick={onBack}
            className="text-xs text-slate-600 hover:text-slate-900 hover:underline"
          >
            ← Back to all projects
          </button>
        </div>

        {!detail ? (
          <div className="rounded-xl bg-slate-50 border border-slate-200 px-6 py-12 text-center text-sm text-slate-500">
            Project not available.
          </div>
        ) : (
          <>
            {/* Project header card */}
            <div className="bg-white rounded-xl border-2 border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    {detail.project.project_type_display && (
                      <span
                        className="text-[10px] font-bold uppercase px-2 py-0.5 rounded text-white"
                        style={{ background: detail.project.project_type_color || "#64748b" }}
                      >
                        {detail.project.project_type_display}
                      </span>
                    )}
                    <span
                      className="text-[10px] font-bold uppercase px-2 py-0.5 rounded text-white"
                      style={{ background: PROJECT_STATUS_COLOR[detail.project.status] }}
                    >
                      {detail.project.status}
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-slate-900">{detail.project.title}</h2>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <div>{detail.project.phases_completed}/{detail.project.phase_count} phases</div>
                  {detail.project.target_completion_date && (
                    <div>
                      Due {new Date(detail.project.target_completion_date).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>
              {detail.project.description && (
                <div className="text-sm text-slate-600 whitespace-pre-wrap mb-3">
                  {detail.project.description}
                </div>
              )}

              {/* Phase strip */}
              <div className="flex gap-1">
                {detail.phases.map((ph) => (
                  <div key={ph.phase_id} className="flex-1 min-w-[60px]">
                    <div
                      className="h-2 rounded-full"
                      style={{ background: PHASE_STATUS_COLOR[ph.status] }}
                    />
                    <div className="text-[10px] text-slate-600 mt-1 truncate text-center">
                      {ph.name}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Backend pending banner */}
            {treeUnavailable && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                <div className="font-semibold mb-1">
                  Backend endpoint <code>/consulting-projects/{`{id}`}/features-tree</code> pending
                </div>
                <div className="text-amber-800">
                  Features and tasks will render here once the route is built in oliver-api
                  (returns <code>{`{ features: Feature[], tasks: Task[] }`}</code> for this
                  project). Reported error:{" "}
                  <span className="font-mono">{treeUnavailable.slice(0, 180)}</span>
                </div>
              </div>
            )}

            {/* Phase → Feature → Task tree */}
            <div className="space-y-2">
              <div className="text-sm font-semibold text-slate-900">
                Phase → Feature → Task breakdown
              </div>
              {detail.phases.length === 0 ? (
                <div className="rounded-xl bg-slate-50 border border-slate-200 px-6 py-8 text-center text-sm text-slate-500">
                  No phases on this project yet.
                </div>
              ) : (
                detail.phases.map((phase) => {
                  const phaseFeatures = (tree?.features || [])
                    .filter((f) => f.phase_id === phase.phase_id)
                    .sort((a, b) => a.feature_order - b.feature_order);
                  const isExpanded = expanded.has(phase.phase_id);
                  return (
                    <div
                      key={phase.phase_id}
                      className="bg-white rounded-lg border border-slate-200"
                    >
                      <button
                        onClick={() => toggle(phase.phase_id)}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 rounded-lg text-left"
                      >
                        <span className="text-xs text-slate-400 w-4">
                          {isExpanded ? "▼" : "▶"}
                        </span>
                        <span className="text-[10px] font-bold text-slate-500 font-mono">
                          #{phase.phase_order}
                        </span>
                        <span className="font-semibold text-slate-900 flex-1">{phase.name}</span>
                        <span
                          className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded text-white"
                          style={{ background: PHASE_STATUS_COLOR[phase.status] }}
                        >
                          {phase.status.replace(/_/g, " ")}
                        </span>
                        <span className="text-[10px] text-slate-500 w-20 text-right">
                          {phaseFeatures.length} feature{phaseFeatures.length === 1 ? "" : "s"}
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="px-4 pb-3 pl-10 space-y-2 border-t border-slate-100 pt-2">
                          {phaseFeatures.length === 0 ? (
                            <div className="text-xs italic text-slate-400">
                              {treeUnavailable
                                ? "Features will appear once the backend endpoint ships."
                                : "No features on this phase yet."}
                            </div>
                          ) : (
                            phaseFeatures.map((feature) => {
                              const featureTasks = (tree?.tasks || [])
                                .filter((t) => t.feature_id === feature.feature_id)
                                .sort((a, b) => a.task_order - b.task_order);
                              return (
                                <div
                                  key={feature.feature_id}
                                  className="border-l-2 border-slate-200 pl-3"
                                >
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-sm font-semibold text-slate-800">
                                      {feature.name}
                                    </span>
                                    <span
                                      className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded text-white"
                                      style={{
                                        background: FEATURE_STATUS_COLOR[feature.status] || "#94a3b8",
                                      }}
                                    >
                                      {feature.status.replace(/_/g, " ")}
                                    </span>
                                  </div>
                                  {feature.description && (
                                    <div className="text-xs text-slate-600 mb-2 whitespace-pre-wrap">
                                      {feature.description}
                                    </div>
                                  )}

                                  {featureTasks.length === 0 ? (
                                    <div className="text-[11px] italic text-slate-400">
                                      No tasks on this feature yet.
                                    </div>
                                  ) : (
                                    <ul className="space-y-1">
                                      {featureTasks.map((task) => (
                                        <li
                                          key={task.task_id}
                                          className="flex items-center gap-2 text-xs text-slate-700"
                                        >
                                          <span
                                            className="inline-block w-2 h-2 rounded-full"
                                            style={{
                                              background:
                                                TASK_STATUS_COLOR[task.status] || "#94a3b8",
                                            }}
                                          />
                                          <span className="flex-1">{task.name}</span>
                                          <span className="text-[10px] uppercase text-slate-500">
                                            {task.status.replace(/_/g, " ")}
                                          </span>
                                          {task.due_at && (
                                            <span className="text-[10px] text-slate-400">
                                              {new Date(task.due_at).toLocaleDateString()}
                                            </span>
                                          )}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </OliverPageWrapper>
  );
}

export default ConsultingProjectWorkspacePage;
