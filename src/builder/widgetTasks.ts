/**
 * builder/widgetTasks.ts — ONE way of grouping and searching the widget list.
 *
 * D-147 (BUILDER_USER_TEST_2026-09-16 §7). The pane groups widgets by what
 * they ARE — "Text", "Media", "Information", "Trust". A person building a
 * quote is not looking for "Information"; they are looking for *the bit that
 * says where the work happens*. So the pane and the picker both group by the
 * JOB the widget does:
 *
 *   Customer & property · Products & services · Words · Pictures & media ·
 *   Signature & terms · Layout · More
 *
 * ── WHY THIS MODULE AND NOT A SECOND LIST IN THE PICKER ───────────────────
 * The "+ Add" strip opens a picker and the side pane shows a list. They are
 * two PRESENTATIONS and must never become two vocabularies — the exact defect
 * registry.ts was written to end. So the grouping and the search live here,
 * once, and both surfaces call it. `groupForPane` in registry.ts stays as the
 * by-category view the other engines already read; nothing here replaces it.
 *
 * ── WHERE THE TASK COMES FROM ─────────────────────────────────────────────
 * A widget declares its own `task` on its registry entry, and that wins. Until
 * an adapter sets one, `TASK_BY_KIND` and then `TASK_BY_CATEGORY` answer, so
 * the groups are right today and get more precise the moment a registry entry
 * says so. Anything nothing can place lands in "More" — never dropped, because
 * a widget missing from the picker is a widget the author cannot add.
 *
 * Pure on purpose: no React, no lucide. `node --test` drives the lot.
 */
import {
  WIDGET_CATEGORIES, widgetDescription, widgetLabel, widgetsFor,
  type BuilderAdapter, type WidgetCategory, type WidgetDef,
} from "./registry";

/** The seven groups, in the order the picker and the pane show them. */
export const TASK_GROUPS = [
  "Customer & property",
  "Products & services",
  "Words",
  "Pictures & media",
  "Signature & terms",
  "Layout",
  "More",
] as const;

export type WidgetTask = (typeof TASK_GROUPS)[number];

/** Where an unplaced widget goes. Never dropped. */
export const DEFAULT_TASK: WidgetTask = "More";

/**
 * A widget whose registry entry names its own job.
 *
 * Declared structurally rather than added to `WidgetDef`, because registry.ts
 * belongs to the vocabulary and this module belongs to the picker: the field
 * is read here the day an entry carries it, and nothing has to change in
 * either file for that to start working.
 */
export interface TaskedWidget { task?: string }

/* `TASK_BY_KIND` LIVED HERE and is DELETED (handoff A-7).
   It was a map of twenty-four kinds beside the registry that declares them —
   two places to look up one fact. Every kind it named now carries `task` on its
   own registry entry, which is where the widget's owner can see it, and
   `TASK_BY_CATEGORY` below answers for the rest. Replace means delete. */

/** The fallback: what a whole category is usually for. */
export const TASK_BY_CATEGORY: Record<WidgetCategory, WidgetTask> = {
  Sections: "Layout",
  Document: "Signature & terms",
  Text: "Words",
  Media: "Pictures & media",
  Layout: "Layout",
  Money: "Products & services",
  Information: "More",
  Capture: "Customer & property",
  Trust: "More",
};

/** The job this widget does. Its own `task` first, then its category. */
export function taskFor(w: WidgetDef & TaskedWidget): WidgetTask {
  const own = (w as TaskedWidget).task;
  if (own && (TASK_GROUPS as readonly string[]).includes(own)) return own as WidgetTask;
  return TASK_BY_CATEGORY[w.category] ?? DEFAULT_TASK;
}

/**
 * THE search. One rule for the pane, the picker and the slash command.
 *
 * Matches the label, the sentence under it, the kind and the GROUP NAME —
 * because somebody who types "property" is describing the job, and the widget
 * that does it is called "Property block" in one place and nothing like it in
 * another. Every word in the query has to match something, so "snow price"
 * narrows rather than widens.
 */
