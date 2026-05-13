import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader, Button, FilterBar,
} from "../../components/oliver/ui";
import { Send, ArrowRightCircle, MessageSquare, Plus, Lock } from "lucide-react";

interface Ticket {
  ticket_id: string;
  ticket_number: string;
  contact_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  subject: string;
  body: string;
  priority: "low" | "normal" | "high" | "urgent";
  status: "open" | "in_progress" | "waiting_customer" | "resolved" | "closed" | "converted_to_job";
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

interface Message {
  message_id: string;
  author_type: "customer" | "agent" | "system";
  body: string;
  is_internal: boolean;
  created_at: string;
}

interface TicketDetail { ticket: Ticket; messages: Message[]; }

const STATUS_PILL: Record<string, { bg: string; color: string }> = {
  open: { bg: "#DBEAFE", color: "#1E40AF" },
  in_progress: { bg: "#FEF3C7", color: "#92400E" },
  waiting_customer: { bg: "#FEF3C7", color: "#A16207" },
  resolved: { bg: "#D1FAE5", color: "#047857" },
  closed: { bg: "#F1F5F9", color: "#5A7A8A" },
  converted_to_job: { bg: "#EEF2FF", color: "#4338CA" },
};

const PRIORITY_COLOR: Record<string, string> = {
  low: "#5A7A8A",
  normal: "#0B1C24",
  high: "#D97706",
  urgent: "#B91C1C",
};

const STATUS_PILLS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In progress" },
  { key: "waiting_customer", label: "Waiting" },
  { key: "resolved", label: "Resolved" },
  { key: "closed", label: "Closed" },
];

function fmtRelative(d: string) {
  const t = new Date(d).getTime();
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d2 = Math.floor(h / 24);
  return `${d2}d ago`;
}

