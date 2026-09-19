/**
 * builder/find.ts — one box that finds anything in the builder (M-22, Ctrl+E).
 *
 * BUILDER_UX_SPEC §M-22, Elementor's Finder narrowed to what a document builder
 * needs: *"Typing matches, in this order: sections in this document (by label)
 * · widgets to insert · actions. Enter runs it. It finds and jumps; it never
 * creates records"* — unlike Elementor's, which makes new pages from inside the
 * editor, and which is how the newsletter builder ended up with three orphan
 * rows (D-25).
 *
 * THE ORDER IS THE POINT. Somebody who types "pri" in a snow agreement almost
 * always means the pricing section they are looking at, not the pricing-table
 * widget and certainly not Preview — so sections come first, every time, and a
 * widget only ever inserts when the author picks it deliberately.
 *
 * Pure: no React, no DOM. `node --test` drives the ranking, the order and the
 * "never creates" rule.
 */
import { flatPanelMatches, type PanelGroup } from "./widgetGroups";
import { widgetDescription, widgetLabel, type BuilderAdapter, type WidgetDef } from "./registry";
import type { BuilderDocument } from "./model";

export type FindKind = "section" | "widget" | "action";

export interface FindResult {
  /** Stable, so React keys and tests are not index-based. */
  id: string;
  kind: FindKind;
  /** What the row reads. */
  label: string;
  /** The greyed line beside it — the group, the section number, what it does. */
  hint: string;
  /** Set on a section row: which section to select and scroll to. */
  sectionId?: string;
  /** Set on a widget row: what to insert, where the picker would have put it. */
  widget?: WidgetDef;
  /** Set on an action row: the caller's own id for it. */
  actionId?: string;
}

/** One thing the builder can be asked to do from the box. */
export interface FindAction {
  id: string;
  label: string;
  hint?: string;
  /**
   * TRUE when running this action MAKES A NEW ROW somewhere — a page, a
   * record, a document that did not exist before the box was opened.
   *
   * Find will not offer it. D-25 is what happens when an editor's finder can
   * create: Elementor's makes new pages from inside the editor, and the
   * newsletter builder ended up with three orphan rows nobody could delete.
   * An action that only writes the thing the author is already editing (Save
   * draft, Send) is NOT one of these — it changes what is in front of them,
   * it does not mint something else behind their back.
   */
  createsRecord?: boolean;
}

/**
 * The actions every builder has. An adapter adds its own (Send to customer,
 * Publish) and the engine never invents one it cannot perform — a Find that
 * offers Publish in a builder with no Publish is worse than one that offers
 * less.
 */
export const ALWAYS_ACTIONS: FindAction[] = [
  { id: "preview", label: "Preview", hint: "See it as the reader will" },
  { id: "outline", label: "Outline", hint: "Everything on the page, in order" },
  { id: "templates", label: "Template library", hint: "Start again from a ready-made one" },
  { id: "history", label: "What you've changed", hint: "Every step, newest first" },
  { id: "shortcuts", label: "Keyboard shortcuts", hint: "The list of them" },
];

export interface FindInput {
  doc: BuilderDocument;
  adapter: BuilderAdapter;
  /** The adapter's own actions, added after the engine's. */
  actions?: FindAction[];
  /** How many of each kind to show. The box is a list, not a report. */
  limit?: number;
}

/** Every word in the query has to match something, so "snow price" narrows. */
function matches(hay: string, q: string): boolean {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const h = hay.toLowerCase();
  return words.every((w) => h.includes(w));
}

/** A name beats a mention, and an exact name beats a prefix. */
function score(label: string, q: string): number {
  const l = label.toLowerCase();
  const query = q.trim().toLowerCase();
  if (!query) return 0;
  if (l === query) return 3;
  if (l.startsWith(query)) return 2;
  if (l.includes(query)) return 1;
  return 0;
}

/**
 * What the box shows for this query.
 *
 * An EMPTY query shows the actions only — the box has just been opened, the
 * author has typed nothing, and a list of every section and every widget the
 * moment `Ctrl+E` lands is a wall, not an answer.
 */
export function findResults(query: string, input: FindInput): FindResult[] {
  const q = String(query || "").trim();
  const limit = input.limit ?? 6;
  // "It finds and jumps; it never creates" is ENFORCED here, not asserted in a
  // comment: an action that says it makes a row is dropped before the box can
  // show it, whichever side of the engine/adapter line put it there.
  const actions = [...ALWAYS_ACTIONS, ...(input.actions || [])]
    .filter((a) => a.createsRecord !== true);

  if (!q) {
    return actions.slice(0, limit * 2).map((a) => ({
      id: `action:${a.id}`, kind: "action" as const, label: a.label, hint: a.hint || "", actionId: a.id,
    }));
  }

  const sections: FindResult[] = input.doc.sections
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => matches(`${s.label || ""} ${i + 1}`, q))
    .sort((a, b) => score(b.s.label || "", q) - score(a.s.label || "", q))
    .slice(0, limit)
    .map(({ s, i }) => ({
      id: `section:${s.id}`,
      kind: "section" as const,
      label: s.label || `Section ${i + 1}`,
      hint: `Section ${i + 1} of ${input.doc.sections.length}`,
      sectionId: s.id,
    }));

  const widgets: FindResult[] = flatPanelMatches(input.adapter, q)
    .slice(0, limit)
    .map((w) => ({
      id: `widget:${w.kind}`,
      kind: "widget" as const,
      label: widgetLabel(w, input.adapter),
      hint: widgetDescription(w, input.adapter),
      widget: w,
    }));

  const acts: FindResult[] = actions
    .filter((a) => matches(`${a.label} ${a.hint || ""}`, q))
    .sort((a, b) => score(b.label, q) - score(a.label, q))
    .slice(0, limit)
    .map((a) => ({
      id: `action:${a.id}`, kind: "action" as const, label: a.label, hint: a.hint || "", actionId: a.id,
    }));

  return [...sections, ...widgets, ...acts];
}

/** The heading above each run of rows. */
export const FIND_GROUP_LABEL: Record<FindKind, string> = {
  section: "In this document",
  widget: "Add to the page",
  action: "Do this",
};

/** The box's own words. Written here so the test can read them. */
export const FIND_PLACEHOLDER = "Find a section, something to add, or what to do next";

/**
 * WHICH OF THESE ACTIONS WOULD MAKE A RECORD?
 *
 * This used to be `return false` — a hardcoded constant in the shape of a
 * guard, which is worse than no guard at all: the test that called it passed
 * for ever, including on the day somebody added "New page" to `ALWAYS_ACTIONS`.
 * It is now read off the rows themselves, so it answers the real question and
 * goes true the moment one is flagged.
 */
export function recordMakers(actions: FindAction[]): FindAction[] {
  return actions.filter((a) => a.createsRecord === true);
}

/**
 * Does this builder's Find offer anything that makes a record? (D-25.)
 *
 * The engine's own actions are always counted; pass the adapter's on top.
 * `findResults` DROPS every flagged row, so a `true` here is a wiring mistake
 * the caller should see rather than a row the author can press.
 */
export function createsRecords(actions: FindAction[] = []): boolean {
  return recordMakers([...ALWAYS_ACTIONS, ...actions]).length > 0;
}

export type { PanelGroup };
export default { findResults, ALWAYS_ACTIONS, FIND_GROUP_LABEL, FIND_PLACEHOLDER, createsRecords };
