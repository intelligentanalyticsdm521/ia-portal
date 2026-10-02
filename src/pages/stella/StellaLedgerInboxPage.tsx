// StellaLedgerInboxPage — Ledger → Inbox.
//
// The needs-review queue (status IN needs_categorization / flagged) — the core
// bookkeeping UX. Reads GET /ledger/inbox kept whole (getFull) so the real
// total in pagination.total is the number on screen, 100 rows at a time with
// "Show N more".
//
// One line at a time: every needs_categorization row carries an inline
// SEARCHABLE category picker (Brandon's walkthrough, 2026-08-13: "a search
// option in the ledger inbox so you can easily find an account") plus a
// one-tap "Categorize" that PATCHes /ledger/transactions/:id with
// { coa_account_id, status: 'categorized' }. "Personal" PATCHes
// { status: 'personal' } at once — no browser box — and the line that says so
// carries Undo, which PATCHes the line back to the status it had
// (undoPersonalBody in inboxBulk.ts).
//
// Many at once (the owner, 2 Oct 2026: "I'd like to be able to once a week go
// in and just hit bulk assign button and it allows me to check multiple items
// then assign it to a category or personal item"): "Bulk assign" turns on
// selection mode — a checkbox per row, shift-click for a range, "Select all N
// shown", and one bar (InboxBulkBar) with "Assign N to this category" and
// "Mark N personal". Each is sent as POST /ledger/transactions/bulk, 50 lines
// a request with the bar counting how far it has got; the answer is said in
// one line (in the sticky bar, so it is on screen wherever the owner has
// scrolled) from the per-row reasons, the list reloads, and selection mode
// stays on for the next batch.
//
// Never a dead control: if there are no categories, or they failed to load,
// the row says so in words with the way to the categories page — never a
// greyed picker with no reason. Row click opens the TransactionDetailModal
// (outside selection mode) so a line can be memo'd / split / voided.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useStellaApi } from "../../hooks/useStellaApi";
import { DataTable, EmptyState, Button, FilterBar, type Column } from "../../components/oliver/ui";
import { CheckCircle2, ListChecks } from "lucide-react";
import { StellaShell, STELLA_INDIGO, STELLA_LAVENDER, fmtMoney } from "./StellaShell";
import { TransactionDetailModal, type DetailTxn } from "./TransactionDetailModal";
import type { CoaAccount } from "./RecordTransactionModal";
import { CategoryNote, InboxBulkBar } from "./InboxBulkBar";
import { STELLA_SETUP_ROUTES } from "./stellaSetupSteps";
import {
  INBOX_PAGE_SIZE, EMPTY_SELECTION, MONEY_IN_PERSONAL_RULE,
  canMarkPersonal, plainReason, personalSplit, assignSplit, assignSkipRule,
  clickRow, selectAllShown, allShownSelected, selectedShown,
  sendBulk, bulkResultSentence, queueLine, moreToLoad, showMoreOutcome, shownNote,
  readInboxEnvelope, mergePage, undoPersonalBody, categoryProblem,
  type BulkAction, type InboxSelection,
} from "./inboxBulk";

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
  // True for money out; for money in only when the line came from a bank
  // connection the owner marked as a personal card. (A SQL BIT: true/false or 1/0.)
  can_mark_personal?: boolean | number | null;
  // STELLA pack 2, item 3 — what the ledger LEARNED from the owner correcting
  // rows like this one before. A suggestion, never an answer: nothing is
  // applied until somebody presses Categorize, because setting the category is
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

