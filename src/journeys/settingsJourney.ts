// settingsJourney.ts — page-by-page walkthrough of the Settings nav.
//
// Added 2026-09-01, fixing a hole the first pass missed. Settings is its OWN
// nav (SETTINGS_NAV), not part of any product's, and journeys are built per
// product — so pages like Sender Setup, API Keys and Period Close had authored
// teaching copy that could never become a journey step. The result: "Explain
// this page" did not appear on exactly the technical pages that need it most.
//
// Content is not duplicated. Teaching copy lives with its product
// (spark_sender_domains in sparkPages, stella_settings_* in stellaPages, and so
// on) and is merged here purely for lookup, because buildPageSteps walks ONE
// nav against ONE content map. A key belongs to exactly one nav, so no page can
// appear in two journeys.
import type { Journey } from "./types";
import { buildPageSteps } from "./pageGuide";
import { ARION_PAGES } from "./content/arionPages";
import { OLIVER_PAGES } from "./content/oliverPages";
import { SPARK_PAGES } from "./content/sparkPages";
import { STELLA_PAGES } from "./content/stellaPages";

const SETTINGS_PAGES = {
  ...ARION_PAGES,
  ...OLIVER_PAGES,
  ...SPARK_PAGES,
  ...STELLA_PAGES,
};

export const SETTINGS_JOURNEY: Journey = {
  product: "settings",
  productLabel: "Settings",
  accent: "#5A7A8A",
  tourId: "journey_settings_tour_v1",
  interactiveId: "journey_settings_interactive_v1",
  tourTitle: "Settings — guided by your consultant",
  interactiveTitle: "Settings — do it with me",
  oneLiner: "The setup pages, explained in plain English",
  steps: buildPageSteps("settings", SETTINGS_PAGES),
};
