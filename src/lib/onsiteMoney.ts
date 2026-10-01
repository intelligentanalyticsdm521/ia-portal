// onsiteMoney — the office's three small views of the on-site money flow
// (on-site flow v1, Phase B, 1 Oct 2026). Pure, so test/onsite-money.test.mjs
// runs the real thing.
//
//   1. "Card on file •••• 1234" on the customer modal header and the job
//      modal, read from GET /payments/contacts/:id/methods (the default card
//      when one is marked, else the first).
//   2. "Ask for a deposit when a quote is signed: __ %" on the portal
//      settings window's Workflow tab: oliver.tenant_settings.
//      default_deposit_percent, read from GET /workflow-settings and written
//      through PATCH /workflow-settings as `default_deposit_percent` (the
//      API's name is canonical — decided 1 Oct). Empty = no deposit asked.
//   3. "Deposit received" on the Invoices list rows that have one, read from
//      the GET /invoices row's `depositReceived`.
//
// Only Stripe's brand and last four ever appear here — never a card number.

import { apiErrorMessage } from "./apiErrorMessage";

// ── 1. card on file ───────────────────────────────────────────────────────

export interface SavedCard { last4: string; brand: string }

interface MethodRow { id?: string; brand?: string; last4?: string; is_default?: boolean }

/** The methods list as useOliverApi hands it back: the unwrapped array, or the { data } envelope. */
export function readMethods(resp: unknown): MethodRow[] {
  if (Array.isArray(resp)) return resp as MethodRow[];
  const d = resp && typeof resp === "object" ? (resp as { data?: unknown }).data : null;
  return Array.isArray(d) ? (d as MethodRow[]) : [];
}

/**
 * The card to name: the default when one is marked, else the first. PRESENCE,
 * not absence — a row only counts when it carries four digits, so a method
 * with an empty last4 never prints "Card on file •••• ".
 */
export function pickCardOnFile(methods: readonly MethodRow[]): SavedCard | null {
  const real = methods.filter((m) => typeof m?.last4 === "string" && /^\d{4}$/.test(m.last4.trim()));
  if (!real.length) return null;
  const pick = real.find((m) => m.is_default === true) ?? real[0];
  return { last4: String(pick.last4).trim(), brand: typeof pick.brand === "string" ? pick.brand : "" };
}

const BRANDS: Record<string, string> = {
  visa: "Visa", mastercard: "Mastercard", amex: "American Express", discover: "Discover",
  diners: "Diners Club", jcb: "JCB", unionpay: "UnionPay",
};

/** "Visa", "Mastercard" … or "" when Stripe said nothing useful. */
export function cardBrandName(brand: string | null | undefined): string {
  const b = String(brand ?? "").trim().toLowerCase();
  if (!b || b === "card" || b === "unknown") return "";
  return BRANDS[b] ?? b.charAt(0).toUpperCase() + b.slice(1);
}

/** "Card on file •••• 1234" — the badge's words. */
export function cardOnFileLabel(card: SavedCard): string {
  return `Card on file •••• ${card.last4}`;
}

/** The badge's hover text: "Visa ending 1234 — the default card Stripe charges." */
export function cardOnFileTitle(card: SavedCard): string {
  const brand = cardBrandName(card.brand);
  return `${brand ? `${brand} ending` : "Card ending"} ${card.last4} — the card charges run against.`;
}

/** When the lookup fails: said, not hidden (a hidden badge would read as "no card"). */
export const CARD_CHECK_FAILED = "Could not check for a card on file.";

// ── 2. default deposit percent ────────────────────────────────────────────

/** The API's field name for the default deposit, on GET and PATCH /workflow-settings. */
export const DEPOSIT_PERCENT_FIELD = "default_deposit_percent" as const;

/**
 * What GET /workflow-settings says the default deposit is
 * (`default_deposit_percent`). Null = no deposit asked.
 */
