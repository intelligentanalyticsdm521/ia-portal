// pages/admin/SiteRequestsPage.tsx — Foundation §3A3, the founder side.
//
// Every website change request a client has sent, across all businesses, with
// the one action that matters: move it, and optionally say something back. The
// client's own history list (ARION → Website → Support) reads the same rows,
// and moving one into Done or Not-doing emails them the reply.
//
// Route: /app/admin/site-requests (RequireFounderRoute). Data: arion-api
// GET/PATCH /admin/site-requests, gated server-side by middleware/requireFounder
// (founder platform role, or the static admin token for scripts) — so a client
// who guesses the URL is refused by the API as well as by the route guard.
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useMsal } from "@azure/msal-react";
import { RefreshCw, Inbox } from "lucide-react";
import { useActiveAccount } from "../../auth/useAccessToken";
import { acquireApiToken } from "../../lib/msalToken";
import { useAppState } from "../../app/AppState";
import {
  listFounderSiteRequests,
  updateFounderSiteRequest,
  type ArionSiteRequest,
  type SiteRequestStatus,
} from "../../lib/arionApi";

const STATUSES: SiteRequestStatus[] = ["open", "in_progress", "done", "declined"];

/** Plain words. The same labels the client sees on their own list. */
const STATUS_LABEL: Record<SiteRequestStatus, string> = {
  open: "Received",
  in_progress: "Being worked on",
  done: "Done",
  declined: "Not doing this one",
};

const STATUS_TONE: Record<SiteRequestStatus, { bg: string; fg: string }> = {
  open: { bg: "#FEF3C7", fg: "#92400E" },
  in_progress: { bg: "#DBEAFE", fg: "#1E40AF" },
  done: { bg: "#DCFCE7", fg: "#166534" },
  declined: { bg: "#F1F5F9", fg: "#475569" },
};

