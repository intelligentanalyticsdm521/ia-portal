// The Conversations follow-up pack — what the new screens must say, and must
// never say.
//
// SOURCE PINS, the same shape as conversations-ui.test.mjs beside them: what
// matters here is the WORDS and the gates, and both are visible in the source.
// Rendering would test React.
//
// WHAT THEY PROTECT
//   §4.8   The client's Phone & texting page: line with purpose and status, a
//          pending line's REASON (never a dead switch), the allowance bar with
//          overage in plain words and COUNTED NOT CHARGED said out loud, the
//          opted-out list with dates and "they replied STOP", "Add a second
//          line — $5/month", and quiet hours in ONE place.
//   SMS-15 The carrier form is blocking, says what is still missing, never
//          promises "instant", and offers the two public pages we write.
//   LINE-4 The founder page shows bank level by kind with release dates,
//          approvals pending with DAYS ELAPSED and the Azure blade link, failed
//          registrations and their sunk cost, segments by business and source,
//          and shared-line load.
//   SMS-16 The compose counter counts the identification the shared line adds.
//   And "business", never "tenant", anywhere a client can read.
//
// MUTATION-TESTED:
//   · drop the pending_reason render from the settings page
//        caught by "a pending line shows the reason, never a dead switch"
//   · change the overage copy to imply a charge
//        caught by "overage is counted, not charged, and it says so"
//   · count the draft instead of the prefixed message
//        caught by "the compose counter counts what the carrier will bill"

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");

/** The rules below are about what a CLIENT can read on the screen. A comment
 *  saying "never say instant" is the opposite of saying instant, and a comment
 *  saying "it is a business, not a tenant" is the rule being written down —
 *  neither belongs in a search for banned copy. */
const copy = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const settings = read("src/pages/settings/PhoneTextingSettingsPage.tsx");
const reg = read("src/pages/settings/PhoneRegistrationPage.tsx");
const founder = read("src/pages/admin/PhoneLinesPage.tsx");
const panel = read("src/components/spark/LeadTextsCallsPanel.tsx");
const app = read("src/App.tsx");
const settingsRoutes = read("src/pages/settings/SettingsRoutes.tsx");

/* ── §4.8 — the client's page ────────────────────────────────────────────── */

