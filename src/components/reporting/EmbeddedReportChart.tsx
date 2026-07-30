// EmbeddedReportChart — v7.2 reusable embedded analytics chart for base
// pages (Campaigns / Newsletters / Jobs etc.).
//
// Owns: date-range toggle pills · totals row · daily area+bar chart ·
// "View full report" link to the corresponding IA Insights Trends report.
//
// Data is supplied via a parent-provided fetcher so this component stays
// product-agnostic. The fetcher receives `days` and must return a series
// of `{ day, ...metrics }` plus a totals object.
//
// Note on tier-gating: the parent passes `tierGate` if a tier check should
// suppress longer ranges (e.g. show only 7/30 for Starter, all for Pro).
// The component itself never reads tier — it just hides disabled options.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, BarChart3 } from "lucide-react";

export type RangeKey = "week" | "last7" | "month" | "last30" | "quarter" | "last90" | "year" | "last365";

export interface SeriesPoint {
  day: string;            // YYYY-MM-DD
  [metric: string]: number | string;
}

export interface ReportSeriesResponse {
  totals: Record<string, number>;
  series: SeriesPoint[];
}

export interface MetricSpec {
  /** Key on each SeriesPoint (e.g. "sends"). */
  key: string;
  /** Display label (e.g. "Sends"). */
  label: string;
  /** Optional formatter for totals row. Default: locale number. */
  format?: (n: number) => string;
  /** Optional color for the area/line. Defaults to slate-500. */
  color?: string;
  /** When true, draw as bars (not area). Useful for counts vs rates. */
  bars?: boolean;
}

export interface EmbeddedReportChartProps {
  title: string;
  subtitle?: string;
  /** Async fetcher; called whenever the range changes. */
  fetcher: (days: number) => Promise<ReportSeriesResponse>;
  /** Metrics to plot. First is treated as the primary series. */
  metrics: MetricSpec[];
  /** Route to the full IA Insights Trends report. */
  fullReportRoute: string;
  /** Optional accent color for the header chip / link. */
  accent?: string;
  /** Optional caller-controlled disabling of long-range pills. */
  enabledRanges?: RangeKey[];
  /** Initial range. Defaults to "last30". */
  initialRange?: RangeKey;
  /**
   * COMPACT mode — for pages where the chart is context, not the point.
   *
   * Brandon 2026-07-28, on Outreach → Campaigns: "the graph is too big.
   * Honestly this should be a much smaller graph at the top so you can get to
   * your list of email campaigns much easier." Full size stacks a header, two
   * rows of range pills, four totals tiles and a 160px plot — about 360px
   * before the campaigns table even starts, so the list you came for is
   * below the fold.
   *
   * Compact keeps every number but shrinks the footprint: short range set,
   * totals inline on one line, and a shorter plot.
   */
  compact?: boolean;
}

const RANGE_OPTIONS: Array<{ key: RangeKey; label: string; days: number }> = [
  { key: "week",     label: "This week",     days: 7 },
  { key: "last7",    label: "Last 7",        days: 7 },
  { key: "month",    label: "This month",    days: 30 },
  { key: "last30",   label: "Last 30",       days: 30 },
  { key: "quarter",  label: "This quarter",  days: 90 },
  { key: "last90",   label: "Last 90",       days: 90 },
  { key: "year",     label: "This year",     days: 365 },
  { key: "last365",  label: "Last 365",      days: 365 },
];

