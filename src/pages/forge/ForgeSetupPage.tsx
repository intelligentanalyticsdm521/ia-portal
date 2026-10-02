/**
 * ForgeSetupPage — organization details, fiscal year, receipt wording and
 * payment setup.
 *
 * These four things decide whether the rest of the product is correct rather
 * than merely working: the fiscal year decides what "this year" means in every
 * report, the legal name and EIN decide whether a receipt is valid, and the
 * charity-rate status decides what every card gift costs.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  getOrgSettings, getPaymentAccount, listFinancialImports, saveOrgSettings, savePaymentAccount,
  type FinancialImportRow, type OrgSettings, type PaymentAccountResponse,
} from '../../lib/forgeApi';
import { ForgeLayout, Card, Button, EmptyState, Pill } from './ForgeLayout';
import { ForgeExportButton } from './ForgeExportButton';
import { csvBlankIfDash, csvFilename, downloadCsv, toCsvText } from './forgeCsv';
import { useForgeApi, describeError } from './useForge';
import { shortDate } from './forgeConfig';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/* Setup is a form, not a list screen, with one exception: the import log at the
   foot of it. It is a list on a nav page, so it exports like every other one —
   the period split into two columns because a spreadsheet wants two dates where
   the table wants one cell. */
const IMPORT_COLUMNS = [
  { label: 'Period start', value: (i: FinancialImportRow) => csvBlankIfDash(shortDate(i.period_start)) },
  { label: 'Period end', value: (i: FinancialImportRow) => csvBlankIfDash(shortDate(i.period_end)) },
  { label: 'Label', value: (i: FinancialImportRow) => i.label ?? '' },
  { label: 'Source', value: (i: FinancialImportRow) => i.source },
  { label: 'Lines', value: (i: FinancialImportRow) => String(i.line_count) },
];

const fyLabel = (m: number) => {
  if (m === 1) return 'Calendar year — 1 January to 31 December.';
  const end = MONTHS[(m + 10) % 12];
  return `1 ${MONTHS[m - 1]} to the last day of ${end}, labelled by the year it ends in.`;
};

