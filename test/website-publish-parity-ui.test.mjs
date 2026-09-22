// test/website-publish-parity-ui.test.mjs — what the browser SENDS.
//
// A read-only scorer measured our website builder against real Elementor on
// 2026-09-22 and found 52 controls that did something on our canvas and
// nothing on the published page. Two of its four causes are on this side, and
// both are the same shape: the author's choice never left the browser.
//
//   W-3  The structure picker hands `(layout, preset)` — one column, 50/50,
//        33/33/33, 25/25/25/25 — to `onAddBlank`, and the website adapter's
//        took only the index. Every section it added was built by the server as
//        ONE column at 100% however many the author picked; the canvas itself
//        only ever drew one `[data-col]`.
//
//   W-4  `SectionStyle` was three keys — background, padding, headingFont — and
//        those three were all `contentFieldsOf` ever sent. The Container panel
//        offers Width, Background, Text colour, Edge width / style / colour,
//        Rounded corners, Shadow, Min Height, Typography, Margin and Padding.
//        Every one of them was changed, the canvas changed with them, and the
//        published container came back byte for byte its defaults.
//
// MUTATION CHECKS (each applied, seen red, restored — 2026-09-22):
//   · have `boxOf` always return undefined       → "the whole box is sent" red
//   · have `boxOf` always return the style       → "only when it changed" red
//   · drop `layout`/`preset` from `onAddBlank`   → "the picker is passed on" red
//   · drop `columnWidths` from `structureFor`    → "the cells' widths" red
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  toDocument, contentFieldsOf, boxOf, fieldsOf, BOX0_PROP, STYLE0_PROP, NODE_PROP,
} from "../src/builder/adapters/website/siteModel";

const SRC = (rel) => fs.readFileSync(path.resolve("src/builder", rel), "utf8");

/** One free section as arion-api sends it, with a box on it. */
const BOX = {
  minHeight: 420, contentWidth: "boxed", width: 700,
  margin: { top: 40, right: 40, bottom: 40, left: 40 },
  padding: { top: 40, right: 40, bottom: 40, left: 40 },
  background: "#EAF4EF",
  border: { style: "dashed", width: 2, color: "#0B6E4F" },
  radius: 14, shadow: "strong",
  direction: "row", gap: 18, justify: "between", alignItems: "center", wrap: true,
};

const SECTION = (box) => ({
  index: 0, handle: "ia:content:scratch:x", kind: "content",
  editable: true, reason: null, label: "Words and pictures",
  fields: { layout: 1, blocks: [], style: { background: "", padding: null, headingFont: "" }, box: box ?? null },
  node: { id: "s1", elType: "container", settings: { _title: "ia:content:scratch:x" }, elements: [] },
});

/* ══════════════════════════════════════════════════════════════════════════
   W-4 · THE WHOLE CONTAINER PANEL
   ══════════════════════════════════════════════════════════════════════════ */

describe("W-4 · the section's own box leaves the browser", () => {
  test("it arrives on the section, and on the snapshot beside it", () => {
    const doc = toDocument([SECTION(BOX)]);
    assert.deepEqual(doc.sections[0].style, BOX, "the panel opens on what is on the page");
    assert.deepEqual(doc.sections[0].meta[BOX0_PROP], BOX, "and on what it arrived as");
    assert.ok(doc.sections[0].meta[NODE_PROP], "the Elementor node still rides with it");
    assert.ok(doc.sections[0].meta[STYLE0_PROP], "and so does the older three-key snapshot");
  });

  test("NOTHING CHANGED, NOTHING SENT", () => {
    // Not an optimisation: a box read off a client's own page and written
    // straight back must be byte for byte what it was, and re-emitting a style
    // nobody touched would normalise their keys.
    const doc = toDocument([SECTION(BOX)]);
    assert.equal(boxOf(doc.sections[0]), undefined);
    assert.ok(!("box" in contentFieldsOf(doc.sections[0])));
  });

  test("EVERY key goes when the author changes ONE", () => {
    const doc = toDocument([SECTION(BOX)]);
    doc.sections[0].style = { ...BOX, minHeight: 600 };
    const sent = contentFieldsOf(doc.sections[0]).box;
    assert.equal(sent.minHeight, 600);
    // The whole panel, not a diff: arion writes the box through one pair of
    // functions and a partial box would clear what it did not mention.
    for (const key of Object.keys(BOX)) assert.ok(key in sent, `${key} was left behind`);
  });

  test("a section that never had a box can grow one", () => {
    const doc = toDocument([SECTION(null)]);
    assert.equal(boxOf(doc.sections[0]), undefined);
    doc.sections[0].style = { background: "#fff" };
    assert.deepEqual(boxOf(doc.sections[0]), { background: "#fff" });
  });

  test("clearing the box sends an EMPTY box, not nothing", () => {
    // "Nothing" would read as "no change" and leave the old look on the page.
    const doc = toDocument([SECTION(BOX)]);
    doc.sections[0].style = undefined;
    assert.deepEqual(boxOf(doc.sections[0]), {});
  });

  test("an archetype section sends it too — a hero is a box like any other", () => {
    const hero = {
      index: 0, handle: "ia:hero:scratch:x", kind: "hero", editable: true, reason: null,
      label: "Hero", fields: { headline: "Hi", box: BOX }, node: { id: "h1", elType: "container", settings: {}, elements: [] },
    };
    const doc = toDocument([hero]);
    doc.sections[0].style = { ...BOX, radius: 2 };
    assert.equal(fieldsOf(doc.sections[0]).box.radius, 2);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   W-3 · THE STRUCTURE PICKER
   ══════════════════════════════════════════════════════════════════════════ */

describe("W-3 · the structure the author picked reaches the server", () => {
  const shell = SRC("BuilderShell.tsx");
  const site = SRC("adapters/website/WebsiteBuilder.tsx");

  test("the shell hands the adapter the layout and the preset, not just the index", () => {
    assert.match(shell,
      /onAddBlank\?: \(atIndex: number, layout: SectionLayout, preset: StructurePreset\) => boolean;/);
    assert.match(shell, /p\.onAddBlank\(at, layout, preset\)/);
    // A DROP on the add area is one column — the author dropped a thing, they
    // did not pick a structure — and the adapter is told so rather than left
    // to guess.
    assert.match(shell, /p\.onAddBlank\(at, "flex", STRUCTURE_PRESETS\[0\]\)/);
  });

  test("the website adapter takes both and builds the cells", () => {
    assert.match(site, /onAddBlank=\{\(at: number, layout: SectionLayout, preset: StructurePreset\)/);
    assert.match(site, /addFromServer\("content", at, undefined, undefined, \{ layout, preset \}\)/);
    assert.match(site, /const structureFor = useCallback/);
    // The same shape `BuilderShell.addStructure` builds for every other
    // builder: a row container holding one container per cell, with the cells'
    // widths on the row's desktop layer.
    assert.match(site, /columnWidths: preset\.cells\.map\(\(n\) => n \/ 100\)/);
    assert.match(site, /cells = many \? preset\.cells\.map\(\(\) => makeContainer\(\)\) : \[\]/);
  });

  test("it is put onto the section the SERVER built, so the node survives", () => {
    // A website section has to carry the Elementor node arion-api built for
    // it; `toPayload` drops a section with none rather than inventing one.
    assert.match(site, /columns: section\.columns\.map\(\(c, i\) => \(i === 0 \? \{ \.\.\.c, widgets: \[box\] \} : c\)\)/);
  });
});
