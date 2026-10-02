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
/**
 * How many ids the page sends per request. Smaller than the API's limit on
 * purpose: each line is its own database transaction on the server, so 200 in
 * one request can run long enough to be cut off in transit, with no word on
 * screen meanwhile. 50 at a time finishes well inside that, and the bar can
 * say how far it has got.
 */
export const BULK_BATCH = 50;

/** The fields of a GET /ledger/inbox row this file reads. */
export interface InboxRowLite {
  transaction_id: string;
  direction: string; // inflow | outflow
  status: string; // needs_categorization | flagged
  description?: string | null;
  posted_date?: string | null;
  can_mark_personal?: boolean | number | null;
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

/** The HTTP status a failed call carries (lib/stellaApi.ts stellaError), or null when no answer came. */
function httpStatus(e: unknown): number | null {
  if (!(e instanceof Error)) return null;
  const status = Number((e as Error & { status?: unknown }).status);
  return Number.isFinite(status) && status > 0 ? status : null;
}

/**
 * The sentence to show for a failed call, or "" when there is none fit to
 * show. Only STELLA's own refusals (an HTTP 4xx answer) carry a sentence
 * written for a person (lib/stellaApi.ts makes it the message). A server
 * failure (5xx) may carry internals; an error with no HTTP answer at all is
 * the browser's ("Failed to fetch"); a non-Error throw has nothing to say. In
 * each of those the caller's own words are used instead.
 */
export function plainReason(e: unknown): string {
  const status = httpStatus(e);
  if (status === null || status >= 500) return "";
  return (e as Error).message || "";
}

/**
 * Did the server possibly do the work even though the page got no answer?
 * True when nothing came back (the connection dropped, the tab slept) or a
 * gateway answered in the server's place (502/503/504 — the request may still
 * be running behind it). The server works through every line it was given, so
 * "nothing was changed" would then be a guess, and often a wrong one.
 */
export function answerLost(e: unknown): boolean {
  const status = httpStatus(e);
  return status === null || status >= 502;
}

/** Split a selection into the rows Personal applies to and a count of the rest. */
export function personalSplit<T extends InboxRowLite>(rows: T[]): { eligible: T[]; skipped: number } {
  const eligible = rows.filter((r) => canMarkPersonal(r));
  return { eligible, skipped: rows.length - eligible.length };
}

/** The sentence a skipped money-in line gets, wherever it is said. */
export const MONEY_IN_PERSONAL_RULE =
  "money coming in can be marked personal only when it came from a card you've set as a personal card under Bank and card accounts";

/* ── One category for lines going both ways ─────────────────────────────── */

export type CategoryType = string | null | undefined; // asset | liability | equity | revenue | expense

/**
 * Which picked lines "Assign to this category" applies to.
 *
 * One category for everything picked, unless the pick MIXES money in and money
 * out and the category is an income or an expense one. Then the lines going
 * the other way are left out — counted, never dropped silently — because a
 * card payment (money in) filed under Meals posts as business cash coming in
 * and understates the expense, and a charge filed under income is the same
 * mistake turned round. A pick that is all one way is assigned as picked: five
 * refunds into Materials is a real thing to do.
 */
export function assignSplit<T extends Pick<InboxRowLite, "direction">>(
  rows: T[],
  categoryType: CategoryType
): { eligible: T[]; skipped: number; skippedSide: "in" | "out" | null; moneyIn: number; moneyOut: number } {
  const moneyIn = rows.filter((r) => r.direction === "inflow").length;
  const moneyOut = rows.length - moneyIn;
  const mixed = moneyIn > 0 && moneyOut > 0;
  if (mixed && categoryType === "expense") {
    return { eligible: rows.filter((r) => r.direction !== "inflow"), skipped: moneyIn, skippedSide: "in", moneyIn, moneyOut };
  }
  if (mixed && categoryType === "revenue") {
    return { eligible: rows.filter((r) => r.direction === "inflow"), skipped: moneyOut, skippedSide: "out", moneyIn, moneyOut };
  }
  return { eligible: rows, skipped: 0, skippedSide: null, moneyIn, moneyOut };
}

/** Why the lines assignSplit left out were left out, as a clause. */
export function assignSkipRule(side: "in" | "out" | null): string {
  return side === "out"
    ? "money going out doesn't belong in an income category, so assign those on their own"
    : "money coming in doesn't belong in an expense category, so assign those on their own";
}

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

/** Ids in batches of BULK_BATCH (never more than the API's BULK_MAX). */
export function chunkIds(ids: string[], size = BULK_BATCH): string[][] {
  const step = Math.max(1, Math.min(size, BULK_MAX));
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += step) out.push(ids.slice(i, i + step));
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
 * What did not come back from a bulk action. `lost` is true when the batch
 * that failed may have been worked through anyway (no answer, or a gateway's)
 * — then `uncertain` of the lines might have changed and nobody can say which.
 * The batches after it were never sent.
 */
export interface BulkUnsent {
  count: number;
  reason: string;
  lost?: boolean;
  /** Of `count`, the lines in the batch whose answer was lost (0 when it was heard). */
  uncertain?: number;
}

/**
 * Send one bulk action: one POST per BULK_BATCH ids, in order, reporting
 * progress after each. A batch whose request fails stops the sending; what
 * was not confirmed is returned so the result line can say so truthfully.
 */
export async function sendBulk(
  post: (path: string, body: unknown) => Promise<unknown>,
  action: BulkAction,
  ids: string[],
  coaAccountId?: string | null,
  onProgress?: (sent: number, total: number) => void
): Promise<{ answer: BulkAnswer; unsent: BulkUnsent | null }> {
  const answers: Array<Partial<BulkAnswer> | null> = [];
  let unsent: BulkUnsent | null = null;
  const batches = chunkIds(ids);
  let sent = 0;
  for (let i = 0; i < batches.length; i++) {
    try {
      answers.push((await post(BULK_PATH, bulkBody(action, batches[i], coaAccountId))) as Partial<BulkAnswer> | null);
      sent += batches[i].length;
      onProgress?.(sent, ids.length);
    } catch (e) {
      const lost = answerLost(e);
      unsent = {
        count: batches.slice(i).reduce((n, b) => n + b.length, 0),
        reason: plainReason(e),
        lost,
        uncertain: lost ? batches[i].length : 0,
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

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * The months a set of dates fall in, in words:
 *   ["2026-07-15", "2026-08-02"] → "July and August 2026"
 *   ["2025-12-30", "2026-01-04"] → "December 2025 and January 2026"
 */
export function monthList(dates: Array<string | null | undefined>): { text: string; count: number } {
  const keys = [...new Set(dates.map((d) => String(d || "").slice(0, 7)))]
    .filter((k) => /^\d{4}-(0[1-9]|1[0-2])$/.test(k))
    .sort();
  if (!keys.length) return { text: "", count: 0 };
  const year = (k: string) => k.slice(0, 4);
  const sameYear = keys.every((k) => year(k) === year(keys[0]));
  const names = keys.map((k) => {
    const m = MONTH_NAMES[Number(k.slice(5, 7)) - 1];
    return sameYear ? m : `${m} ${year(k)}`;
  });
  const joined = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return { text: sameYear ? `${joined} ${year(keys[0])}` : joined, count: keys.length };
}

/**
 * The refusals the API names with a short code, each said once for however
 * many lines it covers ("3 are in months you've closed …") instead of once per
 * distinct sentence. `n` is how many lines; `months` the months they fall in.
 */
const KNOWN_REFUSALS: Record<string, (n: number, months: { text: string; count: number }) => string> = {
  period_closed: (n, m) => {
    const several = m.count > 1 || (m.count === 0 && n > 1);
    return `${plural(n, "is", "are")} in ${several ? "months" : "a month"} you've closed${m.text ? ` (${m.text})` : ""}`
      + ` — reopen ${several ? "those months" : "that month"} under Period Close to change ${plural(n, "it", "them")}`;
  },
  not_in_inbox: (n) => `${plural(n, "was", "were")} no longer waiting in your inbox`,
  already_void: (n) => `${plural(n, "was", "were")} voided, so ${plural(n, "it's", "they're")} already out of your books`,
  not_found: () => "could not be found — refresh the page and try again",
  personal_not_allowed: (n) => `${plural(n, "is", "are")} money coming in, which ${MONEY_IN_PERSONAL_RULE.replace(/^money coming in /, "")}`,
};

export interface RefusalGroup {
  count: number;
  /** For a known refusal, what follows the count ("were no longer waiting in your inbox"); otherwise the API's sentence as a clause. */
  reason: string;
  known: boolean;
}

/**
 * Failed rows grouped by WHY, largest group first. A refusal the API names
 * with a code is grouped by that code (so two closed months are one reason,
 * with both months named from the rows' own dates); anything else by its
 * sentence; a failure with neither gets the generic words.
 */
export function refusalGroups(answer: BulkAnswer, datesById?: Map<string, string | null | undefined>): RefusalGroup[] {
  const groups = new Map<string, { known: string | null; clause: string; ids: string[] }>();
  const failures = answer.results.filter((r) => !r.ok);
  for (const f of failures) {
    const code = f.error && KNOWN_REFUSALS[f.error] ? f.error : null;
    const clause = code ? "" : asClause(f.message || "") || GENERIC_REFUSAL;
    const key = code ? `code:${code}` : `text:${clause}`;
    const g = groups.get(key) || { known: code, clause, ids: [] };
    g.ids.push(String(f.transaction_id));
    groups.set(key, g);
  }
  // The answer counted more failures than it described: those still get said.
  const undescribed = Math.max(0, answer.failed - failures.length);
  if (undescribed) {
    const key = `text:${GENERIC_REFUSAL}`;
    const g = groups.get(key) || { known: null, clause: GENERIC_REFUSAL, ids: [] };
    for (let i = 0; i < undescribed; i++) g.ids.push("");
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({
      count: g.ids.length,
      known: g.known !== null,
      reason: g.known
        ? KNOWN_REFUSALS[g.known](g.ids.length, monthList(g.ids.map((id) => datesById?.get(id))))
        : g.clause,
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * The one line said after a bulk action.
 *   "Marked 42 personal."
 *   "Assigned 9 to Vehicle & Fuel. 2 are in a month you've closed (July 2026) — reopen that month under Period Close to change them."
 *   "Marked 40 personal. 2 were left as they are: money coming in can be marked personal only when …"
 */
export function bulkResultSentence(input: {
  action: BulkAction;
  categoryName?: string | null;
  answer: BulkAnswer;
  /** Selected rows the action does not apply to — never sent, always counted. */
  skipped?: number;
  /** Why those were left out (defaults to the money-in Personal rule). */
  skippedWhy?: string;
  /** What did not come back (see BulkUnsent). */
  unsent?: BulkUnsent | null;
  /** posted_date per transaction_id — names the months a closed-period refusal falls in. */
  datesById?: Map<string, string | null | undefined>;
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

  const groups = refusalGroups(answer, input.datesById);
  const refused = groups.reduce((n, g) => n + g.count, 0);
  if (refused) {
    if (groups.length === 1) {
      const g = groups[0];
      parts.push(g.known ? `${refused} ${g.reason}.` : `${refused} could not be changed: ${g.reason}.`);
    } else {
      const each = groups.map((g) => (g.known ? `${g.count} ${g.reason}` : `${g.count}: ${g.reason}`)).join("; ");
      parts.push(`${refused} could not be changed: ${each}.`);
    }
  }

  if (unsent && unsent.lost) {
    // No answer came back for a batch the server may well have worked through:
    // say so, and point at the list (it is reloaded straight after) instead
    // of guessing "nothing was changed".
    const uncertain = Math.min(unsent.uncertain ?? unsent.count, unsent.count);
    const never = unsent.count - uncertain;
    let s = `We lost the connection, so we can't tell whether ${uncertain === 1 ? "1 line" : `${uncertain} lines`} changed`;
    if (never > 0) s += `, and ${never} more ${plural(never, "was", "were")} not sent`;
    parts.push(`${s}. The list below shows what is still waiting.`);
  } else if (unsent) {
    const why = asClause(unsent.reason || "") || "something went wrong on our side";
    parts.push(
      done || refused
        ? `${unsent.count} ${plural(unsent.count, "was", "were")} not changed: ${why}. Try ${plural(unsent.count, "it", "those")} again.`
        : `Nothing was changed: ${why}. Please try again.`
    );
  }

  if (skipped) {
    parts.push(`${skipped} ${plural(skipped, "was", "were")} left as ${plural(skipped, "it is", "they are")}: ${input.skippedWhy || MONEY_IN_PERSONAL_RULE}.`);
  }

  if (!done && !refused && !unsent) {
    parts.unshift(action === "personal" ? "Nothing was marked personal." : "Nothing was changed.");
  }
  return parts.join(" ");
}

/** The in-page question before a bulk "Mark N personal" (asked once, never a browser box). */
export function bulkPersonalQuestion(eligible: number, skipped: number): string {
  const head = `Mark ${eligible} personal? ${plural(eligible, "It leaves", "They leave")} your business books and every report. ` +
    `You can bring ${plural(eligible, "it", "any of them")} back${eligible === 1 ? "" : " one at a time"} from Transactions → Personal.`;
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

/**
 * What "Show more" does with the page it read.
 *  - New rows: append them; the total never drops below what is on screen.
 *  - No new rows although the queue says there are more: the queue moved
 *    under us (a bank sync added lines at the top, so this offset returned
 *    rows already shown). Reload from the top instead of leaving a "Show more"
 *    that adds nothing and new lines that never appear.
 */
export function showMoreOutcome<T extends { transaction_id: string }>(
  loaded: T[],
  page: { rows: T[]; total: number }
): { kind: "append"; rows: T[]; total: number } | { kind: "reload" } {
  const rows = mergePage(loaded, page.rows);
  if (rows.length === loaded.length && page.total > loaded.length) return { kind: "reload" };
  return { kind: "append", rows, total: Math.max(page.total, rows.length) };
}

/**
 * The note beside the list when the search box or a filter hides some of what
 * is loaded — and, while not all of the queue is loaded, that the rest is not
 * searched or filtered yet. Never fewer lines than exist without saying so.
 */
export function shownNote(s: { search: string; filterLabel: string | null; shown: number; loaded: number; more: number }): string {
  const searching = s.search.trim().length > 0;
  if (!searching && !s.filterLabel) return "";
  const rest = s.more > 0 ? ` — Show more below to ${searching ? "search" : "see"} the rest` : "";
  if (searching) return `${s.shown} of the ${s.loaded} shown match${rest}`;
  return `${s.shown} of the ${s.loaded} shown ${plural(s.shown, "is", "are")} ${String(s.filterLabel).toLowerCase()}${rest}`;
}

/* ── Undo of a single "Personal" ────────────────────────────────────────── */

/**
 * The PATCH /ledger/transactions/:id body that puts a line marked Personal
 * back exactly where it was: its old status (needs_categorization or flagged),
 * and nothing else. Marking a line personal no longer touches its "needs
 * reimbursement" flag on the server, so there is nothing else to put back.
 */
export function undoPersonalBody(r: Pick<InboxRowLite, "status">): { status: "needs_categorization" | "flagged" } {
  return { status: r.status === "flagged" ? "flagged" : "needs_categorization" };
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
