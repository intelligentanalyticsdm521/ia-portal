/**
 * Flip Box — Elementor `flip-box`, group Pro.
 *
 * Elementor's own title, its three Content sections (Front · Back · Settings)
 * and its two Style sections (Front · Back), with Elementor's own control
 * labels — "Graphic Element", "Choose Image", "Icon", "Title", "Description",
 * "Button Text", "Link", "Apply Link On", "Title HTML Tag", "Description HTML
 * Tag", "Height", "Border Radius", "Flip Effect", "Flip Direction", "3D Depth",
 * and the Style tab's "Color", "Alignment", "Text Color". Read off
 * `BUILDER_WIDGET_CATALOG_2026-09-17.pro.json`. NOT seen live — the Playground
 * sandbox is free Elementor only.
 *
 * Offered on website and landing, which is where the offer file lists it.
 *
 * ── THE FLIP IS CSS, AND BOTH FACES ARE ALWAYS IN THE PAGE ────────────────
 * Elementor flips this on hover. Hover is not a thing on a phone, and a widget
 * whose back face only exists behind a hover is a widget half our visitors
 * never see — so both faces are in the markup, always, and the CSS that hides
 * one of them is scoped to this widget's own id and wrapped in
 * `@media (hover: hover)`. On a touch screen, and with styles or scripts
 * switched off, the reader gets the front face and the back face stacked, which
 * is every word the author wrote. No JavaScript is involved on our side at all.
 */
import type { Widget } from "../../../model";
import { esc } from "../../../esc";
import { type RenderContext } from "../../../render";
import { pictureFrom, bar, box } from "../../../pictures";
import { editRun, proseRun } from "../../text";
import { DEFAULT_ICON, ICON_OPTIONS, glyphFor } from "../../glyph";
import type { FamilyWidgetDef } from "../types";
import { TAG_OPTIONS, buttonHtml, safeTag, str, textAlign } from "./shared";

/** Elementor's six flip effects, and the transform each face starts from. */
const EFFECTS: Readonly<Record<string, { in: string; out: string }>> = {
  flip: { in: "rotateY(0)", out: "rotateY(180deg)" },
  slide: { in: "translateX(0)", out: "translateX(-100%)" },
  push: { in: "translateY(0)", out: "translateY(-100%)" },
  "zoom-in": { in: "scale(1)", out: "scale(1.4)" },
  "zoom-out": { in: "scale(1)", out: "scale(0.6)" },
  fade: { in: "none", out: "none" },
};

/** `up | down | left | right` → the axis and sign the flip travels on. */
function directed(effect: string, direction: string): { a: string; b: string } {
  const e = EFFECTS[effect] || EFFECTS.flip;
  if (effect === "flip") {
    const axis = direction === "left" || direction === "right" ? "Y" : "X";
    const sign = direction === "left" || direction === "up" ? "" : "-";
    return { a: `rotate${axis}(0)`, b: `rotate${axis}(${sign}180deg)` };
  }
  if (effect === "slide" || effect === "push") {
    const axis = direction === "left" || direction === "right" ? "X" : "Y";
    const sign = direction === "left" || direction === "up" ? "-" : "";
    return { a: "translate(0,0)", b: `translate${axis}(${sign}100%)` };
  }
  return { a: e.in, b: e.out };
}

/** One face of the card. Both are always drawn; the CSS decides which shows. */
function face(opts: {
  side: "a" | "b";
  html: string;
  background: string;
  align: string;
  radius: number;
}): string {
  return `<div class="bx-f3-flip-face bx-f3-flip-${opts.side}" style="`
    + `display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;`
    + `padding:20px;text-align:${opts.align};background:${esc(opts.background)};`
    + `border-radius:${opts.radius}px;height:100%;box-sizing:border-box;`
    + `backface-visibility:hidden">${opts.html}</div>`;
}

