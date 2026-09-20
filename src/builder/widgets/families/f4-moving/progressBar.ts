/**
 * f4-moving/progressBar.ts — Elementor's **Progress Bar**, by its own name,
 * group, panel sections, control labels and defaults.
 *
 * WAVE 2. The kind already existed in `widgets/pageOnly.ts` with four controls
 * and no Style tab. The id is unchanged — `progress_bar` — and every prop the
 * old definition stored is still read, so a stored page opens and draws.
 *
 * ── MACHINE TRUTH, AND THE LIVE PANEL ─────────────────────────────────────
 * `BUILDER_WIDGET_CATALOG_2026-09-17.elementor.json` `widgets.progress`: title
 * *Progress Bar*, category `general`, sections `section_progress` (Content,
 * "Progress Bar") and `section_progress_style` (Style, "Progress Bar"). Read
 * again in the real editor on 2026-09-19
 * (`elementor-reference/widgets/_g4_f4_panels.json`, `progress.panel.png`):
 * Title, Title HTML Tag, Display Title, Type, Percentage, Display Percentage,
 * Inner Text — in that order, `show_in_panel` true.
 *
 * Elementor's Style tab is one section with three HEADINGS inside it — Title,
 * Percentage, Inner Text. Our panel draws sections, not headings inside a
 * section, so the three are three sections with Elementor's own heading words.
 * That is a difference a person can see and it is written here rather than
 * left for them to find.
 *
 * ── WHO OFFERS IT ─────────────────────────────────────────────────────────
 * `BUILDER_OFFERS_2026-09-19.json`: `website.elementor_free`,
 * `landing.elementor_free`, `proposal.elementor`. The legacy definition was
 * website + landing; the PROPOSAL panel gains it here. Not the newsletter, and
 * the offer file says why.
 *
 * ── DISPLAY PERCENTAGE IS NOT A `yes` ─────────────────────────────────────
 * Elementor stores this one switcher as the string `"show"`, not `"yes"`, and
 * the machine file is where that came from. `on()` in parts.ts reads `"show"`
 * as well as `"yes"` and `true`, which is the only reason the canvas and the
 * published page agree about a bar an author turned the number off on.
 */
import type { Widget } from "../../../model";
import { esc } from "../../../esc";
import type { RenderContext } from "../../../render";
import { pictureFrom } from "../../../pictures";
import { editRun } from "../../text";
import type { FamilyWidgetDef } from "../types";
import { TITLE_TAG_OPTIONS, WEIGHT_OPTIONS, colour, decl, num, on, px, str, tag } from "./parts";

/**
 * ELEMENTOR'S FOUR BAR TYPES, and the colour each one paints.
 *
 * Elementor's own stylesheet gives `info` / `success` / `warning` / `danger`
 * these four. They are written down here rather than defaulted, because
 * "anything that is not Default is blue" would be a decision nobody made.
 * An explicit Color always wins — it is the more specific answer.
 */
export const PROGRESS_TYPES: Readonly<Record<string, string>> = {
  info: "#5BC0DE",
  success: "#5CB85C",
  warning: "#F0AD4E",
  danger: "#D9534F",
};

export const PROGRESS_TYPE_OPTIONS = [
  { value: "", label: "Default" },
  { value: "info", label: "Info" },
  { value: "success", label: "Success" },
  { value: "warning", label: "Warning" },
  { value: "danger", label: "Danger" },
];

/** What the bar is filled to, as a whole percentage inside 0…100. */
export function progressPercent(props: Record<string, unknown>): number {
  const p: any = props || {};
  /* A page read back off a live site stores Elementor's SLIDER shape,
     `{ unit:"%", size:72 }`; our panel stores the plain number. Both are read
     so a round trip through a website does not blank the bar. */
  const raw = p.percent && typeof p.percent === "object" ? (p.percent as any).size : p.percent;
  return num(raw, 0, 0, 100);
}

