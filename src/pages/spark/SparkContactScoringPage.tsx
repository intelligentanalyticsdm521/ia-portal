// SparkContactScoringPage — Tenant contact score weight tuning (F-1xx).
//
// Surfaces the 6-dimension contact intelligence weight model so tenants can
// re-balance how much each signal (engagement, lifecycle stage, revenue,
// recency, channel diversity, quality flags) contributes to the composite
// score the CRM uses to bucket contacts into X/Y/Z tiers.
//
// Backend (LUMEN-API):
//   GET  /api/v1/tenant/contact-score-weights → { weight_engagement, weight_lifecycle_stage,
//        weight_revenue, weight_recency, weight_channel_diversity, weight_quality_flags, is_default }
//   POST /api/v1/tenant/contact-score-weights  validates sum === 100, persists per-tenant override
//
// Save is gated until the six weights add up to exactly 100. The defaults
// match the platform baseline (contactScorer.js DEFAULT_WEIGHTS).
//
// The re-rank preview below the sliders is an APPROXIMATION. The contacts
// API doesn't return per-dimension breakdowns, so we exactly compute the two
// dimensions that are client-derivable (recency from contact_intelligence_updated_at,
// quality_flags from email/phone/name/company + opt-out flags using the same
// formula as contactScorer.js) and back-solve the remaining four dimensions
// from the current composite. Contacts with identical current scores will
// project to identical new scores; contacts whose recency/quality differ
// will diverge — enough signal to surface "saving these weights moves
// roughly N contacts up/down" without a backend simulate endpoint.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { RotateCcw, Save, AlertTriangle, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

// ─ Types ──────────────────────────────────────────────────────────────────────
interface Weights {
  weight_engagement: number;
  weight_lifecycle_stage: number;
  weight_revenue: number;
  weight_recency: number;
  weight_channel_diversity: number;
  weight_quality_flags: number;
}

interface WeightsResponse {
  data: Weights & { is_default: boolean };
}

interface ScoredContact {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  company: string | null;
  contact_intelligence_score: number;
  contact_intelligence_tier: string | null;
  contact_intelligence_updated_at: string | null;
  // Mirrored from /api/v1/contacts when available
  email_invalid?: boolean;
  email_unsubscribed?: boolean;
  sms_unsubscribed?: boolean;
}

interface ContactsResponse {
  data: ScoredContact[];
  meta?: { total: number };
}

// ─ Defaults (must mirror LUMEN-API contactScorer.js DEFAULT_WEIGHTS) ────────
const DEFAULTS: Weights = {
  weight_engagement: 25,
  weight_lifecycle_stage: 20,
  weight_revenue: 20,
  weight_recency: 15,
  weight_channel_diversity: 10,
  weight_quality_flags: 10,
};

const DIMENSIONS: Array<{
  key: keyof Weights;
  label: string;
  blurb: string;
}> = [
  { key: "weight_engagement",        label: "Engagement",        blurb: "Opens, clicks, replies, form fills, page visits (90d, decayed)." },
  { key: "weight_lifecycle_stage",   label: "Lifecycle Stage",   blurb: "Customer-flow stage weight (lead → opportunity → customer → champion)." },
  { key: "weight_revenue",           label: "Revenue (LTV)",     blurb: "Lifetime paid invoices from OLIVER. Log-scaled $0 → $50K+." },
  { key: "weight_recency",           label: "Recency",           blurb: "Days since last engagement event (7d→100, 180d+→5)." },
  { key: "weight_channel_diversity", label: "Channel Diversity", blurb: "How many channels (email/SMS/forms/web) saw activity in 180d." },
  { key: "weight_quality_flags",     label: "Quality Flags",     blurb: "Bonuses for complete record + valid email; penalties for opt-outs/invalid." },
];

