/**
 * builder/HistoryPanel.tsx — "What you've changed" (M-7).
 *
 * Elementor's history panel in our words. Every step is named at the moment it
 * happens (`history.ts` `push(..., label)`), listed newest first, and clicking
 * one travels there. The steps AFTER the one you are on stay listed and greyed
 * until the next edit, which is the whole difference between a history and an
 * undo button: you can look at where you were and come back.
 */
import { X } from "lucide-react";
import type { HistoryStep } from "./history";

export interface HistoryPanelProps {
  steps: HistoryStep[];
  onTravel: (index: number) => void;
  onClose: () => void;
}

export function HistoryPanel(p: HistoryPanelProps) {
  return (
    /* NO SCRIM (D-172, round 2).
       In the reference, History IS the left panel — the panel becomes History
       and the page beside it stays fully usable, which is the point of a
       history: you look at where you were WHILE looking at the page. Ours was
       a drawer on the right over a dark wash across the whole editor, so the
       one thing you wanted to compare against was greyed out behind it.
       The panel on the right is the agreed difference (a); the scrim was not,
       and it is deleted, along with the click-the-scrim-to-close it carried —
       Escape and the X close it, and Escape now reaches it (BuilderShell's
       `onShortcut`, same round). */
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9560, display: "flex", justifyContent: "flex-end", pointerEvents: "none" }}
    >
      <div
        data-builder-history="1"
        role="dialog"
        aria-label="History"
        style={{ width: "min(320px, 100vw)", background: "#fff", boxShadow: "-16px 0 40px rgba(0,0,0,0.2)", display: "flex", flexDirection: "column", pointerEvents: "auto" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", borderBottom: "1px solid #EEF2F6" }}>
          <strong style={{ fontSize: 13.5, color: "#0B1C24" }}>History</strong>
          <button type="button" onClick={p.onClose} aria-label="Close" title="Close"
            style={{ marginLeft: "auto", border: "none", background: "transparent", cursor: "pointer", color: "#64748B" }}>
            <X size={14} />
          </button>
        </div>
        {/* THE TWO TABS (D-172, round 2). The reference's history panel has
            Actions and Revisions, each with its own list and its own empty
            state. We keep no revisions of a document in the editor — a saved
            proposal's versions are the adapter's, reached from the list, and a
            tab that opened onto "nothing here" every time is worse than none.
            Recorded as an agreed omission in the handoff rather than built
            hollow; Actions is the list below, under its own heading. */}
        <div data-history-tab="actions"
          style={{ padding: "8px 14px 0", fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>
          Actions
        </div>
        {/* THE COACHING PARAGRAPH IS DELETED (D-172). No reference panel
            carries one; the list explains itself. */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0 10px" }}>
          {p.steps.map((s) => (
            <button
              key={s.index}
              type="button"
              data-history-step={s.index}
              aria-current={s.current}
              title={s.current ? `${s.label} — this is where you are` : `Go back to: ${s.label}`}
              onClick={() => p.onTravel(s.index)}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
                border: "none", background: s.current ? "#F1F5F9" : "transparent",
                padding: "6px 14px", cursor: "pointer",
                color: s.ahead ? "#94A3B8" : "#0B1C24",
                fontWeight: s.current ? 700 : 400, fontSize: 12.5,
              }}
            >
              <span style={{
                width: 6, height: 6, borderRadius: 999, flex: "0 0 auto",
                background: s.current ? "#0C4A60" : s.ahead ? "#CBD5E1" : "#94A3B8",
              }} />
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.label}
              </span>
              {s.current && <span style={{ marginLeft: "auto", fontSize: 10, color: "#5A7A8A" }}>you are here</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default HistoryPanel;
