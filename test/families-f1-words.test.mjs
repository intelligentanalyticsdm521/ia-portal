// test/families-f1-words.test.mjs — the f1-words family keeps its contract.
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
// Everything after that is the seven widgets themselves.
//
// Mutation check (run it, do not trust it): add a def with a kind that is not
// in BUILDER_OFFERS_2026-09-19.json and this file goes red naming the folder;
// put it back and it goes green. Proven on 2026-09-19 with a fake
// `{ kind: "sparkle_box", ... }` in this family, and again this pass — see the
// handoff's "Mutation-tested by executing the real thing".
//
// ── WHY THE ENGINE IS IMPORTED FIRST ──────────────────────────────────────
// `render.ts` imports `families/index.ts` (the one `renderFamily` line) and
// every widget in this folder imports `esc` back out of `render.ts`. That ring
// is the same one the seven atoms have run on since D-156 and it is safe —
// every binding crossing it is a hoisted `function` used at CALL time — but it
// only settles when the ENGINE is the entry point, which is what the app
// always does. Importing `families/f1-words/index.ts` first instead makes
// `families/index.ts` read `F1_WORDS` while this folder is still evaluating,
// and Node throws "Cannot access 'F1_WORDS' before initialization". So the
// engine is imported first, on purpose, and the handoff carries the one-line
// fix that would let a family index be an entry point on its own.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeContext } from "../src/builder/render.ts";
import { emptyDocument } from "../src/builder/model.ts";
import { WIDGETS_BY_KIND, controlSections, controlTab, widgetsFor } from "../src/builder/registry.ts";
import { FAMILY } from "../src/builder/widgets/families/f1-words/index.ts";
import {
  headingAnchor, headingTagOf, highlightedLines, markerPath, restingWord,
  rotatingPhrases, textPathD, tocEntries, blockquotePlain,
} from "../src/builder/widgets/families/f1-words/index.ts";
import { assertFamilyContract } from "./helpers/familyContract.mjs";
import { mailboxFontStack } from "../src/builder/widgets/families/f1-words/words.ts";
/* The MAILBOX, drawn by the adapter that really sends it — imported so the
   family's own font stack can be held equal to the adapter's by execution
   rather than by a promise in a comment. */
import { makeEmailContext, renderEmailSection } from "../src/builder/adapters/email/emailRender.ts";
import { emptyDocument as freshDoc, makeSection, makeWidget } from "../src/builder/model.ts";

/** One section holding one widget, drawn the way a mailbox really draws it. */
function emailSection(kind, props) {
  const doc = freshDoc();
  const section = makeSection();
  section.columns[0].widgets.push(makeWidget(kind, props));
  doc.sections = [section];
  return renderEmailSection(doc.sections[0], makeEmailContext(doc, { bodyFont: "Helvetica" }));
}

/* TWELVE since wave 2. The five the first wave could not declare - heading,
   paragraph, html, shortcode, menu_anchor - are here now: `mergeWidgetDefs`
   (b168/override) lets a family definition REPLACE the legacy one of the same
   kind, so there is no duplicate tile and no migration. */
const KINDS = [
  "heading", "paragraph", "html", "shortcode", "menu_anchor",
  "blockquote", "animated_headline", "text_path", "table_of_contents",
  "code_highlight", "read_more", "sidebar",
];

/** A render context with nothing in it but what a renderer may read. */
function ctx(mode = "view", doc = undefined) {
  return makeContext(doc || emptyDocument(), { mode });
}

function draw(kind, props, mode = "view", doc = undefined) {
  const fn = FAMILY.renderers[kind];
  assert.ok(fn, `${kind}: no renderer`);
  return fn({ id: "w1", kind, props }, ctx(mode, doc));
}

test("f1-words: the family exports the one shape families/index.ts collects", () => {
  assert.ok(Array.isArray(FAMILY.defs), "defs is an array");
  assert.equal(typeof FAMILY.renderers, "object", "renderers is a map");
});

test("f1-words: every widget it declares keeps the contract", () => {
  assertFamilyContract("f1-words", FAMILY);
});

test("f1-words: the twelve widgets this family builds, and only those", () => {
  assert.deepEqual(FAMILY.defs.map((d) => d.kind).sort(), [...KINDS].sort());
});

/* ── The panel, from the definition alone ──────────────────────────────── */

test("every widget carries Elementor's own title", () => {
  const titles = Object.fromEntries(FAMILY.defs.map((d) => [d.kind, d.label]));
  assert.deepEqual(titles, {
    heading: "Heading",
    paragraph: "Text Editor",
    html: "HTML",
    shortcode: "Shortcode",
    menu_anchor: "Menu Anchor",
    blockquote: "Blockquote",
    animated_headline: "Animated Headline",
    text_path: "Text Path",
    table_of_contents: "Table of Contents",
    code_highlight: "Code Highlight",
    read_more: "Read More",
    sidebar: "Sidebar",
  });
});

