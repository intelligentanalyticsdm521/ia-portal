// StellaLedgerInboxPage — Ledger → Inbox.
//
// The needs-review queue (status IN needs_categorization / flagged) — the core
// bookkeeping UX. Reads GET /ledger/inbox (raw stella.[transaction] rows).
// Quick-categorize: every needs_categorization row carries an inline SEARCHABLE
// account combobox (Brandon's walkthrough, 2026-08-13: "a search option in the
// ledger inbox so you can easily find an account") — a text input filtering the
// COA list (expense accounts first for outflows, revenue first for inflows,
// arrow/enter keyboard selection, click-away closes; built inline, no new dep)
// plus a one-tap "Categorize" button that PATCHes /ledger/transactions/:id
// with { coa_account_id, status: 'categorized' } — the row leaves the inbox on
// success with a count-down flash. Outflow rows also carry a compact "Personal"
// quick-action (PATCH status:'personal' — excluded from the books entirely; the
// row leaves the inbox). A plain search box above the table filters the rows
// themselves by counterparty/description/memo. Row click opens the
// TransactionDetailModal (IadmModal standard) so a line can be memo'd / voided
// / reimbursed without leaving the queue (inline controls stopPropagation so
// they don't open it).
// Duplicate / OCR-pending review reasons return with P3 receipt capture.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useStellaApi } from "../../hooks/useStellaApi";
import { DataTable, EmptyState, Button, FilterBar, type Column } from "../../components/oliver/ui";
import { CheckCircle2 } from "lucide-react";
import { StellaShell, STELLA_INDIGO, STELLA_LAVENDER, fmtMoney } from "./StellaShell";
import { TransactionDetailModal, type DetailTxn } from "./TransactionDetailModal";
import type { CoaAccount } from "./RecordTransactionModal";

// GET /ledger/inbox row — raw stella.[transaction] columns (subset we use).
interface InboxItem {
  transaction_id: string;
  posted_date: string;
  description: string | null;
  memo: string | null;
  amount_signed: number | string;
  direction: string; // inflow | outflow
  status: string; // needs_categorization | flagged
  coa_account_id: string | null;
  raw_source?: string | null;
  trust_flags?: string[] | null;
  is_reimbursable?: boolean | number | null;
  reimbursed_at?: string | null;
  // STELLA pack 2, item 3 — what the ledger LEARNED from the owner correcting
  // rows like this one before. A suggestion, never an answer: nothing is
  // applied until somebody presses Categorize, because setting the account is
  // what puts the line in the books.
  suggestion?: {
    coa_account_id: string;
    coa_code: string | null;
    account_name: string | null;
    confidence: number;
    matched_on: string;
    matched_value: string;
    hit_count: number;
    source: string;
    why: string;
  } | null;
}

const STATUS_PILL: Record<string, { bg: string; color: string; label: string }> = {
  needs_categorization: { bg: "#FEF3C7", color: "#92400E", label: "Uncategorized" },
  flagged: { bg: "#FEE2E2", color: "#991B1B", label: "Flagged" },
};

const FILTER_PILLS = [
  { key: "all", label: "All" },
  { key: "needs_categorization", label: "Uncategorized" },
  { key: "flagged", label: "Flagged" },
];

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const [y, mo, day] = String(d).slice(0, 10).split("-").map(Number);
  if (y && mo && day) return new Date(y, mo - 1, day).toLocaleDateString();
  return new Date(d).toLocaleDateString();
}

function toNum(v: number | string | null | undefined): number {
  const n = typeof v === "string" ? Number(v) : v ?? 0;
  return Number.isFinite(n as number) ? (n as number) : 0;
}

function coaLabel(a: CoaAccount): string {
  return a.code ? `${a.code} — ${a.name}` : a.name;
}

/**
 * Inline searchable account combobox (house style, no dependency): a text
 * input filtering the COA list, dropdown of matches (row-direction accounts
 * first), ArrowUp/ArrowDown + Enter selection, Escape/click-away closes.
 */
