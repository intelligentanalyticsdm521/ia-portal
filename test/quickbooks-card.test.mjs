// OLIVER Business Setup → the QuickBooks card (Ops O-5 step a).
//
// The card's job is to be honest about four states that a lazier card would
// render as two:
//
//   not available yet — Intelligent Analytics has not registered its Intuit app
//                       (T-INTUIT). NOBODY can connect. A Connect button here
//                       dead-ends on an Intuit error page, and the owner
//                       reasonably concludes their QuickBooks is broken.
//   not connected     — the app exists; this business has not connected.
//   connected         — it is working.
//   needs reconnect   — there IS a connection and it stopped working. The
//                       calendar card paid for this one: a green tick over a
//                       dead connection is worse than an error.
//
// Plus the fifth thing, orthogonal to all four: a working connection can still
// have an invoice QuickBooks refused, and that has to be visible, named and
// retryable rather than folded into "Connected".
//
// MUTATION-TESTED 2026-09-06 (each break made, the named test failed, reverted):
//   * cardState returns "not_connected" when configured is false
//       -> "before the Intuit app exists, nobody is offered a button" fails
//   * cardState ignores status === 'needs_reconnect'
//       -> "a connection that stopped working is amber, never a green tick" fails
//   * lastSyncLine returns "" when last_sync_at is null
//       -> "a connection that has never synced says so" fails
//   * remove the imported-history line from DOES_NOT_PUSH
//       -> "the card says out loud that imported history is never sent" fails
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  cardState, stateLabel, stateDetail, lastSyncLine, attentionLine,
  attentionItemLabel, environmentNote, errorCodeOf, errorMessageOf,
  PUSHES, DOES_NOT_PUSH, NOT_CONFIGURED_FALLBACK,
} from "../src/lib/quickbooksConnection.ts";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const CARD = readFileSync(path.join(SRC, "pages", "oliver", "QuickBooksCard.tsx"), "utf8");
const SETTINGS = readFileSync(path.join(SRC, "pages", "oliver", "OliverSettingsPage.tsx"), "utf8");
const LIB = readFileSync(path.join(SRC, "lib", "quickbooksConnection.ts"), "utf8");

const CONNECTED = {
  configured: true, not_configured_reason: null, not_configured_code: null,
  environment: "production", connected: true, status: "connected",
  realm_id: "9341454800000000", connected_at: "2026-09-06T08:00:00Z",
  last_sync_at: "2026-09-06T09:14:00Z", last_error: null, needs_attention: 0,
};

/* ── the four states ──────────────────────────────────────────────────────── */

test("before the Intuit app exists, nobody is offered a button", () => {
  const s = {
    ...CONNECTED, configured: false, connected: false, status: null,
    not_configured_reason: "QuickBooks is not set up yet — this needs a one-time Intuit app registration",
    not_configured_code: "intuit_client_not_configured",
  };
  assert.equal(cardState(s), "not_configured");
  assert.equal(stateLabel(cardState(s)), "Not available yet");
  assert.match(stateDetail(s), /one-time Intuit app registration/);
});

test("a missing reason falls back to the same sentence rather than to silence", () => {
  const s = { ...CONNECTED, configured: false, connected: false, status: null, not_configured_reason: null };
  assert.equal(stateDetail(s), NOT_CONFIGURED_FALLBACK);
});

test("'not set up yet' and 'not connected' are different states with different words", () => {
  const notConfigured = { ...CONNECTED, configured: false, connected: false, status: null };
  const notConnected = { ...CONNECTED, configured: true, connected: false, status: null };
  assert.notEqual(cardState(notConfigured), cardState(notConnected));
  assert.equal(stateLabel(cardState(notConnected)), "Not connected");
  assert.equal(stateDetail(notConnected), null, "nothing extra to say — the standing explainer covers it");
});

test("a connection that stopped working is amber, never a green tick", () => {
  const s = { ...CONNECTED, status: "needs_reconnect", last_error: "The QuickBooks connection expired." };
  assert.equal(cardState(s), "needs_reconnect");
  assert.equal(stateLabel(cardState(s)), "Needs reconnect");
  assert.equal(stateDetail(s), "The QuickBooks connection expired.");
});

test("a needs_reconnect with no stored reason still says something actionable", () => {
  const s = { ...CONNECTED, status: "needs_reconnect", last_error: null };
  assert.match(stateDetail(s), /Connect QuickBooks/);
});

test("a live connection outranks a configured flag that flapped", () => {
  const s = { ...CONNECTED, configured: false };
  assert.equal(cardState(s), "connected",
    "a config flag going false must never hide a business's working connection");
});

test("no status at all reads as 'not connected', not as an error", () => {
  assert.equal(cardState(null), "not_connected");
  assert.equal(stateDetail(null), null);
});

/* ── last sync ────────────────────────────────────────────────────────────── */

test("a connection that has never synced says so", () => {
  assert.equal(lastSyncLine({ ...CONNECTED, last_sync_at: null }), "Nothing has synced yet.",
    "a card silent about when it last ran lets an owner assume it ran a minute ago");
  assert.equal(lastSyncLine({ ...CONNECTED, last_sync_at: "not a date" }), "Nothing has synced yet.");
});

