/**
 * builder/adapters/mybrand/PixelCanvas.tsx — the CENTRE pane of the shared shell.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §5 step 5. Everywhere else in the builder
 * the middle column is builder/Canvas.tsx, a page of sections rendered by
 * builder/render.ts. My Brand's middle column is this instead: one Fabric
 * canvas, absolute pixels, drag handles and snap guides.
 *
 * Nothing else changes — same modal, same pane on the left, same inspector on
 * the right, same single undo in the header. That is the whole of "the studio
 * moved onto the shared shell and kept its pixel canvas".
 *
 * ── WHO OWNS WHAT ─────────────────────────────────────────────────────────
 * This component owns the Fabric instance, the zoom, and the two-way bridge
 * between a Fabric object and a layer id. It owns NO state that survives a
 * render: every edit leaves through `onLayerGeometry`, so the scene, the undo
 * stack and the save all live in StudioBuilder, and a Fabric bug can never
 * become a lost design.
 */
import {
  forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState,
  type ReactNode,
} from "react";
import * as fabric from "fabric";
import { Maximize, ZoomIn, ZoomOut } from "lucide-react";
import { layerToFabricObject, fabricGradient } from "./fabricBridge";
import { isTransparent, type BaseLayer, type CanvasDoc, type Layer, type TextLayer } from "./scene";

export interface PixelCanvasHandle {
  /** A PNG/JPEG data URI of the scene at 1:1, whatever the zoom is. */
  toDataURL: (format: "png" | "jpg") => string | null;
  /** The scene as SVG text — vector, for print shops and sign makers. */
  toSVG: () => string | null;
  /** Re-fit the design to the visible area. */
  fit: () => void;
}

export interface PixelCanvasProps {
  doc: CanvasDoc;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /**
   * A drag or a resize finished, or someone typed on the canvas. The parent
   * decides what that means for the scene and the undo stack.
   */
  onLayerGeometry: (id: string, patch: Partial<Layer>) => void;
  /** Rendered in the top-left corner, over the paper. */
  toolbar?: ReactNode;
}

