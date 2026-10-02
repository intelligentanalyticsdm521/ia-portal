// test/website-foreign-pages.test.mjs — a client's OWN page, in our builder.
//
// Brandon, 2026-09-22, on Website → Pages: *"then I can't actually edit
// anything."* Every page on a client's real website is Elementor work done ON
// THE SITE. arion-api reads it into blocks now (`elementorReader.js`), and a
// section built on the website arrives as `kind: 'content'` — "Words and
// pictures", holding theirs — so the Portal needed no new section kind.
//
// What it DID need, and what this pins:
//
//   1. THE NODE ID SURVIVES THE ROUND TRIP. Every block carries `__id`: which
//      Elementor node it was read from. arion matches a block to its node by
//      that id, reads the node again, and hands the ORIGINAL back when the two
//      still say the same thing. Drop the key on the way through and every
//      publish rewrites the whole of somebody's page.
//   2. A WIDGET WE HAVE NO ROW FOR is drawn as a placeholder that says what it
//      is and where to change it — never blank, never silently dropped — and
//      it goes back out carrying its `__widgetType` and its `__id`.
//   3. A BOX read off their page keeps its `__id` and which element it was.
//   4. Every other `__` prop is still ours and still never ships.
//
// MUTATION CHECKS (each applied, seen red, restored — 2026-09-22):
//   · have `blockFor` stop naming `__id`        → "the node id survives" red
//   · have `nodeForBlock` drop a box's `__id`   → "a box keeps its id" red
//   · delete the `opaque` renderer              → "never blank" red
//   · give `opaque` a control in the registry   → "nothing on it is editable" red
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  toDocument, toPayload, contentFieldsOf,
  BLOCK_CHILDREN_KEY, BLOCK_ID_KEY, BLOCK_EL_KEY, OPAQUE_TYPE_KEY, OPAQUE_KIND,
  NODE_PROP,
} from "../src/builder/adapters/website/siteModel";
import { renderSiteWidget } from "../src/builder/adapters/website/siteRender";
import { makeContext } from "../src/builder/render";
import { WIDGETS_BY_KIND } from "../src/builder/registry";

/** One section as arion-api's reader sends it: their page, read into blocks. */
const THEIR_SECTION = () => ({
  index: 0,
  handle: "Awards strip (built in Elementor)",
  kind: "content",
  blueprintId: null,
  blockId: null,
  editable: true,
  reason: null,
  foreign: true,
  label: "Awards strip (built in Elementor)",
  fields: {
    layout: 1,
    style: { background: "", padding: null, headingFont: "" },
    blocks: [{
      kind: "container",
      [BLOCK_ID_KEY]: "hbcol1",
      [BLOCK_EL_KEY]: "column",
      [BLOCK_CHILDREN_KEY]: [
        { kind: "heading", [BLOCK_ID_KEY]: "hbw1", title: "County Build Awards 2025", header_size: "h3" },
        { kind: OPAQUE_KIND, [BLOCK_ID_KEY]: "hbw2", [OPAQUE_TYPE_KEY]: "woocommerce-product-add-to-cart" },
      ],
    }],
  },
  node: {
    id: "hbsec1", elType: "section", settings: { _title: "Awards strip (built in Elementor)" },
    elements: [{
      id: "hbcol1", elType: "column", settings: { _column_size: 100 },
      elements: [
        { id: "hbw1", elType: "widget", widgetType: "heading", settings: { title: "County Build Awards 2025", header_size: "h3" } },
        { id: "hbw2", elType: "widget", widgetType: "woocommerce-product-add-to-cart", settings: { product_id: "9" } },
      ],
    }],
  },
});

/* ══════════════════════════════════════════════════════════════════════════
   1. THE NODE ID SURVIVES
   ══════════════════════════════════════════════════════════════════════════ */

