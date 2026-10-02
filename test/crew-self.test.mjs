// test/crew-self.test.mjs — "Add yourself as a crew member" on the OLIVER Team
// page (on-site flow v1, Phase A, 1 Oct 2026).
//
// Brandon, 1 Oct: "On-site jobs the owner operator would login to the crew
// portal and work from there. The admin or regular portal is for their
// administrative work." The crew app only lets in people on the crew list, so
// the owner needs one button that puts them on it. Contract:
//
//   POST /workers/me (oliver-api routes/workers.js, business admins) →
//   { data: { worker_id, created: true|false } }  (unwrapped by useOliverApi)
//   toast: "You're on the crew list. Sign in to the crew app with {email}."
//          or "You were already on the crew list."
//
// What is tested: the words for each answer; that an answer missing
// `created` is NOT read as success; a failure is a sentence and never a bare
// code; and source pins for the button and its wiring on the page.
//
// Run:  npm test   (node --import ./scripts/test-ts-loader.mjs --test test)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as lib from "../src/lib/crewSelf.ts";

const page = fs.readFileSync(new URL("../src/pages/oliver/OliverWorkersPage.tsx", import.meta.url), "utf8");
const ID = "5C1B4E0A-2F0E-4F7B-9C3A-7A1D2B3C4D5E";

test("created → on the list, and the email to sign in to the crew app with", () => {
  assert.deepEqual(lib.addSelfNote({ worker_id: ID, created: true }, "marcus@example.com"), {
    ok: true, text: "You're on the crew list. Sign in to the crew app with marcus@example.com.",
  });
});

test("created, email not found → still a whole sentence, no 'null'", () => {
  const n = lib.addSelfNote({ worker_id: ID, created: true }, null);
  assert.equal(n.ok, true);
  assert.equal(n.text, "You're on the crew list. Sign in to the crew app with the email you use here.");
  assert.ok(!/null|undefined/.test(n.text));
});

test("already there → said plainly", () => {
  assert.deepEqual(lib.addSelfNote({ worker_id: ID, created: false }, "marcus@example.com"), {
    ok: true, text: "You were already on the crew list.",
  });
});

test("an answer without `created` or `worker_id` is not success (presence, not absence)", () => {
  // Mutation: returning ok:true when `created` is missing fails this test.
  for (const bad of [null, undefined, {}, { worker_id: ID }, { created: true }, { worker_id: ID, created: "yes" }]) {
    const n = lib.addSelfNote(bad, "x@example.com");
    assert.equal(n.ok, false, JSON.stringify(bad));
    assert.match(n.text, /could not tell/);
  }
});

test("a failure carries the API's sentence; a bare code becomes a plain sentence", () => {
  const withSentence = new Error('OLIVER API 403: {"error":"Only an admin of this business can do that."}');
  assert.deepEqual(lib.addSelfFailureNote(withSentence), {
    ok: false, text: "You were not added to the crew list: Only an admin of this business can do that.",
  });
  const withCode = new Error('OLIVER API 403: {"error":"forbidden"}');
  const n = lib.addSelfFailureNote(withCode);
  assert.equal(n.ok, false);
  assert.equal(n.text, "You were not added to the crew list. Please try again.");
  assert.ok(!/forbidden|\{/.test(n.text));
});

test("worker ids compare whatever case SQL Server returned", () => {
  assert.equal(lib.sameWorkerId(ID, ID.toLowerCase()), true);
  assert.equal(lib.sameWorkerId(ID, null), false);
  assert.equal(lib.sameWorkerId("", ""), false);
});

test("page: a secondary 'Add yourself as a crew member' button beside + Add worker", () => {
  assert.match(page, /<Button variant="secondary" onClick=\{\(\) => void addYourself\(\)\} disabled=\{addingSelf\}/);
  assert.match(page, /"Add yourself as a crew member"/);
  // Both live in the header's actions.
  const header = page.slice(page.indexOf("<PageHeader"), page.indexOf("/>", page.indexOf("+ Add worker</Button>")));
  assert.match(header, /Add yourself as a crew member/);
  assert.match(header, /\+ Add worker/);
});

test("page: POSTs /workers/me, reads the email back, shows the note, reloads the list", () => {
  assert.match(page, /post<AddSelfResult>\("\/workers\/me", \{\}\)/);
  assert.match(page, /sameWorkerId\(w\.id, r\.worker_id\)/);
  assert.match(page, /setInviteNote\(addSelfNote\(r, email\)\)/);
  assert.match(page, /setInviteNote\(addSelfFailureNote\(e\)\)/);
  const fn = page.slice(page.indexOf("async function addYourself"), page.indexOf("const loc = useOliverLocations"));
  assert.match(fn, /await reload\(\)/);
  // The note is the page's existing notice, which shows success and failure differently.
  assert.match(page, /data-testid="crew-invite-note"/);
});
