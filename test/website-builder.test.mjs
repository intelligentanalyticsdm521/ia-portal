// test/website-builder.test.mjs — the WEBSITE adapter of the one builder.
//
// BUILDER_PLATFORM_SCOPE_2026-09-15 §4 step 3 / §11.5:
//   "the website adapter supplies the Elementor emit (containers, one dialect)
//    and adoption for existing pages … the shell, the registry, the canvas, the
//    inspector and the gallery are adapter-agnostic."
//
// What this pins:
//   1. THE SEAM — the sections the pane offers are exactly the sections
//      arion-api can build, through a fixture byte-identical in both repos.
//   2. THE ROUND TRIP — ARION sections → builder document → save payload, as
//      EQUALITY, including the free section's columns.
//   3. NOTHING IS LOST — a section built on the website itself comes back byte
//      for byte and is never claimed as editable.
//   4. DUPLICATES — two sections never share an Elementor id or an `ia:` handle.
//   5. THE RENDERER — every widget the website pane offers is actually drawn,
//      and the inspector's "what has no place on the page" set is DERIVED from
//      the renderer rather than listed beside it.
//
// MUTATION CHECKS, written down so the next person can re-run them:
//   · drop one kind from SITE_SECTION_KINDS          → "the seam" red
//   · make toPayload keep __node in the fields       → "round trip" red
//   · make freshenDuplicates return payloads as-is   → "duplicates" red
//   · have sectionFor mark a custom section editable → "nothing is lost" red
//   · delete a case from SITE_RENDERERS              → "every widget is drawn" red
//   · hard-code the inspector's skip list            → "derived" red
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

import {
  WIDGETS_BY_KIND, widgetsFor, allWidgetsFor, groupForPane, widgetTooltip,
  SITE_SECTION_KINDS, arionKindOf, siteWidgetKindFor, WEBSITE_USES_A_SECTION_INSTEAD,
} from "../src/builder/registry.ts";
import {
  toDocument, toPayload, freshenDuplicates, fieldsOf, arionKindOfSection,
  sectionWidget, sectionsWithoutNodes, NODE_PROP, LOCK_PROP,
} from "../src/builder/adapters/website/siteModel.ts";
import {
  renderSiteWidget, editablePaths, SITE_RENDERED_KINDS, SITE_UNRENDERED_KINDS, SITE_CSS,
  renderHeaderChrome, renderFooterChrome,
} from "../src/builder/adapters/website/siteRender.ts";
import {
  SITE_PAGE_TEMPLATES, SITE_PREMADE, SITE_PREMADE_TAGS, withCount, repeatFieldFor, blankRow,
} from "../src/builder/adapters/website/siteTemplates.ts";
import { makeContext, RENDERED_KINDS, UNRENDERED_KINDS } from "../src/builder/render.ts";
import { addSection, duplicateSection, moveSection, removeSection, makeWidget } from "../src/builder/model.ts";

const FIXTURE = JSON.parse(
  readFileSync(path.join(process.cwd(), "test", "fixtures", "website-section-kinds.json"), "utf8"),
);
const ARION_KINDS = FIXTURE.kinds.map((k) => k.kind);

/* ══════════════════════════════════════════════════════════════════════════
   Fixtures — one page, as arion-api sends it
   ══════════════════════════════════════════════════════════════════════════ */

const heroNode = () => ({
  id: "hero001", elType: "container", isInner: false,
  settings: { _title: "ia:hero:scratch:blk1", container_type: "flex" },
  elements: [{ id: "h1", elType: "widget", widgetType: "heading", settings: { _ia_field: "hero.headline", title: "Cleared before you are awake" } }],
});

const contentNode = () => ({
  id: "cont001", elType: "container", isInner: false,
  settings: { _title: "ia:content:scratch:blk2", _ia_field_section: "content.blocks" },
  elements: [{
    id: "row1", elType: "container", isInner: true, settings: { _ia_row: 1 },
    elements: [
      { id: "c0", elType: "container", isInner: true, settings: { _ia_col: 0 }, elements: [] },
      { id: "c1", elType: "container", isInner: true, settings: { _ia_col: 1 }, elements: [] },
    ],
  }],
});

