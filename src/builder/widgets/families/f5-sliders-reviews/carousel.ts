/**
 * families/f5-sliders-reviews/carousel.ts — ONE CAROUSEL, shared by the family.
 *
 * BUILDER_FULL_WIDGET_PLAN_2026-09-19 §C.2: *"All one carousel engine. Building
 * them apart means building it five times."* Slides, Media Carousel,
 * Testimonial Carousel and Reviews are four panels over one strip of slides, so
 * the strip is written once, here, and each widget file says what goes in a
 * slide.
 *
 * ── THERE IS NO JAVASCRIPT IN IT, AND THAT IS THE FALLBACK ────────────────
 * On a published WordPress page the page engine's own script drives the real
 * widget. Everywhere else — the editor canvas, a landing preview, an email, a
 * proposal — there is no script, so the strip is a CSS scroll box with
 * `scroll-snap`: every slide is on the page, reachable by swiping or by the
 * scrollbar, with no script at all. A carousel that needs JS to show its FIRST
 * slide is a blank band the day the script fails to load, so the first slide is
 * simply the first thing in the flow.
 *
 * Pure strings. No React, no DOM, so the tests call it directly.
 */
import { esc } from "../../../esc";
import { type RenderContext } from "../../../render";

/** A value as a string, with null and undefined as the empty string. */
export const str = (v: unknown): string => (v == null ? "" : String(v));

/** A whole number inside a range — what a select or a slider stored. */
export function within(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n) : fallback;
}

/**
 * THE SLIDES OF A WIDGET, whatever the document spells them.
 *
 * The page engine's own key is `slides` on Reviews, Slides, Media Carousel and
 * Testimonial Carousel, and `carousel_items` on Carousel. A document written
 * before this family existed spells the reviews list `items`. First array with
 * something in it wins, so one reader serves the panel, the canvas, the mailbox
 * and the emitter, and a stored document never loses its slides to a rename.
 */
export function slideRows(props: unknown, ...keys: string[]): Array<Record<string, unknown>> {
  const p: any = props || {};
  for (const k of [...keys, "slides", "items"]) {
    const v = p[k];
    if (Array.isArray(v) && v.length) {
      return v.map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : { content: x }));
    }
  }
  return [];
}

/**
 * A ROW OF STARS, filled to a value out of five.
 *
 * Text stars rather than an icon font: the canvas, a landing page and a mailbox
 * all draw them the same, and nothing has to load. The unfilled stars are drawn
 * too, because "four stars" only means something beside the one it is out of.
 */
export function starRow(rating: unknown, colour: string): string {
  const n = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  if (!n) return "";
  return `<span class="bx-stars" role="img" aria-label="${n} out of 5"`
    + ` style="color:${esc(colour)};letter-spacing:2px">${"★".repeat(n)}`
    + `<span style="color:#CBD5E1">${"★".repeat(5 - n)}</span></span>`;
}

/** What the author is told when a slider has no slides yet. */
export function emptyStrip(ctx: RenderContext, sentence: string): string {
  return ctx.mode === "edit" ? `<div class="bx-imgdrop">${esc(sentence)}</div>` : "";
}

export interface StripOptions {
  /** How many slides are side by side on a desktop. Elementor's own control. */
  perView: number;
  /** The gap between them, in pixels — Elementor's `space_between`. */
  gap: number;
  /** A class of our own on the strip, so the family's CSS can find it. */
  cls: string;
}

/**
 * THE STRIP. Slides side by side, scrollable, snapping, no script.
 *
 * `flex` is deliberate and it is why this never goes in an email: the mailbox
 * renderer refuses flex by name and draws its slides stacked in a table
 * instead, which is the honest shape for a carousel nobody can swipe.
 */
export function strip(slides: string[], o: StripOptions): string {
  const per = Math.max(1, o.perView);
  const gap = Math.max(0, o.gap);
  const basis = per === 1 ? "100%" : `calc((100% - ${gap * (per - 1)}px) / ${per})`;
  const cells = slides.map((s) => `<div class="bx-slide" style="flex:0 0 ${basis};min-width:0;scroll-snap-align:start">${s}</div>`).join("");
  return `<div class="${esc(o.cls)}" style="display:flex;gap:${gap}px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:4px">${cells}</div>`;
}

/** One picture inside a slide, or the drop hint while editing. */
export function slidePicture(src: unknown, alt: unknown, ctx: RenderContext, radius = 8): string {
  const url = str(src);
  if (!url) {
    return ctx.mode === "edit"
      ? `<div class="bx-imgdrop" style="min-height:96px">Choose a picture in the panel on the right.</div>`
      : "";
  }
  return `<img src="${esc(url)}" alt="${esc(str(alt))}" loading="lazy" `
    + `style="width:100%;height:auto;display:block;border-radius:${radius}px"/>`;
}
