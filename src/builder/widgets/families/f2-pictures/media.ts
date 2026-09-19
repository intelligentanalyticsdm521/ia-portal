/**
 * families/f2-pictures/media.ts — THE PIECES EVERY PICTURE WIDGET SHARES.
 *
 * BUILDER_FULL_WIDGET_PLAN_2026-09-19 §C.2, F2: *"All share the media picker,
 * the image-size select and the lightbox."* So they share ONE module — one way
 * to read a stored picture, one way to draw a missing one, one image-resolution
 * select with Elementor's own options. Five widgets each carrying their own
 * copy is five places a picture can be read differently, and the one that reads
 * it wrong shows an empty box on a live page.
 *
 * Nothing in here knows a widget's name, and nothing outside this family
 * imports it.
 */
import { esc } from "../../../render";

/** Anything → a string, with null and undefined as "". */
export const str = (v: unknown): string => (v == null ? "" : String(v));

/** Anything → an array, so a renderer never maps over undefined. */
export const rows = (v: unknown): any[] => (Array.isArray(v) ? v : []);

/**
 * THE ONE WAY A STORED PICTURE IS READ.
 *
 * A picture reaches us in three spellings and all three are already on disk:
 * the Portal's own `"https://…"` string, Elementor's `{ url, id }` media object,
 * and the older `{ src }` the first proposal builder wrote. One reader, so a
 * gallery and a hotspot cannot disagree about what an author chose.
 */
export function mediaUrl(v: unknown): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  const o = v as { url?: unknown; src?: unknown };
  return str(o.url || o.src);
}

/** Every picture of a list control, in order, with the empty rows dropped. */
export function pictureList(v: unknown): string[] {
  return rows(v).map(mediaUrl).filter(Boolean);
}

/**
 * WHAT AN EMPTY WIDGET SAYS.
 *
 * In the editor, one plain sentence telling the author what to do next —
 * `bx-imgdrop` is the canvas's own "nothing here yet" box. On the published
 * page, nothing at all: a half-filled widget must never print a hint to a
 * customer. Same rule every D-165 widget already follows.
 */
export function emptyDrop(mode: string, sentence: string): string {
  return mode === "edit" ? `<div class="bx-imgdrop">${esc(sentence)}</div>` : "";
}

/**
 * Elementor's own Image Resolution list, by its own values and words.
 * `BUILDER_WIDGET_CATALOG_2026-09-17.pro.json`, widget `hotspot`, `image_size`.
 */
export const IMAGE_SIZE_OPTIONS = [
  { value: "thumbnail", label: "Thumbnail" },
  { value: "medium", label: "Medium" },
  { value: "medium_large", label: "Medium Large" },
  { value: "large", label: "Large" },
  { value: "full", label: "Full" },
] as const;

/** A number control's value, clamped, with a fallback when it is blank. */
export function count(v: unknown, fallback: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

/** Elementor's switcher stores "yes"; a checkbox stores true. Read both. */
export function isOn(v: unknown): boolean {
  return v === true || v === "yes";
}

/** One `<img>`, escaped, with the shape a picture widget always wants. */
export function img(src: string, alt: string, style: string): string {
  return `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" style="${style}"/>`;
}
