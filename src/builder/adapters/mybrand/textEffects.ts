/**
 * builder/adapters/mybrand/textEffects.ts — Canva's text effects, as pure geometry.
 *
 * BUILDER_MYBRAND_VS_CANVA_2026-09-19 gap G-04. Canva's Effects panel is the
 * single biggest "I cannot make that" in the ten reference designs: six of the
 * ten lean on an effect the studio did not have.
 *
 * ── WHY IT IS ITS OWN FILE, AND PURE ──────────────────────────────────────
 * An effect has to be painted THREE times and look the same each time:
 *
 *   1. the Fabric canvas in the editor      (fabricBridge.ts)
 *   2. LUMEN's SVG exporter                 (LUMEN-API templateStudio.js)
 *   3. anything that draws a preview        (templates, the gallery)
 *
 * If each of those three owns its own idea of "how far back does Echo sit",
 * they drift, and the drift is invisible until a business downloads a flyer
 * that does not match the screen. So the OFFSETS AND COLOURS ARE DATA here,
 * one function per question, and every painter asks this file. The file runs
 * under `node --test` — it imports nothing.
 *
 * ── CURVE IS GLYPH BY GLYPH, AND THAT IS NOT A STYLE CHOICE ───────────────
 * The obvious SVG for curved type is one <text> on a <textPath>. librsvg — the
 * rasteriser inside sharp, and therefore inside LUMEN's real exporter — DOES
 * NOT RENDER <textPath> AT ALL: it draws the arc and silently drops the words,
 * no warning and no error. Measured on rsvg 2.61.2 / sharp 0.34.5, 2026-09-19
 * (reference-designs/SPECS.md records the run). So `curvedGlyphs` places each
 * character on the circle itself and rotates it to the tangent, which librsvg
 * does render, and both painters walk the same list.
 *
 * `bulge` is how far the middle of the line bows away from the baseline — the
 * control a person actually wants — and the radius is derived from it. A
 * positive bulge is a rainbow, a negative one is a bowl.
 */

/* ══════════════════════════════════════════════════════════════════════════
   Case
   ══════════════════════════════════════════════════════════════════════════ */

export type TextCase = "none" | "upper" | "lower" | "title";

/**
 * Canva's Aa toggle. It is a DISPLAY transform, never a rewrite of what was
 * typed: the layer keeps the author's own words, so turning the toggle off
 * gives them back exactly as they were. Every painter calls this before it
 * measures or draws anything.
 */
