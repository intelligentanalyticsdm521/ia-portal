/**
 * builder/adapters/mybrand/fabricBridge.ts — a layer becomes a Fabric object.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §5 step 5. The ONLY file in the studio that
 * knows Fabric exists, lifted unchanged out of the old TemplateStudioEditorModal.
 *
 * Fabric.js is a primitive HTML-canvas library, not a vendor SaaS surface, so
 * it satisfies feedback_no_third_party_product_surface the same way chart.js
 * and lucide do — and keeping every call to it behind this one file is what
 * makes that checkable, and what would make swapping it a contained job.
 *
 * ── THE ONE RULE ──────────────────────────────────────────────────────────
 * The geometry below must match LUMEN's server renderer
 * (LUMEN-API/src/lib/myBrand/templateStudio.js) glyph for glyph: the editor
 * paints the preview and the server paints the downloaded PNG, and a business
 * that moved a logo by eye has every right to expect the file to agree.
 */
import * as fabric from "fabric";
import {
  DEFAULT_FONTS, GRADIENT_COORDS, ICON_PATHS, familyOf, iconToSvg, chartToSvg,
  rotatedTopLeft, shapeToSvg, textLayerSvg,
  type ChartLayer, type GradientSpec, type ImageLayer, type Layer,
  type ShapeLayer, type TextLayer,
} from "./scene";
import { applyCase, dashArray, dashLineCap } from "./textEffects";
import { cachedFontFace, loadFontFace } from "./fontEmbed";
import { NEUTRAL_BRAND_KIT } from "../../../lib/brandKit";

/** Only ever reached by a scene that carries no colour of its own. */
const FALLBACK = NEUTRAL_BRAND_KIT.colours;


/* ══════════════════════════════════════════════════════════════════════════
   A PHOTOGRAPH MUST NOT POISON THE DOWNLOAD (round-3 R2-A)
   ══════════════════════════════════════════════════════════════════════════

   Six of the ten reference designs could not be downloaded AT ALL. PNG, JPG
   and PDF all died with "Tainted canvases may not be exported", because a
   picture fetched from another origin and drawn without permission makes the
   whole canvas unreadable to `toDataURL` — one photograph poisons the file.

   The permission is one option long. `crossOrigin: "anonymous"` makes the
   browser send the CORS preflight the blob host already answers for every
   other request this app makes, and the canvas stays readable.

   WHAT HAPPENS WHEN A HOST WILL NOT ANSWER IT
   An anonymous request to a host with no CORS header fails outright, and
   failing outright would lose the PICTURE as well as the download. So the load
   falls back to the plain, tainting request — the author still sees their
   photograph — and the source is remembered here. The export asks before it
   tries, and says which picture and what to do instead, rather than handing
   over a browser exception about canvases. */

const TAINTED = new Set<string>();

/** Remembered sources that had to be loaded without CORS. */
export function taintedSources(): string[] {
  return [...TAINTED];
}

/** Which of these layers' pictures the browser cannot read back. */
export function taintedIn(layers: Array<{ kind?: string; src?: string | null }>): string[] {
  const out: string[] = [];
  for (const l of layers) {
    if (l?.kind !== "image") continue;
    const src = l.src ? String(l.src) : "";
    if (src && TAINTED.has(src) && !out.includes(src)) out.push(src);
  }
  return out;
}

/** The sentence a refused download says. Never a browser exception. */
export function taintMessage(count: number): string {
  const many = count > 1;
  return `${many ? `${count} pictures in this design were` : "A picture in this design was"} ` +
    "loaded from a place that does not let the browser read it back, so the file cannot be " +
    "made here. Use Save to Media Library, which draws it on our own server, and download it " +
    "from there.";
}

/** Only the tests and a fresh document clear it. */
export function forgetTaint(): void {
  TAINTED.clear();
}

