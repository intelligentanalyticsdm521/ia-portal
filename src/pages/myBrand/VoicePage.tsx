// VoicePage — Brand Voice summary + Drift Dashboard (My Brand · Voice).
//
// Canonical SparkPageShell page. Two tabs (segmented control in the shell's
// `filters` slot):
//   - "Profile"         → READ-ONLY summary of the tenant voice profile
//                         (tone chips, saved examples, keywords, avoid list)
//                         plus the last-5 recent voice checks table. Editing
//                         happens in VoiceProfileEditorModal (IadmModal
//                         size="info"), opened from the header action.
//   - "Drift Dashboard" → rolling 30-day score health: topline numbers in the
//                         shell `stats` strip, per-surface bar chart, rolling
//                         line trend, and a worst-scoring items table with an
//                         inspector modal. Pro+ (voice_monitor) — the compact
//                         MyBrandUpgradeGate covers the locked sub-surface.
//
// Backend (LUMEN-API · /api/v1/my-brand/voice/*):
//   GET  /profile            — returns { tone_attributes, voice_examples, ... }
//   PUT  /profile            — handled by VoiceProfileEditorModal
//   GET  /drift-summary?days — { days, overall, by_surface[] }
//   GET  /checks?days&limit  — paged check log
//
// Score scale:
//   The backend's brand_voice_check.score column is a float in [0, 1] per
//   voiceMonitor.scoreText() — so every "out of 100" display multiplies the
//   score by 100. The same scale drives the per-surface bars and the
//   color-coded tier badge.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLumenApi } from "../../hooks/useLumenApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { IadmModal, IadmButton } from "../../components/IadmModal";
import { MyBrandUpgradeGate } from "../../components/MyBrandUpgradeGate";
import { useFeatureGate } from "../../hooks/useFeatureGate";
import {
  VoiceProfileEditorModal,
  migrateLegacyShape,
  MAX_TONE,
  MAX_EXAMPLES,
  type ToneEnvelope,
  type VoiceProfile,
} from "../../components/myBrand/VoiceProfileEditorModal";
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
  Pencil,
  AlertTriangle,
  CheckCircle2,
  Eye,
  Tag,
  Ban,
  Sparkles,
} from "lucide-react";

// ── Constants ────────────────────────────────────────────────────────────────

// Score → tier band (mirrors the 0.8 / 0.6 cuts in the backend drift summary).
function scoreTier(score: number | null): { label: string; color: string } {
  if (score == null) return { label: "No data", color: "#94a3b8" };
  if (score >= 80) return { label: "On-brand", color: "#10b981" };
  if (score >= 60) return { label: "Mild drift", color: "#eab308" };
  return { label: "Strong drift", color: "#dc2626" };
}

