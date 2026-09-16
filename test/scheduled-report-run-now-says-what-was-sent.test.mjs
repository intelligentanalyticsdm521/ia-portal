// "Run it now" must say how many messages were queued, suppressed or held.
//
// PRE-WALK 1b, 2026-09-16, walk row S8. Pressing Run it now on the dev stack
// showed, verbatim:
//
//   Ran now — 7 rows into Spend-by-month-2026-09-16.xlsx. undefined
//
// The page was printing `r.note` — a field oliver-api DELETED when the delivery
// tally replaced it (its own test asserts the note is "DELETED, not reworded").
// The server answers with the tally the walk row asks for; the page read a key
// that is not there and put the word `undefined` in front of the client.
//
// And the schedule form had no address box, so "set a scheduled report to email
// you" could not be done at all: every schedule went in as delivery_type
// "portal" with no recipients — which is why there was no tally to print.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  runNowSummary, deliverySummary, deliveryFromRecipients, unusableRecipients,
} from "../src/pages/stella/reporting/scheduledDelivery.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = readFileSync(join(ROOT, "src", "pages", "stella", "reporting", "ScheduledReportsPage.tsx"), "utf8")
  .replace(/\r\n/g, "\n");

// POST /reporting/scheduled/:id/run-now, copied from the live dev response.
const EMAILED = {
  report_run_id: "3c33fdeb-30d3-4c42-b76d-a2fb57c0c735",
  row_count: 7,
  format: "csv",
  file_name: "Spend-by-month-2026-09-16.csv",
  stored: true,
  delivery: "email",
  recipients: 1,
  sent: { attempted: 1, queued: 1, suppressed: 0, held: 0, failed: 0, duplicate: 0 },
};

test("the notice never contains the word undefined", () => {
  for (const r of [EMAILED, { row_count: 7, file_name: "x.xlsx", delivery: "portal" }, {}, null]) {
    assert.doesNotMatch(runNowSummary(r), /undefined|NaN|\[object Object\]/, JSON.stringify(r));
  }
});

test("an emailed run reports queued, suppressed and held", () => {
  const out = runNowSummary(EMAILED);
  assert.match(out, /7 rows into Spend-by-month-2026-09-16\.csv/);
  assert.match(out, /queued 1/);
  assert.match(out, /suppressed 0/);
  assert.match(out, /held 0/);
});

test("zeros are printed, not omitted — silence is the thing the tally exists to prevent", () => {
  const out = deliverySummary({ ...EMAILED, sent: { attempted: 3, queued: 0, suppressed: 3, held: 0 } });
  assert.match(out, /queued 0/, "a run that queued nothing must say so");
  assert.match(out, /suppressed 3/);
});

test("failures and duplicates are named when there are any", () => {
  const out = deliverySummary({ ...EMAILED, recipients: 4, sent: { attempted: 4, queued: 1, suppressed: 1, held: 1, failed: 1, duplicate: 2 } });
  assert.match(out, /failed 1/);
  assert.match(out, /already sent 2/);
  assert.match(out, /4 recipients/);
});

test("a portal-only schedule says it emails nobody, rather than a tally of nothing", () => {
  const out = deliverySummary({ delivery: "portal", row_count: 7 });
  assert.match(out, /Report history/);
  assert.doesNotMatch(out, /queued/);
});

test("typed addresses become an email schedule; an empty box stays portal-only", () => {
  assert.deepEqual(
    deliveryFromRecipients("you@yourbusiness.com, bookkeeper@theirfirm.com"),
    { delivery_type: "email", recipients: ["you@yourbusiness.com", "bookkeeper@theirfirm.com"] },
  );
  assert.deepEqual(deliveryFromRecipients(""), { delivery_type: "portal", recipients: [] });
  assert.deepEqual(deliveryFromRecipients("   "), { delivery_type: "portal", recipients: [] });
  // The same address twice is one recipient, not two messages.
  assert.deepEqual(deliveryFromRecipients("a@b.com a@b.com").recipients, ["a@b.com"]);
});

test("something that is not an address is reported, never posted as a recipient", () => {
  assert.deepEqual(deliveryFromRecipients("me@x.com, notanaddress").recipients, ["me@x.com"]);
  assert.deepEqual(unusableRecipients("me@x.com, notanaddress"), ["notanaddress"]);
  assert.deepEqual(unusableRecipients("me@x.com"), []);
});

test("the page reads the tally and the stale note is gone", () => {
  assert.match(PAGE, /showNotice\(runNowSummary\(r\)\);/, "Run it now prints the summary");
  assert.ok(!/\$\{r\.note\}/.test(PAGE), "`note` is not a field the server sends any more");
  assert.ok(
    !/Email delivery uses the\s*\n?\s*platform notification path/.test(PAGE),
    "the 'when it is set up' note must be gone — it is the sentence walk row S8 fails on",
  );
  assert.match(PAGE, /Email it to \(optional\)/, "the form has an address box");
  assert.match(PAGE, /deliveryFromRecipients\(recipients\)/, "and it decides the delivery type");
});
