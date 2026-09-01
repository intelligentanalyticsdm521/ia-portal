// ConsultingProjectModal — F1 shell
//
// Phase 1 (Project Hub) modal for a single consulting.project row. Opens from
// the ConsultingProjectsPage list when the founder clicks a row.
//
// Scope (locked 2026-06-25 per SCOPE_WORKING.md):
//   - Wrapper: IadmModal size="info" (1200×80vh canonical large).
//   - Tabs: Overview + Milestones ONLY in F1. The Messages / Activity /
//     Deliverables / Invoices tabs render as DISABLED chips with a
//     "Coming in F2" tooltip so the founder sees the roadmap.
//   - Overview tab: top banner ("Your next step: …" or, for founder,
//     "Awaiting client review" when status === 'awaiting_client_response'),
//     description card, category, contact card, owner avatar, dates,
//     total budget. Status dropdown (founder can manually flip status).
//   - Milestones tab: VERTICAL list (not inline) with numbered circles —
//     complete=#38BDF8 (IL blue) checkmark, in-flight=#FEC82C (OLIVER gold)
//     pulsing dot, not_started=outline only #CBD5E1. Expand on click shows
//     description, live status dropdown (founder advances/reverts via the
//     migration-106 enum), internal review checklist placeholder, and a
//     payment-trigger banner that reflects payment_charge_status. Completing
//     an is_payment_trigger milestone flags the charge 'ready' server-side.
//
// API surface used (F1 only):
//   GET  /consulting/projects/:id            → project row + milestones[]
//                                              The endpoint composite is
//                                              owed by the F1 backend agent;
//                                              we render a graceful inline
//                                              banner if the route 404s.
//   PATCH /consulting/projects/:id            → status changes (founder).
//                                              Live (backend commit dfb6567);
//                                              terminal statuses stamp closed_at.
//   PATCH /consulting/projects/:id/milestones/:mid
//                                            → milestone status changes. Live.
//                                              complete stamps completed_at +
//                                              auto-advances the next milestone;
//                                              revert clears completed_at.
//
// Per [[no-tenant-in-ui]] this file uses "Business" / "Client" in any
// customer-visible copy — schema names like client_tenant_id stay in code
// only.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IadmModal, CORE_BLUE } from "../IadmModal";
import { ProjectDetailsTab } from "./ProjectDetailsTab";
import { ProjectTasksTab } from "./ProjectTasksTab";
import { OnboardingWizardModal } from "./OnboardingWizardModal";
import { useOliverApi } from "../../hooks/useOliverApi";
import { DeliverableActionPanel, type DeliverableShape } from "./DeliverableActionPanel";
import { CheckCircle2, ChevronDown, ChevronRight, Lock, User, Send, AlertCircle } from "lucide-react";

// ─── Color tokens ────────────────────────────────────────────────────────
// Locked per F1 brief 2026-06-25.
const IL_BLUE = "#38BDF8";    // complete milestone circle
const OLIVER_GOLD = "#FEC82C"; // active milestone circle (pulsing)
const NEUTRAL = "#CBD5E1";    // not_started milestone circle outline

// ─── Types ───────────────────────────────────────────────────────────────

// CS-5 — MUST match the consulting.project.status CHECK enum exactly (9
// values). 'on_hold' was NEVER in the CHECK — picking it 500'd the status
// PATCH; 'paused'/'blocked'/'awaiting_internal_review'/'payment_required' are
// valid server-set statuses that previously had no pill and crashed the
// Record lookup. All nine are now represented.
type ProjectStatus =
  | "active"
  | "paused"
  | "blocked"
  | "awaiting_client_response"
  | "awaiting_internal_review"
  | "payment_required"
  | "completed"
  | "closed"
  | "cancelled";

// Canonical enum = migration 106 CHECK on consulting.project_milestone.status.
// NO 'active' — writing it violates the CHECK and 500s the milestone write.
// 'in_progress' is the schema's in-flight value (verified 2026-07-04 by the
// backend agent against the migration directly).
type MilestoneStatus =
  | "not_started"
  | "in_progress"
  | "awaiting_client"
  | "awaiting_internal"
  | "complete"
  | "blocked"
  | "skipped";

export interface ConsultingProjectMilestone {
  milestone_id: string;
  sort_order: number;
  name: string;
  description?: string | null;
  status: MilestoneStatus;
  due_date?: string | null;
  completed_at?: string | null;
  is_payment_trigger?: boolean | number;
  payment_pct?: number | null;
  payment_amount_cents?: number | null;
  payment_charge_status?: string | null;
  internal_review_checklist_json?: unknown;
  /** Server-side flag — true when seeded from a system category template. */
  is_system_seed?: boolean;
}

export interface ConsultingProjectRow {
  project_id: string;
  name: string;
  description?: string | null;
  status: ProjectStatus;
  category_id?: string | null;
  category_name?: string | null;
  category_slug?: string | null;
  client_name?: string | null;
  client_email?: string | null;
  client_phone?: string | null;
  /** PB-2 — set once the client is provisioned a tenant (consulting.project
   *  .linked_tenant_id). Drives the milestone "Start Onboarding" launcher. */
  linked_tenant_id?: string | null;
  owner_user_id?: string | null;
  owner_display_name?: string | null;
  owner_avatar_url?: string | null;
  // Column is `total_billable_cents` (verified against prod 2026-07-22).
  // This was typed as `total_budget_cents`, which the API never returns — so the
  // budget rendered "Not set" even when a value existed.
  total_billable_cents?: number | null;
  currency?: string | null;
  started_at?: string | null;
  /** DEAD COLUMN. `target_completion_date` does not exist on consulting.project
   *  — the Overview card bound to it has always rendered "—". The real column
   *  is `target_end_date` (migration 151). Kept only so nothing that still
   *  reads it fails to compile; nothing should. */
  target_completion_date?: string | null;
  /** Schedule + capacity (migrations 151 / 153). */
  start_date?: string | null;
  target_end_date?: string | null;
  estimate_hours?: number | null;
  estimate_size?: string | null;
  internal_notes?: string | null;
  priority?: string | null;
  closed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  /** Server-computed: "what's the customer-facing next step?" */
  next_step_for_client?: string | null;
  /** Server-computed: "what's the founder waiting on?" */
  next_step_for_founder?: string | null;
}

// CS-6 — consulting.deliverable row as returned by GET /consulting/projects/:id.
// Columns confirmed via SQL against iadm_services.consulting.deliverable.
// NOTE: the wire column is `revision_note` (SINGULAR); DeliverableActionPanel's
// shape uses `revision_notes` (PLURAL) — mapped at the render site below.
interface ConsultingDeliverable {
  deliverable_id: string;
  /** Set when the deliverable is attached to a task (service request). */
  service_request_id?: string | null;
  title?: string | null;
  description?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  status: string;
  is_payment_trigger?: boolean | number | null;
  payment_amount_cents?: number | null;
  payment_charge_status?: string | null;
  created_at?: string | null;
  approved_at?: string | null;
  revision_requested_at?: string | null;
  revision_note?: string | null;
  sent_at?: string | null;
}

// Task ≡ service request (consulting.service_request). A milestone task is a
// request with project_id + milestone_id set. Stage/status pairs come from the
// 7-stage pipeline in routes/consultingRequests.js — labels in TASK_STAGES.
export interface ConsultingTask {
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
  created_at?: string | null;
  updated_at?: string | null;
  /** Newest OPEN client revision request — what they asked to be changed. */
  open_revision_note?: string | null;
  // Planning fields, so the project's Tasks tab shows the same shape the board
  // does rather than a thinner second version of the same row.
  estimate_hours?: number | null;
  estimate_size?: string | null;
  actual_hours?: number | null;
  priority?: string | null;
  platform?: string | null;
  due_at?: string | null;
  start_at?: string | null;
  completed_at?: string | null;
  release_id?: string | null;
  release_name?: string | null;
  release_target_date?: string | null;
  assigned_to_worker_id?: string | null;
  assignee_name?: string | null;
}

/** Server-computed hours rollup for the project (GET /consulting/projects/:id). */
export interface ProjectCapacity {
  budget_hours: number | null;
  estimate_size: string | null;
  committed_hours: number;
  actual_hours: number;
  task_count: number;
  done_count: number;
  unsized: number;
}

interface WorkspaceResponse {
  project: ConsultingProjectRow;
  milestones: ConsultingProjectMilestone[];
  deliverables?: ConsultingDeliverable[];
  tasks?: ConsultingTask[];
  capacity?: ProjectCapacity;
}

