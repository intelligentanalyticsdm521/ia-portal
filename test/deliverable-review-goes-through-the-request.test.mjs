// A client's Approve on a document must reach the table the document lives in.
//
// Found 2026-09-15 on Rolling In It. The shared review panel's default Approve
// posted to POST /consulting/deliverables/:id/approve, which wrote
// oliver.deliverable — a different table from the consulting.deliverable row the
// client was looking at — so it could never succeed. And a document on a task
// has to be approved by approving the task, or the task sits waiting and the
// agency is never told.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const read = (...p) => readFileSync(path.join(SRC, ...p), "utf8");
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const PANEL = stripComments(read("components", "consulting", "DeliverableActionPanel.tsx"));

test("the panel never posts approve or revision to the old wrong-table routes", () => {
  assert.doesNotMatch(PANEL, /post\(\s*`\/consulting\/deliverables\/\$\{[^}]+\}\/(approve|revision)`/);
});

test("a document on a request is approved and sent back through the request", () => {
  assert.match(
    PANEL,
    /patch\(\s*`\/consulting\/requests\/\$\{deliverable\.service_request_id\}`,\s*\{\s*action:\s*"approve"\s*\}/,
  );
  assert.match(PANEL, /action:\s*"request_revision"/);
});

test("a milestone or standalone document uses the consulting.deliverable routes", () => {
  assert.match(PANEL, /patch\(\s*`\/consulting\/deliverables\/\$\{deliverable\.deliverable_id\}\/approve`/);
  assert.match(PANEL, /patch\(\s*`\/consulting\/deliverables\/\$\{deliverable\.deliverable_id\}\/request-revisions`/);
});

test("a document the client was sent never reads as 'not yet sent'", () => {
  assert.match(PANEL, /case "sent_to_client":\s*case "sent":\s*return "sent";/);
});

// The panel can only route correctly if its host tells it which kind of
// document it is holding.
test("every host passes service_request_id into the panel", () => {
  const hosts = [
    ["components", "consulting", "ConsultingProjectModal.tsx"],
    ["components", "consulting", "ClientConsultingProjectModal.tsx"],
    ["pages", "consulting", "ClientConsultingDeliverablesPage.tsx"],
  ];
  for (const parts of hosts) {
    const src = stripComments(read(...parts));
    const name = parts[parts.length - 1];
    const at = src.indexOf("<DeliverableActionPanel");
    assert.notEqual(at, -1, `${name} mounts the panel`);
    const mount = src.slice(at, src.indexOf("/>", at));
    let shape = mount;
    const byName = mount.match(/deliverable=\{([A-Za-z]+)\}/);
    if (byName) {
      const decl = src.indexOf(`const ${byName[1]}`);
      assert.notEqual(decl, -1, `${name}: ${byName[1]} is declared`);
      shape = src.slice(decl, src.indexOf("};", decl));
    }
    assert.match(shape, /service_request_id:/, `${name} must pass service_request_id to the panel`);
  }
});
