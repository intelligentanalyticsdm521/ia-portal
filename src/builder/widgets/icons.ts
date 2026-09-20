/**
 * builder/widgets/icons.ts — the four standard widgets whose subject is a mark:
 * **Icon**, **Icon Box**, **Social Icons** and **Star Rating**.
 *
 * D-165, scope §11.13.3. Elementor's names, Elementor's groups, Elementor's
 * control sections — read off `BUILDER_WIDGET_CATALOG_2026-09-17.elementor.json`
 * and confirmed in the live Playground editor on 2026-09-19, not remembered.
 *
 * ── WHY ONE FILE FOR FOUR WIDGETS ─────────────────────────────────────────
 * They share the one thing that is hard here: turning the author's choice into
 * something that draws on a web page, in a mailbox and on a printed PDF. That
 * lives in `glyph.ts` and these four are its only callers. Splitting them into
 * four files would put one import line between the decision and the four places
 * it has to hold.
 */
import type { Widget } from "../model";
import { esc } from "../esc";
import { type RenderContext } from "../render";
import type { WidgetControl, WidgetDef } from "../registry";
import { bar, pictureFrom } from "../pictures";
import { editRun } from "./text";
import { DEFAULT_ICON, ICON_OPTIONS, glyphFor } from "./glyph";

const str = (v: unknown): string => (v == null ? "" : String(v));

/* ── The controls, in the catalogue's own tabs and sections ─────────────────
   Every `section` below is the panel section the machine file puts the control
   in (`content/section_icon`, `style/section_style_icon` …), and every `tab` is
   its tab. The CORE controls only — the ones a person uses — because a widget
   that offered all 58 of Icon Box's would be a settings screen and not a
   builder. Which ones are core is the same judgement Elementor makes when it
   collapses the Style tab: text, link, size, alignment, colour, spacing. */

const ALIGN: WidgetControl = {
  key: "align", label: "Alignment", type: "select", tab: "style", section: "Icon",
  options: [
    { value: "left", label: "Left" }, { value: "center", label: "Centre" }, { value: "right", label: "Right" },
  ],
};

/* ══════════════════════════════════════════════════════════════════════════
   Icon — Elementor `icon`, group Basic
   ══════════════════════════════════════════════════════════════════════════ */

export function renderIcon(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const glyph = glyphFor(p.selected_icon);
  const size = Number(p.size) || 28;
  const colour = str(p.primary_color) || ctx.accent;
  const view = str(p.view || "default");
  const shape = str(p.shape || "circle");
  const framed = view === "stacked" || view === "framed";
  const pad = framed ? Math.round(size * 0.5) : 0;
  const skin = framed
    ? `padding:${pad}px;border-radius:${shape === "square" ? "6px" : "999px"};` +
      (view === "stacked" ? `background:${esc(colour)};color:#FFFFFF;` : `border:2px solid ${esc(colour)};color:${esc(colour)};`)
    : `color:${esc(colour)};`;
  const mark = `<span class="bx-icon" style="${skin}display:inline-flex;align-items:center;justify-content:center;font-size:${size}px;line-height:1">${glyph}</span>`;
  const link = str(p.link);
  const inner = link ? `<a href="${esc(link)}" style="text-decoration:none">${mark}</a>` : mark;
  return `<div class="bx-iconwrap" style="text-align:${esc(str(p.align) || "left")}">${inner}</div>`;
}

export const ICON_DEF: WidgetDef = {
  kind: "icon",
  label: "Icon",
  description: "One symbol — a tick, a star, a phone — in the colour you choose.",
  icon: "Star",
  picture: pictureFrom(`<path d="M32 10l5 11 12 1-9 8 3 12-11-7-11 7 3-12-9-8 12-1z" fill="#94A3B8" stroke="none"/>`),
  category: "Basic",
  /* EMAIL TOO, since integration 2026-09-19. `adapters/email/emailRender.ts`
     builds a mailbox out of tables and its own guards refuse flex, grid and
     classes, so this widget waited for a TABLE renderer of its own rather than
     borrowing the engine's CSS one. It has one now (and LUMEN's copy draws the
     same bytes), so §11.13.3's standard set really is offered here. */
  adapters: ["proposal", "website", "email", "landing", "brand"],
  defaults: { selected_icon: { ...DEFAULT_ICON }, view: "default", shape: "circle", link: "", primary_color: "", size: 28, align: "left" },
  controls: [
    { key: "selected_icon", label: "Icon", type: "select", tab: "content", section: "Icon", options: ICON_OPTIONS },
    { key: "view", label: "View", type: "select", tab: "content", section: "Icon", options: [
      { value: "default", label: "Default" }, { value: "stacked", label: "Stacked" }, { value: "framed", label: "Framed" }] },
    { key: "shape", label: "Shape", type: "select", tab: "content", section: "Icon", options: [
      { value: "circle", label: "Circle" }, { value: "square", label: "Square" }] },
    { key: "link", label: "Link", type: "link", tab: "content", section: "Icon" },
    ALIGN,
    { key: "primary_color", label: "Primary Color", type: "colour", tab: "style", section: "Icon" },
    { key: "size", label: "Size", type: "number", tab: "style", section: "Icon" },
  ],
};

