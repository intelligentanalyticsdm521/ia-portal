// SectionCard — one major contributor to a report score, as a card.
//
// Brandon's structure (2026-07-24): a report is 5-8 SECTIONS. Each shows an
// appropriate visual with its month-over-month move and a short plain-language
// blurb — "great work, you're up 18% on last month" or "down here, click to
// find out more" — and expands into the detailed breakdown behind it.
//
// The point is that a small-business owner should be able to scan six cards and
// know where to look. A wall of data points is the opposite of useful: nobody
// understands it, so nobody opens the report twice.

import { useState } from "react";
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  sectionMeta,
  formatSectionValue,
  sectionDelta,
  type SectionDelta,
} from "../../arion/analytics/sectionMeta";

export interface SectionCardProps {
  /** scoreInput key, e.g. "reach.impression_to_visit". */
  sectionKey: string;
  value: number | string | null;
  /** Same section's value last month, when we have it. */
  priorValue?: number | string | null;
  /** Share of the report score this section carries (0-1). */
  weight: number;
  /** Engine-supplied caveat, e.g. "recomputed using local-only sessions". */
  note?: string;
  /** Trailing monthly values, oldest first — drives the sparkline. */
  history?: number[];
  /** Detailed breakdown, rendered when the card is expanded. */
  children?: React.ReactNode;
}

/** Tiny inline sparkline. No chart library — same approach as MonthlyScoreBars. */
function Sparkline({ points, positive }: { points: number[]; positive: boolean }) {
  if (points.length < 2) return null;
  const w = 108, h = 30, pad = 2;
  const min = Math.min(...points), max = Math.max(...points);
  const span = max - min || 1;
  const step = (w - pad * 2) / (points.length - 1);
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${pad + i * step} ${h - pad - ((p - min) / span) * (h - pad * 2)}`)
    .join(" ");
  const stroke = positive ? "#16a34a" : "#dc2626";
  return (
    <svg width={w} height={h} className="flex-shrink-0" aria-hidden="true">
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Radial gauge for 0-100 style metrics. */
function Gauge({ pct, positive }: { pct: number; positive: boolean }) {
  const size = 46, stroke = 5, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <svg width={size} height={size} className="flex-shrink-0" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={positive ? "#16a34a" : "#dc2626"} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${(clamped / 100) * c} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

function DeltaBadge({ delta }: { delta: SectionDelta | null }) {
  if (!delta) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
        <Minus className="h-3 w-3" /> first month
      </span>
    );
  }
  const Icon = Math.abs(delta.pct) < 1 ? Minus : delta.pct > 0 ? TrendingUp : TrendingDown;
  const tone = Math.abs(delta.pct) < 1
    ? "text-slate-500 bg-slate-100"
    : delta.improved
      ? "text-green-700 bg-green-50"
      : "text-red-700 bg-red-50";
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${tone}`}>
      <Icon className="h-3 w-3" />
      {delta.pct > 0 ? "+" : ""}{delta.pct.toFixed(0)}%
    </span>
  );
}

export function SectionCard({
  sectionKey, value, priorValue, weight, note, history = [], children,
}: SectionCardProps) {
  const [open, setOpen] = useState(false);
  const meta = sectionMeta(sectionKey);
  const delta = sectionDelta(value, priorValue, meta);
  const positive = delta ? delta.improved : true;
  const numeric = typeof value === "number" ? value : Number(value);

  // Pick the visual the metric's shape actually suits: a gauge for bounded
  // 0-100 measures, a sparkline once there's enough history, otherwise a plain
  // stat. Never render an empty chart frame.
  const showGauge = (meta.visual === "gauge" || meta.visual === "donut") && isFinite(numeric) && meta.format !== "position";
  const showSpark = !showGauge && history.length >= 2;

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 rounded-lg"
      >
        {showGauge && <Gauge pct={meta.format === "percent" ? Math.min(100, numeric) : numeric} positive={positive} />}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-900">{meta.label}</span>
            <DeltaBadge delta={delta} />
            <span className="text-[10px] text-slate-400">
              {Math.round(weight * 100)}% of score
            </span>
          </div>

          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="text-lg font-bold text-slate-900 tabular-nums">
              {formatSectionValue(value, meta.format)}
            </span>
            {priorValue != null && (
              <span className="text-[11px] text-slate-400">
                from {formatSectionValue(priorValue as any, meta.format)}
              </span>
            )}
          </div>

          {/* The blurb — this is what the owner actually reads. */}
          <p className="mt-1 text-xs text-slate-600 leading-relaxed">
            {delta ? delta.blurb : "We will compare this against next month once we have a second period."}
            {meta.what && <span className="text-slate-400"> {meta.what}</span>}
          </p>
          {note && <p className="mt-1 text-[10px] text-slate-400 italic">{note}</p>}
        </div>

        {showSpark && <Sparkline points={history} positive={positive} />}

        {children
          ? (open ? <ChevronDown className="h-4 w-4 text-slate-400 mt-1 flex-shrink-0" />
                  : <ChevronRight className="h-4 w-4 text-slate-400 mt-1 flex-shrink-0" />)
          : <span className="w-4 flex-shrink-0" />}
      </button>

      {open && children && (
        <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/60 rounded-b-lg">
          {children}
        </div>
      )}
    </div>
  );
}

export default SectionCard;
