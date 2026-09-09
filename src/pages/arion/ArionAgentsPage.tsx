// ArionAgentsPage — Settings -> ARION -> Agents (/app/services/arion_agents)
//
// This page used to be an honest "Content & Social Agent — coming" row, because
// the agent was real, tested and merged and there was NO screen for any of it:
// no list of drafts waiting, no run history, no "what has it learned about this
// client", no way to switch it on. The API existed and only a script could reach
// it.
//
// It is now the same three components the OLIVER and SPARK pages use — plus two
// this agent needs that the others do not:
//
//   HELD DRAFTS, VISIBLY APART. A unit that crossed a boundary is returned by the
//   server in its own `escalated` collection (AC2) and rendered in its own
//   section here, with no approve button. A held draft sitting in the normal list
//   is exactly the mistake escalation exists to prevent.
//
//   PUBLISH IS A SECOND PRESS. Approving writes YOUR wording as the version that
//   will publish and schedules NOTHING (AC8). The Publish button appears only
//   after approval and says what it does. Two verbs, two presses, on purpose:
//   the agent must never be able to put something on a client's website because
//   somebody clicked once.
//
// FETCHING: once per page, all four calls in one go, and arionApi does NOT strip
// the { data: … } envelope — so every read here goes through `.data`. That is the
// opposite of the OLIVER page one folder over, and getting it backwards is the
// double-unwrap bug.
//
// ServiceRouter already wraps every ARION page in ArionPageWrapper, so this file
// renders the body only — wrapping again would stack two headers.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Sparkles, BookOpen, Send, AlertTriangle } from "lucide-react";
import { ArionApiError, type ArionLearnedVoice } from "../../lib/arionApi";
import { useArionAgentsApi } from "./useArionAgentsApi";
import { AgentActivityPanel } from "../../components/agents/AgentActivityPanel";
import { AgentSettingsRow } from "../../components/agents/AgentSettingsRow";
import { AgentRunHistoryPanel } from "../../components/agents/AgentRunHistoryPanel";
import type {
  AgentActivityPayload, AgentActivityRow, AgentKnob, AgentRunsPayload,
  AgentSettingsResponse,
} from "../../components/agents/types";

const KNOBS: Record<string, AgentKnob[]> = {
  content: [
    {
      field: "posts_per_week",
      label: "Write at most",
      hint: "How many pieces it may put in front of you each week.",
      min: 1, max: 14, suffix: "a week",
    },
    {
      field: "price_usd_monthly",
      label: "What this business pays for it",
      hint: "Dollars a month. Leave it blank and we cannot tell you whether it is earning its keep.",
      type: "text", placeholder: "e.g. 199", suffix: "a month",
    },
  ],
};

const APPROVE_LABELS: Record<string, string> = {
  content: "Approve this wording",
};

/** Plain words for what the agent has worked out about a business's voice. */
function LearnedVoice({ voice }: { voice: ArionLearnedVoice | null }) {
  const d = voice?.data;
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start gap-2">
        <BookOpen className="mt-0.5 h-4 w-4 flex-shrink-0 text-violet-600" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-slate-900">What it has learned about your writing</div>
          {!d ? (
            <p className="mt-1 text-[11px] text-slate-600">
              Nothing yet. Every time you edit a draft or turn one down with a reason, it keeps the
              before and after and folds it in the following week. Until then it writes from the
              brand voice you wrote down.
            </p>
          ) : (
            <>
              <p className="mt-1 text-[11px] text-slate-600">
                {d.evidence_count} {d.evidence_count === 1 ? "thing" : "things"} you have decided,
                folded into version {d.version}.
                {d.confidence != null && d.confidence > 0
                  ? " It is leaning on this when it writes."
                  : " Not enough yet to lean on, so it still writes from the brand voice you wrote down."}
              </p>
              <ul className="mt-1 space-y-0.5 text-[11px] text-slate-600">
                {d.formatting?.measured ? (
                  <>
                    {"avgSentenceWords" in (d.formatting.measured as Record<string, unknown>) && (
                      <li>
                        · Your sentences run about{" "}
                        {String((d.formatting.measured as Record<string, unknown>).avgSentenceWords)} words.
                      </li>
                    )}
                    {"usesHeadings" in (d.formatting.measured as Record<string, unknown>) && (
                      <li>
                        · You {(d.formatting.measured as Record<string, unknown>).usesHeadings ? "use" : "do not use"} section headings.
                      </li>
                    )}
                  </>
                ) : null}
                {d.exemplar_count > 0 && (
                  <li>· It keeps {d.exemplar_count} of your actual edits as examples to write like.</li>
                )}
                {d.vocabulary_banned_count > 0 && (
                  <li>· {d.vocabulary_banned_count} words it will now avoid, because you took them out.</li>
                )}
              </ul>
            </>
          )}
          <p className="mt-2 text-[11px] text-slate-400">
            Nothing here is guessed. Every line comes from something you actually did.
          </p>
        </div>
      </div>
    </section>
  );
}

