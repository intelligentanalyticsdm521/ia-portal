// PageHelpButton — "Explain this page", on every page, automatically.
//
// Brandon 2026-09-01: "I want every step of every process to be easy… every
// technical thing should have a little info tag for instructions or a need-help
// that opens instructions, or if it's already covered in the tours it should
// open to that part of the tour."
//
// The teaching content already exists: journeys/pageGuide.ts generates one
// journey step per nav page from SUB_NAV_CONFIGS, and walkthroughLaunchBus can
// already start help anywhere. What was missing was a way to ASK for it from
// the page you are stuck on — help lived only behind the header's Learn menu,
// which means you had to already know the tour covered your problem.
//
// This resolves the CURRENT route against the journeys and offers that exact
// step. Deliberately route-matched rather than hand-wired per page, for the
// same reason pageGuide generates from the nav: a hand-kept list silently
// drifts, and the pages that drift first are the new ones nobody has explained
// yet.
//
// When a page has no authored content it renders NOTHING rather than a button
// that opens a generic tour — offering help that does not answer the question
// is worse than offering none, and it hides the gap from missingPageContent().
/**
 * The button's classes, exported for MEASUREMENT rather than reuse:
 * scripts/dev/measure-tap-targets.mjs reads this constant out of this file so
 * the thing it measures is the thing that ships, and Tailwind emits the class
 * because it appears in a scanned source file.
 *
 * October pull-forward P4.1, 2026-09-07 — `max-md:min-h-[40px]` and the wider
 * padding are the phone tap target. Small pack 2 raised twelve surfaces and
 * left this one at 28px, which is the smallest control on most pages and the
 * one somebody reaches for precisely when they are stuck. Desktop is
 * unchanged and the measuring script asserts it is still 28px at 1440x900.
 */
export const HELP_BUTTON_CLASS =
  "inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1 " +
  "text-[12px] font-medium text-slate-600 transition-colors " +
  "max-md:min-h-[40px] max-md:px-3 " +
  "hover:border-slate-400 hover:text-slate-900 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500";

import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { HelpCircle, MousePointerClick } from "lucide-react";
import { ALL_JOURNEYS } from "../journeys";
import type { JourneyStep } from "../journeys/types";
import { launchJourneyStep } from "./walkthroughs/walkthroughLaunchBus";

/** The journey step whose route matches this path, if one is authored. */
export function findStepForPath(pathname: string): JourneyStep | null {
  let best: JourneyStep | null = null;
  for (const journey of ALL_JOURNEYS) {
    for (const step of journey.steps) {
      if (!step.route) continue;
      // Longest matching route wins, so /a/b/c prefers its own step over /a/b.
      const isMatch = pathname === step.route || pathname.startsWith(step.route + "/");
      if (!isMatch) continue;
      if (!best || (step.route.length > (best.route?.length ?? 0))) best = step;
    }
  }
  return best;
}

export function PageHelpButton({ compact = false }: { compact?: boolean }) {
  const { pathname } = useLocation();
  const step = useMemo(() => findStepForPath(pathname), [pathname]);
  if (!step) return null;

  const hasDoIt = Array.isArray(step.doIt) && step.doIt.length > 0;

  return (
    // data-app-chrome: the app around the page, not the page. STELLA's print
    // rules hide everything carrying it so a printed financial statement is the
    // statement and nothing else (walk row S2). Inert everywhere else.
    <div data-app-chrome className="flex items-center gap-1.5 max-md:flex-wrap">
      <button
        type="button"
        onClick={() => launchJourneyStep(step.id, "explain")}
        title={`Explain this page: ${step.label}`}
        className={HELP_BUTTON_CLASS}
      >
        <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
        Explain this page
      </button>
      {hasDoIt && !compact && (
        <button
          type="button"
          onClick={() => launchJourneyStep(step.id, "doIt")}
          title={`Do it with me: ${step.label}`}
          className={HELP_BUTTON_CLASS}
        >
          <MousePointerClick className="h-3.5 w-3.5" aria-hidden="true" />
          Do it with me
        </button>
      )}
    </div>
  );
}

export default PageHelpButton;
