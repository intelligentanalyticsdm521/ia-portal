// onsiteMoney — the office's three small views of the on-site money flow
// (on-site flow v1, Phase B, 1 Oct 2026). Pure, so test/onsite-money.test.mjs
// runs the real thing.
//
//   1. "Card on file •••• 1234" on the customer modal header and the job
//      modal, read from GET /payments/contacts/:id/methods (the default card
//      when one is marked, else the first).
//   2. "Ask for a deposit when a quote is signed: __ %" on the portal
//      settings window's Workflow tab, written to
//      oliver.tenant_settings.default_deposit_percent through PATCH /settings
//      as `defaultDepositPercent` (the same shape as `defaultTaxRate`, the
//      other percent that route writes to that row). Empty = no deposit asked.
//   3. "Deposit received" on the Invoices list rows that have one.
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

/**
 * What GET /settings says the default deposit is. `defaultDepositPercent` is
 * the route's camelCase; the snake_case column name is accepted too so a
 * route that echoes the row as stored still reads. Null = no deposit asked.
 */
export function depositPercentFromSettings(settings: unknown): number | null {
  if (!settings || typeof settings !== "object") return null;
  const s = settings as Record<string, unknown>;
  const raw = s.defaultDepositPercent !== undefined ? s.defaultDepositPercent : s.default_deposit_percent;
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

/** The PATCH /settings body for the deposit. */
export function depositPatchBody(value: number | null): { defaultDepositPercent: number | null } {
  return { defaultDepositPercent: value };
}

/**
 * The sentence after saving. "Saved" only when the API's echo carries the
 * value we sent — a route that ignored the field would otherwise answer
 * "Saved." over nothing (the 2026-09-01 address bug on this same route).
 */
export function depositSaveNote(sent: number | null, echoed: unknown): { ok: boolean; text: string } {
  const back = depositPercentFromSettings(echoed);
  const hasField = !!echoed && typeof echoed === "object"
    && ("defaultDepositPercent" in (echoed as object) || "default_deposit_percent" in (echoed as object));
  if (!hasField || back !== sent) {
    return { ok: false, text: "The deposit setting was not saved — the server did not keep it. Try again, or tell us if it keeps happening." };
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
  return `The deposit setting was not saved: ${apiErrorMessage(e)}`;
}

// ── 3. deposit received on invoice rows ───────────────────────────────────

/**
 * The deposit an invoice row carries, or null. Read from `depositAmount` on
 * the GET /invoices row (camelCase like the rest of that row); a positive
 * number only — 0, null, a missing field or a string that is not a number
 * shows nothing.
 */
export function depositReceivedOf(row: unknown): number | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const raw = r.depositAmount !== undefined ? r.depositAmount : r.deposit_amount;
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** "Deposit received $125.00". */
export function depositReceivedLabel(amount: number): string {
  return `Deposit received $${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
