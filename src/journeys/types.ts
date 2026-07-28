// journeys/types.ts — ONE journey per platform, TWO modes (Brandon 2026-07-27).
//
// THE DESIGN
// ----------
// "The goal of the tours [is] a self paced walkthrough… if we were to consult
//  someone and show them how to properly use this software as a consultant.
//  The interactive walkthrough is for people who want to stop, complete the
//  task themselves and move on… Each platform should have 1 tour and 1
//  interactive walkthrough. They should follow roughly the same steps and
//  each step you should be able to get to individually."
//
// So a Journey is the platform's CONSULTING CURRICULUM — ordered the way a
// consultant would actually teach it, not the way the nav happens to be
// sorted. Each step carries both modes:
//
//   explain{}  → TOUR mode. Self-paced. Why this matters, why it comes here.
//   doIt[]     → INTERACTIVE mode. Stop, do the task yourself, then continue.
//   keywords[] → ARGUS matching ("how do I create an email list").
//
// The tour and the walkthrough are GENERATED from the same journey, which is
// what makes "roughly the same steps" true by construction instead of by
// discipline. Every step has a stable id and can be launched individually in
// either mode — from the Tours menu, an engagement alert, or ARGUS chat.
//
// Not every step is a "do a task" step (checking your deliverability status
// isn't something you *do*), so the interactive walkthrough covers the
// doable subset. That's intentional, not a gap.
import type { TourDef, TourStep } from "../components/GuidedTour";
import type {
  InteractiveFlow,
  InteractiveStep,
} from "../components/walkthroughs/InteractiveWalkthroughRunner";

export type JourneyProduct = "spark" | "oliver" | "arion";

export interface JourneyStep {
  /** Stable, addressable id — e.g. "spark.contacts". Survives content edits;
   *  alerts and ARGUS deep-link to these, so never renumber them. */
  id: string;
  /** Short label for the step picker. */
  label: string;
  /** Grouping header in the step picker ("Get your people in"). */
  sectionLabel: string;
  /** Route to land on before the step renders. */
  route?: string;
  /** TOUR mode — the consultant explaining. */
  explain: {
    title: string;
    body: string;
    targetSelector?: string;
    placement?: TourStep["placement"];
    waitMs?: number;
  };
  /**
   * TOUR mode, continued — extra stops ON THE PAGE after landing there.
   *
   * Brandon 2026-07-28: "if we don't show them things like click this button
   * (WP Admin) to log into your website admin, or for SPARK this is your
   * email campaign open rate, then it's not good enough."
   *
   * The `explain` stop above orients you in the NAV; these teach the actual
   * screen — what each number means, which button does what. They inherit
   * the step's route, so they never navigate away mid-explanation.
   */
  onPage?: Array<{
    title: string;
    body: string;
    targetSelector?: string;
    placement?: TourStep["placement"];
    waitMs?: number;
  }>;

  /** INTERACTIVE mode — the click-by-click the user performs themselves.
   *  Omit for steps that are understanding, not doing. */
  doIt?: InteractiveStep[];
  /** Phrases ARGUS matches against ("create a list", "new email list"). */
  keywords?: string[];
}

export interface Journey {
  product: JourneyProduct;
  /** Plain-English product name, matching the icon rail. */
  productLabel: string;
  accent: string;
  /** Tour mode id — used for completion persistence. */
  tourId: string;
  /** Interactive mode id — used for completion persistence. */
  interactiveId: string;
  tourTitle: string;
  interactiveTitle: string;
  oneLiner: string;
  steps: JourneyStep[];
}

/** Steps that actually have a hands-on task attached. */
export function doableSteps(journey: Journey): JourneyStep[] {
  return journey.steps.filter((s) => (s.doIt?.length ?? 0) > 0);
}

/** Index of a step id, or 0 when not found / not supplied. */
function startIndex(steps: JourneyStep[], fromStepId?: string): number {
  if (!fromStepId) return 0;
  const i = steps.findIndex((s) => s.id === fromStepId);
  return i >= 0 ? i : 0;
}

/**
 * TOUR mode. Starting at `fromStepId` (or the beginning) and running to the
 * end — "get to a step individually" means jump there and carry on, not
 * show one orphaned step.
 */
export function journeyToTour(journey: Journey, fromStepId?: string): TourDef {
  const from = startIndex(journey.steps, fromStepId);
  const slice = journey.steps.slice(from);
  return {
    id: fromStepId ? `${journey.tourId}:${fromStepId}` : journey.tourId,
    title: journey.tourTitle,
    accent: journey.accent,
    // Each journey step contributes its nav-level stop, then any on-page
    // stops — which is what turns a 12-stop skim into a real 5-8 minute
    // walkthrough of the actual screens.
    steps: slice.flatMap((s): TourStep[] => [
      {
        title: s.explain.title,
        body: s.explain.body,
        sectionLabel: s.sectionLabel,
        targetSelector: s.explain.targetSelector,
        placement: s.explain.placement,
        route: s.route,
        waitMs: s.explain.waitMs,
      },
      ...(s.onPage || []).map((o): TourStep => ({
        title: o.title,
        body: o.body,
        sectionLabel: s.sectionLabel,
        targetSelector: o.targetSelector,
        placement: o.placement,
        route: s.route,
        waitMs: o.waitMs,
      })),
    ]),
  };
}

/**
 * INTERACTIVE mode. Flattens the doIt sub-steps of every doable journey step
 * from `fromStepId` onward. Each sub-step inherits its parent's route when it
 * doesn't set one (the first sub-step navigates; the rest usually target a
 * modal that just opened).
 */
export function journeyToInteractive(
  journey: Journey,
  fromStepId?: string,
): InteractiveFlow {
  const doable = doableSteps(journey);
  const from = startIndex(doable, fromStepId);
  const slice = doable.slice(from);
  const steps: InteractiveStep[] = [];
  for (const parent of slice) {
    (parent.doIt || []).forEach((sub, i) => {
      steps.push({ ...sub, route: sub.route ?? (i === 0 ? parent.route : undefined) });
    });
  }
  return {
    id: fromStepId ? `${journey.interactiveId}:${fromStepId}` : journey.interactiveId,
    product: journey.product,
    title: journey.interactiveTitle,
    oneLiner: journey.oneLiner,
    estimatedMinutes: Math.max(2, Math.round(steps.length * 0.6)),
    steps,
  };
}

/** Find a journey step anywhere in a set of journeys, by id. */
export function findJourneyStep(
  journeys: Journey[],
  stepId: string,
): { journey: Journey; step: JourneyStep } | null {
  for (const j of journeys) {
    const step = j.steps.find((s) => s.id === stepId);
    if (step) return { journey: j, step };
  }
  return null;
}
