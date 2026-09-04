// Conversations 2 + 3 — what the screens are allowed to say, and what they must
// never say.
//
// SOURCE PINS. These read the files rather than rendering them, the same shape
// as responder-ui.test.mjs beside them: what matters here is the WORDS and the
// gates, and both are visible in the source. Rendering would test React.
//
// WHAT THEY PROTECT
//   D1  the founder page shows whether Provision spends real money BEFORE the
//       button, and the client page never sees what a number costs us.
//   D2  the missed-call text-back switch is on the client's screen, greyed,
//       with the reason — not hidden. A hidden switch is a feature nobody knows
//       they are waiting for.
//   D4  a business with no line is told what the shared number cannot do for
//       them, in words, because that ambiguity is the reason to buy a line.
//   Carrier registration is separated from the line being live: "Calls are
//       working. Texting is still with the carrier."
//   No number a customer owns is ever rendered in full.
//   "Business", never "tenant".

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");

const panel = read("src/components/spark/LeadTextsCallsPanel.tsx");
const modal = read("src/components/spark/SparkLeadModal.tsx");
const sources = read("src/pages/spark/SparkLeadSourcesPage.tsx");
const founder = read("src/pages/admin/PhoneLinesPage.tsx");
const leadSource = read("src/lib/leadSource.ts");
const app = read("src/App.tsx");
const adminHome = read("src/pages/PlatformAdminPage.tsx");
// The Conversations follow-up pack's two new client surfaces (§4.8, SMS-15).
const settings = read("src/pages/settings/PhoneTextingSettingsPage.tsx");
const reg = read("src/pages/settings/PhoneRegistrationPage.tsx");
const settingsRoutes = read("src/pages/settings/SettingsRoutes.tsx");

/* ── the lead card ───────────────────────────────────────────────────────── */