export function matchesWidgetQuery(
  w: WidgetDef & TaskedWidget,
  query: string,
  adapter?: BuilderAdapter,
): boolean {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  // The sentence searched is the one the author can SEE (N-4): a widget whose
  // email line never mentions "scope" must not be found in the email pane by
  // typing "scope" because its proposal line does.
  const hay = `${widgetLabel(w, adapter)} ${widgetDescription(w, adapter)} ${w.kind} ${taskFor(w)}`.toLowerCase();
  return q.split(/\s+/).filter(Boolean).every((word) => hay.includes(word));
}

export interface TaskGroup { task: WidgetTask; widgets: WidgetDef[] }

/**
 * The widget list this builder offers, grouped by job and filtered by the
 * search box. Empty groups are dropped; group order is TASK_GROUPS' order and
 * never the registry's.
 */
export function groupByTask(adapter: BuilderAdapter, query = ""): TaskGroup[] {
  const pool = widgetsFor(adapter).filter((w) => matchesWidgetQuery(w, query, adapter));
  return TASK_GROUPS
    .map((task) => ({ task, widgets: byRelevance(pool.filter((w) => taskFor(w) === task), query, adapter) }))
    .filter((g) => g.widgets.length > 0);
}

/**
 * Best first WITHIN a group, and registry order when nothing was typed.
 *
 * FOUND BY DRIVING IT (2026-09-17): the slash command's Enter took the top of
 * `flatMatches`, which was ranked, while the picker DREW the group in registry
 * order — so the first card and the thing Enter inserted were two different
 * widgets. One order, computed once, used by both.
 */
function byRelevance(list: WidgetDef[], query: string, adapter?: BuilderAdapter): WidgetDef[] {
  if (!String(query || "").trim()) return list;
  return list
    .map((w, i) => ({ w, i, r: rank(w, query, adapter) }))
    .sort((a, b) => (b.r - a.r) || (a.i - b.i))
    .map((x) => x.w);
}

/**
 * How well a widget answers what was typed.
 *
 * A NAME beats a mention. Somebody who types "property" means the Property
 * block, not the merge field whose sentence happens to contain the word — and
 * the slash command's Enter takes the first of these, so getting the order
 * wrong inserts the wrong thing without asking.
 */
export function rank(w: WidgetDef & TaskedWidget, query: string, adapter?: BuilderAdapter): number {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return 0;
  const label = widgetLabel(w, adapter).toLowerCase();
  if (label === q) return 3;
  if (label.startsWith(q) || label.split(/\s+/).includes(q)) return 2;
  if (label.includes(q)) return 1;
  return 0;
}

/**
 * Every widget the query matches, best first — and what Enter picks.
 *
 * Group order breaks a tie, so an empty query still reads "Customer &
 * property" downwards rather than shuffling on every keystroke.
 */
export function flatMatches(adapter: BuilderAdapter, query = ""): WidgetDef[] {
  return byRelevance(groupByTask(adapter, query).flatMap((g) => g.widgets), query, adapter);
}

/**
 * The three big choices an empty page offers, in the client's words.
 *
 * D-148: "Start from an empty page" used to show a blank sheet, which is the
 * one screen nobody knows what to do with. Each choice opens the picker
 * already filtered to that job, so the first click is never wrong.
 */
export const EMPTY_PAGE_CHOICES: Array<{ key: string; title: string; hint: string; task: WidgetTask }> = [
  {
    key: "customer",
    title: "Add your customer and property",
    hint: "Who this is for, and the address the work happens at.",
    task: "Customer & property",
  },
  {
    key: "catalogue",
    title: "Add products and services",
    hint: "Lines straight out of your catalogue, with their prices.",
    task: "Products & services",
  },
  {
    key: "words",
    title: "Add words",
    hint: "A heading and a paragraph — start writing and see it on the page.",
    task: "Words",
  },
];

/** Every category is mapped, so nothing can quietly fall into "More". */
export function unmappedCategories(): WidgetCategory[] {
  return WIDGET_CATEGORIES.filter((c) => !TASK_BY_CATEGORY[c]);
}
