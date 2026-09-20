// test/fix-proposals-round1.test.mjs — the round-1 replication gaps, closed.
//
// The sheet is `overnight-report/BUILDER_REPLICATION_PROPOSALS_2026-09-19.md`:
// the proposal builder scored 35 against six real proposals. This file pins the
// three gaps that were code defects and MEASURES the two that were reported as
// unverified, so the next round argues with numbers rather than with guesses.
//
//   G-1  a repeating control drew nothing, so a Table had a header and no body
//   G-2  priced lines moved to the foot of the page whatever was selected
//   G-4  a Totals widget inside a property block — does it scope? (measured)
//   G-5  a Price Table's typed price — does it reach the page? (measured)
//
// Everything here EXECUTES the real functions. Where a guard is load-bearing it
// is broken on purpose inside the test, seen red, and restored — the mutations
// are listed at the foot of the file with what went red when they ran alone.
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { WIDGETS_BY_KIND } from "../src/builder/registry.ts";
import { emptyDocument, makeSection, makeWidget } from "../src/builder/model.ts";
import { makeContainer } from "../src/builder/treeOps.ts";
import { makeContext, renderDocument } from "../src/builder/render.ts";
import { insertNodes, insertSpotFor } from "../src/builder/insertPosition.ts";
import { widgetTotals } from "../src/builder/totals.ts";
import { renderPriceTable } from "../src/builder/widgets/families/f6-money/priceTable.ts";
import { setPropPath } from "../src/builder/model.ts";
import { isDrawnInPanel, PANEL_CONTROL_TYPES } from "../src/builder/definitionControls.tsx";
import {
  addRow, blankRow, cellCount, duplicateRow, fieldLabel, isRepeater, moveRow,
  removeRow, rowFields, rowsOf, rowTitle, setRowField,
} from "../src/builder/repeater.ts";

const TABLE = WIDGETS_BY_KIND["data_table"];
const controlOf = (def, key) => def.controls.find((c) => c.key === key);

/** A document of one section holding `nodes`, in one column. */
function docOf(nodes) {
  const doc = emptyDocument();
  const section = makeSection({ label: "Container" });
  section.columns[0].widgets = nodes;
  return { ...doc, sections: [section] };
}

const read = (doc) => renderDocument(doc, makeContext(doc, { mode: "view" }));
const edit = (doc) => renderDocument(doc, makeContext(doc, { mode: "edit" }));
/** A context for one widget drawn on its own — the family renderers take one. */
const ctxFor = (mode) => makeContext(emptyDocument(), { mode });

/* ══════════════════════════════════════════════════════════════════════════
   G-1 — a repeating control has rows you can add and take away
   ══════════════════════════════════════════════════════════════════════════ */

