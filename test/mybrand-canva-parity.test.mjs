// test/mybrand-canva-parity.test.mjs — the Canva-parity pass on My Brand's
// Design Studio (BUILDER_MYBRAND_VS_CANVA_2026-09-19, gaps G-01, G-03, G-04,
// G-05, G-11, G-13, G-19, G-20, G-21) on the screen §11.13 agreed.
//
// Each claim below is here because it is the kind of thing that decays without
// anyone noticing, and each one is written with the mutation that turns it red.
// Every mutation in the list was RUN — the real function edited, the suite seen
// red, the edit put back.
//
//   1. CURVE IS GLYPH BY GLYPH. librsvg does not render <textPath> at all, so
//      a curved line built that way exports as an empty arc.
//        mutation: emit one <textPath> instead of the ring → red.
//   2. AN EFFECT IS DATA, NOT A DRAWING. Echo is two copies, Splice is a
//      see-through run over a solid one, Neon is two blurred copies — said once
//      in textEffects.ts and read by the canvas AND the exporter.
//        mutation: drop Echo's second pass → red.
//   3. CASE IS A DISPLAY TRANSFORM. The layer keeps what was typed.
//        mutation: make applyCase upper-case the stored content → red.
//   4. A GROUP IS A TAG, AND NO PAINTER READS IT. Grouping changes how a design
//      is edited, never how it is drawn.
//        mutation: have fabricBridge branch on groupId → red.
//   5. ARRANGING. One thing lines up with the page, two or more with each
//      other; distribute leaves EQUAL GAPS; tidy keeps the author's spacing.
//        mutation: align two layers to the page instead of the selection → red.
//   6. COPY THE LOOK, NOT THE PLACE. A pasted style never moves anything.
//        mutation: add "x" to TEXT_STYLE_FIELDS → red.
//   7. A DOTTED LINE NEEDS ITS ROUND CAP. A zero-length dash paints nothing
//      without one, so the rule and the cap are one answer.
//        mutation: return "butt" for dotted → red.
//   8. THE SCREEN §11.13 AGREED. Three tabs on the right, and the layer list is
//      the floating Structure window rather than the bottom of the inspector.
//        mutation: put a layer list back in LayerInspector → red.
//   9. A SIZE OF YOUR OWN CANNOT EXCEED WHAT THE SERVER WILL RENDER.
//        mutation: raise MAX_CANVAS_SIDE above the exporter's own cap → red.
//  10. SMART RESIZE IS PRO+, like Brand Sync beside it (G-21).
//        mutation: drop the tier check off the Resize button → red.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  applyCase, curvedGlyphs, curvedTextSvg, dashArray, dashLineCap, effectPasses,
  advanceEm, isCurved, isNarrowFamily, mainPaint, measureRun, needsSvgText, straightTextSvg, wrapLines,
  TEXT_EFFECTS,
} from "../src/builder/adapters/mybrand/textEffects.ts";
import {
  alignLayers, boundsOf, clampCanvasSide, copyStyleOf, displayText, distributeLayers,
  emptyCanvas, expandSelection, groupLayers, moveLayersToEdge, moveLayerToIndex,
  nudgeLayers, pasteStyle, textLayerSvg, tidyUp, ungroupLayers,
  MAX_CANVAS_SIDE, MIN_CANVAS_SIDE, SIZE_PRESETS, TEXT_STYLE_FIELDS,
} from "../src/builder/adapters/mybrand/scene.ts";

const SRC = path.join(process.cwd(), "src");
const read = (rel) => readFileSync(path.join(SRC, rel), "utf8");
const STUDIO = (name) => read(path.join("builder", "adapters", "mybrand", name));

