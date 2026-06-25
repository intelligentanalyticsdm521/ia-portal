// SparkLifecyclePage — Settings → CRM → Lifecycle.
//
// Single source of truth for the tenant's contact lifecycle config (per
// SCOPE_WORKING.md "ACTIVE: Customer Lifecycle"). Same controls as the
// onboarding modal's lifecycle step, accessible anytime post-onboarding.
//
// White-label rule: never says "Stripe" anywhere user-facing. Promotion to
// OLIVER customer happens silently in the background.
//
// Endpoints (oliver-api /lifecycle/*):
//   GET    /lifecycle/config         current preset + triggers + timeout
//   PATCH  /lifecycle/config         save changes
//   GET    /lifecycle/stage-counts   per-stage contact tallies

import { useEffect, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";

type Preset = "simple" | "moderate" | "detailed";

interface LifecycleConfig {
  preset: Preset;
  qualify_trigger: "manual" | "on_quote_or_meeting" | "every_lead";
  oliver_create_trigger: "eager" | "on_prospect" | "manual";
  past_customer_days: number;
  negotiation_trigger: "manual" | "on_counter_reply" | null;
  allowed_stages: string[];
  promotion_stage: string;
}

const PRESET_META: Record<Preset, { title: string; stages: string; summary: string }> = {
  simple: {
    title: "Simple — 5 stages",
    stages: "Lead → Prospect → Active Customer → Past Customer → Repeat Customer",
    summary: "Best for: solo operators, service businesses, anyone without a formal sales process.",
  },
  moderate: {
    title: "Moderate — 7 stages",
    stages: "Lead → Engaged → Qualified → Active → Past → Repeat",
    summary: "Best for: B2B with a sales cycle; separates warm leads from qualified prospects.",
  },
  detailed: {
    title: "Detailed — 9 stages",
    stages: "Lead → Engaged → Qualified → Proposal → Negotiation → Active → Past → Repeat",
    summary: "Best for: agencies, consultants, high-touch B2B with formal proposal/negotiation phases.",
  },
};

const STAGE_LABELS: Record<string, string> = {
  lead: "Lead",
  engaged_prospect: "Engaged Prospect",
  qualified_prospect: "Qualified Prospect",
  prospect: "Prospect",
  proposal_sent: "Proposal Sent",
  negotiation: "Negotiation",
  active_customer: "Active Customer",
  past_customer: "Past Customer",
  repeat_customer: "Repeat Customer",
  disqualified: "Disqualified",
};

// F5 — new founder-facing vocab (Brandon LOCK 2026-06-25). Migration 110
// widens core.tenant_lifecycle_config CK to accept BOTH legacy
// (simple|moderate|detailed) AND new (simplified|moderate|advanced) vocab
// during cutover. The F5 PUT /lifecycle/preset endpoint writes the new
// vocab; the legacy /lifecycle/config endpoint above still reads/writes
// the same row in legacy vocab.
type F5Preset = "simplified" | "moderate" | "advanced";

const F5_PRESET_META: Record<F5Preset, { title: string; stages: string; summary: string }> = {
  simplified: {
    title: "Simplified — 3 columns",
    stages: "Lead → Active Customer → Past Customer",
    summary: "Best for: solo operators, the bare-minimum flow.",
  },
  moderate: {
    title: "Moderate — 5 columns (recommended)",
    stages: "Lead → Qualified → Proposal Sent → Active Customer → Past Customer",
    summary: "Best for: most service businesses; matches the default IA founder flow.",
  },
  advanced: {
    title: "Advanced — 10 columns",
    stages: "Lead → Engaged → Qualified → Prospect → Proposal Sent → Proposal Lapsed → Negotiation → Active → Past → Repeat",
    summary: "Best for: agencies + consultants; full funnel with proposal-lapsed auto-transition.",
  },
};

export default function SparkLifecyclePage() {
  const { get, patch } = useOliverApi();
  const sparkApi = useSparkApi();
  const [cfg, setCfg] = useState<LifecycleConfig | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState<LifecycleConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [pendingPreset, setPendingPreset] = useState<Preset | null>(null);

  // F5 — new preset state. Hits LUMEN-API GET/PUT /lifecycle/preset.
  const [f5Preset, setF5Preset] = useState<F5Preset | null>(null);
  const [f5Saving, setF5Saving] = useState(false);
  const [f5Saved, setF5Saved] = useState(false);

  useEffect(() => {
    if (!sparkApi.ready) return;
    let cancelled = false;
    sparkApi.get<{ data: { preset: F5Preset; stages: string[] } }>("/api/v1/lifecycle/preset")
      .then((r) => { if (!cancelled) setF5Preset(r.data?.preset || "moderate"); })
      .catch(() => { if (!cancelled) setF5Preset("moderate"); });
    return () => { cancelled = true; };
  }, [sparkApi]);

  async function saveF5Preset(next: F5Preset) {
    setF5Saving(true);
    try {
      await sparkApi.put("/api/v1/lifecycle/preset", { preset: next });
      setF5Preset(next);
      setF5Saved(true);
      setTimeout(() => setF5Saved(false), 2000);
    } catch (e) {
      alert(`Save failed: ${(e as Error)?.message || "unknown"}`);
    } finally {
      setF5Saving(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([get<LifecycleConfig>("/lifecycle/config"), get<Record<string, number>>("/lifecycle/stage-counts")])
      .then(([c, n]) => {
        if (cancelled) return;
        setCfg(c);
        setDraft(c);
        setCounts(n);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [get]);

  if (!cfg || !draft) {
    return <SparkPageShell title="Lifecycle"><div className="p-6 text-sm text-slate-500">Loading…</div></SparkPageShell>;
  }

  const isModerate = draft.preset === "moderate";
  const isDetailed = draft.preset === "detailed";
  const promotionLabel = isModerate || isDetailed ? "Qualified Prospect" : "Prospect";
  const dirty = JSON.stringify(cfg) !== JSON.stringify(draft);

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      const updated = await patch<LifecycleConfig>("/lifecycle/config", {
        preset: draft.preset,
        qualify_trigger: draft.qualify_trigger,
        oliver_create_trigger: draft.oliver_create_trigger,
        past_customer_days: draft.past_customer_days,
        negotiation_trigger: draft.negotiation_trigger,
      });
      setCfg(updated);
      setDraft(updated);
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  function confirmPresetSwitch(newPreset: Preset) {
    if (!draft) return;
    const d = draft;
    if (newPreset === d.preset) return;
    // Show confirmation if downgrading away from a stage that has contacts.
    const downgrade =
      (d.preset === "detailed" && (newPreset === "moderate" || newPreset === "simple")) ||
      (d.preset === "moderate" && newPreset === "simple");
    const collapseStages = downgrade
      ? Object.entries(counts).filter(([s, n]) => n > 0 && !["lead","active_customer","past_customer","repeat_customer","disqualified","prospect"].includes(s)).map(([s, n]) => `${STAGE_LABELS[s]} (${n})`)
      : [];
    if (downgrade && collapseStages.length) {
      setPendingPreset(newPreset);
      return;
    }
    setDraft({ ...d, preset: newPreset, negotiation_trigger: newPreset === "detailed" ? (d.negotiation_trigger || "manual") : null });
  }

  return (
    <SparkPageShell title="Lifecycle" subtitle="How contacts move from first contact through paid.">
      <div className="p-6 space-y-6 max-w-4xl">
        {/* F5 — Lead Pipeline preset (Brandon LOCK 2026-06-25). Controls the
            SPARK Contacts kanban + Customer modal dropdown. Default is
            'moderate'. Saves immediately on click (no Save button). */}
        {f5Preset && (
          <section className="space-y-2 rounded-lg border border-orange-200 bg-orange-50/40 p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-slate-700">Lead Pipeline preset</h2>
              {f5Saved && <span className="text-xs text-emerald-700">Saved.</span>}
              {f5Saving && <span className="text-xs text-slate-500">Saving…</span>}
            </div>
            <p className="text-xs text-slate-600">
              Determines the columns the SPARK Contacts kanban renders and the stages
              available on each contact&apos;s lifecycle dropdown.
            </p>
            {(Object.keys(F5_PRESET_META) as F5Preset[]).map((id) => {
              const active = f5Preset === id;
              const meta = F5_PRESET_META[id];
              return (
                <button
                  key={id}
                  onClick={() => !f5Saving && !active && saveF5Preset(id)}
                  disabled={f5Saving}
                  className={`w-full text-left rounded-lg border-2 p-3 transition ${
                    active ? "border-orange-500 bg-white" : "border-slate-200 bg-white hover:border-orange-300"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className={`mt-1 inline-block h-3 w-3 rounded-full border-2 ${
                      active ? "bg-orange-500 border-orange-500" : "border-slate-400"
                    }`} />
                    <div className="flex-1">
                      <div className="font-semibold text-sm">{meta.title}</div>
                      <div className="text-xs text-slate-600 mt-0.5">{meta.stages}</div>
                      <div className="text-xs text-slate-500 mt-1">{meta.summary}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </section>
        )}

        {/* Preset picker (legacy oliver-api config — kept until cutover walks clean) */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-700">1. Pick your flow</h2>
          {(Object.keys(PRESET_META) as Preset[]).map((id) => {
            const active = draft.preset === id;
            const meta = PRESET_META[id];
            return (
              <button
                key={id}
                onClick={() => confirmPresetSwitch(id)}
                className={`w-full text-left rounded-lg border-2 p-3 transition ${active ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:border-slate-400"}`}
              >
                <div className="flex items-start gap-2">
                  <span className={`mt-1 inline-block h-3 w-3 rounded-full border-2 ${active ? "bg-slate-900 border-slate-900" : "border-slate-400"}`} />
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{meta.title}</div>
                    <div className="text-xs text-slate-600 mt-0.5">{meta.stages}</div>
                    <div className="text-xs text-slate-500 mt-1">{meta.summary}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </section>

        {/* Stage counts */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-700">2. Your contacts right now</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {draft.allowed_stages.map((s) => (
              <div key={s} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <div className="text-xs text-slate-500">{STAGE_LABELS[s] || s}</div>
                <div className="text-lg font-semibold text-slate-900">{counts[s] || 0}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Past-customer days slider */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-700">3. When do Active Customers go to Past?</h2>
          <p className="text-xs text-slate-600">
            All subscriptions cancelled AND no activity for <b>{draft.past_customer_days}</b> days.
          </p>
          <input
            type="range" min={30} max={365} step={1}
            value={draft.past_customer_days}
            onChange={(e) => setDraft({ ...draft, past_customer_days: Number(e.target.value) })}
            className="w-full max-w-md"
          />
        </section>

        {/* Configurable transitions */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">4. When YOU decide a Lead is ready</h2>
          <div className="space-y-1.5">
            {[
              { id: "manual",              label: "I'll click \"Qualify\" myself  (recommended)" },
              { id: "on_quote_or_meeting", label: "Auto-qualify when they request a quote or book a meeting" },
              { id: "every_lead",          label: "Every Lead is automatically a Prospect" },
            ].map((opt) => (
              <label key={opt.id} className="flex items-start gap-2 text-sm">
                <input type="radio" name="qualify_trigger" checked={draft.qualify_trigger === opt.id}
                       onChange={() => setDraft({ ...draft, qualify_trigger: opt.id as LifecycleConfig["qualify_trigger"] })} className="mt-1" />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>

          <h2 className="text-sm font-semibold text-slate-700 pt-2">When should they be added as an OLIVER customer?</h2>
          <div className="space-y-1.5">
            {[
              { id: "on_prospect", label: `When they become a ${promotionLabel}  (recommended)` },
              { id: "eager",       label: "Right away when they're a Lead" },
              { id: "manual",      label: "Only when I click \"Add to OLIVER\"" },
            ].map((opt) => (
              <label key={opt.id} className="flex items-start gap-2 text-sm">
                <input type="radio" name="oliver_create_trigger" checked={draft.oliver_create_trigger === opt.id}
                       onChange={() => setDraft({ ...draft, oliver_create_trigger: opt.id as LifecycleConfig["oliver_create_trigger"] })} className="mt-1" />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>

          {isDetailed && (
            <>
              <h2 className="text-sm font-semibold text-slate-700 pt-2">When does a Proposal move to Negotiation?</h2>
              <div className="space-y-1.5">
                {[
                  { id: "manual",           label: "I'll move it manually  (recommended)" },
                  { id: "on_counter_reply", label: "Auto when they reply with changes  (Coming soon)", disabled: true },
                ].map((opt) => (
                  <label key={opt.id} className="flex items-start gap-2 text-sm">
                    <input type="radio" name="negotiation_trigger"
                           checked={(draft.negotiation_trigger || "manual") === opt.id}
                           onChange={() => setDraft({ ...draft, negotiation_trigger: opt.id as LifecycleConfig["negotiation_trigger"] })}
                           className="mt-1" disabled={opt.disabled} />
                    <span className={opt.disabled ? "text-slate-400" : ""}>{opt.label}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </section>

        {/* Save bar */}
        <div className="sticky bottom-0 bg-white border-t border-slate-200 -mx-6 px-6 py-3 flex items-center gap-2">
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          {!dirty && !savedToast && <span className="text-xs text-slate-500">No unsaved changes.</span>}
          {savedToast && <span className="text-xs text-emerald-600">Saved.</span>}
        </div>
      </div>

      {/* Preset-downgrade confirmation modal */}
      {pendingPreset && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-5 space-y-3">
            <h3 className="text-lg font-semibold">Switch to {PRESET_META[pendingPreset].title}?</h3>
            <p className="text-sm text-slate-700">
              Stages that don't exist in the new preset will be collapsed to the nearest parent stage.
              Existing contacts won't be lost — they'll just be remapped.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setPendingPreset(null)} className="text-sm text-slate-600 px-3 py-1.5">Cancel</button>
              <button
                onClick={() => {
                  setDraft({ ...draft!, preset: pendingPreset, negotiation_trigger: pendingPreset === "detailed" ? (draft!.negotiation_trigger || "manual") : null });
                  setPendingPreset(null);
                }}
                className="rounded-md bg-slate-900 text-white text-sm px-3 py-1.5"
              >
                Switch
              </button>
            </div>
          </div>
        </div>
      )}
    </SparkPageShell>
  );
}
