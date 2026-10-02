// inboxBulk.ts — the pure half of the Ledger Inbox: what is selected, what a
// bulk answer means in words, how much of the queue is loaded, and what Undo
// sends. No React, no fetch — test/stella-inbox-bulk.test.mjs drives it.
//
// The owner's words, 2 Oct 2026: "there needs to be a bulk editor. Like 90% of
// that stuff on my account is personal. I'd like to be able to once a week go
// in and just hit bulk assign button and it allows me to check multiple items
// then assign it to a category or personal item."
//
// The API contract this works to (oliver-api routes/stellaLedger.js):
//   POST /ledger/transactions/bulk
//     body   { transaction_ids: string[] (1..200), action: "categorize" | "personal",
//              coa_account_id?: string }                       (required for categorize)
//     answer { data: { done, failed, results: [{ transaction_id, ok, error?, message? }] } }
//   GET /ledger/inbox?limit=&offset=  → { data: rows, pagination: { total, limit, offset } }
//     each row carries can_mark_personal: boolean
//   PATCH /ledger/transactions/:id   (Undo of a single "Personal")

/** Rows loaded per request, and per "Show more". */
export const INBOX_PAGE_SIZE = 100;
/** The most ids one POST /ledger/transactions/bulk accepts. */
export const BULK_MAX = 200;

/** The fields of a GET /ledger/inbox row this file reads. */
export interface InboxRowLite {
  transaction_id: string;
  direction: string; // inflow | outflow
  status: string; // needs_categorization | flagged
  description?: string | null;
  can_mark_personal?: boolean | number | null;
  is_reimbursable?: boolean | number | null;
  reimbursed_at?: string | null;
}

export type BulkAction = "categorize" | "personal";

export interface BulkRowResult {
  transaction_id: string;
  ok: boolean;
  error?: string;
  message?: string;
}

export interface BulkAnswer {
  done: number;
  failed: number;
  results: BulkRowResult[];
}

/* ── Who can be marked personal ─────────────────────────────────────────── */

/**
 * The API says, per row, whether "Personal" applies: always for money out, and
 * for money in only when the line came from a card the owner set as personal.
 * An API from before that field existed gets the old rule (money out only).
 */
export function canMarkPersonal(r: Pick<InboxRowLite, "direction" | "can_mark_personal">): boolean {
  const v = r.can_mark_personal;
  if (v === true || v === 1) return true;
  if (v === false || v === 0) return false;
  return r.direction === "outflow";
}

/**
 * The sentence to show for a failed call, or "" when there is none fit to
 * show: STELLA's refusals (4xx) carry a plain sentence (lib/stellaApi.ts makes
 * it the message); a server failure (5xx) or a non-Error throw may carry
 * internals, so the caller's own words are used instead.
 */
export function plainReason(e: unknown): string {
  if (!(e instanceof Error)) return "";
  const status = Number((e as Error & { status?: unknown }).status);
  if (Number.isFinite(status) && status >= 500) return "";
  return e.message || "";
}

/** Split a selection into the rows Personal applies to and a count of the rest. */
export function personalSplit<T extends InboxRowLite>(rows: T[]): { eligible: T[]; skipped: number } {
  const eligible = rows.filter((r) => canMarkPersonal(r));
  return { eligible, skipped: rows.length - eligible.length };
}

/** The sentence a skipped money-in line gets, wherever it is said. */
export const MONEY_IN_PERSONAL_RULE =
  "money coming in can be marked personal only when it came from a card you've set as a personal card under Bank and card accounts";

/* ── Selection ──────────────────────────────────────────────────────────── */

export interface InboxSelection {
  ids: Set<string>;
  /** The last row clicked — the far end of a shift-click range. */
  anchor: string | null;
}

export const EMPTY_SELECTION: InboxSelection = { ids: new Set(), anchor: null };

/**
 * One click on a row's checkbox (or on the row, in selection mode).
 * A plain click toggles that row. A shift-click sets every row from the last
 * one clicked to this one to whatever this row is turning into — the way a
 * mail inbox does it — in the order the rows are SHOWN. If the last row
 * clicked is no longer shown (filtered out, or gone), it is a plain click.
 */
export function clickRow(sel: InboxSelection, shownIds: string[], id: string, shift: boolean): InboxSelection {
  const next = new Set(sel.ids);
  const turnOn = !sel.ids.has(id);
  const from = shift && sel.anchor ? shownIds.indexOf(sel.anchor) : -1;
  const to = shownIds.indexOf(id);
  if (from !== -1 && to !== -1 && from !== to) {
    const [lo, hi] = from < to ? [from, to] : [to, from];
    for (let i = lo; i <= hi; i++) {
      if (turnOn) next.add(shownIds[i]);
      else next.delete(shownIds[i]);
    }
  } else if (turnOn) {
    next.add(id);
  } else {
    next.delete(id);
  }
  return { ids: next, anchor: id };
}

/** "Select all N shown" — adds every shown row; anything already picked stays. */
export function selectAllShown(sel: InboxSelection, shownIds: string[]): InboxSelection {
  const next = new Set(sel.ids);
  for (const id of shownIds) next.add(id);
  return { ids: next, anchor: sel.anchor };
}

