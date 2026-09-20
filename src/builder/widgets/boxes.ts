/**
 * builder/widgets/boxes.ts — two standard widgets that are a PANEL with words
 * in it: **Image Box** and **Alert**.
 *
 * D-165, scope §11.13.3. Names, groups and control sections from
 * `BUILDER_WIDGET_CATALOG_2026-09-17.elementor.json`, confirmed against the live
 * Playground editor on 2026-09-19.
 *
 * **Testimonial** was the third and has MOVED to
 * `widgets/families/f5-sliders-reviews/`, where the three sliders that repeat
 * a quote live (B-168). Its kind id and its stored props are unchanged; see the
 * note where it used to be, at the foot of this file.
 *
 * `alert` is what `callout` becomes. Elementor has a name for a tinted panel
 * that must not be skimmed past and it is Alert, so the invented "Callout panel"
 * goes and `upgrade.ts` converts every stored one.
 */
import type { Widget } from "../model";
import { esc } from "../esc";
import type { RenderContext } from "../render";
import type { WidgetDef } from "../registry";
import { bar, pictureFrom, solid } from "../pictures";
import { editRun, proseRun } from "./text";

const str = (v: unknown): string => (v == null ? "" : String(v));

/* ══════════════════════════════════════════════════════════════════════════
   Image Box — Elementor `image-box`, group General
   ══════════════════════════════════════════════════════════════════════════ */

export function renderImageBox(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const src = str(p.image);
  const side = str(p.position || "top") !== "top";
  const align = str(p.text_align) || (side ? "left" : "center");
  const width = Number(p.image_size) || (side ? 96 : 0);
  const pic = src
    ? `<img src="${esc(src)}" alt="${esc(str(p.image_alt))}" style="${width ? `width:${width}px;` : "width:100%;"}max-width:100%;border-radius:8px;display:block"/>`
    : ctx.mode === "edit"
      ? `<div class="bx-imgdrop" style="${width ? `width:${width}px;` : ""}">Choose a picture in the panel on the right.</div>`
      : "";
  return `<div class="bx-imagebox" style="display:flex;flex-direction:${side ? "row" : "column"};gap:12px;text-align:${esc(align)};align-items:${side ? "flex-start" : align === "center" ? "center" : "flex-start"}">
    ${pic ? `<div class="bx-imagebox-pic">${pic}</div>` : ""}
    <div class="bx-imagebox-body" style="flex:1 1 auto;min-width:0">
      ${editRun("title_text", p.title_text, "bx-h bx-h3", "A short title", ctx)}
      ${editRun("description_text", p.description_text, "bx-p", "A line about it", ctx, "p")}
    </div>
  </div>`;
}

export const IMAGE_BOX_DEF: WidgetDef = {
  kind: "image_box",
  label: "Image Box",
  description: "A picture with a title and a line under it.",
  icon: "GalleryVerticalEnd",
  picture: pictureFrom(solid(22, 4, 20, 14) + bar(18, 23, 28, 5) + bar(14, 32, 36)),
  category: "General",
  /* EMAIL TOO, since integration 2026-09-19. `adapters/email/emailRender.ts`
     builds a mailbox out of tables and its own guards refuse flex, grid and
     classes, so this widget waited for a TABLE renderer of its own rather than
     borrowing the engine's CSS one. It has one now (and LUMEN's copy draws the
     same bytes), so §11.13.3's standard set really is offered here. */
  /* NOT `brand` (D-165). The Template Studio is an ABSOLUTE-PIXEL canvas: every
     object carries its own x, y, w and h, and `adapters/mybrand`'s
     `insertWidget` places one layer per kind. A widget whose shape is a flow —
     an icon beside a title, a picture above a line of words — has nothing to
     place there, and a tile whose button does nothing is the drift the studio's
     own test exists to catch. The studio keeps **Icon**, which IS a placed
     object and which it has always placed. The ask for the rest is item S2 in
     the handoff. */
  adapters: ["proposal", "website", "email", "landing"],
  defaults: { image: "", image_alt: "", title_text: "", description_text: "", link: "", position: "top", text_align: "center", image_size: 0 },
  controls: [
    { key: "image", label: "Choose Image", type: "image", tab: "content", section: "Image Box" },
    { key: "image_alt", label: "Describe it", type: "text", tab: "content", section: "Image Box", help: "Read aloud by screen readers and shown if the picture fails to load." },
    { key: "title_text", label: "Title & Description", type: "text", tab: "content", section: "Image Box" },
    { key: "description_text", label: "Description", type: "textarea", tab: "content", section: "Image Box" },
    { key: "link", label: "Link", type: "link", tab: "content", section: "Image Box" },
    { key: "position", label: "Image Position", type: "select", tab: "style", section: "Image Box", options: [
      { value: "top", label: "Top" }, { value: "left", label: "Left" }, { value: "right", label: "Right" }] },
    { key: "text_align", label: "Alignment", type: "select", tab: "style", section: "Image Box", options: [
      { value: "left", label: "Left" }, { value: "center", label: "Centre" }, { value: "right", label: "Right" }] },
    { key: "image_size", label: "Width", type: "number", tab: "style", section: "Image" },
  ],
};

