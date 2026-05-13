// SparkSmsInboxPage — 2-way SMS inbox
// Lists inbound messages, threads by contact, supports mark-read and reply via /api/v1/sms/send.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { MessageSquare, Send, Phone, AlertCircle } from "lucide-react";

interface InboundRow {
  id: number;
  contact_id: number | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  from_phone: string;
  to_phone: string;
  body: string;
  media_urls: string | null;
  is_read: boolean;
  is_stop: boolean;
  received_at: string;
}

interface ConvMsg {
  id: number;
  direction: "inbound" | "outbound";
  body: string;
  at: string;
  from_phone: string;
  to_phone: string;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString();
}

export function SparkSmsInboxPage() {
  const { get, post, ready } = useSparkApi();
  const [rows, setRows] = useState<InboundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [showUnread, setShowUnread] = useState(false);
  const [selected, setSelected] = useState<InboundRow | null>(null);
  const [thread, setThread] = useState<ConvMsg[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const fetchInbox = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const r = await get<{ items: InboundRow[] }>(`/api/v1/sms/inbox${showUnread ? "?unread=true" : ""}`);
      setRows(r.items || []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [get, ready, showUnread]);

  useEffect(() => { fetchInbox(); }, [fetchInbox]);

  const unreadCount = useMemo(() => rows.filter(r => !r.is_read).length, [rows]);

  async function openMessage(row: InboundRow) {
    setSelected(row);
    setThread([]);
    if (!row.is_read) {
      try { await post(`/api/v1/sms/inbox/${row.id}/read`, {}); } catch { /* no-op */ }
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, is_read: true } : r));
    }
    if (row.contact_id) {
      try {
        const r = await get<{ data: ConvMsg[] }>(`/api/v1/sms/conversations/${row.contact_id}`);
        setThread(r.data || []);
      } catch { setThread([]); }
    }
  }

  async function sendReply() {
    if (!selected || !reply.trim()) return;
    setSending(true);
    try {
      await post(`/api/v1/sms/send`, { to: selected.from_phone, message: reply.trim(), source: "inbox-reply" });
      setReply("");
      // Optimistically append to thread
      setThread(prev => [...prev, {
        id: Date.now(), direction: "outbound", body: reply.trim(),
        at: new Date().toISOString(), from_phone: "iadm-shared", to_phone: selected.from_phone,
      }]);
    } catch (err) {
      alert(`Failed to send: ${(err as Error).message}`);
    } finally {
      setSending(false);
    }
  }

  const stats = (
    <div className="flex items-center gap-4 text-sm">
      <Stat icon={MessageSquare} label="Inbox" value={rows.length} />
      <Stat icon={AlertCircle} label="Unread" value={unreadCount} accent />
    </div>
  );

  const filters = (
    <div className="flex items-center gap-2">
      <button onClick={() => setShowUnread(false)}
        className={`text-xs px-3 py-1 rounded-full border ${!showUnread ? "bg-[#0B1C24] text-white border-[#0B1C24]" : "border-slate-200 text-slate-600"}`}>All</button>
      <button onClick={() => setShowUnread(true)}
        className={`text-xs px-3 py-1 rounded-full border ${showUnread ? "bg-[#0B1C24] text-white border-[#0B1C24]" : "border-slate-200 text-slate-600"}`}>Unread ({unreadCount})</button>
    </div>
  );

  return (
    <SparkPageShell
      title="SMS Inbox"
      subtitle="2-way replies from the shared IADM toll-free number"
      help="Inbound text messages from contacts. Reply directly from this page — replies are sent via Azure Communication Services through the shared IADM toll-free number. STOP messages auto-unsubscribe the contact."
      stats={stats}
      filters={filters}
      loading={loading}
      error={error}
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Inbox list */}
        <div className="lg:col-span-1 max-h-[640px] overflow-y-auto border border-slate-200 rounded">
          {rows.length === 0 && <div className="p-6 text-center text-sm text-slate-500">No messages.</div>}
          {rows.map(r => (
            <button key={r.id} onClick={() => openMessage(r)}
              className={`w-full text-left p-3 border-b border-slate-100 hover:bg-slate-50 ${selected?.id === r.id ? "bg-[#FFF6F0]" : ""} ${!r.is_read ? "font-semibold" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-slate-900 truncate">
                    {r.first_name || r.last_name ? `${r.first_name || ""} ${r.last_name || ""}`.trim() : r.from_phone}
                  </div>
                  <div className="text-xs text-slate-500 truncate">{r.body.slice(0, 60)}</div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <div className="text-[10px] text-slate-400">{new Date(r.received_at).toLocaleDateString()}</div>
                  {r.is_stop && <span className="inline-block text-[9px] mt-1 px-1 py-0.5 rounded bg-rose-100 text-rose-700">STOP</span>}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Conversation view */}
        <div className="lg:col-span-2">
          {!selected && (
            <div className="border border-slate-200 rounded p-8 text-center text-sm text-slate-500">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 text-slate-300" />
              Select a message to view the conversation.
            </div>
          )}
          {selected && (
            <div className="border border-slate-200 rounded flex flex-col h-[640px]">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    {selected.first_name || selected.last_name ? `${selected.first_name || ""} ${selected.last_name || ""}`.trim() : selected.from_phone}
                  </div>
                  <div className="text-xs text-slate-500 flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {selected.from_phone}
                    {selected.is_stop && <span className="ml-2 px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[10px]">Unsubscribed (STOP)</span>}
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {thread.length === 0 && (
                  <div className="rounded bg-slate-50 p-3 text-sm">
                    <div className="text-xs text-slate-500 mb-1">{fmtTime(selected.received_at)}</div>
                    <div>{selected.body}</div>
                  </div>
                )}
                {thread.map(m => (
                  <div key={m.id} className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-lg px-3 py-2 ${m.direction === "outbound" ? "bg-[#EF6C33] text-white" : "bg-slate-100 text-slate-900"}`}>
                      <div className="text-sm whitespace-pre-wrap">{m.body}</div>
                      <div className={`text-[10px] mt-1 ${m.direction === "outbound" ? "text-white/70" : "text-slate-500"}`}>{fmtTime(m.at)}</div>
                    </div>
                  </div>
                ))}
              </div>
              {!selected.is_stop && (
                <div className="border-t border-slate-200 p-3 flex items-end gap-2">
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Type a reply…"
                    rows={2}
                    className="flex-1 text-sm border border-slate-300 rounded p-2 resize-none focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]"
                  />
                  <button disabled={sending || !reply.trim()} onClick={sendReply}
                    className="px-3 py-2 rounded bg-[#EF6C33] hover:bg-[#d75a25] text-white disabled:opacity-50 flex items-center gap-1">
                    <Send className="h-4 w-4" /> Send
                  </button>
                </div>
              )}
              {selected.is_stop && (
                <div className="border-t border-slate-200 p-3 text-xs text-slate-500 text-center">
                  This contact has unsubscribed. Replies are blocked.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </SparkPageShell>
  );
}

function Stat({ icon: Icon, label, value, accent }: { icon: typeof MessageSquare; label: string; value: number; accent?: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${accent ? "text-[#EF6C33]" : "text-slate-700"}`}>
      <Icon className="h-4 w-4" />
      <span className="text-xs uppercase tracking-wider">{label}</span>
      <span className="text-base font-bold">{value}</span>
    </div>
  );
}

export default SparkSmsInboxPage;
