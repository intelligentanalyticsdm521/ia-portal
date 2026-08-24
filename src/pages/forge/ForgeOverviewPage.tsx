import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDashboard, globalSearch, type DashboardResponse } from '../../lib/forgeApi';
import { Card, EmptyState, ForgeLayout, Pill, StatTile, statusTone } from './ForgeLayout';
import { money, moneyExact, shortDate } from './forgeConfig';
import { describeError, useDebounced, useForgeApi } from './useForge';
import { screenRoute } from './forgeSoftware';

export function ForgeOverviewPage() {
  const { ready, withParams } = useForgeApi();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const [hits, setHits] = useState<Array<{ entity: string; id: number; label: string; detail: string }>>([]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setLoading(true); setError(null);
    withParams(getDashboard)
      .then((r) => { if (!cancelled) setData(r); })
      .catch((err) => { if (!cancelled) setError(describeError(err, 'the FORGE dashboard')); console.error(err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ready, withParams]);

  useEffect(() => {
    if (!ready || q.trim().length < 2) { setHits([]); return; }
    let cancelled = false;
    withParams((p) => globalSearch(p, q.trim()))
      .then((r) => { if (!cancelled) setHits(r); })
      .catch((err) => console.error(err));
    return () => { cancelled = true; };
  }, [ready, withParams, q]);

  const s = data?.stats;
  const fr = data?.fundraising;
  // Every tile links to the records behind the number. Built from the software
  // registry so the paths move with the routes rather than being retyped here.
  const R = (screen: string) => screenRoute('hestia', screen);

  return (
    <ForgeLayout
      title="Overview"
      subtitle="Case management for your organization — the people you serve, what they receive, and where the money comes from."
      error={error}
      loading={loading && !data}
      loadingLabel="Loading FORGE…"
    >
      <Card title="Find anyone">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clients, providers, funders, volunteers…"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 shadow-sm"
        />
        {hits.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-100">
            {hits.map((h) => (
              <li key={`${h.entity}-${h.id}`} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>
                  {h.entity === 'clients' ? (
                    <Link to={R(`clients/${h.id}`)} className="font-medium text-slate-900 hover:underline">
                      {h.label}
                    </Link>
                  ) : (
                    <span className="font-medium text-slate-900">{h.label}</span>
                  )}
                  {h.detail && <span className="ml-2 text-slate-500">{h.detail}</span>}
                </span>
                <Pill>{h.entity}</Pill>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {s && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Clients" value={s.clients.toLocaleString()} to={R('clients')} />
          <StatTile label="Active assistance" value={s.active_assistance.toLocaleString()} hint={money(s.total_assistance_value) + ' awarded all time'} to={R('assistance')} />
          <StatTile label="Active services" value={s.active_services.toLocaleString()} hint={moneyExact(s.active_monthly_cost) + ' / month'} to={R('services')} />
          <StatTile label="Providers" value={s.providers.toLocaleString()} to={R('providers')} />
          <StatTile label="Funders" value={s.funders.toLocaleString()} to={R('funders')} />
          <StatTile label="Volunteers" value={s.volunteers.toLocaleString()} to={R('volunteers')} />
          {s.needs_review > 0 && (
            <StatTile
              label="Needs review"
              value={s.needs_review.toLocaleString()}
              tone="warn"
              hint="Services whose assistance link could not be confirmed during migration"
              // Straight to the flagged rows, not the full services list.
              to={`${R('services')}?needs_review=1`}
            />
          )}
        </div>
      )}

      {/* Fundraising sits on the same page as the program work, because the
          two halves are the same organization and a director should not have
          to know which screen holds which number. */}
      {fr && fr.fiscal_year !== null && (
        <Card title={`Fundraising — FY${fr.fiscal_year}`}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Raised this year"
              value={money(fr.raised_this_fy)}
              hint={fr.year_over_year_percent === null
                // Nothing had come in this far into last year, so a percentage
                // would be division by zero. The prior year's total is shown
                // instead rather than leaving the tile without context.
                ? `${fr.donors_this_fy} donors · FY${(fr.fiscal_year ?? 1) - 1} finished at ${money(fr.raised_last_fy)}`
                : `${fr.donors_this_fy} donors · ${fr.year_over_year_percent >= 0 ? '+' : ''}${fr.year_over_year_percent}% on the same point in FY${(fr.fiscal_year ?? 1) - 1}`}
            to={R('donations')}
              />
            <StatTile
              label="Acknowledgements due"
              value={fr.acknowledgements_outstanding.toLocaleString()}
              tone={fr.acknowledgements_outstanding > 0 ? 'warn' : 'default'}
              hint="Gifts of $250+ with no written acknowledgement"
            to={R('acknowledgements')}
              />
            <StatTile
              label="Pledges outstanding"
              value={money(fr.pledges_outstanding)}
              hint="Promised but not yet received"
            to={R('pledges')}
              />
            <StatTile
              label="Recurring donors"
              value={fr.active_recurring.toLocaleString()}
              tone={fr.failed_recurring > 0 ? 'warn' : 'default'}
              hint={fr.failed_recurring > 0
                ? `${fr.failed_recurring} failed and need attention`
                : 'all collecting normally'}
            to={R('recurring')}
              />
            <StatTile
              label="Lapsed donors"
              value={fr.lapsed_donors.toLocaleString()}
              hint="Gave before, not this year"
            to={`${R('reports')}`}
              />
            <StatTile
              label="Grants pending"
              value={fr.grants_pending.toLocaleString()}
              hint="Applied, awaiting a decision"
            to={R('applications')}
              />
            <StatTile
              label="Grant reports due"
              value={fr.grant_reports_due.toLocaleString()}
              tone={fr.grant_reports_due > 0 ? 'warn' : 'default'}
              hint="Due within 60 days"
            to={R('applications')}
              />
            <StatTile
              label="People served"
              value={fr.people_served_all_time.toLocaleString()}
              hint="All time"
            to={R('clients')}
              />
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Services delivered by type">
          {!data?.servicesByType.length ? <EmptyState>No services recorded.</EmptyState> : (
            <ul className="space-y-2">
              {data.servicesByType.map((row) => {
                const max = Math.max(...data.servicesByType.map((r) => r.n));
                return (
                  <li key={row.provider_type} className="text-sm">
                    <div className="flex justify-between text-slate-700">
                      <span>{row.provider_type}</span>
                      <span className="font-medium">{row.n}</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-slate-100">
                      <div className="h-2 rounded-full bg-slate-800" style={{ width: `${(row.n / max) * 100}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Recent funding applications">
          {!data?.recentApplications.length ? <EmptyState>No applications recorded.</EmptyState> : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">Funder</th>
                    <th className="px-3 py-2">Applied</th>
                    <th className="px-3 py-2">Decision</th>
                    <th className="px-3 py-2">Applied for</th>
                    <th className="px-3 py-2">Awarded</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentApplications.map((a) => (
                    <tr key={String(a.application_id)} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2 text-slate-800">{a.funder_name ?? '—'}</td>
                      <td className="px-3 py-2 text-slate-700">{shortDate(a.applied_date)}</td>
                      <td className="px-3 py-2"><Pill tone={statusTone(a.decision_type)}>{a.decision_type ?? '—'}</Pill></td>
                      <td className="px-3 py-2 text-slate-700">{moneyExact(a.amount_applied_for)}</td>
                      <td className="px-3 py-2 text-slate-700">{moneyExact(a.amount_awarded)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </ForgeLayout>
  );
}
