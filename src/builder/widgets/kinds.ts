/**
 * builder/widgets/kinds.ts — the NAMES of the atomic widgets, and nothing else.
 *
 * This module imports NOTHING. That is its whole job.
 *
 * `render.ts` needs the list while it is still evaluating (RENDERED_KINDS is a
 * top-level const), and the widget modules import `render.ts` for the escaping
 * and merge-filling pipeline. Read the list from `widgets/index.ts` and that
 * cycle becomes a real one: whichever module is entered first, the other is
 * half-built when the list is read — "Cannot access 'ATOM_KINDS' before
 * initialization", found by running the tests rather than by reading them.
 *
 * A module with no imports cannot be half-built, so both sides read it safely.
 * `widgets/index.ts` asserts the list matches the renderers it actually has, so
 * a name here without a renderer, or a renderer without a name, is a test
 * failure and not a widget that silently draws nothing.
 */
export const ATOM_KINDS = [
  "card",
  "catalog_card",
  "price_line",
  "totals",
  "address_block",
  "key_fact",
  /* Not a money widget: the free HTML box (catalogue point 9). It is on this
     list because the list is the index of "a widget that declares itself in
     its own file under widgets/", which it does — not because it has anything
     to do with a price. */
  "html",
] as const;

export type AtomKind = (typeof ATOM_KINDS)[number];
