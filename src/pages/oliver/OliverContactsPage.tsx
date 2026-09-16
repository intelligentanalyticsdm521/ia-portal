import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMsal } from "@azure/msal-react";
import { useActiveAccount } from "../../auth/useAccessToken";
import { useOliverApi } from "../../hooks/useOliverApi";
import { formatPhone } from "../../lib/formatPhone";
import { oliverDownload } from "../../lib/oliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader, FilterBar, DataTable, DetailDrawer, EmptyState,
  StatusBadge, Button, type Column,
} from "../../components/oliver/ui";
import { CustomerModal } from "../../components/oliver/customer/CustomerModal";
import {
  BulkActionBar, TagModal, TagChip, InviteResultPanel, SavedViews, DuplicatesModal,
  type CustomerFilters, type TagRow, type InviteResult,
} from "../../components/oliver/customer/CustomerListActions";
import { PhoneInput } from "../../components/PhoneInput";
import { ReportBar } from '../../components/insights/ReportBar';
import { useProductInsightsPayload } from '../../hooks/useProductInsightsPayload';
// The MIXED customer list (spec section 7 point 2). LUMEN owns it, and
// useSparkApi is what a LUMEN client is called here.
import { Building2 } from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { type MixedCustomerRow, hasMoney } from "../../lib/customerModel";

// The pills are the FINANCIAL half of the one filter vocabulary
// (lib/customerViews.js FINANCIAL_FILTERS). They are sent to the server now
// rather than applied to whichever rows the browser happened to have: the list
// fetches one page, so filtering in the browser meant "has overdue" showed the
// overdue customers among the first fifty people, and called it all of them.
const CUSTOMER_PILLS = [
  { key: "", label: "All" },
  { key: "overdue", label: "Has overdue" },
  { key: "outstanding", label: "Has outstanding" },
  { key: "paying", label: "Active paying" },
  { key: "new", label: "New (no invoices)" },
];

const PORTAL_STATUS_LABEL: Record<string, string> = {
  never_invited: "Never invited",
  invited: "Invited",
  signed_in: "Signed in",
};

interface ListSummary {
  total: number;
  outstanding: number;
  overdue: number;
  with_overdue: number;
  active_paying: number;
  signed_in: number;
  invited: number;
  never_invited: number;
}

interface Contact {
  contact_id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  company_name?: string;
  outstanding_balance?: number;
  overdue_balance?: number;
  overdue_count?: number;
  total_paid?: number;
  last_payment_at?: string | null;
  // OLIVER pack 2 — a fact from oliver.portal_invite, not an inference.
  portal_status?: "never_invited" | "invited" | "signed_in";
  invited_at?: string | null;
  first_signin_at?: string | null;
  last_seen_at?: string | null;
  tags?: string[];
}

interface FinancialSnapshot {
  total_jobs: number;
  total_invoiced: number;
  total_paid: number;
  total_refunded: number;
  outstanding_balance: number;
  net_collected: number;
  last_job_date?: string | null;
  last_payment_date?: string | null;
  avg_invoice_value: number;
  service_types?: string | null;
}

interface ContactDetail extends Contact {
  addresses?: Array<{ address_line_1: string; city: string; state: string; postal_code: string }>;
  financial_snapshot?: FinancialSnapshot;
}

interface Activity {
  jobs: Array<{ job_id: string; job_number: string; title: string; status: string; scheduled_start?: string | null; created_at: string; completed_by?: string | null }>;
  quotes: Array<{ quote_id: string; status: string; total: number; valid_until?: string | null; created_at: string }>;
  invoices: Array<{ invoice_id: string; invoice_number: string; status: string; total: number; amount_paid: number; balance_due: number; paid_at?: string | null; created_at: string; source: string }>;
  payments: Array<{ payment_id: string; amount: number; type: string; status: string; paid_at?: string | null; invoice_number?: string | null }>;
  subscriptions: Array<{ subscription_id: string; service_name: string; line_items?: string | null; amount: number; currency?: string; billing_interval: string; billing_interval_count: number; status: string; current_period_end?: string | null; cancel_at_period_end?: boolean; coupon_name?: string | null; discount_percent?: number | null; discount_amount?: number | null }>;
}

function fmtMoney(n?: number | null) {
  return `$${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}
function contactName(c: Contact) {
  return c.company_name || `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "(no name)";
}

