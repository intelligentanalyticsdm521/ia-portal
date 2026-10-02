/**
 * families/f4-moving/index.ts — THINGS THAT MOVE ON THE PAGE.
 *
 * BUILDER_FULL_WIDGET_PLAN_2026-09-19 section C.1: one widget, one file in this
 * folder; this index is the only thing that knows them as a SET. Nothing in
 * here ever opens registry.ts, render.ts or another family's folder, which is
 * what makes ten agents on ten families safe.
 *
 * ── WHAT IS HERE, 2026-09-19 (wave 2) ─────────────────────────────────────
 * SIX widgets, all six Elementor's own, by Elementor's own titles:
 *
 *   Counter          counter            website · landing · proposal
 *   Progress Bar     progress_bar       website · landing · proposal
 *   Rating           star_rating        website · landing · newsletter · proposal
 *   Tabs             tabs               website · landing
 *   Accordion        accordion          website · landing
 *   Progress Tracker progress_tracker   website · landing            (Pro)
 *
 * Wave 1 added Progress Tracker and left the other five where they were, thin,
 * in `widgets/pageOnly.ts` and `widgets/icons.ts`, because taking a kind out of
 * `ATOM_KINDS` dropped it out of `RENDERED_KINDS` and a shared file was the
 * only way to fix that. Both blockers are gone: `render.ts` spreads
 * `FAMILY_RENDERED_KINDS` (wave 1) and `mergeWidgetDefs` lets a FAMILY
 * definition REPLACE a legacy one of the same kind, in the legacy one's own
 * place on the panel (b168/override). So wave 2 declares all five here, with
 * Elementor's Content AND Style panels, and the legacy definitions and
 * renderers are shadowed — dead code the lander deletes mechanically
 * (`shadowedLegacyKinds()`), never a second answer at run time.
 *
 * EVERY STORED PROP IS STILL READ. Not one kind id changed, and each file says
 * which old spellings it reads and why.
 *
 * ── WHAT IS STILL NOT HERE, AND WHY ───────────────────────────────────────
 *   off-canvas   A v4 NESTED element whose content is child containers, and a
 *                drawer that slides over the page has nothing to do on a
 *                canvas the author is editing. Not offered.
 *   countdown    The kind exists in `registry.ts` (`hidden`, email only) and
 *                the offer file puts Countdown on website and landing and NOT
 *                in the newsletter. Correcting it is a change to THAT def, in
 *                a file this family may not open. Still the handoff's item.
 *
 * ── WHAT MAY BE ADDED HERE ────────────────────────────────────────────────
 * An ELEMENTOR widget, by Elementor's own name, group, icon, panel sections,
 * control labels and defaults — or an IA widget named in
 * `test/fixtures/BUILDER_OFFERS_2026-09-19.json`. Nothing else, ever. If you
 * think something is missing, write it in the handoff; do not build it.
 * `test/builder-offers.test.mjs` fails the build on an extra tile.
 */
import type { Family } from "../types";
import { ACCORDION_DEF, renderAccordion } from "./accordion";
import { COUNTER_DEF, renderCounter } from "./counter";
import { PROGRESS_BAR_DEF, renderProgressBar } from "./progressBar";
import { PROGRESS_TRACKER_DEF, renderProgressTracker } from "./progressTracker";
import { RATING_DEF, emailRating, renderRating } from "./rating";
import { TABS_DEF, renderTabs } from "./tabs";

export const FAMILY: Family = {
  defs: [
    COUNTER_DEF,
    PROGRESS_BAR_DEF,
    RATING_DEF,
    TABS_DEF,
    ACCORDION_DEF,
    PROGRESS_TRACKER_DEF,
  ],
  renderers: {
    [COUNTER_DEF.kind]: renderCounter,
    [PROGRESS_BAR_DEF.kind]: renderProgressBar,
    [RATING_DEF.kind]: renderRating,
    [TABS_DEF.kind]: renderTabs,
    [ACCORDION_DEF.kind]: renderAccordion,
    [PROGRESS_TRACKER_DEF.kind]: renderProgressTracker,
  },
  /* THE MAILBOX HALF, for the ONE widget of this family a newsletter offers.
     The offer file gives the newsletter `rating` and explicitly withholds
     counter, progress, nested-tabs and nested-accordion, "because email cannot
     run them". A renderer for a widget no mailbox panel offers would be code
     nothing can reach. */
  emailRenderers: {
    [RATING_DEF.kind]: emailRating,
  },
};

export {
  ACCORDION_DEF, DEFAULT_STATES, openPanels, renderAccordion,
} from "./accordion";
export {
  COUNTER_DEF, SEPARATOR_CHARS, counterNote, counterNumber, renderCounter,
} from "./counter";
export {
  PROGRESS_BAR_DEF, PROGRESS_TYPES, PROGRESS_TYPE_OPTIONS, progressPercent, renderProgressBar,
} from "./progressBar";
export {
  PROGRESS_TRACKER_DEF, TRACKER_TYPES, renderProgressTracker, showsPercentage,
} from "./progressTracker";
export {
  RATING_DEF, RATING_ICONS, emailRating, ratingLabel, ratingMarks, ratingOf, renderRating,
} from "./rating";
export { TABS_DEF, TAB_DIRECTIONS, renderTabs, tabsFlow, tabsSideways } from "./tabs";
export { panelRows, type PanelRow } from "./parts";
