// sparkJourney.ts — SPARK (CRM & Marketing) consulting curriculum.
//
// Ordered the way a consultant would actually teach it, NOT the way the nav
// is sorted. The order is the lesson: almost everyone starts by trying to
// send something, which is exactly why most CRMs are abandoned inside a year
// (55-70% of CRM rollouts fail their objectives; ~70% of CRM data goes stale
// annually — see ENGAGEMENT_ALERTS_CATALOG research). We teach: get your
// people in → organise them → prove you can reach an inbox → then send →
// then make it run without you.
//
// Voice: a consultant sitting next to them. Explain WHY, name the mistake
// people make, then show the fix. Never "This is the Contacts page."
import type { Journey } from "./types";

export const SPARK_JOURNEY: Journey = {
  product: "spark",
  productLabel: "CRM & Marketing",
  accent: "#EF6C33",
  tourId: "journey_spark_tour_v1",
  interactiveId: "journey_spark_interactive_v1",
  tourTitle: "CRM & Marketing — guided by your consultant",
  interactiveTitle: "CRM & Marketing — do it with me",
  oneLiner: "Set up a CRM you'll actually keep using",
  steps: [
    // ══ Understand what you're looking at ══════════════════════════════════
    {
      id: "spark.welcome",
      label: "How to think about SPARK",
      sectionLabel: "Start here",
      route: "/app/services/spark_overview",
      keywords: ["what is spark", "spark overview", "where do i start", "getting started crm"],
      explain: {
        title: "Two tools wearing one coat",
        body:
          "SPARK is a CRM (who you know) and marketing (what you send them). Nearly everyone starts with the sending — and that's why most CRMs get abandoned within a year. We'll do it in the order that sticks: get your people in, organise them, prove you can reach an inbox, and only then send. About 10 minutes, and you can stop anywhere.",
        placement: "center",
      },
    },

    // ══ Get your people in ═════════════════════════════════════════════════
    {
      id: "spark.contacts",
      label: "Add your first contact",
      sectionLabel: "Get your people in",
      route: "/app/services/spark_contacts",
      keywords: ["add contact", "create contact", "new contact", "add customer to crm", "add someone"],
      explain: {
        title: "Contacts are the foundation — everything keys off them",
        body:
          "One row per human. Every campaign, automation, deal and score in SPARK points back to a contact. The reason CRMs die isn't missing features — it's that people stop trusting the data. So start honest: 50 contacts you trust beat 5,000 you don't.",
        targetSelector: "a[href='/app/services/spark_contacts']",
        placement: "right",
      },
      doIt: [
        {
          targetSelector: 'button[data-tour="new-contact"]',
          advance: "click",
          title: "Add your first contact",
          body: "Click New contact. We'll fill it in together — it takes about thirty seconds.",
          placement: "bottom",
        },
        {
          targetSelector: 'input[data-tour="contact-first-name"]',
          advance: "input",
          waitForMs: 1500,
          title: "Type their first name",
          body: "Use a real person you actually know — a customer, a lead, anyone. Test data is how a CRM starts feeling fake.",
          placement: "right",
        },
        {
          targetSelector: 'input[data-tour="contact-email"]',
          advance: "input",
          title: "Add their email",
          body: "This is the key SPARK matches on — campaigns, opens, clicks and company detection all hang off it.",
          placement: "right",
        },
        {
          targetSelector: 'button[data-tour="save-contact"]',
          advance: "click",
          title: "Save",
          body: "That's it. SPARK reads the email domain and can group them under a company automatically — you'll see them in the list right away.",
          placement: "top",
        },
      ],
    },
    {
      id: "spark.import",
      label: "Import your spreadsheet",
      sectionLabel: "Get your people in",
      route: "/app/services/spark_contact_import",
      keywords: ["import contacts", "csv import", "upload spreadsheet", "excel contacts", "bulk add contacts"],
      explain: {
        title: "You already have a list somewhere — bring it",
        body:
          "A spreadsheet, your phone, your email contacts, an old system. This is the honest answer to \"I don't have time to type all these in.\" Map your columns once and SPARK handles the rest, skipping duplicates instead of creating twins. This one step is usually the difference between a CRM that gets used and one that doesn't.",
        targetSelector: "a[href='/app/services/spark_contact_import']",
        placement: "right",
      },
    },

    // ══ Organise them ══════════════════════════════════════════════════════
    {
      id: "spark.lists",
      label: "Lists vs Segments vs Tags",
      sectionLabel: "Organise them",
      route: "/app/services/spark_lists",
      keywords: [
        "create list", "new list", "email list", "make a list",
        "list vs segment", "what is a segment", "difference between list and segment", "tags",
      ],
      explain: {
        title: "The three-way confusion, settled",
        body:
          "Everyone mixes these up, so here's the rule. A LIST is a folder you put people in by hand — it only changes when you change it. A SEGMENT is a rule (\"opened something in the last 90 days\") — it updates itself forever, so it's never stale. A TAG is a sticky note on one person (\"met at the trade show\"). Rule of thumb: tag the facts, segment the behaviour, list the one-offs. Get this right and everything downstream is easy.",
        targetSelector: "a[href='/app/services/spark_lists']",
        placement: "right",
      },
    },
    {
      id: "spark.segments",
      label: "Build a segment that maintains itself",
      sectionLabel: "Organise them",
      route: "/app/services/spark_segments",
      keywords: ["create segment", "new segment", "dynamic list", "automatic list", "filter contacts"],
      explain: {
        title: "Write the rule once; it stays true forever",
        body:
          "A segment is where a CRM starts paying you back. \"Customers who haven't bought in 6 months\" is a segment you build once and can mail every quarter without ever rebuilding it. Compare that to a hand-made list, which is accurate the day you make it and wrong a month later.",
        targetSelector: "a[href='/app/services/spark_segments']",
        placement: "right",
      },
    },

    // ══ Prove you can reach an inbox ═══════════════════════════════════════
    {
      id: "spark.deliverability",
      label: "Check you can actually reach inboxes",
      sectionLabel: "Prove you can send",
      route: "/app/services/spark_deliverability",
      keywords: ["deliverability", "spam folder", "emails going to spam", "authenticate domain", "dkim", "spf", "sender domain"],
      explain: {
        title: "Do this before your first send, not after your first problem",
        body:
          "If you send from a domain you haven't authenticated, mailbox providers treat you as suspicious and quietly file you under spam — you'll never see a bounce, just silence. Authenticating is a one-time setup that protects every campaign you'll ever send. Watch your bounce rate here too: above 2% and providers start throttling everything you send, not just the bad addresses.",
        targetSelector: "a[href='/app/services/spark_deliverability']",
        placement: "right",
      },
    },

    // ══ Stop typing people in by hand ══════════════════════════════════════
    {
      id: "spark.forms",
      label: "Capture new people automatically",
      sectionLabel: "Stop doing it by hand",
      route: "/app/services/spark_forms",
      keywords: ["create form", "contact form", "website form", "lead capture", "form to crm", "connect website to crm"],
      explain: {
        title: "The fix for the #1 reason CRMs get abandoned",
        body:
          "Manual data entry is what kills CRMs — every field you type by hand is a toll booth between you and your actual job. A form on your website drops straight into Contacts, tagged and timestamped, while you're asleep. Build it once and your CRM starts feeding itself instead of waiting on you.",
        targetSelector: "a[href='/app/services/spark_forms']",
        placement: "right",
      },
    },
    {
      id: "spark.templates",
      label: "Save a template",
      sectionLabel: "Stop doing it by hand",
      route: "/app/services/spark_templates",
      keywords: ["email template", "create template", "save template", "reuse email"],
      explain: {
        title: "So the second campaign takes ten minutes, not two hours",
        body:
          "The first email you build is slow. If you save it as a template, every one after it starts at 80% done. This is the quiet difference between businesses that email monthly and businesses that email once, love it, and never get around to it again.",
        targetSelector: "a[href='/app/services/spark_templates']",
        placement: "right",
      },
    },

    // ══ Now send ═══════════════════════════════════════════════════════════
    {
      id: "spark.campaigns",
      label: "Send your first campaign",
      sectionLabel: "Now send something",
      route: "/app/services/spark_campaigns",
      keywords: ["send campaign", "create campaign", "send email", "new campaign", "email blast", "newsletter"],
      explain: {
        title: "Everything so far was so this part works",
        body:
          "A campaign is one message to a group — pick who, write it, send or schedule. Because you organised first, you're not blasting everyone; you're mailing a segment that makes sense. Start smaller than feels right: a good email to 200 engaged people beats a generic one to 2,000.",
        targetSelector: "a[href='/app/services/spark_campaigns']",
        placement: "right",
      },
      onPage: [
        {
          title: "Every campaign you've sent, with how it did",
          body: "One row per campaign. Status tells you whether it's a draft, scheduled, or already gone out — drafts are safe to open and edit, nothing sends until you press send.",
          targetSelector: "table",
          placement: "top",
        },
        {
          title: "This is your open rate — the number that matters most",
          body: "The share of people who actually opened it. For most small businesses 20–30% is healthy; under 15% usually means the subject line didn't earn the click, or you're landing in spam. Watch the trend across campaigns more than any single number — one bad subject line is noise, three in a row is a pattern.",
          targetSelector: '[data-tour="campaign-open-rate"]',
          placement: "left",
        },
        {
          title: "Start a new one here",
          body: "New campaign opens the composer: pick who it goes to, write it, preview it, then send or schedule. You can leave at any point and it stays a draft.",
          targetSelector: 'button[data-tour="new-campaign"]',
          placement: "bottom",
        },
      ],
      doIt: [
        {
          targetSelector: 'button[data-tour="new-campaign"]',
          advance: "click",
          title: "Start a campaign",
          body: "Click New campaign. Nothing here sends until you explicitly tell it to — every step is reversible.",
          placement: "bottom",
        },
        {
          targetSelector: 'input[data-tour="campaign-name"]',
          advance: "input",
          waitForMs: 1500,
          title: "Name it (internal only)",
          body: "Your recipients never see this. \"July newsletter\" or \"Winter promo\" — something you'll recognise in six months.",
          placement: "right",
        },
        {
          targetSelector: 'input[data-tour="campaign-subject"]',
          advance: "input",
          title: "Write the subject line",
          body: "This decides whether the rest gets read. Type {{ to insert a merge tag like their first name — it fills per person automatically.",
          placement: "right",
        },
        {
          targetSelector: 'button[data-tour="save-campaign"]',
          advance: "click",
          title: "Save as a draft",
          body: "Saved, not sent. Re-open it any time to choose recipients, preview, and send when you're ready.",
          placement: "top",
        },
      ],
    },

    // ══ Make it run without you ════════════════════════════════════════════
    {
      id: "spark.automations",
      label: "Make it run without you",
      sectionLabel: "Make it run without you",
      route: "/app/services/spark_workflows_automations",
      keywords: ["automation", "workflow", "welcome email", "automatic email", "drip", "sequence", "auto respond"],
      explain: {
        title: "The highest-leverage ten minutes in SPARK",
        body:
          "A welcome email that fires at 2am to someone who just filled in your form is worth more than a campaign you send when you remember to. Automations are \"when this happens, do that\" — set up once, running forever. If you build exactly one, make it the welcome: it hits people at peak interest, which is when replies actually happen.",
        targetSelector: "a[href='/app/services/spark_workflows_automations']",
        placement: "right",
      },
    },

    // ══ Connect it to money ════════════════════════════════════════════════
    {
      id: "spark.pipelines",
      label: "Track deals to revenue",
      sectionLabel: "Connect it to money",
      route: "/app/services/spark_pipelines",
      keywords: ["pipeline", "deals", "sales pipeline", "track deal", "opportunity"],
      explain: {
        title: "Where marketing stops being a cost centre",
        body:
          "A pipeline tracks a person from interested to paid, in stages you define. It's how you answer the question every owner eventually asks: which of this actually made money? Without it, marketing is a guess — and guesses are the first thing cut when budgets tighten.",
        targetSelector: "a[href='/app/services/spark_pipelines']",
        placement: "right",
      },
    },

    // ══ Know if it worked ══════════════════════════════════════════════════
    {
      id: "spark.insights",
      label: "See if any of it is working",
      sectionLabel: "Know if it worked",
      route: "/app/services/spark_ia_insights_trends",
      keywords: ["insights", "reports", "how is my marketing doing", "open rate", "analytics", "score"],
      explain: {
        title: "Your scored read on the whole thing",
        body:
          "Insights scores where you stand and which way you're moving, then tells you what's driving it in plain English. Check it monthly, not daily — email moves in send cycles, and daily watching just makes good weeks look like bad ones. When something needs your attention, we'll come tell you rather than wait for you to look.",
        targetSelector: "a[href='/app/services/spark_ia_insights_trends']",
        placement: "right",
      },
    },
  ],
};
