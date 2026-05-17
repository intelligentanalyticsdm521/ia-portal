// Shared time-range selector with the standard Stripe-style presets.
// Use on any page that filters by date — Reports, Payments, Billing Overview, etc.
//
// Usage:
//   const [range, setRange] = useState(rangeForPreset("last_30_days"));
//   <TimeRangeSelector value={range} onChange={setRange} />
//
// Caller gets back { fromISO, toISO, preset } and uses fromISO/toISO in API calls.

import { useState, useRef, useEffect } from "react";

export type RangePreset =
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_30_days"
  | "last_90_days"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "last_quarter"
  | "this_year"
  | "last_12_months"
  | "last_year"
  | "last_365_days"
  | "all_time"
  | "custom"
  // Forward-looking (forecast) presets
  | "next_7_days"
  | "next_30_days"
  | "next_quarter"
  | "next_90_days"
  | "next_year";

export interface TimeRange {
  fromISO: string | null;
  toISO: string | null;
  preset: RangePreset;
  label: string;
}

const PRESET_LABELS: Record<RangePreset, string> = {
  today:           "Today",
  yesterday:       "Yesterday",
  last_7_days:     "Last 7 days",
  last_30_days:    "Last 30 days",
  last_90_days:    "Last 90 days",
  this_month:      "This month",
  last_month:      "Last month",
  this_quarter:    "This quarter",
  last_quarter:    "Last quarter",
  this_year:       "This year",
  last_12_months:  "Last 12 months",
  last_year:       "Last year",
  last_365_days:   "Last 365 days",
  all_time:        "All time",
  custom:          "Custom range",
  next_7_days:     "Next 7 days",
  next_30_days:    "Next 30 days",
  next_quarter:    "Next quarter",
  next_90_days:    "Next 90 days",
  next_year:       "Next year",
};

export function rangeForPreset(preset: RangePreset, fromISO?: string, toISO?: string): TimeRange {
  const now = new Date();
  const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
  const endOfDay   = (d: Date) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };

  let from: Date | null = null;
  let to: Date | null = endOfDay(now);

  switch (preset) {
    case "today":
      from = startOfDay(now); break;
    case "yesterday": {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      from = startOfDay(y); to = endOfDay(y); break;
    }
    case "last_7_days":
      from = startOfDay(new Date(now.getTime() - 6 * 86400000)); break;
    case "last_30_days":
      from = startOfDay(new Date(now.getTime() - 29 * 86400000)); break;
    case "last_90_days":
      from = startOfDay(new Date(now.getTime() - 89 * 86400000)); break;
    case "last_365_days":
      from = startOfDay(new Date(now.getTime() - 364 * 86400000)); break;
    case "this_month":
      from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0); break;
    case "last_month": {
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      to   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999); break;
    }
    case "this_quarter": {
      const q = Math.floor(now.getMonth() / 3);
      from = new Date(now.getFullYear(), q * 3, 1, 0, 0, 0, 0); break;
    }
    case "last_quarter": {
      const q = Math.floor(now.getMonth() / 3);
      from = new Date(now.getFullYear(), (q - 1) * 3, 1, 0, 0, 0, 0);
      to   = new Date(now.getFullYear(), q * 3, 0, 23, 59, 59, 999); break;
    }
    case "this_year":
      from = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0); break;
    case "last_12_months":
      from = startOfDay(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())); break;
    case "last_year":
      from = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0);
      to   = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999); break;
    case "all_time":
      from = null; to = null; break;
    case "custom":
      from = fromISO ? new Date(fromISO) : null;
      to   = toISO   ? new Date(toISO)   : null; break;
    // Forward-looking
    case "next_7_days":
      from = startOfDay(now); to = endOfDay(new Date(now.getTime() + 6 * 86400000)); break;
    case "next_30_days":
      from = startOfDay(now); to = endOfDay(new Date(now.getTime() + 29 * 86400000)); break;
    case "next_90_days":
      from = startOfDay(now); to = endOfDay(new Date(now.getTime() + 89 * 86400000)); break;
    case "next_quarter": {
      from = startOfDay(now);
      to = endOfDay(new Date(now.getFullYear(), now.getMonth() + 3, now.getDate())); break;
    }
    case "next_year": {
      from = startOfDay(now);
      to = endOfDay(new Date(now.getFullYear() + 1, now.getMonth(), now.getDate())); break;
    }
  }

  return {
    fromISO: from ? from.toISOString() : null,
    toISO:   to   ? to.toISOString()   : null,
    preset,
    label: PRESET_LABELS[preset],
  };
}

