/**
 * builder/widgets/features.ts — WHAT IS INCLUDED, as the price table stores it.
 * This module imports NOTHING.
 *
 * The catalogue's `price-table` keeps its feature list in a REPEATER whose
 * per-item field is `item_text` (C.1's own footnote:
 * *"Repeater `features_list` — per-item fields: `item_text` · …"*). That is the
 * shape a card stores, the shape both LUMEN renderers stamp into `data-edit`,
 * and the shape oliver's mirror reads — agreed with stream O on 2026-09-17 so
 * three repos cannot hold one list three ways.
 *
 * ── WHY IT IMPORTS NOTHING ────────────────────────────────────────────────
 * The same reason `kinds.ts` and `ribbon.ts` do. `upgrade.ts` needs these to
 * change the SHAPE of a renamed list, and `upgrade.ts` is reached from
 * `model.ts` — which sits under `render.ts`, which reaches `widgets/index.ts`,
 * which is still evaluating when `card.ts` is. Importing `card.ts` from
 * `upgrade.ts` produced exactly the failure the folder's header warns about:
 * *"Cannot access 'CARD_DEF' before initialization"*, found by running the
 * tests. A module with no imports cannot be half-built. `card.ts` re-exports
 * every name below, so no caller has to know about the split.
 */

const str = (v: unknown): string => (v == null ? "" : String(v));

/** ONE feature item, as the repeater stores it. */
export function featureItem(text: string): { item_text: string } {
  return { item_text: text };
}

/**
 * One feature line's words, whichever of the two shapes holds it.
 *
 * A `{ item_text }` object is what a card stores now; a plain string is what
 * `bullets` held and what a card written before the rename still has.
 */
export function featureText(v: unknown): string {
  return v && typeof v === "object" ? str((v as any).item_text) : str(v);
}

/** A whole list's words. Reads a repeater and a flat array of strings alike. */
export function featureTexts(v: unknown): string[] {
  return (Array.isArray(v) ? v : []).map(featureText);
}

/** Which prop name this document is using for the feature list. Writers need it. */
export function bulletsKey(
  props: Record<string, unknown> | undefined | null,
): "features_list" | "bullets" | "features" {
  const p: any = props || {};
  if (Array.isArray(p.features_list)) return "features_list";
  if (Array.isArray(p.bullets)) return "bullets";
  if (Array.isArray(p.features)) return "features";
  return "features_list";
}

/**
 * The `data-edit` path for one feature line.
 *
 * `features_list.<n>.item_text` is ONE LEVEL DEEPER than the old
 * `bullets.<n>`, and `setPropPath` builds the shape on the way in. One
 * function, because the canvas, the email and the landing page all write back
 * to the same key or an edit goes into something nothing reads.
 */
export function featurePath(props: Record<string, unknown> | undefined | null, i: number): string {
  const key = bulletsKey(props);
  return key === "features_list" ? `features_list.${i}.item_text` : `${key}.${i}`;
}
