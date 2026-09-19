/**
 * Social Icons — Elementor `social-icons`, group General. Stored kind:
 * `social_links`.
 *
 * ── WHY THE KIND IS `social_links` AND NOT `social_icons` (D-168 item 4) ──
 * Two definitions wore this label. The kind KEPT is `social_links`, because
 * `EMAIL_KIND_ALIASES` and `LANDING_KIND_ALIASES` already resolved Elementor's
 * slug to it, both golden fixtures hold it, the shipped newsletter and landing
 * templates place it, and LUMEN renders it on a hosted page. Renaming would
 * have been a change to stored documents in three repos to win a word. The
 * override branch settled that; this pass deepens what it settled.
 *
 * ── WHAT IT REPLACES ──────────────────────────────────────────────────────
 * Five controls, `shape` offering two of Elementor's three, no Columns, no
 * spacing of any kind, no border, no hover, and a renderer that painted every
 * network the SAME colour — so a row of six accounts was six identical
 * squares. Elementor's own answer is the Color select: "Official Color" paints
 * each network its own brand colour, "Custom" paints them all yours. That
 * select is the difference between a row that looks like social icons and a
 * row that looks like six buttons.
 *
 * ── ELEMENTOR'S OWN PANEL ─────────────────────────────────────────────────
 * Content ▸ Social Icons: Social Icons · Shape · Columns (responsive) ·
 * Alignment (responsive).
 * Style ▸ Icon: Color · Primary Color · Secondary Color · Size (responsive) ·
 * Padding (responsive) · Spacing (responsive) · Rows Gap (responsive) ·
 * Border Type · Border Width · Border Color · Border Radius (responsive).
 * Style ▸ Icon Hover: Primary Color · Secondary Color.
 *
 * Left out and named in the handoff: Hover Border Color and Hover Animation.
 */
import type { Widget } from "../../../model";
import { esc } from "../../../esc";
import type { RenderContext } from "../../../render";
import { pictureFrom } from "../../../pictures";
import type { FamilyWidgetDef } from "../types";
import { str, flexJustify } from "./shared";
import {
  BORDER_TYPE_OPTIONS, LEFT_CENTER_RIGHT, RESPONSIVE, SHAPE_OPTIONS,
  borderStyle, colour, num, shapeRadius,
} from "./deep";

/**
 * The networks the picker offers, the letter each one draws as, and — new in
 * this pass — the colour the network really is.
 *
 * `brand` is what Elementor's "Official Color" means. Without it the Color
 * select has only one answer and is therefore a control that does nothing.
 */
export const SOCIAL_NETWORKS: ReadonlyArray<{ value: string; label: string; mark: string; brand: string }> = [
  { value: "facebook", label: "Facebook", mark: "f", brand: "#1877F2" },
  { value: "instagram", label: "Instagram", mark: "in", brand: "#C13584" },
  { value: "linkedin", label: "LinkedIn", mark: "in", brand: "#0A66C2" },
  { value: "x", label: "X", mark: "X", brand: "#000000" },
  { value: "youtube", label: "YouTube", mark: "▶", brand: "#FF0000" },
  { value: "website", label: "Website", mark: "⌂", brand: "#475569" },
];

/**
 * BOTH SPELLINGS OF THE ONE LIST — D-168 item 4.
 *
 * `social_icon_list` is Elementor's own key and what the page builders store;
 * `links` is what the newsletter and landing templates have stored since D-165
 * and what both golden fixtures hold. One reader, so a document written by
 * either half keeps its accounts.
 */
export function socialRows(p: Record<string, unknown>): Array<Record<string, unknown>> {
  const own = Array.isArray(p.social_icon_list) ? p.social_icon_list : [];
  if (own.length) return own as Array<Record<string, unknown>>;
  return (Array.isArray(p.links) ? p.links : []) as Array<Record<string, unknown>>;
}

export function renderSocialIcons(w: Widget, ctx: RenderContext): string {
  const p = (w.props || {}) as Record<string, unknown>;
  const shown = socialRows(p).filter((r) => str(r?.link ?? r?.url).trim());
  if (!shown.length && ctx.mode !== "edit") return "";
  if (!shown.length) {
    return `<div class="bx-social bx-social-empty">Add the address of each account you want people to follow.</div>`;
  }

  const size = num(p.icon_size, 18, 6, 120);
  const pad = num(p.icon_padding, Math.round(size * 0.5), 0, 120);
  const gap = num(p.icon_spacing, 8, 0, 120);
  const rowGap = num(p.row_gap, gap, 0, 120);
  const radius = num(p.border_radius, -1, 0, 400);
  const official = str(p.icon_color || "default") !== "custom";
  const stroke = borderStyle(p.image_border_border, "none");

  /* ELEMENTOR'S COLUMNS. "0" is Auto — as many across as fit. Any other value
     is that many per row, and the tile widths come off it. */
  const columns = num(p.columns, 0, 0, 6);

  const scope = `bxs-${String(w.id || "w").replace(/[^A-Za-z0-9_-]/g, "")}`;
  const hoverInk = colour(p.hover_secondary_color, "");
  const hoverFill = colour(p.hover_primary_color, "");
  const hoverCss = hoverInk || hoverFill
    ? `<style>.${scope} .bx-social-i:hover{${hoverFill ? `background:${esc(hoverFill)};` : ""}${hoverInk ? `color:${esc(hoverInk)};` : ""}}</style>`
    : "";

  const cells = shown.map((r) => {
    const net = SOCIAL_NETWORKS.find((n) => n.value === str(r?.social ?? r?.network)) || SOCIAL_NETWORKS[0];
    const fill = official ? net.brand : colour(p.icon_primary_color, ctx.accent);
    const ink = official ? "#FFFFFF" : colour(p.icon_secondary_color, "#FFFFFF");
    const border = stroke === "none" ? ""
      : `border:${num(p.image_border_width, 1, 0, 20)}px ${stroke} ${colour(p.image_border_color, fill)};`;
    const width = columns ? `width:calc((100% - ${(columns - 1) * gap}px) / ${columns});` : `width:${size + pad * 2}px;`;
    return `<a class="bx-social-i" href="${esc(str(r.link ?? r.url))}" style="display:inline-flex;align-items:center;justify-content:center;${width}height:${size + pad * 2}px;border-radius:${
      radius >= 0 ? `${radius}px` : shapeRadius(p.shape, "999px")};background:${esc(fill)};color:${esc(ink)};font-size:${size}px;font-weight:700;text-decoration:none;${border}">${esc(net.mark)}</a>`;
  }).join("");

  return `${hoverCss}<div class="bx-social ${scope}" style="display:flex;gap:${gap}px;row-gap:${rowGap}px;flex-wrap:wrap;justify-content:${flexJustify(p.align, "flex-start")}">${cells}</div>`;
}

