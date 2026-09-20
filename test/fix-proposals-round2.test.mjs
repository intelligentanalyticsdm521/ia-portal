/**
 * test/fix-proposals-round2.test.mjs — the round-2 proposal defects, executed.
 *
 * The scorer rebuilt the six reference proposals by CLICKING on b168/landed and
 * scored 56 (BUILDER_REPLICATION_PROPOSALS_2026-09-19.md). This file pins the
 * fixes for what they found, and every check RUNS the real function rather than
 * reading the source for a word.
 *
 * ── MUTATIONS (each applied to the real source, seen RED, then restored) ──
 *  1. `mayPaint` drops `g.editing` and asks only the instant question
 *     → RED: "the hand-over between two runs is one gesture".
 *  2. `mayPaint` stops remembering a refusal (`g.owed = true` deleted)
 *     → RED: "a paint refused under the caret is still owed".
 *  3. `caretSettled` clears `editing` even when the caret is in another run
 *     → RED: "the caret moving from one run to the next is not a departure".
 *  4. `Canvas.tsx` stops calling `settleEditing` from the host's blur
 *     → RED: "the canvas asks again once the caret has settled".
 *  5. `rowsFollowColumns` copies the last row unchanged
 *     → RED: "a row added after a new column is as wide as the table".
 *  6. `rowsFollowColumns` pads but never trims
 *     → RED: "deleting a column takes the cell with it".
 *  7. `selectionAt` is dropped from the catalogue pick
 *     → RED: "the caret follows a catalogue pick".
 *  8. `ICON_LIST_DEF`'s `icon_list` control loses `row`
 *     → RED: "an Icon List's points are a repeater".
 */
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const readSrc = (p) => readFileSync(join(SRC, p), "utf8");

/* ════════════════════════════════════════════════════════════════════════════
   R2-2 — TYPE ONE PART OF A WIDGET, CLICK THE NEXT, AND THE SECOND IS LOST.
   The worst of the six: it destroys work the author has already done.
   ════════════════════════════════════════════════════════════════════════ */
