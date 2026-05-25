/**
 * JobDetailPanel — the body of the (now-deprecated) standalone JobModal,
 * extracted so it can render inside the unified CustomerModal's Jobs section.
 *
 * Same content as the old JobModal: editable details, catalog line items,
 * workers + status history, profitability, quotes + invoices. The
 * difference: there's no DetailDrawer chrome here — the parent CustomerModal
 * owns the drawer. Status-transition actions live in the footer slot so the
 * CustomerModal can render them at the bottom.
 */
import { useCallback, useEffect, useState } from "react";
import { Button, StatusBadge } from "../ui";
import { CatalogLineItemPicker, type LineItem } from "../CatalogLineItemPicker";

interface JobDetail {
  id: string;
  title?: string;
  customerName?: string;
  customerEmail?: string;
  contactId?: string;
  status: string;
  description?: string;
  scheduledDate?: string;
  scheduledEnd?: string;
  total?: number;
  assignedWorkers?: Array<{
    assignmentId?: string;
    id: string;
    name: string;
    actualHours?: number | null;
    hourlyRate?: number | null;
  }>;
  quotes?: Array<{ id: string; amount: number; status: string }>;
  invoices?: Array<{ id: string; amount: number; amountPaid?: number; status: string }>;
  statusHistory?: Array<{ status: string; timestamp: string; note?: string }>;
}

interface PersistedLineItem {
  id: string;
  serviceOfferingId?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  sortOrder: number;
  durationMinutes?: number | null;
}

const VALID_NEXT: Record<string, string[]> = {
  inquiry: ["quoted", "cancelled"],
  quoted: ["scheduled", "cancelled"],
  scheduled: ["dispatched", "cancelled"],
  dispatched: ["assigned", "cancelled"],
  assigned: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: ["invoiced"],
  invoiced: ["paid"],
  paid: [],
  cancelled: [],
};

