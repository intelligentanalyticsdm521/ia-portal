/**
 * quickbooksConnection — the pure half of the OLIVER QuickBooks card.
 *
 * Kept out of the .tsx on purpose: everything here is a decision about what an
 * owner is TOLD, and those are the decisions worth pinning with tests. The
 * component is layout.
 *
 * The card has to tell four states apart, and collapsing any two of them is a
 * lie an owner will act on:
 *
 *   not set up yet     Intelligent Analytics has not registered its Intuit app
 *                      (T-INTUIT). Nobody can connect. Offering a Connect
 *                      button here dead-ends on an Intuit error page, and the
 *                      owner reasonably concludes their QuickBooks is broken.
 *   not connected      the app exists; this business has not connected.
 *   connected          it is working.
 *   needs reconnect    there IS a connection and it stopped working. The
 *                      calendar card learned this one the hard way: a green
 *                      tick over a dead connection is worse than an error,
 *                      because the owner has already told someone it is fine.
 *
 * Plus one more, orthogonal to all four: things that did not sync. A working
 * connection can still have an invoice QuickBooks refused, and that has to be
 * visible with the reason and a way to try again.
 */

export type QboStatusWord = "connected" | "needs_reconnect";

export interface QboStatus {
  /** False before the one-time Intuit app registration (T-INTUIT). */
  configured: boolean;
  not_configured_reason: string | null;
  not_configured_code: string | null;
  /** 'sandbox' until Intuit releases production keys. Shown, not hidden — an
   *  owner looking at a sandbox connection should know that is what it is. */
  environment: "sandbox" | "production" | string;
  connected: boolean;
  status: QboStatusWord | null;
  realm_id: string | null;
  connected_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  needs_attention: number;
  pushes?: string[];
  does_not_push?: string[];
}

export interface QboAttentionItem {
  queue_id: number;
  entity: "customer" | "invoice" | "payment" | "credit_memo";
  local_id: string;
  label: string | null;
  reason: string;
  attempts: number;
  since: string | null;
  next_attempt_at: string | null;
}

/** The sentence for the one-time Intuit registration, when the API has not
 *  sent one of its own (an older build, or a network error on the status call). */
export const NOT_CONFIGURED_FALLBACK =
  "QuickBooks is not set up yet — this needs a one-time Intuit app registration";

/** What actually leaves OLIVER. Rendered as a list on the card rather than
 *  described in prose, because "what will this do to my books" is the question
 *  every owner asks before pressing Connect, and the honest answer includes
 *  what it will NOT do. */
export const PUSHES = [
  "Customers — name, email, phone and billing address",
  "Invoices you have sent — line items, sales tax and the due date",
  "Payments — recorded against the invoice they paid",
  // QB-1. Named as a credit note because that is the word an owner will see in
  // QuickBooks, and the sentence says where it lands, because "we sent your
  // refund somewhere" is not an answer an accountant can work with.
  "Refunds — as a credit note in QuickBooks, applied to the invoice they came from",
] as const;

export const DOES_NOT_PUSH = [
  "Invoices imported from your previous system — that money is already in your old books, and pushing it would count your revenue twice",
  "Anything from QuickBooks back into OLIVER — this only ever goes one way",
  "Estimates, your chart of accounts, and your bank feed",
] as const;

/** The one case worth spelling out on its own: a refund against an invoice that
 *  is already paid in full has nothing left to reduce, so QuickBooks holds the
 *  credit on the customer's account instead. That is what a bookkeeper would do
 *  by hand, and an owner who is not told will read it as a missing refund. */
export const REFUND_CREDIT_NOTE =
  "If the invoice was already paid in full, the credit waits on that customer's account in QuickBooks instead of reducing the invoice.";

export const ENTITY_LABEL: Record<string, string> = {
  customer: "Customer",
  invoice: "Invoice",
  payment: "Payment",
  // The owner's word, not QuickBooks'. They pressed Refund; "Credit memo 1042"
  // would send them looking for something they never created.
  credit_memo: "Refund",
};

