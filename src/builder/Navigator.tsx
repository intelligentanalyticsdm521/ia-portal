/**
 * builder/Navigator.tsx — the outline of the page.
 *
 * D-12 and §9 of BUILDER_USER_TEST_2026-09-16: twelve sections is four screens
 * of scrolling and the only way to reach section nine was to find it with your
 * eyes. This is the second tab of the left pane — every section, every widget
 * under it, click to select, drag a section to move it, and an eye to take
 * something off a phone.
 *
 * ── IT OWNS NO RULES ──────────────────────────────────────────────────────
 * The rows and their names are `navigatorModel.ts`; moving a section is
 * `model.moveSection` through the shell's own handler; hiding uses the styling
 * pass's `hidden` flag through `withLayer`. This file draws a list — every
 * behaviour it offers already existed somewhere and is reached, not copied.
 */
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Eye, EyeOff, GripVertical, Lock } from "lucide-react";
import type { BuilderDocument, Selection, WidgetPath } from "./model";
import { outline, sectionDropIndex, type OutlineRow } from "./navigatorModel";
import type { Device } from "./style";

export interface NavigatorProps {
  doc: BuilderDocument;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onMoveSection: (sectionId: string, toIndex: number) => void;
  /** The device the canvas is previewing — the one the eye hides on. */
  device: Device;
  onHideSection: (sectionId: string, hidden: boolean) => void;
  onHideWidget: (path: WidgetPath, hidden: boolean) => void;
  /** What the thing being built is called, from the adapter's copy. */
  heading?: string;
}

const DEVICE_WORD: Record<Device, string> = {
  desktop: "everywhere",
  tablet: "on a tablet",
  phone: "on a phone",
};

export function Navigator(p: NavigatorProps) {
  const rows = useMemo(() => outline(p.doc), [p.doc]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const selectedWidgetId = p.selection?.kind === "widget"
    ? p.doc.sections.find((s) => s.id === p.selection!.sectionId)
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
      <div style={{ padding: "0 4px 8px", fontSize: 10, color: "#94A3B8", lineHeight: 1.4 }}>
        {p.heading || "Everything on this page, in order."} Click to jump to it. Drag a section to move it.
      </div>

      {rows.map((row, i) => {
        if (!visible(row, i)) return null;
        const isSection = row.kind === "section";
        const selected = isSection
          ? p.selection?.kind === "section" && p.selection.sectionId === row.id
          : row.id === selectedWidgetId;
        const hidden = row.hiddenOn[p.device];

        return (
          <div
            key={`${row.kind}:${row.id}`}
            data-nav-row={row.kind}
            data-nav-id={row.id}
            draggable={isSection}
            onDragStart={isSection ? () => setDragId(row.id) : undefined}
            onDragEnd={isSection ? () => { setDragId(null); setOverIndex(null); } : undefined}
            onDragOver={(e) => { if (!dragId) return; e.preventDefault(); setOverIndex(i); }}
            onDrop={(e) => {
              if (!dragId) return;
              e.preventDefault();
              p.onMoveSection(dragId, sectionDropIndex(rows, i));
              setDragId(null); setOverIndex(null);
            }}
            onClick={() => p.onSelect(isSection
              ? { kind: "section", sectionId: row.id }
              : { kind: "widget", ...(row as Extract<OutlineRow, { kind: "widget" }>).path })}
            title={isSection ? "Jump to this section" : "Jump to this and edit it"}
            style={{
              display: "flex", alignItems: "center", gap: 4, cursor: "pointer",
              padding: isSection ? "5px 4px" : "3px 4px 3px 22px",
              borderRadius: 4, marginBottom: 1,
              borderTop: overIndex === i && dragId ? "2px solid #2D9CDB" : "2px solid transparent",
              background: selected ? "#E6F2F8" : "transparent",
              fontWeight: isSection ? 600 : 400,
              color: hidden ? "#94A3B8" : "#0B1C24",
            }}
          >
            {isSection && (
              <>
                <span title="Drag to move this section" style={{ color: "#94A3B8", cursor: "grab", display: "inline-flex" }}>
                  <GripVertical size={12} />
                </span>
                <button type="button" aria-label={collapsed[row.id] ? "Show what is in it" : "Hide what is in it"}
                  title={collapsed[row.id] ? "Show what is in it" : "Hide what is in it"}
                  onClick={(e) => { e.stopPropagation(); setCollapsed((c) => ({ ...c, [row.id]: !c[row.id] })); }}
                  style={{ border: "none", background: "transparent", cursor: "pointer", color: "#64748B", display: "inline-flex", padding: 0 }}>
                  {collapsed[row.id] ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                </button>
              </>
            )}
            <span style={{
              flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              textDecoration: hidden ? "line-through" : "none",
            }}>{row.label}</span>

            {row.kind === "widget" && row.locked && (
              <span title="This has to stay on the page — you can change the wording, not remove it"
                style={{ color: "#B45309", display: "inline-flex" }}><Lock size={11} /></span>
            )}

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
          </div>
        );
      })}
    </div>
  );
}

export default Navigator;