/**
 * Remember that this source had to be drawn without permission.
 *
 * Exported because the loader below is the only caller in the app and a set
 * nothing can put anything into is a set no test can prove anything about.
 */
export function noteTainted(src: string): void {
  if (src) TAINTED.add(String(src));
}

/**
 * WHERE A PICTURE'S BYTES COME FROM WHEN ITS HOST WILL NOT SAY YES.
 *
 * A brand asset is served as a short-lived SAS URL on the blob account, and a
 * blob account answers no CORS header — so `crossOrigin: "anonymous"` is
 * refused and the plain request taints the canvas. LUMEN, on the other hand,
 * the Portal is already allowed to call, with the tenant header it already
 * sends. So the editor asks LUMEN for the bytes and draws a `data:` URL, which
 * belongs to no other origin and can never taint anything.
 *
 * The resolver is INJECTED because this file must not know about auth, tenants
 * or the API client — and it is asserted to be REGISTERED by a test rather than
 * quietly defaulting to nothing, because a seam that silently falls back is a
 * seam that hides the very defect it was built for.
 */
type BytesResolver = (assetId: string) => Promise<string | null>;
let resolveAssetBytes: BytesResolver | null = null;
const BYTES = new Map<string, string>();

export function setAssetBytesResolver(fn: BytesResolver | null): void {
  resolveAssetBytes = fn;
}

export function hasAssetBytesResolver(): boolean {
  return typeof resolveAssetBytes === "function";
}

/** Only the tests and a fresh sign-in clear the cache. */
export function forgetAssetBytes(): void {
  BYTES.clear();
}

/** One picture's bytes, fetched at most once a session. */
export async function assetDataUrl(assetId: string): Promise<string | null> {
  if (!assetId || !resolveAssetBytes) return null;
  const had = BYTES.get(assetId);
  if (had) return had;
  const got = await resolveAssetBytes(assetId).catch(() => null);
  if (got) BYTES.set(assetId, got);
  return got || null;
}

/**
 * A picture, loaded so the canvas stays readable when the host allows it.
 *
 * A `data:` URL is already same-origin, so it never tries twice.
 */
function loadImage(src: string): Promise<fabric.FabricImage> {
  if (src.startsWith("data:")) return fabric.FabricImage.fromURL(src);
  return fabric.FabricImage.fromURL(src, { crossOrigin: "anonymous" }).catch((err) => {
    // Not "the picture is broken" — that rejects the second time too, and the
    // caller's own catch draws the slot. This is only "the host said no".
    return fabric.FabricImage.fromURL(src).then((img) => {
      noteTainted(src);
      return img;
    }, () => Promise.reject(err));
  });
}

function fabricGradient(g: GradientSpec): fabric.Gradient<"linear"> {
  return new fabric.Gradient({
    type: "linear",
    gradientUnits: "percentage",
    coords: GRADIENT_COORDS[g.dir] || GRADIENT_COORDS.d1,
    colorStops: [
      { offset: 0, color: g.from || FALLBACK.primary },
      { offset: 1, color: g.to || FALLBACK.secondary },
    ],
  });
}

export { fabricGradient };

// Swap an async placeholder for its real object AT THE SAME STACK INDEX —
// plain add() appends on top, which floated background blobs above the
// headline in the editor (export order was right; clicks and visuals wrong).
export function swapPlaceholder(
  placeholder: fabric.FabricObject,
  real: fabric.FabricObject,
  onSwap?: (obj: fabric.FabricObject) => void,
) {
  const canvas = placeholder.canvas;
  if (!canvas) return;
  const idx = canvas.getObjects().indexOf(placeholder);
  canvas.remove(placeholder);
  canvas.add(real);
  if (idx >= 0) {
    (canvas as unknown as { moveObjectTo?: (o: fabric.FabricObject, i: number) => void })
      .moveObjectTo?.(real, idx);
  }
  onSwap?.(real);
  canvas.requestRenderAll();
}

