// DbManagerKit — the shared pieces every Database Manager page uses.
//
// Deliberately small and local: these are DB-Manager-shaped (a data table with
// typed cells, a tier-gate panel, an empty state that explains itself) and not
// general enough to belong in src/components. Colours and spacing come from
// StellaShell so the surface reads as one product with the Ledger.
import { useState, isValidElement, type ReactNode } from "react";
import { Lock, Inbox, AlertCircle } from "lucide-react";
import { STELLA_INDIGO, STELLA_LAVENDER } from "../StellaShell";
import { isTierGateError } from "../../../hooks/useStellaApi";

export const CARD: React.CSSProperties = {
  background: "#fff",
  border: `1px solid ${STELLA_LAVENDER}`,
  borderRadius: 10,
  padding: 16,
};

export function DbCard({ title, actions, children, style }: {
  title?: string; actions?: ReactNode; children: ReactNode; style?: React.CSSProperties;
}) {
  return (
    <div style={{ ...CARD, ...style }}>
      {(title || actions) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          {title && <div style={{ fontSize: 13, fontWeight: 700, color: "#0B1C24" }}>{title}</div>}
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

export function DbButton({ children, onClick, variant = "primary", disabled, type = "button", title }: {
  children: ReactNode;
  // Receives the event so a button rendered INSIDE a clickable table row can
  // stopPropagation() — otherwise a row-level Delete also opens the row.
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  variant?: "primary" | "ghost" | "danger";
  disabled?: boolean; type?: "button" | "submit"; title?: string;
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: STELLA_INDIGO, color: "#fff", border: `1px solid ${STELLA_INDIGO}` },
    ghost: { background: "#fff", color: STELLA_INDIGO, border: `1px solid ${STELLA_LAVENDER}` },
    danger: { background: "#fff", color: "#B42318", border: "1px solid #FDA29B" },
  };
  return (
    <button
      type={type} onClick={onClick} disabled={disabled} title={title}
      style={{
        ...styles[variant], padding: "7px 13px", borderRadius: 7, fontSize: 12, fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

export function DbInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{
    padding: "7px 10px", borderRadius: 7, border: `1px solid ${STELLA_LAVENDER}`,
    fontSize: 12, color: "#0B1C24", width: "100%", ...props.style,
  }} />;
}

export function DbSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} style={{
    padding: "7px 10px", borderRadius: 7, border: `1px solid ${STELLA_LAVENDER}`,
    fontSize: 12, color: "#0B1C24", background: "#fff", width: "100%", ...props.style,
  }} />;
}

export function DbField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 3 }}>{hint}</div>}
    </label>
  );
}

/**
 * Empty state. `reason` says WHY it is empty, because "nothing here" and
 * "nothing here yet, and that is correct" are different messages — the
 * Data Engineer warning queue is the case that forced this.
 */
export function DbEmpty({ title, reason }: { title: string; reason?: string }) {
  return (
    <div style={{ textAlign: "center", padding: "36px 20px", color: "#5A7A8A" }}>
      <Inbox size={26} color="#C7D0DB" />
      <div style={{ fontSize: 13, fontWeight: 600, color: "#334155", marginTop: 10 }}>{title}</div>
      {reason && <div style={{ fontSize: 11, marginTop: 6, maxWidth: 460, margin: "6px auto 0", lineHeight: 1.5 }}>{reason}</div>}
    </div>
  );
}

/**
 * One error renderer for every page. A tier-gate 403 is NOT an error the user
 * caused, so it gets an upgrade panel rather than a red banner.
 */
export function DbError({ error }: { error: unknown }) {
  if (!error) return null;
  if (isTierGateError(error)) {
    // stellaApi throws the gate as { type, tierRequired, currentTier } — the
    // camelCase shape, NOT the snake_case body the API sent.
    const e = error as { tierRequired?: string; currentTier?: string };
    return (
      <div style={{ ...CARD, textAlign: "center", padding: "34px 24px" }}>
        <Lock size={22} color={STELLA_INDIGO} />
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0B1C24", marginTop: 10 }}>
          Database Manager is on {cap(e.tierRequired || "Standard")} and above
        </div>
        <div style={{ fontSize: 12, color: "#5A7A8A", marginTop: 6 }}>
          Your plan is {cap(e.currentTier || "current")}. Upgrade to organise, tag and import your data.
        </div>
        <div style={{ marginTop: 14 }}>
          <a href="/app/billing" style={{
            display: "inline-block", background: STELLA_INDIGO, color: "#fff", padding: "8px 16px",
            borderRadius: 7, fontSize: 12, fontWeight: 600, textDecoration: "none",
          }}>See plans</a>
        </div>
      </div>
    );
  }
  const msg = (error as { message?: string })?.message || String(error);
  return (
    <div style={{
      display: "flex", gap: 8, alignItems: "flex-start", background: "#FEF3F2",
      border: "1px solid #FDA29B", borderRadius: 8, padding: "10px 12px", marginBottom: 14,
    }}>
      <AlertCircle size={15} color="#B42318" style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ fontSize: 12, color: "#B42318", lineHeight: 1.5 }}>{msg}</div>
    </div>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "brand" }) {
  const tones: Record<string, React.CSSProperties> = {
    neutral: { background: "#F1F5F9", color: "#475569" },
    good: { background: "#ECFDF3", color: "#027A48" },
    warn: { background: "#FFFAEB", color: "#B54708" },
    bad: { background: "#FEF3F2", color: "#B42318" },
    brand: { background: STELLA_LAVENDER, color: STELLA_INDIGO },
  };
  return (
    <span style={{
      ...tones[tone], display: "inline-block", padding: "2px 8px", borderRadius: 99,
      fontSize: 10, fontWeight: 700, whiteSpace: "nowrap",
    }}>{children}</span>
  );
}

