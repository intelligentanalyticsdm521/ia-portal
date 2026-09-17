/**
 * builder/adapters/mybrand/templates.ts — the pre-made designs. NEVER a blank square.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §7, the template principle, applied to My
 * Brand: "open with pre-made templates, never a blank page … templates are
 * guidelines: open one, adjust it, save as a new template."
 *
 * ── WHAT A TEMPLATE IS HERE ───────────────────────────────────────────────
 * A pure function of the BRAND. `build(brand)` returns a finished CanvasDoc
 * already carrying the business's name, their logo, their colours and their
 * two faces — so the first thing a business owner sees is their own poster
 * with the words wrong, not a white square with a blinking rail beside it.
 *
 * ── THE RULE, AND THE TEST THAT KEEPS IT ──────────────────────────────────
 * Every colour a template places comes from the kit passed in. There is no hex
 * literal anywhere below — not white for ink, not black for text — because
 * "white" is `colours.background` and "ink" is `colours.text`, and a business
 * that chose a cream background and a charcoal ink gets those instead.
 * test/mybrand-studio.test.mjs builds every template with a sentinel palette
 * and fails if a single colour comes out that the kit did not supply, which is
 * the mutation: drop one literal in and the suite goes red.
 *
 * Sizes are §5 step 5's list — Instagram post and story, Facebook post,
 * LinkedIn banner, business card, flyer, logo lockups — plus the one that
 * proves the guided count on this canvas: a tips post that asks how many.
 */
import { uid, type CanvasDoc, type ImageLayer, type Layer, type ShapeLayer, type TextLayer } from "./scene";
import type { StudioBrand } from "./insert";

export interface PremadeDesign {
  key: string;
  /** What a business owner calls it. */
  label: string;
  /** One line, in their words. */
  blurb: string;
  /** The group the gallery files it under. */
  group: "Social" | "Print" | "Brand marks";
  w: number;
  h: number;
  /** Logos and icons export with alpha. */
  transparent?: boolean;
  /** SD-010's guided question, where the design repeats something. */
  count?: { min: number; max: number; label: string; default: number };
  build: (brand: StudioBrand, count?: number) => CanvasDoc;
}

/* ── small builders, so each template reads as a layout and not as maths ─── */

function doc(w: number, h: number, background: string | null, layers: Layer[]): CanvasDoc {
  return { version: 1, width: w, height: h, background_color: background, layers };
}

function band(x: number, y: number, w: number, h: number, fill: string, radius = 0): ShapeLayer {
  return {
    id: uid("rect"), kind: "shape", shape: "rect",
    x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h),
    fill, stroke: "none", strokeWidth: 0, radius, visible: true,
  };
}

function rule(x: number, y: number, w: number, stroke: string, weight: number): ShapeLayer {
  return {
    id: uid("line"), kind: "shape", shape: "line",
    x: Math.round(x), y: Math.round(y), w: Math.round(w), h: 0,
    fill: "none", stroke, strokeWidth: Math.max(1, Math.round(weight)), visible: true,
  };
}

interface TextSpec {
  x: number; y: number; w: number;
  content: string; size: number;
  font: string; color: string;
  weight?: string;
  align?: "left" | "center" | "right";
  letterSpacing?: number;
  lineHeight?: number;
}

function text(t: TextSpec): TextLayer {
  return {
    id: uid("text"), kind: "text",
    x: Math.round(t.x), y: Math.round(t.y), w: Math.round(t.w),
    h: Math.round(t.size * (t.lineHeight ?? 1.3)),
    content: t.content, size: Math.round(t.size), font: t.font, color: t.color,
    weight: t.weight || "400", align: t.align || "left",
    lineHeight: t.lineHeight ?? 1.25,
    letterSpacing: t.letterSpacing, visible: true,
  };
}

/**
 * The business's logo, or a slot that says it is one (D-24).
 *
 * The id carries `logo` so the canvas can caption the empty slot "Your logo
 * goes here — add it under My Brand" rather than "Picture goes here", which is
 * the difference between a design a business owner knows how to finish and a
 * grey rectangle. `uid` keeps the rest of the id unique, so two logo layers on
 * one design are still two layers.
 */
function logo(brand: StudioBrand, x: number, y: number, w: number): ImageLayer {
  return {
    id: uid("logo"), kind: "image",
    x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(w * 0.4),
    src: brand.logoUrl, blob_ref: null, visible: true,
  };
}

