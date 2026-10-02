// Several people on a consulting project, and recipients picked per document.
//
// Brandon, 2026-10-01: "default projects to their main contact but also allow
// me to update it to work with multiple users, or even just deselect their
// main contact and add another user. Some business I'll work projects with the
// owner, some with their office manager, maybe some with a web designer."
// Scope §5: every send picks its own recipients — the project's people are the
// list and the default; the sender decides; the document records who it went to.
//
// What has to stay true:
//   • the People section (project modal → Overview) draws one row per person:
//     name, email, the four roles in Brandon's words, ONE Primary, Receives
//     documents, remove; "No primary person — pick one" when there is none
//   • "Who gets this?" pre-ticks whoever the API marks `default`, and only them
//   • the proposal builder's Send carries `recipients` when the proposal
//     belongs to a project, and the "Pick a customer" refusal does not fire then
//   • the Deliverables tab says "Visible to the client · sent … to …" or
//     "Not visible to the client yet"
//
// The rules are pure (src/lib/projectPeople.ts) and imported directly; the two
// components are RENDERED (esbuild bundles them with the API hook stubbed,
// react-dom/server draws them); the builder and the modal are pinned on source.
//
// MUTATION CHECKS (each broken on purpose, seen red, restored, 2026-10-01):
//   · defaultTicked — drop the `p.default &&` test          → "pre-ticks whoever the API marks default" RED
//   · ProjectPeopleSection — remove the primary_missing line → "No primary person — pick one" RED
//   · ProposalBuilder — send without `{ recipients }`        → "the builder's Send carries recipients" RED
//   · deliverableVisibility — ignore client_visible          → "Not visible to the client yet" RED
//
// Run:  node --import ./scripts/test-ts-loader.mjs --test test/consulting-project-people.test.mjs
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as lib from "../src/lib/projectPeople.ts";

const ROOT = new URL("../", import.meta.url);
const read = (p) => fs.readFileSync(new URL(`src/${p}`, ROOT), "utf8").replace(/\r\n/g, "\n");
const esbuild = createRequire(new URL("package.json", ROOT))("esbuild");