/* ══════════════════════════════════════════════════════════════════════════
   Icon Box — Elementor `icon-box`, group General
   ══════════════════════════════════════════════════════════════════════════ */

export function renderIconBox(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const glyph = glyphFor(p.selected_icon);
  const colour = str(p.primary_color) || ctx.accent;
  const side = str(p.position || "top") !== "top";
  const align = str(p.text_align) || (side ? "left" : "center");
  const mark = `<span class="bx-icon" style="color:${esc(colour)};font-size:${Number(p.icon_size) || 32}px;line-height:1">${glyph}</span>`;
  return `<div class="bx-iconbox" style="display:flex;flex-direction:${side ? "row" : "column"};gap:12px;align-items:${side ? "flex-start" : align === "center" ? "center" : "flex-start"};text-align:${esc(align)}">
    <div class="bx-iconbox-mark">${mark}</div>
    <div class="bx-iconbox-body" style="flex:1 1 auto;min-width:0">
      ${editRun("title_text", p.title_text, "bx-h bx-h3", "A short title", ctx)}
      ${editRun("description_text", p.description_text, "bx-p", "A line about it", ctx, "p")}
    </div>
  </div>`;
}

export const ICON_BOX_DEF: WidgetDef = {
  kind: "icon_box",
  label: "Icon Box",
  description: {
    proposal: "A symbol with a title and a line under it — the three-across row.",
    website: "A symbol with a title and a line under it — the three-across row every page has.",
    landing: "A symbol with a title and a line under it — the three-across row every page has.",
    email: "A symbol with a title and a line under it — three across reads well in a mailbox.",
    brand: "A symbol with a title and a line under it, placed on the design.",
  },
  icon: "SquareDashedBottomCode",
  picture: pictureFrom(`<circle cx="32" cy="12" r="6" fill="#94A3B8" stroke="none"/>` + bar(18, 23, 28, 5) + bar(14, 32, 36)),
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
  defaults: {
    selected_icon: { ...DEFAULT_ICON }, title_text: "", description_text: "", link: "",
    position: "top", text_align: "center", primary_color: "", icon_size: 32,
  },
  controls: [
    { key: "selected_icon", label: "Icon", type: "select", tab: "content", section: "Icon Box", options: ICON_OPTIONS },
    { key: "title_text", label: "Title & Description", type: "text", tab: "content", section: "Icon Box" },
    { key: "description_text", label: "Description", type: "textarea", tab: "content", section: "Icon Box" },
    { key: "link", label: "Link", type: "link", tab: "content", section: "Icon Box" },
    { key: "position", label: "Icon Position", type: "select", tab: "style", section: "Icon Box", options: [
      { value: "top", label: "Top" }, { value: "left", label: "Left" }, { value: "right", label: "Right" }] },
    { key: "text_align", label: "Alignment", type: "select", tab: "style", section: "Icon Box", options: [
      { value: "left", label: "Left" }, { value: "center", label: "Centre" }, { value: "right", label: "Right" }] },
    { key: "primary_color", label: "Primary Color", type: "colour", tab: "style", section: "Icon" },
    { key: "icon_size", label: "Size", type: "number", tab: "style", section: "Icon" },
  ],
};

/* ══════════════════════════════════════════════════════════════════════════
   Social Icons — Elementor `social-icons`, group General
   ══════════════════════════════════════════════════════════════════════════ */

/** The networks the picker offers, with the letter each one draws as. */
export const SOCIAL_NETWORKS: ReadonlyArray<{ value: string; label: string; mark: string }> = [
  { value: "facebook", label: "Facebook", mark: "f" },
  { value: "instagram", label: "Instagram", mark: "in" },
  { value: "linkedin", label: "LinkedIn", mark: "in" },
  { value: "x", label: "X", mark: "X" },
  { value: "youtube", label: "YouTube", mark: "▶" },
  { value: "website", label: "Website", mark: "⌂" },
];