function ageInDays(iso: string): number {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

function ageLabel(iso: string): string {
  const d = ageInDays(iso);
  if (d === 0) return "today";
  if (d === 1) return "1 day";
  return `${d} days`;
}

const cell: CSSProperties = { padding: "10px 12px", verticalAlign: "top", fontSize: 13, borderTop: "1px solid #E2E8F0" };
const head: CSSProperties = { padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: "#64748B" };

export default function SiteRequestsPage() {
  const { instance } = useMsal();
  const account = useActiveAccount();
  const { active } = useAppState();

  const [rows, setRows] = useState<ArionSiteRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"" | SiteRequestStatus>("");

  // Per-row edit state, keyed by request id. Nothing is sent until Save.
  const [draft, setDraft] = useState<Record<string, { status: SiteRequestStatus; reply: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saidId, setSaidId] = useState<string | null>(null);

  const baseUrl = import.meta.env.VITE_ARION_API_BASE_URL as string;
  const tenantId = active?.tenant?.tenantId;

  const load = useCallback(async () => {
    if (!account || !tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const token = await acquireApiToken(instance, account);
      const r = await listFounderSiteRequests({ baseUrl, bearerToken: token, tenantId, status: filter || undefined });
      setRows(r.requests || []);
      setDraft({});
    } catch (e: any) {
      setError(e?.message || "Could not load the change-request queue.");
    } finally {
      setLoading(false);
    }
  }, [instance, account, tenantId, baseUrl, filter]);

  useEffect(() => { load(); }, [load]);

  const save = async (r: ArionSiteRequest) => {
    if (!account || !tenantId) return;
    const d = draft[r.siteRequestId];
    const nextStatus = d?.status ?? r.status;
    const reply = (d?.reply ?? "").trim();
    if (nextStatus === r.status && !reply) return; // nothing to do
    setSavingId(r.siteRequestId);
    setError(null);
    try {
      const token = await acquireApiToken(instance, account);
      const res = await updateFounderSiteRequest({
        baseUrl, bearerToken: token, tenantId,
        siteRequestId: r.siteRequestId,
        status: nextStatus,
        resolutionNotes: reply || undefined,
      });
      setRows((prev) => prev.map((x) => (x.siteRequestId === r.siteRequestId ? { ...x, ...res.request } : x)));
      setDraft((prev) => { const n = { ...prev }; delete n[r.siteRequestId]; return n; });
      setSaidId(res.clientEmailQueued ? r.siteRequestId : null);
      setTimeout(() => setSaidId(null), 4000);
    } catch (e: any) {
      setError(e?.message || "Could not update that request.");
    } finally {
      setSavingId(null);
    }
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [rows]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Website change requests</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            What clients have asked us to change on their websites, newest first. Moving one to
            Done or Not-doing emails the person who asked.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setFilter("")}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === "" ? "border-[#EF6C33] bg-amber-50 text-[#B34A16]" : "border-slate-200 bg-white text-gray-600"}`}
        >
          Everything
        </button>
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === s ? "border-[#EF6C33] bg-amber-50 text-[#B34A16]" : "border-slate-200 bg-white text-gray-600"}`}
          >
            {STATUS_LABEL[s]}{filter === "" && counts[s] ? ` (${counts[s]})` : ""}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
          <thead>
            <tr style={{ background: "#F8FAFC" }}>
              <th style={head}>Business</th>
              <th style={head}>Site</th>
              <th style={head}>What they asked for</th>
              <th style={head}>Status</th>
              <th style={head}>Waiting</th>
              <th style={head}>Move it</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const d = draft[r.siteRequestId];
              const nextStatus = d?.status ?? r.status;
              const reply = d?.reply ?? "";
              const dirty = nextStatus !== r.status || reply.trim().length > 0;
              const tone = STATUS_TONE[r.status] ?? STATUS_TONE.open;
              return (
                <tr key={r.siteRequestId}>
                  <td style={cell}>
                    <div style={{ fontWeight: 600 }}>{r.tenantName || "Unknown business"}</div>
                    <div style={{ fontSize: 11, color: "#64748B" }}>{r.requestedByEmail || "no email on file"}</div>
                  </td>
                  <td style={{ ...cell, fontSize: 12 }}>{r.domain || "—"}</td>
                  <td style={{ ...cell, maxWidth: 380 }}>
                    <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.45 }}>
                      {(r.notes || "").trim() || r.requestType.replace(/_/g, " ")}
                    </div>
                    {r.resolutionNotes && (
                      <div style={{ marginTop: 6, fontSize: 12, color: "#475569" }}>
                        <strong>Replied:</strong> {r.resolutionNotes}
                      </div>
                    )}
                  </td>
                  <td style={cell}>
                    <span style={{ background: tone.bg, color: tone.fg, borderRadius: 999, padding: "2px 10px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                    {saidId === r.siteRequestId && (
                      <div style={{ marginTop: 6, fontSize: 11, color: "#166534" }}>Client emailed.</div>
                    )}
                  </td>
                  <td style={{ ...cell, fontSize: 12, color: "#64748B", whiteSpace: "nowrap" }}>{ageLabel(r.createdAt)}</td>
                  <td style={{ ...cell, minWidth: 260 }}>
                    <select
                      value={nextStatus}
                      onChange={(e) => setDraft((p) => ({ ...p, [r.siteRequestId]: { status: e.target.value as SiteRequestStatus, reply } }))}
                      className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs"
                    >
                      {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                    <textarea
                      value={reply}
                      onChange={(e) => setDraft((p) => ({ ...p, [r.siteRequestId]: { status: nextStatus, reply: e.target.value } }))}
                      placeholder="Optional — what should we tell them?"
                      rows={2}
                      className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-xs"
                    />
                    <button
                      onClick={() => save(r)}
                      disabled={!dirty || savingId === r.siteRequestId}
                      className="mt-1 rounded-md bg-[#EF6C33] px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      {savingId === r.siteRequestId ? "Saving…" : "Save"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} style={{ ...cell, textAlign: "center", padding: 40, color: "#64748B" }}>
                  <Inbox className="mx-auto mb-2 h-6 w-6 text-slate-300" />
                  {filter ? "Nothing in that state right now." : "No client has asked for a website change yet."}
                </td>
              </tr>
            )}
            {loading && rows.length === 0 && (
              <tr><td colSpan={6} style={{ ...cell, textAlign: "center", padding: 40, color: "#64748B" }}>Loading…</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
