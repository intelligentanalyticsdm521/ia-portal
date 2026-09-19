/**
 * builder/widgets/families/ia/index.ts — THE IA FAMILY.
 *
 * The shape BUILDER_FULL_WIDGET_PLAN_2026-09-19.md section C.1 draws:
 *
 *   families/
 *     <family>/
 *       <widget>.ts   definition + renderer, one file per widget
 *       index.ts      export const FAMILY = { defs: [...], renderers: { kind: fn } }
 *     index.ts        THE one index, which imports the family indexes
 *
 * The master `families/index.ts` does not exist on this branch — it is the
 * lander's, and the SEAMS agent ships an EMPTY placeholder for this folder on
 * its own branch. At landing THIS file replaces that placeholder whole, and the
 * two lines marked `b168/demo TEMP` in `registry.ts` and `render.ts` go.
 *
 * A family folder holds nothing but widgets. The record BOOK these widgets read
 * stays in `proposal/recordWidgets.ts`, where the proposal adapter fills it.
 *
 * ── WHY `defs` AND `renderers` ARE GETTERS ────────────────────────────────
 * This module is reached from `registry.ts` AND from `render.ts`, and the
 * widget file it collects imports `esc` from `render.ts`. That is a cycle — the
 * same one `widgets/index.ts` documents — and the rule on it is the same:
 * **only hoisted function declarations may cross it**, because a `const` read
 * while the other side is still evaluating throws
 * `Cannot access '…' before initialization`. It did, the first time this file
 * was written with plain properties. A getter moves the read to CALL time,
 * which is after every module in the cycle has finished, and `renderFamily`
 * below is a function declaration for the same reason.
 */
import type { Widget } from "../../../model";
import type { RenderContext } from "../../../render";
import type { WidgetDef } from "../../../registry";
import { CUSTOM_FIELD_DEF, CUSTOM_FIELD_KIND, renderCustomField } from "./customField";

export type FamilyRenderer = (w: Widget, ctx: RenderContext) => string;

export interface WidgetFamily {
  readonly defs: WidgetDef[];
  readonly renderers: Record<string, FamilyRenderer>;
}

export const FAMILY: WidgetFamily = {
  get defs(): WidgetDef[] {
    return [CUSTOM_FIELD_DEF];
  },
  get renderers(): Record<string, FamilyRenderer> {
    return { [CUSTOM_FIELD_KIND]: renderCustomField };
  },
};

/** Every kind this family draws. A FUNCTION, for the reason in the header. */
export function familyKinds(): string[] {
  return Object.keys(FAMILY.renderers);
}

/** Draw one, or null when it is not this family's and the engine should try. */
export function renderFamily(w: Widget, ctx: RenderContext): string | null {
  const fn = FAMILY.renderers[w.kind];
  return fn ? fn(w, ctx) : null;
}

export * from "./customField";
export default FAMILY;
