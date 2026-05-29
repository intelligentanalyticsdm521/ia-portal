// ARGUS intents — F-120 Phase 1 (rule-based).
//
// Each intent has:
//   - id          — stable key
//   - keywords    — list of phrases; match if ANY phrase appears in the
//                   normalized user message (lowercased, stripped of
//                   punctuation). Multi-word phrases require ALL words to
//                   appear (in any order) for that phrase to match.
//   - reply       — text shown back to the user
//   - cta?        — optional Take-me-there action: { label, to (route) }
//   - tour?       — optional tour id to launch (matches GuidedTour ids)
//   - openTicket? — true means the chat should open the ticket form
//   - score       — base relevance weight. Longer phrase matches add weight.
//
// To add more coverage, append entries to this list. The matcher is
// dependency-free.

export interface ArgusIntent {
  id: string;
  keywords: string[];
  reply: string;
  cta?: { label: string; to: string };
  tour?: string;
  openTicket?: boolean;
  score?: number;
}

export const ARGUS_INTENTS: ArgusIntent[] = [
  // ── Tours ────────────────────────────────────────────────────────────────
  { id: "tour_oliver",
    keywords: ["tour oliver", "show oliver", "walk oliver", "how oliver works", "teach oliver"],
    reply: "Starting your OLIVER tour. Watch the highlighted spots and click Next to advance — should take about a minute.",
    tour: "oliver_quick_v1" },
  { id: "tour_spark",
    keywords: ["tour spark", "show spark", "walk spark", "how spark works", "teach spark"],
    reply: "Kicking off the SPARK tour — I'll show you Contacts, Campaigns, Automations, and Insights.",
    tour: "spark_quick_v1" },
  { id: "tour_arion",
    keywords: ["tour arion", "show arion", "walk arion", "how arion works", "teach arion"],
    reply: "ARION tour incoming — Analytics, SEO, Business Profile, and Insights in about a minute.",
    tour: "arion_quick_v1" },

  // ── Tickets / stuck ──────────────────────────────────────────────────────
  { id: "ticket_open",
    keywords: ["stuck", "submit ticket", "open ticket", "talk human", "talk founder", "bug report", "report bug", "report issue", "need help"],
    reply: "Got it — let's get a ticket to the founder. Fill in the form and I'll send it.",
    openTicket: true, score: 50 },

  // ── Account / billing ────────────────────────────────────────────────────
  { id: "plan_pricing",
    keywords: ["plan pricing", "upgrade", "downgrade", "change tier", "change plan", "my plan", "see plan", "pricing"],
    reply: "Plan & Pricing covers every product you're on. You can add a product, change tier, or cancel from here.",
    cta: { label: "Open Plan & Pricing", to: "/app/settings/plan-pricing" } },
  { id: "invoices_account",
    keywords: ["my invoices", "billing history", "past invoices", "see receipts", "download receipt"],
    reply: "Your account-level invoices (IA billing) live in the account portal. For OLIVER customer invoices, see the Billing section in OLIVER.",
    cta: { label: "Open account billing", to: "/app/settings/plan-pricing" } },
  { id: "business_profile",
    keywords: ["business profile", "business name", "business address", "change business", "company info"],
    reply: "Business Profile is in the hamburger menu — it controls your business name, address, logo, and brand colors across the platform.",
    cta: { label: "Open Business Profile", to: "/app/settings/business-profile" } },
  { id: "team_members",
    keywords: ["team", "invite teammate", "add user", "manage users", "team access"],
    reply: "Team management lives in the hamburger menu. OLIVER also has its own Team Access page for worker roles.",
    cta: { label: "Open Team", to: "/app/settings/team" } },

  // ── OLIVER routes ────────────────────────────────────────────────────────
  { id: "oliver_job_board", keywords: ["job board", "jobs board", "see jobs", "find jobs"],
    reply: "Job Board has 5 buckets: Quotes, Scheduled, In Progress, Completed, Closed. Drag to advance.",
    cta: { label: "Open Job Board", to: "/app/services/oliver_job_board" } },
  { id: "oliver_schedule", keywords: ["schedule", "calendar", "team schedule", "see calendar"],
    reply: "Schedule is the calendar view of your jobs + worker availability.",
    cta: { label: "Open Schedule", to: "/app/services/oliver_schedule" } },
  { id: "oliver_contacts", keywords: ["customers", "contacts", "add customer", "new customer", "customer list"],
    reply: "Contacts is your customer list. Add, search, edit, and open the unified customer modal from here.",
    cta: { label: "Open Contacts", to: "/app/services/oliver_contacts" } },
  { id: "oliver_workers", keywords: ["workers", "crew", "add worker", "manage workers"],
    reply: "Workers manage your field crew — invites, roles, regions, performance.",
    cta: { label: "Open Workers", to: "/app/services/oliver_workers" } },
  { id: "oliver_invoices", keywords: ["invoice", "send invoice", "create invoice", "outstanding invoices"],
    reply: "Invoices lists all OLIVER invoices. From here you can charge a card, send a pay-link, or mark paid.",
    cta: { label: "Open Invoices", to: "/app/services/oliver_invoices" } },
  { id: "oliver_payments", keywords: ["payments", "payment history", "stripe payments"],
    reply: "Payments lists every charge that's hit Stripe — successful, refunded, or disputed.",
    cta: { label: "Open Payments", to: "/app/services/oliver_payments" } },
  { id: "oliver_recurring", keywords: ["subscription", "recurring", "manage subscription", "recurring job"],
    reply: "Subscriptions handles recurring jobs that auto-bill via Stripe.",
    cta: { label: "Open Subscriptions", to: "/app/services/oliver_recurring" } },
  { id: "oliver_booking", keywords: ["booking", "booking page", "publish booking", "online booking"],
    reply: "Booking is your public-facing booking page setup. Configure services, slots, and the URL customers see.",
    cta: { label: "Open Booking", to: "/app/services/oliver_booking" } },
  { id: "oliver_portals_hub", keywords: ["customer portal", "crew portal", "portals", "portal design"],
    reply: "Customer & Crew Portals are one hub — design, signup form, custom domain, and workflow rules.",
    cta: { label: "Open Portal Hub", to: "/app/services/oliver_portals_hub" } },
  { id: "oliver_catalog", keywords: ["products", "services catalog", "catalog", "add service"],
    reply: "Products & Services is where you define what you sell — with duration, default price, and category.",
    cta: { label: "Open Catalog", to: "/app/services/oliver_catalog" } },
  { id: "oliver_coupons", keywords: ["coupon", "discount", "promo code"],
    reply: "Coupons creates discount codes you can apply to invoices and bookings.",
    cta: { label: "Open Coupons", to: "/app/services/oliver_coupons" } },
  { id: "oliver_automations", keywords: ["automation", "workflow", "auto invoice", "auto sms"],
    reply: "Automations runs rules on its own — booking confirmations, on-the-way SMS, auto-invoice on completion.",
    cta: { label: "Open Automations", to: "/app/services/oliver_automations" } },
  { id: "oliver_workflow_settings", keywords: ["workflow settings", "reschedule policy", "signup form", "post booking"],
    reply: "Workflow Settings holds the reschedule policy, post-booking actions, and the customer signup form library.",
    cta: { label: "Open Workflow Settings", to: "/app/services/oliver_workflow_settings" } },
  { id: "oliver_stripe", keywords: ["connect stripe", "stripe setup", "stripe connect", "payouts"],
    reply: "Stripe lives in OLIVER Business Setup. Standard if you already have a Stripe, Express if not — Express is built in.",
    cta: { label: "Open Business Setup", to: "/app/services/oliver_settings" } },

  // ── SPARK routes ─────────────────────────────────────────────────────────
  { id: "spark_contacts", keywords: ["spark contacts", "marketing contacts", "crm contacts"],
    reply: "SPARK Contacts is your marketing CRM — segments, tags, lists, the works.",
    cta: { label: "Open SPARK Contacts", to: "/app/services/spark_contacts" } },
  { id: "spark_contact_import", keywords: ["import csv", "import contacts", "upload contacts", "csv import"],
    reply: "Import (CSV) on SPARK handles bulk uploads with field-mapping and dedupe.",
    cta: { label: "Open Import", to: "/app/services/spark_contact_import" } },
  { id: "spark_campaigns", keywords: ["campaign", "send campaign", "email blast", "broadcast"],
    reply: "Campaigns sends one-off broadcasts — email or SMS. Pick a list, pick a template, send.",
    cta: { label: "Open Campaigns", to: "/app/services/spark_campaigns" } },
  { id: "spark_templates", keywords: ["templates", "email template", "sms template"],
    reply: "Templates is your library of reusable email + SMS messages.",
    cta: { label: "Open Templates", to: "/app/services/spark_templates" } },
  { id: "spark_forms", keywords: ["forms", "lead form", "capture form", "signup form"],
    reply: "Forms is your library of lead-capture forms with the embed code per form.",
    cta: { label: "Open Forms", to: "/app/services/spark_forms" } },
  { id: "spark_landing_pages", keywords: ["landing page", "campaign page"],
    reply: "Landing Pages lets you spin up branded one-off pages tied to forms.",
    cta: { label: "Open Landing Pages", to: "/app/services/spark_landing_pages" } },
  { id: "spark_automations", keywords: ["spark automation", "marketing automation", "drip", "welcome series"],
    reply: "Marketing Automations — welcome series, drip flows, lead routing, anomaly alerts.",
    cta: { label: "Open Automations", to: "/app/services/spark_automations" } },
  { id: "spark_leads", keywords: ["lead inbox", "new leads", "see leads"],
    reply: "Lead Inbox shows new leads coming in from forms, ARION, and other sources.",
    cta: { label: "Open Lead Inbox", to: "/app/services/spark_leads" } },
  { id: "spark_deals", keywords: ["deals", "pipeline", "opportunities", "sales pipeline"],
    reply: "Deals + Pipelines manage opportunities through stages.",
    cta: { label: "Open Deals", to: "/app/services/spark_deals" } },
  { id: "spark_nps", keywords: ["nps", "customer satisfaction", "csat", "feedback"],
    reply: "NPS is your customer satisfaction surveys — schedule them, view scores, drill into responses.",
    cta: { label: "Open NPS", to: "/app/services/spark_nps" } },
  { id: "spark_reviews", keywords: ["reputation", "spark reviews", "review responses"],
    reply: "Reputation Hub aggregates reviews across channels with AI-assisted response drafts.",
    cta: { label: "Open Reputation Hub", to: "/app/services/spark_reviews" } },

  // ── ARION routes ─────────────────────────────────────────────────────────
  { id: "arion_analytics", keywords: ["ga4", "google analytics", "site traffic", "visitors"],
    reply: "ARION Search Engine Analytics rolls up GA4 + GSC — Traffic, Audience, Content, Conversions.",
    cta: { label: "Open Analytics", to: "/app/services/arion_analytics_overview" } },
  { id: "arion_seo", keywords: ["seo", "rankings", "keyword rankings", "search ranking"],
    reply: "ARION SEO has Rankings, Site Audit, Competitors, AI Search, and Market Monitor.",
    cta: { label: "Open SEO", to: "/app/services/arion_seo_overview" } },
  { id: "arion_gsc", keywords: ["gsc", "search console", "google search console"],
    reply: "Search Performance pulls in Google Search Console data — clicks, impressions, queries, pages.",
    cta: { label: "Open Search Performance", to: "/app/services/arion_search_performance" } },
  { id: "arion_business", keywords: ["gbp", "google business", "google profile", "business listing"],
    reply: "ARION Business Profile manages Google Business + Bing Places + Apple Maps.",
    cta: { label: "Open Business Profile", to: "/app/services/arion_business_overview" } },
  { id: "arion_reviews", keywords: ["google reviews", "site reviews"],
    reply: "ARION Business Reviews aggregates Google reviews with response tools.",
    cta: { label: "Open Reviews", to: "/app/services/arion_business_reviews" } },
  { id: "arion_plugin", keywords: ["install plugin", "wordpress plugin", "ia plugin"],
    reply: "Plugin Provisioning is the one-click installer for the IA plugin (pushes site data to ARION).",
    cta: { label: "Open Plugin Provisioning", to: "/app/services/arion_plugin_provisioning" } },
  { id: "arion_security", keywords: ["security", "vulnerabilities", "wordfence"],
    reply: "ARION Security shows scan results, threats, and vulnerability status.",
    cta: { label: "Open Security", to: "/app/services/arion_website_security_overview" } },
  { id: "arion_backups", keywords: ["backup", "restore site", "backup site"],
    reply: "Backups lists every snapshot with restore + download.",
    cta: { label: "Open Backups", to: "/app/services/arion_hosting_backups" } },
  { id: "arion_domain", keywords: ["domain", "dns", "dns records", "subdomain"],
    reply: "Domain & DNS in ARION shows your domain, DNS records, SSL status, and propagation.",
    cta: { label: "Open Domain & DNS", to: "/app/services/arion_hosting_domain_dns" } },

  // ── Cross-product ─────────────────────────────────────────────────────────
  { id: "ia_insights", keywords: ["ia insights", "intelligence", "insights"],
    reply: "Every product has the same 4-step IA Insights pattern: Health → Trends → Intelligence → Cross-Channel.",
    cta: { label: "Open ARGUS Cross-Channel", to: "/app/services/argus_cross_channel" } },
  { id: "settings_hub", keywords: ["settings", "configuration", "preferences"],
    reply: "Settings has its own dedicated IconRail entry on the left — gear icon at the bottom.",
    cta: { label: "Open Settings", to: "/app/services/arion_brand" } },
  { id: "overview_hub", keywords: ["overview", "command center", "all products"],
    reply: "The cross-product overview lives at the top of the IconRail (first icon).",
    cta: { label: "Open Overview", to: "/app/overview" } },
];

