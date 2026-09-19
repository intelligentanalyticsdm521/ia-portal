/**
 * test/builder-tree.test.mjs — THE TREE (§11.12, D-156).
 *
 * Brandon, walking "Choose your plan": *"I'd think each of those would be its
 * own widget. Like Header, drag that into this box and it's now its own section
 * inside the box, then a text field under it with Pick One, then cards … custom
 * cards where they just type the card headers, add a price, and description
 * inside the cards, or product cards where they can directly load
 * products/services from their actual OLIVER Product Catalog."*
 *
 * Every test below is one clause of that sentence, or one of the three guards
 * that keep a tree from eating itself.
 *
 * ── WHAT IS ASSERTED, AND WHY IT IS ASSERTED THIS WAY ─────────────────────
 * The MODEL half is values in and values out, so it is arithmetic. The SURFACE
 * half reads the source of the three files that draw the tree, which is the
 * pattern the rest of this suite already uses for a React file the runner
 * cannot mount — and every one of those assertions is paired with a mutation
 * in the commit message that turns it red on purpose.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  addSection, addWidget, deserialise, emptyDocument, extendSelection, lockedWidgets,
  makeContainer, makeSection, makeWidget, resetIds, selectedIds, serialise, walkWidgets,
  widgetAt,
} from "../src/builder/model.ts";
import {
  CONTAINER_PRESETS, MAX_DEPTH, cloneNode, directionOf, dropIndexForNode, duplicateNode,
  findNode, groupNodes, holdsLocked, hostDepth, insertNode, isContainer, makePreset, moveNode,
  nodeIdAt, nudgeNode, removeNode, setDirection, setNodeStyle, subtreeHeight, ungroupNode,
} from "../src/builder/treeOps.ts";
import { COMPOSITE_KINDS, needsUpgrade, upgradeDocument } from "../src/builder/upgrade.ts";
import { makeContext, renderDocument, renderSection } from "../src/builder/render.ts";
import { containerLayoutDeclarations } from "../src/builder/style.ts";
import { outline, dropTargetFor, rowLabel } from "../src/builder/navigatorModel.ts";
import { menuFor } from "../src/builder/builderMenu.ts";

const SRC = path.join(process.cwd(), "src");
const readSrc = (p) => readFileSync(path.join(SRC, p), "utf8");

/** A document with one section, one column, and whatever is handed in. */
function docWith(nodes) {
  resetIds();
  const section = makeSection({ label: "One" });
  let doc = addSection(emptyDocument(), section);
  for (const n of nodes) doc = addWidget(doc, section.id, 0, n);
  return { doc, section, column: section.columns[0] };
}

/* ══════════════════════════════════════════════════════════════════════════
   1. BRANDON'S SENTENCE
   ══════════════════════════════════════════════════════════════════════════ */

