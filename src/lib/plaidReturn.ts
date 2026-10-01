// plaidReturn — the bank-sends-you-back half of connecting a bank.
//
// Banks that sign you in on their own site (Chase, Capital One, Amex, Bank of
// America …) take the person away from the Bank page and send them back to it
// with `?oauth_state_id=…` on the address. Plaid Link can only pick up where it
// left off if it is opened again with the SAME link token it started with, plus
// the address the bank sent the person back to. Nothing kept that token, so the
// connection never finished.
//
// So: the token is kept in sessionStorage the moment Link first opens, with the
// time, and the Bank page reads it back when the bank returns. A token older
// than 30 minutes is not trusted (Plaid's link tokens are short-lived; a stale
// one fails inside Link with an error the owner cannot act on), and the page
// says, in one plain line, to start again.
//
// Zero imports and no `window` — every function takes its storage, its address
// and its clock, so a unit test can walk every branch (test/plaid-oauth-return).

export const PLAID_TOKEN_KEY = "stella_plaid_link_token";
export const PLAID_TOKEN_MAX_AGE_MS = 30 * 60 * 1000;
export const OAUTH_RETURN_PARAM = "oauth_state_id";

/** The slice of Web Storage this module uses (sessionStorage in the page). */
export interface TokenStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type PlaidReturn =
  /** An ordinary visit: no bank sent anyone back. */
  | { kind: "none" }
  /** The bank sent the person back and the token Link started with is still good. */
  | { kind: "resume"; token: string; receivedRedirectUri: string }
  /** The bank sent the person back, but there is no usable token (none kept, too old, or unreadable). */
  | { kind: "expired" };

function hasReturnParam(url: string): boolean {
  try {
    return new URL(url).searchParams.has(OAUTH_RETURN_PARAM);
  } catch {
    return false;
  }
}

/** Keep the link token, with the time, when Link is first opened. */
export function rememberToken(storage: TokenStorage | null | undefined, token: string, now: number): void {
  if (!storage || !token) return;
  try {
    storage.setItem(PLAID_TOKEN_KEY, JSON.stringify({ token, savedAt: now }));
  } catch {
    /* storage full or blocked — the return will read as expired, which is honest */
  }
}

/** Forget the link token (on success, on exit, on error, and on an expired return). */
export function clearToken(storage: TokenStorage | null | undefined): void {
  if (!storage) return;
  try {
    storage.removeItem(PLAID_TOKEN_KEY);
  } catch {
    /* nothing to clear */
  }
}

/** The kept token if it is younger than the limit, else null. */
export function readToken(storage: TokenStorage | null | undefined, now: number): string | null {
  if (!storage) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(PLAID_TOKEN_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { token?: unknown; savedAt?: unknown };
    const token = typeof parsed?.token === "string" ? parsed.token : "";
    const savedAt = typeof parsed?.savedAt === "number" ? parsed.savedAt : NaN;
    if (!token || !Number.isFinite(savedAt)) return null;
    const age = now - savedAt;
    if (age < 0 || age > PLAID_TOKEN_MAX_AGE_MS) return null;
    return token;
  } catch {
    return null;
  }
}

/**
 * What the Bank page should do on load. Reads, never writes — the page clears
 * the token itself once it has acted on the answer.
 */
export function readReturn(url: string, storage: TokenStorage | null | undefined, now: number): PlaidReturn {
  if (!hasReturnParam(url)) return { kind: "none" };
  const token = readToken(storage, now);
  if (!token) return { kind: "expired" };
  // Link wants the address EXACTLY as the bank sent it, oauth_state_id included.
  return { kind: "resume", token, receivedRedirectUri: url };
}

/**
 * The same address without `oauth_state_id`, for history.replaceState — so a
 * refresh after the connection finished does not try to finish it again.
 * Other query parameters and the hash are kept.
 */
export function stripReturnParam(url: string): string {
  try {
    const u = new URL(url);
    if (!u.searchParams.has(OAUTH_RETURN_PARAM)) return url;
    u.searchParams.delete(OAUTH_RETURN_PARAM);
    return u.toString();
  } catch {
    return url;
  }
}
