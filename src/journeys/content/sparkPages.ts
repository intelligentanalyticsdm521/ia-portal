// sparkPages.ts — teaching copy for every page in the SPARK nav, in order.
//
// SPARK is safe to practise in (a contact is not a payment), so the hands-on
// exercises live here: create a contact, then delete it. Nothing in this
// walkthrough ever sends an email to a real person — the campaign exercise
// stops at "save as draft".
import type { PageContentMap } from "../pageGuide";

export const SPARK_PAGES: PageContentMap = {
  // ── Dashboard ───────────────────────────────────────────────────────────
  spark_overview: {
    title: "Two tools wearing one coat",
    body:
      "SPARK is a CRM (who you know) and marketing (what you send them). Nearly everyone starts with the sending, and that's exactly why most CRMs get abandoned within a year. We'll walk it in the order that sticks: people in, organised, then sending.",
  },

  // ── CRM ─────────────────────────────────────────────────────────────────
  spark_contacts: {
    title: "Contacts — the foundation everything keys off",
    body:
      "One row per human. Every campaign, automation, deal and score points back to a contact. CRMs don't die from missing features — they die when people stop trusting the data. Fifty contacts you trust beat five thousand you don't.",
    doIt: [
      {
        targetSelector: 'button[data-tour="new-contact"]',
        advance: "click",
        title: "Let's create a record together",
        body: "We'll make a throwaway contact called Test, then delete it — so you've done the whole cycle once and nothing is left behind.",
        placement: "bottom",
      },
      {
        targetSelector: 'input[data-tour="contact-first-name"]',
        advance: "input",
        waitForMs: 1500,
        title: "First name — type: Test",
        body: "Type Test. Press Enter when you're done, or click Next — it waits for you to finish, it won't jump ahead mid-word.",
        placement: "right",
      },
      {
        targetSelector: 'input[data-tour="contact-email"]',
        advance: "input",
        title: "Email — type: test@email.com",
        body: "Type test@email.com. This is the field SPARK matches on for campaigns and opens. Creating a contact never emails them.",
        placement: "right",
      },
      {
        targetSelector: 'button[data-tour="save-contact"]',
        advance: "click",
        title: "Save the record",
        body: "Click Create. Your contact is stored immediately and appears in the list behind this panel.",
        placement: "top",
      },
      {
        targetSelector: 'button[data-tour="contact-open"]',
        advance: "click",
        waitForMs: 2500,
        title: "Now open it back up",
        body: "Every contact opens into a full record — activity, notes, lists, tags. Click the view button on any row to go in. (Yours is the newest one.)",
        placement: "left",
      },
      {
        targetSelector: 'button[data-tour="contact-tab-delete"]',
        advance: "click",
        waitForMs: 2000,
        title: "Delete lives inside the record",
        body: "Tabs across the top hold everything about this person. Delete is deliberately last — the danger zone convention, so you never hit it by accident.",
        placement: "bottom",
      },
      {
        targetSelector: 'button[data-tour="contact-delete-confirm"]',
        advance: "click",
        waitForMs: 1500,
        title: "Remove the test record",
        body: "Click Delete contact. If a real customer had invoices or jobs attached, SPARK warns you first and shows exactly what's linked before anything goes.",
        placement: "top",
      },
    ],
  },
  spark_contact_import: {
    body:
      "You already have a list somewhere — a spreadsheet, your phone, an old system. Map the columns once and SPARK skips duplicates instead of creating twins. This one page is usually the difference between a CRM that gets used and one that doesn't.",
  },
  spark_accounts: {
    body:
      "Companies group contacts under one business, so you see everyone you deal with at a firm together. Matters if you sell to businesses; safe to skip if you sell to households.",
  },
  spark_lists: {
    title: "Lists vs Segments vs Tags — settled",
    body:
      "A LIST is a folder you fill by hand and it only changes when you change it. A SEGMENT is a rule that updates itself forever. A TAG is a sticky note on one person. Rule of thumb: tag the facts, segment the behaviour, list the one-offs.",
  },
  spark_segments: {
    body:
      "Write the rule once and it stays true — \"customers who haven't bought in six months\" is a segment you build today and mail every quarter without rebuilding. This is where a CRM starts paying you back.",
  },
  spark_tags: {
    body:
      "Free-form labels — where someone came from, what they're interested in. Keep the vocabulary small; twenty tags used consistently beat two hundred used once each.",
  },
  spark_contact_360: {
    body:
      "Everything about one person on a single screen — emails, jobs, invoices, notes, score. This is the page to open before you pick up the phone to someone.",
  },
  spark_health_score: {
    body:
      "A per-contact engagement score built from recency, activity and email behaviour. Use it to spot who's cooling off while there's still time to do something about it.",
  },

  // ── Outreach ────────────────────────────────────────────────────────────
  spark_campaigns: {
    title: "Campaigns — one message to a group",
    body:
      "Pick who, write it, send or schedule. Because you organised first, you're mailing a segment that makes sense rather than blasting everyone. Start smaller than feels right: a good email to 200 engaged people beats a generic one to 2,000.",
    onPage: [
      {
        title: "This is your open rate",
        body: "The share who actually opened it. For most small businesses 20–30% is healthy; under 15% usually means the subject line didn't earn the click, or you're landing in spam. Watch the trend across campaigns — one bad subject is noise, three in a row is a pattern.",
        targetSelector: '[data-tour="campaign-open-rate"]',
        placement: "left",
      },
    ],
    doIt: [
      {
        targetSelector: 'button[data-tour="new-campaign"]',
        advance: "click",
        title: "Start a campaign",
        body: "Click New campaign. Nothing sends until you explicitly tell it to — we're stopping at draft.",
        placement: "bottom",
      },
      {
        // The composer opens on a channel picker, and the compose fields don't
        // render until a channel is chosen — so this step is load-bearing, not
        // decorative. Skipping it stalled the whole exercise.
        targetSelector: 'button[data-tour="campaign-channel-email"]',
        advance: "click",
        waitForMs: 2500,
        title: "Email or text message?",
        body: "Pick Email. The choice changes what you write next — email gets a subject line and a full layout, SMS is one short message. You can't switch a campaign's channel later, so this is the one decision to make deliberately.",
        placement: "bottom",
      },
      {
        targetSelector: 'input[data-tour="campaign-name"]',
        advance: "input",
        waitForMs: 2500,
        title: "Name it (internal only)",
        body: "Recipients never see this. Something you'll recognise in six months.",
        placement: "right",
      },
      {
        targetSelector: 'input[data-tour="campaign-subject"]',
        advance: "input",
        title: "Subject line",
        body: "This decides whether the rest gets read. Type {{ to insert a merge tag like their first name — it fills per person automatically.",
        placement: "right",
      },
      {
        targetSelector: 'button[data-tour="save-campaign"]',
        advance: "click",
        title: "Save as a draft",
        body: "Saved, not sent. Re-open any time to choose recipients, preview and send when you're ready.",
        placement: "top",
      },
    ],
  },
  spark_newsletter: {
    body:
      "A long-form recurring newsletter with its own calendar and per-issue numbers. Different rhythm from campaigns: a newsletter is a habit your audience expects, which is what makes it the most durable channel you own.",
  },
  spark_social: {
    body:
      "Schedule posts across your channels and see what's queued versus shipped. Batching a month in one sitting is the only approach that survives a busy week.",
  },
  spark_sms_inbox: {
    body:
      "Two-way texting — replies land here and you answer inline. Text gets read within minutes where email waits hours, so save it for things that are genuinely time-sensitive or you'll train people to ignore it.",
  },
  spark_deliverability: {
    title: "Deliverability — check this before your first send",
    body:
      "Send from an unauthenticated domain and mailbox providers quietly file you under spam — you never see a bounce, just silence. Authenticating is one-time and protects every campaign you'll ever send. Keep bounces under 2% or providers throttle everything, not just the bad addresses.",
  },

  // ── Capture ─────────────────────────────────────────────────────────────
  spark_forms: {
    title: "Forms — the fix for the #1 reason CRMs get abandoned",
    body:
      "Manual data entry is what kills CRMs. A form on your website drops straight into Contacts, tagged and timestamped, while you're asleep. Build it once and your CRM starts feeding itself instead of waiting on you.",
  },
  spark_form_builder: {
    body:
      "Build the form field by field. Ask for the least you can get away with — every extra field measurably costs you submissions, and you can always learn the rest later.",
  },
  spark_landing_pages: {
    body:
      "Standalone pages for a specific offer, with no nav to wander off into. Pair one with a campaign when you want a single action rather than a browse.",
  },
  spark_qr_codes: {
    body:
      "Trackable codes for vans, flyers and business cards. The tracking is the point: it tells you whether the physical spend actually produced anything.",
  },

  // ── Workflow & Automations ──────────────────────────────────────────────
  spark_workflows_automations: {
    title: "Automations — the highest-leverage ten minutes in SPARK",
    body:
      "A welcome email firing at 2am to someone who just filled in your form is worth more than a campaign you send when you remember. If you build exactly one, make it the welcome — it lands at peak interest, which is when replies actually happen.",
  },
  spark_tasks: {
    body:
      "Follow-ups assigned to a person with a due date, so \"someone should call them back\" becomes someone's job. The gap between a good CRM and a shelf-ware one is usually here.",
  },
  spark_journey_builder: {
    body:
      "Multi-step sequences that branch on what someone does — opened but didn't click, clicked but didn't buy. Start with a two-step version; elaborate journeys built on day one rarely survive contact with reality.",
  },
  spark_ab_tests: {
    body:
      "Send two subject lines to slices of your list and let the winner go to the rest. Test one thing at a time or you learn nothing from the result.",
  },
  spark_approvals: {
    body:
      "A review step before anything goes out. Worth switching on the moment more than one person can send — one wrong send to your whole list is a bad afternoon.",
  },
  spark_anomaly_alerts: {
    body:
      "Rules that watch for things going wrong on their own — bounce spikes, sudden drops, webhook failures. It's the smoke alarm rather than the dashboard.",
  },
  spark_templates: {
    body:
      "Reusable email and SMS layouts. The first email is slow; saved as a template, every one after starts at eighty percent done — the quiet difference between emailing monthly and emailing once.",
  },
  spark_audience_sync: {
    body:
      "Pushes segments out to ad platforms so you're advertising to the right people. Useful once your segments are trustworthy; before that it just spends money faster.",
  },

  // ── Sales ───────────────────────────────────────────────────────────────
  spark_lead_inbox: {
    body:
      "New enquiries in one queue, before they become contacts or deals. Work it daily — speed of first reply is the strongest predictor of whether you win the job.",
  },
  spark_pipelines: {
    body:
      "The stages a lead moves through from interested to paid. Keep it to four or five stages you'd actually recognise; long pipelines get abandoned halfway through.",
  },
  spark_deals: {
    body:
      "Individual opportunities with a value and a stage. This is how marketing stops being a cost centre and starts answering \"which of this made money\".",
  },
  spark_attribution: {
    body:
      "Which channel actually produced each deal. Expect a surprise — most businesses over-credit the last click and under-credit whatever introduced them in the first place.",
  },

  // ── Customer Success ────────────────────────────────────────────────────
  spark_nps: {
    body:
      "One question — would you recommend us — scored over time. It finds unhappy customers before they leave a public review, and happy ones before you forget to ask for one.",
  },
  spark_nps_schedules: {
    body:
      "When the survey goes out — after a job, quarterly, on a date. After a completed job is the highest-response moment, while the experience is still fresh.",
  },
  spark_reviews: {
    body:
      "Your public reviews across platforms, in one place to read and reply. Reviews are the single strongest local ranking factor you can directly influence.",
  },
  spark_referrals: {
    body:
      "Turns happy customers into introductions with a trackable programme. Referred customers close faster and churn less than any paid channel — this is just asking, systematically.",
  },

  // ── AI Tools ────────────────────────────────────────────────────────────
  spark_intelligence: {
    body:
      "Scores every contact on engagement, recency, value and quality. Use it to prioritise who gets a personal call rather than another email — it's a sorting tool, not a verdict.",
  },
  spark_activity_stream: {
    body:
      "A live feed of everything happening — opens, clicks, form fills, stage changes. Good for a sanity check that data is flowing; not somewhere to spend your day.",
  },

  // ── IA Insights ─────────────────────────────────────────────────────────
  spark_ia_insights_health: {
    body:
      "Whether your CRM data is complete enough to trust the reports. Check here first when a number looks wrong — it's usually a gap in the data, not a real collapse.",
  },
  spark_ia_insights_trends: {
    title: "Trends — your CRM and marketing, scored",
    body:
      "List growth, engagement, deliverability, pipeline — scored on where you stand and which way you're moving, with detail reports explaining why. Monthly is the right cadence; email moves in send cycles and daily checking just makes good weeks look bad.",
  },
  spark_ia_insights_intelligence: {
    body:
      "The modelled view — who's likely to churn, which campaigns are worth repeating, where the pipeline leaks. Start with the opportunities; they're ranked by what they're worth.",
  },
  spark_ia_insights_reports: {
    body:
      "The plain record — real-time activity, usage against your plan, and the audit log. No scoring, just the facts as they happened.",
  },
};
