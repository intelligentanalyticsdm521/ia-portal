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
  AlertTriangle, Copy, Download, FileImage, FileText, FolderOpen, Layers, Loader2,
  Palette, Plus, Save, Scaling, Send, Sparkles, Trash2,
} from "lucide-react";
import { ARGUS_BUBBLE_CLEARANCE, BuilderFrame } from "../../BuilderFrame";
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
  addLayers, addLayersBehind, alignLayers, brandSync, clampCanvasSide, copyStyleOf,
  distributeLayers, duplicateLayer, emptyCanvas, expandSelection, exportFilename,
  fixTextContrast, groupLayers, moveLayersToEdge, moveLayerToIndex, nudgeLayers,
  pasteStyle, patchLayer, removeLayer, reorderLayer, setBackgroundColor, smartResize,
  tidyUp, toggleLayerVisibility, uid, ungroupLayers, MAX_CANVAS_SIDE, MIN_CANVAS_SIDE,
  SIZE_PRESETS, resolveBrandTokens,
  addPage, docForPage, duplicatePage, emptySlotMessage, movePage, pageCount,
  removePage, setPage, MAX_PAGES,
  fillPictureSlot, isEmptySlot, setSelectionBox, turnSelection,
  ICON_PATHS as ICON_PATHS_LIST,
  type CanvasDoc, type CopiedStyle, type DesignDto, type ExportResult, type ImageLayer,
  type Layer, type TemplateDto,
} from "./scene";
import { StructureWindow } from "./StructureWindow";
import { setAssetBytesResolver, taintMessage, taintedIn } from "./fabricBridge";
import { imagePdfFromPngDataUrls, pdfPageSize, PDF_MIME } from "./pdf";

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

