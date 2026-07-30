// StellaUnitEconomicsPages — Layer 2 (Unit Economics) LIVE surfaces, scaffolded.
//
// 2026-07-30 nav consolidation (8-item cap): Allocation Rules + Allocation
// Runs merged into ONE Allocations page with two in-page tabs. Margins and
// Reconciliation stay as their own pages. The allocation engine + margin
// reads land in the P4 build phase. The Rules tab previews the fixed 7-method
// taxonomy (static product info, not tenant data).
import { useState } from "react";
import { StellaScaffoldCard, StellaScaffoldPage, StellaShell, StellaTabs, STELLA_INDIGO, STELLA_LAVENDER } from "./StellaShell";

const ALLOCATION_METHODS: { name: string; blurb: string }[] = [
  { name: "Direct", blurb: "Assign a cost straight to one job, customer, or line." },
  { name: "% of Revenue", blurb: "Spread cost in proportion to revenue earned." },
  { name: "% of Labor Hours", blurb: "Spread by hours worked across targets." },
  { name: "Time-Weighted", blurb: "Weight by elapsed time on each target." },
  { name: "Mileage-Weighted", blurb: "Weight by miles logged against each target." },
  { name: "Revenue-Weighted", blurb: "Weight overhead by each target's revenue share." },
  { name: "Custom", blurb: "Define your own weighting expression." },
];

const ALLOC_TABS = [
  { key: "rules", label: "Rules" },
  { key: "runs", label: "Runs" },
];

export function StellaAllocationsPage() {
  const [tab, setTab] = useState("rules");
  return (
    <StellaShell
      title="Allocations"
      subtitle="How shared and overhead costs get spread across jobs, customers, employees, and service lines — and every batch that ran."
    >
      <StellaTabs tabs={ALLOC_TABS} active={tab} onChange={setTab} />
      {tab === "rules" ? (
        <StellaScaffoldCard
          phase="P4"
          note="Unit Economics turns raw ledger costs into per-target profitability by applying allocation rules. Seven methods ship — the engine and rule editor land in P4."
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10, marginTop: 16 }}>
            {ALLOCATION_METHODS.map((m, i) => (
              <div
                key={m.name}
                style={{
                  border: `1px solid ${STELLA_LAVENDER}`,
                  borderRadius: 8,
                  padding: "12px 14px",
                  background: "#fff",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 20,
                      height: 20,
                      borderRadius: 99,
                      background: `${STELLA_INDIGO}18`,
                      color: STELLA_INDIGO,
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {i + 1}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#0B1C24" }}>{m.name}</span>
                </div>
                <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 6, lineHeight: 1.45 }}>{m.blurb}</div>
              </div>
            ))}
          </div>
        </StellaScaffoldCard>
      ) : (
        <StellaScaffoldCard
          phase="P4"
          note="Every allocation batch is recorded with its metadata, status, and per-transaction output — re-runnable and auditable. Refresh cadence is tier-gated: Standard weekly, Pro daily, Business hourly."
          bullets={["Batch metadata + status", "Per-transaction allocation output", "Tier-gated refresh cadence"]}
        />
      )}
    </StellaShell>
  );
}

export function StellaMarginsPage() {
  return (
    <StellaScaffoldPage
      title="Margins"
      subtitle="Profitability per job, per customer, per employee, and per service line."
      phase="P4"
      note="Once costs are allocated, margins roll up four ways so you can see exactly which jobs, customers, employees, and service lines make (or lose) money."
      bullets={["Per-Job margin", "Per-Customer margin", "Per-Employee margin", "Per-Service-Line margin"]}
    />
  );
}

export function StellaReconciliationPage() {
  return (
    <StellaScaffoldPage
      title="Reconciliation"
      subtitle="Reconcile allocated costs against OLIVER, SPARK, and ARION source data."
      phase="P4"
      note="OLIVER is the leading edge for live operations; once synced, STELLA's reconciled numbers supersede so ARGUS Cross-Platform reads one trusted figure."
      bullets={["OLIVER leading-edge, STELLA reconciled-supersedes", "Cross-checks SPARK + ARION signals", "Feeds the ARGUS serving snapshot"]}
    />
  );
}
