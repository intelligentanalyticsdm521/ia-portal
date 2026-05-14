// IAInsightsHeader — Persistent 4-gauge + 2 bar-chart header for every IA Insights surface (v5.x).
//
// Renders the four gauges (Overall / Platform / Trend / Intelligence) above
// two side-by-side bar charts. Each bar in the breakdown carries a ghost
// bar showing prior period score for directional context. Locked
// (greyed-out) bars show the lock reason on hover.
//
// Data shape comes from IAInsightsHeaderData in types.ts. The component
// is pure presentation — fetch upstream and pass `data`.
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Award, Lock, AlertTriangle, Info, TrendingUp, TrendingDown, Minus, BarChart3, Sparkles } from "lucide-react";
import {
  BAND_COLORS,
  PRODUCT_COLORS,
  bandFromScore,
  type IAInsightsHeaderData,
  type GaugeValue,
  type ScoreBreakdownBar,
} from "./types";

interface Props {
  data: IAInsightsHeaderData | null;
  /** Optional onChangePeriod handler — not wired here but reserved for future. */
  onChangePeriod?: (start: string, end: string) => void;
}

export function IAInsightsHeader({ data }: Props) {
  if (!data) return <IAInsightsHeaderSkeleton />;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 mb-4">
      {/* Banners */}
      {data.banners && data.banners.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {data.banners.map((b, i) => (
            <Banner key={i} banner={b} />
          ))}
        </div>
      )}

      {/* v9.0 — 5 gauges (ARGUS exception: 4 gauges + active-products indicator).
          When crossChannel is undefined the 5th gauge is rendered as the
          activation prompt empty state per spec §1.7. */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Gauge label="Business Pulse" gauge={data.overall} icon={Award} accent={PRODUCT_COLORS.argus} />
        <Gauge label={`${data.product.toUpperCase()} Score`} gauge={data.platform} icon={Sparkles} accent={PRODUCT_COLORS[data.product]} />
        <Gauge label="Trend Score" gauge={data.trend} icon={BarChart3} accent={PRODUCT_COLORS[data.product]} />
        <Gauge label="Intelligence Score" gauge={data.intelligence} icon={Sparkles} accent={PRODUCT_COLORS[data.product]} />
        <Gauge
          label="Cross-Channel Score"
          gauge={data.crossChannel || { score: 0, band: "unknown", state: "insufficient_data", message: "Add a second platform to unlock cross-channel insights.", drillTo: "/app/services/argus_ia_insights" }}
          icon={BarChart3}
          accent={PRODUCT_COLORS.argus}
        />
      </div>

      {/* v9.0 — 3 bar charts: Trend / Intelligence / Cross-Channel breakdown. */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <ScoreBarChart title="Trend breakdown" bars={data.trendBreakdown} accent={PRODUCT_COLORS[data.product]} />
        <ScoreBarChart title="Intelligence breakdown" bars={data.intelligenceBreakdown} accent={PRODUCT_COLORS[data.product]} />
        <ScoreBarChart title="Cross-Channel breakdown" bars={data.crossChannelBreakdown || []} accent={PRODUCT_COLORS.argus} emptyStateMessage="Connect a second platform to populate cross-channel reports." />
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between text-[10px] text-slate-400">
        <span>
          {data.meta.periodStart && data.meta.periodEnd
            ? `${formatDate(data.meta.periodStart)} → ${formatDate(data.meta.periodEnd)}`
            : null}
        </span>
        <span>Generated {new Date(data.meta.generatedAt).toLocaleString()} · {data.meta.tier} tier</span>
      </div>
    </div>
  );
}

// ── Gauge ─────────────────────────────────────────────────────────────

