/**
 * families/f7-data-lists/iaPosts.ts — **IA Posts**, on all three surfaces.
 *
 * ── WHAT THIS WIDGET IS ───────────────────────────────────────────────────
 * The offer file's `ia_twins` calls it *"twin of Posts (exists in the plugin)"*,
 * and Brandon's own words on 2026-09-19 are the definition of an IA widget:
 * *"That is literally what the IA Posts does. It is Elementor widgets, just
 * fitted with custom ability options and styles."*
 *
 * It really does exist in the plugin. `ia_posts` is a REGISTERED Elementor
 * widget on the live IA site, in Elementor's own `intelligent-analytics`
 * category, with **207 controls in seven content sections and two style
 * sections** — Layout, Query, Filter Bar, Colors, Post Fields, Portfolio
 * Fields, Featured Post, Hero, Subscribe Bar, Stats Strip, Footer CTA,
 * Pagination, then Card and Typography. Every key, label, option list and
 * default below is read off that widget's own entry in
 * `BUILDER_WIDGET_CATALOG_2026-09-17.pro.json`, the 2026-09-17 scrape of the
 * real install, and pinned key by key against
 * `test/fixtures/WIDGET_SETTINGS_KEYS.json`. Nothing here is invented, and
 * nothing here is Elementor's Posts widget wearing a different name: this is
 * the PLUGIN's panel, which is what makes the published page and the builder
 * agree.
 *
 * ── WHY IT IS IN WAVE 2 ───────────────────────────────────────────────────
 * The two definitions it replaces carried TWO controls each. On the website
 * that was a list with a "Posts" box and a "Layout" select; in the mailbox,
 * "Articles" and "Shape". The plugin has 207. An author who dropped IA Posts
 * got a tile that could not be told how many columns, what to show on a card,
 * or how big the title is — and the arion emitter published two keys
 * (`posts_per_page`, `columns`) read from prop names (`count`, `columns`) that
 * **the Portal never wrote**, so the one setting the panel did offer was
 * dropped on publish. Found by executing the emitter, and fixed here.
 *
 * ── ONE WIDGET, TWO STORED KINDS, AND BOTH KEEP THEIR ID ──────────────────
 * The platform stores this widget under two ids and always has:
 *
 *   `ia_posts`      the website and the landing page  (was widgets/iaBlocks.ts)
 *   `article_card`  the newsletter                    (was registry.ts)
 *
 * They are NOT merged. A newsletter saved in July holds `{"kind":"article_card"}`
 * and a hosted landing page holds `{"kind":"ia_posts"}`; renaming either is a
 * migration of stored documents to buy a tidier list, and the override seam
 * exists precisely so a family can replace a definition WITHOUT touching the
 * id. Both defs read every prop the old ones stored — `items`, `layout`, and
 * arion's `count` — so nothing a customer already has loses a word.
 *
 * ── WHY THE NEWSLETTER PANEL IS SHORTER THAN THE WEBSITE'S ────────────────
 * Not a subset chosen by taste. A control is on a panel HERE only when the
 * renderer for that surface really honours it, because a control that changes
 * nothing is the `reference_catch_swallow_report_success` shape with a label on
 * it. A mailbox has no query (the author picks the posts by hand), no skin
 * (skins are CSS grid layouts and a mailbox is tables), no pagination, and no
 * author / date / read-time / tags, because the items a newsletter stores have
 * never carried those fields. Each absence is named in the handoff.
 */
import type { Widget } from "../../../model";
import { esc } from "../../../esc";
import { altTextFor, CONTENT_WIDTH, fluidRow, fontStack, inlineSafe } from "../../../emailBox";
import { fill } from "../../../merge";
import type { RenderContext } from "../../../render";
import type { WidgetControl } from "../../../registry";
import { bar, pictureFrom, solid } from "../../../pictures";
import type {
  EmailRenderContext, FamilyEmailRenderer, FamilyRenderer, FamilyWidgetDef,
} from "../types";
import { str } from "./shared";

/* ══════════════════════════════════════════════════════════════════════════
   THE PLUGIN'S OWN OPTION LISTS — copied, never remembered
   ══════════════════════════════════════════════════════════════════════════ */

/** `post_skin`. Thirteen layouts the plugin ships; `signal` is its default. */
export const IA_SKINS = [
  "signal", "spotlight", "dispatch", "stream", "sidebar", "showcase", "atlas",
  "horizon", "archive", "edition", "editorial", "magazine", "broadsheet",
];

export const IA_IMAGE_MODES = ["color_block", "featured_image", "none"];
export const IA_THEMES = ["light", "dark"];
export const IA_PRESETS = ["simple", "classic", "bold"];
export const IA_COLUMNS = ["1", "2", "3", "4"];
export const IA_POST_TYPES = ["any", "post", "portfolio", "newsletter", "magazine", "editorial"];
export const IA_ORDERBY = ["date", "modified", "title", "comment_count", "rand"];
export const IA_ORDER = ["DESC", "ASC"];
export const IA_TITLE_TAGS = ["h2", "h3", "h4", "p"];
export const IA_PAGINATION = ["none", "numbers", "load_more"];
export const IA_IMAGE_POSITIONS = [
  "top left", "top center", "top right",
  "center left", "center center", "center right",
  "bottom left", "bottom center", "bottom right",
];
/** `title_typography_font_weight`. The plugin's own list, blank included. */
export const IA_WEIGHTS = ["", "100", "200", "300", "400", "500", "600", "700", "800", "900", "normal", "bold"];

