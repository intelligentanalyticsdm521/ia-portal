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
/* THE ONE LIST OF WHAT A BUSINESS RECORD HOLDS (11.12 F.2 / D-167). Imported,
   never re-typed — `BUSINESS_PLACEHOLDER` below is computed from it. */
import { RECORD_FIELDS } from "../../proposal/recordWidgets";
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
  /**
   * THE BUSINESS RECORD — the one record the Custom Field tile can read here.
   *
   * Keys are `proposal/recordWidgets.RECORD_FIELDS.business_info`'s own keys
   * (`name`, `phone`, `email`, `licence`, `logo`), because there is ONE list
   * of what a business record holds and a second one here would be a second
   * answer to the same question. The values come from `GET /account/profile`,
   * the shared tenant profile the Account page writes.
   *
   * A CUSTOMER and a SERVICE LOCATION are deliberately not here. The offer
   * file's Custom Field reads all three, and the studio has no customer picked
   * — a design is made once and shown to everybody. Choosing a customer field
   * on this canvas would draw a blank nobody could fill, which is ask R-D4.
   */
  record: Record<string, string>;
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
  /**
   * ONE REAL PRODUCT, for the `product_card` tile — picked from the OLIVER
   * catalogue by the adapter, exactly as the proposal builder's Product Cards
   * tile picks from the same `/catalog/offerings?include_prices=1`.
   *
   * It arrives as three strings and not as a catalogue row, for the reason
   * this whole module is pure: the studio places LAYERS, and a layer holds
   * words. The catalogue row itself is the adapter's business.
   */
  product?: { name: string; price: string; blurb: string };
  /**
   * ONE REAL REVIEW, for the `ia_review` tile — picked by the adapter from
   * `GET /reviews`, the SPARK Reviews hub's own list, which is the only real
   * review source on the platform.
   */
  review?: { quote: string; author: string; rating: number };
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
  /* THE OFFER'S NINE, built 2026-09-22. Everything the offer file gives
     `builders.mybrand` now has a case below, so the panel and the canvas
     agree: `test/builder-offers.test.mjs` is green for mybrand and
     `familySurfaceGaps()` reads this list to say so. */
  "photo_grid", "line", "frame",
  "testimonial", "star_rating", "social_links",
  "custom_field", "product_card", "ia_review",
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
    /**
     * PHOTO GALLERY — `photo_grid`, the offer file's own name for it.
     *
     * THE MERGE (2026-09-22). `feat/mybrand-canva-parity` deepened a case
     * called `gallery`: G-07 gave the grid a GUTTER and a CORNER ROUNDING,
     * round 3's R2-C made the cells arrive LOOSE so one can be filled. The
     * landed line had deleted `case "gallery"` the same week, and rightly —
     * `gallery` is not a name in `BUILDER_OFFERS_2026-09-19.json` and the tile
     * had already gone, so the case was unreachable. Both sides were right:
     * the offer DOES give My Brand a grid, under the name `photo_grid`
     * (`builders.mybrand.canvas_pieces`). So the studio's need is met the
     * landed way — the parity work, under the approved name, reachable again
     * from a tile the offer authorises.
     *
     * The gutter and the radius arrive as OPTIONS and are edited afterwards in
     * the panel on the right, which is where Elementor puts a widget's own
     * settings. Their defaults are round 1's fixed numbers, so a grid dropped
     * without a thought lands exactly where it used to.
     */
    case "photo_grid": {
      const n = clamp(opts.count ?? 4, 2, 12);
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
    /* `gallery` AND `callout` LIVED HERE and are DELETED (integration,
       2026-09-19). The studio offers thirteen kinds and neither was one of
       them, so both cases were unreachable: `gallery` left the studio's list
       long ago, and `callout` is a kind that no longer exists anywhere
       (§11.13.3 turned it into `alert`, and the studio is not one of the four
       builders that section gives the standard set to). An insert case for a
       tile nobody can press is code that looks like a feature. Replace means
       delete; `test/mybrand-studio.test.mjs` walks the offered list and would
       have gone red the moment either came back as a tile. */
    /**
     * LINE — its own tile at last.
     *
     * It was a third option inside the Shape tile's "Which shape?" question,
     * which is why every parity round listed it as *"present as a capability
     * with no tile"*. The offer file lists `line` beside `shape` in
     * `canvas_pieces`, so it is a tile, and Shape's question is down to two.
     * Same layer either way, so nothing a design already holds changes.
     */
    case "line": {
      const w = Math.round(Math.min(W, H) * 0.5);
      return one({
        id: uid("line"), kind: "shape", shape: "line",
        x: Math.round(cx - w / 2), y: Math.round(cy), w, h: 0,
        fill: "none", stroke: brand.colours.primary,
        strokeWidth: Math.max(2, Math.round(6 * s)),
        rotation: 0, visible: true,
      } as ShapeLayer);
    }

    /**
     * FRAME — a picture cut to a shape, as an empty slot waiting for the photo.
     *
     * The capability has been there since round 1 (`ImageLayer.mask`,
     * `frameStroke`, `frameFill`, `fitInk`) but only as a control on a Picture
     * that already existed, which is why the parity sheet called it *"a crop on
     * a Picture"* rather than a tile. The offer lists `frame` in
     * `canvas_pieces` in its own right, and a frame is the thing a person
     * reaches for FIRST — lay the circle out, put the photograph in later. So
     * the tile drops an EMPTY circle frame in the business's own colour, with
     * its ring on, and the Picture's Content controls fill it.
     *
     * `frameFill` and not a grey well: a designer laying out a page before the
     * photography arrives wants the placeholder in their own colour, which is
     * the note `ImageLayer.frameFill` was written with.
     */
    case "frame": {
      const side = Math.round(Math.min(W, H) * 0.5);
      return one({
        id: uid("frame"), kind: "image",
        x: Math.round(cx - side / 2), y: Math.round(cy - side / 2), w: side, h: side,
        src: null, mask: "circle",
        frameFill: brand.colours.secondary,
        frameStroke: brand.colours.primary,
        frameStrokeWidth: Math.max(2, Math.round(8 * s)),
        rotation: 0, visible: true,
      } as ImageLayer);
    }

    /**
     * TESTIMONIAL — Elementor's own widget, as a graphic.
     *
     * `f5-sliders-reviews/testimonial.ts` said why it was NOT offered here:
     * *"A widget whose shape is a FLOW has nothing to place."* That is true of
     * the widget and not of the thing: a quote, a name and a job title are
     * three runs of words at three sizes, and a canvas places runs of words.
     * So the flow becomes three text layers in one group, in the order the
     * page renderer draws them, and the family keeps its definition, its
     * label, its picture and its panel. The def's own `brand` description —
     * *"One customer's words, as a graphic"* — was written for this and had
     * nowhere to be read.
     */
    case "testimonial": {
      const w = Math.round(Math.min(W * 0.8, 820 * s));
      const x = Math.round(cx - w / 2);
      const quoteSize = Math.round(44 * s);
      const nameSize = Math.round(28 * s);
      const jobSize = Math.round(22 * s);
      const top = Math.round(cy - quoteSize * 2);
      return many([
        {
          id: uid("text"), kind: "text",
          x, y: top, w, h: Math.round(quoteSize * 3),
          content: "\u201cThey turned up when they said they would, and the job was spotless.\u201d",
          font: brand.fonts.heading, size: quoteSize, color: brand.colours.text,
          weight: "400", align: "center", lineHeight: 1.25, visible: true,
        } as TextLayer,
        {
          id: uid("text"), kind: "text",
          x, y: Math.round(top + quoteSize * 3.4), w, h: Math.round(nameSize * 1.4),
          content: "Dana R.",
          font: brand.fonts.body, size: nameSize, color: brand.colours.primary,
          weight: "700", align: "center", lineHeight: 1.2, visible: true,
        } as TextLayer,
        {
          id: uid("text"), kind: "text",
          x, y: Math.round(top + quoteSize * 3.4 + nameSize * 1.6), w, h: Math.round(jobSize * 1.4),
          content: "Facilities Manager",
          font: brand.fonts.body, size: jobSize, color: brand.colours.text,
          weight: "400", align: "center", lineHeight: 1.2, visible: true,
        } as TextLayer,
      ]);
    }

    /**
     * RATING — Elementor's `rating`, stored `star_rating`.
     *
     * Five stars from the studio's own icon pack, as five SHAPE layers in one
     * group, the last of them in the pale colour so four-and-a-bit reads as
     * four-and-a-bit. Not one text layer of "\u2605\u2605\u2605\u2605\u2606": the export renders
     * fonts through a bundled face list and a glyph that is not in one of them
     * comes out as a box, which is the defect `fontEmbed.ts` exists to stop.
     * A shape is a path; it draws the same in the browser and on the server.
     */
    case "star_rating": {
      const n = 5;
      const filled = clamp(opts.count ?? 4, 0, n);
      const side = Math.round(Math.min(W, H) * 0.09);
      const gap = Math.round(side * 0.24);
      const rowW = n * side + (n - 1) * gap;
      const x0 = Math.round(cx - rowW / 2);
      return many(Array.from({ length: n }, (_, i) => ({
        id: uid("icon"), kind: "shape", shape: "icon", icon: "star",
        x: x0 + i * (side + gap), y: Math.round(cy - side / 2), w: side, h: side,
        fill: i < filled ? brand.colours.primary : brand.colours.secondary,
        stroke: "none", strokeWidth: 0, rotation: 0, visible: true,
      } as ShapeLayer)));
    }

    /**
     * SOCIAL ICONS — Elementor's `social-icons`, stored `social_links`.
     *
     * A ROW of platform marks, which is the widget; the studio's older
     * `social_handle` is one mark and the @name beside it, is not in the offer
     * and is no longer a tile. Three discs in the accent colour with the mark
     * knocked out in the background colour, grouped, because a row of icons is
     * one thing you drag.
     */
    case "social_links": {
      const platforms = ["instagram", "facebook", "linkedin"];
      const disc = Math.round(Math.min(W, H) * 0.1);
      const gap = Math.round(disc * 0.35);
      const rowW = platforms.length * disc + (platforms.length - 1) * gap;
      const x0 = Math.round(cx - rowW / 2);
      const y0 = Math.round(cy - disc / 2);
      const out: Layer[] = [];
      platforms.forEach((platform, i) => {
        const x = x0 + i * (disc + gap);
        out.push({
          id: uid("ellipse"), kind: "shape", shape: "ellipse",
          x, y: y0, w: disc, h: disc,
          fill: brand.colours.accent, stroke: "none", strokeWidth: 0,
          rotation: 0, visible: true,
        } as ShapeLayer);
        const mark = Math.round(disc * 0.5);
        out.push({
          id: uid("icon"), kind: "shape", shape: "icon",
          icon: SOCIAL_ICON[platform] || "user",
          x: Math.round(x + (disc - mark) / 2), y: Math.round(y0 + (disc - mark) / 2),
          w: mark, h: mark,
          fill: brand.colours.background, stroke: "none", strokeWidth: 0,
          rotation: 0, visible: true,
        } as ShapeLayer);
      });
      return many(out);
    }

    /**
     * CUSTOM FIELD — one fact from the business record, as words on the page.
     *
     * `ia/customField.ts` offered this to the proposal builder only, and wrote
     * down why: *"The record book is assembled by the proposal adapter … An
     * email or a website page has no customer picked, so the widget would draw
     * an empty run an author could never fill."* That reasoning holds for a
     * CUSTOMER and for a SERVICE LOCATION. It does not hold for the BUSINESS:
     * every surface on the platform knows which business is signed in, and a
     * poster with the shop's phone number on it is the commonest thing anybody
     * makes here. So the studio offers the business group and only that group,
     * the chooser says so in those words, and `brand.record` is where the
     * values come from.
     *
     * An empty field places its PLACEHOLDER — "Your number", "Your email" —
     * which is the same sentence `RECORD_FIELDS` already carries and is
     * editable in place like any other run. A tile that placed nothing because
     * a field happened to be blank would be the silent button this file's
     * header is about.
     */
    case "custom_field": {
      const key = String(opts.option || "name");
      const value = (brand.record && brand.record[key]) || BUSINESS_PLACEHOLDER[key] || "Your business";
      const size = Math.round(40 * s);
      const w = Math.round(Math.min(W * 0.8, 760 * s));
      return one({
        id: uid("text"), kind: "text",
        x: Math.round(cx - w / 2), y: Math.round(cy - size), w, h: Math.round(size * 1.4),
        content: value,
        font: brand.fonts.body, size, color: brand.colours.text,
        weight: "600", align: "center", lineHeight: 1.2, visible: true,
      } as TextLayer);
    }

    /**
     * PRODUCT CARD — one real product, priced, as a promo card.
     *
     * The offer file: *"My Brand: one promo card with a real product name and
     * price"*. SINGULAR, and that is the difference from the proposal
     * builder's `product_cards`, which opens the same picker and drops a ROW
     * of `catalog_card` widgets into a container. There is no container here,
     * so the tile picks ONE offering and lays it out: a panel, the name, one
     * line about it, and the price big at the bottom.
     *
     * The words arrive in `opts.product` because this module is pure — the
     * adapter reads `/catalog/offerings?include_prices=1`, which is the same
     * one call the proposal builder makes, and there is no second catalogue.
     */
    case "product_card": {
      const pr = opts.product;
      const w = Math.round(Math.min(W * 0.62, 620 * s));
      const h = Math.round(w * 1.05);
      const x = Math.round(cx - w / 2);
      const y = Math.round(cy - h / 2);
      const pad = Math.round(w * 0.09);
      const nameSize = Math.round(w * 0.085);
      const blurbSize = Math.round(w * 0.05);
      const priceSize = Math.round(w * 0.14);
      return many([
        {
          id: uid("rect"), kind: "shape", shape: "rect",
          x, y, w, h, radius: Math.round(24 * s),
          fill: brand.colours.secondary, stroke: "none", strokeWidth: 0,
          rotation: 0, visible: true,
        } as ShapeLayer,
        {
          id: uid("text"), kind: "text",
          x: x + pad, y: y + pad, w: w - pad * 2, h: Math.round(nameSize * 2.6),
          content: pr?.name || "Pick a product",
          font: brand.fonts.heading, size: nameSize, color: brand.colours.text,
          weight: "700", align: "left", lineHeight: 1.2, visible: true,
        } as TextLayer,
        {
          id: uid("text"), kind: "text",
          x: x + pad, y: Math.round(y + pad + nameSize * 3), w: w - pad * 2, h: Math.round(blurbSize * 4),
          content: pr?.blurb || "What it is, in one line.",
          font: brand.fonts.body, size: blurbSize, color: brand.colours.text,
          weight: "400", align: "left", lineHeight: 1.35, visible: true,
        } as TextLayer,
        {
          id: uid("text"), kind: "text",
          x: x + pad, y: Math.round(y + h - pad - priceSize * 1.3), w: w - pad * 2, h: Math.round(priceSize * 1.4),
          content: pr?.price || "",
          font: brand.fonts.heading, size: priceSize, color: brand.colours.primary,
          weight: "700", align: "left", lineHeight: 1.1, visible: true,
        } as TextLayer,
      ]);
    }

    /**
     * IA REVIEW — one real review of the business, as a graphic.
     *
     * The offer file: *"My Brand: one real review as a graphic"*. The reviews
     * come from `GET /reviews`, the SPARK Reviews hub's own list (Google and
     * the rest, already pulled in) — the only real review source the platform
     * has. The newsletter's IA Reviews widget shows *"Your reviews appear here
     * once they are brought in"* over an empty `slides` array, so this is the
     * first surface that actually reads them, and it reads the one the author
     * picked rather than assuming a row.
     *
     * Its shape is the star row this file already places plus two runs of
     * words, so it is `star_rating` and a testimonial's lower half, laid out
     * once. A review nobody picked places the stars and a line that says to
     * pick one — never a silent nothing.
     */
    case "ia_review": {
      const rv = opts.review;
      const w = Math.round(Math.min(W * 0.78, 800 * s));
      const x = Math.round(cx - w / 2);
      const star = Math.round(Math.min(W, H) * 0.06);
      const gap = Math.round(star * 0.24);
      const stars = clamp(rv?.rating ?? 5, 0, 5);
      const rowW = 5 * star + 4 * gap;
      const top = Math.round(cy - star * 3);
      const quoteSize = Math.round(38 * s);
      const nameSize = Math.round(24 * s);
      const out: Layer[] = Array.from({ length: 5 }, (_, i) => ({
        id: uid("icon"), kind: "shape", shape: "icon", icon: "star",
        x: Math.round(cx - rowW / 2) + i * (star + gap), y: top, w: star, h: star,
        fill: i < stars ? brand.colours.primary : brand.colours.secondary,
        stroke: "none", strokeWidth: 0, rotation: 0, visible: true,
      } as ShapeLayer));
      out.push({
        id: uid("text"), kind: "text",
        x, y: Math.round(top + star * 1.8), w, h: Math.round(quoteSize * 3),
        content: rv?.quote || "Pick one of your reviews.",
        font: brand.fonts.heading, size: quoteSize, color: brand.colours.text,
        weight: "400", align: "center", lineHeight: 1.3, visible: true,
      } as TextLayer);
      out.push({
        id: uid("text"), kind: "text",
        x, y: Math.round(top + star * 1.8 + quoteSize * 3.3), w, h: Math.round(nameSize * 1.4),
        content: rv?.author ? `\u2014 ${rv.author}` : "\u2014 who left it",
        font: brand.fonts.body, size: nameSize, color: brand.colours.primary,
        weight: "700", align: "center", lineHeight: 1.2, visible: true,
      } as TextLayer);
      return many(out);
    }

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
/**
 * WHAT AN EMPTY BUSINESS FIELD SAYS, by the field's own key.
 *
 * Read from `RECORD_FIELDS.business_info` rather than typed again: the
 * proposal builder, oliver's `documentModel.js` and this file would otherwise
 * each have their own idea of what the business record holds, which is the
 * drift `recordWidgets.ts`'s own header is about.
 */
const BUSINESS_PLACEHOLDER: Record<string, string> = Object.fromEntries(
  RECORD_FIELDS.business_info.map((f) => [f.key, f.placeholder || f.label]));

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
