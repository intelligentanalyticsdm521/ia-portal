/**
 * Share Buttons — Elementor `share-buttons`, group Pro.
 *
 * Elementor's own title, its one Content section and one Style section (both
 * called "Share Buttons"), and its own control labels — "View", "Label",
 * "Skin", "Shape", "Columns", "Alignment", "Target URL", "Link", "Color",
 * "Primary Color", "Secondary Color", "Icon Size", "Columns Gap" — read off
 * `BUILDER_WIDGET_CATALOG_2026-09-17.pro.json`. NOT seen live: the Playground
 * sandbox the free widgets were photographed in has no Pro licence.
 *
 * Offered on website and landing, which is where the offer file lists it.
 *
 * ── NO SCRIPT, ON PURPOSE ─────────────────────────────────────────────────
 * Every network here shares through a plain address — Facebook's `sharer.php`,
 * X's `intent/tweet`, LinkedIn's `share-offsite`. So these are ordinary links
 * and the widget works with JavaScript switched off, which is why there is no
 * fallback section in this file: there is nothing to fall back FROM.
 */
import type { Widget } from "../../../model";
import { esc } from "../../../esc";
import { type RenderContext } from "../../../render";
import { pictureFrom } from "../../../pictures";
import type { FamilyWidgetDef } from "../types";
import { flexJustify, str } from "./shared";

/**
 * THE NETWORKS ON OFFER, with Elementor's own `button` value, its official
 * colour, and the address the browser is sent to.
 *
 * `{url}` is replaced with the encoded address being shared. Elementor ships
 * forty-odd networks; these six are the ones a small business's customers
 * actually use, and the same judgement Elementor makes when it defaults the
 * repeater to three. `email` is last because it is the one that always works.
 */
export const SHARE_NETWORKS: ReadonlyArray<{
  value: string; label: string; mark: string; colour: string; href: string;
}> = [
  { value: "facebook", label: "Facebook", mark: "f", colour: "#1877F2", href: "https://www.facebook.com/sharer/sharer.php?u={url}" },
  { value: "x-twitter", label: "X (Twitter)", mark: "X", colour: "#000000", href: "https://twitter.com/intent/tweet?url={url}" },
  { value: "linkedin", label: "LinkedIn", mark: "in", colour: "#0A66C2", href: "https://www.linkedin.com/sharing/share-offsite/?url={url}" },
  { value: "pinterest", label: "Pinterest", mark: "P", colour: "#E60023", href: "https://pinterest.com/pin/create/button/?url={url}" },
  { value: "whatsapp", label: "WhatsApp", mark: "W", colour: "#25D366", href: "https://api.whatsapp.com/send?text={url}" },
  { value: "email", label: "Email", mark: "@", colour: "#EA4335", href: "mailto:?body={url}" },
];

const NETWORK_BY_VALUE = new Map(SHARE_NETWORKS.map((n) => [n.value, n]));

/** Elementor's default repeater: Facebook, X, LinkedIn. */
export const DEFAULT_SHARE_BUTTONS = [
  { button: "facebook" }, { button: "x-twitter" }, { button: "linkedin" },
];

/** A stored repeater row, whatever shape it came back in, as a network value. */
export function networkOf(row: unknown): string {
  if (typeof row === "string") return row.trim().toLowerCase();
  const v = str((row as any)?.button || (row as any)?.value || (row as any)?.network);
  return v.trim().toLowerCase();
}

/** The rows an author chose, dropped to the ones we can actually draw. */
export function chosenNetworks(props: Record<string, unknown>): typeof SHARE_NETWORKS {
  const rows = Array.isArray(props.share_buttons) ? props.share_buttons : DEFAULT_SHARE_BUTTONS;
  const out = rows
    .map((r) => NETWORK_BY_VALUE.get(networkOf(r)))
    .filter((n): n is (typeof SHARE_NETWORKS)[number] => !!n);
  return out.length ? out : [];
}

