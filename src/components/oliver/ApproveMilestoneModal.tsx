/**
 * ApproveMilestoneModal — F2 (Payment Splits, OLIVER side).
 *
 * Founder UI to approve + charge an OLIVER payment_milestone. Wraps the
 * IadmModal "confirm" size canvas (420×auto per F-107). Posts to
 *   POST /payment-milestones/:id/approve
 * on oliver-api.
 *
 * Locked decisions baked in (briefing 2026-06-25, also pinned in
 * SCOPE_WORKING.md "Locked Brandon decisions"):
 *   - USD only — every $ in the body is dollars, math done in cents.
 *   - 3DS / SCA requires_action surfaces as a "stuck charge" — the client
 *     gets a card-authentication email from oliver-api; the founder UI
 *     closes with an explanatory message and does NOT block on it.
 *   - Charge state machine canonical: requires_action -> processing ->
 *     succeeded -> (partial_refund | full_refund | disputed | failed |
 *     canceled). Surface 'requires_action' explicitly here; everything
 *     else funnels through onConfirm + close.
 *   - Internal projects (no linked tenant) skip the charge layer at the
 *     server. The caller is responsible for hiding this modal in that
 *     case — F1 already enforces is_payment_trigger=0 on internal
 *     projects, so this modal should never render for one.
 */
import { useState } from "react";
import { IadmModal, IadmButton } from "../IadmModal";
import { useOliverApi } from "../../hooks/useOliverApi";

export interface MilestoneShape {
  /** server PK — UNIQUEIDENTIFIER on oliver.payment_milestone. */
  payment_milestone_id: string;
  name: string;
  /** % of parent total. Either pct OR amount_cents is set, never both. */
  payment_pct?: number | null;
  /** Explicit cents amount when pct is null. */
  payment_amount_cents?: number | null;
  /** Current state machine bucket. Modal renders for 'ready' / 'n/a'. */
  status: string;
}

export type ParentKind = "quote" | "proposal" | "project";

interface Props {
  open: boolean;
  milestone: MilestoneShape;
  parentKind: ParentKind;
  parentId: string;
  /** Parent's total in CENTS — what % math is rendered against. */
  parentTotal: number;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Format cents → "$X,XXX.XX" string. USD-locked per Brandon. */
function fmtMoneyCents(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Resolve the charge amount in cents from either pct or explicit cents. */
function chargeAmountCents(m: MilestoneShape, parentTotalCents: number): number {
  if (m.payment_amount_cents != null) return Math.round(Number(m.payment_amount_cents));
  if (m.payment_pct != null) return Math.round((Number(m.payment_pct) / 100) * parentTotalCents);
  return 0;
}

/** Compute the displayed % even if only amount_cents was set on the row. */
function chargePct(m: MilestoneShape, parentTotalCents: number): number | null {
  if (m.payment_pct != null) return Number(m.payment_pct);
  if (m.payment_amount_cents != null && parentTotalCents > 0) {
    return Math.round((Number(m.payment_amount_cents) / parentTotalCents) * 1000) / 10; // 1dp
  }
  return null;
}

type ApproveResponse = {
  status: string; // canonical charge state
  charge_id?: string;
  // 3DS / SCA path — Stripe says the customer must authenticate.
  // Server still owns sending the email; we just acknowledge here.
};

export function ApproveMilestoneModal({
  open, milestone, parentKind, parentId, parentTotal,
  onConfirm, onCancel,
}: Props) {
  const { post } = useOliverApi();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [requiresAction, setRequiresAction] = useState(false);

  const amountCents = chargeAmountCents(milestone, parentTotal);
  const pct = chargePct(milestone, parentTotal);

  async function handleConfirm() {
    setBusy(true);
    setErr(null);
    try {
      // Body intentionally minimal — server has the milestone row, parent
      // FK, and tenant from JWT. parent_kind/parent_id passed for the
      // polymorphic parent integrity check on the server side.
      const res = await post<ApproveResponse>(
        `/payment-milestones/${milestone.payment_milestone_id}/approve`,
        { parent_kind: parentKind, parent_id: parentId },
      );
      if (res?.status === "requires_action") {
        // Stripe says SCA needed. oliver-api already emailed the client.
        // Tell the founder + close.
        setRequiresAction(true);
        setBusy(false);
        return;
      }
      // Anything else (processing / succeeded) — bubble up to the caller
      // and close. Caller refreshes the milestone list.
      onConfirm();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Charge failed");
      setBusy(false);
    }
  }

  function handleClose() {
    if (busy) return; // prevent close mid-Stripe call
    setErr(null);
    setRequiresAction(false);
    onCancel();
  }

  // 3DS / SCA branch — single-screen acknowledgement. The founder confirms
  // they've read it and the modal closes (bubbling onConfirm so the parent
  // refreshes; the milestone status will now be 'requires_action' and the
  // list will render the stuck-charge badge from F2 milestone-list code).
  if (requiresAction) {
    return (
      <IadmModal
        open={open}
        onClose={() => {
          setRequiresAction(false);
          onConfirm();
        }}
        product="oliver"
        eyebrow="OLIVER PAYMENTS"
        title="Card authentication needed"
        subtitle={milestone.name}
        size="confirm"
        footer={
          <IadmButton
            variant="primary"
            onClick={() => {
              setRequiresAction(false);
              onConfirm();
            }}
          >
            Got it
          </IadmButton>
        }
      >
        <div className="px-5 py-4 text-sm text-slate-700">
          Your client will receive a card-authentication email. We will
          continue when they confirm.
        </div>
      </IadmModal>
    );
  }

  return (
    <IadmModal
      open={open}
      onClose={handleClose}
      product="oliver"
      eyebrow="OLIVER PAYMENTS"
      title="Approve this step"
      subtitle={milestone.name}
      size="confirm"
      footer={
        <>
          <IadmButton variant="ghost" onClick={handleClose}>
            Cancel
          </IadmButton>
          {err ? (
            <IadmButton
              variant="accent"
              product="oliver"
              onClick={handleConfirm}
              disabled={busy}
            >
              {busy ? "Charging…" : "Retry"}
            </IadmButton>
          ) : (
            <IadmButton
              variant="accent"
              product="oliver"
              onClick={handleConfirm}
              disabled={busy}
            >
              {busy ? "Charging…" : "Confirm + Charge"}
            </IadmButton>
          )}
        </>
      }
    >
      <div className="px-5 py-4 text-sm text-slate-700">
        <p className="leading-relaxed">
          Approving this step moves the project forward and charges{" "}
          <span className="font-semibold text-slate-900">
            {fmtMoneyCents(amountCents)}
          </span>{" "}
          {pct != null && (
            <>
              ({pct}% of {fmtMoneyCents(parentTotal)} total)
            </>
          )}
          . Continue?
        </p>
        {busy && (
          <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
            <span
              className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600"
              aria-hidden
            />
            Authorizing with Stripe…
          </div>
        )}
        {err && (
          <div className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            {err}
          </div>
        )}
      </div>
    </IadmModal>
  );
}

export default ApproveMilestoneModal;
