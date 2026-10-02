// InboxBulkBar — the Ledger Inbox's selection-mode bar, and the sentence a row
// shows when there is no category to pick. Props only: the Inbox page owns the
// state and the calls; test/stella-inbox-bulk.test.mjs renders this directly.
//
// One bar, two actions: a category picker with "Assign N to this category",
// and "Mark N personal" — which asks once, here in the page (the Bank page's
// inline "Yes, disconnect" style), naming the count. Lines an action does not
// apply to (money in for Personal; the other direction when a pick mixes money
// in and out and the category is an income or expense one) are counted out
// loud before and after, never dropped silently. While a batch is being sent
// the bar says how far it has got, and the answer is said HERE as well — the
// bar is sticky, so the answer is on screen wherever the owner has scrolled.
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/oliver/ui/Button";
import { STELLA_INDIGO, STELLA_LAVENDER } from "./stellaTheme";
import { MONEY_IN_PERSONAL_RULE, assignSkipRule, bulkPersonalQuestion } from "./inboxBulk";
import { STELLA_SETUP_ROUTES } from "./stellaSetupSteps";

const linkButton = {
  padding: 0,
  border: 0,
  background: "transparent",
  color: STELLA_INDIGO,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
} as const;

/**
 * In place of a category picker that has nothing in it: says why, in words,
 * with the way to the categories page (and Try again when the read failed).
 */
export function CategoryNote({ problem, onRetry }: { problem: string; onRetry?: () => void }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 11, color: "#5A7A8A" }}>
      <span>{problem}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} style={{ ...linkButton, fontSize: 11 }}>
          Try again
        </button>
      )}
      <Link to={STELLA_SETUP_ROUTES.coa} style={{ fontSize: 11, fontWeight: 600, color: STELLA_INDIGO }}>
        Edit categories
      </Link>
    </span>
  );
}

