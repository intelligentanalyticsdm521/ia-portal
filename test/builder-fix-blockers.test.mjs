/**
 * test/builder-fix-blockers.test.mjs — THE THREE BLOCKERS, EXECUTED (V-1, V-2, V-3).
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §11.12 (D-156), and the click-driven
 * verification of `d156/integration` on 2026-09-17, which found three things
 * that no test in the suite could have caught:
 *
 *   V-1  every word typed into anything inside a box was silently discarded
 *   V-2  every adapter-side control was a no-op for a widget inside a box —
 *        the catalogue picker, "Use this plan", the tag, the location, the
 *        clause, the logo, a price line's figures, Totals' tax
 *   V-3  a nested box's "+" painted at the identical pixel as its parent's,
 *        and the parent's won, so "add inside this row" added one level OUT
 *
 * V-3's BUTTON IS DELETED (2026-09-19). A box that already has something in it
 * has no "+" of its own any more — the reference editor has none — so the
 * placement rule it needed went with it. What is left of V-3 here is the pair
 * that says so: the rule is gone, and the thing that replaced it is on the page.
 *
 * ── WHY THE SUITE MISSED THEM, AND WHAT THIS FILE DOES DIFFERENTLY ────────
 * 2,294 tests were green while all three were broken. Every test that touched
 * this behaviour asserted SOURCE TEXT — that the shell mentions `onEditText`,
 * that the adapter renders a widget list — and source text cannot tell you that
 * the document came back unchanged.
 *
 * So every test below CALLS the real function on a real document and reads the
 * document that comes back. The one document it calls them on is the one
 * Brandon's sentence describes and the one the old code could not touch:
 *
 *     box ▸ row ▸ [ card , catalog_card ]
 *
 * Source assertions appear only where a React file cannot be mounted by this
 * runner, and each of those is paired with a mutation in
 * `scripts/dev/d156-fix-blockers-mutation-check.mjs`.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  addSection, addWidget, deserialise, editWidgetText, emptyDocument, findNode, insertBeside,
  makeContainer, makeSection, makeWidget, patchNode, removeWidgetsWhere, resetIds, serialise,
  walkWidgets, widgetById,
} from "../src/builder/model.ts";
import { MAX_DEPTH } from "../src/builder/treeOps.ts";
import { MAX_CONTAINER_DEPTH } from "../src/builder/render.ts";
import * as place from "../src/builder/insertPosition.ts";
import { insertSpotFor } from "../src/builder/insertPosition.ts";
import { resolveCatalogCard } from "../src/builder/widgets/index.ts";
import { panelGroups } from "../src/builder/widgetGroups.ts";

import { documentTotals } from "../src/builder/totals.ts";

const SRC = path.join(process.cwd(), "src");
const readSrc = (p) => readFileSync(path.join(SRC, p), "utf8");

/** The catalogue the business actually has. Brandon's own snow line. */
const SNOW = {
  offering_id: "off-snow",
  name: "Snow Removal",
  description: "We plough, salt and log every visit.",
  features_json: JSON.stringify(["24/7 call-out", "Photos of every visit"]),
  prices: [
    { price_id: "p-8", unit_amount: 1850, label: "8+ inch push", pricing_model: "recurring", recurring_interval: "month" },
  ],
};

/**
 * BRANDON'S SENTENCE AS A DOCUMENT: a box, a row in the box, a typed card and
 * a catalogue card side by side in the row.
 *
 * Nothing here is at the top of a column, which is the only place the code
 * these tests cover could reach before the fix.
 */
function nested() {
  resetIds();
  const card = makeWidget("card", { title: "", price: "" });
  const catalog = makeWidget("catalog_card", {});
  const heading = makeWidget("heading", { text: "" });
  const row = makeContainer({ direction: "row", gap: 16 }, [card, catalog]);
  const box = makeContainer(undefined, [heading, row]);
  const section = makeSection({ label: "Choose your plan" });
  const doc = addWidget(addSection(emptyDocument(), section), section.id, 0, box);
  return { doc, sectionId: section.id, boxId: box.id, rowId: row.id, cardId: card.id, catalogId: catalog.id, headingId: heading.id };
}

/* ══════════════════════════════════════════════════════════════════════════
   V-1 — the words survive
   ══════════════════════════════════════════════════════════════════════════ */

