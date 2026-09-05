// The texting commercial pack — what the screens must say about money.
//
// SOURCE PINS, the same shape as conversations-followup-ui.test.mjs beside
// them. What matters here is the WORDS and where the numbers come from, and
// both are visible in the source; rendering would test React.
//
// WHAT THEY PROTECT
//   SMS-12  $5 a month, 250 texts included, $0.02 over — COUNTED, NOT CHARGED —
//           and NOT ONE hardcoded figure on either page. A `?? 500` in the
//           Portal is a second price list, and a second price list is how
//           Growth sat at 300 in three files while the decision said 250.
//   SMS-13  The $99 is named as what it buys ("carrier registration and
//           compliance filing"), its waiver is shown as a benefit, and the page
//           says nothing has been charged, because nothing has.
//   LINE-1  The founder sees BOTH targets and BOTH levels, and is told that
//           toll-free is bought on request rather than by the timer.
//   SMS-10  Both registration providers, with the human cost of each.
//   SEAM-7-B The Contact 360 stopgap is one component and one usage, so
//           deleting it is one delete.
//
// MUTATION-TESTED:
//   · put `?? 500` back in the settings page
//        caught by "no page invents a price"
//   · drop the "not charging for them" branch
//        caught by "overage says counted or charged, from the switch, never
//        both"
//   · show only the kinds that happen to be in stock on the founder page
//        caught by "the founder sees both kinds even when one is empty"

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
// Source-shape reads normalise CRLF: this repo is checked out with Windows line
// endings and a multi-line pattern would otherwise never match.
const read = (p) => readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n");

/** Comments are the rule being written down, not the copy being tested. */
const copy = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const settings = read("src/pages/settings/PhoneTextingSettingsPage.tsx");
const founder = read("src/pages/admin/PhoneLinesPage.tsx");
const note = read("src/components/spark/NewInquiriesElsewhereNote.tsx");
const contact360 = read("src/pages/spark/SparkContact360Page.tsx");

/* ── SMS-12: one price list, and the pages read it ───────────────────────── */

test("no page invents a price", () => {
  // Comments are allowed to name the figures — that is the history being
  // written down. It is the CODE that must not carry one.
  for (const [name, src] of [["settings", copy(settings)], ["founder", copy(founder)]]) {
    assert.doesNotMatch(src, /\?\?\s*500/, `${name}: a fallback price IS a second price list`);
    assert.doesNotMatch(src, /\?\?\s*250/, `${name}: nor a fallback allowance`);
    assert.doesNotMatch(src, /\?\?\s*9900/, `${name}: nor a fallback activation fee`);
  }
  // And both read the one object.
  assert.match(settings, /meta\?\.pricing/);
  assert.match(founder, /meta\.pricing/);
});

test("the client's card says the price, the allowance, the overage and the fee", () => {
  assert.match(settings, /meta\.pricing\.lines\.price/);
  assert.match(settings, /meta\.pricing\.lines\.included/);
  assert.match(settings, /meta\.pricing\.lines\.overage/);
  assert.match(settings, /meta\.pricing\.lines\.activation/);
  // The sentences themselves are built ONCE, on the server, so the card, the
  // confirm and the founder page cannot word the same price three ways.
  assert.match(settings, /p\.confirm/);
});

test("overage says counted or charged, from the switch, never both", () => {
  assert.match(settings, /meta\?\.pricing\?\.overage_billed/);
  assert.match(settings, /counting them, not charging for them/);
  assert.match(settings, /nothing extra is being billed/);
  // The charged branch exists so the sentence follows the switch rather than
  // being a promise the page keeps making after the switch flips.
  assert.match(settings, /overage_cents_per_segment\)\} each/);
});

test("the $99 is described as what it buys, and its waiver as a benefit", () => {
  assert.match(settings, /activation_waived_reason/);
  assert.match(settings, /Carrier registration and compliance filing/);
  // Never "setup fee". A setup fee is a fee for nothing and a client is right
  // to resent one.
  assert.doesNotMatch(copy(settings), /setup fee/i);
  // And nothing has been charged, said out loud.
  assert.match(settings, /Not charged yet/);
  assert.match(settings, /Nothing is charged today/);
});

