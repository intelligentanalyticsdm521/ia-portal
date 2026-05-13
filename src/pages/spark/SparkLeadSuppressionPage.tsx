// SparkLeadSuppressionPage — Lead-level suppression list
//
// Domains and email addresses listed here are excluded from inbound lead capture
// and from any outbound send. Use it to block competitors, ex-employees, spammy
// signups, etc. Separate from the email deliverability suppression list (which
// tracks hard bounces / complaints from the SPARK sending infrastructure).
import { useCallback, useEffect, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Plus, X, ShieldOff } from "lucide-react";

interface SuppressionRow {
  id: number;
  tenant_id: string;
  domain: string | null;
  email: string | null;
  reason: string | null;
  created_at: string;
}

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export function SparkLeadSuppressionPage() {
  const { get, post, del, ready } = useSparkApi();
  const [rows, setRows] = useState<SuppressionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [showModal, setShowModal] = useState(false);
  const [busy, setBusy] = useState(false);

  // form
  const [domain, setDomain] = useState("");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");

  const fetchList = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const r = await get<{ data: SuppressionRow[] }>("/api/v1/lead-suppression");
      setRows(r?.data || []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [get, ready]);

  useEffect(() => { fetchList(); }, [fetchList]);

  function resetForm() {
    setDomain("");
    setEmail("");
    setReason("");
  }

  async function save() {
    if (!domain.trim() && !email.trim()) {
      alert("Provide either a domain or an email.");
      return;
    }
    setBusy(true);
    try {
      await post("/api/v1/lead-suppression", {
        domain: domain.trim() || null,
        email: email.trim() || null,
        reason: reason.trim() || null,
      });
      setShowModal(false);
      resetForm();
      await fetchList();
    } catch (err) {
      alert(`Failed to add: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (!confirm("Remove this suppression? The matching domain/email will be allowed again.")) return;
    try {
      await del(`/api/v1/lead-suppression/${id}`);
      setRows(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      alert(`Failed: ${(err as Error).message}`);
    }
  }

  const actions = (
    <button
      onClick={() => { resetForm(); setShowModal(true); }}
      className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white hover:bg-[#d85a25] flex items-center gap-1"
    >
      <Plus className="h-4 w-4" /> Add suppression
    </button>
  );

  return (
    <SparkPageShell
      title="Lead suppression"
      subtitle={`${rows.length} entr${rows.length === 1 ? "y" : "ies"}`}
      help="Block specific domains or email addresses from creating new leads or receiving outbound mail. Useful for blocking competitors, internal employees, and known bad actors. This list is checked before any new lead is saved."
      actions={actions}
      loading={loading}
      error={error}
    >
      <div className="overflow-x-auto">
        <table className="spark-table">
          <thead>
            <tr>
              <th>Domain</th>
              <th>Email</th>
              <th>Reason</th>
              <th>Added</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-sm text-slate-500 py-8">
                  <ShieldOff className="h-5 w-5 mx-auto text-slate-300 mb-1" />
                  No suppressed domains or emails yet.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="font-medium text-slate-900">{row.domain || "—"}</td>
                <td className="text-sm text-slate-700">{row.email || "—"}</td>
                <td className="text-xs text-slate-600">
                  {row.reason ? (
                    <span className="px-2 py-0.5 rounded text-[11px] border border-slate-200 bg-slate-50">{row.reason}</span>
                  ) : "—"}
                </td>
                <td className="text-xs text-slate-500">{fmtTime(row.created_at)}</td>
                <td>
                  <button
                    onClick={() => remove(row.id)}
                    className="text-rose-600 hover:bg-rose-50 rounded p-1"
                    title="Remove suppression"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div
          className="fixed inset-0 bg-slate-900/30 z-50 flex items-center justify-center p-4"
          onClick={() => setShowModal(false)}
        >
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-200">
              <div className="text-xs uppercase font-bold text-slate-500">Add</div>
              <div className="text-base font-semibold text-slate-900 mt-0.5">Suppress a domain or email</div>
            </div>
            <div className="px-5 py-4 space-y-3 text-sm">
              <div>
                <label className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide">Domain</label>
                <input
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="competitor.com"
                  className="mt-1 w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]"
                />
              </div>
              <div className="text-center text-[10px] uppercase tracking-wider text-slate-400">or</div>
              <div>
                <label className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide">Email</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="someone@example.com"
                  className="mt-1 w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide">Reason</label>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Competitor / spam / opt-out"
                  className="mt-1 w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]"
                />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowModal(false)}
                className="text-sm px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                disabled={busy}
                onClick={save}
                className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white hover:bg-[#d85a25] disabled:opacity-50"
              >
                {busy ? "Saving…" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </SparkPageShell>
  );
}

export default SparkLeadSuppressionPage;