describe("V-1 · words typed inside a box reach the document", () => {
  test("a heading inside a box keeps what was typed into it", () => {
    const { doc, headingId } = nested();
    const next = editWidgetText(doc, headingId, "text", "Choose your plan");
    assert.notEqual(next, doc, "the document came back unchanged — the edit was discarded");
    assert.equal(widgetById(next, headingId).props.text, "Choose your plan");
  });

  test("a card two levels down keeps its heading AND its price", () => {
    // The names are the price table's own since the conformance pass:
    // `heading`, not `title`. A document saved with the old word is converted
    // on open — proved in the round-trip case below.
    const { doc, cardId, catalogId } = nested();
    let next = editWidgetText(doc, cardId, "heading", "Winter plan");
    next = editWidgetText(next, cardId, "price", "$1,850");
    assert.equal(widgetById(next, cardId).props.heading, "Winter plan");
    assert.equal(widgetById(next, cardId).props.price, "$1,850");
    // AND NOT ON A SIBLING. The defect's twin: an address that finds the wrong
    // widget is worse than one that finds none.
    assert.equal(widgetById(next, catalogId).props.heading, undefined);
  });

  test("the words are still there after a save and a reopen", () => {
    // What the author actually reported: the characters stayed on screen and
    // vanished at the next repaint, because Save wrote a document nothing had
    // written to. This is that round trip.
    const { doc, cardId } = nested();
    const typed = editWidgetText(doc, cardId, "heading", "Winter plan");
    const reopened = deserialise(JSON.parse(JSON.stringify(serialise(typed))));
    assert.equal(widgetById(reopened, cardId).props.heading, "Winter plan");

    // AND THE OLD WORD IS NOT LOST — catalogue point (g). A card typed before
    // the rename carries `title`; upgrade-on-open moves the words to `heading`
    // and takes the old key away, so there is one spelling on the page and
    // nothing the author wrote disappears.
    const legacy = editWidgetText(doc, cardId, "title", "Winter plan");
    const converted = deserialise(JSON.parse(JSON.stringify(serialise(legacy))));
    assert.equal(widgetById(converted, cardId).props.heading, "Winter plan",
      "a card saved with the old word opened blank");
    assert.equal(widgetById(converted, cardId).props.title, undefined,
      "the old key survived the upgrade, so two spellings are on the page");
  });

  test("a dotted path reaches inside a repeat, at depth", () => {
    // `features_list` is the price table's REPEATER since the conformance pass
    // — one `{ item_text }` per line — so the canvas's path is two levels deep.
    const { doc, cardId } = nested();
    const next = editWidgetText(doc, cardId, "features_list.1.item_text", "Salt included");
    const features = widgetById(next, cardId).props.features_list;
    assert.equal(Array.isArray(features), true, "the dotted path did not make an array");
    assert.equal(features.length, 2);
    assert.equal(features[1].item_text, "Salt included");
  });

  test("an id that names nothing, or names a box, changes nothing", () => {
    const { doc, boxId } = nested();
    assert.equal(editWidgetText(doc, "w-gone", "text", "x"), doc);
    // A container has no props by design; writing words into one would invent
    // a sixth vocabulary for text.
    assert.equal(editWidgetText(doc, boxId, "text", "x"), doc);
  });

  test("THE SHELL CALLS IT — no column scan is left in onEditText", () => {
    const shell = readSrc("builder/BuilderShell.tsx");
    const fn = shell.slice(shell.indexOf("const onEditText"), shell.indexOf("const changeSection"));
    assert.ok(fn.includes("editWidgetText(doc, widgetId, path, value)"), "onEditText is not addressing by node id");
    assert.ok(!/columns\[/.test(fn), "a column scan is still in onEditText");
    assert.ok(!/findIndex/.test(fn), "an index hunt is still in onEditText");
  });

  test("the slash command is GONE, and the jump still counts no index", () => {
    const shell = readSrc("builder/BuilderShell.tsx");
    // ABSENT: "/" on an empty line opened a pop-up list of widgets. Deleted
    // 2026-09-19 — the reference editor has no such thing, and half of V-1 was
    // this command reaching into a column by hand.
    assert.ok(!/slashCommit|setSlash|onSlashCommit/.test(shell), "the slash command is back in the shell");
    assert.throws(() => readSrc("builder/WidgetPicker.tsx"), /ENOENT/,
      "the pop-up list of widgets the slash command opened is back");
    // PRESENT: the jump, which is the half of this test that still has a
    // subject, and it still addresses the widget by node id.
    const jump = shell.slice(shell.indexOf("function jumpToProblem"), shell.indexOf("const placeSection"));
    assert.ok(jump.includes("pathOfNode(doc, widgetId)"), "the jump cannot select a widget at depth");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   V-2 — the adapter's controls reach the widget
   ══════════════════════════════════════════════════════════════════════════ */

describe("V-2 · the panel writes to the widget inside the box", () => {
  test("the catalogue picker loads a real price onto a card inside a row", () => {
    // Brandon's literal ask: "product cards where they can directly load
    // products/services from their actual OLIVER Product Catalog."
    const { doc, catalogId, cardId } = nested();
    const next = patchNode(doc, catalogId, { offeringId: "off-snow", priceId: "p-8" });
    const card = widgetById(next, catalogId);
    assert.equal(card.props.offeringId, "off-snow");
    const resolved = resolveCatalogCard(card.props, [SNOW]);
    assert.equal(resolved.source, "live");
    assert.equal(resolved.price, "$1,850.00", "the loaded price never reached the card");
    assert.equal(resolved.title, "Snow Removal — 8+ inch push");
    // The typed card beside it is untouched.
    assert.equal(widgetById(next, cardId).props.offeringId, undefined);
  });

  test("the Best Price tag lands on the card that was tagged", () => {
    const { doc, cardId, catalogId } = nested();
    const next = patchNode(doc, cardId, { tag: { text: "Best price", tone: "accent" } });
    assert.equal(widgetById(next, cardId).props.tag.text, "Best price");
    assert.equal(widgetById(next, catalogId).props.tag, undefined, "the tag landed on the wrong card");
  });

  test("“Use this plan” puts the priced line BESIDE the card, and the total counts it", () => {
    const { doc, catalogId, rowId } = nested();
    const bound = patchNode(doc, catalogId, { offeringId: "off-snow", priceId: "p-8" });
    const line = makeWidget("price_line", {
      name: "Snow Removal — 8+ inch push", quantity: 1, unit_price: 1850, fromCards: catalogId,
    });
    const after = insertBeside(removeWidgetsWhere(bound, (w) => w.props?.fromCards === catalogId), catalogId, line);

    const hit = findNode(after, line.id);
    assert.equal(hit.parentId, rowId, "the line was dropped outside the row the card is in");
    assert.equal(hit.depth, 2, "the line is not beside the card");
    assert.equal(documentTotals(after).subtotal, 1850, "a priced line inside a box is not reaching the total");
  });

  test("pressing it twice leaves ONE line, wherever the first one was", () => {
    // The flat filter could not see a line inside a box, so the second press
    // left the first line in place and the customer paid twice for one plan.
    const { doc, catalogId } = nested();
    const one = makeWidget("price_line", { name: "first", quantity: 1, unit_price: 1850, fromCards: catalogId });
    let after = insertBeside(doc, catalogId, one);
    const two = makeWidget("price_line", { name: "second", quantity: 1, unit_price: 1850, fromCards: catalogId });
    after = insertBeside(removeWidgetsWhere(after, (w) => w.props?.fromCards === catalogId), catalogId, two);

    const lines = walkWidgets(after).filter((x) => x.widget.kind === "price_line");
    assert.equal(lines.length, 1, "a second press added a second line");
    assert.equal(lines[0].widget.props.name, "second");
    assert.equal(documentTotals(after).subtotal, 1850);
  });

  test("a price line's own figures, and Totals' tax rate, reach a widget at depth", () => {
    const { doc, rowId } = nested();
    const line = makeWidget("price_line", { name: "Snow", quantity: 1, unit_price: 100 });
    const totals = makeWidget("totals", { taxMode: "business" });
    let next = insertBeside(doc, rowId, line);
    next = insertBeside(next, line.id, totals);
    next = patchNode(next, line.id, { quantity: 3, unit_price: 250 });
    next = patchNode(next, totals.id, { taxRatePercent: 7, taxLabel: "PA sales tax" });
    assert.equal(documentTotals(next).subtotal, 750, "the quantity and unit price never landed");
    assert.equal(widgetById(next, totals.id).props.taxRatePercent, 7);
  });

  test("THE PANELS CALL IT — no hand-rolled walk is left in any adapter", () => {
    for (const file of [
      "builder/proposal/ProposalBuilder.tsx",
      "builder/adapters/email/EmailBuilder.tsx",
      "builder/adapters/landing/LandingBuilder.tsx",
    ]) {
      const src = readSrc(file);
      assert.ok(src.includes("patchNode(doc, widget.id"), `${file} does not write by node id`);
      assert.ok(
        !/widgets: c\.widgets\.map\(\(w\) => \(w\.id === widget\.id/.test(src),
        `${file} still hand-rolls the tree walk`,
      );
    }
    // The proposal's "Use this plan" is the one that moves MONEY.
    const prop = readSrc("builder/proposal/ProposalBuilder.tsx");
    assert.ok(prop.includes("insertBeside(next, widget.id, line)"), "Use this plan does not place the line beside the card");
    assert.ok(prop.includes("removeWidgetsWhere(doc, (w) =>"), "Use this plan does not clear the old line at depth");
    // The website adapter's section fields, the same fix in its own file.
    assert.ok(
      readSrc("builder/adapters/website/WebsiteBuilder.tsx").includes("change(patchNode(doc, w.id, props))"),
      "the website section fields still scan a column",
    );
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   V-3 — the "+" inside a full box is DELETED, and an empty one has its own
   ══════════════════════════════════════════════════════════════════════════ */

describe("V-3 · the corner + inside a box is gone, and the middle one replaces it", () => {
  test("the placement rule and its two numbers are NOT exported any more", () => {
    // ABSENT. V-3 was a fight between two "+" buttons on the same pixel; the
    // reference editor has neither of them, so on 2026-09-19 the button, the
    // rule that placed it and the constants it was measured in were deleted
    // rather than tidied. Read off the module object, so a re-export under a
    // different name cannot slip back in unnoticed.
    for (const gone of ["boxPlusPlacement", "BOX_PLUS_SIZE", "BOX_PLUS_STEP"]) {
      assert.equal(place[gone], undefined, `insertPosition.ts exports ${gone} again`);
    }
    const src = readSrc("builder/insertPosition.ts");
    assert.ok(!/BoxPlusPlacement/.test(src), "the BoxPlusPlacement type is back");
  });

  test("and the canvas paints no + inside a box that already has something in it", () => {
    const canvas = readSrc("builder/Canvas.tsx");
    // ABSENT: the class the corner button wore, and the level it carried.
    assert.ok(!canvas.includes("bxc-addin"), "the corner + inside a box is back on the canvas");
    assert.ok(!canvas.includes("data-addin-level"), "the nesting level is back on a + button");
  });

  test("PRESENT INSTEAD: an EMPTY container shows one + in its middle, and it selects that container", () => {
    const canvas = readSrc("builder/Canvas.tsx");
    // Only a box with nothing in it gets one — that is the `continue`.
    assert.ok(canvas.includes('if (box.querySelector("[data-widget]")) continue;'),
      "the + is drawn inside boxes that already hold something");
    assert.ok(canvas.includes('b.className = "bxc-addhere"'), "the empty container has no + in its middle");
    assert.ok(canvas.includes('b.setAttribute("data-builder-addhere", String(columnIndex))'),
      "the empty container's + is not addressable");
    assert.ok(canvas.includes('b.title = "Drag a widget here, or press and then choose one on the left"'),
      "the + does not say what pressing it does");
    // Pressing it SELECTS, and the widgets are on the left. No list opens here.
    assert.ok(canvas.includes('onSelect({ kind: "widget", ...path })'),
      "pressing the + does not select the container it is in");
    assert.ok(canvas.includes('document.querySelector<HTMLInputElement>(\'[data-builder-slot="pane"] input\')?.focus()'),
      "pressing the + does not send the author to the left panel");
  });

  test("and a CONTAINER selected is what puts the next widget INSIDE it", () => {
    // The rule that makes the middle "+" worth pressing: rule 0 of
    // insertPosition. Executed, not read — a box selected, a widget asked for,
    // and the spot comes back naming the box itself.
    const { doc, boxId } = nested();
    const spot = insertSpotFor(doc, { kind: "widget", sectionId: "s", columnIndex: 0, widgetIndex: 0, id: boxId });
    assert.equal(spot.hostId, boxId, "a widget chosen with a container selected lands outside it");
    assert.equal(spot.index, 2, "it does not land at the END of what is already in the container");
  });

  test("a widget beside a card in a row still lands in the row", () => {
    // Unchanged by the deletion, and the reason the deletion is safe: the one
    // placement rule already put things where the author was pointing.
    const { doc, rowId, cardId } = nested();
    const spot = insertSpotFor(doc, { kind: "widget", sectionId: "s", columnIndex: 0, widgetIndex: 0, id: cardId });
    assert.equal(spot.hostId, rowId, "a widget added beside a card in a row would land outside the row");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   One idea, one number — and one door for a box
   ══════════════════════════════════════════════════════════════════════════ */

describe("D-156 · how deep a box may go is ONE number", () => {
  test("the renderer's guard is the editor's own limit", () => {
    assert.equal(MAX_CONTAINER_DEPTH, MAX_DEPTH);
    const render = readSrc("builder/render.ts");
    assert.ok(/export const MAX_CONTAINER_DEPTH = MAX_DEPTH;/.test(render), "the renderer has its own second number again");
    assert.ok(!/MAX_CONTAINER_DEPTH = \d/.test(render));
  });

  test("the two renderers that mirror it read the same constant", () => {
    for (const file of ["builder/adapters/email/emailRender.ts", "builder/adapters/landing/landingRender.ts"]) {
      const src = readSrc(file);
      assert.ok(src.includes("MAX_CONTAINER_DEPTH"), `${file} does not use the shared limit`);
      assert.ok(!/MAX_CONTAINER_DEPTH\s*=\s*\d/.test(src), `${file} declares a limit of its own`);
    }
  });

  test("searching the LEFT PANEL for 'row' reaches the Layout group — no second list to ask", () => {
    /* WAS "a search that matches only a BOX still shows the Layout group",
       about the widget pop-up and its box presets. Both are deleted, and the
       fix is structural rather than a special case: the Layout group holds two
       real widgets — Container and Grid — whose sentences say "Set it to a row
       for columns", so typing "row" matches a WIDGET and the group is there on
       its own merits, in the one panel there is. */
    assert.equal(
      panelGroups("proposal", "row").some((g) => g.group === "Layout"), true,
      "typing 'row' no longer reaches the Layout group at all",
    );
    // ABSENT: the pop-up, and the preset list it searched.
    assert.throws(() => readSrc("builder/WidgetPicker.tsx"), /ENOENT/, "the widget pop-up is back");
    const pane = readSrc("builder/WidgetPane.tsx");
    assert.ok(!/boxMatches/.test(pane), "the panel is matching box presets again as well as widgets");
    // PRESENT: one call, in the one panel, and the groups it draws are that call's.
    assert.ok(pane.includes("panelGroups(adapter, query)"), "the panel does not ask the one grouping");
  });

  test("a box is asked for in the LEFT PANEL, and nowhere else", () => {
    /* WAS "the slash command can ask for a Box, a Row or a Grid". The slash
       command is deleted and so is the pop-up it opened. */
    const shell = readSrc("builder/BuilderShell.tsx");
    // ABSENT: both doors, and the handlers behind them.
    for (const gone of ["slashCommitBox", "onPickBox", "WidgetPicker", "boxMatches"]) {
      assert.ok(!shell.includes(gone), `the shell still wires ${gone}`);
    }
    // PRESENT: the Layout group offers Container and Grid as ordinary tiles,
    // and the Grid tile makes a real grid container through the registry.
    const layout = panelGroups("proposal").find((g) => g.group === "Layout");
    assert.deepEqual(layout.widgets.map((w) => w.kind).sort(), ["container", "grid"],
      "the Layout group is not Container and Grid");
    assert.ok(readSrc("builder/registry.ts").includes("export function presetFor"),
      "there is no one place that turns a Layout tile into a container");
  });
});
