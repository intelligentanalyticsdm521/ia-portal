/**
 * families/f7-data-lists/shared.ts — THE QUERY BLOCK AND THE PAGINATION BLOCK,
 * written once.
 *
 * BUILDER_FULL_WIDGET_PLAN_2026-09-19 §C.2 puts these eleven widgets in one
 * family for exactly one reason: *"All share one query block and one pagination
 * block."* Posts, Portfolio, Loop Grid, Archive Posts and Search each register
 * Elementor's own Query and Pagination sections with a different PREFIX on every
 * key — `posts_post_type`, `post_query_post_type`, `search_query_post_type` —
 * and the section names and labels are identical in all of them. So the block is
 * written here once and stamped with each widget's prefix, and the five cannot
 * drift into five slightly different Query tabs.
 *
 * ── EVERY LABEL, OPTION AND DEFAULT BELOW IS ELEMENTOR'S OWN ───────────────
 * Read off `BUILDER_WIDGET_CATALOG_2026-09-17.pro.json`, the 2026-09-17 scrape
 * of a real install, never remembered. Where a control is marked `responsive`
 * there, it is marked `responsive` here; `deviceKey()` in definitionControls is
 * the one place the `_tablet` / `_mobile` spelling exists.
 *
 * ── WHY ONLY THE CORE CONTROLS ────────────────────────────────────────────
 * Elementor's Posts widget has 799 settings keys. A panel that offered all of
 * them would be a settings screen, not a builder. The rule is the same
 * judgement `widgets/icons.ts` already made and wrote down: the controls a
 * person actually uses — what to show, how many, what order, how it is paged —
 * with Elementor's own labels on them. Everything left out is left out, not
 * renamed.
 *
 * ── WHAT THE CANVAS DRAWS ─────────────────────────────────────────────────
 * None of these widgets hold their own content: they read the website's. The
 * builder has no website in front of it, so — exactly as Elementor's own editor
 * does — the canvas draws the SHAPE with stand-in rows, and says in one plain
 * sentence where the real ones come from. `SAMPLE_POSTS` is that stand-in. It
 * names no client and no real business (`feedback_no_real_client_data_in_dev`).
 */
import type { WidgetControl } from "../../../registry";
import { esc } from "../../../esc";

/** `null`/`undefined` become the empty string, everywhere in this family. */
export const str = (v: unknown): string => (v == null ? "" : String(v));

/** Elementor's switcher stores "yes"; a checkbox writes a boolean. One reader. */
export const on = (v: unknown): boolean => v === true || v === "yes";

/** A number a control may have left blank. */
export const num = (v: unknown, dflt: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : dflt;
};

/* ══════════════════════════════════════════════════════════════════════════
   The option lists, copied from the machine file
   ══════════════════════════════════════════════════════════════════════════ */

/** `posts_post_type` — Elementor's Source list, minus the post types a
 *  WordPress install only has when a plugin registers them. `post` and `page`
 *  are core; the three query modes are Elementor's own. */
export const SOURCE_OPTIONS = [
  { value: "post", label: "Posts" },
  { value: "page", label: "Pages" },
  { value: "by_id", label: "Manual Selection" },
  { value: "current_query", label: "Current Query" },
  { value: "related", label: "Related" },
];

export const ORDERBY_OPTIONS = [
  { value: "post_date", label: "Date" },
  { value: "post_title", label: "Title" },
  { value: "menu_order", label: "Menu Order" },
  { value: "modified", label: "Last Modified" },
  { value: "comment_count", label: "Comment Count" },
  { value: "rand", label: "Random" },
];

export const ORDER_OPTIONS = [
  { value: "asc", label: "ASC" },
  { value: "desc", label: "DESC" },
];

export const COLUMN_OPTIONS = ["1", "2", "3", "4", "5", "6"].map((v) => ({ value: v, label: v }));

export const HTML_TAG_OPTIONS = ["h1", "h2", "h3", "h4", "h5", "h6", "div", "span", "p"]
  .map((v) => ({ value: v, label: v.toUpperCase() }));

export const SIZE_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
  { value: "xl", label: "XL" },
  { value: "xxl", label: "XXL" },
];

