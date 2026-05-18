import { useState } from "react";
import { OliverQuotesPage } from "./OliverQuotesPage";
import { OliverProposalsPage } from "./OliverProposalsPage";

// One nav destination for Quotes + Proposals (a proposal is a beefed-up
// quote). Split-tab view; each tab keeps its own list + create flow
// (QuoteCreateForm already defaults to Quote with a Proposal toggle).
export function OliverQuotesProposalsPage() {
  const [tab, setTab] = useState<"quotes" | "proposals">("quotes");
  return (
    <div>
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
      {tab === "quotes" ? <OliverQuotesPage /> : <OliverProposalsPage />}
    </div>
  );
}
