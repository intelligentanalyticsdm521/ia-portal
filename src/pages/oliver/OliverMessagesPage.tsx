import { useEffect, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

interface Thread {
  id: string;
  subject: string;
  participantName: string;
  lastMessage: string;
  updatedAt: string;
  unreadCount: number;
}

interface Message {
  id: string;
  sender: string;
  body: string;
  timestamp: string;
}

export function OliverMessagesPage() {
  const { get, post, ready } = useOliverApi();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [newMsg, setNewMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [composeForm, setComposeForm] = useState({ subject: "", recipient: "", body: "" });

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await get<Thread[]>("/messages/threads");
        if (!cancelled) setThreads(data);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [get, ready]);

  async function loadThread(threadId: string) {
    setSelectedThread(threadId);
    setMsgsLoading(true);
    try {
      const data = await get<Message[]>(`/messages/threads/${threadId}`);
      setMessages(data);
    } catch {
      setMessages([]);
    } finally {
      setMsgsLoading(false);
    }
  }

  async function handleSend() {
    if (!newMsg.trim() || !selectedThread) return;
    setSending(true);
    try {
      const msg = await post<Message>(`/messages/threads/${selectedThread}/send`, { body: newMsg });
      setMessages((prev) => [...prev, msg]);
      setNewMsg("");
    } catch {
      // silent
    } finally {
      setSending(false);
    }
  }

  async function handleCompose() {
    if (!composeForm.subject.trim() || !composeForm.recipient.trim()) return;
    setSending(true);
    try {
      const thread = await post<Thread>("/messages/threads", composeForm);
      setThreads((prev) => [thread, ...prev]);
      setShowCompose(false);
      setComposeForm({ subject: "", recipient: "", body: "" });
      await loadThread(thread.id);
    } catch {
      // silent
    } finally {
      setSending(false);
    }
  }

  return (
    <OliverPageWrapper title="Messages" subtitle="2-way messaging with customers and team" error={error} loading={loading}>
      <div className="flex items-center justify-between">
        <button onClick={() => setShowCompose(true)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">
          New Thread
        </button>
      </div>

      <div className="flex gap-4 min-h-[500px]">
        {/* Thread list */}
        <div className="w-80 flex-shrink-0 rounded-xl bg-white ring-1 ring-gray-200 overflow-hidden">
          <div className="divide-y divide-gray-100 overflow-y-auto max-h-[600px]">
            {threads.map((t) => (
              <button
                key={t.id}
                onClick={() => loadThread(t.id)}
                className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition ${
                  selectedThread === t.id ? "bg-blue-50" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-800 truncate">{t.subject}</p>
                  {t.unreadCount > 0 && (
                    <span className="ml-2 flex-shrink-0 rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] text-white font-bold">
                      {t.unreadCount}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 truncate">{t.participantName}</p>
                <p className="text-xs text-slate-400 truncate mt-0.5">{t.lastMessage}</p>
              </button>
            ))}
            {threads.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-slate-400">No conversations yet.</div>
            )}
          </div>
        </div>

        {/* Conversation pane */}
        <div className="flex-1 rounded-xl bg-white ring-1 ring-gray-200 flex flex-col">
          {selectedThread ? (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {msgsLoading ? (
                  <div className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="h-12 bg-gray-200 rounded animate-pulse" />
                    ))}
                  </div>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-700">{m.sender}</span>
                        <span className="text-[10px] text-slate-400">{new Date(m.timestamp).toLocaleString()}</span>
                      </div>
                      <p className="text-sm text-slate-600 bg-gray-50 rounded-lg px-3 py-2">{m.body}</p>
                    </div>
                  ))
                )}
              </div>
              <div className="border-t border-gray-100 p-3 flex gap-2">
                <input
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Type a message..."
                  value={newMsg}
                  onChange={(e) => setNewMsg(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !newMsg.trim()}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
              Select a conversation to view messages.
            </div>
          )}
        </div>
      </div>

      {showCompose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="rounded-xl bg-white p-6 shadow-xl w-full max-w-md space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">New Thread</h2>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Recipient</label>
              <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={composeForm.recipient} onChange={(e) => setComposeForm({ ...composeForm, recipient: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Subject</label>
              <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={composeForm.subject} onChange={(e) => setComposeForm({ ...composeForm, subject: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Message</label>
              <textarea rows={3} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={composeForm.body} onChange={(e) => setComposeForm({ ...composeForm, body: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCompose(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-slate-700 hover:bg-gray-50">Cancel</button>
              <button onClick={handleCompose} disabled={sending || !composeForm.subject.trim()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
                {sending ? "Sending..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </OliverPageWrapper>
  );
}
