// DeliverableActionPanel — F-Shared.1 (Consulting Rework 2026-06-28).
//
// ONE component, THREE host contexts (Service Requests, Project Milestones,
// standalone Deliverables page).
//
// Status vocabulary — tolerant of the spellings the backend has used:
//
//   pending           ↔ draft                       (founder is building it)
//   awaiting_client_review ↔ submitted ↔ awaiting_client
//                                                   (client decides)
//   sent              ↔ sent_to_client             (client has it; nothing to decide)
//   in_revision       ↔ revision_requested         (founder is reworking)
//   approved          (terminal — locked)
//   archived          (terminal — hidden by default in lists)
//
// The component normalises on render so callers can pass whichever spelling
// the backend on the wire happens to use.
//
// Endpoint contract (oliver-api), 2026-09-15:
//   A document ON A REQUEST is reviewed by reviewing the request:
//     PATCH /consulting/requests/:id  { action: "approve" }
//     PATCH /consulting/requests/:id  { action: "request_revision", note }
//   That single move advances the task, moves every document on it and emails
//   the agency. The old default — POST /consulting/deliverables/:id/approve —
//   wrote oliver.deliverable, a different table, so it never worked for a
//   consulting file, and approving a file on its own would have left its
//   request waiting.
//   A document on a MILESTONE, or standalone:
//     PATCH /consulting/deliverables/:id/approve
//     PATCH /consulting/deliverables/:id/request-revisions   { note }
//   POST /consulting/deliverables/:id/send-to-client — founder: pending → awaiting_client_review.
//     Not offered for a document on a request: moving the request to Client
//     Review is what sends it.
//   POST /consulting/deliverables/:id/pay — client-side deliverable pay. STILL
//     DEFERRED (ADR-006): client pays via a Stripe portal invoice link; status
//     syncs from the webhook. Founder-side milestone charges go through
//     POST /payment-milestones/:id/approve (confirm_charge), NOT this route.
//
// Per SCOPE_WORKING.md Delta 4 (locked 2026-06-28): one component, role-aware,
// payment-trigger only shown when the host context is a milestone AND the
// row carries is_payment_trigger.
import { useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";

// ─── Status normaliser ───────────────────────────────────────────────────

/** Canonical vocabulary the panel renders against. */
export type DeliverableStatusCanonical =
  | "pending"
  | "awaiting_client_review"
  | "sent"
  | "in_revision"
  | "approved"
  | "archived";

/** Any string the backend might hand us. Defensive — we map, not throw. */
export type DeliverableStatusWire =
  | DeliverableStatusCanonical
  | "draft"
  | "submitted"
  | "awaiting_client"
  | "sent_to_client"
  | "revision_requested";

export function normalizeStatus(raw: string | null | undefined): DeliverableStatusCanonical {
  switch ((raw || "").toLowerCase()) {
    case "draft":
    case "pending":
      return "pending";
    case "submitted":
    case "awaiting_client":
    case "awaiting_client_review":
      return "awaiting_client_review";
    // 2026-09-15 — used to fall through to "pending", so a document the client
    // HAD been sent rendered "Not yet sent for review".
    case "sent_to_client":
    case "sent":
      return "sent";
    case "revision_requested":
    case "in_revision":
      return "in_revision";
    case "approved":
      return "approved";
    case "archived":
      return "archived";
    default:
      // Unknown states surface as pending so the founder still sees an
      // edit affordance instead of a dead row.
      return "pending";
  }
}

// ─── Shape the panel needs ───────────────────────────────────────────────
//
// Minimal — the panel renders status + actions; description / file preview
// is the host's job (the panel is mounted inline beneath that content).

export interface DeliverableShape {
  /** Server PK. UNIQUEIDENTIFIER on consulting.deliverable. */
  deliverable_id: string;
  /** Wire status (any spelling); we normalise on render. */
  status: DeliverableStatusWire | string;
  /** Set when the document hangs off a task / service request. Its review
   *  then happens on the request, never on the file alone. */
  service_request_id?: string | null;
  /** When the client was sent it. */
  sent_at?: string | null;
  /** Milestone-trigger flag. Only meaningful when host context is 'milestone'. */
  is_payment_trigger?: boolean | number | null;
  /** Dollars-in-cents to charge. Required when is_payment_trigger=1. */
  payment_amount_cents?: number | null;
  /** Already-charged state. Hides Pay CTA when 'paid' / 'charged'. */
  payment_charge_status?: string | null;
  /** Server-resolved reviewer name for the meta line. */
  reviewer_display_name?: string | null;
  /** ISO timestamp; rendered when status='approved'. */
  approved_at?: string | null;
  /** Founder-side meta — who requested revisions and when. */
  revision_requested_by_name?: string | null;
  revision_requested_at?: string | null;
  /** Latest revision notes from the open revision row. */
  revision_notes?: string | null;
}

// ─── Props ───────────────────────────────────────────────────────────────

export interface DeliverableActionPanelProps {
  deliverable: DeliverableShape;
  viewerRole: "founder" | "client";
  /** Re-fire after a successful action so the host refreshes. */
  onChanged?: () => void;
  /**
   * Founder-only override — open the deliverable detail editor. Wired by the
   * host (ProjectModal opens the milestone detail; the Deliverables page
   * deep-links to the row). Falls back to a no-op if the host doesn't supply
   * one (the pencil icon hides itself in that case).
   */
  onEdit?: () => void;
  /** Optional approve-callback override (see the endpoint contract above for
   *  the default). The host can short-circuit for unit-testing. */
  onApprove?: () => Promise<void> | void;
  /** Optional override mirroring onApprove for the revisions branch. */
  onRequestRevision?: (notes: string) => Promise<void> | void;
  /**
   * Optional pay-CTA override. Default behaviour POSTs to
   * /consulting/deliverables/:id/pay, which is still deferred server-side
   * (ADR-006 — client pays via Stripe portal invoice link). Hosts that own a
   * working Stripe checkout flow should wire their own handler here; otherwise
   * the default surfaces the backend's not-yet-implemented message.
   */
  onPay?: () => Promise<void> | void;
  /**
   * Founder-only: the host asks WHO before anything is sent (the project
   * modal's Deliverables tab opens RecipientPickerDialog and POSTs
   * send-to-client with the people ticked). Without it, "Send to Client" posts
   * straight away as before.
   */
  onSendToClient?: () => void;
  /**
   * Host context — drives whether the Pay CTA is candidate-renderable.
   * 'sr' / 'standalone' never show Pay even when is_payment_trigger=1 (those
   * trigger payment via a different surface). Default 'standalone'.
   */
  context?: "milestone" | "sr" | "standalone";
  /**
   * When true, all CTAs render disabled + dimmed. Used by hosts that render
   * the panel inside a read-only/historical view (e.g. archived SR, closed
   * project). Status meta strip still renders normally.
   */
  readOnly?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────

export function DeliverableActionPanel({
  deliverable,
  viewerRole,
  onChanged,
  onEdit,
  onApprove,
  onRequestRevision,
  onPay,
  onSendToClient,
  context = "standalone",
  readOnly = false,
}: DeliverableActionPanelProps) {
  const { post, patch } = useOliverApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [revOpen, setRevOpen] = useState(false);
  const [revNotes, setRevNotes] = useState("");

  const status = normalizeStatus(deliverable.status);
  const onRequest = !!deliverable.service_request_id;
  const isPaymentTrigger = Boolean(
    typeof deliverable.is_payment_trigger === "number"
      ? deliverable.is_payment_trigger === 1
      : deliverable.is_payment_trigger,
  );
  const paymentSettled =
    deliverable.payment_charge_status === "paid" ||
    deliverable.payment_charge_status === "charged";
  const showPayCta =
    context === "milestone" &&
    isPaymentTrigger &&
    !paymentSettled &&
    (deliverable.payment_amount_cents || 0) > 0;

  // ── Action handlers ─────────────────────────────────────────────────

  async function handleApprove() {
    setBusy(true);
    setError(null);
    try {
      if (onApprove) {
        await onApprove();
      } else if (onRequest) {
        await patch(`/consulting/requests/${deliverable.service_request_id}`, { action: "approve" });
      } else {
        await patch(`/consulting/deliverables/${deliverable.deliverable_id}/approve`, {});
      }
      if (showPayCta || (isPaymentTrigger && (deliverable.payment_amount_cents || 0) > 0)) {
        setInfo("Invoice sent — pay through your portal.");
      }
      onChanged?.();
    } catch (e) {
      setError((e as Error).message || "Could not approve.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRequestRevision() {
    const trimmed = revNotes.trim();
    if (!trimmed) {
      setError("Please tell us what to change.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (onRequestRevision) {
        await onRequestRevision(trimmed);
      } else if (onRequest) {
        await patch(`/consulting/requests/${deliverable.service_request_id}`, {
          action: "request_revision",
          note: trimmed,
        });
      } else {
        await patch(`/consulting/deliverables/${deliverable.deliverable_id}/request-revisions`, {
          note: trimmed,
        });
      }
      setRevOpen(false);
      setRevNotes("");
      onChanged?.();
    } catch (e) {
      setError((e as Error).message || "Could not submit revisions.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSendToClient() {
    if (onSendToClient) { onSendToClient(); return; }
    setBusy(true);
    setError(null);
    try {
      await post(`/consulting/deliverables/${deliverable.deliverable_id}/send-to-client`, {});
      onChanged?.();
    } catch (e) {
      setError((e as Error).message || "Could not send to client.");
    } finally {
      setBusy(false);
    }
  }

  async function handlePay() {
    setBusy(true);
    setError(null);
    try {
      if (onPay) {
        await onPay();
      } else {
        await post(`/consulting/deliverables/${deliverable.deliverable_id}/pay`, {});
      }
      onChanged?.();
    } catch (e) {
      setError((e as Error).message || "Could not start payment.");
    } finally {
      setBusy(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────

  // Terminal states — both roles get the same read-only meta strip.
  if (status === "approved" || status === "archived") {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
        <div className="flex items-center gap-2">
          <StatusPill status={status} />
          {deliverable.approved_at && (
            <span className="text-[11px] text-emerald-700">
              {status === "approved" ? "Approved" : "Archived"}{" "}
              {formatDate(deliverable.approved_at)}
            </span>
          )}
          {deliverable.reviewer_display_name && (
            <span className="text-[11px] text-emerald-700">
              by {deliverable.reviewer_display_name}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Sent without a review — a standalone document, or a review the agency took
  // back. The client has it and there is nothing for them to decide.
  if (status === "sent") {
    const canAskForReview = viewerRole === "founder" && !onRequest;
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <StatusPill status={status} />
          {deliverable.sent_at && (
            <span className="text-[11px] text-slate-600">{formatDate(deliverable.sent_at)}</span>
          )}
        </div>
        {canAskForReview && (
          <button
            type="button"
            onClick={handleSendToClient}
            disabled={busy || readOnly}
            className="w-full rounded bg-sky-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {busy ? "Sending…" : "Ask for review"}
          </button>
        )}
        {error && <div className="text-[11px] text-red-700">{error}</div>}
      </div>
    );
  }

  // In-revision — meta strip + (founder only) edit pencil. No actions until
  // founder re-uploads (server flips back to awaiting_client_review).
  if (status === "in_revision") {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
        <div className="flex items-center gap-2">
          <StatusPill status={status} />
          {deliverable.revision_requested_by_name && (
            <span className="text-[11px] text-amber-800">
              Requested by {deliverable.revision_requested_by_name}
              {deliverable.revision_requested_at &&
                ` · ${formatDate(deliverable.revision_requested_at)}`}
            </span>
          )}
          {viewerRole === "founder" && onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="ml-auto text-[11px] font-semibold text-amber-900 hover:underline"
              aria-label="Edit deliverable"
            >
              Edit ✎
            </button>
          )}
        </div>
        {deliverable.revision_notes && (
          <div className="mt-1.5 whitespace-pre-wrap rounded bg-white/60 px-2 py-1 text-[11px] text-amber-900">
            <span className="font-semibold">Revision notes:</span> {deliverable.revision_notes}
          </div>
        )}
      </div>
    );
  }

  // ── awaiting_client_review ─────────────────────────────────────────
  if (status === "awaiting_client_review") {
    if (viewerRole === "client") {
      // Client side — approve / request-revisions.
      // When is_payment_trigger=1 AND we're inside a milestone host context,
      // the Approve button picks up the invoice-generation label so the
      // client knows it's a one-click "approve + generate invoice" action.
      const isMilestonePayment =
        context === "milestone" &&
        isPaymentTrigger &&
        (deliverable.payment_amount_cents || 0) > 0;
      const approveLabel = isMilestonePayment
        ? `Approve & Generate Invoice (${formatMoneyCents(deliverable.payment_amount_cents)})`
        : "Approve";

      if (revOpen) {
        return (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
            <textarea
              value={revNotes}
              onChange={(e) => setRevNotes(e.target.value)}
              placeholder="What needs to change?"
              rows={3}
              disabled={busy || readOnly}
              className="w-full rounded border border-amber-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            {error && <div className="mt-1 text-[11px] text-red-700">{error}</div>}
            <div className="mt-1.5 flex gap-1">
              <button
                type="button"
                onClick={handleRequestRevision}
                disabled={busy || readOnly}
                className="flex-1 rounded bg-amber-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {busy ? "Sending…" : "Send revisions"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setRevOpen(false);
                  setRevNotes("");
                  setError(null);
                }}
                disabled={busy || readOnly}
                className="rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
            </div>
          </div>
        );
      }

      return (
        <div className="space-y-1.5">
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={handleApprove}
              disabled={busy || readOnly}
              className="flex-1 rounded bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? "…" : approveLabel}
            </button>
            <button
              type="button"
              onClick={() => setRevOpen(true)}
              disabled={busy || readOnly}
              className="flex-1 rounded bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              Request Revisions
            </button>
          </div>
          {showPayCta && (
            <button
              type="button"
              onClick={handlePay}
              disabled={busy || readOnly}
              className="w-full rounded border border-emerald-300 bg-white px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
            >
              Pay {formatMoneyCents(deliverable.payment_amount_cents)} now
            </button>
          )}
          {error && <div className="text-[11px] text-red-700">{error}</div>}
          {info && <div className="text-[11px] text-emerald-700">{info}</div>}
        </div>
      );
    }

    // Founder side — status pill + edit pencil. No client-facing CTAs
    // because the deliverable already went out.
    return (
      <div className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2">
        <StatusPill status={status} />
        <span className="text-[11px] text-sky-800">
          Waiting on client{deliverable.sent_at ? ` · sent ${formatDate(deliverable.sent_at)}` : ""}
        </span>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="ml-auto text-[11px] font-semibold text-sky-900 hover:underline"
            aria-label="Edit deliverable"
          >
            Edit ✎
          </button>
        )}
      </div>
    );
  }

  // ── pending (founder-only build state) ─────────────────────────────
  if (viewerRole === "founder") {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <StatusPill status={status} />
          {onRequest && (
            <span className="text-[11px] text-slate-500">
              Goes to the client when its task moves to Client Review.
            </span>
          )}
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="ml-auto text-[11px] font-semibold text-slate-600 hover:underline"
              aria-label="Edit deliverable"
            >
              Edit ✎
            </button>
          )}
        </div>
        {!onRequest && (
          <button
            type="button"
            onClick={handleSendToClient}
            disabled={busy || readOnly}
            className="w-full rounded bg-sky-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send to Client"}
          </button>
        )}
        {error && <div className="text-[11px] text-red-700">{error}</div>}
      </div>
    );
  }

  // Client sees a pending row only when the founder hasn't sent it yet —
  // shouldn't normally happen (the server hides unsent drafts from clients)
  // but degrade to a quiet meta strip rather than a broken UI.
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
      <StatusPill status={status} /> <span className="ml-1">Not yet sent for review.</span>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: DeliverableStatusCanonical }) {
  const map: Record<DeliverableStatusCanonical, { label: string; cls: string }> = {
    pending: { label: "Pending", cls: "bg-slate-200 text-slate-700" },
    awaiting_client_review: { label: "Awaiting review", cls: "bg-sky-200 text-sky-800" },
    sent: { label: "Sent", cls: "bg-slate-200 text-slate-700" },
    in_revision: { label: "In revision", cls: "bg-amber-200 text-amber-800" },
    approved: { label: "Approved", cls: "bg-emerald-200 text-emerald-800" },
    archived: { label: "Archived", cls: "bg-slate-300 text-slate-700" },
  };
  const cfg = map[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatMoneyCents(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return "$0";
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default DeliverableActionPanel;