function Gauge({ label, gauge, icon: Icon, accent }: { label: string; gauge: GaugeValue; icon: typeof Award; accent: string }) {
  const navigate = useNavigate();
  const isLocked = gauge.state === "locked";
  const isInsufficient = gauge.state === "insufficient_data";
  const color = BAND_COLORS[gauge.band] || accent;
  const onClick = gauge.drillTo ? () => navigate(gauge.drillTo!) : undefined;

  // Build the conic-gradient arc for the gauge ring (270° sweep).
  const pct = Math.max(0, Math.min(100, isLocked ? 0 : (gauge.score || 0)));
  const arc = useMemo(() => {
    const sweepDeg = (pct / 100) * 270;
    return `conic-gradient(from -135deg, ${color} ${sweepDeg}deg, #E2E8F0 ${sweepDeg}deg 270deg, transparent 270deg)`;
  }, [pct, color]);

  // Period-over-period delta arrow
  const delta = (gauge.previousScore != null && !isLocked) ? Math.round(gauge.score - gauge.previousScore) : null;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`relative rounded-lg border border-slate-200 bg-white p-3 text-left transition-colors ${onClick ? "hover:border-slate-300 cursor-pointer" : "cursor-default"}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1 text-[10px] uppercase font-semibold text-slate-500 tracking-wide truncate">
          <Icon className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{label}</span>
        </div>
        {isLocked && <Lock className="h-3 w-3 text-slate-400 flex-shrink-0" />}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative h-16 w-16 flex-shrink-0">
          <div className="absolute inset-0 rounded-full" style={{ background: arc }} />
          <div className="absolute inset-1.5 rounded-full bg-white" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-bold tabular-nums" style={{ color: isLocked || isInsufficient ? "#94A3B8" : color, fontSize: 18 }}>
              {isLocked || isInsufficient ? "—" : Math.round(gauge.score)}
            </span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          {delta != null && (
            <div className="flex items-center gap-1 text-[10px] tabular-nums" style={{ color: delta > 0 ? "#16A34A" : delta < 0 ? "#DC2626" : "#94A3B8" }}>
              {delta > 0 ? <TrendingUp className="h-3 w-3" /> : delta < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
              {delta > 0 ? `+${delta}` : delta} pts vs prior
            </div>
          )}
          {gauge.message && (
            <div className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{gauge.message}</div>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Bar chart ─────────────────────────────────────────────────────────

function ScoreBarChart({ title, bars, accent, emptyStateMessage }: { title: string; bars: ScoreBreakdownBar[]; accent: string; emptyStateMessage?: string }) {
  const navigate = useNavigate();
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide mb-2">{title}</div>
      {bars.length === 0 ? (
        <div className="text-[10px] text-slate-400 italic py-4 text-center px-2">{emptyStateMessage || "No data."}</div>
      ) : (
        <ul className="space-y-1.5">
          {bars.map((b) => {
            const color = b.locked ? "#94A3B8" : (BAND_COLORS[b.band] || accent);
            const pct = Math.max(2, Math.min(100, b.score));
            const prevPct = b.previousScore != null ? Math.max(2, Math.min(100, b.previousScore)) : null;
            return (
              <li key={b.key}>
                <button
                  type="button"
                  onClick={b.reportRoute && !b.locked ? () => navigate(b.reportRoute!) : undefined}
                  disabled={b.locked || !b.reportRoute}
                  className={`w-full text-left text-xs ${b.reportRoute && !b.locked ? "hover:bg-slate-50 cursor-pointer" : "cursor-default"} rounded px-1 py-0.5`}
                  title={b.locked ? b.lockReason || "Locked" : `${b.label}: ${b.score}`}
                >
                  <div className="flex items-baseline justify-between gap-2 mb-0.5">
                    <span className="font-medium text-slate-700 truncate flex items-center gap-1">
                      {b.locked && <Lock className="h-3 w-3 text-slate-400" />}
                      {b.label}
                    </span>
                    <span className="text-slate-500 tabular-nums">{b.locked ? "—" : b.score}</span>
                  </div>
                  <div className="relative h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                    {prevPct != null && (
                      <div className="absolute inset-y-0 left-0 rounded-full bg-slate-300/50" style={{ width: `${prevPct}%` }} />
                    )}
                    <div className="absolute inset-y-0 left-0 h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Banner ────────────────────────────────────────────────────────────

function Banner({ banner }: { banner: { severity: "info" | "warn"; message: string; action?: { label: string; route?: string } } }) {
  const navigate = useNavigate();
  const colors = banner.severity === "warn"
    ? { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-800", icon: AlertTriangle, ic: "text-amber-600" }
    : { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-800", icon: Info, ic: "text-blue-600" };
  const Icon = colors.icon;
  return (
    <div className={`rounded border px-3 py-1.5 flex items-center gap-2 text-xs ${colors.bg} ${colors.border} ${colors.text}`}>
      <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${colors.ic}`} />
      <span className="flex-1">{banner.message}</span>
      {banner.action && (
        <button onClick={() => banner.action!.route && navigate(banner.action!.route)} className="text-[10px] underline hover:no-underline whitespace-nowrap">
          {banner.action.label}
        </button>
      )}
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────

function IAInsightsHeaderSkeleton() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 mb-4 animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-lg border border-slate-200 bg-white p-3 h-24" />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-lg border border-slate-200 bg-white p-3 h-40" />
        ))}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
}

export default IAInsightsHeader;
