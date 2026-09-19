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
  DEFAULT_FONTS, GRADIENT_COORDS, ICON_PATHS, iconToSvg, chartToSvg, textLayerSvg,
  type ChartLayer, type GradientSpec, type ImageLayer, type Layer,
  type ShapeLayer, type TextLayer,
} from "./scene";
import { applyCase, dashArray, dashLineCap } from "./textEffects";
import { NEUTRAL_BRAND_KIT } from "../../../lib/brandKit";

/** Only ever reached by a scene that carries no colour of its own. */
const FALLBACK = NEUTRAL_BRAND_KIT.colours;


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
  const baseProps = {
    left: layer.x,
    top: layer.y,
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
    const svgText = textLayerSvg(t);
    if (svgText) {
      const placeholder = new fabric.Rect({
        ...baseProps, width: t.w, height: svgText.h,
        fill: "transparent", stroke: "#CBD5E1", strokeWidth: 1, strokeDashArray: [4, 3],
      });
      const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText.svg)}`;
      fabric.FabricImage.fromURL(dataUrl).then((img) => {
        if (!img) return;
        img.set({ ...baseProps });
        img.scaleX = svgText.w / (img.width || 1);
        img.scaleY = svgText.h / (img.height || 1);
        swapPlaceholder(placeholder, img, onSwap);
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
    fabric.FabricImage.fromURL(il.src).then((img) => {
      if (!img) return;
      img.set({
        left: il.x,
        top: il.y,
        angle: il.rotation || 0,
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
          const d = ICON_PATHS[il.mask === "arch" ? "arch" : il.mask];
          if (d) {
            clip = new fabric.Path(d, { originX: "center", originY: "center" });
            clip.scaleX = iw / 100;
            clip.scaleY = ih / 100;
          }
        }
        if (clip) img.clipPath = clip;
      }
      // Scale to fit the layer dimensions.
      const sx = il.w / (img.width || 1);
      const sy = il.h / (img.height || 1);
      img.scaleX = sx;
      img.scaleY = sy;
      // Replace the placeholder in the canvas. We have to do this through
      // the live canvas instance from the closure that holds fabricRef.
      swapPlaceholder(placeholder, img, onSwap);
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
    fabric.FabricImage.fromURL(dataUrl).then((img) => {
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
    if (s.shape === "icon") {
      // Same SVG the server emits, swapped in as an image — guarantees the
      // editor and export show the identical glyph.
      const placeholder = new fabric.Rect({
        ...baseProps,
        width: s.w,
        height: s.h,
        fill: "transparent",
        stroke: "#CBD5E1",
        strokeWidth: 1,
        strokeDashArray: [4, 3],
      });
      const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconToSvg(s))}`;
      fabric.FabricImage.fromURL(dataUrl).then((img) => {
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
      return new fabric.Line(
        [s.x, s.y, s.x + s.w, s.y + s.h],
        {
          stroke: stroke || FALLBACK.primary,
          strokeWidth: strokeWidth || 2,
          ...dashProps,
          selectable: true,
          opacity: layer.opacity ?? 1,
          visible: layer.visible !== false,
        }
      );
    }
  }
  return null;
}
