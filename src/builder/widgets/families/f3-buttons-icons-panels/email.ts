/**
 * families/f3-buttons-icons-panels/email.ts — THE MAILBOX HALF of the eight
 * everyday widgets.
 *
 * ── WHY A SECOND RENDERER AND NOT THE PAGE ONE ────────────────────────────
 * `adapters/email/emailRender.ts` refuses `display:flex`, `display:grid`,
 * `flex-direction`, `position:absolute|fixed` and any `class=` attribute,
 * because Outlook on Windows renders through Word. Every page renderer in this
 * family lays out with flex and names its parts with classes, so a mailbox
 * needs tables. That is a difference in PAINT, never in model: the same props,
 * the same defaults, the same decisions, drawn with `<table>`.
 *
 * ── BOTH SPELLINGS, EVERYWHERE ────────────────────────────────────────────
 * A newsletter saved before D-165 stores an Icon Box as `title`/`description`
 * and one saved after it stores `title_text`/`description_text`. Reading only
 * the new pair blanked the old cards, which the Portal's own golden fixture
 * caught the moment LUMEN's copy was compared against it byte for byte.
 *
 * ── WHAT IT FIXES, NOT JUST WHAT IT ADDS ──────────────────────────────────
 * The mailbox switch had its own renderers for these kinds and they read its
 * OWN prop names, which the widget definitions stopped storing at D-165:
 *
 *   · `emAlert` reads `p.title`, `p.text` and `p.type`. The Alert widget stores
 *     `alert_title`, `alert_description` and `alert_type`. Every Alert in every
 *     newsletter has therefore drawn NOTHING — it returns "" when both are
 *     empty, and both were always empty.
 *   · `emIcon` reads `p.colour`, `p.url` and `p.icon`; the widget stores
 *     `primary_color`, `link` and `selected_icon`.
 *   · `emIconBox` reads `p.position`/`p.align`/`p.size`/`p.colour`/`p.icon`;
 *     the widget stores `position`, `text_align`, `icon_size`, `primary_color`
 *     and `selected_icon`.
 *   · `emButton` reads `p.label`, `p.url` and `p.colour`; Elementor's keys are
 *     `text`, `link` and `background_color`.
 *
 * A family renderer is asked BEFORE that switch (D-168 item 5b), so these
 * replace them. Both spellings are read in every one, so a newsletter saved
 * last month keeps its words.
 *
 * ── THE OFFER ─────────────────────────────────────────────────────────────
 * `BUILDER_OFFERS_2026-09-19.json` gives the newsletter all eight of this
 * family's everyday widgets — button, divider, spacer, icon, icon-list,
 * icon-box, social-icons and alert — so all eight are here and none is
 * skipped.
 */
import type { Widget } from "../../../model";
import { esc } from "../../../esc";
import { fill } from "../../../merge";
import type { EmailRenderContext } from "../types";
import { DEFAULT_ICON, glyphFor } from "../../glyph";
import { str } from "./shared";
import { borderStyle, colour, firstStr, num, on, shapeRadius } from "./deep";
import { rows as iconListRows } from "./iconList";
import { SOCIAL_NETWORKS, socialRows } from "./socialIcons";

/** What this module needs off the adapter's context, and nothing more. */
interface Ctx extends EmailRenderContext {
  mode?: string;
  merge?: unknown;
  accent?: string;
  ink?: string;
  paper?: string;
  bodyFont?: string;
  typeCss?: string;
}

const STACK = "Helvetica, Arial, sans-serif";

const accentOf = (c: Ctx) => str(c.accent) || "#0F7FA8";
const inkOf = (c: Ctx) => str(c.ink) || "#0B1C24";
const paperOf = (c: Ctx) => str(c.paper) || "#FFFFFF";
const stackOf = (c: Ctx) => (str(c.bodyFont) ? `${str(c.bodyFont)}, ${STACK}` : STACK);

/**
 * Merge-fill and escape, with THE ONE filler.
 *
 * `builder/merge`'s `fill` is the same function `render.ts` and
 * `emailRender.ts` both call. A family that wrote its own would be a second
 * answer to "what does {{customer_name}} become", and a mailbox is the one
 * place an unfilled token is unrecoverable.
 */
