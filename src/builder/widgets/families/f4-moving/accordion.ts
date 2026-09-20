/**
 * f4-moving/accordion.ts — Elementor's **Accordion**, by its own name, group,
 * panel sections, control labels and defaults.
 *
 * WAVE 2. The kind already existed in `widgets/pageOnly.ts` with TWO controls.
 * The stored id (`accordion`) and the stored shape (`tabs: [{ tab_title,
 * tab_content }]`) are unchanged, so a page saved last week opens and draws.
 *
 * ── WHICH ELEMENTOR WIDGET THIS IS, SETTLED IN THE LIVE EDITOR ────────────
 * Driven 2026-09-19 (`elementor-reference/widgets/_g4_f4_panels.json`):
 *
 *     accordion          title "Accordion", show_in_panel FALSE  — deprecated
 *     nested-accordion   title "Accordion", show_in_panel TRUE   — the tile
 *
 * So the panel below is `nested-accordion`'s: Content › Layout, Content ›
 * Interactions, Style › Accordion / Header / Content.
 *
 * ── THE LIST KEEPS OUR KEY, AND HERE IS WHY ───────────────────────────────
 * Elementor's nested Accordion calls its repeater `items` and each title
 * `item_title`. Ours has always stored `tabs` / `tab_title`, and so does every
 * document in the database and every shipped template. Renaming the key would
 * blank a stored page for a cosmetic match nobody can see, so the KEY stays
 * ours, `panelRows()` reads both spellings, and arion's emitter writes
 * Elementor's spelling once, in one place, on the way out. One mechanism, and
 * the translation happens where a translation belongs.
 *
 * ── WHO OFFERS IT ─────────────────────────────────────────────────────────
 * `BUILDER_OFFERS_2026-09-19.json`: `website.elementor_free` and
 * `landing.elementor_free`, as `nested-accordion`. Not a mailbox and not paper.
 */
import type { Widget } from "../../../model";
import { esc } from "../../../esc";
import type { RenderContext } from "../../../render";
import { bar, box, pictureFrom } from "../../../pictures";
import { proseRun } from "../../text";
import type { FamilyWidgetDef } from "../types";
import {
  FLEX_OF, STARTING_PANELS, TITLE_TAG_OPTIONS, WEIGHT_OPTIONS, colour, decl, on, panelRows,
  px, startEnd, str, tag,
} from "./parts";

/** Elementor's two opening states, in its own words and its own values. */
export const DEFAULT_STATES = [
  { value: "expanded", label: "First expanded" },
  { value: "all_collapsed", label: "All collapsed" },
];

/**
 * WHICH PANELS ARE OPEN WHEN THE PAGE LOADS.
 *
 * In EDIT mode every panel is open, always, and that is not a setting being
 * ignored — a panel an author cannot see is a panel they cannot edit in place.
 * In VIEW mode Elementor's own Default State decides, which is what a visitor
 * gets and what the test checks.
 */
export function openPanels(props: Record<string, unknown>, mode: unknown): (i: number) => boolean {
  if (mode === "edit") return () => true;
  return str((props as any)?.default_state) === "all_collapsed" ? () => false : (i: number) => i === 0;
}

export function renderAccordion(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const items = panelRows(p);
  if (!items.length) {
    return ctx.mode === "edit"
      ? `<div class="bx-imgdrop">Add your first question in the panel on the right.</div>`
      : "";
  }

  const isOpen = openPanels(p, ctx.mode);
  const across = startEnd(p.accordion_item_title_position_horizontal) || "start";
  const iconEnd = startEnd(p.accordion_item_title_icon_position) === "end";

  /* ── Style › Accordion ───────────────────────────────────────────────── */
  const between = px(p.accordion_item_title_space_between, 0, 60) || "6px";
  const fromContent = px(p.accordion_item_title_distance_from_content, 0, 60);
  const itemBg = colour(p.accordion_background_normal_color);
  const itemBorder = colour(p.accordion_border_normal_color) || "#E2E8F0";

  /* ── Style › Header ──────────────────────────────────────────────────── */
  const titleInk = colour(p.normal_title_color);
  const activeInk = colour(p.active_title_color) || esc(ctx.accent);
  const titleType = decl("font-size", px(p.title_typography_font_size, 8, 60))
    + decl("font-weight", esc(str(p.title_typography_font_weight)) || "700");
  const iconInk = colour(p.normal_icon_color) || titleInk;
  const iconGap = px(p.icon_spacing, 0, 60) || "8px";

  /* ── Style › Content ─────────────────────────────────────────────────── */
  const bodyBg = colour(p.content_background_color);
  const bodyBorder = colour(p.content_border_color);
  const bodyPad = px(p.content_padding, 0, 120) || "10px";

  const titleTag = tag(p.title_tag == null ? p.title_html_tag : p.title_tag, "div");

  const rows = items.map((it, i) => {
    const open = isOpen(i);
    const mark = `<span aria-hidden="true" style="${decl("color", iconInk)}">${open ? "–" : "+"}</span>`;
    /* THE QUESTION IS THE EDITABLE RUN, not the whole header.
       `data-edit` and `data-placeholder` go on the SAME element — that is what
       `bx-slot:empty::before` needs and what the canvas's editor writes back
       into. Putting `data-edit` on the header instead let the author type over
       the + and left one of three placeholders blank, which the drive showed
       on 2026-09-19 before this was moved. */
    const empty = !it.tab_title.trim();
    const slot = empty && ctx.mode === "edit" ? " bx-slot" : "";
    const words = `<span class="bx-acc-q${slot}" data-edit="tabs.${i}.tab_title" data-placeholder="What somebody would ask">${esc(it.tab_title)}</span>`;
    const head = `<${titleTag} class="bx-acc-h" style="padding:10px 12px;display:flex;${
      decl("gap", iconGap)}align-items:center;justify-content:${FLEX_OF[across] === "center" ? "center" : "space-between"};${
      decl("color", open ? activeInk : titleInk)}${titleType}">${
      iconEnd ? words + mark : mark + words}</${titleTag}>`;
    const body = open
      ? `<div class="bx-acc-b" style="padding:0 ${bodyPad} ${bodyPad};${decl("background", bodyBg)}${
        bodyBorder ? `border-top:1px solid ${bodyBorder};` : ""}">${
        proseRun(`tabs.${i}.tab_content`, it.tab_content, "bx-acc-body", "The answer", ctx)}</div>`
      : "";
    return `<div class="bx-acc-item" style="border:1px solid ${itemBorder};border-radius:6px;${
      decl("background", itemBg)}${decl("margin-bottom", between)}${
      open ? decl("padding-bottom", fromContent) : ""}">${head}${body}</div>`;
  }).join("");

  /* FAQ Schema is Elementor's own switch and it marks the block up for search
     engines. Honoured on the page, not decorated on the canvas. */
  const schema = on(p.faq_schema) ? ` itemscope itemtype="https://schema.org/FAQPage"` : "";
  return `<div class="bx-accordion"${schema}>${rows}</div>`;
}