export function OliverSupportTicketsPage() {
  const { get, post, patch, ready } = useOliverApi();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [replyText, setReplyText] = useState("");
  const [replyInternal, setReplyInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConvert, setShowConvert] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const path = filter && filter !== "all" ? `/support-tickets?status=${filter}` : "/support-tickets";
      const data = await get<Ticket[]>(path);
      setTickets(data || []);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, filter]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  const filtered = useMemo(() => {
    if (!search.trim()) return tickets;
    const q = search.toLowerCase();
    return tickets.filter((t) =>
      (t.subject || "").toLowerCase().includes(q) ||
      (t.customer_name || "").toLowerCase().includes(q) ||
      (t.ticket_number || "").toLowerCase().includes(q));
  }, [tickets, search]);

  async function loadDetail(ticketId: string) {
    try {
      const d = await get<TicketDetail>(`/support-tickets/${ticketId}`);
      setSelected(d);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Load failed");
    }
  }

  async function sendReply() {
    if (!selected || !replyText.trim()) return;
    setSending(true);
    try {
      await post(`/support-tickets/${selected.ticket.ticket_id}/messages`, {
        body: replyText.trim(),
        author_type: "agent",
        is_internal: replyInternal,
      });
      setReplyText("");
      setReplyInternal(false);
      loadDetail(selected.ticket.ticket_id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Send failed");
    } finally { setSending(false); }
  }

  async function updateStatus(status: string) {
    if (!selected) return;
    try {
      await patch(`/support-tickets/${selected.ticket.ticket_id}`, { status });
      loadDetail(selected.ticket.ticket_id);
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Update failed");
    }
  }

  return (
    <OliverPageWrapper title="Support Tickets" subtitle="Customer inquiries and team conversations" error={error} loading={loading && !tickets.length}>
      <PageHeader
        title="Support Tickets"
        subtitle="Track customer questions, route them to your team, and convert to jobs when work is needed."
        actions={<Button variant="primary" onClick={() => setShowNew(true)}><Plus size={12} /> New ticket</Button>}
      />

      {flash && <div style={{ padding: 10, marginBottom: 12, fontSize: 12, background: "#F0FDF4", color: "#15803D", border: "1px solid #BBF7D0", borderRadius: 6 }}>{flash}</div>}

      <FilterBar pills={STATUS_PILLS} activePill={filter} onPillChange={setFilter} search={search} onSearchChange={setSearch} searchPlaceholder="Search tickets…" />

      <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 14, height: "calc(100vh - 260px)", minHeight: 400 }}>
        <div className="card" style={{ padding: 0, overflowY: "auto" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 20, fontSize: 12, color: "#5A7A8A" }}>No tickets.</div>
          ) : filtered.map((t) => {
            const pill = STATUS_PILL[t.status] || STATUS_PILL.open;
            const isSelected = selected?.ticket.ticket_id === t.ticket_id;
            return (
              <div key={t.ticket_id} onClick={() => loadDetail(t.ticket_id)} style={{
                padding: "12px 14px", borderBottom: "1px solid #F1F5F9", cursor: "pointer",
                background: isSelected ? "#E8F4FB" : undefined,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: "#5A7A8A", fontFamily: "monospace" }}>{t.ticket_number}</span>
                  <span style={{ padding: "2px 7px", borderRadius: 99, background: pill.bg, color: pill.color, fontSize: 10, fontWeight: 600 }}>{t.status.replace(/_/g, " ")}</span>
                </div>
                <div style={{ fontWeight: 600, color: "#1A3A4A", fontSize: 13 }}>{t.subject}</div>
                <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 2 }}>{t.customer_name || t.customer_email || "—"}</div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: PRIORITY_COLOR[t.priority] || "#5A7A8A", fontWeight: 600, textTransform: "uppercase" }}>{t.priority}</span>
                  <span style={{ fontSize: 10, color: "#94A3B8" }}>{fmtRelative(t.updated_at)}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="card" style={{ padding: 0, display: "flex", flexDirection: "column" }}>
          {!selected ? (
            <div style={{ padding: 40, textAlign: "center", color: "#5A7A8A", fontSize: 13 }}>
              <MessageSquare size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
              <div>Select a ticket to view the conversation.</div>
            </div>
          ) : (
            <>
              <div style={{ padding: 16, borderBottom: "1px solid #E2E8F0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 10, color: "#5A7A8A", fontFamily: "monospace" }}>{selected.ticket.ticket_number}</div>
                    <h3 style={{ margin: "2px 0 6px", fontSize: 16, fontWeight: 700, color: "#1A3A4A" }}>{selected.ticket.subject}</h3>
                    <div style={{ fontSize: 11, color: "#5A7A8A" }}>From {selected.ticket.customer_name || selected.ticket.customer_email || "(unknown)"}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <select value={selected.ticket.status} onChange={(e) => updateStatus(e.target.value)} style={{ fontSize: 11, padding: "5px 8px", border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6 }}>
                      <option value="open">Open</option>
                      <option value="in_progress">In progress</option>
                      <option value="waiting_customer">Waiting customer</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                    <Button variant="secondary" size="sm" onClick={() => setShowConvert(true)}><ArrowRightCircle size={11} /> Convert to job</Button>
                  </div>
                </div>
              </div>

              <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ padding: 10, background: "#F8FAFC", borderRadius: 6, border: "1px solid #E2E8F0" }}>
                  <div style={{ fontSize: 10, color: "#5A7A8A", marginBottom: 4 }}>{selected.ticket.customer_name || "Customer"} · {fmtRelative(selected.ticket.created_at)}</div>
                  <div style={{ fontSize: 12, color: "#0B1C24", whiteSpace: "pre-wrap" }}>{selected.ticket.body}</div>
                </div>
                {selected.messages.map((m) => (
                  <div key={m.message_id} style={{
                    padding: 10, borderRadius: 6,
                    background: m.is_internal ? "#FEF3C7" : (m.author_type === "agent" ? "#EEF2FF" : "#F8FAFC"),
                    border: `1px solid ${m.is_internal ? "#FDE68A" : (m.author_type === "agent" ? "#C7D2FE" : "#E2E8F0")}`,
                    alignSelf: m.author_type === "agent" ? "flex-end" : "flex-start",
                    maxWidth: "85%",
                  }}>
                    <div style={{ fontSize: 10, color: "#5A7A8A", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                      {m.is_internal && <Lock size={10} />}
                      {m.author_type} · {fmtRelative(m.created_at)} {m.is_internal && "(internal)"}
                    </div>
                    <div style={{ fontSize: 12, color: "#0B1C24", whiteSpace: "pre-wrap" }}>{m.body}</div>
                  </div>
                ))}
              </div>

              <div style={{ padding: 12, borderTop: "1px solid #E2E8F0" }}>
                <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={3} placeholder="Type your reply…" style={{ width: "100%", padding: 8, fontSize: 12, border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6, resize: "vertical" }} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#5A7A8A" }}>
                    <input type="checkbox" checked={replyInternal} onChange={(e) => setReplyInternal(e.target.checked)} />
                    Internal note (not visible to customer)
                  </label>
                  <Button variant="primary" onClick={sendReply} disabled={!replyText.trim() || sending}><Send size={11} /> {sending ? "Sending…" : "Send reply"}</Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {showNew && (
        <NewTicketModal onClose={() => setShowNew(false)} onCreated={(msg) => { setShowNew(false); reload(); setFlash(msg); setTimeout(() => setFlash(null), 3000); }} api={{ post }} />
      )}

      {showConvert && selected && (
        <ConvertModal ticket={selected.ticket} onClose={() => setShowConvert(false)} onConverted={(msg) => { setShowConvert(false); loadDetail(selected.ticket.ticket_id); reload(); setFlash(msg); setTimeout(() => setFlash(null), 3000); }} api={{ post }} />
      )}
    </OliverPageWrapper>
  );
}

function NewTicketModal({ onClose, onCreated, api }: {
  onClose: () => void;
  onCreated: (msg: string) => void;
  api: { post: <T>(p: string, b?: unknown) => Promise<T> };
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState("normal");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!subject.trim() || !body.trim()) { setErr("Subject and body required"); return; }
    setErr(null); setSaving(true);
    try {
      await api.post("/support-tickets", { subject: subject.trim(), body: body.trim(), priority });
      onCreated("Ticket created.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally { setSaving(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(11,28,36,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 480, background: "#fff", borderRadius: 8 }}>
        <div style={{ padding: 18, borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1A3A4A" }}>New ticket</h2>
          <button onClick={onClose} style={{ background: "transparent", border: 0, fontSize: 22, color: "#5A7A8A", cursor: "pointer" }}>×</button>
        </div>
        <div style={{ padding: 18, display: "grid", gap: 12 }}>
          <label><span style={pLabel}>Subject</span><input style={pInput} value={subject} onChange={(e) => setSubject(e.target.value)} autoFocus /></label>
          <label><span style={pLabel}>Description</span><textarea rows={4} style={{ ...pInput, resize: "vertical" }} value={body} onChange={(e) => setBody(e.target.value)} /></label>
          <label><span style={pLabel}>Priority</span>
            <select style={pInput} value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>
          {err && <div style={errBox}>{err}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={submit} disabled={saving || !subject.trim() || !body.trim()}>{saving ? "Creating…" : "Create ticket"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConvertModal({ ticket, onClose, onConverted, api }: {
  ticket: Ticket;
  onClose: () => void;
  onConverted: (msg: string) => void;
  api: { post: <T>(p: string, b?: unknown) => Promise<T> };
}) {
  const [title, setTitle] = useState(ticket.subject);
  const [scheduledAt, setScheduledAt] = useState("");
  const [price, setPrice] = useState("");
  const [jobType, setJobType] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null); setSaving(true);
    try {
      const result = await api.post<{ job_id: string }>(`/support-tickets/${ticket.ticket_id}/convert`, {
        title: title.trim() || undefined,
        scheduled_at: scheduledAt || undefined,
        price: price ? Number(price) : undefined,
        job_type: jobType.trim() || undefined,
      });
      onConverted(`Created job ${result.job_id} from ticket.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally { setSaving(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(11,28,36,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 440, background: "#fff", borderRadius: 8 }}>
        <div style={{ padding: 18, borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1A3A4A" }}>Convert ticket to job</h2>
          <button onClick={onClose} style={{ background: "transparent", border: 0, fontSize: 22, color: "#5A7A8A", cursor: "pointer" }}>×</button>
        </div>
        <div style={{ padding: 18, display: "grid", gap: 12 }}>
          <label><span style={pLabel}>Job title</span><input style={pInput} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <label><span style={pLabel}>Job type</span><input style={pInput} placeholder="optional" value={jobType} onChange={(e) => setJobType(e.target.value)} /></label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label><span style={pLabel}>Scheduled at</span><input type="datetime-local" style={pInput} value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /></label>
            <label><span style={pLabel}>Price</span><input type="number" min="0" step="0.01" style={pInput} value={price} onChange={(e) => setPrice(e.target.value)} /></label>
          </div>
          {err && <div style={errBox}>{err}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={submit} disabled={saving}>{saving ? "Converting…" : "Convert"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const pLabel: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 };
const pInput: React.CSSProperties = { width: "100%", padding: "7px 10px", fontSize: 12, border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6, background: "#fff", color: "#0B1C24" };
const errBox: React.CSSProperties = { padding: 10, fontSize: 12, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 6 };
