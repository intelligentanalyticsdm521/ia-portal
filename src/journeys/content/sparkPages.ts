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
    onPage: [
      {
        // D4 (Brandon 2026-07-30): "Make sure the tours walk through the
        // company tab and explains the difference there." Companies stopped
        // being its own nav page and became a view here, so the tour has to
        // teach the distinction rather than assume it's obvious.
        title: "Contacts, and the companies behind them",
        body:
          "These three buttons show the same people three ways. LIST is everyone, one row per person. KANBAN is those people by how far along they are with you. COMPANIES rolls them up by the business they work for — so a firm with four people you deal with is one row, not four. A contact is a person you can email; a company is who signs the cheque. If you sell to households, you can ignore Companies entirely.",
        targetSelector: 'button[data-tour="contacts-companies-tab"]',
        placement: "bottom",
      },
      {
        title: "Import brings your list in",
        body:
          "A spreadsheet, your phone, an old system — Import takes .csv or Excel .xlsx, matches your column names automatically (\"First Name\", \"Given Name\" and \"E-mail\" all work) and shows you what it found before anything is saved. Duplicates merge into the existing contact instead of creating twins. This one button is usually the difference between a CRM that gets used and one that doesn't.",
        targetSelector: 'button[data-tour="contact-import"]',
        placement: "bottom",
      },
    ],
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
        // The page marks ONLY the contact this session just created, so this
        // resolves whatever they typed. If the create failed there's no marked
        // row and the runner stops — it never opens a stranger's record and
        // walks them into deleting it.
        targetSelector: 'button[data-tour="contact-open"]',
        advance: "click",
        waitForMs: 2500,
        title: "Now open it back up",
        body: "Every contact opens into a full record — activity, notes, lists, tags. Your new row is highlighted; click the view button to go in.",
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
        body: "Click Delete contact. SPARK won't take your word for it — it checks what's linked to this person first and shows you before anything happens.",
        placement: "top",
      },
      {
        // Contact delete is TWO clicks: "Delete contact" only opens the
        // cascade-preview overlay. Without this step the exercise stopped on
        // that overlay, the contact was never actually deleted, and the copy
        // claiming "nothing is left behind" was untrue. Verified against the
        // DB: is_deleted stayed false until this step existed.
        targetSelector: 'button[data-tour="contact-delete-final"]',
        advance: "click",
        waitForMs: 2000,
        title: "Confirm, and it's gone",
        body: "This is the real delete. For a customer with jobs or invoices attached you'd see exactly what's linked right here before confirming — that check is why it's two clicks and not one. It's reversible from the trash for 30 days.",
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
        body: "Recipients never see this; it's how you'll recognise it in six months. Call it anything — we're deleting this one at the end.",
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
      {
        // The page marks ONLY the draft this session just created, so this
        // resolves whatever the user named it and can never point at another
        // campaign. If the save failed there's no marked row and the runner
        // stops instead of guessing.
        targetSelector: 'tr[data-tour="campaign-open"]',
        advance: "click",
        waitForMs: 2500,
        title: "There it is — open it back up",
        body: "Your new draft is highlighted in the list. Click it to go back in — everything stays editable right up until you send.",
        placement: "bottom",
      },
      {
        targetSelector: 'button[data-tour="campaign-delete"]',
        advance: "click",
        waitForMs: 2000,
        title: "And tidy it away",
        body: "Delete draft sits bottom-left, away from Send now on purpose. It only ever appears on drafts — once a campaign has gone out you can't delete it, because its results are part of your reporting.",
        placement: "top",
      },
      {
        targetSelector: 'button[data-tour="campaign-delete-confirm"]',
        advance: "click",
        waitForMs: 1500,
        title: "Confirm, and we're done",
        body: "Click Delete draft. That's the full loop — created, saved, reopened and removed, with nothing left behind and nothing ever sent.",
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
    title: "Automations — four switches, no building",
    body:
      "A welcome email firing at 2am to someone who just filled in your form is worth more than a campaign you send when you remember. There's nothing to design here: four automations that earn their keep, each either on or off.",
    onPage: [
      {
        title: "Start with Welcome",
        body:
          "If you switch on exactly one, make it this. It goes out within an hour of someone landing in your CRM — from a form, an import, or typed in by hand — which is the moment they're most interested in you. It's the highest-open email you'll ever send. Every switch tells you WHEN it fires and WHY it's worth it, so you're never guessing what's about to go out in your name.",
        targetSelector: '[data-tour="automation-welcome"]',
        placement: "bottom",
      },
      {
        title: "Off is not delete",
        body:
          "Switch one off and it stops immediately — but the automation and everything it's already done stay put, so turning it back on picks up where it left off. That's why it's safe to try one for a month and change your mind.",
        targetSelector: '[data-tour="automation-birthday"]',
        placement: "top",
      },
    ],
    doIt: [
      {
        targetSelector: '[data-tour="automation-welcome"] [role="switch"]',
        advance: "click",
        waitForMs: 3000,
        title: "Switch on the welcome",
        body: "Click the toggle. It starts working immediately — and you can switch it straight back off, which we'll do next so nothing goes out unexpectedly.",
        placement: "left",
      },
      {
        targetSelector: '[data-tour="automation-welcome"] [role="switch"]',
        advance: "click",
        waitForMs: 2500,
        title: "And back off again",
        body: "Click it once more. That's the whole interface — no canvas, no branches, no rules to maintain. Turn it on for real when you've written the email you want it to send.",
        placement: "left",
      },
    ],
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

  // ── Sending setup ────────────────────────────────────────────────────────
  // Added 2026-09-01. These are the technical settings a client hits early and
  // has no way to reason about — Brandon walked Sender Setup cold and could not
  // tell what it was for, which is the same wall a customer hits.
  spark_sender_domains: {
    title: "Sender Setup — deciding what address your emails come from",
    body:
      "Every email you send has to come from somewhere, and the receiving inbox has to believe it. This page gives you two ways to get there. Option one hands your business its own address on our email domain — nothing to set up, working in about a minute. Option two sends from your own domain, which is what your customers should see, and needs four records added to that domain once. Both are step-by-step; you can't get lost in either.",
    onPage: [
      {
        title: "Two options, and the honest difference",
        body:
          "The Intelligent Analytics option gives you an address like yourbusiness@ia-dm.com. It works instantly because we already own and have proved that domain — there is genuinely nothing for you to do. Your own business email looks better to customers and is the one we recommend, but a domain is not something we can change on your behalf, so somebody has to add four records to it once. Start on option one if you want to send today; move to option two when you have ten minutes and access to your domain.",
      },
      {
        title: "Sending and receiving are different jobs",
        body:
          "The address on the front of your email does not have to be a real mailbox — plenty of businesses send from an address nobody logs into. What must be real is the reply address. If someone hits Reply and that address has no mail server behind it, their message disappears and nobody finds out. The walkthrough checks that for you before you finish, which is step four.",
      },
      {
        title: "The four records, without the jargon",
        body:
          "The first proves the domain is really yours — it is the one most often missed, and nothing works without it. The second is a public list of who is allowed to send using your address; ours has to be on it. The last two are signing keys, so an inbox can tell the message wasn't altered on the way. A fifth, optional one tells inboxes what to do with fakes; leave it until everything else is green.",
      },
      {
        title: "Only ever ONE 'who may send as you' record",
        body:
          "A domain is allowed exactly one of these. If there is already one — for Google Workspace, or your website host — add our part to the existing record and keep everything that is in it. Replacing it is how a business accidentally stops its own email, and it is the single most common way this goes wrong.",
      },
      {
        title: "Waiting is not failing",
        body:
          "Records take minutes to spread around the world, sometimes longer. Straight after you add them the check will say 'not yet' — that is expected. Come back and press Check again rather than assuming something broke. If a record is still missing an hour later, it is almost always because the Name and the Value got swapped.",
      },
    ],
    doIt: [
      {
        targetSelector: 'button[data-tour="sender-add"]',
        advance: "click",
        title: "Let's set your sending address up",
        body:
          "This is a once-only job and you end up able to send email as your business. Click 'Set up sending'.",
        placement: "bottom",
      },
      {
        targetSelector: '[data-tour="sender-own-email"]',
        advance: "click",
        waitForMs: 2000,
        title: "Pick the recommended option",
        body:
          "Two cards. The left one gives you an address on our domain in a minute — a perfectly good place to start, and you can come back to it any time. We're going to walk the right one, 'Send from my own business email', because that is what your customers should see. Click it.",
        placement: "bottom",
      },
      {
        targetSelector: 'input[data-tour="sender-email"]',
        advance: "input",
        waitForMs: 2000,
        title: "Step 1 — the address emails come FROM",
        body:
          "A full address on a domain you control, like hello@yourbusiness.com. Not a Gmail or Outlook address — those providers will not let anyone send as them. It does not need to be a mailbox you can log into; it is what appears in the recipient's inbox. We take the domain from the part after the @.",
        placement: "right",
      },
      {
        targetSelector: '[data-tour="sender-continue"], .spark-page',
        advance: "next",
        title: "Step 2 — where replies land",
        body:
          "Leave the box ticked and replies come back to the same address. Untick it if you would rather replies went somewhere else — the inbox you actually check every day is usually the right answer. This is the one people get wrong, and they find out when a lead goes missing.",
        placement: "top",
      },
      {
        targetSelector: 'input[data-tour="sender-display-name"], .spark-page',
        advance: "next",
        title: "Step 3 — the name people see",
        body:
          "In an inbox the name shows first and the address second. Use the name customers know you by, and keep it short — inboxes cut long names off. The preview underneath shows exactly how it will look.",
        placement: "right",
      },
      {
        targetSelector: '.spark-page',
        advance: "next",
        title: "Step 4 — can that address actually receive?",
        body:
          "We look up the reply domain and tell you plainly whether mail can be delivered there. Green means replies will arrive. Red means that domain has no mail server, so anything sent to it vanishes — go back and use a different reply address. Amber means the lookup itself failed and is worth retrying.",
        placement: "top",
      },
      {
        targetSelector: '[data-tour="sender-verify"], .spark-page',
        advance: "next",
        waitForMs: 4000,
        title: "Step 5 — the four records",
        body:
          "If we look after DNS for this domain there is a button and we add them for you. If not, you get all four with Copy buttons, plus 'Email these to my web admin' — which is exactly what to press if somebody else built your website. Each card says in plain English what that record is for; the Name and Value are what gets typed in.",
        placement: "top",
      },
      {
        targetSelector: '.spark-page',
        advance: "next",
        title: "Step 6 — check, and be patient once",
        body:
          "Press Check and each record turns green as it goes live. 'Not yet' straight after publishing is normal, not a failure — wait a few minutes and check again. Continue only lights up once the required records have all passed.",
        placement: "top",
      },
      {
        targetSelector: '.spark-page',
        advance: "next",
        title: "Step 7 — switching sending on",
        body:
          "The last step connects your domain to the service that issues the send and registers your address on it. Verified has never meant ready — this is the part that makes it true. If it says the final step is pending an Intelligent Analytics administrator, that is ours to finish, not yours: your records are right, and your emails keep going out from the Intelligent Analytics address until it is done.",
        placement: "top",
      },
    ],
  },
  spark_senders: {
    title: "Senders — the actual name and address on the email",
    body:
      "The domain earns the right to send; a sender is what the recipient actually sees in their inbox — 'Rolling In It <hello@rollinginit.com>'. Add one per address you want to send from, mark the one you use most as default, and set a reply-to if replies should land somewhere else, like a Gmail you actually read.",
    onPage: [
      {
        title: "You need a verified domain first",
        body:
          "A sender can only sit on a domain that has passed Sender Setup. If the address you want isn't offered, the domain behind it isn't verified yet — go back one page rather than trying to force it here.",
      },
      {
        title: "Reply-to is the one people forget",
        body:
          "You can send as an address that has no mailbox behind it. What you must not do is leave customers replying into a void — set reply-to to an address a human reads. This is exactly how a client's quote replies get lost.",
      },
    ],
  },
  spark_signatures: {
    body:
      "The block that goes at the bottom of your emails — name, role, phone, links. Set it once here and every send picks it up, instead of it being retyped (and drifting) in each template.",
  },
  spark_custom_fields: {
    title: "Custom Fields — the things we didn't think of",
    body:
      "Every business tracks something the standard contact record doesn't have: policy renewal date, gate code, dog's name. Define it once here and it becomes a real field on every contact — filterable, segmentable, and usable as a merge tag in a campaign.",
  },
  spark_quiet_hours: {
    title: "Quiet Hours — don't text people at 3am",
    body:
      "A tenant-wide window where outbound SMS is held back. Texts land on a phone on a bedside table, and a 3am message is how you lose a customer and earn a complaint. Set the window once; anything scheduled inside it waits until the window opens rather than being dropped.",
  },
  spark_tracking: {
    title: "Tracking Pixels — knowing which visits became customers",
    body:
      "A one-line snippet for your website. With it, an anonymous visitor who later fills in a form can be joined up to everything they read beforehand — which is what makes attribution reporting meaningful instead of guesswork. Without it, you only ever see what people did AFTER they were already in your CRM.",
  },
  spark_calendar_sync: {
    body:
      "Connects your real calendar so bookings and availability stay in step. Once linked, a meeting booked here shows up in the calendar you actually live in, and a busy block there stops it being double-booked here.",
  },
  spark_service_category: {
    body:
      "Groups what you sell into categories, so reporting and campaign targeting can talk about 'plowing' or 'design work' rather than listing every individual service.",
  },
  spark_api_keys: {
    title: "API Keys — letting other software talk to yours",
    body:
      "A key is a password for a program rather than a person. Create one when another system needs to read or write your data, and give it only to that system. Treat it exactly like a password: it is shown once, it is not recoverable, and anything holding it can act as you.",
    onPage: [
      {
        title: "If a key leaks, revoke it",
        body:
          "Revoking is instant and safe — the key stops working, and you issue a new one to whatever legitimately needed it. Never leave a suspect key alive because rotating it feels like a hassle.",
      },
    ],
  },
  spark_secrets: {
    title: "Tenant Secrets — credentials for your connected accounts",
    body:
      "Where the credentials for third-party services you've connected are held. You rarely need this page directly; connections are normally made from the integration itself. Come here to see what is stored and to remove something you've stopped using.",
  },
  spark_config_backup: {
    title: "Configuration Backup — a copy of how you've set things up",
    body:
      "Exports your SPARK configuration — dashboards, reports, custom fields, rules and templates — as a file you can re-import. It is a snapshot of your SETUP, not of your contacts or your sends. Worth taking before a big reorganisation, so 'undo' is a real option.",
  },
};
