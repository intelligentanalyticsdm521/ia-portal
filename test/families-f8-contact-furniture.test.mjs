// test/families-f8-contact-furniture.test.mjs — the f8-contact-furniture family keeps its contract.
//
// B-168 §C.1. The family's OWN test. What was here from the seams commit is the
// contract EVERY family keeps:
//
//   · every def has a renderer and every renderer has a def;
//   · every def names builders, out of the offer file's five;
//   · every def is IN THE OFFER for every builder it claims (D-168);
//   · nothing ships with a `requires` gate — Brandon decides the tiers in
//     October and that must then be a change to DATA, not a rebuild.
//
// Everything after that is F8's own, and it asks the questions that catch the
// four ways a widget in this family can be wrong:
//
//   1. a tile whose NAME is not Elementor's own → D-168's whole complaint;
//   2. a control key, panel section or `responsive` flag that is not the one
//      the 2026-09-17 catalogue carries → the panel says one thing and the
//      published page does another;
//   3. a default nothing can change, or a control with no default;
//   4. a renderer that draws nothing, needs JavaScript to be readable, or puts
//      the author's words on the page unescaped.
//
// ── WAVE 2, 2026-09-19 ─────────────────────────────────────────────────────
// Wave 1 built Login and WordPress Menu and held Form back. b168/override made
// `mergeWidgetDefs` let a family definition REPLACE a legacy one of the same
// kind, which released Form and six more: `google_maps`, `book_now`,
// `ia_social_links`, `ia_mega_menu`, `ia_mobile_menu`, `ia_oliver_invoice`. All
// six already existed and were THIN — three controls, or `controls: []`.
//
// Two of the nine are NOT Elementor widgets and are checked differently, on
// purpose:
//   · `book_now` is the IA TWIN of Elementor's Button, so its keys are checked
//     against `button` and its group is Intelligent Analytics.
//   · `ia_social_links`, `ia_mega_menu`, `ia_mobile_menu` and
//     `ia_oliver_invoice` are REAL REGISTERED WIDGETS of the IA WordPress
//     plugin — both 2026-09-17 scrapes carry them, with their own titles,
//     sections and keys — so they are checked against their own registration
//     and their group is Intelligent Analytics.
//
// What F8 PUBLISHES is asserted on the arion side, where the emitters live:
// `arion-api-septa-b168g8/test/families-f8-contact-furniture.test.mjs`. A
// cross-repo import from here would be a test that only passes on a machine
// that happens to have both worktrees checked out next to each other.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/* registry.ts FIRST, and on purpose. render.ts, registry.ts and the family
   folders are one import cycle by design (see widgets/index.ts). In the app the
   cycle is always entered through registry.ts; a test that entered it through a
   family index instead hit "Cannot access F8_CONTACT_FURNITURE before
   initialization". Importing the registry first makes this file evaluate the
   modules in the same order the app does. */
import { WIDGETS_BY_KIND, controlOptions } from "../src/builder/registry.ts";
import {
  FAMILY, BOOK_NOW_DEF, FORM_DEF, GOOGLE_MAPS_DEF, IA_MEGA_MENU_DEF, IA_MOBILE_MENU_DEF,
  IA_OLIVER_INVOICE_DEF, IA_SOCIAL_LINKS_DEF, LOGIN_DEF, NAV_MENU_DEF,
  emailBookNow, renderBookNow, renderForm, renderGoogleMaps, renderIaMegaMenu,
  renderIaMobileMenu, renderIaOliverInvoice, renderIaSocialLinks, renderLogin, renderNavMenu,
} from "../src/builder/widgets/families/f8-contact-furniture/index.ts";
import { assertFamilyContract, SETTINGS_KEYS } from "./helpers/familyContract.mjs";

/**
 * OUR KIND → THE REGISTERED WIDGET ITS KEYS BELONG TO. One table, read by every
 * case below.
 *
 * `book_now` maps to `button` because it IS Elementor's Button with the link
 * already pointing at the booking page — that is the offer file's own words for
 * it, and the arion emitter publishes a real Elementor button. The four `ia_*`
 * rows map to themselves because the plugin registers them under those names.
 */
const SLUG_OF = {
  google_maps: "google_maps",
  form: "form",
  login: "login",
  nav_menu: "nav-menu",
  book_now: "button",
  ia_social_links: "ia_social_links",
  ia_mega_menu: "ia_mega_menu",
  ia_mobile_menu: "ia_mobile_menu",
  ia_oliver_invoice: "ia_oliver_invoice",
};

/** The four that are OURS. Their group is Intelligent Analytics, not Basic or
 *  Pro, and they wear our name, not Elementor's. */
const IA_KINDS = ["book_now", "ia_social_links", "ia_mega_menu", "ia_mobile_menu", "ia_oliver_invoice"];

/** …and the four that are Elementor's own and must wear Elementor's name. */
const ELEMENTOR_KINDS = ["google_maps", "form", "login", "nav_menu"];

const DEF_OF = {
  google_maps: GOOGLE_MAPS_DEF, form: FORM_DEF, login: LOGIN_DEF, nav_menu: NAV_MENU_DEF,
  book_now: BOOK_NOW_DEF, ia_social_links: IA_SOCIAL_LINKS_DEF, ia_mega_menu: IA_MEGA_MENU_DEF,
  ia_mobile_menu: IA_MOBILE_MENU_DEF, ia_oliver_invoice: IA_OLIVER_INVOICE_DEF,
};

