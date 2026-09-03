// apiErrorMessage — turn a thrown OLIVER API error into a sentence.
//
// Deliberately its own module with ZERO imports. oliverApi.ts reads
// import.meta.env at module scope, so anything living in it cannot be loaded by
// the node test runner — and an error-message helper that no test can reach is
// how you end up shipping "sending failed: [object Object]".

/**
 * Pull the human sentence out of an OLIVER API error.
 *
 * Errors are thrown as `OLIVER API 400: {"error":"no_recipient","message":"…"}`.
 * That shape is deliberate and stays — oliverLocations.ts and
 * SetupPaymentsCard.tsx both match on it — but it is not something to show a
 * person. A quote send that fails because the customer has no email address
 * should say so, not paste JSON into the banner.
 *
 * Falls back through message -> error -> the raw string, so it never returns
 * nothing and never hides a failure it could not parse.
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
  const m = raw.match(/^OLIVER API (\d+): (.*)$/s);
  if (!m) return raw;
  try {
    const body = JSON.parse(m[2]);
    const human = body?.message || body?.error;
    if (typeof human === "string" && human.trim()) return human;
  } catch {
    /* not JSON — fall through to the raw body below */
  }
  return m[2].trim() || `Request failed (${m[1]}).`;
}
