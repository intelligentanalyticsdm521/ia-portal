// reportNotes.ts — plain-English notes for every detail report.
//
// Brandon, 2026-07-25: people need to understand what the numbers actually
// mean. Every deep report renders two short notes at the top:
//   about   — what this report measures, in the owner's language
//   reading — what good looks like and what to do with it
//
// Keyed by report id. Intelligence-mirror reports (…_fc / …_anom / …_opp and
// the named forecast/anomaly/opportunity ids) fall back to a template built
// from the base report's note, so modeled variants stay in sync automatically.
// A quarterly model review edits THIS file alongside deepConfigs.ts.

export interface ReportNote { about: string; reading: string }

const N = (about: string, reading: string): ReportNote => ({ about, reading });

export const REPORT_NOTES: Record<string, ReportNote> = {
  // ══ ARION — Search Visibility ══
  keyword_movement: N(
    "Where your website ranks on Google for the search terms that matter to your business, tracked every month.",
    "Position 1–3 gets most of the clicks; page one (top 10) is where you're genuinely visible. Watch the movement tables: a keyword climbing into the top 10 is new business walking in the door, and one sliding out is worth defending before the traffic goes with it.",
  ),
  spark_send_times: N(
    "When your audience actually opens email — every hour-of-week send window with at least 20 real sends, ranked by open rate.",
    "Send your next campaign in the top window listed here. Windows are only shown once they have 20+ sends, so every rate is statistically meaningful — as your send volume grows, more windows appear and the recommendation sharpens.",
  ),
  striking_distance: N(
    "Keywords ranked 11–20 — sitting on page two of Google, one push away from page one. Ranked by how many people search each term every month.",
    "These are the cheapest wins in SEO: the page already ranks, it just needs a nudge — refreshed content, a few internal links, or a better title. Start from the top of the list (highest search volume) and work down; a move from position 12 to 8 can be the difference between invisible and found.",
  ),
  share_of_voice: N(
    "Of all the times someone searched for what you sell, how often you appeared versus your main local competitors.",
    "Your line rising while a competitor's falls means you're taking their customers' attention. If a competitor is pulling away, their content or reviews are winning — check what changed on their side.",
  ),
  query_performance: N(
    "The actual searches people typed into Google before seeing your site — with how often you appeared, how often they clicked, and where you ranked.",
    "High impressions with low clicks means people see you but choose someone else — usually a title or description problem, not a ranking problem. The searches gaining clicks are what's working; write more for those topics.",
  ),
  page_search_performance: N(
    "Which pages on your website are earning Google traffic, page by page.",
    "A few pages usually carry most of the traffic. If an important page (like Services or Pricing) earns almost nothing from search, it needs better content or isn't ranking for the right terms.",
  ),
  search_device_split: N(
    "Your search clicks split between phone, desktop, and tablet visitors.",
    "Most local searches happen on phones. If mobile clicks drop while desktop holds, check your site's mobile speed and experience first — that's where the customers are.",
  ),
  ctr_by_query: N(
    "For each search, how often people clicked you compared with what's typical for your ranking position.",
    "Ranking well but getting fewer clicks than expected means your listing text isn't selling the click. Rewriting that page's title and description is one of the cheapest wins in SEO.",
  ),
  referring_domains: N(
    "Other websites that link to yours. Links are one of Google's strongest trust signals.",
    "Steady growth from real local sites (directories, chambers, partners) lifts every ranking you have. A sudden drop can mean a partner site removed your listing — worth a quick check.",
  ),

  // ══ ARION — Local Presence ══
  gbp_discovery_split: N(
    "How customers found your Google Business Profile — through Search or Maps, on phone or desktop.",
    "Maps views are high-intent: those people are often ready to visit or call. If Maps discovery lags Search, your categories, service area, or photos likely need attention.",
  ),
  gbp_action_breakdown: N(
    "What people did after finding your Google listing — called, asked for directions, or clicked to your website.",
    "These are the closest thing to a customer raising their hand. Calls and direction requests usually convert far better than website visits, so a drop here hits revenue fastest.",
  ),
  review_feed: N(
    "Your most recent Google reviews, with ratings and whether you've replied.",
    "Reply to everything, even with one sentence — response rate is a published Google ranking signal, and unanswered negative reviews do double damage. Recent reviews matter more than old ones.",
  ),
  post_feed: N(
    "The updates, offers, and photos you've posted to your Google profile.",
    "Posts expire from view after about a week, so cadence beats perfection. One post a week keeps your listing looking alive — a dead listing reads as a closed business.",
  ),

  // ══ ARION — Audience & Conversion ══
  channel_breakdown: N(
    "Where your website visitors come from — search, direct, referrals, social, ads.",
    "Healthy businesses aren't dependent on one channel. If one channel is most of your traffic, a single algorithm change can hurt you — the movement table shows which channels are growing to lean into.",
  ),
  referral_sources: N(
    "The specific websites sending visitors to yours, each tracked over time.",
    "Rising referrers are relationships worth investing in; a falling one may have removed your link or changed their page. This is where a drop in traffic stops being a mystery and becomes a name.",
  ),
  device_breakdown: N(
    "Your visitors split by phone, desktop, and tablet.",
    "If most visitors are on phones but your enquiries come from desktop, your mobile experience is losing customers — check speed and form usability on a phone first.",
  ),
  geography: N(
    "Which cities your visitors are in, tracked monthly.",
    "Traffic from outside your service area rarely becomes a customer. Growth in the cities you actually serve is the number that matters — out-of-area growth can hide a real local decline.",
  ),
  conversion_by_source: N(
    "Which traffic sources produce actual enquiries, not just visits.",
    "A source can send lots of visitors and no customers. Judge each channel by its conversion column — that's the difference between traffic and business.",
  ),
  engagement_by_channel: N(
    "How engaged visitors from each channel are once they arrive — do they stay and read, or bounce?",
    "Low engagement from a channel means the promise that brought them doesn't match your page. High-engagement channels deserve more investment even if they're smaller.",
  ),
  engagement_by_page: N(
    "How well each landing page holds a visitor's attention.",
    "A high-traffic page with weak engagement is your biggest silent leak — visitors arrive and leave. Fix the page people actually land on before writing new ones.",
  ),

  // ══ ARION — Content ══
  top_pages: N(
    "Your most-viewed pages and how well each holds attention.",
    "Winners tell you what your audience wants more of. A previously strong page sliding down usually means it's aging out of search — a refresh often recovers it faster than a new page.",
  ),
  content_age: N(
    "How old your content is, grouped into age bands.",
    "Google favours fresh, maintained content. If most pages sit in the '1 year+' band, rankings decay quietly — refreshing your best old pages beats writing new ones.",
  ),
  word_count_dist: N(
    "How substantial your pages are, grouped by length.",
    "Thin pages (under ~300 words) rarely rank or convince anyone. They're candidates to expand or merge — a few strong pages beat many weak ones.",
  ),
  content_gap_keywords: N(
    "Searches where Google already shows your site sometimes — but you have no page that properly answers them.",
    "This is demand you're leaving on the table. Each row is a page worth creating; the impressions trend shows whether that demand is growing while you wait.",
  ),
  competitor_rankings: N(
    "Your average Google position against each competitor tracked for the same searches, with how many page-one and top-3 spots each of you holds.",
    "This is the scoreboard. A competitor holding more page-one positions is taking work you could have — the keyword report tells you which specific searches to go after first. Your own row is flagged so the comparison is unambiguous.",
  ),
  backlink_quality: N(
    "Every site linking to yours, with its authority, what it links to, the words it uses, and whether the link is still live.",
    "A count of links tells you nothing; this tells you whether they are worth having. Chase the lost ones from strong domains first — a polite email recovers more than people expect and costs far less than earning a new link.",
  ),
  anchor_text_profile: N(
    "The words other sites use when they link to you, grouped and shown as a share of your whole link profile.",
    "A natural profile is mostly your business name and bare URLs. One commercial phrase taking a large share across many domains is what a paid-link pattern looks like to Google — worth diluting with normal links rather than adding more of the same.",
  ),
  pagespeed_scores: N(
    "Google's four PageSpeed scores — Performance, Accessibility, Best Practices and SEO — for phone and desktop, with how many individual checks pass.",
    "90+ is what Google calls good; under 50 is where visitors notice. Fix mobile before desktop: it is scored on a throttled connection because that is what most people are actually on.",
  ),
  pagespeed_field_data: N(
    "Speed measured from real Chrome visitors over the last 28 days, rather than a single lab test.",
    "When the lab score looks fine and this does not, believe this one — it is what Google uses for ranking and what your customers actually experienced. A missing row means too few visitors for Google to report, which is normal for a small site.",
  ),
  pagespeed_performance_audits: N(
    "Every speed check Google runs that your site did not pass, ordered by how much each one costs the score.",
    "The order is the point. Lighthouse weights these, so the top of the list is where an hour of developer time goes furthest — and the Elements affected column tells you whether it is a one-line fix or a pattern across the page.",
  ),
  pagespeed_accessibility_audits: N(
    "Accessibility checks your site failed — contrast, labels, alt text, keyboard and screen-reader support.",
    "Each row is somebody who cannot use part of your site: a screen reader announcing a button as just \"button\", text nobody can read against its background. It is also the area most likely to attract a complaint, and most of these are quick fixes.",
  ),
  pagespeed_seo_audits: N(
    "The mechanical checks Google runs to see whether it can read and index your page properly.",
    "These are not content problems — they are plumbing. Missing descriptions, blocked crawling, unreadable links. Usually fast to fix and they gate everything else you do on the page.",
  ),
  pagespeed_best_practice_audits: N(
    "Security and correctness checks — HTTPS, console errors, deprecated APIs, out-of-date JavaScript libraries.",
    "Individually small. Collectively they are the difference between a site that is maintained and one that is drifting, and an out-of-date library is the same class of risk as an out-of-date plugin.",
  ),
  ctr_opportunity: N(
    "Searches where you rank well but get clicked less than that position normally earns, with how many clicks a month you are leaving behind.",
    "This is the cheapest fix in search: you already won the position, and the title and description are what is losing the click. Work down the potential column — each row is an afternoon of rewriting, not a content project.",
  ),
  trend_breaks: N(
    "Points where a number stopped drifting and stepped — a sharp change that then held at the new level.",
    "A break has a cause with a date on it: a redesign, a migration, a plugin, a Google update. Look at what changed that month before treating it as a slow decline, because the fix is usually undoing one thing rather than working harder at everything.",
  ),
  // ══ ARION — 2026-08-14 reports over the expanded integrations ══
  search_by_country: N(
    "Which countries your site is found from in Google, with clicks and impressions for each.",
    "For a local business, traffic from outside your service area is not a win — it inflates every other number without ever becoming a customer. What matters is whether the places you actually serve are growing.",
  ),
  page_query_pairs: N(
    "Every page paired with the searches that brought someone to it, with the position that page holds for each one.",
    "This is the only view that answers \"what is this page actually ranking for\" — which is a different question from what you meant it to rank for. Pairs sitting at 11-20 are the cheapest work available: the page exists and Google already connects it to that search, so it needs strengthening rather than replacing.",
  ),
  search_appearance: N(
    "The presentation formats you earn in Google results — rich snippets, FAQs, videos, how-to steps.",
    "A result with a rich format takes up more of the page and gets clicked more at the same rank. If this is empty, you are competing on plain blue links against people who are not.",
  ),
  audience_by_country: N(
    "Where your visitors are, with how many are new, how long they stay, and how many leave immediately.",
    "Growth from the places you serve is the number that counts. Out-of-area growth can completely mask a local decline, which is why the bounce column matters as much as the session count.",
  ),
  browser_experience: N(
    "How your site behaves in each browser — sessions, bounce rate, and time on site.",
    "One browser bouncing far harder than the rest almost always means the site is broken in it, not that it is unpopular. Open your site in that browser and look; this is a bug report, not a statistic.",
  ),
  device_os_split: N(
    "Your visitors split by operating system, with how each one behaves.",
    "Same logic as the browser view: a big gap between iOS and Android usually points at something rendering badly on one of them rather than a difference in the people.",
  ),
  new_vs_returning: N(
    "How much of your traffic is people arriving for the first time versus people coming back.",
    "Almost all new visitors means marketing is working and nothing is holding anyone. Almost all returning means you are talking to the same small group — good for loyalty, a ceiling on growth.",
  ),
  traffic_by_hour: N(
    "What hour of the day people actually visit your site, across the whole week.",
    "This is when someone should be available to answer the phone, and when a campaign should land. Sending at 9am because that is when you are at your desk is a guess; this is the answer.",
  ),
  traffic_by_medium: N(
    "How people got to you — organic search, paid, referral, email, social — with how well each behaves once here.",
    "Volume without engagement is not traffic worth buying. Compare the bounce column across mediums before deciding where the next pound goes.",
  ),
  campaign_performance: N(
    "Each named campaign with the traffic it brought and what that traffic did.",
    "A campaign with high sessions and high bounce is money buying a click and nothing else — usually because the landing page does not say what the ad said. Match the page to the promise before spending more.",
  ),
  page_titles_read: N(
    "Your pages by what people actually read, with time on page and bounce rate.",
    "High views with a high bounce means the title is doing its job and the page is not. That is a rewrite, not a traffic problem.",
  ),
  gbp_visibility_split: N(
    "Where your Google listing gets seen — Search or Maps, on a phone or a desktop.",
    "Maps views are high intent: those people are often ready to visit or call. If mobile is most of your visibility, the site your listing points at is being judged on a phone — which makes the speed report the next thing to look at.",
  ),
  gbp_actions: N(
    "What people did after finding your listing — called, asked for directions, visited the site, sent a message, or booked.",
    "These are the closest thing to a customer raising their hand. Messages and bookings especially: someone taking that step has already decided, and a slow reply is the only thing left that can lose them.",
  ),
  core_web_vitals: N(
    "The three loading and stability measures Google ranks on, plus the supporting ones, for phone and desktop separately.",
    "These are not vanity numbers — they are a ranking input and a direct measure of what a visitor puts up with before giving up. Phone and desktop are shown apart on purpose: averaging them hides whichever one is bad, and it is almost always the phone.",
  ),
  pagespeed_opportunities: N(
    "Specific, named changes that would make the site faster, each with the time it saves.",
    "This is the list to hand whoever maintains the site. It is specific enough to act on without anyone diagnosing anything first — start at the top, because the savings are ordered.",
  ),
  page_reachability: N(
    "Every page with the number of other pages linking to it, whether it sits in a menu, and whether its own links still go anywhere.",
    "A page nothing links to is a page nobody finds — Google included. Fix orphans by adding one link from a page that already gets traffic; it costs ten minutes and is the highest-return thing on this report. Broken links are listed with their targets, so that section is a to-do list, not a search.",
  ),
  media_library: N(
    "Every file in your media library — size, dimensions, alt text, and whether any published page actually uses it.",
    "Oversized images are the most common reason a small-business site feels slow on a phone, and the visitor pays for them in load time and data. Missing alt text costs accessibility and image search together. Unused files are usually years of uploads nobody removed — check before deleting, but they slow every backup you take.",
  ),
  content_library: N(
    "Every page and post on your website, reviewed one by one — length, on-page SEO score, meta description, focus keyword, and how long since it was last touched.",
    "This is the review a consultant would do by hand on day one. Start with the opportunity lists: pages competing for the same keyword are the most expensive problem (you're bidding against yourself), missing meta descriptions are the cheapest fix. Thin and stale pages matter most on the pages that describe what you actually sell.",
  ),

  // ══ ARION — Technical ══
  pagespeed_history: N(
    "Google's speed score for your site over time, on phone and desktop.",
    "Below 50 on mobile actively costs you visitors and rankings. Big drops usually trace to one new image, plugin, or script — the month it dropped tells you what changed.",
  ),
  audit_issues: N(
    "Technical problems found on your site, from missing page descriptions to broken elements.",
    "Not all issues matter equally — fix Errors before Warnings, and issues on your money pages before anything else.",
  ),
  vulnerabilities: N(
    "Security weaknesses found on your site, usually out-of-date plugins.",
    "Out-of-date plugins are the number-one way small-business sites get hacked. Anything listed here is worth fixing this week, not this quarter.",
  ),
  broken_links: N(
    "Links on your site that lead nowhere.",
    "Each one wastes a visitor's click and a little of Google's trust. Fix or redirect them — it's fast, and it's pure cleanup win.",
  ),
  component_upkeep: N(
    "Every plugin and theme on your site, with whether it's current, has an update waiting, or has been left switched off and forgotten.",
    "Out-of-date plugins are the number-one way small-business sites get hacked, and a dormant plugin is just as exploitable as an active one — deactivating isn't removing. Update what's behind; delete what you've stopped using.",
  ),

  // ══ SPARK / OLIVER — 2026-08-14 ══
  spark_list_health: N(
    "Every contact grouped by whether you can actually reach them — invalid addresses, unsubscribes, people who have never engaged, and people who have gone quiet.",
    "This explains a disappointing send before anyone blames the copy. Contacts you cannot email inflate your list and drag every rate down; contacts who never open teach inbox providers your mail is ignorable, which costs you delivery to the people who do care. Clean both, then judge your campaigns.",
  ),
  spark_lifecycle_stages: N(
    "Where your contacts sit in the customer journey right now.",
    "A stage holding most of the list is either your genuine bottleneck or a stage nobody maintains. Contacts with no stage set cannot be segmented or automated to at all.",
  ),
  oliver_subscription_health: N(
    "Your recurring revenue by service, with how many subscriptions are active and how many are set to cancel.",
    "The cancelling column is the most actionable number in the product: those customers have already decided to leave and have not told you, and the period has not ended yet. A phone call today still changes the outcome.",
  ),
  oliver_job_status: N(
    "Your jobs grouped by where they are in the workflow.",
    "A pile in one status is usually a bottleneck rather than a busy week. Watch for work sitting completed but uninvoiced — that is revenue you have earned and not billed.",
  ),
  // ══ SPARK ══
  spark_contact_sources: N(
    "Where your new contacts come from each month.",
    "This is the top of your funnel. A source drying up now means fewer customers in two months — the trend warns you before revenue feels it.",
  ),
  spark_field_coverage: N(
    "How complete your contact records are — emails, phones, addresses, tags.",
    "You can't call a contact with no phone number or segment a list with no tags. Coverage gaps directly limit what your marketing can do.",
  ),
  spark_list_hygiene: N(
    "The unhealthy parts of your list — dormant contacts, bounces, unsubscribes, duplicates.",
    "A dirty list hurts deliverability for everyone you email. Growing dormancy is also a re-engagement opportunity: those people knew you once.",
  ),
  spark_lead_sources: N(
    "Which sources produce your leads, with how well each converts to customers.",
    "Judge sources by the conversion column, not volume. Ten referral leads that convert at 22% beat fifty ad clicks that convert at 5%.",
  ),
  spark_stage_flow: N(
    "How many leads sit at each stage of your pipeline, month over month.",
    "Leads piling up at one stage is a bottleneck — usually 'Contacted' (follow-up isn't happening) or 'Proposal' (quotes going quiet). The stage that grows while 'Won' doesn't is the one to fix.",
  ),
  spark_conversion_by_source: N(
    "Which sources actually produce paying customers, and how long each takes.",
    "This is where marketing spend decisions should come from. Fast-converting sources deserve the follow-up priority; slow ones may need a different nurture approach.",
  ),
  spark_sends_by_type: N(
    "Your email volume split by type — newsletters, promotions, automated flows.",
    "Automated flows typically out-convert blasts because the timing is personal. If nearly all your volume is manual blasts, automation is your biggest untapped lever.",
  ),
  spark_top_clicked: N(
    "The links people actually clicked in your emails.",
    "Clicks show intent. If 'Book now' out-clicks everything, lead with it; if nobody clicks pricing, the email isn't building enough interest to get them there.",
  ),
  spark_campaigns: N(
    "Each campaign you've sent, with its open and click rates.",
    "Around 21% opens and 2.5% clicks is typical for small business. One campaign far above the rest is a template worth repeating — far below, a subject line worth retiring.",
  ),
  spark_bounce_domains: N(
    "Emails that couldn't be delivered, grouped by the recipient's email provider.",
    "Rising bounces at one provider (like Gmail) can mean they've started filtering you — that's a reputation warning worth acting on before it spreads.",
  ),
  spark_unsub_reasons: N(
    "Why people are leaving your list, and how many marked you as spam.",
    "'Too many emails' rising means reduce frequency before the list shrinks further. Spam complaints are the most damaging signal there is — keep them near zero.",
  ),
  spark_automations: N(
    "Each automated flow, how often it ran, and how often it achieved its goal.",
    "Automations work while you sleep — a flow with a strong goal rate deserves more contacts routed into it; one near zero is sending email for nothing.",
  ),
  spark_engagement_cohorts: N(
    "Your contacts grouped by how recently they've engaged with you.",
    "Watch the flow between groups: engaged contacts cooling off is churn in slow motion, and the dormant group is a win-back campaign waiting to happen.",
  ),

  // ══ OLIVER ══
  oliver_revenue_by_service: N(
    "Your revenue split by service line, month over month.",
    "This shows what your business actually is, not what you think it is. A service line quietly shrinking deserves a decision: fix it or stop selling it.",
  ),
  oliver_invoice_aging: N(
    "Money you're owed, grouped by how overdue it is.",
    "The older an invoice gets, the less likely it's ever paid. Anything past 60 days needs a call, not another emailed reminder.",
  ),
  oliver_overdue_invoices: N(
    "The specific invoices that need chasing, worst first.",
    "This is your collections to-do list. Start at the top — the oldest, largest ones are the money most at risk.",
  ),
  oliver_invoice_size: N(
    "How your invoices distribute by size.",
    "Growth in the bigger bands means the work is getting more valuable, not just busier. Lots of small invoices with flat revenue means volume is masking stagnant pricing.",
  ),
  oliver_jobs_by_service: N(
    "Completed jobs split by service line.",
    "Compare against the revenue view: a service line with many jobs but little revenue is eating schedule for thin returns.",
  ),
  oliver_reschedule_reasons: N(
    "Why jobs got pushed, and whether each cause is growing.",
    "Weather you can't control — crew availability and equipment you can. If controllable reasons grow, the schedule is overcommitted.",
  ),
  oliver_backlog_age: N(
    "Booked-but-not-done jobs, grouped by how far out they sit.",
    "A healthy backlog is demand; a stale one (30+ days) is customers waiting too long — they cancel, and they remember.",
  ),
  oliver_pending_quotes: N(
    "Quotes sent that haven't been answered, with days waiting.",
    "Quotes go cold fast — following up within 2–3 days can double close rates. Anything waiting a week deserves a call today.",
  ),
  oliver_quotes_by_service: N(
    "Quote volume and win rate per service line.",
    "A low win rate on one service usually means pricing or positioning, not effort. A high win rate might mean you're priced too low — both are worth a look.",
  ),
  oliver_quote_size: N(
    "Your quotes grouped by dollar size, each with its own win rate.",
    "Big quotes closing at low rates is normal, but if the small ones also struggle, response speed is usually the real problem.",
  ),
  oliver_crew_performance: N(
    "Each crew's utilization, job count, and on-time rate.",
    "The on-time column is the customer-facing number — it's what reviews are made of. Sustained utilization above ~85% looks efficient but usually shows up next as reschedules and burnout.",
  ),
  oliver_booked_ahead: N(
    "How far into the future your schedule is filled.",
    "Growth in the 2-4-week bands means demand is compounding — and it's your early signal to raise prices or hire before the schedule bursts.",
  ),
  oliver_recurring_contracts: N(
    "Your repeat-revenue contracts and what each is worth monthly.",
    "Recurring revenue is the most valuable kind — it shows up without selling. A shrinking contract here is a relationship to save this week, not a line item.",
  ),
  oliver_top_customers: N(
    "Your biggest customers by monthly revenue, with lifetime value.",
    "If a few names carry most of your revenue, they deserve deliberate attention — and losing one is an event. A top customer trending down is the earliest churn warning you'll get.",
  ),

  // ══ ARGUS ══
  argus_impressions_by_channel: N(
    "Everywhere your business was seen this month — website search, Google profile, social — in one place.",
    "This is your total visibility across everything, not one tool's slice. When one channel falls, this view shows whether another picked up the slack or you genuinely lost reach.",
  ),
  argus_leads_by_source: N(
    "Every lead across all your products, traced back to its source.",
    "The '→ Customer %' column is the honest ranking of your marketing. The best source isn't the loudest one — it's the one that produces people who pay.",
  ),
  argus_revenue_by_source: N(
    "Actual revenue traced back to the marketing source that started it.",
    "This is the answer to 'what is my marketing worth?' in dollars. Sources that drive revenue — not clicks — are where the next dollar should go.",
  ),
  argus_events_by_product: N(
    "The activity flowing between your products — contacts created, jobs booked, invoices paid.",
    "Steady event flow means the products are genuinely connected and working together. A product going quiet here often surfaces days before anyone notices in the product itself.",
  ),
  argus_integrations: N(
    "The health of every connected data source, with last sync times.",
    "A silently broken integration means silently wrong reports everywhere downstream. Anything not marked Healthy is the first thing to fix — before trusting any number it feeds.",
  ),
};

