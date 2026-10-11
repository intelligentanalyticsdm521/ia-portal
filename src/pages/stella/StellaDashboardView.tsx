// StellaDashboardView — what STELLA's product Dashboard draws, given the
// answers. Split from StellaDashboardPage (which fetches) so the order and the
// words can be rendered in a test without MSAL or the API
// (test/stella-dashboard), the same split as StellaOverviewView.
//
// Top to bottom — the cross-feature things, the way OLIVER's and SPARK's
// Dashboards lead with setup and what needs you:
//
//   1. Finish setting up — the six STELLA steps (StellaFinishSetup, the shared
//      SetupChecklistCard), each a link to the page that does it. Folds to one
//      line once every step is done. Drawn ONLY here since 2 Oct 2026 (it used
//      to be on Ledger → Overview as well — the same card, read twice).
//   2. What needs you — Ledger inbox · Bills · Owed to you · Month-end close.
//      Each tile says it needs you, it is clear, or we could not check it, and
//      the line beside the heading counts both (needsSummary).
//   3. Go to — one tile per main STELLA feature area, in the nav's own words,
//      with the nav's plan badge where it has one.
//
// An accountant (allowedServiceKeys non-null) sees only what their own nav
// holds: no bank setup steps, no Unit Economics, Settings → Period Close.
import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowRight, CheckCircle2, CircleDot } from "lucide-react";
import { STELLA_INDIGO, STELLA_LAVENDER } from "./stellaTheme";
import { SetupChecklistCard } from "../../components/SetupChecklistCard";
import { allStepsDone, type StellaSetupStep } from "./stellaSetupSteps";
import {
  needsFor, needsSummary, setupStepsFor, shortcutsFor,
  type NeedTile, type StellaShortcut,
} from "./stellaDashboard";
import { planBadgeLabel, planBadgeTitle } from "../../components/navVisibility";
import type { FeatureMap } from "../../lib/entitlements";

