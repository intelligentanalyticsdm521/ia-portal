/**
 * families/f2-pictures/hotspot.ts — Elementor PRO's **Hotspot**.
 *
 * One picture with clickable dots on it, each with a label and a tooltip. Offer
 * file: `website.elementor_pro` and `landing.elementor_pro`.
 *
 * Sections, labels, options, defaults and the repeater's own field names from
 * `BUILDER_WIDGET_CATALOG_2026-09-17.pro.json`, widget `hotspot` — the fields
 * are Elementor's own: `hotspot_label`, `hotspot_link`, `hotspot_tooltip_
 * content`, `hotspot_offset_x`, `hotspot_offset_y`.
 *
 * ── NO JAVASCRIPT, AND NOTHING HIDDEN FROM THE AUTHOR ─────────────────────
 * On a live page the tooltip appears on click or hover, which needs a script.
 * Ours draws the dots in place AND prints every label and tooltip in a plain
 * list under the picture. So an author sees their own words without hovering
 * twenty dots, a visitor whose browser runs nothing reads all of them, and a
 * printed page still carries the content. One markup, three jobs.
 */
import { esc } from "../../../esc";
import { bar, box, pictureFrom } from "../../../pictures";
import type { Widget } from "../../../model";
import type { RenderContext } from "../../../render";
import type { FamilyWidgetDef } from "../types";
import { IMAGE_SIZE_OPTIONS, emptyDrop, img, mediaUrl, rows, str } from "./media";

/** A percentage inside the picture, from whatever the repeater row stored. */
function pct(v: unknown, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, n));
}

/** One dot's words: its label, and the tooltip under it. */
function dotWords(row: any): { label: string; tip: string; link: string } {
  return {
    label: str(row && row.hotspot_label),
    tip: str(row && row.hotspot_tooltip_content),
    link: mediaUrl(row && row.hotspot_link),
  };
}

export function renderHotspot(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const src = mediaUrl(p.image);
  if (!src) {
    return emptyDrop(ctx.mode, "Choose the picture for these hotspots in the panel on the right.");
  }
  const spots = rows(p.hotspot);
  const colour = str(p.style_hotspot_color) || ctx.accent;

  const dots = spots.map((row, i) => {
    const { label } = dotWords(row);
    const x = pct(row && row.hotspot_offset_x, 50);
    const y = pct(row && row.hotspot_offset_y, 50);
    return `<span class="bx-hotspot-dot" style="position:absolute;left:${x}%;top:${y}%;transform:translate(-50%,-50%);background:${esc(colour)};color:#FFFFFF;border-radius:999px;min-width:22px;height:22px;padding:0 6px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;box-shadow:0 0 0 3px rgba(255,255,255,.7)">${
      esc(label || String(i + 1))}</span>`;
  }).join("");

  const listed = spots.map((row, i) => {
    const { label, tip, link } = dotWords(row);
    if (!label && !tip) return "";
    const name = esc(label || `Point ${i + 1}`);
    const head = link ? `<a href="${esc(link)}" style="color:inherit">${name}</a>` : name;
    return `<li style="margin:0 0 4px 0"><strong>${head}</strong>${tip ? ` — ${esc(tip)}` : ""}</li>`;
  }).join("");

  return `<div class="bx-hotspot">
    <div class="bx-hotspot-pic" style="position:relative;display:block">
      ${img(src, "", "width:100%;display:block;border-radius:8px")}
      ${dots}
    </div>
    ${listed ? `<ul class="bx-hotspot-list" style="list-style:none;padding:8px 0 0 0;margin:0;font-size:13px">${listed}</ul>` : ""}
  </div>`;
}

export const HOTSPOT_DEF: FamilyWidgetDef = {
  kind: "hotspot",
  label: "Hotspot",
  description: {
    website: "One picture with numbered points on it, each explaining part of what is shown.",
    landing: "One picture with numbered points on it, each explaining part of what is shown.",
  },
  icon: "Target",
  picture: pictureFrom(box(6, 6, 52, 26)
    + `<circle cx="20" cy="15" r="4" fill="#94A3B8" stroke="none"/>`
    + `<circle cx="40" cy="24" r="4" fill="#94A3B8" stroke="none"/>` + bar(6, 36, 24, 2)),
  category: "General",
  builders: ["website", "landing"],
  tier: "pro",
  defaults: {
    image: "",
    image_size: "large",
    hotspot: [],
    hotspot_animation: "e-hotspot--expand",
    hotspot_sequenced_animation: "no",
    tooltip_position: "top",
    tooltip_trigger: "click",
  },
  controls: [
    /* Content → Image. */
    { key: "image", label: "Choose Image", type: "image", tab: "content", section: "Image" },
    { key: "image_size", label: "Image Resolution", type: "select", tab: "content", section: "Image",
      options: [...IMAGE_SIZE_OPTIONS] },
    /* Content → Hotspot. */
    { key: "hotspot", label: "Hotspot", type: "list", tab: "content", section: "Hotspot",
      help: "One point per row: its label, where it sits on the picture, and what the tooltip says." },
    { key: "hotspot_animation", label: "Animation", type: "select", tab: "content", section: "Hotspot", options: [
      { value: "e-hotspot--expand", label: "Expand" },
      { value: "e-hotspot--soft-beat", label: "Soft Beat" },
      { value: "e-hotspot--overlay", label: "Overlay" },
      { value: "", label: "None" }] },
    { key: "hotspot_sequenced_animation", label: "Sequenced Animation", type: "toggle", tab: "content", section: "Hotspot" },
    /* Content → Tooltip. */
    { key: "tooltip_position", label: "Position", type: "select", tab: "content", section: "Tooltip", responsive: true, options: [
      { value: "top", label: "Top" }, { value: "right", label: "Right" },
      { value: "bottom", label: "Bottom" }, { value: "left", label: "Left" }] },
    { key: "tooltip_trigger", label: "Trigger", type: "select", tab: "content", section: "Tooltip", responsive: true, options: [
      { value: "click", label: "Click" }, { value: "mouseenter", label: "Hover" }, { value: "none", label: "None" }] },
    /* Style → Image, Hotspot, Tooltip. Elementor's own section names. */
    { key: "width", label: "Width", type: "number", tab: "style", section: "Image", responsive: true },
    { key: "style_hotspot_color", label: "Color", type: "colour", tab: "style", section: "Hotspot" },
    { key: "style_hotspot_size", label: "Size", type: "number", tab: "style", section: "Hotspot", responsive: true },
    { key: "style_tooltip_text_color", label: "Text Color", type: "colour", tab: "style", section: "Tooltip" },
    { key: "style_tooltip_color", label: "Color", type: "colour", tab: "style", section: "Tooltip" },
  ],
};
