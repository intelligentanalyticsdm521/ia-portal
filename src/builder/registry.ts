/**
 * builder/registry.ts — ONE widget registry for every builder.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §3.2, step 0. DEFINITIONS ONLY: no
 * renderers yet. What this file settles is the vocabulary — one name, one
 * picture and one plain sentence per widget — so the four builders stop
 * inventing their own.
 *
 * ── WHAT IT REPLACES ──────────────────────────────────────────────────────
 * The inventory found FIVE form-field vocabularies, THREE spellings of "a
 * heading" (four counting the proposal), and exactly one registry anywhere on
 * the platform that bothered to say what a thing is FOR: SparkFormBuilderPage's
 * FIELD_TYPE_META (label + icon + one-line description). That shape is the
 * pattern here, widened with the two things SD-010 asks for and it lacks — a
 * picture, and which builders may use the widget.
 *
 * ── SD-010, IN FIELDS ─────────────────────────────────────────────────────
 *   "A side pane of widgets/blocks with a picture and one line of what each is
 *    for … tooltips on every button … guided counts ('how many cards?', 2–6)."
 *
 *   picture      a tiny inline SVG, drawn as the SHAPE the widget makes on the
 *                page. Not an icon of a concept: a comparison-card widget shows
 *                three cards, because a business owner recognises the layout
 *                long before they recognise the word.
 *   description  ONE line, in a business owner's words. The acceptance row for
 *                every builder walk is "could a client build this without
 *                reading anything?", and this sentence is where that is won or
 *                lost. No jargon: not "a flex container with N children" but
 *                "Two to six plans side by side, with one marked Recommended".
 *   count        the guided question, where a widget has one. `{ min, max,
 *                label }` is what the pane asks BEFORE inserting.
 *   adapters     which builders may offer it. A countdown is an email trick and
 *                a gallery is a website one; offering either in a proposal
 *                would be offering something the output cannot render.
 *
 * ── PURE ON PURPOSE ───────────────────────────────────────────────────────
 * No React, no lucide import: `icon` is the lucide NAME and WidgetPane maps it.
 * That keeps this module importable by `node --test` (scripts/test-ts-loader
 * only takes pure modules), which is how test/builder-registry.test.mjs can
 * check that every widget really has a label, a description, a picture and an
 * adapter.
 */

/** The output adapters of §3.4. A widget declares which ones can render it. */
export type BuilderAdapter =
  /** Customer documents: proposals, agreements, quotes. The document renderer + PDF. */
  | "proposal"
  /** The ARION website builder, through elementorAdapter.js to Elementor. */
  | "website"
  /** SPARK campaigns, templates and newsletters. Table-based email HTML. */
  | "email"
  /** SPARK hosted landing pages. */
  | "landing"
  /** My Brand's Template Studio — a pixel canvas, so only widgets that make
   *  sense as a placed object. */
  | "brand";

export const BUILDER_ADAPTERS: BuilderAdapter[] = ["proposal", "website", "email", "landing", "brand"];

/** Pane groupings. Ordered as the pane shows them. */
export type WidgetCategory =
  /** A whole band of a web page — a hero, your services, your prices. */
  | "Sections"
  /** The parts only a document has: its header, its clauses, its signature. */
  | "Document"
  | "Text"
  | "Media"
  | "Layout"
  | "Money"
  | "Information"
  | "Capture"
  | "Trust";

export const WIDGET_CATEGORIES: WidgetCategory[] = [
  "Sections", "Document", "Text", "Money", "Layout", "Media", "Information", "Capture", "Trust",
];

/** One editable property of a widget. Renderers come later; this is the shape. */
export interface WidgetControl {
  key: string;
  label: string;
  type: "text" | "textarea" | "richtext" | "number" | "money" | "colour" | "select" | "toggle" | "image" | "link" | "list" | "merge";
  /** One line under the field, when the label alone is not enough. */
  help?: string;
  options?: string[];
}

/** The guided question SD-010 asks before inserting a widget that repeats. */
export interface WidgetCount {
  min: number;
  max: number;
  /** Asked once, in words: "How many cards?" */
  label: string;
  default: number;
}

export interface WidgetDef {
  kind: string;
  label: string;
  /** ONE line, in a business owner's words. See the header. */
  description: string;
  /** lucide-react icon NAME. WidgetPane maps it; this module stays pure. */
  icon: string;
  /** A small inline SVG data URI showing the SHAPE this widget makes. */
  picture: string;
  category: WidgetCategory;
  /** Which builders may offer it. Never empty. */
  adapters: BuilderAdapter[];
  /** The starting content when it is dropped on the canvas. */
  defaults: Record<string, unknown>;
  controls: WidgetControl[];
  /** Present when the pane must ask "how many?" first. */
  count?: WidgetCount;
  /**
   * In the vocabulary, but never offered in the pane or the gallery.
   *
   * One case today: the website adapter's "Custom section (kept as is)", which
   * is what a section somebody built on the site itself becomes on the canvas.
   * It has to be a first-class widget so the canvas can draw it and the save
   * can carry it back byte for byte — and it must never be something a client
   * can ADD, because there is nothing to add.
   */
  hidden?: boolean;
}

