// SplitEditor — one charge, several accounts.
//
// STELLA pack 1, item 9. One trip to the hardware store is two accounts: $90 of
// materials and $60 of tools on a single $150 card charge. Before this the owner
// had two bad options — file the whole $150 under one heading and be wrong by
// $60 on the P&L forever, or type two rows that do not match the one line on
// their statement and never clear reconciliation. Both are the same defect.
//
// THE REGISTER ROW STAYS ONE ROW. That is the whole design: it still matches the
// bank statement line for line, and the categories hang off it. This editor only
// ever produces the split lines; the parent's amount is fixed and not editable
// from here.
//
// THE REMAINDER IS ALWAYS ON SCREEN. Splitting is arithmetic, and arithmetic the
// user has to do in their head is arithmetic they will get wrong — so the
// difference between the lines and the charge is shown live, named, and the Save
// button is refused until it is zero. "Split evenly" and "Put the rest here"
// exist because those are the two things people actually want to do.
import { Plus, Trash2, Split as SplitIcon } from "lucide-react";
import { STELLA_INDIGO, STELLA_LAVENDER, fmtMoney } from "./StellaShell";
import { jobOptionLabel, type CoaAccount, type JobLite } from "./RecordTransactionModal";

export interface SplitLine {
  coa_account_id: string;
  amount: string;   // kept as a STRING while typing: "1." and "" are states a
                    // number cannot hold, and coercing early eats the keystroke
  job_id: string;
  memo: string;
}

export function emptySplit(): SplitLine {
  return { coa_account_id: "", amount: "", job_id: "", memo: "" };
}

/** The sum of the lines, and what is left of the charge. */
export function splitTotals(lines: SplitLine[], target: number) {
  const total = lines.reduce((s, l) => {
    const n = Number(l.amount);
    return s + (Number.isFinite(n) ? n : 0);
  }, 0);
  const rounded = Number(total.toFixed(2));
  const remainder = Number((Math.abs(target) - rounded).toFixed(2));
  return { total: rounded, remainder, balanced: Math.round(remainder * 100) === 0 };
}

/** Is this set ready to save? Named, so the caller and the button agree. */
export function splitsReady(lines: SplitLine[], target: number): boolean {
  if (lines.length < 2) return false;
  if (lines.some((l) => !l.coa_account_id || !(Number(l.amount) > 0))) return false;
  return splitTotals(lines, target).balanced;
}

/** The wire shape the API takes. */
export function splitsForApi(lines: SplitLine[]) {
  return lines.map((l) => ({
    coa_account_id: l.coa_account_id,
    amount: Number(Number(l.amount).toFixed(2)),
    job_id: l.job_id || null,
    memo: l.memo.trim() || null,
  }));
}

