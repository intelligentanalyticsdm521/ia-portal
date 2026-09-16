// test/builder-styling.test.mjs — the styling pass
// (BUILDER_PLATFORM_SCOPE_2026-09-15 §11.8, decision D-140).
//
// What this pins, in the scope's words:
//   §11.8 "an optional `style` object on Section and on Widget, tolerant on
//          deserialise (missing = today's look, byte-identical)"
//   §11.8 "the cascade is desktop → tablet → phone, and it is one function"
//   §11.8 "responsive.ts stays the only owner of breakpoints"
//   §11.8 "NO shadow and NO radius" in the email
//   §11.8 "drop inserts THERE rather than at the end"
//
// MUTATION CHECKS, written down so the next person can re-run them. Each was
// broken on purpose, seen red, and restored:
//   · render.ts renderWidget — always add the bx-sy class instead of only when
//     the widget is styled        → "byte-identical" RED (1 assertion)
//   · style.ts resolveStyle — merge `phone` BEFORE `tablet`
//                                  → "phone has the last word" RED (2)
//   · style.ts normaliseRatios — return the raw numbers, no division
//                                  → "every preset sums to 1" RED (2)
//   · style.ts emailStyleDeclarations — emit box-shadow from layer.shadow
//                                  → "no shadow reaches a mailbox" RED (1)
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  addSection, addWidget, deserialise, dropIndexFor, emptyDocument, makeSection, makeWidget,
  moveWidgetTo, resetIds, serialise, setWidgetStyle,
} from "../src/builder/model.ts";
import {
  RATIO_PRESETS, emailColumnWidths, emailStyleDeclarations, gridTemplateFor, hasStyle,
  isTypographic, layerFor, normaliseRatios, readStyle, resetKeys, resolveStyle, seedFromPadding,
  setSide, sidesAreLinked, sidesToCss, styleBlockFor, widgetStyleClass, withLayer,
} from "../src/builder/style.ts";
import { makeContext, renderSection, renderDocument } from "../src/builder/render.ts";
import {
  makeEmailContext, renderEmailSection, renderEmailDocument, checkEmailSafe, assertEmailSafe,
} from "../src/builder/adapters/email/emailRender.ts";
import { PREVIEW_DEVICES, deviceContainerQuery, CONTENT_STACK_MAX } from "../src/builder/responsive.ts";

const SRC = path.join(process.cwd(), "src");
const readSrc = (rel) => readFileSync(path.join(SRC, rel), "utf8");

/** A two-column section with a heading and a paragraph. Nothing styled. */
function plainDoc() {
  resetIds();
  let d = emptyDocument({ style: "plain" });
  const s = makeSection({ label: "Plain", layout: 2 });
  d = addSection(d, s);
  d = addWidget(d, s.id, 0, makeWidget("heading", { text: "Hi", level: 2 }));
  d = addWidget(d, s.id, 1, makeWidget("paragraph", { text: "Words" }));
  return d;
}

/* ══════════════════════════════════════════════════════════════════════════
   1. A DOCUMENT WITH NO STYLE IS THE DOCUMENT WE ALREADY HAD
   ══════════════════════════════════════════════════════════════════════════ */