interface Notice {
  tone: "ok" | "problem";
  text: string;
  /** A line just marked Personal — the notice offers Undo for it. */
  undo?: InboxItem;
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

function sentenceOf(e: unknown, fallback: string): string {
  return plainReason(e) || fallback;
}

function leftLine(n: number): string {
  return n <= 0 ? "Inbox zero — all caught up." : `${n} left to review.`;
}

/**
 * Inline searchable category combobox (house style, no dependency): a text
 * input filtering the category list, dropdown of matches (row-direction
 * categories first), ArrowUp/ArrowDown + Enter selection, Escape/click-away
 * closes.
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
        aria-label="Search categories"
        value={open ? query : selected ? coaLabel(selected) : ""}
        placeholder={selected ? coaLabel(selected) : "Search categories…"}
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
            <div style={{ padding: "8px 10px", fontSize: 11, color: "#94A3B8" }}>No categories match "{query}"</div>
          ) : (
            matches.map((a, i) => (
              <div key={a.coa_account_id}>
                {i === 0 && preferredCount > 0 && groupHeader(preferredType === "revenue" ? "Income" : "Expenses")}
                {i === preferredCount && groupHeader("Other categories")}
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
  const { get, getFull, patch, post, ready } = useStellaApi();
  const [rows, setRows] = useState<InboxItem[]>([]);
  // pagination.total from the API — the real size of the queue, not what is loaded.
  const [total, setTotal] = useState(0);
  const [coa, setCoa] = useState<CoaAccount[]>([]);
  const [coaState, setCoaState] = useState<"loading" | "ok" | "failed">("loading");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [detail, setDetail] = useState<InboxItem | null>(null);
  // Per-row pending category pick for the inline quick-categorize combobox.
  const [picks, setPicks] = useState<Record<string, string>>({});
  // Plain text filter over the inbox rows themselves (counterparty/description).
  const [search, setSearch] = useState("");
  // Selection mode ("Bulk assign").
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState<InboxSelection>(EMPTY_SELECTION);
  const [bulkCoa, setBulkCoa] = useState("");
  const [askPersonal, setAskPersonal] = useState(false);
  const [bulkBusy, setBulkBusy] = useState<BulkAction | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ sent: number; total: number } | null>(null);

  // Pre-select what we learned, so accepting a suggestion is ONE press and
  // disagreeing with it is a normal change of the same picker. A suggestion
  // that had to be typed out again would teach nobody anything.
  const preselect = useCallback((page: InboxItem[]) => {
    setPicks((prev) => {
      const next = { ...prev };
      for (const r of page) {
        if (r.suggestion && !next[r.transaction_id]) next[r.transaction_id] = r.suggestion.coa_account_id;
      }
      return next;
    });
  }, []);

  const inboxPage = useCallback(
    async (offset: number) =>
      readInboxEnvelope<InboxItem>(await getFull<unknown>(`/ledger/inbox?limit=${INBOX_PAGE_SIZE}&offset=${offset}`)),
    [getFull]
  );

  // Load the queue from the top, 100 at a time, until `want` rows are on
  // screen or the queue ends — so a reload after a batch keeps as much of the
  // list showing as before.
  const load = useCallback(async (want: number) => {
    setLoading(true);
    setError(null);
    try {
      let all: InboxItem[] = [];
      let queueTotal = 0;
      for (let offset = 0; offset < want; offset += INBOX_PAGE_SIZE) {
        const page = await inboxPage(offset);
        all = mergePage(all, page.rows);
        queueTotal = page.total;
        if (page.rows.length < INBOX_PAGE_SIZE) break;
      }
      setRows(all);
      setTotal(Math.max(queueTotal, all.length));
      preselect(all);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [inboxPage, preselect]);

  useEffect(() => {
    if (ready) load(INBOX_PAGE_SIZE);
  }, [ready, load]);

  // Categories once per page — feed every row's picker, the bulk bar, AND the
  // detail modal (which skips its own fetch when handed a list). The API
  // creates the standard categories on this first read for a business that
  // never had any.
  const loadCoa = useCallback(async () => {
    setCoaState("loading");
    try {
      setCoa((await get<CoaAccount[]>("/ledger/coa")) || []);
      setCoaState("ok");
    } catch {
      setCoa([]);
      setCoaState("failed");
    }
  }, [get]);

  useEffect(() => {
    if (ready) loadCoa();
  }, [ready, loadCoa]);

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

  const shownIds = useMemo(() => filtered.map((r) => r.transaction_id), [filtered]);
  const picked = useMemo(() => selectedShown(filtered, sel), [filtered, sel]);
  const personal = useMemo(() => personalSplit(picked), [picked]);

  const activeCoa = useMemo(
    () => coa.filter((a) => a.is_active !== false && a.is_active !== 0),
    [coa]
  );
  // One category for a pick that mixes money in and out: the lines going the
  // other way from an income/expense category are left out, and counted.
  const bulkCoaType = activeCoa.find((a) => a.coa_account_id === bulkCoa)?.type ?? null;
  const assign = useMemo(() => assignSplit(picked, bulkCoaType), [picked, bulkCoaType]);
  const pickerProblem = categoryProblem({
    loading: coaState === "loading",
    failed: coaState === "failed",
    count: activeCoa.length,
  });
  const categoryNote = pickerProblem ? (
    <CategoryNote problem={pickerProblem} onRetry={coaState === "failed" ? loadCoa : undefined} />
  ) : null;

  async function showMore() {
    setLoadingMore(true);
    try {
      const page = await inboxPage(rows.length);
      const next = showMoreOutcome(rows, page);
      if (next.kind === "reload") {
        // The queue moved under us (new lines at the top): read it again from the top.
        await load(rows.length + INBOX_PAGE_SIZE);
        return;
      }
      setRows(next.rows);
      setTotal(next.total);
      preselect(page.rows);
    } catch (e) {
      setNotice({ tone: "problem", text: `We couldn't load more lines: ${sentenceOf(e, "please try again")}` });
    } finally {
      setLoadingMore(false);
    }
  }

  // A line that leaves the queue on screen; the total follows it.
  function dropRow(id: string) {
    setRows((prev) => prev.filter((x) => x.transaction_id !== id));
    setTotal((t) => Math.max(0, t - 1));
    setSel((s) => {
      if (!s.ids.has(id)) return s;
      const ids = new Set(s.ids);
      ids.delete(id);
      return { ids, anchor: s.anchor };
    });
  }

  async function categorize(r: InboxItem) {
    const coaAccountId = picks[r.transaction_id];
    if (!coaAccountId) return;
    setBusy(r.transaction_id);
    try {
      await patch(`/ledger/transactions/${r.transaction_id}`, {
        coa_account_id: coaAccountId,
        status: "categorized",
      });
      const category = activeCoa.find((a) => a.coa_account_id === coaAccountId);
      dropRow(r.transaction_id);
      setNotice({
        tone: "ok",
        text: `Categorized "${r.description || "transaction"}" as ${category?.name || "that category"}. ${leftLine(total - 1)}`,
      });
      setPicks((prev) => {
        const { [r.transaction_id]: _gone, ...rest } = prev;
        return rest;
      });
    } catch (e) {
      setNotice({ tone: "problem", text: sentenceOf(e, "That line couldn't be categorized. Please try again.") });
    } finally {
      setBusy(null);
    }
  }

  // "Personal" (Brandon's walkthrough, 2026-08-13) — exclude a personal charge
  // from the books in one tap, at once: no browser box. The line that says so
  // offers Undo, so a slip costs one more press instead of a question every time.
  async function markPersonal(r: InboxItem) {
    setBusy(r.transaction_id);
    try {
      await patch(`/ledger/transactions/${r.transaction_id}`, { status: "personal" });
      dropRow(r.transaction_id);
      setNotice({
        tone: "ok",
        text: `Marked "${r.description || "transaction"}" personal — it's out of your books. ${leftLine(total - 1)}`,
        undo: r,
      });
    } catch (e) {
      setNotice({ tone: "problem", text: sentenceOf(e, "That line couldn't be marked personal. Please try again.") });
    } finally {
      setBusy(null);
    }
  }

  // Undo puts the line back exactly as it was: its old status (marking a line
  // personal leaves its "needs reimbursement" flag alone, so that is all).
  async function undoPersonal(r: InboxItem) {
    setBusy(r.transaction_id);
    try {
      await patch(`/ledger/transactions/${r.transaction_id}`, undoPersonalBody(r));
      setNotice({ tone: "ok", text: `"${r.description || "That line"}" is back in your inbox.` });
      await load(Math.max(INBOX_PAGE_SIZE, rows.length + 1));
    } catch (e) {
      setNotice({ tone: "problem", text: `We couldn't put it back: ${sentenceOf(e, "please try again")}` });
    } finally {
      setBusy(null);
    }
  }

  async function runBulk(action: BulkAction) {
    const targets = action === "personal" ? personal.eligible : assign.eligible;
    const skipped = action === "personal" ? personal.skipped : assign.skipped;
    const skippedWhy = action === "personal" ? MONEY_IN_PERSONAL_RULE : assignSkipRule(assign.skippedSide);
    if (!targets.length) return;
    if (action === "categorize" && !bulkCoa) return;
    const categoryName = action === "categorize"
      ? activeCoa.find((a) => a.coa_account_id === bulkCoa)?.name || null
      : null;
    // The dates name the months a closed-period refusal falls in.
    const datesById = new Map(targets.map((r) => [r.transaction_id, r.posted_date]));
    setAskPersonal(false);
    setBulkBusy(action);
    setBulkProgress({ sent: 0, total: targets.length });
    setNotice(null);
    // POST /ledger/transactions/bulk, 50 lines a request, counted on the bar;
    // only ever the category picked in the bar, never a suggestion.
    const { answer, unsent } = await sendBulk(post, action, targets.map((r) => r.transaction_id), bulkCoa,
      (sent, all) => setBulkProgress({ sent, total: all }));
    // Red whenever something did not go through, so a refusal is noticed.
    setNotice({
      tone: answer.done > 0 && !answer.failed && !unsent ? "ok" : "problem",
      text: bulkResultSentence({ action, categoryName, answer, skipped, skippedWhy, unsent, datesById }),
    });
    // Selection mode stays on for the next batch; the picks start fresh.
    setSel(EMPTY_SELECTION);
    setBulkBusy(null);
    setBulkProgress(null);
    await load(Math.max(INBOX_PAGE_SIZE, rows.length));
  }

  function toggle(r: InboxItem, shift: boolean) {
    setSel((s) => clickRow(s, shownIds, r.transaction_id, shift));
  }

  function startSelecting() {
    setSelecting(true);
    setSel(EMPTY_SELECTION);
    setAskPersonal(false);
  }

  function stopSelecting() {
    setSelecting(false);
    setSel(EMPTY_SELECTION);
    setAskPersonal(false);
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
  ];

  // Outside selection mode each row carries its own controls. In selection
  // mode the one bar above the table does the work, so the rows stay quiet and
  // "What we think" is the last column — what you select by.
  if (!selecting) {
    columns.push({
      key: "categorize",
      header: "Quick categorize",
      align: "right",
      // stopPropagation so the inline controls don't ALSO open the row's
      // detail modal (rows are clickable — see onRowClick below).
      render: (r) => {
        if (r.status !== "needs_categorization") {
          return <span style={{ fontSize: 11, color: "#94A3B8" }}>Open to review</span>;
        }
        const personalOk = canMarkPersonal(r);
        return (
          <div data-tour="stella-inbox-quick-categorize" style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
            {categoryNote ?? (
              <>
                <CoaCombobox
                  accounts={activeCoa}
                  direction={r.direction}
                  value={picks[r.transaction_id] || ""}
                  onChange={(id) => setPicks((prev) => ({ ...prev, [r.transaction_id]: id }))}
                  disabled={busy === r.transaction_id}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => categorize(r)}
                  disabled={busy === r.transaction_id || !picks[r.transaction_id]}
                  title={picks[r.transaction_id] ? undefined : "Pick a category first"}
                >
                  <CheckCircle2 size={11} color="#059669" /> {busy === r.transaction_id ? "Saving…" : "Categorize"}
                </Button>
              </>
            )}
            {/* Always rendered so row actions align (Brandon's walkthrough
                note, 2026-08-14) — greyed out where "personal" doesn't apply,
                with the reason in WORDS under it: a tooltip on a disabled
                button often never shows, and never on a phone. */}
            <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
              <button
                type="button"
                onClick={() => personalOk && markPersonal(r)}
                disabled={!personalOk || busy === r.transaction_id}
                title={personalOk ? "This is personal — take it out of your business books" : undefined}
                style={{
                  padding: "5px 10px", fontSize: 11, fontWeight: 600, borderRadius: 6,
                  whiteSpace: "nowrap",
                  border: personalOk ? "1px solid #CBD5E1" : "1px solid #E2E8F0",
                  background: personalOk ? "#fff" : "#F8FAFC",
                  color: personalOk ? "#475569" : "#CBD5E1",
                  cursor: personalOk ? "pointer" : "not-allowed",
                }}
              >
                Personal
              </button>
              {!personalOk && (
                <span data-personal-why="1" style={{ fontSize: 10, color: "#5A7A8A", maxWidth: 170, textAlign: "right", lineHeight: 1.35 }}>
                  Money in is personal only from a card set as personal under{" "}
                  <Link to={STELLA_SETUP_ROUTES.bank} style={{ color: STELLA_INDIGO, fontWeight: 600 }}>
                    Bank and card accounts
                  </Link>
                </span>
              )}
            </span>
          </div>
        );
      },
    });
  }

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
      // The detail window offers Personal on the same rule as the row.
      direction: r.direction,
      can_mark_personal: r.can_mark_personal,
    };
  }

  const more = moreToLoad(total, rows.length);
  const bulkDirection = picked.length && picked.every((r) => r.direction === "inflow") ? "inflow" : "outflow";
  const filterLabel = filter === "all" ? null : FILTER_PILLS.find((p) => p.key === filter)?.label || null;
  const note = shownNote({ search, filterLabel, shown: filtered.length, loaded: rows.length, more });
  const noticeBox = notice ? (
    <div
      role="status"
      style={{
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        padding: "10px 14px", fontSize: 12, lineHeight: 1.5, borderRadius: 8,
        ...(notice.tone === "ok"
          ? { background: "#EEF0FB", color: "#3730A3", border: `1px solid ${STELLA_INDIGO}33` }
          : { background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA" }),
      }}
    >
      <span style={{ flex: 1, minWidth: 200 }}>{notice.text}</span>
      {notice.undo && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => notice.undo && undoPersonal(notice.undo)}
          disabled={busy === notice.undo.transaction_id}
        >
          {busy === notice.undo.transaction_id ? "Putting it back…" : "Undo"}
        </Button>
      )}
    </div>
  ) : null;

  return (
    <StellaShell
      title="Inbox"
      subtitle="Review new transactions — pick a category for each line, or use Bulk assign to clear many at once."
      showRecord
      onRecorded={() => {
        load(Math.max(INBOX_PAGE_SIZE, rows.length + 1));
        setNotice({ tone: "ok", text: "Recorded." });
      }}
      error={error}
      loading={loading && !rows.length}
    >
      {/* In selection mode the answer is said inside the sticky bar instead,
          so it is on screen wherever the owner has scrolled to. */}
      {noticeBox && !selecting && <div style={{ marginBottom: 12 }}>{noticeBox}</div>}

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
            {note && (
              <span data-shown-note="1" style={{ fontSize: 11, color: "#5A7A8A" }}>
                {note}
              </span>
            )}
            <span style={{ flex: 1 }} />
            <span data-queue-count="1" style={{ fontSize: 12, fontWeight: 700, color: "#0B1C24" }}>
              {queueLine(total, rows.length)}
            </span>
            <Link to={STELLA_SETUP_ROUTES.coa} style={{ fontSize: 12, fontWeight: 600, color: STELLA_INDIGO }}>
              Edit categories
            </Link>
            {!selecting && (
              <Button data-tour="stella-inbox-bulk-assign" variant="primary" size="sm" style={{ background: STELLA_INDIGO }} onClick={startSelecting}>
                <ListChecks size={12} /> Bulk assign
              </Button>
            )}
          </div>
          <FilterBar pills={FILTER_PILLS} activePill={filter} onPillChange={setFilter} />
          {selecting && (
            <InboxBulkBar
              shownCount={filtered.length}
              selectedCount={picked.length}
              allSelected={allShownSelected(sel, shownIds)}
              onSelectAll={() => setSel((s) => selectAllShown(s, shownIds))}
              onClear={() => { setSel(EMPTY_SELECTION); setAskPersonal(false); }}
              onDone={stopSelecting}
              picker={
                categoryNote ?? (
                  <CoaCombobox
                    accounts={activeCoa}
                    direction={bulkDirection}
                    value={bulkCoa}
                    onChange={setBulkCoa}
                    disabled={bulkBusy !== null}
                  />
                )
              }
              categoryPicked={!!bulkCoa && !pickerProblem}
              onAssign={() => runBulk("categorize")}
              assignEligible={assign.eligible.length}
              assignSkipped={assign.skipped}
              assignSkippedSide={assign.skippedSide}
              moneyIn={assign.moneyIn}
              moneyOut={assign.moneyOut}
              personalEligible={personal.eligible.length}
              personalSkipped={personal.skipped}
              asking={askPersonal}
              onAskPersonal={() => setAskPersonal(true)}
              onConfirmPersonal={() => runBulk("personal")}
              onCancelPersonal={() => setAskPersonal(false)}
              busy={bulkBusy}
              progress={bulkProgress}
              result={noticeBox}
            />
          )}
          {/* Shift-click picks a range; it must not also paint text. */}
          <div style={selecting ? { userSelect: "none" } : undefined}>
            <DataTable
              rows={filtered}
              columns={columns}
              rowKey={(r) => r.transaction_id}
              onRowClick={(r, e) => (selecting ? toggle(r, e.shiftKey) : setDetail(r))}
              selectedIds={selecting ? sel.ids : undefined}
              onSelectionChange={selecting ? (ids) => setSel((s) => ({ ids, anchor: s.anchor })) : undefined}
              onRowCheckboxClick={(r, e) => toggle(r, e.shiftKey)}
              emptyMessage={search.trim() ? "No inbox rows match your search." : "Nothing to review in this filter."}
            />
          </div>
          {more > 0 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 12 }}>
              <span style={{ fontSize: 11, color: "#5A7A8A" }}>{queueLine(total, rows.length)}</span>
              <Button variant="secondary" size="sm" onClick={showMore} disabled={loadingMore} loading={loadingMore}>
                {loadingMore ? "Loading…" : `Show ${more} more`}
              </Button>
            </div>
          )}
        </>
      )}

      {detail && (
        <TransactionDetailModal
          txn={toDetailTxn(detail)}
          coa={coa.length ? coa : undefined}
          onClose={(changed) => {
            setDetail(null);
            if (changed) load(Math.max(INBOX_PAGE_SIZE, rows.length));
          }}
        />
      )}
    </StellaShell>
  );
}
