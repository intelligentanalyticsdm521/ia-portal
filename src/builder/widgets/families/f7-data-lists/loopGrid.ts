/**
 * families/f7-data-lists/loopGrid.ts — **Loop Grid**, Elementor `loop-grid`.
 *
 * Posts draws its own card. Loop Grid draws YOURS: you design one item as a
 * saved piece, and the grid repeats it for every story. That is the whole
 * difference, and it is why `template_id` sits at the top of its Layout
 * section.
 *
 * Four content sections in the machine file: Layout, the family's shared Query
 * block (this widget spells it `post_query_`), Pagination, and "Additional
 * Options", which is just the message shown when the list is empty.
 *
 * ── THE SAVED PIECE IS AN ID HERE TOO ─────────────────────────────────────
 * Same as the Template widget: Elementor draws a searchable picker of the saved
 * pieces on that site, and wiring our own library's picker into a widget panel
 * is work in the shell, which this family does not open. So the control is the
 * id with a plain sentence, and the missing picker is written in the handoff
 * once, for both widgets, rather than quietly stubbed.
 */
import type { Widget } from "../../../model";
import { esc } from "../../../esc";
import type { RenderContext } from "../../../render";
import { bar, box, pictureFrom } from "../../../pictures";
import type { FamilyRenderer, FamilyWidgetDef } from "../types";
import {
  fromTheSite, num, on, paginationControls, paginationDefaults, paginationRow,
  queryControls, queryDefaults, str,
} from "./shared";

export const LOOP_GRID_DEF: FamilyWidgetDef = {
  kind: "loop_grid",
  label: "Loop Grid",
  description: "One card you design yourself, repeated for every story, product or job.",
  icon: "Grid3x3",
  picture: pictureFrom(box(6, 6, 24, 12) + box(34, 6, 24, 12) + box(6, 22, 24, 12) + box(34, 22, 24, 12)
    + bar(10, 10, 16, 4) + bar(38, 10, 16, 4) + bar(10, 26, 16, 4) + bar(38, 26, 16, 4)),
  category: "Pro",
  builders: ["website", "landing"],
  tier: "pro",
  defaults: {
    template_id: 0, columns: 3, posts_per_page: 6, masonry: "", equal_height: "",
    enable_nothing_found_message: "", nothing_found_message_text: "",
    ...queryDefaults("post_query_"),
    ...paginationDefaults(),
  },
  controls: [
    {
      key: "template_id", label: "Choose a template", type: "number", tab: "content", section: "Layout",
      help: "The number shown beside the card you saved.",
    },
    { key: "columns", label: "Columns", type: "number", tab: "content", section: "Layout", responsive: true },
    { key: "posts_per_page", label: "Items Per Page", type: "number", tab: "content", section: "Layout" },
    { key: "masonry", label: "Masonry", type: "toggle", tab: "content", section: "Layout", help: "Let the cards be different heights" },
    { key: "equal_height", label: "Equal height", type: "toggle", tab: "content", section: "Layout", help: "Make every card the same height" },
    ...queryControls("post_query_"),
    ...paginationControls(),
    { key: "enable_nothing_found_message", label: "Nothing Found Message", type: "toggle", tab: "content", section: "Additional Options", help: "Say something when the list is empty" },
    { key: "nothing_found_message_text", label: "Nothing Found Message", type: "textarea", tab: "content", section: "Additional Options" },
  ],
};

export const renderLoopGrid: FamilyRenderer = (w: Widget, ctx: RenderContext) => {
  const p: any = w.props || {};
  const id = Number(p.template_id) || 0;
  const columns = Math.max(1, Math.min(6, num(p.columns, 3)));
  const count = Math.max(1, Math.min(9, num(p.posts_per_page, 6)));
  const equal = on(p.equal_height);
  const masonry = on(p.masonry);
  const cells = Array.from({ length: count }, (_, i) => {
    const height = equal ? 96 : masonry && i % 3 === 1 ? 132 : 96;
    return `<div class="bx-f7-loopcell" style="border:1px dashed #CBD5E1;border-radius:6px;height:${height}px;`
      + `display:flex;align-items:center;justify-content:center;color:#94A3B8;font-size:11px">`
      + `${id ? `Saved card ${esc(String(id))}` : "Your saved card"}</div>`;
  }).join("");
  return `<div class="bx-f7-grid" style="display:grid;grid-template-columns:repeat(${columns},1fr);gap:12px;align-items:start">${cells}</div>`
    + paginationRow(p)
    + fromTheSite(ctx.mode, id
      ? "Every story is drawn with the card you saved."
      : "Save a card first, then put its number above and every story is drawn with it.");
};
