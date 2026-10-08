// LeadChatPanel — the Conversation tab on the lead card (Conversations 4).
//
// ONE TAB, ONE COMPONENT. The lead modal stays a modal; the channel grows here.
// Same shape as the Responder tab beside it — the modal imports it, hands it a
// lead id, and knows nothing else about chat.
//
// WHAT THE OWNER NEEDS, in the order they need it:
//   1. what did this person actually say?     the transcript, oldest first
//   2. who answered, and was it us or ARGUS?  every bubble is attributed
//   3. what do I say back?                    the reply box, which also marks
//                                             the lead contacted, because
//                                             answering somebody IS contacting
//                                             them and nobody should have to
//                                             tell the inbox twice
//
// The drafted reply the Responder wrote lives on the RESPONDER tab, with the
// Approve & send / Edit / Discard buttons every other draft has. It is not
// duplicated here: two Approve buttons for one draft is two ways to send it.
//
// "Business", never "tenant" (feedback_no_tenant_in_ui). The engine is
// "ARGUS AI"; the model vendor is named nowhere.
import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, Send, Sparkles, User, Globe, CheckCircle2, XCircle } from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { friendlyApiError } from "../../lib/leadgenBilling";
import { intentLine, openResultWords, type ChatConversationWorkflow } from "../../lib/chatWorkflows";

export interface ChatMessageRow {
  id: number;
  direction: "visitor" | "business" | "agent";
  body: string;
  sent_by: string | null;
  draft_id: number | null;
  delivered_at: string;
  read_at: string | null;
}

export interface ChatConversationRow {
  id: number;
  site_id: string | null;
  site_label: string | null;
  status: "open" | "closed" | "spam";
  page_url: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  consent: boolean;
  message_count: number;
  unread_count: number;
  started_at: string;
  last_message_at: string;
  closed_at: string | null;
  closed_by: string | null;
  messages: ChatMessageRow[];
  /** Chat workflows (contract §C.11): which service and path the visitor took,
   *  what they told us, and what ran for them. Absent when no workflow drove
   *  this conversation. */
  workflow?: ChatConversationWorkflow | null;
}

