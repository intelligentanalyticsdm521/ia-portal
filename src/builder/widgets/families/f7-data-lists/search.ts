/**
 * families/f7-data-lists/search.ts — **Search**, Elementor `search`.
 *
 * Four content sections in the machine file — Search Field, Results, Query and
 * Additional Settings — and the core of each is here: what the box says before
 * anybody types, what the button says, whether results appear as you type, how
 * many and in how many columns, what shows when there is nothing, and then the
 * family's shared Query block (prefix `search_query_`) and its shared
 * Pagination block (whose type key this widget alone spells
 * `pagination_type_options`).
 *
 * ── IT WORKS WITH THE SCRIPT TURNED OFF ───────────────────────────────────
 * "Live Results" is Elementor's own name for the version that needs JavaScript:
 * it fetches while you type. It ships OFF, and with it off the widget is an
 * ordinary `<form method="get">` pointing at the site's own search — which is
 * what a browser with no script, a text-only reader and a search engine all
 * get. Turning it on adds the live behaviour on top of that form; it never
 * replaces it. The no-JS fallback is therefore the DEFAULT, not a spare.
 */
import type { Widget } from "../../../model";
import { esc } from "../../../esc";
import type { RenderContext } from "../../../render";
import { bar, box, pictureFrom } from "../../../pictures";
import type { FamilyRenderer, FamilyWidgetDef } from "../types";
import {
  fromTheSite, grid, num, on, paginationControls, paginationDefaults, paginationRow,
  queryControls, queryDefaults, samplePicture, SAMPLE_POSTS, str,
} from "./shared";

const TYPE_KEY = "pagination_type_options";

export const SEARCH_DEF: FamilyWidgetDef = {
  kind: "search",
  label: "Search",
  description: "A search box, and the results for whatever a visitor types in it.",
  icon: "Search",
  picture: pictureFrom(box(6, 12, 40, 16) + bar(11, 18, 22, 4)
    + `<circle cx="53" cy="18" r="6" fill="none"/><path d="M57 22l4 4"/>`),
  category: "Pro",
  builders: ["website"],
  tier: "pro",
  defaults: {
    search_input_placeholder_text: "Type to start searching...",
    autocomplete: "", submit_trigger: "click_submit", submit_button_text: "Search",
    live_results: "", minimum_search_characters: 3, number_of_columns: 1, number_of_items: 6,
    enable_nothing_found_message: "yes",
    nothing_found_message_text: "It seems we can't find what you're looking for.",
    ...queryDefaults("search_query_", false),
    ...paginationDefaults(TYPE_KEY),
  },
  controls: [
    { key: "search_input_placeholder_text", label: "Placeholder", type: "text", tab: "content", section: "Search Field" },
    { key: "submit_trigger", label: "Trigger", type: "select", tab: "content", section: "Search Field", options: [
      { value: "click_submit", label: "Press the button" }, { value: "key_enter", label: "Press Enter" },
      { value: "both", label: "Either" }] },
    { key: "submit_button_text", label: "Text", type: "text", tab: "content", section: "Search Field" },
    {
      key: "live_results", label: "Live Results", type: "toggle", tab: "content", section: "Results",
      help: "Show results while they type. With this off the box is an ordinary search form.",
    },
    { key: "minimum_search_characters", label: "Minimum search characters", type: "number", tab: "content", section: "Results" },
    { key: "number_of_columns", label: "Columns", type: "number", tab: "content", section: "Results", responsive: true },
    { key: "number_of_items", label: "Items", type: "number", tab: "content", section: "Results", responsive: true },
    { key: "enable_nothing_found_message", label: "Nothing Found Message", type: "toggle", tab: "content", section: "Results", help: "Say something when there are no results" },
    { key: "nothing_found_message_text", label: "Nothing Found Message", type: "textarea", tab: "content", section: "Results" },
    ...queryControls("search_query_", false),
    ...paginationControls(TYPE_KEY, "Additional Settings"),
  ],
};

export const renderSearch: FamilyRenderer = (w: Widget, ctx: RenderContext) => {
  const p: any = w.props || {};
  const columns = num(p.number_of_columns, 1);
  const items = Math.max(1, Math.min(SAMPLE_POSTS.length, num(p.number_of_items, 6)));
  const results = SAMPLE_POSTS.slice(0, items).map((s) => `<div class="bx-f7-result">`
    + samplePicture(64)
    + `<div class="bx-h bx-h3" style="margin:6px 0 2px;font-size:13px">${esc(s.title)}</div>`
    + `<div class="bx-p" style="font-size:12px;color:#5A7A8A">${esc(s.excerpt)}</div></div>`).join("");
  /* A REAL FORM, always. See the header: the live version is added on top of
     this, never instead of it, so the widget still works with no script. */
  return `<div class="bx-f7-search">`
    + `<form class="bx-f7-searchform" method="get" action="/" role="search" style="display:flex;gap:8px;align-items:stretch">`
    + `<input type="search" name="s" placeholder="${esc(str(p.search_input_placeholder_text) || "Type to start searching...")}" `
    + `aria-label="Search this site" style="flex:1 1 auto;min-width:0;border:1px solid #CBD5E1;border-radius:6px;padding:7px 10px;font:inherit"/>`
    + `<button type="submit" class="bx-button" style="background:${esc(ctx.accent)};border:0;color:#fff;border-radius:6px;padding:7px 14px;font:inherit">`
    + `${esc(str(p.submit_button_text) || "Search")}</button></form>`
    + `<div style="margin-top:12px">${grid(columns, 14, results)}</div>`
    + paginationRow(p, TYPE_KEY)
    + `</div>`
    + fromTheSite(ctx.mode, on(p.live_results)
      ? "Results appear as a visitor types. With scripts off, the box is still an ordinary search form."
      : "Whatever a visitor types is searched across your site.");
};
