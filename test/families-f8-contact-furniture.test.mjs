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
// What F8 PUBLISHES is asserted on the arion side, where the emitters live:
// `arion-api-septa-b168f8/test/families-f8-contact-furniture.test.mjs`. A
// cross-repo import from here would be a test that only passes on a machine
// that happens to have both worktrees checked out next to each other.
//
// ── THE MUTATIONS, run by EXECUTING the real functions, then restored ──────
// Each one was broken on purpose in the real source, the suite run, the named
// test seen red, and the source put back. What went red is written beside it in
// the results section of the handoff.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/* registry.ts FIRST, and on purpose. render.ts, registry.ts and the family
   folders are one import cycle by design (see widgets/index.ts). In the app the
   cycle is always entered through registry.ts; a test that entered it through a
   family index instead hit "Cannot access F8_CONTACT_FURNITURE before
   initialization". Importing the registry first makes this file evaluate the
   modules in the same order the app does. */
import { WIDGETS_BY_KIND, controlOptions } from "../src/builder/registry.ts";
import {
  FAMILY, FORM_DEF, LOGIN_DEF, NAV_MENU_DEF,
  renderForm, renderLogin, renderNavMenu,
} from "../src/builder/widgets/families/f8-contact-furniture/index.ts";
import { assertFamilyContract, SETTINGS_KEYS } from "./helpers/familyContract.mjs";

/** Our kind → Elementor's own slug. One table, read by every case below. */
const SLUG_OF = { form: "form", login: "login", nav_menu: "nav-menu" };

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

/* ══════════════════════════════════════════════════════════════════════════
   1. The names are Elementor's, not ours
   ══════════════════════════════════════════════════════════════════════════ */