export const IMAGE_RESOLUTION_OPTIONS = [
  { value: "thumbnail", label: "Thumbnail" },
  { value: "medium", label: "Medium" },
  { value: "medium_large", label: "Medium Large" },
  { value: "large", label: "Large" },
  { value: "full", label: "Full" },
];

/** `pagination_type`. The blank one is Elementor's own "None". */
export const PAGINATION_OPTIONS = [
  { value: "", label: "None" },
  { value: "numbers", label: "Numbers" },
  { value: "prev_next", label: "Previous/Next" },
  { value: "numbers_and_prev_next", label: "Numbers + Previous/Next" },
  { value: "load_more_on_click", label: "Load on Click" },
  { value: "load_more_infinite_scroll", label: "Infinite Scroll" },
];

/**
 * SEARCH SPELLS ITS OWN, and the four words are not the same four.
 *
 * `pagination_type_options` on the Search widget offers `none / numbers /
 * previous_next / numbers_previous_next` — no underscore-and, no load-more —
 * where every other widget's `pagination_type` offers `'' / numbers /
 * prev_next / numbers_and_prev_next / load_more_on_click /
 * load_more_infinite_scroll`. Copied from the machine file, both of them,
 * because a value the engine does not know is a setting it drops on publish.
 */
export const SEARCH_PAGINATION_OPTIONS = [
  { value: "none", label: "None" },
  { value: "numbers", label: "Numbers" },
  { value: "previous_next", label: "Previous/Next" },
  { value: "numbers_previous_next", label: "Numbers + Previous/Next" },
];

/** The pagination styles that need NO JavaScript on the published page — the
 *  ones that are ordinary links. Only the two load-more styles need a script. */
export const PAGINATION_WITHOUT_JS = new Set([
  "", "none", "numbers", "prev_next", "numbers_and_prev_next", "previous_next", "numbers_previous_next",
]);

export const ALIGN_OPTIONS = [
  { value: "start", label: "Left" },
  { value: "center", label: "Centre" },
  { value: "end", label: "Right" },
];

/* ══════════════════════════════════════════════════════════════════════════
   THE QUERY BLOCK — one definition, five prefixes
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Elementor's Query section, for a widget that spells its keys `<prefix>…`.
 *
 * Posts and Portfolio use `posts_`, Loop Grid uses `post_query_`, Search uses
 * `search_query_`. The SECTION is called "Query" in every one of them.
 */
export function queryControls(prefix: string, withOffset = true): WidgetControl[] {
  const core: WidgetControl[] = [
    { key: `${prefix}post_type`, label: "Source", type: "select", tab: "content", section: "Query", options: SOURCE_OPTIONS },
    { key: `${prefix}orderby`, label: "Order By", type: "select", tab: "content", section: "Query", options: ORDERBY_OPTIONS },
    { key: `${prefix}order`, label: "Order", type: "select", tab: "content", section: "Query", options: ORDER_OPTIONS },
  ];
  /* SEARCH'S QUERY SECTION IS SHORTER, and the fixture is what said so.
     `search_query_offset` and `search_query_avoid_duplicates` do not exist on
     the Search widget — its query is the visitor's words, so there is nothing
     to skip past and nothing shown further up to avoid. Declaring them anyway
     would have been two fields the author fills in that the page engine drops
     on publish, which is the whole reason the family test asks this. Caught by
     `test/families-f7-data-lists.test.mjs` on 2026-09-19, not by reading. */
  if (!withOffset) return core;
  return [
    ...core,
    { key: `${prefix}offset`, label: "Offset", type: "number", tab: "content", section: "Query" },
    {
      key: `${prefix}avoid_duplicates`, label: "Avoid Duplicates", type: "toggle", tab: "content", section: "Query",
      help: "Skip anything already shown further up the page",
    },
  ];
}

/** The starting values for the same block — Elementor's own defaults. */
export function queryDefaults(prefix: string, withOffset = true): Record<string, unknown> {
  const core: Record<string, unknown> = {
    [`${prefix}post_type`]: "post",
    [`${prefix}orderby`]: "post_date",
    [`${prefix}order`]: "desc",
  };
  if (!withOffset) return core;
  return { ...core, [`${prefix}offset`]: 0, [`${prefix}avoid_duplicates`]: "" };
}

