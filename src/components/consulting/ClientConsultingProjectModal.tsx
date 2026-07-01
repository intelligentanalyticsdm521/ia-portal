// ClientConsultingProjectModal — F-Client.Consulting (2026-06-29).
//
// CLIENT-facing read-only project detail. Opens from
// ClientConsultingProjectsPage when a tenant user taps a project card.
// Shows three things, no edits, no comments compose, no kanban:
//
//   1. Header — title, project_type, status pill, target date.
//   2. Milestones/Phases tab (default) — vertical list with status dots.
//   3. Deliverables tab — every artifact for the project the client is
//      allowed to see (server-filtered to is_client_visible=1). Each row
//      embeds the shared DeliverableActionPanel so the client can approve
//      or request revisions on submitted deliverables.
//
// G3-S5: rewired to /consulting/projects/:id (new consulting.* schema). Falls back to /consulting-projects/:id (LUMEN legacy phases) if the new endpoint returns non-200 — this keeps existing tenants viewable during rollout.

import { useCallback, useEffect, useState } from "react";
import { IadmModal } from "../IadmModal";
import { useOliverApi } from "../../hooks/useOliverApi";
import { DeliverableActionPanel } from "./DeliverableActionPanel";
import { Folder, CheckCircle2, Circle, Loader2 } from "lucide-react";

interface Phase {
  phase_id: number;
  project_id: string;
  phase_order: number;
  name: string;
  description?: string | null;
  status: string; // not_started | in_progress | completed | client_review | blocked
  target_completion_date?: string | null;
  completed_at?: string | null;
}

// G3-S5: mirrors consulting.milestone from LUMEN migration 107.
interface Milestone {
  milestone_id: number;
  project_id?: string;
  sort_order: number;
  name: string;
  description?: string | null;
  status: string; // not_started | in_progress | completed | client_review | blocked
  target_completion_date?: string | null;
  completed_at?: string | null;
}

interface Artifact {
  artifact_id: string;
  project_id: string;
  parent_phase_id?: number | null;
  parent_feature_id?: number | null;
  parent_task_id?: number | null;
  kind: string;
  title: string;
  description?: string | null;
  file_url?: string | null;
  external_link?: string | null;
  status: string;
  is_client_visible: boolean | number;
  uploaded_by_kind: string;
  uploaded_by_name?: string | null;
  created_at: string;
  revision_notes?: string | null;
  reviewed_at?: string | null;
  approved_at?: string | null;
  is_payment_trigger?: boolean | number | null;
  payment_amount_cents?: number | null;
  payment_charge_status?: string | null;
}

// G3-S5: consulting.* deliverable shape from new endpoint. Superset of
// what DeliverableActionPanel needs — we map onto that panel below.
interface Deliverable {
  deliverable_id: string;
  project_id?: string;
  milestone_id?: number | null;
  kind?: string;
  title: string;
  description?: string | null;
  file_url?: string | null;
  external_link?: string | null;
  status: string;
  is_client_visible?: boolean | number;
  is_payment_trigger?: boolean | number | null;
  payment_amount_cents?: number | null;
  payment_charge_status?: string | null;
  approved_at?: string | null;
  revision_notes?: string | null;
}

interface ProjectDetail {
  project_id: string;
  project_number: string;
  title: string;
  description?: string | null;
  status: string;
  project_type: string;
  project_type_display?: string | null;
  project_type_color?: string | null;
  target_completion_date?: string | null;
  created_at?: string;
  updated_at?: string;
}

// Legacy LUMEN response shape.
interface LumenDetailResponse {
  project: ProjectDetail;
  phases: Phase[];
  artifacts: Artifact[];
}

// New consulting.* response shape.
interface ConsultingDetailResponse {
  project: ProjectDetail;
  milestones: Milestone[];
  deliverables: Deliverable[];
}

// G3-S5: discriminated union so the render path knows which schema it's
// looking at without prop-drilling booleans everywhere.
type ProjectPayload =
  | { schema: "consulting"; project: ProjectDetail; milestones: Milestone[]; deliverables: Deliverable[] }
  | { schema: "lumen"; project: ProjectDetail; phases: Phase[]; artifacts: Artifact[] };

interface Props {
  open: boolean;
  projectId: string | null;
  onClose: () => void;
  /** Re-fire after a successful approve / request-revisions so the parent
   *  list can pick up status changes. */
  onChanged?: () => void;
}

function phaseDot(status: string) {
  switch (String(status || "").toLowerCase()) {
    case "completed":
      return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
    case "in_progress":
    case "client_review":
      return <Loader2 className="h-5 w-5 text-sky-500 animate-spin" />;
    default:
      return <Circle className="h-5 w-5 text-slate-300" />;
  }
}

function phaseLabel(status: string): string {
  switch (String(status || "").toLowerCase()) {
    case "not_started": return "Not started";
    case "in_progress": return "In progress";
    case "client_review": return "Awaiting your review";
    case "completed": return "Completed";
    case "blocked": return "Blocked";
    default: return status || "—";
  }
}

