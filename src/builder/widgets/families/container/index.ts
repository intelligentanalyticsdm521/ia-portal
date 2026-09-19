/**
 * families/container/index.ts - THE BOX AND THE SEAMS.
 *
 * Container - flex AND grid - shape dividers, background video / slideshow /
 * gradient, and the responsive plumbing every other family uses. Everything
 * else on a page sits inside one of these.
 *
 * BUILDER_FULL_WIDGET_PLAN_2026-09-19 section C.1: one widget, one file in
 * this folder; this index is the only thing that knows them as a SET. Nothing
 * in here ever opens registry.ts, render.ts or another family's folder, which
 * is what makes ten agents on ten families safe.
 *
 * -- WHY `defs` AND `renderers` ARE EMPTY, AND MUST STAY EMPTY --------------
 * A container is NOT a widget. It is the engine's own node - the one thing
 * that holds children - so:
 *
 *   · its TILE is declared in `registry.ts` beside the Grid and Inner Section
 *     presets, because `registry.presetFor` is what turns a Layout tile into a
 *     box and a def in here could not reach it;
 *   · its RENDERER is `render.ts renderContainer`, which runs BEFORE any
 *     family is asked (`renderWidget` returns on `isContainer` in its first
 *     line) and is recursive, which a `(w, ctx) => string` family renderer
 *     cannot be.
 *
 * Declaring either here would be a SECOND container - a tile that inserts a
 * different node, or a renderer nothing ever calls. One mechanism per concern.
 * So this folder owns the container's PANEL and its CONTROL TABLE, and says so
 * out loud rather than leaving the next agent to wonder where the box went.
 *
 * -- WHAT MAY BE ADDED HERE ------------------------------------------------
 * An ELEMENTOR widget, by Elementor's own name, group, icon, panel sections,
 * control labels and defaults - or an IA widget named in
 * test/fixtures/BUILDER_OFFERS_2026-09-19.json. Nothing else, ever. If you
 * think something is missing, write it in the handoff; do not build it.
 * test/builder-offers.test.mjs fails the build on an extra tile.
 */
import { EMPTY_FAMILY, type Family } from "../types";

export const FAMILY: Family = {
  defs: [...EMPTY_FAMILY.defs],
  renderers: { ...EMPTY_FAMILY.renderers },
};

/* THE CONTAINER'S PANEL, written down once - see controls.ts for why. The
   Inspector's three container groups are drawn from this table and the family
   test pins every settings key in it against the machine file. */
export * from "./controls";
export { default as CONTAINER_CONTROL_TABLE } from "./controls";
