// consultingJourney.ts — page-by-page walkthrough, generated from the live CONSULTING nav.
//
// Added 2026-09-01. CONSULTING previously had no journey at all, so none of its
// pages could offer help. Steps come from pageGuide so coverage tracks the nav
// automatically; teaching copy lives in content/consultingPages.ts.
import type { Journey } from "./types";
import { buildPageSteps } from "./pageGuide";
import { CONSULTING_PAGES } from "./content/consultingPages";

export const CONSULTING_JOURNEY: Journey = {
  product: "consulting",
  productLabel: "Consulting",
  accent: "#1A7DB5",
  tourId: "journey_consulting_tour_v1",
  interactiveId: "journey_consulting_interactive_v1",
  tourTitle: "Consulting — guided by your consultant",
  interactiveTitle: "Consulting — do it with me",
  oneLiner: "Everything we're building with you, page by page",
  steps: buildPageSteps("consulting", CONSULTING_PAGES),
};