export const SOCIAL_ICONS_DEF: FamilyWidgetDef = {
  kind: "social_links",
  label: "Social Icons",
  description: "A row of links to your Facebook, Instagram and the rest.",
  icon: "Share2",
  picture: pictureFrom(`<circle cx="18" cy="20" r="6" fill="#94A3B8" stroke="none"/><circle cx="32" cy="20" r="6" fill="#94A3B8" stroke="none"/><circle cx="46" cy="20" r="6" fill="#94A3B8" stroke="none"/>`),
  category: "General",
  /* NOT `mybrand`: the studio places LAYERS and `adapters/mybrand/insert.ts`
     has nothing for this kind, so the tile's press would put nothing on the
     canvas. The offer guard reports it as missing for My Brand, which is true
     (D-168 item 4). */
  builders: ["website", "landing", "newsletter", "proposal"],
  defaults: {
    social_icon_list: [], shape: "rounded", columns: 0, align: "left",
    icon_color: "default", icon_primary_color: "", icon_secondary_color: "",
    icon_size: 18, icon_padding: 9, icon_spacing: 8, row_gap: 8,
    image_border_border: "", image_border_width: 1, image_border_color: "", border_radius: -1,
    hover_primary_color: "", hover_secondary_color: "",
  },
  controls: [
    /* ── Content ▸ Social Icons ───────────────────────────────────────── */
    {
      key: "social_icon_list", label: "Social Icons", type: "list", tab: "content", section: "Social Icons",
      // Not "we use the accounts connected in My Brand": those are OAuth
      // identities, not public addresses, and a row of dead links in a client's
      // own email is worse than no row. The author gives the addresses.
      help: "Paste the address of each account you want people to follow.",
    },
    { key: "shape", label: "Shape", type: "select", tab: "content", section: "Social Icons", options: SHAPE_OPTIONS },
    { key: "columns", label: "Columns", type: "select", tab: "content", section: "Social Icons", responsive: RESPONSIVE, options: [
      { value: "0", label: "Auto" }, { value: "1", label: "1" }, { value: "2", label: "2" },
      { value: "3", label: "3" }, { value: "4", label: "4" }, { value: "5", label: "5" },
      { value: "6", label: "6" }] },
    { key: "align", label: "Alignment", type: "select", tab: "content", section: "Social Icons", responsive: RESPONSIVE, options: LEFT_CENTER_RIGHT },

    /* ── Style ▸ Icon ─────────────────────────────────────────────────── */
    { key: "icon_color", label: "Color", type: "select", tab: "style", section: "Icon", options: [
      { value: "default", label: "Official Color" }, { value: "custom", label: "Custom" }] },
    { key: "icon_primary_color", label: "Primary Color", type: "colour", tab: "style", section: "Icon" },
    { key: "icon_secondary_color", label: "Secondary Color", type: "colour", tab: "style", section: "Icon" },
    { key: "icon_size", label: "Size", type: "number", tab: "style", section: "Icon", responsive: RESPONSIVE },
    { key: "icon_padding", label: "Padding", type: "number", tab: "style", section: "Icon", responsive: RESPONSIVE },
    { key: "icon_spacing", label: "Spacing", type: "number", tab: "style", section: "Icon", responsive: RESPONSIVE },
    { key: "row_gap", label: "Rows Gap", type: "number", tab: "style", section: "Icon", responsive: RESPONSIVE },
    { key: "image_border_border", label: "Border Type", type: "select", tab: "style", section: "Icon", options: BORDER_TYPE_OPTIONS },
    { key: "image_border_width", label: "Border Width", type: "number", tab: "style", section: "Icon", responsive: RESPONSIVE },
    { key: "image_border_color", label: "Border Color", type: "colour", tab: "style", section: "Icon" },
    { key: "border_radius", label: "Border Radius", type: "number", tab: "style", section: "Icon", responsive: RESPONSIVE,
      help: "Overrides the Shape. Leave it below zero to let the Shape decide." },

    /* ── Style ▸ Icon Hover ───────────────────────────────────────────── */
    { key: "hover_primary_color", label: "Primary Color", type: "colour", tab: "style", section: "Icon Hover" },
    { key: "hover_secondary_color", label: "Secondary Color", type: "colour", tab: "style", section: "Icon Hover" },
  ],
};

export default SOCIAL_ICONS_DEF;
