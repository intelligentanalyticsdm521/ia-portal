// LeadTextsCallsPanel — the "Texts & calls" tab on the lead card
// (Conversations 2 and 3).
//
// ONE TAB, ONE COMPONENT, the same shape as LeadChatPanel beside it. The modal
// hands it a lead id and knows nothing else about texting or telephony.
//
// WHAT THE OWNER NEEDS, in the order they need it:
//   1. what did this person actually say?      the thread, oldest first
//   2. did they ring, and what did they say?   the calls, with the transcript
//   3. what do I say back?                     the reply box — which also marks
//                                              the lead contacted, because
//                                              answering somebody IS contacting
//                                              them
//
// THE REPLY BOX IS SOMETIMES NOT THERE, AND IT SAYS WHY. D2 allows a text back
// only inside a conversation the other person started, and only while it is
// still live; a thread where somebody replied STOP allows nothing at all. The
// server decides (services/conversations/sms.mayReply) and sends the reason
// with the thread, so the button and the send can never disagree — and the
// owner reads a sentence rather than finding a dead button.
//
// SEGMENTS ARE SHOWN WHILE THEY TYPE. Every 160 characters is another segment
// off the business's monthly allowance and another line on our bill. A counter
// that appears at 161 characters is the difference between a client who
// understands their allowance and one who is surprised by it.
//
// NUMBERS ARE MASKED because the API masks them: the reply goes by thread id,
// so the browser never needs the customer's full number, and a masked number is
// one that cannot be dialled out of a screenshot.
//
// "Business", never "tenant" (feedback_no_tenant_in_ui). The engine is
// "ARGUS AI"; the model vendor is named nowhere.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  MessageSquare, Send, Sparkles, User, Phone, PhoneMissed, Voicemail,
  CheckCircle2, XCircle, Lock, AlertTriangle,
} from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { friendlyApiError } from "../../lib/leadgenBilling";

export interface SmsMessageRow {
  id: number;
  direction: "in" | "out";
  body: string;
  segments: number;
  status: "queued" | "sent" | "delivered" | "failed" | "received" | "blocked";
  error: string | null;
  sent_by: string | null;
  draft_id: number | null;
  occurred_at: string;
}

export interface SmsThreadRow {
  id: number;
  phone_line_id: number | null;
  business_number: string | null;
  counterpart_masked: string | null;
  status: "open" | "closed" | "spam";
  consent_state: "captured" | "inbound_thread" | "none";
  opted_out: boolean;
  message_count: number;
  unread_count: number;
  first_message_at: string;
  last_message_at: string;
  last_inbound_at: string | null;
  can_reply: boolean;
  cannot_reply_reason: string | null;
  messages: SmsMessageRow[];
}

export interface CallRow {
  id: number;
  from_masked: string | null;
  to_number: string | null;
  outcome: "answered" | "missed" | "voicemail";
  started_at: string;
  duration_seconds: number | null;
  has_recording: boolean;
  transcript: string | null;
  transcript_status: "none" | "pending" | "done" | "failed";
  lead_id: number | null;
  text_back_sent_at: string | null;
}

interface PhoneLine {
  number: string | null;
  status: string;
  pending: boolean;
  can_text: boolean;
  setup_estimate: string | null;
}

interface Payload {
  data: { threads: SmsThreadRow[]; calls: CallRow[] };
  meta: {
    line: PhoneLine | null;
    shared_number: string | null;
    sms_enabled: boolean;
    engine: string;
    sending_from?: string | null;
    /** SMS-16(a). On the shared IA number every message goes out as
     *  "Intelligent Analytics on behalf of <business>: …". That is about 51
     *  characters and it is part of what the carrier bills, so the counter
     *  under the compose box has to include it — otherwise the owner is told
     *  "1 text" and charged for two. Null on a business's own line. */
    shared_identity_prefix?: string | null;
  };
}

