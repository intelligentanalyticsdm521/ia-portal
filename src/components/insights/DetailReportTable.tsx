// DetailReportTable — one dimensioned detail report as a line-item table.
//
// Each row is an individual item (a query, a referral, a keyword, a device)
// with its current value, its month-over-month, a 12-month sparkline, and any
// extra columns. Rows are sorted by absolute movement so the biggest movers —
// up and down — are at the top: the "what specifically changed" view.
//
// Feed reports (reviews, audit issues, vulnerabilities) render as a plain table
// of their columns, no trend.

import { useState } from "react";
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatValue } from "./TrendDashboardView";
import { itemMom, type DetailReport, type DetailItem, type DetailColumn } from "../../analytics/detail";
import type { ValueFormat } from "../../analytics/scoring";

function fmtCol(v: number | string | undefined, format: ValueFormat | "text"): string {
  if (v == null) return "—";
  if (format === "text") return String(v);
  return formatValue(typeof v === "number" ? v : Number(v), format as ValueFormat);
}

function Spark({ series, up }: { series: Array<number | null>; up: boolean }) {
  const pts = series.filter((v): v is number => v != null && isFinite(v));
  if (pts.length < 2) return <span className="text-slate-300 text-[10px]">—</span>;
  const w = 72, h = 20, pad = 1;
  const min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1;
  const step = (w - pad * 2) / (pts.length - 1);
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${(pad + i * step).toFixed(1)} ${(h - pad - ((p - min) / span) * (h - pad * 2)).toFixed(1)}`).join(" ");
  return <svg width={w} height={h} aria-hidden="true"><path d={d} fill="none" stroke={up ? "#16a34a" : "#dc2626"} strokeWidth={1.5} strokeLinejoin="round" /></svg>;
}

function Mom({ pct, lowerBetter }: { pct: number | null; lowerBetter?: boolean }) {
  if (pct == null) return <span className="text-slate-300 text-[11px]">—</span>;
  const flat = Math.abs(pct) < 1;
  const good = lowerBetter ? pct < 0 : pct > 0;
  const Icon = flat ? Minus : pct > 0 ? TrendingUp : TrendingDown;
  const tone = flat ? "text-slate-400" : good ? "text-green-600" : "text-red-600";
  return <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${tone}`}><Icon className="h-3 w-3" />{pct > 0 ? "+" : ""}{pct.toFixed(0)}%</span>;
}

export function DetailReportTable({ report, defaultOpen = false }: { report: DetailReport; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const isFeed = report.kind === "feed";
  const cols = report.columns || [];

  // Sort trend reports by |MoM| desc (biggest movers first); feeds keep order.
  const rows = isFeed ? report.items : [...report.items].sort((a, b) => Math.abs(itemMom(b) ?? 0) - Math.abs(itemMom(a) ?? 0));

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-slate-50 rounded-lg">
        <span className="text-sm font-semibold text-slate-800">{report.label}</span>
        <span className="flex items-center gap-2 text-[11px] text-slate-400">
          {report.items.length} {report.itemLabel.toLowerCase()}{report.items.length === 1 ? "" : "s"}
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </button>
      {open && (
        <div className="border-t border-slate-100 overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="py-1.5 px-3 font-semibold">{report.itemLabel}</th>
                {!isFeed && <th className="py-1.5 px-2 font-semibold text-right">{report.primaryLabel || "Value"}</th>}
                {!isFeed && <th className="py-1.5 px-2 font-semibold text-right">MoM</th>}
                {!isFeed && <th className="py-1.5 px-2 font-semibold">Trend</th>}
                {cols.map((c) => <th key={c.key} className="py-1.5 px-2 font-semibold text-right">{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((it, i) => {
                const mom = itemMom(it);
                const cur = it.series?.filter((v): v is number => v != null).slice(-1)[0] ?? null;
                const up = mom == null ? true : report.higherIsBetter ? mom >= 0 : mom < 0;
                return (
                  <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                    <td className="py-1.5 px-3 text-slate-700 truncate max-w-[220px]" title={it.name}>{it.name}</td>
                    {!isFeed && <td className="py-1.5 px-2 text-right tabular-nums font-medium text-slate-800">{formatValue(cur, report.format)}</td>}
                    {!isFeed && <td className="py-1.5 px-2 text-right"><Mom pct={mom} lowerBetter={!report.higherIsBetter} /></td>}
                    {!isFeed && <td className="py-1.5 px-2"><Spark series={it.series} up={up} /></td>}
                    {cols.map((c: DetailColumn) => (
                      <td key={c.key} className="py-1.5 px-2 text-right tabular-nums text-slate-600">{fmtCol(it.extra?.[c.key], c.format)}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default DetailReportTable;
