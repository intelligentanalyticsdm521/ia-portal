// scripts/dev/build-email-fixtures.mjs — write the golden fixtures.
//
//   node --import ./scripts/test-ts-loader.mjs scripts/dev/build-email-fixtures.mjs
//
// Produces test/fixtures/email-render-cases.json and landing-render-cases.json:
// one case per widget, each holding the document, the context and the EXACT
// string the renderer produced. The Portal's suite compares its renderer
// against them, and LUMEN-API's suite compares ITS OWN copy of the renderer
// against the same file, byte-identical in both repos — the SEAM-6-A rule that
// keeps the three copies of renderTemplate.js honest (seams audit §6).
//
// Regenerate ONLY when the output is meant to change, and read the diff: a
// golden file you regenerate without looking at is a test that agrees with
// whatever you just did.
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import { emptyDocument, makeSection, makeWidget, resetIds } from "../../src/builder/model.ts";
import {
  renderEmailDocument, renderEmailSection, renderEmailText, makeEmailContext,
} from "../../src/builder/adapters/email/emailRender.ts";
import { footerSection } from "../../src/builder/adapters/email/emailTemplates.ts";
import {
  renderLandingPage, renderLandingSection, makeLandingContext,
} from "../../src/builder/adapters/landing/landingRender.ts";

const BUSINESS = {
  name: "Rolling In It",
  address: "1200 Prairie Ave, Marshalltown, IA 50158",
  logoUrl: "https://cdn.example.test/logo.png",
  website: "https://rollinginit.example.test",
  social: [
    { label: "Facebook", url: "https://facebook.com/example" },
    { label: "Instagram", url: "https://instagram.com/example" },
  ],
};

/* ── D-156's three handed-in sources ──────────────────────────────────────
   A product card, an address block and a totals block all read something the
   RENDERER is given rather than something it fetches — the catalogue, the
   customer's locations, and the one sum totals.ts already computed. They are
   in the shared context so the Portal and LUMEN-API are handed exactly the
   same facts and therefore have to produce exactly the same bytes. */
const CATALOGUE = [
  {
    offering_id: "svc-plow",
    name: "Snow & ice",
    description: "Every 2 inch trigger, plowed and salted.",
    features_json: JSON.stringify(["Plowing", "Walks cleared", "Salt applied"]),
    prices: [
      { price_id: "p-basic", label: "Essentials, per push", unit_amount: 185, is_default: true },
      { price_id: "p-season", label: "Seasonal", unit_amount: 2400 },
    ],
  },
  {
    offering_id: "svc-mow",
    name: "Grounds care",
    description: "Mowing, edging and clean-up.",
    features_json: JSON.stringify(["Mowing", "Edging"]),
    prices: [{ price_id: "p-mow", label: "", unit_amount: 320, pricing_model: "recurring", recurring_interval: "month", recurring_interval_count: 1, is_default: true }],
  },
];

const LOCATIONS = {
  "loc-1": {
    location_id: "loc-1", name: "Marshalltown depot",
    address_line1: "1200 Prairie Ave", address_line2: "Unit 4",
    city: "Marshalltown", state: "IA", postal_code: "50158",
    site_contact: "Dana Reyes, 555-0142", access_notes: "Gate code at the north entrance.",
  },
};

/** One document's money, as the caller computes it once and hands it in. */
const TOTALS = {
  lines: [{ description: "Snow & ice", quantity: 1, unit_price: 2400, line_total: 2400, recommended: false, cadence: null }],
  sites: [{ locationId: "loc-1", name: "Marshalltown depot", subtotal: 2400, lines: [] }],
  subtotal: 2400, tax: 168, discount: 100, total: 2468,
};

