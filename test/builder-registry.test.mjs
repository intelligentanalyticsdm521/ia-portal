// test/builder-registry.test.mjs — ONE widget registry
// (BUILDER_PLATFORM_SCOPE_2026-09-15 §3.2, step 0).
//
// What this pins, in the scope doc's words: "every registered widget has label,
// description, picture and at least one adapter; the pane renders them
// grouped".
//
// The acceptance row behind it is SD-010's: "could a client build this without
// reading anything?" — which is won or lost in the one-line description, so
// these tests check that the sentence is real prose a business owner could
// read, not a restatement of the kind.
//
// Mutation check: blank any widget's description and the first block goes red;
// delete `title=` from the pane's button and the tooltip test goes red.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  WIDGETS,
  WIDGETS_BY_KIND,
  WIDGET_CATEGORIES,
  BUILDER_ADAPTERS,
  widgetsFor,
  groupForPane,
  widgetTooltip,
  pictureFrom,
} from "../src/builder/registry.ts";

const SRC = path.join(process.cwd(), "src");

/**
 * The widgets that legitimately have NO controls, each with its reason.
 *
 * Kept as an explicit list rather than by relaxing the assertion: a widget with
 * no controls is nearly always a half-finished definition, and the only way to
 * tell the difference is to make somebody write the reason down here.
 *   page_break — it has no properties. It is a break.
 *   columns    — it is a LAYOUT action; the count it asks for is the section's
 *                column count, and the section toolbar owns it from then on.
 *   site_*     — a WEBSITE section's properties are the ARION field spec, which
 *                arion-api sends with the section catalogue so there is ONE
 *                description of a section and it lives in sectionSchema.js.
 *                Copying it here would be the second copy this whole rebuild
 *                exists to delete. `SiteInspectorExtras` renders from the
 *                server's spec; the registry only says what the SECTION is.
 */
const NO_CONTROLS = new Set(["page_break", "columns"]);
const isSiteSection = (kind) => kind.startsWith("site_");

describe("every registered widget is complete", () => {
  for (const w of WIDGETS) {
    test(`${w.kind} has a label, a description, a picture and an adapter`, () => {
      assert.ok(w.label && w.label.trim().length > 0, "no label");
      assert.ok(w.description && w.description.trim().length > 0, "no description");
      assert.ok(w.picture && w.picture.startsWith("data:image/svg+xml,"), "no picture");
      assert.ok(Array.isArray(w.adapters) && w.adapters.length > 0, "no adapter");
      assert.ok(w.icon && w.icon.trim().length > 0, "no icon");
      assert.ok(WIDGET_CATEGORIES.includes(w.category), `category "${w.category}" is not in the pane`);
      assert.ok(w.defaults && typeof w.defaults === "object", "no defaults");
      assert.ok(Array.isArray(w.controls), "controls must be an array");
      if (!NO_CONTROLS.has(w.kind) && !isSiteSection(w.kind)) {
        assert.ok(w.controls.length > 0, "no controls");
      }
    });
  }

  test("kinds are unique", () => {
    const kinds = WIDGETS.map((w) => w.kind);
    assert.equal(new Set(kinds).size, kinds.length, "two widgets share a kind");
  });

  test("every adapter named is a real adapter", () => {
    for (const w of WIDGETS) {
      for (const a of w.adapters) {
        assert.ok(BUILDER_ADAPTERS.includes(a), `${w.kind} claims unknown adapter "${a}"`);
      }
    }
  });

  test("WIDGETS_BY_KIND covers the whole list", () => {
    assert.equal(Object.keys(WIDGETS_BY_KIND).length, WIDGETS.length);
  });
});

