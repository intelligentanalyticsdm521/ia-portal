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
  // Tour ids must match the exported TourDef.id values in components/GuidedTour.tsx
  // (ALL_TOURS). Mismatch = silent no-op when ARGUS hands off to GuidedTour.
  // These point at the *_full_v1 tours — the only tours that exist today
  // (~20-30 steps, ~2 minutes each). If a shorter *_quick_v1 tour is ever
  // added, point the chatbot at that instead (or expose both via separate intents).
  { id: "tour_oliver",
    keywords: ["tour oliver", "show oliver", "walk oliver", "how oliver works", "teach oliver"],
    reply: "Starting your full OLIVER tour. Watch the highlighted spots and click Next to advance — about 2 minutes; skip anytime.",
    tour: "oliver_full_v1" },
  { id: "tour_spark",
    keywords: ["tour spark", "show spark", "walk spark", "how spark works", "teach spark"],
    reply: "Kicking off the full SPARK tour — Contacts, Campaigns, Automations, Sales, and Insights. About 2 minutes.",
    tour: "spark_full_v1" },
  { id: "tour_arion",
    keywords: ["tour arion", "show arion", "walk arion", "how arion works", "teach arion"],
    reply: "Full ARION tour incoming — Website, Hosting, Analytics, SEO, Business Profile, and Insights. About 2 minutes.",
    tour: "arion_full_v1" },

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
    reply: "Team Members lives in the hamburger menu. OLIVER also has its own Team Access page for worker roles.",
    cta: { label: "Open Team Members", to: "/app/settings/team-members" } },

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
  // OLIVER Quotes / Proposals — F-120 Batch 8 coverage expansion (3 intents)
  { id: "oliver_create_quote", keywords: ["create quote", "new quote", "send quote", "build quote", "quote customer"],
    reply: "Quotes & Proposals is where you build a priced estimate, send it to the customer, and convert it to an invoice once accepted.",
    cta: { label: "Open Quotes & Proposals", to: "/app/services/oliver_quotes" } },
  { id: "oliver_view_proposals", keywords: ["view proposals", "see proposals", "proposal list", "outstanding proposals", "my proposals"],
    reply: "Proposals lists every multi-option proposal you've sent — status, viewed/accepted timestamps, and the win-rate breakdown.",
    cta: { label: "Open Proposals", to: "/app/services/oliver_proposals" } },
  { id: "oliver_convert_proposal", keywords: ["convert proposal", "proposal to invoice", "accept proposal", "turn proposal into invoice"],
    reply: "Open the proposal in Quotes & Proposals — once the customer accepts an option, the 'Convert to invoice' button generates the invoice in OLIVER Invoices and links it back to the source proposal.",
    cta: { label: "Open Quotes & Proposals", to: "/app/services/oliver_quotes" } },

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
  // SPARK SMS — F-120 Batch 8 coverage expansion (3 intents)
  { id: "spark_sms_send", keywords: ["send sms campaign", "send text campaign", "sms blast", "text blast", "new sms campaign"],
    reply: "SMS Campaigns is where you compose and send a one-off text broadcast — pick the list, pick the template, send.",
    cta: { label: "Open SMS Campaigns", to: "/app/services/spark_sms_campaigns" } },
  { id: "spark_sms_unsubscribes", keywords: ["sms unsubscribes", "sms opt out", "sms suppression", "stop list", "text opt out"],
    reply: "Lead Suppression holds every email + phone that's opted out (STOP replies and unsubscribes are merged in here). Anyone on this list is excluded from outbound sends.",
    cta: { label: "Open Lead Suppression", to: "/app/services/spark_lead_suppression" } },
  { id: "spark_sms_log", keywords: ["sms log", "text log", "sms history", "sent texts", "sms inbox"],
    reply: "SMS Inbox shows every inbound + outbound text — replies, delivery status, and the conversation thread per contact.",
    cta: { label: "Open SMS Inbox", to: "/app/services/spark_sms_inbox" } },

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
  // ARION Search Indexing — F-120 Batch 8 coverage expansion (2 intents)
  { id: "arion_submit_url", keywords: ["submit url", "submit to google", "submit to bing", "indexnow", "ping search engine", "request indexing"],
    reply: "Bing IndexNow pushes new + changed URLs to Bing instantly (Google picks them up on its own schedule). Submit a single URL or let the daily job sweep new pages automatically.",
    cta: { label: "Open Bing IndexNow", to: "/app/services/arion_search_bing_indexnow" } },
  { id: "arion_indexing_status", keywords: ["check indexing", "indexing status", "is my page indexed", "page indexed", "indexed pages", "coverage status"],
    reply: "Search Indexing shows which pages are indexed across Google + Bing, plus coverage issues and your sitemap submission history.",
    cta: { label: "Open Search Indexing", to: "/app/services/arion_search_indexing" } },

  // ── STELLA (coming soon) ─────────────────────────────────────────────────
  { id: "stella_view", keywords: ["view stella", "open stella", "what is stella", "stella overview", "stella reporting"],
    reply: "STELLA is the cross-product reporting + business-intelligence layer — coming soon. The placeholder page has the rebuild scope and you'll see it light up during STELLA build sessions. Stay tuned.",
    cta: { label: "Open STELLA Overview", to: "/app/services/stella_coming" } },

  // ── CONSULTING ───────────────────────────────────────────────────────────
  { id: "consulting_service_request", keywords: ["submit service request", "new service request", "request consulting", "submit consulting ticket", "consulting ticket", "request work"],
    reply: "Service Requests is the kanban for recurring Build-Your-Business work — blog posts, monthly SEO reviews, content refreshes. Drop a new ticket in the 'New' column and the founder will pick it up.",
    cta: { label: "Open Service Requests", to: "/app/services/consulting_tickets" } },
  { id: "consulting_projects_view", keywords: ["view consulting projects", "my consulting projects", "consulting work", "consulting engagements", "see projects"],
    reply: "Projects shows every multi-phase consulting engagement — Custom Software, Agentic Builds, Full SEO Setup — with phase tracker, deliverables, and the Phase → Feature → Task drill-down.",
    cta: { label: "Open Projects", to: "/app/services/consulting_projects" } },
  { id: "consulting_invoice_schedule", keywords: ["invoice schedule", "billing schedule", "upcoming invoices", "next invoice", "billing cycle"],
    reply: "Your invoice schedule (recurring charges, next billing dates, monthly retainers) lives in Plan & Pricing. OLIVER subscriptions for your own customers are on Subscriptions.",
    cta: { label: "Open Plan & Pricing", to: "/app/settings/plan-pricing" } },

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
