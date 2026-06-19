// SparkLeadGenJobPage — F-150/F-163 Lead Gen V1 job progress + review queue.
//
// Two phases:
//   1. While running: live phase tracker, polls /leadgen/jobs/:id/status every 3s.
//   2. After complete: review queue table with checkboxes, Accept/Reject bulk
//      actions, "try expanding search" prompt if delivered < target.
//
// Reference: C:\dev\claude code\overnight-report\30_LEADGEN_V1_SPEC.md
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import {
  CheckCircle2, Circle, Loader2, AlertTriangle, ExternalLink, Mail, Phone,
  ArrowLeft, ThumbsUp, ThumbsDown, Sparkles, RefreshCw,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type JobPhase =
  | "queued"
  | "expanding_keywords"
  | "expanding_locations"
  | "discovery"
  | "scoring"
  | "enriching"
  | "finalizing"
  | "complete"
  | "failed";

type JobStatus = "queued" | "running" | "complete" | "failed" | "cancelled";

const PHASE_ORDER: JobPhase[] = [
  "queued",
  "expanding_keywords",
  "expanding_locations",
  "discovery",
  "scoring",
  "enriching",
  "finalizing",
  "complete",
];

const PHASE_LABELS: Record<JobPhase, { label: string; help: string }> = {
  queued:               { label: "Queued",               help: "Waiting for a worker to pick up your search." },
  expanding_keywords:   { label: "Expanding keywords",   help: "Building the full keyword set from your category and search mode." },
  expanding_locations:  { label: "Resolving locations",  help: "Computing the cities and ZIPs inside your radius." },
  discovery:            { label: "Discovery",            help: "Querying Google CSE and Brave Search for candidate domains." },
  scoring:              { label: "Scoring",              help: "Filtering against the blocklist, suppression list, and the cross-tenant cache." },
  enriching:            { label: "Enriching contacts",   help: "Pulling email addresses via homepage scrape and Hunter (only where needed)." },
  finalizing:           { label: "Finalizing",           help: "Wrapping up — refunding any shortfall against your max." },
  complete:             { label: "Complete",             help: "Review your leads below." },
  failed:               { label: "Failed",               help: "Something went wrong — see the error above." },
};

interface JobStatusResponse {
  job_id: string;
  status: JobStatus;
  phase: JobPhase;
  progress_pct?: number;
  delivered_count?: number;
  target_count?: number;
  started_at?: string;
  completed_at?: string;
  error?: string | null;
  cost_usd?: number;
  search_summary?: {
    category?: string;
    cities?: string[];
    keyword_count?: number;
    mode?: string;
  };
  // F-LG.14: surface when an orchestrator budget cap halted the run early
  // (CSE = target × 10, Hunter = target × 5). Banner explains under-delivery
  // instead of leaving the user puzzling over the gap.
  budget_stopped?: boolean;
  budget_stop_reason?: string | null;
}

// Raw row shape from GET /api/v1/leadgen/jobs/:id — what lumen.search_job
// actually serves up. Adapter below maps to the page-facing
// JobStatusResponse so the UI stays unchanged.
interface RawJobRow {
  id: number;
  tenant_id: string;
  profile_id: number | null;
  target_count: number | null;
  leads_found: number | null;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  progress_pct: number | null;
  progress_step: string | null;
  delivered_so_far: number | null;
  cse_calls: number | null;
  hunter_calls: number | null;
  budget_stopped: boolean | number | null;
  budget_stop_reason: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
}

const STEP_TO_PHASE: Record<string, JobPhase> = {
  starting: "queued",
  loading_filters: "queued",
  checking_cache: "queued",
  discovering: "discovery",
  scoring: "scoring",
  enriching: "enriching",
  persisting: "finalizing",
  completed: "complete",
};

function adaptRow(row: RawJobRow): JobStatusResponse {
  // 'completed' in DB → 'complete' for the page's phase tracker; everything
  // else (queued/running/failed/cancelled) passes through unchanged.
  const pageStatus: JobStatus =
    row.status === "completed" ? "complete" : (row.status as JobStatus);
  const phase: JobPhase =
    row.status === "completed"
      ? "complete"
      : row.status === "failed"
        ? "failed"
        : STEP_TO_PHASE[row.progress_step || ""] || "queued";
  return {
    job_id: String(row.id),
    status: pageStatus,
    phase,
    progress_pct: row.progress_pct ?? 0,
    delivered_count: row.delivered_so_far ?? row.leads_found ?? 0,
    target_count: row.target_count ?? 0,
    started_at: row.started_at ?? undefined,
    completed_at: row.completed_at ?? undefined,
    error: row.error_message,
    budget_stopped: !!row.budget_stopped,
    budget_stop_reason: row.budget_stop_reason,
  };
}

interface LeadContact { email?: string; phone?: string; verification_status?: string }
interface LeadRow {
  lead_id: string;
  domain: string;
  business_name?: string | null;
  score: number;
  lifecycle_stage?: string;
  discovery_sources: string[];
  contacts: LeadContact[];
  icp_fit_reason?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export function SparkLeadGenJobPage() {
  const { id: jobId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { get, post, ready } = useSparkApi();

  const [status, setStatus] = useState<JobStatusResponse | null>(null);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActing, setBulkActing] = useState(false);

  // Poll status every 3s while running.
  // Endpoint: GET /api/v1/leadgen/jobs/:id returns the raw lumen.search_job row;
  // adaptRow() maps it into the page-facing JobStatusResponse so the
  // existing UI stays unchanged.
  const fetchStatus = useCallback(async () => {
    if (!ready || !jobId) return;
    try {
      const raw = await get<RawJobRow>(`/api/v1/leadgen/jobs/${jobId}`);
      const r = adaptRow(raw);
      setStatus(r);
      setError(null);
      return r;
    } catch (err) {
      setError(err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [get, ready, jobId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (!status) return;
    if (status.status === "running" || status.status === "queued") {
      const t = setInterval(fetchStatus, 3000);
      return () => clearInterval(t);
    }
  }, [status, fetchStatus]);

  // F-LG.14: when the job completes, send the user to the Lead Inbox where
  // the Run Summary banner and the new rows live. Delay 1.5s so they get to
  // see the progress tracker hit 100% and the "Search complete" header
  // before we navigate — Brandon's locked rule is "results on completion
  // only, no live reveal" so the Lead Inbox is the destination.
  useEffect(() => {
    if (status?.status !== "complete") return;
    const t = setTimeout(() => navigate("/app/services/spark_leads"), 1500);
    return () => clearTimeout(t);
  }, [status?.status, navigate]);

  // Load leads once the job completes.
  const loadLeads = useCallback(async () => {
    if (!ready || !jobId) return;
    try {
      // TODO(leadgen-api): GET /leadgen/jobs/:id/leads → { data: LeadRow[] }
      const r = await get<{ data: LeadRow[] }>(`/leadgen/jobs/${jobId}/leads`);
      setLeads(r?.data || []);
    } catch (err) {
      setError(err);
    }
  }, [get, ready, jobId]);

  useEffect(() => {
    if (status?.status === "complete") loadLeads();
  }, [status?.status, loadLeads]);

  // ── derived ────────────────────────────────────────────────────────────
  const phaseIdx = status?.phase ? PHASE_ORDER.indexOf(status.phase) : 0;
  const isRunning = status?.status === "running" || status?.status === "queued";
  const isComplete = status?.status === "complete";
  const isFailed = status?.status === "failed";

  const shortfall = useMemo(() => {
    if (!isComplete || !status?.target_count || !status?.delivered_count) return 0;
    return Math.max(0, status.target_count - status.delivered_count);
  }, [isComplete, status]);

  const allSelected = leads.length > 0 && selectedIds.size === leads.length;
  function toggleAll() {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(leads.map((l) => l.lead_id)));
  }
  function toggleOne(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  async function bulkAction(action: "accept" | "reject") {
    if (selectedIds.size === 0 || bulkActing) return;
    setBulkActing(true);
    try {
      // TODO(leadgen-api): POST /leadgen/jobs/:id/review → { action, lead_ids }
      await post(`/leadgen/jobs/${jobId}/review`, {
        action,
        lead_ids: Array.from(selectedIds),
      });
      // Refresh the list to drop accepted/rejected rows.
      setSelectedIds(new Set());
      await loadLeads();
    } catch (err) {
      setError(err);
    } finally {
      setBulkActing(false);
    }
  }

  // ── render ─────────────────────────────────────────────────────────────
  const subtitle = !status
    ? "Loading job…"
    : isRunning
      ? `${PHASE_LABELS[status.phase]?.label || status.phase} · ${status.progress_pct ?? 0}%`
      : isComplete
        ? `${status.delivered_count ?? leads.length} leads delivered${status.target_count ? ` of ${status.target_count} requested` : ""}`
        : isFailed
          ? "Job failed"
          : "";

  return (
    <SparkPageShell
      title={status?.search_summary?.category ? `Search: ${status.search_summary.category}` : "Lead Gen Job"}
      subtitle={subtitle}
      help="Lead generation jobs progress through 7 phases. Once complete, accept or reject leads to send the accepted ones to your contacts."
      error={error}
      loading={loading && !status}
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/app/spark/leadgen/new")}
            className="text-xs px-2.5 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 flex items-center gap-1"
          >
            <ArrowLeft className="h-3 w-3" /> New search
          </button>
          <button
            onClick={() => navigate("/app/spark/leadgen/saved")}
            className="text-xs px-2.5 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          >
            Saved searches
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Progress tracker */}
        {status && (
          <div className="rounded-xl bg-white border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Job {jobId}</div>
                <div className="text-base font-semibold text-slate-900 mt-0.5">
                  {isComplete ? "Search complete" : isFailed ? "Search failed" : "Running your search"}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">{PHASE_LABELS[status.phase]?.help}</div>
              </div>
              {isRunning && (
                <div className="text-right">
                  <div className="text-2xl font-bold text-[#EF6C33] tabular-nums">{status.progress_pct ?? 0}%</div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wide">Progress</div>
                </div>
              )}
              {isComplete && (
                <div className="text-right">
                  <div className="text-2xl font-bold text-emerald-600 tabular-nums">{status.delivered_count ?? leads.length}</div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wide">Leads delivered</div>
                </div>
              )}
              {isFailed && (
                <div className="text-rose-600 flex items-center gap-1.5">
                  <AlertTriangle className="h-5 w-5" />
                  <span className="text-sm font-semibold">Failed</span>
                </div>
              )}
            </div>

            {/* Phase tracker — bar of dots */}
            <div className="relative">
              <div className="absolute top-3 left-3 right-3 h-px bg-slate-200" />
              <div
                className="absolute top-3 left-3 h-px bg-emerald-500 transition-all duration-500"
                style={{ width: `calc(${Math.max(0, Math.min(phaseIdx, PHASE_ORDER.length - 1)) / (PHASE_ORDER.length - 1) * 100}% - 6px)` }}
              />
              <ol className="relative flex items-start justify-between">
                {PHASE_ORDER.map((phase, idx) => {
                  const done = idx < phaseIdx || isComplete;
                  const active = idx === phaseIdx && isRunning;
                  return (
                    <li key={phase} className="flex flex-col items-center text-center" style={{ width: `${100 / PHASE_ORDER.length}%` }}>
                      <div
                        className={`h-6 w-6 rounded-full border-2 flex items-center justify-center bg-white relative z-10 ${
                          done ? "border-emerald-500" : active ? "border-[#EF6C33]" : "border-slate-300"
                        }`}
                      >
                        {done && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                        {active && <Loader2 className="h-3 w-3 text-[#EF6C33] animate-spin" />}
                        {!done && !active && <Circle className="h-3 w-3 text-slate-300" />}
                      </div>
                      <div className={`mt-1.5 text-[10px] leading-tight ${done || active ? "text-slate-700 font-medium" : "text-slate-400"}`}>
                        {PHASE_LABELS[phase].label}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>

            {isFailed && status.error && (
              <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
                {status.error}
              </div>
            )}
          </div>
        )}

        {/* F-LG.14: budget-cap banner. Triggers when the orchestrator halted
            the run because target × N call budget hit zero — typically a
            Hunter Domain Search cap. Without this, an under-delivered run
            looks like "we just couldn't find more" when the truth is "your
            budget said stop". */}
        {isComplete && status?.budget_stopped && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-700 mt-0.5 flex-shrink-0" />
            <div>
              <div className="text-sm font-semibold text-rose-900">
                Run stopped early — {status.budget_stop_reason === "hunter_cap"
                  ? "Hunter contact-lookup budget cap"
                  : status.budget_stop_reason === "cse_cap"
                    ? "Google search budget cap"
                    : "internal budget cap"}
              </div>
              <p className="text-[12px] text-rose-800 mt-0.5">
                We hit our hard safety cap of {status.budget_stop_reason === "hunter_cap" ? "5×" : "10×"} the requested target.
                {" "}This protects you from runaway API charges. Narrow your terms or radius and try again.
              </p>
            </div>
          </div>
        )}

        {/* Try-expanding prompt */}
        {isComplete && shortfall > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-amber-700 mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-amber-900">We came up short by {shortfall} leads</div>
                <p className="text-[12px] text-amber-800 mt-0.5">Try widening your radius, switching to a broader search mode, or adding more terms.</p>
              </div>
            </div>
            <Link
              to="/app/spark/leadgen/new"
              className="text-xs px-3 py-1.5 rounded bg-amber-600 text-white hover:bg-amber-700 whitespace-nowrap flex items-center gap-1"
            >
              <RefreshCw className="h-3 w-3" /> Expand search
            </Link>
          </div>
        )}

        {/* Review queue */}
        {isComplete && (
          <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="text-sm font-semibold text-slate-900">Review queue</div>
                <span className="text-[11px] text-slate-500">
                  {selectedIds.size > 0 ? `${selectedIds.size} selected` : `${leads.length} lead${leads.length === 1 ? "" : "s"}`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => bulkAction("reject")}
                  disabled={selectedIds.size === 0 || bulkActing}
                  className="text-xs px-2.5 py-1 rounded border border-rose-300 bg-white text-rose-700 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <ThumbsDown className="h-3 w-3" /> Reject selected
                </button>
                <button
                  onClick={() => bulkAction("accept")}
                  disabled={selectedIds.size === 0 || bulkActing}
                  className="text-xs px-2.5 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <ThumbsUp className="h-3 w-3" /> Accept selected
                </button>
              </div>
            </div>

            {leads.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-slate-400">
                No leads to review. {shortfall > 0 ? "Try expanding your search above." : "All leads have been actioned."}
              </div>
            ) : (
              <table className="min-w-full text-left text-sm">
                <thead className="bg-white text-[10px] text-slate-500 uppercase tracking-wide border-b border-slate-100">
                  <tr>
                    <th className="px-3 py-2 w-8">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        className="accent-[#EF6C33]"
                        aria-label="Select all"
                      />
                    </th>
                    <th className="px-3 py-2">Domain</th>
                    <th className="px-3 py-2">Business</th>
                    <th className="px-3 py-2 text-right">Score</th>
                    <th className="px-3 py-2">Contacts</th>
                    <th className="px-3 py-2">Sources</th>
                    <th className="px-3 py-2">ICP fit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {leads.map((l) => {
                    const selected = selectedIds.has(l.lead_id);
                    return (
                      <tr key={l.lead_id} className={`hover:bg-slate-50 ${selected ? "bg-orange-50/40" : ""}`}>
                        <td className="px-3 py-2 align-top">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleOne(l.lead_id)}
                            className="accent-[#EF6C33]"
                          />
                        </td>
                        <td className="px-3 py-2 align-top">
                          <a
                            href={`https://${l.domain}`}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="text-sm font-medium text-slate-900 hover:text-[#EF6C33] inline-flex items-center gap-1"
                          >
                            {l.domain} <ExternalLink className="h-3 w-3 text-slate-400" />
                          </a>
                        </td>
                        <td className="px-3 py-2 align-top text-sm text-slate-700">{l.business_name || "—"}</td>
                        <td className="px-3 py-2 align-top text-right">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${scoreClass(l.score)}`}>
                            {Math.round(l.score)}
                          </span>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="space-y-0.5">
                            {l.contacts.slice(0, 3).map((c, i) => (
                              <div key={i} className="text-[11px] text-slate-600 flex items-center gap-1">
                                {c.email && <><Mail className="h-3 w-3 text-slate-400" /><span className="truncate">{c.email}</span></>}
                                {c.phone && !c.email && <><Phone className="h-3 w-3 text-slate-400" /><span>{c.phone}</span></>}
                                {c.verification_status === "valid" && <span className="text-[9px] text-emerald-700 bg-emerald-50 px-1 rounded">✓</span>}
                              </div>
                            ))}
                            {l.contacts.length > 3 && (
                              <div className="text-[10px] text-slate-400">+ {l.contacts.length - 3} more</div>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="flex flex-wrap gap-1">
                            {l.discovery_sources.map((s) => (
                              <span key={s} className="text-[9px] uppercase tracking-wide bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                                {s.replace(/_/g, " ")}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2 align-top text-[11px] text-slate-500 max-w-xs">
                          {l.icp_fit_reason || <span className="text-slate-300 italic">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </SparkPageShell>
  );
}

function scoreClass(score: number): string {
  if (score >= 80) return "bg-rose-100 text-rose-700";        // Hot
  if (score >= 50) return "bg-amber-100 text-amber-700";       // Warm
  return "bg-blue-100 text-blue-700";                          // Cold
}

export default SparkLeadGenJobPage;