export function depositPercentFromSettings(settings: unknown): number | null {
  if (!settings || typeof settings !== "object") return null;
  const raw = (settings as Record<string, unknown>)[DEPOSIT_PERCENT_FIELD];
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** The field's text for a stored percent: "25", "12.5", or "" for none. */
export function depositPercentText(value: number | null): string {
  return value === null ? "" : String(Math.round(value * 100) / 100);
}

export type DepositPercentParse = { ok: true; value: number | null } | { ok: false; message: string };

/**
 * The box as typed → what PATCH /settings gets. Empty clears it (no deposit
 * asked — the column's NULL). Otherwise 1 to 100, at most two decimals
 * (DECIMAL(5,2)). A "%" typed after the number is forgiven.
 */
export function parseDepositPercent(text: string): DepositPercentParse {
  const t = String(text ?? "").trim().replace(/%$/, "").trim();
  if (t === "") return { ok: true, value: null };
  if (!/^\d+(\.\d+)?$/.test(t)) {
    return { ok: false, message: "The deposit must be a number between 1 and 100 — for example 25 for 25%. Leave it empty to ask for no deposit." };
  }
  const n = Number(t);
  if (n < 1 || n > 100) {
    return { ok: false, message: "The deposit must be between 1% and 100%. Leave it empty to ask for no deposit." };
  }
  if (Math.round(n * 100) !== n * 100) {
    return { ok: false, message: "The deposit can have at most two decimal places — for example 12.5." };
  }
  return { ok: true, value: n };
}

/** The PATCH /workflow-settings body for the deposit alone. */
export function depositPatchBody(value: number | null): { default_deposit_percent: number | null } {
  return { [DEPOSIT_PERCENT_FIELD]: value };
}

/**
 * The one PATCH /workflow-settings body the Workflow tab's Save sends: the
 * workflow rules as loaded/edited, the read-only `effective_reschedule_mode`
 * left out, and the deposit as typed (null clears it).
 */
export function workflowPatchBody<T extends object>(wf: T, deposit: number | null): Omit<T, "effective_reschedule_mode"> & { default_deposit_percent: number | null } {
  const { effective_reschedule_mode: _ignored, ...rest } = wf as T & { effective_reschedule_mode?: unknown };
  return { ...(rest as Omit<T, "effective_reschedule_mode">), ...depositPatchBody(deposit) };
}

/**
 * The sentence after saving. PATCH /workflow-settings answers { ok: true }
 * only, so `readBack` is GET /workflow-settings after the save: "Saved" only
 * when it carries the value we sent — a route that ignored the field would
 * otherwise answer "Saved." over nothing.
 */
export function depositSaveNote(sent: number | null, readBack: unknown): { ok: boolean; text: string } {
  const back = depositPercentFromSettings(readBack);
  const hasField = !!readBack && typeof readBack === "object" && DEPOSIT_PERCENT_FIELD in (readBack as object);
  if (!hasField || back !== sent) {
    return { ok: false, text: "Workflow rules saved, but the deposit setting was not kept by the server. Try again, or tell us if it keeps happening." };
  }
  return {
    ok: true,
    text: sent === null
      ? "Saved. No deposit is asked for when a quote is signed."
      : `Saved. Customers are asked for a ${depositPercentText(sent)}% deposit when they sign a quote.`,
  };
}

/** A failed save as a sentence (the API's own when it wrote one). */
export function depositSaveError(e: unknown): string {
  return `The workflow rules were not saved: ${apiErrorMessage(e)}`;
}

// ── 3. deposit received on invoice rows ───────────────────────────────────

/** The API's field name for the deposit on a GET /invoices row. */
export const DEPOSIT_RECEIVED_FIELD = "depositReceived" as const;

/**
 * The deposit an invoice row carries, or null. Read from `depositReceived` on
 * the GET /invoices row (the API's name — decided 1 Oct); a positive number
 * only — 0, null, a missing field or a string that is not a number shows
 * nothing.
 */
export function depositReceivedOf(row: unknown): number | null {
  if (!row || typeof row !== "object") return null;
  const raw = (row as Record<string, unknown>)[DEPOSIT_RECEIVED_FIELD];
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** "Deposit received $125.00". */
export function depositReceivedLabel(amount: number): string {
  return `Deposit received $${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