test("the Content tab uses Elementor's own panel section names", () => {
  const sectionsOf = (kind) => {
    const def = FAMILY.defs.find((d) => d.kind === kind);
    return controlSections(def.controls.filter((c) => controlTab(c) === "content"))
      .map((s) => s.section);
  };
  assert.deepEqual(sectionsOf("blockquote"), ["Blockquote"]);
  assert.deepEqual(sectionsOf("animated_headline"), ["Headline"]);
  assert.deepEqual(sectionsOf("text_path"), ["Text Path"]);
  assert.deepEqual(sectionsOf("table_of_contents"), ["Table of Contents", "Additional Options"]);
  assert.deepEqual(sectionsOf("code_highlight"), ["Code Highlight"]);
  assert.deepEqual(sectionsOf("read_more"), ["Read More"]);
  assert.deepEqual(sectionsOf("sidebar"), ["Sidebar"]);
});

test("the Style tab uses Elementor's own section names, where the widget has one", () => {
  const styleSections = (kind) => {
    const def = FAMILY.defs.find((d) => d.kind === kind);
    return [...new Set(def.controls.filter((c) => controlTab(c) === "style").map((c) => c.section))];
  };
  assert.deepEqual(styleSections("blockquote"), ["Content", "Border", "Box", "Quote"]);
  assert.deepEqual(styleSections("text_path"), ["Text Path", "Path"]);
  assert.deepEqual(styleSections("table_of_contents"), ["Box"]);
  // Elementor's Code Highlight, Read More and Sidebar have no Style tab at all.
  for (const k of ["code_highlight", "read_more", "sidebar"]) {
    assert.deepEqual(styleSections(k), [], `${k} should have no Style controls`);
  }
});

test("every widget reaches the ONE registry, with the builders the offer file gives it", () => {
  const adaptersOf = (kind) => {
    const def = WIDGETS_BY_KIND[kind];
    assert.ok(def, `${kind} is not in the registry`);
    return [...def.adapters].sort();
  };
  assert.deepEqual(adaptersOf("blockquote"), ["brand", "email", "landing", "proposal", "website"]);
  assert.deepEqual(adaptersOf("animated_headline"), ["landing", "website"]);
  assert.deepEqual(adaptersOf("text_path"), ["landing", "website"]);
  assert.deepEqual(adaptersOf("table_of_contents"), ["landing", "proposal", "website"]);
  assert.deepEqual(adaptersOf("code_highlight"), ["landing", "website"]);
  assert.deepEqual(adaptersOf("read_more"), ["website"]);
  assert.deepEqual(adaptersOf("sidebar"), ["website"]);
});

test("every widget is on the panel of every builder it claims", () => {
  for (const def of FAMILY.defs) {
    for (const adapter of WIDGETS_BY_KIND[def.kind].adapters) {
      const labels = widgetsFor(adapter).map((w) => w.label);
      assert.ok(labels.includes(def.label), `${def.label} is missing from the ${adapter} panel`);
    }
  }
});

test("nothing ships behind a `requires` gate — October decides the tiers, in DATA", () => {
  for (const def of FAMILY.defs) assert.equal(def.requires, undefined, def.kind);
});

/* ── Blockquote ────────────────────────────────────────────────────────── */

test("blockquote draws the words, the author and Elementor's four skins", () => {
  for (const skin of ["border", "quotation", "boxed", "clean"]) {
    const html = draw("blockquote", {
      blockquote_skin: skin, blockquote_content: "They showed up on time.", author_name: "A. Customer",
    });
    assert.match(html, /They showed up on time\./, `${skin}: the quote`);
    assert.match(html, /A\. Customer/, `${skin}: the author`);
    assert.match(html, new RegExp(`bx-bq-${skin}`), `${skin}: its own class`);
  }
});

test("blockquote reads a testimonial's spelling too, so converting one loses nothing", () => {
  const html = draw("blockquote", { quote: "Tidy work.", attribution: "R. Smith" });
  assert.match(html, /Tidy work\./);
  assert.match(html, /R\. Smith/);
});

test("blockquote draws NO tweet button — no third-party product surface", () => {
  const html = draw("blockquote", {
    blockquote_content: "Hello", author_name: "Me", tweet_button: "yes", tweet_button_label: "Tweet",
  });
  assert.equal(/tweet|twitter|x\.com/i.test(html), false, "a tweet button reached the page");
});

test("an empty blockquote draws nothing for a customer and a slot for the author", () => {
  assert.equal(draw("blockquote", {}), "");
  assert.match(draw("blockquote", {}, "edit"), /data-edit="blockquote_content"/);
});