/* ══════════════════════════════════════════════════════════════════════════
   THE PAGINATION BLOCK — one definition, four widgets
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Elementor's Pagination section.
 *
 * Posts, Loop Grid and Archive Posts share it key for key. SEARCH DOES NOT: it
 * spells the type key `pagination_type_options`, it has no `pagination_align`
 * and no `pagination_page_limit`, and its section is called "Additional
 * Settings". So it passes `full: false` and gets the three keys it really has.
 * Two of the four keys it does not have were declared here first and the family
 * test went red naming them; this is the fix, not a comment about the fix.
 */
export function paginationControls(typeKey = "pagination_type", section = "Pagination"): WidgetControl[] {
  const full = typeKey === "pagination_type";
  const rows: WidgetControl[] = [
    {
      key: typeKey, label: full ? "Pagination" : "Type", type: "select", tab: "content", section,
      options: full ? PAGINATION_OPTIONS : SEARCH_PAGINATION_OPTIONS,
    },
  ];
  if (full) rows.push({ key: "pagination_page_limit", label: "Page Limit", type: "number", tab: "content", section });
  rows.push(
    { key: "pagination_prev_label", label: "Previous Label", type: "text", tab: "content", section },
    { key: "pagination_next_label", label: "Next Label", type: "text", tab: "content", section },
  );
  if (full) rows.push({ key: "pagination_align", label: "Alignment", type: "select", tab: "content", section, options: ALIGN_OPTIONS });
  return rows;
}

export function paginationDefaults(typeKey = "pagination_type"): Record<string, unknown> {
  const full = typeKey === "pagination_type";
  const base: Record<string, unknown> = {
    [typeKey]: full ? "" : "none",
    pagination_prev_label: "Previous",
    pagination_next_label: "Next",
  };
  if (!full) return base;
  base.pagination_prev_label = "« Previous";
  base.pagination_next_label = "Next »";
  return { ...base, pagination_page_limit: 5, pagination_align: "center" };
}

/* ══════════════════════════════════════════════════════════════════════════
   What the canvas shows instead of a website it cannot see
   ══════════════════════════════════════════════════════════════════════════ */

export interface SamplePost { title: string; excerpt: string; meta: string; }

/**
 * THREE STAND-IN ROWS.
 *
 * Elementor's editor draws its own placeholder posts for the same reason: the
 * author is arranging a shape, and the shape needs something in it. These name
 * no business and no person (`feedback_no_real_client_data_in_dev`), and they
 * never reach a published page — the page engine fills the real ones in.
 */
export const SAMPLE_POSTS: SamplePost[] = [
  { title: "The first thing you published", excerpt: "The opening lines of the piece show here, as far as the length you set.", meta: "12 March" },
  { title: "The one before that", excerpt: "Each card carries the picture, the title and the first few lines.", meta: "4 March" },
  { title: "And the one before that", excerpt: "Change how many show, and in what order, in the panel on the right.", meta: "26 February" },
];

/** The grey block that stands in for a post's picture. */
export function samplePicture(height = 90): string {
  return `<div class="bx-imgdrop" style="height:${height}px;border-radius:6px;background:#E2E8F0"></div>`;
}

/**
 * THE ONE PLAIN SENTENCE, drawn only while editing.
 *
 * Every widget in this family reads the website rather than holding its own
 * words, and an author who does not know that thinks the widget is broken. The
 * sentence says where the content comes from, in a business owner's words, and
 * it is never part of the published page.
 */
export function fromTheSite(mode: string, sentence: string): string {
  if (mode !== "edit") return "";
  return `<div class="bx-card-note" style="margin-top:8px;font-size:11px;color:#5A7A8A">${esc(sentence)}</div>`;
}

/** The wrapper every list in this family draws inside. */
export function grid(columns: number, gap: number, inner: string): string {
  return `<div class="bx-f7-grid" style="display:grid;grid-template-columns:repeat(${Math.max(1, Math.min(6, columns))},1fr);gap:${gap}px">${inner}</div>`;
}

