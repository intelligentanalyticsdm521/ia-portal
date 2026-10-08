// The agent surfaces that remain after ARGUS → Your team (2026-10-08): the one
// approval card (now under every Needs-you item), the run history panel, the
// row shapes, and the founder page. Source-pinned — wiring and wording facts a
// typecheck cannot see.
//
// The three per-product Agents pages (ARION, OLIVER, SPARK) and the two
// components only they used (AgentActivityPanel, AgentSettingsRow) are DELETED:
// the work moved to one page per employee (ARGUS → Your team), pinned in
// test/argus-team-ui.test.mjs. What has to stay true here:
//   • the client learns ONE pattern: Approve / Edit / Decline-or-Skip, the same
//     verbs the Responder panel already taught
//   • the client surfaces show no dollar figure; the founder page does (AG-1)
//   • the engine is "ARGUS AI" and no model vendor is named anywhere
//   • no surface says "tenant" to a human
//   • the founder page carries the kill switches, the spend limits and the
//     propose-only code queue
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");
const read = (rel) => readFileSync(path.join(SRC, rel), "utf8");

const card = read("components/agents/AgentApprovalCard.tsx");
const runsPanel = read("components/agents/AgentRunHistoryPanel.tsx");
const types = read("components/agents/types.ts");
const founder = read("pages/admin/AgentsAcrossBusinessesPage.tsx");
const app = read("App.tsx");
const router = read("pages/ServiceRouter.tsx");
const platformAdmin = read("pages/PlatformAdminPage.tsx");
const employeePage = read("pages/argus/ArgusEmployeePage.tsx");
const needsCard = read("components/argus/team/NeedsYouCard.tsx");

const CLIENT_SURFACES = [
  ["the approval card", card],
  ["the run history panel", runsPanel],
  ["the employee page", employeePage],
  ["the Needs-you card", needsCard],
];

/** Everything a person can read: JSX text and quoted copy, minus the code. */
function visibleText(src) {
  return src
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/className="[^"]*"/g, " ")
    .replace(/import[^;]*;/g, " ");
}

/* ── replace means delete ────────────────────────────────────────────── */

test("the three Agents pages and the components only they used are gone", () => {
  for (const f of [
    "pages/arion/ArionAgentsPage.tsx",
    "pages/arion/useArionAgentsApi.ts",
    "pages/oliver/OliverAgentsPage.tsx",
    "pages/spark/SparkAgentsPage.tsx",
    "components/agents/AgentActivityPanel.tsx",
    "components/agents/AgentSettingsRow.tsx",
  ]) {
    assert.equal(existsSync(path.join(SRC, f)), false, `${f} must be deleted, not left beside its replacement`);
  }
  assert.equal(/ArionAgentsPage|OliverAgentsPage|SparkAgentsPage/.test(router), false);
});

/* ── one pattern, learned once ───────────────────────────────────────── */

test("the approval card offers the same three verbs as the Responder panel", () => {
  const responder = read("components/spark/LeadResponderPanel.tsx");
  assert.match(responder, /Approve & send/, "the pattern being copied still exists");
  assert.match(card, /approveLabel \|\| "Approve & send"/);
  assert.match(card, />Edit\b/);
  assert.match(card, /const second = secondaryLabel \|\| "Decline";/);
  // …and, like the Responder, an edit and an approval in one press
  assert.match(card, /Save &amp; /);
});

test("declining asks why, and insists unless the page says the reason is optional", () => {
  assert.match(card, /onDecline\?\.\(row, note\.trim\(\)\)/);
  assert.match(card, /disabled=\{\(!declineNoteOptional && !note\.trim\(\)\) \|\| declineBusy\}/,
    "a blank reason must not be submittable where the route requires one (QTC)");
});

test("a held draft cannot be approved as written from the card", () => {
  // AC2, now on the card: Approve without edits is off, and Save & approve is
  // off until a word changed.
  assert.match(card, /disabled=\{approveBusy \|\| !!requireEditsToApprove\}/);
  assert.match(card, /disabled=\{approveBusy \|\| \(!!requireEditsToApprove && !changed\)\}/);
});

