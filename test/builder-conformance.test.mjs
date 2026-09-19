// test/builder-conformance.test.mjs — THE CATALOGUE, AS ASSERTIONS.
//
// D156_CONFORMANCE_AUDIT_2026-09-17.md, the Portal's rows. Each describe below
// is one of the audit's points, and each one is pinned against the MACHINE
// FILES rather than against a hand-written expectation wherever the catalogue
// has an answer — which was audit point 12's whole complaint: exactly one pin
// existed, and it was the container's.
//
//   3  the card's fields and panel sections ARE `price-table`'s, plus the
//      currency symbol, plus "at most one Recommended in a row"
//   4  the Binding section on EVERY catalogue-bound widget, three refresh
//      modes, three on-empty values, freeze-on-send, "typed, not live"
//   1  the Portal writes every key a publish has to carry
//   9  the free HTML box a person can actually add
//   7  three widget states, three sentences, never the bare word "locked"
//   g  upgrade-on-open renames, and the golden that says an untouched
//      document is untouched
//
// MUTATION CHECKS — each made red on purpose on 2026-09-17, then restored. The
// harness is scripts/dev/d156-conformance-mutation-check.mjs and it names the
// test each one is expected to break.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  WIDGETS, WIDGETS_BY_KIND, controlOptions, controlSections, optionValue, widgetDescription,
} from "../src/builder/registry.ts";
import {
  CURRENCY_SYMBOLS, RIBBON_PRESETS, BINDING_CONTROLS, BOUND_KINDS,
  ON_EMPTY_CHOICES, REFRESH_MODES, TYPED_NOT_LIVE, PUT_IT_BACK,
  bindingSettings, cardFields, currencyGlyph, freezeOnSend, htmlOf, isBound,
  isPinned, isRecommended, onEmptyOf, overriddenFields, priceWithoutSymbol,
  NO_BUSINESS_RATE_SENTENCE,
  putItBackProps, refreshModeOf, ribbonProps, selectionOf, selectionProps, tagOf,
} from "../src/builder/widgets/index.ts";
import {
  PLAN_SENTENCE, ownershipSentence, productOf, widgetLock, widgetState,
} from "../src/builder/tier.ts";
import {
  deserialise, editWidgetText, emptyDocument, makeSection, serialise, walkWidgets,
} from "../src/builder/model.ts";
import {
  cloneNode, makeContainer, makeWidget, patchNode, resetIds,
} from "../src/builder/treeOps.ts";
import { needsUpgrade, renameProps, upgradeDocument } from "../src/builder/upgrade.ts";
import { containerLayout, makeContext, renderWidget } from "../src/builder/render.ts";
import { toWire } from "../src/builder/proposalDoc.ts";
import { documentTotals } from "../src/builder/totals.ts";

const PRICE_TABLE = JSON.parse(
  readFileSync(new URL("./fixtures/elementor-price-table-controls.json", import.meta.url), "utf8"),
);
const CONTAINER = JSON.parse(
  readFileSync(new URL("./fixtures/elementor-container-controls.json", import.meta.url), "utf8"),
);

function doc(widgets) {
  const d = emptyDocument();
  const sec = makeSection({});
  sec.columns[0].widgets = widgets;
  d.sections = [sec];
  return d;
}
const view = (d, extra = {}) => renderWidget(
  d.sections[0].columns[0].widgets[0], makeContext(d, { mode: "view", ...extra }));
const edit = (d, extra = {}) => renderWidget(
  d.sections[0].columns[0].widgets[0], makeContext(d, { mode: "edit", ...extra }));

/* ══════════════════════════════════════════════════════════════════════════
   POINT 3 — the card IS the price table
   ══════════════════════════════════════════════════════════════════════════ */

