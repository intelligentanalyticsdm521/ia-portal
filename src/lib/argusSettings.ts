// argusSettings.ts — what Left rail → Settings → ARGUS shows.
//
// 2026-10-08. Settings → ARGUS was one "Coming soon" page (the argus_coming
// placeholder) while ARGUS itself was live: Your team, Workflows and the
// ARGUS data plan all worked. The placeholder is replaced by this page, which
// sends the owner to each of them with one plain sentence; the old
// /app/services/argus_coming route redirects here.
//
// PURE: no React, no MSAL, no import.meta, so test/argus-settings.test.mjs
// imports it directly. Every word an owner reads on the page lives here.
import { EMPLOYEE_KEYS, EMPLOYEE_NAME, employeeRoute } from "./team";
import { WORKFLOWS_ROUTE, NEEDS_YOU_ROUTE } from "./chatWorkflows";

/** The page's own key and route (/app/services/argus_settings). */
export const ARGUS_SETTINGS_KEY = "argus_settings";
export const ARGUS_SETTINGS_ROUTE = `/app/services/${ARGUS_SETTINGS_KEY}`;
/** The old placeholder's key; ServiceRouter sends it to ARGUS_SETTINGS_ROUTE. */
export const ARGUS_SETTINGS_OLD_KEY = "argus_coming";
export const ARGUS_DATA_PLAN_ROUTE = "/app/settings/argus-data-plan";

export const ARGUS_SETTINGS_TITLE = "ARGUS settings";
export const ARGUS_SETTINGS_INTRO = "Where you set up the people who work for you, the work they run, and the credits they use.";

export interface ArgusSettingsLink {
  label: string;
  to: string;
  sentence: string;
  /** Extra links shown under the sentence (Your team: one per person). */
  more?: ReadonlyArray<{ label: string; to: string }>;
}

export const ARGUS_SETTINGS_LINKS: ReadonlyArray<ArgusSettingsLink> = Object.freeze([
  {
    label: "Your team",
    to: employeeRoute("web"),
    sentence: "One page for each person on your team, where you switch each of their jobs on or off and choose whether it waits for you first.",
    more: EMPLOYEE_KEYS.map((k) => ({ label: EMPLOYEE_NAME[k], to: employeeRoute(k) })),
  },
  {
    label: "Workflows",
    to: WORKFLOWS_ROUTE,
    sentence: "Every process that runs for your business: what starts it, whether it runs automatically or waits for you, and what it did.",
    more: [
      { label: "All", to: WORKFLOWS_ROUTE },
      { label: "Needs you", to: NEEDS_YOU_ROUTE },
      { label: "History", to: `${WORKFLOWS_ROUTE}?tab=history` },
    ],
  },
  {
    label: "ARGUS data plan",
    to: ARGUS_DATA_PLAN_ROUTE,
    sentence: "What credits cost, how many you have left, and the packs you can add when you run low.",
  },
]);