test("the client page still never says 'tenant' and never shows our cost", () => {
  const c = copy(settings);
  assert.doesNotMatch(c, /\btenant\b/i, "it is a Business");
  assert.doesNotMatch(c, /our_cost/, "AG-1: real money only on the founder page");
  assert.doesNotMatch(c, /\bsegment\b/i, "a client counts texts, not segments");
  assert.doesNotMatch(c, /10DLC|toll_free|SKU/i);
});

/* ── LINE-1: the bank, on the founder page ───────────────────────────────── */

test("the founder sees both kinds even when one is empty", () => {
  // Rendering only the kinds that happen to be in stock is how "3 local
  // available" reads as a full bank to somebody who has forgotten there are
  // two kinds.
  assert.match(founder, /const kinds = \["local", "toll_free"\]/);
  assert.match(founder, /targets\.local/);
  assert.match(founder, /targets\.toll_free/);
  assert.match(founder, /target \{pool\.targets\.local\} local · \{pool\.targets\.toll_free\} toll-free/);
});

test("the founder is told which kind the timer will actually buy", () => {
  assert.match(founder, /auto_top_up_kinds/);
  assert.match(founder, /on request/);
  assert.match(founder, /short_by_kind\?\.local/);
  assert.match(founder, /short_by_kind\?\.toll_free/);
  // The reason, not just the fact — otherwise somebody sets the toll-free
  // target higher and waits for a tick that is never coming.
  assert.match(founder, /cannot text until its own verification clears/);
});

test("unreadable targets say so rather than implying a full bank", () => {
  assert.match(founder, /targets unreadable/);
  assert.match(founder, /could not read the targets/);
});

/* ── SMS-12/13: the founder's own numbers ────────────────────────────────── */

test("the founder page shows the price list and the state of both money switches", () => {
  assert.match(founder, /counted, not charged/);
  assert.match(founder, /overage_billing_flag/);
  assert.match(founder, /pricing\.billing\.flag/);
  assert.match(founder, /waived on Authority, Business and OLIVER Pro\+/);
});

test("provisioning is refused on the page when the price list cannot be read", () => {
  assert.match(founder, /meta\?\.pricing_unavailable/);
  assert.match(founder, /cannot provision/);
  // A line stamped with a guessed allowance carries it for years; a founder
  // pressing a button again costs a minute.
  assert.match(founder, /keeps them for/);
});

test("provisioning asks local or toll-free, and recommends local", () => {
  assert.match(founder, /kind: tollFree \? "toll_free" : "local"/);
  assert.match(founder, /Cancel = a local number, which is what we recommend/);
});

/* ── SMS-10: the two providers ───────────────────────────────────────────── */

test("both registration providers are shown with the human cost of each", () => {
  assert.match(founder, /RegistrationProvidersCard/);
  assert.match(founder, /minutes_of_human_work_per_client/);
  assert.match(founder, /Scales to/);
  assert.match(founder, /by hand/);
  assert.match(founder, /Messaging Connect/);
  assert.match(founder, /before the eleventh client/);
});

/* ── SEAM-7-B: the stopgap that is meant to be deleted ───────────────────── */

test("the Contact 360 note is one component, one usage, and says it is temporary", () => {
  assert.match(note, /SEAM-7-B/);
  assert.match(note, /New inquiries show on the lead itself/);
  assert.match(note, /Lead Inbox/);
  // Deleting it must be one delete and one import. If it ever grows a second
  // usage, this fails and somebody has to think about it.
  const rendered = contact360.match(/<NewInquiriesElsewhereNote\s*\/>/g) || [];
  assert.equal(rendered.length, 1, "one usage — no more");
  const imports = contact360.match(/^import .*NewInquiriesElsewhereNote.*$/gm) || [];
  assert.equal(imports.length, 1, "and one import");
  assert.match(note, /delete this file and its single usage/);
  // The same path the new-leads banner uses. Two links by the same name must
  // not go to two different pages.
  assert.match(note, /\/app\/services\/spark_leads/);
});
