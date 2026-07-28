// sparkJourney.ts — CRM & Marketing page-by-page walkthrough.
//
// Steps are GENERATED from the live SPARK nav (pageGuide.ts) so every page a
// user can click is covered, in nav order, and can never drift out of sync.
// Teaching copy per page lives in content/sparkPages.ts.
import type { Journey } from "./types";
import { buildPageSteps } from "./pageGuide";
import { SPARK_PAGES } from "./content/sparkPages";

export const SPARK_JOURNEY: Journey = {
  product: "spark",
  productLabel: "CRM & Marketing",
  accent: "#EF6C33",
  tourId: "journey_spark_tour_v2",
  interactiveId: "journey_spark_interactive_v2",
  tourTitle: "CRM & Marketing — guided by your consultant",
  interactiveTitle: "CRM & Marketing — do it with me",
  oneLiner: "Every page of your CRM and marketing, top to bottom",
  steps: buildPageSteps("spark", SPARK_PAGES),
};