// Greetings + thanks — short canned responses (no action).
export const ARGUS_SMALLTALK: Array<{ keywords: string[]; reply: string }> = [
  { keywords: ["hi", "hello", "hey", "yo"], reply: "Hey! What are you trying to do? I can navigate, walk you through a tour, or open a ticket if you're stuck." },
  { keywords: ["thanks", "thank you", "thx"], reply: "Anytime. Need anything else?" },
  { keywords: ["bye", "later", "goodbye"], reply: "Catch you later. I'm here whenever." },
  { keywords: ["who are you", "what are you"], reply: "I'm ARGUS, the IA Platform assistant. I help you navigate, learn the product, and reach the founder when you're stuck." },
];

// Normalize a message: lowercase, strip non-letters/digits/spaces.
export function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

// Match: returns intent + score (higher is better). 0 means no match.
export interface IntentMatch {
  intent: ArgusIntent | null;
  score: number;
  smalltalk?: { reply: string };
}

export function matchIntent(message: string): IntentMatch {
  const norm = normalize(message);
  if (!norm) return { intent: null, score: 0 };

  // Smalltalk first — short single-word matches.
  for (const s of ARGUS_SMALLTALK) {
    if (s.keywords.some((k) => norm.split(" ").includes(k))) {
      return { intent: null, score: 1, smalltalk: { reply: s.reply } };
    }
  }

  let best: ArgusIntent | null = null;
  let bestScore = 0;
  for (const intent of ARGUS_INTENTS) {
    let s = 0;
    for (const phrase of intent.keywords) {
      const words = phrase.split(" ").filter(Boolean);
      const hit = words.every((w) => norm.includes(w));
      if (hit) s += 10 * words.length; // weight longer phrases more
    }
    if (s > 0) s += intent.score || 0;
    if (s > bestScore) {
      bestScore = s;
      best = intent;
    }
  }
  return { intent: best, score: bestScore };
}
