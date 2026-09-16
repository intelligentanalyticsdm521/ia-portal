// ClientConsultingDeliverablesPage — every document we have sent the client.
//
// Brandon, 2026-09-15: "make sure they can always see their deliverables we've
// sent. I'd recommend a list with a link so they can see the document name and
// the date sent plus any approvals or anything like that. Revisions, approvals
// etc."
//
// The page before this was a library of APPROVED work only. On Rolling In It
// every document was still 'pending' — nothing moved a document when its
// request was approved — so a client who had approved two documents read "No
// approved deliverables yet." The API now returns every document that was sent,
// with its state and its history (oliver-api routes/consultingDeliverables.js),
// and this page is a plain list of it: what it is, when it was sent, where it
// stands, and what happened to it.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download, FileText, Inbox } from "lucide-react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { apiErrorMessage } from "../../lib/apiErrorMessage";
import { DeliverableActionPanel } from "../../components/consulting/DeliverableActionPanel";

interface HistoryItem {
  at: string;
  kind: string;
  label: string;
  note?: string | null;
}

type DocumentState = "waiting" | "approved" | "changes" | "sent";

interface ClientDocument {
  deliverable_id: string;
  title: string;
  file_name?: string | null;
  download_path?: string | null;
  project_name?: string | null;
  milestone_id?: string | null;
  milestone_name?: string | null;
  service_request_id?: string | null;
  request_title?: string | null;
  status: string;
  state: DocumentState;
  state_label: string;
  state_at?: string | null;
  sent_at?: string | null;
  approved_at?: string | null;
  history: HistoryItem[];
}

const STATE_STYLE: Record<DocumentState, string> = {
  waiting: "bg-sky-100 text-sky-800",
  approved: "bg-emerald-100 text-emerald-800",
  changes: "bg-amber-100 text-amber-800",
  sent: "bg-slate-100 text-slate-700",
};

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function ClientConsultingDeliverablesPage() {
  const { get, download, ready } = useOliverApi();
  const [docs, setDocs] = useState<ClientDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    setError(null);
    try {
      const r = await get<{ deliverables: ClientDocument[] }>("/consulting-deliverables");
      // history is always an array here, even from an API build that predates
      // it — the Portal and oliver-api deploy on separate pipelines.
      setDocs(Array.isArray(r?.deliverables)
        ? r.deliverables.map((d) => ({ ...d, history: Array.isArray(d.history) ? d.history : [] }))
        : []);
    } catch (e) {
      // A failed load is not an empty library — say so rather than telling a
      // client nothing was ever sent.
      setError(apiErrorMessage(e));
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [get, ready]);

  useEffect(() => { void load(); }, [load]);

  const waitingCount = useMemo(() => docs.filter((d) => d.state === "waiting").length, [docs]);

  async function handleDownload(d: ClientDocument) {
    if (!d.download_path) return;
    setDownloadingId(d.deliverable_id);
    setDownloadError(null);
    try {
      // The container is private: the file streams through the API with the
      // bearer token. A plain link to the blob would be refused.
      await download(d.download_path, d.file_name || d.title || "document");
    } catch (e) {
      setDownloadError(`Couldn't download ${d.title}: ${apiErrorMessage(e)}`);
    } finally {
      setDownloadingId(null);
    }
  }

  if (loading) {
    return (
      <div className="card" style={{ padding: 24, color: "#5A7A8A", fontSize: 13 }}>
        Loading your documents…
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <div className="text-sm font-semibold text-red-600">Couldn&apos;t load your documents.</div>
        <p className="mt-1 text-xs text-slate-500">{error}</p>
        <button
          type="button"
          onClick={() => { setLoading(true); void load(); }}
          className="mt-2 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Try again
        </button>
      </div>
    );
  }

  if (docs.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-12 text-center">
        <Inbox className="mx-auto mb-2 h-8 w-8 text-slate-400" />
        <div className="text-sm font-semibold text-slate-700">Nothing sent to you yet.</div>
        <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
          Every document we send you — designs, plans, reports — lands here with the date it
          was sent and whether it&apos;s been approved.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
          <strong>{docs.length}</strong> document{docs.length === 1 ? "" : "s"}
        </span>
        {waitingCount > 0 && (
          <span className="rounded-full bg-sky-100 px-3 py-1 font-semibold text-sky-800">
            {waitingCount} waiting on you
          </span>
        )}
      </div>

      {downloadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {downloadError}
        </div>
      )}

      <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {docs.map((d) => {
          const isOpen = !!expanded[d.deliverable_id];
          const where = [d.project_name, d.milestone_name || d.request_title].filter(Boolean).join(" · ");
          // Approved / changes carry their own date; waiting and sent read off
          // the sent date already shown beside them.
          const stateDate = d.state === "approved" || d.state === "changes" ? d.state_at : null;
          return (
            <li key={d.deliverable_id} className="px-4 py-3">
              <div className="flex flex-wrap items-start gap-3">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="break-words text-sm font-semibold text-slate-900">{d.title}</div>
                  {where && <div className="mt-0.5 text-[11px] text-slate-500">{where}</div>}
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                    <span className="tabular-nums">Sent {fmtDate(d.sent_at)}</span>
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${STATE_STYLE[d.state] || STATE_STYLE.sent}`}>
                      {d.state_label}
                      {stateDate ? ` ${fmtDate(stateDate)}` : ""}
                    </span>
                  </div>
                </div>
                {d.download_path && (
                  <button
                    type="button"
                    onClick={() => void handleDownload(d)}
                    disabled={downloadingId === d.deliverable_id}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    {downloadingId === d.deliverable_id ? "Downloading…" : "Download"}
                  </button>
                )}
              </div>

              {/* Their turn: the same review panel used everywhere else, so a
                  document on a request is approved by approving the request. */}
              {d.state === "waiting" && (
                <div className="mt-2 max-w-md sm:ml-7">
                  <DeliverableActionPanel
                    deliverable={{
                      deliverable_id: d.deliverable_id,
                      status: d.status,
                      service_request_id: d.service_request_id ?? null,
                      sent_at: d.sent_at ?? null,
                    }}
                    viewerRole="client"
                    context={d.milestone_id ? "milestone" : d.service_request_id ? "sr" : "standalone"}
                    onChanged={() => void load()}
                  />
                </div>
              )}

              {d.history.length > 0 && (
                <button
                  type="button"
                  onClick={() => setExpanded((s) => ({ ...s, [d.deliverable_id]: !isOpen }))}
                  aria-expanded={isOpen}
                  className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 sm:ml-7"
                >
                  {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  History ({d.history.length})
                </button>
              )}
              {isOpen && (
                <ol className="mt-2 space-y-1.5 border-l border-slate-200 pl-3 sm:ml-9">
                  {d.history.map((h, i) => (
                    <li key={`${h.at}-${i}`} className="text-[11px] text-slate-600">
                      <span className="font-medium text-slate-800">{h.label}</span>
                      <span className="tabular-nums"> · {fmtDate(h.at)}</span>
                      {h.note && (
                        <div className="mt-0.5 whitespace-pre-wrap rounded bg-amber-50 px-2 py-1 text-amber-900">
                          {h.note}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default ClientConsultingDeliverablesPage;
