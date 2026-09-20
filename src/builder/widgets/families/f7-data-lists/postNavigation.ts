/**
 * families/f7-data-lists/postNavigation.ts — **Post Navigation**, Elementor
 * `post-navigation`.
 *
 * One content section, called "Post Navigation" after the widget itself, with
 * Elementor's own switches: whether the little label shows, what the two labels
 * say, whether the arrows show, whether the next story's title shows, and
 * whether there is a line above and below. Four style sections — Label, Post
 * Title, Arrow, Borders — and the colour out of each is here.
 *
 * Nothing on this widget needs JavaScript: both halves are ordinary links.
 */
import type { Widget } from "../../../model";
import { esc, type RenderContext } from "../../../render";
import { bar, pictureFrom } from "../../../pictures";
import type { FamilyRenderer, FamilyWidgetDef } from "../types";
import { fromTheSite, num, on, str } from "./shared";

export const POST_NAVIGATION_DEF: FamilyWidgetDef = {
  kind: "post_navigation",
  label: "Post Navigation",
  description: "Links to the story before this one and the one after it.",
  icon: "ArrowLeftRight",
  picture: pictureFrom(bar(6, 13, 4, 4) + bar(14, 13, 18, 4) + bar(14, 22, 14, 4)
    + bar(58, 13, 4, 4) + bar(36, 13, 18, 4) + bar(40, 22, 14, 4)),
  category: "Site",
  builders: ["website"],
  tier: "pro",
  defaults: {
    show_label: "yes", prev_label: "Previous", next_label: "Next",
    show_arrow: "yes", show_title: "yes", show_borders: "yes",
    label_color: "", text_color: "", arrow_color: "", arrow_size: 20, sep_color: "",
  },
  controls: [
    { key: "show_label", label: "Label", type: "toggle", tab: "content", section: "Post Navigation", help: "Show the little word above each link" },
    { key: "prev_label", label: "Previous Label", type: "text", tab: "content", section: "Post Navigation" },
    { key: "next_label", label: "Next Label", type: "text", tab: "content", section: "Post Navigation" },
    { key: "show_arrow", label: "Arrows", type: "toggle", tab: "content", section: "Post Navigation", help: "Show the arrows" },
    { key: "show_title", label: "Post Title", type: "toggle", tab: "content", section: "Post Navigation", help: "Show the other story's title" },
    { key: "show_borders", label: "Borders", type: "toggle", tab: "content", section: "Post Navigation", help: "A line above and below" },
    { key: "label_color", label: "Color", type: "colour", tab: "style", section: "Label" },
    { key: "text_color", label: "Color", type: "colour", tab: "style", section: "Post Title" },
    { key: "arrow_color", label: "Color", type: "colour", tab: "style", section: "Arrow" },
    { key: "arrow_size", label: "Size", type: "number", tab: "style", section: "Arrow", responsive: true },
    { key: "sep_color", label: "Color", type: "colour", tab: "style", section: "Borders" },
  ],
};

export const renderPostNavigation: FamilyRenderer = (w: Widget, ctx: RenderContext) => {
  const p: any = w.props || {};
  const label = on(p.show_label);
  const arrow = on(p.show_arrow);
  const title = on(p.show_title);
  const arrowSize = num(p.arrow_size, 20);
  const arrowStyle = `color:${esc(str(p.arrow_color) || ctx.accent)};font-size:${arrowSize}px;line-height:1`;
  const side = (which: "prev" | "next") => {
    const mark = which === "prev" ? "‹" : "›";
    const words = which === "prev" ? (str(p.prev_label) || "Previous") : (str(p.next_label) || "Next");
    const story = which === "prev" ? "The story before this one" : "The story after this one";
    const body = `<span style="min-width:0">`
      + (label ? `<span style="display:block;font-size:11px;color:${esc(str(p.label_color) || "#5A7A8A")}">${esc(words)}</span>` : "")
      + (title ? `<span style="display:block;font-size:13px;color:${esc(str(p.text_color) || ctx.ink)}">${esc(story)}</span>` : "")
      + `</span>`;
    return `<a href="#" style="display:flex;gap:8px;align-items:center;text-decoration:none;flex:1 1 0;min-width:0;`
      + `justify-content:${which === "prev" ? "flex-start" : "flex-end"}">`
      + (which === "prev" && arrow ? `<span style="${arrowStyle}">${mark}</span>` : "")
      + body
      + (which === "next" && arrow ? `<span style="${arrowStyle}">${mark}</span>` : "")
      + `</a>`;
  };
  const line = on(p.show_borders) ? `1px solid ${esc(str(p.sep_color) || "#E2E8F0")}` : "none";
  return `<div class="bx-f7-postnav" style="display:flex;gap:16px;padding:12px 0;border-top:${line};border-bottom:${line}">`
    + side("prev") + side("next") + `</div>`
    + fromTheSite(ctx.mode, "The two links are worked out from where the story sits in the list.");
};
