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
//     complete=#38BDF8 (IL blue) checkmark, active=#FEC82C (OLIVER gold)
//     pulsing dot, not_started=outline only #CBD5E1. Expand on click shows
//     description, status dropdown (founder advances), internal review
//     checklist placeholder, and payment-trigger banner when applicable
//     (banner reads "Payment splits arrive in F2").
//
// API surface used (F1 only):
//   GET  /consulting/projects/:id            → project row + milestones[]
//                                              The endpoint composite is
//                                              owed by the F1 backend agent;
//                                              we render a graceful inline
//                                              banner if the route 404s.
//   PATCH /consulting/projects/:id            → status changes (founder)
//   PATCH /consulting/projects/:id/milestones/:mid
//                                            → milestone status changes.
//                                              Stub for F1 — if the route
//                                              404s, the modal surfaces
//                                              "Coming in F2" inline.
//
// Per [[no-tenant-in-ui]] this file uses "Business" / "Client" in any
// customer-visible copy — schema names like client_tenant_id stay in code
// only.

import { useCallback, useEffect, useMemo, useState } from "react";
import { IadmModal, CORE_BLUE } from "../IadmModal";
import { useOliverApi } from "../../hooks/useOliverApi";
import { CheckCircle2, ChevronDown, ChevronRight, Lock, User, Send, AlertCircle } from "lucide-react";

// ─── Color tokens ────────────────────────────────────────────────────────
// Locked per F1 brief 2026-06-25.
const IL_BLUE = "#38BDF8";    // complete milestone circle
const OLIVER_GOLD = "#FEC82C"; // active milestone circle (pulsing)
const NEUTRAL = "#CBD5E1";    // not_started milestone circle outline

// ─── Types ───────────────────────────────────────────────────────────────

type ProjectStatus =
  | "active"
  | "awaiting_client_response"
  | "on_hold"
  | "closed"
  | "completed"
  | "cancelled";

type MilestoneStatus = "not_started" | "active" | "in_progress" | "complete" | "skipped";

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
  owner_user_id?: string | null;
  owner_display_name?: string | null;
  owner_avatar_url?: string | null;
  total_budget_cents?: number | null;
  currency?: string | null;
  started_at?: string | null;
  target_completion_date?: string | null;
  closed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  /** Server-computed: "what's the customer-facing next step?" */
  next_step_for_client?: string | null;
  /** Server-computed: "what's the founder waiting on?" */
  next_step_for_founder?: string | null;
}

interface WorkspaceResponse {
  project: ConsultingProjectRow;
  milestones: ConsultingProjectMilestone[];
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
  const { get, patch } = useOliverApi();

  const [tab, setTab] = useState<"overview" | "milestones">("overview");
  const [data, setData] = useState<WorkspaceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [milestoneNotice, setMilestoneNotice] = useState<string | null>(null);
  // F4 — Send Intake modal trigger. Founder-only surface; the modal itself
  // re-checks via the backend (founder-gated endpoint) so a stray click
  // from a future client lens variant won't get past the API.
  const [showSendIntake, setShowSendIntake] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setErr(null);
    try {
      // useOliverApi auto-unwraps the {data:...} envelope (oliverApi.ts:113).
      const r = await get<WorkspaceResponse>(`/consulting/projects/${projectId}`);
      setData(r);
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
    try {
      await patch(`/consulting/projects/${project.project_id}`, { status: next });
      await load();
      onChanged?.();
    } catch (e) {
      const msg = (e as Error).message || "Could not save status";
      // PATCH route arrives in a later F-feature (Brandon backend agent F1
      // does not promise PATCH /consulting/projects/:id). Surface "coming in
      // F2" on 404 so the founder doesn't see a raw stack.
      if (msg.includes("404")) {
        setErr("Status edits arrive in F2 — read-only for now.");
      } else {
        setErr(msg);
      }
    }
  }

  async function handleMilestoneStatusChange(mid: string, next: MilestoneStatus) {
    try {
      // Optimistic stub — see header doc. F1 backend may not ship this PATCH;
      // we still call it so when the route lands we get the update for free.
      await patch(`/consulting/projects/${projectId}/milestones/${mid}`, { status: next });
      setMilestoneNotice(null);
      await load();
      onChanged?.();
    } catch (e) {
      const msg = (e as Error).message || "Could not save milestone status";
      if (msg.includes("404")) {
        setMilestoneNotice("Milestone editing arrives in F2.");
      } else {
        setMilestoneNotice(msg);
      }
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
          <DisabledTab label="Messages" />
          <DisabledTab label="Activity" />
          <DisabledTab label="Deliverables" />
          <DisabledTab label="Invoices" />
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
            />
          )}
          {data && tab === "milestones" && (
            <MilestonesTab
              milestones={milestones}
              viewerRole={viewerRole}
              notice={milestoneNotice}
              onStatusChange={handleMilestoneStatusChange}
            />
          )}
        </div>
      </div>

