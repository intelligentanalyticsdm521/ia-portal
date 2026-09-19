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
  /** Photo grid: the gap between cells, in 1080-canvas pixels (G-07). */
  gutter?: number;
  /** Photo grid: how rounded each cell's corners are, in 1080-canvas pixels. */
  radius?: number;
}

/** One cell of a photo grid. */
export interface GridCell { x: number; y: number; w: number; h: number }

/**
 * WHERE THE CELLS OF A PHOTO GRID GO (G-07).
 *
 * Its own function, and exported, because three callers want the same answer:
 * the tile that drops a grid, the inspector when somebody drags the gutter
 * slider and every cell has to move, and the suite. Round 1's grid arithmetic
 * was inline in one `case`, which is why the gutter could not be changed
 * afterwards — there was nothing to call.
 *
 * Square cells, because a photo grid whose cells are not all the same shape is
 * a collage and wants a different control. `y` is the grid's CENTRE line;
 * `height` comes back so a caller can put it wherever it wants.
 */
export function photoGridLayout(input: {
  count: number; x: number; y: number; width: number; gutter: number;
}): { cells: GridCell[]; width: number; height: number; cols: number; rows: number } {
  const n = clamp(Math.round(input.count) || 2, 2, 12);
  const cols = n <= 2 ? 2 : n <= 6 ? 3 : 4;
  const rows = Math.ceil(n / cols);
  const gutter = Math.max(0, Math.round(input.gutter) || 0);
  const gw = Math.max(cols, Math.round(input.width));
  const cell = Math.max(1, Math.round((gw - gutter * (cols - 1)) / cols));
  const height = rows * cell + gutter * (rows - 1);
  const cells: GridCell[] = Array.from({ length: n }, (_, i) => ({
    x: input.x + (i % cols) * (cell + gutter),
    y: input.y + Math.floor(i / cols) * (cell + gutter),
    w: cell,
    h: cell,
  }));
  return { cells, width: gw, height, cols, rows };
}

const EMPTY: InsertResult = { layers: [], behind: false, selectId: null };

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
  /**
   * A TILE THAT DROPS MORE THAN ONE LAYER DROPS THEM AS A UNIT (parity D-5).
   *
   * Round 1: *"Button and Social handle each insert a shape and a text, leave
   * only the last one selected, and arrive UNGROUPED — so the pill and its
   * words have to be placed separately from the Structure window."*
   *
   * A button is one thing to the person who dragged it in. Dropping its pill
   * and its words as two free layers means the very first drag pulls the two
   * apart, and nothing warned them. So every multi-layer tile arrives with one
   * shared `groupId` — the tag BaseLayer already carries for Ctrl+G, so this
   * is not a new mechanism, just the existing one applied at birth — and the
   * FIRST layer is selected, not the last: selecting any member selects the
   * group, and the first is the one at the bottom of the little stack, which
   * is the pill rather than the words.
   *
   * A tile that happens to produce a single layer is not tagged. A group of
   * one is a lie the Structure window would have to draw.
   */
  const many = (layers: Layer[], behind = false): InsertResult => {
    if (!layers.length) return EMPTY;
    if (layers.length === 1) return { layers, behind, selectId: layers[0].id };
    const groupId = uid("grp");
    const tagged = layers.map((l) => ({ ...l, groupId }));
    return { layers: tagged, behind, selectId: tagged[0].id };
  };

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
    case "gallery": {
      const n = clamp(opts.count ?? 4, 2, 12);
      // G-07: the gutter and the corner rounding are the author's, not the
      // grid's. Round 1 had to place design 04's three-up by hand "because the
      // `gallery` widget has no gutter and no corner radius". The default
      // gutter is the old fixed 16 px at 1080, so a grid dropped without
      // touching either control lands exactly where it used to.
      const gutter = Math.round((opts.gutter ?? 16) * s);
      const radius = Math.round((opts.radius ?? 0) * s);
      const box = photoGridLayout({
        count: n,
        x: Math.round(cx - Math.round(Math.min(W, H) * 0.82) / 2),
        y: cy,
        width: Math.round(Math.min(W, H) * 0.82),
        gutter,
      });
      /**
       * A GRID'S CELLS ARRIVE LOOSE, NOT GROUPED (round-3 R2-C).
       *
       * Round 2 put every multi-layer widget through `many`, which tags the
       * lot with one group id — right for a Button, where a pill and its label
       * are one thing that breaks if they come apart, and WRONG here. Clicking
       * a cell selected all four, so the Picture panel never appeared and
       * nothing could put a picture in one: the grid laid out perfectly and was
       * unreachable, and the design then refused to download for the slots it
       * could never lose.
       *
       * Four slots side by side are four pictures the author will fill one at
       * a time. They are still a set — marquee them and Ctrl+G if you want to
       * move them as one — but the default cannot be a lock on the only thing
       * anybody does with a grid.
       */
      const cells = box.cells.map((cell) => ({
        id: uid("image"), kind: "image",
        x: cell.x, y: cell.y - Math.round(box.height / 2), w: cell.w, h: cell.h,
        src: null, visible: true,
        ...(radius > 0 ? { radius } : {}),
      } as ImageLayer));
      return { layers: cells, behind: false, selectId: cells[0]?.id ?? null };
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
    case "callout": {
      const n = clamp(opts.count ?? 2, 1, 3);
      const pad = Math.round(24 * s);
      const w = Math.round(Math.min(W * 0.86, 900 * s));
      const panelW = Math.round((w - pad * (n - 1)) / n);
      const h = Math.round(260 * s);
      const x0 = Math.round(cx - w / 2);
      const y = Math.round(cy - h / 2);
      const titleSize = Math.round(34 * s);
      const bodySize = Math.round(26 * s);
      const out: Layer[] = [];
      for (let i = 0; i < n; i++) {
        const x = x0 + i * (panelW + pad);
        out.push({
          id: uid("rect"), kind: "shape", shape: "rect",
          x, y, w: panelW, h, radius: Math.round(20 * s),
          fill: i === 0 ? brand.colours.primary : brand.colours.secondary,
          stroke: "none", strokeWidth: 0, visible: true,
        } as ShapeLayer);
        out.push({
          id: uid("text"), kind: "text",
          x: x + pad, y: y + pad, w: panelW - pad * 2, h: Math.round(titleSize * 1.4),
          content: i === 0 ? "What's included" : "What's not",
          size: titleSize, weight: "700", color: brand.colours.background,
          align: "left", font: brand.fonts.heading, visible: true,
        } as TextLayer);
        out.push({
          id: uid("text"), kind: "text",
          x: x + pad, y: y + pad + Math.round(titleSize * 1.8),
          w: panelW - pad * 2, h: Math.round(bodySize * 4),
          content: "Say it here in a line or two.",
          size: bodySize, weight: "400", color: brand.colours.background,
          align: "left", lineHeight: 1.35, font: brand.fonts.body, visible: true,
        } as TextLayer);
      }
      return many(out);
    }

    /* ── Information ─────────────────────────────────────────────────── */
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

    default:
      return EMPTY;
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
