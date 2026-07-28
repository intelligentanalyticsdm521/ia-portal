// arionJourney.ts — ARION (Digital Presence) consulting curriculum.
//
// Why people stop maintaining their own website: not that the tools are
// missing, but fear of breaking something they can't fix, plus no idea what
// actually moves the needle. So this curriculum front-loads the two safety
// nets (backups + staging) BEFORE asking anyone to touch a page — confidence
// is the prerequisite for adoption. Then it teaches the small number of
// things that genuinely affect being found: being connected so you can
// measure, being claimed on the maps that matter, answering reviews, and
// publishing on a rhythm.
//
// Grounding: profiles that post weekly gain ~2.3 local-pack positions over
// six months; 89% of consumers expect a review reply and only ~5% of
// businesses answer; impressions measurably decline after ~30 quiet days
// (ENGAGEMENT_ALERTS_CATALOG research).
import type { Journey } from "./types";

export const ARION_JOURNEY: Journey = {
  product: "arion",
  productLabel: "Digital Presence",
  accent: "#2D9CDB",
  tourId: "journey_arion_tour_v1",
  interactiveId: "journey_arion_interactive_v1",
  tourTitle: "Digital Presence — guided by your consultant",
  interactiveTitle: "Digital Presence — do it with me",
  oneLiner: "Get found, stay safe to edit, and know what's working",
  steps: [
    {
      id: "arion.welcome",
      label: "How to think about ARION",
      sectionLabel: "Start here",
      route: "/app/services/arion_dashboard",
      keywords: ["what is arion", "arion overview", "website help", "where do i start website"],
      explain: {
        title: "Your website, your listings, and how people find you",
        body:
          "Most people stop maintaining their own site for one reason: they're afraid of breaking something they can't undo. So we'll do this in the order that removes the fear first — make it safe to change, then make it findable, then learn what's actually working. Nothing here requires you to be technical. About 8 minutes.",
        placement: "center",
      },
      onPage: [
        {
          title: "This bar follows you everywhere in ARION",
          body: "The site you're managing, when it was created, and when it last changed. If you run more than one site this is where you switch between them — everything on screen then refers to that site.",
          targetSelector: '[data-tour="site-domain"]',
          placement: "bottom",
        },
        {
          title: "WP Admin — the door into your actual website",
          body: "This button logs you straight into your WordPress admin, already signed in, in a new tab. That's where you edit page text, upload images and publish posts. ARION handles the measuring and the safety net; WP Admin is where the hands-on editing happens. If you only remember one button on this page, remember this one.",
          targetSelector: '[data-tour="wp-admin"]',
          placement: "left",
        },
      ],
    },

    // ══ Make it safe to touch ══════════════════════════════════════════════
    {
      id: "arion.backups",
      label: "Confirm you have backups",
      sectionLabel: "Make it safe to touch",
      route: "/app/services/arion_hosting_backups",
      keywords: ["backup", "restore", "undo website change", "broke my website", "revert"],
      explain: {
        title: "Look at this first — it's what makes everything else safe",
        body:
          "Your site is backed up automatically, and you can roll back to a previous day yourself. Knowing that changes how you use the product: the reason most owners never touch their own website is fear of breaking it permanently. You can't. Check this page once so you believe it, then go edit with confidence.",
        targetSelector: "a[href='/app/services/arion_hosting_backups']",
        placement: "right",
      },
    },
    {
      id: "arion.staging",
      label: "Practise somewhere safe",
      sectionLabel: "Make it safe to touch",
      route: "/app/services/arion_website_staging",
      keywords: ["staging", "test site", "preview changes", "sandbox", "try before publish"],
      explain: {
        title: "A private copy of your site to experiment on",
        body:
          "Staging is a duplicate only you can see. Try the redesign, break it, try again — then push it live when you're happy. For anything bigger than changing a paragraph, work here first. It costs you nothing and removes the last reason to leave your site untouched for two years.",
        targetSelector: "a[href='/app/services/arion_website_staging']",
        placement: "right",
      },
    },

    // ══ Get connected so anything can be measured ══════════════════════════
    {
      id: "arion.analytics",
      label: "Connect your analytics",
      sectionLabel: "Get connected",
      route: "/app/services/arion_analytics_overview",
      keywords: ["analytics", "ga4", "google analytics", "connect analytics", "traffic data", "visitors"],
      explain: {
        title: "Without this, half your dashboards stay dark",
        body:
          "Google Analytics tells you who visits and what they do; Search Console tells you what people searched to find you. Connecting them is a few clicks and it's the difference between advice based on your actual numbers and advice based on generic best practice. Do it now even if you never open the traffic reports — everything downstream gets sharper.",
        targetSelector: "a[href='/app/services/arion_analytics_overview']",
        placement: "right",
      },
    },

    // ══ Be findable where it counts ════════════════════════════════════════
    {
      id: "arion.business",
      label: "Claim your Google listing",
      sectionLabel: "Be findable locally",
      route: "/app/services/arion_business_overview",
      keywords: ["google business profile", "gbp", "google listing", "maps", "local", "claim listing"],
      explain: {
        title: "For a local business this outranks your website",
        body:
          "When someone searches for what you do near where they are, Google shows the map listings first. That listing — hours, photos, services, reviews — is doing more work than your homepage. If you only fix one thing this month, make it this one.",
        targetSelector: "a[href='/app/services/arion_business_overview']",
        placement: "right",
      },
    },
    {
      id: "arion.reviews",
      label: "Answer your reviews",
      sectionLabel: "Be findable locally",
      route: "/app/services/arion_business_reviews",
      keywords: ["reviews", "reply to review", "bad review", "respond review", "reputation", "google reviews"],
      explain: {
        title: "The cheapest advantage available to you",
        body:
          "About 89% of customers expect a reply to a review — and only around 5% of businesses actually do it. That gap is free advantage. Answer everything within a couple of days, especially the negative ones: a calm, specific reply to a bad review persuades more future customers than the five-star ones do, because it shows what happens when something goes wrong.",
        targetSelector: "a[href='/app/services/arion_business_reviews']",
        placement: "right",
      },
    },
    {
      id: "arion.posts",
      label: "Post to your listing",
      sectionLabel: "Be findable locally",
      route: "/app/services/arion_business_posts",
      keywords: ["google post", "gbp post", "post to google", "listing update"],
      explain: {
        title: "Thirty quiet days is where visibility starts slipping",
        body:
          "Google favours listings that show signs of life. Businesses posting weekly gain roughly two local-pack positions over six months versus those that never post. It doesn't need to be clever — a job you finished, a seasonal note, a photo. Twice a month is the floor.",
        targetSelector: "a[href='/app/services/arion_business_posts']",
        placement: "right",
      },
    },

    // ══ Be findable in search ══════════════════════════════════════════════
    {
      id: "arion.keywords",
      label: "Track the searches that matter",
      sectionLabel: "Be findable in search",
      route: "/app/services/arion_seo_keywords",
      keywords: ["keywords", "add keyword", "track keyword", "seo", "rankings", "search terms"],
      explain: {
        title: "Track what customers type, not what you'd type",
        body:
          "This is the classic mistake: businesses track their own brand name and industry jargon. Your customers search plainly — \"emergency plumber near me\", not \"hydronic services\". Add ten honest terms a real customer would type, including your town, and you'll get a truthful picture of where you actually stand.",
        targetSelector: "a[href='/app/services/arion_seo_keywords']",
        placement: "right",
      },
      doIt: [
        {
          targetSelector: '[data-tour="add-keyword"]',
          advance: "click",
          title: "Add your first keywords",
          body: "Click to add keywords. Think like a customer who doesn't know your company name.",
          placement: "bottom",
        },
        {
          targetSelector: '[data-tour="keyword-paste"]',
          advance: "input",
          waitForMs: 1500,
          title: "Type a few real searches",
          body: "One per line. Include your town — \"dentist ankeny\" tells you far more than \"dentist\" ever will.",
          placement: "right",
        },
      ],
    },
    {
      id: "arion.rankings",
      label: "Read your rankings honestly",
      sectionLabel: "Be findable in search",
      route: "/app/services/arion_seo_rankings",
      keywords: ["rankings", "position", "where do i rank", "ranking report", "page one"],
      explain: {
        title: "Page two is where the opportunity actually is",
        body:
          "Positions 1-3 take most of the clicks, and page one is the line that matters. But the fastest wins are the terms sitting at 11-20 — already ranking, one nudge from page one. Refreshed content or a few internal links moves those far more cheaply than chasing something you rank 80th for.",
        targetSelector: "a[href='/app/services/arion_seo_rankings']",
        placement: "right",
      },
    },

    // ══ Keep it alive ══════════════════════════════════════════════════════
    {
      id: "arion.content",
      label: "Publish on a rhythm",
      sectionLabel: "Keep it alive",
      route: "/app/services/arion_website_content",
      keywords: ["content", "blog", "add page", "write post", "publish", "edit website"],
      explain: {
        title: "Consistency beats brilliance, by a lot",
        body:
          "Sites that publish regularly hold their rankings; sites that go quiet drift down while competitors don't. One genuinely useful page a month beats five in a burst and then silence for a year. Write the answers to questions customers actually ask you on the phone — that's both the easiest content to write and the kind that gets found.",
        targetSelector: "a[href='/app/services/arion_website_content']",
        placement: "right",
      },
    },
    {
      id: "arion.security",
      label: "Keep it healthy",
      sectionLabel: "Keep it alive",
      route: "/app/services/arion_website_security_overview",
      keywords: ["security", "updates", "plugins", "site health", "hacked", "ssl"],
      explain: {
        title: "Boring, and it protects everything else",
        body:
          "Security scans, plugin updates and your SSL certificate live here. None of it is exciting, and all of it is the reason your site is still up. An expired certificate shows every visitor a browser warning; an unpatched plugin is how sites get defaced. We watch these and tell you when something needs you — you don't need to check daily.",
        targetSelector: "a[href='/app/services/arion_website_security_overview']",
        placement: "right",
      },
    },

    // ══ Know if it worked ══════════════════════════════════════════════════
    {
      id: "arion.insights",
      label: "See what's actually working",
      sectionLabel: "Know if it worked",
      route: "/app/services/arion_ia_insights_trends",
      keywords: ["insights", "reports", "how is my website doing", "seo score", "visibility score"],
      explain: {
        title: "Six areas, scored, with the reasons attached",
        body:
          "Search visibility, local presence, audience, content, technical health and social — each scored on where you stand and which way you're moving, with the detail reports that explain why. Monthly is the right cadence: search moves slowly, and checking weekly will have you reacting to noise instead of trends.",
        targetSelector: "a[href='/app/services/arion_ia_insights_trends']",
        placement: "right",
      },
    },
  ],
};