function mark(brand: StudioBrand, x: number, y: number, side: number, icon = "seal"): ShapeLayer {
  return {
    id: uid("icon"), kind: "shape", shape: "icon", icon,
    x: Math.round(x), y: Math.round(y), w: Math.round(side), h: Math.round(side),
    fill: brand.colours.primary, stroke: "none", strokeWidth: 0, visible: true,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   The gallery
   ══════════════════════════════════════════════════════════════════════════ */

export const PREMADE_DESIGNS: PremadeDesign[] = [
  {
    key: "ig_post",
    label: "Instagram post",
    blurb: "A square announcement — your name, one headline, your colours.",
    group: "Social",
    w: 1080, h: 1080,
    build: (b) => doc(1080, 1080, b.colours.background, [
      band(0, 0, 1080, 360, b.colours.primary),
      logo(b, 80, 96, 320),
      text({ x: 80, y: 470, w: 920, content: "Say the one thing here", size: 96, font: b.fonts.heading, color: b.colours.text, weight: "700", lineHeight: 1.1 }),
      rule(80, 700, 260, b.colours.accent, 10),
      text({ x: 80, y: 760, w: 920, content: "A line of detail underneath — what it is, when it runs, who it is for.", size: 38, font: b.fonts.body, color: b.colours.text, lineHeight: 1.35 }),
      text({ x: 80, y: 950, w: 920, content: b.businessName, size: 34, font: b.fonts.heading, color: b.colours.secondary, weight: "600", letterSpacing: 3 }),
    ]),
  },
  {
    key: "ig_tips",
    label: "Instagram tips post",
    blurb: "A numbered list people save — three tips is the usual number.",
    group: "Social",
    w: 1080, h: 1080,
    count: { min: 2, max: 6, label: "How many tips?", default: 3 },
    build: (b, count) => {
      const n = Math.max(2, Math.min(6, count ?? 3));
      const top = 360;
      const slot = Math.floor((940 - top) / n);
      const rows: Layer[] = [];
      for (let i = 0; i < n; i++) {
        const y = top + i * slot;
        rows.push(band(80, y, 80, 80, b.colours.accent, 40));
        rows.push(text({ x: 80, y: y + 18, w: 80, content: String(i + 1), size: 44, font: b.fonts.heading, color: b.colours.background, weight: "700", align: "center" }));
        rows.push(text({ x: 196, y: y + 8, w: 804, content: `Tip ${i + 1} — say it in one line.`, size: 42, font: b.fonts.body, color: b.colours.text, lineHeight: 1.3 }));
      }
      return doc(1080, 1080, b.colours.background, [
        band(0, 0, 1080, 260, b.colours.primary),
        text({ x: 80, y: 90, w: 920, content: `${n} things worth knowing`, size: 64, font: b.fonts.heading, color: b.colours.background, weight: "700" }),
        ...rows,
        text({ x: 80, y: 970, w: 920, content: b.businessName, size: 32, font: b.fonts.heading, color: b.colours.secondary, weight: "600", letterSpacing: 3 }),
      ]);
    },
  },
  {
    key: "ig_story",
    label: "Instagram story",
    blurb: "Full-screen and vertical — the one people swipe through.",
    group: "Social",
    w: 1080, h: 1920,
    build: (b) => doc(1080, 1920, b.colours.background, [
      band(0, 0, 1080, 1180, b.colours.primary),
      logo(b, 80, 140, 300),
      text({ x: 80, y: 560, w: 920, content: "One big line", size: 128, font: b.fonts.heading, color: b.colours.background, weight: "700", lineHeight: 1.05 }),
      text({ x: 80, y: 880, w: 920, content: "And the detail under it.", size: 44, font: b.fonts.body, color: b.colours.background, lineHeight: 1.3 }),
      band(80, 1300, 560, 130, b.colours.accent, 65),
      text({ x: 80, y: 1338, w: 560, content: "BOOK TODAY", size: 44, font: b.fonts.heading, color: b.colours.background, weight: "700", align: "center", letterSpacing: 4 }),
      text({ x: 80, y: 1740, w: 920, content: b.businessName, size: 36, font: b.fonts.heading, color: b.colours.text, weight: "600", letterSpacing: 3 }),
    ]),
  },
  {
    key: "fb_post",
    label: "Facebook post",
    blurb: "The wide one — a picture on the left, your message on the right.",
    group: "Social",
    w: 1200, h: 630,
    build: (b) => doc(1200, 630, b.colours.background, [
      band(0, 0, 520, 630, b.colours.secondary),
      { id: uid("image"), kind: "image", x: 0, y: 0, w: 520, h: 630, src: null, blob_ref: null, visible: true } as ImageLayer,
      logo(b, 580, 60, 240),
      text({ x: 580, y: 210, w: 560, content: "Your headline here", size: 62, font: b.fonts.heading, color: b.colours.text, weight: "700", lineHeight: 1.1 }),
      rule(580, 350, 160, b.colours.accent, 8),
      text({ x: 580, y: 390, w: 560, content: "A sentence of detail, then what you want them to do.", size: 30, font: b.fonts.body, color: b.colours.text, lineHeight: 1.35 }),
      text({ x: 580, y: 540, w: 560, content: b.businessName, size: 26, font: b.fonts.heading, color: b.colours.secondary, weight: "600", letterSpacing: 2 }),
    ]),
  },
  {
    key: "li_banner",
    label: "LinkedIn banner",
    blurb: "The strip across the top of your profile.",
    group: "Social",
    w: 1584, h: 396,
    build: (b) => doc(1584, 396, b.colours.primary, [
      band(0, 0, 520, 396, b.colours.accent),
      logo(b, 80, 130, 300),
      text({ x: 620, y: 128, w: 880, content: b.businessName, size: 66, font: b.fonts.heading, color: b.colours.background, weight: "700" }),
      text({ x: 620, y: 226, w: 880, content: "What you do, in six words.", size: 34, font: b.fonts.body, color: b.colours.background, lineHeight: 1.3 }),
    ]),
  },
  {
    key: "business_card",
    label: "Business card",
    blurb: "Standard 3.5 × 2 — print-ready, both sides in your colours.",
    group: "Print",
    w: 1050, h: 600,
    build: (b) => doc(1050, 600, b.colours.background, [
      band(0, 0, 36, 600, b.colours.primary),
      logo(b, 90, 70, 300),
      text({ x: 90, y: 250, w: 640, content: "Your Name", size: 54, font: b.fonts.heading, color: b.colours.text, weight: "700" }),
      text({ x: 90, y: 320, w: 640, content: "What you do", size: 28, font: b.fonts.body, color: b.colours.secondary, letterSpacing: 3 }),
      rule(90, 390, 200, b.colours.accent, 6),
      text({ x: 90, y: 430, w: 640, content: "(000) 000-0000\nhello@yourbusiness.com", size: 26, font: b.fonts.body, color: b.colours.text, lineHeight: 1.5 }),
    ]),
  },
  {
    key: "flyer",
    label: "Flyer",
    blurb: "A full letter page you can print or post as a picture.",
    group: "Print",
    w: 1275, h: 1650,
    build: (b) => doc(1275, 1650, b.colours.background, [
      band(0, 0, 1275, 420, b.colours.primary),
      logo(b, 90, 110, 340),
      text({ x: 90, y: 500, w: 1095, content: "The offer, in a few words", size: 104, font: b.fonts.heading, color: b.colours.text, weight: "700", lineHeight: 1.08 }),
      rule(90, 740, 300, b.colours.accent, 12),
      { id: uid("image"), kind: "image", x: 90, y: 800, w: 1095, h: 480, src: null, blob_ref: null, visible: true } as ImageLayer,
      text({ x: 90, y: 1330, w: 1095, content: "What it is, who it is for, and when it runs. Two or three lines is plenty — the picture does the rest.", size: 36, font: b.fonts.body, color: b.colours.text, lineHeight: 1.4 }),
      band(90, 1490, 520, 120, b.colours.accent, 60),
      text({ x: 90, y: 1526, w: 520, content: "CALL TODAY", size: 40, font: b.fonts.heading, color: b.colours.background, weight: "700", align: "center", letterSpacing: 4 }),
      text({ x: 680, y: 1530, w: 505, content: b.businessName, size: 32, font: b.fonts.heading, color: b.colours.secondary, weight: "600", align: "right" }),
    ]),
  },
  {
    key: "logo_stacked",
    label: "Logo lockup — stacked",
    blurb: "Your mark over your name, on a see-through background.",
    group: "Brand marks",
    w: 1024, h: 1024,
    transparent: true,
    build: (b) => doc(1024, 1024, "transparent", [
      mark(b, 352, 220, 320),
      text({ x: 112, y: 610, w: 800, content: b.businessName, size: 84, font: b.fonts.heading, color: b.colours.primary, weight: "700", align: "center", lineHeight: 1.1 }),
      rule(412, 740, 200, b.colours.accent, 8),
      text({ x: 112, y: 780, w: 800, content: "What you do", size: 34, font: b.fonts.body, color: b.colours.secondary, align: "center", letterSpacing: 6 }),
    ]),
  },
  {
    key: "logo_wide",
    label: "Logo lockup — wide",
    blurb: "Your mark beside your name, for a header or a van door.",
    group: "Brand marks",
    w: 1600, h: 600,
    transparent: true,
    build: (b) => doc(1600, 600, "transparent", [
      mark(b, 120, 170, 260),
      text({ x: 440, y: 210, w: 1040, content: b.businessName, size: 92, font: b.fonts.heading, color: b.colours.primary, weight: "700", lineHeight: 1.05 }),
      text({ x: 440, y: 340, w: 1040, content: "What you do", size: 36, font: b.fonts.body, color: b.colours.secondary, letterSpacing: 6 }),
    ]),
  },
];

export const PREMADE_BY_KEY: Record<string, PremadeDesign> = Object.fromEntries(
  PREMADE_DESIGNS.map((d) => [d.key, d]),
);

export const PREMADE_GROUPS: Array<PremadeDesign["group"]> = ["Social", "Print", "Brand marks"];

/**
 * WHAT A DESIGN IS CALLED, in English (D-32).
 *
 * BUILDER_USER_TEST_2026-09-16: *"The library lists starter templates whose
 * type is printed as the raw enum 'Ig_post'."* The gallery printed the stored
 * `kind` with a CSS `capitalize`, which turns a developer token into a
 * capitalised developer token.
 *
 * The premade list already carries the right words — "Instagram post" is
 * `PREMADE_BY_KEY.ig_post.label` — so this reads them rather than keeping a
 * second table beside them. A kind nobody has a name for is spaced out and
 * capitalised properly (`fb_reel` → "Fb reel"), which is a guess, but never a
 * screenful of underscores.
 */
export function designKindLabel(kind: string | null | undefined): string {
  const key = String(kind || "").trim();
  if (!key) return "Design";
  const known = PREMADE_BY_KEY[key];
  if (known) return known.label;
  const words = key.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Design";
}

/** The gallery's own query: search matches the name AND the sentence. */
export function premadeFor(query = "", group: PremadeDesign["group"] | "all" = "all"): PremadeDesign[] {
  const q = query.trim().toLowerCase();
  return PREMADE_DESIGNS.filter(
    (d) =>
      (group === "all" || d.group === group) &&
      (!q || d.label.toLowerCase().includes(q) || d.blurb.toLowerCase().includes(q) || `${d.w}x${d.h}`.includes(q)),
  );
}

/**
 * Build one, by key. Returns null for a key that is not ours rather than
 * throwing — a stale link in somebody's tab must not take the studio down.
 */
export function buildPremade(key: string, brand: StudioBrand, count?: number): CanvasDoc | null {
  const d = PREMADE_BY_KEY[key];
  if (!d) return null;
  return d.build(brand, count);
}

/**
 * Every colour a scene actually places. Used by the suite to prove a template
 * seeded nothing of its own, and by nothing else.
 */
export function coloursUsed(scene: CanvasDoc): string[] {
  const out = new Set<string>();
  const take = (c: unknown) => {
    if (typeof c === "string" && c && c !== "none" && c !== "transparent") out.add(c.toUpperCase());
  };
  take(scene.background_color);
  if (scene.background_gradient) { take(scene.background_gradient.from); take(scene.background_gradient.to); }
  for (const l of scene.layers) {
    const any = l as unknown as Record<string, unknown>;
    take(any.fill); take(any.stroke); take(any.color); take(any.outline);
    const g = any.gradient as { from?: string; to?: string } | undefined;
    if (g) { take(g.from); take(g.to); }
    const colors = any.colors as string[] | undefined;
    if (Array.isArray(colors)) colors.forEach(take);
  }
  return [...out];
}
