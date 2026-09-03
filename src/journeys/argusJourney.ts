// argusJourney.ts — page-by-page walkthrough, generated from the live ARGUS nav.
//
// Added 2026-09-01. ARGUS previously had no journey at all, so none of its
// pages could offer help. Steps come from pageGuide so coverage tracks the nav
// automatically; teaching copy lives in content/argusPages.ts.
import type { Journey } from "./types";
import { buildPageSteps } from "./pageGuide";
import { ARGUS_PAGES } from "./content/argusPages";

export const ARGUS_JOURNEY: Journey = {
  product: "argus",
  productLabel: "Intelligence",
  accent: "#7C3AED",
  tourId: "journey_argus_tour_v1",
  interactiveId: "journey_argus_interactive_v1",
  tourTitle: "Intelligence — guided by your consultant",
  interactiveTitle: "Intelligence — do it with me",
  oneLiner: "How your products behave together",
  steps: buildPageSteps("argus", ARGUS_PAGES),
};
