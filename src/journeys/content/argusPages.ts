// argusPages.ts — teaching copy for the ARGUS nav.
//
// Added 2026-09-01. ARGUS had no authored pages. Where a page is genuinely a
// placeholder it SAYS so rather than being given invented teaching copy —
// filler is how a walkthrough loses the reader's trust.
import type { PageContentMap } from "../pageGuide";

export const ARGUS_PAGES: PageContentMap = {
  argus_health: {
    title: "Health — one score, and what moved it",
    body:
      "A composite read across your products: how the business is pulsing, how the platform itself is performing, and which way the trend and intelligence scores are pointing. Treat it as a dashboard light — it tells you where to look, not what to do.",
  },

  argus_trends: {
    title: "Trends — how the machinery is behaving over time",
    body:
      "Automation health, event flow, workflow performance and the chains where one product triggers another. This is where you notice something has been quietly failing for a fortnight, which is exactly the class of problem nobody notices from a single day's view.",
  },

  argus_cross_platform: {
    title: "Cross-Platform Intelligence — the questions no single product can answer",
    body:
      "Acquisition, marketing effectiveness, reputation impact, channel performance, customer lifetime value and business trajectory. Each needs data from more than one product at once — which is the entire reason these reports live here rather than inside ARION or SPARK.",
  },

  argus_workflows: {
    title: "Workflow & Automations — what runs without you",
    body:
      "The onboarding workflows and business rules, plus live runs as they happen. Open a run to see its timeline node by node: where it started, what it did, and where it stopped. When onboarding 'didn't work', this page is where the answer actually is.",
  },

  argus_coming: {
    title: "Agents — not yet, and deliberately so",
    body:
      "Autonomous agents doing work on your behalf under your guardrails. This page is a placeholder: the agents are being built product by product, and the guardrails matter more than the speed. Nothing here acts on your business today.",
  },
};
