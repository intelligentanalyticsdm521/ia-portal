// AgentActivityPanel — "what did my agents do, and what needs me?"
//
// Two groups and nothing else:
//   Waiting for you   everything still `proposed`. The ones this page owns get
//                     the approval card; the ones decided elsewhere (a
//                     Responder draft, decided on the lead card) get a line and
//                     a link, because a second approval path is a second place
//                     for the send-time re-checks to be forgotten.
//   Recently          approved / declined / stopped, newest first.
//
// A source we could not read is printed at the top. An empty list that quietly
// means "three of the four agents failed" is the failure mode this platform
// keeps paying for; here it is impossible.
import { AlertTriangle, CheckCircle2, ExternalLink, PauseCircle, XCircle } from "lucide-react";
import { AgentApprovalCard } from "./AgentApprovalCard";
import type { AgentActivityPayload, AgentActivityRow } from "./types";

interface Props {
  activity: AgentActivityPayload | null;
  loading: boolean;
  busy?: string | null;
  /** Per-agent wording for the primary button. Default: "Approve & send". */
  approveLabels?: Record<string, string>;
  onApprove: (row: AgentActivityRow, edits?: { subject?: string; body?: string }) => void;
  onDecline: (row: AgentActivityRow, note: string) => void;
  emptyTitle?: string;
  emptyBody?: string;
}

function when(ts: string | null | undefined) {
  if (!ts) return null;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString();
}

const ICON = {
  approved: CheckCircle2,
  declined: XCircle,
  stopped: PauseCircle,
  proposed: AlertTriangle,
} as const;

const TONE = {
  approved: "text-emerald-600",
  declined: "text-slate-400",
  stopped: "text-amber-500",
  proposed: "text-violet-600",
} as const;

function DoneRow({ row }: { row: AgentActivityRow }) {
  const Icon = ICON[row.status];
  return (
    <li className="flex items-start gap-2 border-b border-slate-100 px-3 py-2 last:border-b-0">
      <Icon className={`mt-0.5 h-3.5 w-3.5 flex-shrink-0 ${TONE[row.status]}`} />
      <div className="min-w-0 flex-1">
        <div className="text-xs text-slate-800">{row.summary}</div>
        <div className="text-[11px] text-slate-500">
          {row.agent_label} · {row.status_label}
          {row.decided_at ? ` · ${when(row.decided_at)}` : row.proposed_at ? ` · ${when(row.proposed_at)}` : ""}
        </div>
        {row.hold_note && <div className="mt-0.5 text-[11px] text-amber-800">{row.hold_note}</div>}
        {row.links.length > 0 && (
          <div className="mt-0.5 flex flex-wrap gap-3">
            {row.links.map((l) => (
              <a key={l.href} href={l.href} className="inline-flex items-center gap-1 text-[11px] text-violet-700 underline">
                <ExternalLink className="h-3 w-3" />{l.label}
              </a>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

/** Waiting, but the button lives somewhere else. Say where, and go there. */
function ElsewhereRow({ row }: { row: AgentActivityRow }) {
  const href = row.decide_href || row.links[0]?.href;
  return (
    <li className="flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50/50 px-3 py-2">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-violet-600" />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-slate-900">{row.summary}</div>
        <div className="text-[11px] text-slate-600">
          {row.agent_label} · {row.hold_note || row.status_label}
          {row.proposed_at ? ` · ${when(row.proposed_at)}` : ""}
        </div>
      </div>
      {href && (
        <a href={href} className="flex-shrink-0 rounded border border-violet-300 bg-white px-2 py-1 text-[11px] font-medium text-violet-700 hover:bg-violet-50">
          Open it
        </a>
      )}
    </li>
  );
}

export function AgentActivityPanel({
  activity, loading, busy, approveLabels, onApprove, onDecline, emptyTitle, emptyBody,
}: Props) {
  if (loading && !activity) return <div className="text-sm text-slate-500">Loading…</div>;
  if (!activity) return null;

  const waiting = activity.rows.filter((r) => r.status === "proposed");
  const decidable = waiting.filter((r) => r.can_decide);
  const elsewhere = waiting.filter((r) => !r.can_decide);
  const done = activity.rows.filter((r) => r.status !== "proposed");

  return (
    <div className="space-y-4">
      {activity.meta.degraded.length > 0 && (
        <div className="rounded border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
          <div className="font-semibold">Some of this list could not be loaded</div>
          <ul className="mt-1 space-y-0.5">
            {activity.meta.degraded.map((d) => (
              <li key={d.agent}>{d.agent}: {d.error}</li>
            ))}
          </ul>
        </div>
      )}

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Waiting for you{waiting.length > 0 ? ` (${waiting.length})` : ""}
        </h3>
        {waiting.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-600">
            {emptyTitle || "Nothing needs you right now."}
            {emptyBody ? <span className="mt-1 block text-slate-500">{emptyBody}</span> : null}
          </div>
        ) : (
          <div className="space-y-3">
            {decidable.map((row) => (
              <AgentApprovalCard
                key={`${row.agent}-${row.id}`}
                row={row}
                approveLabel={approveLabels?.[row.agent]}
                busy={busy}
                onApprove={onApprove}
                onDecline={onDecline}
              />
            ))}
            {elsewhere.length > 0 && (
              <ul className="space-y-2">
                {elsewhere.map((row) => <ElsewhereRow key={`${row.agent}-${row.id}`} row={row} />)}
              </ul>
            )}
          </div>
        )}
      </section>

      {done.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Recently</h3>
          <ul className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            {done.map((row) => <DoneRow key={`${row.agent}-${row.id}`} row={row} />)}
          </ul>
        </section>
      )}
    </div>
  );
}

export default AgentActivityPanel;
