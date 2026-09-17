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
  widgetDescription,
  widgetLabel,
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
      // N-4: the sentence may be a map of one per builder, so every builder
      // this widget is offered in must resolve to something.
      for (const a of w.adapters) {
        assert.ok(widgetDescription(w, a).trim().length > 0, `no description for ${a}`);
      }
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
    for (const adapter of w.adapters) {
      test(`${w.kind} in the ${adapter} pane: one line, plain words`, () => {
        const d = widgetDescription(w, adapter);
        assert.ok(!d.includes("\n"), "a description is ONE line");
        assert.ok(d.length >= 25, `"${d}" is too short to explain anything`);
        assert.ok(d.length <= 140, `"${d}" will not fit beside a picture in a 320px pane`);
        // Not a restatement of the label ("Heading — a heading").
        assert.ok(d.toLowerCase().trim() !== widgetLabel(w, adapter).toLowerCase().trim(),
          "the description repeats the label");
        // No developer vocabulary. The inventory's finding was five vocabularies
        // and no explanations; this is the line that has to fix it.
        for (const jargon of ["json", "blocks_json", "elementor", "widget tree", "flex", "schema", "payload", "adapter", "div"]) {
          assert.ok(!d.toLowerCase().includes(jargon), `"${d}" says "${jargon}" to a business owner`);
        }
      });
    }
  }

  /**
   * D-30 / N-4 — NO PROPOSAL WORDING IN ANOTHER BUILDER'S PANE.
   *
   * *"Heading — A title for the section, optionally numbered like “1. Scope of
   * work”."* read that way in the website, email, landing and studio panes,
   * because one string served five adapters. Each medium bans the nouns that
   * are not its own: an email has no pages, a studio square has no sections,
   * and nothing but a document is a document.
   *
   * MUTATION: put the proposal sentence back as a plain string on `heading`
   * and four of these go red at once.
   */
  const BANNED = {
    website: ["document", "proposal", "scope of work", "email"],
    landing: ["document", "proposal", "scope of work", "email"],
    email: ["document", "proposal", "scope of work", "page"],
    brand: ["document", "proposal", "scope of work", "email", "section", "page"],
  };
  for (const [adapter, words] of Object.entries(BANNED)) {
    test(`the ${adapter} pane never reads like a proposal`, () => {
      for (const w of widgetsFor(adapter)) {
        const d = widgetDescription(w, adapter).toLowerCase();
        for (const bad of words) {
          assert.ok(!d.includes(bad),
            `${w.kind} tells a ${adapter} author "${bad}": "${widgetDescription(w, adapter)}"`);
        }
      }
    });
  }

  test("a widget offered in more than one builder has a sentence for each of them", () => {
    for (const w of WIDGETS) {
      if (w.adapters.length < 2) continue;
      if (typeof w.description === "string") continue;   // the same words everywhere, on purpose
      for (const a of w.adapters) {
        assert.ok(w.description[a],
          `${w.kind} is offered in ${a} and has no sentence for it`);
      }
    }
  });

  test("the tooltip carries both the name and the sentence, in this builder's words", () => {
    const w = WIDGETS_BY_KIND.heading;
    assert.equal(widgetTooltip(w, "email"), `${widgetLabel(w, "email")} — ${widgetDescription(w, "email")}`);
    assert.notEqual(widgetDescription(w, "email"), widgetDescription(w, "proposal"));
  });
});