/**
 * THE CARD GRID — Posts and Archive Posts draw the same one.
 *
 * Elementor registers three SKINS for each of them (Classic, Cards, Full
 * Content) and we ship the CLASSIC one, which is Elementor's own default. The
 * other two are written in the handoff as a gap, not renamed into something
 * else: the widgets here carry `_skin` at its default value so the published
 * page is explicit about which one it is.
 *
 * `o` is the author's choices, already read off whichever prefix the widget
 * spells them with, so this function never has to know which widget called it.
 */
export interface CardGridOptions {
  columns: number;
  count: number;
  thumbnail: string;        // top | left | right | none
  showTitle: boolean;
  titleTag: string;
  showExcerpt: boolean;
  showMeta: boolean;
  showReadMore: boolean;
  readMoreText: string;
  columnGap: number;
  rowGap: number;
  align: string;
  titleColour: string;
  excerptColour: string;
  metaColour: string;
  accent: string;
}

export function cardGrid(o: CardGridOptions): string {
  const rows = Array.from({ length: Math.max(1, Math.min(9, o.count)) },
    (_, i) => SAMPLE_POSTS[i % SAMPLE_POSTS.length]);
  const side = o.thumbnail === "left" || o.thumbnail === "right";
  const cards = rows.map((s) => {
    const pic = o.thumbnail === "none" ? "" : samplePicture(side ? 64 : 90);
    const body = `<div style="flex:1 1 auto;min-width:0">`
      + (o.showTitle
        ? `<${o.titleTag} class="bx-h" style="margin:0 0 4px;font-size:14px;color:${esc(o.titleColour)}">${esc(s.title)}</${o.titleTag}>`
        : "")
      + (o.showMeta ? `<div style="font-size:11px;color:${esc(o.metaColour)};margin-bottom:4px">${esc(s.meta)}</div>` : "")
      + (o.showExcerpt ? `<p class="bx-p" style="margin:0;font-size:12px;color:${esc(o.excerptColour)}">${esc(s.excerpt)}</p>` : "")
      + (o.showReadMore
        ? `<a href="#" style="display:inline-block;margin-top:6px;font-size:12px;text-decoration:none;color:${esc(o.accent)}">${esc(o.readMoreText)}</a>`
        : "")
      + `</div>`;
    return `<article class="bx-f7-card" style="display:flex;flex-direction:${
      side ? (o.thumbnail === "right" ? "row-reverse" : "row") : "column"};gap:10px;text-align:${esc(o.align || "left")}">`
      + (side ? `<div style="flex:0 0 34%">${pic}</div>` : pic) + body + `</article>`;
  }).join("");
  return `<div class="bx-f7-grid" style="display:grid;grid-template-columns:repeat(${
    Math.max(1, Math.min(6, o.columns))},1fr);column-gap:${o.columnGap}px;row-gap:${o.rowGap}px">${cards}</div>`;
}

/** Elementor's pagination row, drawn as real links so it works with no script. */
export function paginationRow(p: Record<string, unknown>, typeKey = "pagination_type"): string {
  const type = str(p[typeKey]);
  if (!type || type === "none") return "";
  const align = str(p.pagination_align) || "center";
  const justify = align === "start" ? "flex-start" : align === "end" ? "flex-end" : "center";
  const numbers = type.startsWith("numbers")
    ? `<a href="#" class="bx-page-n" style="padding:4px 9px;border:1px solid #CBD5E1;border-radius:4px;text-decoration:none">1</a>`
      + `<a href="#" class="bx-page-n" style="padding:4px 9px;border:1px solid #CBD5E1;border-radius:4px;text-decoration:none">2</a>`
    : "";
  const prevNext = type.includes("prev_next") || type.includes("previous_next")
    ? `<a href="#" class="bx-page-p" style="text-decoration:none">${esc(str(p.pagination_prev_label) || "« Previous")}</a>`
      + `<a href="#" class="bx-page-x" style="text-decoration:none">${esc(str(p.pagination_next_label) || "Next »")}</a>`
    : "";
  const loadMore = type.startsWith("load_more")
    ? `<span class="bx-button" style="padding:6px 14px">Load More</span>`
    : "";
  return `<div class="bx-f7-pagination" style="display:flex;gap:8px;justify-content:${justify};align-items:center;margin-top:14px;font-size:12px">${prevNext}${numbers}${loadMore}</div>`;
}
