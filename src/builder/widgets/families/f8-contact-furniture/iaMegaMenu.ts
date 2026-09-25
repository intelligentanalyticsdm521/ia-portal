/**
 * f8-contact-furniture/iaMegaMenu.ts — **IA Mega Menu**, deepened.
 *
 * ── WHAT IT IS ────────────────────────────────────────────────────────────
 * The IA WordPress plugin's own mega menu: a full-width menu bar with panels
 * that drop out of it. It is offered on `website.ia` in the offer file Brandon
 * approved, and it is a real registered Elementor widget — the 2026-09-17 scrape
 * of the live IA site carries it with title "IA Mega Menu", category
 * `intelligent-analytics`, four Content sections, one Style section and
 * twenty-four keys. Every name, key, option value and default below is copied
 * out of that file. Nothing is invented.
 *
 * ── AND THIS IS NOT ELEMENTOR'S "Menu" ────────────────────────────────────
 * Elementor Pro has a widget titled **Menu** (slug `mega-menu`). It is NOT
 * built and cannot be: both 2026-09-17 scrapes register it with `sections: []`
 * and `controls: {}` — the widget and not one of its settings — and the Pro
 * scrape, which is the live IA site's own registry, does not carry it at all.
 * That is F8's wave-1 finding and it still stands. This widget is OURS, it is
 * on the offer file by its own name, and its panel is known.
 *
 * ── WHAT WAS HERE BEFORE ──────────────────────────────────────────────────
 * `pluginDef("ia_mega_menu", …, defaults: {}, controls: [])` in
 * `widgets/iaBlocks.ts`: a tile with an empty panel, drawing a dashed grey box
 * on the canvas and NOTHING on the published page. Same `kind`, so a page saved
 * before today opens and draws; `mergeWidgetDefs` drops the old declaration.
 *
 * ── THE THREE KEYS THAT ARE DELIBERATELY NOT CONTROLS ─────────────────────
 * · `wp_menu` — Elementor's select lists the menus registered on THAT site (the
 *   catalogue's three options are the IA site's own, nobody else's). The Portal
 *   cannot know a client's, so the key is left out and the plugin falls back to
 *   the site's own default menu. Exactly the reason `nav_menu` leaves `menu`
 *   out; reading a site's real menus needs a site-facts endpoint.
 * · `menu_items` and `menu_groups` are REPEATERS. Adding and removing a row
 *   needs `repeatKeyFor` in `BuilderShell.tsx`, which is the shell and not a
 *   family's file (F8 wave 1, item 6). The rows a page already holds are DRAWN
 *   and PUBLISHED untouched, and their labels are typed on the canvas.
 */
import type { Widget } from "../../../model";
import type { RenderContext } from "../../../render";
import { esc } from "../../../esc";
import { bar, box, pictureFrom } from "../../../pictures";
import { editRun } from "../../text";
import type { FamilyWidgetDef } from "../types";

const str = (v: unknown): string => (v == null ? "" : String(v));

export const MENU_SOURCES = [
  { value: "wordpress", label: "Your website's menu" },
  { value: "custom", label: "The items below" },
];
export const MEGA_STYLES = [
  { value: "split-panel", label: "Split Panel" },
  { value: "column-dropdown", label: "Column Dropdown" },
  { value: "full-width-banner", label: "Full Width Banner" },
];
export const DROPDOWN_ANIMATIONS = [
  { value: "fade", label: "Fade" },
  { value: "slide", label: "Slide" },
  { value: "none", label: "None" },
];
export const DROPDOWN_WIDTHS = [
  { value: "full-width", label: "Full Width" },
  { value: "auto", label: "Auto" },
  { value: "custom", label: "Custom" },
];

function num(v: unknown, dflt: number): number {
  const n = Number(v);
  return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : dflt;
}

