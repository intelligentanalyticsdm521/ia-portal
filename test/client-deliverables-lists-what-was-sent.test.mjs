// The client's Deliverables page lists what was SENT to them, not only what was
// approved.
//
// Rolling In It had approved two documents and read "No approved deliverables
// yet." — the page bucketed rows by approved status and the API filtered to
// approved rows. These pin the replacement: one list from the client library
// endpoint, a download that goes through the authenticated API (the blob
// container is private), the date it was sent, and its history.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const PAGE = readFileSync(path.join(SRC, "pages", "consulting", "ClientConsultingDeliverablesPage.tsx"), "utf8");

test("reads the client library endpoint", () => {
  assert.match(PAGE, /get<[^>]*>\(\s*"\/consulting-deliverables"\s*\)/);
});

test("downloads through the API, never a raw blob link", () => {
  assert.doesNotMatch(PAGE, /href=\{[^}]*file_url/);
  assert.match(PAGE, /download\(\s*d\.download_path/);
});

test("each row shows the date it was sent and can show its history", () => {
  assert.match(PAGE, /Sent \{fmtDate\(d\.sent_at\)\}/);
  assert.match(PAGE, /d\.history\.map\(/);
});

test("the approval-only empty state is gone", () => {
  assert.doesNotMatch(PAGE, /No approved deliverables yet/);
});
