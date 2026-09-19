/**
 * builder/widgetTasks.ts — ONE way of grouping and searching the widget list.
 *
 * ── WHAT CHANGED, AND WHY (D-165, §11.13.1) ───────────────────────────────
 * This module used to hold a SECOND grouping. D-147 grouped the panel by the
 * job a widget does — Customer & property · Products & services · Words ·
 * Pictures & media · Signature & terms · Layout · More — while `registry.ts`
 * grouped the same widgets by category, and the two lists were maintained
 * beside each other. Brandon, 2026-09-19: *"Widgets on the side… groups as
 * accordions (Layout, Basic, Pro, General…)"*, and *"I don't need this over
 * engineered."*
 *
 * So there is one grouping now and it is Elementor's: **Layout / Basic /
 * General / Intelligent Analytics**, declared once on each widget's registry
 * entry. `TASK_GROUPS` is that list; `taskFor` is the widget's own category.
 * The seven job names, `TASK_BY_CATEGORY`, `TASK_BY_KIND` and the `task` field
 * on a registry entry are all DELETED — replace means delete.
 *
 * ── WHY THE FUNCTION NAMES DID NOT CHANGE ─────────────────────────────────
 * `WidgetPane.tsx`, `WidgetPicker.tsx`, `BuilderShell.tsx` and `find.ts` call
 * `groupByTask`, `flatMatches`, `TASK_GROUPS` and `EMPTY_PAGE_CHOICES`, and
 * those four files belong to another stream. Renaming the functions in the same
 * pass that changed what they ANSWER would be two changes crossing one
 * boundary; the rename is in the handoff for whoever holds the screen.
 *
 * Pure on purpose: no React, no lucide. `node --test` drives the lot.
 */
import {
  WIDGET_CATEGORIES, widgetDescription, widgetLabel, widgetsFor,
  type BuilderAdapter, type WidgetCategory, type WidgetDef,
} from "./registry";

/** The panel's groups, in the order the pane and the picker show them. */
export const TASK_GROUPS = WIDGET_CATEGORIES;

export type WidgetTask = WidgetCategory;

/** Where a widget with no group of its own would go. Nothing has none. */
export const DEFAULT_TASK: WidgetTask = "General";

/* `TaskedWidget` and the `task` field LIVED HERE and are DELETED (D-165).
   A widget's group is its `category`, declared once on its registry entry
   beside its name and its picture. A second field naming a second grouping is
   how the pane and the picker came to show different lists. */

/** The group this widget sits in. Its own category, and nothing else. */
export function taskFor(w: WidgetDef): WidgetTask {
  return WIDGET_CATEGORIES.includes(w.category) ? w.category : DEFAULT_TASK;
}

/**
 * THE search. One rule for the pane, the picker and the slash command.
 *
 * Matches the label, the sentence under it, the kind and the GROUP NAME. Every
 * word in the query has to match something, so "snow price" narrows rather than
 * widens.
 */
export function matchesWidgetQuery(
  w: WidgetDef,
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
 * The widget list this builder offers, grouped and filtered by the search box.
 * Empty groups are dropped; group order is Elementor's and never the array's.
 */
export function groupByTask(adapter: BuilderAdapter, query = ""): TaskGroup[] {
  const pool = widgetsFor(adapter).filter((w) => matchesWidgetQuery(w, query, adapter));
  return TASK_GROUPS
    .map((task) => ({ task, widgets: byRelevance(pool.filter((w) => taskFor(w) === task), query, adapter) }))
    .filter((g) => g.widgets.length > 0);
}

/**
 * Best first WITHIN a group, and PANEL order when nothing was typed.
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
 * A NAME beats a mention. Somebody who types "icon" means the Icon widget, not
 * the alert whose sentence happens to contain the word — and the slash
 * command's Enter takes the first of these, so getting the order wrong inserts
 * the wrong thing without asking.
 */
export function rank(w: WidgetDef, query: string, adapter?: BuilderAdapter): number {
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
 * Group order breaks a tie, so an empty query still reads Layout downwards
 * rather than shuffling on every keystroke.
 */
export function flatMatches(adapter: BuilderAdapter, query = ""): WidgetDef[] {
  return byRelevance(groupByTask(adapter, query).flatMap((g) => g.widgets), query, adapter);
}

/**
 * The three big choices an empty page offers, in the client's words.
 *
 * D-148: "Start from an empty page" used to show a blank sheet, which is the
 * one screen nobody knows what to do with. Each choice opens the picker already
 * filtered to a GROUP — which is now the only filter there is, so the three
 * name Elementor's groups rather than three jobs that existed nowhere else.
 */
export const EMPTY_PAGE_CHOICES: Array<{ key: string; title: string; hint: string; task: WidgetTask }> = [
  {
    key: "layout",
    title: "Start with a box",
    hint: "A container to drop things into — set it to a row for columns.",
    task: "Layout",
  },
  {
    key: "basic",
    title: "Add words and pictures",
    hint: "A heading, some text, an image — start writing and see it on the page.",
    task: "Basic",
  },
  {
    key: "ia",
    title: "Add your own data",
    hint: "Your customer, your products and your prices, straight from your records.",
    task: "Intelligent Analytics",
  },
];

/**
 * Every widget's group is one the panel draws. Nothing can fall out of sight.
 *
 * `taskFor` falls back to "General" for a category the panel does not have, and
 * a fallback nobody checks is a widget quietly in the wrong drawer — so this
 * names them instead, and a test asserts it is empty.
 */
export function unmappedCategories(): WidgetCategory[] {
  return WIDGET_CATEGORIES.filter((c) => !TASK_GROUPS.includes(c));
}
