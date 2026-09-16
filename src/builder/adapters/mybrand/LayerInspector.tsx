/**
 * builder/adapters/mybrand/LayerInspector.tsx — the RIGHT pane of the shared shell.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §5 step 5. Everywhere else in the builder
 * the right column is builder/Inspector.tsx, bound to a section or a widget.
 * Here it is bound to a LAYER, because that is what a pixel canvas selects —
 * but it sits in the same slot, at the same width, and follows the same two
 * rules the shared inspector follows:
 *
 *   1. It only shows what has no place on the page itself. Words are typed on
 *      the canvas; position, colour, font and stacking are typed here.
 *   2. EVERY button carries a tooltip (SD-010, not optional) — including the
 *      six align icons and the four gradient arrows, which say nothing on
 *      their own.
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
import { useState } from "react";
import {
  AlignCenter, AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal,
  AlignEndVertical, AlignLeft, AlignRight, AlignStartHorizontal, AlignStartVertical,
  BarChart3, Bold, ChevronDown, ChevronUp, Circle, Contrast, Copy, Eye, EyeOff,
  Layers, Lock, Minus, Palette, Plus, Square, Star, Trash2, Type as TypeIcon,
  Unlock, Wand2, X, Image as ImageIcon,
} from "lucide-react";
import {
  familyOf, fontOptions, ICON_PATHS,
  type CanvasDoc, type ChartLayer, type ImageFilters, type ImageLayer, type ImageMask,
  type Layer, type ShapeLayer, type TextLayer,
} from "./scene";
import type { StudioBrand } from "./insert";
import { brandSwatches } from "./insert";

const MAX_CHART_VALUES = 12;

export interface LayerInspectorProps {
  doc: CanvasDoc;
  brand: StudioBrand;
  selected: Layer | null;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, patch: Partial<Layer>) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onReorder: (id: string, direction: "up" | "down") => void;
  onToggleVisibility: (id: string) => void;
  onAlign: (id: string, which: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom") => void;
  onFixContrast: (id: string) => void;
  onSetBackground: (colour: string) => void;
  onBrandSync: () => void;
  brandSyncAvailable: boolean;
  onRemoveBackground?: (id: string) => void;
  removeBackgroundBusy?: boolean;
  removeBackgroundError?: string | null;
}

export function LayerInspector(p: LayerInspectorProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-[1.4] overflow-y-auto border-b border-slate-200">
        {p.selected
          ? <LayerProperties {...p} layer={p.selected} />
          : <CanvasProperties {...p} />}
        {p.selected?.kind === "chart" && (
          <ChartDataPanel
            layer={p.selected as ChartLayer}
            onUpdate={(patch) => p.onUpdate(p.selected!.id, patch as Partial<Layer>)}
          />
        )}
      </div>

      <div className="border-b border-slate-200 px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Layers ({p.doc.layers.length})
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {p.doc.layers.length === 0 ? (
          <div className="m-3 rounded-lg border-2 border-dashed border-slate-200 p-4 text-center">
            <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100">
              <Layers className="h-4 w-4 text-slate-400" />
            </div>
            <div className="text-xs text-slate-500">
              Nothing on the design yet. Add something from the pane on the left, or start from a template.
            </div>
          </div>
        ) : (
          // Reversed: the topmost layer is the top row, as in every layer list.
          [...p.doc.layers].reverse().map((layer) => (
            <LayerRow
              key={layer.id}
              layer={layer}
              selected={layer.id === p.selected?.id}
              onSelect={() => p.onSelect(layer.id)}
              onToggleVisibility={() => p.onToggleVisibility(layer.id)}
              onForward={() => p.onReorder(layer.id, "up")}
              onBack={() => p.onReorder(layer.id, "down")}
            />
          ))
        )}
      </div>

      <div className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-[10px] text-slate-500">
        <div className="font-semibold uppercase tracking-wide">Shortcuts</div>
        <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5">
          <span>Save</span><span className="text-right">⌘/Ctrl+S</span>
          <span>Duplicate</span><span className="text-right">⌘/Ctrl+D</span>
          <span>Undo</span><span className="text-right">⌘/Ctrl+Z</span>
          <span>Redo</span><span className="text-right">⌘/Ctrl+⇧+Z</span>
          <span>Delete</span><span className="text-right">Del</span>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Nothing selected — the canvas itself, never 320px of empty grey
   ══════════════════════════════════════════════════════════════════════════ */

