/**
 * f4-moving/tabs.ts — Elementor's **Tabs**, by its own name, group, panel
 * sections, control labels and defaults.
 *
 * WAVE 2. The kind already existed in `widgets/pageOnly.ts` with TWO controls —
 * a list and a title tag. The stored id is unchanged (`tabs`) and the stored
 * shape is unchanged (`tabs: [{ tab_title, tab_content }]`), so a page saved
 * last week opens and draws.
 *
 * ── WHICH ELEMENTOR WIDGET THIS IS, SETTLED IN THE LIVE EDITOR ────────────
 * Elementor ships two, and the panel offers only one. Driven 2026-09-19
 * (`elementor-reference/widgets/_g4_f4_panels.json`):
 *
 *     tabs          title "Tabs", show_in_panel FALSE  — deprecated
 *     nested-tabs   title "Tabs", show_in_panel TRUE   — the tile
 *
 * So the panel below is `nested-tabs`'s: Content › Tabs and Content ›
 * Additional Settings, Style › Tabs / Titles / Content. Wave 1 said a nested
 * element "cannot be declared at all" because its panels are child CONTAINERS
 * in the node's `elements`. That is true of the PUBLISHED tree and it is not
 * true of the PANEL: the widget's own flat controls are the ones above, its
 * panels are a repeater we already store, and `families/f4-moving/emitters.js`
 * in arion now builds the real child-container tree from a live capture of
 * what Elementor itself writes (`_g4_nested_tree.json`). So the tile is
 * Elementor's tile and the page is Elementor's page.
 *
 * ── WHO OFFERS IT ─────────────────────────────────────────────────────────
 * `BUILDER_OFFERS_2026-09-19.json`: `website.elementor_free` and
 * `landing.elementor_free`, as `nested-tabs`. Not the newsletter and not a
 * proposal — the offer file lists it under
 * `not_offered_because_email_cannot_run_them` and
 * `not_offered_because_paper_cannot_do_them`, and it is right: nobody clicks a
 * tab in a mailbox or on paper.
 *
 * ── THE CANVAS SHOWS EVERY PANEL'S WORDS ──────────────────────────────────
 * The first tab is drawn OPEN and the rest are drawn below it, dimmed, with
 * their words visible. Elementor's editor shows one at a time and lets the
 * author click between them; ours has no tab script on the canvas, and a panel
 * an author cannot see is a panel they cannot edit in place — which is the
 * whole point of editing on the page. Said here rather than left to be found.
 */
import type { Widget } from "../../../model";
import { esc } from "../../../esc";
import type { RenderContext } from "../../../render";
import { bar, box, pictureFrom } from "../../../pictures";
import { proseRun } from "../../text";
import type { FamilyWidgetDef } from "../types";
import {
  FLEX_OF, STARTING_PANELS, TEXT_OF, WEIGHT_OPTIONS, colour, decl, panelRows, px, startEnd, str,
} from "./parts";

/**
 * ELEMENTOR'S FOUR DIRECTIONS, in its own words and its own stored values.
 *
 * `block-start` means the row of titles sits ABOVE the panel, `inline-end`
 * means it sits to the RIGHT, and so on. Copied from the live capture, not
 * from memory — the names read backwards the first time.
 */
export const TAB_DIRECTIONS = [
  { value: "block-start", label: "Above" },
  { value: "block-end", label: "Below" },
  { value: "inline-start", label: "Left" },
  { value: "inline-end", label: "Right" },
];

/** Which way the box that holds titles-and-panels runs, for the canvas. */
export function tabsFlow(direction: unknown): string {
  switch (str(direction)) {
    case "block-end": return "column-reverse";
    case "inline-start": return "row";
    case "inline-end": return "row-reverse";
    default: return "column";
  }
}

/** Is the row of titles beside the panel rather than above it? */
export const tabsSideways = (direction: unknown): boolean =>
  str(direction) === "inline-start" || str(direction) === "inline-end";