/** True when every shown row is selected (and at least one is shown). */
export function allShownSelected(sel: InboxSelection, shownIds: string[]): boolean {
  return shownIds.length > 0 && shownIds.every((id) => sel.ids.has(id));
}

/**
 * What an action will actually act on: the selected rows that are SHOWN.
 * A row picked and then hidden by the search box or a filter is not changed
 * behind the owner's back, and the count on the bar says so by not counting it.
 */
export function selectedShown<T extends { transaction_id: string }>(shown: T[], sel: InboxSelection): T[] {
  return shown.filter((r) => sel.ids.has(r.transaction_id));
}

/* ── The request ────────────────────────────────────────────────────────── */

/** The body of one POST /ledger/transactions/bulk. */
export function bulkBody(action: BulkAction, ids: string[], coaAccountId?: string | null) {
  return action === "categorize"
    ? { transaction_ids: ids, action, coa_account_id: coaAccountId }
    : { transaction_ids: ids, action };
}

/** Ids in batches the API accepts (it refuses more than BULK_MAX at once). */
export function chunkIds(ids: string[], size = BULK_MAX): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

/** Several batch answers as one. Tolerates a missing or partial answer. */
export function mergeAnswers(answers: Array<Partial<BulkAnswer> | null | undefined>): BulkAnswer {
  const out: BulkAnswer = { done: 0, failed: 0, results: [] };
  for (const a of answers) {
    if (!a) continue;
    out.done += Number(a.done) || 0;
    out.failed += Number(a.failed) || 0;
    if (Array.isArray(a.results)) out.results.push(...a.results);
  }
  return out;
}

export const BULK_PATH = "/ledger/transactions/bulk";

/**
 * Send one bulk action: one POST per BULK_MAX ids, in order. A batch whose
 * request fails stops the sending, and how many never went is returned
 * (with the error's own sentence) so the result line can say so.
 */
export async function sendBulk(
  post: (path: string, body: unknown) => Promise<unknown>,
  action: BulkAction,
  ids: string[],
  coaAccountId?: string | null
): Promise<{ answer: BulkAnswer; unsent: { count: number; reason: string } | null }> {
  const answers: Array<Partial<BulkAnswer> | null> = [];
  let unsent: { count: number; reason: string } | null = null;
  const batches = chunkIds(ids);
  for (let i = 0; i < batches.length; i++) {
    try {
      answers.push((await post(BULK_PATH, bulkBody(action, batches[i], coaAccountId))) as Partial<BulkAnswer> | null);
    } catch (e) {
      unsent = {
        count: batches.slice(i).reduce((n, b) => n + b.length, 0),
        reason: plainReason(e),
      };
      break;
    }
  }
  return { answer: mergeAnswers(answers), unsent };
}

/** The ids the API says it changed. */
export function succeededIds(answer: BulkAnswer): Set<string> {
  return new Set(answer.results.filter((r) => r.ok).map((r) => String(r.transaction_id)));
}

/* ── The answer, in words ───────────────────────────────────────────────── */

const GENERIC_REFUSAL = "we couldn't save them, so please try those again";

function plural(n: number, one: string, many: string) {
  return n === 1 ? one : many;
}

/** "The month is closed." → "the month is closed" (an acronym keeps its case). */
function asClause(sentence: string): string {
  const s = sentence.trim().replace(/[.!\s]+$/, "");
  if (!s) return s;
  if (s.length > 1 && s[1] === s[1].toLowerCase() && s[0] !== s[0].toLowerCase()) {
    return s[0].toLowerCase() + s.slice(1);
  }
  return s;
}

/** Failed rows grouped by the reason the API gave, largest group first. */
export function refusalGroups(answer: BulkAnswer): Array<{ count: number; reason: string }> {
  const counts = new Map<string, number>();
  const failures = answer.results.filter((r) => !r.ok);
  for (const f of failures) {
    const reason = asClause(f.message || "") || GENERIC_REFUSAL;
    counts.set(reason, (counts.get(reason) || 0) + 1);
  }
  // The answer counted more failures than it described: those still get said.
  const undescribed = Math.max(0, answer.failed - failures.length);
  if (undescribed) counts.set(GENERIC_REFUSAL, (counts.get(GENERIC_REFUSAL) || 0) + undescribed);
  return [...counts.entries()]
    .map(([reason, count]) => ({ count, reason }))
    .sort((a, b) => b.count - a.count);
}

/**
 * The one line said after a bulk action.
 *   "Marked 42 personal."
 *   "Assigned 9 to Vehicle & Fuel. 2 could not be changed: the month they belong to is closed."
 *   "Marked 40 personal. 2 were left as they are: money coming in can be marked personal only when …"
 */
