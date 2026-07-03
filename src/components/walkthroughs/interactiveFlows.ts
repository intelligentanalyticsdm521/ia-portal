// Interactive Walkthrough Flow Registry — #256 Part 2 (LOCKED 2026-07-03)
//
// Per Brandon 2026-07-03: "create your first X" flows that highlight the
// target, wait for the user to click/type, then advance. Chain across
// modal boundaries so the runner can walk the user through "click New
// Contact → wait for modal → walk them through the fields → save".
//
// Flow selection: only the truly-value-demonstrating flows. Not every
// page needs one. Start with 5: SPARK contact, SPARK campaign, OLIVER
// customer, OLIVER invoice, ARION keyword.
//
// The runner file: InteractiveWalkthroughRunner.tsx

import type { InteractiveFlow } from "./InteractiveWalkthroughRunner";

// ── SPARK: Create your first contact ─────────────────────────────────────
export const SPARK_CREATE_FIRST_CONTACT: InteractiveFlow = {
  id: "interactive_spark_first_contact",
  product: "spark",
  title: "Create your first contact",
  oneLiner: "Add someone to your CRM in under a minute",
  estimatedMinutes: 2,
  steps: [
    {
      route: "/app/spark/contacts",
      targetSelector: 'button[data-tour="new-contact"]',
      advance: "click",
      title: "Add your first contact",
      body: "Every marketing campaign, customer follow-up, and sales lead lives in your Contacts. Let's create your first one — click the highlighted button.",
      placement: "bottom",
    },
    {
      targetSelector: 'input[name="first_name"]',
      advance: "input",
      waitForMs: 1500,
      title: "Type their first name",
      body: "Just the first name — you can add more later. Real people, not test data — SPARK indexes contacts as you go.",
      placement: "right",
    },
    {
      targetSelector: 'input[name="email"]',
      advance: "input",
      title: "Add their email",
      body: "This is how SPARK matches them against email campaigns and companies. Case doesn't matter.",
      placement: "right",
    },
    {
      targetSelector: 'button[data-tour="save-contact"]',
      advance: "click",
      title: "Save the contact",
      body: "One click — SPARK auto-detects the company from the email domain and creates that too. You'll see them in the list immediately.",
      placement: "top",
    },
    {
      targetSelector: 'button[data-tour="new-contact"]',
      advance: "next",
      title: "That's it — you have your first contact.",
      body: "From here you can tag them, add them to a list, or start a campaign. When you're ready to import in bulk, use the CSV upload from this same page.",
      placement: "bottom",
    },
  ],
};

// ── SPARK: Create your first email campaign ──────────────────────────────
// Scaffold — full flow to be built out Saturday.
export const SPARK_CREATE_FIRST_CAMPAIGN: InteractiveFlow = {
  id: "interactive_spark_first_campaign",
  product: "spark",
  title: "Create your first email campaign",
  oneLiner: "From blank to sent in 5 minutes",
  estimatedMinutes: 5,
  steps: [
    {
      route: "/app/spark/campaigns",
      targetSelector: 'button[data-tour="new-campaign"]',
      advance: "click",
      title: "Start a new campaign",
      body: "Click the highlighted button to open the campaign composer.",
      placement: "bottom",
    },
    // TODO(Saturday): subject → recipients → body → test-send → send
  ],
};

// ── OLIVER: Create your first customer ───────────────────────────────────
export const OLIVER_CREATE_FIRST_CUSTOMER: InteractiveFlow = {
  id: "interactive_oliver_first_customer",
  product: "oliver",
  title: "Create your first customer",
  oneLiner: "Add someone you can bill in under a minute",
  estimatedMinutes: 2,
  steps: [
    {
      route: "/app/oliver/contacts",
      targetSelector: 'button[data-tour="new-customer"]',
      advance: "click",
      title: "Add your first OLIVER customer",
      body: "OLIVER customers are the people you're actively billing — quotes, invoices, subscriptions all attach to them. Click to start.",
      placement: "bottom",
    },
    // TODO(Saturday): name → email → phone → address → save
  ],
};

// ── OLIVER: Create your first invoice ────────────────────────────────────
export const OLIVER_CREATE_FIRST_INVOICE: InteractiveFlow = {
  id: "interactive_oliver_first_invoice",
  product: "oliver",
  title: "Create your first invoice",
  oneLiner: "Bill a customer end-to-end",
  estimatedMinutes: 5,
  steps: [
    // TODO(Saturday): pick customer → new invoice → line items → save → send
  ],
};

// ── ARION: Set your first SEO keyword ────────────────────────────────────
export const ARION_ADD_FIRST_KEYWORD: InteractiveFlow = {
  id: "interactive_arion_first_keyword",
  product: "arion",
  title: "Add your first SEO keyword",
  oneLiner: "Start tracking where you rank on Google",
  estimatedMinutes: 2,
  steps: [
    // TODO(Saturday): analytics → keywords → add → save
  ],
};

export const INTERACTIVE_FLOWS: InteractiveFlow[] = [
  SPARK_CREATE_FIRST_CONTACT,
  SPARK_CREATE_FIRST_CAMPAIGN,
  OLIVER_CREATE_FIRST_CUSTOMER,
  OLIVER_CREATE_FIRST_INVOICE,
  ARION_ADD_FIRST_KEYWORD,
];

/** Find a flow by id (helper for launcher UI). */
export function getInteractiveFlow(id: string): InteractiveFlow | undefined {
  return INTERACTIVE_FLOWS.find((f) => f.id === id);
}

/** Filter flows for a product page's Help menu. */
export function getInteractiveFlowsForProduct(product: InteractiveFlow["product"]): InteractiveFlow[] {
  return INTERACTIVE_FLOWS.filter((f) => f.product === product && f.steps.length > 0);
}
