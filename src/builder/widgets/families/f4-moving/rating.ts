/**
 * f4-moving/rating.ts — Elementor's **Rating**, by its own name, group, panel
 * sections, control labels and defaults.
 *
 * WAVE 2. The kind already existed in `widgets/icons.ts` with five controls.
 * THE STORED ID IS UNCHANGED — `star_rating` — because documents carry it;
 * only the panel, the canvas and the mailbox change.
 *
 * ── WHICH ELEMENTOR WIDGET THIS IS, SETTLED IN THE LIVE EDITOR ────────────
 * Elementor ships TWO. Driven on 2026-09-19
 * (`elementor-reference/widgets/_g4_f4_panels.json`):
 *
 *     rating        title "Rating",      show_in_panel TRUE   — the tile
 *     star-rating   title "Star Rating", show_in_panel FALSE  — deprecated
 *
 * So the widget a person is offered is `rating`, and this definition is its
 * panel: Content › Rating (Rating Scale, Rating, Icon, Alignment) and
 * Style › Icon (Size, Spacing, Color, Unmarked Color). Eight controls, which
 * is ALL of them — `rating.panel.png` and the machine file agree.
 *
 * ── THE TITLE, SAID OUT LOUD ──────────────────────────────────────────────
 * ELEMENTOR'S RATING HAS NO TITLE CONTROL. Ours did. Carrying one would be a
 * widget that is nearly Elementor's, which is the exact thing D-168 forbids,
 * so the CONTROL is gone and the tile now matches the real one. The PROP is
 * still read and still drawn, so nobody's stored page loses the words they
 * typed — and `test/families-f4-moving.test.mjs` pins that loss-of-control out
 * loud rather than letting it look like nothing happened. A heading above a
 * rating is a Heading widget above a Rating widget, which is a SECTION
 * TEMPLATE, and that is D-168's own model.
 *
 * ── WHO OFFERS IT ─────────────────────────────────────────────────────────
 * `BUILDER_OFFERS_2026-09-19.json` has `rating` on all five panels. Four are
 * declared here — website, landing, newsletter, proposal. **My Brand is not**,
 * and the reason is a fact about the code, not a preference: the studio is an
 * absolute-pixel canvas and places LAYERS, and this family has no
 * `studioInsert` for a rating, so the tile would be a button that does nothing.
 * The offer guard reports it as missing for My Brand, which is TRUE.
 */
import type { Widget } from "../../../model";
import { esc } from "../../../esc";
import type { RenderContext } from "../../../render";
import { pictureFrom } from "../../../pictures";
import type { EmailRenderContext, FamilyWidgetDef } from "../types";
import { FLEX_OF, colour, decl, emailStack, num, px, startEnd, str } from "./parts";

/**
 * THE SHAPES A RATING CAN BE DRAWN IN.
 *
 * Elementor's control is `icons`, its whole Font Awesome library behind a
 * search box. Our panel has no icon-library control — the platform's one icon
 * picker is a short select (`widgets/glyph.ts`, and the comment there explains
 * why it is short) — so this is that same mechanism with the three marks a
 * rating is ever drawn with. Anything else is an Image. The full library is
 * written up in the handoff as a gap, not papered over here.
 */
export const RATING_ICONS: ReadonlyArray<{ value: string; full: string; half: string; empty: string; label: string }> = [
  { value: "eicon-star", full: "★", half: "⯪", empty: "☆", label: "Star" },
  { value: "eicon-heart", full: "♥", half: "♥", empty: "♡", label: "Heart" },
  { value: "eicon-circle", full: "●", half: "◐", empty: "○", label: "Circle" },
];

export const RATING_ICON_OPTIONS = RATING_ICONS.map((i) => ({ value: i.value, label: i.label }));

function marks(iconValue: unknown) {
  const v = typeof iconValue === "object" && iconValue
    ? str((iconValue as any).value) : str(iconValue);
  return RATING_ICONS.find((i) => i.value === v) ?? RATING_ICONS[0];
}

/**
 * HOW MANY OUT OF HOW MANY — read from EVERY spelling that has been stored.
 *
 * `rating_value` is Elementor's modern key, `rating` is what our own panel has
 * stored since the widget existed, and `scale` is what the mailbox and the
 * hosted-landing renderers have read all along (a third vocabulary, and the
 * reason a mailbox rating has been drawing five stars whatever the author
 * chose). One reader, so the canvas, the mailbox and the published page cannot
 * disagree again.
 */
export function ratingOf(props: Record<string, unknown>): { value: number; scale: number } {
  const p: any = props || {};
  const rawScale = p.rating_scale && typeof p.rating_scale === "object"
    ? (p.rating_scale as any).size : (p.rating_scale == null ? p.scale : p.rating_scale);
  const scale = num(rawScale, 5, 1, 10);
  const value = num(p.rating_value == null ? p.rating : p.rating_value, 0, 0, scale);
  return { value, scale };
}

/**
 * The row of marks. One writer for every surface.
 *
 * `entities` is for a MAILBOX: a raw ★ depends on the message's charset being
 * honoured and some clients do not, so the mailbox half sends `&#9733;` and
 * every other surface sends the character. The two must never disagree about
 * how many are filled, which is why it is one function with a switch and not
 * two loops.
 */
export function ratingMarks(props: Record<string, unknown>, entities = false): string {
  const { value, scale } = ratingOf(props);
  const m = marks((props as any)?.rating_icon);
  const as = (ch: string) => (entities ? `&#${ch.codePointAt(0)};` : ch);
  let out = "";
  for (let i = 1; i <= scale; i += 1) {
    out += value >= i ? as(m.full) : (value >= i - 0.5 ? as(m.half) : as(m.empty));
  }
  return out;
}

