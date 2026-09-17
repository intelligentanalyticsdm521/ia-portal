/**
 * builder/navigatorModel.ts — the outline of the page, as a list.
 *
 * D-12 and §9 of BUILDER_USER_TEST_2026-09-16. A twelve-section agreement is
 * four screens of scrolling, and the only way to reach section 9 was to find
 * it with your eyes. The outline is the other way in: every section, every
 * widget under it, click to select, drag to reorder, an eye to hide it on a
 * device.
 *
 * ── PURE, SO THE TREE IS A TEST ───────────────────────────────────────────
 * The component draws rows; this decides what the rows ARE and what each one
 * is called. Naming is the part that goes wrong — a paragraph called
 * "Paragraph" eleven times down the list is not an outline — so the label
 * rule lives here with a test on it.
 */
import type { BuilderDocument, Section, Widget, WidgetPath } from "./model";
import { WIDGETS_BY_KIND } from "./registry";

export type OutlineRow =
  | {
    kind: "section";
    id: string;
    label: string;
    /** Its position in the document, for the drag and for "3 of 12". */
    index: number;
    hiddenOn: { desktop: boolean; tablet: boolean; phone: boolean };
    /** A section holding a part the law puts there cannot be moved out or removed. */
    required: boolean;
  }
  | {
    kind: "widget";
    id: string;
    label: string;
    path: WidgetPath;
    hiddenOn: { desktop: boolean; tablet: boolean; phone: boolean };
    locked: boolean;
  };

/** The words a row shows. Never the kind alone — see the header. */
export function rowLabel(w: Widget): string {
  const def = WIDGETS_BY_KIND[w.kind];
  const name = def?.label || w.kind;
  const words = firstWords(w.props);
  return words ? `${name} · ${words}` : name;
}

/**
 * The first few words the widget actually says.
 *
 * Reads the props a renderer would put at the top — a heading's text, a
 * paragraph's first line, a card's name — and stops at forty characters.
 * Merge tokens are left as they are, because `{{customer.name}}` in the
 * outline is honest: that row has not been filled in yet.
 */
export function firstWords(props: Record<string, unknown> | undefined): string {
  const p: any = props || {};
  for (const key of ["text", "title", "heading", "name", "label", "body", "caption"]) {
    const v = p[key];
    if (typeof v === "string" && v.trim()) return clip(v);
  }
  for (const key of ["rows", "items", "cards", "panels"]) {
    const arr = p[key];
    if (Array.isArray(arr) && arr.length) {
      const first: any = arr[0];
      if (typeof first === "string" && first.trim()) return clip(first);
      if (first && typeof first === "object") {
        for (const k of ["name", "title", "label", "text"]) {
          if (typeof first[k] === "string" && first[k].trim()) return clip(first[k]);
        }
      }
    }
  }
  return "";
}

function clip(s: string): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > 40 ? `${one.slice(0, 39)}…` : one;
}

/**
 * Which devices this thing is hidden on.
 *
 * `desktop` is the BASE layer, which the styling pass's cascade hands down to
 * the other two — so something hidden on desktop is hidden everywhere, and the
 * eye says so rather than pretending each device is independent.
 */
export function hiddenOf(
  style: { hidden?: boolean; tablet?: { hidden?: boolean }; phone?: { hidden?: boolean } } | undefined,
): { desktop: boolean; tablet: boolean; phone: boolean } {
  const base = !!style?.hidden;
  return { desktop: base, tablet: base || !!style?.tablet?.hidden, phone: base || !!style?.phone?.hidden };
}

/** Does this section hold a part the author may not remove? */
export function sectionRequired(s: Section): boolean {
  return s.columns.some((c) => c.widgets.some((w) => w.locked));
}

/**
 * The whole outline, in reading order: each section followed by its widgets.
 *
 * Flat rather than nested, because the component draws a list and a nested
 * structure would only be flattened again at the point of drawing — and a
 * flat list is what a drag reorders.
 */
export function outline(doc: BuilderDocument): OutlineRow[] {
  const rows: OutlineRow[] = [];
  doc.sections.forEach((s, index) => {
    rows.push({
      kind: "section",
      id: s.id,
      label: s.label || `Section ${index + 1}`,
      index,
      hiddenOn: hiddenOf(s.style),
      required: sectionRequired(s),
    });
    s.columns.forEach((col, columnIndex) => {
      col.widgets.forEach((w, widgetIndex) => {
        rows.push({
          kind: "widget",
          id: w.id,
          label: rowLabel(w),
          path: { sectionId: s.id, columnIndex, widgetIndex },
          hiddenOn: hiddenOf(w.style),
          locked: !!w.locked,
        });
      });
    });
  });
  return rows;
}

/** Just the sections, which is what a section drag reorders. */
export function sectionRows(doc: BuilderDocument): Extract<OutlineRow, { kind: "section" }>[] {
  return outline(doc).filter((r): r is Extract<OutlineRow, { kind: "section" }> => r.kind === "section");
}

/**
 * Where a drag over the outline would drop.
 *
 * The index in the SECTION list, not in the flat row list: dropping "below the
 * fourth widget of section 2" means "after section 2", and computing that at
 * the point of drawing is how a list ends up reordering to somewhere nobody
 * pointed at.
 */
export function sectionDropIndex(rows: OutlineRow[], overRowIndex: number): number {
  let sections = -1;
  for (let i = 0; i <= Math.min(overRowIndex, rows.length - 1); i++) {
    if (rows[i].kind === "section") sections += 1;
  }
  return Math.max(0, sections);
}
