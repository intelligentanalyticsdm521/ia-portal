// SocialApprovalsPage — My Brand > Social > Approvals (F-MB.SOC.7, 2026-06-22).
//
// Founder/admin inbox for posts submitted by non-admin users when the tenant
// has approval gating enabled (lumen.tenant_brand_setting.approval_required=1
// or core.tenant.agency_managed=1). Each row shows the body preview, target
// channels, scheduled-for timestamp, brand-voice score (if any), and two
// actions: Approve (optional note) and Reject (note required).
//
// Backend:
//   GET  /api/v1/my-brand/social/approvals
//   POST /api/v1/my-brand/social/posts/:id/approve  { note? }
//   POST /api/v1/my-brand/social/posts/:id/reject   { note }
//
// Note on roles: the backend gates these endpoints with requireRole(['admin']),
// so non-admins get 403. We additionally hide the page client-side using the
// useUserAccess hook so the Settings/landing tile is only offered to admins.
// useUserAccess fails-open as admin, matching every other admin-only page.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { useLumenApi } from "../../hooks/useLumenApi";
import { useUserAccess } from "../../hooks/useUserAccess";

// ── Types ────────────────────────────────────────────────────────────────
interface PendingTarget {
  target_id: string;
  platform: string;
  connection_id: string | null;
  status: string | null;
}

interface PendingPost {
  post_id: string;
  status: string;
  body_default: string;
  per_platform_body: Record<string, string> | null;
  asset_ids: string[];
  scheduled_for: string | null;
  voice_score: number | null;
  approval_status: string | null;
  approval_decided_by: string | null;
  approval_decided_at: string | null;
  approval_note: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  targets: PendingTarget[];
}

const PLATFORM_COLOR: Record<string, string> = {
  facebook: "#1877F2",
  instagram: "#E4405F",
  linkedin: "#0A66C2",
  x: "#0F1419",
  twitter: "#1DA1F2",
  tiktok: "#000000",
  youtube: "#FF0000",
  gbp: "#34A853",
};

function platformColor(p: string) { return PLATFORM_COLOR[p] || "#64748B"; }

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function voiceScoreBadge(score: number | null): { className: string; label: string } | null {
  if (score == null || !Number.isFinite(score)) return null;
  const s = Number(score);
  if (s >= 0.8) return { className: "bg-emerald-100 text-emerald-800", label: `${s.toFixed(2)} on-voice` };
  if (s >= 0.6) return { className: "bg-amber-100 text-amber-800", label: `${s.toFixed(2)} review` };
  return { className: "bg-rose-100 text-rose-700", label: `${s.toFixed(2)} off-voice` };
}