function fmtMoney(n?: number | null) {
  return `$${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
function toLocalDtInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export interface JobDetailPanelProps {
  jobId: string;
  api: {
    get: <T>(p: string) => Promise<T>;
    post: <T>(p: string, b?: unknown) => Promise<T>;
    patch: <T>(p: string, b: unknown) => Promise<T>;
  };
  onChanged?: () => void;
  /** Render this above the panel — used by CustomerModal for the
   *  "← back to all jobs" link. */
  topSlot?: React.ReactNode;
}

export function JobDetailPanel({ jobId, api, onChanged, topSlot }: JobDetailPanelProps) {
  const [job, setJob] = useState<JobDetail | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [originalLineItems, setOriginalLineItems] = useState<LineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [editingDetails, setEditingDetails] = useState(false);
  const [eTitle, setETitle] = useState("");
  const [eStart, setEStart] = useState("");
  const [eEnd, setEEnd] = useState("");
  const [eNotes, setENotes] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [j, items] = await Promise.all([
        api.get<JobDetail | { data: JobDetail }>(`/jobs/${jobId}`),
        api.get<{ data: PersistedLineItem[] }>(`/jobs/${jobId}/line-items`).catch(() => ({ data: [] })),
      ]);
      const jobData = (j as any)?.data ?? j;
      setJob(jobData);
      const itemRows = (items?.data || []).map((it) => ({
        id: it.id,
        description: it.description,
        quantity: Number(it.quantity),
        unit_price: Number(it.unitPrice),
        service_offering_id: it.serviceOfferingId ?? null,
        duration_minutes: it.durationMinutes ?? null,
        sort_order: it.sortOrder,
      }));
      setLineItems(itemRows);
      setOriginalLineItems(itemRows);
    } catch (e) {
      setErr((e as Error).message);
    } finally { setLoading(false); }
  }, [api, jobId]);

  useEffect(() => { reload(); }, [reload]);

  function startEditDetails() {
    if (!job) return;
    setETitle(job.title || "");
    setEStart(toLocalDtInput(job.scheduledDate));
    setEEnd(toLocalDtInput(job.scheduledEnd));
    setENotes(job.description || "");
    setEditingDetails(true);
  }

  async function saveDetails() {
    setBusy("save-details"); setErr(null);
    try {
      await api.patch(`/jobs/${jobId}`, {
        title: eTitle.trim(),
        scheduled_start: eStart ? new Date(eStart).toISOString() : null,
        scheduled_end: eEnd ? new Date(eEnd).toISOString() : null,
        team_notes: eNotes,
      });
      setEditingDetails(false);
      setToast("Details saved");
      await reload();
      onChanged?.();
    } catch (e) { setErr(`Save failed: ${(e as Error).message}`); }
    finally { setBusy(null); }
  }

  async function saveLineItems() {
    setBusy("save-lines"); setErr(null);
    try {
      await api.post(`/jobs/${jobId}/line-items`, {
        items: lineItems.map((it, i) => ({
          description: it.description,
          quantity: Number(it.quantity || 1),
          unit_price: Number(it.unit_price || 0),
          service_offering_id: it.service_offering_id || null,
          duration_minutes: it.duration_minutes ?? null,
          sort_order: i,
        })),
      });
      setOriginalLineItems(lineItems);
      setToast("Line items saved — job total recomputed");
      await reload();
      onChanged?.();
    } catch (e) { setErr(`Line items save failed: ${(e as Error).message}`); }
    finally { setBusy(null); }
  }

  async function advanceTo(newStatus: string) {
    if (newStatus === "cancelled" && !confirm("Cancel this job? This is a terminal status.")) return;
    setBusy(`status:${newStatus}`); setErr(null);
    try {
      await api.patch(`/jobs/${jobId}/status`, { status: newStatus });
      setToast(`Status: ${newStatus.replace(/_/g, " ")}`);
      await reload();
      onChanged?.();
    } catch (e) { setErr(`Status update failed: ${(e as Error).message}`); }
    finally { setBusy(null); }
  }

  if (loading || !job) {
    return (
      <div>
        {topSlot}
        <div style={{ padding: 20, color: "#5A7A8A" }}>Loading job…</div>
      </div>
    );
  }

  const nextStates = VALID_NEXT[job.status] || [];
  const nonTerminal = nextStates.filter((s) => s !== "cancelled");
  const lineItemsDirty = JSON.stringify(lineItems) !== JSON.stringify(originalLineItems);
  const lineItemsSubtotal = lineItems.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.unit_price || 0), 0);
  const isTerminal = job.status === "paid" || job.status === "cancelled";

  return (
    <div>
      {topSlot}

      {/* Job header strip */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        gap: 12, padding: "8px 12px", background: "#F8FAFC", borderRadius: 8, marginBottom: 12,
      }}>
        <div>
          <div style={{ fontSize: 11, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.5 }}>Job</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#0B1C24", marginTop: 2 }}>{job.title || "(untitled job)"}</div>
          <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <StatusBadge status={job.status} />
            {job.scheduledDate && <span style={{ fontSize: 11, color: "#5A7A8A" }}>Scheduled {new Date(job.scheduledDate).toLocaleString()}</span>}
            {Number(job.total) > 0 && <span style={{ fontSize: 11, color: "#5A7A8A" }}>Total: <strong>{fmtMoney(job.total)}</strong></span>}
          </div>
        </div>
        {!editingDetails && !isTerminal && (
          <button onClick={startEditDetails}
            style={{ background: "none", border: "none", color: "#1A7DB5", cursor: "pointer", fontSize: 12, fontWeight: 500 }}>
            Edit details
          </button>
        )}
      </div>

      {err && (
        <div style={{ marginBottom: 12, background: "#FEE2E2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: 6, padding: "8px 12px", fontSize: 12 }}>{err}</div>
      )}
      {toast && (
        <div style={{ marginBottom: 12, background: "#DCFCE7", border: "1px solid #BBF7D0", color: "#166534", borderRadius: 6, padding: "8px 12px", fontSize: 12 }}>{toast}</div>
      )}

      {editingDetails ? (
        <div className="card">
          <div className="card-ttl">Edit details</div>
          <label style={{ display: "block", marginTop: 10 }}>
            <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 }}>Title</span>
            <input value={eTitle} onChange={(e) => setETitle(e.target.value)} style={jdInputStyle} />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
            <label>
              <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 }}>Scheduled start</span>
              <input type="datetime-local" value={eStart} onChange={(e) => setEStart(e.target.value)} style={jdInputStyle} />
            </label>
            <label>
              <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 }}>Scheduled end</span>
              <input type="datetime-local" value={eEnd} onChange={(e) => setEEnd(e.target.value)} style={jdInputStyle} />
            </label>
          </div>
          <label style={{ display: "block", marginTop: 10 }}>
            <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 }}>Team notes (internal)</span>
            <textarea rows={3} value={eNotes} onChange={(e) => setENotes(e.target.value)}
              style={{ ...jdInputStyle, fontFamily: "inherit", resize: "vertical" }} />
          </label>
          <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setEditingDetails(false)}>Cancel</Button>
            <Button variant="primary" onClick={saveDetails} disabled={busy === "save-details"}>
              {busy === "save-details" ? "Saving…" : "Save details"}
            </Button>
          </div>
        </div>
      ) : job.description ? (
        <div className="card">
          <div className="card-ttl">Team notes</div>
          <div style={{ fontSize: 12, color: "#0B1C24", marginTop: 6, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{job.description}</div>
        </div>
      ) : null}

      {/* Line items */}
      <div className="card">
        <div className="card-hdr">
          <div>
            <div className="card-ttl">Line items</div>
            <div className="card-sub">
              {lineItems.length} item{lineItems.length === 1 ? "" : "s"} · subtotal {fmtMoney(lineItemsSubtotal)}
              {lineItems.length > 0 && " · job total recomputed on save"}
            </div>
          </div>
          {lineItemsDirty && !isTerminal && (
            <Button variant="primary" onClick={saveLineItems} disabled={busy === "save-lines"}>
              {busy === "save-lines" ? "Saving…" : "Save line items"}
            </Button>
          )}
        </div>
        <CatalogLineItemPicker items={lineItems} onChange={setLineItems} disabled={isTerminal} />
      </div>

      {/* Workers + Status history */}
      <div className="two-col">
        <div className="card">
          <div className="card-hdr">
            <div>
              <div className="card-ttl">Assigned workers</div>
              <div className="card-sub">{job.assignedWorkers?.length || 0} active · enter hours to track labor cost</div>
            </div>
          </div>
          {(job.assignedWorkers ?? []).length === 0 ? (
            <div style={{ fontSize: 11, color: "#5A7A8A", fontStyle: "italic", padding: "8px 0" }}>
              No active assignments. Use the Dispatch page to offer this job to a worker.
            </div>
          ) : (
            (job.assignedWorkers ?? []).map((w) => (
              <AssignmentRow
                key={w.assignmentId || w.id}
                worker={w}
                onSave={async (hours) => {
                  if (!w.assignmentId) return;
                  await api.patch(`/jobs/${jobId}/assignments/${w.assignmentId}`, { actual_hours: hours });
                  await reload();
                  onChanged?.();
                }}
              />
            ))
          )}
        </div>

        <div className="card">
          <div className="card-hdr">
            <div>
              <div className="card-ttl">Status history</div>
              <div className="card-sub">{job.statusHistory?.length || 0} transitions</div>
            </div>
          </div>
          {(job.statusHistory ?? []).map((h, i) => (
            <div key={i} className="hrow" style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <StatusBadge status={h.status} />
              <div style={{ flex: 1, fontSize: 11, color: "#5A7A8A" }}>{new Date(h.timestamp).toLocaleString()}</div>
              {h.note && <div style={{ fontSize: 11, color: "#0B1C24", fontStyle: "italic" }}>{h.note}</div>}
            </div>
          ))}
          {!(job.statusHistory ?? []).length && (
            <div style={{ fontSize: 11, color: "#5A7A8A", fontStyle: "italic", padding: "8px 0" }}>No history yet.</div>
          )}
        </div>
      </div>

      <JobProfitabilityCard workers={job.assignedWorkers ?? []} invoices={job.invoices ?? []} />

      <div className="two-col">
        <div className="card">
          <div className="card-hdr">
            <div>
              <div className="card-ttl">Quotes</div>
              <div className="card-sub">{job.quotes?.length || 0} on this job</div>
            </div>
          </div>
          {(job.quotes ?? []).length === 0 ? (
            <div style={{ fontSize: 11, color: "#5A7A8A", fontStyle: "italic", padding: "8px 0" }}>No quotes yet.</div>
          ) : (
            (job.quotes ?? []).map((q) => (
              <div key={q.id} className="hrow" style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <StatusBadge status={q.status} />
                <div style={{ flex: 1, fontSize: 11, color: "#5A7A8A", fontFamily: "monospace" }}>{q.id.slice(0, 12)}…</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>{fmtMoney(q.amount)}</div>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <div className="card-hdr">
            <div>
              <div className="card-ttl">Invoices</div>
              <div className="card-sub">{job.invoices?.length || 0} on this job</div>
            </div>
          </div>
          {(job.invoices ?? []).length === 0 ? (
            <div style={{ fontSize: 11, color: "#5A7A8A", fontStyle: "italic", padding: "8px 0" }}>No invoices yet.</div>
          ) : (
            (job.invoices ?? []).map((inv) => (
              <div key={inv.id} className="hrow" style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <StatusBadge status={inv.status} />
                <div style={{ flex: 1, fontSize: 11, color: "#5A7A8A", fontFamily: "monospace" }}>{inv.id.slice(0, 12)}…</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>{fmtMoney(inv.amount)}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Status-transition footer. Quote/invoice creation lives in the parent
          CustomerModal's Quotes/Invoices sections — no navigate-away buttons
          here per founder spec 2026-05-25 ("everything handled in the
          modal"). */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "flex-end",
        padding: "12px 0 4px", borderTop: "1px solid #F1F5F9", marginTop: 14,
      }}>
        {nonTerminal.map((s) => (
          <Button key={s} variant="primary" onClick={() => advanceTo(s)} disabled={busy === `status:${s}`}>
            {busy === `status:${s}` ? "Updating…" : `Advance to ${s.replace(/_/g, " ")}`}
          </Button>
        ))}
        {nextStates.includes("cancelled") && (
          <Button variant="danger" onClick={() => advanceTo("cancelled")} disabled={busy === "status:cancelled"}>
            {busy === "status:cancelled" ? "Cancelling…" : "Cancel job"}
          </Button>
        )}
      </div>
    </div>
  );
}

const jdInputStyle: React.CSSProperties = {
  width: "100%", padding: "7px 10px", fontSize: 12,
  border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6, background: "#fff",
};

function JobProfitabilityCard({
  workers, invoices,
}: {
  workers: Array<{ assignmentId?: string; id: string; name: string; actualHours?: number | null; hourlyRate?: number | null }>;
  invoices: Array<{ id: string; amount: number; amountPaid?: number; status: string }>;
}) {
  const laborCost = workers.reduce((s, w) => s + Number(w.actualHours || 0) * Number(w.hourlyRate || 0), 0);
  const totalHours = workers.reduce((s, w) => s + Number(w.actualHours || 0), 0);
  const revenue = invoices.filter((i) => i.status === "paid")
    .reduce((s, i) => s + Number(i.amountPaid ?? i.amount ?? 0), 0);
  const profit = revenue - laborCost;
  const margin = revenue > 0 ? Math.round((profit / revenue) * 100) : null;
  const hasData = laborCost > 0 || revenue > 0;

  if (!hasData) {
    return (
      <div className="card" style={{ background: "#f8fafc" }}>
        <div className="card-ttl">Profitability</div>
        <div style={{ fontSize: 12, color: "#5A7A8A", marginTop: 4, lineHeight: 1.5 }}>
          Set hourly rates on the Workers page and log hours on each assignment, then send + collect on an invoice to see this job's profit.
        </div>
      </div>
    );
  }
  return (
    <div className="card" style={{ background: profit >= 0 ? "#F0FDF4" : "#FEF2F2", borderLeft: `4px solid ${profit >= 0 ? "#059669" : "#DC2626"}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div className="card-ttl" style={{ margin: 0 }}>Profitability</div>
          <div className="card-sub" style={{ marginTop: 2 }}>
            {revenue > 0 ? `$${revenue.toLocaleString()}` : "$0"} collected · {totalHours.toFixed(1)}h logged · ${laborCost.toLocaleString()} labor
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: profit >= 0 ? "#059669" : "#DC2626", fontFamily: "monospace" }}>
            {profit >= 0 ? "" : "−"}${Math.abs(profit).toLocaleString()}
          </div>
          <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 2 }}>
            {margin != null ? `${margin}% margin` : "profit"}
          </div>
        </div>
      </div>
    </div>
  );
}

