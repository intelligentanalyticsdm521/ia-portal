// TemplateStudioEditorModal — My Brand · Template Studio design editor.
//
// The Fabric.js canvas editor, re-hosted from the old full-page
// TemplateStudioPage into the canonical IadmModal (F-107 size "info",
// 1200×80vh) per the portal skeleton: all create/edit flows live in
// centered modals launched from a library page.
//
// In-house creative editor backed by Fabric.js. The whole point is to keep
// the canvas authoring experience inside the portal — no Placid / Canva /
// Bannerbear embeds — while staying portable: Fabric.js is just a primitive
// HTML canvas library, not a vendor SaaS surface, so it cleanly satisfies
// Brandon's "no 3rd-party UI SDKs" rule (same reason chart.js / recharts /
// lucide ship in the portal today).
//
// CRUD contract (canon: SparkTemplateEditorModal):
//   { open, onClose, designId: string | null, templateId?, onChanged? }
//   - designId null + templateId null  → blank new design
//   - designId null + templateId set   → new design seeded from a template
//   - designId set                     → edit an existing saved design
//   onChanged fires after every successful persist so the parent library
//   refreshes. NOTE: unlike the one-shot form editors, Save does NOT close
//   this modal — design work is iterative and the 2s auto-save on rename
//   depends on the editor staying open.
//
// API surface (LUMEN-API My Brand, wave 1 — no DELETE route exists):
//   GET    /api/v1/my-brand/templates/:id
//   POST   /api/v1/my-brand/designs           { templateId?, canvas, name }
//   GET    /api/v1/my-brand/designs/:id
//   PUT    /api/v1/my-brand/designs/:id       { canvas, name }
//   POST   /api/v1/my-brand/designs/:id/export { format, width, height }
//
// Canvas JSON shape (matches templateStudio.js renderer exactly):
//   { version: 1, width, height, background_color, layers: [...] }
//   layer kinds: text | image | shape (rect | ellipse | line)

