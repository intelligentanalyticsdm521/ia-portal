// deepReport.ts — turns ANY detail report into a full business report.
//
// Brandon, 2026-07-25: a detail report is not a summary table. For every data
// point the client gets the depth a paid analyst would produce:
//
//   A. Executive summary   — headline stats + a one-line narrative
//   B. Distribution over time — stacked composition, 12 months (position bands
//      for keywords, aging buckets for invoices, channel mix for traffic)
//   C. Movement analysis   — entered/dropped the top band, biggest gainers and
//      losers weighted by the volume they carry
//   D. Per-item deep dive  — full month-by-month history, best/worst/avg,
//      volatility, metadata, warnings (e.g. cannibalization)
//   E. Segments            — branded vs non-branded, intent, any grouping
//   F. Opportunity lists   — striking distance, page-2 quick wins, etc.
//
// All of it is DERIVED mechanically from the item-level monthly series, so the
// same engine gives every report on every platform this depth. A per-report
// DeepConfig (deepConfigs.ts) declares the bands / segments / opportunities
// that make sense for that report; with no config a report still gets A, C, D.

import type { DetailReport, DetailItem } from "./detail";
import { itemMom, pluralize } from "./detail";
import type { ValueFormat } from "./scoring";
import { mirrorKindOf } from "./reportNotes";

// ── config ────────────────────────────────────────────────────────────────
export interface DeepBand { label: string; color: string; test: (v: number) => boolean }
export interface DeepSegmentDef { label: string; of: (it: DetailItem) => string }
export interface DeepOpportunityDef {
  title: string;
  note?: string;
  filter: (it: DetailItem) => boolean;
  sortBy?: (a: DetailItem, b: DetailItem) => number;
  limit?: number;
}
export interface DeepConfig {
  /** Value bands → "count of items per band per month" stacked chart (B). */
  bands?: DeepBand[];
  /** Stack the items' own values as the composition chart instead (channel mix, aging buckets). */
  composition?: boolean;
  segments?: DeepSegmentDef[];
  opportunities?: DeepOpportunityDef[];
  /** Warning per item (e.g. keyword cannibalization). Returns the warning text or null. */
  flag?: (it: DetailItem, all: DetailItem[]) => string | null;
  /** extra[] key used to weight movement importance (default "volume", falls back to current value). */
  weightKey?: string;
}

// ── output ────────────────────────────────────────────────────────────────
export interface DeepStat { label: string; value: string; sub?: string; momPct?: number | null }
export interface DeepMovementTable { title: string; items: Array<{ name: string; current: number | null; momPct: number | null }> }
export interface DeepSegmentTable { title: string; rows: Array<{ name: string; count: number; value: string; momPct: number | null }> }
export interface DeepDistribution { kind: "bands" | "composition"; series: Array<{ label: string; color: string; values: number[] }> }
export interface DeepItemStats { best: number; worst: number; avg: number; volatilityPct: number }

/** One plain-English takeaway: what the numbers actually mean for the business. */
export interface MeaningItem { text: string; tone: "good" | "bad" | "watch" | "info" }

export interface DeepReportData {
  report: DetailReport;
  months: string[];
  narrative: string;
  stats: DeepStat[];
  distribution?: DeepDistribution;
  movements: DeepMovementTable[];
  segments: DeepSegmentTable[];
  opportunities: Array<{ title: string; note?: string; items: DetailItem[] }>;
  flags: Record<string, string>;
  itemStats: Record<string, DeepItemStats>;
  /** "What this means" — friendly interpretation derived from the same data. */
  meaning: MeaningItem[];
}

// ── helpers ───────────────────────────────────────────────────────────────
const COMPOSITION_COLORS = ["#0f766e", "#2563eb", "#7c3aed", "#db2777", "#ea580c", "#ca8a04", "#65a30d", "#0891b2", "#94a3b8"];

