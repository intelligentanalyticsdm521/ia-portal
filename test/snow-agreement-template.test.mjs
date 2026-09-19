// test/snow-agreement-template.test.mjs — the commercial snow & ice agreement,
// the shipped template that replaced "Seasonal service agreement" (D-164).
//
// WHAT IT IS GUARDING. A client's ten-section draft became a template, and the
// three ways a template can be wrong are all here:
//
//   1. IT NAMES SOMEBODY. A template is shipped to every business on the
//      platform. A word traced from the client whose draft this came from is a
//      leak, and the guard is BOTH halves: the denylist that says which words
//      must be absent, AND presence assertions that say the general words the
//      denylist would otherwise be satisfied by an empty file for.
//   2. IT SHIPS A BLANK. The 2026-09-16 user test failed because the author had
//      to retype four clauses by hand. Every clause here ships as words; every
//      per-job blank is a MERGE FIELD with a box in the Details group, and
//      nothing prints as `{{ }}` on the customer's copy.
//   3. IT ASKS FOR A PART NOTHING PAINTS. The canvas is one of three painters —
//      the customer's page and the PDF are the others, in oliver-api — so a
//      widget kind no shipped document has used before is a page that comes out
//      of the printer with a hole in it.
//
// MUTATION CHECKS — each made red on purpose, then put back. See the build's
// report for the exact four.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// THE ONE HOME FOR THE SPELLINGS. This file used to carry a copy of the client
// names, which meant a client's name was typed into the repository twice in
// order to forbid it once. It is imported, and a test below reads THIS file off
// disk and fails if any of them is ever typed back into it.
import { CLIENT_NAMES } from "./client-names.mjs";
import { deserialise, serialise, walkWidgets, sectionNumbers } from "../src/builder/model.ts";
import { makeContext, renderDocument, RENDERED_KINDS } from "../src/builder/render.ts";
import { tokensIn, BUILTIN_TAGS } from "../src/builder/merge.ts";
import {
  SHIPPED_TEMPLATES, PREMADE_SECTIONS, templateByKey,
  PER_EVENT_AMOUNT, PER_EVENT_SENTENCE, pricedOnOneBasis, pricingBasisOf,
} from "../src/builder/templates.ts";
import { WIDGETS_BY_KIND } from "../src/builder/registry.ts";
import { SAMPLE_MERGE } from "../src/builder/templateLibraryModel.ts";
import {
  bindPlansToLocation, blankTokens, blanksRefusal, mergeValues, packDetail, plainLabel,
  tokenHelp, tokensUsedBy,
} from "../src/builder/proposal/documentDetails.ts";
import { priceLinePropsFromCatalogue, priceLineUnitNote } from "../src/builder/widgets/priceLine.ts";

/** The cases both repos run, so the one rule cannot grow two answers. */
const BASIS_CASES = JSON.parse(
  readFileSync(new URL("./fixtures/pricing-basis-cases.json", import.meta.url), "utf8"));

/** The two screens that must obey the rule as well as the paper does. */
const BUILDER = readFileSync(
  new URL("../src/builder/proposal/ProposalBuilder.tsx", import.meta.url), "utf8");
const LIST = readFileSync(
  new URL("../src/pages/oliver/OliverProposalsPage.tsx", import.meta.url), "utf8");
const UNIFIED = readFileSync(
  new URL("../src/pages/oliver/OliverQuotesProposalsPage.tsx", import.meta.url), "utf8");

const KEY = "service_agreement";
const entry = () => templateByKey(KEY);
const doc = () => entry().build();

/** Every string anywhere in the built document. */
function everyString(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => everyString(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => everyString(v, out));
  return out;
}

const allWords = () => [
  entry().name, entry().purpose, entry().useCase, entry().bestFor,
  ...entry().tags, ...everyString(doc()),
].join("\n");

/* ══════════════════════════════════════════════════════════════════════════
   1 · It is in the library, and it is one template
   ══════════════════════════════════════════════════════════════════════════ */

