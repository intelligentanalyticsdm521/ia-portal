/**
 * ForgePersonDetailPage — the whole relationship with one person.
 *
 * The point of the person record is that a donor who also volunteers and sits
 * on the board is ONE person, not three. So this page shows the roles together
 * and the giving history under them, rather than making someone open three
 * screens and add the numbers up themselves.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  addNote, addPersonRole, endPersonRole, getActivity, getEntityRow, getNotes,
  getPersonRoles, listEntity, runReport,
  type ActivityRow, type NoteRow, type PersonRole,
} from '../../lib/forgeApi';
import { Button, Card, EmptyState, ForgeLayout, Pill, StatTile } from './ForgeLayout';
import { moneyExact, shortDate } from './forgeConfig';
import { describeError, useForgeApi } from './useForge';
import { screenRoute } from './forgeSoftware';

interface PersonRow extends Record<string, unknown> {
  person_id: number;
  full_name: string;
  organization: string | null;
  email: string | null;
  phone: string | null;
  street: string | null;
  city: string | null;
  state_province: string | null;
  postal_code: string | null;
  do_not_contact: boolean;
  deceased: boolean;
}

interface GiftRow {
  donation_id: number;
  received_on: string;
  amount: number;
  deductible_amount: number;
  campaign_name: string | null;
  payment_method: string | null;
  status: string;
  gift_kind: string;
}

interface DonorSummaryRow {
  gift_count: number;
  lifetime_total: number;
  average_gift: number;
  largest_gift: number;
  first_gift_on: string;
  last_gift_on: string;
  days_since_last_gift: number;
  is_recurring_donor: number;
}

const ROLE_LABEL: Record<string, string> = {
  client: 'Client', donor: 'Donor', volunteer: 'Volunteer',
  funder_contact: 'Funder contact', board: 'Board', staff: 'Staff', prospect: 'Prospect',
};

export function ForgePersonDetailPage({ recordId }: { recordId?: string } = {}) {
  /* The id arrives as a PROP from ForgeSoftwareRouter. These pages used to
     read useParams().id, which worked when each had its own
     services/forge_x/:id route. They now sit under a splat
     (forge/:software/*), where there is no :id param — so id was
     undefined, the fetch guard returned early, and the page sat on
     "Loading…" forever. useParams stays as a fallback for direct routing. */
  const params = useParams<{ id: string }>();
  const id = recordId ?? params.id;
  const { ready, withParams } = useForgeApi();
  const [person, setPerson] = useState<PersonRow | null>(null);
  const [roles, setRoles] = useState<PersonRole[]>([]);
  const [available, setAvailable] = useState<string[]>([]);
  const [gifts, setGifts] = useState<GiftRow[]>([]);
  const [summary, setSummary] = useState<DonorSummaryRow | null>(null);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [noteText, setNoteText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!ready || !id) return;
    let cancelled = false;
    setLoading(true); setError(null);
    Promise.all([
      withParams((p) => getEntityRow<PersonRow>(p, 'people', id)),
      withParams((p) => getPersonRoles(p, id)),
      withParams((p) => listEntity<GiftRow>(p, 'donations', { person_id: id, pageSize: 200 })),
      withParams((p) => runReport<DonorSummaryRow>(p, 'donor-summary', { personId: Number(id) })),
      withParams((p) => getNotes(p, 'people', id)),
      withParams((p) => getActivity(p, 'people', id)),
    ])
      .then(([pr, r, g, s, n, a]) => {
        if (cancelled) return;
        setPerson(pr);
        setRoles(r.data);
        setAvailable(r.available);
        setGifts(g.data);
        setSummary(s.data[0] ?? null);
        setNotes(n);
        setActivity(a);
      })
      .catch((err) => { if (!cancelled) setError(describeError(err, 'this person')); console.error(err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ready, withParams, id, refreshKey]);

  const activeRoles = useMemo(() => roles.filter((r) => !r.ended_at), [roles]);
  const pastRoles = useMemo(() => roles.filter((r) => r.ended_at), [roles]);
  const addable = available.filter((a) => !activeRoles.some((r) => r.role_key === a));

  const toggleRole = useCallback(async (roleKey: string, add: boolean) => {
    if (!id) return;
    try {
      // Adding and ending return different shapes; neither result is used here.
      await withParams(async (p) => {
        if (add) await addPersonRole(p, id, roleKey);
        else await endPersonRole(p, id, roleKey);
      });
      setRefreshKey((k) => k + 1);
    } catch (err) { setError(describeError(err, 'this role')); console.error(err); }
  }, [withParams, id]);

  const submitNote = useCallback(async () => {
    if (!id || !noteText.trim()) return;
    try {
      await withParams((p) => addNote(p, 'people', id, noteText.trim()));
      setNoteText('');
      setRefreshKey((k) => k + 1);
    } catch (err) { setError(describeError(err, 'this note')); console.error(err); }
  }, [withParams, id, noteText]);

  return (
    <ForgeLayout
      title={person?.full_name ?? 'Person'}
      subtitle={person?.organization ?? undefined}
      loading={loading}
      loadingLabel="Loading person…"
      error={error}
      actions={<Link to={screenRoute('hestia', 'people')}><Button>← All people</Button></Link>}
    >
      {person && (
        <>
          <Card title="Roles">
            <div className="flex flex-wrap items-center gap-2">
              {activeRoles.length === 0 && <span className="text-sm text-slate-500">No roles yet.</span>}
              {activeRoles.map((r) => (
                <span key={r.person_role_id} className="inline-flex items-center gap-1 rounded-full bg-slate-900 py-0.5 pl-3 pr-1 text-xs font-medium text-white">
                  {ROLE_LABEL[r.role_key] ?? r.role_key}
                  <button
                    type="button"
                    aria-label={`End ${r.role_key} role`}
                    className="rounded-full px-1.5 text-slate-300 hover:text-white"
                    onClick={() => toggleRole(r.role_key, false)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            {addable.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500">Add:</span>
                {addable.map((a) => (
                  <Button key={a} onClick={() => toggleRole(a, true)}>{ROLE_LABEL[a] ?? a}</Button>
                ))}
              </div>
            )}
            {pastRoles.length > 0 && (
              // Ending a role keeps the history: someone who stops volunteering
              // has not stopped being a donor.
              <p className="mt-3 text-xs text-slate-500">
                Previously: {pastRoles.map((r) => `${ROLE_LABEL[r.role_key] ?? r.role_key} (ended ${shortDate(r.ended_at)})`).join(', ')}
              </p>
            )}
          </Card>

          {summary && (
            <div className="grid gap-4 sm:grid-cols-4">
              <StatTile label="Lifetime giving" value={moneyExact(summary.lifetime_total)} hint={`${summary.gift_count} gifts`} />
              <StatTile label="Average gift" value={moneyExact(summary.average_gift)} />
              <StatTile label="Largest gift" value={moneyExact(summary.largest_gift)} />
              <StatTile
                label="Last gift"
                value={shortDate(summary.last_gift_on)}
                hint={`${summary.days_since_last_gift} days ago${summary.is_recurring_donor ? ' · recurring donor' : ''}`}
                tone={summary.days_since_last_gift > 400 ? 'warn' : 'default'}
              />
            </div>
          )}

          <Card title="Contact">
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div><dt className="text-xs text-slate-500">Email</dt><dd className="text-slate-800">{person.email ?? '—'}</dd></div>
              <div><dt className="text-xs text-slate-500">Phone</dt><dd className="text-slate-800">{person.phone ?? '—'}</dd></div>
              <div>
                <dt className="text-xs text-slate-500">Address</dt>
                <dd className="text-slate-800">
                  {[person.street, person.city, person.state_province, person.postal_code].filter(Boolean).join(', ') || '—'}
                </dd>
              </div>
            </dl>
            {(person.do_not_contact || person.deceased) && (
              <div className="mt-3 flex gap-2">
                {person.do_not_contact && <Pill tone="red">Do not contact</Pill>}
                {person.deceased && <Pill>Deceased</Pill>}
              </div>
            )}
          </Card>

          <Card title={`Giving history (${gifts.length})`}>
            {gifts.length === 0 ? <EmptyState>No gifts recorded for this person.</EmptyState> : (
              <div className="-mx-5 overflow-x-auto px-5">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-4 font-semibold">Received</th>
                      <th className="py-2 pr-4 text-right font-semibold">Amount</th>
                      <th className="py-2 pr-4 text-right font-semibold">Deductible</th>
                      <th className="py-2 pr-4 font-semibold">Campaign</th>
                      <th className="py-2 pr-4 font-semibold">Method</th>
                      <th className="py-2 pr-4 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {gifts.map((g) => (
                      <tr key={g.donation_id} className="hover:bg-slate-50">
                        <td className="whitespace-nowrap py-2 pr-4">
                          <Link
                            to={screenRoute('hestia', `donations/${g.donation_id}`)}
                            className="font-medium text-slate-900 underline underline-offset-2"
                          >
                            {shortDate(g.received_on)}
                          </Link>
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums text-slate-700">{moneyExact(g.amount)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums text-slate-700">{moneyExact(g.deductible_amount)}</td>
                        <td className="py-2 pr-4 text-slate-600">{g.campaign_name ?? '—'}</td>
                        <td className="py-2 pr-4 text-slate-600">{g.payment_method ?? '—'}</td>
                        <td className="py-2 pr-4">
                          <Pill tone={g.status === 'received' ? 'green' : 'amber'}>{g.status}</Pill>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Notes" action={
            <div className="flex gap-2">
              <input
                className="w-64 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                placeholder="Add a note…"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
              />
              <Button onClick={submitNote} disabled={!noteText.trim()}>Add</Button>
            </div>
          }>
            {notes.length === 0 ? <EmptyState>No notes on this person.</EmptyState> : (
              <ul className="space-y-3">
                {notes.map((n) => (
                  <li key={n.note_id} className="border-l-2 border-slate-200 pl-3">
                    <p className="text-sm text-slate-700">{n.body}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{n.created_by ?? 'unknown'} · {shortDate(n.note_date)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="History">
            {activity.length === 0 ? <EmptyState>No changes recorded yet.</EmptyState> : (
              <ul className="space-y-2 text-sm">
                {activity.map((a) => (
                  <li key={a.activity_id} className="flex flex-wrap gap-x-2 text-slate-600">
                    <span className="text-slate-400">{new Date(a.occurred_at).toLocaleString()}</span>
                    <span className="font-medium text-slate-800">{a.actor ?? 'system'}</span>
                    <span>{a.action}{a.field_name ? ` ${a.field_name}` : ''}</span>
                    {a.old_value !== null && <span className="text-slate-400">from {a.old_value}</span>}
                    {a.new_value !== null && <span>to {a.new_value}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </ForgeLayout>
  );
}
