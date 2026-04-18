/**
 * ARION technical-term glossary + info-icon tooltip component.
 *
 * Purpose: clients are not SEO / analytics experts. Every time a page shows a
 * technical term (Position, CPC, Bounce Rate, Engagement Rate, Core Web Vitals,
 * etc.), we should offer a small info icon that opens a plain-English
 * explanation. This component is the single source of truth for those
 * definitions across ARION.
 *
 * Usage:
 *   import { GlossaryIcon } from '../components/Glossary';
 *   <GlossaryIcon termKey="position" />
 *   // or with a wrapper around a label:
 *   <GlossaryLabel termKey="cpc" label="CPC" />
 *
 * To add a new term, just append to GLOSSARY_TERMS below. If the term spans
 * multiple products (e.g. "Bounce Rate" appears in Analytics and SEO
 * Intelligence), register it ONCE here with the plain-English definition and
 * both pages will show the same tooltip.
 */
import React from 'react';

export interface GlossaryTerm {
  title: string;
  description: string;
  /** Optional second paragraph (e.g. "what's a good value"). */
  context?: string;
  /** Optional section label for grouping in the full glossary panel. */
  category?: 'SEO' | 'Analytics' | 'Search' | 'Business Profile' | 'Technical';
}

export const GLOSSARY_TERMS: Record<string, GlossaryTerm> = {
  // ───────── Keyword Rankings (SEO) ─────────
  position: {
    title: 'Position',
    description: 'Where your website shows up in search results for this keyword. Position 1 means you\'re the first result, position 2 is second, and so on. Position 11 or higher means page 2 or later.',
    context: 'Most clicks go to the top 3 results. Moving from position 11 to position 10 (page 1) can increase clicks 5× or more.',
    category: 'SEO',
  },
  change: {
    title: 'Change',
    description: 'How many positions this keyword moved up or down compared to the start of the selected date range.',
    context: 'Green upward arrow means you improved (moved closer to position 1). Red downward arrow means you lost ground. Daily rankings naturally fluctuate — watch trends over weeks, not days.',
    category: 'SEO',
  },
  volume: {
    title: 'Search Volume',
    description: 'The estimated number of times people search Google for this exact keyword every month, worldwide.',
    context: 'Higher volume means more potential traffic if you rank well. A keyword with 10,000 searches and you at position 1 could bring in 2,000+ monthly visits. Low-volume keywords (under 50) usually indicate niche or very specific searches.',
    category: 'SEO',
  },
  cpc: {
    title: 'CPC (Cost Per Click)',
    description: 'How much advertisers pay Google on average every time someone clicks their ad for this keyword.',
    context: 'Higher CPC means the keyword is valuable — advertisers are willing to pay more because searchers are more likely to buy. Ranking organically for high-CPC keywords is worth real money you don\'t have to pay Google.',
    category: 'SEO',
  },
  competition: {
    title: 'Competition',
    description: 'How hard it is to rank for this keyword, from 0% (easy) to 100% (extremely competitive).',
    context: 'This measures paid-ad competition specifically. High-competition keywords usually also have more organic competitors, meaning more effort is needed to rank. Low-competition keywords are faster wins but often have lower volume.',
    category: 'SEO',
  },
  engines: {
    title: 'Search Engines',
    description: 'The different search platforms we\'re tracking this keyword across — Google Desktop, Google Mobile, Bing Desktop, Bing Mobile, and AI search engines like ChatGPT (on higher tiers).',
    context: 'A keyword can rank differently on mobile vs desktop, or on Google vs Bing. We show an average across all engines where you rank, and flag any engine where you\'re not in the top 100.',
    category: 'SEO',
  },

  // ───────── Rankings summary metrics ─────────
  avg_position: {
    title: 'Average Position',
    description: 'The average of where all your tracked keywords rank in search results.',
    context: 'A lower number is better (position 1 is best). This is an easy pulse-check of overall SEO health — watch if it trends up or down over time.',
    category: 'SEO',
  },
  search_visibility: {
    title: 'Search Visibility',
    description: 'A weighted score (0–100%) that estimates how visible your site is in search results across all tracked keywords.',
    context: 'Higher-ranking keywords contribute more to this score. Going from visibility 5% to 10% typically means meaningful traffic growth. It\'s the best single number to measure SEO progress over time.',
    category: 'SEO',
  },
  top10_keywords: {
    title: 'Top 10 Keywords',
    description: 'The number of your tracked keywords that rank on the first page of Google (positions 1–10).',
    context: '97% of searchers never scroll past page 1. Keywords outside the top 10 get almost no clicks. Growing this number is the single most direct way to grow organic traffic.',
    category: 'SEO',
  },
  traffic_forecast: {
    title: 'Traffic Forecast',
    description: 'An estimate of how many clicks your tracked keywords could bring you each month based on their current positions and search volumes.',
    context: 'This uses industry-standard CTR assumptions (~27% at position 1, ~2% at position 10). It\'s a forecast, not a guarantee — actual traffic depends on your title tags, search intent match, and seasonality.',
    category: 'SEO',
  },

  // ───────── Analytics glossary (GA4) — for future wiring ─────────
  bounce_rate: {
    title: 'Bounce Rate',
    description: 'The percentage of visitors who land on your site and leave without interacting — no clicks, no scroll, no second page.',
    context: 'A high bounce rate isn\'t always bad (if the visitor got their answer and left satisfied, that\'s fine). It matters most on pages designed to lead to a next step, like product or services pages.',
    category: 'Analytics',
  },
  engagement_rate: {
    title: 'Engagement Rate',
    description: 'The percentage of visits where someone stayed on your site for more than 10 seconds, triggered a conversion event, or viewed multiple pages.',
    context: 'GA4 uses engagement rate instead of the old "bounce rate." A rate above 50% is typically healthy for a content site; service sites vary more.',
    category: 'Analytics',
  },
  sessions: {
    title: 'Sessions',
    description: 'A single visit to your website. One person who visits, leaves, and comes back later counts as two sessions.',
    context: 'Sessions are the clearest measure of "how many times was the site used." Unique visitors (users) is a lower number because the same person can generate multiple sessions.',
    category: 'Analytics',
  },
  avg_session_duration: {
    title: 'Avg Session Duration',
    description: 'How long, on average, a visitor stays on your site per visit.',
    category: 'Analytics',
  },

  // ───────── Search Console glossary ─────────
  impressions: {
    title: 'Impressions (GSC)',
    description: 'The number of times your site appeared in Google search results — whether the searcher clicked or not.',
    context: 'Impressions are your visibility. Even if you got zero clicks, a high impression count means Google is showing your page to searchers — you just need to improve the result to get more clicks.',
    category: 'Search',
  },
  ctr: {
    title: 'CTR (Click-Through Rate)',
    description: 'The percentage of people who clicked your result after seeing it in search. CTR = clicks ÷ impressions.',
    context: 'Industry benchmarks: ~27% at position 1, ~15% at position 2, ~5% at position 5, under 2% past position 10. If your CTR is below benchmark for your position, your title tag or meta description needs work.',
    category: 'Search',
  },

  // ───────── Site Audit glossary ─────────
  health_score: {
    title: 'Site Health Score',
    description: 'An overall score from 0–100 based on the percentage of SEO audit checks your site passes.',
    context: '80+ is healthy. 50–80 means there\'s work to do. Below 50 usually signals significant technical problems preventing Google from fully indexing or ranking your pages.',
    category: 'Technical',
  },
  core_web_vitals: {
    title: 'Core Web Vitals',
    description: 'Google\'s three user-experience measurements: how fast a page loads (LCP), how responsive it feels (INP), and how stable the layout is (CLS).',
    context: 'All three directly impact Google rankings. Failing Core Web Vitals can cap how high a page will rank regardless of content quality.',
    category: 'Technical',
  },

  // ───────── AI Search glossary ─────────
  ai_mentions: {
    title: 'AI Mentions',
    description: 'How often your brand or site is mentioned when someone asks an AI assistant (ChatGPT, Gemini, Perplexity, or Google\'s AI Overview) about topics in your space.',
    context: 'AI search is growing fast. Being cited by AI as a source for answers is the new "ranking in the top 3" — it determines whether AI users discover your business.',
    category: 'SEO',
  },
  // ───────── Market Monitor glossary ─────────
  backlinks_new: {
    title: 'New Backlinks',
    description: 'Other websites that linked to your site for the first time during the selected date range.',
    context: 'Backlinks are votes of trust. A new backlink from a well-regarded site can directly improve rankings for related pages.',
    category: 'SEO',
  },
  backlinks_lost: {
    title: 'Lost Backlinks',
    description: 'Links that used to point to your site but have disappeared — the other site either removed them, redirected them, or went offline.',
    context: 'Losing a few low-authority backlinks is normal. A sudden spike in lost backlinks, especially from trusted sites, is worth investigating.',
    category: 'SEO',
  },
  page_changes: {
    title: 'Page Changes',
    description: 'Content edits detected on pages we watch on a schedule — typically competitor pages and your own high-value pages.',
    context: 'When a competitor updates a page that already ranks well, they are usually defending or extending their lead. Change alerts let you respond in hours instead of weeks.',
    category: 'SEO',
  },
  competitor_moves: {
    title: 'Competitor Moves',
    description: 'Significant ranking swings — gains or drops of five positions or more — by the competitors you track.',
    context: 'Big jumps can signal a new piece of content, a redesign, or a SERP feature change. Big drops often create recoverable opportunities for you.',
    category: 'SEO',
  },
  ai_sources: {
    title: 'AI Sources',
    description: 'Specific pages on your site that AI assistants cite as answer sources when users ask questions.',
    context: 'If ChatGPT is citing /services/data-analytics as a source, that\'s AI-era attribution — visibility you couldn\'t previously measure. Pages cited by AI are treated as authoritative.',
    category: 'SEO',
  },
};

