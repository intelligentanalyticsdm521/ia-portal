/**
 * builder/WidgetPicker.tsx — ONE picker, opened from every "+".
 *
 * D-11 / D-147. Every gap on the page has a "+" on it; pressing one opens this
 * and whatever is chosen lands THERE. The same component answers the slash
 * command on an empty line, and the empty-page choices.
 *
 * ── WHY IT IS NOT A SECOND WIDGET LIST ────────────────────────────────────
 * The side pane and this picker show the same widgets, grouped the same way,
 * matched by the same search — `widgetTasks.ts` owns all three, and both
 * surfaces call it. What differs is only WHERE the result lands: the pane
 * inserts where the author is (insertPosition.ts), the picker inserts at the
 * "+" that opened it. One vocabulary, two doors.
 *
 * ── GROUPS BY TASK, NOT BY TYPE ───────────────────────────────────────────
 * "Information" and "Trust" are categories a developer wrote down. "Customer &
 * property" and "Products & services" are the two sentences Brandon actually
 * said. See widgetTasks.ts.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { BuilderAdapter, WidgetDef } from "./registry";
import { widgetTooltip } from "./registry";
import { groupByTask, flatMatches, TASK_GROUPS, type WidgetTask } from "./widgetTasks";

export interface WidgetPickerProps {
  adapter: BuilderAdapter;
  /** Chosen. `count` is the answer to the widget's own guided question. */
  onPick: (widget: WidgetDef, count?: number) => void;
  onClose: () => void;
  /** Where the "+" was, in viewport coordinates. Absent → centred. */
  anchor?: { top: number; left: number; width?: number } | null;
  /**
   * The search box's text, when somebody else owns it.
   *
   * The slash command types into the PAGE and the picker follows along, so in
   * that mode the query is controlled from outside and the picker's own input
   * is hidden — two search boxes for one search is how they disagree.
   */
  query?: string;
  /** Opened from an empty-page choice: start on one group. */
  task?: WidgetTask | null;
  /** Rendered along the bottom — "Blank section", "Ready-made section…". */
  footer?: React.ReactNode;
  /** The heading, in the adapter's words. */
  heading?: string;
}

/**
 * Enter picks this.
 *
 * Exported so the slash command and the picker agree on what "the first match"
 * means without either of them re-deriving it.
 */
export function topMatch(adapter: BuilderAdapter, query: string): WidgetDef | null {
  return flatMatches(adapter, query)[0] ?? null;
}