export function renderTabs(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const items = panelRows(p);
  if (!items.length) {
    return ctx.mode === "edit"
      ? `<div class="bx-imgdrop">Add your first tab in the panel on the right.</div>`
      : "";
  }

  const sideways = tabsSideways(p.tabs_direction);
  const flow = tabsFlow(p.tabs_direction);
  const justify = startEnd(sideways ? p.tabs_justify_vertical : p.tabs_justify_horizontal) || "start";
  const titleAlign = startEnd(p.title_alignment) || "start";
  const width = px(p.tabs_width, 5, 100);

  /* ── Style › Tabs ────────────────────────────────────────────────────── */
  const between = px(p.tabs_title_space_between, 0, 80) || "0px";
  const fromContent = px(p.tabs_title_spacing, 0, 120) || "0px";
  const headBg = colour(p.tabs_title_background_color_color);
  const headBorder = colour(p.tabs_title_border_color) || "#E2E8F0";
  const activeBg = colour(p.tabs_title_background_color_active_color);

  /* ── Style › Titles ──────────────────────────────────────────────────── */
  const titleInk = colour(p.title_text_color);
  const activeInk = colour(p.title_text_color_active) || esc(ctx.accent);
  const titleType = decl("font-size", px(p.title_typography_font_size, 8, 60))
    + decl("font-weight", esc(str(p.title_typography_font_weight)));

  /* ── Style › Content ─────────────────────────────────────────────────── */
  const boxBg = colour(p.box_background_color_color);
  const boxBorder = colour(p.box_border_color) || "#E2E8F0";
  const boxPad = px(p.box_padding, 0, 120) || "12px";

  const heads = items.map((it, i) => {
    const active = i === 0;
    const style = [
      "padding:8px 12px;",
      `border:1px solid ${headBorder};`,
      decl("background", active ? (activeBg || headBg) : headBg),
      decl("color", active ? activeInk : titleInk),
      titleType,
      active ? "font-weight:700;" : "",
      decl("text-align", TEXT_OF[titleAlign]),
    ].join("");
    /* An empty title is still something to CLICK while editing: a tab whose
       words nobody has typed must not be a zero-width gap the author cannot
       find. Same rule `editRun` applies to every other run of text. */
    const empty = !it.tab_title.trim();
    const slot = empty && ctx.mode === "edit" ? " bx-slot" : "";
    if (empty && ctx.mode !== "edit") return "";
    return `<span class="bx-tab-h${active ? " bx-tab-on" : ""}${slot}" style="${style}" data-edit="tabs.${i}.tab_title" data-placeholder="What this tab is called">${
      esc(it.tab_title)}</span>`;
  }).join("");

  const bodies = items.map((it, i) => {
    const style = [
      `padding:${boxPad};`,
      `border:1px solid ${boxBorder};`,
      decl("background", boxBg),
      i === 0 ? "" : "opacity:.55;",
    ].join("");
    return `<div class="bx-tab-b" style="${style}">${
      proseRun(`tabs.${i}.tab_content`, it.tab_content, "bx-tab-body", "What this tab says", ctx)}</div>`;
  }).join("");

  const headList = `<div class="bx-tab-heads" style="display:flex;${
    sideways ? "flex-direction:column;" : "flex-wrap:wrap;"}${
    decl("gap", between)}justify-content:${FLEX_OF[justify]};${
    sideways && width ? `flex:0 0 ${width};` : ""}">${heads}</div>`;

  return `<div class="bx-tabs" style="display:flex;flex-direction:${flow};${
    decl("gap", fromContent)}"><div style="display:flex;flex-direction:${
    sideways ? "row" : "column"};${decl("gap", fromContent)}width:100%">${
    headList}<div style="flex:1 1 auto">${bodies}</div></div></div>`;
}

