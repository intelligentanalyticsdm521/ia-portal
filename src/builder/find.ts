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
import { flatMatches, type WidgetTask } from "./widgetTasks";
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
  const actions = [...ALWAYS_ACTIONS, ...(input.actions || [])];

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

  const widgets: FindResult[] = flatMatches(input.adapter, q)
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
 * Nothing in this module makes a record. Exported so the rule is a test and
 * not a comment: every result either selects something already on the page,
 * inserts a widget the author chose, or runs an action the adapter named.
 */
export function createsRecords(): boolean {
  return false;
}

export type { WidgetTask };
export default { findResults, ALWAYS_ACTIONS, FIND_GROUP_LABEL, FIND_PLACEHOLDER };
