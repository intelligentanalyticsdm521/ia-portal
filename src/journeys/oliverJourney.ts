// oliverJourney.ts — Invoicing & Administration page-by-page walkthrough.
//
// Steps are GENERATED from the live OLIVER nav (pageGuide.ts) so every page a
// user can click is covered, in nav order, and can never drift out of sync.
// Teaching copy per page lives in content/oliverPages.ts.
import type { Journey } from "./types";
import { buildPageSteps } from "./pageGuide";
import { OLIVER_PAGES } from "./content/oliverPages";

export const OLIVER_JOURNEY: Journey = {
  product: "oliver",
  productLabel: "Invoicing & Administration",
  accent: "#FEC82C",
  tourId: "journey_oliver_tour_v2",
  interactiveId: "journey_oliver_interactive_v2",
  tourTitle: "Invoicing & Administration — guided by your consultant",
  interactiveTitle: "Invoicing & Administration — do it with me",
  oneLiner: "Every page of your operation, top to bottom",
  steps: buildPageSteps("oliver", OLIVER_PAGES),
};
