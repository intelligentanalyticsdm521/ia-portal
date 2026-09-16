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
}

/** Depth. Deep enough for a long session, bounded so a big document cannot
 *  grow the tab's memory without limit. */
export const HISTORY_LIMIT = 60;

export function initHistory<T>(doc: T): History<T> {
  return { past: [], present: doc, future: [], lastKey: null };
}

export function push<T>(h: History<T>, next: T, mergeKey: string | null = null): History<T> {
  if (next === h.present) return h;
  // Same field, still typing: replace the top rather than stacking.
  if (mergeKey && mergeKey === h.lastKey) {
    return { ...h, present: next, future: [] };
  }
  const past = [...h.past, h.present].slice(-HISTORY_LIMIT);
  return { past, present: next, future: [], lastKey: mergeKey };
}

export function canUndo<T>(h: History<T>): boolean { return h.past.length > 0; }
export function canRedo<T>(h: History<T>): boolean { return h.future.length > 0; }

export function undo<T>(h: History<T>): History<T> {
  if (!h.past.length) return h;
  const past = [...h.past];
  const present = past.pop()!;
  return { past, present, future: [h.present, ...h.future].slice(0, HISTORY_LIMIT), lastKey: null };
}

export function redo<T>(h: History<T>): History<T> {
  if (!h.future.length) return h;
  const [present, ...future] = h.future;
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present, future, lastKey: null };
}
