// StellaLedgerShellPages — the remaining scaffolded Ledger surfaces after the
// 2026-07-30 nav consolidation (8-item cap; house pattern: fewer pages, tabs).
//
//   - StellaMileageMaterialsPage — ONE nav item, two in-page tabs (Mileage |
//     Materials); replaces the two single scaffold pages. Data lands P3.
//   - StellaBankPage + StellaPeriodClosePage — moved OUT of the STELLA nav
//     into the SETTINGS hub (keys stella_settings_bank /
//     stella_settings_period_close). They are configuration surfaces, not
//     daily-work pages. StellaBankPage is the DESIGN-COMPLETE "Bank and card
//     accounts" page (2026-07-30 design pass): real chrome + account-type
//     explainers, honest "lands with bank feeds" state — no fake connected
//     accounts, connect button opens an honest IadmModal explainer.
//
// Retired from this module (absorbed elsewhere): Income + Recurring (tabs on
// Transactions), Receipts (modal hint on Transactions until OCR ships),
// Balance Sheet / Cash Flow / AR Aging / AP Aging / Sales Tax / 1099
// (report picker on StellaReportsPage).
import { useState } from "react";
import { Banknote, CreditCard, Landmark, Wallet } from "lucide-react";
import { IadmModal, IadmButton } from "../../components/IadmModal";
import { Button } from "../../components/oliver/ui";
import { StellaScaffoldCard, StellaScaffoldPage, StellaShell, StellaTabs, STELLA_INDIGO, STELLA_LAVENDER } from "./StellaShell";

// ── Mileage & Materials (one page, two tabs) ─────────────────────────────────

const MM_TABS = [
  { key: "mileage", label: "Mileage" },
  { key: "materials", label: "Materials" },
];

export function StellaMileageMaterialsPage() {
  const [tab, setTab] = useState("mileage");
  return (
    <StellaShell
      title="Mileage & Materials"
      subtitle="Job-cost capture — business miles at the IRS rate, and materials that feed per-job margin."
      showRecord
    >
      <StellaTabs tabs={MM_TABS} active={tab} onChange={setTab} />
      {tab === "mileage" ? (
        <StellaScaffoldCard
          phase="P3"
          note="Log business miles and STELLA applies the current IRS rate to compute your deduction. GPS-assisted capture arrives in a later phase."
          bullets={["Manual trip entry", "Current IRS deduction rate", "Rolls into your P&L and Schedule-C view"]}
        />
      ) : (
        <StellaScaffoldCard
          phase="P3"
          tier="Pro"
          note="Track materials purchased for jobs so they flow into per-job costing and unit economics."
          bullets={["Per-job materials capture", "Feeds job-level margin", "Pro tier and above"]}
        />
      )}
    </StellaShell>
  );
}

// ── Settings-hub surfaces (SETTINGS_NAV → STELLA group) ──────────────────────

