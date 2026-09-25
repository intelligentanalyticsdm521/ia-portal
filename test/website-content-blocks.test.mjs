// test/website-content-blocks.test.mjs — a content block is a NODE.
//
// B-168, 2026-09-19. The website adapter flattened every widget in a column to
// `{ kind, col, ...props }`. That was right while a "Words and pictures"
// section could only hold nine atoms. It now holds whatever the panel offers,
// including a BOX — and a box keeps its children in `children` and its
// arranging in `style`, neither of which `...props` carries. A box dropped into
// a free section therefore reached arion-api empty.
//
// What this pins:
//   1. EVERY WIDGET THE PANEL OFFERS reaches the wire as its own kind — not
//      just the nine the old table knew.
//   2. A BOX SURVIVES, with its children and its layout, at depth.
//   3. THE ROUND TRIP, as EQUALITY: arion blocks → builder document → save
//      payload gives back the same blocks.
//   4. `__` PROPS ARE OURS AND NEVER SHIP — the Elementor node, the lock, the
//      adoption record; stripped by ONE rule, so a new one cannot leak.
//
// MUTATION CHECKS, written down so the next person can re-run them
// (each done, seen red, restored — 2026-09-19):
//   · have `blockFor` skip `__children`            → "a box survives" red
//   · have `blockFor` skip `__style`               → "a box keeps its layout" red
//   · have `blockFor` spread w.props whole         → "__ props never ship" red
//   · have `nodeForBlock` always makeWidget        → "reopened as a box" red
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  toDocument, toPayload, contentFieldsOf, sectionFromServer,
  BLOCK_CHILDREN_KEY, BLOCK_STYLE_KEY, NODE_PROP,
} from "../src/builder/adapters/website/siteModel";
import { CONTAINER_KIND, isContainer, makeContainer, makeWidget } from "../src/builder/model";

const contentNode = () => ({
  id: "cont001", elType: "container", isInner: false,
  settings: { _title: "ia:content:scratch:blk2", _ia_field_section: "content.blocks" },
  elements: [{
    id: "row1", elType: "container", isInner: true, settings: { _ia_row: 1 },
    elements: [{ id: "c0", elType: "container", isInner: true, settings: { _ia_col: 0 }, elements: [] }],
  }],
});

/* The ten the drive uses, from six families, plus one nested box. */
const BLOCKS = () => ([
  { kind: "heading", col: 0, text: "Summit Lawn & Landscape", level: "h2", align: "center" },
  { kind: "paragraph", col: 0, text: ["We mow, we plough, we show up."] },
  { kind: "image", col: 0, url: "https://x.invalid/lawn.jpg", alt: "A cut lawn", id: 12, caption: "" },
  { kind: "button", col: 0, label: "Get a quote", href: "/quote", align: "center" },
  { kind: "icon_box", col: 0, title: "Weekly mowing", description: "Every Tuesday.", icon: "leaf" },
  { kind: "accordion", col: 0, items: [{ title: "Do you salt?", content: "Every visit." }] },
  { kind: "counter", col: 0, ending_number: 240, suffix: "+", title: "Lawns cut" },
  { kind: "testimonial", col: 0, content: "Best crew in town.", name: "Dana R." },
  { kind: "blockquote", col: 0, quote: "Grass does not cut itself.", author: "Brandon" },
  { kind: "call_to_action", col: 0, title: "Book the spring clean-up", button: "Book now", link: "/book" },
  {
    kind: CONTAINER_KIND, col: 0,
    [BLOCK_STYLE_KEY]: { direction: "row", justify: "center", gap: 16 },
    [BLOCK_CHILDREN_KEY]: [
      { kind: "heading", text: "Inside the box", level: "h3", align: "left" },
      { kind: "alert", title: "Heads up", description: "We plough after two inches." },
    ],
  },
]);

const page = () => ([{
  index: 0, handle: "ia:content:scratch:blk2", kind: "content", editable: true, reason: null,
  label: "Words and pictures", node: contentNode(),
  fields: { layout: 1, blocks: BLOCKS(), style: { background: "", padding: 0, headingFont: "" } },
}]);

describe("a content block is a node", () => {
  test("every widget the panel offers reaches the wire as its OWN kind", () => {
    const [payload] = toPayload(toDocument(page()));
    assert.deepEqual(payload.fields.blocks.map((b) => b.kind), BLOCKS().map((b) => b.kind));
  });

  test("ROUND TRIP: arion blocks → document → payload, as equality", () => {
    const [payload] = toPayload(toDocument(page()));
    assert.deepEqual(payload.fields.blocks, BLOCKS());
    assert.equal(payload.fields.layout, 1);
    // A save that changed nothing writes no `style` at all (the no-op rule).
    assert.equal(payload.fields.style, undefined);
  });

  test("a box is REOPENED as a box, with what is inside it", () => {
    const section = sectionFromServer(page()[0]);
    const box = section.columns[0].widgets.find((w) => w.kind === CONTAINER_KIND);
    assert.ok(box, "the box came back as something else");
    assert.equal(isContainer(box), true);
    assert.deepEqual(box.children.map((c) => c.kind), ["heading", "alert"]);
    assert.deepEqual(box.style, { direction: "row", justify: "center", gap: 16 });
  });

  test("a box SURVIVES the save, with its children and its layout, at depth", () => {
    const inner = makeContainer({ direction: "column" }, [makeWidget("counter", { ending_number: 7 })]);
    const outer = makeContainer({ direction: "row" }, [makeWidget("heading", { text: "Top" }), inner]);
    const fields = contentFieldsOf({
      id: "s", layout: 1, width: "full", padding: 0, theme: "light", visibility: "customer",
      columns: [{ id: "c0", widgets: [outer] }],
    });
    const [block] = fields.blocks;
    assert.equal(block.kind, CONTAINER_KIND);
    assert.deepEqual(block[BLOCK_STYLE_KEY], { direction: "row" });
    assert.deepEqual(block[BLOCK_CHILDREN_KEY].map((b) => b.kind), ["heading", CONTAINER_KIND]);
    const deep = block[BLOCK_CHILDREN_KEY][1][BLOCK_CHILDREN_KEY][0];
    assert.equal(deep.kind, "counter");
    assert.equal(deep.ending_number, 7);
  });

  test("a box keeps its layout — the `style` key is reserved and cannot collide", () => {
    // `divider` really does have a control called `style`, so the box's own
    // look rides on `__style` and the widget's prop rides where it always did.
    const fields = contentFieldsOf({
      id: "s", layout: 1, width: "full", padding: 0, theme: "light", visibility: "customer",
      columns: [{ id: "c0", widgets: [makeWidget("divider", { style: "dotted", weight: 2 })] }],
    });
    assert.equal(fields.blocks[0].style, "dotted");
    assert.equal(fields.blocks[0][BLOCK_STYLE_KEY], undefined);
  });

  test("`__` props are OURS and never ship — one rule, not a list", () => {
    const fields = contentFieldsOf({
      id: "s", layout: 1, width: "full", padding: 0, theme: "light", visibility: "customer",
      columns: [{
        id: "c0",
        widgets: [makeWidget("heading", {
          text: "Real", [NODE_PROP]: { id: "x" }, __lock: { reason: "custom" }, __anythingNew: 1,
        })],
      }],
    });
    assert.deepEqual(fields.blocks[0], { kind: "heading", col: 0, text: "Real" });
  });
});