import {
  useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import * as fabric from "fabric";
import {
  AlertTriangle, AlignCenter, AlignLeft, AlignRight, BarChart3, Bold,
  ChevronDown, ChevronUp, Circle, Copy, Download, Eye, EyeOff, FileImage,
  Image as ImageIcon, Layers, Maximize, Minus, Plus, RotateCw, Save,
  Scaling, Send, Square, Trash2, Type as TypeIcon, X, ZoomIn, ZoomOut,
} from "lucide-react";
import { IadmModal, IadmButton } from "../IadmModal";
import { useLumenApi } from "../../hooks/useLumenApi";
import { useProductTier, tierMeets } from "../../hooks/useProductTier";

// ────────────────────────────────────────────────────────────────────────────
// Canvas JSON types — match the backend renderer in
// LUMEN-API/src/lib/myBrand/templateStudio.js. Kept slightly lenient on
// extra fields so future renderer additions (shadow, blendMode, etc.)
// pass through without breaking. Exported so the library page can type its
// gallery lists off the same DTOs.
// ────────────────────────────────────────────────────────────────────────────

export interface BaseLayer {
  id: string;
  kind: "text" | "image" | "shape" | "chart";
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  opacity?: number;
  visible?: boolean;
}

export interface TextLayer extends BaseLayer {
  kind: "text";
  content: string;
  font?: string;
  size?: number;
  color?: string;
  weight?: string;
  align?: "left" | "center" | "right";
  lineHeight?: number;
}

export interface ImageLayer extends BaseLayer {
  kind: "image";
  blob_ref?: string | null;
  src?: string | null;  // local dataURL/URL for in-editor display
}

export interface ShapeLayer extends BaseLayer {
  kind: "shape";
  shape: "rect" | "ellipse" | "line";
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

// L3 (locked 2026-07-22): chart element for infographics — enter numbers →
// bar/donut/line rendered in brand colors, pure code (no chart.js). The
// server renderer (templateStudio.js emitChartLayer) draws the SAME
// geometry for exports — keep the two in lockstep.
export interface ChartLayer extends BaseLayer {
  kind: "chart";
  chart: "bar" | "donut" | "line";
  values: Array<{ label?: string; value: number }>;
  colors?: string[];
}

export type Layer = TextLayer | ImageLayer | ShapeLayer | ChartLayer;

export interface CanvasDoc {
  version: 1;
  width: number;
  height: number;
  background_color?: string | null;
  layers: Layer[];
}

export interface TemplateDto {
  template_id: string;
  tenant_id: string | null;
  name: string;
  kind: string;
  canvas: CanvasDoc | null;
  thumbnail_blob_ref: string | null;
  tags: string[];
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface DesignDto {
  design_id: string;
  tenant_id: string;
  template_id: string | null;
  name: string | null;
  canvas: CanvasDoc | null;
  export_asset_id: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExportResult {
  assetId: string;
  blobRef: string;
  byteSize: number;
  dimensions: string;
  width: number;
  height: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

const DEFAULT_FONTS = [
  "Inter, Helvetica, Arial, sans-serif",
  "Georgia, serif",
  "Courier New, monospace",
  "Impact, sans-serif",
];

const BLANK_CANVAS_DEFAULTS: CanvasDoc = {
  version: 1,
  width: 1080,
  height: 1080,
  background_color: "#FFFFFF",
  layers: [],
};

function emptyCanvas(width = 1080, height = 1080): CanvasDoc {
  return {
    version: 1,
    width,
    height,
    background_color: "#FFFFFF",
    layers: [],
  };
}

// ── Platform size presets + Smart Resize (re-cut §8b, Pro+) ────────────────
// One design → every platform size. Deterministic anchor-based relayout:
// content scales uniformly; layers hugging an edge keep their (scaled)
// margin to that edge, full-bleed bands re-stretch, everything else keeps
// its proportional center. No model call — this is a bucket-2 Smart Tool.
export const SIZE_PRESETS = [
  { key: "ig_post",       label: "Instagram post",   w: 1080, h: 1080 },
  { key: "ig_story",      label: "Instagram story",  w: 1080, h: 1920 },
  { key: "fb_post",       label: "Facebook post",    w: 1200, h: 630 },
  { key: "fb_cover",      label: "Facebook cover",   w: 820,  h: 312 },
  { key: "li_post",       label: "LinkedIn post",    w: 1200, h: 627 },
  { key: "li_banner",     label: "LinkedIn banner",  w: 1584, h: 396 },
  { key: "flyer",         label: "Flyer (Letter)",   w: 1275, h: 1650 },
  { key: "business_card", label: "Business card",    w: 1050, h: 600 },
  { key: "email_header",  label: "Email header",     w: 1200, h: 400 },
] as const;

const EDGE_ZONE = 0.18; // a layer whose center sits in the outer 18% is edge-anchored

export function smartResize(doc: CanvasDoc, newW: number, newH: number): CanvasDoc {
  const W = doc.width, H = doc.height;
  if (W <= 0 || H <= 0 || newW <= 0 || newH <= 0) return doc;
  const s = Math.min(newW / W, newH / H); // uniform content scale
  const layers = doc.layers.map((l) => {
    const w = l.w * s;
    const h = l.h * s;
    const cx = l.x + l.w / 2;
    const cy = l.y + l.h / 2;
    // Full-bleed bands re-stretch along the axis they span.
    const spansW = l.w >= W * 0.98;
    const spansH = l.h >= H * 0.98;
    // Horizontal placement.
    let newCx: number;
    if (spansW) newCx = newW / 2;
    else if (cx < W * EDGE_ZONE) newCx = cx * s;                    // keep left margin
    else if (cx > W * (1 - EDGE_ZONE)) newCx = newW - (W - cx) * s; // keep right margin
    else newCx = (cx / W) * newW;                                   // proportional
    // Vertical placement.
    let newCy: number;
    if (spansH) newCy = newH / 2;
    else if (cy < H * EDGE_ZONE) newCy = cy * s;
    else if (cy > H * (1 - EDGE_ZONE)) newCy = newH - (H - cy) * s;
    else newCy = (cy / H) * newH;
    const outW = spansW ? newW : w;
    const outH = spansH ? newH : h;
    const next: Layer = {
      ...JSON.parse(JSON.stringify(l)),
      x: Math.round(newCx - outW / 2),
      y: Math.round(newCy - outH / 2),
      w: Math.round(outW),
      h: Math.round(outH),
    };
    if (next.kind === "text") {
      (next as TextLayer).size = Math.max(6, Math.round(((l as TextLayer).size ?? 24) * s));
    }
    if (next.kind === "shape" && (l as ShapeLayer).strokeWidth) {
      (next as ShapeLayer).strokeWidth = Math.max(1, Math.round((l as ShapeLayer).strokeWidth! * s));
    }
    return next;
  });
  return { ...doc, width: newW, height: newH, layers };
}

// ── Client-side chart → SVG (mirror of the server emitChartLayer) ─────────
// Renders at the layer's own w×h with origin 0,0; Fabric positions the
// resulting image. New charts default to the IA palette cycle in the
// editor; the server export resolves the cycle against the tenant's real
// brand palette, so exports are always brand-true.
const CHART_DEFAULT_CYCLE = ["#1A3A4A", "#FEC82C", "#64748B", "#94A3B8", "#CBD5E1", "#475569"];

export function chartToSvg(layer: ChartLayer): string {
  const w = layer.w, h = layer.h;
  const values = (layer.values || []).map((v) => ({
    label: String(v.label ?? ""),
    value: Math.max(0, Number(v.value) || 0),
  }));
  const cycle = layer.colors?.length ? layer.colors : CHART_DEFAULT_CYCLE;
  const color = (i: number) => cycle[i % cycle.length];
  const labelSize = Math.max(10, Math.round(Math.min(w, h) * 0.055));
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const parts: string[] = [];
  if (!values.length || w <= 0 || h <= 0) return `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>`;

  if (layer.chart === "bar") {
    const labelBand = labelSize * 1.6;
    const plotH = Math.max(1, h - labelBand);
    const max = Math.max(...values.map((v) => v.value), 1);
    const slot = w / values.length;
    const barW = slot * 0.68;
    values.forEach((v, i) => {
      const barH = (v.value / max) * plotH;
      const bx = i * slot + (slot - barW) / 2;
      parts.push(`<rect x="${bx}" y="${plotH - barH}" width="${barW}" height="${barH}" rx="${Math.min(6, barW / 6)}" fill="${color(i)}" />`);
      if (v.label) parts.push(`<text x="${bx + barW / 2}" y="${plotH + labelSize * 1.15}" font-family="sans-serif" font-size="${labelSize}" fill="#111827" text-anchor="middle">${esc(v.label)}</text>`);
    });
  } else if (layer.chart === "donut") {
    const cx = w / 2, cy = h / 2;
    const r = Math.min(w, h) / 2 * 0.92;
    const ring = r * 0.38;
    const rMid = r - ring / 2;
    const total = values.reduce((a, v) => a + v.value, 0) || 1;
    const circ = 2 * Math.PI * rMid;
    let offset = 0;
    values.forEach((v, i) => {
      const frac = v.value / total;
      const dash = Math.max(0, frac * circ - 1.5);
      parts.push(`<circle cx="${cx}" cy="${cy}" r="${rMid}" fill="none" stroke="${color(i)}" stroke-width="${ring}" stroke-dasharray="${dash} ${circ - dash}" stroke-dashoffset="${-offset * circ}" transform="rotate(-90 ${cx} ${cy})" />`);
      offset += frac;
    });
  } else {
    const hasLabels = values.some((v) => v.label);
    const labelBand = hasLabels ? labelSize * 1.6 : 0;
    const plotH = Math.max(1, h - labelBand);
    const max = Math.max(...values.map((v) => v.value), 1);
    const stepX = values.length > 1 ? w / (values.length - 1) : 0;
    const pts = values.map((v, i) => ({
      px: values.length > 1 ? i * stepX : w / 2,
      py: plotH - (v.value / max) * plotH * 0.92,
    }));
    parts.push(`<polyline points="${pts.map((p) => `${p.px},${p.py}`).join(" ")}" fill="none" stroke="${color(0)}" stroke-width="${Math.max(2, Math.round(Math.min(w, h) * 0.012))}" stroke-linejoin="round" stroke-linecap="round" />`);
    pts.forEach((p, i) => {
      parts.push(`<circle cx="${p.px}" cy="${p.py}" r="${Math.max(3, Math.round(Math.min(w, h) * 0.016))}" fill="${color(0)}" />`);
      if (values[i].label) parts.push(`<text x="${p.px}" y="${plotH + labelSize * 1.15}" font-family="sans-serif" font-size="${labelSize}" fill="#111827" text-anchor="middle">${esc(values[i].label)}</text>`);
    });
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${parts.join("")}</svg>`;
}

// ────────────────────────────────────────────────────────────────────────────
// Editor modal
// ────────────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  /** Existing design to edit, or null for create-new. */
  designId: string | null;
  /** When creating (designId null), optional template to seed the canvas. */
  templateId?: string | null;
  /** Called after every successful persist so the parent library refreshes. */
  onChanged?: () => void;
}

export function TemplateStudioEditorModal({
  open, onClose, designId, templateId = null, onChanged,
}: Props) {
  const { get, post, put, ready } = useLumenApi();
  const navigate = useNavigate();
  // Smart Resize is a Pro+ Smart Tool (re-cut §8b L2 lock). Same tier
  // source as the Social Hub calendar grid gate.
  const { tier } = useProductTier("spark");
  const hasSmartResize = tierMeets(tier, "pro");

  // ── State ─────────────────────────────────────────────────────────────────
  const [currentDesignId, setCurrentDesignId] = useState<string | null>(designId);
  const [designName, setDesignName] = useState<string>("Untitled design");
  const [canvasDoc, setCanvasDoc] = useState<CanvasDoc>(BLANK_CANVAS_DEFAULTS);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const [exporting, setExporting] = useState<"png" | "jpg" | "asset" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  // Export picker — IadmModal size="nav" replaces the old absolute dropdown.
  const [exportPickerOpen, setExportPickerOpen] = useState(false);

  const [zoom, setZoom] = useState(1);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Smart Resize picker modal.
  const [resizeOpen, setResizeOpen] = useState(false);

  // Snap guides — canvas-space coordinates of the active vertical/horizontal
  // guide line while an object is being dragged, null when not snapping.
  const [guides, setGuides] = useState<{ v: number | null; h: number | null }>({ v: null, h: null });
  const guidesRef = useRef(guides);
  guidesRef.current = guides;
  // Fabric's object:moving handler is bound once (canvas-init effect) but
  // needs the CURRENT doc dimensions — a ref avoids re-binding per change.
  const docDimsRef = useRef({ w: BLANK_CANVAS_DEFAULTS.width, h: BLANK_CANVAS_DEFAULTS.height });

  // ── Fabric.js canvas ──────────────────────────────────────────────────────
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  // Maps layer.id → Fabric object so layer-list + toolbar can reach into the
  // currently-rendered scene without a full canvas walk on every keystroke.
  const objectsByIdRef = useRef<Map<string, fabric.FabricObject>>(new Map());
  // Two-way bridge: when Fabric fires events (mousedown, modified, etc.) we
  // need to find which layer.id was hit. WeakMap so the GC clears entries
  // automatically when an object leaves the scene.
  const idByObjectRef = useRef<WeakMap<fabric.FabricObject, string>>(new WeakMap());
  // Suppresses the canvas → state sync briefly while we mutate state from
  // outside the canvas (e.g. add layer button, undo). Prevents the
  // "object:modified" handler from clobbering the value we just set.
  const suppressSyncRef = useRef(false);

  // ── Undo stack — snapshot the canvasDoc before each mutation ─────────────
  const undoStackRef = useRef<CanvasDoc[]>([]);

  function pushUndoSnapshot(prev: CanvasDoc) {
    undoStackRef.current.push(JSON.parse(JSON.stringify(prev)));
    if (undoStackRef.current.length > 50) undoStackRef.current.shift();
  }

  // ── Load record — gated on open && ready (canon CRUD contract) ───────────
  // designId → edit existing design; templateId → seed a NEW design from a
  // template (deep-cloned so edits never mutate the template ref); neither →
  // blank canvas defaults.
  useEffect(() => {
    if (!open || !ready) return;
    setSaveError(null);
    setExportError(null);
    if (!designId && !templateId) {
      setCanvasDoc(emptyCanvas());
      setCurrentDesignId(null);
      setDesignName("Untitled design");
      undoStackRef.current = [];
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        if (designId) {
          const d = await get<DesignDto>(`/api/v1/my-brand/designs/${designId}`);
          if (cancelled || !d?.canvas) return;
          const canvas: CanvasDoc = JSON.parse(JSON.stringify(d.canvas));
          // Assign ids to any layers that omit them — older rows may not
          // include them, but the editor needs them for selection.
          canvas.layers = canvas.layers.map((l) => l.id ? l : { ...l, id: uid(l.kind) });
          setCanvasDoc(canvas);
          setCurrentDesignId(d.design_id);
          setDesignName(d.name || "Untitled design");
          undoStackRef.current = [];
        } else if (templateId) {
          // Pull the canvas via the dedicated GET so we don't depend on the
          // gallery list shape (which may omit `canvas` for thumbnail views).
          const tpl = await get<TemplateDto>(`/api/v1/my-brand/templates/${templateId}`);
          if (cancelled || !tpl?.canvas) return;
          const canvas: CanvasDoc = JSON.parse(JSON.stringify(tpl.canvas));
          canvas.layers = canvas.layers.map((l) => l.id ? l : { ...l, id: uid(l.kind) });
          setCanvasDoc(canvas);
          setCurrentDesignId(null);
          setDesignName(tpl.name);
          undoStackRef.current = [];
        }
      } catch (e) {
        if (!cancelled) setSaveError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [open, ready, designId, templateId, get]);

  // ── Initialize Fabric canvas when the modal opens ────────────────────────
  useEffect(() => {
    if (!open) return;
    if (!canvasElRef.current) return;
    if (fabricRef.current) return;
    const c = new fabric.Canvas(canvasElRef.current, {
      width: BLANK_CANVAS_DEFAULTS.width,
      height: BLANK_CANVAS_DEFAULTS.height,
      backgroundColor: BLANK_CANVAS_DEFAULTS.background_color || "#FFFFFF",
      preserveObjectStacking: true,
      selection: true,
    });
    fabricRef.current = c;

    // Selection + modification handlers — keep the React state in sync with
    // Fabric's view of the world. We READ from Fabric only when the user has
    // finished a manipulation (object:modified), not on every mouse move,
    // because re-rendering React mid-drag tanks performance.
    c.on("selection:created", (e) => {
      const obj = (e as { selected?: fabric.FabricObject[] }).selected?.[0];
      if (!obj) return;
      const id = idByObjectRef.current.get(obj);
      if (id) setSelectedId(id);
    });
    c.on("selection:updated", (e) => {
      const obj = (e as { selected?: fabric.FabricObject[] }).selected?.[0];
      if (!obj) return;
      const id = idByObjectRef.current.get(obj);
      if (id) setSelectedId(id);
    });
    c.on("selection:cleared", () => setSelectedId(null));

    c.on("object:modified", (e) => {
      if (suppressSyncRef.current) return;
      if (guidesRef.current.v !== null || guidesRef.current.h !== null) {
        setGuides({ v: null, h: null });
      }
      const obj = e.target as fabric.FabricObject | undefined;
      if (!obj) return;
      const id = idByObjectRef.current.get(obj);
      if (!id) return;
      syncOneLayerFromFabric(id, obj);
    });

    // Snap guides (bucket-1, re-cut §8b): while dragging, snap the object's
    // edges/center to the canvas edges and center lines within an 8px
    // (canvas-space) threshold, and surface guide lines via React state.
    const SNAP = 8;
    c.on("object:moving", (e) => {
      const obj = e.target as fabric.FabricObject | undefined;
      if (!obj) return;
      const { w: W, h: H } = docDimsRef.current;
      const ow = (obj.width ?? 0) * (obj.scaleX ?? 1);
      const oh = (obj.height ?? 0) * (obj.scaleY ?? 1);
      let v: number | null = null;
      let h: number | null = null;
      // Horizontal snap: left edge, center, right edge → 0, W/2, W.
      for (const line of [0, W / 2, W]) {
        if (Math.abs((obj.left ?? 0) - line) < SNAP) { obj.set({ left: line }); v = line; break; }
        if (Math.abs((obj.left ?? 0) + ow / 2 - line) < SNAP) { obj.set({ left: line - ow / 2 }); v = line; break; }
        if (Math.abs((obj.left ?? 0) + ow - line) < SNAP) { obj.set({ left: line - ow }); v = line; break; }
      }
      // Vertical snap: top edge, middle, bottom edge → 0, H/2, H.
      for (const line of [0, H / 2, H]) {
        if (Math.abs((obj.top ?? 0) - line) < SNAP) { obj.set({ top: line }); h = line; break; }
        if (Math.abs((obj.top ?? 0) + oh / 2 - line) < SNAP) { obj.set({ top: line - oh / 2 }); h = line; break; }
        if (Math.abs((obj.top ?? 0) + oh - line) < SNAP) { obj.set({ top: line - oh }); h = line; break; }
      }
      if (guidesRef.current.v !== v || guidesRef.current.h !== h) {
        setGuides({ v, h });
      }
    });

    return () => {
      try { c.dispose(); } catch { /* ignore disposal errors during HMR */ }
      fabricRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Sync one Fabric object back to its CanvasDoc layer ───────────────────
  const syncOneLayerFromFabric = useCallback(
    (id: string, obj: fabric.FabricObject) => {
      setCanvasDoc((prev) => {
        const idx = prev.layers.findIndex((l) => l.id === id);
        if (idx === -1) return prev;
        const layer = prev.layers[idx];
        // Use coords()/scaleX,Y to compute the displayed bounding box. Fabric
        // stores x/y as the object's top-left; for some kinds (text/IText)
        // size derives from scaleX*width, scaleY*height because Fabric drives
        // resize via scale rather than rewriting font-size.
        const w = (obj.width ?? layer.w) * (obj.scaleX ?? 1);
        const h = (obj.height ?? layer.h) * (obj.scaleY ?? 1);
        const updates: Partial<BaseLayer> = {
          x: Math.round(obj.left ?? layer.x),
          y: Math.round(obj.top ?? layer.y),
          w: Math.round(w),
          h: Math.round(h),
          rotation: Math.round(((obj.angle ?? layer.rotation ?? 0) % 360 + 360) % 360),
        };
        const next = [...prev.layers];
        // For text layers Fabric scaled the size; bake the scale into the
        // font size so future renders don't compound. This is the standard
        // Fabric pattern documented in the IText recipes.
        if (layer.kind === "text" && obj instanceof fabric.IText) {
          const newSize = (layer.size ?? 24) * (obj.scaleY ?? 1);
          next[idx] = {
            ...layer,
            ...updates,
            size: Math.max(6, Math.round(newSize)),
            content: obj.text ?? layer.content,
          } as TextLayer;
          // Bake the scale back to 1 so subsequent edits behave sanely.
          suppressSyncRef.current = true;
          obj.set({ scaleX: 1, scaleY: 1, width: w, height: h });
          fabricRef.current?.requestRenderAll();
          suppressSyncRef.current = false;
        } else {
          next[idx] = { ...layer, ...updates } as Layer;
        }
        return { ...prev, layers: next };
      });
    },
    []
  );

  // ── Render the entire CanvasDoc into Fabric (full rebuild) ───────────────
  // Called when we switch designs / open a template / undo. Cheap because
  // designs are bounded to MAX_LAYERS=500 server-side and the editor is
  // mostly used in the 5-30 layer range.
  const renderCanvasDocIntoFabric = useCallback((doc: CanvasDoc) => {
    const c = fabricRef.current;
    if (!c) return;
    suppressSyncRef.current = true;
    c.clear();
    c.setDimensions({ width: doc.width, height: doc.height });
    c.backgroundColor = doc.background_color || "#FFFFFF";
    objectsByIdRef.current.clear();
    idByObjectRef.current = new WeakMap();
    for (const layer of doc.layers) {
      // onSwap: image/chart layers asynchronously replace their placeholder
      // with the real FabricImage — re-register the swapped object in the
      // id maps so selection + object:modified keep syncing to the layer
      // (without this, dragging an image/chart never persisted).
      const obj = layerToFabricObject(layer, (swapped) => {
        objectsByIdRef.current.set(layer.id, swapped);
        idByObjectRef.current.set(swapped, layer.id);
      });
      if (!obj) continue;
      objectsByIdRef.current.set(layer.id, obj);
      idByObjectRef.current.set(obj, layer.id);
      if (layer.visible === false) obj.set({ visible: false });
      c.add(obj);
    }
    c.requestRenderAll();
    suppressSyncRef.current = false;
  }, []);

  // Re-render whenever the canvasDoc changes. The renderer is deterministic
  // so this is safe to call after every state set. We avoid putting
  // canvasDoc in the dep array for the on:modified handler because that
  // would cause a feedback loop.
  useEffect(() => {
    renderCanvasDocIntoFabric(canvasDoc);
  }, [canvasDoc, renderCanvasDocIntoFabric]);

  // Keep the snap handler's view of the doc dimensions current.
  useEffect(() => {
    docDimsRef.current = { w: canvasDoc.width, h: canvasDoc.height };
  }, [canvasDoc.width, canvasDoc.height]);

  // Apply zoom — Fabric handles this with setZoom, but we also need to
  // scale the wrapper so scrollbars + selection handles stay accurate.
  useEffect(() => {
    const c = fabricRef.current;
    if (!c) return;
    c.setZoom(zoom);
    c.setDimensions({
      width: canvasDoc.width * zoom,
      height: canvasDoc.height * zoom,
    });
    c.requestRenderAll();
  }, [zoom, canvasDoc.width, canvasDoc.height]);

  // ── Layer add helpers ────────────────────────────────────────────────────
  const mutateCanvas = useCallback((mutator: (prev: CanvasDoc) => CanvasDoc) => {
    setCanvasDoc((prev) => {
      pushUndoSnapshot(prev);
      return mutator(prev);
    });
  }, []);

  const addTextLayer = useCallback(() => {
    const layer: TextLayer = {
      id: uid("text"),
      kind: "text",
      x: Math.round(canvasDoc.width / 2 - 200),
      y: Math.round(canvasDoc.height / 2 - 40),
      w: 400,
      h: 80,
      content: "Your text here",
      font: DEFAULT_FONTS[0],
      size: 48,
      color: "#111827",
      weight: "600",
      align: "center",
      lineHeight: 1.2,
      rotation: 0,
      visible: true,
    };
    mutateCanvas((prev) => ({ ...prev, layers: [...prev.layers, layer] }));
    setSelectedId(layer.id);
  }, [canvasDoc.width, canvasDoc.height, mutateCanvas]);

  const addShapeLayer = useCallback((shape: "rect" | "ellipse" | "line") => {
    const layer: ShapeLayer = {
      id: uid(shape),
      kind: "shape",
      shape,
      x: Math.round(canvasDoc.width / 2 - 100),
      y: Math.round(canvasDoc.height / 2 - 100),
      w: 200,
      h: shape === "line" ? 0 : 200,
      fill: shape === "line" ? "none" : "#FEC82C",
      stroke: shape === "line" ? "#1A3A4A" : "none",
      strokeWidth: shape === "line" ? 4 : 0,
      rotation: 0,
      visible: true,
    };
    mutateCanvas((prev) => ({ ...prev, layers: [...prev.layers, layer] }));
    setSelectedId(layer.id);
  }, [canvasDoc.width, canvasDoc.height, mutateCanvas]);

  const addImageLayer = useCallback((src: string | null) => {
    const layer: ImageLayer = {
      id: uid("image"),
      kind: "image",
      x: Math.round(canvasDoc.width / 2 - 200),
      y: Math.round(canvasDoc.height / 2 - 200),
      w: 400,
      h: 400,
      blob_ref: null,
      src,
      rotation: 0,
      visible: true,
    };
    mutateCanvas((prev) => ({ ...prev, layers: [...prev.layers, layer] }));
    setSelectedId(layer.id);
  }, [canvasDoc.width, canvasDoc.height, mutateCanvas]);

  const addChartLayer = useCallback(() => {
    const layer: ChartLayer = {
      id: uid("chart"),
      kind: "chart",
      chart: "bar",
      x: Math.round(canvasDoc.width / 2 - Math.min(400, canvasDoc.width * 0.4)),
      y: Math.round(canvasDoc.height / 2 - Math.min(260, canvasDoc.height * 0.3)),
      w: Math.round(Math.min(800, canvasDoc.width * 0.8)),
      h: Math.round(Math.min(520, canvasDoc.height * 0.6)),
      values: [
        { label: "Q1", value: 24 },
        { label: "Q2", value: 38 },
        { label: "Q3", value: 45 },
        { label: "Q4", value: 61 },
      ],
      rotation: 0,
      visible: true,
    };
    mutateCanvas((prev) => ({ ...prev, layers: [...prev.layers, layer] }));
    setSelectedId(layer.id);
  }, [canvasDoc.width, canvasDoc.height, mutateCanvas]);

  // Smart Resize — deterministic anchor relayout (Pro+; re-cut §8b).
  const applyResize = useCallback((w: number, h: number) => {
    mutateCanvas((prev) => smartResize(prev, w, h));
    setResizeOpen(false);
  }, [mutateCanvas]);

  // ── Layer mutators ────────────────────────────────────────────────────────
  const deleteLayer = useCallback((id: string) => {
    mutateCanvas((prev) => ({ ...prev, layers: prev.layers.filter((l) => l.id !== id) }));
    if (selectedId === id) setSelectedId(null);
  }, [selectedId, mutateCanvas]);

  const duplicateLayer = useCallback((id: string) => {
    mutateCanvas((prev) => {
      const src = prev.layers.find((l) => l.id === id);
      if (!src) return prev;
      const copy: Layer = {
        ...JSON.parse(JSON.stringify(src)),
        id: uid(src.kind),
        x: (src.x || 0) + 20,
        y: (src.y || 0) + 20,
      };
      return { ...prev, layers: [...prev.layers, copy] };
    });
  }, [mutateCanvas]);

  const updateLayer = useCallback((id: string, patch: Partial<Layer>) => {
    mutateCanvas((prev) => ({
      ...prev,
      layers: prev.layers.map((l) => (l.id === id ? { ...l, ...patch } as Layer : l)),
    }));
  }, [mutateCanvas]);

  const reorderLayer = useCallback((id: string, direction: "up" | "down") => {
    mutateCanvas((prev) => {
      const idx = prev.layers.findIndex((l) => l.id === id);
      if (idx === -1) return prev;
      const newIdx = direction === "up" ? Math.min(prev.layers.length - 1, idx + 1) : Math.max(0, idx - 1);
      if (newIdx === idx) return prev;
      const next = [...prev.layers];
      const [moved] = next.splice(idx, 1);
      next.splice(newIdx, 0, moved);
      return { ...prev, layers: next };
    });
  }, [mutateCanvas]);

  const toggleLayerVisibility = useCallback((id: string) => {
    mutateCanvas((prev) => ({
      ...prev,
      layers: prev.layers.map((l) => l.id === id ? { ...l, visible: l.visible === false } : l),
    }));
  }, [mutateCanvas]);

  const setBackgroundColor = useCallback((color: string) => {
    mutateCanvas((prev) => ({ ...prev, background_color: color }));
  }, [mutateCanvas]);

  // ── Save ──────────────────────────────────────────────────────────────────
  // POST on create / PUT on edit (the LUMEN-API design verb is PUT, not
  // PATCH). Ends with onChanged?.() so the PARENT library reloads; the modal
  // stays open because design editing is iterative (see docblock).
  const save = useCallback(async () => {
    if (!ready) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (currentDesignId) {
        const updated = await put<DesignDto>(`/api/v1/my-brand/designs/${currentDesignId}`, {
          canvas: canvasDoc,
          name: designName,
        });
        if (updated?.design_id) {
          setLastSavedAt(new Date());
          onChanged?.();
        }
      } else {
        const created = await post<DesignDto>("/api/v1/my-brand/designs", {
          canvas: canvasDoc,
          name: designName,
        });
        if (created?.design_id) {
          setCurrentDesignId(created.design_id);
          setLastSavedAt(new Date());
          onChanged?.();
        }
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [canvasDoc, currentDesignId, designName, post, put, ready, onChanged]);

  // Debounced auto-save on name change (2s after last change). Implemented as
  // a simple setTimeout because there's no need for a full debounce hook.
  useEffect(() => {
    if (!currentDesignId) return;
    const handle = setTimeout(() => { void save(); }, 2000);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designName]);

  // ── Export ────────────────────────────────────────────────────────────────
  const exportLocal = useCallback((format: "png" | "jpg") => {
    const c = fabricRef.current;
    if (!c) return;
    setExporting(format);
    try {
      // Render at 1x — Fabric's toDataURL respects current viewport zoom.
      const prevZoom = c.getZoom();
      c.setZoom(1);
      c.setDimensions({ width: canvasDoc.width, height: canvasDoc.height });
      // Fabric.js v6 uses the MIME-style "jpeg" identifier; we keep the user-
      // facing "jpg" label but translate at the boundary.
      const dataUrl = c.toDataURL({
        format: format === "jpg" ? "jpeg" : "png",
        quality: format === "jpg" ? 0.95 : 1,
        multiplier: 1,
      });
      // Restore viewport.
      c.setZoom(prevZoom);
      c.setDimensions({ width: canvasDoc.width * prevZoom, height: canvasDoc.height * prevZoom });
      // Trigger browser download.
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${(designName || "design").replace(/[^\w.-]+/g, "_")}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(null);
      setExportPickerOpen(false);
    }
  }, [canvasDoc.width, canvasDoc.height, designName]);

  // Server-side export — saves the design (so we have a design_id), then
  // POSTs /export which renders + stores a brand_asset row, then navigates
  // to the Asset Library so the user sees the new row.
  const exportToAssetLibrary = useCallback(async () => {
    setExporting("asset");
    setExportError(null);
    try {
      // Ensure design exists server-side before we ask the server to export.
      let dId = currentDesignId;
      if (!dId) {
        const created = await post<DesignDto>("/api/v1/my-brand/designs", {
          canvas: canvasDoc,
          name: designName,
        });
        dId = created?.design_id || null;
        if (dId) setCurrentDesignId(dId);
      } else {
        // Make sure the server has the current canvas before it renders.
        await put<DesignDto>(`/api/v1/my-brand/designs/${dId}`, {
          canvas: canvasDoc,
          name: designName,
        });
      }
      if (!dId) throw new Error("could not create design");
      const out = await post<ExportResult>(`/api/v1/my-brand/designs/${dId}/export`, {
        format: "png",
        width: canvasDoc.width,
        height: canvasDoc.height,
      });
      if (!out?.assetId) throw new Error("export returned no assetId");
      setExportPickerOpen(false);
      navigate(`/app/services/my_brand_assets?focus=${encodeURIComponent(out.assetId)}`);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(null);
    }
  }, [canvasDoc, currentDesignId, designName, post, put, navigate]);

  // Send to Social — export to asset, then navigate to composer with the
  // asset id as a query param so the composer pre-fills the image slot.
  const sendToSocial = useCallback(async () => {
    setExporting("asset");
    setExportError(null);
    try {
      let dId = currentDesignId;
      if (!dId) {
        const created = await post<DesignDto>("/api/v1/my-brand/designs", {
          canvas: canvasDoc,
          name: designName,
        });
        dId = created?.design_id || null;
        if (dId) setCurrentDesignId(dId);
      } else {
        await put<DesignDto>(`/api/v1/my-brand/designs/${dId}`, {
          canvas: canvasDoc,
          name: designName,
        });
      }
      if (!dId) throw new Error("could not create design");
      const out = await post<ExportResult>(`/api/v1/my-brand/designs/${dId}/export`, {
        format: "png",
        width: canvasDoc.width,
        height: canvasDoc.height,
      });
      if (!out?.assetId) throw new Error("export returned no assetId");
      navigate(`/app/services/my_brand_compose?asset_ids=${encodeURIComponent(out.assetId)}`);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(null);
    }
  }, [canvasDoc, currentDesignId, designName, post, put, navigate]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      // Don't intercept when the user is typing in an input/textarea/contenteditable.
      const t = e.target as HTMLElement | null;
      const isTextInput = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        if (isTextInput) return;
        e.preventDefault();
        if (selectedId) duplicateLayer(selectedId);
        return;
      }
      if (mod && e.key.toLowerCase() === "z") {
        if (isTextInput) return;
        e.preventDefault();
        const snap = undoStackRef.current.pop();
        if (snap) setCanvasDoc(snap);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && !isTextInput) {
        if (selectedId) {
          e.preventDefault();
          deleteLayer(selectedId);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, save, duplicateLayer, deleteLayer, selectedId]);

  // ── File upload handler for image layers ─────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const onUploadImage = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      addImageLayer(dataUrl);
    };
    reader.readAsDataURL(file);
    // Reset so re-uploading the same file fires onchange again.
    e.target.value = "";
  }, [addImageLayer]);

  const selectedLayer = useMemo(
    () => canvasDoc.layers.find((l) => l.id === selectedId) || null,
    [canvasDoc.layers, selectedId]
  );

  const isEdit = currentDesignId != null;
  const errorMessage = saveError
    ? `Save failed: ${saveError}`
    : exportError
      ? `Export failed: ${exportError}`
      : null;

  // ────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────

  return (
    <IadmModal
      open={open}
      onClose={onClose}
      product="spark"
      eyebrow="MY BRAND · TEMPLATE STUDIO"
      title={isEdit ? "Edit design" : "New design"}
      size="info"
      headerActions={
        <>
          {saving ? (
            <span className="text-[11px] text-white/60">Saving…</span>
          ) : lastSavedAt && !saveError ? (
            <span className="text-[11px] text-white/60">
              Saved {lastSavedAt.toLocaleTimeString()}
            </span>
          ) : null}
          <input
            type="text"
            value={designName}
            onChange={(e) => setDesignName(e.target.value)}
            placeholder="Design name"
            className="w-56 rounded border border-white/20 bg-white/10 px-2 py-1 text-sm text-white placeholder:text-white/40 focus:border-white/50 focus:outline-none"
          />
        </>
      }
      footer={
        <>
          {/* No Delete slot — LUMEN-API has no DELETE /my-brand/designs route. */}
          <IadmButton
            variant="ghost"
            onClick={() => setExportPickerOpen(true)}
            disabled={!!exporting}
            icon={<Download className="h-3 w-3" />}
          >
            {exporting ? "Exporting…" : "Export"}
          </IadmButton>
          <IadmButton variant="ghost" onClick={onClose}>Close</IadmButton>
          <IadmButton
            variant="accent"
            product="spark"
            onClick={() => void save()}
            disabled={saving || !ready}
            icon={<Save className="h-3 w-3" />}
          >
            {saving ? "Saving…" : "Save"}
          </IadmButton>
          <IadmButton
            variant="accent"
            product="spark"
            onClick={() => void sendToSocial()}
            disabled={!!exporting || !ready}
            icon={<Send className="h-3 w-3" />}
          >
            Send to Social
          </IadmButton>
        </>
      }
    >
      <div className="flex h-full flex-col">
        {errorMessage && (
          <div className="mx-4 mt-3 flex items-start gap-2 rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          {/* CENTER — canvas */}
          <div className="relative flex min-w-0 flex-1 flex-col bg-slate-100">
            {/* Pan/zoom toolbar */}
            <div className="absolute right-4 top-3 z-10 flex items-center gap-1 rounded border border-slate-200 bg-white px-1 py-0.5 shadow-sm">
              <button type="button" onClick={() => setZoom((z) => Math.max(0.25, z - 0.1))} className="rounded p-1.5 hover:bg-slate-100" title="Zoom out">
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="px-1 text-[11px] tabular-nums text-slate-600">{Math.round(zoom * 100)}%</span>
              <button type="button" onClick={() => setZoom((z) => Math.min(4, z + 0.1))} className="rounded p-1.5 hover:bg-slate-100" title="Zoom in">
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => setZoom(1)} className="rounded p-1.5 hover:bg-slate-100" title="Fit 100%">
                <Maximize className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Background-color picker (also acts as the canvas dimensions config) */}
            <div className="absolute left-4 top-3 z-10 flex items-center gap-2 rounded border border-slate-200 bg-white px-2 py-1 shadow-sm">
              <label className="text-[10px] uppercase tracking-wide text-slate-500">BG</label>
              <input
                type="color"
                value={canvasDoc.background_color || "#FFFFFF"}
                onChange={(e) => setBackgroundColor(e.target.value)}
                className="h-5 w-7 cursor-pointer rounded border border-slate-200"
              />
              <span className="text-[10px] text-slate-500">
                {canvasDoc.width}×{canvasDoc.height}
              </span>
              <div className="h-4 w-px bg-slate-200" />
              <button
                type="button"
                onClick={() => setResizeOpen(true)}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-100"
                title="Smart Resize — one design, every platform size"
              >
                <Scaling className="h-3 w-3" /> Resize
              </button>
            </div>

            {/* Selected-layer floating toolbar */}
            {selectedLayer && (
              <SelectedLayerToolbar
                layer={selectedLayer}
                onUpdate={(patch) => updateLayer(selectedLayer.id, patch)}
                onDelete={() => deleteLayer(selectedLayer.id)}
                onDuplicate={() => duplicateLayer(selectedLayer.id)}
                onForward={() => reorderLayer(selectedLayer.id, "up")}
                onBack={() => reorderLayer(selectedLayer.id, "down")}
              />
            )}

            {/* The canvas itself — wrapped in an outer scroll region so the
                zoomed canvas can be larger than the modal body without
                breaking the surrounding chrome. */}
            <div className="flex-1 overflow-auto p-8">
              <div
                className="relative mx-auto bg-white shadow-lg"
                style={{ width: canvasDoc.width * zoom, height: canvasDoc.height * zoom }}
              >
                <canvas ref={canvasElRef} />
                {/* Snap guide lines — canvas coords × zoom, drawn over the canvas. */}
                {guides.v !== null && (
                  <div
                    className="pointer-events-none absolute top-0 bottom-0 w-px bg-pink-500"
                    style={{ left: guides.v * zoom }}
                  />
                )}
                {guides.h !== null && (
                  <div
                    className="pointer-events-none absolute left-0 right-0 h-px bg-pink-500"
                    style={{ top: guides.h * zoom }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* RIGHT — layers + add buttons */}
          <aside className="flex w-72 flex-col border-l border-slate-200 bg-white">
            <div className="border-b border-slate-200 p-3">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Add layer
              </div>
              <div className="grid grid-cols-2 gap-2">
                <AddLayerButton icon={TypeIcon} label="Text" onClick={addTextLayer} />
                <AddLayerButton icon={ImageIcon} label="Image" onClick={() => fileInputRef.current?.click()} />
                <AddLayerButton icon={Square} label="Rect" onClick={() => addShapeLayer("rect")} />
                <AddLayerButton icon={Circle} label="Ellipse" onClick={() => addShapeLayer("ellipse")} />
                <AddLayerButton icon={Minus} label="Line" onClick={() => addShapeLayer("line")} />
                <AddLayerButton icon={BarChart3} label="Chart" onClick={addChartLayer} />
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={onUploadImage}
                className="hidden"
              />
            </div>

            {/* Chart data editor — shown while a chart layer is selected. */}
            {selectedLayer?.kind === "chart" && (
              <ChartDataPanel
                layer={selectedLayer as ChartLayer}
                onUpdate={(patch) => updateLayer(selectedLayer.id, patch)}
              />
            )}

            <div className="border-b border-slate-200 px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Layers ({canvasDoc.layers.length})
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {canvasDoc.layers.length === 0 ? (
                <div className="m-3 rounded-lg border-2 border-dashed border-slate-200 p-4 text-center">
                  <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100">
                    <Layers className="h-4 w-4 text-slate-400" />
                  </div>
                  <div className="text-xs text-slate-500">
                    No layers yet. Add text or a shape above, or start from a template.
                  </div>
                </div>
              ) : (
                // Render in reverse so the topmost layer (highest z) is at top.
                [...canvasDoc.layers].reverse().map((layer) => (
                  <LayerRow
                    key={layer.id}
                    layer={layer}
                    selected={layer.id === selectedId}
                    onSelect={() => setSelectedId(layer.id)}
                    onToggleVisibility={() => toggleLayerVisibility(layer.id)}
                    onForward={() => reorderLayer(layer.id, "up")}
                    onBack={() => reorderLayer(layer.id, "down")}
                  />
                ))
              )}
            </div>

            {/* Keyboard shortcuts hint */}
            <div className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-[10px] text-slate-500">
              <div className="font-semibold uppercase tracking-wide">Shortcuts</div>
              <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5">
                <span>Save</span><span className="text-right">⌘/Ctrl+S</span>
                <span>Duplicate</span><span className="text-right">⌘/Ctrl+D</span>
                <span>Undo</span><span className="text-right">⌘/Ctrl+Z</span>
                <span>Delete</span><span className="text-right">Del</span>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Smart Resize picker — one design → every platform size (Pro+). */}
      {resizeOpen && (
        <IadmModal
          open
          onClose={() => setResizeOpen(false)}
          product="spark"
          eyebrow="MY BRAND · DESIGN STUDIO"
          title="Smart Resize"
          subtitle={hasSmartResize
            ? "Relayout this design for another platform size — text and layers re-anchor automatically."
            : "Smart Resize is a Pro feature."}
          size="nav"
        >
          <div className="p-5">
            {!hasSmartResize && (
              <div className="mb-3 rounded border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                Upgrade to Pro to resize a design for every platform in one click.
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              {SIZE_PRESETS.map((p) => {
                const active = canvasDoc.width === p.w && canvasDoc.height === p.h;
                return (
                  <button
                    key={p.key}
                    type="button"
                    disabled={!hasSmartResize || active}
                    onClick={() => applyResize(p.w, p.h)}
                    className={`flex items-center justify-between rounded-lg border-2 px-3 py-2 text-left text-xs transition-colors ${
                      active
                        ? "border-[#EF6C33] bg-[#EF6C33]/5 text-slate-900"
                        : hasSmartResize
                          ? "border-slate-200 bg-white text-slate-700 hover:border-[#EF6C33] hover:bg-[#EF6C33]/5"
                          : "border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed"
                    }`}
                  >
                    <span className="font-semibold">{p.label}</span>
                    <span className="tabular-nums text-slate-400">{p.w}×{p.h}</span>
                  </button>
                );
              })}
            </div>
            {!hasSmartResize && (
              <div className="mt-3 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Pro+
              </div>
            )}
          </div>
        </IadmModal>
      )}

      {/* Export picker — nested IadmModal size="nav" (F-107: pickers are nav-
          sized choice modals; replaces the old hand-rolled absolute dropdown). */}
      {exportPickerOpen && (
        <IadmModal
          open
          onClose={() => setExportPickerOpen(false)}
          product="spark"
          eyebrow="MY BRAND · TEMPLATE STUDIO"
          title="Export design"
          subtitle="Where should this design go?"
          size="nav"
        >
          <div className="grid grid-cols-1 gap-3 p-5">
            <button
              type="button"
              onClick={() => exportLocal("png")}
              disabled={!!exporting}
              className="group flex items-start gap-3 rounded-lg border-2 border-slate-200 bg-white p-4 text-left transition-colors hover:border-[#EF6C33] hover:bg-[#EF6C33]/5 disabled:opacity-50"
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600">
                <Download className="h-5 w-5" />
              </div>
              <div>
                <div className="font-semibold text-slate-900">Download PNG</div>
                <div className="text-xs leading-snug text-slate-500">Full-quality PNG saved to your device.</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => exportLocal("jpg")}
              disabled={!!exporting}
              className="group flex items-start gap-3 rounded-lg border-2 border-slate-200 bg-white p-4 text-left transition-colors hover:border-[#EF6C33] hover:bg-[#EF6C33]/5 disabled:opacity-50"
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600">
                <Download className="h-5 w-5" />
              </div>
              <div>
                <div className="font-semibold text-slate-900">Download JPG</div>
                <div className="text-xs leading-snug text-slate-500">Compressed JPG (95% quality) saved to your device.</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => void exportToAssetLibrary()}
              disabled={!!exporting}
              className="group flex items-start gap-3 rounded-lg border-2 border-slate-200 bg-white p-4 text-left transition-colors hover:border-[#EF6C33] hover:bg-[#EF6C33]/5 disabled:opacity-50"
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-[#EF6C33]/10 text-[#EF6C33]">
                <FileImage className="h-5 w-5" />
              </div>
              <div>
                <div className="font-semibold text-slate-900">Export to Asset Library</div>
                <div className="text-xs leading-snug text-slate-500">Render server-side and save as a brand asset.</div>
              </div>
            </button>
          </div>
        </IadmModal>
      )}
    </IadmModal>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS — kept in this file because they're tightly coupled to the
// canvas state and don't benefit from being shared elsewhere.
// ────────────────────────────────────────────────────────────────────────────

function AddLayerButton({
  icon: Icon, label, onClick,
}: {
  icon: typeof TypeIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-1 rounded border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700 hover:border-[#1A3A4A] hover:bg-slate-50"
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
    </button>
  );
}

// ── Chart data editor (L3) ──────────────────────────────────────────────────
// Enter numbers → the chart re-renders in brand colors. Bounded to the same
// 12-value cap the server enforces.
const MAX_CHART_VALUES = 12;

function ChartDataPanel({
  layer, onUpdate,
}: {
  layer: ChartLayer;
  onUpdate: (patch: Partial<ChartLayer>) => void;
}) {
  const values = layer.values || [];
  function setRow(i: number, patch: Partial<{ label: string; value: number }>) {
    const next = values.map((v, idx) => (idx === i ? { ...v, ...patch } : v));
    onUpdate({ values: next });
  }
  return (
    <div className="border-b border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Chart data</span>
        <div className="flex gap-1 rounded bg-slate-100 p-0.5">
          {(["bar", "donut", "line"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onUpdate({ chart: t })}
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium capitalize ${
                layer.chart === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1">
        {values.map((v, i) => (
          <div key={i} className="flex items-center gap-1">
            <input
              type="text"
              value={v.label ?? ""}
              placeholder="Label"
              onChange={(e) => setRow(i, { label: e.target.value })}
              className="w-0 flex-1 rounded border border-slate-200 px-1.5 py-0.5 text-[11px]"
            />
            <input
              type="number"
              value={v.value}
              onChange={(e) => setRow(i, { value: Math.max(0, Number(e.target.value) || 0) })}
              className="w-16 rounded border border-slate-200 px-1.5 py-0.5 text-[11px] tabular-nums"
            />
            <button
              type="button"
              onClick={() => onUpdate({ values: values.filter((_, idx) => idx !== i) })}
              disabled={values.length <= 1}
              className="rounded p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
              title="Remove row"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onUpdate({ values: [...values, { label: "", value: 0 }] })}
        disabled={values.length >= MAX_CHART_VALUES}
        className="mt-2 inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-40"
      >
        <Plus className="h-3 w-3" /> Add value
      </button>
      <div className="mt-1.5 text-[10px] text-slate-400">
        Exports render in your brand colors automatically.
      </div>
    </div>
  );
}

function LayerRow({
  layer, selected, onSelect, onToggleVisibility, onForward, onBack,
}: {
  layer: Layer;
  selected: boolean;
  onSelect: () => void;
  onToggleVisibility: () => void;
  onForward: () => void;
  onBack: () => void;
}) {
  const visible = layer.visible !== false;
  let icon: typeof TypeIcon = TypeIcon;
  let label = "Text";
  if (layer.kind === "image") { icon = ImageIcon; label = "Image"; }
  else if (layer.kind === "chart") {
    icon = BarChart3;
    label = `Chart · ${(layer as ChartLayer).chart}`;
  }
  else if (layer.kind === "shape") {
    label = (layer as ShapeLayer).shape === "rect"
      ? "Rectangle"
      : (layer as ShapeLayer).shape === "ellipse"
        ? "Ellipse"
        : "Line";
    icon = (layer as ShapeLayer).shape === "ellipse" ? Circle : (layer as ShapeLayer).shape === "line" ? Minus : Square;
  } else if (layer.kind === "text") {
    label = (layer as TextLayer).content || "Text";
  }
  const Icon = icon;
  return (
    <div
      onClick={onSelect}
      className={
        "group flex cursor-pointer items-center gap-2 border-b border-slate-100 px-3 py-1.5 " +
        (selected ? "bg-yellow-50" : "hover:bg-slate-50")
      }
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
      <span className="flex-1 truncate text-xs">{label}</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onForward(); }}
        className="invisible rounded p-1 hover:bg-slate-200 group-hover:visible"
        title="Bring forward"
      >
        <ChevronUp className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onBack(); }}
        className="invisible rounded p-1 hover:bg-slate-200 group-hover:visible"
        title="Send back"
      >
        <ChevronDown className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleVisibility(); }}
        className="rounded p-1 hover:bg-slate-200"
        title={visible ? "Hide" : "Show"}
      >
        {visible ? <Eye className="h-3 w-3 text-slate-500" /> : <EyeOff className="h-3 w-3 text-slate-400" />}
      </button>
    </div>
  );
}

function SelectedLayerToolbar({
  layer, onUpdate, onDelete, onDuplicate, onForward, onBack,
}: {
  layer: Layer;
  onUpdate: (patch: Partial<Layer>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onForward: () => void;
  onBack: () => void;
}) {
  return (
    <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2 transform">
      <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 shadow-md">
        {layer.kind === "text" && (
          <>
            <select
              value={(layer as TextLayer).font || DEFAULT_FONTS[0]}
              onChange={(e) => onUpdate({ font: e.target.value })}
              className="rounded border border-slate-200 px-1.5 py-0.5 text-[11px]"
              title="Font"
            >
              {DEFAULT_FONTS.map((f) => (
                <option key={f} value={f}>{f.split(",")[0]}</option>
              ))}
            </select>
            <input
              type="number"
              min={6}
              max={400}
              value={(layer as TextLayer).size || 24}
              onChange={(e) => onUpdate({ size: Math.max(6, Number(e.target.value) || 24) })}
              className="w-14 rounded border border-slate-200 px-1.5 py-0.5 text-[11px]"
              title="Size"
            />
            <input
              type="color"
              value={(layer as TextLayer).color || "#111827"}
              onChange={(e) => onUpdate({ color: e.target.value })}
              className="h-6 w-6 cursor-pointer rounded border border-slate-200"
              title="Color"
            />
            <button
              type="button"
              onClick={() => onUpdate({ weight: (layer as TextLayer).weight === "700" ? "400" : "700" })}
              className={
                "rounded p-1 " +
                ((layer as TextLayer).weight === "700" ? "bg-slate-200" : "hover:bg-slate-100")
              }
              title="Bold"
            >
              <Bold className="h-3 w-3" />
            </button>
            <div className="flex">
              <button type="button" onClick={() => onUpdate({ align: "left" })} className={
                "rounded p-1 " + ((layer as TextLayer).align === "left" ? "bg-slate-200" : "hover:bg-slate-100")
              } title="Align left"><AlignLeft className="h-3 w-3" /></button>
              <button type="button" onClick={() => onUpdate({ align: "center" })} className={
                "rounded p-1 " + ((layer as TextLayer).align === "center" ? "bg-slate-200" : "hover:bg-slate-100")
              } title="Align center"><AlignCenter className="h-3 w-3" /></button>
              <button type="button" onClick={() => onUpdate({ align: "right" })} className={
                "rounded p-1 " + ((layer as TextLayer).align === "right" ? "bg-slate-200" : "hover:bg-slate-100")
              } title="Align right"><AlignRight className="h-3 w-3" /></button>
            </div>
            <div className="mx-1 h-4 w-px bg-slate-200" />
          </>
        )}

        {layer.kind === "shape" && (layer as ShapeLayer).shape !== "line" && (
          <>
            <label className="text-[10px] uppercase tracking-wide text-slate-500">Fill</label>
            <input
              type="color"
              value={(layer as ShapeLayer).fill && (layer as ShapeLayer).fill !== "none" ? (layer as ShapeLayer).fill! : "#FEC82C"}
              onChange={(e) => onUpdate({ fill: e.target.value })}
              className="h-6 w-6 cursor-pointer rounded border border-slate-200"
            />
            <div className="mx-1 h-4 w-px bg-slate-200" />
          </>
        )}

        {layer.kind === "shape" && (
          <>
            <label className="text-[10px] uppercase tracking-wide text-slate-500">Stroke</label>
            <input
              type="color"
              value={(layer as ShapeLayer).stroke && (layer as ShapeLayer).stroke !== "none" ? (layer as ShapeLayer).stroke! : "#1A3A4A"}
              onChange={(e) => onUpdate({ stroke: e.target.value })}
              className="h-6 w-6 cursor-pointer rounded border border-slate-200"
            />
            <input
              type="number"
              min={0}
              max={40}
              value={(layer as ShapeLayer).strokeWidth ?? 0}
              onChange={(e) => onUpdate({ strokeWidth: Math.max(0, Number(e.target.value) || 0) })}
              className="w-12 rounded border border-slate-200 px-1.5 py-0.5 text-[11px]"
              title="Stroke width"
            />
            <div className="mx-1 h-4 w-px bg-slate-200" />
          </>
        )}

        <button type="button" onClick={onForward} className="rounded p-1 hover:bg-slate-100" title="Bring forward">
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={onBack} className="rounded p-1 hover:bg-slate-100" title="Send back">
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onUpdate({ rotation: ((layer.rotation || 0) + 15) % 360 })}
          className="rounded p-1 hover:bg-slate-100"
          title="Rotate 15°"
        >
          <RotateCw className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={onDuplicate} className="rounded p-1 hover:bg-slate-100" title="Duplicate (⌘D)">
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={onDelete} className="rounded p-1 hover:bg-rose-100 hover:text-rose-600" title="Delete (Del)">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// CanvasDoc <→> Fabric object converter. Encapsulated in pure functions so
// the renderer above stays small and the unit logic is testable in isolation.
// ────────────────────────────────────────────────────────────────────────────

function layerToFabricObject(
  layer: Layer,
  onSwap?: (obj: fabric.FabricObject) => void,
): fabric.FabricObject | null {
  const baseProps = {
    left: layer.x,
    top: layer.y,
    angle: layer.rotation || 0,
    opacity: layer.opacity ?? 1,
    visible: layer.visible !== false,
    selectable: true,
    hasControls: true,
  };
  if (layer.kind === "text") {
    const t = layer as TextLayer;
    const itext = new fabric.IText(t.content || "", {
      ...baseProps,
      width: t.w,
      fontSize: t.size || 24,
      fontFamily: t.font || DEFAULT_FONTS[0],
      fontWeight: t.weight || "400",
      fill: t.color || "#111827",
      textAlign: t.align || "left",
      lineHeight: t.lineHeight || 1.2,
    });
    return itext;
  }
  if (layer.kind === "image") {
    const il = layer as ImageLayer;
    if (!il.src) {
      // Placeholder rect with diagonal lines — matches the server-side
      // export look so designers see the same slot in editor + export.
      const placeholder = new fabric.Rect({
        ...baseProps,
        width: il.w,
        height: il.h,
        fill: "#E5E7EB",
        stroke: "#9CA3AF",
        strokeWidth: 1,
        strokeDashArray: [6, 4],
      });
      return placeholder;
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
      // Scale to fit the layer dimensions.
      const sx = il.w / (img.width || 1);
      const sy = il.h / (img.height || 1);
      img.scaleX = sx;
      img.scaleY = sy;
      // Replace the placeholder in the canvas. We have to do this through
      // the live canvas instance from the closure that holds fabricRef.
      const canvas = placeholder.canvas;
      if (canvas) {
        canvas.remove(placeholder);
        canvas.add(img);
        onSwap?.(img);
        canvas.requestRenderAll();
      }
    }).catch(() => { /* swallow — placeholder stays visible */ });
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
      const canvas = placeholder.canvas;
      if (canvas) {
        canvas.remove(placeholder);
        canvas.add(img);
        onSwap?.(img);
        canvas.requestRenderAll();
      }
    }).catch(() => { /* placeholder stays visible */ });
    return placeholder;
  }
  if (layer.kind === "shape") {
    const s = layer as ShapeLayer;
    const fill = s.fill && s.fill !== "none" ? s.fill : "transparent";
    const stroke = s.stroke && s.stroke !== "none" ? s.stroke : undefined;
    const strokeWidth = s.strokeWidth ?? 0;
    if (s.shape === "rect") {
      return new fabric.Rect({
        ...baseProps,
        width: s.w,
        height: s.h,
        fill,
        stroke,
        strokeWidth,
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
        fill,
        stroke,
        strokeWidth,
      });
    }
    if (s.shape === "line") {
      return new fabric.Line(
        [s.x, s.y, s.x + s.w, s.y + s.h],
        {
          stroke: stroke || "#1A3A4A",
          strokeWidth: strokeWidth || 2,
          selectable: true,
          opacity: layer.opacity ?? 1,
          visible: layer.visible !== false,
        }
      );
    }
  }
  return null;
}

export default TemplateStudioEditorModal;