export function StellaDashboardView({
  setupSteps,
  needs,
  allowedServiceKeys = null,
  shortcuts,
  features = null,
}: {
  /** null while the setup reads are still out — the card waits rather than flickering. */
  setupSteps: StellaSetupStep[] | null;
  needs: NeedTile[];
  /** The person's nav allowlist (/overview/me or /ledger/me); null = an owner, who sees everything. */
  allowedServiceKeys?: string[] | null;
  shortcuts?: StellaShortcut[];
  /** The catalog answer for this business (useFeatureGate().features); the shortcut badges read it. */
  features?: FeatureMap | null;
}) {
  const steps = setupStepsFor(setupSteps, allowedServiceKeys);
  const tiles = needsFor(needs, allowedServiceKeys);
  const goTo = shortcuts ?? shortcutsFor(allowedServiceKeys);
  return (
    <>
      <StellaFinishSetup steps={steps} title="Finish setting up" />

      <section data-tour="stella-dashboard-needs" aria-label="What needs you" style={{ marginBottom: 16 }}>
        <div style={sectionHead}>
          <span style={sectionTitle}>What needs you</span>
          <span style={sectionSub}>{needsSummary(tiles)}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {tiles.map((t) => (
            <NeedCard key={t.key} tile={t} />
          ))}
        </div>
      </section>

      <section data-tour="stella-dashboard-shortcuts" aria-label="Go to">
        <div style={sectionHead}>
          <span style={sectionTitle}>Go to</span>
          <span style={sectionSub}>The main parts of STELLA, one click away.</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
          {goTo.map((s) => (
            <Link key={s.key} to={s.route} data-shortcut={s.key} style={shortcutCard}>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#0B1C24" }}>{s.label}</span>
                  {s.badgeKey && planBadgeLabel(s.badgeKey, { features }) && (
                    // The same badge the nav shows on this area's first item: the catalog's plan.
                    <span data-shortcut-tag={planBadgeLabel(s.badgeKey, { features }) ?? ""} title={planBadgeTitle(s.badgeKey, { features }) ?? ""} style={tagBadge}>
                      {planBadgeLabel(s.badgeKey, { features })}
                    </span>
                  )}
                </span>
                <ArrowRight size={13} color={STELLA_INDIGO} />
              </span>
              <span style={{ display: "block", fontSize: 11, color: "#5A7A8A", marginTop: 4, lineHeight: 1.45 }}>{s.detail}</span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}

// ── Finish setting up ───────────────────────────────────────────────────────
// The steps, each a link to the screen that does it, each ticked from data.
// Hidden once every step is done, with "Show setup" to bring it back — the way
// SPARK's checklist disappears when it is finished.
export function StellaFinishSetup({ steps, title = "Finish setting up" }: { steps: StellaSetupStep[] | null; title?: string }) {
  const [shown, setShown] = useState(false);
  if (!steps || steps.length === 0) return null;
  const done = steps.filter((s) => s.done).length;
  const finished = allStepsDone(steps);

  if (finished && !shown) {
    return (
      <div
        data-tour="stella-finish-setup"
        style={{ ...card, display: "flex", alignItems: "center", gap: 10, marginBottom: 16, padding: "10px 18px" }}
      >
        <CheckCircle2 size={16} color="#047857" style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 12, color: "#0B1C24" }}>Setup finished — all {steps.length} steps are done.</span>
        <button type="button" onClick={() => setShown(true)} style={linkButton}>
          Show setup
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <SetupChecklistCard
        dataTour="stella-finish-setup"
        title={title}
        done={done}
        total={steps.length}
        accent={STELLA_INDIGO}
        accentTint="#EEF0FB"
        borderColor={STELLA_LAVENDER}
        numbered
        headerRight={
          finished ? (
            <button type="button" onClick={() => setShown(false)} style={linkButton}>
              Hide setup
            </button>
          ) : undefined
        }
        groups={[{ rows: steps }]}
      />
    </div>
  );
}

const TONE: Record<NeedTile["state"], { color: string; bg: string; border: string; label: string }> = {
  needs_you: { color: "#92400E", bg: "#FFFBEB", border: "#FDE68A", label: "Needs you" },
  clear: { color: "#047857", bg: "#fff", border: STELLA_LAVENDER, label: "All clear" },
  unknown: { color: "#64748B", bg: "#F8FAFC", border: "#E2E8F0", label: "Couldn't check" },
};

function NeedCard({ tile }: { tile: NeedTile }) {
  const tone = TONE[tile.state];
  const Icon = tile.state === "needs_you" ? CircleDot : tile.state === "clear" ? CheckCircle2 : AlertCircle;
  return (
    <Link
      to={tile.route}
      data-need={tile.key}
      data-state={tile.state}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        borderRadius: 12,
        padding: "14px 16px",
        textDecoration: "none",
        minHeight: 132,
      }}
    >
      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.4 }}>{tile.title}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, color: tone.color }}>
          <Icon size={12} /> {tone.label}
        </span>
      </span>
      <span style={{ fontSize: 15, fontWeight: 700, color: tile.state === "unknown" ? "#475569" : "#0B1C24", lineHeight: 1.3 }}>{tile.headline}</span>
      <span style={{ fontSize: 11.5, color: "#5A7A8A", lineHeight: 1.5, flex: 1 }}>{tile.detail}</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: STELLA_INDIGO }}>{tile.linkLabel} →</span>
    </Link>
  );
}

const card: React.CSSProperties = { background: "#fff", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 12, padding: "14px 18px" };
const linkButton: React.CSSProperties = { background: "transparent", border: 0, padding: 0, cursor: "pointer", fontSize: 12, fontWeight: 600, color: STELLA_INDIGO };
const sectionHead: React.CSSProperties = { display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 8 };
const sectionTitle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: "#0B1C24" };
const sectionSub: React.CSSProperties = { fontSize: 11, color: "#5A7A8A" };
const shortcutCard: React.CSSProperties = {
  display: "block",
  background: "#fff",
  border: `1px solid ${STELLA_LAVENDER}`,
  borderRadius: 10,
  padding: "12px 14px",
  textDecoration: "none",
};
// The nav's tag pill (SubNav: STELLA_TAG #4C5BD4 at 22 alpha).
const tagBadge: React.CSSProperties = {
  background: `${STELLA_INDIGO}22`,
  color: STELLA_INDIGO,
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.04em",
  padding: "1px 5px",
  borderRadius: 99,
};