/* ══════════════════════════════════════════════════════════════════════════
   Pictures
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Build a picture from a compact SVG body.
 *
 * Inline data URIs rather than files so the pane has no network dependency and
 * a widget cannot ship without its picture. `currentColor` is deliberately NOT
 * used: the picture is a diagram of a layout, drawn in slate on transparent, so
 * it reads the same on every pane background and never competes with the
 * business's own brand colours sitting next to it in the same panel.
 */
export function pictureFrom(body: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 40" fill="none" ` +
    `stroke="#64748B" stroke-width="2" stroke-linecap="round">${body}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const bar = (x: number, y: number, w: number, h = 4) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="#CBD5E1" stroke="none"/>`;
const box = (x: number, y: number, w: number, h: number) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="none"/>`;
const solid = (x: number, y: number, w: number, h: number) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="#94A3B8" stroke="none"/>`;

/* ══════════════════════════════════════════════════════════════════════════
   THE registry — §3.2's union, as definitions
   ══════════════════════════════════════════════════════════════════════════ */

const ALL: BuilderAdapter[] = ["proposal", "website", "email", "landing", "brand"];
const DOCUMENTS: BuilderAdapter[] = ["proposal"];
const PAGES: BuilderAdapter[] = ["website", "landing"];
const SENDS: BuilderAdapter[] = ["email"];

/**
 * ONE MECHANISM PER CONCERN, ON A WEBSITE.
 *
 * Step 0's registry gave several document widgets `"website"` because a web
 * page obviously has prices and reviews on it. It does — but on an ARION site
 * those are whole SECTIONS with their own Elementor emitters, their own
 * bindings and their own round trip (`site_pricing`, `site_testimonials`,
 * `site_gallery`, `site_contact`, `site_stats`). Offering BOTH would be two
 * mechanisms for one job and two things that publish differently, which is the
 * exact failure this rebuild exists to end.
 *
 * So the website pane offers the SECTION for those jobs, and the plain
 * content parts (heading, paragraph, list, picture, button, video, map,
 * divider, blank space) for everything else. `DOCUMENT_ONLY` below names the
 * widgets that lost "website" and why, and a test reads this list.
 */
export const WEBSITE_USES_A_SECTION_INSTEAD: Record<string, string> = {
  comparison_cards: "site_pricing",
  pricing_table: "site_pricing",
  testimonial: "site_testimonials",
  gallery: "site_gallery",
  form: "site_contact",
  logo_strip: "site_gallery",
  social_links: "site_contact",
  key_value_table: "site_stats",
  data_table: "content",
  callout: "content",
};

export const WIDGETS: WidgetDef[] = [
  /* ── Text ──────────────────────────────────────────────────────────── */
  {
    kind: "heading",
    label: "Heading",
    description: "A title for the section, optionally numbered like “1. Scope of work”.",
    icon: "Heading",
    picture: pictureFrom(bar(10, 14, 44, 6) + bar(10, 24, 28)),
    category: "Text",
    adapters: ALL,
    defaults: { text: "", level: 2, numbered: false },
    controls: [
      { key: "text", label: "Heading", type: "text" },
      { key: "level", label: "Size", type: "select", options: ["Page title", "Section", "Sub-section"] },
      { key: "numbered", label: "Number this section", type: "toggle", help: "Adds 1., 2., 3. automatically down the page." },
    ],
  },
  {
    kind: "paragraph",
    label: "Paragraph",
    description: "Ordinary writing — a sentence or a few, with bold and links.",
    icon: "AlignLeft",
    picture: pictureFrom(bar(8, 10, 48) + bar(8, 18, 48) + bar(8, 26, 30)),
    category: "Text",
    adapters: ALL,
    defaults: { text: "" },
    controls: [{ key: "text", label: "Text", type: "richtext" }],
  },
  {
    kind: "list",
    label: "Bullet list",
    description: "A list of short points, one per line.",
    icon: "List",
    picture: pictureFrom(
      `<circle cx="11" cy="12" r="2" fill="#94A3B8" stroke="none"/>` + bar(18, 10, 38) +
      `<circle cx="11" cy="22" r="2" fill="#94A3B8" stroke="none"/>` + bar(18, 20, 30) +
      `<circle cx="11" cy="32" r="2" fill="#94A3B8" stroke="none"/>` + bar(18, 30, 34)),
    category: "Text",
    adapters: ALL,
    defaults: { items: ["", "", ""] },
    controls: [{ key: "items", label: "Points", type: "list" }],
  },
  {
    kind: "footer_note",
    label: "Small print",
    description: "A note at the bottom in small type — terms, a disclaimer, a validity date.",
    icon: "FileText",
    picture: pictureFrom(box(6, 6, 52, 28) + bar(10, 26, 30, 3)),
    category: "Text",
    adapters: ["proposal", "email", "landing"],
    defaults: { text: "" },
    controls: [{ key: "text", label: "Note", type: "textarea", help: "Shown in small grey type. Nothing is added unless you write it." }],
  },
  {
    kind: "merge_field",
    label: "Personal detail",
    description: "Drops in the customer’s name, address or any field you store, filled in per recipient.",
    icon: "Braces",
    picture: pictureFrom(bar(8, 12, 18) + `<rect x="30" y="10" width="26" height="8" rx="4" fill="#E2E8F0" stroke="#94A3B8"/>` + bar(8, 26, 40)),
    category: "Text",
    adapters: ["proposal", "email", "landing"],
    defaults: { token: "" },
    controls: [{ key: "token", label: "Which detail", type: "merge", help: "Picked from a list — customer, property, contract or your own fields." }],
  },

  /* ── Media ─────────────────────────────────────────────────────────── */
  {
    kind: "image",
    label: "Picture",
    description: "One photo or graphic, with an optional caption.",
    icon: "Image",
    picture: pictureFrom(box(8, 8, 48, 24) + `<circle cx="20" cy="17" r="3" fill="#CBD5E1" stroke="none"/><path d="M12 30l12-10 10 8 8-6 10 8" stroke="#94A3B8"/>`),
    category: "Media",
    adapters: ALL,
    defaults: { src: "", alt: "", caption: "" },
    controls: [
      { key: "src", label: "Image", type: "image" },
      { key: "alt", label: "Describe it", type: "text", help: "Read aloud by screen readers and shown if the picture fails to load." },
      { key: "caption", label: "Caption", type: "text" },
    ],
  },
  {
    kind: "gallery",
    label: "Photo gallery",
    description: "Several photos in a grid — a portfolio, before-and-afters, a product range.",
    icon: "Images",
    picture: pictureFrom(solid(8, 8, 14, 12) + solid(25, 8, 14, 12) + solid(42, 8, 14, 12) + solid(8, 23, 14, 10) + solid(25, 23, 14, 10) + solid(42, 23, 14, 10)),
    category: "Media",
    adapters: ["landing", "brand"],
    defaults: { items: [] },
    controls: [{ key: "items", label: "Photos", type: "list" }],
    count: { min: 2, max: 12, label: "How many photos?", default: 6 },
  },
  {
    kind: "video",
    label: "Video",
    description: "A video from YouTube or Vimeo, playing on the page.",
    icon: "Play",
    picture: pictureFrom(box(8, 8, 48, 24) + `<path d="M28 15l10 5-10 5z" fill="#94A3B8" stroke="none"/>`),
    category: "Media",
    adapters: ["website", "landing"],
    defaults: { url: "" },
    controls: [{ key: "url", label: "Video link", type: "link", help: "Paste the address from YouTube or Vimeo." }],
  },
  {
    kind: "logo_strip",
    label: "Logo row",
    description: "A row of logos — brands you carry, or clients you have worked with.",
    icon: "Building2",
    picture: pictureFrom(solid(6, 16, 12, 8) + solid(22, 16, 12, 8) + solid(38, 16, 12, 8) + solid(54, 16, 4, 8)),
    category: "Media",
    adapters: ["landing", "email"],
    defaults: { items: [] },
    controls: [{ key: "items", label: "Logos", type: "list" }],
    count: { min: 2, max: 10, label: "How many logos?", default: 5 },
  },

  /* ── Layout ────────────────────────────────────────────────────────── */
  {
    kind: "divider",
    label: "Divider",
    description: "A line across the section, to separate one idea from the next.",
    icon: "Minus",
    picture: pictureFrom(bar(8, 19, 48, 2)),
    category: "Layout",
    adapters: ALL,
    defaults: { style: "line" },
    controls: [{ key: "style", label: "Style", type: "select", options: ["Line", "Dotted", "Space only"] }],
  },
  {
    kind: "spacer",
    label: "Blank space",
    description: "Empty space, when two things are sitting too close together.",
    icon: "MoveVertical",
    picture: pictureFrom(bar(8, 8, 48) + `<path d="M32 16v10" stroke="#CBD5E1"/>` + bar(8, 30, 48)),
    category: "Layout",
    adapters: ALL,
    defaults: { height: 24 },
    controls: [{ key: "height", label: "How much space", type: "number" }],
  },
  {
    kind: "button",
    label: "Button",
    description: "The thing you want them to click — Accept, Book a call, Get a quote.",
    icon: "MousePointerClick",
    picture: pictureFrom(`<rect x="16" y="14" width="32" height="13" rx="6" fill="#94A3B8" stroke="none"/>` + bar(23, 19, 18, 3)),
    category: "Layout",
    adapters: ALL,
    defaults: { label: "", url: "", style: "solid" },
    controls: [
      { key: "label", label: "Button text", type: "text" },
      { key: "url", label: "Where it goes", type: "link" },
      { key: "style", label: "Style", type: "select", options: ["Solid", "Outline", "Plain link"] },
      { key: "colour", label: "Colour", type: "colour", help: "Starts as your brand accent. Any colour you like." },
    ],
  },
  {
    kind: "callout",
    label: "Callout panel",
    description: "A tinted box for something that must not be skimmed past.",
    icon: "AlertCircle",
    picture: pictureFrom(`<rect x="8" y="10" width="48" height="20" rx="3" fill="#F1F5F9" stroke="#94A3B8"/>` + `<path d="M13 10v20" stroke="#64748B" stroke-width="3"/>` + bar(19, 15, 30) + bar(19, 22, 20)),
    category: "Layout",
    adapters: ["proposal", "email", "landing", "brand"],
    defaults: { heading: "", panels: [{ title: "", body: "", tone: "accent" }] },
    controls: [
      { key: "heading", label: "Heading", type: "text" },
      { key: "panels", label: "Panels", type: "list", help: "One tinted box each. Two side by side is the “what is included / what is not” pattern." },
    ],
    count: { min: 1, max: 3, label: "How many panels?", default: 2 },
  },

  /* ── Money ─────────────────────────────────────────────────────────── */
  {
    kind: "priced_line",
    label: "Priced item",
    description: "One thing you are charging for, with a quantity and a price. Adds to the total.",
    icon: "Tag",
    picture: pictureFrom(bar(8, 12, 30) + bar(44, 12, 12) + bar(8, 24, 24) + bar(44, 24, 12)),
    category: "Money",
    adapters: DOCUMENTS,
    defaults: { name: "", description: "", features: [], quantity: 1, unit_price: 0, cadence: null, recommended: false },
    controls: [
      { key: "name", label: "What it is", type: "text" },
      { key: "description", label: "Why it is worth having", type: "textarea" },
      { key: "features", label: "What is included", type: "list" },
      { key: "quantity", label: "How many", type: "number" },
      { key: "unit_price", label: "Price each", type: "money" },
      { key: "recommended", label: "Mark Recommended", type: "toggle" },
    ],
  },
  {
    kind: "comparison_cards",
    label: "Options to choose from",
    description: "Two to six plans side by side, with one marked Recommended.",
    icon: "LayoutGrid",
    picture: pictureFrom(box(6, 8, 16, 26) + `<rect x="24" y="5" width="16" height="29" rx="3" fill="#F1F5F9" stroke="#64748B"/>` + box(42, 8, 16, 26) + bar(27, 11, 10, 3)),
    category: "Money",
    adapters: ["proposal", "landing", "email"],
    defaults: { heading: "", intro: "", cards: [] },
    controls: [
      { key: "heading", label: "Heading above the cards", type: "text" },
      { key: "intro", label: "One line of context", type: "textarea" },
      { key: "cards", label: "The options", type: "list" },
    ],
    count: { min: 2, max: 6, label: "How many cards?", default: 3 },
  },
  {
    kind: "pricing_table",
    label: "Pricing table",
    description: "Your services, their prices and the basis each one bills on.",
    icon: "Table",
    picture: pictureFrom(box(6, 8, 52, 26) + `<path d="M6 16h52M23 8v26M41 8v26" stroke="#CBD5E1"/>`),
    category: "Money",
    adapters: ["proposal", "landing", "email"],
    // A rate card, not a bill: "$185 per push" does not add up to anything
    // until it snows, so this NEVER feeds the total (totals.ts rule 1).
    defaults: { heading: "", intro: "", rows: [], columns: { service: true, basis: true, rate: true } },
    controls: [
      { key: "heading", label: "Heading", type: "text" },
      { key: "intro", label: "One line above the table", type: "textarea" },
      { key: "rows", label: "Rows", type: "list", help: "Pull them from Products & Services, or type your own." },
    ],
  },
  {
    kind: "totals",
    label: "Totals at a glance",
    description: "Grouped subtotals and a grand total, for when the list of prices is long.",
    icon: "Calculator",
    picture: pictureFrom(bar(8, 10, 26) + bar(44, 10, 12) + bar(8, 18, 20) + bar(44, 18, 12) + `<path d="M8 26h48" stroke="#94A3B8"/>` + bar(8, 30, 16) + bar(42, 30, 14, 5)),
    category: "Money",
    adapters: DOCUMENTS,
    defaults: { heading: "Your total" },
    controls: [{ key: "heading", label: "Heading", type: "text" }],
  },

  /* ── Information ───────────────────────────────────────────────────── */
  {
    kind: "key_value_table",
    label: "Details list",
    description: "Label-and-value pairs — dates, contacts, reference numbers.",
    icon: "Rows3",
    picture: pictureFrom(bar(8, 10, 18) + bar(32, 10, 24) + bar(8, 20, 18) + bar(32, 20, 20) + bar(8, 30, 18) + bar(32, 30, 22)),
    category: "Information",
    adapters: ["proposal", "email", "landing", "brand"],
    defaults: { rows: [] },
    controls: [{ key: "rows", label: "Rows", type: "list" }],
  },
  {
    kind: "data_table",
    label: "Table",
    description: "A plain table with a header row. Nothing is added up — it is a table, not a bill.",
    icon: "Table2",
    picture: pictureFrom(`<rect x="6" y="8" width="52" height="8" rx="2" fill="#CBD5E1" stroke="none"/>` + box(6, 8, 52, 26) + `<path d="M6 24h52M24 16v18M41 16v18" stroke="#CBD5E1"/>`),
    category: "Information",
    adapters: ["proposal", "email", "landing", "brand"],
    defaults: { columns: [], rows: [] },
    controls: [
      { key: "columns", label: "Columns", type: "list" },
      { key: "rows", label: "Rows", type: "list" },
    ],
    count: { min: 2, max: 8, label: "How many columns?", default: 3 },
  },
  {
    kind: "map",
    label: "Map",
    description: "A map showing where you are, or the area you cover.",
    icon: "MapPin",
    picture: pictureFrom(box(8, 8, 48, 24) + `<path d="M32 14a5 5 0 0 1 5 5c0 4-5 8-5 8s-5-4-5-8a5 5 0 0 1 5-5z" fill="#94A3B8" stroke="none"/>`),
    category: "Information",
    adapters: ["website", "landing"],
    defaults: { address: "" },
    controls: [{ key: "address", label: "Address or area", type: "text" }],
  },
  {
    kind: "countdown",
    label: "Countdown",
    description: "A timer counting down to a deadline — an offer ending, an event starting.",
    icon: "Timer",
    picture: pictureFrom(box(8, 12, 12, 16) + box(26, 12, 12, 16) + box(44, 12, 12, 16) + `<path d="M23 20h0M41 20h0" stroke="#94A3B8" stroke-width="3"/>`),
    category: "Information",
    adapters: SENDS.concat(["landing"]),
    defaults: { ends_at: "" },
    controls: [{ key: "ends_at", label: "Counts down to", type: "text", help: "Email clients that cannot show a timer see the date instead." }],
  },
  {
    kind: "social_links",
    label: "Social links",
    description: "Icons linking to your Facebook, Instagram and the rest.",
    icon: "Share2",
    picture: pictureFrom(`<circle cx="18" cy="20" r="5" fill="#94A3B8" stroke="none"/><circle cx="32" cy="20" r="5" fill="#94A3B8" stroke="none"/><circle cx="46" cy="20" r="5" fill="#94A3B8" stroke="none"/>`),
    category: "Information",
    adapters: ["landing", "email"],
    defaults: { links: [] },
    controls: [{ key: "links", label: "Accounts", type: "list", help: "Left blank, we use the accounts already connected in My Brand." }],
  },

  /* ── Capture ───────────────────────────────────────────────────────── */
  {
    kind: "form",
    label: "Contact form",
    description: "Fields a visitor fills in — every submission lands in your inbox and your contacts.",
    icon: "ClipboardList",
    picture: pictureFrom(box(10, 6, 44, 10) + box(10, 19, 44, 10) + `<rect x="10" y="32" width="20" height="6" rx="3" fill="#94A3B8" stroke="none"/>`),
    category: "Capture",
    adapters: ["landing"],
    defaults: { fields: [], submit_label: "Send" },
    controls: [
      { key: "fields", label: "Fields", type: "list" },
      { key: "submit_label", label: "Button text", type: "text" },
    ],
  },
  {
    kind: "signature",
    label: "Signature",
    description: "Where each side signs and dates it. Turns the document into something to accept.",
    icon: "PenLine",
    picture: pictureFrom(`<path d="M10 26c6-8 10 4 16-2s10 2 16-4" stroke="#94A3B8"/>` + `<path d="M8 32h22M34 32h22" stroke="#CBD5E1"/>`),
    category: "Document",
    adapters: DOCUMENTS,
    defaults: {
      heading: "Acceptance", body: "", customerLabel: "Customer signature",
      businessLabel: "", consent: "", required: true,
    },
    controls: [
      { key: "heading", label: "Heading", type: "text" },
      { key: "body", label: "What they are agreeing to", type: "textarea" },
      { key: "customerLabel", label: "Customer line", type: "text" },
      { key: "businessLabel", label: "Your line", type: "text" },
      { key: "consent", label: "Consent statement", type: "textarea", help: "Stored word for word on the signing record." },
    ],
  },

  /* ── Trust ─────────────────────────────────────────────────────────── */
  {
    kind: "testimonial",
    label: "Review",
    description: "Something a customer said about you, with their name underneath.",
    icon: "Quote",
    picture: pictureFrom(`<path d="M12 14c0-3 3-4 5-4v4c-1 0-2 1-2 3h3v7h-6z" fill="#CBD5E1" stroke="none"/>` + bar(22, 12, 34) + bar(22, 20, 26) + bar(22, 30, 16, 3)),
    category: "Trust",
    adapters: ["proposal", "landing", "email"],
    defaults: { quote: "", attribution: "", rating: 0 },
    controls: [
      { key: "quote", label: "What they said", type: "textarea" },
      { key: "attribution", label: "Who said it", type: "text" },
      { key: "rating", label: "Stars", type: "number" },
    ],
    count: { min: 1, max: 6, label: "How many reviews?", default: 3 },
  },
  /* ── Document ──────────────────────────────────────────────────────────
     The parts a proposal, agreement or quote has and a web page does not.
     Every one of these was a gap the Rolling In It agreement proved: §8 of
     BUILDER_PLATFORM_SCOPE_2026-09-15 lists them by number. ─────────────── */
  {
    kind: "doc_header",
    label: "Title page",
    description: "Your logo, the document’s title and who it is for — filled in from the customer you picked.",
    icon: "FileSignature",
    picture: pictureFrom(`<rect x="6" y="6" width="52" height="10" rx="2" fill="#64748B" stroke="none"/>` + bar(10, 22, 34, 5) + bar(10, 31, 22)),
    category: "Document",
    adapters: DOCUMENTS,
    defaults: { style: "dark_band", title: "", subtitle: "", bandRight: "" },
    controls: [
      { key: "style", label: "Look", type: "select", options: ["Dark band", "Light with accent rule"], help: "Two shipped looks. Every part of either one is still editable." },
      { key: "title", label: "Title", type: "text" },
      { key: "subtitle", label: "One line under it", type: "text" },
      { key: "bandRight", label: "Top-right line", type: "text", help: "A date, a term, a reference — merge fields work here." },
    ],
  },
  {
    kind: "key_facts",
    label: "Key facts",
    description: "The short answers at the top — customer, property, term, trigger — filled in for you.",
    icon: "Rows2",
    picture: pictureFrom(bar(8, 10, 18) + bar(34, 10, 22) + bar(8, 20, 18) + bar(34, 20, 18) + bar(8, 30, 18) + bar(34, 30, 20)),
    category: "Document",
    adapters: DOCUMENTS,
    defaults: { rows: [] },
    controls: [{ key: "rows", label: "Facts", type: "list", help: "A label and a value. Values can be typed or pulled from the customer." }],
    count: { min: 2, max: 10, label: "How many facts?", default: 4 },
  },
  {
    kind: "clauses",
    label: "Numbered clauses",
    description: "Terms as numbered paragraphs, dropped in from the clauses you have saved.",
    icon: "ListOrdered",
    picture: pictureFrom(`<path d="M8 12h2M8 22h2M8 32h2" stroke="#64748B" stroke-width="3"/>` + bar(16, 10, 40) + bar(16, 20, 34) + bar(16, 30, 38)),
    category: "Document",
    adapters: DOCUMENTS,
    defaults: { heading: "", items: [] },
    controls: [
      { key: "heading", label: "Heading", type: "text" },
      { key: "items", label: "Clauses", type: "list", help: "Pick from your clause library, or write one and save it back." },
    ],
    count: { min: 1, max: 20, label: "How many clauses?", default: 4 },
  },
  {
    kind: "property_plan",
    label: "Property service plan",
    description: "This location’s details — plowing areas, snow storage, obstacles. The crew sees the same sheet.",
    icon: "Home",
    picture: pictureFrom(`<path d="M12 20l10-8 10 8v12H12z" stroke="#64748B"/>` + bar(38, 14, 18) + bar(38, 22, 14) + bar(38, 30, 16)),
    category: "Document",
    adapters: DOCUMENTS,
    defaults: { locationId: "", heading: "Property service plan", rows: [] },
    controls: [
      { key: "locationId", label: "Which location", type: "select" },
      { key: "heading", label: "Heading", type: "text" },
      { key: "rows", label: "Details", type: "list", help: "Saved on the location, so the crew and the next document get them too." },
    ],
  },
  {
    kind: "property_block",
    label: "Property block",
    description: "One location with its own line items and its own subtotal. Use one per site.",
    icon: "MapPinned",
    picture: pictureFrom(`<path d="M12 10a4 4 0 0 1 4 4c0 3-4 6-4 6s-4-3-4-6a4 4 0 0 1 4-4z" fill="#94A3B8" stroke="none"/>` + bar(20, 12, 36) + bar(8, 24, 48) + bar(8, 32, 24) + bar(44, 32, 12, 5)),
    category: "Document",
    adapters: DOCUMENTS,
    defaults: { locationId: "", heading: "", items: [] },
    controls: [
      { key: "locationId", label: "Which location", type: "select" },
      { key: "heading", label: "Name on the document", type: "text" },
      { key: "items", label: "Line items", type: "list" },
    ],
  },
  {
    kind: "page_break",
    label: "Page break",
    description: "Start a new page here when the document is printed or saved as a PDF.",
    icon: "Scissors",
    picture: pictureFrom(`<path d="M6 20h52" stroke="#94A3B8" stroke-dasharray="4 3"/>` + bar(10, 8, 30) + bar(10, 28, 24)),
    category: "Document",
    adapters: DOCUMENTS,
    defaults: {},
    controls: [],
  },

  /* ── Sections — the website adapter's whole bands of a page ──────────────
     Each of these is ONE ARION section kind (arion-api's sectionSchema.js
     SECTION_KINDS), so what the pane offers and what the site can actually
     render are the same list. Nothing here is invented: the labels and the
     one-liners are the schema's own `label` and `blurb`, pinned against it by
     test/fixtures/website-section-kinds.json in BOTH repos.

     A "how many?" on one of these is the guided count SD-010 asks for: how
     many services, how many reviews, how many people. It is asked once, in
     words, before the section is added. ──────────────────────────────────── */
  {
    kind: "site_hero",
    label: "Hero banner",
    description: "The big banner at the top of a page — one headline, one line of support, one button.",
    icon: "PanelTop",
    picture: pictureFrom(solid(4, 4, 56, 32) + bar(14, 13, 36, 6) + bar(20, 23, 24, 3) + `<rect x="24" y="29" width="16" height="5" rx="2" fill="#F1F5F9" stroke="none"/>`),
    category: "Sections",
    adapters: ["website"],
    defaults: {},
    controls: [],
  },
  {
    kind: "site_services",
    label: "What you do",
    description: "A row of cards, one per service, each with a short description.",
    icon: "LayoutGrid",
    picture: pictureFrom(bar(20, 5, 24, 5) + box(5, 14, 16, 21) + box(24, 14, 16, 21) + box(43, 14, 16, 21) + bar(9, 19, 8, 3) + bar(28, 19, 8, 3) + bar(47, 19, 8, 3)),
    category: "Sections",
    adapters: ["website"],
    defaults: {},
    controls: [],
    count: { min: 1, max: 8, label: "How many services?", default: 3 },
  },
  {
    kind: "site_about",
    label: "About the business",
    description: "Your story beside a picture, then the things you stand for.",
    icon: "BookOpen",
    picture: pictureFrom(solid(5, 7, 24, 26) + bar(33, 9, 26, 5) + bar(33, 18, 26) + bar(33, 25, 20) + bar(33, 31, 24)),
    category: "Sections",
    adapters: ["website"],
    defaults: {},
    controls: [],
  },
  {
    kind: "site_pricing",
    label: "What it costs",
    description: "Your prices, one card per package, with what each one includes.",
    icon: "Tags",
    picture: pictureFrom(bar(22, 4, 20, 4) + box(5, 11, 16, 24) + `<rect x="24" y="8" width="16" height="27" rx="3" fill="#F1F5F9" stroke="#64748B"/>` + box(43, 11, 16, 24) + bar(28, 12, 8, 3) + bar(28, 19, 8, 5)),
    category: "Sections",
    adapters: ["website"],
    defaults: {},
    controls: [],
    count: { min: 1, max: 6, label: "How many packages?", default: 3 },
  },
  {
    kind: "site_testimonials",
    label: "What customers say",
    description: "Quotes from real customers, with who said them.",
    icon: "Quote",
    picture: pictureFrom(bar(20, 4, 24, 4) + box(5, 12, 26, 23) + box(34, 12, 25, 23) + bar(9, 17, 18, 3) + bar(9, 23, 14, 3) + bar(38, 17, 17, 3) + bar(38, 23, 12, 3)),
    category: "Sections",
    adapters: ["website"],
    defaults: {},
    controls: [],
    count: { min: 1, max: 8, label: "How many reviews?", default: 3 },
  },
  {
    kind: "site_gallery",
    label: "Picture gallery",
    description: "A grid of photographs of your work.",
    icon: "Images",
    picture: pictureFrom(bar(22, 4, 20, 4) + solid(5, 12, 16, 10) + solid(24, 12, 16, 10) + solid(43, 12, 16, 10) + solid(5, 25, 16, 10) + solid(24, 25, 16, 10) + solid(43, 25, 16, 10)),
    category: "Sections",
    adapters: ["website"],
    defaults: {},
    controls: [],
    count: { min: 1, max: 24, label: "How many pictures?", default: 6 },
  },
  {
    kind: "site_team",
    label: "The people",
    description: "Who works here, with a photograph and what they do.",
    icon: "Users",
    picture: pictureFrom(bar(22, 4, 20, 4) + `<circle cx="16" cy="19" r="6" fill="#94A3B8" stroke="none"/><circle cx="32" cy="19" r="6" fill="#94A3B8" stroke="none"/><circle cx="48" cy="19" r="6" fill="#94A3B8" stroke="none"/>` + bar(10, 29, 12, 3) + bar(26, 29, 12, 3) + bar(42, 29, 12, 3)),
    category: "Sections",
    adapters: ["website"],
    defaults: {},
    controls: [],
    count: { min: 1, max: 12, label: "How many people?", default: 3 },
  },
  {
    kind: "site_stats",
    label: "Numbers that matter",
    description: "A band of figures — years in business, jobs done, how fast you answer.",
    icon: "Hash",
    picture: pictureFrom(`<rect x="3" y="9" width="58" height="22" rx="3" fill="#F1F5F9" stroke="#94A3B8"/>` + bar(9, 14, 12, 7) + bar(26, 14, 12, 7) + bar(43, 14, 12, 7) + bar(11, 25, 8, 3) + bar(28, 25, 8, 3) + bar(45, 25, 8, 3)),
    category: "Sections",
    adapters: ["website"],
    defaults: {},
    controls: [],
    count: { min: 1, max: 6, label: "How many numbers?", default: 3 },
  },
  {
    kind: "site_faq",
    label: "Questions and answers",
    description: "The questions customers keep asking, with your answers.",
    icon: "MessageCircleQuestion",
    picture: pictureFrom(bar(20, 4, 24, 4) + box(5, 11, 54, 8) + box(5, 21, 54, 8) + box(5, 31, 54, 6) + bar(9, 14, 22, 3) + bar(9, 24, 26, 3)),
    category: "Sections",
    adapters: ["website"],
    defaults: {},
    controls: [],
    count: { min: 1, max: 20, label: "How many questions?", default: 4 },
  },
  {
    kind: "site_cta",
    label: "Call to action",
    description: "A wide band with a headline and one or two buttons.",
    icon: "Megaphone",
    picture: pictureFrom(solid(3, 8, 58, 24) + bar(16, 13, 32, 5) + `<rect x="18" y="22" width="12" height="6" rx="3" fill="#F1F5F9" stroke="none"/><rect x="34" y="22" width="12" height="6" rx="3" fill="#CBD5E1" stroke="none"/>`),
    category: "Sections",
    adapters: ["website"],
    defaults: {},
    controls: [],
  },
  {
    kind: "site_contact",
    label: "Contact and form",
    description: "How to reach you, next to a form that sends straight to your inbox.",
    icon: "Mail",
    picture: pictureFrom(bar(20, 4, 24, 4) + `<circle cx="9" cy="15" r="2" fill="#94A3B8" stroke="none"/>` + bar(15, 13, 14, 3) + `<circle cx="9" cy="23" r="2" fill="#94A3B8" stroke="none"/>` + bar(15, 21, 12, 3) + box(34, 11, 25, 8) + box(34, 21, 25, 8) + `<rect x="34" y="31" width="12" height="5" rx="2" fill="#94A3B8" stroke="none"/>`),
    category: "Sections",
    adapters: ["website"],
    defaults: {},
    controls: [],
  },
  {
    kind: "site_content",
    label: "Words and pictures",
    description: "A free section: headings, paragraphs, pictures, buttons and video, in one to three columns.",
    icon: "Type",
    picture: pictureFrom(bar(5, 6, 26, 5) + bar(5, 15, 26) + bar(5, 22, 22) + bar(5, 29, 26) + solid(35, 6, 24, 29)),
    category: "Sections",
    adapters: ["website"],
    defaults: { layout: 1, blocks: [] },
    controls: [],
    count: { min: 1, max: 3, label: "How many columns?", default: 1 },
  },
  {
    kind: "site_custom",
    label: "Custom section (kept as is)",
    description: "Something built on the website itself. It stays exactly as it is until you take charge of it.",
    icon: "Lock",
    picture: pictureFrom(box(5, 6, 54, 29) + `<path d="M12 13l40 20M52 13L12 33" stroke="#CBD5E1"/>`),
    category: "Sections",
    adapters: ["website"],
    // Never offered: a custom section is what a page ALREADY has, not
    // something anybody can add.
    hidden: true,
    defaults: {},
    controls: [],
  },
  {
    kind: "columns",
    label: "Columns",
    description: "Split this section into two or three side by side.",
    icon: "Columns3",
    picture: pictureFrom(box(6, 8, 15, 26) + box(24, 8, 16, 26) + box(43, 8, 15, 26)),
    category: "Layout",
    adapters: ALL,
    defaults: {},
    controls: [],
    count: { min: 2, max: 3, label: "How many columns?", default: 2 },
  },
];

/* ══════════════════════════════════════════════════════════════════════════
   Reading the registry
   ══════════════════════════════════════════════════════════════════════════ */

export const WIDGETS_BY_KIND: Record<string, WidgetDef> = Object.fromEntries(
  WIDGETS.map((w) => [w.kind, w]),
);

/** Every widget a given builder may offer, in registry order. */
export function widgetsFor(adapter: BuilderAdapter): WidgetDef[] {
  return WIDGETS.filter((w) => w.adapters.includes(adapter) && !w.hidden);
}

/** Including the ones nothing offers — what the RENDERER has to cover. */
export function allWidgetsFor(adapter: BuilderAdapter): WidgetDef[] {
  return WIDGETS.filter((w) => w.adapters.includes(adapter));
}

/** The website adapter's whole-page sections, in the order the pane shows them. */
export const SITE_SECTION_KINDS = [
  "site_hero", "site_services", "site_about", "site_pricing", "site_testimonials",
  "site_gallery", "site_team", "site_stats", "site_faq", "site_cta", "site_contact",
  "site_content",
] as const;

/** `site_hero` ⇄ `hero` — the ARION section kind arion-api speaks. */
export function arionKindOf(widgetKind: string): string | null {
  if (widgetKind === "site_content") return "content";
  return widgetKind.startsWith("site_") && widgetKind !== "site_custom"
    ? widgetKind.slice(5)
    : null;
}
export function siteWidgetKindFor(arionKind: string): string {
  return arionKind === "content" ? "site_content" : `site_${arionKind}`;
}

/**
 * The pane's own query: what this builder may use, matching the search box,
 * grouped by category, empty groups dropped.
 *
 * Pure so the grouping is a test rather than something you have to click to
 * check. Search matches the label AND the description, because a business
 * owner types what they want ("price") far more often than what we called it.
 */
export function groupForPane(
  adapter: BuilderAdapter,
  query = "",
): Array<{ category: WidgetCategory; widgets: WidgetDef[] }> {
  const q = query.trim().toLowerCase();
  const matches = (w: WidgetDef) =>
    !q || w.label.toLowerCase().includes(q) || w.description.toLowerCase().includes(q) || w.kind.includes(q);

  return WIDGET_CATEGORIES
    .map((category) => ({
      category,
      widgets: widgetsFor(adapter).filter((w) => w.category === category && matches(w)),
    }))
    .filter((g) => g.widgets.length > 0);
}

/** The tooltip text for a widget's button. Label plus the sentence, always. */
export function widgetTooltip(w: WidgetDef): string {
  return `${w.label} — ${w.description}`;
}
