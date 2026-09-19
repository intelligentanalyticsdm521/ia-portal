/**
 * f8-contact-furniture/iaMobileMenu.ts — **IA Mobile Menu**, deepened.
 *
 * The menu a visitor sees on a phone: a panel that slides in, a full-screen
 * overlay, or a bar of tabs along the bottom. Offered on `website.ia`.
 *
 * ── WHERE EVERY KEY COMES FROM ────────────────────────────────────────────
 * `ia_mobile_menu` is a REAL REGISTERED ELEMENTOR WIDGET — the IA WordPress
 * plugin registers it and the 2026-09-17 scrape records its title, category
 * `intelligent-analytics`, its three sections and all twenty-two keys:
 *
 *   Content · **Menu**          menu_source · wp_menu · custom_items · style
 *   Content · **Social & CTA**  show_social · social_links · show_cta ·
 *                               cta_text · cta_link · show_search
 *   Style   · **Panel Style**   bg_type · bg_color · bg_image · overlay_color ·
 *                               text_color · accent_color · close_icon_color ·
 *                               animation_direction · panel_width
 *
 * Before today: `pluginDef(… defaults: {}, controls: [])` — a tile with an
 * empty panel and a dashed grey box on the canvas. Same `kind`.
 *
 * ── THE TWO KEYS THAT ARE NOT AUTHOR CONTROLS ─────────────────────────────
 * · `wp_menu` — the menus registered on the CLIENT'S site, which the Portal
 *   cannot read. Left out; the plugin falls back to the site's own default.
 *   Same reason as `nav_menu`'s `menu` and `ia_mega_menu`'s `wp_menu`.
 * · `custom_items` and `social_links` are REPEATERS: rows a page already holds
 *   are drawn, published and typed on the canvas, and adding or removing one
 *   waits on `repeatKeyFor` in the shell.
 */
import type { Widget } from "../../../model";
import type { RenderContext } from "../../../render";
import { esc } from "../../../esc";
import { bar, box, pictureFrom } from "../../../pictures";
import { editRun } from "../../text";
import type { FamilyWidgetDef } from "../types";

const str = (v: unknown): string => (v == null ? "" : String(v));
/** Elementor's switcher stores "yes"; a checkbox writes a boolean. One reader. */
const on = (v: unknown): boolean => v === true || v === "yes";
/** …and the inverse, for a switch whose DEFAULT is on: absent means the default. */
const onByDefault = (v: unknown): boolean => !(v === false || v === "no" || v === "");

export const MOBILE_SOURCES = [
  { value: "wp_menu", label: "Your website's menu" },
  { value: "custom", label: "The items below" },
];
export const MOBILE_STYLES = [
  { value: "slide_panel", label: "Slide Panel" },
  { value: "fullscreen_overlay", label: "Fullscreen Overlay" },
  { value: "bottom_tab_bar", label: "Bottom Tab Bar" },
];
export const BG_TYPES = [
  { value: "solid", label: "Solid" },
  { value: "image", label: "Image" },
  { value: "overlay", label: "Overlay" },
];
export const SLIDE_DIRECTIONS = [
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
];

function num(v: unknown, dflt: number): number {
  const n = Number(v);
  return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : dflt;
}

/** The rows a stored page holds, in the plugin's own shape. */
export function mobileItems(p: Record<string, unknown>): string[] {
  const raw = Array.isArray(p.custom_items) ? p.custom_items : [];
  return (raw as unknown[])
    .map((r) => str(typeof r === "string" ? r : (r as any)?.label))
    .filter((s) => s.trim());
}

/**
 * WHAT THE CANVAS DRAWS: the panel itself, at its real width, in its real
 * background, with the items, the social row, the search box and the call to
 * action each present only when their switch is on — so every switch on the
 * panel is visible on the page the moment it is pressed. The Bottom Tab Bar
 * style draws as a bar, because that is what it is.
 */