// Friendly labels + the founder's quick actions per stage. Mirrors the
// server's stage machine — the server validates every transition, so a drift
// here shows as a 400, never silent corruption.
export const TASK_STAGE_LABELS: Record<string, string> = {
  new: "New",
  in_progress: "In Progress",
  // Doubles as the internal QA lane: agency work that needs testing before it
  // ships sits here too. Clients never see this map — they have their own
  // CLIENT_STAGE_LABEL, which still reads simply "Client Review".
  client_review: "Client Review / Internal Testing",
  revision: "Revision",
  client_revision_review: "Client Revision Review",
  approved: "Approved",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const TASK_STATUS_LABELS: Record<string, string> = {
  not_reviewed: "Not Reviewed",
  needs_client_discussion: "Needs Client Discussion",
  work_approved: "Work Approved",
  in_progress: "In Progress",
  blocked: "Blocked",
  waiting_on_client: "Waiting on Client",
  ready_for_client_review: "Ready for Client Review",
  awaiting_client: "Awaiting Client",
  revision_requested: "Revision Requested",
  approved_by_client: "Approved by Client",
  in_revision: "In Revision",
  ready_for_re_review: "Ready for Re-Review",
  more_revisions_requested: "More Revisions Requested",
  revisions_approved: "Revisions Approved",
  ready_to_deploy: "Ready to Deploy",
  deploying: "Deploying",
  completed: "Completed",
  cancelled: "Cancelled",
};

// value = "stage|status" — parsed at the PATCH call site.
export const TASK_ACTIONS: Record<string, Array<{ value: string; label: string }>> = {
  new: [
    { value: "in_progress|in_progress", label: "Approve work → In Progress" },
    { value: "new|needs_client_discussion", label: "Needs Client Discussion" },
    { value: "new|not_reviewed", label: "Not Reviewed" },
    { value: "cancelled|cancelled", label: "Cancel" },
  ],
  in_progress: [
    { value: "in_progress|in_progress", label: "In Progress" },
    { value: "in_progress|blocked", label: "Blocked" },
    { value: "in_progress|waiting_on_client", label: "Waiting on Client" },
    { value: "client_review|awaiting_client", label: "Send for Client Review" },
    { value: "cancelled|cancelled", label: "Cancel" },
  ],
  client_review: [
    { value: "client_review|awaiting_client", label: "Awaiting Client" },
    { value: "approved|ready_to_deploy", label: "Client Approved" },
    { value: "revision|in_revision", label: "Revision Requested" },
    { value: "cancelled|cancelled", label: "Cancel" },
  ],
  revision: [
    { value: "revision|in_revision", label: "In Revision" },
    { value: "revision|blocked", label: "Blocked" },
    { value: "client_revision_review|awaiting_client", label: "Send for Re-Review" },
    { value: "cancelled|cancelled", label: "Cancel" },
  ],
  client_revision_review: [
    { value: "client_revision_review|awaiting_client", label: "Awaiting Client" },
    { value: "approved|ready_to_deploy", label: "Revisions Approved" },
    { value: "revision|in_revision", label: "More Revisions Requested" },
    { value: "cancelled|cancelled", label: "Cancel" },
  ],
  approved: [
    { value: "approved|ready_to_deploy", label: "Ready to Deploy" },
    { value: "approved|deploying", label: "Deploying" },
    { value: "completed|completed", label: "Mark Completed" },
    { value: "in_progress|in_progress", label: "Pull back to In Progress" },
    { value: "cancelled|cancelled", label: "Cancel" },
  ],
  completed: [{ value: "in_progress|in_progress", label: "Reopen" }],
  cancelled: [{ value: "in_progress|in_progress", label: "Revive → In Progress" }],
};

/** Every stage with the statuses it owns — mirrors STAGE_STATUSES in
 *  oliver-api routes/consultingRequests.js. A status that isn't listed under
 *  its stage there is rejected as `invalid_status`, so this map and that one
 *  must agree. */
export const TASK_STAGE_STATUSES: Record<string, string[]> = {
  new: ["not_reviewed", "needs_client_discussion", "work_approved", "cancelled"],
  in_progress: ["in_progress", "blocked", "waiting_on_client", "ready_for_client_review"],
  client_review: ["awaiting_client", "revision_requested", "approved_by_client"],
  revision: ["in_revision", "blocked", "ready_for_re_review"],
  client_revision_review: ["awaiting_client", "more_revisions_requested", "revisions_approved"],
  approved: ["ready_to_deploy", "deploying"],
  completed: ["completed"],
  cancelled: ["cancelled"],
};

/** The status a stage lands on when you pick the stage rather than a status. */
export function defaultStatusFor(stage: string): string {
  return (TASK_STAGE_STATUSES[stage] || [])[0] || "";
}

/** EVERY move available to a founder, grouped by stage for an <optgroup> menu.
 *
 *  2026-08-29 (Brandon): "I need a way to go from in progress to completed
 *  directly or any status. I don't always need to go to client review steps."
 *  The old menu offered only TASK_ACTIONS[stage] — a curated shortlist that
 *  mirrored the server's adjacency map — so In Progress led nowhere but Client
 *  Review, and marking work done meant dragging the client through a review
 *  they never asked for. The server now accepts any (stage,status) pair, so the
 *  menu offers all of them; TASK_ACTIONS stays only for its friendlier labels
 *  on the common path. */
export function allTaskMoves(): Array<{ stage: string; label: string; options: Array<{ value: string; label: string }> }> {
  return Object.entries(TASK_STAGE_STATUSES).map(([stage, statuses]) => ({
    stage,
    label: TASK_STAGE_LABELS[stage] || stage,
    options: statuses.map((status) => ({
      value: `${stage}|${status}`,
      label: TASK_STATUS_LABELS[status] || status,
    })),
  }));
}

/** Kept for the quick-action labels ("Send for Client Review"). No longer a
 *  restriction — see allTaskMoves(). */
export function taskActionsFor(stage: string, _isInternal?: boolean): Array<{ value: string; label: string }> {
  return TASK_ACTIONS[stage] || [];
}

// ─── Modal props ─────────────────────────────────────────────────────────

export interface ConsultingProjectModalProps {
  open: boolean;
  projectId: string | null;
  onClose: () => void;
  /** Re-fire after a status change so the parent list refreshes. */
  onChanged?: () => void;
  /** Founder vs. client lens. F1 is founder-only; the prop is kept so
   *  later phases (client portal view) can swap copy without a rewrite. */
  viewerRole?: "founder" | "client";
}

// ─── Component ───────────────────────────────────────────────────────────

export function ConsultingProjectModal({
  open,
  projectId,
  onClose,
  onChanged,
  viewerRole = "founder",
}: ConsultingProjectModalProps) {
  const { get, post, patch, del } = useOliverApi();

  const [tab, setTab] = useState<"overview" | "milestones" | "tasks" | "deliverables" | "details" | "activity" | "invoices" | "proposals">("overview");
  const [data, setData] = useState<WorkspaceResponse | null>(null);
  // Editable project details (Category / Owner / Total budget). Picker sources
  // are loaded once per open, founder-only — clients never edit these.
  const [savingDetail, setSavingDetail] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState<Array<{ category_id: string; name: string }>>([]);
  const [ownerOptions, setOwnerOptions] = useState<Array<{ user_id: string; label: string }>>([]);
  // PB-2 — milestone-anchored onboarding launcher. Opened by the "Start
  // Onboarding" button on the Platform-Provisioning milestone; scoped to the
  // project's linked_tenant_id.
  const [onboardWizardOpen, setOnboardWizardOpen] = useState(false);
  // PB-4 (Δ4): view-as (consulting act-as) shell — the founder verifies the
  // client's setup here before completing the Walkthrough & Handover milestone.
  const [viewAsOpen, setViewAsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);
  // Tasks tab — opening a row reuses the SAME task modal the Milestones tab
  // uses, so the two surfaces cannot drift on what editing a task means.
  const [tasksTabTask, setTasksTabTask] = useState<ConsultingTask | null>(null);
  const [milestoneNotice, setMilestoneNotice] = useState<string | null>(null);
  // CS-1 — milestone metadata edit target (null = closed).
  const [editingMilestone, setEditingMilestone] = useState<ConsultingProjectMilestone | null>(null);
  // CS-2 — add-milestone modal open flag.
  const [addingMilestone, setAddingMilestone] = useState(false);
  // F4 — Send Intake modal trigger. Founder-only surface; the modal itself
  // re-checks via the backend (founder-gated endpoint) so a stray click
  // from a future client lens variant won't get past the API.
  const [showSendIntake, setShowSendIntake] = useState(false);
  // Milestone that a Send-Intake was launched from (null = project-level).
  const [intakeMilestoneId, setIntakeMilestoneId] = useState<string | null>(null);
  // Documents surfaced per-milestone: intakes + proposals for this project.
  const [intakes, setIntakes] = useState<IntakeSubRow[]>([]);
  const [projProposals, setProjProposals] = useState<ProposalRow[]>([]);
  // Add-document (attach any template to a milestone). Null = closed.
  const [addDocMilestoneId, setAddDocMilestoneId] = useState<string | null>(null);
  const [showAddDoc, setShowAddDoc] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setErr(null);
    try {
      // useOliverApi auto-unwraps the {data:...} envelope (oliverApi.ts:113).
      const r = await get<WorkspaceResponse>(`/consulting/projects/${projectId}`);
      setData(r);
      // Load documents surfaced on milestones (non-fatal if either fails).
      try {
        const ik = await get<{ submissions: IntakeSubRow[] }>(`/consulting/projects/${projectId}/intake-submissions?include_drafts=1`);
        setIntakes(Array.isArray(ik?.submissions) ? ik.submissions : []);
      } catch { /* non-fatal */ }
      try {
        const pr = await get<{ proposals: ProposalRow[] }>(`/proposals?project_id=${encodeURIComponent(projectId)}`);
        setProjProposals(Array.isArray(pr?.proposals) ? pr.proposals : []);
      } catch { /* non-fatal */ }
    } catch (e) {
      setErr((e as Error).message || "Could not load project");
    } finally {
      setLoading(false);
    }
  }, [get, projectId]);

  useEffect(() => {
    if (!open || !projectId) return;
    setTab("overview");
    setMilestoneNotice(null);
    void load();
  }, [open, projectId, load]);

  // Picker sources for the editable detail fields. Founder-only; failures are
  // non-fatal (the field just falls back to read-only text rather than breaking
  // the whole modal).
  useEffect(() => {
    if (!open || viewerRole !== "founder") return;
    let cancelled = false;
    (async () => {
      try {
        const r = await get<{ data?: Array<{ category_id: string; name: string }> }>("/consulting/categories");
        const list = (r as { data?: Array<{ category_id: string; name: string }> })?.data ?? (r as unknown as Array<{ category_id: string; name: string }>);
        if (!cancelled && Array.isArray(list)) setCategoryOptions(list);
      } catch { /* leave empty — field renders read-only */ }
      try {
        const r = await get<{ data?: Array<Record<string, string>> }>("/tenant-users");
        const list = (r as { data?: Array<Record<string, string>> })?.data ?? (r as unknown as Array<Record<string, string>>);
        if (!cancelled && Array.isArray(list)) {
          setOwnerOptions(
            list
              .filter((u) => u.user_id)
              .map((u) => ({ user_id: u.user_id, label: (u.full_name || "").trim() || u.email || u.user_id }))
          );
        }
      } catch { /* leave empty — field renders read-only */ }
    })();
    return () => { cancelled = true; };
  }, [open, viewerRole, get]);

  // NOTE: hooks must run BEFORE the early return below — keep useMemo here.
  const project = data?.project;
  const milestones = useMemo(
    () => (data?.milestones || []).slice().sort((a, b) => a.sort_order - b.sort_order),
    [data?.milestones],
  );

  // Founder-facing next-step banner. Prefer the server-computed string —
  // never derive client-side (per SCOPE_WORKING.md line 3149).
  const nextStepBanner = useMemo(() => {
    if (!project) return null;
    if (project.status === "awaiting_client_response" && viewerRole === "founder") {
      return project.next_step_for_founder || "Awaiting client review";
    }
    const fromServer = viewerRole === "founder"
      ? project.next_step_for_founder
      : project.next_step_for_client;
    if (fromServer) return `Your next step: ${fromServer}`;
    // Fallback — find the first non-complete milestone name. The server
    // SHOULD return next_step_for_*; this is just a safety net.
    const nextOpen = milestones.find(m => m.status !== "complete" && m.status !== "skipped");
    if (nextOpen) return `Your next step: ${nextOpen.name}`;
    return null;
  }, [project, milestones, viewerRole]);

  if (!open || !projectId) return null;

  async function handleStatusChange(next: ProjectStatus) {
    if (!project) return;
    setErr(null);
    try {
      // PATCH /consulting/projects/:id is live (backend commit dfb6567).
      // Terminal statuses (closed/completed/cancelled) stamp closed_at server-side.
      await patch(`/consulting/projects/${project.project_id}`, { status: next });
      await load();
      onChanged?.();
    } catch (e) {
      setErr((e as Error).message || "Could not save status");
    }
  }

  /**
   * Save any project detail field. PATCH /consulting/projects/:id previously
   * accepted ONLY status + name — every other field came back 400 "nothing to
   * update", which is why Category / Owner / Total budget were unfixable from
   * the UI. The endpoint now validates and accepts them. Mirrors
   * handleStatusChange: patch → reload → tell the parent list.
   */
  async function handleDetailPatch(fields: Record<string, unknown>) {
    if (!project) return;
    setErr(null);
    setSavingDetail(true);
    try {
      await patch(`/consulting/projects/${project.project_id}`, fields);
      await load();
      onChanged?.();
    } catch (e) {
      setErr((e as Error).message || "Could not save");
    } finally {
      setSavingDetail(false);
    }
  }

  // Delete (archive) the whole project — founder only. Hides it from the list
  // immediately; reversible server-side. Confirm-guarded against misclicks.
  async function handleDeleteProject() {
    if (!project) return;
    // Inline 2-click confirm instead of window.confirm(): the native dialog
    // blocked automated testing and could read as a page freeze. First click
    // arms (button turns red "Confirm delete?"); second click within 4s deletes.
    if (!deleteArmed) {
      setDeleteArmed(true);
      setTimeout(() => setDeleteArmed(false), 4000);
      return;
    }
    setDeleteArmed(false);
    setErr(null);
    try {
      await del(`/consulting/projects/${project.project_id}`);
      onChanged?.();
      onClose();
    } catch (e) {
      setErr((e as Error).message || "Could not delete project");
    }
  }

  async function handleMilestoneStatusChange(mid: string, next: MilestoneStatus) {
    setMilestoneNotice(null);
    try {
      // PATCH /consulting/projects/:id/milestones/:mid is live (backend commit
      // dfb6567). complete stamps completed_at + auto-advances the next
      // milestone; un-complete clears completed_at (Brandon's Rolling In It
      // case); is_payment_trigger milestones flip payment_charge_status='ready'.
      await patch(`/consulting/projects/${projectId}/milestones/${mid}`, { status: next });
      await load();
      onChanged?.();
    } catch (e) {
      setMilestoneNotice((e as Error).message || "Could not save milestone status");
    }
  }

  // CS-2 — delete a milestone (confirm-guarded). The backend blocks
  // complete / paid / deliverable-bearing milestones with a friendly 409,
  // surfaced in the milestone notice.
  async function handleDeleteMilestone(m: ConsultingProjectMilestone) {
    if (!window.confirm(`Delete milestone "${m.name}"? This can't be undone.`)) return;
    setMilestoneNotice(null);
    try {
      await del(`/consulting/projects/${projectId}/milestones/${m.milestone_id}`);
      await load();
      onChanged?.();
    } catch (e) {
      setMilestoneNotice((e as Error).message || "Could not delete milestone");
    }
  }

  // Create an OLIVER proposal already linked to this milestone. The draft opens
  // for line items + send in OLIVER › Proposals; it shows on the milestone here.
  async function handleCreateProposal(milestoneId: string) {
    if (!project) return;
    setMilestoneNotice(null);
    try {
      await post(`/proposals`, {
        title: `${project.name} — Proposal`,
        project_id: project.project_id,
        milestone_id: milestoneId,
      });
      await load();
      onChanged?.();
      setMilestoneNotice("Proposal created and linked to this milestone. Open OLIVER › Proposals to add line items and send it.");
    } catch (e) {
      setMilestoneNotice((e as Error).message || "Could not create proposal");
    }
  }

  // Remove an attached document (intake/scoping/custom) from its milestone.
  async function handleRemoveIntake(submissionId: string) {
    if (!window.confirm("Remove this document from the milestone? This can't be undone.")) return;
    setMilestoneNotice(null);
    try {
      await del(`/consulting/intake-submissions/${submissionId}`);
      await load();
      onChanged?.();
    } catch (e) {
      setMilestoneNotice((e as Error).message || "Could not remove document");
    }
  }

  // Unlink a proposal from its milestone. Keeps the proposal itself (just clears
  // the project/milestone link) so it stays available in OLIVER › Proposals.
  async function handleRemoveProposal(proposalId: string) {
    if (!window.confirm("Unlink this proposal from the milestone? The proposal itself is kept.")) return;
    setMilestoneNotice(null);
    try {
      await post(`/proposals/${proposalId}/link`, { project_id: null, milestone_id: null });
      await load();
      onChanged?.();
    } catch (e) {
      setMilestoneNotice((e as Error).message || "Could not unlink proposal");
    }
  }

  const headerSubtitle = project ? (
    <span className="flex items-center gap-2">
      {project.category_name && (
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
          {project.category_name}
        </span>
      )}
      <PhasePill status={project.status} />
      {project.client_name && <span className="truncate">· {project.client_name}</span>}
      {!project.client_name && project.client_email && (
        <span className="truncate">· {project.client_email}</span>
      )}
      {!project.client_name && !project.client_email && (
        <span className="truncate text-white/50">· Internal project</span>
      )}
    </span>
  ) : undefined;

  // F4 — Show "Send Intake" only for founder viewer + when we have a real
  // loaded project to bind the submission to. Disabled for internal projects
  // (no client to email) — the picker would have no recipient.
  const canSendIntake = viewerRole === "founder" && !!project && (!!project.client_email || !!project.client_name);

  return (
    <IadmModal
      open={open}
      onClose={onClose}
      product="oliver"
      eyebrow="IA CONSULTING · PROJECT"
      title={project?.name || (loading ? "Loading…" : "Project")}
      subtitle={headerSubtitle}
      size="info"
      headerActions={
        viewerRole === "founder" && project ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSendIntake(true)}
              disabled={!canSendIntake}
              title={
                canSendIntake
                  ? "Pick an intake template and email the client a link"
                  : "Add a client contact to enable Send Intake"
              }
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "#FEC82C", color: "#1A3A4A" }}
            >
              <Send className="h-3.5 w-3.5" />
              Send Intake
            </button>
            <button
              type="button"
              onClick={handleDeleteProject}
              title="Delete this project (removes it from your list)"
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold ${deleteArmed ? "border-rose-400 bg-rose-500 text-white hover:bg-rose-600" : "border-white/30 text-white/90 hover:bg-white/10"}`}
            >
              {deleteArmed ? "Confirm delete?" : "Delete"}
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="flex h-full flex-col">
        {/* Tab strip — Overview + Milestones live; the rest are disabled
            preview chips that surface what's coming in F2-F4. */}
        <div className="flex items-center gap-1 border-b border-slate-200 bg-white px-4">
          <TabButton active={tab === "overview"} onClick={() => setTab("overview")}>Overview</TabButton>
          <TabButton active={tab === "milestones"} onClick={() => setTab("milestones")}>
            Milestones
            {milestones.length > 0 && (
              <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                {milestones.length}
              </span>
            )}
          </TabButton>
          <TabButton active={tab === "tasks"} onClick={() => setTab("tasks")}>
            Tasks
            {(data?.tasks?.length ?? 0) > 0 && (
              <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                {data?.tasks?.length}
              </span>
            )}
          </TabButton>
          <TabButton active={tab === "deliverables"} onClick={() => setTab("deliverables")}>
            Deliverables
            {(data?.deliverables?.length ?? 0) > 0 && (
              <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                {data?.deliverables?.length}
              </span>
            )}
          </TabButton>
          <TabButton active={tab === "details"} onClick={() => setTab("details")}>Details</TabButton>
          <TabButton active={tab === "activity"} onClick={() => setTab("activity")}>Activity</TabButton>
          <TabButton active={tab === "invoices"} onClick={() => setTab("invoices")}>Invoices</TabButton>
          <TabButton active={tab === "proposals"} onClick={() => setTab("proposals")}>Proposals</TabButton>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-50">
          {err && (
            <div className="m-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {err}
            </div>
          )}
          {loading && !data && (
            <div className="px-6 py-10 text-center text-sm text-slate-500">Loading project…</div>
          )}
          {!loading && !err && !data && (
            <div className="px-6 py-10 text-center text-sm text-slate-500">No project data.</div>
          )}
          {data && tab === "overview" && (
            <OverviewTab
              project={data.project}
              milestoneCount={milestones.length}
              milestonesComplete={milestones.filter(m => m.status === "complete").length}
              nextStepBanner={nextStepBanner}
              viewerRole={viewerRole}
              onStatusChange={handleStatusChange}
              onAccessPortal={() => setViewAsOpen(true)}
              categoryOptions={categoryOptions}
              ownerOptions={ownerOptions}
              savingDetail={savingDetail}
              onDetailPatch={handleDetailPatch}
            />
          )}
          {data && tab === "milestones" && (
            <MilestonesTab
              milestones={milestones}
              viewerRole={viewerRole}
              notice={milestoneNotice}
              onStatusChange={handleMilestoneStatusChange}
              onEditMilestone={viewerRole === "founder" ? setEditingMilestone : undefined}
              onAddMilestone={viewerRole === "founder" ? () => setAddingMilestone(true) : undefined}
              onDeleteMilestone={viewerRole === "founder" ? handleDeleteMilestone : undefined}
              canOnboard={Boolean(data.project.linked_tenant_id)}
              onStartOnboarding={() => setOnboardWizardOpen(true)}
              intakes={intakes}
              proposals={projProposals}
              tasks={data.tasks || []}
              taskDeliverables={data.deliverables || []}
              projectId={data.project.project_id}
              onTasksChanged={load}
              onSendIntake={viewerRole === "founder" ? (mid) => { setIntakeMilestoneId(mid); setShowSendIntake(true); } : undefined}
              onAddDocument={viewerRole === "founder" ? (mid) => { setAddDocMilestoneId(mid); setShowAddDoc(true); } : undefined}
              onCreateProposal={viewerRole === "founder" ? handleCreateProposal : undefined}
              onRemoveIntake={viewerRole === "founder" ? handleRemoveIntake : undefined}
              onRemoveProposal={viewerRole === "founder" ? handleRemoveProposal : undefined}
            />
          )}
          {data && tab === "deliverables" && (
            <DeliverablesTab
              deliverables={data.deliverables || []}
              milestones={milestones}
              projectId={data.project.project_id}
              viewerRole={viewerRole}
              onChanged={load}
            />
          )}
          {data && tab === "tasks" && (
            <ProjectTasksTab
              tasks={data.tasks || []}
              milestones={milestones}
              onOpenTask={viewerRole === "founder" ? setTasksTabTask : undefined}
            />
          )}
          {/* Details replaced Notes (Brandon 2026-08-08). The notes THREAD is
              not deleted with the tab — it renders inside Details, because a
              tab that disappears takes its history out of reach. */}
          {data && tab === "details" && (
            <ProjectDetailsTab
              project={data.project}
              capacity={data.capacity}
              viewerRole={viewerRole}
              savingDetail={savingDetail}
              onDetailPatch={handleDetailPatch}
              notesSlot={<ProjectNotesTab projectId={data.project.project_id} viewerRole={viewerRole} />}
            />
          )}
          {data && tab === "activity" && (
            <ProjectActivityTab
              project={data.project}
              milestones={milestones}
              deliverables={data.deliverables || []}
            />
          )}
          {data && tab === "invoices" && (
            <PaymentScheduleTab projectId={data.project.project_id} viewerRole={viewerRole} />
          )}
          {data && tab === "proposals" && (
            <ProposalsTab projectId={data.project.project_id} milestones={milestones} viewerRole={viewerRole} />
          )}
        </div>
      </div>

      {/* F4 — Send Intake nested modal. Mounted INSIDE the IadmModal body so
          the founder doesn't lose project context while picking a template.
          The nested IadmModal renders above its parent via fixed positioning
          (see IadmModal's overlay z-index). */}
      {tasksTabTask && (
        <TaskDetailModal
          task={tasksTabTask}
          deliverables={(data?.deliverables || [])
            .filter((d) => d.service_request_id === tasksTabTask.id)
            .map((d) => ({
              deliverable_id: d.deliverable_id,
              title: d.title,
              file_name: d.file_name,
              file_url: d.file_url,
              status: d.status,
            }))}
          onClose={() => setTasksTabTask(null)}
          onChanged={() => { setTasksTabTask(null); void load(); onChanged?.(); }}
        />
      )}

      {showSendIntake && project && (
        <SendIntakeModal
          projectId={project.project_id}
          milestoneId={intakeMilestoneId}
          clientName={project.client_name || null}
          clientEmail={project.client_email || null}
          onClose={() => { setShowSendIntake(false); setIntakeMilestoneId(null); }}
          onSent={() => {
            setShowSendIntake(false);
            setIntakeMilestoneId(null);
            void load();
            onChanged?.();
          }}
        />
      )}

      {/* Attach ANY document template (scoping doc, intake, scope-of-work, custom)
          to a milestone — no email, just files it on the step. */}
      {showAddDoc && project && (
        <AddDocumentModal
          projectId={project.project_id}
          milestoneId={addDocMilestoneId}
          clientEmail={project.client_email || null}
          onCreateProposal={(mid) => { setShowAddDoc(false); setAddDocMilestoneId(null); handleCreateProposal(mid); }}
          onClose={() => { setShowAddDoc(false); setAddDocMilestoneId(null); }}
          onAdded={() => {
            setShowAddDoc(false);
            setAddDocMilestoneId(null);
            void load();
            onChanged?.();
          }}
        />
      )}

      {/* CS-1 — milestone metadata edit modal. PATCHes the milestone route with
          the metadata fields (no `status`), so the backend takes the edit branch
          and skips the status-transition side effects. */}
      {editingMilestone && (
        <EditMilestoneModal
          milestone={editingMilestone}
          onClose={() => setEditingMilestone(null)}
          onSave={async (fields) => {
            await patch(`/consulting/projects/${projectId}/milestones/${editingMilestone.milestone_id}`, fields);
            await load();
            onChanged?.();
            setEditingMilestone(null);
          }}
        />
      )}

      {/* CS-2 — add-milestone modal. Reuses EditMilestoneModal in create mode;
          POSTs to the new add route (appends at sort_order MAX+1). */}
      {addingMilestone && (
        <EditMilestoneModal
          title="Add milestone"
          submitLabel="Add milestone"
          milestone={{ milestone_id: "", sort_order: 0, name: "", status: "not_started" } as ConsultingProjectMilestone}
          onClose={() => setAddingMilestone(false)}
          onSave={async (fields) => {
            await post(`/consulting/projects/${projectId}/milestones`, fields);
            await load();
            onChanged?.();
            setAddingMilestone(false);
          }}
        />
      )}

      {/* PB-2 — milestone-anchored onboarding wizard. Launched from the
          Platform-Provisioning milestone's "Start Onboarding" button; scoped to
          the client's tenant (Business/User profile → platform onboarding). */}
      {data?.project?.linked_tenant_id && (
        <OnboardingWizardModal
          open={onboardWizardOpen}
          tenantId={onboardWizardOpen ? data.project.linked_tenant_id : null}
          tenantName={data.project.client_name || undefined}
          mode="onboarding"
          deferWelcome

          onClose={() => { setOnboardWizardOpen(false); void load(); onChanged?.(); }}
          onFinished={() => { void load(); onChanged?.(); }}
        />
      )}

      {/* PB-4 (Δ4) — view-as (consulting act-as) shell for founder verification. */}
      {data?.project?.linked_tenant_id && (
        <OnboardingWizardModal
          open={viewAsOpen}
          tenantId={viewAsOpen ? data.project.linked_tenant_id : null}
          tenantName={data.project.client_name || undefined}
          mode="consulting"
          onClose={() => setViewAsOpen(false)}
        />
      )}
    </IadmModal>
  );
}

// ─── ProposalsTab — link OLIVER proposals to this project + milestone ─────
interface IntakeSubRow {
  submission_id: string;
  milestone_id?: string | null;
  template_name?: string | null;
  template_slug?: string | null;
  score_total?: number | null;
  is_draft?: boolean;
  submitted_at?: string | null;
}

interface ProposalRow {
  proposal_id: string;
  title?: string | null;
  status?: string | null;
  total?: number | null;
  project_id?: string | null;
  milestone_id?: string | null;
}

function ProposalsTab({ projectId, milestones, viewerRole }: {
  projectId: string;
  milestones: ConsultingProjectMilestone[];
  viewerRole?: string;
}) {
  const { get, post } = useOliverApi();
  const [linked, setLinked] = useState<ProposalRow[]>([]);
  const [all, setAll] = useState<ProposalRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pickProposal, setPickProposal] = useState("");
  const [pickMilestone, setPickMilestone] = useState("");
  const [linking, setLinking] = useState(false);

  const money = (n: number | null | undefined) =>
    `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const loadProposals = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const r = await get<{ proposals: ProposalRow[] }>(`/proposals?project_id=${encodeURIComponent(projectId)}`);
      setLinked(Array.isArray(r?.proposals) ? r.proposals : []);
      const a = await get<{ proposals: ProposalRow[] }>(`/proposals`);
      setAll(Array.isArray(a?.proposals) ? a.proposals : []);
    } catch (e) {
      setErr((e as Error).message || "Could not load proposals");
    } finally {
      setLoading(false);
    }
  }, [get, projectId]);

  useEffect(() => { void loadProposals(); }, [loadProposals]);

  const unlinked = all.filter((p) => !p.project_id && p.status !== "declined");

  async function handleLink() {
    if (!pickProposal) return;
    setLinking(true); setErr(null);
    try {
      await post(`/proposals/${pickProposal}/link`, { project_id: projectId, milestone_id: pickMilestone || null });
      setPickProposal(""); setPickMilestone("");
      await loadProposals();
    } catch (e) {
      setErr((e as Error).message || "Could not link proposal");
    } finally {
      setLinking(false);
    }
  }

  return (
    <div className="px-5 py-4 space-y-5 text-sm">
      {err && <div className="rounded-lg bg-red-50 text-red-700 px-3 py-2 text-xs">{err}</div>}
      <section>
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Proposals on this project</div>
        {loading ? (
          <div className="text-xs text-slate-500">Loading…</div>
        ) : linked.length === 0 ? (
          <div className="text-xs text-slate-500 italic">No proposals linked yet.</div>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 overflow-hidden">
            {linked.map((p) => {
              const ms = milestones.find((m) => m.milestone_id === p.milestone_id);
              return (
                <li key={p.proposal_id} className="px-3 py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-800 truncate">{p.title || "(untitled proposal)"}</div>
                    <div className="text-[11px] text-slate-500">
                      {money(p.total)}{ms ? ` · advances "${ms.name}" on accept` : ""}
                    </div>
                  </div>
                  <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500 flex-shrink-0">
                    {String(p.status || "—").replace(/_/g, " ")}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {viewerRole === "founder" && (
        <section className="rounded-lg border border-slate-200 p-3 space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Link an existing proposal</div>
          <select value={pickProposal} onChange={(e) => setPickProposal(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm">
            <option value="">Select a proposal…</option>
            {unlinked.map((p) => (
              <option key={p.proposal_id} value={p.proposal_id}>
                {(p.title || "(untitled)") + " — " + money(p.total) + " (" + (p.status || "") + ")"}
              </option>
            ))}
          </select>
          <select value={pickMilestone} onChange={(e) => setPickMilestone(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm">
            <option value="">Advance which milestone when accepted? (optional)</option>
            {milestones.map((m) => (
              <option key={m.milestone_id} value={m.milestone_id}>{m.name}</option>
            ))}
          </select>
          <button onClick={handleLink} disabled={!pickProposal || linking}
            className="px-4 py-2 rounded-lg text-white font-semibold text-xs disabled:opacity-50"
            style={{ background: "#1A3A4A" }}>
            {linking ? "Linking…" : "Link proposal to project"}
          </button>
          <p className="text-[11px] text-slate-500">
            Create a new proposal in OLIVER → Proposals, then link it here. When the client accepts it, the milestone above advances automatically.
          </p>
        </section>
      )}
    </div>
  );
}

// ─── SendIntakeModal — F4 ────────────────────────────────────────────────
// Founder picks an intake template + confirms recipient email → backend
// creates a consulting.intake_submission row, sends a SPARK automation
// email with the /app/consulting/intake/:submissionId link, and returns
// the new submission_id for the project's deliverable list.
//
// Endpoints (F4 backend):
//   GET  /consulting/document-templates?kind=intake  → picker list
//   POST /consulting/projects/:id/intake-submissions  → create submission
//          body: { template_id, send_email: true, recipient_email?, message? }

interface IntakeTemplatePickerRow {
  template_id: string;
  slug: string;
  scope: "system" | "founder" | "per_tenant";
  name: string;
  description?: string | null;
  version: number;
}

function SendIntakeModal({
  projectId, milestoneId, clientName, clientEmail, onClose, onSent,
}: {
  projectId: string;
  milestoneId?: string | null;
  clientName: string | null;
  clientEmail: string | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const { get, post } = useOliverApi();

  const [templates, setTemplates] = useState<IntakeTemplatePickerRow[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [recipientEmail, setRecipientEmail] = useState<string>(clientEmail || "");
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    get<{ templates: IntakeTemplatePickerRow[] }>("/consulting/document-templates?kind=intake")
      .then((r) => {
        if (cancelled) return;
        const list = Array.isArray(r?.templates) ? r.templates : [];
        setTemplates(list);
        if (list.length > 0) setTemplateId(list[0].template_id);
      })
      .catch((e) => {
        if (cancelled) return;
        // FIX-6 (2026-07-22): real error, not the false "not deployed" mask.
        setError((e as Error).message || "Could not load intake templates");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [get]);

  async function handleSend() {
    if (!templateId) { setError("Pick a template."); return; }
    if (!recipientEmail.trim()) { setError("Recipient email is required."); return; }
    setSending(true);
    setError(null);
    try {
      await post(`/consulting/projects/${projectId}/intake-submissions`, {
        template_id: templateId,
        milestone_id: milestoneId || null,
        send_email: true,
        recipient_email: recipientEmail.trim(),
        message: message.trim() || null,
      });
      onSent();
    } catch (e) {
      // FIX-6 (2026-07-22): real error, not the false "not deployed" mask.
      setError((e as Error).message || "Send failed");
    } finally {
      setSending(false);
    }
  }

  const selectedTemplate = templates.find((t) => t.template_id === templateId) || null;

  return (
    <IadmModal
      open
      onClose={onClose}
      product="oliver"
      eyebrow="SEND INTAKE"
      title="Send an intake form"
      subtitle={
        <span className="text-xs">
          Pick a template, confirm the recipient, and we'll email the client a link to fill it out.
        </span>
      }
      size="info"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded border border-slate-300 text-xs font-semibold text-slate-700 bg-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !templateId || !recipientEmail.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold text-white disabled:opacity-50"
            style={{ background: CORE_BLUE }}
          >
            <Send className="h-3.5 w-3.5" />
            {sending ? "Sending…" : "Create & email link"}
          </button>
        </div>
      }
    >
      <div className="px-5 py-4 space-y-4 overflow-y-auto">
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 inline-flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" /> {error}
          </div>
        )}

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
            Template
          </label>
          {loading ? (
            <div className="text-xs text-slate-500 italic">Loading intake templates…</div>
          ) : templates.length === 0 ? (
            <div className="text-xs text-slate-500 italic">
              No intake templates yet — build one in <strong>Consulting · Document Library</strong>.
            </div>
          ) : (
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm bg-white"
            >
              {templates.map((t) => (
                <option key={t.template_id} value={t.template_id}>
                  {t.name} {t.scope === "system" ? "(system)" : ""} · v{t.version}
                </option>
              ))}
            </select>
          )}
          {selectedTemplate?.description && (
            <p className="text-[11px] text-slate-500 mt-1">{selectedTemplate.description}</p>
          )}
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
            Recipient email
          </label>
          <input
            type="email"
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
            placeholder={clientName ? `${clientName}'s email` : "client@example.com"}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
          <p className="text-[11px] text-slate-500 mt-0.5">
            We'll send a short SPARK email with a link to <code>/app/consulting/intake/&lt;submission&gt;</code>.
          </p>
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
            Personal note (optional)
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="Add a personal note (optional)"
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>

        <p className="text-[10px] italic text-slate-500">
          A snapshot will be filed to the project's Deliverables tab after the client submits.
        </p>
      </div>
    </IadmModal>
  );
}

// ─── AddDocumentModal ──────────────────────────────────────────────────────
// Attach ANY document template to a milestone (scoping doc, scope-of-work,
// custom deliverable, or an intake to fill later). No email — this just files
// the document onto the step. Emailing a fillable intake link is the separate
// "Send intake" action. Backs POST /consulting/projects/:id/intake-submissions
// (which now accepts any template kind, not just intake).
interface DocTemplatePickerRow {
  template_id: string;
  slug: string;
  scope: "system" | "founder" | "per_tenant";
  kind: string;
  name: string;
  description?: string | null;
  version: number;
}

function AddDocumentModal({
  projectId, milestoneId, clientEmail, onClose, onAdded, onCreateProposal,
}: {
  projectId: string;
  milestoneId?: string | null;
  clientEmail?: string | null;
  onClose: () => void;
  onAdded: () => void;
  onCreateProposal?: (milestoneId: string) => void;
}) {
  const { get, post, uploadFounder } = useOliverApi();

  const [templates, setTemplates] = useState<DocTemplatePickerRow[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [sendNow, setSendNow] = useState(true);
  const [recipient, setRecipient] = useState<string>(clientEmail || "");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Upload-a-file branch. This picker previously offered ONLY pre-made
  // templates, so an authored document (a growth plan, an audit) could not be
  // attached to a step at all — the capability existed on the Deliverables tab
  // but not here, which is where the founder actually works.
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");

  useEffect(() => { setRecipient(clientEmail || ""); }, [clientEmail]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    get<{ templates: DocTemplatePickerRow[] }>("/consulting/document-templates")
      .then((r) => {
        if (cancelled) return;
        const list = Array.isArray(r?.templates) ? r.templates : [];
        setTemplates(list);
        if (list.length > 0) setTemplateId(list[0].template_id);
      })
      .catch((e) => { if (!cancelled) setError((e as Error).message || "Could not load templates"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [get]);

  const isProposal = templateId === "__proposal__";
  const isUpload = templateId === "__upload__";

  async function handleAdd() {
    if (!templateId) { setError("Pick a document."); return; }
    // A proposal is just a document type — create it in OLIVER, linked to this step.
    if (isProposal) {
      if (milestoneId && onCreateProposal) onCreateProposal(milestoneId);
      onClose();
      return;
    }
    // Upload branch — files land in consulting.deliverable, not as an intake
    // submission. Requires a milestone (CK_deliverable_attached_to_one).
    if (isUpload) {
      if (!uploadFile) { setError("Choose a file to upload."); return; }
      if (!milestoneId) { setError("A file must be attached to a milestone."); return; }
      setAdding(true);
      setError(null);
      try {
        const form = new FormData();
        form.append("file", uploadFile);
        form.append("milestone_id", milestoneId);
        form.append("title", uploadTitle.trim() || uploadFile.name);
        await uploadFounder(`/consulting/projects/${projectId}/deliverables`, form);
        onAdded();
      } catch (e) {
        setError((e as Error).message || "Could not upload the file");
      } finally {
        setAdding(false);
      }
      return;
    }
    setAdding(true);
    setError(null);
    try {
      await post(`/consulting/projects/${projectId}/intake-submissions`, {
        template_id: templateId,
        milestone_id: milestoneId || null,
        send_email: sendNow,
        recipient_email: recipient.trim() || undefined,
        message: note.trim() || undefined,
      });
      onAdded();
    } catch (e) {
      setError((e as Error).message || "Could not add document");
    } finally {
      setAdding(false);
    }
  }

  const selected = templates.find((t) => t.template_id === templateId) || null;

  return (
    <IadmModal
      open
      onClose={onClose}
      product="oliver"
      eyebrow="ADD DOCUMENT"
      title="Add a document to this step"
      subtitle={<span className="text-xs">Pick a document (a form or a proposal). Optionally send it to the client right now.</span>}
      size="info"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded border border-slate-300 text-xs font-semibold text-slate-700 bg-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAdd}
            disabled={adding || !templateId}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold text-white disabled:opacity-50"
            style={{ background: CORE_BLUE }}
          >
            {adding
              ? "Working…"
              : isProposal
                ? "Create proposal"
                : isUpload
                  ? "Upload file"
                  : sendNow
                    ? "Add & send"
                    : "Add document"}
          </button>
        </div>
      }
    >
      <div className="px-5 py-4 space-y-4 overflow-y-auto">
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 inline-flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" /> {error}
          </div>
        )}
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
            Document
          </label>
          {loading ? (
            <div className="text-xs text-slate-500 italic">Loading documents…</div>
          ) : (
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm bg-white"
            >
              <option value="__upload__">📎 Upload a file (PDF, DOCX, deck…)</option>
              {onCreateProposal && <option value="__proposal__">Proposal (create in OLIVER)</option>}
              {templates.map((t) => (
                <option key={t.template_id} value={t.template_id}>
                  {t.name}{t.kind !== "intake" ? ` · ${t.kind}` : ""}
                </option>
              ))}
            </select>
          )}
          {selected?.description && (
            <p className="text-[11px] text-slate-500 mt-1">{selected.description}</p>
          )}
        </div>

        {isUpload && (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                File <span className="font-normal normal-case text-slate-400">· max 50 MB</span>
              </label>
              <input
                type="file"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                className="block w-full text-xs text-slate-600 file:mr-3 file:rounded file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-slate-700"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                Title <span className="font-normal normal-case text-slate-400">(optional)</span>
              </label>
              <input
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                placeholder={uploadFile?.name || "Defaults to the file name"}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            {!milestoneId && (
              <p className="text-[11px] text-amber-700">
                Open <strong>+ Add document</strong> from a milestone to upload a file — every file is
                filed against a step.
              </p>
            )}
            <p className="text-[11px] text-slate-500">
              The file is filed to this step as a deliverable. Send it to the client from the
              Deliverables tab once you're ready.
            </p>
          </div>
        )}

        {!isProposal && !isUpload && (
          <>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={sendNow} onChange={(e) => setSendNow(e.target.checked)} />
              Send to the client now
            </label>
            {sendNow && (
              <>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                    Recipient (from the client's contact)
                  </label>
                  <input
                    type="email"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    placeholder="client@example.com"
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  {!recipient && (
                    <p className="text-[11px] text-amber-700 mt-0.5">No contact email on file — add one to the client, or type it here.</p>
                  )}
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                    Note (optional)
                  </label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    placeholder="Add a personal note (optional)"
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </div>
              </>
            )}
          </>
        )}
      </div>
    </IadmModal>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────

function TabButton({ active, onClick, children }: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative px-3 py-2.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
        active
          ? "text-slate-900"
          : "text-slate-500 hover:text-slate-700"
      }`}
    >
      {children}
      {active && (
        <span
          aria-hidden="true"
          className="absolute inset-x-2 -bottom-px h-0.5 rounded-full"
          style={{ background: OLIVER_GOLD }}
        />
      )}
    </button>
  );
}

function DisabledTab({ label }: { label: string }) {
  return (
    <span
      role="button"
      aria-disabled="true"
      title="Coming in F2"
      className="flex cursor-not-allowed items-center gap-1 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-300"
    >
      <Lock className="h-3 w-3" />
      {label}
      <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-400">F2</span>
    </span>
  );
}

const STATUS_PILL_STYLE: Record<ProjectStatus, { bg: string; fg: string; label: string }> = {
  active:                    { bg: "#DCFCE7", fg: "#166534", label: "Active" },
  paused:                    { bg: "#FEF3C7", fg: "#92400E", label: "Paused" },
  blocked:                   { bg: "#FEE2E2", fg: "#991B1B", label: "Blocked" },
  awaiting_client_response:  { bg: "#FEF3C7", fg: "#92400E", label: "Awaiting client" },
  awaiting_internal_review:  { bg: "#E0E7FF", fg: "#3730A3", label: "Awaiting internal" },
  payment_required:          { bg: "#FCE7F3", fg: "#9D174D", label: "Payment required" },
  closed:                    { bg: "#E2E8F0", fg: "#475569", label: "Closed" },
  completed:                 { bg: "#CFFAFE", fg: "#155E75", label: "Completed" },
  cancelled:                 { bg: "#F1F5F9", fg: "#64748B", label: "Cancelled" },
};

function PhasePill({ status }: { status: ProjectStatus }) {
  const s = STATUS_PILL_STYLE[status] || STATUS_PILL_STYLE.active;
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}

// ─── Overview tab ────────────────────────────────────────────────────────

function OverviewTab({
  project,
  milestoneCount,
  milestonesComplete,
  nextStepBanner,
  viewerRole,
  onStatusChange,
  onAccessPortal,
  categoryOptions = [],
  ownerOptions = [],
  savingDetail = false,
  onDetailPatch,
}: {
  project: ConsultingProjectRow;
  milestoneCount: number;
  milestonesComplete: number;
  nextStepBanner: string | null;
  viewerRole: "founder" | "client";
  onStatusChange: (s: ProjectStatus) => void;
  onAccessPortal?: () => void;
  // Editable project details (founder only). Defaults keep the component safe
  // to render read-only if a caller doesn't supply them.
  categoryOptions?: Array<{ category_id: string; name: string }>;
  ownerOptions?: Array<{ user_id: string; label: string }>;
  savingDetail?: boolean;
  onDetailPatch?: (fields: Record<string, unknown>) => void | Promise<void>;
}) {
  const progressPct = milestoneCount > 0
    ? Math.round((milestonesComplete / milestoneCount) * 100)
    : 0;

  return (
    <div className="space-y-4 px-5 py-4">
      {/* Next-step banner */}
      {nextStepBanner && (
        <div
          className="rounded-lg border px-4 py-3 text-sm font-semibold"
          style={{
            background: project.status === "awaiting_client_response" ? "#FEF3C7" : "#EFF6FF",
            color: project.status === "awaiting_client_response" ? "#92400E" : "#1E3A8A",
            borderColor: project.status === "awaiting_client_response" ? "#FCD34D" : "#BFDBFE",
          }}
        >
          {nextStepBanner}
        </div>
      )}

      {/* PB-4 (Δ4) — Access client portal (view-as). The founder verifies the
          client's setup here, then marks the Walkthrough & Handover milestone
          complete (which fires the welcome). Gated on a provisioned tenant. */}
      {viewerRole === "founder" && project.linked_tenant_id && onAccessPortal && (
        <button
          type="button"
          onClick={onAccessPortal}
          className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 transition-colors hover:bg-sky-100"
        >
          Access client portal (view-as) →
        </button>
      )}

      {/* Description + meta card */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Project description
        </div>
        <div className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
          {project.description?.trim() || (
            <span className="text-slate-400">No description.</span>
          )}
        </div>

        {/* Progress bar derived from milestone counts (per SCOPE line 3140). */}
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
            <span>{milestonesComplete}/{milestoneCount} milestones complete</span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${progressPct}%`, background: IL_BLUE }}
            />
          </div>
        </div>
      </div>

      {/* Two-column meta */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <MetaCard title="Category">
          {viewerRole === "founder" && categoryOptions.length ? (
            <select
              value={project.category_id || ""}
              disabled={savingDetail}
              onChange={(e) => void onDetailPatch?.({ category_id: e.target.value })}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm font-semibold disabled:opacity-60"
            >
              {categoryOptions.map((c) => (
                <option key={c.category_id} value={c.category_id}>{c.name}</option>
              ))}
            </select>
          ) : (
            <div className="text-sm font-semibold text-slate-800">
              {project.category_name || <span className="text-slate-400">Uncategorized</span>}
            </div>
          )}
        </MetaCard>

        <MetaCard title="Status">
          {viewerRole === "founder" ? (
            <select
              value={project.status}
              onChange={(e) => onStatusChange(e.target.value as ProjectStatus)}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm font-semibold"
            >
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="blocked">Blocked</option>
              <option value="awaiting_client_response">Awaiting client</option>
              <option value="awaiting_internal_review">Awaiting internal review</option>
              <option value="completed">Completed</option>
              <option value="closed">Closed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          ) : (
            <PhasePill status={project.status} />
          )}
        </MetaCard>

        <MetaCard title="Client">
          {project.client_name || project.client_email ? (
            <div className="space-y-0.5">
              {project.client_name && (
                <div className="text-sm font-semibold text-slate-800">{project.client_name}</div>
              )}
              {project.client_email && (
                <div className="text-xs text-slate-600">{project.client_email}</div>
              )}
              {project.client_phone && (
                <div className="text-xs text-slate-600">{project.client_phone}</div>
              )}
            </div>
          ) : (
            <span className="text-sm text-slate-400">Internal project</span>
          )}
        </MetaCard>

        <MetaCard title="Owner">
          <div className="flex items-center gap-2">
            {project.owner_avatar_url ? (
              <img
                src={project.owner_avatar_url}
                alt=""
                className="h-7 w-7 rounded-full border border-slate-200 object-cover"
              />
            ) : (
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                <User className="h-3.5 w-3.5" />
              </span>
            )}
            {viewerRole === "founder" && ownerOptions.length ? (
              <select
                value={project.owner_user_id || ""}
                disabled={savingDetail}
                onChange={(e) => void onDetailPatch?.({ owner_user_id: e.target.value || null })}
                className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm font-medium disabled:opacity-60"
              >
                <option value="">Unassigned</option>
                {ownerOptions.map((u) => (
                  <option key={u.user_id} value={u.user_id}>{u.label}</option>
                ))}
              </select>
            ) : (
              <span className="text-sm font-medium text-slate-800">
                {project.owner_display_name || <span className="text-slate-400">Unassigned</span>}
              </span>
            )}
          </div>
        </MetaCard>

        {/* Planned start vs actual start — the gap between them IS the slip.
            Both dates are set on the Details tab. */}
        <MetaCard title="Start">
          <div className="text-sm text-slate-800">
            {fmtProjectDate(project.start_date) || <span className="text-slate-400">Not scheduled</span>}
          </div>
          {project.started_at && (
            <div className="text-[11px] text-slate-500">
              actually started {formatDate(project.started_at)}
            </div>
          )}
        </MetaCard>

        {/* Was bound to `target_completion_date`, a column that does not exist —
            so this card rendered "—" no matter what was set. The real column is
            target_end_date (migration 151). */}
        <MetaCard title="Target end">
          <div className="text-sm text-slate-800">
            {fmtProjectDate(project.target_end_date) || <span className="text-slate-400">Not set</span>}
          </div>
        </MetaCard>

        <MetaCard title="Total budget">
          {viewerRole === "founder" ? (
            <input
              type="number"
              min={0}
              step="0.01"
              disabled={savingDetail}
              defaultValue={
                project.total_billable_cents == null ? "" : (project.total_billable_cents / 100).toFixed(2)
              }
              placeholder="Not set"
              // Save on blur / Enter — stored in CENTS, entered in dollars.
              onBlur={(e) => {
                const raw = e.target.value.trim();
                const next = raw === "" ? null : Math.round(Number(raw) * 100);
                if (raw !== "" && (!Number.isFinite(next as number) || (next as number) < 0)) return;
                if ((project.total_billable_cents ?? null) === next) return;
                void onDetailPatch?.({ total_billable_cents: next });
              }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm font-semibold disabled:opacity-60"
            />
          ) : (
            <div className="text-sm font-semibold text-slate-800">
              {formatMoney(project.total_billable_cents, project.currency) || (
                <span className="text-slate-400 font-normal">Not set</span>
              )}
            </div>
          )}
        </MetaCard>

        <MetaCard title="Last updated">
          <div className="text-sm text-slate-800">{formatDate(project.updated_at) || "—"}</div>
        </MetaCard>
      </div>
    </div>
  );
}

/** DATE columns come back as YYYY-MM-DD. Parsing one with `new Date()` treats it
 *  as UTC midnight and renders a day early in every western timezone — the same
 *  off-by-one that showed a 9/18 release as 9/17. Format from the string. */
function fmtProjectDate(v?: string | null): string {
  if (!v) return "";
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString();
}

function MetaCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

// ─── Milestones tab ──────────────────────────────────────────────────────

// ─── Task detail modal (shared: milestone tasks + Service Requests board) ──
// Open a task to edit title/description, change status, and attach the
// document the client will review — linked via service_request_id so the
// client sees ONE review item, not a task plus a floating doc.
export interface TaskDeliverable {
  deliverable_id: string;
  title?: string | null;
  file_name?: string | null;
  file_url?: string | null;
  status: string;
  /** 1 when the CLIENT uploaded it (their markup), not the agency. Returned by
   *  GET /consulting/requests but was never declared here. */
  is_client_supplied?: boolean | number | null;
}

export function TaskDetailModal({
  task,
  deliverables,
  onClose,
  onChanged,
}: {
  task: ConsultingTask;
  deliverables: TaskDeliverable[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { patchFounder, uploadFounder, download } = useOliverApi();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: string, fn: () => Promise<unknown>) {
    setBusy(kind);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  const saveMeta = () =>
    run("meta", () => patchFounder(`/consulting/requests/${task.id}`, {
      title: title.trim() || task.title,
      description: description.trim() || null,
    }));

  const transition = (value: string) => {
    const [stage, status] = value.split("|");
    if (!stage || !status || (stage === task.stage && status === task.status)) return;
    run("status", () => patchFounder(`/consulting/requests/${task.id}`, { stage, status }));
  };

  const attach = () => {
    if (!file) return;
    run("attach", async () => {
      const form = new FormData();
      form.append("file", file);
      form.append("title", file.name);
      await uploadFounder(`/consulting/requests/${task.id}/deliverables`, form);
      setFile(null);
    });
  };

  return (
    <IadmModal
      open
      onClose={onClose}
      product="oliver"
      eyebrow="TASK"
      title={task.title}
      subtitle={`${TASK_STAGE_LABELS[task.stage] || task.stage} · ${TASK_STATUS_LABELS[task.status] || task.status}${task.oliver_job_id ? " · synced to OLIVER" : ""}`}
      size="info"
    >
      <div className="space-y-4 p-4">
        {error && <div className="rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}

        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Status</label>
          <select
            value={`${task.stage}|${task.status}`}
            disabled={busy === "status"}
            onChange={(e) => transition(e.target.value)}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value={`${task.stage}|${task.status}`}>
              {busy === "status" ? "Saving…" : `${TASK_STAGE_LABELS[task.stage] || task.stage} — ${TASK_STATUS_LABELS[task.status] || task.status}`}
            </option>
            {allTaskMoves().map((g) => (
              <optgroup key={g.stage} label={g.label}>
                {g.options
                  .filter((o) => o.value !== `${task.stage}|${task.status}`)
                  .map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </optgroup>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <button type="button" onClick={saveMeta} disabled={busy === "meta"}
          className="rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:bg-slate-300">
          {busy === "meta" ? "Saving…" : "Save details"}
        </button>

        {task.open_revision_note && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-amber-800">
              Client requested changes
            </div>
            <div className="mt-1 whitespace-pre-wrap text-sm text-amber-900">
              {task.open_revision_note}
            </div>
            <div className="mt-1.5 text-[10px] text-amber-700">
              Closes automatically when you move this past Revision.
            </div>
          </div>
        )}

        <div className="border-t border-slate-100 pt-3">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Documents on this task
          </div>
          {deliverables.length === 0 ? (
            <div className="text-xs italic text-slate-400">No documents attached yet.</div>
          ) : (
            <ul className="space-y-1">
              {deliverables.map((d) => (
                <li key={d.deliverable_id} className="flex items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1.5 text-xs">
                  <span className="min-w-0 flex-1 truncate text-slate-700">
                    📄 {d.title || d.file_name} · {String(d.status).replace(/_/g, " ")}
                    {(d as ConsultingDeliverable & { is_client_supplied?: boolean | number }).is_client_supplied ? (
                      <span className="ml-1 rounded bg-violet-100 px-1 py-0.5 text-[9px] font-bold uppercase text-violet-700">
                        client markup
                      </span>
                    ) : null}
                  </span>
                  {d.file_url && (
                    <button type="button"
                      onClick={() => download(`/consulting/deliverables/${d.deliverable_id}/download`, d.file_name || d.title || "document")}
                      className="flex-shrink-0 font-semibold text-sky-700 hover:underline">
                      Download
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex items-center gap-2">
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="min-w-0 flex-1 text-xs text-slate-600 file:mr-2 file:rounded file:border-0 file:bg-slate-900 file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-white" />
            <button type="button" onClick={attach} disabled={!file || busy === "attach"}
              className="rounded bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white disabled:bg-slate-300">
              {busy === "attach" ? "Attaching…" : "Attach"}
            </button>
          </div>
        </div>
      </div>
    </IadmModal>
  );
}

// ─── Milestone tasks (consulting.service_request) ─────────────────────────
// Self-contained like DeliverableActionPanel: POSTs via useOliverApi, then
// onChanged() → the host re-fetches. Founder gets add + transitions; client
// sees a read-only list (their approve/revision actions live on the client
// Service Requests surface).
function MilestoneTasksSection({
  projectId,
  milestoneId,
  tasks,
  deliverables = [],
  viewerRole,
  onChanged,
}: {
  projectId: string;
  milestoneId: string;
  tasks: ConsultingTask[];
  deliverables?: ConsultingDeliverable[];
  viewerRole: "founder" | "client";
  onChanged: () => void;
}) {
  const { postFounder, patchFounder } = useOliverApi();
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openTask, setOpenTask] = useState<ConsultingTask | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    const t = newTitle.trim();
    if (!t) return;
    setAdding(true);
    setError(null);
    try {
      await postFounder(`/consulting/projects/${projectId}/milestones/${milestoneId}/tasks`, { title: t });
      setNewTitle("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the task");
    } finally {
      setAdding(false);
    }
  }

  async function handleTransition(task: ConsultingTask, value: string) {
    const [stage, status] = value.split("|");
    if (!stage || !status || (stage === task.stage && status === task.status)) return;
    setBusyId(task.id);
    setError(null);
    try {
      await patchFounder(`/consulting/requests/${task.id}`, { stage, status });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transition failed");
    } finally {
      setBusyId(null);
    }
  }

  const docsForTask = (t: ConsultingTask) =>
    deliverables.filter((d) => String(d.service_request_id || "").toUpperCase() === t.id.toUpperCase());

  const done = tasks.filter((t) => t.stage === "completed").length;
  const active = tasks.filter((t) => t.stage !== "cancelled").length;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Tasks{active > 0 ? ` · ${done}/${active} complete` : ""}
        </span>
      </div>
      {error && (
        <div className="mb-2 rounded bg-rose-50 px-2 py-1 text-[11px] text-rose-700">{error}</div>
      )}
      {tasks.length === 0 ? (
        <div className="text-[11px] italic text-slate-400">
          No tasks on this milestone yet.
          {viewerRole === "founder" ? " Tasks must all be complete before the milestone can complete." : ""}
        </div>
      ) : (
        <ul className="space-y-1">
          {tasks.map((t) => {
            const docs = docsForTask(t);
            return (
              <li key={t.id} className="flex items-center justify-between gap-2 rounded bg-white px-2 py-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setOpenTask(t)}
                  className={`min-w-0 flex-1 truncate text-left hover:underline ${t.stage === "cancelled" ? "text-slate-400 line-through" : "text-slate-700"}`}
                  title="Open task"
                >
                  {t.stage === "completed" ? "✅ " : ""}{t.title}
                  {docs.length > 0 && <span className="ml-1 text-[9px] text-sky-600" title={`${docs.length} document(s) attached`}>📄{docs.length}</span>}
                  {t.open_revision_note && <span className="ml-1 text-[9px] font-bold text-amber-600" title="Client requested changes">⟲ revision</span>}
                  {t.oliver_job_id && <span className="ml-1 text-[9px] uppercase tracking-wide text-amber-600" title="Synced to an OLIVER job">· OLIVER</span>}
                </button>
                {viewerRole === "founder" ? (
                  // The select IS the status display — current value shown,
                  // legal moves as the options.
                  <select
                    value={`${t.stage}|${t.status}`}
                    disabled={busyId === t.id}
                    onChange={(e) => handleTransition(t, e.target.value)}
                    className="flex-shrink-0 rounded border border-slate-300 bg-white px-1 py-0.5 text-[10px] text-slate-700"
                  >
                    <option value={`${t.stage}|${t.status}`}>
                      {busyId === t.id ? "Saving…" : `${TASK_STAGE_LABELS[t.stage] || t.stage} — ${TASK_STATUS_LABELS[t.status] || t.status}`}
                    </option>
                    {allTaskMoves().map((g) => (
                      <optgroup key={g.stage} label={g.label}>
                        {g.options
                          .filter((o) => o.value !== `${t.stage}|${t.status}`)
                          .map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </optgroup>
                    ))}
                  </select>
                ) : (
                  <span className="flex-shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-600">
                    {TASK_STAGE_LABELS[t.stage] || t.stage} · {TASK_STATUS_LABELS[t.status] || t.status}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {viewerRole === "founder" && (
        <div className="mt-2 flex items-center gap-1.5">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            placeholder="Add a task…"
            className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px]"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={adding || !newTitle.trim()}
            className="rounded bg-slate-900 px-2 py-1 text-[10px] font-semibold text-white disabled:bg-slate-300"
          >
            {adding ? "Adding…" : "+ Add task"}
          </button>
        </div>
      )}
      {openTask && (
        <TaskDetailModal
          task={openTask}
          deliverables={docsForTask(openTask)}
          onClose={() => setOpenTask(null)}
          onChanged={() => { setOpenTask(null); onChanged(); }}
        />
      )}
    </div>
  );
}

function MilestonesTab({
  milestones,
  viewerRole,
  notice,
  onStatusChange,
  onEditMilestone,
  onAddMilestone,
  onDeleteMilestone,
  canOnboard,
  onStartOnboarding,
  intakes = [],
  proposals = [],
  tasks = [],
  taskDeliverables = [],
  projectId,
  onTasksChanged,
  onSendIntake,
  onAddDocument,
  onCreateProposal,
  onRemoveIntake,
  onRemoveProposal,
}: {
  milestones: ConsultingProjectMilestone[];
  viewerRole: "founder" | "client";
  notice: string | null;
  onStatusChange: (mid: string, s: MilestoneStatus) => void;
  onEditMilestone?: (m: ConsultingProjectMilestone) => void;
  onAddMilestone?: () => void;
  onDeleteMilestone?: (m: ConsultingProjectMilestone) => void;
  canOnboard?: boolean;
  onStartOnboarding?: () => void;
  intakes?: IntakeSubRow[];
  proposals?: ProposalRow[];
  tasks?: ConsultingTask[];
  taskDeliverables?: ConsultingDeliverable[];
  projectId: string;
  onTasksChanged: () => void;
  onSendIntake?: (milestoneId: string) => void;
  onAddDocument?: (milestoneId: string) => void;
  onCreateProposal?: (milestoneId: string) => void;
  onRemoveIntake?: (submissionId: string) => void;
  onRemoveProposal?: (proposalId: string) => void;
}) {
  if (milestones.length === 0) {
    return (
      <div className="px-6 py-10 text-center text-sm text-slate-500">
        No milestones on this project yet.
      </div>
    );
  }
  return (
    <div className="space-y-3 px-5 py-4">
      {notice && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          {notice}
        </div>
      )}
      <ol className="space-y-3" role="list">
        {milestones.map((m, idx) => (
          <MilestoneRow
            key={m.milestone_id}
            number={idx + 1}
            milestone={m}
            viewerRole={viewerRole}
            onStatusChange={onStatusChange}
            onEditMilestone={onEditMilestone}
            onDeleteMilestone={onDeleteMilestone}
            canOnboard={canOnboard}
            onStartOnboarding={onStartOnboarding}
            intakes={intakes.filter((i) => i.milestone_id === m.milestone_id)}
            proposals={proposals.filter((p) => p.milestone_id === m.milestone_id)}
            tasks={tasks.filter((t) => t.milestone_id === m.milestone_id)}
            taskDeliverables={taskDeliverables}
            projectId={projectId}
            onTasksChanged={onTasksChanged}
            onSendIntake={onSendIntake}
            onAddDocument={onAddDocument}
            onCreateProposal={onCreateProposal}
            onRemoveIntake={onRemoveIntake}
            onRemoveProposal={onRemoveProposal}
          />
        ))}
      </ol>
      {/* CS-2 — founder adds a custom milestone to tailor the cloned template
          into a bespoke scope. */}
      {viewerRole === "founder" && onAddMilestone && (
        <button
          type="button"
          onClick={onAddMilestone}
          className="mt-1 w-full rounded-lg border-2 border-dashed border-slate-300 bg-white py-2 text-xs font-semibold text-slate-500 hover:border-slate-400 hover:text-slate-700"
        >
          + Add milestone
        </button>
      )}
    </div>
  );
}

function MilestoneRow({
  number,
  milestone,
  viewerRole,
  onStatusChange,
  onEditMilestone,
  onDeleteMilestone,
  canOnboard,
  onStartOnboarding,
  intakes = [],
  proposals = [],
  tasks = [],
  taskDeliverables = [],
  projectId,
  onTasksChanged,
  onSendIntake,
  onAddDocument,
  onCreateProposal,
  onRemoveIntake,
  onRemoveProposal,
}: {
  number: number;
  milestone: ConsultingProjectMilestone;
  viewerRole: "founder" | "client";
  onStatusChange: (mid: string, s: MilestoneStatus) => void;
  onEditMilestone?: (m: ConsultingProjectMilestone) => void;
  onDeleteMilestone?: (m: ConsultingProjectMilestone) => void;
  canOnboard?: boolean;
  onStartOnboarding?: () => void;
  intakes?: IntakeSubRow[];
  proposals?: ProposalRow[];
  tasks?: ConsultingTask[];
  taskDeliverables?: ConsultingDeliverable[];
  projectId: string;
  onTasksChanged: () => void;
  onSendIntake?: (milestoneId: string) => void;
  onAddDocument?: (milestoneId: string) => void;
  onCreateProposal?: (milestoneId: string) => void;
  onRemoveIntake?: (submissionId: string) => void;
  onRemoveProposal?: (proposalId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // Schema in-flight states (migration 106): in_progress + the two "parked"
  // waiting states all render with the gold pulsing "active" circle. NO
  // 'active' value exists in the enum.
  const isComplete = milestone.status === "complete";
  const isActive =
    milestone.status === "in_progress" ||
    milestone.status === "awaiting_client" ||
    milestone.status === "awaiting_internal";
  const isSkipped = milestone.status === "skipped";

  const isPaymentTrigger = Boolean(
    typeof milestone.is_payment_trigger === "number"
      ? milestone.is_payment_trigger === 1
      : milestone.is_payment_trigger,
  );

  return (
    <li className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
        aria-expanded={open}
      >
        <MilestoneCircle number={number} isComplete={isComplete} isActive={isActive} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`truncate text-sm font-semibold ${
              isSkipped ? "text-slate-400 line-through" : "text-slate-900"
            }`}>
              {milestone.name}
            </span>
            {isPaymentTrigger && (
              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700">
                Payment {milestone.payment_pct ? `${milestone.payment_pct}%` : ""}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
            <span className="capitalize">{milestone.status.replace(/_/g, " ")}</span>
            {milestone.due_date && (
              <>
                <span>·</span>
                <span>Due {formatDate(milestone.due_date)}</span>
              </>
            )}
            {milestone.completed_at && isComplete && (
              <>
                <span>·</span>
                <span>Completed {formatDate(milestone.completed_at)}</span>
              </>
            )}
          </div>
        </div>
        <span className="mt-1 text-slate-400">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-100 px-4 py-3">
          {milestone.description?.trim() ? (
            <div className="whitespace-pre-wrap text-sm text-slate-700">
              {milestone.description}
            </div>
          ) : (
            <div className="text-xs italic text-slate-400">No description.</div>
          )}

          {/* Tasks on this milestone. Task ≡ service request — each one runs
              the 7-stage pipeline and syncs to an OLIVER job. All tasks must
              be complete before the milestone can complete (server-enforced),
              and the milestone auto-completes on the last one. */}
          <MilestoneTasksSection
            projectId={projectId}
            milestoneId={milestone.milestone_id}
            tasks={tasks}
            deliverables={taskDeliverables}
            viewerRole={viewerRole}
            onChanged={onTasksChanged}
          />

          {/* Documents on this milestone. Everything here is a workflow the founder
              controls: attach ANY document (scoping doc, intake, custom), create an
              OLIVER proposal, send an intake for the client to fill, and remove any
              of them. Nothing is hardcoded to the milestone. */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Documents</span>
              {viewerRole === "founder" && onAddDocument && (
                <button
                  type="button"
                  onClick={() => onAddDocument(milestone.milestone_id)}
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                >
                  + Add document
                </button>
              )}
            </div>
            {intakes.length === 0 && proposals.length === 0 ? (
              <div className="text-[11px] italic text-slate-400">No documents on this milestone yet.</div>
            ) : (
              <ul className="space-y-1">
                {intakes.map((i) => (
                  <li key={i.submission_id} className="flex items-center justify-between gap-2 rounded bg-white px-2 py-1 text-[11px]">
                    <span className="truncate text-slate-700">
                      📋 {i.template_name || "Document"}{i.is_draft ? " (draft)" : ""}{i.score_total != null ? ` · ${i.score_total} pts` : ""}
                    </span>
                    <span className="flex flex-shrink-0 items-center gap-2">
                      <a
                        href={`/app/consulting/intake/${i.submission_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-sky-700 hover:underline"
                      >
                        Open
                      </a>
                      {viewerRole === "founder" && onRemoveIntake && (
                        <button
                          type="button"
                          title="Remove from milestone"
                          onClick={() => onRemoveIntake(i.submission_id)}
                          className="font-semibold text-slate-400 hover:text-rose-600"
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  </li>
                ))}
                {proposals.map((p) => (
                  <li key={p.proposal_id} className="flex items-center justify-between gap-2 rounded bg-white px-2 py-1 text-[11px]">
                    <span className="truncate text-slate-700">
                      📄 {p.title || "Proposal"} · ${Number(p.total || 0).toLocaleString()}
                    </span>
                    <span className="flex flex-shrink-0 items-center gap-2">
                      <span className="uppercase text-slate-500">{String(p.status || "").replace(/_/g, " ")}</span>
                      {viewerRole === "founder" && onRemoveProposal && (
                        <button
                          type="button"
                          title="Unlink from milestone (keeps the proposal)"
                          onClick={() => onRemoveProposal(p.proposal_id)}
                          className="font-semibold text-slate-400 hover:text-rose-600"
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {viewerRole === "founder" && (
              <p className="mt-1.5 text-[10px] text-slate-400">
                <strong>+ Add document</strong> attaches a form or a proposal and can email the client the link right away.
              </p>
            )}
          </div>

          {/* Founder status dropdown — PATCH /consulting/projects/:id/milestones/:mid
              is live. Options MUST match the migration-106 CHECK enum exactly
              (no 'active'). Setting 'complete' stamps completed_at + auto-advances
              the next milestone; setting it back to not_started/in_progress
              un-completes (clears completed_at) — Brandon's Rolling In It case. */}
          {viewerRole === "founder" && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Status
              </label>
              <select
                value={milestone.status}
                onChange={(e) => onStatusChange(milestone.milestone_id, e.target.value as MilestoneStatus)}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
              >
                <option value="not_started">Not started</option>
                <option value="in_progress">In progress</option>
                <option value="awaiting_client">Awaiting client</option>
                <option value="awaiting_internal">Awaiting internal</option>
                <option value="blocked">Blocked</option>
                <option value="complete">Complete</option>
                <option value="skipped">Skipped</option>
              </select>
              {isComplete && (
                <button
                  type="button"
                  onClick={() => onStatusChange(milestone.milestone_id, "in_progress")}
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Mark incomplete
                </button>
              )}
              {/* CS-1 — edit milestone metadata (name / description / payment
                  trigger + amount / due date). Opens EditMilestoneModal, which
                  PATCHes the same route with the metadata fields (no status). */}
              {onEditMilestone && (
                <button
                  type="button"
                  onClick={() => onEditMilestone(milestone)}
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Edit details
                </button>
              )}
              {/* CS-2 — remove a milestone (confirm-guarded in the host). The
                  backend blocks deleting a complete / paid / deliverable-bearing
                  milestone with a friendly 409. */}
              {onDeleteMilestone && (
                <button
                  type="button"
                  onClick={() => onDeleteMilestone(milestone)}
                  className="rounded border border-red-200 bg-white px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              )}
            </div>
          )}

          {/* PB-2 — Start Onboarding launcher on the Platform-Provisioning
              milestone. Launches the two-phase wizard scoped to the client's
              tenant: selection → business/user profile → platform onboarding. */}
          {viewerRole === "founder" && /provision/i.test(milestone.name) && onStartOnboarding && (
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2">
              <div className="text-xs font-semibold text-sky-900">Platform onboarding</div>
              <div className="mt-0.5 text-[11px] text-sky-800">
                Launch the guided setup — selection, then business and user profile, then platform onboarding.
              </div>
              <button
                type="button"
                disabled={!canOnboard}
                onClick={onStartOnboarding}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Start Onboarding →
              </button>
              {!canOnboard && (
                <div className="mt-1 text-[10px] text-sky-700">
                  Assign the client a tenant first (via their paid subscription) to enable onboarding.
                </div>
              )}
            </div>
          )}

          {/* Internal review checklist — F1 ships a static placeholder. For
              system-seed onboarding_consulting milestones the brief calls out
              a "standard checklist" — we render it as a non-interactive
              preview so the founder can see the intent. Non-seed milestones
              get an empty-state hint. */}
          <ChecklistPreview milestone={milestone} />

          {/* Payment-trigger banner. Completing this milestone flips
              payment_charge_status → 'ready' server-side (backend commit
              dfb6567); the actual card charge runs through the existing
              payment-milestone approve flow (confirm_charge). This banner
              reflects that state instead of a deferred notice. */}
          {isPaymentTrigger && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              <div className="font-semibold">Payment milestone</div>
              <div className="mt-0.5">
                {milestone.payment_pct
                  ? `Marking this complete flags a ${milestone.payment_pct}% charge as ready.`
                  : "Marking this complete flags the charge as ready."}
              </div>
              {milestone.payment_charge_status && milestone.payment_charge_status !== "n/a" && (
                <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                  Charge: {milestone.payment_charge_status.replace(/_/g, " ")}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function MilestoneCircle({ number, isComplete, isActive }: {
  number: number;
  isComplete: boolean;
  isActive: boolean;
}) {
  if (isComplete) {
    return (
      <span
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
        style={{ background: IL_BLUE }}
        aria-label={`Milestone ${number} complete`}
      >
        <CheckCircle2 className="h-4 w-4" />
      </span>
    );
  }
  if (isActive) {
    return (
      <span
        className="relative mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        style={{ background: OLIVER_GOLD }}
        aria-label={`Milestone ${number} active`}
      >
        <span
          aria-hidden="true"
          className="absolute inset-0 animate-ping rounded-full opacity-60"
          style={{ background: OLIVER_GOLD }}
        />
        <span className="relative text-[11px] font-bold text-slate-900">{number}</span>
      </span>
    );
  }
  return (
    <span
      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 bg-white text-[11px] font-bold text-slate-400"
      style={{ borderColor: NEUTRAL }}
      aria-label={`Milestone ${number} not started`}
    >
      {number}
    </span>
  );
}

// ─── Internal review checklist preview ───────────────────────────────────
// F1 ships a non-interactive preview. System-seed onboarding_consulting
// milestones get a standard placeholder list per the F1 brief; anything else
// gets an empty-state hint. Real interactive checklists arrive in a later F.
function ChecklistPreview({ milestone }: { milestone: ConsultingProjectMilestone }) {
  // The server-side milestone seed may include an existing checklist JSON
  // payload — render those items if present. Otherwise fall back to the
  // standard onboarding-consulting items only when the milestone is system
  // seeded.
  const fromServer = parseChecklist(milestone.internal_review_checklist_json);
  const items: string[] = fromServer.length > 0
    ? fromServer
    : milestone.is_system_seed
      ? STANDARD_REVIEW_CHECKLIST
      : [];

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-[11px] text-slate-500">
        Internal review checklist — empty for now. Interactive checklists arrive in a later phase.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Internal review checklist <span className="font-normal italic text-slate-400">(preview)</span>
      </div>
      <ul className="mt-1.5 space-y-1">
        {items.map((label, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              disabled
              className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-slate-300"
              aria-label={label}
            />
            <span>{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const STANDARD_REVIEW_CHECKLIST: string[] = [
  "Acceptance criteria captured",
  "Deliverable links attached",
  "Client confirmation logged",
  "Internal notes added to project",
];

function parseChecklist(raw: unknown): string[] {
  if (!raw) return [];
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try { parsed = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((it) => {
      if (typeof it === "string") return it;
      if (it && typeof it === "object" && "label" in (it as Record<string, unknown>)) {
        const lab = (it as Record<string, unknown>).label;
        return typeof lab === "string" ? lab : "";
      }
      return "";
    })
    .filter((s) => s.length > 0);
}

// ─── Formatters ──────────────────────────────────────────────────────────

function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatMoney(cents: number | null | undefined, currency: string | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return "";
  const value = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: (currency || "USD").toUpperCase(),
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `$${value.toFixed(0)}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// CS-1 — EditMilestoneModal. Founder edits milestone metadata: name,
// description, payment-trigger flag + amount, and due date. Saves via the
// parent's onSave, which PATCHes .../milestones/:mid with metadata fields (no
// `status`), so the backend takes its metadata branch (no status side effects).
// ─────────────────────────────────────────────────────────────────────────
function EditMilestoneModal({
  milestone,
  onClose,
  onSave,
  title,
  submitLabel,
}: {
  milestone: ConsultingProjectMilestone;
  onClose: () => void;
  onSave: (fields: Record<string, unknown>) => Promise<void>;
  title?: string;
  submitLabel?: string;
}) {
  const initialPT = Boolean(
    typeof milestone.is_payment_trigger === "number"
      ? milestone.is_payment_trigger === 1
      : milestone.is_payment_trigger,
  );
  const [name, setName] = useState(milestone.name || "");
  const [description, setDescription] = useState(milestone.description || "");
  const [isPaymentTrigger, setIsPaymentTrigger] = useState(initialPT);
  const [amountDollars, setAmountDollars] = useState(
    milestone.payment_amount_cents != null
      ? String((Number(milestone.payment_amount_cents) / 100).toFixed(2))
      : "",
  );
  const [dueDate, setDueDate] = useState(
    milestone.due_date ? String(milestone.due_date).slice(0, 10) : "",
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit() {
    if (!name.trim()) { setErr("Name is required."); return; }
    setSaving(true);
    setErr(null);
    try {
      const fields: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || null,
        is_payment_trigger: isPaymentTrigger,
        due_at: dueDate ? new Date(`${dueDate}T00:00:00`).toISOString() : null,
      };
      const amt = amountDollars.trim();
      const cents = amt === "" ? null : Math.round(Number(amt) * 100);
      if (cents != null && (!Number.isFinite(cents) || cents < 0)) {
        setErr("Enter a valid amount.");
        setSaving(false);
        return;
      }
      fields.payment_amount_cents = cents;
      await onSave(fields);
    } catch (e) {
      setErr((e as Error).message || "Could not save milestone.");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-slate-100 px-5 py-3">
          <h3 className="text-sm font-bold text-slate-900">{title || "Edit milestone"}</h3>
        </div>
        <div className="space-y-3 px-5 py-4">
          {err && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{err}</div>
          )}
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Due date</span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={isPaymentTrigger} onChange={(e) => setIsPaymentTrigger(e.target.checked)} />
            <span className="text-sm font-medium text-slate-700">Payment trigger milestone</span>
          </label>
          {isPaymentTrigger && (
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Payment amount (USD)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amountDollars}
                onChange={(e) => setAmountDollars(e.target.value)}
                placeholder="e.g. 1500.00"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "Saving…" : (submitLabel || "Save changes")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// CS-6 — Founder Deliverables tab.
//
// Lists the project's deliverables (consulting.deliverable rows returned by
// GET /consulting/projects/:id) with title / description / file download, then
// mounts the shared DeliverableActionPanel inline beneath each row. The panel
// is self-contained (POSTs via useOliverApi) and fully status-aware — it
// renders its own StatusPill + the founder CTAs (Send to Client on pending,
// Waiting-on-client / Approved / In-revision meta strips otherwise) — so this
// host only owns the title/description/file presentation.
//
// context="standalone" (the panel default) deliberately suppresses the Pay CTA
// here: project-level deliverable payment flows through the milestone surface,
// not this list. The wire column revision_note (SINGULAR) is mapped to the
// panel shape's revision_notes (PLURAL) at the mount site.
// ─────────────────────────────────────────────────────────────────────────
function DeliverablesTab({
  deliverables,
  milestones,
  projectId,
  viewerRole,
  onChanged,
}: {
  deliverables: ConsultingDeliverable[];
  milestones: ConsultingProjectMilestone[];
  projectId: string;
  viewerRole: "founder" | "client";
  onChanged: () => void;
}) {
  const { uploadFounder, download } = useOliverApi();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [milestoneId, setMilestoneId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function handleUpload() {
    if (!file || !milestoneId) return;
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("milestone_id", milestoneId);
      // Title is optional server-side (it falls back to the file name), but
      // sending it explicitly keeps the list readable.
      form.append("title", title.trim() || file.name);
      await uploadFounder(`/consulting/projects/${projectId}/deliverables`, form);
      setFile(null);
      setTitle("");
      setMilestoneId("");
      if (fileRef.current) fileRef.current.value = "";
      onChanged();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  // The blob container is private, so the file must be streamed through the
  // API with a bearer token — a direct link to file_url would be denied.
  async function handleDownload(d: ConsultingDeliverable) {
    setDownloadingId(d.deliverable_id);
    try {
      await download(
        `/consulting/deliverables/${d.deliverable_id}/download`,
        d.file_name || d.title || "deliverable"
      );
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Download failed.");
    } finally {
      setDownloadingId(null);
    }
  }

  const uploader =
    viewerRole === "founder" ? (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4">
        <div className="text-sm font-semibold text-slate-900">Upload a deliverable</div>
        <div className="mt-0.5 text-xs text-slate-500">
          Attach an authored file — a growth plan, audit, or deck. Max 50&nbsp;MB.
        </div>
        {milestones.length === 0 ? (
          <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            This project has no milestones yet. Add a milestone first — every deliverable is
            filed against one.
          </div>
        ) : (
          <>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Milestone
                </span>
                <select
                  value={milestoneId}
                  onChange={(e) => setMilestoneId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900"
                >
                  <option value="">Select a milestone…</option>
                  {milestones.map((m) => (
                    <option key={m.milestone_id} value={m.milestone_id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Title <span className="font-normal normal-case text-slate-400">(optional)</span>
                </span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={file?.name || "Defaults to the file name"}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900"
                />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="block w-full max-w-xs text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-slate-700"
              />
              <button
                type="button"
                onClick={handleUpload}
                disabled={!file || !milestoneId || uploading}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {uploading ? "Uploading…" : "Upload deliverable"}
              </button>
            </div>
          </>
        )}
        {uploadError && (
          <div className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{uploadError}</div>
        )}
      </div>
    ) : null;

  if (!deliverables.length) {
    return (
      <div className="space-y-3 p-4">
        {uploader}
        <div className="px-2 py-8 text-center text-sm text-slate-500">
          No deliverables on this project yet.
          {viewerRole === "founder"
            ? " Upload one above, or file one from a milestone."
            : " They appear here once your consultant files one."}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3 p-4">
      {uploader}
      {deliverables.map((d) => {
        const panelShape: DeliverableShape = {
          deliverable_id: d.deliverable_id,
          status: d.status,
          is_payment_trigger: d.is_payment_trigger ?? null,
          payment_amount_cents: d.payment_amount_cents ?? null,
          payment_charge_status: d.payment_charge_status ?? null,
          approved_at: d.approved_at ?? null,
          revision_requested_at: d.revision_requested_at ?? null,
          // consulting.deliverable.revision_note (SINGULAR) → panel's plural field.
          revision_notes: d.revision_note ?? null,
        };
        return (
          <div key={d.deliverable_id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-slate-900">
                  {d.title || d.file_name || "Untitled deliverable"}
                </div>
                {d.description?.trim() && (
                  <div className="mt-0.5 whitespace-pre-wrap text-xs text-slate-600">{d.description}</div>
                )}
                {d.sent_at && (
                  <div className="mt-1 text-[11px] text-slate-400">
                    Sent to client {new Date(d.sent_at).toLocaleDateString()}
                  </div>
                )}
              </div>
              {d.file_url && (
                // NOT an <a href={d.file_url}> — the blob container is private,
                // so a direct link is denied. Stream it through the API instead.
                <button
                  type="button"
                  onClick={() => handleDownload(d)}
                  disabled={downloadingId === d.deliverable_id}
                  className="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  {downloadingId === d.deliverable_id ? "Downloading…" : "Download"}
                </button>
              )}
            </div>
            <div className="mt-3 border-t border-slate-100 pt-3">
              <DeliverableActionPanel
                deliverable={panelShape}
                viewerRole={viewerRole}
                onChanged={onChanged}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// CS-7 — Project Notes tab.
//
// Project-level notes thread (consulting.project_note), mirroring the
// deliverable-note thread UX. GET/POST /consulting/projects/:id/notes. Founder
// picks visibility (internal vs client-visible); the server locks clients to
// client_visible. Degrades to a quiet empty state on 404 so it survives a
// backend that hasn't shipped the routes yet.
// ─────────────────────────────────────────────────────────────────────────
type ProjectNoteVisibility = "internal" | "client_visible";
interface ProjectNote {
  note_id: string;
  author_kind?: string;
  author_display_name?: string | null;
  body: string;
  visibility: ProjectNoteVisibility;
  created_at: string | null;
}

function ProjectNotesTab({
  projectId,
  viewerRole,
}: {
  projectId: string;
  viewerRole: "founder" | "client";
}) {
  const { get, post } = useOliverApi();
  const [notes, setNotes] = useState<ProjectNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<ProjectNoteVisibility>("client_visible");
  const [busy, setBusy] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await get<{ notes: ProjectNote[] }>(`/consulting/projects/${projectId}/notes`);
      setNotes(Array.isArray(r?.notes) ? r.notes : []);
    } catch (e) {
      const msg = (e as Error).message || "";
      if (msg.includes("404") || /not[_\s-]?found/i.test(msg)) setNotes([]);
      else setError(msg || "Could not load notes.");
    } finally {
      setLoading(false);
    }
  }, [get, projectId]);

  useEffect(() => { void load(); }, [load]);

  async function handleSend() {
    const trimmed = body.trim();
    if (!trimmed) { setComposeError("Type a note first."); return; }
    setBusy(true);
    setComposeError(null);
    try {
      const payload: { body: string; visibility?: ProjectNoteVisibility } = { body: trimmed };
      if (viewerRole === "founder") payload.visibility = visibility;
      await post(`/consulting/projects/${projectId}/notes`, payload);
      setBody("");
      await load();
    } catch (e) {
      setComposeError((e as Error).message || "Could not post note.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 p-4">
      {loading ? (
        <div className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs italic text-slate-400">Loading notes…</div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
      ) : notes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs italic text-slate-400">
          No notes on this project yet.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {notes.map((n) => {
            const isInternal = n.visibility === "internal";
            if (isInternal && viewerRole === "client") return null;
            return (
              <li key={n.note_id} className={`rounded-lg border px-2.5 py-1.5 ${isInternal ? "border-slate-300 bg-slate-100" : "border-slate-200 bg-white"}`}>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-slate-800">{n.author_display_name || n.author_kind || "—"}</span>
                  <span className="text-[10px] text-slate-400">{fmtNoteDateTime(n.created_at)}</span>
                  {isInternal && (
                    <span className="ml-auto rounded-full bg-slate-300 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-700">Internal</span>
                  )}
                </div>
                <div className="mt-0.5 whitespace-pre-wrap text-xs text-slate-700">{n.body}</div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-2">
        {viewerRole === "founder" && (
          <div className="mb-1 text-[10px] italic text-slate-500">Internal notes are NOT visible to your client.</div>
        )}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={viewerRole === "founder" ? "Add a note for your team or your client…" : "Add a note for the IA team…"}
          rows={2}
          disabled={busy}
          className="w-full resize-y rounded border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
        <div className="mt-1.5 flex items-center gap-2">
          {viewerRole === "founder" && (
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as ProjectNoteVisibility)}
              disabled={busy}
              className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px]"
              aria-label="Note visibility"
            >
              <option value="client_visible">Visible to client</option>
              <option value="internal">Internal (team only)</option>
            </select>
          )}
          <button
            type="button"
            onClick={handleSend}
            disabled={busy || !body.trim()}
            className="ml-auto rounded bg-sky-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {busy ? "Posting…" : "Post note"}
          </button>
        </div>
        {composeError && <div className="mt-1 text-[11px] text-red-700">{composeError}</div>}
      </div>
    </div>
  );
}

function fmtNoteDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// ─────────────────────────────────────────────────────────────────────────
// CS-7 — Project Activity tab.
//
// A read-only timeline synthesized from the timestamps ALREADY loaded in the
// project workspace (project create/start/close, milestone completions,
// deliverable filed/sent/revision/approved). No new event-log table or
// write-path instrumentation — the feed is derived from current-state rows, so
// it's honest and immediately useful. A persistent, granular event log is a
// deliberate future enhancement if richer history is needed.
// ─────────────────────────────────────────────────────────────────────────
function ProjectActivityTab({
  project,
  milestones,
  deliverables,
}: {
  project: ConsultingProjectRow;
  milestones: ConsultingProjectMilestone[];
  deliverables: ConsultingDeliverable[];
}) {
  const events = useMemo(() => {
    const out: { at: string; label: string; tone: "slate" | "sky" | "amber" | "emerald" }[] = [];
    const push = (at: string | null | undefined, label: string, tone: "slate" | "sky" | "amber" | "emerald") => {
      if (at) out.push({ at, label, tone });
    };
    push(project.created_at, "Project created", "slate");
    push(project.started_at, "Project started", "sky");
    push(project.closed_at, "Project closed", "slate");
    for (const m of milestones) {
      push(m.completed_at, `Milestone completed — ${m.name}`, "emerald");
    }
    for (const d of deliverables) {
      const t = d.title || d.file_name || "deliverable";
      push(d.created_at, `Deliverable filed — ${t}`, "slate");
      push(d.sent_at, `Sent to client — ${t}`, "sky");
      push(d.revision_requested_at, `Revisions requested — ${t}`, "amber");
      push(d.approved_at, `Approved — ${t}`, "emerald");
    }
    return out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [project, milestones, deliverables]);

  if (events.length === 0) {
    return (
      <div className="px-6 py-10 text-center text-sm text-slate-500">
        No activity yet. Milestone and deliverable events will appear here as work progresses.
      </div>
    );
  }

  const dot: Record<string, string> = {
    slate: "bg-slate-400",
    sky: "bg-sky-500",
    amber: "bg-amber-500",
    emerald: "bg-emerald-500",
  };

  return (
    <div className="p-4">
      <ul className="space-y-0">
        {events.map((e, i) => (
          <li key={`${e.at}-${i}`} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot[e.tone] || "bg-slate-400"}`} />
              {i < events.length - 1 && <span className="w-px flex-1 bg-slate-200" />}
            </div>
            <div className="pb-4">
              <div className="text-xs font-medium text-slate-800">{e.label}</div>
              <div className="text-[11px] text-slate-400">{fmtNoteDateTime(e.at)}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// CS-8 — Payment schedule (manual split) tab.
//
// Founder sets a payment split (50/50, 40/30/30, or custom %) for the project.
// POST /consulting/projects/:id/payment-milestones materializes the split into
// `oliver.payment_milestone` rows (parent_kind 'project') — the SAME table the
// charge engine bills. This surface is SETUP ONLY: it creates the schedule; it
// does NOT charge a card. Firing the actual client charge is the separate
// confirm_charge-guarded flow (CS-3, deferred pending a supervised live test),
// so there is deliberately no "Charge now" button here.
//
// Reads the existing GET /payment-milestones?parent_kind=project&parent_id=…
// (unwrapped to an array by useOliverApi). Clear & re-split is allowed only
// while every milestone is still in a planning state (server-enforced).
// ─────────────────────────────────────────────────────────────────────────
interface PaymentMilestoneRow {
  payment_milestone_id: string;
  sort_order: number;
  name: string;
  payment_pct?: number | null;
  payment_amount_cents?: number | null;
  status: string;
}

function fmtCents(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(Number(cents))) return "";
  return `$${(Number(cents) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function PaymentScheduleTab({
  projectId,
  viewerRole,
}: {
  projectId: string;
  viewerRole: "founder" | "client";
}) {
  const { get, post, del } = useOliverApi();
  const [rows, setRows] = useState<PaymentMilestoneRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customRows, setCustomRows] = useState<{ name: string; pct: string }[]>([
    { name: "Deposit", pct: "50" },
    { name: "Final Payment", pct: "50" },
  ]);

  const isFounder = viewerRole === "founder";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await get<PaymentMilestoneRow[]>(
        `/payment-milestones?parent_kind=project&parent_id=${encodeURIComponent(projectId)}`,
      );
      setRows(Array.isArray(r) ? r : []);
    } catch (e) {
      const msg = (e as Error).message || "";
      if (msg.includes("404") || /not[_\s-]?found/i.test(msg)) setRows([]);
      else setError(msg || "Could not load the payment schedule.");
    } finally {
      setLoading(false);
    }
  }, [get, projectId]);

  useEffect(() => { void load(); }, [load]);

  async function createSplit(kind: "50_50" | "40_30_30" | "custom") {
    setBusy(true);
    setError(null);
    try {
      const payload: { kind: string; milestones?: { name: string; payment_pct: number }[] } = { kind };
      if (kind === "custom") {
        const parsed = customRows.map((r) => ({ name: r.name.trim(), payment_pct: Number(r.pct) }));
        const sum = parsed.reduce((s, m) => s + (Number.isFinite(m.payment_pct) ? m.payment_pct : 0), 0);
        if (parsed.some((m) => !m.name)) { setError("Every milestone needs a name."); setBusy(false); return; }
        if (Math.abs(sum - 100) > 0.01) { setError(`Percentages must sum to 100 (got ${sum}).`); setBusy(false); return; }
        payload.milestones = parsed;
      }
      await post(`/consulting/projects/${projectId}/payment-milestones`, payload);
      setCustomOpen(false);
      await load();
    } catch (e) {
      setError((e as Error).message || "Could not create the schedule.");
    } finally {
      setBusy(false);
    }
  }

  async function clearSchedule() {
    setBusy(true);
    setError(null);
    try {
      await del(`/consulting/projects/${projectId}/payment-milestones`);
      await load();
    } catch (e) {
      setError((e as Error).message || "Could not clear the schedule.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="px-6 py-10 text-center text-sm text-slate-500">Loading payment schedule…</div>;
  }

  const anyCharged = rows.some((r) => !["ready", "n/a"].includes(String(r.status)));

  return (
    <div className="space-y-3 p-4">
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      {rows.length === 0 ? (
        // ── No schedule yet — the split picker ──
        isFounder ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-sm font-semibold text-slate-900">Set a payment schedule</div>
            <p className="mt-0.5 text-xs text-slate-500">
              Choose how this project&apos;s fee is split into milestones. This just sets up the schedule — no card is charged here.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => createSplit("50_50")}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                50 / 50 &mdash; Deposit + Final
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => createSplit("40_30_30")}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                40 / 30 / 30 &mdash; Deposit + Mid + Final
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setCustomOpen((v) => !v)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Custom…
              </button>
            </div>

            {customOpen && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="space-y-1.5">
                  {customRows.map((r, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        value={r.name}
                        onChange={(e) => setCustomRows((rs) => rs.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                        placeholder="Milestone name"
                        className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
                      />
                      <input
                        value={r.pct}
                        onChange={(e) => setCustomRows((rs) => rs.map((x, j) => j === i ? { ...x, pct: e.target.value.replace(/[^0-9.]/g, "") } : x))}
                        inputMode="decimal"
                        className="w-16 rounded border border-slate-300 px-2 py-1 text-xs text-right"
                      />
                      <span className="text-xs text-slate-500">%</span>
                      {customRows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setCustomRows((rs) => rs.filter((_, j) => j !== i))}
                          className="text-xs text-slate-400 hover:text-rose-600"
                          aria-label="Remove milestone"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCustomRows((rs) => [...rs, { name: "", pct: "" }])}
                    className="text-[11px] font-semibold text-sky-700 hover:underline"
                  >
                    + Add milestone
                  </button>
                  <span className="text-[11px] text-slate-400">
                    Sum: {customRows.reduce((s, r) => s + (Number(r.pct) || 0), 0)}%
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => createSplit("custom")}
                    className="ml-auto rounded bg-slate-900 px-3 py-1 text-[11px] font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {busy ? "Saving…" : "Create schedule"}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="px-6 py-10 text-center text-sm text-slate-500">No payment schedule set for this project yet.</div>
        )
      ) : (
        // ── Schedule exists — list + clear ──
        <>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-semibold">Milestone</th>
                  <th className="px-3 py-2 text-right font-semibold">%</th>
                  <th className="px-3 py-2 text-right font-semibold">Amount</th>
                  <th className="px-3 py-2 text-right font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice().sort((a, b) => a.sort_order - b.sort_order).map((r) => (
                  <tr key={r.payment_milestone_id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2 text-slate-800">{r.name}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{r.payment_pct != null ? `${r.payment_pct}%` : "—"}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{r.payment_amount_cents != null ? fmtCents(r.payment_amount_cents) : "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                        {String(r.status).replace(/_/g, " ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-400">
            Charging a milestone is done from the payments surface once the client&apos;s card is on file.
          </p>
          {isFounder && !anyCharged && (
            <button
              type="button"
              disabled={busy}
              onClick={clearSchedule}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 disabled:opacity-50"
            >
              {busy ? "Clearing…" : "Clear & re-split"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default ConsultingProjectModal;
