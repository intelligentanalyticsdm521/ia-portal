/**
 * builder/widgets/families/types.ts — WHAT A FAMILY IS, in one file.
 *
 * BUILDER_FULL_WIDGET_PLAN_2026-09-19 §C.1. Today a new widget touches
 * `registry.ts` (66 KB), `render.ts` (60 KB) and arion's `elementorWidgets.js`
 * (40 KB), so three agents adding three widgets is three conflicts in three
 * large files. The fix: **a widget declares itself in its own folder, and
 * exactly one index collects the folders.** This module is the shape those
 * folders agree on — nothing else in the builder owns it, so no family has to
 * read another family's code to know what to export.
 *
 * ── THE ONE RULE ABOUT WHAT MAY BE IN HERE ────────────────────────────────
 * D-168: a widget on any panel is EITHER an Elementor widget, by Elementor's
 * own name, group, icon, panel sections, control labels and defaults, OR one of
 * the IA widgets named in `BUILDER_OFFERS_2026-09-19.json`. Nothing else, ever.
 * `test/builder-offers.test.mjs` fails the build on an extra tile, which is the
 * only way that rule stops being a paragraph and starts being true.
 *
 * ── FIVE BUILDERS, ONE SET OF NAMES ───────────────────────────────────────
 * The offer file says `website | landing | newsletter | proposal | mybrand`;
 * the engine's `BuilderAdapter` has said `website | landing | email | proposal |
 * brand` since §3.4. Two names for one thing is the drift this whole pass
 * exists to stop, so a family declares the OFFER FILE's names — the names
 * Brandon approved and the test reads — and `ADAPTER_OF` below is the single
 * place they become adapters. One table, one direction, no second vocabulary.
 */
import type { BuilderAdapter, WidgetDef } from "../../registry";
import type { WidgetTier } from "../../tier";
import type { Widget } from "../../model";
import type { RenderContext } from "../../render";

/** The five builders, in the offer file's own words. */
export type BuilderName = "website" | "landing" | "newsletter" | "proposal" | "mybrand";

export const BUILDER_NAMES: BuilderName[] = [
  "website", "landing", "newsletter", "proposal", "mybrand",
];

/** THE one place the offer file's name becomes the engine's adapter. */
export const ADAPTER_OF: Readonly<Record<BuilderName, BuilderAdapter>> = {
  website: "website",
  landing: "landing",
  newsletter: "email",
  proposal: "proposal",
  mybrand: "brand",
};

/** …and back, for a test that reads an adapter and has to name a builder. */
export const BUILDER_OF: Readonly<Record<BuilderAdapter, BuilderName>> = {
  website: "website",
  landing: "landing",
  email: "newsletter",
  proposal: "proposal",
  brand: "mybrand",
};

/**
 * WHAT THIS WIDGET NEEDS BEFORE A BUSINESS MAY USE IT.
 *
 * Optional, and **unset on every widget we ship today**. Brandon decides in
 * October which widgets sit behind which plan; when he does, that decision must
 * be a change to DATA — one row per widget in one table — and never a rebuild.
 * So the field exists now, empty, answered by the ONE entitlement seam
 * (`builder/tier.ts`), and the day the table arrives it fills this in.
 *
 *   product   the IA product whose data the widget reads — `oliver`, `spark`.
 *             A business that does not own it gets the OWNERSHIP sentence,
 *             which names the product.
 *   minTier   the lowest plan that carries it — "ARION Standard". A business
 *             below it gets the PLAN sentence, which names the plan.
 *
 * Never both meanings in one word: `reference_nav_visibility_semantics` is
 * explicit that "not on your plan" and "needs a product you do not have" are
 * two different answers and collapsing them is the defect.
 */
export interface WidgetRequires {
  product?: string;
  minTier?: string;
}

/**
 * ONE WIDGET, as a family declares it.
 *
 * It is the engine's `WidgetDef` with `adapters` replaced by `builders` (the
 * offer file's names) and `requires` added. `adapters` is COMPUTED from
 * `builders` by the family index, so a family never writes both and the two can
 * never disagree.
 */
export interface FamilyWidgetDef extends Omit<WidgetDef, "adapters"> {
  /** Which builders offer it, by the offer file's own names. Never empty. */
  builders: BuilderName[];
  /** `free`, `pro`, or `ia:<product>`. Absent means `free`. */
  tier?: WidgetTier;
  /** See WidgetRequires. Unset on everything we ship today. */
  requires?: WidgetRequires;
}