describe("Brandon's sentence, one clause at a time (D-156)", () => {
  test("a box can be put on the page, and a Header dragged INTO it", () => {
    const box = makeContainer();
    const { doc, column } = docWith([box]);
    const heading = makeWidget("heading", { text: "Choose your plan" });

    const after = insertNode(doc, box.id, 0, heading);
    const hit = findNode(after, heading.id);

    assert.equal(hit.parentId, box.id, "the heading did not land inside the box");
    assert.equal(hit.depth, 1, "the heading is not one level in");
    assert.notEqual(hit.parentId, column.id, "it landed in the column, beside the box");
  });

  test("a text field goes UNDER it, in the same box", () => {
    const heading = makeWidget("heading", { text: "Choose your plan" });
    const box = makeContainer(undefined, [heading]);
    const { doc } = docWith([box]);
    const para = makeWidget("paragraph", { text: "Pick one" });

    const after = insertNode(doc, box.id, 1, para);
    const hit = findNode(after, para.id);

    assert.equal(hit.parentId, box.id);
    assert.equal(hit.index, 1, "the paragraph did not go under the heading");
  });

  test("then a ROW of cards inside that box, each card its own thing", () => {
    const box = makeContainer();
    const { doc } = docWith([box]);
    const row = makePreset("row");
    let after = insertNode(doc, box.id, 0, row);
    const typed = makeWidget("card", { title: "Standard", price: "$249" });
    const fromCatalogue = makeWidget("catalog_card", { offeringId: "svc-7" });
    after = insertNode(after, row.id, 0, typed);
    after = insertNode(after, row.id, 1, fromCatalogue);

    assert.equal(directionOf(findNode(after, row.id).node), "row");
    assert.equal(findNode(after, typed.id).depth, 2, "the card is not two levels in");
    assert.equal(findNode(after, fromCatalogue.id).parentId, row.id);

    // EVERY ELEMENT INDIVIDUALLY REMOVABLE (D-156 item 4) — the whole reason
    // the composite had to go. One card leaves, the other stays.
    const oneLess = removeNode(after, typed.id);
    assert.equal(findNode(oneLess, typed.id), null, "the typed card could not be removed on its own");
    assert.ok(findNode(oneLess, fromCatalogue.id), "removing one card took the other with it");
  });

  test("three deep renders, and every level is a drop target the canvas can find", () => {
    const card = makeWidget("card", { heading: "Standard" });
    const row = makeContainer({ direction: "row" }, [card]);
    const box = makeContainer(undefined, [makeWidget("heading", { text: "Choose" }), row]);
    const { doc } = docWith([box]);

    const html = renderSection(doc.sections[0], makeContext(doc, { mode: "edit" }));
    const hosts = [...html.matchAll(/data-bx-host="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(hosts.includes(box.id), "the box is not a drop target");
    assert.ok(hosts.includes(row.id), "the row inside it is not a drop target");
    assert.ok(hosts.includes(doc.sections[0].columns[0].id), "the column is not a drop target");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2. THE THREE GUARDS
   ══════════════════════════════════════════════════════════════════════════ */

describe("the three guards, each broken on purpose in the commit", () => {
  test("RULE 1 — a box never moves inside itself, or inside its own child", () => {
    const inner = makeContainer();
    const outer = makeContainer(undefined, [inner]);
    const { doc } = docWith([outer]);

    assert.equal(moveNode(doc, outer.id, outer.id, 0), doc, "a box was moved into itself");
    assert.equal(moveNode(doc, outer.id, inner.id, 0), doc, "a box was moved into its own child");
    // …and the branch is still attached.
    assert.ok(findNode(doc, inner.id), "the inner box was detached");
  });

  test("RULE 2 — a locked part, and the box around it, refuse to be deleted or copied", () => {
    const footer = makeWidget("email_footer", {}, { locked: true });
    const box = makeContainer(undefined, [footer]);
    const { doc } = docWith([box]);

    assert.ok(holdsLocked(box), "a box holding the footer does not read as locked");
    assert.equal(removeNode(doc, footer.id), doc, "the footer was deleted");
    assert.equal(removeNode(doc, box.id), doc, "the box round the footer was deleted");
    assert.equal(duplicateNode(doc, box.id), doc, "a second unsubscribe footer was made");
    assert.equal(lockedWidgets(doc).length, 1, "the locked part is not seen inside a box");
  });

  test("RULE 3 — nesting stops, and the document comes back unchanged rather than deeper", () => {
    let doc = docWith([]).doc;
    const column = doc.sections[0].columns[0];
    let hostId = column.id;
    const ids = [];
    for (let i = 0; i < MAX_DEPTH; i++) {
      const box = makeContainer();
      const next = insertNode(doc, hostId, 0, box);
      assert.notEqual(next, doc, `level ${i + 1} was refused too early`);
      doc = next;
      hostId = box.id;
      ids.push(box.id);
    }
    assert.equal(hostDepth(doc, hostId), MAX_DEPTH);
    const tooFar = insertNode(doc, hostId, 0, makeContainer());
    assert.equal(tooFar, doc, "a box went deeper than the limit");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   3. THE OPERATIONS
   ══════════════════════════════════════════════════════════════════════════ */

describe("insert, move, duplicate, group, ungroup, transform", () => {
  test("the index maths: dragging DOWN inside one box lands on the line, not one short", () => {
    // Lift-then-insert shifts the target down by one when it came from above in
    // the same box. Getting this wrong is invisible in a test that only drags
    // upwards, which is why both directions are here.
    assert.equal(dropIndexForNode("b1", 0, "b1", 3), 2);
    assert.equal(dropIndexForNode("b1", 3, "b1", 0), 0);
    assert.equal(dropIndexForNode("b1", 3, "b2", 0), 0, "a different box must not be adjusted");
  });

  test("a widget moves from a column INTO a box and back out again", () => {
    const box = makeContainer();
    const para = makeWidget("paragraph", { text: "Move me" });
    const { doc, column } = docWith([box, para]);

    const inBox = moveNode(doc, para.id, box.id, 0);
    assert.equal(findNode(inBox, para.id).parentId, box.id);
    assert.equal(findNode(inBox, para.id).depth, 1);

    const backOut = moveNode(inBox, para.id, column.id, 0);
    assert.equal(findNode(backOut, para.id).parentId, column.id);
    assert.equal(findNode(backOut, para.id).index, 0);
  });

  test("a duplicate is a DEEP copy with fresh ids all the way down", () => {
    const card = makeWidget("card", { title: "Standard", bullets: ["a", "b"] });
    const row = makeContainer({ direction: "row" }, [card]);
    const { doc } = docWith([row]);

    const after = duplicateNode(doc, row.id);
    const rows = [];
    for (const s of after.sections) for (const c of s.columns) for (const n of c.widgets) rows.push(n);
    assert.equal(rows.length, 2);
    assert.notEqual(rows[0].id, rows[1].id, "the copy shares the original's id");
    assert.notEqual(rows[0].children[0].id, rows[1].children[0].id, "the card inside shares its id");
    assert.notEqual(rows[0].children[0].props.bullets, rows[1].children[0].props.bullets,
      "the copy shares the original's props object");
    assert.deepEqual(rows[0].children[0].props, rows[1].children[0].props);
  });

  test("GROUP puts two siblings in one box, in order, where the first one was", () => {
    const a = makeWidget("heading", { text: "A" });
    const b = makeWidget("paragraph", { text: "B" });
    const c = makeWidget("paragraph", { text: "C" });
    const { doc, column } = docWith([a, b, c]);

    const after = groupNodes(doc, [a.id, b.id]);
    const kids = after.sections[0].columns[0].widgets;
    assert.equal(kids.length, 2, "the run was not replaced by one box");
    assert.ok(isContainer(kids[0]));
    assert.deepEqual(kids[0].children.map((n) => n.id), [a.id, b.id], "the order changed");
    assert.equal(kids[1].id, c.id, "the one left out moved");
    assert.equal(findNode(after, a.id).depth, 1);
    void column;
  });

  test("GROUP refuses things that are not siblings, and refuses one thing", () => {
    const a = makeWidget("heading", { text: "A" });
    const inner = makeWidget("paragraph", { text: "B" });
    const box = makeContainer(undefined, [inner]);
    const { doc } = docWith([a, box]);

    assert.equal(groupNodes(doc, [a.id]), doc, "one thing was put in a box");
    assert.equal(groupNodes(doc, [a.id, inner.id]), doc, "two things in different boxes were grouped");
  });

  test("UNGROUP leaves what was in it, exactly where the box was", () => {
    const a = makeWidget("heading", { text: "A" });
    const b = makeWidget("paragraph", { text: "B" });
    const before = makeWidget("divider", {});
    const box = makeContainer(undefined, [a, b]);
    const { doc } = docWith([before, box]);

    const after = ungroupNode(doc, box.id);
    assert.deepEqual(after.sections[0].columns[0].widgets.map((n) => n.id), [before.id, a.id, b.id]);
  });

  test("group then ungroup gets you back to where you started", () => {
    const a = makeWidget("heading", { text: "A" });
    const b = makeWidget("paragraph", { text: "B" });
    const { doc } = docWith([a, b]);
    const grouped = groupNodes(doc, [a.id, b.id]);
    const box = grouped.sections[0].columns[0].widgets[0];
    assert.deepEqual(
      ungroupNode(grouped, box.id).sections[0].columns[0].widgets.map((n) => n.id),
      [a.id, b.id],
    );
  });

  test("row ↔ column ↔ grid, and going back to a column leaves NOTHING behind", () => {
    const box = makeContainer();
    const { doc } = docWith([box]);

    const asRow = setDirection(doc, box.id, "row");
    assert.equal(directionOf(findNode(asRow, box.id).node), "row");

    const asGrid = setDirection(asRow, box.id, "grid");
    assert.equal(findNode(asGrid, box.id).node.style.columns, 3, "a grid with no column count");

    const back = setDirection(asGrid, box.id, "column");
    const node = findNode(back, box.id).node;
    assert.equal(directionOf(node), "column");
    // Byte-identical to a box nobody ever touched: `column` is the DEFAULT, so
    // it removes the key rather than writing it.
    assert.equal(node.style, undefined, "turning it back left a style key behind");
  });

  test("nudge moves among siblings and stops at both ends", () => {
    const a = makeWidget("heading", { text: "A" });
    const b = makeWidget("paragraph", { text: "B" });
    const { doc } = docWith([a, b]);
    assert.deepEqual(nudgeNode(doc, b.id, -1).sections[0].columns[0].widgets.map((n) => n.id), [b.id, a.id]);
    assert.equal(nudgeNode(doc, a.id, -1), doc, "the first one moved up");
    assert.equal(nudgeNode(doc, b.id, 1), doc, "the last one moved down");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   4. ONE ADDRESS
   ══════════════════════════════════════════════════════════════════════════ */

describe("one address: the node id, and the legacy path over it", () => {
  test("a legacy path reaches the top of a column, exactly as it always did", () => {
    const para = makeWidget("paragraph", { text: "Top" });
    const { doc, section } = docWith([para]);
    assert.equal(nodeIdAt(doc, { sectionId: section.id, columnIndex: 0, widgetIndex: 0 }), para.id);
    assert.equal(widgetAt(doc, { sectionId: section.id, columnIndex: 0, widgetIndex: 0 }).id, para.id);
  });

  test("the ID wins, which is what reaches a card three boxes down", () => {
    const card = makeWidget("card", { title: "Deep" });
    const row = makeContainer({ direction: "row" }, [card]);
    const box = makeContainer(undefined, [row]);
    const { doc, section } = docWith([box]);
    // The three indices point at the BOX. The id points at the card. The id is
    // the address, so the card is what comes back.
    const path = { sectionId: section.id, columnIndex: 0, widgetIndex: 0, id: card.id };
    assert.equal(nodeIdAt(doc, path), card.id);
    assert.equal(widgetAt(doc, path).props.title, "Deep");
  });

  test("walkWidgets reaches everything at every depth, and never returns a box", () => {
    const card = makeWidget("card", { title: "Deep" });
    const row = makeContainer({ direction: "row" }, [card]);
    const top = makeWidget("heading", { text: "Top" });
    const { doc } = docWith([top, row]);

    const found = walkWidgets(doc);
    assert.deepEqual(found.map((f) => f.widget.id), [top.id, card.id]);
    assert.ok(found.every((f) => !isContainer(f.widget)), "a box came back as a widget");
    assert.ok(found.every((f) => f.path.id), "a path came back with no id on it");
  });

  test("Shift adds and Shift takes away, and a plain click lets the lot go", () => {
    const anchor = { kind: "widget", sectionId: "s1", columnIndex: 0, widgetIndex: 0, id: "w1" };
    const withTwo = extendSelection(anchor, { sectionId: "s1", columnIndex: 0, widgetIndex: 1, id: "w2" });
    assert.deepEqual(selectedIds(withTwo), ["w1", "w2"]);

    const back = extendSelection(withTwo, { sectionId: "s1", columnIndex: 0, widgetIndex: 1, id: "w2" });
    assert.deepEqual(selectedIds(back), ["w1"], "shift-clicking it again did not take it out");

    assert.deepEqual(selectedIds(anchor), ["w1"]);
    assert.deepEqual(selectedIds(null), []);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   5. WHAT IS STORED
   ══════════════════════════════════════════════════════════════════════════ */

describe("what is stored, and what a document without boxes still looks like", () => {
  test("a document with no boxes round-trips byte for byte", () => {
    resetIds();
    const s = makeSection({ label: "Plain", layout: 2 });
    let doc = addSection(emptyDocument(), s);
    doc = addWidget(doc, s.id, 0, makeWidget("heading", { text: "Hi" }));
    doc = addWidget(doc, s.id, 1, makeWidget("paragraph", { text: "Words" }));
    const wire = serialise(doc);
    assert.equal(serialise(deserialise(wire)), wire);
    assert.doesNotMatch(wire, /"kind":"container"/);
  });

  test("a box round-trips, children and layout and all", () => {
    const card = makeWidget("card", { heading: "Standard" });
    const row = makeContainer({ direction: "row", gap: 16 }, [card]);
    const { doc } = docWith([makeWidget("heading", { text: "Choose" }), row]);
    // From the STORED form, which is what the promise is about: reading a
    // document and writing it back must not change a byte. (An in-memory object
    // literal can spell its own keys in any order; storage cannot.)
    const wire = serialise(deserialise(serialise(doc)));
    assert.equal(serialise(deserialise(wire)), wire);

    const back = deserialise(wire);
    const backRow = back.sections[0].columns[0].widgets[1];
    assert.ok(isContainer(backRow));
    assert.equal(backRow.children[0].props.heading, "Standard");
    assert.equal(directionOf(backRow), "row");
  });

  test("a container with nonsense in it comes back as an empty box, not a crash", () => {
    const wire = JSON.stringify({
      v: 2,
      settings: { style: "plain" },
      sections: [{
        id: "s1", layout: 1, width: "contained", padding: 24, theme: "light", visibility: "customer",
        columns: [{ id: "c1", widgets: [{ id: "b1", kind: "container" }] }],
      }],
    });
    const back = deserialise(wire);
    const box = back.sections[0].columns[0].widgets[0];
    assert.ok(isContainer(box), "a container with no children array was dropped");
    assert.deepEqual(box.children, []);
  });

  test("a section duplicate deep-copies the whole tree", () => {
    const card = makeWidget("card", { heading: "Standard" });
    const row = makeContainer({ direction: "row" }, [card]);
    const { doc } = docWith([row]);
    const copy = cloneNode(row);
    assert.notEqual(copy.id, row.id);
    assert.notEqual(copy.children[0].id, card.id);
    void doc;
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   6. HOW A BOX IS DRAWN
   ══════════════════════════════════════════════════════════════════════════ */

describe("how a box is drawn", () => {
  test("a box with no layout emits NO css, so nothing already on the line moves", () => {
    assert.deepEqual(containerLayoutDeclarations({}), []);
    assert.deepEqual(containerLayoutDeclarations({ padding: { top: 8 } }), []);
  });

  test("a row, a grid and a gap each say exactly one thing", () => {
    assert.deepEqual(containerLayoutDeclarations({ direction: "row", gap: 16 }),
      ["display:flex", "flex-direction:row", "gap:16px"]);
    assert.deepEqual(containerLayoutDeclarations({ direction: "grid", columns: 2 }),
      ["display:grid", "grid-template-columns:repeat(2,minmax(0,1fr))"]);
    assert.deepEqual(containerLayoutDeclarations({ justify: "between", alignItems: "center" }),
      ["display:flex", "flex-direction:column", "justify-content:space-between", "align-items:center"]);
  });

  test("the drop hook is an EDITOR marker: the customer's copy has none", () => {
    const box = makeContainer({ direction: "row" }, [makeWidget("heading", { text: "Hi" })]);
    const { doc } = docWith([box]);
    const view = renderDocument(doc, makeContext(doc, { mode: "view" }));
    assert.doesNotMatch(view, /data-bx-host/, "the customer's copy carries an editor hook");
    assert.doesNotMatch(view, /data-widget/);
    assert.match(view, /class="bx-w bx-box/, "the box itself is missing from the customer's copy");

    const edit = renderDocument(doc, makeContext(doc, { mode: "edit" }));
    assert.match(edit, /data-bx-host="/);
  });

  test("a styled box gets its rules, and so does a widget INSIDE it", () => {
    const inner = makeWidget("heading", { text: "Hi", level: 2 });
    inner.style = { typography: { size: 30 } };
    const box = makeContainer({ direction: "row", gap: 12 }, [inner]);
    const { doc } = docWith([box]);
    const html = renderSection(doc.sections[0], makeContext(doc, { mode: "edit" }));
    assert.ok(html.includes(`.bx-sy-${box.id}{`), "the box got no rules at all");
    assert.ok(html.includes("flex-direction:row"), "the box's own layout was not emitted");
    assert.ok(html.includes(`.bx-sy-${inner.id}`), "a widget INSIDE a box gets no rules at all");
    assert.ok(html.includes("font-size:30px"), "the nested widget's typography was dropped");
  });

  test("an empty box is a target in the editor and nothing in the customer's copy", () => {
    const box = makeContainer();
    const { doc } = docWith([box]);
    assert.match(renderSection(doc.sections[0], makeContext(doc, { mode: "edit" })), /bx-box-empty/);
    assert.doesNotMatch(renderDocument(doc, makeContext(doc, { mode: "view" })), /bx-box/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   7. THE OUTLINE
   ══════════════════════════════════════════════════════════════════════════ */

describe("the outline shows the nesting", () => {
  test("every row knows how far in it sits", () => {
    const card = makeWidget("card", { heading: "Standard" });
    const row = makeContainer({ direction: "row" }, [card]);
    const box = makeContainer(undefined, [makeWidget("heading", { text: "Choose" }), row]);
    const { doc } = docWith([box]);

    const rows = outline(doc).filter((r) => r.kind === "widget");
    assert.deepEqual(rows.map((r) => r.depth), [0, 1, 1, 2]);
    assert.equal(rows[0].container, true, "the box does not read as a box");
    assert.equal(rows[3].container, false, "the card reads as a box");
  });

  test("a box is named for what it does and how much is in it", () => {
    assert.equal(rowLabel(makeContainer()), "Box · empty");
    assert.equal(rowLabel(makeContainer({ direction: "row" }, [makeWidget("card", {})])), "Row · 1 thing");
    assert.equal(
      rowLabel(makeContainer({ direction: "grid" }, [makeWidget("card", {}), makeWidget("card", {})])),
      "Grid · 2 things",
    );
  });

  test("a drop on a row means 'into ITS box, before it' — which is how you get out of one", () => {
    const card = makeWidget("card", { heading: "Standard" });
    const row = makeContainer({ direction: "row" }, [card]);
    const top = makeWidget("heading", { text: "Top" });
    const { doc, column } = docWith([top, row]);

    const rows = outline(doc);
    const cardRow = rows.findIndex((r) => r.id === card.id);
    assert.deepEqual(dropTargetFor(rows, cardRow), { hostId: row.id, index: 0 });

    const topRow = rows.findIndex((r) => r.id === top.id);
    assert.deepEqual(dropTargetFor(rows, topRow), { hostId: column.id, index: 0 });

    // A section header means the very top of it.
    assert.deepEqual(dropTargetFor(rows, 0), { hostId: column.id, index: 0 });
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   8. THE MENU
   ══════════════════════════════════════════════════════════════════════════ */

describe("the menu offers the box verbs, and says why when it cannot", () => {
  const ids = (items) => items.map((i) => i.action);

  test("two things selected can be put in a box; one cannot, and it says so", () => {
    const one = menuFor({ kind: "widget", selectedCount: 1 }).find((i) => i.action === "group");
    assert.equal(one.disabled, true);
    assert.match(one.reason, /Shift/);

    const two = menuFor({ kind: "widget", selectedCount: 2 }).find((i) => i.action === "group");
    assert.ok(!two.disabled);
    assert.match(two.label, /Put these in a box/);
  });

  test("only a BOX is offered ungroup and the three directions", () => {
    assert.ok(!ids(menuFor({ kind: "widget" })).includes("ungroup"));
    const box = ids(menuFor({ kind: "widget", container: true, direction: "column" }));
    assert.ok(box.includes("ungroup"));
    assert.ok(box.includes("toRow"));
    assert.ok(box.includes("toGrid"));
    // The way it ALREADY runs is not offered again — a menu row that does
    // nothing is a menu row somebody presses twice.
    assert.ok(!box.includes("toColumn"));
  });

  test("a section is never offered any of them", () => {
    const section = ids(menuFor({ kind: "section", index: 0, total: 3 }));
    for (const verb of ["group", "ungroup", "toRow", "toColumn", "toGrid"]) {
      assert.ok(!section.includes(verb), `a section was offered ${verb}`);
    }
  });

  test("too deep is greyed with a reason rather than refusing after the press", () => {
    const row = menuFor({ kind: "widget", selectedCount: 2, tooDeep: true }).find((i) => i.action === "group");
    assert.equal(row.disabled, true);
    assert.match(row.reason, /as deep as boxes go/);
  });

  test("Delete on a box says box, not block", () => {
    assert.match(menuFor({ kind: "widget", container: true }).find((i) => i.action === "delete").label,
      /Delete this box/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   9. THE UPGRADE
   ══════════════════════════════════════════════════════════════════════════ */

describe("composites become trees, and everything else is left exactly alone", () => {
  test("a document with no composites comes back as THE SAME OBJECT", () => {
    const { doc } = docWith([makeWidget("heading", { text: "Hi" }), makeContainer()]);
    assert.equal(upgradeDocument(doc), doc, "the document was rebuilt when there was nothing to do");
    assert.equal(needsUpgrade(doc), false);
    assert.equal(serialise(upgradeDocument(doc)), serialise(doc));
  });

  test("comparison_cards becomes heading + paragraph + a row of cards", () => {
    const old = makeWidget("comparison_cards", {
      heading: "Choose your plan",
      intro: "Pick one.",
      cards: [
        { name: "Standard", price: "$249", per: "/mo", list_price: "$299", pitch: "The usual", features: ["a", "b"], recommended: true, badge: "Best Price" },
        { name: "Pro", price: "$399", item_id: "svc-7" },
      ],
    });
    const { doc } = docWith([old]);
    assert.equal(needsUpgrade(doc), true);

    const box = upgradeDocument(doc).sections[0].columns[0].widgets[0];
    assert.ok(isContainer(box));
    assert.equal(box.id, old.id, "the id changed, so every revision badge would light up");

    const [heading, para, row] = box.children;
    assert.equal(heading.kind, "heading");
    assert.equal(heading.props.text, "Choose your plan");
    assert.equal(para.kind, "paragraph");
    assert.equal(para.props.text, "Pick one.");
    assert.equal(directionOf(row), "row");

    const [typed, fromCatalogue] = row.children;
    assert.equal(typed.kind, "card");
    // THE CARD'S OWN NAMES, which are the price table's (conformance 2026-09-17).
    assert.equal(typed.props.heading, "Standard");
    assert.equal(typed.props.original_price, "$299", "list_price was dropped");
    assert.equal(typed.props.sale, "yes", "an old price with no saving switch reads as a leftover");
    assert.equal(typed.props.description, "The usual", "pitch was dropped");
    // The price table's REPEATER shape — one `{ item_text }` per line.
    assert.deepEqual(typed.props.features_list, [{ item_text: "a" }, { item_text: "b" }],
      "features were dropped");
    // The ribbon is the price table's four keys, and the older spellings are
    // GONE rather than left beside them.
    assert.equal(typed.props.show_ribbon, "yes");
    assert.equal(typed.props.ribbon_title, "Best Price");
    assert.equal(typed.props.ribbon_preset, "best_price");
    for (const old of ["tag", "badge", "recommended"]) {
      assert.ok(!(old in typed.props), `the old ribbon key \`${old}\` is still on the card`);
    }
    // A card that NAMES a catalogue item is a CATALOGUE card, bound by the
    // catalogue's own two keys, and carrying what the composite was already
    // showing as its snapshot so it is never blank where there is no catalogue.
    assert.equal(fromCatalogue.kind, "catalog_card");
    assert.deepEqual(fromCatalogue.props._ia_selection, { offering_id: "svc-7" });
    assert.equal(fromCatalogue.props._ia_source, "oliver:catalogue");
    assert.equal(fromCatalogue.props._ia_snapshot.title, "Pro");
    assert.equal(fromCatalogue.props._ia_snapshot.price, "$399");
  });

  test("no heading and no intro means no empty heading and no empty paragraph", () => {
    const old = makeWidget("comparison_cards", { cards: [{ name: "Only" }] });
    const { doc } = docWith([old]);
    const box = upgradeDocument(doc).sections[0].columns[0].widgets[0];
    assert.equal(box.children.length, 1, "an empty heading or paragraph was invented");
    assert.equal(directionOf(box.children[0]), "row");
  });

  test("property_block, key_facts and priced_line", () => {
    const property = makeWidget("property_block", {
      locationId: "loc-3", heading: "42 Elm St", items: [{ description: "Plowing", unit_price: 200 }],
    });
    const facts = makeWidget("key_facts", { rows: [{ label: "Term", value: "12 months" }, { label: "Start", value: "Nov 1" }] });
    const priced = makeWidget("priced_line", { name: "Salting", unit_price: 85, quantity: 2 });
    const { doc } = docWith([property, facts, priced]);

    const [p, f, line] = upgradeDocument(doc).sections[0].columns[0].widgets;

    // The items are PRICED LINES, never a rate card: a rate card is prose and
    // does not reach a total, so a property's money would have quietly gone.
    assert.deepEqual(p.children.map((n) => n.kind),
      ["heading", "service_location", "price_line", "totals"]);
    assert.equal(p.children[1].props.locationId, "loc-3");
    assert.equal(p.children[2].props.name, "Plowing");
    assert.equal(p.children[2].props.unit_price, 200);

    assert.equal(directionOf(f), "row");
    /* D-165 — a key fact is a LINE OF TEXT with its label in bold (§11.13.3),
       so `key_facts` converts straight to Text Editors. Straight, in one hop:
       `upgradeNode` visits a node once, and a two-hop conversion would leave a
       `key_fact` on the page that nothing draws. */
    assert.deepEqual(f.children.map((n) => n.kind), ["paragraph", "paragraph"]);
    assert.deepEqual(f.children.map((n) => n.props.text),
      ["**Term** 12 months", "**Start** Nov 1"]);

    assert.equal(line.kind, "price_line");
    assert.equal(line.id, priced.id, "the priced line lost its id, so its total would move");
    assert.equal(line.props.unit_price, 85);
  });

  test("it reaches a composite INSIDE a box, and running it twice changes nothing", () => {
    const old = makeWidget("key_facts", { rows: [{ label: "Term", value: "12 months" }] });
    const box = makeContainer(undefined, [old]);
    const { doc } = docWith([box]);

    const once = upgradeDocument(doc);
    const inside = once.sections[0].columns[0].widgets[0].children[0];
    assert.ok(isContainer(inside), "a composite inside a box was left alone");

    assert.equal(upgradeDocument(once), once, "a second pass rebuilt the document");
    assert.equal(needsUpgrade(once), false);
  });

  test("the list of what it takes apart is exactly the four §11.12 names", () => {
    assert.deepEqual([...COMPOSITE_KINDS],
      ["comparison_cards", "property_block", "key_facts", "priced_line"]);
    // pricing_table and totals STAY widgets — Elementor's Price List and Price
    // Table are widgets too, and totals sums the document.
    assert.ok(!COMPOSITE_KINDS.includes("pricing_table"));
    assert.ok(!COMPOSITE_KINDS.includes("totals"));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   10. THE SURFACES
   ══════════════════════════════════════════════════════════════════════════ */

describe("the surfaces carry the tree, and carry it once", () => {
  const canvas = readSrc("builder/Canvas.tsx");
  const picker = readSrc("builder/WidgetPicker.tsx");
  const shell = readSrc("builder/BuilderShell.tsx");
  const model = readSrc("builder/model.ts");
  const nav = readSrc("builder/Navigator.tsx");

  test("the canvas finds the DEEPEST box under the pointer, not the first", () => {
    // The first match is always the column, because a box inside it is inside
    // its rectangle too — and a card could then never be dropped into a row.
    assert.match(canvas, /boxes\.filter\(covers\)\.pop\(\)/);
    assert.match(canvas, /querySelectorAll<HTMLElement>\("\[data-bx-host\]"\)/);
  });

  test("a row measures ACROSS and a column measures DOWN", () => {
    assert.match(canvas, /flexDirection === "row"/);
    assert.match(canvas, /across \? clientX < r\.left \+ r\.width \/ 2 : clientY < r\.top \+ r\.height \/ 2/);
  });

  test("the picker's Layout group offers the boxes, and they are not fake widgets", () => {
    assert.match(picker, /CONTAINER_PRESETS/);
    assert.match(picker, /g\.task === "Layout" && p\.onPickBox/);
    assert.match(picker, /data-picker-box=/);
    // A container has no registry entry and must not pretend to.
    assert.doesNotMatch(picker, /WIDGETS_BY_KIND\["container"\]/);
  });

  test("the outline can move something between levels, through the same moveNode", () => {
    assert.match(nav, /onMoveNode\?\.\(dragId, dropTargetFor\(rows, i\)\)/);
    assert.match(shell, /onMoveNode: \(id, to\) =>/);
    assert.match(shell, /moveNode\(doc, id, to\.hostId, to\.index\)/);
  });

  test("ONE insert: nothing in the shell splices a node in by hand", () => {
    assert.doesNotMatch(shell, /widgets\.splice\(/);
    assert.match(shell, /insertNode\(next, spot\.hostId, spot\.index, widget\)/);
  });

  test("ONE implementation underneath: the legacy path ops are two lines each", () => {
    // `removeWidget` and friends resolve a path to an id and call the operation.
    // A second traversal in model.ts is a second answer to "may this be
    // deleted", and the first person to find that out is a customer.
    for (const fn of ["removeWidget", "duplicateWidget", "patchWidget", "setWidgetStyle", "setWidgetLocked"]) {
      const body = model.slice(model.indexOf(`export function ${fn}(`));
      const head = body.slice(0, body.indexOf("\n}"));
      assert.match(head, /nodeIdAt\(doc, path\)/, `${fn} does not go through the one address`);
      assert.doesNotMatch(head, /mapSections/, `${fn} still walks the document itself`);
    }
  });

  test("the three presets are Box, Row and Grid, and a Box is the plain one", () => {
    assert.deepEqual(CONTAINER_PRESETS.map((c) => c.key), ["box", "row", "grid"]);
    assert.equal(makePreset("box").style, undefined, "a plain box carries a style it does not need");
    assert.equal(directionOf(makePreset("row")), "row");
    assert.equal(subtreeHeight(makePreset("grid")), 0);
  });

  /* TWO DEFECTS FOUND BY DRIVING IT, NOT BY READING IT (2026-09-17).

     Both are about the SAME thing: a gesture that changed the document and
     showed the author nothing, or showed them the opposite of what happened.
     Neither was reachable from a model test, because both are about what the
     canvas does with a click. */

  test("the selection marks do NOT need a repaint (found by driving it)", () => {
    // The paint is deliberately skipped while the caret is inside a run of
    // text, and on this canvas clicking any words puts the caret inside one.
    // So shift-click set the model and drew nothing at all, and "select two
    // things and put them in a box" had no way to show what was selected.
    //
    // THE ASSERTION IS SCOPED TO THAT EFFECT, and the first version of it was
    // not: it matched "somewhere in this file a class is toggled", which the
    // PAINT also does, so deleting the line from the marks effect stayed green.
    // A mutation said so. It now reads only between the effect's own comment
    // and its own dependency array.
    const from = canvas.indexOf("THE SELECTION MARKS, WITHOUT A REPAINT");
    assert.ok(from > 0, "the marks effect is gone");
    const body = canvas.slice(from, canvas.indexOf("}, [selectedWidgetId, alsoKey, html]);", from));
    assert.match(body, /classList\.toggle\("bxc-widget-also"/, "the marks effect draws no mark");
    assert.match(body, /classList\.toggle\("bxc-widget-sel"/, "the marks effect draws no selection");
    // …and it is NOT behind the caret guard, and writes no HTML.
    assert.doesNotMatch(body, /data-bx-editable/, "the marks effect is behind the caret guard");
    assert.doesNotMatch(body, /innerHTML/, "the marks effect rewrites HTML");
  });

  test("a right-click on something already selected KEEPS the selection (found by driving it)", () => {
    // Shift-click two widgets, right-click one of them, and the menu re-selected
    // THAT one on its way open — so "Put these in a box" was greyed out with
    // "hold Shift and click a second thing" beside it while two things were
    // selected. The gesture that opens the menu cannot undo what the menu is
    // for.
    assert.match(canvas, /const already = alsoKey\.split\(","\)\.includes\(path\.id \|\| ""\) \|\| path\.id === selectedWidgetId;/);
    assert.match(canvas, /if \(!already\) onSelect\(\{ kind: "widget", \.\.\.path \}\);/);
  });

  test("no vendor names anywhere the author can read them", () => {
    for (const [name, src] of [["picker", picker], ["canvas", canvas], ["navigator", nav]]) {
      const strings = [...src.matchAll(/(?:title|label|aria-label|description)[=:]\s*"([^"]+)"/g)].map((m) => m[1]);
      for (const s of strings) {
        assert.doesNotMatch(s, /Elementor|Gutenberg|Wix|WordPress/i, `${name}: "${s}"`);
      }
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   11. WHAT WAS REPLACED IS GONE
   ══════════════════════════════════════════════════════════════════════════ */

describe("replace means delete", () => {
  const pane = readSrc("builder/WidgetPane.tsx");
  const picker = readSrc("builder/WidgetPicker.tsx");
  const shell = readSrc("builder/BuilderShell.tsx");
  const inspector = readSrc("builder/Inspector.tsx");

  test("the 'how many?' control is gone from all three places it lived", () => {
    // THREE, and the third was found by DRIVING the builder rather than by
    // reading it: the pane and the picker asked BEFORE the insert, and the
    // INSPECTOR asked again afterwards, as a row of numbered buttons. A
    // deletion that misses one of three homes is not a deletion.
    assert.doesNotMatch(inspector, /def\?\.count &&/, "inspector: still asks how many");
    assert.doesNotMatch(inspector, /function countOf/, "inspector: the counter is still there");
    assert.doesNotMatch(inspector, /onSetCount/, "inspector: the handler is still wired");
    assert.doesNotMatch(shell, /const setCount = useCallback/, "shell: setCount survived");
    for (const [name, src] of [["pane", pane], ["picker", picker]]) {
      assert.doesNotMatch(src, /setAsking/, `${name}: the question's state is still there`);
      assert.doesNotMatch(src, /count\.label/, `${name}: the question is still asked`);
    }
    // The shell still READS `def.count.default` — that is now "how many blank
    // rows it starts with", which is a default and not a control. What is gone
    // is the clamp round an answer nobody is asked for any more.
    assert.doesNotMatch(shell, /Math\.max\(def\.count\.min/);
    assert.match(shell, /const n = def\.count\.default/);
  });

  test("the count is no longer threaded through the pick handlers", () => {
    assert.match(picker, /onPick: \(widget: WidgetDef\) => void/);
    assert.doesNotMatch(picker, /onPick\(w, /);
  });
});