/**
 * WHAT AN EMPTY PICTURE SLOT SAYS (D-24).
 *
 * A dashed frame with one plain sentence in it. Grouped so it drags, scales and
 * selects as one thing — the author is moving "the picture", not a rectangle
 * and a caption that can come apart.
 */
function emptySlot(
  baseProps: Record<string, unknown>,
  w: number,
  h: number,
  caption: string,
): fabric.FabricObject {
  const frame = new fabric.Rect({
    left: 0, top: 0, width: w, height: h,
    fill: "#F1F5F9", stroke: "#94A3B8", strokeWidth: 1, strokeDashArray: [6, 4],
  });
  // Scaled to the slot, floored so a tiny logo box still has readable type and
  // capped so a full-bleed slot does not shout.
  const size = Math.max(11, Math.min(28, Math.round(Math.min(w, h) * 0.12)));
  const label = new fabric.Textbox(caption, {
    left: Math.round(w * 0.08),
    top: Math.round(h / 2 - size),
    width: Math.round(w * 0.84),
    fontSize: size,
    fontFamily: DEFAULT_FONTS[0],
    fill: "#64748B",
    textAlign: "center",
    lineHeight: 1.25,
    selectable: false,
    evented: false,
  });
  return new fabric.Group([frame, label], { ...baseProps, width: w, height: h });
}

/**
 * A FRAME'S BORDER — the outline of the mask, not of the box (G-06).
 *
 * Canva's frames can be given a border, and two of the ten reference designs
 * want one: the arch in design 02 and the circle in design 09. Round 1 had to
 * draw a second shape on top and keep the two in the same place by hand, which
 * comes apart the first time either is nudged.
 *
 * Returns null when no border was asked for, so the common case stays a single
 * FabricImage with no group wrapped round it.
 */
function frameOutline(il: ImageLayer): fabric.FabricObject | null {
  const stroke = il.frameStroke && il.frameStroke !== "none" ? il.frameStroke : null;
  const width = Math.max(0, Number(il.frameStrokeWidth) || 0);
  if (!stroke || width <= 0) return null;
  const common = {
    left: il.x, top: il.y,
    fill: "transparent",
    stroke,
    strokeWidth: width,
    strokeDashArray: dashArray(il.frameDash, width),
    strokeLineCap: dashLineCap(il.frameDash),
    selectable: false, evented: false,
    originX: "left" as const, originY: "top" as const,
  };
  if (il.mask === "circle") {
    return new fabric.Ellipse({ ...common, rx: il.w / 2, ry: il.h / 2 });
  }
  if (il.mask === "rounded" || !il.mask) {
    const r = il.mask === "rounded" ? Math.min(il.w, il.h) * 0.12 : Math.max(0, Number(il.radius) || 0);
    return new fabric.Rect({ ...common, width: il.w, height: il.h, rx: r, ry: r });
  }
  const d = ICON_PATHS[il.mask];
  if (!d) return new fabric.Rect({ ...common, width: il.w, height: il.h });
  const path = new fabric.Path(d, common);
  path.scaleX = il.w / 100;
  path.scaleY = il.h / 100;
  // A path's stroke scales with the path, exactly as an icon's does (D-3), so
  // the width is divided back out by the same geometric mean.
  path.strokeWidth = width / Math.sqrt((il.w / 100) * (il.h / 100));
  return path;
}

/**
 * A photo and its frame as ONE selectable thing.
 *
 * No `left`/`top` is passed: Fabric v6 computes the group's box from where the
 * children already are, which is what keeps the ring exactly on the photo's
 * edge instead of a few pixels off it.
 */
