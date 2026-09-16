/**
 * builder/adapters/mybrand/StudioBuilder.tsx — My Brand's Design Studio, on the shared shell.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §4 step 6 / §5 step 5 / §7 (the My Brand
 * row): "Canva-like; same shell, same widget pane and brand kit, keeps its
 * pixel canvas … it moves onto the shared frame and gains the template
 * principle (pre-made templates → adjust → save as new)."
 *
 * ── WHAT THIS REPLACES ────────────────────────────────────────────────────
 * TemplateStudioEditorModal.tsx, 3,249 lines, DELETED in the same pass. It had
 * its own three-pane layout, its own insert rail, its own undo stack, its own
 * swatch code and its own idea of what a builder looks like. What is left of
 * it lives in four files beside this one (scene / insert / templates /
 * fabricBridge) plus two components, and the surface itself is now:
 *
 *   BuilderFrame        the modal, the header, ONE undo/redo pair, three panes
 *   WidgetPane          the SAME pane every other builder has, adapter="brand"
 *   PixelCanvas         the Fabric canvas, in the canvas slot
 *   LayerInspector      the layer editor, in the inspector slot
 *   TemplateGallery     §7's "never a blank page"
 *
 * ── THE ADAPTER'S ONE JOB ─────────────────────────────────────────────────
 * Hold the scene, the history and the API calls. It is the only file here that
 * knows LUMEN exists, and the only one that knows a design can be saved.
 *
 * ── THE BRAND KIT IS READ-ONLY, HERE AND EVERYWHERE ───────────────────────
 * `useBrandKit()` gives the colours, the two faces and the logo. `save()` from
 * that hook is never called in this folder and never will be: Brand Identity
 * is the kit's one writer (§2 step 0), and a colour picked on a design is an
 * override on THAT DESIGN. test/mybrand-studio.test.mjs fails if a call to it
 * appears anywhere under adapters/mybrand or the My Brand pages.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle, Download, FileImage, Layers, Loader2, Palette, Save, Scaling,
  Send, Sparkles, Upload, BarChart3, Image as ImageIcon, LayoutTemplate,
} from "lucide-react";
import { BuilderFrame } from "../../BuilderFrame";
import { WidgetPane } from "../../WidgetPane";
import { canRedo, canUndo, initHistory, push, redo, undo, type History } from "../../history";
import type { WidgetDef } from "../../registry";
import { IadmModal, IadmButton } from "../../../components/IadmModal";
import { useBrandKit } from "../../../brand/BrandKitProvider";
import { fontStack } from "../../../lib/brandKit";
import { useAppState } from "../../../app/AppState";
import { useLumenApi } from "../../../hooks/useLumenApi";
import { useProductTier } from "../../../hooks/useProductTier";
import { tierMeets } from "../../../lib/tierRank";
import { PixelCanvas, type PixelCanvasHandle } from "./PixelCanvas";
import { LayerInspector } from "./LayerInspector";
import { TemplateGallery, type SavedTemplate } from "./TemplateGallery";
import { insertWidget, chartLayer, brandSwatches, type StudioBrand } from "./insert";
import { buildPremade, PREMADE_BY_KEY } from "./templates";
import {
  addLayers, addLayersBehind, alignLayer, brandSync, duplicateLayer, emptyCanvas,
  exportFilename, fixTextContrast, patchLayer, removeLayer, reorderLayer,
  setBackgroundColor, smartResize, toggleLayerVisibility, uid, SIZE_PRESETS,
  resolveBrandTokens,
  ICON_PATHS as ICON_PATHS_LIST,
  type CanvasDoc, type DesignDto, type ExportResult, type ImageLayer, type Layer,
  type TemplateDto,
} from "./scene";

// The bundled faces. The CSS side-effects live HERE and not in scene.ts, so the
// model stays importable by `node --test` (scripts/test-ts-loader: only pure
// modules belong under test, and a .css import is not pure).
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import "@fontsource/montserrat/400.css";
import "@fontsource/montserrat/700.css";
import "@fontsource/playfair-display/400.css";
import "@fontsource/playfair-display/700.css";
import "@fontsource/bebas-neue/400.css";
import "@fontsource/lora/400.css";
import "@fontsource/lora/700.css";
import "@fontsource/oswald/400.css";
import "@fontsource/oswald/700.css";

export interface StudioBuilderProps {
  open: boolean;
  onClose: () => void;
  /** An existing design to edit, or null to start something new. */
  designId: string | null;
  /** A template to open as a new design. */
  templateId?: string | null;
  /** Open on the gallery — §7's "never a blank page". */
  startOnGallery?: boolean;
  /** Fires after every successful save so the library page refreshes. */
  onChanged?: () => void;
}

/** One small question asked before a widget lands, the way the pane asks "how many?". */
interface Chooser {
  kind: string;
  title: string;
  /** null = a free-text answer (a link). */
  options: Array<{ value: string; label: string; hint?: string; swatch?: string }> | null;
  placeholder?: string;
}

