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
//      line once every step is done.
//   2. What needs you — Ledger inbox · Bills · Owed to you · Month-end close.
//      Each tile says it needs you, it is clear, or we could not check it.
//   3. Go to — one tile per STELLA feature area, in the nav's own words.
import { Link } from "react-router-dom";
import { AlertCircle, ArrowRight, CheckCircle2, CircleDot } from "lucide-react";
import { STELLA_INDIGO, STELLA_LAVENDER } from "./stellaTheme";
import { StellaFinishSetup } from "./StellaOverviewView";
import type { StellaSetupStep } from "./stellaSetupSteps";
import { STELLA_SHORTCUTS, type NeedTile, type StellaShortcut } from "./stellaDashboard";

export function StellaDashboardView({
  setupSteps,
  needs,
  shortcuts = STELLA_SHORTCUTS,
}: {
  /** null while the setup reads are still out — the card waits rather than flickering. */
  setupSteps: StellaSetupStep[] | null;
  needs: NeedTile[];
  shortcuts?: StellaShortcut[];
}) {
  const waiting = needs.filter((t) => t.state === "needs_you").length;
  return (
    <>
      <StellaFinishSetup steps={setupSteps} title="Finish setting up" />

      <section data-tour="stella-dashboard-needs" aria-label="What needs you" style={{ marginBottom: 16 }}>
        <div style={sectionHead}>
          <span style={sectionTitle}>What needs you</span>
          <span style={sectionSub}>
            {waiting === 0 ? "Nothing is waiting on you right now." : `${waiting} of ${needs.length} ${waiting === 1 ? "needs" : "need"} a look.`}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {needs.map((t) => (
            <NeedCard key={t.key} tile={t} />
          ))}
        </div>
      </section>

      <section data-tour="stella-dashboard-shortcuts" aria-label="Go to">
        <div style={sectionHead}>
          <span style={sectionTitle}>Go to</span>
          <span style={sectionSub}>Every part of STELLA, one click away.</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
          {shortcuts.map((s) => (
            <Link key={s.key} to={s.route} data-shortcut={s.key} style={shortcutCard}>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#0B1C24" }}>{s.label}</span>
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