/** What a screen reader is told, and what the PDF prints. One sentence. */
export function ratingLabel(props: Record<string, unknown>): string {
  const { value, scale } = ratingOf(props);
  return `${value} out of ${scale}`;
}

export function renderRating(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const across = startEnd(p.icon_alignment == null ? p.align : p.icon_alignment) || "start";
  /* `stars_color` is what the legacy definition stored; `icon_color` is
     Elementor's. Both read, one written. */
  const ink = colour(p.icon_color) || colour(p.stars_color) || esc(ctx.accent);
  const unmarked = colour(p.icon_unmarked_color);
  const size = px(p.icon_size, 8, 120) || "20px";
  const gap = px(p.icon_gap, 0, 60) || "2px";

  const { value, scale } = ratingOf(p);
  const m = marks(p.rating_icon);
  /* Marked and unmarked are drawn as separate spans ONLY so Unmarked Color can
     be honoured; a single string could not carry two colours. */
  let cells = "";
  for (let i = 1; i <= scale; i += 1) {
    const filled = value >= i;
    const half = !filled && value >= i - 0.5;
    const ch = filled ? m.full : half ? m.half : m.empty;
    const col = filled || half ? ink : (unmarked || ink);
    cells += `<span style="color:${col}">${ch}</span>`;
  }

  /* THE TITLE. No control any more — Elementor has none — but a stored one is
     still drawn, and still editable in place, so nobody loses their words. */
  const title = str(p.title).trim()
    ? `<span class="bx-stars-t" data-edit="title">${esc(str(p.title))}</span>` : "";

  return `<div class="bx-stars" role="img" aria-label="${esc(ratingLabel(p))}" style="display:flex;align-items:center;gap:8px;justify-content:${
    FLEX_OF[across]}">${title}<span aria-hidden="true" style="${decl("font-size", size)}${
    decl("letter-spacing", gap)}line-height:1.2">${cells}</span></div>`;
}

/**
 * THE MAILBOX HALF — tables, inline styles, no class, no flex, no grid.
 *
 * `adapters/email/emailRender.ts` refuses anything else and that check is not
 * weakened for a family. The Portal's own `emStarRating` read `p.scale`,
 * `p.rating` and `p.colour` — a vocabulary the panel has never written — so an
 * author who set the scale to 10 and picked a colour got five stars in the
 * brand accent. This one reads what the panel stores, and it is asked first.
 */
export function emailRating(w: Widget, c: EmailRenderContext): string {
  const p: any = w.props || {};
  const across = startEnd(p.icon_alignment == null ? p.align : p.icon_alignment) || "start";
  const align = across === "center" ? "center" : across === "end" ? "right" : "left";
  const ink = colour(p.icon_color) || colour(p.stars_color) || esc(str(c.accent) || "#0C4A60");
  const size = px(p.icon_size, 8, 120) || "18px";
  const font = esc(emailStack(c.bodyFont));
  const title = str(p.title).trim()
    ? `<span style="font-family:${font};font-size:14px;color:#111827;margin-right:8px;">${esc(str(p.title))}</span>`
    : "";
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 12px 0;"><tr>`
    + `<td align="${align}" style="font-family:${font};font-size:${size};line-height:1.2;letter-spacing:2px;color:${ink};">`
    + `${title}${ratingMarks(p, true)}</td></tr></table>`;
}

export const RATING_DEF: FamilyWidgetDef = {
  kind: "star_rating",
  /* ELEMENTOR'S OWN TITLE, which is "Rating". "Star Rating" is the DEPRECATED
     widget's title and it is not a tile a person is offered. */
  label: "Rating",
  description: "A row of stars out of five — four and a half, or however many you choose.",
  icon: "Stars",
  picture: pictureFrom(`<path d="M12 14l2 5 5 .5-4 3.5 1.5 5-4.5-3-4.5 3 1.5-5-4-3.5 5-.5z" fill="#94A3B8" stroke="none"/>`
    + `<path d="M32 14l2 5 5 .5-4 3.5 1.5 5-4.5-3-4.5 3 1.5-5-4-3.5 5-.5z" fill="#94A3B8" stroke="none"/>`
    + `<path d="M52 14l2 5 5 .5-4 3.5 1.5 5-4.5-3-4.5 3 1.5-5-4-3.5 5-.5z" fill="#CBD5E1" stroke="none"/>`),
  category: "General",
  builders: ["website", "landing", "newsletter", "proposal"],
  /* Elementor's own defaults: scale 5, no value typed yet, the star. */
  defaults: {
    rating_scale: 5,
    rating_value: 5,
    rating_icon: "eicon-star",
    icon_alignment: "",
  },
  controls: [
    /* ── Content › Rating — all four of Elementor's, in its own order ────── */
    { key: "rating_scale", label: "Rating Scale", type: "number", tab: "content", section: "Rating" },
    { key: "rating_value", label: "Rating", type: "number", tab: "content", section: "Rating" },
    { key: "rating_icon", label: "Icon", type: "select", tab: "content", section: "Rating",
      options: RATING_ICON_OPTIONS },
    { key: "icon_alignment", label: "Alignment", type: "select", tab: "content", section: "Rating",
      responsive: true,
      options: [{ value: "start", label: "Start" }, { value: "center", label: "Center" }, { value: "end", label: "End" }] },

    /* ── Style › Icon — all four of Elementor's ──────────────────────────── */
    { key: "icon_size", label: "Size", type: "number", tab: "style", section: "Icon", responsive: true },
    { key: "icon_gap", label: "Spacing", type: "number", tab: "style", section: "Icon", responsive: true },
    { key: "icon_color", label: "Color", type: "colour", tab: "style", section: "Icon" },
    { key: "icon_unmarked_color", label: "Unmarked Color", type: "colour", tab: "style", section: "Icon" },
  ],
};