function Field({ label, value, onChange, hint, wide, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void;
  hint?: string; wide?: boolean; type?: string;
}) {
  return (
    <label className={wide ? 'sm:col-span-2' : ''}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <input
        type={type}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function ForgeSetupPage() {
  const { ready, withParams } = useForgeApi();
  const [settings, setSettings] = useState<Partial<OrgSettings>>({});
  const [configured, setConfigured] = useState(false);
  const [payment, setPayment] = useState<PaymentAccountResponse | null>(null);
  const [imports, setImports] = useState<FinancialImportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    Promise.all([
      withParams(getOrgSettings),
      withParams(getPaymentAccount),
      withParams(listFinancialImports),
    ])
      .then(([s, p, i]) => {
        if (cancelled) return;
        setConfigured(s.configured);
        setSettings(s.data ?? { fiscal_year_start_month: 1, receipt_prefix: 'R' });
        setPayment(p);
        setImports(i);
      })
      .catch((err) => { if (!cancelled) setError(describeError(err, 'your organization settings')); console.error(err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ready, withParams]);

  const set = useCallback(<K extends keyof OrgSettings>(k: K, v: OrgSettings[K]) => {
    setSettings((cur) => ({ ...cur, [k]: v }));
    setSaved(null);
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await withParams((p) => saveOrgSettings(p, settings));
      setSettings(r.data);
      setConfigured(true);
      setSaved('Saved.');
    } catch (err) {
      setError(describeError(err, 'your organization settings'));
      console.error(err);
    } finally {
      setSaving(false);
    }
  }, [withParams, settings]);

  const setCharityStatus = useCallback(async (status: string) => {
    try {
      await withParams((p) => savePaymentAccount(p, { charity_rate_status: status as never }));
      setPayment(await withParams(getPaymentAccount));
    } catch (err) {
      setError(describeError(err, 'the payment account'));
      console.error(err);
    }
  }, [withParams]);

  const exportImports = useCallback(async () => {
    downloadCsv(
      csvFilename('financial-imports'),
      toCsvText(IMPORT_COLUMNS, imports, (i, col) => col.value(i))
    );
  }, [imports]);

  const receiptReady = Boolean(settings.legal_name && settings.ein);

  return (
    <ForgeLayout
      title="Organization setup"
      subtitle="The details every report and every receipt depends on."
      loading={loading}
      loadingLabel="Loading setup…"
      error={error}
      actions={<Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>}
    >
      {!configured && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This organization has not been set up yet. Until the legal name and EIN are entered,
          acknowledgements cannot be issued — a receipt without them is not a valid one.
        </div>
      )}
      {saved && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{saved}</div>}

      <Card title="Legal identity">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Legal name" value={settings.legal_name ?? ''} onChange={(v) => set('legal_name', v)} wide
            hint="Exactly as it appears on your IRS determination letter." />
          <Field label="EIN" value={settings.ein ?? ''} onChange={(v) => set('ein', v)}
            hint="Employer Identification Number, e.g. 47-0000000." />
          <Field label="Website" value={settings.website ?? ''} onChange={(v) => set('website', v)} />
          <Field label="Street" value={settings.street ?? ''} onChange={(v) => set('street', v)} wide />
          <Field label="City" value={settings.city ?? ''} onChange={(v) => set('city', v)} />
          <Field label="State" value={settings.state_province ?? ''} onChange={(v) => set('state_province', v)} />
          <Field label="ZIP" value={settings.postal_code ?? ''} onChange={(v) => set('postal_code', v)} />
          <Field label="Phone" value={settings.phone ?? ''} onChange={(v) => set('phone', v)} />
          <Field label="Email" value={settings.email ?? ''} onChange={(v) => set('email', v)} />
        </div>
        {!receiptReady && (
          <p className="mt-3 text-xs text-amber-700">
            Both the legal name and the EIN are required before an acknowledgement can be issued.
          </p>
        )}
      </Card>

      <Card title="Fiscal year">
        <label className="block max-w-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Fiscal year starts in</span>
          <select
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
            value={settings.fiscal_year_start_month ?? 1}
            onChange={(e) => set('fiscal_year_start_month', Number(e.target.value))}
          >
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </label>
        <p className="mt-2 text-sm text-slate-600">{fyLabel(Number(settings.fiscal_year_start_month ?? 1))}</p>
        <p className="mt-2 text-xs text-slate-500">
          Every fundraising and financial report groups by this. Tax receipting always uses the
          calendar year regardless, because the IRS does.
        </p>
      </Card>

      <Card title="Receipt wording">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Signed by" value={settings.receipt_signer_name ?? ''} onChange={(v) => set('receipt_signer_name', v)} />
          <Field label="Title" value={settings.receipt_signer_title ?? ''} onChange={(v) => set('receipt_signer_title', v)} />
          <Field label="Receipt number prefix" value={settings.receipt_prefix ?? 'R'} onChange={(v) => set('receipt_prefix', v)}
            hint="Numbers run as PREFIX-YEAR-00001." />
        </div>
        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Standard statement</span>
          <textarea
            rows={4}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
            value={settings.receipt_statement ?? ''}
            onChange={(e) => set('receipt_statement', e.target.value)}
          />
          <span className="mt-1 block text-xs text-slate-500">
            Appears on every acknowledgement. The IRS disclosure sentences about goods and services
            are added automatically per gift and do not need to be repeated here.
          </span>
        </label>
      </Card>

      <Card title="Taking donations">
        {payment && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Pill tone={payment.connected ? 'green' : 'amber'}>
                {payment.connected ? 'Stripe connected' : 'Not connected'}
              </Pill>
              <Pill tone={payment.data?.charity_rate_status === 'approved' ? 'green'
                : payment.data?.charity_rate_status === 'declined' ? 'red' : 'amber'}>
                Charity rate: {(payment.data?.charity_rate_status ?? 'not applied').replace(/_/g, ' ')}
              </Pill>
              {payment.data && !payment.data.is_live && <Pill>Test mode</Pill>}
            </div>

            <dl className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">You pay per gift</dt>
                <dd className="mt-1 text-lg font-semibold text-slate-900">
                  {payment.effective_rate.percent}% + ${payment.effective_rate.fixed.toFixed(2)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Charity rate</dt>
                <dd className="mt-1 text-lg font-semibold text-slate-900">
                  {payment.rates.charity.percent}% + ${payment.rates.charity.fixed.toFixed(2)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Our platform fee</dt>
                <dd className="mt-1 text-lg font-semibold text-slate-900">
                  {((payment.data?.platform_fee_bps ?? 0) / 100).toFixed(2)}%
                </dd>
                {payment.data?.platform_fee_note && (
                  <dd className="mt-1 text-xs text-slate-500">{payment.data.platform_fee_note}</dd>
                )}
              </div>
            </dl>

            {payment.warning && (
              // The one thing a non-profit cannot undo later.
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {payment.warning}
              </div>
            )}

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
              <p className="font-medium text-slate-800">How to get the charity rate</p>
              <p className="mt-1">{payment.rates.how_to_apply}</p>
              <p className="mt-1 text-slate-600">{payment.rates.requirements} Review takes {payment.rates.review_time}.</p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {(['not_applied', 'applied', 'approved', 'declined'] as const).map((s) => (
                <Button
                  key={s}
                  variant={payment.data?.charity_rate_status === s ? 'primary' : 'secondary'}
                  onClick={() => setCharityStatus(s)}
                >
                  Mark {s.replace(/_/g, ' ')}
                </Button>
              ))}
            </div>
          </>
        )}
      </Card>

      <Card
        title="Financial statements"
        action={(
          <ForgeExportButton
            subject="the financial imports"
            disabled={imports.length === 0}
            onExport={exportImports}
            onError={setError}
          />
        )}
      >
        <p className="text-sm text-slate-600">
          Contribution income comes from this system. The expense side comes from your ledger —
          STELLA if you have it, otherwise an import — so the Statement of Activities and the
          functional expense split can still be produced.
        </p>
        {imports.length === 0 ? (
          <div className="mt-3"><EmptyState>No financial data imported yet.</EmptyState></div>
        ) : (
          <table className="mt-3 min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4 font-semibold">Period</th>
                <th className="py-2 pr-4 font-semibold">Label</th>
                <th className="py-2 pr-4 font-semibold">Source</th>
                <th className="py-2 pr-4 text-right font-semibold">Lines</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {imports.map((i) => (
                <tr key={i.import_id}>
                  <td className="whitespace-nowrap py-2 pr-4 text-slate-700">
                    {shortDate(i.period_start)} – {shortDate(i.period_end)}
                  </td>
                  <td className="py-2 pr-4 text-slate-700">{i.label ?? '—'}</td>
                  <td className="py-2 pr-4 text-slate-600">{i.source}</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-slate-700">{i.line_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </ForgeLayout>
  );
}