/** The rows a stored page holds, in the plugin's own shape. */
export function megaItems(p: Record<string, unknown>): Array<{ item_label: string; item_type: string }> {
  const raw = Array.isArray(p.menu_items) ? p.menu_items : [];
  return (raw as unknown[]).map((r) => ({
    item_label: str((r as any)?.item_label ?? (r as any)?.label),
    item_type: str((r as any)?.item_type ?? "link"),
  })).filter((r) => r.item_label.trim());
}

/**
 * WHAT THE CANVAS DRAWS: the bar itself, in the author's colours, at the
 * author's font size and item spacing, with a bordered panel under it standing
 * for the drop-out — its width taken from the width controls, so choosing
 * Custom and a number visibly changes the shape. The Featured block draws only
 * on the Full Width Banner style, which is the style Elementor shows it for.
 */
export function renderIaMegaMenu(w: Widget, ctx: RenderContext): string {
  const p = (w.props || {}) as Record<string, unknown>;
  const items = megaItems(p);
  const source = str(p.menu_source) || "wordpress";
  const style = str(p.menu_style) || "split-panel";
  const bg = str(p.bg_color) || "#ffffff";
  const ink = str(p.text_color) || "#0B1C24";
  const accent = str(p.accent_color) || ctx.accent;
  const hover = str(p.hover_color) || accent;
  const border = str(p.border_color) || "#CBD5E1";
  const size = num(p.font_size, 14);
  const spacing = num(p.item_spacing, 24);
  const animation = str(p.dropdown_animation) || "fade";
  const widthMode = str(p.dropdown_width) || "full-width";
  const panelWidth = widthMode === "custom" ? `${num(p.dropdown_custom_width, 800)}px`
    : widthMode === "auto" ? "max-content" : "100%";

  const shown = items.length
    ? items
    : source === "wordpress"
      ? [{ item_label: "Home", item_type: "link" }, { item_label: "Services", item_type: "mega_trigger" },
         { item_label: "Contact", item_type: "link" }]
      : [];

  if (!shown.length) {
    return ctx.mode === "edit"
      ? `<div class="bx-imgdrop">Your menu shows here once the site has one.</div>` : "";
  }

  const links = shown.map((it, i) => `<span class="bx-mega-i" style="color:${
    it.item_type === "mega_trigger" ? esc(accent) : esc(ink)};font-size:${size}px">${
    ctx.mode === "edit"
      ? editRun(`menu_items.${i}.item_label`, it.item_label, "bx-mega-l", "Menu item", ctx, "span")
      : esc(it.item_label)}</span>`).join("");

  const cls = `bx-mega-${String(w.id || "x").replace(/[^A-Za-z0-9_-]/g, "")}`;
  const featured = style === "full-width-banner" ? `<div class="bx-mega-f" style="padding:10px 14px">
      ${editRun("featured_heading", p.featured_heading ?? "Featured", "bx-mega-fh",
        "Featured", ctx, "strong")}
      ${editRun("featured_text", p.featured_text, "bx-mega-ft", "What is worth pointing at", ctx, "span")}
      <a href="${esc(str(p.featured_link) || "#")}" style="color:${esc(accent)};font-size:${size - 1}px">${
        esc(str(p.featured_link_text) || "Learn More")}</a>
    </div>` : "";

  return `<div class="bx-mega ${cls}" style="background:${esc(bg)};border:1px solid ${esc(border)};border-radius:8px">
    <div style="display:flex;gap:${spacing}px;align-items:center;padding:10px 14px">${links}</div>
    <div class="bx-mega-p" style="border-top:1px solid ${esc(border)};width:${panelWidth};max-width:100%;
      min-height:${style === "split-panel" ? 56 : 40}px;background:${esc(bg)}">${featured}</div>
    <style>.${cls} .bx-mega-i:hover{color:${esc(hover)}}.${cls} .bx-mega-p{${
      animation === "none" ? "" : `transition:opacity .2s;`}${
      animation === "slide" ? "transform:translateY(0);" : ""}}</style>
  </div>`;
}

