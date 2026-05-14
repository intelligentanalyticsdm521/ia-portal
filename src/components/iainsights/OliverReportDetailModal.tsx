// OliverReportDetailModal — v8.4 OLIVER IA Insights Trends deep-dive modal.
//
// Mirrors SparkReportDetailModal: header + score history + per-report rich
// body + ArgusObservationsBox + footer. Rule libraries from oliverRules.ts
// drive the dark ARGUS section observations + actions.

import { X } from "lucide-react";
import { MonthlyScoreBars, MIN_HISTORY_PERIODS } from "./MonthlyScoreBars";
import { ArgusObservationsBox } from "./ArgusObservationsBox";
import { evaluateRules, type InsightRule } from "./insightRules";
import {
  OLIVER_OPS_HEALTH_RULES,
  OLIVER_REVENUE_PERF_RULES,
  OLIVER_CASH_FLOW_RULES,
  OLIVER_QUOTE_WIN_RULES,
  OLIVER_RETENTION_RULES,
  OLIVER_CREW_RULES,
  OLIVER_SERVICE_LINE_RULES,
  OLIVER_SEASONAL_RULES,
} from "./oliverRules";

interface OliverReportAnalysis {
  score: number;
  scoreInputs: Array<{ key: string; value: number | string | null; weight: number; note?: string }>;
  observations: string[];
  actions: string[];
  contextNote?: string;
}

interface OliverMeta {
  key: string;
  label: string;
  question: string;
  icon: any;
  weight: number;
}

interface Props {
  reportKey: string;
  meta: OliverMeta;
  report: OliverReportAnalysis;
  history?: Array<{ period_end: string; score: number }>;
  /** OliverEngineInput shape — all data the engines + rule libraries need. */
  inputs: any;
  periodLabel?: string;
  tenantLabel?: string;
  onClose: () => void;
}

const OLIVER_RULES_BY_REPORT: Record<string, InsightRule[] | undefined> = {
  ops_health:     OLIVER_OPS_HEALTH_RULES,
  revenue_perf:   OLIVER_REVENUE_PERF_RULES,
  cash_flow:      OLIVER_CASH_FLOW_RULES,
  quote_win_rate: OLIVER_QUOTE_WIN_RULES,
  retention:      OLIVER_RETENTION_RULES,
  crew_capacity:  OLIVER_CREW_RULES,
  service_line:   OLIVER_SERVICE_LINE_RULES,
  seasonal:       OLIVER_SEASONAL_RULES,
};

function bandColor(score: number): string {
  if (score >= 70) return "#16A34A";
  if (score >= 50) return "#EAB308";
  if (score > 0)   return "#DC2626";
  return "#94A3B8";
}

export function OliverReportDetailModal({
  reportKey, meta, report, history = [], inputs, periodLabel, tenantLabel, onClose,
}: Props) {
  const Icon = meta.icon;
  const scoreColor = bandColor(report.score);
  const rules = OLIVER_RULES_BY_REPORT[reportKey];
  let observations = report.observations;
  let actions = report.actions;
  if (rules) {
    const fired = evaluateRules(rules, inputs, { maxObservations: 8, maxActions: 5 });
    observations = fired.observations;
    actions = fired.actions;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-4 flex-shrink-0">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center" style={{ background: `${scoreColor}1A`, color: scoreColor }}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-900 truncate">{meta.label}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{periodLabel || meta.question}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-right">
              <div className="text-2xl font-bold tabular-nums" style={{ color: scoreColor }}>{report.score}</div>
              <div className="text-[9px] uppercase text-slate-400">/ 100</div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded text-slate-500" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {history.length >= MIN_HISTORY_PERIODS && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="text-[10px] uppercase font-semibold tracking-wide text-slate-500">Score history</div>
                <div className="text-[9px] text-slate-400">{history.length} period{history.length === 1 ? "" : "s"}</div>
              </div>
              <MonthlyScoreBars data={history} width={680} height={92} />
            </div>
          )}

          {renderOliverBody(reportKey, inputs, report)}

          <ArgusObservationsBox
            observations={observations}
            actions={actions}
            reportLabel={meta.label}
            tenantLabel={tenantLabel}
            periodLabel={periodLabel}
          />
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-6 py-3 bg-slate-50 rounded-b-lg flex-shrink-0">
          <div className="text-[11px] text-slate-500">
            Generated by <span className="font-semibold" style={{ color: "#A3E635" }}>ARGUS</span>
            {periodLabel && <> · {periodLabel.split("·")[0].trim()}</>}
          </div>
          <button onClick={onClose} className="px-4 py-1.5 text-xs bg-slate-900 text-white rounded hover:bg-slate-800">Close</button>
        </div>
      </div>
    </div>
  );
}