test("Phone & texting is a settings page a client can find", () => {
  assert.match(app, /settings\/phone-texting" element=\{<PhoneTextingSettingsPage \/>\}/);
  assert.match(app, /settings\/phone-texting\/registration" element=\{<PhoneRegistrationPage \/>\}/);
  assert.match(settingsRoutes, /\/app\/settings\/phone-texting/,
    "a page nobody can navigate to is a page nobody uses");
});

test("the line shows its purpose and what that purpose is for", () => {
  assert.match(settings, /Operations/);
  assert.match(settings, /appointment reminders, payment requests and portal notices/);
  assert.match(settings, /Marketing/);
});

test("a pending line shows the reason, never a dead switch", () => {
  assert.match(settings, /pending_reason/);
  assert.match(settings, /Being set up/);
  // And the sentence itself comes from the server, from the one place it lives,
  // so the Portal, the email and the founder page cannot drift into three
  // different promises.
  assert.match(settings, /line\.pending_reason \|\| /);
});

test("the allowance is a bar with the real numbers", () => {
  assert.match(settings, /texts used/);
  assert.match(settings, /allowance\.used/);
  assert.match(settings, /allowance\.included/);
  assert.match(settings, /style=\{\{ width: `\$\{pct\}%` \}\}/);
});

test("overage is counted, not charged, and it says so", () => {
  // A client who sees "34 over" and no explanation assumes a bill. There is no
  // charge code for overage yet and pretending otherwise would be the first
  // thing they ring about.
  assert.match(settings, /counting them, not charging for them/);
  assert.match(settings, /nothing extra is being billed/);
});

test("the opted-out list carries the date and the reason in words", () => {
  assert.match(settings, /People who asked you to stop texting/);
  assert.match(settings, /\{o\.why\}/);
  assert.match(settings, /when\(o\.at\)/);
  assert.match(settings, /cannot be undone by re-importing your contacts/,
    "SMS-14 — an import can never clear a suppression, and the owner is told so");
});

test("a second line is one button with the price on it", () => {
  assert.match(settings, /Add a second line/);
  // SMS-12 (2026-09-07): the price comes off the ONE price list rather than a
  // hardcoded `?? 500`. A fallback in the page IS a second price list, which is
  // how Growth sat at 300 in three files while the decision said 250.
  assert.match(settings, /money\(meta\.pricing\.monthly_cents\)/);
  // Comments may name the old figures — that is the history. The CODE may not.
  assert.doesNotMatch(copy(settings), /\?\? 500/, "no hardcoded price anywhere on this page");
  assert.doesNotMatch(copy(settings), /\?\? 250/, "nor a hardcoded allowance");
  assert.match(settings, /keeps your campaigns separate from your reminders/);
});

test("quiet hours are in one place on this page", () => {
  assert.match(settings, /QuietHoursCard/);
  assert.match(settings, /There is one setting and it covers every/);
});

test("the client page never says 'tenant' and never shows what a number costs us", () => {
  for (const src of [copy(settings), copy(reg)]) {
    assert.doesNotMatch(src, /\btenant\b/i, "it is a Business");
    assert.doesNotMatch(src, /our_cost_cents/, "AG-1: real money only on the founder page");
  }
});

/* ── SMS-15 — the carrier form ───────────────────────────────────────────── */

test("the form never promises instant, and carries the waiting words verbatim", () => {
  assert.doesNotMatch(copy(reg), /\binstant(ly)?\b/i,
    "never say instant — it is 5 to 10 business days and saying otherwise is the complaint");
  assert.match(reg, /what_happens_next/, "the sentence comes from the server, from one place");
  assert.match(reg, /cannot be changed/);
});

test("the form says what is still missing rather than disabling a button silently", () => {
  assert.match(settings, /Still needed:/);
  assert.match(settings, /registration_missing/);
});

test("an absent EIN is offered with its cost, not refused", () => {
  assert.match(reg, /sole_proprietor_warning/);
  assert.match(reg, /f\.key === "ein" && !form\.ein/,
    "the warning appears next to the empty box, not in a support email afterwards");
  assert.match(reg, /\(optional\)/);
});

test("a page check that did not run is never shown as one that passed", () => {
  assert.match(reg, /We have not been able to check this page yet/);
  assert.match(reg, /status === "passed"/);
});

test("the client is offered the two public pages we write for them", () => {
  assert.match(settings, /policy-templates/);
  assert.match(settings, /privacy policy and texting terms/i);
});

test("link shorteners are named on the form, not discovered at rejection", () => {
  assert.match(reg, /blocked_shorteners/);
  assert.match(reg, /blocked outright/);
});

/* ── LINE-4 — the founder page ───────────────────────────────────────────── */

test("the bank shows what is available BY KIND, with the amber and red levels", () => {
  assert.match(founder, /available_by_kind/);
  assert.match(founder, /function levelClass/);
  assert.match(founder, /n <= 0.*rose/s, "red at zero");
  assert.match(founder, /n < 2.*amber/s, "amber below two");
});

test("cooling numbers show the date they can go back, and which can never be reassigned", () => {
  assert.match(founder, /back to the carrier after/);
  assert.match(founder, /never reassign/);
  assert.match(founder, /belonged to a business that left/);
});

test("anything waiting shows DAYS ELAPSED and where to go and look", () => {
  assert.match(founder, /Waiting \{l\.days_waiting\} day/);
  assert.match(founder, /regulatory_blade_url/);
  assert.match(founder, /Check status in the Azure portal/);
});

test("failed registrations show the money that is not coming back", () => {
  assert.match(founder, /Registrations refused/);
  assert.match(founder, /spent and not coming back/);
  assert.match(founder, /failed_registration_cost_cents/);
});

test("segments this month are broken down by business and by source", () => {
  assert.match(founder, /Texts this month, by business/);
  assert.match(founder, /by_source/);
  assert.match(founder, /What is eating them/);
  assert.match(founder, /Refused/);
});

test("shared-line load is on the screen, with the compliance boundary named", () => {
  assert.match(founder, /Our shared number/);
  assert.match(founder, /load\.businesses/);
  assert.match(founder, /telecom-compliance attorney/);
  assert.match(founder, /businesses >= 10/, "the boundary is a number, not a feeling");
});

/* ── SMS-16 — the compose counter ────────────────────────────────────────── */

test("the compose counter counts what the carrier will bill", () => {
  assert.match(panel, /shared_identity_prefix/);
  assert.match(panel, /const outgoing = draft\.trim\(\) \? `\$\{prefix\}\$\{draft\.trim\(\)\}` : ""/);
  assert.match(panel, /const segments = segmentsFor\(outgoing\)/,
    "counting the draft alone understates a shared-line reply by a segment in three");
});

test("the panel explains the identification rather than letting it look like a bug", () => {
  assert.match(panel, /Sent from our shared number, so it starts with/);
  assert.match(panel, /the carriers require it/);
});

test("every refusal the send route can return has words on this screen", () => {
  for (const reason of [
    "no_consent", "consent_declined", "unsubscribed",
    "shared_line_marketing", "shared_line_cap", "shared_line_off",
  ]) {
    assert.match(panel, new RegExp(`${reason}:`), `${reason} needs a sentence, not a code`);
  }
  assert.match(panel, /No texting consent on file/);
});
