/**
 * builder/insertPosition.ts — WHERE A NEW WIDGET LANDS.
 *
 * D-11 (BUILDER_USER_TEST_2026-09-16): *"A widget added with nothing selected
 * goes to the end of the document, off screen, with no scroll-to … in the email
 * builder that means below the unsubscribe footer."* Click "Pricing table" and,
 * as far as the eye can tell, nothing happened.
 *
 * ── THE RULE, IN ONE PLACE ────────────────────────────────────────────────
 *   0. a CONTAINER is selected → INSIDE it, at the end (the reference editor's
 *      rule: select a container, press a widget in the panel, it goes in)
 *   1. a WIDGET is selected  → insert directly AFTER it, IN ITS OWN BOX
 *   2. a SECTION is selected → append into that section's first column
 *   3. nothing selected      → the section the author is LOOKING AT
 *   4. no sections at all    → null; the caller makes one
 *
 * Rule 1 is the one §11.12 changed, and it changed by REMOVING a special case
 * rather than adding one: "its own column" became "its own box", and a column
 * IS a box. So a card selected inside a row inside a section gets the next card
 * beside it, where the author is looking — and the old behaviour, at the top
 * level, is the same sentence with the box being the column.
 *
 * Rule 3 is the one that was missing, and it is the reason this is a module
 * rather than three lines in the shell: "what am I looking at" is arithmetic
 * over rectangles, and arithmetic over rectangles is a `node --test` file
 * rather than something you have to drag a scrollbar to check.
 *
 * Pure: no React, no DOM. The canvas measures; this decides.
 */
import type { BuilderDocument, Selection } from "./model";
import { findNode, hostChildren, isContainer, nodeIdAt } from "./treeOps";

/**
 * WHERE AN INSERT GOES: a box, and an index in it.
 *
 * `hostId` is THE address — a column's id, or a container's, at any depth. The
 * section and the column index ride along because five adapter files, the
 * revision diff and the flash-and-scroll all still speak in sections; they are
 * derived from the host, never typed by hand, so they cannot disagree with it.
 */
export interface InsertSpot {
  /** The column or box the thing lands in. */
  hostId: string;
  sectionId: string;
  columnIndex: number;
  index: number;
}

/** A section's box on screen, as the canvas measured it. */
export interface SectionBox {
  id: string;
  /** Distance from the top of the scrolling canvas, in px. */
  top: number;
  bottom: number;
}

/**
 * The section the author is looking at.
 *
 * The one whose box covers the middle of what is on screen; failing that, the
 * nearest one by distance from that middle. NEVER null when there is at least
 * one section — "I could not tell" and "put it at the end" are the same
 * outcome for the author, and the end is exactly where D-11 put things.
 */
export function sectionAtViewport(
  boxes: SectionBox[],
  viewport: { top: number; height: number },
): string | null {
  if (!boxes.length) return null;
  const middle = viewport.top + viewport.height / 2;
  const covering = boxes.find((b) => middle >= b.top && middle < b.bottom);
  if (covering) return covering.id;
  const distance = (b: SectionBox) =>
    middle < b.top ? b.top - middle : middle - b.bottom;
  return boxes.reduce((best, b) => (distance(b) < distance(best) ? b : best), boxes[0]).id;
}

/**
 * THE insert position. See the header for the four rules.
 *
 * `visibleSectionId` is rule 3's answer from the canvas; an unknown id is
 * ignored rather than trusted, because a stale measurement must not put a
 * widget in a section that has since been deleted.
 */
export function insertSpotFor(
  doc: BuilderDocument,
  selection: Selection,
  visibleSectionId?: string | null,
): InsertSpot | null {
  if (!doc.sections.length) return null;

  if (selection?.kind === "widget") {
    const id = nodeIdAt(doc, selection);
    const hit = id ? findNode(doc, id) : null;
    if (hit && isContainer(hit.node)) {
      return {
        hostId: hit.node.id,
        sectionId: hit.sectionId,
        columnIndex: hit.columnIndex,
        index: hit.node.children.length,
      };
    }
    if (hit) {
      const siblings = hostChildren(doc, hit.parentId) ?? [];
      // AFTER the selected thing, among its OWN siblings — which is inside the
      // box when it is in one. `Math.min` because a selection can outlive what
      // it pointed at (undo, or a delete from the outline), and an index past
      // the end would silently become "the end of the document" again, the very
      // thing this module exists to stop.
      return {
        hostId: hit.parentId,
        sectionId: hit.sectionId,
        columnIndex: hit.columnIndex,
        index: Math.min(hit.index + 1, siblings.length),
      };
    }
    // THE SELECTION OUTLIVED WHAT IT POINTED AT — an undo, a delete from the
    // outline, or a legacy path naming a column that is now empty. The COLUMN
    // it named is still a real place, and it is the place the author was
    // looking at, so the insert stays there rather than jumping to the first
    // column of the section. Without this, choosing something with an empty
    // second column selected put it in the FIRST column, which is D-11 in
    // miniature: it landed somewhere nobody pointed at.
    const column = doc.sections.find((s) => s.id === selection.sectionId)?.columns[selection.columnIndex];
    if (column) {
      return {
        hostId: column.id,
        sectionId: selection.sectionId,
        columnIndex: selection.columnIndex,
        index: Math.min(selection.widgetIndex + 1, column.widgets.length),
      };
    }
  }

  const chosenId = selection?.sectionId
    ?? (visibleSectionId && doc.sections.some((s) => s.id === visibleSectionId) ? visibleSectionId : null)
    ?? doc.sections[doc.sections.length - 1].id;
  const section = doc.sections.find((s) => s.id === chosenId) ?? doc.sections[doc.sections.length - 1];
  const column = section.columns[0];
  return {
    hostId: column?.id ?? section.id,
    sectionId: section.id,
    columnIndex: 0,
    index: column?.widgets.length ?? 0,
  };
}

/**
 * What is selected the moment the thing lands. Selected, so it can be typed into.
 *
 * `id` is passed in because the caller has just MINTED the node and therefore
 * knows it; a selection carrying it reaches the inspector whatever depth the
 * thing landed at, where three indices would only reach the top of a column.
 */
export function selectionAt(spot: InsertSpot, id?: string): Selection {
  return {
    kind: "widget",
    sectionId: spot.sectionId,
    columnIndex: spot.columnIndex,
    widgetIndex: spot.index,
    ...(id ? { id } : {}),
  };
}

/** The column or box a section's first slot is, for a caller with only an id. */
export function firstSpotIn(doc: BuilderDocument, sectionId: string): InsertSpot | null {
  const section = doc.sections.find((s) => s.id === sectionId);
  const column = section?.columns[0];
  if (!section || !column) return null;
  return { hostId: column.id, sectionId, columnIndex: 0, index: column.widgets.length };
}

/**
 * How long the new widget glows, in milliseconds.
 *
 * Long enough to catch the eye after a smooth scroll, short enough that it is
 * not still glowing when the author starts typing into it.
 */
export const FLASH_MS = 2000;

/* A BOX'S OWN "+" IS GONE (2026-09-19). `boxPlusPlacement`, `BOX_PLUS_SIZE`
   and `BOX_PLUS_STEP` placed a "+" on the corner of every box that already had
   something in it (V-3). The reference editor has no such button: an EMPTY
   container shows a "+" in its middle, drawn by the canvas (`bxc-addhere`), and
   a full one is added to by dragging from the left panel or by selecting it and
   pressing a tile. Nothing needs a placement rule, so there is not one. */
