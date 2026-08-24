/**
 * ForgeDonationDetailPage — one gift, its designations, and its history.
 *
 * The designation editor is the reason this page exists. Splitting a gift
 * across funds is the operation most likely to be got wrong, and the one whose
 * errors surface a year later in a fund balance nobody can reconcile. So the
 * split is shown adding up, or not, before it can be saved.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  addNote, getActivity, getDesignations, getEntityRow, getNotes, listEntity,
  saveDesignations, type ActivityRow, type Designation, type NoteRow,
} from '../../lib/forgeApi';
import { Button, Card, EmptyState, ForgeLayout, Pill, StatTile } from './ForgeLayout';
import { moneyExact, shortDate } from './forgeConfig';
import { describeError, useForgeApi } from './useForge';

interface DonationRow extends Record<string, unknown> {
  donation_id: number;
  person_id: number;
  donor_name: string;
  donor_email: string | null;
  received_on: string;
  amount: number;
  non_deductible_value: number;
  deductible_amount: number;
  gift_kind: string;
  in_kind_description: string | null;
  payment_method: string | null;
  status: string;
  campaign_name: string | null;
  check_number: string | null;
  processor: string | null;
  processor_fee: number | null;
  notes: string | null;
  is_anonymous: boolean;
}

interface FundRow { fund_id: number; name: string; restriction: string }

export function ForgeDonationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { ready, withParams } = useForgeApi();
  const [gift, setGift] = useState<DonationRow | null>(null);
  const [funds, setFunds] = useState<FundRow[]>([]);
  const [rows, setRows] = useState<Designation[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [noteText, setNoteText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!ready || !id) return;
    let cancelled = false;
    setLoading(true); setError(null);
    Promise.all([
      withParams((p) => getEntityRow<DonationRow>(p, 'donations', id)),
      withParams((p) => getDesignations(p, id)),
      withParams((p) => listEntity<FundRow>(p, 'funds', { pageSize: 200 })),
      withParams((p) => getNotes(p, 'donations', id)),
      withParams((p) => getActivity(p, 'donations', id)),
    ])
      .then(([g, d, f, n, a]) => {
        if (cancelled) return;
        setGift(g);
        setRows(d.map((x) => ({ fund_id: Number(x.fund_id), amount: Number(x.amount), fund_name: x.fund_name })));
        setFunds(f.data);
        setNotes(n);
        setActivity(a);
      })
      .catch((err) => { if (!cancelled) setError(describeError(err, 'this donation')); console.error(err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ready, withParams, id, refreshKey]);

  const designated = useMemo(() => rows.reduce((s, r) => s + (Number(r.amount) || 0), 0), [rows]);
  const giftAmount = Number(gift?.amount ?? 0);
  const difference = Math.round((giftAmount - designated) * 100) / 100;
  const reconciles = Math.abs(difference) < 0.005 && rows.length > 0 && rows.every((r) => Number(r.amount) > 0);

  const save = useCallback(async () => {
    if (!id) return;
    setSaving(true); setError(null); setSaved(null);
    try {
      await withParams((p) => saveDesignations(p, id, rows.map((r) => ({ fund_id: Number(r.fund_id), amount: Number(r.amount) }))));
      setSaved('Designations saved.');
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(describeError(err, 'these designations'));
      console.error(err);
    } finally { setSaving(false); }
  }, [withParams, id, rows]);

  const submitNote = useCallback(async () => {
    if (!id || !noteText.trim()) return;
    try {
      await withParams((p) => addNote(p, 'donations', id, noteText.trim()));
      setNoteText('');
      setRefreshKey((k) => k + 1);
    } catch (err) { setError(describeError(err, 'this note')); console.error(err); }
  }, [withParams, id, noteText]);

  const unusedFund = funds.find((f) => !rows.some((r) => Number(r.fund_id) === Number(f.fund_id)));

  return (
    <ForgeLayout
      title={gift ? `${moneyExact(gift.amount)} from ${gift.donor_name}` : 'Donation'}
      subtitle={gift ? `Received ${shortDate(gift.received_on)}${gift.campaign_name ? ` · ${gift.campaign_name}` : ''}` : undefined}
      loading={loading}
      loadingLabel="Loading donation…"
      error={error}
      actions={<Link to="/app/services/forge_donations"><Button>← All donations</Button></Link>}
    >
      {gift && (
        <>
          {saved && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{saved}</div>}

          <div className="grid gap-4 sm:grid-cols-4">
            <StatTile label="Amount" value={moneyExact(gift.amount)} />
            <StatTile
              label="Deductible"
              value={moneyExact(gift.deductible_amount)}
              hint={Number(gift.non_deductible_value) > 0
                ? `${moneyExact(gift.non_deductible_value)} of goods or services received`
                : 'No goods or services provided'}
            />
            <StatTile label="Method" value={gift.payment_method ?? '—'} hint={gift.check_number ? `Check ${gift.check_number}` : undefined} />
            <StatTile
              label="Processing fee"
              value={gift.processor_fee ? moneyExact(gift.processor_fee) : '—'}
              hint={gift.processor ? `via ${gift.processor}` : undefined}
            />
          </div>

          {Number(gift.non_deductible_value) > 0 && Number(gift.amount) > 75 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              This is a quid pro quo contribution over $75. The IRS requires a written statement
              telling the donor that only {moneyExact(gift.deductible_amount)} of it is deductible.
            </div>
          )}

          {gift.gift_kind === 'in_kind' && (
            <Card title="In-kind gift">
              <p className="text-sm text-slate-700">{gift.in_kind_description ?? 'No description recorded.'}</p>
              <p className="mt-2 text-xs text-slate-500">
                The organization describes donated property but does not assign it a value —
                valuing it is the donor's responsibility.
              </p>
            </Card>
          )}

          <Card
            title="Designations"
            action={
              <div className="flex gap-2">
                {unusedFund && (
                  <Button onClick={() => setRows((cur) => [...cur, { fund_id: unusedFund.fund_id, amount: 0 }])}>
                    Add fund
                  </Button>
                )}
                <Button variant="primary" onClick={save} disabled={!reconciles || saving}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            }
          >
            {rows.length === 0 ? (
              <EmptyState>This gift has not been designated to a fund.</EmptyState>
            ) : (
              <div className="space-y-2">
                {rows.map((r, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <select
                      className="min-w-[14rem] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
                      value={r.fund_id}
                      onChange={(e) => setRows((cur) => cur.map((x, j) =>
                        j === i ? { ...x, fund_id: Number(e.target.value) } : x))}
                    >
                      {funds.map((f) => (
                        <option key={f.fund_id} value={f.fund_id}>
                          {f.name}{f.restriction !== 'unrestricted' ? ' (restricted)' : ''}
                        </option>
                      ))}
                    </select>
                    <input
                      className="w-32 rounded-lg border border-slate-200 px-3 py-2 text-right text-sm tabular-nums text-slate-900"
                      value={r.amount}
                      inputMode="decimal"
                      onChange={(e) => setRows((cur) => cur.map((x, j) =>
                        j === i ? { ...x, amount: e.target.value as unknown as number } : x))}
                    />
                    <Button variant="danger" onClick={() => setRows((cur) => cur.filter((_, j) => j !== i))}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* The running total, always visible, so a split can never be
                saved in a state that would silently break fund reporting. */}
            <div className={`mt-4 rounded-lg px-3 py-2 text-sm ${
              reconciles ? 'bg-emerald-50 text-emerald-800'
                : rows.length === 0 ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-800'
            }`}>
              Designated {moneyExact(designated)} of {moneyExact(giftAmount)}
              {reconciles ? ' — balanced.'
                : difference > 0 ? ` — ${moneyExact(difference)} still undesignated.`
                  : ` — over by ${moneyExact(Math.abs(difference))}.`}
            </div>
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
            {notes.length === 0 ? <EmptyState>No notes on this gift.</EmptyState> : (
              <ul className="space-y-3">
                {notes.map((n) => (
                  <li key={n.note_id} className="border-l-2 border-slate-200 pl-3">
                    <p className="text-sm text-slate-700">{n.body}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {n.created_by ?? 'unknown'} · {shortDate(n.note_date) }
                    </p>
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

          <Card title="Donor">
            <div className="flex flex-wrap items-center gap-3">
              <Link
                to={`/app/services/forge_people/${gift.person_id}`}
                className="text-sm font-medium text-slate-900 underline underline-offset-2"
              >
                {gift.donor_name}
              </Link>
              {gift.donor_email && <span className="text-sm text-slate-600">{gift.donor_email}</span>}
              <Pill tone={gift.status === 'received' ? 'green' : 'amber'}>{gift.status}</Pill>
              {gift.is_anonymous && <Pill>Anonymous</Pill>}
            </div>
          </Card>
        </>
      )}
    </ForgeLayout>
  );
}