describe("the description is a sentence a business owner could read", () => {
  for (const w of WIDGETS) {
    test(`${w.kind}: one line, plain words`, () => {
      const d = w.description;
      assert.ok(!d.includes("\n"), "a description is ONE line");
      assert.ok(d.length >= 25, `"${d}" is too short to explain anything`);
      assert.ok(d.length <= 140, `"${d}" will not fit beside a picture in a 320px pane`);
      // Not a restatement of the label ("Heading — a heading").
      assert.ok(d.toLowerCase().trim() !== w.label.toLowerCase().trim(), "the description repeats the label");
      // No developer vocabulary. The inventory's finding was five vocabularies
      // and no explanations; this is the line that has to fix it.
      for (const jargon of ["json", "blocks_json", "elementor", "widget tree", "flex", "schema", "payload", "adapter", "div"]) {
        assert.ok(!d.toLowerCase().includes(jargon), `"${d}" says "${jargon}" to a business owner`);
      }
    });
  }

  test("the tooltip carries both the name and the sentence", () => {
    const w = WIDGETS[0];
    assert.equal(widgetTooltip(w), `${w.label} — ${w.description}`);
  });
});

describe("§3.2's union is registered", () => {
  // The candidate list from the scope doc, by the kind we settled on.
  const REQUIRED = [
    "heading", "paragraph", "image", "button", "divider", "spacer", "list",
    "key_value_table", "data_table", "priced_line", "comparison_cards",
    "callout", "totals", "signature", "footer_note", "merge_field", "form",
    "map", "video", "social_links", "countdown", "testimonial", "logo_strip",
    "pricing_table", "gallery",
    // Added 2026-09-16 by §8 — the parts the Rolling In It agreement proved a
    // document has and a web page does not. Each maps to a numbered item:
    //   doc_header     §8 item 1 (header/title with style presets)
    //   clauses        §8 item 3 (numbered clauses from the clause library)
    //   property_plan  §8 item 5 (property service plan, crew-visible)
    //   key_facts      §8 item 7 (merge fields filled from the customer)
    //   property_block §10       (one block per site, its own subtotal)
    //   page_break, columns      document layout the canvas needs
    "doc_header", "key_facts", "clauses", "property_plan", "property_block",
    "page_break", "columns",
    // Added 2026-09-16 by §5 step 5 — My Brand's Template Studio on the shared
    // shell. Seven placed OBJECTS a pixel canvas has and a flowing page does
    // not; the studio's other eight tools are registry entries that already
    // existed (heading, paragraph, list, image, gallery, divider, button,
    // callout), which is what stops the studio inventing a ninth vocabulary.
    "brand_logo", "shape", "icon", "colour_block", "background", "qr_code",
    "social_handle",
    // Added 2026-09-16 by §4 step 3 — the WEBSITE adapter. One per ARION
    // section kind (arion-api sectionSchema.js SECTION_KINDS), pinned against
    // that list by website-builder.test.mjs through the shared fixture, plus
    // `site_custom` for a section built on the website itself.
    "site_hero", "site_services", "site_about", "site_pricing", "site_testimonials",
    "site_gallery", "site_team", "site_stats", "site_faq", "site_cta", "site_contact",
    "site_content", "site_custom",
  ];

  for (const kind of REQUIRED) {
    test(`${kind} is defined`, () => {
      assert.ok(WIDGETS_BY_KIND[kind], `§3.2 lists ${kind} and the registry has no definition for it`);
    });
  }

  test("nothing extra crept in without being scoped", () => {
    const extra = WIDGETS.map((w) => w.kind).filter((k) => !REQUIRED.includes(k));
    assert.deepEqual(extra, [], `unscoped widget(s): ${extra.join(", ")}`);
  });
});