test("blockquotePlain is the one sentence paper and mailboxes share", () => {
  assert.equal(blockquotePlain({ blockquote_content: "Great job", author_name: "Dana" }),
    "“Great job” — Dana");
  assert.equal(blockquotePlain({}), "");
});

/* ── Animated Headline ─────────────────────────────────────────────────── */

test("the headline reads in full with no JavaScript at all", () => {
  const html = draw("animated_headline", {
    headline_style: "highlight", marker: "circle",
    before_text: "Our work is", highlighted_text: "Reliable", after_text: "every week",
  });
  assert.match(html, /Our work is/);
  assert.match(html, /Reliable/);
  assert.match(html, /every week/);
  assert.equal(/<script/i.test(html), false, "no script reached the page");
});

test("rotate style paints the FIRST phrase, which is what a visitor sees first", () => {
  assert.deepEqual(rotatingPhrases("Better\nBigger\nFaster"), ["Better", "Bigger", "Faster"]);
  assert.equal(restingWord({ headline_style: "rotate", rotating_text: "Better\nBigger" }), "Better");
  assert.match(draw("animated_headline", { headline_style: "rotate", rotating_text: "Better\nBigger" }), /Better/);
});

test("every one of Elementor's nine shapes has a path, and an unknown one falls back", () => {
  for (const m of ["circle", "curly", "underline", "double", "double_underline",
    "underline_zigzag", "diagonal", "strikethrough", "x"]) {
    assert.ok(markerPath(m), m);
  }
  assert.equal(markerPath("no-such-shape"), markerPath("underline"));
});

test("the headline's HTML tag is the one the author chose", () => {
  assert.match(draw("animated_headline", { tag: "h1", before_text: "Hi" }), /<h1 /);
  assert.match(draw("animated_headline", { tag: "nonsense", before_text: "Hi" }), /<h3 /);
});

/* ── Text Path ─────────────────────────────────────────────────────────── */

test("text path bends the words with static SVG — no script", () => {
  const html = draw("text_path", { text: "Summit season", path: "arc" });
  assert.match(html, /<svg/);
  assert.match(html, /<textPath/);
  assert.match(html, /Summit season/);
  assert.equal(/<script/i.test(html), false);
});

test("each shape has its own curve and an unknown one falls back to the wave", () => {
  const seen = new Set();
  for (const s of ["wave", "arc", "circle", "line", "oval", "spiral"]) seen.add(textPathD(s));
  assert.equal(seen.size, 6, "two shapes share one curve");
  assert.equal(textPathD("nope"), textPathD("wave"));
});

test("the curve's id is the widget's own, so two on one page do not collide", () => {
  const one = FAMILY.renderers.text_path({ id: "aaa", kind: "text_path", props: { text: "x" } }, ctx());
  const two = FAMILY.renderers.text_path({ id: "bbb", kind: "text_path", props: { text: "x" } }, ctx());
  assert.match(one, /id="bxpath-aaa"/);
  assert.match(two, /id="bxpath-bbb"/);
});

test("a custom path with no SVG picked says so rather than drawing a shape nobody chose", () => {
  assert.equal(draw("text_path", { text: "x", path: "custom" }), "");
  assert.match(draw("text_path", { text: "x", path: "custom" }, "edit"), /Pick the SVG file/);
});

/* ── Table of Contents ─────────────────────────────────────────────────── */

const DOC_WITH_HEADINGS = {
  ...emptyDocument(),
  sections: [{
    id: "s1", visibility: "customer", columns: [{
      widgets: [
        { id: "h1", kind: "heading", props: { text: "Scope of work", level: 2 } },
        { id: "p1", kind: "paragraph", props: { text: "Words." } },
        { id: "h2", kind: "heading", props: { text: "What is included", level: 3 } },
        { id: "h3", kind: "heading", props: { text: "Terms", header_size: "h2" } },
      ],
    }],
  }],
};

test("the contents list is READ FROM THE DOCUMENT, not retyped", () => {
  const entries = tocEntries(DOC_WITH_HEADINGS, ["h2", "h3"]);
  assert.deepEqual(entries.map((e) => e.text), ["Scope of work", "What is included", "Terms"]);
  const html = draw("table_of_contents", {}, "view", DOC_WITH_HEADINGS);
  assert.match(html, /Scope of work/);
  assert.match(html, /What is included/);
  assert.match(html, /href="#scope-of-work"/);
});

test("only the heading sizes the author asked for are listed", () => {
  const entries = tocEntries(DOC_WITH_HEADINGS, ["h3"]);
  assert.deepEqual(entries.map((e) => e.text), ["What is included"]);
});

test("a heading's level is read in all three spellings the platform has stored", () => {
  assert.equal(headingTagOf({ level: 2 }), "h2");
  assert.equal(headingTagOf({ header_size: "h4" }), "h4");
  assert.equal(headingTagOf({ level: "Page title" }), "h1");
  assert.equal(headingTagOf({ level: "Sub-section" }), "h3");
  assert.equal(headingTagOf({}), "h2");
});

