/**
 * builder/adapters/mybrand/insert.ts — a registry widget becomes pixel layers.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §5 step 5. This is the whole of the My
 * Brand adapter's translation layer: the shared pane (WidgetPane over
 * registry.ts) hands over a widget DEFINITION and a guided count, and this
 * turns it into layers on a 1080×1080 square.
 *
 * ── WHY IT IS PURE ────────────────────────────────────────────────────────
 * Everything a business sees when they click a tool is decided here, so this
 * is where "the studio opens in your brand" is either true or a comment. A
 * pure function of (kind, count, canvas, brand) is a thing a test can assert
 * on; the old rail decided the same thing inline in eleven onClick handlers
 * with `brandPalette?.primary || FALLBACK.primary` in each.
 *
 * ── THE RULE THIS FILE KEEPS ──────────────────────────────────────────────
 * Every colour it places comes from the brand kit passed in. There is no hex
 * literal below for anything a business owns, and no import that could reach
 * the kit's writer: a design is a READER of the kit, always (§7 / §2 step 0 —
 * Brand Identity is the one writer, and a per-design override is an override,
 * never a second brand).
 */
/* B-168 / D-168 item 5b — the families' STUDIO half. One import, one call in
   the `default` branch below, and no family ever opens this file. */
import { insertFamilyWidget } from "../../widgets/families";
import {
  DEFAULT_FONTS, ICON_PATHS, TEXT_PRESETS, uid,
  type CanvasDoc, type ChartLayer, type ImageLayer, type Layer, type ShapeLayer, type TextLayer,
  type TextPresetKey,
} from "./scene";

/**
 * What the studio knows about the business. Assembled by the adapter from
 * `useBrandKit()` and the active business — never fetched here, so this module
 * stays pure and testable.
 */
export interface StudioBrand {
  colours: { primary: string; secondary: string; accent: string; text: string; background: string };
  /** CSS stacks, already resolved from the kit's font names. */
  fonts: { heading: string; body: string };
  logoUrl: string | null;
  businessName: string;
  /** Their website / booking link, for a QR code's default. */
  websiteUrl: string | null;
}

/** The five swatches, in the order the inspector shows them, with their names. */
export function brandSwatches(brand: StudioBrand): Array<{ colour: string; label: string }> {
  return [
    { colour: brand.colours.primary, label: "Your primary colour" },
    { colour: brand.colours.secondary, label: "Your secondary colour" },
    { colour: brand.colours.accent, label: "Your accent colour" },
    { colour: brand.colours.text, label: "Your text colour" },
    { colour: brand.colours.background, label: "Your background colour" },
  ];
}

export interface InsertResult {
  layers: Layer[];
  /** A background goes UNDER everything already on the canvas. */
  behind: boolean;
  /** Which of the new layers to select once it is placed. */
  selectId: string | null;
}

/** Extra the caller picked in a small dialog BEFORE inserting. */
export interface InsertOptions {
  /** How many, for a widget the pane asked about. */
  count?: number;
  /** An icon key (the icon picker), an image src (upload/library), a link (QR). */
  option?: string;
  /** A QR code arrives as a data: URI the caller already rendered. */
  imageSrc?: string;
  /** Media Library provenance, so Remove background stays available. */
  assetId?: string;
  blobRef?: string;
}

const EMPTY: InsertResult = { layers: [], behind: false, selectId: null };

/**
 * THE KINDS THIS ADAPTER PLACES ITSELF, by name, beside the switch that does it.
 *
 * The studio is not a renderer: a widget does not "draw" here, it becomes
 * absolute-positioned LAYERS out of `opts` — a count, an icon key, an uploaded
 * address — and not out of the widget's stored properties. So a kind in this
 * list needs nothing from the family that declares it, and a family writing a
 * second insert for one of them would be a second mechanism for a job already
 * done once.
 *
 * `families/familySurfaceGaps()` is the PRESENCE guard — a tile on the My Brand
 * panel that places nothing when it is pressed — and it reads this list so it
 * asks the real question instead of "did a family write one". Add a `case`
 * below, add its name here; `builder-override.test.mjs` §5b fails on a name
 * here with no case, so the two cannot drift apart quietly.
 */
