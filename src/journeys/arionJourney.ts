// arionJourney.ts — ARION (Digital Presence) page-by-page walkthrough.
//
// Brandon 2026-07-28: "Each navigation page does something specific... The
// walkthrough should go page by page... and then go in whatever order makes
// sense but probably top to bottom."
//
// The step list is GENERATED from the live ARION nav (pageGuide.ts) so every
// page a user can click is covered, in nav order, and the tour can never
// silently drift out of sync when nav changes. The teaching copy for each
// page is hand-written in content/arionPages.ts.
import type { Journey } from "./types";
import { buildPageSteps } from "./pageGuide";
import { ARION_PAGES } from "./content/arionPages";

export const ARION_JOURNEY: Journey = {
  product: "arion",
  productLabel: "Digital Presence",
  accent: "#2D9CDB",
  tourId: "journey_arion_tour_v2",
  interactiveId: "journey_arion_interactive_v2",
  tourTitle: "Digital Presence — guided by your consultant",
  interactiveTitle: "Digital Presence — do it with me",
  oneLiner: "Every page of your digital presence, top to bottom",
  steps: buildPageSteps("arion", ARION_PAGES),
};
