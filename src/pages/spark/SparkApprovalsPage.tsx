// SparkApprovalsPage — Business-tier approval queue
//
// Lists pending/approved/declined approvals across all resource types
// (campaigns, newsletters, social posts, invoices over threshold, automations).
// Admin users can approve or decline a pending request with a reason.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Check, X, Clock, AlertCircle, ChevronRight } from "lucide-react";

type Status = "pending" | "approved" | "declined" | "cancelled";

interface ApprovalRow {
  id: number;
  tenant_id: string;
  resource_type: string;
  resource_id: string;
  title: string;
  summary: string | null;
  requested_by: string | null;
  requested_at: string;
  status: Status;
  decided_by: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  metadata_json: string | null;
}

const STATUS_STYLES: Record<Status, string> = {
  pending:   "bg-amber-50 text-amber-700 border-amber-200",
  approved:  "bg-emerald-50 text-emerald-700 border-emerald-200",
  declined:  "bg-rose-50 text-rose-700 border-rose-200",
  cancelled: "bg-slate-100 text-slate-600 border-slate-200",
};

function StatusBadge({ status }: { status: Status }) {
  const Icon = status === "pending" ? Clock : status === "approved" ? Check : status === "declined" ? X : AlertCircle;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${STATUS_STYLES[status]}`}>
      <Icon className="h-3 w-3" /> {status}
    </span>
  );
}

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString();
}

export function SparkApprovalsPage() {
  const { get, post, ready } = useSparkApi();
  const [rows, setRows] = useState<ApprovalRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState<Status | "all">("pending");
  const [selected, setSelected] = useState<ApprovalRow | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const fetchList = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const q = filter === "all" ? "" : `?status=${filter}`;
      const r = await get<{ items: ApprovalRow[]; total: number }>(`/api/v1/approvals${q}`);
      setRows(r.items || []);
      setTotal(r.total || 0);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [get, ready, filter]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const counts = useMemo(() => {
    const c: Record<Status, number> = { pending: 0, approved: 0, declined: 0, cancelled: 0 };
    for (const r of rows) c[r.status]++;
    return c;
  }, [rows]);

  async function decide(action: "approve" | "decline" | "cancel") {
    if (!selected) return;
    setBusy(true);
    try {
      await post(`/api/v1/approvals/${selected.id}/${action}`, { reason });
      setSelected(null);
      setReason("");
      await fetchList();
    } catch (err) {
      alert(`Failed to ${action}: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const stats = (
    <div className="grid grid-cols-4 gap-2">
      {(["pending", "approved", "declined", "cancelled"] as const).map((s) => (
        <button key={s} onClick={() => setFilter(s)}
          className={`text-left p-2 rounded border ${filter === s ? "border-[#EF6C33] bg-[#FFF6F0]" : "border-slate-200 bg-white"}`}>
          <div className="text-[10px] uppercase font-semibold text-slate-500">{s}</div>
          <div className="text-lg font-bold text-slate-900">{counts[s] || 0}</div>
        </button>
      ))}
    </div>
  );

  const filters = (
    <div className="flex items-center gap-2">
      {(["all", "pending", "approved", "declined", "cancelled"] as const).map((s) => (
        <button key={s} onClick={() => setFilter(s)}
          className={`text-xs px-3 py-1 rounded-full border transition ${filter === s ? "bg-[#0B1C24] text-white border-[#0B1C24]" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
          {s} {s !== "all" ? `(${counts[s] || 0})` : ""}
        </button>
      ))}
    </div>
  );

  return (
    <SparkPageShell
      title="Approvals"
      subtitle={`${total} request${total === 1 ? "" : "s"}`}
      help="Approval workflow for Business-tier actions like large campaign sends, social posts, and high-value invoices. Pending requests block their underlying action until decided."
      stats={stats}
      filters={filters}
      loading={loading}
      error={error}
    >
      <div className="overflow-x-auto">
        <table className="spark-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Title</th>
              <th>Resource</th>
              <th>Requested by</th>
              <th>Requested at</th>
              <th>Decided</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} className="text-center text-sm text-slate-500 py-8">No approvals matching this filter.</td></tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelected(row)}>
                <td><StatusBadge status={row.status} /></td>
                <td className="font-medium text-slate-900">{row.title}</td>
                <td className="text-xs text-slate-600"><code className="bg-slate-100 px-1 py-0.5 rounded">{row.resource_type}</code> #{row.resource_id}</td>
                <td className="text-xs text-slate-600">{row.requested_by || "—"}</td>
                <td className="text-xs text-slate-500">{fmtTime(row.requested_at)}</td>
                <td className="text-xs text-slate-500">{row.decided_at ? `${row.decided_by} · ${fmtTime(row.decided_at)}` : "—"}</td>
                <td><ChevronRight className="h-4 w-4 text-slate-400" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="fixed inset-0 bg-slate-900/30 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-200 flex items-baseline justify-between">
              <div>
                <div className="text-xs uppercase font-bold text-slate-500">Approval request</div>
                <div className="text-base font-semibold text-slate-900 mt-0.5">{selected.title}</div>
              </div>
              <StatusBadge status={selected.status} />
            </div>
            <div className="px-5 py-4 space-y-3 text-sm">
              <Field label="Resource">
                <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">{selected.resource_type}</code>
                <span className="text-slate-500 ml-2">#{selected.resource_id}</span>
              </Field>
              {selected.summary && <Field label="Summary"><div className="text-slate-700 whitespace-pre-wrap">{selected.summary}</div></Field>}
              <Field label="Requested by">{selected.requested_by || "—"} <span className="text-slate-400 ml-1">· {fmtTime(selected.requested_at)}</span></Field>
              {selected.decided_at && (
                <Field label="Decided">
                  <div className="text-slate-700">{selected.decided_by} · {fmtTime(selected.decided_at)}</div>
                  {selected.decision_reason && <div className="text-xs text-slate-500 mt-0.5 whitespace-pre-wrap">"{selected.decision_reason}"</div>}
                </Field>
              )}
            </div>
            {selected.status === "pending" && (
              <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 space-y-3">
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason (optional)"
                  rows={2}
                  className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]"
                />
                <div className="flex items-center justify-end gap-2">
                  <button disabled={busy} onClick={() => decide("cancel")}
                    className="text-xs text-slate-500 hover:text-slate-700 underline disabled:opacity-50">Cancel request</button>
                  <button disabled={busy} onClick={() => decide("decline")}
                    className="text-sm px-3 py-1.5 rounded border border-rose-200 text-rose-700 bg-white hover:bg-rose-50 disabled:opacity-50">
                    Decline
                  </button>
                  <button disabled={busy} onClick={() => decide("approve")}
                    className="text-sm px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                    Approve
                  </button>
                </div>
              </div>
            )}
            {selected.status !== "pending" && (
              <div className="px-5 py-3 border-t border-slate-200 flex justify-end">
                <button onClick={() => setSelected(null)} className="text-sm px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50">Close</button>
              </div>
            )}
          </div>
        </div>
      )}
    </SparkPageShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

export default SparkApprovalsPage;
