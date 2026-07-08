// insightRules — v7.6 conditional insight rule library system for IA
// Insights reports.
//
// Replaces the small hardcoded `observations: [...]` arrays in the legacy
// ArgusInsightBox with a typed rule library. Each report gets 20+ rules.
// Rules carry stable IDs (for quarterly review tracking), a data-source
// dependency list (for QA + docs), a condition predicate, and an
// observation/action generator.
//
// Goal per IA's "Intelligent Analytics Insights" model:
//   1. Each rule is unique to a specific data-point combination.
//   2. As new data sources are added, rules referencing them light up.
//   3. Quarterly reviews update rules via stable IDs — the library is the
//      single source of truth.
//
// Usage:
//   const fired = evaluateRules(VISIBILITY_RULES, ctx);
//   // → { observations: string[], actions: string[] }
//
// Each rule's appliesWhen() should be cheap and side-effect-free.
// observation() / action() may include rich formatting but should never
// throw — wrap risky number-formatting in helpers.

/** What kind of insight a rule produces. Most rules produce an
 *  observation; an `action` rule produces a recommended next step. A
 *  single rule may produce both. */
export type InsightKind = "observation" | "action";

/** The shared context object that every rule receives. Each ARION report
 *  populates its own ctx (visibility, audience, etc.) so rules see only
 *  what they care about. */
export interface InsightContext {
  /** GA4 analytics summary (from useAnalyticsData). */
  ga4?: any;
  /** Google Search Console (clicks, impressions, CTR, position + breakdowns). */
  gsc?: any;
  /** Google Business Profile aggregate metrics. */
  gbp?: any;
  /** GBP review list. */
  gbpReviews?: any;
  /** GBP posts. */
  gbpPosts?: any;
  /** GBP Q&A. */
  gbpQanda?: any;
  /** Bing Webmaster Tools performance. */
  bing?: any;
  /** SE Ranking keyword/audit/visibility data. */
  seo?: any;
  /** SE Ranking decay (rank-loss) data. */
  seoDecay?: any;
  /** IA Plugin bundle (Shield, PSI, content age, plugin risk, etc.). */
  plugin?: any;
  /** Tenant's primary domain string for personalised observations. */
  domain?: string;
}

export interface InsightRule {
  /** Stable ID — used by the quarterly review process to track rule
   *  changes over time. Format: `<report>.<category>.<short-slug>`. */
  id: string;
  /** Free-text category for grouping in the UI / docs. */
  category: string;
  /** observation, action, or both. */
  kind: InsightKind | InsightKind[];
  /** Data sources this rule depends on. Used for self-documentation and
   *  the "which rules light up when I connect X" preview. */
  dataSources: Array<"ga4" | "gsc" | "gbp" | "bing" | "seo" | "plugin">;
  /** Higher priority shows first when more rules fire than the slot
   *  limit allows. Default 5; reserve 8-10 for critical findings. */
  priority?: number;
  /** Predicate. Return false to skip this rule entirely. */
  appliesWhen: (ctx: InsightContext) => boolean;
  /** Observation text generator. Required if kind includes 'observation'. */
  observation?: (ctx: InsightContext) => string;
  /** Action text generator. Required if kind includes 'action'. */
  action?: (ctx: InsightContext) => string;
}

export interface EvaluatedInsights {
  observations: string[];
  actions: string[];
  /** Stable IDs of rules that fired — useful for telemetry and quarterly
   *  review (which rules consistently fire vs which never do). */
  firedRuleIds: string[];
}

export interface EvaluateOptions {
  /** Maximum observations to surface. Default 8. */
  maxObservations?: number;
  /** Maximum actions to surface. Default 5. */
  maxActions?: number;
}

/** Evaluate a rule library against a context and return the fired
 *  observations + actions, sorted by descending priority. */
export function evaluateRules(
  rules: InsightRule[],
  ctx: InsightContext,
  opts: EvaluateOptions = {}
): EvaluatedInsights {
  const maxObs = opts.maxObservations ?? 8;
  const maxAct = opts.maxActions ?? 5;
  const observations: Array<{ text: string; priority: number; id: string }> = [];
  const actions: Array<{ text: string; priority: number; id: string }> = [];
  const fired: string[] = [];

  for (const r of rules) {
    let applies = false;
    try {
      applies = r.appliesWhen(ctx);
    } catch {
      // Rules must never throw; skip on error.
      continue;
    }
    if (!applies) continue;
    fired.push(r.id);

    const kinds = Array.isArray(r.kind) ? r.kind : [r.kind];
    const pri = r.priority ?? 5;

    if (kinds.includes("observation") && r.observation) {
      try {
        const text = r.observation(ctx);
        if (text && text.trim().length > 0) {
          observations.push({ text: text.trim(), priority: pri, id: r.id });
        }
      } catch { /* skip */ }
    }
    if (kinds.includes("action") && r.action) {
      try {
        const text = r.action(ctx);
        if (text && text.trim().length > 0) {
          actions.push({ text: text.trim(), priority: pri, id: r.id });
        }
      } catch { /* skip */ }
    }
  }

  observations.sort((a, b) => b.priority - a.priority);
  actions.sort((a, b) => b.priority - a.priority);

  return {
    observations: observations.slice(0, maxObs).map((o) => o.text),
    actions:      actions.slice(0, maxAct).map((a) => a.text),
    firedRuleIds: fired,
  };
}

// ── Shared formatting helpers used by rule observation() generators ───
export function fmt(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "0";
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function pct(n: number | null | undefined, digits = 1): string {
  if (n == null || !isFinite(n)) return "0%";
  return `${(n * 100).toFixed(digits)}%`;
}

// Industry CTR benchmark by search position. Shared with the search
// engine + ARGUS box; lifted here so visibility rules can reference it
// without importing from the legacy page module.
export const CTR_BY_POSITION: Array<{ pos: number; ctr: number }> = [
  { pos: 1, ctr: 28 }, { pos: 2, ctr: 15 }, { pos: 3, ctr: 10 }, { pos: 4, ctr: 7 },
  { pos: 5, ctr: 5 }, { pos: 6, ctr: 3.5 }, { pos: 7, ctr: 3 }, { pos: 8, ctr: 2.7 },
  { pos: 9, ctr: 2.5 }, { pos: 10, ctr: 2.4 }, { pos: 15, ctr: 1.5 }, { pos: 20, ctr: 0.7 },
  { pos: 25, ctr: 0.4 }, { pos: 30, ctr: 0.3 }, { pos: 50, ctr: 0.1 }, { pos: 100, ctr: 0.05 },
];

export function expectedCtrAt(pos: number): number {
  if (pos == null || !isFinite(pos)) return 0;
  if (pos <= 1) return CTR_BY_POSITION[0].ctr;
  if (pos >= 100) return 0.05;
  for (let i = 0; i < CTR_BY_POSITION.length - 1; i++) {
    const a = CTR_BY_POSITION[i];
    const b = CTR_BY_POSITION[i + 1];
    if (pos >= a.pos && pos <= b.pos) {
      const t = (pos - a.pos) / (b.pos - a.pos);
      return Number((a.ctr + (b.ctr - a.ctr) * t).toFixed(2));
    }
  }
  return 0;
}
