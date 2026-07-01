// MilestoneList — F-Shared.1 sibling, ships the shared read-only milestone
// renderer used by both the founder and client shells of the consulting
// surfaces.
//
// Per SCOPE_WORKING.md Delta 3 (locked 2026-06-28):
//   - Founder: full milestone list with the internal checklist preview and
//     an editable `is_payment_trigger` flag (via the host's onEditPayment
//     callback — the actual edit modal lives in the project workspace).
//   - Client: name + due date + $-amount (if payment-trigger). For the
//     CURRENT ACTIVE milestone (status='active'/'in_progress'), expand to
//     render DeliverableActionPanel per linked deliverable.
//
// Status vocabulary tolerates both the F1 brief words ('active') and the
// schema column ('in_progress') — ConsultingProjectModal.tsx:836 already
// handles this fork, mirror that here so call-sites can hand us either.
//
// This component is intentionally PRESENTATIONAL — it does not own data
// fetching. The caller passes the milestones array (already loaded) and a
// per-milestone deliverables lookup so the component can mount the action
// panel inline. That keeps the hook of "load once per page" honoured (per
// [[data-fetching-convention]]).
import { useState } from "react";
import { ChevronDown, ChevronRight, CheckCircle2 } from "lucide-react";
import {
  DeliverableActionPanel,
  type DeliverableShape,
} from "./DeliverableActionPanel";

// ─── Shape ───────────────────────────────────────────────────────────────

export type MilestoneStatus =
  | "not_started"
  | "active"
  | "in_progress"
  | "complete"
  | "skipped";

export interface MilestoneShape {
  milestone_id: string;
  sort_order: number;
  name: string;
  description?: string | null;
  status: MilestoneStatus | string;
  due_date?: string | null;
  completed_at?: string | null;
  is_payment_trigger?: boolean | number | null;
  payment_pct?: number | null;
  payment_amount_cents?: number | null;
  payment_charge_status?: string | null;
  internal_review_checklist_json?: unknown;
  /** True when this milestone came from a system-seeded category template. */
  is_system_seed?: boolean;
}

// ─── Props ───────────────────────────────────────────────────────────────

export interface MilestoneListProps {
  milestones: MilestoneShape[];
  viewerRole: "founder" | "client";
  /**
   * Per-milestone deliverables. Keyed by milestone_id; absent key = no
   * deliverables to render. Only consulted when the milestone is the
   * current active one AND viewerRole='client'.
   */
  deliverablesByMilestone?: Record<string, DeliverableShape[]>;
  /**
   * Refresh hook — called after a deliverable inside the milestone changes
   * status. Lets the host re-fetch and update both the milestone-progress
   * meta AND the deliverables panel.
   */
  onDeliverableChanged?: () => void;
  /**
   * Founder-only — wires the "edit payment-trigger flag" pencil to a host
   * modal. Receives milestone_id; the host opens its detail editor. If
   * absent the pencil hides itself.
   */
  onEditPayment?: (milestoneId: string) => void;
}

// ─── Visual tokens (shared with ConsultingProjectModal) ──────────────────

const IL_BLUE = "#38BDF8";
const OLIVER_GOLD = "#FEC82C";
const NEUTRAL = "#CBD5E1";

// ─── Component ───────────────────────────────────────────────────────────

