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
import {
  type EmailRenderContext, type Family, type FamilyEmailRenderer, type FamilyEmailText,
  type FamilyLandingRenderer,
  type FamilyRenderer, type FamilyStudioInsert, type FamilyWidgetDef, type LandingRenderContext,
  type StudioBrandLite, type StudioCanvasDoc, type StudioInsertOptions, type StudioInsertResult,
  toWidgetDef,
} from "./types";

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

/* ══════════════════════════════════════════════════════════════════════════
   THE OTHER TWO DOORS — D-168 item 5b
   ══════════════════════════════════════════════════════════════════════════

   The seams commit wired the PAGE renderer and LUMEN's mailbox, and missed the
   Portal's own mailbox and both landing renderers. Six of the eight families
   found it separately, each wrote the same two lines in a file no family owns,
   and each said in the handoff that the other nine would do the same. Here is
   the door, once, in the file the families already import. ───────────────── */

function mergeHalf<T>(
  pick: (f: Family) => Record<string, T> | undefined,
  what: string,
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [name, family] of FAMILIES) {
    for (const [kind, fn] of Object.entries(pick(family) || {})) {
      if (out[kind]) {
        throw new Error(
          `Two families draw the widget "${kind}" ${what}: ${FAMILY_OF_KIND[kind] ?? "?"} and ${name}.`);
      }
      out[kind] = fn;
    }
  }
  return out;
}

const EMAIL_RENDERERS = mergeHalf<FamilyEmailRenderer>((f) => f.emailRenderers, "in a mailbox");
const EMAIL_TEXTS = mergeHalf<FamilyEmailText>((f) => f.emailTexts, "in a plain-text email");
const LANDING_RENDERERS = mergeHalf<FamilyLandingRenderer>((f) => f.landingRenderers, "on a landing page");

/** Every kind a family can draw IN A MAILBOX. */
export const FAMILY_EMAIL_RENDERED_KINDS: readonly string[] = Object.keys(EMAIL_RENDERERS);
/** Every kind a family can draw ON A HOSTED LANDING PAGE. */
export const FAMILY_LANDING_RENDERED_KINDS: readonly string[] = Object.keys(LANDING_RENDERERS);

/** Draw one in a mailbox, or `null` — the adapter's own switch tries next. */
export function renderEmailFamily(w: Widget, ctx: EmailRenderContext): string | null {
  const fn = EMAIL_RENDERERS[w.kind];
  return fn ? fn(w, ctx) : null;
}

/**
 * THE PLAIN-TEXT TWIN, or `null` — then the caller reads the words back out of
 * the mailbox markup, which is the right answer for a widget whose markup IS
 * its words and the wrong one for a widget whose markup is a picture.
 */
export function textEmailFamily(w: Widget, ctx: EmailRenderContext): string | null {
  const fn = EMAIL_TEXTS[w.kind];
  if (!fn) return null;
  const out = fn((w.props || {}) as Record<string, unknown>, ctx);
  return out == null ? null : String(out);
}

/** Draw one on a hosted landing page, or `null`. */
export function renderLandingFamily(w: Widget, ctx: LandingRenderContext): string | null {
  const fn = LANDING_RENDERERS[w.kind];
  return fn ? fn(w, ctx) : null;
}

const STUDIO_INSERTS = mergeHalf<FamilyStudioInsert>((f) => f.studioInserts, "on the studio canvas");

/** Every kind a family can PLACE on the My Brand canvas. */
export const FAMILY_STUDIO_KINDS: readonly string[] = Object.keys(STUDIO_INSERTS);

/** Turn one into canvas layers, or `null` — the adapter's switch tries next. */
export function insertFamilyWidget(
  kind: string,
  doc: StudioCanvasDoc,
  brand: StudioBrandLite,
  opts: StudioInsertOptions,
): StudioInsertResult | null {
  const fn = STUDIO_INSERTS[kind];
  return fn ? fn(doc, brand, opts) : null;
}

/**
 * WHICH KINDS A FAMILY OFFERS TO A BUILDER AND NOTHING CAN DRAW THERE.
 *
 * The presence guard behind item 5b: a tile on the newsletter panel that
 * nothing draws is a widget that shows *"this part needs a newer version of
 * the builder"* in a real person's inbox. The list is empty and
 * `test/builder-override.test.mjs` says so by name.
 *
 * ── WHY IT TAKES AN ARGUMENT (D-168 wave 2) ───────────────────────────────
 * It used to ask "did the FAMILY write a mailbox renderer", which is a
 * different question and the wrong one. A family may declare a definition for
 * a kind the platform has drawn since the beginning — `heading` and
 * `paragraph` are exactly that: the family owns the PANEL and the PAGE, and
 * the mailbox keeps the single renderer it already has, because a family copy
 * of a widget the adapter already draws is a SECOND mailbox renderer for one
 * widget. Asking the narrow question named those two as gaps when nothing was
 * missing.
 *
 * So the caller hands in what each surface can already draw — the adapter's own
 * exported list — and there is NO DEFAULT. A default here would be an
 * absence-based guard that passes when the caller forgets, which is the failure
 * mode `reference_absence_based_guards_fail_open` is about.
 */
export interface SurfacesAlreadyDrawn {
  /** Every kind the Portal's mailbox renderer draws: `EMAIL_DRAWN_KINDS`. */
  newsletter: readonly string[];
  /** Every kind the My Brand studio can place. Executed by its own test. */
  mybrand: readonly string[];
}

export function familySurfaceGaps(drawn: SurfacesAlreadyDrawn): Array<{ kind: string; builder: string }> {
  const out: Array<{ kind: string; builder: string }> = [];
  for (const d of FAMILY_DEFS) {
    if (d.builders.includes("newsletter")
      && !EMAIL_RENDERERS[d.kind] && !drawn.newsletter.includes(d.kind)) {
      out.push({ kind: d.kind, builder: "newsletter" });
    }
    if (d.builders.includes("landing") && !LANDING_RENDERERS[d.kind] && !RENDERERS[d.kind]
      && !also("landing", d.kind)) {
      out.push({ kind: d.kind, builder: "landing" });
    }
    if (d.builders.includes("mybrand")
      && !STUDIO_INSERTS[d.kind] && !drawn.mybrand.includes(d.kind)) {
      out.push({ kind: d.kind, builder: "mybrand" });
    }
  }
  return out;
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
