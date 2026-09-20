/**
 * Icon List — Elementor `icon-list`, group General. Stored kind: `list`.
 *
 * ── WHAT IT REPLACES ──────────────────────────────────────────────────────
 * `registry.ts`'s `list`: ONE control ("Points", a list of strings), no tabs,
 * no sections, and a renderer that drew a plain `<ul>` with the browser's own
 * bullet. Elementor's Icon List is a list where every row has ITS OWN icon and
 * its own link, laid out down the page or in a row, with a divider between the
 * rows — which is why the widget is called Icon List and not List.
 *
 * SAME KIND (`list`), because every proposal, newsletter and landing page we
 * have ever saved holds `{"kind":"list","props":{"items":["…"]}}`. Those plain
 * strings still draw: `rows()` below reads Elementor's `icon_list` repeater
 * FIRST and falls back to `items`, so nothing already stored loses a point.
 *
 * ── ELEMENTOR'S OWN PANEL ─────────────────────────────────────────────────
 * Content ▸ Icon List: Layout · Items · Apply Link On.
 * Style ▸ List: Space Between (responsive) · Alignment (responsive) · Divider ·
 * Divider Style · Divider Weight · Divider Color.
 * Style ▸ Icon: Color · Size (responsive) · Gap.
 * Style ▸ Text: Color.
 *
 * Left out and named in the handoff: the two hover colours and their transition
 * durations, Divider Width and Height, and the icon's own Horizontal
 * Alignment, Vertical Alignment and Adjust Vertical Position — five ways of
 * nudging one glyph inside its own cell.
 */
import type { Widget } from "../../../model";
import { esc } from "../../../esc";
import type { RenderContext } from "../../../render";
import { pictureFrom, bar } from "../../../pictures";
import { fillText } from "../../text";
import { DEFAULT_ICON, glyphFor } from "../../glyph";
import type { FamilyWidgetDef } from "../types";
import { str, flexJustify } from "./shared";
import { RESPONSIVE, START_CENTER_END, borderStyle, colour, num } from "./deep";

/** One row of the list, however it was stored. */
export interface IconListRow {
  text: string;
  icon: unknown;
  link: string;
}

/**
 * BOTH SPELLINGS OF THE ONE LIST.
 *
 * `icon_list` is Elementor's own repeater — `{ text, selected_icon, link }` per
 * row — and what a document written from today holds. `items` is a plain array
 * of strings and is what every document written before today holds. One reader,
 * so a July proposal opens with its points intact.
 */
export function rows(p: Record<string, unknown>): IconListRow[] {
  const own = Array.isArray(p.icon_list) ? p.icon_list : [];
  if (own.length) {
    return own.map((r) => {
      const row = (r || {}) as Record<string, unknown>;
      return { text: str(row.text), icon: row.selected_icon, link: str(row.link) };
    });
  }
  const plain = Array.isArray(p.items) ? p.items : [];
  return plain.map((t) => ({ text: str(t), icon: undefined, link: "" }));
}

export function renderIconList(w: Widget, ctx: RenderContext): string {
  const p = (w.props || {}) as Record<string, unknown>;
  const all = rows(p);
  const inline = str(p.view) === "inline";

  const iconColour = colour(p.icon_color, ctx.accent);
  const iconSize = num(p.icon_size, 14, 6, 120);
  const textColour = colour(p.text_color, "");
  const gap = num(p.text_indent, 8, 0, 120);
  const between = num(p.space_between, inline ? 16 : 6, 0, 200);

  /* ELEMENTOR'S DIVIDER, which the old widget had no idea about. It is a rule
     BETWEEN rows — down the page it is a bottom border, in a row it is a right
     one — so an author who turns it on sees something change either way. */
  const wantDivider = p.divider === true || p.divider === "yes";
  const dividerStyle = borderStyle(p.divider_style, "solid");
  const dividerRule = wantDivider
    ? `${num(p.divider_weight, 1, 0, 20)}px ${dividerStyle} ${colour(p.divider_color, "#ddd")}`
    : "";

  /* The path a typed row writes back to. A row that came from the plain
     `items` array keeps writing to `items.N`; a row from the repeater writes to
     `icon_list.N.text`. The author types in the same place either way. */
  const fromRepeater = Array.isArray(p.icon_list) && p.icon_list.length > 0;
  const pathOf = (i: number) => (fromRepeater ? `icon_list.${i}.text` : `items.${i}`);

  const shown = ctx.mode === "edit"
    ? [...all, { text: "", icon: undefined, link: "" }]   // one blank, so it can grow by typing
    : all.filter((r) => r.text.trim());
  if (!shown.length) return "";

  const cells = shown.map((r, i) => {
    const mark = `<span class="bx-iconlist-i" aria-hidden="true" style="color:${esc(iconColour)};font-size:${iconSize}px;line-height:1;flex:0 0 auto">${glyphFor(r.icon ?? DEFAULT_ICON)}</span>`;
    const words = `<span class="bx-iconlist-t${r.text.trim() ? "" : " bx-slot"}" data-edit="${esc(pathOf(i))}" data-placeholder="add a point…"${
      textColour ? ` style="color:${esc(textColour)}"` : ""}>${fillText(r.text, ctx)}</span>`;
    /* ELEMENTOR'S "Apply Link On": `full_width` wraps the whole row, `inline`
       wraps only the words. A control that changed nothing would be the defect
       this pass exists to remove, so both answers are drawn. */
    const wide = str(p.link_click) !== "inline";
    const body = !r.link.trim() ? `${mark}${words}`
      : wide
        ? `<a href="${esc(r.link)}" style="display:flex;align-items:center;gap:${gap}px;flex:1 1 auto;text-decoration:none;color:inherit">${mark}${words}</a>`
        : `${mark}<a href="${esc(r.link)}" style="text-decoration:none;color:inherit">${words}</a>`;
    const last = i === shown.length - 1;
    const rule = dividerRule && !last
      ? inline ? `border-right:${dividerRule};padding-right:${between}px;` : `border-bottom:${dividerRule};padding-bottom:${between}px;`
      : "";
    return `<li class="bx-iconlist-li" style="display:flex;align-items:center;gap:${gap}px;${rule}">${body}</li>`;
  }).join("");

  return `<ul class="bx-list bx-f3-iconlist" style="list-style:none;margin:0;padding:0;display:flex;flex-direction:${
    inline ? "row" : "column"};flex-wrap:wrap;gap:${between}px;justify-content:${flexJustify(p.icon_align, "flex-start")}">${cells}</ul>`;
}

