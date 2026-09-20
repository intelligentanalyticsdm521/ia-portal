// test/families-container.test.mjs — the container family keeps its contract.
//
// B-168 section C.1. This file is the family's OWN test and belongs to the
// agent building the family. What was here from the first commit is the
// contract EVERY family keeps:
//
//   · every def has a renderer and every renderer has a def;
//   · every def names builders, out of the offer file's five;
//   · every def is IN THE OFFER for every builder it claims (D-168);
//   · nothing ships with a `requires` gate — Brandon decides the tiers in
//     October and that must then be a change to DATA, not a rebuild.
//
// What the F0 build adds is the CONTAINER's own half: the panel is the
// reference editor's, key for key, and everything an author can set reaches
// the canvas. `families/container/controls.ts` is the one table those claims
// are made in; this pins it against the machine file.
//
// ── MUTATION CHECKS: each was RUN, seen red, and restored (2026-09-19) ─────
// Every one below was made to fail by editing the real function and running
// this file, not by reading it.
//
//  1. `controls.ts`: change `flex_justify_content` to `flex_justify` →
//     "every settings key the panel names is a real control" goes red naming
//     the key. Restored.
//  2. `style.ts readLayer`: drop the `overflow` line → "every field the table
//     names is a field the reader keeps" goes red naming `overflow`.
//     Restored.
//  3. `style.ts containerLayoutDeclarations`: emit `gap:` from `layer.gap`
//     alone, ignoring `rowGap` → "the two gaps are two numbers" goes red.
//     Restored.
//  4. `style.ts styleBlockFor`: delete the hide-on-desktop restore branch →
//     "hiding a box on a computer leaves it on a phone" goes red. Restored.
//  5. `style.ts customCssFor`: stop neutering `</style` → "an author's CSS
//     cannot close the style block" goes red. Restored.
//  6. `style.ts readShape`: return `s` instead of `s.shape ? s : undefined` →
//     "a divider with no shape is not a divider" goes red. Restored.
//  7. `style.ts SHAPE_PATHS`: give `tilt` the same path as
//     `triangle-asymmetrical` → "all eighteen shapes draw, and none of them is
//     another one" goes red naming `tilt`. Restored.
//  8. `style.ts cssUrl`: stop stripping quotes and brackets → "an address with
//     a bracket or a quote in it cannot break out of url()" goes red.
//     Restored.
//
// All eight were driven by `scratchpad/mutate.mjs`, which edits the real file,
// runs this test, prints RED or GREEN and puts the file back — and then runs
// it once more to prove the restore. Eight RED, restored green.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { FAMILY } from "../src/builder/widgets/families/container/index.ts";
import {
  CONTAINER_CONTROLS, CONTAINER_LAYOUT_CONTROLS, CONTAINER_STYLE_CONTROLS,
  CONTAINER_ADVANCED_CONTROLS, containerSectionsFor, containerSettingsKey,
} from "../src/builder/widgets/families/container/controls.ts";
import {
  backgroundDeclarations, containerBoxDeclarations, containerLayoutDeclarations,
  customCssFor, overlayDeclarations, readStyle, resolveStyle, shapeDividerHtml,
  stickyDeclarations, styleBlockFor, SHAPE_DIVIDERS,
} from "../src/builder/style.ts";
import { containerLayout, makeContext, renderDocument } from "../src/builder/render.ts";
import { makeContainer } from "../src/builder/treeOps.ts";
import { LAYOUT_PRESETS, presetFor, INNER_SECTION_PRESET_KIND } from "../src/builder/registry.ts";
import { assertFamilyContract } from "./helpers/familyContract.mjs";

const KEYS = JSON.parse(readFileSync(new URL("./fixtures/WIDGET_SETTINGS_KEYS.json", import.meta.url), "utf8"));
const CONTAINER_KEYS = new Set(KEYS.widgets.container.keys);

test("container: the family exports the one shape families/index.ts collects", () => {
  assert.ok(Array.isArray(FAMILY.defs), "defs is an array");
  assert.equal(typeof FAMILY.renderers, "object", "renderers is a map");
});

test("container: every widget it declares keeps the contract", () => {
  assertFamilyContract("container", FAMILY);
});