describe("a section built on the client's own website", () => {
  test("opens as an ordinary editable section, not as a locked lump", () => {
    const doc = toDocument([THEIR_SECTION()]);
    assert.equal(doc.sections.length, 1);
    const widgets = doc.sections[0].columns[0].widgets;
    assert.equal(widgets.length, 1);
    assert.equal(widgets[0].kind, "container");
    assert.equal((widgets[0].children || []).length, 2);
    assert.equal(widgets[0].children[0].kind, "heading");
    assert.equal(widgets[0].children[0].props.title, "County Build Awards 2025");
  });

  test("THE NODE ID SURVIVES the round trip, on every block", () => {
    const doc = toDocument([THEIR_SECTION()]);
    const [payload] = toPayload(doc);
    const box = payload.fields.blocks[0];
    assert.equal(box[BLOCK_ID_KEY], "hbcol1", "the box lost the node it came from");
    assert.equal(box[BLOCK_EL_KEY], "column", "and which element it was");
    assert.equal(box[BLOCK_CHILDREN_KEY][0][BLOCK_ID_KEY], "hbw1");
    assert.equal(box[BLOCK_CHILDREN_KEY][1][BLOCK_ID_KEY], "hbw2");
  });

  test("EQUALITY: nothing the reader sent comes back different", () => {
    const before = THEIR_SECTION();
    const [payload] = toPayload(toDocument([before]));
    // `col` is added on the way out — which column of the builder's section a
    // block sits in. A section read off their page is one column, and arion's
    // foreign write ignores it; everything else is the same block.
    const withoutCol = (b) => {
      const { col: _c, [BLOCK_CHILDREN_KEY]: kids, ...rest } = b;
      return kids ? { ...rest, [BLOCK_CHILDREN_KEY]: kids.map(withoutCol) } : rest;
    };
    assert.deepEqual(payload.fields.blocks.map(withoutCol), before.fields.blocks.map(withoutCol));
    assert.deepEqual(payload.node, before.node, "their Elementor node rides back untouched");
  });

  test("editing one heading changes that block and leaves the ids alone", () => {
    const doc = toDocument([THEIR_SECTION()]);
    const box = doc.sections[0].columns[0].widgets[0];
    box.children[0].props.title = "Renamed";
    const [payload] = toPayload(doc);
    const kids = payload.fields.blocks[0][BLOCK_CHILDREN_KEY];
    assert.equal(kids[0].title, "Renamed");
    assert.equal(kids[0][BLOCK_ID_KEY], "hbw1", "so arion can still find the node to patch");
    assert.deepEqual(kids[1], {
      kind: OPAQUE_KIND, [BLOCK_ID_KEY]: "hbw2", [OPAQUE_TYPE_KEY]: "woocommerce-product-add-to-cart",
    });
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2. THE WIDGET WE CANNOT NAME
   ══════════════════════════════════════════════════════════════════════════ */

describe("a widget on their page that we have no row for", () => {
  const opaqueWidget = () => {
    const doc = toDocument([THEIR_SECTION()]);
    return doc.sections[0].columns[0].widgets[0].children[1];
  };

  test("is a real widget on the canvas, carrying what it is", () => {
    const w = opaqueWidget();
    assert.equal(w.kind, OPAQUE_KIND);
    assert.equal(w.props[OPAQUE_TYPE_KEY], "woocommerce-product-add-to-cart");
    assert.equal(w.props[BLOCK_ID_KEY], "hbw2");
  });

  test("DRAWS A PLACEHOLDER that says what it is and where to change it — never blank", () => {
    const doc = toDocument([THEIR_SECTION()]);
    const ctx = makeContext(doc, { mode: "edit", accent: "#1E4E57" });
    const html = renderSiteWidget(opaqueWidget(), ctx);
    assert.match(html, /sw-locked/);
    assert.match(html, /Built with woocommerce-product-add-to-cart/);
    assert.match(html, /edit it in WordPress/);
    // And nothing on it is typeable.
    assert.doesNotMatch(html, /data-edit=/);
  });

  test("nothing on it is editable, because we could not read it", () => {
    const row = WIDGETS_BY_KIND[OPAQUE_KIND];
    assert.ok(row, "the opaque widget is not registered");
    assert.deepEqual(row.controls, [], "a control here would be a setting for something we cannot read");
    assert.equal(row.hidden, true, "nobody adds one — a page already has it");
    assert.deepEqual(row.adapters, ["website"]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   3. WHAT IS OURS STILL NEVER SHIPS
   ══════════════════════════════════════════════════════════════════════════ */

describe("our own props", () => {
  test("the Elementor node and the lock are stripped; the structural three are not", () => {
    const entry = THEIR_SECTION();
    entry.fields.blocks[0][BLOCK_CHILDREN_KEY][0].__lock = { label: "nope" };
    entry.fields.blocks[0][BLOCK_CHILDREN_KEY][0][NODE_PROP] = { id: "nope" };
    const [payload] = toPayload(toDocument([entry]));
    const heading = payload.fields.blocks[0][BLOCK_CHILDREN_KEY][0];
    assert.ok(!("__lock" in heading));
    assert.ok(!(NODE_PROP in heading));
    assert.equal(heading[BLOCK_ID_KEY], "hbw1", "the one `__` key a save cannot do without");
  });

  test("ADOPTION IS DELETED from the Portal too", () => {
    const root = path.resolve("src");
    const hits = [];
    const sweep = (dir) => {
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        if (fs.statSync(full).isDirectory()) { sweep(full); continue; }
        if (!/\.(ts|tsx)$/.test(name)) continue;
        const live = fs.readFileSync(full, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
        if (/adoptSection|AdoptSectionSheet|AdoptReviewList|onUndoAdoption|adoptable|adoptPreview|__adoption/.test(live)) {
          hits.push(path.relative(root, full));
        }
      }
    };
    sweep(root);
    assert.deepEqual(hits, [], `adoption is still live in: ${hits.join(", ")}`);
    assert.equal(fs.existsSync(path.resolve("src/arion/components/AdoptSectionSheet.tsx")), false);
  });
});
