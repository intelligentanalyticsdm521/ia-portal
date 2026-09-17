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

/**
 * A sentence, or a sentence PER BUILDER (D-30, C-A-2 / N-4).
 *
 * One string served five adapters, so *"A title for the section, optionally
 * numbered like “1. Scope of work”"* read that way in the email, the website,
 * the landing page and the social-graphic pane. BUILDER_UX_SPEC §M-26: a widget
 * offered in four builders has four lines, or it is not offered in all four.
 *
 * A plain string still means "the same in every builder", which is correct for
 * a widget whose job does not change with the medium. The map form is resolved
 * against the adapter the pane is already being drawn for, and falls back to
 * the `proposal` wording only when the map has nothing for that adapter — a
 * missing sentence must never blank the line under a widget's name.
 */
export type AdapterText = string | Partial<Record<BuilderAdapter, string>>;

export interface WidgetDef {
  kind: string;
  label: string;
  /** Where a medium calls this something else. Rare; `label` is the default. */
  labels?: Partial<Record<BuilderAdapter, string>>;
  /** ONE line, in a business owner's words, per medium. See the header. */
  description: AdapterText;
  /**
   * THE JOB THIS WIDGET DOES (handoff A-7).
   *
   * `widgetTasks.ts` groups the pane and the picker by the job rather than the
   * type. Whoever owns a widget knows its job better than a map beside it does,
   * so the entry says so here and `TASK_BY_CATEGORY` only answers for the ones
   * whose category is specific enough. Typed as a plain string because
   * `widgetTasks` imports THIS module and not the other way round; it validates
   * the value against its own seven groups.
   */
  task?: string;
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
   Pictures — moved to ./pictures (D-156 stream B)
   ===================================================================== */

/* A widget now declares itself in its own module under `widgets/`, and this
   file collects those declarations. A widget module reaching back in here for
   `pictureFrom` would make the two files import each other at evaluation time,
   so the three picture helpers live in `./pictures`, which neither side owns.
   `pictureFrom` is re-exported here, so every existing caller is unchanged. */
export { pictureFrom } from "./pictures";
import { pictureFrom, bar, box, solid } from "./pictures";
/* D-156 — the atomic widgets, each declared in its own file beside the
   function that draws it. Spread into WIDGETS below: one vocabulary, still. */
import { ATOM_WIDGET_DEFS } from "./widgets";


/* ══════════════════════════════════════════════════════════════════════════
   THE registry — §3.2's union, as definitions
   ══════════════════════════════════════════════════════════════════════════ */

const ALL: BuilderAdapter[] = ["proposal", "website", "email", "landing", "brand"];
/**
 * Every builder whose page is a FLOW: sections stack, a widget takes the width
 * it is given, and "space between things" is a property. My Brand's canvas is
 * absolute pixels, so the three widgets that only mean something in a flow
 * (columns, spacer) and the two that are really small tables (key facts, data
 * table) are offered to these four and not to the studio. Everything else on
 * ALL genuinely has a pixel meaning — a heading is a text layer, a divider is a
 * line, a button is a rounded block with a label on it.
 */
const FLOWS: BuilderAdapter[] = ["proposal", "website", "email", "landing"];
/** My Brand's Template Studio only. A logo, a QR code and a colour block are
 *  placed objects, not page furniture. */
const CANVAS: BuilderAdapter[] = ["brand"];
/**
 * The two small tables — a details list and a plain table. Three separate
 * decisions, taken on three branches, each took a builder away, and what is
 * left is the document:
 *   · not the pixel canvas — a table has no meaning at absolute x/y (§5 step 5)
 *   · not a website — that job is a whole section the SERVER builds,
 *     `site_stats` for a details list and `content` for a plain table
 *     (§4 step 3, WEBSITE_USES_A_SECTION_INSTEAD below)
 *   · not an email or a landing page — a details grid is two columns of text,
 *     and a data table inside an email's own layout tables is the thing
 *     Outlook reflows worst (§7, THE EMAIL SUBSET below)
 *
 * Kept as its own name rather than folded into DOCUMENTS so the three reasons
 * have one place to live, and so the next builder that wants a table has to
 * come here and say why. All three exclusions are asserted — the website half
 * by website-builder.test.mjs, the other two by builder-registry.test.mjs.
 */
const SMALL_TABLES: BuilderAdapter[] = ["proposal"];
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

/* ── THE EMAIL SUBSET, 2026-09-16 ───────────────────────────────────────────
   Q2, answered by Brandon: "same canvas, new interface, RESTRICTED widget
   set". §7 names the set: heading, text, image, button, divider, spacer,
   columns, article card, product/pricing card, social links, footer with the
   unsubscribe, plus a personal note that takes merge tags. A bullet list joins
   them because a list is three <li> in a table cell and every newsletter has
   one.

   Everything else lost its "email" adapter in the same pass, and each for a
   reason a mailbox enforces rather than a preference:
     comparison_cards  the product card IS the priced card for email, and two
                       ways to show a price is the duplication this rebuild
                       exists to delete
     pricing_table     a rate card is a document, not a send
     key_value_table
     data_table        a table inside a layout table, in Outlook
     callout           a tinted panel is what a coloured section already is
     countdown         a live timer is an animated GIF from a third party, and
                       §"no third-party product surface" says no
     testimonial       it is a paragraph with a name under it; the newsletter
                       templates place one
     logo_strip        images side by side is what a 2/3-column section does
     merge_field       every run of text takes merge tags; a widget whose whole
                       job is one token is a fourth way to do one thing
     footer_note       email_footer carries the small print AND the two things
                       the law requires

   The landing set is trimmed the same way, to §7's "hero, text, image, form,
   button, columns, spacer, divider, footer" plus the headings, lists, reviews
   and social row a real page needs. A hosted landing page is "a headline, some
   copy, a picture, a button and a way to be contacted" — anything past that is
   a website, and that is the website builder's job. ─────────────────────── */

export const WIDGETS: WidgetDef[] = [
  /* D-156 — THE ATOMIC WIDGETS. Each one declares itself in its own file under
     `widgets/`, beside the function that draws it, and the list is spread in
     here so there is still exactly ONE vocabulary. See widgets/index.ts. */
  ...ATOM_WIDGET_DEFS,
  /* ── Text ──────────────────────────────────────────────────────────── */
  {
    kind: "heading",
    label: "Heading",
    description: {
      proposal: "A title for the section, optionally numbered like “1. Scope of work”.",
      website: "A title for this band of the page — the line somebody skims before they read.",
      email: "A title inside the email — the line that carries the eye down to the next part.",
      landing: "A title for this band of the page — the line a visitor reads first.",
      brand: "A line of big type on the design — the words people read from across the room.",
    },
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
    description: {
      proposal: "Ordinary writing — a sentence or a few, with bold and links.",
      website: "Ordinary writing on the page — a sentence or a few, with bold and links.",
      email: "Ordinary writing in the email — a sentence or a few, with bold and links.",
      landing: "Ordinary writing on the page — a sentence or a few, with bold and links.",
      brand: "A block of smaller type under the headline.",
    },
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
    description: {
      proposal: "A list of short points, one per line.",
      website: "A list of short points a visitor can skim, one per line.",
      email: "A list of short points, one per line — the part people actually read.",
      landing: "A list of short points a visitor can skim, one per line.",
      brand: "A short list on the design, one point per line.",
    },
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
    description: {
      proposal: "A note at the bottom in small type — terms, a disclaimer, a validity date.",
      landing: "A note at the bottom in small type — terms, a privacy line, a disclaimer.",
    },
    task: "Signature & terms",
    icon: "FileText",
    picture: pictureFrom(box(6, 6, 52, 28) + bar(10, 26, 30, 3)),
    category: "Text",
    // Not email: the email footer carries the small print AND the two things
    // the law requires beside it, so an email has one footer, not two.
    adapters: ["proposal", "landing"],
    defaults: { text: "" },
    controls: [{ key: "text", label: "Note", type: "textarea", help: "Shown in small grey type. Nothing is added unless you write it." }],
  },
  {
    kind: "merge_field",
    label: "Personal detail",
    description: "Drops in the customer’s name, address or any field you store, filled in per recipient.",
    task: "Customer & property",
    icon: "Braces",
    picture: pictureFrom(bar(8, 12, 18) + `<rect x="30" y="10" width="26" height="8" rx="4" fill="#E2E8F0" stroke="#94A3B8"/>` + bar(8, 26, 40)),
    category: "Text",
    // Not email or landing: every run of text there takes merge tags from the
    // picker, so a widget whose only job is one token is a fourth way to do
    // one thing.
    adapters: ["proposal"],
    defaults: { token: "" },
    controls: [{ key: "token", label: "Which detail", type: "merge", help: "Picked from a list — customer, property, contract or your own fields." }],
  },

  /* ── Media ─────────────────────────────────────────────────────────── */
  {
    kind: "image",
    label: "Picture",
    description: {
      proposal: "One photo or graphic, with an optional caption.",
      website: "One photo or graphic on the page, with an optional caption.",
      email: "One photo or graphic in the email, with an optional caption.",
      landing: "One photo or graphic on the page, with an optional caption.",
      brand: "A photo or graphic placed on the design — drag its corners to size it.",
    },
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
    description: {
      landing: "Several photos in a grid — a portfolio, before-and-afters, a product range.",
      brand: "Several photos laid out in a grid on the design.",
    },
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
    description: {
      website: "A video from YouTube or Vimeo, playing on the page.",
      landing: "A video from YouTube or Vimeo, playing where the visitor lands.",
    },
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
    description: {
      email: "A row of logos — brands you carry, or clients you have worked with.",
      landing: "A row of logos — brands you carry, or clients you have worked with.",
    },
    icon: "Building2",
    picture: pictureFrom(solid(6, 16, 12, 8) + solid(22, 16, 12, 8) + solid(38, 16, 12, 8) + solid(54, 16, 4, 8)),
    category: "Media",
    // Offered by NOBODY, and drawn by nobody. A website answers this job with
    // site_gallery (WEBSITE_USES_A_SECTION_INSTEAD) and an email or a landing
    // page answers it with a two- or three-column section (THE EMAIL SUBSET),
    // so both decisions together leave it homeless. Kept in the vocabulary,
    // hidden like site_custom, rather than deleted: §3.2 scopes the kind, and
    // un-scoping one is not a merge's decision to make.
    adapters: ["landing", "email"],
    hidden: true,
    defaults: { items: [] },
    controls: [{ key: "items", label: "Logos", type: "list" }],
    count: { min: 2, max: 10, label: "How many logos?", default: 5 },
  },

  /* ── Layout ────────────────────────────────────────────────────────── */
  {
    kind: "divider",
    label: "Divider",
    description: {
      proposal: "A line across the section, to separate one idea from the next.",
      website: "A line across the section, to separate one idea from the next.",
      email: "A line across the email, to separate one idea from the next.",
      landing: "A line across the section, to separate one idea from the next.",
      brand: "A straight rule you place on the design, at any length and weight.",
    },
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
    description: {
      proposal: "Empty space, when two things are sitting too close together.",
      website: "Empty space, when two things on the page are sitting too close together.",
      email: "Empty space, when two things in the email are sitting too close together.",
      landing: "Empty space, when two things on the page are sitting too close together.",
    },
    icon: "MoveVertical",
    picture: pictureFrom(bar(8, 8, 48) + `<path d="M32 16v10" stroke="#CBD5E1"/>` + bar(8, 30, 48)),
    category: "Layout",
    adapters: FLOWS,
    defaults: { height: 24 },
    controls: [{ key: "height", label: "How much space", type: "number" }],
  },
  {
    kind: "button",
    label: "Button",
    description: {
      proposal: "The thing you want them to press — Accept, Book a call, Ask a question.",
      website: "The thing you want a visitor to click — Book a call, Get a quote.",
      email: "The thing you want the reader to click — Book a call, See the offer.",
      landing: "The thing you want a visitor to click — Get a quote, Claim the offer.",
      brand: "A rounded block with a few words on it, for a call to action.",
    },
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
    description: {
      proposal: "A tinted box for something that must not be skimmed past.",
      brand: "A tinted panel on the design, for the words that must not be missed.",
    },
    task: "Words",
    icon: "AlertCircle",
    picture: pictureFrom(`<rect x="8" y="10" width="48" height="20" rx="3" fill="#F1F5F9" stroke="#94A3B8"/>` + `<path d="M13 10v20" stroke="#64748B" stroke-width="3"/>` + bar(19, 15, 30) + bar(19, 22, 20)),
    category: "Layout",
    // Not website: the site's own `content` section does it (§4 step 3).
    // Not email or landing: a tinted panel is what a section with a background
    // colour already is, and one of those survives Outlook (§7).
    // Still the studio's: on a pixel canvas it is a real placed object.
    adapters: ["proposal", "brand"],
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
    /* SUPERSEDED BY D-156 — folded into `price_line`.
       `hidden` means "still in the vocabulary, never offered": a document
       saved before the upgrade still draws, and nobody can add another one.
       THE ENTRY ITSELF IS DELETED the day stream A's upgrade-on-open lands
       (D156_HANDOFF_2026-09-17.md, B→A-1), which is what makes this safe to
       leave here rather than a composite quietly coming back. */
    hidden: true,
  },
  {
    kind: "comparison_cards",
    label: "Options to choose from",
    description: "Two to six plans side by side, with one marked Recommended.",
    icon: "LayoutGrid",
    picture: pictureFrom(box(6, 8, 16, 26) + `<rect x="24" y="5" width="16" height="29" rx="3" fill="#F1F5F9" stroke="#64748B"/>` + box(42, 8, 16, 26) + bar(27, 11, 10, 3)),
    category: "Money",
    // Not website: site_pricing is the one mechanism there (§4 step 3).
    // Not email or landing: the product card IS the priced card there, pulled
    // from Products & Services with the catalogue's own cadence (§7).
    adapters: DOCUMENTS,
    defaults: { heading: "", intro: "", cards: [] },
    controls: [
      { key: "heading", label: "Heading above the cards", type: "text" },
      { key: "intro", label: "One line of context", type: "textarea" },
      { key: "cards", label: "The options", type: "list" },
    ],
    /* SUPERSEDED BY D-156 — decomposed into `card` / `catalog_card` in a row container.
       `hidden` means "still in the vocabulary, never offered": a document
       saved before the upgrade still draws, and nobody can add another one.
       THE ENTRY ITSELF IS DELETED the day stream A's upgrade-on-open lands
       (D156_HANDOFF_2026-09-17.md, B→A-1), which is what makes this safe to
       leave here rather than a composite quietly coming back. */
    hidden: true,
  },
  {
    kind: "pricing_table",
    label: "Pricing table",
    description: "Your services, their prices and the basis each one bills on.",
    icon: "Table",
    picture: pictureFrom(box(6, 8, 52, 26) + `<path d="M6 16h52M23 8v26M41 8v26" stroke="#CBD5E1"/>`),
    category: "Money",
    // Not website: site_pricing is the one mechanism there (§4 step 3).
    // Not email or landing: a rate card is a document. A send shows the two or
    // three things on offer as product cards (§7).
    adapters: DOCUMENTS,
    // A rate card, not a bill: "$185 per push" does not add up to anything
    // until it snows, so this NEVER feeds the total (totals.ts rule 1).
    defaults: { heading: "", intro: "", rows: [], columns: { service: true, basis: true, rate: true } },
    controls: [
      { key: "heading", label: "Heading", type: "text" },
      { key: "intro", label: "One line above the table", type: "textarea" },
      { key: "rows", label: "Rows", type: "list", help: "Pull them from Products & Services, or type your own." },
    ],
  },
  /* `totals` LIVED HERE and is DELETED (D-156). It declares itself in
     widgets/totals.ts now, beside the function that draws it and beside its
     own tax rate, per-cent discount and coupon — which is the whole of
     D-157's "add totals … subtotal, tax rate, discounts/coupons". */

  /* ── Information ───────────────────────────────────────────────────── */
  {
    kind: "key_value_table",
    label: "Details list",
    description: "Label-and-value pairs — dates, contacts, reference numbers.",
    icon: "Rows3",
    picture: pictureFrom(bar(8, 10, 18) + bar(32, 10, 24) + bar(8, 20, 18) + bar(32, 20, 20) + bar(8, 30, 18) + bar(32, 30, 22)),
    category: "Information",
    adapters: SMALL_TABLES,
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
    adapters: SMALL_TABLES,
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
    task: "Customer & property",
    icon: "MapPin",
    picture: pictureFrom(box(8, 8, 48, 24) + `<path d="M32 14a5 5 0 0 1 5 5c0 4-5 8-5 8s-5-4-5-8a5 5 0 0 1 5-5z" fill="#94A3B8" stroke="none"/>`),
    category: "Information",
    // Website only. A hosted landing page is a headline, some copy, a picture,
    // a button and a way to be contacted — a map belongs on the site.
    adapters: ["website"],
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
    adapters: SENDS,
    defaults: { ends_at: "" },
    controls: [{ key: "ends_at", label: "Counts down to", type: "text", help: "Email clients that cannot show a timer see the date instead." }],
  },
  {
    kind: "social_links",
    label: "Social links",
    description: {
      email: "Icons linking to your Facebook, Instagram and the rest.",
      landing: "Icons linking to your Facebook, Instagram and the rest.",
    },
    icon: "Share2",
    picture: pictureFrom(`<circle cx="18" cy="20" r="5" fill="#94A3B8" stroke="none"/><circle cx="32" cy="20" r="5" fill="#94A3B8" stroke="none"/><circle cx="46" cy="20" r="5" fill="#94A3B8" stroke="none"/>`),
    category: "Information",
    adapters: ["landing", "email"],
    defaults: { links: [] },
    // Not "we use the accounts connected in My Brand": those are OAuth
    // identities (a numeric Facebook page id, an Instagram account id), not
    // public addresses, and only one of the four can be turned into a working
    // link. A row of dead links in a client's email to their own customers is
    // worse than no row, so the author gives the addresses.
    controls: [{ key: "links", label: "Accounts", type: "list", help: "Paste the address of each account you want people to follow." }],
  },

  /* ── Capture ───────────────────────────────────────────────────────── */
  {
    kind: "form",
    label: "Contact form",
    description: "Fields a visitor fills in — every submission lands in your inbox and your contacts.",
    task: "Customer & property",
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
    task: "Signature & terms",
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
    description: {
      proposal: "Something a customer said about you, with their name underneath.",
      email: "Something a customer said about you, with their name underneath.",
      landing: "Something a customer said about you, with their name underneath.",
    },
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
    task: "Customer & property",
    icon: "FileSignature",
    picture: pictureFrom(`<rect x="6" y="6" width="52" height="10" rx="2" fill="#64748B" stroke="none"/>` + bar(10, 22, 34, 5) + bar(10, 31, 22)),
    category: "Document",
    adapters: DOCUMENTS,
    // D-39 — `logoUrl` is the title band's own logo: "" means the business's
    // brand logo, "none" means the name in its place, a data: URL means the
    // picture the author uploaded. The CONTROL lives in the proposal adapter
    // beside the preview and the upload button, not here, so there is one of
    // it (see documentLogo() in proposal/ProposalBuilder.tsx).
    defaults: { style: "dark_band", title: "", subtitle: "", bandRight: "", logoUrl: "" },
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
    task: "Customer & property",
    icon: "Rows2",
    picture: pictureFrom(bar(8, 10, 18) + bar(34, 10, 22) + bar(8, 20, 18) + bar(34, 20, 18) + bar(8, 30, 18) + bar(34, 30, 20)),
    category: "Document",
    adapters: DOCUMENTS,
    defaults: { rows: [] },
    controls: [{ key: "rows", label: "Facts", type: "list", help: "A label and a value. Values can be typed or pulled from the customer." }],
    /* SUPERSEDED BY D-156 — decomposed into a row of `key_fact`.
       `hidden` means "still in the vocabulary, never offered": a document
       saved before the upgrade still draws, and nobody can add another one.
       THE ENTRY ITSELF IS DELETED the day stream A's upgrade-on-open lands
       (D156_HANDOFF_2026-09-17.md, B→A-1), which is what makes this safe to
       leave here rather than a composite quietly coming back. */
    hidden: true,
  },
  {
    kind: "clauses",
    label: "Numbered clauses",
    description: "Terms as numbered paragraphs, dropped in from the clauses you have saved.",
    task: "Signature & terms",
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
    task: "Customer & property",
    icon: "Home",
    picture: pictureFrom(`<path d="M12 20l10-8 10 8v12H12z" stroke="#64748B"/>` + bar(38, 14, 18) + bar(38, 22, 14) + bar(38, 30, 16)),
    category: "Document",
    adapters: DOCUMENTS,
    defaults: { locationId: "", heading: "Property service plan", rows: [] },
    // D-33 — "WHICH LOCATION" appeared TWICE in the inspector. This entry
    // declared `locationId` as a `select` with no options, so the shared
    // inspector printed the label with an empty control under it, and the
    // proposal adapter printed the real picker beside it. The adapter is the
    // only thing that knows which locations this CUSTOMER has, so the adapter
    // owns the control and the registry does not declare a second one.
    controls: [
      { key: "heading", label: "Heading", type: "text" },
      { key: "rows", label: "Details", type: "list", help: "Saved on the location, so the crew and the next document get them too." },
    ],
  },
  {
    kind: "property_block",
    label: "Property block",
    description: "One location with its own line items and its own subtotal. Use one per site.",
    task: "Customer & property",
    icon: "MapPinned",
    picture: pictureFrom(`<path d="M12 10a4 4 0 0 1 4 4c0 3-4 6-4 6s-4-3-4-6a4 4 0 0 1 4-4z" fill="#94A3B8" stroke="none"/>` + bar(20, 12, 36) + bar(8, 24, 48) + bar(8, 32, 24) + bar(44, 32, 12, 5)),
    category: "Document",
    adapters: DOCUMENTS,
    defaults: { locationId: "", heading: "", items: [] },
    // D-33, same as property_plan above: the adapter owns "Which location".
    controls: [
      { key: "heading", label: "Name on the document", type: "text" },
      { key: "items", label: "Line items", type: "list" },
    ],
    /* SUPERSEDED BY D-156 — decomposed into `address_block` + `price_line` + `totals`.
       `hidden` means "still in the vocabulary, never offered": a document
       saved before the upgrade still draws, and nobody can add another one.
       THE ENTRY ITSELF IS DELETED the day stream A's upgrade-on-open lands
       (D156_HANDOFF_2026-09-17.md, B→A-1), which is what makes this safe to
       leave here rather than a composite quietly coming back. */
    hidden: true,
  },
  {
    kind: "page_break",
    label: "Page break",
    description: "Start a new page here when the document is printed or saved as a PDF.",
    task: "Signature & terms",
    icon: "Scissors",
    picture: pictureFrom(`<path d="M6 20h52" stroke="#94A3B8" stroke-dasharray="4 3"/>` + bar(10, 8, 30) + bar(10, 28, 24)),
    category: "Document",
    adapters: DOCUMENTS,
    defaults: {},
    controls: [],
  },

  /* ── My Brand's canvas ──────────────────────────────────────
     §5 step 5. Seven things you place on a square, not on a page. Each one is
     an OBJECT with a position, which is why none of them belongs to a builder
     whose model is sections in a flow. The other eight the studio offers
     (heading, text, bullet list, image, photo grid, divider, button, callout)
     are the ones already in the registry — the studio draws them as layers
     rather than re-declaring them, which is the whole point of one registry. */
  {
    kind: "brand_logo",
    label: "Your logo",
    description: "Your business logo, placed at a sensible size and kept sharp.",
    icon: "Stamp",
    picture: pictureFrom(`<circle cx="20" cy="20" r="9" fill="#94A3B8" stroke="none"/>` + bar(34, 15, 22, 5) + bar(34, 24, 14, 4)),
    category: "Media",
    adapters: CANVAS,
    defaults: { source: "brand", url: "" },
    controls: [
      { key: "source", label: "Which logo", type: "select", options: ["Your brand logo", "A different picture"], help: "Your brand logo comes from Brand Identity — change it there and every design catches up." },
      { key: "url", label: "Picture", type: "image" },
    ],
  },
  {
    kind: "shape",
    label: "Shape",
    description: "A rectangle, circle or line — the block a headline sits on.",
    icon: "Shapes",
    picture: pictureFrom(`<rect x="8" y="10" width="20" height="20" rx="3" fill="#94A3B8" stroke="none"/>` + `<circle cx="45" cy="20" r="10" fill="#CBD5E1" stroke="none"/>`),
    category: "Layout",
    adapters: CANVAS,
    defaults: { shape: "rect", fill: "", radius: 0 },
    controls: [
      { key: "shape", label: "Which shape", type: "select", options: ["Rectangle", "Circle", "Line"] },
      { key: "fill", label: "Colour", type: "colour", help: "Starts as one of your brand colours. Any colour you like." },
      { key: "radius", label: "Rounded corners", type: "number" },
    ],
  },
  {
    kind: "icon",
    label: "Icon",
    description: "A simple symbol — a tick, a star, a phone, a leaf — in your colour.",
    icon: "Star",
    picture: pictureFrom(`<path d="M32 8l5 11 12 1-9 8 3 12-11-7-11 7 3-12-9-8 12-1z" fill="#94A3B8" stroke="none"/>`),
    category: "Media",
    adapters: CANVAS,
    defaults: { icon: "star", fill: "" },
    controls: [
      { key: "icon", label: "Which symbol", type: "select", help: "Pick from the set when you add it; swap it any time." },
      { key: "fill", label: "Colour", type: "colour" },
    ],
  },
  {
    kind: "colour_block",
    label: "Brand colour block",
    description: "A band of one of your brand colours — the fastest way to look designed.",
    task: "Pictures & media",
    icon: "PaintBucket",
    picture: pictureFrom(solid(6, 8, 24, 24) + `<rect x="34" y="8" width="11" height="24" rx="2" fill="#CBD5E1" stroke="none"/>` + `<rect x="48" y="8" width="10" height="24" rx="2" fill="#E2E8F0" stroke="none"/>`),
    category: "Layout",
    adapters: CANVAS,
    defaults: { slot: "primary", band: "left" },
    controls: [
      { key: "slot", label: "Which colour", type: "select", options: ["Primary", "Secondary", "Accent", "Text", "Background"] },
      { key: "band", label: "Where", type: "select", options: ["Left third", "Right third", "Top band", "Bottom band", "Middle"] },
    ],
  },
  {
    kind: "background",
    label: "Background",
    description: "Fills the whole square behind everything — a colour, a fade or a photo.",
    task: "Pictures & media",
    icon: "Frame",
    picture: pictureFrom(`<rect x="4" y="4" width="56" height="32" rx="3" fill="#CBD5E1" stroke="none"/>` + bar(16, 16, 32, 8)),
    category: "Layout",
    adapters: CANVAS,
    defaults: { fill: "gradient" },
    controls: [
      { key: "fill", label: "Fill", type: "select", options: ["Brand colour", "Fade between two brand colours", "A photo"] },
    ],
  },
  {
    kind: "qr_code",
    label: "QR code",
    description: "A square people scan with a phone to open your link.",
    task: "Pictures & media",
    icon: "QrCode",
    picture: pictureFrom(`<rect x="20" y="6" width="26" height="26" rx="2" fill="none" stroke="#64748B"/>` + `<rect x="24" y="10" width="7" height="7" fill="#94A3B8" stroke="none"/>` + `<rect x="35" y="10" width="7" height="7" fill="#94A3B8" stroke="none"/>` + `<rect x="24" y="21" width="7" height="7" fill="#94A3B8" stroke="none"/>` + `<rect x="36" y="23" width="4" height="4" fill="#94A3B8" stroke="none"/>`),
    category: "Information",
    adapters: CANVAS,
    defaults: { url: "" },
    controls: [
      { key: "url", label: "Where it goes", type: "link", help: "Paste any link — your website, a booking page, a review page." },
    ],
  },
  {
    kind: "social_handle",
    label: "Social handle",
    description: "Your @name with its platform symbol, so people know where to find you.",
    icon: "AtSign",
    picture: pictureFrom(`<circle cx="16" cy="20" r="8" fill="#94A3B8" stroke="none"/>` + bar(29, 14, 27, 5) + bar(29, 23, 18, 4)),
    category: "Information",
    adapters: CANVAS,
    defaults: { platform: "instagram", handle: "" },
    controls: [
      { key: "platform", label: "Where", type: "select", options: ["Instagram", "Facebook", "LinkedIn", "Website", "Phone", "Email"] },
      { key: "handle", label: "Your name there", type: "text" },
    ],
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
    task: "Products & services",
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
    task: "Words",
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
    task: "Products & services",
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
    task: "Pictures & media",
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
    task: "Words",
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
    task: "Customer & property",
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
    task: "Words",
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
  /* ── The email set, 2026-09-16 (§7, the email adapter) ──────────────────
     Four widgets an email has and a document does not, plus the one a hosted
     landing page opens with. Everything else the email builder offers already
     existed — that is the point of one registry. ─────────────────────────── */
  {
    kind: "personal_note",
    label: "Personal note",
    description: "A short note that greets each person by name and signs off from you.",
    icon: "PenTool",
    picture: pictureFrom(bar(8, 8, 26) + bar(8, 17, 48) + bar(8, 26, 40) + bar(8, 34, 16, 3)),
    category: "Text",
    adapters: SENDS,
    defaults: { greeting: "Hi {{first name}},", text: "", signoff: "", align: "left" },
    controls: [
      { key: "greeting", label: "Greeting", type: "text", help: "Uses the recipient's own name. Pick the name from the tag list." },
      { key: "text", label: "The note", type: "textarea" },
      { key: "signoff", label: "Sign off", type: "text" },
      { key: "align", label: "Line up", type: "select", options: ["Left", "Centre"] },
    ],
  },
  {
    kind: "article_card",
    label: "Articles",
    description: "Your stories, each with a picture, a few lines and a link to read the rest.",
    task: "Words",
    icon: "Newspaper",
    picture: pictureFrom(solid(8, 8, 18, 24) + bar(30, 10, 26, 5) + bar(30, 20, 26) + bar(30, 28, 16)),
    category: "Information",
    adapters: SENDS,
    defaults: { items: [] },
    controls: [
      { key: "items", label: "Articles", type: "list", help: "Type them here, or bring them in from your website with “From the website”." },
      { key: "layout", label: "Shape", type: "select", options: ["Picture beside the words", "Picture above the words"] },
    ],
    count: { min: 1, max: 8, label: "How many articles?", default: 3 },
  },
  {
    kind: "product_card",
    label: "Products & prices",
    description: "What you sell, with the price and how it is billed, straight from your catalogue.",
    icon: "ShoppingBag",
    picture: pictureFrom(solid(8, 8, 16, 14) + bar(8, 25, 16) + bar(8, 32, 10, 3)
      + solid(28, 8, 16, 14) + bar(28, 25, 16) + bar(28, 32, 10, 3)
      + solid(48, 8, 8, 14) + bar(48, 25, 8)),
    category: "Money",
    adapters: SENDS,
    defaults: { items: [], layout: "cards" },
    controls: [
      { key: "items", label: "What is on offer", type: "list", help: "Pick from Products & Services and the price and cadence come with it." },
      { key: "layout", label: "Shape", type: "select", options: ["Cards side by side", "One under the other"] },
    ],
    count: { min: 1, max: 4, label: "How many products?", default: 2 },
  },
  {
    kind: "email_footer",
    label: "Footer",
    description: "Who sent this, where you are, and the unsubscribe link. Required on every send.",
    task: "Signature & terms",
    icon: "PanelBottom",
    picture: pictureFrom(`<rect x="6" y="6" width="52" height="16" rx="3" fill="#F1F5F9" stroke="none"/>`
      + `<rect x="6" y="25" width="52" height="10" rx="2" fill="#CBD5E1" stroke="none"/>`
      + bar(16, 28, 14, 4) + bar(34, 28, 14, 4)),
    category: "Layout",
    adapters: SENDS,
    defaults: {
      businessName: "", address: "", note: "",
      unsubscribeLabel: "Unsubscribe", preferencesLabel: "Update your preferences",
      showSocial: true,
    },
    controls: [
      { key: "address", label: "Your postal address", type: "text", help: "The law asks for a real address on every marketing email. Comes from your business profile." },
      { key: "note", label: "Anything else", type: "textarea", help: "A line about why they are hearing from you, for example." },
      { key: "unsubscribeLabel", label: "Unsubscribe wording", type: "text" },
      { key: "showSocial", label: "Show your social links", type: "toggle" },
    ],
  },
  {
    kind: "hero",
    label: "Headline & picture",
    description: "The top of the page — the one line that says what you do, over a picture.",
    icon: "Sparkle",
    picture: pictureFrom(solid(6, 5, 52, 14) + bar(14, 23, 36, 6) + bar(20, 33, 24)),
    category: "Layout",
    // Landing only for now. The website adapter brings its own opening
    // section from the ARION library (§11 "what remains").
    adapters: ["landing"],
    defaults: { headline: "", sub: "", image: "", alt: "", align: "center" },
    controls: [
      { key: "image", label: "Picture", type: "image" },
      { key: "alt", label: "Describe the picture", type: "text", help: "Read aloud by screen readers and shown if the picture fails to load." },
      { key: "align", label: "Line up", type: "select", options: ["Centre", "Left"] },
    ],
  },
  {
    kind: "columns",
    label: "Columns",
    description: {
      proposal: "Split this section into two or three side by side.",
      website: "Split this band of the page into two or three side by side.",
      email: "Split this row into two or three side by side. Phones stack them.",
      landing: "Split this band of the page into two or three side by side.",
    },
    icon: "Columns3",
    picture: pictureFrom(box(6, 8, 15, 26) + box(24, 8, 16, 26) + box(43, 8, 15, 26)),
    category: "Layout",
    adapters: FLOWS,
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
/**
 * THE ONE RESOLVER for a per-medium string (N-4).
 *
 * A plain string is the same everywhere. A map answers for the adapter the
 * pane is being drawn for; when it has nothing for that adapter it falls back
 * to the proposal wording and then to the first sentence it has, because a
 * widget with a blank line under its name looks unfinished and tells the
 * author nothing.
 */
export function adapterText(value: AdapterText, adapter?: BuilderAdapter): string {
  if (typeof value === "string") return value;
  if (!value) return "";
  const own = adapter ? value[adapter] : undefined;
  if (own) return own;
  return value.proposal || Object.values(value).find((v) => !!v) || "";
}

/** The sentence under this widget's name, in this builder's words. */
export function widgetDescription(def: WidgetDef, adapter?: BuilderAdapter): string {
  return adapterText(def.description, adapter);
}

/** What this builder calls this widget. `label` unless the medium renames it. */
export function widgetLabel(def: WidgetDef, adapter?: BuilderAdapter): string {
  return (adapter && def.labels?.[adapter]) || def.label;
}

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
    !q || widgetLabel(w, adapter).toLowerCase().includes(q)
      || widgetDescription(w, adapter).toLowerCase().includes(q) || w.kind.includes(q);

  return WIDGET_CATEGORIES
    .map((category) => ({
      category,
      widgets: widgetsFor(adapter).filter((w) => w.category === category && matches(w)),
    }))
    .filter((g) => g.widgets.length > 0);
}

/** The tooltip text for a widget's button. Label plus the sentence, always,
 *  and both in THIS builder's words (N-4). */
export function widgetTooltip(w: WidgetDef, adapter?: BuilderAdapter): string {
  return `${widgetLabel(w, adapter)} — ${widgetDescription(w, adapter)}`;
}