const RENDER_OF = {
  google_maps: renderGoogleMaps, form: renderForm, login: renderLogin, nav_menu: renderNavMenu,
  book_now: renderBookNow, ia_social_links: renderIaSocialLinks, ia_mega_menu: renderIaMegaMenu,
  ia_mobile_menu: renderIaMobileMenu, ia_oliver_invoice: renderIaOliverInvoice,
};

/* ══════════════════════════════════════════════════════════════════════════
   0. The contract every family keeps
   ══════════════════════════════════════════════════════════════════════════ */

test("f8-contact-furniture: the family exports the one shape families/index.ts collects", () => {
  assert.ok(Array.isArray(FAMILY.defs), "defs is an array");
  assert.equal(typeof FAMILY.renderers, "object", "renderers is a map");
});

test("f8-contact-furniture: every widget it declares keeps the contract", () => {
  assertFamilyContract("f8-contact-furniture", FAMILY);
});

test("f8-contact-furniture: the nine this folder owns, and no tenth", () => {
  /* A tile added without being recorded here is a tile nobody decided on.
     D-168 rule (1), said as an assertion. */
  assert.deepEqual(FAMILY.defs.map((d) => d.kind).sort(), Object.keys(SLUG_OF).sort());
  assert.deepEqual(Object.keys(FAMILY.renderers).sort(), Object.keys(SLUG_OF).sort());
});

/* ══════════════════════════════════════════════════════════════════════════
   1. The names are Elementor's (or the plugin's), not ours
   ══════════════════════════════════════════════════════════════════════════ */

