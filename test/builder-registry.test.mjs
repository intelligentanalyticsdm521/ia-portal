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
const NO_CONTROLS = new Set([
  "page_break",
  /* INNER SECTION is a LAYOUT PRESET (B-168, family F0). Pressing it inserts a
     row Container holding two Containers — `registry.LAYOUT_PRESETS` — and
     from that moment the thing on the page is a container, whose panel is the
     container's own three tabs. A control on the tile would be a setting for a
     node that never exists. */
  "inner-section",
  /* D-165's three PANEL TILES. They are a catalogue picker with a name and an
     icon, not a widget with properties: what an author sets is which products
     or clauses they picked, and the atoms the picker drops carry those. A
     control on a tile would be a setting for a thing never on the document.
     See src/builder/proposal/catalogueTiles.ts. */
  "product_cards", "product_line_items", "terms",
  /* The four the WordPress plugin draws on the published site. Their settings
     live in the plugin, which is the one place that can honour them. */
  "ia_mega_menu", "ia_mobile_menu", "ia_oliver_invoice", "ia_social_links",
]);
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
  /**
   * THE VOCABULARY, AS D-165 LEFT IT (§11.13.3).
   *
   * This list was §3.2's candidate set and then grew a comment per branch. It
   * is now the scope's own two lists — Elementor's standard widgets and the
   * Intelligent Analytics ones — plus the kinds that are UNDERSTOOD and never
   * offered, each of which is named in `HIDDEN` below with its reason.
   *
   * Thirteen kinds that used to be here are DELETED, not hidden: `doc_header`,
   * `footer_note`, `merge_field`, `property_plan`, `pricing_table`, `callout`,
   * `key_value_table`, `key_fact`, `address_block`, `map`, `columns`, and the
   * old `testimonial` / `icon` entries, which are now declared in their own
   * files. `upgrade.ts` converts every stored one on open and
   * `test/builder-widget-set.test.mjs` proves nothing is lost.
   */
  const REQUIRED = [
    // Layout
    "container", "grid",
    // Basic
    "heading", "image", "paragraph", "video", "button", "divider", "spacer", "google_maps", "icon",
    /* Inner Section — the reference editor lists it under Basic and the offer
       file offers it on the website and the landing page. It is a layout
       PRESET: a row Container holding two Containers, which is what an inner
       section is once the legacy section/column dialect is gone (B-168, F0). */
    "inner-section",
    // General
    "image_box", "icon_box", "star_rating", "image_carousel", "basic_gallery", "list",
    "counter", "progress_bar", "testimonial", "tabs", "accordion", "toggle",
    /* ONE Social Icons, and its id is `social_links` (D-168 item 4). Two kinds
       carried that label; the one that survives keeps the id the shipped
       templates place and both goldens hold. See `SOCIAL_ICONS_DEF`. */
    "social_links", "alert", "shortcode", "html", "menu_anchor",
    /* B-168 f2-pictures: five of Elementor's own, all five in the offer file. The kind is pro_gallery because gallery is the hidden legacy Photo gallery below. */
    "pro_gallery", "video_playlist", "audio", "lottie", "hotspot",
    /* B-168 f1-words: the seven Elementor widgets of the words family, every one in the offer file. */
    "blockquote", "animated_headline", "text_path", "table_of_contents", "code_highlight", "read_more", "sidebar",
    /* B-168 f3: the five Elementor Pro widgets of the buttons, icons and panels family. */
    "share_buttons", "call_to_action", "flip_box", "facebook_embed", "facebook_page",
    /* B-168 f4-moving: Elementor's Progress Tracker, Pro, in the website and landing offers. */
    "progress_tracker",
    /* B-168 f5-sliders-reviews: Elementor's sliders and review widgets. ia_reviews is the database twin of Reviews. */
    "media_carousel", "slides", "testimonial_carousel", "ia_reviews",
    /* B-168 f6-money: Elementor's Price Table, Price List and the two payment buttons. */
    "price_table", "price_list", "paypal_button", "stripe_button",
    /* B-168 f7-data-lists: the Elementor widgets that draw a list out of data, plus the theme pieces the offer file gives the website. */
    "archive_posts", "author_box", "loop_grid", "portfolio", "post_comments", "post_info",
    "post_navigation", "posts", "search", "sitemap", "taxonomy_filter", "template",
    "theme_site_logo", "theme_site_title", "theme_page_title", "theme_post_title",
    "theme_archive_title", "theme_post_featured_image", "theme_post_excerpt",
    /* B-168 f8-contact-furniture: Elementor's Form, Login and Nav Menu. */
    "login", "nav_menu",
    // Intelligent Analytics
    "product_cards", "product_line_items", "totals", "card", "catalog_card", "price_line",
    "custom_field", "data_table", "clauses", "signature", "page_break",
    "ia_posts", "reviews", "book_now",
    /* B-168 F5 - the sliders family. Every one is in the offer file Brandon
       approved on 2026-09-19 (D-168): Slides, Media Carousel and Testimonial
       Carousel in the page builders' Pro column, IA Reviews in their IA one. */
    "testimonial_carousel", "slides", "media_carousel", "ia_reviews",
    "ia_form", "newsletter_signup", "hours_location",
    "ia_mega_menu", "ia_mobile_menu", "ia_oliver_invoice", "ia_social_links",
    // The studio's placed objects (§5 step 5). Not one of §11.13.3's four
    // builders, so they keep their own words.
    "brand_logo", "shape", "photo_grid", "line", "frame", "ia_review",
    "colour_block", "background", "qr_code", "social_handle",
    // Understood, never offered. Each one's reason is in registry.ts.
    // `data_table` is OFFERED now (the offer file's proposal list), so it
    // moved up into the Intelligent Analytics block above.
    "site_custom",
    "site_hero", "site_services", "site_about", "site_pricing", "site_testimonials",
    "site_gallery", "site_team", "site_stats", "site_faq", "site_cta", "site_contact",
    "site_content",
    "personal_note", "article_card", "product_card", "email_footer", "hero",
    "form", "gallery", "social_links", "countdown", "logo_strip",
    /* `terms` WAS HERE and the TILE is DELETED (D-168): the approved offer
       file does not list it, and the clause picker belongs to the **Terms and
       conditions** section template now. `clauses` stays a KIND, because the
       snow agreement places one and D-164 pins its numbering. */
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
    for (const kind of ["spacer", "data_table"]) {
      assert.ok(
        !WIDGETS_BY_KIND[kind].adapters.includes("brand"),
        `${kind} means nothing on an absolute-pixel canvas`,
      );
    }
    // Space IS what a flow is, so all four flow builders keep it. `columns` is
    // DELETED (§11.13.1: "No legacy section/column in the panel") — columns are
    // a Container set to row, or a Grid.
    for (const kind of ["spacer"]) {
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
    // `key_value_table` is DELETED (D-165): a details list is lines of text.
    for (const kind of ["data_table"]) {
      assert.deepEqual(
        [...WIDGETS_BY_KIND[kind].adapters].sort(),
        ["proposal"],
        `${kind} belongs to the document builder alone`,
      );
    }
  });

  /* THE `WEBSITE_USES_A_SECTION_INSTEAD` TEST LIVED HERE and is rewritten
     (D-165). Every kind it named — pricing_table, callout, key_value_table,
     logo_strip, social_links, form, gallery, data_table, testimonial — is
     either deleted or no longer a website tile, so the map it read is a map of
     things that are not on the website pane anyway.

     What still has to be true is the RULE behind it: the website pane offers
     §11.13.3's list and nothing else. `test/builder-widget-set.test.mjs` pins
     that list by name and in order, which is a stronger statement than "these
     nine are absent". */
  test("a job another builder does its own way is not also a loose widget", () => {
    // The union of three branches' decisions, each of which took one builder
    // away from a widget for a reason that builder enforces. Asserted here as
    // the surviving list, so putting a builder back has to be deliberate:
    //   pricing_table                     a site has site_pricing, a whole
    //                                     ready-made section with its own
    //                                     round trip
    //   callout                           a site has content; a send has a
    //                                     coloured section — the STUDIO keeps
    //                                     it, where a tinted panel is an object
    //
    // CHANGED 2026-09-17, catalogue F.1 "Where it may be used". `card` and
    // `catalog_card` were here for the same reason as `pricing_table` and it
    // does not hold for them: a READY-MADE SECTION and a PART YOU PLACE IN A
    // BOX are two concerns, not two mechanisms for one — the same way
    // `heading` is offered on a site that also has `site_hero`. A site’s
    // pricing SECTION is still the one way to get a pricing section; a card is
    // the one way to place a single card. A send keeps its `product_card`
    // composite, which is a LIST of things to show off, beside `catalog_card`,
    // which is ONE catalogue line — two kinds, asserted just below.
    /* CHANGED AGAIN 2026-09-19 (D-165, §11.13.3). The IA column for email,
       website and landing names **Product Cards** — the catalogue picker — and
       does not name a typed Card. A tile on a list the scope does not have it
       on is the invention this pass exists to stop, so `card` is the
       proposal's. The kind is still DRAWN everywhere, so a send or a page that
       already holds one is unchanged. */
    assert.deepEqual([...WIDGETS_BY_KIND.card.adapters].sort(), ["proposal"]);
    // `catalog_card` is PROPOSAL-only again (2026-09-17, driven): every surface
    // can draw it, but only the proposal can say WHICH product - the catalogue
    // picker lives in that panel. Offering it in a send gave a card that could
    // be placed and never filled, and a send already has one mechanism for
    // products: the newsletter's own `product_card`, which has its picker.
    // Lift the picker into the widget and this list gains it back.
    assert.deepEqual([...WIDGETS_BY_KIND.catalog_card.adapters].sort(), ["proposal"]);
    // NOT `website` for these three: the website publish path has no emitter
    // for the kind, and an unknown kind makes the whole page publish refuse by
    // name — so offering one would be a widget an author can place and never
    // publish. The catalogue asks for two of them on a site; they need the
    // emitter first.
    /* D-165 tightened these to §11.13.3's own lists. Totals is in the
       PROPOSAL's IA column and nobody else's — a newsletter does not add
       anything up. `address_block`, `key_fact`, `pricing_table` and `callout`
       are DELETED; the first became Customer or Service Location by its
       binding, and those two are the proposal's. */
    assert.deepEqual([...WIDGETS_BY_KIND.totals.adapters].sort(), ["proposal"]);
    /* D-167 — and the three that replaced the address block are themselves
       gone. ONE widget shows one database field.

       THE PROPOSAL AND MY BRAND (2026-09-22), and no more than those two. The
       rule has not moved: a Custom Field must have a record to read. The
       proposal has a CUSTOMER picked; the studio has the BUSINESS, and only
       the business — `StudioBrand.record` from `GET /account/profile`, with
       the chooser offering that group and saying so. A website page, a hosted
       landing page and a send still have neither, which is still ask R-D4, and
       this list is what would go red if somebody gave one of them the tile
       without giving it a record. */
    assert.deepEqual([...WIDGETS_BY_KIND.custom_field.adapters].sort(), ["brand", "proposal"]);
    for (const gone of ["address_block", "key_fact", "pricing_table", "callout",
      "customer", "service_location", "business_info", "terms"]) {
      assert.equal(WIDGETS_BY_KIND[gone], undefined, `${gone} must be gone, not hidden`);
    }
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
    /* `icon` LEFT THIS LIST (D-165). The studio's "Icon" and Elementor's Icon
       are the same widget — a symbol in a colour — so there is one of them now,
       in the Basic group, offered to every builder. Two widgets for one job was
       the collision; one is the fix. */
    for (const kind of ["brand_logo", "shape", "colour_block", "background", "qr_code", "social_handle"]) {
      assert.deepEqual(WIDGETS_BY_KIND[kind].adapters, ["brand"], `${kind} is a placed object, not page furniture`);
    }
  });

  test("the Template Studio's pane covers every tool §5 step 5 names", () => {
    // The eleven Brandon listed, by the kind that serves each one.
    const kinds = widgetsFor("brand").map((w) => w.kind);
    for (const kind of [
      "paragraph", "heading", "image", "brand_logo", "shape", "icon",
      // `callout` is DELETED and its job is Elementor's **Alert** (D-165).
      /* `callout` is DELETED and its job is Elementor's **Alert**; the studio's
         `insertWidget` has no case for one yet, so the tile is not offered here
         rather than being a button that does nothing (item S2 in the handoff). */
      /* `colour_block`, `background` and `social_handle` LEFT THIS LIST on
         2026-09-19 (B-168, D-168). The offer file's My Brand panel is ten
         Elementor widgets plus five canvas pieces — shape, line, frame,
         photo_grid, qr_code — and these three are none of them: a brand colour
         is the background control on any element, and a social handle is a
         line of text. They stay in the vocabulary (`hidden: true`) so a design
         already carrying one still draws. `test/builder-offers.test.mjs` is
         what says which of them may be a tile. */
      "qr_code",
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
    // `key_fact` went the same way in D-165: a key fact is a line of text.
    for (const kind of ["comparison_cards", "key_facts", "key_fact"]) {
      assert.equal(WIDGETS_BY_KIND[kind], undefined, `${kind} must be gone, not hidden`);
    }
    for (const kind of ["card", "catalog_card", "price_line"]) {
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
  /* THE THREE `groupForPane` TESTS LIVED HERE and are DELETED (D-165).
     That function was registry.ts's own copy of the grouping `widgetTasks`
     already did, and the two were maintained beside each other. There is one
     grouping now; `test/builder-widget-set.test.mjs` pins it, by name and in
     order, for each of the four builders §11.13.3 names. */

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

describe("WidgetPane is the widgets panel, and nothing else (D-165)", () => {
  const pane = readFileSync(path.join(SRC, "builder", "WidgetPane.tsx"), "utf8");

  test("it reads the registry and keeps no list of its own", () => {
    // §11.13.1: the grouping moved to widgetGroups.ts, which groups the
    // registry's own widgets the way the reference editor groups them —
    // Layout / Basic / General / Intelligent Analytics. There is one caller
    // now: the pop-up that used to make the same call is deleted, so the
    // panel has nothing to disagree with. The rule is unchanged: no list of
    // widgets in this file.
    assert.match(pane, /from "\.\/registry"/);
    assert.match(pane, /panelGroups\(adapter, query\)/);
    assert.doesNotMatch(pane, /kind: ?"[a-z_]+"/, "the pane must not name a widget of its own");
  });

  test("ONLY a locked tile carries a tooltip (D-172, round 2)", () => {
    // Driven in the reference on 2026-09-19: hovering a tile reports
    // `titleAttr: null` and no tooltip node anywhere — the name under the icon
    // is the whole label. Ours put a full sentence on every single tile, so a
    // panel meant to be SCANNED answered every glance with a paragraph.
    assert.ok(!/title=\{lock\?\.sentence \|\| widgetTooltip/.test(pane),
      "the sentence is back on every tile");
    assert.ok(!/import \{ widgetTooltip/.test(pane), "the pane imports widgetTooltip again");
    // PRESENT: the accessible name a tile you CANNOT press still needs — the
    // reason, which is the only place the reference's panel explains itself
    // (R-D1, and its own locked tile does the same).
    assert.match(pane, /lock \? \{ title: lock\.sentence, "aria-label": lock\.sentence \}/);
    assert.match(pane, /\{label\}/);
  });

  test("a tile is an ICON OVER A NAME, two across — no picture, no paragraph", () => {
    // What the real editor draws, looked at 2026-09-19. The picture strip and
    // the one-line description are DELETED, not hidden: twenty-six rows of
    // picture-plus-paragraph is four screens of a panel meant to be scanned.
    // The sentence is the tooltip, which the test above pins.
    assert.match(pane, /grid-cols-2/, "tiles are not two across");
    assert.match(pane, /<WidgetIcon name=\{w\.icon\}/);
    assert.match(pane, /\{label\}/);
    assert.doesNotMatch(pane, /w\.picture/, "the picture strip is back");
    assert.doesNotMatch(pane, /widgetDescription/, "the one-line description is back on the tile");
  });

  test("the groups are ACCORDIONS, in the reference editor's order", () => {
    assert.match(pane, /data-pane-group-toggle=\{g\.group\}/);
    assert.match(pane, /aria-expanded=\{isOpen\}/);
    assert.match(pane, /groups\.map\(\(g\)/);
  });

  test("it has a title and a search box, and NOTHING else", () => {
    assert.match(pane, /type="search"/);
    // ABSENT / PRESENT (D-172): the reference editor's own placeholder.
    assert.doesNotMatch(pane, /aria-label="Search widgets"/, "the search box is ours again");
    assert.match(pane, /aria-label=\{PANE_SEARCH_PLACEHOLDER\}/);
    assert.match(pane, /PANE_TITLE/);
    // §11.13.1: no outline, no totals, no customer box, no templates list,
    // no "still to fill in" counter, and no slot to inject one through.
    for (const gone of [/<Navigator/, /data-builder-problems/, /header\?:/, /p\.header/, /hint\?:/]) {
      assert.doesNotMatch(pane, gone, `the left panel grew something again: ${gone}`);
    }
  });

  /* WAS "a widget with a count is ASKED before it is inserted".
     D-156 item 4 DELETED that control: it asked, before the thing was on the
     page, a number nobody could answer yet, and it only existed because the
     cards inside a composite could not be added or removed afterwards. They can
     now — a card is a widget with the same duplicate and delete as
     everything else. The assertion is inverted rather than removed, because
     "the question is gone" is the thing that has to stay true. */
  test("the 'how many?' question is gone, and so is the second surface that asked it (D-156)", () => {
    /* WAS "gone from BOTH surfaces" — the panel and the widget pop-up. The
       pop-up itself is deleted (2026-09-19), so the pair below is the absence
       of the file and the absence of the question in the one panel left. */
    assert.throws(
      () => readFileSync(path.join(SRC, "builder", "WidgetPicker.tsx"), "utf8"),
      /ENOENT/, "WidgetPicker.tsx is back, and it is the surface that used to ask");
    assert.doesNotMatch(pane, /w\.count\.label/, "the pane still asks how many");
    assert.doesNotMatch(pane, /setAsking/, "the pane still holds the question's state");
    // PRESENT: pressing a tile inserts, with no question in between.
    assert.match(pane, /onClick=\{\(\) => \{ if \(!lock\) onInsert\(w\); \}\}/);
  });
});