export function ArionAgentsPage() {
  const api = useArionAgentsApi();
  const { ready, loadAll } = api;

  const [activity, setActivity] = useState<
    (AgentActivityPayload & { escalated: AgentActivityRow[] }) | null
  >(null);
  const [runs, setRuns] = useState<AgentRunsPayload | null>(null);
  const [settings, setSettings] = useState<AgentSettingsResponse | null>(null);
  const [voice, setVoice] = useState<ArionLearnedVoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const out = await loadAll();
      setActivity(out.activity);
      setRuns(out.runs);
      setSettings(out.settings);
      setVoice(out.voice);
    } catch (err) {
      setError(err instanceof ArionApiError ? err.message : "Unable to load your agents.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [loadAll, ready]);

  useEffect(() => { void load(); }, [load]);

  const act = async (key: string, fn: () => Promise<void>, done: string) => {
    setBusy(key);
    setNotice(null);
    try {
      await fn();
      setNotice(done);
      await load();
    } catch (err) {
      setNotice(err instanceof ArionApiError ? err.message : "That did not work.");
    } finally {
      setBusy(null);
    }
  };

  const approve = (row: AgentActivityRow, edits?: { subject?: string; body?: string }) =>
    act(`approve-content-${row.id}`, async () => {
      // The card's generic field names, mapped to this agent's. YOUR wording
      // becomes what publishes; the agent's original is kept beside it.
      await api.approve(row.id, edits ? { title: edits.subject, body_markdown: edits.body } : undefined);
    }, "Saved as approved. Putting it live is the next button — nothing has gone live yet.");

  const decline = (row: AgentActivityRow, note: string) =>
    act(`decline-content-${row.id}`, async () => {
      await api.reject(row.id, note);
    }, "Noted. It learns from the reason you gave.");

  const publish = (row: AgentActivityRow) =>
    act(`publish-content-${row.id}`, async () => {
      await api.publish(row.id);
    }, "Sent to your website.");

  const saveAgent = async (patch: Record<string, unknown>) => {
    setSaving(true);
    setNotice(null);
    try {
      setSettings(await api.saveSettings(patch));
    } catch (err) {
      setNotice(err instanceof ArionApiError ? err.message : "That did not save.");
      await load();
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    setRunning(true);
    setNotice(null);
    try {
      await api.runNow();
      setNotice("It has had a look. Anything it wrote is above.");
      await load();
    } catch (err) {
      setNotice(err instanceof ArionApiError ? err.message : "It could not run just now.");
    } finally {
      setRunning(false);
    }
  };

  /** Approved and waiting to go live — the second press. */
  const awaitingPublish = useMemo(
    () => (activity?.rows || []).filter((r) => r.can_publish),
    [activity],
  );

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-1">
      <div className="flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50/60 p-3">
        <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-violet-600" />
        <div className="text-xs text-slate-700">
          <div className="text-sm font-semibold text-slate-900">Your ARION agents</div>
          It writes for your website in your own voice and shows you every piece first. Approving
          keeps your wording; putting it live is a separate press.
          Powered by {activity?.meta.engine || settings?.engine || "ARGUS AI"}.
        </div>
      </div>

      {error && (
        <div className="rounded border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-900">{error}</div>
      )}
      {notice && (
        <div className="rounded border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-700">{notice}</div>
      )}

      <AgentActivityPanel
        activity={activity}
        loading={loading}
        busy={busy}
        approveLabels={APPROVE_LABELS}
        onApprove={approve}
        onDecline={decline}
        emptyTitle="Nothing needs you right now."
        emptyBody="When it writes something for your website, it lands here first."
      />

      {/* Approved, still yours. Kept separate from "waiting for you" because a
          thing you already said yes to is not a decision, it is an errand. */}
      {awaitingPublish.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Approved, ready to go live ({awaitingPublish.length})
          </h3>
          <ul className="space-y-2">
            {awaitingPublish.map((row) => (
              <li key={row.id} className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2">
                <Send className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-600" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-slate-900">{row.summary}</div>
                  <div className="text-[11px] text-slate-600">{row.hold_note || row.status_label}</div>
                  {row.detail?.needs_manual_render && (
                    <div className="mt-0.5 text-[11px] text-amber-800">
                      The words are ready; the picture slides still need making by hand.
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => publish(row)}
                  disabled={busy === `publish-content-${row.id}`}
                  className="flex-shrink-0 rounded border border-emerald-300 bg-white px-2.5 py-1 text-[11px] font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-40"
                >
                  {busy === `publish-content-${row.id}` ? "Sending…" : "Put it live"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* AC2 — held back, and it must LOOK held back. No approve button exists
          for these; the server refuses them too, so the two agree. */}
      {activity?.escalated && activity.escalated.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            Held back for a person to read ({activity.escalated.length})
          </h3>
          <ul className="space-y-2">
            {activity.escalated.map((row) => (
              <li key={row.id} className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
                <div className="text-xs font-medium text-slate-900">{row.summary}</div>
                <div className="mt-0.5 text-[11px] text-amber-900">{row.hold_note}</div>
                {row.detail?.why && <div className="mt-1 text-[11px] text-slate-600">{row.detail.why}</div>}
                <div className="mt-1 text-[11px] text-slate-500">
                  These are not approvable from here on purpose. Read it, and if the wording is
                  wrong, turn it down with a reason so it learns.
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <LearnedVoice voice={voice} />

      <AgentRunHistoryPanel
        runs={runs}
        loading={loading}
        emptyBody="It has not run yet. Press Run it now below and it will write its first entry here."
      />

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Your agents</h3>
        <div className="space-y-3">
          {settings?.agents.map((agent) => (
            <AgentSettingsRow
              key={agent.key}
              agent={agent}
              knobs={KNOBS[agent.key]}
              saving={saving}
              running={running}
              onToggle={(enabled) => saveAgent({ enabled })}
              onKnob={(field, value) => saveAgent({ [field]: value })}
              onResume={agent.paused ? () => saveAgent({ paused: false }) : undefined}
              onRunNow={runNow}
            />
          ))}
        </div>
      </section>

      <p className="text-xs text-slate-500">
        Your other agents live with the product they work in: quote and payment follow-ups and
        job assignments under OLIVER, campaigns and the Responder under SPARK.
      </p>
    </div>
  );
}

export default ArionAgentsPage;
