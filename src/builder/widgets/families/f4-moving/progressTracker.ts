/**
 * f4-moving/progressTracker.ts — Elementor's **Progress Tracker**, by its own
 * name, group, panel sections, control labels and defaults.
 *
 * Machine truth, not memory: `BUILDER_WIDGET_CATALOG_2026-09-17.pro.json`
 * `widgets["progress-tracker"]` — title *Progress Tracker*, icon
 * `eicon-progress-tracker`, Content sections **Progress Tracker**, Style
 * sections **Tracker** and **Content**. Every key below is one of that
 * widget's own keys; `test/families-f4-moving.test.mjs` checks the emitted set
 * against `WIDGET_SETTINGS_KEYS.json`, so a key Elementor does not have cannot
 * reach a published page and be dropped there in silence.
 *
 * ── WHO OFFERS IT ─────────────────────────────────────────────────────────
 * `BUILDER_OFFERS_2026-09-19.json`: `website.elementor_pro` and
 * `landing.elementor_pro`. Not the newsletter, not a proposal, not My Brand —
 * a bar that fills as the reader scrolls has nothing to do in a mailbox or on
 * paper, and the offer file says so by leaving it out.
 *
 * ── THE PUBLISHED PAGE NEEDS JAVASCRIPT; THE CANVAS MUST NOT ──────────────
 * On a real site Elementor's own script fills the bar against the scroll
 * position. Our canvas draws the bar STILL, at the start, with the words that
 * say what it will do — because a widget that needs a script to be visible in
 * the editor is a widget the author cannot edit in place. The hosted landing
 * page gets the same still bar: one HTML file and a stylesheet, no script, so
 * the reader sees an honest empty tracker rather than nothing at all.
 */
import type { Widget } from "../../../model";
/* `esc` comes from the LEAF module, never from `render`: importing a value out
   of render.ts pulls `widgets/families/index.ts` into this file's own graph and
   its top-level `const FAMILIES` is then read while this module is still
   evaluating. See builder/esc.ts for the exact ReferenceError. */
import { esc } from "../../../esc";
import type { RenderContext } from "../../../render";
import { bar, box, pictureFrom } from "../../../pictures";
import type { FamilyWidgetDef } from "../types";

const str = (v: unknown): string => (v == null ? "" : String(v));

/** Elementor's two tracker types, and nothing else. */
export const TRACKER_TYPES = ["horizontal", "circular"] as const;

/** Is the percentage number shown? Elementor stores the switcher as yes / "". */
export function showsPercentage(props: Record<string, unknown>): boolean {
  const v = props?.percentage;
  return v === true || v === "yes";
}

export function renderProgressTracker(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const circular = str(p.type) === "circular";
  const colour = esc(str(p.horizontal_color_color) || ctx.accent);
  const track = esc(str(p.horizontal_background_color_color) || "#E2E8F0");
  const height = Math.max(2, Math.min(60, Number(p.horizontal_height) || 10));
  const align = str(p.align) === "center" ? "center" : str(p.align) === "right" ? "right" : "left";
  const pct = showsPercentage(p)
    ? `<span class="bx-track-pct" style="font-size:12px;color:${esc(str(p.percentage_color) || "#475569")}">0%</span>`
    : "";
  /* The words under it, in edit mode only. The author needs to know the bar is
     still on purpose; the visitor does not need to be told how the page works. */
  const note = ctx.mode === "edit"
    ? `<div class="bx-card-note">This fills as the reader scrolls down the published page.</div>`
    : "";

  if (circular) {
    const size = Math.max(40, Math.min(240, Number(p.circular_size) || 120));
    const width = Math.max(2, Math.min(40, Number(p.circular_width) || 8));
    const ring = esc(str(p.circular_color) || ctx.accent);
    const ringTrack = esc(str(p.circular_background_color) || "#E2E8F0");
    return `<div class="bx-tracker bx-tracker-circular" style="text-align:${align}">
      <div style="display:inline-block;width:${size}px;height:${size}px;border-radius:50%;border:${width}px solid ${ringTrack};border-top-color:${ring};box-sizing:border-box"></div>
      ${pct}${note}
    </div>`;
  }

  return `<div class="bx-tracker bx-tracker-horizontal" style="text-align:${align}">
    <div class="bx-tracker-track" style="background:${track};border-radius:999px;height:${height}px;overflow:hidden">
      <div class="bx-tracker-fill" style="width:0%;background:${colour};height:100%"></div>
    </div>
    ${pct}${note}
  </div>`;
}

