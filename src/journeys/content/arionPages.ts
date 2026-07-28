// arionPages.ts — teaching copy for every page in the ARION nav, in nav order.
//
// One entry per nav key. Voice: a consultant walking you down the menu —
// what this page is FOR, and the one thing that matters on it. Tight on
// purpose: 46 pages at 1-2 sentences each is a ~7 minute walk, which is the
// target. A page that needs more gets `onPage` stops instead of a longer
// paragraph.
//
// Keys must match SubNav item keys exactly; pageGuide.ts reports any nav page
// missing an entry rather than shipping filler.
import type { PageContentMap } from "../pageGuide";

export const ARION_PAGES: PageContentMap = {
  // ── Dashboard ───────────────────────────────────────────────────────────
  arion_dashboard: {
    title: "Your website at a glance",
    body:
      "Start here. This is the one screen that tells you whether your site is healthy, being found, and getting visitors — without opening anything else. Everything below in the menu is the detail behind one of these numbers.",
    onPage: [
      {
        title: "The site you're working on",
        body: "The domain, when it was created, and when it last changed. Run more than one site and you switch between them here — everything on screen then refers to that site.",
        targetSelector: '[data-tour="site-domain"]',
        placement: "bottom",
      },
      {
        title: "WP Admin — the door into your actual website",
        body: "This logs you straight into WordPress, already signed in, in a new tab. That's where you edit page text, upload images and publish posts. ARION measures and protects; WP Admin is where hands-on editing happens. If you remember one button here, make it this one.",
        targetSelector: '[data-tour="wp-admin"]',
        placement: "left",
      },
    ],
  },

  // ── Website ─────────────────────────────────────────────────────────────
  arion_website_overview: {
    body:
      "The health of the site itself — is it up, is it fast, is the certificate valid, is the plugin talking to us. When someone says \"my website is broken\", this is the first page to open.",
  },
  arion_website_content: {
    body:
      "Every page and post on your site, with when it was last touched. Sites that publish regularly hold their rankings; ones that go quiet drift down. Use the last-updated column to spot the pages that have gone stale.",
  },
  arion_website_ai_builder: {
    body:
      "Describe a page you need and it drafts one for you — layout, copy and images. It writes a draft, never publishes for you, so there's nothing to be nervous about. Good for the pages you keep meaning to write and never do.",
  },
  arion_website_content_seo_overview: {
    body:
      "Scores each page on the on-page basics: title, description, headings, internal links, readability. This is the cheapest SEO work there is — fixing a weak title on a page you already have beats writing a new one.",
  },
  arion_website_staging: {
    body:
      "A private copy of your site only you can see. Try the redesign, break it, try again, then push it live when you're happy. For anything bigger than changing a paragraph, work here first — it's what makes experimenting safe.",
  },

  // ── Hosting ─────────────────────────────────────────────────────────────
  arion_hosting_overview: {
    body:
      "Where your site actually lives — the plan, the server, disk and bandwidth. Mostly you'll never touch this; it's here for when you need to prove something to a developer.",
  },
  arion_hosting_domain_dns: {
    body:
      "Your domain name and its DNS records. Two things matter: the domain doesn't expire, and the SSL certificate stays valid. An expired certificate shows every visitor a security warning, which costs you more than a slow month of SEO.",
  },
  arion_hosting_backups: {
    title: "Backups — the page that makes everything else safe",
    body:
      "Your site is backed up automatically and you can roll back to an earlier day yourself. Look at this once so you believe it: the reason most owners never touch their own website is fear of breaking it permanently. You can't.",
  },

  // ── Security & Performance ──────────────────────────────────────────────
  arion_website_security_overview: {
    body:
      "Firewall, scans and login protection. Boring and load-bearing — most hacked small-business sites weren't targeted, they just had an unpatched door open. We watch this and tell you when something needs you.",
  },
  arion_website_security_vulnerabilities: {
    body:
      "Anything flagged as a known weakness, usually an outdated plugin. Treat the criticals as real — that's the list attackers work from.",
  },
  arion_website_performance_cache: {
    body:
      "Core Web Vitals — Google's measure of how fast your site feels to a real person. Load time is a ranking factor and a bounce factor: a slow page loses the visitor before your content ever gets a chance.",
  },
  arion_website_performance_images: {
    body:
      "Images are the usual reason a site is slow — a photo straight off a phone can be twenty times bigger than it needs to be. This compresses them without you noticing a quality difference.",
  },
  arion_website_updates: {
    body:
      "WordPress and plugin updates. Staying current is the single highest-value maintenance habit; nearly every site compromise traces back to something that had an update available and didn't take it.",
  },

  // ── Search Engine Analytics ─────────────────────────────────────────────
  arion_analytics_overview: {
    body:
      "Who visited, how many, and the trend. If Google Analytics isn't connected yet, this and the next four pages stay dark — connecting it is the highest-value five minutes in ARION.",
  },
  arion_analytics_traffic: {
    body:
      "Where visitors came from — search, direct, social, referral, paid. The mix matters more than the total: all-search is fragile, all-direct means nothing new is finding you.",
  },
  arion_analytics_audience: {
    body:
      "Who they are — devices, cities, new versus returning. The city breakdown is the one to check: if most of your traffic is outside your service area, your content is attracting the wrong people.",
  },
  arion_analytics_content: {
    body:
      "Which pages actually get read. Usually a surprise — a page you forgot about is doing the work while the one you laboured over sits idle. Put your effort where the traffic already is.",
  },
  arion_analytics_conversions: {
    body:
      "Visits that turned into something — a form, a call, a booking. This is the number that connects the website to money. Everything else on the analytics pages is a means to this.",
  },

  // ── SEO ─────────────────────────────────────────────────────────────────
  arion_seo_overview: {
    body:
      "Your search health in one score, with what's moving it. Search moves slowly — check this monthly, not daily, or you'll be reacting to noise.",
  },
  arion_seo_keywords: {
    title: "Keywords — track what customers type, not what you'd type",
    body:
      "The classic mistake is tracking your own brand name and industry jargon. Real customers search plainly — \"emergency plumber near me\", not \"hydronic services\". Add ten honest terms including your town.",
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
        body: "One per line, and include your town — \"dentist ankeny\" tells you far more than \"dentist\" ever will.",
        placement: "right",
      },
    ],
  },
  arion_seo_rankings: {
    body:
      "Where you actually sit for each term, month over month. Positions 1-3 take most of the clicks; page one is the line that matters. The cheapest wins are terms sitting at 11-20 — already ranking, one nudge from page one.",
  },
  arion_seo_site_audit: {
    body:
      "A crawl of your site looking for the technical things that quietly hold rankings back — broken links, missing titles, redirect chains. Work the errors first and ignore most warnings.",
  },
  arion_seo_competitors: {
    body:
      "The businesses ranking against you for your terms, and what they rank for that you don't. That gap list is the most useful content plan you'll get for free.",
  },
  arion_seo_ai_search: {
    body:
      "Whether AI assistants mention your business when someone asks for what you do. A growing share of \"who should I call\" now happens here instead of a search results page, and most competitors aren't watching it at all.",
  },
  arion_seo_ai_prompts: {
    body:
      "The questions we ask the AI assistants on your behalf — phrase them the way a customer would. Edit these to match how people actually describe your service.",
  },
  arion_seo_market_monitor: {
    body:
      "Watches your market for movement — competitors gaining, new entrants, shifts in who ranks. It runs on its own and surfaces changes worth knowing about.",
  },

  // ── Search ──────────────────────────────────────────────────────────────
  arion_search_performance: {
    body:
      "Straight from Google Search Console: the actual searches that showed your site, how often people clicked, and your average position. High impressions with low clicks means people see you and choose someone else — usually a title problem, not a ranking problem.",
  },
  arion_search_indexing: {
    body:
      "Whether Google has actually indexed your pages. A page that isn't indexed cannot rank at all, no matter how good it is — so if something you published is invisible, check here first.",
  },
  arion_search_bing_copilot: {
    body:
      "The same picture for Bing, which also feeds Copilot. Bing is a third of some local markets and almost nobody optimises for it, so the competition is thinner.",
  },

  // ── Business Profile ────────────────────────────────────────────────────
  arion_business_overview: {
    title: "Google Business Profile — for a local business this outranks your website",
    body:
      "When someone searches for what you do near where they are, Google shows map listings first. That listing — hours, photos, services, reviews — does more work than your homepage. If you fix one thing this month, make it this.",
  },
  arion_business_locations: {
    body:
      "Your address, hours and service area as Google shows them. Wrong hours is the single most expensive small error in local search: someone drives to you and you're shut.",
  },
  arion_business_reviews: {
    title: "Reviews — the cheapest advantage available to you",
    body:
      "About 89% of customers expect a reply and only around 5% of businesses give one. Answer everything within a couple of days, especially the negatives — a calm reply to a bad review persuades more future customers than the five-star ones do.",
  },
  arion_business_insights: {
    body:
      "How people found the listing and what they did — calls, direction requests, website clicks. These are people trying to reach you, so it's closer to revenue than most website metrics.",
  },
  arion_business_posts: {
    body:
      "Short updates on your listing. Google favours profiles showing signs of life; businesses posting weekly gain roughly two local-pack positions over six months. Twice a month is the floor — a finished job or a seasonal note is enough.",
  },
  arion_business_services: {
    body:
      "The services listed on your profile. Fill these in properly — they're matched against what people search for, and a thin list means you simply don't appear for half of what you actually do.",
  },
  arion_business_bing_overview: {
    body:
      "Your Bing Places listing, the same idea as Google's. Quick to claim and most competitors haven't bothered.",
  },
  arion_business_apple_overview: {
    body:
      "Apple Maps. Every iPhone reads from Apple's listing, not Google's — so if you've only claimed Google, you're invisible to half the phones in your market.",
  },

  // ── My Brand ────────────────────────────────────────────────────────────
  my_brand_image_studio: {
    body:
      "Generate and edit images for your site and social posts — backgrounds removed, sizes cropped per platform. Saves the \"I need a photo and don't have one\" stall.",
  },
  my_brand_templates: {
    body:
      "Reusable designs in your brand colours and fonts. Build a layout once and every future post starts at eighty percent done, which is the difference between posting regularly and posting once.",
  },
  my_brand_assets: {
    body:
      "Your logos, photos and files in one place, so you're not hunting through email for the right version of your logo. Anything here can be dropped straight into a design or post.",
  },
  my_brand_calendar: {
    body:
      "What's scheduled and what's already gone out, across your connected channels. The calendar view is what turns \"we should post more\" into an actual plan.",
  },
  my_brand_social_content: {
    body:
      "Draft, schedule and publish posts. Write several in one sitting and schedule them out — batching is the only approach that survives a busy week.",
  },

  // ── IA Insights ─────────────────────────────────────────────────────────
  arion_ia_insights_health: {
    body:
      "Whether we're receiving good data from everything we're connected to. If a number elsewhere looks wrong, check here first — it's usually a disconnected source, not a real drop.",
  },
  arion_ia_insights_trends: {
    title: "Trends — six areas of your presence, scored",
    body:
      "Search visibility, local presence, audience, content, technical health and social — each scored on where you stand and which way you're moving, with detail reports explaining why. Click any area, then any section, to drill in.",
  },
  arion_ia_insights_intelligence: {
    body:
      "The same data run through models rather than counted — where things are heading, what's unusual, and where effort pays off most. Start with the opportunities: they're ranked by what they're actually worth.",
  },
};
