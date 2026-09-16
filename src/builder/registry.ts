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
  | "Text"
  | "Media"
  | "Layout"
  | "Money"
  | "Information"
  | "Capture"
  | "Trust";

export const WIDGET_CATEGORIES: WidgetCategory[] = [
  "Text", "Media", "Layout", "Money", "Information", "Capture", "Trust",
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
    defaults: { html: "" },
    controls: [{ key: "html", label: "Text", type: "richtext" }],
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
    adapters: ["website", "landing", "brand"],
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
    adapters: ["website", "landing", "email"],
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
    adapters: ALL,
    defaults: { heading: "", body: "", tone: "accent" },
    controls: [
      { key: "heading", label: "Heading", type: "text" },
      { key: "body", label: "Text", type: "richtext" },
      { key: "tone", label: "Tone", type: "select", options: ["Accent", "Warning"] },
    ],
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
    defaults: { description: "", quantity: 1, unit_price: 0 },
    controls: [
      { key: "description", label: "What it is", type: "text" },
      { key: "quantity", label: "How many", type: "number" },
      { key: "unit_price", label: "Price each", type: "money" },
    ],
  },
  {
    kind: "comparison_cards",
    label: "Options to choose from",
    description: "Two to six plans side by side, with one marked Recommended.",
    icon: "LayoutGrid",
    picture: pictureFrom(box(6, 8, 16, 26) + `<rect x="24" y="5" width="16" height="29" rx="3" fill="#F1F5F9" stroke="#64748B"/>` + box(42, 8, 16, 26) + bar(27, 11, 10, 3)),
    category: "Money",
    adapters: ["proposal", "website", "landing", "email"],
    defaults: { items: [] },
    controls: [
      { key: "heading", label: "Heading above the cards", type: "text" },
      { key: "items", label: "The options", type: "list" },
    ],
    count: { min: 2, max: 6, label: "How many options?", default: 3 },
  },
  {
    kind: "pricing_table",
    label: "Pricing table",
    description: "Your tiers in a table, with what each one includes.",
    icon: "Table",
    picture: pictureFrom(box(6, 8, 52, 26) + `<path d="M6 16h52M23 8v26M41 8v26" stroke="#CBD5E1"/>`),
    category: "Money",
    adapters: ["website", "landing", "email"],
    defaults: { tiers: [] },
    controls: [{ key: "tiers", label: "Tiers", type: "list" }],
    count: { min: 2, max: 5, label: "How many tiers?", default: 3 },
  },
  {
    kind: "totals",
    label: "Totals at a glance",
    description: "Grouped subtotals and a grand total, for when the list of prices is long.",
    icon: "Calculator",
    picture: pictureFrom(bar(8, 10, 26) + bar(44, 10, 12) + bar(8, 18, 20) + bar(44, 18, 12) + `<path d="M8 26h48" stroke="#94A3B8"/>` + bar(8, 30, 16) + bar(42, 30, 14, 5)),
    category: "Money",
    adapters: DOCUMENTS,
    defaults: { groups: [] },
    controls: [{ key: "groups", label: "Groups", type: "list" }],
  },

  /* ── Information ───────────────────────────────────────────────────── */
  {
    kind: "key_value_table",
    label: "Details list",
    description: "Label-and-value pairs — dates, contacts, reference numbers.",
    icon: "Rows3",
    picture: pictureFrom(bar(8, 10, 18) + bar(32, 10, 24) + bar(8, 20, 18) + bar(32, 20, 20) + bar(8, 30, 18) + bar(32, 30, 22)),
    category: "Information",
    adapters: ALL,
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
    adapters: ALL,
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
    adapters: ["website", "landing", "email"],
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
    adapters: ["website", "landing"],
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
    category: "Capture",
    adapters: DOCUMENTS,
    defaults: { parties: [] },
    controls: [{ key: "parties", label: "Who signs", type: "list" }],
    count: { min: 1, max: 4, label: "How many signatures?", default: 2 },
  },

  /* ── Trust ─────────────────────────────────────────────────────────── */
  {
    kind: "testimonial",
    label: "Review",
    description: "Something a customer said about you, with their name underneath.",
    icon: "Quote",
    picture: pictureFrom(`<path d="M12 14c0-3 3-4 5-4v4c-1 0-2 1-2 3h3v7h-6z" fill="#CBD5E1" stroke="none"/>` + bar(22, 12, 34) + bar(22, 20, 26) + bar(22, 30, 16, 3)),
    category: "Trust",
    adapters: ["proposal", "website", "landing", "email"],
    defaults: { quote: "", attribution: "", rating: 0 },
    controls: [
      { key: "quote", label: "What they said", type: "textarea" },
      { key: "attribution", label: "Who said it", type: "text" },
      { key: "rating", label: "Stars", type: "number" },
    ],
    count: { min: 1, max: 6, label: "How many reviews?", default: 3 },
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
  return WIDGETS.filter((w) => w.adapters.includes(adapter));
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
