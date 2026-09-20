/**
 * test/families-f3-deep.test.mjs — WAVE 2: the eight everyday widgets, and
 * every control they carry, EXECUTED.
 *
 * ── THE ONE QUESTION THIS FILE ASKS ───────────────────────────────────────
 * *A control that changes nothing on the canvas is a defect, not a feature.*
 * That is the whole reason this wave exists. The Button had a "Colour" control
 * and a renderer that painted `ctx.accent` regardless; the Divider had a
 * "Style" select and drew a bare `<hr/>`; the Icon Box had a "Link" control and
 * never wrapped anything in an anchor. Each of those shipped, each was on the
 * panel, and none of them did anything.
 *
 * So every test below CHANGES ONE CONTROL AND WATCHES THE MARKUP MOVE. Nothing
 * here reads a definition and reports that a key exists: a key existing is what
 * was already true when the widget was broken.
 *
 * `§1` is the sweep — every control of every one of the eight, one at a time,
 * with a value that must show up. It is written as data so a control added
 * tomorrow without a renderer change fails the same afternoon.
 * `§2` names the ones a sweep cannot judge, and drives them by hand.
 * `§3` proves a document saved before today still draws.
 * `§4` is the mailbox half.
 * `§5` is the panel: Elementor's sections, Elementor's order, per device.
 *
 * ── MUTATIONS (run against the real source, seen red, restored) ───────────
 * 2026-09-19, each by editing the file, running this suite and putting it back:
 *
 *   · `iconBox.ts`     the `link` wrapper switched off
 *        → §2 "the Icon Box link wraps the WHOLE box" RED. That IS the old defect.
 *   · `iconList.ts`    `rows()` stops falling back to the plain `items` array
 *        → §3 "a list saved as plain strings still draws every point" RED.
 *   · `email.ts`       `emailAlert` reads only `p.title`, as the mailbox switch did
 *        → §4 "an Alert in a mailbox shows its words" RED. That IS the old defect.
 *   · `spacer.ts`      `p.space ?? p.height` → `p.space`
 *        → §3 "a spacer saved as `height` keeps its gap" RED.
 *   · `socialIcons.ts` the official-colour branch removed
 *        → §2 "Social Icons paints each network its OWN colour" RED.
 *   · `alert.ts`       `wantDismiss` back to `on(p.show_dismiss)` alone
 *        → §2 "the Alert's dismiss really closes it" RED. This one was a LIVE
 *          defect this file found: Elementor's switcher stores "show", `on()`
 *          only knows `true` and "yes", so the button never drew.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { FAMILY } from "../src/builder/widgets/families/f3-buttons-icons-panels/index.ts";
import { makeContext } from "../src/builder/render.ts";
import { emptyDocument } from "../src/builder/model.ts";
import { controlTab, controlSections } from "../src/builder/registry.ts";

const DEF = Object.fromEntries(FAMILY.defs.map((d) => [d.kind, d]));
const DEEPENED = ["button", "icon", "icon_box", "list", "social_links", "alert", "divider", "spacer"];

function ctx(mode = "view") {
  return makeContext(emptyDocument(), { mode, accent: "#0C4A60" });
}

function draw(kind, props, mode = "view") {
  return FAMILY.renderers[kind]({ id: `w-${kind}`, kind, props }, ctx(mode));
}

function drawEmail(kind, props, mode = "view") {
  return FAMILY.emailRenderers[kind](
    { id: `w-${kind}`, kind, props },
    { mode, merge: { fields: {}, contact: {} }, accent: "#0C4A60", ink: "#0B1C24", paper: "#FFFFFF" },
  );
}

/** Enough props for each widget to draw something a customer would see. */
const BASE = {
  button: { text: "Book a call", link: "https://example.test/book" },
  icon: { selected_icon: { value: "fas fa-star", library: "fa-solid" } },
  icon_box: { title_text: "Fast response", description_text: "Within one hour." },
  list: { items: ["One", "Two", "Three"] },
  social_links: { social_icon_list: [{ social: "facebook", link: "https://example.test/f" }] },
  alert: { alert_title: "Read this", alert_description: "It matters." },
  divider: {},
  spacer: {},
};

/* ═══════════════════════════════════════════════════════════════════════════
   1. EVERY CONTROL, ONE AT A TIME, CHANGES THE MARKUP
   ═════════════════════════════════════════════════════════════════════════ */