export function MilestoneList({
  milestones,
  viewerRole,
  deliverablesByMilestone,
  onDeliverableChanged,
  onEditPayment,
}: MilestoneListProps) {
  if (!milestones || milestones.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
        No milestones on this project yet.
      </div>
    );
  }

  // Defensive sort — callers already sort but a hand-edited array might not.
  const ordered = milestones
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  return (
    <ol className="space-y-3" role="list">
      {ordered.map((m, idx) => (
        <MilestoneRow
          key={m.milestone_id}
          number={idx + 1}
          milestone={m}
          viewerRole={viewerRole}
          deliverables={deliverablesByMilestone?.[m.milestone_id] || []}
          onDeliverableChanged={onDeliverableChanged}
          onEditPayment={onEditPayment}
        />
      ))}
    </ol>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────

function MilestoneRow({
  number,
  milestone,
  viewerRole,
  deliverables,
  onDeliverableChanged,
  onEditPayment,
}: {
  number: number;
  milestone: MilestoneShape;
  viewerRole: "founder" | "client";
  deliverables: DeliverableShape[];
  onDeliverableChanged?: () => void;
  onEditPayment?: (milestoneId: string) => void;
}) {
  const isComplete = milestone.status === "complete";
  const isActive =
    milestone.status === "active" || milestone.status === "in_progress";
  const isSkipped = milestone.status === "skipped";

  const isPaymentTrigger = Boolean(
    typeof milestone.is_payment_trigger === "number"
      ? milestone.is_payment_trigger === 1
      : milestone.is_payment_trigger,
  );

  // Expand-by-default rules:
  //   client + active milestone with deliverables → expanded (the user lands
  //     on the page to act on these).
  //   everything else → collapsed.
  const defaultOpen =
    viewerRole === "client" && isActive && deliverables.length > 0;
  const [open, setOpen] = useState(defaultOpen);

  return (
    <li className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
        aria-expanded={open}
      >
        <MilestoneCircle
          number={number}
          isComplete={isComplete}
          isActive={isActive}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`truncate text-sm font-semibold ${
                isSkipped ? "text-slate-400 line-through" : "text-slate-900"
              }`}
            >
              {milestone.name}
            </span>
            {isPaymentTrigger && (
              <PaymentTriggerPill
                milestone={milestone}
                viewerRole={viewerRole}
              />
            )}
            {viewerRole === "client" && deliverables.length > 0 && (
              <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sky-700">
                {deliverables.length} deliverable
                {deliverables.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
            <span className="capitalize">
              {String(milestone.status).replace(/_/g, " ")}
            </span>
            {milestone.due_date && (
              <>
                <span>·</span>
                <span>Due {formatDate(milestone.due_date)}</span>
              </>
            )}
            {isComplete && milestone.completed_at && (
              <>
                <span>·</span>
                <span>Completed {formatDate(milestone.completed_at)}</span>
              </>
            )}
          </div>
        </div>
        <span className="mt-1 text-slate-400">
          {open ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
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

          {/* FOUNDER LENS — internal review checklist + payment-trigger
              editor pencil. The actual editor lives in the project workspace
              modal; we just expose the affordance here. */}
          {viewerRole === "founder" && (
            <>
              <ChecklistPreview milestone={milestone} />
              {onEditPayment && (
                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-[11px] text-slate-700">
                    Payment trigger:{" "}
                    <span className="font-semibold">
                      {isPaymentTrigger ? "On" : "Off"}
                    </span>
                    {isPaymentTrigger && milestone.payment_pct && (
                      <span> · {milestone.payment_pct}% of total</span>
                    )}
                    {isPaymentTrigger && milestone.payment_amount_cents && (
                      <span> · {formatMoneyCents(milestone.payment_amount_cents)}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onEditPayment(milestone.milestone_id)}
                    className="text-[11px] font-semibold text-sky-700 hover:underline"
                    aria-label="Edit payment trigger"
                  >
                    Edit ✎
                  </button>
                </div>
              )}
            </>
          )}

          {/* CLIENT LENS on the ACTIVE milestone — render the action panel
              for each linked deliverable. Per SCOPE Delta 3, this is the
              client's primary affordance: approve a step, get an invoice
              via the Pay button. */}
          {viewerRole === "client" &&
            isActive &&
            deliverables.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Action needed
                </div>
                {deliverables.map((d) => (
                  <div
                    key={d.deliverable_id}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-2"
                  >
                    <DeliverableActionPanel
                      deliverable={d}
                      viewerRole="client"
                      context="milestone"
                      onChanged={onDeliverableChanged}
                    />
                  </div>
                ))}
              </div>
            )}
        </div>
      )}
    </li>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────

function PaymentTriggerPill({
  milestone,
  viewerRole,
}: {
  milestone: MilestoneShape;
  viewerRole: "founder" | "client";
}) {
  // Client-facing pill leads with the $ amount (what they care about);
  // founder pill leads with % (what they set when scoping).
  if (viewerRole === "client" && milestone.payment_amount_cents) {
    return (
      <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700">
        {formatMoneyCents(milestone.payment_amount_cents)}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700">
      Payment {milestone.payment_pct ? `${milestone.payment_pct}%` : ""}
    </span>
  );
}

function MilestoneCircle({
  number,
  isComplete,
  isActive,
}: {
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
        <span className="relative text-[11px] font-bold text-slate-900">
          {number}
        </span>
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

// Founder-only checklist preview — mirror of the one in ConsultingProjectModal
// so the shared list can drop into either shell without divergence.
function ChecklistPreview({ milestone }: { milestone: MilestoneShape }) {
  const fromServer = parseChecklist(milestone.internal_review_checklist_json);
  const items: string[] =
    fromServer.length > 0
      ? fromServer
      : milestone.is_system_seed
        ? STANDARD_REVIEW_CHECKLIST
        : [];
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-[11px] text-slate-500">
        Internal review checklist — empty for now.
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Internal review checklist{" "}
        <span className="font-normal italic text-slate-400">(preview)</span>
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
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((it) => {
      if (typeof it === "string") return it;
      if (
        it &&
        typeof it === "object" &&
        "label" in (it as Record<string, unknown>)
      ) {
        const lab = (it as Record<string, unknown>).label;
        return typeof lab === "string" ? lab : "";
      }
      return "";
    })
    .filter((s) => s.length > 0);
}

// ─── Formatters ──────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatMoneyCents(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return "$0";
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default MilestoneList;