export function ClientConsultingProjectModal({ open, projectId, onClose, onChanged }: Props) {
  const { get, ready } = useOliverApi();
  const [payload, setPayload] = useState<ProjectPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"steps" | "deliverables">("steps");

  const load = useCallback(async () => {
    if (!open || !projectId || !ready) return;
    setLoading(true);
    setError(null);
    try {
      // G3-S5: try the new consulting.* endpoint first.
      try {
        const r = await get<ConsultingDetailResponse>(`/consulting/projects/${projectId}`);
        if (r && r.project) {
          setPayload({
            schema: "consulting",
            project: r.project,
            milestones: r.milestones || [],
            deliverables: r.deliverables || [],
          });
          return;
        }
        // Non-throw empty response — fall through to LUMEN fallback.
      } catch (newEndpointErr) {
        // Fall back to LUMEN legacy path on any non-200 (404, 500, etc.)
        // so tenants that still live on the old schema keep rendering.
        // eslint-disable-next-line no-console
        console.debug("[ClientConsultingProjectModal] new endpoint failed, falling back to LUMEN:", (newEndpointErr as Error)?.message);
      }

      // Legacy LUMEN fallback.
      const legacy = await get<LumenDetailResponse>(`/consulting-projects/${projectId}`);
      setPayload({
        schema: "lumen",
        project: legacy.project,
        phases: legacy.phases || [],
        artifacts: legacy.artifacts || [],
      });
    } catch (e) {
      setError((e as Error).message);
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [get, open, projectId, ready]);

  useEffect(() => {
    if (!open) {
      // Reset internal state when modal closes so re-opening another row
      // doesn't briefly flash the previous row's content.
      setPayload(null);
      setError(null);
      setTab("steps");
      return;
    }
    load();
  }, [open, load]);

  // Re-fire load after a child deliverable action so the badge flips
  // without the user having to close + reopen.
  const handleDeliverableChanged = useCallback(() => {
    load();
    onChanged?.();
  }, [load, onChanged]);

  // Normalize deliverables/artifacts into the shape DeliverableActionPanel
  // expects, regardless of which backend served the payload.
  const visibleDeliverables: Array<{
    id: string;
    kind: string;
    title: string;
    description?: string | null;
    file_url?: string | null;
    external_link?: string | null;
    status: string;
    is_payment_trigger?: boolean | number | null;
    payment_amount_cents?: number | null;
    payment_charge_status?: string | null;
    approved_at?: string | null;
    revision_notes?: string | null;
    milestone_id?: number | string | null;
    service_request_id?: string | null;
  }> = (() => {
    if (!payload) return [];
    if (payload.schema === "consulting") {
      return (payload.deliverables || [])
        .filter((d) => d.is_client_visible === undefined || d.is_client_visible === true || d.is_client_visible === 1)
        .map((d) => ({
          id: d.deliverable_id,
          kind: d.kind || "deliverable",
          title: d.title,
          description: d.description,
          file_url: d.file_url,
          external_link: d.external_link,
          status: d.status,
          is_payment_trigger: d.is_payment_trigger ?? null,
          payment_amount_cents: d.payment_amount_cents ?? null,
          payment_charge_status: d.payment_charge_status ?? null,
          approved_at: d.approved_at,
          revision_notes: d.revision_notes,
          milestone_id: d.milestone_id ?? null,
          service_request_id: null,
        }));
    }
    return (payload.artifacts || [])
      .filter((a) => a.is_client_visible === true || a.is_client_visible === 1)
      .map((a) => ({
        id: a.artifact_id,
        kind: a.kind,
        title: a.title,
        description: a.description,
        file_url: a.file_url,
        external_link: a.external_link,
        status: a.status,
        is_payment_trigger: a.is_payment_trigger ?? null,
        payment_amount_cents: a.payment_amount_cents ?? null,
        payment_charge_status: a.payment_charge_status ?? null,
        approved_at: a.approved_at,
        revision_notes: a.revision_notes,
        milestone_id: null,
        service_request_id: null,
      }));
  })();

  const p = payload?.project;
  const accent = p?.project_type_color || "#0C4A60";
  const stepsTabLabel = payload?.schema === "lumen" ? "Phases" : "Milestones";

  return (
    <IadmModal
      open={open}
      onClose={onClose}
      product="oliver"
      eyebrow={p?.project_number || "PROJECT"}
      title={p?.title || "Project"}
      subtitle={p?.project_type_display || undefined}
      size="info"
    >
      <div className="flex flex-col max-h-[70vh]">
        {/* Header strip */}
        <div className="border-b border-slate-200 px-4 py-3 bg-slate-50 flex flex-wrap items-center gap-3">
          {p?.status && (
            <span
              className="text-[10px] font-bold uppercase px-2 py-0.5 rounded"
              style={{ background: "#dbeafe", color: "#1d4ed8" }}
            >
              {p.status}
            </span>
          )}
          {p?.target_completion_date && (
            <span className="text-xs text-slate-600">
              Target completion: {new Date(p.target_completion_date).toLocaleDateString()}
            </span>
          )}
          {p?.description && (
            <div className="w-full text-xs text-slate-600 mt-1 whitespace-pre-wrap">
              {p.description}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="border-b border-slate-200 px-4 flex items-center gap-1">
          {(["steps", "deliverables"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
                tab === t
                  ? "text-slate-900"
                  : "text-slate-500 border-transparent hover:text-slate-700"
              }`}
              style={tab === t ? { borderColor: accent } : undefined}
            >
              {t === "steps" ? stepsTabLabel : `Deliverables (${visibleDeliverables.length})`}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-4 flex-1 min-h-[200px]">
          {loading && <div className="text-sm text-slate-500">Loading…</div>}
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {!loading && !error && tab === "steps" && payload?.schema === "consulting" && (
            <ol className="space-y-2">
              {(payload.milestones || []).length === 0 && (
                <li className="text-xs text-slate-500 italic">
                  No milestones defined for this project yet.
                </li>
              )}
              {(payload.milestones || []).map((m) => (
                <li
                  key={m.milestone_id}
                  className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3"
                >
                  <div className="flex-shrink-0 mt-0.5">{phaseDot(m.status)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-slate-900">
                        {m.sort_order}. {m.name}
                      </div>
                      <span className="text-[10px] uppercase font-bold text-slate-500 whitespace-nowrap">
                        {phaseLabel(m.status)}
                      </span>
                    </div>
                    {m.description && (
                      <p className="text-xs text-slate-600 mt-1 whitespace-pre-wrap">
                        {m.description}
                      </p>
                    )}
                    {(m.target_completion_date || m.completed_at) && (
                      <p className="text-[10px] text-slate-500 mt-1">
                        {m.completed_at
                          ? `Completed ${new Date(m.completed_at).toLocaleDateString()}`
                          : `Target ${new Date(m.target_completion_date!).toLocaleDateString()}`}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}

          {!loading && !error && tab === "steps" && payload?.schema === "lumen" && (
            <ol className="space-y-2">
              {(payload.phases || []).length === 0 && (
                <li className="text-xs text-slate-500 italic">
                  No phases defined for this project yet.
                </li>
              )}
              {(payload.phases || []).map((ph) => (
                <li
                  key={ph.phase_id}
                  className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3"
                >
                  <div className="flex-shrink-0 mt-0.5">{phaseDot(ph.status)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-slate-900">
                        {ph.phase_order}. {ph.name}
                      </div>
                      <span className="text-[10px] uppercase font-bold text-slate-500 whitespace-nowrap">
                        {phaseLabel(ph.status)}
                      </span>
                    </div>
                    {ph.description && (
                      <p className="text-xs text-slate-600 mt-1 whitespace-pre-wrap">
                        {ph.description}
                      </p>
                    )}
                    {(ph.target_completion_date || ph.completed_at) && (
                      <p className="text-[10px] text-slate-500 mt-1">
                        {ph.completed_at
                          ? `Completed ${new Date(ph.completed_at).toLocaleDateString()}`
                          : `Target ${new Date(ph.target_completion_date!).toLocaleDateString()}`}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}

          {!loading && !error && tab === "deliverables" && (
            <div className="space-y-2">
              {visibleDeliverables.length === 0 ? (
                <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-8 text-center">
                  <Folder className="mx-auto h-7 w-7 text-slate-400 mb-2" />
                  <div className="text-sm font-semibold text-slate-700">No deliverables yet.</div>
                  <p className="text-xs text-slate-500 mt-1">
                    Files and artifacts will appear here as Intelligent Analytics ships work for you.
                  </p>
                </div>
              ) : (
                visibleDeliverables.map((a) => (
                  <div
                    key={a.id}
                    className="rounded-lg border border-slate-200 bg-white p-3"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] uppercase font-bold text-slate-500">
                          {a.kind}
                        </div>
                        <div className="text-sm font-semibold text-slate-900">
                          {a.title}
                        </div>
                      </div>
                      {(a.file_url || a.external_link) && (
                        <a
                          href={a.file_url || a.external_link || "#"}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-semibold text-blue-600 hover:underline whitespace-nowrap"
                        >
                          Open ↗
                        </a>
                      )}
                    </div>
                    {a.description && (
                      <p className="text-xs text-slate-600 mb-2 whitespace-pre-wrap">
                        {a.description}
                      </p>
                    )}
                    {/* Shared action panel — handles the approve/revise UX
                        and the in-revision / approved badge states. Wired
                        as client viewer, standalone context. On the new
                        consulting.* path the payment-trigger CTA is
                        supported natively; on legacy LUMEN it's suppressed
                        by the panel when is_payment_trigger is unset. */}
                    <DeliverableActionPanel
                      deliverable={{
                        deliverable_id: a.id,
                        status: a.status,
                        is_payment_trigger: a.is_payment_trigger,
                        payment_amount_cents: a.payment_amount_cents,
                        payment_charge_status: a.payment_charge_status,
                        approved_at: a.approved_at,
                        revision_notes: a.revision_notes,
                      }}
                      viewerRole="client"
                      context={
                        a.milestone_id != null
                          ? "milestone"
                          : a.service_request_id != null
                          ? "sr"
                          : "standalone"
                      }
                      onChanged={handleDeliverableChanged}
                    />
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </IadmModal>
  );
}

export default ClientConsultingProjectModal;
