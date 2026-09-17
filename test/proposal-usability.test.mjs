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

import { deserialise, emptyDocument, makeSection, makeWidget, serialise } from "../src/builder/model.ts";
import { documentTotals } from "../src/builder/totals.ts";
import { unfilledTokens } from "../src/builder/merge.ts";
import { templateByKey, withTotalBeforeSignature } from "../src/builder/templates.ts";
import { WIDGETS_BY_KIND } from "../src/builder/registry.ts";
import {
  basisOf, cadenceOf, fmtMoney, unitFromLabel, buildPick,
} from "../src/components/oliver/ProposalCatalogPicker.tsx";
import {
  LEGACY_DETAILS_KEY, detailsMerge, documentLogo, packDetail, parseMoney, plainLabel,
  readDetails, readLegacyDetails, reconcileDetails, tokensUsedBy, widgetForToken,
  writeDetails,
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

describe("D-03 · every blank the document carries is a field somewhere", () => {
  const AUTO = { "customer.name": "Hope Ministries" };

  test("a token the page uses and the customer pick cannot answer gets a row", () => {
    const rows = reconcileDetails(agreementDoc(), AUTO);
    const tokens = rows.map((r) => r.token);
    assert.deepEqual(tokens, ["snow_trigger", "contract.start_date", "contract.end_date", "severe_event_threshold"]);
  });

  test("a token the customer pick ALREADY answers gets no row", () => {
    const rows = reconcileDetails(agreementDoc(), AUTO);
    assert.ok(!rows.some((r) => r.token === "customer.name"),
      "the author is being asked to type the customer's own name");
  });

  test("NO ROW IS EVER LABELLED WITH A RAW TOKEN", () => {
    // Two of the four names the failed Send printed were `snow_trigger` and
    // `severe_event_threshold`. That is the sentence Brandon read out.
    for (const r of reconcileDetails(agreementDoc(), AUTO)) {
      assert.notEqual(r.label, r.token, `${r.token} is still shown as itself`);
      assert.ok(!/[_.]/.test(r.label), `"${r.label}" still looks like a token`);
      assert.ok(/^[A-Z]/.test(r.label), `"${r.label}" does not read like a label`);
    }
  });

  test("the snow pack's two tokens get a contractor's words and a line of help", () => {
    assert.equal(plainLabel("snow_trigger"), "Trigger depth");
    assert.equal(plainLabel("severe_event_threshold"), "Severe-event threshold");
    assert.match(packDetail("snow_trigger").help, /inches/);
  });

  test("an unknown token still never reaches a screen raw", () => {
    assert.equal(plainLabel("gate_access_window"), "Gate access window");
  });

  test("the platform's own tags keep the words the platform already uses", () => {
    assert.equal(plainLabel("contract.start_date"), "Service term starts");
  });

  test("a typed value fills the token, and survives save → close → reopen", () => {
    const rows = reconcileDetails(agreementDoc(), AUTO)
      .map((r) => (r.token === "snow_trigger" ? { ...r, value: "2 inches" } : r));
    const saved = writeDetails(agreementDoc(), rows);
    const reopened = deserialise(JSON.parse(serialise(saved)));
    assert.equal(detailsMerge(readDetails(reopened))["snow_trigger"], "2 inches");
  });

  test("the store is `settings.merge` \u2014 not a section, not a widget, so nothing can land in it", () => {
    // It WAS a hidden `visibility:"internal"` section, and a widget added with
    // nothing selected goes to the LAST section (D-11) \u2014 so three priced
    // property blocks landed inside the store, were counted as internal, and
    // vanished from the customer's copy, the PDF and the total. Then it was
    // `sections[0].meta.detailValues`, which was safe but was a SECOND carrier
    // beside `settings.merge` (N-7). One home now: the document's own settings,
    // which is not a section, not a widget and not a render target.
    // TWO sections, deliberately, so "first" and "last" are different places.
    const base = agreementDoc();
    const acceptance = makeSection({ label: "Acceptance" });
    acceptance.columns[0].widgets = [makeWidget("signature", { heading: "Acceptance" })];
    const two = { ...base, sections: [...base.sections, acceptance] };

    const rows = reconcileDetails(two, AUTO).map((r) => ({ ...r, value: "2 inches" }));
    const saved = writeDetails(two, rows);
    assert.equal(saved.sections.length, two.sections.length,
      "writing a detail added a section to the document");
    assert.equal(typeof saved.settings.merge, "object", "the store is not on settings.merge");
    assert.equal(saved.settings.merge.snow_trigger, "2 inches");
    assert.ok(!saved.sections.some((x) => x.meta?.[LEGACY_DETAILS_KEY]),
      "a second carrier is still on a section's meta");
    assert.ok(!saved.sections.some((x) => x.visibility === "internal"),
      "the store is a section again");
    // And it is never counted as a blank on the page.
    const texts = [];
    for (const x of saved.sections) {
      if (x.visibility !== "customer") continue;
      for (const c of x.columns) for (const w of c.widgets) texts.push(JSON.stringify(w.props));
    }
    assert.equal(unfilledTokens(texts, AUTO).length, 4);
  });

  test("N-7 \u00b7 a document written the OLD way still opens with its values", () => {
    // Tolerant read, one write. A trigger depth typed last week lives on
    // `sections[0].meta.detailValues`; refusing to read it would blank it.
    const doc = agreementDoc();
    doc.sections[0].meta = { [LEGACY_DETAILS_KEY]: [{ token: "snow_trigger", label: "Trigger depth", value: "2 inches" }] };
    assert.equal(readLegacyDetails(doc)[0].value, "2 inches");
    assert.equal(detailsMerge(readDetails(doc)).snow_trigger, "2 inches");
    assert.equal(reconcileDetails(doc, AUTO).find((r) => r.token === "snow_trigger").value, "2 inches");
  });

  test("N-7 \u00b7 and the first save MOVES it, so there is never a second carrier", () => {
    const doc = agreementDoc();
    doc.sections[0].meta = { [LEGACY_DETAILS_KEY]: [{ token: "snow_trigger", label: "Trigger depth", value: "2 inches" }] };
    const saved = writeDetails(doc, readDetails(doc));
    assert.equal(saved.settings.merge.snow_trigger, "2 inches");
    assert.ok(!saved.sections[0].meta?.[LEGACY_DETAILS_KEY], "the old carrier was left behind");
    // And what the engine's serialiser does with it survives the round trip.
    const reopened = deserialise(JSON.parse(serialise(saved)));
    assert.equal(reopened.settings.merge.snow_trigger, "2 inches");
  });

  test("N-7 \u00b7 a blank is not stored, so the gap rule still calls it blank", () => {
    const saved = writeDetails(agreementDoc(), [
      { token: "snow_trigger", label: "Trigger depth", value: "" },
    ]);
    assert.equal(saved.settings.merge, undefined);
  });

  test("N-1 \u00b7 every blank knows WHERE it is on the page", () => {
    const at = widgetForToken(agreementDoc(), "snow_trigger");
    assert.ok(at, "a blank with nowhere to go cannot be jumped to");
    assert.ok(at.sectionId && at.widgetId);
    assert.equal(widgetForToken(agreementDoc(), "not_on_this_page"), null);
  });

  test("there is ONE store however many sections the document has", () => {
    const doc = agreementDoc();
    const second = makeSection({ label: "Second" });
    second.meta = { [LEGACY_DETAILS_KEY]: [{ token: "snow_trigger", label: "Trigger depth", value: "stale" }] };
    const withStale = { ...doc, sections: [...doc.sections, second] };
    const saved = writeDetails(withStale, [{ token: "snow_trigger", label: "Trigger depth", value: "2 inches" }]);
    assert.equal(saved.sections.filter((x) => x.meta?.[LEGACY_DETAILS_KEY]).length, 0,
      "an old carrier survived the write");
    assert.equal(readDetails(saved)[0].value, "2 inches");
  });

  test("filling everything in empties the blanks counter — the wanted output APPEARS", () => {
    const filled = { ...AUTO, snow_trigger: "2 inches", "contract.start_date": "1 November 2026", "contract.end_date": "31 March 2027", severe_event_threshold: "8 inches" };
    const texts = [];
    for (const s of agreementDoc().sections) {
      for (const c of s.columns) for (const w of c.widgets) texts.push(JSON.stringify(w.props));
    }
    assert.deepEqual(unfilledTokens(texts, filled), []);
  });

  test("a document nobody has typed a detail into is the document it always was", () => {
    const doc = agreementDoc();
    assert.equal(serialise(writeDetails(doc, [])), serialise(doc));
  });

  test("a value typed for a token since deleted from the page is KEPT, not thrown away", () => {
    // The author types a plowing rate, then deletes the paragraph that used it
    // and undoes their mind. Throwing the number away because the token left
    // the page for one keystroke is how work is lost.
    const withValue = writeDetails(agreementDoc(), [{ token: "plow_rate", label: "Plowing rate", value: "$625" }]);
    assert.equal(reconcileDetails(withValue, AUTO).find((r) => r.token === "plow_rate")?.value, "$625");
  });

  test("but an EMPTY row for a token that has left the page is dropped", () => {
    const withEmpty = writeDetails(agreementDoc(), [{ token: "gate_code_note", label: "Gate code note", value: "" }]);
    assert.ok(!reconcileDetails(withEmpty, AUTO).some((r) => r.token === "gate_code_note"));
  });

  test("tokensUsedBy reads the page and not the store", () => {
    const saved = writeDetails(agreementDoc(), [{ token: "snow_trigger", label: "Trigger depth", value: "2 inches" }]);
    assert.ok(tokensUsedBy(saved).includes("snow_trigger"));
    assert.equal(tokensUsedBy(saved).filter((t) => t === "snow_trigger").length, 1);
  });
});

describe("D-35 / N-1 \u00b7 the blanks counter names them and jumps", () => {
  test("the adapter registers into the ENGINE's problems list \u2014 and keeps no chips of its own", () => {
    // A-1: the engine owns the counter-as-a-button and the jump. Stream B's
    // chip row is DELETED; two counters over one fact is how they disagree.
    assert.ok(BUILDER.includes("problems={problems}"), "the adapter passes no problems");
    assert.ok(!BUILDER.includes("data-blank-chip"), "the second counter is still here");
    assert.ok(!BUILDER.includes("scrollToToken("), "the second jump is still here");
  });

  test("each problem is one plain sentence and knows where it lives", () => {
    assert.ok(BUILDER.includes("id: `blank:${token}`"));
    assert.ok(BUILDER.includes("message: `${plainLabel(token, labels)} is still blank.`"));
    assert.ok(BUILDER.includes("const at = widgetForToken(doc, token);"));
  });

  test("the jump also puts the caret in the Details box, which is where it is typed", () => {
    assert.ok(BUILDER.includes("onFocusProblem={(problem) => {"));
    assert.ok(BUILDER.includes("if (token) setFocusToken(token);"));
  });

  test("the refusal message names them in plain words too", () => {
    assert.ok(BUILDER.includes("blanks.slice(0, 4).map((t) => plainLabel(t, labels))"));
    assert.ok(BUILDER.includes("Type them into the Details boxes on the left"),
      "the refusal still does not say where the fields are");
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

  test("every shipped template that can be signed carries a total above the signature", () => {
    for (const key of ["service_agreement", "platform_proposal", "simple_proposal", "maintenance_plan"]) {
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
});

/* ══════════════════════════════════════════════════════════════════════════
   D-37 — the sections that shipped empty
   ══════════════════════════════════════════════════════════════════════════ */

describe("D-37 · a template's sections arrive with real content", () => {
  const doc = () => templateByKey("service_agreement").build();

  test("\"Agreement at a glance\" is not an empty paragraph and three blank rows", () => {
    const section = doc().sections.find((s) => s.label === "Agreement at a glance");
    const [para, box] = section.columns[0].widgets;
    assert.ok(String(para.props.text).length > 60, "the opening paragraph is still empty");
    // D-156: one `key_fact` widget per row, in a box, instead of one lump.
    const rows = box.children.map((w) => w.props);
    assert.ok(rows.length >= 5);
    assert.ok(rows.every((r) => String(r.label).trim() && String(r.value).trim()),
      "a key-fact row is still blank");
  });

  test("the glance rows are MERGE FIELDS, so they fill from the customer pick", () => {
    const section = doc().sections.find((s) => s.label === "Agreement at a glance");
    const values = section.columns[0].widgets[1].children.map((w) => w.props.value).join(" ");
    assert.match(values, /\{\{customer\.name\}\}/);
    assert.match(values, /\{\{property\.address\}\}/);
    assert.match(values, /\{\{snow_trigger\}\}/);
  });

  test("a callout with a title has a body — a heading is not an explanation", () => {
    const pricing = doc().sections.find((s) => s.label === "Pricing schedule");
    const callout = pricing.columns[0].widgets.find((w) => w.kind === "callout");
    for (const panel of callout.props.panels) {
      assert.ok(String(panel.title).trim(), "a panel has no title");
      assert.ok(String(panel.body).trim().length > 40, `"${panel.title}" still has no body`);
    }
  });

  test("\"Property service plan\" is not a bare heading that prints as an empty page", () => {
    const plan = doc().sections.find((s) => s.label === "Property service plan");
    const rows = plan.columns[0].widgets[0].props.rows;
    assert.ok(rows.length >= 5, "the service plan still ships with no rows");
    assert.ok(rows.every((r) => String(r.label).trim()), "a plan row has no label");
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
    for (const kind of ["address_block", "property_plan"]) {
      assert.ok(!WIDGETS_BY_KIND[kind].controls.some((c) => c.key === "locationId"),
        `${kind} still declares an empty locationId select, so the label prints twice`);
    }
    assert.equal((BUILDER.match(/<span style=\{LBL\}>Which location<\/span>/g) || []).length, 1);
  });

  test("no proposal widget declares a select with no options to fill it", () => {
    for (const kind of ["price_line", "pricing_table", "card", "catalog_card", "totals",
      "address_block", "property_plan", "key_fact", "clauses", "doc_header", "signature"]) {
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
    assert.ok("logoUrl" in WIDGETS_BY_KIND.doc_header.defaults);
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
