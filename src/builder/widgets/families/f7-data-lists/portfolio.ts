/**
 * families/f7-data-lists/portfolio.ts — **Portfolio**, Elementor `portfolio`.
 *
 * Three content sections: Layout, the family's shared Query block (prefix
 * `posts_`, the same one Posts uses), and "Filter Bar". No pagination section —
 * Elementor's Portfolio shows the lot in a masonry grid and filters it in place.
 *
 * ── THE FILTER BAR AND THE SCRIPT ─────────────────────────────────────────
 * Turning `show_filter_bar` on gives Elementor's in-place filter, which needs
 * JavaScript. Every button we draw is a real `<a href>` to that category's own
 * page, so with scripts off a visitor still gets a filtered list — the same
 * fallback Taxonomy Filter has, and for the same reason.
 */
import type { Widget } from "../../../model";
import { esc, type RenderContext } from "../../../render";
import { bar, pictureFrom, solid } from "../../../pictures";
import type { FamilyRenderer, FamilyWidgetDef } from "../types";
import {
  COLUMN_OPTIONS, fromTheSite, HTML_TAG_OPTIONS, IMAGE_RESOLUTION_OPTIONS, num, on,
  queryControls, queryDefaults, SAMPLE_POSTS, str,
} from "./shared";

const SAMPLE_TERMS = ["Everything", "Before and after", "Recent work"];

export const PORTFOLIO_DEF: FamilyWidgetDef = {
  kind: "portfolio",
  label: "Portfolio",
  description: "Your work as a wall of pictures, with buttons to narrow it down.",
  icon: "LayoutGrid",
  picture: pictureFrom(solid(6, 6, 16, 16) + solid(26, 6, 16, 22) + solid(46, 6, 12, 14)
    + solid(6, 26, 16, 8) + solid(46, 24, 12, 10)),
  category: "Pro",
  builders: ["website", "landing"],
  tier: "pro",
  defaults: {
    columns: "3", posts_per_page: 6, thumbnail_size_size: "medium", masonry: "",
    item_ratio: 0.66, show_title: "yes", title_tag: "h3",
    show_filter_bar: "", taxonomy: "category",
    item_gap: 10, column_gap: 10, row_gap: 10,
    ...queryDefaults("posts_"),
  },
  controls: [
    { key: "columns", label: "Columns", type: "select", tab: "content", section: "Layout", responsive: true, options: COLUMN_OPTIONS },
    { key: "posts_per_page", label: "Posts Per Page", type: "number", tab: "content", section: "Layout" },
    { key: "thumbnail_size_size", label: "Image Resolution", type: "select", tab: "content", section: "Layout", options: IMAGE_RESOLUTION_OPTIONS },
    { key: "masonry", label: "Masonry", type: "toggle", tab: "content", section: "Layout", help: "Let the tiles be different heights" },
    { key: "show_title", label: "Show Title", type: "toggle", tab: "content", section: "Layout", help: "Show the name over each picture" },
    { key: "title_tag", label: "Title HTML Tag", type: "select", tab: "content", section: "Layout", options: HTML_TAG_OPTIONS },
    ...queryControls("posts_"),
    { key: "show_filter_bar", label: "Show", type: "toggle", tab: "content", section: "Filter Bar", help: "Show the row of category buttons" },
    { key: "taxonomy", label: "Taxonomy", type: "select", tab: "content", section: "Filter Bar", options: [
      { value: "category", label: "Categories" }, { value: "post_tag", label: "Tags" }] },
    { key: "item_gap", label: "Item Gap", type: "number", tab: "style", section: "Items" },
    { key: "column_gap", label: "Columns Gap", type: "number", tab: "style", section: "Items" },
    { key: "row_gap", label: "Rows Gap", type: "number", tab: "style", section: "Items" },
  ],
};

export const renderPortfolio: FamilyRenderer = (w: Widget, ctx: RenderContext) => {
  const p: any = w.props || {};
  const columns = num(p.columns, 3);
  const count = Math.max(1, Math.min(9, num(p.posts_per_page, 6)));
  const ratio = Number(p.item_ratio) > 0 ? Number(p.item_ratio) : 0.66;
  const tag = str(p.title_tag) || "h3";
  const masonry = on(p.masonry);
  const tiles = Array.from({ length: count }, (_, i) => {
    const s = SAMPLE_POSTS[i % SAMPLE_POSTS.length];
    const height = Math.round(120 * ratio * (masonry && i % 3 === 1 ? 1.5 : 1));
    return `<div class="bx-f7-tile" style="position:relative;border-radius:6px;overflow:hidden;background:#E2E8F0;height:${height}px">`
      + (on(p.show_title)
        ? `<${tag} class="bx-h" style="position:absolute;left:0;right:0;bottom:0;margin:0;padding:8px;font-size:12px;`
          + `color:#FFFFFF;background:linear-gradient(transparent,rgba(11,28,36,.72))">${esc(s.title)}</${tag}>`
        : "")
      + `</div>`;
  }).join("");
  /* REAL LINKS, so the filter still works with scripts off — see the header. */
  const bar_ = on(p.show_filter_bar)
    ? `<div class="bx-f7-filterbar" style="display:flex;gap:${num(p.item_gap, 10)}px;flex-wrap:wrap;margin-bottom:10px;font-size:12px">`
      + SAMPLE_TERMS.map((t, i) => `<a href="#" style="text-decoration:none;color:${
        i === 0 ? esc(ctx.accent) : "#5A7A8A"}">${esc(t)}</a>`).join("")
      + `</div>`
    : "";
  return bar_
    + `<div class="bx-f7-grid" style="display:grid;grid-template-columns:repeat(${Math.max(1, Math.min(6, columns))},1fr);`
    + `column-gap:${num(p.column_gap, 10)}px;row-gap:${num(p.row_gap, 10)}px;align-items:start">${tiles}</div>`
    + fromTheSite(ctx.mode, "Your real pieces of work fill these tiles in.");
};
