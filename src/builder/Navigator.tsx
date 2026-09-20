/**
 * builder/Navigator.tsx — the STRUCTURE of the page, and the window it floats in.
 *
 * D-12 and §9 of BUILDER_USER_TEST_2026-09-16: twelve sections is four screens
 * of scrolling and the only way to reach section nine was to find it with your
 * eyes. Every section, every widget under it, click to select, drag to move,
 * and an eye to take something off a phone.
 *
 * ── IT LEFT THE LEFT PANEL (§11.13.1, D-165) ──────────────────────────────
 * Brandon, 2026-09-19: the left panel is the widgets panel and nothing else.
 * The real editor, looked at the same day, floats this: a small window titled
 * "Structure", opened from a top-bar button, draggable by its title bar and
 * closable with an ×. So the tree is now `StructureWindow` — the same rows in
 * a window instead of a tab. One component, two callers would have been two
 * outlines; there is one, and the tab it used to live in is deleted.
 *
 * ── IT OWNS NO RULES ──────────────────────────────────────────────────────
 * The rows and their names are `navigatorModel.ts`; moving a section is
 * `model.moveSection` through the shell's own handler; hiding uses the styling
 * pass's `hidden` flag through `withLayer`. This file draws a list — every
 * behaviour it offers already existed somewhere and is reached, not copied.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, ChevronsDownUp, Eye, EyeOff, Sparkles, X } from "lucide-react";
import * as Icons from "lucide-react";
import type { BuilderDocument, Selection, WidgetPath } from "./model";
import { dropTargetFor, outline, sectionDropIndex, type OutlineDrop, type OutlineRow } from "./navigatorModel";

/** A lucide icon by NAME, so `navigatorModel` stays pure and importable. */
function RowIcon({ name }: { name: string }) {
  const map = Icons as unknown as Record<string, React.ComponentType<{ size?: number }>>;
  const Cmp = map[name] || Icons.Square;
  return <Cmp size={12} />;
}
import type { Device } from "./style";

export interface NavigatorProps {
  doc: BuilderDocument;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onMoveSection: (sectionId: string, toIndex: number) => void;
  /**
   * MOVE ANYTHING ELSE, BETWEEN LEVELS (§11.12).
   *
   * A widget or a box, by id, into a box by id. The outline is the surface
   * where a move between levels is EASY — the nesting is on screen and the
   * target is a row rather than a few pixels of gap — so it has to be able to
   * do it, or the only way out of a deep box is to drag on the canvas.
   */
  onMoveNode?: (nodeId: string, to: OutlineDrop | null) => void;
  /** The device the canvas is previewing — the one the eye hides on. */
  device: Device;
  onHideSection: (sectionId: string, hidden: boolean) => void;
  onHideWidget: (path: WidgetPath, hidden: boolean) => void;
  /**
   * LOCK, FROM THE OUTLINE (M-21).
   *
   * The padlock was a read-only marker on a widget the LAW locked, so nothing
   * an author locked themselves could be unlocked and nothing else could be
   * locked at all. It is a button now, and it shows the state either way.
   */
  onLockSection?: (sectionId: string, locked: boolean) => void;
  onLockWidget?: (path: WidgetPath, locked: boolean) => void;
  /** Is this section locked? (Every widget in it is.) */
  isSectionLocked?: (sectionId: string) => boolean;
  /** The ⋯ — the SAME menu as right-clicking it on the page (M-8). */
  onRowMenu?: (
    target: { kind: "section"; sectionId: string } | { kind: "widget"; path: WidgetPath },
    at: { x: number; y: number },
  ) => void;
  /**
   * RENAME A ROW (D-172, round 2). Double-clicking a row's name in the
   * reference makes it editable; this is what the new name is written with.
   * Optional — a window with no rename simply does not offer one.
   */
  onRename?: (row: OutlineRow, name: string) => void;
  /**
   * ASK ARGUS, from the Structure window's title bar (D-172, round 2).
   *
   * The reference's navigator has a SECOND title-bar icon beside collapse-all,
   * `#elementor-navigator__ai-titles` — driven 2026-09-19. Ask ARGUS is our
   * counterpart of Elementor AI (agreed difference (e)), so it goes there.
   */
  onAskArgus?: () => void;
  /** What the thing being built is called, from the adapter's copy. */
  heading?: string;
  /** Bumped by the window's collapse-all button. Every bump shuts every row. */
  collapseAll?: number;
}