test("two headings with the same words still get their own anchor", () => {
  assert.equal(headingAnchor("Scope of work", 0), "scope-of-work");
  assert.equal(headingAnchor("", 3), "heading-4");
});

test("a document with no headings says Elementor's own sentence, not an empty box", () => {
  assert.equal(draw("table_of_contents", {}, "view", emptyDocument()), "");
  assert.match(draw("table_of_contents", {}, "edit", emptyDocument()),
    /No headings were found on this page\./);
});

/* ── Code Highlight ────────────────────────────────────────────────────── */

test("the code is shown exactly as typed, escaped, never run", () => {
  const html = draw("code_highlight", { code: "<script>alert(1)</script>", line_numbers: true });
  assert.equal(html.includes("<script>"), false, "the author's code executed");
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<pre class="bx-code"/);
});

test("line numbers are in the markup, so a page with no JavaScript still has them", () => {
  const html = draw("code_highlight", { code: "one\ntwo\nthree", line_numbers: true });
  for (const n of ["1", "2", "3"]) assert.ok(html.includes(`>${n}</span>`), `line ${n}`);
  const off = draw("code_highlight", { code: "one\ntwo", line_numbers: false });
  assert.equal(off.includes(">1</span>"), false);
});

test("Highlight Lines reads Elementor's own `2,5-7` spelling", () => {
  assert.deepEqual([...highlightedLines("2,5-7")], [2, 5, 6, 7]);
  assert.deepEqual([...highlightedLines("")], []);
  assert.deepEqual([...highlightedLines("nonsense")], []);
});

test("no Copy button is drawn here, because ours would not do anything", () => {
  const html = draw("code_highlight", { code: "x", copy_to_clipboard: true });
  assert.equal(/<button/i.test(html), false);
});

/* ── Read More and Sidebar ─────────────────────────────────────────────── */

test("Read More is a marker: nothing for the customer, a visible cut for the author", () => {
  assert.equal(draw("read_more", { link_text: "Continue reading" }), "");
  assert.match(draw("read_more", {}, "edit"), /Continue reading/);
});

test("Sidebar draws nothing for the customer and names the sidebar for the author", () => {
  assert.equal(draw("sidebar", { sidebar: "sidebar-1" }), "");
  assert.match(draw("sidebar", { sidebar: "sidebar-1" }, "edit"), /sidebar-1/);
  assert.match(draw("sidebar", {}, "edit"), /Pick a sidebar/);
});

/* ── The one thing every renderer must not do ──────────────────────────── */

test("no renderer throws on a widget whose props are empty or missing", () => {
  for (const kind of KINDS) {
    for (const props of [undefined, null, {}]) {
      for (const mode of ["view", "edit"]) {
        assert.doesNotThrow(() => FAMILY.renderers[kind]({ id: "w", kind, props }, ctx(mode)), `${kind}/${mode}`);
      }
    }
  }
});

/* ══════════════════════════════════════════════════════════════════════════
   WAVE 2 — the five everyday widgets, deepened
   ══════════════════════════════════════════════════════════════════════════

   Heading, Text Editor, HTML, Shortcode and Menu Anchor are the widgets an
   author reaches for first, and they were the thinnest on the panel. These
   tests EXECUTE the renderer once per control: a control that changes nothing
   on the canvas is a defect, not a feature, and the only way to know that is
   to draw the widget twice and compare. */

/** Draw with and without one setting, and prove the canvas is not the same. */
function controlMoves(kind, base, key, value, expect) {
  const before = draw(kind, base);
  const after = draw(kind, { ...base, [key]: value });
  assert.notEqual(after, before, `${kind}.${key} changed nothing on the canvas`);
  if (expect) assert.match(after, expect, `${kind}.${key} did not draw what it says it does`);
}

/* ── Heading ───────────────────────────────────────────────────────────── */

test("an untouched Heading draws the SAME BYTES it drew before this widget grew a Style tab", () => {
  /* This is the whole reason the stored keys did not move. `builder-styling`
     asserts the same string from the other end; this says it in the family's
     own file so a change here fails here. */
  assert.equal(draw("heading", { text: "Hi", level: "Section" }),
    '<h2 class="bx-h bx-h2" style="color:#0C4A60" data-edit="text">Hi</h2>');
});

test("Heading reads BOTH spellings — the one documents store and Elementor's", () => {
  assert.match(draw("heading", { text: "From a stored document" }), /From a stored document/);
  assert.match(draw("heading", { title: "Elementors own key" }), /Elementors own key/);
  // A document holding both keeps drawing what it drew: `text` is what the
  // canvas writes back, so it wins.
  assert.match(draw("heading", { text: "Stored", title: "Elementor" }), />Stored</);
});

