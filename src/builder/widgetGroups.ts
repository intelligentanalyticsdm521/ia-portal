/**
 * builder/widgetGroups.ts — THE PANEL'S GROUPS, AND ITS SEARCH. One module.
 *
 * Scope §11.13.1 (D-165), agreed with Brandon 2026-09-19:
 *
 *   "the four groups as accordions in order — Layout / Basic / General /
 *    Intelligent Analytics"
 *
 * ── ONE GROUPING, AND IT IS THE REGISTRY'S OWN FIELD ──────────────────────
 * A widget's group is its `category`, declared ONCE on its registry entry
 * beside its name and its picture. This file keeps no second table of
 * kind → group: a table beside the declaration is how the pane and the picker
 * came to show two different lists, which is what §11.13.1 exists to stop.
 * `PANEL_GROUPS` is `WIDGET_CATEGORIES`, so nothing here can invent a group the
 * registry cannot spell.
 *
 * ── WHAT THIS FILE REPLACED (integration, 2026-09-19) ─────────────────────
 * `widgetTasks.ts` held `TASK_GROUPS`, `taskFor`, `groupByTask`, `flatMatches`,
 * `EMPTY_PAGE_CHOICES` and the search; this file held `PANEL_GROUPS`,
 * `GROUP_BY_KIND`, `groupFor`, `panelGroups` and `flatPanelMatches`. Two
 * streams each wrote an answer to "which group is this widget in", and after
 * the merge the tree had both, computing the same four groups two ways. One
 * module now, under the names the screen already calls, and `widgetTasks.ts` is
 * DELETED — the R-1.6 / S2→S1-2 ask in D165_HANDOFF_2026-09-19.md.
 *
 * ── NOTHING FALLS OFF THE PANEL, AND NOTHING FALLS IN SILENTLY ────────────
 * A widget whose category the panel does not draw is still SHOWN — in the last
 * group, because a widget missing from the panel is a widget the author cannot
 * add — and `unmappedKinds()` names it, so the test goes red instead of the
 * screen going quietly wrong. That is the presence guard the memory rule asks
 * for, not a `|| "General"` that hides the hole.
 *
 * Pure: no React, no lucide. `node --test` drives the lot.
 */
import {
  BUILDER_ADAPTERS, WIDGET_CATEGORIES, widgetDescription, widgetLabel, widgetsFor,
  type BuilderAdapter, type WidgetCategory, type WidgetDef,
} from "./registry";

/**
 * The groups, in the order the panel draws them.
 *
 * Elementor's own order is Layout, Basic, Pro, General, Site, then the plugin
 * groups — and since D-168 item 6 so is ours, read off `elementorPanel.ts`,
 * machine-cut from a real install with Pro. It said four here, and gave a
 * reason: "no widget carries that category yet". That stopped being true when
 * the families landed Elementor's 37 Pro widgets and its 13 theme pieces, and
 * the rest of the reason — "a group with nothing behind it is a door onto a
 * wall" — is answered by `panelGroups` below, which drops a group with nothing
 * offered for THAT builder. A proposal panel has no Pro or Site group; the
 * website panel has both, which is what the reference editor draws.
 *
 * `PANEL_GROUPS` is the registry's own list precisely so a group cannot be
 * invented here.
 */
export const PANEL_GROUPS: readonly WidgetCategory[] = WIDGET_CATEGORIES;

export type PanelGroup = WidgetCategory;

/** Where a widget whose category the panel cannot draw goes, so it is never lost. */
export const LAST_GROUP: PanelGroup = "Intelligent Analytics";

/** The group this widget sits in: its own category, and nothing else. */
export function groupFor(w: Pick<WidgetDef, "category">): PanelGroup {
  return PANEL_GROUPS.includes(w.category) ? w.category : LAST_GROUP;
}

/**
 * Every kind an adapter offers whose category the panel does not draw.
 *
 * The presence guard. A kind here is still drawn on the panel — losing it would
 * be worse — but the test names it, so a new widget cannot arrive in the wrong
 * group without somebody being told.
 */
export function unmappedKinds(): string[] {
  const out = new Set<string>();
  for (const a of BUILDER_ADAPTERS) {
    for (const w of widgetsFor(a)) if (!PANEL_GROUPS.includes(w.category)) out.add(w.kind);
  }
  return [...out].sort();
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
  const hay = `${widgetLabel(w, adapter)} ${widgetDescription(w, adapter)} ${w.kind} ${groupFor(w)}`.toLowerCase();
  return q.split(/\s+/).filter(Boolean).every((word) => hay.includes(word));
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

export interface PanelGroupList {
  group: PanelGroup;
  widgets: WidgetDef[];
}

/**
 * The panel's groups for this builder, filtered by the search box.
 *
 * Empty groups are dropped — an accordion with nothing behind it is a door
 * onto a wall. Order is PANEL_GROUPS' order and never the registry's.
 */
export function panelGroups(adapter: BuilderAdapter, query = ""): PanelGroupList[] {
  const pool = widgetsFor(adapter).filter((w) => matchesWidgetQuery(w, query, adapter));
  return PANEL_GROUPS
    .map((group) => ({ group, widgets: byRelevance(pool.filter((w) => groupFor(w) === group), query, adapter) }))
    .filter((g) => g.widgets.length > 0);
}

/**
 * Best first WITHIN a group, and PANEL order when nothing was typed.
 *
 * FOUND BY DRIVING IT (2026-09-17): the slash command's Enter took the top of
 * the flat list, which was ranked, while the picker DREW the group in registry
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
 * Which accordions start open. EVERY ONE OF THEM.
 *
 * CHANGED (D-172, and kept here). This opened the first group only, on the
 * belief that the reference editor does. It does not: open Elementor and every
 * category is expanded, which is why a person can scroll one list and see all
 * of it. Opening one left five headings closed, so the panel looked empty and
 * the author went looking for the pop-up list that D-172 deleted.
 *
 * With a search running it is the same answer, for the same reason: somebody
 * who typed "price" is not going to click three headings to find out where it
 * went.
 */
export function openGroups(groups: PanelGroupList[], _query: string): PanelGroup[] {
  return groups.map((g) => g.group);
}

/** Every widget the query matches, best first — what Enter picks. */
export function flatPanelMatches(adapter: BuilderAdapter, query = ""): WidgetDef[] {
  return byRelevance(panelGroups(adapter, query).flatMap((g) => g.widgets), query, adapter);
}

/**
 * The three big choices an empty page offers, in the client's words.
 *
 * D-148: "Start from an empty page" used to show a blank sheet, which is the
 * one screen nobody knows what to do with. Each choice opens the picker already
 * filtered to a GROUP — which is now the only filter there is, so the three
 * name the panel's own groups rather than three jobs that existed nowhere else.
 */
export const EMPTY_PAGE_CHOICES: Array<{ key: string; title: string; hint: string; group: PanelGroup }> = [
  {
    key: "layout",
    title: "Start with a box",
    hint: "A container to drop things into — set it to a row for columns.",
    group: "Layout",
  },
  {
    key: "basic",
    title: "Add words and pictures",
    hint: "A heading, some text, an image — start writing and see it on the page.",
    group: "Basic",
  },
  {
    key: "ia",
    title: "Add your own data",
    hint: "Your customer, your products and your prices, straight from your records.",
    group: "Intelligent Analytics",
  },
];
