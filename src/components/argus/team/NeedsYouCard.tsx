// NeedsYouCard — one thing an employee left for the owner
// (contract ARGUS employees phase 1 §F.3), built on AgentApprovalCard.
//
// It answers four things in words before any button: WHAT it is (the summary),
// FROM WHICH JOB ("from your web person · Blog posts"), WHY IT WAITED (the
// server's held_words) and WHAT APPROVE DOES (the button's own label, from the
// product that owns the decision). Under them, which saved version of Your
// business it was written from.
//
// The buttons call the routes the row names (`decide`), never a second
// approval path. A held draft (`edits_required`) keeps Approve off until a word
// changes. A social post's Approve carries the time it should go out, default
// tomorrow 10:00 in this browser's time zone. There is no "approve all".
//
// A row whose only decision is Skip (an escalated Quote-to-Cash draft, a crew
// suggestion that names nobody) gets the Skip button and its question, so an
// item counted in "{n} need you" always has a way out. The products' own
// attribution line (it names the platform's company and says "Agent") is never
// drawn here: the job line says who made it (lib/team.ts cardRow).
import { useState } from "react";
import { Link } from "react-router-dom";
import { Send, Trash2 } from "lucide-react";
import { AgentApprovalCard } from "../../agents/AgentApprovalCard";
import {
  YOUR_BUSINESS_ROUTE, approveAllowed, briefCitedLine, cardKind, cardRow,
  localToIso, skipPrompt, tomorrowAtTen, type NeedsYouRow,
} from "../../../lib/team";
import type { DecideInput } from "../../../hooks/useNeedsYou";

interface Props {
  row: NeedsYouRow;
  /** The job's name on screen ("Blog posts"), when the page knows it. */
  jobName?: string | null;
  onDecide: (row: NeedsYouRow, which: "approve" | "skip" | "publish", input?: DecideInput) => Promise<{ ok: boolean; words: string }>;
}

export function NeedsYouCard({ row, jobName, onDecide }: Props) {
  const d = row.decide || {};
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<{ ok: boolean; words: string } | null>(null);
  const [when, setWhen] = useState(() => tomorrowAtTen());
  const [skipping, setSkipping] = useState(false);
  const [reason, setReason] = useState("");
  const cited = briefCitedLine(row.brief_cited);
  const kind = cardKind(d);

  const run = async (which: "approve" | "skip" | "publish", input?: DecideInput) => {
    setBusy(`${which === "skip" ? "decline" : which}-${row.agent}-${row.id}`);
    setSaid(null);
    const out = await onDecide(row, which, input);
    setSaid(out);
    setBusy(null);
  };

  const shown = cardRow(row, jobName);
  const note = cited ? (
    <p className="text-[11px] text-slate-600">
      {cited.link ? <Link to={YOUR_BUSINESS_ROUTE} className="underline">{cited.words}</Link> : cited.words}
    </p>
  ) : null;
  const saidLine = said && (
    <p className={`mt-1 text-xs ${said.ok ? "text-emerald-800" : "text-rose-700"}`} role={said.ok ? "status" : "alert"}>{said.words}</p>
  );

  // Approved already: the only thing left is the second press.
  if (kind === "publish" && d.publish) {
    const publishBusy = busy === `publish-${row.agent}-${row.id}`;
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2">
        <div className="flex items-start gap-2">
          <Send className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-600" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-slate-900">{row.summary}</div>
            <div className="text-[11px] text-slate-600">{shown.agent_label}</div>
            <div className="text-[11px] text-slate-600">{shown.hold_note}</div>
            {note}
          </div>
          <button
            type="button"
            onClick={() => void run("publish")}
            disabled={publishBusy}
            className="flex-shrink-0 rounded border border-emerald-300 bg-white px-2.5 py-1 text-[11px] font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-40"
          >
            {publishBusy ? "Sending…" : d.publish.label}
          </button>
        </div>
        {saidLine}
      </div>
    );
  }

  // Only Skip: the item can't be approved here, but it can be let go of.
  if (kind === "skip" && d.skip) {
    const skipBusy = busy === `decline-${row.agent}-${row.id}`;
    const required = d.skip.reason === "required";
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
        <div className="text-xs font-medium text-slate-900">{row.summary}</div>
        <div className="text-[11px] text-slate-500">{shown.agent_label}</div>
        <div className="text-[11px] text-slate-600">{shown.hold_note}</div>
        {note}
        {row.links.map((l) => (
          <a key={l.href} href={l.href} className="mr-3 text-[11px] text-violet-700 underline">{l.label}</a>
        ))}
        {skipping ? (
          <div className="mt-2 space-y-2">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder={skipPrompt(d.skip.reason)}
              aria-label={skipPrompt(d.skip.reason)}
              className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { const r = reason.trim(); setSkipping(false); setReason(""); void run("skip", { reason: r }); }}
                disabled={skipBusy || (required && !reason.trim())}
                className="rounded bg-slate-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40"
              >Skip it</button>
              <button type="button" onClick={() => { setSkipping(false); setReason(""); }} className="rounded border border-slate-300 px-2.5 py-1 text-xs">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setSkipping(true)}
              disabled={skipBusy}
              className="inline-flex items-center gap-1 rounded border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              <Trash2 className="h-3 w-3" />Skip
            </button>
          </div>
        )}
        {saidLine}
      </div>
    );
  }

  if (kind !== "approve" || !d.approve) {
    // Nothing this page can decide: say what it is and where it came from, no buttons.
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
        <div className="text-xs font-medium text-slate-900">{row.summary}</div>
        <div className="text-[11px] text-slate-500">{shown.agent_label}</div>
        <div className="text-[11px] text-slate-600">{shown.hold_note}</div>
        {note}
        {row.links.map((l) => (
          <a key={l.href} href={l.href} className="mr-3 text-[11px] text-violet-700 underline">{l.label}</a>
        ))}
      </div>
    );
  }

  const approve = d.approve;
  const schedule = approve.when === "schedule";
  const extra = schedule ? (
    <label className="flex items-center gap-1.5 text-[11px] text-slate-700">
      <span>Goes out</span>
      <input
        type="datetime-local"
        value={when}
        onChange={(e) => setWhen(e.target.value)}
        className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px]"
        aria-label="When it should go out"
      />
    </label>
  ) : null;

  return (
    <div>
      <AgentApprovalCard
        row={shown}
        approveLabel={approve.label}
        busy={busy}
        secondaryLabel="Skip"
        requireEditsToApprove={!approveAllowed(approve, false)}
        declineNoteOptional={d.skip?.reason !== "required"}
        declinePrompt={skipPrompt(d.skip?.reason)}
        canEdit={(approve.edits || []).length > 0}
        note={note}
        extra={extra}
        onApprove={(_r, edits) => void run("approve", {
          // The card's one heading box is the title of a post and the subject of an
          // email; a row with no heading sends none, so nothing is blanked.
          edits: edits
            ? { ...(row.detail?.subject != null ? { title: edits.subject, subject: edits.subject } : {}), body: edits.body }
            : null,
          scheduledFor: schedule ? localToIso(when) : null,
        })}
        onDecline={d.skip ? (_r, reason) => void run("skip", { reason }) : undefined}
      />
      {saidLine}
    </div>
  );
}

export default NeedsYouCard;
