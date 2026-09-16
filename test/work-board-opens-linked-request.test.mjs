// Every agency email about a request links to
// /app/admin/consulting/requests?open=<id> (oliver-api lib/consultingNotify.js
// agencyRequestLink). "Approved by Rolling In It: Website Mockup — open it on
// your board" is only worth sending if the board actually opens that card.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const BOARD = readFileSync(path.join(SRC, "pages", "consulting", "ConsultingWorkBoardPage.tsx"), "utf8");
const APP = readFileSync(path.join(SRC, "App.tsx"), "utf8");

test("the board reads ?open and opens the matching card", () => {
  assert.match(BOARD, /searchParams\.get\("open"\)/);
  assert.match(BOARD, /setOpenRow\(hit\)/);
});

test("the param is dropped once used, so closing the card doesn't reopen it", () => {
  assert.match(BOARD, /next\.delete\("open"\)/);
});

test("a request hidden by the open-only filter is still found", () => {
  assert.match(BOARD, /if \(!hit && openOnly\) \{ setOpenOnly\(false\); return; \}/);
});

test("the route the emails link to exists", () => {
  assert.match(APP, /path="admin\/consulting"/);
  assert.match(APP, /path="requests"/);
});