const opts = (values: string[], label?: (v: string) => string) =>
  values.map((v) => ({ value: v, label: label ? label(v) : v }));

/** A skin's name in the panel: the plugin's value, said as a person reads it. */
const titleCase = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);

/* ══════════════════════════════════════════════════════════════════════════
   READING THE AUTHOR'S CHOICES — one reader for three surfaces
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The plugin's switcher: the string "yes", or the empty string for OFF.
 *
 * THREE ANSWERS AND NOT TWO, which is the whole point. `undefined` means the
 * author has never touched it and takes the PLUGIN's own default — reading it
 * as "off" is what turned every title, excerpt and Read More off the moment a
 * grid was published, which f7's first wave found in arion's `yn`. The EMPTY
 * STRING is an explicit off and stays off; it is what Elementor's switcher
 * writes when a person clicks it. Found here by the per-control test: eight
 * `show_*` toggles were moved to "" and the canvas did not change.
 */
export function iaOn(v: unknown, dflt: boolean): boolean {
  if (v === undefined || v === null) return dflt;
  return v === true || v === "yes";
}

/** A whole number, or the plugin's own default when the box is empty. */
const count = (v: unknown, dflt: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : dflt;
};

/**
 * A slider the author may have left alone.
 *
 * Elementor stores a slider as `{ unit, size, sizes }`, and the panel writes a
 * plain number. BOTH are read, because a document saved by the page engine and
 * a document saved by our panel are the same document.
 */
export function iaSize(v: unknown, dflt: number): number {
  const raw = v && typeof v === "object" ? (v as any).size : v;
  const n = Number(raw);
  return Number.isFinite(n) && String(raw).trim() !== "" ? n : dflt;
}

/** One of the plugin's own values, or its default. Never a value it refuses. */
const choose = (v: unknown, allowed: string[], dflt: string): string => {
  const s = str(v).trim();
  return allowed.includes(s) ? s : dflt;
};

/** One post, as either stored kind holds it. */
export interface IaPost {
  title: string;
  excerpt: string;
  url: string;
  image: string;
  alt: string;
  linkLabel: string;
  author: string;
  date: string;
  category: string;
}

/** THREE STAND-IN ROWS, for a canvas with no website in front of it. They name
 *  no business and no person (`feedback_no_real_client_data_in_dev`). */
const STAND_IN: IaPost[] = [
  { title: "The first thing you published", excerpt: "The opening lines show here, as far as the length you set.", url: "", image: "", alt: "", linkLabel: "", author: "The office", date: "12 March", category: "News" },
  { title: "The one before that", excerpt: "Each card carries the picture, the title and the first few lines.", url: "", image: "", alt: "", linkLabel: "", author: "The office", date: "4 March", category: "Tips" },
  { title: "And the one before that", excerpt: "Change how many show, and what is on a card, in the panel on the right.", url: "", image: "", alt: "", linkLabel: "", author: "The office", date: "26 February", category: "News" },
];

/**
 * The posts this widget shows.
 *
 * `items` is what BOTH old definitions stored and it is read first, unchanged.
 * A widget with none — which is every website widget, because the plugin
 * fetches the real posts on the page — shows the stand-ins while editing.
 */
export function iaPosts(p: Record<string, unknown>, howMany: number, standIns: boolean): IaPost[] {
  const raw = Array.isArray(p.items) ? (p.items as any[]) : [];
  const real = raw.map((it) => ({
    title: str(it?.title), excerpt: str(it?.excerpt), url: str(it?.url),
    image: str(it?.image), alt: str(it?.alt), linkLabel: str(it?.linkLabel),
    author: str(it?.author), date: str(it?.date), category: str(it?.category),
  }));
  if (real.length) return real.slice(0, howMany);
  if (!standIns) return [];
  return Array.from({ length: Math.max(1, Math.min(12, howMany)) },
    (_, i) => STAND_IN[i % STAND_IN.length]);
}

/** Elementor's Excerpt Length is in WORDS, and the plugin says so on the label. */
export function trimWords(text: string, words: number): string {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= words) return text.trim();
  return `${parts.slice(0, Math.max(1, words)).join(" ")}…`;
}

/**
 * THE AUTHOR'S CHOICES, READ ONCE.
 *
 * Every surface reads the same function, so the canvas, the mailbox and the
 * published page cannot drift into three readings of one setting.
 */
