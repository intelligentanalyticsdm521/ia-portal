// oliverPages.ts — teaching copy for every page in the OLIVER nav, in order.
//
// PAYMENT-DATA CAUTION (Brandon 2026-07-28): "probably OLIVER we need to be a
// little more careful there since that's actual payment data." So the
// interactive walkthrough NEVER practises on anything financial — no test
// invoices, no practice payments, no refunds, no subscription changes. Those
// pages are marked readOnly and the tour explains them instead of doing them.
// The one hands-on exercise is a CUSTOMER record, which is safe to create and
// delete, and even that tells the user we'll clean it up.
import type { PageContentMap } from "../pageGuide";

export const OLIVER_PAGES: PageContentMap = {
  // ── Dashboard ───────────────────────────────────────────────────────────
  oliver_dashboard: {
    title: "Today, at a glance",
    body:
      "Jobs happening now, money outstanding, and anything waiting on you. Open this first each morning — the rest of the menu is where you go once this screen tells you something needs attention.",
  },

  // ── Customers ───────────────────────────────────────────────────────────
  oliver_contacts: {
    title: "Contacts — everyone you do business with",
    body:
      "Every job, quote and invoice belongs to a customer record. Get the email right: that's how they receive quotes, invoices and payment links, and it's what ties their whole history together on one screen.",
    doIt: [
      {
        targetSelector: 'button[data-tour="new-customer"]',
        advance: "click",
        title: "Let's add a practice customer",
        body: "Click New customer. We'll create one together so you've done it once — you can delete it straight after, and I'll show you how.",
        placement: "bottom",
      },
      {
        targetSelector: 'input[data-tour="customer-first-name"]',
        advance: "input",
        waitForMs: 1500,
        title: "First name",
        body: "Type anything — \"Test\" is fine for this one, since we're deleting it in a moment.",
        placement: "right",
      },
      {
        targetSelector: 'input[data-tour="customer-email"]',
        advance: "input",
        title: "Email",
        body: "This is where quotes, invoices and payment links would go for a real customer. Nothing is sent to this address by creating the record.",
        placement: "right",
      },
      {
        targetSelector: 'button[data-tour="save-customer"]',
        advance: "click",
        title: "Save it",
        body: "That's the whole flow. Your new record appears at the top of the list — open it and you'll find Delete in the same place, so practice records never pile up.",
        placement: "top",
      },
    ],
  },
  oliver_service_requests: {
    body:
      "Inbound asks that haven't become jobs yet — booking-page submissions, contact forms, phone notes. Work this list daily; requests go cold within about 24 hours and speed of reply wins more of them than price does.",
  },
  oliver_booking: {
    body:
      "Your customer-facing booking page — real availability, real services from your catalogue. Half of small-business enquiries happen outside business hours; this is how you capture the ones who'd otherwise call the next name on the list.",
  },

  // ── Jobs ────────────────────────────────────────────────────────────────
  oliver_job_board: {
    title: "Job Board — everything in flight",
    body:
      "Five buckets — Quotes, Scheduled, In Progress, Completed, Closed — and you drag work across as it moves. The habit worth building: mark jobs Completed the day they finish, because that's what triggers invoicing and review requests.",
  },
  oliver_schedule: {
    body:
      "The calendar view of jobs and who's assigned. One rule makes this work: if it isn't on here, it doesn't exist. The moment half the crew works off texts, you've lost the thread — and that's the half-adoption trap that kills field-service software.",
  },
  oliver_jobs_archive: {
    body:
      "Finished and closed work, searchable. Useful when a customer rings about something you did eighteen months ago and you need the detail in ten seconds.",
  },

  // ── Products & Services ─────────────────────────────────────────────────
  oliver_catalog: {
    title: "Products & Services — build this first",
    body:
      "Your price list: what you sell, what it costs, how long it takes. It feels like admin and it's the highest-leverage half hour in OLIVER — quotes, booking and invoices all pull from here, so you stop retyping prices and stop making the arithmetic mistakes that quietly cost you margin.",
  },
  oliver_categories: {
    body:
      "How your services group together for customers on the booking page. Sensible grouping is the difference between a booking page people scan and one they abandon.",
  },
  oliver_service_categories: {
    body:
      "Skill groupings for your crew — which workers can do which type of work. This is what lets scheduling suggest the right person instead of you remembering who's qualified.",
  },
  oliver_coupons: {
    body:
      "Discount codes that sync to Stripe. Handy for seasonal offers and win-back campaigns; each one tracks its own redemptions so you can tell whether a promotion actually paid.",
    readOnly: true,
    readOnlyNote: "Read-only in this walkthrough — coupons affect real billing.",
  },

  // ── Billing ─────────────────────────────────────────────────────────────
  oliver_quotes: {
    title: "Quotes — speed wins more than price does",
    body:
      "Quotes pull straight from your price list, so building one is picking items rather than doing maths. Send same-day where you can: a week-old quote is usually a job someone else already did.",
    readOnly: true,
    readOnlyNote: "We'll look but not send — a quote goes to a real customer.",
  },
  oliver_proposal_templates: {
    body:
      "Reusable scopes so you're not rewriting the same proposal every time. Build the three you send most and quoting stops being the bottleneck.",
  },
  oliver_invoices: {
    title: "Invoices — where the money actually lands",
    body:
      "An invoice builds from the job, so the line items are already right. The single biggest cash leak in field service is work finished but never invoiced — it's never a decision, just a Friday job forgotten by Monday. Invoice within 48 hours while it's fresh.",
    readOnly: true,
    readOnlyNote: "Read-only here — we don't create practice invoices against real billing.",
  },
  oliver_recurring: {
    body:
      "Subscriptions bill and schedule on repeat — maintenance plans, seasonal contracts. One recurring customer is worth several one-offs because you stop paying to win the same work twice.",
    readOnly: true,
    readOnlyNote: "Read-only — subscriptions charge real cards on a schedule.",
  },
  oliver_payments: {
    title: "Payments — every charge, in one place",
    body:
      "Paid, refunded, disputed. If invoices are going out but nothing lands here, check your Stripe connection — that's the usual cause. Card payment on the invoice is the highest-return change most service businesses make: it converts \"I'll post a cheque\" into money today.",
    readOnly: true,
    readOnlyNote: "Strictly read-only — this is live payment data.",
  },
  oliver_templates: {
    body:
      "The emails and texts OLIVER sends automatically — confirmations, reminders, receipts. Worth reading once in your own voice; these are the messages your customers actually receive most often.",
  },

  // ── Team ────────────────────────────────────────────────────────────────
  oliver_workers: {
    body:
      "Your crew, their skills and availability, and their portal invitations. This is where field-service software sticks or dies: if logging a job takes under a minute, you get clean records automatically. If it's slower than a text message, you'll get a text message.",
  },
  oliver_crew_performance: {
    body:
      "Per-worker scorecards — jobs completed, on-time rate, repeat-customer rate. Use it for coaching rather than league tables; the on-time number is usually a scheduling problem, not a person problem.",
  },

  // ── Workflow & Automations ──────────────────────────────────────────────
  oliver_automations: {
    body:
      "\"When this happens, do that\" — reminders before a job, a thank-you after, a nudge on an unpaid invoice. Set up once and they run forever, which is how a small team behaves like a bigger one.",
  },
  oliver_addons: {
    body:
      "Optional extras offered during booking and checkout. The easiest revenue increase available to you: people who've already decided to buy say yes to relevant add-ons surprisingly often.",
  },
  oliver_portals_hub: {
    body:
      "The customer and crew portals — branding, domains, what each side can see. Customers get their jobs, quotes and invoices; crew get their schedule and paperwork. Fewer \"can you send me that again\" calls.",
  },
  oliver_workflow_settings: {
    body:
      "The policy behind the automation — reschedule rules, no-show handling, notification timing, whether review requests go out after a job. Turn review requests on if you do nothing else here.",
  },

  // ── IA Insights ─────────────────────────────────────────────────────────
  oliver_ia_insights_health: {
    body:
      "Whether your operational data is complete enough to trust the reports. If a number looks wrong elsewhere, check here first — it's usually missing data, not a real collapse.",
  },
  oliver_ia_insights_trends: {
    title: "Trends — your operation, scored",
    body:
      "Quote win rate, invoice ageing, how far out you're booked, crew performance — scored on where you stand and which way you're moving. Watch \"booked ahead\" most closely: it's the earliest warning that next month will be quiet, while there's still time to fix it.",
  },
  oliver_ia_insights_intelligence: {
    body:
      "The modelled view — which quotes are likely to convert, which customers are drifting, where capacity is being wasted. Start with the opportunities; they're ranked by what they're actually worth.",
  },
  oliver_ia_insights_reports: {
    body:
      "The plain operational record — activity logs and exports, without any scoring on top. This is what you pull when you need the raw facts for an accountant or a dispute.",
  },
};
