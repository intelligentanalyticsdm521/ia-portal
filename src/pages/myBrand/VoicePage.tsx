// VoicePage — Brand Voice Profile editor + Drift Dashboard (My Brand · Voice).
//
// Two tabs:
//   - "Profile"         → edit the tenant voice profile (tone attributes,
//                         3-6 voice examples, brand keywords, avoid list).
//                         Below the editor: last-5 recent voice checks table.
//   - "Drift Dashboard" → rolling 30-day score health: 30d avg score gauge,
//                         per-surface bar chart, rolling line trend (built
//                         from the per-check series), and a worst-scoring
//                         items table with an inspector modal.
//
// Backend (LUMEN-API · /api/v1/my-brand/voice/*):
//   GET  /profile            — returns { tone_attributes, voice_examples, ... }
//   PUT  /profile            — { tone_attributes, voice_examples }
//   GET  /drift-summary?days — { days, overall, by_surface[] }
//   GET  /checks?days&limit  — paged check log
//
// Schema gap surfaced for wave-3:
//   The PUT profile body in routes/myBrand/voiceMonitor.js only accepts
//   `tone_attributes` (free-form JSON object) and `voice_examples` (string[]).
//   It does NOT yet have first-class fields for `keywords` or `avoid_list`.
//   Until backend gets them, the UI persists both inside the tone_attributes
//   JSON envelope as `{ attributes, keywords, avoid_list }` so the data round-
//   trips cleanly. The Haiku prompt builder JSON.stringify()s the whole
//   tone_attributes object so the model can still reason about keywords +
//   avoid words. When backend adds first-class columns, the UI will switch
//   to those without losing existing tenant data — `migrateLegacyShape()`
//   below covers the read-side.
//
// Score scale:
//   The backend's brand_voice_check.score column is a float in [0, 1] per
//   voiceMonitor.scoreText() — so a 30-day "avg out of 100" gauge multiplies
//   the avg by 100. The same scale drives the per-surface bars and the
//   color-coded tier badge.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLumenApi } from "../../hooks/useLumenApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { IadmModal, IadmButton } from "../../components/IadmModal";
import { MyBrandUpgradeGate } from "../../components/MyBrandUpgradeGate";
import { useMyBrandTier } from "../../hooks/useMyBrandTier";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import {
  Mic2,
  Save,
  Plus,
  Trash2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Eye,
  Tag,
  Ban,
  Sparkles,
} from "lucide-react";

// ── Constants ────────────────────────────────────────────────────────────────

const TONE_OPTIONS = [
  "Professional",
  "Friendly",
  "Playful",
  "Bold",
  "Formal",
  "Casual",
  "Authoritative",
  "Approachable",
  "Witty",
  "Empathetic",
  "Confident",
  "Educational",
];
const MAX_TONE = 5;

const MIN_EXAMPLES = 3;
const MAX_EXAMPLES = 6;
const MIN_EXAMPLE_CHARS = 50;
const MAX_EXAMPLE_CHARS = 2000;

// Score → tier band (mirrors the 0.8 / 0.6 cuts in the backend drift summary).
function scoreTier(score: number | null): { label: string; color: string } {
  if (score == null) return { label: "No data", color: "#94a3b8" };
  if (score >= 80) return { label: "On-brand", color: "#10b981" };
  if (score >= 60) return { label: "Mild drift", color: "#eab308" };
  return { label: "Strong drift", color: "#dc2626" };
}

// ── Types ────────────────────────────────────────────────────────────────────

// Free-form tone_attributes envelope — we own this shape on the client until
// the backend grows first-class keywords / avoid-list columns.
interface ToneEnvelope {
  attributes?: string[];
  keywords?: string[];
  avoid_list?: string[];
  // Anything else the backend (or a future schema migration) hands us is
  // preserved verbatim on save — see saveProfile() pass-through.
  [key: string]: unknown;
}

interface VoiceProfile {
  tenant_id: string;
  tone_attributes: ToneEnvelope | null;
  voice_examples: string[];
  embedding_model_id: string | null;
  embedding_version: number | null;
  embeddings_computed_at: string | null;
  has_embeddings: boolean;
  created_at: string | null;
  updated_at: string | null;
}

interface SurfaceStat {
  surface: string;
  check_count: number;
  avg_score: number | null;
  on_brand_pct: number | null;
  mild_drift_pct: number | null;
  strong_drift_pct: number | null;
}

interface DriftSummary {
  days: number;
  overall: {
    check_count: number;
    avg_score: number | null;
    on_brand_pct: number | null;
    mild_drift_pct: number | null;
    strong_drift_pct: number | null;
  };
  by_surface: SurfaceStat[];
}

interface VoiceCheck {
  check_id: number;
  surface: string;
  subject_id: string | null;
  text_preview: string;
  score: number;
  drift_reasons: string[];
  source: string | null;
  cost_usd: number | null;
  embedding_cosine_max: number | null;
  haiku_used: boolean;
  created_at: string;
}