/**
 * THE ADDRESS BEING SHARED, or "" when nothing here can know it.
 *
 * Elementor's `share_url_type` is `current_page` by default, and on a published
 * site the page engine fills the page's own address in. Nothing on the canvas
 * has that address — a `RenderContext` carries the brand and the document, not
 * a URL — so `current_page` resolves to "" here and the buttons are drawn
 * WITHOUT links, with one plain sentence saying so while the author is editing.
 * The alternative was to invent an address, which would have shipped buttons
 * that share the wrong page.
 */
export function shareTarget(props: Record<string, unknown>): string {
  return str(props.share_url_type) === "custom" ? str(props.share_url).trim() : "";
}

export function renderShareButtons(w: Widget, ctx: RenderContext): string {
  const p = (w.props || {}) as Record<string, unknown>;
  const networks = chosenNetworks(p);
  if (!networks.length && ctx.mode !== "edit") return "";
  if (!networks.length) {
    return `<div class="bx-f3-share bx-f3-share-empty" style="border:1px dashed #CBD5E1;border-radius:8px;padding:14px;text-align:center;color:#94A3B8;font-size:12px">Choose which networks to share to in the panel on the right.</div>`;
  }

  const view = str(p.view) || "icon-text";
  const showLabel = view !== "icon" && str(p.show_label) !== "";
  const shape = str(p.shape) || "square";
  const radius = shape === "circle" ? "999px" : shape === "rounded" ? "6px" : "0";
  const skin = str(p.skin) || "gradient";
  const custom = str(p.color_source) === "custom";
  const primary = str(p.primary_color);
  const secondary = str(p.secondary_color);
  const iconSize = Math.max(9, Math.min(48, Number(p.icon_size) || 15));
  const gap = Math.max(0, Math.min(60, Number(p.column_gap) ?? 10));
  const columns = Math.max(0, Math.min(6, Number(p.columns) || 0));
  const target = shareTarget(p);

  const cells = networks.map((n) => {
    /* Elementor's five skins come down to two questions: is the brand colour
       the FILL or the INK, and is there an edge. `gradient` and `boxed` fill,
       `flat` fills without a radius of its own, `framed` draws the edge and
       `minimal` draws neither. */
    const brand = custom && primary ? primary : n.colour;
    const ink = custom && secondary ? secondary : "#FFFFFF";
    const filled = skin === "gradient" || skin === "boxed" || skin === "flat";
    const edge = skin === "framed" ? `border:2px solid ${esc(brand)};` : "";
    const paint = filled
      ? `background:${esc(brand)};color:${esc(ink)};`
      : `background:transparent;color:${esc(brand)};${edge}`;
    const inner = `${view === "text" ? "" : `<span class="bx-f3-share-mark" style="font-weight:700;font-size:${iconSize}px;line-height:1">${esc(n.mark)}</span>`}`
      + `${showLabel ? `<span class="bx-f3-share-label" style="font-size:13px;font-weight:600">${esc(n.label)}</span>` : ""}`;
    const box = `display:inline-flex;align-items:center;justify-content:center;gap:8px;`
      + `padding:${showLabel || view === "text" ? "8px 14px" : `${Math.round(iconSize * 0.6)}px`};`
      + `min-width:${iconSize * 2 + 8}px;border-radius:${radius};text-decoration:none;${paint}`;
    return target
      ? `<a class="bx-f3-share-b" data-network="${esc(n.value)}" href="${esc(n.href.replace("{url}", encodeURIComponent(target)))}" style="${box}">${inner}</a>`
      : `<span class="bx-f3-share-b" data-network="${esc(n.value)}" style="${box}">${inner}</span>`;
  }).join("");

  const row = columns
    ? `display:grid;grid-template-columns:repeat(${columns},minmax(0,1fr));gap:${gap}px;`
    : `display:flex;flex-wrap:wrap;gap:${gap}px;justify-content:${flexJustify(p.alignment)};`;
  const note = (!target && ctx.mode === "edit")
    ? `<div class="bx-f3-share-note" style="font-size:11px;color:#94A3B8;margin-top:6px">The address of this page is used when it is published. To share a different address, set Target URL to Custom.</div>`
    : "";
  return `<div class="bx-f3-share"><div style="${row}">${cells}</div>${note}</div>`;
}

