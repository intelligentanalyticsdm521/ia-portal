// SparkConversationsPage — every conversation this business is having.
//
// THE HOLE THIS FILLS. Until today a text, a call, a voicemail and a web chat
// were only reachable THROUGH a lead. Both "did this become a lead" decisions
// refuse a greeting — quite rightly, because "hi" is not a lead — which meant a
// live web chat, or an inbound text that had not got to the point yet, had NO
// SCREEN ANYWHERE in the Portal. The visitor waited and nobody saw it.
//
// ONE LIST, FOUR CHANNELS, and the per-lead panels are unchanged: this is an
// additional way in, not a replacement for the one that works. A conversation
// that HAS a lead links straight to it.
//
// EVERY NUMBER IS MASKED by the API, before it reaches this file. An inbox is
// the screen most likely to end up in a screenshot.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
// The ONE filter chip. An inline copy is a 24px tap target on a phone, which is
// what pre-walk pass 2 found and what tap-targets.test.mjs now refuses.
import { FilterChip, FilterChipRow } from "../../components/spark/FilterChip";
import {
  MessageSquare, Phone, Voicemail, Globe, Search, UserPlus, Check,
  ArrowRight, Send, Inbox, AlertTriangle,
} from "lucide-react";

type Kind = "text" | "chat" | "call";

interface Row {
  kind: Kind;
  channel: string;
  id: number;
  key: string;
  who: string;
  preview: string | null;
  status: string;
  unread: boolean;
  unread_count: number;
  assigned_to: string | null;
  assigned_at: string | null;
  lead_id: number | null;
  contact_id: number | null;
  last_activity_at: string;
  started_at: string;
  message_count: number | null;
}

interface Message {
  id: number;
  direction: string;
  body: string;
  status?: string;
  sent_by?: string | null;
  occurred_at?: string;
  created_at?: string;
}

interface Detail extends Row {
  can_reply: boolean;
  cannot_reply_reason: string | null;
  cannot_reply_message?: string | null;
  messages: Message[];
}

interface Counts { text: number; chat: number; call: number; total: number }

const CHANNEL_ICON: Record<string, typeof MessageSquare> = {
  text: MessageSquare,
  web_chat: Globe,
  call: Phone,
  voicemail: Voicemail,
};

const CHANNEL_LABEL: Record<string, string> = {
  text: "Text",
  web_chat: "Website chat",
  call: "Call",
  voicemail: "Voicemail",
};

function when(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return d.toLocaleDateString();
}

