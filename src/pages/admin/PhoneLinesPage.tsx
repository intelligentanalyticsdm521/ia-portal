// PhoneLinesPage — Platform Admin → Phone lines. FOUNDER ONLY.
//
// The page where IADM spends money on a carrier, so it is built to make that
// impossible to do by accident and impossible to do without seeing the number.
//
// WHAT IT SHOWS, and why each part is on the screen:
//   · A banner saying whether buying is switched ON at all. With
//     ACS_NUMBER_PURCHASE_ENABLED off — which is everywhere, including
//     production, until somebody sets it — Provision creates a fictional
//     +1 555 01xx number, bills nothing, and the row is marked "stand-in". The
//     banner is what stops a founder believing they bought something they did
//     not, or believing they did not buy something they did.
//   · Cost in real dollars. AG-1 puts plain words on the client's screen and
//     real money only here: what the line costs us, what the client pays, and
//     therefore what it makes.
//   · The lifecycle as buttons that only appear when they are legal. A line
//     cannot be activated before it has a number; it cannot be verified before
//     it has been provisioned. Hiding an illegal step beats explaining a 409.
//   · Release types-the-number-to-confirm, because a released number cannot be
//     got back and the client's customers still have it in their phones.
//   · The D2 text-back switch, per line, with the platform switch shown beside
//     it — turning one on without the other sends nothing, and the page says so
//     rather than letting somebody think they enabled a feature.
//
// The route is founder-gated in App.tsx AND every endpoint behind it is
// founder-gated in LUMEN and fails CLOSED. Hiding the link is not what protects
// this page.
import { useCallback, useEffect, useState } from "react";
import {
  Phone, ShieldAlert, CheckCircle2, Clock, AlertTriangle, Ban, Sparkles, DollarSign,
} from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { friendlyApiError } from "../../lib/leadgenBilling";

interface Line {
  id: number;
  tenant_id: string;
  business_name: string | null;
  kind: string;
  /** What the number is FOR. A business may hold one of each, and carriers
   *  treat the two kinds of traffic differently. */
  purpose: "operations" | "marketing";
  number: string | null;
  /** PER CLIENT, and it cannot be pre-done. The number came out of the pool in
   *  a second; the right to send from it on behalf of THIS business is a
   *  submission the carrier approves or rejects. */
  registration_status: "none" | "submitted" | "approved" | "rejected";
  can_text: boolean;
  can_take_calls: boolean;
  status: "requested" | "provisioning" | "verifying" | "active" | "suspended" | "released";
  pending: boolean;
  monthly_fee_cents: number;
  our_cost_cents: number;
  included_in_plan: boolean;
  sms_included_per_month: number;
  is_mock: boolean;
  acs_resource_id: string | null;
  verification_ref: string | null;
  verification_note: string | null;
  forward_to_e164: string | null;
  missed_call_text_back: boolean;
  provisioned_by: string | null;
  requested_by: string | null;
  notes: string | null;
  requested_at: string;
  active_at: string | null;
}

interface PoolStatus {
  available: number;
  target: number;
  short_by: number;
  purchase_live: boolean;
  cool_off_days: number;
  counts: Record<string, number>;
}

interface Meta {
  purchase_enabled: boolean;
  purchase_flag: string;
  text_back_enabled: boolean;
  text_back_flag: string;
  speech_usd_per_minute: number;
  cost_sentence: string;
  setup_estimate: string;
  pool?: PoolStatus | null;
}

/** What the carrier has said about THIS business on THIS number. Separate from
 *  the line's own status on purpose: a line can be live and taking calls while
 *  its texting is still waiting on somebody else's queue. */
const REGISTRATION_CHIP: Record<Line["registration_status"], { label: string; cls: string }> = {
  none: { label: "Not filed", cls: "bg-slate-100 text-slate-600 ring-slate-200" },
  submitted: { label: "With the carrier", cls: "bg-amber-100 text-amber-800 ring-amber-200" },
  approved: { label: "Texting approved", cls: "bg-emerald-100 text-emerald-800 ring-emerald-200" },
  rejected: { label: "Rejected", cls: "bg-rose-100 text-rose-800 ring-rose-200" },
};

