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
import { carrierContainer as carrierOf, isRequired } from "./model";
import type { BuilderDocument, Node, Section, Widget, WidgetPath } from "./model";
import { directionOf, holdsLocked, isContainer, walkNodes } from "./treeOps";
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
    /** Its first column's id — where a drop on the section header lands. */
    hostId: string;
    /**
     * THE CONTAINER THIS ROW REALLY IS (D-172, round 2).
     *
     * Set when the section is a CARRIER PAIR — a section whose one column
     * holds one container and nothing else. The pair is one box on the page,
     * so it is one row here: this row is drawn, the container's own row is
     * not, and everything inside the container comes up a level. Clicking the
     * row selects the CONTAINER, which is what this id is for.
     *
     * Absent on a section that is not a pair, which keeps the rows it always
     * had — old documents are left exactly as they are.
     */
    containerId?: string;
  }
  | {
    kind: "widget";
    id: string;
    label: string;
    path: WidgetPath;
    hiddenOn: { desktop: boolean; tablet: boolean; phone: boolean };
    locked: boolean;
    /** Locked by the LAW rather than by the author — it cannot be unlocked. */
    required: boolean;
    /**
     * HOW FAR IN IT SITS (§11.12): 0 at the top of a column, 1 inside a box,
     * 2 inside a box in a box. The component indents by this and nothing else,
     * so the outline shows the nesting the page actually has rather than a flat
     * list that lies about it.
     */
    depth: number;
    /** True when this row IS a box. Its children are the rows under it. */
    container: boolean;
    /**
     * DOES ANYTHING SIT UNDER IT (D-172)?
     *
     * The reference puts an expand triangle on EVERY row that has children,
     * containers included; ours drew one on section rows only, so a
     * container row could not be collapsed. Carried on the row rather than
     * counted at the point of drawing, because the component draws a flat
     * list and counting children from a flat list is the nesting computed
     * twice.
     */
    hasChildren: boolean;
    /** A box says which way it runs, because that is what it is FOR. */
    direction?: "row" | "column" | "grid";
    /** The box or column it lives in — what a drag in the outline drops into. */
    parentId: string;
  };

/**
 * The words a row shows. Never the kind alone — see the header.
 *
 * A BOX is named for what it does and what is in it: "Row · 3 things", "Box ·
 * empty". There is no registry entry for a container and there should not be
 * one — it is the engine's own node, the same in every builder — so its name is
 * arithmetic over the tree, which is why it lives here with a test on it.
 */