const EMAIL_CTX = {
  catalogue: CATALOGUE,
  locations: LOCATIONS,
  totals: TOTALS,
  mode: "view",
  merge: { "first name": "Dana", "business name": "Rolling In It", "contact.first_name": "Dana" },
  accent: "#0C4A60",
  ink: "#111827",
  paper: "#FFFFFF",
  page: "#F1F5F9",
  headingFont: "Georgia",
  bodyFont: "Helvetica",
  business: BUSINESS,
  unsubscribeUrl: "https://customer.example.test/unsubscribe/TOKEN",
  preferencesUrl: "https://customer.example.test/preferences/TOKEN",
};

const LANDING_CTX = {
  catalogue: CATALOGUE,
  locations: LOCATIONS,
  totals: TOTALS,
  mode: "view",
  merge: { "first name": "Dana" },
  accent: "#0C4A60",
  formAction: "/api/v1/landing/biz-1/summer/submit",
  hidden: { p: "abc123", utm_source: "postcard" },
  business: { name: "Rolling In It", address: "1200 Prairie Ave", email: "hi@example.test", phone: "555-0100" },
};

/** One section holding one widget — the unit every golden case is. */
function widgetCase(name, kind, props, sectionExtra = {}) {
  resetIds();
  const doc = emptyDocument({ style: "newsletter", accent: "#0C4A60" });
  const w = makeWidget(kind, props);
  doc.sections = [makeSection({
    id: "s1", label: "Case", padding: 16, ...sectionExtra,
    columns: [{ id: "c1", widgets: [{ ...w, id: "w1" }] }],
    layout: 1,
  })];
  return { name, kind, doc };
}

