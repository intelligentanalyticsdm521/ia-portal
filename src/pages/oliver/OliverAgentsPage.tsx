// OliverAgentsPage — Settings -> OLIVER -> Agents (/app/services/oliver_agents)
//
// One page that answers the question the capability map found nobody could
// answer from the Portal: *you told me I have agents; where do I see what they
// did?* Three OLIVER agents, one activity list, the same Approve & send / Edit
// / Decline the Responder already taught.
//
// FETCHING: once per page, both calls in one go, api object memoised by the
// hook (convention_data_fetching).
//
// DECISIONS GO TO THE AGENTS' OWN ROUTES, not to a second approval path:
//   QTC      POST /qtc-agent/queue/:id/approve | /reject
//   FieldOps POST /fieldops-agent/suggestions/:id/accept | /dismiss
// Those routes re-check the source (a paid invoice never gets chased) and
// re-check availability at accept time (the double-booking hole). Copying the
// decision here would be copying the place those checks can be forgotten.
import { useCallback, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { AgentActivityPanel } from "../../components/agents/AgentActivityPanel";
import { AgentSettingsRow } from "../../components/agents/AgentSettingsRow";
import { apiErrorMessage } from "../../lib/apiErrorMessage";
import type {
  AgentActivityPayload, AgentActivityRow, AgentKnob, AgentSettingsResponse,
} from "../../components/agents/types";

const KNOBS: Record<string, AgentKnob[]> = {
  qtc: [
    {
      field: "quote_followup_days",
      label: "Chase a quote after",
      hint: "How long to wait for an answer before it writes the first nudge.",
      min: 1, max: 90, suffix: "days",
    },
    {
      field: "dunning_days_csv",
      label: "Remind about an unpaid invoice after",
      hint: "Days past due, separated by commas. Three reminders at most.",
      type: "text", placeholder: "3,7,14", suffix: "days overdue",
    },
  ],
  fieldops: [
    {
      field: "confidence_percent",
      label: "Only name someone when it is at least",
      hint: "Below this it hands the job back to you instead of guessing.",
      min: 0, max: 100, suffix: "% sure",
    },
  ],
};

/** Approving a QTC draft queues the email; approving a suggestion assigns. */
const APPROVE_LABELS: Record<string, string> = {
  qtc: "Approve & send",
  fieldops: "Approve & assign",
};

export function OliverAgentsPage() {
  const api = useOliverApi();
  const { get, post, put, ready } = api;
  const [activity, setActivity] = useState<AgentActivityPayload | null>(null);
  const [settings, setSettings] = useState<AgentSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      // useOliverApi STRIPS the { data: … } envelope, so these generics are
      // the payload itself. Declaring { data: … } here is the double-unwrap
      // bug the no-double-unwrap test exists to catch.
      const [a, s] = await Promise.all([
        get<AgentActivityPayload>("/agents/activity"),
        get<AgentSettingsResponse>("/agents/settings"),
      ]);
      setActivity(a);
      setSettings(s);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [get, ready]);

  useEffect(() => { void load(); }, [load]);

  const act = async (key: string, fn: () => Promise<void>, done: string) => {
    setBusy(key);
    setNotice(null);
    try {
      await fn();
      setNotice(done);
      await load();
    } catch (err) {
      setNotice(apiErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const approve = (row: AgentActivityRow, edits?: { subject?: string; body?: string }) =>
    act(`approve-${row.agent}-${row.id}`, async () => {
      if (row.agent === "qtc") {
        await post(`/qtc-agent/queue/${row.id}/approve`,
          edits ? { subject_line: edits.subject, message_body: edits.body } : {});
      } else if (row.agent === "fieldops") {
        await post(`/fieldops-agent/suggestions/${row.id}/accept`, {});
      }
    }, row.agent === "qtc" ? "Sent." : "Assigned.");

  const decline = (row: AgentActivityRow, note: string) =>
    act(`decline-${row.agent}-${row.id}`, async () => {
      if (row.agent === "qtc") {
        await post(`/qtc-agent/queue/${row.id}/reject`, { reason: note });
      } else if (row.agent === "fieldops") {
        await post(`/fieldops-agent/suggestions/${row.id}/dismiss`, { reason: note });
      }
    }, "Noted — it will not send that one.");

  const saveAgent = async (agentKey: string, patch: Record<string, unknown>) => {
    setSaving(true);
    setNotice(null);
    try {
      const r = await put<AgentSettingsResponse>("/agents/settings", { [agentKey]: patch });
      setSettings(r);
    } catch (err) {
      setNotice(apiErrorMessage(err));
      await load();
    } finally {
      setSaving(false);
    }
  };

  const oversight = activity?.meta.oversight;
  const oversightNote = oversight
    ? oversight.checked === 0
      ? "It has not had anything to check yet."
      : `Checked ${oversight.checked} ${oversight.checked === 1 ? "run" : "runs"}, flagged ${oversight.flagged}.` +
        (oversight.last_checked_at ? ` Last check ${new Date(oversight.last_checked_at).toLocaleString()}.` : "")
    : null;

  return (
    <OliverPageWrapper
      title="Agents"
      subtitle="What your agents did, and anything waiting on you"
      error={error}
      loading={loading && !activity}
    >
      <div className="space-y-5">
        <div className="flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50/60 p-3">
          <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-violet-600" />
          <div className="text-xs text-slate-700">
            <div className="text-sm font-semibold text-slate-900">Your OLIVER agents</div>
            They do the chasing and the sorting; you keep the last word. Nothing here goes out
            until you press the button. Powered by {activity?.meta.engine || settings?.engine || "ARGUS AI"}.
          </div>
        </div>

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
          emptyBody="When an agent writes a follow-up or picks someone for a job, it lands here first."
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
                footnote={agent.key === "governance" ? oversightNote : null}
                onToggle={agent.read_only ? undefined : (enabled) => saveAgent(agent.key, { enabled })}
                onKnob={agent.read_only ? undefined : (field, value) => saveAgent(agent.key, { [field]: value })}
                onResume={agent.paused ? () => saveAgent(agent.key, { paused: false }) : undefined}
              />
            ))}
          </div>
        </section>
      </div>
    </OliverPageWrapper>
  );
}

export default OliverAgentsPage;
