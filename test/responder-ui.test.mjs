// The Responder's two surfaces: the panel on the lead card and the settings
// page. Source-pinned, like il-learning-ui and site-requests-ui — these are
// wiring and wording facts a typecheck cannot see.
//
// What has to stay true:
//   • the panel is ONE tab on the existing lead modal, not a rebuild of it
//   • the panel calls the routes LUMEN actually serves
//   • Approve & send exists, and Edit exists, and Discard exists
//   • Essentials sees the upsell instead of drafts
//   • the settings page has the on/off switch and the Authority threshold
//   • D2 by absence: no surface offers to text the customer
//   • the engine is "ARGUS AI"; the model vendor is named nowhere
//   • neither surface says "tenant" to a human (feedback_no_tenant_in_ui)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");
const read = (rel) => readFileSync(path.join(SRC, rel), "utf8");

const panel = read("components/spark/LeadResponderPanel.tsx");
const modal = read("components/spark/SparkLeadModal.tsx");
const settings = read("pages/settings/ResponderSettingsPage.tsx");
const app = read("App.tsx");
const settingsRoutes = read("pages/settings/SettingsRoutes.tsx");

/** Everything a person can read: JSX text and quoted copy, minus the code. */
function visibleText(src) {
  return src
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/className="[^"]*"/g, " ")
    .replace(/import[^;]*;/g, " ");
}

test("the panel is one tab bolted onto the existing lead modal", () => {
  assert.match(modal, /import \{ LeadResponderPanel \} from "\.\/LeadResponderPanel"/);
  assert.match(modal, /type Tab = "overview" \| "contacts" \| "notes" \| "responder" \| "activity" \| "actions";/);
  assert.match(modal, /\{ key: "responder", label: "Responder", icon: Sparkles \}/);
  assert.match(modal, /\{tab === "responder" && lead && \(\s*<LeadResponderPanel leadId=\{lead\.id\} onChanged=\{onChanged\} \/>/);
});

test("the panel talks to the routes LUMEN serves", () => {
  assert.match(panel, /`\/api\/v1\/leads\/\$\{leadId\}\/responder`/);
  assert.match(panel, /`\/api\/v1\/leads\/\$\{leadId\}\/drafts\/\$\{d\.draft_id\}\/approve`/);
  assert.match(panel, /`\/api\/v1\/leads\/\$\{leadId\}\/drafts\/\$\{d\.draft_id\}\/discard`/);
  assert.match(panel, /`\/api\/v1\/leads\/\$\{leadId\}\/drafts\/\$\{d\.draft_id\}`/);
  assert.match(panel, /`\/api\/v1\/leads\/\$\{leadId\}\/responder\/run`/);
});

test("the panel shows the acknowledgement, the alert and the follow-up as facts, not as promises", () => {
  assert.match(panel, /We emailed them back at/);
  assert.match(panel, /You were told at/);
  assert.match(panel, /Added to your follow-up sequence/);
  // and says plainly when each did NOT happen
  assert.match(panel, /No acknowledgement was sent/);
  assert.match(panel, /No alert was sent to you/);
});

test("every draft offers Approve & send, Edit and Discard", () => {
  assert.match(panel, /"Approve & send quote" : "Approve & send"/);
  assert.match(panel, /\/>Edit\b/);
  assert.match(panel, /\/>Discard\b/);
  assert.match(panel, /Open in OLIVER/);
  // Save & send exists too, so an edited reply is one click, not two.
  assert.match(panel, />Save &amp; send</);
});

test("a quote's customer link is only offered once it has been sent", () => {
  // The server nulls it on an unsent draft; the panel only renders it in the
  // Sent block. Both, deliberately — a copy-pasteable link on a draft is a way
  // around the approval.
  const sentBlock = panel.slice(panel.indexOf("Sent</h4>"));
  assert.match(sentBlock, /d\.quote_accept_url/);
  const liveBlock = panel.slice(panel.indexOf("{live.map"), panel.indexOf("Sent</h4>"));
  assert.equal(/quote_accept_url/.test(liveBlock), false);
});

test("Essentials sees the upsell where the drafts would be", () => {
  assert.match(panel, /\{data\.entitled && !data\.can_draft &&/);
  assert.match(panel, /Want the reply written for you\?/);
  assert.match(panel, /it also drafts the\s*\n?\s*reply in your voice/);
});

test("a business without the Responder is told what it does, not shown a lock", () => {
  assert.match(panel, /\{!data\.entitled &&/);
  assert.match(panel, /You don't have the Responder yet/);
});

test("the settings page has the switch, the sequence picker and the threshold", () => {
  assert.match(settings, /Answer new inquiries for me/);
  assert.match(settings, /Email them back straight away/);
  assert.match(settings, /Add them to a follow-up sequence/);
  assert.match(settings, /Draft the reply for me/);
  assert.match(settings, /Attach a quote from my price list/);
  assert.match(settings, /Let small quotes send themselves/);
  assert.match(settings, /Send by itself up to/);
  assert.match(settings, /auto_send_max_usd/);
});

test("the threshold copy says a complaint always waits, whatever the amount", () => {
  assert.match(settings, /reads like a complaint, a refund or a legal\s*\n?\s*matter — whatever the amount/);
});

test("the settings page is routed and reachable from the Settings hub", () => {
  assert.match(app, /<Route path="settings\/responder" element=\{<ResponderSettingsPage \/>\} \/>/);
  assert.match(settingsRoutes, /to: '\/app\/settings\/responder'/);
  assert.match(settingsRoutes, /label: 'The Responder'/);
});

test("the founder-only entitlement switch is behind is_founder", () => {
  assert.match(settings, /\{data\.is_founder && \(/);
  assert.match(settings, /entitlement_override/);
  assert.match(settings, /Intelligent Analytics only/);
});

test("neither surface offers to text the customer (D2)", () => {
  for (const [name, src] of [["the panel", panel], ["the settings page", settings]]) {
    const text = visibleText(src);
    assert.equal(/text (them|the customer)|send a text to|SMS them/i.test(text), false,
      `${name} must not offer to text a lead — D2 holds every SMS outside an inbound thread`);
  }
  // and the settings page says so out loud, so nobody wonders where the switch is
  assert.match(settings, /we never text somebody who filled in a form/);
});

test("the engine is ARGUS AI and no model vendor is named", () => {
  for (const [name, src] of [["the panel", panel], ["the settings page", settings]]) {
    assert.match(src, /Powered by \{data\.engine\}/, `${name} must credit the engine`);
    assert.equal(/anthropic|claude|openai|gpt-/i.test(src), false,
      `${name} must never name the model vendor`);
  }
});

test("neither surface says 'tenant' to a human", () => {
  for (const [name, src] of [["the panel", panel], ["the settings page", settings]]) {
    assert.equal(/tenant/i.test(visibleText(src)), false, `${name} must say Business, never tenant`);
  }
});

test("the settings page explains itself in plain words, with no jargon", () => {
  const text = visibleText(settings);
  for (const jargon of ["LLM", "webhook", "endpoint", "idempotent", "entitlement gate", "API"]) {
    assert.equal(text.includes(jargon), false, `"${jargon}" is not a word a business owner should have to read`);
  }
});
