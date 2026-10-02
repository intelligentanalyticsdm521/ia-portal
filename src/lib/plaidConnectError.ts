// plaidConnectError — one plain sentence for a bank connection that went
// wrong, and never the provider's code.
//
// 2 Oct 2026. Brandon pressed "Connect a bank or card" on Settings → Bank and
// card accounts and the page printed, on its own line, the bare text
//
//   INVALID_LINK_CUSTOMIZATION
//
// The API answered { error: "INVALID_LINK_CUSTOMIZATION" } (Plaid's own code,
// passed through), the STELLA client made that the error's message, and the
// page printed the message. A business owner cannot act on a code; it only
// tells them something is broken and nobody knows.
//
// So the page asks THIS file for the words. The code stays on the error object
// (err.body.error, where lib/stellaApi puts it) for logs and for this lookup,
// and is never put on the screen:
//
//   INVALID_LINK_CUSTOMIZATION  → a setting on OUR side (the bank-connection
//                                 settings in the Plaid dashboard). The owner
//                                 can do nothing about it; the API writes a
//                                 "needs setup" line to our server log when it
//                                 happens (oliver-api routes/stellaPlaid.js).
//   plaid_not_configured        → bank connections are not switched on here;
//                                 the way in is a statement import.
//   anything else               → it could not start (or finish, or sync) —
//                                 please try again.
//
// Zero imports, no window — test/plaid-connect-error walks every branch.

/** Codes that mean "a setting on our side", not something the owner did. */
export const PLAID_NEEDS_SETUP_CODES: readonly string[] = ["INVALID_LINK_CUSTOMIZATION"];

export const PLAID_SENTENCES = {
  needsSetup: "The bank connection needs one setting finished on our side — we've been told, and there's nothing you need to do.",
  notSwitchedOn: "Bank connections aren't switched on here yet — you can bring transactions in with Import a bank statement under Accounting.",
  connect: "The bank connection couldn't start — please try again.",
  finish: "The bank connection couldn't be finished — please try again.",
  sync: "That account couldn't sync just now — please try again.",
  disconnect: "We couldn't reach the bank network to disconnect that account, so it is still connected — please try again in a few minutes.",
  closedEarly: "The bank window closed before an account was connected, so nothing changed.",
} as const;

export type PlaidAction = "connect" | "finish" | "sync" | "disconnect";

/**
 * The provider's code behind a failed bank-connection call, or null.
 *
 * lib/stellaApi keeps the parsed answer on `err.body`, so the code is
 * `err.body.error`. An error whose whole message is a bare code (an older
 * client shape) is read too, so the lookup works either way.
 */
export function plaidErrorCode(e: unknown): string | null {
  const body = e && typeof e === "object" ? (e as { body?: unknown }).body : null;
  if (body && typeof body === "object") {
    const code = (body as { error?: unknown }).error;
    if (typeof code === "string" && code.trim()) return code.trim();
  }
  const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  const bare = msg.trim();
  return /^[A-Za-z][A-Za-z0-9_]*_[A-Za-z0-9_]+$/.test(bare) ? bare : null;
}

/** The one sentence the Bank page shows when `action` failed with `e`. */
export function plaidErrorSentence(e: unknown, action: PlaidAction): string {
  const code = plaidErrorCode(e);
  if (code && PLAID_NEEDS_SETUP_CODES.includes(code.toUpperCase())) return PLAID_SENTENCES.needsSetup;
  if (code === "plaid_not_configured") return PLAID_SENTENCES.notSwitchedOn;
  return PLAID_SENTENCES[action];
}

/**
 * A connected account's problem, in words — the row used to print the raw
 * error_code (ITEM_LOGIN_REQUIRED …) in a red pill.
 */
export function plaidItemProblem(errorCode: string | null | undefined): string | null {
  return errorCode && String(errorCode).trim() ? "Connection needs attention" : null;
}