export function EmbeddedReportChart({
  title,
  subtitle,
  fetcher,
  metrics,
  fullReportRoute,
  accent = "#1A7DB5",
  enabledRanges,
  initialRange = "last30",
  compact = false,
}: EmbeddedReportChartProps) {
  const [range, setRange] = useState<RangeKey>(initialRange);
  const [data, setData] = useState<ReportSeriesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const visibleRanges = useMemo(() => {
    // Compact shows the three ranges people actually use, so the pills stay on
    // one line instead of wrapping to two. The full report has all eight.
    const base = compact
      ? RANGE_OPTIONS.filter((r) => r.key === "last7" || r.key === "last30" || r.key === "last90")
      : RANGE_OPTIONS;
    if (!enabledRanges) return base;
    const set = new Set(enabledRanges);
    return base.filter((r) => set.has(r.key));
  }, [enabledRanges, compact]);

  useEffect(() => {
    const days = RANGE_OPTIONS.find((r) => r.key === range)?.days ?? 30;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    fetcher(days)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((e) => { if (!cancelled) setErr(String((e as Error)?.message || e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range, fetcher]);

  return (
    <div className={`rounded-lg border border-slate-200 bg-white ${compact ? "p-3" : "p-4"}`}>
      <div className={`flex flex-wrap items-start justify-between gap-3 ${compact ? "mb-2" : "mb-3"}`}>
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex-shrink-0 h-8 w-8 rounded-lg flex items-center justify-center" style={{ background: `${accent}1A`, color: accent }}>
            <BarChart3 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 truncate">{title}</h3>
            {subtitle && <p className="text-[11px] text-slate-500 truncate">{subtitle}</p>}
          </div>
        </div>
        <Link
          to={fullReportRoute}
          className="text-xs flex items-center gap-1 hover:underline flex-shrink-0"
          style={{ color: accent }}
        >
          View full report <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Range toggle pills */}
      <div className={`flex flex-wrap gap-1 ${compact ? "mb-2" : "mb-3"}`}>
        {visibleRanges.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`text-[11px] px-2 py-1 rounded-full transition-colors ${
              range === r.key
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Totals — four stacked tiles at full size; one inline row when compact,
          which keeps every number but saves ~40px of vertical space. */}
      {data && (compact ? (
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-2">
          {metrics.map((m) => {
            const v = data.totals[m.key] ?? 0;
            return (
              <div key={m.key} className="flex items-baseline gap-1.5">
                <span className="text-[10px] uppercase font-semibold tracking-wide text-slate-500">{m.label}</span>
                <span className="text-sm font-semibold text-slate-900 tabular-nums">
                  {m.format ? m.format(v) : Number(v).toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          {metrics.map((m) => {
            const v = data.totals[m.key] ?? 0;
            const formatted = m.format ? m.format(v) : Number(v).toLocaleString();
            return (
              <div key={m.key} className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[10px] uppercase font-semibold tracking-wide text-slate-500">{m.label}</div>
                <div className="text-lg font-semibold text-slate-900 tabular-nums">{formatted}</div>
              </div>
            );
          })}
        </div>
      ))}

      {/* Chart */}
      {loading && !data && <div className="text-xs text-slate-400 py-8 text-center">Loading…</div>}
      {err && !loading && <div className="text-xs text-rose-600 py-2">Failed to load: {err}</div>}
      {data && data.series.length > 0 && (
        <SeriesChart series={data.series} metrics={metrics} accent={accent} height={compact ? 84 : 160} />
      )}
      {data && data.series.length === 0 && !loading && (
        <div className="text-xs text-slate-400 py-6 text-center">No data in this range.</div>
      )}
    </div>
  );
}

// ── Lightweight stacked area+bar SVG chart ────────────────────────────────
function SeriesChart({
  series, metrics, accent, height = 160,
}: {
  series: SeriesPoint[];
  metrics: MetricSpec[];
  accent: string;
  /** Plot height in SVG units; callers pass a shorter one for compact mode. */
  height?: number;
}) {
  const width = 720;
  // height now comes from props (compact mode passes a shorter plot).
  const padL = 24;
  const padR = 8;
  const padT = 8;
  const padB = 18;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const n = series.length;

  // Find max across all plotted metrics for shared y-axis.
  let max = 1;
  for (const m of metrics) {
    for (const p of series) {
      const v = Number(p[m.key] ?? 0);
      if (v > max) max = v;
    }
  }
  // Headroom
  max = max * 1.1;

  const xStep = innerW / Math.max(1, n - 1);

  function xAt(i: number) { return padL + i * xStep; }
  function yAt(v: number) { return padT + innerH - (v / max) * innerH; }

  // X-axis ticks: first, mid, last
  const ticks = n <= 1
    ? [0]
    : [0, Math.floor(n / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="block">
      {/* Y-axis gridlines */}
      {[0.25, 0.5, 0.75, 1.0].map((p) => {
        const y = padT + innerH - innerH * p;
        return (
          <g key={p}>
            <line x1={padL} x2={padL + innerW} y1={y} y2={y} stroke="#E2E8F0" strokeDasharray="2 4" />
            <text x={padL - 2} y={y + 3} textAnchor="end" fontSize="9" fill="#94A3B8">
              {Math.round(max * p).toLocaleString()}
            </text>
          </g>
        );
      })}

      {/* Plot each metric */}
      {metrics.map((m, mi) => {
        const color = m.color || (mi === 0 ? accent : `hsl(${(mi * 67) % 360}, 60%, 50%)`);
        if (m.bars) {
          const bw = Math.max(2, xStep - 1);
          return (
            <g key={m.key}>
              {series.map((p, i) => {
                const v = Number(p[m.key] ?? 0);
                const y = yAt(v);
                const h = padT + innerH - y;
                return (
                  <rect key={i} x={xAt(i) - bw / 2} y={y} width={bw} height={Math.max(0, h)} fill={color} fillOpacity={0.7}>
                    <title>{`${p.day} — ${m.label}: ${v.toLocaleString()}`}</title>
                  </rect>
                );
              })}
            </g>
          );
        }
        // Area + line for non-bar metrics
        const pts = series.map((p, i) => ({ x: xAt(i), y: yAt(Number(p[m.key] ?? 0)) }));
        const linePath = pts.map((pt, i) => (i === 0 ? "M" : "L") + pt.x.toFixed(1) + "," + pt.y.toFixed(1)).join(" ");
        const areaPath = `${linePath} L${pts[pts.length - 1].x.toFixed(1)},${padT + innerH} L${pts[0].x.toFixed(1)},${padT + innerH} Z`;
        return (
          <g key={m.key}>
            <path d={areaPath} fill={color} fillOpacity={0.08} />
            <path d={linePath} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
            {pts.map((pt, i) => (
              <circle key={i} cx={pt.x} cy={pt.y} r={1.6} fill={color}>
                <title>{`${series[i].day} — ${m.label}: ${Number(series[i][m.key] ?? 0).toLocaleString()}`}</title>
              </circle>
            ))}
          </g>
        );
      })}

      {/* X-axis labels */}
      {ticks.map((i) => (
        <text key={i} x={xAt(i)} y={height - 4} textAnchor="middle" fontSize="9" fill="#94A3B8">
          {(series[i]?.day || "").slice(5)}
        </text>
      ))}

      {/* Legend */}
      <g transform={`translate(${padL + 4} ${padT + 4})`}>
        {metrics.map((m, mi) => {
          const color = m.color || (mi === 0 ? accent : `hsl(${(mi * 67) % 360}, 60%, 50%)`);
          return (
            <g key={m.key} transform={`translate(${mi * 78} 0)`}>
              <rect x="0" y="0" width="8" height="8" fill={color} fillOpacity={m.bars ? 0.7 : 1} rx="1" />
              <text x="11" y="7" fontSize="9" fill="#475569">{m.label}</text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

export default EmbeddedReportChart;
