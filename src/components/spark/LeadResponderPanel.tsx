// LeadResponderPanel — the Responder tab on the lead card.
//
// What the owner needs to know, in the order they need it:
//   1. did we answer this person?          (the promise: within a minute)
//   2. what did we say, or want to say?    (the drafted reply — send / edit / bin)
//   3. is there a price attached?          (the drafted quote and its total)
//   4. what was that based on?             (the audit line + the facts used)
//
// Tiers, in plain words rather than a lock icon:
//   · not entitled → what the Responder does and how to get it
//   · Essentials   → "we answered them and told you" + the line about drafts
//   · Growth       → drafts, waiting for a decision
//   · Authority    → the same, plus the ones that sent themselves
//
// The engine is called ARGUS AI. The model vendor is never named here.
import { useCallback, useEffect, useState } from "react";
import {
  Sparkles, CheckCircle2, Clock, AlertTriangle, Send, Pencil, Trash2,
  FileText, RefreshCw, Bell, Route, Info,
} from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { friendlyApiError } from "../../lib/leadgenBilling";

export interface ResponderDraft {
  draft_id: number;
  kind: "reply" | "quote";
  subject: string | null;
  body: string | null;
  grounded_on: Record<string, unknown> | null;
  quote_id: string | null;
  quote_total: number | null;
  quote_accept_url: string | null;
  intent: string | null;
  hold_reason: string | null;
  status: "draft" | "approved" | "sent" | "discarded";
  created_by: string;
  attribution: string;
  approved_by: string | null;
  sent_at: string | null;
  send_error: string | null;
  created_at: string;
}

export interface ResponderRun {
  run_id: string;
  status: string;
  rung: string | null;
  intent: string | null;
  acknowledged_at: string | null;
  alerted_at: string | null;
  journey_enrolled_at: string | null;
  drafted_at: string | null;
  cost_usd: number | null;
  decisions: Record<string, unknown> | null;
  error: string | null;
  triggered_at: string;
}

export interface ResponderPanelData {
  engine: string;
  attribution: string;
  entitled: boolean;
  entitlement_source: string;
  enabled: boolean;
  paused: boolean;
  paused_reason: string | null;
  plan: string;
  rung: string;
  can_draft: boolean;
  can_auto_send: boolean;
  auto_send_max_usd: number;
  run: ResponderRun | null;
  drafts: ResponderDraft[];
}

const HOLD_WORDS: Record<string, string> = {
  complaint_hold: "This one reads like a complaint, so it is waiting for you.",
  over_threshold: "This quote is over your send-by-itself limit, so it is waiting for you.",
  auto_send_off: "Sending by itself is switched off, so it is waiting for you.",
  not_authority: "Waiting for you to approve it.",
  guardrail: "Something in the draft did not pass our checks, so it is waiting for you.",
  no_recipient: "There is no email address on this inquiry to reply to.",
};