const emailCases = [
  widgetCase("heading", "heading", { text: "What's new in {{business name}}", level: "Section", align: "Left" }),
  widgetCase("heading, page title, centred, own colour", "heading", { text: "Big news", level: "Page title", align: "Centre", colour: "#B45309" }),
  widgetCase("paragraph with two runs and a link", "paragraph", {
    text: 'We cleared 40 lots this week.\n\nRead the <a href="https://example.test/report">full report</a> or <strong>call us</strong>.',
  }),
  widgetCase("personal note", "personal_note", {
    greeting: "Hi {{first name}},", text: "A quick note before the season starts.", signoff: "— Brandon", align: "Left",
  }),
  widgetCase("bullet list", "list", { items: ["Salting included", "24-hour response", ""] }),
  widgetCase("image with alt", "image", { src: "https://cdn.example.test/lot.jpg", alt: "A cleared car park at dawn", caption: "Tuesday, 5am", width: 400, align: "Centre" }),
  widgetCase("image with no alt falls back to the caption", "image", { src: "https://cdn.example.test/lot.jpg", caption: "Tuesday, 5am" }),
  widgetCase("image with no alt and no caption falls back to the file name", "image", { src: "https://cdn.example.test/snow-plough_at-work.jpg" }),
  widgetCase("solid button", "button", { label: "Book a walk-through", url: "https://example.test/book", style: "Solid", align: "Centre" }),
  widgetCase("outline button, full width, own colour", "button", { label: "See the rates", url: "https://example.test/rates", style: "Outline", align: "Left", colour: "#FEC82C", width: "full", radius: 0 }),
  widgetCase("plain link button", "button", { label: "Skip for now", url: "https://example.test/skip", style: "Plain link" }),
  widgetCase("divider", "divider", { style: "Line" }),
  widgetCase("dotted divider", "divider", { style: "Dotted", colour: "#94A3B8" }),
  widgetCase("spacer", "spacer", { height: 40 }),
  widgetCase("three articles beside their pictures", "article_card", {
    layout: "Picture beside the words",
    items: [
      { title: "Season starts 1 November", excerpt: "Crews are booked and salt is in.", image: "https://cdn.example.test/a1.jpg", alt: "Salt store", url: "https://example.test/a1", linkLabel: "Read it" },
      { title: "New sidewalk crew", excerpt: "Two more teams for the east side.", image: "", alt: "", url: "https://example.test/a2", linkLabel: "Read it" },
      { title: "A note on trigger depths", excerpt: "Why two inches, and what happens at one.", image: "https://cdn.example.test/a3.jpg", alt: "A ruler in snow", url: "", linkLabel: "Read it" },
    ],
  }),
  widgetCase("articles stacked", "article_card", {
    layout: "Picture above the words",
    items: [{ title: "One story", excerpt: "Short.", image: "https://cdn.example.test/a1.jpg", alt: "A lorry", url: "https://example.test/a1", linkLabel: "More" }],
  }),
  widgetCase("two product cards with cadence", "product_card", {
    layout: "Cards side by side",
    items: [
      { name: "Per-push plowing", blurb: "We come every time it snows two inches.", price: "$185.00", cadence: "per push", image: "https://cdn.example.test/p1.jpg", alt: "A plough", url: "https://example.test/p1", ctaLabel: "See it" },
      { name: "Seasonal contract", blurb: "One price, the whole winter.", price: "$4,800.00", cadence: "per season", image: "", alt: "", url: "", ctaLabel: "" },
    ],
  }),
  widgetCase("one product card stacked", "product_card", {
    layout: "One under the other",
    items: [{ name: "Ice control", blurb: "Salting only.", price: "$95.00", cadence: "per application", image: "", url: "https://example.test/ice", ctaLabel: "Book it" }],
  }),
  widgetCase("social links, declared", "social_links", { links: [{ label: "Facebook", url: "https://facebook.com/x" }], align: "Centre" }),
  widgetCase("social links, from the business", "social_links", { links: [], align: "Centre" }),
  widgetCase("countdown shows the date", "countdown", { ends_at: "1 November 2026" }),
  widgetCase("review", "testimonial", { quote: "They were out before we opened.", attribution: "Hope Ministries", rating: 5 }),
  widgetCase("footer", "email_footer", {
    businessName: "Rolling In It", address: "1200 Prairie Ave, Marshalltown, IA 50158",
    note: "You are getting this because you asked us about winter services.",
    unsubscribeLabel: "Unsubscribe", preferencesLabel: "Update your preferences", showSocial: true,
  }),
  widgetCase("a widget from a newer build is inert", "hologram", { anything: true }),
  widgetCase("dark section", "heading", { text: "On a dark band", level: "Section", align: "Centre" },
    { background: "#0B1C24", theme: "dark", padding: 32 }),
  widgetCase("narrow section", "paragraph", { text: "Held in." }, { width: "narrow" }),
  widgetCase("internal section never reaches the mailbox", "paragraph", { text: "A note to the crew." },
    { visibility: "internal" }),
];

/** Two columns, which is the one thing a widget case cannot show. */
function twoColumnCase() {
  resetIds();
  const doc = emptyDocument({ style: "newsletter", accent: "#0C4A60" });
  doc.sections = [makeSection({
    id: "s1", label: "Two up", layout: 2, padding: 16,
    columns: [
      { id: "c1", widgets: [{ ...makeWidget("image", { src: "https://cdn.example.test/left.jpg", alt: "The yard" }), id: "w1" }] },
      { id: "c2", widgets: [{ ...makeWidget("paragraph", { text: "Beside the picture." }), id: "w2" }] },
    ],
  })];
  return { name: "two columns side by side", kind: "columns", doc };
}
emailCases.push(twoColumnCase());

