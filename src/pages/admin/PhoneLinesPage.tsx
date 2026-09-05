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
  ExternalLink, Users,
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
  /** LINE-4. DAYS, not a timestamp: toll-free verification status cannot be
   *  read from the CLI or any API, so somebody has to open the Azure portal and
   *  look — and "waiting 19 days" is what makes them do it. */
  days_waiting: number | null;
  regulatory_blade_url?: string;
  registration_sunk_cents?: number;
  registration_cost_cents?: number;
  /** SMS-15. The carrier form has to be finished before this line can be
   *  filed: the fee is non-refundable at submission and a submission cannot be
   *  edited afterwards. */
  registration_complete?: boolean;
  registration_missing?: string[];
  registration_unchecked?: string[];
  sole_proprietor?: boolean;
}

interface CoolingNumber {
  id: number;
  number: string | null;
  kind: string;
  cooling_since: string | null;
  releasable_at: string | null;
  releasable_now: boolean;
  /** LINE-2. A churned client's number goes back to the CARRIER, never to
   *  another client — it carries their opt-in history and their customers still
   *  have it in their phones. */
  never_reassign: boolean;
  previous_business: string | null;
}

interface PoolStatus {
  available: number;
  /** LINE-4. "3 local · 2 toll-free" is the sentence; one aggregate number
   *  hides the case that bites — five toll-free in stock and a client who wants
   *  a local one. */
  available_by_kind?: Record<string, number>;
  /** LINE-1 — the two TARGETS, from platform-api, which owns the pool and runs
   *  the top-up. `null` when it could not be reached, and the page says that
   *  rather than implying the bank is full. */
  targets?: { local: number; toll_free: number; total: number; auto_top_up: string[] } | null;
  targets_unavailable?: boolean;
  target: number | null;
  short_by: number | null;
  /** Short of target BY KIND. The aggregate says "one short"; only the split
   *  says which one, and only the split can be acted on. */
  short_by_kind?: Record<string, number> | null;
  /** Which kinds the 15-minute tick will actually buy on its own. LOCAL only —
   *  a toll-free number bought ahead cannot text until its OWN verification
   *  clears weeks later, so buying it before a client asks rents a number that
   *  cannot do the job. */
  auto_top_up_kinds?: string[] | null;
  purchase_live: boolean;
  cool_off_days: number;
  counts: Record<string, number>;
  cooling?: CoolingNumber[];
}

/** SMS-12/13 — the price list, as platform-api answers it. */
interface Pricing {
  monthly_cents: number;
  included_segments: number;
  overage_cents_per_segment: number;
  overage_billed: boolean;
  overage_billing_flag?: string;
  activation: { fee_cents: number; full_fee_cents: number; waived: boolean; reason: string | null };
  lines: { price: string; included: string; overage: string; activation: string };
  confirm: string;
  our_cost_cents_per_segment?: number;
  our_cost_unverified?: boolean;
  billing?: { live: boolean; flag: string; blocked: string | null };
}

/** SMS-10 — who files carrier registrations, and who could. */
interface RegistrationProviders {
  active: string;
  flag: string;
  providers: Array<{
    key: string;
    label: string;
    in_use: boolean;
    api_driven: boolean;
    minutes_of_human_work_per_client: number;
    scales_to: string;
    where_to_look: string;
    limits: string[];
    live?: boolean;
    blocked?: string | null;
  }>;
}

interface SharedLineLoad {
  period: string;
  businesses: number;
  segments: number;
  cap_per_business: number;
  fallback_enabled: boolean;
}