export interface IaPostsSettings {
  skin: string; imageMode: string; theme: string; preset: string;
  columns: number; cardGap: number; perPage: number;
  postType: string; orderBy: string; order: string;
  showCategory: boolean; showTitle: boolean; titleTag: string;
  showExcerpt: boolean; excerptLength: number; showAuthor: boolean; showDate: boolean;
  showReadTime: boolean; showTags: boolean; showReadMore: boolean; readMoreText: string;
  imagePosition: string; pagination: string; archiveLink: string; archiveLabel: string;
  radius: number; padding: number;
  titleSize: number; titleWeight: string; excerptSize: number; metaSize: number;
  /** The legacy newsletter key: the picture BESIDE the words, or above them. */
  beside: boolean;
}

/**
 * THE MAILBOX'S ONE DIFFERENT STARTING VALUE, and the reason it exists.
 *
 * The plugin's own default for `columns` is "3", which is right for a website
 * grid. A newsletter saved before today has NO `columns` prop at all, and
 * reading the plugin's default for it would re-flow every stored newsletter on
 * the platform into three columns the day this lands. So the mailbox starts at
 * ONE — which is what those documents have always drawn — and an author who
 * wants two says so. Found by running the thirty golden fixtures, not by
 * reading; the goldens are unchanged in this respect.
 */
export const MAILBOX_COLUMNS = 1;

export interface SurfaceDefaults {
  /** The plugin says 3; a mailbox says 1. See MAILBOX_COLUMNS. */
  columns: number;
  /** The plugin's Card Gap is 24; a stored newsletter's article spacing is 22. */
  gap: number;
}

export const PAGE_SURFACE: SurfaceDefaults = { columns: 3, gap: 24 };
export const MAILBOX_SURFACE: SurfaceDefaults = { columns: MAILBOX_COLUMNS, gap: 22 };

