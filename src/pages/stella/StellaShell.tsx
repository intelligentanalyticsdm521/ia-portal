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