// ── Modeled-variant templates ─────────────────────────────────────────────
// Intelligence-mirror reports derive their note from the base report so the
// modeled variants never drift out of sync with the trend report they model.

const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

const TEMPLATES: Record<"forecast" | "anomaly" | "opportunity", (base?: ReportNote) => ReportNote> = {
  forecast: (base) => N(
    base
      ? `A 3-month projection for each line item, based on its own 12-month trend. Underneath: ${lc(base.about)}`
      : "A 3-month projection for each line item, based on its own 12-month trend.",
    "The 'Proj.' column is the model's best estimate, with a confidence rating — 'high' means the trend has been steady enough to trust, 'low' means treat it as a rough direction, not a promise.",
  ),
  anomaly: (base) => N(
    base
      ? `Each line item checked against its own normal range. Underneath: ${lc(base.about)}`
      : "Each line item checked against its own normal range.",
    "The σ column measures how far outside its own normal pattern each item is. 'Watch' means unusual; 'Alert' means something genuinely changed — investigate those first, they rarely fix themselves.",
  ),
  opportunity: (base) => N(
    base
      ? `Line items ranked by where attention pays off most. Underneath: ${lc(base.about)}`
      : "Line items ranked by modelled impact — movement times the volume it carries.",
    "'Impact' weighs how much something moved by how much it matters. A small drop in a big line item outranks a big drop in a tiny one — work from the top of this list down.",
  ),
};

