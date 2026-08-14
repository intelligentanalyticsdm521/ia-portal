// SectionVisuals — the chart primitives a section card can render.
//
// Brandon, 2026-07-24: "not everything should be a donut. Depending on the
// specific section report it may be best to show a line chart, some may be
// best to show bar charts. Just putting 8 donuts is not helpful."
//
// The visual has to match the SHAPE of the metric, not the convenience of the
// component:
//
//   line   — a value moving through time (impressions, positions, actions)
//   bar    — discrete periods or a small distribution (reviews per month)
//   donut  — a part of a whole (mobile share, brand vs non-brand)
//   gauge  — a bounded measure read against a target (rates, 0-100 scores)
//   stat   — a count with no useful geometry (quick wins, content gaps)
//
// All inline SVG, no chart library — same approach as MonthlyScoreBars.

const GREEN = "#16a34a";
const RED = "#dc2626";
const SLATE = "#94a3b8";
const TRACK = "#e2e8f0";

export type VisualKind = "line" | "bar" | "donut" | "gauge" | "stat";

/** A value moving through time. Needs >= 2 points or it renders nothing. */
export function LineChart({ points, positive, width = 132, height = 40 }: {
  points: number[]; positive: boolean; width?: number; height?: number;
}) {
  if (points.length < 2) return null;
  const pad = 3;
  const min = Math.min(...points), max = Math.max(...points);
  const span = max - min || 1;
  const step = (width - pad * 2) / (points.length - 1);
  const xy = points.map((p, i) => [pad + i * step, height - pad - ((p - min) / span) * (height - pad * 2)] as const);
  const d = xy.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const stroke = positive ? GREEN : RED;
  const [lx, ly] = xy[xy.length - 1];
  return (
    <svg width={width} height={height} className="flex-shrink-0" aria-hidden="true">
      {/* Soft fill under the line so direction reads at a glance. */}
      <path d={`${d} L ${lx.toFixed(1)} ${height - pad} L ${pad} ${height - pad} Z`} fill={stroke} opacity={0.08} />
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={2.5} fill={stroke} />
    </svg>
  );
}

/** Discrete periods or a small distribution. Most recent bar is highlighted. */
export function BarChart({ points, positive, width = 132, height = 40 }: {
  points: number[]; positive: boolean; width?: number; height?: number;
}) {
  if (!points.length) return null;
  const pad = 3;
  const max = Math.max(...points, 1);
  const slot = (width - pad * 2) / points.length;
  const bw = Math.max(2, slot * 0.62);
  const accent = positive ? GREEN : RED;
  return (
    <svg width={width} height={height} className="flex-shrink-0" aria-hidden="true">
      {points.map((p, i) => {
        const h = Math.max(1, (p / max) * (height - pad * 2));
        const last = i === points.length - 1;
        return (
          <rect
            key={i}
            x={pad + i * slot + (slot - bw) / 2}
            y={height - pad - h}
            width={bw}
            height={h}
            rx={1.5}
            fill={last ? accent : SLATE}
            opacity={last ? 1 : 0.45}
          />
        );
      })}
    </svg>
  );
}

/** A part of a whole. `pct` is 0-100 and is the highlighted slice. */
export function Donut({ pct, positive, size = 46 }: { pct: number; positive: boolean; size?: number }) {
  const stroke = 7, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, pct));
  return (
    <svg width={size} height={size} className="flex-shrink-0" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={TRACK} strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={positive ? GREEN : RED} strokeWidth={stroke}
        strokeDasharray={`${(v / 100) * c} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
            fontSize={11} fontWeight={700} fill="#334155">{Math.round(v)}%</text>
    </svg>
  );
}

/** A bounded measure read against a target — 240° arc, open at the bottom. */
export function Gauge({ pct, positive, size = 48 }: { pct: number; positive: boolean; size?: number }) {
  const stroke = 6, r = (size - stroke) / 2 - 1, cx = size / 2, cy = size / 2;
  const v = Math.max(0, Math.min(100, pct));
  const START = 150, SWEEP = 240; // degrees; leaves a 120° gap at the bottom
  const pt = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)] as const;
  };
  const arc = (fromDeg: number, toDeg: number) => {
    const [x1, y1] = pt(fromDeg), [x2, y2] = pt(toDeg);
    const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  };
  return (
    <svg width={size} height={size} className="flex-shrink-0" aria-hidden="true">
      <path d={arc(START, START + SWEEP)} fill="none" stroke={TRACK} strokeWidth={stroke} strokeLinecap="round" />
      {v > 0 && (
        <path d={arc(START, START + (SWEEP * v) / 100)} fill="none"
              stroke={positive ? GREEN : RED} strokeWidth={stroke} strokeLinecap="round" />
      )}
      <text x="50%" y="54%" textAnchor="middle" dominantBaseline="central"
            fontSize={11} fontWeight={700} fill="#334155">{Math.round(v)}</text>
    </svg>
  );
}

/** No useful geometry — show the number and let the delta badge carry direction. */
export function StatBlock({ display, positive }: { display: string; positive: boolean }) {
  return (
    <div
      className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg text-sm font-bold tabular-nums"
      style={{
        background: positive ? "rgba(22,163,74,0.08)" : "rgba(220,38,38,0.08)",
        color: positive ? GREEN : RED,
      }}
      aria-hidden="true"
    >
      {display}
    </div>
  );
}
