/**
 * families/f6-money/index.ts - MONEY.
 *
 * price-table, price-list, product cards, product line items, totals, IA
 * OLIVER Invoice. All read the OLIVER catalogue and all touch tax, discount
 * and cadence. Nobody else may.
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
 *   1. f6-money/<widget>.ts exports <WIDGET>_DEF: FamilyWidgetDef and
 *      render<Widget>(w, ctx): string.
 *   2. import both here; the def goes in `defs`, the renderer in `renderers`
 *      under the def's own `kind`.
 *   3. npm test -- test/families-f6-money.test.mjs
 */
import { EMPTY_FAMILY, type Family } from "../types";

export const FAMILY: Family = {
  defs: [...EMPTY_FAMILY.defs],
  renderers: { ...EMPTY_FAMILY.renderers },
};