/** A whole email, footer and all — what a send actually looks like. */
function wholeEmailCase() {
  resetIds();
  const doc = emptyDocument({ style: "newsletter", accent: "#0C4A60" });
  doc.sections = [
    makeSection({
      id: "s1", label: "Header", padding: 24,
      columns: [{ id: "c1", widgets: [{ ...makeWidget("image", { src: BUSINESS.logoUrl, alt: "Rolling In It logo", width: 160, align: "Centre" }), id: "w1" }] }],
    }),
    makeSection({
      id: "s2", label: "A note from you", padding: 16,
      columns: [{ id: "c2", widgets: [{ ...makeWidget("personal_note", { greeting: "Hi {{first name}},", text: "Winter is nearly here.", signoff: "— Brandon" }), id: "w2" }] }],
    }),
    { ...footerSection(BUSINESS), id: "s3", columns: [{ id: "c3", widgets: [{ ...makeWidget("email_footer", { businessName: BUSINESS.name, address: BUSINESS.address, note: "", unsubscribeLabel: "Unsubscribe", preferencesLabel: "Update your preferences", showSocial: true }, { locked: true }), id: "w3" }] }] },
  ];
  return { name: "a whole email", kind: "document", doc, whole: true };
}
emailCases.push(wholeEmailCase());

/** One with NO footer widget, to pin the renderer's own second guard. */
function noFooterCase() {
  resetIds();
  const doc = emptyDocument({ style: "newsletter", accent: "#0C4A60" });
  doc.sections = [makeSection({
    id: "s1", label: "Body", padding: 16,
    columns: [{ id: "c1", widgets: [{ ...makeWidget("paragraph", { text: "No footer was placed." }), id: "w1" }] }],
  })];
  return { name: "a document with no footer gets one anyway", kind: "document", doc, whole: true };
}
emailCases.push(noFooterCase());

/* ── STYLED cases (§11.8, D-140) ──────────────────────────────────────────
 *
 * The styling pass gave a section and a widget an optional `style`. These
 * cases are what prove the SERVER's copy of the renderer (LUMEN-API
 * src/lib/builderEmailRender.js) turns that style into the same bytes this
 * one does — per-side cell padding, an outer cell for a widget's margin,
 * ratio column widths, inline typography that reaches the element itself,
 * and NO box-shadow and NO border-radius no matter what the author set.
 */

/** One section, one widget, both able to carry a style. */
function styledCase(name, kind, props, widgetStyle, sectionExtra = {}) {
  resetIds();
  const doc = emptyDocument({ style: "newsletter", accent: "#0C4A60" });
  const w = { ...makeWidget(kind, props), id: "w1" };
  if (widgetStyle) w.style = widgetStyle;
  doc.sections = [makeSection({
    id: "s1", label: "Case", padding: 16, ...sectionExtra,
    columns: [{ id: "c1", widgets: [w] }],
    layout: sectionExtra.layout ?? 1,
  })];
  return { name, kind: "styled", doc };
}

emailCases.push(styledCase(
  "styled · per-side section padding, a widget's margin and its alignment",
  "paragraph", { text: "The author moved this one in." },
  { margin: { top: 0, right: 0, bottom: 20, left: 12 }, align: "center" },
  { style: { padding: { top: 30, right: 18, bottom: 30, left: 18 } } },
));

emailCases.push(styledCase(
  "styled · typography reaches the heading's own element, last",
  "heading", { text: "A bigger heading", level: "Page title", align: "Centre" },
  { typography: { size: 31, weight: 800, lineHeight: 1.2, letterSpacing: 0.5, color: "#B45309", font: "Georgia" } },
));

emailCases.push(styledCase(
  "styled · shadow and radius never reach a mailbox, and neither do device overrides",
  "paragraph", { text: "Square edges in the mailbox, and no phone override." },
  { typography: { size: 16 }, phone: { typography: { size: 34 } }, tablet: { margin: { top: 40 } } },
  {
    style: {
      padding: { top: 20, right: 20, bottom: 20, left: 20 },
      radius: 18, shadow: "strong", minHeight: 300,
      border: { width: 2, style: "dashed", color: "#B45309" },
      phone: { padding: { top: 4 } },
    },
  },
));