export function SocialApprovalsPage() {
  const lumen = useLumenApi();
  const access = useUserAccess();
  const [posts, setPosts] = useState<PendingPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Per-post UI state: { busy: 'approve' | 'reject' | null, note: string, error: string | null }
  const [rowState, setRowState] = useState<Record<string, { busy: "approve" | "reject" | null; note: string; error: string | null }>>({});

  const load = useCallback(async () => {
    if (!lumen.ready) return;
    setError(null);
    setLoading(true);
    try {
      const data = await lumen.get<PendingPost[]>("/api/v1/my-brand/social/approvals");
      setPosts(Array.isArray(data) ? data : []);
    } catch (err) {
      setError((err as Error)?.message || "Failed to load approvals");
    } finally {
      setLoading(false);
    }
  }, [lumen]);

  useEffect(() => { void load(); }, [load]);

  function setRow(postId: string, patch: Partial<{ busy: "approve" | "reject" | null; note: string; error: string | null }>) {
    setRowState((prev) => {
      const base = prev[postId] ?? { busy: null, note: "", error: null };
      return { ...prev, [postId]: { ...base, ...patch } };
    });
  }

  async function approve(postId: string) {
    const note = rowState[postId]?.note ?? "";
    setRow(postId, { busy: "approve", error: null });
    try {
      await lumen.post(`/api/v1/my-brand/social/posts/${encodeURIComponent(postId)}/approve`, { note: note || null });
      setPosts((cur) => cur.filter((p) => p.post_id !== postId));
    } catch (err) {
      setRow(postId, { busy: null, error: (err as Error)?.message || "Approve failed" });
    }
  }

  async function reject(postId: string) {
    const note = (rowState[postId]?.note ?? "").trim();
    if (!note) {
      setRow(postId, { error: "A rejection note is required so the submitter knows what to fix." });
      return;
    }
    setRow(postId, { busy: "reject", error: null });
    try {
      await lumen.post(`/api/v1/my-brand/social/posts/${encodeURIComponent(postId)}/reject`, { note });
      setPosts((cur) => cur.filter((p) => p.post_id !== postId));
    } catch (err) {
      setRow(postId, { busy: null, error: (err as Error)?.message || "Reject failed" });
    }
  }

  // Hide entire surface for non-admins. useUserAccess fails-open as admin so
  // this only blocks people the backend has explicitly tagged read_only/user.
  const isAdmin = !access.loading && access.isAdmin;
  const showLockedNotice = !access.loading && !access.isAdmin;

  const totalPending = useMemo(() => posts.length, [posts]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: "#FEC82C22" }}>
            <ShieldCheck className="h-6 w-6" style={{ color: "#1A3A4A" }} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Approval Inbox</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Posts submitted by team members while approval gating is enabled. Approve to release into the schedule, or reject with feedback so the submitter can rework it.
            </p>
          </div>
        </div>
        {!loading && (
          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {totalPending} pending
          </div>
        )}
      </header>

      {showLockedNotice && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>Approval Inbox is admin/founder only. Ask a workspace admin to grant you the admin role.</div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div className="flex-1">{error}</div>
          <button type="button" onClick={() => setError(null)} className="text-xs font-semibold text-rose-700 hover:underline">Dismiss</button>
        </div>
      )}

      {isAdmin && loading && (
        <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading approvals…
        </div>
      )}

      {isAdmin && !loading && posts.length === 0 && !error && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-500" />
          <div className="text-base font-semibold text-slate-900">Inbox zero</div>
          <p className="mt-1 text-sm text-slate-600">No posts are waiting for approval right now.</p>
        </div>
      )}

      {isAdmin && !loading && posts.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Post</th>
                <th className="px-4 py-3">Destinations</th>
                <th className="px-4 py-3">Scheduled for</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3">Voice</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {posts.map((p) => {
                const row = rowState[p.post_id] || { busy: null, note: "", error: null };
                const vScore = voiceScoreBadge(p.voice_score);
                return (
                  <tr key={p.post_id} className="align-top">
                    <td className="max-w-md px-4 py-4">
                      <div className="line-clamp-4 whitespace-pre-wrap text-slate-800">{p.body_default || <span className="italic text-slate-400">(empty body)</span>}</div>
                      {p.asset_ids.length > 0 && (
                        <div className="mt-1 text-[11px] text-slate-500">+{p.asset_ids.length} attached asset{p.asset_ids.length === 1 ? "" : "s"}</div>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-1">
                        {p.targets.length === 0 && <span className="text-xs italic text-slate-400">none</span>}
                        {p.targets.map((t) => (
                          <span
                            key={t.target_id}
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                            style={{ background: platformColor(t.platform) }}
                          >
                            {t.platform}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-slate-700">
                      <div className="flex items-center gap-1 text-xs">
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                        {p.scheduled_for ? fmtDate(p.scheduled_for) : <span className="text-slate-400">Immediate on approve</span>}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-xs text-slate-600">{fmtDate(p.created_at)}</td>
                    <td className="px-4 py-4">
                      {vScore ? (
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${vScore.className}`}>
                          {vScore.label}
                        </span>
                      ) : <span className="text-xs text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col items-end gap-2">
                        <textarea
                          rows={2}
                          placeholder="Note (required for reject, optional for approve)"
                          value={row.note}
                          onChange={(e) => setRow(p.post_id, { note: e.target.value, error: null })}
                          className="w-64 rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-[#2563eb] focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
                        />
                        {row.error && (
                          <div className="text-[11px] font-medium text-rose-700">{row.error}</div>
                        )}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => reject(p.post_id)}
                            disabled={!!row.busy}
                            className="inline-flex items-center gap-1.5 rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            {row.busy === "reject" ? "Rejecting…" : "Reject"}
                          </button>
                          <button
                            type="button"
                            onClick={() => approve(p.post_id)}
                            disabled={!!row.busy}
                            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {row.busy === "approve" ? "Approving…" : "Approve"}
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import { withMyBrandComingSoon } from "./ComingSoonOverlay";
export default withMyBrandComingSoon(SocialApprovalsPage);
