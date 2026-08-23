import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDashboard, globalSearch, type DashboardResponse } from '../../lib/forgeApi';
import { Card, EmptyState, ForgeLayout, Pill, StatTile, statusTone } from './ForgeLayout';
import { money, moneyExact, shortDate } from './forgeConfig';
import { describeError, useDebounced, useForgeApi } from './useForge';

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
                    <Link to={`/app/services/forge_clients/${h.id}`} className="font-medium text-slate-900 hover:underline">
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
          <StatTile label="Clients" value={s.clients.toLocaleString()} />
          <StatTile label="Active assistance" value={s.active_assistance.toLocaleString()} hint={money(s.total_assistance_value) + ' awarded all time'} />
          <StatTile label="Active services" value={s.active_services.toLocaleString()} hint={moneyExact(s.active_monthly_cost) + ' / month'} />
          <StatTile label="Providers" value={s.providers.toLocaleString()} />
          <StatTile label="Funders" value={s.funders.toLocaleString()} />
          <StatTile label="Volunteers" value={s.volunteers.toLocaleString()} />
          {s.needs_review > 0 && (
            <StatTile
              label="Needs review"
              value={s.needs_review.toLocaleString()}
              tone="warn"
              hint="Services whose assistance link could not be confirmed during migration"
            />
          )}
        </div>
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
