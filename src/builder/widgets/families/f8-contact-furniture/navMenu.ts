/**
 * f8-contact-furniture/navMenu.ts — Elementor's **WordPress Menu**.
 *
 * Offer file: `nav-menu` is under `website.elementor_pro` and is NOT in the
 * landing list — a hosted landing page has one job and a site menu takes the
 * visitor off it. So: website only.
 *
 * ── TWO TITLES, AND WHICH ONE WE USE ──────────────────────────────────────
 * The two machine files disagree, and both are real scrapes:
 *   · `BUILDER_WIDGET_CATALOG_2026-09-17.pro.json` (the IA site, Elementor
 *     4.1.4 + Pro 4.1.1) calls it **"WordPress Menu"**;
 *   · `BUILDER_WIDGET_CATALOG_2026-09-17.elementor.json` (the dev WordPress,
 *     4.2.4) calls it **"Nav Menu"**, which is what Elementor called it before
 *     the Menu widget arrived and needed the shorter name.
 * We use **WordPress Menu**, which is the newer Pro's own word for it and the
 * one the offer file's own plan text uses. `kind` is `nav_menu`, which is the
 * offer file's slug with our spelling, so the offer test matches on either.
 *
 * ── WHICH MENU IT SHOWS IS NOT A CONTROL HERE, AND THAT IS DELIBERATE ─────
 * Elementor's `menu` select lists the menus REGISTERED ON THAT SITE — the
 * catalogue's own three options are `main-menu`, `main-navigation` and
 * `mobile-menu`, which are the IA site's menus and nobody else's. Hard-coding
 * them would offer a client three menu names their site has never heard of and
 * publish a menu that draws nothing. So the control is left off, `menu` stores
 * `""`, and the emitter omits the key entirely, which is how the page engine is
 * told "use the site's own default menu". Reading a site's real menus is a job
 * for the site-facts endpoint and it is written up in the handoff.
 *
 * Everything else — Layout, Alignment, Pointer, Breakpoint, Full Width, Text
 * Align, Toggle Button, Toggle Align, and the Style sections Main Menu,
 * Dropdown and Toggle Button — is copied from the catalogue key by key.
 */
import type { Widget } from "../../../model";
import { esc, type RenderContext } from "../../../render";
import { bar, box, pictureFrom } from "../../../pictures";
import type { FamilyWidgetDef } from "../types";

const str = (v: unknown): string => (v == null ? "" : String(v));
const on = (v: unknown): boolean => v === true || v === "yes";

/** Elementor's own option lists, values exactly as the catalogue carries them. */
const LAYOUTS = [
  { value: "horizontal", label: "Horizontal" },
  { value: "vertical", label: "Vertical" },
  { value: "dropdown", label: "Dropdown" },
];

const ALIGN_ITEMS = [
  { value: "start", label: "Left" },
  { value: "center", label: "Centre" },
  { value: "end", label: "Right" },
  { value: "justify", label: "Stretch" },
];

const POINTERS = [
  { value: "none", label: "None" },
  { value: "underline", label: "Underline" },
  { value: "overline", label: "Overline" },
  { value: "double-line", label: "Double Line" },
  { value: "framed", label: "Framed" },
  { value: "background", label: "Background" },
  { value: "text", label: "Text" },
];

const BREAKPOINTS = [
  { value: "mobile", label: "Mobile (up to 767px)" },
  { value: "tablet", label: "Tablet (up to 1024px)" },
  { value: "none", label: "None" },
];

const TEXT_ALIGN = [
  { value: "aside", label: "Aside" },
  { value: "center", label: "Centre" },
];

const TOGGLE = [
  { value: "burger", label: "Hamburger" },
  { value: "", label: "None" },
];

const TOGGLE_ALIGN = [
  { value: "left", label: "Left" },
  { value: "center", label: "Centre" },
  { value: "right", label: "Right" },
];

/**
 * THE SAMPLE ITEMS THE CANVAS DRAWS.
 *
 * The real items come off the website when the page is published; the editor
 * has none, so it draws the SHAPE — four items in a row with the pointer under
 * the first, or a stack when the layout is vertical. Plain words a business
 * owner recognises as a menu, never a real client's pages.
 */
const SAMPLE = ["Home", "Services", "About", "Contact"];