function when(ts: string | null | undefined) {
  if (!ts) return "";
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

const STATUS_CHIP: Record<ChatConversationRow["status"], { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-emerald-100 text-emerald-800 ring-emerald-200" },
  closed: { label: "Closed", cls: "bg-slate-100 text-slate-600 ring-slate-200" },
  spam: { label: "Marked as spam", cls: "bg-rose-100 text-rose-800 ring-rose-200" },
};

function Bubble({ m }: { m: ChatMessageRow }) {
  const mine = m.direction !== "visitor";
  const agent = m.direction === "agent";
  const who = m.direction === "visitor"
    ? "Them"
    : agent ? (m.sent_by || "ARGUS Responder") : (m.sent_by || "You");
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] rounded-lg px-3 py-2 ${
        mine
          ? (agent ? "bg-violet-50 ring-1 ring-violet-200" : "bg-sky-50 ring-1 ring-sky-200")
          : "bg-white ring-1 ring-slate-200"
      }`}>
        <div className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          {m.direction === "visitor"
            ? <User className="h-3 w-3" />
            : agent ? <Sparkles className="h-3 w-3 text-violet-500" /> : <Send className="h-3 w-3" />}
          <span>{who}</span>
          <span className="font-normal normal-case tracking-normal text-slate-400">{when(m.delivered_at)}</span>
        </div>
        <div className="whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-800">{m.body}</div>
      </div>
    </div>
  );
}

/** What the chat workflow knows about this visitor, above their transcript. */
function WorkflowBlock({ w }: { w: ChatConversationWorkflow }) {
  const looks = intentLine(w.intent_words, w.sure);
  const where = [w.service, w.path].filter(Boolean).join(" · ");
  const fields = Array.isArray(w.fields) ? w.fields : [];
  const results = Array.isArray(w.results) ? w.results : [];
  return (
    <div className="border-b border-slate-100 bg-white px-3 py-2 text-[11px] text-slate-700" data-chat-workflow-block>
      <div className="font-semibold text-slate-900">{where || w.name}</div>
      {looks && <div className="text-slate-500">{looks}</div>}
      {fields.length > 0 && (
        <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          {fields.map((f, i) => (
            <div key={i} className="contents">
              <dt className="text-slate-500">{f.label}</dt>
              <dd className="min-w-0 break-words text-slate-800">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {results.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {results.map((r) => (
            <li key={r.run_id}>
              {r.label}: {r.status_words}
              {r.file_url && (
                <>
                  {" "}
                  <a href={r.file_url} target="_blank" rel="noopener" className="font-semibold text-sky-700 underline">
                    {openResultWords(r.result_label)}
                  </a>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface Props {
  leadId: number | null;
  /** Called after a reply so the inbox row and the Activity tab refresh. */
  onChanged?: () => void;
}

export function LeadChatPanel({ leadId, onChanged }: Props) {
  const { get, post, ready } = useSparkApi();
  const [conversations, setConversations] = useState<ChatConversationRow[]>([]);
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
      const r = await get<{ data: ChatConversationRow[] }>(`/api/v1/leads/${leadId}/chat`);
      setConversations(r.data || []);
    } catch (err) {
      setError(friendlyApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [get, ready, leadId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [conversations]);

  const active = conversations[0] || null;

  async function sendReply() {
    if (!leadId || !active || !draft.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ data: { marked_contacted: boolean } }>(`/api/v1/leads/${leadId}/chat/reply`, {
        conversation_id: active.id,
        body: draft.trim(),
        // Idempotency, so a double click or a retried request is one message.
        client_message_id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      });
      setDraft("");
      setNotice(r.data?.marked_contacted
        ? "Sent — and this lead is marked as contacted."
        : "Sent.");
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
      : "Close this conversation? They can start a new one from your website any time.")) return;
    setBusy(true);
    try {
      await post(`/api/v1/leads/${leadId}/chat/close`, { conversation_id: active.id, spam });
      await load();
      onChanged?.();
    } catch (err) {
      setError(friendlyApiError(err).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading && !conversations.length) return <div className="text-sm text-slate-500">Loading…</div>;

  if (!conversations.length) {
    return (
      <div className="space-y-3">
        {error && <div className="rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">{error}</div>}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
          <div className="flex items-center gap-2 font-semibold text-slate-900">
            <MessageSquare className="h-4 w-4 text-slate-400" />
            No website chat behind this lead
          </div>
          <p className="mt-1">
            This one came in another way. When somebody uses the chat bubble on your website, the whole
            conversation shows here and you can answer from this tab.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <div className="rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">{error}</div>}
      {notice && <div className="rounded border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800">{notice}</div>}

      {conversations.map((c, idx) => (
        <section key={c.id} className="rounded-lg border border-slate-200 bg-white">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
              <span className="truncate text-xs font-semibold text-slate-900">
                Website chat{c.site_label ? ` · via ${c.site_label}` : ""}
              </span>
              <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ${STATUS_CHIP[c.status].cls}`}>
                {STATUS_CHIP[c.status].label}
              </span>
            </div>
            <span className="text-[10px] text-slate-400">Started {when(c.started_at)}</span>
          </header>

          {c.page_url && (
            <div className="flex items-center gap-1.5 border-b border-slate-100 px-3 py-1.5 text-[11px] text-slate-500">
              <Globe className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">They were on <span className="text-slate-700">{c.page_url}</span></span>
            </div>
          )}

          {c.workflow && <WorkflowBlock w={c.workflow} />}

          <div className="max-h-[340px] space-y-2 overflow-y-auto bg-slate-50 px-3 py-3">
            {c.messages.map((m) => <Bubble key={m.id} m={m} />)}
            {idx === 0 && <div ref={endRef} />}
          </div>

          {c.consent && c.email && (
            <div className="border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-500">
              They asked for a copy of this chat at {c.email}.
            </div>
          )}

          {idx === 0 && (
            <div className="border-t border-slate-100 p-3">
              {c.status === "open" ? (
                <>
                  <label htmlFor="ia-lead-chat-reply" className="mb-1 block text-[11px] font-semibold text-slate-600">
                    {c.first_name ? `Reply to ${c.first_name}` : "Your reply"} — they see it straight away
                  </label>
                  <textarea
                    id="ia-lead-chat-reply"
                    rows={3}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Type your answer…"
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={sendReply}
                      disabled={busy || !draft.trim()}
                      className="flex items-center gap-1 rounded bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#D85F2A] disabled:opacity-40"
                    >
                      <Send className="h-3 w-3" />Send reply
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
                <p className="text-[11px] text-slate-500">
                  This conversation is {c.status === "spam" ? "marked as spam" : "closed"}
                  {c.closed_by ? ` (${c.closed_by})` : ""}. They can start a new one from your website any time.
                </p>
              )}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

export default LeadChatPanel;