export function InboxBulkBar({
  shownCount,
  selectedCount,
  allSelected,
  onSelectAll,
  onClear,
  onDone,
  picker,
  categoryPicked,
  onAssign,
  assignEligible,
  assignSkipped = 0,
  assignSkippedSide = null,
  moneyIn = 0,
  moneyOut = 0,
  personalEligible,
  personalSkipped,
  asking,
  onAskPersonal,
  onConfirmPersonal,
  onCancelPersonal,
  busy,
  progress = null,
  result = null,
}: {
  /** Rows on screen right now (after the search box and the filter). */
  shownCount: number;
  /** Selected rows that are on screen — what an action would change. */
  selectedCount: number;
  allSelected: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  /** Leave selection mode. */
  onDone: () => void;
  /** The category picker — or a CategoryNote when there is nothing to pick. */
  picker: ReactNode;
  categoryPicked: boolean;
  onAssign: () => void;
  /** Selected rows "Assign" applies to (defaults to every selected row). */
  assignEligible?: number;
  /** Selected rows "Assign" leaves out, and which way their money goes. */
  assignSkipped?: number;
  assignSkippedSide?: "in" | "out" | null;
  /** How the selection splits by direction (for the "mixed" note). */
  moneyIn?: number;
  moneyOut?: number;
  /** Selected rows Personal applies to, and the ones it does not. */
  personalEligible: number;
  personalSkipped: number;
  /** The in-page "Mark N personal?" question is open. */
  asking: boolean;
  onAskPersonal: () => void;
  onConfirmPersonal: () => void;
  onCancelPersonal: () => void;
  busy: "categorize" | "personal" | null;
  /** Lines sent so far while an action runs. */
  progress?: { sent: number; total: number } | null;
  /** The answer to the last action, said inside the bar. */
  result?: ReactNode;
}) {
  const none = selectedCount === 0;
  const assignCount = assignEligible ?? selectedCount;
  const sofar = progress && progress.total > 0 ? ` ${progress.sent} of ${progress.total}` : "";
  const lines = (n: number) => (n === 1 ? "line" : "lines");
  return (
    <div
      data-bulk-bar="1"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 30,
        background: "#fff",
        border: `1px solid ${STELLA_INDIGO}55`,
        borderRadius: 10,
        padding: "10px 14px",
        marginBottom: 10,
        boxShadow: "0 4px 14px rgba(11,28,36,0.06)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#0B1C24" }}>
          {none ? "Nothing selected yet" : `${selectedCount} selected`}
        </span>
        {none && (
          <span style={{ fontSize: 11, color: "#5A7A8A" }}>
            Tick the lines to change, or click a line and shift-click another to pick everything between.
          </span>
        )}
        {shownCount > 0 && !allSelected && (
          <button type="button" onClick={onSelectAll} style={linkButton}>
            Select all {shownCount} shown
          </button>
        )}
        {!none && (
          <button type="button" onClick={onClear} style={{ ...linkButton, color: "#5A7A8A" }}>
            Clear
          </button>
        )}
        <span style={{ flex: 1 }} />
        <Button variant="secondary" size="sm" onClick={onDone}>
          Done
        </Button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 10, paddingTop: 10, borderTop: `1px solid ${STELLA_LAVENDER}` }}>
        {picker}
        <Button
          variant="primary"
          size="sm"
          style={{ background: STELLA_INDIGO }}
          onClick={onAssign}
          disabled={none || !categoryPicked || busy !== null || assignCount === 0}
          loading={busy === "categorize"}
        >
          {busy === "categorize"
            ? `Assigning…${sofar}`
            : none
              ? "Assign to this category"
              : !categoryPicked
                ? "Pick a category first"
                : `Assign ${assignCount} to this category`}
        </Button>
        <span style={{ fontSize: 11, color: "#94A3B8" }}>or</span>
        <Button
          variant="secondary"
          size="sm"
          onClick={onAskPersonal}
          disabled={personalEligible === 0 || busy !== null || asking}
          loading={busy === "personal"}
        >
          {busy === "personal" ? `Marking…${sofar}` : none ? "Mark personal" : `Mark ${personalEligible} personal`}
        </Button>
        {!none && personalEligible === 0 && (
          <span style={{ fontSize: 11, color: "#5A7A8A" }}>
            None of these can be marked personal: {MONEY_IN_PERSONAL_RULE}.
          </span>
        )}
        {personalEligible > 0 && personalSkipped > 0 && (
          <span style={{ fontSize: 11, color: "#5A7A8A" }}>
            {personalSkipped} money-in {personalSkipped === 1 ? "line" : "lines"} will be left as {personalSkipped === 1 ? "it is" : "they are"}.
          </span>
        )}
      </div>

      {!none && moneyIn > 0 && moneyOut > 0 && (
        <div data-bulk-mixed="1" style={{ marginTop: 8, fontSize: 11, color: "#5A7A8A", lineHeight: 1.5 }}>
          You picked {moneyIn} money-in and {moneyOut} money-out {lines(moneyIn + moneyOut)}.
          {categoryPicked && assignSkipped > 0
            ? ` Assigning leaves the ${assignSkipped} money-${assignSkippedSide === "out" ? "out" : "in"} ${lines(assignSkipped)} as ${assignSkipped === 1 ? "it is" : "they are"}: ${assignSkipRule(assignSkippedSide)}.`
            : ""}
        </div>
      )}

      {result && (
        <div data-bulk-result="1" role="status" style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${STELLA_LAVENDER}`, fontSize: 12, lineHeight: 1.5 }}>
          {result}
        </div>
      )}

      {asking && personalEligible > 0 && (
        <div
          role="alertdialog"
          aria-label={`Mark ${personalEligible} personal?`}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 10, padding: "10px 12px", fontSize: 12, color: "#7A2E0E", background: "#FFFAEB", border: "1px solid #FEDF89", borderRadius: 8, lineHeight: 1.5 }}
        >
          <span style={{ maxWidth: 640 }}>{bulkPersonalQuestion(personalEligible, personalSkipped)}</span>
          <span style={{ display: "inline-flex", gap: 8 }}>
            <Button variant="primary" size="sm" onClick={onConfirmPersonal} disabled={busy !== null}>
              Yes, mark {personalEligible} personal
            </Button>
            <Button variant="secondary" size="sm" onClick={onCancelPersonal} disabled={busy !== null}>
              Cancel
            </Button>
          </span>
        </div>
      )}
    </div>
  );
}
