// test/builder-engine.test.mjs — the ONE builder's engine
// (BUILDER_PLATFORM_SCOPE_2026-09-15 §3, step 2).
//
// What this pins, in the scope's words:
//   §3.1 "sections → 1-3 columns → widgets, serialised as JSON"
//   §3.2 the widget set, deterministically rendered
//   §8   "comparison cards deliberately do NOT sum"
//   §10  "proposals … one or MORE properties … its line items, its subtotal;
//         the total sums all properties"
//   §7   "open one, adjust it, save as a new template"
//
// MUTATION CHECKS, written down so the next person can re-run them:
//   · delete "priced_line" from totals.ts PRICED_KINDS   → "priced lines sum" red
//   · add "comparison_cards" to PRICED_KINDS             → "cards never sum" red
//   · drop the visibility filter in lineTotals()         → "internal" case red
//   · make merge.fill return the token in view mode      → "never leaks" red
//   · remove the widgets-move branch in setLayout()      → "3 → 1 keeps" red
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  addSection, addWidget, cloneSection, deserialise, duplicateSection, emptyDocument,
  getPropPath, makeSection, makeWidget, moveSection, moveWidget, patchSection,
  patchWidget, removeSection, removeWidget, resetIds, sectionNumbers, serialise,
  setLayout, setPropPath, walkWidgets,
} from "../src/builder/model.ts";
import { documentTotals, lineTotals, siteTotals, money, PRICED_KINDS } from "../src/builder/totals.ts";
import { fill, tokensIn, unfilledTokens, BUILTIN_TAGS } from "../src/builder/merge.ts";
import {
  renderDocument, renderSection, renderWidget, makeContext, RENDERED_KINDS,
  UNRENDERED_KINDS, esc,
} from "../src/builder/render.ts";
import { initHistory, push, undo, redo, canUndo, canRedo } from "../src/builder/history.ts";
import {
  PREMADE_SECTIONS, SHIPPED_TEMPLATES, hydrateClauses, searchPremade, templateByKey, premadeByKey,
} from "../src/builder/templates.ts";
import { upgradeV1, toWire, openProposalDocument, locationsUsedBy } from "../src/builder/proposalDoc.ts";
import { WIDGETS_BY_KIND, widgetsFor } from "../src/builder/registry.ts";

const FIXTURE = JSON.parse(
  readFileSync(path.join(process.cwd(), "test", "fixtures", "document-model-cases.json"), "utf8"),
);

/* ══════════════════════════════════════════════════════════════════════════
   The model
   ══════════════════════════════════════════════════════════════════════════ */

describe("the document model round-trips", () => {
  function sample() {
    resetIds();
    let doc = emptyDocument({ style: "plain", accent: "#0C4A60" });
    const s = makeSection({ label: "Pricing", numbered: true, layout: 2, padding: 30, theme: "dark" });
    doc = addSection(doc, s);
    doc = addWidget(doc, s.id, 0, makeWidget("heading", { text: "Pricing schedule", level: 2 }));
    doc = addWidget(doc, s.id, 1, makeWidget("paragraph", { text: "Two\n\nparagraphs" }));
    return doc;
  }

  test("serialise → deserialise loses nothing", () => {
    const doc = sample();
    const back = deserialise(serialise(doc));
    assert.deepEqual(back, doc);
  });

  test("a string, an object and a double round trip all agree", () => {
    const doc = sample();
    assert.deepEqual(deserialise(serialise(doc)), deserialise(deserialise(serialise(doc))));
    assert.deepEqual(deserialise(JSON.parse(serialise(doc))), doc);
  });

  test("junk becomes an empty document, never an exception", () => {
    for (const junk of [null, undefined, 42, "not json", "{}", { nope: true }, []]) {
      assert.deepEqual(deserialise(junk).sections, []);
    }
  });

  test("a widget kind this build has never heard of SURVIVES the round trip", () => {
    // Migration 166's rule: a newer editor's widget must not be deleted by an
    // older one that merely opened the document.
    const doc = deserialise({
      v: 2, settings: { style: "plain" },
      sections: [{ id: "s1", layout: 1, visibility: "customer", columns: [{ id: "c1", widgets: [
        { id: "w1", kind: "hologram_from_2029", props: { spin: 3 } },
      ] }] }],
    });
    assert.equal(doc.sections[0].columns[0].widgets[0].kind, "hologram_from_2029");
    assert.deepEqual(doc.sections[0].columns[0].widgets[0].props, { spin: 3 });
  });

  test("columns always match the layout, however odd the stored value", () => {
    const doc = deserialise({ v: 2, sections: [{ id: "s", layout: 3, columns: [{ id: "c", widgets: [] }] }] });
    assert.equal(doc.sections[0].columns.length, 3);
  });
});