/* ══════════════════════════════════════════════════════════════════════════
   Alert — Elementor `alert`, group General. What `callout` becomes.
   ══════════════════════════════════════════════════════════════════════════ */

/** Elementor's four, with the tint and edge each one paints. */
export const ALERT_TYPES: Readonly<Record<string, { bg: string; edge: string; label: string }>> = {
  info: { bg: "#EFF6FF", edge: "#2563EB", label: "Info" },
  success: { bg: "#ECFDF5", edge: "#059669", label: "Success" },
  warning: { bg: "#FFFBEB", edge: "#D97706", label: "Warning" },
  danger: { bg: "#FEF2F2", edge: "#DC2626", label: "Danger" },
};

export function renderAlert(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const tone = ALERT_TYPES[str(p.alert_type)] || ALERT_TYPES.info;
  const title = str(p.alert_title);
  const body = str(p.alert_description);
  if (!title.trim() && !body.trim() && ctx.mode !== "edit") return "";
  return `<div class="bx-alert" style="background:${tone.bg};border-left:4px solid ${tone.edge};border-radius:6px;padding:10px 12px">
    ${editRun("alert_title", title, "bx-alert-t", "What must not be missed", ctx)}
    ${proseRun("alert_description", body, "bx-alert-b", "Say a little more", ctx)}
  </div>`;
}

export const ALERT_DEF: WidgetDef = {
  kind: "alert",
  label: "Alert",
  description: "A tinted panel for something that must not be skimmed past.",
  icon: "AlertCircle",
  picture: pictureFrom(`<rect x="8" y="10" width="48" height="20" rx="3" fill="#F1F5F9" stroke="#94A3B8"/>`
    + `<path d="M13 10v20" stroke="#64748B" stroke-width="3"/>` + bar(19, 15, 30) + bar(19, 22, 20)),
  category: "General",
  /* EMAIL TOO, since integration 2026-09-19. `adapters/email/emailRender.ts`
     builds a mailbox out of tables and its own guards refuse flex, grid and
     classes, so this widget waited for a TABLE renderer of its own rather than
     borrowing the engine's CSS one. It has one now (and LUMEN's copy draws the
     same bytes), so §11.13.3's standard set really is offered here. */
  /* NOT `brand` (D-165). The Template Studio is an ABSOLUTE-PIXEL canvas: every
     object carries its own x, y, w and h, and `adapters/mybrand`'s
     `insertWidget` places one layer per kind. A widget whose shape is a flow —
     an icon beside a title, a picture above a line of words — has nothing to
     place there, and a tile whose button does nothing is the drift the studio's
     own test exists to catch. The studio keeps **Icon**, which IS a placed
     object and which it has always placed. The ask for the rest is item S2 in
     the handoff. */
  adapters: ["proposal", "website", "email", "landing"],
  defaults: { alert_type: "info", alert_title: "", alert_description: "" },
  controls: [
    { key: "alert_type", label: "Type", type: "select", tab: "content", section: "Alert", options: [
      { value: "info", label: "Info" }, { value: "success", label: "Success" },
      { value: "warning", label: "Warning" }, { value: "danger", label: "Danger" }] },
    { key: "alert_title", label: "Title", type: "text", tab: "content", section: "Alert" },
    { key: "alert_description", label: "Content", type: "textarea", tab: "content", section: "Alert" },
  ],
};

/* renderTestimonial and TESTIMONIAL_DEF LIVED HERE and are MOVED (B-168, F5).
   testimonial is the free half of the sliders family — Reviews, Testimonial
   Carousel and Slides are the same quote repeated — so it now lives beside
   them in widgets/families/f5-sliders-reviews/testimonial.ts, with its kind
   id, its stored props and its documents unchanged. MOVED, not copied: two
   definitions of one kind is what families/index.ts throws on and what the
   registry test kinds are unique fails on. Replace means delete. */
