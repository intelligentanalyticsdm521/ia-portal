/**
 * families/f4-moving/index.ts - THINGS THAT MOVE ON THE PAGE.
 *
 * nested-tabs, nested-accordion, off-canvas, progress-tracker, counter,
 * progress, countdown, rating. All need the published page's JavaScript and a
 * no-JS fallback: one JS bundle, one test harness.
 *
 * BUILDER_FULL_WIDGET_PLAN_2026-09-19 section C.1: one widget, one file in
 * this folder; this index is the only thing that knows them as a SET. Nothing
 * in here ever opens registry.ts, render.ts or another family's folder, which
 * is what makes ten agents on ten families safe.
 *
 * -- WHAT MAY BE ADDED HERE ------------------------------------------------
 * An ELEMENTOR widget, by Elementor's own name, group, icon, panel sections,
 * control labels and defaults - or an IA widget named in
 * test/fixtures/BUILDER_OFFERS_2026-09-19.json. Nothing else, ever. If you
 * think something is missing, write it in the handoff; do not build it.
 * test/builder-offers.test.mjs fails the build on an extra tile.
 *
 * -- HOW TO ADD ONE --------------------------------------------------------
 *   1. f4-moving/<widget>.ts exports <WIDGET>_DEF: FamilyWidgetDef and
 *      render<Widget>(w, ctx): string.
 *   2. import both here; the def goes in `defs`, the renderer in `renderers`
 *      under the def's own `kind`.
 *   3. npm test -- test/families-f4-moving.test.mjs
 */
import { EMPTY_FAMILY, type Family } from "../types";

export const FAMILY: Family = {
  defs: [...EMPTY_FAMILY.defs],
  renderers: { ...EMPTY_FAMILY.renderers },
};