export function WidgetPicker(p: WidgetPickerProps) {
  const controlled = p.query !== undefined;
  const [own, setOwn] = useState("");
  const [task, setTask] = useState<WidgetTask | "All">(p.task ?? "All");
  const [asking, setAsking] = useState<{ kind: string; value: number } | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const query = controlled ? (p.query as string) : own;

  // The search box takes the caret the moment it opens: the author pressed
  // "+" because they know what they want, and making them click again is the
  // interaction this replaces.
  useEffect(() => { if (!controlled) searchRef.current?.focus(); }, [controlled]);

  // A click anywhere else closes it. Capture phase, so a click on the canvas
  // closes the picker instead of also selecting whatever was under it.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) p.onClose();
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups = useMemo(() => groupByTask(p.adapter, query), [p.adapter, query]);
  const shown = useMemo(
    () => (task === "All" ? groups : groups.filter((g) => g.task === task)),
    [groups, task]);
  const total = useMemo(() => shown.reduce((n, g) => n + g.widgets.length, 0), [shown]);
  const offered = useMemo(() => new Set(groups.map((g) => g.task)), [groups]);

  function choose(w: WidgetDef) {
    if (w.count) { setAsking({ kind: w.kind, value: w.count.default }); return; }
    p.onPick(w);
  }

  const style: React.CSSProperties = p.anchor
    ? { position: "fixed", top: Math.max(12, Math.min(p.anchor.top, window.innerHeight - 460)), left: Math.max(12, Math.min(p.anchor.left, window.innerWidth - 420)) }
    : { position: "fixed", top: "12vh", left: "50%", transform: "translateX(-50%)" };

  return (
    <div
      ref={boxRef}
      data-builder-picker={p.adapter}
      role="dialog"
      aria-label={p.heading || "Add to the page"}
      style={{
        ...style, zIndex: 9200, width: 400, maxWidth: "calc(100vw - 24px)", maxHeight: "min(72vh, 520px)",
        display: "flex", flexDirection: "column", background: "#FFFFFF", border: "1px solid #CBD5E1",
        borderRadius: 10, boxShadow: "0 18px 48px rgba(11,28,36,0.22)", overflow: "hidden",
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") { e.stopPropagation(); p.onClose(); return; }
        if (e.key === "Enter" && !asking) {
          const first = topMatch(p.adapter, query);
          if (first) { e.preventDefault(); e.stopPropagation(); choose(first); }
        }
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid #E2E8F0" }}>
        <strong style={{ fontSize: 12, color: "#0B1C24" }}>{p.heading || "What goes here?"}</strong>
        <button type="button" onClick={p.onClose} title="Close without adding anything" aria-label="Close"
          style={{ marginLeft: "auto", border: "none", background: "transparent", cursor: "pointer", color: "#64748B" }}>
          <X size={15} />
        </button>
      </div>

      {!controlled && (
        <label style={{ display: "flex", alignItems: "center", gap: 6, margin: "10px 12px 0", border: "1px solid #CBD5E1", borderRadius: 6, padding: "7px 9px" }}>
          <Search size={14} color="#94A3B8" />
          <input
            ref={searchRef}
            value={own}
            onChange={(e) => setOwn(e.target.value)}
            placeholder="Search — try “property”, “price”, “photo”"
            aria-label="Search what you can add"
            style={{ border: "none", outline: "none", fontSize: 12, flex: 1, minWidth: 0 }}
          />
        </label>
      )}
      {controlled && (
        <div style={{ margin: "10px 12px 0", fontSize: 11, color: "#5A7A8A" }}>
          Keep typing to narrow this down, then press Enter.{query ? ` Looking for “${query}”.` : ""}
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "8px 12px 0" }}>
        {(["All", ...TASK_GROUPS.filter((t) => offered.has(t))] as Array<WidgetTask | "All">).map((t) => (
          <button key={t} type="button" onClick={() => setTask(t)} title={t === "All" ? "Show everything" : `Show ${t.toLowerCase()}`}
            style={{
              fontSize: 10, fontWeight: 600, borderRadius: 999, padding: "3px 9px", cursor: "pointer",
              border: `1px solid ${task === t ? "#0B1C24" : "#CBD5E1"}`,
              background: task === t ? "#0B1C24" : "transparent", color: task === t ? "#fff" : "#334155",
            }}>{t}</button>
        ))}
      </div>

      <div style={{ minHeight: 0, flex: 1, overflowY: "auto", padding: 12 }}>
        {total === 0 && (
          <div style={{ border: "1px dashed #CBD5E1", borderRadius: 8, padding: 20, textAlign: "center", fontSize: 12, color: "#5A7A8A" }}>
            Nothing here matches “{query}”. Clear it to see everything you can add.
          </div>
        )}
        {shown.map((g) => (
          <div key={g.task} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "#5A7A8A", marginBottom: 6 }}>
              {g.task}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {g.widgets.map((w) => (
                <div key={w.kind}>
                  <button type="button" data-picker-kind={w.kind} title={widgetTooltip(w)} aria-label={widgetTooltip(w)}
                    onClick={() => choose(w)}
                    style={{
                      width: "100%", textAlign: "left", background: "#fff", border: "1px solid #E2E8F0",
                      borderRadius: 8, padding: 8, cursor: "pointer",
                    }}>
                    {/* THE BIG PICTURE — the shape this makes on the page. */}
                    <img src={w.picture} alt="" aria-hidden="true"
                      style={{ display: "block", width: "100%", height: 44, objectFit: "contain", background: "#F2F6F9", borderRadius: 4 }} />
                    <div style={{ fontSize: 12, fontWeight: 600, marginTop: 6, color: "#0B1C24" }}>{w.label}</div>
                    <div style={{ fontSize: 10.5, lineHeight: 1.35, color: "#5A7A8A", marginTop: 2 }}>{w.description}</div>
                  </button>

                  {asking?.kind === w.kind && w.count && (
                    <div style={{ marginTop: 4, border: "1px solid #CBD5E1", borderRadius: 6, background: "#F8FAFC", padding: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#334155" }}>{w.count.label}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                        <input type="number" min={w.count.min} max={w.count.max} value={asking.value}
                          aria-label={w.count.label}
                          onChange={(e) => setAsking({
                            kind: w.kind,
                            value: Math.max(w.count!.min, Math.min(w.count!.max, Number(e.target.value) || w.count!.min)),
                          })}
                          style={{ width: 54, border: "1px solid #CBD5E1", borderRadius: 4, padding: "3px 6px", fontSize: 12 }} />
                        <button type="button" title={`Add ${asking.value}`}
                          onClick={() => { p.onPick(w, asking.value); setAsking(null); }}
                          style={{ marginLeft: "auto", border: "none", background: "#0B1C24", color: "#fff", borderRadius: 4, padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                          Add
                        </button>
                        <button type="button" title="Cancel" onClick={() => setAsking(null)}
                          style={{ border: "1px solid #CBD5E1", background: "#fff", borderRadius: 4, padding: "4px 8px", fontSize: 11, cursor: "pointer" }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {p.footer && (
        <div style={{ borderTop: "1px solid #E2E8F0", padding: "8px 12px", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {p.footer}
        </div>
      )}
    </div>
  );
}

export default WidgetPicker;
