/**
 * test/builder-override.test.mjs — THE OVERRIDE RULE (D-168, b168/override).
 *
 * ── WHY THIS BRANCH EXISTS ────────────────────────────────────────────────
 * Ten family agents were each told to build widgets in their own folder and to
 * open no shared file. Eight of them finished, and every one of them reported
 * the same thing: the seam was short, so they had to open a shared file anyway,
 * and the next nine would each write the identical line. The measured list is
 * in `D168_HANDOFF_2026-09-19.md` — f1-words §6 (six places), f5 §4 (five),
 * f6 §2 (three), f7 §3 (two), f8 §4 (three), f2 §3 (three), f3 §4 (one).
 *
 * This file is the guard on the answers. Each `describe` is one numbered item
 * of the override brief, and each one names the family that found the gap.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  WIDGETS, WIDGETS_BY_KIND, WIDGET_CATEGORIES, PANEL_ORDER, mergeWidgetDefs, panelAt,
  shadowedLegacyKinds, unorderedKinds, widgetsFor, widgetLabel, elementorPlace,
  ELEMENTOR_PANEL,
} from "../src/builder/registry.ts";
import { panelGroups, PANEL_GROUPS, openGroups } from "../src/builder/widgetGroups.ts";
import {
  FAMILY_DEFS, FAMILY_RENDERED_KINDS, FAMILY_EMAIL_RENDERED_KINDS,
  FAMILY_LANDING_RENDERED_KINDS, familySurfaceGaps,
} from "../src/builder/widgets/families/index.ts";
import { RENDERED_KINDS, makeContext, renderDocument } from "../src/builder/render.ts";
import { esc } from "../src/builder/esc.ts";
import { EMAIL_DRAWN_KINDS } from "../src/builder/adapters/email/emailRender.ts";
import { insertWidget } from "../src/builder/adapters/mybrand/insert.ts";
import { emptyCanvas } from "../src/builder/adapters/mybrand/scene.ts";
import { LANDING_DRAWN_KINDS } from "../src/builder/adapters/landing/landingRender.ts";
import { groupLockedOnPlan } from "../src/builder/WidgetPane.tsx";
import { upgradeDocument } from "../src/builder/upgrade.ts";
import { emptyDocument, makeSection, makeWidget } from "../src/builder/model.ts";
import { GROUPS as MACHINE_GROUPS, PANEL as MACHINE_PANEL } from "./helpers/panelOrder.mjs";

const readSrc = (rel) => readFileSync(path.join(process.cwd(), "src", rel), "utf8");

/** A brand kit made of nothing a real business owns, for the studio's inserts. */
const STUDIO_BRAND = {
  colours: { primary: "#0A0B0C", secondary: "#141516", accent: "#1E1F20", text: "#282930", background: "#323340" },
  fonts: { heading: "Testa, serif", body: "Testb, sans-serif" },
  logoUrl: "https://example.test/logo.png",
  businessName: "Rolling In It",
  websiteUrl: "https://rollinginit.test",
};

/** A one-widget document, so a kind can be RENDERED rather than read about. */
function docWith(kind, props) {
  const doc = emptyDocument();
  const section = makeSection();
  section.columns[0].widgets.push(makeWidget(kind, props));
  doc.sections = [section];
  return doc;
}

const drawn = (doc) => renderDocument(doc, makeContext(doc, { mode: "view" }));

/* ══════════════════════════════════════════════════════════════════════════
   1. A FAMILY DEFINITION REPLACES A LEGACY ONE OF THE SAME KIND
   ══════════════════════════════════════════════════════════════════════════

   MEASURED, by f2-pictures: it could not deepen Image, Image Box, Image
   Carousel, Basic Gallery or Video to Elementor's own controls. A second
   definition of an existing kind fails `builder-registry.test.mjs` "kinds are
   unique", and the only way to remove the first was to open `registry.ts` or a
   shared atom file — which the family contract forbids. Every one of the ten
   would have hit it, and deepening an existing widget is most of what D-168
   asks for. ─────────────────────────────────────────────────────────────── */