describe("point 3 · a card's fields are the price table's, pinned to the machine file", () => {
  const CARD = WIDGETS_BY_KIND.card;

  test("every control the card declares is a key the price table has", () => {
    // MUTATION: rename `heading` back to `title` in CARD_DEF → red here, by name.
    const ours = CARD.controls.map((c) => c.key);
    const theirs = Object.keys(PRICE_TABLE.controls);
    // Ours that are the price table's, and the three that are deliberately
    // ours because the price table has no answer for them.
    const OURS_ALONE = new Set(["description", "ribbon_color", "ribbon_preset"]);
    for (const key of ours) {
      if (OURS_ALONE.has(key)) continue;
      assert.ok(theirs.includes(key),
        `the card writes \`${key}\`, which Elementor's price table does not have`);
    }
    // …and the nine the audit named are all there, not just some of them.
    for (const key of [
      "heading", "heading_tag", "price", "currency_symbol", "currency_symbol_custom",
      "period", "sale", "original_price", "features_list",
      "footer_additional_info", "button_text", "link",
      "show_ribbon", "ribbon_title", "ribbon_horizontal_position",
    ]) {
      assert.ok(ours.includes(key), `the card has no \`${key}\` control`);
    }
  });

  test("the Inspector's sections are the price table's five, in its order", () => {
    // MUTATION: drop `section: "Ribbon"` from show_ribbon → red here.
    const ours = [];
    for (const g of controlSections(CARD.controls)) {
      if (g.section && !ours.includes(g.section)) ours.push(g.section);
    }
    assert.deepEqual(ours, ["Heading", "Pricing", "Features", "Footer", "Ribbon"]);
    // BY POSITION against the catalogue's own five, because the first one is
    // the one deliberate rename ("Header" → "Heading", the word the three
    // D-156 repos agreed on) and every other word must match exactly.
    const theirs = PRICE_TABLE.content_panel_sections;
    assert.equal(ours.length, theirs.length);
    assert.deepEqual(ours.slice(1), theirs.slice(1),
      "a panel section drifted from the catalogue's own wording");
    assert.equal(theirs[0], "Header", "the catalogue's first section is no longer Header");

    // EVERY control is IN one of the five, and each section is CONTIGUOUS — a
    // control with no section falls into the panel's own body between two
    // named groups, which reads as a control that belongs to neither.
    const groups = controlSections(CARD.controls);
    for (const g of groups) {
      assert.ok(g.section,
        `these card controls are in no section at all: ${g.controls.map((c) => c.key).join(", ")}`);
    }
    assert.equal(groups.length, 5, "a card's section was split in two by a control out of order");
  });

  test("every value a card's select can store is a value Elementor offers", () => {
    // MUTATION: change `heading_tag`'s options to English labels that slugify
    // to "biggest" → red here, because Elementor has no such tag.
    for (const c of CARD.controls) {
      if (c.type !== "select") continue;
      const theirs = PRICE_TABLE.controls[c.key];
      if (!theirs || !theirs.options) continue;      // ours alone — ribbon_preset
      for (const o of controlOptions(c)) {
        // The empty value is "not set", which every control on the platform
        // has and no catalogue option list carries.
        if (o.value === "") continue;
        assert.ok(theirs.options.includes(o.value),
          `a card can store ${c.key}="${o.value}", which Elementor does not offer`);
      }
    }
  });

  test("the currency symbol is drawn, and an old card does not read $$525", () => {
    // MUTATION: make `priceWithoutSymbol` return the price unchanged → red.
    assert.equal(currencyGlyph({ currency_symbol: "dollar" }), "$");
    assert.equal(currencyGlyph({ currency_symbol: "custom", currency_symbol_custom: "R$" }), "R$");
    assert.equal(currencyGlyph({}), "", "a card with no currency chosen draws no glyph");
    assert.equal(priceWithoutSymbol("$525", "$"), "525");
    assert.equal(priceWithoutSymbol("525", "$"), "525");
    // NOTHING is stripped when no symbol is set, which is why every card
    // already on the line prints exactly what it printed.
    assert.equal(priceWithoutSymbol("$525", ""), "$525");
    const html = view(doc([makeWidget("card", { heading: "Plan", price: "$525", currency_symbol: "dollar" })]));
    assert.ok(html.includes('<span class="bx-cur">$</span>'), "the currency symbol is not drawn");
    assert.match(html, /class="bx-now"[^>]*>525</, "the price is drawn with two symbols");
  });

  test("the old price is only struck through when the author says it is a saving", () => {
    // MUTATION: draw `original_price` whatever `sale` says → red here.
    const on = view(doc([makeWidget("card", { heading: "P", price: "10", original_price: "20", sale: "yes" })]));
    assert.ok(on.includes("20"), "a saving the author asked for is not shown");
    const off = view(doc([makeWidget("card", { heading: "P", price: "10", original_price: "20", sale: "" })]));
    assert.ok(!off.includes("20"), "a number behind a switched-off saving reached the page");
    // …and a card written before `sale` existed still shows its old price,
    // because the number's PRESENCE is what it meant at the time.
    assert.equal(cardFields({ original_price: "20" }).sale, true);
  });

  test("the heading is drawn as the tag the author chose, and only Elementor's", () => {
    const h = view(doc([makeWidget("card", { heading: "Plan", heading_tag: "h3" })]));
    assert.ok(h.includes("<h3 class=\"bx-card-name\""), "heading_tag was ignored");
    // Junk never reaches the page as markup.
    const junk = view(doc([makeWidget("card", { heading: "Plan", heading_tag: "script" })]));
    assert.ok(!junk.includes("<script"), "a tag out of a document reached the page");
  });

  test("AT MOST ONE RECOMMENDED IN A ROW — the model enforces it (F.1.4)", () => {
    // MUTATION: delete `clearRecommendedSiblings`'s call in `patchNode` → red.
    resetIds();
    const a = makeWidget("card", { heading: "A" });
    const b = makeWidget("card", { heading: "B" });
    const c = makeWidget("card", { heading: "C" });
    const row = makeContainer({ direction: "row" }, [a, b, c]);
    let d = doc([row]);

    d = patchNode(d, a.id, ribbonProps({ text: "Recommended", preset: "recommended" }));
    const at = (id) => [...walkWidgets(d)].find((x) => x.widget.id === id).widget;
    assert.equal(isRecommended(at(a.id).props), true);

    // The second one takes it off the first. Two recommendations is none.
    d = patchNode(d, b.id, ribbonProps({ text: "Recommended", preset: "recommended" }));
    assert.equal(isRecommended(at(b.id).props), true, "the card just set is not the recommended one");
    assert.equal(isRecommended(at(a.id).props), false, "two cards in one row say Recommended");
    assert.equal(tagOf(at(a.id).props), null, "the card the ribbon came off still wears one");

    // A DIFFERENT preset is not exclusive: Best Price and Recommended can sit
    // side by side, because they say different things.
    d = patchNode(d, c.id, ribbonProps({ text: "Best Price", preset: "best_price" }));
    assert.equal(tagOf(at(c.id).props).text, "Best Price");
    assert.equal(isRecommended(at(b.id).props), true, "Best Price cleared the recommended card");

    // …and the rule is about SIBLINGS. A card in another row keeps its own.
    resetIds();
    const x = makeWidget("card", { heading: "X" });
    const y = makeWidget("card", { heading: "Y" });
    let two = doc([makeContainer({ direction: "row" }, [x]), makeContainer({ direction: "row" }, [y])]);
    two = patchNode(two, x.id, ribbonProps({ text: "Recommended", preset: "recommended" }));
    two = patchNode(two, y.id, ribbonProps({ text: "Recommended", preset: "recommended" }));
    const atTwo = (id) => [...walkWidgets(two)].find((n) => n.widget.id === id).widget;
    assert.equal(isRecommended(atTwo(x.id).props), true, "a card in another row lost its ribbon");
    assert.equal(isRecommended(atTwo(y.id).props), true);
  });

  test("the ribbon's words come off with the ribbon", () => {
    // MUTATION: have `ribbonProps(null)` write only `show_ribbon: ""` → red.
    // A title left behind a switch the author turned off is a draft, not a
    // decision, and the next reader with a tolerant eye puts it back on.
    const off = ribbonProps(null);
    assert.equal(off.show_ribbon, "");
    assert.equal(off.ribbon_title, "", "the ribbon's words were left behind the switch");
    assert.equal(off.ribbon_preset, "", "the ribbon's preset was left behind the switch");
    assert.equal(tagOf(off), null);
  });

  test("THE PANEL WRITES THROUGH THE ONE SEAM, so a nested card obeys the rule", () => {
    // MUTATION: put the hand-rolled sections→columns→widgets walk back into
    // ProposalBuilder's `patch` → red here.
    //
    // Found by DRIVING it on 2026-09-17: the proposal's widget panel wrote
    // props with its own walk, which reached only the TOP of a column. So
    // every button in that panel silently did nothing on a card inside the row
    // *Choose your plan* places, and the one-Recommended rule — which lives in
    // `patchNode` — never ran for anything written from there.
    const BUILDER = readFileSync(new URL("../src/builder/proposal/ProposalBuilder.tsx", import.meta.url), "utf8");
    assert.match(BUILDER, /onChange\(patchNode\(doc, widget\.id, props\)\);/,
      "the panel writes a widget's props its own way again");
    assert.ok(!/widgets: c\.widgets\.map\(\(w\) => \(w\.id === widget\.id/.test(BUILDER),
      "the hand-rolled walk that could not reach a nested card is back");

    // …and the rule fires for a card at DEPTH, which is where every card the
    // ready-made section places actually is.
    resetIds();
    const a = makeWidget("card", { heading: "A" });
    const b = makeWidget("card", { heading: "B" });
    let d = doc([makeContainer(undefined, [makeContainer({ direction: "row" }, [a, b])])]);
    d = patchNode(d, a.id, ribbonProps({ text: "Recommended", preset: "recommended" }));
    d = patchNode(d, b.id, ribbonProps({ text: "Recommended", preset: "recommended" }));
    const at = (id) => [...walkWidgets(d)].find((x) => x.widget.id === id).widget;
    assert.equal(at(b.id).props.show_ribbon, "yes", "a card three deep could not be written at all");
    assert.equal(isRecommended(at(a.id).props), false, "the rule does not reach a card inside a box");
  });

  test("the six ribbon wordings D-157 named are all offered, keyed by meaning", () => {
    assert.deepEqual(RIBBON_PRESETS.map((r) => r.preset),
      ["recommended", "best_price", "most_popular", "best_value", "new", "limited"]);
    // THE WORDS, in ONE capitalisation, byte-identical in oliver
    // `lib/builderCard.js` and LUMEN `src/lib/builderCard.js` (agreed with
    // stream O, 2026-09-17). Three cards must not spell one idea three ways.
    assert.deepEqual(RIBBON_PRESETS.map((r) => r.text),
      ["Recommended", "Best price", "Most popular", "Best value", "New", "Limited"]);
    // …and the reader matches a ribbon whose words were typed in any case, so
    // a card written before the capitalisation was agreed keeps its meaning.
    assert.equal(tagOf({ show_ribbon: "yes", ribbon_title: "Best Price" }).preset, "best_price");
    const preset = WIDGETS_BY_KIND.card.controls.find((c) => c.key === "ribbon_preset");
    assert.deepEqual(controlOptions(preset).map((o) => o.value),
      ["recommended", "best_price", "most_popular", "best_value", "new", "limited", "custom"]);
  });

  test("the ribbon's position is Elementor's own two, and nothing else", () => {
    const pos = WIDGETS_BY_KIND.card.controls.find((c) => c.key === "ribbon_horizontal_position");
    assert.deepEqual(controlOptions(pos).map((o) => o.value), ["right", "left"]);
    for (const o of controlOptions(pos)) {
      assert.ok(PRICE_TABLE.controls.ribbon_horizontal_position.options.includes(o.value));
    }
    assert.ok(view(doc([makeWidget("card", {
      heading: "P", show_ribbon: "yes", ribbon_title: "Popular", ribbon_horizontal_position: "left",
    })])).includes('data-ribbon-position="left"'));
  });

  test("a select's stored value is the catalogue's word, not a slug of its label", () => {
    // The whole reason `controlOptions` accepts two shapes: "I type it with the
    // price" does not slugify to the empty string, and "Biggest" does not
    // slugify to `h2`.
    const cur = WIDGETS_BY_KIND.card.controls.find((c) => c.key === "currency_symbol");
    assert.deepEqual(controlOptions(cur).map((o) => o.value), CURRENCY_SYMBOLS.map((c) => c.key));
    assert.equal(optionValue(cur, "dollar"), "dollar");
    // …and the older shape still works, for the 60-odd entries that use it.
    const plain = { key: "k", label: "l", type: "select", options: ["Dark band", "Light"] };
    assert.deepEqual(controlOptions(plain), [
      { value: "dark_band", label: "Dark band" }, { value: "light", label: "Light" },
    ]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   POINT 4 — the Binding section, on every bound widget
   ══════════════════════════════════════════════════════════════════════════ */

describe("point 4 · the Binding section is on EVERY catalogue-bound widget", () => {
  test("all four of them declare the same five controls", () => {
    // MUTATION: remove `...BINDING_CONTROLS` from PRICE_LINE_DEF → red here.
    const shared = BINDING_CONTROLS.map((c) => c.key);
    assert.deepEqual(shared, ["_ia_source", "_ia_selection", "refresh", "on_empty", "overrides"]);
    /* D-165 — `address_block` is `service_location` (or `customer`, by its
       binding), and `customer` is a fifth bound kind. */
    for (const kind of ["catalog_card", "price_line", "service_location", "customer", "totals"]) {
      const def = WIDGETS_BY_KIND[kind];
      assert.ok(def, `${kind} is not in the registry`);
      const keys = def.controls.map((c) => c.key);
      for (const k of shared) {
        assert.ok(keys.includes(k), `${kind} has no \`${k}\` — a client who learnt it on a card would not find it`);
      }
      // …and it is the SAME section on each, so the panel draws one group.
      for (const c of def.controls) {
        if (shared.includes(c.key)) assert.equal(c.section, "Binding", `${kind}.${c.key} is in the wrong group`);
      }
      assert.ok(isBound(kind), `${kind} is not on the one list of bound kinds`);
      assert.ok(BOUND_KINDS[kind], `${kind} has no source`);
    }
  });

  test("THREE refresh modes, and the third is a stored value, not an absence", () => {
    // MUTATION: drop "snapshot_send" from REFRESH_MODES → red here.
    assert.deepEqual(REFRESH_MODES.map((m) => m.value),
      ["live", "snapshot_publish", "snapshot_send"]);
    assert.equal(refreshModeOf({}), "live", "absent must mean live");
    assert.equal(refreshModeOf({ refresh: "snapshot_publish" }), "snapshot_publish");
    assert.equal(refreshModeOf({ refresh: "snapshot_send" }), "snapshot_send");
    // The one pinned mode there used to be meant "do not move under the
    // customer", which is the SEND one.
    assert.equal(refreshModeOf({ refresh: "snapshot" }), "snapshot_send");
    assert.equal(refreshModeOf({ refresh: "nonsense" }), "live");
    // BOTH pinned modes ignore the catalogue in the room.
    assert.equal(isPinned({ refresh: "live" }), false);
    assert.equal(isPinned({ refresh: "snapshot_publish" }), true);
    assert.equal(isPinned({ refresh: "snapshot_send" }), true);
  });

  test("THREE on-empty values, and each does a different thing", () => {
    assert.deepEqual(ON_EMPTY_CHOICES.map((c) => c.value), ["hide", "placeholder", "last_snapshot"]);
    assert.equal(onEmptyOf({}), "hide");
    assert.equal(onEmptyOf({ onEmpty: "placeholder" }), "placeholder", "the older spelling is not read");
    assert.equal(onEmptyOf({ on_empty: "last_snapshot" }), "last_snapshot");

    const unbound = (onEmpty) => view(doc([makeWidget("catalog_card", { on_empty: onEmpty })]));
    assert.equal(unbound("hide"), "", "hide drew something");
    assert.ok(unbound("placeholder").includes("bx-card-empty"), "placeholder held no space");
    assert.ok(!unbound("placeholder").includes("Pick one of your"),
      "a customer's placeholder carries words the author never wrote");

    // LAST SNAPSHOT — a page a visitor is reading does not lose a price
    // because a catalogue row was renamed this morning.
    const stale = view(doc([makeWidget("catalog_card", {
      on_empty: "last_snapshot",
      _ia_snapshot: { title: "Winter plan", price: "$1,200.00", per: "a month", bullets: [] },
    })]));
    assert.ok(stale.includes("Winter plan") && stale.includes("$1,200.00"),
      "the last snapshot was not shown");
    // …and the AUTHOR always gets the placeholder, whatever they chose: a
    // widget that draws nothing on the canvas cannot be clicked to fix.
    assert.ok(edit(doc([makeWidget("catalog_card", { on_empty: "hide" })])).includes("Pick one of your"));
  });

  test("`_ia_selection` is the ONE home, and the four loose spellings are read", () => {
    // MUTATION: make `selectionOf` read only `_ia_selection` → red here.
    assert.deepEqual(selectionOf({ _ia_selection: { offering_id: "o1", price_id: "p1" } }),
      { offeringId: "o1", priceId: "p1", locationId: "" });
    assert.equal(selectionOf({ offeringId: "o2" }).offeringId, "o2");
    assert.equal(selectionOf({ offering_id: "o3" }).offeringId, "o3");
    assert.equal(selectionOf({ priceId: "p4" }).priceId, "p4");
    assert.equal(selectionOf({ locationId: "LOC-9" }).locationId, "loc-9", "a location id is compared lower-cased");
    // The writer CLEARS the loose keys, so a binding cannot come back from a
    // key nothing reads.
    const w = selectionProps("oliver:catalogue", { offeringId: "o5" });
    assert.deepEqual(w._ia_selection, { offering_id: "o5" });
    for (const k of ["offeringId", "priceId", "offering_id", "price_id"]) assert.equal(w[k], "");
    // A LOCATION keeps `locationId` — oliver-api reads it off the stored
    // document to open a job per site, so moving it is another repo's schema.
    const loc = selectionProps("lumen:locations", { locationId: "LOC-2" });
    assert.equal(loc.locationId, "loc-2");
    assert.equal(loc._ia_selection, undefined);
  });

  test("FREEZE ON SEND is merge.fill's own mode, and nothing else", () => {
    // MUTATION: make `freezeOnSend` return the document for "send" too → red.
    const card = makeWidget("catalog_card", {
      _ia_selection: { offering_id: "o1" }, refresh: "live",
    });
    const d = doc([card]);
    const resolve = () => ({ title: "Winter", price: "$99.00" });

    // A DRAFT is the same document, by identity, so no golden moves.
    assert.equal(freezeOnSend(d, "view", resolve), d);
    assert.equal(freezeOnSend(d, "edit", resolve), d);

    const sent = freezeOnSend(d, "send", resolve);
    assert.notEqual(sent, d, "the sent copy was not frozen");
    const frozen = sent.sections[0].columns[0].widgets[0];
    assert.equal(frozen.props.refresh, "snapshot_send");
    assert.equal(frozen.props._ia_snapshot.price, "$99.00");
    assert.equal(frozen.props._ia_source, "oliver:catalogue");
    // The ORIGINAL is untouched: the author keeps editing a live document.
    assert.equal(d.sections[0].columns[0].widgets[0].props.refresh, "live");

    // A widget the caller has no data for is LEFT ALONE. Freezing a card to
    // nothing would replace a live price with a blank one on a signed copy.
    assert.equal(freezeOnSend(d, "send", () => null), d);

    // AND A CARD THE AUTHOR ALREADY PINNED keeps the figures they pinned.
    const pinned = doc([makeWidget("catalog_card", {
      _ia_selection: { offering_id: "o1" }, refresh: "snapshot_publish",
      _ia_snapshot: { title: "Old", price: "$1.00" },
    })]);
    assert.equal(freezeOnSend(pinned, "send", resolve), pinned);
  });

  test("the proposal's SEND is the seam, and a draft save is not", () => {
    // MUTATION: make `toWire` ignore `fill` → red here.
    const card = makeWidget("catalog_card", { _ia_selection: { offering_id: "off-1" } });
    const d = doc([card]);
    const catalogue = [{
      offering_id: "off-1", name: "Winter plan", description: "", features_json: "[]",
      prices: [{ price_id: "p1", unit_amount: 1200, is_default: true, label: "", pricing_model: "flat" }],
    }];
    const draft = toWire(d, { catalogue });
    assert.equal(draft.document, d, "a draft save froze the document");

    const sent = toWire(d, { catalogue, fill: "send" });
    const w = sent.document.sections[0].columns[0].widgets[0];
    assert.equal(w.props.refresh, "snapshot_send");
    assert.equal(w.props._ia_snapshot.title, "Winter plan");
    // …and the narrative, the line items and the stored model are all views of
    // the SAME copy — the frozen one.
    assert.ok(sent.scope_html.includes("Winter plan"));
  });

  test("“typed, not live”, and the words that put it back", () => {
    assert.equal(TYPED_NOT_LIVE, "Typed, not live");
    assert.equal(PUT_IT_BACK, "Put it back");
    assert.deepEqual(overriddenFields({ overrides: { title: "Ours", bullets: [] } }), ["title"]);
    assert.deepEqual(overriddenFields({ overrides: { title: "  " } }), [],
      "a blank override counts as typed");
    assert.deepEqual(putItBackProps(), { overrides: {} });
    const BUILDER = readFileSync(new URL("../src/builder/proposal/ProposalBuilder.tsx", import.meta.url), "utf8");
    assert.ok(BUILDER.includes("TYPED_NOT_LIVE"), "the canvas does not say a field is typed");
    assert.ok(BUILDER.includes("PUT_IT_BACK"), "there is no way to put it back");
  });

  test("A TYPED WORD GOES INTO `overrides`, which is what makes the sentence true", () => {
    // MUTATION: drop `into: "overrides"` from renderCatalogCard → red here.
    //
    // Found by driving it, 2026-09-17: a catalogue card's name and description
    // were editable runs writing `props.heading` — the card's OWN field — so
    // `overriddenFields` saw nothing, "typed, not live" never appeared and
    // "Put it back" had nothing to put back. The comment beside them said
    // otherwise, which is the shape of defect this whole pass is about.
    const catalogue = [{
      offering_id: "off-1", name: "Winter plan", description: "We plough.", features_json: "[]",
      prices: [{ price_id: "p1", unit_amount: 1200, is_default: true, label: "", pricing_model: "flat" }],
    }];
    const bound = makeWidget("catalog_card", { _ia_selection: { offering_id: "off-1" } });
    const html = edit(doc([bound]), { catalogue });
    assert.ok(html.includes('data-edit="overrides.heading"'),
      "typing over a bound card's name writes the card's own field, not an override");
    assert.ok(html.includes('data-edit="overrides.description"'));
    assert.ok(html.includes('data-edit="overrides.features_list.0.item_text"'));
    // …and the PRICE is not one of them: a price you can type over on the card
    // is a price that no longer matches what you sell.
    assert.ok(!html.includes('data-edit="overrides.price"'));
    assert.ok(!html.includes('data-edit="price"'), "a bound card's price is typeable");

    // A TYPED CARD is unchanged — its own fields, no prefix — so nothing that
    // was editable before this stopped being editable.
    const typed = edit(doc([makeWidget("card", { heading: "H" })]));
    assert.ok(typed.includes('data-edit="heading"'));
    assert.ok(!typed.includes('data-edit="overrides.heading"'));

    // And the round trip: what the canvas writes is what `overriddenFields`
    // reads, by the same name, with a plain-words label for the sentence.
    const over = { ...bound.props, overrides: { heading: "Our winter plan" } };
    assert.deepEqual(overriddenFields(over), ["heading"]);
  });

  test("the binding reads its older spellings, so a half-migrated card behaves", () => {
    const b = bindingSettings({ onEmpty: "placeholder", snapshot: { title: "T" }, refresh: "snapshot" });
    assert.equal(b.onEmpty, "placeholder");
    assert.equal(b.snapshot.title, "T");
    assert.equal(b.refresh, "snapshot_send");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   POINT 5 — the tax rate, whose mode used to resolve to nothing
   ══════════════════════════════════════════════════════════════════════════ */

describe("point 5 · a document taxed at the business default SAYS so when there is none", () => {
  test("the three modes are a control, and the canonical names are what is written", () => {
    // MUTATION: drop the `tax_mode` control from TOTALS_DEF → red here.
    //
    // The audit's point 5: `taxMode: "business"` was a stored enum value that
    // resolved to nothing — a proposal reading "taxed at the business default"
    // was taxed at zero, and nothing anywhere said so. Stream O built the
    // column, the resolver and the send-time stamp; this is the canvas's half.
    const def = WIDGETS_BY_KIND.totals;
    const mode = def.controls.find((c) => c.key === "tax_mode");
    assert.ok(mode, "the three tax states are still a stored word nothing sets");
    assert.deepEqual(controlOptions(mode).map((o) => o.value), ["business", "document", "none"]);
    assert.ok(def.controls.some((c) => c.key === "tax_rate"));
    // `tax_rate_resolved` is the SERVER's, stamped once on send. The widget
    // must not declare it, or an author could move a figure a customer saw.
    assert.ok(!def.controls.some((c) => c.key === "tax_rate_resolved"),
      "the widget offers to write the server's own resolved rate");
    assert.ok(!("tax_rate_resolved" in def.defaults));
    const BUILDER = readFileSync(new URL("../src/builder/proposal/ProposalBuilder.tsx", import.meta.url), "utf8");
    assert.ok(!/patch\(\{[^}]*tax_rate_resolved/.test(BUILDER),
      "the panel writes the server's resolved rate");
  });

  test("the sentence is the SERVER's own words, and only the author reads it", () => {
    // MUTATION: make `renderTotals` drop the unresolved warning → red here.
    assert.equal(NO_BUSINESS_RATE_SENTENCE,
      "No tax rate set for this business - set one under Settings > Billing");
    const t = makeWidget("totals", { heading: "Your total", tax_mode: "business" });
    const d = doc([makeWidget("price_line", { name: "X", unit_price: 100, quantity: 1 }), t]);
    const render = (mode) => renderWidget(
      d.sections[0].columns[0].widgets[1], makeContext(d, { mode }));

    // The words reach the page HTML-escaped, like every other string the
    // renderer puts out — `>` becomes `&gt;` and nothing else moves.
    const onPage = NO_BUSINESS_RATE_SENTENCE.replace(/>/g, "&gt;");
    const author = render("edit");
    assert.ok(author.includes(onPage), "nothing tells the author the rate is missing");
    assert.ok(author.includes('data-tax-unresolved="1"'));

    // A CUSTOMER never reads it — a sentence on a page somebody signs has to
    // be one the author wrote — and no tax row is printed either, never $0.00.
    const customer = render("view");
    assert.ok(!customer.includes(onPage), "our sentence reached a customer's page");
    assert.ok(!/Tax/.test(customer), "a tax row was printed with nothing in it");

    // RESOLVED, and the sentence is gone and the row is back.
    const ok = makeWidget("totals", { tax_mode: "business", tax_rate_resolved: 6.5 });
    const d2 = doc([makeWidget("price_line", { name: "X", unit_price: 100, quantity: 1 }), ok]);
    const html = renderWidget(d2.sections[0].columns[0].widgets[1], makeContext(d2, { mode: "edit" }));
    assert.ok(!html.includes(onPage));
    assert.ok(html.includes("Tax 6.5%"));
  });

  test("the old tax spellings open as the new ones, and No tax keeps the number", () => {
    const d = deserialise(JSON.stringify({
      v: 2, settings: { style: "plain" },
      sections: [{
        id: "s1", layout: 1, width: "contained", padding: 24, theme: "light", visibility: "customer",
        columns: [{ id: "c1", widgets: [
          { id: "w1", kind: "totals", props: { taxMode: "document", taxRatePercent: 7.25, taxLabel: "Ohio" } },
        ] }],
      }],
    }));
    const p = d.sections[0].columns[0].widgets[0].props;
    assert.equal(p.tax_mode, "document");
    assert.equal(p.tax_rate, 7.25);
    assert.equal(p.tax_label, "Ohio");
    for (const old of ["taxMode", "taxRatePercent", "taxLabel"]) {
      assert.ok(!(old in p), `\`${old}\` is still on the totals widget`);
    }
    // A document that carried a rate and NO mode meant "this document only",
    // and writing that down is what stops it drifting.
    const d2 = deserialise(JSON.stringify({
      v: 2, settings: { style: "plain" },
      sections: [{
        id: "s1", layout: 1, width: "contained", padding: 24, theme: "light", visibility: "customer",
        columns: [{ id: "c1", widgets: [{ id: "w1", kind: "totals", props: { taxRatePercent: 5 } }] }],
      }],
    }));
    assert.equal(d2.sections[0].columns[0].widgets[0].props.tax_mode, "document");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   POINT 1 — what the Portal writes, and what a publish has to carry
   ══════════════════════════════════════════════════════════════════════════ */

describe("point 1 · every key a box can hold is a key the Portal writes", () => {
  test("`html_tag` is settable, honoured, and only Elementor's own list", () => {
    // MUTATION: delete the html_tag select from the Inspector's Layout group
    // → red here. It was honoured by the renderer and settable by nobody.
    const INSPECTOR = readFileSync(new URL("../src/builder/Inspector.tsx", import.meta.url), "utf8");
    assert.ok(INSPECTOR.includes("data-box-html-tag"), "nothing in any UI sets what a box is drawn as");
    assert.ok(INSPECTOR.includes("html_tag: e.target.value"), "the control writes into the wrong key");
    // Every value the control offers is a value Elementor offers.
    const offered = [...INSPECTOR.matchAll(/data-box-html-tag[\s\S]*?<\/select>/g)][0][0]
      .match(/<option value="([^"]*)"/g).map((m) => m.slice(15, -1));
    for (const v of offered) {
      assert.ok(CONTAINER.controls.html_tag.options.includes(v),
        `the Layout group offers html_tag="${v}", which Elementor does not`);
    }
    const box = makeContainer(undefined, []);
    box.props = { html_tag: "main" };
    assert.equal(containerLayout(box).tag, "main");
  });

  test("a box's props survive a patch and a duplicate", () => {
    // MUTATION: put `props: {}` back in `cloneNode`'s container branch → red.
    // `patchNode` REFUSED a container until this pass, so the one Elementor
    // key the engine reads could only be set by hand-editing the document.
    resetIds();
    const box = makeContainer(undefined, [makeWidget("card", { heading: "A" })]);
    let d = doc([box]);
    d = patchNode(d, box.id, { html_tag: "section" });
    const written = d.sections[0].columns[0].widgets[0];
    assert.equal(written.props.html_tag, "section", "a container's props cannot be written");

    const copy = cloneNode(written);
    assert.equal(copy.props.html_tag, "section", "a duplicated box lost what it was drawn as");
    assert.notEqual(copy.id, written.id);
  });

  test("WORDS TYPED ON THE PAGE reach a widget inside a box", () => {
    // MUTATION: put the flat `section.columns[c].widgets.findIndex` walk back
    // into BuilderShell's `onEditText` → red here.
    //
    // Found by driving it, 2026-09-17. That walk searched only the TOP of each
    // column, so typing into any card in the row *Choose your plan* places was
    // silently discarded the moment the author clicked away — and that is the
    // first card anybody meets. §11.12 made a column hold boxes; this was the
    // last reader left counting indexes into the top of one.
    const SHELL = readFileSync(new URL("../src/builder/BuilderShell.tsx", import.meta.url), "utf8");
    const fn = SHELL.slice(SHELL.indexOf("const onEditText"), SHELL.indexOf("const changeSection"));
    // THE SEAM CHANGED NAME IN THE MERGE, NOT IN KIND. Two passes fixed this
    // independently; the surviving one is `model.editWidgetText`, which is
    // `findNode` + `setPropPath` + `patchNode` behind one name that the four
    // adapter panels call too — so there is ONE implementation of "put this
    // word in that widget", not this one and a copy in the shell.
    assert.match(fn, /editWidgetText\(doc, widgetId, path, value\)/,
      "words typed on the page are committed by counting indexes again");
    const MODEL = readFileSync(new URL("../src/builder/model.ts", import.meta.url), "utf8");
    const seam = MODEL.slice(MODEL.indexOf("export function editWidgetText"),
                             MODEL.indexOf("export function widgetById"));
    assert.match(seam, /patchNode\(doc, widgetId, setPropPath\(/,
      "the seam no longer writes through patchNode, so the model rules stopped running");
    assert.match(seam, /isContainer\(hit\.node\)/,
      "the seam no longer refuses a box");
    assert.ok(!/columns\[c\]\.widgets\.findIndex/.test(fn),
      "the flat walk that could not reach a nested widget is back");

    // …AND THE SEAM ITSELF IS CALLED, three deep, which is where a card is.
    // Source text alone is not a guard: the walk can come back AROUND a
    // `patchNode` that is still written on the line. So this types through
    // `editWidgetText` — the function every surface calls — and reads the
    // document that comes back.
    resetIds();
    const card = makeWidget("card", { heading: "Old" });
    const d0 = doc([makeContainer(undefined, [makeContainer({ direction: "row" }, [card])])]);
    const d = editWidgetText(d0, card.id, "heading", "Typed on the page");
    const at = [...walkWidgets(d)].find((x) => x.widget.id === card.id).widget;
    assert.equal(at.props.heading, "Typed on the page",
      "a word typed into a card inside a row inside a box never reached the document");
  });

  test("the layout keys a publish must carry are all keys the engine WRITES", () => {
    // The audit's point 1: `alignItems` and `wrap` are author-visible controls
    // whose values are stored and were silently dropped on the way to a
    // website. This is the Portal's half of that contract — it writes all
    // seven — and the handoff names them for the arion side.
    const INSPECTOR = readFileSync(new URL("../src/builder/Inspector.tsx", import.meta.url), "utf8");
    for (const [attr, key] of [
      ["data-box-direction", "direction"], ["data-box-justify", "justify"],
      ["data-box-align", "alignItems"], ["data-box-wrap", "wrap"],
      ["data-box-gap", "gap"], ["data-box-columns", "columns"],
      ["data-box-html-tag", "html_tag"],
    ]) {
      assert.ok(INSPECTOR.includes(attr), `no control writes \`${key}\``);
    }
    // …and `width` means exactly ONE thing in this repo: how wide a SECTION's
    // content runs. No widget and no box carries a `width`, so nothing can
    // persist the two meanings the audit found on one key.
    const STYLE = readFileSync(new URL("../src/builder/style.ts", import.meta.url), "utf8");
    const layer = STYLE.slice(STYLE.indexOf("export interface StyleLayer"), STYLE.indexOf("export interface ElementStyle"));
    assert.ok(!/^\s*width\?:/m.test(layer), "a style layer gained a `width`, which already means something else");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   POINT 9 — the free HTML box
   ══════════════════════════════════════════════════════════════════════════ */

describe("point 9 · a person can add their own HTML", () => {
  test("it is a widget, free, on the three surfaces that are made of markup", () => {
    /* WIDENED 2026-09-19 (D-168, wave 2). It was website + landing.
       `BUILDER_OFFERS_2026-09-19.json` lists `html` under `newsletter.elementor`
       as well, and the offer file is the contract Brandon approved, so the
       NEWSLETTER offers it and `f1-words/html.ts` draws it in a mailbox — the
       gap F1's first wave wrote up as §6.4. A PROPOSAL still does not: the
       offer file puts `html` under the proposal's
       `not_offered_because_paper_cannot_do_them`. */
    // MUTATION: delete HTML_DEF from the f1-words family → red here.
    const def = WIDGETS_BY_KIND.html;
    assert.ok(def, "58 of the 64 page bodies on the estate are one of these and nobody can add one");
    assert.deepEqual(def.adapters.slice().sort(), ["email", "landing", "website"]);
    assert.equal(def.tier, "free", "the free page engine's own widget was gated");
    // …and NOT on a proposal or a design: arbitrary markup prints as nothing
    // in a PDF and means nothing on a pixel canvas.
    for (const a of ["proposal", "brand"]) {
      assert.ok(!def.adapters.includes(a), `raw markup is offered in the ${a} builder`);
    }
  });

  test("it says what it is in plain words, and names no vendor", () => {
    const def = WIDGETS_BY_KIND.html;
    /* PER BUILDER since wave 2: an email is not a page, so the newsletter's
       sentence says "in the email". `widgetDescription` is the one reader of
       either shape. */
    assert.equal(widgetDescription(def, "website"),
      "Paste your own HTML. It goes on the page exactly as you type it.");
    assert.equal(widgetDescription(def, "email"),
      "Paste your own HTML. It goes in the email exactly as you type it.");
    for (const a of ["website", "landing", "email"]) {
      assert.doesNotMatch(widgetDescription(def, a), /elementor|wordpress|widget/i);
    }
  });

  test("the control is a code box, and the Inspector draws a live preview", () => {
    // MUTATION: change the control's type from `code` to `textarea` → red,
    // because a words-typed-on-the-page control draws no panel field at all.
    const c = WIDGETS_BY_KIND.html.controls;
    assert.equal(c.length, 1);
    assert.equal(c[0].key, "html");
    assert.equal(c[0].type, "code");
    assert.match(c[0].help, /This is code/);
    /* The panel is drawn from the definition alone now (B-168 §C.1), so the
       code box lives in `definitionControls.tsx` and the Inspector calls it on
       all three tabs. Same markup, one file over. */
    const PANEL = readFileSync(new URL("../src/builder/definitionControls.tsx", import.meta.url), "utf8");
    assert.ok(PANEL.includes("data-code-box"), "there is no code box");
    assert.ok(PANEL.includes("data-code-preview"), "there is no live preview");
  });

  test("the markup goes on the page unchanged, and an empty box draws nothing", () => {
    assert.equal(htmlOf({ html: "<p>hi</p>" }), "<p>hi</p>");
    assert.equal(htmlOf({ code: "<p>hi</p>" }), "<p>hi</p>", "a paste into the other obvious key is lost");
    // The widget wrapper is the engine's, the same one every widget gets; what
    // is INSIDE it is the author's bytes, unchanged.
    const out = view(doc([makeWidget("html", { html: '<div class="x">Book now</div>' })]));
    assert.ok(out.includes('<div class="x">Book now</div>'), "the markup was rewritten");
    assert.ok(!out.includes("&lt;div"), "the author's markup was escaped into text");
    assert.equal(view(doc([makeWidget("html", { html: "" })])), "",
      "an unfilled code box left a gap on a visitor's page");
    assert.ok(edit(doc([makeWidget("html", {})])).includes("Paste your own HTML"));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   POINT 7 — three states, three sentences
   ══════════════════════════════════════════════════════════════════════════ */

describe("point 7 · three widget states, each with its own sentence", () => {
  test("offered, not on this plan, needs a product — never one bucket", () => {
    // MUTATION: make `widgetLock` return the plan sentence for `ia:` too
    // → red here, and in website-plan-gating.
    assert.equal(widgetState("pro", false), "offered");
    assert.equal(widgetState("pro", undefined), "offered", "silence is never a refusal");
    assert.equal(widgetState("pro", true), "plan");
    assert.equal(widgetState("ia:oliver", true), "ownership");
    const plan = widgetLock("pro", true);
    const own = widgetLock("ia:oliver", true);
    assert.notEqual(plan.sentence, own.sentence, "the two refusals read as one thing");
    assert.match(plan.sentence, /Not on your website plan/);
    assert.match(own.sentence, /Needs OLIVER, which this business does not have/);
    assert.equal(productOf("ia:spark"), "SPARK");
    assert.equal(productOf("pro"), null);
    // The server's own sentence wins when it sent one — WHAT is locked is its
    // answer and stays its answer.
    assert.equal(widgetLock("pro", "Your plan does not carry this one.").sentence,
      "Your plan does not carry this one.");
  });

  test("never the bare word “locked”, and never a vendor", () => {
    const vendor = /elementor|wordpress|rank ?math|astra|hostinger|wp-admin/i;
    for (const words of [PLAN_SENTENCE, ownershipSentence("OLIVER"), ownershipSentence("SPARK")]) {
      assert.doesNotMatch(words, /\blocked\b/i, `a client sentence says "locked": ${words}`);
      assert.doesNotMatch(words, vendor, `a client sentence names a vendor: ${words}`);
      assert.doesNotMatch(words, /\btenant\b/i, "a client screen says tenant, not business");
    }
  });

  test("the three surfaces a client reads all carry WHICH state it is", () => {
    for (const file of ["WidgetPane.tsx", "WidgetPicker.tsx", "SectionGallery.tsx"]) {
      const src = readFileSync(new URL(`../src/builder/${file}`, import.meta.url), "utf8");
      assert.ok(src.includes('"data-widget-state"'), `${file} still has one bucket for two refusals`);
      assert.ok(src.includes('"data-widget-state": "offered"'), `${file} never says a row IS offered`);
    }
  });

  test("a widget's `tier` is the GATE, and the Portal holds no plan table", () => {
    // `tier` says which of the three gates applies; whether a business passes
    // it is the server's answer. A Portal-side table of plans would be a
    // second answer to a question the server has already answered.
    const TIER = readFileSync(new URL("../src/builder/tier.ts", import.meta.url), "utf8");
    const code = TIER.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
    assert.ok(!/arion_?tier|TIER_ORDER|meetsMinTier/i.test(code), "the engine started deciding the plan");
    // …and every tier on every widget is one of the three words.
    for (const w of WIDGETS) {
      if (w.tier === undefined) continue;
      assert.ok(w.tier === "free" || w.tier === "pro" || /^ia:[a-z]+$/.test(w.tier),
        `${w.kind} has a tier of "${w.tier}", which is not one of the three`);
    }
    // The card publishes as the price table, which is paid wherever it lands.
    assert.equal(WIDGETS_BY_KIND.card.tier, "pro");
    assert.equal(WIDGETS_BY_KIND.catalog_card.tier, "ia:oliver");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   POINT (g) — upgrade on open, and the golden that says nothing moved
   ══════════════════════════════════════════════════════════════════════════ */

describe("point g · upgrade-on-open renames, and leaves everything else alone", () => {
  const stored = (widgets) => JSON.stringify({
    v: 2,
    settings: { style: "plain" },
    sections: [{
      id: "s1", layout: 1, width: "contained", padding: 24, theme: "light", visibility: "customer",
      columns: [{ id: "c1", widgets }],
    }],
  });

  test("A DOCUMENT THAT NEVER USED THE OLD NAMES IS BYTE-IDENTICAL (golden)", () => {
    // MUTATION: make `renameProps` always return a copy → red here, and in
    // builder-integration's "no composites is THE SAME OBJECT".
    const GOLDEN = [
      { id: "w1", kind: "heading", props: { text: "Choose your plan", level: 2 } },
      { id: "w2", kind: "paragraph", props: { text: "Pick one." } },
      {
        id: "w3", kind: "card",
        props: {
          heading: "Seasonal", price: "525", currency_symbol: "dollar", period: "/mo",
          original_price: "600", sale: "yes", description: "Everything.",
          features_list: ["24/7 call-out"], footer_additional_info: "To 31 March.",
          show_ribbon: "yes", ribbon_title: "Recommended", ribbon_preset: "recommended",
        },
      },
      {
        id: "w4", kind: "catalog_card",
        props: {
          _ia_source: "oliver:catalogue",
          _ia_selection: { offering_id: "off-1", price_id: "p-1" },
          refresh: "live", on_empty: "hide", overrides: {}, _ia_snapshot: null,
        },
      },
      { id: "w5", kind: "price_line", props: { name: "Salting", quantity: 2, unit_price: 85 } },
      { id: "w6", kind: "service_location", props: { locationId: "loc-3", heading: "Site" } },
      { id: "w7", kind: "totals", props: { heading: "Your total" } },
      { id: "w8", kind: "html", props: { html: "<p>Book now</p>" } },
    ];
    const wire = stored(GOLDEN);
    const d = deserialise(wire);
    assert.equal(needsUpgrade(d), false, "a document already in the new names wants upgrading");
    assert.equal(upgradeDocument(d), d, "the pass rebuilt a document it had nothing to do to");
    // The whole point: what comes out goes back in, byte for byte.
    assert.equal(serialise(deserialise(serialise(d))), serialise(d));
    // …and by IDENTITY, node by node, which is what makes the promise checkable
    // rather than a coincidence of key order.
    for (const { widget } of walkWidgets(d)) {
      assert.equal(renameProps(widget), widget, `${widget.kind} was rebuilt for nothing`);
    }
    // …and twice is the same as once.
    assert.equal(upgradeDocument(upgradeDocument(d)), d);
  });

  test("a card saved with the OLD names opens with the new ones, and loses nothing", () => {
    const d = deserialise(stored([{
      id: "w1", kind: "card",
      props: {
        title: "Per-push", per: "per push", was: "700", bullets: ["Photos"],
        note: "Small print", ctaLabel: "Choose", ctaUrl: "https://x.test",
        recommended: true,
      },
    }]));
    const p = d.sections[0].columns[0].widgets[0].props;
    assert.equal(p.heading, "Per-push");
    assert.equal(p.period, "per push");
    assert.equal(p.original_price, "700");
    // …and the SHAPE changed with the key: a flat `bullets` array becomes the
    // price table's repeater, or the canvas would write
    // `features_list.0.item_text` into an array of strings.
    assert.deepEqual(p.features_list, [{ item_text: "Photos" }]);
    assert.equal(p.footer_additional_info, "Small print");
    assert.equal(p.button_text, "Choose");
    assert.equal(p.link, "https://x.test");
    assert.equal(p.show_ribbon, "yes");
    assert.equal(p.ribbon_preset, "recommended");
    // THE OLD KEYS ARE GONE, not left beside the new ones holding a value.
    for (const old of ["title", "per", "was", "bullets", "note", "ctaLabel", "ctaUrl", "recommended", "tag"]) {
      assert.ok(!(old in p), `\`${old}\` is still on the card`);
    }
    // …and it still DRAWS, which is what the rename is for.
    const html = view(d);
    for (const words of ["Per-push", "per push", "Photos", "Small print", "Choose", "Recommended"]) {
      assert.ok(html.includes(words), `the upgraded card lost “${words}”`);
    }
  });

  test("a binding saved with the OLD names opens with the new ones", () => {
    const d = deserialise(stored([{
      id: "w1", kind: "catalog_card",
      props: {
        offeringId: "off-7", priceId: "p-2", onEmpty: "placeholder",
        snapshot: { title: "Pro", price: "$399" }, refresh: "snapshot",
      },
    }]));
    const p = d.sections[0].columns[0].widgets[0].props;
    assert.deepEqual(p._ia_selection, { offering_id: "off-7", price_id: "p-2" });
    assert.equal(p.on_empty, "placeholder");
    assert.equal(p._ia_snapshot.title, "Pro");
    assert.equal(p.refresh, "snapshot_send", "a pinned price became live under the customer");
    for (const old of ["offeringId", "priceId", "onEmpty", "snapshot"]) {
      assert.ok(!(old in p), `\`${old}\` is still on the widget`);
    }
  });

  test("a price line's catalogue ids move too, and the MONEY does not", () => {
    const d = deserialise(stored([{
      id: "w1", kind: "price_line",
      props: { name: "Plowing", quantity: 2, unit_price: 200, offering_id: "off-9", price_id: "p-3" },
    }]));
    const p = d.sections[0].columns[0].widgets[0].props;
    assert.deepEqual(p._ia_selection, { offering_id: "off-9", price_id: "p-3" });
    // The WIRE still carries them — an accepted proposal converts to a quote
    // off exactly these two fields.
    const t = documentTotals(d);
    assert.equal(t.lines[0].offering_id, "off-9");
    assert.equal(t.lines[0].price_id, "p-3");
    assert.equal(t.subtotal, 400);
  });

  test("an address block keeps `locationId` — it is another repo's key too", () => {
    const d = deserialise(stored([
      { id: "w1", kind: "service_location", props: { locationId: "LOC-4" } },
    ]));
    const p = d.sections[0].columns[0].widgets[0].props;
    assert.equal(p.locationId, "LOC-4", "the location id moved and a job would open with no address");
  });
});

/* ======================================================================
   ONE TAX CONTROL, AND A MODE THAT ALWAYS RESOLVES A NUMBER
   Found by driving the merged branch, 2026-09-17 (the landing pass).
   ====================================================================== */

describe("the tax rate has one control and one home", () => {
  test("EXACTLY ONE control sets the tax mode, and it is the widget's own", () => {
    // MUTATION: put the proposal panel's own Tax select back -> red here.
    //
    // Both passes added a tax control: the panel drew a three-option select
    // ("No tax on this document / Your business rate / A rate for this
    // document only") and the widget definition added another ("Your
    // business's own rate / This document only / No tax"). The author saw
    // TWO groups labelled Tax, with different words for the same three
    // choices, both writing tax_mode. The widget's is the one kept, because
    // it renders on every surface a Totals block is offered on.
    const PANEL = readFileSync(new URL("../src/builder/proposal/ProposalBuilder.tsx", import.meta.url), "utf8");
    assert.ok(!/<option value="business">/.test(PANEL),
      "the proposal panel is drawing a second tax control beside the widget's");
    assert.ok(!/data-tax-mode/.test(PANEL),
      "the proposal panel is drawing a second tax control beside the widget's");

    // ...and the one that survives offers all three modes, in (c)'s words.
    const taxCtl = WIDGETS_BY_KIND.totals.controls.find((c) => c.key === "tax_mode");
    assert.ok(taxCtl, "the surviving tax control is gone too");
    const modes = controlOptions(taxCtl).map((o) => o.value);
    assert.deepEqual([...modes].sort(), ["business", "document", "none"]);
  });

  test("CHOOSING THE BUSINESS RATE ALWAYS RESOLVES A NUMBER, whenever it is chosen", () => {
    // MUTATION: drop `doc` from the effect's dependencies -> red here.
    //
    // The effect that stamps the business figure onto a Totals widget ran on
    // `[businessTax]` alone, i.e. once, when the rate arrived. The rate
    // arrives while the document is opening, so every author who picked "your
    // business's own rate" afterwards stored the WORD and never got the
    // NUMBER -- and `renderTotals` draws no tax row at all when the rate is
    // null. A document taxed at nothing, with "business" written on it: the
    // audit's point 5 arriving by a second route.
    const PANEL = readFileSync(new URL("../src/builder/proposal/ProposalBuilder.tsx", import.meta.url), "utf8");
    const eff = PANEL.slice(PANEL.indexOf("THE WIDGETS THAT ARE WAITING FOR THE BUSINESS'S RATE"),
                            PANEL.indexOf("The document's money"));
    // The trigger is the DERIVED set of blocks waiting for the rate, not the
    // whole document: `[businessTax]` alone ran once (the defect), and
    // `[businessTax, doc]` loops, because the effect writes the document it
    // depends on ("Maximum update depth exceeded", found by driving it).
    assert.match(eff, /awaitingBusinessRate = useMemo\(/,
      "nothing derives which blocks are waiting for the business rate");
    assert.match(eff, /\}, \[businessTax, awaitingBusinessRate\]\);/,
      "the business rate is stamped once and never again, so the mode can store a word with no number");
    assert.ok(!/\}, \[businessTax\]\);/.test(eff),
      "the stamping effect runs only when the rate arrives again");
    // ...and it writes the CANONICAL names, which is what `totalsSettings`,
    // the PDF and oliver's mirror all read.
    assert.match(eff, /tax_rate: businessTax\.percent, tax_label: businessTax\.label/,
      "the stamped rate is written under a name nothing canonical reads");
    // and the walk is the TREE's, so a Totals block inside a box hears it —
    // a per-property subtotal is exactly where one goes.
    assert.match(eff, /walkWidgets\(doc\)/,
      "the blocks waiting for the rate are not found by walking the tree");
    assert.match(eff, /patchNode\(next, id,/,
      "the rate is not written by node id, so a block inside a box misses it");
  });

  test("a tax row is only drawn when there IS a number, and the author is told when there is not", () => {
    // The behaviour half, called rather than read: business mode with nothing
    // resolved draws NO tax row (never $0.00) and says so in words to the
    // author -- and the customer's copy says nothing at all.
    resetIds();
    const line = makeWidget("price_line", { description: "Salt applied", quantity: 2, unit_price: 125 });
    const tot = makeWidget("totals", { tax_mode: "business" });
    const d = doc([line, tot]);
    const edit = renderWidget(tot, makeContext(d, { mode: "edit" }));
    const view = renderWidget(tot, makeContext(d, { mode: "view" }));
    // the sentence reaches the page HTML-escaped ("Settings &gt; Billing"),
    // which is the same words: compare the way the page carries them.
    const escaped = NO_BUSINESS_RATE_SENTENCE.replace(/>/g, "&gt;");
    assert.ok(edit.includes(escaped),
      "the author is not told that the business has no rate");
    assert.ok(!/\$0\.00/.test(edit.split("bx-total-grand")[0]),
      "an unresolved business rate is being taxed at zero on the canvas");
    assert.ok(!view.includes(escaped) && !view.includes(NO_BUSINESS_RATE_SENTENCE),
      "the customer is being shown the author's warning");

    // ...and with a number it computes, at the number.
    const withRate = makeWidget("totals", { tax_mode: "business", tax_rate: 7.25 });
    const d2 = doc([line, withRate]);
    const html = renderWidget(withRate, makeContext(d2, { mode: "view" }));
    assert.match(html, /Tax 7\.25%/, "the tax row does not name the rate");
    assert.match(html, /\$18\.13|\$18\.12/, "250 at 7.25% is not on the page");
  });
});

/* ======================================================================
   A HANDLE THAT CANNOT BE SEEN CANNOT BE PRESSED
   Found by driving the merged branch, 2026-09-17 (the landing pass).
   ====================================================================== */

describe("the handles of a nested part are the ones that get pressed", () => {
  test("EVERY rule that hides a handle also stops it taking the press", () => {
    // MUTATION: drop pointer-events from any of the three handle rules -> red.
    //
    // FOUND BY DRIVING IT: pressing the remove button on a card inside a row
    // inside a box deleted THE BOX AND EVERYTHING IN IT. The ancestors’
    // handles were hidden with opacity alone, and an element at opacity 0 is
    // invisible and still takes the click - so the box’s remove button,
    // painted later in the DOM at the same corner and the same z, swallowed
    // the press meant for the card. Absence-based hiding, failing open, on
    // the one control that destroys work.
    const CANVAS = readFileSync(new URL("../src/builder/Canvas.tsx", import.meta.url), "utf8");
    // EVERY hover control on the canvas, not just the handles: the section
    // toolbar already paired the two (it is where the pattern comes from) and
    // the widget handles were the one that did not. One idea, one rule, and a
    // new hover control cannot be added without answering the question.
    const RULE = new RegExp("[^\\n]*\\.bxc-(wtools|toolbar)[^{]*\\{[^}]*}", "g");
    const rules = CANVAS.match(RULE) || [];
    const withOpacity = rules.filter((r) => /opacity:/.test(r));
    assert.ok(withOpacity.length >= 3,
      `only ${withOpacity.length} hover-control rules set an opacity; expected at least three`);
    for (const decl of withOpacity) {
      const hides = /opacity:\s*0\b/.test(decl);
      assert.match(decl, /pointer-events:/,
        `a handle rule sets opacity and says nothing about presses: ${decl.slice(0, 60)}`);
      assert.match(decl, hides ? /pointer-events:\s*none/ : /pointer-events:\s*auto/,
        `a hidden handle is still pressable, or a shown one is not: ${decl.slice(0, 60)}`);
    }
  });
});

/* ======================================================================
   THE TAX RATE HAS ONE HOME, AND THE CANVAS READS THAT ONE
   Found by driving the merged branch, 2026-09-17 (the landing pass).
   ====================================================================== */

describe("the number on the page is the number that gets charged", () => {
  test("the builder reads the business rate from GET /settings, and from nowhere else", () => {
    // MUTATION: point the read back at /proposal-builder/money-settings -> red.
    //
    // FOUND BY DRIVING IT: the canvas read the STELLA-backed money-settings
    // route (7.25% for this business) while the send resolves
    // oliver.tenant_settings.default_tax_rate through lib/taxRate.js (null for
    // this business). So a proposal showed a total WITH tax in it, the author
    // pressed Send, and the server refused: 400 no_tax_rate. Two homes for one
    // number, with the halves disagreeing about money.
    const PANEL = readFileSync(new URL("../src/builder/proposal/ProposalBuilder.tsx", import.meta.url), "utf8");
    assert.match(PANEL, /api.get<any>\("\/settings"\)/,
      "the builder does not read the business rate from its one home");
    assert.match(PANEL, /d.defaultTaxRate/,
      "the builder is not reading the defaultTaxRate field");
    const reads = PANEL.match(/money-settings/g) || [];
    // the phrase may survive in the comment that explains the move, but never
    // inside an api.get
    assert.ok(!/api.get<any>\("[^"]*money-settings/.test(PANEL),
      "the second home is being read again");

    // ...and "nobody has said" stays distinct from "0%" all the way through.
    assert.match(PANEL, /percent: number \| null/,
      "a business with no rate set is being reported as 0%");
    assert.match(PANEL, /businessTax.percent == null\) return ""/,
      "the stamping runs with no rate to stamp, so a rate nobody set is written");
  });
});

/* ======================================================================
   ONE RIBBON VOCABULARY, ON EVERYTHING THAT WEARS A RIBBON
   Found by driving the merged branch, 2026-09-17 (the landing pass).
   ====================================================================== */

describe("a ribbon is spelled one way wherever it sits", () => {
  test("a PRICED LINE saved with the old ribbon name opens with the new one", () => {
    // MUTATION: put the ribbon rename back inside the CARD_KINDS branch -> red.
    //
    // FOUND BY DRIVING IT: a document converted from a comparison-cards
    // composite came back with its cards on `show_ribbon` and its priced line
    // still on `recommended: true`. A priced line wears a ribbon - the
    // inspector offers it the same six presets and oliver reads it through the
    // same `cardTag` - so its old spelling has to be converted by the same
    // pass, or one fact has two spellings on disk.
    resetIds();
    const line = makeWidget("price_line", {
      name: "Snow Removal - 2-3 inch push", quantity: 1, unit_price: 625, recommended: true,
    });
    const d = upgradeDocument(doc([line]));
    const out = [...walkWidgets(d)].find((x) => x.widget.kind === "price_line").widget;
    assert.equal(out.props.recommended, undefined,
      "the priced line kept the old ribbon name, so one fact has two spellings");
    // `show_ribbon` is the price table's own spelling: the string "yes".
    assert.equal(out.props.show_ribbon, "yes", "the ribbon was dropped rather than renamed");
    assert.equal(out.props.ribbon_title, "Recommended");
    // its OWN field is untouched: a line's `name` is not a card's heading
    assert.equal(out.props.name, "Snow Removal - 2-3 inch push");
    assert.equal(out.props.heading, undefined);

    // and the ONE reader agrees with what was written
    assert.equal(isRecommended(out.props), true);
  });

  test("A LINE THAT NEVER WORE A RIBBON IS UNTOUCHED (the golden promise)", () => {
    resetIds();
    const line = makeWidget("price_line", { name: "Salt applied", quantity: 2, unit_price: 125 });
    const before = doc([line]);
    const after = upgradeDocument(before);
    assert.equal(after, before, "a document with nothing to rename was rebuilt anyway");
  });
});

/* ======================================================================
   A REFUSAL HAS TO BE TRUE
   Found by driving the merged branch, 2026-09-17 (the landing pass).
   ====================================================================== */

describe("the website save says something true when it refuses", () => {
  test("a part dropped straight on the PAGE is not “still being built”", () => {
    // MUTATION: put the one "not finished being built" sentence back for both
    // cases -> red here.
    //
    // FOUND BY DRIVING IT: add a box to a website page, press Save draft, and
    // the answer was "1 section has not finished being built. Give it a moment
    // and try again." Nothing was building it and nothing ever would - a page
    // is made of sections and the free parts live inside a "Words and
    // pictures" one - so the page could never be saved again until the box was
    // taken off, and the words sent the author round a loop. The pane already
    // refuses this correctly ("Pick a Words and pictures section first"); the
    // canvas picker is a second door that does not, which is written up in the
    // handoff. This is the half that can be fixed with words.
    const WB = readFileSync(new URL("../src/builder/adapters/website/WebsiteBuilder.tsx", import.meta.url), "utf8");
    const fn = WB.slice(WB.indexOf("const orphanMessage"), WB.indexOf("const payload = useCallback"));
    assert.ok(fn, "there is no one place that says why a save was refused");
    assert.match(fn, /Words and pictures/,
      "the refusal does not tell the author where the part belongs");
    assert.match(fn, /sectionWidget\(s\)/,
      "the refusal cannot tell a part dropped on the page from a section still being built");
    assert.match(fn, /not finished being built/,
      "the honest case - the server really is still building one - lost its words");

    // and the sentence is not typed out twice any more
    const copies = (WB.match(/not finished being built/g) || []).length;
    assert.equal(copies, 1, "the refusal is written in more than one place");
  });
});
