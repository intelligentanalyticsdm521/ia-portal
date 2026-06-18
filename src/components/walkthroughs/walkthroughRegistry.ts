// Walkthrough registry — every "here's what this does + create your first X"
// walkthrough lives here. Per Brandon 2026-06-19: the goal is NOT a guided
// joyride pointing at UI elements. It's a modal that EXPLAINS the feature in
// plain English, then sends the user to the page where they create their
// first one.
//
// Pattern of every walkthrough:
//   1. Title + 1-sentence "what is this" elevator pitch
//   2. 3-5 plain-language explanation cards (no code, no jargon)
//   3. "Create your first X" CTA → routes to the actual page
//   4. Optional: "Skip + come back later"
//
// Walkthroughs are re-runnable from Settings → Walkthroughs at any time.

export type WalkthroughStepKind = "intro" | "explain" | "cta";

export interface WalkthroughStep {
  kind: WalkthroughStepKind;
  title: string;
  body: string;
  ctaLabel?: string;
  ctaPath?: string;
}

export interface Walkthrough {
  id: string;
  product: "arion" | "spark" | "oliver" | "consulting" | "platform";
  title: string;
  oneLiner: string;
  estimatedMinutes: number;
  steps: WalkthroughStep[];
}

export const WALKTHROUGHS: Walkthrough[] = [
  // ─── OLIVER ────────────────────────────────────────────────────────────
  {
    id: "oliver-customers",
    product: "oliver",
    title: "Customers in OLIVER",
    oneLiner: "Who you're serving — every contact you're billing, scheduling, or sending proposals to.",
    estimatedMinutes: 3,
    steps: [
      {
        kind: "intro",
        title: "What's a customer?",
        body: "An OLIVER customer is anyone you've decided is ready to be billed. Until you mark them as an OLIVER customer (or your lifecycle settings auto-promote them), they live in SPARK as a lead. This keeps your OLIVER list focused on real work.",
      },
      {
        kind: "explain",
        title: "How they get into OLIVER",
        body: "Three paths: (1) Your customer signup form, (2) You add them manually, (3) Lifecycle auto-promotes a Prospect from SPARK based on the rule you picked in onboarding.",
      },
      {
        kind: "explain",
        title: "What you can do with them",
        body: "Send proposals, send invoices, take payments, schedule jobs, message back and forth in their portal. Everything lives on the customer card.",
      },
      {
        kind: "cta",
        title: "Create your first customer",
        body: "Open the Customers page and click + New Customer. Fill in name + email at minimum — everything else is optional.",
        ctaLabel: "Go to Customers",
        ctaPath: "/app/oliver/contacts",
      },
    ],
  },
  {
    id: "oliver-jobs",
    product: "oliver",
    title: "Jobs in OLIVER",
    oneLiner: "Work you're doing for a customer — one-off jobs, recurring jobs, or jobs scheduled from a booking.",
    estimatedMinutes: 3,
    steps: [
      {
        kind: "intro",
        title: "What's a job?",
        body: "A job is a unit of work for a customer with a status, optional schedule, optional worker assignment, optional line items. It can become an invoice, generate a quote, or just track that the work happened.",
      },
      {
        kind: "explain",
        title: "Job board buckets",
        body: "Jobs flow through 5 buckets: Inbox → Scheduled → In Progress → Awaiting Payment → Closed. You drag cards between buckets on the Job Board.",
      },
      {
        kind: "explain",
        title: "Workers + assignment",
        body: "Assign a worker (or multiple) to a job. They see it on their Employee Portal. Time tracking + proof-of-work happens there.",
      },
      {
        kind: "cta",
        title: "Create your first job",
        body: "Pick any customer, click + New Job, set a status. That's enough — add details later.",
        ctaLabel: "Go to Job Board",
        ctaPath: "/app/oliver/jobs",
      },
    ],
  },
  {
    id: "oliver-invoicing",
    product: "oliver",
    title: "Invoices in OLIVER",
    oneLiner: "Bill a customer for work — directly or from a job/quote.",
    estimatedMinutes: 3,
    steps: [
      {
        kind: "intro",
        title: "What's an invoice?",
        body: "An invoice is a bill sent to a customer with line items + a total. Once sent, it tracks status: draft → sent → paid (or partially refunded / void). Stripe handles the actual payment.",
      },
      {
        kind: "explain",
        title: "From a job or standalone",
        body: "Create an invoice from a job (line items pre-fill), from a quote (carries the quoted price), or standalone (you fill everything).",
      },
      {
        kind: "explain",
        title: "Payment + auto-charge",
        body: "If the customer has a saved card, you can auto-charge. Otherwise we generate a Stripe-hosted payment link. Both keep the local invoice in sync.",
      },
      {
        kind: "cta",
        title: "Create your first invoice",
        body: "Open Invoices → + New Invoice. Pick a customer, add 1-2 line items, click Send.",
        ctaLabel: "Go to Invoices",
        ctaPath: "/app/oliver/invoices",
      },
    ],
  },
  {
    id: "oliver-subscriptions",
    product: "oliver",
    title: "Recurring subscriptions",
    oneLiner: "Bill a customer on a schedule — monthly, weekly, yearly.",
    estimatedMinutes: 4,
    steps: [
      {
        kind: "intro",
        title: "What's a subscription?",
        body: "A recurring charge tied to a service: monthly retainer, weekly maintenance, yearly hosting. Stripe handles the schedule + dunning; OLIVER tracks status and mirrors invoices.",
      },
      {
        kind: "explain",
        title: "Auto-charge vs send-invoice",
        body: "Choose at sub creation: auto-charge a saved card, or send an invoice each cycle. Send-invoice means customer pays manually each time.",
      },
      {
        kind: "explain",
        title: "First job auto-create",
        body: "If the sub is tied to a service (cleaning, mowing, etc.) we auto-create the first job at the start date. Subsequent jobs auto-create at each billing cycle.",
      },
      {
        kind: "cta",
        title: "Create your first subscription",
        body: "Open a customer, click + Subscription, pick a service + price + cadence.",
        ctaLabel: "Go to Customers",
        ctaPath: "/app/oliver/contacts",
      },
    ],
  },
  // ─── SPARK ─────────────────────────────────────────────────────────────
  {
    id: "spark-contacts",
    product: "spark",
    title: "Contacts in SPARK",
    oneLiner: "Every person + company you've touched — leads, prospects, customers, past customers.",
    estimatedMinutes: 3,
    steps: [
      {
        kind: "intro",
        title: "What lives in SPARK?",
        body: "SPARK is your CRM — every contact you've collected, regardless of stage. SPARK is the SOURCE OF TRUTH. OLIVER reads from SPARK; Stripe is downstream of both.",
      },
      {
        kind: "explain",
        title: "Lifecycle stages",
        body: "Each contact has a lifecycle stage based on the flow you picked in onboarding. Default: Lead → Prospect → Active Customer → Past Customer → Repeat Customer.",
      },
      {
        kind: "explain",
        title: "Where contacts come from",
        body: "Form submissions, manual add, leadgen, Stripe sync (existing customers), customer portal signups, ARION contact forms.",
      },
      {
        kind: "cta",
        title: "See your contacts",
        body: "Open Contacts → + New Contact to add one manually, or import from CSV.",
        ctaLabel: "Go to Contacts",
        ctaPath: "/app/spark/contacts",
      },
    ],
  },
  {
    id: "spark-templates",
    product: "spark",
    title: "Email templates",
    oneLiner: "Reusable email content you send to contacts — welcomes, newsletters, transactional.",
    estimatedMinutes: 3,
    steps: [
      {
        kind: "intro",
        title: "What's a template?",
        body: "A reusable email body with merge tags. Pick a template, send it to a list, every recipient gets a personalized copy.",
      },
      {
        kind: "explain",
        title: "Merge tags",
        body: "Tags like {{contact.first_name}} get replaced with each recipient's data at send time. The Tags picker in the editor shows what's available.",
      },
      {
        kind: "explain",
        title: "Where they're used",
        body: "Campaigns, automations (welcome email triggers), and one-off sends from a contact card.",
      },
      {
        kind: "cta",
        title: "Open your templates",
        body: "We pre-loaded a Welcome template during onboarding. Edit it or create new ones.",
        ctaLabel: "Go to Templates",
        ctaPath: "/app/spark/templates",
      },
    ],
  },
  {
    id: "spark-campaigns",
    product: "spark",
    title: "Email campaigns",
    oneLiner: "Send a template to a list of contacts at a chosen time.",
    estimatedMinutes: 3,
    steps: [
      {
        kind: "intro",
        title: "What's a campaign?",
        body: "A one-time send of a template to a saved list. You pick the template, pick the list, schedule it (or send now), watch open/click rates roll in.",
      },
      {
        kind: "explain",
        title: "Lists + segments",
        body: "A list is a static group of contacts. A segment is a dynamic filter (e.g. \"everyone who opened the last campaign\"). Both work as send targets.",
      },
      {
        kind: "explain",
        title: "Unsubscribes are automatic",
        body: "Every campaign includes an unsubscribe link. Opt-outs honor per-category preferences — no recipient gets duplicate-spammed.",
      },
      {
        kind: "cta",
        title: "Create your first campaign",
        body: "Open Campaigns → + New Campaign, pick a template + a list, schedule or send.",
        ctaLabel: "Go to Campaigns",
        ctaPath: "/app/spark/campaigns",
      },
    ],
  },
  {
    id: "spark-lifecycle",
    product: "spark",
    title: "Customer lifecycle",
    oneLiner: "How contacts move from lead → prospect → customer → past — automated and manual.",
    estimatedMinutes: 4,
    steps: [
      {
        kind: "intro",
        title: "Why it matters",
        body: "Lifecycle stages drive what messages contacts get, what OLIVER sees, and what your dashboards report. Set the flow right once and everything else flows from it.",
      },
      {
        kind: "explain",
        title: "The 3 presets",
        body: "Simple (5 stages), Moderate (7 stages with engaged/qualified split), Detailed (9 stages with proposal + negotiation). Picked during onboarding; switch anytime.",
      },
      {
        kind: "explain",
        title: "Auto vs manual transitions",
        body: "Some moves are automatic (first payment → Active Customer). Some you control (Lead → Prospect can be manual click or auto-on-quote-request).",
      },
      {
        kind: "cta",
        title: "Tune your lifecycle",
        body: "Open Settings → CRM → Lifecycle to switch presets, change triggers, adjust the past-customer timeout.",
        ctaLabel: "Go to Lifecycle Settings",
        ctaPath: "/app/spark/lifecycle",
      },
    ],
  },
  // ─── ARION ─────────────────────────────────────────────────────────────
  {
    id: "arion-site",
    product: "arion",
    title: "Your ARION site",
    oneLiner: "The WordPress site we built for you — content, design, SEO foundation.",
    estimatedMinutes: 3,
    steps: [
      {
        kind: "intro",
        title: "What ARION built",
        body: "Based on your onboarding questionnaire, we built a WordPress site with industry-matched template, 4-7 pages, your colors + logo, and AI-generated copy you can edit.",
      },
      {
        kind: "explain",
        title: "Editing pages",
        body: "Open the site in Elementor (your page builder). Drag + drop, change copy, swap images. We use Elementor Pro on every ARION site.",
      },
      {
        kind: "explain",
        title: "The IA Plugin",
        body: "We installed the IA Plugin on your site. It captures form submissions → SPARK contacts, syncs analytics, and lets us tweak things from the Portal.",
      },
      {
        kind: "cta",
        title: "Open your site",
        body: "Jump straight to the WordPress editor.",
        ctaLabel: "Open Site",
        ctaPath: "/app/arion",
      },
    ],
  },
  {
    id: "arion-integrations",
    product: "arion",
    title: "ARION integrations",
    oneLiner: "Connect Google, Bing, Apple, and SE Ranking so ARION can pull insights.",
    estimatedMinutes: 4,
    steps: [
      {
        kind: "intro",
        title: "Why connect anything?",
        body: "ARION's value is its analytics + recommendations. Without integrations, it's just a website. With them, it tells you what's working, what's not, and what to fix.",
      },
      {
        kind: "explain",
        title: "Google (the big one)",
        body: "One OAuth covers Google Business Profile (local listing), Search Console (search performance), and Google Ads (paid campaigns). 80% of ARION's insights pull from here.",
      },
      {
        kind: "explain",
        title: "SE Ranking",
        body: "Tracks where you rank for keywords + watches competitors. ARION auto-creates your project and seeds keywords from your onboarding questionnaire.",
      },
      {
        kind: "cta",
        title: "Connect your integrations",
        body: "Open the Integrations page to connect any you skipped during onboarding.",
        ctaLabel: "Go to Integrations",
        ctaPath: "/app/arion/integrations",
      },
    ],
  },
  {
    id: "arion-insights",
    product: "arion",
    title: "Intelligence reports",
    oneLiner: "Plain-English breakdowns of what's working on your site + what to fix next.",
    estimatedMinutes: 3,
    steps: [
      {
        kind: "intro",
        title: "What ARION shows you",
        body: "Six Intelligence reports (Local, Search, Conversion, Content, Technical, Reputation) — each scores your performance + lists the top fixes ordered by impact.",
      },
      {
        kind: "explain",
        title: "Trends vs Intelligence",
        body: "Trends = how a metric changed over time. Intelligence = WHY it changed + what to do about it. Most users live in Intelligence; Trends is for deep dives.",
      },
      {
        kind: "explain",
        title: "Recommendations + Tasks",
        body: "Each report ends with prioritized tasks. Mark them done as you ship; ARION re-scores on the next data sync.",
      },
      {
        kind: "cta",
        title: "See your first report",
        body: "Open IA Insights to see what ARION found.",
        ctaLabel: "Go to IA Insights",
        ctaPath: "/app/arion/insights",
      },
    ],
  },
];

export function walkthroughsByProduct(product: Walkthrough["product"]): Walkthrough[] {
  return WALKTHROUGHS.filter((w) => w.product === product);
}

export function findWalkthrough(id: string): Walkthrough | undefined {
  return WALKTHROUGHS.find((w) => w.id === id);
}