export function renderProgressBar(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const pct = progressPercent(p);

  const fill = colour(p.bar_color)
    || PROGRESS_TYPES[str(p.progress_type)]
    || esc(ctx.accent);
  const track = colour(p.bar_bg_color) || "#E2E8F0";
  const height = px(p.bar_height, 2, 120) || "20px";
  const radius = px(p.bar_border_radius, 0, 100) || "999px";

  /* ── Style › Title ───────────────────────────────────────────────────── */
  const titleStyle = [
    decl("color", colour(p.title_color)),
    decl("font-size", px(p.typography_font_size, 8, 200)),
    decl("font-weight", esc(str(p.typography_font_weight))),
  ].join("");

  /* Display Title is Elementor's own switch and it defaults to on. */
  const title = on(p.title_display, true)
    ? editRun("title", p.title, "bx-progress-t", "What is this measuring?", ctx, tag(p.title_tag, "span"))
    : "";
  const titled = title ? `<div style="${titleStyle}">${title}</div>` : "";

  /* ── Style › Inner Text ──────────────────────────────────────────────── */
  const innerStyle = [
    decl("color", colour(p.bar_inline_color) || "#FFFFFF"),
    decl("font-size", px(p.bar_inner_typography_font_size, 6, 60) || "11px"),
  ].join("");

  /* Elementor draws the number AND the inner words inside the bar — the words
     first, then the percentage at the end. Both, not one or the other, which
     is what the widget this replaces got wrong. */
  const words = esc(str(p.inner_text));
  const number = on(p.display_percentage, true) ? `${pct}%` : "";
  const inside = [words, number].filter(Boolean).join(" ");

  return `<div class="bx-progress">
    ${titled}
    <div class="bx-progress-track" style="background:${track};border-radius:${radius};height:${height};overflow:hidden">
      <div class="bx-progress-fill" style="width:${pct}%;background:${fill};height:100%;${innerStyle}display:flex;align-items:center;justify-content:flex-end;padding-right:8px;box-sizing:border-box;white-space:nowrap">${inside}</div>
    </div>
  </div>`;
}

export const PROGRESS_BAR_DEF: FamilyWidgetDef = {
  kind: "progress_bar",
  /* ELEMENTOR'S OWN TITLE — the slug is `progress`, the tile says Progress Bar. */
  label: "Progress Bar",
  description: "A bar filled to a percentage — how far along something is.",
  icon: "BarChart3",
  picture: pictureFrom(`<rect x="6" y="16" width="52" height="10" rx="5" fill="#E2E8F0" stroke="none"/>`
    + `<rect x="6" y="16" width="34" height="10" rx="5" fill="#94A3B8" stroke="none"/>`),
  category: "General",
  builders: ["website", "landing", "proposal"],
  /* The machine file's own defaults, with two exceptions written down: its
     `title` is "My Skill" and its `inner_text` is "Web Designer", which are
     Elementor's demo words and would put somebody else's job title on a
     client's page. Empty is the honest default and the placeholder says what
     to type. */
  defaults: {
    title: "",
    title_tag: "span",
    title_display: true,
    progress_type: "",
    percent: 50,
    display_percentage: true,
    inner_text: "",
  },
  controls: [
    /* ── Content › Progress Bar — Elementor's own order ──────────────────── */
    { key: "title", label: "Title", type: "text", tab: "content", section: "Progress Bar" },
    { key: "title_tag", label: "Title HTML Tag", type: "select", tab: "content", section: "Progress Bar",
      options: TITLE_TAG_OPTIONS },
    { key: "title_display", label: "Display Title", type: "toggle", tab: "content", section: "Progress Bar" },
    { key: "progress_type", label: "Type", type: "select", tab: "content", section: "Progress Bar",
      options: PROGRESS_TYPE_OPTIONS },
    { key: "percent", label: "Percentage", type: "number", tab: "content", section: "Progress Bar" },
    { key: "display_percentage", label: "Display Percentage", type: "toggle", tab: "content", section: "Progress Bar" },
    { key: "inner_text", label: "Inner Text", type: "text", tab: "content", section: "Progress Bar" },

    /* ── Style › Title (Elementor's own heading inside its one Style section) */
    { key: "title_color", label: "Text Color", type: "colour", tab: "style", section: "Title" },
    { key: "typography_font_size", label: "Size", type: "number", tab: "style", section: "Title", responsive: true },
    { key: "typography_font_weight", label: "Weight", type: "select", tab: "style", section: "Title",
      options: WEIGHT_OPTIONS },

    /* ── Style › Percentage — which is Elementor's word for the BAR ──────── */
    { key: "bar_color", label: "Color", type: "colour", tab: "style", section: "Percentage" },
    { key: "bar_bg_color", label: "Background Color", type: "colour", tab: "style", section: "Percentage" },
    { key: "bar_height", label: "Height", type: "number", tab: "style", section: "Percentage" },
    { key: "bar_border_radius", label: "Border Radius", type: "number", tab: "style", section: "Percentage" },

    /* ── Style › Inner Text ──────────────────────────────────────────────── */
    { key: "bar_inline_color", label: "Color", type: "colour", tab: "style", section: "Inner Text" },
    { key: "bar_inner_typography_font_size", label: "Size", type: "number", tab: "style", section: "Inner Text",
      responsive: true },
  ],
};
