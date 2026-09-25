/**
 * builder/adapters/mybrand/fontEmbed.ts — the bundled faces, as bytes.
 *
 * ── THE DEFECT THIS FILE EXISTS FOR (parity round 1, D-2) ─────────────────
 * Echo, Splice, Neon and Curve cannot be a Fabric text object — three of them
 * need more painted copies than an object has one shadow for, and Curve needs
 * every glyph placed and turned on an arc. So the studio paints those four as
 * an SVG and loads it through `<img>`.
 *
 * AN SVG LOADED THROUGH `<img>` IS A SEALED DOCUMENT. It cannot see the page's
 * stylesheets, it cannot see a webfont the page has already downloaded, and it
 * is forbidden from fetching one of its own. So `font-family="Bebas Neue,
 * Impact, sans-serif"` found no Bebas — the page had it, the picture could not
 * reach it — no Impact either on most machines, and fell through to a system
 * serif. Round 1's proof is one picture: HARBOURLIGHT, a plain Textbox, in
 * correct Bebas; AUTUMN MARKET, the same face with Echo, in a serif.
 *
 * The ONE thing such a document can carry is a font it embeds itself. This
 * file turns a family name into the `@font-face` block that does that, from
 * the very `@fontsource` files the page's own CSS loads, so the picture and
 * the page are the same bytes rather than two things that look similar.
 *
 * ── WHY IT IS ASYNC, AND WHAT HAPPENS BEFORE IT RESOLVES ──────────────────
 * The bytes arrive over `fetch`. Nothing waits for them: the first paint of a
 * curved line uses whatever is cached (nothing, on the first ever curve), and
 * the painter repaints once the promise lands. A face that never arrives
 * leaves the old fallback behaviour exactly as it was — the words are still
 * drawn, in a substitute face — because losing the words would be far worse
 * than losing the face.
 *
 * ── WHY NOT THE SERVER'S TTFs ─────────────────────────────────────────────
 * LUMEN rasterises with librsvg, which finds `assets/fonts/*.ttf` by family
 * name through its own `fonts.conf` and always has; the export never had this
 * defect. These are the same six families as woff2, which is a third of the
 * size over the wire and is what the browser already downloaded.
 */

/*
 * One `?url` import per bundled face. Vite turns each into a hashed asset URL
 * at build time, so these are real files in the deployed bundle, not a guess
 * at a path — a missing file is a BUILD failure here rather than a silent
 * fallback in front of a customer.
 *
 * Latin only. The latin-ext subsets exist in @fontsource too, and they are not
 * loaded: they roughly double the bytes to serve accents that a curved display
 * line almost never carries, and a glyph missing from the subset still draws —
 * the browser falls back for that one character.
 */
import poppins400 from "@fontsource/poppins/files/poppins-latin-400-normal.woff2?url";
import poppins600 from "@fontsource/poppins/files/poppins-latin-600-normal.woff2?url";
import poppins700 from "@fontsource/poppins/files/poppins-latin-700-normal.woff2?url";
import montserrat400 from "@fontsource/montserrat/files/montserrat-latin-400-normal.woff2?url";
import montserrat700 from "@fontsource/montserrat/files/montserrat-latin-700-normal.woff2?url";
import playfair400 from "@fontsource/playfair-display/files/playfair-display-latin-400-normal.woff2?url";
import playfair700 from "@fontsource/playfair-display/files/playfair-display-latin-700-normal.woff2?url";
import bebas400 from "@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff2?url";
import lora400 from "@fontsource/lora/files/lora-latin-400-normal.woff2?url";
import lora700 from "@fontsource/lora/files/lora-latin-700-normal.woff2?url";
import oswald400 from "@fontsource/oswald/files/oswald-latin-400-normal.woff2?url";
import oswald700 from "@fontsource/oswald/files/oswald-latin-700-normal.woff2?url";

import { fontFaceStyle } from "./textEffects";

