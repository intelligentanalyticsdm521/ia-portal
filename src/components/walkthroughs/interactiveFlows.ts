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
      targetSelector: 'input[data-tour="contact-first-name"]',
      advance: "input",
      waitForMs: 1500,
      title: "Type their first name",
      body: "Just the first name — you can add more later. Real people, not test data — SPARK indexes contacts as you go.",
      placement: "right",
    },
    {
      targetSelector: 'input[data-tour="contact-email"]',
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
// Flow: New campaign button → pick Email channel → name → subject → body → save.
// The channel picker + compose form live inside SparkCampaignComposerModal;
// waitForMs: 1500 gives the modal open/step animations time to settle before
// the runner polls for the next target.
export const SPARK_CREATE_FIRST_CAMPAIGN: InteractiveFlow = {
  id: "interactive_spark_first_campaign",
  product: "spark",
  title: "Create your first email campaign",
  oneLiner: "From blank to sent in 5 minutes",
  estimatedMinutes: 5,
  steps: [
    {
      route: "/app/services/spark_campaigns",
      targetSelector: 'button[data-tour="new-campaign"]',
      advance: "click",
      title: "Start a new campaign",
      body: "Every email or SMS blast starts here. Click New campaign to open the composer.",
      placement: "bottom",
    },
    {
      targetSelector: 'button[data-tour="campaign-channel-email"]',
      advance: "click",
      waitForMs: 1500,
      title: "Pick the Email channel",
      body: "Email campaigns support HTML, merge tags, open/click tracking, and CTA buttons. SMS is short and fast; today we'll send an email.",
      placement: "right",
    },
    {
      targetSelector: 'input[data-tour="campaign-name"]',
      advance: "input",
      waitForMs: 1500,
      title: "Name this campaign",
      body: "Internal only — customers never see it. Something like \"Q3 launch\" or \"July newsletter\" makes it easy to find later.",
      placement: "right",
    },
    {
      targetSelector: 'input[data-tour="campaign-subject"]',
      advance: "input",
      title: "Write a subject line",
      body: "This is the first thing your recipients see. Type {{ to drop in a merge tag like the recipient's first name — it fills automatically per person.",
      placement: "right",
    },
    {
      targetSelector: 'select[data-tour="campaign-sender"]',
      advance: "next",
      title: "Confirm the From address",
      body: "SPARK prefills your tenant's default sender, or the IA shared noreply if you haven't added your own yet. Click Next when it looks right.",
      placement: "bottom",
    },
    {
      targetSelector: 'button[data-tour="save-campaign"]',
      advance: "click",
      title: "Save as draft",
      body: "One click and this campaign is stored. From the list you can re-open the draft to pick recipients, preview, and hit Send — every step is reversible until you actually send.",
      placement: "top",
    },
  ],
};

// ── OLIVER: Create your first customer ───────────────────────────────────
// Flow: New customer → first name → last name → email → save. Mirrors the
// SPARK contact flow but on the OLIVER contacts (customers) page — the
// "customer" here is the OLIVER billable-entity concept.
export const OLIVER_CREATE_FIRST_CUSTOMER: InteractiveFlow = {
  id: "interactive_oliver_first_customer",
  product: "oliver",
  title: "Create your first customer",
  oneLiner: "Add someone you can bill in under a minute",
  estimatedMinutes: 2,
  steps: [
    {
      route: "/app/services/oliver_contacts",
      targetSelector: 'button[data-tour="new-customer"]',
      advance: "click",
      title: "Add your first OLIVER customer",
      body: "OLIVER customers are the people you're actively billing — quotes, invoices, subscriptions all attach to them. Click to open the new-customer form.",
      placement: "bottom",
    },
    {
      targetSelector: 'input[data-tour="customer-first-name"]',
      advance: "input",
      waitForMs: 1500,
      title: "Type their first name",
      body: "Required — use a real person's name, not test data. You can always edit later from the customer card.",
      placement: "right",
    },
    {
      targetSelector: 'input[data-tour="customer-last-name"]',
      advance: "input",
      title: "Last name",
      body: "Also required. If you're billing a company (not a person), use the contact person's last name here and put the company name below.",
      placement: "right",
    },
    {
      targetSelector: 'input[data-tour="customer-email"]',
      advance: "input",
      title: "Add their email",
      body: "Optional but strongly recommended — invoices, quotes, and portal invites all send to this address. Case doesn't matter.",
      placement: "right",
    },
    {
      targetSelector: 'button[data-tour="save-customer"]',
      advance: "click",
      title: "Save the customer",
      body: "That's it — the customer is now in your OLIVER database. Their card shows lifetime value, outstanding balance, and every job/invoice/subscription attached.",
      placement: "top",
    },
  ],
};

// ── OLIVER: Create your first invoice ────────────────────────────────────
// Flow: Create invoice → pick customer → add description → set price → save.
// The InvoiceCreateForm renders inline in the page (not a modal) — waitForMs
// still helps because the form is conditional (showCreate) and mounts after
// the button click.
export const OLIVER_CREATE_FIRST_INVOICE: InteractiveFlow = {
  id: "interactive_oliver_first_invoice",
  product: "oliver",
  title: "Create your first invoice",
  oneLiner: "Bill a customer end-to-end",
  estimatedMinutes: 5,
  steps: [
    {
      route: "/app/services/oliver_invoices",
      targetSelector: 'button[data-tour="new-invoice"]',
      advance: "click",
      title: "Create an invoice",
      body: "Invoices generate a hosted Stripe Pay Now link the customer can click to pay by card or ACH. Click to open the invoice builder.",
      placement: "bottom",
    },
    {
      targetSelector: 'select[data-tour="invoice-customer"]',
      advance: "input",
      waitForMs: 1500,
      title: "Pick who you're billing",
      body: "Every invoice is attached to one customer. If they're not in the list yet, cancel and add them via + New customer first — invoices need contact + email to send.",
      placement: "right",
    },
    {
      targetSelector: 'input[data-tour="invoice-line-description"]',
      advance: "input",
      title: "Describe what you're billing for",
      body: "One line per thing. This shows up on the customer's invoice PDF and Stripe receipt — keep it clear (\"Website redesign, June 2026\").",
      placement: "right",
    },
    {
      targetSelector: 'input[data-tour="invoice-line-price"]',
      advance: "input",
      title: "Set the unit price",
      body: "Dollars — no $ sign needed. Combine with quantity for line totals. Add more lines from the + Add line item link below.",
      placement: "right",
    },
    {
      targetSelector: 'button[data-tour="save-invoice"]',
      advance: "click",
      title: "Save as draft",
      body: "Creates the invoice in draft mode — nothing sends yet. From the list you can preview, add a due date, apply a coupon, then hit Send invoice to fire off the Stripe link.",
      placement: "top",
    },
  ],
};

// ── ARION: Set your first SEO keyword ────────────────────────────────────
// Flow: SEO Keywords page → paste keyword → add to tracking. The paste-many
// input is the fastest path to first tracked keyword; keyword research is
// deferred to a separate flow to keep this one short.
export const ARION_ADD_FIRST_KEYWORD: InteractiveFlow = {
  id: "interactive_arion_first_keyword",
  product: "arion",
  title: "Add your first SEO keyword",
  oneLiner: "Start tracking where you rank on Google",
  estimatedMinutes: 2,
  steps: [
    {
      route: "/app/services/arion_seo_keywords",
      targetSelector: 'textarea[data-tour="keyword-paste"]',
      advance: "input",
      title: "Type a keyword you want to rank for",
      body: "Something a customer would search Google for to find you — e.g. \"mobile detailing Des Moines\" or \"emergency plumber Charlotte\". Location + service is the sweet spot.",
      placement: "right",
    },
    {
      targetSelector: 'button[data-tour="add-keyword"]',
      advance: "click",
      title: "Add it to tracking",
      body: "This registers the keyword in your SE Ranking project — starting tomorrow, ARION checks where your site ranks for it on Google + Bing every day.",
      placement: "left",
    },
    {
      targetSelector: 'input[data-tour="keyword-seed"]',
      advance: "input",
      waitForMs: 1500,
      title: "Want more? Try keyword research",
      body: "Type a seed keyword here to get 25 related, long-tail, and question variants — each with monthly volume and difficulty. Powered by SE Ranking's search database.",
      placement: "bottom",
    },
    {
      targetSelector: 'button[data-tour="research-keyword"]',
      advance: "next",
      title: "Run the research",
      body: "The Research button fires off a query and returns four tabs of ideas (Similar, Related, Long-tail, Questions). Pick the ones you want and add them to tracking in one shot. Click Next to finish — you're all set.",
      placement: "bottom",
    },
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