// StellaBankPage — "Bank and card accounts" (key stella_settings_bank).
// Design-complete cosmetic page: the real chrome a business will use to link
// accounts, shipped honestly ahead of the feeds themselves. No fake connected
// accounts; the connect button opens an explainer modal, and the account-type
// row documents the "Personal card — business use" designation that drives
// the reimbursable flow already live on Transactions/Overview.
export function StellaBankPage() {
  const [connectOpen, setConnectOpen] = useState(false);

  return (
    <StellaShell
      title="Bank and card accounts"
      subtitle="Link the accounts your business runs on — balances and transactions pull in automatically."
      actions={
        <Button variant="primary" style={{ background: STELLA_INDIGO }} onClick={() => setConnectOpen(true)}>
          Connect a bank or card
        </Button>
      }
    >
      {/* Connected accounts — honest empty state (no fake rows, ever) */}
      <div style={bankCard}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0B1C24" }}>Connected accounts</div>
          <span style={{ fontSize: 10, fontWeight: 700, color: STELLA_INDIGO, background: `${STELLA_INDIGO}14`, padding: "2px 8px", borderRadius: 99, whiteSpace: "nowrap" }}>
            Lands with bank feeds
          </span>
        </div>
        <div style={{ padding: "20px 0 8px", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 12 }}>
            <span style={bankIconDisc}><Landmark size={18} color={STELLA_INDIGO} /></span>
            <span style={bankIconDisc}><CreditCard size={18} color={STELLA_INDIGO} /></span>
          </div>
          <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.55, maxWidth: 380, margin: "0 auto" }}>
            Connect your bank and cards to pull balances and transactions automatically. New activity lands in the
            Ledger Inbox for a one-tap review on your tier's cadence.
          </div>
        </div>
      </div>

      {/* Account types explainer */}
      <div style={{ margin: "16px 0 8px", fontSize: 12, fontWeight: 700, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.4 }}>
        Account types
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
        <div style={bankCard}>
          <span style={bankIconDisc}><Landmark size={18} color={STELLA_INDIGO} /></span>
          <div style={bankTypeTitle}>Checking &amp; savings</div>
          <div style={bankTypeCopy}>
            Your operating accounts. Deposits post as income candidates, withdrawals as expense candidates — everything
            reviewable in the Inbox before it touches a report.
          </div>
        </div>
        <div style={bankCard}>
          <span style={bankIconDisc}><CreditCard size={18} color={STELLA_INDIGO} /></span>
          <div style={bankTypeTitle}>Business credit card</div>
          <div style={bankTypeCopy}>
            Card charges flow straight into the ledger as business expenses, matched to receipts once OCR lands.
          </div>
        </div>
        <div style={{ ...bankCard, border: `1px solid ${STELLA_INDIGO}55` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={bankIconDisc}><Wallet size={18} color={STELLA_INDIGO} /></span>
            <span style={{ fontSize: 10, fontWeight: 700, color: STELLA_INDIGO, background: `${STELLA_INDIGO}14`, padding: "2px 8px", borderRadius: 99 }}>
              Personal card — business use
            </span>
          </div>
          <div style={bankTypeTitle}>Personal card you use for the business</div>
          <div style={bankTypeCopy}>
            Designate a personal card as business-use and its expenses default to "needs reimbursement" — they roll into
            the Owed to you total on the Overview until you pay yourself back and mark them reimbursed.
          </div>
        </div>
      </div>

      {/* Honest connect explainer — no fake OAuth, no fake institutions */}
      {connectOpen && (
        <IadmModal
          open
          onClose={() => setConnectOpen(false)}
          product="stella"
          size="nav"
          title="Bank feeds are almost here"
          subtitle="Connecting arrives with the ingestion phase"
          footer={<IadmButton variant="primary" onClick={() => setConnectOpen(false)}>Got it</IadmButton>}
        >
          <div style={{ padding: "20px 24px", display: "grid", gap: 12 }}>
            <div style={{ display: "flex", gap: 10 }}>
              <span style={bankIconDisc}><Banknote size={18} color={STELLA_INDIGO} /></span>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#0B1C24", alignSelf: "center" }}>
                Secure, read-only bank and card feeds
              </div>
            </div>
            <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.6 }}>
              This is where you'll link checking, savings, and card accounts. Bank feeds land with the Ledger's
              ingestion phase — once live, transactions pull in automatically on your tier's cadence (weekly, daily, or
              hourly) and queue in the Inbox for a one-tap review.
            </div>
            <div style={{ fontSize: 12, color: "#5A7A8A", lineHeight: 1.6, background: STELLA_LAVENDER, borderRadius: 8, padding: "10px 12px" }}>
              Nothing to configure yet — until then, record income and expenses manually with the + Record button on any
              Ledger page. Everything you enter now carries forward unchanged.
            </div>
          </div>
        </IadmModal>
      )}
    </StellaShell>
  );
}

const bankCard: React.CSSProperties = { background: "#fff", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 12, padding: "16px 18px" };
const bankIconDisc: React.CSSProperties = { width: 40, height: 40, borderRadius: 99, background: STELLA_LAVENDER, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };
const bankTypeTitle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: "#0B1C24", marginTop: 10 };
const bankTypeCopy: React.CSSProperties = { fontSize: 11.5, color: "#5A7A8A", lineHeight: 1.55, marginTop: 4 };

export function StellaPeriodClosePage() {
  return (
    <StellaScaffoldPage
      title="Period Close"
      subtitle="Close a month, lock prior periods, and post adjusting entries."
      phase="P5"
      note="Run a monthly close: reconcile, post adjusting entries, then lock the period so the books stay trustworthy."
      bullets={["Monthly close checklist", "Lock prior periods", "Adjusting entries"]}
    />
  );
}
