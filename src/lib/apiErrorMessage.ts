// apiErrorMessage — turn a thrown API error into a sentence.
//
// Deliberately its own module with ZERO imports. oliverApi.ts reads
// import.meta.env at module scope, so anything living in it cannot be loaded by
// the node test runner — and an error-message helper that no test can reach is
// how you end up shipping "sending failed: [object Object]".
//
// PRE-WALK 1b, 2026-09-16 — it now reads STELLA's errors too, and `details`.
// Editing a line inside a closed month put THIS on the screen, in front of a
// bookkeeper:
//
//   STELLA API 409: {"error":"period_closed","details":"2026-08-13 falls inside
//   a closed period (2026-08-01 to 2026-08-31) …","period":{"accounting_period_id":
//   "62B9CEDF-…","period_start":"2026-08-01","period_end":"2026-08-31"},
//   "reopen_path":"/ledger/periods/62B9CEDF-…/reopen"}
//
// The sentence the server wrote is in there; so are two internal ids and an API
// path. The refusal is supposed to be ONE sentence naming the month, and it
// already is — it was only ever the rendering that pasted the envelope around
// it. One helper, every product, so the next API to answer this way is covered
// the day it ships.

/** The products whose api clients throw `<PRODUCT> API <status>: <body>`. */
const API_PREFIX = /^(?:OLIVER|STELLA|SPARK|ARION|LUMEN|PLATFORM) API (\d+): (.*)$/s;

/**
 * The sentence inside one API error body, or null when there is none.
 *
 * `details` first: it is where STELLA puts the sentence and `error` holds the
 * machine code beside it ({"error":"period_closed","details":"…"}), so reading
 * `error` first would show a bookkeeper the word `period_closed`.
 *
 * Exported so the api clients can build a human `Error.message` at the throw
 * site — the thrown PREFIX stays, because callers match on it.
 */
export function apiBodySentence(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  for (const key of ["details", "message", "error"]) {
    const v = b[key];
    if (typeof v === "string" && v.trim()) return v.trim();
    // 2026-09-25 (pane re-test W-L3-04): validation answers carry details as a
    // LIST of sentences (["Amount is required"]); print them, joined, before
    // falling through to the code in `error`.
    if (Array.isArray(v)) {
      const lines = v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim());
      if (lines.length) return lines.join(" · ");
    }
    // arion answers { error: { code, message } } — one level in, no further.
    if (v && typeof v === "object") {
      const m = (v as Record<string, unknown>).message;
      if (typeof m === "string" && m.trim()) return m.trim();
    }
  }
  return null;
}

/**
 * Pull the human sentence out of an API error.
 *
 * Errors are thrown as `OLIVER API 400: {"error":"no_recipient","message":"…"}`
 * (and the same shape for STELLA, SPARK, ARION). That shape is deliberate and
 * stays — oliverLocations.ts, SetupPaymentsCard.tsx and StellaOverviewPage.tsx
 * all match on it — but it is not something to show a person. A quote send that
 * fails because the customer has no email address should say so, not paste JSON
 * into the banner.
 *
 * Falls back through details -> message -> error -> the raw string, so it never
 * returns nothing and never hides a failure it could not parse.
 */
export function apiErrorMessage(e: unknown): string {
  // Not everything thrown here is an Error. lib/oliverApi throws a PLAIN
  // OBJECT for tier gates ({ type: "tier_gate", message }), and String() on
  // that gives "[object Object]" — a banner that tells the reader nothing at
  // all. Take a message off any shape that carries one.
  if (e && typeof e === "object" && !(e instanceof Error)) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  const raw = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  if (!raw) return "Something went wrong. Try again, and tell us what you were doing if it keeps happening.";
  const m = raw.match(API_PREFIX);
  if (!m) return raw;
  try {
    const human = apiBodySentence(JSON.parse(m[2]));
    if (human) return human;
  } catch {
    /* not JSON — fall through to the raw body below */
  }
  return m[2].trim() || `Request failed (${m[1]}).`;
}