describe("adapters keep a widget out of a builder that cannot render it", () => {
  test("a countdown is an email/landing trick, never a proposal", () => {
    assert.ok(!WIDGETS_BY_KIND.countdown.adapters.includes("proposal"));
  });

  test("a priced line and a signature belong to documents only", () => {
    assert.deepEqual(WIDGETS_BY_KIND.priced_line.adapters, ["proposal"]);
    assert.deepEqual(WIDGETS_BY_KIND.signature.adapters, ["proposal"]);
  });

  test("a form is a web thing — a proposal cannot host one", () => {
    assert.ok(!WIDGETS_BY_KIND.form.adapters.includes("proposal"));
    assert.ok(!WIDGETS_BY_KIND.form.adapters.includes("email"));
  });

  test("a website section is offered to the website builder and nowhere else", () => {
    for (const w of WIDGETS.filter((x) => x.kind.startsWith("site_"))) {
      assert.deepEqual(w.adapters, ["website"], `${w.kind} is offered somewhere it cannot render`);
    }
  });

  test("every adapter gets a usable set, not an empty pane", () => {
    for (const a of BUILDER_ADAPTERS) {
      assert.ok(widgetsFor(a).length >= 5, `the ${a} builder would open with ${widgetsFor(a).length} widgets`);
    }
  });

  test("the text basics are available everywhere", () => {
    for (const kind of ["heading", "paragraph", "image", "button", "divider"]) {
      assert.deepEqual(
        [...WIDGETS_BY_KIND[kind].adapters].sort(),
        [...BUILDER_ADAPTERS].sort(),
        `${kind} should be offered by every builder`,
      );
    }
  });

  test("a flow widget is not offered to the pixel canvas", () => {
    // §5 step 5. On a 1080×1080 square every object carries its own x, y, w and
    // h, so "how much space below this" and "split this into two columns" have
    // nothing to act on. Naming the four here is what stops a later ALL from
    // quietly putting a spacer back in the Template Studio's pane.
    for (const kind of ["spacer", "columns", "key_value_table", "data_table"]) {
      assert.ok(
        !WIDGETS_BY_KIND[kind].adapters.includes("brand"),
        `${kind} means nothing on an absolute-pixel canvas`,
      );
    }
    // Space and columns ARE what a flow is, so all four flow builders keep them.
    for (const kind of ["spacer", "columns"]) {
      assert.deepEqual(
        [...WIDGETS_BY_KIND[kind].adapters].sort(),
        ["email", "landing", "proposal", "website"],
        `${kind} should still be offered to every FLOW builder`,
      );
    }
    // The two small tables lose "website" as well — §4 step 3: on an ARION
    // site that job is a whole SECTION the server builds (site_stats for a
    // details list, content for a plain table), and offering both would be
    // the two-mechanisms-for-one-job this rebuild exists to end. The list
    // itself lives in registry.ts as WEBSITE_USES_A_SECTION_INSTEAD, which
    // website-builder.test.mjs reads; here we pin what is LEFT.
    for (const kind of ["key_value_table", "data_table"]) {
      assert.deepEqual(
        [...WIDGETS_BY_KIND[kind].adapters].sort(),
        ["email", "landing", "proposal"],
        `${kind} should be offered to every flow builder that is not a website`,
      );
    }
  });

  test("the studio's own tools belong to the studio and nowhere else", () => {
    for (const kind of ["brand_logo", "shape", "icon", "colour_block", "background", "qr_code", "social_handle"]) {
      assert.deepEqual(WIDGETS_BY_KIND[kind].adapters, ["brand"], `${kind} is a placed object, not page furniture`);
    }
  });

  test("the Template Studio's pane covers every tool §5 step 5 names", () => {
    // The eleven Brandon listed, by the kind that serves each one.
    const kinds = widgetsFor("brand").map((w) => w.kind);
    for (const kind of [
      "paragraph", "heading", "image", "brand_logo", "shape", "icon",
      "colour_block", "background", "qr_code", "social_handle", "callout",
    ]) {
      assert.ok(kinds.includes(kind), `the studio's pane is missing ${kind}`);
    }
  });
});