/**
 * BOTH SPELLINGS OF THE ONE LIST — D-168 item 4.
 *
 * `social_icon_list` is Elementor's own key and what the page builders store;
 * `links` is what the newsletter and landing templates have stored since D-165
 * and what both golden fixtures hold. One widget now, so one reader, and a
 * document written by either half keeps its accounts.
 */
export function socialRows(p: any): any[] {
  const own = Array.isArray(p?.social_icon_list) ? p.social_icon_list : [];
  if (own.length) return own;
  return Array.isArray(p?.links) ? p.links : [];
}

export function renderSocialIcons(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const rows: any[] = socialRows(p);
  const shown = rows.filter((r) => str(r?.link).trim());
  if (!shown.length && ctx.mode !== "edit") return "";
  if (!shown.length) {
    return `<div class="bx-social bx-social-empty">Add the address of each account you want people to follow.</div>`;
  }
  const round = str(p.shape || "rounded") !== "square";
  const size = Number(p.icon_size) || 18;
  const cells = shown.map((r) => {
    const net = SOCIAL_NETWORKS.find((n) => n.value === str(r?.social)) || SOCIAL_NETWORKS[0];
    return `<a class="bx-social-i" href="${esc(str(r.link))}" style="display:inline-flex;align-items:center;justify-content:center;width:${size * 2}px;height:${size * 2}px;border-radius:${round ? "999px" : "6px"};background:${esc(str(p.icon_primary_color) || ctx.accent)};color:#FFFFFF;font-size:${size}px;font-weight:700;text-decoration:none">${esc(net.mark)}</a>`;
  }).join("");
  return `<div class="bx-social" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:${str(p.align) === "center" ? "center" : str(p.align) === "right" ? "flex-end" : "flex-start"}">${cells}</div>`;
}

/**
 * ONE TILE CALLED SOCIAL ICONS — D-168 item 4.
 *
 * TWO kinds carried this label: `social_icons` (here, with Elementor's own
 * control keys, on the page builders) and `social_links` (in `registry.ts`,
 * with `links`, on the newsletter). Nothing showed two tiles at once only
 * because their adapter lists happened not to overlap; the offer file gives
 * Social Icons to all five builders, so the first family to widen either one
 * would have put two identical tiles on one panel.
 *
 * THE KIND KEPT IS `social_links`, and the codebase had already decided that:
 * `EMAIL_KIND_ALIASES` and `LANDING_KIND_ALIASES` both resolve Elementor's slug
 * `social_icons` TO `social_links`, under the heading "Elementor's spelling →
 * the kind we store". It is the kind the shipped newsletter and landing
 * templates place, the kind both golden fixtures hold, and the kind LUMEN
 * renders on a hosted page. Renaming it would have been a change to stored
 * documents in three repos to win a word.
 *
 * So this definition keeps ELEMENTOR'S controls and takes the STORED id, the
 * `registry.ts` entry is deleted, and `upgrade.ts` turns a stored `social_icons`
 * into a `social_links` on the way in. Both prop spellings are read, because a
 * page saved this morning holds `social_icon_list` and a newsletter saved last
 * month holds `links`.
 */
