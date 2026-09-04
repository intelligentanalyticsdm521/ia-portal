// SparkLeadSourcesPage — SPARK → Leads → Lead sources.
//
// LOCKED (SCOPE_GROWTH_GAPS_2026-09-04.md §3A "UI", §4 step 8; LEADGEN_POST_
// CAPTURE_SCOPE §9 I1 + "Intake by tier"):
//   • A card per platform, in the locked order, with a status chip.
//   • Google Ads lead form is the only one that CONNECTS today (G-2: it needs
//     nobody's approval). Everything else shows why it is not ready and has no
//     button — the card's `available` comes from the API, which derives it from
//     whether a provider module exists, so a card can never promise something
//     that is not built.
//   • Connect flow: name it → create → the key is shown ONCE with a copy
//     button → the exact paste instructions for Google Ads.
//   • Health: last event, last error. Event drawer: the last 50 deliveries with
//     what happened to each.
//   • Disconnect and Rotate key.
//   • The tier line: "Essentials connects 3 lead sources."
//
// CONVERSATIONS 4 added the INBOUND section above the connectors. The naming
// is locked (§9): **Inbound** is the client's own properties — their website,
// their landing pages, their referrals — and **Intake** is a third-party
// platform we connect to through its API. Web chat is the client's own
// website, so it is Inbound, it needs no key, and it is switched on per
// website rather than "connected".
//
// CONVERSATIONS 2 + 3 added TEXTS & CALLS to that same Inbound section. A phone
// number is the client's own property too — more so than their website — but
// unlike the chat bubble it cannot simply be switched on: a number is a real
// carrier resource that costs real money, and the carrier verifies the business
// before it will carry a single message. So this row is a REQUEST, with the
// price and the wait said plainly before the button, and a waiting state that
// tells the client what is happening for the weeks it takes.
//
// The missed-call text-back switch is rendered GREYED with the reason on it,
// rather than hidden: the client should be able to see that the feature exists
// and that we are not shipping it until the texting-consent read is done. A
// hidden switch is a feature nobody knows they are waiting for.
//
// "Business", never "tenant" (feedback_no_tenant_in_ui).

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plug, Copy, Check, RefreshCw, Trash2, Clock, AlertTriangle,
  CheckCircle2, Lock, Send, X, Activity, MessageSquare, Globe, Phone,
} from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { IadmModal, IadmButton } from "../../components/IadmModal";
import { friendlyApiError } from "../../lib/leadgenBilling";

// ── shapes the API serves ───────────────────────────────────────────────────
interface CatalogRow {
  provider: string;
  label: string;
  channel: string;
  kind: "webhook" | "poll" | "meta_webhook";
  blurb: string;
  connect: string;
  speed: string;
  coming?: string;
  available: boolean;
}

interface Connection {
  id: number;
  provider: string;
  provider_label: string;
  channel: string | null;
  kind: string;
  label: string;
  status: "pending" | "active" | "error" | "disconnected";
  key_prefix: string | null;
  key_issued_at: string | null;
  last_event_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  event_count: number;
  lead_count: number;
  created_at: string;
}

interface InstructionCard {
  title: string;
  fields: { label: string; value: string; copy?: boolean; once?: boolean }[];
  steps: string[];
  note: string;
}

interface CreateResponse {
  data: Connection;
  key: string | null;
  webhook_url: string | null;
  instructions: InstructionCard | null;
}