export function iaPostsSettings(
  p: Record<string, unknown>, surface: SurfaceDefaults = PAGE_SURFACE,
): IaPostsSettings {
  return {
    skin: choose(p.post_skin, IA_SKINS, "signal"),
    imageMode: choose(p.image_mode, IA_IMAGE_MODES, "color_block"),
    theme: choose(p.post_theme, IA_THEMES, "light"),
    preset: choose(p.post_preset, IA_PRESETS, "classic"),
    columns: count(choose(p.columns, IA_COLUMNS, String(surface.columns)), surface.columns),
    cardGap: iaSize(p.card_gap, surface.gap),
    /* `count` is arion's own legacy prop name for this widget and it is read
       here so a page published before today keeps the number it was given. */
    perPage: count(p.posts_per_page ?? p.count, 9),
    postType: choose(p.post_type, IA_POST_TYPES, "any"),
    orderBy: choose(p.orderby, IA_ORDERBY, "date"),
    order: choose(p.order, IA_ORDER, "DESC"),
    showCategory: iaOn(p.show_category, true),
    showTitle: iaOn(p.show_title, true),
    titleTag: choose(p.title_tag, IA_TITLE_TAGS, "h3"),
    showExcerpt: iaOn(p.show_excerpt, true),
    excerptLength: count(p.excerpt_length, 20),
    showAuthor: iaOn(p.show_author, true),
    showDate: iaOn(p.show_date, true),
    showReadTime: iaOn(p.show_read_time, true),
    showTags: iaOn(p.show_tags, true),
    showReadMore: iaOn(p.show_read_more, true),
    readMoreText: str(p.read_more_text) || "Read",
    imagePosition: choose(p.image_position, IA_IMAGE_POSITIONS, "center center"),
    pagination: choose(p.pagination_type, IA_PAGINATION, "numbers"),
    archiveLink: str(p.archive_link),
    archiveLabel: str(p.archive_label) || "View all articles",
    radius: iaSize(p.card_border_radius, 8),
    padding: iaSize(p.card_padding, 14),
    titleSize: iaSize(p.title_typography_font_size, 17),
    titleWeight: choose(p.title_typography_font_weight, IA_WEIGHTS, "700") || "700",
    excerptSize: iaSize(p.excerpt_typography_font_size, 14),
    metaSize: iaSize(p.meta_typography_font_size, 12),
    /* THE ONE LEGACY KEY THAT IS NOT THE PLUGIN'S. Both old definitions stored
       `layout` as "beside" / "above" (and, in the registry's select, the whole
       sentence "Picture beside the words"). The plugin has no key for it — its
       `image_position` is the background POSITION inside a card header — so the
       stored key is kept, read both ways, and it is the newsletter's only
       non-plugin control. */
    beside: !str(p.layout).toLowerCase().includes("above"),
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   THE PANEL — the plugin's own sections, labels, options and defaults
   ══════════════════════════════════════════════════════════════════════════ */

const LAYOUT_CONTROLS = (withSkin: boolean, responsive: boolean): WidgetControl[] => [
  ...(withSkin
    ? [{
      key: "post_skin", label: "Skin", type: "select", tab: "content", section: "Layout",
      options: opts(IA_SKINS, titleCase),
      help: "Thirteen layouts the plugin draws. Signal is the standard one.",
    } as WidgetControl]
    : []),
  {
    key: "image_mode", label: "Card Header Style", type: "select", tab: "content", section: "Layout",
    options: [
      { value: "color_block", label: "Colour block" },
      { value: "featured_image", label: "The post's own picture" },
      { value: "none", label: "No header" },
    ],
  },
  { key: "post_theme", label: "Theme", type: "select", tab: "content", section: "Layout", options: opts(IA_THEMES, titleCase) },
  { key: "post_preset", label: "Preset", type: "select", tab: "content", section: "Layout", options: opts(IA_PRESETS, titleCase) },
  { key: "columns", label: "Columns", type: "select", tab: "content", section: "Layout", options: opts(IA_COLUMNS) },
  { key: "card_gap", label: "Card Gap", type: "number", tab: "content", section: "Layout", responsive },
  { key: "posts_per_page", label: "Posts Per Page", type: "number", tab: "content", section: "Layout" },
];

const FIELD_CONTROLS = (full: boolean): WidgetControl[] => [
  ...(full ? [{ key: "show_category", label: "Category Badge", type: "toggle", tab: "content", section: "Post Fields" } as WidgetControl] : []),
  { key: "show_title", label: "Title", type: "toggle", tab: "content", section: "Post Fields" },
  { key: "title_tag", label: "Title Tag", type: "select", tab: "content", section: "Post Fields", options: opts(IA_TITLE_TAGS, (v) => v.toUpperCase()) },
  { key: "show_excerpt", label: "Excerpt", type: "toggle", tab: "content", section: "Post Fields" },
  { key: "excerpt_length", label: "Excerpt Length (words)", type: "number", tab: "content", section: "Post Fields" },
  ...(full
    ? [
      { key: "show_author", label: "Author", type: "toggle", tab: "content", section: "Post Fields" },
      { key: "show_date", label: "Date", type: "toggle", tab: "content", section: "Post Fields" },
      { key: "show_read_time", label: "Read Time", type: "toggle", tab: "content", section: "Post Fields" },
      { key: "show_tags", label: "Tags", type: "toggle", tab: "content", section: "Post Fields" },
    ] as WidgetControl[]
    : []),
  { key: "show_read_more", label: "Read More", type: "toggle", tab: "content", section: "Post Fields" },
  {
    key: "read_more_text", label: "Read More Text", type: "text", tab: "content", section: "Post Fields",
    help: "The arrow is added for you.",
  },
  ...(full
    ? [{
      key: "image_position", label: "Image Position", type: "select", tab: "content", section: "Post Fields",
      options: opts(IA_IMAGE_POSITIONS, (v) => v.split(" ").map(titleCase).join(" ")),
      help: "Which part of the picture stays in view when the card crops it.",
    } as WidgetControl]
    : []),
];

const STYLE_CONTROLS = (responsive: boolean, withMeta: boolean): WidgetControl[] => [
  { key: "card_border_radius", label: "Radius", type: "number", tab: "style", section: "Card", responsive },
  { key: "card_padding", label: "Body Padding", type: "number", tab: "style", section: "Card", responsive },
  { key: "title_typography_font_size", label: "Title Size", type: "number", tab: "style", section: "Typography", responsive },
  { key: "title_typography_font_weight", label: "Title Weight", type: "select", tab: "style", section: "Typography", options: opts(IA_WEIGHTS, (v) => v || "Theme default") },
  { key: "excerpt_typography_font_size", label: "Excerpt Size", type: "number", tab: "style", section: "Typography", responsive },
  ...(withMeta
    ? [{ key: "meta_typography_font_size", label: "Meta Size", type: "number", tab: "style", section: "Typography", responsive } as WidgetControl]
    : []),
];

/** Every starting value below is the PLUGIN's own default, from the scrape. */
const SHARED_DEFAULTS = {
  image_mode: "color_block", post_theme: "light", post_preset: "classic",
  columns: "3", card_gap: 24, posts_per_page: 9,
  show_title: "yes", title_tag: "h3", show_excerpt: "yes", excerpt_length: 20,
  show_read_more: "yes", read_more_text: "Read",
  archive_link: "", archive_label: "View all articles",
  card_border_radius: "", card_padding: "",
  title_typography_font_size: "", title_typography_font_weight: "",
  excerpt_typography_font_size: "",
};

const PICTURE = pictureFrom(solid(6, 6, 24, 12) + bar(6, 21, 24) + bar(6, 28, 15)
  + solid(34, 6, 24, 12) + bar(34, 21, 24) + bar(34, 28, 15));

export const IA_POSTS_DEF: FamilyWidgetDef = {
  kind: "ia_posts",
  label: "IA Posts",
  description: "Your stories, each with a picture, a few lines and a link to read the rest.",
  icon: "Newspaper",
  picture: PICTURE,
  category: "Intelligent Analytics",
  builders: ["website", "landing"],
  defaults: {
    ...SHARED_DEFAULTS,
    post_skin: "signal",
    post_type: "any", orderby: "date", order: "DESC",
    show_category: "yes", show_author: "yes", show_date: "yes",
    show_read_time: "yes", show_tags: "yes",
    image_position: "center center",
    pagination_type: "numbers",
    meta_typography_font_size: "",
  },
  controls: [
    ...LAYOUT_CONTROLS(true, true),
    { key: "post_type", label: "Post Type", type: "select", tab: "content", section: "Query", options: opts(IA_POST_TYPES, titleCase) },
    { key: "orderby", label: "Order By", type: "select", tab: "content", section: "Query", options: opts(IA_ORDERBY, (v) => ({ date: "Date", modified: "Last modified", title: "Title", comment_count: "Comment count", rand: "Random" } as Record<string, string>)[v] || v) },
    { key: "order", label: "Order", type: "select", tab: "content", section: "Query", options: [{ value: "DESC", label: "Newest first" }, { value: "ASC", label: "Oldest first" }] },
    ...FIELD_CONTROLS(true),
    { key: "pagination_type", label: "Pagination", type: "select", tab: "content", section: "Pagination", options: [{ value: "none", label: "None" }, { value: "numbers", label: "Numbers" }, { value: "load_more", label: "Load more" }] },
    { key: "archive_link", label: "Archive Link URL", type: "link", tab: "content", section: "Pagination" },
    { key: "archive_label", label: "Archive Link Label", type: "text", tab: "content", section: "Pagination" },
    ...STYLE_CONTROLS(true, true),
  ],
};

export const ARTICLE_CARD_DEF: FamilyWidgetDef = {
  kind: "article_card",
  label: "IA Posts",
  description: "Your stories, each with a picture, a few lines and a link to read the rest.",
  icon: "Newspaper",
  picture: PICTURE,
  category: "Intelligent Analytics",
  builders: ["newsletter"],
  defaults: { ...SHARED_DEFAULTS, columns: String(MAILBOX_COLUMNS), card_gap: MAILBOX_SURFACE.gap, items: [], layout: "beside" },
  /* SD-010's guided question, kept exactly as the old definition asked it. */
  count: { min: 1, max: 8, label: "How many articles?", default: 3 },
  controls: [
    {
      key: "items", label: "Posts", type: "list", tab: "content", section: "Posts",
      help: "Bring them in from your website with “From the website”, or type them here.",
    },
    {
      key: "layout", label: "Picture", type: "select", tab: "content", section: "Posts",
      options: [
        { value: "beside", label: "Beside the words" },
        { value: "above", label: "Above the words" },
      ],
    },
    /* NO SKIN: the thirteen skins are CSS grid layouts and a mailbox is tables.
       NO QUERY: the author picks the posts by hand, which is the list above.
       NO PAGINATION: there is no second page of an email. The plugin's two
       archive keys stay, because a link at the foot of a newsletter is a thing
       a reader really presses. */
    ...LAYOUT_CONTROLS(false, false),
    ...FIELD_CONTROLS(false),
    { key: "archive_link", label: "Archive Link URL", type: "link", tab: "content", section: "Pagination" },
    { key: "archive_label", label: "Archive Link Label", type: "text", tab: "content", section: "Pagination" },
    ...STYLE_CONTROLS(false, false),
  ],
};

/* ══════════════════════════════════════════════════════════════════════════
   THE CANVAS — a website page and a hosted landing page
   ══════════════════════════════════════════════════════════════════════════ */

const DARK = { paper: "#111827", ink: "#F9FAFB", quiet: "#9CA3AF", line: "#1F2937" };
const LIGHT = { paper: "#FFFFFF", ink: "", quiet: "#6B7280", line: "#E5E7EB" };

/** What a PRESET changes, and it is only ever these three numbers. */
const PRESET = {
  simple: { border: 0, shadow: "none", head: 70 },
  classic: { border: 1, shadow: "none", head: 90 },
  bold: { border: 0, shadow: "0 6px 18px rgba(15,23,42,.12)", head: 120 },
};

/**
 * THE PER-DEVICE VALUES, as a scoped `<style>`.
 *
 * Six of this widget's controls are marked `responsive` in the machine file, so
 * the panel stores `card_gap_tablet`, `card_gap_mobile` and so on
 * (`deviceKey()` is the one place that spelling lives). A renderer that read
 * only the desktop key would offer the author two fields that changed nothing,
 * so the two twins are emitted as media queries on the widget's own id. The
 * breakpoints are Elementor's own: 1024 and 767.
 */
function deviceCss(id: string, p: Record<string, unknown>): string {
  const at = (max: number, suffix: string) => {
    const gap = p[`card_gap${suffix}`];
    const radius = p[`card_border_radius${suffix}`];
    const padding = p[`card_padding${suffix}`];
    const title = p[`title_typography_font_size${suffix}`];
    const excerpt = p[`excerpt_typography_font_size${suffix}`];
    const meta = p[`meta_typography_font_size${suffix}`];
    const rules: string[] = [];
    const sel = `#${id} .ia-posts`;
    if (gap != null && gap !== "") rules.push(`${sel}{gap:${iaSize(gap, 24)}px}`);
    if (radius != null && radius !== "") rules.push(`${sel} .ia-card{border-radius:${iaSize(radius, 8)}px}`);
    if (padding != null && padding !== "") rules.push(`${sel} .ia-card-body{padding:${iaSize(padding, 14)}px}`);
    if (title != null && title !== "") rules.push(`${sel} .ia-card-title{font-size:${iaSize(title, 17)}px}`);
    if (excerpt != null && excerpt !== "") rules.push(`${sel} .ia-card-excerpt{font-size:${iaSize(excerpt, 14)}px}`);
    if (meta != null && meta !== "") rules.push(`${sel} .ia-card-meta{font-size:${iaSize(meta, 12)}px}`);
    return rules.length ? `@media(max-width:${max}px){${rules.join("")}}` : "";
  };
  const css = at(1024, "_tablet") + at(767, "_mobile");
  return css ? `<style>${css}</style>` : "";
}

/** The sentence under the grid that says which posts will really be here. */
function querySentence(s: IaPostsSettings): string {
  const kind = s.postType === "any" ? "posts" : `${s.postType} posts`;
  const by = { date: "by the day they went up", modified: "by when they were last changed", title: "by title", comment_count: "by how many comments they have", rand: "in a random order" }[s.orderBy] || "";
  const dir = s.orderBy === "rand" ? "" : s.order === "DESC" ? ", newest first" : ", oldest first";
  return `Your real ${kind} fill these cards in — ${s.perPage} of them, ${by}${dir}.`;
}

export const renderIaPosts: FamilyRenderer = (w: Widget, ctx: RenderContext) => {
  const p = (w.props || {}) as Record<string, unknown>;
  const s = iaPostsSettings(p);
  const skin = s.theme === "dark" ? DARK : LIGHT;
  const preset = PRESET[s.preset as keyof typeof PRESET] || PRESET.classic;
  const posts = iaPosts(p, s.perPage, ctx.mode === "edit");
  const ink = skin.ink || ctx.ink;

  const card = (post: IaPost) => {
    const head = s.imageMode === "none" ? "" : post.image && s.imageMode === "featured_image"
      ? `<img class="ia-card-head" src="${esc(post.image)}" alt="${esc(altTextFor({ alt: post.alt, caption: post.title, src: post.image }))}" style="display:block;width:100%;height:${preset.head}px;object-fit:cover;object-position:${esc(s.imagePosition)}"/>`
      : `<div class="ia-card-head" style="height:${preset.head}px;background:${esc(ctx.accent)}1A;background-position:${esc(s.imagePosition)}"></div>`;
    const meta: string[] = [];
    if (s.showAuthor && post.author) meta.push(esc(post.author));
    if (s.showDate && post.date) meta.push(esc(post.date));
    if (s.showReadTime) meta.push(`${Math.max(1, Math.round(post.excerpt.split(/\s+/).length / 40))} min read`);
    return `<article class="ia-card" style="background:${skin.paper};border:${preset.border}px solid ${skin.line};border-radius:${s.radius}px;box-shadow:${preset.shadow};overflow:hidden">`
      + head
      + `<div class="ia-card-body" style="padding:${s.padding}px">`
      + (s.showCategory && post.category
        ? `<span class="ia-card-cat" style="display:inline-block;margin-bottom:6px;padding:2px 8px;border-radius:999px;font-size:11px;background:${esc(ctx.accent)}1A;color:${esc(ctx.accent)}">${esc(post.category)}</span>` : "")
      + (s.showTitle
        ? `<${s.titleTag} class="ia-card-title" style="margin:0 0 4px;font-size:${s.titleSize}px;font-weight:${esc(s.titleWeight)};color:${esc(ink)}">${esc(post.title)}</${s.titleTag}>` : "")
      + (meta.length
        ? `<div class="ia-card-meta" style="font-size:${s.metaSize}px;color:${skin.quiet};margin-bottom:6px">${meta.join(" · ")}</div>` : "")
      + (s.showExcerpt
        ? `<p class="ia-card-excerpt" style="margin:0;font-size:${s.excerptSize}px;color:${skin.quiet}">${esc(trimWords(post.excerpt, s.excerptLength))}</p>` : "")
      + (s.showTags
        ? `<div class="ia-card-tags" style="margin-top:6px;font-size:${s.metaSize}px;color:${skin.quiet}">#${esc((post.category || "news").toLowerCase())}</div>` : "")
      /* TYPED ON THE PAGE, not in the panel. `definitionControls.tsx` draws
         toggles, selects, colours, numbers, pictures, links and code, and
         everything that is WORDS is typed where it appears — the platform's one
         editing mechanism. `read_more_text` and `archive_label` are words, so
         they carry `data-edit` and the author changes them in place. Found by
         opening the real panel: both were declared and neither was drawn
         anywhere, which is a control that does nothing. */
      + (s.showReadMore
        ? `<a class="ia-card-more" href="${esc(post.url || "#")}" style="display:inline-block;margin-top:8px;font-size:${s.metaSize}px;text-decoration:none;color:${esc(ctx.accent)}"${
          ctx.mode === "edit" && !post.linkLabel ? ` data-edit="read_more_text" data-placeholder="Read"` : ""
        }>${esc(post.linkLabel || s.readMoreText)} &rarr;</a>` : "")
      + `</div></article>`;
  };

  const pager = s.pagination === "none" ? ""
    : s.pagination === "load_more"
      ? `<div class="ia-posts-pager" style="text-align:center;margin-top:14px"><span class="bx-button" style="padding:6px 14px">Load more</span></div>`
      : `<div class="ia-posts-pager" style="display:flex;gap:8px;justify-content:center;margin-top:14px;font-size:12px">`
        + [1, 2].map((n) => `<a href="#" style="padding:4px 9px;border:1px solid ${skin.line};border-radius:4px;text-decoration:none">${n}</a>`).join("")
        + `</div>`;

  const archive = s.archiveLink
    ? `<div class="ia-posts-archive" style="text-align:center;margin-top:10px"><a href="${esc(s.archiveLink)}" style="font-size:13px;color:${esc(ctx.accent)};text-decoration:none"${
      ctx.mode === "edit" ? ` data-edit="archive_label" data-placeholder="View all articles"` : ""
    }>${esc(s.archiveLabel)} &rarr;</a></div>`
    : "";

  return `<div class="bx-ia-posts ia-posts-${esc(s.skin)}" id="${esc(w.id)}" data-skin="${esc(s.skin)}">`
    + deviceCss(w.id, p)
    + `<div class="ia-posts" style="display:grid;grid-template-columns:repeat(${s.columns},1fr);gap:${s.cardGap}px">`
    + posts.map(card).join("")
    + `</div>${pager}${archive}`
    + (ctx.mode === "edit"
      ? `<div class="bx-card-note" style="margin-top:8px;font-size:11px;color:#5A7A8A">${esc(querySentence(s))}</div>`
      : "")
    + `</div>`;
};

/* ══════════════════════════════════════════════════════════════════════════
   THE MAILBOX — tables, inline styles, no class, no flex, no grid
   ══════════════════════════════════════════════════════════════════════════ */

/** How wide an article's picture is when it sits beside the words. */
const ARTICLE_PIC = 180;

/** Merge-fill, escape, then re-permit the six inline tags. The mailbox's own
 *  rule, from the one module that holds it (`emailBox.ts`). */
const t = (text: unknown, c: EmailRenderContext): string =>
  inlineSafe(esc(fill(String(text ?? ""), c.merge as never, c.mode as never)));

/** `data-edit="path"`, only while editing — a sent email carries no markers. */
const editAttr = (path: string, c: EmailRenderContext, placeholder?: string): string =>
  (c.mode !== "edit" ? "" : ` data-edit="${esc(path)}"${placeholder ? ` data-placeholder="${esc(placeholder)}"` : ""}`);

/**
 * IA POSTS, IN AN INBOX.
 *
 * ── THE SHAPE A STORED NEWSLETTER ALREADY HAS IS UNCHANGED ────────────────
 * With the props the old two-control widget wrote — `items` and nothing else —
 * this draws byte for byte what `emArticles` drew: one fluid row per article,
 * a 180px picture column and the words beside it, stacking on a phone. That is
 * not a claim, it is `test/builder-phone-width.test.mjs`'s existing assertion
 * and the thirty golden fixtures, none of which were touched.
 *
 * Everything the deeper panel adds is layered ON TOP of that, each piece
 * reachable only by a control the author has actually moved.
 */
export const emailIaPosts: FamilyEmailRenderer = (w: Widget, c: EmailRenderContext) => {
  const p = (w.props || {}) as Record<string, unknown>;
  const s = iaPostsSettings(p, MAILBOX_SURFACE);
  const skin = s.theme === "dark" ? DARK : LIGHT;
  const preset = PRESET[s.preset as keyof typeof PRESET] || PRESET.classic;
  const ink = skin.ink || String(c.ink ?? "#111827");
  const accent = String(c.accent ?? "#2563EB");
  const head = fontStack(String(c.headingFont ?? ""));
  const body = fontStack(String(c.bodyFont ?? ""));
  const editing = c.mode === "edit";

  const all = iaPosts(p, s.perPage, false);
  const shown = editing
    ? all
    : all.filter((a) => a.title.trim() || a.excerpt.trim());
  /* A FRESH DROP MUST SHOW THE AUTHOR SOMETHING, and a SEND must not.
     The widget holds no posts until somebody brings them in, and a blank where
     a widget was is the thing an author reports as broken. In `view` — which is
     the real send — an empty one is nothing at all, because a reader must never
     be posted an instruction meant for the person who wrote it. */
  if (!shown.length) {
    return editing
      ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 22px 0;">`
        + `<tr><td style="padding:14px;border:1px dashed #CBD5E1;border-radius:6px;`
        + `font-family:${body};font-size:13px;color:#5A7A8A;">`
        + `Bring your latest posts in with &ldquo;From the website&rdquo;, or type them here.`
        + `</td></tr></table>`
      : "";
  }

  /* THE CARD'S OWN CHROME, and it is drawn only when the author asked for it.
     A stored newsletter has no radius, no padding and the `classic` preset, so
     `chrome` is the empty string and the markup is exactly what it always was. */
  const chrome = (s.radius !== 8 || s.padding !== 14 || s.preset !== "classic" || s.theme !== "light")
    ? `padding:${s.padding}px;border-radius:${s.radius}px;background:${skin.paper};`
      + (preset.border ? `border:1px solid ${skin.line};` : "")
    : "";

  const one = (a: IaPost, i: number) => {
    const titleHtml = s.showTitle
      ? `<${s.titleTag === "p" ? "div" : s.titleTag} style="font-family:${head};font-size:${s.titleSize}px;font-weight:${esc(s.titleWeight)};line-height:1.3;color:${ink};margin:0 0 6px 0;"${editAttr(`items.${i}.title`, c, "Headline")}>${t(a.title, c)}</${s.titleTag === "p" ? "div" : s.titleTag}>`
      : "";
    const excerptHtml = s.showExcerpt
      ? `<div style="font-family:${body};font-size:${s.excerptSize}px;line-height:1.6;color:#374151;margin:0 0 8px 0;"${editAttr(`items.${i}.excerpt`, c, "A line or two about it…")}>${t(trimWords(a.excerpt, s.excerptLength), c)}</div>`
      : "";
    const link = s.showReadMore && a.url
      ? `<a href="${esc(a.url)}" style="font-family:${body};font-size:${s.excerptSize}px;font-weight:600;color:${accent};text-decoration:none;"${
        a.linkLabel ? editAttr(`items.${i}.linkLabel`, c) : editAttr("read_more_text", c, "Read")
      }>${t(a.linkLabel || s.readMoreText, c)} &rarr;</a>`
      : "";
    const pic = s.imageMode !== "none" && a.image
      ? `<img src="${esc(a.image)}" alt="${esc(altTextFor({ alt: a.alt, caption: a.title, src: a.image }))}" width="${s.beside ? ARTICLE_PIC : CONTENT_WIDTH}" style="display:block;width:100%;max-width:${s.beside ? ARTICLE_PIC : CONTENT_WIDTH}px;height:auto;border:0;border-radius:6px;" />`
      : "";
    const words = `${titleHtml}${excerptHtml}${link}`;
    /* CARD GAP, in a mailbox, is the space UNDER each article. One column is
       what a newsletter has always been, so there is no gutter to put it in;
       the vertical rhythm is the honest reading of the same control, and its
       starting value is the 22px those stored documents already carry. */
    const margin = `margin:0 0 ${s.cardGap}px 0;`;
    if (!pic || !s.beside) {
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="${margin}">`
        + `<tr><td style="padding:0 0 10px 0;${chrome}">${pic}</td></tr><tr><td${chrome ? ` style="${chrome}"` : ""}>${words}</td></tr></table>`;
    }
    return fluidRow(
      [{ max: ARTICLE_PIC, html: pic }, { max: CONTENT_WIDTH - ARTICLE_PIC, html: words, cellStyle: chrome || undefined }],
      { margin },
    );
  };

  /* COLUMNS, and the ONE mechanism a mailbox has for them. `fluidRow` is the
     platform's only way of putting two things side by side in an inbox, and it
     stacks on a phone by itself with no media query. One column — the stored
     default — never builds a row at all, so nothing a customer has changes. */
  let cards: string;
  if (s.columns <= 1 || shown.length <= 1) {
    cards = shown.map(one).join("");
  } else {
    const per = Math.max(1, Math.min(4, s.columns));
    const max = Math.floor((CONTENT_WIDTH - s.cardGap * (per - 1)) / per);
    const rows: string[] = [];
    for (let i = 0; i < shown.length; i += per) {
      rows.push(fluidRow(
        shown.slice(i, i + per).map((a, j) => ({ max, html: one(a, i + j) })),
        { margin: "margin:0 0 4px 0;", gutter: s.cardGap },
      ));
    }
    cards = rows.join("");
  }

  const archive = s.archiveLink
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" style="padding:4px 0 0 0;">`
      + `<a href="${esc(s.archiveLink)}" style="font-family:${body};font-size:${s.excerptSize}px;font-weight:600;color:${accent};text-decoration:none;"${editAttr("archive_label", c, "View all articles")}>${t(s.archiveLabel, c)} &rarr;</a>`
      + `</td></tr></table>`
    : "";

  return cards + archive;
};

/**
 * …AND THE PLAIN-TEXT HALF is LUMEN's, not the Portal's: this surface is the
 * builder's own preview. `LUMEN/src/lib/emailFamilies/f7-data-lists.js` carries
 * both halves for the send, which is what `emailFamilyContract()` asserts.
 */