const HISTORY_PRESETS: RangePreset[] = [
  "today", "yesterday", "last_7_days", "last_30_days", "last_90_days",
  "this_month", "last_month", "this_quarter", "last_quarter",
  "this_year", "last_12_months", "last_year", "last_365_days", "all_time",
];
const FORECAST_PRESETS: RangePreset[] = [
  "next_7_days", "next_30_days", "next_quarter", "next_90_days", "next_year",
];

/** The equal-length window immediately BEFORE a range — for prev-period
 * comparison. Returns nulls for open-ended ranges. */
export function previousPeriod(r: TimeRange): { fromISO: string | null; toISO: string | null } {
  if (!r.fromISO || !r.toISO) return { fromISO: null, toISO: null };
  const from = new Date(r.fromISO).getTime();
  const to = new Date(r.toISO).getTime();
  const span = to - from;
  return {
    fromISO: new Date(from - span - 1).toISOString(),
    toISO: new Date(from - 1).toISOString(),
  };
}

interface Props {
  value: TimeRange;
  onChange: (r: TimeRange) => void;
  /** "history" (default) shows backward presets; "forecast" shows next-N. */
  mode?: "history" | "forecast";
}

export function TimeRangeSelector({ value, onChange, mode = "history" }: Props) {
  const presetList = mode === "forecast" ? FORECAST_PRESETS : HISTORY_PRESETS;
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setShowCustom(false);
      }
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function pick(p: RangePreset) {
    if (p === "custom") {
      setShowCustom(true);
      return;
    }
    onChange(rangeForPreset(p));
    setOpen(false);
  }

  function applyCustom() {
    if (!customFrom || !customTo) return;
    onChange(rangeForPreset("custom", customFrom + "T00:00:00", customTo + "T23:59:59"));
    setOpen(false); setShowCustom(false);
  }

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontSize: 12, fontWeight: 500, padding: "6px 12px",
          background: "#fff", border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6,
          color: "#0B1C24", cursor: "pointer",
        }}
      >
        <span style={{ color: "#5A7A8A" }}>Date range</span>
        <strong>{value.label}</strong>
        <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 4.5L6 7.5L9 4.5" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0,
          background: "#fff", border: "1px solid rgba(45,156,219,0.18)", borderRadius: 8,
          minWidth: 220, padding: 4, zIndex: 50,
          boxShadow: "0 8px 24px -6px rgba(0,0,0,0.12)",
        }}>
          {!showCustom ? (
            <>
              {presetList.map((p) => (
                <button
                  key={p}
                  onClick={() => pick(p)}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "7px 12px", fontSize: 12,
                    background: value.preset === p ? "#E8F4FB" : "transparent",
                    color: value.preset === p ? "#1A7DB5" : "#0B1C24",
                    fontWeight: value.preset === p ? 600 : 400,
                    border: "none", cursor: "pointer", borderRadius: 4,
                  }}
                >
                  {PRESET_LABELS[p]}
                </button>
              ))}
              <button
                onClick={() => setShowCustom(true)}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  padding: "7px 12px", fontSize: 12,
                  background: value.preset === "custom" ? "#E8F4FB" : "transparent",
                  color: value.preset === "custom" ? "#1A7DB5" : "#0B1C24",
                  fontWeight: value.preset === "custom" ? 600 : 400,
                  border: "none", cursor: "pointer", borderRadius: 4,
                  borderTop: "1px solid #eee", marginTop: 4,
                }}
              >
                Custom range…
              </button>
            </>
          ) : (
            <div style={{ padding: 10 }}>
              <div style={{ fontSize: 11, color: "#5A7A8A", marginBottom: 6 }}>From</div>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                style={{ width: "100%", padding: 6, border: "1px solid #ddd", borderRadius: 4, fontSize: 12, marginBottom: 8 }} />
              <div style={{ fontSize: 11, color: "#5A7A8A", marginBottom: 6 }}>To</div>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                style={{ width: "100%", padding: 6, border: "1px solid #ddd", borderRadius: 4, fontSize: 12, marginBottom: 10 }} />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                <button onClick={() => setShowCustom(false)} style={{ fontSize: 11, padding: "5px 10px", border: "1px solid #ddd", borderRadius: 4, background: "#fff", cursor: "pointer" }}>Cancel</button>
                <button onClick={applyCustom} disabled={!customFrom || !customTo}
                  style={{ fontSize: 11, padding: "5px 10px", border: "none", borderRadius: 4, background: "#0C4A60", color: "#fff", cursor: "pointer" }}>
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