export const STUDIO_OWN_KINDS: readonly string[] = Object.freeze([
  "heading", "paragraph", "list", "image", "brand_logo", "icon", "shape",
  "divider", "colour_block", "background", "button", "qr_code", "social_handle",
]);

/**
 * Turn one registry widget into layers.
 *
 * Returns an empty result for a kind this adapter does not offer, rather than
 * throwing: the pane can only show what `widgetsFor("brand")` returns, so an
 * unknown kind means the registry and this file drifted — which the suite
 * catches by name, without taking a live canvas down first.
 */
export function insertWidget(
  kind: string,
  doc: CanvasDoc,
  brand: StudioBrand,
  opts: InsertOptions = {},
): InsertResult {
  const W = doc.width;
  const H = doc.height;
  const cx = W / 2;
  const cy = H / 2;
  /** Presets are drawn for a 1080 square; scale so a heading is a heading on a card too. */
  const s = Math.max(0.3, Math.min(W, H) / 1080);
  const one = (layer: Layer, behind = false): InsertResult => ({ layers: [layer], behind, selectId: layer.id });
  const many = (layers: Layer[], behind = false): InsertResult =>
    ({ layers, behind, selectId: layers.length ? layers[layers.length - 1].id : null });

  switch (kind) {
    /* ── Text ────────────────────────────────────────────────────────── */
    case "heading":
      return one(textLayer("heading", doc, brand, brand.fonts.heading));
    case "paragraph":
      return one(textLayer("body", doc, brand, brand.fonts.body));
    case "list": {
      const n = clamp(opts.count ?? 3, 2, 8);
      const size = Math.round(34 * s);
      const gap = Math.round(size * 1.9);
      const w = Math.round(W * 0.7);
      const top = Math.round(cy - (n * gap) / 2);
      return many(Array.from({ length: n }, (_, i) => ({
        id: uid("text"), kind: "text",
        x: Math.round(cx - w / 2), y: top + i * gap, w, h: Math.round(size * 1.4),
        content: `• Point ${i + 1}`,
        font: brand.fonts.body, size, color: brand.colours.text,
        weight: "400", align: "left", lineHeight: 1.3, visible: true,
      } as TextLayer)));
    }

    /* ── Media ───────────────────────────────────────────────────────── */
    case "image": {
      const side = Math.round(Math.min(W, H) * 0.55);
      return one({
        id: uid("image"), kind: "image",
        x: Math.round(cx - side / 2), y: Math.round(cy - side / 2), w: side, h: side,
        src: opts.imageSrc || null,
        asset_id: opts.assetId || null,
        blob_ref: opts.blobRef || null,
        rotation: 0, visible: true,
      } as ImageLayer);
    }
    case "brand_logo": {
      // Wide by default: a logo is nearly always wider than it is tall, and a
      // square slot makes every logo look like it was dropped in by accident.
      const w = Math.round(Math.min(W * 0.55, 620 * s));
      const h = Math.round(w * 0.4);
      return one({
        id: uid("image"), kind: "image",
        x: Math.round(cx - w / 2), y: Math.round(H * 0.08), w, h,
        src: opts.imageSrc || brand.logoUrl || null,
        asset_id: opts.assetId || null,
        blob_ref: opts.blobRef || null,
        rotation: 0, visible: true,
      } as ImageLayer);
    }
    case "icon": {
      const key = opts.option && ICON_PATHS[opts.option] ? opts.option : "star";
      const side = Math.round(Math.min(W, H) * 0.18);
      return one({
        id: uid("icon"), kind: "shape", shape: "icon", icon: key,
        x: Math.round(cx - side / 2), y: Math.round(cy - side / 2), w: side, h: side,
        fill: brand.colours.primary, stroke: "none", strokeWidth: 0,
        rotation: 0, visible: true,
      } as ShapeLayer);
    }

    /* ── Layout ──────────────────────────────────────────────────────── */
    case "shape": {
      const shape = (opts.option === "ellipse" || opts.option === "line") ? opts.option : "rect";
      const side = Math.round(Math.min(W, H) * 0.25);
      return one({
        id: uid(shape), kind: "shape", shape,
        x: Math.round(cx - side / 2), y: Math.round(cy - side / 2),
        w: side, h: shape === "line" ? 0 : side,
        fill: shape === "line" ? "none" : brand.colours.secondary,
        stroke: shape === "line" ? brand.colours.primary : "none",
        strokeWidth: shape === "line" ? Math.max(2, Math.round(6 * s)) : 0,
        rotation: 0, visible: true,
      } as ShapeLayer);
    }
    case "divider": {
      const w = Math.round(W * 0.5);
      return one({
        id: uid("line"), kind: "shape", shape: "line",
        x: Math.round(cx - w / 2), y: Math.round(cy), w, h: 0,
        fill: "none", stroke: brand.colours.accent, strokeWidth: Math.max(2, Math.round(5 * s)),
        rotation: 0, visible: true,
      } as ShapeLayer);
    }
    case "colour_block": {
      const slot = (opts.option || "primary") as keyof StudioBrand["colours"];
      const colour = brand.colours[slot] || brand.colours.primary;
      // Left third by default — the band a headline sits on.
      const w = Math.round(W * 0.38);
      return one({
        id: uid("rect"), kind: "shape", shape: "rect",
        x: 0, y: 0, w, h: H,
        fill: colour, stroke: "none", strokeWidth: 0, radius: 0,
        rotation: 0, visible: true,
      } as ShapeLayer, true);
    }
    case "background": {
      const wantsFade = opts.option !== "solid";
      return one({
        id: uid("rect"), kind: "shape", shape: "rect",
        x: 0, y: 0, w: W, h: H,
        fill: wantsFade ? undefined : brand.colours.primary,
        gradient: wantsFade
          ? { from: brand.colours.primary, to: brand.colours.accent, dir: "d1" }
          : undefined,
        stroke: "none", strokeWidth: 0, rotation: 0, visible: true,
      } as ShapeLayer, true);
    }
    case "button": {
      // The one compound in the pane that everybody recognises: a rounded
      // block with a label centred on it, both in the business's colours.
      const w = Math.round(Math.min(W * 0.62, 460 * s));
      const h = Math.round(110 * s);
      const x = Math.round(cx - w / 2);
      const y = Math.round(cy - h / 2);
      const size = Math.round(38 * s);
      return many([
        {
          id: uid("rect"), kind: "shape", shape: "rect",
          x, y, w, h, radius: Math.round(h / 2),
          fill: brand.colours.accent, stroke: "none", strokeWidth: 0, visible: true,
        } as ShapeLayer,
        {
          id: uid("text"), kind: "text",
          x, y: Math.round(y + h / 2 - size * 0.7), w, h: Math.round(size * 1.4),
          content: "BOOK TODAY", size, weight: "700",
          color: brand.colours.background, align: "center",
          letterSpacing: Math.round(3 * s), font: brand.fonts.heading, visible: true,
        } as TextLayer,
      ]);
    }
    /* `gallery` AND `callout` LIVED HERE and are DELETED (integration,
       2026-09-19). The studio offers thirteen kinds and neither was one of
       them, so both cases were unreachable: `gallery` left the studio's list
       long ago, and `callout` is a kind that no longer exists anywhere
       (§11.13.3 turned it into `alert`, and the studio is not one of the four
       builders that section gives the standard set to). An insert case for a
       tile nobody can press is code that looks like a feature. Replace means
       delete; `test/mybrand-studio.test.mjs` walks the offered list and would
       have gone red the moment either came back as a tile. */
    case "qr_code": {
      // The caller renders the code (LUMEN owns the encoder) and hands the
      // data: URI in, so what the canvas shows and what an export bakes are
      // the same bytes — a remote <img> would be neither.
      const side = Math.round(Math.min(W, H) * 0.22);
      return one({
        id: uid("qr"), kind: "image",
        x: Math.round(W - side - Math.round(60 * s)), y: Math.round(H - side - Math.round(60 * s)),
        w: side, h: side,
        src: opts.imageSrc || null,
        blob_ref: null, rotation: 0, visible: true,
      } as ImageLayer);
    }
    case "social_handle": {
      const platform = opts.option || "instagram";
      const iconKey = SOCIAL_ICON[platform] || "user";
      const side = Math.round(64 * s);
      const size = Math.round(36 * s);
      const y = Math.round(H - side - Math.round(70 * s));
      const x = Math.round(cx - Math.round(220 * s));
      return many([
        {
          id: uid("icon"), kind: "shape", shape: "icon", icon: iconKey,
          x, y, w: side, h: side,
          fill: brand.colours.accent, stroke: "none", strokeWidth: 0, visible: true,
        } as ShapeLayer,
        {
          id: uid("text"), kind: "text",
          x: x + side + Math.round(18 * s), y: Math.round(y + side / 2 - size * 0.7),
          w: Math.round(380 * s), h: Math.round(size * 1.4),
          content: handleFor(platform, brand),
          size, weight: "600", color: brand.colours.text, align: "left",
          font: brand.fonts.body, visible: true,
        } as TextLayer,
      ]);
    }

    default: {
      /* B-168 / D-168 item 5b — THE FAMILIES' STUDIO HALF.
         The offer file gives My Brand ten Elementor widgets, and before this
         door a family's tile was on that panel and pressing it put nothing on
         the canvas — silently, because this branch returned EMPTY. Found by
         f1-words (§6.5), and it would have hit every family that owns one of
         the ten. `families/familySurfaceGaps()` names any that still has no
         insert, so the silence is a red test rather than a dead button. */
      const fam = insertFamilyWidget(kind, doc as never, brand as never, opts as never);
      if (fam) {
        return {
          layers: fam.layers as Layer[],
          behind: fam.behind ?? false,
          selectId: fam.selectId ?? null,
        };
      }
      return EMPTY;
    }
  }
}

