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
    title: "Workflows — what runs for you, and what needs you",
    body:
      "Each workflow starts with something that happens — a visitor writes in the chat on your website — and runs its steps. Choose Automatic, or Send me first to check anything before it goes to a customer. Needs you is where those wait, along with chat messages ARGUS couldn't place.",
  },

  // ARGUS → Your team (2026-10-08). The same page for each employee.
  argus_team_web: {
    title: "The web person — your blog, your social posts, your Google reviews",
    body:
      "Each job has its own switch, and every new job starts off and set to Send me first. Today says what it did this week; Needs you is what it left for you to approve, change or skip; What I know is what it read from Your business — only what you saved there.",
  },

  argus_team_marketer: {
    title: "The marketer — new inquiries, quiet customers, campaigns",
    body:
      "It answers new inquiries, finds customers you haven't seen for a while and writes the campaigns you ask for. A campaign it writes is a draft: approving it makes the draft in SPARK, and you send it from there.",
  },

  argus_team_office: {
    title: "The office administrator — quotes, unpaid invoices, crews",
    body:
      "It chases quotes and unpaid invoices, suggests who takes each job and asks for a review once a job is done. These switches are the same ones OLIVER uses, so changing one here changes it there.",
  },

  argus_coming: {
    title: "Agents — not yet, and deliberately so",
    body:
      "Autonomous agents doing work on your behalf under your guardrails. This page is a placeholder: the agents are being built product by product, and the guardrails matter more than the speed. Nothing here acts on your business today.",
  },
};
