// arionConversionRules — v7.8 ARION "Conversion Intelligence" insight library.
//
// 21 conditional rules covering the full conversion path:
//   - Engagement → conversion gap (engaged sessions that don't convert)
//   - Funnel drop-offs (entry → engagement → intent → conversion)
//   - Form submission analysis
//   - High-intent unconverted visitors (scroll depth, time-on-page)
//   - Page-level conversion analysis (homepage vs services vs contact)
//   - Channel-specific conversion (GBP phone vs form)
//   - Mobile vs desktop conversion gap
//   - Conversion path completeness (do CTAs even exist?)
//
// The conversion engine has fewer data sources than visibility (no GBP
// metrics beyond the website/phone split), so rules focus on the funnel
// math and behavioural signals.

import { type InsightRule, fmt, pct } from "./insightRules";

export const CONVERSION_RULES: InsightRule[] = [
  // ─── Engagement → Conversion Gap ──────────────────────────────────
  {
    id: "conv.engagement.zero_form_submissions",
    category: "funnel",
    kind: ["observation", "action"],
    dataSources: ["ga4"],
    priority: 10,
    appliesWhen: (c) =>
      Number(c.ga4?.summary?.totalSessions) > 50 &&
      Number(c.ga4?.summary?.formSubmissions || 0) === 0,
    observation: (c) => {
      const ses = Number(c.ga4?.summary?.totalSessions || 0);
      const eng = Number(c.ga4?.engagement?.engagedSessions || 0);
      const erPct = ses > 0 ? Math.round((eng / ses) * 100) : 0;
      return `Of ${fmt(ses)} visitors this period, ${eng} engaged meaningfully (${erPct}% engagement rate) but 0 submitted a form. Engaged visitors are seeing value but finding no path to act on it — this is the single biggest recoverable revenue lever on the site.`;
    },
    action: () => `Add a short contact form (name + email + phone, 3 fields max) to the bottom of every service page. Wire it to SPARK with form ID + page-source attribution so every submission carries full context.`,
  },
  {
    id: "conv.engagement.conversion_rate",
    category: "funnel",
    kind: "observation",
    dataSources: ["ga4"],
    priority: 9,
    appliesWhen: (c) => Number(c.ga4?.summary?.formSubmissions || 0) > 0,
    observation: (c) => {
      const ses = Number(c.ga4?.summary?.totalSessions || 0);
      const forms = Number(c.ga4?.summary?.formSubmissions || 0);
      const eng = Number(c.ga4?.engagement?.engagedSessions || 0);
      const sessionCr = ses > 0 ? (forms / ses) * 100 : 0;
      const engagedCr = eng > 0 ? (forms / eng) * 100 : 0;
      if (sessionCr < 1) return `${forms} form submissions across ${fmt(ses)} sessions — ${sessionCr.toFixed(2)}% conversion rate. Most service-business sites convert 2-5% of visitors; you're well below that. The biggest fixes are usually (1) more visible CTAs on top-traffic pages and (2) fewer form fields.`;
      if (sessionCr < 3) return `${forms} form submissions across ${fmt(ses)} sessions — ${sessionCr.toFixed(2)}% session conversion (${engagedCr.toFixed(2)}% of engaged sessions). Within industry norms; tactical CRO from here (button placement, copy, form-field tests) typically lifts another 0.5-1.0 percentage points.`;
      return `${forms} form submissions across ${fmt(ses)} sessions — ${sessionCr.toFixed(2)}% conversion rate. Above industry average. Protect this with site-speed monitoring and A/B-test conservatively (you don't want to regress).`;
    },
  },
  {
    id: "conv.engagement.engaged_no_convert",
    category: "funnel",
    kind: "observation",
    dataSources: ["ga4"],
    priority: 8,
    appliesWhen: (c) => {
      const eng = Number(c.ga4?.engagement?.engagedSessions || 0);
      const forms = Number(c.ga4?.summary?.formSubmissions || 0);
      return eng > 20 && forms === 0;
    },
    observation: (c) => {
      const eng = Number(c.ga4?.engagement?.engagedSessions || 0);
      return `${eng} visitors engaged meaningfully (10+ second session OR 2+ pageviews) but none converted. Engaged-without-converting is the warmest unaddressed-prospect cohort you have — they're showing interest signals and your funnel offers no next step.`;
    },
  },

  // ─── Scroll Depth / High Intent ───────────────────────────────────
  {
    id: "conv.intent.scroll_depth",
    category: "high-intent",
    kind: ["observation", "action"],
    dataSources: ["ga4"],
    priority: 8,
    appliesWhen: (c) => Number(c.ga4?.engagement?.scrollEvents90 || 0) > 0,
    observation: (c) => {
      const scrolls = Number(c.ga4?.engagement?.scrollEvents90 || 0);
      const forms = Number(c.ga4?.summary?.formSubmissions || 0);
      const gap = scrolls - forms;
      if (gap > 20) return `${scrolls} users scrolled past 90% of a page — these are your most interested visitors. With only ${forms} form submission${forms === 1 ? "" : "s"}, ${gap} highly-interested visitors found nothing to do at the bottom of the page.`;
      return `${scrolls} deep-scroll events recorded — visitors are reading. Make sure there's a conversion mechanism at the scroll point (in-page CTA, sticky form, exit-intent overlay).`;
    },
    action: () => `Add an in-page CTA or short form 70% of the way down each top-traffic page. Deep-scrollers are pre-qualified by their behaviour; not asking them to act is a measurable miss.`,
  },
  {
    id: "conv.intent.session_duration_strong",
    category: "high-intent",
    kind: "observation",
    dataSources: ["ga4"],
    priority: 6,
    appliesWhen: (c) => Number(c.ga4?.engagement?.avgSessionDuration || 0) > 120 && Number(c.ga4?.summary?.formSubmissions || 0) === 0,
    observation: (c) => {
      const dur = Math.round(Number(c.ga4?.engagement?.avgSessionDuration || 0));
      return `Average session duration is ${dur} seconds with zero conversions. Long sessions + no conversion usually means the visitor is doing diligence (reading your services, about, team) but never finds an obvious "next step" to commit. Add a calendar booking widget or chat to short-circuit the journey.`;
    },
  },

  // ─── Page-Level Funnel ────────────────────────────────────────────
  {
    id: "conv.page.homepage_dominance",
    category: "page-funnel",
    kind: "observation",
    dataSources: ["ga4"],
    priority: 6,
    appliesWhen: (c) => Array.isArray(c.ga4?.topPages) && c.ga4.topPages.length > 0,
    observation: (c) => {
      const pages = c.ga4?.topPages || [];
      const total = pages.reduce((s: number, p: any) => s + Number(p.views || p.pageviews || 0), 0);
      const home = pages.find((p: any) => p.path === "/" || /^\/?$/.test(p.path || "") || /^home/i.test(p.path || ""));
      const homeViews = Number(home?.views || home?.pageviews || 0);
      const share = total > 0 ? Math.round((homeViews / total) * 100) : 0;
      if (share > 50) return `The homepage receives ${share}% of all pageviews (${fmt(homeViews)} of ${fmt(total)}). Most visitors see only one page. The homepage is functioning as a brochure, not a funnel — add prominent internal links to your top 3 service pages above the fold.`;
      if (share > 30) return `Homepage is ${share}% of pageviews — moderate funnel-top concentration. Drive more visitors to deeper pages with explicit "Learn more about X" CTAs in the homepage hero.`;
      return `Homepage is only ${share}% of pageviews — your traffic is well-distributed across the site. Visitors are entering on many different pages, which is healthy.`;
    },
  },
  {
    id: "conv.page.contact_starvation",
    category: "page-funnel",
    kind: ["observation", "action"],
    dataSources: ["ga4"],
    priority: 9,
    appliesWhen: (c) => {
      const pages = c.ga4?.topPages || [];
      const contact = pages.find((p: any) => /contact/i.test(p.path || ""));
      const total = Number(c.ga4?.summary?.totalSessions || 0);
      const contactViews = Number(contact?.views || contact?.pageviews || 0);
      return total > 0 && contact && (contactViews / total) < 0.1;
    },
    observation: (c) => {
      const pages = c.ga4?.topPages || [];
      const contact = pages.find((p: any) => /contact/i.test(p.path || ""));
      const contactViews = Number(contact?.views || contact?.pageviews || 0);
      const total = Number(c.ga4?.summary?.totalSessions || 0);
      const share = total > 0 ? ((contactViews / total) * 100).toFixed(1) : "0";
      return `Your /contact page receives only ${contactViews} views from ${fmt(total)} sessions (${share}%) — meaning ${(100 - Number(share)).toFixed(1)}% of visitors never see your primary conversion page. Content is not guiding visitors toward contact.`;
    },
    action: () => `Add a "Get a quote" or "Contact us" link in your main navigation as the rightmost item (highest-conversion position) AND a CTA above the fold on every service page.`,
  },
  {
    id: "conv.page.404_traffic",
    category: "page-funnel",
    kind: ["observation", "action"],
    dataSources: ["ga4"],
    priority: 9,
    appliesWhen: (c) => {
      const pages = c.ga4?.topPages || [];
      return pages.some((p: any) => /not found|404|page.not.found/i.test(p.title || ""));
    },
    observation: (c) => {
      const pages = c.ga4?.topPages || [];
      const notFound = pages.filter((p: any) => /not found|404|page.not.found/i.test(p.title || ""));
      const sum = notFound.reduce((s: number, p: any) => s + Number(p.views || p.pageviews || 0), 0);
      return `${sum} pageviews landed on 404 / "Page not found" pages this period. Either a page was deleted, a campaign URL is wrong, or there's a broken internal link — each 404 is a high-intent visitor who got bounced because the experience broke.`;
    },
    action: () => `Identify which URLs are 404ing (check the page paths in the GA4 page report) and either restore them, 301-redirect them to the closest current page, or fix the broken inbound link.`,
  },

  // ─── Channel Conversion ───────────────────────────────────────────
  {
    id: "conv.channel.gbp_phone",
    category: "channel-conversion",
    kind: "observation",
    dataSources: ["gbp", "ga4"],
    priority: 7,
    appliesWhen: (c) => c.gbp?.connected === true && Number(c.gbp?.metrics?.calls || 0) >= 0,
    observation: (c) => {
      const calls = Number(c.gbp?.metrics?.calls || 0);
      const forms = Number(c.ga4?.summary?.formSubmissions || 0);
      if (calls === 0 && forms === 0) return `Zero phone calls from GBP and zero form submissions this period — there is no measured conversion happening through either channel. Verify the call-tracking conversion is configured in GA4 + that the contact form fires a form_submit event.`;
      if (calls > forms * 2) return `GBP generated ${calls} phone calls vs ${forms} form submissions. Phone is your dominant conversion channel — your website is awareness, the actual buyer handoff happens on a call. Track phone as a primary conversion in GA4 + SPARK, and keep click-to-call prominent above the fold.`;
      if (forms > calls * 2) return `Forms (${forms}) are out-converting GBP phone calls (${calls}) by 2:1. Web-form is your primary conversion path; keep phone visible for click-to-call but optimise CRO around the form.`;
      return `Phone (${calls}) and form (${forms}) volumes are comparable — both channels deserve equal weight in your lead-source reporting.`;
    },
  },

  // ─── Device-Specific Conversion ───────────────────────────────────
  {
    id: "conv.device.mobile_bounce",
    category: "device-conversion",
    kind: ["observation", "action"],
    dataSources: ["ga4"],
    priority: 8,
    appliesWhen: (c) => {
      const devs = c.ga4?.devices || [];
      const mob = devs.find((d: any) => /mobile/i.test(d.category || d.device));
      return mob && Number(mob.bounceRate || 0) > 0.7 && Number(mob.sessions || 0) > 50;
    },
    observation: (c) => {
      const devs = c.ga4?.devices || [];
      const mob = devs.find((d: any) => /mobile/i.test(d.category || d.device));
      const b = pct(Number(mob.bounceRate || 0));
      return `Mobile bounce rate is ${b} across ${mob.sessions} sessions. Mobile visitors are arriving and leaving immediately — usually due to (1) slow load, (2) intrusive modal/popup, or (3) the content above the fold not matching the search intent. Lighthouse mobile audit is the fastest diagnostic.`;
    },
    action: () => `Run Lighthouse on a real mobile device on your top 3 entry pages and address the top 3 opportunities — render-blocking JS, oversized images, and Cumulative Layout Shift typically account for 80% of mobile bounce.`,
  },
  {
    id: "conv.device.desktop_conversion_only",
    category: "device-conversion",
    kind: "observation",
    dataSources: ["ga4"],
    priority: 7,
    appliesWhen: (c) => {
      const devs = c.ga4?.devices || [];
      const mob = devs.find((d: any) => /mobile/i.test(d.category || d.device));
      const dk = devs.find((d: any) => /desktop/i.test(d.category || d.device));
      return mob && dk && Number(mob.sessions || 0) > 100 && Number(mob.conversions || 0) === 0 && Number(dk.conversions || 0) > 0;
    },
    observation: (c) => {
      const devs = c.ga4?.devices || [];
      const mob = devs.find((d: any) => /mobile/i.test(d.category || d.device));
      const dk = devs.find((d: any) => /desktop/i.test(d.category || d.device));
      return `${dk.conversions} conversions from desktop vs 0 from mobile (${mob.sessions} mobile sessions). The mobile experience is preventing conversion — either the form is unusable on a phone, payment flow breaks on mobile, or the page is too slow to load before the visitor gives up.`;
    },
  },

  // ─── Conversion Path Quality ──────────────────────────────────────
  {
    id: "conv.path.no_cta_signal",
    category: "path-quality",
    kind: "observation",
    dataSources: ["ga4"],
    priority: 6,
    appliesWhen: (c) => {
      const events = c.ga4?.eventCounts || {};
      return events.click_cta == null && events.cta_click == null && events.button_click == null && Number(c.ga4?.summary?.totalSessions) > 100;
    },
    observation: () => `No CTA-click events are being tracked. Either the data layer doesn't fire button_click / cta_click events, or there are no measurable CTAs on the site. Without this signal you cannot tell which CTAs are working vs which are decorative.`,
  },
  {
    id: "conv.path.pageviews_per_conversion",
    category: "path-quality",
    kind: "observation",
    dataSources: ["ga4"],
    priority: 5,
    appliesWhen: (c) => Number(c.ga4?.summary?.formSubmissions || 0) > 2,
    observation: (c) => {
      const pv = Number(c.ga4?.summary?.totalPageviews || c.ga4?.summary?.pageviews || 0);
      const forms = Number(c.ga4?.summary?.formSubmissions || 0);
      if (pv === 0 || forms === 0) return "";
      const ratio = Math.round(pv / forms);
      return `It takes approximately ${fmt(ratio)} pageviews to generate 1 form submission (${fmt(pv)} pageviews / ${forms} forms). Tighter funnels achieve 100-200:1; ratios above 500:1 indicate the funnel is leaky at some step worth diagnosing.`;
    },
  },

  // ─── Form Field Analysis ──────────────────────────────────────────
  {
    id: "conv.form.field_count",
    category: "form-quality",
    kind: ["observation", "action"],
    dataSources: ["ga4"],
    priority: 5,
    appliesWhen: (c) => {
      const fl = c.ga4?.formLength || c.ga4?.formFieldCount;
      return typeof fl === "number" && fl > 5;
    },
    observation: (c) => {
      const fl = Number(c.ga4?.formLength || c.ga4?.formFieldCount || 0);
      return `Your contact form has ${fl} fields. Industry data shows form-completion rates drop ~10% for each field added beyond 4. Reducing to 3-4 fields (name, email, phone, message) typically increases submissions 20-40%.`;
    },
    action: () => `Reduce form fields to 3-4. If you need more data, collect it in a follow-up email after the first submission — first-step friction is the conversion-killer.`,
  },

  // ─── Source-Specific Conversion ───────────────────────────────────
  {
    id: "conv.source.direct_high_intent",
    category: "source-conversion",
    kind: "observation",
    dataSources: ["ga4"],
    priority: 6,
    appliesWhen: (c) => {
      const sources = c.ga4?.sources || [];
      const direct = sources.find((s: any) => /^direct|\(direct\)/i.test(s.source || ""));
      return direct && Number(direct.sessions || 0) > 50 && Number(direct.conversions || 0) === 0;
    },
    observation: (c) => {
      const sources = c.ga4?.sources || [];
      const direct = sources.find((s: any) => /^direct|\(direct\)/i.test(s.source || ""));
      return `${direct.sessions} direct sessions but 0 conversions. Direct traffic is the highest-intent channel (visitors typed your URL or bookmarked you) — if they're not converting, the homepage isn't presenting a strong-enough next step for someone already convinced about the brand.`;
    },
  },
  {
    id: "conv.source.organic_conversion_rate",
    category: "source-conversion",
    kind: "observation",
    dataSources: ["ga4", "gsc"],
    priority: 5,
    appliesWhen: (c) => {
      const sources = c.ga4?.sources || [];
      const organic = sources.find((s: any) => /organic/i.test(s.medium || ""));
      return organic && Number(organic.sessions || 0) > 30;
    },
    observation: (c) => {
      const sources = c.ga4?.sources || [];
      const organic = sources.find((s: any) => /organic/i.test(s.medium || ""));
      const cr = Number(organic.sessions || 0) > 0 ? (Number(organic.conversions || 0) / Number(organic.sessions || 0)) * 100 : 0;
      if (cr === 0) return `Organic search delivered ${organic.sessions} sessions but 0 conversions. Search visitors arrive with specific intent — if they're not converting, the landing pages aren't answering the question the search was asking. Audit which queries are sending traffic vs which pages they're landing on.`;
      return `Organic search converts at ${cr.toFixed(2)}% (${organic.conversions || 0} from ${organic.sessions} sessions). Compare to direct: organic-search-conversion-rate is the cleanest measure of how well your content matches your audience's intent.`;
    },
  },

  // ─── Internal Linking ─────────────────────────────────────────────
  {
    id: "conv.linking.homepage_to_contact",
    category: "internal-linking",
    kind: ["observation", "action"],
    dataSources: ["ga4"],
    priority: 6,
    appliesWhen: (c) => {
      const pages = c.ga4?.topPages || [];
      const home = pages.find((p: any) => p.path === "/" || /^\/?$/.test(p.path || ""));
      const contact = pages.find((p: any) => /contact/i.test(p.path || ""));
      return home && contact && Number(home.views || 0) > 50 &&
        (Number(contact.views || 0) / Number(home.views || 1)) < 0.15;
    },
    observation: (c) => {
      const pages = c.ga4?.topPages || [];
      const home = pages.find((p: any) => p.path === "/" || /^\/?$/.test(p.path || ""));
      const contact = pages.find((p: any) => /contact/i.test(p.path || ""));
      const hv = Number(home?.views || 0);
      const cv = Number(contact?.views || 0);
      const ratio = hv > 0 ? Math.round((cv / hv) * 100) : 0;
      return `Only ${ratio}% of homepage visitors reach the contact page (${cv} from ${hv}). The homepage isn't successfully handing visitors off to the conversion page. The fix is usually a prominent, repeated "Contact us" CTA — not a subtle nav link.`;
    },
    action: () => `Add a bold "Get a quote" or "Contact us" button in the homepage hero, in a sticky bottom bar on mobile, AND at the bottom of every service section. Repetition wins.`,
  },

  // ─── Data Gaps ────────────────────────────────────────────────────
  {
    id: "conv.gap.ga4_not_connected",
    category: "data-gaps",
    kind: ["observation", "action"],
    dataSources: ["ga4"],
    priority: 10,
    appliesWhen: (c) => !c.ga4 || c.ga4?.connected === false || c.ga4?.summary == null,
    observation: () => `Google Analytics 4 is not connected (or hasn't returned data yet). Without GA4 there's no visibility into sessions, engagement, form submissions, scroll depth, device breakdown, or any other behavioural conversion signal.`,
    action: () => `Connect Google Analytics 4 in Settings → Connected Accounts. GA4 is the foundation for every Conversion Intelligence observation — connect it first, then ARION starts emitting real insights within 24 hours of data arriving.`,
  },
  {
    id: "conv.gap.no_form_event",
    category: "data-gaps",
    kind: ["observation", "action"],
    dataSources: ["ga4"],
    priority: 8,
    appliesWhen: (c) => {
      const ses = Number(c.ga4?.summary?.totalSessions || 0);
      const forms = c.ga4?.summary?.formSubmissions;
      return ses > 100 && (forms == null);
    },
    observation: () => `GA4 is connected but no form-submission events have been recorded. Either no forms exist on the site, or the form_submit event isn't being fired. Without this event, ARION cannot measure conversion rate or surface engaged-but-unconverted visitors.`,
    action: () => `Configure form-submission tracking in GTM (or use the IA Plugin's built-in Gravity Forms / WPForms integration). Once form_submit events fire, ARION will start surfacing form-specific conversion insights within 30 days.`,
  },

  // ─── Scale Warning ────────────────────────────────────────────────
  {
    id: "conv.scale.low_volume",
    category: "scale",
    kind: "observation",
    dataSources: ["ga4"],
    priority: 3,
    appliesWhen: (c) => Number(c.ga4?.summary?.totalSessions || 0) < 100,
    observation: (c) => {
      const ses = Number(c.ga4?.summary?.totalSessions || 0);
      return `${ses} sessions this period — too few for statistically meaningful conversion analysis. Patterns called out here are directional but not yet conclusive; revisit conversion CRO once you're sustaining 300+ sessions/month.`;
    },
  },
];