/** Ratios: 33/67 of the 552px content column is 184 / 368. */
function styledTwoColumnCase() {
  resetIds();
  const doc = emptyDocument({ style: "newsletter", accent: "#0C4A60" });
  doc.sections = [makeSection({
    id: "s1", label: "Two up", layout: 2, padding: 16,
    style: { columnWidths: [1 / 3, 2 / 3], gap: 28 },
    columns: [
      { id: "c1", widgets: [{ ...makeWidget("image", { src: "https://cdn.example.test/left.jpg", alt: "The yard" }), id: "w1" }] },
      { id: "c2", widgets: [{ ...makeWidget("paragraph", { text: "Two thirds of the row." }), id: "w2" }] },
    ],
  })];
  return { name: "styled · a 33 / 67 split becomes 184 and 368", kind: "styled", doc };
}
emailCases.push(styledTwoColumnCase());

/* ══════════════════════════════════════════════════════════════════════════
   D-156 — SIX TREE CASES, ONE SET, DRAWN ON BOTH SURFACES
   ══════════════════════════════════════════════════════════════════════════

   Brandon's sentence, as a fixture: "Header, drag that into this box and it's
   now its own section inside the box, then a text field under it with Pick
   One, then cards … custom cards where they just type the card headers, add a
   price, and description inside the cards, or product cards where they can
   directly load products/services from their actual OLIVER Product Catalog."

   Every case is built ONCE, from the same helper, and rendered by the email
   adapter and by the landing adapter — so the two surfaces are held to the
   same tree, and LUMEN-API's own copies of both renderers are held to the same
   bytes. A tree the two repos disagree about is a customer looking at two
   different documents.
*/

/**
 * A box. `kids` are its CHILDREN; a box is a widget, so boxes hold boxes.
 *
 * How it lays them out lives in `style`, with the padding and the background
 * and everything else §11.8 gave a section — which is what makes "a row on a
 * desktop, a column on a phone" one key in one place rather than a second
 * layout mechanism. The website adapter translates `style` into Elementor's
 * settings on the way OUT, in one module, which is where a translation belongs.
 */
function box(id, style, kids) {
  return { id, kind: "container", props: {}, style, children: kids };
}
/** A row, and a column, each with one gap in px. */
const row = (gap) => ({ direction: "row", gap });
const column = (gap) => ({ direction: "column", gap });
function widget(id, kind, props) {
  return { id, kind, props };
}

/** One section holding one tree. */
function treeCase(name, root) {
  resetIds();
  const doc = emptyDocument({ style: "newsletter", accent: "#0C4A60" });
  doc.sections = [makeSection({
    id: "s1", label: "Case", padding: 16, layout: 1,
    columns: [{ id: "c1", widgets: [root] }],
  })];
  return { name, kind: "tree", doc };
}

