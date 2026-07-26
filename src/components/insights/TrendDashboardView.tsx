// TrendDashboardView — the generic Trends renderer, driven by DashboardScore[].
//
// The funnel, as three navigable levels (Brandon 2026-07-24 — click goes to the
// actual detail view, never a dropdown):
//
//   OVERVIEW      platform score + the dashboard cards (score · MoM · sections)
//     → DASHBOARD the dashboard's section cards + insights & recommendations
//       → SECTION the detail report: each data point, its trend, how it's built
//
// ARION/SPARK/OLIVER/ARGUS all render this same component with their own scored
// dashboards, so the model looks identical everywhere.

import { useMemo, useState } from "react";
import { ChevronRight, ChevronLeft, TrendingUp, TrendingDown, Minus, ArrowLeft } from "lucide-react";
import { LineChart, BarChart, Donut, Gauge, StatBlock } from "../iainsights/SectionVisuals";
import { deriveInsights } from "../../analytics/insightGen";
import type { DashboardScore, SectionScore, DataPointScore, ValueFormat } from "../../analytics/scoring";
import { businessPulse, scoreDataPoint } from "../../analytics/scoring";
import { reportsForSection, itemMom, pluralize, type DetailPayload, type DetailReport } from "../../analytics/detail";
import { deriveDeepReport } from "../../analytics/deepReport";
import { deepConfigFor } from "../../analytics/deepConfigs";
import { DeepReportView } from "./DeepReportView";