describe("guided counts — SD-010's \"how many cards?\"", () => {
  test("comparison cards ask, and the range is 2 to 6", () => {
    const c = WIDGETS_BY_KIND.comparison_cards.count;
    assert.ok(c, "comparison cards must ask how many");
    assert.equal(c.min, 2);
    assert.equal(c.max, 6);
    assert.ok(c.default >= c.min && c.default <= c.max);
    assert.match(c.label, /how many/i);
  });

  test("every count is a sane range with a default inside it, asked in words", () => {
    for (const w of WIDGETS.filter((x) => x.count)) {
      const c = w.count;
      assert.ok(c.min >= 1 && c.max > c.min, `${w.kind} has a nonsense range`);
      assert.ok(c.default >= c.min && c.default <= c.max, `${w.kind}'s default is outside its range`);
      assert.match(c.label, /\?$/, `${w.kind}'s count prompt is not a question`);
    }
  });

  test("a widget that does not repeat asks nothing", () => {
    assert.equal(WIDGETS_BY_KIND.paragraph.count, undefined);
    assert.equal(WIDGETS_BY_KIND.divider.count, undefined);
  });
});

describe("the pane groups them", () => {
  test("groupForPane returns categories in pane order, empties dropped", () => {
    const groups = groupForPane("proposal");
    const names = groups.map((g) => g.category);
    assert.deepEqual(names, WIDGET_CATEGORIES.filter((c) => names.includes(c)));
    for (const g of groups) assert.ok(g.widgets.length > 0, `${g.category} came back empty`);
  });

  test("a group only contains widgets that builder may use", () => {
    for (const g of groupForPane("email")) {
      for (const w of g.widgets) {
        assert.ok(w.adapters.includes("email"), `${w.kind} is offered to the email builder and cannot render there`);
        assert.equal(w.category, g.category);
      }
    }
  });

  test("search matches the DESCRIPTION, not just the label", () => {
    // Nothing is called "Recommended"; the comparison-card sentence says it.
    const hits = groupForPane("proposal", "recommended").flatMap((g) => g.widgets.map((w) => w.kind));
    assert.ok(hits.includes("comparison_cards"), "searching the words people actually use must work");
  });

  test("an unmatched search returns nothing rather than everything", () => {
    assert.deepEqual(groupForPane("proposal", "zzzzz"), []);
  });

  test("a picture is a real SVG data URI that decodes", () => {
    const uri = pictureFrom('<rect x="1" y="1" width="2" height="2"/>');
    assert.ok(uri.startsWith("data:image/svg+xml,"));
    const decoded = decodeURIComponent(uri.slice("data:image/svg+xml,".length));
    assert.match(decoded, /^<svg /);
    assert.match(decoded, /viewBox="0 0 64 40"/);
    assert.match(decoded, /<\/svg>$/);
  });

  test("every widget's picture decodes to a drawing with at least one shape", () => {
    for (const w of WIDGETS) {
      const decoded = decodeURIComponent(w.picture.slice("data:image/svg+xml,".length));
      assert.match(decoded, /<(rect|circle|path)/, `${w.kind}'s picture draws nothing`);
    }
  });
});

describe("WidgetPane honours SD-010", () => {
  const pane = readFileSync(path.join(SRC, "builder", "WidgetPane.tsx"), "utf8");

  test("it reads the registry and keeps no list of its own", () => {
    assert.match(pane, /from "\.\/registry"/);
    assert.match(pane, /groupForPane\(adapter, query\)/);
  });

  test("every widget button carries a tooltip AND an accessible name", () => {
    assert.match(pane, /title=\{widgetTooltip\(w\)\}/);
    assert.match(pane, /aria-label=\{widgetTooltip\(w\)\}/);
  });

  test("it renders the picture, the label and the one line", () => {
    assert.match(pane, /src=\{w\.picture\}/);
    assert.match(pane, /\{w\.label\}/);
    assert.match(pane, /\{w\.description\}/);
  });

  test("it groups by category with a heading", () => {
    assert.match(pane, /\{group\.category\}/);
    assert.match(pane, /groups\.map\(\(group\)/);
  });

  test("it has a search box", () => {
    assert.match(pane, /type="search"/);
    assert.match(pane, /aria-label="Search widgets"/);
  });

  test("a widget with a count is ASKED before it is inserted", () => {
    assert.match(pane, /if \(w\.count\) \{/);
    assert.match(pane, /\{w\.count\.label\}/);
    assert.match(pane, /onInsert\(w, asking\.value\)/);
  });
});