test("the four statuses are the only ones the Portal knows about", () => {
  assert.match(types, /export type AgentStatus = "proposed" \| "approved" \| "declined" \| "stopped";/);
  // The payload key is `rows`, not `data` — an envelope-stripping client would
  // hand back a bare array and drop `meta` on the floor.
  assert.match(types, /export interface AgentActivityPayload \{/);
  assert.match(types, /rows: AgentActivityRow\[\];/);
  assert.equal(/"sent"\s*\|/.test(types), false, "`sent` would be a lie for the campaign agent");
});

test("the rows carry what phase 1 adds, all optional", () => {
  for (const f of [/job_key\?: string;/, /employee_key\?: string;/, /brief_cited\?: BriefCited \| null;/,
    /held_words\?: string \| null;/, /decide\?: Decide;/]) {
    assert.match(types, f);
  }
});

/* ── AG-1: dollars ───────────────────────────────────────────────────── */

test("no client-facing agent surface renders a dollar figure", () => {
  for (const [name, src] of CLIENT_SURFACES) {
    assert.equal(/cost_usd/.test(src), false, `${name} must not read our cost basis`);
    assert.equal(/\$\{?\s*usd\(/.test(src), false, `${name} must not format money for agent work`);
  }
  // …and the row's own plain-words line IS shown, so cost is not just hidden
  assert.match(card, /\{row\.cost_note\}/);
});

test("the founder page is the one place the real cost appears", () => {
  assert.match(founder, /cost_usd/);
  assert.match(founder, /Our cost/);
  assert.match(founder, /il\/admin\/agents\/activity\?days=/);
  assert.match(founder, /the client-facing\s*\n?\s*agent pages never show a cost figure/);
  assert.match(founder, /rollup\.unavailable/, "an incomplete rollup must say so");
});

test("the founder page is routed behind RequireFounderRoute and linked from Platform Admin", () => {
  assert.match(app, /<Route path="admin\/agents" element=\{<RequireFounderRoute \/>\}>/);
  assert.match(app, /AgentsAcrossBusinessesPageAdmin/);
  assert.match(platformAdmin, /to="\/app\/admin\/agents"/);
  assert.match(platformAdmin, /Agents across businesses/);
});

/* ── the words ───────────────────────────────────────────────────────── */

test("no model vendor is named on any agent surface", () => {
  for (const [name, src] of [...CLIENT_SURFACES, ["the founder page", founder]]) {
    assert.equal(/anthropic|claude|openai|gpt-|gemini|sonnet|haiku|llama/i.test(src), false,
      `${name} must never name the model vendor`);
  }
});

test("no client surface says 'tenant' to a human", () => {
  for (const [name, src] of CLIENT_SURFACES) {
    assert.equal(/tenant/i.test(visibleText(src)), false, `${name} must say Business, never tenant`);
  }
});

test("every agent's attribution line comes from the server, not re-spelled here", () => {
  assert.match(card, /\{row\.attribution\}/);
  for (const [name, src] of CLIENT_SURFACES) {
    assert.equal(/Created by Intelligent Analytics/.test(src), false,
      `${name} must not spell an attribution line itself`);
  }
});

/* ── history, and the founder's switches ─────────────────────────────── */

test("the run history panel says what happened, never a dollar figure", () => {
  assert.match(runsPanel, /What it has been doing/);
  assert.match(runsPanel, /row\.notes/, "why it skipped what it skipped, in words");
  assert.match(runsPanel, /row\.failure/, "a failure must say what failed");
  assert.equal(/cost_usd|usd\(/.test(runsPanel), false, "AG-1: no dollar figure on a client surface");
  // …and it is on the employee page's History tab, not parked behind a false.
  assert.match(employeePage, /<AgentRunHistoryPanel/);
  assert.equal(/\{\s*false\s*&&/.test(employeePage), false);
});

test("the founder page carries the kill switches, the limits and the code queue", () => {
  assert.match(founder, /<AgentControlsCard/);
  assert.match(founder, /<AgentCodeProposalsCard/);
  const controls = read("pages/admin/AgentControlsCard.tsx");
  // Every write echoes the WORDS back. A `confirm: true` flag is one stray body
  // field away from no confirmation at all, and two of these stop the platform.
  assert.match(controls, /confirm_words/);
  assert.match(controls, /Type exactly/);
  assert.match(controls, /confirm: typed/);
  assert.equal(/confirm: true/.test(visibleText(controls)), false,
    "a `confirm: true` flag is one stray body field away from no confirmation at all");
  assert.match(controls, /il\/admin\/agents\/controls\/spend/);
  assert.match(controls, /il\/admin\/agents\/controls\/ceiling/);
  assert.match(controls, /il\/admin\/agents\/controls\/stop/);
  // "We could not read it" must never render as "it is switched off".
  assert.match(controls, /UNKNOWN/);
  assert.match(controls, /should be read as "switched off"/);
  assert.equal(/Start everywhere|Turn on everywhere/i.test(controls), false);

  const proposals = read("pages/admin/AgentCodeProposalsCard.tsx");
  assert.match(proposals, /Approving does not apply anything/);
  assert.equal(/proposals\/[^'"]*\/apply/i.test(proposals), false, "there is no apply route and there must never be one");
});

test("the oversight layer's numbers are never counted as runs or as cost", () => {
  assert.equal((founder.match(/kind === "oversight"/g) || []).length, 2,
    "both tables must special-case the oversight layer");
  assert.match(founder, /checked \{a\.checked \?\? 0\} runs/);
  assert.match(founder, /no spend/);
});

test("the Responder keeps ONE settings page; its draft and send-by-itself are the job's controls", () => {
  const responderSettings = read("pages/settings/ResponderSettingsPage.tsx");
  assert.match(responderSettings, /Answer new inquiries for me/, "the Responder's own switch stays on its page");
  assert.match(responderSettings, /useTeamJob\('marketer', 'spark\.inquiry_reply'\)/);
  assert.equal(/save\(\{ draft_enabled/.test(responderSettings), false, "the old draft switch is gone");
  assert.equal(/save\(\{ auto_send_enabled/.test(responderSettings), false, "the old send-by-itself switch is gone");
});

test("the writer's 'what I left out, and why' note is shown in the open on the card, not hidden under 'What this is based on' (dev click S22)", () => {
  const i = card.indexOf("{row.detail?.confidence_note && (");
  assert.ok(i > 0, "the card renders detail.confidence_note, with no dead guard in front of it");
  assert.ok(!/false\s*&&\s*row\.detail\?\.confidence_note/.test(card), "never switched off by a constant");
  assert.ok(/data-left-out-note/.test(card.slice(i, i + 400)), "it is its own visible line");
  assert.ok(/What it left out, and why/.test(card.slice(i, i + 400)), "with a plain label");
  const why = card.indexOf("row.detail?.why &&");
  assert.ok(i < why, "the note comes before the collapsed 'What this is based on'");
});