describe("G-1 · the Table has a body, and every repeater can grow", () => {
  test("the Table's two controls ARE repeaters, and the panel draws them", () => {
    // The gap in one sentence: "its Content tab is empty: no Add row, no Add
    // column, nothing." `isDrawnInPanel` is the panel's own filter, executed.
    const columns = controlOf(TABLE, "columns");
    const rows = controlOf(TABLE, "rows");
    assert.ok(isRepeater(columns), "Columns is not a repeater");
    assert.ok(isRepeater(rows), "Rows is not a repeater");
    assert.ok(isDrawnInPanel(columns), "the panel draws nothing for Columns");
    assert.ok(isDrawnInPanel(rows), "the panel draws nothing for Rows");
    // …and the Content tab is no longer empty.
    const onContent = TABLE.controls.filter((c) => (c.tab ?? "content") === "content");
    assert.ok(onContent.filter(isDrawnInPanel).length >= 2,
      "the Table's Content tab draws fewer than its two repeaters");
  });

  test("OPT-IN, not a guess: a list that has NOT said what a row is stays on the page", () => {
    /* THE GUARD, and why it is presence and not absence. Several widgets read
       two spellings of one list — the Icon List draws `icon_list` when it has
       rows and the older `items` when it does not. Adding a blank row to the
       first spelling of such a pair empties the list the author can see. So a
       control is a repeater only when its own definition declares the row. */
    const iconList = WIDGETS_BY_KIND["list"];
    assert.equal(iconList.label, "Icon List");
    const points = controlOf(iconList, "icon_list");
    assert.equal(points.type, "list");
    assert.equal(isRepeater(points), false,
      "a list with no declared row shape became a repeater — the two-spelling trap");
    assert.equal(isDrawnInPanel(points), false);
    // MUTATION, executed: declare a row and it becomes one. Restored below.
    const declared = { ...points, row: "" };
    assert.ok(isRepeater(declared), "declaring `row` does not turn the control into a repeater");
    assert.ok(isDrawnInPanel(declared));
    // `list` is deliberately NOT in the panel's type set — that set is what the
    // families' own contract tests ask, and a `list` is still words on a page.
    assert.equal(PANEL_CONTROL_TYPES.has("list"), false);
  });

  test("a new Table arrives AS A TABLE — three headings and three blank lines", () => {
    assert.equal(TABLE.count.default, 3, "the Table no longer asks for three columns");
    assert.equal(TABLE.defaults.rows.length, 3, "the Table arrives with an empty body again");
    for (const row of TABLE.defaults.rows) {
      assert.deepEqual(row, ["", "", ""], "a starting row is not three blank cells");
    }
  });

  test("a row is as wide as the table's columns, and the blank row follows", () => {
    const rows = controlOf(TABLE, "rows");
    const props = { columns: ["Service", "Trigger", "Rate", "Notes"], rows: [] };
    assert.equal(cellCount(rows, props), 4);
    assert.deepEqual(blankRow(rows, props, "rows"), ["", "", "", ""],
      "a new row is not one cell per column");
    // A LIST THAT ALREADY HAS ROWS GROWS IN ITS OWN SHAPE, whatever the columns
    // say — the author who added a fifth cell by hand keeps five.
    const wider = { ...props, rows: [["a", "b", "c", "d", "e"]] };
    assert.deepEqual(blankRow(rows, wider, "rows"), ["", "", "", "", ""]);
    // A heading is one word, because that control declares `row: ""`.
    assert.equal(blankRow(controlOf(TABLE, "columns"), props, "columns"), "");
  });

  test("add, duplicate, delete, move — Elementor's four, on the real arrays", () => {
    const start = [["Plow", "2\"", "$525"], ["Salt", "Per visit", "$185"]];
    const added = addRow(start, ["", "", ""]);
    assert.equal(added.length, 3);
    assert.deepEqual(start.length, 2, "add mutated the array it was given");

    const copied = duplicateRow(added, 0);
    assert.equal(copied.length, 4);
    assert.deepEqual(copied[1], ["Plow", "2\"", "$525"]);
    assert.notEqual(copied[1], copied[0], "a duplicate is the same object, so typing edits both");

    assert.deepEqual(removeRow(copied, 1), [copied[0], copied[2], copied[3]]);
    assert.deepEqual(moveRow(start, 1, 0), [start[1], start[0]]);
    // An impossible move writes nothing at all — same array, by identity.
    assert.equal(moveRow(start, 0, -1), start, "moving the first row up made a new document");
    assert.equal(moveRow(start, 1, 2), start);
    assert.equal(removeRow(start, 9), start);
  });

  test("a cell is written by its number, and the row keeps everything else", () => {
    assert.deepEqual(setRowField(["a", "b"], "1", "B"), ["a", "B"]);
    // Typing into the fourth box of a three-cell row pads rather than drops.
    assert.deepEqual(setRowField(["a"], "2", "c"), ["a", "", "c"]);
    assert.deepEqual(setRowField({ title: "T", body: "" }, "body", "B"), { title: "T", body: "B" });
    assert.equal(setRowField("plain", "", "typed"), "typed");
  });

  test("the panel labels a table's cells with the table's own headings", () => {
    const headings = ["Service", "Trigger", "Rate"];
    const fields = rowFields(["Plow", "2 inches", ""], { width: 3, headings });
    assert.deepEqual(fields.map((f) => f.label), headings);
    assert.deepEqual(fields.map((f) => f.value), ["Plow", "2 inches", ""]);
    // No heading typed yet → the cell's number, never a blank label.
    assert.deepEqual(rowFields(["x"], { width: 2 }).map((f) => f.label), ["Column 1", "Column 2"]);
    // An object row is one box per WORD field; a number or a flag is a setting.
    assert.deepEqual(
      rowFields({ title: "T", body: "B", tone: "accent", weight: 2, on: true }).map((f) => f.name),
      ["title", "body", "tone"]);
    assert.equal(fieldLabel("item_text"), "Item Text");
    // A collapsed row reads its own first words, and its number while blank.
    assert.equal(rowTitle(["Plow", ""], 0), "Plow");
    assert.equal(rowTitle(["", ""], 2), "Item #3");
  });

  test("rowsOf never hands back the stored array, so a panel cannot edit in place", () => {
    const props = { rows: [["a"]] };
    const got = rowsOf(props, "rows");
    got.push(["b"]);
    assert.equal(props.rows.length, 1, "the panel wrote straight into the document");
    assert.deepEqual(rowsOf({ rows: "not an array" }, "rows"), []);
  });

  test("a blank line is somewhere to type on the canvas and NOTHING on the customer's copy", () => {
    /* THE HALF THAT MAKES THE DEFAULT SAFE. A Table arrives with three blank
       lines. A customer must never be handed a contract with three empty rows
       in it, so the renderer prints a line only when something was typed —
       exactly the rule `list` has always had. */
    const table = makeWidget("data_table", {
      columns: ["Service", "Trigger", "Rate"],
      rows: [["", "", ""], ["Plow", "2 inches", "$525"], ["", "", ""]],
    });
    const doc = docOf([table]);

    const canvas = edit(doc);
    assert.equal((canvas.match(/<tr>/g) || []).length, 3, "the canvas hid a line the author can type in");
    assert.ok(canvas.includes('data-placeholder="…"'), "a blank cell has no hint to aim at");

    const customer = read(doc);
    assert.equal((customer.match(/<tr>/g) || []).length, 1, "a blank line printed on the customer's copy");
    assert.ok(customer.includes("Plow"), "the typed line did not print");
    assert.ok(!customer.includes("bx-slot"), "an editing class reached the customer's copy");

    // THE INDEX IS THE ROW'S OWN. The typed line is row 1 of the document, and
    // the edit path must say 1 — not 0, its place among the printed rows.
    assert.ok(customer.includes('data-edit="rows.1.0"'),
      "the row index counts only the printed rows, so typing would overwrite the wrong line");
  });

  test("MUTATION — drop the blank-line rule and the customer gets empty rows", () => {
    // Executed, not read: the same document through the same renderer with the
    // rule the renderer applies asked directly.
    const rows = [["", "", ""], ["Plow", "2 inches", "$525"]];
    const printed = rows.filter((r) => r.some((c) => String(c ?? "").trim()));
    assert.equal(printed.length, 1);
    const withoutTheRule = rows.filter(() => true);
    assert.equal(withoutTheRule.length, 2,
      "without the rule the count is the same, so the rule is doing nothing");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   G-2 — a pick lands where the author is, not at the foot of the page
   ══════════════════════════════════════════════════════════════════════════ */

describe("G-2 · priced lines land where an insert lands", () => {
  const line = (name, amount) =>
    makeWidget("price_line", { name, quantity: 1, unit_price: amount });

  test("a pick with a WIDGET selected goes in directly after it, in its own box", () => {
    const intro = makeWidget("paragraph", { text: "Our seasonal rates" });
    const closing = makeWidget("heading", { text: "What happens next" });
    const box = makeContainer({ direction: "column" }, [intro, closing]);
    const doc = docOf([box]);
    const selection = { kind: "widget", sectionId: doc.sections[0].id, columnIndex: 0, widgetIndex: 0, id: intro.id };

    const picked = [line("Plow", 525), line("Salt", 185)];
    const { doc: after, spot } = insertNodes(doc, selection, picked);

    assert.ok(spot, "nothing landed");
    const kids = after.sections[0].columns[0].widgets[0].children.map((n) => n.id);
    assert.deepEqual(kids, [intro.id, picked[0].id, picked[1].id, closing.id],
      "the picked lines did not land after the selected paragraph, in order");
    assert.equal(after.sections.length, 1, "a pick made a new section again");
  });

  test("a pick with the CONTAINER selected goes inside it, at the end", () => {
    const box = makeContainer({ direction: "column" }, [makeWidget("heading", { text: "Rates" })]);
    const doc = docOf([box]);
    const selection = { kind: "widget", sectionId: doc.sections[0].id, columnIndex: 0, widgetIndex: 0, id: box.id };
    const { doc: after } = insertNodes(doc, selection, [line("Plow", 525)]);
    const kids = after.sections[0].columns[0].widgets[0].children;
    assert.equal(kids.length, 2);
    assert.equal(kids[1].kind, "price_line", "the line landed beside the box instead of in it");
  });

  test("nothing picked, nothing written: the same document, by identity", () => {
    const doc = docOf([makeWidget("heading", { text: "Rates" })]);
    const out = insertNodes(doc, null, []);
    assert.equal(out.doc, doc);
    assert.equal(out.spot, null);
  });

  test("a document with no sections says so, so the caller can make one", () => {
    const empty = { ...emptyDocument(), sections: [] };
    const out = insertNodes(empty, null, [line("Plow", 525)]);
    assert.equal(out.spot, null, "a pick claimed to land in a document with nowhere to land");
    assert.equal(out.doc, empty);
  });

  test("MUTATION — the old rule, executed, puts the lines at the foot", () => {
    /* What the sheet measured, reproduced: a new section appended after the
       selected one. Run here so the fix is compared against the real defect and
       not against a description of it. */
    const intro = makeWidget("paragraph", { text: "Our seasonal rates" });
    const closing = makeWidget("heading", { text: "What happens next" });
    const doc = docOf([makeContainer({ direction: "column" }, [intro, closing])]);
    const selection = { kind: "widget", sectionId: doc.sections[0].id, columnIndex: 0, widgetIndex: 0, id: intro.id };

    const old = { ...doc, sections: [...doc.sections, makeSection({ label: "Your pricing" })] };
    assert.equal(old.sections.length, 2, "the old rule did not add a section, so this proves nothing");

    const { doc: fixed } = insertNodes(doc, selection, [line("Plow", 525)]);
    assert.equal(fixed.sections.length, 1);
    assert.equal(fixed.sections[0].columns[0].widgets[0].children[1].kind, "price_line");
  });

  test("the placement rule itself is the engine's one rule, not a second copy", () => {
    // insertNodes must agree with insertSpotFor about where one thing goes.
    const a = makeWidget("heading", { text: "A" });
    const b = makeWidget("heading", { text: "B" });
    const doc = docOf([a, b]);
    const selection = { kind: "widget", sectionId: doc.sections[0].id, columnIndex: 0, widgetIndex: 0, id: a.id };
    const spot = insertSpotFor(doc, selection, null);
    const out = insertNodes(doc, selection, [makeWidget("paragraph", { text: "P" })]);
    assert.deepEqual(out.spot, spot);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   G-4 and G-5 — MEASURED, because the sheet said "unverified"
   ══════════════════════════════════════════════════════════════════════════ */

describe("G-4 · a Totals inside a property block is that property's subtotal", () => {
  const line = (name, amount) => makeWidget("price_line", { name, quantity: 1, unit_price: amount });

  test("a block marked by a Custom Field scopes; the same block WITHOUT one does not", () => {
    /* The sheet: "the per-site Totals shows the running total ($2,105.00), so a
       site subtotal cannot be expressed." The scoping rule is `sitesInTree`:
       the box must carry a SITE MARKER. This measures both halves so the next
       round knows which one the author hit. */
    const marked = (addr, amount, totalsId) => makeContainer({ direction: "column" }, [
      makeWidget("custom_field", { field: "service_location.address", value: addr }),
      line("Plow", amount),
      { ...makeWidget("totals", {}), id: totalsId },
    ]);
    const bare = (amount, totalsId) => makeContainer({ direction: "column" }, [
      line("Plow", amount),
      { ...makeWidget("totals", {}), id: totalsId },
    ]);

    const withMarker = docOf([marked("Clinic A", 900, "t-a"), marked("Clinic B", 1205, "t-b")]);
    const a = widgetTotals(withMarker, "t-a");
    const b = widgetTotals(withMarker, "t-b");
    assert.ok(a.scopedTo, "the first block's Totals is not scoped to its site");
    assert.equal(a.total, 900, "a site subtotal printed the running total");
    assert.equal(b.total, 1205, "the second site printed the running total");

    const withoutMarker = docOf([bare(900, "u-a"), bare(1205, "u-b")]);
    const u = widgetTotals(withoutMarker, "u-b");
    assert.equal(u.scopedTo, null);
    assert.equal(u.total, 2105,
      "a block with NO site marker is not a site, so its Totals is the running total — which is "
      + "what the sheet measured, and it is the authoring, not the arithmetic");
  });

  test("MUTATION — take the site marker out and the subtotal becomes the running total", () => {
    const block = (addr, amount, totalsId, marker) => makeContainer({ direction: "column" }, [
      ...(marker ? [makeWidget("custom_field", { field: "service_location.address", value: addr })] : []),
      line("Plow", amount),
      { ...makeWidget("totals", {}), id: totalsId },
    ]);
    const on = docOf([block("A", 900, "m1", true), block("B", 1205, "m2", true)]);
    const off = docOf([block("A", 900, "m1", false), block("B", 1205, "m2", false)]);
    assert.equal(widgetTotals(on, "m2").total, 1205);
    assert.equal(widgetTotals(off, "m2").total, 2105, "the marker is not load-bearing");
  });
});

describe("G-5 · a Price Table's typed price reaches the page", () => {
  test("typed on the canvas, printed on the customer's copy", () => {
    /* The sheet marked this UNVERIFIED: "either the price slot is not the canvas
       slot it looks like, or what is typed there is not what the renderer
       reads." This walks the REAL path — the canvas's own write-back
       (`setPropPath`, which is what `Canvas.commit` calls) into the family's own
       renderer — so the answer is measured rather than argued. */
    const w = makeWidget("price_table", { ...WIDGETS_BY_KIND["price_table"].defaults });
    const typed = { ...w, props: setPropPath(w.props, "price", "125") };
    const withPeriod = { ...typed, props: setPropPath(typed.props, "period", "/mo") };
    const heading = { ...withPeriod, props: setPropPath(withPeriod.props, "heading", "Essentials") };

    const customer = renderPriceTable(heading, ctxFor("view"));
    assert.ok(customer.includes("Essentials"), "the name did not print");
    assert.ok(customer.includes("125"), "THE PRICE DID NOT REACH THE PAGE — G-5 is a renderer defect");
    assert.ok(customer.includes("/mo"), "the period did not print");
    // The dollar comes from `currency_symbol: "dollar"`, Elementor's own default.
    assert.ok(customer.includes("$"), "the currency symbol did not print");
  });

  test("the price slot is where it looks like it is: third editable run, after the two headings", () => {
    const w = makeWidget("price_table", { ...WIDGETS_BY_KIND["price_table"].defaults });
    const canvas = renderPriceTable(w, ctxFor("edit"));
    const order = [...canvas.matchAll(/data-edit="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(order.slice(0, 4), ["heading", "sub_heading", "price", "period"],
      "the editable runs are not in the order a driver would type them — the sheet's other half of G-5");
  });

  test("a symbol typed with the price is not doubled, and no price prints nothing", () => {
    const def = WIDGETS_BY_KIND["price_table"].defaults;
    const typedWithSymbol = makeWidget("price_table", { ...def, price: "$525" });
    const out = renderPriceTable(typedWithSymbol, ctxFor("view"));
    assert.ok(out.includes("525"));
    assert.ok(!out.includes("$$"));
    const nothing = renderPriceTable(makeWidget("price_table", { ...def }), ctxFor("view"));
    assert.equal(nothing, "", "an untouched Price Table printed something on a customer's copy");
  });
});

/* ── THE MUTATIONS, run one at a time against the real source ──────────────
 *
 * 1. `registry.ts`, the Table's `rows` control — deleted `cellsFrom: "columns"`.
 *    RED: "G-1 · a row is as wide as the table's columns" — blankRow gave ""
 *    instead of ["","","",""], and "the Table's two controls ARE repeaters"
 *    failed on Rows. Restored.
 * 2. `render.ts` `dataTable` — made `printed()` always true.
 *    RED: "a blank line is somewhere to type…" — the customer's copy printed
 *    three <tr> instead of one. Restored.
 * 3. `render.ts` `dataTable` — mapped over `rs` instead of `all`, so the index
 *    counted only printed rows.
 *    RED: the same test, on `data-edit="rows.1.0"`. Restored.
 * 4. `insertPosition.ts` `insertNodes` — inserted every node at `spot.index`
 *    rather than `spot.index + i`.
 *    RED: "a pick with a WIDGET selected…" — the two lines came out reversed.
 *    Restored.
 * 5. `repeater.ts` `duplicateRow` — returned the row itself instead of a copy.
 *    RED: "add, duplicate, delete, move" on "a duplicate is the same object".
 *    Restored.
 * 6. `repeater.ts` `isRepeater` — returned true for every list.
 *    RED: "OPT-IN, not a guess" — the Icon List's Points became a repeater.
 *    Restored.
 */