export function renderFlipBox(w: Widget, ctx: RenderContext): string {
  const p = (w.props || {}) as Record<string, unknown>;
  const titleA = str(p.title_text_a);
  const bodyA = str(p.description_text_a);
  const titleB = str(p.title_text_b);
  const bodyB = str(p.description_text_b);
  if (!titleA.trim() && !bodyA.trim() && !titleB.trim() && !bodyB.trim() && ctx.mode !== "edit") return "";

  const titleTag = safeTag(p.title_tag, "h3");
  const radius = Math.max(0, Math.min(60, Number(p.border_radius) || 0));
  const height = Math.max(120, Math.min(1200, Number(p.height) || 280));

  /* THE FRONT'S GRAPHIC — Elementor's `none | image | icon`, above the title. */
  const graphic = (() => {
    const kind = str(p.graphic_element) || "icon";
    if (kind === "icon") {
      const size = Math.max(12, Math.min(96, Number(p.icon_size) || 36));
      const colour = str(p.icon_primary_color) || ctx.accent;
      return `<div class="bx-f3-flip-graphic" style="font-size:${size}px;line-height:1;color:${esc(colour)}">${glyphFor(p.selected_icon)}</div>`;
    }
    if (kind === "image" && str(p.image)) {
      return `<img class="bx-f3-flip-graphic" src="${esc(str(p.image))}" alt="" style="display:block;max-width:60%;height:auto"/>`;
    }
    return "";
  })();

  const frontHtml = `${graphic}
    <div style="color:${esc(str(p.title_color_a) || ctx.ink)}">${editRun("title_text_a", titleA, "bx-h bx-f3-flip-title", "The front of the card", ctx, titleTag)}</div>
    <div style="color:${esc(str(p.description_color_a) || "#5A7A8A")}">${proseRun("description_text_a", bodyA, "bx-p bx-f3-flip-body", "A line on the front", ctx)}</div>`;

  const backButton = buttonHtml({
    text: str(p.button_text),
    /* Elementor's `link_click`: `box` puts the link on the whole back face and
       `button` on the button. One anchor, never two nested. */
    href: str(p.link_click) === "box" ? "" : str(p.link),
    background: str(p.button_background_color) || ctx.accent,
    colour: str(p.button_text_color) || "#FFFFFF",
    mode: ctx.mode,
    editPath: "button_text",
    placeholder: "Button text",
  });

  const backHtml = `<div style="color:${esc(str(p.title_color_b) || "#FFFFFF")}">${editRun("title_text_b", titleB, "bx-h bx-f3-flip-title", "The back of the card", ctx, titleTag)}</div>
    <div style="color:${esc(str(p.description_color_b) || "#E2E8F0")}">${proseRun("description_text_b", bodyB, "bx-p bx-f3-flip-body", "A line on the back", ctx)}</div>
    ${backButton ? `<div class="bx-f3-flip-action" style="margin-top:6px">${backButton}</div>` : ""}`;

  const front = face({
    side: "a", html: frontHtml, align: textAlign(p.alignment_a, "center"), radius,
    background: str(p.background_a_color) || "#F1F5F9",
  });
  const backFace = face({
    side: "b", html: backHtml, align: textAlign(p.alignment_b, "center"), radius,
    background: str(p.background_b_color) || ctx.accent,
  });
  const boxLink = str(p.link_click) === "box" ? str(p.link) : "";
  const back = boxLink
    ? `<a class="bx-f3-flip-boxlink" href="${esc(boxLink)}" style="display:block;height:100%;text-decoration:none;color:inherit">${backFace}</a>`
    : backFace;

  /* THE ONE PLACE A STYLE RULE IS NEEDED, and it is scoped to this widget.
     :hover cannot be written inline, and `@media (hover: hover)` is what keeps
     the back face reachable on a touch screen. The id is the widget's own, so
     two flip boxes on a page never fight, and nothing outside this element can
     be matched by these three rules. */
  const id = `bxflip-${String(w.id || "w").replace(/[^A-Za-z0-9_-]/g, "")}`;
  const effect = str(p.flip_effect) || "flip";
  const { a, b } = directed(effect, str(p.flip_direction) || "up");
  const depth = str(p.flip_3d) !== "" ? "perspective(1000px);" : "";
  const css = `@media (hover: hover) {
    #${id}{position:relative;transform-style:preserve-3d;${depth ? `perspective:1000px;` : ""}}
    #${id} > .bx-f3-flip-pane{position:absolute;inset:0;transition:transform .5s ease, opacity .5s ease}
    #${id} > .bx-f3-flip-pane-a{transform:${a};opacity:1}
    #${id} > .bx-f3-flip-pane-b{transform:${b};opacity:${effect === "fade" ? "0" : "1"}}
    #${id}:hover > .bx-f3-flip-pane-a{transform:${b === a ? a : b};opacity:${effect === "fade" ? "0" : "1"}}
    #${id}:hover > .bx-f3-flip-pane-b{transform:${a};opacity:1}
  }`;

  return `<div class="bx-f3-flip" id="${esc(id)}" style="min-height:${height}px">
    <style>${css}</style>
    <div class="bx-f3-flip-pane bx-f3-flip-pane-a" style="min-height:${height}px">${front}</div>
    <div class="bx-f3-flip-pane bx-f3-flip-pane-b" style="min-height:${height}px">${back}</div>
  </div>`;
}