export type DbColumn = { key: string; label: string; type?: string };

/** Render a value the way its declared type deserves. */
export function renderCell(value: unknown, type?: string): ReactNode {
  if (value === null || value === undefined || value === "") {
    return <span style={{ color: "#C7D0DB" }}>—</span>;
  }
  // Callers substitute JSX for a cell (a Pill, an icon, a row action button).
  // Without this the default branch's String(value) renders "[object Object]" —
  // which is exactly what it did until the Tags assignment modal showed it.
  if (isValidElement(value)) return value;
  switch (type) {
    case "bool":
      return <Pill tone={value ? "good" : "neutral"}>{value ? "Yes" : "No"}</Pill>;
    case "decimal": {
      const n = Number(value);
      if (!Number.isFinite(n)) return String(value);
      return (
        <span style={{ fontVariantNumeric: "tabular-nums", color: n < 0 ? "#B42318" : "#0B1C24" }}>
          {n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      );
    }
    case "int":
      return <span style={{ fontVariantNumeric: "tabular-nums" }}>{Number(value).toLocaleString()}</span>;
    case "date":
      return String(value).slice(0, 10);
    case "datetime": {
      const d = new Date(String(value));
      return isNaN(d.getTime()) ? String(value) : d.toLocaleString();
    }
    case "guid":
      return <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: "#94A3B8" }}>{String(value).slice(0, 8)}…</span>;
    default:
      return String(value);
  }
}

/**
 * The data table. Horizontal scroll lives on the wrapper, not the page — a
 * wide view must never make the whole shell scroll sideways.
 */
export function DbTable({ columns, rows, onRowClick, sort, dir, onSort, empty }: {
  columns: DbColumn[];
  rows: Record<string, unknown>[];
  onRowClick?: (row: Record<string, unknown>) => void;
  sort?: string; dir?: string; onSort?: (key: string) => void;
  empty?: ReactNode;
}) {
  if (!rows.length) return <>{empty ?? <DbEmpty title="Nothing to show yet" />}</>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                onClick={onSort ? () => onSort(c.key) : undefined}
                style={{
                  textAlign: "left", padding: "8px 10px", fontSize: 10, fontWeight: 700,
                  color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.4,
                  borderBottom: `1px solid ${STELLA_LAVENDER}`, whiteSpace: "nowrap",
                  cursor: onSort ? "pointer" : "default",
                }}
              >
                {c.label}{sort === c.key ? (dir === "desc" ? " ↓" : " ↑") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={String(r[columns[0].key] ?? i)}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              style={{ borderBottom: "1px solid #F1F5F9", cursor: onRowClick ? "pointer" : "default" }}
            >
              {columns.map((c) => (
                <td key={c.key} style={{ padding: "8px 10px", color: "#0B1C24", whiteSpace: "nowrap" }}>
                  {renderCell(r[c.key], c.type)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DbPager({ total, limit, offset, onPage }: {
  total: number; limit: number; offset: number; onPage: (offset: number) => void;
}) {
  if (total <= limit) return null;
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.ceil(total / limit);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, fontSize: 11, color: "#5A7A8A" }}>
      <DbButton variant="ghost" disabled={offset === 0} onClick={() => onPage(Math.max(0, offset - limit))}>Previous</DbButton>
      <span>Page {page} of {pages} · {total.toLocaleString()} rows</span>
      <DbButton variant="ghost" disabled={offset + limit >= total} onClick={() => onPage(offset + limit)}>Next</DbButton>
    </div>
  );
}

/** Minimal modal. Backdrop click closes; the sheet itself does not bubble. */
export function DbModal({ title, onClose, children, width = 560 }: {
  title: string; onClose: () => void; children: ReactNode; width?: number;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(11,28,36,0.45)", zIndex: 1000,
        display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "60px 16px", overflowY: "auto",
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ ...CARD, width: "100%", maxWidth: width, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0B1C24" }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: 0, fontSize: 20, cursor: "pointer", color: "#94A3B8", lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Toast-ish inline confirmation. Pages set it after a successful write. */
export function DbNotice({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div style={{
      background: "#ECFDF3", border: "1px solid #A6F4C5", borderRadius: 8,
      padding: "9px 12px", fontSize: 12, color: "#027A48", marginBottom: 14,
    }}>{text}</div>
  );
}

/** Shared loading line so pages don't each invent one. */
export function DbLoading() {
  return <div style={{ padding: 28, textAlign: "center", fontSize: 12, color: "#5A7A8A" }}>Loading…</div>;
}

/** A hook-free helper for the "used / limit" line every capped surface shows. */
export function CapLine({ used, limit, noun }: { used: number; limit: number | null; noun: string }) {
  return (
    <div style={{ fontSize: 11, color: limit !== null && used >= limit ? "#B54708" : "#5A7A8A" }}>
      {used} {noun}{limit === null ? " · unlimited on your plan" : ` of ${limit} on your plan`}
    </div>
  );
}

export function useNotice(): [string | null, (t: string) => void] {
  const [notice, setNotice] = useState<string | null>(null);
  // Auto-clearing keeps a stale "Saved" from sitting over a later failure.
  const show = (t: string) => { setNotice(t); window.setTimeout(() => setNotice(null), 4000); };
  return [notice, show];
}