// ── Types ────────────────────────────────────────────────────────────────────

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
  const { get, ready } = useLumenApi();
  // Voice Monitor (drift dashboard + checks log) is Pro+. The Profile tab
  // and the pre-publish /score endpoint stay open to all tiers — see scope.
  // We only lock the Drift Dashboard sub-surface, not the whole page.
  const gate = useFeatureGate();
  const driftLocked = gate.locked("my_brand_voice_monitor");

  const [tab, setTab] = useState<"profile" | "drift">("profile");

  // Profile (read-only on this page — editing lives in the modal)
  const [profile, setProfile] = useState<VoiceProfile | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

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
  // whole page — surface partial state so the user can still view their
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

      if (profileRes.status === "fulfilled") {
        // null = first-time tenant, no profile row yet.
        setProfile(profileRes.value ?? null);
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

  // ── Derived data ──────────────────────────────────────────────────────────

  // Read-tolerant envelope for the read-only summary (same migration the
  // editor modal applies before editing).
  const summaryEnvelope = useMemo(
    () => migrateLegacyShape(profile?.tone_attributes),
    [profile],
  );

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

  // ── Shell slots ───────────────────────────────────────────────────────────

  // Primary page action — SPARK-orange pill opening the editor modal.
  const headerActions = (
    <button
      type="button"
      onClick={() => setEditorOpen(true)}
      className="rounded-lg bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#d75a25] inline-flex items-center gap-1"
    >
      <Pencil className="h-3.5 w-3.5" /> Edit voice profile
    </button>
  );

  // Tab switcher — canon segmented control in the shell `filters` slot.
  const filters = (
    <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
      {([
        { key: "profile", label: "Profile" },
        { key: "drift", label: "Drift Dashboard" },
      ] as Array<{ key: typeof tab; label: string }>).map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => setTab(t.key)}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            tab === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );

  // Drift topline — inline stat strip in the shell `stats` slot (NOT a card
  // grid). Only rendered on the unlocked Drift tab.
  const overallAvgPct = summary?.overall.avg_score == null ? null : Math.round(summary.overall.avg_score * 100);
  const overallTier = scoreTier(overallAvgPct);
  const stats =
    tab === "drift" && !driftLocked && !loading ? (
      <div className="spark-stat-strip">
        <div className="spark-stat-item">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">30d avg score</div>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="text-xl font-semibold" style={{ color: overallTier.color }}>
              {overallAvgPct == null ? "—" : overallAvgPct}
            </span>
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{ background: `${overallTier.color}1a`, color: overallTier.color }}
            >
              {overallTier.label}
            </span>
          </div>
        </div>
        <StatItem
          label="On-brand"
          value={summary?.overall.on_brand_pct == null ? null : Math.round(summary.overall.on_brand_pct * 100)}
          suffix="%"
          color="#10b981"
        />
        <StatItem
          label="Mild drift"
          value={summary?.overall.mild_drift_pct == null ? null : Math.round(summary.overall.mild_drift_pct * 100)}
          suffix="%"
          color="#eab308"
        />
        <StatItem
          label="Strong drift"
          value={summary?.overall.strong_drift_pct == null ? null : Math.round(summary.overall.strong_drift_pct * 100)}
          suffix="%"
          color="#dc2626"
        />
        <StatItem label="Checks (30d)" value={summary?.overall.check_count ?? 0} color="#1A3A4A" />
      </div>
    ) : undefined;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SparkPageShell
      title="Brand Voice"
      subtitle="Capture your voice profile and see how on-brand recent copy has been."
      help="Profile defines your tone, sample writing, and the brand-specific keywords / avoid-list the Intelligence Layer uses to score new text. Drift Dashboard shows how every surface (ARION pages, SPARK campaigns, social posts, ARGUS replies) has scored over the last 30 days."
      actions={headerActions}
      stats={stats}
      filters={filters}
      loading={loading}
      error={error}
    >
      {tab === "profile" ? (
        <ProfileSummary
          profile={profile}
          envelope={summaryEnvelope}
          recentChecks={checks.slice(0, 5)}
          onEdit={() => setEditorOpen(true)}
          onInspect={(c) => setInspect(c)}
          onOpenDrift={() => setTab("drift")}
        />
      ) : driftLocked ? (
        <MyBrandUpgradeGate
          compact
          featureName="Voice Drift Dashboard"
          needs={gate.needs("my_brand_voice_monitor")}
          description={`Post-publish voice scoring and the rolling drift dashboard need ${gate.needs("my_brand_voice_monitor")}. Pre-publish checks remain available on every plan.`}
        />
      ) : (
        <DriftTab
          surfaceBars={surfaceBars}
          trendLine={trendLine}
          worst10={worst10}
          onInspect={(c) => setInspect(c)}
        />
      )}

      {editorOpen && (
        <VoiceProfileEditorModal
          open
          onClose={() => setEditorOpen(false)}
          onChanged={() => {
            setEditorOpen(false);
            loadAll();
          }}
        />
      )}
      {inspect && <InspectModal check={inspect} onClose={() => setInspect(null)} />}
    </SparkPageShell>
  );
}

// ── Profile tab (read-only summary) ──────────────────────────────────────────

interface ProfileSummaryProps {
  profile: VoiceProfile | null;
  envelope: ToneEnvelope;
  recentChecks: VoiceCheck[];
  onEdit: () => void;
  onInspect: (c: VoiceCheck) => void;
  onOpenDrift: () => void;
}

