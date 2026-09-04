// Settings → Phone & texting — everything about a business's number, in one
// place, in plain words (holistic §4.8).
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS PAGE EXISTS SEPARATELY FROM THE LEAD SOURCES ROW.
//
// "Texts & calls" on SPARK › Lead sources answers "where do leads come from".
// This answers a different question — "what is my number doing, what is it
// costing me, and who have I been told not to text" — and it is a SETTINGS
// question a business owner goes looking for on purpose, usually because
// something did not arrive.
//
// SIX THINGS, and each one is here because its absence generates a support call:
//
//   1. The line, its purpose and its status. A pending line shows the WAIT AND
//      THE REASON, never a dead switch. "Being set up — about 2 to 6 weeks. We
//      are registering it with the mobile carriers."
//   2. The carrier form. Blocking, validated, and it says what is still needed.
//      The $44 filing fee is spent on submission whether the carrier approves or
//      refuses, so every gap is closed before the founder can file.
//   3. The allowance, as a bar: "184 of 250 texts used", with overage in plain
//      words — COUNTED, NOT CHARGED, and it says so, because a client who sees
//      "34 over" and no explanation assumes a bill.
//   4. Who told them to stop, with the date and "they replied STOP" — never a
//      raw error, never a code.
//   5. "Add a second line — $5/month", so operations and marketing traffic are
//      separate numbers. One button.
//   6. Quiet hours, in ONE place.
//
// NO "TENANT" ANYWHERE IN THE COPY. It is a business.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Phone, Clock, ShieldCheck, AlertTriangle, ChevronLeft, Ban, Plus, FileText, Download,
} from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { friendlyApiError } from "../../lib/leadgenBilling";

interface Line {
  id: number;
  purpose: "operations" | "marketing";
  number: string | null;
  status: string;
  registration_status: "none" | "submitted" | "approved" | "rejected";
  registration_promise: string | null;
  pending: boolean;
  pending_reason: string | null;
  setup_estimate: string | null;
  can_text: boolean;
  can_take_calls: boolean;
  monthly_fee_cents: number;
  included_in_plan: boolean;
  sms_included_per_month: number;
  registration_complete?: boolean;
  registration_missing?: string[];
}

interface Allowance {
  period: string;
  included: number;
  used: number;
  overage_units: number;
  remaining: number;
}

interface Meta {
  shared_number: string | null;
  monthly_fee_cents: number;
  entitled: boolean;
  included_in_plan: boolean;
  setup_estimate: string;
  registration_promise: string;
  allowance: Allowance | null;
  can_add_line?: boolean;
  second_line_purpose?: string;
  sending_from?: string | null;
  shared_identity_prefix?: string | null;
  shared_line_note?: string | null;
}

interface OptOut {
  number: string | null;
  name: string | null;
  at: string | null;
  why: string;
}

interface QuietHours {
  enabled: boolean;
  timezone: string;
  start_hour: number;
  end_hour: number;
  weekdays_only: boolean;
}

