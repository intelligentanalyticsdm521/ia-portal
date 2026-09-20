/**
 * families/f7-data-lists/posts.ts — **Posts**, Elementor `posts`.
 *
 * Three content sections in the machine file — Layout, Query, Pagination — and
 * the last two are the family's shared blocks, so only Layout is written here.
 *
 * ── THE CLASSIC SKIN, AND WHY ONLY IT ─────────────────────────────────────
 * Elementor registers this widget three times over: every Layout control
 * appears once as `classic_…`, once as `cards_…` and once as `full_content_…`,
 * and the `_skin` select decides which set the page reads. That is 799 settings
 * keys, and it is why the plan's §A.1 calls Posts, Archive Posts and Portfolio
 * "one build with a skin select" rather than three.
 *
 * We ship the CLASSIC skin — Elementor's own default, the one a panel opens on
 * — with Elementor's own keys, labels and defaults, and `_skin` fixed at
 * `classic` so the published page says which one it is. The other two skins are
 * a NAMED GAP in the handoff, not a rename: offering a `_skin` select whose
 * other two settings had no controls behind them would be a switch that quietly
 * throws the author's Layout choices away.
 */
import type { Widget } from "../../../model";
import type { RenderContext } from "../../../render";
import { bar, pictureFrom, solid } from "../../../pictures";
import type { FamilyRenderer, FamilyWidgetDef } from "../types";
import {
  cardGrid, COLUMN_OPTIONS, fromTheSite, HTML_TAG_OPTIONS, num, on,
  paginationControls, paginationDefaults, paginationRow, queryControls, queryDefaults, str,
} from "./shared";

export const POSTS_DEF: FamilyWidgetDef = {
  kind: "posts",
  label: "Posts",
  description: "A grid of your stories, newest first, each with its picture and first few lines.",
  icon: "Newspaper",
  picture: pictureFrom(solid(6, 6, 24, 12) + bar(6, 21, 24) + bar(6, 28, 16)
    + solid(34, 6, 24, 12) + bar(34, 21, 24) + bar(34, 28, 16)),
  category: "Pro",
  builders: ["website", "landing"],
  tier: "pro",
  defaults: {
    _skin: "classic",
    classic_columns: "3", classic_posts_per_page: 6, classic_thumbnail: "top",
    classic_show_title: "yes", classic_title_tag: "h3",
    classic_show_excerpt: "yes", classic_excerpt_length: 100,
    classic_show_read_more: "yes", classic_read_more_text: "Read More »",
    classic_column_gap: 30, classic_row_gap: 35, classic_alignment: "",
    classic_title_color: "", classic_excerpt_color: "", classic_meta_color: "",
    ...queryDefaults("posts_"),
    ...paginationDefaults(),
  },
  controls: [
    { key: "classic_columns", label: "Columns", type: "select", tab: "content", section: "Layout", responsive: true, options: COLUMN_OPTIONS },
    { key: "classic_posts_per_page", label: "Posts Per Page", type: "number", tab: "content", section: "Layout" },
    { key: "classic_thumbnail", label: "Image Position", type: "select", tab: "content", section: "Layout", options: [
      { value: "top", label: "Above the words" }, { value: "left", label: "Left of the words" },
      { value: "right", label: "Right of the words" }, { value: "none", label: "No picture" }] },
    { key: "classic_show_title", label: "Title", type: "toggle", tab: "content", section: "Layout", help: "Show each title" },
    { key: "classic_title_tag", label: "Title HTML Tag", type: "select", tab: "content", section: "Layout", options: HTML_TAG_OPTIONS },
    { key: "classic_show_excerpt", label: "Excerpt", type: "toggle", tab: "content", section: "Layout", help: "Show the first few lines" },
    { key: "classic_excerpt_length", label: "Excerpt Length", type: "number", tab: "content", section: "Layout" },
    { key: "classic_show_read_more", label: "Read More", type: "toggle", tab: "content", section: "Layout", help: "Show the link at the bottom of each" },
    { key: "classic_read_more_text", label: "Read More Text", type: "text", tab: "content", section: "Layout" },
    ...queryControls("posts_"),
    ...paginationControls(),
    { key: "classic_column_gap", label: "Columns Gap", type: "number", tab: "style", section: "Layout", responsive: true },
    { key: "classic_row_gap", label: "Rows Gap", type: "number", tab: "style", section: "Layout", responsive: true },
    { key: "classic_alignment", label: "Alignment", type: "select", tab: "style", section: "Layout", options: [
      { value: "left", label: "Left" }, { value: "center", label: "Centre" }, { value: "right", label: "Right" }] },
    { key: "classic_title_color", label: "Color", type: "colour", tab: "style", section: "Content" },
    { key: "classic_meta_color", label: "Color", type: "colour", tab: "style", section: "Content" },
    { key: "classic_excerpt_color", label: "Color", type: "colour", tab: "style", section: "Content" },
  ],
};

export const renderPosts: FamilyRenderer = (w: Widget, ctx: RenderContext) => {
  const p: any = w.props || {};
  return cardGrid({
    columns: num(p.classic_columns, 3),
    count: num(p.classic_posts_per_page, 6),
    thumbnail: str(p.classic_thumbnail) || "top",
    showTitle: on(p.classic_show_title),
    titleTag: str(p.classic_title_tag) || "h3",
    showExcerpt: on(p.classic_show_excerpt),
    showMeta: true,
    showReadMore: on(p.classic_show_read_more),
    readMoreText: str(p.classic_read_more_text) || "Read More »",
    columnGap: num(p.classic_column_gap, 30),
    rowGap: num(p.classic_row_gap, 35),
    align: str(p.classic_alignment),
    titleColour: str(p.classic_title_color) || ctx.ink,
    excerptColour: str(p.classic_excerpt_color) || "#5A7A8A",
    metaColour: str(p.classic_meta_color) || "#94A3B8",
    accent: ctx.accent,
  })
    + paginationRow(p)
    + fromTheSite(ctx.mode, "Your real stories fill these cards in, newest first unless you change the order.");
};