interface AllowanceRow {
  tenant_id: string;
  business_name: string | null;
  included: number;
  used: number;
  overage_units: number;
  shared_used: number;
  by_source: Record<string, number>;
  refused: Record<string, number>;
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
  shared_line?: SharedLineLoad | null;
  allowance_by_business?: AllowanceRow[];
  failed_registrations?: number;
  failed_registration_cost_cents?: number;
  registration_fee_cents?: number;
  regulatory_blade_url?: string;
  pricing?: Pricing | null;
  pricing_unavailable?: boolean;
  registration_providers?: RegistrationProviders | null;
  pool_targets?: { local: number; toll_free: number; total: number; auto_top_up: string[] } | null;
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
  // PRE-WALK 1: a refusal is not a reading. GET /conversations/admin/* answers
  // 403 phone_lines_founder_only to anybody who is not the founder, and the
  // page went on to render LIVE LINES 0, COSTS US A MONTH $0.00 and "No
  // business has a live number yet" with the refusal in small print underneath.
  // A founder whose role had lapsed would read the zeros as fact. The status
  // decides which of the two the page is: a refusal, or a number.
  const [refused, setRefused] = useState<string | null>(null);
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
      setRefused(null);
    } catch (err) {
      const e = friendlyApiError(err) as Error & { status?: number };
      // 401/403 = "you cannot see this". Anything else is a fault, and a fault
      // still gets the red strip it always had.
      if (e.status === 403 || e.status === 401) { setRefused(e.message); setError(null); }
      else { setError(e.message); setRefused(null); }
      setLines([]);
      setMeta(null);
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
    // SMS-12/13 — the price list is refused-on rather than guessed at. A line
    // stamped with the wrong allowance carries it for years, so if platform-api
    // could not be read the button says why instead of provisioning anyway.
    if (meta?.pricing_unavailable) {
      window.alert(
        "The price list could not be read from the platform service, so this cannot provision.\n\n"
        + "A line is stamped with its allowance and its activation fee at this moment and keeps them for "
        + "as long as it exists. Try again in a minute."
      );
      return;
    }
    const plan = prompt(
      `${meta?.cost_sentence || ""}\n\n`
      + `Which plan is ${l.business_name || "this business"} on? Type "growth" or "authority".\n`
      + `(authority includes the line at no extra charge and carries a larger text allowance.)`,
      "growth"
    );
    if (!plan) return;
    const normalised = plan.trim().toLowerCase();
    // LINE-1 — LOCAL by default. $1/month against toll-free's ~$2, better
    // delivery, and it can take calls on day one; toll-free is for the client
    // who insists on an 800 number.
    const tollFree = window.confirm(
      "Does this business specifically want a TOLL-FREE (800) number?\n\n"
      + "OK = toll-free. Cancel = a local number, which is what we recommend: it costs half as much, "
      + "delivers better, and can take calls the day it is bought."
    );
    void act(
      l.id, "provision",
      {
        confirm_spend: true, plan: normalised,
        included_in_plan: normalised === "authority",
        kind: tollFree ? "toll_free" : "local",
      },
      meta?.purchase_enabled
        ? `This buys a REAL ${tollFree ? "toll-free" : "local"} number now and starts a real monthly bill.\n\n`
          + `${meta?.cost_sentence}\n\nGo ahead?`
        : `${meta?.purchase_flag} is off, so this creates a stand-in ${tollFree ? "toll-free" : "local"} `
          + "number and bills nothing. Go ahead?"
    );
  }

  /**
   * FILE IT. The $44 moment.
   *
   * This used to be six browser prompts typed by the founder — legal name,
   * address, website, EIN, one sample message, a sentence about consent — which
   * is both the fastest way to file a rejection and the wrong person to ask.
   * The CLIENT fills the form now (Settings › Phone & texting), it is validated
   * and blocking, and the button above only exists once it is complete. So this
   * is a confirmation, not a data-entry screen: the record already exists and
   * this sends it.
   */
  function register(l: Line) {
    const fee = money(l.registration_cost_cents ?? 4400);
    if (!confirm(
      `File ${l.business_name || "this business"}'s carrier registration for ${l.number}?

`
      + `This costs ${fee} and the fee is spent whether the carrier approves or refuses. `
      + `It CANNOT be edited once it is sent, and a refusal means paying it again and waiting `
      + `another 5 to 8 business days.

`
      + `It files what the client filled in on their own Phone & texting page.`
    )) return;
    void act(l.id, "register", {});
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

      {/* Refused: the page says so and stops. No zeros, no "nobody has a
          number yet" — both of those are claims about the world, and a refusal
          is the absence of one. */}
      {refused && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="font-semibold">You cannot see this.</div>
          <p className="mt-1">{refused}</p>
          <p className="mt-2 text-xs text-amber-800">
            Phone lines are founder-only. Nothing below is hidden or empty — it was not read at all,
            so this page is showing you no numbers rather than the wrong ones.
          </p>
        </div>
      )}

      {/* The switch that decides whether any of these buttons spend money. */}
      {!refused && meta && (
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
                Number pool: <span className="font-semibold tabular-nums">{meta.pool.available}</span> spare
                {meta.pool.targets
                  ? <> of {meta.pool.targets.total} ({meta.pool.targets.local} local · {meta.pool.targets.toll_free} toll-free)</>
                  : <span className="ml-1 text-amber-800">— we could not read the targets from the platform service</span>}
                {(meta.pool.short_by ?? 0) > 0 && (
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
            {/* SMS-12/13 — the price list, on the page where the buttons are.
                Every figure comes from platform-api's one home for them, so the
                founder page and the client page cannot quote different prices. */}
            {meta.pricing && (
              <div className="mt-1 text-xs">
                Sold at <span className="font-semibold">{money(meta.pricing.monthly_cents)}/month</span>
                {" · "}{meta.pricing.included_segments} texts included
                {" · "}{money(meta.pricing.overage_cents_per_segment)}/text over
                {" "}<span className={meta.pricing.overage_billed ? "text-rose-800" : ""}>
                  ({meta.pricing.overage_billed ? "CHARGED" : "counted, not charged"}
                  {meta.pricing.overage_billing_flag ? ` — ${meta.pricing.overage_billing_flag}` : ""})
                </span>
                {" · "}{money(meta.pricing.activation.full_fee_cents)} activation
                {" (waived on Authority, Business and OLIVER Pro+)"}
                {meta.pricing.billing && (
                  <> {" · "}Stripe {meta.pricing.billing.live ? "LIVE" : "off"} ({meta.pricing.billing.flag})</>
                )}
              </div>
            )}
            {meta.pricing_unavailable && (
              <div className="mt-1 text-xs text-amber-800">
                The price list could not be read from the platform service. Provisioning will refuse until
                it can — a line stamped with a guessed allowance carries it for years.
              </div>
            )}
          </div>
        </div>
      )}

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {notice && (
        <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>
      )}

      {/* ── LINE-4: the bank ───────────────────────────────────────────────
          Amber below two available of a kind, red at zero. The threshold is
          here rather than on the server because it is a judgement about how
          much warning a founder needs, not a fact about the pool. */}
      {!refused && meta?.pool && <BankLevel pool={meta.pool} />}

      {/* ── SMS-10: who files carrier registrations ────────────────────────
          The decision that has to be made before the eleventh client, on the
          page where the filing buttons are. */}
      {!refused && meta?.registration_providers && <RegistrationProvidersCard info={meta.registration_providers} />}

      {/* ── LINE-4: how hard the shared IA line is being ridden ────────────
          The compliance boundary from holistic §3. A number belongs to ONE
          registered brand, and ours carries every business without a line of
          its own. Past roughly ten paying businesses this needs a written read
          from the aggregator and a telecom attorney — and the only way anybody
          remembers that is if the number is on the screen before then. */}
      {!refused && meta?.shared_line && <SharedLineLoadCard load={meta.shared_line} />}

      {!refused && <div className="grid gap-3 sm:grid-cols-4">
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
        {/* Failed registrations, and the money they cost. Non-refundable at
            submission, so three rejections is real cash — and a PATTERN is only
            visible if the total is on the screen rather than three red chips. */}
        <div className={`rounded-lg border p-4 ${
          (meta?.failed_registrations || 0) > 0 ? "border-rose-200 bg-rose-50" : "bg-white"
        }`}>
          <div className="text-xs uppercase tracking-wider text-slate-500">Registrations refused</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{meta?.failed_registrations ?? 0}</div>
          <div className="text-[10px] text-slate-500">
            {money(meta?.failed_registration_cost_cents ?? 0)} spent and not coming back
          </div>
        </div>
      </div>}

      {loading && <div className="text-sm text-slate-500">Loading…</div>}

      {!refused && !loading && waiting.length > 0 && (
        <section>
          <h2 className="mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
            <Clock className="h-4 w-4 text-amber-600" />Waiting on you
            {meta?.regulatory_blade_url && (
              /* Toll-free verification status is not readable from the az CLI
                 or from any API — the Azure portal's Regulatory Documents blade
                 is the only place it exists. Somebody has to go and look, and
                 they need the link to hand. */
              <a
                href={meta.regulatory_blade_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-0.5 text-[10px] font-normal text-slate-600 hover:bg-slate-50"
              >
                <ExternalLink className="h-3 w-3" />Check status in the Azure portal
              </a>
            )}
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

      {!refused && !loading && meta?.allowance_by_business && meta.allowance_by_business.length > 0 && (
        <SegmentsThisMonth rows={meta.allowance_by_business} cap={meta.shared_line?.cap_per_business ?? null} />
      )}

      {!refused && !loading && (
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


/* ══════════════════════════════════════════════════════════════════════════
   LINE-4 — the bank, the shared line, and the segment sheet
   ══════════════════════════════════════════════════════════════════════════ */

/** Amber under two of a kind, red at zero. Ordering a number is instant; being
 *  APPROVED to send from it is five to eight business days, so running out is a
 *  problem discovered a fortnight after it started. Two is the amount of warning
 *  that is worth anything. */
function levelClass(n: number) {
  if (n <= 0) return "bg-rose-100 text-rose-900 ring-rose-200";
  if (n < 2) return "bg-amber-100 text-amber-900 ring-amber-200";
  return "bg-emerald-100 text-emerald-900 ring-emerald-200";
}

const KIND_LABEL: Record<string, string> = { local: "local", toll_free: "toll-free" };

function BankLevel({ pool }: { pool: PoolStatus }) {
  const byKind = pool.available_by_kind || {};
  const cooling = pool.cooling || [];
  // LINE-1 — the two kinds are ALWAYS both shown, even at zero, because "3
  // local available" alone reads as a full bank to somebody who has forgotten
  // there are two kinds.
  const kinds = ["local", "toll_free"];
  const auto = pool.auto_top_up_kinds || [];
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Numbers on hand</h2>
        {pool.targets
          ? (
            <span className="text-[10px] text-slate-400">
              target {pool.targets.local} local · {pool.targets.toll_free} toll-free
            </span>
          )
          : <span className="text-[10px] text-amber-700">targets unreadable</span>}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {kinds.map((k) => {
          const n = byKind[k] || 0;
          const want = pool.targets ? (k === "local" ? pool.targets.local : pool.targets.toll_free) : null;
          return (
            <span
              key={k}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ring-1 ${levelClass(n)}`}
              title={auto.includes(k)
                ? "Topped up automatically on the 15-minute tick."
                : "Bought only when you ask. A toll-free number cannot text until its own verification clears, so buying one ahead rents a number that cannot do the job."}
            >
              {n}{want == null ? "" : ` of ${want}`} {KIND_LABEL[k] || k} available
              {!auto.includes(k) && <span className="ml-1 font-normal text-[10px]">· on request</span>}
            </span>
          );
        })}
        {cooling.length > 0 && (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold tabular-nums text-slate-700 ring-1 ring-slate-200">
            {cooling.length} cooling
          </span>
        )}
      </div>
      {/* LINE-1 — short BY KIND, and only the kinds a timer will act on are
          described as something a timer will act on. Two toll-free short is not
          a job for the tick, and saying it is would leave somebody waiting. */}
      {(pool.short_by_kind?.local ?? 0) > 0 && (
        <p className="mt-2 text-[11px] text-amber-800">
          {pool.short_by_kind?.local} local short — the 15-minute top-up will{" "}
          {pool.purchase_live ? "BUY" : "mint stand-ins for"} them.
        </p>
      )}
      {(pool.short_by_kind?.toll_free ?? 0) > 0 && (
        <p className="mt-1 text-[11px] text-slate-600">
          {pool.short_by_kind?.toll_free} toll-free short. Nothing will buy those on its own — a toll-free
          number cannot text until its own verification clears, so we buy one when a client asks for an 800
          number and not before.
        </p>
      )}
      {cooling.length > 0 && (
        <ul className="mt-2 space-y-1">
          {cooling.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
              <span className="tabular-nums font-medium text-slate-800">{c.number || "—"}</span>
              <span className="text-slate-400">{KIND_LABEL[c.kind] || c.kind}</span>
              <span>
                {c.releasable_now
                  ? "cool-off finished — it can go back to the carrier"
                  : `back to the carrier after ${when(c.releasable_at)}`}
              </span>
              {c.never_reassign && (
                // LINE-2. It carries the previous business's opt-in history and
                // their customers still have it in their phones.
                <span
                  className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800 ring-1 ring-rose-200"
                  title="This number belonged to a business that left. It goes back to the carrier — never to another client."
                >
                  never reassign
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[10px] text-slate-400">
        A cancelled number waits {pool.cool_off_days} days before it can be handed back. Holding one
        costs about $2 a month; the alternative is a stranger receiving a business&rsquo;s appointment reminders.
      </p>
    </section>
  );
}

/**
 * How many businesses ride the shared IA number, and how hard.
 *
 * This is the number that decides when the product line has to change shape. A
 * US number belongs to exactly ONE registered brand, and ours is registered to
 * Intelligent Analytics — so every business we carry on it is traffic filed
 * under our name. It works at three clients. It is not a shape that survives
 * thirty, and if our sending reputation takes a hit it does not hit one client,
 * it hits every client on this infrastructure at once.
 */
/**
 * SMS-10 — who registers a business with the carriers, and what that costs in
 * human time.
 *
 * This card exists because the decision is invisible otherwise. ACS has no API
 * for brand or campaign registration: it is a wizard in the Azure portal, per
 * ACS resource, not editable after submission — about forty minutes of clicking
 * per client, forever, which works to roughly ten clients and then stops being
 * a software business. Twilio's ISV pattern does the same thing by API.
 *
 * The number that decides it is "minutes of human work per client" multiplied
 * by the client count on this very page, so it is printed here rather than
 * living in a document nobody re-reads.
 */
function RegistrationProvidersCard({ info }: { info: RegistrationProviders }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Carrier registration</h2>
        <span className="text-[10px] text-slate-400">{info.flag} = {info.active}</span>
      </div>
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        {info.providers.map((p) => (
          <div
            key={p.key}
            className={`rounded-lg p-3 text-xs ring-1 ${
              p.in_use ? "bg-amber-50 text-amber-900 ring-amber-200" : "bg-slate-50 text-slate-700 ring-slate-200"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{p.label}</span>
              {p.in_use && (
                <span className="rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold uppercase">In use</span>
              )}
              {!p.api_driven && (
                <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-rose-800">
                  by hand
                </span>
              )}
            </div>
            <p className="mt-1">
              {p.minutes_of_human_work_per_client > 0
                ? <>About <span className="font-semibold tabular-nums">{p.minutes_of_human_work_per_client} minutes</span> of your time per client. Scales to {p.scales_to}.</>
                : <>No human step per client. Scales to {p.scales_to}.</>}
            </p>
            {p.blocked && <p className="mt-1 text-[11px] text-slate-500">Not live: {p.blocked}.</p>}
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px]">
              {p.limits.map((l) => <li key={l}>{l}</li>)}
            </ul>
            <a
              href={p.where_to_look}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold underline"
            >
              Where to look <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-slate-400">
        Ask Microsoft about Messaging Connect first. If it does not give us per-client registration under one
        resource, the texting registration moves to Twilio before the eleventh client — retrofitting thirty
        clients&rsquo; registrations is a month of work.
      </p>
    </section>
  );
}

function SharedLineLoadCard({ load }: { load: SharedLineLoad }) {
  const heavy = load.businesses >= 10;
  return (
    <section className={`rounded-lg p-4 ring-1 ${
      heavy ? "bg-amber-50 ring-amber-200" : "bg-slate-50 ring-slate-200"
    }`}>
      <div className="flex flex-wrap items-center gap-2">
        <Users className={`h-4 w-4 ${heavy ? "text-amber-700" : "text-slate-400"}`} />
        <h2 className="text-sm font-semibold text-slate-900">Our shared number</h2>
        <span className="text-[10px] text-slate-400">{load.period}</span>
      </div>
      <div className="mt-1 text-sm text-slate-700">
        <span className="font-semibold tabular-nums">{load.businesses}</span>{" "}
        {load.businesses === 1 ? "business is" : "businesses are"} sending from it this month —{" "}
        <span className="font-semibold tabular-nums">{load.segments}</span> texts, capped at{" "}
        {load.cap_per_business} each.
      </div>
      {heavy && (
        <p className="mt-1 text-[11px] text-amber-900">
          Ten or more businesses on one registered brand. Get a written read from the aggregator and a
          telecom-compliance attorney before the next one joins — this is the rule that can end the
          product line, and it is cheaper to ask now.
        </p>
      )}
      {!load.fallback_enabled && (
        <p className="mt-1 text-[11px] text-slate-600">
          SHARED_LINE_FALLBACK_ENABLED is off, so nothing is riding it — every business texts from its
          own number or not at all.
        </p>
      )}
    </section>
  );
}

/**
 * Segments this month, per business and per source — the sheet that says when
 * the $5 line is underwater.
 *
 * `refused` sits beside `used` on purpose: "12 texts sent, 40 refused for want
 * of consent" is a completely different conversation from "12 texts sent", and
 * splitting them across two screens is how the second number never gets looked
 * at.
 */
function SegmentsThisMonth({ rows, cap }: { rows: AllowanceRow[]; cap: number | null }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-slate-900">Texts this month, by business</h2>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[46rem] text-left text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2">Business</th>
              <th className="px-3 py-2 text-right">Used</th>
              <th className="px-3 py-2 text-right">Included</th>
              <th className="px-3 py-2 text-right">Over</th>
              <th className="px-3 py-2 text-right">On our shared number</th>
              <th className="px-3 py-2">What is eating them</th>
              <th className="px-3 py-2">Refused</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.tenant_id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium text-slate-900">
                  {r.business_name || r.tenant_id.slice(0, 8)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.used}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.included || "—"}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${r.overage_units ? "text-amber-700" : "text-slate-400"}`}>
                  {r.overage_units || "—"}
                </td>
                <td className={`px-3 py-2 text-right tabular-nums ${
                  cap && r.shared_used >= cap ? "font-semibold text-rose-700" : "text-slate-600"
                }`}>
                  {r.shared_used ? `${r.shared_used}${cap ? ` of ${cap}` : ""}` : "—"}
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {Object.entries(r.by_source).length
                    ? Object.entries(r.by_source)
                      .sort((a, b) => b[1] - a[1])
                      .map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`)
                      .join(" · ")
                    : "—"}
                </td>
                <td className="px-3 py-2">
                  {Object.entries(r.refused).length ? (
                    <span className="text-rose-700">
                      {Object.entries(r.refused)
                        .sort((a, b) => b[1] - a[1])
                        .map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`)
                        .join(" · ")}
                    </span>
                  ) : (
                    <span className="text-slate-400">none</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[10px] text-slate-400">
        Overage is counted, never charged — there is no charge code for it yet. &ldquo;Refused&rdquo; is
        what we did not send and why: no consent on file, past the shared-number cap, or a campaign that
        cannot ride our brand&rsquo;s number.
      </p>
    </section>
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
          {/* LINE-4 — DAYS ELAPSED on anything still waiting. Nobody subtracts
              a request date from today in their head, so without this the
              nineteen-day-old submission looks exactly like the one filed this
              morning. Amber past two weeks: ACS publishes 4–5 weeks to a
              toll-free verdict, so a fortnight is when a chase is reasonable
              rather than premature. */}
          {l.pending && l.days_waiting != null && (
            <div className={`mt-0.5 text-[10px] font-semibold ${
              l.days_waiting >= 14 ? "text-amber-700" : "text-slate-500"
            }`}>
              Waiting {l.days_waiting} day{l.days_waiting === 1 ? "" : "s"}
              {l.days_waiting >= 14 && " — worth checking the Regulatory Documents blade"}
            </div>
          )}
          {l.registration_status === "rejected" && !!l.registration_sunk_cents && (
            <div className="mt-0.5 text-[10px] font-semibold text-rose-700">
              Refused — {money(l.registration_sunk_cents)} spent and not coming back
            </div>
          )}
          {/* SMS-15 — what the client still has to give us before this can be
              filed. Named, not a disabled button with a shrug: the founder is
              the one who has to ring them about it. */}
          {l.number && l.registration_status === "none" && !l.registration_complete && (
            <div className="mt-1 rounded bg-amber-50 px-2 py-1 text-[10px] text-amber-900 ring-1 ring-amber-200">
              Cannot file yet — still needed from the client:{" "}
              <span className="font-semibold">
                {(l.registration_missing || []).map((f) => f.replace(/_/g, " ")).join(", ") || "the form"}
              </span>
            </div>
          )}
          {!!l.registration_unchecked?.length && l.registration_status === "none" && (
            <div className="mt-1 text-[10px] text-slate-500">
              Not able to check: {l.registration_unchecked.map((f) => f.replace(/_/g, " ")).join(", ")}
            </div>
          )}
          {l.sole_proprietor && l.registration_status !== "approved" && (
            <div className="mt-1 text-[10px] text-slate-500">
              No EIN — filing as a sole proprietor: one campaign, low daily limit, no upgrade later
              without registering again.
            </div>
          )}
        </div>

        <div className="flex flex-shrink-0 flex-wrap gap-1.5">
          {l.status === "requested" && (
            <button type="button" onClick={onProvision} disabled={busy}
              className="rounded bg-[#EF6C33] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#D85F2A] disabled:opacity-40"
              title={meta?.cost_sentence}>
              Provision{meta?.purchase_enabled ? " ($)" : " (stand-in)"}
            </button>
          )}
          {/* SMS-15 — the button EXISTS only when the form is finished. The $44
              is spent on submission whether the carrier says yes or no, and a
              submission cannot be edited afterwards, so a half-filled filing is
              not a draft to fix later: it is a rejection to wait five to eight
              business days for, and then pay for again. The reason it is absent
              is spelled out above the row rather than hidden in a tooltip. */}
          {l.number && l.registration_status === "none" && l.registration_complete !== false && (
            <button type="button" onClick={onRegister} disabled={busy}
              className="rounded bg-slate-800 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-40"
              title="Per client, and it cannot be pre-done. Buying the number in advance does not make this faster.">
              File carrier registration ({money(l.registration_cost_cents ?? 4400)}, non-refundable)
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
