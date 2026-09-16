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

const EMAIL_CTX = {
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
