/**
 * families/f7-data-lists/archivePosts.ts — **Archive Posts**, Elementor
 * `archive-posts`.
 *
 * Posts, with one difference that matters: it has NO Query section. It shows
 * whatever list the visitor asked for — a category, a tag, a month — so the
 * query is the page's, not the widget's. Its sections are Layout, Pagination
 * and Advanced, and its Layout keys carry the `archive_classic_` prefix.
 *
 * The skin rule is the same as Posts: the CLASSIC skin, which is Elementor's
 * own default, with `_skin` fixed at `archive_classic`. Cards and Full Content
 * are a named gap in the handoff.
 */
import type { Widget } from "../../../model";
import { esc, type RenderContext } from "../../../render";
import { bar, pictureFrom, solid } from "../../../pictures";
import type { FamilyRenderer, FamilyWidgetDef } from "../types";
import {
  cardGrid, COLUMN_OPTIONS, fromTheSite, HTML_TAG_OPTIONS, num, on,
  paginationControls, paginationDefaults, paginationRow, str,
} from "./shared";

export const ARCHIVE_POSTS_DEF: FamilyWidgetDef = {
  kind: "archive_posts",
  label: "Archive Posts",
  description: "The stories of whichever list is being looked at — a category, a tag, a month.",
  icon: "LibraryBig",
  picture: pictureFrom(solid(6, 8, 22, 10) + bar(6, 22, 22) + bar(6, 29, 14)
    + solid(36, 8, 22, 10) + bar(36, 22, 22) + bar(36, 29, 14)),
  category: "Site",
  builders: ["website"],
  tier: "pro",
  defaults: {
    _skin: "archive_classic",
    archive_classic_columns: "3", archive_classic_thumbnail: "top",
    archive_classic_show_title: "yes", archive_classic_title_tag: "h3",
    archive_classic_show_excerpt: "yes", archive_classic_excerpt_length: 100,
    archive_classic_show_read_more: "yes", archive_classic_read_more_text: "Read More »",
    archive_classic_column_gap: 30, archive_classic_row_gap: 35,
    archive_classic_title_color: "", archive_classic_excerpt_color: "", archive_classic_meta_color: "",
    nothing_found_message: "It seems we can't find what you're looking for.",
    ...paginationDefaults(),
  },
  controls: [
    { key: "archive_classic_columns", label: "Columns", type: "select", tab: "content", section: "Layout", responsive: true, options: COLUMN_OPTIONS },
    { key: "archive_classic_thumbnail", label: "Image Position", type: "select", tab: "content", section: "Layout", options: [
      { value: "top", label: "Above the words" }, { value: "left", label: "Left of the words" },
      { value: "right", label: "Right of the words" }, { value: "none", label: "No picture" }] },
    { key: "archive_classic_show_title", label: "Title", type: "toggle", tab: "content", section: "Layout", help: "Show each title" },
    { key: "archive_classic_title_tag", label: "Title HTML Tag", type: "select", tab: "content", section: "Layout", options: HTML_TAG_OPTIONS },
    { key: "archive_classic_show_excerpt", label: "Excerpt", type: "toggle", tab: "content", section: "Layout", help: "Show the first few lines" },
    { key: "archive_classic_excerpt_length", label: "Excerpt Length", type: "number", tab: "content", section: "Layout" },
    { key: "archive_classic_show_read_more", label: "Read More", type: "toggle", tab: "content", section: "Layout", help: "Show the link at the bottom of each" },
    { key: "archive_classic_read_more_text", label: "Read More Text", type: "text", tab: "content", section: "Layout" },
    ...paginationControls(),
    { key: "nothing_found_message", label: "Nothing Found Message", type: "textarea", tab: "content", section: "Advanced" },
    { key: "archive_classic_column_gap", label: "Columns Gap", type: "number", tab: "style", section: "Layout", responsive: true },
    { key: "archive_classic_row_gap", label: "Rows Gap", type: "number", tab: "style", section: "Layout", responsive: true },
    { key: "archive_classic_title_color", label: "Color", type: "colour", tab: "style", section: "Content" },
    { key: "archive_classic_meta_color", label: "Color", type: "colour", tab: "style", section: "Content" },
    { key: "archive_classic_excerpt_color", label: "Color", type: "colour", tab: "style", section: "Content" },
  ],
};

export const renderArchivePosts: FamilyRenderer = (w: Widget, ctx: RenderContext) => {
  const p: any = w.props || {};
  return cardGrid({
    columns: num(p.archive_classic_columns, 3),
    count: 6,
    thumbnail: str(p.archive_classic_thumbnail) || "top",
    showTitle: on(p.archive_classic_show_title),
    titleTag: str(p.archive_classic_title_tag) || "h3",
    showExcerpt: on(p.archive_classic_show_excerpt),
    showMeta: true,
    showReadMore: on(p.archive_classic_show_read_more),
    readMoreText: str(p.archive_classic_read_more_text) || "Read More »",
    columnGap: num(p.archive_classic_column_gap, 30),
    rowGap: num(p.archive_classic_row_gap, 35),
    align: "",
    titleColour: str(p.archive_classic_title_color) || ctx.ink,
    excerptColour: str(p.archive_classic_excerpt_color) || "#5A7A8A",
    metaColour: str(p.archive_classic_meta_color) || "#94A3B8",
    accent: ctx.accent,
  })
    + paginationRow(p)
    + fromTheSite(ctx.mode, "There is nothing to choose here: the list shows whatever category or month the visitor asked for.")
    + (ctx.mode === "edit"
      ? `<div class="bx-card-note" style="font-size:11px;color:#94A3B8">When it is empty a visitor reads: ${
        esc(str(p.nothing_found_message) || "It seems we can't find what you're looking for.")}</div>`
      : "");
};