export const IA_MEGA_MENU_DEF: FamilyWidgetDef = {
  kind: "ia_mega_menu",
  label: "IA Mega Menu",
  description: "Your full site menu, with panels that drop out of it.",
  icon: "Menu",
  picture: pictureFrom(bar(6, 8, 52, 6) + box(6, 18, 52, 16)
    + bar(10, 23, 14, 3) + bar(28, 23, 14, 3) + bar(46, 23, 8, 3)),
  category: "Intelligent Analytics",
  /* Offer file: `website.ia` only. A hosted landing page has no site menu. */
  builders: ["website"],
  tier: "ia:arion",
  defaults: {
    menu_source: "wordpress",
    menu_style: "split-panel",
    menu_items: [],
    menu_groups: [],
    featured_heading: "Featured",
    featured_text: "",
    featured_link: "",
    featured_link_text: "Learn More",
    bg_color: "#ffffff",
    text_color: "#0B1C24",
    accent_color: "",
    hover_color: "",
    border_color: "",
    font_size: 14,
    item_spacing: 24,
    dropdown_animation: "fade",
    dropdown_width: "full-width",
    dropdown_custom_width: 800,
  },
  controls: [
    /* ── Content · "Menu Configuration" (section_menu) ────────────────── */
    { key: "menu_source", label: "Menu Source", type: "select", tab: "content",
      section: "Menu Configuration", options: MENU_SOURCES },
    { key: "menu_style", label: "Menu Style", type: "select", tab: "content",
      section: "Menu Configuration", options: MEGA_STYLES },

    /* ── Content · "Menu Items" and "Menu Groups (Split Panel)" ───────── */
    /* Repeaters. The rows a page already holds are drawn, published and typed
       on the canvas; adding or removing one waits on the shell. See the
       header. */
    { key: "menu_items", label: "Items", type: "list", tab: "content", section: "Menu Items" },
    { key: "menu_groups", label: "Groups", type: "list", tab: "content",
      section: "Menu Groups (Split Panel)" },

    /* ── Content · "Featured Content (Full Width)" (section_featured) ─── */
    { key: "featured_heading", label: "Featured Heading", type: "text", tab: "content",
      section: "Featured Content (Full Width)" },
    { key: "featured_text", label: "Featured Description", type: "textarea", tab: "content",
      section: "Featured Content (Full Width)" },
    { key: "featured_link", label: "Featured Link", type: "link", tab: "content",
      section: "Featured Content (Full Width)" },
    { key: "featured_link_text", label: "Featured Link Text", type: "text", tab: "content",
      section: "Featured Content (Full Width)" },

    /* ── Style · "Menu Style" (section_style) ─────────────────────────── */
    { key: "bg_color", label: "Background Color", type: "colour", tab: "style", section: "Menu Style" },
    { key: "text_color", label: "Text Color", type: "colour", tab: "style", section: "Menu Style" },
    { key: "accent_color", label: "Accent Color", type: "colour", tab: "style", section: "Menu Style" },
    { key: "hover_color", label: "Hover Color", type: "colour", tab: "style", section: "Menu Style" },
    { key: "border_color", label: "Border Color", type: "colour", tab: "style", section: "Menu Style" },
    { key: "font_size", label: "Font Size", type: "number", tab: "style", section: "Menu Style" },
    { key: "item_spacing", label: "Item Spacing", type: "number", tab: "style", section: "Menu Style" },
    { key: "dropdown_animation", label: "Dropdown Animation", type: "select", tab: "style",
      section: "Menu Style", options: DROPDOWN_ANIMATIONS },
    { key: "dropdown_width", label: "Dropdown Width", type: "select", tab: "style",
      section: "Menu Style", options: DROPDOWN_WIDTHS },
    { key: "dropdown_custom_width", label: "Custom Width (px)", type: "number", tab: "style",
      section: "Menu Style" },
  ],
};