const handBuiltNode = () => Object.freeze({
  id: "hand01", elType: "section", isInner: false,
  settings: { _title: "Awards strip (built in Elementor)", structure: "20" },
  elements: [{
    id: "handcol", elType: "column", settings: { _column_size: 100 },
    elements: [{ id: "handw", elType: "widget", widgetType: "heading", settings: { title: "County Build Awards 2025" } }],
  }],
});

const PAGE = () => ([
  {
    index: 0, handle: "ia:hero:scratch:blk1", kind: "hero", editable: true, reason: null,
    label: "Hero banner", node: heroNode(),
    fields: {
      headline: "Cleared before you are awake",
      subheadline: "Contracted plowing across the metro.",
      cta_text: "Get a quote", cta_href: "#contact", image_url: "", image_id: "",
    },
  },
  {
    index: 1, handle: null, kind: null, editable: false, reason: "custom",
    label: "Custom section — built on the site", fields: null, node: handBuiltNode(),
    adoptable: true, adoptKindLabel: "Numbers that matter", adoptConfidenceLabel: "fair",
    adoptPreview: "County Build Awards 2025", fingerprint: "fp-1",
  },
  {
    index: 2, handle: "ia:content:scratch:blk2", kind: "content", editable: true, reason: null,
    label: "Words and pictures", node: contentNode(),
    fields: {
      layout: 2,
      blocks: [
        { kind: "heading", text: "How a storm runs", level: "h2", align: "left", col: 0 },
        { kind: "paragraph", text: ["We watch the forecast from Thursday."], col: 0 },
        { kind: "image", url: "https://x.invalid/a.jpg", alt: "A plow", id: 7, caption: "5am", col: 1 },
      ],
    },
  },
]);

/* ══════════════════════════════════════════════════════════════════════════
   1. The seam
   ══════════════════════════════════════════════════════════════════════════ */

