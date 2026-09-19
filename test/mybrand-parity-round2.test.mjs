/**
 * test/mybrand-parity-round2.test.mjs — the eight defects the rebuild found,
 * and the five capabilities the reference designs need.
 *
 * BUILDER_MYBRAND_PARITY_2026-09-19 scored the ten reference designs 80.3 by
 * remaking every one of them through the studio's own controls. This file is
 * the round that answers it. Every test below names the defect it closes and
 * the picture it was found in, EXECUTES the real function rather than reading
 * the source for a promise, and — where the thing being checked is a number
 * that could rot — carries a MUTATION: the old, wrong version of the same
 * function, asserted to fail the very check that passes for the new one.
 *
 * WHY THE MUTATIONS ARE IN THE FILE AND NOT IN A SCRIPT
 * A green check proves nothing until it has been made to fail on purpose
 * (feedback_mutation_test_your_guards). A mutation kept beside the assertion
 * is one somebody reads while they are editing the assertion; a mutation in a
 * separate run is one nobody runs. Each `mutant` below is LITERALLY round 1's
 * code, so the file is also the record of what was wrong.
 *
 * WHAT IS NOT HERE
 * Nothing that needs a DOM. Fabric's own painting, the canvas's drag handles
 * and the browser's fetch are exercised by the click-through, not here; what
 * is here is everything both halves have to agree about, which is where the
 * two halves drift.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

import {
  ADVANCE_TABLES, BOLD_ADVANCE_FACTOR, advanceEm, curvedGlyphs, curvedTextSvg,
  dashArray, dashLineCap, fontFaceStyle, hasMetrics, meanAdvanceEm, GLYPH_EM,
} from "../src/builder/adapters/mybrand/textEffects.ts";
import {
  ICON_PATHS, addPage, chartToSvg, docForPage, duplicatePage, emptyPictureSlots,
  emptySlotMessage, formatChartValue, iconStrokeScale, iconToSvg, isValidMask,
  movePage, pageAt, pageCount, patternDef, removePage, setPage, shapeFill,
  shapeToSvg, textFit, textFitWarning, textLayerSvg, MAX_PAGES,
} from "../src/builder/adapters/mybrand/scene.ts";
import { insertWidget, photoGridLayout } from "../src/builder/adapters/mybrand/insert.ts";
import { buildImagePdfPages } from "../src/builder/adapters/mybrand/pdf.ts";
import { nearestWeightFile, embeddableFamilies, isEmbeddable } from "../src/builder/adapters/mybrand/fontEmbed.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STUDIO = (name) =>
  readFileSync(path.join(HERE, "..", "src", "builder", "adapters", "mybrand", name), "utf8");
/** The LUMEN half, read as TEXT — the two repos are asserted to hold the same digits. */
const LUMEN = (rel) => readFileSync(path.join(HERE, "..", "..", "LUMEN-API-septa-mbcanva", rel), "utf8");

const BRAND = {
  colours: { primary: "#0F766E", secondary: "#B45309", accent: "#F59E0B", text: "#0F172A", background: "#FFFFFF" },
  fonts: { heading: "Bebas Neue, Impact, sans-serif", body: "Poppins, Inter, sans-serif" },
  logoUrl: null,
  businessName: "A Business",
  websiteUrl: null,
};
const CANVAS = { version: 1, width: 1080, height: 1080, background_color: "#FFFFFF", layers: [] };

/* ══════════════════════════════════════════════════════════════════════════
   D-1 · A curved line's glyphs collided, and the word space vanished
   ══════════════════════════════════════════════════════════════════════════ */