/** One of Elementor's seven pointer styles, drawn on the first item. */
function pointerStyle(pointer: string, colour: string): string {
  switch (pointer) {
    case "none": return "";
    case "overline": return `border-top:3px solid ${esc(colour)}`;
    case "double-line": return `border-top:2px solid ${esc(colour)};border-bottom:2px solid ${esc(colour)}`;
    case "framed": return `border:2px solid ${esc(colour)};border-radius:4px`;
    case "background": return `background:${esc(colour)};color:#fff;border-radius:4px`;
    case "text": return `color:${esc(colour)};font-weight:700`;
    default: return `border-bottom:3px solid ${esc(colour)}`;
  }
}

export function renderNavMenu(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const vertical = str(p.layout) === "vertical";
  const dropdownOnly = str(p.layout) === "dropdown";
  const pointer = str(p.pointer) || "underline";
  const itemColour = str(p.color_menu_item) || "#0B1C24";
  const pointerColour = str(p.pointer_color_menu_item_hover) || ctx.accent;
  /* Elementor ships these four sliders EMPTY — "whatever the theme does" — so an
     empty value here is not zero, it is the number the canvas draws with until
     the author moves the slider. `num` is the one reader of that rule. */
  const num = (v: unknown, dflt: number) => (v === "" || v == null || Number.isNaN(Number(v)) ? dflt : Number(v));
  const gap = num(p.menu_space_between, 20);
  const padX = num(p.padding_horizontal_menu_item, 10);
  const padY = num(p.padding_vertical_menu_item, 8);
  const radius = num(p.border_radius_menu_item, 0);
  const toggleColour = str(p.toggle_color) || itemColour;
  /* WAVE 2. Five Toggle Button and Dropdown settings were on the panel and
     drew nothing, because the dropdown branch below was one hamburger and no
     panel. Elementor's Dropdown section styles the OPEN list and its Toggle
     Button section styles the button, so both are drawn: the author can see
     what they are setting, which is the whole point of a canvas. */
  const toggleSize = num(p.toggle_size, 18);
  const toggleBg = str(p.toggle_background_color);
  const dropInk = str(p.color_dropdown_item) || itemColour;
  const dropBg = str(p.background_color_dropdown_item) || "#F8FAFC";

  const burger = `<span class="bx-nav-toggle" aria-hidden="true" style="display:inline-flex;flex-direction:column;gap:3px;justify-content:center;padding:6px;border-radius:4px;${
    toggleBg ? `background:${esc(toggleBg)};` : ""}">
    <span style="display:block;width:${toggleSize}px;height:2px;background:${esc(toggleColour)}"></span>
    <span style="display:block;width:${toggleSize}px;height:2px;background:${esc(toggleColour)}"></span>
    <span style="display:block;width:${toggleSize}px;height:2px;background:${esc(toggleColour)}"></span>
  </span>`;

  /* Dropdown layout is the hamburger on every screen — Elementor's own
     behaviour for that value, and the reason it is a LAYOUT and not a
     breakpoint. */
  if (dropdownOnly) {
    /* Elementor's `toggle` is `burger` or nothing at all: choosing None takes
       the button away, which on the dropdown layout leaves the list itself. */
    const hasToggle = str(p.toggle) !== "" || p.toggle == null;
    /* `text_align` is Elementor's Align own two values: `aside` puts the
       dropdown's words against the edge, `center` puts them in the middle. */
    const dropAlign = str(p.text_align) === "center" ? "center" : "left";
    const dropRow = (label: string) => `<a href="#" class="bx-nav-d" style="display:block;`
      + `padding:${padY}px ${padX}px;color:${esc(dropInk)};background:${esc(dropBg)};`
      + `text-align:${dropAlign};text-decoration:none">${esc(label)}</a>`;
    return `<nav class="bx-nav" style="display:flex;flex-direction:column;align-items:${
      str(p.toggle_align) === "left" ? "flex-start" : str(p.toggle_align) === "right" ? "flex-end" : "center"}">
      ${hasToggle ? burger : ""}
      <div class="bx-nav-drop" style="width:100%;border-radius:${radius}px;overflow:hidden;margin-top:6px">${
      SAMPLE.map(dropRow).join("")}</div>
    </nav>`;
  }

  const justify = str(p.align_items) === "center" ? "center"
    : str(p.align_items) === "end" ? "flex-end"
      : str(p.align_items) === "justify" ? "space-between" : "flex-start";

  const item = (label: string, first: boolean) =>
    `<a href="#" class="bx-nav-i" style="display:inline-block;padding:${padY}px ${padX}px;border-radius:${radius}px;`
    + `color:${esc(itemColour)};text-decoration:none;${first ? pointerStyle(pointer, pointerColour) : ""}">${esc(label)}</a>`;

  return `<nav class="bx-nav" style="display:flex;flex-direction:${vertical ? "column" : "row"};`
    + `gap:${gap}px;justify-content:${justify};align-items:${vertical ? "stretch" : "center"};`
    + `${on(p.full_width) ? "width:100%;" : ""}">
      ${SAMPLE.map((s, i) => item(s, i === 0)).join("")}
    </nav>
    ${ctx.mode === "edit"
      ? `<div class="bx-card-note" style="font-size:11px;color:#94A3B8;margin-top:6px">Your real menu is used when the page is published.${
        str(p.dropdown) === "none" ? "" : " Below the breakpoint it becomes a hamburger."}</div>`
      : ""}`;
}