export const ICON_LIST_DEF: FamilyWidgetDef = {
  kind: "list",
  label: "Icon List",
  description: {
    proposal: "A list of short points, one per line, each with its own symbol.",
    website: "A list of short points a visitor can skim, each with its own symbol.",
    email: "A list of short points, one per line — the part people actually read.",
    landing: "A list of short points a visitor can skim, each with its own symbol.",
  },
  icon: "List",
  picture: pictureFrom(
    `<circle cx="11" cy="12" r="2" fill="#94A3B8" stroke="none"/>` + bar(18, 10, 38) +
    `<circle cx="11" cy="22" r="2" fill="#94A3B8" stroke="none"/>` + bar(18, 20, 30) +
    `<circle cx="11" cy="32" r="2" fill="#94A3B8" stroke="none"/>` + bar(18, 30, 34)),
  category: "General",
  /* NOT My Brand (D-168). The offer file's `mybrand` list is ten Elementor
     widgets and Icon List is not one of them: a social graphic is a headline,
     a picture and a line of type, not a bulleted list. */
  builders: ["website", "landing", "newsletter", "proposal"],
  defaults: {
    view: "traditional", icon_list: [], items: ["", "", ""], link_click: "full_width",
    space_between: 6, icon_align: "", divider: false, divider_style: "solid",
    divider_weight: 1, divider_color: "#ddd",
    icon_color: "", icon_size: 14, text_indent: 8, text_color: "",
  },
  controls: [
    /* ── Content ▸ Icon List ──────────────────────────────────────────── */
    { key: "view", label: "Layout", type: "select", tab: "content", section: "Icon List", options: [
      { value: "traditional", label: "Default" }, { value: "inline", label: "Inline" }] },
    { key: "icon_list", label: "Items", type: "list", tab: "content", section: "Icon List",
      help: "Type the points straight onto the page. Press Enter for the next one." },
    /* NO "default icon" CONTROL. Elementor's Icon List has no such thing — the
       icon belongs to the ROW, in the Items repeater. Adding one would be an
       invented control on an Elementor widget, which D-168 forbids outright. A
       row with no icon of its own draws Elementor's own repeater default, the
       tick. Why the repeater itself cannot be edited row by row here is in the
       handoff, under this widget. */
    { key: "link_click", label: "Apply Link On", type: "select", tab: "content", section: "Icon List", options: [
      { value: "full_width", label: "Full Width" }, { value: "inline", label: "Inline" }] },

    /* ── Style ▸ List ─────────────────────────────────────────────────── */
    { key: "space_between", label: "Space Between", type: "number", tab: "style", section: "List", responsive: RESPONSIVE },
    { key: "icon_align", label: "Alignment", type: "select", tab: "style", section: "List", responsive: RESPONSIVE, options: START_CENTER_END },
    { key: "divider", label: "Divider", type: "toggle", tab: "style", section: "List", help: "A line between the points" },
    { key: "divider_style", label: "Style", type: "select", tab: "style", section: "List", options: [
      { value: "solid", label: "Solid" }, { value: "double", label: "Double" },
      { value: "dotted", label: "Dotted" }, { value: "dashed", label: "Dashed" }] },
    { key: "divider_weight", label: "Weight", type: "number", tab: "style", section: "List" },
    { key: "divider_color", label: "Color", type: "colour", tab: "style", section: "List" },

    /* ── Style ▸ Icon ─────────────────────────────────────────────────── */
    { key: "icon_color", label: "Color", type: "colour", tab: "style", section: "Icon" },
    { key: "icon_size", label: "Size", type: "number", tab: "style", section: "Icon", responsive: RESPONSIVE },
    { key: "text_indent", label: "Gap", type: "number", tab: "style", section: "Icon" },

    /* ── Style ▸ Text ─────────────────────────────────────────────────── */
    { key: "text_color", label: "Color", type: "colour", tab: "style", section: "Text" },
  ],
};

export default ICON_LIST_DEF;
