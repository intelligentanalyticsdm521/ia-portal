// DeepReportView — renders one detail report at full business-report depth.
//
// The layout, top to bottom (Brandon's keyword-rankings exemplar, applied to
// every report via deriveDeepReport):
//   1. Narrative + headline stat tiles
//   2. Distribution over time — stacked 12-month composition
//   3. Movement analysis — entered/dropped top band, weighted gainers/losers
//   4. Segments — branded/intent/etc. roll-ups
//   5. Opportunities — striking distance, quick wins
//   6. The full item table — every line item, expandable to its complete
//      month-by-month year, best/worst/avg, volatility, metadata, warnings.

import { useState } from "react";
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown, Minus, AlertTriangle, Info, Lightbulb } from "lucide-react";
import { fmtV, type DeepReportData, type DeepDistribution, type MeaningItem } from "../../analytics/deepReport";
import { itemMom, pluralize, type DetailItem, type DetailColumn } from "../../analytics/detail";
import { reportNotesFor } from "../../analytics/reportNotes";

const MEANING_TONES: Record<MeaningItem["tone"], string> = {
  good: "#16a34a", bad: "#dc2626", watch: "#d97706", info: "#64748b",
};

function Mom({ pct, lowerBetter, small }: { pct: number | null | undefined; lowerBetter?: boolean; small?: boolean }) {
  if (pct == null) return <span className="text-slate-300 text-[11px]">—</span>;
  const flat = Math.abs(pct) < 1;
  const good = lowerBetter ? pct < 0 : pct > 0;
  const Icon = flat ? Minus : pct > 0 ? TrendingUp : TrendingDown;
  const tone = flat ? "text-slate-400" : good ? "text-green-600" : "text-red-600";
  return <span className={`inline-flex items-center gap-0.5 font-semibold ${tone} ${small ? "text-[10px]" : "text-[11px]"}`}><Icon className="h-3 w-3" />{pct > 0 ? "+" : ""}{pct.toFixed(0)}%</span>;
}

