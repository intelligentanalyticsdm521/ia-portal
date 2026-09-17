/**
 * builder/history.ts — undo and redo, as a value.
 *
 * Every operation in model.ts returns a NEW document, so the history is just a
 * list of documents with a cursor. No command objects, no inverse operations,
 * no diffing — the simplest thing that can possibly work, and the one that
 * cannot get "undo the undo" wrong.
 *
 * COALESCING: typing a heading letter by letter must not need thirty presses
 * of Ctrl+Z to get back. `push` takes a `mergeKey`; consecutive pushes with the
 * same key replace the top entry instead of stacking (the key is the widget id
 * plus the field being typed into), so one field's typing is one undo step.
 *
 * GENERIC OVER THE VALUE (2026-09-16, §5 step 5). My Brand's Template Studio
 * edits a PIXEL scene, not a section document — but "a list of values with a
 * cursor" is the same mechanism, and SD-010 wants ONE undo control in the
 * shell, not one per adapter. So the type parameter defaults to
 * BuilderDocument and every existing call site is unchanged, while the studio
 * says `History<CanvasDoc>`. The alternative — Fabric's own undo stack beside
 * this one — is the second mechanism this scope exists to delete.
 */
import type { BuilderDocument } from "./model";

export interface History<T = BuilderDocument> {
  past: T[];
  present: T;
  future: T[];
  /** What produced `present`, for coalescing. */
  lastKey: string | null;
  /**
   * WHAT EACH STEP WAS, in the author's words (M-7).
   *
   * Same length and same order as `past`, `present` and `future`, so step `i`
   * of the timeline below is named by label `i`. Named AT PUSH TIME, because
   * the only moment anything knows that a document changed because somebody
   * moved section 5 above section 4 is the moment it happens — afterwards
   * there are two documents and a diff, and a diff cannot tell a move from a
   * delete-and-add.
   *
   * An unnamed push gets `DEFAULT_STEP` rather than an empty row: a history
   * panel with a blank line in it is worse than one that says "Changed the
   * page", because the blank one looks broken.
   */
  pastLabels: string[];
  presentLabel: string;
  futureLabels: string[];
}

/** What a step is called when nothing named it. */
export const DEFAULT_STEP = "Changed the page";

/** Where the document started. The bottom of every history panel. */
export const FIRST_STEP = "Opened it";

/** One row of the \u201cWhat you've changed\u201d panel. */
export interface HistoryStep {
  /** Its place in the timeline, for `travelTo`. */
  index: number;
  label: string;
  /** The step the document is on right now. */
  current: boolean;
  /** After the current one \u2014 listed and greyed until the next edit. */
  ahead: boolean;
}

/** Depth. Deep enough for a long session, bounded so a big document cannot
 *  grow the tab's memory without limit. */
export const HISTORY_LIMIT = 60;

export function initHistory<T>(doc: T): History<T> {
  return { past: [], present: doc, future: [], lastKey: null, pastLabels: [], presentLabel: FIRST_STEP, futureLabels: [] };
}

export function push<T>(
  h: History<T>,
  next: T,
  mergeKey: string | null = null,
  label: string = DEFAULT_STEP,
): History<T> {
  if (next === h.present) return h;
  // Same field, still typing: replace the top rather than stacking. The LABEL
  // is replaced too \u2014 one typing burst is one step, and the step is named for
  // the field it happened in, not for the first letter typed into it.
  if (mergeKey && mergeKey === h.lastKey) {
    return { ...h, present: next, future: [], futureLabels: [], presentLabel: label };
  }
  const past = [...h.past, h.present].slice(-HISTORY_LIMIT);
  const pastLabels = [...h.pastLabels, h.presentLabel].slice(-HISTORY_LIMIT);
  return { past, present: next, future: [], lastKey: mergeKey, pastLabels, presentLabel: label, futureLabels: [] };
}

export function canUndo<T>(h: History<T>): boolean { return h.past.length > 0; }
export function canRedo<T>(h: History<T>): boolean { return h.future.length > 0; }

export function undo<T>(h: History<T>): History<T> {
  if (!h.past.length) return h;
  return travelTo(h, h.past.length - 1);
}

export function redo<T>(h: History<T>): History<T> {
  if (!h.future.length) return h;
  return travelTo(h, h.past.length + 1);
}

/* ═══════════════════════════════════════════════════════════════════════════
   TRAVEL (M-7) — undo is a history you can walk in, not one step
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The whole timeline, oldest first: past, then present, then future.
 *
 * Undo and redo are both "travel one place" over this, which is why they are
 * two lines each above \u2014 one mechanism, not three that can disagree about
 * what `lastKey` should be afterwards.
 */
function timeline<T>(h: History<T>): { values: T[]; labels: string[] } {
  return {
    values: [...h.past, h.present, ...h.future],
    labels: [...h.pastLabels, h.presentLabel, ...h.futureLabels],
  };
}

/** Where in the timeline the document is now. */
export function cursor<T>(h: History<T>): number {
  return h.past.length;
}

/**
 * Go to step `index`. Everything after it stays listed, so the author can come
 * back \u2014 which is the difference between a history and an undo button. Out of
 * range, or already there, returns the history unchanged.
 */
export function travelTo<T>(h: History<T>, index: number): History<T> {
  const { values, labels } = timeline(h);
  if (index < 0 || index >= values.length || index === cursor(h)) return h;
  return {
    past: values.slice(0, index),
    present: values[index],
    future: values.slice(index + 1),
    lastKey: null,
    pastLabels: labels.slice(0, index),
    presentLabel: labels[index],
    futureLabels: labels.slice(index + 1),
  };
}

/**
 * The panel's rows, NEWEST FIRST \u2014 which is the order Elementor lists them
 * and the order a person reads "what have I just done".
 */
export function steps<T>(h: History<T>): HistoryStep[] {
  const { labels } = timeline(h);
  const at = cursor(h);
  return labels
    .map((label, index) => ({ index, label, current: index === at, ahead: index > at }))
    .reverse();
}
