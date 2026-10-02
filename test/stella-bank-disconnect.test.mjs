// The Bank page can disconnect an account (Brandon, 2 Oct 2026: "if someone
// disconnects their account ... we need to make sure we remove their specific
// keys"). Source pins: asked twice in the row, calls the DELETE route, says
// what happened in plain words, and a failure never shows a code.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
const PAGE = read("src/pages/stella/StellaBankPage.tsx");
const WORDS = read("src/lib/plaidConnectError.ts");

test("Disconnect is asked twice in the row: the first press explains, the second does it", () => {
  assert.match(PAGE, /onClick=\{\(\) => \{ setNotice\(null\); setAskDisconnect\(it\.raw_plaid_item_id\); \}\}/);
  assert.match(PAGE, /askDisconnect === it\.raw_plaid_item_id && \(/);
  assert.match(PAGE, /New transactions stop coming in and we delete\s+our access to it\. Everything already in your books stays\./);
  assert.match(PAGE, /"Yes, disconnect"/);
  assert.match(PAGE, /Keep it connected/);
  assert.doesNotMatch(PAGE, /window\.confirm\(/);
});

test("the second press calls the DELETE route for that one account, then reloads", () => {
  const fn = PAGE.slice(PAGE.indexOf("const disconnect = useCallback("), PAGE.indexOf("const configured = !!status?.configured;"));
  assert.match(fn, /await del\(`\/ledger\/plaid\/items\/\$\{it\.raw_plaid_item_id\}`\);/);
  assert.match(fn, /await reload\(\);/);
  assert.match(fn, /is disconnected\. Nothing new will come in from it; your books keep everything already there\./);
});

test("a failed disconnect says it is still connected, in words, never a code", () => {
  assert.match(PAGE, /setActionError\(plaidErrorSentence\(e, "disconnect"\)\);/);
  assert.match(WORDS, /disconnect: "We couldn't reach the bank network to disconnect that account, so it is still connected — please try again in a few minutes\.",/);
  assert.match(WORDS, /export type PlaidAction = "connect" \| "finish" \| "sync" \| "disconnect";/);
});