export function rowLabel(w: Node): string {
  /* THE ELEMENT'S NAME, AND NOTHING ELSE (D-172).
     The reference's rows read "Container", "Flexbox", "Heading". Ours read
     "Container · 2 things", "Container · 1 thing", "Heading · ZZ audit
     headi…" — a count and a snippet of the words, which is the row saying
     three things where the reference says one. `firstWords` stays exported
     because a RENAMED row keeps the author's own label and the default has to
     come from somewhere; it is no longer glued onto the name. */
  if (isContainer(w)) {
    return directionOf(w) === "grid" ? "Grid" : "Container";
  }
  const def = WIDGETS_BY_KIND[w.kind];
  return def?.label || w.kind;
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

/** Does this section hold a part the author may not remove, at ANY depth? */
export function sectionRequired(s: Section): boolean {
  return s.columns.some((c) => c.widgets.some(holdsLocked));
}

/**
 * THE WHOLE OUTLINE, in reading order: each section, then everything under it.
 *
 * A FLAT LIST OF ROWS THAT EACH KNOW THEIR DEPTH, rather than a nested
 * structure. The component draws a list and a drag reorders a list, so a tree
 * of arrays would only be flattened again at the point of drawing and the
 * indentation would have to be recomputed from the nesting twice. `depth` is
 * the nesting, carried on the row, and the component indents by it.
 *
 * Every row carries `parentId`, which is what an outline drag needs: dropping
 * between two rows means "into that box, at that index", and the box is the
 * parent of the row you dropped onto.
 */
export function outline(doc: BuilderDocument): OutlineRow[] {
  const rows: OutlineRow[] = [];
  const bySection = new Map<string, OutlineRow[]>();
  /* ONE ROW PER BOX ON THE PAGE (D-172, round 2).
     Driven in the reference on 2026-09-19: a 50-50 structure with a heading in
     one cell and a button in the other is FIVE rows — the parent, two children
     and the two widgets. Ours was SIX, because the Section and the container
     filling it each got one. The carrier's container is the row the section
     row already is, so its own row is dropped and everything under it comes up
     a level. */
  const carriers = new Map<string, string>();
  doc.sections.forEach((s) => {
    const box = carrierOf(s);
    if (box) carriers.set(s.id, box.id);
  });
  walkNodes(doc, (hit) => {
    if (carriers.get(hit.sectionId) === hit.node.id) return;
    const list = bySection.get(hit.sectionId) || [];
    const box = isContainer(hit.node);
    const lifted = carriers.has(hit.sectionId) ? 1 : 0;
    list.push({
      kind: "widget",
      id: hit.node.id,
      label: rowLabel(hit.node),
      path: {
        sectionId: hit.sectionId,
        columnIndex: hit.columnIndex,
        widgetIndex: hit.index,
        id: hit.node.id,
      },
      hiddenOn: hiddenOf(hit.node.style),
      locked: !!(hit.node as Widget).locked,
      required: isRequired(hit.node as Widget),
      depth: Math.max(0, hit.depth - lifted),
      container: box,
      hasChildren: box && (hit.node as { children?: unknown[] }).children!.length > 0,
      ...(box ? { direction: directionOf(hit.node) } : {}),
      parentId: hit.parentId,
    });
    bySection.set(hit.sectionId, list);
  });

  doc.sections.forEach((s, index) => {
    const carried = carriers.get(s.id);
    rows.push({
      kind: "section",
      id: s.id,
      ...(carried ? { containerId: carried } : {}),
      /* "Container", not "Section 1" (D-172) — the reference's tree has one
         kind of box and one word for it. A section the author (or a template)
         HAS named keeps that name, because the reference lets a row be renamed
         and shows the rename; what goes is our own default. */
      /* A CARRIER ROW IS THE CONTAINER IT CARRIES, and the reference calls a
         top-level box a Container whichever way it runs — in its own editor a
         GRID IS A CONTAINER, with the grid-ness set inside the panel. */
      label: s.label || "Container",
      index,
      hiddenOn: hiddenOf(s.style),
      required: sectionRequired(s),
      /* A drop on a carrier's row lands INSIDE its container, never beside it
         in the column — the column is the invisible level this whole change
         exists to take off the screen. */
      hostId: carried || s.columns[0]?.id || s.id,
    });
    rows.push(...(bySection.get(s.id) || []));
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
/**
 * WHERE A DRAG IN THE OUTLINE WOULD PUT SOMETHING (§11.12).
 *
 * The line is drawn on TOP of the row under the pointer, so the answer is
 * "immediately before that row, among ITS OWN siblings" — which is what lets an
 * outline drag move a card out of a row and into the box above it, a level the
 * canvas drag can reach and the old outline could not.
 *
 * A section header means "the very top of that section", because there is no
 * row above its first child to aim at.
 */
export interface OutlineDrop {
  hostId: string;
  index: number;
}

export function dropTargetFor(rows: OutlineRow[], overRowIndex: number): OutlineDrop | null {
  const row = rows[Math.max(0, Math.min(overRowIndex, rows.length - 1))];
  if (!row) return null;
  if (row.kind === "section") return { hostId: row.hostId, index: 0 };
  return { hostId: row.parentId, index: row.path.widgetIndex };
}

export function sectionDropIndex(rows: OutlineRow[], overRowIndex: number): number {
  let sections = -1;
  for (let i = 0; i <= Math.min(overRowIndex, rows.length - 1); i++) {
    if (rows[i].kind === "section") sections += 1;
  }
  return Math.max(0, sections);
}