test("the panel is one tab bolted onto the existing lead modal", () => {
  assert.match(modal, /import \{ LeadTextsCallsPanel \} from "\.\/LeadTextsCallsPanel"/);
  assert.match(modal, /type Tab = "overview" \| "contacts" \| "notes" \| "conversation" \| "textscalls" \| "responder" \| "activity" \| "actions";/);
  assert.match(modal, /\{ key: "textscalls", label: "Texts & calls", icon: Phone \}/);
  assert.match(modal, /\{tab === "textscalls" && lead && \(\s*<LeadTextsCallsPanel leadId=\{lead\.id\} onChanged=\{onChanged\} \/>/);
});

test("the panel talks to the routes LUMEN serves", () => {
  assert.match(panel, /`\/api\/v1\/leads\/\$\{leadId\}\/texts-calls`/);
  assert.match(panel, /`\/api\/v1\/leads\/\$\{leadId\}\/sms\/reply`/);
  assert.match(panel, /`\/api\/v1\/leads\/\$\{leadId\}\/sms\/close`/);
});

test("the reply box explains ITSELF away rather than sitting there dead", () => {
  // D2 refuses a text outside an inbound thread. The server sends the reason
  // with the thread, and every reason has words an owner can act on.
  for (const reason of [
    "opted_out", "outside_inbound_thread", "inbound_window_expired", "thread_spam",
  ]) {
    assert.match(panel, new RegExp(`${reason}:`), `${reason} needs a sentence, not a code`);
  }
  assert.match(panel, /replied STOP/);
  assert.match(panel, /conversation they started/);
  assert.match(panel, /\{t\.can_reply \? \(/, "the server decides; the button follows");
});

test("the segment counter is visible while they type, not after the invoice", () => {
  assert.match(panel, /segmentsFor/);
  assert.match(panel, /texts off your allowance/);
});

test("a customer's number is never rendered in full on the lead card", () => {
  // The API masks it; the panel reads only the masked field and has no code
  // that could reassemble one.
  assert.match(panel, /counterpart_masked/);
  assert.match(panel, /from_masked/);
  assert.doesNotMatch(panel, /counterpart_number/);
});

/* ── the client's settings card ──────────────────────────────────────────── */

test("a business with no line is told what the shared number cannot do", () => {
  // That ambiguity IS the product reason for a dedicated line, so it is said in
  // plain words rather than left for them to discover.
  assert.match(sources, /shared number/);
  assert.match(sources, /two of our clients know the same person/);
});

test("the price and the wait are said before the button, not after", () => {
  assert.match(sources, /a month\./);
  assert.match(sources, /setup_estimate/);
  assert.match(sources, /registration_promise/);
  assert.match(sources, /Ask for a number/);
});

test("a live line whose texting is still with the carrier says exactly that", () => {
  assert.match(sources, /Calls are working\. Texting is still with the carrier\./);
  assert.match(sources, /keep going out from our shared number in the meantime/);
  assert.match(sources, /\{line\.can_text \? "Live" : "Calls live"\}/);
});

test("D2 — the text-back switch is SHOWN, greyed, with the reason", () => {
  assert.match(sources, /Text people back when you miss their call/);
  assert.match(sources, /text_back_locked_reason/);
  assert.match(sources, /disabled\s*\n\s*readOnly/);
  assert.match(sources, /checked=\{false\}/, "and it cannot be ticked, whatever the state says");
});

test("the recording notice is presented as ours, not theirs to remove", () => {
  assert.match(sources, /This call may be recorded/);
  assert.match(sources, /not ours or yours to leave off/);
});

/* ── the founder page ────────────────────────────────────────────────────── */

test("the founder is told whether Provision spends real money, before pressing it", () => {
  assert.match(founder, /purchase_enabled/);
  assert.match(founder, /Buying numbers is LIVE\. Provision spends real money\./);
  assert.match(founder, /Buying numbers is off\. Provision creates a stand-in and bills nothing\./);
  assert.match(founder, /confirm_spend: true/);
  assert.match(founder, /Stand-in/, "and a stand-in line is labelled as one on the row");
});

test("releasing a number types the number", () => {
  assert.match(founder, /confirm_number/);
  assert.match(founder, /CANNOT be got back/);
  assert.match(founder, /customers still have it in their phones/);
});

test("carrier registration is a separate state with its own buttons", () => {
  assert.match(founder, /REGISTRATION_CHIP/);
  assert.match(founder, /File carrier registration/);
  assert.match(founder, /Carrier approved/);
  assert.match(founder, /CANNOT be edited once it is sent/);
  // SMS-15, 2026-09-06: the six browser prompts the founder used to type — legal
  // name, address, website, EIN, one sample, a sentence about consent — are
  // GONE. The client fills the form on their own Phone & texting page, it is
  // validated and blocking, and this button only exists once it is complete.
  // The founder is the wrong person to ask a business for its EIN.
  assert.doesNotMatch(founder, /How does this business collect consent/,
    "the founder no longer types the client's answers into a browser prompt");
  assert.match(founder, /registration_complete !== false/,
    "the file button does not exist until the form is finished");
  assert.match(founder, /non-refundable/, "and the button says what it costs");
  assert.match(reg, /opt_in_description|What the mobile carriers need/,
    "the carrier asks how consent is collected, so the CLIENT is asked");
});

test("the pool level and the two purchase switches are on the founder's screen", () => {
  assert.match(founder, /Number pool/);
  assert.match(founder, /short_by/);
  assert.match(founder, /purchase_live \? "BUY" : "mint stand-ins for"/);
  assert.match(founder, /cooling off/);
});

test("real dollars appear on the founder page and nowhere else", () => {
  assert.match(founder, /our_cost_cents/);
  assert.doesNotMatch(sources, /our_cost_cents/, "AG-1: plain words for the client, real money for the founder");
  assert.doesNotMatch(panel, /our_cost_cents/);
});

test("the founder route is gated in the Portal AND fails closed in LUMEN", () => {
  assert.match(app, /admin\/phone-lines" element=\{<RequireFounderRoute \/>\}/);
  assert.match(app, /PhoneLinesPageAdmin/);
  assert.match(adminHome, /\/app\/admin\/phone-lines/);
  assert.match(founder, /founder-gated in LUMEN and fails CLOSED/);
});

/* ── how a lead reads ────────────────────────────────────────────────────── */

test("an SMS lead reads 'Text message' and a call lead reads 'Missed call'", () => {
  assert.match(leadSource, /sms: "Text message"/);
  assert.match(leadSource, /phone_call: "Missed call"/);
  // The channel half names WHICH number it came in on — masked, like everything
  // else — rather than repeating the capture point.
  assert.match(leadSource, /sms: "Your number"/);
});

/* ── vocabulary ──────────────────────────────────────────────────────────── */

test("'Business', never 'tenant', on anything a client reads", () => {
  for (const [name, src] of [["panel", panel], ["sources", sources]]) {
    const rendered = src
      .replace(/\/\/[^\n]*/g, " ")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\b(tenant_id|tenantId|x-tenant-id)\b/g, " ");
    assert.doesNotMatch(rendered, /\btenants?\b/i, `${name} must not say "tenant" to a client`);
  }
});

test("the engine is ARGUS AI and no model vendor is named anywhere", () => {
  for (const src of [panel, sources, founder]) {
    assert.doesNotMatch(src, /anthropic|claude|openai|gpt/i);
  }
  assert.match(panel, /ARGUS Responder/);
});
