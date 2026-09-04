/**
 * YourBusinessPage — /app/settings/your-business (Foundation B).
 *
 * ONE record about the business, in plain questions, that every product and
 * every agent reads: ARION's site builder, SPARK's lead scoring and reply
 * drafts, the OLIVER agents, and the reports.
 *
 * THREE THINGS THIS PAGE DELIBERATELY DOES NOT DO
 * -----------------------------------------------
 * It does not edit the opening hours, the business name and address, or any
 * price. Each of those already has exactly one home, and this page SHOWS them
 * (so the owner sees the whole picture in one place) with a link to the page
 * that owns them. Decision F-3: one home per fact. The API refuses those
 * fields outright, so this is not a convention that can quietly rot.
 *
 * PREFILL IS A SUGGESTION UNTIL IT IS SAVED
 * -----------------------------------------
 * Fields we could work out from the ARION onboarding answers and the OLIVER
 * catalogue arrive filled in and marked "we filled this in — check it". They
 * are NOT stored until the owner saves. Nothing on this page writes a word the
 * owner has not looked at.
 *
 * The word "tenant" appears nowhere a person can see it. It is a Business.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import { ChevronLeft, Check, History, Info, ExternalLink } from 'lucide-react';

import { authScopes } from '../../auth/msalConfig';
import { useAppState } from '../../app/AppState';
import {
  getBusinessProfile,
  updateBusinessProfile,
  getBusinessProfileHistory,
  type BusinessProfileResponse,
  type BusinessProfileVersion,
  type BusinessProfileFields,
} from '../../lib/platformApi';
import { RulesAppliedCard } from '../../components/spark/RulesAppliedCard';
import {
  EMPTY_DRAFT,
  toDraft,
  changedFields,
  FIELD_LABELS,
  describeValue,
  type BusinessProfileDraft,
  type CatalogueOption,
} from '../../lib/businessProfileForm';

const input =
  'mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black';
const area = `${input} min-h-[80px]`;

/* ── small building blocks ───────────────────────────────────────────────── */

function PrefillHint({ source }: { source: string }) {
  return (
    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200">
      <Info className="h-3 w-3" />
      We filled this in from {source} — check it
    </span>
  );
}

function Question({
  n, title, drives, prefilledFrom, children,
}: {
  n: number;
  title: string;
  drives: string;
  prefilledFrom?: string | null;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-white p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-900 text-[11px] font-semibold text-white">
          {n}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          <p className="mt-0.5 text-xs text-gray-500">{drives}</p>
          {prefilledFrom && <PrefillHint source={prefilledFrom} />}
          <div className="mt-3 space-y-3">{children}</div>
        </div>
      </div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-gray-500">{hint}</span>}
    </label>
  );
}

/** A fact that lives on another page: shown, never edited here. */
function Borrowed({ title, editedOn, to, children }: { title: string; editedOn: string; to: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-gray-700">{title}</span>
        <Link to={to} className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-600 underline hover:text-gray-900">
          Edit on {editedOn}
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      <div className="mt-2 text-xs text-gray-700">{children}</div>
    </div>
  );
}

const DAY_LABEL: Record<string, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
};

function HoursSummary({ hours }: { hours: BusinessProfileResponse['borrowed']['businessHours']['value'] }) {
  if (!hours) return <span className="text-gray-500">Not set yet.</span>;
  const rows = Object.keys(DAY_LABEL).filter((d) => hours[d]);
  if (!rows.length) return <span className="text-gray-500">Not set yet.</span>;
  return (
    <ul className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
      {rows.map((d) => (
        <li key={d} className="flex justify-between gap-4">
          <span className="text-gray-500">{DAY_LABEL[d]}</span>
          <span>{hours[d].closed ? 'Closed' : `${hours[d].open ?? '—'} – ${hours[d].close ?? '—'}`}</span>
        </li>
      ))}
    </ul>
  );
}

