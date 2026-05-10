import { useCallback, useEffect, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader, EmptyState, Button,
} from "../../components/oliver/ui";

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

function fmtRelative(d?: string) {
  if (!d) return "";
  const ms = Date.now() - new Date(d).getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return new Date(d).toLocaleDateString();
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

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await get<Thread[]>("/messages/threads");
      setThreads(data || []);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  async function loadThread(threadId: string) {
    setSelectedThread(threadId);
    setMsgsLoading(true);
    try {
      const data = await get<Message[]>(`/messages/threads/${threadId}`);
      setMessages(data || []);
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
    } catch { /* silent */ }
    finally { setSending(false); }
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
    } catch { /* silent */ }
    finally { setSending(false); }
  }

  return (
    <OliverPageWrapper title="Messages" subtitle="2-way messaging with customers and team" error={error} loading={loading}>
      <PageHeader
        title="Messages"
        subtitle="Conversations with your customers and team — replies sync via email"
        actions={<Button variant="primary" onClick={() => setShowCompose(true)}>New thread</Button>}
      />

      {!threads.length ? (
        <EmptyState
          title="No conversations yet"
          description="Start a thread with a customer or team member. Replies are delivered via email and synced back into the conversation here."
          action={<Button variant="primary" onClick={() => setShowCompose(true)}>Start a thread</Button>}
        />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 12, minHeight: 500 }}>
          {/* Thread list */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ maxHeight: 600, overflowY: "auto" }}>
              {threads.map((t) => (
                <button
                  key={t.id}
                  onClick={() => loadThread(t.id)}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "10px 14px", border: "none",
                    borderBottom: "1px solid #f0f4f6",
                    background: selectedThread === t.id ? "#E8F4FB" : "transparent",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.subject}</span>
                    {t.unreadCount > 0 && (
                      <span style={{
                        marginLeft: 6, flexShrink: 0,
                        background: "#1A7DB5", color: "#fff",
                        fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999,
                      }}>{t.unreadCount}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.participantName}</div>
                  <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.lastMessage}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Conversation pane */}
          <div className="card" style={{ display: "flex", flexDirection: "column", padding: 0 }}>
            {selectedThread ? (
              <>
                <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
                  {msgsLoading ? (
                    <div style={{ color: "#5A7A8A", fontSize: 12 }}>Loading messages…</div>
                  ) : !messages.length ? (
                    <div style={{ color: "#5A7A8A", fontSize: 12, fontStyle: "italic", textAlign: "center", padding: 20 }}>
                      No messages in this thread yet.
                    </div>
                  ) : (
                    messages.map((m) => (
                      <div key={m.id} style={{ marginBottom: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: "#0B1C24" }}>{m.sender}</span>
                          <span style={{ fontSize: 10, color: "#94A3B8" }}>{fmtRelative(m.timestamp)}</span>
                        </div>
                        <div style={{ fontSize: 12, color: "#0B1C24", background: "#f8fafc", padding: "8px 12px", borderRadius: 8, lineHeight: 1.45 }}>{m.body}</div>
                      </div>
                    ))
                  )}
                </div>
                <div style={{ borderTop: "1px solid #eef2f4", padding: 10, display: "flex", gap: 8 }}>
                  <input
                    style={{
                      flex: 1, padding: "8px 12px",
                      border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6,
                      fontSize: 12, outline: "none",
                    }}
                    placeholder="Type a message…"
                    value={newMsg}
                    onChange={(e) => setNewMsg(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  />
                  <Button variant="primary" onClick={handleSend} disabled={sending || !newMsg.trim()}>Send</Button>
                </div>
              </>
            ) : (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#5A7A8A", fontSize: 12 }}>
                Select a conversation to view messages.
              </div>
            )}
          </div>
        </div>
      )}

      {showCompose && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.4)",
        }}>
          <div className="card" style={{ width: "100%", maxWidth: 460, margin: 16 }}>
            <div className="card-ttl">New thread</div>
            <div style={{ marginTop: 10 }}>
              <label style={{ display: "block", fontSize: 11, color: "#5A7A8A", marginBottom: 4 }}>Recipient</label>
              <input
                style={{ width: "100%", padding: 8, border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6, fontSize: 12 }}
                value={composeForm.recipient}
                onChange={(e) => setComposeForm({ ...composeForm, recipient: e.target.value })}
              />
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={{ display: "block", fontSize: 11, color: "#5A7A8A", marginBottom: 4 }}>Subject</label>
              <input
                style={{ width: "100%", padding: 8, border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6, fontSize: 12 }}
                value={composeForm.subject}
                onChange={(e) => setComposeForm({ ...composeForm, subject: e.target.value })}
              />
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={{ display: "block", fontSize: 11, color: "#5A7A8A", marginBottom: 4 }}>Message</label>
              <textarea
                rows={4}
                style={{ width: "100%", padding: 8, border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6, fontSize: 12, fontFamily: "inherit" }}
                value={composeForm.body}
                onChange={(e) => setComposeForm({ ...composeForm, body: e.target.value })}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
              <Button variant="secondary" onClick={() => setShowCompose(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleCompose} disabled={sending || !composeForm.subject.trim()}>
                {sending ? "Sending…" : "Create thread"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </OliverPageWrapper>
  );
}