test("a synced connection prints a real timestamp", () => {
  assert.match(lastSyncLine(CONNECTED), /^Last synced /);
});

test("a business that has not connected gets no sync line at all", () => {
  assert.equal(lastSyncLine({ ...CONNECTED, connected: false }), "");
});

/* ── sandbox ──────────────────────────────────────────────────────────────── */

test("a sandbox connection says it is a sandbox", () => {
  assert.match(environmentNote({ ...CONNECTED, environment: "sandbox" }), /sandbox/i);
  assert.equal(environmentNote(CONNECTED), null, "production needs no caveat");
  assert.equal(environmentNote({ ...CONNECTED, connected: false }), null);
});

/* ── needs attention ──────────────────────────────────────────────────────── */

test("the attention line counts in English", () => {
  assert.equal(attentionLine(0), null);
  assert.equal(attentionLine(1), "1 thing did not reach QuickBooks.");
  assert.equal(attentionLine(4), "4 things did not reach QuickBooks.");
});

test("an item is named by its invoice number, never by a bare id", () => {
  assert.equal(
    attentionItemLabel({ queue_id: 1, entity: "invoice", local_id: "abc-123", label: "1042", reason: "x", attempts: 1, since: null, next_attempt_at: null }),
    "Invoice 1042",
  );
  assert.equal(
    attentionItemLabel({ queue_id: 2, entity: "customer", local_id: "abc-123", label: null, reason: "x", attempts: 1, since: null, next_attempt_at: null }),
    "Customer",
    "an id tells the owner nothing about which one it is — the kind alone is better",
  );
});

/* ── what gets pushed ─────────────────────────────────────────────────────── */

test("the card says out loud that imported history is never sent", () => {
  const joined = DOES_NOT_PUSH.join(" ");
  assert.match(joined, /imported from your previous system/i);
  assert.match(joined, /count your revenue twice/i,
    "the WHY is the half that stops an owner asking us to turn it on");
});

test("the card says out loud that nothing comes back the other way", () => {
  assert.match(DOES_NOT_PUSH.join(" "), /only ever goes one way/i);
});

test("what IS sent is the three objects and nothing more", () => {
  const joined = PUSHES.join(" ").toLowerCase();
  for (const word of ["customers", "invoices", "payments"]) assert.match(joined, new RegExp(word));
  assert.equal(PUSHES.length, 3);
});

/* ── errors from the API ──────────────────────────────────────────────────── */

test("the API's own code and sentence survive the trip", () => {
  const err = new Error('OLIVER API 503: {"error":"intuit_client_not_configured","code":"intuit_client_not_configured","message":"QuickBooks is not set up yet — this needs a one-time Intuit app registration"}');
  assert.equal(errorCodeOf(err), "intuit_client_not_configured");
  assert.match(errorMessageOf(err, "fallback"), /one-time Intuit app registration/);
});

test("an error with no JSON body still yields something to show", () => {
  assert.equal(errorCodeOf(new Error("Network request failed")), null);
  assert.equal(errorMessageOf(new Error("Network request failed"), "fallback"), "Network request failed");
  assert.equal(errorMessageOf(null, "fallback"), "fallback");
});

/* ── the component, and where it lives ────────────────────────────────────── */

test("the card is on Business Setup, next to the other money plumbing", () => {
  assert.match(SETTINGS, /<QuickBooksCard api=\{accountingApi\} \/>/);
  assert.match(SETTINGS, /const accountingApi = useMemo\(/,
    "a fresh object literal every render re-fires the card's load effect on every keystroke");
});

test("the card never says 'tenant' to a business owner", () => {
  // Comments are stripped first: the rule is about what an owner READS, and a
  // comment explaining why the word is banned would otherwise trip it.
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const copy = strip(CARD) + strip(LIB);
  assert.doesNotMatch(copy, /\btenants?\b/i);
  assert.match(copy, /\byour\b/i, "the copy speaks to the owner directly, in their words");
});

test("Connect is disabled, not hidden, before the Intuit app exists", () => {
  // Hiding it would leave an owner who was told "connect QuickBooks" looking
  // for a button that is not there. Disabled + the reason is the honest shape.
  assert.match(CARD, /state === "not_configured"[\s\S]{0,900}<Button variant="secondary" disabled>Connect QuickBooks<\/Button>/);
});

test("disconnect asks first, and says what it does NOT do", () => {
  assert.match(CARD, /window\.confirm\(/);
  assert.match(CARD, /Nothing already in QuickBooks is removed/);
});

test("every failed item gets its own Try again", () => {
  assert.match(CARD, /needs-attention\/\$\{item\.queue_id\}\/retry/);
  assert.match(CARD, /Try again/);
});

test("the OAuth outcome is read once and stripped from the URL", () => {
  assert.match(CARD, /params\.get\("qbo"\)/);
  assert.match(CARD, /window\.history\.replaceState/,
    "a refresh must not replay a stale 'connected' or a stale error");
});

test("the card reads status and never writes anything on load", () => {
  const loadBlock = CARD.slice(CARD.indexOf("const reload"), CARD.indexOf("useEffect(() => { void reload(); }"));
  assert.doesNotMatch(loadBlock, /\bpost</);
  assert.doesNotMatch(loadBlock, /\bdel</);
});