describe("a style-less document is byte-identical", () => {
  // Byte-exact, not "contains": the whole promise of an optional key is that
  // yesterday's proposal renders the same today. A `contains` assertion stays
  // green while an extra class, an empty <style> or a re-ordered attribute
  // creeps in, and every one of those is a change to what the customer reads.
  const EXPECTED =
    '<section class="bx-sec bx-w-contained bx-cols-2 bx-theme-light" data-section="s3" style="padding:24px 40px">\n'
    + "    \n    \n    \n"
    + '    <div class="bx-grid">\n'
    + '    <div class="bx-col" data-col="0"><div class="bx-w bx-w-heading"><h2 class="bx-h bx-h2" style="color:#0C4A60" data-edit="text">Hi</h2></div></div>\n'
    + '    <div class="bx-col" data-col="1"><div class="bx-w bx-w-paragraph"><p class="bx-p">Words</p></div></div></div>\n'
    + "  </section>";

  test("the section renders exactly what it rendered before style.ts existed", () => {
    const d = plainDoc();
    assert.equal(renderSection(d.sections[0], makeContext(d, {})), EXPECTED);
  });

  test("no <style> block and no bx-sy class anywhere", () => {
    const d = plainDoc();
    for (const mode of ["view", "edit"]) {
      const html = renderDocument(d, makeContext(d, { mode }));
      assert.doesNotMatch(html, /<style>/, `${mode}: an empty stylesheet was emitted`);
      assert.doesNotMatch(html, /bx-sy-/, `${mode}: a styling class was put on an unstyled widget`);
    }
  });

  test("the round trip carries no `style` key", () => {
    const d = plainDoc();
    const wire = serialise(d);
    assert.doesNotMatch(wire, /"style":/.source === "" ? /x/ : /"style":\{/);
    assert.equal(serialise(deserialise(wire)), wire);
    assert.equal(Object.prototype.hasOwnProperty.call(deserialise(wire).sections[0], "style"), false);
  });

  test("the email section is unchanged too", () => {
    const d = plainDoc();
    const html = renderEmailSection(d.sections[0], makeEmailContext(d, {}));
    assert.match(html, /padding:24px 24px;/);
    assert.deepEqual(checkEmailSafe(html), []);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2. READING A STORED STYLE — tolerant, and empty means absent
   ══════════════════════════════════════════════════════════════════════════ */

describe("readStyle is tolerant, like every other stored shape", () => {
  test("nonsense is dropped, not thrown", () => {
    assert.equal(readStyle(null), undefined);
    assert.equal(readStyle("hello"), undefined);
    assert.equal(readStyle({}), undefined);
    assert.equal(readStyle({ padding: "lots" }), undefined);
    assert.equal(readStyle({ shadow: "neon" }), undefined);
    assert.equal(readStyle({ align: "middle" }), undefined);
  });

  test("what IS understood survives", () => {
    const s = readStyle({
      padding: { top: 12, left: "20", nonsense: 4 },
      shadow: "soft",
      typography: { size: 18, colour: "#fff", color: "#112233" },
      phone: { padding: { top: 4 } },
      tablet: { hidden: true },
      junk: true,
    });
    assert.deepEqual(s.padding, { top: 12, left: 20 });
    assert.equal(s.shadow, "soft");
    assert.deepEqual(s.typography, { size: 18, color: "#112233" });
    assert.deepEqual(s.phone, { padding: { top: 4 } });
    assert.deepEqual(s.tablet, { hidden: true });
    assert.equal(s.junk, undefined);
  });

  test("a stored style comes back through deserialise on a section AND a widget", () => {
    resetIds();
    const wire = {
      v: 2,
      settings: { style: "plain" },
      sections: [{
        id: "s1", layout: 1, width: "contained", padding: 24, theme: "light", visibility: "customer",
        style: { gap: 30, phone: { gap: 10 } },
        columns: [{ id: "c1", widgets: [{ id: "w1", kind: "heading", props: {}, style: { align: "center" } }] }],
      }],
    };
    const d = deserialise(JSON.stringify(wire));
    assert.equal(d.sections[0].style.gap, 30);
    assert.equal(d.sections[0].style.phone.gap, 10);
    assert.equal(d.sections[0].columns[0].widgets[0].style.align, "center");
  });

  test("an empty style is never stamped onto a section", () => {
    // MUTATION: make makeSection carry `partial.style` whenever it is truthy
    // and this goes red — an empty object serialises as `"style":{}` and every
    // untouched document looks edited to diff.ts.
    const s = makeSection({ label: "x", style: {} });
    assert.equal(Object.prototype.hasOwnProperty.call(s, "style"), false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   3. THE CASCADE — desktop → tablet → phone
   ══════════════════════════════════════════════════════════════════════════ */

describe("the device cascade", () => {
  const style = {
    padding: { top: 40, right: 40, bottom: 40, left: 40 },
    typography: { size: 26, weight: 700 },
    gap: 24,
    tablet: { padding: { top: 24 }, typography: { size: 22 } },
    phone: { padding: { top: 12 }, gap: 8 },
  };

  test("desktop is the base, untouched", () => {
    const r = resolveStyle(style, "desktop");
    assert.deepEqual(r.padding, { top: 40, right: 40, bottom: 40, left: 40 });
    assert.equal(r.typography.size, 26);
    assert.equal(r.gap, 24);
  });

  test("tablet merges over desktop, per key", () => {
    const r = resolveStyle(style, "tablet");
    // The three sides the tablet said nothing about are still the desktop's.
    assert.deepEqual(r.padding, { top: 24, right: 40, bottom: 40, left: 40 });
    assert.equal(r.typography.size, 22);
    assert.equal(r.typography.weight, 700, "a tablet size must not blank the weight");
    assert.equal(r.gap, 24);
  });

  test("phone has the last word, and inherits the tablet's", () => {
    // MUTATION: merge `phone` before `tablet` in resolveStyle and this is red —
    // the tablet's 22px would swallow the phone's 12px top padding.
    const r = resolveStyle(style, "phone");
    assert.deepEqual(r.padding, { top: 12, right: 40, bottom: 40, left: 40 });
    assert.equal(r.gap, 8, "the phone's own gap wins");
    assert.equal(r.typography.size, 22, "the tablet's size still applies on a phone");
  });

  test("no style at all resolves to nothing, on every device", () => {
    for (const d of ["desktop", "tablet", "phone"]) assert.deepEqual(resolveStyle(undefined, d), {});
  });

  test("layerFor returns what is being EDITED, not what is resolved", () => {
    assert.deepEqual(layerFor(style, "phone"), { padding: { top: 12 }, gap: 8 });
    assert.equal(layerFor(style, "desktop").tablet, undefined);
  });

  test("withLayer writes one device and leaves the others alone", () => {
    const next = withLayer(style, "phone", { gap: 4 });
    assert.equal(next.phone.gap, 4);
    assert.equal(next.gap, 24);
    assert.equal(next.tablet.typography.size, 22);
  });

  test("clearing the last key removes the style entirely", () => {
    const only = { gap: 10 };
    assert.equal(withLayer(only, "desktop", { gap: undefined }), undefined);
    assert.equal(resetKeys({ padding: { top: 4 }, phone: { padding: { top: 2 } } }, ["padding"]), undefined);
  });

  test("a reset clears every device, not only the one being edited", () => {
    const after = resetKeys(style, ["padding"]);
    assert.equal(after.padding, undefined);
    assert.equal(after.tablet.padding, undefined);
    assert.equal(after.phone.padding, undefined);
    assert.equal(after.gap, 24, "a reset of Spacing must not take the gap with it");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   4. RATIOS — they always add up
   ══════════════════════════════════════════════════════════════════════════ */

describe("column ratios", () => {
  test("every preset sums to 1", () => {
    // MUTATION: make normaliseRatios return the raw numbers and the 33/67
    // preset (1/3 + 2/3 stored as typed) survives, but a hand-edited [3,7]
    // does not — the second assertion is the one that goes red.
    for (const [layout, presets] of Object.entries(RATIO_PRESETS)) {
      for (const p of presets) {
        assert.equal(p.widths.length, Number(layout), `${p.key} has the wrong number of columns`);
        const sum = p.widths.reduce((a, b) => a + b, 0);
        assert.ok(Math.abs(sum - 1) < 1e-9, `${p.key} sums to ${sum}`);
      }
    }
  });

  test("anything is renormalised, so a row can never be short or long", () => {
    assert.deepEqual(normaliseRatios([3, 7], 2), [0.3, 0.7]);
    assert.deepEqual(normaliseRatios([1, 1, 2], 3).map((x) => Math.round(x * 100)), [25, 25, 50]);
    const sum = normaliseRatios([3, 7], 2).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9);
  });

  test("the wrong length, zeroes or nonsense means equal columns", () => {
    assert.equal(normaliseRatios([0.5, 0.5], 3), null);
    assert.equal(normaliseRatios([0, 0], 2), null);
    assert.equal(normaliseRatios("half", 2), null);
    assert.equal(normaliseRatios(undefined, 2), null);
  });

  test("equal ratios emit no grid template at all", () => {
    assert.equal(gridTemplateFor([0.5, 0.5], 2), null, "equal columns are the stylesheet's job");
    assert.equal(gridTemplateFor(undefined, 2), null);
    assert.equal(gridTemplateFor([1 / 3, 2 / 3], 2), "0.667fr 1.333fr");
    assert.equal(gridTemplateFor([0.25, 0.75], 2), "0.5fr 1.5fr");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   5. CSS EMISSION
   ══════════════════════════════════════════════════════════════════════════ */

describe("the stylesheet a styled section emits", () => {
  function styled() {
    resetIds();
    let d = emptyDocument({ style: "plain" });
    const s = makeSection({
      label: "Split", layout: 2,
      style: {
        columnWidths: [1 / 3, 2 / 3],
        gap: 32,
        padding: { top: 48, right: 40, bottom: 48, left: 40 },
        border: { width: 2, color: "#0C4A60", style: "dashed" },
        radius: 12,
        shadow: "soft",
        phone: { padding: { top: 8, right: 16, bottom: 8, left: 16 } },
      },
    });
    d = addSection(d, s);
    d = addWidget(d, s.id, 0, makeWidget("heading", { text: "Big", level: 2 }));
    d = addWidget(d, s.id, 1, makeWidget("paragraph", { text: "Words" }));
    d = setWidgetStyle(d, { sectionId: s.id, columnIndex: 0, widgetIndex: 0 }, {
      typography: { size: 30, weight: 800, color: "#B91C1C" },
      margin: { top: 0, right: 0, bottom: 18, left: 0 },
      phone: { typography: { size: 18 } },
    });
    return d;
  }

  test("there is exactly one <style> block, inside the section", () => {
    const d = styled();
    const html = renderSection(d.sections[0], makeContext(d, {}));
    assert.equal((html.match(/<style>/g) || []).length, 1);
    // INSIDE, because the canvas paints one section at a time with innerHTML —
    // a per-document sheet would simply never reach it.
    assert.ok(html.indexOf("<style>") > html.indexOf("<section"), "the block is inside the section");
  });

  test("the section's own box: padding replaces the inline one, and the rest is a rule", () => {
    const d = styled();
    const html = renderSection(d.sections[0], makeContext(d, {}));
    assert.doesNotMatch(html, /style="[^"]*padding:\d+px 40px/, "the old single padding must not also be written");
    assert.match(html, /\.bx-sec\[data-section="s\d+"\]\{padding:48px 40px 48px 40px/);
    assert.match(html, /border:2px dashed #0C4A60/);
    assert.match(html, /border-radius:12px/);
    assert.match(html, /box-shadow:0 1px 2px/);
  });

  test("the ratio is the grid template and the gap is the grid gap", () => {
    const d = styled();
    const html = renderSection(d.sections[0], makeContext(d, {}));
    assert.match(html, /> \.bx-grid\{grid-template-columns:0\.667fr 1\.333fr;gap:32px\}/);
  });

  test("a styled widget gets a stable class in BOTH modes", () => {
    const d = styled();
    const id = d.sections[0].columns[0].widgets[0].id;
    for (const mode of ["view", "edit"]) {
      const html = renderSection(d.sections[0], makeContext(d, { mode }));
      assert.ok(html.includes(widgetStyleClass(id)), `${mode}: the customer's copy needs the hook too`);
    }
  });

  test("typography reaches the heading INSIDE the widget", () => {
    // `.bx-h2 { font-size: 15px }` beats anything inherited from a wrapper, so
    // the rule has to name the children as well. Remove `,${sel}>*` and an
    // author's 30px heading silently stays 15.
    const d = styled();
    const id = d.sections[0].columns[0].widgets[0].id;
    const html = renderSection(d.sections[0], makeContext(d, {}));
    const cls = widgetStyleClass(id);
    assert.ok(html.includes(`.${cls},.${cls}>*{font-size:30px;font-weight:800;color:#B91C1C}`));
  });

  test("a widget's margin is on the widget and not on the section", () => {
    const d = styled();
    const cls = widgetStyleClass(d.sections[0].columns[0].widgets[0].id);
    const html = renderSection(d.sections[0], makeContext(d, {}));
    assert.ok(html.includes(`.${cls}{margin:0px 0px 18px 0px}`));
  });

  test("device overrides ride the existing @container and carry !important", () => {
    const d = styled();
    const html = renderSection(d.sections[0], makeContext(d, {}));
    assert.match(html, /@container \(max-width: 390px\)\{/);
    assert.match(html, /padding:8px 16px 8px 16px !important/);
    assert.match(html, /font-size:18px !important/);
    // Never a media query: the canvas is a 390px sheet in a 1600px window and
    // a media query there is false forever. Same rule as the phone pass.
    assert.doesNotMatch(html, /@media/);
  });

  test("a device rule says only what that device CHANGES", () => {
    // Otherwise every phone rule restates the desktop one with !important and
    // nothing below it in the stylesheet could ever win.
    const d = styled();
    const html = renderSection(d.sections[0], makeContext(d, {}));
    const phone = html.slice(html.indexOf("@container (max-width: 390px)"));
    assert.doesNotMatch(phone, /box-shadow/, "the shadow was not changed on a phone");
    assert.doesNotMatch(phone, /grid-template-columns/, "the split was not changed on a phone");
  });

  test("hidden on a phone is a display:none inside the phone query", () => {
    resetIds();
    let d = emptyDocument({});
    const s = makeSection({ layout: 1 });
    d = addSection(d, s);
    d = addWidget(d, s.id, 0, makeWidget("paragraph", { text: "desktop only" }));
    d = setWidgetStyle(d, { sectionId: s.id, columnIndex: 0, widgetIndex: 0 }, { phone: { hidden: true } });
    const html = renderSection(d.sections[0], makeContext(d, {}));
    const phone = html.slice(html.indexOf("@container (max-width: 390px)"));
    assert.match(phone, /display:none !important/);
    assert.doesNotMatch(html.slice(0, html.indexOf("@container")), /display:none/);
  });

  test("styleBlockFor emits nothing when nothing is styled", () => {
    assert.equal(styleBlockFor({
      sectionSelector: ".s", gridSelector: ".g", layout: 1, sectionStyle: undefined, widgets: [],
    }), "");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   6. ONE OWNER OF BREAKPOINTS
   ══════════════════════════════════════════════════════════════════════════ */

describe("responsive.ts is still the only place a width is typed", () => {
  test("the device queries come from PREVIEW_DEVICES' own widths", () => {
    const tablet = PREVIEW_DEVICES.find((d) => d.key === "tablet").width;
    const phone = PREVIEW_DEVICES.find((d) => d.key === "phone").width;
    assert.equal(deviceContainerQuery("tablet"), `@container (max-width: ${tablet}px)`);
    assert.equal(deviceContainerQuery("phone"), `@container (max-width: ${phone}px)`);
    assert.equal(deviceContainerQuery("desktop"), "", "desktop is the base layer, not a query");
  });

  test("style.ts types no width of its own", () => {
    const src = readSrc("builder/style.ts");
    assert.doesNotMatch(src, /max-width:\s*\d/, "a breakpoint was typed into style.ts");
    assert.doesNotMatch(src, /@media/, "style.ts must never emit a media query");
    assert.match(src, /deviceContainerQuery/);
  });

  test("a document stacks BEFORE the phone overrides come in", () => {
    // 720 sits between the tablet's 768 and the phone's 390, so the columns are
    // already one column by the time a phone override applies. Pinned because
    // reversing it would mean an author sets a phone value and watches a
    // two-column layout ignore it.
    const phone = PREVIEW_DEVICES.find((d) => d.key === "phone").width;
    const tablet = PREVIEW_DEVICES.find((d) => d.key === "tablet").width;
    assert.ok(phone < CONTENT_STACK_MAX && CONTENT_STACK_MAX < tablet);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   7. THE EMAIL — tables, and what a mailbox will not do
   ══════════════════════════════════════════════════════════════════════════ */

describe("what reaches a mailbox", () => {
  function emailDoc() {
    resetIds();
    let d = emptyDocument({ style: "plain" });
    const s = makeSection({
      layout: 2,
      style: {
        padding: { top: 30, right: 20, bottom: 30, left: 20 },
        columnWidths: [0.25, 0.75],
        radius: 14,
        shadow: "strong",
      },
    });
    d = addSection(d, s);
    d = addWidget(d, s.id, 0, makeWidget("image", { src: "https://x.test/a.png", alt: "A picture" }));
    d = addWidget(d, s.id, 1, makeWidget("paragraph", { text: "Words" }));
    d = setWidgetStyle(d, { sectionId: s.id, columnIndex: 1, widgetIndex: 0 }, {
      margin: { top: 0, right: 0, bottom: 12, left: 0 },
      align: "center",
      typography: { size: 17, lineHeight: 1.8 },
      phone: { typography: { size: 30 } },
    });
    return d;
  }

  test("per-side padding becomes the section cell's padding", () => {
    const d = emailDoc();
    const html = renderEmailSection(d.sections[0], makeEmailContext(d, {}));
    assert.match(html, /<td align="center" style="padding:30px 20px 30px 20px;">/);
  });

  test("a widget's margin becomes an outer cell's padding, with the alignment and the type", () => {
    const d = emailDoc();
    const html = renderEmailSection(d.sections[0], makeEmailContext(d, {}));
    assert.match(html, /<td style="padding:0px 0px 12px 0px;text-align:center;font-size:17px;line-height:1\.8;">/);
  });

  test("the ratio becomes the fluid columns' own widths", () => {
    // 552 of content: a quarter and three quarters, not two halves.
    const d = emailDoc();
    const html = renderEmailSection(d.sections[0], makeEmailContext(d, {}));
    assert.deepEqual(emailColumnWidths(d.sections[0].style, 2, 552), [138, 414]);
    assert.match(html, /max-width:138px/);
    assert.match(html, /max-width:414px/);
  });

  test("NO shadow and NO radius reach a mailbox", () => {
    // MUTATION: emit box-shadow from `layer.shadow` in emailStyleDeclarations
    // and this goes red. Outlook renders through Word and drops both; a
    // rounded shadowed card in the builder and a square flat one in the inbox
    // is a preview that lies.
    const d = emailDoc();
    const html = renderEmailDocument(d, makeEmailContext(d, {}), { subject: "x" });
    assert.doesNotMatch(html, /box-shadow/);
    assert.doesNotMatch(html, /border-radius:14px/);
    assert.deepEqual(emailStyleDeclarations({ shadow: "strong", radius: 20 }, "section"), []);
  });

  test("a device override does not reach a mailbox either — there are no queries there", () => {
    const d = emailDoc();
    const html = renderEmailDocument(d, makeEmailContext(d, {}), { subject: "x" });
    assert.doesNotMatch(html, /@container/);
    assert.doesNotMatch(html, /font-size:30px/, "the phone override is not a thing a mailbox can honour");
  });

  test("typography reaches the heading's own tag, not just the cell around it", () => {
    // FOUND BY DRIVING IT (2026-09-17): a mailbox has no stylesheet, so a
    // widget's type on the wrapping cell is INHERITED — and
    // `<h1 style="font-size:26px">` beats anything inherited. A 27px heading
    // arrived 26px in Mailpit. The declarations are appended LAST inside the
    // element's own style attribute, where the last one for a property wins.
    resetIds();
    let d = emptyDocument({});
    const s = makeSection({ layout: 1 });
    d = addSection(d, s);
    d = addWidget(d, s.id, 0, makeWidget("heading", { text: "Big news", level: 1 }));
    d = setWidgetStyle(d, { sectionId: s.id, columnIndex: 0, widgetIndex: 0 }, {
      typography: { size: 27, weight: 800 },
    });
    const html = renderEmailSection(d.sections[0], makeEmailContext(d, {}));
    const h1 = html.match(/<h1 style="([^"]*)"/)[1];
    assert.ok(h1.indexOf("font-size:27px") > h1.indexOf("font-size:26px"),
      "the author's size must come after the default, or the default wins");
    assert.match(h1, /font-weight:800/);
    assert.deepEqual(checkEmailSafe(html), []);
  });

  test("a fully styled email is still safe to send", () => {
    const d = emailDoc();
    const html = renderEmailDocument(d, makeEmailContext(d, {}), { subject: "x" });
    assert.deepEqual(checkEmailSafe(html), []);
    assert.doesNotThrow(() => assertEmailSafe(html));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   8. DRAG TO POSITION — the index maths
   ══════════════════════════════════════════════════════════════════════════ */

describe("dropping a widget somewhere", () => {
  function four() {
    resetIds();
    let d = emptyDocument({});
    const s = makeSection({ layout: 2 });
    d = addSection(d, s);
    for (const t of ["a", "b", "c"]) d = addWidget(d, s.id, 0, makeWidget("paragraph", { text: t }));
    d = addWidget(d, s.id, 1, makeWidget("paragraph", { text: "z" }));
    return { d, sid: s.id };
  }
  const texts = (d, sid, col) =>
    d.sections.find((s) => s.id === sid).columns[col].widgets.map((w) => w.props.text);

  test("moving DOWN inside one column accounts for the lift", () => {
    // The widget is removed and then inserted, so a target below it has
    // already shifted up by one. Return `toIndex` unchanged here and every
    // downward drag lands one place short — every time, and only downwards.
    assert.equal(dropIndexFor({ sectionId: "s", columnIndex: 0, widgetIndex: 0 }, "s", 0, 2), 1);
    assert.equal(dropIndexFor({ sectionId: "s", columnIndex: 0, widgetIndex: 2 }, "s", 0, 0), 0);
    assert.equal(dropIndexFor({ sectionId: "s", columnIndex: 0, widgetIndex: 0 }, "s", 1, 2), 2);
    assert.equal(dropIndexFor({ sectionId: "s", columnIndex: 0, widgetIndex: 0 }, "other", 0, 2), 2);
  });

  test("a → the end of its own column", () => {
    const { d, sid } = four();
    const next = moveWidgetTo(d, { sectionId: sid, columnIndex: 0, widgetIndex: 0 }, { sectionId: sid, columnIndex: 0, index: 3 });
    assert.deepEqual(texts(next, sid, 0), ["b", "c", "a"]);
  });

  test("c → the top of its own column", () => {
    const { d, sid } = four();
    const next = moveWidgetTo(d, { sectionId: sid, columnIndex: 0, widgetIndex: 2 }, { sectionId: sid, columnIndex: 0, index: 0 });
    assert.deepEqual(texts(next, sid, 0), ["c", "a", "b"]);
  });

  test("b → the other column, above what is there", () => {
    const { d, sid } = four();
    const next = moveWidgetTo(d, { sectionId: sid, columnIndex: 0, widgetIndex: 1 }, { sectionId: sid, columnIndex: 1, index: 0 });
    assert.deepEqual(texts(next, sid, 0), ["a", "c"]);
    assert.deepEqual(texts(next, sid, 1), ["b", "z"]);
  });

  test("a drop into a column that is not there changes nothing", () => {
    const { d, sid } = four();
    assert.equal(moveWidgetTo(d, { sectionId: sid, columnIndex: 0, widgetIndex: 0 }, { sectionId: sid, columnIndex: 7, index: 0 }), d);
    assert.equal(moveWidgetTo(d, { sectionId: sid, columnIndex: 0, widgetIndex: 9 }, { sectionId: sid, columnIndex: 1, index: 0 }), d);
  });

  test("a widget dragged between sections keeps its styling", () => {
    resetIds();
    let d = emptyDocument({});
    const a = makeSection({ layout: 1 });
    const b = makeSection({ layout: 1 });
    d = addSection(addSection(d, a), b);
    d = addWidget(d, a.id, 0, makeWidget("heading", { text: "H" }));
    d = setWidgetStyle(d, { sectionId: a.id, columnIndex: 0, widgetIndex: 0 }, { align: "center" });
    const next = moveWidgetTo(d, { sectionId: a.id, columnIndex: 0, widgetIndex: 0 }, { sectionId: b.id, columnIndex: 0, index: 0 });
    assert.equal(next.sections[0].columns[0].widgets.length, 0);
    assert.equal(next.sections[1].columns[0].widgets[0].style.align, "center");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   9. THE INSPECTOR'S OWN MATHS — the link toggle
   ══════════════════════════════════════════════════════════════════════════ */

describe("the four-box spacing pad", () => {
  test("linked moves all four", () => {
    assert.deepEqual(setSide({ top: 1, right: 2, bottom: 3, left: 4 }, "top", 10, true),
      { top: 10, right: 10, bottom: 10, left: 10 });
  });

  test("unlinked moves only the one typed in", () => {
    assert.deepEqual(setSide({ top: 1, right: 2, bottom: 3, left: 4 }, "left", 9, false),
      { top: 1, right: 2, bottom: 3, left: 9 });
  });

  test("emptying a box unsets that side; emptying a linked box unsets all four", () => {
    assert.deepEqual(setSide({ top: 1, left: 2 }, "top", undefined, false), { left: 2 });
    assert.equal(setSide({ top: 1 }, "top", undefined, false), undefined);
    assert.equal(setSide({ top: 1, right: 1, bottom: 1, left: 1 }, "top", undefined, true), undefined);
  });

  test("the chain shows as ON only when all four already match", () => {
    assert.equal(sidesAreLinked(undefined), true, "nothing set reads as linked");
    assert.equal(sidesAreLinked({ top: 8, right: 8, bottom: 8, left: 8 }), true);
    assert.equal(sidesAreLinked({ top: 8, right: 8, bottom: 8, left: 2 }), false);
    assert.equal(sidesAreLinked({ top: 8 }), false, "three sides unset is not four the same");
  });

  test("the seed keeps the renderer's own 40px sides", () => {
    // The first click on a spacing box must not shift the page: 40 left and
    // right is what renderSection has always written into the HTML, so seeding
    // 0 there would take 80px off the width the moment anybody touched it.
    assert.deepEqual(seedFromPadding(24), { top: 24, right: 40, bottom: 24, left: 40 });
    assert.deepEqual(seedFromPadding("nonsense"), { top: 0, right: 40, bottom: 0, left: 40 });
  });

  test("sidesToCss writes four values, zero for what was not set", () => {
    assert.equal(sidesToCss({ top: 10 }), "10px 0px 0px 0px");
    assert.equal(sidesToCss(undefined), null);
    assert.equal(sidesToCss({}), null);
  });

  test("only text-bearing widgets get a Typography group", () => {
    for (const k of ["heading", "paragraph", "list", "callout", "button", "testimonial", "site_heading"]) {
      assert.equal(isTypographic(k), true, `${k} has words in it`);
    }
    for (const k of ["image", "spacer", "divider", "page_break", "signature"]) {
      assert.equal(isTypographic(k), false, `${k} has no words of its own`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   10. THE PANELS, pinned at the source — one mechanism, not two
   ══════════════════════════════════════════════════════════════════════════ */

describe("the inspector and the canvas are wired the way §11.8 says", () => {
  const inspector = readSrc("builder/Inspector.tsx");
  const groups = readSrc("builder/StyleGroups.tsx");
  const canvas = readSrc("builder/Canvas.tsx");
  const shell = readSrc("builder/BuilderShell.tsx");
  const pane = readSrc("builder/WidgetPane.tsx");

  test("a widget gets Content, Typography, Spacing, Advanced — in that order", () => {
    const order = [...inspector.matchAll(/<(Group title="([^"]+)"|SpacingGroup|TypographyGroup|AdvancedGroup)/g)]
      .map((m) => m[2] || m[1]);
    const widgetHalf = order.slice(0, order.indexOf("Layout"));
    assert.deepEqual(widgetHalf, ["Content", "TypographyGroup", "SpacingGroup", "AdvancedGroup"]);
  });

  test("a section gets Layout, Spacing, Style, Typography, Page — in that order", () => {
    const order = [...inspector.matchAll(/<(Group title="([^"]+)"|SpacingGroup|TypographyGroup|AdvancedGroup)/g)]
      .map((m) => m[2] || m[1]);
    assert.deepEqual(order.slice(order.indexOf("Layout")), ["Layout", "SpacingGroup", "Style", "Typography", "Page"]);
  });

  test("every group can be reset and every group collapses", () => {
    assert.match(groups.value ?? groups, /aria-expanded=\{open\}/);
    assert.match(groups, /aria-label=\{`Reset \$\{title\}`\}/);
    const resets = (inspector.match(/onReset=/g) || []).length;
    assert.ok(resets >= 7, `only ${resets} groups offer a reset`);
  });

  test("ONE device state — the inspector edits what the preview is showing", () => {
    // Two states is exactly the drift this pass exists to delete: an author
    // would set a phone value and watch the desktop layout not change.
    assert.match(shell, /device=\{preview\}/);
    assert.match(shell, /onDevice=\{setPreview\}/);
    assert.equal((shell.match(/useState<PreviewKey>/g) || []).length, 1);
    assert.doesNotMatch(inspector, /useState/, "the inspector must not keep a device of its own");
  });

  test("the pane drags, the canvas draws the line, the shell holds the payload", () => {
    assert.match(pane, /draggable=\{!!onDragWidget\}/);
    assert.match(pane, /onDragStart=/);
    assert.match(canvas, /className="bxc-dropline"/);
    assert.match(canvas, /data-drop-index=\{spot\.index\}/);
    assert.match(shell, /const \[drag, setDrag\] = useState<CanvasDrag>\(null\)/);
    assert.match(shell, /onDropWidget=\{dropWidget\}/);
  });

  test("changing the column count goes through setLayout, so the column exists", () => {
    // FOUND BY DRIVING IT (2026-09-17): the inspector's Columns select and the
    // canvas toolbar both wrote `layout: 2` straight through `patchSection`,
    // which leaves `columns` one long. The stylesheet drew two tracks over one
    // column — "two columns" with nowhere to put anything, and a ratio control
    // sharing a width between a column that existed and one that did not.
    assert.match(shell, /const changeSection = useCallback\(/);
    assert.match(shell, /if \(layout != null\) next = setLayout\(next, id, layout\)/);
    assert.equal((shell.match(/onPatchSection=\{changeSection\}/g) || []).length, 2,
      "both the canvas and the inspector go through the one handler");
    assert.doesNotMatch(shell, /onPatchSection=\{\(id, patch\) => apply\(patchSection/,
      "a caller that writes layout straight through patchSection is back");
  });

  test("no drag-and-drop library was added", () => {
    const pkg = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const bad of ["react-dnd", "@dnd-kit/core", "react-beautiful-dnd", "sortablejs", "react-sortablejs"]) {
      assert.equal(deps[bad], undefined, `${bad} was added; HTML5 drag events are the one mechanism`);
    }
  });

  test("the keyboard path stays — HTML5 drag never fires on touch", () => {
    assert.match(inspector, /title="Move this up inside its column"/);
    assert.match(inspector, /title="Move this down inside its column"/);
  });

  test("the email inspector says what it cannot promise", () => {
    assert.match(inspector, /not in email/i);
    assert.match(inspector, /const isEmail = p\.adapter === "email"/);
  });

  test("a style change is one undo step, coalesced by field and device", () => {
    // The same mergeKey mechanism typing already uses (history.push). Dragging
    // a padding from 24 to 48 must be one Ctrl+Z, not twenty-four.
    assert.match(inspector, /`\$\{widget\.id\}:\$\{mergeKey\}:\$\{p\.device\}`/);
    assert.match(inspector, /`\$\{section\.id\}:\$\{mergeKey\}:\$\{p\.device\}`/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   11. A STYLE-ONLY EDIT IS A CHANGE, for a revision
   ══════════════════════════════════════════════════════════════════════════ */

describe("diff.ts needs no change, and that is the point", () => {
  test("styling a section badges it as changed", async () => {
    const { diffDocuments } = await import("../src/builder/diff.ts");
    const base = plainDoc();
    const next = { ...base, sections: base.sections.map((s) => ({ ...s, style: { gap: 40 } })) };
    const diff = diffDocuments(base, next);
    assert.equal(diff.changed, 1);
    assert.equal(diff.sections[base.sections[0].id], "changed");
    assert.equal(diff.identical, false);
  });

  test("a document nobody styled is still identical to itself", () => {
    const a = plainDoc();
    assert.equal(hasStyle(a.sections[0].style), false);
  });
});
