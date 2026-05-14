// MonthlyScoreBars — small SVG bar chart for the "how has this trended over
// the last N months" view in IA Insights report cards (v7.2).
//
// Renders one bar per period (typically 12 months). Each bar is colored by
// its score band:
//   - green (≥ 70)
//   - amber (50–69)
//   - red (< 50)
//   - gray (no data)
//
// The most recent period is rightmost. Hover any bar to see exact value via
// the browser-native <title> element.
//
// Pure SVG, no chart library, no client-side state.

interface Point {
  period_end: string;
  score: number;
}

interface Props {
  data: Point[];
  width?: number;
  height?: number;
  /** Show the score on top of each bar (only fits when bars are wide). */
  showLabels?: boolean;
  /** When true, render a small "no history yet" placeholder if fewer than 2 points. */
  showPlaceholder?: boolean;
}

function bandColor(score: number): string {
  if (score >= 70) return "#16A34A";
  if (score >= 50) return "#EAB308";
  if (score > 0)   return "#DC2626";
  return "#CBD5E1";
}

function formatPeriod(periodEnd: string): string {
  // Most callers pass "YYYY-MM-DD". Render "MMM" (e.g. "Jan") which fits on
  // a narrow bar; expand to "MMM YYYY" inside the hover tooltip.
  try {
    const d = new Date(periodEnd);
    if (Number.isNaN(d.getTime())) return periodEnd;
    return d.toLocaleString(undefined, { month: "short" });
  } catch {
    return periodEnd;
  }
}

function formatPeriodFull(periodEnd: string): string {
  try {
    const d = new Date(periodEnd);
    if (Number.isNaN(d.getTime())) return periodEnd;
    return d.toLocaleString(undefined, { month: "short", year: "numeric" });
  } catch {
    return periodEnd;
  }
}

export function MonthlyScoreBars({
  data,
  width = 320,
  height = 80,
  showLabels = true,
  showPlaceholder = true,
}: Props) {
  if (!data || data.length < 2) {
    if (!showPlaceholder) return null;
    return (
      <div
        style={{ width, height }}
        className="rounded bg-slate-50 border border-slate-200 flex items-center justify-center"
      >
        <span className="text-[10px] text-slate-400 italic">Score history populates after 2+ periods</span>
      </div>
    );
  }

  // Layout: leave room for x-axis labels (12px) + score-on-top labels (10px).
  const labelHeight = showLabels ? 10 : 0;
  const axisHeight  = 12;
  const innerHeight = Math.max(20, height - labelHeight - axisHeight);
  const gap = 2;
  const n = data.length;
  const barWidth = Math.max(4, (width - gap * (n - 1)) / n);
  const max = 100;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
      {/* Band backgrounds (very faint) */}
      <rect x="0" y={labelHeight} width={width} height={innerHeight * 0.3} fill="#16A34A" fillOpacity={0.03} />
      <rect x="0" y={labelHeight + innerHeight * 0.3} width={width} height={innerHeight * 0.2} fill="#EAB308" fillOpacity={0.03} />
      <rect x="0" y={labelHeight + innerHeight * 0.5} width={width} height={innerHeight * 0.5} fill="#DC2626" fillOpacity={0.03} />

      {data.map((p, i) => {
        const x = i * (barWidth + gap);
        const barHeight = Math.max(1, (p.score / max) * innerHeight);
        const y = labelHeight + innerHeight - barHeight;
        const color = bandColor(p.score);
        return (
          <g key={i}>
            <rect x={x} y={y} width={barWidth} height={barHeight} fill={color} rx={1}>
              <title>{`${formatPeriodFull(p.period_end)}: ${p.score}/100`}</title>
            </rect>
            {showLabels && barWidth >= 18 && (
              <text
                x={x + barWidth / 2}
                y={Math.max(8, y - 2)}
                textAnchor="middle"
                fontSize="9"
                fill="#475569"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {p.score}
              </text>
            )}
            <text
              x={x + barWidth / 2}
              y={height - 2}
              textAnchor="middle"
              fontSize="9"
              fill="#94A3B8"
            >
              {formatPeriod(p.period_end)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default MonthlyScoreBars;