function Spark({ series, up }: { series: Array<number | null>; up: boolean }) {
  const pts = series.filter((v): v is number => v != null && isFinite(v));
  if (pts.length < 2) return <span className="text-slate-300 text-[10px]">—</span>;
  const w = 80, h = 22, pad = 1;
  const min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1;
  const step = (w - pad * 2) / (pts.length - 1);
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${(pad + i * step).toFixed(1)} ${(h - pad - ((p - min) / span) * (h - pad * 2)).toFixed(1)}`).join(" ");
  return <svg width={w} height={h} aria-hidden="true"><path d={d} fill="none" stroke={up ? "#16a34a" : "#dc2626"} strokeWidth={1.5} strokeLinejoin="round" /></svg>;
}

/** Stacked 12-month distribution/composition chart. Pure SVG. */
function StackedChart({ dist, months }: { dist: DeepDistribution; months: string[] }) {
  const n = months.length;
  const colW = 42, gap = 8, h = 150, pad = 4, labelH = 16;
  const w = n * (colW + gap);
  const totals = Array.from({ length: n }, (_, m) => dist.series.reduce((s, b) => s + (b.values[m] || 0), 0));
  const maxT = Math.max(...totals, 1);
  return (
    <div className="overflow-x-auto">
      <svg width={w} height={h + labelH} aria-hidden="true">
        {Array.from({ length: n }, (_, m) => {
          let y = h - pad;
          return (
            <g key={m}>
              {dist.series.map((b, bi) => {
                const v = b.values[m] || 0;
                const bh = (v / maxT) * (h - pad * 2);
                y -= bh;
                return bh > 0.5 ? <rect key={bi} x={m * (colW + gap)} y={y} width={colW} height={bh} fill={b.color} rx={1.5} /> : null;
              })}
              <text x={m * (colW + gap) + colW / 2} y={h + 12} textAnchor="middle" fontSize={9} fill="#94a3b8">{months[m]}</text>
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
        {dist.series.map((b) => (
          <span key={b.label} className="inline-flex items-center gap-1.5 text-[10px] text-slate-600">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: b.color }} />{b.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function ItemRow({ it, deep }: { it: DetailItem; deep: DeepReportData }) {
  const [open, setOpen] = useState(false);
  const { report, months, itemStats, flags } = deep;
  const isFeed = report.kind === "feed" || !(it.series?.filter((v) => v != null).length);
  const mom = itemMom(it);
  const cur = it.series?.filter((v): v is number => v != null).slice(-1)[0] ?? null;
  const up = mom == null ? true : report.higherIsBetter ? mom >= 0 : mom < 0;
  const cols = report.columns || [];
  const st = itemStats[it.name];
  const flag = flags[it.name];
  const lowerBetter = !report.higherIsBetter;

  return (
    <>
      <tr className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 cursor-pointer" onClick={() => !isFeed && setOpen((o) => !o)}>
        <td className="py-1.5 px-3 text-slate-700 truncate max-w-[220px]" title={it.name}>
          <span className="inline-flex items-center gap-1.5">
            {!isFeed && (open ? <ChevronDown className="h-3 w-3 text-slate-400" /> : <ChevronRight className="h-3 w-3 text-slate-300" />)}
            {it.name}
            {flag && <AlertTriangle className="h-3 w-3 text-amber-500" aria-label={flag} />}
          </span>
        </td>
        {!isFeed && !deep.categorical && <td className="py-1.5 px-2 text-right tabular-nums font-medium text-slate-800">{fmtV(cur, report.format)}</td>}
        {!isFeed && !deep.categorical && <td className="py-1.5 px-2 text-right"><Mom pct={mom} lowerBetter={lowerBetter} /></td>}
        {!isFeed && <td className="py-1.5 px-2"><Spark series={it.series} up={up} /></td>}
        {cols.map((c: DetailColumn) => (
          <td key={c.key} className="py-1.5 px-2 text-right tabular-nums text-slate-600">{fmtV(it.extra?.[c.key] as any, c.format)}</td>
        ))}
      </tr>
      {open && !isFeed && (
        <tr className="bg-slate-50/70">
          <td colSpan={4 + cols.length} className="px-4 py-3">
            {flag && (
              <p className="mb-2 flex items-center gap-1.5 text-[11px] text-amber-700"><AlertTriangle className="h-3.5 w-3.5" />{flag}</p>
            )}
            <div className="grid gap-1 mb-3" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(38px, 1fr))` }}>
              {months.map((mo, i) => (
                <div key={i} className="text-center">
                  <div className={`rounded px-0.5 py-1 text-[10px] tabular-nums ${i === months.length - 1 ? "bg-slate-900 text-white font-semibold" : "bg-white border border-slate-200 text-slate-700"}`}>
                    {fmtV(it.series?.[i] ?? null, report.format)}
                  </div>
                  <div className="text-[8px] text-slate-400 mt-0.5">{mo}</div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[10px] text-slate-500">
              {st && <>
                <span>Best <b className="text-slate-700">{fmtV(st.best, report.format)}</b></span>
                <span>Worst <b className="text-slate-700">{fmtV(st.worst, report.format)}</b></span>
                <span>12-mo avg <b className="text-slate-700">{fmtV(st.avg, report.format)}</b></span>
                <span>Volatility <b className="text-slate-700">±{st.volatilityPct.toFixed(0)}%</b></span>
              </>}
              {it.extra && Object.entries(it.extra).map(([k, v]) => {
                const col = cols.find((c) => c.key === k);
                return <span key={k}>{(col?.label || k)}: <b className="text-slate-700">{fmtV(v as any, col?.format || "text")}</b></span>;
              })}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function MiniMovementTable({ title, rows, format, lowerBetter }: { title: string; rows: Array<{ name: string; current: number | null; momPct: number | null }>; format: any; lowerBetter: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="text-[10px] uppercase font-semibold tracking-wide text-slate-500 mb-1.5">{title}</div>
      {rows.map((r) => (
        <div key={r.name} className="flex items-center justify-between gap-2 py-0.5 text-[11px]">
          <span className="text-slate-700 truncate" title={r.name}>{r.name}</span>
          <span className="flex items-center gap-2 flex-shrink-0">
            <span className="tabular-nums font-medium text-slate-800">{fmtV(r.current, format)}</span>
            <Mom pct={r.momPct} lowerBetter={lowerBetter} small />
          </span>
        </div>
      ))}
    </div>
  );
}

export function DeepReportView({ deep }: { deep: DeepReportData }) {
  const { report, months, narrative, stats, distribution, movements, segments, opportunities, meaning, categorical } = deep;
  const cols = report.columns || [];
  const isFeed = report.kind === "feed" || !report.items.some((it) => it.series?.length);
  const lowerBetter = !report.higherIsBetter;

  // Trend items sorted biggest mover first; feeds keep order.
  const rows = isFeed ? report.items : [...report.items].sort((a, b) => Math.abs(itemMom(b) ?? 0) - Math.abs(itemMom(a) ?? 0));

  const notes = reportNotesFor(report.id);

  return (
    <div className="space-y-5">
      {/* 0 — what this report is, in plain business language */}
      {notes && (
        <div className="rounded-lg border border-sky-100 bg-sky-50/60 px-4 py-3">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-sky-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-1.5">
              <p className="text-[12px] leading-relaxed text-slate-700">{notes.about}</p>
              <p className="text-[11px] leading-relaxed text-slate-500"><b className="text-slate-600 font-semibold">How to read it:</b> {notes.reading}</p>
            </div>
          </div>
        </div>
      )}

      {/* 1 — summary */}
      <div>
        <p className="text-sm text-slate-600">{narrative}</p>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <div className="text-[10px] uppercase font-semibold tracking-wide text-slate-400">{s.label}</div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-lg font-bold text-slate-900 tabular-nums">{s.value}</span>
                {s.momPct != null && <Mom pct={s.momPct} lowerBetter={lowerBetter} small />}
              </div>
              {s.sub && <div className="text-[10px] text-slate-400 mt-0.5">{s.sub}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* 1b — what this means, in plain business language */}
      {meaning.length > 0 && (
        <div className="rounded-lg border border-amber-200/70 bg-amber-50/50 p-4">
          <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wide text-amber-700 mb-3">
            <Lightbulb className="h-3.5 w-3.5" /> What this means for you
          </div>
          <div className="space-y-2.5">
            {meaning.map((m, i) => (
              <div key={i} className="flex gap-2.5">
                <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full" style={{ background: MEANING_TONES[m.tone] }} aria-hidden="true" />
                <p className="text-[12px] leading-relaxed text-slate-700">{m.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2 — distribution over time */}
      {distribution && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-[10px] uppercase font-semibold tracking-wide text-slate-500 mb-2">
            {distribution.kind === "bands" ? `${report.itemLabel}s by band, 12 months` : "Composition, 12 months"}
          </div>
          <StackedChart dist={distribution} months={months} />
        </div>
      )}

      {/* 3 — movement analysis */}
      {movements.length > 0 && (
        <div>
          <div className="text-[10px] uppercase font-semibold tracking-wide text-slate-500 mb-2">Movement analysis</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {movements.map((mt) => <MiniMovementTable key={mt.title} title={mt.title} rows={mt.items} format={report.format} lowerBetter={lowerBetter} />)}
          </div>
        </div>
      )}

      {/* 4 — segments */}
      {segments.length > 0 && (
        <div>
          <div className="text-[10px] uppercase font-semibold tracking-wide text-slate-500 mb-2">Segments</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {segments.map((sg) => (
              <div key={sg.title} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <div className="text-[10px] uppercase font-semibold tracking-wide text-slate-500 mb-1.5">{sg.title}</div>
                {sg.rows.map((r) => (
                  <div key={r.name} className="flex items-center justify-between gap-2 py-0.5 text-[11px]">
                    <span className="text-slate-700">{r.name} <span className="text-slate-400">({r.count})</span></span>
                    <span className="flex items-center gap-2"><span className="tabular-nums font-medium text-slate-800">{r.value}</span><Mom pct={r.momPct} lowerBetter={lowerBetter} small /></span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5 — opportunities */}
      {opportunities.length > 0 && (
        <div>
          <div className="text-[10px] uppercase font-semibold tracking-wide text-slate-500 mb-2">Opportunities</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {opportunities.map((op) => (
              <div key={op.title} className="rounded-lg border border-lime-200 bg-lime-50/60 px-3 py-2">
                <div className="text-[10px] uppercase font-semibold tracking-wide text-lime-800 mb-0.5">{op.title}</div>
                {op.note && <div className="text-[10px] text-lime-700 mb-1.5">{op.note}</div>}
                {op.items.map((it) => (
                  <div key={it.name} className="flex items-center justify-between gap-2 py-0.5 text-[11px]">
                    <span className="text-slate-700 truncate" title={it.name}>{it.name}</span>
                    <span className="flex items-center gap-2 flex-shrink-0">
                      {/* On a categorical report the series is a status code —
                          printing "1" beside a plugin name reads as a
                          measurement of something. */}
                      {!categorical && <span className="tabular-nums font-medium text-slate-800">{fmtV(it.series?.filter((v): v is number => v != null).slice(-1)[0] ?? null, report.format)}</span>}
                      {it.extra?.volume != null && <span className="text-[10px] text-slate-400">{fmtV(it.extra.volume as any, "number")} vol</span>}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6 — the full item table */}
      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="px-4 py-2.5 border-b border-slate-100 text-[10px] uppercase font-semibold tracking-wide text-slate-500">
          Every {pluralize(report.itemLabel, 1)} — click a row for its full year
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="py-1.5 px-3 font-semibold">{report.itemLabel}</th>
                {/* A categorical report's series is a state code. Printing it as a
                    value column, and a month-over-month percentage beside it,
                    invents two measurements that do not exist — the state is
                    already spelled out in the report's own columns. The
                    sparkline stays: the SHAPE of the state changing over the
                    year is real and readable. */}
                {!isFeed && !categorical && <th className="py-1.5 px-2 font-semibold text-right">{report.primaryLabel || "Value"}</th>}
                {!isFeed && !categorical && <th className="py-1.5 px-2 font-semibold text-right">MoM</th>}
                {!isFeed && <th className="py-1.5 px-2 font-semibold">Trend</th>}
                {cols.map((c) => <th key={c.key} className="py-1.5 px-2 font-semibold text-right">{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((it, i) => <ItemRow key={`${it.name}:${i}`} it={it} deep={deep} />)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default DeepReportView;