/**
 * Small info icon that opens a tooltip on hover, or a click-to-open popup on
 * touch devices. Use next to any technical term so clients can understand
 * what they\'re looking at.
 */
export function GlossaryIcon({ termKey, size = 13 }: { termKey: string; size?: number }) {
  const [open, setOpen] = React.useState(false);
  const [anchorPos, setAnchorPos] = React.useState<{ left: number; top: number } | null>(null);
  const ref = React.useRef<HTMLSpanElement>(null);
  const term = GLOSSARY_TERMS[termKey];

  if (!term) {
    // Fail soft — log in console once and render nothing so pages don't break.
    if (typeof console !== 'undefined') console.warn(`[Glossary] unknown termKey: ${termKey}`);
    return null;
  }

  const show = () => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setAnchorPos({ left: rect.left + rect.width / 2, top: rect.bottom + 4 });
    }
    setOpen(true);
  };
  const hide = () => setOpen(false);

  return (
    <>
      <span
        ref={ref}
        role="button"
        tabIndex={0}
        aria-label={`What is ${term.title}?`}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); if (!open) show(); }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size + 4,
          height: size + 4,
          borderRadius: '50%',
          background: 'rgba(45,156,219,0.12)',
          color: '#2D9CDB',
          fontSize: size - 2,
          fontWeight: 700,
          cursor: 'help',
          marginLeft: 4,
          verticalAlign: 'middle',
          userSelect: 'none',
        }}
      >
        i
      </span>
      {open && anchorPos && (
        <div
          role="tooltip"
          style={{
            position: 'fixed',
            left: Math.min(anchorPos.left - 140, window.innerWidth - 300),
            top: anchorPos.top,
            width: 280,
            background: '#0B1C24',
            color: '#D5E8F0',
            borderRadius: 8,
            padding: '12px 14px',
            boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
            zIndex: 9999,
            fontSize: 12,
            lineHeight: 1.55,
          }}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={hide}
        >
          <div style={{ fontWeight: 700, fontSize: 12, color: '#fff', marginBottom: 4 }}>{term.title}</div>
          <div style={{ color: '#D5E8F0', marginBottom: term.context ? 8 : 0 }}>{term.description}</div>
          {term.context && (
            <div style={{ color: '#A8CDD8', fontSize: 11, lineHeight: 1.55, borderTop: '1px solid rgba(168,205,216,0.25)', paddingTop: 8 }}>
              {term.context}
            </div>
          )}
        </div>
      )}
    </>
  );
}