describe("§3.2's union is registered", () => {
  // The candidate list from the scope doc, by the kind we settled on.
  const REQUIRED = [
    "heading", "paragraph", "image", "button", "divider", "spacer", "list",
    "key_value_table", "data_table",
    "callout", "totals", "signature", "footer_note", "merge_field", "form",
    "map", "video", "social_links", "countdown", "testimonial", "logo_strip",
    "pricing_table", "gallery",
    // Added 2026-09-16 by §8 — the parts the Rolling In It agreement proved a
    // document has and a web page does not. Each maps to a numbered item:
    //   doc_header     §8 item 1 (header/title with style presets)
    //   clauses        §8 item 3 (numbered clauses from the clause library)
    //   property_plan  §8 item 5 (property service plan, crew-visible)
    //   page_break, columns      document layout the canvas needs
    //
    // D-156 DELETED FOUR of the kinds this list used to require —
    // `comparison_cards`, `property_block`, `key_facts` and `priced_line`.
    // Each was a LUMP: several things locked inside one widget that nobody
    // could select, move, style or delete on its own. They are `card` /
    // `catalog_card`, `address_block` + `price_line` + `totals`, `key_fact`
    // and `price_line` now, each its own widget in its own file, and the
    // upgrade on the way in converts every stored document. The absence is
    // asserted below, so a composite cannot quietly come back.
    "doc_header", "clauses", "property_plan",
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
    // Added 2026-09-16 by §7 — the email adapter's own parts, and the one a
    // hosted landing page opens with. Each maps to a line of §7:
    //   personal_note  "a personal note text widget that supports merge tags"
    //   article_card   "article card" (the shape a newsletter is made of)
    //   product_card   "product/pricing card (from Products & Services with
    //                   cadence)"
    //   email_footer   "footer with the required unsubscribe + physical
    //                   address (never removable)"
    //   hero           the landing page's "hero" in §7's web widget set
    "personal_note", "article_card", "product_card", "email_footer", "hero",
    // Added 2026-09-17 by §11.12 — D-156's ATOMIC widgets, each declared in
    // its own file under src/builder/widgets/ beside the function that draws
    // it. They replace the composites: `card` + `catalog_card` for
    // comparison_cards, `price_line` for priced_line, `address_block` for the
    // address half of property_block, `key_fact` for a row of key_facts, and
    // `totals`, which moved out of this file with its new tax / discount /
    // coupon settings (D-157).
    "card", "catalog_card", "price_line", "totals", "address_block", "key_fact",
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
    // `priced_line` is `price_line` now — one widget, and the rename is what
    // "folded into" means (D-156).
    assert.deepEqual(WIDGETS_BY_KIND.price_line.adapters, ["proposal"]);
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
    // The two small tables ended up with the DOCUMENT and nothing else, by
    // three decisions taken on three branches — the canvas above, then §4
    // step 3 (an ARION site builds that job as a whole section: site_stats
    // for a details list, content for a plain table) and §7 (a details grid
    // is two columns of text, and a data table inside an email's own layout
    // tables is what Outlook reflows worst). registry.ts writes the three
    // reasons down once on SMALL_TABLES; this pins what is LEFT.
    for (const kind of ["key_value_table", "data_table"]) {
      assert.deepEqual(
        [...WIDGETS_BY_KIND[kind].adapters].sort(),
        ["proposal"],
        `${kind} belongs to the document builder alone`,
      );
    }
  });

  test("a job another builder does its own way is not also a loose widget", () => {
    // The union of three branches' decisions, each of which took one builder
    // away from a widget for a reason that builder enforces. Asserted here as
    // the surviving list, so putting a builder back has to be deliberate:
    //   card / catalog_card / pricing_table  a site has site_pricing; a send
    //                                     has the product card
    //   callout                           a site has content; a send has a
    //                                     coloured section — the STUDIO keeps
    //                                     it, where a tinted panel is an object
    assert.deepEqual([...WIDGETS_BY_KIND.card.adapters].sort(), ["proposal"]);
    assert.deepEqual([...WIDGETS_BY_KIND.catalog_card.adapters].sort(), ["proposal"]);
    assert.deepEqual([...WIDGETS_BY_KIND.pricing_table.adapters].sort(), ["proposal"]);
    assert.deepEqual([...WIDGETS_BY_KIND.callout.adapters].sort(), ["brand", "proposal"]);
  });

  test("a widget no builder offers says so, rather than sitting in a pane", () => {
    // logo_strip is the one kind both merges emptied: a site answers it with
    // site_gallery, an email or a landing page with a 2/3-column section. It
    // stays in §3.2's vocabulary and is offered nowhere — the same "hidden"
    // site_custom uses — so it cannot reappear in a pane by accident.
    assert.equal(WIDGETS_BY_KIND.logo_strip.hidden, true);
    for (const a of BUILDER_ADAPTERS) {
      assert.equal(widgetsFor(a).some((w) => w.kind === "logo_strip"), false,
        `the ${a} builder is offering a widget nothing draws`);
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
  test("D-156 — no widget asks 'how many?' where the answer is a widget", () => {
    // The count control is DELETED for the card composites (D-156 (4)): a card
    // is a widget now, so "how many cards?" is "add another card". A widget
    // that still asks is one that still has hidden sub-parts.
    // The widgets that ASKED are deleted outright, so nothing can ask.
    for (const kind of ["comparison_cards", "key_facts"]) {
      assert.equal(WIDGETS_BY_KIND[kind], undefined,
        `${kind} is superseded by D-156 and must be gone, not hidden`);
    }
    for (const kind of ["card", "catalog_card", "price_line", "key_fact"]) {
      assert.ok(!WIDGETS_BY_KIND[kind].count, `${kind} is one thing, not a list of them`);
    }
    // AND NOWHERE ELSE: not one widget in the whole registry asks how many of
    // itself the author wants, because the answer to that is "add another one".
    const asks = WIDGETS.filter((w) => w.count && w.count.label
      && /how many/i.test(String(w.count.label)) && /card|fact|plan|option/i.test(String(w.count.label)));
    assert.deepEqual(asks.map((w) => w.kind), [],
      "a widget still asks how many of a thing that is now a widget");
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
    // Nothing is CALLED "included"; the card's sentence says it. (It used to
    // be "recommended" against comparison_cards, which D-156 superseded.)
    const hits = groupForPane("proposal", "included").flatMap((g) => g.widgets.map((w) => w.kind));
    assert.ok(hits.includes("card"), "searching the words people actually use must work");
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
  const picker = readFileSync(path.join(SRC, "builder", "WidgetPicker.tsx"), "utf8");

  test("it reads the registry and keeps no list of its own", () => {
    // §11.10 (D-147): the grouping moved to widgetTasks.ts, which groups the
    // registry's own widgets by the JOB they do rather than by their category
    // — and the PICKER calls the same function, so the pane and the "+" can
    // never offer two different vocabularies. The rule is unchanged: no list
    // of widgets is written down in this file.
    assert.match(pane, /from "\.\/registry"/);
    assert.match(pane, /groupByTask\(adapter, query\)/);
    assert.doesNotMatch(pane, /kind: ?"[a-z_]+"/, "the pane must not name a widget of its own");
  });

  test("every widget button carries a tooltip AND an accessible name", () => {
    // A LOCKED row says the reason instead, which is the accessible name that
    // matters when the button cannot be pressed (R-D1).
    assert.match(pane, /title=\{lock \|\| widgetTooltip\(w, adapter\)\}/);
    assert.match(pane, /aria-label=\{lock \|\| widgetTooltip\(w, adapter\)\}/);
  });

  test("it renders the picture, the label and the one line — in THIS builder's words", () => {
    // N-4: the pane reads the resolved sentence, never `w.description`, which
    // is now a map of one per builder for anything offered in more than one.
    assert.match(pane, /src=\{w\.picture\}/);
    assert.match(pane, /\{widgetLabel\(w, adapter\)\}/);
    assert.match(pane, /\{lock \|\| widgetDescription\(w, adapter\)\}/);
    assert.doesNotMatch(pane, /\{w\.description\}/, "the pane prints the raw sentence");
  });

  test("it groups by the job, with a heading", () => {
    // WAS `group.category` — "Information" and "Trust" are words a developer
    // wrote down. §11.10 groups by "Customer & property" and "Products &
    // services", which are the two sentences the business owner said.
    assert.match(pane, /\{group\.task\}/);
    assert.match(pane, /groups\.map\(\(group\)/);
  });

  test("it has a search box", () => {
    assert.match(pane, /type="search"/);
    assert.match(pane, /aria-label="Search widgets"/);
  });

  /* WAS "a widget with a count is ASKED before it is inserted".
     D-156 item 4 DELETED that control: it asked, before the thing was on the
     page, a number nobody could answer yet, and it only existed because the
     cards inside a composite could not be added or removed afterwards. They can
     now — a card is a widget with the same duplicate and delete as everything
     else. The assertion is inverted rather than removed, because "the question
     is gone" is the thing that has to stay true. */
  test("the 'how many?' question is gone from BOTH surfaces (D-156)", () => {
    for (const [name, src] of [["pane", pane], ["picker", picker]]) {
      assert.doesNotMatch(src, /w\.count\.label/, `${name}: still asks how many`);
      assert.doesNotMatch(src, /setAsking/, `${name}: still holds the question's state`);
    }
  });
});