function ProfileSummary({ profile, envelope, recentChecks, onEdit, onInspect, onOpenDrift }: ProfileSummaryProps) {
  const tones = envelope.attributes || [];
  const keywords = envelope.keywords || [];
  const avoidList = envelope.avoid_list || [];
  const savedExamples = Array.isArray(profile?.voice_examples) ? profile!.voice_examples : [];

  return (
    <div className="grid grid-cols-1 gap-6">
      {profile == null ? (
        <EmptyCard
          icon={<Mic2 className="h-7 w-7 text-slate-400" />}
          title="No voice profile yet"
          guidance="Capture your tone, sample writing, and brand keywords so the Intelligence Layer can score every surface against your voice."
          cta={
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-1 rounded-lg bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#d75a25]"
            >
              <Pencil className="h-3.5 w-3.5" /> Set up voice profile
            </button>
          }
        />
      ) : (
        <>
          <div className="text-xs text-slate-500">
            {profile.updated_at ? (
              <>Last saved {formatDate(profile.updated_at)}{profile.has_embeddings ? " · embeddings ready" : " · embeddings pending"}</>
            ) : (
              "Profile not yet saved"
            )}
          </div>

          <Section title="Tone Attributes" hint="How your brand should sound.">
            {tones.length === 0 ? (
              <p className="text-xs text-slate-500">No tone attributes yet — use Edit voice profile to pick up to {MAX_TONE}.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tones.map((tone) => (
                  <span key={tone} className="text-xs px-3 py-1.5 rounded-full bg-[#1A3A4A] text-white">{tone}</span>
                ))}
              </div>
            )}
          </Section>

          <Section
            title="Voice Examples"
            hint={`${savedExamples.length} of ${MAX_EXAMPLES} sample passages saved. The Intelligence Layer embeds these and compares new copy against them.`}
          >
            {savedExamples.length === 0 ? (
              <p className="text-xs text-slate-500">No examples saved yet — use Edit voice profile to add some.</p>
            ) : (
              <ul className="space-y-1.5">
                {savedExamples.map((ex, i) => (
                  <li key={i} className="rounded border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-600 truncate">
                    {ex}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title="Brand Keywords"
            hint="Words and phrases that SHOULD appear in your copy — brand name variants, taglines, product names."
          >
            <ReadOnlyChips
              chips={keywords}
              icon={<Tag className="h-3.5 w-3.5 text-emerald-600" />}
              accent="#10b981"
              emptyLabel="No keywords yet."
            />
          </Section>

          <Section
            title="Avoid List"
            hint="Words and phrases to NEVER use — competitor names, off-tone phrases, banned jargon."
          >
            <ReadOnlyChips
              chips={avoidList}
              icon={<Ban className="h-3.5 w-3.5 text-rose-600" />}
              accent="#dc2626"
              emptyLabel="No avoid-list entries yet."
            />
          </Section>
        </>
      )}

      <Section
        title="Last 5 Voice Checks"
        hint="Most recent voice scoring activity across every surface. Open Drift Dashboard for the full 30-day picture."
      >
        {recentChecks.length === 0 ? (
          <EmptyCard
            icon={<Sparkles className="h-7 w-7 text-slate-400" />}
            title="No voice checks yet"
            guidance="Scores appear here as soon as ARION, SPARK, or ARGUS surfaces start running content through the Voice scoring endpoint."
            cta={
              <button
                type="button"
                onClick={onOpenDrift}
                className="inline-flex items-center gap-1 rounded-lg bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#d75a25]"
              >
                <Sparkles className="h-3.5 w-3.5" /> Open Drift Dashboard
              </button>
            }
          />
        ) : (
          <ChecksTable checks={recentChecks} onInspect={onInspect} />
        )}
      </Section>
    </div>
  );
}

// ── Drift dashboard tab ──────────────────────────────────────────────────────

function DriftTab({
  surfaceBars,
  trendLine,
  worst10,
  onInspect,
}: {
  surfaceBars: Array<{ surface: string; score: number; check_count: number }>;
  trendLine: Array<{ day: string; score: number }>;
  worst10: VoiceCheck[];
  onInspect: (c: VoiceCheck) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-6">
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
        hint="Lowest-scoring voice checks in the last 30 days. Click a row to see the text, drift reasons, and suggested fixes."
      >
        {worst10.length === 0 ? (
          <EmptyCard
            icon={<Sparkles className="h-7 w-7 text-slate-400" />}
            title="No voice checks yet"
            guidance="Once content starts flowing through scoreText() the worst offenders will surface here."
          />
        ) : (
          <ChecksTable checks={worst10} showView onInspect={onInspect} />
        )}
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

/** One shared table for recent-5 (Profile tab) and worst-10 (Drift tab).
 *  Rows open the inspect modal on click; `showView` adds the explicit
 *  per-row View button the Drift tab keeps. */
function ChecksTable({
  checks,
  showView,
  onInspect,
}: {
  checks: VoiceCheck[];
  showView?: boolean;
  onInspect: (c: VoiceCheck) => void;
}) {
  return (
    <div className="overflow-x-auto rounded border border-slate-200 bg-white">
      <table className="min-w-full text-xs">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="text-left px-3 py-2">When</th>
            <th className="text-left px-3 py-2">Surface</th>
            <th className="text-left px-3 py-2">Preview</th>
            <th className="text-right px-3 py-2">Score</th>
            <th className="text-right px-3 py-2">Reasons</th>
            {showView && <th className="text-right px-3 py-2"></th>}
          </tr>
        </thead>
        <tbody>
          {checks.map((c) => {
            const pct = Math.round(c.score * 100);
            const tier = scoreTier(pct);
            return (
              <tr
                key={c.check_id}
                onClick={() => onInspect(c)}
                className="border-t border-slate-200 cursor-pointer hover:bg-slate-50"
              >
                <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{formatDate(c.created_at)}</td>
                <td className="px-3 py-2 font-mono text-slate-700">{shortSurface(c.surface)}</td>
                <td className="px-3 py-2 text-slate-600 max-w-[40ch] truncate">{c.text_preview}</td>
                <td className="px-3 py-2 text-right">
                  <span className="inline-flex items-center gap-1 font-semibold" style={{ color: tier.color }}>
                    {pct}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-slate-600">{c.drift_reasons.length || "—"}</td>
                {showView && (
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onInspect(c);
                      }}
                      className="text-[11px] inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 hover:bg-slate-50 text-slate-700"
                    >
                      <Eye className="h-3 w-3" /> View
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Canon SPARK empty state — dashed card, icon circle, h3 title, guidance,
 *  optional CTA (SparkTemplatesPage EmptyState spec). */
function EmptyCard({
  icon,
  title,
  guidance,
  cta,
}: {
  icon: React.ReactNode;
  title: string;
  guidance: string;
  cta?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white p-10 text-center">
      <div className="mx-auto w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-3">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">{guidance}</p>
      {cta && <div className="mt-4">{cta}</div>}
    </div>
  );
}

function ReadOnlyChips({
  chips,
  icon,
  accent,
  emptyLabel,
}: {
  chips: string[];
  icon: React.ReactNode;
  accent: string;
  emptyLabel: string;
}) {
  if (chips.length === 0) {
    return <p className="text-xs text-slate-500">{emptyLabel}</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <span
          key={chip}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs"
          style={{ background: `${accent}1a`, color: accent }}
        >
          {icon}
          <span>{chip}</span>
        </span>
      ))}
    </div>
  );
}

/** Inline stat-strip item for the shell `stats` slot. */
function StatItem({
  label,
  value,
  suffix,
  color,
}: {
  label: string;
  value: number | null;
  suffix?: string;
  color: string;
}) {
  return (
    <div className="spark-stat-item">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-xl font-semibold" style={{ color: value == null ? "#94a3b8" : color }}>
        {value == null ? "—" : value}
        {value != null && suffix ? suffix : ""}
      </div>
    </div>
  );
}

/** Small KPI tile — used inside InspectModal's internal grid only. */
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
          <IadmButton variant="accent" product="spark" onClick={rescore} disabled={rewriteLoading}>
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