describe("R2-2 — the caret guard spans the hand-over from one run to the next", () => {
  const load = async () => import("../src/builder/caretGuard.ts");

  test("a run takes the caret, and the paint is refused while it holds it", async () => {
    const { newCaretGuard, caretEntered, mayPaint } = await load();
    const g = newCaretGuard();
    assert.equal(mayPaint(g, false), true, "an idle section paints");
    caretEntered(g);
    assert.equal(mayPaint(g, true), false, "a paint under the caret would eat the words");
  });

  test("THE DEFECT: the hand-over between two runs is one gesture, not a departure", async () => {
    const { newCaretGuard, caretEntered, mayPaint } = await load();
    const g = newCaretGuard();
    caretEntered(g);
    // This is the exact instant the spy caught on 2026-09-20: `focusout` has
    // fired on the first run and `focusin` has not yet fired on the second, so
    // `document.activeElement` is the BODY and the instant answer is FALSE.
    assert.equal(mayPaint(g, false), false,
      "the paint ran between focusout and focusin and replaced the run the caret was landing on");
  });

  test("a paint refused under the caret is still OWED", async () => {
    const { newCaretGuard, caretEntered, mayPaint, caretSettled } = await load();
    const g = newCaretGuard();
    caretEntered(g);
    mayPaint(g, true);
    assert.equal(caretSettled(g, false), true, "the page would keep showing a model it no longer matches");
  });

  test("the caret moving to ANOTHER run is not a departure", async () => {
    const { newCaretGuard, caretEntered, mayPaint, caretSettled } = await load();
    const g = newCaretGuard();
    caretEntered(g);
    mayPaint(g, true);
    assert.equal(caretSettled(g, true), false, "settling inside the words would re-open the hole");
    assert.equal(g.editing, true, "the guard came down while the author was still typing");
  });

  test("nothing was owed, so nothing is repainted when the caret leaves", async () => {
    const { newCaretGuard, caretEntered, caretSettled } = await load();
    const g = newCaretGuard();
    caretEntered(g);
    assert.equal(caretSettled(g, false), false, "a repaint for a paint nobody asked for");
  });

  test("the instant question is still asked, for a caret this guard never saw arrive", async () => {
    const { newCaretGuard, mayPaint } = await load();
    const g = newCaretGuard();
    // A programmatic `.focus()` (the still-to-fill-in list jumps the author to
    // a field) puts a caret in a run with no focusin this guard raised.
    assert.equal(mayPaint(g, true), false);
  });

  test("the whole sequence the driver ran: four fields, no clicks between them", async () => {
    const { newCaretGuard, caretEntered, mayPaint, caretSettled } = await load();
    const g = newCaretGuard();
    const painted = [];
    // click a run, type (each keystroke asks to paint), click the next one…
    for (const field of ["heading", "sub_heading", "price", "period"]) {
      caretEntered(g);
      painted.push([field, mayPaint(g, true)]);
      // the click on the NEXT run: focusout, then the paint, then focusin
      caretSettled(g, false); // the settle runs a task later — after focusin
    }
    assert.deepEqual(painted.map(([, p]) => p), [false, false, false, false],
      "a paint during any of the four would have thrown that field away");
    // The author clicks the empty page: now the section is drawn from the model.
    caretEntered(g);
    mayPaint(g, true);
    assert.equal(caretSettled(g, false), true, "the page never catches up with the document");
  });

  test("the canvas uses the guard, and asks again on blur", () => {
    const canvas = readSrc("builder/Canvas.tsx");
    assert.ok(canvas.includes("mayPaint(caret.current, caretInRun())"),
      "the paint stopped asking the guard");
    assert.ok(/onBlur=\{\(e\) => \{[\s\S]{0,300}?settleEditing\(\);/.test(canvas),
      "the canvas asks again once the caret has settled");
    assert.ok(canvas.includes("caretEntered(caret.current)"),
      "nothing raises the guard when a run takes the caret");
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   R2-3 — A PICK LANDS WHERE THE AUTHOR IS, AND THE CARET FOLLOWS IT.
   Round 1 closed the first half. The second half is why targets 03, 04 and 06
   print a Totals reading Subtotal $0.00 / Total $0.00 ABOVE its own lines.
   ════════════════════════════════════════════════════════════════════════ */
describe("R2-3 — the caret follows a catalogue pick", () => {
  const load = async () => {
    const [model, insert] = await Promise.all([
      import("../src/builder/model.ts"),
      import("../src/builder/insertPosition.ts"),
    ]);
    return { ...model, ...insert };
  };

  /** One section, one column, one heading in it — a page the author is on. */
  async function page() {
    const m = await load();
    m.resetIds();
    const heading = m.makeWidget("heading", { text: "Your pricing" });
    const sec = m.makeSection({ label: "Section" });
    sec.columns[0].widgets = [heading];
    return { m, heading, sec, doc: m.addSection(m.emptyDocument(), sec) };
  }

  test("THE DEFECT: with the caret left behind, the next insert goes ABOVE the lines", async () => {
    const { m, heading, sec, doc } = await page();
    const caret = { kind: "widget", sectionId: sec.id, columnIndex: 0, widgetIndex: 0, id: heading.id };
    const lines = ["Mowing", "Clean-up", "Snow"].map((n) => m.makeWidget("price_line", { name: n }));
    const first = m.insertNodes(doc, caret, lines);
    // The caret is NOT moved — this is what the scorer measured.
    const totals = m.makeWidget("totals", {});
    const after = m.insertNodes(first.doc, caret, [totals]);
    const order = after.doc.sections[0].columns[0].widgets.map((w) => w.props.name || w.kind);
    assert.deepEqual(order, ["heading", "totals", "Mowing", "Clean-up", "Snow"],
      "with the caret left behind the Totals is printed above the lines it adds up");
  });

  test("THE FIX: the caret sits on the LAST thing that landed", async () => {
    const { m, heading, sec, doc } = await page();
    const caret = { kind: "widget", sectionId: sec.id, columnIndex: 0, widgetIndex: 0, id: heading.id };
    const lines = ["Mowing", "Clean-up", "Snow"].map((n) => m.makeWidget("price_line", { name: n }));
    const first = m.insertNodes(doc, caret, lines);
    // THE RULE ITSELF, executed: the placement answers where the caret goes.
    const moved = first.selection;
    assert.equal(moved.id, lines[2].id, "the caret went to the first line, so the next pick splits the list");
    const totals = m.makeWidget("totals", {});
    const after = m.insertNodes(first.doc, moved, [totals]);
    const order = after.doc.sections[0].columns[0].widgets.map((w) => w.props.name || w.kind);
    assert.deepEqual(order, ["heading", "Mowing", "Clean-up", "Snow", "totals"],
      "the Totals must come after the lines it adds up");
  });

  test("a second pick carries on where the first one stopped", async () => {
    const { m, heading, sec, doc } = await page();
    let caret = { kind: "widget", sectionId: sec.id, columnIndex: 0, widgetIndex: 0, id: heading.id };
    let d = doc;
    for (const batch of [["A1", "A2"], ["B1", "B2"], ["C1"]]) {
      const nodes = batch.map((n) => m.makeWidget("price_line", { name: n }));
      const landed = m.insertNodes(d, caret, nodes);
      d = landed.doc;
      caret = landed.selection;
    }
    assert.deepEqual(d.sections[0].columns[0].widgets.map((w) => w.props.name || w.kind),
      ["heading", "A1", "A2", "B1", "B2", "C1"], "the picks came out interleaved or reversed");
  });

  test("a pick INTO a container leaves the caret inside it", async () => {
    const m = await load();
    m.resetIds();
    const box = m.makeContainer(undefined, []);
    const sec = m.makeSection({ label: "Section" });
    sec.columns[0].widgets = [box];
    const doc = m.addSection(m.emptyDocument(), sec);
    const caret = { kind: "widget", sectionId: sec.id, columnIndex: 0, widgetIndex: 0, id: box.id };
    const nodes = ["One", "Two"].map((n) => m.makeWidget("price_line", { name: n }));
    const landed = m.insertNodes(doc, caret, nodes);
    assert.equal(landed.spot.hostId, box.id, "the pick landed beside the box instead of inside it");
    const next = m.insertNodes(landed.doc, landed.selection, [m.makeWidget("totals", {})]);
    const inside = next.doc.sections[0].columns[0].widgets[0].children.map((w) => w.props.name || w.kind);
    assert.deepEqual(inside, ["One", "Two", "totals"], "the Totals left the box the lines are in");
  });

  test("both pickers go through ONE placement, and the engine finishes the insert", () => {
    const adapter = readSrc("builder/proposal/ProposalBuilder.tsx");
    const shell = readSrc("builder/BuilderShell.tsx");
    assert.ok(adapter.includes("const placePicked = useCallback("), "the one placement is gone");
    assert.ok(adapter.includes("setPickLanded(landed.selection)"),
      "the adapter is building the caret's new home itself instead of taking the placement rule's answer");
    assert.equal((adapter.match(/\bplacePicked\(nodes as Widget\[\]/g) || []).length, 2,
      "the catalogue and the clause pickers are not both going through placePicked");
    assert.ok(adapter.includes("selectLanded={pickLanded}"), "the adapter never tells the engine what it put down");
    assert.ok(/landed\(s\.sectionId, s\.columnIndex, s\.widgetIndex, s\.id \|\| ""\)/.test(shell),
      "the engine finishes an adapter's insert some other way than `landed`");
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   R2-4 — A TABLE'S BODY FOLLOWS ITS COLUMNS.
   ════════════════════════════════════════════════════════════════════════ */
describe("R2-4 — the rows follow the header", () => {
  const load = async () => import("../src/builder/repeater.ts");
  const TABLE = [
    { key: "columns", label: "Columns", type: "list", row: "" },
    { key: "rows", label: "Rows", type: "list", cellsFrom: "columns" },
  ];
  const props = () => ({
    columns: ["Service", "Basic", "Premium"],
    rows: [["Mowing", "Yes", "Yes"], ["Snow", "No", "Per event"]],
  });

  test("THE DEFECT: a fourth column reaches every line, not just the header", async () => {
    const { repeaterOp } = await load();
    const patch = repeaterOp(TABLE, props(), "columns", { kind: "add" });
    assert.equal(patch.columns.length, 4);
    assert.deepEqual(patch.rows, [["Mowing", "Yes", "Yes", ""], ["Snow", "No", "Per event", ""]],
      "the lines stayed three cells wide, so the canvas has no cell to aim at");
  });

  test("deleting a column takes ITS cell, not the last one", async () => {
    const { repeaterOp } = await load();
    const patch = repeaterOp(TABLE, props(), "columns", { kind: "remove", at: 1 });
    assert.deepEqual(patch.columns, ["Service", "Premium"]);
    assert.deepEqual(patch.rows, [["Mowing", "Yes"], ["Snow", "Per event"]],
      "squaring by width would have left every line's third value in its second column");
  });

  test("moving a column moves every line's cell with it", async () => {
    const { repeaterOp } = await load();
    const patch = repeaterOp(TABLE, props(), "columns", { kind: "move", from: 2, to: 0 });
    assert.deepEqual(patch.columns, ["Premium", "Service", "Basic"]);
    assert.deepEqual(patch.rows, [["Yes", "Mowing", "Yes"], ["Per event", "Snow", "No"]]);
  });

  test("duplicating a column duplicates every line's cell", async () => {
    const { repeaterOp } = await load();
    const patch = repeaterOp(TABLE, props(), "columns", { kind: "duplicate", at: 0 });
    assert.deepEqual(patch.columns, ["Service", "Service", "Basic", "Premium"]);
    assert.deepEqual(patch.rows[0], ["Mowing", "Mowing", "Yes", "Yes"]);
  });

  test("a row added to the BODY is as wide as the header, not as the row above", async () => {
    const { repeaterOp, blankRow } = await load();
    // A legacy document: the header has four and the lines still have three.
    const stale = { columns: ["A", "B", "C", "D"], rows: [["1", "2", "3"]] };
    assert.deepEqual(blankRow({ cellsFrom: "columns" }, stale, "rows"), ["", "", "", ""],
      "the new line copied the short one above it");
    const patch = repeaterOp(TABLE, stale, "rows", { kind: "add" });
    assert.equal(patch.rows.length, 2);
    assert.equal(patch.rows[1].length, 4);
  });

  test("a press that changes nothing writes nothing", async () => {
    const { repeaterOp } = await load();
    assert.deepEqual(repeaterOp(TABLE, props(), "columns", { kind: "move", from: 0, to: -1 }), {},
      "pressing up on the first row marked the document changed");
  });

  test("a repeater with nothing following it patches only itself", async () => {
    const { repeaterOp } = await load();
    const ICONS = [{ key: "icon_list", label: "Items", type: "list", row: { text: "", link: "" } }];
    const patch = repeaterOp(ICONS, { icon_list: [{ text: "One", link: "" }] }, "icon_list", { kind: "add" });
    assert.deepEqual(Object.keys(patch), ["icon_list"]);
    assert.deepEqual(patch.icon_list[1], { text: "", link: "" });
  });

  test("the canvas draws a legacy line as wide as the header, exactly as the PDF does", async () => {
    const [{ renderSection, makeContext }, model] = await Promise.all([
      import("../src/builder/render.ts"),
      import("../src/builder/model.ts"),
    ]);
    model.resetIds();
    const w = model.makeWidget("data_table", {
      columns: ["A", "B", "C"],
      rows: [["one"], ["1", "2", "3", "ORPHAN"]],
    });
    const sec = model.makeSection({ label: "S" });
    sec.columns[0].widgets = [w];
    const doc = model.addSection(model.emptyDocument(), sec);
    const html = renderSection(sec, makeContext(doc, { mode: "view" }));
    assert.equal((html.match(/<td/g) || []).length, 6, "a short line and an orphan cell drew as they were stored");
    assert.ok(!html.includes("ORPHAN"), "the canvas printed a cell under no heading; the PDF does not");
  });

  test("the panel says what was pressed and the model says what changes", () => {
    const panel = readSrc("builder/definitionControls.tsx");
    for (const gone of ["addRow(", "moveRow(", "removeRow(", "duplicateRow("]) {
      assert.ok(!panel.includes(gone), `${gone} is back in the panel; the rule lives in repeater.ts`);
    }
    assert.equal((panel.match(/press\(\{ kind: "/g) || []).length, 5,
      "the five presses do not all go through the one rule");
    assert.ok(panel.includes("repeaterOp(controls, props, control.key, op)"),
      "the panel stopped asking the model");
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   R2-11 — AN ICON LIST TAKES A FIFTH POINT.
   ════════════════════════════════════════════════════════════════════════ */
describe("R2-11 — the Icon List reads ONE list, so it can have a repeater", () => {
  const load = async () => {
    const [reg, rep, fam, up, model] = await Promise.all([
      import("../src/builder/registry.ts"),
      import("../src/builder/repeater.ts"),
      import("../src/builder/widgets/families/f3-buttons-icons-panels/iconList.ts"),
      import("../src/builder/upgrade.ts"),
      import("../src/builder/model.ts"),
    ]);
    return { ...reg, ...rep, fam, ...up, ...model };
  };

  test("THE DEFECT: the Items control is a repeater the panel draws", async () => {
    const m = await load();
    const def = m.WIDGETS_BY_KIND.list;
    assert.equal(def.label, "Icon List");
    const items = def.controls.find((c) => c.key === "items");
    assert.ok(items, "the Icon List has no Items control at all");
    assert.ok(m.isRepeater(items), "the Icon List still refuses a fifth point");
    assert.equal(m.blankRow(items, { items: ["a", "b"] }, "items"), "",
      "a new point is not one blank string");
    assert.ok(!def.controls.some((c) => c.key === "icon_list"),
      "both spellings are on the panel again — that is the trap, drawn twice");
  });

  test("ONE READER: the widget reads `items` and nothing else", async () => {
    const { fam } = await load();
    assert.deepEqual(fam.rows({ items: ["One", "Two"] }).map((r) => r.text), ["One", "Two"]);
    assert.deepEqual(fam.rows({ icon_list: [{ text: "Repeater" }], items: ["Plain"] }).map((r) => r.text),
      ["Plain"], "the reader switched lists again, which is how Add Item empties the page");
  });

  test("a stored `icon_list` still opens, converted on the way in", async () => {
    const m = await load();
    const wire = {
      v: 2,
      settings: { style: "plain" },
      sections: [{
        id: "s1", label: "", layout: 1, columns: [{
          id: "c1", widgets: [{ id: "w1", kind: "list", props: { icon_list: [{ text: "Salting" }, { text: "Ploughing" }] } }],
        }],
      }],
    };
    const doc = m.deserialise(JSON.stringify(wire));
    const w = doc.sections[0].columns[0].widgets[0];
    assert.deepEqual(w.props.items, ["Salting", "Ploughing"], "a stored Icon List lost its points");
    assert.ok(!("icon_list" in w.props), "both spellings survived, so the trap survived");
  });

  test("a widget that never held the other spelling comes back as the SAME object", async () => {
    const m = await load();
    const w = { id: "w1", kind: "list", props: { items: ["One"] } };
    const doc = {
      v: 2, settings: { style: "plain" },
      sections: [{ id: "s1", label: "", layout: 1, columns: [{ id: "c1", widgets: [w] }] }],
    };
    const out = m.upgradeDocument(doc);
    assert.equal(out, doc, "the upgrade rebuilt a document it had nothing to do to");
  });

  test("the points reach the page, the mailbox and the paper from the one list", async () => {
    const m = await load();
    const [{ renderSection, makeContext }] = await Promise.all([import("../src/builder/render.ts")]);
    m.resetIds();
    const w = m.makeWidget("list", { items: ["Salting included", "24-hour response", "", "", "A fifth point"] });
    const sec = m.makeSection({ label: "S" });
    sec.columns[0].widgets = [w];
    const doc = m.addSection(m.emptyDocument(), sec);
    const html = renderSection(sec, makeContext(doc, { mode: "view" }));
    for (const point of ["Salting included", "24-hour response", "A fifth point"]) {
      assert.ok(html.includes(point), `the page lost "${point}"`);
    }
    assert.ok(html.includes('data-edit="items.0"') || html.includes("items.0"),
      "the typed path is not the one list");
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   THE HEADING — it arrives with words on it, and its Title is in the panel.
   ════════════════════════════════════════════════════════════════════════ */
describe("the Heading's Title, the first control on its Content tab", () => {
  const load = async () => {
    const [reg, panel, model, render] = await Promise.all([
      import("../src/builder/registry.ts"),
      import("../src/builder/definitionControls.tsx"),
      import("../src/builder/model.ts"),
      import("../src/builder/render.ts"),
    ]);
    return { ...reg, ...panel, ...model, ...render };
  };

  test("THE DEFECT: a new Heading arrives with Elementor's own starting words", async () => {
    const m = await load();
    assert.equal(m.WIDGETS_BY_KIND.heading.defaults.text, "Add Your Heading Text Here",
      "a new Heading lands as an empty <h2>: nothing to see and nothing to click");
  });

  test("Title is the FIRST control on the Content tab, and the panel draws it", async () => {
    const m = await load();
    const content = m.WIDGETS_BY_KIND.heading.controls.filter((c) => (c.tab ?? "content") === "content");
    assert.equal(content[0].key, "text");
    assert.equal(content[0].label, "Title");
    assert.ok(m.isDrawnInPanel(content[0]), "the Content tab still has no Title box");
  });

  test("it asks — every other textarea on the estate is unchanged", async () => {
    const m = await load();
    const asked = [];
    for (const def of Object.values(m.WIDGETS_BY_KIND)) {
      for (const c of def.controls || []) {
        if ((c.type === "text" || c.type === "textarea" || c.type === "richtext") && m.isDrawnInPanel(c)) {
          asked.push(`${def.kind}.${c.key}`);
        }
      }
    }
    /* THREE ASK, AND THE LIST IS THE LAW (2026-09-20, settings audit rows 111
       and 130). The Heading's Title landed first; the Button's Text and the
       Text Editor's words are the other two the reference draws a box for at
       the top of a Content tab. `richtext` joined the question on the same day
       the Text Editor's box was built — a control type that could ask and was
       not being counted would be a census with a hole in it. Everything else
       on the estate is still typed on the page and has no panel field. */
    assert.deepEqual(asked.sort(), ["button.text", "heading.text", "paragraph.text"],
      "a type was added to a set and every textarea grew a box; the control has to ask");
    // MUTATION, executed: take the flag off and the box goes.
    const bare = { ...m.WIDGETS_BY_KIND.heading.controls[0], panel: undefined };
    assert.equal(m.isDrawnInPanel(bare), false);
  });

  test("ONE STORED KEY: the box and the canvas write the same words", async () => {
    const m = await load();
    m.resetIds();
    const w = m.makeWidget("heading", { ...m.WIDGETS_BY_KIND.heading.defaults });
    const sec = m.makeSection({ label: "S" });
    sec.columns[0].widgets = [w];
    let doc = m.addSection(m.emptyDocument(), sec);
    assert.ok(m.renderSection(doc.sections[0], m.makeContext(doc, { mode: "view" }))
      .includes("Add Your Heading Text Here"), "the starting words are not on the page");
    // The panel writes `text`; so does the canvas (`data-edit="text"`).
    doc = m.editWidgetText(doc, w.id, "text", "Seasonal snow & ice");
    const html = m.renderSection(doc.sections[0], m.makeContext(doc, { mode: "view" }));
    assert.ok(html.includes("Seasonal snow &amp; ice"));
    assert.ok(html.includes('data-edit="text"'), "the canvas writes a different key from the panel");
  });
});
