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

import { deserialise, serialise, walkWidgets, sectionNumbers } from "../src/builder/model.ts";
import { makeContext, renderDocument, RENDERED_KINDS } from "../src/builder/render.ts";
import { tokensIn } from "../src/builder/merge.ts";
import { SHIPPED_TEMPLATES, PREMADE_SECTIONS, templateByKey } from "../src/builder/templates.ts";
import { WIDGETS_BY_KIND } from "../src/builder/registry.ts";
import { SAMPLE_MERGE } from "../src/builder/templateLibraryModel.ts";
import { plainLabel, reconcileDetails, readDetails, tokensUsedBy } from "../src/builder/proposal/documentDetails.ts";

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
  /* The five client names the library's own denylist carries, plus the owner
     name and the trading words from the draft this was built from. */
  const FORBIDDEN = [
    "Rolling In It", "RollingInIt", "Rolling in it",
    "Nathan", "Dannen", "MS Moments", "Top Maid", "Hestia", "Des Moines",
  ];

  test("none of the names appears in the entry or in the built document", () => {
    const words = allWords();
    for (const name of FORBIDDEN) {
      assert.ok(!words.toLowerCase().includes(name.toLowerCase()),
        `the template says "${name}"`);
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
    assert.deepEqual(readDetails(back).map((r) => [r.token, r.value]), [["snow_trigger", "2 inches"]]);
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
    "business.name": "Summit Lawn & Landscape",
    "contract.start_date": "1 November",
    "contract.end_date": "15 April",
  };

  test("the document asks for exactly the details the brief named", () => {
    const rows = reconcileDetails(doc(), AUTO);
    assert.deepEqual(rows.map((r) => r.token).sort(),
      ["minimum_charge", "payment_terms", "severe_event_threshold", "snow_trigger"]);
  });

  test("every one of them has PLAIN WORDS and a placeholder, never a raw token", () => {
    for (const row of reconcileDetails(doc(), AUTO)) {
      assert.notEqual(row.label, row.token, `${row.token} is shown to the author as itself`);
      assert.ok(!/[{}_]/.test(row.label), `"${row.label}" is not plain words`);
      // `help` is what the Details box uses as its placeholder.
      assert.ok(row.help && row.help.length > 15,
        `${row.token} has no placeholder telling the author what goes in it`);
    }
  });

  test("the service term is answered by the customer pick, not typed twice", () => {
    const tokens = reconcileDetails(doc(), AUTO).map((r) => r.token);
    assert.ok(!tokens.includes("contract.start_date"));
    assert.ok(!tokens.includes("contract.end_date"));
    // …and with nothing picked, they are boxes like everything else.
    const cold = reconcileDetails(doc(), {}).map((r) => r.token);
    assert.ok(cold.includes("contract.start_date"));
    assert.ok(cold.includes("contract.end_date"));
    assert.equal(plainLabel("contract.start_date"), "Service term starts");
  });

  test("the trigger depth is already filled, so it is not one of the blanks", () => {
    const rows = reconcileDetails(doc(), AUTO);
    assert.equal(rows.find((r) => r.token === "snow_trigger").value, "2 inches");
  });

  test("every token the page uses can be named in plain words", () => {
    for (const token of tokensUsedBy(doc())) {
      const label = plainLabel(token);
      assert.notEqual(label, token, `${token} has no plain words anywhere`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   6 · It renders in all three modes
   ══════════════════════════════════════════════════════════════════════════ */

describe("the three render modes", () => {
  const ctxFor = (mode, merge) => makeContext(doc(), {
    mode, merge,
    business: { name: "Summit Lawn & Landscape", contactLine: "office@summit.example" },
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

  test("six priced lines, each one catalogue-ready", () => {
    assert.equal(lines().length, 6);
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
      "six rates on one basis — then the document SHOULD carry a total");
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