/** One of the client's own websites, and whether the chat bubble is on there. */
interface ChatSiteRow {
  site_id: string;
  domain: string | null;
  status: string | null;
  enabled: boolean;
  greeting: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

/** The business's own phone line, and this month's texting allowance. */
interface PhoneLineRow {
  id: number;
  number: string | null;
  purpose: "operations" | "marketing";
  status: "requested" | "provisioning" | "verifying" | "active" | "suspended" | "released";
  /** What the carrier has said about THIS business. Separate from `status` on
   *  purpose: calls work the moment the line is switched on, texting waits for
   *  somebody else's queue, and telling a client "live" when their texts do not
   *  send would be the worst kind of true. */
  registration_status: "none" | "submitted" | "approved" | "rejected";
  registration_promise: string | null;
  pending: boolean;
  setup_estimate: string | null;
  can_text: boolean;
  can_take_calls: boolean;
  monthly_fee_cents: number;
  included_in_plan: boolean;
  sms_included_per_month: number;
  forward_to_e164: string | null;
  ring_seconds: number;
  voicemail_greeting: string | null;
  missed_call_text_back: boolean;
}

interface AllowanceRow {
  period: string;
  included: number;
  used: number;
  overage_units: number;
  remaining: number;
}

interface PhoneLineMeta {
  shared_number: string | null;
  monthly_fee_cents: number;
  entitled: boolean;
  entitlement_source: string;
  included_in_plan: boolean;
  setup_estimate: string;
  registration_promise: string;
  allowance: AllowanceRow | null;
  text_back_available: boolean;
  text_back_locked_reason: string | null;
  engine: string;
}

interface ChatMeta {
  hours_line: string | null;
  response_promise: string | null;
  /** Word for word what a visitor is answered with — read from the same place
   *  the widget reads it, so the preview cannot drift from what it previews. */
  ack_preview: string | null;
  business_name: string | null;
  engine: string;
}

interface EventRow {
  id: number;
  received_at: string;
  processed_at: string | null;
  result: string | null;
  external_ref: string | null;
  lead_id: number | null;
  is_test: boolean;
  error: string | null;
  duration_ms: number | null;
}

const RESULT_LABEL: Record<string, string> = {
  lead_created: "New lead",
  attached_to_contact: "Existing contact",
  duplicate: "Already had it",
  rejected: "Rejected",
  error: "Error",
  received: "Received",
};

const RESULT_CLASS: Record<string, string> = {
  lead_created: "bg-emerald-100 text-emerald-800",
  attached_to_contact: "bg-sky-100 text-sky-800",
  duplicate: "bg-slate-100 text-slate-600",
  rejected: "bg-rose-100 text-rose-800",
  error: "bg-rose-100 text-rose-800",
  received: "bg-slate-100 text-slate-600",
};

const STATUS_CHIP: Record<Connection["status"], { label: string; cls: string }> = {
  pending: { label: "Waiting for the first lead", cls: "bg-amber-100 text-amber-800 ring-amber-200" },
  active: { label: "Connected", cls: "bg-emerald-100 text-emerald-800 ring-emerald-200" },
  error: { label: "Needs attention", cls: "bg-rose-100 text-rose-800 ring-rose-200" },
  disconnected: { label: "Disconnected", cls: "bg-slate-100 text-slate-600 ring-slate-200" },
};

function when(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "never";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return new Date(iso).toLocaleDateString();
}

function CopyField({ label, value, once }: { label: string; value: string; once?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
        {label}
        {once && <span className="ml-2 normal-case tracking-normal text-amber-700">shown once</span>}
      </div>
      <div className="flex items-stretch gap-2">
        <code className="flex-1 min-w-0 overflow-x-auto whitespace-nowrap rounded border border-slate-300 bg-slate-50 px-2 py-1.5 text-xs text-slate-800">
          {value}
        </code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            }).catch(() => { /* clipboard blocked — the value is selectable */ });
          }}
          className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export function SparkLeadSourcesPage() {
  const { get, post, put, del, ready } = useSparkApi();

  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [chatSites, setChatSites] = useState<ChatSiteRow[]>([]);
  const [chatMeta, setChatMeta] = useState<ChatMeta | null>(null);
  const [chatBusy, setChatBusy] = useState<string | null>(null);
  const [line, setLine] = useState<PhoneLineRow | null>(null);
  const [lineMeta, setLineMeta] = useState<PhoneLineMeta | null>(null);
  const [lineBusy, setLineBusy] = useState(false);
  const [forwardTo, setForwardTo] = useState("");
  const [greeting, setGreeting] = useState("");
  const [sourceLimit, setSourceLimit] = useState<number | null>(null);
  const [limitReason, setLimitReason] = useState<string>("unresolved");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  // connect flow
  const [connectFor, setConnectFor] = useState<CatalogRow | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<CreateResponse | null>(null);

  // event drawer
  const [eventsFor, setEventsFor] = useState<Connection | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      // Portal data-fetching convention: both lists in one pass.
      const [cat, conns, chat, phone] = await Promise.all([
        get<{ data: CatalogRow[]; meta: { source_limit: number | null; source_limit_reason: string } }>("/api/v1/intake/providers"),
        get<{ data: Connection[] }>("/api/v1/intake/connections"),
        // Inbound (Conversations 4). Its own failure: a business with no
        // website should still see its connectors, not an error page.
        get<{ data: ChatSiteRow[]; meta: ChatMeta }>("/api/v1/chat/sites").catch(() => null),
        // Conversations 2 + 3. Its own failure too: a business whose phone line
        // could not be read should still see its connectors, not an error page.
        get<{ data: PhoneLineRow | null; meta: PhoneLineMeta }>("/api/v1/conversations/phone-line").catch(() => null),
      ]);
      setCatalog(cat.data || []);
      setSourceLimit(cat.meta?.source_limit ?? null);
      setLimitReason(cat.meta?.source_limit_reason ?? "unresolved");
      setConnections(conns.data || []);
      setChatSites(chat?.data || []);
      setChatMeta(chat?.meta || null);
      setLine(phone?.data || null);
      setLineMeta(phone?.meta || null);
      setForwardTo(phone?.data?.forward_to_e164 || "");
      setGreeting(phone?.data?.voicemail_greeting || "");
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [get, ready]);
  useEffect(() => { load(); }, [load]);

  const byProvider = useMemo(() => {
    const m = new Map<string, Connection[]>();
    for (const c of connections) {
      if (c.status === "disconnected") continue;
      const list = m.get(c.provider) || [];
      list.push(c);
      m.set(c.provider, list);
    }
    return m;
  }, [connections]);

  const activeCount = useMemo(
    () => connections.filter((c) => c.status !== "disconnected").length,
    [connections]
  );
  const atLimit = sourceLimit != null && activeCount >= sourceLimit;

  async function createConnection() {
    if (!connectFor) return;
    setBusy(true);
    try {
      const r = await post<CreateResponse>("/api/v1/intake/connections", {
        provider: connectFor.provider,
        label: newLabel.trim() || connectFor.label,
      });
      setIssued(r);
      setConnectFor(null);
      setNewLabel("");
      await load();
    } catch (err) {
      alert(friendlyApiError(err).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleChat(site: ChatSiteRow, enabled: boolean) {
    setChatBusy(site.site_id);
    try {
      await put(`/api/v1/chat/sites/${site.site_id}`, { enabled });
      setChatSites((rows) => rows.map((r) => (r.site_id === site.site_id ? { ...r, enabled } : r)));
      setNotice(enabled
        ? `The chat bubble is on for ${site.domain || "that website"}. It appears on the next page load.`
        : `The chat bubble is off for ${site.domain || "that website"}.`);
    } catch (err) {
      alert(friendlyApiError(err).message);
      await load();
    } finally {
      setChatBusy(null);
    }
  }

  async function requestLine() {
    if (!confirm(
      `Ask us to set up a phone number for your business?

`
      + `It is $${((lineMeta?.monthly_fee_cents ?? 500) / 100).toFixed(2)} a month`
      + `${lineMeta?.included_in_plan ? " — included on your plan" : ""}, and it takes `
      + `${lineMeta?.setup_estimate || "a few weeks"}: the carrier has to verify your business before `
      + `it will carry a single message. We will email you when it is live.`
    )) return;
    setLineBusy(true);
    try {
      const r = await post<{ line: PhoneLineRow; message: string }>("/api/v1/conversations/phone-line/request", {});
      setLine(r.line || null);
      setNotice(r.message);
    } catch (err) {
      alert(friendlyApiError(err).message);
    } finally {
      setLineBusy(false);
    }
  }

  async function saveLineSettings() {
    setLineBusy(true);
    try {
      const r = await put<{ line: PhoneLineRow }>("/api/v1/conversations/phone-line/settings", {
        forward_to_e164: forwardTo.trim() || null,
        voicemail_greeting: greeting.trim() || null,
      });
      setLine(r.line || null);
      setNotice("Saved. Calls to your number ring that phone from now on.");
    } catch (err) {
      alert(friendlyApiError(err).message);
    } finally {
      setLineBusy(false);
    }
  }

  async function rotateKey(c: Connection) {
    if (!confirm(`Issue a new key for “${c.label}”?\n\nThe current key stops working immediately — you will need to paste the new one into the platform.`)) return;
    setBusy(true);
    try {
      const r = await post<CreateResponse>(`/api/v1/intake/connections/${c.id}/rotate-key`, {});
      setIssued({ data: c, key: r.key, webhook_url: r.webhook_url, instructions: r.instructions });
      await load();
    } catch (err) {
      alert(friendlyApiError(err).message);
    } finally {
      setBusy(false);
    }
  }

  async function sendTest(c: Connection) {
    if (!confirm(`Send a sample lead through “${c.label}”?\n\nA test lead will appear in your Lead Inbox, tagged “test”. A new key is issued, so you will need to paste it into the platform afterwards.`)) return;
    setBusy(true);
    try {
      const r = await post<CreateResponse & { result?: string; key?: string }>(`/api/v1/intake/connections/${c.id}/test`, {});
      setNotice(`Sample lead sent — the Lead Inbox shows it as “${c.label}”. Paste the new key below into the platform.`);
      setIssued({ data: c, key: r.key ?? null, webhook_url: r.webhook_url ?? null, instructions: r.instructions ?? null });
      await load();
    } catch (err) {
      alert(friendlyApiError(err).message);
    } finally {
      setBusy(false);
    }
  }

  async function disconnect(c: Connection) {
    if (!confirm(`Disconnect “${c.label}”?\n\nNew leads from this platform will stop arriving. The leads you already have are untouched.`)) return;
    setBusy(true);
    try {
      await del(`/api/v1/intake/connections/${c.id}`);
      await load();
    } catch (err) {
      alert(friendlyApiError(err).message);
    } finally {
      setBusy(false);
    }
  }

  async function openEvents(c: Connection) {
    setEventsFor(c);
    setEvents([]);
    setEventsLoading(true);
    try {
      const r = await get<{ data: EventRow[] }>(`/api/v1/intake/connections/${c.id}/events?limit=50`);
      setEvents(r.data || []);
    } catch {
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  }

  const tierLine = sourceLimit == null
    ? (limitReason === "no_package"
        ? "Connecting a lead source is part of the SPARK Leads add-on."
        : "Your plan connects as many lead sources as you like.")
    : `Your plan connects ${sourceLimit} lead sources. ${activeCount} connected.`;

  return (
    <SparkPageShell
      title="Lead sources"
      subtitle="Connect the places your leads already come from. Every one of them lands in your Lead Inbox."
      help="A lead source is a platform that already collects enquiries for you — a Google Ads lead form, and soon Local Services Ads, Facebook and Instagram. Connect one and its leads arrive here automatically, scored, next to the ones we find for you."
      error={error}
      loading={loading}
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-slate-50 ring-1 ring-slate-200 px-4 py-2.5 text-xs text-slate-700">
          {tierLine}
        </div>

        {notice && (
          <div className="flex items-start gap-2 rounded-lg bg-emerald-50 ring-1 ring-emerald-200 px-4 py-2.5 text-xs text-emerald-900">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div className="flex-1">{notice}</div>
            <button onClick={() => setNotice(null)} className="text-emerald-700 hover:text-emerald-900"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}

        {/* ── Inbound: the client's OWN properties ─────────────────── */}
        <section className="rounded-xl bg-white ring-1 ring-slate-200 p-4">
          <div className="flex items-start gap-2">
            <Globe className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
            <div>
              <h2 className="font-semibold text-slate-900">Inbound — your own website</h2>
              <p className="mt-0.5 text-xs text-slate-600">
                No key, nothing to paste. These are already yours; you just switch them on.
              </p>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-slate-200 p-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 flex-shrink-0 text-slate-400" />
              <h3 className="font-semibold text-slate-900">Website chat</h3>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              A chat bubble in the corner of your website. Every conversation lands in your Lead Inbox,
              gets answered straight away in your own words, and you reply from the lead.
              {chatMeta?.engine ? ` Powered by ${chatMeta.engine}.` : ""}
            </p>

            {chatSites.length === 0 ? (
              <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                We do not manage a website for this business yet, so there is nowhere to put the bubble.
              </div>
            ) : (
              <ul className="mt-3 space-y-2">
                {chatSites.map((site) => (
                  <li key={site.site_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-900">{site.domain || "Your website"}</div>
                      <div className="text-[10px] text-slate-500">
                        {site.enabled ? "The bubble is on" : "The bubble is off"}
                        {site.updated_by ? ` · last changed by ${site.updated_by}` : ""}
                      </div>
                    </div>
                    <label className="flex flex-shrink-0 cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={site.enabled}
                        disabled={chatBusy === site.site_id}
                        onChange={(e) => toggleChat(site, e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300"
                        aria-label={`Website chat on ${site.domain || "your website"}`}
                      />
                      {site.enabled ? "On" : "Off"}
                    </label>
                  </li>
                ))}
              </ul>
            )}

            {/* What a visitor is actually told, and where the words come from. */}
            <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Your hours, as the bubble shows them</dt>
                <dd className="mt-0.5 text-xs text-slate-700">
                  {chatMeta?.hours_line || (
                    <span className="text-slate-500">
                      Not set — the bubble says nothing about opening times. Add them under Settings &rsaquo; Business.
                    </span>
                  )}
                </dd>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">What we answer with, straight away</dt>
                <dd className="mt-0.5 text-xs text-slate-700">
                  {chatMeta?.ack_preview || "Thanks — we have got that."}
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-[10px] text-slate-400">
              Every chat becomes a lead the moment somebody asks a real question or leaves their details.
              It reads &ldquo;Website chat &middot; via your address&rdquo; in the inbox.
            </p>
          </div>

          {/* -- Texts & calls (Conversations 2 + 3) ------------------- */}
          <div className="mt-3 rounded-lg border border-slate-200 p-3">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 flex-shrink-0 text-slate-400" />
              <h3 className="font-semibold text-slate-900">Texts &amp; calls</h3>
              {line?.status === "active" && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-800 ring-1 ring-emerald-200">
                  {line.can_text ? "Live" : "Calls live"}
                </span>
              )}
              {line?.pending && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800 ring-1 ring-amber-200">
                  Being set up
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Your own phone number. People text it and the whole conversation lands in your Lead Inbox; people
              ring it and it rings your phone, and if you miss it the voicemail is written down and becomes a lead.
            </p>

            {!line && (
              <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5">
                <div className="text-xs text-slate-700">
                  Today your texts go out from our shared number
                  {lineMeta?.shared_number ? ` (${lineMeta.shared_number})` : ""}, which works but cannot receive
                  replies for you &mdash; when two of our clients know the same person, there is no way to tell
                  whose customer texted. Your own number fixes that, and it takes calls.
                </div>
                <div className="mt-2 text-xs font-semibold text-slate-900">
                  {lineMeta?.included_in_plan
                    ? "Included on your plan."
                    : `$${((lineMeta?.monthly_fee_cents ?? 500) / 100).toFixed(2)} a month.`}{" "}
                  <span className="font-normal text-slate-600">
                    {lineMeta?.registration_promise
                      || "Your number is reserved today; texts flow when the carrier approves — we file it for you."}{" "}
                    Calls work as soon as we switch it on; texting takes{" "}
                    {lineMeta?.setup_estimate || "a few weeks"}.
                  </span>
                </div>
                {lineMeta?.entitled ? (
                  <button
                    type="button"
                    onClick={requestLine}
                    disabled={lineBusy}
                    className="mt-2 min-h-[40px] rounded bg-[#EF6C33] px-3 py-2 text-xs font-semibold text-white hover:bg-[#D85F2A] disabled:opacity-40"
                  >
                    Ask for a number
                  </button>
                ) : (
                  <p className="mt-2 flex items-start gap-1.5 text-[11px] text-slate-500">
                    <Lock className="mt-0.5 h-3 w-3 flex-shrink-0" />
                    <span>A phone line is an add-on. Add it to your plan and we will set one up.</span>
                  </p>
                )}
              </div>
            )}

            {line?.pending && (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-900 ring-1 ring-amber-200">
                <Clock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <div>
                  <div className="font-semibold">
                    Your line is being set up &mdash; {line.setup_estimate || "a few weeks"}.
                  </div>
                  <div className="mt-0.5">
                    {line.registration_promise
                      || "Your number is reserved today; texts flow when the carrier approves — we file it for you."}{" "}
                    Until then everything carries on exactly as it does now.
                  </div>
                </div>
              </div>
            )}

            {line?.status === "active" && (
              <>
                {!line.can_text && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-900 ring-1 ring-amber-200">
                    <Clock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                    <div>
                      <div className="font-semibold">Calls are working. Texting is still with the carrier.</div>
                      <div className="mt-0.5">
                        {line.registration_promise
                          || "Your number is reserved; texts flow when the carrier approves — we file it for you."}{" "}
                        Your texts keep going out from our shared number in the meantime, exactly as they do now.
                      </div>
                    </div>
                  </div>
                )}

                <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Your number</dt>
                    <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">{line.number}</dd>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Texts this month
                    </dt>
                    <dd className="mt-0.5 text-sm text-slate-900">
                      {lineMeta?.allowance ? (
                        <>
                          <span className="font-semibold tabular-nums">{lineMeta.allowance.used}</span>
                          <span className="text-slate-500"> of {lineMeta.allowance.included}</span>
                          {lineMeta.allowance.overage_units > 0 && (
                            <span className="ml-1 text-amber-700">
                              &middot; {lineMeta.allowance.overage_units} over your plan this month
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-slate-500">Nothing sent yet</span>
                      )}
                    </dd>
                  </div>
                </dl>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Ring this phone when somebody calls
                    </span>
                    <input
                      type="tel"
                      value={forwardTo}
                      onChange={(e) => setForwardTo(e.target.value)}
                      placeholder="Your mobile"
                      className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      What the caller hears if nobody answers
                    </span>
                    <textarea
                      rows={2}
                      value={greeting}
                      onChange={(e) => setGreeting(e.target.value)}
                      placeholder="Leave blank and we use your business name."
                      className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
                    />
                  </label>
                </div>
                <p className="mt-1 text-[10px] text-slate-400">
                  We always add &ldquo;This call may be recorded.&rdquo; to the end of your greeting &mdash;
                  several states require it, and it is not ours or yours to leave off.
                </p>
                <button
                  type="button"
                  onClick={saveLineSettings}
                  disabled={lineBusy}
                  className="mt-2 rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  Save
                </button>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 opacity-60">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-900">
                      Text people back when you miss their call
                    </div>
                    <div className="flex items-start gap-1 text-[10px] text-slate-500">
                      <Lock className="mt-0.5 h-3 w-3 flex-shrink-0" />
                      <span>
                        {lineMeta?.text_back_locked_reason
                          ? `Not available yet \u2014 ${lineMeta.text_back_locked_reason}.`
                          : "Not available yet."}
                      </span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={false}
                    disabled
                    readOnly
                    className="h-4 w-4 cursor-not-allowed rounded border-slate-300"
                    aria-label="Text people back when you miss their call (not available yet)"
                  />
                </div>
              </>
            )}
          </div>
        </section>

        <div className="pt-1">
          <h2 className="font-semibold text-slate-900">Intake — platforms you connect</h2>
          <p className="mt-0.5 text-xs text-slate-600">
            Somebody else collects the enquiry and hands it to us through their own API.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {catalog.map((row) => {
            const mine = byProvider.get(row.provider) || [];
            return (
              <div key={row.provider} className="rounded-xl bg-white ring-1 ring-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Plug className="h-4 w-4 text-slate-400 flex-shrink-0" />
                      <h3 className="font-semibold text-slate-900 truncate">{row.label}</h3>
                      {!row.available && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500">
                          <Lock className="h-2.5 w-2.5" /> Coming
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-600">{row.blurb}</p>
                    <p className="mt-1 text-[10px] text-slate-400">Leads arrive {row.speed}.</p>
                  </div>
                  {row.available && (
                    <IadmButton
                      variant="primary"
                      product="spark"
                      disabled={busy || (atLimit && mine.length === 0)}
                      onClick={() => { setConnectFor(row); setNewLabel(row.label); }}
                    >
                      Connect
                    </IadmButton>
                  )}
                </div>

                {!row.available && row.coming && (
                  <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">{row.coming}</div>
                )}

                {atLimit && row.available && mine.length === 0 && (
                  <div className="mt-3 rounded-lg bg-amber-50 ring-1 ring-amber-200 px-3 py-2 text-[11px] text-amber-900">
                    You have used all {sourceLimit} of your lead sources. Disconnect one, or move up a plan for as many as you like.
                  </div>
                )}

                {mine.map((c) => {
                  const chip = STATUS_CHIP[c.status];
                  return (
                    <div key={c.id} className="mt-3 rounded-lg border border-slate-200 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 truncate">{c.label}</div>
                          <div className="text-[10px] text-slate-500">
                            {c.key_prefix ? `Key ${c.key_prefix}…` : "No key"} · {c.lead_count} lead{c.lead_count === 1 ? "" : "s"} · last delivery {when(c.last_event_at)}
                          </div>
                        </div>
                        <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ${chip.cls}`}>
                          {chip.label}
                        </span>
                      </div>

                      {c.last_error && (
                        <div className="mt-2 flex items-start gap-1.5 rounded bg-rose-50 px-2 py-1.5 text-[11px] text-rose-900">
                          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                          <span>{c.last_error} <span className="text-rose-600">({when(c.last_error_at)})</span></span>
                        </div>
                      )}

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button onClick={() => openEvents(c)} className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">
                          <Activity className="h-3 w-3" /> Recent activity
                        </button>
                        <button onClick={() => sendTest(c)} disabled={busy} className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                          <Send className="h-3 w-3" /> Send a sample lead
                        </button>
                        <button onClick={() => rotateKey(c)} disabled={busy} className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                          <RefreshCw className="h-3 w-3" /> Rotate key
                        </button>
                        <button onClick={() => disconnect(c)} disabled={busy} className="inline-flex items-center gap-1 rounded border border-rose-200 bg-white px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
                          <Trash2 className="h-3 w-3" /> Disconnect
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── name it ─────────────────────────────────────────────────────── */}
      <IadmModal
        open={!!connectFor}
        onClose={() => setConnectFor(null)}
        product="spark"
        eyebrow="SPARK · LEAD SOURCES"
        title={connectFor ? `Connect ${connectFor.label}` : ""}
        subtitle="Give it a name you will recognise in your inbox."
        size="info"
        footer={
          <div className="flex justify-end gap-2">
            <IadmButton variant="ghost" onClick={() => setConnectFor(null)}>Cancel</IadmButton>
            <IadmButton variant="primary" product="spark" disabled={busy} onClick={createConnection}>
              {busy ? "Connecting…" : "Create and show me the key"}
            </IadmButton>
          </div>
        }
      >
        <div className="p-4 space-y-3">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Name</span>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              maxLength={120}
              placeholder="Spring tune-up lead form"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <p className="text-xs text-slate-600">
            This is what your leads will say they came from — every lead reads
            “<strong>{newLabel.trim() || connectFor?.label}</strong> · via {connectFor?.channel}”.
            One name per form works best.
          </p>
        </div>
      </IadmModal>

      {/* ── the key, shown once ─────────────────────────────────────────── */}
      <IadmModal
        open={!!issued}
        onClose={() => setIssued(null)}
        product="spark"
        eyebrow="SPARK · LEAD SOURCES"
        title={issued?.instructions?.title || "Your webhook details"}
        subtitle="Copy both of these into the platform now — the key is not shown again."
        size="lg"
        footer={
          <div className="flex justify-end">
            <IadmButton variant="primary" product="spark" onClick={() => setIssued(null)}>I have copied them</IadmButton>
          </div>
        }
      >
        <div className="p-4 space-y-4">
          {issued?.webhook_url && <CopyField label="Webhook URL" value={issued.webhook_url} />}
          {issued?.key && <CopyField label="Key" value={issued.key} once />}

          {issued?.instructions && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Where these go</div>
              <ol className="space-y-1.5 text-xs text-slate-700">
                {issued.instructions.steps.map((step, n) => (
                  <li key={n} className="flex gap-2">
                    <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-slate-200 text-[9px] font-bold text-slate-700">{n + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {issued?.instructions?.note && (
            <div className="rounded-lg bg-amber-50 ring-1 ring-amber-200 px-3 py-2 text-[11px] text-amber-900">
              {issued.instructions.note}
            </div>
          )}
        </div>
      </IadmModal>

      {/* ── the event drawer ────────────────────────────────────────────── */}
      <IadmModal
        open={!!eventsFor}
        onClose={() => setEventsFor(null)}
        product="spark"
        eyebrow="SPARK · LEAD SOURCES"
        title={eventsFor ? `Recent activity — ${eventsFor.label}` : ""}
        subtitle="The last 50 deliveries from this platform and what happened to each."
        size="lg"
      >
        <div className="p-4">
          {eventsLoading && <div className="text-sm text-slate-500">Loading…</div>}
          {!eventsLoading && events.length === 0 && (
            <div className="rounded-lg bg-slate-50 px-4 py-6 text-center text-xs text-slate-500">
              <Clock className="mx-auto mb-2 h-5 w-5 text-slate-400" />
              Nothing has arrived yet. Use “Send a sample lead”, or the platform’s own test button, to check the wiring.
            </div>
          )}
          {!eventsLoading && events.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="py-2 pr-3">Arrived</th>
                    <th className="py-2 pr-3">Result</th>
                    <th className="py-2 pr-3">Their reference</th>
                    <th className="py-2 pr-3">Lead</th>
                    <th className="py-2">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {events.map((e) => (
                    <tr key={e.id}>
                      <td className="py-2 pr-3 whitespace-nowrap text-slate-600">{when(e.received_at)}</td>
                      <td className="py-2 pr-3">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${RESULT_CLASS[e.result || "received"] || "bg-slate-100 text-slate-600"}`}>
                          {RESULT_LABEL[e.result || "received"] || e.result}
                        </span>
                        {e.is_test && <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-500">test</span>}
                      </td>
                      <td className="py-2 pr-3 text-slate-500">{e.external_ref || "—"}</td>
                      <td className="py-2 pr-3 text-slate-500">{e.lead_id ? `#${e.lead_id}` : "—"}</td>
                      <td className="py-2 text-slate-500">{e.error || (e.duration_ms != null ? `${e.duration_ms} ms` : "—")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </IadmModal>
    </SparkPageShell>
  );
}