/** Comments say WHY a rule exists, and often quote the thing it forbids. */
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** A scene of plain boxes, so a geometry claim is about the maths and nothing else. */
function boxes(specs) {
  return {
    ...emptyCanvas(1000, 1000),
    layers: specs.map((s, i) => ({
      id: s.id ?? `s${i}`, kind: "shape", shape: "rect",
      x: s.x, y: s.y, w: s.w, h: s.h, fill: "#123456",
      ...(s.groupId ? { groupId: s.groupId } : {}),
      ...(s.locked ? { locked: true } : {}),
    })),
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   1. Curve
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * A line of capitals that really does fill `span`, MEASURED in the face the
 * arc will be packed with. Used by the bulge claims, which are only true of a
 * line that fills the chord.
 */
function fillingLine(input) {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let out = "";
  let run = 0;
  for (let i = 0; run < input.span; i++) {
    const ch = letters[i % letters.length];
    const w = advanceEm(input.family, ch) * input.size;
    if (run + w > input.span) break;
    out += ch;
    run += w;
  }
  return out;
}

describe("Curve — glyph by glyph, because librsvg drops a <textPath>", () => {
  const input = {
    text: "BLUE HERON", cx: 300, y: 200, span: 520, bulge: 72, size: 72,
    font: "Bebas Neue", weight: "400", family: "Bebas Neue", boxW: 600, boxH: 300,
    effectInput: { size: 72, colour: "#B87333" },
  };

  test("no <textPath> anywhere in the studio — it exports as a silent blank", () => {
    const svg = curvedTextSvg(input);
    assert.ok(svg.includes("<text "), "the curve drew no words at all");
    assert.ok(!svg.includes("textPath"), "a <textPath> is words librsvg will not draw");
    // In the SOURCE too — and past the comments, because the reason this rule
    // exists is written out in them.
    for (const name of ["textEffects.ts", "scene.ts", "fabricBridge.ts"]) {
      assert.ok(!stripComments(STUDIO(name)).includes("textPath"), `${name} emits a textPath`);
    }
  });

  test("one rotated <text> per printed glyph, and spaces are not printed", () => {
    const svg = curvedTextSvg(input);
    const runs = svg.match(/<text /g) || [];
    const printed = [...input.text].filter((c) => c.trim() !== "").length;
    assert.equal(runs.length, printed, "a glyph went missing, or a space got drawn");
    assert.equal((svg.match(/rotate\(/g) || []).length, printed);
  });

  test("the bulge is what a person sees: the middle bows that far from the ends", () => {
    // The bulge describes the CIRCLE — how far the middle of a line filling the
    // whole span bows away from its ends. A short line sits on the same circle
    // and therefore bows less, which is right: dragging the slider must not
    // change shape when a word is added. So the claim is made with a line that
    // does fill the span.
    const filling = fillingLine(input);
    const glyphs = curvedGlyphs({ ...input, text: filling });
    const mid = glyphs[Math.floor(glyphs.length / 2)];
    const ends = (glyphs[0].y + glyphs[glyphs.length - 1].y) / 2;
    assert.ok(mid.y < ends, "a positive bulge drew a bowl instead of a rainbow");
    assert.ok(Math.abs((ends - mid.y) - input.bulge) < input.bulge * 0.35,
      `the middle bowed ${(ends - mid.y).toFixed(1)}px for a bulge of ${input.bulge}`);
  });

  test("more bulge is always more bow, and the same words never move on their own", () => {
    const bow = (bulge) => {
      const g = curvedGlyphs({ ...input, text: "ABCDEFGHIJKLMNOPQRS", bulge });
      return (g[0].y + g[g.length - 1].y) / 2 - g[Math.floor(g.length / 2)].y;
    };
    const steps = [10, 30, 60, 100, 150].map(bow);
    for (let i = 1; i < steps.length; i++) {
      assert.ok(steps[i] > steps[i - 1], `bulge stopped growing the bow at step ${i}`);
    }
  });

  test("a negative bulge is the same arc upside down", () => {
    const up = curvedGlyphs({ ...input, text: "ABCDEFG" });
    const down = curvedGlyphs({ ...input, text: "ABCDEFG", bulge: -input.bulge });
    assert.ok(down[0].y < down[Math.floor(down.length / 2)].y, "a bowl drew as a rainbow");
    assert.equal(up.length, down.length);
    // Mirrored: every glyph leans the opposite way by the same amount.
    for (let i = 0; i < up.length; i++) assert.ok(Math.abs(up[i].deg + down[i].deg) < 1e-9);
  });

  test("under a pixel of bulge is a straight line, not a very big circle", () => {
    assert.equal(isCurved(0), false);
    assert.equal(isCurved(undefined), false);
    assert.equal(isCurved(0.4), false);
    assert.equal(isCurved(-40), true);
    assert.deepEqual(curvedGlyphs({ ...input, bulge: 0 }), []);
  });

  test("a condensed face is measured as condensed, or the arc gapes", () => {
    assert.equal(isNarrowFamily("Bebas Neue, Impact, sans-serif"), true);
    assert.equal(isNarrowFamily("Oswald, Arial Narrow, sans-serif"), true);
    assert.equal(isNarrowFamily("Lora, Georgia, serif"), false);
    // ROUND 2: the face is MEASURED, not guessed at from its name. Bebas Neue
    // really does advance 0.375 em on average against Lora's 0.544, so the
    // same word takes less arc — and now it takes less by the amount the font
    // file says rather than by a 0.85 somebody chose.
    const wide = curvedGlyphs({ ...input, family: "Lora" });
    const narrow = curvedGlyphs({ ...input, family: "Bebas Neue" });
    const spread = (g) => Math.abs(g[g.length - 1].deg - g[0].deg);
    assert.ok(spread(narrow) < spread(wide), "a condensed face took as much arc as a wide one");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2. The effects
   ══════════════════════════════════════════════════════════════════════════ */

describe("Text effects are data, so the canvas and the download agree", () => {
  const at = (effect, extra = {}) => ({ effect, size: 100, colour: "#101010", ...extra });

  test("Echo is TWO fading copies behind, the further one fainter", () => {
    const passes = effectPasses(at("echo"));
    assert.equal(passes.length, 2, "Echo without two copies is a Drop shadow with a long name");
    assert.ok(passes[0].dx > passes[1].dx, "the back copy must sit further out than the near one");
    assert.ok(passes[0].opacity < passes[1].opacity, "the further copy must be the fainter one");
    for (const p of passes) assert.equal(p.blur, 0, "Echo is a hard-edged copy, not a shadow");
  });

  test("Splice is a see-through run over one solid copy", () => {
    const passes = effectPasses(at("splice", { effectColour: "#FF8800" }));
    assert.equal(passes.length, 1);
    assert.equal(passes[0].fill, "#FF8800");
    const paint = mainPaint(at("splice", { effectColour: "#FF8800" }));
    assert.equal(paint.fill, "none", "Splice with a filled run is just a shadow");
    assert.equal(paint.stroke, "#101010");
    assert.ok(paint.strokeWidth > 0);
  });

  test("Neon glows: two blurred copies, and the run keeps its colour", () => {
    const passes = effectPasses(at("neon"));
    assert.equal(passes.length, 2);
    for (const p of passes) assert.ok(p.blur > 0, "a neon pass with no blur is a fat outline");
    assert.ok(passes[0].blur > passes[1].blur, "the outer glow must be the softer one");
    assert.equal(mainPaint(at("neon")).fill, "#101010");
  });

  test("Hollow is stroke only, and Outline keeps its fill", () => {
    assert.equal(mainPaint(at("hollow")).fill, "none");
    const outlined = mainPaint({ size: 100, colour: "#101010", outline: "#FFFFFF" });
    assert.equal(outlined.fill, "#101010");
    assert.equal(outlined.stroke, "#FFFFFF");
    // "none" is how the model spells off, and it must not become a stroke.
    assert.equal(mainPaint({ size: 100, colour: "#101010", outline: "none" }).stroke, null);
  });

  test("every offset is a share of the font size, so an effect survives a resize", () => {
    const small = effectPasses(at("echo", { size: 20 }));
    const big = effectPasses(at("echo", { size: 200 }));
    for (let i = 0; i < small.length; i++) {
      assert.ok(Math.abs(big[i].dx / small[i].dx - 10) < 1e-9, "Echo did not scale with the type");
    }
  });

  test("the effect list a person picks from and the painter's list are one list", () => {
    const named = TEXT_EFFECTS.map((e) => e.value);
    for (const v of ["none", "shadow", "lift", "outline", "hollow", "echo", "splice", "neon"]) {
      assert.ok(named.includes(v), `the panel cannot offer ${v}`);
    }
    for (const e of TEXT_EFFECTS) assert.ok(e.hint.length > 10, `${e.value} has no sentence explaining it`);
  });

  test("the ONE predicate decides which path a layer takes", () => {
    assert.equal(needsSvgText({ effect: "echo" }), true);
    assert.equal(needsSvgText({ effect: "splice" }), true);
    assert.equal(needsSvgText({ effect: "neon" }), true);
    assert.equal(needsSvgText({ curve: 40 }), true);
    // The four Fabric can paint itself stay real, editable text.
    for (const effect of [null, undefined, "lift", "hollow"]) {
      assert.equal(needsSvgText({ effect }), false, `${effect} needlessly became a picture`);
    }
    // And both painters ask it rather than testing the effect name themselves.
    assert.ok(STUDIO("fabricBridge.ts").includes("textLayerSvg("));
    assert.ok(STUDIO("scene.ts").includes("needsSvgText(layer)"));
  });

  test("a curved Neon still glows — an effect is not switched off by a slider", () => {
    const svg = curvedTextSvg({
      text: "OPEN", cx: 200, y: 150, span: 300, bulge: 40, size: 60,
      font: "Poppins", weight: "700", boxW: 400, boxH: 300,
      effectInput: { effect: "neon", size: 60, colour: "#22D3EE" },
    });
    assert.ok(svg.includes("feGaussianBlur"), "the glow vanished the moment the words curved");
    const printed = [..."OPEN"].length;
    // Two glow rings plus the run itself.
    assert.equal((svg.match(/<text /g) || []).length, printed * 3);
  });

  test("the picture is tall enough for the whole arc, or the bow is cut off", () => {
    // A text layer's own h has always been nominal — Fabric's Textbox grows to
    // fit. An SVG rendered at that nominal height would clip the top off every
    // rainbow and the bottom off every bowl, silently.
    const layer = {
      id: "t", kind: "text", x: 0, y: 0, w: 600, h: 40,
      content: "BLUE HERON COFFEE", size: 64, curve: 120, color: "#B87333",
    };
    const out = textLayerSvg(layer);
    assert.ok(out, "a curved layer drew nothing");
    assert.ok(out.h >= 120 + 64, `the picture is ${out.h}px tall for a 120px bow of 64px type`);
    // And a long straight run gets room for every line it wrapped to.
    const many = textLayerSvg({
      id: "t2", kind: "text", x: 0, y: 0, w: 300, h: 20,
      content: "Spring clean-up bookings are open now, and the diary fills fast",
      size: 30, effect: "echo", color: "#1F3A5F",
    });
    const lines = (many.svg.match(/<tspan /g) || []).length / 3;  // three runs
    assert.ok(lines > 1, "the long run did not wrap");
    assert.ok(many.h >= 30 * 1.2 * lines, `${lines} lines of 30px type do not fit in ${many.h}px`);
  });

  test("a straight Echo is one SVG with three runs and no blur", () => {
    const svg = straightTextSvg({
      lines: ["HARVEST"], anchorX: 0, firstBaselineY: 80, align: "start",
      size: 80, lineHeight: 1.1, letterSpacing: 0, font: "Bebas Neue", weight: "400",
      boxW: 600, boxH: 120, effectInput: { effect: "echo", size: 80, colour: "#1F3A5F" },
    });
    assert.equal((svg.match(/<text /g) || []).length, 3);
    assert.ok(!svg.includes("feGaussianBlur"));
  });

  test("the wrap point is the exporter's own, so a headline breaks in one place", () => {
    const line = "Spring clean-up bookings are open now";
    const mine = wrapLines(line, 600, 48, "700", "Montserrat", 0);
    assert.ok(mine.length > 1, "a long headline did not wrap at all");
    /**
     * R3-D REPLACED THE ALLOWANCE THIS TEST USED TO CHECK.
     *
     * Round 1 measured the wrap in CHARACTERS against a guessed average em, and
     * this assertion checked every line against that guess. The guess is what
     * broke: the editor's Textbox broke on the browser's real glyph widths and
     * the two engines disagreed by a word. Both now measure the FACE, so the
     * honest check is that every line really does fit the box in pixels.
     */
    for (const l of mine) {
      const width = measureRun("Montserrat", l, 48, true, 0);
      assert.ok(width <= 600, `"${l}" is ${Math.round(width)} px in a 600 px box`);
    }
    // A newline the author typed is always honoured.
    assert.deepEqual(wrapLines("one\ntwo", 9999, 20, "400", "Poppins", 0), ["one", "two"]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   3. Case
   ══════════════════════════════════════════════════════════════════════════ */

describe("Capitals are shown, never stored", () => {
  test("the three transforms", () => {
    assert.equal(applyCase("harbourlight market", "upper"), "HARBOURLIGHT MARKET");
    assert.equal(applyCase("HARBOURLIGHT", "lower"), "harbourlight");
    assert.equal(applyCase("harbourlight autumn MARKET", "title"), "Harbourlight Autumn Market");
    assert.equal(applyCase("as typed", "none"), "as typed");
    assert.equal(applyCase("as typed", undefined), "as typed");
  });

  test("an apostrophe is inside the word, not the start of a new one", () => {
    assert.equal(applyCase("marlowe's interiors", "title"), "Marlowe's Interiors");
  });

  test("turning it off gives back exactly what was typed", () => {
    const layer = { id: "t", kind: "text", x: 0, y: 0, w: 100, h: 40, content: "sPrInG sale", textCase: "upper" };
    assert.equal(displayText(layer), "SPRING SALE");
    assert.equal(layer.content, "sPrInG sale", "the transform rewrote the author's words");
    assert.equal(displayText({ ...layer, textCase: "none" }), "sPrInG sale");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   4. Grouping
   ══════════════════════════════════════════════════════════════════════════ */

describe("A group is a tag — it changes editing, never drawing", () => {
  const scene = boxes([
    { id: "a", x: 0, y: 0, w: 100, h: 100 },
    { id: "b", x: 200, y: 0, w: 100, h: 100 },
    { id: "c", x: 400, y: 0, w: 100, h: 100 },
  ]);

  test("two or more get one shared tag; one thing is not a group", () => {
    const r = groupLayers(scene, ["a", "b"]);
    assert.ok(r.groupId);
    const tags = r.doc.layers.filter((l) => l.groupId).map((l) => l.groupId);
    assert.deepEqual(tags, [r.groupId, r.groupId]);
    assert.equal(groupLayers(scene, ["a"]).groupId, null, "one thing became a group");
    assert.equal(groupLayers(scene, []).doc, scene);
  });

  test("clicking one member picks the whole group, and nothing else", () => {
    const { doc } = groupLayers(scene, ["a", "b"]);
    assert.deepEqual(expandSelection(doc, ["a"]).sort(), ["a", "b"]);
    assert.deepEqual(expandSelection(doc, ["c"]), ["c"]);
  });

  test("a locked layer never joins a selection, group or not", () => {
    const locked = boxes([
      { id: "a", x: 0, y: 0, w: 10, h: 10, groupId: "g1" },
      { id: "b", x: 0, y: 0, w: 10, h: 10, groupId: "g1", locked: true },
    ]);
    assert.deepEqual(expandSelection(locked, ["a"]), ["a"]);
  });

  test("ungroup clears the tag and leaves everything else alone", () => {
    const { doc } = groupLayers(scene, ["a", "b"]);
    const back = ungroupLayers(doc, ["a"]);
    assert.equal(back.layers.filter((l) => l.groupId).length, 0);
    assert.deepEqual(back.layers.map((l) => [l.x, l.y, l.w, l.h]), scene.layers.map((l) => [l.x, l.y, l.w, l.h]));
  });

  test("NO PAINTER READS IT — a group is invisible to every renderer", () => {
    for (const name of ["fabricBridge.ts", "pdf.ts", "templates.ts"]) {
      assert.ok(!STUDIO(name).includes("groupId"),
        `${name} branches on groupId — a group must not change how a design is drawn`);
    }
    // insert.ts is the ONE file that may say the word, and only to WRITE it:
    // a tile that drops a pill and its words hands them over already grouped
    // (parity D-5). Reading one back to decide anything would be the defect
    // this rule exists to stop, so the check is that it never appears in a
    // condition.
    const inserts = STUDIO("insert.ts");
    for (const line of inserts.split(/\r?\n/)) {
      if (!line.includes("groupId")) continue;
      assert.ok(!/\b(if|\?|&&|\|\||===|!==)\b|[?]/.test(line.replace(/^\s*\*.*$/, "")),
        `insert.ts branches on groupId: ${line.trim()}`);
    }
    // And the one drawing helper in the model does not either.
    const svg = textLayerSvg({
      id: "t", kind: "text", x: 0, y: 0, w: 400, h: 100, content: "HI",
      size: 60, effect: "echo", color: "#000000", groupId: "g1",
    });
    assert.ok(svg && !svg.svg.includes("g1"));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   5. Arranging
   ══════════════════════════════════════════════════════════════════════════ */

describe("Arranging — one lines up with the page, more with each other", () => {
  test("one thing goes to the page edge", () => {
    const scene = boxes([{ id: "a", x: 300, y: 300, w: 100, h: 50 }]);
    assert.equal(alignLayers(scene, ["a"], "left").layers[0].x, 0);
    assert.equal(alignLayers(scene, ["a"], "right").layers[0].x, 900);
    assert.equal(alignLayers(scene, ["a"], "hcenter").layers[0].x, 450);
  });

  test("two or more line up inside the box they already occupy", () => {
    const scene = boxes([
      { id: "a", x: 100, y: 0, w: 100, h: 50 },
      { id: "b", x: 400, y: 0, w: 60, h: 50 },
    ]);
    const left = alignLayers(scene, ["a", "b"], "left");
    assert.equal(left.layers[0].x, 100);
    assert.equal(left.layers[1].x, 100, "they went to the PAGE edge instead of to each other");
    const right = alignLayers(scene, ["a", "b"], "right");
    assert.equal(right.layers[0].x, 360);
    assert.equal(right.layers[1].x, 400);
  });

  test("distribute leaves EQUAL GAPS, not equal centres", () => {
    const scene = boxes([
      { id: "a", x: 0, y: 0, w: 100, h: 20 },
      { id: "b", x: 150, y: 0, w: 300, h: 20 },
      { id: "c", x: 600, y: 0, w: 100, h: 20 },
    ]);
    const out = distributeLayers(scene, ["a", "b", "c"], "h").layers;
    const gap1 = out[1].x - (out[0].x + out[0].w);
    const gap2 = out[2].x - (out[1].x + out[1].w);
    assert.ok(Math.abs(gap1 - gap2) <= 1, `gaps came out ${gap1} and ${gap2}`);
    // The outer two never move — they are what defines the run.
    assert.equal(out[0].x, 0);
    assert.equal(out[2].x, 600);
  });

  test("distribute needs three — with two there is nothing in between", () => {
    const scene = boxes([{ id: "a", x: 0, y: 0, w: 10, h: 10 }, { id: "b", x: 90, y: 0, w: 10, h: 10 }]);
    assert.equal(distributeLayers(scene, ["a", "b"], "h"), scene);
  });

  test("tidy up keeps the author's own spacing and lines the row up", () => {
    const scene = boxes([
      { id: "a", x: 0, y: 10, w: 100, h: 40 },
      { id: "b", x: 140, y: 33, w: 100, h: 40 },   // 40 gap, 23px out of line
      { id: "c", x: 284, y: 7, w: 100, h: 40 },    // 44 gap
    ]);
    const out = tidyUp(scene, ["a", "b", "c"]).layers;
    const gaps = [out[1].x - (out[0].x + out[0].w), out[2].x - (out[1].x + out[1].w)];
    assert.deepEqual(gaps, [42, 42], "the median of the author's own gaps was not kept");
    const centres = out.map((l) => l.y + l.h / 2);
    assert.ok(Math.max(...centres) - Math.min(...centres) <= 1, "the row did not line up");
  });

  test("nudge moves only what is selected, and never a locked layer", () => {
    const scene = boxes([
      { id: "a", x: 10, y: 10, w: 10, h: 10 },
      { id: "b", x: 50, y: 50, w: 10, h: 10, locked: true },
      { id: "c", x: 90, y: 90, w: 10, h: 10 },
    ]);
    const out = nudgeLayers(scene, ["a", "b"], -1, 10).layers;
    assert.deepEqual([out[0].x, out[0].y], [9, 20]);
    assert.deepEqual([out[1].x, out[1].y], [50, 50], "a locked layer moved");
    assert.deepEqual([out[2].x, out[2].y], [90, 90]);
  });

  test("to front and to back move the set in one go and keep its own order", () => {
    const scene = boxes([
      { id: "a", x: 0, y: 0, w: 1, h: 1 }, { id: "b", x: 0, y: 0, w: 1, h: 1 },
      { id: "c", x: 0, y: 0, w: 1, h: 1 }, { id: "d", x: 0, y: 0, w: 1, h: 1 },
    ]);
    assert.deepEqual(moveLayersToEdge(scene, ["a", "b"], "front").layers.map((l) => l.id), ["c", "d", "a", "b"]);
    assert.deepEqual(moveLayersToEdge(scene, ["c", "d"], "back").layers.map((l) => l.id), ["c", "d", "a", "b"]);
    // Moving everything is a no-op rather than a scramble.
    assert.equal(moveLayersToEdge(scene, ["a", "b", "c", "d"], "front"), scene);
  });

  test("a dragged Structure row lands exactly where it was dropped", () => {
    const scene = boxes([
      { id: "a", x: 0, y: 0, w: 1, h: 1 }, { id: "b", x: 0, y: 0, w: 1, h: 1 },
      { id: "c", x: 0, y: 0, w: 1, h: 1 },
    ]);
    assert.deepEqual(moveLayerToIndex(scene, "a", 2).layers.map((l) => l.id), ["b", "c", "a"]);
    assert.deepEqual(moveLayerToIndex(scene, "c", 0).layers.map((l) => l.id), ["c", "a", "b"]);
    assert.equal(moveLayerToIndex(scene, "b", 1), scene);
    assert.deepEqual(moveLayerToIndex(scene, "a", 99).layers.map((l) => l.id), ["b", "c", "a"]);
  });

  test("bounds is the one rectangle around the lot", () => {
    const scene = boxes([
      { id: "a", x: 10, y: 20, w: 30, h: 40 },
      { id: "b", x: 100, y: 5, w: 10, h: 10 },
    ]);
    assert.deepEqual(boundsOf(scene, ["a", "b"]), { x: 10, y: 5, w: 100, h: 55 });
    assert.equal(boundsOf(scene, ["nope"]), null);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   6. Copy the look
   ══════════════════════════════════════════════════════════════════════════ */

describe("Copy the look — and nothing that would move anything", () => {
  const textLayer = {
    id: "t1", kind: "text", x: 40, y: 60, w: 300, h: 80,
    content: "Autumn timetable", font: "Lora, Georgia, serif", size: 48,
    color: "#1F3A5F", weight: "700", effect: "echo", effectColor: "#EF6C33",
    textCase: "upper", curve: 22, opacity: 0.8,
  };

  test("no field that places a thing is ever copied", () => {
    for (const forbidden of ["x", "y", "w", "h", "rotation", "content", "id", "locked", "groupId"]) {
      assert.ok(!TEXT_STYLE_FIELDS.includes(forbidden), `${forbidden} is in the copied style`);
    }
  });

  test("a paste changes the look and leaves the words and the place alone", () => {
    const target = {
      id: "t2", kind: "text", x: 500, y: 700, w: 200, h: 40,
      content: "Book a class", font: "Poppins, Inter, sans-serif", size: 20, color: "#000000",
    };
    const scene = { ...emptyCanvas(1000, 1000), layers: [textLayer, target] };
    const out = pasteStyle(scene, ["t2"], copyStyleOf(textLayer)).layers[1];
    assert.equal(out.content, "Book a class");
    assert.deepEqual([out.x, out.y, out.w, out.h], [500, 700, 200, 40]);
    assert.equal(out.font, textLayer.font);
    assert.equal(out.size, 48);
    assert.equal(out.effect, "echo");
    assert.equal(out.curve, 22);
    assert.equal(out.opacity, 0.8);
  });

  test("a field the source does not have is CLEARED, not left behind", () => {
    const plain = { ...textLayer, id: "t3" };
    delete plain.effect;
    delete plain.curve;
    const target = { ...textLayer, id: "t4" };
    const scene = { ...emptyCanvas(1000, 1000), layers: [target] };
    const out = pasteStyle(scene, ["t4"], copyStyleOf(plain)).layers[0];
    assert.equal(out.effect, undefined, "the old effect survived a paste from a plain one");
    assert.equal(out.curve, undefined);
  });

  test("a words look is never poured onto a picture", () => {
    const picture = { id: "i1", kind: "image", x: 0, y: 0, w: 10, h: 10, src: "data:,x" };
    const scene = { ...emptyCanvas(1000, 1000), layers: [picture] };
    const out = pasteStyle(scene, ["i1"], copyStyleOf(textLayer)).layers[0];
    assert.deepEqual(out, picture);
  });

  test("a chart has no look to copy, and says so rather than copying nothing", () => {
    assert.equal(copyStyleOf({ id: "c", kind: "chart", x: 0, y: 0, w: 1, h: 1, chart: "bar", values: [] }), null);
    assert.equal(copyStyleOf(null), null);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   7. Dashes
   ══════════════════════════════════════════════════════════════════════════ */

describe("Dashed and dotted rules", () => {
  test("solid is an empty array, which is how SVG and Fabric both spell off", () => {
    assert.deepEqual(dashArray("solid", 4), []);
    assert.deepEqual(dashArray(undefined, 4), []);
  });

  test("a dash scales with the line, so a thick rule is not a row of crumbs", () => {
    assert.deepEqual(dashArray("dashed", 2), [6, 4]);
    assert.deepEqual(dashArray("dashed", 10), [30, 20]);
  });

  test("a DOT is a near-zero dash, and it needs the round cap to exist at all", () => {
    // ROUND 2 (parity D-4): 0.01w, not a literal 0, and a 2.5w gap rather than
    // 2w. A literal zero is the degenerate case — SVG draws the dot, a 2D
    // canvas may drop the segment entirely — and at a 2w gap the round caps'
    // own ink very nearly touches, which is how three dotted fill-in rules
    // came out solid on design 10.
    assert.deepEqual(dashArray("dotted", 3), [0.03, 7.5]);
    assert.equal(dashLineCap("dotted"), "round");
    assert.equal(dashLineCap("dashed"), "butt");
    assert.equal(dashLineCap("solid"), "butt");
  });

  test("every painter sets the cap wherever it sets the array", () => {
    for (const name of ["fabricBridge.ts", "scene.ts"]) {
      const code = STUDIO(name);
      if (!code.includes("dashArray(")) continue;
      assert.ok(code.includes("dashLineCap("), `${name} sets a dash pattern with no line cap`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   8. The screen §11.13 agreed
   ══════════════════════════════════════════════════════════════════════════ */

describe("The screen — three tabs on the right, the stack in a floating window", () => {
  const inspector = STUDIO("LayerInspector.tsx");
  const structure = STUDIO("StructureWindow.tsx");
  const builder = STUDIO("StudioBuilder.tsx");

  test("Content, Style and Advanced, named exactly that", () => {
    for (const tab of ["content", "style", "advanced"]) {
      assert.ok(inspector.includes(`data-inspector-tab={key}`), "the tabs carry no hook to click");
      assert.ok(inspector.includes(`"${tab}"`), `the ${tab} tab is missing`);
    }
    for (const label of ["Content", "Style", "Advanced"]) {
      assert.ok(inspector.includes(`"${label}"`), `${label} is not spelled as §11.13 spells it`);
    }
  });

  test("the layer list has LEFT the inspector for the Structure window", () => {
    assert.ok(!/Layers \(\{/.test(inspector), "the old layer list is still stapled to the inspector");
    assert.ok(!inspector.includes("LayerRow"), "the inspector still draws layer rows");
    assert.ok(structure.includes("data-structure-window"));
    assert.ok(structure.includes("draggable"), "the rows cannot be dragged to restack");
    assert.ok(structure.includes("onDrop"), "a dragged row lands nowhere");
  });

  test("Structure opens from a button AND from Ctrl+I, as §11.13 names", () => {
    assert.ok(builder.includes("data-structure-toggle"), "there is no Structure button");
    assert.ok(/e\.key\.toLowerCase\(\) === "i"/.test(builder), "Ctrl+I does not open Structure");
    assert.ok(builder.includes("setStructureOpen"));
  });

  test("every control the parity pass added has a home and a tooltip", () => {
    for (const hook of ["data-text-effect", "data-text-curve", "data-stroke-style"]) {
      assert.ok(inspector.includes(hook), `${hook} is not on the panel`);
    }
    for (const hook of ["data-custom-width", "data-custom-height"]) {
      assert.ok(builder.includes(hook), `${hook} is not on the resize dialog`);
    }
    // SD-010 — every button carries a tooltip — is already one claim, in
    // mybrand-studio.test.mjs, and it walks every .tsx in this folder. A second
    // copy here would be a second rule to keep in step.
  });

  test("the group shortcut is on the panel as well as on the keyboard", () => {
    assert.ok(inspector.includes("⌘/Ctrl+G"), "Group is a shortcut nobody is told about");
    assert.ok(/e\.key\.toLowerCase\(\) === "g"/.test(builder));
    assert.ok(builder.includes("ungroupLayers"));
  });

  test("arrow keys nudge, which the panel now promises", () => {
    assert.ok(builder.includes("ArrowLeft") && builder.includes("nudgeLayers"));
    assert.ok(inspector.includes("Nudge"), "the shortcut table does not mention the arrows");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   9 and 10. Sizes, and who may resize
   ══════════════════════════════════════════════════════════════════════════ */

describe("Sizes", () => {
  test("the four sizes the reference designs needed are on the list", () => {
    const has = (w, h) => SIZE_PRESETS.some((s) => s.w === w && s.h === h);
    assert.ok(has(1920, 1080), "no 16:9 presentation slide");
    assert.ok(has(1280, 720), "no video thumbnail");
    assert.ok(has(1650, 1275), "no landscape Letter");
    assert.ok(has(1080, 1350), "no 4:5 portrait post");
  });

  test("a size of your own is clamped to what the exporter will render", () => {
    // LUMEN's templateStudio refuses more than 6000 px a side, so a design
    // cannot be authored at a size that can never be downloaded.
    assert.equal(MAX_CANVAS_SIDE, 6000);
    assert.equal(clampCanvasSide(99999), 6000);
    assert.equal(clampCanvasSide(1), MIN_CANVAS_SIDE);
    assert.equal(clampCanvasSide("1240"), 1240);
    assert.equal(clampCanvasSide("nonsense"), MIN_CANVAS_SIDE);
    assert.equal(clampCanvasSide(1240.6), 1241);
  });

  test("Smart Resize is Pro+, like Brand Sync beside it (G-21)", () => {
    const builder = STUDIO("StudioBuilder.tsx");
    // THE BUTTON ITSELF, not a window around it. Brand Sync sits immediately
    // beside Resize and carries its own `hasProTools`, so a loose slice reads
    // the neighbour's tier check and passes with Resize wide open — which is
    // exactly the hole this row exists to close.
    const open = builder.lastIndexOf("<button", builder.indexOf("setResizeOpen(true)"));
    const close = builder.indexOf("</button>", open);
    assert.ok(open > 0 && close > open, "the Resize button moved and this test cannot see it");
    const button = builder.slice(open, close);
    assert.ok(button.includes("Resize"), "this is not the Resize button");
    assert.ok(button.includes("disabled={!hasProTools}"), "the Resize button is not disabled below Pro");
    assert.ok(/hasProTools\s*\?/.test(button), "the Resize button has no tier check on what it does");
    assert.ok(button.includes("Pro+"), "the Resize button does not say it is a Pro feature");
  });
});