function groupWith(
  img: fabric.FabricObject,
  ring: fabric.FabricObject,
  baseProps: Record<string, unknown>,
): fabric.FabricObject {
  const group = new fabric.Group([img, ring]);
  const angle = (baseProps.angle as number) || 0;
  // Where the pair sits before it is turned — the photo's own box, grown by
  // half the ring's stroke on each side, so its middle is the photo's middle.
  const before = group.getBoundingRect();
  const cx = before.left + before.width / 2;
  const cy = before.top + before.height / 2;
  group.set({
    angle,
    opacity: (baseProps.opacity as number) ?? 1,
    visible: baseProps.visible !== false,
    flipX: baseProps.flipX === true,
    flipY: baseProps.flipY === true,
    selectable: baseProps.selectable !== false,
    evented: baseProps.evented !== false,
  });
  if (angle) {
    /**
     * R2-G, the group's half. A Group pins its origin exactly as any other
     * object does, so turning one walks it off its photo. Rather than assume
     * which corner Fabric chose, put the MIDDLE back where the middle was —
     * which is the scene's rule, stated in the one way that cannot be wrong
     * about Fabric's own origin bookkeeping.
     */
    group.setCoords();
    const after = group.getBoundingRect();
    group.set({
      left: (group.left ?? 0) + (cx - (after.left + after.width / 2)),
      top: (group.top ?? 0) + (cy - (after.top + after.height / 2)),
    });
    group.setCoords();
  }
  return group;
}

/** The sentence in the slot. A logo says so; anything else is "a picture". */
function slotCaption(il: ImageLayer): string {
  const isLogo = String((il as unknown as { role?: string }).role || "") === "logo"
    || /logo/i.test(String(il.id || ""));
  return isLogo
    ? "Your logo goes here — add it under My Brand"
    : "Picture goes here — click the slot, then Replace";
}