export const ACCORDION_DEF: FamilyWidgetDef = {
  kind: "accordion",
  label: "Accordion",
  description: "Questions that open one at a time when the visitor clicks them.",
  icon: "ChevronsUpDown",
  picture: pictureFrom(box(6, 5, 52, 9) + box(6, 17, 52, 9) + box(6, 29, 52, 7)
    + bar(10, 8, 26, 3) + bar(10, 20, 22, 3)),
  category: "General",
  builders: ["website", "landing"],
  defaults: {
    /* THREE, which is what Elementor's own new Accordion arrives with — see
       STARTING_PANELS in parts.ts for why it matters more here than there. */
    tabs: STARTING_PANELS,
    accordion_item_title_position_horizontal: "",
    accordion_item_title_icon_position: "start",
    title_tag: "div",
    faq_schema: false,
    default_state: "expanded",
  },
  controls: [
    /* ── Content › Layout — Elementor's own section name and order ───────── */
    { key: "tabs", label: "Items", type: "list", tab: "content", section: "Layout",
      help: "One question and its answer per row." },
    { key: "accordion_item_title_position_horizontal", label: "Item Position", type: "select", tab: "content",
      section: "Layout", responsive: true,
      options: [{ value: "start", label: "Start" }, { value: "center", label: "Center" }, { value: "end", label: "End" }] },
    { key: "accordion_item_title_icon_position", label: "Position", type: "select", tab: "content",
      section: "Layout", responsive: true, help: "Which side of the question the + sits on.",
      options: [{ value: "start", label: "Start" }, { value: "end", label: "End" }] },
    { key: "title_tag", label: "Title HTML Tag", type: "select", tab: "content", section: "Layout",
      options: TITLE_TAG_OPTIONS },
    { key: "faq_schema", label: "FAQ Schema", type: "toggle", tab: "content", section: "Layout",
      help: "Tell search engines these are questions and answers" },

    /* ── Content › Interactions ──────────────────────────────────────────── */
    { key: "default_state", label: "Default State", type: "select", tab: "content", section: "Interactions",
      options: DEFAULT_STATES },

    /* ── Style › Accordion ───────────────────────────────────────────────── */
    { key: "accordion_item_title_space_between", label: "Space between Items", type: "number", tab: "style",
      section: "Accordion", responsive: true },
    { key: "accordion_item_title_distance_from_content", label: "Distance from content", type: "number",
      tab: "style", section: "Accordion", responsive: true },
    { key: "accordion_background_normal_color", label: "Color", type: "colour", tab: "style", section: "Accordion" },
    { key: "accordion_border_normal_color", label: "Border Color", type: "colour", tab: "style", section: "Accordion" },

    /* ── Style › Header ──────────────────────────────────────────────────── */
    { key: "normal_title_color", label: "Color", type: "colour", tab: "style", section: "Header" },
    { key: "active_title_color", label: "Active Color", type: "colour", tab: "style", section: "Header" },
    { key: "title_typography_font_size", label: "Size", type: "number", tab: "style", section: "Header",
      responsive: true },
    { key: "title_typography_font_weight", label: "Weight", type: "select", tab: "style", section: "Header",
      options: WEIGHT_OPTIONS },
    { key: "normal_icon_color", label: "Icon Color", type: "colour", tab: "style", section: "Header" },
    { key: "icon_spacing", label: "Icon Spacing", type: "number", tab: "style", section: "Header", responsive: true },

    /* ── Style › Content ─────────────────────────────────────────────────── */
    { key: "content_background_color", label: "Color", type: "colour", tab: "style", section: "Content" },
    { key: "content_border_color", label: "Border Color", type: "colour", tab: "style", section: "Content" },
    { key: "content_padding", label: "Padding", type: "number", tab: "style", section: "Content", responsive: true },
  ],
};
