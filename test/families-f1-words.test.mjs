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

const KINDS = [
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

test("f1-words: the seven widgets this family builds, and only those", () => {
  assert.deepEqual(FAMILY.defs.map((d) => d.kind).sort(), [...KINDS].sort());
});

/* ── The panel, from the definition alone ──────────────────────────────── */

test("every widget carries Elementor's own title", () => {
  const titles = Object.fromEntries(FAMILY.defs.map((d) => [d.kind, d.label]));
  assert.deepEqual(titles, {
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