export const FLIP_BOX_DEF: FamilyWidgetDef = {
  kind: "flip_box",
  label: "Flip Box",
  description: {
    website: "A card that turns over when you point at it, to show what is on the back.",
    landing: "A card that turns over when you point at it, to show what is on the back.",
  },
  icon: "FlipHorizontal2",
  picture: pictureFrom(
    box(6, 8, 34, 24) + bar(12, 16, 20, 4) + bar(12, 24, 14)
    + `<rect x="30" y="12" width="28" height="20" rx="3" fill="#94A3B8" stroke="none"/>`),
  category: "General",
  builders: ["website", "landing"],
  tier: "pro",
  defaults: {
    graphic_element: "icon",
    image: "",
    image_size: "thumbnail",
    selected_icon: { ...DEFAULT_ICON },
    title_text_a: "",
    description_text_a: "",
    title_text_b: "",
    description_text_b: "",
    button_text: "",
    link: "",
    link_click: "button",
    title_tag: "h3",
    description_tag: "div",
    height: 280,
    border_radius: 8,
    flip_effect: "flip",
    flip_direction: "up",
    flip_3d: "",
    background_a_color: "",
    alignment_a: "center",
    icon_primary_color: "",
    icon_size: 36,
    title_color_a: "",
    description_color_a: "",
    background_b_color: "",
    alignment_b: "center",
    title_color_b: "",
    description_color_b: "",
    button_text_color: "",
    button_background_color: "",
  },
  controls: [
    /* ── Content: Front · Back · Settings, Elementor's own three ────────── */
    { key: "graphic_element", label: "Graphic Element", type: "select", tab: "content", section: "Front", options: [
      { value: "none", label: "None" }, { value: "image", label: "Image" }, { value: "icon", label: "Icon" }] },
    { key: "image", label: "Choose Image", type: "image", tab: "content", section: "Front" },
    { key: "selected_icon", label: "Icon", type: "select", tab: "content", section: "Front", options: ICON_OPTIONS },
    { key: "title_text_a", label: "Title", type: "text", tab: "content", section: "Front" },
    { key: "description_text_a", label: "Description", type: "textarea", tab: "content", section: "Front" },

    { key: "title_text_b", label: "Title", type: "text", tab: "content", section: "Back" },
    { key: "description_text_b", label: "Description", type: "textarea", tab: "content", section: "Back" },
    { key: "button_text", label: "Button Text", type: "text", tab: "content", section: "Back" },
    { key: "link", label: "Link", type: "link", tab: "content", section: "Back" },
    { key: "link_click", label: "Apply Link On", type: "select", tab: "content", section: "Back", options: [
      { value: "box", label: "Whole Box" }, { value: "button", label: "Button Only" }] },

    { key: "title_tag", label: "Title HTML Tag", type: "select", tab: "content", section: "Settings", options: TAG_OPTIONS },
    { key: "description_tag", label: "Description HTML Tag", type: "select", tab: "content", section: "Settings", options: TAG_OPTIONS },
    { key: "height", label: "Height", type: "number", tab: "content", section: "Settings", responsive: true },
    { key: "border_radius", label: "Border Radius", type: "number", tab: "content", section: "Settings" },
    { key: "flip_effect", label: "Flip Effect", type: "select", tab: "content", section: "Settings", options: [
      { value: "flip", label: "Flip" }, { value: "slide", label: "Slide" }, { value: "push", label: "Push" },
      { value: "zoom-in", label: "Zoom In" }, { value: "zoom-out", label: "Zoom Out" }, { value: "fade", label: "Fade" }] },
    { key: "flip_direction", label: "Flip Direction", type: "select", tab: "content", section: "Settings", options: [
      { value: "left", label: "Left" }, { value: "right", label: "Right" },
      { value: "up", label: "Up" }, { value: "down", label: "Down" }] },
    { key: "flip_3d", label: "3D Depth", type: "toggle", tab: "content", section: "Settings",
      help: "Give the turn some depth" },

    /* ── Style: Front and Back, Elementor's own two ──────────────────────
       WITH ELEMENTOR'S OWN SUB-HEADINGS IN THE SECTION NAME, and that is not a
       flourish: inside "Front" the machine file has four `heading` controls —
       Icon, Image, Title, Description — and FIVE of the controls under them are
       labelled "Text Color" or "Color". Flatten the sub-headings away and the
       panel reads "Color, Text Color, Text Color" with nothing saying which is
       which. Our `section` is one string, so the sub-heading goes in it and
       every LABEL stays exactly the word Elementor uses. */
    { key: "background_a_color", label: "Color", type: "colour", tab: "style", section: "Front" },
    { key: "alignment_a", label: "Alignment", type: "select", tab: "style", section: "Front", options: [
      { value: "start", label: "Left" }, { value: "center", label: "Centre" }, { value: "end", label: "Right" }] },
    { key: "icon_primary_color", label: "Primary Color", type: "colour", tab: "style", section: "Front · Icon" },
    { key: "icon_size", label: "Icon Size", type: "number", tab: "style", section: "Front · Icon" },
    { key: "title_color_a", label: "Text Color", type: "colour", tab: "style", section: "Front · Title" },
    { key: "description_color_a", label: "Text Color", type: "colour", tab: "style", section: "Front · Description" },

    { key: "background_b_color", label: "Color", type: "colour", tab: "style", section: "Back" },
    { key: "alignment_b", label: "Alignment", type: "select", tab: "style", section: "Back", options: [
      { value: "start", label: "Left" }, { value: "center", label: "Centre" }, { value: "end", label: "Right" }] },
    { key: "title_color_b", label: "Text Color", type: "colour", tab: "style", section: "Back · Title" },
    { key: "description_color_b", label: "Text Color", type: "colour", tab: "style", section: "Back · Description" },
    { key: "button_text_color", label: "Text Color", type: "colour", tab: "style", section: "Back · Button" },
    { key: "button_background_color", label: "Color", type: "colour", tab: "style", section: "Back · Button" },
  ],
};