// ── formatting ──
export function formatValue(v: number | string | null, format: ValueFormat): string {
  if (v == null || v === "") return "—";
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

function band(score: number | null): { color: string; bg: string; label: string } {
  if (score == null) return { color: "#94a3b8", bg: "#f1f5f9", label: "—" };
  if (score >= 80) return { color: "#15803d", bg: "#f0fdf4", label: "Excellent" };
  if (score >= 65) return { color: "#4d7c0f", bg: "#f7fee7", label: "Good" };
  if (score >= 45) return { color: "#b45309", bg: "#fffbeb", label: "Fair" };
  return { color: "#b91c1c", bg: "#fef2f2", label: "Needs work" };
}

function ScoreRing({ score, size = 56 }: { score: number | null; size?: number }) {
  const b = band(score);
  const stroke = 5, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const pct = score == null ? 0 : score;
  return (
    <svg width={size} height={size} className="flex-shrink-0" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={b.color} strokeWidth={stroke}
        strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        fontSize={size * 0.32} fontWeight={700} fill={b.color}>{score == null ? "—" : score}</text>
    </svg>
  );
}

function MoMBadge({ pct, small }: { pct: number | null; small?: boolean }) {
  if (pct == null) return <span className={`text-slate-400 ${small ? "text-[10px]" : "text-xs"}`}>—</span>;
  const flat = Math.abs(pct) < 1;
  const Icon = flat ? Minus : pct > 0 ? TrendingUp : TrendingDown;
  const tone = flat ? "text-slate-500 bg-slate-100" : pct > 0 ? "text-green-700 bg-green-50" : "text-red-700 bg-red-50";
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold ${tone} ${small ? "text-[10px]" : "text-xs"}`}>
      <Icon className={small ? "h-3 w-3" : "h-3.5 w-3.5"} />{pct > 0 ? "+" : ""}{pct.toFixed(0)}%
    </span>
  );
}

/** The data point's chosen visual, degrading gracefully when data is thin. */
function DataPointVisual({ dp }: { dp: DataPointScore }) {
  const clean = dp.series.filter((v): v is number => v != null && isFinite(v));
  const positive = dp.movementPct == null ? true : (dp.higherIsBetter ? dp.movementPct >= 0 : dp.movementPct >= 0);
  const n = dp.current ?? 0;
  const bounded = dp.format === "rating" ? (n / 5) * 100 : dp.format === "percent" ? Math.min(100, n) : n;
  const wants = dp.visual;
  const hasSeries = clean.length >= 2;
  if ((wants === "line" || wants === "bar") && hasSeries) {
    return wants === "line" ? <LineChart points={clean} positive={dp.movementPct == null ? true : dp.movementPct >= 0} />
                            : <BarChart points={clean} positive={dp.movementPct == null ? true : dp.movementPct >= 0} />;
  }
  if (wants === "donut" && isFinite(n)) return <Donut pct={bounded} positive={positive} />;
  if (wants === "gauge" && isFinite(n)) return <Gauge pct={bounded} positive={positive} />;
  return <StatBlock display={formatValue(dp.current, dp.format)} positive={positive} />;
}

// ── report-card mini chart: the REAL aggregate series, visible before the
// click (Brandon 2026-07-26 — "should show like Keyword Movement with a bar
// or line graph showing the real metrics"). Averaged formats (position/
// percent/rating/score) average across items; counts/currency sum. Feed
// reports preview their top rows instead.
const AVG_FORMATS = new Set(["percent", "position", "rating", "score"]);

/** The report's one honest monthly series: average across items for rate-like
 *  formats (position/percent/rating/score), sum for counts and currency. */
function aggregateReportSeries(report: DetailReport): Array<number | null> | null {
  const trendItems = report.items.filter((it) => (it.series?.filter((v) => v != null).length ?? 0) >= 2);
  if (!trendItems.length) return null;
  const len = Math.max(...trendItems.map((it) => it.series.length));
  const isAvg = AVG_FORMATS.has(report.format);
  const agg: Array<number | null> = [];
  for (let m = 0; m < len; m++) {
    const vals = trendItems.map((it) => it.series[m]).filter((v): v is number => v != null && isFinite(v));
    agg.push(vals.length ? (isAvg ? vals.reduce((s, v) => s + v, 0) / vals.length : vals.reduce((s, v) => s + v, 0)) : null);
  }
  return agg;
}

/** Overall report score — the report's aggregate series through the SAME
 *  Movement+Level engine that scores every data point, so report, section,
 *  and area scores all reconcile (Brandon 2026-07-26: every detail report
 *  listed with its overall score). Null for feed reports with no series. */
function scoreReport(report: DetailReport): { score: number | null; momPct: number | null } {
  const agg = aggregateReportSeries(report);
  if (!agg || agg.filter((v) => v != null).length < 2) return { score: null, momPct: null };
  const s = scoreDataPoint({
    key: report.id, label: report.label, what: "",
    series: agg, higherIsBetter: report.higherIsBetter,
    format: report.format as ValueFormat, visual: "line", weight: 1,
  } as any);
  return { score: s.score, momPct: s.movementPct };
}

/** Last two real values of a series — for "7 → 15" mover copy. */
function lastTwo(series: Array<number | null> | undefined): [number, number] | null {
  if (!series) return null;
  const real: number[] = [];
  for (let i = series.length - 1; i >= 0 && real.length < 2; i--) {
    const v = series[i];
    if (v != null && isFinite(v)) real.unshift(v);
  }
  return real.length === 2 ? [real[0], real[1]] : null;
}

/** Human mover copy: positions read as "#7 → #15", everything else as ±%.
 *  A percent on a ranking position means nothing to a business owner. */
function moverText(it: { name: string; series?: Array<number | null> }, report: DetailReport): { text: string; good: boolean } | null {
  const m = itemMom(it as any);
  if (m == null) return null;
  const good = report.higherIsBetter ? m >= 0 : m < 0;
  if (report.format === "position") {
    const lt = lastTwo(it.series);
    if (lt) return { text: `${it.name} #${Math.round(lt[0])} → #${Math.round(lt[1])}`, good };
  }
  return { text: `${it.name} ${m > 0 ? "+" : ""}${m.toFixed(0)}%`, good };
}

/** "Why this score" — the section page has to read like a report you'd hand
 *  a client (Brandon 2026-07-26): name the number, name what dragged it,
 *  name what held it up, in plain English with the real values. */