export const PixelCanvas = forwardRef<PixelCanvasHandle, PixelCanvasProps>(function PixelCanvas(
  { doc, selectedId, onSelect, onLayerGeometry, toolbar },
  ref,
) {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);

  // layer.id → Fabric object, and back. WeakMap the other way so the GC clears
  // entries when an object leaves the scene.
  const objectsByIdRef = useRef<Map<string, fabric.FabricObject>>(new Map());
  const idByObjectRef = useRef<WeakMap<fabric.FabricObject, string>>(new WeakMap());
  // Suppresses canvas → parent sync while WE are mutating the canvas.
  const suppressSyncRef = useRef(false);

  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;
  const onGeometryRef = useRef(onLayerGeometry);
  onGeometryRef.current = onLayerGeometry;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const [zoom, setZoom] = useState(1);
  const [guides, setGuides] = useState<{ v: number | null; h: number | null }>({ v: null, h: null });
  const guidesRef = useRef(guides);
  guidesRef.current = guides;
  // The snap handler is bound once but needs the CURRENT dimensions.
  const docDimsRef = useRef({ w: doc.width, h: doc.height });

  /** One Fabric object, read back into a layer patch. */
  const syncOne = useCallback((id: string, obj: fabric.FabricObject, layer: Layer | undefined) => {
    if (!layer) return;
    const w = (obj.width ?? layer.w) * (obj.scaleX ?? 1);
    const h = (obj.height ?? layer.h) * (obj.scaleY ?? 1);
    const updates: Partial<BaseLayer> = {
      x: Math.round(obj.left ?? layer.x),
      y: Math.round(obj.top ?? layer.y),
      w: Math.round(w),
      h: Math.round(h),
      rotation: Math.round((((obj.angle ?? layer.rotation ?? 0) % 360) + 360) % 360),
    };
    if (layer.kind === "text" && obj instanceof fabric.IText) {
      // Fabric resizes type by SCALE; bake it into the font size so future
      // edits do not compound, then reset the scale to 1.
      const size = Math.max(6, Math.round(((layer as TextLayer).size ?? 24) * (obj.scaleY ?? 1)));
      suppressSyncRef.current = true;
      obj.set({ scaleX: 1, scaleY: 1, width: w, height: h });
      fabricRef.current?.requestRenderAll();
      suppressSyncRef.current = false;
      onGeometryRef.current(id, { ...updates, size, content: obj.text ?? (layer as TextLayer).content } as Partial<Layer>);
      return;
    }
    onGeometryRef.current(id, updates as Partial<Layer>);
  }, []);

  const docRef = useRef(doc);
  docRef.current = doc;

  /* ── Create the canvas once, while the modal is open ───────────────────── */
  useEffect(() => {
    if (!canvasElRef.current || fabricRef.current) return;
    const c = new fabric.Canvas(canvasElRef.current, {
      width: doc.width,
      height: doc.height,
      backgroundColor: doc.background_color || "#FFFFFF",
      preserveObjectStacking: true,
      selection: true,
    });
    fabricRef.current = c;
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__fabricCanvas = c;
    }

    const pick = (e: unknown) => {
      const obj = (e as { selected?: fabric.FabricObject[] }).selected?.[0];
      if (!obj) return;
      const id = idByObjectRef.current.get(obj);
      if (id) onSelectRef.current(id);
    };
    c.on("selection:created", pick);
    c.on("selection:updated", pick);
    c.on("selection:cleared", () => onSelectRef.current(null));

    c.on("object:modified", (e) => {
      if (suppressSyncRef.current) return;
      if (guidesRef.current.v !== null || guidesRef.current.h !== null) setGuides({ v: null, h: null });
      const obj = e.target as fabric.FabricObject | undefined;
      if (!obj) return;
      const id = idByObjectRef.current.get(obj);
      if (!id) return;
      syncOne(id, obj, docRef.current.layers.find((l) => l.id === id));
    });

    // Snap to the canvas edges and centre lines within 8 canvas px, and show
    // the guide while it holds.
    const SNAP = 8;
    c.on("object:moving", (e) => {
      const obj = e.target as fabric.FabricObject | undefined;
      if (!obj) return;
      const { w: W, h: H } = docDimsRef.current;
      const ow = (obj.width ?? 0) * (obj.scaleX ?? 1);
      const oh = (obj.height ?? 0) * (obj.scaleY ?? 1);
      let v: number | null = null;
      let h: number | null = null;
      for (const line of [0, W / 2, W]) {
        if (Math.abs((obj.left ?? 0) - line) < SNAP) { obj.set({ left: line }); v = line; break; }
        if (Math.abs((obj.left ?? 0) + ow / 2 - line) < SNAP) { obj.set({ left: line - ow / 2 }); v = line; break; }
        if (Math.abs((obj.left ?? 0) + ow - line) < SNAP) { obj.set({ left: line - ow }); v = line; break; }
      }
      for (const line of [0, H / 2, H]) {
        if (Math.abs((obj.top ?? 0) - line) < SNAP) { obj.set({ top: line }); h = line; break; }
        if (Math.abs((obj.top ?? 0) + oh / 2 - line) < SNAP) { obj.set({ top: line - oh / 2 }); h = line; break; }
        if (Math.abs((obj.top ?? 0) + oh - line) < SNAP) { obj.set({ top: line - oh }); h = line; break; }
      }
      if (guidesRef.current.v !== v || guidesRef.current.h !== h) setGuides({ v, h });
    });

    return () => {
      try { c.dispose(); } catch { /* ignore disposal races during HMR */ }
      fabricRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Paint the whole scene. Deterministic, so it is safe after every edit ── */
  //
  // IT DOES NOT SIZE THE ELEMENT. The <canvas> is exactly one thing wide — the
  // design's width times the zoom — and the zoom effect below is the only
  // writer of that. The code this was lifted from set it here TOO, at 1:1, so
  // every edit that was not a zoom or a resize left a 1080px canvas drawing a
  // 648px design: it overflowed its own paper, and clicking a layer near the
  // middle of the page selected whatever Fabric thought was under a pointer
  // 432px out. Found on the 2026-09-16 walk by dragging a heading and watching
  // nothing move.
  const render = useCallback((scene: CanvasDoc) => {
    const c = fabricRef.current;
    if (!c) return;
    suppressSyncRef.current = true;
    c.clear();
    c.backgroundColor = isTransparent(scene)
      ? ""
      : scene.background_gradient
        ? (fabricGradient(scene.background_gradient) as unknown as string)
        : (scene.background_color || "#FFFFFF");
    objectsByIdRef.current.clear();
    idByObjectRef.current = new WeakMap();
    for (const layer of scene.layers) {
      const obj = layerToFabricObject(layer, (swapped) => {
        // An image or chart resolved: re-register it so dragging it persists.
        objectsByIdRef.current.set(layer.id, swapped);
        idByObjectRef.current.set(swapped, layer.id);
        if (selectedIdRef.current === layer.id) c.setActiveObject(swapped);
      });
      if (!obj) continue;
      objectsByIdRef.current.set(layer.id, obj);
      idByObjectRef.current.set(obj, layer.id);
      if (layer.visible === false) obj.set({ visible: false });
      c.add(obj);
    }
    // The rebuild wipes Fabric's selection even though the inspector still
    // shows the layer — put it back, or the handles vanish after every edit.
    const selId = selectedIdRef.current;
    if (selId) {
      const obj = objectsByIdRef.current.get(selId);
      if (obj && obj.selectable !== false) c.setActiveObject(obj);
    }
    c.calcOffset();   // fresh geometry → fresh pointer offset, or clicks drift
    c.requestRenderAll();
    suppressSyncRef.current = false;
  }, []);

  useEffect(() => { render(doc); }, [doc, render]);
  useEffect(() => { docDimsRef.current = { w: doc.width, h: doc.height }; }, [doc.width, doc.height]);

  // Keep Fabric's own idea of the selection in step when the INSPECTOR or the
  // layer list moves it, not the canvas.
  useEffect(() => {
    const c = fabricRef.current;
    if (!c) return;
    if (!selectedId) { c.discardActiveObject(); c.requestRenderAll(); return; }
    const obj = objectsByIdRef.current.get(selectedId);
    if (obj && c.getActiveObject() !== obj && obj.selectable !== false) {
      c.setActiveObject(obj);
      c.requestRenderAll();
    }
  }, [selectedId, doc]);

  /* ── Zoom ──────────────────────────────────────────────────────────────── */
  const fit = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    const availW = host.clientWidth - 48;
    const availH = host.clientHeight - 48;
    if (availW <= 0 || availH <= 0) return;
    const z = Math.min(availW / doc.width, availH / doc.height, 1);
    setZoom(Math.max(0.05, Math.round(z * 100) / 100));
  }, [doc.width, doc.height]);

  useEffect(() => {
    const t = setTimeout(fit, 50);   // let the modal lay out first
    return () => clearTimeout(t);
  }, [fit]);

  useEffect(() => {
    const c = fabricRef.current;
    if (!c) return;
    c.setZoom(zoom);
    c.setDimensions({ width: doc.width * zoom, height: doc.height * zoom });
    // Re-measure twice: now, and once the layout settles. A stale offset
    // silently breaks click-to-select, which reads as "the canvas is dead".
    c.calcOffset();
    const t = setTimeout(() => { try { c.calcOffset(); } catch { /* disposed */ } }, 80);
    c.requestRenderAll();
    return () => clearTimeout(t);
  }, [zoom, doc.width, doc.height]);

  /* ── Export, at 1:1 whatever the zoom ──────────────────────────────────── */
  const withFullSize = useCallback(<T,>(fn: (c: fabric.Canvas) => T): T | null => {
    const c = fabricRef.current;
    if (!c) return null;
    const prevZoom = c.getZoom();
    c.setZoom(1);
    c.setDimensions({ width: doc.width, height: doc.height });
    try {
      return fn(c);
    } finally {
      c.setZoom(prevZoom);
      c.setDimensions({ width: doc.width * prevZoom, height: doc.height * prevZoom });
      c.calcOffset();
      c.requestRenderAll();
    }
  }, [doc.width, doc.height]);

  useImperativeHandle(ref, (): PixelCanvasHandle => ({
    toDataURL: (format) => withFullSize((c) => {
      // JPEG has no alpha; a transparent design would composite onto black.
      const prevBg = c.backgroundColor;
      if (format === "jpg" && isTransparent(doc)) c.backgroundColor = "#FFFFFF";
      const url = c.toDataURL({
        format: format === "jpg" ? "jpeg" : "png",
        quality: format === "jpg" ? 0.95 : 1,
        multiplier: 1,
      });
      c.backgroundColor = prevBg;
      return url;
    }),
    toSVG: () => withFullSize((c) => c.toSVG()),
    fit,
  }), [withFullSize, fit, doc]);

  return (
    <div className="relative flex h-full min-w-0 flex-col">
      {toolbar && <div className="absolute left-4 top-3 z-10">{toolbar}</div>}

      <div className="absolute right-4 top-3 z-10 flex items-center gap-1 rounded border border-slate-200 bg-white px-1 py-0.5 shadow-sm">
        <button type="button" onClick={() => setZoom((z) => Math.max(0.05, Math.round((z - 0.1) * 100) / 100))}
          title="Zoom out" aria-label="Zoom out" className="rounded p-1.5 hover:bg-slate-100">
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <span className="px-1 text-[11px] tabular-nums text-slate-600">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom((z) => Math.min(4, Math.round((z + 0.1) * 100) / 100))}
          title="Zoom in" aria-label="Zoom in" className="rounded p-1.5 hover:bg-slate-100">
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={fit} title="Fit the whole design on screen" aria-label="Fit the whole design on screen"
          className="rounded p-1.5 hover:bg-slate-100">
          <Maximize className="h-3.5 w-3.5" />
        </button>
      </div>

      <div ref={hostRef} className="flex flex-1 overflow-auto p-6">
        <div
          className="relative m-auto flex-shrink-0 shadow-lg"
          data-studio-paper
          style={{
            width: doc.width * zoom,
            height: doc.height * zoom,
            backgroundColor: "#fff",
            // A checkerboard shows through wherever a logo is transparent.
            backgroundImage: isTransparent(doc)
              ? "conic-gradient(#e2e8f0 90deg, transparent 90deg 180deg, #e2e8f0 180deg 270deg, transparent 270deg)"
              : undefined,
            backgroundSize: isTransparent(doc) ? "20px 20px" : undefined,
          }}
        >
          <canvas ref={canvasElRef} />
          {guides.v !== null && (
            <div className="pointer-events-none absolute bottom-0 top-0 w-px bg-pink-500" style={{ left: guides.v * zoom }} />
          )}
          {guides.h !== null && (
            <div className="pointer-events-none absolute left-0 right-0 h-px bg-pink-500" style={{ top: guides.h * zoom }} />
          )}
        </div>
      </div>
    </div>
  );
});

export default PixelCanvas;
