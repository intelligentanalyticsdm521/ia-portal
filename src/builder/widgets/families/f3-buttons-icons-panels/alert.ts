/**
 * Alert — Elementor `alert`, group General.
 *
 * ── WHAT IT REPLACES ──────────────────────────────────────────────────────
 * `widgets/boxes.ts`'s `ALERT_DEF`: three controls, all on Content, and a
 * renderer with the four tints hard-coded. No Style tab at all — an author
 * could not change the background, the side bar, the type or the words'
 * colour, and there was no dismiss button, which is half of what an Alert is.
 *
 * SAME KIND (`alert`). `alert_type`, `alert_title` and `alert_description` are
 * the props it always stored and they are read unchanged.
 *
 * ── ELEMENTOR'S OWN PANEL ─────────────────────────────────────────────────
 * Content ▸ Alert: Type · Title · Content · Dismiss Icon (switch) · Icon.
 * Style ▸ Alert: Background Color · Side Border Color · Side Border Width.
 * Style ▸ Title: Text Color · Size (responsive) · Weight.
 * Style ▸ Description: Text Color · Size (responsive).
 * Style ▸ Dismiss Icon: Size (responsive) · Color.
 *
 * Left out and named in the handoff: the two full Typography popovers minus the
 * three controls above, both Text Shadow groups, and the dismiss icon's
 * Vertical Position, Horizontal Position, Hover Color and Transition Duration.
 */
import type { Widget } from "../../../model";
import { esc } from "../../../esc";
import type { RenderContext } from "../../../render";
import { pictureFrom, bar } from "../../../pictures";
import { editRun, proseRun } from "../../text";
import { ICON_OPTIONS, glyphFor } from "../../glyph";
import type { FamilyWidgetDef } from "../types";
import { str } from "./shared";
import { FONT_WEIGHT_OPTIONS, RESPONSIVE, colour, num, on, typeCss } from "./deep";

/** Elementor's four types, and the tint and edge each one really draws. */
const ALERT_TYPES: Record<string, { bg: string; edge: string }> = {
  info: { bg: "#E8F4FA", edge: "#5BC0DE" },
  success: { bg: "#EAF6EC", edge: "#5CB85C" },
  warning: { bg: "#FEF3E8", edge: "#F0AD4E" },
  danger: { bg: "#FDECEA", edge: "#D9534F" },
};

export function renderAlert(w: Widget, ctx: RenderContext): string {
  const p = (w.props || {}) as Record<string, unknown>;
  const tone = ALERT_TYPES[str(p.alert_type)] || ALERT_TYPES.info;

  const title = str(p.alert_title);
  const body = str(p.alert_description);
  if (!title.trim() && !body.trim() && ctx.mode !== "edit") return "";

  const background = colour(p.background, tone.bg);
  const edge = colour(p.border_color, tone.edge);
  /* Elementor's key really is spelled `border_left-width`, with a hyphen in
     the middle. Kept literally, because the arion emitter publishes it under
     Elementor's own key and the contract helper refuses a key Elementor does
     not have. */
  const edgeWidth = num(p["border_left-width"], 4, 0, 40);

  const titleStyle = `color:${esc(colour(p.title_color, ctx.ink))};`
    + (typeCss(p.alert_title_font_size, p.alert_title_font_weight, "") || "font-weight:600;");
  const bodyStyle = `color:${esc(colour(p.description_color, "#42606E"))};`
    + typeCss(p.alert_description_font_size, "", "");

  /* THE DISMISS BUTTON. Elementor shows it by default and ours never had one.
     It really closes the panel, and it does it WITHOUT A LINE OF JAVASCRIPT: a
     hidden checkbox, a label the reader presses, and one CSS rule scoped to
     this widget's own id. No script means no Content-Security-Policy argument
     on a client's site, nothing to load, and it still works on a page served
     as a static file. On the canvas the label is inert — an author pressing it
     while editing should not make their own widget vanish. */
  const scope = `bxa-${String(w.id || "w").replace(/[^A-Za-z0-9_-]/g, "")}`;
  const glyph = str((p.dismiss_icon as { value?: unknown })?.value ?? p.dismiss_icon).trim()
    ? glyphFor(p.dismiss_icon) : "×";
  const xSize = num(p.dismiss_icon_size, 16, 8, 64);
  const xInk = colour(p.dismiss_icon_normal_color, edge);
  /* ELEMENTOR'S SWITCHER STORES THE WORD "show", NOT "yes". Its `return_value`
     for this one control is `show`, the panel's own checkbox writes a boolean,
     and a widget nobody has touched has nothing stored at all — Elementor shows
     the button in that case. All three answers, in one line, because reading
     only `on()` made the dismiss button never appear and the test that drives
     it is what said so. */
  const wantDismiss = p.show_dismiss === undefined || p.show_dismiss === "show" || on(p.show_dismiss);
  const editing = ctx.mode === "edit";
  const dismiss = wantDismiss
    ? `<label class="bx-alert-x" aria-label="Dismiss" ${editing ? "" : `for="${scope}-x" `}style="cursor:${
      editing ? "default" : "pointer"};line-height:1;padding:0 0 0 12px;flex:0 0 auto;font-size:${xSize}px;color:${esc(xInk)}">${glyph}</label>`
    : "";
  const gate = wantDismiss && !editing
    ? `<style>#${scope}-x{display:none}#${scope}-x:checked + .bx-alert{display:none}</style><input type="checkbox" id="${scope}-x" aria-hidden="true"/>`
    : "";

  return `${gate}<div class="bx-alert" role="alert" style="display:flex;align-items:flex-start;background:${esc(background)};border-left:${edgeWidth}px solid ${esc(edge)};border-radius:6px;padding:10px 12px">
    <div style="flex:1 1 auto;min-width:0">
      <div class="bx-alert-tw" style="${titleStyle}">${editRun("alert_title", title, "bx-alert-t", "What must not be missed", ctx)}</div>
      <div class="bx-alert-bw" style="${bodyStyle}">${proseRun("alert_description", body, "bx-alert-b", "Say a little more", ctx)}</div>
    </div>
    ${dismiss}
  </div>`;
}