/** The symbol each platform borrows from the curated icon pack. */
const SOCIAL_ICON: Record<string, string> = {
  instagram: "camera",
  facebook: "thumbs",
  linkedin: "user",
  website: "home",
  phone: "phone",
  email: "mail",
};

function handleFor(platform: string, brand: StudioBrand): string {
  const slug = String(brand.businessName || "yourbusiness").toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (platform === "website") return String(brand.websiteUrl || "yourbusiness.com").replace(/^https?:\/\//, "");
  if (platform === "phone") return "(000) 000-0000";
  if (platform === "email") return `hello@${slug || "yourbusiness"}.com`;
  return `@${slug || "yourbusiness"}`;
}

/** A text layer at one of the three Canva-style sizes, in the business's face. */
export function textLayer(
  preset: TextPresetKey,
  doc: CanvasDoc,
  brand: StudioBrand,
  font?: string,
): TextLayer {
  const p = TEXT_PRESETS[preset];
  const s = Math.max(0.3, doc.width / 1080);
  const size = Math.round(p.size * s);
  const w = Math.round(Math.min(doc.width * 0.8, p.label.length * size * 0.62));
  return {
    id: uid("text"), kind: "text",
    x: Math.round(doc.width / 2 - w / 2),
    y: Math.round(doc.height / 2 - size),
    w, h: Math.round(size * 1.4),
    content: p.label,
    font: font || brand.fonts.body || DEFAULT_FONTS[0],
    size,
    color: brand.colours.text,
    weight: p.weight,
    align: "center",
    lineHeight: 1.2,
    rotation: 0,
    visible: true,
  };
}

/** A chart layer — the infographic tool, kept from the old rail. */
export function chartLayer(doc: CanvasDoc): ChartLayer {
  return {
    id: uid("chart"), kind: "chart", chart: "bar",
    x: Math.round(doc.width / 2 - Math.min(400, doc.width * 0.4)),
    y: Math.round(doc.height / 2 - Math.min(260, doc.height * 0.3)),
    w: Math.round(Math.min(800, doc.width * 0.8)),
    h: Math.round(Math.min(520, doc.height * 0.6)),
    values: [
      { label: "Q1", value: 24 }, { label: "Q2", value: 38 },
      { label: "Q3", value: 45 }, { label: "Q4", value: 61 },
    ],
    rotation: 0, visible: true,
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n) || min));
}