export function OliverContactsPage() {
  // Reports covering THIS function (Brandon 2026-08-14). Above any early
  // return — a hook below one runs on some renders only.
  const insightsPayload = useProductInsightsPayload('oliver').payload;

  const { get, post, patch, del, ready } = useOliverApi();
  const lumen = useSparkApi();
  const { instance } = useMsal();
  // useActiveAccount, NOT useMsal().accounts[0]: under VITE_DEV_AUTH=1 there
  // is no MSAL session, so accounts[0] is undefined and every `if (!account)`
  // guard below it turns the control into a button that does nothing.
  const activeAccount = useActiveAccount();
  const [contacts, setContacts] = useState<Contact[]>([]);
  // ── THE MIXED LIST, and why this page reads TWO things ──────────────────
  //
  // Spec section 7 point 2 asks OLIVER's Customers list to be the same mixed
  // list SPARK's is: companies as rows in their own right, with their people
  // and location counts, the open balance and the last job. That list is
  // GET /customers?view=mixed&scope=oliver, and its `scope=oliver` half is the
  // SAME predicate this page's own /contacts list uses (is_oliver_customer=1),
  // so the two cannot disagree about who is a customer.
  //
  // It does NOT replace /contacts here, because everything that makes this
  // page useful hangs off an OLIVER contact and has no meaning for a company:
  // the tags, the portal status, the financial pills, the saved views, the
  // bulk invite, the duplicate finder and the CSV export. Swapping the source
  // would have taken all of them out to gain two columns. So: companies come
  // from the mixed list, people come from /contacts as they always have, and
  // the location count each person's row shows comes from the mixed list too.
  const [mixed, setMixed] = useState<MixedCustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [search, setSearch] = useState("");
  const [pickedId, setPickedId] = useState<string | null>(null);
  /** A company has no OLIVER contact id, so it is opened by {kind, LUMEN id}. */
  const [pickedCompany, setPickedCompany] = useState<{ kind: "company"; id: string } | null>(null);
  /**
   * ?customer=company:2018&location=<guid> — the deep link SPARK's Companies
   * page uses to open a site. The location PAGE is OLIVER's (it carries the
   * job history and the fields the crew reads), so SPARK links here rather
   * than growing a second one that would show the same site with half the
   * facts. Read once and cleared, so Back does not re-open the modal.
   */
  const [linkParams, setLinkParams] = useSearchParams();
  const [focusLocationId, setFocusLocationId] = useState<string | null>(null);
  useEffect(() => {
    const raw = linkParams.get("customer");
    if (!raw) return;
    const [kind, id] = raw.split(":");
    if (kind === "company" && id) {
      setPickedCompany({ kind: "company", id });
      setFocusLocationId(linkParams.get("location"));
    }
    const next = new URLSearchParams(linkParams);
    next.delete("customer"); next.delete("location");
    setLinkParams(next, { replace: true });
  }, [linkParams, setLinkParams]);
  const [showCreate, setShowCreate] = useState(false);
  const [exporting, setExporting] = useState(false);


  const [filter, setFilter] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    customers: { imported: number; contacts_created: number; mappings_updated: number; total: number };
    invoices: { imported: number; relinked: number; total: number };
    subscriptions: { imported: number; relinked: number; total: number };
  } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  async function syncFromStripe() {
    setSyncing(true);
    setSyncError(null);
    setSyncResult(null);
    try {
      const result = await post<{
        customers: { imported: number; contacts_created: number; mappings_updated: number; total: number };
        invoices: { imported: number; relinked: number; total: number };
        subscriptions: { imported: number; relinked: number; total: number };
      }>("/settings/stripe/import");
      setSyncResult(result);
      await reload(); // Refresh the contacts list
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Sync failed";
      setSyncError(msg);
    } finally {
      setSyncing(false);
    }
  }

  // ── OLIVER pack 2 — the filter is the SERVER's, not the browser's ─────────
  //
  // This page fetched `/contacts` (one page, fifty rows) and then filtered and
  // totalled that page in JavaScript. On any business with more than fifty
  // customers every pill, every search and all four stat cards were answers
  // about the first fifty people, presented as answers about the business. The
  // filter object below is the one vocabulary the API, the CSV export, the bulk
  // actions and a saved view all speak, so they cannot select different people.
  const [portalStatus, setPortalStatus] = useState("");
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<ListSummary | null>(null);
  const [tags, setTags] = useState<TagRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);
  const [showTagModal, setShowTagModal] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [inviteResults, setInviteResults] = useState<InviteResult[] | null>(null);
  const [invitePortalUrl, setInvitePortalUrl] = useState<string | null>(null);
  const PER_PAGE = 100;

  const filters: CustomerFilters = useMemo(() => {
    const f: CustomerFilters = {};
    if (search.trim()) f.search = search.trim();
    if (filter) f.financial = filter;
    if (portalStatus) f.portal_status = portalStatus;
    if (tagFilter.length) f.tags_any = tagFilter;
    return f;
  }, [search, filter, portalStatus, tagFilter]);

  const queryString = useMemo(() => {
    const q = new URLSearchParams();
    if (filters.search) q.set("search", filters.search);
    if (filters.financial) q.set("financial", filters.financial);
    if (filters.portal_status) q.set("portal_status", filters.portal_status);
    if (filters.tags_any?.length) q.set("tags_any", filters.tags_any.join(","));
    return q.toString();
  }, [filters]);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const q = new URLSearchParams(queryString);
      q.set("page", String(page));
      q.set("per_page", String(PER_PAGE));
      const mixedQ = new URLSearchParams({ view: "mixed", scope: "oliver", limit: String(PER_PAGE) });
      if (filters.search) mixedQ.set("search", filters.search);
      const [rows, sum, mix] = await Promise.all([
        get<Contact[]>(`/contacts?${q.toString()}`),
        get<ListSummary>(`/contacts/summary${queryString ? `?${queryString}` : ""}`),
        // The search here matches a LOCATION's name, street, city and postcode
        // as well as the customer's own fields, which is how typing a street
        // finds the company that owns the building.
        lumen.ready
          ? lumen.get<{ data: MixedCustomerRow[] }>(`/api/v1/customers?${mixedQ}`).catch(() => ({ data: [] }))
          : Promise.resolve({ data: [] as MixedCustomerRow[] }),
      ]);
      setContacts(rows || []);
      setSummary(sum || null);
      setTotal(sum?.total ?? (rows?.length || 0));
      setMixed(mix.data || []);
    } catch (e) { setError(e); }
    finally { setLoading(false); }
  }, [get, lumen, queryString, page, filters.search]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  // The tag catalogue, once. It changes when somebody tags, and reload() is
  // called then too.
  const loadTags = useCallback(async () => {
    try { setTags(await get<TagRow[]>("/contacts/tags")); } catch { /* the list must not die for a chip */ }
  }, [get]);
  useEffect(() => { if (ready) void loadTags(); }, [ready, loadTags]);

  // Changing a filter starts at the first page. Otherwise a narrower filter on
  // page 4 shows an empty table and looks like a bug.
  useEffect(() => { setPage(1); setSelected(new Set()); }, [queryString]);

  /**
   * The COMPANY rows, and the location count for each person.
   *
   * A company is dropped the moment any person-level filter is on — a tag, a
   * portal status or a financial pill are all facts about a PERSON, and a
   * company row sitting inside "has overdue" would be claiming something
   * nobody computed for it. The same rule SPARK's list follows.
   */
  const peopleFilterActive = !!(filter || portalStatus || tagFilter.length);
  const companyRows = useMemo(
    () => (peopleFilterActive ? [] : mixed.filter((m) => m.customer_kind === "company")),
    [mixed, peopleFilterActive],
  );
  const locationCountByOliverId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const m of mixed) {
      if (m.customer_kind === "person" && m.oliver_contact_id) {
        map[m.oliver_contact_id.toUpperCase()] = m.location_count;
      }
    }
    return map;
  }, [mixed]);

  const filtered = contacts;

  const totalOutstanding = summary?.outstanding ?? 0;
  const totalOverdue = summary?.overdue ?? 0;
  const withOverdue = summary?.with_overdue ?? 0;
  const activePaying = summary?.active_paying ?? 0;

  // ── the three bulk actions ────────────────────────────────────────────────
  const selectedIds = useMemo(() => [...selected], [selected]);

  async function bulkTag(add: string[], remove: string[]) {
    setBulkBusy("tag");
    try {
      await post("/contacts/bulk/tag", { contact_ids: selectedIds, add, remove });
      await Promise.all([reload(), loadTags()]);
    } finally { setBulkBusy(null); }
  }

  async function bulkInvite() {
    setBulkBusy("invite");
    setInviteResults(null);
    try {
      const r = await post<{ results: InviteResult[]; portal_url: string | null }>(
        "/contacts/bulk/invite", { contact_ids: selectedIds },
      );
      setInviteResults(r.results || []);
      setInvitePortalUrl(r.portal_url || null);
      await reload();
    } catch (e) {
      setError(e);
    } finally { setBulkBusy(null); }
  }

  async function exportFiltered() {
    const account = activeAccount;
    if (!account) return;
    setExporting(true);
    try {
      // The SAME filter the list is showing, through the same parser. The old
      // export ignored the filter entirely and handed over everybody.
      await oliverDownload(
        instance, account,
        `/contacts/export${queryString ? `?${queryString}` : ""}`,
        `customers-${new Date().toISOString().slice(0, 10)}.csv`,
      );
    } catch (e) {
      console.error(e);
    } finally {
      setExporting(false);
    }
  }

  function fmtMoneyShort(n?: number | null) {
    return `$${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }

  const columns: Column<Contact>[] = [
    {
      key: "name", header: "Name", sortable: true,
      sortAccessor: (c) => contactName(c).toLowerCase(),
      render: (c) => (
        <div>
          <strong style={{ color: "#0B1C24" }}>{contactName(c)}</strong>
          {(c.overdue_count ?? 0) > 0 && (
            <span style={{
              display: "inline-block", marginLeft: 8, fontSize: 10, fontWeight: 600,
              padding: "2px 6px", borderRadius: 999, background: "#FEE2E2", color: "#991B1B",
            }}>
              {c.overdue_count} overdue
            </span>
          )}
        </div>
      ),
    },
    { key: "email",   header: "Email",   render: (c) => c.email || "—" },
    { key: "phone",   header: "Phone",   render: (c) => c.phone ? formatPhone(c.phone) : "—" },
    {
      // From the mixed list, joined on the OLIVER contact id. A person whose
      // row is not on this page of the mixed list shows "—", not 0: the count
      // is unknown, and 0 would be a claim.
      key: "locations", header: "Locations",
      render: (c) => {
        const n = locationCountByOliverId[(c.contact_id || "").toUpperCase()];
        return n === undefined
          ? <span style={{ color: "#94A3B8" }}>—</span>
          : n === 0
            ? <span style={{ color: "#94A3B8" }}>none yet</span>
            : <span>{n}</span>;
      },
    },
    {
      key: "outstanding_balance", header: "Outstanding", align: "right", sortable: true,
      sortAccessor: (c) => Number(c.outstanding_balance ?? 0),
      render: (c) => (c.outstanding_balance ?? 0) > 0
        ? <span style={{ fontFamily: "monospace", color: (c.overdue_count ?? 0) > 0 ? "#DC2626" : "#0B1C24", fontWeight: 600 }}>
            {fmtMoneyShort(c.outstanding_balance)}
          </span>
        : <span style={{ color: "#94A3B8" }}>—</span>,
    },
    {
      key: "total_paid", header: "Lifetime paid", align: "right", sortable: true,
      sortAccessor: (c) => Number(c.total_paid ?? 0),
      render: (c) => (c.total_paid ?? 0) > 0
        ? <span style={{ fontFamily: "monospace", color: "#059669", fontWeight: 600 }}>{fmtMoneyShort(c.total_paid)}</span>
        : <span style={{ color: "#94A3B8" }}>—</span>,
    },
    {
      key: "tags", header: "Tags",
      render: (c) => (c.tags?.length
        ? <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
            {c.tags.slice(0, 3).map((t) => <TagChip key={t} name={t} />)}
            {c.tags.length > 3 && <span style={{ fontSize: 11, color: "#64748B" }}>+{c.tags.length - 3}</span>}
          </span>
        : <span style={{ color: "#94A3B8" }}>—</span>),
    },
    {
      // OLIVER pack 2. "Never invited" and "we have no idea" used to be the
      // same blank space; they are different facts and the owner needs both.
      key: "portal_status", header: "Portal", sortable: true,
      sortAccessor: (c) => c.portal_status ?? "never_invited",
      render: (c) => {
        const st = c.portal_status ?? "never_invited";
        const tone = st === "signed_in" ? "#059669" : st === "invited" ? "#B45309" : "#94A3B8";
        const when = st === "signed_in" ? c.last_seen_at : st === "invited" ? c.invited_at : null;
        return (
          <span style={{ fontSize: 12, color: tone, fontWeight: st === "never_invited" ? 400 : 600 }}>
            {PORTAL_STATUS_LABEL[st]}
            {when && <span style={{ color: "#94A3B8", fontWeight: 400 }}> · {fmtDate(when)}</span>}
          </span>
        );
      },
    },
  ];

  return (
    <OliverPageWrapper title="Customers" subtitle="Customer database" error={error} loading={loading}>
      <ReportBar product="oliver" detail={insightsPayload?.detail} reports={[
        { id: 'oliver_top_customers', label: 'Top customers' },
      ]} />
      <PageHeader
        title="Customers"
        subtitle="Companies and people. Search a name, an email — or a street, and it finds the customer whose building it is."
        actions={
          <>
            <Button variant="secondary" onClick={syncFromStripe} disabled={syncing}>
              {syncing ? "Syncing from Stripe…" : "Sync from Stripe"}
            </Button>
            <Button variant="secondary" onClick={() => setShowDuplicates(true)}>Find duplicates</Button>
            <Button variant="secondary" onClick={exportFiltered} disabled={exporting || !total}>
              {exporting ? "Exporting…" : "Export CSV"}
            </Button>
            <Button variant="primary" data-tour="new-customer" onClick={() => setShowCreate(true)}>+ New customer</Button>
          </>
        }
      />
      {syncError && (
        <div style={{ padding: 12, margin: "8px 0", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, color: "#991B1B", fontSize: 13 }}>
          Stripe sync failed: {syncError}
        </div>
      )}
      {syncResult && (
        <div style={{ padding: 12, margin: "8px 0", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, color: "#15803D", fontSize: 13 }}>
          <strong>Stripe sync complete.</strong>{" "}
          {syncResult.customers.contacts_created > 0 && <>Created {syncResult.customers.contacts_created} new customer{syncResult.customers.contacts_created === 1 ? "" : "s"}. </>}
          {syncResult.customers.mappings_updated > 0 && <>Linked {syncResult.customers.mappings_updated} existing Stripe customer{syncResult.customers.mappings_updated === 1 ? "" : "s"}. </>}
          {syncResult.invoices.imported > 0 && <>Imported {syncResult.invoices.imported} new invoice{syncResult.invoices.imported === 1 ? "" : "s"}. </>}
          {syncResult.invoices.relinked > 0 && <>Re-linked {syncResult.invoices.relinked} orphaned invoice{syncResult.invoices.relinked === 1 ? "" : "s"}. </>}
          {syncResult.subscriptions.imported > 0 && <>Imported {syncResult.subscriptions.imported} new subscription{syncResult.subscriptions.imported === 1 ? "" : "s"}. </>}
          {syncResult.subscriptions.relinked > 0 && <>Re-linked {syncResult.subscriptions.relinked} orphaned subscription{syncResult.subscriptions.relinked === 1 ? "" : "s"}.</>}
          {syncResult.customers.contacts_created === 0 &&
            syncResult.customers.mappings_updated === 0 &&
            syncResult.invoices.imported === 0 &&
            syncResult.invoices.relinked === 0 &&
            syncResult.subscriptions.imported === 0 &&
            syncResult.subscriptions.relinked === 0 && <>Everything was already up to date.</>}
        </div>
      )}
      {inviteResults && (
        <InviteResultPanel results={inviteResults} portalUrl={invitePortalUrl} onClose={() => setInviteResults(null)} />
      )}
      {!contacts.length && !queryString ? (
        <EmptyState
          title="No customers yet"
          description="Add one with the button above, import a list, or let them arrive from a job, a quote or your booking page. Once they are here you can tag them, group them, and invite each of them into their own portal."
        />
      ) : (
        <>
          <div className="stat-row">
            <div className="stat-card">
              <div className="stat-lbl">{queryString ? "Customers matching" : "Total customers"}</div>
              <div className="stat-val">{total}</div>
              <div className="stat-delta neu">{queryString ? "this filter" : "in your database"}</div>
            </div>
            <div className="stat-card">
              <div className="stat-lbl">Using their portal</div>
              <div className="stat-val" style={{ color: (summary?.signed_in ?? 0) > 0 ? "#059669" : undefined }}>
                {summary?.signed_in ?? 0}
              </div>
              <div className="stat-delta neu">
                {summary?.invited ?? 0} invited, {summary?.never_invited ?? 0} never asked
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-lbl">Active paying</div>
              <div className="stat-val" style={{ color: "#059669" }}>{activePaying}</div>
              <div className="stat-delta neu">have paid 1+ invoice</div>
            </div>
            <div className="stat-card">
              <div className="stat-lbl">Outstanding</div>
              <div className="stat-val">{fmtMoneyShort(totalOutstanding)}</div>
              <div className="stat-delta neu">across all customers</div>
            </div>
            <div className="stat-card">
              <div className="stat-lbl">Overdue</div>
              <div className="stat-val" style={{ color: totalOverdue > 0 ? "#DC2626" : undefined }}>{fmtMoneyShort(totalOverdue)}</div>
              <div className="stat-delta neu">{withOverdue} customer{withOverdue === 1 ? "" : "s"}</div>
            </div>
          </div>

          <FilterBar
            pills={CUSTOMER_PILLS}
            activePill={filter}
            onPillChange={setFilter}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by name, email, phone, or company…"
            rightSlot={
              <select
                value={portalStatus}
                onChange={(e) => setPortalStatus(e.target.value)}
                aria-label="Portal status"
                style={{ padding: "6px 10px", border: "1px solid rgba(45,156,219,0.22)", borderRadius: 6, fontSize: 12 }}
              >
                <option value="">Portal: anyone</option>
                <option value="never_invited">Never invited</option>
                <option value="invited">Invited, not signed in</option>
                <option value="signed_in">Signed in</option>
              </select>
            }
          />

          {tags.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#64748B" }}>Tags:</span>
              {tags.map((t) => (
                <TagChip
                  key={t.id}
                  name={t.name}
                  color={t.color}
                  active={tagFilter.includes(t.name)}
                  onClick={() => setTagFilter((prev) => prev.includes(t.name) ? prev.filter((n) => n !== t.name) : [...prev, t.name])}
                />
              ))}
              {tagFilter.length > 0 && (
                <button onClick={() => setTagFilter([])} style={{ background: "none", border: "none", color: "#1D4ED8", fontSize: 12, cursor: "pointer" }}>
                  clear
                </button>
              )}
            </div>
          )}

          <SavedViews api={{ get, post, del }} current={filters} onApply={(f) => {
            setSearch(f.search ?? "");
            setFilter(f.financial ?? "");
            setPortalStatus(f.portal_status ?? "");
            setTagFilter(f.tags_any ?? []);
          }} />

          <BulkActionBar
            count={selected.size}
            busy={bulkBusy}
            onTag={() => setShowTagModal(true)}
            onInvite={bulkInvite}
            onExport={exportFiltered}
            onClear={() => setSelected(new Set())}
          />

          {companyRows.length > 0 && (
            <div style={{ marginBottom: 16 }} data-testid="oliver-company-rows">
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#5A7A8A", margin: "0 0 6px" }}>
                Companies
              </div>
              <DataTable
                rows={companyRows}
                rowKey={(c) => c.customer_id}
                onRowClick={(c) => setPickedCompany({ kind: "company", id: c.customer_id })}
                emptyMessage="No companies yet."
                columns={[
                  {
                    key: "name", header: "Name", sortable: true,
                    sortAccessor: (c) => c.name.toLowerCase(),
                    render: (c) => (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <Building2 size={14} color="#0C4A60" />
                        <strong style={{ color: "#0B1C24" }}>{c.name}</strong>
                        {c.domain && <span style={{ fontSize: 11, color: "#5A7A8A" }}>{c.domain}</span>}
                      </span>
                    ),
                  },
                  { key: "people", header: "People", render: (c) => c.contact_count || "—" },
                  {
                    key: "locations", header: "Locations",
                    render: (c) => c.location_count > 0
                      ? <span>{c.location_count}</span>
                      : <span style={{ color: "#94A3B8" }}>none yet</span>,
                  },
                  {
                    key: "open_balance", header: "Open balance", align: "right",
                    sortable: true, sortAccessor: (c) => Number(c.open_balance ?? 0),
                    // NULL means nobody computed it, which is not $0.00. Printing
                    // zero there tells an owner their customer is square when
                    // nothing looked.
                    render: (c) => !hasMoney(c)
                      ? <span style={{ color: "#94A3B8" }}>—</span>
                      : (c.open_balance ?? 0) > 0
                        ? <span style={{ fontFamily: "monospace", fontWeight: 600 }}>{fmtMoneyShort(c.open_balance)}</span>
                        : <span style={{ color: "#94A3B8" }}>—</span>,
                  },
                  {
                    key: "last_job", header: "Last job",
                    render: (c) => c.last_job_at
                      ? <span>{fmtDate(c.last_job_at)}</span>
                      : <span style={{ color: "#94A3B8" }}>never</span>,
                  },
                ]}
              />
            </div>
          )}

          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(c) => c.contact_id}
            onRowClick={(c) => setPickedId(c.contact_id)}
            initialSort={{ key: "outstanding_balance", direction: "desc" }}
            emptyMessage="No customers match this filter."
            selectedIds={selected}
            onSelectionChange={setSelected}
          />

          {total > PER_PAGE && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, fontSize: 13 }}>
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
              <span style={{ color: "#64748B" }}>
                {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, total)} of {total}
              </span>
              <Button variant="secondary" disabled={page * PER_PAGE >= total} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          )}
        </>
      )}

      {showTagModal && (
        <TagModal
          count={selected.size}
          tags={tags}
          onClose={() => setShowTagModal(false)}
          onApply={bulkTag}
        />
      )}
      {showDuplicates && (
        <DuplicatesModal
          api={{ get, post, del }}
          onClose={() => setShowDuplicates(false)}
          onMerged={() => { void reload(); setSelected(new Set()); }}
        />
      )}
      {pickedId && <CustomerModal customerId={pickedId} onClose={() => setPickedId(null)} api={{ get, post, patch, del }} onChanged={reload} />}
      {pickedCompany && (
        <CustomerModal
          customerKind={pickedCompany.kind}
          customerLumenId={pickedCompany.id}
          focusLocationId={focusLocationId ?? undefined}
          onClose={() => { setPickedCompany(null); setFocusLocationId(null); }}
          api={{ get, post, patch, del }}
          onChanged={reload}
        />
      )}
      {showCreate && (
        <NewContactModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); reload(); }}
          create={(b) => post("/contacts", b)}
        />
      )}
    </OliverPageWrapper>
  );
}

function NewContactModal({ onClose, onCreated, create }: { onClose: () => void; onCreated: () => void; create: (body: Record<string, string | undefined>) => Promise<unknown> }) {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    if (!first.trim() || !last.trim()) { setErr("First and last name are required."); return; }
    setSubmitting(true);
    try {
      await create({
        first_name: first.trim(),
        last_name: last.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        company_name: company.trim() || undefined,
      });
      onCreated();
    } catch (e) {
      const msg = (e as Error).message || "";
      if (msg.includes("409")) setErr("A customer with this email already exists.");
      else setErr(msg || "Failed to create customer");
    } finally { setSubmitting(false); }
  }

  return (
    <DetailDrawer open onClose={onClose} title="New customer" subtitle="Add a contact to your customer database" width="md">
      {err && (
        <div style={{ background: "#FEE2E2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: 6, padding: "8px 12px", fontSize: 12, marginBottom: 12 }}>
          {err}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <FormField label="First name *" value={first} onChange={setFirst} dataTour="customer-first-name" />
        <FormField label="Last name *" value={last} onChange={setLast} dataTour="customer-last-name" />
      </div>
      <FormField label="Email" value={email} onChange={setEmail} type="email" dataTour="customer-email" />
      <PhoneFormField label="Phone" value={phone} onChange={setPhone} />
      <FormField label="Company name" value={company} onChange={setCompany} />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" data-tour="save-customer" onClick={submit} disabled={submitting || !first.trim() || !last.trim()}>
          {submitting ? "Creating…" : "Create customer"}
        </Button>
      </div>
    </DetailDrawer>
  );
}

function FormField({ label, value, onChange, type = "text", dataTour }: { label: string; value: string; onChange: (v: string) => void; type?: string; dataTour?: string }) {
  return (
    <label style={{ display: "block", marginBottom: 10 }}>
      <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 }}>{label}</span>
      <input
        data-tour={dataTour}
        type={type} value={value} onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", padding: "7px 10px", fontSize: 12, border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6, background: "#fff" }}
      />
    </label>
  );
}

function PhoneFormField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: "block", marginBottom: 10 }}>
      <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 }}>{label}</span>
      <PhoneInput
        value={value} onChange={onChange}
        style={{ width: "100%", padding: "7px 10px", fontSize: 12, border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6, background: "#fff" }}
      />
    </label>
  );
}

// ──────────────────────────────────────────────────────────────────────────────

function ContactDetailModal({ contactId, onClose, api, onChanged }: {
  contactId: string;
  onClose: () => void;
  api: {
    get: <T>(p: string) => Promise<T>;
    post: <T>(p: string, b?: unknown) => Promise<T>;
    patch: <T>(p: string, b: unknown) => Promise<T>;
  };
  onChanged?: () => void;
}) {
  const navigate = useNavigate();
  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [tab, setTab] = useState<"overview" | "jobs" | "quotes" | "invoices" | "payments" | "subscriptions">("overview");
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const reload = async () => {
    setLoadErr(null);
    try {
      const [d, a] = await Promise.all([
        api.get<ContactDetail>(`/contacts/${contactId}`),
        api.get<Activity>(`/contacts/${contactId}/activity`),
      ]);
      setDetail(d);
      setActivity(a);
    } catch (e) {
      setLoadErr((e as Error)?.message || "Failed to load this customer.");
    }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [contactId]);

  if (loadErr) {
    return (
      <DetailDrawer open onClose={onClose} title="Couldn’t load customer" width="xl">
        <div style={{ padding: 20 }}>
          <div style={{ color: "#991B1B", background: "#FEE2E2", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 14 }}>
            {loadErr}
          </div>
          <Button variant="primary" onClick={reload}>Retry</Button>
        </div>
      </DetailDrawer>
    );
  }

  if (!detail || !activity) {
    return <DetailDrawer open onClose={onClose} title="Loading…" width="xl"><div style={{ padding: 20, color: "#5A7A8A" }}>Loading customer…</div></DetailDrawer>;
  }

  const snap = detail.financial_snapshot;
  const addrs = detail.addresses ?? [];

  // Derive a customer-health pill from the financial snapshot so admins see
  // at a glance whether this is a top spender, at-risk, or a slow payer.
  const healthPill = (() => {
    if (!snap) return null;
    const outstanding = Number(snap.outstanding_balance || 0);
    const totalPaid = Number(snap.total_paid || 0);
    const lastPaid = snap.last_payment_date ? new Date(snap.last_payment_date).getTime() : null;
    const daysSincePaid = lastPaid ? Math.floor((Date.now() - lastPaid) / 86400000) : null;

    // Priority: overdue/slow-pay > at-risk (quiet) > top-spender > new
    if ((detail.overdue_balance ?? 0) > 0) {
      return { label: "Slow payer", bg: "#FEE2E2", color: "#991B1B", icon: "⏰" };
    }
    if (totalPaid > 0 && daysSincePaid != null && daysSincePaid > 60 && daysSincePaid <= 365) {
      return { label: "At risk · went quiet", bg: "#FEF3C7", color: "#92400E", icon: "📉" };
    }
    if (totalPaid >= 5000) {
      return { label: "Top spender", bg: "#D1FAE5", color: "#047857", icon: "🏆" };
    }
    if (totalPaid === 0 && outstanding === 0 && snap.total_jobs === 0) {
      return { label: "New customer", bg: "#F1F5F9", color: "#5A7A8A", icon: "✨" };
    }
    if (outstanding > 0) {
      return { label: "Active · has balance", bg: "#DBEAFE", color: "#1E40AF", icon: "•" };
    }
    return { label: "Active · paid up", bg: "#D1FAE5", color: "#047857", icon: "✓" };
  })();

  return (
    <DetailDrawer
      open onClose={onClose}
      title={contactName(detail)}
      subtitle={[detail.email, detail.phone ? formatPhone(detail.phone) : null].filter(Boolean).join(" · ")}
      width="xl"
      headerActions={
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {healthPill && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "4px 10px", borderRadius: 99,
              background: healthPill.bg, color: healthPill.color,
              fontSize: 11, fontWeight: 700,
            }}>
              <span style={{ fontSize: 13 }}>{healthPill.icon}</span>
              {healthPill.label}
            </span>
          )}
          <Button variant="secondary" onClick={() => setShowEdit(true)}>
            Edit
          </Button>
          <Button variant="secondary" onClick={() => navigate(`/app/services/oliver_quotes?for_customer=${contactId}`)}>
            + Quote
          </Button>
          <Button variant="primary" onClick={() => navigate(`/app/services/oliver_invoices?for_customer=${contactId}`)}>
            + Invoice
          </Button>
        </div>
      }
    >
      <div className="ptabs" style={{ marginBottom: 16 }}>
        <button className={`ptab${tab === "overview" ? " active" : ""}`} onClick={() => setTab("overview")}>Overview</button>
        <button className={`ptab${tab === "jobs" ? " active" : ""}`} onClick={() => setTab("jobs")}>Jobs ({activity.jobs.length})</button>
        <button className={`ptab${tab === "quotes" ? " active" : ""}`} onClick={() => setTab("quotes")}>Quotes ({activity.quotes.length})</button>
        <button className={`ptab${tab === "invoices" ? " active" : ""}`} onClick={() => setTab("invoices")}>Invoices ({activity.invoices.length})</button>
        <button className={`ptab${tab === "payments" ? " active" : ""}`} onClick={() => setTab("payments")}>Payments ({activity.payments.length})</button>
        <button className={`ptab${tab === "subscriptions" ? " active" : ""}`} onClick={() => setTab("subscriptions")}>Subscriptions ({activity.subscriptions?.length ?? 0})</button>
      </div>

      {tab === "overview" && snap && (
        <>
          <div className="stat-row" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
            <div className="stat-card">
              <div className="stat-lbl">Lifetime value</div>
              <div className="stat-val">{fmtMoney(snap.net_collected)}</div>
              <div className="stat-delta neu">net of refunds</div>
            </div>
            <div className="stat-card">
              <div className="stat-lbl">Total jobs</div>
              <div className="stat-val">{snap.total_jobs}</div>
              <div className="stat-delta neu">last: {fmtDate(snap.last_job_date)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-lbl">Avg invoice</div>
              <div className="stat-val">{fmtMoney(snap.avg_invoice_value)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-lbl">Outstanding</div>
              <div className="stat-val">{fmtMoney(snap.outstanding_balance)}</div>
              <div className="stat-delta neu">last paid: {fmtDate(snap.last_payment_date)}</div>
            </div>
          </div>

          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
              <div>
                <div className="card-ttl">Service addresses</div>
                <div className="card-sub">{addrs.length ? `${addrs.length} on file` : "None on file"}</div>
              </div>
              <Button variant="secondary" onClick={() => setShowAddAddress(true)}>+ Add address</Button>
            </div>
            {addrs.length ? (
              addrs.map((a, i) => (
                <div key={i} style={{ padding: "8px 0", fontSize: 12, color: "#0B1C24", borderTop: i > 0 ? "1px solid #f0f4f6" : "none" }}>
                  {a.address_line_1}, {a.city}, {a.state} {a.postal_code}
                </div>
              ))
            ) : (
              <div style={{ fontSize: 11, color: "#5A7A8A", fontStyle: "italic", padding: "4px 0" }}>
                Add a service address so this customer can be assigned to jobs.
              </div>
            )}
          </div>

          {snap.service_types && (
            <div className="card">
              <div className="card-ttl">Services used</div>
              <div className="card-sub">{snap.service_types}</div>
            </div>
          )}
        </>
      )}

      {showAddAddress && (
        <AddAddressModal
          contactId={contactId}
          onClose={() => setShowAddAddress(false)}
          onAdded={() => { setShowAddAddress(false); reload(); }}
          create={(b) => api.post(`/contacts/${contactId}/addresses`, b)}
        />
      )}

      {tab === "jobs" && (
        <table className="tbl">
          <thead><tr>
            <th>Job #</th><th>Title</th><th>Status</th><th>Scheduled</th><th>Completed by</th>
          </tr></thead>
          <tbody>
            {activity.jobs.map((j) => (
              <tr key={j.job_id}>
                <td><strong>{j.job_number}</strong></td>
                <td>{j.title || "—"}</td>
                <td><StatusBadge status={j.status} /></td>
                <td>{fmtDate(j.scheduled_start)}</td>
                <td>{j.completed_by || "—"}</td>
              </tr>
            ))}
            {!activity.jobs.length && <tr><td colSpan={5} style={{ textAlign: "center", padding: "20px 0", color: "#5A7A8A" }}>No jobs yet</td></tr>}
          </tbody>
        </table>
      )}

      {tab === "quotes" && (
        <table className="tbl">
          <thead><tr>
            <th>Status</th><th style={{ textAlign: "right" }}>Total</th><th>Valid until</th><th>Created</th>
          </tr></thead>
          <tbody>
            {activity.quotes.map((q) => (
              <tr key={q.quote_id}>
                <td><StatusBadge status={q.status} /></td>
                <td style={{ textAlign: "right" }}>{fmtMoney(q.total)}</td>
                <td>{fmtDate(q.valid_until)}</td>
                <td>{fmtDate(q.created_at)}</td>
              </tr>
            ))}
            {!activity.quotes.length && <tr><td colSpan={4} style={{ textAlign: "center", padding: "20px 0", color: "#5A7A8A" }}>No quotes yet</td></tr>}
          </tbody>
        </table>
      )}

      {tab === "invoices" && (
        <table className="tbl">
          <thead><tr>
            <th>Invoice #</th><th>Status</th><th style={{ textAlign: "right" }}>Total</th>
            <th style={{ textAlign: "right" }}>Paid</th><th style={{ textAlign: "right" }}>Balance</th>
            <th>Source</th><th>Date</th>
          </tr></thead>
          <tbody>
            {activity.invoices.map((i) => (
              <tr key={i.invoice_id}>
                <td><strong>{i.invoice_number}</strong></td>
                <td><StatusBadge status={i.status} /></td>
                <td style={{ textAlign: "right" }}>{fmtMoney(i.total)}</td>
                <td style={{ textAlign: "right" }}>{fmtMoney(i.amount_paid)}</td>
                <td style={{ textAlign: "right" }}>{fmtMoney(i.balance_due)}</td>
                <td style={{ fontSize: 10, textTransform: "uppercase", color: "#5A7A8A" }}>{i.source || "oliver"}</td>
                <td>{fmtDate(i.created_at)}</td>
              </tr>
            ))}
            {!activity.invoices.length && <tr><td colSpan={7} style={{ textAlign: "center", padding: "20px 0", color: "#5A7A8A" }}>No invoices yet</td></tr>}
          </tbody>
        </table>
      )}

      {tab === "payments" && (
        <table className="tbl">
          <thead><tr>
            <th>Date</th><th>Invoice</th><th>Type</th><th style={{ textAlign: "right" }}>Amount</th><th>Status</th>
          </tr></thead>
          <tbody>
            {activity.payments.map((p) => (
              <tr key={p.payment_id}>
                <td>{fmtDate(p.paid_at)}</td>
                <td>{p.invoice_number ? <span style={{ fontFamily: "monospace" }}>{p.invoice_number}</span> : "—"}</td>
                <td>{p.type}</td>
                <td style={{ textAlign: "right", color: p.type === "refund" ? "#9333EA" : "#059669" }}>
                  {p.type === "refund" ? "−" : ""}{fmtMoney(p.amount)}
                </td>
                <td><StatusBadge status={p.status} /></td>
              </tr>
            ))}
            {!activity.payments.length && <tr><td colSpan={5} style={{ textAlign: "center", padding: "20px 0", color: "#5A7A8A" }}>No payments yet</td></tr>}
          </tbody>
        </table>
      )}

      {tab === "subscriptions" && (
        <table className="tbl">
          <thead><tr>
            <th>Service</th><th style={{ textAlign: "right" }}>Amount</th><th>Cycle</th><th>Discount</th><th>Renews</th><th>Status</th>
          </tr></thead>
          <tbody>
            {(activity.subscriptions ?? []).map((s) => (
              <tr key={s.subscription_id}>
                <td>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "#0B1C24" }}>{s.service_name}</div>
                  {s.line_items && s.line_items !== s.service_name && (
                    <div style={{ fontSize: 11, color: "#5A7A8A" }}>{s.line_items}</div>
                  )}
                </td>
                <td style={{ textAlign: "right", fontFamily: "monospace" }}>{fmtMoney(s.amount)}</td>
                <td>{s.billing_interval_count > 1 ? `every ${s.billing_interval_count} ${s.billing_interval}s` : `/${s.billing_interval}`}</td>
                <td>{s.coupon_name
                  ? <span style={{ fontSize: 11, color: "#9333EA" }}>{s.coupon_name}{s.discount_percent ? ` (${s.discount_percent}% off)` : s.discount_amount ? ` ($${s.discount_amount} off)` : ""}</span>
                  : "—"}</td>
                <td>{s.cancel_at_period_end ? <span style={{ color: "#B45309" }}>ends {fmtDate(s.current_period_end)}</span> : fmtDate(s.current_period_end)}</td>
                <td><StatusBadge status={s.status} /></td>
              </tr>
            ))}
            {!(activity.subscriptions ?? []).length && <tr><td colSpan={6} style={{ textAlign: "center", padding: "20px 0", color: "#5A7A8A" }}>No subscriptions yet</td></tr>}
          </tbody>
        </table>
      )}
      {showEdit && detail && (
        <EditContactModal
          contact={detail}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); reload(); onChanged?.(); }}
          patch={(b) => api.patch(`/contacts/${contactId}`, b)}
        />
      )}
    </DetailDrawer>
  );
}

// EditContactModal — mirrors NewContactModal but pre-populates from an existing
// row and calls PATCH /contacts/:id (which writes to lumen.contact as of the
// 2026-05-25 contact unification).
function EditContactModal({ contact, onClose, onSaved, patch }: {
  contact: ContactDetail;
  onClose: () => void;
  onSaved: () => void;
  patch: (body: Record<string, string | undefined>) => Promise<unknown>;
}) {
  const [first, setFirst] = useState(contact.first_name || "");
  const [last, setLast] = useState(contact.last_name || "");
  const [email, setEmail] = useState(contact.email || "");
  // Normalize whatever was stored (raw, hyphens, etc.) into the
  // canonical +1 (555) 555-5555 display format when the editor opens.
  const [phone, setPhone] = useState(contact.phone ? formatPhone(contact.phone) : "");
  const [company, setCompany] = useState(contact.company_name || "");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    if (!first.trim() || !last.trim()) { setErr("First and last name are required."); return; }
    setSubmitting(true);
    try {
      await patch({
        first_name: first.trim(),
        last_name: last.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        company_name: company.trim() || undefined,
      });
      onSaved();
    } catch (e) {
      setErr((e as Error).message || "Failed to update customer");
    } finally { setSubmitting(false); }
  }

  return (
    <DetailDrawer open onClose={onClose} title="Edit customer" subtitle={contact.email || contact.phone || undefined} width="md">
      {err && (
        <div style={{ background: "#FEE2E2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: 6, padding: "8px 12px", fontSize: 12, marginBottom: 12 }}>
          {err}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <FormField label="First name *" value={first} onChange={setFirst} />
        <FormField label="Last name *" value={last} onChange={setLast} />
      </div>
      <FormField label="Email" value={email} onChange={setEmail} type="email" />
      <PhoneFormField label="Phone" value={phone} onChange={setPhone} />
      <FormField label="Company name" value={company} onChange={setCompany} />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={submitting || !first.trim() || !last.trim()}>
          {submitting ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </DetailDrawer>
  );
}

function AddAddressModal({ contactId, onClose, onAdded, create }: { contactId: string; onClose: () => void; onAdded: () => void; create: (body: Record<string, string>) => Promise<unknown> }) {
  const [label, setLabel] = useState("Primary");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [accessNotes, setAccessNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    if (!line1.trim() || !city.trim() || !state.trim() || !zip.trim()) {
      setErr("Street, city, state, and ZIP are required.");
      return;
    }
    setSubmitting(true);
    try {
      await create({
        label: label.trim() || "Primary",
        address_line_1: line1.trim(),
        address_line_2: line2.trim() || "",
        city: city.trim(), state: state.trim(),
        postal_code: zip.trim(),
        access_notes: accessNotes.trim() || "",
      });
      onAdded();
    } catch (e) {
      setErr((e as Error).message || "Failed to add address");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DetailDrawer open onClose={onClose} title="Add service address" subtitle={`Linked to contact ${contactId.slice(0, 8)}…`} width="md">
      {err && (
        <div style={{ background: "#FEE2E2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: 6, padding: "8px 12px", fontSize: 12, marginBottom: 12 }}>{err}</div>
      )}
      <FormField label="Label (e.g. Home, Office, Warehouse)" value={label} onChange={setLabel} />
      <FormField label="Street address *" value={line1} onChange={setLine1} />
      <FormField label="Suite / unit (optional)" value={line2} onChange={setLine2} />
      <div style={{ display: "grid", gridTemplateColumns: "2fr 80px 100px", gap: 8, marginBottom: 10 }}>
        <FormField label="City *" value={city} onChange={setCity} />
        <FormField label="State *" value={state} onChange={setState} />
        <FormField label="ZIP *" value={zip} onChange={setZip} />
      </div>
      <label style={{ display: "block", marginBottom: 10 }}>
        <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 }}>Access notes (gate code, dog warning, etc.)</span>
        <textarea
          rows={2} value={accessNotes} onChange={(e) => setAccessNotes(e.target.value)}
          style={{ width: "100%", padding: "7px 10px", fontSize: 12, border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6, fontFamily: "inherit" }}
        />
      </label>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={submitting || !line1.trim() || !city.trim() || !state.trim() || !zip.trim()}>
          {submitting ? "Adding…" : "Add address"}
        </Button>
      </div>
    </DetailDrawer>
  );
}
