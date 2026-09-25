/**
 * f8-contact-furniture/iaSocialLinks.ts — **IA Social Links**, deepened.
 *
 * ── WHAT IT IS, in D-168's words ──────────────────────────────────────────
 * An IA widget is *"Elementor widgets, just fitted with custom ability options
 * and styles"*. This one is the DATABASE TWIN of Elementor's **Social Icons**:
 * the same row of round icons, the same shape / alignment / size / spacing
 * controls — and the accounts come out of the business profile instead of being
 * typed in one at a time. That is the whole difference, and it is the reason it
 * is in the offer file (`website.ia`, `landing.ia`).
 *
 * ── WHERE EVERY KEY BELOW COMES FROM, AND WHY THIS ONE IS NOT GUESSWORK ───
 * `ia_social_links` is a REAL REGISTERED ELEMENTOR WIDGET — the IA WordPress
 * plugin registers it, and the 2026-09-17 scrape of the live IA site
 * (`BUILDER_WIDGET_CATALOG_2026-09-17.pro.json`, and the free scrape carries it
 * too) records its title, its category, its two sections and all
 * twenty-six of its control keys. Nothing here is invented: the plugin on the
 * client's site is what reads these keys, and a key it has not got is dropped
 * on publish without a word.
 *
 *   Content · **Social Icons**  platforms · shape · columns · align
 *   Style   · **Icon**          icon_color · icon_primary_color ·
 *                               icon_secondary_color · icon_size ·
 *                               icon_padding · icon_spacing · border_radius
 *
 * Before today the definition was `pluginDef(... defaults: {}, controls: [])` —
 * a tile with an empty panel and a dashed grey box on the canvas. The `kind` is
 * unchanged, so a page saved before today opens and draws.
 *
 * ── WHAT IS DELIBERATELY NOT A CONTROL, AND WHY ───────────────────────────
 * `platforms` is a `select2` — MANY values in ONE control — and our panel draws
 * no such shape. A single-choice select would silently throw away every network
 * but one, which is the quiet kind of defect this pass exists to stop. So the
 * networks are NOT chosen here: the widget shows every account the business has
 * filled in on its profile, which is what a database twin is for, and the
 * emitter publishes that list. Choosing a subset is a real ask and it is in the
 * handoff as one. `settings_notice` is a `raw_html` notice Elementor draws for
 * itself and is not an author's setting.
 * `border_radius` is Elementor's `dimensions` (four numbers and a link toggle);
 * our panel has one number, so it is offered as ONE radius applied to all four
 * corners, and the emitter writes all four.
 */
import type { Widget } from "../../../model";
import type { RenderContext } from "../../../render";
import { esc } from "../../../esc";
import { pictureFrom } from "../../../pictures";
import type { FamilyWidgetDef } from "../types";

const str = (v: unknown): string => (v == null ? "" : String(v));

/** The plugin's own three shapes, exactly as the machine file lists them. */
export const ICON_SHAPES = [
  { value: "rounded", label: "Rounded" },
  { value: "square", label: "Square" },
  { value: "circle", label: "Circle" },
];

/** Its Columns select: "0" is Auto, then one to six. */
export const ICON_COLUMNS = [
  { value: "0", label: "Auto" },
  { value: "1", label: "1" }, { value: "2", label: "2" }, { value: "3", label: "3" },
  { value: "4", label: "4" }, { value: "5", label: "5" }, { value: "6", label: "6" },
];

export const ICON_ALIGNS = [
  { value: "left", label: "Left" },
  { value: "center", label: "Centre" },
  { value: "right", label: "Right" },
];

/** `icon_color`: the plugin's two words, `default` or `custom`. */
export const ICON_COLOUR_MODES = [
  { value: "default", label: "Default" },
  { value: "custom", label: "Custom" },
];

function num(v: unknown, dflt: number): number {
  const n = Number(v);
  return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : dflt;
}

/**
 * THE ACCOUNTS, whichever way they reached the widget.
 *
 * A page saved before today stored `links: [{ network, url }]`; the plugin's
 * own key is `platforms`, a list of network names. Both are read, so no stored
 * page loses a row — the same rule `socialRows` already follows for Social
 * Icons on b168/override.
 */
export function socialNetworks(p: Record<string, unknown>): string[] {
  const raw = Array.isArray(p.platforms) ? p.platforms
    : Array.isArray(p.links) ? p.links : [];
  const out: string[] = [];
  for (const row of raw as unknown[]) {
    const name = typeof row === "string"
      ? row
      : str((row as any)?.platform || (row as any)?.network || (row as any)?.label);
    if (name.trim()) out.push(name.trim());
  }
  return out;
}

/** Two letters of a network's name, so the canvas shows WHICH accounts. */
function initials(name: string): string {
  return name.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "??";
}

/**
 * WHAT THE CANVAS DRAWS: the real row of icons, at the real size, in the real
 * shape and colour, laid out in the chosen columns and alignment. Every control
 * on the panel moves something here.
 *
 * With no accounts on the profile yet it says so in one sentence while the page
 * is being built, and puts nothing on the published page — a row of empty
 * circles would be worse than no row.
 */
