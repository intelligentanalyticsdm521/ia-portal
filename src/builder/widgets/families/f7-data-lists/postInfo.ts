/**
 * families/f7-data-lists/postInfo.ts — **Post Info**, Elementor `post-info`.
 *
 * One content section called "Meta Data" holding `view` (Elementor's own word
 * for whether the facts sit in a row or one per line) and `icon_list`, a
 * repeater of which facts to show. The style tab has three sections — List,
 * Icon and Text — and the core of each is here: the space between, the
 * alignment, the divider, the two colours and the icon size.
 *
 * The repeater is a `list` control, which is the engine's own way of saying
 * "rows the author edits" — the same control Icon List and Social Icons use.
 * Each row is `{ type }`, out of Elementor's own fact list, and the renderer
 * draws the row with the mark Elementor puts in front of it.
 */
import type { Widget } from "../../../model";
import { esc } from "../../../esc";
import type { RenderContext } from "../../../render";
import { bar, pictureFrom } from "../../../pictures";
import type { FamilyRenderer, FamilyWidgetDef } from "../types";
import { fromTheSite, num, on, str } from "./shared";

/** Elementor's own fact types, with the mark and the stand-in each draws. */
const FACTS: Record<string, { mark: string; sample: string }> = {
  author: { mark: "◍", sample: "by the author" },
  date: { mark: "▤", sample: "12 March" },
  time: { mark: "◷", sample: "9:00 am" },
  comments: { mark: "❝", sample: "3 comments" },
  terms: { mark: "⌗", sample: "Category" },
  custom: { mark: "•", sample: "Anything you like" },
};

const DEFAULT_FACTS = [{ type: "author" }, { type: "date" }, { type: "comments" }];

export const POST_INFO_DEF: FamilyWidgetDef = {
  kind: "post_info",
  label: "Post Info",
  description: "The small line of facts under a title — who wrote it, when, how many comments.",
  icon: "Info",
  picture: pictureFrom(bar(6, 17, 14, 5) + bar(25, 17, 14, 5) + bar(44, 17, 14, 5)),
  category: "Site",
  builders: ["website"],
  tier: "pro",
  defaults: {
    view: "inline", icon_list: DEFAULT_FACTS.map((f) => ({ ...f })),
    space_between: 12, icon_align: "", divider: "", divider_color: "#ddd",
    icon_color: "", icon_size: 14, text_color: "",
  },
  controls: [
    { key: "view", label: "Layout", type: "select", tab: "content", section: "Meta Data", options: [
      { value: "traditional", label: "One under the other" }, { value: "inline", label: "All on one line" }] },
    {
      key: "icon_list", label: "Meta Data", type: "list", tab: "content", section: "Meta Data",
      help: "Which facts to show, in the order you want them.",
    },
    { key: "space_between", label: "Space Between", type: "number", tab: "style", section: "List", responsive: true },
    { key: "icon_align", label: "Alignment", type: "select", tab: "style", section: "List", responsive: true, options: [
      { value: "left", label: "Left" }, { value: "center", label: "Centre" }, { value: "right", label: "Right" }] },
    { key: "divider", label: "Divider", type: "toggle", tab: "style", section: "List", help: "A line between each fact" },
    { key: "divider_color", label: "Color", type: "colour", tab: "style", section: "List" },
    { key: "icon_color", label: "Color", type: "colour", tab: "style", section: "Icon" },
    { key: "icon_size", label: "Size", type: "number", tab: "style", section: "Icon", responsive: true },
    { key: "text_color", label: "Text Color", type: "colour", tab: "style", section: "Text" },
  ],
};

export const renderPostInfo: FamilyRenderer = (w: Widget, ctx: RenderContext) => {
  const p: any = w.props || {};
  const rows: any[] = Array.isArray(p.icon_list) && p.icon_list.length ? p.icon_list : DEFAULT_FACTS;
  const inline = str(p.view || "inline") === "inline";
  const gap = num(p.space_between, 12);
  const divider = on(p.divider);
  const marks = rows.map((r, i) => {
    const fact = FACTS[str(r?.type)] || FACTS.custom;
    const text = str(r?.custom_text).trim() || fact.sample;
    const edge = divider && i < rows.length - 1 && inline
      ? `border-right:1px solid ${esc(str(p.divider_color) || "#ddd")};padding-right:${gap}px`
      : "";
    return `<span class="bx-f7-fact" style="display:inline-flex;align-items:center;gap:5px;${edge}">`
      + `<span style="color:${esc(str(p.icon_color) || ctx.accent)};font-size:${num(p.icon_size, 14)}px">${fact.mark}</span>`
      + `<span style="color:${esc(str(p.text_color) || "#5A7A8A")}">${esc(text)}</span></span>`;
  }).join("");
  const align = str(p.icon_align) || "left";
  const justify = align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start";
  return `<div class="bx-f7-postinfo" style="display:flex;flex-direction:${inline ? "row" : "column"};`
    + `flex-wrap:wrap;gap:${gap}px;font-size:12px;justify-content:${justify};align-items:${inline ? "center" : align === "center" ? "center" : "flex-start"}">${marks}</div>`
    + fromTheSite(ctx.mode, "Each story fills these in with its own author, date and count.");
};