const STATUS_CHIP: Record<Line["status"], { label: string; cls: string }> = {
  requested: { label: "Requested", cls: "bg-sky-100 text-sky-800 ring-sky-200" },
  provisioning: { label: "Number bought", cls: "bg-indigo-100 text-indigo-800 ring-indigo-200" },
  verifying: { label: "With the carrier", cls: "bg-amber-100 text-amber-800 ring-amber-200" },
  active: { label: "Live", cls: "bg-emerald-100 text-emerald-800 ring-emerald-200" },
  suspended: { label: "Suspended", cls: "bg-slate-200 text-slate-700 ring-slate-300" },
  released: { label: "Released", cls: "bg-slate-100 text-slate-500 ring-slate-200" },
};

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function when(ts: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

export function PhoneLinesPage() {
  const { get, post, ready } = useSparkApi();
  const [lines, setLines] = useState<Line[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    try {
      const r = await get<{ data: Line[]; meta: Meta }>("/api/v1/conversations/admin/phone-lines");
      setLines(r.data || []);
      setMeta(r.meta || null);
      setError(null);
    } catch (err) {
      setError(friendlyApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [get, ready]);

  useEffect(() => { void load(); }, [load]);

  async function act(id: number, path: string, body: unknown, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(id);
    setNotice(null);
    try {
      const r = await post<{ note?: string; mocked?: boolean }>(
        `/api/v1/conversations/admin/phone-line/${id}/${path}`, body
      );
      if (r.note) setNotice(r.note);
      await load();
    } catch (err) {
      alert(friendlyApiError(err).message);
    } finally {
      setBusy(null);
    }
  }

  function provision(l: Line) {
    const plan = prompt(
      `${meta?.cost_sentence || ""}\n\n`
      + `Which plan is ${l.business_name || "this business"} on? Type "growth" or "authority".\n`
      + `(authority includes the line at no extra charge and carries a larger text allowance.)`,
      "growth"
    );
    if (!plan) return;
    const normalised = plan.trim().toLowerCase();
    void act(
      l.id, "provision",
      { confirm_spend: true, plan: normalised, included_in_plan: normalised === "authority" },
      meta?.purchase_enabled
        ? `This buys a REAL toll-free number now and starts a real monthly bill.\n\n${meta?.cost_sentence}\n\nGo ahead?`
        : `${meta?.purchase_flag} is off, so this creates a stand-in number and bills nothing. Go ahead?`
    );
  }

  function register(l: Line) {
    const legal = prompt(
      `File ${l.business_name || "this business"}'s carrier registration for ${l.number}.\n\n`
      + `This cannot be edited once it is filed, and the carrier approves or rejects THIS business — `
      + `buying the number in advance does not make it faster.\n\n`
      + `Legal business name:`
    );
    if (!legal) return;
    const address = prompt("Registered address:");
    if (!address) return;
    const website = prompt("Website:");
    if (!website) return;
    const ein = prompt("EIN (optional — leave blank if none):") || null;
    const samples = prompt(
      "One sample message the carrier will see (what this business actually texts):",
      "Hi {name}, this is a reminder about your appointment tomorrow at {time}. Reply STOP to opt out."
    );
    const optIn = prompt(
      "How does this business collect consent to text?",
      "Customers give their mobile number when they book, and tick a box agreeing to text updates."
    );
    void act(l.id, "register", {
      registration: {
        legal_name: legal.trim(), address: address.trim(), website: website.trim(),
        ein: ein?.trim() || null, sample_messages: samples ? [samples.trim()] : [],
        opt_in_description: optIn?.trim() || null,
      },
    });
  }

  function decide(l: Line, approved: boolean) {
    const note = approved ? null : prompt("What did the carrier say? (kept so a rejection can be answered)");
    if (!approved && note === null) return;
    void act(
      l.id, "registration-decision", { approved, note },
      approved
        ? `Mark ${l.number} approved? Texting starts working for this business immediately.`
        : undefined
    );
  }

  function verify(l: Line) {
    const ref = prompt(
      "Toll-free verification reference from the carrier.\n\n"
      + "A TFV submission cannot be edited once it is filed, so paste the id exactly."
    );
    if (!ref) return;
    void act(l.id, "verify", { verification_ref: ref.trim() });
  }

  function release(l: Line) {
    const typed = prompt(
      `Release ${l.number}?\n\n`
      + `This hands the number back to the carrier. It CANNOT be got back, and `
      + `${l.business_name || "this business"}'s customers still have it in their phones.\n\n`
      + `Type the number to confirm.`
    );
    if (!typed) return;
    void act(l.id, "release", { confirm_number: typed.trim() });
  }

  const waiting = lines.filter((l) => l.status !== "active" && l.status !== "released");
  const live = lines.filter((l) => l.status === "active");
  const monthlyCost = live.reduce((n, l) => n + l.our_cost_cents, 0);
  const monthlyFee = live.reduce((n, l) => n + (l.included_in_plan ? 0 : l.monthly_fee_cents), 0);

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <header className="flex items-center gap-3">
        <div className="rounded-lg bg-amber-100 p-2 text-amber-800"><Phone className="h-5 w-5" /></div>
        <div>
          <h1 className="text-2xl font-semibold">Phone lines</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Every business's own number: what it costs us, what it earns, and what is waiting on you.
          </p>
        </div>
      </header>

      {/* The switch that decides whether any of these buttons spend money. */}
      {meta && (
        <div className={`flex items-start gap-2 rounded-lg p-3 text-sm ring-1 ${
          meta.purchase_enabled
            ? "bg-rose-50 text-rose-900 ring-rose-200"
            : "bg-slate-50 text-slate-700 ring-slate-200"
        }`}>
          {meta.purchase_enabled
            ? <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
            : <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />}
          <div>
            <div className="font-semibold">
              {meta.purchase_enabled
                ? "Buying numbers is LIVE. Provision spends real money."
                : "Buying numbers is off. Provision creates a stand-in and bills nothing."}
            </div>
            <div className="mt-0.5 text-xs">
              {meta.purchase_flag} ={" "}
              <code className="rounded bg-white/60 px-1">{String(meta.purchase_enabled)}</code>
              {" · "}
              {meta.text_back_flag} ={" "}
              <code className="rounded bg-white/60 px-1">{String(meta.text_back_enabled)}</code>
              {!meta.text_back_enabled && " (missed-call text-back sends nothing on any line)"}
              {" · voicemail transcription "}
              ${meta.speech_usd_per_minute.toFixed(3)}/minute
            </div>
            {meta.pool && (
              <div className="mt-1 text-xs">
                Number pool: <span className="font-semibold tabular-nums">{meta.pool.available}</span> spare of{" "}
                {meta.pool.target}
                {meta.pool.short_by > 0 && (
                  <span className="ml-1 text-amber-800">
                    — {meta.pool.short_by} short; the 15-minute top-up will{" "}
                    {meta.pool.purchase_live ? "BUY" : "mint stand-ins for"} them
                  </span>
                )}
                {meta.pool.counts?.cooling
                  ? ` · ${meta.pool.counts.cooling} cooling off (${meta.pool.cool_off_days} days before they can be handed back)`
                  : ""}
              </div>
            )}
          </div>
        </div>
      )}

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {notice && (
        <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs uppercase tracking-wider text-slate-500">Live lines</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{live.length}</div>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <div className="flex items-center gap-1 text-xs uppercase tracking-wider text-slate-500">
            <DollarSign className="h-3 w-3" />Costs us a month
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{money(monthlyCost)}</div>
          <div className="text-[10px] text-slate-400">numbers only; usage on top</div>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs uppercase tracking-wider text-slate-500">Billed to clients</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{money(monthlyFee)}</div>
          <div className="text-[10px] text-slate-400">lines included on a plan are not counted</div>
        </div>
      </div>

      {loading && <div className="text-sm text-slate-500">Loading…</div>}

      {!loading && waiting.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Clock className="h-4 w-4 text-amber-600" />Waiting on you
          </h2>
          <div className="space-y-2">
            {waiting.map((l) => <Row key={l.id} l={l} meta={meta} busy={busy === l.id}
              onProvision={() => provision(l)} onVerify={() => verify(l)}
              onActivate={() => void act(l.id, "activate", {})}
              onSuspend={() => void act(l.id, "suspend", {}, `Suspend ${l.number}? The number stays ours.`)}
              onRelease={() => release(l)}
              onRegister={() => register(l)}
              onDecide={(ok) => decide(l, ok)}
              onTextBack={(on) => void act(l.id, "text-back", { enabled: on })} />)}
          </div>
        </section>
      )}

      {!loading && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />Live
          </h2>
          {live.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
              No business has a live number yet.
            </p>
          ) : (
            <div className="space-y-2">
              {live.map((l) => <Row key={l.id} l={l} meta={meta} busy={busy === l.id}
                onProvision={() => provision(l)} onVerify={() => verify(l)}
                onActivate={() => void act(l.id, "activate", {})}
                onSuspend={() => void act(l.id, "suspend", {}, `Suspend ${l.number}? The number stays ours.`)}
                onRelease={() => release(l)}
                onRegister={() => register(l)}
                onDecide={(ok) => decide(l, ok)}
                onTextBack={(on) => void act(l.id, "text-back", { enabled: on })} />)}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Row({ l, meta, busy, onProvision, onVerify, onActivate, onSuspend, onRelease, onTextBack, onRegister, onDecide }: {
  l: Line; meta: Meta | null; busy: boolean;
  onProvision: () => void; onVerify: () => void; onActivate: () => void;
  onSuspend: () => void; onRelease: () => void; onTextBack: (on: boolean) => void;
  onRegister: () => void; onDecide: (approved: boolean) => void;
}) {
  const chip = STATUS_CHIP[l.status];
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">{l.business_name || l.tenant_id}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600 ring-1 ring-slate-200">
              {l.purpose === "marketing" ? "Marketing" : "Operations"}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ${chip.cls}`}>
              {chip.label}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ${REGISTRATION_CHIP[l.registration_status].cls}`}
              title="Calls work as soon as the line is active. Texting needs the carrier to approve this business."
            >
              {REGISTRATION_CHIP[l.registration_status].label}
            </span>
            {l.is_mock && (
              <span
                className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase text-violet-800 ring-1 ring-violet-200"
                title="No number was bought — nothing is billed for this line."
              >
                Stand-in
              </span>
            )}
            {l.included_in_plan && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600 ring-1 ring-slate-200">
                Included
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs tabular-nums text-slate-600">
            {l.number || "no number yet"}
            {" · "}costs {money(l.our_cost_cents)}/mo
            {" · "}billed {l.included_in_plan ? "included" : `${money(l.monthly_fee_cents)}/mo`}
            {" · "}{l.sms_included_per_month} texts/mo
          </div>
          <div className="mt-0.5 text-[10px] text-slate-400">
            Requested {when(l.requested_at)}{l.requested_by ? ` by ${l.requested_by}` : ""}
            {l.active_at ? ` · live since ${when(l.active_at)}` : ""}
            {l.verification_ref ? ` · TFV ${l.verification_ref}` : ""}
            {l.provisioned_by ? ` · provisioned by ${l.provisioned_by}` : ""}
          </div>
        </div>

        <div className="flex flex-shrink-0 flex-wrap gap-1.5">
          {l.status === "requested" && (
            <button type="button" onClick={onProvision} disabled={busy}
              className="rounded bg-[#EF6C33] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#D85F2A] disabled:opacity-40"
              title={meta?.cost_sentence}>
              Provision{meta?.purchase_enabled ? " ($)" : " (stand-in)"}
            </button>
          )}
          {l.number && l.registration_status === "none" && (
            <button type="button" onClick={onRegister} disabled={busy}
              className="rounded bg-slate-800 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-40"
              title="Per client, and it cannot be pre-done. Buying the number in advance does not make this faster.">
              File carrier registration
            </button>
          )}
          {l.registration_status === "submitted" && (
            <>
              <button type="button" onClick={() => onDecide(true)} disabled={busy}
                className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">
                Carrier approved
              </button>
              <button type="button" onClick={() => onDecide(false)} disabled={busy}
                className="rounded border border-rose-200 px-2.5 py-1 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-40">
                Rejected
              </button>
            </>
          )}
          {l.status === "provisioning" && (
            <button type="button" onClick={onVerify} disabled={busy}
              className="rounded border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">
              Record TFV
            </button>
          )}
          {(l.status === "verifying" || l.status === "provisioning" || l.status === "suspended") && l.number && (
            <button type="button" onClick={onActivate} disabled={busy}
              className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">
              Activate
            </button>
          )}
          {l.status === "active" && (
            <button type="button" onClick={onSuspend} disabled={busy}
              className="rounded border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40">
              Suspend
            </button>
          )}
          {l.number && l.status !== "released" && (
            <button type="button" onClick={onRelease} disabled={busy}
              className="flex items-center gap-1 rounded border border-rose-200 px-2.5 py-1 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-40">
              <Ban className="h-3 w-3" />Release
            </button>
          )}
        </div>
      </div>

      {/* D2 — per line, with the platform switch beside it. Only on a line the
          carrier has approved: offering it on one that cannot text yet would be
          a switch that does nothing for a reason nobody mentioned. */}
      {l.status === "active" && l.can_text && (
        <label className="mt-2 flex cursor-pointer items-center gap-2 rounded bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-700">
          <input
            type="checkbox"
            checked={l.missed_call_text_back}
            disabled={busy}
            onChange={(e) => onTextBack(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-300"
          />
          <Sparkles className="h-3 w-3 text-slate-400" />
          <span>Missed-call text-back</span>
          {!meta?.text_back_enabled && (
            <span className="flex items-center gap-1 text-amber-700">
              <AlertTriangle className="h-3 w-3" />
              nothing will send — {meta?.text_back_flag} is off platform-wide, pending the texting-consent read
            </span>
          )}
        </label>
      )}
    </div>
  );
}

export default PhoneLinesPage;