function AssignmentRow({
  worker, onSave,
}: {
  worker: { id: string; name: string; assignmentId?: string; actualHours?: number | null; hourlyRate?: number | null };
  onSave: (hours: number | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState<string>(worker.actualHours != null ? String(worker.actualHours) : "");
  const [saving, setSaving] = useState(false);
  const rate = Number(worker.hourlyRate || 0);
  const hours = Number(worker.actualHours || 0);
  const cost = hours * rate;

  async function save() {
    setSaving(true);
    try {
      const num = val.trim() === "" ? null : Number(val);
      await onSave(num != null && Number.isFinite(num) ? num : null);
      setEditing(false);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  }

  return (
    <div className="hrow" style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
      <span className="hdot ok" />
      <div style={{ flex: 1, minWidth: 120 }}>
        <div style={{ fontSize: 12, color: "#0B1C24", fontWeight: 500 }}>{worker.name}</div>
        {rate > 0 && !editing && (
          <div style={{ fontSize: 10, color: "#5A7A8A", marginTop: 1 }}>
            ${rate.toFixed(2)}/hr{hours > 0 ? ` · ${hours.toFixed(1)}h · $${cost.toFixed(2)} cost` : ""}
          </div>
        )}
      </div>
      {editing ? (
        <>
          <input type="number" step="0.25" min="0" placeholder="Hours" value={val}
            onChange={(e) => setVal(e.target.value)} autoFocus
            style={{ width: 70, padding: "4px 6px", fontSize: 12, border: "1px solid rgba(45,156,219,0.28)", borderRadius: 4, textAlign: "right" }} />
          <span style={{ fontSize: 11, color: "#5A7A8A" }}>hr</span>
          <button onClick={save} disabled={saving}
            style={{ fontSize: 11, padding: "3px 8px", border: "none", background: "#0C4A60", color: "#fff", borderRadius: 4, cursor: "pointer" }}>
            {saving ? "…" : "Save"}
          </button>
          <button onClick={() => { setVal(worker.actualHours != null ? String(worker.actualHours) : ""); setEditing(false); }}
            style={{ fontSize: 11, padding: "3px 8px", border: "1px solid #ddd", background: "#fff", borderRadius: 4, cursor: "pointer" }}>Cancel</button>
        </>
      ) : (
        <button onClick={() => setEditing(true)}
          style={{ fontSize: 11, padding: "3px 10px", border: "1px solid rgba(45,156,219,0.28)", background: "#fff", color: "#1A7DB5", borderRadius: 4, cursor: "pointer", fontWeight: 500 }}>
          {worker.actualHours != null ? `${hours.toFixed(1)}h` : "+ Hours"}
        </button>
      )}
    </div>
  );
}
