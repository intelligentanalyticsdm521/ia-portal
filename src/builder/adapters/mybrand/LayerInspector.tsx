/**
 * builder/adapters/mybrand/LayerInspector.tsx — the RIGHT pane of the shared shell.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §11.13.1, the screen agreed with Brandon on
 * 2026-09-19: *"the settings on the right … with the three tabs Content / Style
 * / Advanced and collapsible sections named as Elementor names them."* Gap G-20.
 *
 * ── WHAT CHANGED, AND WHY IT IS NOT JUST TIDYING ──────────────────────────
 * This pane used to be one long scroll with the LAYER LIST stapled to the
 * bottom of it. Two things were wrong with that and both are fixed here:
 *
 *   1. The list is gone — it is the floating **Structure** window now
 *      (StructureWindow.tsx, §11.13.1, gap G-19), which gives the inspector
 *      back the whole height and puts the stack where the agreed screen says.
 *   2. Everything else is filed under **Content / Style / Advanced** in named
 *      collapsible sections. That is not decoration: Canva parity adds roughly
 *      twenty controls to this pane, and twenty more controls in one scroll is
 *      a pane nobody can find anything in. Each new control below has exactly
 *      one home, written down in BUILDER_MYBRAND_VS_CANVA_2026-09-19 §3.
 *
 * The two rules the pane has always followed still hold:
 *
 *   • It only shows what has no place on the page itself. Words are typed on
 *     the canvas; position, colour, font and stacking are typed here.
 *   • EVERY button carries a tooltip (SD-010, not optional).
 *
 * ── SWATCHES AND FONTS ────────────────────────────────────────────────────
 * Q4 (Brandon 2026-09-15): "any colour, any font we carry; the brand kit
 * pre-fills the swatches and the default fonts". So every colour control is
 * the business's five swatches, then a hex box, then the system picker — in
 * that order — and the font list is their two faces first and the rest under
 * them. Brand-first is a SORT ORDER. Nothing here is locked to the brand, and
 * nothing here writes back to it: Brand Identity is the kit's one writer (§2
 * step 0), and a colour chosen on a design is an override on that design.
 */
import { useState, type ReactNode } from "react";
import {
  AlignCenter, AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal,
  AlignEndVertical, AlignHorizontalSpaceAround, AlignLeft, AlignRight,
  AlignStartHorizontal, AlignStartVertical, AlignVerticalSpaceAround,
  Bold, Brush, ChevronDown, ChevronRight, ChevronsDown, ChevronsUp, ChevronUp,
  Contrast, Copy, Group, Italic, Lock, Palette, Plus, Sparkles, Star, Strikethrough,
  Trash2, Underline, Ungroup, Unlock, Upload, Wand2, WandSparkles, X,
} from "lucide-react";
import {
  bakedSlantDeg, boundsOf, familyOf, fontOptions, isSlantShape, selectionRotation,
  textFitWarning, ICON_PATHS,
  type Box, type CanvasDoc, type ChartLayer, type ImageFilters, type ImageLayer, type ImageMask,
  type Layer, type PatternSpec, type ShapeLayer, type TextLayer,
} from "./scene";

import { TEXT_EFFECTS, curveMaxBulge, type StrokeStyle, type TextCase } from "./textEffects";
import type { StudioBrand } from "./insert";
import { brandSwatches } from "./insert";

/**
 * EVERY SHAPE THE STUDIO DRAWS IS A FRAME (G-06).
 *
 * The list is `ICON_PATHS`' own keys rather than a second list beside it: the
 * exporter validates by key, and a hand-kept menu would be the place the two
 * drifted. The labels are only for the handful whose key is not already a
 * word somebody would recognise.
 */
const FRAME_SHAPES = Object.keys(ICON_PATHS);
const FRAME_LABELS: Record<string, string> = {
  blob1: "Organic 1", blob2: "Organic 2", blob3: "Organic 3",
  wave: "Wave", wave2: "Wave, soft", halfcircle: "Half circle",
  quartercircle: "Quarter circle", xmark: "Cross", bubble: "Speech bubble",
  // R2-D: the slanted quads designs 03 and 07 both wanted, named the way
  // somebody laying out a page would ask for them.
  parallelogram: "Slanted box", trapezoid: "Tapered box",
  slant: "Angled edge", octagon: "Octagon",
};

/** The repeating fills, and what each one is for. */
const PATTERN_KINDS: Array<{ value: PatternSpec["kind"]; label: string; hint: string }> = [
  { value: "stripe", label: "Stripes", hint: "Diagonal bands — the classic panel texture" },
  { value: "dot", label: "Dots", hint: "A regular dot field, like halftone" },
  { value: "grid", label: "Grid", hint: "Fine graph-paper lines" },
  { value: "check", label: "Check", hint: "A checkerboard" },
];

const MAX_CHART_VALUES = 12;

export type InspectorTab = "content" | "style" | "advanced";