/** Draw one widget. `null` means "not mine" and the caller tries the next. */
export type FamilyRenderer = (w: Widget, ctx: RenderContext) => string;

/**
 * THE OTHER TWO SURFACES A WIDGET IS DRAWN ON. D-168 item 5b.
 *
 * A page is not the only place a family widget lands. The offer file gives the
 * NEWSLETTER twenty-one Elementor widgets and a LANDING page thirty, and each
 * of those surfaces has its own renderer with its own rules — a mailbox is
 * built out of tables with inline styles and no classes, a hosted landing page
 * is served by LUMEN from stored JSON. Before this, a family could only declare
 * the page renderer, so a Blockquote offered on the newsletter panel drew
 * *"This part needs a newer version of the builder to show."* on the canvas.
 *
 * The context is the adapter's own, imported as a TYPE so nothing at run time
 * crosses between a family folder and an adapter.
 */
export type FamilyEmailRenderer = (w: Widget, ctx: EmailRenderContext) => string;
export type FamilyLandingRenderer = (w: Widget, ctx: LandingRenderContext) => string;

/**
 * What a mailbox renderer is handed. Structural on purpose: `adapters/email`
 * owns the real shape and a family folder must not import an adapter.
 */
export interface EmailRenderContext {
  mode?: string;
  accent?: string;
  [key: string]: unknown;
}

/** …and the hosted landing page's, for the same reason. */
export interface LandingRenderContext {
  mode?: string;
  accent?: string;
  [key: string]: unknown;
}

/**
 * THE THIRD SURFACE: the My Brand studio. D-168 item 5b.
 *
 * The studio is an ABSOLUTE-PIXEL canvas — every object carries its own x, y, w
 * and h — so a widget does not "render" there, it becomes LAYERS.
 * `adapters/mybrand/insert.ts` turns a kind into them and its `default` branch
 * returns nothing at all, silently: the offer file gives My Brand ten Elementor
 * widgets, so without this door a family's tile is on that panel and pressing
 * it puts nothing on the canvas. Found by f1-words (§6.5).
 *
 * The adapter's own types, imported as TYPES so nothing at run time crosses
 * from a family folder into an adapter.
 */
export type FamilyStudioInsert = (
  doc: StudioCanvasDoc,
  brand: StudioBrandLite,
  opts: StudioInsertOptions,
) => StudioInsertResult;

/** The canvas being placed on. The adapter owns the real shape. */
export interface StudioCanvasDoc { width: number; height: number; [key: string]: unknown }
/** The brand kit the studio draws with. */
export interface StudioBrandLite { [key: string]: unknown }
/** How many, and where. */
export interface StudioInsertOptions { count?: number; [key: string]: unknown }
/** Layers to place, whether they go behind, and which one to select. */
export interface StudioInsertResult {
  layers: unknown[];
  behind?: boolean;
  selectId?: string | null;
}

/** What a `families/<name>/index.ts` exports, and the only thing it exports. */
export interface Family {
  defs: FamilyWidgetDef[];
  renderers: Record<string, FamilyRenderer>;
  /**
   * The mailbox half, beside the page half. Optional: a family that is offered
   * on no newsletter panel writes nothing, and the offer test is what says
   * whether it should have.
   *
   * A renderer here must be MAILBOX-SAFE — tables, inline styles, no flex, no
   * grid, no `class` — because `adapters/email/emailRender.ts` checks and
   * refuses. That check is not weakened for families.
   */
  emailRenderers?: Record<string, FamilyEmailRenderer>;
  /** The hosted landing page's half. Same rule, same reason. */
  landingRenderers?: Record<string, FamilyLandingRenderer>;
  /** The My Brand studio's half: a kind becomes canvas layers. */
  studioInserts?: Record<string, FamilyStudioInsert>;
}

/** An empty family — what a folder exports until its first widget lands. */
export const EMPTY_FAMILY: Family = { defs: [], renderers: {} };

/** The engine's def for a family's def: `builders` becomes `adapters`, once. */
export function toWidgetDef(d: FamilyWidgetDef): WidgetDef {
  const { builders, requires: _requires, ...rest } = d;
  return { ...rest, adapters: builders.map((b) => ADAPTER_OF[b]) };
}
