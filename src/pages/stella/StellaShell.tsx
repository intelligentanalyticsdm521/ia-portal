// StellaShell — STELLA-branded page wrapper + shared helpers.
//
// Reuses the OLIVER component library (DataTable/Button/etc.) per the STELLA
// bootstrap (doc 61 §4.3: "match the component library used by ARION/OLIVER/
// SPARK"), but with STELLA's own identity: Indigo #4C5BD4 / Lavender #E8E9FA.
// (The shared OLIVER PageHeader is intentionally NOT used — it hardcodes an
// "OLIVER" label.)
import type { ReactNode } from "react";

export const STELLA_INDIGO = "#4C5BD4";
export const STELLA_LAVENDER = "#E8E9FA";

export function fmtMoney(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : n ?? 0;
  const num = Number.isFinite(v as number) ? (v as number) : 0;
  return num.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function StellaShell({
  title,
  subtitle,
  actions,
  error,
  loading,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  error?: unknown;
  loading?: boolean;
  children: ReactNode;
}) {
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "8px 4px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#fff",
          border: `1px solid ${STELLA_LAVENDER}`,
          borderRadius: 10,
          padding: "14px 18px",
          marginBottom: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: STELLA_INDIGO, letterSpacing: 0.4 }}>STELLA</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#0B1C24", marginTop: 2 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 2 }}>{subtitle}</div>}
        </div>
        {actions && <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{actions}</div>}
      </div>

      {error ? (
        <div
          style={{
            padding: 12,
            fontSize: 12,
            background: "#FEF2F2",
            color: "#991B1B",
            border: "1px solid #FECACA",
            borderRadius: 8,
          }}
        >
          {error instanceof Error ? error.message : "Something went wrong loading this page."}
        </div>
      ) : loading ? (
        <div style={{ padding: 24, fontSize: 13, color: "#5A7A8A" }}>Loading…</div>
      ) : (
        children
      )}
    </div>
  );
}

/**
 * StellaTabs — the STELLA in-page tab switcher (house pattern: fewer nav
 * items, tabs inside the page — mirrors OliverRecurringPage / SparkLeadInbox).
 */
export function StellaTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: string; label: string }[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 14, borderBottom: `1px solid ${STELLA_LAVENDER}` }}>
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            style={{
              padding: "8px 14px",
              fontSize: 12,
              fontWeight: isActive ? 700 : 500,
              color: isActive ? STELLA_INDIGO : "#5A7A8A",
              background: "transparent",
              border: 0,
              borderBottom: isActive ? `2px solid ${STELLA_INDIGO}` : "2px solid transparent",
              marginBottom: -1,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * StellaScaffoldCard — the body-only "landing in P1+" card, usable inside a
 * tabbed page. StellaScaffoldPage wraps it in a StellaShell for standalone use.
 */
export function StellaScaffoldCard({
  note,
  bullets,
  phase = "P1",
  tier,
  children,
}: {
  note?: string;
  bullets?: string[];
  phase?: string;
  tier?: "Standard" | "Pro" | "Business";
  children?: ReactNode;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${STELLA_LAVENDER}`,
        borderRadius: 12,
        padding: "22px 24px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span
          style={{
            display: "inline-block",
            padding: "3px 9px",
            borderRadius: 99,
            background: `${STELLA_INDIGO}18`,
            color: STELLA_INDIGO,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.4,
          }}
        >
          {phase} · Building
        </span>
        {tier && (
          <span
            style={{
              display: "inline-block",
              padding: "3px 9px",
              borderRadius: 99,
              background: "#EEF2FF",
              color: "#3730A3",
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {tier}+
          </span>
        )}
      </div>
      <div style={{ fontSize: 13, color: "#334155", marginTop: 12, lineHeight: 1.55, maxWidth: 640 }}>
        {note ||
          "This surface is scaffolded and wired into STELLA navigation. Its data view lands in an upcoming build phase."}
      </div>
      {bullets && bullets.length > 0 && (
        <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
          {bullets.map((b) => (
            <li key={b} style={{ fontSize: 12, color: "#5A7A8A", display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{ color: STELLA_INDIGO, fontWeight: 700, lineHeight: 1.4 }}>•</span>
              <span style={{ lineHeight: 1.5 }}>{b}</span>
            </li>
          ))}
        </ul>
      )}
      {children}
    </div>
  );
}

/**
 * StellaScaffoldPage — a real StellaShell page whose data view is scaffolded
 * for a later build phase. The nav + route are fully wired; the body is an
 * honest "landing in P1+" notice rather than a fake table.
 */
export function StellaScaffoldPage({
  title,
  subtitle,
  note,
  bullets,
  phase = "P1",
  tier,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  note?: string;
  bullets?: string[];
  phase?: string;
  tier?: "Standard" | "Pro" | "Business";
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <StellaShell title={title} subtitle={subtitle} actions={actions}>
      <StellaScaffoldCard note={note} bullets={bullets} phase={phase} tier={tier}>
        {children}
      </StellaScaffoldCard>
    </StellaShell>
  );
}
