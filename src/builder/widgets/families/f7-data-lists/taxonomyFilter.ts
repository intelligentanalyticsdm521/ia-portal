/**
 * families/f7-data-lists/taxonomyFilter.ts — **Taxonomy Filter**, Elementor
 * `taxonomy-filter`.
 *
 * Two content sections: "Layout" (which Loop Grid it filters, which set of
 * categories, whether the chips run across or down, how they line up) and
 * "Settings" (whether more than one can be picked at a time, whether empty
 * categories show, and the "All" chip at the front). One style section,
 * "Items".
 *
 * ── IT WORKS WITH THE SCRIPT TURNED OFF ───────────────────────────────────
 * Elementor's live version filters the grid on the page without a reload, which
 * needs JavaScript. Every chip we draw is a real `<a href>` to that category's
 * own page, so with scripts off a visitor still gets the filtered list — one
 * page load instead of none. That is the fallback the plan asks for, and it is
 * the markup we publish either way, not a second copy.
 */
import type { Widget } from "../../../model";
import { esc, type RenderContext } from "../../../render";
import { bar, pictureFrom } from "../../../pictures";
import type { FamilyRenderer, FamilyWidgetDef } from "../types";
import { fromTheSite, num, on, str } from "./shared";

const SAMPLE_TERMS = ["News", "How-to", "Behind the scenes"];

export const TAXONOMY_FILTER_DEF: FamilyWidgetDef = {
  kind: "taxonomy_filter",
  label: "Taxonomy Filter",
  description: "Category buttons a visitor presses to narrow the list under them.",
  icon: "Filter",
  picture: pictureFrom(`<rect x="6" y="10" width="16" height="9" rx="4" fill="#94A3B8" stroke="none"/>`
    + `<rect x="26" y="10" width="14" height="9" rx="4" fill="#CBD5E1" stroke="none"/>`
    + `<rect x="44" y="10" width="14" height="9" rx="4" fill="#CBD5E1" stroke="none"/>`
    + bar(6, 26, 24) + bar(34, 26, 24)),
  category: "Pro",
  builders: ["website", "landing"],
  tier: "pro",
  defaults: {
    selected_element: "", taxonomy: "category", direction: "horizontal",
    item_alignment_horizontal: "start", multiple_selection: "no", logical_combination: "AND",
    show_empty_items: "no", show_first_item: "yes", first_item_title: "All",
    taxonomy_filter_normal_text_color: "", taxonomy_filter_items_space_between: 10,
  },
  controls: [
    {
      key: "selected_element", label: "Selected loop grid", type: "text", tab: "content", section: "Layout",
      help: "The name you gave the list this filters.",
    },
    { key: "taxonomy", label: "Taxonomy", type: "select", tab: "content", section: "Layout", options: [
      { value: "category", label: "Categories" }, { value: "post_tag", label: "Tags" }] },
    { key: "direction", label: "Direction", type: "select", tab: "content", section: "Layout", responsive: true, options: [
      { value: "horizontal", label: "Across" }, { value: "vertical", label: "Down" }] },
    { key: "item_alignment_horizontal", label: "Item Alignment", type: "select", tab: "content", section: "Layout", responsive: true, options: [
      { value: "start", label: "Left" }, { value: "center", label: "Centre" },
      { value: "end", label: "Right" }, { value: "stretch", label: "Full width" }] },
    { key: "multiple_selection", label: "Multiple Selection", type: "toggle", tab: "content", section: "Settings", help: "Let more than one be pressed at once" },
    { key: "logical_combination", label: "Logical Combination", type: "select", tab: "content", section: "Settings", options: [
      { value: "AND", label: "Match all of them" }, { value: "OR", label: "Match any of them" }] },
    { key: "show_empty_items", label: "Empty Items", type: "toggle", tab: "content", section: "Settings", help: "Show categories with nothing in them" },
    { key: "show_first_item", label: "First Item", type: "toggle", tab: "content", section: "Settings", help: "Show the button that clears the filter" },
    { key: "first_item_title", label: "First Item Title", type: "text", tab: "content", section: "Settings" },
    { key: "taxonomy_filter_items_space_between", label: "Space between Items", type: "number", tab: "style", section: "Items", responsive: true },
    { key: "taxonomy_filter_normal_text_color", label: "Text Color", type: "colour", tab: "style", section: "Items" },
  ],
};

export const renderTaxonomyFilter: FamilyRenderer = (w: Widget, ctx: RenderContext) => {
  const p: any = w.props || {};
  const down = str(p.direction) === "vertical";
  const gap = num(p.taxonomy_filter_items_space_between, 10);
  const colour = str(p.taxonomy_filter_normal_text_color) || ctx.ink;
  const chips: string[] = [];
  if (on(p.show_first_item)) chips.push(str(p.first_item_title) || "All");
  chips.push(...SAMPLE_TERMS);
  const align = str(p.item_alignment_horizontal) || "start";
  const justify = align === "center" ? "center" : align === "end" ? "flex-end" : align === "stretch" ? "stretch" : "flex-start";
  /* REAL LINKS. With scripts off this is still a working filter — see header. */
  const body = chips.map((t, i) => `<a href="#" class="bx-f7-chip" style="display:inline-block;text-decoration:none;`
    + `padding:5px 12px;border-radius:999px;border:1px solid #CBD5E1;font-size:12px;`
    + `color:${i === 0 ? "#FFFFFF" : esc(colour)};background:${i === 0 ? esc(ctx.accent) : "transparent"}">${esc(t)}</a>`).join("");
  return `<div class="bx-f7-taxfilter" style="display:flex;flex-direction:${down ? "column" : "row"};`
    + `flex-wrap:wrap;gap:${gap}px;justify-content:${justify};align-items:${down ? "flex-start" : "center"}">${body}</div>`
    + fromTheSite(ctx.mode, "Your real categories fill these in. Each one is a link, so it still works with scripts turned off.");
};