function money(n: number | null | undefined) {
  if (n == null) return "";
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function when(ts: string | null | undefined) {
  if (!ts) return null;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString();
}

function Line({ done, doneText, pendingText, icon: Icon }: {
  done: boolean; doneText: string; pendingText: string; icon: typeof Bell;
}) {
  return (
    <div className="flex items-start gap-2 text-xs">
      {done
        ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-600" />
        : <Clock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-400" />}
      <Icon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
      <span className={done ? "text-slate-700" : "text-slate-500"}>{done ? doneText : pendingText}</span>
    </div>
  );
}

interface Props {
  leadId: number | null;
  /** Called after anything changes so the inbox row and the Activity tab refresh. */
  onChanged?: () => void;
}

export function LeadResponderPanel({ leadId, onChanged }: Props) {
  const { get, post, patch, ready } = useSparkApi();
  const [data, setData] = useState<ResponderPanelData | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editSubject, setEditSubject] = useState("");

  const load = useCallback(async () => {
    if (!ready || !leadId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await get<{ data: ResponderPanelData }>(`/api/v1/leads/${leadId}/responder`);
      setData(r.data);
    } catch (err) {
      setError(friendlyApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [get, ready, leadId]);

  useEffect(() => { void load(); }, [load]);

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await load();
      onChanged?.();
    } catch (err) {
      setError(friendlyApiError(err).message);
    } finally {
      setBusy(null);
    }
  };

  const approve = (d: ResponderDraft, override?: { subject: string; body: string }) => act(`approve-${d.draft_id}`, async () => {
    await post(`/api/v1/leads/${leadId}/drafts/${d.draft_id}/approve`, override || {});
    setEditing(null);
  });

  const discard = (d: ResponderDraft) => act(`discard-${d.draft_id}`, async () => {
    await post(`/api/v1/leads/${leadId}/drafts/${d.draft_id}/discard`, {});
    setEditing(null);
  });

  const saveEdit = (d: ResponderDraft) => act(`save-${d.draft_id}`, async () => {
    await patch(`/api/v1/leads/${leadId}/drafts/${d.draft_id}`, { subject: editSubject, body: editBody });
    setEditing(null);
  });

  const runAgain = () => act("run", async () => {
    await post(`/api/v1/leads/${leadId}/responder/run`, {});
  });

  if (loading && !data) return <div className="text-sm text-slate-500">Loading…</div>;
  if (!data) {
    return (
      <div className="space-y-3">
        {error && <div className="rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">{error}</div>}
        <div className="text-sm text-slate-500">Nothing to show for this inquiry yet.</div>
      </div>
    );
  }

  const live = data.drafts.filter((d) => d.status === "draft" || d.status === "approved");
  const sent = data.drafts.filter((d) => d.status === "sent");
  const run = data.run;

  return (
    <div className="space-y-4">
      {error && <div className="rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">{error}</div>}

      {/* ── header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 rounded-lg border border-violet-200 bg-violet-50/60 p-3">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-violet-600" />
          <div>
            <div className="text-sm font-semibold text-slate-900">The Responder</div>
            <div className="text-xs text-slate-600">
              Answers every new inquiry within a minute, tells you it arrived, and writes the reply for you.
              {" "}Powered by {data.engine}.
            </div>
          </div>
        </div>
        <button
          onClick={runAgain}
          disabled={busy === "run" || !data.entitled || !data.enabled}
          className="flex flex-shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          title="Run the Responder on this inquiry again"
        >
          <RefreshCw className={`h-3 w-3 ${busy === "run" ? "animate-spin" : ""}`} />
          Try again
        </button>
      </div>

      {data.paused && (
        <div className="flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>{data.paused_reason || "The Responder is paused."} Switch it back on under Settings → Responder.</span>
        </div>
      )}

      {!data.entitled && (
        <div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          <div className="font-semibold text-slate-900">You don't have the Responder yet</div>
          <p className="mt-1">
            It answers every inquiry the minute it lands, writes the reply in your own words, and — with OLIVER —
            attaches a quote from your price list so one click sends it. Ask us to switch it on.
          </p>
        </div>
      )}

      {data.entitled && !data.enabled && (
        <div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          You have the Responder, but it is switched off. Turn it on under Settings → Responder.
        </div>
      )}

      {/* ── what happened ───────────────────────────────────────────────── */}
      <section className="rounded-lg border border-slate-200 bg-white p-3">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">What happened</h4>
        {!run && <div className="text-xs text-slate-500">The Responder has not run on this inquiry.</div>}
        {run && (
          <div className="space-y-1.5">
            <Line
              icon={Send}
              done={!!run.acknowledged_at}
              doneText={`We emailed them back at ${when(run.acknowledged_at)}`}
              pendingText="No acknowledgement was sent"
            />
            <Line
              icon={Bell}
              done={!!run.alerted_at}
              doneText={`You were told at ${when(run.alerted_at)}`}
              pendingText="No alert was sent to you"
            />
            <Line
              icon={Route}
              done={!!run.journey_enrolled_at}
              doneText="Added to your follow-up sequence"
              pendingText="Not added to a follow-up sequence"
            />
            {run.intent && (
              <div className="pt-1 text-xs text-slate-600">
                Reads like: <span className="font-medium text-slate-800">{run.intent.replace(/_/g, " ")}</span>
              </div>
            )}
            {run.error && <div className="pt-1 text-xs text-red-700">{run.error}</div>}
          </div>
        )}
      </section>

      {/* ── the drafts ──────────────────────────────────────────────────── */}
      {data.entitled && !data.can_draft && (
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          <div className="font-semibold text-slate-900">Want the reply written for you?</div>
          <p className="mt-1">
            On your current plan the Responder answers the customer and tells you. Move up and it also drafts the
            reply in your voice and, with OLIVER, attaches a quote from your price list — you just read it and press send.
          </p>
        </section>
      )}

      {live.map((d) => (
        <section key={d.draft_id} className="rounded-lg border border-slate-200 bg-white">
          <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
            <div className="flex items-center gap-2">
              {d.kind === "quote"
                ? <FileText className="h-3.5 w-3.5 text-emerald-600" />
                : <Send className="h-3.5 w-3.5 text-violet-600" />}
              <span className="text-xs font-semibold text-slate-900">
                {d.kind === "quote" ? `Draft quote — ${money(d.quote_total)}` : "Draft reply"}
              </span>
            </div>
            <span className="text-[11px] text-slate-500">{d.attribution}</span>
          </header>

          <div className="space-y-2 px-3 py-2.5">
            {d.hold_reason && (
              <div className="flex items-start gap-1.5 rounded bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
                <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
                <span>{HOLD_WORDS[d.hold_reason] || "Waiting for you to approve it."}</span>
              </div>
            )}

            {d.kind === "reply" && editing === d.draft_id ? (
              <div className="space-y-2">
                <input
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                  placeholder="Subject"
                />
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={8}
                  className="w-full rounded border border-slate-300 px-2 py-1 font-mono text-xs"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => saveEdit(d)}
                    disabled={busy === `save-${d.draft_id}`}
                    className="rounded bg-slate-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40"
                  >Save</button>
                  <button
                    onClick={() => approve(d, { subject: editSubject, body: editBody })}
                    disabled={busy === `approve-${d.draft_id}`}
                    className="rounded bg-violet-600 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40"
                  >Save &amp; send</button>
                  <button onClick={() => setEditing(null)} className="rounded border border-slate-300 px-2.5 py-1 text-xs">Cancel</button>
                </div>
              </div>
            ) : (
              <>
                {d.subject && <div className="text-xs font-medium text-slate-800">{d.subject}</div>}
                <div className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700">{d.body}</div>
              </>
            )}

            {d.grounded_on && (
              <details className="text-[11px] text-slate-500">
                <summary className="cursor-pointer select-none hover:text-slate-700">
                  <Info className="mr-1 inline h-3 w-3" />What this is based on
                </summary>
                <ul className="mt-1 space-y-0.5 pl-4">
                  {Object.entries(d.grounded_on)
                    .filter(([, v]) => v != null && v !== "")
                    .map(([k, v]) => (
                      <li key={k}>
                        <span className="text-slate-400">{k.replace(/_/g, " ")}:</span>{" "}
                        {Array.isArray(v) ? v.join(", ") : String(v)}
                      </li>
                    ))}
                </ul>
              </details>
            )}

            {d.send_error && (
              <div className="rounded bg-red-50 px-2 py-1.5 text-[11px] text-red-700">{d.send_error}</div>
            )}

            {editing !== d.draft_id && (
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={() => approve(d)}
                  disabled={busy === `approve-${d.draft_id}`}
                  className="flex items-center gap-1 rounded bg-violet-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-40"
                >
                  <Send className="h-3 w-3" />
                  {d.kind === "quote" ? "Approve & send quote" : "Approve & send"}
                </button>
                {d.kind === "reply" && (
                  <button
                    onClick={() => { setEditing(d.draft_id); setEditSubject(d.subject || ""); setEditBody(d.body || ""); }}
                    className="flex items-center gap-1 rounded border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    <Pencil className="h-3 w-3" />Edit
                  </button>
                )}
                {d.kind === "quote" && d.quote_id && (
                  <a
                    href={`/app/services/oliver_quotes?quote=${d.quote_id}`}
                    className="flex items-center gap-1 rounded border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    <FileText className="h-3 w-3" />Open in OLIVER
                  </a>
                )}
                <button
                  onClick={() => discard(d)}
                  disabled={busy === `discard-${d.draft_id}`}
                  className="flex items-center gap-1 rounded border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                >
                  <Trash2 className="h-3 w-3" />Discard
                </button>
              </div>
            )}
          </div>
        </section>
      ))}

      {sent.length > 0 && (
        <section className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
          <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-800">Sent</h4>
          <ul className="space-y-1 text-xs text-slate-700">
            {sent.map((d) => (
              <li key={d.draft_id} className="flex items-start gap-1.5">
                <CheckCircle2 className="mt-0.5 h-3 w-3 flex-shrink-0 text-emerald-600" />
                <span>
                  {d.kind === "quote" ? `Quote for ${money(d.quote_total)} sent` : "Reply sent"}
                  {d.sent_at ? ` at ${when(d.sent_at)}` : ""}
                  {d.approved_by ? ` by ${d.approved_by}` : ""}
                  {d.kind === "quote" && d.quote_accept_url && (
                    <> — <a className="underline" href={d.quote_accept_url} target="_blank" rel="noreferrer">the link the customer got</a></>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.can_auto_send && (
        <p className="text-[11px] text-slate-500">
          Quotes up to {money(data.auto_send_max_usd)} can send themselves. Anything above that, and anything that
          reads like a complaint, always waits for you.
        </p>
      )}
    </div>
  );
}

export default LeadResponderPanel;
