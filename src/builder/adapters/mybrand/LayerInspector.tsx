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
  Trash2, Underline, Ungroup, Unlock, Wand2, WandSparkles, X,
} from "lucide-react";
import {
  familyOf, fontOptions, ICON_PATHS,
  type CanvasDoc, type ChartLayer, type ImageFilters, type ImageLayer, type ImageMask,
  type Layer, type ShapeLayer, type TextLayer,
} from "./scene";
import { TEXT_EFFECTS, type StrokeStyle, type TextCase } from "./textEffects";
import type { StudioBrand } from "./insert";
import { brandSwatches } from "./insert";

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
  if (p.tab === "content") {
    return (
      <Section title={`${ids.length} things selected`}>
        <div className="rounded border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600">
          {[...kinds].join(", ")} — {ids.length} of them. Line them up and space them out under
          <strong> Advanced</strong>, or give them all one look under <strong>Style</strong>.
        </div>
      </Section>
    );
  }
  if (p.tab === "style") {
    return (
      <Section title="One look for all of them">
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
    );
  }
  return <ArrangeSections {...p} ids={ids} grouped={grouped} many />;
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
          </Section>
        )}
        {layer.kind === "image" && (
          <Section title="Picture">
            <ImageContent
              layer={layer as ImageLayer}
              onRemoveBackground={p.onRemoveBackground ? () => p.onRemoveBackground!(layer.id) : undefined}
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
  // A bulge bigger than the box is an arc with its top cut off, so the slider
  // stops where the picture stops.
  const maxBulge = Math.max(20, Math.round(Math.min(layer.w, layer.h * 2) * 0.5));

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

function ImageContent({ layer, onRemoveBackground, busy, error }: {
  layer: ImageLayer; onRemoveBackground?: () => void; busy?: boolean; error?: string | null;
}) {
  return (
    <>
      <div className="rounded border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600">
        {layer.src ? "A picture is in this slot. Its look is under Style." : "An empty slot. Place a picture from the pane on the left."}
      </div>
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
            <option value="blob1">Organic 1</option>
            <option value="blob2">Organic 2</option>
            <option value="arch">Arch</option>
          </select>
        </label>
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

function ChartDataPanel({ layer, onUpdate }: { layer: ChartLayer; onUpdate: (patch: Partial<ChartLayer>) => void }) {
  const values = layer.values || [];
  const setRow = (i: number, patch: Partial<{ label: string; value: number }>) =>
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