/**
 * A value to set, and what must then appear in the markup.
 *
 * `expect` is a RegExp tested against the drawn HTML. It is deliberately the
 * value itself — the colour, the number, the option — and never a class name,
 * because a class can be present while the setting is ignored.
 */
const SWEEP = {
  button: {
    button_type: ["danger", /#D9534F/],
    text: ["Press me now", /Press me now/],
    link: ["https://example.test/x", /href="https:\/\/example\.test\/x"/],
    size: ["xl", /padding:20px 40px/],
    selected_icon: [{ value: "fas fa-check", library: "fa-solid" }, /bx-btn-i/],
    icon_align: ["row-reverse", /flex-direction:row-reverse/],
    icon_indent: [21, /gap:21px/],
    align: ["center", /justify-content:center/],
    typography_font_size: [27, /font-size:27px/],
    typography_font_weight: ["800", /font-weight:800/],
    typography_text_transform: ["uppercase", /text-transform:uppercase/],
    button_text_color: ["#112233", /color:#112233/],
    background_color: ["#445566", /background:#445566/],
    border_border: ["dashed", /border:1px dashed/],
    border_width: [7, /border:7px solid/, { border_border: "solid" }],
    border_color: ["#778899", /solid #778899/, { border_border: "solid" }],
    border_radius: [19, /border-radius:19px/],
    text_padding: [23, /padding:23px 46px/],
    hover_color: ["#aabbcc", /:hover\{color:#aabbcc/],
    button_background_hover_color: ["#ddeeff", /:hover\{[^}]*background:#ddeeff/],
  },
  icon: {
    selected_icon: [{ value: "fas fa-phone", library: "fa-solid" }, /bx-icon/],
    view: ["framed", /border:2px solid/],
    shape: ["square", /border-radius:0/, { view: "stacked" }],
    link: ["https://example.test/i", /href="https:\/\/example\.test\/i"/],
    align: ["end", /justify-content:flex-end/],
    primary_color: ["#123456", /#123456/],
    secondary_color: ["#654321", /color:#654321/, { view: "stacked" }],
    size: [64, /font-size:64px/],
    icon_padding: [33, /padding:33px/, { view: "stacked" }],
    rotate: [45, /rotate\(45deg\)/],
    border_width: [9, /border:9px solid/, { view: "framed" }],
    border_radius: [11, /border-radius:11px/],
  },
  icon_box: {
    selected_icon: [{ value: "fas fa-check", library: "fa-solid" }, /bx-icon/],
    view: ["stacked", /background:#0C4A60/],
    shape: ["square", /border-radius:0/, { view: "framed" }],
    title_text: ["A brand new title", /A brand new title/],
    description_text: ["A brand new line", /A brand new line/],
    link: ["https://example.test/b", /href="https:\/\/example\.test\/b"/],
    title_size: ["h1", /<h1/],
    position: ["inline-end", /flex-direction:row-reverse/],
    content_vertical_alignment: ["middle", /align-items:center/, { position: "inline-start" }],
    text_align: ["end", /text-align:right/],
    icon_space: [37, /gap:37px/],
    title_bottom_space: [29, /gap:29px/],
    primary_color: ["#0a0b0c", /#0a0b0c/],
    secondary_color: ["#0d0e0f", /color:#0d0e0f/, { view: "stacked" }],
    icon_size: [51, /font-size:51px/],
    icon_padding: [13, /padding:13px/, { view: "stacked" }],
    rotate: [30, /rotate\(30deg\)/],
    border_width: [6, /border:6px solid/, { view: "framed" }],
    title_color: ["#abcdef", /color:#abcdef/],
    description_color: ["#fedcba", /color:#fedcba/],
  },
  list: {
    view: ["inline", /flex-direction:row/],
    /* R2-11 — THE CONTROL'S KEY IS `items`. The Icon List read two spellings of
       one list and could not be given an Add Item because of it; it reads one
       now (`iconList.ts rows()` says which and why). The rich row shape is
       still READ — an Elementor-shaped row that reached a renderer raw — which
       is what the link case below hands in. */
    items: [["From the list"], /From the list/],
    link_click: ["inline", /<a href="https:\/\/example\.test\/r"[^>]*>\s*<span class="bx-iconlist-t/,
      { items: [{ text: "Row", link: "https://example.test/r" }] }],
    space_between: [17, /gap:17px/],
    icon_align: ["center", /justify-content:center/],
    divider: [true, /border-bottom:1px solid/],
    divider_style: ["dashed", /border-bottom:1px dashed/, { divider: true }],
    divider_weight: [5, /border-bottom:5px/, { divider: true }],
    divider_color: ["#020304", /solid #020304/, { divider: true }],
    icon_color: ["#050607", /color:#050607/],
    icon_size: [31, /font-size:31px/],
    text_indent: [23, /gap:23px/],
    text_color: ["#080910", /color:#080910/],
  },
  social_links: {
    social_icon_list: [[{ social: "youtube", link: "https://example.test/y" }], /example\.test\/y/],
    shape: ["square", /border-radius:0/],
    columns: [3, /calc\(\(100% - 16px\) \/ 3\)/],
    align: ["right", /justify-content:flex-end/],
    icon_color: ["custom", /background:#0C4A60/],
    icon_primary_color: ["#101112", /background:#101112/, { icon_color: "custom" }],
    icon_secondary_color: ["#131415", /color:#131415/, { icon_color: "custom" }],
    icon_size: [26, /font-size:26px/],
    icon_padding: [14, /width:54px/, { icon_size: 26 }],
    icon_spacing: [18, /gap:18px/],
    row_gap: [22, /row-gap:22px/],
    image_border_border: ["dotted", /border:1px dotted/],
    image_border_width: [4, /border:4px/, { image_border_border: "solid" }],
    image_border_color: ["#161718", /solid #161718/, { image_border_border: "solid" }],
    border_radius: [8, /border-radius:8px/],
    hover_primary_color: ["#191a1b", /:hover\{background:#191a1b/],
    hover_secondary_color: ["#1c1d1e", /:hover\{[^}]*color:#1c1d1e/],
  },
  alert: {
    alert_type: ["danger", /#FDECEA/],
    alert_title: ["Mind the gap", /Mind the gap/],
    alert_description: ["It is wider than it looks", /It is wider than it looks/],
    show_dismiss: [false, /^(?!.*bx-alert-x).*$/s],
    dismiss_icon: [{ value: "fas fa-times", library: "fa-solid" }, /bx-alert-x/],
    background: ["#1f2021", /background:#1f2021/],
    border_color: ["#222324", /solid #222324/],
    "border_left-width": [12, /border-left:12px/],
    title_color: ["#252627", /color:#252627/],
    alert_title_font_size: [23, /font-size:23px/],
    alert_title_font_weight: ["300", /font-weight:300/],
    description_color: ["#282930", /color:#282930/],
    alert_description_font_size: [11, /font-size:11px/],
    dismiss_icon_size: [28, /font-size:28px/],
    dismiss_icon_normal_color: ["#313233", /color:#313233/],
  },
  divider: {
    style: ["dashed", /border-top:1px dashed/],
    width: [42, /width:42%/],
    align: ["right", /justify-content:flex-end/],
    look: ["line_text", /bx-divider-text/],
    text: ["In between", /In between/, { look: "line_text" }],
    html_tag: ["h4", /<h4/, { look: "line_text" }],
    icon: [{ value: "fas fa-star", library: "fa-solid" }, /bx-divider-icon/, { look: "line_icon" }],
    color: ["#343536", /border-top:1px solid #343536/],
    weight: [8, /border-top:8px/],
    gap: [34, /padding:34px 0/],
    text_color: ["#373839", /color:#373839/, { look: "line_text" }],
    typography_font_size: [26, /font-size:26px/, { look: "line_text" }],
    typography_font_weight: ["700", /font-weight:700/, { look: "line_text" }],
    text_align: ["left", /bx-divider-text[\s\S]*bx-divider-line/, { look: "line_text" }],
    text_spacing: [16, /padding:0 16px/, { look: "line_text" }],
    icon_view: ["stacked", /background:#0C4A60/, { look: "line_icon" }],
    icon_size: [40, /font-size:40px/, { look: "line_icon" }],
    primary_color: ["#404142", /#404142/, { look: "line_icon" }],
    icon_align: ["right", /bx-divider-line[\s\S]*bx-divider-icon/, { look: "line_icon" }],
    icon_spacing: [24, /margin:0 24px/, { look: "line_icon" }],
  },
  spacer: {
    space: [123, /height:123px/],
  },
};

describe("every control of the eight changes what is drawn", () => {
  for (const kind of DEEPENED) {
    test(`${kind}: the sweep covers every control the panel offers`, () => {
      /* THE SWEEP IS THE GUARD, AND THIS IS THE GUARD ON THE SWEEP. A control
         added to the definition without a case here would be a control nobody
         ever proved does anything, which is the defect this wave is about. */
      const declared = DEF[kind].controls.map((c) => c.key).sort();
      assert.deepEqual(Object.keys(SWEEP[kind]).sort(), declared,
        `${kind}: the sweep and the panel disagree about which controls exist`);
    });

    for (const [key, [value, expected, extra]] of Object.entries(SWEEP[kind])) {
      test(`${kind} · ${key} changes the page`, () => {
        const props = { ...BASE[kind], ...(extra || {}), [key]: value };
        const html = draw(kind, props, "view");
        assert.match(html, expected,
          `setting ${kind}.${key} to ${JSON.stringify(value)} did not reach the markup`);
      });
    }
  }

  test("…and a control left alone does NOT put its value on the page", () => {
    /* The other half of the same question. If the sweep passed because the
       renderer prints every prop it is handed, these would pass too. */
    assert.doesNotMatch(draw("button", BASE.button), /#445566/);
    assert.doesNotMatch(draw("divider", {}), /border-top:8px/);
    assert.doesNotMatch(draw("spacer", {}), /height:123px/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   2. THE ONES A SWEEP CANNOT JUDGE
   ═════════════════════════════════════════════════════════════════════════ */

describe("the behaviours a single regular expression cannot see", () => {
  test("the Icon Box link wraps the WHOLE box, which the old renderer never did", () => {
    const html = draw("icon_box", { ...BASE.icon_box, link: "https://example.test/all" });
    assert.match(html, /^<a class="bx-iconbox-link" href="https:\/\/example\.test\/all"/);
    assert.match(html, /<\/a>$/);
  });

  test("a Button with no words and no icon draws nothing for a customer, and a slot for the author", () => {
    assert.equal(draw("button", {}, "view"), "");
    assert.match(draw("button", {}, "edit"), /data-placeholder="Button text"/);
  });

  test("the Spacer stays clickable while editing even when the author sets it to nothing", () => {
    assert.match(draw("spacer", { space: 0 }, "edit"), /min-height:6px/);
    assert.doesNotMatch(draw("spacer", { space: 0 }, "view"), /min-height/);
  });

  test("the Alert's dismiss really closes it, with no script at all", () => {
    const html = draw("alert", BASE.alert, "view");
    assert.match(html, /<input type="checkbox" id="bxa-w-alert-x"/);
    assert.match(html, /#bxa-w-alert-x:checked \+ \.bx-alert\{display:none\}/);
    assert.doesNotMatch(html, /onclick|<script/i, "a dismiss button must not need JavaScript");
    /* …and never while editing, or an author closes their own widget. */
    assert.doesNotMatch(draw("alert", BASE.alert, "edit"), /:checked/);
  });

  test("Social Icons paints each network its OWN colour until the author says Custom", () => {
    const rows = [
      { social: "facebook", link: "https://example.test/f" },
      { social: "youtube", link: "https://example.test/y" },
    ];
    const official = draw("social_links", { social_icon_list: rows });
    assert.match(official, /#1877F2/, "Facebook blue");
    assert.match(official, /#FF0000/, "YouTube red");
    const custom = draw("social_links", { social_icon_list: rows, icon_color: "custom", icon_primary_color: "#00FF00" });
    assert.doesNotMatch(custom, /#1877F2/, "Custom must override the official colour");
    assert.match(custom, /#00FF00/);
  });

  test("every one of the eight escapes what an author typed", () => {
    const nasty = '"><img src=x onerror=alert(1)>';
    for (const kind of DEEPENED) {
      const props = { ...BASE[kind] };
      for (const c of DEF[kind].controls) {
        if (c.type === "text" || c.type === "textarea" || c.type === "link") props[c.key] = nasty;
      }
      const html = draw(kind, props, "view");
      assert.doesNotMatch(html, /<img|<script/i, `${kind} let an element through`);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   3. A DOCUMENT SAVED BEFORE TODAY STILL DRAWS
   ═════════════════════════════════════════════════════════════════════════ */

describe("the kind never changed, so a stored document still opens", () => {
  test("a button saved as label/url/colour keeps all three", () => {
    const html = draw("button", { label: "Accept", url: "https://old.test/a", colour: "#FF00FF" });
    assert.match(html, /Accept/);
    assert.match(html, /href="https:\/\/old\.test\/a"/);
    assert.match(html, /background:#FF00FF/);
  });

  test("a button saved with the old Outline style is still an outline", () => {
    const html = draw("button", { label: "Ask", style: "outline", colour: "#FF00FF" });
    assert.match(html, /background:transparent/);
    assert.match(html, /border:2px solid #FF00FF/);
  });

  test("a list saved as plain strings still draws every point", () => {
    const html = draw("list", { items: ["Alpha", "Beta"] });
    assert.match(html, /Alpha/);
    assert.match(html, /Beta/);
    assert.match(html, /data-edit="items\.0"/, "and it still writes back where it was read from");
  });

  test("a spacer saved as `height` keeps its gap", () => {
    assert.match(draw("spacer", { height: 96 }), /height:96px/);
  });

  test("an icon saved with the old two-value shape still draws", () => {
    assert.match(draw("icon", { view: "stacked", shape: "circle", primary_color: "#010203" }), /border-radius:999px/);
  });

  test("an icon box saved with the old top/left/right position still lays out", () => {
    assert.match(draw("icon_box", { ...BASE.icon_box, position: "left" }), /flex-direction:row;/);
    assert.match(draw("icon_box", { ...BASE.icon_box, position: "right" }), /flex-direction:row-reverse/);
    assert.match(draw("icon_box", { ...BASE.icon_box, position: "top" }), /flex-direction:column;/);
  });

  test("a social row saved as `links` still has its accounts", () => {
    assert.match(draw("social_links", { links: [{ social: "x", link: "https://old.test/x" }] }), /old\.test\/x/);
  });

  test("a divider saved as `line` or `space_only` still behaves", () => {
    assert.match(draw("divider", { style: "line" }), /border-top:1px solid/);
    assert.doesNotMatch(draw("divider", { style: "space_only" }), /border-top/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   4. THE MAILBOX HALF
   ═════════════════════════════════════════════════════════════════════════ */

describe("the newsletter draws all eight, with tables and no classes", () => {
  test("all eight have a mailbox renderer, because the offer file gives all eight", () => {
    for (const kind of DEEPENED) {
      assert.equal(typeof FAMILY.emailRenderers[kind], "function", kind);
      assert.ok(DEF[kind].builders.includes("newsletter"), `${kind} is not offered on the newsletter`);
    }
  });

  test("nothing a mailbox cannot lay out, and no class attribute", () => {
    for (const kind of DEEPENED) {
      const html = drawEmail(kind, BASE[kind]);
      assert.doesNotMatch(html, /display:\s*flex|display:\s*grid|flex-direction|grid-template|position:\s*(absolute|fixed)/,
        `${kind} asked a mailbox to lay out a flex box`);
      assert.doesNotMatch(html, /\sclass=/, `${kind} put a class in an email`);
    }
  });

  test("an Alert in a mailbox shows its words — it showed NOTHING before", () => {
    /* THE BUG THIS REPLACES: `emAlert` read `p.title` and `p.text`; the widget
       stores `alert_title` and `alert_description`. Every Alert in every
       newsletter was therefore an empty string. */
    const html = drawEmail("alert", { alert_title: "Read this", alert_description: "It matters." });
    assert.match(html, /Read this/);
    assert.match(html, /It matters\./);
  });

  test("a Button in a mailbox reads Elementor's keys, not the old ones", () => {
    const html = drawEmail("button", { text: "Book", link: "https://example.test/b", background_color: "#123456" });
    assert.match(html, /Book/);
    assert.match(html, /href="https:\/\/example\.test\/b"/);
    assert.match(html, /background:#123456/);
  });

  test("…and still reads the old ones, so a saved newsletter keeps its button", () => {
    const html = drawEmail("button", { label: "Old", url: "https://old.test/b", colour: "#654321" });
    assert.match(html, /Old/);
    assert.match(html, /background:#654321/);
  });

  test("an Icon in a mailbox reads `selected_icon` and `primary_color`", () => {
    const html = drawEmail("icon", { selected_icon: { value: "fas fa-star" }, primary_color: "#0F0F0F", view: "stacked" });
    assert.match(html, /background:#0F0F0F/);
  });

  test("Social Icons in a mailbox keep each network's own colour", () => {
    const html = drawEmail("social_links", { social_icon_list: [{ social: "facebook", link: "https://e.test/f" }] });
    assert.match(html, /#1877F2/);
  });

  test("a mailbox Spacer is never zero high, because Outlook drops an empty cell", () => {
    assert.match(drawEmail("spacer", { space: 0 }), /height:1px/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   5. THE PANEL READS AS ELEMENTOR'S
   ═════════════════════════════════════════════════════════════════════════ */

/** Elementor's own Style-tab sections, in Elementor's own order. */
const STYLE_SECTIONS = {
  button: ["Button", "Hover"],
  icon: ["Icon"],
  icon_box: ["Box", "Icon", "Content"],
  list: ["List", "Icon", "Text"],
  social_links: ["Icon", "Icon Hover"],
  alert: ["Alert", "Title", "Description", "Dismiss Icon"],
  divider: ["Divider", "Text", "Icon"],
  spacer: [],
};

/** Controls the machine file marks `responsive: true`, per widget. */
const RESPONSIVE_KEYS = {
  button: ["align", "typography_font_size", "border_width", "border_radius", "text_padding"],
  icon: ["align", "size", "rotate", "border_radius"],
  icon_box: ["position", "content_vertical_alignment", "text_align", "icon_space",
    "title_bottom_space", "icon_size", "icon_padding", "rotate", "border_width"],
  list: ["space_between", "icon_align", "icon_size"],
  social_links: ["columns", "align", "icon_size", "icon_padding", "icon_spacing", "row_gap",
    "image_border_width", "border_radius"],
  alert: ["alert_title_font_size", "alert_description_font_size", "dismiss_icon_size"],
  divider: ["width", "align", "gap", "typography_font_size", "text_spacing",
    "icon_size", "icon_spacing"],
  spacer: ["space"],
};

describe("the right-hand panel is Elementor's, for the eight", () => {
  for (const kind of DEEPENED) {
    test(`${kind}: the Style tab's sections are Elementor's own, in Elementor's order`, () => {
      const onStyle = DEF[kind].controls.filter((c) => controlTab(c) === "style");
      assert.deepEqual(controlSections(onStyle).map((g) => g.section), STYLE_SECTIONS[kind]);
    });

    test(`${kind}: exactly the controls the machine file marks responsive are`, () => {
      const marked = DEF[kind].controls.filter((c) => c.responsive).map((c) => c.key).sort();
      assert.deepEqual(marked, [...RESPONSIVE_KEYS[kind]].sort(),
        `${kind}: responsive is COPIED from BUILDER_WIDGET_CATALOG_2026-09-17, never guessed`);
    });

    test(`${kind}: every control the panel draws is a type the panel can draw`, () => {
      /* A `text` or `list` control is typed ON THE PAGE, which is the engine's
         one editing mechanism; anything else must be one of the seven the
         right-hand panel knows how to draw, or it is a setting nobody can
         reach. */
      const PANEL = new Set(["toggle", "select", "colour", "number", "image", "link", "code"]);
      const ON_PAGE = new Set(["text", "textarea", "richtext", "list", "money", "merge", "hidden"]);
      for (const c of DEF[kind].controls) {
        assert.ok(PANEL.has(c.type) || ON_PAGE.has(c.type), `${kind}.${c.key} is a ${c.type}`);
      }
    });
  }

  test("every select stores Elementor's own value, never a slug we made up", () => {
    /* `optionKey("Space between")` is `space_between`, and Elementor stores
       `space-between`. A select that declares its options as plain strings
       therefore stores the wrong value silently, which is why every one of
       these declares `{ value, label }` pairs. */
    for (const kind of DEEPENED) {
      for (const c of DEF[kind].controls) {
        if (c.type !== "select" || !c.options) continue;
        for (const o of c.options) {
          assert.equal(typeof o, "object",
            `${kind}.${c.key} declares a bare string option; Elementor's stored value would be guessed`);
        }
      }
    }
  });

  test("no control carries a plan gate, because that decision is October's and is DATA", () => {
    for (const kind of DEEPENED) assert.equal(DEF[kind].requires, undefined, kind);
  });
});