describe("the seam — what the pane offers is what the website can build", () => {
  test("the fixture is byte-identical in both repos", () => {
    const here = path.join(process.cwd(), "test", "fixtures", "website-section-kinds.json");
    const there = path.resolve("..", "arion-api-septa-website", "test", "fixtures", "website-section-kinds.json");
    if (!existsSync(there)) return; // the other worktree is not always checked out beside this one
    assert.equal(readFileSync(here, "utf8"), readFileSync(there, "utf8"),
      "the shared section-kind fixture has drifted between the Portal and arion-api");
  });

  test("every ARION section kind is a widget, and no widget invents a kind", () => {
    const offered = SITE_SECTION_KINDS.map((k) => arionKindOf(k)).filter(Boolean);
    assert.deepEqual(offered.slice().sort(), ARION_KINDS.slice().sort());
  });

  test("the label and the one-liner are the SCHEMA's own words", () => {
    for (const row of FIXTURE.kinds) {
      const w = WIDGETS_BY_KIND[siteWidgetKindFor(row.kind)];
      assert.ok(w, `no widget for ${row.kind}`);
      assert.equal(w.label, row.label, `${row.kind}: the pane and the schema disagree about the name`);
      assert.equal(w.description, row.blurb, `${row.kind}: the pane and the schema disagree about what it is for`);
    }
  });

  test("the pane opens with the sections first, then the parts of a page", () => {
    const groups = groupForPane("website", "");
    assert.equal(groups[0].category, "Sections");
    assert.deepEqual(groups[0].widgets.map((w) => w.kind), [...SITE_SECTION_KINDS]);
    assert.deepEqual(groups.map((g) => g.category), ["Sections", "Text", "Layout", "Media", "Information"]);
  });

  test("every button in the pane has a tooltip", () => {
    for (const w of widgetsFor("website")) {
      const tip = widgetTooltip(w);
      assert.ok(tip.includes(w.label) && tip.length > w.label.length + 5, `${w.kind} has no usable tooltip`);
    }
  });

  test("a job a SECTION does is not also offered as a loose widget", () => {
    // One mechanism per concern. A price on a website is `site_pricing`, with
    // its own emitter and its own round trip — offering the document's pricing
    // table beside it would be two things that publish differently.
    for (const [kind, instead] of Object.entries(WEBSITE_USES_A_SECTION_INSTEAD)) {
      assert.ok(WIDGETS_BY_KIND[kind], `${kind} is named in the list and does not exist`);
      assert.equal(WIDGETS_BY_KIND[kind].adapters.includes("website"), false,
        `${kind} is still offered to the website builder; ${instead} is the one mechanism`);
    }
  });

  test('"Custom section (kept as is)" is in the vocabulary and never offered', () => {
    assert.ok(WIDGETS_BY_KIND.site_custom);
    assert.equal(WIDGETS_BY_KIND.site_custom.hidden, true);
    assert.equal(widgetsFor("website").some((w) => w.kind === "site_custom"), false);
    assert.equal(allWidgetsFor("website").some((w) => w.kind === "site_custom"), true);
  });

  test("the guided count is asked for every section that repeats, and no other", () => {
    const counted = SITE_SECTION_KINDS.filter((k) => WIDGETS_BY_KIND[k].count);
    assert.deepEqual(counted.slice().sort(), [
      "site_content", "site_faq", "site_gallery", "site_pricing", "site_services",
      "site_stats", "site_team", "site_testimonials",
    ]);
    for (const k of counted) {
      const w = WIDGETS_BY_KIND[k];
      assert.match(w.count.label, /^How many /, `${k}'s question is not asked in words`);
      assert.ok(w.count.default >= w.count.min && w.count.default <= w.count.max);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2. The round trip
   ══════════════════════════════════════════════════════════════════════════ */

describe("ARION sections → the builder → back again", () => {
  test("a page becomes one builder section per ARION section, in order", () => {
    const doc = toDocument(PAGE());
    assert.equal(doc.sections.length, 3);
    assert.deepEqual(doc.sections.map(arionKindOfSection), ["hero", null, "content"]);
  });

  test("an archetype's fields ARE the widget's props", () => {
    const doc = toDocument(PAGE());
    const w = sectionWidget(doc.sections[0]);
    assert.equal(w.kind, "site_hero");
    assert.equal(w.props.headline, "Cleared before you are awake");
    assert.equal(w.props[NODE_PROP].id, "hero001");
  });

  test("the save payload is EQUAL to what came in — an untouched page changes nothing", () => {
    const incoming = PAGE();
    const payload = toPayload(toDocument(incoming));
    assert.equal(payload.length, incoming.length);
    for (let i = 0; i < incoming.length; i++) {
      assert.deepEqual(payload[i].fields, incoming[i].fields, `section ${i}: fields drifted`);
      assert.deepEqual(payload[i].node, incoming[i].node, `section ${i}: the node drifted`);
    }
  });

  test("the section's own look publishes — the toolbar is not a control that lies", () => {
    // BACKGROUND, PADDING and the HEADING FONT are changed on the canvas and
    // have to reach the website. They ride as one `style` field that arion-api
    // writes onto the section's own Elementor container (applySectionStyle).
    const doc = toDocument(PAGE());
    const painted = { ...doc, sections: doc.sections.map((s, i) => (i === 0
      ? { ...s, background: "#FFF3E9", padding: 96, headingFont: "Lora" } : s)) };
    const payload = toPayload(painted);
    assert.deepEqual(payload[0].fields.style, { background: "#FFF3E9", padding: 96, headingFont: "Lora" });
    // And a section nobody touched sends no style at all, so a save that
    // changed nothing writes nothing.
    assert.equal(payload[2].fields.style, undefined);
  });

  test("no prop of ours ever reaches the website", () => {
    const payload = toPayload(toDocument(PAGE()));
    for (const p of payload) {
      for (const key of Object.keys(p.fields || {})) {
        assert.equal(key.startsWith("__"), false, `${key} would have been published`);
      }
    }
  });

  test("a free section's COLUMNS survive — a block in column 2 goes back to column 2", () => {
    const doc = toDocument(PAGE());
    const free = doc.sections[2];
    assert.equal(free.layout, 2);
    assert.deepEqual(free.columns.map((c) => c.widgets.map((w) => w.kind)),
      [["heading", "paragraph"], ["image"]]);
    const fields = fieldsOf(free);
    assert.equal(fields.layout, 2);
    assert.deepEqual(fields.blocks.map((b) => [b.kind, b.col]),
      [["heading", 0], ["paragraph", 0], ["image", 1]]);
  });

  test("reordering, duplicating and deleting all still produce a saveable page", () => {
    let doc = toDocument(PAGE());
    doc = moveSection(doc, doc.sections[2].id, 0);
    doc = duplicateSection(doc, doc.sections[0].id);
    doc = removeSection(doc, doc.sections[3].id);
    const payload = toPayload(doc);
    assert.equal(payload.length, doc.sections.length);
    assert.deepEqual(sectionsWithoutNodes(doc), []);
  });

  test("a section with no node yet is never published half-built", () => {
    let doc = toDocument(PAGE());
    doc = addSection(doc, { ...doc.sections[0], id: "ghost", columns: [{ id: "g", widgets: [makeWidget("site_cta", {})] }] });
    assert.equal(sectionsWithoutNodes(doc).length, 1);
    assert.equal(toPayload(doc).length, 3, "the half-built section is dropped, not sent");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   3. Nothing is lost silently
   ══════════════════════════════════════════════════════════════════════════ */

describe("a section built on the website itself", () => {
  test("comes in LOCKED, in position, and says what it is", () => {
    const doc = toDocument(PAGE());
    const w = sectionWidget(doc.sections[1]);
    assert.equal(w.kind, "site_custom");
    assert.equal(w.props[LOCK_PROP].label, "Custom section — built on the site");
    assert.equal(w.props[LOCK_PROP].adoptable, true);
    assert.equal(arionKindOfSection(doc.sections[1]), null);
  });

  test("goes back BYTE FOR BYTE, and with no fields to patch it with", () => {
    const original = PAGE()[1].node;
    const payload = toPayload(toDocument(PAGE()));
    assert.equal(payload[1].fields, null, "a custom section is carried, never patched");
    assert.equal(JSON.stringify(payload[1].node), JSON.stringify(original));
  });

  test("is drawn as a locked block with the first words on it, never blank", () => {
    const doc = toDocument(PAGE());
    const ctx = makeContext(doc, { mode: "edit", accent: "#1E4E57" });
    const html = renderSiteWidget(sectionWidget(doc.sections[1]), ctx);
    assert.match(html, /sw-locked/);
    assert.match(html, /Custom section/);
    assert.match(html, /County Build Awards 2025/);
    assert.match(html, /Can be made editable/);
    // And nothing on it is typeable.
    assert.doesNotMatch(html, /data-edit=/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   4. Duplicates
   ══════════════════════════════════════════════════════════════════════════ */

describe("duplicating a section", () => {
  test("the copy gets fresh Elementor ids — two nodes with one id is a broken page", () => {
    let doc = toDocument(PAGE());
    doc = duplicateSection(doc, doc.sections[0].id);
    const payload = toPayload(doc);
    const ids = [];
    for (const p of payload) {
      (function walk(n) {
        if (!n || typeof n !== "object") return;
        if (typeof n.id === "string") ids.push(n.id);
        (n.elements || []).forEach(walk);
      })(p.node);
    }
    assert.equal(new Set(ids).size, ids.length, "two sections share an element id");
  });

  test("and a fresh ia: handle — two sections with one handle is an ambiguous page", () => {
    let doc = toDocument(PAGE());
    doc = duplicateSection(doc, doc.sections[0].id);
    const handles = toPayload(doc).map((p) => p.node?.settings?._title).filter((t) => String(t).startsWith("ia:"));
    assert.equal(new Set(handles).size, handles.length);
    // The KIND is untouched — only the block id at the end is re-minted.
    for (const h of handles) assert.match(h, /^ia:(hero|content):/);
  });

  test("a page that was NOT duplicated is left exactly alone", () => {
    const payload = toPayload(toDocument(PAGE()));
    const again = freshenDuplicates(payload);
    assert.equal(JSON.stringify(again), JSON.stringify(payload));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   5. The renderer
   ══════════════════════════════════════════════════════════════════════════ */

describe("the canvas draws the page, not a form", () => {
  test("every widget the website pane offers is actually drawn", () => {
    const drawn = new Set([
      ...RENDERED_KINDS, ...SITE_RENDERED_KINDS, ...UNRENDERED_KINDS, ...SITE_UNRENDERED_KINDS,
    ]);
    for (const w of allWidgetsFor("website")) {
      assert.ok(drawn.has(w.kind), `${w.kind} is offered and nothing draws it`);
    }
  });

  test("every section kind renders something a person would recognise", () => {
    const doc = toDocument(PAGE());
    const ctx = makeContext(doc, { mode: "edit", accent: "#1E4E57", business: { name: "Northfield" } });
    for (const kind of SITE_SECTION_KINDS) {
      if (SITE_UNRENDERED_KINDS.includes(kind)) continue;
      const html = renderSiteWidget(makeWidget(kind, sampleProps(kind)), ctx);
      assert.ok(html && html.length > 40, `${kind} drew nothing`);
      assert.doesNotMatch(html, /undefined|\[object Object\]/, `${kind} leaked a value`);
    }
  });

  test("the words are typed ON THE PAGE — every section marks its runs", () => {
    const doc = toDocument(PAGE());
    const ctx = makeContext(doc, { mode: "edit", accent: "#1E4E57" });
    for (const kind of SITE_SECTION_KINDS) {
      if (kind === "site_content" || kind === "site_custom") continue;
      const html = renderSiteWidget(makeWidget(kind, sampleProps(kind)), ctx);
      assert.match(html, /data-edit="/, `${kind} has nothing a client can type into`);
    }
  });

  test("the inspector's skip set is DERIVED from the renderer, never listed beside it", () => {
    const doc = toDocument(PAGE());
    const ctx = makeContext(doc, { mode: "edit", accent: "#1E4E57" });
    const paths = editablePaths(makeWidget("site_services", sampleProps("site_services")), ctx);
    // The headline IS on the page, so the inspector must not offer a box for it.
    assert.ok(paths.has("headline"));
    // And a list item's own title, as a pattern, so the sub-field is skipped
    // without knowing how many items there are.
    assert.ok(paths.has("services.*.title"));
    assert.ok(paths.has("services.0.title"));
    // The picture on a hero has NO run on the page, so it stays in the panel.
    const heroPaths = editablePaths(makeWidget("site_hero", sampleProps("site_hero")), ctx);
    assert.equal(heroPaths.has("image_url"), false);
    assert.equal(heroPaths.has("cta_href"), false);
  });

  test("the stylesheet travels with the renderers", () => {
    assert.match(SITE_CSS, /\.sw-band/);
    // Was `@media (max-width: 720px)` until the phone pass (2026-09-16). A
    // media query asks the VIEWPORT, so it was never true in the canvas — the
    // phone preview folds nothing while the phone folds everything, which is
    // the one thing a shared renderer exists to prevent. Same number, asked of
    // the container instead. See src/builder/responsive.ts.
    assert.match(SITE_CSS, /@container \(max-width: 720px\)/, "a website preview has to fold on a phone");
  });

  test("the site's header and footer are drawn as chrome, and nothing on them is editable", () => {
    const head = renderHeaderChrome({ businessName: "Northfield", menu: [{ label: "Services" }] });
    const foot = renderFooterChrome({ businessName: "Northfield", menu: [], contactLine: "office@x.invalid" });
    assert.match(head, /Northfield/);
    assert.match(head, /Services/);
    assert.match(foot, /Northfield/);
    for (const html of [head, foot]) assert.doesNotMatch(html, /data-edit=|data-widget=/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   6. The template principle
   ══════════════════════════════════════════════════════════════════════════ */

describe("never a blank page", () => {
  test("every template is a list of REAL ARION kinds — no template carries words", () => {
    assert.ok(SITE_PAGE_TEMPLATES.length >= 5);
    for (const t of SITE_PAGE_TEMPLATES) {
      assert.ok(t.kinds.length > 0, `${t.key} is empty`);
      for (const k of t.kinds) {
        assert.ok(ARION_KINDS.includes(k), `${t.key} names "${k}", which the website cannot build`);
      }
      assert.ok(t.description.length > 12, `${t.key} has no line a business owner can read`);
    }
  });

  test("the five pages a small business has are all offered", () => {
    const keys = SITE_PAGE_TEMPLATES.map((t) => t.key);
    for (const k of ["home", "services", "about", "contact", "landing"]) {
      assert.ok(keys.includes(k), `no ${k} template`);
    }
  });

  test("the gallery's pre-made sections are the same twelve, with a picture and a line", () => {
    assert.deepEqual(SITE_PREMADE.map((p) => p.kind).slice().sort(), ARION_KINDS.slice().sort());
    for (const p of SITE_PREMADE) {
      assert.ok(p.name && p.description, `${p.key} is half-defined`);
      for (const tag of p.tags) assert.ok(SITE_PREMADE_TAGS.includes(tag), `${p.key} has an unfilterable tag`);
    }
  });

  test('"how many?" is applied ONCE, and adjusting it keeps what is already typed', () => {
    const fields = { headline: "What we do", services: [{ title: "Plowing", description: "Snow", icon_name: "truck" }] };
    const three = withCount(fields, "services", 3);
    assert.equal(three.services.length, 3);
    assert.equal(three.services[0].title, "Plowing", "the item already typed survives");
    assert.deepEqual(three.services[1], blankRow("services"));
    const back = withCount(three, "services", 1);
    assert.equal(back.services.length, 1);
    assert.equal(back.services[0].title, "Plowing");
  });

  test("every counted section names the list it repeats", () => {
    for (const kind of ARION_KINDS) {
      const w = WIDGETS_BY_KIND[siteWidgetKindFor(kind)];
      if (!w.count || kind === "content") continue;
      assert.ok(repeatFieldFor(kind), `${kind} asks "how many?" and nothing knows what it counts`);
    }
  });
});

/* ── sample props, one per section kind ──────────────────────────────────── */

function sampleProps(widgetKind) {
  const kind = arionKindOf(widgetKind);
  const base = { headline: "A heading", subheadline: "A line under it" };
  switch (kind) {
    case "hero": return { ...base, cta_text: "Get a quote", cta_href: "#contact", image_url: "" };
    case "services": return { ...base, services: [{ title: "Plowing", description: "Snow", icon_name: "truck" }, { title: "Salting", description: "Ice", icon_name: "snowflake" }] };
    case "testimonials": return { ...base, testimonials: [{ quote: "Great", attribution: "Dana", role: "Facilities", rating: 5 }] };
    case "cta": return { ...base, primary_cta_text: "Ask us", secondary_cta_text: "Call" };
    case "about": return { ...base, story_paragraphs: ["We started with one truck."], values: [{ title: "On time", description: "Always" }], image_url: "", image_alt: "" };
    case "faq": return { ...base, faqs: [{ question: "What is a trigger?", answer: "Two inches." }] };
    case "gallery": return { ...base, images: [{ url: "https://x.invalid/a.jpg", alt: "A lot", caption: "Brookline" }] };
    case "pricing": return { ...base, plans: [{ name: "Per push", price: "$185", period: "per push", summary: "Each visit", features: ["Two-inch trigger"], cta_text: "Ask" }] };
    case "team": return { ...base, members: [{ name: "Ray", role: "Owner", photo_url: "" }] };
    case "stats": return { ...base, stats: [{ value: "14", prefix: "", suffix: "+", label: "Winters" }] };
    case "contact": return { ...base, contact_methods: [{ kind: "phone", label: "Office", value: "555-0142" }], form_fields: ["Name", "Email"], submit_text: "Send", email_to: "office@x.invalid" };
    case "content": return { layout: 1, blocks: [] };
    default: return { [LOCK_PROP]: { label: "Custom section (kept as is)", preview: "Some words", adoptable: false } };
  }
}
