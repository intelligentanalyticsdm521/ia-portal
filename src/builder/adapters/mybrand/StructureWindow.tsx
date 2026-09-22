/**
 * builder/adapters/mybrand/StructureWindow.tsx — the layer list, where §11.13 put it.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §11.13.1, the agreed screen: *"The tree —
 * 'Structure': a small FLOATING window opened from the top bar, closable,
 * draggable … it leaves the left panel."* Gap G-19.
 *
 * Until now the studio's layer list was stapled to the bottom of the right
 * panel, which cost the inspector half its height on every design and put the
 * stack in the one place §11.13 says it must not be. It moves here, and it
 * gains the two things a layer list is FOR and did not have:
 *
 *   • DRAG A ROW TO REORDER. One step up and one step down is not a stacking
 *     control, it is a stacking control's apology — moving a background band
 *     behind eleven other things was eleven clicks.
 *   • SEE AND CHANGE THE SELECTION. Shift-click extends, Ctrl/Cmd-click adds
 *     or removes, and a row belonging to a group says so and selects the group.
 *
 * ── WHY IT FLOATS OVER THE STUDIO AND NOT OVER THE APP ────────────────────
 * It is positioned inside the studio's own centre pane, so it cannot be
 * dragged out over the header, the widget pane or another page. A floating
 * tool window that can be lost behind the app is a tool window people stop
 * opening.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BarChart3, Circle, Eye, EyeOff, GripVertical, Image as ImageIcon, Layers,
  Lock, Minus, Square, Star, Type as TypeIcon, Unlock, X,
} from "lucide-react";
import type { ChartLayer, Layer, ShapeLayer, TextLayer } from "./scene";

export interface StructureWindowProps {
  open: boolean;
  onClose: () => void;
  layers: Layer[];
  selectedIds: string[];
  /** `additive` = Ctrl/Cmd-click, `range` = Shift-click. */
  onSelect: (id: string, mode: "replace" | "additive" | "range") => void;
  /** A row was dropped: put `id` at this index in the BOTTOM-UP layer array. */
  onMove: (id: string, toIndex: number) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
}

/** What a row calls itself, and the picture beside it. */
export function describeLayer(layer: Layer): { label: string; Icon: typeof TypeIcon } {
  if (layer.kind === "image") return { label: "Picture", Icon: ImageIcon };
  if (layer.kind === "chart") return { label: `Chart · ${(layer as ChartLayer).chart}`, Icon: BarChart3 };
  if (layer.kind === "shape") {
    const sh = (layer as ShapeLayer).shape;
    if (sh === "rect") return { label: "Rectangle", Icon: Square };
    if (sh === "ellipse") return { label: "Circle", Icon: Circle };
    if (sh === "icon") return { label: `Symbol · ${(layer as ShapeLayer).icon || "?"}`, Icon: Star };
    return { label: "Line", Icon: Minus };
  }
  return { label: (layer as TextLayer).content?.trim() || "Text", Icon: TypeIcon };
}

/**
 * Groups get a number rather than an id on screen — "Group 2" is a thing a
 * person can point at, `group-k3f9a1` is not. The number is the order the
 * group's LOWEST member sits at, so it is stable while nothing moves.
 */
export function groupNumbers(layers: Layer[]): Map<string, number> {
  const out = new Map<string, number>();
  let n = 0;
  for (const l of layers) {
    if (l.groupId && !out.has(l.groupId)) out.set(l.groupId, ++n);
  }
  return out;
}

