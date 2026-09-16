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
 */
import type { BuilderDocument } from "./model";

export interface History {
  past: BuilderDocument[];
  present: BuilderDocument;
  future: BuilderDocument[];
  /** What produced `present`, for coalescing. */
  lastKey: string | null;
}

/** Depth. Deep enough for a long session, bounded so a big document cannot
 *  grow the tab's memory without limit. */
export const HISTORY_LIMIT = 60;

export function initHistory(doc: BuilderDocument): History {
  return { past: [], present: doc, future: [], lastKey: null };
}

export function push(h: History, next: BuilderDocument, mergeKey: string | null = null): History {
  if (next === h.present) return h;
  // Same field, still typing: replace the top rather than stacking.
  if (mergeKey && mergeKey === h.lastKey) {
    return { ...h, present: next, future: [] };
  }
  const past = [...h.past, h.present].slice(-HISTORY_LIMIT);
  return { past, present: next, future: [], lastKey: mergeKey };
}

export function canUndo(h: History): boolean { return h.past.length > 0; }
export function canRedo(h: History): boolean { return h.future.length > 0; }

export function undo(h: History): History {
  if (!h.past.length) return h;
  const past = [...h.past];
  const present = past.pop()!;
  return { past, present, future: [h.present, ...h.future].slice(0, HISTORY_LIMIT), lastKey: null };
}

export function redo(h: History): History {
  if (!h.future.length) return h;
  const [present, ...future] = h.future;
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present, future, lastKey: null };
}