export function fmtV(v: number | string | null | undefined, format: ValueFormat | "text"): string {
  if (v == null || v === "") return "—";
  if (format === "text") return String(v);
  const n = typeof v === "number" ? v : Number(v);
  if (!isFinite(n)) return String(v);
  switch (format) {
    case "percent":  return `${n.toFixed(n < 10 ? 1 : 0)}%`;
    case "position": return n.toFixed(1);
    case "rating":   return n.toFixed(2);
    case "ms":       return n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.round(n)}ms`;
    case "score":    return String(Math.round(n));
    case "count":    return String(Math.round(n));
    case "currency": return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;
    default:         return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 })
                            : Number.isInteger(n) ? String(n) : n.toFixed(1);
  }
}

/**
 * Month labels for a series of length n. The first 12 points are the trailing
 * year ending at the CURRENT month; anything beyond 12 is a FUTURE month —
 * intelligence forecast series append their 3-month projection, and labelling
 * those as past months would silently misdate the projection.
 */
export function monthLabels(n: number): string[] {
  const past = Math.min(n, 12);
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const offset = i - (past - 1); // ≤0 = past months, >0 = projected future
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
    out.push(d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }));
  }
  return out;
}

const lastVal = (s: Array<number | null>): number | null => {
  for (let i = s.length - 1; i >= 0; i--) if (s[i] != null && isFinite(s[i]!)) return s[i]!;
  return null;
};
const isAvgFormat = (f: ValueFormat) => f === "percent" || f === "position" || f === "rating" || f === "score";

function bandIndex(bands: DeepBand[], v: number | null): number {
  if (v == null || !isFinite(v)) return -1;
  for (let i = 0; i < bands.length; i++) if (bands[i].test(v)) return i;
  return -1;
}

// ── the derivation ────────────────────────────────────────────────────────
export function deriveDeepReport(report: DetailReport, cfg?: DeepConfig): DeepReportData {
  const items = report.items || [];
  const trendItems = items.filter((it) => (it.series?.filter((v) => v != null).length ?? 0) >= 2);
  const seriesLen = Math.max(12, ...items.map((it) => it.series?.length || 0));
  const months = monthLabels(seriesLen);
  const noun = report.itemLabel.toLowerCase();
  const weightKey = cfg?.weightKey || "volume";
  const weightOf = (it: DetailItem) => {
    const w = Number(it.extra?.[weightKey]);
    if (isFinite(w) && w > 0) return w;
    const c = lastVal(it.series || []);
    return c != null ? Math.abs(c) : 1;
  };
  // Direction-aware improvement (a falling position is a gain).
  const improveOf = (it: DetailItem) => {
    const m = itemMom(it);
    if (m == null) return null;
    return report.higherIsBetter ? m : -m;
  };

  // A — aggregate series + headline stats
  const aggSeries: Array<number | null> = [];
  for (let m = 0; m < seriesLen; m++) {
    const vals = trendItems.map((it) => it.series?.[m]).filter((v): v is number => v != null && isFinite(v));
    if (!vals.length) { aggSeries.push(null); continue; }
    const sum = vals.reduce((s, v) => s + v, 0);
    aggSeries.push(isAvgFormat(report.format) ? sum / vals.length : sum);
  }
  const aggCur = lastVal(aggSeries);
  const aggPrev = aggSeries.length >= 2 ? aggSeries[aggSeries.length - 2] : null;
  const aggMom = aggCur != null && aggPrev != null && aggPrev !== 0 ? ((aggCur - aggPrev) / Math.abs(aggPrev)) * 100 : null;

  const gainersAll = trendItems
    .map((it) => ({ it, imp: improveOf(it), w: weightOf(it) }))
    .filter((x): x is { it: DetailItem; imp: number; w: number } => x.imp != null);
  const gainers = gainersAll.filter((x) => x.imp > 1).sort((a, b) => b.imp * b.w - a.imp * a.w);
  const losers = gainersAll.filter((x) => x.imp < -1).sort((a, b) => a.imp * a.w - b.imp * b.w);

  // B — distribution
  let distribution: DeepDistribution | undefined;
  if (cfg?.bands && trendItems.length) {
    distribution = {
      kind: "bands",
      series: cfg.bands.map((b) => ({ label: b.label, color: b.color, values: new Array(seriesLen).fill(0) })),
    };
    for (const it of trendItems) {
      for (let m = 0; m < seriesLen; m++) {
        const bi = bandIndex(cfg.bands, it.series?.[m] ?? null);
        if (bi >= 0) distribution.series[bi].values[m]++;
      }
    }
  } else if (cfg?.composition && trendItems.length) {
    const sorted = [...trendItems].sort((a, b) => (lastVal(b.series) ?? 0) - (lastVal(a.series) ?? 0));
    const top = sorted.slice(0, 8);
    const rest = sorted.slice(8);
    const series = top.map((it, i) => ({
      label: it.name, color: COMPOSITION_COLORS[i % COMPOSITION_COLORS.length],
      values: Array.from({ length: seriesLen }, (_, m) => it.series?.[m] ?? 0) as number[],
    }));
    if (rest.length) {
      series.push({
        label: "Other", color: COMPOSITION_COLORS[8],
        values: Array.from({ length: seriesLen }, (_, m) => rest.reduce((s, it) => s + (it.series?.[m] ?? 0), 0)),
      });
    }
    distribution = { kind: "composition", series };
  }

  // C — movement tables
  const row = (it: DetailItem) => ({ name: it.name, current: lastVal(it.series || []), momPct: itemMom(it) });
  const movements: DeepMovementTable[] = [];
  const entered: DetailItem[] = [], dropped: DetailItem[] = [];
  if (cfg?.bands) {
    const topBand = cfg.bands[0];
    const backIdx = Math.max(0, seriesLen - 4); // ~3 months ago
    for (const it of trendItems) {
      const nowIn = bandIndex(cfg.bands, lastVal(it.series || [])) === 0;
      const wasIn = bandIndex(cfg.bands, it.series?.[backIdx] ?? null) === 0;
      if (nowIn && !wasIn) entered.push(it);
      if (!nowIn && wasIn) dropped.push(it);
    }
    if (entered.length) movements.push({ title: `Entered ${topBand.label} (last 3 months)`, items: entered.map(row) });
    if (dropped.length) movements.push({ title: `Dropped from ${topBand.label}`, items: dropped.map(row) });
  }
  if (gainers.length) movements.push({ title: "Biggest gainers (volume-weighted)", items: gainers.slice(0, 6).map((x) => row(x.it)) });
  if (losers.length) movements.push({ title: "Biggest losers (volume-weighted)", items: losers.slice(0, 6).map((x) => row(x.it)) });

  // E — segments
  const segments: DeepSegmentTable[] = (cfg?.segments || []).map((def) => {
    const groups = new Map<string, DetailItem[]>();
    for (const it of trendItems) {
      const g = def.of(it) || "Other";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(it);
    }
    const rows = [...groups.entries()].map(([name, its]) => {
      const curs = its.map((it) => lastVal(it.series || [])).filter((v): v is number => v != null);
      const val = curs.length ? (isAvgFormat(report.format) ? curs.reduce((s, v) => s + v, 0) / curs.length : curs.reduce((s, v) => s + v, 0)) : null;
      const moms = its.map(itemMom).filter((v): v is number => v != null);
      return {
        name, count: its.length,
        value: fmtV(val, report.format),
        momPct: moms.length ? moms.reduce((s, v) => s + v, 0) / moms.length : null,
      };
    }).sort((a, b) => b.count - a.count);
    return { title: def.label, rows };
  }).filter((s) => s.rows.length > 1);

  // F — opportunities
  const opportunities = (cfg?.opportunities || []).map((def) => {
    let list = trendItems.filter(def.filter);
    if (def.sortBy) list = [...list].sort(def.sortBy);
    return { title: def.title, note: def.note, items: list.slice(0, def.limit ?? 8) };
  }).filter((o) => o.items.length);

  // D — per-item stats + flags
  const itemStats: Record<string, DeepItemStats> = {};
  const flags: Record<string, string> = {};
  for (const it of trendItems) {
    const vals = (it.series || []).filter((v): v is number => v != null && isFinite(v));
    if (vals.length >= 2) {
      const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
      const sd = Math.sqrt(vals.reduce((s, v) => s + (v - avg) ** 2, 0) / vals.length);
      itemStats[it.name] = {
        best: report.higherIsBetter ? Math.max(...vals) : Math.min(...vals),
        worst: report.higherIsBetter ? Math.min(...vals) : Math.max(...vals),
        avg,
        volatilityPct: avg !== 0 ? (sd / Math.abs(avg)) * 100 : 0,
      };
    }
    if (cfg?.flag) {
      const f = cfg.flag(it, items);
      if (f) flags[it.name] = f;
    }
  }

  // Narrative + headline stats
  const flagged = Object.keys(flags).length;
  let narrative = `${items.length} ${pluralize(report.itemLabel, items.length)} tracked`;
  if (trendItems.length) narrative += ` — ${gainers.length} improving, ${losers.length} declining this month`;
  if (distribution?.kind === "bands" && cfg?.bands) {
    const top = distribution.series[0];
    const nowN = top.values[seriesLen - 1] ?? 0;
    const yearN = top.values[0] ?? 0;
    narrative += `. ${nowN} in ${cfg.bands[0].label} (${nowN - yearN >= 0 ? "+" : ""}${nowN - yearN} vs a year ago)`;
  }
  if (flagged) narrative += `. ${flagged} flagged for attention`;
  narrative += ".";

  const stats: DeepStat[] = [{ label: pluralize(report.itemLabel, 2), value: String(items.length) }];
  if (aggCur != null) {
    stats.push({
      label: `${isAvgFormat(report.format) ? "Avg" : "Total"} ${report.primaryLabel || "value"}`,
      value: fmtV(aggCur, report.format), momPct: aggMom,
    });
  }
  if (distribution?.kind === "bands" && cfg?.bands) {
    const top = distribution.series[0];
    const nowN = top.values[seriesLen - 1] ?? 0, yearN = top.values[0] ?? 0;
    stats.push({ label: cfg.bands[0].label, value: String(nowN), sub: `${nowN - yearN >= 0 ? "+" : ""}${nowN - yearN} vs 12 mo ago` });
  }
  if (gainers.length || losers.length) stats.push({ label: "Movers", value: `${gainers.length}▲ ${losers.length}▼` });
  if (flagged) stats.push({ label: "Flagged", value: String(flagged) });

  // "What this means" — friendly interpretation, derived from the same data.
  const meaning = buildMeaning({
    report, cfg, noun, trendItems, gainers, losers, entered, dropped,
    distribution, opportunities, flags, itemStats, seriesLen,
  });

  return { report, months, narrative, stats, distribution, movements, segments, opportunities, flags, itemStats, meaning };
}

// ── "What this means" ─────────────────────────────────────────────────────
// Every takeaway is derived mechanically from the numbers above and written
// for a business owner: what happened, why it matters, what to do with it.
// No σ, no r², no analyst-speak — those stay in the tables for people who
// want them.
function buildMeaning(ctx: {
  report: DetailReport;
  cfg?: DeepConfig;
  noun: string;
  trendItems: DetailItem[];
  gainers: Array<{ it: DetailItem; imp: number; w: number }>;
  losers: Array<{ it: DetailItem; imp: number; w: number }>;
  entered: DetailItem[];
  dropped: DetailItem[];
  distribution?: DeepDistribution;
  opportunities: Array<{ title: string; note?: string; items: DetailItem[] }>;
  flags: Record<string, string>;
  itemStats: Record<string, DeepItemStats>;
  seriesLen: number;
}): MeaningItem[] {
  const { report, cfg, noun, trendItems, gainers, losers, entered, dropped, distribution, opportunities, flags, itemStats, seriesLen } = ctx;
  const out: MeaningItem[] = [];
  const nouns = pluralize(report.itemLabel, 2);
  const hib = report.higherIsBetter;
  const kind = mirrorKindOf(report.id);
  const total = trendItems.length;
  const pctOf = (n: number) => `${Math.abs(n).toFixed(0)}%`;

  // ── Intelligence mirrors get model-specific interpretation ──
  if (kind === "forecast") {
    const up = trendItems.filter((it) => (it.momPct ?? 0) > 1).length;
    const down = trendItems.filter((it) => (it.momPct ?? 0) < -1).length;
    const goodN = hib ? up : down, badN = hib ? down : up;
    if (total) {
      out.push({
        tone: badN > goodN ? "watch" : "good",
        text: `If current trends hold, ${goodN} of your ${total} ${nouns} will be in better shape three months from now and ${badN} will be worse. Nothing here is fate — the projection just shows where today's momentum leads.`,
      });
    }
    const low = trendItems.filter((it) => it.extra?.confidence === "low").length;
    const high = trendItems.filter((it) => it.extra?.confidence === "high").length;
    if (total) {
      out.push({
        tone: "info",
        text: high && low
          ? `The model is confident about ${high} of these (their history is steady). The ${low} marked "low" bounce around too much to pin down — read those as a rough direction, not a number to bank on.`
          : high
          ? `The history behind these is steady, so the projections are worth taking seriously — "high" confidence means the pattern has held for months.`
          : `None of these have a steady enough history for a confident number yet — treat every projection here as a rough direction, not a promise.`,
      });
    }
    const worst = [...losers].sort((a, b) => a.imp * a.w - b.imp * b.w)[0];
    if (worst) {
      out.push({
        tone: "bad",
        text: `Biggest projected slide: ${worst.it.name} (${pctOf(worst.imp)} the wrong way). Getting ahead of it this month is cheaper than reacting after the drop has happened.`,
      });
    }
    const best = [...gainers].sort((a, b) => b.imp * b.w - a.imp * a.w)[0];
    if (best) {
      out.push({
        tone: "good",
        text: `Best trajectory: ${best.it.name}, on track to improve ${pctOf(best.imp)}. Whatever is driving it is working — protect it.`,
      });
    }
    return out.slice(0, 4);
  }

  if (kind === "anomaly") {
    const alerts = trendItems.filter((it) => it.extra?.status === "Alert");
    const watches = trendItems.filter((it) => it.extra?.status === "Watch");
    if (!alerts.length && !watches.length) {
      out.push({ tone: "good", text: `Nothing broke its normal pattern this month — every ${noun} behaved the way its own history says it should. That's exactly what you want from this page.` });
    } else {
      const names = [...alerts, ...watches].slice(0, 2).map((i) => i.name).join(" and ");
      out.push({
        tone: alerts.length ? "bad" : "watch",
        text: `${alerts.length + watches.length} of your ${total} ${nouns} behaved unusually this month — most notably ${names}. Unusual isn't automatically bad: check whether YOU caused it (a campaign, a price change, a season) before treating it as a problem.`,
      });
      const top = alerts[0] || watches[0];
      const z = Number(top?.extra?.z ?? 0);
      if (top) {
        out.push({
          tone: "info",
          text: z >= 0
            ? `${top.name} came in well ABOVE its usual range. If you know what caused the spike, that's a recipe worth repeating; if you don't, it's worth five minutes to find out.`
            : `${top.name} came in well BELOW its usual range. One odd month isn't a trend — but if next month looks the same, act on it.`,
        });
      }
    }
    out.push({ tone: "info", text: `"Watch" means unusual, "Alert" means very unusual. The value of this page is speed: it spots pattern breaks months before they'd show up in your totals.` });
    return out.slice(0, 4);
  }

  if (kind === "opportunity") {
    const top = trendItems[0];
    if (top) {
      const slipping = (top.momPct ?? 0) < 0;
      out.push({
        tone: "info",
        text: `This list is sorted by what moves your business most — not by the biggest percentage. A small change in a heavyweight ${noun} beats a big change in a lightweight one, so work strictly top-down.`,
      });
      out.push({
        tone: slipping ? "bad" : "good",
        text: slipping
          ? `${top.name} is your #1 lever right now: it carries real weight and it's slipping (${pctOf(top.momPct ?? 0)}). Recovering it is likely the fastest single win available to you this month.`
          : `${top.name} is your #1 lever and it's already gaining (${pctOf(top.momPct ?? 0)}). Feed it — momentum plus weight is where growth compounds.`,
      });
    }
    const slippers = trendItems.filter((it) => (it.momPct ?? 0) < -1).length;
    if (total) {
      out.push({
        tone: slippers > total / 2 ? "watch" : "info",
        text: `${slippers} of the ${total} ${nouns} here are losing ground. Don't try to fix all of them — the top two or three rows cover most of the impact.`,
      });
    }
    return out.slice(0, 4);
  }

  // ── Trend reports ──
  // 1. The headline: is this area winning or losing overall?
  if (total >= 3 && (gainers.length || losers.length)) {
    if (gainers.length >= losers.length * 2) {
      out.push({ tone: "good", text: `Momentum is on your side: ${gainers.length} of your ${total} ${nouns} improved this month, only ${losers.length} slipped. Whatever you're doing here, keep doing it.` });
    } else if (losers.length >= gainers.length * 2) {
      out.push({ tone: "bad", text: `This area needs attention: ${losers.length} of your ${total} ${nouns} lost ground this month against ${gainers.length} that improved. The movement table below shows exactly where the slide is.` });
    } else {
      out.push({ tone: "info", text: `A mixed month: ${gainers.length} ${nouns} up, ${losers.length} down. The wins and losses roughly balance — the details below show which side deserves your energy.` });
    }
  }

  // 2. Band story: the count that matters, in plain terms.
  if (distribution?.kind === "bands" && cfg?.bands?.length) {
    const top = distribution.series[0];
    const nowN = top.values[seriesLen - 1] ?? 0;
    const yearN = top.values[0] ?? 0;
    const d = nowN - yearN;
    out.push({
      tone: d > 0 ? "good" : d < 0 ? "bad" : "info",
      text: d > 0
        ? `You now have ${nowN} ${pluralize(report.itemLabel, nowN)} in "${top.label}" — ${d} more than a year ago. That top group does most of the work, so this is the single number to keep growing.`
        : d < 0
        ? `You're down to ${nowN} ${pluralize(report.itemLabel, nowN)} in "${top.label}" — ${Math.abs(d)} fewer than a year ago. The top group does most of the work, so winning those back matters more than anything else on this page.`
        : `You have ${nowN} ${pluralize(report.itemLabel, nowN)} in "${top.label}" — the same as a year ago. Holding position isn't failure, but the fastest growth comes from moving more ${nouns} into that top group.`,
    });
    if (entered.length) {
      out.push({ tone: "good", text: `Fresh wins: ${entered.slice(0, 2).map((i) => i.name).join(" and ")} just moved into "${cfg.bands[0].label}" in the last three months. New arrivals are fragile — a little reinforcement now locks them in.` });
    } else if (dropped.length) {
      out.push({ tone: "watch", text: `${dropped.slice(0, 2).map((i) => i.name).join(" and ")} recently fell out of "${cfg.bands[0].label}". Recent drops are usually the easiest to reverse — they were there a few weeks ago.` });
    }
  }

  // 3. Composition story: dependence and drift.
  if (distribution?.kind === "composition" && distribution.series.length >= 2) {
    const last = seriesLen - 1;
    const totalNow = distribution.series.reduce((s, b) => s + (b.values[last] || 0), 0);
    const totalYear = distribution.series.reduce((s, b) => s + (b.values[0] || 0), 0);
    if (totalNow > 0) {
      const topSlice = [...distribution.series].sort((a, b) => (b.values[last] || 0) - (a.values[last] || 0))[0];
      const share = ((topSlice.values[last] || 0) / totalNow) * 100;
      if (share >= 45 && topSlice.label !== "Other") {
        out.push({ tone: "watch", text: `${topSlice.label} makes up ${share.toFixed(0)}% of the total here. Great while it performs — but that much riding on one ${noun} means a bad month there is a bad month everywhere. Growing a second strong source is the hedge.` });
      } else if (topSlice.label !== "Other") {
        out.push({ tone: "info", text: `${topSlice.label} is your biggest contributor at ${share.toFixed(0)}% of the total, with the rest reasonably spread out — a healthy mix that doesn't depend on any single source.` });
      }
      if (totalYear > 0) {
        let bestShift: { label: string; from: number; to: number } | null = null;
        for (const s of distribution.series) {
          if (s.label === "Other") continue;
          const from = ((s.values[0] || 0) / totalYear) * 100;
          const to = ((s.values[last] || 0) / totalNow) * 100;
          if (!bestShift || Math.abs(to - from) > Math.abs(bestShift.to - bestShift.from)) bestShift = { label: s.label, from, to };
        }
        if (bestShift && Math.abs(bestShift.to - bestShift.from) >= 6) {
          out.push({
            tone: "info",
            text: `The mix is quietly shifting: ${bestShift.label} went from ${bestShift.from.toFixed(0)}% to ${bestShift.to.toFixed(0)}% of the total over the year. Shifts like this usually deserve budget and attention before they finish happening.`,
          });
        }
      }
    }
  }

  // 4. The single most valuable fix (weight × decline).
  if (losers.length) {
    const worst = losers[0];
    out.push({
      tone: "bad",
      text: `If you fix one thing, fix ${worst.it.name}: it moved the wrong way by ${pctOf(worst.imp)} and it carries more weight than anything else that declined. A small recovery there is worth more than big wins on minor ${nouns}.`,
    });
  } else if (gainers.length && out.length < 3) {
    const best = gainers[0];
    out.push({ tone: "good", text: `Your strongest mover is ${best.it.name}, improving ${pctOf(best.imp)} — and it's one of the heavyweights, so that gain shows up in your real results, not just this table.` });
  }

  // 5. Opportunities: name the low-hanging fruit.
  const opp = opportunities[0];
  if (opp?.items.length) {
    out.push({
      tone: "good",
      text: `${opp.items.length} ${pluralize(report.itemLabel, opp.items.length)} qualify as "${opp.title}" — already close enough that a small push gets them over the line. These are usually the cheapest wins on this page.`,
    });
  }

  // 6. Flags, translated.
  const flagNames = Object.keys(flags);
  if (flagNames.length) {
    out.push({
      tone: "watch",
      text: `${flagNames.length} ${pluralize(report.itemLabel, flagNames.length)} carry a warning (look for the ⚠ in the table). For example ${flagNames[0]}: ${flags[flagNames[0]].toLowerCase()}`,
    });
  }

  // 7. Volatility, so one bad month doesn't cause panic.
  if (out.length < 5) {
    const volatile = Object.entries(itemStats).sort((a, b) => b[1].volatilityPct - a[1].volatilityPct)[0];
    if (volatile && volatile[1].volatilityPct >= 50) {
      out.push({ tone: "info", text: `${volatile[0]} swings about ±${volatile[1].volatilityPct.toFixed(0)}% month to month — that's its normal personality. Judge it on the three-month picture, not any single month.` });
    }
  }

  return out.slice(0, 5);
}
