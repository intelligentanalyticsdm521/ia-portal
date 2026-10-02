// InboxBulkBar — the Ledger Inbox's selection-mode bar, and the sentence a row
// shows when there is no category to pick. Props only: the Inbox page owns the
// state and the calls; test/stella-inbox-bulk.test.mjs renders this directly.
//
// One bar, two actions: a category picker with "Assign N to this category",
// and "Mark N personal" — which asks once, here in the page (the Bank page's
// inline "Yes, disconnect" style), naming the count. Money-in lines Personal
// does not apply to are counted out loud before and after, never dropped
// silently.
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/oliver/ui/Button";
import { STELLA_INDIGO, STELLA_LAVENDER } from "./stellaTheme";
import { MONEY_IN_PERSONAL_RULE, bulkPersonalQuestion } from "./inboxBulk";
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
  personalEligible,
  personalSkipped,
  asking,
  onAskPersonal,
  onConfirmPersonal,
  onCancelPersonal,
  busy,
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
  /** Selected rows Personal applies to, and the ones it does not. */
  personalEligible: number;
  personalSkipped: number;
  /** The in-page "Mark N personal?" question is open. */
  asking: boolean;
  onAskPersonal: () => void;
  onConfirmPersonal: () => void;
  onCancelPersonal: () => void;
  busy: "categorize" | "personal" | null;
}) {
  const none = selectedCount === 0;
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
          disabled={none || !categoryPicked || busy !== null}
          loading={busy === "categorize"}
        >
          {busy === "categorize"
            ? "Assigning…"
            : none
              ? "Assign to this category"
              : !categoryPicked
                ? "Pick a category first"
                : `Assign ${selectedCount} to this category`}
        </Button>
        <span style={{ fontSize: 11, color: "#94A3B8" }}>or</span>
        <Button
          variant="secondary"
          size="sm"
          onClick={onAskPersonal}
          disabled={personalEligible === 0 || busy !== null || asking}
          loading={busy === "personal"}
        >
          {busy === "personal" ? "Marking…" : none ? "Mark personal" : `Mark ${personalEligible} personal`}
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