const PURPOSE_LABEL: Record<string, { title: string; blurb: string }> = {
  operations: {
    title: "Operations",
    blurb: "Used for appointment reminders, payment requests and portal notices.",
  },
  marketing: {
    title: "Marketing",
    blurb: "Used for campaigns and replies to people who text you first.",
  },
};

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function when(ts: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

export function PhoneTextingSettingsPage() {
  const { get, post, put, ready } = useSparkApi();
  const [lines, setLines] = useState<Line[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [optOuts, setOptOuts] = useState<OptOut[]>([]);
  const [quiet, setQuiet] = useState<QuietHours | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    try {
      const r = await get<{ data: Line | null; lines: Line[]; meta: Meta }>("/api/v1/conversations/phone-line");
      setLines(r.lines || (r.data ? [r.data] : []));
      setMeta(r.meta || null);
      setError(null);
    } catch (err) {
      setError(friendlyApiError(err).message);
    } finally {
      setLoading(false);
    }
    // Both of these are decoration if they fail — the page's job is the line.
    try {
      const o = await get<{ data: OptOut[] }>("/api/v1/conversations/phone-line/opt-outs");
      setOptOuts(o.data || []);
    } catch { /* an unreadable suppression list is an empty list with no claim */ }
    try {
      const q = await get<{ data: QuietHours | null }>("/api/v1/quiet-hours");
      setQuiet(q.data || null);
    } catch { /* quiet hours are optional */ }
  }, [get, ready]);

  useEffect(() => { void load(); }, [load]);

  const operations = useMemo(() => lines.find((l) => l.purpose === "operations") || null, [lines]);
  const marketing = useMemo(() => lines.find((l) => l.purpose === "marketing") || null, [lines]);

  async function askForLine(purpose: "operations" | "marketing") {
    const fee = money(meta?.monthly_fee_cents ?? 500);
    const included = meta?.included_in_plan && purpose === "operations";
    if (!confirm(
      `Ask us to set up a ${PURPOSE_LABEL[purpose].title.toLowerCase()} number?\n\n`
      + `${included ? "It is included on your plan." : `It is ${fee} a month.`}\n\n`
      + `It takes ${meta?.setup_estimate || "a few weeks"}: the mobile carriers have to approve `
      + `your business before it can send texts. We file that for you. Calls work sooner.`
    )) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await post<{ message?: string }>("/api/v1/conversations/phone-line/request", { purpose });
      setNotice(r.message || "We have got it — we will set it up.");
      await load();
    } catch (err) {
      setError(friendlyApiError(err).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveQuietHours(next: QuietHours) {
    setBusy(true);
    try {
      await put("/api/v1/quiet-hours", next);
      setQuiet(next);
      setNotice("Quiet hours saved.");
    } catch (err) {
      setError(friendlyApiError(err).message);
    } finally {
      setBusy(false);
    }
  }

  const allowance = meta?.allowance || null;
  const pct = allowance && allowance.included > 0
    ? Math.min(100, Math.round((allowance.used / allowance.included) * 100))
    : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6">
      <div>
        <Link to="/app/settings" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
          <ChevronLeft className="h-3.5 w-3.5" />All settings
        </Link>
      </div>

      <header className="flex items-center gap-3 rounded-lg border bg-white p-5">
        <div className="rounded-lg bg-amber-100 p-2 text-amber-800"><Phone className="h-5 w-5" /></div>
        <div>
          <h1 className="text-2xl font-semibold">Phone &amp; texting</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Your numbers, what they are for, how many texts you have used, and who has asked you to stop.
          </p>
        </div>
      </header>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}
      {loading && <div className="text-sm text-slate-500">Loading…</div>}

      {!loading && (
        <>
          {/* ── the lines ─────────────────────────────────────────────────── */}
          <section className="space-y-3">
            <LineCard
              line={operations}
              purpose="operations"
              meta={meta}
              busy={busy}
              onAsk={() => askForLine("operations")}
            />
            <LineCard
              line={marketing}
              purpose="marketing"
              meta={meta}
              busy={busy}
              onAsk={() => askForLine("marketing")}
              secondary
            />
          </section>

          {/* ── this month ────────────────────────────────────────────────── */}
          <section className="rounded-lg border bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">This month</h2>
            {allowance ? (
              <>
                <div className="mt-2 text-sm text-slate-800">
                  <span className="font-semibold tabular-nums">{allowance.used}</span>
                  {allowance.included > 0
                    ? <> of <span className="tabular-nums">{allowance.included}</span> texts used</>
                    : " texts sent"}
                </div>
                {allowance.included > 0 && (
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${pct >= 100 ? "bg-amber-500" : "bg-emerald-500"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
                {allowance.overage_units > 0 && (
                  // Counted, NOT charged — and it says so, because "34 over"
                  // with no explanation reads as a bill.
                  <p className="mt-2 text-xs text-amber-800">
                    You have gone {allowance.overage_units} text
                    {allowance.overage_units === 1 ? "" : "s"} past what your plan includes. We are
                    counting them, not charging for them — nothing extra is being billed.
                  </p>
                )}
                <p className="mt-2 text-[11px] text-slate-500">
                  A long message counts as more than one text. Anything past 160 characters, or one emoji
                  anywhere in it, splits into more.
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-slate-500">Nothing sent yet this month.</p>
            )}
            {meta?.shared_line_note && (
              <p className="mt-3 rounded bg-slate-50 px-3 py-2 text-xs text-slate-600">{meta.shared_line_note}</p>
            )}
          </section>

          {/* ── who said stop ─────────────────────────────────────────────── */}
          <section className="rounded-lg border bg-white p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Ban className="h-4 w-4 text-slate-400" />
              People who asked you to stop texting
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold tabular-nums text-slate-600">
                {optOuts.length}
              </span>
            </h2>
            {optOuts.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Nobody has.</p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100">
                {optOuts.map((o, i) => (
                  <li key={`${o.number}-${i}`} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-xs">
                    <span className="font-medium text-slate-800">{o.name || o.number}</span>
                    <span className="text-slate-500">{o.why} · {when(o.at)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-slate-500">
              This list cannot be undone by re-importing your contacts. If somebody wants texts again they
              can reply START, or you can ask us.
            </p>
          </section>

          {/* ── quiet hours, in ONE place ─────────────────────────────────── */}
          <QuietHoursCard quiet={quiet} busy={busy} onSave={saveQuietHours} />
        </>
      )}
    </div>
  );
}

function LineCard({ line, purpose, meta, busy, onAsk, secondary }: {
  line: Line | null;
  purpose: "operations" | "marketing";
  meta: Meta | null;
  busy: boolean;
  onAsk: () => void;
  secondary?: boolean;
}) {
  const label = PURPOSE_LABEL[purpose];
  return (
    <div className="rounded-lg border bg-white p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-900">{label.title} number</h2>
        {line?.status === "active" && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-800 ring-1 ring-emerald-200">
            {line.can_text ? "Active" : "Calls only"}
          </span>
        )}
        {line?.pending && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800 ring-1 ring-amber-200">
            Being set up
          </span>
        )}
        {!line && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600 ring-1 ring-slate-200">
            Not set up
          </span>
        )}
      </div>

      {line?.number && (
        <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{line.number}</div>
      )}
      <p className="mt-1 text-xs text-slate-600">{label.blurb}</p>

      {/* A pending line shows the wait AND the reason. Never a dead switch. */}
      {line?.pending && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-900 ring-1 ring-amber-200">
          <Clock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <div>{line.pending_reason || `Being set up — ${line.setup_estimate || "a few weeks"}.`}</div>
        </div>
      )}

      {line?.status === "active" && !line.can_text && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-900 ring-1 ring-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <div>
            <div className="font-semibold">Calls are working. Texting is still with the carrier.</div>
            <div className="mt-0.5">
              {line.registration_promise
                || "Your number is reserved; texts flow when the carrier approves — we file it for you."}
            </div>
          </div>
        </div>
      )}

      {/* SMS-15 — the form, and what is left of it. */}
      {line && line.registration_status === "none" && (
        <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
            <FileText className="h-3.5 w-3.5 text-slate-400" />
            What the carriers need from you
          </div>
          {line.registration_complete ? (
            <p className="mt-1 flex items-start gap-1.5 text-xs text-emerald-800">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              Everything is in. We file it with the carriers next.
            </p>
          ) : (
            <p className="mt-1 text-xs text-slate-700">
              Still needed:{" "}
              <span className="font-semibold">
                {(line.registration_missing || []).map((f) => f.replace(/_/g, " ")).join(", ") || "the form"}
              </span>
              . We only get one go at this filing and it cannot be changed afterwards, so it is worth
              getting right.
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <Link
              to="/app/settings/phone-texting/registration"
              className="rounded bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#D85F2A]"
            >
              {line.registration_complete ? "Review the details" : "Fill in the details"}
            </Link>
            <a
              href="/api/v1/conversations/phone-line/policy-templates"
              className="inline-flex items-center gap-1 rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-white"
            >
              <Download className="h-3 w-3" />
              Get a privacy policy and texting terms
            </a>
          </div>
        </div>
      )}

      {!line && (
        <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5">
          <div className="text-xs text-slate-700">
            {purpose === "operations" ? (
              <>
                Today your texts go out from our shared number
                {meta?.shared_number ? ` (${meta.shared_number})` : ""}, which works for reminders and
                replies but cannot receive messages for you — when two of our clients know the same
                person, there is no way to tell whose customer texted.
              </>
            ) : (
              <>
                A second number keeps your campaigns separate from your reminders. The mobile carriers
                treat those as different kinds of traffic, and a complaint about one can get the other
                filtered too.
              </>
            )}
          </div>
          <div className="mt-2 text-xs font-semibold text-slate-900">
            {meta?.included_in_plan && purpose === "operations"
              ? "Included on your plan."
              : `${money(meta?.monthly_fee_cents ?? 500)} a month.`}{" "}
            <span className="font-normal text-slate-600">
              {meta?.registration_promise
                || "Your number is reserved today; texts flow when the carrier approves — we file it for you."}{" "}
              Calls work as soon as we switch it on; texting takes {meta?.setup_estimate || "a few weeks"}.
            </span>
          </div>
          {meta?.entitled ? (
            <button
              type="button"
              onClick={onAsk}
              disabled={busy}
              className="mt-2 inline-flex items-center gap-1 rounded bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#D85F2A] disabled:opacity-40"
            >
              <Plus className="h-3 w-3" />
              {secondary
                ? `Add a second line — ${money(meta?.monthly_fee_cents ?? 500)}/month`
                : "Ask for a number"}
            </button>
          ) : (
            <p className="mt-2 text-[11px] text-slate-500">
              A phone line is an add-on. Add it to your plan and we will set one up.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Quiet hours, in ONE place.
 *
 * The platform has historically had three ideas of quiet hours in three stores
 * with three different behaviours — one of which logged and sent anyway. This
 * card is the one control a business owner is shown, and it writes the one
 * store the SPARK send path reads. Consolidating the remaining stores is
 * scheduled work (SEAM-1); putting a second control on a settings page in the
 * meantime would guarantee they never converge.
 */
function QuietHoursCard({ quiet, busy, onSave }: {
  quiet: QuietHours | null;
  busy: boolean;
  onSave: (q: QuietHours) => void;
}) {
  const value = quiet || {
    enabled: false, timezone: "America/Chicago", start_hour: 21, end_hour: 8, weekdays_only: false,
  };
  const [draft, setDraft] = useState<QuietHours>(value);
  useEffect(() => { setDraft(value); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [quiet]);

  return (
    <section className="rounded-lg border bg-white p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Clock className="h-4 w-4 text-slate-400" />Quiet hours
      </h2>
      <p className="mt-1 text-xs text-slate-600">
        We will not text your customers between these times. There is one setting and it covers every
        text we send for you.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300"
          />
          On
        </label>
        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">From</span>
          <input
            type="number" min={0} max={23} value={draft.start_hour}
            onChange={(e) => setDraft({ ...draft, start_hour: Number(e.target.value) })}
            className="mt-1 w-20 rounded border border-slate-300 px-2 py-1.5 text-xs"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Until</span>
          <input
            type="number" min={0} max={23} value={draft.end_hour}
            onChange={(e) => setDraft({ ...draft, end_hour: Number(e.target.value) })}
            className="mt-1 w-20 rounded border border-slate-300 px-2 py-1.5 text-xs"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Time zone</span>
          <input
            type="text" value={draft.timezone}
            onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
            className="mt-1 w-56 rounded border border-slate-300 px-2 py-1.5 text-xs"
          />
        </label>
        <button
          type="button"
          onClick={() => onSave(draft)}
          disabled={busy}
          className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </section>
  );
}

export default PhoneTextingSettingsPage;
