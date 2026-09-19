/**
 * families/f7-data-lists/themePostExcerpt.ts — **Post Excerpt**, Elementor
 * `theme-post-excerpt`.
 *
 * The smallest widget in the family and the plainest: one content section
 * called "Content" holding a single `excerpt` control, and one style section
 * called "Style" holding `align` and the two text colours. Straight off
 * `BUILDER_WIDGET_CATALOG_2026-09-17.pro.json`.
 */
import type { Widget } from "../../../model";
import { esc, type RenderContext } from "../../../render";
import { bar, pictureFrom } from "../../../pictures";
import { editRun } from "../../text";
import type { FamilyRenderer, FamilyWidgetDef } from "../types";
import { fromTheSite, str } from "./shared";

export const THEME_POST_EXCERPT_DEF: FamilyWidgetDef = {
  kind: "theme_post_excerpt",
  label: "Post Excerpt",
  description: "The short summary of whichever story is being read.",
  icon: "TextQuote",
  picture: pictureFrom(bar(8, 12, 48) + bar(8, 21, 48) + bar(8, 30, 30)),
  category: "Site",
  builders: ["website"],
  tier: "pro",
  defaults: { excerpt: "", align: "", title_color: "", link_color: "" },
  controls: [
    {
      key: "excerpt", label: "Excerpt", type: "textarea", tab: "content", section: "Content",
      help: "Leave it empty to use each story's own summary.",
    },
    { key: "align", label: "Alignment", type: "select", tab: "style", section: "Style", responsive: true, options: [
      { value: "start", label: "Left" }, { value: "center", label: "Centre" },
      { value: "end", label: "Right" }, { value: "justify", label: "Justified" }] },
    { key: "title_color", label: "Text Color", type: "colour", tab: "style", section: "Style" },
    { key: "link_color", label: "Link Color", type: "colour", tab: "style", section: "Style" },
  ],
};

export const renderThemePostExcerpt: FamilyRenderer = (w: Widget, ctx: RenderContext) => {
  const p: any = w.props || {};
  const align = str(p.align);
  const flow = align === "center" ? "center" : align === "end" ? "right" : align === "justify" ? "justify" : "left";
  const words = "The first few lines of the story show here, as far as the length the site sets.";
  const typed = str(p.excerpt).trim();
  return `<div class="bx-f7-excerpt" style="text-align:${flow};color:${esc(str(p.title_color) || ctx.ink)}">`
    + (ctx.mode === "edit"
      ? editRun("excerpt", p.excerpt, "bx-p", words, ctx, "p")
      : `<p class="bx-p" style="margin:0">${esc(typed || words)}</p>`)
    + fromTheSite(ctx.mode, "Each story fills this in with its own summary.")
    + `</div>`;
};