export const SOCIAL_ICONS_DEF: WidgetDef = {
  kind: "social_links",
  label: "Social Icons",
  description: "A row of links to your Facebook, Instagram and the rest.",
  icon: "Share2",
  picture: pictureFrom(`<circle cx="18" cy="20" r="6" fill="#94A3B8" stroke="none"/><circle cx="32" cy="20" r="6" fill="#94A3B8" stroke="none"/><circle cx="46" cy="20" r="6" fill="#94A3B8" stroke="none"/>`),
  category: "General",
  /* NOT `email` (D-165). §11.13.3 gives this row "the set above MINUS what
     email programs cannot show", and this widget's only renderer is the
     engine's, which draws with CSS. `adapters/email/emailRender.ts` builds a
     mailbox out of tables and its own guards refuse flex, grid and classes —
     so until it has a table renderer for this widget, offering it would be a
     tile that puts nothing in an inbox. The ask is item S2 in the handoff. */
  /* NOT `brand` (D-165). The Template Studio is an ABSOLUTE-PIXEL canvas: every
     object carries its own x, y, w and h, and `adapters/mybrand`'s
     `insertWidget` places one layer per kind. A widget whose shape is a flow —
     an icon beside a title, a picture above a line of words — has nothing to
     place there, and a tile whose button does nothing is the drift the studio's
     own test exists to catch. The studio keeps **Icon**, which IS a placed
     object and which it has always placed. The ask for the rest is item S2 in
     the handoff. */
  /* `email` GAINED (D-168 item 4): the offer file gives the newsletter Social
     Icons, `emailRender.emSocial` has drawn it as a table all along, and this
     is the kind it draws. NOT `brand`: the studio places LAYERS, and
     `adapters/mybrand/insert.ts` has nothing for this kind — a tile whose press
     puts nothing on the canvas is worse than a tile that is not there. The
     offer guard reports it as missing for My Brand, which is true. */
  adapters: ["proposal", "website", "landing", "email"],
  defaults: { social_icon_list: [], shape: "rounded", align: "left", icon_primary_color: "", icon_size: 18 },
  controls: [
    {
      key: "social_icon_list", label: "Social Icons", type: "list", tab: "content", section: "Social Icons",
      // Not "we use the accounts connected in My Brand": those are OAuth
      // identities, not public addresses, and a row of dead links in a client's
      // own email is worse than no row. The author gives the addresses.
      help: "Paste the address of each account you want people to follow.",
    },
    { key: "shape", label: "Shape", type: "select", tab: "content", section: "Social Icons", options: [
      { value: "rounded", label: "Rounded" }, { value: "square", label: "Square" }] },
    { key: "align", label: "Alignment", type: "select", tab: "content", section: "Social Icons", options: [
      { value: "left", label: "Left" }, { value: "center", label: "Centre" }, { value: "right", label: "Right" }] },
    { key: "icon_primary_color", label: "Color", type: "colour", tab: "style", section: "Social Icons" },
    { key: "icon_size", label: "Size", type: "number", tab: "style", section: "Social Icons" },
  ],
};

/* ══════════════════════════════════════════════════════════════════════════
   Star Rating — Elementor `star-rating`, group General
   ══════════════════════════════════════════════════════════════════════════ */

export function renderStarRating(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const scale = Number(p.rating_scale) === 10 ? 10 : 5;
  const rating = Math.max(0, Math.min(scale, Number(p.rating) || 0));
  const full = Math.round(rating);
  const solid = str(p.star_style || "star_fontawesome") === "star_unicode" ? "★" : "★";
  const hollow = "☆";
  const stars = `${solid.repeat(full)}${hollow.repeat(Math.max(0, scale - full))}`;
  const colour = str(p.stars_color) || ctx.accent;
  return `<div class="bx-rating" style="text-align:${esc(str(p.align) || "left")}">
    ${editRun("title", p.title, "bx-rating-t", "What is being rated?", ctx, "span")}
    <span class="bx-stars" style="color:${esc(colour)};letter-spacing:2px">${stars}</span>
  </div>`;
}

export const STAR_RATING_DEF: WidgetDef = {
  kind: "star_rating",
  /* ELEMENTOR'S OWN TITLE, which is "Rating" (D-168, and the 2026-09-17
     machine file says so). "Star Rating" is what the widget was called in
     Elementor 2.x and it is not what the tile says today. The stored `kind`
     stays `star_rating` because documents carry it. */
  label: "Rating",
  description: "A row of stars with an optional label — four and a half out of five.",
  icon: "Stars",
  picture: pictureFrom(`<path d="M12 14l2 5 5 .5-4 3.5 1.5 5-4.5-3-4.5 3 1.5-5-4-3.5 5-.5z" fill="#94A3B8" stroke="none"/>`
    + `<path d="M32 14l2 5 5 .5-4 3.5 1.5 5-4.5-3-4.5 3 1.5-5-4-3.5 5-.5z" fill="#94A3B8" stroke="none"/>`
    + `<path d="M52 14l2 5 5 .5-4 3.5 1.5 5-4.5-3-4.5 3 1.5-5-4-3.5 5-.5z" fill="#CBD5E1" stroke="none"/>`),
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
  defaults: { rating_scale: 5, rating: 5, title: "", star_style: "star_fontawesome", align: "left", stars_color: "" },
  controls: [
    { key: "rating_scale", label: "Rating Scale", type: "select", tab: "content", section: "Rating", options: [
      { value: "5", label: "0-5" }, { value: "10", label: "0-10" }] },
    { key: "rating", label: "Rating", type: "number", tab: "content", section: "Rating" },
    { key: "title", label: "Title", type: "text", tab: "content", section: "Rating" },
    { key: "align", label: "Alignment", type: "select", tab: "content", section: "Rating", options: [
      { value: "left", label: "Left" }, { value: "center", label: "Centre" }, { value: "right", label: "Right" }] },
    { key: "stars_color", label: "Color", type: "colour", tab: "style", section: "Stars" },
  ],
};