export function applyCase(text: string, which: TextCase | undefined): string {
  const s = String(text ?? "");
  if (which === "upper") return s.toLocaleUpperCase();
  if (which === "lower") return s.toLocaleLowerCase();
  if (which === "title") {
    return s.replace(/\p{L}[\p{L}\p{M}'’]*/gu, (w) => w[0].toLocaleUpperCase() + w.slice(1).toLocaleLowerCase());
  }
  return s;
}

/* ══════════════════════════════════════════════════════════════════════════
   The effect list
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * `shadow` is a separate boolean on the layer and stays one — it predates this
 * file and is stored on hundreds of saved designs. Everything else is the
 * layer's `effect`.
 */
export type TextEffect = "lift" | "hollow" | "echo" | "splice" | "neon";

export const TEXT_EFFECTS: Array<{ value: TextEffect | "none" | "shadow" | "outline"; label: string; hint: string }> = [
  { value: "none",    label: "No effect", hint: "Plain words" },
  { value: "shadow",  label: "Shadow",    hint: "A hard shadow just behind the words — Canva calls this Drop" },
  { value: "lift",    label: "Lift",      hint: "A soft blurred shadow, so the words float off a photo" },
  { value: "outline", label: "Outline",   hint: "A band of colour around every letter" },
  { value: "hollow",  label: "Hollow",    hint: "The outline only — see-through letters" },
  { value: "echo",    label: "Echo",      hint: "Two fading copies offset behind, like a print that slipped" },
  { value: "splice",  label: "Splice",    hint: "See-through letters with a solid copy shifted behind them" },
  { value: "neon",    label: "Neon",      hint: "A glow around the words, like a bar sign" },
];

/** One painted copy of the words, BEHIND the main run. */
export interface EffectPass {
  /** Offset from the main run, in canvas pixels. */
  dx: number;
  dy: number;
  fill: string;
  opacity: number;
  /** Gaussian blur radius in canvas pixels; 0 = hard edged. */
  blur: number;
}

/** How the main run itself is painted. */
export interface MainPaint {
  fill: string;
  stroke: string | null;
  strokeWidth: number;
}

export interface EffectInput {
  effect?: TextEffect | null;
  /** The separate Drop-shadow boolean that predates the effect list. */
  shadow?: boolean;
  /** The outline colour field that predates the effect list; null/none = off. */
  outline?: string | null;
  size: number;
  colour: string;
  /** Echo/Splice/Neon's second colour. Falls back to the text colour. */
  effectColour?: string | null;
}

const num = (v: unknown, fallback: number) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

/**
 * Every copy painted behind the words, back to front.
 *
 * The numbers are proportions of the font size, never fixed pixels: an effect
 * on a 24px caption and the same effect on a 160px display line have to read
 * as the same effect, and Smart Resize scales the size without touching this.
 */
export function effectPasses(input: EffectInput): EffectPass[] {
  const size = Math.max(1, num(input.size, 24));
  const colour = input.colour || "#111827";
  const second = input.effectColour && input.effectColour !== "none" ? input.effectColour : colour;
  const passes: EffectPass[] = [];

  if (input.effect === "echo") {
    // Back copy first, so the nearer one paints over it.
    passes.push({ dx: size * 0.13, dy: size * 0.13, fill: second, opacity: 0.25, blur: 0 });
    passes.push({ dx: size * 0.065, dy: size * 0.065, fill: second, opacity: 0.45, blur: 0 });
    return passes;
  }
  if (input.effect === "splice") {
    passes.push({ dx: size * 0.06, dy: size * 0.06, fill: second, opacity: 1, blur: 0 });
    return passes;
  }
  if (input.effect === "neon") {
    passes.push({ dx: 0, dy: 0, fill: second, opacity: 0.55, blur: size * 0.34 });
    passes.push({ dx: 0, dy: 0, fill: second, opacity: 0.85, blur: size * 0.14 });
    return passes;
  }
  if (input.effect === "lift") {
    passes.push({ dx: 0, dy: Math.max(1, Math.round(size * 0.06)), fill: "rgba(0,0,0,0.45)", opacity: 1, blur: Math.max(1.5, size * 0.06) });
    return passes;
  }
  if (input.shadow) {
    const off = Math.max(1, Math.round(size * 0.045));
    passes.push({ dx: off, dy: off, fill: "rgba(0,0,0,0.35)", opacity: 1, blur: 0 });
  }
  return passes;
}

/**
 * How the words themselves are painted. Hollow and Splice are the two that
 * make the run see-through; everything else fills it.
 */
export function mainPaint(input: EffectInput): MainPaint {
  const size = Math.max(1, num(input.size, 24));
  const colour = input.colour || "#111827";
  if (input.effect === "hollow") {
    return { fill: "none", stroke: colour, strokeWidth: Math.max(1, Math.round(size * 0.05)) };
  }
  if (input.effect === "splice") {
    return { fill: "none", stroke: colour, strokeWidth: Math.max(1, Math.round(size * 0.045)) };
  }
  const outline = input.outline && input.outline !== "none" ? input.outline : null;
  if (outline) {
    return { fill: colour, stroke: outline, strokeWidth: Math.max(1, Math.round(size * 0.08)) };
  }
  return { fill: colour, stroke: null, strokeWidth: 0 };
}

/* ══════════════════════════════════════════════════════════════════════════
   Curve
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Per-character advance as a fraction of the em, for the handful of glyphs a
 * flat average gets badly wrong. Without it "MINIMUM" bunches at one end of
 * the arc and "llll" leaves a hole. The same table is in LUMEN's emitter and in
 * reference-designs/_render.mjs; it is a measurement, not a preference.
 */
export const GLYPH_EM: Record<string, number> = {
  I: 0.3, i: 0.28, l: 0.28, j: 0.3, ".": 0.28, ",": 0.28, "'": 0.24, " ": 0.32,
  M: 0.9, W: 0.92, m: 0.88, w: 0.8, r: 0.42, t: 0.4, f: 0.38,
};

export interface CurveInput {
  text: string;
  /** Centre of the arc's chord, in canvas pixels. */
  cx: number;
  /** Baseline of the middle glyph, in canvas pixels. */
  y: number;
  /** How wide the line is allowed to be — the layer's own width. */
  span: number;
  /** How far the middle bows away from the baseline. Positive = rainbow. */
  bulge: number;
  size: number;
  letterSpacing?: number;
  /** Condensed faces (Bebas Neue, Oswald) advance far less per glyph. */
  narrow?: boolean;
}

export interface PlacedGlyph {
  ch: string;
  x: number;
  y: number;
  /** Degrees, for an SVG rotate() about (x, y). */
  deg: number;
}

/** True when a bulge is big enough to be worth drawing as an arc at all. */
export function isCurved(bulge: number | undefined | null): boolean {
  return Number.isFinite(Number(bulge)) && Math.abs(Number(bulge)) >= 1;
}

/**
 * Where every character lands on the arc.
 *
 * Spaces are placed and then skipped by the painter rather than dropped here —
 * a dropped space would close the gap and change the word.
 */
export function curvedGlyphs(input: CurveInput): PlacedGlyph[] {
  const size = Math.max(1, num(input.size, 24));
  const bulge = num(input.bulge, 0);
  if (!isCurved(bulge)) return [];
  const up = bulge > 0;
  const b = Math.abs(bulge);
  const half = Math.max(1, num(input.span, size * 4)) / 2;
  // The circle through the chord's two ends and its bowed middle.
  const r = (half * half + b * b) / (2 * b);
  const chars = [...String(input.text ?? "")];
  if (!chars.length) return [];
  const narrow = input.narrow === true;
  const base = narrow ? 0.44 : 0.58;
  const ls = num(input.letterSpacing, 0);
  const widths = chars.map((c) => (GLYPH_EM[c] ?? base) * size * (narrow ? 0.85 : 1) + ls);
  const total = widths.reduce((a, w) => a + w, 0);
  const cyc = up ? input.y + r : input.y - r;
  let run = -total / 2;
  const out: PlacedGlyph[] = [];
  for (let i = 0; i < chars.length; i++) {
    const mid = run + widths[i] / 2;
    run += widths[i];
    const th = mid / r;
    const deg = (th * 180) / Math.PI;
    const px = input.cx + r * Math.sin(th);
    const py = up ? cyc - r * Math.cos(th) : cyc + r * Math.cos(th);
    out.push({ ch: chars[i], x: px, y: py, deg: up ? deg : -deg });
  }
  return out;
}

/** How many degrees of arc the whole line takes up — shown beside the slider. */
export function curveSpreadDegrees(input: CurveInput): number {
  const glyphs = curvedGlyphs(input);
  if (glyphs.length < 2) return 0;
  return Math.abs(glyphs[glyphs.length - 1].deg - glyphs[0].deg);
}

/** Faces that advance far less per glyph than the average. */
export function isNarrowFamily(font: string | undefined | null): boolean {
  const f = String(font || "").toLowerCase();
  return f.includes("bebas") || f.includes("oswald") || f.includes("narrow") || f.includes("condensed");
}

const XML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
export function escapeXml(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);
}

export interface CurvedSvgInput extends CurveInput {
  font: string;
  weight: string;
  italic?: boolean;
  /** Width and height of the SVG box the glyphs are drawn into. */
  boxW: number;
  boxH: number;
  effectInput: EffectInput;
}

/**
 * The whole curved line as one SVG document — what the editor paints as an
 * image layer and what the exporter writes straight into the page.
 *
 * Every effect pass is drawn as its own ring of glyphs, so a curved Neon badge
 * glows and a curved Echo doubles, instead of the effect quietly turning off
 * the moment somebody drags the bulge slider.
 */
export function curvedTextSvg(input: CurvedSvgInput): string {
  const glyphs = curvedGlyphs(input);
  if (!glyphs.length) return "";
  const paint = mainPaint(input.effectInput);
  const passes = effectPasses(input.effectInput);
  const fontAttrs =
    `font-family="${escapeXml(input.font)}" font-size="${input.size}" font-weight="${escapeXml(input.weight)}"` +
    (input.italic ? ` font-style="italic"` : "");
  const defs: string[] = [];
  const ring = (dx: number, dy: number, fill: string, stroke: string | null, strokeWidth: number, opacity: number, filter: string) =>
    glyphs
      .filter((g) => g.ch.trim() !== "")
      .map((g) => {
        const x = g.x + dx;
        const y = g.y + dy;
        return `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" ${fontAttrs} fill="${escapeXml(fill)}"` +
          (stroke ? ` stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}" stroke-linejoin="round" paint-order="stroke"` : "") +
          ` opacity="${opacity}"${filter} text-anchor="middle" transform="rotate(${g.deg.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)})">${escapeXml(g.ch)}</text>`;
      })
      .join("");

  const behind = passes
    .map((pass, i) => {
      let filter = "";
      if (pass.blur > 0) {
        const id = `cb${i}`;
        defs.push(`<filter id="${id}" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="${pass.blur.toFixed(2)}"/></filter>`);
        filter = ` filter="url(#${id})"`;
      }
      return ring(pass.dx, pass.dy, pass.fill, null, 0, pass.opacity, filter);
    })
    .join("");

  const main = ring(0, 0, paint.fill, paint.stroke, paint.strokeWidth, 1, "");
  const defsXml = defs.length ? `<defs>${defs.join("")}</defs>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(1, Math.round(input.boxW))}" height="${Math.max(1, Math.round(input.boxH))}" ` +
    `viewBox="0 0 ${Math.max(1, Math.round(input.boxW))} ${Math.max(1, Math.round(input.boxH))}">${defsXml}${behind}${main}</svg>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   Straight text that Fabric cannot paint
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Soft-wrap to the layer width.
 *
 * Lifted from LUMEN's `emitTextLayer` so the editor's SVG text and the
 * exporter's break in the SAME place — the heuristic is weight- and case-aware
 * because bold all-caps display type runs about 0.66 em per glyph against
 * about 0.5 em for body copy, and a wrap point that differs by one word is a
 * headline that reads as two lines on screen and three in the download.
 */
export function wrapLines(content: string, width: number, size: number, weight: string | undefined): string[] {
  const text = String(content ?? "");
  const isBold = Number(weight) >= 600 || weight === "bold";
  const letters = text.replace(/[^a-zA-Z]/g, "");
  const isCaps = letters.length > 0 && letters === letters.toUpperCase();
  const glyphEm = 0.5 + (isBold ? 0.1 : 0) + (isCaps ? 0.06 : 0);
  const maxChars = Math.max(4, Math.floor(width / (Math.max(1, size) * glyphEm)));
  return text.split(/\r?\n/).flatMap((para) => {
    if (para.length <= maxChars) return [para];
    const words = para.split(/\s+/);
    const out: string[] = [];
    let cur = "";
    for (const word of words) {
      if (!cur.length) cur = word;
      else if ((cur + " " + word).length <= maxChars) cur += " " + word;
      else { out.push(cur); cur = word; }
    }
    if (cur.length) out.push(cur);
    return out.length ? out : [para];
  });
}

export interface StraightSvgInput {
  lines: string[];
  /** Where the runs anchor, relative to the SVG box. */
  anchorX: number;
  firstBaselineY: number;
  align: "start" | "middle" | "end";
  size: number;
  lineHeight: number;
  letterSpacing: number;
  font: string;
  weight: string;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  boxW: number;
  boxH: number;
  effectInput: EffectInput;
}

/**
 * A straight run of words with every effect pass, as one SVG document.
 *
 * Only reached for Echo, Splice and Neon — the three Canva effects that need
 * MORE THAN ONE painted copy, and Fabric gives an object exactly one shadow.
 * Everything Fabric can paint on its own (plain, Drop, Lift, Outline, Hollow)
 * stays a real editable Textbox, because turning a caption into a picture to
 * win an effect nobody asked for would cost inline editing.
 */
export function straightTextSvg(input: StraightSvgInput): string {
  const paint = mainPaint(input.effectInput);
  const passes = effectPasses(input.effectInput);
  const decoration = [input.underline ? "underline" : "", input.strike ? "line-through" : ""].filter(Boolean).join(" ");
  const fontAttrs =
    `font-family="${escapeXml(input.font)}" font-size="${input.size}" font-weight="${escapeXml(input.weight)}"` +
    (input.italic ? ` font-style="italic"` : "") +
    (decoration ? ` text-decoration="${decoration}"` : "") +
    (input.letterSpacing ? ` letter-spacing="${input.letterSpacing}"` : "");
  const defs: string[] = [];
  const run = (dx: number, dy: number, fill: string, stroke: string | null, strokeWidth: number, opacity: number, filter: string) => {
    const spans = input.lines
      .map((line, i) => `<tspan x="${(input.anchorX + dx).toFixed(2)}" dy="${i === 0 ? 0 : (input.size * input.lineHeight).toFixed(2)}">${escapeXml(line)}</tspan>`)
      .join("");
    return `<text x="${(input.anchorX + dx).toFixed(2)}" y="${(input.firstBaselineY + dy).toFixed(2)}" ${fontAttrs} text-anchor="${input.align}" ` +
      `fill="${escapeXml(fill)}"` +
      (stroke ? ` stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}" stroke-linejoin="round" paint-order="stroke"` : "") +
      ` opacity="${opacity}"${filter}>${spans}</text>`;
  };
  const behind = passes
    .map((pass, i) => {
      let filter = "";
      if (pass.blur > 0) {
        const id = `sb${i}`;
        defs.push(`<filter id="${id}" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="${pass.blur.toFixed(2)}"/></filter>`);
        filter = ` filter="url(#${id})"`;
      }
      return run(pass.dx, pass.dy, pass.fill, null, 0, pass.opacity, filter);
    })
    .join("");
  const main = run(0, 0, paint.fill, paint.stroke, paint.strokeWidth, 1, "");
  const defsXml = defs.length ? `<defs>${defs.join("")}</defs>` : "";
  const w = Math.max(1, Math.round(input.boxW));
  const h = Math.max(1, Math.round(input.boxH));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defsXml}${behind}${main}</svg>`;
}

/**
 * The one question every painter asks first: can Fabric draw this text layer
 * itself, or does it have to become the exporter's own SVG?
 *
 * ONE predicate, so the editor and the export can never disagree about which
 * path a layer took.
 */
export function needsSvgText(layer: { effect?: string | null; curve?: number | null }): boolean {
  if (isCurved(layer.curve)) return true;
  return layer.effect === "echo" || layer.effect === "splice" || layer.effect === "neon";
}

/* ══════════════════════════════════════════════════════════════════════════
   Dashes
   ══════════════════════════════════════════════════════════════════════════ */

export type StrokeStyle = "solid" | "dashed" | "dotted";

/**
 * The SVG `stroke-dasharray` for a stroke style, as an array of canvas pixels.
 * An empty array means a solid line.
 *
 * Both reference designs 9 and 10 need this: a dashed ring around a circle
 * frame, and three dotted fill-in rules on a gift certificate.
 */
export function dashArray(style: StrokeStyle | undefined | null, strokeWidth: number): number[] {
  const w = Math.max(1, num(strokeWidth, 1));
  if (style === "dashed") return [w * 3, w * 2];
  // A ZERO-length dash under a round cap is what draws a round dot. It only
  // works with the cap — square-capped, a zero dash paints nothing at all,
  // which is a dotted rule that silently disappears. The two are one answer,
  // so they are returned by two functions nobody can call one of.
  if (style === "dotted") return [0, w * 2];
  return [];
}

/** The line cap a stroke style needs. Always set beside `dashArray`. */
export function dashLineCap(style: StrokeStyle | undefined | null): "butt" | "round" {
  return style === "dotted" ? "round" : "butt";
}
