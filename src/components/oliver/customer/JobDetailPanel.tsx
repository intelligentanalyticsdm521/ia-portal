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
import { ScheduleJobModal } from "../ScheduleJobModal";
import { Button, StatusBadge } from "../ui";
import { jobColor } from "../../../oliver/jobStatusColors";
import { CatalogLineItemPicker, computeLineTotal, type LineItem } from "../CatalogLineItemPicker";

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
  // F-57 (Defect #92)
  discountType?: "percent" | "fixed" | null;
  discountValue?: number | null;
}

// Every status the job state machine knows about. The pill dropdown
// renders these and lets admins jump directly to any — backward moves
// included (reopen a paid job for a follow-up service call, etc.) — per
// founder spec 2026-05-25. The backend's force=true flag (sent from
// iadm_portal surface) skips the state-machine validation.
const ALL_STATUSES: Array<{ key: string; label: string }> = [
  { key: "inquiry",     label: "Inquiry" },
  { key: "quoted",      label: "Quoted" },
  { key: "scheduled",   label: "Scheduled" },
  { key: "dispatched",  label: "Dispatched" },
  { key: "assigned",    label: "Assigned" },
  { key: "in_progress", label: "In progress" },
  { key: "completed",   label: "Completed" },
  { key: "invoiced",    label: "Invoiced" },
  { key: "paid",        label: "Paid" },
  { key: "cancelled",   label: "Cancelled" },
];

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
        discount_type: it.discountType ?? null,
        discount_value: it.discountValue != null ? Number(it.discountValue) : null,
      }));
      setLineItems(itemRows);
      setOriginalLineItems(itemRows);
    } catch (e) {
      setErr((e as Error).message);
    } finally { setLoading(false); }
  }, [api, jobId]);

  useEffect(() => { reload(); }, [reload]);

  // The week-view scheduler, opened from Quick actions.
  const [schedulingOpen, setSchedulingOpen] = useState(false);

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
          discount_type: it.discount_type ?? null,
          discount_value: it.discount_value ?? null,
        })),
      });
      setOriginalLineItems(lineItems);
      setToast("Line items saved — job total recomputed");
      await reload();
      onChanged?.();
    } catch (e) { setErr(`Line items save failed: ${(e as Error).message}`); }
    finally { setBusy(null); }
  }

  async function changeStatus(newStatus: string) {
    if (!job || newStatus === job.status) return;
    setBusy(`status:${newStatus}`); setErr(null);
    try {
      // force=true tells the backend to skip state-machine validation —
      // admins on iadm_portal can jump to any status, including backward.
      await api.patch(`/jobs/${jobId}/status`, { status: newStatus, force: true });
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

  const lineItemsDirty = JSON.stringify(lineItems) !== JSON.stringify(originalLineItems);
  const lineItemsSubtotal = lineItems.reduce((s, it) => s + computeLineTotal(it), 0);
  // Even terminal-state jobs are editable now (per founder spec — re-open
  // closed jobs by setting status back). The only thing isTerminal still
  // disables is line-item editing, since changing line items on a paid job
  // would desync the invoice. If they really need to, they reopen first.
  const isTerminal = job.status === "paid" || job.status === "cancelled";

  return (
    <>
    {schedulingOpen && (
      <ScheduleJobModal
        jobId={jobId}
        jobTitle={job?.title}
        // How long the QUOTED work says this takes. The job's line items came
        // from the accepted quote, and each carries durationMinutes off the
        // service it was sold from — so the scheduler opens pre-filled with the
        // real length instead of a blind 30-minute guess. Null when nothing on
        // the job carries a duration, and the modal falls back to an hour.
        suggestedDuration={
          lineItems.reduce((sum, it) => sum + (Number(it.duration_minutes) || 0), 0) || null
        }
        onClose={() => setSchedulingOpen(false)}
        onScheduled={async (startIso) => {
          setSchedulingOpen(false);
          setToast(`Scheduled for ${new Date(startIso).toLocaleString()}`);
          await reload();
          onChanged?.();
        }}
      />
    )}
    <JobLayout
      job={job}
      jobId={jobId}
      api={api}
      topSlot={topSlot}
      err={err} toast={toast}
      busy={busy}
      editingDetails={editingDetails}
      eTitle={eTitle} eStart={eStart} eEnd={eEnd} eNotes={eNotes}
      setETitle={setETitle} setEStart={setEStart} setEEnd={setEEnd} setENotes={setENotes}
      startEditDetails={startEditDetails} saveDetails={saveDetails} cancelEditDetails={() => setEditingDetails(false)}
      setSchedulingOpen={setSchedulingOpen} scheduledDate={job?.scheduledDate}
      lineItems={lineItems} setLineItems={setLineItems}
      lineItemsDirty={lineItemsDirty} lineItemsSubtotal={lineItemsSubtotal}
      saveLineItems={saveLineItems}
      isTerminal={isTerminal}
      changeStatus={changeStatus}
      onAssignmentHours={async (assignmentId, hours) => {
        await api.patch(`/jobs/${jobId}/assignments/${assignmentId}`, { actual_hours: hours });
        await reload();
        onChanged?.();
      }}
      onAssignWorker={async (workerId) => {
        await api.post(`/dispatch/assign`, { job_id: jobId, worker_id: workerId });
        await reload();
        onChanged?.();
      }}
    />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// JobLayout — Jobber/Housecall pattern (founder spec 2026-05-25):
//   - Top: status pill (dropdown) + title + scheduled + total
//   - Right column: sticky summary card (customer + financial + quick acts)
//   - Left main: tabs (Details / Line Items / Workers + Time / Activity)
//
// All editing logic still lives in the parent JobDetailPanel — this is the
// presentational shell that wires it up.
// ─────────────────────────────────────────────────────────────────────────────
type JobLayoutProps = {
  job: JobDetail;
  jobId: string;
  api: {
    get: <T>(p: string) => Promise<T>;
    post: <T>(p: string, b?: unknown) => Promise<T>;
    patch: <T>(p: string, b: unknown) => Promise<T>;
  };
  topSlot?: React.ReactNode;
  err: string | null;
  toast: string | null;
  busy: string | null;
  editingDetails: boolean;
  eTitle: string; eStart: string; eEnd: string; eNotes: string;
  setETitle: (v: string) => void;
  setEStart: (v: string) => void;
  setEEnd: (v: string) => void;
  setENotes: (v: string) => void;
  startEditDetails: () => void;
  setSchedulingOpen: (v: boolean) => void;
  scheduledDate?: string;
  saveDetails: () => Promise<void>;
  cancelEditDetails: () => void;
  lineItems: LineItem[];
  setLineItems: (items: LineItem[]) => void;
  lineItemsDirty: boolean;
  lineItemsSubtotal: number;
  saveLineItems: () => Promise<void>;
  isTerminal: boolean;
  changeStatus: (s: string) => Promise<void>;
  onAssignmentHours: (assignmentId: string, hours: number | null) => Promise<void>;
  onAssignWorker: (workerId: string) => Promise<void>;
};

type JobTab = "details" | "lines" | "workers" | "activity" | "proof";

function JobLayout(p: JobLayoutProps) {
  const [tab, setTab] = useState<JobTab>("details");
  const { job, jobId } = p;

  return (
    <div>
      {p.topSlot}

      {/* Top header — full width strip */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        gap: 12, padding: "10px 14px", background: "#F8FAFC", borderRadius: 8, marginBottom: 12,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.5 }}>Job</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#0B1C24", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {job.title || "(untitled job)"}
          </div>
          <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <StatusDropdown
              currentStatus={job.status}
              hasWorker={(job.assignedWorkers?.length ?? 0) > 0}
              busy={!!(p.busy && p.busy.startsWith("status:"))}
              onChange={p.changeStatus}
            />
            {job.scheduledDate && <span style={{ fontSize: 11, color: "#5A7A8A" }}>Scheduled {new Date(job.scheduledDate).toLocaleString()}</span>}
            {Number(job.total) > 0 && <span style={{ fontSize: 11, color: "#5A7A8A" }}>Total: <strong>{fmtMoney(job.total)}</strong></span>}
          </div>
        </div>
      </div>

      {p.err && (
        <div style={{ marginBottom: 12, background: "#FEE2E2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: 6, padding: "8px 12px", fontSize: 12 }}>{p.err}</div>
      )}
      {p.toast && (
        <div style={{ marginBottom: 12, background: "#DCFCE7", border: "1px solid #BBF7D0", color: "#166534", borderRadius: 6, padding: "8px 12px", fontSize: 12 }}>{p.toast}</div>
      )}

      {/* Two-column body: tabs on left, sticky summary on right.
          PHONE PASS 2026-09-06: the fixed 280px right column left the main
          column 8.5px wide inside a 353px modal at 375px — the job's own
          content was a 9px ribbon with the summary card sitting on top of it.
          `auto-fit` + a 260px floor keeps the exact two-column layout at every
          width that can hold it and stacks them below that. The class carries
          the rule so a media query is not fighting an inline style. */}
      <div className="oliver-job-detail-grid" style={{ display: "grid", gap: 16, alignItems: "start" }}>
        {/* Main column — tabs */}
        <div>
          {/* PHONE PASS 2026-09-06: five tabs need 332px and the stacked column
              is 305px, so "Proof of Work" hung off the edge with `overflow:
              visible` — visible in the sense of painted, not of reachable.
              Scroll the strip; `flex-shrink: 0` on the tabs keeps them from
              being squeezed into unreadable slivers instead. */}
          <div role="tablist" style={{
            display: "flex", gap: 2, marginBottom: 10,
            overflowX: "auto",
            borderBottom: "1px solid #E5E7EB",
          }}>
            <TabBtn label="Details" active={tab === "details"} onClick={() => setTab("details")} />
            <TabBtn label={`Line items${p.lineItems.length ? ` (${p.lineItems.length})` : ""}${p.lineItemsDirty ? " *" : ""}`} active={tab === "lines"} onClick={() => setTab("lines")} />
            <TabBtn label={`Workers & Time${job.assignedWorkers?.length ? ` (${job.assignedWorkers.length})` : ""}`} active={tab === "workers"} onClick={() => setTab("workers")} />
            <TabBtn label={`Activity${job.statusHistory?.length ? ` (${job.statusHistory.length})` : ""}`} active={tab === "activity"} onClick={() => setTab("activity")} />
            <TabBtn label="Proof of Work" active={tab === "proof"} onClick={() => setTab("proof")} />
          </div>

          {tab === "details" && (
            <DetailsTab
              job={job}
              editingDetails={p.editingDetails}
              eTitle={p.eTitle} eStart={p.eStart} eEnd={p.eEnd} eNotes={p.eNotes}
              setETitle={p.setETitle} setEStart={p.setEStart} setEEnd={p.setEEnd} setENotes={p.setENotes}
              startEditDetails={p.startEditDetails} saveDetails={p.saveDetails} cancelEditDetails={p.cancelEditDetails}
              saving={p.busy === "save-details"}
            />
          )}

          {tab === "proof" && (
            <ProofReviewTab jobId={jobId} api={p.api} />
          )}

          {tab === "lines" && (
            <div className="card">
              <div className="card-hdr">
                <div>
                  <div className="card-ttl">Line items</div>
                  <div className="card-sub">
                    {p.lineItems.length} item{p.lineItems.length === 1 ? "" : "s"} · subtotal {fmtMoney(p.lineItemsSubtotal)}
                    {p.lineItems.length > 0 && " · job total recomputed on save"}
                  </div>
                </div>
                {p.lineItemsDirty && !p.isTerminal && (
                  <Button variant="primary" onClick={p.saveLineItems} disabled={p.busy === "save-lines"}>
                    {p.busy === "save-lines" ? "Saving…" : "Save line items"}
                  </Button>
                )}
              </div>
              <CatalogLineItemPicker items={p.lineItems} onChange={p.setLineItems} disabled={p.isTerminal} />
            </div>
          )}

          {tab === "workers" && (
            <div className="card">
              <div className="card-hdr">
                <div>
                  <div className="card-ttl">Assigned workers</div>
                  <div className="card-sub">{job.assignedWorkers?.length || 0} active · enter hours to track labor cost</div>
                </div>
              </div>
              {(job.assignedWorkers ?? []).length === 0 ? (
                <div style={{ fontSize: 11, color: "#5A7A8A", fontStyle: "italic", padding: "8px 0" }}>
                  No workers assigned yet. Click "+ Add worker" below to dispatch one to this job.
                </div>
              ) : (
                (job.assignedWorkers ?? []).map((w) => (
                  <AssignmentRow
                    key={w.assignmentId || w.id}
                    worker={w}
                    onSave={async (hours) => {
                      if (!w.assignmentId) return;
                      await p.onAssignmentHours(w.assignmentId, hours);
                    }}
                  />
                ))
              )}
              <AddWorkerControl
                api={p.api}
                onAssign={p.onAssignWorker}
                alreadyAssigned={(job.assignedWorkers ?? []).map((w) => w.id)}
              />
              <JobProfitabilityCard workers={job.assignedWorkers ?? []} invoices={job.invoices ?? []} />
            </div>
          )}

          {tab === "activity" && (
            <div className="card">
              <div className="card-hdr">
                <div>
                  <div className="card-ttl">Status history</div>
                  <div className="card-sub">{job.statusHistory?.length || 0} transitions</div>
                </div>
              </div>
              {(job.statusHistory ?? []).length === 0 ? (
                <div style={{ fontSize: 11, color: "#5A7A8A", fontStyle: "italic", padding: "8px 0" }}>No history yet.</div>
              ) : (
                (job.statusHistory ?? []).map((h, i) => (
                  <div key={i} className="hrow" style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <StatusBadge status={h.status} />
                    <div style={{ flex: 1, fontSize: 11, color: "#5A7A8A" }}>{new Date(h.timestamp).toLocaleString()}</div>
                    {h.note && <div style={{ fontSize: 11, color: "#0B1C24", fontStyle: "italic" }}>{h.note}</div>}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Right column — sticky summary */}
        <aside style={{ position: "sticky", top: 0 }}>
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="card-ttl">Customer</div>
            <div style={{ fontSize: 13, color: "#0B1C24", marginTop: 4, fontWeight: 600 }}>{job.customerName || "—"}</div>
            {job.customerEmail && <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 2 }}>{job.customerEmail}</div>}
          </div>

          {!p.editingDetails && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="card-ttl">Quick actions</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                {/* 2026-09-02 — "Edit details" was the ONLY route to scheduling
                    from here, and it is a datetime field: you typed a date blind,
                    with no idea what else that day held. This opens the week and
                    shows what is actually free. */}
                <Button variant="primary" onClick={() => p.setSchedulingOpen(true)}>
                  {p.scheduledDate ? "Reschedule" : "Schedule job"}
                </Button>
                <Button variant="secondary" onClick={p.startEditDetails}>Edit details</Button>
                <div style={{ fontSize: 10, color: "#94A3B8", textAlign: "center", marginTop: 4 }}>
                  Status moves via the pill above ↑
                </div>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-ttl">Financials</div>
            <SummaryRow label="Line items" value={fmtMoney(p.lineItemsSubtotal)} />
            <SummaryRow label="Job total" value={fmtMoney(job.total)} bold />
            <SummaryRow label="Quotes" value={String(job.quotes?.length ?? 0)} />
            <SummaryRow label="Invoices" value={String(job.invoices?.length ?? 0)} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        padding: "8px 14px",
        background: "transparent",
        border: "none",
        borderBottom: active ? "2px solid #1A7DB5" : "2px solid transparent",
        marginBottom: -1,
        fontSize: 12,
        fontWeight: active ? 700 : 500,
        color: active ? "#0B1C24" : "#5A7A8A",
        cursor: "pointer",
        // Phone pass 2026-09-06: the strip scrolls, so a tab must keep its own
        // width rather than being squeezed by flexbox into "Workers &" / "Time".
        flexShrink: 0,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

function SummaryRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "baseline",
      padding: "4px 0", borderTop: "1px solid #F1F5F9", fontSize: 12,
    }}>
      <span style={{ color: "#5A7A8A" }}>{label}</span>
      <span style={{ color: "#0B1C24", fontWeight: bold ? 700 : 500, fontFamily: "monospace" }}>{value}</span>
    </div>
  );
}

function DetailsTab({
  job, editingDetails,
  eTitle, eStart, eEnd, eNotes,
  setETitle, setEStart, setEEnd, setENotes,
  startEditDetails, saveDetails, cancelEditDetails, saving,
}: {
  job: JobDetail;
  editingDetails: boolean;
  eTitle: string; eStart: string; eEnd: string; eNotes: string;
  setETitle: (v: string) => void;
  setEStart: (v: string) => void;
  setEEnd: (v: string) => void;
  setENotes: (v: string) => void;
  startEditDetails: () => void;
  saveDetails: () => Promise<void>;
  cancelEditDetails: () => void;
  saving: boolean;
}) {
  if (editingDetails) {
    return (
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
          <Button variant="ghost" onClick={cancelEditDetails}>Cancel</Button>
          <Button variant="primary" onClick={saveDetails} disabled={saving}>
            {saving ? "Saving…" : "Save details"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div className="card-ttl">Details</div>
          <div className="card-sub">Title, schedule, and internal notes</div>
        </div>
        <button onClick={startEditDetails}
          style={{ background: "none", border: "none", color: "#1A7DB5", cursor: "pointer", fontSize: 12, fontWeight: 500 }}>
          Edit
        </button>
      </div>
      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <InfoCell label="Title" value={job.title || "—"} />
        <InfoCell label="Status" value={job.status} />
        <InfoCell label="Scheduled start" value={job.scheduledDate ? new Date(job.scheduledDate).toLocaleString() : "—"} />
        <InfoCell label="Scheduled end" value={job.scheduledEnd ? new Date(job.scheduledEnd).toLocaleString() : "—"} />
      </div>
      {job.description && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.4 }}>Team notes</div>
          <div style={{ fontSize: 12, color: "#0B1C24", marginTop: 4, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{job.description}</div>
        </div>
      )}
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 12, color: "#0B1C24", marginTop: 2 }}>{value}</div>
    </div>
  );
}
// Backward moves are allowed (re-open a paid job, etc.) — the backend's
// force=true flag (sent from the iadm_portal surface) skips the state-
// machine validation.
// ─────────────────────────────────────────────────────────────────────────────
// The one job colour map (src/oliver/jobStatusColors) — so the status pill
// here matches the card that was clicked on a calendar or the Job Board.
// This panel does not know about a pending reschedule request, so it colours
// by status + whether a worker is on the job.
function statusStyle(status: string, hasWorker?: boolean): { bg: string; fg: string } {
  const c = jobColor({ kind: "job", status, hasWorker: hasWorker ?? null });
  return { bg: c.soft, fg: c.softText };
}

function StatusDropdown({
  currentStatus, hasWorker, busy, onChange,
}: {
  currentStatus: string;
  hasWorker?: boolean;
  busy: boolean;
  onChange: (s: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const c = statusStyle(currentStatus, hasWorker);
  const label = ALL_STATUSES.find((s) => s.key === currentStatus)?.label || currentStatus;

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        style={{
          background: c.bg, color: c.fg,
          border: `1px solid ${c.fg}33`, borderRadius: 99,
          padding: "4px 12px", fontSize: 12, fontWeight: 700,
          cursor: busy ? "wait" : "pointer", display: "inline-flex", alignItems: "center", gap: 6,
        }}
      >
        {busy ? "Updating…" : label}
        <span style={{ fontSize: 9 }} aria-hidden="true">▾</span>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 90 }} />
          <div style={{
            position: "absolute", top: "100%", left: 0, marginTop: 4,
            background: "#fff", border: "1px solid #E5E7EB",
            borderRadius: 6, boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            zIndex: 100, minWidth: 180, padding: 4,
          }}>
            {ALL_STATUSES.map((s) => {
              const sc = statusStyle(s.key, hasWorker);
              const isCurrent = s.key === currentStatus;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => { setOpen(false); onChange(s.key); }}
                  disabled={isCurrent}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    width: "100%", padding: "6px 8px",
                    background: isCurrent ? "#F8FAFC" : "transparent",
                    border: "none", borderRadius: 4,
                    fontSize: 12, color: "#0B1C24", textAlign: "left",
                    cursor: isCurrent ? "default" : "pointer",
                  }}
                  onMouseEnter={(e) => { if (!isCurrent) (e.currentTarget as HTMLButtonElement).style.background = "#F8FAFC"; }}
                  onMouseLeave={(e) => { if (!isCurrent) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                >
                  <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 99, background: sc.fg }} />
                  <span style={{ flex: 1 }}>{s.label}</span>
                  {isCurrent && <span style={{ fontSize: 10, color: "#5A7A8A" }}>current</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
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

// ─────────────────────────────────────────────────────────────────────────────
// AddWorkerControl — "+ Add worker" button below the assignment list.
// Founder spec 2026-05-26 — every job should be able to assign a worker
// directly from the modal without bouncing to a separate Dispatch page.
// Hits POST /dispatch/assign for direct assignment (no offer/accept flow).
// ─────────────────────────────────────────────────────────────────────────────
function AddWorkerControl({
  api, onAssign, alreadyAssigned,
}: {
  api: { get: <T>(p: string) => Promise<T> };
  onAssign: (workerId: string) => Promise<void>;
  alreadyAssigned: string[];
}) {
  const [open, setOpen] = useState(false);
  const [workers, setWorkers] = useState<Array<{ id: string; name: string; type?: string; status?: string; activeJobs?: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const assignedSet = new Set(alreadyAssigned);

  async function openPicker() {
    setOpen(true); setLoading(true); setErr(null);
    try {
      const r = await api.get<{ data: typeof workers } | typeof workers>("/workers");
      const list = Array.isArray(r) ? r : ((r as any).data ?? []);
      setWorkers(list.filter((w: { status?: string }) => w.status !== "inactive" && w.status !== "archived"));
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }

  async function assign(workerId: string) {
    setBusy(workerId); setErr(null);
    try {
      await onAssign(workerId);
      setOpen(false);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  }

  if (!open) {
    return (
      <div style={{ marginTop: 10 }}>
        <button
          type="button" onClick={openPicker}
          style={{
            fontSize: 12, padding: "6px 12px",
            background: "#0C4A60", color: "#fff",
            border: "none", borderRadius: 4, cursor: "pointer",
          }}
        >
          + Add worker
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 10, padding: 10, border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <strong style={{ fontSize: 12, color: "#0B1C24" }}>Assign a worker</strong>
        <button onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: "#5A7A8A", cursor: "pointer", fontSize: 13 }}>
          Cancel
        </button>
      </div>
      {err && (
        <div style={{ background: "#FEE2E2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: 6, padding: "6px 10px", fontSize: 11, marginBottom: 8 }}>
          {err}
        </div>
      )}
      {loading ? (
        <div style={{ fontSize: 11, color: "#5A7A8A", padding: 8 }}>Loading workers…</div>
      ) : workers.length === 0 ? (
        <div style={{ fontSize: 11, color: "#5A7A8A", padding: 8 }}>
          No active workers. Add workers on OLIVER → Team → Workers first.
        </div>
      ) : (
        <div style={{ maxHeight: 280, overflowY: "auto" }}>
          {workers.map((w) => {
            const isAssigned = assignedSet.has(w.id);
            return (
              <div key={w.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "6px 4px", borderBottom: "1px solid #F1F5F9",
              }}>
                <div>
                  <div style={{ fontSize: 12, color: "#0B1C24", fontWeight: 500 }}>{w.name}</div>
                  <div style={{ fontSize: 10, color: "#5A7A8A" }}>
                    {w.type || "worker"}{w.activeJobs != null ? ` · ${w.activeJobs} active job${w.activeJobs === 1 ? "" : "s"}` : ""}
                  </div>
                </div>
                {isAssigned ? (
                  <span style={{ fontSize: 10, color: "#94A3B8", fontStyle: "italic" }}>already assigned</span>
                ) : (
                  <button
                    type="button" onClick={() => assign(w.id)} disabled={busy === w.id}
                    style={{
                      fontSize: 11, padding: "4px 10px",
                      background: "#fff", color: "#0C4A60",
                      border: "1px solid rgba(45,156,219,0.3)",
                      borderRadius: 4, cursor: busy ? "wait" : "pointer",
                    }}
                  >
                    {busy === w.id ? "Assigning…" : "Assign"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
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

// ─────────────────────────────────────────────────────────────────────────────
// OL-7 — Proof-of-work review (2026-07-03). Crew submit proofs from the
// employee portal (photos / notes / signatures); this is the manager side:
// list submitted proofs for a job and approve / reject / reopen each one.
// Backend: GET /jobs/:id/proofs · PATCH /jobs/:jobId/proofs/:proofId/review
// (both return an { data } envelope — the admin api client does NOT auto-unwrap).
// ─────────────────────────────────────────────────────────────────────────────
interface Proof {
  proof_id: string;
  job_id: string;
  worker_id: string | null;
  type: string | null;
  content: string | null;
  blob_url: string | null;
  captured_at: string | null;
  created_at: string | null;
  review_status: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_note: string | null;
}

const REVIEW_PILL: Record<string, { bg: string; fg: string; label: string }> = {
  pending: { bg: "#FEF3C7", fg: "#92400E", label: "Pending review" },
  approved: { bg: "#DCFCE7", fg: "#166534", label: "Approved" },
  rejected: { bg: "#FEE2E2", fg: "#991B1B", label: "Rejected" },
};

function ProofReviewTab({
  jobId, api,
}: {
  jobId: string;
  api: {
    get: <T>(p: string) => Promise<T>;
    post: <T>(p: string, b?: unknown) => Promise<T>;
    patch: <T>(p: string, b: unknown) => Promise<T>;
  };
}) {
  const [proofs, setProofs] = useState<Proof[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // proofId -> reject note being composed
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setErr(null);
    try {
      const resp = await api.get<{ data: Proof[] } | Proof[]>(`/jobs/${jobId}/proofs`);
      const list = Array.isArray(resp) ? resp : resp?.data ?? [];
      setProofs(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load proofs");
      setProofs([]);
    }
  }, [api, jobId]);

  useEffect(() => { void load(); }, [load]);

  async function review(proofId: string, status: "approved" | "rejected" | "pending") {
    setBusyId(proofId);
    setErr(null);
    try {
      const note = status === "rejected" ? (notes[proofId] || "").trim() || null : null;
      const resp = await api.patch<{ data: Partial<Proof> } | Partial<Proof>>(
        `/jobs/${jobId}/proofs/${proofId}/review`,
        { status, note },
      );
      const updated = (resp && "data" in (resp as object) ? (resp as { data: Partial<Proof> }).data : resp) as Partial<Proof>;
      setProofs((prev) =>
        (prev || []).map((p) =>
          p.proof_id === proofId
            ? { ...p, review_status: status, review_note: updated?.review_note ?? note, reviewed_at: updated?.reviewed_at ?? null }
            : p,
        ),
      );
      if (status !== "rejected") setNotes((n) => { const c = { ...n }; delete c[proofId]; return c; });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to update proof");
    } finally {
      setBusyId(null);
    }
  }

  if (proofs === null) {
    return <div style={{ padding: 16, fontSize: 12, color: "#5A7A8A" }}>Loading proofs…</div>;
  }

  return (
    <div className="card">
      <div className="card-hdr">
        <div>
          <div className="card-ttl">Proof of work</div>
          <div className="card-sub">
            {proofs.length} submission{proofs.length === 1 ? "" : "s"} from the crew · review to approve or reject
          </div>
        </div>
      </div>

      {err && (
        <div style={{ margin: "0 0 12px", background: "#FEE2E2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: 6, padding: "8px 12px", fontSize: 12 }}>{err}</div>
      )}

      {proofs.length === 0 ? (
        <div style={{ padding: "20px 4px", fontSize: 12, color: "#94A3B8", textAlign: "center" }}>
          No proof of work submitted yet. Crew uploads (photos, notes, signatures) will appear here for review.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {proofs.map((p) => {
            const pill = REVIEW_PILL[p.review_status] || REVIEW_PILL.pending;
            const when = p.captured_at || p.created_at;
            const busy = busyId === p.proof_id;
            return (
              <div key={p.proof_id} style={{ border: "1px solid #E5E7EB", borderRadius: 8, padding: 12, background: "#fff" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: "#5A7A8A", background: "#F1F5F9", padding: "2px 7px", borderRadius: 4, fontWeight: 600 }}>
                      {p.type || "note"}
                    </span>
                    {when && <span style={{ fontSize: 11, color: "#94A3B8" }}>{new Date(when).toLocaleString()}</span>}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, color: pill.fg, background: pill.bg, padding: "2px 8px", borderRadius: 999 }}>{pill.label}</span>
                </div>

                {p.blob_url && (
                  <a href={p.blob_url} target="_blank" rel="noopener noreferrer" style={{ display: "block", marginBottom: 8 }}>
                    <img src={p.blob_url} alt={p.type || "proof"} style={{ maxWidth: "100%", maxHeight: 260, borderRadius: 6, border: "1px solid #E5E7EB", objectFit: "contain" }} />
                  </a>
                )}
                {p.content && (
                  <div style={{ fontSize: 13, color: "#0B1C24", whiteSpace: "pre-wrap", marginBottom: 8 }}>{p.content}</div>
                )}
                {p.review_status === "rejected" && p.review_note && (
                  <div style={{ fontSize: 12, color: "#991B1B", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 6, padding: "6px 10px", marginBottom: 8 }}>
                    <strong>Rejection note:</strong> {p.review_note}
                  </div>
                )}

                {p.review_status === "pending" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <input
                      type="text" placeholder="Optional note (shown to crew if rejected)"
                      value={notes[p.proof_id] || ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [p.proof_id]: e.target.value }))}
                      style={{ width: "100%", padding: "6px 8px", fontSize: 12, border: "1px solid #E5E7EB", borderRadius: 4, boxSizing: "border-box" }}
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button" disabled={busy} onClick={() => review(p.proof_id, "approved")}
                        style={{ fontSize: 12, padding: "6px 14px", border: "none", background: "#16A34A", color: "#fff", borderRadius: 6, cursor: busy ? "wait" : "pointer", fontWeight: 600 }}
                      >
                        {busy ? "…" : "Approve"}
                      </button>
                      <button
                        type="button" disabled={busy} onClick={() => review(p.proof_id, "rejected")}
                        style={{ fontSize: 12, padding: "6px 14px", border: "1px solid #FECACA", background: "#fff", color: "#B91C1C", borderRadius: 6, cursor: busy ? "wait" : "pointer", fontWeight: 600 }}
                      >
                        {busy ? "…" : "Reject"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button" disabled={busy} onClick={() => review(p.proof_id, "pending")}
                    style={{ fontSize: 11, padding: "4px 10px", border: "1px solid #E5E7EB", background: "#F8FAFC", color: "#5A7A8A", borderRadius: 4, cursor: busy ? "wait" : "pointer" }}
                  >
                    {busy ? "…" : "Reopen review"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