describe("f8: the panel says what Elementor says", () => {
  /**
   * `nav-menu` is the one widget the two 2026-09-17 scrapes disagree about —
   * "WordPress Menu" on the IA site (Pro 4.1.1) and "Nav Menu" on the dev
   * WordPress (4.2.4). Both are written here so the test states the fact
   * rather than hiding it behind whichever file it happened to read.
   *
   * `book_now` is the one tile whose label is NOT its registered widget's: it
   * is the IA twin of Button and the offer file calls it Book Now.
   */
  const TITLES = {
    google_maps: ["Google Maps"],
    form: ["Form"],
    login: ["Login"],
    nav_menu: ["WordPress Menu", "Nav Menu"],
    book_now: ["Book Now"],
    ia_social_links: ["IA Social Links"],
    ia_mega_menu: ["IA Mega Menu"],
    ia_mobile_menu: ["IA Mobile Menu"],
    ia_oliver_invoice: ["IA OLIVER Invoice"],
  };

  test("every tile is called what Elementor calls it", () => {
    for (const d of FAMILY.defs) {
      assert.ok(TITLES[d.kind], `${d.kind}: no Elementor title recorded for this kind`);
      assert.ok(TITLES[d.kind].includes(d.label),
        `${d.kind} is labelled "${d.label}"; Elementor calls it ${TITLES[d.kind].join(" or ")}`);
    }
  });

  test("and the catalogue itself agrees, read out of the fixture", () => {
    for (const d of FAMILY.defs) {
      const w = SETTINGS_KEYS.widgets[SLUG_OF[d.kind]];
      assert.ok(w, `${d.kind}: ${SLUG_OF[d.kind]} is not in WIDGET_SETTINGS_KEYS.json`);
      /* Book Now is the twin of Button and wears its own name, so its TITLE is
         not the registered widget's. Everything else must match. */
      if (d.kind !== "book_now") {
        assert.ok(TITLES[d.kind].includes(w.title), `${d.kind}: the catalogue calls it "${w.title}"`);
      }
    }
  });

  test("only the three Pro widgets are charged for, and the catalogue agrees", () => {
    /* `tier` is what decides whether an ARION Lite site may have a widget, and
       being wrong in the generous direction promises a client something their
       plan cannot draw. Three answers, never one word for all three
       (`reference_nav_visibility_semantics`). */
    const EXPECTED = {
      google_maps: undefined,
      form: "pro", login: "pro", nav_menu: "pro",
      book_now: "ia:oliver", ia_oliver_invoice: "ia:oliver",
      ia_social_links: "ia:arion", ia_mega_menu: "ia:arion", ia_mobile_menu: "ia:arion",
    };
    for (const d of FAMILY.defs) {
      assert.equal(d.tier, EXPECTED[d.kind], `${d.kind}: wrong tier`);
      const w = SETTINGS_KEYS.widgets[SLUG_OF[d.kind]];
      if (d.kind === "book_now") continue; // twin of a free widget, charged as ours.
      assert.equal(!!w.pro, d.tier === "pro",
        `${d.kind}: the catalogue and the definition disagree about whether this is a Pro widget`);
    }
  });

  test("every tile sits in the group its own registry puts it in", () => {
    /* Elementor's widgets go in Elementor's groups — b168/override added Pro
       and Site, so Form, Login and WordPress Menu are Pro and Google Maps is
       Basic, which is where the real editor draws all four. OURS go in
       Intelligent Analytics and nowhere else. */
    const GROUP = {
      google_maps: "Basic", form: "Pro", login: "Pro", nav_menu: "Pro",
    };
    for (const d of FAMILY.defs) {
      if (IA_KINDS.includes(d.kind)) {
        assert.equal(d.category, "Intelligent Analytics",
          `${d.kind}: one of ours belongs in the Intelligent Analytics group`);
      } else {
        assert.equal(d.category, GROUP[d.kind],
          `${d.kind}: Elementor draws this one in ${GROUP[d.kind]}`);
      }
    }
  });

  test("every tile has one plain sentence a business owner can read", () => {
    for (const d of FAMILY.defs) {
      const sentence = typeof d.description === "string"
        ? d.description : Object.values(d.description)[0];
      assert.ok(sentence && sentence.trim().length > 12, `${d.kind}: no real sentence`);
      for (const jargon of ["widget", "flex", "container", "repeater", "shortcode"]) {
        assert.equal(sentence.toLowerCase().includes(jargon), false,
          `${d.kind}: "${sentence}" uses the word "${jargon}" — plain words on screen`);
      }
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2. The controls are the registered widget's, key by key
   ══════════════════════════════════════════════════════════════════════════ */

describe("f8: every control is a real control of the widget it belongs to", () => {
  test("no control invents a key the widget does not have", () => {
    for (const d of FAMILY.defs) {
      const legal = new Set(SETTINGS_KEYS.widgets[SLUG_OF[d.kind]].keys);
      const strays = d.controls.map((c) => c.key).filter((k) => !legal.has(k));
      assert.deepEqual(strays, [],
        `${d.kind}: these are not controls of ${SLUG_OF[d.kind]}`);
    }
  });

  test("a control marked responsive is one the catalogue marks responsive", () => {
    // Copied, never guessed: `deviceKey()` starts storing `_tablet` and
    // `_mobile` twins the moment this flag is on, and twins of a key Elementor
    // does not vary are two values the page engine will never read.
    for (const d of FAMILY.defs) {
      const resp = new Set(SETTINGS_KEYS.widgets[SLUG_OF[d.kind]].responsive || []);
      for (const c of d.controls) {
        if (!c.responsive) continue;
        assert.ok(resp.has(c.key),
          `${d.kind}.${c.key} is marked responsive and the catalogue does not mark it so`);
      }
    }
    // ...and the ones that ARE responsive really are declared, so the flag is
    // not quietly missing everywhere and passing for that reason.
    const flagged = FAMILY.defs
      .flatMap((d) => d.controls.filter((c) => c.responsive).map((c) => `${d.kind}.${c.key}`));
    assert.deepEqual(flagged.sort(), [
      "book_now.align", "book_now.border_radius", "book_now.border_width",
      "book_now.text_padding", "book_now.typography_font_size",
      "form.button_width",
      "google_maps.height",
      "ia_social_links.align", "ia_social_links.border_radius", "ia_social_links.columns",
      "ia_social_links.icon_padding", "ia_social_links.icon_size", "ia_social_links.icon_spacing",
      "login.align",
    ]);
  });

  test("every panel section is one of the widget's own, in Elementor's words", () => {
    const SECTIONS = {
      google_maps: ["Google Maps"],
      form: ["Form Fields", "Buttons", "Form", "Field"],
      login: ["Form Fields", "Button", "Additional Options", "Form", "Label", "Fields"],
      nav_menu: ["Layout", "Main Menu", "Dropdown", "Toggle Button"],
      /* Book Now is the twin of Button, whose two sections are both called
         "Button" — `section_button` on Content and `section_style` on Style. */
      book_now: ["Button"],
      ia_social_links: ["Social Icons", "Icon"],
      ia_mega_menu: ["Menu Configuration", "Menu Items", "Menu Groups (Split Panel)",
        "Featured Content (Full Width)", "Menu Style"],
      ia_mobile_menu: ["Menu", "Social & CTA", "Panel Style"],
      ia_oliver_invoice: ["Business Information", "Book Again CTA", "Style"],
    };
    for (const d of FAMILY.defs) {
      const allowed = new Set(SECTIONS[d.kind]);
      const strays = [...new Set(d.controls.map((c) => c.section).filter(Boolean))]
        .filter((s) => !allowed.has(s));
      assert.deepEqual(strays, [],
        `${d.kind}: these panel sections are not the widget's own`);
      const missing = d.controls.filter((c) => !c.section).map((c) => c.key);
      assert.deepEqual(missing, [],
        `${d.kind}: a control with no section falls into the panel's body instead of a named group`);
    }
  });

  test("every select offers the values the engine offers, and nothing else", () => {
    // A select value the control does not carry is DROPPED on publish. These
    // lists are the registered widget's own, out of the 2026-09-17 catalogues
    // and — for Google Maps and Button — the live editor read of 2026-09-19.
    const EXPECTED = {
      "login.input_size": ["xs", "sm", "md", "lg", "xl"],
      "login.button_size": ["xs", "sm", "md", "lg", "xl"],
      "login.align": ["start", "center", "end", "stretch"],
      "nav_menu.layout": ["horizontal", "vertical", "dropdown"],
      "nav_menu.align_items": ["start", "center", "end", "justify"],
      "nav_menu.pointer": ["none", "underline", "overline", "double-line", "framed", "background", "text"],
      "nav_menu.dropdown": ["mobile", "tablet", "none"],
      "nav_menu.text_align": ["aside", "center"],
      "nav_menu.toggle": ["burger", ""],
      "nav_menu.toggle_align": ["left", "center", "right"],
      "form.input_size": ["xs", "sm", "md", "lg", "xl"],
      "form.button_size": ["xs", "sm", "md", "lg", "xl"],
      "form.button_width": ["20", "25", "30", "33", "40", "50", "60", "66", "70", "75", "80", "100"],
      "book_now.button_type": ["", "info", "success", "warning", "danger"],
      "book_now.size": ["xs", "sm", "md", "lg", "xl"],
      "book_now.icon_align": ["row", "row-reverse"],
      "book_now.align": ["left", "center", "right", "justify"],
      "book_now.border_border": ["", "none", "solid", "double", "dotted", "dashed", "groove"],
      "ia_social_links.shape": ["rounded", "square", "circle"],
      "ia_social_links.columns": ["0", "1", "2", "3", "4", "5", "6"],
      "ia_social_links.align": ["left", "center", "right"],
      "ia_social_links.icon_color": ["default", "custom"],
      "ia_mega_menu.menu_source": ["wordpress", "custom"],
      "ia_mega_menu.menu_style": ["split-panel", "column-dropdown", "full-width-banner"],
      "ia_mega_menu.dropdown_animation": ["fade", "slide", "none"],
      "ia_mega_menu.dropdown_width": ["full-width", "auto", "custom"],
      "ia_mobile_menu.menu_source": ["wp_menu", "custom"],
      "ia_mobile_menu.style": ["slide_panel", "fullscreen_overlay", "bottom_tab_bar"],
      "ia_mobile_menu.bg_type": ["solid", "image", "overlay"],
      "ia_mobile_menu.animation_direction": ["left", "right"],
    };
    let checked = 0;
    for (const d of FAMILY.defs) {
      for (const c of d.controls) {
        if (c.type !== "select") continue;
        const want = EXPECTED[`${d.kind}.${c.key}`];
        assert.ok(want, `${d.kind}.${c.key} is a select with no recorded option list`);
        assert.deepEqual(controlOptions(c).map((o) => o.value), want,
          `${d.kind}.${c.key} offers values the engine does not`);
        checked += 1;
      }
    }
    assert.equal(checked, Object.keys(EXPECTED).length, "a select was added and not recorded here");
  });

  test("every control is on one of the three tabs and has a label", () => {
    for (const d of FAMILY.defs) {
      for (const c of d.controls) {
        assert.ok(["content", "style", "advanced"].includes(c.tab ?? "content"), `${d.kind}.${c.key}`);
        assert.ok(c.label && c.label.trim(), `${d.kind}.${c.key}: a control with no label`);
      }
      assert.ok(d.controls.some((c) => (c.tab ?? "content") === "content"), `${d.kind}: no Content tab`);
      assert.ok(d.controls.some((c) => c.tab === "style"), `${d.kind}: no Style tab`);
    }
  });

  test("no default is stranded without a control that can change it", () => {
    /* A default nothing can reach is a value the author can never change.
       Three are deliberate and named here, so the exception is a decision and
       not an oversight: `form_name` and `menu_name` are the page engine's own
       bookkeeping, and `menu` is the site-menu choice the Portal cannot offer
       until it can read a site's real menus (see navMenu.ts). */
    const NOT_EDITABLE = new Set(["form_name", "menu", "menu_name"]);
    for (const d of FAMILY.defs) {
      const keys = new Set(d.controls.map((c) => c.key));
      const orphans = Object.keys(d.defaults).filter((k) => !keys.has(k) && !NOT_EDITABLE.has(k));
      assert.deepEqual(orphans, [], `${d.kind}: these defaults have no control`);
    }
  });

  test("WAVE 2 DEEPENED THESE, and the panel is no longer three fields", () => {
    /* The point of the whole wave, said as a number. Each of these kinds
       existed on 2026-09-19 morning with the control count on the right; if a
       later pass thins one out, this goes red and names it. */
    const WAS = {
      google_maps: 3, book_now: 3,
      ia_social_links: 0, ia_mega_menu: 0, ia_mobile_menu: 0, ia_oliver_invoice: 0,
    };
    for (const [kind, before] of Object.entries(WAS)) {
      const now = DEF_OF[kind].controls.length;
      assert.ok(now > before + 4,
        `${kind} has ${now} controls and had ${before}; this wave exists to deepen it`);
      const style = DEF_OF[kind].controls.filter((c) => c.tab === "style").length;
      assert.ok(style > 0, `${kind} still has no Style tab`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   3. The canvas draws each one, and every control moves it
   ══════════════════════════════════════════════════════════════════════════ */

describe("f8: the canvas draws each one", () => {
  const ctx = (mode) => ({
    mode, accent: "#1D7A8C", business: { name: "A business", contactLine: "555-0100" },
  });
  const widget = (kind, props) => ({ id: "w1", kind, props });

  test("each renderer puts real markup on the page, with its own defaults", () => {
    const MARKER = {
      form: "<form", login: "bx-login", nav_menu: "bx-nav", google_maps: "bx-map",
      book_now: "bx-booknow", ia_social_links: "bx-social", ia_mega_menu: "bx-mega",
      ia_mobile_menu: "bx-mobilemenu", ia_oliver_invoice: "bx-invoice",
    };
    for (const d of FAMILY.defs) {
      for (const mode of ["edit", "view"]) {
        /* Google Maps and IA Social Links draw NOTHING with no address and no
           accounts, which is the right answer for a visitor — they are given
           the one prop that makes them real. */
        const props = { ...d.defaults };
        if (d.kind === "google_maps") props.address = "Marshalltown, IA";
        if (d.kind === "ia_social_links") props.platforms = ["facebook"];
        const html = RENDER_OF[d.kind](widget(d.kind, props), ctx(mode));
        assert.ok(html.includes(MARKER[d.kind]), `${d.kind} (${mode}): drew nothing recognisable`);
      }
    }
  });

  test("EVERY control this family added changes the page when it is set", () => {
    /**
     * THE RULE THIS WAVE IS MEASURED ON: *a control that changes nothing on the
     * canvas is a defect, not a feature.* So every control is EXECUTED - the
     * renderer is run with the widget's defaults, then again with that one
     * control set to something else, and the two outputs have to differ.
     *
     * Three honest complications, each handled by name rather than by
     * loosening the rule:
     *
     *  1. A SELECT is proved if ANY of its values moves the page, not just the
     *     next one along - `border_border` goes "" then "none", and neither
     *     draws a border.
     *  2. A control can DEPEND on another: Border Color does nothing until
     *     Border Type is set, Overlay Color until Background Type is Overlay.
     *     `PRECONDITION` says what has to be true first, in one table, so a
     *     dependency is written down instead of hidden.
     *  3. A few settings genuinely cannot show on a builder canvas - where a
     *     visitor is sent AFTER they sign in, what a SIGNED-IN visitor reads,
     *     the screen width a menu collapses at. `NO_VISIBLE_EFFECT` names each
     *     one with its reason, and the arion side proves they are published.
     */
    const OTHER = {
      text: "Different words", link: "https://example.test/x", address: "Ames, IA",
      title: "Different", button_text: "Different", user_label: "Different",
      cta_text: "Different", cta_link: "https://example.test/c",
      book_again_text: "Different", book_again_url: "https://example.test/b",
      business_name: "Different", business_phone: "555-0999", business_email: "them@example.test",
      featured_heading: "Different", featured_text: "Different",
      featured_link: "https://example.test/f", featured_link_text: "Different",
      business_logo_url: "https://cdn.example.test/logo.png",
      bg_image: "https://cdn.example.test/bg.jpg",
      button_css_id: "an-id", text_padding: "20px 40px",
      redirect_url: "https://example.test/account",
      redirect_logout_url: "https://example.test/bye",
    };

    /** What has to be true before this control can do anything. */
    const PRECONDITION = {
      "nav_menu.color_dropdown_item": { layout: "dropdown" },
      "nav_menu.background_color_dropdown_item": { layout: "dropdown" },
      "nav_menu.toggle_color": { layout: "dropdown" },
      "nav_menu.toggle_background_color": { layout: "dropdown" },
      "nav_menu.toggle_size": { layout: "dropdown" },
      "nav_menu.toggle_align": { layout: "dropdown" },
      "nav_menu.text_align": { layout: "dropdown" },
      "nav_menu.toggle": { layout: "dropdown" },
      "book_now.border_color": { border_border: "solid" },
      "book_now.border_width": { border_border: "solid" },
      "ia_social_links.icon_color": { icon_primary_color: "#123456" },
      "ia_social_links.icon_primary_color": { icon_color: "custom" },
      "ia_social_links.icon_secondary_color": { icon_color: "custom" },
      "ia_mega_menu.menu_source": { menu_items: [] },
      "ia_mega_menu.featured_heading": { menu_style: "full-width-banner" },
      "ia_mega_menu.featured_text": { menu_style: "full-width-banner" },
      "ia_mega_menu.featured_link": { menu_style: "full-width-banner" },
      "ia_mega_menu.featured_link_text": { menu_style: "full-width-banner" },
      "ia_mega_menu.dropdown_custom_width": { dropdown_width: "custom" },
      "ia_mobile_menu.menu_source": { custom_items: [] },
      "ia_mobile_menu.bg_image": { bg_type: "image" },
      "ia_mobile_menu.overlay_color": { bg_type: "overlay" },
    };

    /** Settings a static canvas cannot show, each with the reason. */
    const NO_VISIBLE_EFFECT = {
      "login.show_logged_in_message": "the canvas draws the signed-OUT box, which is the one "
        + "an author is laying out; this message is what a signed-IN visitor reads",
      "login.redirect_after_login": "where a visitor is sent AFTER they sign in",
      "login.redirect_url": "where a visitor is sent AFTER they sign in",
      "login.redirect_after_logout": "where a visitor is sent AFTER they sign out",
      "login.redirect_logout_url": "where a visitor is sent AFTER they sign out",
      "nav_menu.dropdown": "the screen WIDTH the menu collapses at; the canvas is one width",
    };

    /* Repeater LISTS: the rows are drawn, and adding or removing one needs
       `repeatKeyFor` in the shell, which is not a family's file. */
    const SKIP_TYPE = { list: true };

    const baseFor = (kind, extra) => {
      const base = { ...DEF_OF[kind].defaults, ...(extra || {}) };
      if (kind === "google_maps") {
        base.address = base.address || "Marshalltown, IA";
        /* Elementor's two CSS-filter POPOVERS gate their own six sliders: with
           the popover shut the engine reads none of them, and so does the
           canvas. Opening both is what makes the twelve sliders testable, and
           the popovers themselves are proved by turning them back off. */
        base.css_filters_css_filter = "custom";
        base.css_filters_hover_css_filter = "custom";
      }
      if (kind === "ia_social_links" && !(base.platforms || []).length) {
        base.platforms = ["facebook", "linkedin"];
      }
      if (kind === "ia_mega_menu" && !("menu_items" in (extra || {}))) {
        base.menu_items = [{ item_label: "Services", item_type: "link" }];
      }
      if (kind === "ia_mobile_menu" && !("custom_items" in (extra || {}))) {
        base.custom_items = [{ label: "Home" }];
      }
      return base;
    };

    /** Every value worth trying for one control. */
    const tries = (control, current) => {
      if (control.type === "toggle") return [true, false, "yes", ""];
      if (control.type === "select") return controlOptions(control).map((o) => o.value);
      if (control.type === "colour") return ["#ABCDEF"];
      if (control.type === "number") return [Number(current || 0) + 37, Number(current || 0) + 1];
      return OTHER[control.key] === undefined ? [] : [OTHER[control.key]];
    };

    const dead = [];
    const excused = [];
    let proved = 0;
    for (const d of FAMILY.defs) {
      for (const c of d.controls) {
        if (SKIP_TYPE[c.type]) continue;
        const id = `${d.kind}.${c.key}`;
        if (NO_VISIBLE_EFFECT[id]) { excused.push(id); continue; }
        const base = baseFor(d.kind, PRECONDITION[id]);
        const before = RENDER_OF[d.kind](widget(d.kind, base), ctx("view"));
        const values = tries(c, base[c.key]);
        if (!values.length) { dead.push(`${id} (no test value)`); continue; }
        const moved = values.some((v) =>
          RENDER_OF[d.kind](widget(d.kind, { ...base, [c.key]: v }), ctx("view")) !== before);
        if (moved) proved += 1; else dead.push(id);
      }
    }
    assert.deepEqual(dead, [],
      "these controls are on the panel and change nothing on the page - a dead control is a defect");
    assert.deepEqual(excused.sort(), Object.keys(NO_VISIBLE_EFFECT).sort(),
      "a control was excused and is no longer declared, or the other way round");
    assert.ok(proved > 80, `only ${proved} controls were proved to move the page`);
  });

  test("the Form draws Elementor's own three fields before the author types anything", () => {
    const html = renderForm(widget("form", {}), ctx("edit"));
    for (const label of ["Name", "Email", "Message"]) {
      assert.ok(html.includes(`>${label}`), `the starting form is missing ${label}`);
    }
    assert.ok(html.includes('data-edit="form_fields.0.field_label"'),
      "a field label is typed on the page, not in a side panel");
    assert.ok(html.includes('data-edit="button_text"'),
      "the submit words are typed on the button itself");
  });

  test("the Form still draws a landing page built before D-168", () => {
    // Those pages stored `fields: [{ label }]`, which is why the kind is
    // unchanged. Read both, write one.
    const old = renderForm(widget("form", { fields: [{ label: "Your name", type: "text" }] }), ctx("view"));
    assert.ok(old.includes("Your name"), "a stored landing page lost its field");
  });

  test("every prop the OLD definition stored is still read", () => {
    /* The whole reason a family reuses the kind id instead of inventing
       `book_now_v2`. Executed against the exact props the pre-D-168 panels
       wrote. */
    const bn = renderBookNow(widget("book_now", {
      label: "Book now", url: "https://example.test/book", align: "right",
    }), ctx("view"));
    assert.ok(bn.includes("Book now"), "a stored Book Now lost its words");
    assert.ok(bn.includes("https://example.test/book"), "a stored Book Now lost its link");
    assert.ok(bn.includes("flex-end"), "a stored Book Now lost its alignment");

    const sl = renderIaSocialLinks(widget("ia_social_links", {
      links: [{ network: "facebook", url: "https://facebook.test/x" }],
    }), ctx("view"));
    assert.ok(sl.includes("facebook"), "a stored Social Links lost its row");

    const map = renderGoogleMaps(widget("google_maps", { address: "Ames, IA", zoom: 14, height: 200 }), ctx("view"));
    assert.ok(map.includes("height:200px") && map.includes("z=14"), "a stored map lost its settings");
  });

  test("turning a Login switch off is visible on the page immediately", () => {
    const on = renderLogin(widget("login", { ...LOGIN_DEF.defaults }), ctx("edit"));
    assert.ok(on.includes("Remember Me"));
    assert.ok(on.includes("Lost your password?"));
    const off = renderLogin(widget("login", {
      ...LOGIN_DEF.defaults, show_remember_me: false, show_lost_password: false,
    }), ctx("edit"));
    assert.equal(off.includes("Remember Me"), false);
    assert.equal(off.includes("Lost your password?"), false);
  });

  test("WordPress Menu draws the layout and the pointer the panel is set to", () => {
    const vertical = renderNavMenu(widget("nav_menu", { layout: "vertical" }), ctx("edit"));
    assert.ok(vertical.includes("flex-direction:column"));
    const dropdown = renderNavMenu(widget("nav_menu", { layout: "dropdown" }), ctx("edit"));
    assert.ok(dropdown.includes("bx-nav-toggle"), "the dropdown layout is the hamburger on every screen");
    const framed = renderNavMenu(widget("nav_menu", { pointer: "framed" }), ctx("edit"));
    assert.ok(framed.includes("border:2px solid"));
    const none = renderNavMenu(widget("nav_menu", { pointer: "none" }), ctx("edit"));
    assert.equal(none.includes("border-bottom:3px solid"), false);
  });

  test("Google Maps' CSS filters only travel when their switch is on", () => {
    /* Elementor's popover toggle stores the string `custom` — read off the LIVE
       editor, `return_value: "custom"`, because no scrape records it. Reading
       it as a plain boolean would leave every filter off on a page the author
       had set them on. */
    const off = renderGoogleMaps(widget("google_maps", {
      address: "Ames, IA", css_filters_blur: 4,
    }), ctx("view"));
    assert.equal(off.includes("filter:"), false, "a filter was applied with the switch off");
    const on = renderGoogleMaps(widget("google_maps", {
      address: "Ames, IA", css_filters_css_filter: "custom", css_filters_blur: 4,
    }), ctx("view"));
    assert.ok(on.includes("blur(4px)"), "Blur did nothing with the switch on");
    const hover = renderGoogleMaps(widget("google_maps", {
      address: "Ames, IA", css_filters_hover_css_filter: "custom", css_filters_hover_brightness: 140,
      hover_transition: 0.4,
    }), ctx("view"));
    assert.ok(hover.includes(":hover{filter:"), "the hover filters are two controls that do nothing");
    assert.ok(hover.includes("transition:filter 0.4s"), "Transition Duration did nothing");
  });

  test("the address can be typed, even though a map has nothing to type into", () => {
    /* Our panel draws no `text` control (`PANEL_CONTROL_TYPES`), so words are
       typed on the canvas. A map is an iframe. The strip is EDIT ONLY, so a
       visitor never sees it. */
    const editing = renderGoogleMaps(widget("google_maps", { address: "Ames, IA" }), ctx("edit"));
    assert.ok(editing.includes('data-edit="address"'), "the address cannot be reached at all");
    const live = renderGoogleMaps(widget("google_maps", { address: "Ames, IA" }), ctx("view"));
    assert.equal(live.includes("data-edit"), false, "the editing strip reached a visitor's page");
  });

  test("a switch that defaults ON stays on until somebody turns it off", () => {
    /* Absent means the DEFAULT, never "off". Reading an untouched
       `show_book_again_cta` as off publishes an invoice with no Book Again
       button on a panel that showed one. */
    const untouched = renderIaOliverInvoice(widget("ia_oliver_invoice", {}), ctx("view"));
    assert.ok(untouched.includes("Schedule your next service"));
    const off = renderIaOliverInvoice(widget("ia_oliver_invoice", { show_book_again_cta: false }), ctx("view"));
    assert.equal(off.includes("Schedule your next service"), false);
    const menu = renderIaMobileMenu(widget("ia_mobile_menu", { custom_items: [{ label: "Home" }] }), ctx("view"));
    assert.ok(menu.includes("Contact Us"), "the CTA defaults on and did not draw");
  });

  test("the invoice fills itself in from the business profile", () => {
    /* What makes it a DATABASE twin and not just a box: the author types
       nothing and the business's own name is already on it. */
    const html = renderIaOliverInvoice(widget("ia_oliver_invoice", {}), ctx("view"));
    assert.ok(html.includes("A business"), "the business name was not filled in from the profile");
  });

  test("a renderer never puts an author's words on the page unescaped", () => {
    const nasty = '"><script>alert(1)</script>';
    const cases = [
      ["form", { form_fields: [{ field_label: nasty, field_type: "text" }], field_border_color: nasty }],
      ["nav_menu", { color_menu_item: nasty }],
      ["login", { user_label: nasty }],
      ["google_maps", { address: nasty }],
      ["book_now", { text: nasty, link: nasty, background_color: nasty, button_css_id: nasty }],
      ["ia_social_links", { platforms: [nasty], icon_primary_color: nasty, icon_color: "custom" }],
      ["ia_mega_menu", { menu_items: [{ item_label: nasty }], bg_color: nasty, featured_link: nasty }],
      ["ia_mobile_menu", { custom_items: [{ label: nasty }], bg_color: nasty, cta_link: nasty }],
      ["ia_oliver_invoice", { business_name: nasty, accent_color: nasty, book_again_url: nasty }],
    ];
    for (const [kind, props] of cases) {
      for (const mode of ["edit", "view"]) {
        const html = RENDER_OF[kind](widget(kind, props), ctx(mode));
        assert.equal(html.includes("<script>"), false,
          `${kind} (${mode}): an author's words reached the page as markup`);
      }
    }
  });

  test("nothing this family draws needs JavaScript to be readable", () => {
    // A widget that needs a script to be visible is a widget the author cannot
    // edit in place, and a visitor with a blocked script sees a hole.
    for (const d of FAMILY.defs) {
      const props = { ...d.defaults };
      if (d.kind === "google_maps") props.address = "Ames, IA";
      if (d.kind === "ia_social_links") props.platforms = ["facebook"];
      const html = RENDER_OF[d.kind](widget(d.kind, props), ctx("view"));
      assert.equal(/<script/i.test(html), false, `${d.kind} shipped a script tag`);
    }
    // ...and the ones that have words really show them with no script at all.
    const nav = renderNavMenu(widget("nav_menu", { ...NAV_MENU_DEF.defaults }), ctx("view"));
    assert.ok(nav.includes("Services"), "the menu draws nothing a reader can see");
    const login = renderLogin(widget("login", { ...LOGIN_DEF.defaults }), ctx("view"));
    assert.ok(login.includes("Log In"), "the login draws nothing a reader can see");
    const inv = renderIaOliverInvoice(widget("ia_oliver_invoice", {}), ctx("view"));
    assert.ok(inv.includes("INVOICE"), "the invoice draws nothing a reader can see");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   4. The mailbox half — Book Now is the only one a newsletter offers
   ══════════════════════════════════════════════════════════════════════════ */

describe("f8: what lands in an inbox", () => {
  const ectx = { mode: "view", accent: "#0C4A60" };
  const widget = (kind, props) => ({ id: "w1", kind, props });

  test("only the widget the offer file gives the newsletter has a mailbox half", () => {
    assert.deepEqual(Object.keys(FAMILY.emailRenderers || {}), ["book_now"]);
    assert.deepEqual(
      FAMILY.defs.filter((d) => d.builders.includes("newsletter")).map((d) => d.kind),
      ["book_now"]);
  });

  test("the mailbox half is tables and inline styles, with no classes and no flex", () => {
    /* `adapters/email/emailRender.ts` refuses anything else and that check is
       not weakened for families. Asserted here too, so the family's own test
       says why its markup looks like 1999. */
    const html = emailBookNow(widget("book_now", { text: "Book", link: "https://example.test/b" }), ectx);
    assert.ok(html.startsWith("<table"), "an inbox is built out of tables");
    assert.equal(/class=/.test(html), false, "a mailbox strips classes");
    assert.equal(/display:\s*flex|display:\s*grid/.test(html), false, "no flex, no grid");
    assert.ok(html.includes("Book"), "the words did not reach the inbox");
  });

  test("the panel means the same thing in an inbox as it does on a page", () => {
    const plain = emailBookNow(widget("book_now", {}), ectx);
    const styled = emailBookNow(widget("book_now", {
      size: "xl", align: "center", background_color: "#112233",
      button_text_color: "#FEC82C", border_radius: 14,
    }), ectx);
    assert.notEqual(plain, styled);
    assert.ok(styled.includes('align="center"'));
    assert.ok(styled.includes("background:#112233"));
    assert.ok(styled.includes("color:#FEC82C"));
    assert.ok(styled.includes("border-radius:14px"));
  });

  test("a newsletter saved before today still draws its button", () => {
    const old = emailBookNow(widget("book_now", { label: "Book now", url: "https://example.test/b" }), ectx);
    assert.ok(old.includes("Book now") && old.includes("https://example.test/b"));
  });

  test("an author's words never reach an inbox as markup", () => {
    const html = emailBookNow(widget("book_now", {
      text: '"><script>alert(1)</script>', link: '"><script>alert(1)</script>',
      background_color: '"><script>alert(1)</script>',
    }), ectx);
    assert.equal(html.includes("<script>"), false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   5. WHAT IS STILL SHADOWED — printed every run, so the lander cannot miss it
   ══════════════════════════════════════════════════════════════════════════ */

test("f8: every kind this family declares WINS over the older declaration", () => {
  /**
   * This is the guard that makes wave 2 possible, and it INVERTED on
   * b168/override.
   *
   * Before: `registry.WIDGETS` spread the families FIRST and `WIDGETS_BY_KIND`
   * was `Object.fromEntries`, so the LAST declaration won and a family copy of
   * a kind that `pageOnly.ts` or `iaBlocks.ts` still declared gave TWO tiles,
   * one of which drew the old definition's controls. That is why wave 1 held
   * six widgets back and said so.
   *
   * Now: `mergeWidgetDefs(FAMILY_WIDGET_DEFS, LEGACY_WIDGETS)` de-duplicates by
   * kind with the FAMILY winning, in the legacy entry's PLACE. So this asserts
   * the thing that has to be true for any of it to work, by EXECUTING the
   * registry: for every kind this folder declares, the definition the app
   * resolves has THIS family's label and THIS family's controls.
   *
   * NOT an identity check: `toWidgetDef()` copies a family def into the
   * engine's shape, so it is never the same object.
   */
  const shadowed = FAMILY.defs.filter((d) => {
    const won = WIDGETS_BY_KIND[d.kind];
    return !won || won.label !== d.label || won.controls.length !== d.controls.length;
  }).map((d) => d.kind);
  assert.deepEqual(shadowed, [],
    "an older declaration is still winning for these kinds, so the panel draws its controls "
    + "and every setting the rebuilt panel writes goes nowhere");
});

test("f8: the older declarations the lander can now delete", () => {
  /* Deleting them changes nothing at run time, which is how you know it is
     safe. Printed on every run rather than left in a document nobody opens. */
  const OLD_HOMES = {
    google_maps: "src/builder/widgets/pageOnly.ts",
    form: "src/builder/registry.ts",
    book_now: "src/builder/widgets/iaBlocks.ts",
    ia_social_links: "src/builder/widgets/iaBlocks.ts",
    ia_mega_menu: "src/builder/widgets/iaBlocks.ts",
    ia_mobile_menu: "src/builder/widgets/iaBlocks.ts",
    ia_oliver_invoice: "src/builder/widgets/iaBlocks.ts",
  };
  const lines = Object.entries(OLD_HOMES).map(([k, f]) => `${k} → ${f}`);
  console.log(`  NOTE f8 shadowed legacy declarations, safe to delete: ${lines.join("; ")}`);
  /* PRESENCE, not absence: each old declaration is still on disk today, and
     this names the day one of them goes so the note stops being a lie. */
  for (const [kind, file] of Object.entries(OLD_HOMES)) {
    const src = readFileSync(path.join(process.cwd(), file), "utf8");
    if (!src.includes(`kind: "${kind}"`)) {
      console.log(`  NOTE ${kind} has been deleted from ${file}. Take it off this list.`);
    }
  }
});

test("f8: every source file says which machine file its facts came from", () => {
  // A presence guard, not a style rule: the one thing that stops the next pass
  // inventing a control is that every file names the scrape it was read out of.
  const dir = path.join(process.cwd(), "src/builder/widgets/families/f8-contact-furniture");
  const files = readdirSync(dir).filter((f) => f.endsWith(".ts") && f !== "index.ts");
  assert.equal(files.length, 9, "a widget file was added or removed");
  for (const f of files) {
    const src = readFileSync(path.join(dir, f), "utf8");
    assert.ok(src.includes("2026-09-17") || src.includes("2026-09-19"),
      `${f} does not say which catalogue or which live read its names and defaults came from`);
  }
});