function sectionStory(sec: SectionScore): Array<{ tone: "good" | "bad" | "info"; text: string }> {
  const out: Array<{ tone: "good" | "bad" | "info"; text: string }> = [];
  if (sec.score == null) return out;
  const measured = sec.dataPoints.filter((dp) => !dp.unmeasured && dp.movementPct != null);
  const isBad = (dp: DataPointScore) => (dp.higherIsBetter ? dp.movementPct! < 0 : dp.movementPct! > 0);
  const drag = measured.filter(isBad).sort((a, b) => Math.abs(b.movementPct!) * b.weight - Math.abs(a.movementPct!) * a.weight)[0];
  const lift = measured.filter((dp) => !isBad(dp)).sort((a, b) => Math.abs(b.movementPct!) * b.weight - Math.abs(a.movementPct!) * a.weight)[0];

  const dir = sec.movementPct == null ? "" : sec.movementPct < -0.5 ? ` and slipped ${Math.abs(sec.movementPct).toFixed(0)}% vs last month` : sec.movementPct > 0.5 ? ` and gained ${sec.movementPct.toFixed(0)}% vs last month` : ` and is flat vs last month`;
  out.push({ tone: "info", text: `${sec.label} scores ${sec.score} — ${band(sec.score).label.toLowerCase()}${dir}.` });

  if (drag) {
    const from = drag.priorMonth != null ? formatValue(drag.priorMonth, drag.format) : null;
    const to = drag.current != null ? formatValue(drag.current, drag.format) : null;
    // Movement is 3-month smoothed; when last month's literal value matches
    // the current one, "(10,438 → 10,438)" reads absurd — drop it.
    const vals = from && to && from !== to ? ` (${from} → ${to})` : "";
    out.push({ tone: "bad", text: `The biggest drag is ${drag.label}, ${drag.higherIsBetter ? "down" : "up"} ${Math.abs(drag.movementPct!).toFixed(0)}% this month${vals} — it carries ${Math.round(drag.weight * 100)}% of this score.` });
  }
  if (lift) {
    const flat = Math.abs(lift.movementPct!) < 1;
    const vals = lift.current != null ? ` at ${formatValue(lift.current, lift.format)}` : "";
    out.push({ tone: "good", text: `${flat ? "Holding steady" : "Working in your favor"}: ${lift.label}${vals}${flat ? "" : ` (${lift.higherIsBetter ? "up" : "improved"} ${Math.abs(lift.movementPct!).toFixed(0)}%)`}.` });
  } else if (drag) {
    out.push({ tone: "bad", text: `Nothing in this section improved this month — the reports below show exactly which items are sliding.` });
  }
  return out;
}

function MiniReportChart({ report }: { report: DetailReport }) {
  const agg = aggregateReportSeries(report);
  if (!agg) {
    return (
      <div className="space-y-0.5">
        {report.items.slice(0, 3).map((it, i) => (
          <div key={i} className="flex items-center justify-between text-[11px] text-slate-600">
            <span className="truncate">{it.name}</span>
            {it.extra && <span className="text-slate-400 flex-shrink-0 ml-2">{String(Object.values(it.extra)[0] ?? "")}</span>}
          </div>
        ))}
      </div>
    );
  }
  const shown = agg.slice(-12);
  const clean = shown.filter((v): v is number => v != null);
  if (clean.length < 2) return null;
  const first = clean[0], last = clean[clean.length - 1];
  const improving = report.higherIsBetter ? last >= first : last <= first;
  const color = improving ? "#16a34a" : "#dc2626";
  const max = Math.max(...clean), min = Math.min(...clean, 0);
  const H = 56, W = 240, gap = 2;
  const bw = (W - gap * (shown.length - 1)) / shown.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} preserveAspectRatio="none" aria-hidden="true">
      {shown.map((v, i) => {
        if (v == null) return null;
        const h = Math.max(2, ((v - min) / (max - min || 1)) * (H - 4));
        const isLast = i === shown.length - 1;
        return <rect key={i} x={i * (bw + gap)} y={H - h} width={bw} height={h} rx={1.5}
          fill={isLast ? color : "#cbd5e1"} opacity={isLast ? 1 : 0.85} />;
      })}
    </svg>
  );
}

// ── breadcrumb ──
function Crumbs({ trail, onNav }: { trail: string[]; onNav: (level: number) => void }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-3 flex-wrap">
      {trail.map((t, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="h-3 w-3 text-slate-300" />}
          {i < trail.length - 1
            ? <button onClick={() => onNav(i)} className="hover:text-slate-800 hover:underline">{t}</button>
            : <span className="font-semibold text-slate-700">{t}</span>}
        </span>
      ))}
    </div>
  );
}

