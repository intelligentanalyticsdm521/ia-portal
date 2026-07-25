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

export function monthLabels(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let m = n - 1; m >= 0; m--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, 1));
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
  if (cfg?.bands) {
    const topBand = cfg.bands[0];
    const backIdx = Math.max(0, seriesLen - 4); // ~3 months ago
    const entered: DetailItem[] = [], dropped: DetailItem[] = [];
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

  return { report, months, narrative, stats, distribution, movements, segments, opportunities, flags, itemStats };
}
