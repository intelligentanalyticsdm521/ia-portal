// B18 — the direct-mail-only surfaces: the badge, the locked contact channels,
// and the search-model chooser on New Search.
//
// Source-pinned, like responder-ui and il-learning-ui: these are wiring and
// WORDING facts a typecheck cannot see, and the wording is the part a client is
// held to. What has to stay true:
//   • one badge component, one sentence — three mounts, not three sentences
//   • a household's Email / Phone / Mobile fields are not editable anywhere
//   • the client is told WHY, in words, not left with three empty boxes
//   • New Search asks what we are looking for before anything else, and only
//     B2B can be picked — the other two say when they arrive
//   • the B2C card states the hard rule: mail only, and the system cannot store
//     an email address or a phone number for those records
//   • nothing on these surfaces says "tenant" (feedback_no_tenant_in_ui)

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");
const read = (rel) => readFileSync(path.join(SRC, rel), "utf8");

const badge = read("components/spark/MailOnlyBadge.tsx");
const leadModal = read("components/spark/SparkLeadModal.tsx");
const contactModal = read("components/spark/SparkContactModal.tsx");
const newSearch = read("pages/spark/SparkLeadGenNewPage.tsx");

/** Everything a person can read: JSX text and quoted copy, minus the code. */
function visibleText(src) {
  return src
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/className="[^"]*"/g, " ")
    .replace(/import[^;]*;/g, " ");
}

test("there is ONE badge component and ONE sentence", () => {
  assert.match(badge, /export const MAIL_ONLY_SENTENCE/);
  assert.match(badge, /no email or text, ever/i);
  assert.match(badge, /cannot store an email address or phone number/i,
    "the client has to be told the system CANNOT hold it — not that we would rather it did not");
  assert.match(badge, /export function MailOnlyBadge/);
  assert.match(badge, /export function isMailOnly/,
    "one reader for the one column, so a typo cannot unlock the fields on one screen only");
});

test("the lead modal mounts the badge, once, above the tabs", () => {
  assert.match(leadModal, /import \{ MailOnlyBadge, isMailOnly \} from "\.\/MailOnlyBadge"/);
  assert.match(leadModal, /\{lead && isMailOnly\(lead\.contact_policy\) && <MailOnlyBadge className="mb-3" \/>\}/);
  assert.equal((leadModal.match(/<MailOnlyBadge/g) || []).length, 1,
    "one mount — this modal belongs to another builder this week");
  assert.match(leadModal, /contact_policy\?: string \| null;/);
});