/**
 * Convenience wrapper: renders a label with an info icon to its right.
 */
export function GlossaryLabel({ termKey, label, style }: { termKey: string; label?: string; style?: React.CSSProperties }) {
  const term = GLOSSARY_TERMS[termKey];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', ...style }}>
      {label || term?.title || termKey}
      <GlossaryIcon termKey={termKey} />
    </span>
  );
}

/**
 * A collapsible "Metric definitions" panel for use at the bottom of pages
 * where many technical terms appear (e.g. the Rankings detail modal). Lets
 * clients scan all term explanations at once instead of hovering one-by-one.
 */
export function GlossaryPanel({ termKeys, title = 'What do these terms mean?' }: { termKeys: string[]; title?: string }) {
  const [open, setOpen] = React.useState(false);
  const terms = termKeys.map((k) => GLOSSARY_TERMS[k]).filter(Boolean) as GlossaryTerm[];
  if (terms.length === 0) return null;
  return (
    <div style={{ marginTop: 16, background: 'var(--color-bg-card, #F8FAFC)', borderRadius: 8, border: '1px solid rgba(45,156,219,0.18)' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: '10px 14px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 600,
          color: '#0B1C24',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: '50%', background: 'rgba(45,156,219,0.15)', color: '#2D9CDB', fontSize: 10, fontWeight: 700, marginRight: 8 }}>i</span>
          {title}
        </span>
        <span style={{ color: '#5A7A8A', fontSize: 11 }}>{open ? 'Hide ▾' : 'Show ▸'}</span>
      </button>
      {open && (
        <div style={{ padding: '4px 14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {termKeys.map((k) => {
            const t = GLOSSARY_TERMS[k];
            if (!t) return null;
            return (
              <div key={k} style={{ fontSize: 11, color: '#5A7A8A', lineHeight: 1.55 }}>
                <div style={{ fontWeight: 600, color: '#0B1C24', fontSize: 12, marginBottom: 2 }}>{t.title}</div>
                <div>{t.description}</div>
                {t.context && <div style={{ marginTop: 4, fontStyle: 'italic' }}>{t.context}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