function renderOliverBody(reportKey: string, inputs: any, report: OliverReportAnalysis) {
  switch (reportKey) {
    case "ops_health":     return <OpsHealthBody inputs={inputs} />;
    case "revenue_perf":   return <RevenuePerfBody inputs={inputs} />;
    case "cash_flow":      return <CashFlowBody inputs={inputs} />;
    case "quote_win_rate": return <QuoteWinBody inputs={inputs} />;
    case "retention":      return <RetentionBody inputs={inputs} />;
    case "crew_capacity":  return <CrewBody inputs={inputs} />;
    case "service_line":   return <ServiceLineBody inputs={inputs} />;
    case "seasonal":       return <SeasonalBody inputs={inputs} />;
    default:               return <GenericBody report={report} />;
  }
}

// ── Operations Health body ───────────────────────────────────────────
function OpsHealthBody({ inputs }: { inputs: any }) {
  const statuses = inputs?.job_status || [];
  const total = statuses.reduce((s: number, r: any) => s + Number(r.n || 0), 0);
  const byStatus: Record<string, number> = Object.fromEntries(statuses.map((r: any) => [r.status, Number(r.n || 0)]));
  const completed = (byStatus.completed || 0) + (byStatus.paid || 0) + (byStatus.invoiced || 0);
  const completionRate = total > 0 ? (completed / total) * 100 : 0;
  const lifecycle = inputs?.job_lifecycle || {};
  const onTime = Number(lifecycle.on_time || 0);
  const late = Number(lifecycle.late || 0);
  const onTimeRate = (onTime + late) > 0 ? (onTime / (onTime + late)) * 100 : 0;
  const days = Number(inputs?.period_days || 30);
  const avgHrs = Number(lifecycle.avg_completion_hours || 0);

  return (
    <>
      {total === 0 ? (
        <div className="rounded-md border-l-4 border-amber-400 bg-amber-50 px-4 py-3">
          <div className="text-xs font-semibold uppercase text-amber-800 tracking-wide mb-1">The insight</div>
          <p className="text-sm text-slate-800 leading-relaxed">No jobs recorded this period. Verify job creation pipeline + recent oliver.job inserts.</p>
        </div>
      ) : completionRate < 50 ? (
        <div className="rounded-md border-l-4 border-rose-400 bg-rose-50 px-4 py-3">
          <div className="text-xs font-semibold uppercase text-rose-800 tracking-wide mb-1">The insight</div>
          <p className="text-sm text-slate-800 leading-relaxed">Only <strong>{completionRate.toFixed(0)}%</strong> of jobs reach invoiced state. Bottleneck somewhere in dispatch → in_progress → completed flow.</p>
        </div>
      ) : (onTime + late) >= 5 && onTimeRate < 70 ? (
        <div className="rounded-md border-l-4 border-amber-400 bg-amber-50 px-4 py-3">
          <div className="text-xs font-semibold uppercase text-amber-800 tracking-wide mb-1">The insight</div>
          <p className="text-sm text-slate-800 leading-relaxed">On-time rate is <strong>{onTimeRate.toFixed(0)}%</strong> — late jobs damage referrals + repeat-booking rate. Tighten scheduling.</p>
        </div>
      ) : (
        <div className="rounded-md border-l-4 border-emerald-400 bg-emerald-50 px-4 py-3">
          <div className="text-xs font-semibold uppercase text-emerald-800 tracking-wide mb-1">The insight</div>
          <p className="text-sm text-slate-800 leading-relaxed"><strong>{fmtN(total)} jobs</strong> over {days} days · {completionRate.toFixed(0)}% completion · {(onTime + late) > 0 ? `${onTimeRate.toFixed(0)}% on-time` : "on-time data accumulating"}. Healthy operational throughput.</p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label={`Total Jobs (${days}d)`} value={fmtN(total)} sub={`${(total / Math.max(days, 1)).toFixed(1)}/day`} accent="#FEC82C" />
        <Kpi label="Completion Rate" value={total > 0 ? `${completionRate.toFixed(0)}%` : "—"} sub={`${fmtN(completed)} completed`} accent={completionRate >= 70 ? "#16A34A" : completionRate >= 50 ? "#EAB308" : "#DC2626"} />
        <Kpi label="On-Time Rate" value={(onTime + late) > 0 ? `${onTimeRate.toFixed(0)}%` : "—"} sub={`${onTime} on-time · ${late} late`} accent={onTimeRate >= 85 ? "#16A34A" : onTimeRate >= 70 ? "#EAB308" : "#DC2626"} />
        <Kpi label="Avg Cycle Time" value={avgHrs > 0 ? `${avgHrs.toFixed(1)}h` : "—"} sub="start → finish" accent="#1A3A4A" />
      </div>

      {statuses.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-slate-900 mb-2">Status distribution</h3>
          <div className="space-y-1.5">
            {statuses.map((s: any, i: number) => {
              const n = Number(s.n || 0);
              const share = total > 0 ? (n / total) * 100 : 0;
              const color = /completed|paid|invoiced/.test(s.status) ? "#16A34A"
                          : /cancelled|lost/.test(s.status) ? "#DC2626"
                          : /in_progress|dispatched|assigned/.test(s.status) ? "#EAB308" : "#1A7DB5";
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-28 text-xs text-slate-700 truncate">{s.status}</div>
                  <div className="flex-1 h-5 rounded bg-slate-100 overflow-hidden relative">
                    <div className="h-full rounded" style={{ width: `${share}%`, background: color }} />
                    <div className="absolute inset-0 flex items-center px-2 text-[10px] font-semibold text-slate-700">{fmtN(n)} · {share.toFixed(0)}%</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

// ── Revenue Performance body ─────────────────────────────────────────
function RevenuePerfBody({ inputs }: { inputs: any }) {
  const r = inputs?.revenue_recent || {};
  const revenue = Number(r.revenue || 0);
  const invoices = Number(r.invoices || 0);
  const paid = Number(r.paid || 0);
  const overdue = Number(r.overdue || 0);
  const days = Number(inputs?.period_days || 30);
  const avgInvoice = invoices > 0 ? revenue / invoices : 0;
  const collectionRate = invoices > 0 ? (paid / invoices) * 100 : 0;
  const runRate = (revenue / Math.max(days, 1)) * 365;

  return (
    <>
      {invoices === 0 ? (
        <div className="rounded-md border-l-4 border-amber-400 bg-amber-50 px-4 py-3">
          <div className="text-xs font-semibold uppercase text-amber-800 tracking-wide mb-1">The insight</div>
          <p className="text-sm text-slate-800 leading-relaxed">No invoices recorded this period. Verify job-complete → invoice pipeline.</p>
        </div>
      ) : collectionRate < 60 ? (
        <div className="rounded-md border-l-4 border-rose-400 bg-rose-50 px-4 py-3">
          <div className="text-xs font-semibold uppercase text-rose-800 tracking-wide mb-1">The insight</div>
          <p className="text-sm text-slate-800 leading-relaxed">Collection rate is <strong>{collectionRate.toFixed(0)}%</strong> — significant working capital tied up in receivables. Cash-flow pressure is real.</p>
        </div>
      ) : (
        <div className="rounded-md border-l-4 border-emerald-400 bg-emerald-50 px-4 py-3">
          <div className="text-xs font-semibold uppercase text-emerald-800 tracking-wide mb-1">The insight</div>
          <p className="text-sm text-slate-800 leading-relaxed"><strong>${fmtN(revenue)}</strong> invoiced across {fmtN(invoices)} invoices ({collectionRate.toFixed(0)}% paid). Annual run-rate ~${fmtN(runRate)}.</p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label={`Invoiced (${days}d)`} value={`$${fmtN(revenue)}`} sub={`${fmtN(invoices)} invoices`} accent="#16A34A" />
        <Kpi label="Avg Invoice" value={avgInvoice > 0 ? `$${fmtN(avgInvoice)}` : "—"} sub="ticket size" accent="#FEC82C" />
        <Kpi label="Collection Rate" value={invoices > 0 ? `${collectionRate.toFixed(0)}%` : "—"} sub={`${fmtN(paid)} of ${fmtN(invoices)} paid`} accent={collectionRate >= 85 ? "#16A34A" : collectionRate >= 60 ? "#EAB308" : "#DC2626"} />
        <Kpi label="Annual Run-Rate" value={`$${fmtN(runRate)}`} sub={`${days}d → 365d projection`} accent="#1A3A4A" />
      </div>

      <div className="rounded-md border border-slate-200 overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-3 py-2 font-semibold text-slate-600">Status</th>
              <th className="text-right px-3 py-2 font-semibold text-slate-600">Count</th>
              <th className="text-right px-3 py-2 font-semibold text-slate-600">Share</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-slate-100"><td className="px-3 py-2 text-slate-900">Paid</td><td className="px-3 py-2 text-right tabular-nums">{fmtN(paid)}</td><td className="px-3 py-2 text-right tabular-nums" style={{ color: "#16A34A" }}>{invoices > 0 ? `${((paid / invoices) * 100).toFixed(0)}%` : "—"}</td></tr>
            <tr className="border-t border-slate-100"><td className="px-3 py-2 text-slate-900">Overdue</td><td className="px-3 py-2 text-right tabular-nums">{fmtN(overdue)}</td><td className="px-3 py-2 text-right tabular-nums" style={{ color: invoices > 0 && overdue / invoices > 0.1 ? "#DC2626" : "#EAB308" }}>{invoices > 0 ? `${((overdue / invoices) * 100).toFixed(0)}%` : "—"}</td></tr>
            <tr className="border-t border-slate-100"><td className="px-3 py-2 text-slate-900">Outstanding</td><td className="px-3 py-2 text-right tabular-nums">{fmtN(Math.max(0, invoices - paid - overdue))}</td><td className="px-3 py-2 text-right tabular-nums">{invoices > 0 ? `${((Math.max(0, invoices - paid - overdue) / invoices) * 100).toFixed(0)}%` : "—"}</td></tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Cash Flow body ───────────────────────────────────────────────────
function CashFlowBody({ inputs }: { inputs: any }) {
  const f = inputs?.cash_flow || {};
  const inflow = Number(f.payments_in || 0);
  const payCount = Number(f.payment_count || 0);
  const avgLate = Number(f.avg_days_late || 0);
  const r = inputs?.revenue_recent || {};
  const overdue = Number(r.overdue || 0);
  const invoices = Number(r.invoices || 0);
  const q = inputs?.quote_funnel || {};
  const pipelineValue = Number(q.pipeline_value || 0);
  const days = Number(inputs?.period_days || 30);
  const monthlyInflow = (inflow / Math.max(days, 1)) * 30;

  return (
    <>
      {(inflow === 0 && invoices === 0) ? (
        <div className="rounded-md border-l-4 border-amber-400 bg-amber-50 px-4 py-3">
          <div className="text-xs font-semibold uppercase text-amber-800 tracking-wide mb-1">The insight</div>
          <p className="text-sm text-slate-800 leading-relaxed">No cash-flow signals yet. Verify Stripe webhook delivery.</p>
        </div>
      ) : avgLate > 25 ? (
        <div className="rounded-md border-l-4 border-rose-400 bg-rose-50 px-4 py-3">
          <div className="text-xs font-semibold uppercase text-rose-800 tracking-wide mb-1">The insight</div>
          <p className="text-sm text-slate-800 leading-relaxed">Average payment lag is <strong>{avgLate.toFixed(0)} days</strong> — well past net-30. Significant cash tied up in receivables.</p>
        </div>
      ) : (
        <div className="rounded-md border-l-4 border-emerald-400 bg-emerald-50 px-4 py-3">
          <div className="text-xs font-semibold uppercase text-emerald-800 tracking-wide mb-1">The insight</div>
          <p className="text-sm text-slate-800 leading-relaxed"><strong>${fmtN(inflow)}</strong> received over {days} days · monthly run-rate ${fmtN(monthlyInflow)}. {avgLate > 0 ? `${avgLate.toFixed(0)}-day average payment lag.` : ""}</p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label={`Inflow (${days}d)`} value={`$${fmtN(inflow)}`} sub={`${fmtN(payCount)} payments`} accent="#16A34A" />
        <Kpi label="Monthly Run-Rate" value={`$${fmtN(monthlyInflow)}`} sub="extrapolated" accent="#FEC82C" />
        <Kpi label="Avg Days Late" value={avgLate > 0 ? `${avgLate.toFixed(0)}d` : "—"} sub="invoice → payment" accent={avgLate < 10 ? "#16A34A" : avgLate < 20 ? "#EAB308" : "#DC2626"} />
        <Kpi label="Open Pipeline" value={pipelineValue > 0 ? `$${fmtN(pipelineValue)}` : "—"} sub="from open quotes" accent="#1A3A4A" />
      </div>

      <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 space-y-2">
        <div className="font-bold text-slate-900 text-sm mb-1">Cash signals</div>
        <div className="grid grid-cols-2 gap-3">
          <div><span className="text-slate-500">Overdue invoices:</span> <span className="font-bold text-slate-900">{fmtN(overdue)}</span></div>
          <div><span className="text-slate-500">Avg payment size:</span> <span className="font-bold text-slate-900">${fmtN(payCount > 0 ? inflow / payCount : 0)}</span></div>
          <div><span className="text-slate-500">Payments / day:</span> <span className="font-bold text-slate-900">{(payCount / Math.max(days, 1)).toFixed(1)}</span></div>
          <div><span className="text-slate-500">Forward visibility:</span> <span className="font-bold text-slate-900">{pipelineValue > 0 ? `$${fmtN(pipelineValue)}` : "—"}</span></div>
        </div>
      </div>
    </>
  );
}

// ── Quote & Win Rate body ────────────────────────────────────────────
function QuoteWinBody({ inputs }: { inputs: any }) {
  const q = inputs?.quote_funnel || {};
  const total = Number(q.total || 0);
  const accepted = Number(q.accepted || 0);
  const rejected = Number(q.rejected || 0);
  const draft = Number(q.draft || 0);
  const acceptedValue = Number(q.accepted_value || 0);
  const pipelineValue = Number(q.pipeline_value || 0);
  const decided = accepted + rejected;
  const winRate = decided > 0 ? (accepted / decided) * 100 : 0;
  const avgWon = accepted > 0 ? acceptedValue / accepted : 0;

  const stages = [
    { label: "Draft", count: draft, color: "#94A3B8" },
    { label: "Sent (open)", count: Math.max(0, total - accepted - rejected - draft), color: "#1A7DB5" },
    { label: "Accepted", count: accepted, color: "#16A34A" },
    { label: "Rejected", count: rejected, color: "#DC2626" },
  ];
  const maxStage = Math.max(1, ...stages.map((s) => s.count));

  return (
    <>
      {total === 0 ? (
        <div className="rounded-md border-l-4 border-amber-400 bg-amber-50 px-4 py-3">
          <div className="text-xs font-semibold uppercase text-amber-800 tracking-wide mb-1">The insight</div>
          <p className="text-sm text-slate-800 leading-relaxed">No quotes recorded this period. Use formal quotes for every opportunity to unlock win-rate analysis.</p>
        </div>
      ) : decided >= 5 && winRate < 30 ? (
        <div className="rounded-md border-l-4 border-rose-400 bg-rose-50 px-4 py-3">
          <div className="text-xs font-semibold uppercase text-rose-800 tracking-wide mb-1">The insight</div>
          <p className="text-sm text-slate-800 leading-relaxed">Win rate is <strong>{winRate.toFixed(0)}%</strong> ({accepted} of {decided}) — below the 30% floor. Run a win-loss review on the last 10 decisions to find the pattern.</p>
        </div>
      ) : (
        <div className="rounded-md border-l-4 border-emerald-400 bg-emerald-50 px-4 py-3">
          <div className="text-xs font-semibold uppercase text-emerald-800 tracking-wide mb-1">The insight</div>
          <p className="text-sm text-slate-800 leading-relaxed"><strong>{fmtN(total)} quotes</strong> this period · {decided > 0 ? `${winRate.toFixed(0)}% win rate` : "decisions accumulating"}. {pipelineValue > 0 ? `Open pipeline: $${fmtN(pipelineValue)}.` : ""}</p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Quotes" value={fmtN(total)} sub={`${draft} draft · ${decided} decided`} accent="#FEC82C" />
        <Kpi label="Win Rate" value={decided > 0 ? `${winRate.toFixed(0)}%` : "—"} sub={`${accepted} won of ${decided}`} accent={winRate >= 50 ? "#16A34A" : winRate >= 30 ? "#EAB308" : "#DC2626"} />
        <Kpi label="Avg Won Value" value={accepted > 0 ? `$${fmtN(avgWon)}` : "—"} sub="per accepted quote" accent="#16A34A" />
        <Kpi label="Open Pipeline" value={pipelineValue > 0 ? `$${fmtN(pipelineValue)}` : "—"} sub="forward revenue" accent="#1A3A4A" />
      </div>

      <div>
        <h3 className="text-sm font-bold text-slate-900 mb-2">Quote funnel</h3>
        <div className="space-y-2">
          {stages.map((s, i) => {
            const widthPct = (s.count / maxStage) * 100;
            const share = total > 0 ? Math.round((s.count / total) * 100) : 0;
            return (
              <div key={i} className="flex items-center gap-3">
                <div className="w-32 text-xs font-medium text-slate-700 flex-shrink-0">{s.label}</div>
                <div className="flex-1 h-6 rounded bg-slate-100 overflow-hidden relative">
                  <div className="h-full rounded" style={{ width: `${widthPct}%`, background: s.color }} />
                  <div className="absolute inset-0 flex items-center px-2 text-[10px] font-semibold text-slate-700">{s.count > 0 ? `${fmtN(s.count)} · ${share}%` : ""}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ── Retention body ───────────────────────────────────────────────────
function RetentionBody({ inputs }: { inputs: any }) {
  const r = inputs?.retention || {};
  const active = Number(r.active_customers || 0);
  const atRisk = Number(r.at_risk || 0);
  const avgJobs = Number(r.avg_jobs_per_customer || 0);
  const atRiskRate = active > 0 ? (atRisk / active) * 100 : 0;

  return (
    <>
      {active === 0 ? (
        <div className="rounded-md border-l-4 border-amber-400 bg-amber-50 px-4 py-3">
          <div className="text-xs font-semibold uppercase text-amber-800 tracking-wide mb-1">The insight</div>
          <p className="text-sm text-slate-800 leading-relaxed">No customer-retention data yet. Verify oliver.job has contact_id populated on completed jobs.</p>
        </div>
      ) : atRiskRate > 30 ? (
        <div className="rounded-md border-l-4 border-rose-400 bg-rose-50 px-4 py-3">
          <div className="text-xs font-semibold uppercase text-rose-800 tracking-wide mb-1">The insight</div>
          <p className="text-sm text-slate-800 leading-relaxed"><strong>{atRiskRate.toFixed(0)}%</strong> of active customers are at-risk ({fmtN(atRisk)} of {fmtN(active)}). Plan a reactivation campaign now.</p>
        </div>
      ) : avgJobs >= 2 ? (
        <div className="rounded-md border-l-4 border-emerald-400 bg-emerald-50 px-4 py-3">
          <div className="text-xs font-semibold uppercase text-emerald-800 tracking-wide mb-1">The insight</div>
          <p className="text-sm text-slate-800 leading-relaxed"><strong>{fmtN(active)} active customers</strong> averaging {avgJobs.toFixed(1)} jobs each — strong repeat-business pattern. Multi-job customers typically have 3-5x LTV.</p>
        </div>
      ) : (
        <div className="rounded-md border-l-4 border-amber-400 bg-amber-50 px-4 py-3">
          <div className="text-xs font-semibold uppercase text-amber-800 tracking-wide mb-1">The insight</div>
          <p className="text-sm text-slate-800 leading-relaxed"><strong>{fmtN(active)} active customers</strong> · {avgJobs.toFixed(1)} jobs each on average · {atRiskRate.toFixed(0)}% at-risk. Repeat-business is the highest-leverage LTV lever — structured post-service follow-up typically lifts repeat rate 0.2-0.4.</p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Active Customers" value={fmtN(active)} sub="recent job activity" accent="#FEC82C" />
        <Kpi label="At Risk" value={fmtN(atRisk)} sub={`${atRiskRate.toFixed(0)}% of active`} accent={atRiskRate < 15 ? "#16A34A" : atRiskRate < 30 ? "#EAB308" : "#DC2626"} />
        <Kpi label="Jobs / Customer" value={avgJobs > 0 ? avgJobs.toFixed(2) : "—"} sub="repeat-business signal" accent={avgJobs >= 2 ? "#16A34A" : avgJobs >= 1.3 ? "#EAB308" : "#DC2626"} />
        <Kpi label="Repeat Rate" value={avgJobs > 0 ? `${Math.min(100, Math.round((1 - 1 / avgJobs) * 100))}%` : "—"} sub="customers booking 2+" accent="#1A3A4A" />
      </div>

      <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 space-y-2">
        <div className="font-bold text-slate-900 text-sm mb-1">Retention playbook</div>
        <div>• Reactivation: target the {fmtN(atRisk)} at-risk customers with "we haven't seen you" sequence — typically recovers 20-30%</div>
        <div>• Cross-sell: introduce adjacent services to repeat customers via post-job email</div>
        <div>• Champions: customers with 3+ jobs are referral candidates — exclusive offers + referral incentives</div>
        <div>• Annual reminders: for one-time service categories, time-based reminders are the simplest repeat-driver</div>
      </div>
    </>
  );
}

// ── Crew & Capacity body ─────────────────────────────────────────────
function CrewBody({ inputs }: { inputs: any }) {
  const crew = inputs?.crew || {};
  const workers = Number(crew.workers_with_assignments || 0);
  const avgJobs = Number(crew.avg_jobs_per_worker || 0);
  const days = Number(inputs?.period_days || 30);
  const perDay = avgJobs / Math.max(days, 1);
  const lifecycle = inputs?.job_lifecycle || {};
  const avgHrs = Number(lifecycle.avg_completion_hours || 0);
  const utilEstimate = workers > 0 && avgHrs > 0
    ? Math.min(100, ((avgHrs * avgJobs * workers) / (days * 8 * workers)) * 100)
    : 0;

  return (
    <>
      {workers === 0 ? (
        <div className="rounded-md border-l-4 border-amber-400 bg-amber-50 px-4 py-3">
          <div className="text-xs font-semibold uppercase text-amber-800 tracking-wide mb-1">The insight</div>
          <p className="text-sm text-slate-800 leading-relaxed">No workers with assignments this period. Verify oliver.job_assignment is being recorded on dispatch.</p>
        </div>
      ) : perDay > 1.5 ? (
        <div className="rounded-md border-l-4 border-rose-400 bg-rose-50 px-4 py-3">
          <div className="text-xs font-semibold uppercase text-rose-800 tracking-wide mb-1">The insight</div>
          <p className="text-sm text-slate-800 leading-relaxed">Crew is operating <strong>near or above capacity</strong> ({perDay.toFixed(2)} jobs/day per worker). Plan capacity addition in next 60 days.</p>
        </div>
      ) : perDay < 0.5 && workers >= 2 ? (
        <div className="rounded-md border-l-4 border-amber-400 bg-amber-50 px-4 py-3">
          <div className="text-xs font-semibold uppercase text-amber-800 tracking-wide mb-1">The insight</div>
          <p className="text-sm text-slate-800 leading-relaxed">Crew is <strong>under-utilised</strong> ({perDay.toFixed(2)} jobs/day per worker). Either volume is low (acquisition problem) or scheduling isn't packing jobs efficiently.</p>
        </div>
      ) : (
        <div className="rounded-md border-l-4 border-emerald-400 bg-emerald-50 px-4 py-3">
          <div className="text-xs font-semibold uppercase text-emerald-800 tracking-wide mb-1">The insight</div>
          <p className="text-sm text-slate-800 leading-relaxed"><strong>{workers}-person crew</strong> averaging {avgJobs.toFixed(1)} jobs each over {days} days ({perDay.toFixed(2)}/day per worker). Healthy utilisation.</p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Active Workers" value={fmtN(workers)} sub="with assignments" accent="#FEC82C" />
        <Kpi label="Avg Jobs / Worker" value={avgJobs > 0 ? avgJobs.toFixed(1) : "—"} sub={`over ${days} days`} accent="#1A3A4A" />
        <Kpi label="Jobs / Day / Worker" value={perDay > 0 ? perDay.toFixed(2) : "—"} sub="capacity signal" accent={perDay > 1.5 ? "#DC2626" : perDay >= 0.5 ? "#16A34A" : "#EAB308"} />
        <Kpi label="Est. Utilisation" value={utilEstimate > 0 ? `${utilEstimate.toFixed(0)}%` : "—"} sub="of available hours" accent={utilEstimate > 70 ? "#DC2626" : utilEstimate >= 40 ? "#16A34A" : "#EAB308"} />
      </div>

      <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 space-y-1.5">
        <div className="font-bold text-slate-900 text-sm mb-1">Capacity planning</div>
        <div>• Healthy daily range: <strong>0.5-1.5 jobs/day per worker</strong> (excludes travel + admin)</div>
        <div>• Sustainable utilisation ceiling: <strong>~70% of available hours</strong> — above this and burnout risk rises</div>
        <div>• {perDay > 1.5 ? "→ Add capacity: part-time contract crew (fastest), full-time hire (60-90 day ramp), or outsource overflow." : perDay < 0.5 && workers >= 2 ? "→ Either drive more demand (acquisition reports) or audit scheduling for route inefficiencies." : "→ Maintain current dispatch discipline; review monthly for drift."}</div>
      </div>
    </>
  );
}

// ── Service Line body ────────────────────────────────────────────────
function ServiceLineBody({ inputs }: { inputs: any }) {
  const lines = inputs?.service_line || [];
  const totalRev = lines.reduce((s: number, r: any) => s + Number(r.total_value || 0), 0);
  const totalN = lines.reduce((s: number, r: any) => s + Number(r.n || 0), 0);
  const avgValue = totalN > 0 ? totalRev / totalN : 0;
  const top = lines[0];
  const topShare = totalRev > 0 && top ? (Number(top.total_value || 0) / totalRev) * 100 : 0;

  return (
    <>
      {lines.length === 0 ? (
        <div className="rounded-md border-l-4 border-amber-400 bg-amber-50 px-4 py-3">
          <div className="text-xs font-semibold uppercase text-amber-800 tracking-wide mb-1">The insight</div>
          <p className="text-sm text-slate-800 leading-relaxed">No service-line breakdown. Configure your service catalog and ensure quotes + jobs select a service.</p>
        </div>
      ) : topShare > 65 ? (
        <div className="rounded-md border-l-4 border-rose-400 bg-rose-50 px-4 py-3">
          <div className="text-xs font-semibold uppercase text-rose-800 tracking-wide mb-1">The insight</div>
          <p className="text-sm text-slate-800 leading-relaxed"><strong>{topShare.toFixed(0)}% concentration risk:</strong> most revenue from "{top.service_type}". Demand shift in that category would halve revenue.</p>
        </div>
      ) : (
        <div className="rounded-md border-l-4 border-emerald-400 bg-emerald-50 px-4 py-3">
          <div className="text-xs font-semibold uppercase text-emerald-800 tracking-wide mb-1">The insight</div>
          <p className="text-sm text-slate-800 leading-relaxed">{lines.length} service lines · ${fmtN(totalRev)} revenue · ${fmtN(avgValue)} average ticket. Top line "{top.service_type}" at {topShare.toFixed(0)}% share.</p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Service Lines" value={String(lines.length)} sub="active categories" accent="#FEC82C" />
        <Kpi label="Total Revenue" value={`$${fmtN(totalRev)}`} sub={`${fmtN(totalN)} jobs`} accent="#16A34A" />
        <Kpi label="Avg Job Value" value={avgValue > 0 ? `$${fmtN(avgValue)}` : "—"} sub="across all lines" accent="#1A3A4A" />
        <Kpi label="Top Line Share" value={totalRev > 0 ? `${topShare.toFixed(0)}%` : "—"} sub={top?.service_type || "—"} accent={topShare < 40 ? "#16A34A" : topShare < 65 ? "#EAB308" : "#DC2626"} />
      </div>

      {lines.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-slate-900 mb-2">Service line breakdown</h3>
          <div className="rounded-md border border-slate-200 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-slate-600">Service</th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-600">Jobs</th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-600">Avg Value</th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-600">Total</th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-600">Share</th>
                </tr>
              </thead>
              <tbody>
                {lines.slice(0, 10).map((l: any, i: number) => {
                  const v = Number(l.total_value || 0);
                  const share = totalRev > 0 ? (v / totalRev) * 100 : 0;
                  return (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-900">{l.service_type || "(uncategorised)"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtN(Number(l.n))}</td>
                      <td className="px-3 py-2 text-right tabular-nums">${fmtN(Number(l.avg_value || 0))}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">${fmtN(v)}</td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: share > 50 ? "#DC2626" : share > 30 ? "#EAB308" : "#16A34A" }}>{share.toFixed(0)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

// ── Seasonal body ────────────────────────────────────────────────────
function SeasonalBody({ inputs }: { inputs: any }) {
  const seasonal = inputs?.seasonal || [];
  const counts = seasonal.map((r: any) => Number(r.n || 0));
  const max = counts.length > 0 ? Math.max(...counts) : 0;
  const min = counts.length > 0 ? Math.min(...counts) : 0;
  const avg = counts.length > 0 ? counts.reduce((s: number, n: number) => s + n, 0) / counts.length : 0;
  const peakRatio = avg > 0 ? max / avg : 0;
  const monthNames = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const sortedByVol = [...seasonal].sort((a: any, b: any) => Number(b.n) - Number(a.n));
  const peakMonth = sortedByVol[0];
  const troughMonth = sortedByVol[sortedByVol.length - 1];

  return (
    <>
      {seasonal.length < 4 ? (
        <div className="rounded-md border-l-4 border-amber-400 bg-amber-50 px-4 py-3">
          <div className="text-xs font-semibold uppercase text-amber-800 tracking-wide mb-1">The insight</div>
          <p className="text-sm text-slate-800 leading-relaxed">Only {seasonal.length} month{seasonal.length === 1 ? "" : "s"} of historical data. Seasonal patterns need 12+ months for year-over-year comparison.</p>
        </div>
      ) : peakRatio > 2.5 ? (
        <div className="rounded-md border-l-4 border-amber-400 bg-amber-50 px-4 py-3">
          <div className="text-xs font-semibold uppercase text-amber-800 tracking-wide mb-1">The insight</div>
          <p className="text-sm text-slate-800 leading-relaxed"><strong>Highly seasonal business</strong> — peak month is {peakRatio.toFixed(1)}x average. Cash-flow + capacity planning need 60-90 day lead time.</p>
        </div>
      ) : (
        <div className="rounded-md border-l-4 border-emerald-400 bg-emerald-50 px-4 py-3">
          <div className="text-xs font-semibold uppercase text-emerald-800 tracking-wide mb-1">The insight</div>
          <p className="text-sm text-slate-800 leading-relaxed">Peak: <strong>{monthNames[Number(peakMonth?.month_num)] || `M${peakMonth?.month_num}`}</strong> ({fmtN(Number(peakMonth?.n))} jobs) · Trough: <strong>{monthNames[Number(troughMonth?.month_num)] || `M${troughMonth?.month_num}`}</strong> ({fmtN(Number(troughMonth?.n))}). Peak-to-trough ratio: {peakRatio.toFixed(1)}x.</p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Months of Data" value={String(seasonal.length)} sub={seasonal.length >= 12 ? "full year" : "partial year"} accent="#FEC82C" />
        <Kpi label="Peak Month" value={peakMonth ? monthNames[Number(peakMonth.month_num)] : "—"} sub={peakMonth ? `${fmtN(Number(peakMonth.n))} jobs` : ""} accent="#16A34A" />
        <Kpi label="Slowest Month" value={troughMonth ? monthNames[Number(troughMonth.month_num)] : "—"} sub={troughMonth ? `${fmtN(Number(troughMonth.n))} jobs` : ""} accent="#DC2626" />
        <Kpi label="Peak / Avg Ratio" value={peakRatio > 0 ? `${peakRatio.toFixed(1)}x` : "—"} sub="seasonality strength" accent={peakRatio < 1.5 ? "#16A34A" : peakRatio < 2.5 ? "#EAB308" : "#DC2626"} />
      </div>

      {seasonal.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-slate-900 mb-2">Monthly job volume</h3>
          <div className="space-y-1.5">
            {[...seasonal].sort((a: any, b: any) => Number(a.month_num) - Number(b.month_num)).map((m: any, i: number) => {
              const n = Number(m.n || 0);
              const widthPct = max > 0 ? (n / max) * 100 : 0;
              const isPeak = n === max && max > 0;
              const isTrough = n === min && seasonal.length > 1;
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-16 text-xs text-slate-700">{monthNames[Number(m.month_num)] || `M${m.month_num}`}</div>
                  <div className="flex-1 h-5 rounded bg-slate-100 overflow-hidden relative">
                    <div className="h-full rounded" style={{ width: `${widthPct}%`, background: isPeak ? "#16A34A" : isTrough ? "#DC2626" : "#FEC82C" }} />
                    <div className="absolute inset-0 flex items-center px-2 text-[10px] font-semibold text-slate-700">{fmtN(n)} jobs</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

// ── Generic fallback ─────────────────────────────────────────────────
function GenericBody({ report }: { report: OliverReportAnalysis }) {
  const numericInputs = report.scoreInputs.filter((s) => s.value !== null && s.value !== undefined);
  if (numericInputs.length === 0) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {numericInputs.slice(0, 4).map((k) => (
        <Kpi key={k.key} label={k.key} value={String(k.value)} sub={`${Math.round(k.weight * 100)}% of score`} accent="#FEC82C" />
      ))}
    </div>
  );
}

// ── UI atoms ─────────────────────────────────────────────────────────
function Kpi({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2" style={{ borderTopWidth: 3, borderTopColor: accent }}>
      <div className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide">{label}</div>
      <div className="text-lg font-bold text-slate-900 tabular-nums mt-0.5">{value}</div>
      <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>
    </div>
  );
}

function fmtN(n: number): string {
  if (!isFinite(n)) return "0";
  return Math.round(n).toLocaleString();
}

export default OliverReportDetailModal;
