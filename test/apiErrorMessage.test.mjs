// The send-failure banner shows whatever this returns, so it is worth pinning.
//
// oliver-api answers a quote send with no recipient as
//   400 {"error":"no_recipient","message":"This customer has no email address…"}
// and lib/oliverApi throws that as `OLIVER API 400: {…json…}`. Pasting the
// thrown message straight into the UI puts raw JSON in front of a person at
// the exact moment they need to be told what to fix.
import { test } from "node:test";
import assert from "node:assert/strict";
import { apiErrorMessage } from "../src/lib/apiErrorMessage.ts";

test("pulls the message out of a JSON API error", () => {
  const thrown = new Error(
    'OLIVER API 400: {"error":"no_recipient","message":"This customer has no email address on file, so there is nothing to send the quote to."}',
  );
  assert.equal(
    apiErrorMessage(thrown),
    "This customer has no email address on file, so there is nothing to send the quote to.",
  );
});

test("falls back to the error code when there is no message", () => {
  assert.equal(apiErrorMessage(new Error('OLIVER API 422: {"error":"not_draft"}')), "not_draft");
});

test("a non-JSON body comes back as itself, not as empty", () => {
  assert.equal(apiErrorMessage(new Error("OLIVER API 502: Bad Gateway")), "Bad Gateway");
});

test("an empty body still says something", () => {
  assert.match(apiErrorMessage(new Error("OLIVER API 500: ")), /500/);
});

test("an unrelated error passes through untouched", () => {
  assert.equal(apiErrorMessage(new Error("Failed to fetch")), "Failed to fetch");
});

test("a non-Error never yields 'undefined' or '[object Object]'", () => {
  // The shape that makes a banner useless. String(null) is "null", which is no
  // better, so the guard is that we never produce those literals.
  for (const junk of [null, undefined, { a: 1 }]) {
    const out = apiErrorMessage(junk);
    assert.doesNotMatch(out, /^\[object Object\]$|^undefined$|^null$|^$/, `got "${out}" for ${JSON.stringify(junk)}`);
  }
  // The tier-gate shape lib/oliverApi actually throws: a plain object, no Error.
  assert.equal(
    apiErrorMessage({ type: "tier_gate", message: "Upgrade to Pro to send quotes." }),
    "Upgrade to Pro to send quotes.",
  );
});