test("a household's contact channels cannot be edited in the contact modal", () => {
  assert.match(contactModal, /import \{ MailOnlyBadge, MAIL_ONLY_SHORT, isMailOnly \} from "\.\/MailOnlyBadge"/);
  assert.match(contactModal, /\{isMailOnly\(contact\.contact_policy\) && <MailOnlyBadge \/>\}/);
  // Every one of the three channel columns the CHECK constraint covers.
  for (const label of ["Email", "Phone", "Mobile \\(can receive texts\\)"]) {
    const field = contactModal.slice(contactModal.indexOf(`label="${label.replace(/\\/g, "")}"`));
    assert.match(field.slice(0, 400), /locked=\{isMailOnly\(contact\.contact_policy\)\}/,
      `${label} must be locked for a household`);
  }
  // Locked means the input is not rendered at all — a disabled box you can
  // still paste into is a trap, and the reason takes its place.
  const fieldFn = contactModal.slice(contactModal.indexOf("function Field({"));
  assert.match(fieldFn, /if \(locked\) \{[\s\S]{0,400}lockedNote \|\| MAIL_ONLY_SHORT/);
  assert.match(fieldFn, /<Lock className/);
  // And the save payload never carries a channel back, however stale the draft.
  assert.match(contactModal, /if \(isMailOnly\(contact\?\.contact_policy\)\) \{\s*\n\s*delete payload\.email; delete payload\.phone; delete payload\.mobile_phone;/);
});

// ── B19 (2026-09-07) — the lock moved to the SERVER ─────────────────────────
// B18 pinned "only B2B can be picked" against a hardcoded list in the
// component. B19 built the household form behind the card, so the same
// invariant now has to be pinned one level up: the availability of B2C comes
// from `GET /api/v1/leadgen/models` (B2C_SEARCH_ENABLED on LUMEN), the page's
// FALLBACK is locked, and the form does not mount unless the server says yes.
// A hardcoded list here would be a page that still says October in December —
// and, worse, a locked card over a switched-on backend.

test("New Search asks what we are looking for, and the chooser is server-driven", () => {
  assert.match(newSearch, /type SearchModel = SearchModelKey/);
  assert.match(newSearch, /const \[model, setModel\] = useState<SearchModel>\("b2b"\)/);
  assert.match(newSearch, /<ModelChooser value=\{model\} onChange=\{setModel\} models=\{models\} \/>/);
  assert.match(newSearch, /useState<SearchModelRow\[\]>\(FALLBACK_MODELS\)/,
    "the safe default for a switch is off: a card that flashes unlocked and then locks got somebody's hopes up");
  assert.match(newSearch, /get<\{ data: \{ models: SearchModelRow\[\] \} \}>\("\/api\/v1\/leadgen\/models"\)/);
  // The chooser must actually refuse the click, not merely look faded.
  const chooser = newSearch.slice(newSearch.indexOf("function ModelChooser"), newSearch.indexOf("interface FormState"));
  assert.match(chooser, /disabled=\{!m\.available\}/);
  assert.match(chooser, /onClick=\{\(\) => m\.available && onChange\(m\.key\)\}/);
  // No hardcoded card list survives in the component.
  assert.equal(newSearch.includes("const SEARCH_MODELS"), false,
    "the model list lives on the server now; a second copy here is the one that goes stale");
});

test("the B2C card states the rule in the client's own words, and it is locked by default", () => {
  const fallback = readFileSync(path.join(SRC, "lib/b2cSearch.ts"), "utf8");
  const cards = fallback.slice(fallback.indexOf("FALLBACK_MODELS"), fallback.indexOf("export const B2C_RULE"));
  assert.match(cards, /key: "b2b",[\s\S]{0,400}available: true/);
  assert.match(cards, /key: "b2c_mail",[\s\S]{0,500}available: false/);
  assert.match(cards, /key: "blended",[\s\S]{0,400}available: false/);
  assert.match(cards, /Coming in October/);
  const b2c = cards.slice(cards.indexOf('key: "b2c_mail"'), cards.indexOf('key: "blended"'));
  assert.match(b2c, /We find households, you reach them by mail/);
  assert.match(b2c, /no email or text, ever/);
  assert.match(b2c, /the system cannot store them/);
});

test("the household form mounts only when the SERVER says B2C is available", () => {
  assert.match(newSearch, /\{model === "b2c_mail" && \(/);
  assert.match(newSearch, /<B2cHouseholdForm/);
  // …and `model` can only BE "b2c_mail" if the server said so: an unavailable
  // model is refused by the chooser and reset by resolveModel.
  assert.match(newSearch, /setModel\(\(cur\) => resolveModel\(rows, cur\)\)/);

  const lib = readFileSync(path.join(SRC, "lib/b2cSearch.ts"), "utf8");
  assert.match(lib, /export function resolveModel[\s\S]{0,300}isModelAvailable\(models, wanted\) \? wanted : "b2b"/);
});

test("the trigger names come from the server, never from a list typed here", () => {
  // The vendor filter set is a contract nobody has signed. The FORM renders
  // whatever /leadgen/b2c/triggers returns; a hardcoded copy in the Portal
  // would be a fabricated catalog with a second place to be wrong.
  const form = readFileSync(path.join(SRC, "components/spark/B2cHouseholdForm.tsx"), "utf8");
  assert.match(form, /get<\{ data: \{ triggers: TriggerRow\[\] \} \}>\("\/api\/v1\/leadgen\/b2c\/triggers"\)/);
  assert.equal(/"new_mover"|"home_age"|"permit_filed"/.test(form), false,
    "the trigger keys belong to the server's taxonomy, not to this component");
});

test("the household form says the rule before anything is filled in, and never invents a price", () => {
  const form = readFileSync(path.join(SRC, "components/spark/B2cHouseholdForm.tsx"), "utf8");
  const lib = readFileSync(path.join(SRC, "lib/b2cSearch.ts"), "utf8");
  assert.match(form, /\{B2C_RULE\}/);
  assert.match(lib, /Households are direct mail only[\s\S]{0,200}never store an email address or a phone number/);
  assert.match(form, /price_sentence \?\? "Pricing for household records is not set yet/,
    "$0.00 is a price, and the wrong one");
});

test("none of these surfaces says 'tenant' to a human", () => {
  for (const [name, src] of [["badge", badge], ["contact modal", contactModal], ["new search", newSearch]]) {
    const words = visibleText(src).replace(/\{\{[^}]*\}\}/g, " ");
    assert.equal(/>[^<]*\btenant\b/i.test(words), false, `${name} shows the word "tenant"`);
  }
});
