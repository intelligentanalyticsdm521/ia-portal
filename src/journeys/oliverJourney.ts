// oliverJourney.ts — OLIVER (Invoicing & Administration) consulting curriculum.
//
// Field-service software dies of HALF-adoption, not rejection: the office
// adopts it, the field doesn't, so jobs get done but never closed out — and
// then invoices stall, documentation goes missing, and customers argue about
// "mystery work" (NetSuite/BuildOps/Praxedo research, ENGAGEMENT_ALERTS
// CATALOG). Half-adoption is genuinely worse than none.
//
// So the order here is deliberate: build the price list ONCE (everything
// downstream fills itself in), then quote → schedule → invoice → get paid as
// one unbroken chain. We teach the chain, because a broken link is where the
// money leaks.
import type { Journey } from "./types";

export const OLIVER_JOURNEY: Journey = {
  product: "oliver",
  productLabel: "Invoicing & Administration",
  accent: "#FEC82C",
  tourId: "journey_oliver_tour_v1",
  interactiveId: "journey_oliver_interactive_v1",
  tourTitle: "Invoicing & Administration — guided by your consultant",
  interactiveTitle: "Invoicing & Administration — do it with me",
  oneLiner: "Quote, schedule, invoice, get paid — without the leaks",
  steps: [
    {
      id: "oliver.welcome",
      label: "How to think about OLIVER",
      sectionLabel: "Start here",
      route: "/app/services/oliver_dashboard",
      keywords: ["what is oliver", "oliver overview", "where do i start operations"],
      explain: {
        title: "One unbroken chain: quote → schedule → invoice → paid",
        body:
          "OLIVER runs the operational side of your business. The thing that makes it work isn't any single page — it's that each step feeds the next, so you're never re-typing what you already know. Where field-service businesses lose money is a broken link in that chain: work finished but never invoiced, quotes sent and never chased. We'll build the chain in order. About 10 minutes.",
        placement: "center",
      },
    },

    // ══ Set the foundation once ════════════════════════════════════════════
    {
      id: "oliver.catalog",
      label: "Build your price list",
      sectionLabel: "Set it up once",
      route: "/app/services/oliver_catalog",
      keywords: ["catalog", "price list", "services", "add service", "products", "pricing", "set prices"],
      explain: {
        title: "Do this first — everything downstream fills itself in",
        body:
          "Products & Services is your price list: what you sell, what it costs, how long it takes. It feels like admin, but it's the highest-leverage thirty minutes in OLIVER. Once it's here, quotes, booking pages and invoices all pull from it — so you stop re-typing prices and stop making the arithmetic mistakes that cost you margin.",
        targetSelector: "a[href='/app/services/oliver_catalog']",
        placement: "right",
      },
    },
    {
      id: "oliver.contacts",
      label: "Add your first customer",
      sectionLabel: "Set it up once",
      route: "/app/services/oliver_contacts",
      keywords: ["add customer", "new customer", "create customer", "customer list", "add client"],
      explain: {
        title: "Customers are who the whole chain hangs off",
        body:
          "Every job, quote and invoice belongs to a customer record. Get the email right — that's how they receive quotes, invoices and payment links, and it's what connects their history together so you can see everything you've ever done for them on one screen.",
        targetSelector: "a[href='/app/services/oliver_contacts']",
        placement: "right",
      },
      doIt: [
        {
          targetSelector: 'button[data-tour="new-customer"]',
          advance: "click",
          title: "Add a customer",
          body: "Click New customer. Use a real one — the whole point is that this becomes your actual book of business.",
          placement: "bottom",
        },
        {
          targetSelector: 'input[data-tour="customer-first-name"]',
          advance: "input",
          waitForMs: 1500,
          title: "Their name",
          body: "For a company, put the person you actually deal with here — you can attach the business name too.",
          placement: "right",
        },
        {
          targetSelector: 'input[data-tour="customer-email"]',
          advance: "input",
          title: "Their email",
          body: "This is where quotes, invoices and payment links go. Getting it right now saves a phone call later.",
          placement: "right",
        },
        {
          targetSelector: 'button[data-tour="save-customer"]',
          advance: "click",
          title: "Save",
          body: "Saved. From their record you can quote, schedule a job, or invoice them without re-entering anything.",
          placement: "top",
        },
      ],
    },

    // ══ Win the work ═══════════════════════════════════════════════════════
    {
      id: "oliver.quotes",
      label: "Send a quote",
      sectionLabel: "Win the work",
      route: "/app/services/oliver_quotes",
      keywords: ["quote", "send quote", "create quote", "estimate", "proposal", "bid"],
      explain: {
        title: "Speed wins jobs more often than price does",
        body:
          "Quotes pull straight from your price list, so building one is picking items, not doing maths. Send it the same day if you can — your own Win Drivers report will show you what every field-service business eventually learns: the fastest quote wins a disproportionate share, and a week-old quote is usually a job someone else already did.",
        targetSelector: "a[href='/app/services/oliver_quotes']",
        placement: "right",
      },
    },
    {
      id: "oliver.booking",
      label: "Let customers book you directly",
      sectionLabel: "Win the work",
      route: "/app/services/oliver_booking",
      keywords: ["booking page", "online booking", "let customers book", "appointment", "scheduling link"],
      explain: {
        title: "Takes work at 11pm when nobody answers the phone",
        body:
          "Your booking page shows real availability and real services from the catalogue you just built. Half of small-business enquiries happen outside business hours — this is how you capture the ones that would otherwise call the next name on the list.",
        targetSelector: "a[href='/app/services/oliver_booking']",
        placement: "right",
      },
    },

    // ══ Do the work ════════════════════════════════════════════════════════
    {
      id: "oliver.schedule",
      label: "Schedule the job",
      sectionLabel: "Do the work",
      route: "/app/services/oliver_schedule",
      keywords: ["schedule", "calendar", "book a job", "assign job", "dispatch"],
      explain: {
        title: "One calendar everyone actually trusts",
        body:
          "An accepted quote becomes a scheduled job without re-entering anything. The rule that matters: if it isn't on here, it doesn't exist. The moment half the crew works off texts and the other half off the calendar, you've lost the thread — and that's the half-adoption trap that kills this kind of software.",
        targetSelector: "a[href='/app/services/oliver_schedule']",
        placement: "right",
      },
    },
    {
      id: "oliver.jobboard",
      label: "Track jobs through to done",
      sectionLabel: "Do the work",
      route: "/app/services/oliver_job_board",
      keywords: ["job board", "jobs", "track job", "job status", "kanban", "work in progress"],
      explain: {
        title: "Where you see everything at once",
        body:
          "Five buckets — Quotes, Scheduled, In Progress, Completed, Closed — and you drag work across as it moves. The one habit worth building: mark jobs Completed the day they finish. That single act is what triggers invoicing and review requests; skip it and the money sits still.",
        targetSelector: "a[href='/app/services/oliver_job_board']",
        placement: "right",
      },
    },
    {
      id: "oliver.workers",
      label: "Add your crew",
      sectionLabel: "Do the work",
      route: "/app/services/oliver_workers",
      keywords: ["workers", "crew", "add worker", "employee", "team", "technician"],
      explain: {
        title: "So you know who did what, without asking",
        body:
          "Workers get their own portal — their schedule, their jobs, proof-of-work photos, timesheets. This is where field-service software either sticks or dies: if the field team can log a job in under a minute, you get clean records automatically. If it's slower than a text message, they'll send a text message.",
        targetSelector: "a[href='/app/services/oliver_workers']",
        placement: "right",
      },
    },

    // ══ Get paid ═══════════════════════════════════════════════════════════
    {
      id: "oliver.invoices",
      label: "Invoice the work",
      sectionLabel: "Get paid",
      route: "/app/services/oliver_invoices",
      keywords: ["invoice", "create invoice", "send invoice", "bill customer", "get paid"],
      explain: {
        title: "The single biggest cash leak in field service",
        body:
          "Work finished but never invoiced. It's never a decision — it's a job that got marked done on a Friday and forgotten by Monday. An invoice builds from the job, so the line items are already right. Invoice within 48 hours while the work is fresh in the customer's mind; that's when it gets paid fastest and questioned least.",
        targetSelector: "a[href='/app/services/oliver_invoices']",
        placement: "right",
      },
      doIt: [
        {
          targetSelector: 'button[data-tour="new-invoice"]',
          advance: "click",
          title: "Start an invoice",
          body: "Click New invoice. Nothing sends until you say so.",
          placement: "bottom",
        },
        {
          targetSelector: '[data-tour="invoice-customer"]',
          advance: "next",
          waitForMs: 1500,
          title: "Pick who it's for",
          body: "Choose the customer you added earlier. Their details and history come along automatically — click Next when you've picked one.",
          placement: "right",
        },
        {
          targetSelector: 'button[data-tour="save-invoice"]',
          advance: "click",
          title: "Save it",
          body: "Saved as a draft. From here you can add line items from your price list, then send it with a card-payment link attached.",
          placement: "top",
        },
      ],
    },
    {
      id: "oliver.payments",
      label: "Take the payment",
      sectionLabel: "Get paid",
      route: "/app/services/oliver_payments",
      keywords: ["payments", "take payment", "card payment", "stripe", "payment link", "get paid faster"],
      explain: {
        title: "Make paying you the easy option",
        body:
          "Invoices carry a pay-now link, and every charge lands here — paid, refunded, disputed. Card payment on the invoice is the highest-return change most service businesses make: it converts \"I'll post you a cheque\" into money today, without a single chase call.",
        targetSelector: "a[href='/app/services/oliver_payments']",
        placement: "right",
      },
    },
    {
      id: "oliver.recurring",
      label: "Turn one-offs into recurring revenue",
      sectionLabel: "Get paid",
      route: "/app/services/oliver_recurring",
      keywords: ["recurring", "subscription", "maintenance plan", "repeat customer", "contract"],
      explain: {
        title: "The difference between a busy year and a stable one",
        body:
          "Subscriptions bill and schedule on repeat — maintenance plans, seasonal contracts, service agreements. If you've done ten jobs for someone, they're a candidate. One recurring customer is worth several one-off ones, because you stop paying to win the same work twice.",
        targetSelector: "a[href='/app/services/oliver_recurring']",
        placement: "right",
      },
    },

    // ══ Know if it worked ══════════════════════════════════════════════════
    {
      id: "oliver.insights",
      label: "See how the business is running",
      sectionLabel: "Know if it worked",
      route: "/app/services/oliver_ia_insights_trends",
      keywords: ["insights", "reports", "how is my business doing", "revenue report", "operations score"],
      explain: {
        title: "The scored read on your operation",
        body:
          "Quote win rate, invoice ageing, how far out you're booked, crew performance — scored on where you stand and which way you're moving, in plain English. Watch \"booked ahead\" most closely: it's the earliest warning you'll get that next month is going to be quiet, back when there's still time to do something about it.",
        targetSelector: "a[href='/app/services/oliver_ia_insights_trends']",
        placement: "right",
      },
    },
  ],
};