export const NAV_MENU_DEF: FamilyWidgetDef = {
  kind: "nav_menu",
  label: "WordPress Menu",
  description: "Your site's menu across the top, and a hamburger on a phone.",
  icon: "Menu",
  picture: pictureFrom(bar(6, 17, 12, 5) + bar(22, 17, 12, 5) + bar(38, 17, 8, 5)
    + box(50, 14, 10, 11)),
  category: "Pro",
  builders: ["website"],
  tier: "pro",
  defaults: {
    /* "" = the site's own default menu. See the header. */
    menu: "",
    menu_name: "Menu",
    layout: "horizontal",
    align_items: "",
    pointer: "underline",
    dropdown: "tablet",
    full_width: "",
    text_align: "aside",
    toggle: "burger",
    toggle_align: "center",
    color_menu_item: "",
    pointer_color_menu_item_hover: "",
    /* Elementor's own defaults for these five are EMPTY sliders. Copied, not
       improved on: a number here would publish a size the author never chose. */
    menu_space_between: "",
    padding_horizontal_menu_item: "",
    padding_vertical_menu_item: "",
    border_radius_menu_item: "",
    color_dropdown_item: "",
    background_color_dropdown_item: "",
    toggle_color: "",
    toggle_background_color: "",
    toggle_size: "",
  },
  controls: [
    /* ── Content: Elementor's one section, **Layout** ─────────────────── */
    { key: "layout", label: "Layout", type: "select", tab: "content", section: "Layout", options: LAYOUTS },
    { key: "align_items", label: "Alignment", type: "select", tab: "content", section: "Layout", options: ALIGN_ITEMS },
    { key: "pointer", label: "Pointer", type: "select", tab: "content", section: "Layout", options: POINTERS },
    { key: "dropdown", label: "Breakpoint", type: "select", tab: "content", section: "Layout", options: BREAKPOINTS,
      help: "Narrower than this, the menu becomes a hamburger." },
    { key: "full_width", label: "Full Width", type: "toggle", tab: "content", section: "Layout" },
    { key: "text_align", label: "Text Align", type: "select", tab: "content", section: "Layout", options: TEXT_ALIGN },
    { key: "toggle", label: "Toggle Button", type: "select", tab: "content", section: "Layout", options: TOGGLE },
    { key: "toggle_align", label: "Toggle Align", type: "select", tab: "content", section: "Layout", options: TOGGLE_ALIGN },

    /* ── Style: Elementor's three sections ───────────────────────────── */
    { key: "color_menu_item", label: "Text Color", type: "colour", tab: "style", section: "Main Menu" },
    { key: "pointer_color_menu_item_hover", label: "Pointer Color", type: "colour", tab: "style", section: "Main Menu" },
    { key: "menu_space_between", label: "Space Between", type: "number", tab: "style", section: "Main Menu" },
    { key: "padding_horizontal_menu_item", label: "Horizontal Padding", type: "number", tab: "style", section: "Main Menu" },
    { key: "padding_vertical_menu_item", label: "Vertical Padding", type: "number", tab: "style", section: "Main Menu" },
    { key: "border_radius_menu_item", label: "Border Radius", type: "number", tab: "style", section: "Main Menu" },
    { key: "color_dropdown_item", label: "Text Color", type: "colour", tab: "style", section: "Dropdown" },
    { key: "background_color_dropdown_item", label: "Background Color", type: "colour", tab: "style", section: "Dropdown" },
    { key: "toggle_color", label: "Color", type: "colour", tab: "style", section: "Toggle Button" },
    { key: "toggle_background_color", label: "Background Color", type: "colour", tab: "style", section: "Toggle Button" },
    { key: "toggle_size", label: "Size", type: "number", tab: "style", section: "Toggle Button" },
  ],
};