export const PROGRESS_TRACKER_DEF: FamilyWidgetDef = {
  kind: "progress_tracker",
  /* ELEMENTOR'S OWN TITLE. Not "Scroll bar", not "Reading progress". */
  label: "Progress Tracker",
  description: "A thin bar across the page that fills as the visitor scrolls down it.",
  icon: "LoaderCircle",
  picture: pictureFrom(box(6, 6, 52, 6)
    + `<rect x="6" y="6" width="22" height="6" rx="3" fill="#94A3B8" stroke="none"/>`
    + bar(10, 20, 44) + bar(10, 27, 34)),
  /* ELEMENTOR'S OWN GROUP, which is **Pro**.
     Wave 1 of this family wrote `General` and said why: the panel had four
     groups and a fifth invented here would have been a second answer to "what
     groups does the panel have". b168/override then gave the panel Elementor
     Pro's own six — Layout, Basic, Pro, General, Site, Intelligent Analytics —
     so the true group now exists and the reason for the compromise is gone.
     `test/builder-widget-set.test.mjs` names the difference out loud:
     "Progress Tracker is in General; Elementor draws it in Pro." */
  category: "Pro",
  builders: ["website", "landing"],
  tier: "pro",
  defaults: {
    type: "horizontal",
    relative_to: "entire_page",
    selector: "",
    direction: "",
    percentage: "",
    percentage_position: "",
  },
  controls: [
    /* ── Content › Progress Tracker — Elementor's own section and labels ── */
    { key: "type", label: "Tracker Type", type: "select", tab: "content", section: "Progress Tracker",
      options: [{ value: "horizontal", label: "Horizontal" }, { value: "circular", label: "Circular" }] },
    { key: "relative_to", label: "Progress relative to", type: "select", tab: "content", section: "Progress Tracker",
      options: [
        { value: "entire_page", label: "Entire Page" },
        { value: "post_content", label: "Post Content" },
        { value: "selector", label: "Selector" }] },
    { key: "selector", label: "Selector", type: "text", tab: "content", section: "Progress Tracker",
      help: "Only when the bar tracks one part of the page. Leave it empty for the whole page." },
    { key: "direction", label: "Direction", type: "select", tab: "content", section: "Progress Tracker",
      options: [{ value: "ltr", label: "Left to Right" }, { value: "rtl", label: "Right to Left" }] },
    { key: "percentage", label: "Percentage", type: "toggle", tab: "content", section: "Progress Tracker" },
    /* `responsive` copied from the machine file, never guessed: Elementor marks
       this one responsive and stores `_tablet` / `_mobile` beside it. */
    { key: "percentage_position", label: "Percentage Position", type: "select", tab: "content",
      section: "Progress Tracker", responsive: true,
      options: [{ value: "ltr", label: "Start" }, { value: "rtl", label: "End" }] },

    /* ── Style › Tracker ─────────────────────────────────────────────────── */
    { key: "align", label: "Alignment", type: "select", tab: "style", section: "Tracker",
      options: [{ value: "left", label: "Left" }, { value: "center", label: "Centre" }, { value: "right", label: "Right" }] },
    { key: "horizontal_color_color", label: "Color", type: "colour", tab: "style", section: "Tracker" },
    { key: "horizontal_background_color_color", label: "Background Color", type: "colour", tab: "style", section: "Tracker" },
    { key: "horizontal_height", label: "Height", type: "number", tab: "style", section: "Tracker" },
    { key: "circular_size", label: "Size", type: "number", tab: "style", section: "Tracker",
      help: "Only used when the tracker is circular." },
    { key: "circular_color", label: "Progress Indicator Color", type: "colour", tab: "style", section: "Tracker" },
    { key: "circular_width", label: "Width", type: "number", tab: "style", section: "Tracker" },
    { key: "circular_background_color", label: "Tracker Background Color", type: "colour", tab: "style", section: "Tracker" },

    /* ── Style › Content ─────────────────────────────────────────────────── */
    { key: "percentage_color", label: "Color", type: "colour", tab: "style", section: "Content" },
  ],
};
