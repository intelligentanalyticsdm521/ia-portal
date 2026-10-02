/**
 * builder/walk.ts — THE ONE WALK, in a module a family folder may import.
 *
 * ── WHY IT LEFT render.ts (B-168, landing) ────────────────────────────────
 * `esc` left `render.ts` for `esc.ts` because a family folder that imports a
 * VALUE from `render.ts` closes a real cycle: `render.ts` imports
 * `widgets/families/index.ts`, and that index builds `FAMILY_RENDERED_KINDS`
 * and `FAMILY_WIDGET_DEFS` at module top level. Enter a family first — which
 * is exactly what a family's own test does — and `render.ts` is asked for a
 * `const` that has not been assigned yet:
 *
 *     ReferenceError: Cannot access 'FAMILY_RENDERED_KINDS' before initialization
 *
 * `esc` was not the only value a family needs. F1's Table of Contents has to
 * read every heading in the document, which is `walkDocumentTree`, and one
 * import of it put the whole cycle back. So the walk lives here, in a module
 * that imports nothing but types and `treeOps`, and `render.ts` re-exports it
 * so every caller that already says `import { walkTree } from "./render"` is
 * unchanged. There is still exactly one walk.
 *
 * **A family folder imports it from HERE.**
 */
import type { BuilderDocument, Node, Widget } from "./model";
import { isContainer, MAX_DEPTH } from "./treeOps";

/** How deep a box may go. One number, and this is the same one `render.ts` publishes. */
export const MAX_CONTAINER_DEPTH = MAX_DEPTH;

/**
 * The children of a container, tolerantly.
 *
 * Anything that is not a widget-shaped object is dropped rather than drawn,
 * for the same reason `deserialise` drops junk: a customer's page must not be
 * an exception because somebody hand-edited a row.
 */
export function childrenOf(w: Widget | null | undefined): Widget[] {
  if (!isContainer(w as Node)) return [];
  const raw = (w as any)?.children;
  if (!Array.isArray(raw)) return [];
  return raw.filter((c: any) => c && typeof c === "object" && typeof c.kind === "string") as Widget[];
}

/**
 * The one walk. `sectionStyleTag` needs it to find a styled widget three boxes
 * down, and the customer's page needs it to find the signature block wherever
 * the author put it — two places that each used to flatten `columns` by hand
 * and would each have missed everything nested.
 */
export function walkTree(widgets: Widget[], depth = 0): Array<{ widget: Widget; depth: number }> {
  if (depth > MAX_CONTAINER_DEPTH) return [];
  const out: Array<{ widget: Widget; depth: number }> = [];
  for (const w of widgets || []) {
    out.push({ widget: w, depth });
    if (isContainer(w as Node)) out.push(...walkTree(childrenOf(w), depth + 1));
  }
  return out;
}

/** Every widget in the document, containers included, in reading order. */
export function walkDocumentTree(doc: BuilderDocument): Widget[] {
  return doc.sections
    .flatMap((s) => s.columns.flatMap((c) => walkTree(c.widgets as Widget[])))
    .map((x) => x.widget);
}
