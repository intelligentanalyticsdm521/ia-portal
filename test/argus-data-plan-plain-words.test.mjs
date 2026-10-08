// Settings -> ARGUS data plan: the price list and the usage list an owner
// reads are plain words (verifier finding Q2, 2026-10-08). Source-pinned.
//
// The price list printed each row's raw key in a mono column under the words
// "Credit costs per AI action. Founder admin can adjust pricing quarterly as
// provider costs shift." The row's description now carries the meaning (arion
// migrations 072 and 073 put every active row in plain words), the key is
// never printed, and the words name no "AI", model, action type, founder or
// provider. The usage list printed the same raw key; it now prints the
// description of the matching price row.
//
// Each test goes red when its fix is taken out.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripComments, screenWords } from "./helpers/screenWords.mjs";

const src = readFileSync(new URL("../src/pages/settings/ArgusDataPlanPage.tsx", import.meta.url), "utf8");
const code = stripComments(src);

/** The JSX from a heading to the end of the table that follows it. */
function block(startMarker) {
  const at = code.indexOf(startMarker);
  assert.ok(at >= 0, `${startMarker} is not on the page`);
  const end = code.indexOf("</table>", at);
  assert.ok(end > at, `no table after ${startMarker}`);
  return code.slice(at, end);
}

const INTERNAL = /\bAI\b|\bmodels?\b|action[ _]type|founder|provider|tenant|agent/i;

test("the price list is headed What credits cost, in plain words, with no old heading", () => {
  assert.match(code, />What credits cost<\/h2>/);
  assert.doesNotMatch(src, /Credit costs per AI action/);
  assert.doesNotMatch(src, /Founder admin can adjust pricing/);
  const words = screenWords(block(">What credits cost</h2>"));
  assert.ok(words.includes("What you get"), "the words column is not headed What you get");
  assert.ok(words.some((w) => /^How many credits each piece of work uses/.test(w)), "the plain line under the heading is gone");
  for (const w of words) assert.doesNotMatch(w, INTERNAL, w);
});

test("the price list never prints the row's key: the description carries the meaning", () => {
  const prices = block(">What credits cost</h2>");
  assert.doesNotMatch(prices, />\s*\{p\.action_type\}\s*</, "the key is printed in a cell");
  assert.doesNotMatch(prices, /font-mono/, "a mono key column is back");
  assert.doesNotMatch(prices, /<th[^>]*>\s*Action\s*<\/th>/, "an Action key column is back");
  assert.match(prices, /\{p\.description \|\| '—'\}/, "the description is not printed");
  assert.match(prices, /\{p\.credits_per_call\}/, "the credits are not printed");
  // The data fetch is unchanged.
  assert.match(code, /getArgusPricing\(\{ baseUrl: ARION_API_BASE/);
});

test("the usage list prints what the work was, never the row's key", () => {
  const used = block(">Recent usage</h2>");
  assert.doesNotMatch(used, />\s*\{r\.action_type\}\s*</, "the key is printed in a cell");
  assert.doesNotMatch(used, /font-mono/, "a mono key column is back");
  assert.match(used, /pricing\.find\(\(p\) => p\.action_type === r\.action_type\)\?\.description \|\| 'Other work'/);
  assert.doesNotMatch(src, /No AI activity/);
  const words = screenWords(used);
  assert.ok(words.includes("What it was"), "the usage words column is not headed What it was");
  for (const w of words) assert.doesNotMatch(w, INTERNAL, w);
  assert.ok(code.includes("No credits used in the last {usageDays} days."), "the empty usage line is not in plain words");
});