test("Heading: header_size wins, and `level` still answers for a stored document", () => {
  assert.match(draw("heading", { text: "x", header_size: "h4" }), /^<h4 /);
  assert.match(draw("heading", { text: "x", header_size: "span" }), /^<span class="bx-h"/);
  assert.match(draw("heading", { text: "x", level: "Page title" }), /^<h1 /);
  assert.match(draw("heading", { text: "x", level: "Sub-section" }), /^<h3 /);
  // Junk in a stored document is an h2, not markup.
  assert.match(draw("heading", { text: "x", header_size: "<script>" }), /^<h2 /);
});

test("EXECUTED: every Heading control the panel offers changes the canvas", () => {
  const base = { text: "Winter is coming" };
  controlMoves("heading", base, "link", "https://example.test/x", /<a href="https:\/\/example.test\/x"/);
  controlMoves("heading", base, "size", "xxl", /font-size:59px/);
  controlMoves("heading", base, "header_size", "h5", /^<h5 /);
  controlMoves("heading", base, "align", "center", /text-align:center/);
  controlMoves("heading", base, "title_color", "#B45309", /color:#B45309/);
  controlMoves("heading", base, "typography_text_transform", "uppercase", /text-transform:uppercase/);
  controlMoves("heading", base, "typography_font_style", "italic", /font-style:italic/);
  controlMoves("heading", base, "typography_text_decoration", "underline", /text-decoration:underline/);
  controlMoves("heading", base, "typography_word_spacing", 4, /word-spacing:4px/);
  controlMoves("heading", base, "text_stroke_text_stroke", 2, /-webkit-text-stroke:2px/);
  controlMoves("heading", { ...base, text_stroke_text_stroke: 2 },
    "text_stroke_stroke_color", "#123456", /text-stroke:2px #123456/);
  controlMoves("heading", base, "text_shadow_text_shadow_blur", 6, /text-shadow:0px 0px 6px/);
  controlMoves("heading", base, "text_shadow_text_shadow_horizontal", 3, /text-shadow:3px/);
  controlMoves("heading", base, "text_shadow_text_shadow_vertical", 4, /text-shadow:0px 4px/);
  controlMoves("heading", base, "text_shadow_text_shadow_color", "#0F172A", /text-shadow:.*#0F172A/);
  controlMoves("heading", base, "blend_mode", "multiply", /mix-blend-mode:multiply/);
  controlMoves("heading", base, "title_hover_color", "#0EA5E9", /:hover\{color:#0EA5E9\}/);
  controlMoves("heading", { ...base, title_hover_color: "#0EA5E9" },
    "title_hover_color_transition_duration", 0.3, /transition:color 0.3s/);
  /* Per device, with the platform's own CONTAINER query — not a media query,
     because the canvas is a narrowed box and not a narrowed window. */
  controlMoves("heading", base, "size_tablet", "small", /@container[^{]*\{\.bx-hd-w1\{font-size:15px\}\}/);
  controlMoves("heading", base, "align_mobile", "end", /@container[^{]*\{\.bx-hd-w1\{text-align:right\}\}/);
});

test("two headings on one page cannot reach each other's rules", () => {
  const one = FAMILY.renderers.heading({ id: "wA", kind: "heading", props: { text: "A", align_tablet: "center" } }, ctx());
  const two = FAMILY.renderers.heading({ id: "wB", kind: "heading", props: { text: "B", align_tablet: "end" } }, ctx());
  assert.match(one, /\.bx-hd-wA\{/);
  assert.match(two, /\.bx-hd-wB\{/);
  assert.equal(one.includes("bx-hd-wB"), false);
});

/* ── Text Editor ───────────────────────────────────────────────────────── */

test("an untouched Text Editor draws the ENGINE's own paragraphs, unwrapped", () => {
  assert.equal(draw("paragraph", { text: "One.\n\nTwo." }),
    '<p class="bx-p">One.</p><p class="bx-p">Two.</p>');
});

test("Text Editor reads both spellings", () => {
  assert.match(draw("paragraph", { text: "stored" }), /stored/);
  assert.match(draw("paragraph", { editor: "elementor" }), /elementor/);
});

test("EXECUTED: every Text Editor control the panel offers changes the canvas", () => {
  const base = { text: "We cleared forty lots this week." };
  controlMoves("paragraph", base, "align", "center", /text-align:center/);
  controlMoves("paragraph", base, "text_color", "#B45309", /color:#B45309/);
  controlMoves("paragraph", base, "text_columns", "3", /column-count:3/);
  controlMoves("paragraph", { ...base, text_columns: "2" }, "column_gap", 24, /column-gap:24px/);
  controlMoves("paragraph", base, "typography_text_transform", "capitalize", /text-transform:capitalize/);
  controlMoves("paragraph", base, "typography_font_style", "italic", /font-style:italic/);
  controlMoves("paragraph", base, "typography_text_decoration", "underline", /text-decoration:underline/);
  controlMoves("paragraph", base, "typography_word_spacing", 3, /word-spacing:3px/);
  controlMoves("paragraph", base, "text_shadow_text_shadow_blur", 8, /text-shadow:0px 0px 8px/);
  controlMoves("paragraph", base, "paragraph_spacing", 20, /p\{margin-bottom:20px\}/);
  controlMoves("paragraph", base, "link_color", "#0EA5E9", /a\{color:#0EA5E9/);
  controlMoves("paragraph", base, "link_hover_color", "#1D4ED8", /a:hover\{color:#1D4ED8\}/);
  controlMoves("paragraph", { ...base, link_color: "#0EA5E9" },
    "link_hover_color_transition_duration", 0.2, /transition:color 0.2s/);
  controlMoves("paragraph", base, "align_tablet", "end", /@container[^{]*\{\.bx-te-w1\{text-align:right\}\}/);
  controlMoves("paragraph", base, "text_columns_mobile", "2", /@container[^{]*\{\.bx-te-w1\{column-count:2\}\}/);
});

test("EXECUTED: the whole Drop Cap section changes the first letter and nothing else", () => {
  const base = { text: "Winter starts in November.", drop_cap: "yes" };
  const on = draw("paragraph", base);
  assert.match(on, /p:first-of-type::first-letter\{/);
  // The WORDS are untouched — this is CSS, not surgery on the author's text.
  assert.match(on, />Winter starts in November\.</);
  controlMoves("paragraph", base, "drop_cap_view", "stacked", /first-letter\{[^}]*background:/);
  controlMoves("paragraph", base, "drop_cap_view", "framed", /first-letter\{[^}]*border:/);
  controlMoves("paragraph", base, "drop_cap_primary_color", "#B45309", /first-letter\{[^}]*color:#B45309/);
  controlMoves("paragraph", { ...base, drop_cap_view: "stacked" },
    "drop_cap_secondary_color", "#0F172A", /background:#0F172A/);
  controlMoves("paragraph", base, "drop_cap_size", 7, /font-size:7em/);
  controlMoves("paragraph", base, "drop_cap_space", 18, /margin-right:18px/);
  controlMoves("paragraph", base, "drop_cap_border_radius", 40, /border-radius:40%/);
  controlMoves("paragraph", { ...base, drop_cap_view: "framed" }, "drop_cap_border_width", 5, /border:5px solid/);
  controlMoves("paragraph", base, "drop_cap_typography_text_transform", "uppercase", /first-letter\{[^}]*text-transform:uppercase/);
  controlMoves("paragraph", base, "drop_cap_typography_font_style", "italic", /first-letter\{[^}]*font-style:italic/);
});

test("the drop cap is off unless it is switched on", () => {
  assert.equal(/first-letter/.test(draw("paragraph", { text: "x" })), false);
  assert.equal(/first-letter/.test(draw("paragraph", { text: "x", drop_cap: "" })), false);
  assert.equal(/first-letter/.test(draw("paragraph", { text: "x", drop_cap: "no" })), false);
});

/* ── HTML, Shortcode, Menu Anchor ──────────────────────────────────────── */

test("HTML puts the author's markup on the page exactly as typed", () => {
  assert.equal(draw("html", { html: "<p>Mine</p>" }), "<p>Mine</p>");
  assert.match(draw("html", { html: "<p>Mine</p>" }, "edit"), /data-html-preview="1"/);
  assert.equal(draw("html", {}), "");
  assert.match(draw("html", {}, "edit"), /Paste your own HTML/);
  // `code` is read too: a paste into the wrong key is not the author's fault.
  assert.equal(draw("html", { code: "<b>x</b>" }), "<b>x</b>");
});

test("HTML reaches a MAILBOX, which is the gap the first wave wrote down", () => {
  const fn = FAMILY.emailRenderers.html;
  assert.ok(fn, "the offer gives HTML to the newsletter and nothing drew it");
  const html = fn({ id: "w1", kind: "html", props: { html: '<p style="margin:0">Hi</p>' } }, { mode: "view" });
  assert.match(html, /<table role="presentation"/);
  assert.match(html, /<p style="margin:0">Hi<\/p>/);
  // A mailbox cannot lay out a flex box, and a stylesheet is stripped.
  assert.equal(/display\s*:\s*(flex|grid)/.test(html), false);
  assert.equal(/<style/.test(html), false);
  assert.equal(/\sclass=/.test(html), false);
  assert.equal(fn({ id: "w1", kind: "html", props: {} }, { mode: "view" }), "");
});

test("Shortcode shows the code to the author and sends the code to the page", () => {
  assert.equal(draw("shortcode", { shortcode: "[ia_book_now]" }), "[ia_book_now]");
  const editing = draw("shortcode", { shortcode: "[ia_book_now]" }, "edit");
  assert.match(editing, /\[ia_book_now\]/);
  assert.match(editing, /This runs on your published page, not here\./);
  assert.equal(draw("shortcode", {}), "");
});

test("Menu Anchor is invisible on the page and named on the canvas", () => {
  assert.equal(draw("menu_anchor", { anchor: "prices" }), '<span id="prices" class="bx-anchor"></span>');
  assert.match(draw("menu_anchor", { anchor: "prices" }, "edit"), /Menu anchor: #prices/);
  assert.equal(draw("menu_anchor", {}), "");
  /* A space or a hash would make an id no link can reach, and the marker is
     invisible on the page, so the author would never find out. */
  assert.equal(draw("menu_anchor", { anchor: "our prices#" }), '<span id="ourprices" class="bx-anchor"></span>');
});

/* ── Blockquote's two missing surfaces ─────────────────────────────────── */

test("Blockquote reaches a MAILBOX, in tables, with no class and no stylesheet", () => {
  const fn = FAMILY.emailRenderers.blockquote;
  assert.ok(fn);
  const html = fn({ id: "w1", kind: "blockquote", props: {
    blockquote_content: "They were out before we opened.", author_name: "Hope Ministries",
  } }, { mode: "view", ink: "#111827", accent: "#0C4A60" });
  assert.match(html, /<table role="presentation"/);
  assert.match(html, /They were out before we opened\./);
  assert.match(html, /Hope Ministries/);
  assert.equal(/display\s*:\s*(flex|grid)/.test(html), false);
  assert.equal(/<style/.test(html), false);
  assert.equal(/\sclass=/.test(html), false);
  // Empty and being read by a customer → nothing at all.
  assert.equal(fn({ id: "w1", kind: "blockquote", props: {} }, { mode: "view" }), "");
});

test("Blockquote PLACES something on the My Brand canvas", () => {
  /* The defect this closes: the tile was on the My Brand panel and pressing it
     put nothing on the canvas at all, silently. `mybrand-studio.test.mjs`
     catches it by EXECUTING the insert for every offered tile; this names the
     family that owns the widget. */
  const fn = FAMILY.studioInserts.blockquote;
  assert.ok(fn);
  const out = fn({ width: 1080, height: 1080 },
    { colours: { text: "#282930" }, fonts: { heading: "Testa", body: "Testb" } }, {});
  assert.equal(out.layers.length, 2, "the quote and the name under it");
  assert.ok(out.selectId, "nothing was selected, so the author sees no handles");
  for (const l of out.layers) {
    assert.ok(l.id && l.kind === "text", "a layer with no id could never be selected");
    assert.ok(Number.isFinite(l.x) && Number.isFinite(l.y), "a layer with no position");
    assert.ok(l.x >= 0 && l.y >= 0 && l.x <= 1080 && l.y <= 1080, `a layer lands off the canvas at ${l.x},${l.y}`);
  }
});

/* ── Elementor's own panel, for the five ───────────────────────────────── */

test("wave 2's Content sections are Elementor's own, by name", () => {
  const sectionsOn = (kind, tab) => {
    const def = FAMILY.defs.find((d) => d.kind === kind);
    return controlSections(def.controls.filter((c) => controlTab(c) === tab)).map((s) => s.section);
  };
  assert.deepEqual(sectionsOn("heading", "content"), ["Heading"]);
  assert.deepEqual(sectionsOn("heading", "style"), ["Heading"]);
  assert.deepEqual(sectionsOn("paragraph", "content"), ["Text Editor"]);
  assert.deepEqual(sectionsOn("paragraph", "style"), ["Text Editor", "Drop Cap"]);
  assert.deepEqual(sectionsOn("html", "content"), ["HTML Code"]);
  assert.deepEqual(sectionsOn("shortcode", "content"), ["Shortcode"]);
  assert.deepEqual(sectionsOn("menu_anchor", "content"), ["Menu Anchor"]);
});

test("wave 2's widgets sit in Elementor's own group", () => {
  const groupOf = (kind) => FAMILY.defs.find((d) => d.kind === kind).category;
  assert.equal(groupOf("heading"), "Basic");
  assert.equal(groupOf("paragraph"), "Basic");
  assert.equal(groupOf("html"), "General");
  assert.equal(groupOf("shortcode"), "General");
  assert.equal(groupOf("menu_anchor"), "General");
  /* …and the four Pro ones are in Elementor Pro's own group now that
     `b168/override` gave the panel one. Wave 1 had to leave them in General
     behind a padlock and wrote it up as a difference a person can see. */
  for (const kind of ["blockquote", "animated_headline", "table_of_contents", "code_highlight"]) {
    assert.equal(groupOf(kind), "Pro", kind);
  }
});

test("only the controls the machine file marks responsive are per device", () => {
  /* Copied, never guessed. `heading.align` and `text-editor.text_columns` are
     marked responsive in BUILDER_WIDGET_CATALOG_2026-09-17.elementor.json;
     `heading.header_size` and `text-editor.drop_cap_view` are not. */
  const control = (kind, key) => FAMILY.defs.find((d) => d.kind === kind).controls.find((c) => c.key === key);
  assert.equal(control("heading", "align").responsive, true);
  assert.equal(control("heading", "header_size").responsive, undefined);
  assert.equal(control("paragraph", "text_columns").responsive, true);
  assert.equal(control("paragraph", "drop_cap_view").responsive, undefined);
});

test("the five wave-2 widgets are offered exactly where the offer file puts them", () => {
  const buildersOf = (kind) => FAMILY.defs.find((d) => d.kind === kind).builders.slice().sort();
  assert.deepEqual(buildersOf("heading"), ["landing", "mybrand", "newsletter", "proposal", "website"]);
  assert.deepEqual(buildersOf("paragraph"), ["landing", "mybrand", "newsletter", "proposal", "website"]);
  assert.deepEqual(buildersOf("html"), ["landing", "newsletter", "website"]);
  assert.deepEqual(buildersOf("shortcode"), ["landing", "website"]);
  assert.deepEqual(buildersOf("menu_anchor"), ["landing", "website"]);
});

test("the family's definition is the one the panel and every surface read", () => {
  /* The whole point of declaring an EXISTING kind: `mergeWidgetDefs` drops the
     legacy definition, so there is one Heading on the panel and it is this
     one. Executed against the merged registry, not read off this folder. */
  for (const kind of ["heading", "paragraph", "html", "shortcode", "menu_anchor"]) {
    const mine = FAMILY.defs.find((d) => d.kind === kind);
    assert.equal(WIDGETS_BY_KIND[kind].label, mine.label, kind);
    assert.equal(WIDGETS_BY_KIND[kind].controls.length, mine.controls.length, kind);
    assert.equal(WIDGETS_BY_KIND[kind].category, mine.category, kind);
  }
  // …and exactly one tile wears each of those names on the website panel.
  const labels = widgetsFor("website").map((w) => w.label);
  for (const label of ["Heading", "Text Editor", "HTML", "Shortcode", "Menu Anchor"]) {
    assert.equal(labels.filter((l) => l === label).length, 1, `${label} is drawn twice`);
  }
});

test("a document saved before this pass still draws, for all five kinds", () => {
  /* The reason a family reuses the stored id instead of inventing `heading_v2`.
     These are the props the legacy definitions wrote. */
  assert.match(draw("heading", { text: "Scope of work", level: 2, numbered: true }), /Scope of work/);
  assert.match(draw("paragraph", { text: "The old one control." }), /The old one control\./);
  assert.equal(draw("html", { html: "<i>old</i>" }), "<i>old</i>");
  assert.equal(draw("shortcode", { shortcode: "[old]" }), "[old]");
  assert.match(draw("menu_anchor", { anchor: "old" }, "edit"), /#old/);
});

test("a Shortcode draws NOTHING on a hosted landing page", () => {
  /* Without a landing renderer the page one answers instead, and in view mode
     that is the code ITSELF — `[ia_book_now]` in front of a visitor as literal
     text. A page LUMEN serves has no page engine to run a shortcode, so there
     is nothing it could become. LUMEN's `landingFamilies/f1-words.js` says the
     same thing on the server, and the tile stays on the panel because a landing
     page can also be published to WordPress, where it does run. */
  const fn = FAMILY.landingRenderers.shortcode;
  assert.ok(fn, "the hosted page falls back to the page renderer without this");
  assert.equal(fn({ id: "w1", kind: "shortcode", props: { shortcode: "[ia_book_now]" } }, { mode: "view" }), "");
  // …and the page renderer is still the one that puts it on a published page.
  assert.equal(draw("shortcode", { shortcode: "[ia_book_now]" }), "[ia_book_now]");
});

test("the Portal's mailbox font stack is the one LUMEN sends with", () => {
  /* Two copies of one rule, held equal by EXECUTING both ends: the string this
     family puts on a Blockquote is the string the adapter puts on an ordinary
     paragraph in the same email. The day somebody changes the fallbacks in one
     place, this names it instead of a client finding a quote set in Times. */
  const paragraph = emailSection("paragraph", { text: "Ordinary words." });
  const mine = mailboxFontStack("Helvetica");
  assert.ok(paragraph.includes(`font-family:${mine};`),
    `the adapter writes a different stack from the family's "${mine}"`);
});
