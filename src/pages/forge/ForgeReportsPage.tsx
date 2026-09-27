/**
 * ForgeReportsPage — the report catalogue and a runner for any of them.
 *
 * One page, not fourteen. The API describes each report and which filters it
 * accepts, so this screen renders whatever the backend offers; adding a report
 * server-side makes it appear here with no frontend change.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listReports, runReport, type ReportResult, type ReportSummary,
} from '../../lib/forgeApi';
import { ForgeLayout, Card, Button, EmptyState, Pill } from './ForgeLayout';
import { ForgeExportButton } from './ForgeExportButton';
import { csvBlankIfDash, csvFilename, downloadCsv, toCsvText } from './forgeCsv';
import { useForgeApi, describeError } from './useForge';
import { moneyExact, shortDate } from './forgeConfig';

/**
 * How to render a column, decided by ORDERED rules rather than one regex.
 *
 * A single "does the name contain a money word" test gets two things wrong
 * that a reader notices immediately: it renders a fiscal year as "2,027",
 * and it misses average_gift / largest_gift, which are money but contain no
 * money word. Order matters here — identifiers and years are checked before
 * anything else, and counts before money.
 */
type CellKind = 'plainInt' | 'count' | 'percent' | 'money' | 'date' | 'text';

function kindOf(column: string): CellKind {
  // Years, quarters and identifiers are numbers that must never be grouped.
  if (/(^|_)(year|quarter|month|id|bps)$/i.test(column)) return 'plainInt';
  if (/_count$|^gift_count$|_served$|^donor_count$/i.test(column)) return 'count';
  if (/(percent|ratio)/i.test(column)) return 'percent';
  if (/(_on|_date|acknowledge_by)$/i.test(column)) return 'date';
  if (/(amount|total|raised|goal|cost|value|balance|outstanding|paid|deductible|fee|award|_gift$|per_dollar)/i.test(column)) return 'money';
  return 'text';
}

const humanize = (s: string) =>
  s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bFy\b/g, 'FY').replace(/\bRoi\b/g, 'ROI').replace(/\bIrs\b/g, 'IRS')
    .replace(/\bLybunt\b/g, 'LYBUNT').replace(/\bSybunt\b/g, 'SYBUNT');

/** The three columns whose values are a state, drawn as a pill rather than text. */
const PILL_COLUMNS = new Set(['lapse_status', 'pipeline_stage', 'restriction_class']);

/**
 * The TEXT of a report cell. The table draws it and the CSV writes it, so the
 * decision is made once here — otherwise the two drift and a board member's
 * spreadsheet says `with_donor_restriction` where the screen said "With donor
 * restriction", or 2027 where the screen said FY2027.
 */
function cellText(column: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (PILL_COLUMNS.has(column)) {
    const s = String(value);
    return s === 'LYBUNT' || s === 'SYBUNT' ? s : humanize(s);
  }
  switch (kindOf(column)) {
    case 'plainInt': return String(value);
    case 'count': return Number(value).toLocaleString();
    case 'percent': return `${Number(value).toFixed(1)}%`;
    case 'date': return shortDate(value);
    case 'money': return Number.isNaN(Number(value)) ? String(value) : moneyExact(value);
    default: {
      if (typeof value === 'number') return value.toLocaleString();
      const s = String(value);
      // Values stored as lower_snake_case are machine identifiers. A board
      // report should say "With donor restriction", not the column value.
      return /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(s) ? humanize(s) : s;
    }
  }
}

function renderCell(column: string, value: unknown) {
  if (value === null || value === undefined || value === '') return <span className="text-slate-400">—</span>;
  if (PILL_COLUMNS.has(column)) {
    const tone = value === 'current' || value === 'received' ? 'green'
      : value === 'LYBUNT' || value === 'awaiting_decision' || value === 'awarded_not_received' ? 'amber'
        : value === 'SYBUNT' ? 'red' : 'slate';
    return <Pill tone={tone}>{cellText(column, value)}</Pill>;
  }
  return cellText(column, value);
}

/** Numeric columns are right-aligned so a reader can compare down a column. */
const numeric = (column: string, rows: Array<Record<string, unknown>>) =>
  rows.length > 0 && rows.every((r) => r[column] === null || typeof r[column] === 'number');

const FILTER_LABEL: Record<string, string> = {
  fiscalYear: 'Fiscal year', fiscalQuarter: 'Quarter', taxYear: 'Tax year',
  calendarYear: 'Year', personId: 'Person ID', campaignId: 'Campaign ID',
  fundId: 'Fund ID', status: 'Status', lapseStatus: 'Lapse status',
  restriction: 'Restriction', stage: 'Stage', lineKind: 'Revenue or expense',
};

