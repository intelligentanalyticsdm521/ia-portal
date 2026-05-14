// Sparkline — small inline SVG line chart for score history (v5.21).
//
// Pure SVG, no chart library. Takes an array of { period_end, score }
// rows and renders a 12-period mini chart with a single colored line
// and end-point dot. Hover the chart to see exact values via the
// browser-native <title> elements on each point.
//
// Used on IA Insights report cards to show "how is this trending".

interface Point {
  period_end: string;
  score: number;
}

interface SparklineProps {
  data: Point[];
  width?: number;
  height?: number;
  color?: string;
  /** Optional baseline band — renders a green/amber/red gradient over the
   *  background to show where the line sits relative to score thresholds. */
  showBands?: boolean;
}

export function Sparkline({ data, width = 120, height = 32, color = "#1A7DB5", showBands = true }: SparklineProps) {
  if (!data || data.length < 2) {
    return (
      <div
        style={{ width, height }}
        className="rounded bg-slate-50 border border-slate-200 flex items-center justify-center"
      >
        <span className="text-[9px] text-slate-400 italic">not enough history</span>
      </div>
    );
  }

  // Normalize: x = position 0..1, y = 0..1 (inverted since SVG y grows down)
  const min = 0;
  const max = 100;
  const n = data.length;
  const xStep = width / Math.max(1, n - 1);
  const points = data.map((p, i) => {
    const x = i * xStep;
    const y = height - ((p.score - min) / (max - min)) * height;
    return { x, y, score: p.score, period_end: p.period_end };
  });

  // Build polyline path
  const linePath = points.map((p, i) => (i === 0 ? "M" : "L") + p.x.toFixed(1) + "," + p.y.toFixed(1)).join(" ");
  // Area-fill path under the line
  const areaPath = `${linePath} L${width.toFixed(1)},${height} L0,${height} Z`;
  const last = points[points.length - 1];
  const first = points[0];
  const delta = last.score - first.score;
  const trend = delta > 0 ? "up" : delta < 0 ? "down" : "flat";

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
      {showBands && (
        <>
          {/* Red band (below 50) */}
          <rect x="0" y={(height * 0.5)} width={width} height={height * 0.5} fill="#DC2626" fillOpacity={0.04} />
          {/* Amber band (50-70) */}
          <rect x="0" y={(height * 0.3)} width={width} height={height * 0.2} fill="#EAB308" fillOpacity={0.04} />
          {/* Green band (70+) */}
          <rect x="0" y="0" width={width} height={height * 0.3} fill="#16A34A" fillOpacity={0.04} />
        </>
      )}
      <path d={areaPath} fill={color} fillOpacity={0.10} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      {/* Endpoint dot */}
      <circle cx={last.x} cy={last.y} r={2.5} fill={color}>
        <title>{`${last.period_end}: ${last.score}/100${trend !== "flat" ? ` (${delta > 0 ? "+" : ""}${delta} since first period)` : ""}`}</title>
      </circle>
      {/* Subtle start-point ring */}
      <circle cx={first.x} cy={first.y} r={2} fill="none" stroke={color} strokeOpacity={0.5} strokeWidth={1}>
        <title>{`${first.period_end}: ${first.score}/100`}</title>
      </circle>
    </svg>
  );
}

export default Sparkline;