describe("f8: the panel says what Elementor says", () => {
  /**
   * `nav-menu` is the one widget the two 2026-09-17 scrapes disagree about —
   * "WordPress Menu" on the IA site (Pro 4.1.1) and "Nav Menu" on the dev
   * WordPress (4.2.4). Both are written here so the test states the fact
   * rather than hiding it behind whichever file it happened to read.
   */
  const TITLES = {
    form: ["Form"],
    login: ["Login"],
    nav_menu: ["WordPress Menu", "Nav Menu"],
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
      assert.ok(TITLES[d.kind].includes(w.title), `${d.kind}: the catalogue calls it "${w.title}"`);
      /* All three are pro-elements. If one ever scrapes as free we want to be
         told, because `tier` is what decides whether an ARION Lite site may
         have it — and being wrong in that direction promises a client a widget
         their plan cannot draw. */
      assert.equal(w.pro, true, `${d.kind}: the catalogue no longer reports this as Pro`);
      assert.equal(d.tier, "pro", `${d.kind}: the definition must say pro`);
    }
  });

  test("every tile sits in a normal Elementor group, never in the IA one", () => {
    for (const d of FAMILY.defs) {
      assert.equal(d.category, "General",
        `${d.kind}: the Intelligent Analytics group is for IA widgets. This one is Elementor's.`);
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
   2. The controls are Elementor's, key by key
   ══════════════════════════════════════════════════════════════════════════ */

describe("f8: every control is a real control of the widget it belongs to", () => {
  test("no control invents a key the widget does not have", () => {
    for (const d of FAMILY.defs) {
      const legal = new Set(SETTINGS_KEYS.widgets[SLUG_OF[d.kind]].keys);
      const strays = d.controls.map((c) => c.key).filter((k) => !legal.has(k));
      assert.deepEqual(strays, [],
        `${d.kind}: these are not controls of Elementor's ${SLUG_OF[d.kind]}`);
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
    // ...and the two that ARE responsive really are declared, so the flag is
    // not quietly missing everywhere and passing for that reason.
    const flagged = FAMILY.defs.flatMap((d) => d.controls.filter((c) => c.responsive).map((c) => `${d.kind}.${c.key}`));
    assert.deepEqual(flagged.sort(), ["login.align"]);
  });

  test("every panel section is one of the widget's own, in Elementor's words", () => {
    const SECTIONS = {
      form: ["Form Fields", "Buttons", "Form", "Field"],
      login: ["Form Fields", "Button", "Additional Options", "Form", "Label", "Fields"],
      nav_menu: ["Layout", "Main Menu", "Dropdown", "Toggle Button"],
    };
    for (const d of FAMILY.defs) {
      const allowed = new Set(SECTIONS[d.kind]);
      const strays = [...new Set(d.controls.map((c) => c.section).filter(Boolean))]
        .filter((s) => !allowed.has(s));
      assert.deepEqual(strays, [],
        `${d.kind}: these panel sections are not Elementor's own for this widget`);
      const missing = d.controls.filter((c) => !c.section).map((c) => c.key);
      assert.deepEqual(missing, [],
        `${d.kind}: a control with no section falls into the panel's body instead of a named group`);
    }
  });

  test("every select offers the values the engine offers, and nothing else", () => {
    // A select value the control does not carry is DROPPED on publish. These
    // lists are Elementor's own, out of the 2026-09-17 Pro catalogue.
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
    };
    let checked = 0;
    for (const d of FAMILY.defs) {
      for (const c of d.controls) {
        if (c.type !== "select") continue;
        const want = EXPECTED[`${d.kind}.${c.key}`];
        assert.ok(want, `${d.kind}.${c.key} is a select with no recorded Elementor option list`);
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
});

/* ══════════════════════════════════════════════════════════════════════════
   2b. THE ONE THAT IS BUILT AND HELD BACK — Form
   ══════════════════════════════════════════════════════════════════════════ */

describe("f8: Form is finished, and held back by exactly one delete", () => {
  /**
   * `FORM_DEF` is not in `FAMILY.defs`, so every loop above skips it. It is
   * checked here instead, to the same standard, because code that is waiting
   * to be wired in and is not tested is code that rots.
   *
   * WHY IT IS HELD BACK: `registry.ts` still declares a legacy `hidden` widget
   * of kind `form`, and `builder-registry.test.mjs`'s "kinds are unique" is a
   * real invariant, not an expectation. Two definitions of one kind also means
   * `WIDGETS_BY_KIND` — `Object.fromEntries`, families spread FIRST — resolves
   * to the legacy one, so the Inspector would draw ITS controls and the author
   * would get a Form tile with an empty panel.
   */
  test("the reason it is held back is still true, and stops being true on one delete", () => {
    const legacy = WIDGETS_BY_KIND.form;
    if (legacy && legacy.label !== FORM_DEF.label) {
      assert.equal(legacy.hidden, true,
        "registry.ts's legacy `form` is no longer hidden, so there are now TWO Form tiles");
      assert.equal(FAMILY.defs.some((d) => d.kind === "form"), false,
        "FORM_DEF is in the family AND registry.ts still declares `form` — that is a duplicate kind");
      console.log("  NOTE Form is built and held back: delete the `hidden` `form` definition in "
        + "src/builder/registry.ts, then add FORM_DEF/renderForm to families/f8-contact-furniture/index.ts.");
      return;
    }
    assert.ok(FAMILY.defs.some((d) => d.kind === "form"),
      "registry.ts no longer declares a legacy `form`, so nothing is holding FORM_DEF back any more: "
      + "add it to `defs` and `renderForm` to `renderers` in families/f8-contact-furniture/index.ts.");
  });

  test("its name, group and tier are Elementor's", () => {
    const w = SETTINGS_KEYS.widgets.form;
    assert.equal(FORM_DEF.label, "Form");
    assert.equal(w.title, "Form");
    assert.equal(w.pro, true);
    assert.equal(FORM_DEF.tier, "pro");
    assert.equal(FORM_DEF.category, "General");
    assert.deepEqual(FORM_DEF.builders, ["website", "landing"],
      "the offer file lists `form` under website.elementor_pro and landing.elementor_pro");
  });

  test("no control invents a key Elementor's Form does not have", () => {
    const legal = new Set(SETTINGS_KEYS.widgets.form.keys);
    const strays = FORM_DEF.controls.map((c) => c.key).filter((k) => !legal.has(k));
    assert.deepEqual(strays, []);
  });

  test("its panel sections and select values are Elementor's own", () => {
    const allowed = new Set(["Form Fields", "Buttons", "Form", "Field"]);
    const strays = [...new Set(FORM_DEF.controls.map((c) => c.section))].filter((s) => !allowed.has(s));
    assert.deepEqual(strays, []);
    const EXPECTED = {
      input_size: ["xs", "sm", "md", "lg", "xl"],
      button_size: ["xs", "sm", "md", "lg", "xl"],
      button_width: ["20", "25", "30", "33", "40", "50", "60", "66", "70", "75", "80", "100"],
    };
    let checked = 0;
    for (const c of FORM_DEF.controls) {
      if (c.type !== "select") continue;
      assert.deepEqual(controlOptions(c).map((o) => o.value), EXPECTED[c.key], `form.${c.key}`);
      checked += 1;
    }
    assert.equal(checked, 3);
  });

  test("Column Width is responsive because the catalogue says it is", () => {
    const resp = new Set(SETTINGS_KEYS.widgets.form.responsive || []);
    const flagged = FORM_DEF.controls.filter((c) => c.responsive).map((c) => c.key);
    assert.deepEqual(flagged, ["button_width"]);
    assert.ok(resp.has("button_width"));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   3. The canvas draws each one
   ══════════════════════════════════════════════════════════════════════════ */

describe("f8: the canvas draws each one", () => {
  const ctx = (mode) => ({ mode, accent: "#1D7A8C" });
  const widget = (kind, props) => ({ id: "w1", kind, props });

  test("each renderer puts real markup on the page, with its own defaults", () => {
    for (const [def, render, marker] of [
      [FORM_DEF, renderForm, "<form"],
      [LOGIN_DEF, renderLogin, "bx-login"],
      [NAV_MENU_DEF, renderNavMenu, "bx-nav"],
    ]) {
      for (const mode of ["edit", "view"]) {
        const html = render(widget(def.kind, { ...def.defaults }), ctx(mode));
        assert.ok(html.includes(marker), `${def.kind} (${mode}): drew nothing recognisable`);
      }
    }
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

  test("changing a setting changes the page", () => {
    // The whole point of a panel. Asserted by executing the renderer, not by
    // reading it.
    const plain = renderForm(widget("form", {}), ctx("edit"));
    const marked = renderForm(widget("form", { mark_required: "yes" }), ctx("edit"));
    assert.equal(plain.includes("#DC2626"), false);
    assert.ok(marked.includes("#DC2626"), "Required Mark did nothing");

    const unlabelled = renderForm(widget("form", { show_labels: false }), ctx("edit"));
    assert.equal(unlabelled.includes(">Name"), false, "Label did nothing");

    const tinted = renderForm(widget("form", { field_background_color: "#EEF6F8" }), ctx("view"));
    assert.ok(tinted.includes("#EEF6F8"), "Background Color did nothing");
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

  test("an empty slider draws the number the canvas falls back to, never zero", () => {
    // Elementor ships these sliders EMPTY. Reading "" as 0 would draw a menu
    // with its items touching and no padding, which is not what the panel
    // showed the author.
    const html = renderNavMenu(widget("nav_menu", { ...NAV_MENU_DEF.defaults }), ctx("view"));
    assert.equal(html.includes("gap:0px"), false, "an empty Space Between became zero");
    assert.equal(html.includes("padding:0px 0px"), false, "empty padding became zero");
  });

  test("a renderer never puts an author's words on the page unescaped", () => {
    const nasty = '"><script>alert(1)</script>';
    const form = renderForm(widget("form", {
      form_fields: [{ field_label: nasty, field_type: "text" }], field_border_color: nasty,
    }), ctx("edit"));
    assert.equal(form.includes("<script>"), false, "a field label reached the page as markup");
    const nav = renderNavMenu(widget("nav_menu", { color_menu_item: nasty }), ctx("edit"));
    assert.equal(nav.includes("<script>"), false, "a colour reached the page as markup");
    const login = renderLogin(widget("login", { user_label: nasty }), ctx("edit"));
    assert.equal(login.includes("<script>"), false, "a field label reached the page as markup");
  });

  test("nothing this family draws needs JavaScript to be readable", () => {
    // A widget that needs a script to be visible is a widget the author cannot
    // edit in place, and a visitor with a blocked script sees a hole.
    for (const [def, render] of [[FORM_DEF, renderForm], [LOGIN_DEF, renderLogin], [NAV_MENU_DEF, renderNavMenu]]) {
      const html = render(widget(def.kind, { ...def.defaults }), ctx("view"));
      assert.equal(/<script/i.test(html), false, `${def.kind} shipped a script tag`);
    }
    // ...and the two that have words really show them with no script at all.
    const nav = renderNavMenu(widget("nav_menu", { ...NAV_MENU_DEF.defaults }), ctx("view"));
    assert.ok(nav.includes("Services"), "the menu draws nothing a reader can see");
    const login = renderLogin(widget("login", { ...LOGIN_DEF.defaults }), ctx("view"));
    assert.ok(login.includes("Log In"), "the login draws nothing a reader can see");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   4. WHAT IS STILL SHADOWED — printed every run, so the lander cannot miss it
   ══════════════════════════════════════════════════════════════════════════ */

test("f8: which of this family's kinds are still shadowed by an older declaration", () => {
  /* `registry.WIDGETS` spreads the families FIRST, and `WIDGETS_BY_KIND` is
     built with `Object.fromEntries`, so the LAST declaration of a kind wins.
     Until the older declaration is deleted, the Inspector draws ITS controls
     for our tile. Exactly one kind is in that state — `form`, whose legacy
     definition in registry.ts is `hidden: true`, so there is no second tile,
     only an empty panel. It is the first line of "Land: delete these" in
     D168_HANDOFF_2026-09-19.md, and this prints it on every run rather than
     leaving it in a document nobody opens. */
  /* NOT an identity check: `toWidgetDef()` copies a family def into the
     engine's shape, so the object in WIDGETS_BY_KIND is never the same object.
     What tells a shadow apart is that it is a DIFFERENT definition — another
     label, or another set of controls. */
  const shadowed = FAMILY.defs.filter((d) => {
    const won = WIDGETS_BY_KIND[d.kind];
    return !won || won.label !== d.label || won.controls.length !== d.controls.length;
  }).map((d) => d.kind);
  console.log(`  NOTE f8 kinds still shadowed by an older declaration: ${
    shadowed.length ? shadowed.join(", ") : "none — every one resolves to the family definition"}`);
  assert.deepEqual(shadowed.filter((k) => k !== "form"), [],
    "only `form` is knowingly shadowed (registry.ts's hidden legacy definition). A new name here "
    + "means a widget was added without deleting what it replaces.");
});

test("f8: every source file says which machine file its facts came from", () => {
  // A presence guard, not a style rule: the one thing that stops the next pass
  // inventing a control is that every file names the scrape it was read out of.
  const dir = path.join(process.cwd(), "src/builder/widgets/families/f8-contact-furniture");
  for (const f of ["form.ts", "login.ts", "navMenu.ts"]) {
    const src = readFileSync(path.join(dir, f), "utf8");
    assert.ok(src.includes("BUILDER_WIDGET_CATALOG_2026-09-17"),
      `${f} does not say which catalogue its names and defaults came from`);
  }
});
