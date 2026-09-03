// lib/leadgenBilling.ts — shapes + helpers for the B2B Lead Gen billing model
// (LUMEN GET /leadgen/credits, GET /leadgen/billing; Release A.2, Brandon 2026-09-04).
//
// Rules the UI renders (server enforces them):
//   * a SPARK Leads package includes N leads per billing period; extras per run
//     at the tier rate; no package = pay per delivered lead, minimum 10 per run
//   * a card on file is required whenever a run has metered (paid) leads
//   * every paid run produces a Stripe invoice (PDF + receipt); an unpaid
//     invoice LOCKS the run's leads until it is paid
// Amounts come from the API (Stripe) — nothing here hardcodes a price.

export type LeadsPackage = "none" | "essentials" | "growth" | "authority" | "override";

export interface LeadGenCredits {
  package: LeadsPackage;
  package_source: "stripe" | "override" | "none";
  included: number;
  delivered_this_period: number;
  reserved_in_flight: number;
  remaining: number;
  rate_cents: number;
  rate_source: "stripe" | "fallback";
  one_off_min: number;
  card_on_file: boolean;
  card_brand: string | null;
  card_last4: string | null;
  stripe_customer: boolean;
  period_start: string | null;
  period_end: string | null;
}

export interface LeadGenBillingRow {
  id: number;
  job_id: number;
  run_name: string;
  created_at: string;
  completed_at: string | null;
  status: "reserved" | "settling" | "delivered" | "paid" | "invoice_open" | "invoice_failed" | "void" | "refunded" | "failed" | string;
  job_status: string;
  pay_method: string;
  target_count: number;
  delivered_count: number | null;
  credits_reserved: number | null;
  credits_consumed: number | null;
  metered_reserved: number | null;
  metered_delivered: number | null;
  rate_cents: number | null;
  amount_cents: number | null;
  stripe_invoice_id: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  invoice_status: string | null;
  credit_note_id: string | null;
  refund_amount_cents: number | null;
  error_message: string | null;
  leads_locked: boolean;
}

/** Where a customer adds / changes the card on file (Stripe Billing Portal lives behind it). */
export const BILLING_SETTINGS_ROUTE = "/app/settings/all?tab=Subscription%20%26%20Billing";

export function hasLeadsPackage(c: LeadGenCredits | null | undefined): boolean {
  return !!c && c.package !== "none";
}

export function fmtUsd(cents: number | null | undefined): string {
  return `$${((Number(cents) || 0) / 100).toFixed(2)}`;
}

/** Credits first, then metered extras — the same split the server applies. */
export function splitRun(c: LeadGenCredits | null, target: number): { fromCredits: number; metered: number; meteredCents: number } {
  if (!c || !hasLeadsPackage(c)) {
    return { fromCredits: 0, metered: target, meteredCents: target * (c?.rate_cents ?? 0) };
  }
  const fromCredits = Math.max(0, Math.min(c.remaining, target));
  const metered = Math.max(0, target - fromCredits);
  return { fromCredits, metered, meteredCents: metered * c.rate_cents };
}

export const BILLING_STATUS_LABEL: Record<string, { label: string; tone: "ok" | "warn" | "bad" | "muted" }> = {
  reserved:       { label: "Running",        tone: "muted" },
  settling:       { label: "Finishing",      tone: "muted" },
  void:           { label: "Waived",         tone: "ok" },
  delivered:      { label: "Included",       tone: "ok" },
  paid:           { label: "Paid",           tone: "ok" },
  invoice_open:   { label: "Payment due",    tone: "warn" },
  invoice_failed: { label: "Payment failed", tone: "bad" },
  refunded:       { label: "Refunded",       tone: "muted" },
  failed:         { label: "Failed",         tone: "bad" },
};

/**
 * sparkApi throws `Error("SPARK API <status>: <json>")` for non-2xx. Pull the
 * server's `message` (or `error` code) out so the customer sees a sentence,
 * not a JSON blob. Anything else passes through.
 */
export function friendlyApiError(err: unknown): Error {
  if (!(err instanceof Error)) return new Error(String(err));
  const m = /^SPARK API (\d{3}): ([\s\S]*)$/.exec(err.message);
  if (!m) return err;
  try {
    const body = JSON.parse(m[2]) as { message?: string; error?: string };
    if (body.message) return Object.assign(new Error(body.message), { code: body.error, status: Number(m[1]) });
    if (body.error) return Object.assign(new Error(String(body.error).replace(/_/g, " ")), { code: body.error, status: Number(m[1]) });
  } catch { /* not JSON */ }
  return err;
}
