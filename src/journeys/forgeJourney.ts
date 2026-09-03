// forgeJourney.ts — page-by-page walkthrough, generated from the live FORGE nav.
//
// Added 2026-09-01. FORGE previously had no journey at all, so none of its
// pages could offer help. Steps come from pageGuide so coverage tracks the nav
// automatically; teaching copy lives in content/forgePages.ts.
import type { Journey } from "./types";
import { buildPageSteps } from "./pageGuide";
import { FORGE_PAGES } from "./content/forgePages";

export const FORGE_JOURNEY: Journey = {
  product: "forge",
  productLabel: "Custom Software",
  accent: "#5A7A8A",
  tourId: "journey_forge_tour_v1",
  interactiveId: "journey_forge_interactive_v1",
  tourTitle: "Custom Software — guided by your consultant",
  interactiveTitle: "Custom Software — do it with me",
  oneLiner: "Software built for one business",
  steps: buildPageSteps("forge", FORGE_PAGES),
};