export const SHARE_BUTTONS_DEF: FamilyWidgetDef = {
  kind: "share_buttons",
  label: "Share Buttons",
  description: {
    website: "Buttons that let a visitor post this page to Facebook, X or LinkedIn.",
    landing: "Buttons that let a visitor post this page to Facebook, X or LinkedIn.",
  },
  icon: "Share2",
  picture: pictureFrom(
    `<rect x="6" y="14" width="15" height="13" rx="2" fill="#94A3B8" stroke="none"/>`
    + `<rect x="24" y="14" width="15" height="13" rx="2" fill="#94A3B8" stroke="none"/>`
    + `<rect x="42" y="14" width="15" height="13" rx="2" fill="#CBD5E1" stroke="none"/>`),
  category: "General",
  builders: ["website", "landing"],
  tier: "pro",
  defaults: {
    share_buttons: DEFAULT_SHARE_BUTTONS.map((r) => ({ ...r })),
    view: "icon-text",
    show_label: "yes",
    skin: "gradient",
    shape: "square",
    columns: "0",
    alignment: "",
    share_url_type: "current_page",
    share_url: "",
    color_source: "official",
    primary_color: "",
    secondary_color: "",
    icon_size: 15,
    column_gap: 10,
  },
  controls: [
    { key: "share_buttons", label: "Share Buttons", type: "list", tab: "content", section: "Share Buttons",
      help: "One line per network: facebook, x-twitter, linkedin, pinterest, whatsapp or email." },
    { key: "view", label: "View", type: "select", tab: "content", section: "Share Buttons", options: [
      { value: "icon-text", label: "Icon & Text" }, { value: "icon", label: "Icon" }, { value: "text", label: "Text" }] },
    { key: "show_label", label: "Label", type: "toggle", tab: "content", section: "Share Buttons",
      help: "Show the network's name beside its mark" },
    { key: "skin", label: "Skin", type: "select", tab: "content", section: "Share Buttons", options: [
      { value: "gradient", label: "Gradient" }, { value: "minimal", label: "Minimal" },
      { value: "framed", label: "Framed" }, { value: "boxed", label: "Boxed" }, { value: "flat", label: "Flat" }] },
    { key: "shape", label: "Shape", type: "select", tab: "content", section: "Share Buttons", options: [
      { value: "square", label: "Square" }, { value: "rounded", label: "Rounded" }, { value: "circle", label: "Circle" }] },
    /* `responsive: true` copied from the machine file, never guessed: it lists
       `columns_tablet` and `columns_mobile` beside `columns`, which is exactly
       how `deviceKey()` already spells a per-device value. */
    { key: "columns", label: "Columns", type: "select", tab: "content", section: "Share Buttons", responsive: true, options: [
      { value: "0", label: "Auto" }, { value: "1", label: "1" }, { value: "2", label: "2" },
      { value: "3", label: "3" }, { value: "4", label: "4" }, { value: "5", label: "5" }, { value: "6", label: "6" }] },
    { key: "alignment", label: "Alignment", type: "select", tab: "content", section: "Share Buttons", responsive: true, options: [
      { value: "left", label: "Left" }, { value: "center", label: "Centre" },
      { value: "right", label: "Right" }, { value: "justify", label: "Justified" }] },
    { key: "share_url_type", label: "Target URL", type: "select", tab: "content", section: "Share Buttons", options: [
      { value: "current_page", label: "Current Page" }, { value: "custom", label: "Custom" }] },
    { key: "share_url", label: "Link", type: "link", tab: "content", section: "Share Buttons",
      help: "Only used when Target URL is Custom." },
    { key: "color_source", label: "Color", type: "select", tab: "style", section: "Share Buttons", options: [
      { value: "official", label: "Official" }, { value: "custom", label: "Custom" }] },
    { key: "primary_color", label: "Primary Color", type: "colour", tab: "style", section: "Share Buttons" },
    { key: "secondary_color", label: "Secondary Color", type: "colour", tab: "style", section: "Share Buttons" },
    { key: "icon_size", label: "Icon Size", type: "number", tab: "style", section: "Share Buttons", responsive: true },
    { key: "column_gap", label: "Columns Gap", type: "number", tab: "style", section: "Share Buttons", responsive: true },
  ],
};
