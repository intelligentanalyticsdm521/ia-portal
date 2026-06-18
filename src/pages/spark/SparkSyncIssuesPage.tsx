// SparkSyncIssuesPage — Settings → CRM → Sync Issues.
//
// Surfaces contacts where Stripe sync needs the tenant's attention. Read-only
// view of the outbox dead-letter + retry-stuck rows. Badge appears in SPARK
// SubNav when count > 0.
//
// Endpoints (oliver-api):
//   GET /lifecycle/sync-issues  — list of problem rows

import { useEffect, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";

interface SyncIssue {
  id: number;
  contact_id: number;
  op: "customer.create" | "customer.update";
  enqueued_at: string;
  processed_at: string | null;
  attempt_count: number;
  last_error: string | null;
  display_name: string | null;
  email: string | null;
  lifecycle_stage: string | null;
}

export default function SparkSyncIssuesPage() {
  const { get } = useOliverApi();
  const [issues, setIssues] = useState<SyncIssue[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    get<SyncIssue[]>("/lifecycle/sync-issues")
      .then((rows) => { if (!cancelled) setIssues(rows || []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [get]);

  return (
    <SparkPageShell title="Sync Issues" subtitle="Contacts where syncing to billing needs your attention.">
      <div className="p-6 max-w-5xl">
        {loading ? (
          <div className="text-sm text-slate-500">Loading…</div>
        ) : issues.length === 0 ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            ✓ All contacts are in sync. Nothing needs your attention.
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs text-slate-500 mb-2">{issues.length} contact{issues.length === 1 ? "" : "s"} with sync issues. Retry runs automatically every 60s; rows still failing after 10 attempts are dead-lettered for review.</div>
            {issues.map((row) => (
              <div key={row.id} className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm text-slate-900">{row.display_name || row.email || `Contact ${row.contact_id}`}</div>
                    {row.email && <div className="text-xs text-slate-600">{row.email}</div>}
                    <div className="text-[11px] text-slate-500 mt-1 space-x-2">
                      <span>{row.op === "customer.create" ? "First-time OLIVER customer setup" : "Identity update"}</span>
                      <span>•</span>
                      <span>{row.attempt_count} attempt{row.attempt_count === 1 ? "" : "s"}</span>
                      {row.lifecycle_stage && (
                        <>
                          <span>•</span>
                          <span>Stage: {row.lifecycle_stage.replace(/_/g, " ")}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-[11px] text-slate-500 shrink-0">
                    {new Date(row.enqueued_at).toLocaleString()}
                  </div>
                </div>
                {row.last_error && (
                  <div className="mt-2 text-xs text-amber-900 bg-amber-100 rounded px-2 py-1 break-all font-mono">{row.last_error}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </SparkPageShell>
  );
}
