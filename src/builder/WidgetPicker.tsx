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
import { widgetDescription, widgetLabel, widgetTooltip } from "./registry";
import type { WidgetLock } from "./tier";
import { groupByTask, flatMatches, TASK_GROUPS, type WidgetTask } from "./widgetTasks";
import { CONTAINER_PRESETS, type ContainerPreset } from "./treeOps";

export interface WidgetPickerProps {
  adapter: BuilderAdapter;
  /** Chosen. */
  onPick: (widget: WidgetDef) => void;
  /**
   * A BOX WAS CHOSEN (§11.12) — "box", "row" or "grid".
   *
   * A separate handler and not a fake `WidgetDef`, because a container is not
   * a widget: it has no registry entry, no adapter decides whether to offer it,
   * and the shell puts it on the page with `makePreset` rather than
   * `buildWidget`. One pretend widget in the list would be one thing every
   * `WIDGETS_BY_KIND` lookup in the Portal had to be told to expect.
   */
  onPickBox?: (preset: ContainerPreset) => void;
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
  /**
   * WIDGETS THIS PLAN CANNOT HAVE — kind → the sentence the client reads.
   *
   * Request R-D1 in the handoff, from the website stream, and this is the
   * door it was missing. The adapter already refuses at `insertWidget`, so
   * nothing can be added; without this the row still looked available and the
   * refusal arrived AFTER the press, which reads as a bug rather than a plan.
   *
   * A locked row stays IN the list, greyed, with the reason as its line —
   * HIDING it would make "not on your plan" indistinguishable from a widget
   * that is missing. Absent means nothing is locked, which is every builder
   * but the website one.
   */
  lockedKinds?: Record<string, WidgetLock>;
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

/**
 * The boxes a search matches. Every word has to match, like the widget search.
 *
 * Kept beside the widgets rather than folded into `widgetTasks.groupByTask`,
 * because that module's whole promise is "every widget an ADAPTER offers
 * appears in exactly one group", and a box is not something an adapter offers.
 * Blurring that would make the test which protects it untrue.
 */
export function boxMatches(query: string): ContainerPreset[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return CONTAINER_PRESETS;
  return CONTAINER_PRESETS.filter((c) => {
    const hay = `${c.label} ${c.description} box container layout`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

export function WidgetPicker(p: WidgetPickerProps) {
  const controlled = p.query !== undefined;
  const [own, setOwn] = useState("");
  const [task, setTask] = useState<WidgetTask | "All">(p.task ?? "All");
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

  /* THE "HOW MANY?" QUESTION IS GONE (D-156, item 4).
     It asked, before the thing was on the page, a question the author could
     not yet answer — and the only reason it existed was that the cards inside a
     composite could not be added or removed afterwards. They can: a card is a
     widget, and it has the same duplicate and delete as everything else. The
     widget arrives with its default rows and the author adds or removes them
     where they can see them. */
  function choose(w: WidgetDef) {
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
        if (e.key === "Enter") {
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
              {/* THE BOXES, AT THE TOP OF LAYOUT (§11.12, D-156).
                  "Drag that into this box" needs a box to exist before anything
                  can go in one, and Layout is where somebody looks for it. They
                  are FIRST in the group because they are the thing the group is
                  now for, and the three columns/sections rows below them are
                  what you reach for afterwards. */}
              {g.task === "Layout" && p.onPickBox && boxMatches(query).map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  data-picker-box={preset.key}
                  title={preset.description}
                  aria-label={`${preset.label} — ${preset.description}`}
                  onClick={() => p.onPickBox!(preset)}
                  style={{
                    width: "100%", textAlign: "left", background: "#fff", border: "1px solid #E2E8F0",
                    borderRadius: 8, padding: 8, cursor: "pointer",
                  }}
                >
                  <div aria-hidden="true" style={{
                    display: "flex", gap: 3, height: 44, background: "#F2F6F9", borderRadius: 4, padding: 6,
                    flexDirection: preset.key === "box" ? "column" : "row",
                  }}>
                    {(preset.key === "box" ? [1, 2] : preset.key === "grid" ? [1, 2, 3] : [1, 2]).map((n) => (
                      <span key={n} style={{ flex: 1, background: "#CBD5E1", borderRadius: 2 }} />
                    ))}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, marginTop: 6, color: "#0B1C24" }}>{preset.label}</div>
                  <div style={{ fontSize: 10.5, lineHeight: 1.35, color: "#5A7A8A", marginTop: 2 }}>{preset.description}</div>
                </button>
              ))}
              {g.widgets.map((w) => {
                // R-D1 — a widget this plan cannot have. It stays in the list,
                // greyed, with the reason as its line, and the press does
                // nothing: a refusal that arrives after the click reads as a
                // bug, and a row that is hidden reads as a missing feature.
                const lock = p.lockedKinds?.[w.kind] ?? null;
                return (
                <div key={w.kind}>
                  <button type="button" data-picker-kind={w.kind}
                    {...(lock ? {
                      "data-picker-locked": lock.sentence, "data-widget-state": lock.reason,
                      "data-widget-tier": lock.tier, disabled: true,
                    } : { "data-widget-state": "offered" })}
                    title={lock?.sentence || widgetTooltip(w, p.adapter)}
                    aria-label={lock?.sentence || widgetTooltip(w, p.adapter)}
                    onClick={() => { if (!lock) choose(w); }}
                    style={{
                      width: "100%", textAlign: "left", background: lock ? "#F8FAFC" : "#fff",
                      border: "1px solid #E2E8F0",
                      borderRadius: 8, padding: 8, cursor: lock ? "not-allowed" : "pointer",
                      opacity: lock ? 0.62 : 1,
                    }}>
                    {/* THE BIG PICTURE — the shape this makes on the page. */}
                    <img src={w.picture} alt="" aria-hidden="true"
                      style={{ display: "block", width: "100%", height: 44, objectFit: "contain", background: "#F2F6F9", borderRadius: 4 }} />
                    <div style={{ fontSize: 12, fontWeight: 600, marginTop: 6, color: "#0B1C24" }}>{widgetLabel(w, p.adapter)}</div>
                    <div style={{ fontSize: 10.5, lineHeight: 1.35, color: "#5A7A8A", marginTop: 2 }}>
                      {lock?.sentence || widgetDescription(w, p.adapter)}
                    </div>
                  </button>

                </div>
                );
              })}
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
