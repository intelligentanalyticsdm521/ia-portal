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
import { LineChart, BarChart, Donut, Gauge, StatBlock } from "./SectionVisuals";
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

  // The visual follows the metric's SHAPE, declared in sectionMeta. We only
  // degrade when the data that visual needs genuinely isn't there — a line or
  // bar with one data point is a lie, so those fall back to a stat until a
  // second month exists. Never render an empty chart frame.
  const wants = meta.visual;
  const hasSeries = history.length >= 2;
  const kind: "line" | "bar" | "donut" | "gauge" | "stat" =
    (wants === "line" || wants === "bar") ? (hasSeries ? wants : "stat")
    : (wants === "donut" || wants === "gauge") ? (isFinite(numeric) ? wants : "stat")
    : "stat";

  // Gauges and donuts read 0-100. A percentage is already on that scale; a
  // rating is out of 5; a raw score is assumed 0-100.
  const bounded =
    meta.format === "rating" ? (numeric / 5) * 100
    : meta.format === "percent" ? Math.min(100, numeric)
    : numeric;

  const visual =
    kind === "line"  ? <LineChart points={history} positive={positive} />
    : kind === "bar"   ? <BarChart points={history} positive={positive} />
    : kind === "donut" ? <Donut pct={bounded} positive={positive} />
    : kind === "gauge" ? <Gauge pct={bounded} positive={positive} />
    : <StatBlock display={formatSectionValue(value, meta.format)} positive={positive} />;

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 rounded-lg"
      >
        {(kind === "gauge" || kind === "donut" || kind === "stat") && visual}

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

        {(kind === "line" || kind === "bar") && visual}

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