export interface LayerInspectorProps {
  doc: CanvasDoc;
  brand: StudioBrand;
  selected: Layer | null;
  /** Everything selected, in scene order. One entry when it is a single pick. */
  selectedLayers: Layer[];
  onUpdate: (id: string, patch: Partial<Layer>) => void;
  onDelete: (ids: string[]) => void;
  onDuplicate: (id: string) => void;
  onReorder: (id: string, direction: "up" | "down") => void;
  onToEdge: (ids: string[], edge: "front" | "back") => void;
  onToggleVisibility: (id: string) => void;
  /** One layer lines up with the PAGE; two or more line up with EACH OTHER. */
  onAlign: (ids: string[], which: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom") => void;
  onDistribute: (ids: string[], axis: "h" | "v") => void;
  onTidy: (ids: string[]) => void;
  onGroup: (ids: string[]) => void;
  onUngroup: (ids: string[]) => void;
  onCopyStyle: (id: string) => void;
  onPasteStyle: (ids: string[]) => void;
  /**
   * R2-E: a whole selection moved and resized by NUMBER, not only by handle.
   * The box is the one that contains all of them; the members keep their
   * arrangement inside it.
   */
  onSelectionBox: (ids: string[], box: Partial<Box>) => void;
  /** R2-E: turn the whole selection to an angle, from the one it was showing. */
  onTurnSelection: (ids: string[], to: number, from: number) => void;
  /** R2-C: put a picture into THIS slot instead of adding a new layer. */
  onFillSlot?: (id: string) => void;
  /** R2-C: the same, from a file on the author's machine. */
  onUploadToSlot?: (id: string) => void;
  copiedStyleKind: Layer["kind"] | null;
  onFixContrast: (id: string) => void;
  onSetBackground: (colour: string) => void;
  onBrandSync: () => void;
  brandSyncAvailable: boolean;
  onRemoveBackground?: (id: string) => void;
  removeBackgroundBusy?: boolean;
  removeBackgroundError?: string | null;
}

export function LayerInspector(p: LayerInspectorProps) {
  const [tab, setTab] = useState<InspectorTab>("content");
  const many = p.selectedLayers.length > 1;

  return (
    <div className="flex h-full flex-col">
      <TabStrip tab={tab} onTab={setTab} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {many
          ? <ManySelected {...p} tab={tab} />
          : p.selected
            ? <OneLayer {...p} tab={tab} layer={p.selected} />
            : <NothingSelected {...p} tab={tab} />}
      </div>
      <div className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-[10px] text-slate-500">
        <div className="font-semibold uppercase tracking-wide">Shortcuts</div>
        <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5">
          <span>Save</span><span className="text-right">⌘/Ctrl+S</span>
          <span>Duplicate</span><span className="text-right">⌘/Ctrl+D</span>
          <span>Group</span><span className="text-right">⌘/Ctrl+G</span>
          <span>Structure</span><span className="text-right">⌘/Ctrl+I</span>
          <span>Undo</span><span className="text-right">⌘/Ctrl+Z</span>
          <span>Nudge</span><span className="text-right">Arrows</span>
          <span>Delete</span><span className="text-right">Del</span>
        </div>
      </div>
    </div>
  );
}

function TabStrip({ tab, onTab }: { tab: InspectorTab; onTab: (t: InspectorTab) => void }) {
  const tabs: Array<[InspectorTab, string, string]> = [
    ["content", "Content", "What this is — the words, the picture, the numbers"],
    ["style", "Style", "How it looks — type, colour, effects, borders"],
    ["advanced", "Advanced", "Where it sits, what it sits in front of, and how it lines up"],
  ];
  return (
    <div className="flex shrink-0 border-b border-slate-200 bg-white" data-inspector-tabs>
      {tabs.map(([key, label, title]) => (
        <button
          key={key}
          type="button"
          data-inspector-tab={key}
          onClick={() => onTab(key)}
          title={title}
          aria-label={title}
          aria-selected={tab === key}
          className={"flex-1 border-b-2 px-2 py-2 text-[11px] font-semibold " +
            (tab === key ? "border-[#EF6C33] text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700")}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** A named collapsible block. Elementor's shape, and the one place a control lives. */
function Section({ title, children, startOpen = true }: { title: string; children: ReactNode; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <div className="border-b border-slate-100" data-inspector-section={title}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={open ? `Collapse ${title}` : `Open ${title}`}
        aria-expanded={open}
        className="flex w-full items-center gap-1 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 hover:bg-slate-50"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {title}
      </button>
      {open && <div className="space-y-2 px-3 pb-3">{children}</div>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Nothing selected — the design itself, never 320px of empty grey
   ══════════════════════════════════════════════════════════════════════════ */

function NothingSelected(p: LayerInspectorProps & { tab: InspectorTab }) {
  const transparent = p.doc.background_color == null || String(p.doc.background_color).toLowerCase() === "transparent";
  if (p.tab === "advanced") {
    return (
      <Section title="This design">
        <div className="rounded border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600">
          <div className="tabular-nums">{p.doc.width} × {p.doc.height} pixels</div>
          <div className="mt-0.5">{p.doc.layers.length} thing{p.doc.layers.length === 1 ? "" : "s"} on it.</div>
          <div className="mt-1">Use Resize above the design to change the size, including a size of your own.</div>
        </div>
      </Section>
    );
  }
  if (p.tab === "style") {
    return (
      <Section title="Brand">
        <button
          type="button"
          onClick={p.brandSyncAvailable ? p.onBrandSync : undefined}
          disabled={!p.brandSyncAvailable}
          title={p.brandSyncAvailable
            ? "Brand Sync — pull every colour in this design to the nearest colour in your brand. Undo puts it back."
            : "Brand Sync is a Pro feature"}
          className="inline-flex w-full items-center justify-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
        >
          <Palette className="h-3 w-3" /> Brand Sync{!p.brandSyncAvailable && " · Pro+"}
        </button>
      </Section>
    );
  }
  return (
    <>
      <Section title="Background">
        <div className="rounded border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600">
          Click anything on the design to edit it, or add something from the left.
        </div>
        <ColourField
          label="Colour"
          value={transparent ? "" : (p.doc.background_color || "")}
          brand={p.brand}
          onChange={p.onSetBackground}
        />
        <button
          type="button"
          onClick={() => p.onSetBackground(transparent ? p.brand.colours.background : "transparent")}
          title="A see-through background — PNG and SVG exports keep the transparency, which is what a logo needs"
          className={"w-full rounded border px-2 py-1 text-[11px] font-semibold " +
            (transparent ? "border-slate-800 bg-slate-800 text-white" : "border-slate-200 text-slate-700 hover:bg-slate-50")}
        >
          {transparent ? "See-through background (on)" : "Make the background see-through"}
        </button>
      </Section>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   More than one selected — Canva's Arrange panel, which needed G-01 first
   ══════════════════════════════════════════════════════════════════════════ */

function ManySelected(p: LayerInspectorProps & { tab: InspectorTab }) {
  const ids = p.selectedLayers.map((l) => l.id);
  const grouped = p.selectedLayers.some((l) => l.groupId);
  const kinds = new Set(p.selectedLayers.map((l) => l.kind));
  const words = p.selectedLayers.filter((l) => l.kind === "text") as TextLayer[];
  const pictures = p.selectedLayers.filter((l) => l.kind === "image") as ImageLayer[];
  if (p.tab === "content") {
    return (
      <>
        <Section title={`${ids.length} things selected`}>
          <div className="rounded border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600">
            {[...kinds].join(", ")} — {ids.length} of them. Line them up and space them out under
            <strong> Advanced</strong>, or give them all one look under <strong>Style</strong>.
          </div>
        </Section>
        {/*
          R2-H: THE WORDS INSIDE A GROUP, WITHOUT TAKING THE GROUP APART.

          A Button and a Social handle arrive grouped, which round 2 built and
          which is right — but changing the label then meant Advanced ›
          Ungroup, find the row in Structure, edit it, and group the pair again.
          Four steps to retype two words, and the last one is the step people
          forget, so the design quietly stops being a button.

          Every set of words in the selection is listed here and edited in
          place. Nothing is ungrouped, and a group of two labels shows two
          boxes, each named by what it currently says.
        */}
        {/*
          R2-C's other half: A GROUP THAT CONTAINS PICTURE SLOTS.

          A photo grid drops its cells loose now, so the common case is one
          cell selected and the Picture panel right there. But ANY set can be
          grouped by the author, and a group whose slots cannot be filled is
          the same dead end in a different place — the download would refuse a
          design over slots nothing could reach. So the group lists them.
        */}
        {p.onFillSlot && pictures.length > 0 && (
          <Section title={pictures.length === 1 ? "The picture inside" : "The pictures inside"}>
            {pictures.map((im, i) => (
              <button
                key={im.id}
                type="button"
                data-fill-slot={im.id}
                onClick={() => p.onFillSlot!(im.id)}
                title={im.src
                  ? "Swap the picture in this slot, keeping its size and shape"
                  : "Choose a picture for this slot — it keeps its size, shape and corners"}
                className={"inline-flex w-full items-center justify-center gap-1 rounded border px-2 py-1 text-[11px] font-semibold " +
                  (im.src
                    ? "border-slate-200 text-slate-700 hover:bg-slate-50"
                    : "border-slate-800 bg-slate-800 text-white hover:bg-slate-700")}
              >
                <Plus className="h-3 w-3" />
                {im.src ? `Replace picture ${i + 1}` : `Put a picture in slot ${i + 1}`}
              </button>
            ))}
          </Section>
        )}
        {words.length > 0 && (
          <Section title={words.length === 1 ? "The words inside" : "The words inside them"}>
            {words.map((t) => (
              <label key={t.id} className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {(t.content || "").trim().slice(0, 24) || "Empty"}
                <textarea
                  value={t.content}
                  data-inner-text={t.id}
                  title="Change these words without taking the group apart"
                  aria-label={`The words of ${(t.content || "this layer").trim().slice(0, 24)}`}
                  onChange={(e) => p.onUpdate(t.id, { content: e.target.value } as Partial<Layer>)}
                  rows={2}
                  className="mt-0.5 w-full resize-y rounded border border-slate-200 px-2 py-1 text-[12px] font-normal normal-case focus:border-slate-500 focus:outline-none"
                />
              </label>
            ))}
          </Section>
        )}
      </>
    );
  }
  if (p.tab === "style") return <ManyStyle {...p} />;
  return (
    <>
      <GroupBox {...p} ids={ids} />
      <ArrangeSections {...p} ids={ids} grouped={grouped} many />
    </>
  );
}

/**
 * A GROUP'S LOOK, REACHABLE (round-3 R3-F).
 *
 * Round 3 gave a multi-selection its WORDS back — Content › The words inside —
 * and left its LOOK behind: Style on a group offered one button, "Paste the
 * look", which is no use at all until somebody has copied a look from something
 * else. So design 01's Button had to be ungrouped to make the pill red, and
 * grouped again afterwards, which is the step people forget.
 *
 * Every control here writes to EVERY member of the matching kind, and only
 * those: the words in a Button take the type controls, the pill behind them
 * takes the fill. A field reads the value the members SHARE, and reads blank
 * when they disagree — typing into a blank field then sets them all, which is
 * the only honest answer to "what colour are these three".
 */
function ManyStyle(p: LayerInspectorProps & { tab: InspectorTab }) {
  const ids = p.selectedLayers.map((l) => l.id);
  const words = p.selectedLayers.filter((l) => l.kind === "text") as TextLayer[];
  const shapes = p.selectedLayers.filter((l) => l.kind === "shape") as ShapeLayer[];
  const pictures = p.selectedLayers.filter((l) => l.kind === "image") as ImageLayer[];
  const fonts = fontOptions(p.brand.fonts?.heading || null, p.brand.fonts?.body || null);

  /** Write one patch to every layer in a list. */
  const setAll = (layers: Layer[], patch: Partial<Layer>) => {
    for (const l of layers) p.onUpdate(l.id, patch);
  };
  /** The value they all share, or undefined when they disagree. */
  const shared = <T,>(layers: Layer[], read: (l: never) => T): T | undefined => {
    if (!layers.length) return undefined;
    const first = read(layers[0] as never);
    return layers.every((l) => read(l as never) === first) ? first : undefined;
  };

  return (
    <>
      {words.length > 0 && (
        <Section title={words.length === 1 ? "The words' look" : `The look of all ${words.length} sets of words`}>
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Typeface
            <select
              data-many-font
              aria-label="Typeface for every set of words in the selection"
              title="Set one typeface on every set of words in the selection"
              value={shared(words, (l: TextLayer) => l.font || "") ?? ""}
              onChange={(e) => e.target.value && setAll(words, { font: e.target.value } as Partial<Layer>)}
              className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px] font-normal normal-case"
            >
              <option value="">Mixed — choose one</option>
              {fonts.map((f) => (
                <option key={f.stack} value={f.stack}>
                  {f.label}{f.brand ? ` (your ${f.brand})` : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            <NumField
              label="Size" title="Type size for every set of words in the selection" min={1}
              value={shared(words, (l: TextLayer) => l.size || 24) ?? 0}
              onChange={(v) => v > 0 && setAll(words, { size: Math.max(1, Math.round(v)) } as Partial<Layer>)}
            />
            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Weight
              <select
                data-many-weight
                aria-label="Weight for every set of words in the selection"
                title="Light, regular or bold — on every set of words in the selection"
                value={shared(words, (l: TextLayer) => l.weight || "400") ?? ""}
                onChange={(e) => e.target.value && setAll(words, { weight: e.target.value } as Partial<Layer>)}
                className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px] font-normal normal-case"
              >
                <option value="">Mixed</option>
                {["300", "400", "500", "600", "700", "800"].map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </label>
          </div>
          <ColourField
            label="Words colour" brand={p.brand}
            value={shared(words, (l: TextLayer) => l.color || "")}
            onChange={(c) => setAll(words, { color: c } as Partial<Layer>)}
          />
        </Section>
      )}
      {shapes.length > 0 && (
        <Section title={shapes.length === 1 ? "The shape's look" : `The look of all ${shapes.length} shapes`}>
          <ColourField
            label="Fill" brand={p.brand}
            value={shared(shapes, (l: ShapeLayer) => l.fill || "")}
            onChange={(c) => setAll(shapes, { fill: c, gradient: undefined, pattern: undefined } as Partial<Layer>)}
          />
          <ColourField
            label="Outline colour" brand={p.brand}
            value={shared(shapes, (l: ShapeLayer) => l.stroke || "")}
            onChange={(c) => setAll(shapes, { stroke: c } as Partial<Layer>)}
          />
          <NumField
            label="Outline width" title="How thick the outline is on every shape in the selection" min={0}
            value={shared(shapes, (l: ShapeLayer) => l.strokeWidth ?? 0) ?? 0}
            onChange={(v) => setAll(shapes, { strokeWidth: Math.max(0, Math.round(v)) } as Partial<Layer>)}
          />
        </Section>
      )}
      {pictures.length > 0 && (
        <Section title={pictures.length === 1 ? "The picture's frame" : `The frame of all ${pictures.length} pictures`}>
          <ColourField
            label="Border colour" brand={p.brand}
            value={shared(pictures, (l: ImageLayer) => l.frameStroke || "")}
            onChange={(c) => setAll(pictures, { frameStroke: c } as Partial<Layer>)}
          />
          <NumField
            label="Border width" title="How thick the frame border is on every picture in the selection" min={0}
            value={shared(pictures, (l: ImageLayer) => l.frameStrokeWidth ?? 0) ?? 0}
            onChange={(v) => setAll(pictures, { frameStrokeWidth: Math.max(0, Math.round(v)) } as Partial<Layer>)}
          />
        </Section>
      )}
      <Section title="Copy a look from somewhere else" startOpen={false}>
        <button
          type="button"
          disabled={!p.copiedStyleKind}
          onClick={() => p.onPasteStyle(ids)}
          title={p.copiedStyleKind
            ? `Paste the ${p.copiedStyleKind} look you copied onto every ${p.copiedStyleKind} in the selection`
            : "Copy a look from one thing first — select it, then Style › Copy this look"}
          className="inline-flex w-full items-center justify-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
        >
          <Brush className="h-3 w-3" /> Paste the look
        </button>
        <div className="text-[10px] text-slate-400">
          Only the things of the same kind take it — a words look is not a smaller version of a picture look.
        </div>
      </Section>
    </>
  );
}

/**
 * SIZE, POSITION AND ANGLE FOR A WHOLE SELECTION (R2-E).
 *
 * Round 1 asked for it, round 2 sent a multi-selection straight to the arrange
 * blocks, and so design 07's two display lines had to be turned one at a time
 * BEFORE they were grouped — the author doing by hand the one thing a group is
 * for.
 *
 * The box is the one rectangle that holds all of them. Typing into it moves or
 * scales every member about that box's own corner, so the arrangement inside
 * survives. The angle is the one they share; when they disagree it reads zero
 * and turns them all by whatever is typed, which is the only honest answer to
 * "turn these" when they are not all facing the same way.
 */
function GroupBox(p: LayerInspectorProps & { ids: string[] }) {
  const box = boundsOf(p.doc, p.ids);
  const shared = selectionRotation(p.doc, p.ids);
  if (!box) return null;
  const set = (patch: Partial<Box>) => p.onSelectionBox(p.ids, patch);
  return (
    <Section title="Size and position">
      <div className="grid grid-cols-2 gap-1.5">
        <NumField label="X" title="How far the whole selection is from the left edge" value={box.x} onChange={(v) => set({ x: Math.round(v) })} />
        <NumField label="Y" title="How far the whole selection is from the top edge" value={box.y} onChange={(v) => set({ y: Math.round(v) })} />
        <NumField label="W" title="How wide the whole selection is — everything in it scales to match" value={box.w} min={1} onChange={(v) => set({ w: Math.max(1, Math.round(v)) })} />
        <NumField label="H" title="How tall the whole selection is — everything in it scales to match" value={box.h} min={1} onChange={(v) => set({ h: Math.max(1, Math.round(v)) })} />
      </div>
      <div className="flex items-center gap-1.5">
        <NumField
          label="↻"
          title="Turn everything in the selection together, about the middle of the box"
          value={shared ?? 0}
          onChange={(v) => p.onTurnSelection(p.ids, ((Math.round(v) % 360) + 360) % 360, shared ?? 0)}
        />
        <div className="text-[10px] text-slate-400">
          {shared === null ? "They face different ways — this turns them all by what you type." : "They all move as one."}
        </div>
      </div>
    </Section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   One layer
   ══════════════════════════════════════════════════════════════════════════ */

function OneLayer(p: LayerInspectorProps & { tab: InspectorTab; layer: Layer }) {
  const { layer, brand } = p;
  const update = (patch: Partial<Layer>) => p.onUpdate(layer.id, patch);
  const kindLabel =
    layer.kind === "text" ? "Text"
      : layer.kind === "image" ? "Picture"
        : layer.kind === "chart" ? "Chart"
          : (layer as ShapeLayer).shape === "icon" ? "Symbol"
            : "Shape";

  if (p.tab === "content") {
    return (
      <>
        {layer.kind === "text" && (
          <Section title="Words">
            <textarea
              value={(layer as TextLayer).content}
              title="The words on the design. You can also type straight on the canvas."
              aria-label="The words on the design"
              onChange={(e) => update({ content: e.target.value } as Partial<Layer>)}
              rows={3}
              className="w-full resize-y rounded border border-slate-200 px-2 py-1.5 text-[12px] focus:border-slate-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => p.onFixContrast(layer.id)}
              title="Flip these words to white or near-black, whichever you can actually read on what is behind them"
              className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Contrast className="h-3 w-3" /> Make it readable
            </button>
            {/*
              D-8: THE BOX SAYS WHEN THE WORDS DO NOT FIT.
              Round 1 lost three lines to boxes a few pixels too narrow, and
              two of them only showed up in the downloaded PNG. The wrap is
              measured with the very function the export wraps with, so the
              warning and the file cannot disagree.
            */}
            {(() => {
              const warning = textFitWarning(layer as TextLayer);
              return warning ? (
                <div data-text-overflow className="flex items-start gap-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] text-amber-800">
                  <Star className="mt-0.5 h-3 w-3 flex-shrink-0" />
                  <span>{warning}</span>
                </div>
              ) : null;
            })()}
          </Section>
        )}
        {layer.kind === "image" && (
          <Section title="Picture">
            <ImageContent
              layer={layer as ImageLayer}
              onRemoveBackground={p.onRemoveBackground ? () => p.onRemoveBackground!(layer.id) : undefined}
              onFillSlot={p.onFillSlot ? () => p.onFillSlot!(layer.id) : undefined}
              onUploadToSlot={p.onUploadToSlot ? () => p.onUploadToSlot!(layer.id) : undefined}
              busy={p.removeBackgroundBusy}
              error={p.removeBackgroundError}
            />
          </Section>
        )}
        {layer.kind === "shape" && (layer as ShapeLayer).shape === "icon" && (
          <Section title="Symbol"><IconSwap layer={layer as ShapeLayer} update={update} /></Section>
        )}
        {layer.kind === "shape" && (layer as ShapeLayer).shape !== "icon" && (
          <Section title="Shape">
            <div className="rounded border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600">
              A {kindLabel.toLowerCase()}. Its colour, its outline and its corners are under <strong>Style</strong>.
            </div>
          </Section>
        )}
        {layer.kind === "chart" && (
          <ChartDataPanel
            layer={layer as ChartLayer}
            brand={p.brand}
            onUpdate={(patch) => p.onUpdate(layer.id, patch as Partial<Layer>)}
          />
        )}
      </>
    );
  }

  if (p.tab === "style") {
    return (
      <>
        {layer.kind === "text" && <TextStyle layer={layer as TextLayer} brand={brand} update={update} />}
        {layer.kind === "shape" && <ShapeStyle layer={layer as ShapeLayer} brand={brand} update={update} />}
        {layer.kind === "image" && <ImageStyle layer={layer as ImageLayer} brand={brand} update={update} />}
        {layer.kind === "chart" && (
          <Section title="Colours">
            <div className="rounded border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600">
              A chart is drawn in your brand colours. Change them under My Brand › Brand Identity.
            </div>
          </Section>
        )}
        <Section title="Copy the look" startOpen={false}>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => p.onCopyStyle(layer.id)}
              title="Copy this look — the font, colours, effects and borders, never the words or where it sits"
              className="inline-flex flex-1 items-center justify-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Copy className="h-3 w-3" /> Copy this look
            </button>
            <button
              type="button"
              disabled={p.copiedStyleKind !== layer.kind}
              onClick={() => p.onPasteStyle([layer.id])}
              title={p.copiedStyleKind === layer.kind
                ? "Give this thing the look you copied"
                : "Copy a look from another thing of the same kind first"}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
            >
              <Brush className="h-3 w-3" /> Paste it
            </button>
          </div>
        </Section>
      </>
    );
  }

  /* Advanced */
  return (
    <>
      <Section title="Size and position">
        <div className="grid grid-cols-2 gap-1.5">
          <NumField label="X" title="How far from the left edge" value={layer.x} onChange={(v) => update({ x: Math.round(v) })} />
          <NumField label="Y" title="How far from the top edge" value={layer.y} onChange={(v) => update({ y: Math.round(v) })} />
          <NumField label="W" title="How wide" value={layer.w} min={1} onChange={(v) => update({ w: Math.max(1, Math.round(v)) })} />
          <NumField label="H" title="How tall" value={layer.h} min={0} onChange={(v) => update({ h: Math.max(0, Math.round(v)) })} />
        </div>
        <div className="flex items-center gap-1.5">
          <NumField label="↻" title="Rotation, in degrees" value={layer.rotation || 0}
            onChange={(v) => update({ rotation: (((Math.round(v) % 360) + 360) % 360) })} />
          <ToggleButton title="Flip left to right" active={!!layer.flipH} onClick={() => update({ flipH: !layer.flipH })}>↔</ToggleButton>
          <ToggleButton title="Flip top to bottom" active={!!layer.flipV} onClick={() => update({ flipV: !layer.flipV })}>↕</ToggleButton>
        </div>
        <div>
          <div className="mb-0.5 flex justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            <span>See-through</span><span className="tabular-nums">{Math.round((layer.opacity ?? 1) * 100)}%</span>
          </div>
          <input
            type="range" min={0} max={100}
            title="How solid this is — 100% is fully solid"
            aria-label="How solid this is"
            value={Math.round((layer.opacity ?? 1) * 100)}
            onChange={(e) => update({ opacity: Number(e.target.value) / 100 })}
            className="w-full"
          />
        </div>
      </Section>
      <ArrangeSections {...p} ids={[layer.id]} grouped={!!layer.groupId} many={false} />
    </>
  );
}

/* ── Advanced › the arrange blocks, shared by one and by many ───────────── */

function ArrangeSections(p: LayerInspectorProps & { ids: string[]; grouped: boolean; many: boolean }) {
  const one = p.ids.length === 1 ? p.ids[0] : null;
  const layer = one ? p.selectedLayers[0] : null;
  return (
    <>
      <Section title="Layer order">
        <div className="flex gap-1">
          {one && (
            <>
              <IconButton title="Bring forward — move it in front of what it overlaps" onClick={() => p.onReorder(one, "up")}><ChevronUp className="h-3.5 w-3.5" /></IconButton>
              <IconButton title="Send back — move it behind what it overlaps" onClick={() => p.onReorder(one, "down")}><ChevronDown className="h-3.5 w-3.5" /></IconButton>
            </>
          )}
          <IconButton title="Bring to the very front, in one move" onClick={() => p.onToEdge(p.ids, "front")}><ChevronsUp className="h-3.5 w-3.5" /></IconButton>
          <IconButton title="Send to the very back, in one move" onClick={() => p.onToEdge(p.ids, "back")}><ChevronsDown className="h-3.5 w-3.5" /></IconButton>
        </div>
        <div className="text-[10px] text-slate-400">The whole stack is in the Structure window — drag a row there to restack.</div>
      </Section>

      <Section title={p.many ? "Line them up with each other" : "Line it up with the design"}>
        <div className="flex gap-1">
          {([
            ["left", AlignStartVertical, p.many ? "Line their left edges up" : "Push it to the left edge"],
            ["hcenter", AlignCenterVertical, p.many ? "Line their middles up, left to right" : "Centre it left to right"],
            ["right", AlignEndVertical, p.many ? "Line their right edges up" : "Push it to the right edge"],
            ["top", AlignStartHorizontal, p.many ? "Line their tops up" : "Push it to the top"],
            ["vcenter", AlignCenterHorizontal, p.many ? "Line their middles up, top to bottom" : "Centre it top to bottom"],
            ["bottom", AlignEndHorizontal, p.many ? "Line their bottoms up" : "Push it to the bottom"],
          ] as const).map(([which, Icon, title]) => (
            <button
              key={which}
              type="button"
              onClick={() => p.onAlign(p.ids, which)}
              title={title}
              aria-label={title}
              data-align={which}
              className="rounded border border-slate-200 p-1 hover:border-slate-800 hover:bg-slate-50"
            >
              <Icon className="h-3.5 w-3.5 text-slate-600" />
            </button>
          ))}
        </div>
        {p.many && (
          <div className="flex gap-1.5">
            <button type="button" onClick={() => p.onDistribute(p.ids, "h")}
              disabled={p.ids.length < 3}
              title="Even gaps left to right. Needs three or more — with two there is nothing in between to space."
              className="inline-flex flex-1 items-center justify-center gap-1 rounded border border-slate-200 px-1.5 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300">
              <AlignHorizontalSpaceAround className="h-3 w-3" /> Even across
            </button>
            <button type="button" onClick={() => p.onDistribute(p.ids, "v")}
              disabled={p.ids.length < 3}
              title="Even gaps top to bottom. Needs three or more."
              className="inline-flex flex-1 items-center justify-center gap-1 rounded border border-slate-200 px-1.5 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300">
              <AlignVerticalSpaceAround className="h-3 w-3" /> Even down
            </button>
            <button type="button" onClick={() => p.onTidy(p.ids)}
              title="Tidy up — one even gap along the way they already run, and lined up on the other way"
              className="inline-flex flex-1 items-center justify-center gap-1 rounded border border-slate-200 px-1.5 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50">
              <WandSparkles className="h-3 w-3" /> Tidy up
            </button>
          </div>
        )}
      </Section>

      <Section title="Group and lock">
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={p.ids.length < 2}
            onClick={() => p.onGroup(p.ids)}
            title={p.ids.length < 2
              ? "Select two or more things to group them"
              : "Group them (⌘/Ctrl+G) — from now on clicking one picks them all, and they move and turn together"}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
          >
            <Group className="h-3 w-3" /> Group
          </button>
          <button
            type="button"
            disabled={!p.grouped}
            onClick={() => p.onUngroup(p.ids)}
            title={p.grouped ? "Ungroup (⌘/Ctrl+⇧+G) — let them be picked one at a time again" : "Nothing selected is in a group"}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
          >
            <Ungroup className="h-3 w-3" /> Ungroup
          </button>
        </div>
        <div className="flex gap-1.5">
          {one && layer && (
            <>
              <button
                type="button"
                onClick={() => p.onUpdate(one, { locked: layer.locked !== true })}
                title={layer.locked ? "Unlock — let it be moved again" : "Lock — stop it being moved by accident"}
                className={"inline-flex flex-1 items-center justify-center gap-1 rounded border px-2 py-1 text-[11px] font-semibold " +
                  (layer.locked ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 text-slate-700 hover:bg-slate-50")}
              >
                {layer.locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />} {layer.locked ? "Locked" : "Lock"}
              </button>
              <button
                type="button"
                onClick={() => p.onDuplicate(one)}
                title="Make a copy of this (⌘/Ctrl+D)"
                className="inline-flex flex-1 items-center justify-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Copy className="h-3 w-3" /> Duplicate
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => p.onDelete(p.ids)}
            title={p.many ? "Delete all of them (Del)" : "Delete this (Del)"}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
          >
            <Trash2 className="h-3 w-3" /> Delete
          </button>
        </div>
      </Section>
    </>
  );
}

/* ── Style › Text ──────────────────────────────────────────────────────── */

function TextStyle({ layer, brand, update }: {
  layer: TextLayer; brand: StudioBrand; update: (p: Partial<Layer>) => void;
}) {
  const fonts = fontOptions(brand.fonts.heading, brand.fonts.body);
  // Match on the FAMILY, not on the whole stack. A kit font arrives as
  // "Montserrat, system-ui, sans-serif" while the list carries
  // "Montserrat, Verdana, sans-serif" — the same face with a different
  // fallback chain. Comparing strings made the <select> fall through to its
  // first option, so a design in the body face read as being in the heading one.
  const layerStack = layer.font || brand.fonts.body;
  const chosen = fonts.find((f) => familyOf(f.stack).toLowerCase() === familyOf(layerStack).toLowerCase());
  const current = chosen ? chosen.stack : layerStack;
  const effectValue = layer.effect ? layer.effect : layer.outline ? "outline" : layer.shadow ? "shadow" : "none";
  const usesSecond = layer.effect === "echo" || layer.effect === "splice" || layer.effect === "neon";
  const size = layer.size || 24;
  // R2-F: how far the bow goes, answered once in textEffects so the number the
  // slider stops at and the number the painter draws cannot drift. It used to
  // be clamped by the layer's HEIGHT as well, which on a one-line wordmark is
  // barely taller than the type — the slider ran out long before the reference.
  const maxBulge = curveMaxBulge(layer.w);

  return (
    <>
      <Section title="Typography">
        <div className="flex gap-1">
          <select
            value={current}
            data-studio-font
            title="Your brand fonts are at the top. Every other font we carry is under them — pick any of them."
            aria-label="Font"
            onChange={(e) => update({ font: e.target.value } as Partial<Layer>)}
            className="min-w-0 flex-1 rounded border border-slate-200 px-1.5 py-1 text-[11px]"
          >
            <optgroup label="Your brand fonts">
              {fonts.filter((f) => f.brand).map((f) => (
                <option key={f.stack} value={f.stack}>{f.label} — your {f.brand}</option>
              ))}
            </optgroup>
            <optgroup label="Every other font we carry">
              {fonts.filter((f) => !f.brand).map((f) => (
                <option key={f.stack} value={f.stack}>{f.label}</option>
              ))}
            </optgroup>
          </select>
          <input
            type="number" min={6} max={500}
            title="Font size"
            aria-label="Font size"
            value={size}
            onChange={(e) => update({ size: Math.max(6, Number(e.target.value) || 24) } as Partial<Layer>)}
            className="w-14 rounded border border-slate-200 px-1.5 py-1 text-[11px] tabular-nums"
          />
        </div>
        {chosen && !chosen.export_safe && (
          <div className="text-[10px] text-amber-700">
            We do not carry this face for downloads — an exported picture will use the closest one we have.
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1">
          <ToggleButton title="Bold" active={layer.weight === "700"} onClick={() => update({ weight: layer.weight === "700" ? "400" : "700" } as Partial<Layer>)}>
            <Bold className="h-3 w-3" />
          </ToggleButton>
          <ToggleButton title="Italic" active={layer.italic === true} onClick={() => update({ italic: !layer.italic } as Partial<Layer>)}>
            <Italic className="h-3 w-3" />
          </ToggleButton>
          <ToggleButton title="Underline" active={layer.underline === true} onClick={() => update({ underline: !layer.underline } as Partial<Layer>)}>
            <Underline className="h-3 w-3" />
          </ToggleButton>
          <ToggleButton title="Strikethrough" active={layer.strike === true} onClick={() => update({ strike: !layer.strike } as Partial<Layer>)}>
            <Strikethrough className="h-3 w-3" />
          </ToggleButton>
          <div className="mx-0.5 h-4 w-px bg-slate-200" />
          {([["left", AlignLeft, "Line the words up on the left"], ["center", AlignCenter, "Centre the words"], ["right", AlignRight, "Line the words up on the right"]] as const).map(([a, Icon, title]) => (
            <ToggleButton key={a} title={title} active={layer.align === a} onClick={() => update({ align: a } as Partial<Layer>)}>
              <Icon className="h-3 w-3" />
            </ToggleButton>
          ))}
        </div>

        <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Capitals
          <select
            value={layer.textCase || "none"}
            title="Show the words in capitals, in small letters, or with Every Word Capitalised. What you typed is kept, so turning this off gives it straight back."
            aria-label="Capitals"
            onChange={(e) => update({ textCase: e.target.value as TextCase } as Partial<Layer>)}
            className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px] font-normal normal-case"
          >
            <option value="none">As typed</option>
            <option value="upper">UPPERCASE</option>
            <option value="lower">lowercase</option>
            <option value="title">Title Case</option>
          </select>
        </label>

        <div className="grid grid-cols-2 gap-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Line spacing
            <input
              type="number" step={0.05} min={0.7} max={3}
              title="The gap between lines of words"
              aria-label="Line spacing"
              value={layer.lineHeight ?? 1.2}
              onChange={(e) => update({ lineHeight: Math.max(0.7, Number(e.target.value) || 1.2) } as Partial<Layer>)}
              className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px] font-normal normal-case tabular-nums"
            />
          </label>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Letter spacing
            <input
              type="number" step={0.5} min={-5} max={60}
              title="The gap between letters"
              aria-label="Letter spacing"
              value={layer.letterSpacing ?? 0}
              onChange={(e) => update({ letterSpacing: Number(e.target.value) || 0 } as Partial<Layer>)}
              className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px] font-normal normal-case tabular-nums"
            />
          </label>
        </div>
      </Section>

      <Section title="Fill">
        <ColourField label="Colour" value={layer.color} brand={brand} onChange={(c) => update({ color: c } as Partial<Layer>)} />
      </Section>

      <Section title="Effects">
        <select
          value={effectValue}
          data-text-effect
          title="A shadow, an outline or one of Canva's fancier looks, so words stay readable over a photo"
          aria-label="Text effect"
          onChange={(e) => {
            const v = e.target.value;
            // Every effect is exclusive: one reset, then the one that was
            // picked. Without the reset an Outline left behind a stroke that
            // Neon then glowed around, which reads as a bug in Neon.
            const reset = { shadow: false, effect: undefined, outline: undefined } as Partial<Layer>;
            if (v === "shadow") update({ ...reset, shadow: true } as Partial<Layer>);
            else if (v === "outline") update({ ...reset, outline: brand.colours.primary } as Partial<Layer>);
            else if (v === "none") update(reset);
            else update({ ...reset, effect: v } as Partial<Layer>);
          }}
          className="w-full rounded border border-slate-200 px-1.5 py-1 text-[11px]"
        >
          {TEXT_EFFECTS.map((e) => (
            <option key={e.value} value={e.value} title={e.hint}>{e.label}</option>
          ))}
        </select>
        <div className="text-[10px] text-slate-500">
          {TEXT_EFFECTS.find((e) => e.value === effectValue)?.hint}
        </div>
        {layer.outline && (
          <ColourField label="Outline colour" value={layer.outline} brand={brand} onChange={(c) => update({ outline: c } as Partial<Layer>)} />
        )}
        {usesSecond && (
          <ColourField
            label={layer.effect === "neon" ? "Glow colour" : "Second colour"}
            value={layer.effectColor || layer.color || ""}
            brand={brand}
            onChange={(c) => update({ effectColor: c } as Partial<Layer>)}
          />
        )}

        <div>
          <div className="mb-0.5 flex justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            <span>Curve</span>
            <span className="tabular-nums">{Math.round(layer.curve || 0)}</span>
          </div>
          <input
            type="range"
            data-text-curve
            min={-maxBulge} max={maxBulge}
            title="Bow the line of words. Right bends it into a rainbow, left into a bowl, the middle is straight. This is what makes a round badge possible."
            aria-label="Curve"
            value={Math.round(layer.curve || 0)}
            onChange={(e) => update({ curve: Number(e.target.value) } as Partial<Layer>)}
            className="w-full"
          />
          {Math.abs(layer.curve || 0) >= 1 && (
            <div className="text-[10px] text-slate-500">
              Curved words are drawn as a picture, so they are typed here rather than on the design.
            </div>
          )}
        </div>
      </Section>
    </>
  );
}

/* ── Content › Picture ─────────────────────────────────────────────────── */

function ImageContent({ layer, onRemoveBackground, onFillSlot, onUploadToSlot, busy, error }: {
  layer: ImageLayer; onRemoveBackground?: () => void; onFillSlot?: () => void;
  onUploadToSlot?: () => void; busy?: boolean; error?: string | null;
}) {
  return (
    <>
      <div className="rounded border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600">
        {layer.src
          ? "A picture is in this slot. Its look is under Style."
          : "An empty slot. Put a picture in it below — the slot keeps its own size, shape and corners."}
      </div>
      {/*
        R2-C: THE SLOT CAN BE FILLED.

        The photo grid laid its cells out correctly and then nothing could put
        a picture in one: the Media Library and the upload button both added a
        NEW centred layer, and the download refused the design over the empty
        slots it could never lose. A built gallery was unreachable.

        This is the button that was missing. It opens the same library the left
        pane opens, and what comes back lands IN this slot rather than on top of
        it — the cell's box, corners, crop shape and border are the layout, and
        they survive the picture arriving.
      */}
      {onFillSlot && (
        <div className="flex gap-1.5">
          <button
            type="button"
            data-fill-slot
            onClick={onFillSlot}
            title={layer.src
              ? "Swap the picture in this slot for another one, keeping the slot's size and shape"
              : "Choose a picture for this slot from your Media Library — it keeps the slot's size, shape and corners"}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded border border-slate-800 bg-slate-800 px-2 py-1 text-[11px] font-semibold text-white hover:bg-slate-700"
          >
            <Plus className="h-3 w-3" /> {layer.src ? "Replace the picture" : "Put a picture in this slot"}
          </button>
          {onUploadToSlot && (
            <button
              type="button"
              data-upload-slot
              onClick={onUploadToSlot}
              title="Upload a picture from this computer straight into this slot"
              className="inline-flex items-center justify-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Upload className="h-3 w-3" /> Upload
            </button>
          )}
        </div>
      )}
      {onRemoveBackground ? (
        <button
          type="button"
          onClick={onRemoveBackground}
          disabled={busy}
          title="Cut the background out of this picture and keep the subject"
          className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <Wand2 className="h-3 w-3" /> {busy ? "Removing…" : "Remove background"}
        </button>
      ) : (
        <div className="text-[10px] text-slate-400">
          Place a picture from your Media Library to unlock Remove background (Pro+).
        </div>
      )}
      {error && <div className="rounded border border-red-200 bg-red-50 p-1.5 text-[10px] text-red-700">{error}</div>}
    </>
  );
}

function IconSwap({ layer, update }: { layer: ShapeLayer; update: (p: Partial<Layer>) => void }) {
  const [pick, setPick] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setPick((v) => !v)}
        title="Swap this for a different symbol"
        className="inline-flex w-full items-center justify-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
      >
        <Star className="h-3 w-3" /> {pick ? "Close the symbols" : "Swap the symbol"}
      </button>
      {pick && (
        <div className="grid max-h-44 grid-cols-6 gap-1 overflow-y-auto rounded border border-slate-200 p-1.5">
          {Object.entries(ICON_PATHS).map(([key, d]) => (
            <button
              key={key} type="button" title={key} aria-label={key}
              onClick={() => { update({ icon: key } as Partial<Layer>); setPick(false); }}
              className={"flex aspect-square items-center justify-center rounded border hover:border-slate-800 " +
                (layer.icon === key ? "border-slate-800 bg-slate-100" : "border-slate-200")}
            >
              <svg viewBox="0 0 100 100" className="h-5 w-5"><path d={d} fillRule="evenodd" fill="#334155" /></svg>
            </button>
          ))}
        </div>
      )}
      <SlantControl shape={layer.icon} layer={layer} update={update} />
    </>
  );
}

/**
 * HOW FAR A SLANTED SHAPE LEANS (round-3 R3-E).
 *
 * The three quads are real crops, and round 3 baked their angle into the path:
 * `parallelogram` leans 22 units across an 88-unit drop, so designs 03 and 07,
 * both of which want about nine degrees, got nineteen and fifteen. Widening the
 * box to bleed the far edge off the page only steepened it.
 *
 * The slider is in degrees ON THE PAGE, which is the only angle anybody can
 * see, and it starts on the lean the authored path already has in this box —
 * so the first drag is a nudge rather than a jump, and an untouched shape draws
 * exactly what it drew before. Renders nothing for a shape that does not lean.
 */
function SlantControl({ shape, layer, update }: {
  shape: string | null | undefined;
  layer: Layer;
  update: (p: Partial<Layer>) => void;
}) {
  if (!isSlantShape(shape)) return null;
  const baked = bakedSlantDeg(shape, layer.w, layer.h);
  const value = layer.slantDeg == null ? baked : Math.round(Number(layer.slantDeg));
  return (
    <>
      <Slider
        label="Lean" title="How far the slanted edge leans, in degrees — measured on the page, not in the shape"
        min={-45} max={45} value={value} unit="°"
        onChange={(v) => update({ slantDeg: v } as Partial<Layer>)}
      />
      {layer.slantDeg != null && value !== baked && (
        <button
          type="button"
          onClick={() => update({ slantDeg: null } as Partial<Layer>)}
          title="Put the lean back to the shape's own angle"
          className="text-[10px] font-semibold text-slate-500 hover:text-slate-700"
        >
          Back to {baked}&deg;
        </button>
      )}
    </>
  );
}

/* ── Style › Picture ───────────────────────────────────────────────────── */

function ImageStyle({ layer, brand, update }: {
  layer: ImageLayer; brand: StudioBrand; update: (p: Partial<Layer>) => void;
}) {
  const f = layer.filters || {};
  const setF = (patch: Partial<ImageFilters>) => update({ filters: { ...f, ...patch } } as Partial<Layer>);
  return (
    <>
      <Section title="Shape">
        <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Crop it to
          <select
            value={layer.mask || "none"}
            title="Crop the picture to a circle, an arch or a soft blob — a plain rectangle is the amateur tell"
            aria-label="Crop the picture to"
            onChange={(e) => update({ mask: e.target.value === "none" ? undefined : (e.target.value as ImageMask) } as Partial<Layer>)}
            className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px] font-normal normal-case"
          >
            <option value="none">Rectangle</option>
            <option value="circle">Circle</option>
            <option value="rounded">Rounded</option>
            {/*
              G-06: every shape the studio draws is a frame now, not the
              original five. Design 03's diagonal photo edge had to be faked
              with a turned rectangle in round 1, and a turned rectangle sits
              ON a photo rather than cropping it.
            */}
            <optgroup label="Shapes">
              {FRAME_SHAPES.map((k) => (
                <option key={k} value={k}>{FRAME_LABELS[k] || k}</option>
              ))}
            </optgroup>
          </select>
        </label>
        <SlantControl shape={layer.mask} layer={layer} update={update} />
        {!layer.mask && (
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Rounded corners
            <input
              type="number" min={0} max={400}
              title="Round the picture's own corners. A crop shape sets its own, so this only applies to a plain rectangle."
              aria-label="Rounded corners"
              value={layer.radius ?? 0}
              onChange={(e) => update({ radius: Math.max(0, Number(e.target.value) || 0) } as Partial<Layer>)}
              className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px] font-normal normal-case tabular-nums"
            />
          </label>
        )}
      </Section>
      {/*
        G-06: a frame's border follows the crop shape, so an arch frame gets an
        arch-shaped rule rather than a rectangle balanced on top of it.
      */}
      <Section title="Frame border" startOpen={false}>
        <ColourField label="Border colour" value={layer.frameStroke} brand={brand}
          onChange={(c) => update({ frameStroke: c } as Partial<Layer>)} />
        <div className="grid grid-cols-2 gap-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Border width
            <input
              type="number" min={0} max={60}
              title="How thick the frame's border is. 0 means none."
              aria-label="Border width"
              value={layer.frameStrokeWidth ?? 0}
              onChange={(e) => update({ frameStrokeWidth: Math.max(0, Number(e.target.value) || 0) } as Partial<Layer>)}
              className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px] font-normal normal-case tabular-nums"
            />
          </label>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Border style
            <select
              value={layer.frameDash || "solid"}
              title="A solid border, a dashed one or a dotted one"
              aria-label="Border style"
              onChange={(e) => update({ frameDash: e.target.value as StrokeStyle } as Partial<Layer>)}
              className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px] font-normal normal-case"
            >
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
            </select>
          </label>
        </div>
        {!layer.src && (
          <ColourField label="Empty frame colour" value={layer.frameFill} brand={brand}
            onChange={(c) => update({ frameFill: c } as Partial<Layer>)} />
        )}
      </Section>
      <Section title="Adjust">
        <Slider label="Brightness" title="Lighter or darker" min={50} max={150} value={Math.round((f.brightness ?? 1) * 100)} onChange={(v) => setF({ brightness: v / 100 })} />
        <Slider label="Colour strength" title="More or less colour" min={0} max={200} value={Math.round((f.saturation ?? 1) * 100)} onChange={(v) => setF({ saturation: v / 100 })} />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500" title="Black and white">
            <input type="checkbox" checked={f.grayscale === true} onChange={(e) => setF({ grayscale: e.target.checked })} />
            Black &amp; white
          </label>
          <label
            className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500"
            title="Tint the picture in your brand colour, so a stock photo stops looking like a stock photo"
          >
            <input type="checkbox" checked={!!f.tint} onChange={(e) => setF({ tint: e.target.checked ? brand.colours.primary : undefined })} />
            Brand tint
          </label>
        </div>
        {(f.grayscale || f.tint || (f.brightness && f.brightness !== 1) || (f.saturation && f.saturation !== 1)) && (
          <button type="button" onClick={() => update({ filters: undefined } as Partial<Layer>)}
            title="Put the picture back the way it came" className="text-[10px] font-semibold text-slate-500 hover:text-slate-700">
            Reset
          </button>
        )}
      </Section>
    </>
  );
}

/* ── Style › Shape ─────────────────────────────────────────────────────── */

function ShapeStyle({ layer, brand, update }: {
  layer: ShapeLayer; brand: StudioBrand; update: (p: Partial<Layer>) => void;
}) {
  return (
    <>
      {layer.shape !== "line" && (
        <Section title="Fill">
          <div className="flex gap-1 rounded bg-slate-100 p-0.5 text-[10px] font-semibold">
            {(["solid", "gradient", "pattern"] as const).map((m) => {
              const active = (layer.pattern ? "pattern" : layer.gradient ? "gradient" : "solid") === m;
              return (
                <button
                  key={m}
                  type="button"
                  title={m === "solid" ? "One flat colour"
                    : m === "gradient" ? "Fade between two colours"
                      : "A repeating texture — stripes, dots, a grid or a check"}
                  onClick={() => update(
                    m === "gradient"
                      ? { pattern: undefined, gradient: layer.gradient || { from: brand.colours.primary, to: brand.colours.secondary, dir: "d1" } } as Partial<Layer>
                      : m === "pattern"
                        ? {
                            gradient: undefined,
                            pattern: layer.pattern || {
                              kind: "stripe", colour: brand.colours.primary,
                              background: "none", size: 16, angle: 45, weight: 0.5,
                            },
                          } as Partial<Layer>
                        : { gradient: undefined, pattern: undefined } as Partial<Layer>,
                  )}
                  className={`flex-1 rounded px-1.5 py-0.5 capitalize ${active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                >
                  {m === "solid" ? "Solid" : m === "gradient" ? "Fade" : "Texture"}
                </button>
              );
            })}
          </div>
          {layer.pattern ? (
            <>
              {/*
                A REPEATING FILL (the reference designs' stripe texture).
                The tile is measured in canvas pixels rather than as a fraction
                of the shape, so a texture keeps its scale when the panel is
                resized — which is the whole difference between a texture and a
                pattern that stretches.
              */}
              <select
                value={layer.pattern.kind}
                aria-label="Texture"
                title={PATTERN_KINDS.find((k) => k.value === layer.pattern!.kind)?.hint || "The texture"}
                onChange={(e) => update({ pattern: { ...layer.pattern!, kind: e.target.value as PatternSpec["kind"] } } as Partial<Layer>)}
                className="w-full rounded border border-slate-200 px-1.5 py-1 text-[11px]"
              >
                {PATTERN_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
              <ColourField label="Texture colour" value={layer.pattern.colour} brand={brand}
                onChange={(c) => update({ pattern: { ...layer.pattern!, colour: c } } as Partial<Layer>)} />
              <ColourField label="Behind it" value={layer.pattern.background} brand={brand}
                onChange={(c) => update({ pattern: { ...layer.pattern!, background: c } } as Partial<Layer>)} />
              {/*
                R3-G: the cap was 120 px, and reference 01's diagonal bands are
                about 270 px apart on a 1080 canvas. So every textured panel in
                the studio read finer than the reference however far the slider
                was pushed — a control that stops short of the job. 400 px is a
                band you can see across a poster and still a texture on a
                business card.
              */}
              <Slider label="Tile size" title="How big one repeat is, in pixels" min={2} max={400} unit="px"
                value={layer.pattern.size ?? 16}
                onChange={(v) => update({ pattern: { ...layer.pattern!, size: v } } as Partial<Layer>)} />
              <Slider label="Thickness" title="How much of each tile is ink" min={5} max={95}
                value={Math.round((layer.pattern.weight ?? 0.5) * 100)}
                onChange={(v) => update({ pattern: { ...layer.pattern!, weight: v / 100 } } as Partial<Layer>)} />
              <Slider label="Angle" title="Turn the texture" min={0} max={180} unit="°"
                value={layer.pattern.angle ?? 0}
                onChange={(v) => update({ pattern: { ...layer.pattern!, angle: v } } as Partial<Layer>)} />
            </>
          ) : layer.gradient ? (
            <>
              <ColourField label="Fade from" value={layer.gradient.from} brand={brand}
                onChange={(c) => update({ gradient: { ...layer.gradient!, from: c } } as Partial<Layer>)} />
              <ColourField label="Fade to" value={layer.gradient.to} brand={brand}
                onChange={(c) => update({ gradient: { ...layer.gradient!, to: c } } as Partial<Layer>)} />
              <div className="flex gap-1">
                {(["h", "v", "d1", "d2"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => update({ gradient: { ...layer.gradient!, dir: d } } as Partial<Layer>)}
                    title={{ h: "Fade left to right", v: "Fade top to bottom", d1: "Fade diagonally down", d2: "Fade diagonally up" }[d]}
                    aria-label={{ h: "Fade left to right", v: "Fade top to bottom", d1: "Fade diagonally down", d2: "Fade diagonally up" }[d]}
                    className={"rounded border px-2 py-1 text-[11px] " +
                      (layer.gradient!.dir === d ? "border-slate-800 bg-slate-100 font-bold" : "border-slate-200 hover:bg-slate-50")}
                  >
                    {{ h: "→", v: "↓", d1: "↘", d2: "↗" }[d]}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <ColourField label="Colour" value={layer.fill} brand={brand} onChange={(c) => update({ fill: c } as Partial<Layer>)} />
          )}
        </Section>
      )}

      <Section title="Border">
        <ColourField label="Outline colour" value={layer.stroke} brand={brand} onChange={(c) => update({ stroke: c } as Partial<Layer>)} />
        <div className="grid grid-cols-2 gap-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Outline width
            <input
              type="number" min={0} max={60}
              title="How thick the outline is. 0 means none."
              aria-label="Outline width"
              value={layer.strokeWidth ?? 0}
              onChange={(e) => update({ strokeWidth: Math.max(0, Number(e.target.value) || 0) } as Partial<Layer>)}
              className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px] font-normal normal-case tabular-nums"
            />
          </label>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Outline style
            <select
              value={layer.dash || "solid"}
              data-stroke-style
              title="A solid line, a dashed one or a dotted one — a dashed ring and a dotted fill-in rule are both a stroke style, not a different shape"
              aria-label="Outline style"
              onChange={(e) => update({ dash: e.target.value as StrokeStyle } as Partial<Layer>)}
              className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px] font-normal normal-case"
            >
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
            </select>
          </label>
        </div>
        {layer.shape === "rect" && (
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Rounded corners
            <input
              type="number" min={0} max={400}
              title="How rounded the corners are"
              aria-label="Rounded corners"
              value={layer.radius ?? 0}
              onChange={(e) => update({ radius: Math.max(0, Number(e.target.value) || 0) } as Partial<Layer>)}
              className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px] font-normal normal-case tabular-nums"
            />
          </label>
        )}
      </Section>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   The chart's numbers
   ══════════════════════════════════════════════════════════════════════════ */

function ChartDataPanel({ layer, brand, onUpdate }: {
  layer: ChartLayer; brand: StudioBrand; onUpdate: (patch: Partial<ChartLayer>) => void;
}) {
  const values = layer.values || [];
  const setRow = (i: number, patch: Partial<{ label: string; value: number; colour: string }>) =>
    onUpdate({ values: values.map((v, idx) => (idx === i ? { ...v, ...patch } : v)) });
  return (
    <Section title="The numbers">
      <div className="flex gap-1 rounded bg-slate-100 p-0.5">
        {(["bar", "donut", "line"] as const).map((t) => (
          <button
            key={t} type="button"
            title={t === "bar" ? "Bars side by side" : t === "donut" ? "A ring split into slices" : "A line over time"}
            onClick={() => onUpdate({ chart: t })}
            className={`flex-1 rounded px-1.5 py-0.5 text-[10px] font-medium capitalize ${layer.chart === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="space-y-1">
        {values.map((v, i) => (
          <div key={i} className="flex items-center gap-1">
            <input type="text" value={v.label ?? ""} placeholder="Label" title="What this number is called" aria-label="Label"
              onChange={(e) => setRow(i, { label: e.target.value })}
              className="w-0 flex-1 rounded border border-slate-200 px-1.5 py-0.5 text-[11px]" />
            <input type="number" value={v.value} title="The number" aria-label="The number"
              onChange={(e) => setRow(i, { value: Math.max(0, Number(e.target.value) || 0) })}
              className="w-16 rounded border border-slate-200 px-1.5 py-0.5 text-[11px] tabular-nums" />
            {/*
              G-10: THIS BAR'S OWN COLOUR. Design 08 wanted the last bar picked
              out in the brand teal and the rest neutral, and a colour cycle
              cannot say that. Empty means "use the cycle", so a chart that was
              never touched is unchanged.
            */}
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(v.colour || "") ? v.colour : brand.colours.primary}
              title="This bar's own colour. Clear it to go back to the brand cycle."
              aria-label="This bar's colour"
              data-chart-row-colour={i}
              onChange={(e) => setRow(i, { colour: e.target.value })}
              className="h-5 w-5 cursor-pointer rounded border border-slate-300 p-0"
            />
            {v.colour && (
              <button type="button" title="Back to the brand cycle" aria-label="Back to the brand cycle"
                onClick={() => onUpdate({ values: values.map((row, idx) => (idx === i ? { label: row.label, value: row.value } : row)) })}
                className="rounded px-0.5 text-[9px] font-semibold text-slate-400 hover:text-slate-700">
                auto
              </button>
            )}
            <button type="button" title="Remove this row" aria-label="Remove this row" disabled={values.length <= 1}
              onClick={() => onUpdate({ values: values.filter((_, idx) => idx !== i) })}
              className="rounded p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30">
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
      <button type="button" title="Add another number" disabled={values.length >= MAX_CHART_VALUES}
        onClick={() => onUpdate({ values: [...values, { label: "", value: 0 }] })}
        className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-40">
        <Plus className="h-3 w-3" /> Add a number
      </button>
      {/*
        G-10: the number on the mark. Without it a bar chart on a slide is a
        row of shapes with no reading, which is what design 08 came out as.
      */}
      <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500"
        title="Print each number on its own bar, dot or slice">
        <input type="checkbox" data-chart-show-values checked={layer.showValues === true}
          onChange={(e) => onUpdate({ showValues: e.target.checked })} />
        Show the numbers
      </label>
      {layer.showValues && (
        <div className="grid grid-cols-2 gap-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Before
            <input type="text" value={layer.valuePrefix ?? ""} placeholder="$" maxLength={4}
              title="Written in front of every number — a currency sign, usually"
              aria-label="Written before the number"
              onChange={(e) => onUpdate({ valuePrefix: e.target.value })}
              className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px] font-normal normal-case" />
          </label>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            After
            <input type="text" value={layer.valueSuffix ?? ""} placeholder="%" maxLength={4}
              title="Written after every number — a per cent sign or a k, usually"
              aria-label="Written after the number"
              onChange={(e) => onUpdate({ valueSuffix: e.target.value })}
              className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px] font-normal normal-case" />
          </label>
        </div>
      )}
      <div className="flex items-center gap-1 text-[10px] text-slate-400">
        <Sparkles className="h-3 w-3" /> Downloads come out in your brand colours automatically.
      </div>
    </Section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Small parts
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * A colour control: the business's five swatches, a hex box, then the system
 * picker. Brand FIRST and everything else still reachable — Q4, in a widget.
 */
export function ColourField({ label, value, brand, onChange }: {
  label: string; value: string | undefined | null; brand: StudioBrand; onChange: (c: string) => void;
}) {
  const swatches = brandSwatches(brand);
  const current = value && value !== "none" ? value : "";
  const valid = /^#[0-9a-fA-F]{6}$/.test(current);
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="flex items-center gap-1">
        {swatches.map((s, i) => (
          <button
            key={`${s.colour}-${i}`}
            type="button"
            onClick={() => onChange(s.colour)}
            title={`${s.label} — ${s.colour}`}
            aria-label={s.label}
            data-brand-swatch={s.colour}
            className={"h-5 w-5 rounded border hover:scale-110 " +
              (valid && current.toUpperCase() === s.colour.toUpperCase() ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-300")}
            style={{ background: s.colour }}
          />
        ))}
        <input
          type="text"
          value={current}
          placeholder="#RRGGBB"
          title="Any colour you like — type its hex code"
          aria-label={`${label} hex code`}
          data-colour-hex
          onChange={(e) => {
            const v = e.target.value.trim();
            if (/^#?[0-9a-fA-F]{0,6}$/.test(v)) onChange(v.startsWith("#") || v === "" ? v : `#${v}`);
          }}
          className="w-[72px] rounded border border-slate-200 px-1 py-0.5 text-[10px] uppercase tabular-nums"
        />
        <input
          type="color"
          value={valid ? current : "#000000"}
          title="Pick any colour"
          aria-label={`${label} colour picker`}
          onChange={(e) => onChange(e.target.value)}
          className="h-6 w-7 cursor-pointer rounded border border-slate-200"
        />
      </div>
    </div>
  );
}

function NumField({ label, title, value, onChange, step = 1, min }: {
  label: string; title: string; value: number; onChange: (v: number) => void; step?: number; min?: number;
}) {
  return (
    <label className="flex items-center gap-1 text-[11px] text-slate-600" title={title}>
      <span className="w-4 text-[10px] font-semibold uppercase text-slate-400">{label}</span>
      <input
        type="number"
        value={Math.round(value * 10) / 10}
        step={step}
        min={min}
        title={title}
        aria-label={title}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-full min-w-0 rounded border border-slate-200 px-1.5 py-0.5 tabular-nums"
      />
    </label>
  );
}

/**
 * `unit` because not every slider is a percentage, and one that says so when it
 * is not is the control lying quietly. Tile size is PIXELS and has read "16%"
 * since it shipped; Lean is DEGREES and would have read "9%".
 */
function Slider({ label, title, min, max, value, unit = "%", onChange }: {
  label: string; title: string; min: number; max: number; value: number;
  unit?: string; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-0.5 flex justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        <span>{label}</span><span className="tabular-nums">{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} value={value} title={title} aria-label={title}
        onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
    </div>
  );
}

function IconButton({ title, onClick, children, className }: {
  title: string; onClick: () => void; children: React.ReactNode; className?: string;
}) {
  return (
    <button type="button" onClick={onClick} title={title} aria-label={title}
      className={"rounded border border-slate-200 p-1 hover:border-slate-800 hover:bg-slate-50 " + (className || "")}>
      {children}
    </button>
  );
}

function ToggleButton({ title, active, onClick, children }: {
  title: string; active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button" onClick={onClick} title={title} aria-label={title}
      className={"rounded border px-1.5 py-1 text-[11px] font-semibold " +
        (active ? "border-slate-800 bg-slate-100" : "border-slate-200 hover:bg-slate-50")}
    >
      {children}
    </button>
  );
}

export default LayerInspector;
