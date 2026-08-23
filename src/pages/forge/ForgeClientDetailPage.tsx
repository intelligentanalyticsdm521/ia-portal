/**
 * The 360° client view — the screen the legacy app couldn't produce and
 * bolted on as three separate report pages (v_person_allup, v_person_grant,
 * v_person_app_history). One page, one request.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { addNote, getClientOverview, type ClientOverview } from '../../lib/forgeApi';
import { Button, Card, EmptyState, ForgeLayout, Pill, StatTile, statusTone } from './ForgeLayout';
import { money, moneyExact, shortDate } from './forgeConfig';
import { describeError, useForgeApi } from './useForge';

export function ForgeClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { ready, withParams } = useForgeApi();
  const [data, setData] = useState<ClientOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!ready || !id) return;
    let cancelled = false;
    setLoading(true); setError(null);
    withParams((p) => getClientOverview(p, id))
      .then((r) => { if (!cancelled) setData(r); })
      .catch((err) => { if (!cancelled) setError(describeError(err, 'this client')); console.error(err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ready, withParams, id, refreshKey]);

  const submitNote = useCallback(async () => {
    if (!id || !noteText.trim()) return;
    setSavingNote(true);
    try {
      await withParams((p) => addNote(p, 'clients', id, noteText.trim()));
      setNoteText('');
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(describeError(err, 'this note'));
      console.error(err);
    } finally { setSavingNote(false); }
  }, [withParams, id, noteText]);

  const c = data?.client as Record<string, unknown> | undefined;
  const name = (c?.full_name as string) ?? 'Client';

  return (
    <ForgeLayout
      title={name}
      subtitle={[c?.city, c?.state_province].filter(Boolean).join(', ') || undefined}
      error={error}
      loading={loading && !data}
      loadingLabel="Loading client…"
      actions={<Link to="/app/services/forge_clients"><Button>← All clients</Button></Link>}
    >
      {data && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Total awarded" value={money(data.totals?.total_assistance)} hint={`${data.totals?.assistance_count ?? 0} assistance(s)`} />
            <StatTile label="Assistance" value={data.assistance.length} />
            <StatTile label="Services" value={data.services.length} />
            <StatTile label="Notes" value={data.notes.length} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Card title="Assistance">
                {!data.assistance.length ? <EmptyState>No assistance recorded.</EmptyState> : (
                  <Table
                    head={['Status', 'Start', 'End', 'Value', 'GL ref']}
                    rows={data.assistance.map((a) => [
                      <Pill tone={statusTone(a.status as string)}>{(a.status as string) ?? '—'}</Pill>,
                      shortDate(a.start_date), shortDate(a.end_date),
                      moneyExact(a.value_amount), (a.gl_reference as string) ?? '—',
                    ])}
                  />
                )}
              </Card>

              <Card title="Service services">
                {!data.services.length ? <EmptyState>No services recorded.</EmptyState> : (
                  <Table
                    head={['Provider', 'Type', 'Status', 'Start', 'End', 'Payment', 'Est. monthly']}
                    rows={data.services.map((e) => [
                      <span>
                        {(e.provider_name as string) ?? '—'}
                        {Boolean(e.needs_review) && <span className="ml-2"><Pill tone="amber">Needs review</Pill></span>}
                      </span>,
                      (e.service_type as string) ?? '—',
                      <Pill tone={statusTone(e.status as string)}>{(e.status as string) ?? '—'}</Pill>,
                      shortDate(e.start_date), shortDate(e.end_date),
                      [e.payment_frequency, e.payment_method].filter(Boolean).join(' · ') || '—',
                      moneyExact(e.estimated_monthly_cost),
                    ])}
                  />
                )}
              </Card>

              {data.relationships.length > 0 && (
                <Card title="Relationships">
                  <Table
                    head={['Name', 'Relationship']}
                    rows={data.relationships.map((r) => [
                      (r.related_name as string) ?? '—', (r.relationship as string) ?? '—',
                    ])}
                  />
                </Card>
              )}
            </div>

            <div className="space-y-6">
              <Card title="Contact">
                <dl className="space-y-2 text-sm">
                  <Row label="Phone" value={c?.phone as string} />
                  <Row label="Email" value={c?.email as string} />
                  <Row label="Street" value={c?.street as string} />
                  <Row label="City" value={c?.city as string} />
                  <Row label="State" value={c?.state_province as string} />
                  <Row label="ZIP" value={c?.postal_code as string} />
                  <Row label="County" value={c?.county as string} />
                  <Row label="Also known as" value={c?.additional_names as string} />
                </dl>
              </Card>

              <Card title={`Notes (${data.notes.length})`}>
                <div className="mb-4">
                  <textarea
                    rows={3}
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Add a note…"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 shadow-sm"
                  />
                  <div className="mt-2 flex justify-end">
                    <Button variant="primary" onClick={submitNote} disabled={savingNote || !noteText.trim()}>
                      {savingNote ? 'Saving…' : 'Add note'}
                    </Button>
                  </div>
                </div>
                {!data.notes.length ? <EmptyState>No notes yet.</EmptyState> : (
                  <ul className="max-h-96 space-y-3 overflow-y-auto">
                    {data.notes.map((n) => (
                      <li key={n.note_id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                        <div className="whitespace-pre-wrap text-sm text-slate-800">{n.body || '—'}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {shortDate(n.note_date ?? n.created_at)}
                          {n.updated_by ? ` · ${n.updated_by}` : ''}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card title="Activity">
                {!data.activity.length ? <EmptyState>No activity recorded.</EmptyState> : (
                  <ul className="max-h-80 space-y-2 overflow-y-auto text-sm">
                    {data.activity.map((a) => (
                      <li key={a.activity_id} className="border-b border-slate-100 pb-2 last:border-0">
                        <span className="font-medium text-slate-800">{a.action}</span>
                        {a.field_name && (
                          <span className="text-slate-600">
                            {' '}— {a.field_name}: <span className="line-through">{a.old_value ?? '—'}</span> → {a.new_value ?? '—'}
                          </span>
                        )}
                        <div className="text-xs text-slate-500">
                          {shortDate(a.occurred_at)}{a.actor ? ` · ${a.actor}` : ''}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        </>
      )}
    </ForgeLayout>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right text-slate-800">{value || '—'}</dd>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            {head.map((h) => <th key={h} className="px-3 py-2">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-100 last:border-0">
              {r.map((cell, j) => <td key={j} className="px-3 py-2 text-slate-700">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
