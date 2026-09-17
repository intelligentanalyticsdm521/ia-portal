/**
 * builder/insertPosition.ts — WHERE A NEW WIDGET LANDS.
 *
 * D-11 (BUILDER_USER_TEST_2026-09-16): *"A widget added with nothing selected
 * goes to the end of the document, off screen, with no scroll-to … in the email
 * builder that means below the unsubscribe footer."* Click "Pricing table" and,
 * as far as the eye can tell, nothing happened.
 *
 * ── THE RULE, IN ONE PLACE ────────────────────────────────────────────────
 *   1. a WIDGET is selected  → insert directly AFTER it, in its own column
 *   2. a SECTION is selected → append into that section's first column
 *   3. nothing selected      → the section the author is LOOKING AT
 *   4. no sections at all    → null; the caller makes one
 *
 * Rule 3 is the one that was missing, and it is the reason this is a module
 * rather than three lines in the shell: "what am I looking at" is arithmetic
 * over rectangles, and arithmetic over rectangles is a `node --test` file
 * rather than something you have to drag a scrollbar to check.
 *
 * Pure: no React, no DOM. The canvas measures; this decides.
 */
import type { BuilderDocument, Selection } from "./model";

/** Where an insert goes: a section, a column in it, an index in that column. */
export interface InsertSpot {
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
    const section = doc.sections.find((s) => s.id === selection.sectionId);
    const column = section?.columns[selection.columnIndex];
    if (section && column) {
      // AFTER the selected widget. `Math.min` because a selection can outlive
      // the widget it pointed at (undo, or a delete from the outline), and an
      // index past the end would silently become "the end of the document"
      // again — the very thing this module exists to stop.
      const index = Math.min(selection.widgetIndex + 1, column.widgets.length);
      return { sectionId: section.id, columnIndex: selection.columnIndex, index };
    }
  }

  const chosenId = selection?.sectionId
    ?? (visibleSectionId && doc.sections.some((s) => s.id === visibleSectionId) ? visibleSectionId : null)
    ?? doc.sections[doc.sections.length - 1].id;
  const section = doc.sections.find((s) => s.id === chosenId) ?? doc.sections[doc.sections.length - 1];
  return { sectionId: section.id, columnIndex: 0, index: section.columns[0]?.widgets.length ?? 0 };
}

/** What is selected the moment the widget lands. Selected, so it can be typed into. */
export function selectionAt(spot: InsertSpot): Selection {
  return {
    kind: "widget",
    sectionId: spot.sectionId,
    columnIndex: spot.columnIndex,
    widgetIndex: spot.index,
  };
}

/**
 * How long the new widget glows, in milliseconds.
 *
 * Long enough to catch the eye after a smooth scroll, short enough that it is
 * not still glowing when the author starts typing into it.
 */
export const FLASH_MS = 2000;