export function StudioBuilder(p: StudioBuilderProps) {
  const { get, post, put, ready } = useLumenApi();
  const navigate = useNavigate();
  const { kit } = useBrandKit();
  const { active } = useAppState();
  const { tier } = useProductTier("spark");
  const hasProTools = tierMeets(tier, "pro");

  /* ── The business, as the studio needs it ────────────────────────────── */
  const brand: StudioBrand = useMemo(() => ({
    colours: kit.colours,
    fonts: { heading: fontStack(kit, "heading"), body: fontStack(kit, "body") },
    logoUrl: kit.logo_url,
    businessName: active?.tenant?.tenantFullName || active?.tenant?.tenantName || "Your business",
    websiteUrl: null,
  }), [kit, active]);

  /* ── The scene, and ONE history over it ──────────────────────────────── */
  const [doc, setDoc] = useState<CanvasDoc>(() => emptyCanvas());
  const [history, setHistory] = useState<History<CanvasDoc>>(() => initHistory(emptyCanvas()));
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const apply = useCallback((next: CanvasDoc, mergeKey: string | null = null) => {
    setHistory((h) => push(h, next, mergeKey));
    setDoc(next);
  }, []);

  /** A whole new scene — a template opened, a design loaded. The stack restarts
   *  so undo can never walk backwards into a different design. */
  const replaceScene = useCallback((next: CanvasDoc, select: string | null = null) => {
    setHistory(initHistory(next));
    setDoc(next);
    setSelectedId(select);
  }, []);

  const doUndo = useCallback(() => setHistory((h) => { const n = undo(h); setDoc(n.present); return n; }), []);
  const doRedo = useCallback(() => setHistory((h) => { const n = redo(h); setDoc(n.present); return n; }), []);

  /* ── Record state ────────────────────────────────────────────────────── */
  const [currentDesignId, setCurrentDesignId] = useState<string | null>(p.designId);
  const [designName, setDesignName] = useState("Untitled design");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  /* ── Overlays ────────────────────────────────────────────────────────── */
  const [galleryOpen, setGalleryOpen] = useState(!!p.startOnGallery);
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [resizeOpen, setResizeOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [chooser, setChooser] = useState<Chooser | null>(null);
  const [chooserText, setChooserText] = useState("");

  const canvasRef = useRef<PixelCanvasHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /* ── Load: a design, a template, or nothing ──────────────────────────── */
  useEffect(() => {
    if (!p.open || !ready) return;
    setSaveError(null);
    setExportError(null);
    let cancelled = false;
    (async () => {
      try {
        if (p.designId) {
          const d = await get<DesignDto>(`/api/v1/my-brand/designs/${p.designId}`);
          if (cancelled || !d?.canvas) return;
          replaceScene(withIds(d.canvas));
          setCurrentDesignId(d.design_id);
          setDesignName(d.name || "Untitled design");
          setGalleryOpen(false);
        } else if (p.templateId) {
          const t = await get<TemplateDto>(`/api/v1/my-brand/templates/${p.templateId}`);
          if (cancelled || !t?.canvas) return;
          const scene = withIds(t.canvas);
          // Select the biggest line of type straight away: a template is edited
          // by swapping words first, so the inspector opens on something real.
          const headline = scene.layers
            .filter((l): l is Layer & { size?: number } => l.kind === "text")
            .sort((a, b) => (b.size || 0) - (a.size || 0))[0];
          replaceScene(scene, headline?.id ?? null);
          setCurrentDesignId(null);
          setDesignName(t.name);
          setGalleryOpen(false);
        }
      } catch (e) {
        if (!cancelled) setSaveError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.open, ready, p.designId, p.templateId, get]);

  /** The gallery's "Your templates" row. */
  const loadTemplates = useCallback(async () => {
    if (!ready) return;
    try {
      const rows = await get<SavedTemplate[]>("/api/v1/my-brand/templates");
      setSavedTemplates(Array.isArray(rows) ? rows : []);
    } catch { /* the pre-made row still works; the gallery is not a dead end */ }
  }, [get, ready]);

  useEffect(() => { if (p.open) void loadTemplates(); }, [p.open, loadTemplates]);

  /* ── Inserting from the shared pane ──────────────────────────────────── */
  const place = useCallback((kind: string, opts: Parameters<typeof insertWidget>[3] = {}) => {
    const result = insertWidget(kind, doc, brand, opts);
    if (!result.layers.length) return;
    apply(result.behind ? addLayersBehind(doc, result.layers) : addLayers(doc, result.layers));
    setSelectedId(result.selectId);
  }, [apply, brand, doc]);

  const onInsert = useCallback((def: WidgetDef, count?: number) => {
    switch (def.kind) {
      case "icon":
        setChooser({ kind: "icon", title: "Which symbol?", options: null, placeholder: "icon" });
        return;
      case "shape":
        setChooser({
          kind: "shape", title: "Which shape?", options: [
            { value: "rect", label: "Rectangle", hint: "A block for a headline to sit on" },
            { value: "ellipse", label: "Circle", hint: "A badge, a photo frame, a dot" },
            { value: "line", label: "Line", hint: "A rule under a title" },
          ],
        });
        return;
      case "colour_block":
        setChooser({
          kind: "colour_block", title: "Which of your colours?",
          options: brandSwatches(brand).map((s, i) => ({
            value: ["primary", "secondary", "accent", "text", "background"][i],
            label: s.label, hint: s.colour, swatch: s.colour,
          })),
        });
        return;
      case "background":
        setChooser({
          kind: "background", title: "What should the background be?", options: [
            { value: "fade", label: "A fade between two of your colours", swatch: brand.colours.primary },
            { value: "solid", label: "One of your colours, flat", swatch: brand.colours.primary },
          ],
        });
        return;
      case "social_handle":
        setChooser({
          kind: "social_handle", title: "Where can people find you?", options: [
            { value: "instagram", label: "Instagram" }, { value: "facebook", label: "Facebook" },
            { value: "linkedin", label: "LinkedIn" }, { value: "website", label: "Your website" },
            { value: "phone", label: "Your phone number" }, { value: "email", label: "Your email" },
          ],
        });
        return;
      case "qr_code":
        setChooserText(brand.websiteUrl || "https://");
        setChooser({ kind: "qr_code", title: "What should the code open?", options: null, placeholder: "https://yourbusiness.com/book" });
        return;
      case "image":
        setChooser({
          kind: "image", title: "Where is the picture?", options: [
            { value: "library", label: "From your Media Library", hint: "Pictures you have uploaded or generated" },
            { value: "upload", label: "Upload one from this computer" },
            { value: "placeholder", label: "Leave an empty slot for now" },
          ],
        });
        return;
      case "brand_logo":
        if (brand.logoUrl) { place("brand_logo"); return; }
        setChooser({
          kind: "brand_logo", title: "You have not added a logo yet", options: [
            { value: "upload", label: "Upload your logo now" },
            { value: "placeholder", label: "Leave a space for it" },
          ],
        });
        return;
      default:
        place(def.kind, { count });
    }
  }, [brand, place]);

  const [qrBusy, setQrBusy] = useState(false);
  const answerChooser = useCallback(async (value: string) => {
    const kind = chooser?.kind;
    setChooser(null);
    if (!kind) return;
    if (kind === "qr_code") {
      setQrBusy(true);
      try {
        const r = await get<{ data_url?: string }>(`/api/v1/my-brand/qr?url=${encodeURIComponent(value)}`);
        if (!r?.data_url) throw new Error("the code could not be made");
        place("qr_code", { imageSrc: r.data_url });
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : String(e));
      } finally {
        setQrBusy(false);
      }
      return;
    }
    if (kind === "image" || kind === "brand_logo") {
      if (value === "library") { setLibraryOpen(true); return; }
      if (value === "upload") { fileInputRef.current?.click(); return; }
      place(kind);
      return;
    }
    place(kind, { option: value });
  }, [chooser, get, place]);

  /* ── Layer edits ─────────────────────────────────────────────────────── */
  const selected = useMemo(() => doc.layers.find((l) => l.id === selectedId) || null, [doc.layers, selectedId]);

  const updateLayer = useCallback((id: string, patch: Partial<Layer>) => {
    // Typing in one field is ONE undo step: the shared history's coalescing,
    // keyed by the layer and the field, exactly as the proposal builder does it.
    const key = Object.keys(patch).length === 1 ? `${id}:${Object.keys(patch)[0]}` : null;
    apply(patchLayer(doc, id, patch), key);
  }, [apply, doc]);

  /** A drag or a resize on the canvas — always its own undo step. */
  const onGeometry = useCallback((id: string, patch: Partial<Layer>) => {
    apply(patchLayer(doc, id, patch));
  }, [apply, doc]);

  const deleteLayer = useCallback((id: string) => {
    apply(removeLayer(doc, id));
    if (selectedId === id) setSelectedId(null);
  }, [apply, doc, selectedId]);

  const duplicate = useCallback((id: string) => {
    const r = duplicateLayer(doc, id);
    apply(r.doc);
    if (r.id) setSelectedId(r.id);
  }, [apply, doc]);

  /* ── Pictures ────────────────────────────────────────────────────────── */
  const placeAsset = useCallback((asset: PickerAsset) => {
    const maxSide = Math.min(doc.width, doc.height) * 0.6;
    const aw = asset.width_px || 800;
    const ah = asset.height_px || 800;
    const s = Math.min(maxSide / aw, maxSide / ah, 1);
    const layer: ImageLayer = {
      id: uid("image"), kind: "image",
      x: Math.round(doc.width / 2 - (aw * s) / 2),
      y: Math.round(doc.height / 2 - (ah * s) / 2),
      w: Math.round(aw * s), h: Math.round(ah * s),
      blob_ref: asset.blob_ref, asset_id: asset.asset_id, src: asset.url,
      rotation: 0, visible: true,
    };
    apply(addLayers(doc, [layer]));
    setSelectedId(layer.id);
    setLibraryOpen(false);
  }, [apply, doc]);

  const onUploadImage = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      try {
        const up = await post<{ assetId: string; blobRef: string; url: string; width: number | null; height: number | null }>(
          "/api/v1/my-brand/assets/upload", { data: dataUrl, filename: file.name },
        );
        if (up?.assetId) {
          placeAsset({ asset_id: up.assetId, blob_ref: up.blobRef, url: up.url || dataUrl, width_px: up.width, height_px: up.height });
          return;
        }
      } catch { /* fall through to a local-only layer */ }
      place("image", { imageSrc: dataUrl });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }, [place, placeAsset, post]);

  const [bgRemoveBusy, setBgRemoveBusy] = useState(false);
  const [bgRemoveError, setBgRemoveError] = useState<string | null>(null);
  const removeLayerBackground = useCallback(async (layerId: string) => {
    const layer = doc.layers.find((l) => l.id === layerId) as ImageLayer | undefined;
    if (!layer?.asset_id) return;
    setBgRemoveBusy(true);
    setBgRemoveError(null);
    try {
      const out = await post<{ assetId: string; blobRef: string; url: string }>(
        `/api/v1/my-brand/image-studio/${layer.asset_id}/edit`, { edits: { bg_remove: true } },
      );
      if (!out?.assetId) throw new Error("no picture came back");
      apply(patchLayer(doc, layerId, { asset_id: out.assetId, blob_ref: out.blobRef, src: out.url } as Partial<Layer>));
    } catch (e) {
      setBgRemoveError(e instanceof Error ? e.message : String(e));
    } finally {
      setBgRemoveBusy(false);
    }
  }, [apply, doc, post]);

  /* ── Ask for words / a picture ───────────────────────────────────────── */
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState<"write" | "image" | null>(null);
  const [aiOptions, setAiOptions] = useState<string[]>([]);
  const [aiError, setAiError] = useState<string | null>(null);

  const aiWrite = useCallback(async () => {
    if (!aiPrompt.trim() || aiBusy) return;
    setAiBusy("write"); setAiError(null); setAiOptions([]);
    try {
      const r = await post<{ options: string[] }>("/api/v1/my-brand/designs/assist/write", {
        prompt: aiPrompt.trim(),
        current_text: selected?.kind === "text" ? (selected as { content?: string }).content : undefined,
      });
      setAiOptions(r?.options || []);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
    } finally { setAiBusy(null); }
  }, [aiPrompt, aiBusy, post, selected]);

  const aiApply = useCallback((textValue: string) => {
    if (selected?.kind === "text") {
      apply(patchLayer(doc, selected.id, { content: textValue } as Partial<Layer>));
    } else {
      const r = insertWidget("heading", doc, brand);
      const layers = r.layers.map((l) => (l.kind === "text" ? { ...l, content: textValue } : l));
      apply(addLayers(doc, layers as Layer[]));
      setSelectedId(r.selectId);
    }
    setAiOptions([]); setAiPrompt("");
  }, [apply, brand, doc, selected]);

  const aiGenerate = useCallback(async () => {
    if (!aiPrompt.trim() || aiBusy) return;
    setAiBusy("image"); setAiError(null);
    try {
      const r = await post<{ assets: Array<{ assetId: string; blobRef: string; url: string }> }>(
        "/api/v1/my-brand/image-studio/generate", { prompt: aiPrompt.trim(), n: 1, size: "1024x1024" },
      );
      const a = r?.assets?.[0];
      if (!a?.url) throw new Error("no picture came back");
      placeAsset({ asset_id: a.assetId, blob_ref: a.blobRef, url: a.url });
      setAiPrompt("");
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
    } finally { setAiBusy(null); }
  }, [aiPrompt, aiBusy, placeAsset, post]);

  /* ── Save ────────────────────────────────────────────────────────────── */
  const save = useCallback(async () => {
    if (!ready) return null;
    setSaving(true); setSaveError(null);
    try {
      const body = { canvas: doc, name: designName };
      const saved = currentDesignId
        ? await put<DesignDto>(`/api/v1/my-brand/designs/${currentDesignId}`, body)
        : await post<DesignDto>("/api/v1/my-brand/designs", body);
      if (saved?.design_id) {
        setCurrentDesignId(saved.design_id);
        setLastSavedAt(new Date());
        p.onChanged?.();
        return saved.design_id;
      }
      return null;
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setSaving(false);
    }
  }, [currentDesignId, designName, doc, p, post, put, ready]);

  /** §7: open one, adjust it, SAVE AS A NEW TEMPLATE. */
  const [templateName, setTemplateName] = useState("");
  const [templateBusy, setTemplateBusy] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const saveAsTemplate = useCallback(async () => {
    const name = templateName.trim() || designName;
    setTemplateBusy(true); setTemplateError(null);
    try {
      const created = await post<TemplateDto>("/api/v1/my-brand/templates", {
        name, kind: kindForSize(doc), canvas: doc,
      });
      if (!created?.template_id) throw new Error("the template was not saved");
      setSaveTemplateOpen(false);
      setTemplateName("");
      await loadTemplates();
      p.onChanged?.();
    } catch (e) {
      setTemplateError(e instanceof Error ? e.message : String(e));
    } finally {
      setTemplateBusy(false);
    }
  }, [designName, doc, loadTemplates, p, post, templateName]);

  /* ── Export ──────────────────────────────────────────────────────────── */
  const download = useCallback((href: string, filename: string) => {
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, []);

  const exportLocal = useCallback((format: "png" | "jpg" | "svg") => {
    setExporting(format); setExportError(null);
    try {
      if (format === "svg") {
        const svg = canvasRef.current?.toSVG();
        if (!svg) throw new Error("the design could not be drawn");
        const href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        download(href, exportFilename(designName, "svg"));
      } else {
        const url = canvasRef.current?.toDataURL(format);
        if (!url) throw new Error("the design could not be drawn");
        download(url, exportFilename(designName, format));
      }
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(null);
      setExportOpen(false);
    }
  }, [designName, download]);

  /** Render server-side into the Media Library, and go and look at it. */
  const exportToLibrary = useCallback(async () => {
    setExporting("asset"); setExportError(null);
    try {
      const dId = await save();
      if (!dId) throw new Error("the design could not be saved first");
      const out = await post<ExportResult>(`/api/v1/my-brand/designs/${dId}/export`, {
        format: "png", width: doc.width, height: doc.height,
      });
      if (!out?.assetId) throw new Error("the export came back empty");
      setExportOpen(false);
      navigate(`/app/services/my_brand_assets?focus=${encodeURIComponent(out.assetId)}`);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    } finally { setExporting(null); }
  }, [doc.height, doc.width, navigate, post, save]);

  /** §5 step 5 item 3: hand the picture to the composer that already exists. */
  const useInAPost = useCallback(async () => {
    setExporting("asset"); setExportError(null);
    try {
      const dId = await save();
      if (!dId) throw new Error("the design could not be saved first");
      const out = await post<ExportResult>(`/api/v1/my-brand/designs/${dId}/export`, {
        format: "png", width: doc.width, height: doc.height,
      });
      if (!out?.assetId) throw new Error("the export came back empty");
      navigate(`/app/services/my_brand_compose?asset_ids=${encodeURIComponent(out.assetId)}`);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    } finally { setExporting(null); }
  }, [doc.height, doc.width, navigate, post, save]);

  /* ── Keyboard ────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!p.open) return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); void save(); return; }
      if (mod && e.key.toLowerCase() === "z") {
        if (typing) return;
        e.preventDefault();
        if (e.shiftKey) doRedo(); else doUndo();
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        if (typing || !selectedId) return;
        e.preventDefault();
        duplicate(selectedId);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && !typing && selectedId) {
        e.preventDefault();
        deleteLayer(selectedId);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p.open, save, doUndo, doRedo, duplicate, deleteLayer, selectedId]);

  const errorMessage = saveError ? `Could not save: ${saveError}`
    : exportError ? `Could not export: ${exportError}`
      : null;

  /* ── The surface ─────────────────────────────────────────────────────── */
  return (
    <>
      <BuilderFrame
        open={p.open}
        onClose={p.onClose}
        product="spark"
        eyebrow="MY BRAND · DESIGN STUDIO"
        title={currentDesignId ? "Edit design" : "New design"}
        subtitle={`${doc.width} × ${doc.height}`}
        canUndo={canUndo(history)}
        canRedo={canRedo(history)}
        onUndo={doUndo}
        onRedo={doRedo}
        headerActions={
          <>
            {saving ? (
              <span className="text-[11px] text-white/60">Saving…</span>
            ) : lastSavedAt && !saveError ? (
              <span className="text-[11px] text-white/60">Saved {lastSavedAt.toLocaleTimeString()}</span>
            ) : null}
            <input
              type="text"
              value={designName}
              onChange={(e) => setDesignName(e.target.value)}
              placeholder="Design name"
              title="What this design is called"
              aria-label="Design name"
              className="w-56 rounded border border-white/20 bg-white/10 px-2 py-1 text-sm text-white placeholder:text-white/40 focus:border-white/50 focus:outline-none"
            />
          </>
        }
        footer={
          <>
            <IadmButton variant="ghost" title="Download this design, or save it to your Media Library" onClick={() => setExportOpen(true)} disabled={!!exporting} icon={<Download className="h-3 w-3" />}>
              {exporting ? "Exporting…" : "Export"}
            </IadmButton>
            <IadmButton variant="ghost" title="Keep this layout as a template you can open and adjust next time" onClick={() => { setTemplateName(designName); setSaveTemplateOpen(true); }}>
              Save as a template
            </IadmButton>
            <IadmButton variant="ghost" title="Close the studio" onClick={p.onClose}>Close</IadmButton>
            <IadmButton variant="accent" product="spark" title="Save this design (⌘/Ctrl+S)" onClick={() => void save()} disabled={saving || !ready} icon={<Save className="h-3 w-3" />}>
              {saving ? "Saving…" : "Save"}
            </IadmButton>
            <IadmButton variant="accent" product="spark" title="Save it, render the picture and open the social composer with it attached" onClick={() => void useInAPost()} disabled={!!exporting || !ready} icon={<Send className="h-3 w-3" />}>
              Use in a post
            </IadmButton>
          </>
        }
        pane={
          <WidgetPane
            adapter="brand"
            onInsert={onInsert}
            header={
              <StudioPaneHeader
                onOpenGallery={() => setGalleryOpen(true)}
                onUpload={() => fileInputRef.current?.click()}
                onLibrary={() => setLibraryOpen(true)}
                onChart={() => { const l = chartLayer(doc); apply(addLayers(doc, [l])); setSelectedId(l.id); }}
                ai={{
                  prompt: aiPrompt, busy: aiBusy, options: aiOptions, error: aiError,
                  setPrompt: setAiPrompt, write: () => void aiWrite(), generate: () => void aiGenerate(), apply: aiApply,
                }}
              />
            }
          />
        }
        inspector={
          <LayerInspector
            doc={doc}
            brand={brand}
            selected={selected}
            onSelect={setSelectedId}
            onUpdate={updateLayer}
            onDelete={deleteLayer}
            onDuplicate={duplicate}
            onReorder={(id, d) => apply(reorderLayer(doc, id, d))}
            onToggleVisibility={(id) => apply(toggleLayerVisibility(doc, id))}
            onAlign={(id, which) => apply(alignLayer(doc, id, which))}
            onFixContrast={(id) => apply(fixTextContrast(doc, id))}
            onSetBackground={(c) => apply(setBackgroundColor(doc, c))}
            onBrandSync={() => apply(brandSync(doc, brandSwatches(brand).map((s) => s.colour)))}
            brandSyncAvailable={hasProTools}
            onRemoveBackground={
              selected?.kind === "image" && (selected as ImageLayer).asset_id && hasProTools
                ? (id) => void removeLayerBackground(id)
                : undefined
            }
            removeBackgroundBusy={bgRemoveBusy}
            removeBackgroundError={bgRemoveError}
          />
        }
      >
        <div className="relative flex h-full flex-col">
          {errorMessage && (
            <div className="mx-4 mt-3 flex items-start gap-2 rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" onChange={onUploadImage} className="hidden" />
          <div className="min-h-0 flex-1">
            <PixelCanvas
              ref={canvasRef}
              doc={doc}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onLayerGeometry={onGeometry}
              toolbar={
                <div className="flex items-center gap-2 rounded border border-slate-200 bg-white px-2 py-1 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setResizeOpen(true)}
                    title="Resize this design for another platform — everything re-anchors itself"
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <Scaling className="h-3 w-3" /> Resize
                  </button>
                  <div className="h-4 w-px bg-slate-200" />
                  <button
                    type="button"
                    onClick={hasProTools ? () => apply(brandSync(doc, brandSwatches(brand).map((s) => s.colour))) : undefined}
                    disabled={!hasProTools}
                    title={hasProTools
                      ? "Brand Sync — pull every colour in this design to the nearest colour in your brand. Undo puts it back."
                      : "Brand Sync is a Pro feature"}
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
                  >
                    <Palette className="h-3 w-3" /> Brand Sync{!hasProTools && " · Pro+"}
                  </button>
                </div>
              }
            />
          </div>
          {qrBusy && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/60 text-xs text-slate-600">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Making the code…
            </div>
          )}
        </div>
      </BuilderFrame>

      {/* ── Overlays ─────────────────────────────────────────────────────── */}
      <TemplateGallery
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        brand={brand}
        saved={savedTemplates}
        onKeepEditing={doc.layers.length ? () => setGalleryOpen(false) : undefined}
        onPickPremade={(key, count) => {
          const scene = buildPremade(key, brand, count);
          if (!scene) return;
          replaceScene(scene);
          setDesignName(PREMADE_BY_KEY[key]?.label || "New design");
          setCurrentDesignId(null);
          setGalleryOpen(false);
        }}
        onPickSaved={(t) => {
          if (!t.canvas) return;
          // The LIST hands back raw {{brand.*}} tokens; only GET by id resolves
          // them. Resolving here means the design that opens is the card that
          // was clicked, with no second round trip.
          replaceScene(withIds(resolveBrandTokens(t.canvas, brand.colours as unknown as Record<string, string>)!));
          setDesignName(t.name);
          setCurrentDesignId(null);
          setGalleryOpen(false);
        }}
      />

      {chooser && (
        <IadmModal
          open onClose={() => setChooser(null)} product="spark"
          eyebrow="MY BRAND · DESIGN STUDIO" title={chooser.title} size="nav"
        >
          <div className="p-5">
            {chooser.options === null && chooser.kind === "icon" ? (
              <IconPicker onPick={(key) => void answerChooser(key)} />
            ) : chooser.options === null ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chooserText}
                  autoFocus
                  placeholder={chooser.placeholder}
                  title={chooser.title}
                  aria-label={chooser.title}
                  onChange={(e) => setChooserText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void answerChooser(chooserText); }}
                  className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
                />
                <button
                  type="button" title="Add it to the design"
                  onClick={() => void answerChooser(chooserText)}
                  className="rounded bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
                >
                  Add
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {chooser.options.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => void answerChooser(o.value)}
                    title={o.hint ? `${o.label} — ${o.hint}` : o.label}
                    data-chooser-option={o.value}
                    className="flex items-center gap-3 rounded-lg border-2 border-slate-200 bg-white p-3 text-left transition-colors hover:border-[#EF6C33] hover:bg-[#EF6C33]/5"
                  >
                    {o.swatch && <span className="h-6 w-6 flex-shrink-0 rounded border border-slate-300" style={{ background: o.swatch }} />}
                    <span>
                      <span className="block text-sm font-semibold text-slate-900">{o.label}</span>
                      {o.hint && <span className="block text-[11px] text-slate-500">{o.hint}</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </IadmModal>
      )}

      {libraryOpen && <AssetPickerModal onClose={() => setLibraryOpen(false)} onPick={placeAsset} />}

      {resizeOpen && (
        <IadmModal
          open onClose={() => setResizeOpen(false)} product="spark"
          eyebrow="MY BRAND · DESIGN STUDIO" title="Resize this design"
          subtitle={hasProTools
            ? "Everything re-anchors itself — edges stay on edges, full-width bands stay full width."
            : "Resizing a finished design is a Pro feature."}
          size="nav"
        >
          <div className="p-5">
            {!hasProTools && (
              <div className="mb-3 rounded border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                Upgrade to Pro to resize one design for every platform in a click.
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              {SIZE_PRESETS.map((s) => {
                const activeSize = doc.width === s.w && doc.height === s.h;
                return (
                  <button
                    key={s.key}
                    type="button"
                    disabled={!hasProTools || activeSize}
                    title={activeSize ? "This is the size you are on" : `Resize to ${s.label}, ${s.w}×${s.h}`}
                    onClick={() => { apply(smartResize(doc, s.w, s.h)); setResizeOpen(false); }}
                    className={`flex items-center justify-between rounded-lg border-2 px-3 py-2 text-left text-xs transition-colors ${
                      activeSize ? "border-[#EF6C33] bg-[#EF6C33]/5 text-slate-900"
                        : hasProTools ? "border-slate-200 bg-white text-slate-700 hover:border-[#EF6C33] hover:bg-[#EF6C33]/5"
                          : "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400"
                    }`}
                  >
                    <span className="font-semibold">{s.label}</span>
                    <span className="tabular-nums text-slate-400">{s.w}×{s.h}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </IadmModal>
      )}

      {exportOpen && (
        <IadmModal
          open onClose={() => setExportOpen(false)} product="spark"
          eyebrow="MY BRAND · DESIGN STUDIO" title="Export this design"
          subtitle="Where should it go?" size="nav"
        >
          <div className="grid grid-cols-1 gap-3 p-5">
            <ExportOption icon={<Download className="h-5 w-5" />} title="Download PNG"
              blurb="Full quality, saved to this computer. Keeps a see-through background."
              disabled={!!exporting} onClick={() => exportLocal("png")} />
            <ExportOption icon={<Download className="h-5 w-5" />} title="Download JPG"
              blurb="Smaller file, no transparency — fine for a photo-heavy post."
              disabled={!!exporting} onClick={() => exportLocal("jpg")} />
            <ExportOption icon={<Download className="h-5 w-5" />} title="Download SVG"
              blurb="Sharp at any size — what a sign maker or a printer asks for."
              disabled={!!exporting} onClick={() => exportLocal("svg")} />
            <ExportOption icon={<FileImage className="h-5 w-5" />} title="Save to your Media Library"
              blurb="We render it on our side and keep it with your other pictures."
              disabled={!!exporting} onClick={() => void exportToLibrary()} accent />
          </div>
        </IadmModal>
      )}

      {saveTemplateOpen && (
        <IadmModal
          open onClose={() => setSaveTemplateOpen(false)} product="spark"
          eyebrow="MY BRAND · DESIGN STUDIO" title="Save this as a template"
          subtitle="It joins your templates, ready to open and adjust next time."
          size="nav"
          footer={
            <>
              <IadmButton variant="ghost" title="Do not save a template" onClick={() => setSaveTemplateOpen(false)}>Cancel</IadmButton>
              <IadmButton variant="accent" product="spark" title="Save this layout as one of your templates" onClick={() => void saveAsTemplate()} disabled={templateBusy}>
                {templateBusy ? "Saving…" : "Save the template"}
              </IadmButton>
            </>
          }
        >
          <div className="p-5">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Name it
              <input
                type="text"
                value={templateName}
                autoFocus
                onChange={(e) => setTemplateName(e.target.value)}
                title="What this template is called"
                aria-label="Template name"
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm font-normal normal-case"
              />
            </label>
            {templateError && (
              <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{templateError}</div>
            )}
          </div>
        </IadmModal>
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Pane header — the things that are not "add a widget"
   ══════════════════════════════════════════════════════════════════════════ */

interface AiPaneState {
  prompt: string;
  busy: "write" | "image" | null;
  options: string[];
  error: string | null;
  setPrompt: (v: string) => void;
  write: () => void;
  generate: () => void;
  apply: (text: string) => void;
}

function StudioPaneHeader({ onOpenGallery, onUpload, onLibrary, onChart, ai }: {
  onOpenGallery: () => void;
  onUpload: () => void;
  onLibrary: () => void;
  onChart: () => void;
  ai: AiPaneState;
}) {
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onOpenGallery}
        title="Start from a template — every one opens already in your brand"
        className="flex w-full items-center justify-center gap-1.5 rounded bg-slate-800 px-2 py-1.5 text-[11px] font-bold text-white hover:bg-slate-700"
      >
        <LayoutTemplate className="h-3.5 w-3.5" /> Start from a template
      </button>

      <div className="grid grid-cols-3 gap-1.5">
        <SmallTool icon={<Upload className="h-3.5 w-3.5" />} label="Upload" title="Put a picture from this computer on the design" onClick={onUpload} />
        <SmallTool icon={<ImageIcon className="h-3.5 w-3.5" />} label="Library" title="Place a picture you already have in your Media Library" onClick={onLibrary} />
        <SmallTool icon={<BarChart3 className="h-3.5 w-3.5" />} label="Chart" title="Type numbers and get a chart in your brand colours" onClick={onChart} />
      </div>

      <div className="rounded border border-slate-200 bg-slate-50 p-2">
        <div className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
          <Sparkles className="h-3 w-3 text-[#EF6C33]" /> Ask for it
        </div>
        <textarea
          value={ai.prompt}
          onChange={(e) => ai.setPrompt(e.target.value)}
          placeholder='Describe it — "punchy headline for our spring special" or "a golden retriever in a hard hat"'
          title="Describe what you want in plain words"
          aria-label="Describe what you want"
          rows={3}
          className="w-full resize-none rounded border border-slate-200 px-2 py-1.5 text-[11px] focus:border-[#EF6C33] focus:outline-none"
        />
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <button
            type="button" onClick={ai.write} disabled={!ai.prompt.trim() || !!ai.busy}
            title="Write three options for the words — costs 1 credit"
            className="rounded bg-slate-800 px-2 py-1.5 text-[10px] font-bold text-white hover:bg-slate-700 disabled:opacity-40"
          >
            {ai.busy === "write" ? "Writing…" : "Write copy · 1cr"}
          </button>
          <button
            type="button" onClick={ai.generate} disabled={!ai.prompt.trim() || !!ai.busy}
            title="Make a picture from your description — costs 8 credits"
            className="rounded bg-[#EF6C33] px-2 py-1.5 text-[10px] font-bold text-white hover:bg-[#d75a25] disabled:opacity-40"
          >
            {ai.busy === "image" ? "Making…" : "Make image · 8cr"}
          </button>
        </div>
        {ai.error && <div className="mt-1.5 rounded border border-red-200 bg-red-50 p-1.5 text-[10px] text-red-700">{ai.error}</div>}
        {ai.options.length > 0 && (
          <div className="mt-1.5 space-y-1">
            {ai.options.map((o, i) => (
              <button
                key={i} type="button" onClick={() => ai.apply(o)} title="Use these words"
                className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-left text-[11px] text-slate-700 hover:border-[#EF6C33]"
              >
                {o}
              </button>
            ))}
            <div className="text-[9px] text-slate-400">Click one — it replaces the selected words, or drops in fresh.</div>
          </div>
        )}
      </div>
    </div>
  );
}

function SmallTool({ icon, label, title, onClick }: { icon: React.ReactNode; label: string; title: string; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick} title={title} aria-label={title}
      className="flex flex-col items-center justify-center gap-1 rounded border border-slate-200 bg-white px-2 py-2 text-[10px] font-semibold text-slate-700 hover:border-slate-800 hover:bg-slate-50"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function ExportOption({ icon, title, blurb, onClick, disabled, accent }: {
  icon: React.ReactNode; title: string; blurb: string; onClick: () => void; disabled?: boolean; accent?: boolean;
}) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled} title={`${title} — ${blurb}`}
      className="group flex items-start gap-3 rounded-lg border-2 border-slate-200 bg-white p-4 text-left transition-colors hover:border-[#EF6C33] hover:bg-[#EF6C33]/5 disabled:opacity-50"
    >
      <span className={"flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md " +
        (accent ? "bg-[#EF6C33]/10 text-[#EF6C33]" : "bg-slate-100 text-slate-600")}>
        {icon}
      </span>
      <span>
        <span className="block font-semibold text-slate-900">{title}</span>
        <span className="block text-xs leading-snug text-slate-500">{blurb}</span>
      </span>
    </button>
  );
}

function IconPicker({ onPick }: { onPick: (key: string) => void }) {
  return (
    <div className="grid max-h-[46vh] grid-cols-8 gap-1.5 overflow-y-auto">
      {Object.entries(ICON_PATHS_LIST).map(([key, d]) => (
        <button
          key={key} type="button" title={key} aria-label={key}
          onClick={() => onPick(key)}
          className="flex aspect-square items-center justify-center rounded border border-slate-200 hover:border-[#EF6C33]"
        >
          <svg viewBox="0 0 100 100" className="h-7 w-7"><path d={d} fillRule="evenodd" fill="#334155" /></svg>
        </button>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Media Library picker
   ══════════════════════════════════════════════════════════════════════════ */

interface PickerAsset {
  asset_id: string;
  blob_ref: string | null;
  url: string | null;
  width_px?: number | null;
  height_px?: number | null;
}

function AssetPickerModal({ onClose, onPick }: { onClose: () => void; onPick: (a: PickerAsset) => void }) {
  const { get, ready } = useLumenApi();
  const [assets, setAssets] = useState<PickerAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await get<{ rows?: PickerAsset[] }>("/api/v1/my-brand/assets?kind=image&limit=60");
        if (!cancelled) setAssets((r?.rows || []).filter((a) => a.url));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ready, get]);

  return (
    <IadmModal
      open onClose={onClose} product="spark" eyebrow="MY BRAND · DESIGN STUDIO"
      title="Place a picture" subtitle="Everything you have uploaded, generated or edited" size="nav"
    >
      <div className="max-h-[50vh] overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : error ? (
          <div className="rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">{error}</div>
        ) : assets.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            <Layers className="mx-auto mb-2 h-5 w-5 text-slate-300" />
            No pictures yet — upload one, or make one with “Ask for it”.
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {assets.map((a) => (
              <button
                key={a.asset_id} type="button" onClick={() => onPick(a)}
                title={`Place this picture (${a.width_px || "?"}×${a.height_px || "?"})`}
                className="group aspect-square overflow-hidden rounded border border-slate-200 bg-slate-50 hover:border-[#EF6C33]"
              >
                <img src={a.url || ""} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
              </button>
            ))}
          </div>
        )}
      </div>
    </IadmModal>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Small helpers
   ══════════════════════════════════════════════════════════════════════════ */

/** Older rows may carry layers with no id; the editor selects by id. */
function withIds(canvas: CanvasDoc): CanvasDoc {
  const clone: CanvasDoc = JSON.parse(JSON.stringify(canvas));
  clone.layers = (clone.layers || []).map((l) => (l.id ? l : { ...l, id: uid(l.kind) }));
  return clone;
}

/** The `kind` a saved template is filed under — the size it was drawn for. */
function kindForSize(scene: CanvasDoc): string {
  const hit = SIZE_PRESETS.find((s) => s.w === scene.width && s.h === scene.height);
  return hit ? hit.key : "custom";
}

export default StudioBuilder;