export function SplitEditor({
  lines,
  onChange,
  /** The charge being split. Always used as a magnitude. */
  target,
  accounts,
  jobs,
  disabled,
}: {
  lines: SplitLine[];
  onChange: (next: SplitLine[]) => void;
  target: number;
  accounts: CoaAccount[];
  jobs: JobLite[];
  disabled?: boolean;
}) {
  const { total, remainder, balanced } = splitTotals(lines, target);
  const magnitude = Math.abs(target);
  const active = accounts.filter((a) => a.is_active !== false && a.is_active !== 0);

  const set = (i: number, patch: Partial<SplitLine>) =>
    onChange(lines.map((l, n) => (n === i ? { ...l, ...patch } : l)));
  const add = () => onChange([...lines, emptySplit()]);
  const remove = (i: number) => onChange(lines.filter((_, n) => n !== i));

  /** Divide the charge evenly, giving the ROUNDING to the first line so the set
   *  still foots. Three ways of $100 is 33.34 / 33.33 / 33.33, not 33.33 × 3. */
  const even = () => {
    const n = lines.length || 2;
    const each = Math.floor((magnitude / n) * 100) / 100;
    const first = Number((magnitude - each * (n - 1)).toFixed(2));
    onChange(lines.map((l, i) => ({ ...l, amount: String(i === 0 ? first : each) })));
  };

  /** Put whatever is left on one line — the common last step of a split. */
  const rest = (i: number) => {
    const others = lines.reduce((s, l, n) => {
      if (n === i) return s;
      const v = Number(l.amount);
      return s + (Number.isFinite(v) ? v : 0);
    }, 0);
    set(i, { amount: String(Number((magnitude - others).toFixed(2))) });
  };

  return (
    <div style={{ border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 8, padding: 12, background: "#FBFBFE" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: STELLA_INDIGO }}>
          <SplitIcon size={14} />
          Split across accounts
        </div>
        <button type="button" onClick={even} disabled={disabled || !magnitude} style={miniBtn(!!disabled || !magnitude)}>
          Split evenly
        </button>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {lines.map((l, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 96px auto", gap: 6, alignItems: "start" }}>
            <div style={{ display: "grid", gap: 4 }}>
              <select
                value={l.coa_account_id}
                disabled={disabled}
                onChange={(e) => set(i, { coa_account_id: e.target.value })}
                style={sInput}
              >
                <option value="">Select an account…</option>
                {active.map((a) => (
                  <option key={a.coa_account_id} value={a.coa_account_id}>
                    {a.code ? `${a.code} — ${a.name}` : a.name}
                  </option>
                ))}
              </select>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <select value={l.job_id} disabled={disabled} onChange={(e) => set(i, { job_id: e.target.value })} style={{ ...sInput, fontSize: 11 }}>
                  <option value="">No job</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>{jobOptionLabel(j)}</option>
                  ))}
                </select>
                <input
                  value={l.memo}
                  disabled={disabled}
                  onChange={(e) => set(i, { memo: e.target.value })}
                  placeholder="Note (optional)"
                  style={{ ...sInput, fontSize: 11 }}
                />
              </div>
            </div>
            <div style={{ display: "grid", gap: 4 }}>
              <input
                type="number" min="0.01" step="0.01" placeholder="0.00"
                value={l.amount}
                disabled={disabled}
                onChange={(e) => set(i, { amount: e.target.value })}
                style={{ ...sInput, textAlign: "right" }}
              />
              <button type="button" onClick={() => rest(i)} disabled={disabled} style={miniBtn(!!disabled)}>
                Put the rest here
              </button>
            </div>
            <button
              type="button"
              onClick={() => remove(i)}
              disabled={disabled || lines.length <= 2}
              title={lines.length <= 2 ? "A split needs at least two lines" : "Remove this line"}
              style={{ ...miniBtn(!!disabled || lines.length <= 2), padding: "7px 8px" }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
        <button type="button" onClick={add} disabled={disabled} style={miniBtn(!!disabled)}>
          <Plus size={12} /> Add a line
        </button>
        <div style={{ textAlign: "right", fontSize: 11 }}>
          <div style={{ color: "#5A7A8A" }}>
            Charge {fmtMoney(magnitude)} · lines {fmtMoney(total)}
          </div>
          <div style={{ fontWeight: 700, color: balanced ? "#047857" : "#B91C1C", marginTop: 2 }}>
            {balanced
              ? "The lines add up to the charge."
              : remainder > 0
                ? `${fmtMoney(remainder)} still to account for`
                : `${fmtMoney(Math.abs(remainder))} more than the charge`}
          </div>
        </div>
      </div>
    </div>
  );
}

const sInput: React.CSSProperties = {
  width: "100%", padding: "7px 9px", fontSize: 12,
  border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 6, background: "#fff", color: "#0B1C24",
};

function miniBtn(off: boolean): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4,
    padding: "5px 8px", fontSize: 10, fontWeight: 600,
    color: off ? "#94A3B8" : STELLA_INDIGO, background: "#fff",
    border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 5,
    cursor: off ? "not-allowed" : "pointer", whiteSpace: "nowrap",
  };
}