export function renderIaMobileMenu(w: Widget, ctx: RenderContext): string {
  const p = (w.props || {}) as Record<string, unknown>;
  const style = str(p.style) || "slide_panel";
  const items = mobileItems(p);
  const shown = items.length
    ? items
    : (str(p.menu_source) || "wp_menu") === "wp_menu" ? ["Home", "About", "Contact"] : [];

  if (!shown.length) {
    return ctx.mode === "edit"
      ? `<div class="bx-imgdrop">Your phone menu shows here once the site has one.</div>` : "";
  }

  const bgType = str(p.bg_type) || "solid";
  const bgColour = str(p.bg_color) || "#0C4A60";
  const overlay = str(p.overlay_color) || "rgba(12,74,96,0.92)";
  const image = str(p.bg_image);
  const ink = str(p.text_color) || "#ffffff";
  const accent = str(p.accent_color) || ctx.accent;
  const closeInk = str(p.close_icon_color) || "rgba(255,255,255,0.6)";
  const width = Math.max(120, num(p.panel_width, 280));
  const direction = str(p.animation_direction) || "right";
  const bar_ = style === "bottom_tab_bar";

  const background = bgType === "image" && image
    ? `background:${esc(bgColour)} url("${esc(image)}") center/cover`
    : bgType === "overlay" ? `background:${esc(overlay)}`
    : `background:${esc(bgColour)}`;

  const rows = shown.map((label, i) => `<div style="padding:7px 0;color:${esc(ink)};font-size:13px">${
    ctx.mode === "edit"
      ? editRun(`custom_items.${i}.label`, label, "bx-mm-l", "Menu item", ctx, "span")
      : esc(label)}</div>`).join("");

  const search = on(p.show_search)
    ? `<div style="border:1px solid ${esc(closeInk)};border-radius:6px;height:28px;margin:8px 0"></div>` : "";
  const social = onByDefault(p.show_social)
    ? `<div style="display:flex;gap:6px;margin-top:10px">${
      [0, 1, 2].map(() => `<span style="width:16px;height:16px;border-radius:50%;background:${esc(accent)};display:inline-block"></span>`).join("")}</div>`
    : "";
  const cta = onByDefault(p.show_cta)
    ? `<a class="bx-button" href="${esc(str(p.cta_link) || "#")}" style="display:inline-block;margin-top:10px;background:${
      esc(accent)};color:${esc(ink)}">${ctx.mode === "edit"
        ? editRun("cta_text", p.cta_text ?? "Contact Us", "bx-mm-c", "Contact Us", ctx, "span")
        : esc(str(p.cta_text) || "Contact Us")}</a>`
    : "";

  const frame = bar_
    ? `width:100%;display:flex;gap:14px;justify-content:space-around;align-items:center;padding:8px 12px`
    : `width:${width}px;max-width:100%;padding:12px;${
      direction === "left" ? "margin-right:auto" : "margin-left:auto"}`;

  return `<div class="bx-mobilemenu" style="${background};border-radius:8px;${frame}">
    ${bar_ ? shown.map((l) => `<span style="color:${esc(ink)};font-size:11px">${esc(l)}</span>`).join("") : `
      <div style="display:flex;justify-content:flex-end;color:${esc(closeInk)};font-size:14px">&times;</div>
      ${rows}${search}${social}${cta}`}
  </div>`;
}

export const IA_MOBILE_MENU_DEF: FamilyWidgetDef = {
  kind: "ia_mobile_menu",
  label: "IA Mobile Menu",
  description: "The menu a visitor sees on a phone — a slide-out panel, a full screen, or a bottom bar.",
  icon: "MenuSquare",
  picture: pictureFrom(box(22, 4, 20, 32) + bar(26, 10, 12, 3) + bar(26, 17, 12, 3) + bar(26, 24, 12, 3)),
  category: "Intelligent Analytics",
  builders: ["website"],
  tier: "ia:arion",
  defaults: {
    menu_source: "wp_menu",
    custom_items: [],
    style: "slide_panel",
    show_social: "yes",
    social_links: [],
    show_cta: "yes",
    cta_text: "Contact Us",
    cta_link: "",
    show_search: "",
    bg_type: "solid",
    bg_color: "#0C4A60",
    bg_image: "",
    overlay_color: "rgba(12,74,96,0.92)",
    text_color: "#ffffff",
    accent_color: "",
    close_icon_color: "",
    animation_direction: "right",
    panel_width: 280,
  },
  controls: [
    /* ── Content · "Menu" (section_menu) ──────────────────────────────── */
    { key: "menu_source", label: "Menu Source", type: "select", tab: "content", section: "Menu",
      options: MOBILE_SOURCES },
    { key: "custom_items", label: "Menu Items", type: "list", tab: "content", section: "Menu" },
    { key: "style", label: "Menu Style", type: "select", tab: "content", section: "Menu",
      options: MOBILE_STYLES },

    /* ── Content · "Social & CTA" (section_social) ────────────────────── */
    { key: "show_social", label: "Show Social Links", type: "toggle", tab: "content", section: "Social & CTA" },
    { key: "social_links", label: "Social Links", type: "list", tab: "content", section: "Social & CTA" },
    { key: "show_cta", label: "Show CTA Button", type: "toggle", tab: "content", section: "Social & CTA" },
    { key: "cta_text", label: "CTA Text", type: "text", tab: "content", section: "Social & CTA" },
    { key: "cta_link", label: "CTA Link", type: "link", tab: "content", section: "Social & CTA" },
    { key: "show_search", label: "Show Search", type: "toggle", tab: "content", section: "Social & CTA" },

    /* ── Style · "Panel Style" (section_style_panel) ──────────────────── */
    { key: "bg_type", label: "Background Type", type: "select", tab: "style", section: "Panel Style",
      options: BG_TYPES },
    { key: "bg_color", label: "Background Color", type: "colour", tab: "style", section: "Panel Style" },
    { key: "bg_image", label: "Background Image", type: "image", tab: "style", section: "Panel Style" },
    { key: "overlay_color", label: "Overlay Color", type: "colour", tab: "style", section: "Panel Style" },
    { key: "text_color", label: "Text Color", type: "colour", tab: "style", section: "Panel Style" },
    { key: "accent_color", label: "Accent Color", type: "colour", tab: "style", section: "Panel Style" },
    { key: "close_icon_color", label: "Close Icon Color", type: "colour", tab: "style", section: "Panel Style" },
    { key: "animation_direction", label: "Slide Direction", type: "select", tab: "style",
      section: "Panel Style", options: SLIDE_DIRECTIONS },
    { key: "panel_width", label: "Panel Width", type: "number", tab: "style", section: "Panel Style" },
  ],
};
