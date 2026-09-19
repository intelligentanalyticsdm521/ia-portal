/**
 * families/f7-data-lists/sitemap.ts — **Sitemap**, Elementor `sitemap`.
 *
 * One content section called "Sitemap", holding the repeater of blocks
 * (`sitemap_items` — each one a heading and the list under it), how many
 * columns they sit in, what the headings are tagged as, and whether the links
 * are marked nofollow. A second content section, "Additional Options", holds
 * what to leave out. One style section, "List".
 *
 * Nothing here needs JavaScript on the published page: it is headings and
 * ordinary links.
 */
import type { Widget } from "../../../model";
import { esc, type RenderContext } from "../../../render";
import { bar, pictureFrom } from "../../../pictures";
import type { FamilyRenderer, FamilyWidgetDef } from "../types";
import { COLUMN_OPTIONS, HTML_TAG_OPTIONS, fromTheSite, grid, num, str } from "./shared";

/** Elementor's own starting blocks: Pages, then Categories. */
const DEFAULT_BLOCKS = [
  { sitemap_type_selector: "post_type", sitemap_title: "Pages", sitemap_source_post_type: "page" },
  { sitemap_type_selector: "taxonomy", sitemap_title: "Categories", sitemap_source_taxonomy: "category" },
];

const SAMPLE_LINKS: Record<string, string[]> = {
  post_type: ["Home", "About us", "Services", "Contact"],
  taxonomy: ["News", "How-to", "Behind the scenes"],
};

export const SITEMAP_DEF: FamilyWidgetDef = {
  kind: "sitemap",
  label: "Sitemap",
  description: "Every page and category on your site, in tidy columns of links.",
  icon: "ListTree",
  picture: pictureFrom(bar(8, 8, 18, 5) + bar(8, 18, 14) + bar(8, 26, 16) + bar(8, 33, 12)
    + bar(38, 8, 18, 5) + bar(38, 18, 14) + bar(38, 26, 16)),
  category: "Site",
  builders: ["website"],
  tier: "pro",
  defaults: {
    sitemap_items: DEFAULT_BLOCKS.map((b) => ({ ...b })),
    sitemap_columns: "4", sitemap_title_tag: "h2", sitemap_add_nofollow: "",
    sitemap_exclude: "", sitemap_password_protected: "",
    sitemap_title_color: "", sitemap_list_item_color: "", sitemap_list_item_bullet_style: "disc",
  },
  controls: [
    {
      key: "sitemap_items", label: "Sitemap", type: "list", tab: "content", section: "Sitemap",
      help: "One block per list — a heading and what goes under it.",
    },
    { key: "sitemap_columns", label: "Columns", type: "select", tab: "content", section: "Sitemap", responsive: true, options: COLUMN_OPTIONS },
    { key: "sitemap_title_tag", label: "Title HTML Tag", type: "select", tab: "content", section: "Sitemap", options: HTML_TAG_OPTIONS },
    { key: "sitemap_add_nofollow", label: "Add nofollow", type: "toggle", tab: "content", section: "Sitemap", help: "Tell search engines not to follow these" },
    { key: "sitemap_password_protected", label: "Protected Posts", type: "toggle", tab: "content", section: "Additional Options", help: "Include pages that need a password" },
    { key: "sitemap_title_color", label: "Color", type: "colour", tab: "style", section: "List" },
    { key: "sitemap_list_item_color", label: "Color", type: "colour", tab: "style", section: "List" },
    { key: "sitemap_list_item_bullet_style", label: "Style", type: "select", tab: "style", section: "List", options: [
      { value: "disc", label: "Dot" }, { value: "circle", label: "Ring" },
      { value: "square", label: "Square" }, { value: "none", label: "None" }] },
  ],
};

export const renderSitemap: FamilyRenderer = (w: Widget, ctx: RenderContext) => {
  const p: any = w.props || {};
  const blocks: any[] = Array.isArray(p.sitemap_items) && p.sitemap_items.length ? p.sitemap_items : DEFAULT_BLOCKS;
  const tag = str(p.sitemap_title_tag) || "h2";
  const bullet = str(p.sitemap_list_item_bullet_style) || "disc";
  const inner = blocks.map((b) => {
    const kindOf = str(b?.sitemap_type_selector) === "taxonomy" ? "taxonomy" : "post_type";
    const links = SAMPLE_LINKS[kindOf];
    return `<div class="bx-f7-sitemap-block">`
      + `<${tag} class="bx-h bx-h3" style="margin:0 0 6px;color:${esc(str(p.sitemap_title_color) || ctx.ink)}">${
        esc(str(b?.sitemap_title) || "Pages")}</${tag}>`
      + `<ul style="margin:0;padding-left:18px;list-style:${esc(bullet)};font-size:12px">`
      + links.map((l) => `<li><a href="#" style="text-decoration:none;color:${
        esc(str(p.sitemap_list_item_color) || ctx.accent)}">${esc(l)}</a></li>`).join("")
      + `</ul></div>`;
  }).join("");
  return grid(num(p.sitemap_columns, 4), 18, inner)
    + fromTheSite(ctx.mode, "The real pages and categories of your site fill these lists in.");
};