const TREE_CASES = [
  // 1 — three deep: a box, holding a box, holding a box.
  treeCase("tree · a box three deep, and every level draws", box("b1", column(20), [
    widget("w1", "heading", { text: "What we will do", level: "Page title" }),
    box("b2", row(24), [
      box("b3", column(8), [
        widget("w2", "heading", { text: "On site", level: "Section" }),
        widget("w3", "paragraph", { text: "Plough, salt, and clear the walks." }),
      ]),
      box("b4", column(8), [
        widget("w4", "heading", { text: "Off site", level: "Section" }),
        widget("w5", "paragraph", { text: "We watch the forecast so you do not have to." }),
      ]),
    ]),
  ])),

  // 2 — a row of cards, one of them tagged in the author's own colour.
  treeCase("tree · a row of typed cards, one carrying a tag", box("b1", row(16), [
    widget("w1", "card", {
      title: "Essentials", price: "$185.00", per: "per push",
      description: "Every 2 inch trigger.", bullets: ["Plowing", "Walks cleared"],
    }),
    widget("w2", "card", {
      title: "Seasonal", price: "$2,400.00", per: "per season", was: "$2,800.00",
      description: "One figure for the whole winter.",
      bullets: ["Plowing", "Walks cleared", "Salt applied"],
      tag: "Best price", tagColour: "#B45309", note: "Billed in four instalments.",
    }),
    widget("w3", "card", {
      title: "On call", price: "Quoted", description: "When you need us and not before.",
      bullets: ["Same-day callout"],
    }),
  ])),

  // 3 — the one total, with tax and a discount, read from the context.
  treeCase("tree · totals with tax, read from the one sum the caller computed",
    box("b1", column(12), [
      widget("w1", "price_line", { name: "Snow & ice — seasonal", quantity: 1, unit_price: 2400, cadence: "per season", description: "The whole winter, one figure." }),
      widget("w2", "totals", { heading: "What it comes to" }),
    ])),

  // 4 — an address block bound to a location: the address, the site contact
  //     and how to get in, none of them retyped.
  treeCase("tree · an address block bound to a location", box("b1", row(24), [
    widget("w1", "address_block", { locationId: "loc-1" }),
    widget("w2", "address_block", { name: "The other yard", address: "88 Second St, Ames, IA 50010", contact: "Sam Okafor" }),
  ])),

  // 5 — "Agreement at a glance": four facts, four widgets, each deletable.
  treeCase("tree · key facts as four widgets in a row", box("b1", { ...row(12), wrap: true }, [
    widget("w1", "key_fact", { label: "Starts", value: "1 November 2026" }),
    widget("w2", "key_fact", { label: "Runs for", value: "One winter" }),
    widget("w3", "key_fact", { label: "Trigger", value: "2 inches" }),
    widget("w4", "key_fact", { label: "Billed", value: "Monthly" }),
  ])),

  // 6 — "Choose your plan", as the upgrade leaves it: a heading, a line of
  //     prose, and a row of cards loaded from the product catalogue.
  treeCase("tree · a converted Choose your plan, with cards from the catalogue",
    box("b1", column(16), [
      widget("w1", "heading", { text: "Choose your plan", level: "Page title" }),
      widget("w2", "paragraph", { text: "Pick one. Whichever you choose becomes the priced line below." }),
      box("b2", row(16), [
        widget("w3", "catalog_card", { offeringId: "svc-plow", priceId: "p-basic" }),
        widget("w4", "catalog_card", {
          offeringId: "svc-plow", priceId: "p-season",
          tag: "Most popular", tagColour: "#0C4A60", priced: true,
        }),
        widget("w5", "catalog_card", {
          offeringId: "svc-mow", overrides: { description: "Kept on through the summer." },
        }),
      ]),
    ])),
];

for (const c of TREE_CASES) emailCases.push(c);

const emailFixture = {
  note: "Generated by scripts/dev/build-email-fixtures.mjs. Byte-identical in Portal and LUMEN-API.",
  context: EMAIL_CTX,
  subject: "What's new this month",
  preheader: "A short note, and what we've been up to.",
  cases: emailCases.map((c) => ({
    name: c.name,
    kind: c.kind,
    doc: c.doc,
    html: c.whole
      ? renderEmailDocument(c.doc, makeEmailContext(c.doc, EMAIL_CTX), { subject: "What's new this month", preheader: "A short note, and what we've been up to." })
      : renderEmailSection(c.doc.sections[0], makeEmailContext(c.doc, EMAIL_CTX)),
    text: renderEmailText(c.doc, makeEmailContext(c.doc, EMAIL_CTX)),
  })),
};

/* ── Landing ─────────────────────────────────────────────────────────────── */

function lpCase(name, kind, props, sectionExtra = {}) {
  resetIds();
  const doc = emptyDocument({ style: "landing", accent: "#0C4A60" });
  doc.sections = [makeSection({
    id: "s1", label: "Case", padding: 16, ...sectionExtra,
    columns: [{ id: "c1", widgets: [{ ...makeWidget(kind, props), id: "w1" }] }],
    layout: 1,
  })];
  return { name, kind, doc };
}