function t(value: unknown, c: Ctx): string {
  return esc(fill(String(value ?? ""), c.merge as never, (c.mode as never) ?? "view"));
}

/** `data-edit`, only while editing — a sent email carries no markers. */
function edit(path: string, c: Ctx, placeholder?: string): string {
  if (c.mode !== "edit") return "";
  return ` data-edit="${esc(path)}"${placeholder ? ` data-placeholder="${esc(placeholder)}"` : ""}`;
}

/** Elementor's alignments, in both dialects, as a mailbox `align`. */
function emAlign(v: unknown, fallback: string): string {
  const s = str(v).toLowerCase();
  if (s === "left" || s === "start") return "left";
  if (s === "right" || s === "end") return "right";
  if (s === "center" || s === "justify") return "center";
  return fallback;
}

/** A light ink for a dark fill and a dark one for a light fill. */
function contrastInk(bg: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(bg.trim());
  if (!m) return "#FFFFFF";
  const n = parseInt(m[1], 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 165 ? "#0B1C24" : "#FFFFFF";
}

/* ══════════════════════════════════════════════════════════════════════════
   Button
   ══════════════════════════════════════════════════════════════════════════ */

const EM_SIZES: Record<string, { pad: string; size: number }> = {
  xs: { pad: "7px 14px", size: 12 }, sm: { pad: "11px 22px", size: 14 },
  md: { pad: "13px 26px", size: 15 }, lg: { pad: "16px 32px", size: 17 },
  xl: { pad: "20px 40px", size: 19 },
};
const EM_TYPES: Record<string, string> = {
  info: "#5BC0DE", success: "#5CB85C", warning: "#F0AD4E", danger: "#D9534F",
};

export function emailButton(w: Widget, c: Ctx): string {
  const p = (w.props || {}) as Record<string, unknown>;
  const words = firstStr(p.text, p.label);
  const href = firstStr(p.link, p.url) || "#";
  if (!words.trim() && c.mode !== "edit") return "";

  const size = EM_SIZES[str(p.size)] || EM_SIZES.sm;
  const legacy = str(p.style);
  const fillColour = colour(p.background_color, colour(p.colour, EM_TYPES[str(p.button_type)] || accentOf(c)));
  const outline = legacy === "outline";
  const plain = legacy === "plain_link";
  const ink = colour(p.button_text_color, outline || plain ? fillColour : contrastInk(fillColour));
  const radius = num(p.border_radius, 6, 0, 200);
  const padY = num(p.text_padding, 0, 0, 200);
  const padding = padY ? `${padY}px ${Math.round(padY * 2)}px` : size.pad;
  const type = num(p.typography_font_size, size.size, 6, 200);
  const weight = /^[1-9]00$/.test(str(p.typography_font_weight)) ? str(p.typography_font_weight) : "600";
  const transform = ["uppercase", "lowercase", "capitalize", "none"].includes(str(p.typography_text_transform))
    ? `text-transform:${str(p.typography_text_transform)};` : "";
  const stroke = borderStyle(p.border_border, outline ? "solid" : "none");
  const border = stroke === "none" ? ""
    : `border:${num(p.border_width, outline ? 2 : 1, 0, 40)}px ${stroke} ${colour(p.border_color, fillColour)};`;

  const label = `<span${edit("text", c, "Button text")}>${t(words, c)}</span>`;
  if (plain) {
    return `<div style="text-align:${emAlign(p.align, "left")};margin:0 0 20px 0;font-family:${stackOf(c)};font-size:${type}px;">`
      + `<a href="${esc(href)}" style="color:${esc(ink)};font-weight:${weight};${transform}text-decoration:underline;">${label}</a></div>`;
  }
  const stretch = str(p.align) === "justify";
  return `<table role="presentation" ${stretch ? 'width="100%" ' : ""}cellspacing="0" cellpadding="0" border="0" align="${emAlign(p.align, "left")}" style="margin:0 0 20px 0;${stretch ? "width:100%;" : ""}">`
    + `<tr><td align="center" style="border-radius:${radius}px;background:${outline ? paperOf(c) : esc(fillColour)};${border}">`
    + `<a href="${esc(href)}" style="${stretch ? "display:block;" : "display:inline-block;"}padding:${esc(padding)};font-family:${stackOf(c)};font-size:${type}px;font-weight:${weight};${transform}color:${esc(ink)};text-decoration:none;border-radius:${radius}px;${c.typeCss ?? ""}">${label}</a>`
    + `</td></tr></table>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   Divider
   ══════════════════════════════════════════════════════════════════════════ */

export function emailDivider(w: Widget, c: Ctx): string {
  const p = (w.props || {}) as Record<string, unknown>;
  const stored = str(p.style) || "solid";
  const gap = num(p.gap, 15, 0, 200);
  if (stored === "space_only") {
    return `<div style="height:${gap * 2}px;line-height:${gap * 2}px;font-size:1px;">&nbsp;</div>`;
  }
  const line = borderStyle(stored === "line" ? "solid" : stored, "solid");
  const weight = num(p.weight, 1, 0, 40);
  const rule = `border-top:${weight}px ${line} ${colour(p.color, colour(p.colour, "#E5E7EB"))};`;
  const width = num(p.width, 100, 1, 100);

  /* Elementor's "Add Element". In a mailbox the words go in their OWN cell
     between two ruled cells, because Word will not lay a run of text over a
     border. The symbol is the same shape. */
  const look = str(p.look) || "line";
  const middle = look === "line_text"
    ? `<td align="center" style="padding:0 ${num(p.text_spacing, 10, 0, 200)}px;font-family:${stackOf(c)};font-size:${num(p.typography_font_size, 14, 6, 200)}px;color:${esc(colour(p.text_color, inkOf(c)))};white-space:nowrap;"${edit("text", c, "A few words")}>${t(p.text, c)}</td>`
    : look === "line_icon"
      ? `<td align="center" style="padding:0 ${num(p.icon_spacing, 10, 0, 200)}px;font-family:${stackOf(c)};font-size:${num(p.icon_size, 20, 6, 200)}px;line-height:1;color:${esc(colour(p.primary_color, accentOf(c)))};">${esc(glyphFor(p.icon ?? DEFAULT_ICON))}</td>`
      : "";
  const cell = `<td style="${rule}font-size:0;line-height:0;">&nbsp;</td>`;
  const inner = middle ? `${cell}${middle}${cell}` : cell;
  return `<table role="presentation" width="${width}%" cellspacing="0" cellpadding="0" border="0" align="${emAlign(p.align, "center")}" style="margin:${gap}px 0;width:${width}%;"><tr>${inner}</tr></table>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   Spacer
   ══════════════════════════════════════════════════════════════════════════ */

export function emailSpacer(w: Widget, _c: Ctx): string {
  const p = (w.props || {}) as Record<string, unknown>;
  /* Never below 1: a zero-height cell is a cell Outlook collapses out of the
     document entirely, and the gap the author asked for disappears. */
  const h = Math.max(1, num(p.space ?? p.height, 50, 0, 2000));
  return `<div style="height:${h}px;line-height:${h}px;font-size:1px;">&nbsp;</div>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   Icon
   ══════════════════════════════════════════════════════════════════════════ */

export function emailIcon(w: Widget, c: Ctx): string {
  const p = (w.props || {}) as Record<string, unknown>;
  const size = num(p.size, 28, 6, 200);
  const primary = colour(p.primary_color, colour(p.colour, accentOf(c)));
  const secondary = colour(p.secondary_color, "#FFFFFF");
  const view = str(p.view) || "default";
  const pad = view === "default" ? 0 : num(p.icon_padding, Math.round(size * 0.45), 0, 200);
  const skin = view === "stacked" ? `background:${esc(primary)};color:${esc(secondary)};`
    : view === "framed" ? `border:${num(p.border_width, 2, 0, 40)}px solid ${esc(primary)};color:${esc(primary)};`
      : `color:${esc(primary)};`;
  const radius = num(p.border_radius, -1, 0, 400);
  const shape = view === "default" ? "" : `border-radius:${radius >= 0 ? `${radius}px` : shapeRadius(p.shape, "999px")};`;
  const glyph = esc(glyphFor(p.selected_icon ?? p.icon));
  const href = firstStr(p.link, p.url);
  const body = href ? `<a href="${esc(href)}" style="text-decoration:none;color:inherit;">${glyph}</a>` : glyph;
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="${emAlign(p.align, "left")}" style="margin:0 0 12px 0;">`
    + `<tr><td align="center" valign="middle" style="${skin}${shape}padding:${pad}px;font-family:${stackOf(c)};font-size:${size}px;line-height:1;">${body}</td></tr></table>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   Icon Box
   ══════════════════════════════════════════════════════════════════════════ */

export function emailIconBox(w: Widget, c: Ctx): string {
  const p = (w.props || {}) as Record<string, unknown>;
  const pos = str(p.position) || "block-start";
  const side = pos === "inline-start" || pos === "left" || pos === "inline-end" || pos === "right";
  const rightSide = pos === "inline-end" || pos === "right";
  const align = emAlign(p.text_align ?? p.align, side ? "left" : "center");

  const size = num(p.icon_size, 32, 6, 200);
  const primary = colour(p.primary_color, colour(p.colour, accentOf(c)));
  const secondary = colour(p.secondary_color, "#FFFFFF");
  const view = str(p.view) || "default";
  const pad = view === "default" ? 0 : num(p.icon_padding, Math.round(size * 0.4), 0, 200);
  const skin = view === "stacked" ? `background:${esc(primary)};color:${esc(secondary)};border-radius:${shapeRadius(p.shape)};`
    : view === "framed" ? `border:${num(p.border_width, 2, 0, 40)}px solid ${esc(primary)};color:${esc(primary)};border-radius:${shapeRadius(p.shape)};`
      : `color:${esc(primary)};`;
  const glyph = `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="${side ? "left" : align}"><tr><td align="center" style="${skin}padding:${pad}px;font-family:${stackOf(c)};font-size:${size}px;line-height:1;">${esc(glyphFor(p.selected_icon ?? p.icon))}</td></tr></table>`;

  const gapUnder = num(p.title_bottom_space, 4, 0, 200);
  const title = `<div style="font-family:${stackOf(c)};font-size:16px;font-weight:700;line-height:1.3;color:${esc(colour(p.title_color, inkOf(c)))};margin:0 0 ${gapUnder}px 0;text-align:${align};${c.typeCss ?? ""}"${edit("title_text", c, "A short title")}>${t(firstStr(p.title_text, p.title), c)}</div>`;
  const body = `<div style="font-family:${stackOf(c)};font-size:14px;line-height:1.6;color:${esc(colour(p.description_color, "#5A7A8A"))};text-align:${align};"${edit("description_text", c, "A line about it")}>${t(firstStr(p.description_text, p.description), c)}</div>`;
  const words = `${title}${body}`;

  const gap = num(p.icon_space, 12, 0, 200);
  const link = str(p.link).trim();
  const rowsHtml = side
    ? `<tr>${rightSide
      ? `<td valign="top">${words}</td><td valign="top" width="${size + pad * 2 + gap}" style="width:${size + pad * 2 + gap}px;padding:0 0 0 ${gap}px;">${glyph}</td>`
      : `<td valign="top" width="${size + pad * 2 + gap}" style="width:${size + pad * 2 + gap}px;padding:0 ${gap}px 0 0;">${glyph}</td><td valign="top">${words}</td>`}</tr>`
    : pos === "block-end" || pos === "bottom"
      ? `<tr><td valign="top">${words}</td></tr><tr><td style="padding:${gap}px 0 0 0;">${glyph}</td></tr>`
      : `<tr><td style="padding:0 0 ${gap}px 0;">${glyph}</td></tr><tr><td valign="top">${words}</td></tr>`;
  const table = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px 0;">${rowsHtml}</table>`;
  /* THE LINK, which the old mailbox renderer did not draw either. */
  return link ? `<a href="${esc(link)}" style="text-decoration:none;color:inherit;">${table}</a>` : table;
}

/* ══════════════════════════════════════════════════════════════════════════
   Icon List
   ══════════════════════════════════════════════════════════════════════════ */

export function emailIconList(w: Widget, c: Ctx): string {
  const p = (w.props || {}) as Record<string, unknown>;
  const all = iconListRows(p);
  const shown = c.mode === "edit" ? [...all, { text: "", icon: undefined, link: "" }]
    : all.filter((r) => r.text.trim());
  if (!shown.length) return "";

  const iconColour = colour(p.icon_color, accentOf(c));
  const iconSize = num(p.icon_size, 14, 6, 120);
  const textColour = colour(p.text_color, inkOf(c));
  const gap = num(p.text_indent, 8, 0, 120);
  const between = num(p.space_between, 6, 0, 200);
  const wantDivider = on(p.divider);
  const rule = wantDivider
    ? `border-bottom:${num(p.divider_weight, 1, 0, 20)}px ${borderStyle(p.divider_style, "solid")} ${colour(p.divider_color, "#ddd")};`
    : "";

  /* INLINE LAYOUT IS DRAWN AS ONE ROW OF CELLS, down-the-page as one row each.
     Elementor's Layout control therefore does something in a mailbox too,
     which it could not have done with a `<ul>`. */
  const inline = str(p.view) === "inline";
  const cell = (r: { text: string; icon: unknown; link: string }, i: number) => {
    const mark = `<span style="color:${esc(iconColour)};font-size:${iconSize}px;line-height:1;">${esc(glyphFor(r.icon ?? DEFAULT_ICON))}</span>`;
    /* ONE LIST, ONE PATH (R2-11) — see `iconList.ts rows()`. */
    const path = `items.${i}`;
    const words = `<span${edit(path, c, "add a point…")}>${t(r.text, c)}</span>`;
    const body = r.link.trim()
      ? `<a href="${esc(r.link)}" style="color:inherit;text-decoration:none;">${mark}&nbsp;&nbsp;${words}</a>`
      : `${mark}&nbsp;&nbsp;${words}`;
    return { body, path };
  };

  const style = `font-family:${stackOf(c)};font-size:15px;line-height:1.6;color:${esc(textColour)};${c.typeCss ?? ""}`;
  if (inline) {
    const tds = shown.map((r, i) => `<td valign="middle" style="${style}padding:0 ${gap + between}px 0 0;">${cell(r, i).body}</td>`).join("");
    return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="${emAlign(p.icon_align, "left")}" style="margin:0 0 12px 0;"><tr>${tds}</tr></table>`;
  }
  const trs = shown.map((r, i) => {
    const last = i === shown.length - 1;
    return `<tr><td valign="top" style="${style}padding:0 0 ${between}px 0;${last ? "" : rule}">${cell(r, i).body}</td></tr>`;
  }).join("");
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 12px 0;">${trs}</table>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   Social Icons
   ══════════════════════════════════════════════════════════════════════════ */

export function emailSocialIcons(w: Widget, c: Ctx): string {
  const p = (w.props || {}) as Record<string, unknown>;
  const shown = socialRows(p).filter((r) => str(r?.link ?? r?.url).trim());
  if (!shown.length) {
    return c.mode === "edit"
      ? `<div style="text-align:${emAlign(p.align, "left")};font-family:${stackOf(c)};font-size:12px;color:#94A3B8;">Add the address of each account you want people to follow, in the panel on the right.</div>`
      : "";
  }
  const size = num(p.icon_size, 18, 6, 120);
  const pad = num(p.icon_padding, Math.round(size * 0.5), 0, 120);
  const gap = num(p.icon_spacing, 8, 0, 120);
  const radius = num(p.border_radius, -1, 0, 400);
  const official = str(p.icon_color || "default") !== "custom";
  const stroke = borderStyle(p.image_border_border, "none");

  const tds = shown.slice(0, 8).map((r) => {
    const net = SOCIAL_NETWORKS.find((n) => n.value === str(r?.social ?? r?.network)) || SOCIAL_NETWORKS[0];
    const bg = official ? net.brand : colour(p.icon_primary_color, accentOf(c));
    const ink = official ? "#FFFFFF" : colour(p.icon_secondary_color, "#FFFFFF");
    const border = stroke === "none" ? ""
      : `border:${num(p.image_border_width, 1, 0, 20)}px ${stroke} ${colour(p.image_border_color, bg)};`;
    return `<td style="padding:0 ${gap}px 0 0;"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>`
      + `<td align="center" valign="middle" width="${size + pad * 2}" height="${size + pad * 2}" style="width:${size + pad * 2}px;height:${size + pad * 2}px;background:${esc(bg)};border-radius:${radius >= 0 ? `${radius}px` : shapeRadius(p.shape, "999px")};${border}">`
      + `<a href="${esc(str(r.link ?? r.url))}" style="font-family:${stackOf(c)};font-size:${size}px;font-weight:700;color:${esc(ink)};text-decoration:none;line-height:1;">${esc(net.mark)}</a>`
      + `</td></tr></table></td>`;
  }).join("");
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="${emAlign(p.align, "left")}" style="margin:0 0 12px 0;"><tr>${tds}</tr></table>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   Alert
   ══════════════════════════════════════════════════════════════════════════ */

const EM_ALERT: Record<string, { bg: string; edge: string }> = {
  info: { bg: "#E8F4FA", edge: "#5BC0DE" },
  success: { bg: "#EAF6EC", edge: "#5CB85C" },
  warning: { bg: "#FEF3E8", edge: "#F0AD4E" },
  danger: { bg: "#FDECEA", edge: "#D9534F" },
};

export function emailAlert(w: Widget, c: Ctx): string {
  const p = (w.props || {}) as Record<string, unknown>;
  /* BOTH SPELLINGS. `alert_*` is what the widget stores; `title`/`text`/`type`
     is what the mailbox switch read, and reading only one of the two is
     exactly how an Alert came out blank in every newsletter. */
  const title = firstStr(p.alert_title, p.title);
  const body = firstStr(p.alert_description, p.description, p.text);
  const kind = str(p.alert_type || p.type) || "info";
  if (!title.trim() && !body.trim() && c.mode !== "edit") return "";

  const tone = EM_ALERT[kind] || EM_ALERT.info;
  const bg = colour(p.background, tone.bg);
  const edge = colour(p.border_color, tone.edge);
  const edgeWidth = num(p["border_left-width"], 4, 0, 40);
  const titleSize = num(p.alert_title_font_size, 15, 6, 200);
  const weight = /^[1-9]00$/.test(str(p.alert_title_font_weight)) ? str(p.alert_title_font_weight) : "700";
  const bodySize = num(p.alert_description_font_size, 14, 6, 200);

  const titleHtml = title.trim() || c.mode === "edit"
    ? `<div style="font-family:${stackOf(c)};font-size:${titleSize}px;font-weight:${weight};line-height:1.3;color:${esc(colour(p.title_color, inkOf(c)))};margin:0 0 4px 0;${c.typeCss ?? ""}"${edit("alert_title", c, "What must not be missed")}>${t(title, c)}</div>`
    : "";
  const bodyHtml = body.trim() || c.mode === "edit"
    ? `<div style="font-family:${stackOf(c)};font-size:${bodySize}px;line-height:1.6;color:${esc(colour(p.description_color, "#42606E"))};"${edit("alert_description", c, "Say a little more")}>${t(body, c)}</div>`
    : "";

  /* NO DISMISS BUTTON IN A MAILBOX, and that is a decision, not an omission.
     The page version closes the panel with a checkbox and a CSS sibling rule;
     `:checked` is not supported in Outlook, Gmail strips `<style>` blocks, and
     a button that visibly does nothing in an email is worse than no button.
     Elementor's own `show_dismiss` is still STORED and still published to
     WordPress, where the real widget honours it. */
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px 0;"><tr>`
    + `<td style="padding:12px 14px;background:${esc(bg)};border-left:${edgeWidth}px solid ${esc(edge)};">${titleHtml}${bodyHtml}</td>`
    + `</tr></table>`;
}

/** Every mailbox renderer this family declares, by the kind it draws. */
export const EMAIL_RENDERERS = {
  button: emailButton,
  divider: emailDivider,
  spacer: emailSpacer,
  icon: emailIcon,
  icon_box: emailIconBox,
  list: emailIconList,
  social_links: emailSocialIcons,
  alert: emailAlert,
};