export function StructureWindow(p: StructureWindowProps) {
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 16, y: 56 });
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  /* ── Dragging the window itself ────────────────────────────────────────── */
  const onTitleDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    e.preventDefault();
  }, [pos.x, pos.y]);

  useEffect(() => {
    if (!p.open) return;
    function move(e: MouseEvent) {
      if (!dragRef.current) return;
      setPos({ x: Math.max(0, e.clientX - dragRef.current.dx), y: Math.max(0, e.clientY - dragRef.current.dy) });
    }
    function up() { dragRef.current = null; }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, [p.open]);

  if (!p.open) return null;

  // Topmost first, as in every layer list ever made. The array is bottom-up.
  const rows = [...p.layers].reverse();
  const numbers = groupNumbers(p.layers);

  return (
    <div
      data-structure-window
      className="absolute z-30 flex max-h-[70%] w-64 flex-col rounded-lg border border-slate-300 bg-white shadow-xl"
      style={{ left: pos.x, top: pos.y }}
    >
      <div
        onMouseDown={onTitleDown}
        title="Drag to move this window"
        className="flex cursor-move items-center gap-1.5 rounded-t-lg border-b border-slate-200 bg-slate-50 px-2.5 py-1.5"
      >
        <Layers className="h-3.5 w-3.5 text-slate-500" />
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-700">Structure</span>
        <span className="text-[10px] text-slate-400">({p.layers.length})</span>
        <button
          type="button"
          onClick={p.onClose}
          title="Close the Structure window (Ctrl+I opens it again)"
          aria-label="Close the Structure window"
          className="ml-auto rounded p-0.5 text-slate-500 hover:bg-slate-200"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="p-3 text-[11px] text-slate-500">
            Nothing on the design yet. Add something from the pane on the left.
          </div>
        ) : rows.map((layer) => {
          const selected = p.selectedIds.includes(layer.id);
          const { label, Icon } = describeLayer(layer);
          const groupNo = layer.groupId ? numbers.get(layer.groupId) : undefined;
          const visible = layer.visible !== false;
          const locked = layer.locked === true;
          return (
            <div
              key={layer.id}
              draggable
              data-structure-row={layer.id}
              onDragStart={() => setDragId(layer.id)}
              onDragEnd={() => { setDragId(null); setOverId(null); }}
              onDragOver={(e) => { e.preventDefault(); if (overId !== layer.id) setOverId(layer.id); }}
              onDrop={(e) => {
                e.preventDefault();
                if (!dragId || dragId === layer.id) return;
                // The list is drawn top-down and stored bottom-up, so the index
                // a person dropped ON is the array index of the row they aimed
                // at — translate once, here, and nowhere else.
                const toIndex = p.layers.findIndex((l) => l.id === layer.id);
                if (toIndex >= 0) p.onMove(dragId, toIndex);
                setDragId(null);
                setOverId(null);
              }}
              onClick={(e) => p.onSelect(layer.id, e.shiftKey ? "range" : (e.ctrlKey || e.metaKey) ? "additive" : "replace")}
              title={`${label}${groupNo ? ` — in Group ${groupNo}` : ""}. Click to select, Shift-click for a range, Ctrl-click to add. Drag to restack.`}
              className={"group flex cursor-pointer items-center gap-1.5 border-b border-slate-100 px-2 py-1.5 " +
                (selected ? "bg-yellow-50" : "hover:bg-slate-50") +
                (overId === layer.id && dragId && dragId !== layer.id ? " border-t-2 border-t-[#EF6C33]" : "")}
            >
              <GripVertical className="h-3 w-3 shrink-0 text-slate-300 group-hover:text-slate-500" />
              <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              <span className="min-w-0 flex-1 truncate text-[11px]">{label}</span>
              {groupNo && (
                <span title={`This is part of Group ${groupNo} — selecting it selects the whole group`}
                  className="shrink-0 rounded bg-slate-100 px-1 text-[9px] font-bold text-slate-500">G{groupNo}</span>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); p.onToggleLock(layer.id); }}
                title={locked ? "Unlock — let it be moved again" : "Lock — stop it being moved by accident"}
                aria-label={locked ? "Unlock this layer" : "Lock this layer"}
                className={"shrink-0 rounded p-0.5 hover:bg-slate-200 " + (locked ? "text-amber-600" : "invisible text-slate-400 group-hover:visible")}
              >
                {locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); p.onToggleVisibility(layer.id); }}
                title={visible ? "Hide this for now" : "Show this again"}
                aria-label={visible ? "Hide this layer" : "Show this layer"}
                className="shrink-0 rounded p-0.5 hover:bg-slate-200"
              >
                {visible ? <Eye className="h-3 w-3 text-slate-500" /> : <EyeOff className="h-3 w-3 text-slate-400" />}
              </button>
            </div>
          );
        })}
      </div>

      <div className="rounded-b-lg border-t border-slate-200 bg-slate-50 px-2.5 py-1 text-[9px] text-slate-500">
        Drag a row to restack · Shift-click for a range · Ctrl-click to add
      </div>
    </div>
  );
}

export default StructureWindow;