// ─ Page ───────────────────────────────────────────────────────────────────────
export function SparkContactScoringPage() {
  const { get, post, ready } = useSparkApi();

  // Saved server state (the weights currently driving production scoring).
  // Used as the basis for back-solving each contact's dimensions in the preview.
  const [serverWeights, setServerWeights] = useState<Weights | null>(null);
  const [isDefault, setIsDefault] = useState<boolean>(true);

  // Working draft — what the sliders show.
  const [draft, setDraft] = useState<Weights>(DEFAULTS);

  const [contacts, setContacts] = useState<ScoredContact[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // ─ Load weights + top 20 contacts (single pageload) ─────────────────────
  const reload = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const [wRes, cRes] = await Promise.all([
        get<WeightsResponse>("/api/v1/tenant/contact-score-weights"),
        // Top 20 scored contacts. /api/v1/intelligence/contacts already
        // returns scored contacts ordered by score DESC server-side.
        get<ContactsResponse>("/api/v1/intelligence/contacts?limit=20"),
      ]);
      const w: Weights = {
        weight_engagement: wRes.data.weight_engagement,
        weight_lifecycle_stage: wRes.data.weight_lifecycle_stage,
        weight_revenue: wRes.data.weight_revenue,
        weight_recency: wRes.data.weight_recency,
        weight_channel_diversity: wRes.data.weight_channel_diversity,
        weight_quality_flags: wRes.data.weight_quality_flags,
      };
      setServerWeights(w);
      setDraft(w);
      setIsDefault(wRes.data.is_default);
      setContacts(cRes.data || []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [get, ready]);

  useEffect(() => { reload(); }, [reload]);

  // ─ Sum + save guard ──────────────────────────────────────────────────────
  const sum = useMemo(
    () => DIMENSIONS.reduce((acc, d) => acc + (draft[d.key] || 0), 0),
    [draft]
  );
  const sumValid = sum === 100;
  const dirty = useMemo(() => {
    if (!serverWeights) return false;
    return DIMENSIONS.some(d => draft[d.key] !== serverWeights[d.key]);
  }, [draft, serverWeights]);

  function updateWeight(key: keyof Weights, value: number) {
    setDraft(prev => ({ ...prev, [key]: Math.max(0, Math.min(100, Math.round(value))) }));
    setSaveMsg(null);
  }

  function resetToDefaults() {
    setDraft(DEFAULTS);
    setSaveMsg(null);
  }

  async function save() {
    if (!sumValid) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      await post("/api/v1/tenant/contact-score-weights", draft);
      setServerWeights(draft);
      setIsDefault(false);
      setSaveMsg("Weights saved. New scores roll in as contacts are re-scored on the next nightly enrollment pass — or trigger an immediate re-score from the Contact Scoring rules page.");
    } catch (err) {
      setSaveMsg(`Save failed: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  // ─ Re-rank preview ───────────────────────────────────────────────────────
  // For each contact: exactly compute recency + quality_flags (we have the
  // raw fields), then back-solve the remaining 4 dimensions from the current
  // composite score using the saved server weights. Apply the draft weights
  // to that dimension vector to produce the projected score.
  const preview = useMemo(() => {
    if (!serverWeights || contacts.length === 0) return [];

    const w0 = serverWeights;
    const wNew = draft;

    type Row = ScoredContact & {
      projectedScore: number;
      delta: number;
      currentRank: number;
      newRank: number;
      rankDelta: number;
    };
    const enriched: Row[] = contacts.map((c, i) => {
      const rec = recencyScore(c.contact_intelligence_updated_at);
      const qual = qualityScore(c);

      // Sum of the 4 unknown weights under the saved configuration.
      const unknownWeightSum0 =
        w0.weight_engagement + w0.weight_lifecycle_stage +
        w0.weight_revenue + w0.weight_channel_diversity;

      // Back-solve average residual dimension. Composite is on a 0..100
      // scale where composite = Σ(dim * w) / 100 with dims in 0..100.
      const known = (rec * w0.weight_recency + qual * w0.weight_quality_flags) / 100;
      const residual = c.contact_intelligence_score - known;
      const residualDim = unknownWeightSum0 > 0
        ? Math.max(0, Math.min(100, (residual * 100) / unknownWeightSum0))
        : 0;

      const projected = Math.round(
        (residualDim * wNew.weight_engagement +
         residualDim * wNew.weight_lifecycle_stage +
         residualDim * wNew.weight_revenue +
         residualDim * wNew.weight_channel_diversity +
         rec * wNew.weight_recency +
         qual * wNew.weight_quality_flags) / 100
      );
      return {
        ...c,
        projectedScore: Math.max(0, Math.min(100, projected)),
        delta: projected - c.contact_intelligence_score,
        currentRank: i + 1,
        newRank: 0, // populated after sort
        rankDelta: 0,
      };
    });

    // Compute new rank by sorting a copy on projected score desc.
    const byProjected = [...enriched]
      .sort((a, b) => b.projectedScore - a.projectedScore)
      .map((c, i) => ({ id: c.id, newRank: i + 1 }));
    const rankMap = new Map(byProjected.map(r => [r.id, r.newRank]));
    return enriched.map(r => {
      const nr = rankMap.get(r.id) ?? r.currentRank;
      return { ...r, newRank: nr, rankDelta: r.currentRank - nr };
    });
  }, [contacts, serverWeights, draft]);

  // ─ Render ─────────────────────────────────────────────────────────────────
  return (
    <SparkPageShell
      title="Contact Scoring Weights"
      subtitle={isDefault ? "Using platform defaults" : "Custom tenant weights active"}
      help="Re-balance the 6 dimensions of the contact intelligence composite. Sliders must sum to exactly 100 before saving. New scores apply as contacts are re-scored on the next nightly enrollment pass."
      loading={loading}
      error={error}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Sliders ───────────────────────────────────────────────────── */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-slate-900">Dimension weights</div>
            <button
              type="button"
              onClick={resetToDefaults}
              className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50 inline-flex items-center gap-1"
              title="Reset to platform defaults (25/20/20/15/10/10)"
            >
              <RotateCcw className="h-3 w-3" /> Reset to defaults
            </button>
          </div>

          <div className="space-y-3">
            {DIMENSIONS.map(d => (
              <div key={d.key}>
                <div className="flex items-baseline justify-between mb-1">
                  <label htmlFor={d.key} className="text-xs font-semibold text-slate-700">{d.label}</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={draft[d.key]}
                      onChange={(e) => updateWeight(d.key, Number(e.target.value))}
                      className="w-14 text-right text-xs border border-slate-300 rounded px-1.5 py-0.5 tabular-nums focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]"
                    />
                    <span className="text-[10px] text-slate-400">/ 100</span>
                  </div>
                </div>
                <input
                  id={d.key}
                  type="range"
                  min={0}
                  max={100}
                  value={draft[d.key]}
                  onChange={(e) => updateWeight(d.key, Number(e.target.value))}
                  className="w-full accent-[#EF6C33] cursor-pointer"
                />
                <div className="text-[10px] text-slate-500 mt-0.5">{d.blurb}</div>
              </div>
            ))}
          </div>

          {/* Sum readout + save */}
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
            <div className="text-xs">
              <span className="text-slate-500">Total: </span>
              <span className={`font-semibold tabular-nums ${sumValid ? "text-emerald-700" : "text-rose-700"}`}>
                {sum} / 100
              </span>
              {!sumValid && (
                <span className="ml-2 inline-flex items-center gap-1 text-[10px] text-rose-700">
                  <AlertTriangle className="h-3 w-3" />
                  Must equal 100 to save
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={save}
              disabled={!sumValid || !dirty || saving}
              className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white hover:bg-[#d85a25] disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving…" : "Save weights"}
            </button>
          </div>

          {saveMsg && (
            <div className="mt-2 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded p-2">
              {saveMsg}
            </div>
          )}
        </div>

        {/* ── Re-rank preview ───────────────────────────────────────────── */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="mb-2">
            <div className="text-sm font-semibold text-slate-900">Re-rank preview</div>
            <div className="text-[11px] text-slate-500">
              Top 20 scored contacts under the saved weights, with projected new score under the draft weights.{" "}
              <span className="italic">
                Approximation: recency and quality flags are exact; the other four dimensions are back-solved from the composite.
              </span>
            </div>
          </div>

          {preview.length === 0 ? (
            <div className="text-xs text-slate-500 py-6 text-center">
              No scored contacts yet. Run a tenant-wide enrollment from the
              contact intelligence backend, then return to preview.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="spark-table text-xs">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Contact</th>
                    <th>Current</th>
                    <th>Projected</th>
                    <th>Rank Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map(p => (
                    <tr key={p.id}>
                      <td className="tabular-nums text-slate-500">{p.currentRank}</td>
                      <td>
                        <div className="font-medium text-slate-900">
                          {[p.first_name, p.last_name].filter(Boolean).join(" ") || p.email || "(unnamed)"}
                        </div>
                        <div className="text-[10px] text-slate-500">{p.email}</div>
                      </td>
                      <td>
                        <span className="font-semibold tabular-nums">{p.contact_intelligence_score}</span>
                        <span className="text-[10px] text-slate-400 ml-1">{p.contact_intelligence_tier ?? ""}</span>
                      </td>
                      <td>
                        <span className="font-semibold tabular-nums">{p.projectedScore}</span>
                        <DeltaPill value={p.delta} />
                      </td>
                      <td>
                        <RankDelta value={p.rankDelta} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </SparkPageShell>
  );
}

// ─ Helpers ────────────────────────────────────────────────────────────────────

// Mirror of contactScorer.js recency banding.
function recencyScore(lastEng: string | null | undefined): number {
  if (!lastEng) return 0;
  const days = Math.floor((Date.now() - new Date(lastEng).getTime()) / 86_400_000);
  if (days <= 7) return 100;
  if (days <= 30) return 80;
  if (days <= 60) return 55;
  if (days <= 90) return 35;
  if (days <= 180) return 15;
  return 5;
}

// Mirror of contactScorer.js quality_flags banding.
function qualityScore(c: ScoredContact): number {
  let q = 50;
  if (c.email && !c.email_invalid && !c.email_unsubscribed) q += 20;
  if (c.phone) q += 10;
  if (c.first_name && c.last_name) q += 10;
  if (c.company) q += 10;
  if (c.email_invalid) q -= 40;
  if (c.email_unsubscribed) q -= 30;
  if (c.sms_unsubscribed) q -= 10;
  return Math.max(0, Math.min(100, q));
}

function DeltaPill({ value }: { value: number }) {
  if (value === 0) return null;
  const positive = value > 0;
  return (
    <span
      className={`ml-1 text-[10px] tabular-nums ${positive ? "text-emerald-700" : "text-rose-700"}`}
    >
      {positive ? "+" : ""}{value}
    </span>
  );
}

function RankDelta({ value }: { value: number }) {
  if (value === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] text-slate-400">
        <Minus className="h-3 w-3" /> 0
      </span>
    );
  }
  if (value > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] text-emerald-700">
        <ArrowUpRight className="h-3 w-3" /> {value}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] text-rose-700">
      <ArrowDownRight className="h-3 w-3" /> {Math.abs(value)}
    </span>
  );
}

export default SparkContactScoringPage;