const landingCases = [
  lpCase("hero", "hero", { headline: "Snow cleared before you open", sub: "Commercial plowing across central Iowa.", image: "https://cdn.example.test/hero.jpg", alt: "A cleared lot", align: "Centre" }),
  lpCase("hero with no picture", "hero", { headline: "Just the words", sub: "", image: "", align: "Left" }),
  lpCase("heading", "heading", { text: "Why us", level: "Section" }),
  lpCase("paragraph", "paragraph", { text: "Two crews.\n\nOne number to call." }),
  lpCase("list", "list", { items: ["24-hour response", "Salt included", ""] }),
  lpCase("image", "image", { src: "https://cdn.example.test/yard.jpg", alt: "The yard", caption: "Our yard" }),
  lpCase("gallery", "gallery", { items: ["https://cdn.example.test/1.jpg", { src: "https://cdn.example.test/2.jpg", alt: "After" }] }),
  lpCase("video is a link, not an embed", "video", { url: "https://youtube.com/watch?v=x" }),
  lpCase("button", "button", { label: "Get a quote", url: "#form", style: "Solid", align: "Centre" }),
  lpCase("outline button", "button", { label: "See the rates", url: "https://example.test/rates", style: "Outline", colour: "#B45309" }),
  lpCase("divider", "divider", {}),
  lpCase("spacer", "spacer", { height: 32 }),
  lpCase("form with the default fields", "form", { heading: "Get in touch", submit_label: "Send", fields: [] }),
  lpCase("form without the phone", "form", { heading: "Ask us", submit_label: "Ask", fields: ["name", "email", "message"] }),
  lpCase("small print", "footer_note", { text: "Prices exclude tax." }),
  lpCase("social links", "social_links", { links: [{ label: "Facebook", url: "https://facebook.com/x" }] }),
  lpCase("review", "testimonial", { quote: "Never had to call twice.", attribution: "Hope Ministries" }),
  lpCase("a widget from a newer build is inert", "hologram", {}),
];

function lpTwoColumn() {
  resetIds();
  const doc = emptyDocument({ style: "landing", accent: "#0C4A60" });
  doc.sections = [makeSection({
    id: "s1", label: "Two up", layout: 2, padding: 16,
    columns: [
      { id: "c1", widgets: [{ ...makeWidget("image", { src: "https://cdn.example.test/l.jpg", alt: "Left" }), id: "w1" }] },
      { id: "c2", widgets: [{ ...makeWidget("paragraph", { text: "Right." }), id: "w2" }] },
    ],
  })];
  return { name: "two columns", kind: "columns", doc };
}
landingCases.push(lpTwoColumn());

function lpWholePage() {
  resetIds();
  const doc = emptyDocument({ style: "landing", accent: "#0C4A60" });
  doc.sections = [
    makeSection({ id: "s1", label: "Headline", padding: 32, columns: [{ id: "c1", widgets: [{ ...makeWidget("hero", { headline: "Snow cleared before you open", sub: "Central Iowa.", image: "", align: "Centre" }), id: "w1" }] }] }),
    makeSection({ id: "s2", label: "Contact form", padding: 16, columns: [{ id: "c2", widgets: [{ ...makeWidget("form", { heading: "Get in touch", submit_label: "Send", fields: [] }), id: "w2" }] }] }),
  ];
  return { name: "a whole page", kind: "document", doc, whole: true };
}
landingCases.push(lpWholePage());

/* ── STYLED landing cases (§11.8, D-140) ──────────────────────────────────
 *
 * The landing adapter gets the SAME per-section <style> block the document
 * renderer emits — per-side padding, ratios, gap, border, radius, shadow,
 * min-height, widget typography and margin, and the tablet / phone overrides
 * under the container queries responsive.ts owns. These two cases are what
 * hold LUMEN-API's src/lib/landingRender.js to the same bytes.
 */