/**
 * Family → the weights we carry a file for.
 *
 * Bebas Neue is drawn once because it HAS one weight: it is a display face
 * with no bold cut, and asking for 700 gets the same outlines. Saying so here
 * is why nothing downstream has to special-case it.
 */
const FILES: Record<string, Record<number, string>> = {
  "Poppins":          { 400: poppins400, 600: poppins600, 700: poppins700 },
  "Montserrat":       { 400: montserrat400, 700: montserrat700 },
  "Playfair Display": { 400: playfair400, 700: playfair700 },
  "Bebas Neue":       { 400: bebas400 },
  "Lora":             { 400: lora400, 700: lora700 },
  "Oswald":           { 400: oswald400, 700: oswald700 },
};

/** The weight file to use for a requested weight: the closest one we carry. */
export function nearestWeightFile(family: string, weight: number): { weight: number; url: string } | null {
  const have = FILES[family];
  if (!have) return null;
  const weights = Object.keys(have).map(Number).sort((a, b) => a - b);
  if (!weights.length) return null;
  let best = weights[0];
  for (const w of weights) {
    if (Math.abs(w - weight) < Math.abs(best - weight)) best = w;
  }
  return { weight: best, url: have[best] };
}

/** True when a curved or echoed line in this family can show its real face. */
export function isEmbeddable(family: string): boolean {
  return Object.prototype.hasOwnProperty.call(FILES, family);
}

/** Every family this file can embed, for the suite and for the inspector's hint. */
export function embeddableFamilies(): string[] {
  return Object.keys(FILES);
}

/** family|weight → the finished `@font-face` block, or "" while it is loading. */
const CACHE = new Map<string, string>();
const INFLIGHT = new Map<string, Promise<string>>();

function keyOf(family: string, weight: number): string {
  return `${family}|${weight}`;
}

/**
 * The `@font-face` block for a family, IF it is already in hand.
 *
 * Synchronous on purpose: `layerToFabricObject` has to return an object in the
 * same tick, and the second paint (after `loadFontFace` resolves) is what puts
 * the real face on screen.
 */
export function cachedFontFace(family: string, weight: number): string {
  const near = nearestWeightFile(family, weight);
  if (!near) return "";
  return CACHE.get(keyOf(family, near.weight)) || "";
}

/**
 * Fetch a face and wrap it as `@font-face`. Resolves to "" for a family we do
 * not carry and for a fetch that fails — never rejects, because a font that
 * will not load is not a reason to stop drawing the words.
 */
export function loadFontFace(family: string, weight: number): Promise<string> {
  const near = nearestWeightFile(family, weight);
  if (!near) return Promise.resolve("");
  const key = keyOf(family, near.weight);
  const hit = CACHE.get(key);
  if (hit !== undefined) return Promise.resolve(hit);
  const flying = INFLIGHT.get(key);
  if (flying) return flying;
  const job = fetch(near.url)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
    .then((buf) => {
      const css = fontFaceStyle(family, `data:font/woff2;base64,${base64(buf)}`, String(near.weight));
      CACHE.set(key, css);
      return css;
    })
    .catch(() => {
      // Cache the failure too. Retrying on every repaint of every curved line
      // would be a request storm behind a network the author cannot fix.
      CACHE.set(key, "");
      return "";
    })
    .finally(() => { INFLIGHT.delete(key); });
  INFLIGHT.set(key, job);
  return job;
}

/**
 * ArrayBuffer → base64, in chunks.
 *
 * `String.fromCharCode(...bytes)` on a whole 30 KB font is a call with 30,000
 * arguments, which throws RangeError in every engine at some size. 8 KB at a
 * time is well under every limit and still two calls for a typical face.
 */
function base64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x2000;
  let s = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

/** Only the suite uses this — a cache that survives between tests is a lie. */
export function _resetFontCache(): void {
  CACHE.clear();
  INFLIGHT.clear();
}
