/**
 * The menu editor's list arithmetic, kept out of the component so it can be
 * tested without a browser — the same split `sectionListState.ts` uses.
 *
 * THE THING THAT IS EASY TO GET WRONG: nesting is by POSITION. A row that sits
 * under another one holds the INDEX of its parent in this list, because none of
 * the rows have ids until the website gives them one. So every move and every
 * removal has to re-point every parent reference, or moving one row silently
 * re-parents somebody else's entry — a menu that looks right in the Portal and
 * is wrong on the website.
 */

import type { SiteMenu, SiteMenuItem, SiteMenuItemInput } from '../../lib/arionApi';

export interface MenuRow {
  /** Stable only for the life of this edit; the website assigns the real id. */
  key: string;
  itemId?: number;
  kind: string;
  objectId?: number;
  title: string;
  url: string;
  /** Index in THIS list of the row it sits under, or null for top level. */
  parentIndex: number | null;
}

let seq = 0;
export function menuRowKey(): string {
  seq += 1;
  return `menu-row-${seq}`;
}

/** One menu, as the editor holds it. */
export function toMenuRows(menu: SiteMenu): MenuRow[] {
  const indexById = new Map<number, number>();
  menu.items.forEach((item, i) => indexById.set(item.itemId, i));
  return menu.items.map((item: SiteMenuItem) => ({
    key: menuRowKey(),
    itemId: item.itemId,
    kind: item.kind,
    objectId: item.objectId,
    title: item.title,
    url: item.url,
    parentIndex: item.parentItemId && indexById.has(item.parentItemId)
      ? (indexById.get(item.parentItemId) as number)
      : null,
  }));
}

/** What goes back to the website: the whole ordered list, every time. */
export function toMenuInput(rows: MenuRow[]): SiteMenuItemInput[] {
  return rows.map((r) => ({
    itemId: r.itemId,
    kind: r.kind,
    objectId: r.objectId,
    title: r.title,
    url: r.url,
    parentIndex: r.parentIndex,
  }));
}

/** Re-point every parent reference after the list has been rearranged. */
function repoint(before: MenuRow[], after: MenuRow[]): MenuRow[] {
  const moved = new Map<number, number>();
  before.forEach((r, i) => {
    const to = after.findIndex((n) => n.key === r.key);
    if (to >= 0) moved.set(i, to);
  });
  return after.map((r) => ({
    ...r,
    parentIndex: r.parentIndex === null ? null : (moved.has(r.parentIndex) ? (moved.get(r.parentIndex) as number) : null),
  }));
}

export function moveMenuRow(rows: MenuRow[], from: number, to: number): MenuRow[] {
  if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) return rows;
  const next = [...rows];
  const [row] = next.splice(from, 1);
  next.splice(to, 0, row);
  return repoint(rows, next);
}

export function removeMenuRow(rows: MenuRow[], index: number): MenuRow[] {
  if (index < 0 || index >= rows.length) return rows;
  const next = rows.filter((_, i) => i !== index);
  const moved = new Map<number, number>();
  rows.forEach((r, i) => {
    if (i === index) return;
    moved.set(i, next.findIndex((n) => n.key === r.key));
  });
  return next.map((r) => {
    const original = rows.find((o) => o.key === r.key) as MenuRow;
    if (original.parentIndex === null) return { ...r, parentIndex: null };
    // `moved` deliberately has no entry for the row that was REMOVED, so a row
    // whose parent has just gone falls through to null and comes back OUT to
    // the top level. Anything else would silently re-parent it under whatever
    // slid up into the gap.
    const stillThere = moved.has(original.parentIndex);
    return { ...r, parentIndex: stillThere ? (moved.get(original.parentIndex) as number) : null };
  });
}

/**
 * Tuck a row under the one above it, or bring it back out.
 *
 * ONE LEVEL DEEP. Tucking a row under a row that is ITSELF tucked would make a
 * third level, which no theme on the estate draws well — the website would
 * come out visibly wrong on every page. So the row goes under its neighbour's
 * OWN parent instead, which is the sibling position a person means when they
 * indent the row under an indented one. The website refuses a third level as
 * well; this is what stops a client ever being refused for it.
 */
export function toggleMenuRowParent(rows: MenuRow[], index: number): MenuRow[] {
  if (index <= 0 || index >= rows.length) return rows;
  const above = rows[index - 1];
  const target = above.parentIndex === null ? index - 1 : above.parentIndex;
  return rows.map((r, i) => (i === index
    ? { ...r, parentIndex: r.parentIndex === null ? target : null }
    : r));
}

/**
 * A row cannot be tucked under a row that has children of its own — that is
 * the same third level from the other direction, and the button has to be
 * greyed rather than doing something surprising.
 */
export function canTuckMenuRow(rows: MenuRow[], index: number): boolean {
  if (index <= 0 || index >= rows.length) return false;
  if (rows[index].parentIndex !== null) return true;   // bringing it back out is always allowed
  return !rows.some((r) => r.parentIndex === index);
}

export function menuRowsEqual(a: MenuRow[], b: MenuRow[]): boolean {
  return JSON.stringify(toMenuInput(a)) === JSON.stringify(toMenuInput(b));
}