// ── the view ──
export function TrendDashboardView({ dashboards, platformLabel, detail, scoreNoun = "Trend" }: { dashboards: DashboardScore[]; platformLabel: string; detail?: DetailPayload; scoreNoun?: string }) {
  const [dashKey, setDashKey] = useState<string | null>(null);
  const [secKey, setSecKey] = useState<string | null>(null);
  const [repKey, setRepKey] = useState<string | null>(null);

  const platformScore = useMemo(
    () => businessPulse(dashboards.map((d) => d.score)),
    [dashboards],
  );

  const dash = dashboards.find((d) => d.key === dashKey) || null;
  const sec = dash?.sections.find((s) => s.key === secKey) || null;

  // ── FULL DETAIL REPORT (deepest level — the actual business report) ──
  if (dash && sec && repKey) {
    const rep = reportsForSection(detail, dash.key, sec.key).find((r) => r.id === repKey);
    if (rep) {
      const deep = deriveDeepReport(rep, deepConfigFor(rep.id));
      return (
        <div className="insights-shell">
          <Crumbs
            trail={[platformLabel, dash.label, sec.label, rep.label]}
            onNav={(l) => { if (l === 0) { setDashKey(null); setSecKey(null); setRepKey(null); } else if (l === 1) { setSecKey(null); setRepKey(null); } else if (l === 2) setRepKey(null); }}
          />
          <button onClick={() => setRepKey(null)} className="mb-3 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
            <ArrowLeft className="h-3.5 w-3.5" /> back to {sec.label}
          </button>
          <h2 className="text-lg font-bold text-slate-900 mb-3">{rep.label}</h2>
          <DeepReportView deep={deep} />
        </div>
      );
    }
  }

  // ── SECTION DETAIL REPORT ──
  if (dash && sec) {
    return (
      <div className="insights-shell">
        <Crumbs trail={[platformLabel, dash.label, sec.label]} onNav={(l) => { if (l === 0) { setDashKey(null); setSecKey(null); } else if (l === 1) setSecKey(null); }} />
        <button onClick={() => setSecKey(null)} className="mb-3 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-3.5 w-3.5" /> back to {dash.label}
        </button>
        <div className="flex items-center gap-3 mb-4">
          <ScoreRing score={sec.score} />
          <div>
            <h2 className="text-lg font-bold text-slate-900">{sec.label}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <MoMBadge pct={sec.movementPct} />
              <span className="text-xs text-slate-500">{band(sec.score).label} · this month vs last</span>
            </div>
          </div>
        </div>
        {/* WHY THIS SCORE — the client-readable story before any tiles. */}
        {(() => {
          const story = sectionStory(sec);
          if (!story.length) return null;
          return (
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 mb-5">
              <div className="text-[10px] uppercase font-semibold tracking-wide text-slate-500 mb-1.5">Why this score</div>
              <div className="space-y-1">
                {story.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 text-[13px] leading-snug text-slate-700">
                    <span className={`mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0 ${s.tone === "bad" ? "bg-red-500" : s.tone === "good" ? "bg-green-500" : "bg-slate-400"}`} />
                    <span>{s.text}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
        {/* DETAIL REPORTS lead (Brandon 2026-07-26): click a section → its
            reports, each with an overall score, click one → the full report.
            The data-point tiles are the score's inputs and render BELOW. */}
        {(() => {
          const reports = reportsForSection(detail, dash.key, sec.key);
          if (!reports.length) {
            return (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 mb-6">
                <div className="text-sm font-semibold text-slate-700">No in-depth reports here yet</div>
                <div className="text-xs text-slate-500 mt-1">
                  This section is scored from the data points below, but none of your connected
                  sources provide line-item detail for it yet. Reports appear automatically once
                  the source behind this section has dimensional data.
                </div>
              </div>
            );
          }
          return (
            <>
              <div className="text-[10px] uppercase font-semibold tracking-wide text-slate-500 mb-2">Detail reports — click one to open the full report</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
                {reports.map((r) => {
                  const rs = scoreReport(r);
                  const agg = aggregateReportSeries(r);
                  const aggFirst = agg?.find((v) => v != null) ?? null;
                  const aggLast = agg ? [...agg].reverse().find((v) => v != null) ?? null : null;
                  const aggGood = aggFirst != null && aggLast != null ? (r.higherIsBetter ? aggLast >= aggFirst : aggLast <= aggFirst) : null;
                  // Headline movers: best gain + worst loss, in human units.
                  const ranked = r.items
                    .map((it) => ({ it, m: itemMom(it) }))
                    .filter((x): x is { it: typeof x.it; m: number } => x.m != null)
                    .sort((a, b) => Math.abs(b.m) - Math.abs(a.m));
                  const top = ranked[0] ? moverText(ranked[0].it as any, r) : null;
                  return (
                    <button key={r.id} onClick={() => setRepKey(r.id)}
                      className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left hover:border-slate-300 hover:shadow-sm">
                      {rs.score != null && <ScoreRing score={rs.score} size={44} />}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900 truncate">{r.label}</span>
                          {rs.momPct != null && <MoMBadge pct={rs.momPct} small />}
                        </div>
                        {agg && (
                          <div className="flex items-center justify-between mt-1.5 text-[10px] uppercase tracking-wide text-slate-400">
                            <span>{AVG_FORMATS.has(r.format) ? "Avg" : "Total"} {(r as any).primaryLabel || r.itemLabel} · 12 months</span>
                            <span className="normal-case tracking-normal text-[11px]">
                              {formatValue(aggFirst, r.format as ValueFormat)} → <span className={`font-semibold ${aggGood ? "text-green-600" : "text-red-600"}`}>{formatValue(aggLast, r.format as ValueFormat)}</span>
                            </span>
                          </div>
                        )}
                        <div className="mt-1"><MiniReportChart report={r} /></div>
                        <div className="text-[11px] text-slate-500 mt-2">
                          {r.items.length} {pluralize(r.itemLabel, r.items.length)}
                          {top && <> · biggest move: <span className={`font-semibold ${top.good ? "text-green-600" : "text-red-600"}`}>{top.text}</span></>}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-300 flex-shrink-0 mt-1" />
                    </button>
                  );
                })}
              </div>
            </>
          );
        })()}
        <div className="text-[10px] uppercase font-semibold tracking-wide text-slate-500 mb-2">Score inputs — the data points behind the {sec.label} score</div>
        <div className="space-y-2 mb-6">
          {sec.dataPoints.map((dp) => <DataPointDetail key={dp.key} dp={dp} months={dashboards} />)}
        </div>
      </div>
    );
  }

  // ── DASHBOARD DETAIL (sections + insights) ──
  if (dash) {
    const insights = deriveInsights(dash);
    const priorities = insights.filter((i) => i.priority);
    const wins = insights.filter((i) => !i.priority);
    return (
      <div className="insights-shell">
        <Crumbs trail={[platformLabel, dash.label]} onNav={() => setDashKey(null)} />
        <button onClick={() => setDashKey(null)} className="mb-3 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-3.5 w-3.5" /> back to {platformLabel} {scoreNoun}s
        </button>
        <div className="flex items-center gap-3 mb-1">
          <ScoreRing score={dash.score} size={64} />
          <div>
            <h2 className="text-xl font-bold text-slate-900">{dash.label}</h2>
            <p className="text-xs text-slate-500">{(dash as any).question || ""}</p>
            <div className="flex items-center gap-2 mt-1"><MoMBadge pct={dash.movementPct} /><span className="text-xs text-slate-500">{band(dash.score).label} · vs last month</span></div>
          </div>
        </div>

        <div className="text-[10px] uppercase font-semibold tracking-wide text-slate-500 mt-5 mb-2">What's driving this score — click any section for the detail</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {dash.sections.map((s) => (
            <button key={s.key} onClick={() => { setSecKey(s.key); setRepKey(null); }}
              className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left hover:border-slate-300 hover:bg-slate-50">
              <ScoreRing score={s.score} size={44} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><span className="text-sm font-semibold text-slate-900">{s.label}</span><MoMBadge pct={s.movementPct} small /></div>
                <div className="text-[11px] text-slate-500 mt-0.5">{s.dataPoints.filter((d) => !d.unmeasured).length} of {s.dataPoints.length} measured{s.score == null ? " · not connected" : ""}</div>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-300 flex-shrink-0" />
            </button>
          ))}
        </div>

        {insights.length > 0 && (
          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-900 p-5">
            {priorities.length > 0 && (
              <>
                <div className="text-[10px] uppercase font-bold tracking-wide text-orange-400 mb-3">{priorities.length === 1 ? "Top priority" : `Top ${priorities.length} priorities`}</div>
                {priorities.map((p, i) => <InsightRow key={p.id} n={i + 1} insight={p.insight} rec={p.recommendation} accent="#fb923c" />)}
              </>
            )}
            {wins.length > 0 && (
              <div className={priorities.length ? "mt-4 pt-4 border-t border-white/10" : ""}>
                <div className="text-[10px] uppercase font-bold tracking-wide text-lime-400 mb-3">Also worth knowing</div>
                {wins.map((w, i) => <InsightRow key={w.id} n={priorities.length + i + 1} insight={w.insight} rec={w.recommendation} accent="#a3e635" />)}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── OVERVIEW ──
  return (
    <div className="insights-shell">
      <div className="flex items-center gap-3 mb-5">
        <ScoreRing score={platformScore} size={64} />
        <div>
          <h2 className="text-xl font-bold text-slate-900">{platformLabel} {scoreNoun} Score</h2>
          <p className="text-xs text-slate-500">{dashboards.filter((d) => d.score != null).length} of {dashboards.length} areas measured · click any area to drill in</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {dashboards.map((d) => (
          <button key={d.key} onClick={() => { if (d.score != null) { setDashKey(d.key); setSecKey(null); setRepKey(null); } }}
            className={`flex flex-col rounded-lg border border-slate-200 bg-white p-4 text-left ${d.score != null ? "hover:border-slate-300 hover:shadow-sm cursor-pointer" : "opacity-70 cursor-default"}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-900 leading-tight">{d.label}</h3>
                <div className="mt-1"><MoMBadge pct={d.movementPct} small /></div>
              </div>
              <ScoreRing score={d.score} size={48} />
            </div>
            {d.score == null ? (
              <p className="mt-3 text-[11px] text-amber-700">Not connected yet</p>
            ) : (
              <div className="mt-3 space-y-1">
                {d.sections.map((s) => (
                  <div key={s.key} className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500 truncate">{s.label}</span>
                    <span className="flex items-center gap-1.5">
                      <span className="font-semibold text-slate-700 tabular-nums">{s.score ?? "—"}</span>
                      <MoMBadge pct={s.movementPct} small />
                    </span>
                  </div>
                ))}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── data point detail row (the deepest level) ──
function DataPointDetail({ dp }: { dp: DataPointScore; months?: any }) {
  const [open, setOpen] = useState(false);
  if (dp.unmeasured) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        <div className="text-sm font-semibold text-slate-900">{dp.label}</div>
        <p className="text-[11px] text-amber-700 mt-0.5">{dp.unmeasured.reason}</p>
      </div>
    );
  }
  const positive = dp.movementPct == null ? true : dp.movementPct >= 0;
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 rounded-lg">
        <DataPointVisual dp={dp} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-900">{dp.label}</span>
            <MoMBadge pct={dp.movementPct} small />
            <span className="text-[10px] text-slate-400">{Math.round(dp.weight * 100)}% of section</span>
            {dp.levelKind && <span className="text-[10px] text-slate-400">· vs {dp.levelKind}</span>}
          </div>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="text-lg font-bold text-slate-900 tabular-nums">{formatValue(dp.current, dp.format)}</span>
            {dp.priorMonth != null && <span className="text-[11px] text-slate-400">from {formatValue(dp.priorMonth, dp.format)}</span>}
          </div>
          {dp.what && <p className="mt-1 text-xs text-slate-500 leading-relaxed">{dp.what}</p>}
        </div>
        {open ? <ChevronLeft className="h-4 w-4 text-slate-400 rotate-90" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
      </button>
      {open && (
        <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/60 rounded-b-lg text-[11px] text-slate-600 space-y-2">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <span>Movement score <b className="text-slate-800">{dp.movementScore}</b></span>
            {dp.levelScore != null && <span>Level score <b className="text-slate-800">{Math.round(dp.levelScore)}</b> ({dp.levelKind})</span>}
            <span>Combined <b className="text-slate-800">{dp.score}</b></span>
          </div>
          <div>
            <div className="text-[10px] uppercase font-semibold text-slate-400 mb-1">12-month trend</div>
            <div className="flex items-end gap-0.5 h-10">
              {dp.series.map((v, i) => {
                const clean = dp.series.filter((x): x is number => x != null);
                const max = Math.max(...clean, 1), min = Math.min(...clean, 0);
                const h = v == null ? 0 : ((v - min) / (max - min || 1)) * 100;
                const last = i === dp.series.length - 1;
                return <div key={i} title={v == null ? "" : formatValue(v, dp.format)} className="flex-1 rounded-sm" style={{ height: `${Math.max(4, h)}%`, background: last ? (positive ? "#16a34a" : "#dc2626") : "#cbd5e1" }} />;
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InsightRow({ n, insight, rec, accent }: { n: number; insight: string; rec: string; accent: string }) {
  return (
    <div className="flex gap-3 mb-3 last:mb-0">
      <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: accent }}>{n}</div>
      <div className="min-w-0">
        <p className="text-[12px] text-slate-200 leading-relaxed">{insight}</p>
        <p className="mt-1 text-[11px] leading-relaxed flex gap-1.5" style={{ color: accent }}>
          <span className="font-bold flex-shrink-0">→</span><span>{rec}</span>
        </p>
      </div>
    </div>
  );
}
