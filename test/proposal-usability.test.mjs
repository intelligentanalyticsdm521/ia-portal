// test/proposal-usability.test.mjs — the 2026-09-16 user test's findings,
// pinned so they cannot come back.
//
// Every describe block below names the finding it answers, from
// `overnight-report/BUILDER_USER_TEST_2026-09-16.md` §7. The rule these tests
// follow is the platform's own: **assert the wanted output APPEARS**, not that
// an error is absent. "No exception was thrown" is what the send that sent no
// email reported for three weeks.
//
// MUTATION CHECKS — each one was made red on purpose and then put back:
//   · make cadenceOf ignore the price LABEL            → "per push" rows red
//   · make fmtMoney use toFixed(2)                     → the $1,200.00 row red
//   · make reconcileDetails skip tokens with no value  → D-03's whole block red
//   · make writeDetails mark the section "customer"    → the blanks-count row red
//   · drop the `has("totals")` guard from
//     withTotalBeforeSignature                         → the "no second total" row red
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { deserialise, emptyDocument, makeSection, makeWidget, serialise, walkWidgets } from "../src/builder/model.ts";
import { documentTotals } from "../src/builder/totals.ts";
import { pricedOnOneBasis, templateByKey, withTotalBeforeSignature } from "../src/builder/templates.ts";
import { WIDGETS_BY_KIND } from "../src/builder/registry.ts";
import {
  basisOf, cadenceOf, fmtMoney, unitFromLabel, buildPick,
} from "../src/components/oliver/ProposalCatalogPicker.tsx";
import {
  blankTokens, blanksRefusal, documentLogo, mergeValues, packDetail,
  parseMoney, plainLabel, setMergeValue, tokensUsedBy, widgetForToken,
} from "../src/builder/proposal/documentDetails.ts";


const BUILDER = readFileSync(new URL("../src/builder/proposal/ProposalBuilder.tsx", import.meta.url), "utf8");
const LIST = readFileSync(new URL("../src/pages/oliver/OliverQuotesProposalsPage.tsx", import.meta.url), "utf8");
const RECORD = readFileSync(new URL("../src/pages/oliver/OliverProposalsPage.tsx", import.meta.url), "utf8");

/** The dev catalogue's six Snow Removal tiers, as the API really answers. */
const SNOW = {
  offering_id: "snow", name: "Snow Removal",
  description: "Commercial lot clearing, priced by snowfall depth.",
  features_json: JSON.stringify(["Automatic dispatch at your trigger depth", "Salt and de-icing included"]),
  prices: [
    { price_id: "p0", label: "Single visit", pricing_model: "one_time", unit_amount: 525 },
    { price_id: "p1", label: "1-2 inch push", pricing_model: "recurring", unit_amount: 400, recurring_interval: "month", recurring_interval_count: 1 },
    { price_id: "p2", label: "2-3 inch push", pricing_model: "recurring", unit_amount: 625, recurring_interval: "month", recurring_interval_count: 1 },
    { price_id: "p5", label: "8+ inch push", pricing_model: "recurring", unit_amount: 1200, recurring_interval: "month", recurring_interval_count: 1 },
  ],
};
const MOWING = {
  offering_id: "mow", name: "Weekly Mowing", description: "Cut, trim, edge, blow.",
  prices: [{ price_id: "m0", label: null, pricing_model: "one_time", unit_amount: 65 }],
};
const PLATFORM = {
  offering_id: "plat", name: "Platform", description: "A plan.",
  prices: [{ price_id: "x", label: null, pricing_model: "recurring", unit_amount: 549, recurring_interval: "month", recurring_interval_count: 1 }],
};

/* ══════════════════════════════════════════════════════════════════════════
   D-09 — the rate card printed the wrong billing basis
   ══════════════════════════════════════════════════════════════════════════ */