function CanvasProperties(p: LayerInspectorProps) {
  const transparent = p.doc.background_color == null || String(p.doc.background_color).toLowerCase() === "transparent";
  return (
    <div className="p-3">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">This design</div>
      <div className="mb-3 rounded border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600">
        <div className="tabular-nums">{p.doc.width} × {p.doc.height} pixels</div>
        <div className="mt-0.5">Click anything on the design to edit it, or add something from the left.</div>
      </div>

      <ColourField
        label="Background"
        value={transparent ? "" : (p.doc.background_color || "")}
        brand={p.brand}
        onChange={p.onSetBackground}
      />
      <button
        type="button"
        onClick={() => p.onSetBackground(transparent ? p.brand.colours.background : "transparent")}
        title="A see-through background — PNG exports keep the transparency, which is what a logo needs"
        className={"mt-2 w-full rounded border px-2 py-1 text-[11px] font-semibold " +
          (transparent ? "border-slate-800 bg-slate-800 text-white" : "border-slate-200 text-slate-700 hover:bg-slate-50")}
      >
        {transparent ? "See-through background (on)" : "Make the background see-through"}
      </button>

      <button
        type="button"
        onClick={p.brandSyncAvailable ? p.onBrandSync : undefined}
        disabled={!p.brandSyncAvailable}
        title={p.brandSyncAvailable
          ? "Brand Sync — pull every colour in this design to the nearest colour in your brand. Undo puts it back."
          : "Brand Sync is a Pro feature"}
        className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
      >
        <Palette className="h-3 w-3" /> Brand Sync{!p.brandSyncAvailable && " · Pro+"}
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   One layer
   ══════════════════════════════════════════════════════════════════════════ */

function LayerProperties(p: LayerInspectorProps & { layer: Layer }) {
  const { layer, brand } = p;
  const update = (patch: Partial<Layer>) => p.onUpdate(layer.id, patch);
  const locked = layer.locked === true;
  const kindLabel =
    layer.kind === "text" ? "Text"
      : layer.kind === "image" ? "Picture"
        : layer.kind === "chart" ? "Chart"
          : (layer as ShapeLayer).shape === "icon" ? "Symbol"
            : "Shape";

  return (
    <div className="p-3">
      <div className="mb-2 flex items-center gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{kindLabel}</span>
        <div className="ml-auto flex items-center">
          <IconButton title="Bring forward — move it in front of what it overlaps" onClick={() => p.onReorder(layer.id, "up")}><ChevronUp className="h-3.5 w-3.5" /></IconButton>
          <IconButton title="Send back — move it behind what it overlaps" onClick={() => p.onReorder(layer.id, "down")}><ChevronDown className="h-3.5 w-3.5" /></IconButton>
          <IconButton title="Make a copy of this (⌘/Ctrl+D)" onClick={() => p.onDuplicate(layer.id)}><Copy className="h-3.5 w-3.5" /></IconButton>
          <IconButton
            title={locked ? "Unlock — let it be moved again" : "Lock — stop it being moved by accident"}
            onClick={() => update({ locked: !locked })}
            className={locked ? "bg-amber-100 text-amber-700" : undefined}
          >
            {locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          </IconButton>
          <IconButton title="Delete this (Del)" onClick={() => p.onDelete(layer.id)} className="hover:bg-rose-100 hover:text-rose-600">
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>

      {/* Position and size */}
      <div className="mb-2 grid grid-cols-2 gap-1.5">
        <NumField label="X" title="How far from the left edge" value={layer.x} onChange={(v) => update({ x: Math.round(v) })} />
        <NumField label="Y" title="How far from the top edge" value={layer.y} onChange={(v) => update({ y: Math.round(v) })} />
        <NumField label="W" title="How wide" value={layer.w} min={1} onChange={(v) => update({ w: Math.max(1, Math.round(v)) })} />
        <NumField label="H" title="How tall" value={layer.h} min={0} onChange={(v) => update({ h: Math.max(0, Math.round(v)) })} />
      </div>

      {/* Rotation and flips */}
      <div className="mb-2 flex items-center gap-1.5">
        <NumField label="↻" title="Rotation, in degrees" value={layer.rotation || 0}
          onChange={(v) => update({ rotation: (((Math.round(v) % 360) + 360) % 360) })} />
        <ToggleButton title="Flip left to right" active={!!layer.flipH} onClick={() => update({ flipH: !layer.flipH })}>↔</ToggleButton>
        <ToggleButton title="Flip top to bottom" active={!!layer.flipV} onClick={() => update({ flipV: !layer.flipV })}>↕</ToggleButton>
      </div>

      <div className="mb-2">
        <div className="mb-0.5 flex justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          <span>See-through</span><span className="tabular-nums">{Math.round((layer.opacity ?? 1) * 100)}%</span>
        </div>
        <input
          type="range" min={0} max={100}
          title="How solid this is — 100% is fully solid"
          value={Math.round((layer.opacity ?? 1) * 100)}
          onChange={(e) => update({ opacity: Number(e.target.value) / 100 })}
          className="w-full"
        />
      </div>

      {/* Align to the canvas */}
      <div className="mb-3">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Line it up with the design</div>
        <div className="flex gap-1">
          {([
            ["left", AlignStartVertical, "Push it to the left edge"],
            ["hcenter", AlignCenterVertical, "Centre it left to right"],
            ["right", AlignEndVertical, "Push it to the right edge"],
            ["top", AlignStartHorizontal, "Push it to the top"],
            ["vcenter", AlignCenterHorizontal, "Centre it top to bottom"],
            ["bottom", AlignEndHorizontal, "Push it to the bottom"],
          ] as const).map(([which, Icon, title]) => (
            <button
              key={which}
              type="button"
              onClick={() => p.onAlign(layer.id, which)}
              title={title}
              aria-label={title}
              className="rounded border border-slate-200 p-1 hover:border-slate-800 hover:bg-slate-50"
            >
              <Icon className="h-3.5 w-3.5 text-slate-600" />
            </button>
          ))}
        </div>
      </div>

      {layer.kind === "text" && <TextTools layer={layer as TextLayer} brand={brand} update={update} onFixContrast={() => p.onFixContrast(layer.id)} />}
      {layer.kind === "image" && (
        <ImageTools
          layer={layer as ImageLayer}
          brand={brand}
          update={update}
          onRemoveBackground={p.onRemoveBackground ? () => p.onRemoveBackground!(layer.id) : undefined}
          busy={p.removeBackgroundBusy}
          error={p.removeBackgroundError}
        />
      )}
      {layer.kind === "shape" && <ShapeTools layer={layer as ShapeLayer} brand={brand} update={update} />}
    </div>
  );
}

/* ── Text ──────────────────────────────────────────────────────────────── */

function TextTools({ layer, brand, update, onFixContrast }: {
  layer: TextLayer; brand: StudioBrand; update: (p: Partial<Layer>) => void; onFixContrast: () => void;
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
  return (
    <div className="space-y-2 border-t border-slate-100 pt-2">
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Words</div>
        <textarea
          value={layer.content}
          title="The words on the design. You can also type straight on the canvas."
          onChange={(e) => update({ content: e.target.value } as Partial<Layer>)}
          rows={2}
          className="w-full resize-y rounded border border-slate-200 px-2 py-1.5 text-[12px] focus:border-slate-500 focus:outline-none"
        />
      </div>

      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Font</div>
        <div className="flex gap-1">
          <select
            value={current}
            data-studio-font
            title="Your brand fonts are at the top. Every other font we carry is under them — pick any of them."
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
            value={layer.size || 24}
            onChange={(e) => update({ size: Math.max(6, Number(e.target.value) || 24) } as Partial<Layer>)}
            className="w-14 rounded border border-slate-200 px-1.5 py-1 text-[11px] tabular-nums"
          />
        </div>
        {chosen && !chosen.export_safe && (
          <div className="mt-1 text-[10px] text-amber-700">
            We do not carry this face for downloads — an exported picture will use the closest one we have.
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        <ToggleButton title="Bold" active={layer.weight === "700"} onClick={() => update({ weight: layer.weight === "700" ? "400" : "700" } as Partial<Layer>)}>
          <Bold className="h-3 w-3" />
        </ToggleButton>
        {([["left", AlignLeft, "Line the words up on the left"], ["center", AlignCenter, "Centre the words"], ["right", AlignRight, "Line the words up on the right"]] as const).map(([a, Icon, title]) => (
          <ToggleButton key={a} title={title} active={layer.align === a} onClick={() => update({ align: a } as Partial<Layer>)}>
            <Icon className="h-3 w-3" />
          </ToggleButton>
        ))}
        <select
          value={layer.effect === "lift" ? "lift" : layer.effect === "hollow" ? "hollow" : layer.outline ? "outline" : layer.shadow ? "shadow" : "none"}
          title="A shadow or an outline, so words stay readable over a photo"
          onChange={(e) => {
            const v = e.target.value;
            const reset = { shadow: false, effect: undefined, outline: undefined } as Partial<Layer>;
            if (v === "shadow") update({ ...reset, shadow: true } as Partial<Layer>);
            else if (v === "lift") update({ ...reset, effect: "lift" } as Partial<Layer>);
            else if (v === "hollow") update({ ...reset, effect: "hollow" } as Partial<Layer>);
            else if (v === "outline") update({ ...reset, outline: brand.colours.primary } as Partial<Layer>);
            else update(reset);
          }}
          className="ml-auto rounded border border-slate-200 px-1.5 py-1 text-[11px]"
        >
          <option value="none">No effect</option>
          <option value="shadow">Shadow</option>
          <option value="lift">Lift</option>
          <option value="outline">Outline</option>
          <option value="hollow">Hollow</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Line spacing
          <input
            type="number" step={0.05} min={0.7} max={3}
            title="The gap between lines of words"
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
            value={layer.letterSpacing ?? 0}
            onChange={(e) => update({ letterSpacing: Number(e.target.value) || 0 } as Partial<Layer>)}
            className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px] font-normal normal-case tabular-nums"
          />
        </label>
      </div>

      <ColourField label="Colour" value={layer.color} brand={brand} onChange={(c) => update({ color: c } as Partial<Layer>)} />
      {layer.outline && (
        <ColourField label="Outline colour" value={layer.outline} brand={brand} onChange={(c) => update({ outline: c } as Partial<Layer>)} />
      )}

      <button
        type="button"
        onClick={onFixContrast}
        title="Flip these words to white or near-black, whichever you can actually read on what is behind them"
        className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
      >
        <Contrast className="h-3 w-3" /> Make it readable
      </button>
    </div>
  );
}

/* ── Picture ───────────────────────────────────────────────────────────── */

function ImageTools({ layer, brand, update, onRemoveBackground, busy, error }: {
  layer: ImageLayer; brand: StudioBrand; update: (p: Partial<Layer>) => void;
  onRemoveBackground?: () => void; busy?: boolean; error?: string | null;
}) {
  const f = layer.filters || {};
  const setF = (patch: Partial<ImageFilters>) => update({ filters: { ...f, ...patch } } as Partial<Layer>);
  return (
    <div className="space-y-2 border-t border-slate-100 pt-2">
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

      <div className="grid grid-cols-2 items-end gap-1.5">
        <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Picture shape
          <select
            value={layer.mask || "none"}
            title="Crop the picture to a circle, an arch or a soft blob — a plain rectangle is the amateur tell"
            onChange={(e) => update({ mask: e.target.value === "none" ? undefined : (e.target.value as ImageMask) } as Partial<Layer>)}
            className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px] font-normal normal-case"
          >
            <option value="none">Rectangle</option>
            <option value="circle">Circle</option>
            <option value="rounded">Rounded</option>
            <option value="blob1">Organic 1</option>
            <option value="blob2">Organic 2</option>
            <option value="arch">Arch</option>
          </select>
        </label>
        <label
          className="flex items-center gap-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500"
          title="Tint the picture in your brand colour, so a stock photo stops looking like a stock photo"
        >
          <input
            type="checkbox"
            checked={!!f.tint}
            onChange={(e) => setF({ tint: e.target.checked ? brand.colours.primary : undefined })}
          />
          Brand tint
        </label>
      </div>

      <Slider label="Brightness" title="Lighter or darker" min={50} max={150} value={Math.round((f.brightness ?? 1) * 100)} onChange={(v) => setF({ brightness: v / 100 })} />
      <Slider label="Colour strength" title="More or less colour" min={0} max={200} value={Math.round((f.saturation ?? 1) * 100)} onChange={(v) => setF({ saturation: v / 100 })} />
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500" title="Black and white">
          <input type="checkbox" checked={f.grayscale === true} onChange={(e) => setF({ grayscale: e.target.checked })} />
          Black &amp; white
        </label>
        {(f.grayscale || (f.brightness && f.brightness !== 1) || (f.saturation && f.saturation !== 1)) && (
          <button type="button" onClick={() => update({ filters: undefined } as Partial<Layer>)}
            title="Put the picture back the way it came" className="text-[10px] font-semibold text-slate-500 hover:text-slate-700">
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Shape and symbol ──────────────────────────────────────────────────── */

function ShapeTools({ layer, brand, update }: {
  layer: ShapeLayer; brand: StudioBrand; update: (p: Partial<Layer>) => void;
}) {
  const [pickIcon, setPickIcon] = useState(false);
  const isIcon = layer.shape === "icon";
  return (
    <div className="space-y-2 border-t border-slate-100 pt-2">
      {isIcon && (
        <div>
          <button
            type="button"
            onClick={() => setPickIcon((v) => !v)}
            title="Swap this for a different symbol"
            className="inline-flex w-full items-center justify-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Star className="h-3 w-3" /> {pickIcon ? "Close the symbols" : "Swap the symbol"}
          </button>
          {pickIcon && (
            <div className="mt-1.5 grid max-h-44 grid-cols-6 gap-1 overflow-y-auto rounded border border-slate-200 p-1.5">
              {Object.entries(ICON_PATHS).map(([key, d]) => (
                <button
                  key={key} type="button" title={key}
                  onClick={() => { update({ icon: key } as Partial<Layer>); setPickIcon(false); }}
                  className={"flex aspect-square items-center justify-center rounded border hover:border-slate-800 " +
                    (layer.icon === key ? "border-slate-800 bg-slate-100" : "border-slate-200")}
                >
                  <svg viewBox="0 0 100 100" className="h-5 w-5"><path d={d} fillRule="evenodd" fill="#334155" /></svg>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {layer.shape !== "line" && (
        <>
          <div className="flex gap-1 rounded bg-slate-100 p-0.5 text-[10px] font-semibold">
            {(["solid", "gradient"] as const).map((m) => {
              const active = (layer.gradient ? "gradient" : "solid") === m;
              return (
                <button
                  key={m}
                  type="button"
                  title={m === "solid" ? "One flat colour" : "Fade between two colours"}
                  onClick={() => update(
                    m === "gradient"
                      ? { gradient: layer.gradient || { from: brand.colours.primary, to: brand.colours.secondary, dir: "d1" } } as Partial<Layer>
                      : { gradient: undefined } as Partial<Layer>,
                  )}
                  className={`flex-1 rounded px-1.5 py-0.5 capitalize ${active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                >
                  {m === "solid" ? "Solid" : "Fade"}
                </button>
              );
            })}
          </div>

          {layer.gradient ? (
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
        </>
      )}

      <ColourField label="Outline colour" value={layer.stroke} brand={brand} onChange={(c) => update({ stroke: c } as Partial<Layer>)} />
      <div className="grid grid-cols-2 gap-1.5">
        <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Outline width
          <input
            type="number" min={0} max={60}
            title="How thick the outline is. 0 means none."
            value={layer.strokeWidth ?? 0}
            onChange={(e) => update({ strokeWidth: Math.max(0, Number(e.target.value) || 0) } as Partial<Layer>)}
            className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px] font-normal normal-case tabular-nums"
          />
        </label>
        {layer.shape === "rect" && (
          <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Rounded corners
            <input
              type="number" min={0} max={400}
              title="How rounded the corners are"
              value={layer.radius ?? 0}
              onChange={(e) => update({ radius: Math.max(0, Number(e.target.value) || 0) } as Partial<Layer>)}
              className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px] font-normal normal-case tabular-nums"
            />
          </label>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   The chart's numbers
   ══════════════════════════════════════════════════════════════════════════ */

function ChartDataPanel({ layer, onUpdate }: { layer: ChartLayer; onUpdate: (patch: Partial<ChartLayer>) => void }) {
  const values = layer.values || [];
  const setRow = (i: number, patch: Partial<{ label: string; value: number }>) =>
    onUpdate({ values: values.map((v, idx) => (idx === i ? { ...v, ...patch } : v)) });
  return (
    <div className="border-b border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">The numbers</span>
        <div className="flex gap-1 rounded bg-slate-100 p-0.5">
          {(["bar", "donut", "line"] as const).map((t) => (
            <button
              key={t} type="button"
              title={t === "bar" ? "Bars side by side" : t === "donut" ? "A ring split into slices" : "A line over time"}
              onClick={() => onUpdate({ chart: t })}
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium capitalize ${layer.chart === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1">
        {values.map((v, i) => (
          <div key={i} className="flex items-center gap-1">
            <input type="text" value={v.label ?? ""} placeholder="Label" title="What this number is called"
              onChange={(e) => setRow(i, { label: e.target.value })}
              className="w-0 flex-1 rounded border border-slate-200 px-1.5 py-0.5 text-[11px]" />
            <input type="number" value={v.value} title="The number"
              onChange={(e) => setRow(i, { value: Math.max(0, Number(e.target.value) || 0) })}
              className="w-16 rounded border border-slate-200 px-1.5 py-0.5 text-[11px] tabular-nums" />
            <button type="button" title="Remove this row" disabled={values.length <= 1}
              onClick={() => onUpdate({ values: values.filter((_, idx) => idx !== i) })}
              className="rounded p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30">
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
      <button type="button" title="Add another number" disabled={values.length >= MAX_CHART_VALUES}
        onClick={() => onUpdate({ values: [...values, { label: "", value: 0 }] })}
        className="mt-2 inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-40">
        <Plus className="h-3 w-3" /> Add a number
      </button>
      <div className="mt-1.5 text-[10px] text-slate-400">Downloads come out in your brand colours automatically.</div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Small parts
   ══════════════════════════════════════════════════════════════════════════ */

function LayerRow({ layer, selected, onSelect, onToggleVisibility, onForward, onBack }: {
  layer: Layer; selected: boolean; onSelect: () => void;
  onToggleVisibility: () => void; onForward: () => void; onBack: () => void;
}) {
  const visible = layer.visible !== false;
  let Icon = TypeIcon;
  let label = "Text";
  if (layer.kind === "image") { Icon = ImageIcon; label = "Picture"; }
  else if (layer.kind === "chart") { Icon = BarChart3; label = `Chart · ${(layer as ChartLayer).chart}`; }
  else if (layer.kind === "shape") {
    const sh = (layer as ShapeLayer).shape;
    label = sh === "rect" ? "Rectangle" : sh === "ellipse" ? "Circle" : sh === "icon" ? `Symbol · ${(layer as ShapeLayer).icon || "?"}` : "Line";
    Icon = sh === "ellipse" ? Circle : sh === "line" ? Minus : sh === "icon" ? Star : Square;
  } else if (layer.kind === "text") {
    label = (layer as TextLayer).content || "Text";
  }
  return (
    <div
      onClick={onSelect}
      title={`Select ${label}`}
      className={"group flex cursor-pointer items-center gap-2 border-b border-slate-100 px-3 py-1.5 " +
        (selected ? "bg-yellow-50" : "hover:bg-slate-50")}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
      <span className="flex-1 truncate text-xs">{label}</span>
      <button type="button" onClick={(e) => { e.stopPropagation(); onForward(); }} title="Bring forward"
        className="invisible rounded p-1 hover:bg-slate-200 group-hover:visible"><ChevronUp className="h-3 w-3" /></button>
      <button type="button" onClick={(e) => { e.stopPropagation(); onBack(); }} title="Send back"
        className="invisible rounded p-1 hover:bg-slate-200 group-hover:visible"><ChevronDown className="h-3 w-3" /></button>
      <button type="button" onClick={(e) => { e.stopPropagation(); onToggleVisibility(); }}
        title={visible ? "Hide this for now" : "Show this again"} className="rounded p-1 hover:bg-slate-200">
        {visible ? <Eye className="h-3 w-3 text-slate-500" /> : <EyeOff className="h-3 w-3 text-slate-400" />}
      </button>
    </div>
  );
}

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

function Slider({ label, title, min, max, value, onChange }: {
  label: string; title: string; min: number; max: number; value: number; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-0.5 flex justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        <span>{label}</span><span className="tabular-nums">{value}%</span>
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
      className={"rounded p-1 " + (className || "hover:bg-slate-100")}>
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
