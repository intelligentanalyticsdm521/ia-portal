// AgentApprovalCard — one thing an agent wants a yes or a no on.
//
// Deliberately the SAME three buttons, in the same order, with the same words
// and the same colours as the Responder's panel
// (components/spark/LeadResponderPanel.tsx): Approve & send · Edit · Decline.
// A client should learn this once and recognise it everywhere, which is the
// whole reason this build exists rather than four bespoke queues.
//
// Two differences from the Responder panel, both deliberate:
//   · the primary button's wording comes from the row, because approving a
//     campaign draft does NOT send anything (AG-2) and a button that says
//     "Approve & send" there would be a lie
//   · Decline takes a note. Every backend decline route on the line either
//     requires a reason (QTC) or records one (Field Ops override), and the
//     reason is what tone calibration learns from.
//
// The engine is ARGUS AI. The model vendor is named nowhere.
import { useState } from "react";
import { Send, Pencil, Trash2, AlertTriangle, Info, ExternalLink } from "lucide-react";
import type { AgentActivityRow } from "./types";

interface Props {
  row: AgentActivityRow;
  /** What the primary button says. "Approve & send" unless the row sends nothing. */
  approveLabel?: string;
  busy?: string | null;
  onApprove: (row: AgentActivityRow, edits?: { subject?: string; body?: string }) => void;
  onDecline: (row: AgentActivityRow, note: string) => void;
}

function when(ts: string | null | undefined) {
  if (!ts) return null;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString();
}

export function AgentApprovalCard({ row, approveLabel, busy, onApprove, onDecline }: Props) {
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(row.detail?.subject || "");
  const [body, setBody] = useState(row.detail?.body || "");
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");

  const editable = typeof row.detail?.body === "string" && row.detail.body.length > 0;
  const primary = approveLabel || "Approve & send";
  const approveBusy = busy === `approve-${row.agent}-${row.id}`;
  const declineBusy = busy === `decline-${row.agent}-${row.id}`;

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <header className="flex items-start justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <div>
          <div className="text-xs font-semibold text-slate-900">{row.summary}</div>
          <div className="text-[11px] text-slate-500">
            {row.agent_label}
            {row.proposed_at ? ` · ${when(row.proposed_at)}` : ""}
          </div>
        </div>
        <span className="flex-shrink-0 text-[11px] text-slate-500">{row.attribution}</span>
      </header>

      <div className="space-y-2 px-3 py-2.5">
        {row.hold_note && (
          <div className="flex items-start gap-1.5 rounded bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
            <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
            <span>{row.hold_note}</span>
          </div>
        )}

        {editing ? (
          <div className="space-y-2">
            {row.detail?.subject != null && (
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                placeholder="Subject"
              />
            )}
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              className="w-full rounded border border-slate-300 px-2 py-1 font-mono text-xs"
            />
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => { onApprove(row, { subject, body }); setEditing(false); }}
                disabled={approveBusy}
                className="rounded bg-violet-600 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40"
              >Save &amp; {primary.toLowerCase().startsWith("approve & ") ? primary.slice(10) : "approve"}</button>
              <button onClick={() => setEditing(false)} className="rounded border border-slate-300 px-2.5 py-1 text-xs">Cancel</button>
            </div>
          </div>
        ) : (
          <>
            {row.detail?.subject && <div className="text-xs font-medium text-slate-800">{row.detail.subject}</div>}
            {row.detail?.body && (
              <div className="max-h-64 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
                {row.detail.body}
              </div>
            )}
          </>
        )}

        {row.detail?.why && (
          <details className="text-[11px] text-slate-500">
            <summary className="cursor-pointer select-none hover:text-slate-700">
              <Info className="mr-1 inline h-3 w-3" />What this is based on
            </summary>
            <p className="mt-1 whitespace-pre-wrap pl-4 leading-relaxed">{row.detail.why}</p>
            {row.detail.evidence && <p className="mt-1 pl-4">{row.detail.evidence}</p>}
            {typeof row.detail.reachable === "number" && (
              <p className="mt-1 pl-4">
                {row.detail.reachable} can be emailed
                {typeof row.detail.suppressed === "number" && row.detail.suppressed > 0
                  ? `, ${row.detail.suppressed} asked not to be`
                  : ""}
              </p>
            )}
          </details>
        )}

        {row.links.length > 0 && (
          <div className="flex flex-wrap gap-3 text-[11px]">
            {row.links.map((l) => (
              <a key={l.href} href={l.href} className="inline-flex items-center gap-1 text-violet-700 underline">
                <ExternalLink className="h-3 w-3" />{l.label}
              </a>
            ))}
          </div>
        )}

        {declining ? (
          <div className="space-y-2">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Why not? One line is enough — it is how this gets better."
              className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { onDecline(row, note.trim()); setDeclining(false); setNote(""); }}
                disabled={!note.trim() || declineBusy}
                className="rounded bg-slate-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40"
              >Decline it</button>
              <button onClick={() => { setDeclining(false); setNote(""); }} className="rounded border border-slate-300 px-2.5 py-1 text-xs">Cancel</button>
            </div>
          </div>
        ) : (
          !editing && (
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                onClick={() => onApprove(row)}
                disabled={approveBusy}
                className="flex items-center gap-1 rounded bg-violet-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-40"
              >
                <Send className="h-3 w-3" />{primary}
              </button>
              {editable && (
                <button
                  onClick={() => { setEditing(true); setSubject(row.detail?.subject || ""); setBody(row.detail?.body || ""); }}
                  className="flex items-center gap-1 rounded border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
                >
                  <Pencil className="h-3 w-3" />Edit
                </button>
              )}
              <button
                onClick={() => setDeclining(true)}
                disabled={declineBusy}
                className="flex items-center gap-1 rounded border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                <Trash2 className="h-3 w-3" />Decline
              </button>
            </div>
          )
        )}

        <p className="text-[11px] text-slate-400">{row.cost_note}</p>
      </div>
    </section>
  );
}

export default AgentApprovalCard;