      {/* F4 — Send Intake nested modal. Mounted INSIDE the IadmModal body so
          the founder doesn't lose project context while picking a template.
          The nested IadmModal renders above its parent via fixed positioning
          (see IadmModal's overlay z-index). */}
      {showSendIntake && project && (
        <SendIntakeModal
          projectId={project.project_id}
          clientName={project.client_name || null}
          clientEmail={project.client_email || null}
          onClose={() => setShowSendIntake(false)}
          onSent={() => {
            setShowSendIntake(false);
            void load();
            onChanged?.();
          }}
        />
      )}
    </IadmModal>
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
  projectId, clientName, clientEmail, onClose, onSent,
}: {
  projectId: string;
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
        const msg = (e as Error).message || "Could not load intake templates";
        if (/404|not.?found/i.test(msg)) {
          setError("Intake templates API not deployed yet — coming with the F4 backend.");
        } else {
          setError(msg);
        }
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
        send_email: true,
        recipient_email: recipientEmail.trim(),
        message: message.trim() || null,
      });
      onSent();
    } catch (e) {
      const msg = (e as Error).message || "Send failed";
      if (/404|not.?found/i.test(msg)) {
        setError("Send-intake endpoint not deployed yet — submission record will create once the F4 backend ships.");
      } else {
        setError(msg);
      }
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
            placeholder="Hi Angel — please fill this out before our next call. — Brandon"
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
  awaiting_client_response:  { bg: "#FEF3C7", fg: "#92400E", label: "Awaiting client" },
  on_hold:                   { bg: "#FEE2E2", fg: "#991B1B", label: "On hold" },
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
}: {
  project: ConsultingProjectRow;
  milestoneCount: number;
  milestonesComplete: number;
  nextStepBanner: string | null;
  viewerRole: "founder" | "client";
  onStatusChange: (s: ProjectStatus) => void;
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
          <div className="text-sm font-semibold text-slate-800">
            {project.category_name || <span className="text-slate-400">Uncategorized</span>}
          </div>
        </MetaCard>

        <MetaCard title="Status">
          {viewerRole === "founder" ? (
            <select
              value={project.status}
              onChange={(e) => onStatusChange(e.target.value as ProjectStatus)}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm font-semibold"
            >
              <option value="active">Active</option>
              <option value="awaiting_client_response">Awaiting client</option>
              <option value="on_hold">On hold</option>
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
            <span className="text-sm font-medium text-slate-800">
              {project.owner_display_name || <span className="text-slate-400">Unassigned</span>}
            </span>
          </div>
        </MetaCard>

        <MetaCard title="Started">
          <div className="text-sm text-slate-800">{formatDate(project.started_at) || "—"}</div>
        </MetaCard>

        <MetaCard title="Target completion">
          <div className="text-sm text-slate-800">{formatDate(project.target_completion_date) || "—"}</div>
        </MetaCard>

        <MetaCard title="Total budget">
          <div className="text-sm font-semibold text-slate-800">
            {formatMoney(project.total_budget_cents, project.currency) || (
              <span className="text-slate-400 font-normal">Not set</span>
            )}
          </div>
        </MetaCard>

        <MetaCard title="Last updated">
          <div className="text-sm text-slate-800">{formatDate(project.updated_at) || "—"}</div>
        </MetaCard>
      </div>
    </div>
  );
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

function MilestonesTab({
  milestones,
  viewerRole,
  notice,
  onStatusChange,
}: {
  milestones: ConsultingProjectMilestone[];
  viewerRole: "founder" | "client";
  notice: string | null;
  onStatusChange: (mid: string, s: MilestoneStatus) => void;
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
          />
        ))}
      </ol>
    </div>
  );
}

function MilestoneRow({
  number,
  milestone,
  viewerRole,
  onStatusChange,
}: {
  number: number;
  milestone: ConsultingProjectMilestone;
  viewerRole: "founder" | "client";
  onStatusChange: (mid: string, s: MilestoneStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  // Treat both 'active' and the legacy 'in_progress' as the visible "active"
  // state — the schema uses 'in_progress' (oliver-api/routes/consulting.js:483)
  // while the F1 brief vocabulary uses 'active'. The visual is identical.
  const isComplete = milestone.status === "complete";
  const isActive = milestone.status === "active" || milestone.status === "in_progress";
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

          {/* Founder status dropdown. F1 backend may not ship the PATCH route;
              the handler surfaces "Coming in F2" inline on a 404 rather than
              500ing the modal. Per the F1 brief, this is intentionally
              optimistic-then-degrade. */}
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
                <option value="active">Active</option>
                <option value="in_progress">In progress</option>
                <option value="complete">Complete</option>
                <option value="skipped">Skipped</option>
              </select>
            </div>
          )}

          {/* Internal review checklist — F1 ships a static placeholder. For
              system-seed onboarding_consulting milestones the brief calls out
              a "standard checklist" — we render it as a non-interactive
              preview so the founder can see the intent. Non-seed milestones
              get an empty-state hint. */}
          <ChecklistPreview milestone={milestone} />

          {/* Payment-trigger banner — F2 wires the actual charge controls.
              Per the F1 brief this banner is intentionally read-only. */}
          {isPaymentTrigger && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              <div className="font-semibold">Payment milestone</div>
              <div className="mt-0.5">
                {milestone.payment_pct
                  ? `Triggers a ${milestone.payment_pct}% charge when marked complete.`
                  : "Triggers a charge when marked complete."}
                {" "}Payment splits arrive in F2.
              </div>
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

export default ConsultingProjectModal;