interface ChecksResponse {
  data: VoiceCheck[];
  paging: { limit: number; offset: number; days: number; surface: string | null };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function migrateLegacyShape(raw: ToneEnvelope | null | undefined): ToneEnvelope {
  if (!raw) return { attributes: [], keywords: [], avoid_list: [] };
  // If the tenant's profile pre-dates wave-2 it may have used a different
  // shape (e.g. `tone: "Professional, Friendly"` from an early draft). Read
  // tolerantly so existing tenants don't see an empty editor on first load.
  const attributes = Array.isArray(raw.attributes)
    ? (raw.attributes as string[]).filter((s) => typeof s === "string")
    : [];
  const keywords = Array.isArray(raw.keywords)
    ? (raw.keywords as string[]).filter((s) => typeof s === "string")
    : [];
  const avoid_list = Array.isArray(raw.avoid_list)
    ? (raw.avoid_list as string[]).filter((s) => typeof s === "string")
    : Array.isArray((raw as { avoidList?: unknown }).avoidList)
      ? ((raw as { avoidList: string[] }).avoidList).filter((s) => typeof s === "string")
      : [];
  return { ...raw, attributes, keywords, avoid_list };
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function shortSurface(surface: string): string {
  if (!surface) return "—";
  if (surface.length > 32) return surface.slice(0, 32) + "…";
  return surface;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function VoicePage() {
  const { get, put, ready } = useLumenApi();
  // Voice Monitor (drift dashboard + checks log) is Pro+. The Profile tab
  // and the pre-publish /score endpoint stay open to all tiers — see scope.
  // We only lock the Drift Dashboard sub-surface, not the whole page.
  const gate = useMyBrandTier();
  const driftLocked = gate.ready && !gate.meets("voice_monitor");

  const [tab, setTab] = useState<"profile" | "drift">("profile");

  // Profile-tab state
  const [profile, setProfile] = useState<VoiceProfile | null>(null);
  const [envelope, setEnvelope] = useState<ToneEnvelope>({ attributes: [], keywords: [], avoid_list: [] });
  const [examples, setExamples] = useState<string[]>(["", "", ""]);
  const [keywordDraft, setKeywordDraft] = useState("");
  const [avoidDraft, setAvoidDraft] = useState("");
  const [saving, setSaving] = useState(false);

  // Dashboard + log state (shared by both tabs — recent-5 on Profile tab
  // is just a slice of the checks list).
  const [summary, setSummary] = useState<DriftSummary | null>(null);
  const [checks, setChecks] = useState<VoiceCheck[]>([]);

  // Page-level loading/error
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  // Inspect-a-check modal state
  const [inspect, setInspect] = useState<VoiceCheck | null>(null);

  // Load everything in parallel. Failing on any one shouldn't blank the
  // whole page — surface partial state so the user can still edit their
  // profile if the drift endpoint is down (and vice versa).
  const loadAll = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const [profileRes, summaryRes, checksRes] = await Promise.allSettled([
        get<VoiceProfile | null>("/api/v1/my-brand/voice/profile"),
        get<DriftSummary>("/api/v1/my-brand/voice/drift-summary?days=30"),
        get<ChecksResponse>("/api/v1/my-brand/voice/checks?days=30&limit=50"),
      ]);

      if (profileRes.status === "fulfilled" && profileRes.value) {
        const p = profileRes.value;
        setProfile(p);
        const env = migrateLegacyShape(p.tone_attributes);
        setEnvelope(env);
        // Pad voice_examples to at least MIN_EXAMPLES so the editor renders 3 boxes on first paint.
        const ex = Array.isArray(p.voice_examples) ? [...p.voice_examples] : [];
        while (ex.length < MIN_EXAMPLES) ex.push("");
        setExamples(ex.slice(0, MAX_EXAMPLES));
      } else if (profileRes.status === "fulfilled") {
        // First-time tenant — no profile row yet. Start with empty defaults.
        setProfile(null);
        setEnvelope({ attributes: [], keywords: [], avoid_list: [] });
        setExamples(["", "", ""]);
      } else {
        // Profile load failed; bubble up only if we have NOTHING else either.
        if (summaryRes.status !== "fulfilled" && checksRes.status !== "fulfilled") {
          setError(profileRes.reason);
        }
      }

      if (summaryRes.status === "fulfilled") {
        setSummary(summaryRes.value);
      } else {
        setSummary(null);
      }

      if (checksRes.status === "fulfilled" && checksRes.value) {
        setChecks(checksRes.value.data || []);
      } else {
        setChecks([]);
      }
    } catch (err) {
      // We Promise.allSettled() above so we shouldn't land here, but if
      // something synchronous throws (e.g. MSAL token error) catch it.
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [get, ready]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // ── Profile tab actions ───────────────────────────────────────────────────

  const toggleTone = useCallback((tone: string) => {
    setEnvelope((prev) => {
      const cur = prev.attributes || [];
      if (cur.includes(tone)) {
        return { ...prev, attributes: cur.filter((t) => t !== tone) };
      }
      if (cur.length >= MAX_TONE) return prev; // capped
      return { ...prev, attributes: [...cur, tone] };
    });
  }, []);

  const updateExample = useCallback((idx: number, val: string) => {
    setExamples((prev) => prev.map((e, i) => (i === idx ? val.slice(0, MAX_EXAMPLE_CHARS) : e)));
  }, []);

  const addExample = useCallback(() => {
    setExamples((prev) => (prev.length < MAX_EXAMPLES ? [...prev, ""] : prev));
  }, []);

  const removeExample = useCallback((idx: number) => {
    setExamples((prev) => {
      if (prev.length <= MIN_EXAMPLES) return prev.map((e, i) => (i === idx ? "" : e));
      return prev.filter((_, i) => i !== idx);
    });
  }, []);

  const addKeyword = useCallback(() => {
    const v = keywordDraft.trim();
    if (!v) return;
    setEnvelope((prev) => {
      const cur = prev.keywords || [];
      if (cur.includes(v)) return prev;
      return { ...prev, keywords: [...cur, v] };
    });
    setKeywordDraft("");
  }, [keywordDraft]);

  const removeKeyword = useCallback((kw: string) => {
    setEnvelope((prev) => ({ ...prev, keywords: (prev.keywords || []).filter((k) => k !== kw) }));
  }, []);

  const addAvoid = useCallback(() => {
    const v = avoidDraft.trim();
    if (!v) return;
    setEnvelope((prev) => {
      const cur = prev.avoid_list || [];
      if (cur.includes(v)) return prev;
      return { ...prev, avoid_list: [...cur, v] };
    });
    setAvoidDraft("");
  }, [avoidDraft]);

  const removeAvoid = useCallback((w: string) => {
    setEnvelope((prev) => ({ ...prev, avoid_list: (prev.avoid_list || []).filter((k) => k !== w) }));
  }, []);

  // Save validation — match backend rules (3-6 examples, each min 50 chars).
  // We allow the user to type fewer; we just gate the Save button.
  const validExamples = examples.filter((e) => e.trim().length >= MIN_EXAMPLE_CHARS);
  const canSave =
    (envelope.attributes?.length || 0) > 0 &&
    validExamples.length >= MIN_EXAMPLES;

  const saveProfile = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      // Trim each example, drop empties, cap at MAX_EXAMPLES — same shape the
      // backend enforces, but matching it here keeps the response in sync.
      const cleanedExamples = examples
        .map((e) => e.trim())
        .filter((e) => e.length >= MIN_EXAMPLE_CHARS)
        .slice(0, MAX_EXAMPLES);

      // tone_attributes envelope passthrough — preserve any keys the
      // backend might have set (e.g. version metadata) by spreading
      // the loaded shape first.
      const body = {
        tone_attributes: { ...envelope },
        voice_examples: cleanedExamples,
      };

      await put<VoiceProfile>("/api/v1/my-brand/voice/profile", body);
      await loadAll();
    } catch (err) {
      alert(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }, [canSave, envelope, examples, put, loadAll]);

  // ── Derived dashboard data ────────────────────────────────────────────────

  // Per-surface bar chart — convert avg_score 0-1 → 0-100 for display.
  const surfaceBars = useMemo(() => {
    if (!summary) return [];
    return summary.by_surface.map((s) => ({
      surface: shortSurface(s.surface),
      score: s.avg_score == null ? 0 : Math.round(s.avg_score * 100),
      check_count: s.check_count,
    }));
  }, [summary]);

  // Rolling 30-day line trend — bucket checks by calendar day (UTC) and
  // average per day. If a day has no checks we omit it (sparse line)
  // rather than zero-fill, which would falsely imply 0-score days.
  const trendLine = useMemo(() => {
    if (!checks.length) return [];
    const byDay = new Map<string, { sum: number; n: number }>();
    for (const c of checks) {
      const day = (c.created_at || "").slice(0, 10);
      if (!day) continue;
      const bucket = byDay.get(day) || { sum: 0, n: 0 };
      bucket.sum += c.score;
      bucket.n += 1;
      byDay.set(day, bucket);
    }
    const rows = Array.from(byDay.entries())
      .map(([day, { sum, n }]) => ({ day, score: Math.round((sum / n) * 100) }))
      .sort((a, b) => a.day.localeCompare(b.day));
    return rows;
  }, [checks]);

  // Worst-10 — checks list sorted by lowest score asc (lower = more drift).
  const worst10 = useMemo(() => {
    return [...checks].sort((a, b) => a.score - b.score).slice(0, 10);
  }, [checks]);

  // ── Render ────────────────────────────────────────────────────────────────

  const headerActions = (
    <button
      onClick={loadAll}
      className="text-sm px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 flex items-center gap-1"
      type="button"
    >
      <RefreshCw className="h-4 w-4" /> Refresh
    </button>
  );

  return (
    <SparkPageShell
      title="Brand Voice"
      subtitle="Capture your voice profile and see how on-brand recent copy has been."
      help="Profile defines your tone, sample writing, and the brand-specific keywords / avoid-list the Intelligence Layer uses to score new text. Drift Dashboard shows how every surface (ARION pages, SPARK campaigns, social posts, ARGUS replies) has scored over the last 30 days."
      actions={headerActions}
      loading={loading}
      error={error}
    >
      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-50 px-3 py-1 rounded-t-md">
        <TabButton active={tab === "profile"} onClick={() => setTab("profile")} icon={<Mic2 className="h-3.5 w-3.5" />} label="Profile" />
        <TabButton active={tab === "drift"} onClick={() => setTab("drift")} icon={<Sparkles className="h-3.5 w-3.5" />} label="Drift Dashboard" />
      </div>

      <div className="bg-white border border-t-0 border-slate-200 rounded-b-md p-5">
        {tab === "profile" ? (
          <ProfileTab
            profile={profile}
            envelope={envelope}
            toggleTone={toggleTone}
            examples={examples}
            updateExample={updateExample}
            addExample={addExample}
            removeExample={removeExample}
            keywordDraft={keywordDraft}
            setKeywordDraft={setKeywordDraft}
            addKeyword={addKeyword}
            removeKeyword={removeKeyword}
            avoidDraft={avoidDraft}
            setAvoidDraft={setAvoidDraft}
            addAvoid={addAvoid}
            removeAvoid={removeAvoid}
            canSave={canSave}
            saving={saving}
            saveProfile={saveProfile}
            recentChecks={checks.slice(0, 5)}
            validCount={validExamples.length}
          />
        ) : driftLocked ? (
          <MyBrandUpgradeGate
            compact
            featureName="Voice Drift Dashboard"
            requiredTier={gate.requiredTier("voice_monitor")}
            currentTier={gate.tier}
            description="Post-publish voice scoring and the rolling drift dashboard are Pro-tier features. Pre-publish checks remain available on every plan."
          />
        ) : (
          <DriftTab
            summary={summary}
            surfaceBars={surfaceBars}
            trendLine={trendLine}
            worst10={worst10}
            onInspect={(c) => setInspect(c)}
          />
        )}
      </div>

      {inspect && <InspectModal check={inspect} onClose={() => setInspect(null)} />}
    </SparkPageShell>
  );
}

// ── Tab chrome ───────────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-white text-slate-900 shadow-sm border border-slate-200"
          : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

// ── Profile tab ──────────────────────────────────────────────────────────────

interface ProfileTabProps {
  profile: VoiceProfile | null;
  envelope: ToneEnvelope;
  toggleTone: (t: string) => void;
  examples: string[];
  updateExample: (idx: number, val: string) => void;
  addExample: () => void;
  removeExample: (idx: number) => void;
  keywordDraft: string;
  setKeywordDraft: (v: string) => void;
  addKeyword: () => void;
  removeKeyword: (kw: string) => void;
  avoidDraft: string;
  setAvoidDraft: (v: string) => void;
  addAvoid: () => void;
  removeAvoid: (w: string) => void;
  canSave: boolean;
  saving: boolean;
  saveProfile: () => void;
  recentChecks: VoiceCheck[];
  validCount: number;
}

function ProfileTab(props: ProfileTabProps) {
  const {
    profile, envelope, toggleTone,
    examples, updateExample, addExample, removeExample,
    keywordDraft, setKeywordDraft, addKeyword, removeKeyword,
    avoidDraft, setAvoidDraft, addAvoid, removeAvoid,
    canSave, saving, saveProfile, recentChecks, validCount,
  } = props;

  const selectedTones = envelope.attributes || [];
  const keywords = envelope.keywords || [];
  const avoidList = envelope.avoid_list || [];

  return (
    <div className="grid grid-cols-1 gap-6">
      {/* Tone attributes */}
      <Section
        title="Tone Attributes"
        hint={`Pick up to ${MAX_TONE} attributes that describe how your brand should sound. ${selectedTones.length}/${MAX_TONE} selected.`}
      >
        <div className="flex flex-wrap gap-2">
          {TONE_OPTIONS.map((tone) => {
            const selected = selectedTones.includes(tone);
            const disabled = !selected && selectedTones.length >= MAX_TONE;
            return (
              <button
                key={tone}
                type="button"
                onClick={() => toggleTone(tone)}
                disabled={disabled}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  selected
                    ? "bg-[#1A3A4A] text-white border-[#1A3A4A]"
                    : disabled
                      ? "bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed"
                      : "bg-white text-slate-700 border-slate-300 hover:border-slate-400"
                }`}
              >
                {tone}
              </button>
            );
          })}
        </div>
      </Section>

      {/* Voice examples */}
      <Section
        title="Voice Examples"
        hint={`Paste ${MIN_EXAMPLES}-${MAX_EXAMPLES} short passages of writing that sound like your brand. Each example must be at least ${MIN_EXAMPLE_CHARS} characters. The Intelligence Layer embeds these and compares new copy against them. ${validCount} of ${MIN_EXAMPLES} required.`}
      >
        <div className="space-y-3">
          {examples.map((text, idx) => {
            const chars = text.trim().length;
            const tooShort = chars > 0 && chars < MIN_EXAMPLE_CHARS;
            return (
              <div key={idx} className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-700">Example {idx + 1}</label>
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] ${tooShort ? "text-rose-600" : chars >= MIN_EXAMPLE_CHARS ? "text-emerald-600" : "text-slate-500"}`}>
                      {chars}/{MAX_EXAMPLE_CHARS} chars
                    </span>
                    {examples.length > MIN_EXAMPLES && (
                      <button
                        type="button"
                        onClick={() => removeExample(idx)}
                        className="text-[11px] text-slate-500 hover:text-rose-600 inline-flex items-center gap-1"
                      >
                        <Trash2 className="h-3 w-3" /> Remove
                      </button>
                    )}
                  </div>
                </div>
                <textarea
                  value={text}
                  onChange={(e) => updateExample(idx, e.target.value)}
                  rows={4}
                  placeholder={`At least ${MIN_EXAMPLE_CHARS} characters — write the way your brand actually writes.`}
                  className={`w-full rounded border px-3 py-2 text-sm font-mono leading-snug ${
                    tooShort ? "border-rose-300 bg-rose-50" : "border-slate-300 bg-white"
                  }`}
                />
              </div>
            );
          })}
          {examples.length < MAX_EXAMPLES && (
            <button
              type="button"
              onClick={addExample}
              className="text-xs text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 border border-dashed border-slate-300 rounded px-3 py-1.5"
            >
              <Plus className="h-3 w-3" /> Add example ({examples.length}/{MAX_EXAMPLES})
            </button>
          )}
        </div>
      </Section>

      {/* Brand keywords */}
      <Section
        title="Brand Keywords"
        hint="Words and phrases that SHOULD appear in your copy — brand name variants, taglines, product names. Stored inside tone_attributes JSON for now (backend pending first-class columns)."
      >
        <ChipInput
          icon={<Tag className="h-3.5 w-3.5 text-emerald-600" />}
          chips={keywords}
          draft={keywordDraft}
          setDraft={setKeywordDraft}
          onAdd={addKeyword}
          onRemove={removeKeyword}
          placeholder="e.g. Acme Corp, AcmeFlow, “Built for trades”"
          accent="#10b981"
        />
      </Section>

      {/* Avoid list */}
      <Section
        title="Avoid List"
        hint="Words and phrases to NEVER use — competitor names, off-tone phrases, banned jargon."
      >
        <ChipInput
          icon={<Ban className="h-3.5 w-3.5 text-rose-600" />}
          chips={avoidList}
          draft={avoidDraft}
          setDraft={setAvoidDraft}
          onAdd={addAvoid}
          onRemove={removeAvoid}
          placeholder="e.g. cheap, basic, competitor names"
          accent="#dc2626"
        />
      </Section>

      {/* Save row */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-200">
        <div className="text-xs text-slate-500">
          {profile?.updated_at ? <>Last saved {formatDate(profile.updated_at)}{profile.has_embeddings ? " · embeddings ready" : " · embeddings pending"}</> : "Profile not yet saved"}
        </div>
        <div className="flex items-center gap-2">
          {!canSave && (
            <span className="text-[11px] text-amber-700 inline-flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Need {MIN_EXAMPLES} examples (≥{MIN_EXAMPLE_CHARS} chars) and at least one tone
            </span>
          )}
          <button
            type="button"
            onClick={saveProfile}
            disabled={!canSave || saving}
            className="inline-flex items-center gap-1 rounded px-4 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 text-white"
            style={{ background: "#2563eb" }}
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving…" : "Save profile"}
          </button>
        </div>
      </div>

      {/* Recent 5 voice checks */}
      <Section
        title="Last 5 Voice Checks"
        hint="Most recent voice scoring activity across every surface. Open Drift Dashboard for the full 30-day picture."
      >
        {recentChecks.length === 0 ? (
          <div className="rounded border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs text-slate-500">
            No voice checks recorded yet. Scores appear here as soon as ARION, SPARK, or ARGUS surfaces start running content through the Voice scoring endpoint.
          </div>
        ) : (
          <div className="overflow-x-auto rounded border border-slate-200">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-3 py-2">When</th>
                  <th className="text-left px-3 py-2">Surface</th>
                  <th className="text-left px-3 py-2">Preview</th>
                  <th className="text-right px-3 py-2">Score</th>
                  <th className="text-right px-3 py-2">Drift Reasons</th>
                </tr>
              </thead>
              <tbody>
                {recentChecks.map((c) => {
                  const pct = Math.round(c.score * 100);
                  const tier = scoreTier(pct);
                  return (
                    <tr key={c.check_id} className="border-t border-slate-200">
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{formatDate(c.created_at)}</td>
                      <td className="px-3 py-2 font-mono text-slate-700">{shortSurface(c.surface)}</td>
                      <td className="px-3 py-2 text-slate-600 max-w-[40ch] truncate">{c.text_preview}</td>
                      <td className="px-3 py-2 text-right">
                        <span className="inline-flex items-center gap-1 font-semibold" style={{ color: tier.color }}>
                          {pct}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-slate-600">{c.drift_reasons.length || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

// ── Drift dashboard tab ──────────────────────────────────────────────────────

function DriftTab({
  summary,
  surfaceBars,
  trendLine,
  worst10,
  onInspect,
}: {
  summary: DriftSummary | null;
  surfaceBars: Array<{ surface: string; score: number; check_count: number }>;
  trendLine: Array<{ day: string; score: number }>;
  worst10: VoiceCheck[];
  onInspect: (c: VoiceCheck) => void;
}) {
  const overallAvgPct = summary?.overall.avg_score == null ? null : Math.round(summary.overall.avg_score * 100);
  const overallTier = scoreTier(overallAvgPct);
  const totalChecks = summary?.overall.check_count || 0;

  return (
    <div className="grid grid-cols-1 gap-6">
      {/* Header gauge */}
      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4 items-stretch">
        <div className="rounded border border-slate-200 bg-white p-5 flex flex-col items-center justify-center">
          <ScoreGauge value={overallAvgPct} color={overallTier.color} />
          <div className="mt-3 text-xs font-medium text-slate-600">30-day average voice score</div>
          <span
            className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide rounded-full px-2.5 py-1"
            style={{ background: `${overallTier.color}1a`, color: overallTier.color }}
          >
            {overallTier.label}
          </span>
          <div className="mt-2 text-[11px] text-slate-500">{totalChecks} checks in last 30d</div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <KPI
            label="On-brand"
            value={summary?.overall.on_brand_pct == null ? null : Math.round(summary.overall.on_brand_pct * 100)}
            suffix="%"
            color="#10b981"
            help="Score ≥ 80"
          />
          <KPI
            label="Mild drift"
            value={summary?.overall.mild_drift_pct == null ? null : Math.round(summary.overall.mild_drift_pct * 100)}
            suffix="%"
            color="#eab308"
            help="Score 60-79"
          />
          <KPI
            label="Strong drift"
            value={summary?.overall.strong_drift_pct == null ? null : Math.round(summary.overall.strong_drift_pct * 100)}
            suffix="%"
            color="#dc2626"
            help="Score < 60"
          />
        </div>
      </div>

      {/* Per-surface bar chart */}
      <ChartCard
        title="Average score by surface"
        hint="ARION pages, SPARK campaigns, social posts, ARGUS chatbot replies — score is 0-100, computed from the embedding + Haiku judge."
      >
        {surfaceBars.length === 0 ? (
          <EmptyChart label="No surface scores yet in the last 30 days." />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={surfaceBars} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="surface" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
              <Tooltip
                // Recharts 3.x types: `val` may be undefined; coerce defensively
                // and read `item.payload` for the per-bar check count we
                // attached when building surfaceBars[].
                formatter={(val: unknown, _key: unknown, item: { payload?: { check_count?: number } }) => {
                  const n = typeof val === "number" ? val : Number(val) || 0;
                  const ct = item?.payload?.check_count ?? 0;
                  return [`${n} (${ct} checks)`, "Avg score"];
                }}
                contentStyle={{ fontSize: 11 }}
              />
              <ReferenceLine y={80} stroke="#10b981" strokeDasharray="3 3" />
              <ReferenceLine y={60} stroke="#dc2626" strokeDasharray="3 3" />
              <Bar dataKey="score" fill="#1A3A4A" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* 30-day line chart */}
      <ChartCard
        title="Rolling 30-day score trend"
        hint="Daily average across all surfaces. Days without any voice checks are omitted (sparse line) rather than zero-filled."
      >
        {trendLine.length === 0 ? (
          <EmptyChart label="Not enough checks yet to draw a trend." />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trendLine} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <ReferenceLine y={80} stroke="#10b981" strokeDasharray="3 3" />
              <ReferenceLine y={60} stroke="#dc2626" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="score" stroke="#1A3A4A" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Worst-10 list */}
      <Section
        title="Top 10 worst-scoring recent items"
        hint="Lowest-scoring voice checks in the last 30 days. Click View to see the text, drift reasons, and suggested fixes."
      >
        {worst10.length === 0 ? (
          <div className="rounded border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs text-slate-500">
            No voice checks yet — once content starts flowing through scoreText() the worst offenders will surface here.
          </div>
        ) : (
          <div className="overflow-x-auto rounded border border-slate-200">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-3 py-2">When</th>
                  <th className="text-left px-3 py-2">Surface</th>
                  <th className="text-left px-3 py-2">Preview</th>
                  <th className="text-right px-3 py-2">Score</th>
                  <th className="text-right px-3 py-2">Reasons</th>
                  <th className="text-right px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {worst10.map((c) => {
                  const pct = Math.round(c.score * 100);
                  const tier = scoreTier(pct);
                  return (
                    <tr key={c.check_id} className="border-t border-slate-200">
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{formatDate(c.created_at)}</td>
                      <td className="px-3 py-2 font-mono text-slate-700">{shortSurface(c.surface)}</td>
                      <td className="px-3 py-2 text-slate-600 max-w-[40ch] truncate">{c.text_preview}</td>
                      <td className="px-3 py-2 text-right">
                        <span className="inline-flex items-center gap-1 font-semibold" style={{ color: tier.color }}>
                          {pct}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-slate-600">{c.drift_reasons.length || 0}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => onInspect(c)}
                          className="text-[11px] inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 hover:bg-slate-50 text-slate-700"
                        >
                          <Eye className="h-3 w-3" /> View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Engagement scatter — empty state. Real wiring blocked on the
          engagement-per-surface backend join (wave-3). */}
      <Section
        title="Voice score vs engagement"
        hint="Future: scatter every check against its surface's engagement metric (open rate, click rate, response rate). Blocked on backend join — see wave-3 follow-up."
      >
        <div className="rounded border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-xs text-slate-500">
          Engagement-per-check data isn't joined yet. Once we have it, this card will plot voice score (x) against engagement rate (y) for every check.
        </div>
      </Section>
    </div>
  );
}

// ── Reusable pieces ──────────────────────────────────────────────────────────

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function ChipInput({
  icon,
  chips,
  draft,
  setDraft,
  onAdd,
  onRemove,
  placeholder,
  accent,
}: {
  icon: React.ReactNode;
  chips: string[];
  draft: string;
  setDraft: (v: string) => void;
  onAdd: () => void;
  onRemove: (chip: string) => void;
  placeholder: string;
  accent: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              onAdd();
            }
          }}
          placeholder={placeholder}
          className="flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm bg-white"
        />
        <button
          type="button"
          onClick={onAdd}
          disabled={!draft.trim()}
          className="text-xs px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-1"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>
      {chips.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map((chip) => (
            <span
              key={chip}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs"
              style={{ background: `${accent}1a`, color: accent }}
            >
              {icon}
              <span>{chip}</span>
              <button
                type="button"
                onClick={() => onRemove(chip)}
                className="ml-1 text-current opacity-60 hover:opacity-100"
                aria-label={`Remove ${chip}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : (
        <div className="mt-2 text-[11px] text-slate-500">No entries yet — press Enter or comma to add.</div>
      )}
    </div>
  );
}

function KPI({
  label,
  value,
  suffix,
  color,
  help,
}: {
  label: string;
  value: number | null;
  suffix?: string;
  color: string;
  help?: string;
}) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="mt-1 text-2xl font-semibold" style={{ color }}>
        {value == null ? "—" : value}{value != null && suffix}
      </div>
      {help && <div className="mt-1 text-[10px] text-slate-400">{help}</div>}
    </div>
  );
}

function ChartCard({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-5">
      <div className="mb-3">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        {hint && <div className="text-[11px] text-slate-500 mt-0.5">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="h-[200px] flex items-center justify-center text-xs text-slate-400">{label}</div>
  );
}

// A pared-down radial gauge — no dependency on the ARION MiniGauge component
// since this page lives outside the ARION wrapper. SVG arc from 0-100.
function ScoreGauge({ value, color }: { value: number | null; color: string }) {
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  const angle = (v / 100) * 180; // half-circle
  const radius = 80;
  const cx = 100;
  const cy = 100;
  const start = polarToCartesian(cx, cy, radius, 180);
  const end = polarToCartesian(cx, cy, radius, 180 - angle);
  const largeArc = angle > 180 ? 1 : 0;
  const arcPath = `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
  const bgEnd = polarToCartesian(cx, cy, radius, 0);
  const bgPath = `M ${start.x} ${start.y} A ${radius} ${radius} 0 1 1 ${bgEnd.x} ${bgEnd.y}`;

  return (
    <svg viewBox="0 0 200 120" width="200" height="120">
      <path d={bgPath} stroke="#e2e8f0" strokeWidth={12} fill="none" strokeLinecap="round" />
      {value != null && (
        <path d={arcPath} stroke={color} strokeWidth={12} fill="none" strokeLinecap="round" />
      )}
      <text x={cx} y={cy - 8} textAnchor="middle" fontSize={32} fontWeight={700} fill="#0f172a">
        {value == null ? "—" : value}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize={11} fill="#64748b">
        / 100
      </text>
    </svg>
  );
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

// ── Inspect modal ────────────────────────────────────────────────────────────

function InspectModal({ check, onClose }: { check: VoiceCheck; onClose: () => void }) {
  const { post } = useLumenApi();
  const pct = Math.round(check.score * 100);
  const tier = scoreTier(pct);

  // On-demand "suggested rewrite" via /voice/score with skip_haiku=false.
  // Backend doesn't yet have a dedicated rewrite endpoint, so we re-score
  // the same preview as a placeholder + display drift reasons. When backend
  // gains rewrite=true support this swaps in cleanly.
  const [rewriteLoading, setRewriteLoading] = useState(false);
  const [rewriteResult, setRewriteResult] = useState<{ score: number; drift_reasons: string[] } | null>(null);
  const [rewriteErr, setRewriteErr] = useState<string | null>(null);

  async function rescore() {
    setRewriteLoading(true);
    setRewriteErr(null);
    try {
      const r = await post<{ score: number; drift_reasons: string[]; source: string }>(
        "/api/v1/my-brand/voice/score",
        { surface: check.surface, text: check.text_preview },
      );
      setRewriteResult({ score: r.score, drift_reasons: r.drift_reasons });
    } catch (err) {
      setRewriteErr(err instanceof Error ? err.message : String(err));
    } finally {
      setRewriteLoading(false);
    }
  }

  return (
    <IadmModal
      open
      onClose={onClose}
      product="spark"
      eyebrow="BRAND VOICE · CHECK"
      title="Voice check details"
      subtitle={`${check.surface} · ${formatDate(check.created_at)}`}
      size="info"
      footer={
        <>
          <IadmButton variant="ghost" onClick={onClose}>Close</IadmButton>
          <IadmButton variant="primary" onClick={rescore} disabled={rewriteLoading}>
            {rewriteLoading ? "Re-scoring…" : "Re-score now"}
          </IadmButton>
        </>
      }
    >
      <div className="space-y-5 p-5">
        <div className="grid grid-cols-3 gap-3">
          <KPI label="Score" value={pct} color={tier.color} help={tier.label} />
          <KPI label="Drift reasons" value={check.drift_reasons.length} color="#1A3A4A" />
          <KPI
            label="Haiku used"
            value={check.haiku_used ? 1 : 0}
            color={check.haiku_used ? "#1A3A4A" : "#94a3b8"}
            help={check.source || (check.haiku_used ? "judge" : "embedding-only")}
          />
        </div>

        <Section title="Scored text">
          <pre className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 whitespace-pre-wrap font-mono leading-relaxed max-h-[260px] overflow-y-auto">
            {check.text_preview}
          </pre>
          <div className="mt-1 text-[10px] text-slate-500">Stored as text_preview (truncated). Full original payload is not retained in brand_voice_check.</div>
        </Section>

        <Section title="Drift reasons">
          {check.drift_reasons.length === 0 ? (
            <div className="rounded border border-dashed border-slate-300 bg-slate-50 p-4 text-xs text-slate-500 inline-flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> No drift reasons logged for this check.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {check.drift_reasons.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {(rewriteResult || rewriteErr) && (
          <Section title="Re-score result">
            {rewriteErr ? (
              <div className="text-xs text-rose-700">{rewriteErr}</div>
            ) : rewriteResult ? (
              <div className="rounded border border-slate-200 bg-white p-3 text-xs space-y-1">
                <div>New score: <b style={{ color: scoreTier(Math.round(rewriteResult.score * 100)).color }}>{Math.round(rewriteResult.score * 100)}</b> / 100</div>
                {rewriteResult.drift_reasons.length > 0 && (
                  <ul className="list-disc list-inside text-slate-600 mt-1 space-y-0.5">
                    {rewriteResult.drift_reasons.map((r, i) => (<li key={i}>{r}</li>))}
                  </ul>
                )}
                <div className="text-[10px] text-slate-400 mt-1">
                  Backend doesn't yet support rewrite=true; this is a fresh score of the preview. When the backend exposes rewrite, the modal will swap in the IL-suggested rewrite here.
                </div>
              </div>
            ) : null}
          </Section>
        )}
      </div>
    </IadmModal>
  );
}

export default VoicePage;