// Mirror-report id → the trend report it models. Ids whose stripped suffix
// equals the base report id (spark_lead_sources_fc → spark_lead_sources)
// resolve automatically; this map covers every id where they differ.
const MIRROR_BASE: Record<string, string> = {
  // ARION (named ids, no suffix convention)
  query_forecast: "query_performance", keyword_forecast: "keyword_movement", referral_forecast: "referral_sources",
  page_forecast: "top_pages", local_forecast_detail: "gbp_action_breakdown",
  query_anomaly: "query_performance", referral_anomaly: "referral_sources",
  local_anomaly: "gbp_action_breakdown", speed_anomaly: "pagespeed_history",
  keyword_opp: "keyword_movement", query_opp: "query_performance", page_opp: "top_pages",
  conversion_opp: "conversion_by_source", local_opp: "gbp_action_breakdown",
  // SPARK
  spark_cohorts_fc: "spark_engagement_cohorts", spark_cohorts_anom: "spark_engagement_cohorts", spark_cohorts_opp: "spark_engagement_cohorts",
  spark_sends_fc: "spark_sends_by_type", spark_bounce_anom: "spark_bounce_domains",
  // OLIVER
  oliver_jobs_fc: "oliver_jobs_by_service", oliver_jobs_anom: "oliver_jobs_by_service", oliver_jobs_opp: "oliver_jobs_by_service",
  oliver_revenue_fc: "oliver_revenue_by_service", oliver_aging_anom: "oliver_invoice_aging",
  oliver_quotes_fc: "oliver_quotes_by_service", oliver_quotes_opp: "oliver_quotes_by_service",
  oliver_contracts_fc: "oliver_recurring_contracts",
  oliver_customers_anom: "oliver_top_customers", oliver_customers_opp: "oliver_top_customers",
  oliver_crew_fc: "oliver_crew_performance", oliver_crew_anom: "oliver_crew_performance",
  // ARGUS
  argus_leads_fc: "argus_leads_by_source", argus_revenue_fc: "argus_revenue_by_source", argus_revenue_opp: "argus_revenue_by_source",
  argus_impr_fc: "argus_impressions_by_channel", argus_impr_anom: "argus_impressions_by_channel",
  argus_events_fc: "argus_events_by_product", argus_events_anom: "argus_events_by_product",
};

/** Which intelligence model a mirror report id encodes — null for plain trend reports. */
export function mirrorKindOf(id: string): "forecast" | "anomaly" | "opportunity" | null {
  if (/(_fc|_forecast)$/i.test(id) || /forecast/i.test(id)) return "forecast";
  if (/(_anom|_anomaly)$/i.test(id) || /anomal/i.test(id)) return "anomaly";
  if (/(_opp|_opportunity)$/i.test(id) || /opportunit/i.test(id)) return "opportunity";
  return null;
}

export function reportNotesFor(id: string): ReportNote | null {
  if (REPORT_NOTES[id]) return REPORT_NOTES[id];
  const kind = mirrorKindOf(id);
  if (!kind) return null;
  const baseId = MIRROR_BASE[id] || id.replace(/_(fc|forecast|anom|anomaly|opp|opportunity)$/i, "");
  return TEMPLATES[kind](REPORT_NOTES[baseId]);
}
