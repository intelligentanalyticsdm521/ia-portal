/**
 * ResponderSettingsPage — /app/settings/responder
 *
 * The receptionist's switches, in the owner's words:
 *   · answer new inquiries for me
 *   · tell me when one lands (email / phone alert)
 *   · put them in a follow-up sequence
 *   · write the reply for me                          (Growth and up)
 *   · attach a quote from my price list               (needs OLIVER)
 *   · let quotes up to $X send themselves             (Authority only)
 *
 * D2 lives here by ABSENCE: there is no "text the customer" switch, because
 * the Responder never texts a lead. The only text it can cause is your own
 * alert, and that lives with your other alert preferences.
 *
 * D3 lives here as the $500 default on the send-by-itself limit, with the
 * sentence that a complaint always waits regardless.
 *
 * ARGUS employees phase 1 §F.5: "write the reply for me" and "let it send by
 * itself" are now your marketer's job, Replies to new inquiries — its On switch
 * and its Automatic / Send me first. They write the job's row (PUT
 * /me/team/jobs/spark.inquiry_reply on platform-api), the same row ARGUS → Your
 * team → The marketer writes, so the two pages can never disagree. Everything
 * else here (answering at all, the acknowledgement, your alerts, the sequence,
 * the quote, the send-by-itself limit) is the Responder add-on's own and stays.
 *
 * The word "tenant" appears nowhere a person can see it. It is a Business.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Check, AlertTriangle, Sparkles, Lock } from 'lucide-react';
import { useSparkApi } from '../../hooks/useSparkApi';
import { useTeamJob } from '../../hooks/useTeam';
import { JobControls } from '../../components/argus/team/JobRow';
import { employeeRoute } from '../../lib/team';

interface ResponderConfig {
  enabled: boolean;
  ack_email: boolean;
  alert_email: boolean;
  alert_push: boolean;
  journey_enrol_enabled: boolean;
  default_journey_automation_id: number | null;
  draft_enabled: boolean;
  quote_enabled: boolean;
  auto_send_enabled: boolean;
  auto_send_max_usd: number;
  brand_voice: string | null;
  halted_at: string | null;
  halted_reason: string | null;
  entitlement_override?: boolean;
  price_usd_monthly?: number | null;
}

interface ResponderSettings {
  engine: string;
  entitled: boolean;
  entitlement_source: string;
  is_founder: boolean;
  plan: string;
  rung: string;
  can_draft: boolean;
  can_auto_send: boolean;
  journeys: Array<{ id: number; name: string; steps: number }>;
  config: ResponderConfig;
}

function Toggle({ label, hint, checked, onChange, disabled, lockedNote }: {
  label: string; hint?: string; checked: boolean;
  onChange: (v: boolean) => void; disabled?: boolean; lockedNote?: string;
}) {
  return (
    <label className={`flex items-start gap-3 rounded-lg border p-3 ${disabled ? 'border-gray-200 bg-gray-50' : 'border-gray-200 bg-white'}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-gray-300"
      />
      <span className="flex-1">
        <span className={`block text-sm font-medium ${disabled ? 'text-gray-500' : 'text-gray-900'}`}>{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-gray-500">{hint}</span>}
        {disabled && lockedNote && (
          <span className="mt-1 inline-flex items-center gap-1 text-xs text-amber-700">
            <Lock className="h-3 w-3" />{lockedNote}
          </span>
        )}
      </span>
    </label>
  );
}

export function ResponderSettingsPage() {
  const { get, put, post, ready } = useSparkApi();
  // Your marketer's job "Replies to new inquiries": its switch and its mode.
  const reply = useTeamJob('marketer', 'spark.inquiry_reply');
  const [jobNotice, setJobNotice] = useState<string | null>(null);
  const [data, setData] = useState<ResponderSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const r = await get<{ data: ResponderSettings }>('/api/v1/responder/settings');
      setData(r.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load these settings.');
    } finally {
      setLoading(false);
    }
  }, [get, ready]);

  useEffect(() => { void load(); }, [load]);

  const save = async (patch: Partial<ResponderConfig>) => {
    if (!data) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    // Optimistic: the switches must feel like switches.
    setData({ ...data, config: { ...data.config, ...patch } });
    try {
      const r = await put<{ data: ResponderSettings }>('/api/v1/responder/settings', patch);
      setData(r.data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.');
      await load();
    } finally {
      setSaving(false);
    }
  };

  const resume = async () => {
    setSaving(true);
    try {
      const r = await post<{ data: ResponderSettings }>('/api/v1/responder/settings/reset-halt', {});
      setData(r.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not switch it back on.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="mx-auto max-w-3xl p-6 text-sm text-gray-500">Loading…</div>;

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <Link to="/app/settings" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
          <ChevronLeft className="h-4 w-4" />Settings
        </Link>
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error || 'Nothing to show.'}</div>
      </div>
    );
  }

  const c = data.config;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <Link to="/app/settings" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
          <ChevronLeft className="h-4 w-4" />Settings
        </Link>
        <div className="mt-3 flex items-start gap-3">
          <Sparkles className="mt-1 h-6 w-6 flex-shrink-0 text-violet-600" />
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">The Responder</h1>
            <p className="mt-1 text-sm text-gray-500">
              Your receptionist. When somebody contacts you it answers them within a minute in your own words,
              tells you straight away, and writes the reply you would have written. Powered by {data.engine}.
            </p>
          </div>
        </div>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {saved && (
        <div className="flex items-center gap-2 rounded border border-emerald-200 bg-emerald-50 p-2.5 text-sm text-emerald-800">
          <Check className="h-4 w-4" />Saved.
        </div>
      )}

      {!data.entitled && (
        <div className="rounded-lg border border-violet-200 bg-violet-50 p-4 text-sm text-gray-800">
          <div className="font-semibold text-gray-900">You don't have the Responder yet</div>
          <p className="mt-1">
            It answers every inquiry the minute it lands, writes the reply, and — with OLIVER — attaches a quote
            from your price list so one click sends it. Ask us to switch it on for your business.
          </p>
        </div>
      )}

      {c.halted_at && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-2 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{c.halted_reason || 'The Responder paused itself.'}</span>
          </div>
          <button
            onClick={resume}
            disabled={saving}
            className="flex-shrink-0 rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-40"
          >Switch it back on</button>
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Answering</h2>
        <Toggle
          label="Answer new inquiries for me"
          hint="The whole thing, on or off. Nothing below happens while this is off."
          checked={c.enabled}
          disabled={!data.entitled}
          lockedNote="You don't have the Responder yet"
          onChange={(v) => save({ enabled: v })}
        />
        <Toggle
          label="Email them back straight away"
          hint="A short note in your voice that says we have their message and when you will get back to them. Email only — we never text somebody who filled in a form."
          checked={c.ack_email}
          disabled={!c.enabled}
          onChange={(v) => save({ ack_email: v })}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Telling you</h2>
        <Toggle
          label="Email me"
          checked={c.alert_email}
          disabled={!c.enabled}
          onChange={(v) => save({ alert_email: v })}
        />
        <Toggle
          label="Buzz my phone"
          hint="A notification on any device where you turned them on, under Settings → Your account."
          checked={c.alert_push}
          disabled={!c.enabled}
          onChange={(v) => save({ alert_push: v })}
        />
        <p className="text-xs text-gray-500">
          Text alerts to you are set with your other alerts, and are off unless you turn them on.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Following up</h2>
        <Toggle
          label="Add them to a follow-up sequence"
          checked={c.journey_enrol_enabled}
          disabled={!c.enabled}
          onChange={(v) => save({ journey_enrol_enabled: v })}
        />
        <label className="block">
          <span className="text-sm font-medium text-gray-900">Which sequence</span>
          <select
            value={c.default_journey_automation_id ?? ''}
            disabled={!c.enabled || !c.journey_enrol_enabled}
            onChange={(e) => save({ default_journey_automation_id: e.target.value ? Number(e.target.value) : null })}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
          >
            <option value="">Don't add them to one</option>
            {data.journeys.map((j) => (
              <option key={j.id} value={j.id}>{j.name} ({j.steps} step{j.steps === 1 ? '' : 's'})</option>
            ))}
          </select>
          {data.journeys.length === 0 && (
            <span className="mt-1 block text-xs text-gray-500">
              You have no sequences with any steps in them yet. Set one up under SPARK → Workflows &amp; Automations.
            </span>
          )}
        </label>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Writing the reply</h2>
        {!data.can_draft && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
            On your current plan the Responder answers the customer and tells you. Move up and it also writes the
            reply in your voice and, with OLIVER, attaches a quote from your price list.
          </div>
        )}
        {/* Your marketer's job: Replies to new inquiries (On / Off). */}
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <span className="flex-1">
              <span className="block text-sm font-medium text-gray-900">Draft the reply for me</span>
              <span className="mt-0.5 block text-xs text-gray-500">
                A short answer grounded in what you told us about your business — never a price you don't charge, never
                a date you didn't promise. This is your marketer's job, Replies to new inquiries.
              </span>
              <Link to={employeeRoute('marketer', 'jobs')} className="mt-1 inline-block text-xs font-medium text-gray-600 underline">
                See it with your marketer's other jobs
              </Link>
            </span>
            {reply.job ? (
              <JobControls job={reply.job} hideMode onChanged={reply.setJob} onNotice={setJobNotice} />
            ) : reply.error ? (
              <span className="max-w-xs text-xs text-red-700" role="alert">{reply.error}</span>
            ) : (
              <span className="text-xs text-gray-500">Loading…</span>
            )}
          </div>
        </div>
        {jobNotice && (
          <div className="flex items-center gap-2 rounded border border-emerald-200 bg-emerald-50 p-2.5 text-sm text-emerald-800" role="status">
            <Check className="h-4 w-4" />{jobNotice}
          </div>
        )}
        <Toggle
          label="Attach a quote from my price list"
          hint="When what they asked for matches something in your OLIVER catalog. The prices always come from your catalog."
          checked={c.quote_enabled}
          disabled={!c.enabled || !data.can_draft}
          lockedNote="Included from the next plan up"
          onChange={(v) => save({ quote_enabled: v })}
        />
        <label className="block">
          <span className="text-sm font-medium text-gray-900">How you want it to sound</span>
          <textarea
            value={c.brand_voice ?? ''}
            disabled={!c.enabled || !data.can_draft}
            onChange={(e) => setData({ ...data, config: { ...c, brand_voice: e.target.value } })}
            onBlur={(e) => save({ brand_voice: e.target.value })}
            rows={3}
            placeholder="Friendly and to the point. No jargon. Always offer to come out and look."
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
          />
          <span className="mt-1 block text-xs text-gray-500">
            Leave this blank to use the voice on your business profile.
          </span>
        </label>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Sending without you</h2>
        {!data.can_auto_send && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
            Letting quotes send themselves is part of the top plan. Until then every reply and every quote waits
            for you to press send.
          </div>
        )}
        {/* The same job's mode: Automatic sends small quotes by themselves. */}
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <span className="flex-1">
              <span className="block text-sm font-medium text-gray-900">Let small quotes send themselves</span>
              <span className="mt-0.5 block text-xs text-gray-500">
                Automatic sends the ones under your limit, and only when nothing about the message needs a person.
                Send me first keeps every reply waiting for you.
              </span>
            </span>
            {reply.job ? (
              <JobControls job={reply.job} hideSwitch onChanged={reply.setJob} onNotice={setJobNotice} />
            ) : reply.error ? (
              <span className="max-w-xs text-xs text-red-700" role="alert">{reply.error}</span>
            ) : (
              <span className="text-xs text-gray-500">Loading…</span>
            )}
          </div>
        </div>
        <label className="block">
          <span className="text-sm font-medium text-gray-900">Send by itself up to</span>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-sm text-gray-500">$</span>
            <input
              type="number"
              min={0}
              step={25}
              value={c.auto_send_max_usd}
              disabled={!c.enabled || !data.can_auto_send}
              onChange={(e) => setData({ ...data, config: { ...c, auto_send_max_usd: Number(e.target.value) } })}
              onBlur={(e) => save({ auto_send_max_usd: Number(e.target.value) })}
              className="w-40 rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
            />
          </div>
          <span className="mt-1 block text-xs text-gray-500">
            Anything above this waits for you. So does anything that reads like a complaint, a refund or a legal
            matter — whatever the amount.
          </span>
        </label>
      </section>

      {data.is_founder && (
        <section className="space-y-3 rounded-lg border border-slate-300 bg-slate-50 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Intelligent Analytics only</h2>
          <Toggle
            label="Switch the Responder on for this business"
            hint="The stand-in until the Responder exists as a product in Stripe. Clients cannot see or set this."
            checked={!!c.entitlement_override}
            onChange={(v) => save({ entitlement_override: v } as Partial<ResponderConfig>)}
          />
          <div className="text-xs text-slate-600">
            Entitlement source: <span className="font-mono">{data.entitlement_source}</span> · plan{' '}
            <span className="font-mono">{data.plan}</span> · rung <span className="font-mono">{data.rung}</span>
          </div>
        </section>
      )}
    </div>
  );
}

export default ResponderSettingsPage;