test("the family declares no widget of its own, on purpose", () => {
  // A container is the ENGINE's node: its tile is a `registry` layout preset
  // and its renderer is `render.renderContainer`, which runs before any family
  // is asked. A def here would be a second Container. The folder's index says
  // so in words; this says it in a test, so a future agent who adds one is
  // told why rather than left to find out.
  assert.deepEqual(FAMILY.defs, []);
  assert.deepEqual(Object.keys(FAMILY.renderers), []);
});

/* ══════════════════════════════════════════════════════════════════════════
   1. The panel is the reference editor's, key for key
   ══════════════════════════════════════════════════════════════════════════ */

describe("the container's panel is Elementor's own", () => {
  test("every settings key the panel names is a real control of its container", () => {
    // MUTATION 1. An invented key is dropped SILENTLY by the page engine on
    // publish, so the author's change does nothing on the live page and
    // nothing anywhere says a word. This is the guard.
    for (const c of CONTAINER_CONTROLS) {
      assert.ok(CONTAINER_KEYS.has(c.settings),
        `the panel offers \`${c.settings}\` (${c.label}) and Elementor's container has no such control`);
    }
  });

  test("a per-device key is spelled the way Elementor spells it", () => {
    for (const c of CONTAINER_CONTROLS) {
      if (!c.responsive) {
        assert.equal(containerSettingsKey(c, "phone"), c.settings,
          `${c.settings} is not per device, so it has one key on every screen`);
        continue;
      }
      assert.equal(containerSettingsKey(c, "tablet"), `${c.settings}_tablet`);
      assert.equal(containerSettingsKey(c, "phone"), `${c.settings}_mobile`);
      assert.ok(CONTAINER_KEYS.has(`${c.settings}_tablet`),
        `${c.settings} is marked per device and Elementor has no \`${c.settings}_tablet\``);
    }
  });

  test("the three tabs carry the reference's own section headings, in its order", () => {
    // Read off a live Elementor 4.2.4 on 2026-09-19 and off the machine
    // catalogue's `elements.container.sections`, which agree to the letter.
    assert.deepEqual(containerSectionsFor("layout"), ["Container", "Items", "Additional Options"]);
    assert.deepEqual(containerSectionsFor("style"),
      ["Background", "Background Overlay", "Border", "Shape Divider"]);
    assert.deepEqual(containerSectionsFor("advanced"),
      ["Layout", "Motion Effects", "Responsive", "Custom CSS"]);
  });

  test("every option the panel offers is one Elementor offers", () => {
    const CATALOGUE = JSON.parse(readFileSync(
      new URL("./fixtures/elementor-widget-names.json", import.meta.url), "utf8"));
    // The names fixture has no container options, so the assertion that CAN be
    // made here is the one that matters: a closed list, and every value in it
    // is a CSS or Elementor word, never free text. The VALUES are pinned
    // against the machine file on the arion side, where they are published
    // (test/website-container-controls.test.mjs).
    assert.ok(CATALOGUE, "the widget-name fixture is missing");
    for (const c of CONTAINER_CONTROLS) {
      if (!c.options) continue;
      assert.ok(c.options.length, `${c.settings} declares an empty option list`);
      for (const o of c.options) {
        assert.equal(typeof o, "string", `${c.settings} offers a value that is not a word`);
      }
    }
  });

  test("the panel draws every control the table names", () => {
    /* The table is data; this is the half that says the panel reads it.
       THE PANEL IS TWO FILES (B-168 land, the b168/demo merge). The box's
       LAYOUT tab is written out in Inspector.tsx, where THE SCREEN LAW pins
       every row of it by name; its Style and Advanced tabs are the shared
       groups in StyleGroups.tsx. The dead second copy of the Layout tab —
       `ContainerLayoutGroup` — is deleted, so this reads both files rather
       than the one the copy happened to live in. Same sections, same guard.
       And "Items" is a SUB-heading inside the Container section, which is
       where the reference puts it, so either shape counts. */
    const GROUPS = [
      readFileSync(new URL("../src/builder/StyleGroups.tsx", import.meta.url), "utf8"),
      readFileSync(new URL("../src/builder/Inspector.tsx", import.meta.url), "utf8"),
    ].join("\n");
    for (const title of [
      "Container", "Items", "Additional Options",
      "Background", "Background Overlay", "Border", "Shape Divider",
      "Motion Effects", "Custom CSS", "Responsive", "Layout",
    ]) {
      assert.ok(GROUPS.includes(`title="${title}"`)
        || GROUPS.includes(`data-control-subheading="${title}"`), `no group is called ${title}`);
    }
    assert.equal(CONTAINER_LAYOUT_CONTROLS.length, 15);
    assert.equal(CONTAINER_STYLE_CONTROLS.length, 38);
    assert.equal(CONTAINER_ADVANCED_CONTROLS.length, 15);
  });

  test("every field the table names is a field the reader keeps", () => {
    // MUTATION 2. A control that writes a key `readStyle` drops is a control
    // that works until the document is saved and opened again — the worst kind,
    // because the author watches it work. Driven through the REAL reader.
    const sample = {
      contentWidth: "full", width: 900, minHeight: 200, direction: "row-reverse",
      justify: "evenly", alignItems: "center", gap: 12, rowGap: 6, wrap: true,
      columns: 4, rows: 2, autoFlow: "column", overflow: "hidden",
      background: {
        type: "classic", color: "#123456", colorB: "#654321", gradient: "linear", angle: 90,
        image: "https://x/y.png", position: "top center", repeat: "repeat", size: "contain",
        videoUrl: "https://v/film.mp4", images: ["https://a.png"],
      },
      overlay: {
        type: "gradient", color: "#000000", colorB: "#ffffff", gradient: "radial", angle: 30,
        image: "https://x/o.png", opacity: 0.4, blend: "multiply",
      },
      shapeTop: { shape: "waves", color: "#eeeeee", height: 80, width: 120, flip: true, invert: true, aboveContent: true },
      shapeBottom: { shape: "tilt", color: "#dddddd", height: 40, width: 100, flip: true, invert: true, aboveContent: true },
      alignSelf: "end", order: 3, selfWidth: 48, position: "absolute", zIndex: 5,
      margin: { top: 1, right: 2, bottom: 3, left: 4 },
      padding: { top: 5, right: 6, bottom: 7, left: 8 },
      border: { style: "dashed", width: 2, color: "#cccccc" }, radius: 9, shadow: "strong",
      hidden: true,
      cssId: "prices", cssClasses: "tight two-up",
      customCss: "selector { color: red }",
      sticky: "top", stickyOn: ["desktop", "phone"], stickyOffset: 12,
    };
    const read = readStyle(sample);
    for (const c of CONTAINER_CONTROLS) {
      const [head, tail] = c.field.split(".");
      if (head === "props" || head === "tablet" || head === "phone") continue;
      const held = tail ? read?.[head]?.[tail] : read?.[head];
      assert.notEqual(held, undefined,
        `\`${c.field}\` (${c.label}) does not survive readStyle — the control would work until the document is reopened`);
    }
  });

  test("a word Elementor does not offer never reaches a customer's page", () => {
    const junk = readStyle({
      direction: "sideways", justify: "middle", alignItems: "nowhere", contentWidth: "wide",
      autoFlow: "diagonal", overflow: "scroll", position: "everywhere",
      background: { type: "hologram" }, overlay: { blend: "sparkle" },
      shapeTop: { shape: "unicorn" }, sticky: "middle",
    });
    assert.equal(junk, undefined, "a style of nothing but junk came back as a style");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2. What the author sets, the canvas draws
   ══════════════════════════════════════════════════════════════════════════ */

describe("what an author sets on a box reaches the page", () => {
  test("the four directions, and the two reverses run the way they read", () => {
    for (const [dir, css] of [
      ["row", "flex-direction:row"],
      ["row-reverse", "flex-direction:row-reverse"], ["column-reverse", "flex-direction:column-reverse"],
    ]) {
      assert.ok(containerLayoutDeclarations({ direction: dir }).includes(css), dir);
    }
    /* A PLAIN COLUMN EMITS NOTHING, and that is deliberate and old: a stacked
       block is what the page already does, so saying `display:flex` for it
       would change the spacing of every document written before boxes had a
       direction at all. */
    assert.deepEqual(containerLayoutDeclarations({ direction: "column" }), []);
    // …and a surface that cannot reverse still draws the box the right way.
    const box = makeContainer({ direction: "row-reverse" }, []);
    assert.equal(containerLayout(box).direction, "row");
    assert.equal(containerLayout(box).reverse, true);
  });

  test("the two gaps are two numbers, and the chain is one key", () => {
    // MUTATION 3. `rowGap` absent is the LINKED chain — one number for both,
    // which is what the one stored key always meant, so every document written
    // before the row half existed reads exactly as it did.
    assert.ok(containerLayoutDeclarations({ direction: "row", gap: 20 }).includes("gap:20px"));
    assert.ok(containerLayoutDeclarations({ direction: "row", gap: 20, rowGap: 8 }).includes("gap:8px 20px"));
    assert.equal(containerLayout(makeContainer({ gap: 20 }, [])).gap.row, 20);
    assert.equal(containerLayout(makeContainer({ gap: 20, rowGap: 8 }, [])).gap.row, 8);
  });

  test("a grid says how many rows and which way it fills", () => {
    const d = containerLayoutDeclarations({ direction: "grid", columns: 4, rows: 2, autoFlow: "column" });
    assert.ok(d.includes("grid-template-columns:repeat(4,minmax(0,1fr))"));
    assert.ok(d.includes("grid-template-rows:repeat(2,minmax(0,auto))"));
    assert.ok(d.includes("grid-auto-flow:column"));
    // A flex box says neither — a declaration a browser throws away is a line
    // the next reader has to wonder about.
    const flex = containerLayoutDeclarations({ direction: "row", rows: 2, autoFlow: "column" });
    assert.equal(flex.some((x) => x.startsWith("grid-")), false);
  });

  test("content width, width, overflow, position and how the box sits", () => {
    const d = containerBoxDeclarations({
      contentWidth: "full", width: 80, overflow: "auto", position: "fixed", zIndex: 4,
      alignSelf: "center", order: 2, selfWidth: 48,
    });
    assert.ok(d.includes("width:80%"), "a full-width box measures in per cent");
    assert.ok(d.includes("overflow:auto"));
    /* AND ONLY HERE (B-168 land, the b168/demo merge): both branches wrote
       Overflow, in two functions `styleBlockFor` concatenates for the same
       box. This one emits for a plain stacked box too, so it is the one that
       survived — a second `overflow:` was one declaration pretending to be
       two. */
    assert.ok(containerBoxDeclarations({ overflow: "hidden" }).includes("overflow:hidden"));
    assert.ok(!containerLayoutDeclarations({ direction: "row", overflow: "auto" })
      .some((x) => x.startsWith("overflow:")), "overflow is written twice again");
    assert.ok(d.includes("position:fixed"));
    assert.ok(d.includes("z-index:4"));
    assert.ok(d.includes("align-self:center"));
    assert.ok(d.includes("order:2"));
    assert.ok(d.includes("flex-basis:48%"), "how a box sits in its parent is its OWN key");
    // …and a BOXED box measures the same control in pixels, which is the
    // reference's own behaviour: it swaps `boxed_width` for `width`.
    assert.ok(containerBoxDeclarations({ width: 1140 }).includes("max-width:1140px"));
  });

  test("the four backgrounds draw as much as CSS can carry", () => {
    assert.ok(backgroundDeclarations({ type: "classic", color: "#fff" }).includes("background-color:#fff"));
    assert.ok(backgroundDeclarations({ type: "gradient", color: "#000", colorB: "#fff", angle: 45 })
      .some((d) => d.includes("linear-gradient(45deg, #000 0%, #fff 100%)")));
    assert.ok(backgroundDeclarations({ type: "gradient", gradient: "radial", color: "#000", colorB: "#fff" })
      .some((d) => d.includes("radial-gradient")));
    // A FILM draws its still picture; a SLIDESHOW draws its first picture.
    // Neither is CSS, and drawing nothing would be a control that looks broken.
    assert.ok(backgroundDeclarations({ type: "video", videoUrl: "https://v", image: "https://p.png" })
      .some((d) => d.includes('url("https://p.png")')));
    assert.ok(backgroundDeclarations({ type: "slideshow", images: ["https://a.png", "https://b.png"] })
      .some((d) => d.includes('url("https://a.png")')));
    assert.deepEqual(backgroundDeclarations(undefined), []);
  });

  test("an address with a bracket or a quote in it cannot break out of url()", () => {
    const d = backgroundDeclarations({ type: "classic", image: 'a.png") ; background: url("evil' });
    const url = d.find((x) => x.startsWith("background-image"));
    assert.ok(url, "no picture was drawn at all");
    const inside = url.slice(url.indexOf('"') + 1, url.lastIndexOf('"'));
    assert.equal(/["'()\s]/.test(inside), false,
      `an address kept a character that can close url(): ${inside}`);
    assert.equal(url.endsWith('")'), true, "the declaration is not one quoted address");
  });

  test("an overlay is a ::before on the box, with its opacity and blend", () => {
    const d = overlayDeclarations({ type: "classic", color: "#000", opacity: 0.3, blend: "multiply" });
    assert.ok(d.includes('content:""'));
    assert.ok(d.includes("position:absolute"));
    assert.ok(d.includes("opacity:0.3"));
    assert.ok(d.includes("mix-blend-mode:multiply"));
    // …and a box that wears one becomes a positioning parent, or the overlay
    // would cover the whole page.
    assert.ok(containerBoxDeclarations({ overlay: { type: "classic", color: "#000" } }).includes("position:relative"));
  });

  test("all eighteen shapes draw, and none of them is another one", () => {
    const seen = new Set();
    for (const shape of SHAPE_DIVIDERS) {
      const html = shapeDividerHtml({ shape }, "top");
      assert.ok(html.includes("<svg"), `${shape} draws nothing`);
      const path = html.match(/ d="([^"]+)"/)[1];
      assert.equal(seen.has(path), false, `${shape} draws the same shape as another one`);
      seen.add(path);
    }
  });

  test("a divider with no shape is not a divider", () => {
    // MUTATION 6. A colour and a height with no shape would ride in every
    // document for ever and draw nothing.
    assert.equal(shapeDividerHtml({ color: "#fff", height: 40 }, "top"), "");
    assert.equal(readStyle({ shapeTop: { color: "#fff", height: 40 } }), undefined);
  });

  test("flip, invert and bring-to-front each change the markup", () => {
    const plain = shapeDividerHtml({ shape: "waves" }, "top");
    assert.equal(plain.includes("scaleX(-1)"), false);
    assert.ok(shapeDividerHtml({ shape: "waves", flip: true }, "top").includes("scaleX(-1)"));
    assert.ok(shapeDividerHtml({ shape: "waves", invert: true }, "top").includes("scaleY(-1)"));
    assert.ok(plain.includes("z-index:0"));
    assert.ok(shapeDividerHtml({ shape: "waves", aboveContent: true }, "top").includes("z-index:2"));
    // A bottom divider is the top one turned over — one set of paths, both ends.
    assert.ok(shapeDividerHtml({ shape: "waves" }, "bottom").includes("bottom:0"));
    assert.ok(shapeDividerHtml({ shape: "waves" }, "bottom").includes("scaleY(-1)"));
  });

  test("a shape divider reaches the page the customer opens", () => {
    const box = makeContainer({ shapeTop: { shape: "waves", color: "#ffffff" } }, [
      { id: "h1", kind: "heading", props: { text: "Hello" } },
    ]);
    const doc = {
      v: 2,
      settings: {},
      sections: [{
        id: "s1", label: "S", layout: 1, visibility: "customer",
        columns: [{ id: "c1", widgets: [box] }],
      }],
    };
    for (const mode of ["edit", "view"]) {
      const html = renderDocument(doc, makeContext(doc, { mode }));
      assert.ok(html.includes("bx-shape-top"), `no divider in ${mode} mode`);
      assert.ok(html.includes("Hello"), `the box lost its children in ${mode} mode`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   3. Per device, and the three Hide switches
   ══════════════════════════════════════════════════════════════════════════ */

describe("every value is per device, and hiding is per device too", () => {
  const block = (style) => styleBlockFor({
    sectionSelector: ".s", gridSelector: ".g", layout: 1,
    widgets: [{ selector: ".b", style, typographic: false, container: true }],
  });

  test("a phone override reaches the phone and leaves the desktop alone", () => {
    const css = block(readStyle({
      direction: "row", gap: 24,
      phone: { direction: "column", gap: 8 },
      tablet: { minHeight: 200 },
    }));
    assert.ok(css.includes("flex-direction:row"), "the desktop lost its row");
    assert.ok(css.includes("flex-direction:column !important"), "the phone did not become a column");
    assert.ok(css.includes("min-height:200px !important"), "the tablet's least height did not arrive");
  });

  test("hiding a box on a computer leaves it on a phone", () => {
    // MUTATION 4. The desktop rule has no query, so it reaches a phone too;
    // without the restore branch "hide on a computer" hid it everywhere and
    // the switch lied. Elementor's three switches are independent.
    const css = block(readStyle({ direction: "row", hidden: true }));
    assert.ok(css.includes("display:none"), "the computer was not hidden");
    assert.ok(css.includes("display:flex !important"), "the phone and the tablet were hidden too");
  });

  test("hiding it on a phone does not hide it on a computer", () => {
    const css = block(readStyle({ phone: { hidden: true } }));
    assert.equal(css.startsWith("display:none"), false);
    assert.ok(css.includes("display:none !important"));
  });

  test("sticky is answered once and told which screens it applies to", () => {
    assert.deepEqual(stickyDeclarations(readStyle({ sticky: "top", stickyOffset: 16 }), "desktop"),
      ["position:sticky", "top:16px", "z-index:10"]);
    assert.deepEqual(stickyDeclarations(readStyle({ sticky: "top", stickyOn: ["phone"] }), "desktop"), []);
    assert.ok(stickyDeclarations(readStyle({ sticky: "top", stickyOn: ["phone"] }), "phone").length);
    assert.deepEqual(stickyDeclarations(readStyle({}), "desktop"), []);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   4. Custom CSS — the author's own, and it cannot escape
   ══════════════════════════════════════════════════════════════════════════ */

describe("an author's own CSS", () => {
  test("`selector` means this box, and bare declarations are wrapped", () => {
    assert.equal(customCssFor({ customCss: "selector { color: red }" }, ".b"), ".b { color: red }");
    assert.equal(customCssFor({ customCss: "color: red" }, ".b"), ".b{color: red}");
    assert.equal(customCssFor({ customCss: "   " }, ".b"), "");
    assert.equal(customCssFor(undefined, ".b"), "");
  });

  test("an author's CSS cannot close the style block", () => {
    // MUTATION 5. This text goes inside a `<style>` on a page a stranger
    // opens. A closing tag in it ends the block and everything after it is
    // markup the author wrote — the whole of the injection.
    const out = customCssFor({ customCss: "color:red}</style><script>alert(1)</script>" }, ".b");
    assert.equal(/<\/\s*style/i.test(out), false, "an author's CSS closed the style block");
    assert.ok(out.includes("<\\/style"), "it was dropped rather than neutered");
  });

  test("it is last in the stylesheet, so the author's own rules win", () => {
    const css = styleBlockFor({
      sectionSelector: ".s", gridSelector: ".g", layout: 1,
      widgets: [{
        selector: ".b", typographic: false, container: true,
        style: readStyle({ direction: "row", customCss: "selector { display: block }" }),
      }],
    });
    assert.ok(css.indexOf("display: block") > css.indexOf("display:flex"));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   5. Inner Section is a Container preset
   ══════════════════════════════════════════════════════════════════════════ */

describe("Inner Section", () => {
  test("it inserts a row Container holding two Containers, and nothing else", () => {
    const preset = presetFor(INNER_SECTION_PRESET_KIND);
    assert.ok(preset, "the Inner Section tile has no preset, so it inserts a widget");
    assert.equal(preset.kind, "container");
    assert.equal(preset.style.direction, "row");
    assert.equal(preset.children.length, 2);
    // …and every other preset still brings none, so this changed one tile.
    assert.equal(LAYOUT_PRESETS.container.children, undefined);
    assert.equal(LAYOUT_PRESETS.grid.children, undefined);
  });

  test("what it inserts is a box the author can pull apart", () => {
    const preset = presetFor(INNER_SECTION_PRESET_KIND);
    const box = makeContainer(preset.style, preset.children.map((s) => makeContainer(s, [])));
    assert.equal(box.kind, "container");
    assert.equal(box.children.length, 2);
    for (const child of box.children) assert.equal(child.kind, "container");
    assert.equal(resolveStyle(box.style).direction, "row");
  });
});
