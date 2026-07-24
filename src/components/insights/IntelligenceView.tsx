// IntelligenceView — renders the ARION Intelligence models.
//
// Trends shows what moved; this shows what it MEANS: forecasts with confidence
// bands, anomalies vs the tenant's own baseline, and opportunities ranked by
// modelled impact. Every card states its confidence — nothing is presented as
// certain that the 12-month series can't support.

import { TrendingUp, TrendingDown, Minus, AlertTriangle, Target, LineChart as LineIcon } from "lucide-react";
import type { ArionIntelligence, ForecastCard } from "../../analytics/arionIntelligence";

const confColor = (c: string) => c === "high" ? "#15803d" : c === "medium" ? "#b45309" : "#94a3b8";

/** History → projection chart: solid past, dashed forecast, shaded band. */
function ForecastChart({ card }: { card: ForecastCard }) {
  const f = card.forecast;
  const hist = f ? [] as number[] : [];
  // Reconstruct the fitted line over the observed range for a clean visual.
  const w = 220, h = 64, pad = 6;
  const past = f.projected.length ? [f.current] : [];
  const all = [...past, ...f.projected];
  const lo = Math.min(...all, ...f.bandLow), hiV = Math.max(...all, ...f.bandHigh);
  const span = hiV - lo || 1;
  const n = 1 + f.projected.length;
  const x = (i: number) => pad + (i / (n - 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - ((v - lo) / span) * (h - pad * 2);
  const good = card.key === "gsc_avg_position" ? f.direction === "falling" : f.direction === "rising";
  const stroke = f.direction === "flat" ? "#64748b" : good ? "#16a34a" : "#dc2626";
  const band = f.projected.map((_, i) => `${x(i + 1).toFixed(0)},${y(f.bandHigh[i]).toFixed(0)}`).join(" ")
    + " " + f.projected.map((_, i) => `${x(f.projected.length - i).toFixed(0)},${y(f.bandLow[f.projected.length - 1 - i]).toFixed(0)}`).join(" ");
  return (
    <svg width={w} height={h} className="flex-shrink-0" aria-hidden="true">
      <polygon points={`${x(0)},${y(f.current)} ${band}`} fill={stroke} opacity={0.08} />
      <line x1={x(0)} y1={y(f.current)} x2={x(1)} y2={y(f.projected[0])} stroke={stroke} strokeWidth={2} />
      {f.projected.map((p, i) => i < f.projected.length - 1 && (
        <line key={i} x1={x(i + 1)} y1={y(p)} x2={x(i + 2)} y2={y(f.projected[i + 1])} stroke={stroke} strokeWidth={2} strokeDasharray="3 2" />
      ))}
      <circle cx={x(0)} cy={y(f.current)} r={3} fill={stroke} />
      <circle cx={x(n - 1)} cy={y(f.projected[f.projected.length - 1])} r={3} fill={stroke} />
    </svg>
  );
}

function ForecastRow({ card }: { card: ForecastCard }) {
  const f = card.forecast;
  const Icon = f.direction === "flat" ? Minus : f.direction === "rising" ? TrendingUp : TrendingDown;
  return (
    <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3">
      <ForecastChart card={card} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-900">{card.label}</span>
          <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded" style={{ color: confColor(f.confidence), background: `${confColor(f.confidence)}18` }}>{f.confidence} confidence</span>
        </div>
        <p className="mt-1 text-xs text-slate-600 leading-relaxed">{card.headline}</p>
        <p className="mt-0.5 text-[10px] text-slate-400">Model: linear regression · fit r²={f.r2.toFixed(2)} · trend {f.slope >= 0 ? "+" : ""}{f.slope.toFixed(1)}/mo</p>
      </div>
    </div>
  );
}

export function IntelligenceView({ intel, platformLabel }: { intel: ArionIntelligence; platformLabel: string }) {
  const Section = ({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) => (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-2">
        {icon}<h3 className="text-sm font-bold text-slate-800">{title}</h3>
      </div>
      {children}
    </div>
  );

  return (
    <div className="max-w-4xl">
      {intel.projectedRevenue && (
        <div className="mb-6 rounded-lg border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-800 p-5 text-white">
          <div className="text-[10px] uppercase font-bold tracking-wide text-lime-400 mb-1">Modelled revenue outlook · 3 months</div>
          <div className="text-2xl font-bold">${Math.round(intel.projectedRevenue.value).toLocaleString()}</div>
          <div className="text-xs text-slate-300 mt-1">
            range ${Math.round(intel.projectedRevenue.low).toLocaleString()}–${Math.round(intel.projectedRevenue.high).toLocaleString()} · {intel.projectedRevenue.confidence} confidence · projected from your lead trend at an assumed $180/lead
          </div>
        </div>
      )}

      {intel.searchForecast.length > 0 && (
        <Section icon={<LineIcon className="h-4 w-4 text-slate-500" />} title="Search Forecast">
          <div className="space-y-2">{intel.searchForecast.map((c) => <ForecastRow key={c.key} card={c} />)}</div>
        </Section>
      )}

      {intel.conversionForecast.length > 0 && (
        <Section icon={<LineIcon className="h-4 w-4 text-slate-500" />} title="Conversion Forecast">
          <div className="space-y-2">{intel.conversionForecast.map((c) => <ForecastRow key={c.key} card={c} />)}</div>
        </Section>
      )}

      <Section icon={<AlertTriangle className="h-4 w-4 text-amber-500" />} title="Anomaly Radar">
        {intel.anomalies.length === 0 ? (
          <p className="text-xs text-slate-500 rounded-lg border border-slate-200 bg-white px-4 py-3">Nothing unusual this month — every metric is within its normal range.</p>
        ) : (
          <div className="space-y-2">
            {intel.anomalies.map((a) => (
              <div key={a.key} className={`rounded-lg border px-4 py-3 ${a.anomaly.severity === "alert" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${a.anomaly.severity === "alert" ? "bg-red-200 text-red-900" : "bg-amber-200 text-amber-900"}`}>{a.anomaly.severity}</span>
                  <span className="text-sm font-semibold text-slate-900">{a.label}</span>
                </div>
                <p className="mt-1 text-xs text-slate-600">{a.headline}</p>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section icon={<Target className="h-4 w-4 text-slate-500" />} title="Opportunity Model — where focus pays off most">
        <div className="space-y-2">
          {intel.opportunities.map((o, i) => (
            <div key={o.key} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
              <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">{i + 1}</div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">{o.label}</span>
                  <span className={`text-[11px] font-semibold ${o.movementPct >= 0 ? "text-green-600" : "text-red-600"}`}>{o.movementPct >= 0 ? "+" : ""}{o.movementPct.toFixed(0)}%</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-600 leading-relaxed">{o.headline}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <p className="text-[10px] text-slate-400 mt-4">
        {platformLabel} Intelligence models run on 12 months of history. Seasonal decomposition
        (Holt-Winters / ARIMA) unlocks at 18–24 months and is a documented enhancement.
      </p>
    </div>
  );
}
