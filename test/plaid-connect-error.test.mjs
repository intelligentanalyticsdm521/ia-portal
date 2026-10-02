// Connect a bank or card — when it fails, one plain sentence, never the code.
//
// 2 Oct 2026: Brandon pressed "Connect a bank or card" on Settings → Bank and
// card accounts and the page printed the bare text INVALID_LINK_CUSTOMIZATION.
// lib/plaidConnectError.ts is the rule; StellaBankPage asks it for every
// connect / finish / sync failure.
//
// MUTATION CHECKS (each broken on purpose, seen red, restored):
//   · plaidErrorSentence — drop the PLAID_NEEDS_SETUP_CODES test
//        → "INVALID_LINK_CUSTOMIZATION says a setting on our side …" RED
//   · StellaBankPage — startConnect back to setActionError(e.message)
//        → "the Bank page never prints an error's own message" RED
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  PLAID_NEEDS_SETUP_CODES, PLAID_SENTENCES, plaidErrorCode, plaidErrorSentence, plaidItemProblem, plaidItemNeedsAttention,
} from "../src/lib/plaidConnectError.ts";
import { apiBodySentence } from "../src/lib/apiErrorMessage.ts";

/** What lib/stellaApi throws (stellaError): the sentence as message, the parsed answer on body. */
function apiError(status, body) {
  const text = JSON.stringify(body);
  const err = new Error(apiBodySentence(body) || text);
  err.status = status;
  err.body = body;
  err.raw = `STELLA API ${status}: ${text}`;
  return err;
}

const CODE = "INVALID_LINK_CUSTOMIZATION";

describe("plaidErrorSentence — the words for a failed connect", () => {
  test("INVALID_LINK_CUSTOMIZATION says a setting on our side and the way in meanwhile — and no code", () => {
    // Today's API: { error: <code> } only — the message IS the code.
    const old = apiError(500, { error: CODE });
    assert.equal(old.message, CODE, "this is exactly what reached the screen");
    const s = plaidErrorSentence(old, "connect");
    assert.equal(s, PLAID_SENTENCES.needsSetup);
    assert.match(s, /one setting on our side isn't finished/);
    assert.match(s, /Import a bank statement under Accounting/);
    // 2 Oct 2026 review: nobody is told (one server log line, no alert), and
    // for the account holder "nothing you need to do" is wrong.
    assert.doesNotMatch(s, /been told|notified|nothing you need to do/i);
    assert.ok(!s.includes(CODE));
    // The API after this change also carries a plain message; the code still decides.
    const withMessage = apiError(500, { error: CODE, message: "The bank connection needs one setting finished on our side." });
    assert.equal(plaidErrorSentence(withMessage, "connect"), PLAID_SENTENCES.needsSetup);
    assert.deepEqual([...PLAID_NEEDS_SETUP_CODES], [CODE]);
  });

  test("anything else: it could not start — please try again", () => {
    for (const e of [
      apiError(500, { error: "INTERNAL_SERVER_ERROR" }),
      apiError(500, { error: "connect ECONNREFUSED 10.0.0.4:443" }),
      new Error("Failed to fetch"),
      "nonsense",
      null,
    ]) {
      const s = plaidErrorSentence(e, "connect");
      assert.equal(s, PLAID_SENTENCES.connect);
      assert.match(s, /couldn't start — please try again\.$/);
    }
  });

  test("finishing and syncing get their own plain sentence", () => {
    assert.equal(plaidErrorSentence(apiError(500, { error: "INVALID_PUBLIC_TOKEN" }), "finish"), PLAID_SENTENCES.finish);
    assert.equal(plaidErrorSentence(apiError(500, { error: "ITEM_LOGIN_REQUIRED" }), "sync"), PLAID_SENTENCES.sync);
  });

  test("bank connections not switched on here point at the statement import", () => {
    const s = plaidErrorSentence(apiError(503, { error: "plaid_not_configured" }), "connect");
    assert.equal(s, PLAID_SENTENCES.notSwitchedOn);
    assert.doesNotMatch(s, /plaid|keys|sandbox/i);
  });

  test("the code is read from the answer, or from a message that is only a code", () => {
    assert.equal(plaidErrorCode(apiError(500, { error: CODE })), CODE);
    assert.equal(plaidErrorCode(new Error(CODE)), CODE);
    assert.equal(plaidErrorCode(new Error("Something went wrong")), null);
    assert.equal(plaidErrorCode(undefined), null);
  });

  test("no sentence carries a code, a vendor name or the word tenant", () => {
    for (const s of Object.values(PLAID_SENTENCES)) {
      assert.doesNotMatch(s, /[A-Z]{3,}_[A-Z]|plaid|tenant/i, s);
      assert.match(s, /[.]$/);
    }
  });

  test("a connected account's problem is words, not its error_code", () => {
    assert.equal(plaidItemProblem("ITEM_LOGIN_REQUIRED"), "Connection needs attention");
    assert.equal(plaidItemProblem(null), null);
    assert.equal(plaidItemProblem(""), null);
  });

  test("a failed sync with no Plaid code still needs attention — the row's status says so", () => {
    // oliver-api lib/plaidSync.js: a failure sets status 'login_required' or
    // 'error'; a non-Plaid failure leaves error_code NULL.
    assert.equal(plaidItemProblem(null, "error"), "Connection needs attention");
    assert.equal(plaidItemProblem(null, "login_required"), "Connection needs attention");
    assert.equal(plaidItemProblem(null, "active"), null);
    assert.equal(plaidItemNeedsAttention({ status: "ERROR", error_code: null }), true);
    assert.equal(plaidItemNeedsAttention({ status: "active", error_code: "ITEM_LOGIN_REQUIRED" }), true);
    assert.equal(plaidItemNeedsAttention({ status: "active", error_code: null }), false);
    assert.equal(plaidItemNeedsAttention(null), false);
  });
});

describe("StellaBankPage — wiring a typecheck cannot see", () => {
  const page = readFileSync(path.join(process.cwd(), "src/pages/stella/StellaBankPage.tsx"), "utf8").replace(/\r\n/g, "\n");

  test("connect, finish and sync failures all ask plaidErrorSentence", () => {
    assert.match(page, /setActionError\(plaidErrorSentence\(e, "connect"\)\)/);
    assert.match(page, /setActionError\(plaidErrorSentence\(e, "finish"\)\)/);
    assert.match(page, /setActionError\(plaidErrorSentence\(e, "sync"\)\)/);
  });

  test("the Bank page never prints an error's own message", () => {
    assert.doesNotMatch(page, /friendlyPlaidError/);
    assert.doesNotMatch(page, /setActionError\([^)]*\.message/);
    assert.doesNotMatch(page, /onExit\(`[^`]*\$\{error\.message\}/);
    // The connected-account pill shows words, not the raw error_code — and
    // reads the row's status too, so a failed sync with no code still shows.
    assert.doesNotMatch(page, />\{it\.error_code\}</);
    assert.match(page, /plaidItemProblem\(it\.error_code, it\.status\)/);
  });

  test("a page that cannot load says one plain line, never the server's own text", () => {
    // 2 Oct 2026 review: the status/items 500s answered { error: err.message }
    // and StellaShell printed it.
    assert.match(page, /setError\(new Error\(PLAID_SENTENCES\.loadFailed\)\)/);
    assert.doesNotMatch(page, /setError\(e\)/);
  });
});
