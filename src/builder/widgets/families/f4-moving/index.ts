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
 * -- WHAT IS HERE, AND WHAT IS NOT, 2026-09-19 ------------------------------
 * ONE widget: **Progress Tracker**. The other seven are accounted for, each
 * for a reason that is a fact about the code and not a preference:
 *
 *   counter, progress (Progress Bar), rating, Tabs, Accordion
 *       ALREADY BUILT, by their Elementor names, with their Elementor
 *       controls — `widgets/pageOnly.ts` (counter, progress_bar, tabs,
 *       accordion) and `widgets/icons.ts` (star_rating, labelled "Rating").
 *       The plan says move them into this folder. They are NOT moved, because
 *       `render.ts`'s `RENDERED_KINDS` is `[...engine switch, ...ATOM_KINDS,
 *       container, the three records]` and does NOT spread
 *       `FAMILY_RENDERED_KINDS`. Take `counter` out of `ATOM_KINDS` and it
 *       leaves `RENDERED_KINDS`, and `test/builder-engine.test.mjs` goes red
 *       with "offered but not rendered" — and `render.ts` is the one file this
 *       family may not open. One line there fixes it for all ten families; it
 *       is written up in D168_HANDOFF_2026-09-19.md under "Land: do this".
 *
 *   off-canvas, and Elementor's REAL nested-tabs / nested-accordion
 *       CANNOT BE DECLARED HERE AT ALL. All three are Elementor v4 *nested*
 *       elements: their content is child containers, carried in the node's
 *       `elements`. A `FamilyWidgetDef` declares a flat widget with controls;
 *       `model.ts` gives children to `container` and to nothing else
 *       (`isContainer` checks `kind === CONTAINER_KIND && Array.isArray(
 *       children)`). A tile that can never hold anything is a tile that does
 *       nothing, so it is not offered. Also in the handoff.
 *
 *   countdown
 *       The kind already exists — `registry.ts`, `hidden: true`, email only —
 *       and the offer file puts Countdown on the website and landing panels
 *       and explicitly NOT in the newsletter. Correcting that is a change to
 *       that def in `registry.ts`, which this family may not open. Handoff.
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
import type { Family } from "../types";
import { PROGRESS_TRACKER_DEF, renderProgressTracker } from "./progressTracker";

export const FAMILY: Family = {
  defs: [PROGRESS_TRACKER_DEF],
  renderers: { [PROGRESS_TRACKER_DEF.kind]: renderProgressTracker },
};

export { PROGRESS_TRACKER_DEF, renderProgressTracker, showsPercentage, TRACKER_TYPES } from "./progressTracker";