export function SparkConversationsPage() {
  const { get, post, ready } = useSparkApi();
  const navigate = useNavigate();

  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [kinds, setKinds] = useState<Kind[]>([]);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");

  const [openKey, setOpenKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (kinds.length) p.set("kinds", kinds.join(","));
    if (unreadOnly) p.set("unread", "1");
    if (mineOnly) p.set("unassigned", "0");
    if (search.trim()) p.set("q", search.trim());
    p.set("limit", "25");
    return p;
  }, [kinds, unreadOnly, mineOnly, search]);

  const load = useCallback(async (append: boolean, from: string | null) => {
    if (!ready) return;
    try {
      const p = new URLSearchParams(query);
      if (from) p.set("cursor", from);
      const res = await get<{ data: Row[]; meta: { next_cursor: string | null; has_more: boolean } }>(
        `/api/v1/conversations/inbox?${p.toString()}`
      );
      setRows((prev) => (append ? [...prev, ...res.data] : res.data));
      setCursor(res.meta.next_cursor);
      setHasMore(res.meta.has_more);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [get, ready, query]);

  const loadCounts = useCallback(async () => {
    if (!ready) return;
    try {
      const res = await get<{ data: Counts }>("/api/v1/conversations/inbox/counts");
      setCounts(res.data);
    } catch { /* the badge is not worth an error banner */ }
  }, [get, ready]);

  useEffect(() => { setLoading(true); load(false, null); }, [load]);
  useEffect(() => { loadCounts(); }, [loadCounts]);

  const openOne = useCallback(async (row: Row) => {
    setOpenKey(row.key);
    setDetail(null);
    setReply("");
    setSendError(null);
    setDetailLoading(true);
    try {
      const res = await get<{ data: Detail }>(`/api/v1/conversations/inbox/${row.kind}/${row.id}`);
      setDetail(res.data);
      // Opening it IS reading it — the API has already cleared the count, so
      // the list agrees without a second round trip.
      setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, unread: false, unread_count: 0 } : r)));
      loadCounts();
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "That conversation could not be opened.");
    } finally {
      setDetailLoading(false);
    }
  }, [get, loadCounts]);

  const assign = useCallback(async (row: Row, toMe: boolean) => {
    try {
      const res = await post<{ data: { assigned_to: string | null } }>(
        `/api/v1/conversations/inbox/${row.kind}/${row.id}/assign`,
        toMe ? {} : { assignee: null }
      );
      setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, assigned_to: res.data.assigned_to } : r)));
      setDetail((d) => (d && d.key === row.key ? { ...d, assigned_to: res.data.assigned_to } : d));
    } catch { /* the row simply does not change */ }
  }, [post]);

  const send = useCallback(async () => {
    if (!detail || !reply.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      await post(`/api/v1/conversations/inbox/${detail.kind}/${detail.id}/reply`, { body: reply.trim() });
      setReply("");
      const res = await get<{ data: Detail }>(`/api/v1/conversations/inbox/${detail.kind}/${detail.id}`);
      setDetail(res.data);
    } catch (e) {
      // The refusal reason comes back in the owner's words from the one place
      // that decides it — never a code, and never a silent no-op.
      const msg = (e as { body?: { message?: string; error?: string } })?.body?.message
        || (e as { body?: { error?: string } })?.body?.error
        || (e instanceof Error ? e.message : "That could not be sent.");
      setSendError(msg);
    } finally {
      setSending(false);
    }
  }, [detail, reply, post, get]);

  const toggleKind = (k: Kind) =>
    setKinds((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));

  return (
    <SparkPageShell
      title="Conversations"
      subtitle={counts ? `${counts.total} unread` : undefined}
      help="Every text, call, voicemail and website chat this business has had — including the ones that have not become a lead yet. Open one to read it and reply."
      loading={loading}
      error={error}
      filters={
        <div className="flex flex-wrap items-center gap-2">
          <FilterChipRow>
            {(["text", "chat", "call"] as Kind[]).map((k) => (
              <FilterChip key={k} active={kinds.includes(k)} onClick={() => toggleKind(k)}>
                {k === "text" ? "Texts" : k === "chat" ? "Website chats" : "Calls & voicemails"}
                {counts ? ` (${k === "text" ? counts.text : k === "chat" ? counts.chat : counts.call})` : ""}
              </FilterChip>
            ))}
            <FilterChip active={unreadOnly} onClick={() => setUnreadOnly((v) => !v)}>
              Unread only
            </FilterChip>
            <FilterChip active={mineOnly} onClick={() => setMineOnly((v) => !v)}>
              Taken by someone
            </FilterChip>
          </FilterChipRow>
          <form
            className="ml-auto flex items-center gap-1"
            onSubmit={(e) => { e.preventDefault(); setSearch(q); }}
          >
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="A number, a name, or words they said"
                className="w-64 rounded border border-slate-300 py-1 pl-7 pr-2 text-xs focus:border-[#EF6C33]"
              />
            </div>
            <button type="submit" className="rounded bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">
              Search
            </button>
          </form>
        </div>
      }
    >
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-12 text-center">
          <Inbox className="mx-auto mb-2 h-8 w-8 text-slate-300" />
          <div className="text-sm font-medium text-slate-700">
            {search || unreadOnly || kinds.length ? "Nothing matches that" : "No conversations yet"}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {search || unreadOnly || kinds.length
              ? "Clear the filters to see everything."
              : "Texts, calls, voicemails and website chats all land here — including the ones that have not become a lead."}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_1fr]">
          {/* ── the list ─────────────────────────────────────────────── */}
          <div>
            <ul className="space-y-1">
              {rows.map((row) => {
                const Icon = CHANNEL_ICON[row.channel] || MessageSquare;
                const active = openKey === row.key;
                return (
                  <li key={row.key}>
                    <button
                      onClick={() => openOne(row)}
                      className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                        active ? "border-[#EF6C33] bg-orange-50" : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${row.unread ? "text-[#EF6C33]" : "text-slate-400"}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className={`truncate text-sm ${row.unread ? "font-bold text-slate-900" : "font-medium text-slate-800"}`}>
                              {row.who}
                            </span>
                            <span className="flex-shrink-0 text-[10px] text-slate-400">{when(row.last_activity_at)}</span>
                          </div>
                          <div className="truncate text-[11px] text-slate-500">
                            {CHANNEL_LABEL[row.channel] || row.channel}
                            {row.preview ? ` — ${row.preview}` : ""}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                            {row.unread && (
                              <span className="rounded-full bg-[#EF6C33] px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                                {row.unread_count > 1 ? `${row.unread_count} new` : "New"}
                              </span>
                            )}
                            {row.assigned_to && (
                              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">
                                {row.assigned_to}
                              </span>
                            )}
                            {row.lead_id && (
                              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-800">
                                Lead #{row.lead_id}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
            {hasMore && (
              <button
                onClick={() => load(true, cursor)}
                className="mt-2 w-full rounded border border-slate-300 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Show older
              </button>
            )}
          </div>

          {/* ── the conversation ─────────────────────────────────────── */}
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            {!openKey && (
              <div className="py-16 text-center text-sm text-slate-500">
                Pick a conversation on the left to read it.
              </div>
            )}
            {openKey && detailLoading && (
              <div className="py-16 text-center text-sm text-slate-500">Opening…</div>
            )}
            {openKey && !detailLoading && detail && (
              <>
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <div className="text-sm font-bold text-slate-900">{detail.who}</div>
                    <div className="text-[11px] text-slate-500">
                      {CHANNEL_LABEL[detail.channel] || detail.channel} · started {when(detail.started_at)}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {detail.assigned_to ? (
                      <button
                        onClick={() => assign(detail, false)}
                        className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Check className="h-3 w-3" /> {detail.assigned_to} — put it back
                      </button>
                    ) : (
                      <button
                        onClick={() => assign(detail, true)}
                        className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <UserPlus className="h-3 w-3" /> I'll take this
                      </button>
                    )}
                    {detail.lead_id && (
                      <button
                        onClick={() => navigate(`/app/services/spark_lead_inbox?lead=${detail.lead_id}`)}
                        className="flex items-center gap-1 rounded bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white"
                      >
                        Open the lead <ArrowRight className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>

                {detail.messages.length === 0 && detail.kind === "call" && (
                  <div className="py-6 text-sm text-slate-600">
                    {detail.preview
                      ? <>They said: <span className="italic">&ldquo;{detail.preview}&rdquo;</span></>
                      : "They rang and left no message we could write down."}
                  </div>
                )}

                <ul className="max-h-[420px] space-y-2 overflow-y-auto py-3">
                  {detail.messages.map((m) => {
                    const inbound = m.direction === "in" || m.direction === "visitor";
                    return (
                      <li key={m.id} className={inbound ? "text-left" : "text-right"}>
                        <div
                          className={`inline-block max-w-[80%] rounded-lg px-3 py-1.5 text-xs ${
                            inbound ? "bg-slate-100 text-slate-800" : "bg-[#EF6C33] text-white"
                          }`}
                        >
                          {m.body}
                        </div>
                        <div className="mt-0.5 text-[10px] text-slate-400">
                          {m.sent_by || (inbound ? "them" : "you")}
                          {m.occurred_at ? ` · ${when(m.occurred_at)}` : ""}
                          {m.status && m.status !== "sent" && m.status !== "received" ? ` · ${m.status}` : ""}
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {detail.can_reply ? (
                  <div className="border-t border-slate-100 pt-3">
                    <textarea
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      rows={3}
                      placeholder="Type your reply…"
                      className="w-full rounded border border-slate-300 p-2 text-sm focus:border-[#EF6C33]"
                    />
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-[10px] text-slate-400">
                        Goes out the same way every other message on the platform does.
                      </span>
                      <button
                        onClick={send}
                        disabled={sending || !reply.trim()}
                        className="flex items-center gap-1 rounded bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                      >
                        <Send className="h-3.5 w-3.5" /> {sending ? "Sending…" : "Send"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-1.5 border-t border-slate-100 pt-3 text-[11px] text-slate-600">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
                    <span>
                      {detail.cannot_reply_message
                        || (detail.kind === "call"
                          ? "Ring them back from your phone. Texting a number that rang you is switched off until the carrier registration completes."
                          : "This conversation is closed, so there is nowhere to reply.")}
                    </span>
                  </div>
                )}

                {sendError && (
                  <div className="mt-2 rounded bg-amber-50 px-3 py-2 text-[11px] text-amber-900 ring-1 ring-amber-200">
                    {sendError}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </SparkPageShell>
  );
}

export default SparkConversationsPage;