// The section reads through useOliverApi (MSAL, import.meta.env); a render
// needs none of that, so the hook is stubbed.
const stubApi = {
  name: "stub-oliver-api",
  setup(b) {
    b.onResolve({ filter: /hooks\/useOliverApi$/ }, () => ({ path: "useOliverApi", namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
      contents: "const f = async () => ({}); export function useOliverApi() { return { get: f, post: f, patch: f, del: f, ready: false }; }",
      loader: "js",
    }));
  },
};
const built = await esbuild.build({
  stdin: {
    contents: `
      import { createElement } from "react";
      import { renderToStaticMarkup } from "react-dom/server.browser";
      export { ProjectPeopleSection } from "./src/components/consulting/ProjectPeopleSection.tsx";
      export { RecipientPickerDialog } from "./src/components/consulting/RecipientPickerDialog.tsx";
      export const render = (C, props) => renderToStaticMarkup(createElement(C, props));
    `,
    resolveDir: fileURLToPath(ROOT), loader: "tsx", sourcefile: "entry.tsx",
  },
  bundle: true, format: "esm", platform: "browser", jsx: "automatic", write: false, logLevel: "silent",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [stubApi],
});
const ui = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text, "utf8").toString("base64")}`);

// Dev-safe fixture people (never a real client's name or address).
const OWNER = {
  project_person_id: "p-owner", person_kind: "contact", lumen_contact_id: 11, user_id: null,
  contact_uuid: "uuid-owner", role: "main", is_primary: 1, receives_documents: 1,
  display_name: "Dana Owner", email: "dana@harbor.example", company: "Harbor Point Coffee",
};
const MANAGER = {
  project_person_id: "p-mgr", person_kind: "contact", lumen_contact_id: 12, user_id: null,
  contact_uuid: "uuid-mgr", role: "approver", is_primary: 0, receives_documents: 0,
  display_name: "Morgan Manager", email: "morgan@harbor.example", company: "Harbor Point Coffee",
};
const DESIGNER = {
  project_person_id: "p-web", person_kind: "user", lumen_contact_id: null, user_id: "u-web",
  contact_uuid: null, role: "collaborator", is_primary: false, receives_documents: true,
  display_name: null, email: "webby@harbor.example", company: null,
};
const now = new Date();
const thisYear = now.getFullYear();
const iso = (m, d) => new Date(Date.UTC(thisYear, m - 1, d, 15, 0, 0)).toISOString();

/* ── The rules ──────────────────────────────────────────────────────────── */

describe("the words and the names", () => {
  test("the four roles, in Brandon's words", () => {
    assert.deepEqual(lib.ROLE_OPTIONS.map((r) => r.label), ["Main contact", "Approver", "Billing", "Collaborator"]);
    assert.deepEqual(lib.ROLE_OPTIONS.map((r) => r.value), ["main", "approver", "billing", "collaborator"]);
  });

  test("personLabel: the name, else the email's local part (portal users with no names)", () => {
    assert.equal(lib.personLabel(OWNER), "Dana Owner");
    assert.equal(lib.personLabel(DESIGNER), "webby");
    assert.equal(lib.personLabel({ display_name: "  ", email: "" }), "Unnamed person");
  });

  test("splitName prefills Invite as contact from the name, or the email's local part", () => {
    assert.deepEqual(lib.splitName({ display_name: "Morgan Q Manager" }), { first_name: "Morgan", last_name: "Q Manager" });
    assert.deepEqual(lib.splitName(DESIGNER), { first_name: "webby", last_name: "" });
  });
});

describe("who a document goes to", () => {
  test("pre-ticks whoever the API marks default (and can be emailed), and only them", () => {
    const people = [
      { ...OWNER, default: false, can_email: true },
      { ...MANAGER, default: true, can_email: true },
      { ...DESIGNER, default: true, can_email: false },
    ];
    assert.deepEqual([...lib.defaultTicked(people)], ["p-mgr"]);
  });

  test("recipients: defaults first (the first becomes the proposal's contact), then the others, then people not yet on the project", () => {
    const people = [
      { ...OWNER, default: false, can_email: true },
      { ...MANAGER, default: true, can_email: true },
    ];
    const available = {
      contacts: [{ lumen_contact_id: 31, display_name: "Pat Partner", email: "pat@x.example" }],
      users: [{ user_id: "u-9", display_name: null, email: "nine@x.example" }],
    };
    const ticked = new Set(["p-owner", "p-mgr", "c:31", "u:u-9"]);
    assert.deepEqual(lib.recipientsFrom(ticked, people, available), [
      { project_person_id: "p-mgr" },
      { project_person_id: "p-owner" },
      { person_kind: "contact", lumen_contact_id: 31 },
      { person_kind: "user", user_id: "u-9" },
    ]);
    assert.deepEqual(lib.recipientsFrom(new Set(["p-owner"]), people, available), [{ project_person_id: "p-owner" }],
      "only one person, when the default would have been someone else");
  });

  test("names read as a sentence", () => {
    assert.equal(lib.namesList(["A"]), "A");
    assert.equal(lib.namesList(["A", "B"]), "A and B");
    assert.equal(lib.namesList(["A", "B", "C"]), "A, B and C");
  });

  test("the builder's header line names the latest send only, with addresses and the date", () => {
    const rows = [
      { send_id: "s2", display_name: "Morgan Manager", email: "morgan@harbor.example", sent_at: iso(10, 2) },
      { send_id: "s1", display_name: "Dana Owner", email: "dana@harbor.example", sent_at: iso(9, 30) },
    ];
    assert.equal(lib.sentToLine(rows, now), "Sent to Morgan Manager (morgan@harbor.example) on 2 Oct");
    assert.equal(lib.sentToLine([], now), "");
  });

  test("the saved message lists the names, and says who was not emailed", () => {
    assert.equal(
      lib.sentMessage([{ display_name: "Dana Owner", email_status: "queued" }, { display_name: "Morgan Manager", email_status: "queued" }]),
      "Sent to Dana Owner and Morgan Manager.",
    );
    assert.match(lib.sentMessage([{ display_name: "Dana Owner", email_status: "suppressed" }]), /Not emailed: Dana Owner \(suppressed\)/);
  });
});

describe("the Deliverables tab: can the client see it?", () => {
  test("Not visible to the client yet — a draft that was never sent", () => {
    assert.equal(lib.deliverableVisibility({ status: "pending", sent_at: null, client_visible: false }, now), "Not visible to the client yet");
    assert.equal(lib.deliverableVisibility({ status: "pending", sent_at: null }, now), "Not visible to the client yet");
    assert.equal(lib.deliverableVisibility({ status: "awaiting_client_review", sent_at: iso(10, 1), client_visible: 0 }, now),
      "Not visible to the client yet", "client_visible from the API wins over the status");
  });

  test("Visible to the client · sent 1 Oct to … — from the recipient record", () => {
    assert.equal(
      lib.deliverableVisibility({
        status: "awaiting_client_review", client_visible: true,
        sent_to: [
          { send_id: "s", display_name: "Dana Owner", email: "dana@harbor.example", sent_at: iso(10, 1) },
          { send_id: "s", display_name: null, email: "webby@harbor.example", sent_at: iso(10, 1) },
        ],
      }, now),
      "Visible to the client · sent 1 Oct to Dana Owner and webby",
    );
    assert.equal(
      lib.deliverableVisibility({ status: "sent", client_visible: 1, sent_to: { names: "Dana Owner, Morgan Manager", sent_at: iso(10, 1) } }, now),
      "Visible to the client · sent 1 Oct to Dana Owner, Morgan Manager",
    );
    assert.equal(lib.deliverableVisibility({ status: "sent", sent_at: iso(10, 1) }, now), "Visible to the client · sent 1 Oct",
      "a send from before recipients were recorded still says when");
  });
});

/* ── The People section, drawn ──────────────────────────────────────────── */

describe("ProjectPeopleSection (rendered)", () => {
  const html = ui.render(ui.ProjectPeopleSection, {
    projectId: "0C222222-0000-4000-8000-000000000001",
    viewerRole: "founder",
    initial: { people: [OWNER, MANAGER, DESIGNER], primary_missing: false },
  });

  test("a row per person: name, email, company chip", () => {
    assert.equal((html.match(/data-person="/g) || []).length, 3);
    assert.match(html, /Dana Owner/);
    assert.match(html, /dana@harbor\.example/);
    assert.match(html, /Harbor Point Coffee/);
    assert.match(html, /webby@harbor\.example/);
    assert.match(html, />People</);
    assert.match(html, /Add person/);
  });

  test("the role select carries the four roles, and each row's own role is chosen", () => {
    for (const w of ["Main contact", "Approver", "Billing", "Collaborator"]) assert.match(html, new RegExp(`>${w}</option>`));
    assert.match(html, /<option value="main" selected="">Main contact<\/option>/);
    assert.match(html, /<option value="approver" selected="">Approver<\/option>/);
  });

  test("ONE Primary: the primary shows a filled star and the word Primary; the others offer Make primary", () => {
    assert.equal((html.match(/data-primary="1"/g) || []).length, 1);
    assert.equal((html.match(/data-primary="0"/g) || []).length, 2);
    assert.match(html, />Primary</);
    assert.equal((html.match(/Make primary/g) || []).length, 2);
  });

  test("Receives documents follows the row; a portal user offers Invite as contact", () => {
    const boxes = [...html.matchAll(/<input type="checkbox"([^>]*)\/?>/g)].map((m) => /checked=""/.test(m[1]));
    assert.deepEqual(boxes, [true, false, true]);
    assert.equal((html.match(/Receives documents/g) || []).length, 3);
    assert.equal((html.match(/Invite as contact/g) || []).length, 1);
  });

  test("No primary person — pick one, when the project has none", () => {
    assert.doesNotMatch(html, /No primary person/);
    const none = ui.render(ui.ProjectPeopleSection, {
      projectId: "p", viewerRole: "founder",
      initial: { people: [{ ...OWNER, is_primary: 0 }], primary_missing: true },
    });
    assert.match(none, /No primary person — pick one/);
  });

  test("a client sees the list read-only: no selects, no Add person, no remove", () => {
    const ro = ui.render(ui.ProjectPeopleSection, {
      projectId: "p", viewerRole: "client",
      initial: { people: [OWNER, MANAGER], primary_missing: false },
    });
    assert.doesNotMatch(ro, /<select/);
    assert.doesNotMatch(ro, /Add person/);
    assert.doesNotMatch(ro, /Remove /);
    assert.match(ro, /Main contact/);
    assert.match(ro, /Approver/);
  });
});

/* ── "Who gets this?", drawn ────────────────────────────────────────────── */

describe("RecipientPickerDialog (rendered)", () => {
  const html = ui.render(ui.RecipientPickerDialog, {
    api: { get: async () => ({}) },
    projectId: "p", kind: "contractual", documentLabel: "Website rebuild proposal",
    onSend: async () => {}, onCancel: () => {},
    initial: {
      people: [
        { ...OWNER, default: false, can_email: true },
        { ...MANAGER, default: true, can_email: true },
      ],
      available: { contacts: [{ lumen_contact_id: 31, display_name: "Pat Partner", email: "pat@x.example", company: "Partner Co" }], users: [] },
    },
  });
  const box = (key) => (html.match(new RegExp(`<input[^>]*data-recipient="${key}"[^>]*>`)) || [""])[0];

  test("pre-ticks by default: the approver ticked, the owner not", () => {
    assert.match(box("p-mgr"), /checked=""/);
    assert.doesNotMatch(box("p-owner"), /checked=""/);
    assert.doesNotMatch(box("c:31"), /checked=""/);
  });

  test("the words: Who gets this?, the one-link note, Not on the project yet, Send / Cancel", () => {
    assert.match(html, /Who gets this\?/);
    assert.match(html, /Only the people ticked are emailed\. The document is one link\./);
    assert.match(html, /Not on the project yet/);
    assert.match(html, /Pat Partner/);
    assert.match(html, />Send</);
    assert.match(html, />Cancel</);
    assert.match(html, /morgan@harbor\.example/);
  });
});

/* ── The builder and the modal, pinned on source ────────────────────────── */

describe("the proposal builder sends to the people ticked", () => {
  const src = read("builder/proposal/ProposalBuilder.tsx");

  test("the builder's Send carries recipients when a project is attached", () => {
    assert.match(src, /projectId\?: string \| null;/);
    assert.match(src, /api\.post<[^>]*>\(\s*`\/proposals\/\$\{id\}\/send`,\s*recipients && recipients\.length \? \{ recipients \} : undefined,/);
    assert.match(src, /if \(send && attachedProjectId && recipients === undefined\) \{ setPickingRecipients\(true\); return; \}/);
    assert.match(src, /<RecipientPickerDialog[\s\S]*?kind="contractual"/);
  });

  test("the Pick-a-customer refusal no longer fires for a project's proposal", () => {
    assert.match(src, /if \(send && !contactId && !attachedProjectId\) \{ refuse\(anchor, "Pick a customer to send it to/);
  });

  test("a new proposal is born on its project; an opened one brings its own project and its sends", () => {
    assert.match(src, /attachedProjectId \? \{ \.\.\.payload, project_id: attachedProjectId \} : payload/);
    assert.match(src, /if \(row\.project_id\) setAttachedProjectId\(String\(row\.project_id\)\);/);
    assert.match(src, /setSentTo\(Array\.isArray\(row\.sent_to\) \? row\.sent_to : \[\]\);/);
    assert.match(src, /\{sentToLine\(sentTo\)\}/);
  });
});

describe("the project modal", () => {
  const src = read("components/consulting/ConsultingProjectModal.tsx");

  test("Overview carries the People section under the description card", () => {
    const desc = src.indexOf("Project description");
    const people = src.indexOf("<ProjectPeopleSection");
    const meta = src.indexOf("{/* Two-column meta */}");
    assert.ok(desc > 0 && people > desc && meta > people, "description → People → the meta cards");
  });

  test("Proposals tab: New proposal for this project opens the builder with the project; rows say Sent to …", () => {
    assert.match(src, /New proposal for this project/);
    assert.match(src, /<ProposalBuilder[\s\S]*?projectId=\{projectId\}/);
    assert.match(src, /\{p\.last_sent_to && \([\s\S]*?Sent to \{p\.last_sent_to\}/);
  });

  test("Deliverables tab: the visibility line, and Send to client asks who first", () => {
    assert.match(src, /\{deliverableVisibility\(d\)\}/);
    assert.match(src, /onSendToClient=\{viewerRole === "founder" \? \(\) => setSendFor\(d\) : undefined\}/);
    assert.match(src, /<RecipientPickerDialog[\s\S]*?kind="deliverable"/);
    assert.match(src, /send-to-client`,\s*recipients\.length \? \{ recipients \} : \{\}/);
    assert.doesNotMatch(src, /Sent to client \{new Date/, "the old one-line 'Sent to client' is replaced, not kept beside it");
  });

  test("the panel hands Send to Client to the host when the host asks who", () => {
    const panel = read("components/consulting/DeliverableActionPanel.tsx");
    assert.match(panel, /if \(onSendToClient\) \{ onSendToClient\(\); return; \}/);
  });
});