export function ForgeReportsPage() {
  const { ready, withParams } = useForgeApi();
  const [catalogue, setCatalogue] = useState<ReportSummary[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    withParams(listReports)
      .then((r) => {
        if (cancelled) return;
        setCatalogue(r);
        setActive((cur) => cur ?? r[0]?.key ?? null);
      })
      .catch((err) => { if (!cancelled) setError(describeError(err, 'the report list')); console.error(err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ready, withParams]);

  useEffect(() => { setFilters({}); }, [active]);

  useEffect(() => {
    if (!ready || !active) return;
    let cancelled = false;
    setRunning(true);
    setError(null);
    withParams((p) => runReport(p, active, filters))
      .then((r) => { if (!cancelled) setResult(r); })
      .catch((err) => { if (!cancelled) { setError(describeError(err, 'this report')); setResult(null); } console.error(err); })
      .finally(() => { if (!cancelled) setRunning(false); });
    return () => { cancelled = true; };
  }, [ready, withParams, active, filters]);

  const grouped = useMemo(() => {
    const out = new Map<string, ReportSummary[]>();
    for (const r of catalogue) {
      if (!out.has(r.group)) out.set(r.group, []);
      out.get(r.group)!.push(r);
    }
    return [...out.entries()];
  }, [catalogue]);

  /* Built in the browser from what is already on screen, so what a board member
     receives is exactly what the staff member saw — the same column names, the
     same formatting, and no tenant_id, which the table hides.
     The writer itself is now the shared one every FORGE screen uses. The copy
     that lived here wrote no byte-order mark (accented donor names arrived in
     Excel mangled), broke lines with LF, and did nothing about a value starting
     with `=` — a report is the file most likely to be forwarded outside the
     organization, so it was the worst place to keep those three. */
  const exportCsv = useCallback(async () => {
    if (!result) return;
    const columns = result.columns
      .filter((c) => c !== 'tenant_id')
      .map((c) => ({ key: c, label: humanize(c) }));
    downloadCsv(
      csvFilename(result.key),
      toCsvText(columns, result.data, (row, col) => csvBlankIfDash(cellText(col.key, row[col.key])))
    );
  }, [result]);

  const activeReport = catalogue.find((r) => r.key === active);

  return (
    <ForgeLayout
      title="Reports"
      subtitle="Fundraising, program and financial reporting — the questions a board, a funder and the IRS ask."
      loading={loading}
      loadingLabel="Loading reports…"
      error={error}
      actions={(
        <ForgeExportButton
          subject="this report"
          disabled={!result || result.data.length === 0}
          onExport={exportCsv}
          onError={setError}
        />
      )}
    >
      <div className="grid gap-6 lg:grid-cols-[16rem,1fr]">
        <div className="space-y-4">
          {grouped.map(([group, reports]) => (
            <Card key={group} title={group}>
              <ul className="-mx-2 space-y-0.5">
                {reports.map((r) => (
                  <li key={r.key}>
                    <button
                      type="button"
                      onClick={() => setActive(r.key)}
                      className={`w-full rounded-lg px-2 py-1.5 text-left text-sm transition ${
                        active === r.key
                          ? 'bg-slate-900 font-medium text-white'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {r.title}
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>

        <div className="space-y-4">
          {activeReport && (
            <Card>
              <h2 className="text-base font-semibold text-slate-900">{activeReport.title}</h2>
              <p className="mt-1 text-sm text-slate-600">{activeReport.description}</p>

              {activeReport.filters.length > 0 && (
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  {activeReport.filters.map((f) => (
                    <label key={f} className="text-xs font-medium text-slate-600">
                      <span className="mb-1 block">{FILTER_LABEL[f] ?? humanize(f)}</span>
                      <input
                        className="w-40 rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-900"
                        value={filters[f] ?? ''}
                        placeholder="Any"
                        onChange={(e) => setFilters((cur) => ({ ...cur, [f]: e.target.value }))}
                      />
                    </label>
                  ))}
                  {Object.values(filters).some(Boolean) && (
                    <Button onClick={() => setFilters({})}>Clear filters</Button>
                  )}
                </div>
              )}
            </Card>
          )}

          <Card
            title={result ? `${result.rowCount.toLocaleString()} row${result.rowCount === 1 ? '' : 's'}` : undefined}
            action={result ? (
              <span className="text-xs text-slate-500">
                Generated {new Date(result.generatedAt).toLocaleString()}
              </span>
            ) : undefined}
          >
            {result?.truncated && (
              // Said out loud: a silently truncated report reads as complete.
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                This report hit the row limit and is showing a partial result. Narrow it with a filter.
              </div>
            )}
            {running ? (
              <div className="py-8 text-center text-sm text-slate-500">Running…</div>
            ) : !result || result.data.length === 0 ? (
              <EmptyState>No rows for this report yet.</EmptyState>
            ) : (
              <div className="-mx-5 overflow-x-auto px-5">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      {result.columns.filter((c) => c !== 'tenant_id').map((c) => (
                        <th
                          key={c}
                          className={`whitespace-nowrap py-2 pr-4 font-semibold ${
                            numeric(c, result.data) ? 'text-right' : ''
                          }`}
                        >
                          {humanize(c)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {result.data.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        {result.columns.filter((c) => c !== 'tenant_id').map((c) => (
                          <td
                            key={c}
                            className={`whitespace-nowrap py-2 pr-4 text-slate-700 ${
                              numeric(c, result.data) ? 'text-right tabular-nums' : ''
                            }`}
                          >
                            {renderCell(c, row[c])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </ForgeLayout>
  );
}