describe("operations never mutate what they were given", () => {
  test("every operation returns a new document and leaves the old one alone", () => {
    resetIds();
    const s = makeSection({ label: "A" });
    const before = addSection(emptyDocument(), s);
    const snapshot = JSON.stringify(before);
    const ops = [
      () => addSection(before, makeSection({ label: "B" })),
      () => removeSection(before, s.id),
      () => duplicateSection(before, s.id),
      () => patchSection(before, s.id, { label: "changed" }),
      () => setLayout(before, s.id, 3),
      () => addWidget(before, s.id, 0, makeWidget("heading", { text: "x" })),
    ];
    for (const op of ops) {
      const after = op();
      assert.notEqual(after, before, "an operation returned the same object");
      assert.equal(JSON.stringify(before), snapshot, "an operation mutated its input");
    }
  });

  test("3 columns → 1 keeps every widget instead of deleting two columns of work", () => {
    resetIds();
    const s = makeSection({ layout: 3 });
    let doc = addSection(emptyDocument(), s);
    doc = addWidget(doc, s.id, 0, makeWidget("heading", { text: "one" }));
    doc = addWidget(doc, s.id, 1, makeWidget("heading", { text: "two" }));
    doc = addWidget(doc, s.id, 2, makeWidget("heading", { text: "three" }));
    const one = setLayout(doc, s.id, 1);
    assert.equal(one.sections[0].columns.length, 1);
    assert.deepEqual(
      one.sections[0].columns[0].widgets.map((w) => w.props.text),
      ["one", "two", "three"],
    );
  });

  test("a duplicate gets fresh ids — a copy that shares ids is not a copy", () => {
    resetIds();
    const s = makeSection({ label: "A" });
    let doc = addSection(emptyDocument(), s);
    doc = addWidget(doc, s.id, 0, makeWidget("heading", { text: "x" }));
    const dup = duplicateSection(doc, s.id);
    assert.equal(dup.sections.length, 2);
    assert.notEqual(dup.sections[0].id, dup.sections[1].id);
    assert.notEqual(
      dup.sections[0].columns[0].widgets[0].id,
      dup.sections[1].columns[0].widgets[0].id,
    );
    // and the props are a deep copy, not a shared reference
    const copy = cloneSection(doc.sections[0]);
    copy.columns[0].widgets[0].props.text = "changed";
    assert.equal(doc.sections[0].columns[0].widgets[0].props.text, "x");
  });

  test("moving a widget inside its column, and refusing to move past the ends", () => {
    resetIds();
    const s = makeSection();
    let doc = addSection(emptyDocument(), s);
    doc = addWidget(doc, s.id, 0, makeWidget("heading", { text: "first" }));
    doc = addWidget(doc, s.id, 0, makeWidget("heading", { text: "second" }));
    const path = { sectionId: s.id, columnIndex: 0, widgetIndex: 1 };
    const moved = moveWidget(doc, path, -1);
    assert.deepEqual(moved.sections[0].columns[0].widgets.map((w) => w.props.text), ["second", "first"]);
    const stuck = moveWidget(doc, { ...path, widgetIndex: 1 }, 1);
    assert.deepEqual(stuck.sections[0].columns[0].widgets.map((w) => w.props.text), ["first", "second"]);
  });

  test("moving a section to where it already is changes nothing", () => {
    resetIds();
    const s = makeSection({ label: "A" });
    const doc = addSection(emptyDocument(), s);
    assert.equal(moveSection(doc, s.id, 0), doc);
    assert.equal(moveSection(doc, "not-a-section", 1), doc);
  });

  test("numbering is computed, so reordering renumbers", () => {
    resetIds();
    const a = makeSection({ label: "Scope", numbered: true });
    const b = makeSection({ label: "Pricing", numbered: true });
    const c = makeSection({ label: "Note", numbered: false });
    let doc = addSection(addSection(addSection(emptyDocument(), a), b), c);
    assert.deepEqual(sectionNumbers(doc), { [a.id]: "01", [b.id]: "02" });
    doc = moveSection(doc, b.id, 0);
    assert.deepEqual(sectionNumbers(doc), { [b.id]: "01", [a.id]: "02" });
  });

  test("an internal section is never numbered in the customer's sequence", () => {
    resetIds();
    const a = makeSection({ label: "Scope", numbered: true });
    const hidden = makeSection({ label: "Crew note", numbered: true, visibility: "internal" });
    const b = makeSection({ label: "Pricing", numbered: true });
    const doc = addSection(addSection(addSection(emptyDocument(), a), hidden), b);
    assert.deepEqual(sectionNumbers(doc), { [a.id]: "01", [b.id]: "02" });
  });
});