export function renderIaSocialLinks(w: Widget, ctx: RenderContext): string {
  const p = (w.props || {}) as Record<string, unknown>;
  const networks = socialNetworks(p);
  if (!networks.length) {
    return ctx.mode === "edit"
      ? `<div class="bx-imgdrop">Your accounts show here. Add them to your business profile.</div>`
      : "";
  }
  const shape = str(p.shape) || "rounded";
  const size = Math.max(8, num(p.icon_size, 25));
  const padEm = num(p.icon_padding, 0.5);
  const gap = num(p.icon_spacing, 5);
  const cols = str(p.columns) || "0";
  const align = str(p.align) || "center";
  const custom = str(p.icon_color) === "custom";
  const fg = custom ? (str(p.icon_secondary_color) || "#ffffff") : "#ffffff";
  const bg = custom ? (str(p.icon_primary_color) || ctx.accent) : ctx.accent;
  const radius = shape === "circle" ? "50%"
    : shape === "square" ? "0"
    : `${Math.max(0, num(p.border_radius, 6))}px`;

  const justify = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
  const layout = cols === "0"
    ? `display:flex;flex-wrap:wrap;justify-content:${justify};gap:${gap}px`
    : `display:grid;grid-template-columns:repeat(${Math.max(1, Number(cols) || 1)},minmax(0,1fr));`
      + `gap:${gap}px;justify-items:${justify === "flex-start" ? "start" : justify === "flex-end" ? "end" : "center"}`;

  const icons = networks.map((n) => `<span class="bx-social-i" title="${esc(n)}" style="display:inline-flex;`
    + `align-items:center;justify-content:center;width:${size}px;height:${size}px;`
    + `padding:${padEm}em;background:${esc(bg)};color:${esc(fg)};border-radius:${radius};`
    + `font-size:${Math.max(7, Math.round(size * 0.42))}px;font-weight:700;line-height:1">${
      esc(initials(n))}</span>`).join("");

  return `<div class="bx-social bx-ia-social" style="${layout}">${icons}</div>`;
}

export const IA_SOCIAL_LINKS_DEF: FamilyWidgetDef = {
  kind: "ia_social_links",
  label: "IA Social Links",
  description: "Your accounts, taken from your business profile — nothing to type in.",
  icon: "Link2",
  picture: pictureFrom(`<circle cx="18" cy="20" r="5" fill="#94A3B8" stroke="none"/>`
    + `<circle cx="32" cy="20" r="5" fill="#94A3B8" stroke="none"/>`
    + `<circle cx="46" cy="20" r="5" fill="#94A3B8" stroke="none"/>`),
  category: "Intelligent Analytics",
  /* Offer file: `website.ia` and `landing.ia`. Not the newsletter's, whose
     social row is Elementor's own Social Icons (`social_links`, b168/override),
     and not the proposal's or My Brand's. */
  builders: ["website", "landing"],
  tier: "ia:arion",
  defaults: {
    platforms: [],
    shape: "rounded",
    columns: "0",
    align: "center",
    icon_color: "default",
    icon_primary_color: "",
    icon_secondary_color: "",
    icon_size: 25,
    icon_padding: 0.5,
    icon_spacing: 5,
    border_radius: 6,
  },
  controls: [
    /* ── Content · "Social Icons" (section_social_icons) ──────────────── */
    /* `platforms` is the plugin's `select2` — MANY values in ONE control — and
       the panel draws no such shape, so it is declared as the LIST it is and
       filled from the business profile rather than typed. The rows a page
       already holds are drawn and published; choosing a subset is the real ask
       in the handoff. Declared and not omitted, because a default with no
       control is a value the author can never reach. */
    { key: "platforms", label: "Show Platforms", type: "list", tab: "content",
      section: "Social Icons", help: "Every account on your business profile" },
    { key: "shape", label: "Shape", type: "select", tab: "content", section: "Social Icons",
      options: ICON_SHAPES },
    { key: "columns", label: "Columns", type: "select", tab: "content", section: "Social Icons",
      responsive: true, options: ICON_COLUMNS },
    { key: "align", label: "Alignment", type: "select", tab: "content", section: "Social Icons",
      responsive: true, options: ICON_ALIGNS },

    /* ── Style · "Icon" (section_social_style) ────────────────────────── */
    { key: "icon_color", label: "Color", type: "select", tab: "style", section: "Icon",
      options: ICON_COLOUR_MODES },
    { key: "icon_primary_color", label: "Primary Color", type: "colour", tab: "style", section: "Icon" },
    { key: "icon_secondary_color", label: "Secondary Color", type: "colour", tab: "style", section: "Icon" },
    { key: "icon_size", label: "Size", type: "number", tab: "style", section: "Icon", responsive: true },
    { key: "icon_padding", label: "Padding", type: "number", tab: "style", section: "Icon", responsive: true },
    { key: "icon_spacing", label: "Spacing", type: "number", tab: "style", section: "Icon", responsive: true },
    { key: "border_radius", label: "Border Radius", type: "number", tab: "style", section: "Icon",
      responsive: true, help: "One radius, on all four corners" },
  ],
};
