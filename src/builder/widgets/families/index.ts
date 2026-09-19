/**
 * builder/widgets/families/index.ts — THE ONE INDEX.
 *
 * BUILDER_FULL_WIDGET_PLAN_2026-09-19 §C.1. Ten family folders, ten agents,
 * and exactly one file that knows all ten exist. `registry.ts` gains ONE line
 * (`...FAMILY_WIDGET_DEFS`) and `render.ts` gains ONE line (`renderFamily`);
 * after that **no family agent ever opens registry.ts, render.ts or another
 * family's folder**, which is the whole point.
 *
 * ── WHY TEN AND NOT EIGHT ─────────────────────────────────────────────────
 * The plan's §C.2 table names F0 plus eight. `container` is F0's box half and
 * `ia` is its own parcel, owned by the b168/demo agent, so the folder list is
 * ten. All ten folders exist from the first commit, nine of them exporting an
 * empty family, because an index that grows an import per agent is an index
 * every agent conflicts in.
 *
 * ── THE ORDER OF THIS LIST IS THE ORDER OF THE PANEL ──────────────────────
 * Within a group, `registry.widgetsFor` sorts by `PANEL_ORDER` and falls back
 * to declaration order. That makes this list read top to bottom as the panel
 * reads it: the box first, then Elementor's own families in Elementor's order,
 * then Intelligent Analytics last — a plugin's own group, exactly as Elementor
 * draws one.
 *
 * ── WHAT THIS FILE REFUSES TO DO ──────────────────────────────────────────
 * It does not decide anything. It does not know what a widget is for, which
 * builder offers it, or whether a business may have it. It concatenates and it
 * merges, and it throws when two families claim the same `kind`, because a
 * silently-won collision is a widget that draws as something else on a
 * customer's page.
 */
import type { Widget } from "../../model";
import type { RenderContext } from "../../render";
import type { WidgetDef } from "../../registry";
import { type Family, type FamilyRenderer, type FamilyWidgetDef, toWidgetDef } from "./types";

import { FAMILY as CONTAINER } from "./container";
import { FAMILY as F1_WORDS } from "./f1-words";
import { FAMILY as F2_PICTURES } from "./f2-pictures";
import { FAMILY as F3_BUTTONS_ICONS_PANELS } from "./f3-buttons-icons-panels";
import { FAMILY as F4_MOVING } from "./f4-moving";
import { FAMILY as F5_SLIDERS_REVIEWS } from "./f5-sliders-reviews";
import { FAMILY as F6_MONEY } from "./f6-money";
import { FAMILY as F7_DATA_LISTS } from "./f7-data-lists";
import { FAMILY as F8_CONTACT_FURNITURE } from "./f8-contact-furniture";
/* LAST, and owned by the b168/demo agent — see families/ia/index.ts. */
import { FAMILY as IA } from "./ia";

/** Every family, by its folder name, in panel order. */
export const FAMILIES: ReadonlyArray<readonly [string, Family]> = [
  ["container", CONTAINER],
  ["f1-words", F1_WORDS],
  ["f2-pictures", F2_PICTURES],
  ["f3-buttons-icons-panels", F3_BUTTONS_ICONS_PANELS],
  ["f4-moving", F4_MOVING],
  ["f5-sliders-reviews", F5_SLIDERS_REVIEWS],
  ["f6-money", F6_MONEY],
  ["f7-data-lists", F7_DATA_LISTS],
  ["f8-contact-furniture", F8_CONTACT_FURNITURE],
  ["ia", IA],
];

/** The folder each `kind` came from, for the collision message and the tests. */
export const FAMILY_OF_KIND: Readonly<Record<string, string>> = (() => {
  const out: Record<string, string> = {};
  for (const [name, family] of FAMILIES) {
    for (const d of family.defs) {
      if (out[d.kind]) {
        throw new Error(
          `Two families declare the widget "${d.kind}": ${out[d.kind]} and ${name}. `
          + `One kind, one family — see families/index.ts.`);
      }
      out[d.kind] = name;
    }
  }
  return out;
})();

/** Every family's definitions, as the families themselves wrote them. */
export const FAMILY_DEFS: FamilyWidgetDef[] = FAMILIES.flatMap(([, f]) => f.defs);

/**
 * …and the same list in the engine's shape, which is the ONE line registry.ts
 * spreads. `builders` becomes `adapters` here and nowhere else.
 */
export const FAMILY_WIDGET_DEFS: WidgetDef[] = FAMILY_DEFS.map(toWidgetDef);

/** A family def by kind — how the entitlement seam finds `tier` / `requires`. */
export const FAMILY_DEF_BY_KIND: Readonly<Record<string, FamilyWidgetDef>> =
  Object.fromEntries(FAMILY_DEFS.map((d) => [d.kind, d]));

const RENDERERS: Record<string, FamilyRenderer> = (() => {
  const out: Record<string, FamilyRenderer> = {};
  for (const [name, family] of FAMILIES) {
    for (const [kind, fn] of Object.entries(family.renderers)) {
      if (out[kind]) {
        throw new Error(
          `Two families draw the widget "${kind}": ${FAMILY_OF_KIND[kind] ?? "?"} and ${name}.`);
      }
      out[kind] = fn;
    }
  }
  return out;
})();

/** Every kind a family can draw. */
export const FAMILY_RENDERED_KINDS: readonly string[] = Object.keys(RENDERERS);

/** Draw one, or `null` when no family owns it and the engine should try next. */
export function renderFamily(w: Widget, ctx: RenderContext): string | null {
  const fn = RENDERERS[w.kind];
  return fn ? fn(w, ctx) : null;
}

/**
 * THE CONTRACT EVERY FAMILY TEST ASKS ABOUT: def ⇄ renderer.
 *
 * A def with no renderer is a tile that puts a blank on the page; a renderer
 * with no def is code nothing can reach. Both are returned, by family, so the
 * failure message names the folder to open.
 */
export function familyContract(): Array<{ family: string; definedNotDrawn: string[]; drawnNotDefined: string[] }> {
  return FAMILIES.map(([family, f]) => {
    const defined = new Set(f.defs.map((d) => d.kind));
    const drawn = new Set(Object.keys(f.renderers));
    return {
      family,
      definedNotDrawn: [...defined].filter((k) => !drawn.has(k)),
      drawnNotDefined: [...drawn].filter((k) => !defined.has(k)),
    };
  });
}

export * from "./types";