describe("the agreement is ONE shipped template, on the key a saved draft names", () => {
  test("it is there, under the key the old seasonal agreement used", () => {
    assert.ok(entry(), "service_agreement is not in the catalogue");
    assert.equal(entry().name, "Commercial snow & ice agreement");
    assert.equal(entry().purpose, "Recurring service agreement");
    assert.deepEqual(entry().businessTypes, ["Service industry"]);
  });

  test("the four words Brandon asked for are the tags a person would type", () => {
    for (const tag of ["snow", "ice", "commercial", "seasonal"]) {
      assert.ok(entry().tags.includes(tag), `the template does not carry the tag "${tag}"`);
    }
  });

  test("it says what it is FOR and who for, and never what it looks like", () => {
    assert.ok(entry().useCase.length > 120, "the use case is too short to be a use case");
    assert.ok(entry().bestFor.length > 40, "there is no Best for line");
    assert.equal(entry().description, undefined, "it carries a look-and-feel description again");
    for (const look of ["dark band", "light header", "accent rule", "in the style"]) {
      assert.ok(!allWords().toLowerCase().includes(look),
        `the library describes this template by how it LOOKS: "${look}"`);
    }
  });

  test("there is no SECOND snow agreement beside it", () => {
    // D-146's rule, and the brief's: one template, not two near-duplicates.
    const snowy = SHIPPED_TEMPLATES.filter((t) =>
      /(^| )(snow|plow|de-?ic|gritting)/i.test(`${t.name} ${t.useCase}`));
    assert.deepEqual(snowy.map((t) => t.key), [KEY],
      `${snowy.length} templates are about snow`);
  });

  test("the old seasonal agreement is GONE, not hidden beside it", () => {
    assert.ok(!SHIPPED_TEMPLATES.some((t) => t.name === "Seasonal service agreement"),
      "replace means delete");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2 · No client is named, and the general words ARE there
   ══════════════════════════════════════════════════════════════════════════ */

describe("no client of ours is anywhere near this template", () => {
  test("none of the names appears in the entry or in the built document", () => {
    const words = allWords();
    assert.ok(CLIENT_NAMES.length > 4, "the shared denylist came back empty");
    for (const name of CLIENT_NAMES) {
      assert.ok(!words.toLowerCase().includes(name.toLowerCase()),
        `the template says "${name}"`);
    }
  });

  test("…and THIS FILE spells none of them either — the denylist has one home", () => {
    /* THE GREP, RUN OVER THIS FILE'S OWN SOURCE. A copy of the list here would
       be a client's name typed into the repository twice in order to forbid it
       once, which is the defect the list exists to prevent. The fixture
       business used further down is an invented one for the same reason. */
    const source = readFileSync(fileURLToPath(import.meta.url), "utf8").toLowerCase();
    for (const name of CLIENT_NAMES) {
      assert.ok(!source.includes(name.toLowerCase()),
        `this file spells "${name}" — import the denylist, never copy it`);
    }
  });

  test("the contractor is the MERGE FIELD, never a name typed into the words", () => {
    const strings = everyString(doc()).join("\n");
    assert.ok(strings.includes("{{business.name}}"),
      "nothing on the agreement says who the contractor is");
    assert.ok(!/\bLLC\b/.test(strings), "a legal entity is typed into the template's words");
    assert.ok(!/\bContractor\b/.test(strings),
      "the template still says \"Contractor\" — the business's own name fills in instead");
  });

  // PRESENCE. A denylist alone is satisfied by an empty file; these are the
  // general words that have to survive the de-clienting.
  test("…and the general trade words the agreement is MADE of are all there", () => {
    const strings = everyString(doc()).join("\n").toLowerCase();
    for (const word of [
      "trigger depth", "push", "final cleanup", "snow storage", "deicing",
      "sidewalk", "snow hauling", "drifting", "freezing rain",
      "parked vehicles", "hidden hazards", "minimum charge", "storm example",
      "pre-season site walk", "service term",
    ]) {
      assert.ok(strings.includes(word), `the agreement no longer says "${word}"`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   3 · The ten sections, in the client's order, numbered by the engine
   ══════════════════════════════════════════════════════════════════════════ */

describe("the ten sections", () => {
  const TEN = [
    "Agreement at a glance",
    "Scope of services",
    "Ice, deicing and optional services",
    "Severe weather and special conditions",
    "Property responsibilities",
    "Pricing schedule",
    "Billing and payment",
    "General terms",
    "Acceptance",
    "Property service plan",
  ];

  test("all ten are there, in order, and each is numbered", () => {
    const d = doc();
    const numbers = sectionNumbers(d);
    const numbered = d.sections.filter((s) => s.numbered && s.visibility === "customer");
    assert.deepEqual(numbered.map((s) => s.label), TEN);
    assert.deepEqual(numbered.map((s) => numbers[s.id]),
      ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"]);
  });

  test("the cover and the small print are NOT numbered — the ten are the agreement", () => {
    const d = doc();
    assert.equal(d.sections[0].numbered, false, "the cover took number 01");
    assert.equal(d.sections.at(-1).numbered, false, "the small print took a number");
  });

  test("the property service plan starts a new printed page", () => {
    assert.equal(doc().sections.find((s) => s.label === "Property service plan").pageBreakBefore, true);
  });

  test("the numbers are the ENGINE's, so deleting a section renumbers the rest", () => {
    const d = doc();
    d.sections = d.sections.filter((s) => s.label !== "Scope of services");
    const numbers = sectionNumbers(d);
    assert.equal(numbers[d.sections.find((s) => s.label === "Pricing schedule").id], "05");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   4 · It deserialises, and the engine can draw every part of it
   ══════════════════════════════════════════════════════════════════════════ */

describe("the document survives the round trip and the engine's own checks", () => {
  test("serialise → deserialise is lossless", () => {
    const before = doc();
    assert.equal(serialise(deserialise(serialise(before))), serialise(before));
  });

  test("the trigger depth survives the round trip, because it lives in settings.merge", () => {
    const back = deserialise(serialise(doc()));
    assert.deepEqual(back.settings.merge, { snow_trigger: "2 inches" });
    assert.deepEqual(mergeValues(back), { snow_trigger: "2 inches" });
  });

  test("every widget on it is a kind the renderer DRAWS", () => {
    for (const { widget } of walkWidgets(doc())) {
      assert.ok(RENDERED_KINDS.includes(widget.kind),
        `the agreement places a "${widget.kind}", which nothing draws`);
    }
  });

  test("…and no kind the other three painters have never seen", () => {
    /* The customer's page and the PDF are painted in oliver-api
       (lib/documentModel.js flatten, lib/proposalPdf.js). This template is a
       CLIENT DOCUMENT and must not need a change over there, so it may only
       use kinds that shipped documents already use. */
    const known = new Set();
    for (const t of SHIPPED_TEMPLATES) {
      if (t.key === KEY) continue;
      for (const { widget } of walkWidgets(t.build())) known.add(widget.kind);
    }
    for (const p of PREMADE_SECTIONS) {
      for (const { widget } of walkWidgets({ v: 2, settings: { style: "plain" }, sections: [p.build()] })) {
        known.add(widget.kind);
      }
    }
    for (const { widget } of walkWidgets(doc())) {
      assert.ok(known.has(widget.kind),
        `the agreement introduces "${widget.kind}", which the PDF mirror has never painted`);
    }
  });

  test("every section holds exactly one column, so nothing is stranded off the page", () => {
    for (const s of doc().sections) {
      assert.equal(s.layout, 1, `${s.label} claims ${s.layout} columns`);
      assert.equal(s.columns.length, 1);
      assert.ok(s.columns[0].widgets.length > 0, `${s.label} is empty`);
    }
  });

  test("every widget has its own id, so every one of them can be clicked", () => {
    const ids = walkWidgets(doc()).map((x) => x.widget.id);
    assert.equal(new Set(ids).size, ids.length, "two widgets share an id");
    assert.ok(ids.length > 70, `only ${ids.length} widgets — the clauses are a lump again`);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   5 · Every blank is a Details box, and nothing prints as {{ }}
   ══════════════════════════════════════════════════════════════════════════ */

describe("the blanks", () => {
  /** What the customer pick answers, exactly as the adapter hands it in. */
  const AUTO = {
    "customer.name": "Harborview Property Group",
    "customer.legal_name": "Harborview Property Group LLC",
    "customer.contact_name": "Dana Whitfield",
    "property.name": "Harborview — North lot",
    "property.address": "1400 Harbour Way, Riverton",
    "business.name": "Northwind Lawn & Snow",
    "contract.start_date": "1 November",
    "contract.end_date": "15 April",
  };

  test("the document asks for exactly the details the brief named", () => {
    // 11.13: there is no reconciled ROW LIST any more - the Details group is
    // deleted. The question the brief really asked is "what is still blank on
    // this page once the customer is picked?", which is the ONE blank rule.
    assert.deepEqual(blankTokens(doc(), { ...AUTO, snow_trigger: "2 inches" }).sort(),
      ["minimum_charge", "payment_terms", "severe_event_threshold"]);
  });

  test("every one of them has PLAIN WORDS and a placeholder, never a raw token", () => {
    for (const token of blankTokens(doc(), AUTO)) {
      const label = plainLabel(token);
      assert.notEqual(label, token, `${token} is shown to the author as itself`);
      assert.ok(!/[{}_]/.test(label), `"${label}" is not plain words`);
      // `tokenHelp` is what the on-page box uses as its placeholder.
      const help = tokenHelp(token);
      if (packDetail(token)) {
        assert.ok(help.length > 15, `${token} has no placeholder telling the author what goes in it`);
      }
    }
  });

  test("the service term is answered by the customer pick, not typed twice", () => {
    const tokens = blankTokens(doc(), AUTO);
    assert.ok(!tokens.includes("contract.start_date"));
    assert.ok(!tokens.includes("contract.end_date"));
    // ...and with nothing picked, Send asks for them like everything else.
    const cold = blankTokens(doc(), {});
    assert.ok(cold.includes("contract.start_date"));
    assert.ok(cold.includes("contract.end_date"));
    assert.equal(plainLabel("contract.start_date"), "Service term starts");
  });

  test("the trigger depth is already filled, so it is not one of the blanks", () => {
    assert.equal(mergeValues(doc()).snow_trigger, "2 inches");
    assert.ok(!blankTokens(doc(), { ...AUTO, ...mergeValues(doc()) }).includes("snow_trigger"));
  });

  test("every token the page uses can be named in plain words", () => {
    for (const token of tokensUsedBy(doc())) {
      const label = plainLabel(token);
      assert.notEqual(label, token, `${token} has no plain words anywhere`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   5b · Send refuses over ANY blank tag, at any depth (2026-09-18)
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * WHAT WENT WRONG. An agreement was SENT with both service-term dates empty,
 * and the cover printed two blank rules where the dates belong.
 *
 * The guard walked the top of each column — `for (section) for (column) for
 * (widget)` — and the cover's four key facts are a ROW, which is a container.
 * A container has children, not props, so the walk found no text in it and
 * reported nothing missing. The two term tags are the only tags that live
 * inside it, and they are BUILT-IN tags rather than a clause pack's, which is
 * why the pack blanks were all caught and these two were not.
 *
 * ONE RULE NOW: a tag on the document that resolves to nothing is a blank,
 * pack or built-in, at any depth. `blankTokens` is that rule and these tests
 * execute it.
 */
describe("Send will not go with a blank on the page", () => {
  /** Everything the page asks for EXCEPT the two service-term dates. */
  const ALL_BUT_TERM = {
    "customer.name": "Harborview Property Group",
    "customer.legal_name": "Harborview Property Group LLC",
    "customer.contact_name": "Dana Whitfield",
    "property.name": "Harborview — North lot",
    "property.address": "1400 Harbour Way, Riverton",
    "business.name": "Northwind Lawn & Snow",
    snow_trigger: "2 inches",
    severe_event_threshold: "8 inches",
    payment_terms: "30 days from the invoice date",
    minimum_charge: "$175",
  };
  const TERM = { "contract.start_date": "1 November 2026", "contract.end_date": "31 March 2027" };

  test("the term dates live inside a BOX — the walk the old guard never made", () => {
    // Pinned as a SHAPE, because this is what made the defect invisible: take
    // the container away and the old flat walk would have caught the dates.
    const cover = doc().sections[0].columns[0].widgets;
    /* D-165 — the cover is TWO boxes now: the header row (logo + title), then
       the four short answers. The dates are in the last one, and they are
       still inside a box, which is the shape this test exists to pin. */
    const boxes = cover.filter((n) => n.kind === "container");
    assert.ok(boxes.length, "the cover's key facts are no longer a box — re-read this test");
    const inside = JSON.stringify(boxes[boxes.length - 1].children);
    assert.ok(inside.includes("{{contract.start_date}}"), "the term is not in the box any more");
    assert.ok(inside.includes("{{contract.end_date}}"));
  });

  test("with the term dates empty the guard NAMES them and the send is refused", () => {
    const blanks = blankTokens(doc(), ALL_BUT_TERM);
    assert.deepEqual(blanks, ["contract.start_date", "contract.end_date"]);
    // `blanks.length` is what Send refuses on, so a non-empty list IS the
    // refusal. And the words: plain, never a raw token.
    const words = blanksRefusal(blanks);
    assert.match(words, /Service term starts/);
    assert.match(words, /Service term ends/);
    assert.ok(!/contract\.|[{}_]/.test(words), `the refusal is not plain words: ${words}`);
  });

  test("filling the term dates in lets it go — the wanted output APPEARS", () => {
    assert.deepEqual(blankTokens(doc(), { ...ALL_BUT_TERM, ...TERM }), []);
  });

  test("a pack blank and a built-in blank are the SAME rule, in one list", () => {
    const { snow_trigger, ...noTrigger } = ALL_BUT_TERM;
    assert.deepEqual(blankTokens(doc(), noTrigger),
      ["contract.start_date", "contract.end_date", "snow_trigger"]);
  });

  test("a tag that is NOT on the document is never asked for", () => {
    // Nothing filled at all: the list is still only what the page uses. A gate
    // code and a valid-until date are perfectly good built-in tags, and this
    // agreement does not mention either, so Send must not ask for them.
    const blanks = blankTokens(doc(), {});
    for (const absent of ["property.gate_code", "contract.valid_until", "signature_date", "business.phone"]) {
      assert.ok(BUILTIN_TAGS.some((t) => t.token === absent), `${absent} is not a built-in any more`);
      assert.ok(!blanks.includes(absent), `Send is asking for ${absent}, which is not on the page`);
    }
    assert.ok(blanks.includes("contract.start_date"), "the tags that ARE on the page went missing");
  });

  test("both Send buttons refuse in the SAME sentence", () => {
    // One writer for the words. Two copies of this string is how a first
    // draft and a revision come to say different things about the same blank.
    const uses = BUILDER.match(/blanksRefusal\(/g) || [];
    assert.equal(uses.length, 2, "a Send refusal is building its own sentence again");
    assert.ok(!/still blank \(\$\{list\}\)/.test(BUILDER), "the sentence is written out inline again");
  });

  test("one blank reads as one, not as “1 details”", () => {
    assert.match(blanksRefusal(["contract.start_date"]), /^1 detail is still blank/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   6 · It renders in all three modes
   ══════════════════════════════════════════════════════════════════════════ */

describe("the three render modes", () => {
  const ctxFor = (mode, merge) => makeContext(doc(), {
    mode, merge,
    business: { name: "Northwind Lawn & Snow", contactLine: "office@northwind.example" },
  });

  test("view mode draws the whole agreement and leaves NO raw merge tag", () => {
    const html = renderDocument(doc(), ctxFor("view", SAMPLE_MERGE));
    assert.ok(html.length > 8000, "the agreement rendered to almost nothing");
    assert.deepEqual([...new Set([...html.matchAll(/\{\{[^}]*\}\}/g)].map((m) => m[0]))], [],
      "a raw merge tag reached the customer's copy");
    // The words a reader must find.
    for (const words of ["Pricing schedule", "Storm example", "Acceptance", "Property service plan"]) {
      assert.ok(html.includes(words), `the rendered agreement does not say "${words}"`);
    }
  });

  test("a token with nothing behind it prints a blank line, not braces", () => {
    const html = renderDocument(doc(), ctxFor("view", {}));
    assert.ok(html.includes("__________"), "an unfilled blank printed as something else");
    assert.ok(!html.includes("{{"), "an unfilled blank printed as braces");
  });

  test("edit mode keeps the tokens visible, so the author can see what is unfilled", () => {
    const html = renderDocument(doc(), ctxFor("edit", {}));
    assert.ok(html.includes("severe_event_threshold"),
      "the author cannot see which blank is which");
  });

  test("send mode leaves every token exactly as written", () => {
    const html = renderDocument(doc(), ctxFor("send", SAMPLE_MERGE));
    assert.ok(html.includes("{{customer.name}}"),
      "send mode filled a token that the server resolves per recipient");
  });

  test("the library card renders a real picture of it", () => {
    const preview = entry().build && templateByKey(KEY);
    assert.ok(preview, "the template is not in the library");
    const html = renderDocument(doc(), ctxFor("view", SAMPLE_MERGE));
    assert.ok(html.includes("Commercial Snow &amp; Ice Management Agreement")
      || html.includes("Commercial Snow & Ice Management Agreement"),
      "the cover title is not on the page the card draws");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   7 · The money is per event, and says so
   ══════════════════════════════════════════════════════════════════════════ */

describe("the pricing schedule", () => {
  const lines = () => walkWidgets(doc()).map((x) => x.widget).filter((w) => w.kind === "price_line");

  test("eight priced lines, each one catalogue-ready", () => {
    // Six, plus the two rows of the draft that were missing: the additional
    // push and the severe / extraordinary event.
    assert.equal(lines().length, 8);
    // `price_line` IS the catalogue-bound money widget: its registry entry
    // carries the shared Binding section, so the picker opens from every one
    // of these. What a shipped template must NOT do is arrive already pointing
    // at somebody's catalogue row.
    assert.equal(WIDGETS_BY_KIND.price_line.defaults._ia_source, "oliver:catalogue");
    for (const w of lines()) {
      assert.ok(!w.props._ia_selection,
        `"${w.props.name}" ships bound to a catalogue row of somebody else's`);
    }
  });

  test("every amount says what it is charged PER, and none of them agree", () => {
    const cadences = lines().map((w) => String(w.props.cadence));
    for (const c of cadences) assert.ok(c.trim(), "a priced line does not say what it is charged per");
    assert.ok(new Set(cadences).size > 1,
      "every rate on one basis — then the document SHOULD carry a total");
  });

  /* ── The three rows of the draft that had gone missing ─────────────────── */

  test("the additional push is its OWN line, blank, with words telling the author what to type", () => {
    const line = lines().find((w) => /additional/i.test(String(w.props.name)));
    assert.ok(line, "the draft's second pricing row is not on the schedule");
    assert.match(String(line.props.name), /each additional trigger/i);
    assert.equal(line.props.unit_price, 0, "a template invented what a second push costs");
    assert.equal(line.props.cadence, "per push");
    assert.match(String(line.props.help), /same as the plowing rate/i);
  });

  test("the severe event is its OWN line, blank, and names the threshold the Details box fills", () => {
    const line = lines().find((w) => /severe/i.test(String(w.props.name)));
    assert.ok(line, "the draft's severe / extraordinary event row is not on the schedule");
    assert.match(String(line.props.name), /\{\{severe_event_threshold\}\}/);
    assert.match(String(line.props.name), /or more, or special conditions/i);
    assert.equal(line.props.unit_price, 0);
    assert.ok(String(line.props.help).trim().length > 20);
  });

  test("snow hauling is a QUOTED row — no amount, and the words say so", () => {
    const pricing = doc().sections.find((s) => s.label === "Pricing schedule");
    /* D-165 — a key fact is a LINE OF TEXT with its label in bold. The row is
       still a row and still carries no amount, which is the whole point of it. */
    const lines2 = pricing.columns[0].widgets.filter((w) => w.kind === "paragraph");
    const haul = lines2.find((w) => /hauling/i.test(String(w.props.text)));
    assert.ok(haul, "the draft's snow-hauling row is not on the schedule");
    assert.match(String(haul.props.text), /\*\*Snow hauling — if required\*\* Quoted separately$/);
    // …and it is NOT a priced line, so it adds no basis and no $0.00.
    assert.ok(!lines().some((w) => /hauling/i.test(String(w.props.name))),
      "hauling is a priced line showing $0.00, which reads as free");
  });

  test("the prose does not promise the second push costs the same", () => {
    const strings = everyString(doc()).join("\n");
    assert.ok(!/another push at the same rate/i.test(strings),
      "the page promises a rate the pricing schedule no longer has to honour");
    assert.match(strings, /additional-push rate/,
      "nothing sends the reader to the line that prices a second push");
  });

  test("the at-a-glance table answers its third column on EVERY row", () => {
    /* D-165 — the glance table never was a rate card: three columns of WORDS
       and no figure that feeds a total, so it is the plain **Table**. Its
       columns are a list of headings and its rows are arrays of cells. */
    const glance = doc().sections.find((s) => s.label === "Agreement at a glance")
      .columns[0].widgets.find((w) => w.kind === "data_table");
    assert.deepEqual(glance.props.columns, ["Service", "What brings us out", "How it is priced"]);
    for (const row of glance.props.rows) {
      assert.ok(String(row[2] || "").trim(),
        `"${row[0]}" has an empty "How it is priced" cell, which reads as free`);
    }
    // The two rows with no one rate to state point at the page that has it.
    const pointers = glance.props.rows.filter((r) => r[2] === "See the pricing schedule");
    assert.equal(pointers.length, 2);
    // …and the glance lists the SAME services the schedule prices.
    for (const words of ["Additional snow push", "Severe or extraordinary event"]) {
      assert.ok(glance.props.rows.some((r) => r[0] === words),
        `the glance table does not mention "${words}"`);
    }
  });

  test("the service term prints ONCE on the cover", () => {
    const cover = doc().sections[0];
    const strings = everyString(cover).join("\n");
    const hits = (strings.match(/\{\{contract\.start_date\}\}/g) || []).length;
    assert.equal(hits, 1, "the same dates are printed twice on one cover");
  });

  test("the lot services carry the paved area as their quantity", () => {
    const plow = lines()[0];
    assert.match(String(plow.props.name), /plow/i);
    assert.equal(plow.props.quantity, 12);
    assert.equal(plow.props.cadence, "per push");
  });

  test("there is no total anywhere — a season figure would be true of no invoice", () => {
    const kinds = walkWidgets(doc()).map((x) => x.widget.kind);
    assert.ok(!kinds.includes("totals"));
  });

  test("and the page SAYS the prices are per event", () => {
    const strings = everyString(doc()).join("\n").toLowerCase();
    assert.ok(strings.includes("priced per event"),
      "nothing on the page explains why there is no total");
    assert.ok(strings.includes("thousands of square feet"),
      "nothing on the page says what the quantity on a line means");
  });

  test("the quantity is the ONLY place the paved area is written", () => {
    // A "lot size" detail box beside a quantity is one number in two carriers,
    // which is the defect documentDetails.ts exists to end.
    const tokens = tokensUsedBy(doc());
    for (const t of tokens) {
      assert.ok(!/lot.?size|paved.?area|square.?feet/i.test(t),
        `"${t}" is a second home for a number the priced line already holds`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   8 · "How many" is sometimes a MEASUREMENT — and the line says which
   ══════════════════════════════════════════════════════════════════════════ */

describe("a quantity can never be read as a count when the catalogue meant a measurement", () => {
  /** What the picker hands over for "Lot plowing — Per 1,000 sq ft, $18". */
  const PICK = {
    name: "Lot plowing — Per 1,000 sq ft",
    description: "Mechanical clearing.",
    features: ["Trigger depth 2 inches"],
    unit_price: 18,
    offering_id: "off-1",
    price_id: "pr-1",
    cadence: "per push",
    label: "Per 1,000 sq ft",
  };

  test("loading a catalogue price RESETS How many to 1", () => {
    // THE DEFECT: the pick wrote name, price and cadence and left whatever was
    // in the quantity box. A line that said 165 became 165 whole lots.
    const props = priceLinePropsFromCatalogue(PICK);
    assert.equal(props.quantity, 1, "a catalogue pick kept the quantity from the last one");
    assert.equal(props.unit_price, 18);
    assert.equal(props.cadence, "per push");
  });

  test("…and brings the price's own unit label with it", () => {
    assert.equal(priceLinePropsFromCatalogue(PICK).unit_label, "Per 1,000 sq ft");
    assert.equal(priceLinePropsFromCatalogue({ ...PICK, label: "" }).unit_label, "");
  });

  test("the line beside the rate prints how many AND what one of them is", () => {
    const m = (n) => `$${n.toFixed(2)}`;
    assert.equal(
      priceLineUnitNote({ quantity: 12, unitPrice: 18, unitLabel: "Per 1,000 sq ft" }, m),
      "12 × $18.00 · Per 1,000 sq ft");
    // Quantity 1 still names the unit — that is the whole point.
    assert.equal(priceLineUnitNote({ quantity: 1, unitPrice: 625, unitLabel: "Per push" }, m), "Per push");
    // A plain count with no catalogue label reads as it always did.
    assert.equal(priceLineUnitNote({ quantity: 14, unitPrice: 625, unitLabel: "" }, m), "14 × $625.00");
    assert.equal(priceLineUnitNote({ quantity: 1, unitPrice: 625, unitLabel: "" }, m), "");
  });

  test("the CANVAS prints it — the real renderer, on a real document", () => {
    const d = doc();
    const line = walkWidgets(d).map((x) => x.widget).find((w) => w.kind === "price_line");
    line.props.unit_label = "Per 1,000 sq ft";
    const html = renderDocument(d, makeContext(d, {
      mode: "view", merge: SAMPLE_MERGE,
      business: { name: "Northwind Lawn & Snow", contactLine: "office@northwind.example" },
    }));
    assert.ok(html.includes("Per 1,000 sq ft"),
      "the unit the rate is charged on is not on the page anybody reads");
    assert.ok(html.includes("12 × "), "the quantity is not beside the unit");
  });

  test("the widget DECLARES the field, so it is not a prop nothing knows about", () => {
    assert.equal(WIDGETS_BY_KIND.price_line.defaults.unit_label, "");
    assert.ok(WIDGETS_BY_KIND.price_line.controls.some((c) => c.key === "unit_label"),
      "there is no way for an author to fix the unit label by hand");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   9 · ONE rule decides whether this document has a total at all
   ══════════════════════════════════════════════════════════════════════════ */

describe("priced on one basis, or not at all", () => {
  test("the snow & ice agreement is per event, and every other template is not", () => {
    assert.equal(pricingBasisOf(doc()), "per_event");
    for (const t of SHIPPED_TEMPLATES) {
      if (t.key === KEY) continue;
      assert.equal(pricingBasisOf(t.build()), null,
        `"${t.name}" lost its total — its lines are charged on different bases`);
    }
  });

  test("the shared fixture — the SAME answers oliver-api gives", () => {
    // Both repos run these cases. A rule that lives in two files and is tested
    // in one is a rule with two answers.
    assert.ok(BASIS_CASES.cases.length >= 6);
    for (const c of BASIS_CASES.cases) {
      assert.equal(pricingBasisOf(c.doc), c.basis, `${c.name}: wrong basis`);
      assert.equal(pricedOnOneBasis(c.doc), c.basis == null, `${c.name}: wrong one-basis answer`);
    }
  });

  test("the sentence the builder's pane prints instead of a figure", () => {
    assert.equal(PER_EVENT_SENTENCE, "Priced per event — no single total");
    assert.equal(PER_EVENT_AMOUNT, "Per event");
    // …and the pane reads the rule rather than a second copy of it.
    assert.ok(BUILDER.includes("pricingBasisOf(doc)"),
      "the builder works out for itself whether the document totals");
    assert.ok(/perEventBasis\s*\?\s*PER_EVENT_SENTENCE/.test(BUILDER),
      "the running total in the pane still prints a figure for a per-event document");
  });

  test("the Quotes & Proposals row prints the word, not a sum", () => {
    // BOTH lists. The unified Quotes & Proposals page is the one the owner
    // actually opens; `OliverProposalsPage` still serves /oliver_proposals and
    // its detail drawer, and a rule obeyed by one of two lists is a rule the
    // owner sees broken half the time.
    for (const [name, src] of [["Quotes & Proposals", UNIFIED], ["Proposals", LIST]]) {
      assert.ok(src.includes('pricing_basis === "per_event"'),
        `the ${name} list does not know about the rule`);
      assert.ok(src.includes("Per event"), `the ${name} amount column has nothing to print instead`);
      assert.ok(src.includes('data-per-event="1"'), `the ${name} list cannot be driven for it`);
    }
    // …and a per-event agreement is left out of the pipeline headline, rather
    // than adding its false sum there instead.
    assert.ok(/pricing_basis === "per_event" \? 0 :/.test(UNIFIED),
      "the open/accepted value still adds a figure true of no invoice");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   10 · The Details group, and the crew's own sheet
   ══════════════════════════════════════════════════════════════════════════ */

describe("what the author sees the moment the template loads", () => {
  test("a SHIPPED default is ON THE PAGE, not hidden behind a collapse", () => {
    /* D-164 asked that a default the template shipped not be folded away
       behind "1 filled". 11.13 answers it outright: there is no group to fold.
       The trigger depth is in `settings.merge`, the sentence on the page reads
       "2 inches" wherever it appears, and Send never asks for it. */
    assert.equal(mergeValues(doc()).snow_trigger, "2 inches");
    assert.ok(!blankTokens(doc(), mergeValues(doc())).includes("snow_trigger"));
  });

  test("the service term has a box even though it lives inside a ROW on the cover", () => {
    // The tokens are on `key_fact` widgets inside a container. Before the walk
    // read the tree they were invisible here, and the only reason they had
    // boxes at all was the title band repeating the same two dates.
    const cold = blankTokens(doc(), {});
    assert.ok(cold.includes("contract.start_date"), "the service term is never asked for");
    assert.ok(cold.includes("customer.name"), "a token inside a box is invisible to Send");
  });

  test("section 10 takes the location the DOCUMENT is about", () => {
    const before = doc();
    // D-165 — the plan's location is the Service Location widget's now.
    const plan = () => walkWidgets(before).map((x) => x.widget).find((w) => w.kind === "service_location");
    assert.equal(plan().props.locationId, "", "the template ships pointed at somebody's location");

    const after = bindPlansToLocation(before, "A1B2C3D4-0000-0000-0000-00000000BEEF");
    const bound = walkWidgets(after).map((x) => x.widget).find((w) => w.kind === "service_location");
    assert.equal(bound.props.locationId, "a1b2c3d4-0000-0000-0000-00000000beef",
      "the plan did not take the document's location, or did not lower-case it");

    // A plan the author pointed somewhere else is LEFT ALONE…
    const again = bindPlansToLocation(after, "ffffffff-0000-0000-0000-000000000000");
    assert.equal(again, after, "binding overwrote a location the author had chosen");
    // …and a document with nothing to do comes back by identity.
    assert.equal(bindPlansToLocation(before, ""), before);
  });

  test("the bound plan draws the property's name and address — lower-cased, like every other reader", () => {
    const d = bindPlansToLocation(doc(), "AAAA1111-2222-3333-4444-555566667777");
    const html = renderDocument(d, makeContext(d, {
      mode: "view", merge: SAMPLE_MERGE,
      business: { name: "Northwind Lawn & Snow", contactLine: "office@northwind.example" },
      locations: {
        "aaaa1111-2222-3333-4444-555566667777": {
          name: "North lot", address: "1400 Harbour Way", city: "Riverton", state: "IA", postalCode: "50309",
        },
      },
    }));
    assert.ok(html.includes("North lot"),
      "the plan is bound and still draws no property name — the id was not lower-cased");
  });
});
