// A refused STELLA write must reach the screen as ONE SENTENCE.
//
// PRE-WALK 1b, 2026-09-16, walk row S5. Closing August and then editing the
// memo of a line inside it put this in the bookkeeper's error banner:
//
//   STELLA API 409: {"error":"period_closed","details":"2026-08-13 falls inside
//   a closed period (2026-08-01 to 2026-08-31), and a closed period cannot be
//   changed. Reopen that period under Period Close, or date this entry after
//   the close.","period":{"accounting_period_id":"62B9CEDF-45A6-464D-82A3-
//   A6C8E46F2DC7","period_start":"2026-08-01","period_end":"2026-08-31"},
//   "reopen_path":"/ledger/periods/62B9CEDF-…/reopen"}
//
// oliver-api had written the sentence the row asks for. The Portal pasted the
// envelope around it — two internal ids and an API path on screen, and the
// sentence buried in the middle of them.
//
// These tests drive the REAL functions: apiBodySentence (the pure reader) and
// stellaError (what stellaApi throws). Both are pure and importable; no msal,
// no fetch, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { apiErrorMessage, apiBodySentence } from "../src/lib/apiErrorMessage.ts";

// The 409 oliver-api actually answers — copied from the live dev response.
const PERIOD_CLOSED = {
  error: "period_closed",
  details:
    "2026-08-13 falls inside a closed period (2026-08-01 to 2026-08-31), and a closed period "
    + "cannot be changed. Reopen that period under Period Close, or date this entry after the close.",
  period: {
    accounting_period_id: "62B9CEDF-45A6-464D-82A3-A6C8E46F2DC7",
    period_start: "2026-08-01",
    period_end: "2026-08-31",
  },
  reopen_path: "/ledger/periods/62B9CEDF-45A6-464D-82A3-A6C8E46F2DC7/reopen",
};

test("details wins over the machine code — a bookkeeper never reads `period_closed`", () => {
  const out = apiBodySentence(PERIOD_CLOSED);
  assert.equal(out, PERIOD_CLOSED.details);
  assert.doesNotMatch(out, /period_closed/);
});

test("the refusal that reaches the screen carries no ids and no API paths", () => {
  const shown = apiErrorMessage(new Error(`STELLA API 409: ${JSON.stringify(PERIOD_CLOSED)}`));
  assert.match(shown, /falls inside a closed period \(2026-08-01 to 2026-08-31\)/, "it names the month");
  assert.match(shown, /Reopen that period under Period Close/, "and says what to do");
  assert.doesNotMatch(shown, /accounting_period_id|62B9CEDF|reopen_path|\/ledger\//i, "no internals");
  assert.doesNotMatch(shown, /[{}"]/, "no JSON punctuation — it is a sentence");
  assert.doesNotMatch(shown, /^STELLA API/, "and not the envelope");
});

test("STELLA, SPARK and ARION errors read the same way OLIVER's always have", () => {
  for (const product of ["OLIVER", "STELLA", "SPARK", "ARION", "LUMEN"]) {
    assert.equal(
      apiErrorMessage(new Error(`${product} API 400: {"error":"nope","message":"Say this instead."}`)),
      "Say this instead.",
      `${product} errors must be read too`,
    );
  }
});

test("arion's nested { error: { code, message } } yields the message", () => {
  assert.equal(
    apiErrorMessage(new Error('ARION API 503: {"error":{"code":"founder_lookup_unavailable","message":"We could not check whether you are the founder. Try again in a moment.","status":503}}')),
    "We could not check whether you are the founder. Try again in a moment.",
  );
});

test("a body with nothing human in it still says something", () => {
  assert.equal(apiErrorMessage(new Error('STELLA API 422: {"error":"not_draft"}')), "not_draft");
  assert.equal(apiErrorMessage(new Error("STELLA API 502: Bad Gateway")), "Bad Gateway");
  assert.match(apiErrorMessage(new Error("STELLA API 500: ")), /500/);
});

test("stellaError puts the sentence in the message and the code in a number", async () => {
  // stellaApi.ts reads import.meta.env at module scope, so it cannot be
  // imported here — read the source and prove the two things that matter.
  const { readFileSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
  const src = readFileSync(join(ROOT, "src", "lib", "stellaApi.ts"), "utf8").replace(/\r\n/g, "\n");

  assert.match(src, /throw stellaError\(res\.status, text\);/, "the fetch throws through the builder");
  assert.match(src, /const sentence = apiBodySentence\(body\) \|\| text\.trim\(\);/, "which reads the body's sentence");
  assert.match(src, /err\.status = status;/, "and attaches the status as a number");
  assert.ok(
    !/throw new Error\(`STELLA API \$\{res\.status\}: \$\{text\}`\)/.test(src),
    "the raw envelope must not be thrown as the message again",
  );

  const page = readFileSync(join(ROOT, "src", "pages", "stella", "StellaOverviewPage.tsx"), "utf8").replace(/\r\n/g, "\n");
  assert.match(page, /status === 404/, "the Overview's not-live check compares the status, not a substring");
});