/** oliverApi throws `Error("OLIVER API 503: {json}")`. The code inside that
 *  body is the difference between "try again" and "this needs a one-time
 *  setup step", so it has to survive the trip intact. */
export function errorCodeOf(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const brace = msg.indexOf("{");
  if (brace === -1) return null;
  try {
    const body = JSON.parse(msg.slice(brace));
    return typeof body?.code === "string" ? body.code : (typeof body?.error === "string" ? body.error : null);
  } catch {
    return null;
  }
}

/** The message an owner should read. Prefers the API's own sentence, so
 *  support and the owner see one message rather than two paraphrases. */
export function errorMessageOf(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const brace = msg.indexOf("{");
  if (brace >= 0) {
    try {
      const body = JSON.parse(msg.slice(brace));
      if (typeof body?.message === "string" && body.message) return body.message;
    } catch { /* fall through */ }
  }
  return msg || fallback;
}

export type QboCardState = "not_configured" | "not_connected" | "connected" | "needs_reconnect";

/** The one function the card switches on. Order matters: "nobody can connect"
 *  outranks everything, and a live connection outranks a stale configured flag
 *  so a flag flapping can never hide a working connection. */
export function cardState(status: QboStatus | null): QboCardState {
  if (!status) return "not_connected";
  if (!status.connected && status.configured === false) return "not_configured";
  if (!status.connected) return "not_connected";
  return status.status === "needs_reconnect" ? "needs_reconnect" : "connected";
}

/** The words next to the pill. One short sentence, never a code. */
export function stateLabel(state: QboCardState): string {
  switch (state) {
    case "connected": return "Connected";
    case "needs_reconnect": return "Needs reconnect";
    case "not_configured": return "Not available yet";
    default: return "Not connected";
  }
}

/** The line under the heading. `null` means the card's standing explainer is
 *  the right thing to show and nothing needs to be said on top of it. */
export function stateDetail(status: QboStatus | null): string | null {
  const state = cardState(status);
  if (state === "not_configured") return status?.not_configured_reason || NOT_CONFIGURED_FALLBACK;
  if (state === "needs_reconnect") {
    return status?.last_error || "The QuickBooks connection stopped working. Press Connect QuickBooks to sign in again.";
  }
  return null;
}

/** "Last synced 6 Sept, 09:14" — or the honest absence. A card that says
 *  nothing about when it last ran lets an owner assume it ran a minute ago. */
export function lastSyncLine(status: QboStatus | null): string {
  if (!status?.connected) return "";
  if (!status.last_sync_at) return "Nothing has synced yet.";
  const d = new Date(status.last_sync_at);
  if (Number.isNaN(d.getTime())) return "Nothing has synced yet.";
  return `Last synced ${d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;
}

/** The sentence over the needs-attention list. Singular and plural, because
 *  "1 items" reads like nobody looked at this screen. */
export function attentionLine(count: number): string | null {
  if (!count) return null;
  return count === 1
    ? "1 thing did not reach QuickBooks."
    : `${count} things did not reach QuickBooks.`;
}

/** How an item in that list is named. The invoice number if we have it, the
 *  kind of thing otherwise — never a bare id, which tells the owner nothing
 *  about which invoice it is. */
export function attentionItemLabel(item: QboAttentionItem): string {
  const kind = ENTITY_LABEL[item.entity] || item.entity;
  return item.label ? `${kind} ${item.label}` : kind;
}

/** Sandbox is worth saying out loud on the card: a business looking at
 *  "Connected" should know whether it is connected to their real books or to
 *  Intuit's test company. */
export function environmentNote(status: QboStatus | null): string | null {
  if (!status?.connected) return null;
  return status.environment === "production" ? null : "Connected to an Intuit sandbox company, not your live books.";
}