describe("D-09 · the basis on a priced line is the one the catalogue carries", () => {
  test("a per-push tier says PER PUSH, even though it bills monthly", () => {
    // This is the whole defect. The tiers really are stored recurring/monthly,
    // so the old reading was not a bug in the data — but the price's own label
    // says what the customer is buying, and "billed monthly" on a per-push
    // line of a signed snow contract is wrong on the paper.
    const tier = SNOW.prices.find((p) => p.label === "2-3 inch push");
    assert.equal(cadenceOf(tier), "per push");
    assert.equal(basisOf(tier), "per push");
  });

  test("the words \"billed monthly\" are gone from the vocabulary", () => {
    for (const price of SNOW.prices) {
      assert.notEqual(cadenceOf(price), "billed monthly");
      assert.ok(!String(basisOf(price)).startsWith("billed "),
        `${price.label} still says "${basisOf(price)}"`);
    }
  });

  test("a genuinely monthly plan still says monthly, in plain words", () => {
    assert.equal(cadenceOf(PLATFORM.prices[0]), "monthly");
  });

  test("a single-visit price says per visit", () => {
    assert.equal(cadenceOf(SNOW.prices[0]), "per visit");
  });

  test("a plain one-off with no unit in its label bills ONE-TIME, never \"Each visit\"", () => {
    // "Each visit" was invented by the builder for a price that says nothing
    // of the kind, and it went onto rate cards as fact.
    assert.equal(cadenceOf(MOWING.prices[0]), null);
    assert.equal(basisOf(MOWING.prices[0]), "one-time");
    assert.ok(!/\?\?\s*"Each visit"/.test(BUILDER), "the invented fallback is still in the builder");
    assert.ok(BUILDER.includes("basis: basisOf(price),"), "the rate card does not ask the catalogue for the basis");
  });

  test("the label reader knows the units a service business prices in", () => {
    assert.equal(unitFromLabel("Ice melt application"), "per application");
    assert.equal(unitFromLabel("Per cubic yard installed"), "per cubic yard");
    assert.equal(unitFromLabel("Seasonal contract"), "per season");
    assert.equal(unitFromLabel("Standard"), null);
  });

  test("the cadence reaches the priced line the builder writes", () => {
    const pick = buildPick(SNOW, SNOW.prices[2]);
    assert.equal(pick.parts.cadence, "per push");
    assert.equal(pick.parts.name, "Snow Removal — 2-3 inch push");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   D-29 — money formatted inconsistently
   ══════════════════════════════════════════════════════════════════════════ */

describe("D-29 · money has thousands separators everywhere", () => {
  test("$1,200.00, not $1200.00", () => {
    assert.equal(fmtMoney(1200), "$1,200.00");
    assert.equal(fmtMoney(625), "$625.00");
    assert.equal(fmtMoney(0), "$0.00");
  });

  test("the rate card is written with the formatter, not toFixed", () => {
    // The exact line that printed $1200.00 beside $400.00 and $625.00 on the
    // same signed rate card.
    assert.ok(!/\$\$\{Number\([^)]*\)\.toFixed\(2\)\}/.test(BUILDER),
      "a `$${n.toFixed(2)}` money string is back in the proposal builder");
    assert.ok(BUILDER.includes("rate: fmtMoney(pick.parts.unit_price)"),
      "the rate card no longer formats its own money");
  });

  test("a price typed on a card reads back as a number, whatever it was typed as", () => {
    assert.equal(parseMoney("$1,200.00"), 1200);
    assert.equal(parseMoney("549"), 549);
    assert.equal(parseMoney(""), 0);
    assert.equal(parseMoney("nonsense"), 0);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   D-01 / D-10 — the tier cards
   ══════════════════════════════════════════════════════════════════════════ */

describe("D-01 and D-10 · a tier card has a catalogue and a real price field", () => {
  test("there is ONE catalogue picker, and every money widget opens it", () => {
    // D-156 moved it out of the builder and into the file that holds its
    // readers, and DELETED the unreachable second copy that was already
    // there. A second copy is a second idea of what a price button says.
    const picker = readFileSync(new URL("../src/components/oliver/ProposalCatalogPicker.tsx", import.meta.url), "utf8");
    assert.equal((picker.match(/export function CatalogPicker\(/g) || []).length, 1);
    assert.equal((BUILDER.match(/function CatalogPicker\(/g) || []).length, 0,
      "the builder kept a second picker");
    assert.ok(!picker.includes("export function ProposalCatalogPicker("),
      "the picker nobody could open is still here");
    // Opened from the catalogue card, the priced line and the pricing table —
    // three widgets, one component. (It was four: the fourth was the old
    // comparison block, whose panel is deleted with it — D-156.)
    assert.ok((BUILDER.match(/<CatalogPicker/g) || []).length >= 3,
      "a money widget lost its way into Products & Services");
  });

  test("every card field is a real control, in the price table's own five sections", () => {
    // D-156: a card is its OWN widget, so its fields are its REGISTRY
    // CONTROLS — the shared inspector draws them, with a real input and a
    // label each, and nothing on a card is unreachable. That is the same fix
    // D-01 asked for, in the place a widget's fields belong, and it means the
    // inspector does not carry a hand-built panel per composite any more.
    //
    // CONFORMANCE 2026-09-17: the keys and the sections are the catalogue's
    // `price-table` — Heading · Pricing · Features · Footer · Ribbon, in that
    // order, so an author who has built a pricing card anywhere finds the same
    // five groups in the same order.
    const controls = WIDGETS_BY_KIND.card.controls.map((c) => c.key);
    for (const key of ["heading", "price", "period", "original_price", "description", "features_list"]) {
      assert.ok(controls.includes(key), `a card has no ${key} control`);
    }
    const sections = [];
    for (const c of WIDGETS_BY_KIND.card.controls) {
      if (c.section && sections[sections.length - 1] !== c.section) sections.push(c.section);
    }
    assert.deepEqual([...new Set(sections)], ["Heading", "Pricing", "Features", "Footer", "Ribbon"],
      "the card's controls are not grouped the way every author already knows");
    // The price is the one that measured 0px on the canvas. It is a text
    // control with help beside it, and the RENDERER gives the empty run a
    // placeholder and a minimum width — asserted in builder-usability.
    const price = WIDGETS_BY_KIND.card.controls.find((c) => c.key === "price");
    assert.equal(price.type, "text");
    assert.ok(String(price.help || "").trim(), "the price control says nothing about how to type it");
  });

  test("\"Use this plan\" exists and says what it does to the total", () => {
    assert.ok(BUILDER.includes("Use this plan"));
    assert.ok(BUILDER.includes('makeWidget("price_line"'),
      "the chosen plan does not become a priced line, so the total stays $0.00");
  });

  test("the honest note is still there, because it is still true", () => {
    // Cards never sum. That rule did not change, and the sentence moved to
    // where the SET is: a ROW of cards says it once, under the row, because it
    // is a fact about the choice and not about any one card (render.ts
    // `offerNote`). One card on its own says nothing — there is no choice to
    // explain.
    const RENDER = readFileSync(new URL("../src/builder/render.ts", import.meta.url), "utf8");
    assert.ok(RENDER.includes("These figures are not added to any total."));
    assert.ok(RENDER.includes("function offerNote("), "the sentence has no one place to live");
    // …and a card still has no control that would make it look like money.
    assert.ok(!WIDGETS_BY_KIND.card.controls.some((c) => c.key === "quantity"));
    assert.ok(!WIDGETS_BY_KIND.card.controls.some((c) => c.key === "unit_price"));
  });

  test("a card built from a catalogue price carries the name, the money and the cadence", () => {
    const pick = buildPick(SNOW, SNOW.prices[3]);
    assert.equal(fmtMoney(pick.parts.unit_price), "$1,200.00");
    assert.equal(pick.parts.cadence, "per push");
    assert.ok(pick.parts.features.length >= 2, "the product's own features did not reach the card");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   D-03 / D-35 — every blank is a field
   ══════════════════════════════════════════════════════════════════════════ */

function agreementDoc() {
  const s = makeSection({ label: "Terms", numbered: true });
  s.columns[0].widgets = [
    makeWidget("paragraph", {
      text: "The standard service trigger is {{snow_trigger}} of accumulated snow. "
        + "The term runs {{contract.start_date}} to {{contract.end_date}} for {{customer.name}}.",
    }),
    makeWidget("callout", {
      panels: [{ title: "Severe events", tone: "warn", body: "Storms over {{severe_event_threshold}} are quoted first." }],
    }),
  ];
  return { ...emptyDocument(), sections: [s] };
}

/* D-03's DETAILS GROUP TESTS LIVED HERE AND ARE DELETED (scope 11.13,
   2026-09-19). The group they pinned - a reconciled row per blank, drawn as a
   box in the left pane - was never in scope and is gone, so its tests go with
   it rather than being left green against a deleted mechanism. What replaces
   both is test/builder-dynamic-fields.test.mjs: a fact that lives in a record
   is a Customer / Service Location / Business Info widget that fills itself,
   and a fact that lives in no record is typed on the page. The two claims D-03
   really made - "no raw token ever reaches a screen" and "what is typed
   survives a save and a reopen" - are kept below, because they outlived the
   group. */
describe("D-03 - a blank is never a raw token, and what is typed survives", () => {
  test("NO BLANK IS EVER NAMED WITH A RAW TOKEN", () => {
    for (const token of tokensUsedBy(agreementDoc())) {
      const label = plainLabel(token);
      assert.ok(!/[{}_]/.test(label), `${token} reaches a screen as "${label}"`);
    }
    assert.equal(plainLabel("snow_trigger"), "Trigger depth");
    assert.match(packDetail("snow_trigger").help, /inches/);
  });

  test("a value typed on the page survives save then reopen", () => {
    const saved = setMergeValue(agreementDoc(), "snow_trigger", "2 inches");
    const reopened = deserialise(serialise(saved));
    assert.equal(mergeValues(reopened).snow_trigger, "2 inches");
  });

  test("typing nothing leaves the document byte-identical", () => {
    const d = agreementDoc();
    assert.equal(serialise(setMergeValue(d, "snow_trigger", "")), serialise(d));
  });
});

describe("11.13.2 - Send names the blanks and opens the box on the first one", () => {
  test("THE LEFT-PANE COUNTER IS GONE, and so is the second jump", () => {
    /* Scope 11.13.2: "Deleted with the Details group: DetailsGroup UI, the
       'still to fill in' counter in the left pane, PACK_LABELS as a UI list."
       Brandon, three times on 2026-09-19. A counter beside a Send button that
       already says the same thing is a second place for the two to drift,
       which is how a document went out with two blank dates. */
    assert.ok(!BUILDER.includes("problems={problems}"), "the adapter still feeds the counter");
    assert.ok(!BUILDER.includes("onFocusProblem"), "the second jump is still here");
    assert.ok(!BUILDER.includes("data-blank-chip"), "a chip row came back");
    assert.ok(!/<DetailsGroup/.test(BUILDER), "the group came back");
    assert.ok(!/data-details-group/.test(BUILDER), "a list of boxes came back");
  });

  test("Send jumps to the first blank, ON THE PAGE", () => {
    // ONE jump, called by BOTH Send buttons - a new document and a revision.
    assert.ok(BUILDER.includes("const takeMeToTheBlank = useCallback"));
    assert.equal((BUILDER.match(/takeMeToTheBlank\(\);/g) || []).length, 2,
      "one of the two Send buttons refuses without jumping");
    assert.ok(BUILDER.includes("setEditingToken(first)"));
  });

  test("the refusal message names them in plain words", () => {
    // EXECUTED, not grepped. The sentence has ONE writer - the two Send
    // buttons each carried their own copy of it, and a copy is where the two
    // come to say different things about the same blank (2026-09-18).
    const words = blanksRefusal(
      ["snow_trigger", "contract.start_date"], { snow_trigger: "Trigger depth" });
    assert.match(words, /Trigger depth/);
    assert.match(words, /Service term starts/);
    assert.ok(!/[{}_]/.test(words), `the refusal is not plain words: ${words}`);
    assert.match(words, /Click the highlighted words on the page/,
      "the refusal still does not say where the fields are");
    assert.equal((BUILDER.match(/blanksRefusal\(/g) || []).length, 2,
      "a Send refusal is writing its own sentence again");
  });
});

describe("N-1 \u00b7 D-20 in the proposal builder: the refusal is AT the button", () => {
  test("every button that can refuse carries an anchor", () => {
    // EVERY one — counted, not "at least one". There are two Send buttons (a
    // new document and a revision) and two of each Save, and a refusal from the
    // one without an anchor lands in the middle of the window, which is D-20
    // again with a shorter distance.
    const count = (a) => (BUILDER.match(new RegExp('data-builder-anchor="' + a + '"', "g")) || []).length;
    assert.equal(count("send"), 2, "a Send button has no anchor — its refusal has nowhere to point");
    assert.equal(count("save"), 2, "a Save draft button has no anchor");
    assert.equal(count("save-close"), 2, "a Save and close button has no anchor");
  });

  test("the refusal is reported through the engine, not printed in the far-left pane", () => {
    assert.ok(BUILDER.includes("refusal={refusal}"));
    assert.ok(BUILDER.includes("onDismissRefusal={() => setRefusal(null)}"));
    // Every refusal in save()/saveRevision() goes through refuse(anchor, ...).
    assert.ok(BUILDER.includes('refuse(anchor, "Give the document a title at the top first.")'));
    assert.ok(BUILDER.includes('refuse(anchor, "Pick a customer to send it to'));
    assert.ok(!/setErr\(`\$\{blanks\.length\}/.test(BUILDER),
      "the blanks refusal still prints in the pane");
  });

  test("the send refusal is anchored to the SEND button and the save one is not", () => {
    assert.ok(BUILDER.includes('const anchor = send ? "send" : close ? "save-close" : "save";'));
    assert.ok(BUILDER.includes('const anchor = send ? "send" : "save";'));
  });
});

describe("N-2 \u00b7 Ctrl+S is honoured in the proposal builder", () => {
  test("the adapter passes onSave, like the other three", () => {
    assert.ok(BUILDER.includes("onSave={() => { void (revision ? saveRevision(false) : save(false, false)); }}"),
      "the \u201c?\u201d panel advertises Ctrl+S and nothing is wired to it");
  });

  test("every adapter that renders BuilderShell passes onSave", () => {
    // Assert the PRESENCE of the wiring on every surface \u2014 an advertised
    // shortcut that does nothing is worse than no shortcut (D-18).
    const adapters = {
      "src/builder/proposal/ProposalBuilder.tsx": BUILDER,
      "src/builder/adapters/email/EmailBuilder.tsx": null,
      "src/builder/adapters/landing/LandingBuilder.tsx": null,
      "src/builder/adapters/website/WebsiteBuilder.tsx": null,
    };
    for (const file of Object.keys(adapters)) {
      const src = adapters[file]
        ?? readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
      if (!src.includes("<BuilderShell")) continue;
      assert.ok(/\bonSave=\{/.test(src), `${file} renders BuilderShell and passes no onSave`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   D-04 / D-36 — the way back in
   ══════════════════════════════════════════════════════════════════════════ */

describe("D-04 · a saved draft opens in the builder from the row", () => {
  test("the row carries an Edit that opens the builder on the document", () => {
    assert.ok(LIST.includes("data-edit-proposal={r.id}"), "there is still no Edit on the row");
    assert.ok(LIST.includes("setEditProposalId(r.id)"));
    assert.ok(LIST.includes("proposalId={editProposalId}"),
      "Edit opens a NEW proposal rather than the one on the row");
  });

  test("the record modal has it too, and says no revision is created", () => {
    assert.ok(RECORD.includes('data-open-in-builder="1"'));
    assert.ok(RECORD.includes("No revision is created — this is the document itself."));
  });

  test("\"+ Revise in the builder\" is refused on a draft", () => {
    assert.ok(RECORD.includes('proposalSummary?.status === "draft"'));
    assert.ok(RECORD.includes("there is no version to revise"));
  });
});

describe("D-36 · Save draft stays in the builder, Save and close is its own button", () => {
  test("both buttons exist and only one of them closes", () => {
    assert.ok(BUILDER.includes('data-save-draft="1"'));
    assert.ok(BUILDER.includes('data-save-close="1"'));
    assert.ok(BUILDER.includes("onClick={() => save(false, false)}"), "Save draft still closes the builder");
    assert.ok(BUILDER.includes("onClick={() => save(false, true)}"));
  });

  test("staying open SAYS so — a tick, not silence", () => {
    assert.ok(BUILDER.includes('data-saved-tick="1"'));
    assert.ok(BUILDER.includes("You are still in the builder."));
  });

  test("saving twice patches one row rather than making a second proposal (D-25)", () => {
    assert.ok(BUILDER.includes("let id = liveId;"), "the second save still POSTs a new proposal");
    assert.ok(BUILDER.includes("setLiveId(id);"));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   D-06 / D-07 — the money on the document
   ══════════════════════════════════════════════════════════════════════════ */

describe("D-07 · the grand total is above the signature", () => {
  const priced = () => {
    const money = makeSection({ label: "Price" });
    money.columns[0].widgets = [makeWidget("priced_line", { name: "Snow", quantity: 1, unit_price: 1875 })];
    const accept = makeSection({ label: "Acceptance" });
    accept.columns[0].widgets = [makeWidget("signature", { heading: "Acceptance" })];
    return { ...emptyDocument(), sections: [money, accept] };
  };

  test("a totals widget lands immediately BEFORE the signature", () => {
    const doc = withTotalBeforeSignature(priced());
    const widgets = doc.sections.at(-1).columns[0].widgets.map((w) => w.kind);
    assert.deepEqual(widgets, ["totals", "signature"]);
  });

  test("and it prints a real number, not $0.00", () => {
    assert.equal(documentTotals(withTotalBeforeSignature(priced())).total, 1875);
  });

  test("a document that already has a total does NOT grow a second one", () => {
    const doc = priced();
    const t = makeSection({ label: "Your total" });
    t.columns[0].widgets = [makeWidget("totals", { heading: "Your total" })];
    doc.sections.splice(1, 0, t);
    const after = withTotalBeforeSignature(doc);
    const totals = after.sections.flatMap((s) => s.columns.flatMap((c) => c.widgets)).filter((w) => w.kind === "totals");
    assert.equal(totals.length, 1);
  });

  test("a document with no signature is untouched", () => {
    const doc = { ...emptyDocument(), sections: [makeSection({ label: "Only prose" })] };
    assert.equal(serialise(withTotalBeforeSignature(doc)), serialise(doc));
  });

  test("every shipped template whose lines add up carries a total above the signature", () => {
    for (const key of ["platform_proposal", "simple_proposal", "maintenance_plan"]) {
      const t = templateByKey(key);
      if (!t) continue;
      const doc = withTotalBeforeSignature(t.build());
      const flat = doc.sections.flatMap((s) => s.columns.flatMap((c) => c.widgets)).map((w) => w.kind);
      if (!flat.includes("signature")) continue;
      assert.ok(flat.indexOf("totals") >= 0, `${key} has no total anywhere`);
      assert.ok(flat.indexOf("totals") < flat.lastIndexOf("signature"),
        `${key} prints its total AFTER the signature`);
    }
  });

  /* D-164 — the other half of the same promise. D-07 says the figure the
     customer signs must be ON the paper; this says a figure that is true of no
     invoice must NOT be. */
  test("lines charged on ONE basis add up", () => {
    const doc = priced();
    assert.equal(pricedOnOneBasis(doc), true, "two lines with no cadence are a plain job and total");
    const perMonth = priced();
    for (const w of perMonth.sections[0].columns[0].widgets) w.props.cadence = "per month";
    assert.equal(pricedOnOneBasis(perMonth), true, "all-per-month totals to a month");
  });

  test("lines charged on DIFFERENT bases do not, and get no total above the signature", () => {
    const doc = priced();
    doc.sections[0].columns[0].widgets.push(
      makeWidget("price_line", { name: "Salting", quantity: 1, unit_price: 200, cadence: "per application" }),
    );
    doc.sections[0].columns[0].widgets[0].props.cadence = "per push";
    assert.equal(pricedOnOneBasis(doc), false, "per push and per application are not addable");
    const after = withTotalBeforeSignature(doc);
    const flat = after.sections.flatMap((s) => s.columns.flatMap((c) => c.widgets)).map((w) => w.kind);
    assert.ok(!flat.includes("totals"),
      "a per-push and a per-application line were added together above a signature");
  });

  test("the snow & ice agreement is per event, so it prints no season total", () => {
    const doc = withTotalBeforeSignature(templateByKey("service_agreement").build());
    assert.equal(pricedOnOneBasis(doc), false,
      "the agreement's six rates are charged on one basis — check the pricing schedule");
    const kinds = walkWidgets(doc).map((x) => x.widget.kind);
    assert.ok(kinds.includes("signature"), "the agreement cannot be signed");
    assert.ok(kinds.includes("price_line"), "the agreement has no priced lines");
    assert.ok(!kinds.includes("totals"),
      "the agreement prints a total that is neither a storm nor a season");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   D-37 — the sections that shipped empty
   ══════════════════════════════════════════════════════════════════════════ */

describe("D-37 · a template's sections arrive with real content", () => {
  const doc = () => templateByKey("service_agreement").build();

  test("the cover is not four blank rows — every fact on it says something", () => {
    // D-164: the four cover facts moved off "Agreement at a glance" and onto
    // the cover, which is where the client's draft puts them.
    /* D-165 — a key fact is a LINE OF TEXT with its label in bold, so the four
       cover facts are four Text Editors in a row Container (§11.13.3). The
       cover's FIRST box is the header row (logo + title); the facts are the
       second. What this test protects is unchanged: four of them, each one
       saying something. */
    const boxes = doc().sections[0].columns[0].widgets.filter((w) => Array.isArray(w.children));
    const facts = boxes[boxes.length - 1].children.map((w) => String(w.props.text || ""));
    assert.ok(facts.length >= 4, `the cover carries only ${facts.length} facts`);
    assert.ok(facts.every((t) => /^\*\*.+\*\*\s+\S/.test(t)), "a cover fact is a label with nothing after it");
  });

  test("\"Agreement at a glance\" is not an empty paragraph and an empty table", () => {
    const section = doc().sections.find((s) => s.label === "Agreement at a glance");
    /* D-165 — the glance table never was a rate card: three columns of WORDS,
       no figure that feeds a total. It is the plain **Table** now, whose id the
       shared vocabulary keeps, and the priced lines live on the pricing
       schedule where the catalogue picker drops them. */
    const [para, , table] = section.columns[0].widgets;
    assert.ok(String(para.props.text).length > 60, "the opening paragraph is still empty");
    assert.equal(table.kind, "data_table");
    assert.ok(table.props.rows.length >= 4, "the service table ships with no rows");
    assert.ok(table.props.rows.every((r) => r.every((cell) => String(cell).trim())),
      "a cell of the service table is blank");
    // The four Service summary sentences, each its own paragraph.
    const paras = section.columns[0].widgets.filter((w) => w.kind === "paragraph");
    assert.ok(paras.length >= 5, `only ${paras.length} paragraphs on the glance page`);
    assert.ok(paras.every((w) => String(w.props.text).trim().length > 40),
      "a paragraph on the glance page is a blank the author has to write");
  });

  test("the merge fields are there, so they fill from the customer pick", () => {
    const d = doc();
    const boxes = d.sections[0].columns[0].widgets.filter((w) => Array.isArray(w.children));
    // D-165 — a cover fact is a Text Editor, so the tag is in `text`.
    const values = boxes[boxes.length - 1].children.map((w) => w.props.text).join(" ");
    assert.match(values, /\{\{customer\.name\}\}/);
    assert.match(values, /\{\{property\.address\}\}/);
    const glance = JSON.stringify(d.sections.find((s) => s.label === "Agreement at a glance"));
    assert.match(glance, /\{\{snow_trigger\}\}/);
  });

  test("the trigger depth ships FILLED, so the document is true the moment it opens", () => {
    assert.equal(doc().settings.merge.snow_trigger, "2 inches");
  });

  test("an Alert with a title has a body — a heading is not an explanation", () => {
    /* D-165 — Elementor's name for a tinted panel that must not be skimmed past
       is **Alert**, and the invented "Callout panel" is deleted. One panel is
       one Alert now, so the rule is per widget rather than per row. */
    const severe = doc().sections.find((s) => s.label === "Severe weather and special conditions");
    const alerts = severe.columns[0].widgets.filter((w) => w.kind === "alert");
    assert.ok(alerts.length >= 1, "the severe-weather section lost its alert");
    for (const a of alerts) {
      assert.ok(String(a.props.alert_title).trim(), "an alert has no title");
      assert.ok(String(a.props.alert_description).trim().length > 40,
        `"${a.props.alert_title}" still has no body`);
    }
  });

  test("every clause ships as WORDS — nothing on the page has to be retyped", () => {
    // The 2026-09-16 defect, stated as a rule: an author who picks this
    // template and picks a customer has a sendable agreement. No heading
    // without a paragraph, no paragraph that is a stub.
    const widgets = walkWidgets(doc()).map((x) => x.widget);
    /* D-165 put TWO new shapes into `paragraph`, and neither is a clause:
       a SHORT ANSWER — "**Service term** 1 November – 30 April" — and a
       LABELLED BLANK on the crew's sheet — "**Areas we plow** " — which §11.13.2
       puts on the page deliberately: *"A value that lives in no record … is a
       plain editable run on the page where it appears, with a placeholder in
       edit mode and a blank rule on the customer's copy"*, and Send refuses a
       document with blanks by walking the page. Both are bold-label lines, so
       both are told apart from prose by their shape rather than by their
       length, and the CLAUSES are held to the same bar they always were. */
    const labelled = (w) => /^\*\*[^*]+\*\*/.test(String(w.props.text || ""));
    const paragraphs = widgets.filter((w) => w.kind === "paragraph" && !labelled(w));
    assert.ok(paragraphs.length >= 35, `only ${paragraphs.length} clause paragraphs`);
    for (const w of paragraphs) {
      // 24, not 40: "Invoices are due {{payment_terms}}." is a whole clause
      // with one blank in it, which is the shape this build is FOR. A stub is
      // an empty string or three words, and both are still caught.
      assert.ok(String(w.props.text).trim().length > 24,
        `a paragraph ships with "${String(w.props.text).slice(0, 30)}" in it`);
    }
    for (const w of widgets.filter((x) => x.kind === "heading")) {
      assert.ok(String(w.props.text).trim(), "a heading ships blank");
    }
  });

  test("the pricing schedule is priced lines that can come from the catalogue", () => {
    const pricing = doc().sections.find((s) => s.label === "Pricing schedule");
    const lines = pricing.columns[0].widgets.filter((w) => w.kind === "price_line");
    assert.ok(lines.length >= 6, `only ${lines.length} priced lines on the schedule`);
    for (const w of lines) {
      assert.ok(String(w.props.name).trim(), "a priced line has no name");
      /* A PRICE OF ZERO IS ALLOWED ONLY WHERE IT IS DELIBERATE (D-164).
         Two rows of the draft — the additional push and the severe event —
         are the business's own to state, and a number invented in a template
         goes out under somebody's signature. So a blank price must come with
         the author note that says what to put in it; a blank price with no
         note is the stub this test was written to catch. */
      if (!(Number(w.props.unit_price) > 0)) {
        assert.ok(String(w.props.help || "").trim().length > 20,
          `${w.props.name} ships at $0.00 with nothing telling the author what goes in it`);
      }
      assert.ok(String(w.props.cadence).trim(), `${w.props.name} does not say what it is charged per`);
    }
    // The plowing line is the one the walk loads a catalogue price onto, and
    // its quantity is the paved area in thousands of square feet.
    const plow = lines[0];
    assert.match(String(plow.props.name), /plow/i);
    assert.ok(Number(plow.props.quantity) > 1, "the plowing line has no area on it");
  });

  test("\"Property service plan\" is not a bare heading that prints as an empty page", () => {
    const plan = doc().sections.find((s) => s.label === "Property service plan");
    /* D-165 — `property_plan` is deleted (§11.13.3: "property plan -> Service
       Location + Text Editor rows"). The location fills itself in from the
       customer's own record; the crew's six questions are labelled lines on the
       page, which is what stops section 10 printing as an empty sheet. */
    const widgets = plan.columns[0].widgets;
    assert.ok(widgets.some((w) => w.kind === "service_location"), "the plan lost its service address");
    const rows = widgets.filter((w) => w.kind === "paragraph" && /^\*\*[^*]+\*\*/.test(String(w.props.text || "")));
    assert.ok(rows.length >= 5, "the service plan still ships with no rows");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   D-14 / D-15 / D-33 / D-39
   ══════════════════════════════════════════════════════════════════════════ */

describe("D-14 · a proposal can be deleted, and the button says which", () => {
  test("there is a Delete on the row", () => {
    assert.ok(LIST.includes("data-delete-proposal={r.id}"));
    assert.ok(LIST.includes("api.del(`/proposals/${row.id}`)"));
  });

  test("a sent or accepted document ARCHIVES, and the word on the button says so", () => {
    assert.ok(LIST.includes('const CAN_HARD_DELETE = new Set(["draft", "expired"])'));
    assert.ok(LIST.includes('{CAN_HARD_DELETE.has(r.status) ? "Delete" : "Archive"}'));
  });

  test("nothing is destroyed without a confirm that names the document", () => {
    assert.ok(LIST.includes('data-confirm-delete="1"'));
    assert.ok(LIST.includes("`${confirmDelete.title} · ${confirmDelete.number}`"));
  });

  test("a delete that fails SAYS so rather than quietly leaving the row", () => {
    assert.ok(LIST.includes("setFlash(`That failed — ${(e as Error).message}`)"));
  });
});

describe("D-15 · a title edit persists", () => {
  test("a revision save patches the PROPOSAL's title, which is where a title lives", () => {
    assert.ok(BUILDER.includes("await api.patch(`/proposals/${revision.proposalId}`, { title: title.trim() })"));
  });

  test("and a title that cannot be saved is an error, not a silent revert", () => {
    assert.ok(BUILDER.includes("the title could not be saved"));
  });
});

describe("D-33 · one control per thing", () => {
  test("\"Which location\" is declared ONCE — by the adapter, which knows the locations", () => {
    // `property_block` is DELETED (D-156) — a property is a box, and the
    // address block inside it is what is bound to a location.
    // D-165 — the address block is `service_location` and `property_plan` is
    // deleted; the rule is the same and the adapter still owns the picker.
    for (const kind of ["service_location"]) {
      assert.ok(!WIDGETS_BY_KIND[kind].controls.some((c) => c.key === "locationId"),
        `${kind} still declares an empty locationId select, so the label prints twice`);
    }
    assert.equal((BUILDER.match(/<span style=\{LBL\}>Which location<\/span>/g) || []).length, 1);
  });

  test("no proposal widget declares a select with no options to fill it", () => {
    for (const kind of ["price_line", "card", "catalog_card", "totals",
      "service_location", "customer", "business_info", "clauses", "signature",
      "icon", "icon_box", "image_box", "alert", "testimonial", "star_rating", "social_icons"]) {
      for (const c of WIDGETS_BY_KIND[kind].controls || []) {
        if (c.type !== "select") continue;
        assert.ok(c.options?.length, `${kind}.${c.key} is a select with nothing in it`);
      }
    }
  });
});

describe("D-39 · the title band has a logo control", () => {
  test("the three choices are there: the brand logo, none, or a picture", () => {
    assert.ok(BUILDER.includes('data-logo="brand"'));
    assert.ok(BUILDER.includes('data-logo="none"'));
    assert.ok(BUILDER.includes('data-logo-upload="1"'));
  });

  test("the widget carries the choice, so it saves with the document", () => {
    /* D-165 — `doc_header` is deleted and a document header is a row Container
       with an **Image** in it, so the picture the author chose is the Image's
       own `src` and saves with the document exactly as before. `business_info`
       carries the other half of D-39: use the brand logo, or a different one. */
    assert.ok("src" in WIDGETS_BY_KIND.image.defaults);
    assert.ok("logo_url" in WIDGETS_BY_KIND.business_info.defaults);
    assert.ok("show_logo" in WIDGETS_BY_KIND.business_info.defaults);
  });

  test("documentLogo answers the three cases", () => {
    const withLogo = (v) => {
      const s = makeSection({ label: "Title" });
      s.columns[0].widgets = [makeWidget("doc_header", { logoUrl: v })];
      return { ...emptyDocument(), sections: [s] };
    };
    assert.equal(documentLogo(withLogo("")), "");
    assert.equal(documentLogo(withLogo("none")), "none");
    assert.equal(documentLogo(withLogo("data:image/png;base64,AAA")), "data:image/png;base64,AAA");
    assert.equal(documentLogo(emptyDocument()), "");
  });

  test("an upload larger than the cap is refused in words, not by a failed save", () => {
    assert.ok(BUILDER.includes("200 * 1024"));
    assert.ok(BUILDER.includes("larger than 200 KB"));
  });
});