export function bulkResultSentence(input: {
  action: BulkAction;
  categoryName?: string | null;
  answer: BulkAnswer;
  /** Selected rows Personal does not apply to — never sent, always counted. */
  skipped?: number;
  /** Rows whose batch never reached the API (the request itself failed). */
  unsent?: { count: number; reason?: string | null } | null;
}): string {
  const { action, answer } = input;
  const skipped = input.skipped || 0;
  const unsent = input.unsent && input.unsent.count > 0 ? input.unsent : null;
  const done = answer.done;
  const parts: string[] = [];

  if (done > 0) {
    parts.push(
      action === "personal"
        ? `Marked ${done} personal.`
        : `Assigned ${done} to ${input.categoryName || "that category"}.`
    );
  }

  const groups = refusalGroups(answer);
  const refused = groups.reduce((n, g) => n + g.count, 0);
  if (refused) {
    const why = groups.length === 1
      ? groups[0].reason
      : groups.map((g) => `${g.count}: ${g.reason}`).join("; ");
    parts.push(`${refused} could not be changed: ${why}.`);
  }

  if (unsent) {
    const why = asClause(unsent.reason || "") || "we couldn't reach STELLA";
    parts.push(
      done || refused
        ? `${unsent.count} ${plural(unsent.count, "was", "were")} not changed: ${why}. Try ${plural(unsent.count, "it", "those")} again.`
        : `Nothing was changed: ${why}. Please try again.`
    );
  }

  if (skipped) {
    parts.push(`${skipped} ${plural(skipped, "was", "were")} left as ${plural(skipped, "it is", "they are")}: ${MONEY_IN_PERSONAL_RULE}.`);
  }

  if (!done && !refused && !unsent) {
    parts.unshift(action === "personal" ? "Nothing was marked personal." : "Nothing was changed.");
  }
  return parts.join(" ");
}

/** The in-page question before a bulk "Mark N personal" (asked once, never a browser box). */
export function bulkPersonalQuestion(eligible: number, skipped: number): string {
  const head = `Mark ${eligible} personal? ${plural(eligible, "It leaves", "They leave")} your business books and every report. ` +
    `You can bring any of them back from Transactions → Personal.`;
  if (!skipped) return head;
  return `${head} ${skipped} of the ${eligible + skipped} you picked ${plural(skipped, "is", "are")} money coming in and will be left as ${plural(skipped, "it is", "they are")}.`;
}

/* ── How much of the queue is on screen ─────────────────────────────────── */

/** "305 to review — showing 100" / "12 to review". The total is the API's, never the loaded count. */
export function queueLine(total: number, loaded: number): string {
  if (total <= 0) return "";
  if (loaded >= total) return `${total} to review`;
  return `${total} to review — showing ${loaded}`;
}

/** How many the "Show more" control would add (0 = nothing left to load). */
export function moreToLoad(total: number, loaded: number, pageSize = INBOX_PAGE_SIZE): number {
  return Math.max(0, Math.min(pageSize, total - loaded));
}

/**
 * Read a GET /ledger/inbox answer kept whole (getFull): the rows and the real
 * total. An answer without pagination counts what it sent.
 */
export function readInboxEnvelope<T>(env: unknown): { rows: T[]; total: number } {
  const e = (env || {}) as { data?: unknown; pagination?: { total?: unknown } };
  const rows = (Array.isArray(env) ? env : Array.isArray(e.data) ? e.data : []) as T[];
  const t = Number(e.pagination?.total);
  return { rows, total: Number.isFinite(t) && t >= rows.length ? t : rows.length };
}

/** Append a page, skipping any row already loaded (the queue can shift between reads). */
export function mergePage<T extends { transaction_id: string }>(loaded: T[], page: T[]): T[] {
  const seen = new Set(loaded.map((r) => r.transaction_id));
  return [...loaded, ...page.filter((r) => !seen.has(r.transaction_id))];
}

/* ── Undo of a single "Personal" ────────────────────────────────────────── */

/**
 * The PATCH /ledger/transactions/:id body that puts a line marked Personal
 * back exactly where it was: its old status (needs_categorization or flagged).
 * Marking a line personal clears its "needs reimbursement" flag on the server,
 * so a line that had one gets it back too.
 */
export function undoPersonalBody(r: Pick<InboxRowLite, "status" | "is_reimbursable" | "reimbursed_at">): {
  status: "needs_categorization" | "flagged";
  is_reimbursable?: true;
  reimbursed_at?: string | null;
} {
  const body: { status: "needs_categorization" | "flagged"; is_reimbursable?: true; reimbursed_at?: string | null } = {
    status: r.status === "flagged" ? "flagged" : "needs_categorization",
  };
  if (r.is_reimbursable === true || r.is_reimbursable === 1) {
    body.is_reimbursable = true;
    body.reimbursed_at = r.reimbursed_at ?? null;
  }
  return body;
}

/* ── The category picker, when there is nothing to pick ─────────────────── */

/**
 * Why a category picker cannot be offered, in words — or null when it can.
 * The API creates the standard categories on the first read, so "none" should
 * not happen; if it does, or the read failed, the row says so instead of
 * showing a greyed-out picker with no reason.
 */
export function categoryProblem(state: { loading: boolean; failed: boolean; count: number }): string | null {
  if (state.loading) return "Loading your categories…";
  if (state.failed) return "Your categories didn't load.";
  if (state.count === 0) return "You have no categories yet.";
  return null;
}