export const ALERT_DEF: FamilyWidgetDef = {
  kind: "alert",
  label: "Alert",
  description: "A tinted panel for something that must not be skimmed past.",
  icon: "AlertCircle",
  picture: pictureFrom(`<rect x="8" y="10" width="48" height="20" rx="3" fill="#F1F5F9" stroke="#94A3B8"/>`
    + `<path d="M13 10v20" stroke="#64748B" stroke-width="3"/>` + bar(19, 15, 30) + bar(19, 22, 20)),
  category: "General",
  /* NOT `mybrand`: the studio places layers and the offer file's list of ten
     does not include Alert. */
  builders: ["website", "landing", "newsletter", "proposal"],
  defaults: {
    alert_type: "info", alert_title: "", alert_description: "",
    show_dismiss: "show", dismiss_icon: { value: "", library: "" },
    background: "", border_color: "", "border_left-width": 4,
    title_color: "", alert_title_font_size: 0, alert_title_font_weight: "",
    description_color: "", alert_description_font_size: 0,
    dismiss_icon_size: 16, dismiss_icon_normal_color: "",
  },
  controls: [
    /* ── Content ▸ Alert ──────────────────────────────────────────────── */
    { key: "alert_type", label: "Type", type: "select", tab: "content", section: "Alert", options: [
      { value: "info", label: "Info" }, { value: "success", label: "Success" },
      { value: "warning", label: "Warning" }, { value: "danger", label: "Danger" }] },
    { key: "alert_title", label: "Title", type: "text", tab: "content", section: "Alert" },
    { key: "alert_description", label: "Content", type: "textarea", tab: "content", section: "Alert" },
    { key: "show_dismiss", label: "Dismiss Icon", type: "toggle", tab: "content", section: "Alert",
      help: "Let the reader close it" },
    { key: "dismiss_icon", label: "Icon", type: "select", tab: "content", section: "Alert", options: ICON_OPTIONS },

    /* ── Style ▸ Alert ────────────────────────────────────────────────── */
    { key: "background", label: "Background Color", type: "colour", tab: "style", section: "Alert" },
    { key: "border_color", label: "Side Border Color", type: "colour", tab: "style", section: "Alert" },
    { key: "border_left-width", label: "Side Border Width", type: "number", tab: "style", section: "Alert" },

    /* ── Style ▸ Title ────────────────────────────────────────────────── */
    { key: "title_color", label: "Text Color", type: "colour", tab: "style", section: "Title" },
    { key: "alert_title_font_size", label: "Size", type: "number", tab: "style", section: "Title", responsive: RESPONSIVE },
    { key: "alert_title_font_weight", label: "Weight", type: "select", tab: "style", section: "Title", options: FONT_WEIGHT_OPTIONS },

    /* ── Style ▸ Description ──────────────────────────────────────────── */
    { key: "description_color", label: "Text Color", type: "colour", tab: "style", section: "Description" },
    { key: "alert_description_font_size", label: "Size", type: "number", tab: "style", section: "Description", responsive: RESPONSIVE },

    /* ── Style ▸ Dismiss Icon ─────────────────────────────────────────── */
    { key: "dismiss_icon_size", label: "Size", type: "number", tab: "style", section: "Dismiss Icon", responsive: RESPONSIVE },
    { key: "dismiss_icon_normal_color", label: "Color", type: "colour", tab: "style", section: "Dismiss Icon" },
  ],
};

export default ALERT_DEF;