function when(ts: string | null | undefined) {
  if (!ts) return "";
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

/** The same arithmetic the server bills on: 160 GSM characters a segment, 70 if
 *  anything is outside that set (one emoji does it), 153 / 67 once split. */
// eslint-disable-next-line no-control-regex
const GSM = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà\f^{}\\[~\]|€]*$/;
function segmentsFor(text: string): number {
  if (!text) return 0;
  const gsm = GSM.test(text);
  const single = gsm ? 160 : 70;
  const multi = gsm ? 153 : 67;
  return text.length <= single ? 1 : Math.ceil(text.length / multi);
}

/** Machine reasons the server sends, in words an owner can act on. */
const CANNOT_REPLY: Record<string, string> = {
  opted_out: "They replied STOP, so we cannot text them. You can still email or call.",
  outside_inbound_thread:
    "We can only text somebody back inside a conversation they started. Nobody has texted from this number yet.",
  inbound_window_expired:
    "It has been over a month since they last texted. Send an email or give them a ring instead.",
  thread_spam: "This conversation is marked as spam.",
  no_thread: "There is no text conversation behind this lead.",
  // The follow-up pack's refusals. Every one of these is a DECISION with a
  // reason, and showing it as a generic send error is what turns a working
  // guard rail into a support ticket.
  no_consent:
    "No texting consent on file for this customer. They have to agree to be texted before we can send.",
  consent_declined: "This customer said no to texting. You can still email or call.",
  unsubscribed: "They replied STOP, so we cannot text them. You can still email or call.",
  shared_line_marketing:
    "Campaign and marketing texts cannot go out from our shared number — it is registered to us, "
    + "not to your business. Your own number lifts that, and we file the carrier registration for you.",
  shared_line_cap:
    "You have used this month's allowance on our shared number. Your own number lifts that limit.",
  shared_line_off: "Texting from our shared number is switched off. Your own number is the way round it.",
};

const STATUS_CHIP: Record<SmsThreadRow["status"], { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-emerald-100 text-emerald-800 ring-emerald-200" },
  closed: { label: "Closed", cls: "bg-slate-100 text-slate-600 ring-slate-200" },
  spam: { label: "Marked as spam", cls: "bg-rose-100 text-rose-800 ring-rose-200" },
};

function Bubble({ m }: { m: SmsMessageRow }) {
  const mine = m.direction === "out";
  const agent = m.sent_by === "ARGUS Responder";
  const blocked = m.status === "blocked";
  const failed = m.status === "failed";
  const who = m.direction === "in" ? "Them" : agent ? "ARGUS Responder" : (m.sent_by || "You");
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 ${
          blocked || failed
            ? "bg-rose-50 ring-1 ring-rose-200"
            : mine
              ? agent
                ? "bg-violet-50 ring-1 ring-violet-200"
                : "bg-sky-50 ring-1 ring-sky-200"
              : "bg-white ring-1 ring-slate-200"
        }`}
      >
        <div className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          {m.direction === "in"
            ? <User className="h-3 w-3" />
            : agent ? <Sparkles className="h-3 w-3 text-violet-500" /> : <Send className="h-3 w-3" />}
          <span>{who}</span>
          <span className="font-normal normal-case tracking-normal text-slate-400">{when(m.occurred_at)}</span>
          {m.segments > 1 && (
            <span className="font-normal normal-case tracking-normal text-slate-400">· {m.segments} segments</span>
          )}
        </div>
        <div className="whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-800">{m.body}</div>
        {(blocked || failed) && (
          <div className="mt-1 flex items-start gap-1 text-[10px] text-rose-700">
            <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
            <span>
              {blocked ? "Not sent — " : "Failed — "}
              {(m.error && CANNOT_REPLY[m.error]) || m.error || "we could not send this one."}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function CallCard({ c }: { c: CallRow }) {
  const Icon = c.outcome === "answered" ? Phone : c.outcome === "voicemail" ? Voicemail : PhoneMissed;
  const label =
    c.outcome === "answered" ? "Answered" : c.outcome === "voicemail" ? "Voicemail" : "Missed call";
  const tone =
    c.outcome === "answered"
      ? "bg-emerald-50 ring-emerald-200"
      : c.outcome === "voicemail"
        ? "bg-amber-50 ring-amber-200"
        : "bg-slate-50 ring-slate-200";
  return (
    <li className={`rounded-lg px-3 py-2 ring-1 ${tone}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-900">
        <Icon className="h-3.5 w-3.5 flex-shrink-0 text-slate-500" />
        <span>{label}</span>
        <span className="font-normal text-slate-500">from {c.from_masked || "an unknown number"}</span>
        <span className="font-normal text-slate-400">{when(c.started_at)}</span>
        {c.duration_seconds != null && c.duration_seconds > 0 && (
          <span className="font-normal text-slate-400">· {c.duration_seconds}s</span>
        )}
      </div>
      {c.transcript && (
        <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-700">“{c.transcript}”</p>
      )}
      {!c.transcript && c.transcript_status === "pending" && (
        <p className="mt-1 text-[11px] text-slate-500">Writing the message down — this takes a minute.</p>
      )}
      {!c.transcript && c.transcript_status === "failed" && (
        <p className="mt-1 text-[11px] text-slate-500">
          We could not write this one down.{c.has_recording ? " The recording is still here." : ""}
        </p>
      )}
    </li>
  );
}