function CoaCombobox({
  accounts,
  direction,
  value,
  onChange,
  disabled,
}: {
  accounts: CoaAccount[];
  direction: string;
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hi, setHi] = useState(0);

  const selected = accounts.find((a) => a.coa_account_id === value) || null;
  const preferredType = direction === "inflow" ? "revenue" : "expense";

  // Filtered matches, preferred type first — one flat list for keyboard nav,
  // with group boundaries marked for the tiny headers.
  const { matches, preferredCount } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hit = (a: CoaAccount) => !q || coaLabel(a).toLowerCase().includes(q);
    const preferred = accounts.filter((a) => a.type === preferredType && hit(a));
    const others = accounts.filter((a) => a.type !== preferredType && hit(a));
    return { matches: [...preferred, ...others], preferredCount: preferred.length };
  }, [accounts, preferredType, query]);

  useEffect(() => {
    setHi(0);
  }, [query, open]);

  function pick(a: CoaAccount) {
    onChange(a.coa_account_id);
    setQuery("");
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      e.preventDefault();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHi((h) => Math.min(h + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (matches[hi]) pick(matches[hi]);
    } else if (e.key === "Escape") {
      setQuery("");
      setOpen(false);
    }
  }

  const groupHeader = (text: string) => (
    <div style={{ padding: "5px 10px 2px", fontSize: 9, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.4 }}>
      {text}
    </div>
  );

  return (
    <div
      style={{ position: "relative", width: 190 }}
      onBlur={(e) => {
        // Click-away close — ignore focus moving within the combobox.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setQuery("");
          setOpen(false);
        }
      }}
    >
      <input
        role="combobox"
        aria-expanded={open}
        aria-label="Search accounts"
        value={open ? query : selected ? coaLabel(selected) : ""}
        placeholder={selected ? coaLabel(selected) : "Search accounts…"}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        style={{
          width: "100%",
          padding: "5px 8px",
          fontSize: 11,
          color: "#0B1C24",
          background: "#fff",
          border: `1px solid ${open ? STELLA_INDIGO : STELLA_LAVENDER}`,
          borderRadius: 6,
        }}
      />
      {open && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 40,
            maxHeight: 230, overflowY: "auto", background: "#fff",
            border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 8,
            boxShadow: "0 8px 24px rgba(11,28,36,0.14)",
          }}
        >
          {matches.length === 0 ? (
            <div style={{ padding: "8px 10px", fontSize: 11, color: "#94A3B8" }}>No accounts match "{query}"</div>
          ) : (
            matches.map((a, i) => (
              <div key={a.coa_account_id}>
                {i === 0 && preferredCount > 0 && groupHeader(preferredType === "revenue" ? "Revenue" : "Expenses")}
                {i === preferredCount && groupHeader("Other accounts")}
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(a);
                  }}
                  onMouseEnter={() => setHi(i)}
                  style={{
                    display: "block", width: "100%", textAlign: "left", padding: "6px 10px",
                    fontSize: 11, color: "#0B1C24", border: 0, cursor: "pointer",
                    background: i === hi ? "#EEF0FB" : "transparent",
                    fontWeight: a.coa_account_id === value ? 700 : 500,
                  }}
                >
                  {coaLabel(a)}
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function StellaLedgerInboxPage() {
  const { get, patch, ready } = useStellaApi();
  const [rows, setRows] = useState<InboxItem[]>([]);
  const [coa, setCoa] = useState<CoaAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [detail, setDetail] = useState<InboxItem | null>(null);
  // Per-row pending COA pick for the inline quick-categorize combobox.
  const [picks, setPicks] = useState<Record<string, string>>({});
  // Plain text filter over the inbox rows themselves (counterparty/description).
  const [search, setSearch] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await get<InboxItem[]>("/ledger/inbox");
      setRows(data || []);
      // Pre-select what we learned, so accepting a suggestion is ONE press and
      // disagreeing with it is a normal change of the same picker. A suggestion
      // that had to be typed out again would teach nobody anything.
      setPicks((prev) => {
        const next = { ...prev };
        for (const r of data || []) {
          if (r.suggestion && !next[r.transaction_id]) next[r.transaction_id] = r.suggestion.coa_account_id;
        }
        return next;
      });
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [get]);

  useEffect(() => {
    if (ready) reload();
  }, [ready, reload]);

  // COA once per page — feeds every row's quick-categorize select AND the
  // detail modal (which skips its own fetch when handed a list).
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    get<CoaAccount[]>("/ledger/coa")
      .then((accounts) => { if (!cancelled) setCoa(accounts || []); })
      .catch(() => { if (!cancelled) setCoa([]); });
    return () => { cancelled = true; };
  }, [get, ready]);

  const filtered = useMemo(() => {
    let out = rows;
    if (filter !== "all") out = out.filter((r) => (r.status || "needs_categorization") === filter);
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter(
        (r) =>
          (r.description || "").toLowerCase().includes(q) ||
          (r.memo || "").toLowerCase().includes(q)
      );
    }
    return out;
  }, [rows, filter, search]);

  function flashMsg(m: string) {
    setFlash(m);
    setTimeout(() => setFlash(null), 4000);
  }

  const activeCoa = useMemo(
    () => coa.filter((a) => a.is_active !== false && a.is_active !== 0),
    [coa]
  );

  async function categorize(r: InboxItem) {
    const coaAccountId = picks[r.transaction_id];
    if (!coaAccountId) return;
    setBusy(r.transaction_id);
    try {
      await patch(`/ledger/transactions/${r.transaction_id}`, {
        coa_account_id: coaAccountId,
        status: "categorized",
      });
      const account = activeCoa.find((a) => a.coa_account_id === coaAccountId);
      setRows((prev) => {
        const next = prev.filter((x) => x.transaction_id !== r.transaction_id);
        flashMsg(
          `Categorized "${r.description || "transaction"}" → ${account?.name || "account"}. ` +
          (next.length === 0 ? "Inbox zero — all caught up." : `${next.length} left to review.`)
        );
        return next;
      });
      setPicks((prev) => {
        const { [r.transaction_id]: _gone, ...rest } = prev;
        return rest;
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Categorize failed");
    } finally {
      setBusy(null);
    }
  }

  // "Personal" quick-action (Brandon's walkthrough, 2026-08-13) — exclude a
  // personal charge from the books in one tap: PATCH status:'personal', the
  // row leaves the inbox with a flash. Undo lives in the detail modal / the
  // Transactions page's Personal filter ("Add back to business books").
  async function markPersonal(r: InboxItem) {
    if (!confirm("Exclude this from your business books? It stays on the bank record but leaves every report and total.")) return;
    setBusy(r.transaction_id);
    try {
      await patch(`/ledger/transactions/${r.transaction_id}`, { status: "personal" });
      setRows((prev) => {
        const next = prev.filter((x) => x.transaction_id !== r.transaction_id);
        flashMsg(
          `Marked "${r.description || "transaction"}" personal — it's out of your books. ` +
          (next.length === 0 ? "Inbox zero — all caught up." : `${next.length} left to review.`)
        );
        return next;
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not mark this personal");
    } finally {
      setBusy(null);
    }
  }

  const columns: Column<InboxItem>[] = [
    {
      key: "posted_date",
      header: "Date",
      render: (r) => <span style={{ fontSize: 11, color: "#0B1C24" }}>{fmtDate(r.posted_date)}</span>,
    },
    {
      key: "description",
      header: "Description",
      render: (r) => (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>{r.description || "—"}</div>
          {r.memo && <div style={{ fontSize: 10, color: "#94A3B8" }}>{r.memo}</div>}
        </div>
      ),
    },
    {
      key: "amount_signed",
      header: "Amount",
      align: "right",
      render: (r) => {
        const n = toNum(r.amount_signed);
        return (
          <span style={{ fontSize: 12, fontWeight: 600, color: n >= 0 ? "#047857" : "#0B1C24", fontVariantNumeric: "tabular-nums" }}>
            {n >= 0 ? "+" : "−"}
            {fmtMoney(Math.abs(n))}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Reason",
      render: (r) => {
        const p = STATUS_PILL[r.status] || STATUS_PILL.needs_categorization;
        return (
          <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 99, background: p.bg, color: p.color, fontSize: 11, fontWeight: 600 }}>
            {p.label}
          </span>
        );
      },
    },
    {
      key: "suggestion",
      header: "What we think",
      render: (r) =>
        r.suggestion ? (
          <span
            title={`${r.suggestion.why}. Nothing is saved until you press Categorize.`}
            style={{ display: "inline-flex", flexDirection: "column", gap: 1 }}
          >
            <span style={{ fontSize: 11, fontWeight: 600, color: STELLA_INDIGO }}>
              {r.suggestion.account_name || "—"}
            </span>
            <span style={{ fontSize: 10, color: "#94A3B8" }}>{r.suggestion.why}</span>
          </span>
        ) : (
          <span style={{ fontSize: 11, color: "#CBD5E1" }}>—</span>
        ),
    },
    {
      key: "categorize",
      header: "Quick categorize",
      align: "right",
      // stopPropagation so the inline controls don't ALSO open the row's
      // detail modal (rows are clickable — see onRowClick below).
      render: (r) =>
        r.status === "needs_categorization" ? (
          <div data-tour="stella-inbox-quick-categorize" style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
            <CoaCombobox
              accounts={activeCoa}
              direction={r.direction}
              value={picks[r.transaction_id] || ""}
              onChange={(id) => setPicks((prev) => ({ ...prev, [r.transaction_id]: id }))}
              disabled={busy === r.transaction_id || !activeCoa.length}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => categorize(r)}
              disabled={busy === r.transaction_id || !picks[r.transaction_id]}
            >
              <CheckCircle2 size={11} color="#059669" /> {busy === r.transaction_id ? "Saving…" : "Categorize"}
            </Button>
            {/* Always rendered so row actions align (Brandon's walkthrough
                note, 2026-08-14) — greyed out on inflows where "personal
                expense" doesn't apply. */}
            <button
              type="button"
              onClick={() => r.direction === "outflow" && markPersonal(r)}
              disabled={r.direction !== "outflow" || busy === r.transaction_id}
              title={
                r.direction === "outflow"
                  ? "This is a personal expense — exclude it from your business books"
                  : "Only expenses can be marked personal — this is money in"
              }
              style={{
                padding: "5px 10px", fontSize: 11, fontWeight: 600, borderRadius: 6,
                whiteSpace: "nowrap",
                border: r.direction === "outflow" ? "1px solid #CBD5E1" : "1px solid #E2E8F0",
                background: r.direction === "outflow" ? "#fff" : "#F8FAFC",
                color: r.direction === "outflow" ? "#475569" : "#CBD5E1",
                cursor: r.direction === "outflow" ? "pointer" : "not-allowed",
              }}
            >
              Personal
            </button>
          </div>
        ) : (
          <span style={{ fontSize: 11, color: "#94A3B8" }}>Open to review</span>
        ),
    },
  ];

  // Map an inbox item onto the DetailTxn shape the shared modal expects.
  function toDetailTxn(r: InboxItem): DetailTxn {
    return {
      transaction_id: r.transaction_id,
      posted_date: r.posted_date,
      counterparty_name: r.description,
      memo: r.memo,
      amount_signed: r.amount_signed,
      coa_account_id: r.coa_account_id,
      status: r.status,
      raw_source: r.raw_source,
      is_reimbursable: r.is_reimbursable,
      reimbursed_at: r.reimbursed_at,
    };
  }

  return (
    <StellaShell
      title="Inbox"
      subtitle="Review new transactions — pick an account and categorize in one tap, or open a row for the full detail."
      showRecord
      onRecorded={() => {
        reload();
        flashMsg("Recorded.");
      }}
      error={error}
      loading={loading && !rows.length}
    >
      {flash && (
        <div style={{ padding: 10, marginBottom: 12, fontSize: 12, background: "#EEF0FB", color: "#3730A3", border: `1px solid ${STELLA_INDIGO}33`, borderRadius: 6 }}>
          {flash}
        </div>
      )}

      {!rows.length && !loading ? (
        <EmptyState
          title="Inbox zero"
          description="Nothing needs review right now. New transactions from bank feeds, receipts, and recurring templates will queue up here for a quick categorize."
        />
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by counterparty or description…"
              aria-label="Search inbox transactions"
              style={{ width: 300, maxWidth: "100%", padding: "7px 10px", fontSize: 12, border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 6, color: "#0B1C24" }}
            />
            {search.trim() && (
              <span style={{ fontSize: 11, color: "#5A7A8A" }}>
                {filtered.length} of {rows.length} transaction{rows.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <FilterBar pills={FILTER_PILLS} activePill={filter} onPillChange={setFilter} />
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(r) => r.transaction_id}
            onRowClick={(r) => setDetail(r)}
            emptyMessage={search.trim() ? "No inbox rows match your search." : "Nothing to review in this filter."}
          />
        </>
      )}

      {detail && (
        <TransactionDetailModal
          txn={toDetailTxn(detail)}
          coa={coa.length ? coa : undefined}
          onClose={(changed) => {
            setDetail(null);
            if (changed) reload();
          }}
        />
      )}
    </StellaShell>
  );
}