/** What the Ask ARGUS box suggests you type. One sentence, in plain words. */
const PROMPT_PLACEHOLDER =
  'Describe it — "punchy headline for our spring special" or "a golden retriever in a hard hat"';

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
  /**
   * `design` IS THE WHOLE THING; `doc` IS THE SIDE BEING EDITED (G-09).
   *
   * Round 1 had to hand in design 05 as two files "because a design has
   * exactly one artboard". A business card has two sides.
   *
   * The whole editor below — sixty-odd call sites, the canvas, the inspector,
   * the Structure window, every operation in `scene.ts` — works on ONE
   * artboard, and it should: a page is an artboard. So the multi-page-ness is
   * confined to exactly two lines. `doc` is the active side as a plain
   * one-page document, and `apply` writes it back into the side it came from.
   * Nothing downstream of these two lines knows pages exist, which is why
   * adding them did not touch the canvas or the inspector at all.
   */
  const [design, setDesign] = useState<CanvasDoc>(() => emptyCanvas());
  const [pageIndex, setPageIndex] = useState(0);
  const [history, setHistory] = useState<History<CanvasDoc>>(() => initHistory(emptyCanvas()));
  const doc = useMemo(() => docForPage(design, pageIndex), [design, pageIndex]);
  const pages = pageCount(design);
  /**
   * THE SELECTION IS A LIST (G-01), and it lives here rather than in the
   * canvas: the Structure window, the inspector and Fabric all have to agree
   * on it, and the only way three surfaces agree is if none of them owns it.
   */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  const selectOne = useCallback((id: string | null) => setSelectedIds(id ? [id] : []), []);

  /**
   * THE HISTORY, in a ref as well as in state — D-18 and D-40, one cause.
   *
   * BUILDER_USER_TEST_2026-09-16: *"The panel advertises ⌘/Ctrl+S, +D, +Z,
   * +⇧+Z, Del. Ctrl+D and Delete work. Ctrl+Z does not."* — so the
   * shortcut table was half true, which is worse than absent.
   *
   * Undo was `setHistory(h => { const n = undo(h); setDoc(n.present); return n; })`.
   * React may run a state updater during another component's render, and a
   * setState called from inside one is the "Cannot update a component while
   * rendering a different component" warning (D-40) — and the doc update it
   * schedules can be dropped, which is Ctrl+Z appearing to do nothing.
   *
   * Every write now computes the next history from the ref and sets both. No
   * updater function anywhere, so nothing of ours runs during a render. This is
   * the same fix stream A made in BuilderShell; the Studio has its own history
   * because its document is a canvas rather than a section list, and the fix
   * has to be made in both or the Studio keeps the bug.
   */
  const historyRef = useRef<History<CanvasDoc>>(initHistory(emptyCanvas()));
  const setHist = useCallback((h: History<CanvasDoc>) => { historyRef.current = h; setHistory(h); }, []);
  /**
   * The history is over the WHOLE DESIGN, not over the visible side.
   *
   * One stack per page would mean Ctrl+Z on the back of a card undoing
   * something on the front the moment you flipped it — undo has to be the
   * order things happened, and things happen on every side.
   */
  const applyDesign = useCallback((next: CanvasDoc, mergeKey: string | null = null) => {
    setHist(push(historyRef.current, next, mergeKey));
    setDesign(next);
  }, [setHist]);

  /**
   * Every existing caller hands in a one-page document; this puts it back on
   * the side it came from.
   *
   * A CHANGE OF SIZE IS THE ONE THING THAT IS NOT PER-PAGE. Smart Resize hands
   * back a document with new width and height, and a design whose front is
   * 1050 × 600 and whose back is 1275 × 1650 is not a design. So a width or
   * height that moved is written to the design AND the other sides are
   * re-anchored through the same `smartResize` this one went through — rather
   * than left at the old coordinates, which is the silent version of the same
   * bug.
   */
  const apply = useCallback((next: CanvasDoc, mergeKey: string | null = null) => {
    const resized = next.width !== design.width || next.height !== design.height;
    let base = design;
    if (resized) {
      base = { ...smartResize(design, next.width, next.height), width: next.width, height: next.height };
    }
    applyDesign(setPage(base, pageIndex, {
      background_color: next.background_color,
      background_gradient: next.background_gradient,
      layers: next.layers,
    }), mergeKey);
  }, [applyDesign, design, pageIndex]);

  /** A whole new scene — a template opened, a design loaded. The stack restarts
   *  so undo can never walk backwards into a different design. */
  const replaceScene = useCallback((next: CanvasDoc, select: string | null = null) => {
    setHist(initHistory(next));
    setDesign(next);
    setPageIndex(0);
    selectOne(select);
  }, [setHist, selectOne]);

  const doUndo = useCallback(() => {
    const n = undo(historyRef.current);
    setHist(n);
    setDesign(n.present);
    // A step that removed the side you were looking at must not leave the
    // editor pointing past the end of the design.
    setPageIndex((i) => Math.min(i, pageCount(n.present) - 1));
  }, [setHist]);
  const doRedo = useCallback(() => {
    const n = redo(historyRef.current);
    setHist(n);
    setDesign(n.present);
    setPageIndex((i) => Math.min(i, pageCount(n.present) - 1));
  }, [setHist]);

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
    selectOne(result.selectId);
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
      /* `image` AND `brand_logo` ASKED "Where is the picture?" BEFORE THEY
         LANDED, and they no longer do (2026-09-22). Elementor asks nothing
         before an insert: an Image tile drops an Image, and *Choose Image* is
         a control on the Content tab of the panel on the right. Ours is the
         same — the tile drops an empty slot (or, for Your logo, the brand
         kit's logo when there is one), and `ImageContent` in `LayerInspector`
         offers "Put a picture in this slot" and "Upload", which is where the
         deleted Upload / Library row's job went. */
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

  const duplicate = useCallback((id: string) => {
    const r = duplicateLayer(doc, id);
    apply(r.doc);
    if (r.id) selectOne(r.id);
  }, [apply, doc, selectOne]);

  /* ── Selecting more than one thing (G-01) ────────────────────────────── */

  /**
   * THE ONE PLACE A SELECTION IS DECIDED.
   *
   * Every surface that can change it — the canvas, the Structure window, a
   * keyboard shortcut — comes through here, and here is where a group becomes
   * the whole group. Doing that in the canvas would leave the Structure window
   * showing half a group selected; doing it in both would be two rules to keep
   * in step.
   */
  const changeSelection = useCallback((ids: string[]) => {
    setSelectedIds(expandSelection(doc, ids));
  }, [doc]);

  /** A row in the Structure window: plain click, Ctrl-click, Shift-click. */
  const selectFromStructure = useCallback((id: string, mode: "replace" | "additive" | "range") => {
    if (mode === "replace") { changeSelection([id]); return; }
    if (mode === "additive") {
      const next = selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id];
      changeSelection(next);
      return;
    }
    // Range: everything between the last thing picked and this one, in stack
    // order — which is what a person means by Shift-click in a list.
    const order = doc.layers.map((l) => l.id);
    const anchor = selectedIds.length ? order.indexOf(selectedIds[selectedIds.length - 1]) : -1;
    const here = order.indexOf(id);
    if (anchor < 0 || here < 0) { changeSelection([id]); return; }
    const [lo, hi] = anchor <= here ? [anchor, here] : [here, anchor];
    changeSelection(order.slice(lo, hi + 1));
  }, [changeSelection, doc.layers, selectedIds]);

  const selectedLayers = useMemo(
    () => doc.layers.filter((l) => selectedIds.includes(l.id)),
    [doc.layers, selectedIds],
  );

  /** Several boxes moved as one drag — ONE undo step, not one per member. */
  const onManyGeometry = useCallback((patches: Array<{ id: string; patch: Partial<Layer> }>) => {
    let next = doc;
    for (const { id, patch } of patches) next = patchLayer(next, id, patch);
    apply(next);
  }, [apply, doc]);

  const deleteLayers = useCallback((ids: string[]) => {
    let next = doc;
    for (const id of ids) next = removeLayer(next, id);
    apply(next);
    setSelectedIds((cur) => cur.filter((id) => !ids.includes(id)));
  }, [apply, doc]);

  const doGroup = useCallback((ids: string[]) => {
    const r = groupLayers(doc, ids);
    if (!r.groupId) return;
    apply(r.doc);
  }, [apply, doc]);

  /* ── Copy the look (G-13) ────────────────────────────────────────────── */
  const [copiedStyle, setCopiedStyle] = useState<CopiedStyle | null>(null);
  const copyStyle = useCallback((id: string) => {
    setCopiedStyle(copyStyleOf(doc.layers.find((l) => l.id === id) || null));
  }, [doc.layers]);
  const applyCopiedStyle = useCallback((ids: string[]) => {
    if (!copiedStyle) return;
    apply(pasteStyle(doc, ids, copiedStyle));
  }, [apply, copiedStyle, doc]);

  /* ── The floating Structure window (G-19, §11.13.1) ──────────────────── */
  const [structureOpen, setStructureOpen] = useState(false);

  /* ── Pictures ────────────────────────────────────────────────────────── */
  /**
   * WHICH SLOT A PICTURE IS FOR (R2-C).
   *
   * Null means "no slot in particular" and a picture lands as a new centred
   * layer, exactly as it always did. An id means the author pressed "Put a
   * picture in this slot" on a cell of a photo grid, and what comes back fills
   * THAT cell — keeping its box, its corners, its crop shape and its border,
   * because those are the layout and the picture is only its contents.
   */
  /**
   * WHERE THE CANVAS GETS A LIBRARY PICTURE FROM (R2-A).
   *
   * `fabricBridge` must not know about tenants or auth, and the blob host will
   * not answer a CORS request — so the bridge asks THIS for the bytes, and it
   * asks LUMEN, with the same headers every other call carries. Registered here
   * because this is where the API client lives, and asserted to be registered
   * by the suite, because a seam that silently falls back hides the defect it
   * was built for.
   */
  useEffect(() => {
    setAssetBytesResolver(async (assetId: string) => {
      const r = await get<{ dataUrl?: string }>(`/api/v1/my-brand/assets/${assetId}/bytes`);
      return r?.dataUrl || null;
    });
    return () => setAssetBytesResolver(null);
  }, [get]);

  const [slotTarget, setSlotTarget] = useState<string | null>(null);
  const openSlotPicker = useCallback((id: string) => {
    setSlotTarget(id);
    setLibraryOpen(true);
  }, []);

  /** The same slot, from a file on this machine — the library may be empty. */
  const uploadToSlot = useCallback((id: string) => {
    setSlotTarget(id);
    fileInputRef.current?.click();
  }, []);

  const placeAsset = useCallback((asset: PickerAsset) => {
    /**
     * A SLOT IS FILLED, NOT COVERED.
     *
     * The target is the slot the author asked to fill; failing that, the
     * EMPTY picture layer they have selected — because clicking a grid cell
     * and then picking a picture can only mean one thing, and round 2 answered
     * it by dropping a second picture in the middle of the design instead.
     */
    const target = slotTarget
      ? doc.layers.find((l) => l.id === slotTarget && l.kind === "image")
      : isEmptySlot(selected) ? selected : null;
    if (target && asset.url) {
      apply(fillPictureSlot(doc, target.id, {
        src: asset.url,
        asset_id: asset.asset_id,
        blob_ref: asset.blob_ref,
      }));
      selectOne(target.id);
      setSlotTarget(null);
      setLibraryOpen(false);
      return;
    }
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
    selectOne(layer.id);
    setLibraryOpen(false);
  }, [apply, doc, selected, slotTarget]);

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
      // The upload did not reach the library, but the author still asked for a
      // picture IN A SLOT — so it goes in the slot, as the bytes they chose.
      const target = slotTarget
        ? doc.layers.find((l) => l.id === slotTarget && l.kind === "image")
        : isEmptySlot(selected) ? selected : null;
      if (target) {
        apply(fillPictureSlot(doc, target.id, { src: dataUrl }));
        selectOne(target.id);
        setSlotTarget(null);
        return;
      }
      place("image", { imageSrc: dataUrl });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }, [apply, doc, place, placeAsset, post, selected, slotTarget]);

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
  /* ONE DOOR, IN THE BAR (D-172). This used to be a box living in the left
     panel; the panel is the Elements panel now, so the same two actions sit
     behind the bar's Ask ARGUS button, in a dialog over the canvas. */
  const [askOpen, setAskOpen] = useState(false);
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
      selectOne(r.selectId);
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
      // The WHOLE design is saved, every side of it — `doc` is only the side
      // on screen, and saving that would quietly throw the back of the card away.
      const body = { canvas: design, name: designName };
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
  }, [currentDesignId, design, designName, p, post, put, ready]);

  /** §7: open one, adjust it, SAVE AS A NEW TEMPLATE. */
  const [templateName, setTemplateName] = useState("");
  const [templateBusy, setTemplateBusy] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const saveAsTemplate = useCallback(async () => {
    const name = templateName.trim() || designName;
    setTemplateBusy(true); setTemplateError(null);
    try {
      const created = await post<TemplateDto>("/api/v1/my-brand/templates", {
        name, kind: kindForSize(doc), canvas: design,
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
  /** How big the PDF's one page is — said out loud on the menu, not implied. */
  const pageSize = useMemo(() => pdfPageSize(doc), [doc]);

  const download = useCallback((href: string, filename: string) => {
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, []);

  const exportLocal = useCallback(async (format: "png" | "jpg" | "svg" | "pdf") => {
    setExporting(format); setExportError(null);
    try {
      /**
       * A DOWNLOAD REFUSES RATHER THAN DROPPING A SLOT (parity D-6).
       *
       * Round 1: *"'Leave an empty slot for now' draws a grey slot with
       * instructions on the canvas and writes no ink into the PNG."* The
       * author does not find out until the file is at the printer.
       *
       * The two honest answers were export the slot or refuse; exporting it
       * ships a grey instruction box in a customer's flyer, so it refuses, by
       * name, in the same sentence LUMEN's own export refuses with
       * (`scene.emptySlotMessage` and `templateStudio.emptySlotMessage`
       * produce the same words).
       *
       * Checked against the WHOLE design, not the visible side: page two's
       * empty slot is just as missing.
       */
      const blocked = emptySlotMessage(design);
      if (blocked) throw new Error(blocked);
      /**
       * A PHOTOGRAPH THAT POISONED THE WHOLE DOWNLOAD (round-3 R2-A).
       *
       * Six of the ten reference designs could not be downloaded at all: PNG,
       * JPG and PDF each died with the browser's own "Tainted canvases may not
       * be exported", which tells an author nothing and offers them nothing.
       *
       * `fabricBridge` now asks every picture's host for permission, so the
       * ordinary case simply works. This is the case where a host refuses:
       * rather than let the browser throw, the design says which pictures and
       * where to go instead. An SVG carries the picture by reference and never
       * reads the canvas back, so it is not refused.
       */
      if (format !== "svg") {
        const dirty = taintedIn(design.layers.concat(...(design.pages || []).map((pg) => pg.layers)));
        if (dirty.length) throw new Error(taintMessage(dirty.length));
      }
      if (format === "svg") {
        const svg = canvasRef.current?.toSVG();
        if (!svg) throw new Error("the design could not be drawn");
        const href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        download(href, exportFilename(designName, "svg"));
      } else if (format === "pdf") {
        // EVERY side, each at the artboard's real size, the SAME picture the
        // PNG download gets — see pdf.ts. No library, no server round trip.
        //
        // The side on screen is captured from the live canvas, exactly as it
        // always was; the others are drawn off screen. A one-page design
        // therefore takes the identical path it took before pages existed.
        const urls: string[] = [];
        for (let i = 0; i < pages; i++) {
          const url = i === pageIndex
            ? canvasRef.current?.toDataURL("png")
            : await canvasRef.current?.renderPage(docForPage(design, i));
          if (!url) throw new Error(`page ${i + 1} could not be drawn`);
          urls.push(url);
        }
        const bytes = await imagePdfFromPngDataUrls(urls, pageSize, designName);
        const href = URL.createObjectURL(new Blob([bytes], { type: PDF_MIME }));
        download(href, exportFilename(designName, "pdf"));
        // Freed on a timer, not immediately: revoking before the anchor's click
        // has been serviced cancels the download in Chrome.
        setTimeout(() => URL.revokeObjectURL(href), 60_000);
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
  }, [design, designName, download, pageIndex, pages, pageSize]);

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
      /**
       * Ctrl+I opens Structure — §11.13.1 names that key for every builder.
       *
       * IT WORKS WITH THE CARET IN A FIELD (parity D-7). Round 1: *"After
       * typing an X into Advanced, the shortcut is swallowed by the typing
       * guard. The toolbar button works; the shortcut card promises the key."*
       *
       * The typing guard is right for Ctrl+Z, Ctrl+D and Delete, because each
       * of those means something ELSE inside a text field — undo the typing,
       * delete the character. Opening a window means the same thing wherever
       * the caret is, and Ctrl+I is not a field shortcut in any browser (the
       * one page context that claims it, rich-text italic, is not a thing this
       * inspector has). So the guard does not apply to it.
       *
       * The field is blurred first: leaving the caret in a number box while a
       * floating window takes focus is how a half-typed X gets abandoned.
       */
      if (mod && e.key.toLowerCase() === "i") {
        e.preventDefault();
        if (typing && t) t.blur();
        setStructureOpen((v) => !v);
        return;
      }
      if (mod && e.key.toLowerCase() === "g") {
        if (typing || !selectedIds.length) return;
        e.preventDefault();
        if (e.shiftKey) apply(ungroupLayers(doc, selectedIds));
        else doGroup(selectedIds);
        return;
      }
      // Arrow-key nudge: one pixel, ten with Shift, the same as every design
      // tool. Not wired before, and it is what "move it two pixels left"
      // actually needs — a drag cannot do two pixels.
      if (!typing && !mod && selectedIds.length &&
          (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        // One undo step per burst of taps on the same arrow, not one per tap.
        apply(nudgeLayers(doc, selectedIds, dx, dy), `nudge:${selectedIds.join(",")}`);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && !typing && selectedIds.length) {
        e.preventDefault();
        deleteLayers(selectedIds);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p.open, save, doUndo, doRedo, duplicate, deleteLayers, doGroup, apply, doc, selectedId, selectedIds]);

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
        /* The walk: *"The modal title says 'New design' while the name field
           beside it says 'Spring cleanup promo'."* A design that came from a
           template is not new and is not untitled — the title says what is
           actually open. */
        title={designName?.trim() || (currentDesignId ? "Edit design" : "New design")}
        canUndo={canUndo(history)}
        canRedo={canRedo(history)}
        onUndo={doUndo}
        onRedo={doRedo}
        /* OUR ANGIE, IN THE BAR AND NOWHERE ELSE (D-172). The studio's own AI
           — three written options for the words, or a generated picture — is
           what the panel's "Ask for it" box did; this is the same two actions
           behind the same one door every other builder's AI is behind. */
        askArgus={
          <button type="button" data-builder-argus onClick={() => setAskOpen(true)}
            title="Ask ARGUS"
            aria-label="Ask ARGUS"
            /* ARGUS's own gold as a Tailwind arbitrary class, never as a style
               VALUE: `test/brand-kit.test.mjs`'s grep draws exactly that line —
               our control chrome may carry our colour, a business's brand may
               only come out of the kit — and the studio is a brand consumer. */
            className="text-[#FEC82C]"
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 28, height: 28, borderRadius: 4, border: "1px solid rgba(255,255,255,0.25)",
              background: "transparent", cursor: "pointer",
            }}>
            <Sparkles size={15} />
          </button>
        }
        headerActions={
          <>
            {/* ADD TEMPLATE — the reference's folder, and the studio's own
                counterpart of the proposal builder's add-area folder button.
                The studio's canvas is absolute pixels and has no add area, so
                the folder lives in the bar; it opens the SAME gallery the
                studio opens on when there is nothing on the page yet
                (§7, "never a blank page"). */}
            <button type="button" data-studio-templates
              title="Add Template" aria-label="Add Template"
              onClick={() => setGalleryOpen(true)}
              className="inline-flex h-7 w-7 items-center justify-center rounded border border-white/20 bg-transparent text-white hover:bg-white/10"
            >
              <FolderOpen className="h-3.5 w-3.5" />
            </button>
            {saving ? (
              <span className="text-[11px] text-white/60">Saving…</span>
            ) : lastSavedAt && !saveError ? (
              /* D-36: one Save behaviour in all four builders — stay open, and
                 show a tick that says when. */
              <span data-saved-tick className="text-[11px] text-white/70">
                Saved ✓ {lastSavedAt.toLocaleTimeString()}
              </span>
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
          /* D-31: the Ask ARGUS bubble is `fixed bottom-5 right-5 z-[9000]`
             and floated ON TOP OF Save — a measured overlap at 1600×900, not
             a judgement call. Cleared DOWNWARDS, which is the rule the phone
             pass settled on for the document builders (BuilderFrame's
             ARGUS_BUBBLE_CLEARANCE, exported from BuilderFrame — C-A-1):
             reserving the bubble's WIDTH took 150 of
             a 390px phone and pushed a button off the screen, while its height
             is the same at every width. */
          <div style={{
            display: "flex", width: "100%", alignItems: "center", justifyContent: "flex-end",
            gap: 8, flexWrap: "wrap", paddingBottom: ARGUS_BUBBLE_CLEARANCE,
          }}>
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
          </div>
        }
        /* THE LEFT PANEL IS THE ELEMENTS PANEL (D-165 item 1, D-172 law 1).
           The shared `WidgetPane` over the registry, `adapter="brand"`,
           exactly as the other four builders draw it, showing the tiles
           `BUILDER_OFFERS_2026-09-19.json` gives `builders.mybrand` and
           nothing else. The studio's own furniture that used to sit above it
           is DELETED — see the note where `StudioPaneHeader` was.

           The ONE thing that may still appear over the tiles is a question
           being asked THIS SECOND (Which shape? What should the code open?),
           and only while it is being asked: the strip is not drawn at all
           otherwise, so an author who is not mid-insert sees the panel and
           nothing above it. The reference does the same when it replaces the
           panel with "Select your structure". */
        pane={
          <>
            {chooser && (
            <div style={{ borderBottom: "1px solid #E2E8F0", padding: 12 }}>
              <>
              {/* D-36: "Which shape?" opened a SECOND full-screen modal over
                  the canvas, so the author could not see where the shape would
                  land, and its bottom half was empty. A three-way choice does
                  not need a dialog — it belongs beside the button that asked
                  it, with the canvas still in view. The icon picker keeps its
                  dialog: it is a searchable grid of hundreds and there is no
                  room for it here. */}
              {chooser && chooser.options && (
                <div data-inline-chooser style={{
                  border: "1px solid #FDBA74", background: "#FFF7ED", borderRadius: 8,
                  padding: 10, marginBottom: 10,
                }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#7C2D12" }}>{chooser.title}</span>
                    <button type="button" title="Never mind" onClick={() => setChooser(null)}
                      style={{ border: "none", background: "transparent", color: "#9A3412", fontSize: 11, cursor: "pointer" }}>
                      Cancel
                    </button>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 7 }}>
                    {chooser.options.map((o) => (
                      <button key={o.value} type="button" data-chooser-option={o.value}
                        title={o.hint ? `${o.label} — ${o.hint}` : o.label}
                        onClick={() => void answerChooser(o.value)}
                        style={{
                          display: "flex", alignItems: "center", gap: 8, textAlign: "left",
                          border: "1px solid #E2E8F0", background: "#fff", borderRadius: 6,
                          padding: "7px 9px", cursor: "pointer", fontSize: 11, color: "#0B1C24",
                        }}>
                        {o.swatch && <span style={{ width: 16, height: 16, borderRadius: 3, border: "1px solid #CBD5E1", background: o.swatch }} />}
                        <span>
                          <span style={{ display: "block", fontWeight: 700 }}>{o.label}</span>
                          {o.hint && <span style={{ display: "block", color: "#64748B" }}>{o.hint}</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              </>
            </div>
            )}
            <div style={{ minHeight: 0, flex: 1 }}>
              <WidgetPane adapter="brand" onInsert={onInsert} />
            </div>
          </>
        }
        inspector={
          <LayerInspector
            doc={doc}
            brand={brand}
            selected={selected}
            selectedLayers={selectedLayers}
            onUpdate={updateLayer}
            onDelete={deleteLayers}
            onDuplicate={duplicate}
            onReorder={(id, d) => apply(reorderLayer(doc, id, d))}
            onToEdge={(ids, edge) => apply(moveLayersToEdge(doc, ids, edge))}
            onToggleVisibility={(id) => apply(toggleLayerVisibility(doc, id))}
            onAlign={(ids, which) => apply(alignLayers(doc, ids, which))}
            onDistribute={(ids, axis) => apply(distributeLayers(doc, ids, axis))}
            onTidy={(ids) => apply(tidyUp(doc, ids))}
            onGroup={doGroup}
            onUngroup={(ids) => apply(ungroupLayers(doc, ids))}
            onCopyStyle={copyStyle}
            onPasteStyle={applyCopiedStyle}
            onSelectionBox={(ids, box) => apply(setSelectionBox(doc, ids, box))}
            onTurnSelection={(ids, to, from) => apply(turnSelection(doc, ids, to, from))}
            onFillSlot={openSlotPicker}
            onUploadToSlot={uploadToSlot}
            copiedStyleKind={copiedStyle?.kind ?? null}
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
          {/*
            THE PAGE STRIP (G-09).
            It is drawn only once there is more than one side, or once somebody
            has hovered the Add-a-side button into existence — a single-page
            poster should not carry a page rail it will never use. Canva puts
            the same strip under the canvas and so does this.
          */}
          <div className="flex items-center gap-1 border-b border-slate-100 px-4 py-1.5 text-[10px]">
            {Array.from({ length: pages }, (_, i) => (
              <div key={i} className="group flex items-center">
                <button
                  type="button"
                  data-page-tab={i}
                  onClick={() => { setPageIndex(i); selectOne(null); }}
                  title={pages === 2 ? (i === 0 ? "The front" : "The back") : `Side ${i + 1} of ${pages}`}
                  className={"rounded-l border px-2 py-1 font-semibold " + (i === pageIndex
                    ? "border-slate-800 bg-slate-800 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")}
                >
                  {pages === 2 ? (i === 0 ? "Front" : "Back") : `Side ${i + 1}`}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const out = duplicatePage(design, i);
                    applyDesign(out.doc);
                    setPageIndex(out.index);
                    selectOne(null);
                  }}
                  disabled={pages >= MAX_PAGES}
                  title="Make a copy of this side"
                  className="border-y border-slate-200 bg-white px-1 py-1 text-slate-400 hover:text-slate-700 disabled:text-slate-200"
                >
                  <Copy className="h-2.5 w-2.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    applyDesign(removePage(design, i));
                    setPageIndex((cur) => Math.min(cur, pages - 2));
                    selectOne(null);
                  }}
                  disabled={pages <= 1}
                  title={pages <= 1 ? "A design has to have one side" : "Delete this side"}
                  className="rounded-r border border-slate-200 bg-white px-1 py-1 text-slate-400 hover:text-red-600 disabled:text-slate-200"
                >
                  <Trash2 className="h-2.5 w-2.5" />
                </button>
                {i > 0 && (
                  <button
                    type="button"
                    onClick={() => { applyDesign(movePage(design, i, i - 1)); setPageIndex(i - 1); }}
                    title="Move this side earlier"
                    className="ml-0.5 rounded border border-slate-200 bg-white px-1 py-1 text-slate-400 hover:text-slate-700"
                  >
                    ←
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              data-add-page
              onClick={() => {
                const out = addPage(design);
                applyDesign(out.doc);
                setPageIndex(out.index);
                selectOne(null);
              }}
              disabled={pages >= MAX_PAGES}
              title={pages >= MAX_PAGES
                ? `A design can have up to ${MAX_PAGES} sides`
                : "Add another side — the back of a card, the second page of a flyer. Every side is the same size, and the PDF download carries them all."}
              className="ml-1 inline-flex items-center gap-1 rounded border border-dashed border-slate-300 px-2 py-1 font-semibold text-slate-600 hover:bg-slate-50 disabled:text-slate-300"
            >
              <Plus className="h-2.5 w-2.5" /> Add a side
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <PixelCanvas
              ref={canvasRef}
              doc={doc}
              selectedIds={selectedIds}
              onSelect={changeSelection}
              onLayerGeometry={onGeometry}
              onManyGeometry={onManyGeometry}
              overlay={
                <StructureWindow
                  open={structureOpen}
                  onClose={() => setStructureOpen(false)}
                  layers={doc.layers}
                  selectedIds={selectedIds}
                  onSelect={selectFromStructure}
                  onMove={(id, toIndex) => apply(moveLayerToIndex(doc, id, toIndex))}
                  onToggleVisibility={(id) => apply(toggleLayerVisibility(doc, id))}
                  onToggleLock={(id) => {
                    const l = doc.layers.find((x) => x.id === id);
                    if (l) apply(patchLayer(doc, id, { locked: l.locked !== true }));
                  }}
                />
              }
              toolbar={
                <div className="flex items-center gap-2 rounded border border-slate-200 bg-white px-2 py-1 shadow-sm">
                  <button
                    type="button"
                    data-structure-toggle
                    onClick={() => setStructureOpen((v) => !v)}
                    title="Structure — the list of everything on this design, as a window you can drag out of the way (⌘/Ctrl+I)"
                    className={"inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold hover:bg-slate-100 " +
                      (structureOpen ? "bg-slate-100 text-slate-900" : "text-slate-700")}
                  >
                    <Layers className="h-3 w-3" /> Structure
                  </button>
                  <div className="h-4 w-px bg-slate-200" />
                  <button
                    type="button"
                    onClick={hasProTools ? () => setResizeOpen(true) : undefined}
                    disabled={!hasProTools}
                    title={hasProTools
                      ? "Resize this design for another platform, or a size of your own — everything re-anchors itself"
                      : "Resizing a finished design is a Pro feature"}
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
                  >
                    <Scaling className="h-3 w-3" /> Resize{!hasProTools && " · Pro+"}
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

      {/* Only the two that genuinely need the room: the icon grid and the one
          free-text answer. The list choices are inline in the pane (D-36). */}
      {chooser && !chooser.options && (
        <IadmModal
          open onClose={() => setChooser(null)} product="spark"
          eyebrow="MY BRAND · DESIGN STUDIO" title={chooser.title} size="nav"
        >
          <div className="p-5">
            {chooser.kind === "icon" ? (
              <IconPicker onPick={(key) => void answerChooser(key)} />
            ) : (
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
            )}
          </div>
        </IadmModal>
      )}

      {libraryOpen && <AssetPickerModal onClose={() => { setLibraryOpen(false); setSlotTarget(null); }} onPick={placeAsset} />}

      {/* ASK ARGUS — what the panel's "Ask for it" box did, behind the bar's
          one door. The same two calls, the same credits, the same words. */}
      {askOpen && (
        <IadmModal
          open size="info" product="spark"
          title="Ask ARGUS"
          onClose={() => { setAskOpen(false); setAiError(null); }}
        >
          <div style={{ padding: 16 }} data-studio-ask>
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder={PROMPT_PLACEHOLDER}
              title="Describe what you want in plain words"
              aria-label="Describe what you want"
              rows={3}
              className="w-full resize-none rounded border border-slate-200 px-2 py-1.5 text-xs focus:border-[#EF6C33] focus:outline-none"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <IadmButton variant="ghost" disabled={!aiPrompt.trim() || !!aiBusy}
                title="Write three options for the words — costs 1 credit"
                onClick={() => void aiWrite()}>
                {aiBusy === "write" ? "Writing…" : "Write copy · 1cr"}
              </IadmButton>
              <IadmButton variant="accent" product="spark" disabled={!aiPrompt.trim() || !!aiBusy}
                title="Make a picture from your description — costs 8 credits"
                onClick={() => void aiGenerate()}>
                {aiBusy === "image" ? "Making…" : "Make image · 8cr"}
              </IadmButton>
            </div>
            {aiError && <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-[11px] text-red-700">{aiError}</div>}
            {aiOptions.length > 0 && (
              <div className="mt-2 space-y-1">
                {aiOptions.map((o, i) => (
                  <button
                    key={i} type="button" onClick={() => { aiApply(o); setAskOpen(false); }} title="Use these words"
                    className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-left text-xs text-slate-700 hover:border-[#EF6C33]"
                  >
                    {o}
                  </button>
                ))}
                <div className="text-[10px] text-slate-400">Click one — it replaces the selected words, or drops in fresh.</div>
              </div>
            )}
          </div>
        </IadmModal>
      )}

      {resizeOpen && (
        <IadmModal
          open onClose={() => setResizeOpen(false)} product="spark"
          eyebrow="MY BRAND · DESIGN STUDIO" title="Resize this design"
          subtitle="Everything re-anchors itself — edges stay on edges, full-width bands stay full width."
          size="nav"
        >
          <div className="max-h-[60vh] overflow-y-auto p-5">
            <div className="grid grid-cols-2 gap-2">
              {SIZE_PRESETS.map((s) => {
                const activeSize = doc.width === s.w && doc.height === s.h;
                return (
                  <button
                    key={s.key}
                    type="button"
                    disabled={activeSize}
                    title={activeSize ? "This is the size you are on" : `Resize to ${s.label}, ${s.w}×${s.h}`}
                    onClick={() => { apply(smartResize(doc, s.w, s.h)); setResizeOpen(false); }}
                    className={`flex items-center justify-between rounded-lg border-2 px-3 py-2 text-left text-xs transition-colors ${
                      activeSize ? "border-[#EF6C33] bg-[#EF6C33]/5 text-slate-900"
                        : "border-slate-200 bg-white text-slate-700 hover:border-[#EF6C33] hover:bg-[#EF6C33]/5"
                    }`}
                  >
                    <span className="font-semibold">{s.label}</span>
                    <span className="tabular-nums text-slate-400">{s.w}×{s.h}</span>
                  </button>
                );
              })}
            </div>
            <CustomSize
              width={doc.width}
              height={doc.height}
              onApply={(w, h) => { apply(smartResize(doc, w, h)); setResizeOpen(false); }}
            />
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
              disabled={!!exporting} onClick={() => void exportLocal("png")} />
            <ExportOption icon={<Download className="h-5 w-5" />} title="Download JPG"
              blurb="Smaller file, no transparency — fine for a photo-heavy post."
              disabled={!!exporting} onClick={() => void exportLocal("jpg")} />
            <ExportOption icon={<Download className="h-5 w-5" />} title="Download SVG"
              blurb="Sharp at any size — what a sign maker or a printer asks for."
              disabled={!!exporting} onClick={() => void exportLocal("svg")} />
            <ExportOption icon={<FileText className="h-5 w-5" />} title="Download PDF"
              blurb={`One page at its real size — ${pageSize.label}, ${pageSize.dpi} dpi. What a print shop asks for.`}
              disabled={!!exporting} onClick={() => void exportLocal("pdf")} />
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

/* `AiPaneState` AND `StudioPaneHeader` LIVED HERE and are DELETED
   (2026-09-22, D-165 item 1 / D-172 law 1). They drew the studio's OWN
   furniture at the top of the left panel - a *Start from a template* button,
   an Upload / Library / Chart row and an **Ask for it** box with *Write copy
   1cr* and *Make image 8cr*. The left panel is the Elements panel: the tiles
   the offer file gives My Brand, in Elementor's groups, and nothing else.
   Where each piece went is written beside its new home:

     Start from a template  -> the bar's folder button, titled Add Template,
                               which is where the reference puts it, and the
                               studio's counterpart of the proposal builder's
                               add-area folder. It opens the same gallery.
     Upload / Library       -> the Picture's own Content controls on the RIGHT
                               (`ImageContent` in LayerInspector: "Put a
                               picture in this slot" and "Upload"), which
                               already existed, so the row was a second door
                               to a job already done once.
     Chart                  -> DELETED, and nothing replaces it. The offer
                               file gives My Brand nineteen things and a chart
                               is not one of them; Elementor has no chart
                               widget either, and THE SCREEN LAW's rule is
                               that what the reference does not have is not on
                               our screen. The chart LAYER keeps its renderer,
                               its inspector and its exporters, so a design
                               already carrying one still opens and draws. A
                               chart tile is an IA-twin question for Brandon
                               and is written up in the handoff.
     Ask for it             -> the bar's Ask ARGUS (D-172: one door to the AI,
                               in the bar and nowhere else). The same two
                               actions and the same credits, in the dialog
                               that button opens. */

/**
 * A size of your own (G-11).
 *
 * The ratio lock is the whole reason this is not two boxes: the common job is
 * "the same poster, but A3", and typing one number and having the other follow
 * is what keeps a design from being squashed by a typo. The sides are clamped
 * to what the SERVER will render — an export refuses over 6000 px a side, and
 * a design authored at 8000 would be a design that can never be downloaded.
 */
function CustomSize({ width, height, onApply }: {
  width: number; height: number; onApply: (w: number, h: number) => void;
}) {
  const [w, setW] = useState(String(width));
  const [h, setH] = useState(String(height));
  const [lock, setLock] = useState(false);
  const ratio = height > 0 ? width / height : 1;
  const cw = clampCanvasSide(w);
  const ch = clampCanvasSide(h);
  const unchanged = cw === width && ch === height;
  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">A size of your own</div>
      <div className="flex items-end gap-2">
        <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Wide
          <input
            type="number" min={MIN_CANVAS_SIDE} max={MAX_CANVAS_SIDE}
            value={w}
            title={`How wide, in pixels — between ${MIN_CANVAS_SIDE} and ${MAX_CANVAS_SIDE}`}
            aria-label="Custom width in pixels"
            data-custom-width
            onChange={(e) => {
              setW(e.target.value);
              if (lock) setH(String(clampCanvasSide(Number(e.target.value) / (ratio || 1))));
            }}
            className="mt-0.5 w-24 rounded border border-slate-300 px-1.5 py-1 text-[11px] font-normal normal-case tabular-nums"
          />
        </label>
        <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Tall
          <input
            type="number" min={MIN_CANVAS_SIDE} max={MAX_CANVAS_SIDE}
            value={h}
            title={`How tall, in pixels — between ${MIN_CANVAS_SIDE} and ${MAX_CANVAS_SIDE}`}
            aria-label="Custom height in pixels"
            data-custom-height
            onChange={(e) => {
              setH(e.target.value);
              if (lock) setW(String(clampCanvasSide(Number(e.target.value) * (ratio || 1))));
            }}
            className="mt-0.5 w-24 rounded border border-slate-300 px-1.5 py-1 text-[11px] font-normal normal-case tabular-nums"
          />
        </label>
        <label
          className="flex items-center gap-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500"
          title="Keep the same shape — change one side and the other follows"
        >
          <input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} />
          Keep the shape
        </label>
        <button
          type="button"
          disabled={unchanged}
          onClick={() => onApply(cw, ch)}
          title={unchanged ? "That is the size you are already on" : `Resize to ${cw}×${ch}`}
          className="ml-auto rounded bg-slate-800 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Resize
        </button>
      </div>
      {(cw !== Number(w) || ch !== Number(h)) && (
        <div className="mt-1.5 text-[10px] text-amber-700">
          Sides are kept between {MIN_CANVAS_SIDE} and {MAX_CANVAS_SIDE} pixels — that is the biggest picture we can render for you.
        </div>
      )}
    </div>
  );
}

/* The tile renderer of the Upload / Library / Chart row went with the row. */

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
            No pictures yet — upload one, or make one with Ask ARGUS.
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
