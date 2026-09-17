/**
 * builder/pictures.ts — the little SVG diagrams a widget card shows.
 *
 * Lifted OUT of registry.ts (D-156, stream B) for one reason: a widget now
 * declares itself in its own module under `widgets/`, registry.ts collects
 * those declarations, and a widget module that reached back into registry.ts
 * for `pictureFrom` would make the two files import each other. One tiny
 * module both sides depend on is the way round that, and it keeps the picture
 * helpers where anybody drawing a new widget can find them.
 *
 * `registry.ts` re-exports `pictureFrom`, so every existing caller is
 * unchanged.
 *
 * Inline data URIs rather than files so the pane has no network dependency and
 * a widget cannot ship without its picture. `currentColor` is deliberately NOT
 * used: the picture is a diagram of a layout, drawn in slate on transparent, so
 * it reads the same on every pane background and never competes with the
 * business's own brand colours sitting next to it in the same panel.
 */

/** Build a picture from a compact SVG body. */
export function pictureFrom(body: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 40" fill="none" ` +
    `stroke="#64748B" stroke-width="2" stroke-linecap="round">${body}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** A filled bar — a run of text. */
export const bar = (x: number, y: number, w: number, h = 4) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="#CBD5E1" stroke="none"/>`;

/** An outlined box — a container, a card, a table. */
export const box = (x: number, y: number, w: number, h: number) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="none"/>`;

/** A solid block — a picture, a colour field. */
export const solid = (x: number, y: number, w: number, h: number) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="#94A3B8" stroke="none"/>`;