const DEVICE_WORD: Record<Device, string> = {
  desktop: "everywhere",
  tablet: "on a tablet",
  phone: "on a phone",
};

export function Navigator(p: NavigatorProps) {
  const rows = useMemo(() => outline(p.doc), [p.doc]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const bump = p.collapseAll ?? 0;
  useEffect(() => {
    if (!bump) return;
    setCollapsed(Object.fromEntries(rows.map((r) => [r.id, true])));
  }, [bump]);
  const [dragId, setDragId] = useState<string | null>(null);
  /**
   * WHICH ROW THE POINTER IS ON (D-172).
   *
   * The reference shows a row's eye on hover; ours drew one on every row all
   * the time, beside a padlock and a "...", which is three icons of noise per
   * row. State rather than CSS because the rows are inline-styled and a
   * stylesheet for one rule is a second place to look.
   */
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  /** The row being renamed, if any — see the double-click handler below. */
  const [renaming, setRenaming] = useState<string | null>(null);

  /* THE ID THE SELECTION CARRIES, when it carries one (§11.12). The index
     lookup underneath only ever reaches the top of a column, so a card three
     boxes deep — or a carrier's container, selected by id — was never marked
     in the tree. `path.id` is the address the engine hands out; it wins. */
  const selectedWidgetId = p.selection?.kind === "widget"
    ? p.selection.id
      ?? p.doc.sections.find((s) => s.id === p.selection!.sectionId)
        ?.columns[p.selection.columnIndex]?.widgets[p.selection.widgetIndex]?.id ?? null
    : null;

  /** A widget row is drawn only when its section is open. */
  function visible(row: OutlineRow, i: number): boolean {
    if (row.kind === "section") return true;
    for (let j = i - 1; j >= 0; j--) {
      const r = rows[j];
      if (r.kind === "section") return !collapsed[r.id];
    }
    return true;
  }

  if (!rows.length) {
    return (
      <div style={{ padding: 16, fontSize: 12, color: "#5A7A8A", lineHeight: 1.5 }}>
        Nothing on the page yet. Add something with a <strong>+</strong> and it shows up here.
      </div>
    );
  }

  return (
    <div data-builder-navigator style={{ padding: "10px 8px", fontSize: 12 }}>
      {/* THE THREE LINES OF INSTRUCTIONS WERE HERE AND ARE DELETED (D-172).
          The reference's window is its title bar and then the rows. */}

      {rows.map((row, i) => {
        if (!visible(row, i)) return null;
        const isSection = row.kind === "section";
        /* A CARRIER ROW IS ITS CONTAINER (D-172, round 2). The row stands for
           the container the section carries, so it lights up when that
           container is selected — which is what selecting it does, and what
           clicking the same box on the page does. */
        const carriedId = isSection
          ? (row as Extract<OutlineRow, { kind: "section" }>).containerId
          : undefined;
        const selected = isSection
          ? (carriedId
            ? carriedId === selectedWidgetId
            : p.selection?.kind === "section" && p.selection.sectionId === row.id)
          : row.id === selectedWidgetId;
        const hidden = row.hiddenOn[p.device];

        return (
          <div
            key={`${row.kind}:${row.id}`}
            data-nav-row={row.kind}
            data-nav-id={row.id}
            draggable
            onMouseEnter={() => setHoverId(row.id)}
            onMouseLeave={() => setHoverId((x) => (x === row.id ? null : x))}
            onDragStart={() => setDragId(row.id)}
            onDragEnd={() => { setDragId(null); setOverIndex(null); }}
            onDragOver={(e) => { if (!dragId) return; e.preventDefault(); setOverIndex(i); }}
            onDrop={(e) => {
              if (!dragId) return;
              e.preventDefault();
              /* SECTIONS REORDER, EVERYTHING ELSE MOVES IN THE TREE (§11.12).
                 Which of the two it is comes from the payload — what was picked
                 up — and never from what it was dropped on, because the same
                 gesture meaning two things depending on where it ends is how a
                 drag becomes a thing nobody trusts. */
              const from = rows.find((r) => r.id === dragId);
              if (from?.kind === "section") p.onMoveSection(dragId, sectionDropIndex(rows, i));
              else if (from) p.onMoveNode?.(dragId, dropTargetFor(rows, i));
              setDragId(null); setOverIndex(null);
            }}
            /* RIGHT-CLICK INSIDE THE WINDOW (D-172, round 2) — the reference
               opens that element's own menu here, the same one the page gives.
               Ours opened the browser's. `onRowMenu` was already wired from
               the shell and had no caller since the per-row "..." was deleted;
               this is the caller, so there is one menu with one set of rows. */
            onContextMenu={(e) => {
              if (!p.onRowMenu) return;
              e.preventDefault();
              e.stopPropagation();
              const target = isSection && !carriedId
                ? { kind: "section" as const, sectionId: row.id }
                : isSection
                  ? { kind: "widget" as const, path: { sectionId: row.id, columnIndex: 0, widgetIndex: 0, id: carriedId! } }
                  : { kind: "widget" as const, path: (row as Extract<OutlineRow, { kind: "widget" }>).path };
              p.onRowMenu(target, { x: e.clientX, y: e.clientY });
            }}
            onClick={() => p.onSelect(isSection
              ? (carriedId
                ? { kind: "widget", sectionId: row.id, columnIndex: 0, widgetIndex: 0, id: carriedId }
                : { kind: "section", sectionId: row.id })
              : { kind: "widget", ...(row as Extract<OutlineRow, { kind: "widget" }>).path })}
            /* NO TITLE ATTRIBUTE ON A ROW (D-172, round 2). Driven in the
               reference on 2026-09-19: every `.elementor-navigator__element`
               reports `hasTitleAttr: false`. Ours put "Jump to this section" /
               "Jump to this and edit it" on every row of the window, so a
               slow read down a twelve-row tree was twelve tooltips telling you
               what clicking a row in a tree does. */
            style={{
              display: "flex", alignItems: "center", gap: 4, cursor: "pointer",
              /* THE NESTING, SHOWN (§11.12). One step of indent per level, from
                 the row's own `depth` — the outline's whole job is to say what
                 is inside what, and a flat list of a document with boxes in it
                 is a list that lies. */
              padding: isSection
                ? "5px 4px"
                : `3px 4px 3px ${22 + 14 * ((row as Extract<OutlineRow, { kind: "widget" }>).depth || 0)}px`,
              borderRadius: 4, marginBottom: 1,
              borderTop: overIndex === i && dragId ? "2px solid #2D9CDB" : "2px solid transparent",
              background: selected ? "#E6F2F8" : "transparent",
              fontWeight: isSection ? 600 : 400,
              color: hidden ? "#94A3B8" : "#0B1C24",
            }}
          >
            {/* THE DRAG GRIP IS DELETED (D-172, round 2). The reference draws
                no grip on a navigator row: the ROW is the drag handle, which
                is exactly what `draggable` on the row above already makes it.
                A GripVertical on every section row was a second affordance for
                a gesture that already worked, and one more icon in a window
                whose whole job is to be scannable. */}
            {/* A TRIANGLE ON EVERY ROW THAT HAS CHILDREN (D-172) — the
                reference puts one on containers too, so a container row can be
                collapsed. A row with nothing under it keeps the same width of
                space, or the names jump left and right down the list. */}
            {(isSection || (row as Extract<OutlineRow, { kind: "widget" }>).hasChildren) ? (
              <button type="button" data-nav-toggle={row.id}
                aria-label={collapsed[row.id] ? "Show what is in it" : "Hide what is in it"}
                title={collapsed[row.id] ? "Show what is in it" : "Hide what is in it"}
                onClick={(e) => { e.stopPropagation(); setCollapsed((c) => ({ ...c, [row.id]: !c[row.id] })); }}
                style={{ border: "none", background: "transparent", cursor: "pointer", color: "#64748B", display: "inline-flex", padding: 0 }}>
                {collapsed[row.id] ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
              </button>
            ) : <span style={{ width: 12, flex: "0 0 auto" }} />}
            {/* THE ELEMENT'S TYPE, ON EVERY ROW (D-172, round 2).
                Driven in the reference on 2026-09-19: every row carries one —
                `eicon-container`, `eicon-text`, `eicon-flexbox` — and none of
                them carries a title attribute. Ours drew a generic box glyph
                on CONTAINER rows only, with the sentence "A box. What is under
                it, indented, is what is inside it." hanging off it, so a
                Heading row and a Button row were two identical lines of text
                and the one icon in the window explained itself at length.
                DELETED: the sentence. PRESENT: the widget's own icon, from the
                registry, on every row including the section's. */}
            <span data-nav-icon={row.icon} style={{ color: "#64748B", display: "inline-flex", flex: "0 0 auto" }}>
              <RowIcon name={row.icon} />
            </span>
            {renaming === row.id ? (
              /* RENAME BY DOUBLE-CLICK (D-172, round 2). The reference sets
                 `contenteditable` on the row's own title and focuses it; ours
                 did nothing at all, and the active element stayed BODY. The
                 name is written to the element's own label through the same
                 handler the panel would use, so there is one writer. */
              <input
                data-nav-rename={row.id}
                autoFocus
                defaultValue={row.label}
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => { p.onRename?.(row, e.currentTarget.value.trim()); setRenaming(null); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { p.onRename?.(row, e.currentTarget.value.trim()); setRenaming(null); }
                  if (e.key === "Escape") { e.stopPropagation(); setRenaming(null); }
                }}
                style={{ flex: 1, minWidth: 0, font: "inherit", border: "1px solid #2D9CDB", borderRadius: 3, padding: "0 3px" }}
              />
            ) : (
            <span
              onDoubleClick={(e) => { if (p.onRename) { e.stopPropagation(); setRenaming(row.id); } }}
              style={{
                flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                textDecoration: hidden ? "line-through" : "none",
                fontWeight: !isSection && (row as Extract<OutlineRow, { kind: "widget" }>).container ? 600 : undefined,
              }}>{row.label}</span>
            )}

            {/* THE PER-ROW PADLOCK IS DELETED (D-172). There is no lock
                control in the reference's tree. A part the LAW locks is still
                refused by the model and still says why in the menu; what went
                is the author's own switch, on every row, all the time. */}

            {(hoverId === row.id || hidden) ? (
            <button
                type="button"
                aria-label={hidden ? `Show it ${DEVICE_WORD[p.device]}` : `Hide it ${DEVICE_WORD[p.device]}`}
                title={hidden
                  ? `Show this again ${DEVICE_WORD[p.device]}`
                  : `Hide this ${DEVICE_WORD[p.device]}. It stays in the document — it just is not shown.`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (row.kind === "section") p.onHideSection(row.id, !hidden);
                  else p.onHideWidget(row.path, !hidden);
                }}
                style={{ border: "none", background: "transparent", cursor: "pointer", color: hidden ? "#B45309" : "#CBD5E1", display: "inline-flex", padding: 0 }}
              >
                {hidden ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            ) : <span style={{ width: 12, flex: "0 0 auto" }} />}

            {/* THE PER-ROW "..." IS DELETED (D-172). The reference puts no
                menu button on a row: right-click is the one way in, and it is
                the one way in on the page too. */}
          </div>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   The window it floats in (§11.13.1, D-165)
   ══════════════════════════════════════════════════════════════════════════ */

/** Where it opens, measured off the real editor: top right, clear of the panel. */
export const STRUCTURE_SIZE = { width: 260, height: 460 } as const;

/**
 * Keep the window on screen.
 *
 * A drag that ended off the right edge left the title bar — the ONLY thing
 * that can drag it back — unreachable. Pure, so the arithmetic is a test
 * rather than something you find by throwing the window off a monitor.
 */
export function clampToViewport(
  at: { x: number; y: number },
  viewport: { width: number; height: number },
  size: { width: number; height: number } = STRUCTURE_SIZE,
): { x: number; y: number } {
  // 28px of the title bar must stay on screen at the bottom, and 60px of its
  // width at either side, so there is always something to grab.
  const maxX = Math.max(8, viewport.width - 60);
  const maxY = Math.max(8, viewport.height - 28);
  return {
    x: Math.round(Math.min(Math.max(8 - size.width + 60, at.x), maxX)),
    y: Math.round(Math.min(Math.max(8, at.y), maxY)),
  };
}

/** Where it first appears, given the window it is in. */
export function defaultStructureAt(viewport: { width: number; height: number }): { x: number; y: number } {
  return clampToViewport({ x: viewport.width - STRUCTURE_SIZE.width - 28, y: 96 }, viewport);
}

export interface StructureWindowProps extends NavigatorProps {
  onClose: () => void;
}

/** How small the window may be dragged. Below this the rows have no room. */
const STRUCTURE_MIN = { width: 200, height: 220 } as const;

export function StructureWindow({ onClose, ...nav }: StructureWindowProps) {
  const [at, setAt] = useState(() => defaultStructureAt(
    typeof window === "undefined" ? { width: 1440, height: 900 } : { width: window.innerWidth, height: window.innerHeight }));
  /** Where in the title bar the pointer took hold. null = not dragging. */
  const grab = useRef<{ dx: number; dy: number } | null>(null);
  /** THE WINDOW'S OWN SIZE (D-172): the reference's has a resize grip. */
  const [size, setSize] = useState<{ width: number; height: number }>({ ...STRUCTURE_SIZE });
  const resize = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  /** COLLAPSE ALL — the reference's first title-bar icon. */
  const [collapseAll, setCollapseAll] = useState(0);

  const onMove = useCallback((e: PointerEvent) => {
    const r = resize.current;
    if (r) {
      setSize({
        width: Math.max(STRUCTURE_MIN.width, r.w + (e.clientX - r.x)),
        height: Math.max(STRUCTURE_MIN.height, r.h + (e.clientY - r.y)),
      });
      return;
    }
    const g = grab.current;
    if (!g) return;
    setAt(clampToViewport({ x: e.clientX - g.dx, y: e.clientY - g.dy },
      { width: window.innerWidth, height: window.innerHeight }));
  }, []);
  const onUp = useCallback(() => { grab.current = null; resize.current = null; }, []);

  useEffect(() => {
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  }, [onMove, onUp]);

  return (
    <div
      role="dialog"
      aria-label="Structure"
      data-builder-structure="open"
      style={{
        position: "fixed", left: at.x, top: at.y, zIndex: 9400,
        width: size.width, height: size.height,
        display: "flex", flexDirection: "column",
        background: "#FFFFFF", border: "1px solid #CBD5E1", borderRadius: 8,
        boxShadow: "0 18px 48px rgba(11,28,36,0.24)", overflow: "hidden",
      }}
    >
      <div
        data-structure-grip
        onPointerDown={(e) => {
          const r = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
          grab.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
        }}
        style={{
          display: "flex", alignItems: "center", gap: 6, cursor: "grab", userSelect: "none",
          padding: "7px 8px 7px 10px", borderBottom: "1px solid #E2E8F0", background: "#F8FAFC",
        }}
      >
        {/* COLLAPSE ALL — the reference's own first icon, left of the title. */}
        <button
          type="button"
          data-structure-collapse
          onClick={(e) => { e.stopPropagation(); setCollapseAll((n) => n + 1); }}
          aria-label="Collapse all elements"
          title="Collapse all elements"
          style={{ border: "none", background: "transparent", cursor: "pointer", color: "#64748B", display: "inline-flex", padding: 2 }}
        ><ChevronsDownUp size={13} /></button>
        {/* THE SECOND TITLE-BAR ICON (D-172, round 2) — the reference's
            `#elementor-navigator__ai-titles`, which ours is Ask ARGUS. Drawn
            only where a builder hands one in: a button that opens nothing is
            worse than none. */}
        {nav.onAskArgus && (
          <button
            type="button"
            data-structure-argus
            onClick={(e) => { e.stopPropagation(); nav.onAskArgus!(); }}
            aria-label="Ask ARGUS"
            title="Ask ARGUS"
            style={{ border: "none", background: "transparent", cursor: "pointer", color: "#64748B", display: "inline-flex", padding: 2 }}
          ><Sparkles size={13} /></button>
        )}
        {/* CENTRED, as the reference's is. */}
        <strong style={{ flex: 1, textAlign: "center", fontSize: 11.5, fontWeight: 700, color: "#0B1C24" }}>Structure</strong>
        <button
          type="button"
          data-structure-close
          onClick={onClose}
          aria-label="Close Structure"
          title="Close this window (Ctrl+I opens it again)"
          style={{ border: "none", background: "transparent", cursor: "pointer", color: "#64748B", display: "inline-flex", padding: 2 }}
        ><X size={14} /></button>
      </div>
      <div style={{ minHeight: 0, flex: 1, overflowY: "auto" }}>
        <Navigator {...nav} collapseAll={collapseAll} />
      </div>
      {/* THE RESIZE GRIP — the reference's "..." under the footer. */}
      <div
        data-structure-resize
        onPointerDown={(e) => { resize.current = { x: e.clientX, y: e.clientY, w: size.width, h: size.height }; }}
        title="Drag to resize"
        style={{
          flex: "0 0 auto", height: 12, cursor: "nwse-resize", userSelect: "none",
          borderTop: "1px solid #E2E8F0", background: "#F8FAFC",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, lineHeight: 1, color: "#94A3B8",
        }}
      >\u22EF</div>
    </div>
  );
}

export default Navigator;