export const TABS_DEF: FamilyWidgetDef = {
  kind: "tabs",
  /* ELEMENTOR'S OWN TITLE for the tile a person is offered. */
  label: "Tabs",
  description: "Several panels behind a row of titles — the visitor clicks one at a time.",
  icon: "PanelTop",
  picture: pictureFrom(box(6, 12, 52, 22) + `<path d="M6 12h16v-6h-16z" fill="#94A3B8" stroke="none"/>`
    + bar(26, 7, 12, 4) + bar(42, 7, 12, 4) + bar(12, 20, 34)),
  category: "General",
  builders: ["website", "landing"],
  defaults: {
    /* THREE, which is what Elementor's own new Tabs arrives with, and what
       makes ours usable at all — see STARTING_PANELS in parts.ts. */
    tabs: STARTING_PANELS,
    tabs_direction: "block-start",
    tabs_justify_horizontal: "start",
    title_alignment: "",
  },
  controls: [
    /* ── Content › Tabs — Elementor's own section, labels and order ──────── */
    { key: "tabs", label: "Tabs Items", type: "list", tab: "content", section: "Tabs",
      /* ELEMENTOR'S OWN REPEATER, with a way to ADD one (B-168, 2026-09-22).
         The parity scorer: "the Items list has no editor beyond typing on
         the canvas". A row is a title and its words — the two `panelRows`
         reads — and `from` names the other spelling of the same list, so
         the first press adds to whichever one the author can see. */
      row: { tab_title: "", tab_content: "" },
      from: "items",
      help: "One title and its words per row." },
    { key: "tabs_direction", label: "Direction", type: "select", tab: "content", section: "Tabs",
      responsive: true, options: TAB_DIRECTIONS },
    { key: "tabs_justify_horizontal", label: "Justify", type: "select", tab: "content", section: "Tabs",
      responsive: true,
      options: [{ value: "start", label: "Start" }, { value: "center", label: "Center" },
        { value: "end", label: "End" }, { value: "stretch", label: "Stretch" }] },
    { key: "tabs_justify_vertical", label: "Justify", type: "select", tab: "content", section: "Tabs",
      responsive: true, help: "Used when the titles sit to the left or the right.",
      options: [{ value: "start", label: "Start" }, { value: "center", label: "Center" },
        { value: "end", label: "End" }, { value: "stretch", label: "Stretch" }] },
    { key: "tabs_width", label: "Width", type: "number", tab: "content", section: "Tabs", responsive: true,
      help: "How wide the column of titles is, when they sit beside the panel." },
    { key: "title_alignment", label: "Align Title", type: "select", tab: "content", section: "Tabs",
      responsive: true,
      options: [{ value: "start", label: "Start" }, { value: "center", label: "Center" }, { value: "end", label: "End" }] },

    /* ── Style › Tabs ────────────────────────────────────────────────────── */
    { key: "tabs_title_space_between", label: "Gap between tabs", type: "number", tab: "style", section: "Tabs",
      responsive: true },
    { key: "tabs_title_spacing", label: "Distance from content", type: "number", tab: "style", section: "Tabs",
      responsive: true },
    { key: "tabs_title_background_color_color", label: "Background Color", type: "colour", tab: "style",
      section: "Tabs" },
    { key: "tabs_title_border_color", label: "Border Color", type: "colour", tab: "style", section: "Tabs" },
    { key: "tabs_title_background_color_active_color", label: "Active Background Color", type: "colour",
      tab: "style", section: "Tabs" },

    /* ── Style › Titles ──────────────────────────────────────────────────── */
    { key: "title_text_color", label: "Color", type: "colour", tab: "style", section: "Titles" },
    { key: "title_text_color_active", label: "Active Color", type: "colour", tab: "style", section: "Titles" },
    { key: "title_typography_font_size", label: "Size", type: "number", tab: "style", section: "Titles",
      responsive: true },
    { key: "title_typography_font_weight", label: "Weight", type: "select", tab: "style", section: "Titles",
      options: WEIGHT_OPTIONS },

    /* ── Style › Content ─────────────────────────────────────────────────── */
    { key: "box_background_color_color", label: "Background Color", type: "colour", tab: "style", section: "Content" },
    { key: "box_border_color", label: "Border Color", type: "colour", tab: "style", section: "Content" },
    { key: "box_padding", label: "Padding", type: "number", tab: "style", section: "Content", responsive: true },
  ],
};
