// SparkAgentsPage — Settings -> SPARK -> Agents (/app/services/spark_agents)
//
// The SPARK half of the same page OLIVER gets: what the agents did, what is
// waiting, and the switches. Same components, same three buttons, so a client
// who has learned one product's Agents page has learned all of them.
//
// TWO THINGS ARE DELIBERATELY NOT HERE:
//   · a second copy of the Responder's switches — it has its own page, and two
//     places to set one thing is how they end up disagreeing. Its row links.
//   · a second Approve & send for a Responder draft. That decision lives on the
//     lead card, where the send path and its guards already are. Those rows
//     show up under "Waiting for you" with an "Open it" link straight to the
//     inquiry (the Lead Inbox takes ?lead=<id> for exactly this).
import { useCallback, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { AgentActivityPanel } from "../../components/agents/AgentActivityPanel";
import { AgentSettingsRow } from "../../components/agents/AgentSettingsRow";
import { apiErrorMessage } from "../../lib/apiErrorMessage";
import type {
  AgentActivityPayload, AgentActivityRow, AgentKnob, AgentSettingsResponse,
} from "../../components/agents/types";

const KNOBS: Record<string, AgentKnob[]> = {
  campaign: [
    {
      field: "campaigns_per_cycle",
      label: "Draft at most",
      hint: "How many campaigns it may put in front of you in one round.",
      min: 1, max: 8, suffix: "a round",
    },
    {
      field: "winback_days_since_job",
      label: "Treat a customer as quiet after",
      hint: "How long since their last job before it tries to win them back.",
      min: 7, max: 730, suffix: "days",
    },
    {
      field: "min_cohort_size",
      label: "Do not bother for fewer than",
      hint: "Too small a group is not worth a campaign — it skips and says so.",
      min: 1, max: 500, suffix: "customers",
    },
  ],
};

// Approving a campaign draft creates a DRAFT campaign; it sends nothing (AC9).
// The button says what actually happens.
const APPROVE_LABELS: Record<string, string> = {
  campaign: "Approve & create the draft",
};

export function SparkAgentsPage() {
  const { get, post, put, ready } = useSparkApi();
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
      // sparkApi deliberately does NOT strip the envelope, so reading `.data`
      // here is correct — the opposite of the OLIVER page one file over.
      const [a, s] = await Promise.all([
        get<{ data: AgentActivityPayload }>("/api/v1/agents/activity?product=spark"),
        get<{ data: AgentSettingsResponse }>("/api/v1/agents/settings?product=spark"),
      ]);
      setActivity(a.data);
      setSettings(s.data);
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
      if (row.agent === "campaign") {
        await post(`/api/v1/campaign-agent/queue/${row.id}/approve`,
          edits ? { subject_line: edits.subject, body_html: edits.body } : {});
      }
    }, "Draft campaign created. Open it when you are ready to send.");

  const decline = (row: AgentActivityRow, note: string) =>
    act(`decline-${row.agent}-${row.id}`, async () => {
      if (row.agent === "campaign") {
        await post(`/api/v1/campaign-agent/queue/${row.id}/reject`, { reason: note });
      }
    }, "Noted — it will not build that one.");

  const saveAgent = async (agentKey: string, patch: Record<string, unknown>) => {
    setSaving(true);
    setNotice(null);
    try {
      const r = await put<{ data: AgentSettingsResponse }>("/api/v1/agents/settings", { [agentKey]: patch });
      setSettings(r.data);
    } catch (err) {
      setNotice(apiErrorMessage(err));
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <SparkPageShell
      title="Agents"
      subtitle="What your agents did, and anything waiting on you"
      error={error}
      loading={loading && !activity}
    >
      <div className="space-y-5">
        <div className="flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50/60 p-3">
          <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-violet-600" />
          <div className="text-xs text-slate-700">
            <div className="text-sm font-semibold text-slate-900">Your SPARK agents</div>
            They write; you decide. Approving a campaign here creates the draft — sending it is
            still a separate press, in the composer. Powered by {activity?.meta.engine || settings?.engine || "ARGUS AI"}.
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
          emptyBody="When an agent drafts a campaign or a reply, it lands here first."
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
                onToggle={agent.read_only ? undefined : (enabled) => saveAgent(agent.key, { enabled })}
                onKnob={agent.read_only ? undefined : (field, value) => saveAgent(agent.key, { [field]: value })}
                onResume={agent.paused ? () => saveAgent(agent.key, { paused: false }) : undefined}
              />
            ))}
          </div>
        </section>
      </div>
    </SparkPageShell>
  );
}

export default SparkAgentsPage;