function lpStyledCase(name, kind, props, widgetStyle, sectionExtra = {}) {
  resetIds();
  const doc = emptyDocument({ style: "landing", accent: "#0C4A60" });
  const w = { ...makeWidget(kind, props), id: "w1" };
  if (widgetStyle) w.style = widgetStyle;
  doc.sections = [makeSection({
    id: "s1", label: "Case", padding: 16, ...sectionExtra,
    columns: [{ id: "c1", widgets: [w] }],
    layout: sectionExtra.layout ?? 1,
  })];
  return { name, kind: "styled", doc };
}

landingCases.push(lpStyledCase(
  "styled · a widget's typography, margin and alignment, with tablet and phone overrides",
  "heading", { text: "Why us", level: "Section" },
  {
    typography: { size: 34, weight: 700, lineHeight: 1.15, letterSpacing: -0.4, color: "#0C4A60", font: "Georgia" },
    margin: { top: 0, right: 0, bottom: 24, left: 0 },
    align: "center",
    tablet: { typography: { size: 28 } },
    phone: { typography: { size: 22 }, margin: { bottom: 12 } },
  },
));

function lpStyledSection() {
  resetIds();
  const doc = emptyDocument({ style: "landing", accent: "#0C4A60" });
  doc.sections = [makeSection({
    id: "s1", label: "Two up", layout: 2, padding: 16,
    style: {
      padding: { top: 48, right: 24, bottom: 48, left: 24 },
      margin: { top: 0, right: 0, bottom: 32, left: 0 },
      columnWidths: [0.25, 0.75], gap: 32,
      border: { width: 1, style: "solid", color: "#E2E8F0" },
      radius: 14, shadow: "soft", minHeight: 240,
      tablet: { gap: 20, padding: { top: 32, bottom: 32 } },
      phone: { columnWidths: [1, 1], padding: { top: 20, right: 16, bottom: 20, left: 16 }, hidden: false },
    },
    columns: [
      { id: "c1", widgets: [{ ...makeWidget("image", { src: "https://cdn.example.test/l.jpg", alt: "Left" }), id: "w1" }] },
      {
        id: "c2",
        widgets: [{
          ...makeWidget("paragraph", { text: "Three quarters of the row." }), id: "w2",
          style: { padding: { top: 8, right: 8, bottom: 8, left: 8 }, phone: { hidden: true } },
        }],
      },
    ],
  })];
  return { name: "styled · section spacing, ratios, gap, border, radius, shadow and a phone override", kind: "styled", doc };
}
landingCases.push(lpStyledSection());

// The SAME six trees, drawn as a page. One set of documents, two surfaces:
// a tree the two adapters disagree about is a bug nobody would see until a
// customer had both open.
for (const c of TREE_CASES) landingCases.push(c);

const landingFixture = {
  note: "Generated by scripts/dev/build-email-fixtures.mjs. Byte-identical in Portal and LUMEN-API.",
  context: LANDING_CTX,
  meta: { title: "Snow & ice — Rolling In It", metaDescription: "Commercial plowing across central Iowa." },
  cases: landingCases.map((c) => ({
    name: c.name,
    kind: c.kind,
    doc: c.doc,
    html: c.whole
      ? renderLandingPage(c.doc, makeLandingContext(c.doc, LANDING_CTX), { title: "Snow & ice — Rolling In It", metaDescription: "Commercial plowing across central Iowa." })
      : renderLandingSection(c.doc.sections[0], makeLandingContext(c.doc, LANDING_CTX)),
  })),
};

const dir = path.join(process.cwd(), "test", "fixtures");
mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, "email-render-cases.json"), JSON.stringify(emailFixture, null, 2) + "\n");
writeFileSync(path.join(dir, "landing-render-cases.json"), JSON.stringify(landingFixture, null, 2) + "\n");
console.log(`wrote ${emailFixture.cases.length} email cases and ${landingFixture.cases.length} landing cases`);