describe("D-1 · curved text is packed with the face's REAL advances", () => {
  /** Round 1's packer, kept verbatim as the mutation. */
  const mutantWidths = (chars, size, narrow) => {
    const base = narrow ? 0.44 : 0.58;
    return chars.map((c) => (GLYPH_EM[c] ?? base) * size * (narrow ? 0.85 : 1));
  };

  test("the advances are the font file's own, not a guess", () => {
    // Read out of BebasNeue-Regular.ttf's hmtx table, 2026-09-19.
    assert.equal(advanceEm("Bebas Neue", "M"), 0.538);
    assert.equal(advanceEm("Bebas Neue", " "), 0.16);
    assert.equal(advanceEm("Poppins", "M"), 0.861);
    assert.equal(advanceEm("Lora", "l"), 0.272);
    // A face we do not carry falls back to the industry mean, and SAYS it does.
    assert.equal(hasMetrics("Bebas Neue"), true);
    assert.equal(hasMetrics("Comic Sans MS"), false);
    assert.equal(advanceEm("Comic Sans MS", "M"), 0.5);
  });

  test("bold is measured too, from the one family we carry in both weights", () => {
    assert.equal(BOLD_ADVANCE_FACTOR, 1.0897);
    const regular = advanceEm("Poppins", "H", false);
    const bold = advanceEm("Poppins", "H", true);
    assert.ok(bold > regular, "bold packed no wider than regular");
    assert.equal(Number((bold / regular).toFixed(4)), BOLD_ADVANCE_FACTOR);
  });

  test("NO TWO GLYPHS OVERLAP, which is the whole of the defect", () => {
    // `06-logo-transparent` scored 60 because "BLUE HERON" at Bebas Neue 72
    // came out as one run of overlapping letters.
    const glyphs = curvedGlyphs({
      text: "BLUE HERON", cx: 300, y: 200, span: 520, bulge: 72, size: 72,
      family: "Bebas Neue",
    });
    const printed = glyphs.filter((g) => g.ch.trim() !== "");
    assert.equal(glyphs.length, 10);
    for (let i = 1; i < printed.length; i++) {
      const gap = Math.hypot(printed[i].x - printed[i - 1].x, printed[i].y - printed[i - 1].y);
      // Two neighbours must sit at least the NARROWER of their two advances
      // apart, or their ink is on top of each other.
      const needed = Math.min(
        advanceEm("Bebas Neue", printed[i].ch),
        advanceEm("Bebas Neue", printed[i - 1].ch),
      ) * 72 * 0.9;
      assert.ok(gap >= needed,
        `"${printed[i - 1].ch}" and "${printed[i].ch}" are ${gap.toFixed(1)}px apart, need ${needed.toFixed(1)}`);
    }
  });

  test("THE WORD SPACE SURVIVES — the two words are further apart than two letters", () => {
    const glyphs = curvedGlyphs({
      text: "BLUE HERON", cx: 300, y: 200, span: 520, bulge: 72, size: 72,
      family: "Bebas Neue",
    });
    const at = (ch) => glyphs.findIndex((g) => g.ch === ch);
    const spaceAt = glyphs.findIndex((g) => g.ch === " ");
    assert.ok(spaceAt > 0, "the space was dropped from the list, which closes the gap");
    const across = Math.hypot(glyphs[spaceAt + 1].x - glyphs[spaceAt - 1].x,
      glyphs[spaceAt + 1].y - glyphs[spaceAt - 1].y);
    const within = Math.hypot(glyphs[at("B") + 1].x - glyphs[at("B")].x,
      glyphs[at("B") + 1].y - glyphs[at("B")].y);
    assert.ok(across > within * 1.3,
      `the gap between words (${across.toFixed(1)}) is no bigger than the gap between letters (${within.toFixed(1)})`);
  });

  test("MUTATION — packed in one face and drawn in another, the letters collide", () => {
    // WHY "BLUE HERON" ACTUALLY COLLIDED, which is worth writing down because
    // D-1 and D-2 turn out to be one bug seen from two ends.
    //
    // The packer used a flat 0.374 em for a condensed face. The PAINTER could
    // not reach Bebas Neue at all (D-2) and fell through to a system serif,
    // whose glyphs advance about half as much again. So every letter was
    // PLACED as if it were narrow and DRAWN wide, and the ink overlapped.
    //
    // The mutation reproduces exactly that: Bebas spacing, serif ink. Lora is
    // the serif we can measure, and it stands in for the fallback.
    const chars = [..."BLUEHERON"];
    const size = 72;
    const packedPitch = chars.map((c) => advanceEm("Bebas Neue", c) * size);
    const drawnWidth = chars.map((c) => advanceEm("Lora", c) * size);
    let collisions = 0;
    for (let i = 0; i < chars.length; i++) {
      if (drawnWidth[i] > packedPitch[i]) collisions++;
    }
    assert.ok(collisions >= chars.length - 1,
      `only ${collisions} of ${chars.length} glyphs overflowed their slot — the mutation has been edited`);

    // And when the two agree, as they now do, nothing overflows.
    let clean = 0;
    for (let i = 0; i < chars.length; i++) {
      if (advanceEm("Bebas Neue", chars[i]) * size > packedPitch[i] + 1e-9) clean++;
    }
    assert.equal(clean, 0, "a glyph overflows its own slot in its own face");
  });

  test("MUTATION — the old guess mis-measures the face it claimed to know", () => {
    const chars = [..."BLUE HERON"];
    const guessed = mutantWidths(chars, 72, true);
    const measured = chars.map((c) => advanceEm("Bebas Neue", c) * 72);
    // The totals came out within one per cent of each other, which is why the
    // fault was invisible in a line's overall width — and the PER-GLYPH error
    // is where the letters came apart. The word space is the worst of them:
    // guessed 70% wider than Bebas Neue's real one.
    const spaceAt = chars.indexOf(" ");
    assert.ok(guessed[spaceAt] > measured[spaceAt] * 1.5,
      `the guessed word space (${guessed[spaceAt].toFixed(1)}) is no longer far off the real one (${measured[spaceAt].toFixed(1)})`);
    const worst = Math.max(...chars.map((_, i) => Math.abs(guessed[i] - measured[i]) / measured[i]));
    assert.ok(worst > 0.5, `the guess's worst per-glyph error is only ${(worst * 100).toFixed(0)}%`);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   D-2 · Echo, Splice, Neon and Curve drew in the wrong typeface
   ══════════════════════════════════════════════════════════════════════════ */

describe("D-2 · the picture carries the face, because an <img> SVG cannot fetch one", () => {
  const CURVED = {
    id: "t1", kind: "text", x: 0, y: 0, w: 600, h: 200,
    content: "BLUE HERON", size: 72, curve: 72,
    font: "Bebas Neue, Impact, sans-serif", weight: "400", color: "#B87333",
  };
  const ECHOED = { ...CURVED, id: "t2", curve: 0, effect: "echo" };

  test("a curved line asks for the chosen family by name", () => {
    const out = textLayerSvg(CURVED);
    assert.ok(out, "a curved line did not produce a picture at all");
    assert.ok(out.svg.includes('font-family="Bebas Neue"'), out.svg.slice(0, 200));
  });

  test("with the face's bytes in hand, the picture EMBEDS it", () => {
    const face = fontFaceStyle("Bebas Neue", "data:font/woff2;base64,AAAA", "400");
    assert.ok(face.includes("@font-face"));
    assert.ok(face.includes('font-family:"Bebas Neue"'));
    for (const layer of [CURVED, ECHOED]) {
      const out = textLayerSvg(layer, face);
      assert.ok(out.svg.includes("<style>@font-face"), `${layer.effect || "curve"} did not embed the face`);
      assert.ok(out.svg.includes("data:font/woff2;base64,AAAA"));
      // Inside <defs>, where a style element is legal in a standalone SVG.
      assert.ok(/<defs><style>@font-face/.test(out.svg), "the @font-face is not in <defs>");
    }
  });

  test("MUTATION — without the bytes the picture is exactly round 1's: a name and no face", () => {
    const withOut = textLayerSvg(CURVED);
    assert.ok(!withOut.svg.includes("@font-face"),
      "a picture built with no font bytes claims to carry a face");
    // ...which is the state that fell through to a system serif. The fix is
    // not "ask for the family harder" — it already did that — it is the bytes.
    assert.ok(withOut.svg.includes('font-family="Bebas Neue"'));
  });

  test("no empty @font-face is ever written", () => {
    assert.equal(fontFaceStyle("Bebas Neue", ""), "");
    assert.equal(fontFaceStyle("", "data:font/woff2;base64,AA"), "");
    assert.equal(fontFaceStyle(null, null), "");
    // An empty block would be a lie in the picture AND a parse error in some
    // readers, so it is "" and the caller's `if` does the rest.
    assert.ok(!textLayerSvg(CURVED, "").svg.includes("<style>"));
  });

  test("every family the packer measures is a family the browser can embed", () => {
    // Otherwise a curve would be PACKED as Bebas and DRAWN as something else,
    // which is the same defect with the two halves swapped.
    for (const family of Object.keys(ADVANCE_TABLES)) {
      assert.ok(isEmbeddable(family), `${family} has metrics but no font file to embed`);
      assert.ok(nearestWeightFile(family, 400), `${family} has no 400 file`);
    }
    assert.deepEqual(embeddableFamilies().sort(), Object.keys(ADVANCE_TABLES).sort());
  });

  test("a weight we do not carry falls back to the nearest one we do", () => {
    // Bebas Neue is a display face with ONE cut; asking for bold must not
    // produce a broken URL.
    assert.equal(nearestWeightFile("Bebas Neue", 700).weight, 400);
    assert.equal(nearestWeightFile("Poppins", 700).weight, 700);
    assert.equal(nearestWeightFile("Poppins", 500).weight, 400);
    assert.equal(nearestWeightFile("Montserrat", 600).weight, 700);
    assert.equal(nearestWeightFile("Nothing At All", 400), null);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   D-4 · dotted and dashed did nothing on a LINE
   ══════════════════════════════════════════════════════════════════════════ */

describe("D-4 · a dotted rule is dots, because one width answers both questions", () => {
  test("the dot pattern leaves a clear gap at the width it is drawn", () => {
    // A round cap paints a circle one stroke-width across; the ink is w and
    // the pitch is w*2.51, so there is a gap of about 1.5w between dots.
    const [on, off] = dashArray("dotted", 4);
    assert.equal(on, 0.04);
    assert.equal(off, 10);
    const pitch = on + off;
    const inkWidth = 4;
    assert.ok(pitch - inkWidth > inkWidth, `dots pitched ${pitch} apart are ${inkWidth} wide — they touch`);
    assert.equal(dashLineCap("dotted"), "round");
  });

  test("MUTATION — round 1's numbers make the dots touch at any width", () => {
    const mutant = (w) => [0, w * 2];          // exactly what the file said
    for (const w of [1, 2, 3, 6]) {
      const [on, off] = mutant(w);
      const pitch = on + off;
      assert.ok(pitch - w <= w,
        `the mutation stopped producing touching dots at width ${w} — it has been edited`);
    }
  });

  test("THE REAL CAUSE: the drawn width and the measured width are ONE number", () => {
    // Round 1 drew a line at `strokeWidth || 2` and measured its dashes at
    // `strokeWidth || 1`. A rule with no width set therefore got dots sized
    // for a 1px line and painted 2px wide, and touched.
    const bridge = STUDIO("fabricBridge.ts");
    const lineBranch = bridge.slice(bridge.indexOf('if (s.shape === "line")'));
    assert.ok(/const lineW = strokeWidth \|\| 2;/.test(lineBranch), "the line's one width is gone");
    assert.ok(/dashArray\(s\.dash, lineW\)/.test(lineBranch), "the dash is measured off something else again");
    assert.ok(!/dashArray\(s\.dash, strokeWidth \|\| 1\)/.test(lineBranch));
    // And LUMEN says the same number, so the download matches the screen.
    const lumen = LUMEN("src/lib/myBrand/templateStudio.js");
    const serverLine = lumen.slice(lumen.indexOf('if (layer.shape === "line")'));
    assert.ok(/const lineW = strokeWidth \|\| 2;/.test(serverLine), "the server still has its own idea of a line's width");
    assert.ok(/dashAttrs\(layer\.dash, lineW\)/.test(serverLine));
  });

  test("a line keeps its rotation and its hiding, which it did not before", () => {
    const bridge = STUDIO("fabricBridge.ts");
    const lineBranch = bridge.slice(bridge.indexOf('if (s.shape === "line")'));
    assert.ok(/\.\.\.lineProps/.test(lineBranch), "the line branch takes no base properties");
    // ...but NOT left/top, which a Line works out from its own two points.
    assert.ok(/const \{ left: _l, top: _t, \.\.\.lineProps \} = baseProps;/.test(lineBranch));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   D-3 · an icon's gradient, stroke and empty fill all misbehaved
   ══════════════════════════════════════════════════════════════════════════ */

describe("D-3 · an icon fills, strokes and empties like every other shape", () => {
  const arch = {
    id: "ic1", kind: "shape", shape: "icon", icon: "arch",
    x: 0, y: 0, w: 700, h: 400, fill: "none", stroke: "#B87333", strokeWidth: 6,
  };

  test("AN EMPTY FILL IS EMPTY — design 02's arch hid its own label", () => {
    const svg = iconToSvg(arch);
    assert.ok(svg.includes('fill="none"'), svg.slice(0, 300));
    assert.ok(!svg.includes("#0F172A"), "an empty fill painted the fallback colour");
    // And the shared decision is one function, so a rect cannot disagree.
    assert.equal(shapeFill({ fill: "none" }, "x", []), "none");
    assert.equal(shapeFill({ fill: "#123456" }, "x", []), "#123456");
  });

  test("MUTATION — round 1's fallback repaints an emptied shape", () => {
    const mutant = (layer) => (layer.fill && layer.fill !== "none" ? layer.fill : "#0F172A");
    assert.equal(mutant(arch), "#0F172A");
    assert.notEqual(mutant(arch), shapeFill(arch, "x", []));
  });

  test("THE STROKE IS THE WIDTH THAT WAS ASKED FOR — 6 px, not 45", () => {
    const svg = iconToSvg(arch);
    const drawn = Number(/stroke-width="([\d.]+)"/.exec(svg)[1]);
    // The path lives in a 100x100 box stretched to 700x400, so the number in
    // the file has to be divided back out by that stretch. sqrt(7 * 4) = 5.29.
    assert.equal(Number(iconStrokeScale(700, 400).toFixed(4)), 5.2915);
    const painted = drawn * iconStrokeScale(700, 400);
    assert.ok(Math.abs(painted - 6) < 0.01, `a 6px outline paints at ${painted.toFixed(2)}px`);
  });

  test("MUTATION — round 1 painted the raw number and it came out ~32px", () => {
    const mutantPainted = 6 * iconStrokeScale(700, 400);
    assert.ok(mutantPainted > 6 * 4, `the old behaviour was ${mutantPainted.toFixed(1)}px for an asked-for 6`);
    // (The parity report measured ~45 on a 700-square arch; 700x400 is 31.7.)
  });

  test("a gradient reaches an icon, with an id nothing else can collide with", () => {
    const grad = { ...arch, gradient: { from: "#123456", to: "#abcdef", dir: "d1" } };
    const svg = iconToSvg(grad);
    assert.ok(svg.includes("<linearGradient"), "no gradient def was written");
    const id = /<linearGradient id="([^"]+)"/.exec(svg)[1];
    assert.ok(svg.includes(`fill="url(#${id})"`), "the gradient was defined and not used");
    assert.ok(id.includes("ic1"), `the gradient id ${id} does not carry the layer — two icons would collide`);
    const other = iconToSvg({ ...grad, id: "ic2" });
    assert.notEqual(/<linearGradient id="([^"]+)"/.exec(other)[1], id);
  });

  test("a dash on an icon is measured in the icon's own space", () => {
    const dotted = iconToSvg({ ...arch, dash: "dotted" });
    assert.ok(dotted.includes('stroke-linecap="round"'));
    const arr = /stroke-dasharray="([^"]+)"/.exec(dotted)[1].split(" ").map(Number);
    const scale = iconStrokeScale(700, 400);
    // Once scaled back out it is the same pattern a rectangle would get.
    assert.ok(Math.abs(arr[1] * scale - dashArray("dotted", 6)[1]) < 0.01);
  });

  test("an icon with NOTHING set draws nothing rather than a mystery blob", () => {
    const bare = iconToSvg({ id: "ic9", kind: "shape", shape: "icon", icon: "star", x: 0, y: 0, w: 100, h: 100, fill: "none" });
    assert.ok(bare.includes('fill="none"'));
    assert.ok(bare.includes('stroke="none"'));
    assert.ok(bare.includes('stroke-width="0"'));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   D-6 · the empty Picture slot exported as nothing, with no warning
   ══════════════════════════════════════════════════════════════════════════ */

describe("D-6 · a download refuses by name rather than dropping a slot", () => {
  const withSlot = {
    ...CANVAS,
    layers: [
      { id: "image-1", kind: "image", x: 120, y: 340, w: 400, h: 300, src: null },
      { id: "text-1", kind: "text", x: 0, y: 0, w: 400, h: 60, content: "Hello" },
    ],
  };

  test("an empty slot is found, and named where a person would point", () => {
    const slots = emptyPictureSlots(withSlot);
    assert.equal(slots.length, 1);
    assert.equal(slots[0].where, "the picture slot at 120 × 340");
    const message = emptySlotMessage(withSlot);
    assert.ok(message.includes("the picture slot at 120 × 340"), message);
    assert.ok(message.includes("downloads as nothing at all"), message);
  });

  test("a filled slot, a hidden slot and a blob-backed slot are all fine", () => {
    assert.equal(emptySlotMessage({ ...CANVAS, layers: [{ id: "i", kind: "image", x: 0, y: 0, w: 10, h: 10, src: "data:," }] }), null);
    assert.equal(emptySlotMessage({ ...CANVAS, layers: [{ id: "i", kind: "image", x: 0, y: 0, w: 10, h: 10, blob_ref: "b/1" }] }), null);
    // Hiding a layer is how an author says "not this one"; refusing over it
    // would be the tool arguing with them.
    assert.equal(emptySlotMessage({ ...CANVAS, layers: [{ id: "i", kind: "image", x: 0, y: 0, w: 10, h: 10, visible: false }] }), null);
    assert.equal(emptySlotMessage(CANVAS), null);
  });

  test("the logo slot is called the logo slot", () => {
    const doc = { ...CANVAS, layers: [{ id: "image-logo-7", kind: "image", x: 5, y: 5, w: 10, h: 10 }] };
    assert.equal(emptyPictureSlots(doc)[0].where, "the logo slot");
  });

  test("a slot on the BACK of a card is named with its side", () => {
    const two = {
      ...CANVAS,
      pages: [{ layers: [{ id: "image-2", kind: "image", x: 40, y: 50, w: 10, h: 10 }] }],
    };
    assert.ok(emptySlotMessage(two).includes("on page 2"), emptySlotMessage(two));
  });

  test("THE DOWNLOAD ACTUALLY ASKS — and both halves ask the same question", () => {
    const studio = STUDIO("StudioBuilder.tsx");
    const local = studio.slice(studio.indexOf("const exportLocal"));
    assert.ok(/const blocked = emptySlotMessage\(design\);/.test(local),
      "the download no longer checks for an empty slot");
    assert.ok(/if \(blocked\) throw new Error\(blocked\);/.test(local));
    // Checked against the WHOLE design, not the visible side.
    assert.ok(!/emptySlotMessage\(doc\)/.test(local));
    const lumen = LUMEN("src/lib/myBrand/templateStudio.js");
    assert.ok(lumen.includes("function assertNoEmptySlots"), "the server does not refuse");
    assert.ok(/if \(!opts\.allowEmptySlots\) assertNoEmptySlots\(canvas\);/.test(lumen),
      "the server's raster path does not call the refusal");
    assert.ok(lumen.includes("mybrand_empty_picture_slot"));
    // The SAME sentence, so one person reading two screens reads one message.
    const sentence = "An empty slot downloads as nothing at all, so add a picture or delete the slot, then try again.";
    assert.ok(emptySlotMessage(withSlot).endsWith(sentence));
    assert.ok(lumen.includes(sentence), "LUMEN words the refusal differently");
  });

  test("MUTATION — a check that only looked at page one misses the back of the card", () => {
    const mutant = (doc) => (doc.layers || []).filter((l) => l.kind === "image" && !l.src && l.visible !== false);
    const two = { ...CANVAS, pages: [{ layers: [{ id: "image-2", kind: "image", x: 1, y: 2, w: 3, h: 4 }] }] };
    assert.equal(mutant(two).length, 0, "the mutation has been edited — it now sees other pages");
    assert.equal(emptyPictureSlots(two).length, 1);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   D-5 · a tile that drops more than one layer arrives as a unit
   ══════════════════════════════════════════════════════════════════════════ */

describe("D-5 · Button and Social handle arrive grouped and selected as one", () => {
  for (const kind of ["button", "social_handle"]) {
    test(`${kind} drops its layers with ONE shared group tag`, () => {
      const out = insertWidget(kind, CANVAS, BRAND);
      assert.ok(out.layers.length > 1, `${kind} no longer drops more than one layer`);
      const tags = new Set(out.layers.map((l) => l.groupId));
      assert.equal(tags.size, 1, `${kind} dropped ${tags.size} groups`);
      assert.ok([...tags][0], `${kind} dropped layers with no group tag at all`);
      // The FIRST layer is selected — the pill, not the words on it.
      assert.equal(out.selectId, out.layers[0].id);
    });
  }

  test("a single-layer tile is NOT tagged — a group of one is a lie", () => {
    const heading = insertWidget("heading", CANVAS, BRAND);
    assert.equal(heading.layers.length, 1);
    assert.equal(heading.layers[0].groupId, undefined);
    assert.equal(heading.selectId, heading.layers[0].id);
  });

  test("two Buttons are two DIFFERENT groups", () => {
    const a = insertWidget("button", CANVAS, BRAND);
    const b = insertWidget("button", CANVAS, BRAND);
    assert.notEqual(a.layers[0].groupId, b.layers[0].groupId);
  });

  test("MUTATION — round 1 selected the LAST layer and tagged nothing", () => {
    const out = insertWidget("button", CANVAS, BRAND);
    const mutantSelect = out.layers[out.layers.length - 1].id;
    assert.notEqual(out.selectId, mutantSelect,
      "the fix selects the last layer again — dragging it leaves the pill behind");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   D-7 · Ctrl+I opens Structure even with the caret in a field
   ══════════════════════════════════════════════════════════════════════════ */

describe("D-7 · Ctrl+I is not swallowed by the typing guard", () => {
  test("the I branch has no typing guard, and the other shortcuts still do", () => {
    const studio = STUDIO("StudioBuilder.tsx");
    const key = studio.slice(studio.indexOf("function onKey("), studio.indexOf("window.addEventListener(\"keydown\""));
    const branch = key.slice(key.indexOf('e.key.toLowerCase() === "i"'));
    const body = branch.slice(0, branch.indexOf("return;") + 7);
    assert.ok(!/if \(typing\) return;/.test(body), "Ctrl+I is still swallowed while typing");
    assert.ok(/if \(typing && t\) t\.blur\(\);/.test(body), "the field is left holding the caret");
    // Undo, duplicate and delete DO still mean something else inside a field.
    for (const other of ['"z"', '"d"']) {
      const o = key.slice(key.indexOf(`e.key.toLowerCase() === ${other}`));
      assert.ok(/if \(typing/.test(o.slice(0, 160)), `Ctrl+${other} lost its typing guard`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   D-8 · a text box says on the canvas that the words do not fit
   ══════════════════════════════════════════════════════════════════════════ */

describe("D-8 · a box that is about to lose a line says so", () => {
  const headline = {
    id: "t", kind: "text", x: 0, y: 0, w: 900, h: 100,
    content: "Every season, one team you can call", size: 82, weight: "700",
    font: "Poppins, Inter, sans-serif", lineHeight: 1.1,
  };

  test("the words that wrap are reported, with the height they need", () => {
    const fit = textFit(headline);
    assert.ok(fit.wrapped, "a 35-character headline at 82px in a 900px box did not wrap");
    assert.ok(fit.lines >= 2);
    assert.ok(fit.neededH > fit.boxH, `${fit.neededH} fits inside ${fit.boxH}`);
    assert.equal(fit.overflows, true);
    const warning = textFitWarning(headline);
    assert.ok(warning.includes(String(fit.neededH)), warning);
    assert.ok(warning.includes("100"), warning);
  });

  test("a box that fits says nothing at all", () => {
    assert.equal(textFitWarning({ ...headline, w: 900, h: 400, size: 24 }), null);
    assert.equal(textFitWarning({ ...headline, content: "   " }), null);
  });

  test("ONE WORD TOO WIDE is reported apart — a taller box cannot save it", () => {
    const fit = textFit({ ...headline, content: "Unconscionable", w: 120, h: 900, size: 82 });
    assert.equal(fit.wordTooWide, true);
    assert.match(textFitWarning({ ...headline, content: "Unconscionable", w: 120, h: 900, size: 82 }),
      /A word is wider than this box/);
  });

  test("the warning wraps with the SAME function the export wraps with", () => {
    // Round 1 lost three lines to boxes a few pixels narrow, and two of them
    // only showed in the downloaded PNG. A warning that used its own wrap
    // would be a third opinion.
    const scene = STUDIO("scene.ts");
    const fn = scene.slice(scene.indexOf("export function textFit("));
    assert.ok(/wrapLines\(content, w, size, layer\.weight\)/.test(fn),
      "textFit measures with something other than wrapLines");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   G-06 · any shape as a frame, with a border
   ══════════════════════════════════════════════════════════════════════════ */

describe("G-06 · any shape is a frame, and a frame can have a border", () => {
  test("all forty-seven icons are masks now, and nonsense still is not", () => {
    assert.equal(isValidMask("circle"), true);
    assert.equal(isValidMask("rounded"), true);
    for (const key of ["hexagon", "shield", "seal", "wave", "arch", "blob1"]) {
      assert.ok(isValidMask(key), `${key} is not offered as a frame`);
    }
    assert.equal(Object.keys(ICON_PATHS).every(isValidMask), true);
    assert.equal(isValidMask("none"), false);
    assert.equal(isValidMask(undefined), false);
    assert.equal(isValidMask("../../etc/passwd"), false);
  });

  test("the server agrees, key for key", () => {
    const lumen = LUMEN("src/lib/myBrand/templateStudio.js");
    assert.ok(lumen.includes("function isMaskKey"), "the server still has a five-name mask list");
    assert.ok(/mask === "circle" \|\| mask === "rounded" \|\| Object\.prototype\.hasOwnProperty\.call\(ICON_PATHS, mask\)/.test(lumen));
    assert.ok(lumen.includes("function frameStrokeSvg"), "the server draws no frame border");
    assert.ok(lumen.includes("iconStrokeScale(Number(layer.w || 0), Number(layer.h || 0))"),
      "a path frame's border is not divided back out by its own stretch");
  });

  test("the editor draws the border on the MASK, not round the box", () => {
    const bridge = STUDIO("fabricBridge.ts");
    assert.ok(bridge.includes("function frameOutline"));
    const fn = bridge.slice(bridge.indexOf("function frameOutline"), bridge.indexOf("function groupWith"));
    assert.ok(/il\.mask === "circle"/.test(fn), "a circle frame's border is not a circle");
    assert.ok(/ICON_PATHS\[il\.mask\]/.test(fn), "an icon frame's border is not that icon");
    assert.ok(/width \/ Math\.sqrt\(\(il\.w \/ 100\) \* \(il\.h \/ 100\)\)/.test(fn),
      "a path border's width is not divided back out by its stretch");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   G-07 · photo grid gutter and corner radius
   ══════════════════════════════════════════════════════════════════════════ */

describe("G-07 · the photo grid has a gutter and rounded cells", () => {
  test("the gutter is the gap, exactly, between every pair of cells", () => {
    // Four cells lay out three across and two down — the rule the tile has
    // always used, and it is unchanged: only the gap is the author's now.
    const grid = photoGridLayout({ count: 4, x: 0, y: 0, width: 900, gutter: 30 });
    assert.equal(grid.cols, 3);
    assert.equal(grid.rows, 2);
    assert.equal(grid.cells[1].x - (grid.cells[0].x + grid.cells[0].w), 30);
    assert.equal(grid.cells[3].y - (grid.cells[0].y + grid.cells[0].h), 30);
    // The grid still fills the width it was given, whatever the gutter.
    assert.equal(grid.cells[2].x + grid.cells[2].w, 900);
  });

  test("a bigger gutter means smaller cells, not a wider grid", () => {
    const tight = photoGridLayout({ count: 6, x: 0, y: 0, width: 900, gutter: 0 });
    const loose = photoGridLayout({ count: 6, x: 0, y: 0, width: 900, gutter: 40 });
    assert.equal(tight.width, loose.width);
    assert.ok(loose.cells[0].w < tight.cells[0].w);
    assert.equal(tight.cells[1].x - tight.cells[0].x, tight.cells[0].w);
  });

  test("the tile passes both controls through to the layers", () => {
    const out = insertWidget("gallery", CANVAS, BRAND, { count: 4, gutter: 40, radius: 24 });
    assert.equal(out.layers.length, 4);
    for (const l of out.layers) assert.equal(l.radius, 24, "the cell corner radius did not arrive");
    assert.equal(out.layers[1].x - (out.layers[0].x + out.layers[0].w), 40);
  });

  test("a grid dropped with no options lands exactly where it used to", () => {
    // 16px at 1080 was the hard-coded gap before the slider existed.
    const out = insertWidget("gallery", CANVAS, BRAND, { count: 4 });
    assert.equal(out.layers[1].x - (out.layers[0].x + out.layers[0].w), 16);
    assert.equal(out.layers[0].radius, undefined);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   G-10 · chart value labels and per-bar colour
   ══════════════════════════════════════════════════════════════════════════ */

describe("G-10 · a bar can be read, and one bar can be picked out", () => {
  const bars = {
    id: "c1", kind: "chart", chart: "bar", x: 0, y: 0, w: 600, h: 400,
    values: [{ label: "Q1", value: 12 }, { label: "Q2", value: 18 },
      { label: "Q3", value: 9 }, { label: "Q4", value: 24 }],
  };

  test("with the numbers off, nothing changed", () => {
    const svg = chartToSvg(bars);
    assert.equal((svg.match(/<rect /g) || []).length, 4);
    assert.ok(!svg.includes(">12<"), "a value label appeared without being asked for");
  });

  test("with the numbers on, every bar carries its own", () => {
    const svg = chartToSvg({ ...bars, showValues: true });
    for (const v of [12, 18, 9, 24]) assert.ok(svg.includes(`>${v}<`), `the ${v} bar has no label`);
    // Above the bar, never inside it: the label's y is smaller than the bar's.
    const barY = Number(/<rect x="[\d.]+" y="([\d.]+)"/.exec(svg)[1]);
    const textY = Number(/<text x="[\d.]+" y="([\d.]+)"[^>]*font-weight="600"/.exec(svg)[1]);
    assert.ok(textY < barY, `the value label at ${textY} is not above the bar at ${barY}`);
    assert.ok(textY > 0, "the tallest bar's label was drawn off the top of the picture");
  });

  test("a prefix and a suffix are written, and the rounding is one rule", () => {
    assert.equal(formatChartValue(12), "12");
    assert.equal(formatChartValue(12.4375), "12.4");
    assert.equal(formatChartValue(1200, "$", "k"), "$1200k");
    const svg = chartToSvg({ ...bars, showValues: true, valuePrefix: "$", valueSuffix: "k" });
    assert.ok(svg.includes(">$24k<"));
  });

  test("ONE BAR IN THE BRAND COLOUR — design 08's whole ask", () => {
    const picked = {
      ...bars,
      colors: ["#94A3B8"],
      values: bars.values.map((v, i) => (i === 3 ? { ...v, colour: "#0F766E" } : v)),
    };
    const svg = chartToSvg(picked);
    const fills = [...svg.matchAll(/<rect [^>]*fill="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(fills, ["#94A3B8", "#94A3B8", "#94A3B8", "#0F766E"]);
  });

  test("MUTATION — a cycle alone cannot pick one bar out", () => {
    const cycleOnly = (layer) => (i) => (layer.colors || ["#94A3B8"])[i % (layer.colors || ["x"]).length];
    const colour = cycleOnly({ colors: ["#94A3B8"] });
    assert.equal(colour(3), "#94A3B8", "the mutation has been edited");
    assert.notEqual(colour(3), "#0F766E");
  });

  test("the server draws the same geometry, with the same band above the bars", () => {
    const lumen = LUMEN("src/lib/myBrand/templateStudio.js");
    assert.ok(lumen.includes("const valueBand = showValues ? valueSize * 1.35 : 0;"),
      "LUMEN reserves a different band for the value labels");
    assert.ok(lumen.includes("const valueSize = Math.max(9, Math.round(labelSize * 0.92));"));
    assert.ok(lumen.includes("function formatChartValue"));
    const client = STUDIO("scene.ts");
    assert.ok(client.includes("const valueBand = showValues ? valueSize * 1.35 : 0;"));
    assert.ok(client.includes("const valueSize = Math.max(9, Math.round(labelSize * 0.92));"));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   A pattern fill
   ══════════════════════════════════════════════════════════════════════════ */

describe("A stripe is a fill, in the size the author typed", () => {
  test("the tile is in USER space, so a texture does not resize with the panel", () => {
    const def = patternDef({ kind: "stripe", colour: "#0F766E", size: 20, weight: 0.5 }, "p1");
    assert.ok(def.includes('patternUnits="userSpaceOnUse"'), def);
    assert.ok(def.includes('width="20" height="20"'));
    assert.ok(def.includes('width="10.000"'), "a half-weight stripe is not half the tile");
  });

  test("all four kinds draw ink, and an angle turns the tile", () => {
    for (const kind of ["stripe", "dot", "grid", "check"]) {
      const def = patternDef({ kind, colour: "#B45309", size: 16 }, "p");
      assert.ok(/<(rect|circle|path) /.test(def.replace(/<pattern[^>]*>/, "")), `${kind} drew nothing`);
      assert.ok(def.includes("#B45309"), `${kind} lost the ink colour`);
    }
    assert.ok(patternDef({ kind: "stripe", colour: "#000", angle: 45 }, "p").includes('patternTransform="rotate(45)"'));
    assert.ok(!patternDef({ kind: "stripe", colour: "#000" }, "p").includes("patternTransform"));
  });

  test("a pattern beats a gradient beats a colour, and the shape says so", () => {
    const defs = [];
    const paint = shapeFill({
      fill: "#111111",
      gradient: { from: "#a", to: "#b", dir: "h" },
      pattern: { kind: "dot", colour: "#0F766E" },
    }, "s1", defs);
    assert.match(paint, /^url\(#s1p\)$/);
    assert.equal(defs.length, 1);
    assert.ok(defs[0].includes("<pattern"));
  });

  test("a patterned rectangle becomes the exporter's own picture", () => {
    const svg = shapeToSvg({
      id: "r1", kind: "shape", shape: "rect", x: 0, y: 0, w: 300, h: 200,
      pattern: { kind: "stripe", colour: "#0F766E", size: 12, angle: 45 },
      stroke: "none", strokeWidth: 0,
    });
    assert.ok(svg.includes("<pattern"));
    assert.ok(svg.includes('fill="url(#s'));
    assert.ok(svg.includes('width="300" height="200"'));
    const bridge = STUDIO("fabricBridge.ts");
    assert.ok(/s\.pattern && \(s\.shape === "rect" \|\| s\.shape === "ellipse"\)/.test(bridge),
      "a patterned rect is still painted by Fabric, which has no <pattern>");
  });

  test("the server's tile is the same tile", () => {
    const lumen = LUMEN("src/lib/myBrand/templateStudio.js");
    assert.ok(lumen.includes('patternUnits="userSpaceOnUse"'));
    assert.ok(lumen.includes("const size = Math.max(2, Number(spec.size) || 16);"));
    assert.ok(lumen.includes("const weight = Math.min(0.95, Math.max(0.05, Number(spec.weight) || 0.5));"));
    const client = STUDIO("scene.ts");
    assert.ok(client.includes("const size = Math.max(2, Number(spec.size) || 16);"));
    assert.ok(client.includes("const weight = Math.min(0.95, Math.max(0.05, Number(spec.weight) || 0.5));"));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   G-09 · more than one page in a design
   ══════════════════════════════════════════════════════════════════════════ */

describe("G-09 · a card has a front and a back, in one design", () => {
  const front = { id: "a", kind: "text", x: 0, y: 0, w: 100, h: 20, content: "FRONT" };
  const back = { id: "b", kind: "text", x: 0, y: 0, w: 100, h: 20, content: "BACK" };
  const twoSided = { ...CANVAS, layers: [front], pages: [{ background_color: "#000000", layers: [back] }] };

  test("A ONE-PAGE DESIGN IS UNTOUCHED — nothing stored has to migrate", () => {
    assert.equal(pageCount(CANVAS), 1);
    assert.deepEqual(pageAt(CANVAS, 0).layers, []);
    // Asking for a side that is not there gives page one rather than throwing:
    // a painter that has not heard of pages must never open blank.
    assert.deepEqual(pageAt(CANVAS, 7).layers, []);
    assert.deepEqual(docForPage(CANVAS, 0), {
      version: 1, width: 1080, height: 1080,
      background_color: "#FFFFFF", background_gradient: undefined, layers: [],
    });
  });

  test("page one lives where it always did, and page two beside it", () => {
    assert.equal(pageCount(twoSided), 2);
    assert.equal(pageAt(twoSided, 0).layers[0].content, "FRONT");
    assert.equal(pageAt(twoSided, 1).layers[0].content, "BACK");
    assert.equal(docForPage(twoSided, 1).background_color, "#000000");
    // Every page is the same size, because a page is the same artboard.
    assert.equal(docForPage(twoSided, 1).width, 1080);
  });

  test("adding, copying, moving and deleting a side", () => {
    const added = addPage(CANVAS);
    assert.equal(pageCount(added.doc), 2);
    assert.equal(added.index, 1);
    assert.deepEqual(pageAt(added.doc, 1).layers, []);

    const copied = duplicatePage(twoSided, 0);
    assert.equal(pageCount(copied.doc), 3);
    assert.equal(copied.index, 1);
    assert.equal(pageAt(copied.doc, 1).layers[0].content, "FRONT");
    // FRESH IDS: two sides sharing a layer id makes "select this layer"
    // ambiguous the moment either is edited.
    assert.notEqual(pageAt(copied.doc, 1).layers[0].id, "a");

    const moved = movePage(twoSided, 0, 1);
    assert.equal(pageAt(moved, 0).layers[0].content, "BACK");
    assert.equal(pageAt(moved, 1).layers[0].content, "FRONT");

    // Deleting page ONE promotes page two rather than refusing.
    const gone = removePage(twoSided, 0);
    assert.equal(pageCount(gone), 1);
    assert.equal(gone.layers[0].content, "BACK");
    assert.equal(gone.background_color, "#000000");
    // ...and a one-page design cannot lose its last side.
    assert.deepEqual(removePage(CANVAS, 0), CANVAS);
  });

  test("writing a side back puts it where it came from", () => {
    const edited = setPage(twoSided, 1, { background_color: "#FF0000", layers: [] });
    assert.equal(pageAt(edited, 1).background_color, "#FF0000");
    assert.equal(pageAt(edited, 0).layers[0].content, "FRONT", "editing the back changed the front");
    const editedFront = setPage(twoSided, 0, { background_color: "#00FF00", layers: [back] });
    assert.equal(editedFront.background_color, "#00FF00");
    assert.equal(pageAt(editedFront, 1).layers[0].content, "BACK");
  });

  test("the ceiling is the same number on both sides", () => {
    assert.equal(MAX_PAGES, 20);
    assert.ok(LUMEN("src/lib/myBrand/templateStudio.js").includes("const MAX_PAGES = 20;"));
  });

  test("THE PDF CARRIES EVERY SIDE, and its xref points at every object", async () => {
    const page = (r, g, b) => ({
      rgb: Uint8Array.from({ length: 4 * 4 * 3 }, (_, i) => [r, g, b][i % 3]),
      pixelWidth: 4, pixelHeight: 4, pageWidthPt: 252, pageHeightPt: 144,
    });
    const bytes = await buildImagePdfPages([page(255, 0, 0), page(0, 0, 255)], { title: "Card" });
    const text = Buffer.from(bytes).toString("latin1");
    assert.match(text, /\/Type \/Pages \/Kids \[3 0 R 6 0 R\] \/Count 2/);
    assert.equal((text.match(/\/Type \/Page[^s]/g) || []).length, 2);
    // Nine objects: catalog, page tree, two pages of three, and the info.
    assert.match(text, /\/Size 10 /);
    assert.match(text, /xref\n0 10\n/);
    // EVERY offset points at the object whose number it is — an xref one byte
    // out opens in one reader and not another.
    const xrefAt = Number(/startxref\n(\d+)\n%%EOF/.exec(text)[1]);
    // "xref", "0 10", the free entry, then one row per object.
    const rows = text.slice(xrefAt).split("\n").slice(3, 12);
    rows.forEach((row, i) => {
      const at = Number(row.slice(0, 10));
      assert.ok(text.startsWith(`${i + 1} 0 obj`, at),
        `object ${i + 1} is not at the offset the xref gives (${at})`);
    });
  });

  test("a one-page design still writes exactly the file it wrote before", async () => {
    const one = {
      rgb: new Uint8Array(4 * 4 * 3), pixelWidth: 4, pixelHeight: 4,
      pageWidthPt: 252, pageHeightPt: 144,
    };
    const text = Buffer.from(await buildImagePdfPages([one], { title: "One" })).toString("latin1");
    assert.match(text, /\/Kids \[3 0 R\] \/Count 1/);
    assert.match(text, /\/Size 7 /);
    assert.match(text, /\/Info 6 0 R/);
  });

  test("MUTATION — a fixed six-object xref is wrong the moment there are two pages", async () => {
    const page = {
      rgb: new Uint8Array(4 * 4 * 3), pixelWidth: 4, pixelHeight: 4,
      pageWidthPt: 252, pageHeightPt: 144,
    };
    const text = Buffer.from(await buildImagePdfPages([page, page])).toString("latin1");
    assert.ok(!text.includes("/Size 7 "), "two pages still declare a seven-object file");
    assert.ok(!text.includes("xref\n0 7\n"));
  });

  test("every page of a design is validated server-side, not just the first", () => {
    const lumen = LUMEN("src/lib/myBrand/templateStudio.js");
    const fn = lumen.slice(lumen.indexOf("function validateCanvas"));
    assert.ok(/pages\.flatMap\(\(p\) => \(p && Array\.isArray\(p\.layers\) \? p\.layers : \[\]\)\)/.test(fn),
      "a layer on page two skips the icon-key check");
    assert.ok(fn.includes("MAX_PAGES"), "there is no ceiling on the number of pages");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   The two halves hold the same digits
   ══════════════════════════════════════════════════════════════════════════ */

describe("Portal and LUMEN carry the same literal numbers", () => {
  test("the glyph advance tables are the same numbers, LOADED not read", () => {
    // Not a string search over the file: the LUMEN half is plain CommonJS with
    // no dependencies, so the suite REQUIRES IT and compares the two objects.
    // A comment claiming parity is worth nothing; two loaded tables that are
    // deepEqual is the claim itself.
    const server = require(path.join(HERE, "..", "..", "LUMEN-API-septa-mbcanva",
      "src", "lib", "myBrand", "textEffects.js"));
    assert.deepEqual(server.ADVANCE_TABLES, ADVANCE_TABLES,
      "the two halves pack a curved line with different glyph widths");
    for (const [family, digits] of Object.entries(ADVANCE_TABLES)) {
      assert.equal(digits.split(" ").length, 95, `${family} has the wrong number of advances`);
    }
    assert.equal(server.BOLD_ADVANCE_FACTOR, BOLD_ADVANCE_FACTOR);
    // And the two packers put the same word in the same places.
    const args = {
      text: "BLUE HERON", cx: 300, y: 200, span: 520, bulge: 72, size: 72,
      family: "Bebas Neue",
    };
    assert.deepEqual(server.curvedGlyphs(args), curvedGlyphs(args));
    assert.deepEqual(server.dashArray("dotted", 4), dashArray("dotted", 4));
    assert.deepEqual(server.dashArray("dashed", 4), dashArray("dashed", 4));
  });

  test("the six faces with metrics are the six TTFs LUMEN rasterises with", () => {
    const files = readFileSync(
      path.join(HERE, "..", "..", "LUMEN-API-septa-mbcanva", "assets", "fonts", "fonts.conf"), "utf8");
    assert.ok(files.length > 0, "the server's font config has gone");
    for (const family of Object.keys(ADVANCE_TABLES)) {
      assert.ok(meanAdvanceEm(family) > 0.2 && meanAdvanceEm(family) < 0.8,
        `${family}'s mean advance of ${meanAdvanceEm(family)} is not a plausible face`);
    }
    // Bebas Neue really is the narrow one and Poppins the wide one.
    assert.ok(meanAdvanceEm("Bebas Neue") < meanAdvanceEm("Poppins"));
    assert.ok(meanAdvanceEm("Oswald") < meanAdvanceEm("Lora"));
  });

  test("the dash answers match, including the numbers that changed", () => {
    const lumen = LUMEN("src/lib/myBrand/textEffects.js");
    assert.ok(lumen.includes("if (style === \"dashed\") return [w * 3, w * 2];"));
    assert.ok(lumen.includes("if (style === \"dotted\") return [w * 0.01, w * 2.5];"));
    assert.deepEqual(dashArray("dashed", 4), [12, 8]);
    assert.deepEqual(dashArray("dotted", 4), [0.04, 10]);
  });

  test("the icon stroke divisor is the same formula in both", () => {
    const lumen = LUMEN("src/lib/myBrand/templateStudio.js");
    assert.ok(lumen.includes("function iconStrokeScale(w, h)"));
    assert.ok(lumen.includes("return Math.sqrt(sx * sy);"));
    assert.ok(STUDIO("scene.ts").includes("return Math.sqrt(sx * sy);"));
    assert.equal(iconStrokeScale(700, 400).toFixed(6), Math.sqrt(7 * 4).toFixed(6));
    assert.equal(iconStrokeScale(100, 100), 1);
  });
});