export function layerToFabricObject(
  layer: Layer,
  onSwap?: (obj: fabric.FabricObject) => void,
): fabric.FabricObject | null {
  const locked = layer.locked === true;
  /**
   * R2-G: FABRIC PINS THE CORNER; THE SCENE PIVOTS ON THE CENTRE.
   *
   * With the default left/top origin, Fabric keeps the (left, top) POINT where
   * it is and swings the body around it, while the scene, LUMEN's exporter and
   * the PDF all say x,y is the unturned top-left and the turn pivots on the
   * box's middle. At 180° the difference is a whole width and a whole height:
   * design 10's second arch was painted entirely off the top of the page, and
   * every other turned layer in the studio has been out by less.
   *
   * `rotatedTopLeft` is the conversion, and it is the identity at 0°, so
   * everything that was never turned is placed exactly where it always was.
   */
  const anchor = rotatedTopLeft(layer.x, layer.y, layer.w, layer.h, layer.rotation || 0);
  const baseProps = {
    left: anchor.left,
    top: anchor.top,
    angle: layer.rotation || 0,
    opacity: layer.opacity ?? 1,
    visible: layer.visible !== false,
    flipX: layer.flipH === true,
    flipY: layer.flipV === true,
    selectable: !locked,
    evented: !locked,
    hasControls: !locked,
  };
  if (layer.kind === "text") {
    const t = layer as TextLayer;
    const size = t.size || 24;
    // Echo, Splice, Neon and Curve need more painted copies than a Fabric
    // object has, or glyphs on an arc that no text object draws. Those four
    // come back as the SAME SVG the exporter writes (scene.textLayerSvg), so
    // the canvas and the download are one drawing. Everything else stays a
    // real Textbox, and stays editable in place.
    /**
     * D-2: AN SVG LOADED AS AN IMAGE CANNOT REACH THE PAGE'S WEBFONTS.
     *
     * So the face's own bytes travel inside the picture. `cachedFontFace` is
     * whatever is already in hand (nothing, the first time a curve is drawn);
     * `loadFontFace` fetches it and the picture is rebuilt once, with the real
     * face. Two paints instead of one, and the second is the one that counts —
     * the alternative is a synchronous fetch, which there is no such thing as,
     * or drawing nothing until the font lands, which loses the words.
     */
    const family = familyOf(t.font || DEFAULT_FONTS[0]);
    const weightNum = Number(t.weight) || (t.weight === "bold" ? 700 : 400);
    const svgText = textLayerSvg(t, cachedFontFace(family, weightNum));
    if (svgText) {
      const placeholder = new fabric.Rect({
        ...baseProps, width: t.w, height: svgText.h,
        fill: "transparent", stroke: "#CBD5E1", strokeWidth: 1, strokeDashArray: [4, 3],
      });
      const paint = (built: { svg: string; w: number; h: number }, target: fabric.FabricObject) => {
        const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(built.svg)}`;
        return loadImage(dataUrl).then((img) => {
          if (!img) return null;
          img.set({ ...baseProps });
          img.scaleX = built.w / (img.width || 1);
          img.scaleY = built.h / (img.height || 1);
          swapPlaceholder(target, img, onSwap);
          return img;
        });
      };
      paint(svgText, placeholder).then((drawn) => {
        if (!drawn) return;
        return loadFontFace(family, weightNum).then((css) => {
          // Nothing to redo when the face was already embedded in the first
          // paint, or when we carry no file for it.
          if (!css || css === cachedFontFace(family, weightNum) && svgText.svg.includes("@font-face")) return;
          const withFace = textLayerSvg(t, css);
          if (!withFace || withFace.svg === svgText.svg) return;
          void paint(withFace, drawn);
        });
      }).catch(() => { /* the dashed placeholder stays, so the layer is still there to click */ });
      return placeholder;
    }
    // Textbox (not IText): wraps at the layer width like the export's
    // soft-wrap, so long copy never silently runs off the canvas.
    const itext = new fabric.Textbox(applyCase(t.content || "", t.textCase), {
      ...baseProps,
      width: t.w,
      fontSize: size,
      fontFamily: t.font || DEFAULT_FONTS[0],
      fontWeight: t.weight || "400",
      fontStyle: t.italic ? "italic" : "normal",
      underline: t.underline === true,
      linethrough: t.strike === true,
      textAlign: t.align || "left",
      lineHeight: t.lineHeight || 1.2,
      // Fabric charSpacing is in 1/1000 em; our model stores px.
      charSpacing: t.letterSpacing ? (t.letterSpacing / size) * 1000 : 0,
      // Hollow: stroke-only type. Outline: stroke painted behind the fill.
      ...(t.effect === "hollow"
        ? {
            fill: "transparent",
            stroke: t.color || "#111827",
            strokeWidth: Math.max(1, Math.round(size * 0.05)),
          }
        : {
            fill: t.color || "#111827",
            stroke: t.outline && t.outline !== "none" ? t.outline : undefined,
            strokeWidth: t.outline && t.outline !== "none" ? Math.max(1, Math.round(size * 0.08)) : 0,
          }),
      paintFirst: "stroke",
      // Lift = soft blurred shadow; Shadow = hard offset (both match export).
      shadow: t.effect === "lift"
        ? new fabric.Shadow({
            color: "rgba(0,0,0,0.45)",
            offsetX: 0,
            offsetY: Math.max(1, Math.round(size * 0.06)),
            blur: Math.max(3, Math.round(size * 0.12)),
          })
        : t.shadow
          ? new fabric.Shadow({
              color: "rgba(0,0,0,0.35)",
              offsetX: Math.max(1, Math.round(size * 0.045)),
              offsetY: Math.max(1, Math.round(size * 0.045)),
              blur: 0,
            })
          : undefined,
    });
    return itext;
  }
  if (layer.kind === "image") {
    const il = layer as ImageLayer;
    if (!il.src) {
      // An empty picture slot, and it SAYS it is one (D-24). The dashed frame
      // matches the server-side export look so designers see the same slot in
      // editor and export.
      return emptySlot(baseProps, il.w, il.h, slotCaption(il));
    }
    // Image is loaded asynchronously — we return a placeholder rect for the
    // synchronous case and swap in the FabricImage when the load resolves.
    // Fabric.js v6 returns a promise from FabricImage.fromURL.
    const placeholder = new fabric.Rect({
      ...baseProps,
      width: il.w,
      height: il.h,
      fill: "#E5E7EB",
      stroke: "#9CA3AF",
      strokeWidth: 1,
    });
    const ring = frameOutline(il);
    /**
     * A LIBRARY PICTURE COMES THROUGH OUR OWN API (R2-A).
     *
     * `asset_id` means the business owns this picture and LUMEN can hand us the
     * bytes; anything else — a data URL from an upload that has not landed yet,
     * or a stock URL — takes the ordinary path, which asks the host politely
     * and remembers a refusal.
     */
    const source = il.asset_id
      ? assetDataUrl(il.asset_id).then((url) => (url ? fabric.FabricImage.fromURL(url) : loadImage(il.src as string)))
      : loadImage(il.src);
    Promise.resolve(source).then((img) => {
      if (!img) return;
      /**
       * COVER, NOT STRETCH — and the two halves said different things.
       *
       * LUMEN draws every picture with `preserveAspectRatio="xMidYMid slice"`,
       * which fills the box and crops the overflow. The editor scaled width and
       * height independently, so a 4:3 photograph in a 3:2 grid cell was
       * SQUASHED on screen and cropped in the file. Nobody noticed while every
       * picture was dropped at its own aspect ratio; R2-C's grid cells make it
       * the normal case.
       *
       * Fabric's own crop is the answer: narrow the image's width and height to
       * the piece that shows and scale that piece to the box. The object's box
       * stays exactly the layer's box, so dragging, the handles and the
       * geometry sync are all untouched.
       */
      const srcW = img.width || 1;
      const srcH = img.height || 1;
      const cover = Math.max(il.w / srcW, il.h / srcH);
      const cw = Math.min(srcW, Math.max(1, il.w / cover));
      const ch = Math.min(srcH, Math.max(1, il.h / cover));
      img.set({
        cropX: (srcW - cw) / 2,
        cropY: (srcH - ch) / 2,
        width: cw,
        height: ch,
      });
      img.set({
        // A ring means the photo becomes a child of a group, and a group turns
        // about its own centre — so the CHILD must not carry the angle as well,
        // or the picture is turned twice.
        ...(ring
          ? { left: il.x, top: il.y, angle: 0 }
          : rotatedTopLeft(il.x, il.y, il.w, il.h, il.rotation || 0)),
        ...(ring ? {} : { angle: il.rotation || 0 }),
        opacity: il.opacity ?? 1,
        visible: il.visible !== false,
        selectable: true,
      });
      // GIMP-style adjustments preview — the export bakes the same values
      // via sharp, so what you see is what ships. Brand tint previews as
      // grayscale + multiply blend (≈ sharp's grayscale().tint()).
      const f = il.filters;
      if (f && (f.grayscale || f.tint || (f.brightness && f.brightness !== 1) || (f.saturation && f.saturation !== 1))) {
        const fx: fabric.filters.BaseFilter<string, Record<string, unknown>>[] = [];
        if (f.brightness && f.brightness !== 1) fx.push(new fabric.filters.Brightness({ brightness: f.brightness - 1 }));
        if (f.saturation && f.saturation !== 1) fx.push(new fabric.filters.Saturation({ saturation: f.saturation - 1 }));
        if (f.grayscale || f.tint) fx.push(new fabric.filters.Grayscale());
        if (f.tint) fx.push(new fabric.filters.BlendColor({ color: f.tint, mode: "multiply" }));
        img.filters = fx;
        try { img.applyFilters(); } catch { /* filter backend unavailable — export still bakes them */ }
      }
      // Photo mask — clip in the image's intrinsic space so it tracks the
      // object's own scaling; identical geometry to the server clipPath.
      //
      // G-06: ANY of the forty-seven ICON_PATHS is a frame now, not just the
      // original five, so design 03's diagonal photo edge is a real crop
      // instead of a turned rectangle sitting on top of an uncropped photo.
      if (il.mask) {
        const iw = img.width || 1;
        const ih = img.height || 1;
        let clip: fabric.FabricObject | null = null;
        if (il.mask === "circle") {
          clip = new fabric.Ellipse({ rx: iw / 2, ry: ih / 2, originX: "center", originY: "center" });
        } else if (il.mask === "rounded") {
          const r = Math.min(iw, ih) * 0.12;
          clip = new fabric.Rect({ width: iw, height: ih, rx: r, ry: r, originX: "center", originY: "center" });
        } else {
          const d = ICON_PATHS[il.mask];
          if (d) {
            clip = new fabric.Path(d, { originX: "center", originY: "center" });
            clip.scaleX = iw / 100;
            clip.scaleY = ih / 100;
          }
        }
        if (clip) img.clipPath = clip;
      } else if (il.radius && il.radius > 0) {
        // A plain rounded photo, with no mask — G-07's grid cells and Canva's
        // "round the corners" both land here. The radius is in CANVAS pixels
        // and the clip lives in the image's own pixels, so it is converted by
        // the same scale the image is about to be drawn at, or a 12 px corner
        // on a big photo would come out invisible.
        const iw = img.width || 1;
        const ih = img.height || 1;
        const r = Math.min(Math.min(iw, ih) / 2, il.radius * (iw / Math.max(1, il.w)));
        img.clipPath = new fabric.Rect({ width: iw, height: ih, rx: r, ry: r, originX: "center", originY: "center" });
      }
      // Scale to fit the layer dimensions.
      const sx = il.w / (img.width || 1);
      const sy = il.h / (img.height || 1);
      img.scaleX = sx;
      img.scaleY = sy;
      // Replace the placeholder in the canvas. We have to do this through
      // the live canvas instance from the closure that holds fabricRef.
      swapPlaceholder(placeholder, ring ? groupWith(img, ring, baseProps) : img, onSwap);
    }).catch(() => {
      /* D-24 (BUILDER_USER_TEST_2026-09-16): *"It opens broken. The logo layer
       * requests http://localhost:5194/logo.svg — a dead host — so every
       * template shows a grey broken-image box … First impression of the
       * flagship design tool is a broken image over the text."*
       *
       * A picture that will not load is not an error the author can fix by
       * staring at a grey rectangle. The slot says what it is and where to put
       * one, exactly like an empty slot, because to the author those two are
       * the same situation. */
      swapPlaceholder(placeholder, emptySlot(baseProps, il.w, il.h, slotCaption(il)), onSwap);
    });
    return placeholder;
  }
  if (layer.kind === "chart") {
    const ch = layer as ChartLayer;
    // Render the chart SVG to a data URL and swap it in asynchronously —
    // same placeholder pattern as image layers.
    const placeholder = new fabric.Rect({
      ...baseProps,
      width: ch.w,
      height: ch.h,
      fill: "transparent",
      stroke: "#CBD5E1",
      strokeWidth: 1,
      strokeDashArray: [4, 3],
    });
    const svg = chartToSvg(ch);
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    loadImage(dataUrl).then((img) => {
      if (!img) return;
      img.set({
        left: ch.x,
        top: ch.y,
        angle: ch.rotation || 0,
        opacity: ch.opacity ?? 1,
        visible: ch.visible !== false,
        selectable: true,
      });
      img.scaleX = ch.w / (img.width || 1);
      img.scaleY = ch.h / (img.height || 1);
      swapPlaceholder(placeholder, img, onSwap);
    }).catch(() => { /* placeholder stays visible */ });
    return placeholder;
  }
  if (layer.kind === "shape") {
    const s = layer as ShapeLayer;
    const fill = s.fill && s.fill !== "none" ? s.fill : "transparent";
    const stroke = s.stroke && s.stroke !== "none" ? s.stroke : undefined;
    const strokeWidth = s.strokeWidth ?? 0;
    // Dashed and dotted rules (G-05). The cap travels WITH the array — a
    // zero-length dash only draws a dot under a round cap, and paints nothing
    // at all without one, so the two are never set apart.
    const dashProps = {
      strokeDashArray: dashArray(s.dash, strokeWidth || 1),
      strokeLineCap: dashLineCap(s.dash),
    };
    // An icon has always been drawn from the exporter's own SVG. A PATTERNED
    // rect or ellipse joins it, because Fabric has no `<pattern>` and a
    // hand-rolled second drawing of the same texture would agree with the
    // exporter today and drift tomorrow. Everything else stays a native
    // object, which is what keeps a plain rectangle a real rectangle.
    if (s.shape === "icon" || (s.pattern && (s.shape === "rect" || s.shape === "ellipse"))) {
      const placeholder = new fabric.Rect({
        ...baseProps,
        width: s.w,
        height: s.h,
        fill: "transparent",
        stroke: "#CBD5E1",
        strokeWidth: 1,
        strokeDashArray: [4, 3],
      });
      const svg = s.shape === "icon" ? iconToSvg(s) : shapeToSvg(s);
      const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      loadImage(dataUrl).then((img) => {
        if (!img) return;
        img.set({ ...baseProps });
        img.scaleX = s.w / (img.width || 1);
        img.scaleY = s.h / (img.height || 1);
        swapPlaceholder(placeholder, img, onSwap);
      }).catch(() => { /* placeholder stays visible */ });
      return placeholder;
    }
    if (s.shape === "rect") {
      const radius = Math.max(0, Number(s.radius) || 0);
      return new fabric.Rect({
        ...baseProps,
        width: s.w,
        height: s.h,
        rx: radius,
        ry: radius,
        fill: s.gradient ? fabricGradient(s.gradient) : fill,
        stroke,
        strokeWidth,
        ...dashProps,
      });
    }
    if (s.shape === "ellipse") {
      return new fabric.Ellipse({
        ...baseProps,
        rx: s.w / 2,
        ry: s.h / 2,
        // Ellipse rect-aligned bounding box: left/top is the top-left of the
        // bounding rect, not the center.
        originX: "left",
        originY: "top",
        fill: s.gradient ? fabricGradient(s.gradient) : fill,
        stroke,
        strokeWidth,
        ...dashProps,
      });
    }
    if (s.shape === "line") {
      /**
       * WHY A DOTTED RULE CAME OUT SOLID (parity D-4).
       *
       * A line with no outline width set is drawn 2 px thick — `strokeWidth ||
       * 2` — but its dash pattern was measured from a DIFFERENT number,
       * `strokeWidth || 1`. So a dotted rule asked for dots 1 px across every
       * 2 px and got dots 2 px across every 2 px: the ink touched, and three
       * fill-in rules on design 10's gift certificate came out as three solid
       * lines. Dashed had the same disease, milder.
       *
       * ONE width, named once, used for both. It is the whole fix, and it is
       * the reason `dashProps` above is not used here.
       *
       * The line also gets `baseProps` now. It was the only branch without
       * them, so a rotated or hidden rule was drawn upright and visible — a
       * second, quieter defect the dash hunt turned up.
       */
      const lineW = strokeWidth || 2;
      // `left`/`top` are deliberately NOT passed: a Line derives them from its
      // two points and the stroke's own overhang, and handing it the layer's x
      // and y would shift every rule by half its width.
      const { left: _l, top: _t, ...lineProps } = baseProps;
      return new fabric.Line(
        [s.x, s.y, s.x + s.w, s.y + s.h],
        {
          ...lineProps,
          stroke: stroke || FALLBACK.primary,
          strokeWidth: lineW,
          strokeDashArray: dashArray(s.dash, lineW),
          strokeLineCap: dashLineCap(s.dash),
        }
      );
    }
  }
  return null;
}
