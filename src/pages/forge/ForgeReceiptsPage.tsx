/**
 * ForgeReceiptsPage — the acknowledgement queue and the receipting run.
 *
 * The shape of this screen follows the shape of the obligation: what is still
 * owed an acknowledgement, why each one is owed, and by when. Generating is
 * always preview-first, because a receipt goes out over the organization's
 * name and carries a tax consequence for the person receiving it.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  generateReceipts, getReceipt, listReceipts, runReport,
  type ReceiptGenerateResult, type ReceiptRow,
} from '../../lib/forgeApi';
import { ForgeLayout, Card, Button, EmptyState, Pill } from './ForgeLayout';
import { useForgeApi, describeError } from './useForge';
import { moneyExact, shortDate } from './forgeConfig';

interface DueRow {
  donation_id: number;
  tax_year: number;
  received_on: string;
  person_id: number;
  donor_name: string;
  donor_email: string | null;
  amount: number;
  non_deductible_value: number;
  deductible_amount: number;
  gift_kind: string;
  needs_written_ack: number;
  needs_quid_pro_quo_statement: number;
  reason: string;
  acknowledge_by: string;
}

export function ForgeReceiptsPage() {
  const { ready, withParams } = useForgeApi();
  const [due, setDue] = useState<DueRow[]>([]);
  const [issued, setIssued] = useState<ReceiptRow[]>([]);
  const [taxYear, setTaxYear] = useState(String(new Date().getFullYear()));
  const [kind, setKind] = useState<'per_gift' | 'year_end'>('per_gift');
  const [preview, setPreview] = useState<ReceiptGenerateResult | null>(null);
  const [viewing, setViewing] = useState<{ receipt_no: string; body: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      withParams((p) => runReport<DueRow>(p, 'receipts-due')),
      withParams((p) => listReceipts(p)),
    ])
      .then(([d, r]) => { if (!cancelled) { setDue(d.data); setIssued(r); } })
      .catch((err) => { if (!cancelled) setError(describeError(err, 'receipts')); console.error(err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ready, withParams, refresh]);

  const run = useCallback(async (asPreview: boolean) => {
    const year = Number(taxYear);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      setError('Enter a four-digit tax year.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await withParams((p) => generateReceipts(p, { taxYear: year, kind, preview: asPreview }));
      if (asPreview) {
        setPreview(r);
        if (r.receipts.length === 0) setNotice(`Nothing outstanding for ${year}.`);
      } else {
        setPreview(null);
        setNotice(
          r.generated === 0
            ? `Nothing new to issue for ${year}.`
            : `Issued ${r.generated} receipt${r.generated === 1 ? '' : 's'}${r.skipped ? `, skipped ${r.skipped} already receipted` : ''}.`
        );
        setRefresh((k) => k + 1);
      }
    } catch (err) {
      setError(describeError(err, 'the receipting run'));
      console.error(err);
    } finally {
      setBusy(false);
    }
  }, [withParams, taxYear, kind]);

  const openReceipt = useCallback(async (id: number) => {
    try {
      const r = await withParams((p) => getReceipt(p, id));
      setViewing({ receipt_no: r.receipt_no, body: r.body_snapshot });
    } catch (err) {
      setError(describeError(err, 'that receipt'));
      console.error(err);
    }
  }, [withParams]);

  const ackCount = due.filter((d) => d.needs_written_ack === 1).length;
  const qpqCount = due.filter((d) => d.needs_quid_pro_quo_statement === 1).length;

  return (
    <ForgeLayout
      title="Acknowledgements"
      subtitle="Written acknowledgements and year-end giving statements, to the IRS rules."
      loading={loading}
      loadingLabel="Loading the acknowledgement queue…"
      error={error}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Outstanding</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{due.length}</div>
          <div className="mt-1 text-xs text-slate-500">gifts with no acknowledgement yet</div>
        </div>
        <div className={`rounded-xl border px-4 py-3 ${ackCount ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Required by law</div>
          <div className={`mt-1 text-2xl font-semibold ${ackCount ? 'text-amber-800' : 'text-slate-900'}`}>{ackCount}</div>
          <div className="mt-1 text-xs text-slate-500">single gifts of $250 or more</div>
        </div>
        <div className={`rounded-xl border px-4 py-3 ${qpqCount ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quid pro quo</div>
          <div className={`mt-1 text-2xl font-semibold ${qpqCount ? 'text-amber-800' : 'text-slate-900'}`}>{qpqCount}</div>
          <div className="mt-1 text-xs text-slate-500">gifts over $75 where something was received</div>
        </div>
      </div>

      <Card title="Issue acknowledgements">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-medium text-slate-600">
            <span className="mb-1 block">Tax year</span>
            <input
              className="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-900"
              value={taxYear}
              onChange={(e) => setTaxYear(e.target.value)}
            />
          </label>
          <label className="text-xs font-medium text-slate-600">
            <span className="mb-1 block">Kind</span>
            <select
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-900"
              value={kind}
              onChange={(e) => setKind(e.target.value as 'per_gift' | 'year_end')}
            >
              <option value="per_gift">One per gift</option>
              <option value="year_end">One annual statement per donor</option>
            </select>
          </label>
          <Button onClick={() => run(true)} disabled={busy}>Preview</Button>
          <Button variant="primary" onClick={() => run(false)} disabled={busy}>
            {busy ? 'Working…' : 'Issue'}
          </Button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Acknowledgements must reach the donor before they file — in practice by 31 January.
          Preview renders the exact wording without issuing anything or using a receipt number.
        </p>
        {notice && <div className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{notice}</div>}
      </Card>

      {preview && preview.receipts.length > 0 && (
        <Card title={`Preview — ${preview.receipts.length} acknowledgement${preview.receipts.length === 1 ? '' : 's'} would be issued`}>
          <div className="space-y-3">
            {preview.receipts.slice(0, 3).map((r, i) => (
              <details key={i} className="rounded-lg border border-slate-200" open={i === 0}>
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-800">
                  {r.donor_name} · {moneyExact(r.total_amount)}
                  {r.gift_count && r.gift_count > 1 ? ` · ${r.gift_count} gifts` : ''}
                </summary>
                <pre className="overflow-x-auto whitespace-pre-wrap border-t border-slate-100 px-3 py-3 text-xs leading-relaxed text-slate-700">
                  {r.body}
                </pre>
              </details>
            ))}
            {preview.receipts.length > 3 && (
              <p className="text-xs text-slate-500">
                Showing the first 3 of {preview.receipts.length}. All of them use the same wording.
              </p>
            )}
          </div>
        </Card>
      )}

      <Card title="Outstanding">
        {due.length === 0 ? (
          <EmptyState>Every gift on record has been acknowledged.</EmptyState>
        ) : (
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4 font-semibold">Donor</th>
                  <th className="py-2 pr-4 font-semibold">Received</th>
                  <th className="py-2 pr-4 text-right font-semibold">Amount</th>
                  <th className="py-2 pr-4 text-right font-semibold">Deductible</th>
                  <th className="py-2 pr-4 font-semibold">Why</th>
                  <th className="py-2 pr-4 font-semibold">Needed by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {due.map((d) => (
                  <tr key={d.donation_id} className="hover:bg-slate-50">
                    <td className="py-2 pr-4 font-medium text-slate-800">{d.donor_name}</td>
                    <td className="whitespace-nowrap py-2 pr-4 text-slate-600">{shortDate(d.received_on)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-slate-700">{moneyExact(d.amount)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-slate-700">
                      {/* The organisation does not value donated property, so
                          no deductible figure is shown for a non-cash gift. */}
                      {d.gift_kind === 'in_kind'
                        ? <span className="text-slate-400" title="The donor determines the value of donated property">—</span>
                        : moneyExact(d.deductible_amount)}
                    </td>
                    <td className="py-2 pr-4">
                      {d.gift_kind === 'in_kind' ? <Pill>Non-cash</Pill>
                        : d.needs_quid_pro_quo_statement === 1 ? <Pill tone="amber">Quid pro quo</Pill>
                          : d.needs_written_ack === 1 ? <Pill tone="amber">Required</Pill>
                            : <Pill>Courtesy</Pill>}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-4 text-slate-600">{shortDate(d.acknowledge_by)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={`Issued (${issued.length})`}>
        {issued.length === 0 ? (
          <EmptyState>No acknowledgements have been issued yet.</EmptyState>
        ) : (
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4 font-semibold">Number</th>
                  <th className="py-2 pr-4 font-semibold">Donor</th>
                  <th className="py-2 pr-4 font-semibold">Kind</th>
                  <th className="py-2 pr-4 text-right font-semibold">Total</th>
                  <th className="py-2 pr-4 text-right font-semibold">Deductible</th>
                  <th className="py-2 pr-4 font-semibold">Issued</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {issued.map((r) => (
                  <tr key={r.receipt_id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap py-2 pr-4 font-mono text-xs text-slate-700">{r.receipt_no}</td>
                    <td className="py-2 pr-4 font-medium text-slate-800">{r.donor_name}</td>
                    <td className="py-2 pr-4 text-slate-600">
                      {r.receipt_kind === 'year_end' ? 'Annual statement' : 'Per gift'}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums text-slate-700">{moneyExact(r.total_amount)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-slate-700">{moneyExact(r.deductible_amount)}</td>
                    <td className="whitespace-nowrap py-2 pr-4 text-slate-600">
                      {r.issued_at ? new Date(r.issued_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      <Button onClick={() => openReceipt(r.receipt_id)}>View</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {viewing && (
        <Card
          title={`Acknowledgement ${viewing.receipt_no}`}
          action={<Button onClick={() => setViewing(null)}>Close</Button>}
        >
          {/* Exactly what was sent, kept for the audit trail. */}
          <pre className="overflow-x-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
            {viewing.body}
          </pre>
        </Card>
      )}
    </ForgeLayout>
  );
}