describe("1. a family definition replaces the legacy one, and the legacy one is dropped", () => {
  const legacyDef = {
    kind: "heading", label: "Heading (old)", description: "the old one",
    icon: "Type", picture: "", category: "Basic", adapters: ["proposal"],
    defaults: { text: "" },
    controls: [{ key: "text", label: "Text", type: "text" }],
  };
  const familyDef = {
    kind: "heading", label: "Heading", description: "Elementor's own",
    icon: "Heading1", picture: "", category: "Basic", order: 1,
    adapters: ["proposal", "website", "landing", "email"],
    defaults: { title: "", header_size: "h2" },
    controls: [
      { key: "title", label: "Title", type: "text", tab: "content", section: "Title" },
      { key: "header_size", label: "HTML Tag", type: "select", tab: "content", section: "Title" },
    ],
  };
  const other = {
    kind: "spacer", label: "Spacer", description: "space", icon: "Move", picture: "",
    category: "Basic", adapters: ["proposal"], defaults: {}, controls: [],
  };

  test("the family wins, whole: its controls, its label, its group and its builders", () => {
    const merged = mergeWidgetDefs([familyDef], [other, legacyDef]);
    const won = merged.filter((d) => d.kind === "heading");
    assert.equal(won.length, 1, "the legacy definition is still in the list");
    assert.equal(won[0].label, "Heading");
    assert.deepEqual(won[0].controls.map((c) => c.key), ["title", "header_size"]);
    assert.equal(won[0].category, "Basic");
    assert.deepEqual(won[0].adapters, ["proposal", "website", "landing", "email"]);
    assert.deepEqual(won[0].defaults, { title: "", header_size: "h2" });
  });

  test("it takes the legacy one's PLACE, so nothing else on the panel moves", () => {
    const merged = mergeWidgetDefs([familyDef], [other, legacyDef]);
    assert.deepEqual(merged.map((d) => d.kind), ["spacer", "heading"]);
  });

  test("a family's NEW kind is added, and goes first, where the seam put it", () => {
    const fresh = { ...familyDef, kind: "blockquote", label: "Blockquote" };
    const merged = mergeWidgetDefs([fresh], [other, legacyDef]);
    assert.deepEqual(merged.map((d) => d.kind), ["blockquote", "spacer", "heading"]);
  });

  test("kinds are unique on the MERGED list — the list everything else reads", () => {
    const seen = new Map();
    for (const w of WIDGETS) {
      assert.equal(seen.has(w.kind), false, `two definitions of "${w.kind}"`);
      seen.set(w.kind, w);
    }
    // …and WIDGETS_BY_KIND cannot disagree with it, which is the silent version
    // of the same defect.
    assert.equal(Object.keys(WIDGETS_BY_KIND).length, WIDGETS.length);
  });

  test("EXECUTED: a stored document of a replaced kind still draws", () => {
    /* The reason the legacy definition is dropped from the RESULT and not from
       the file: a customer's proposal holds these kinds, and a definition that
       vanishes mid-merge is a blank page on a document somebody already
       signed. Rendered, not read. */
    for (const kind of ["heading", "paragraph", "list", "divider"]) {
      const html = drawn(docWith(kind, { text: "Kept", items: ["Kept"] }));
      assert.ok(html.length > 0, `${kind} drew nothing`);
      assert.ok(WIDGETS_BY_KIND[kind], `${kind} lost its definition`);
    }
    assert.match(drawn(docWith("heading", { text: "Still here" })), /Still here/);
  });

  test("which legacy definitions a family has taken over is nameable", () => {
    /* The lander deletes the shadowed ones from the file, mechanically, once
       the families have landed. This is the list to delete; today it is empty
       because no family has landed on this branch. */
    for (const kind of shadowedLegacyKinds()) {
      assert.ok(FAMILY_DEFS.some((d) => d.kind === kind), kind);
    }
  });

  test("MUTATION: de-duplication removed, and the uniqueness guard goes red", () => {
    /* The guard is `mergeWidgetDefs` itself. Break it the one way it can break
       — concatenate instead of merge, which is exactly what the seam commit
       did — and run the real uniqueness check over the result. */
    const naive = [familyDef, ...[other, legacyDef]];
    const kinds = naive.map((d) => d.kind);
    assert.notEqual(new Set(kinds).size, kinds.length, "the mutation did not break it");
    // …and restored: the real function gives one.
    const real = mergeWidgetDefs([familyDef], [other, legacyDef]).map((d) => d.kind);
    assert.equal(new Set(real).size, real.length);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2. PRECEDENCE, WHERE THE SEAMS PUT IT
   ══════════════════════════════════════════════════════════════════════════ */

describe("2. the family is asked before the engine, on this side", () => {
  const render = readSrc("builder/render.ts");

  test("renderWidget asks the adapter, then the family, then the atoms, then itself", () => {
    /* READ, NOT EXECUTED, and said plainly. The family renderer table is built
       at module level inside `families/index.ts` and nothing can add a row to
       it from a test without a backdoor, which would be a worse thing to own
       than this assertion. The order of the four calls is the whole mechanism,
       so the four are found by position and asserted to be in that order.
       The EXECUTING versions of this test are in the other three repos, where
       the maps are plain objects a test can write to: arion
       `test/website-builder-override.test.js`, LUMEN
       `test/email-families-override.test.mjs`, oliver
       `test/pdf-families-index.test.mjs`. */
    const at = (needle) => {
      const i = render.indexOf(needle);
      assert.notEqual(i, -1, `render.ts no longer contains ${needle}`);
      return i;
    };
    const extra = at("const own = ctx.extra?.(w, ctx);");
    const family = at("const fam = renderFamily(w, ctx);");
    const atom = at("const atom = renderAtom(w, ctx);");
    const own = at('switch (w.kind) {');
    assert.ok(extra < family, "the adapter must be asked first");
    assert.ok(family < atom, "a family widget must win over an atom of the same kind");
    assert.ok(atom < own, "the engine's own switch is last");
  });

  test("EXECUTED: the adapter's `extra` wins over the engine's own switch", () => {
    /* The one link in that chain a test can drive without a backdoor, and the
       one the seam is modelled on. */
    const doc = docWith("heading", { text: "engine" });
    const ctx = makeContext(doc, {
      mode: "view",
      extra: (w) => (w.kind === "heading" ? "<p>adapter</p>" : null),
    });
    const html = renderDocument(doc, ctx);
    assert.match(html, /adapter/);
    assert.equal(/engine/.test(html), false, "the engine drew a widget the adapter claimed");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   3. TILE ORDER COMES OFF THE MACHINE FILE, NOT OFF A HAND LIST
   ══════════════════════════════════════════════════════════════════════════

   `PANEL_ORDER` lives in `registry.ts`, which §C.1 forbids a family to open,
   and `unorderedKinds()` was asserted EMPTY — so every family's first widget
   turned that test red. f1 (§6.2), f5 (S3), f7 (§3b) and f8 (§4.1) each hit it;
   f8 appended two strings, f7 sharpened the test, f5 widened it. One answer:
   a definition carries its own `order`, and an Elementor widget does not even
   have to, because Elementor already said. ──────────────────────────────── */

describe("3. where a tile sits is Elementor's answer, read from the machine file", () => {
  test("the generated module and the test fixture agree — neither was hand-edited", () => {
    assert.deepEqual(Object.keys(ELEMENTOR_PANEL).sort(), Object.keys(MACHINE_PANEL.widgets).sort());
    for (const [title, entry] of Object.entries(MACHINE_PANEL.widgets)) {
      assert.deepEqual(ELEMENTOR_PANEL[title], entry, title);
    }
  });

  test("Basic and General are Elementor's own, in Elementor's own order", () => {
    const inGroup = (g) => Object.entries(MACHINE_PANEL.widgets)
      .filter(([, e]) => e.group === g)
      .sort((a, b) => a[1].order - b[1].order)
      .map(([title]) => title);
    assert.deepEqual(inGroup("Basic").slice(0, 4), ["Inner Section", "Heading", "Image", "Text Editor"]);
    assert.deepEqual(inGroup("General").slice(0, 4), ["Tabs", "Accordion", "Image Box", "Icon Box"]);
    /* …and the panel draws what it is offered in that order. Every tile with an
       Elementor name, on every builder, is in Elementor's own sequence. */
    for (const adapter of ["proposal", "email", "website", "landing"]) {
      const ours = widgetsFor(adapter)
        .map((w) => [widgetLabel(w, adapter), elementorPlace(widgetLabel(w, adapter))])
        .filter(([label, place]) => place && place.group === WIDGETS_BY_KIND[
          widgetsFor(adapter).find((w) => widgetLabel(w, adapter) === label).kind].category);
      const basic = ours.filter(([, p]) => p.group === "Basic").map(([, p]) => p.order);
      const general = ours.filter(([, p]) => p.group === "General").map(([, p]) => p.order);
      for (const list of [basic, general]) {
        assert.deepEqual(list, [...list].sort((a, b) => a - b), `${adapter} is out of Elementor's order`);
      }
    }
  });

  test("a definition's own `order` is read first, ahead of everything", () => {
    const def = {
      kind: "x", label: "Heading", category: "Basic", order: 99,
      description: "", icon: "", picture: "", adapters: ["proposal"], defaults: {}, controls: [],
    };
    assert.equal(panelAt(def), 99);
    /* …and without one, Elementor's own position for that title. */
    assert.equal(panelAt({ ...def, order: undefined }), elementorPlace("Heading").order);
  });

  test("a family never has to touch PANEL_ORDER again", () => {
    /* The promise, stated as a test: every family definition has a place
       without being named in `registry.ts`'s list. */
    for (const d of FAMILY_DEFS) {
      assert.notEqual(panelAt(d), null, `${d.kind} has no place`);
      if (PANEL_ORDER.includes(d.kind)) continue;
      assert.ok(typeof d.order === "number" || elementorPlace(d.label),
        `${d.kind} is neither ordered by itself nor named by Elementor`);
    }
    assert.deepEqual(unorderedKinds(), []);
  });

  test("MUTATION: take the machine file away and a tile loses its place — executed", () => {
    const orphan = {
      kind: "nothing_like_it", label: "A Name Elementor Never Shipped", category: "General",
      description: "", icon: "", picture: "", adapters: ["proposal"], defaults: {}, controls: [],
    };
    assert.equal(panelAt(orphan), null, "a tile nobody placed was quietly given a place");
    // …and giving it one, which is the fix a family would make, answers.
    assert.equal(panelAt({ ...orphan, order: 4 }), 4);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   5. THE SEAMS THAT WERE SHORT
   ══════════════════════════════════════════════════════════════════════════ */

describe("5a. RENDERED_KINDS knows about the families", () => {
  test("every kind a family draws is on the list four tests read", () => {
    for (const kind of FAMILY_RENDERED_KINDS) {
      assert.ok(RENDERED_KINDS.includes(kind), `${kind} is drawn and nothing says so`);
    }
  });

  test("PRESENCE: the spread is in the file, so the list follows a family that lands", () => {
    /* THE SET CHECK ABOVE CANNOT GO RED TODAY and I will not pretend it can:
       no family has landed on this branch, so `FAMILY_RENDERED_KINDS` is empty
       and a missing spread is indistinguishable from a present one. Six
       families reported this gap, every one of them AFTER their widgets
       existed. So the guard is on the SPREAD itself, at the real boundary,
       where it goes red the moment somebody takes the line out — mutation-run
       2026-09-19: deleted `...FAMILY_RENDERED_KINDS,` from render.ts, this went
       red; restored, green. */
    const src = readSrc("builder/render.ts");
    assert.match(src, /import \{[^}]*FAMILY_RENDERED_KINDS[^}]*\} from "\.\/widgets\/families"/);
    const list = src.slice(src.indexOf("export const RENDERED_KINDS = ["));
    const spread = list.indexOf("...FAMILY_RENDERED_KINDS,");
    assert.notEqual(spread, -1, "RENDERED_KINDS no longer spreads the families");
    assert.ok(spread < list.indexOf("] as const;"), "the spread is outside the list");
  });
});

describe("5b. every surface a widget is offered on asks the families first", () => {
  const email = readSrc("builder/adapters/email/emailRender.ts");
  const landing = readSrc("builder/adapters/landing/landingRender.ts");
  const studio = readSrc("builder/adapters/mybrand/insert.ts");

  test("the mailbox asks, in BOTH halves", () => {
    /* f1 §6.4 and f6 §2.1: the `default` branch of this switch returns the
       "needs a newer version" note, which is NOT null, so `render.ts`'s own
       family call was never reached in a newsletter. f6 §2.3: the plain-text
       half had no hook at all, and a text part holding the footer and nothing
       else is the bulk shape that costs the sending quota. */
    const html = email.indexOf("const fam = renderEmailFamily(");
    const sw = email.indexOf("switch (EMAIL_KIND_ALIASES[w.kind] || w.kind) {");
    assert.notEqual(html, -1, "the mailbox does not ask the families");
    assert.ok(html < sw, "it asks after its own switch, which is never");
    assert.match(email, /const markup = renderEmailFamily\(/, "the plain-text half does not ask");
  });

  test("the hosted landing page asks, before the atoms", () => {
    const fam = landing.indexOf("const fam = renderLandingFamily(w, c as never);");
    const atom = landing.indexOf("const engine = renderAtom(");
    assert.notEqual(fam, -1, "the landing surface does not ask the families");
    assert.ok(fam < atom, "it asks the atoms first, so a family widget is a blank band");
  });

  test("the My Brand studio asks, instead of silently placing nothing", () => {
    assert.match(studio, /const fam = insertFamilyWidget\(kind, /);
  });

  test("the two derived lists follow the families and are never typed", () => {
    for (const kind of FAMILY_EMAIL_RENDERED_KINDS) assert.ok(EMAIL_DRAWN_KINDS.includes(kind), kind);
    for (const kind of FAMILY_LANDING_RENDERED_KINDS) assert.ok(LANDING_DRAWN_KINDS.includes(kind), kind);
    for (const kind of FAMILY_RENDERED_KINDS) assert.ok(LANDING_DRAWN_KINDS.includes(kind), kind);
  });

  test("PRESENCE: nothing is offered on a surface it cannot be drawn on", () => {
    /* The guard the gaps above were: a tile on the newsletter panel that
       nothing draws shows "this part needs a newer version of the builder" in
       a real person's inbox.

       WIDENED 2026-09-19 (D-168 wave 2). The guard asked "did the FAMILY write
       a mailbox renderer", which named `heading` and `paragraph` the day the
       f1-words family took over their DEFINITIONS - and both have been drawn
       in a mailbox since the first newsletter. It asks the real question now,
       and the caller hands in what each surface already draws. There is no
       default: a guard that passes because its caller forgot is the failure
       mode reference_absence_based_guards_fail_open names.

       My Brand's list is EXECUTED, not typed: every kind the studio really
       places is the kind `insertWidget` really puts layers on a canvas for. */
    const canvas = emptyCanvas(1080, 1080);
    const places = (kind) => {
      try {
        const out = insertWidget(kind, canvas, STUDIO_BRAND, { count: 3 });
        return !!(out && Array.isArray(out.layers) && out.layers.length);
      } catch { return false; }
    };
    const mybrand = widgetsFor("brand").map((w) => w.kind).filter(places);
    assert.deepEqual(familySurfaceGaps({ newsletter: EMAIL_DRAWN_KINDS, mybrand }), []);
  });

  test("MUTATION: a surface that draws nothing is still named", () => {
    /* Executed, not read: take the one widget the family draws in a mailbox
       out of what the mailbox can draw, and the guard names it and its
       builder. Without this, the widened guard above could pass by being
       handed everything. */
    const everything = EMAIL_DRAWN_KINDS.filter((k) => k !== "blockquote" && k !== "html");
    const gaps = familySurfaceGaps({ newsletter: everything, mybrand: widgetsFor("brand").map((w) => w.kind) });
    assert.deepEqual(gaps, [], "a family that draws it itself is never a gap");
    const noFamily = familySurfaceGaps({ newsletter: [], mybrand: [] });
    /* `heading` on MY BRAND: the f1-words family writes no studio insert for
       it, because `adapters/mybrand/insert.ts` has placed a heading on that
       canvas since the studio existed. Told that the studio places nothing,
       the guard has to name it. */
    assert.ok(noFamily.some((g) => g.kind === "heading" && g.builder === "mybrand"),
      "a kind nothing places on the studio canvas has to be named");
  });

  test("the escaper is in a module that imports nothing", () => {
    /* f1 §6.6 and f5 S5: a family folder importing `esc` from `render.ts`
       pulls `families/index.ts` into its own graph and reads that index's
       tables while the family is still evaluating. Executed: the escaper
       works, and its module has no imports at all. */
    assert.equal(esc('<a href="x">&</a>'), "&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
    const src = readSrc("builder/esc.ts");
    assert.equal(/^\s*import\s/m.test(src), false, "esc.ts imports something, so the cycle is back");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   4. ONE TILE CALLED SOCIAL ICONS
   ══════════════════════════════════════════════════════════════════════════ */

describe("4. one tile is called Social Icons, and stored documents keep their rows", () => {
  test("exactly one definition wears the label, on every builder", () => {
    for (const adapter of ["proposal", "email", "website", "landing", "brand"]) {
      const hits = widgetsFor(adapter).filter((w) => widgetLabel(w, adapter) === "Social Icons");
      assert.ok(hits.length <= 1, `${adapter} shows ${hits.length} tiles called Social Icons`);
    }
    assert.equal(WIDGETS.filter((w) => w.label === "Social Icons").length, 1);
  });

  test("the kind that survived is the one stored documents use", () => {
    assert.ok(WIDGETS_BY_KIND.social_links, "the stored kind was deleted");
    assert.equal(WIDGETS_BY_KIND.social_icons, undefined, "the second definition is still here");
  });

  test("EXECUTED: a stored `social_icons` comes in as the one kind, with its rows", () => {
    const doc = docWith("social_icons", {
      social_icon_list: [{ social: "facebook", link: "https://example.test/fb" }],
    });
    const after = upgradeDocument(doc);
    const w = after.sections[0].columns[0].widgets[0];
    assert.equal(w.kind, "social_links");
    assert.equal(w.props.social_icon_list.length, 1);
    assert.equal(w.props.social_icon_list[0].link, "https://example.test/fb");
  });

  test("EXECUTED: the older `links` spelling survives too", () => {
    const doc = docWith("social_icons", { links: [{ url: "https://example.test/x", label: "X" }] });
    const w = upgradeDocument(doc).sections[0].columns[0].widgets[0];
    assert.equal(w.kind, "social_links");
    assert.equal(w.props.social_icon_list[0].url, "https://example.test/x");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   6. THE PANEL'S GROUPS ARE ELEMENTOR PRO'S
   ══════════════════════════════════════════════════════════════════════════ */

describe("6. Layout, Basic, Pro, General, Site, then ours", () => {
  test("the six, in that order, and the registry is the only place they live", () => {
    assert.deepEqual([...WIDGET_CATEGORIES], [...MACHINE_GROUPS]);
    assert.deepEqual([...PANEL_GROUPS], [...WIDGET_CATEGORIES]);
  });

  test("Pro holds the pro-elements widgets and Site the theme pieces", () => {
    assert.equal(elementorPlace("Price Table").group, "Pro");
    assert.equal(elementorPlace("Reviews").group, "Pro");
    assert.equal(elementorPlace("Form").group, "Pro");
    assert.equal(elementorPlace("Site Logo").group, "Site");
    assert.equal(elementorPlace("Page Title").group, "Site");
    assert.equal(elementorPlace("Post Title").group, "Site");
    /* …and General keeps the free ones it always had. */
    assert.equal(elementorPlace("Icon List").group, "General");
    assert.equal(elementorPlace("Alert").group, "General");
  });

  test("a group with nothing offered for this builder is not drawn", () => {
    for (const adapter of ["proposal", "email", "website", "landing", "brand"]) {
      for (const g of panelGroups(adapter)) {
        assert.ok(g.widgets.length > 0, `${adapter} draws an empty ${g.group} accordion`);
      }
    }
  });

  test("every accordion starts open, with or without a search", () => {
    const groups = panelGroups("website");
    assert.deepEqual(openGroups(groups, ""), groups.map((g) => g.group));
  });

  test("EXECUTED: the Upgrade link is drawn only when the WHOLE group is refused on plan", () => {
    const group = { widgets: [{ kind: "a" }, { kind: "b" }] };
    const plan = { reason: "plan", sentence: "…", tier: "pro" };
    const owns = { reason: "ownership", sentence: "…", tier: "ia:oliver" };
    assert.equal(groupLockedOnPlan(group, { a: plan, b: plan }), true);
    /* ONE tile refused is not a group behind a plan. */
    assert.equal(groupLockedOnPlan(group, { a: plan }), false);
    /* …and a group held back because the business does not own a PRODUCT is
       not a group a bigger website plan opens. `nav_visibility_semantics`
       forbids one word for the two, and this is that rule, executed. */
    assert.equal(groupLockedOnPlan(group, { a: plan, b: owns }), false);
    assert.equal(groupLockedOnPlan({ widgets: [] }, {}), false);
  });

  test("the pane draws a padlock on a refused tile, and the link on the heading", () => {
    const pane = readSrc("builder/WidgetPane.tsx");
    assert.match(pane, /data-widget-padlock=\{w\.kind\}/);
    assert.match(pane, /data-pane-group-upgrade=\{g\.group\}/);
    assert.match(pane, /upgradeHref && groupLockedOnPlan\(g, lockedKinds\)/);
    /* AND NO PLAN IS NAMED HERE. Which plan carries what is the server's
       answer; an engine file that names one is a second place it is decided.
       `builder-integration.test.mjs` owns that guard — this is the reminder. */
    assert.equal(/\bARION Lite\b/.test(pane), false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   7. THE FOUR STALE LISTS READ THE ORDER INSTEAD OF HOLDING IT
   ══════════════════════════════════════════════════════════════════════════ */

describe("7. no test hand-lists a panel in order any more", () => {
  const files = [
    "test/builder-widget-set.test.mjs",
    "test/builder-registry.test.mjs",
    "test/email-builder.test.mjs",
    "test/mybrand-studio.test.mjs",
  ];

  test("each of the four reads the order from the machine file or the definitions", () => {
    /* f1 §6.3 named these four and left them alone on purpose: with ten
       families landing, one pass by one agent is right and ten half-passes are
       not. This is that pass, and the point of it is that the lists are GONE,
       not retyped — a retyped list is stale again by the next family. */
    const reader = /panelOrderFaults|groupFaults|elementorPlace|panelAt|widgetsFor\(/;
    for (const f of files) {
      const src = readFileSync(path.join(process.cwd(), f), "utf8");
      assert.ok(reader.test(src), `${f} still asserts an order it typed out by hand`);
    }
  });

  test("the fixture the four read is machine-cut and says so", () => {
    assert.match(MACHINE_PANEL._about, /Machine-cut|DO NOT EDIT/);
    assert.equal(MACHINE_PANEL.source, "BUILDER_WIDGET_CATALOG_2026-09-17.elementor.json + .pro.json");
    assert.ok(Object.keys(MACHINE_PANEL.widgets).length > 60);
  });
});