interface Props {
  leadId: number | null;
  /** Called after a reply so the inbox row and the Activity tab refresh. */
  onChanged?: () => void;
}

export function LeadTextsCallsPanel({ leadId, onChanged }: Props) {
  const { get, post, ready } = useSparkApi();
  const [threads, setThreads] = useState<SmsThreadRow[]>([]);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [meta, setMeta] = useState<Payload["meta"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    if (!ready || !leadId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await get<Payload>(`/api/v1/leads/${leadId}/texts-calls`);
      setThreads(r.data?.threads || []);
      setCalls(r.data?.calls || []);
      setMeta(r.meta || null);
    } catch (err) {
      setError(friendlyApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [get, ready, leadId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [threads]);

  const active = threads[0] || null;
  // The text as it will actually leave: on the shared line that includes the
  // identification. Counting the draft alone would understate a shared-line
  // reply by a segment in three.
  const prefix = meta?.shared_identity_prefix || "";
  const outgoing = draft.trim() ? `${prefix}${draft.trim()}` : "";
  const segments = segmentsFor(outgoing);

  async function sendReply() {
    if (!leadId || !active || !draft.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ data: { marked_contacted: boolean; segments: number } }>(
        `/api/v1/leads/${leadId}/sms/reply`,
        { thread_id: active.id, body: draft.trim() }
      );
      setDraft("");
      setNotice(
        `Sent${r.data?.segments > 1 ? ` (${r.data.segments} segments)` : ""}.${
          r.data?.marked_contacted ? " This lead is marked as contacted." : ""
        }`
      );
      await load();
      onChanged?.();
    } catch (err) {
      setError(friendlyApiError(err).message);
    } finally {
      setBusy(false);
    }
  }

  async function closeThread(spam: boolean) {
    if (!leadId || !active) return;
    if (!confirm(spam
      ? "Mark this conversation as spam? It stops accepting messages."
      : "Close this conversation? They can text you again any time.")) return;
    setBusy(true);
    try {
      await post(`/api/v1/leads/${leadId}/sms/close`, { thread_id: active.id, spam });
      await load();
      onChanged?.();
    } catch (err) {
      setError(friendlyApiError(err).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading && !threads.length && !calls.length) return <div className="text-sm text-slate-500">Loading…</div>;

  const nothing = !threads.length && !calls.length;

  return (
    <div className="space-y-4">
      {error && <div className="rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">{error}</div>}
      {notice && <div className="rounded border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800">{notice}</div>}

      {meta?.line?.pending && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
          <Lock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>
            Your own number is being set up — it takes {meta.line.setup_estimate || "a few weeks"} while the
            carrier verifies your business. Texting and call forwarding switch on the day it is live.
          </span>
        </div>
      )}

      {nothing && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
          <div className="flex items-center gap-2 font-semibold text-slate-900">
            <MessageSquare className="h-4 w-4 text-slate-400" />
            No texts or calls behind this lead
          </div>
          <p className="mt-1">
            This one came in another way. When somebody texts or rings your number, the whole conversation shows
            here and you can answer from this tab.
          </p>
        </div>
      )}

      {threads.map((t, idx) => (
        <section key={t.id} className="rounded-lg border border-slate-200 bg-white">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
              <span className="truncate text-xs font-semibold text-slate-900">
                Text message{t.business_number ? ` · via ${t.business_number}` : ""}
              </span>
              <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ${STATUS_CHIP[t.status].cls}`}>
                {STATUS_CHIP[t.status].label}
              </span>
              {t.opted_out && (
                <span className="flex-shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-800 ring-1 ring-rose-200">
                  Opted out
                </span>
              )}
            </div>
            <span className="text-[10px] text-slate-400">
              {t.counterpart_masked} · started {when(t.first_message_at)}
            </span>
          </header>

          <div className="max-h-[320px] space-y-2 overflow-y-auto bg-slate-50 px-3 py-3">
            {t.messages.map((m) => <Bubble key={m.id} m={m} />)}
            {idx === 0 && <div ref={endRef} />}
          </div>

          {idx === 0 && (
            <div className="border-t border-slate-100 p-3">
              {t.can_reply ? (
                <>
                  <label htmlFor="ia-lead-sms-reply" className="mb-1 block text-[11px] font-semibold text-slate-600">
                    Text them back — it arrives on their phone straight away
                  </label>
                  <textarea
                    id="ia-lead-sms-reply"
                    rows={3}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Type your answer…"
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
                  />
                  <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
                    <span>{draft.trim().length} characters</span>
                    <span className={segments > 1 ? "font-semibold text-amber-700" : ""}>
                      {segments <= 1 ? "1 text" : `${segments} texts off your allowance`}
                    </span>
                  </div>
                  {prefix && (
                    /* SMS-16(a). On our shared number the message really does go
                       out with this on the front, and it is counted. Saying so
                       here is the difference between a client who understands
                       the segment count and one who thinks it is broken. */
                    <p className="mt-1 text-[10px] text-slate-500">
                      Sent from our shared number, so it starts with{" "}
                      <span className="font-medium text-slate-700">&ldquo;{prefix.trim()}&rdquo;</span>{" "}
                      — the carriers require it. Your own number sends as just you.
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={sendReply}
                      disabled={busy || !draft.trim()}
                      className="flex items-center gap-1 rounded bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#D85F2A] disabled:opacity-40"
                    >
                      <Send className="h-3 w-3" />Send text
                    </button>
                    <button
                      type="button"
                      onClick={() => closeThread(false)}
                      disabled={busy}
                      className="flex items-center gap-1 rounded border border-slate-300 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                    >
                      <CheckCircle2 className="h-3 w-3" />Close conversation
                    </button>
                    <button
                      type="button"
                      onClick={() => closeThread(true)}
                      disabled={busy}
                      className="flex items-center gap-1 rounded border border-rose-200 px-2.5 py-1.5 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                    >
                      <XCircle className="h-3 w-3" />Spam
                    </button>
                  </div>
                  <p className="mt-1.5 text-[10px] text-slate-400">
                    Sending marks this lead as contacted. The drafted answer, if the Responder wrote one, is on the
                    Responder tab with Approve &amp; send.
                  </p>
                </>
              ) : (
                <p className="flex items-start gap-1.5 text-[11px] text-slate-600">
                  <Lock className="mt-0.5 h-3 w-3 flex-shrink-0 text-slate-400" />
                  <span>
                    {(t.cannot_reply_reason && CANNOT_REPLY[t.cannot_reply_reason])
                      || "You cannot text this conversation right now."}
                  </span>
                </p>
              )}
            </div>
          )}
        </section>
      ))}

      {calls.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white">
          <header className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
            <Phone className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-xs font-semibold text-slate-900">Calls</span>
            <span className="text-[10px] text-slate-400">{calls.length}</span>
          </header>
          <ul className="space-y-2 p-3">
            {calls.map((c) => <CallCard key={c.id} c={c} />)}
          </ul>
        </section>
      )}

      {meta?.sms_enabled === false && (
        <p className="text-[10px] text-slate-400">
          Texting is not switched on for the platform yet, so nothing can be sent from here.
        </p>
      )}
    </div>
  );
}

export default LeadTextsCallsPanel;