describe("prop paths — what the canvas types into is where the model stores it", () => {
  test("a nested array path writes exactly one place", () => {
    const props = { cards: [{ name: "A", features: ["x", "y"] }, { name: "B" }] };
    const next = setPropPath(props, "cards.0.features.1", "changed");
    assert.equal(getPropPath(next, "cards.0.features.1"), "changed");
    assert.equal(getPropPath(next, "cards.0.features.0"), "x");
    assert.equal(getPropPath(next, "cards.1.name"), "B");
    assert.equal(props.cards[0].features[1], "y", "the original was mutated");
  });

  test("a path into nothing creates the shape rather than throwing", () => {
    const next = setPropPath({}, "rows.2.label", "Trigger");
    assert.equal(getPropPath(next, "rows.2.label"), "Trigger");
    assert.ok(Array.isArray(next.rows));
  });

  test("every data-edit path the renderer stamps can be written back", () => {
    // The renderer and the editor agree on the path vocabulary or in-place
    // editing writes into the wrong field. This proves it for real markup.
    const doc = deserialise({
      v: 2, sections: [{ id: "s", layout: 1, visibility: "customer", columns: [{ id: "c", widgets: [
        { id: "w", kind: "comparison_cards", props: { heading: "H", cards: [{ name: "A", features: ["f"] }] } },
      ] }] }],
    });
    // The composite is upgraded on the way in (D-156), so what the renderer
    // stamps is the ATOMIC card's own paths — `title`, `bullets.0` — and the
    // editor writes them back into that card's own props.
    const html = renderSection(doc.sections[0], makeContext(doc, { mode: "edit" }));
    const paths = [...html.matchAll(/data-edit="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(paths.includes("title"), "the card's name is not editable in place");
    assert.ok(paths.includes("bullets.0"), "the card's included line is not editable in place");
    // Every path the renderer stamped writes back into SOME node of the tree —
    // the heading, the card, the box. The vocabulary is the node's own, which
    // is the whole point of an atomic widget.
    const nodes = [];
    const walk = (list) => { for (const n of list) { nodes.push(n); if (Array.isArray(n.children)) walk(n.children); } };
    walk(doc.sections[0].columns[0].widgets);
    for (const path of paths) {
      const owner = nodes.find((n) => n.props && path.split(".")[0] in n.props);
      assert.ok(owner, `nothing in the tree stores ${path}`);
      const next = setPropPath(owner.props, path, "typed");
      assert.equal(getPropPath(next, path), "typed", `writing back to ${path} failed`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Undo / redo
   ══════════════════════════════════════════════════════════════════════════ */

describe("undo and redo", () => {
  const A = emptyDocument({ style: "a" });
  const B = emptyDocument({ style: "b" });
  const C = emptyDocument({ style: "c" });

  test("walks back and forward through the documents themselves", () => {
    let h = initHistory(A);
    assert.equal(canUndo(h), false);
    h = push(h, B);
    h = push(h, C);
    assert.equal(h.present, C);
    h = undo(h);
    assert.equal(h.present, B);
    h = undo(h);
    assert.equal(h.present, A);
    assert.equal(canUndo(h), false);
    h = redo(h);
    assert.equal(h.present, B);
    h = redo(h);
    assert.equal(h.present, C);
    assert.equal(canRedo(h), false);
  });

  test("typing into one field is ONE undo step, typing into another is two", () => {
    let h = initHistory(A);
    h = push(h, B, "w1:text");
    h = push(h, C, "w1:text");
    assert.equal(h.past.length, 1, "each keystroke stacked its own undo step");
    h = undo(h);
    assert.equal(h.present, A);

    let g = initHistory(A);
    g = push(g, B, "w1:text");
    g = push(g, C, "w2:text");
    assert.equal(g.past.length, 2);
  });

  test("a new edit after an undo drops the redo branch", () => {
    let h = initHistory(A);
    h = push(h, B);
    h = undo(h);
    assert.equal(canRedo(h), true);
    h = push(h, C);
    assert.equal(canRedo(h), false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Money — the shared fixture
   ══════════════════════════════════════════════════════════════════════════ */

describe("money, against the fixture oliver-api runs too", () => {
  for (const c of FIXTURE.cases) {
    test(c.name, () => {
      const doc = deserialise(c.document);
      const t = documentTotals(doc, c.options);
      assert.equal(t.subtotal, c.expect.subtotal, "subtotal");
      assert.equal(t.tax, c.expect.tax, "tax");
      assert.equal(t.total, c.expect.total, "total");
      assert.equal(t.lines.length, c.expect.line_count, "line count");
      assert.deepEqual(
        t.sites.map((s) => ({ name: s.name, subtotal: s.subtotal })),
        c.expect.sites,
        "per-site subtotals",
      );
      if (c.expect.first_line_description) {
        assert.equal(t.lines[0].description, c.expect.first_line_description);
      }
    });
  }

  test("the priced list is the guard — cards and pricing tables are not on it", () => {
    // MUTATION: add "card" or "catalog_card" to PRICED_KINDS and the first
    // fixture case goes red. This test says what the list must be.
    //   price_line   D-156's atomic line of money
    //   priced_line  the same thing under its old name — the rename is what
    //                "folded into" means, and a line that reached a page
    //                without passing through `deserialise` still counts
    // `property_block` was here and is GONE: a property is a box holding
    // priced lines, so its money is on the lines themselves.
    assert.deepEqual([...PRICED_KINDS], ["price_line", "priced_line"]);
  });

  test("a site's lines are counted in its subtotal AND in the total, exactly once", () => {
    const multi = FIXTURE.cases.find((c) => c.name.startsWith("multi-site"));
    const doc = deserialise(multi.document);
    const sites = siteTotals(doc);
    const lines = lineTotals(doc);
    assert.equal(
      sites.reduce((n, s) => n + s.lines.length, 0),
      lines.length,
      "a line was counted twice, or not at all",
    );
    assert.equal(
      Math.round(sites.reduce((n, s) => n + s.subtotal, 0) * 100) / 100,
      documentTotals(doc).total,
      "the sites do not add up to the one total",
    );
  });

  test("money reads the way a customer reads it", () => {
    assert.equal(money(4520), "$4,520.00");
    assert.equal(money(0.5), "$0.50");
    assert.equal(money(null), "$0.00");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Merge fields
   ══════════════════════════════════════════════════════════════════════════ */

describe("merge fields, against the fixture oliver-api runs too", () => {
  for (const c of FIXTURE.merge_cases) {
    test(c.name, () => {
      assert.equal(fill(c.text, c.context, "view"), c.view);
      assert.deepEqual(unfilledTokens([c.text], c.context), c.unfilled);
    });
  }

  test("a token NEVER reaches the customer as a token", () => {
    // MUTATION: make fill() return `whole` in view mode and this goes red.
    const out = fill("Rate {{plow_rate}} per push", {}, "view");
    assert.ok(!out.includes("{{"), `a raw token leaked: ${out}`);
    assert.ok(!out.includes("plow_rate"), `the token name leaked: ${out}`);
  });

  test("the AUTHOR still sees the token, so they can fix it", () => {
    assert.equal(fill("Rate {{plow_rate}}", {}, "edit"), "Rate {{plow_rate}}");
  });

  test("every built-in tag has a plain-English label and a group", () => {
    for (const t of BUILTIN_TAGS) {
      assert.ok(t.label && t.label[0] === t.label[0].toUpperCase(), `${t.token} has no readable label`);
      assert.ok(["Customer", "Property", "Agreement", "Your business"].includes(t.group));
    }
    assert.equal(new Set(BUILTIN_TAGS.map((t) => t.token)).size, BUILTIN_TAGS.length, "duplicate token");
  });

  test("tokensIn finds each token once, in order", () => {
    assert.deepEqual(tokensIn("{{a}} {{b}} {{a}}"), ["a", "b"]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   The renderer
   ══════════════════════════════════════════════════════════════════════════ */

describe("the ONE renderer", () => {
  function doc(widgets, section = {}) {
    return deserialise({
      v: 2, settings: { style: "plain" },
      sections: [{ id: "s1", layout: 1, visibility: "customer", ...section, columns: [{ id: "c1", widgets }] }],
    });
  }
  const ctx = (d, over = {}) => makeContext(d, { mode: "view", business: { name: "Rolling In It, LLC" }, ...over });

  test("it escapes — a customer name with an angle bracket is not markup", () => {
    const d = doc([{ id: "w", kind: "heading", props: { text: "<script>alert(1)</script>" } }]);
    const html = renderDocument(d, ctx(d));
    assert.ok(!html.includes("<script>"), "raw markup got through");
    assert.ok(html.includes("&lt;script&gt;"));
    assert.equal(esc('a&b<c>"d"'), "a&amp;b&lt;c&gt;&quot;d&quot;");
  });

  test("an internal section is absent from the customer's copy and present for the author", () => {
    const d = doc([{ id: "w", kind: "paragraph", props: { text: "our cost is 320" } }], { visibility: "internal" });
    assert.equal(renderSection(d.sections[0], ctx(d)), "");
    assert.ok(renderSection(d.sections[0], makeContext(d, { mode: "edit" })).includes("our cost"));
  });

  test("comparison cards say on the page that they are not in any total", () => {
    const d = doc([{ id: "w", kind: "comparison_cards", props: { cards: [{ name: "A" }, { name: "B", recommended: true }] } }]);
    const html = renderDocument(d, ctx(d));
    assert.ok(/not added to any total/i.test(html), "the page does not say cards never sum");
    assert.ok(html.includes("Recommended"), "the recommended badge is missing");
  });

  test("a property block prints its own subtotal", () => {
    const multi = FIXTURE.cases.find((c) => c.name.startsWith("multi-site"));
    const d = deserialise(multi.document);
    const html = renderDocument(d, ctx(d));
    assert.ok(html.includes("$3,360.00"), "Des Moines subtotal missing");
    assert.ok(html.includes("$1,160.00"), "Waukee subtotal missing");
    assert.ok(html.includes("$4,520.00"), "the one total is missing");
    assert.equal((html.match(/Subtotal for this property/g) || []).length, 2);
  });

  test("the same document renders the same HTML twice — deterministic, so a snapshot means something", () => {
    const d = deserialise(FIXTURE.cases[0].document);
    assert.equal(renderDocument(d, ctx(d)), renderDocument(d, ctx(d)));
  });

  test("every widget the proposal builder offers is a kind the renderer draws", () => {
    // MUTATION: add a widget to the registry with the "proposal" adapter and
    // no renderer branch, and this names it.
    const missing = widgetsFor("proposal").map((w) => w.kind)
      .filter((k) => !RENDERED_KINDS.includes(k) && !UNRENDERED_KINDS.includes(k));
    assert.deepEqual(missing, [], `offered but not rendered: ${missing.join(", ")}`);
  });

  test("an unknown kind is inert for the customer and explained to the author", () => {
    const d = doc([{ id: "w", kind: "hologram", props: {} }]);
    assert.ok(!renderDocument(d, ctx(d)).includes("hologram"));
    assert.ok(renderDocument(d, makeContext(d, { mode: "edit" })).includes("needs a newer version"));
  });

  test("the section's own settings reach the markup", () => {
    const d = doc([{ id: "w", kind: "paragraph", props: { text: "x" } }],
      { background: "#0B1C24", theme: "dark", padding: 40, width: "narrow", pageBreakBefore: true, recommended: true });
    const html = renderSection(d.sections[0], ctx(d));
    assert.ok(html.includes("background:#0B1C24"));
    assert.ok(html.includes("padding:40px"));
    assert.ok(html.includes("bx-w-narrow"));
    assert.ok(html.includes("bx-break"));
    assert.ok(html.includes("Recommended"));
  });

  test("the stylesheet travels with the renderer", () => {
    const d = doc([]);
    assert.ok(renderDocument(d, ctx(d)).includes("bx-doc"));
    // A consumer cannot forget to import a string that is exported beside it.
    assert.ok(String(renderWidget({ id: "w", kind: "divider", props: {} }, ctx(d))).includes("bx-divider"));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Templates — never a blank page
   ══════════════════════════════════════════════════════════════════════════ */

describe("templates and pre-made sections (§7)", () => {
  test("every shipped template builds a document, and says what it is FOR", () => {
    // §11.9 / D-146: three templates named after clients became eight named
    // after jobs, and `description` (what it LOOKS like) became `useCase`.
    assert.equal(SHIPPED_TEMPLATES.length, 8);
    for (const t of SHIPPED_TEMPLATES) {
      const doc = t.build();
      assert.ok(doc.sections.length >= 4, `${t.key} built ${doc.sections.length} sections`);
      assert.ok(t.useCase && t.useCase.length > 40, `${t.key} has no readable use case`);
      assert.ok(t.purpose && t.purpose.length > 3, `${t.key} has no purpose badge`);
      assert.ok(t.businessTypes.length > 0, `${t.key} is for nobody`);
      assert.equal(t.description, undefined, `${t.key} still carries a description`);
    }
  });

  test("the seasonal service agreement carries the whole shape: title, terms, pricing, signature, property plan", () => {
    const doc = templateByKey("service_agreement").build();
    const kinds = walkWidgets(doc).map((x) => x.widget.kind);
    // `key_facts` is `key_fact` now, one widget per row (D-156).
    for (const k of ["doc_header", "key_fact", "clauses", "pricing_table", "callout", "signature", "property_plan"]) {
      assert.ok(kinds.includes(k), `the agreement template has no ${k}`);
    }
    const labels = doc.sections.map((s) => s.label);
    assert.ok(labels.includes("Billing & payment"));
    assert.ok(labels.includes("General terms"));
    assert.ok(labels.indexOf("Billing & payment") < labels.indexOf("General terms"), "billing must come before general terms");
    assert.ok(doc.sections.some((s) => s.pageBreakBefore), "the property plan does not start a new page");
  });

  test("the platform proposal carries tier cards and a total", () => {
    const kinds = walkWidgets(templateByKey("platform_proposal").build()).map((x) => x.widget.kind);
    // Three CARDS, each its own widget, not one comparison-cards lump (D-156).
    assert.equal(kinds.filter((k) => k === "card").length, 3);
    assert.ok(!kinds.includes("comparison_cards"), "a shipped template still ships a lump");
    assert.ok(kinds.includes("totals"));
  });

  test("clause slots are filled from the business's library, by KEY not by words", () => {
    const doc = templateByKey("service_agreement").build();
    const library = [
      { clause_key: "snow_plowing", title: "Snow plowing", body: "Contractor will plow." },
      { clause_key: "service_trigger", title: "Service trigger", body: "Two inches." },
    ];
    const filled = hydrateClauses(doc, library);
    const clauses = walkWidgets(filled).filter((x) => x.widget.kind === "clauses");
    const scope = clauses.find((c) => (c.widget.props.libraryKeys || []).includes("snow_plowing"));
    assert.ok(scope, "the scope section lost its library keys");
    assert.deepEqual(scope.widget.props.items.map((i) => i.title), ["Snow plowing", "Service trigger"]);
  });

  test("a key with no clause in the library is DROPPED, never left as an empty numbered paragraph", () => {
    const doc = templateByKey("service_agreement").build();
    const filled = hydrateClauses(doc, [{ clause_key: "snow_plowing", title: "Snow plowing", body: "b" }]);
    for (const { widget } of walkWidgets(filled)) {
      if (widget.kind !== "clauses" || !Array.isArray(widget.props.items)) continue;
      for (const item of widget.props.items) {
        if (item.clause_key) assert.ok(item.title && item.body, "an empty clause survived hydration");
      }
    }
  });

  test("every pre-made section has a picture-worthy name and one readable line", () => {
    assert.ok(PREMADE_SECTIONS.length >= 10, `only ${PREMADE_SECTIONS.length} pre-made sections`);
    for (const p of PREMADE_SECTIONS) {
      assert.ok(p.name && p.name.length > 3, `${p.key} has no name`);
      assert.ok(p.description && p.description.split(" ").length >= 6, `${p.key}'s line is not a sentence`);
      assert.ok(p.tags.length > 0, `${p.key} is in no gallery filter`);
      const section = p.build();
      assert.ok(section.columns[0].widgets.length > 0, `${p.key} places nothing`);
    }
    assert.equal(new Set(PREMADE_SECTIONS.map((p) => p.key)).size, PREMADE_SECTIONS.length);
  });

  test("the gallery's search matches the name, the line and the filter", () => {
    assert.ok(searchPremade("signature").some((p) => p.key === "acceptance"));
    assert.ok(searchPremade("storm").some((p) => p.key === "pricing"), "searching the DESCRIPTION found nothing");
    assert.ok(searchPremade("", "Property").every((p) => p.tags.includes("Property")));
    assert.deepEqual(searchPremade("zzzznothing"), []);
  });

  test("every widget a pre-made section places is in the registry and offered to proposals", () => {
    // AT EVERY DEPTH (D-156): a ready-made section is a tree now, and a card
    // three levels down that nothing draws is the same defect as one at the
    // top. A CONTAINER is the engine's own node — it has no registry entry by
    // design, because no adapter decides whether to offer a box — so it is
    // walked through rather than looked up.
    const walk = (nodes, p) => {
      for (const w of nodes) {
        if (w.kind === "container") { walk(w.children || [], p); continue; }
        const def = WIDGETS_BY_KIND[w.kind];
        assert.ok(def, `${p.key} places "${w.kind}", which is not in the registry`);
        assert.ok(def.adapters.includes("proposal"), `${p.key} places "${w.kind}", which proposals may not use`);
      }
    };
    for (const p of PREMADE_SECTIONS) walk(p.build().columns[0].widgets, p);
  });

  test("premadeByKey finds what the gallery lists", () => {
    for (const p of PREMADE_SECTIONS) assert.equal(premadeByKey(p.key)?.name, p.name);
    assert.equal(premadeByKey("nope"), undefined);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   The proposal adapter's pure half
   ══════════════════════════════════════════════════════════════════════════ */

describe("opening a proposal written by the old editor", () => {
  const v1 = {
    v: 1,
    blocks: [
      { kind: "text", heading: "Overview", body: "Two\n\nparagraphs" },
      { kind: "service", name: "Plowing", description: "d", features: ["a", "b"], quantity: 2, unit_price: 185, cadence: "billed monthly", offering_id: "o1", price_id: "p1" },
      { kind: "line", description: "Salt", quantity: 1, unit_price: 210 },
      { kind: "cards", heading: "Tiers", intro: "i", items: [{ name: "Std", price: "$8", features: ["x"] }, { name: "Pro", recommended: true }] },
      { kind: "callout", heading: "Note", panels: [{ title: "In", tone: "accent", items: ["a", "b"] }, { title: "Out", tone: "warn", items: ["c"] }] },
      { kind: "buckets", heading: "At a glance", groups: [{ title: "Now", total: "$100", rows: [{ label: "x", amount: "$100" }] }] },
      { kind: "signature", heading: "Agreement", parties: [{ name: "Customer" }, { name: "Rolling In It" }] },
    ],
  };

  test("every one of the seven implemented block kinds becomes a widget — nothing is dropped", () => {
    const doc = upgradeV1(v1);
    const kinds = walkWidgets(doc).map((x) => x.widget.kind);
    assert.ok(kinds.includes("heading") && kinds.includes("paragraph"), "text");
    // The v1 door runs the SAME D-156 upgrade the stored door runs, so a
    // pre-builder proposal opens as the tree too — one model on the screen.
    assert.equal(kinds.filter((k) => k === "price_line").length, 2, "service + line");
    assert.ok(kinds.includes("card"), "cards");
    assert.ok(kinds.includes("callout"), "callout");
    assert.ok(kinds.includes("key_value_table"), "buckets");
    assert.ok(kinds.includes("signature"), "signature");
  });

  test("the money survives the upgrade exactly", () => {
    const t = documentTotals(upgradeV1(v1));
    assert.equal(t.subtotal, 2 * 185 + 210);
    assert.equal(t.lines[0].description, "Plowing (billed monthly)");
    assert.equal(t.lines[0].offering_id, "o1");
    assert.equal(t.lines[0].price_id, "p1");
  });

  test("an unknown v1 block becomes visible prose rather than vanishing", () => {
    const doc = upgradeV1({ v: 1, blocks: [{ kind: "cover", heading: "Cover", body: "words" }] });
    assert.equal(walkWidgets(doc).length, 1);
    assert.ok(String(walkWidgets(doc)[0].widget.props.text).includes("Cover"));
  });

  test("document_json wins over blocks, and neither present means the caller picks a template", () => {
    const withDoc = { document_json: FIXTURE.cases[1].document, blocks: v1 };
    assert.equal(openProposalDocument(withDoc).sections.length, 1);
    assert.equal(walkWidgets(openProposalDocument(withDoc))[0].widget.kind, "price_line");
    assert.ok(openProposalDocument({ blocks: v1 }));
    assert.equal(openProposalDocument({}), null);
  });
});

describe("what goes on the wire", () => {
  test("line_items, totals and a narrative all come from the ONE document", () => {
    const doc = deserialise(FIXTURE.cases[2].document);   // multi-site
    const wire = toWire(doc, { business: { name: "Rolling In It, LLC" } });
    assert.equal(wire.subtotal, 4520);
    assert.equal(wire.total, 4520);
    assert.equal(wire.line_items.length, 3);
    assert.equal(wire.line_items[0].service_location_id, "aaaaaaaa-0000-4000-8000-000000000001");
    assert.ok(wire.scope_html.includes("Des Moines campus"), "the narrative is not the document");
    assert.equal(wire.document, doc, "the document must ride as itself");
  });

  test("the locations the document PRICES are the locations it covers", () => {
    // Accepting opens a job per location from this list. A site priced on the
    // page and missing from it gets no job and no address on the customer's
    // copy — which is what happened before this existed.
    const doc = deserialise(FIXTURE.cases[2].document);   // multi-site
    assert.deepEqual(locationsUsedBy(doc), [
      "aaaaaaaa-0000-4000-8000-000000000001",
      "aaaaaaaa-0000-4000-8000-000000000002",
    ]);
  });

  test("an internal section's location is not a location the customer is billed for", () => {
    const doc = deserialise({
      v: 2, sections: [{ id: "s", layout: 1, visibility: "internal", columns: [{ id: "c", widgets: [
        { id: "w", kind: "property_block", props: { locationId: "aaaaaaaa-0000-4000-8000-000000000009", items: [] } },
      ] }] }],
    });
    assert.deepEqual(locationsUsedBy(doc), []);
  });

  test("a comparison card never becomes a line item", () => {
    const doc = deserialise(FIXTURE.cases[0].document);
    const wire = toWire(doc);
    assert.deepEqual(wire.line_items, []);
    assert.equal(wire.total, 0);
  });

  test("the v1 blocks written alongside are honest about the priced parts", () => {
    const doc = deserialise(FIXTURE.cases[1].document);
    const wire = toWire(doc);
    const services = wire.blocks.blocks.filter((b) => b.kind === "service");
    assert.equal(services.length, 2);
    assert.equal(services[0].name, "Seasonal Plow Contract");
  });
});
