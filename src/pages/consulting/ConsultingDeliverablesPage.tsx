import { useEffect, useState, useCallback } from "react";
import { useConsultingApi } from "../../hooks/useConsultingApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

interface Deliverable {
  id: number;
  title: string;
  status: string;
  engagement_name: string;
  engagement_type: string;
  file_url: string | null;
  file_name: string | null;
  submitted_at: string | null;
  approved_at: string | null;
}

interface ConsultingDeliverablesPageProps {
  engagementType?: string;
}

export function ConsultingDeliverablesPage({ engagementType }: ConsultingDeliverablesPageProps) {
  const { get, post, ready } = useConsultingApi();
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [revisionId, setRevisionId] = useState<number | null>(null);
  const [revisionNotes, setRevisionNotes] = useState("");
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const loadDeliverables = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const query = engagementType ? `?engagement_type=${encodeURIComponent(engagementType)}` : "";
      const raw = await get<{ data: Deliverable[] }>(`/consulting/deliverables${query}`);
      setDeliverables(raw?.data ?? []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [get, ready, engagementType]);

  useEffect(() => {
    loadDeliverables();
  }, [loadDeliverables]);

  async function handleApprove(id: number) {
    setActionLoading(id);
    try {
      await post(`/consulting/deliverables/${id}/approve`);
      await loadDeliverables();
    } catch (err) {
      setError(err);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRevision(id: number) {
    if (!revisionNotes.trim()) return;
    setActionLoading(id);
    try {
      await post(`/consulting/deliverables/${id}/revision`, { notes: revisionNotes.trim() });
      setRevisionId(null);
      setRevisionNotes("");
      await loadDeliverables();
    } catch (err) {
      setError(err);
    } finally {
      setActionLoading(null);
    }
  }

  function formatDate(d: string | null) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  const typeLabel = engagementType
    ? engagementType.replace(/^build_your_/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "All";

  return (
    <OliverPageWrapper
      title={`${typeLabel} Deliverables`}
      subtitle="Review and approve deliverables from your consulting team"
      error={error}
      loading={loading}
    >
      <div className="p-6 space-y-4">
        {deliverables.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <p className="text-sm text-slate-600">No deliverables found for this engagement.</p>
          </div>
        ) : (
          deliverables.map((d) => (
            <div
              key={d.id}
              className={`rounded-xl bg-white ring-1 p-5 ${
                d.status === "submitted"
                  ? "ring-purple-300 bg-purple-50 border-l-4 border-[#7B1FA2]"
                  : d.status === "approved"
                    ? "ring-green-200"
                    : "ring-gray-200"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">{d.title}</h3>
                    {d.status === "approved" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                        <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        Approved
                      </span>
                    )}
                    {d.status === "submitted" && (
                      <span className="inline-block rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700">
                        Awaiting Review
                      </span>
                    )}
                    {d.status === "revision_requested" && (
                      <span className="inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                        Revision Requested
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{d.engagement_name}</p>
                  <p className="mt-0.5 text-xs text-slate-400">Submitted {formatDate(d.submitted_at)}</p>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  {d.file_url && (
                    <a
                      href={d.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-gray-200 transition-colors"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      {d.file_name ?? "Download"}
                    </a>
                  )}
                </div>
              </div>

              {/* Action buttons for submitted deliverables */}
              {d.status === "submitted" && (
                <div className="mt-4 flex items-center gap-3">
                  <button
                    onClick={() => handleApprove(d.id)}
                    disabled={actionLoading === d.id}
                    className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    {actionLoading === d.id ? "Approving..." : "Approve"}
                  </button>
                  <button
                    onClick={() => setRevisionId(revisionId === d.id ? null : d.id)}
                    disabled={actionLoading === d.id}
                    className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
                  >
                    Request Revision
                  </button>
                </div>
              )}

              {/* Revision notes textarea */}
              {revisionId === d.id && (
                <div className="mt-3 space-y-2">
                  <textarea
                    value={revisionNotes}
                    onChange={(e) => setRevisionNotes(e.target.value)}
                    placeholder="Describe the revisions needed..."
                    className="w-full rounded-lg border border-gray-300 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-purple-400 focus:ring-1 focus:ring-purple-400 outline-none"
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleRevision(d.id)}
                      disabled={!revisionNotes.trim() || actionLoading === d.id}
                      className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
                    >
                      {actionLoading === d.id ? "Submitting..." : "Submit Revision Request"}
                    </button>
                    <button
                      onClick={() => { setRevisionId(null); setRevisionNotes(""); }}
                      className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-gray-200 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </OliverPageWrapper>
  );
}
