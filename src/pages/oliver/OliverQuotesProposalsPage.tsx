import { useState } from "react";
import { FileText, ScrollText } from "lucide-react";
import { OliverQuotesPage } from "./OliverQuotesPage";
import { OliverProposalsPage } from "./OliverProposalsPage";

// One nav destination for Quotes + Proposals.
//
// Founder 2026-08-19: the page leads with TWO big card buttons — create a
// quote, create a proposal — each saying when you'd reach for it. Before this,
// the visible create buttons were both quote-shaped (the Quotes tab's header
// button and its empty-state button) and the proposal editor could only be
// found by switching tabs first. The cards drive whichever editor is asked
// for and switch the tab underneath so the new document lands in view.
export function OliverQuotesProposalsPage() {
  const [tab, setTab] = useState<"quotes" | "proposals">("quotes");
  // Bump-to-open signals for the child pages' modal editors. Zero = untouched.
  const [quoteSignal, setQuoteSignal] = useState(0);
  const [proposalSignal, setProposalSignal] = useState(0);

  function createQuote() {
    setTab("quotes");
    setQuoteSignal((n) => n + 1);
  }
  function createProposal() {
    setTab("proposals");
    setProposalSignal((n) => n + 1);
  }

  // Founder sketch 2026-08-19: two big square-ish cards, centred, as THE way
  // in — not a small header button.
  const card: React.CSSProperties = {
    width: 320, minHeight: 150, textAlign: "left", cursor: "pointer",
    background: "#fff", border: "1px solid #DBE7ED", borderRadius: 12,
    padding: "20px 22px", display: "flex", flexDirection: "column", gap: 10,
    alignItems: "flex-start", boxShadow: "0 1px 4px rgba(11,28,36,0.08)",
  };
  const iconWrap: React.CSSProperties = {
    width: 38, height: 38, borderRadius: 8, display: "flex",
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  };

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, padding: "20px 16px 4px", justifyContent: "center" }}>
        <button style={card} onClick={createQuote}>
          <span style={{ ...iconWrap, background: "#E8F3F8", color: "#1A7DB5" }}>
            <FileText size={18} />
          </span>
          <span>
            <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: "#0B1C24" }}>
              Create a quote
            </span>
            <span style={{ display: "block", fontSize: 11.5, color: "#5A7A8A", marginTop: 3, lineHeight: 1.45 }}>
              A price for a known job — line items and totals the customer can
              accept. Accepted quotes flow straight to a job and an invoice.
            </span>
          </span>
        </button>

        <button style={card} onClick={createProposal}>
          <span style={{ ...iconWrap, background: "#F1EDFB", color: "#7C3AED" }}>
            <ScrollText size={18} />
          </span>
          <span>
            <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: "#0B1C24" }}>
              Create a proposal
            </span>
            <span style={{ display: "block", fontSize: 11.5, color: "#5A7A8A", marginTop: 3, lineHeight: 1.45 }}>
              A pitch document — written sections, services pulled from your
              catalogue with their descriptions, tracked send and
              click-to-accept. Use it when you're selling the work, not just
              pricing it.
            </span>
          </span>
        </button>
      </div>

      <div className="ptabs" style={{ padding: "12px 16px 0", display: "flex", gap: 4 }}>
        <button
          className={`ptab${tab === "quotes" ? " active" : ""}`}
          onClick={() => setTab("quotes")}
        >
          Quotes
        </button>
        <button
          className={`ptab${tab === "proposals" ? " active" : ""}`}
          onClick={() => setTab("proposals")}
        >
          Proposals
        </button>
      </div>
      {tab === "quotes"
        ? <OliverQuotesPage embedded createSignal={quoteSignal} />
        : <OliverProposalsPage embedded createSignal={proposalSignal} />}
    </div>
  );
}