function money(v: number | null, currency: string) {
  if (v === null || v === undefined) return null;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(v);
  } catch {
    return `${currency} ${v}`;
  }
}

/* ── the page ────────────────────────────────────────────────────────────── */

export function YourBusinessPage() {
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  const { active } = useAppState();
  const tenantId = active?.tenant?.tenantId ?? null;

  const [data, setData] = useState<BusinessProfileResponse | null>(null);
  const [loaded, setLoaded] = useState<BusinessProfileFields | null>(null);
  const [draft, setDraft] = useState<BusinessProfileDraft>(EMPTY_DRAFT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versions, setVersions] = useState<BusinessProfileVersion[] | null>(null);
  const [historyErr, setHistoryErr] = useState<string | null>(null);

  const callParams = useCallback(async () => {
    if (!account || !tenantId) throw new Error('Not signed in to a business yet.');
    const r = await instance.acquireTokenSilent({ scopes: authScopes, account });
    return {
      baseUrl: import.meta.env.VITE_PLATFORM_API_BASE_URL,
      bearerToken: r.accessToken,
      tenantId,
    };
  }, [account, instance, tenantId]);

  const load = useCallback(async () => {
    if (!account || !tenantId) return;
    setLoading(true);
    setErrMsg(null);
    try {
      const res = await getBusinessProfile(await callParams());
      setData(res);
      setLoaded(res.profile);
      setDraft(toDraft(res.profile));
    } catch (e) {
      // Shown, never swallowed: a form that silently failed to load is how a
      // good record gets overwritten with blanks.
      setErrMsg((e as Error).message || 'Could not load your business profile.');
    } finally {
      setLoading(false);
    }
  }, [account, tenantId, callParams]);

  useEffect(() => { load(); }, [load]);

  const catalogue: CatalogueOption[] = useMemo(
    () => (data?.borrowed.prices.items || []).map((i) => ({ offeringId: i.offeringId, name: i.name })),
    [data],
  );

  const pending = useMemo(
    () => (loaded ? changedFields(loaded, draft, catalogue) : {}),
    [loaded, draft, catalogue],
  );
  const pendingCount = Object.keys(pending).length;

  const prefilledSource = useCallback(
    (field: string) => data?.prefilled.find((p) => p.field === field)?.source ?? null,
    [data],
  );

  const set = (patch: Partial<BusinessProfileDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const handleSave = useCallback(async () => {
    if (!pendingCount) return;
    setSaving(true);
    setErrMsg(null);
    setToast('');
    try {
      const res = await updateBusinessProfile({ ...(await callParams()), payload: pending });
      setData(res);
      setLoaded(res.profile);
      setDraft(toDraft(res.profile));
      setVersions(null); // the drawer re-reads next time it opens
      setToast(res.changed ? `Saved — version ${res.version}` : 'Nothing had changed');
    } catch (e) {
      setErrMsg(`Save failed: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }, [pending, pendingCount, callParams]);

  const openHistory = useCallback(async () => {
    setHistoryOpen(true);
    if (versions) return;
    setHistoryErr(null);
    try {
      const res = await getBusinessProfileHistory(await callParams());
      setVersions(res.versions);
    } catch (e) {
      setHistoryErr((e as Error).message || 'Could not load the change history.');
    }
  }, [versions, callParams]);

  if (!tenantId) {
    return <div className="p-6 text-sm text-gray-500">Choose a business first.</div>;
  }

  if (loading) {
    return <div className="py-10 text-center text-sm text-gray-500">Loading your business profile…</div>;
  }

  const prices = data?.borrowed.prices;
  const completeness = data?.completeness;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 pb-32 sm:p-6 sm:pb-32">
      <div>
        <Link to="/app/settings" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
          <ChevronLeft className="h-3.5 w-3.5" />
          All settings
        </Link>
      </div>

      <section className="rounded-lg border bg-white p-4 sm:p-5">
        <h1 className="text-xl font-semibold sm:text-2xl">Your business</h1>
        <p className="mt-1 text-sm text-gray-600">
          The things every product needs to know about you. Answer them once, in your own words.
        </p>
        <p className="mt-2 text-xs text-gray-500">
          <span className="font-medium text-gray-700">Used by:</span> your agents, lead scoring,
          reply drafts and your reports.
        </p>
        {completeness && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span>{completeness.answered} of {completeness.total} answered</span>
              <span>{completeness.pct}%</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-gray-900" style={{ width: `${completeness.pct}%` }} />
            </div>
          </div>
        )}
        {data && data.prefilled.length > 0 && (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
            We filled in {data.prefilled.length} answer{data.prefilled.length === 1 ? '' : 's'} from what
            you have already told us. Nothing is saved until you press Save — read them over first.
          </p>
        )}
      </section>

      {errMsg && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errMsg}</div>
      )}
      {toast && (
        <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          <Check className="h-4 w-4" />
          {toast}
        </div>
      )}

      {/* 1 */}
      <Question n={1} title="What do you do?" drives="Used when anything writes about you — your website, emails and replies."
        prefilledFrom={prefilledSource('industry') || prefilledSource('description') || prefilledSource('tagline')}>
        <Field label="In a few words (your trade or industry)">
          <input className={input} value={draft.industry} onChange={(e) => set({ industry: e.target.value })} placeholder="Gutter cleaning and repair" />
        </Field>
        <Field label="A short description">
          <textarea className={area} value={draft.description} onChange={(e) => set({ description: e.target.value })} placeholder="We clean and repair gutters for homes across the Des Moines metro." />
        </Field>
        <Field label="Your tagline (optional)">
          <input className={input} value={draft.tagline} onChange={(e) => set({ tagline: e.target.value })} placeholder="Clear gutters, dry basements" />
        </Field>
      </Question>

      {/* 2 */}
      <Question n={2} title="What do you sell?" drives="Quotes, reply drafts and reports group by service line."
        prefilledFrom={prefilledSource('services')}>
        {prices?.available && prices.items.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-gray-500">
              Tick what you want the AI to talk about. Prices come live from your catalogue and are
              not editable here.
            </p>
            <ul className="divide-y rounded-md border">
              {prices.items.map((item) => {
                const checked = draft.selectedOfferingIds.includes(item.offeringId);
                return (
                  <li key={item.offeringId} className="flex items-start gap-3 p-2.5">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-gray-300"
                      checked={checked}
                      onChange={(e) => set({
                        selectedOfferingIds: e.target.checked
                          ? [...draft.selectedOfferingIds, item.offeringId]
                          : draft.selectedOfferingIds.filter((id) => id !== item.offeringId),
                      })}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-gray-900">{item.name}</div>
                      <div className="text-[11px] text-gray-500">
                        {item.startsAt !== null
                          ? `Starts at ${money(item.startsAt, item.currency)}`
                          : item.requiresQuote ? 'Quoted per job' : 'No price set'}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <Link to="/app/services/oliver_catalog" className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-600 underline hover:text-gray-900">
              Change a price in your catalogue
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        ) : (
          <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
            {prices?.reason
              ? <>We could not read your price list right now: {prices.reason} Type what you sell below instead — nothing is lost.</>
              : <>No price list yet. Type what you sell below; when you build a catalogue, the prices appear here automatically.</>}
          </div>
        )}
        <Field label="Anything else you sell (one per line)">
          <textarea className={area} value={draft.servicesText} onChange={(e) => set({ servicesText: e.target.value })} placeholder={'Gutter guards\nStorm call-outs'} />
        </Field>
        <Field label="In one sentence" hint="What a customer would say you sell.">
          <input className={input} value={draft.servicesSummary} onChange={(e) => set({ servicesSummary: e.target.value })} placeholder="Cleaning, repair and guards for residential gutters." />
        </Field>
      </Question>

      {/* 3 */}
      <Question n={3} title="Where do you work?" drives="Leads outside your area are scored down instead of chased."
        prefilledFrom={prefilledSource('serviceArea')}>
        <div className="flex flex-wrap gap-4 text-xs">
          <label className="inline-flex items-center gap-2">
            <input type="radio" checked={draft.serviceAreaKind === 'list'} onChange={() => set({ serviceAreaKind: 'list' })} />
            Named places
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="radio" checked={draft.serviceAreaKind === 'radius'} onChange={() => set({ serviceAreaKind: 'radius' })} />
            A distance from one place
          </label>
        </div>
        {draft.serviceAreaKind === 'radius' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Postcode / ZIP you work out from">
              <input className={input} value={draft.serviceAreaPostalCode} onChange={(e) => set({ serviceAreaPostalCode: e.target.value })} placeholder="50023" />
            </Field>
            <Field label="How far will you travel? (miles)">
              <input className={input} inputMode="numeric" value={draft.serviceAreaMiles} onChange={(e) => set({ serviceAreaMiles: e.target.value })} placeholder="30" />
            </Field>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="States"><input className={input} value={draft.serviceAreaStates} onChange={(e) => set({ serviceAreaStates: e.target.value })} placeholder="IA" /></Field>
            <Field label="Towns and cities"><input className={input} value={draft.serviceAreaCities} onChange={(e) => set({ serviceAreaCities: e.target.value })} placeholder="Ankeny, Des Moines" /></Field>
            <Field label="Postcode / ZIP starts"><input className={input} value={draft.serviceAreaZips} onChange={(e) => set({ serviceAreaZips: e.target.value })} placeholder="500, 502" /></Field>
          </div>
        )}
        <Field label="Anything else about where you work">
          <input className={input} value={draft.serviceAreaNote} onChange={(e) => set({ serviceAreaNote: e.target.value })} placeholder="We cross the river only for jobs over $1,000." />
        </Field>
      </Question>

      {/* 4 — borrowed */}
      <Question n={4} title="When are you open?" drives="Booking, the response promise and every 'we're open' line.">
        <Borrowed title="Your opening hours" editedOn="Business Profile" to="/app/settings/business-profile">
          <HoursSummary hours={data?.borrowed.businessHours.value ?? null} />
          <p className="mt-2 text-[11px] text-gray-500">
            Hours are kept in one place so every product shows the same thing. This page reads them.
          </p>
        </Borrowed>
      </Question>

      {/* 5 */}
      <Question n={5} title="How much work can you take on?" drives="Stops the AI promising work you cannot fit in.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Jobs a day"><input className={input} inputMode="numeric" value={draft.capacityJobsPerDay} onChange={(e) => set({ capacityJobsPerDay: e.target.value })} placeholder="4" /></Field>
          <Field label="Crews"><input className={input} inputMode="numeric" value={draft.capacityCrewCount} onChange={(e) => set({ capacityCrewCount: e.target.value })} placeholder="2" /></Field>
          <Field label="Usual lead time (days)"><input className={input} inputMode="numeric" value={draft.capacityLeadTimeDays} onChange={(e) => set({ capacityLeadTimeDays: e.target.value })} placeholder="14" /></Field>
          <Field label="Booked through"><input type="date" className={input} value={draft.capacityBookedThrough} onChange={(e) => set({ capacityBookedThrough: e.target.value })} /></Field>
        </div>
        <Field label="In your own words">
          <input className={input} value={draft.capacityNote} onChange={(e) => set({ capacityNote: e.target.value })} placeholder="Two crews. Booked about three weeks out through autumn." />
        </Field>
      </Question>

      {/* 6 */}
      <Question n={6} title="What is your ideal job, and who is your ideal customer?" drives="Lead scoring learns from this before it has any results to learn from.">
        <Field label="Your ideal job"><textarea className={area} value={draft.idealJob} onChange={(e) => set({ idealJob: e.target.value })} placeholder="A two-storey house with guards already fitted, booked a week ahead." /></Field>
        <Field label="Your ideal customer">
          <textarea className={area} value={draft.idealCustomer} onChange={(e) => set({ idealCustomer: e.target.value })} placeholder="A homeowner who books the same week every autumn." />
        </Field>
        <Field label="Why do customers pick you?">
          <textarea className={area} value={draft.differentiators} onChange={(e) => set({ differentiators: e.target.value })} placeholder="Same-week service and we photograph every gutter before and after." />
        </Field>
        {prefilledSource('targetAudience') && <PrefillHint source={prefilledSource('targetAudience') as string} />}
        <Field label="Who you serve, in a line" hint="Shown on your site and used when the AI writes to a new enquiry.">
          <input className={input} value={draft.targetAudience} onChange={(e) => set({ targetAudience: e.target.value })} placeholder="Suburban homeowners" />
        </Field>
      </Question>

      {/* 7 */}
      <Question n={7} title="What won't you do?" drives="Work you would turn down is never quoted for or promised.">
        <Field label="Work you don't take">
          <textarea className={area} value={draft.noGoList} onChange={(e) => set({ noGoList: e.target.value })} placeholder="No roofs. No commercial buildings over two storeys." />
        </Field>
        <Field label="Things never to say" hint="Words, claims or promises you do not want written on your behalf.">
          <textarea className={area} value={draft.doNotSay} onChange={(e) => set({ doNotSay: e.target.value })} placeholder="Never say 'guaranteed'. Never quote a price over the phone." />
        </Field>
      </Question>

      {/* 8 */}
      <div id="rules" />
      <Question n={8} title="What rules should we always follow?" drives="Written in your words, applied to every reply, quote and suggestion.">
        <Field label="Your rules, one per line" hint="Plain English. For example: no jobs over two days this month; Ankeny only until November.">
          <textarea className={`${area} min-h-[110px]`} value={draft.rulesPlainText} onChange={(e) => set({ rulesPlainText: e.target.value })} placeholder={'No jobs over two days this month.\nAnkeny only until November.\nAlways offer the autumn package to repeat customers.'} />
        </Field>
        {/* IL-3 — the readback. The owner has just written a paragraph; this is
            where they find out whether the software understood it, and what it
            has already done with it. Read-only: the words are edited above and
            saved by this page's own Save button. */}
        <RulesAppliedCard />
      </Question>

      {/* 9 */}
      <Question n={9} title="How do you talk to customers?" drives="The voice of every drafted reply."
        prefilledFrom={prefilledSource('brandVoice')}>
        <Field label="One sentence">
          <input className={input} value={draft.brandVoice} onChange={(e) => set({ brandVoice: e.target.value })} placeholder="Friendly, straight to the point, no jargon." />
        </Field>
        <Borrowed title="Your full voice profile" editedOn="Brand Identity" to="/app/settings/brand-identity">
          Tone attributes, examples and the things to avoid live in Brand Identity. The sentence above
          is the short version every draft starts from.
        </Borrowed>
      </Question>

      {/* 10 */}
      <Question n={10} title="How fast do you answer, and who gets called when something's wrong?" drives="The promise we make on your behalf, and who we escalate to.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Answer within (minutes)"><input className={input} inputMode="numeric" value={draft.responsePromiseMinutes} onChange={(e) => set({ responsePromiseMinutes: e.target.value })} placeholder="30" /></Field>
          <Field label="How you say it"><input className={input} value={draft.responsePromiseText} onChange={(e) => set({ responsePromiseText: e.target.value })} placeholder="Within half an hour during business hours." /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Escalate to (name)"><input className={input} value={draft.escalationName} onChange={(e) => set({ escalationName: e.target.value })} placeholder="Sam Whitaker" /></Field>
          <Field label="Their phone"><input className={input} value={draft.escalationPhone} onChange={(e) => set({ escalationPhone: e.target.value })} placeholder="(515) 555-0100" /></Field>
          <Field label="Their email"><input className={input} value={draft.escalationEmail} onChange={(e) => set({ escalationEmail: e.target.value })} placeholder="sam@example.com" /></Field>
          <Field label="When to escalate"><input className={input} value={draft.escalationWhen} onChange={(e) => set({ escalationWhen: e.target.value })} placeholder="Any complaint, or a job over $5,000." /></Field>
        </div>
      </Question>

      {/* 11 */}
      <Question n={11} title="Which languages do you serve customers in?" drives="Replies and pages are written in a language the customer reads.">
        <Field label="Languages, separated by commas">
          <input className={input} value={draft.languages} onChange={(e) => set({ languages: e.target.value })} placeholder="en, es" />
        </Field>
      </Question>

      {/* Borrowed basics, for completeness */}
      <Borrowed title="Your business name, address and contact details" editedOn="Business Profile" to="/app/settings/business-profile">
        {data?.borrowed.basics.value?.businessName || 'Not set yet.'}
        {data?.borrowed.basics.value?.city ? ` — ${data.borrowed.basics.value.city}` : ''}
        <p className="mt-1 text-[11px] text-gray-500">
          Kept in one place so invoices, your website and every email agree.
        </p>
      </Borrowed>

      {/* Footer: version + history */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white px-4 py-3 text-xs text-gray-600">
        <span>
          {data?.exists
            ? <>Version {data.version}{data.updatedAt ? ` — last changed ${new Date(data.updatedAt).toLocaleString()}` : ''}</>
            : 'Not saved yet'}
        </span>
        <button
          type="button"
          onClick={openHistory}
          className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-medium hover:bg-gray-50"
        >
          <History className="h-3.5 w-3.5" />
          History
        </button>
      </section>

      {/* Sticky save bar — mobile-first, so the button is never off-screen */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <span className="text-xs text-gray-500">
            {pendingCount === 0 ? 'No changes to save' : `${pendingCount} change${pendingCount === 1 ? '' : 's'} ready to save`}
          </span>
          <button
            type="button"
            disabled={saving || pendingCount === 0}
            onClick={handleSave}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {historyOpen && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={() => setHistoryOpen(false)}>
          <div className="h-full w-full max-w-md overflow-y-auto bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">What changed, and when</h2>
              <button type="button" onClick={() => setHistoryOpen(false)} className="text-xs text-gray-500 underline">Close</button>
            </div>
            {historyErr && <p className="mt-3 text-xs text-red-700">{historyErr}</p>}
            {!versions && !historyErr && <p className="mt-3 text-xs text-gray-500">Loading…</p>}
            {versions?.length === 0 && <p className="mt-3 text-xs text-gray-500">Nothing has been changed yet.</p>}
            <ol className="mt-4 space-y-4">
              {(versions || []).map((v) => (
                <li key={v.versionId} className="rounded-md border p-3">
                  <div className="flex items-center justify-between text-[11px] text-gray-500">
                    <span>Version {v.version}</span>
                    <span>{new Date(v.changedAt).toLocaleString()}</span>
                  </div>
                  {v.changedBy && <div className="mt-0.5 text-[11px] text-gray-500">by {v.changedBy}</div>}
                  <ul className="mt-2 space-y-1.5">
                    {v.changes.map((c, i) => (
                      <li key={`${v.versionId}-${i}`} className="text-xs">
                        <span className="font-medium text-gray-800">{FIELD_LABELS[c.field] || c.field}</span>
                        <div className="text-gray-500">
                          <span className="line-through">{describeValue(c.from)}</span>
                          {' → '}
                          <span className="text-gray-800">{describeValue(c.to)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

export default YourBusinessPage;
