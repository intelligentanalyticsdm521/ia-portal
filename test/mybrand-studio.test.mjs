// test/mybrand-studio.test.mjs — My Brand's Template Studio on the shared shell
// (BUILDER_PLATFORM_SCOPE_2026-09-15 §4 step 6 / §5 step 5 / §7).
//
// Four claims, each with the mutation that turns it red. They are here and not
// in a walk document because each one is the kind of thing that decays quietly:
// a swatch drifts to a literal, a template gains a hardcoded colour, somebody
// "helpfully" writes a chosen colour back to the brand kit, a tool loses the
// only sentence that explained it.
//
//   1. REGISTRY ENTRIES ARE COMPLETE — every tool the studio's pane offers is a
//      registry entry with a picture, a sentence and a tooltip.
//        mutation: blank brand_logo's description → red.
//   2. TEMPLATES SEED FROM THE BRAND KIT — every colour a pre-made design
//      places came from the kit it was handed.
//        mutation: hardcode "#FF0000" anywhere in templates.ts → red.
//   3. AN OVERRIDE NEVER WRITES BACK — nothing under adapters/mybrand or the My
//      Brand pages calls the kit's save().
//        mutation: add `save({ colours: { primary: c } })` to the inspector → red.
//   4. THE EXPORT PATH — one filename rule, four formats, and the canvas
//      renders at 1:1 whatever the zoom is.
//        mutation: drop `c.setZoom(1)` from PixelCanvas's export → red.
//   5. THE PDF IS A REAL PDF — the page is the artboard's true size in points,
//      the xref points at the objects, and the image inflates back byte for byte.
//        mutation: divide by 72 instead of 96 in pdfPageSize → red.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import zlib from "node:zlib";
import path from "node:path";
import {
  widgetsFor, widgetTooltip, widgetDescription, widgetLabel, WIDGETS_BY_KIND,
  WIDGET_CATEGORIES,
} from "../src/builder/registry.ts";
import {
  PREMADE_DESIGNS, PREMADE_BY_KEY, PREMADE_GROUPS, buildPremade, coloursUsed, premadeFor,
} from "../src/builder/adapters/mybrand/templates.ts";
import { insertWidget, brandSwatches } from "../src/builder/adapters/mybrand/insert.ts";
import {
  addLayers, alignLayer, brandSync, duplicateLayer, emptyCanvas, exportFilename,
  fixTextContrast, fontOptions, patchLayer, removeLayer, reorderLayer, smartResize,
  STUDIO_FONTS, familyOf, SIZE_PRESETS, PRINT_INCHES,
} from "../src/builder/adapters/mybrand/scene.ts";
import { buildImagePdf, pdfPageSize, PDF_MIME } from "../src/builder/adapters/mybrand/pdf.ts";
import { initHistory, push, undo, redo, canUndo, canRedo } from "../src/builder/history.ts";

const SRC = path.join(process.cwd(), "src");
const read = (rel) => readFileSync(path.join(SRC, rel), "utf8");
const STUDIO_DIR = path.join(SRC, "builder", "adapters", "mybrand");
const studioFiles = readdirSync(STUDIO_DIR).map((f) => ({ name: f, code: readFileSync(path.join(STUDIO_DIR, f), "utf8") }));

/** A palette of sentinels: nothing on the platform is any of these colours, so
 *  a colour that comes out of a template and is NOT one of them was invented. */
const SENTINEL = {
  colours: {
    primary: "#0A0B0C", secondary: "#141516", accent: "#1E1F20",
    text: "#282930", background: "#323340",
  },
  fonts: { heading: "Testa, serif", body: "Testb, sans-serif" },
  logoUrl: "https://example.test/logo.png",
  businessName: "Rolling In It",
  websiteUrl: "https://rollinginit.test",
};
const SENTINEL_SET = new Set(Object.values(SENTINEL.colours).map((c) => c.toUpperCase()));

/* ══════════════════════════════════════════════════════════════════════════
   1. The pane is the SHARED pane, and its entries are complete
   ══════════════════════════════════════════════════════════════════════════ */

describe("the studio's tools are registry entries, like every other builder's", () => {
  const tools = widgetsFor("brand");

  test("every tool §5 step 5 names is offered", () => {
    const kinds = tools.map((w) => w.kind);
    for (const kind of [
      "paragraph",      // text
      "heading",
      "image",
      "brand_logo",     // logo
      "shape",
      "icon",
      "colour_block",   // brand colour block
      "background",
      "qr_code",
      "social_handle",
      /* `callout` is DELETED (D-165) and its job is Elementor's **Alert**. The
         studio's `insertWidget` has no case for an Alert yet, so the tile is
         not offered here rather than being a button that does nothing — item S2
         in `overnight-report/D165_HANDOFF_2026-09-19.md`. */
    ]) {
      assert.ok(kinds.includes(kind), `the pane cannot add a ${kind}`);
    }
  });

  test("each one has a picture, one plain line and a tooltip carrying both", () => {
    for (const w of tools) {
      assert.ok(w.picture.startsWith("data:image/svg+xml,"), `${w.kind} has no picture`);
      // N-4: the sentence is per builder now, so read the STUDIO's one.
      const line = widgetDescription(w, "brand");
      assert.ok(line.length >= 25, `${w.kind}'s line is too short to explain anything`);
      assert.ok(!line.includes("\n"), `${w.kind}'s line is not one line`);
      assert.equal(widgetTooltip(w, "brand"), `${widgetLabel(w, "brand")} — ${line}`);
      assert.ok(w.controls.length > 0, `${w.kind} has no controls`);
    }
  });

  test("they are grouped, not one long list", () => {
    /* D-165 — the panel's groups are Elementor's four (Layout / Basic /
       General / Intelligent Analytics), and the studio's eleven tools fall into
       two of them: the text and the placed pictures are **Basic**, the QR code,
       the colour block and the rest are **General**. Two is what "grouped, not
       one long list" means with four groups to choose from; the number this
       test was written against was nine invented ones. */
    const groups = new Set(tools.map((w) => w.category));
    assert.ok(groups.size >= 2, `the pane would open as ${groups.size} group(s)`);
    for (const g of groups) assert.ok(WIDGET_CATEGORIES.includes(g), `${g} is not a panel group`);
  });

  test("every tool the pane offers actually places something", () => {
    // The drift this catches: a widget gains "brand" in the registry and the
    // adapter has no case for it, so the button does nothing at all.
    const doc = emptyCanvas(1080, 1080);
    const NEEDS_AN_ANSWER = { icon: "star", shape: "rect", colour_block: "primary", background: "fade", social_handle: "instagram" };
    for (const w of tools) {
      const opts = { count: w.count?.default };
      if (NEEDS_AN_ANSWER[w.kind]) opts.option = NEEDS_AN_ANSWER[w.kind];
      if (w.kind === "qr_code") opts.imageSrc = "data:image/svg+xml;base64,AAAA";
      const out = insertWidget(w.kind, doc, SENTINEL, opts);
      assert.ok(out.layers.length > 0, `adding a ${w.kind} put nothing on the canvas`);
      assert.ok(out.selectId, `adding a ${w.kind} selected nothing`);
      for (const l of out.layers) {
        assert.ok(l.id, `a ${w.kind} layer has no id — it could never be selected`);
        assert.ok(Number.isFinite(l.x) && Number.isFinite(l.y), `a ${w.kind} layer has no position`);
        assert.ok(l.x >= -1 && l.y >= -1 && l.x <= doc.width && l.y <= doc.height,
          `a ${w.kind} layer lands off the canvas at ${l.x},${l.y}`);
      }
    }
  });

  test("a background and a colour block go UNDER what is already there", () => {
    const doc = emptyCanvas(1080, 1080);
    for (const kind of ["background", "colour_block"]) {
      const out = insertWidget(kind, doc, SENTINEL, { option: kind === "background" ? "fade" : "primary" });
      assert.equal(out.behind, true, `${kind} would cover the design instead of sitting behind it`);
    }
  });

  test("what a tool places is the business's colour, never a literal", () => {
    const doc = emptyCanvas(1080, 1080);
    for (const w of widgetsFor("brand")) {
      const opts = { count: w.count?.default };
      const answer = { icon: "star", shape: "rect", colour_block: "accent", background: "solid", social_handle: "instagram" }[w.kind];
      if (answer) opts.option = answer;
      const out = insertWidget(w.kind, doc, SENTINEL, opts);
      // The canvas's own paper is not something a TOOL placed.
      const scene = { ...doc, background_color: null, background_gradient: null, layers: out.layers };
      for (const c of coloursUsed(scene)) {
        assert.ok(SENTINEL_SET.has(c), `adding a ${w.kind} placed ${c}, which is not one of the business's colours`);
      }
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2. The template principle: never blank, always theirs
   ══════════════════════════════════════════════════════════════════════════ */

describe("the gallery seeds every template from the brand kit", () => {
  test("§5 step 5's sizes are all there", () => {
    const labels = PREMADE_DESIGNS.map((d) => d.label.toLowerCase()).join(" | ");
    for (const wanted of ["instagram post", "instagram story", "facebook post", "linkedin banner", "business card", "flyer", "logo lockup"]) {
      assert.ok(labels.includes(wanted), `the gallery has no ${wanted}`);
    }
  });

  test("every template opens with something on it — never a blank square", () => {
    for (const d of PREMADE_DESIGNS) {
      const scene = d.build(SENTINEL, d.count?.default);
      assert.ok(scene.layers.length >= 3, `${d.key} opens with ${scene.layers.length} layer(s)`);
      assert.equal(scene.width, d.w);
      assert.equal(scene.height, d.h);
      assert.equal(scene.version, 1);
    }
  });

  test("EVERY colour placed came from the kit — no literal survives", () => {
    // THE mutation row: put "#FF0000" (or white, or black) anywhere in
    // templates.ts and this names the template that leaked it.
    for (const d of PREMADE_DESIGNS) {
      const scene = d.build(SENTINEL, d.count?.default);
      for (const c of coloursUsed(scene)) {
        assert.ok(SENTINEL_SET.has(c), `${d.key} placed ${c}, which the business never chose`);
      }
    }
  });

  test("every face placed is one of the business's two", () => {
    const theirs = new Set([SENTINEL.fonts.heading, SENTINEL.fonts.body]);
    for (const d of PREMADE_DESIGNS) {
      for (const l of d.build(SENTINEL, d.count?.default).layers) {
        if (l.kind !== "text") continue;
        assert.ok(theirs.has(l.font), `${d.key} sets ${l.font} on a line of type`);
      }
    }
  });

  test("the business's NAME and LOGO are already placed", () => {
    // Acceptance row (b): pick "Instagram post" and the name, the logo and the
    // colours are there before anybody types anything.
    const scene = buildPremade("ig_post", SENTINEL);
    const words = scene.layers.filter((l) => l.kind === "text").map((l) => l.content).join(" ");
    assert.ok(words.includes(SENTINEL.businessName), "the business name is not on the design");
    const logos = scene.layers.filter((l) => l.kind === "image" && l.src === SENTINEL.logoUrl);
    assert.equal(logos.length, 1, "the logo is not on the design");
    const used = coloursUsed(scene);
    assert.ok(used.includes(SENTINEL.colours.primary.toUpperCase()), "their primary colour is not used");
  });

  test("a business with no logo yet gets the slot, not a broken picture", () => {
    const noLogo = { ...SENTINEL, logoUrl: null };
    const scene = buildPremade("ig_post", noLogo);
    const slot = scene.layers.find((l) => l.kind === "image");
    assert.ok(slot, "the logo slot vanished");
    assert.equal(slot.src, null, "a missing logo must be an empty slot, never a dead link");
  });

  test("SD-010's guided count reaches this canvas too", () => {
    // §5 step 5: "how many? once for repeated elements where it applies
    // (e.g. a 3-tip carousel)".
    const counted = PREMADE_DESIGNS.filter((d) => d.count);
    assert.ok(counted.length >= 1, "no template asks how many");
    for (const d of counted) {
      assert.match(d.count.label, /how many/i);
      assert.ok(d.count.default >= d.count.min && d.count.default <= d.count.max);
      const two = d.build(SENTINEL, d.count.min);
      const six = d.build(SENTINEL, d.count.max);
      assert.ok(six.layers.length > two.layers.length, `${d.key} ignores the number it asked for`);
    }
  });

  test("the gallery's own search and grouping are pure", () => {
    assert.deepEqual(premadeFor("zzzz"), []);
    assert.ok(premadeFor("story").some((d) => d.key === "ig_story"));
    assert.ok(premadeFor("1050").some((d) => d.key === "business_card"), "searching a size should work");
    for (const d of PREMADE_DESIGNS) assert.ok(PREMADE_GROUPS.includes(d.group), `${d.key} is in no group`);
    assert.equal(Object.keys(PREMADE_BY_KEY).length, PREMADE_DESIGNS.length);
    assert.equal(buildPremade("not-a-template", SENTINEL), null, "an unknown key must not throw");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   3. A design override is an override. Brand Identity is the one writer.
   ══════════════════════════════════════════════════════════════════════════ */

describe("nothing in the studio writes back to the brand kit", () => {
  const stripComments = (t) =>
    t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  const WRITERS = [
    // The kit's context save, destructured or called through.
    /\bsave\s*\(\s*\{\s*(colours|fonts|logo_url)/,
    /\buseBrandKit\(\)[\s\S]{0,80}\bsave\b/,
    /\bsaveBrandKit\s*\(/,
    // The two legacy back doors the step-0 note names as follow-ups.
    /PUT\s+\/brand-kit/,
    /oliver[^\n]*\/settings["'`]\s*,/,
  ];

  const SURFACES = [
    ...studioFiles.map((f) => ["builder/adapters/mybrand/" + f.name, f.code]),
    ["pages/myBrand/TemplateStudioPage.tsx", read("pages/myBrand/TemplateStudioPage.tsx")],
  ];

  for (const [rel, code] of SURFACES) {
    test(`${rel} reads the kit and never writes it`, () => {
      const clean = stripComments(code);
      for (const pattern of WRITERS) {
        assert.equal(pattern.test(clean), false,
          `${rel} writes the brand kit (${pattern}) — a colour chosen on a design is an override on THAT DESIGN`);
      }
    });
  }

  test("exactly ONE file in the studio reads the kit at all", () => {
    const readers = studioFiles.filter((f) => /useBrandKit\(/.test(stripComments(f.code))).map((f) => f.name);
    assert.deepEqual(readers, ["StudioBuilder.tsx"],
      "the brand arrives as an argument everywhere else, which is what makes the templates testable");
  });

  test("the pure modules cannot reach the kit's writer even by accident", () => {
    for (const name of ["scene.ts", "insert.ts", "templates.ts"]) {
      const code = studioFiles.find((f) => f.name === name).code;
      assert.doesNotMatch(code, /BrandKitProvider/, `${name} must take the brand as an argument`);
    }
  });

  test("changing a layer's colour changes the layer and nothing else", () => {
    const scene = buildPremade("ig_post", SENTINEL);
    const textLayer = scene.layers.find((l) => l.kind === "text");
    const after = patchLayer(scene, textLayer.id, { color: "#BADA55" });
    assert.equal(after.layers.find((l) => l.id === textLayer.id).color, "#BADA55");
    // The kit object handed in is untouched — it is not even reachable from here.
    assert.equal(SENTINEL.colours.text, "#282930");
    // And every OTHER layer still carries the business's colours.
    const others = after.layers.filter((l) => l.id !== textLayer.id);
    for (const c of coloursUsed({ ...after, layers: others })) {
      assert.ok(SENTINEL_SET.has(c), `patching one layer changed another to ${c}`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   4. The scene, the undo, the fonts and the export
   ══════════════════════════════════════════════════════════════════════════ */

describe("the scene operations are values, so undo is the shared history", () => {
  test("every operation returns a NEW scene", () => {
    const a = buildPremade("ig_post", SENTINEL);
    const id = a.layers[0].id;
    for (const [name, next] of [
      ["patch", patchLayer(a, id, { x: 5 })],
      ["remove", removeLayer(a, id)],
      ["reorder", reorderLayer(a, id, "up")],
      ["align", alignLayer(a, id, "hcenter")],
      ["brandSync", brandSync(a, Object.values(SENTINEL.colours))],
      ["add", addLayers(a, [{ id: "x", kind: "shape", shape: "rect", x: 0, y: 0, w: 1, h: 1 }])],
      ["duplicate", duplicateLayer(a, id).doc],
      ["resize", smartResize(a, 1080, 1920)],
    ]) {
      assert.notEqual(next, a, `${name} mutated the scene in place`);
    }
    assert.equal(a.layers[0].x, buildPremade("ig_post", SENTINEL).layers[0].x, "the original moved");
  });

  test("undo twice and redo once lands where a person expects", () => {
    // Acceptance row (d), as a value: three edits, two undos, one redo.
    let h = initHistory(buildPremade("ig_post", SENTINEL));
    const id = h.present.layers.find((l) => l.kind === "text").id;
    h = push(h, patchLayer(h.present, id, { x: 100 }));
    h = push(h, patchLayer(h.present, id, { x: 200 }));
    h = push(h, patchLayer(h.present, id, { x: 300 }));
    const at = (s) => s.layers.find((l) => l.id === id).x;
    assert.equal(at(h.present), 300);
    h = undo(h); h = undo(h);
    assert.equal(at(h.present), 100, "two undos should walk back two edits");
    h = redo(h);
    assert.equal(at(h.present), 200, "redo should walk forward one");
    assert.ok(canUndo(h) && canRedo(h));
  });

  test("typing in one field is ONE undo step", () => {
    let h = initHistory(emptyCanvas());
    const doc0 = h.present;
    h = push(h, { ...doc0, layers: [{ id: "t", kind: "text", x: 0, y: 0, w: 1, h: 1, content: "R" }] }, "t:content");
    h = push(h, { ...h.present, layers: [{ ...h.present.layers[0], content: "Ro" }] }, "t:content");
    h = push(h, { ...h.present, layers: [{ ...h.present.layers[0], content: "Rol" }] }, "t:content");
    h = undo(h);
    assert.equal(h.present.layers.length, 0, "a word typed letter by letter should be one undo");
  });

  test("a fresh scene restarts the stack — undo cannot cross into another design", () => {
    let h = initHistory(buildPremade("ig_post", SENTINEL));
    h = push(h, patchLayer(h.present, h.present.layers[0].id, { x: 9 }));
    h = initHistory(buildPremade("business_card", SENTINEL));
    assert.equal(canUndo(h), false);
    assert.equal(h.present.width, 1050);
  });

  test("resizing keeps a full-bleed band full bleed", () => {
    const scene = buildPremade("ig_post", SENTINEL);
    const wide = scene.layers.find((l) => l.w >= scene.width * 0.98);
    const after = smartResize(scene, 1080, 1920);
    assert.equal(after.width, 1080);
    assert.equal(after.height, 1920);
    const moved = after.layers[scene.layers.indexOf(wide)];
    assert.equal(moved.w, 1080, "a band that spanned the design should still span it");
  });

  test("make-it-readable picks ink against what is behind it, not at random", () => {
    const dark = {
      ...emptyCanvas(1000, 1000),
      layers: [
        { id: "bg", kind: "shape", shape: "rect", x: 0, y: 0, w: 1000, h: 1000, fill: "#101010", visible: true },
        { id: "t", kind: "text", x: 100, y: 400, w: 800, h: 100, content: "hi", color: "#111111", visible: true },
      ],
    };
    assert.equal(fixTextContrast(dark, "t").layers[1].color, "#FFFFFF");
    const light = { ...dark, layers: [{ ...dark.layers[0], fill: "#FAFAFA" }, dark.layers[1]] };
    assert.equal(fixTextContrast(light, "t").layers[1].color, "#111827");
  });
});

describe("any font we carry, brand fonts first", () => {
  test("the business's two faces sort to the top and are labelled as theirs", () => {
    const opts = fontOptions("Playfair Display, Georgia, serif", "Inter, Helvetica, Arial, sans-serif");
    assert.equal(opts[0].brand, "heading");
    assert.equal(opts[1].brand, "body");
    assert.equal(familyOf(opts[0].stack), "Playfair Display");
  });

  test("brand-first is a SORT ORDER, not a restriction — Q4", () => {
    const opts = fontOptions("Poppins, Inter, sans-serif", "Poppins, Inter, sans-serif");
    assert.equal(opts.length, STUDIO_FONTS.length, "every face we carry stays pickable");
    // Acceptance row (c): a NON-brand face is in the list and can be chosen.
    assert.ok(opts.some((f) => !f.brand && f.label === "Bebas Neue"));
  });

  test("a brand face we do not carry is still offered, and says so", () => {
    const opts = fontOptions("Comic Neue, cursive", null);
    const theirs = opts.find((f) => f.brand === "heading");
    assert.equal(theirs.label, "Comic Neue");
    assert.equal(theirs.export_safe, false, "a face we cannot rasterise must not claim it downloads");
  });
});

describe("the export path", () => {
  const canvas = read("builder/adapters/mybrand/PixelCanvas.tsx");
  const studio = read("builder/adapters/mybrand/StudioBuilder.tsx");

  test("one filename rule, and it cannot produce a path", () => {
    assert.equal(exportFilename("Spring sale!", "png"), "Spring_sale.png");
    assert.equal(exportFilename("", "svg"), "design.svg");
    assert.equal(exportFilename(null, "jpg"), "design.jpg");
    assert.equal(exportFilename("../../etc/passwd", "png"), ".._.._etc_passwd.png");
    assert.doesNotMatch(exportFilename("a/b\\c", "png"), /[/\\]/);
  });

  test("the canvas renders at 1:1 whatever the zoom is", () => {
    // Without this the download is whatever fraction the design was displayed
    // at, which is the classic "my logo came out 340px wide" bug.
    assert.match(canvas, /const withFullSize[\s\S]{0,400}c\.setZoom\(1\)/);
    assert.match(canvas, /toDataURL: \(format\) => withFullSize/);
    assert.match(canvas, /toSVG: \(\) => withFullSize/);
  });

  test("ONE place sizes the canvas element, and it is not the painter", () => {
    // The 2026-09-16 walk defect: the painter also set the element to 1:1, so
    // after any edit that was not a zoom the <canvas> was 1080px wide while the
    // design drawn on it was 648px. It overflowed its own paper and every click
    // near the middle of the page selected the wrong layer — or nothing.
    const painter = canvas.slice(canvas.indexOf("const render = useCallback"), canvas.indexOf("useEffect(() => { render(doc); }"));
    assert.doesNotMatch(painter, /setDimensions/,
      "the painter must not size the element — the zoom effect owns that");
    // The zoom effect, and the export's temporary 1:1, are the only two.
    const sizers = (canvas.match(/c\.setDimensions\(/g) || []).length;
    assert.equal(sizers, 3, "expected exactly the zoom effect (1) and the export's set+restore (2)");
    assert.match(canvas, /c\.setDimensions\(\{ width: doc\.width \* zoom, height: doc\.height \* zoom \}\)/);
  });

  test("a see-through design does not composite onto black as a JPG", () => {
    assert.match(canvas, /format === "jpg" && isTransparent\(doc\)[\s\S]{0,60}backgroundColor = "#FFFFFF"/);
  });

  test("three downloads, one library export, and a hand-off to the composer", () => {
    for (const format of ['exportLocal("png")', 'exportLocal("jpg")', 'exportLocal("svg")']) {
      assert.ok(studio.includes(format), `the export picker has no ${format}`);
    }
    assert.match(studio, /my_brand_assets\?focus=/, "no Media Library export");
    assert.match(studio, /my_brand_compose\?asset_ids=/, "no hand-off to the social composer");
    assert.match(studio, /Use in a post/);
  });

  test("saving as a template posts to the route LUMEN now has", () => {
    assert.match(studio, /post<TemplateDto>\("\/api\/v1\/my-brand\/templates",/);
    assert.match(studio, /await loadTemplates\(\)/, "a saved template must show up in the gallery without a reload");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   5. The PDF export — §14.6's one gap, closed
   ══════════════════════════════════════════════════════════════════════════ */

describe("the PDF export", () => {
  const studio = read("builder/adapters/mybrand/StudioBuilder.tsx");
  const pdfSrc = read("builder/adapters/mybrand/pdf.ts");

  /** A tiny picture whose bytes are recognisable on the way back out. */
  function swatch(w, h) {
    const rgb = new Uint8Array(w * h * 3);
    for (let i = 0; i < rgb.length; i++) rgb[i] = (i * 7) % 251;
    return rgb;
  }

  const FIXED = new Date(Date.UTC(2026, 8, 16, 12, 0, 0));

  test("an artboard's pixels become a page in POINTS, at 96 dpi", () => {
    // 1 px = 1/96 in, 1 pt = 1/72 in. An Instagram square is 11.25 in of paper.
    assert.deepEqual(pdfPageSize({ width: 1080, height: 1080 }), {
      widthPt: 810, heightPt: 810, dpi: 96, label: "11.25 × 11.25 in",
    });
    assert.deepEqual(pdfPageSize({ width: 1200, height: 630 }), {
      widthPt: 900, heightPt: 472.5, dpi: 96, label: "12.5 × 6.56 in",
    });
    // A size nobody preset still gets a real page rather than a default.
    assert.deepEqual(pdfPageSize({ width: 500, height: 250 }), {
      widthPt: 375, heightPt: 187.5, dpi: 96, label: "5.21 × 2.6 in",
    });
  });

  test("the two presets that are PAPER print at their real paper size", () => {
    // The defect this exists to stop: a "Flyer (Letter)" coming out of the
    // studio 13.3 in wide because 1275 px was divided by 96 like a screen.
    assert.deepEqual(pdfPageSize({ width: 1275, height: 1650 }), {
      widthPt: 612, heightPt: 792, dpi: 150, label: "8.5 × 11 in (Letter)",
    });
    assert.deepEqual(pdfPageSize({ width: 1050, height: 600 }), {
      widthPt: 252, heightPt: 144, dpi: 300, label: "3.5 × 2 in (Business card)",
    });
  });

  test("the inches and the pixels describe the SAME rectangle", () => {
    // PRINT_INCHES is keyed by preset key, so the two facts live apart. If a
    // preset's pixels are ever re-cut without its inches, this is what says so.
    for (const [key, physical] of Object.entries(PRINT_INCHES)) {
      const preset = SIZE_PRESETS.find((p) => p.key === key);
      assert.ok(preset, `PRINT_INCHES names ${key}, which is not a size preset`);
      const [inW, inH] = physical.inches;
      const dpiW = preset.w / inW;
      const dpiH = preset.h / inH;
      assert.equal(dpiW, dpiH, `${key} is ${dpiW} dpi across and ${dpiH} dpi down — one of the two is wrong`);
      assert.ok(Number.isInteger(dpiW) && dpiW >= 150, `${key} would print at ${dpiW} dpi`);
    }
  });

  test("the filename and the type come from the same two rules as PNG", () => {
    assert.equal(exportFilename("Spring sale!", "pdf"), "Spring_sale.pdf");
    assert.equal(exportFilename(null, "pdf"), "design.pdf");
    assert.equal(PDF_MIME, "application/pdf");
  });

  test("what comes out is a PDF a reader will open", async () => {
    const rgb = swatch(4, 3);
    const bytes = await buildImagePdf({
      rgb, pixelWidth: 4, pixelHeight: 3,
      pageWidthPt: 612, pageHeightPt: 792, title: "Spring sale", createdAt: FIXED,
    });
    const buf = Buffer.from(bytes);
    const text = buf.toString("latin1");

    assert.equal(text.slice(0, 5), "%PDF-", "a PDF starts with %PDF-");
    assert.ok(text.trimEnd().endsWith("%%EOF"), "a PDF ends with %%EOF");
    assert.match(text, /\/MediaBox \[0 0 612 792\]/, "the page is not the size it was asked for");
    assert.match(text, /\/Type \/Pages \/Kids \[3 0 R\] \/Count 1/, "one page, not two");
    assert.match(text, /\/Width 4 \/Height 3 \/ColorSpace \/DeviceRGB \/BitsPerComponent 8/);
    assert.match(text, /612 0 0 792 0 0 cm\n\/Im0 Do/, "the picture must fill the page exactly");
    assert.match(text, /\/Title \(Spring sale\)/);
  });

  test("the picture inside the PDF is the picture that went in, byte for byte", async () => {
    // FlateDecode is zlib, which is what CompressionStream("deflate") makes.
    // If that ever becomes raw deflate the file opens and the image is missing.
    const rgb = swatch(8, 5);
    const bytes = await buildImagePdf({
      rgb, pixelWidth: 8, pixelHeight: 5, pageWidthPt: 100, pageHeightPt: 62.5, createdAt: FIXED,
    });
    const buf = Buffer.from(bytes);
    const text = buf.toString("latin1");

    const objAt = text.indexOf("4 0 obj");
    const streamAt = text.indexOf("stream\n", objAt) + "stream\n".length;
    const length = Number(/\/Length (\d+)/.exec(text.slice(objAt, streamAt))[1]);
    const packed = buf.subarray(streamAt, streamAt + length);

    assert.deepEqual(new Uint8Array(zlib.inflateSync(packed)), rgb);
    assert.equal(text.slice(streamAt + length, streamAt + length + 10), "\nendstream");
  });

  test("the xref really points at the objects", async () => {
    // A PDF with a wrong xref opens in a browser and fails in a print shop's
    // RIP, which is the worst possible place to find out.
    const bytes = await buildImagePdf({
      rgb: swatch(2, 2), pixelWidth: 2, pixelHeight: 2,
      pageWidthPt: 144, pageHeightPt: 144, createdAt: FIXED,
    });
    const text = Buffer.from(bytes).toString("latin1");

    const startxref = Number(/startxref\n(\d+)/.exec(text)[1]);
    assert.equal(text.slice(startxref, startxref + 4), "xref", "startxref does not land on the table");

    const offsets = [...text.slice(startxref).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
    assert.equal(offsets.length, 6, "six objects, six entries");
    offsets.forEach((off, i) => {
      assert.ok(text.startsWith(`${i + 1} 0 obj`, off), `the xref sends a reader to the wrong place for object ${i + 1}`);
    });
    assert.match(text, /\/Size 7 \/Root 1 0 R/);
  });

  test("it refuses to write a file that is not the picture", async () => {
    // Half a buffer makes a PDF that OPENS, shows a torn image and blames the
    // printer. Saying no is the whole guard.
    await assert.rejects(
      () => buildImagePdf({ rgb: new Uint8Array(10), pixelWidth: 4, pixelHeight: 3, pageWidthPt: 72, pageHeightPt: 72 }),
      /10 bytes where a 4×3 page needs 36/,
    );
    await assert.rejects(
      () => buildImagePdf({ rgb: new Uint8Array(0), pixelWidth: 0, pixelHeight: 0, pageWidthPt: 72, pageHeightPt: 72 }),
      /no size to print/,
    );
    await assert.rejects(
      () => buildImagePdf({ rgb: swatch(2, 2), pixelWidth: 2, pixelHeight: 2, pageWidthPt: 0, pageHeightPt: 72 }),
      /no size/,
    );
  });

  test("no new dependency — pdf.ts imports nothing but its neighbour", () => {
    // §14.6 said a PDF needs a library. It does not: this file is the whole of
    // it. A future `import PDFDocument from "pdfkit"` in here is caught by this.
    const imports = [...pdfSrc.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(imports)], ["./scene"]);
    assert.doesNotMatch(pdfSrc, /\bfetch\(/, "a download must not need the network");
  });

  test("the PDF goes out through the SAME download helper as the PNG", () => {
    assert.ok(studio.includes('exportLocal("pdf")'), "the export picker has no PDF");
    assert.match(studio, /title="Download PDF"/);
    // One anchor, one place: a second download path is how two formats end up
    // with two different filename rules.
    assert.equal((studio.match(/document\.createElement\("a"\)/g) || []).length, 1);
    assert.match(studio, /download\(href, exportFilename\(designName, "pdf"\)\)/);
    assert.match(studio, /revokeObjectURL/, "a blob URL that is never freed leaks the whole picture");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   The replacement really is a replacement
   ══════════════════════════════════════════════════════════════════════════ */

describe("replace means delete", () => {
  test("the old 3,249-line editor modal is gone from the tree", () => {
    assert.throws(() => read("components/myBrand/TemplateStudioEditorModal.tsx"),
      "the old Template Studio modal must be deleted, not left beside its replacement");
  });

  test("nothing imports it any more", () => {
    function walk(dir, out = []) {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules") continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
      }
      return out;
    }
    const offenders = walk(SRC)
      .filter((f) => /from ["'][^"']*TemplateStudioEditorModal["']/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(SRC, f));
    assert.deepEqual(offenders, []);
  });

  test("the route and the entry points stay", () => {
    const page = read("pages/myBrand/TemplateStudioPage.tsx");
    assert.match(page, /export function TemplateStudioPage/);
    assert.match(page, /<StudioBuilder/);
    assert.match(page, /New design/);
    // The library page still lists what the business has made.
    assert.match(page, /\/api\/v1\/my-brand\/designs\?limit=50/);
  });

  test("the purpose picker it duplicated is gone with it", () => {
    // The header comment SAYS why it went, so the code is read without the
    // comments — the same rule test/brand-kit.test.mjs uses for its grep.
    const page = read("pages/myBrand/TemplateStudioPage.tsx")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ 	]*\/\/.*$/gm, "");
    assert.doesNotMatch(page, /const PURPOSES/, "two front doors asking 'what are you making?' is the duplication");
    assert.doesNotMatch(page, /What are you making\?/);
    assert.doesNotMatch(page, /templateKinds/);
  });
});

describe("every button in the studio carries a tooltip — SD-010", () => {
  // Acceptance row (f). A button with no `title` is the row that fails a walk,
  // and it is the easiest thing in the world to add one without.
  const stripComments = (t) =>
    t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^[ \t]*\/\/.*$/gm, "");

  /**
   * The opening tag of every <button>, in full.
   *
   * A lazy /<button[\s\S]*?>/ stops at the first ">" it meets, which in JSX is
   * the arrow of `onClick={() =>` — so it reads EVERY button as untitled and
   * the check is worthless while looking rigorous. This walks to the ">" that
   * actually closes the tag, counting braces so a ">" inside an expression
   * cannot end it.
   */
  function openingTags(code, tag = "button") {
    const out = [];
    const open = `<${tag}`;
    let i = code.indexOf(open);
    while (i !== -1) {
      let depth = 0;
      let j = i + open.length;
      for (; j < code.length; j++) {
        const c = code[j];
        if (c === "{") depth++;
        else if (c === "}") depth--;
        else if (c === ">" && depth === 0) break;
      }
      out.push(code.slice(i, j + 1));
      i = code.indexOf(open, j);
    }
    return out;
  }

  test("the scanner reads a whole JSX tag, not up to the first arrow", () => {
    // Mutation-proofing the checker itself: this is the bug the lazy regex had.
    const [tag] = openingTags('<button type="button" onClick={() => go()} title="x">');
    assert.match(tag, /title="x"/);
    assert.equal(openingTags('<button onClick={() => a()}>').length, 1);
  });

  for (const f of studioFiles.filter((x) => x.name.endsWith(".tsx"))) {
    test(`${f.name}: no <button> without a title`, () => {
      const code = stripComments(f.code);
      const buttons = openingTags(code);
      const naked = buttons.filter((b) => !/\btitle=/.test(b));
      assert.deepEqual(naked.map((b) => b.replace(/\s+/g, " ").slice(0, 90)), [],
        `${f.name} has ${naked.length} button(s) with no tooltip`);
    });
  }

  test("the studio's FOOTER buttons carry one too — they are the committing ones", () => {
    // The scanner above only sees <button>; the footer is IadmButton, which had
    // no way to take a tooltip until 2026-09-16. "Use in a post" and "Save as a
    // template" both do something a person cannot undo by looking at the word.
    const studio = read("builder/adapters/mybrand/StudioBuilder.tsx");
    const footer = studio.slice(studio.indexOf("footer={"), studio.indexOf("pane={"));
    // Same scanner: an IadmButton's tag carries icon={<Download ... />}, so a
    // ">"-terminated regex would cut it off before the tooltip.
    const buttons = openingTags(footer, "IadmButton");
    assert.ok(buttons.length >= 5, `expected the whole footer, found ${buttons.length} button(s)`);
    const naked = buttons.filter((b) => !/\stitle=/.test(b));
    assert.deepEqual(naked, [], "a footer button with no tooltip");
    assert.match(read("components/IadmModal.tsx"), /title\?: string;/);
  });

  test("the shared frame's undo and redo say what they do and how", () => {
    const frame = read("builder/BuilderFrame.tsx");
    assert.match(frame, /title="Undo \(Ctrl\+Z\)"/);
    assert.match(frame, /title="Redo \(Ctrl\+Shift\+Z\)"/);
  });

  test("the inspector's swatches name the colour they are", () => {
    const swatches = brandSwatches(SENTINEL);
    assert.equal(swatches.length, 5, "the kit carries five slots; the inspector must show five");
    for (const s of swatches) {
      assert.match(s.label, /^Your /);
      assert.ok(SENTINEL_SET.has(s.colour.toUpperCase()));
    }
    assert.match(read("builder/adapters/mybrand/LayerInspector.tsx"), /title=\{`\$\{s\.label\} — \$\{s\.colour\}`\}/);
  });

  test("a custom hex is typeable, not just pickable", () => {
    // Acceptance row (c) types a hex rather than driving an OS colour dialog.
    assert.match(read("builder/adapters/mybrand/LayerInspector.tsx"), /data-colour-hex/);
  });
});
