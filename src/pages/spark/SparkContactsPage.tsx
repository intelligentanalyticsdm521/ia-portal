import { useEffect, useState, useCallback, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
// Banners everywhere (LOCKED 2026-09-04): the same 60/75/90 component the Lead
// Inbox and the campaign sends use, so "you are running out" always looks and
// reads the same wherever it happens.
import { SparkUsageCapacityBanner } from "../../components/spark/SparkCapacityBanner";
import { SparkStatStrip } from "../../components/spark/SparkStatStrip";
import { SparkDrawer } from "../../components/spark/SparkDrawer";
import { SparkContactModal } from "../../components/spark/SparkContactModal";
import { SparkQuickAddGrid } from "../../components/spark/SparkQuickAddGrid";
import { SparkTagsModal } from "../../components/spark/SparkTagsModal";
import { SparkTable, type SparkTableColumn } from "../../components/spark/SparkTable";
import { SparkFilterPills } from "../../components/spark/SparkFilterPills";
import { SparkSearchBox } from "../../components/spark/SparkSearchBox";
import { SparkTooltip } from "../../components/spark/SparkTooltip";
import {
  Users, Plus, Upload, Download, Mail, Phone, Building2, Sparkles, Trash2,
  Rows3, Tag as TagIcon, ListPlus, Send, MoreHorizontal, AlertTriangle, ChevronUp, ChevronDown, Activity,
  UserSearch,
  LayoutList, Columns3,
} from "lucide-react";
// F5 (Brandon 2026-06-25) — Kanban view of lumen.contact rows grouped by
// lifecycle_stage. Columns rendered from the tenant's lifecycle_preset
// (simplified=3, moderate=5, advanced=10) via GET /api/v1/lifecycle/preset.
import { SparkLifecycleKanban } from "../../components/spark/SparkLifecycleKanban";
import { readSpreadsheet, parseDelimited, gridToRows, toContact } from "../../lib/sheetImport";
import { PhoneInput } from "../../components/PhoneInput";
import { ReportBar } from '../../components/insights/ReportBar';
import { useProductInsightsPayload } from '../../hooks/useProductInsightsPayload';
// The MIXED list (customer model spec, section 7 point 1) and the one place
// its two decisions live: which rows are a group, and what "People only" means.
import {
  type MixedCustomerRow, groupMixedList, peopleOnly, customerKey, hasMoney,
  type CustomerRole, ROLE_LABEL, ROLE_HELP,
} from "../../lib/customerModel";
import { CompanyTypeahead, NO_COMPANY, resolveCompanyChoice, type CompanyChoice } from "../../components/customers/CompanyTypeahead";

/** Initials for a person row on the mixed list. */
function rowInitials(row: { name: string }): string {
  const parts = String(row.name || "").trim().split(/\s+/);
  const a = (parts[0]?.[0] || "?").toUpperCase();
  const b = (parts[1]?.[0] || "").toUpperCase();
  return a + b;
}

type SortKey = "name" | "email" | "score" | "company" | "created";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 25;

export function SparkContactsPage() {
  // Reports covering THIS function (Brandon 2026-08-14). Above any early
  // return — a hook below one runs on some renders only.
  const insightsPayload = useProductInsightsPayload('spark').payload;

  // put/del are needed by the Tags modal, which manages tags from this page.
  const { get, post, put, del, ready } = useSparkApi();
  const navigate = useNavigate();

  // List state.
  //
  // The rows are the MIXED list now (spec section 7 point 1): company rows
  // first, then the people who are not at a company. It is the same query
  // OLIVER's Customers page reads, which is the point - two lists built from
  // two queries disagree the first time one of them gets a filter fixed.
  const [rows, setRows] = useState<MixedCustomerRow[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  // BY NAME, ascending, to start. The server orders the mixed list by name and
  // the artboard reads that way; defaulting to "newest first" re-sorted the
  // page into an order the pagination does not share, so page 2 could repeat a
  // row page 1 had already shown.
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // F5 — view toggle [List | Kanban]. Default 'list' (Brandon LOCK 2026-06-25).
  // Kanban hits GET /api/v1/lifecycle/kanban; List hits the existing
  // /contacts endpoint.
  //
  // 2026-09-15 (prod defect, Brandon — "I can't get back to the full contacts
  // list"): the pick used to live in localStorage, so clicking Contacts in the
  // left nav re-landed on whatever view you last used — with no way out, since
  // the same route does not remount. The view lives in the URL (?view=kanban,
  // absent = list), which makes the nav link, the browser Back button, a
  // refresh and a deep link all agree.
  //
  // 2026-09-16 (D-128): "companies" left this union. Companies is its own page
  // again, so the Companies button navigates instead of switching a view —
  // and the back button that only existed to climb out of the nested surface
  // went with it, because the page it climbed out of now has its own.
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get("view");
  const view: "list" | "kanban" = viewParam === "kanban" ? "kanban" : "list";
  const setView = useCallback((next: "list" | "kanban") => {
    const params = new URLSearchParams(searchParams);
    if (next === "list") params.delete("view"); else params.set("view", next);
    params.delete("company");
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  // Selection state (bulk actions)
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<null | "tag" | "untag" | "delete" | "inactive">(null);
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const [availableTags, setAvailableTags] = useState<Array<{ id: number; name: string }>>([]);
  const [newTagName, setNewTagName] = useState("");

  // Drawer state
  const [drawer, setDrawer] = useState<"add" | "import" | "detail" | null>(null);
  const [quickAdd, setQuickAdd] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  // The open contact is an ID, not a row. The list now holds mixed rows, and a
  // stub row built to satisfy the modal's props is a record that looks loaded
  // and is not — the modal fetches by id anyway.
  const [detailId, setDetailId] = useState<number | null>(null);
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", phone: "", title: "" });
  /** The Company field's answer: an existing company, a new one, or none. */
  const [company, setCompany] = useState<CompanyChoice>(NO_COMPANY);
  /** The person's role at that company (spec section 7 point 3). */
  const [role, setRole] = useState<CustomerRole | "">("");
  const [saving, setSaving] = useState(false);
  /**
   * Id of the contact created in this session — marks its row for the
   * walkthrough's "open it back up" step.
   *
   * Replaces matching on email "test@email.com", which only worked if the user
   * typed exactly that. Keying on the returned id works whatever they type and
   * still can't point at a record they didn't just create.
   */
  const [justCreatedId, setJustCreatedId] = useState<number | null>(null);
  const [importText, setImportText] = useState("");
  /** Rows parsed from an uploaded .csv/.xlsx, ready to send. */
  const [importFileRows, setImportFileRows] = useState<ReturnType<typeof toContact>[] | null>(null);
  const [importFileName, setImportFileName] = useState("");
  const [importFileError, setImportFileError] = useState<string | null>(null);

  // ─ Load ─────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ view: "mixed", page: String(page), limit: String(PAGE_SIZE) });
      if (search) params.set("search", search);
      // The server's search matches a LOCATION's name, street, city and
      // postcode as well as the person's own fields, so typing a street finds
      // the customer it belongs to.
      const raw = await get<{ data: MixedCustomerRow[]; meta: { total: number } }>(`/api/v1/customers?${params}`);
      setRows(raw.data || []);
      setTotal(raw.meta?.total || 0);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready, page, search]);
  useEffect(() => { load(); }, [load]);

  // ─ Filter + sort ────────────────────────────────────────────────────────
  //
  // "People only" is a FILTER of the rows already fetched, not a second
  // request: the chip exists so bulk actions have checkboxes, and a chip that
  // re-queried would hand you a different page of people from the one you were
  // looking at. Every other pill is a person-only property, so each of them
  // implies the flatten - a "Tier X" list with company rows in it would be
  // claiming those companies are Tier X.
  const peopleOnlyView = filter !== "all";

  const filtered = useMemo(() => {
    let out = peopleOnlyView ? peopleOnly(rows) : rows;
    if (filter === "subscribed") out = out.filter(c => !c.email_unsubscribed && !c.email_invalid);
    else if (filter === "unsubscribed") out = out.filter(c => c.email_unsubscribed);
    // Bounced is its own filter, not a shade of unsubscribed: unsubscribed is
    // a choice the person made and must be respected, bounced is a broken
    // address you should go and replace.
    else if (filter === "bounced") out = out.filter(c => c.email_invalid);
    else if (filter === "tier_x") out = out.filter(c => c.contact_intelligence_tier === "X");
    else if (filter === "tier_y") out = out.filter(c => c.contact_intelligence_tier === "Y");
    else if (filter === "tier_z") out = out.filter(c => c.contact_intelligence_tier === "Z");
    else if (filter === "unscored") out = out.filter(c => !c.contact_intelligence_tier);
    else if (filter === "no_email") out = out.filter(c => !c.email);

    const sorted = [...out].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortKey) {
        case "email": return dir * (a.email || "").localeCompare(b.email || "");
        case "score": return dir * ((a.contact_intelligence_score || 0) - (b.contact_intelligence_score || 0));
        case "company": return dir * ((a.domain || "").localeCompare(b.domain || ""));
        case "created": return dir * (new Date(a.updated_at || 0).getTime() - new Date(b.updated_at || 0).getTime());
        case "name":
        default: return dir * a.name.localeCompare(b.name);
      }
    });
    // Companies first, then the labelled group - the order IS the decision, so
    // it is applied after the sort rather than smuggled into the comparator.
    if (peopleOnlyView) return sorted;
    const g = groupMixedList(sorted);
    return [...g.companies, ...g.peopleWithoutCompany];
  }, [rows, filter, peopleOnlyView, sortKey, sortDir]);

  /** The first person row, so the table knows where to draw the divider. */
  const firstPersonKey = useMemo(() => {
    if (peopleOnlyView) return null;
    const first = filtered.find(r => r.customer_kind === "person");
    return first ? customerKey(first) : null;
  }, [filtered, peopleOnlyView]);

  // ─ Stats ────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const companies = rows.filter(r => r.customer_kind === "company").length;
    const people = rows.filter(r => r.customer_kind === "person");
    const tierX = people.filter(c => c.contact_intelligence_tier === "X").length;
    const unsubscribed = people.filter(c => c.email_unsubscribed).length;
    const invalid = people.filter(c => c.email_invalid).length;
    return { total, companies, notAtACompany: people.length, tierX, unsubscribed, invalid };
  }, [rows, total]);

  // ─ Actions ──────────────────────────────────────────────────────────────
  /**
   * A row opens the thing it IS. A company row opens the Companies page at
   * that company — a destination with its own back button, its billing, its
   * people and its locations; a person row opens the contact modal it always
   * did. The list said which kind it was, so the click must not ask again.
   */
  function openRow(row: MixedCustomerRow) {
    if (row.customer_kind === "company") {
      navigate(`/app/services/spark_accounts?company=${row.customer_id}`);
      return;
    }
    setDetailId(Number(row.customer_id));
    setDrawer("detail");
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "score" ? "desc" : "asc"); }
  }

  function toggleSelected(id: number) {
    setSelected(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  /** Select-all reaches PEOPLE only. A company row carries no checkbox, so
   *  including it would put a bulk delete on rows the user cannot see ticked. */
  const selectablePeople = useMemo(
    () => filtered.filter(r => r.customer_kind === "person").map(r => Number(r.customer_id)),
    [filtered],
  );
  function toggleSelectAll() {
    if (selected.size === selectablePeople.length) setSelected(new Set());
    else setSelected(new Set(selectablePeople));
  }
  function clearSelection() { setSelected(new Set()); }

  // ── Bulk-action wiring (lumen-api endpoints exist; this just hooks them up).
  // Backend contracts (lumen-api routes/contactBulk.js):
  //   POST /contacts/bulk/tag      { contact_ids, tag_id }
  //   POST /contacts/bulk/untag    { contact_ids, tag_id }
  //   POST /contacts/bulk/delete   { contact_ids }  (soft-delete: is_deleted=1)
  //   GET  /tags                                  (list)
  //   POST /tags                   { name }       (create)
  const loadTags = useCallback(async () => {
    try {
      const r = await get<{ data: Array<{ id: number; name: string }> }>("/api/v1/tags");
      setAvailableTags((r as { data?: Array<{ id: number; name: string }> })?.data || []);
    } catch { /* empty list is fine */ }
  }, [get]);

  const applyBulkTag = useCallback(async (tagId: number, tagName: string) => {
    if (selected.size === 0) return;
    setBulkBusy("tag");
    try {
      await post("/api/v1/contacts/bulk/tag", { contact_ids: Array.from(selected), tag_id: tagId });
      clearSelection();
      await load();
      // eslint-disable-next-line no-console
      console.log(`[bulk] tagged ${selected.size} contacts with "${tagName}"`);
    } catch (e) {
      alert(`Tagging failed: ${(e as Error)?.message || "unknown"}`);
    } finally { setBulkBusy(null); }
    // intentionally not adding `load` to deps — outer load pattern handles it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, post]);

  const createAndApplyTag = useCallback(async () => {
    const name = newTagName.trim();
    if (!name || selected.size === 0) return;
    setBulkBusy("tag");
    try {
      const created = await post<{ data: { id: number; name: string } }>("/api/v1/tags", { name });
      const tagId = (created as { data?: { id: number } })?.data?.id;
      if (!tagId) throw new Error("Tag create returned no id");
      await post("/api/v1/contacts/bulk/tag", { contact_ids: Array.from(selected), tag_id: tagId });
      setNewTagName("");
      setTagMenuOpen(false);
      setAvailableTags((tags) => [...tags, { id: tagId, name }]);
      clearSelection();
      await load();
    } catch (e) {
      alert(`Tag create failed: ${(e as Error)?.message || "unknown"}`);
    } finally { setBulkBusy(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newTagName, selected, post]);

  const markInactive = useCallback(async () => {
    if (selected.size === 0) return;
    setBulkBusy("inactive");
    try {
      // Ensure the "inactive" tag exists; create if not.
      if (!availableTags.length) await loadTags();
      let inactiveTag = availableTags.find((t) => t.name.toLowerCase() === "inactive");
      if (!inactiveTag) {
        const created = await post<{ data: { id: number; name: string } }>("/api/v1/tags", { name: "inactive" });
        const id = (created as { data?: { id: number } })?.data?.id;
        if (!id) throw new Error("Could not create 'inactive' tag");
        inactiveTag = { id, name: "inactive" };
        setAvailableTags((tags) => [...tags, inactiveTag!]);
      }
      await post("/api/v1/contacts/bulk/tag", { contact_ids: Array.from(selected), tag_id: inactiveTag.id });
      clearSelection();
      await load();
    } catch (e) {
      alert(`Mark inactive failed: ${(e as Error)?.message || "unknown"}`);
    } finally { setBulkBusy(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, availableTags, post, loadTags]);

  // #355 — Bulk cascade preview. Loops the single-contact preview endpoint for
  // each selected id and sums the counts client-side. P0 slice; server-side
  // batch aggregation can come later.
  interface CascadePreview {
    invoices?: number;
    subs?: number;
    proposals?: number;
    docs?: number;
    stripe_subs_to_cancel?: number;
  }
  const [bulkCascadeOpen, setBulkCascadeOpen] = useState(false);
  const [bulkCascadeLoading, setBulkCascadeLoading] = useState(false);
  const [bulkCascadeTotals, setBulkCascadeTotals] = useState<CascadePreview | null>(null);

  const confirmAndBulkDelete = useCallback(async () => {
    if (selected.size === 0) return;
    setBulkCascadeLoading(true);
    setBulkCascadeTotals(null);
    setBulkCascadeOpen(true);
    try {
      const ids = Array.from(selected);
      const results = await Promise.all(ids.map(async (id) => {
        try { return await get<CascadePreview>(`/api/v1/contacts/${id}/archive-cascade/preview`); }
        catch { return {} as CascadePreview; }
      }));
      const totals: CascadePreview = { invoices: 0, subs: 0, proposals: 0, docs: 0, stripe_subs_to_cancel: 0 };
      for (const r of results) {
        totals.invoices! += r.invoices || 0;
        totals.subs! += r.subs || 0;
        totals.proposals! += r.proposals || 0;
        totals.docs! += r.docs || 0;
        totals.stripe_subs_to_cancel! += r.stripe_subs_to_cancel || 0;
      }
      setBulkCascadeTotals(totals);
    } finally {
      setBulkCascadeLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, get]);

  const performBulkDelete = useCallback(async () => {
    if (selected.size === 0) return;
    setBulkBusy("delete");
    try {
      await post("/api/v1/contacts/bulk/delete", { contact_ids: Array.from(selected) });
      setBulkCascadeOpen(false);
      clearSelection();
      await load();
    } catch (e) {
      alert(`Delete failed: ${(e as Error)?.message || "unknown"}`);
    } finally { setBulkBusy(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, post]);

  async function handleAdd() {
    if (!form.first_name && !form.email) return;
    setSaving(true);
    try {
      // The company FIRST, because the contact carries its id. "Add as a new
      // company" creates it here; picking an existing one just hands over the
      // id it already has. Either way an explicit id beats the server's
      // email-domain guess, which is the whole reason the field stopped being
      // free text.
      const accountId = await resolveCompanyChoice(company, post);
      const created = await post<{ data?: { id?: number } }>("/api/v1/contacts", {
        ...form,
        company: company.name.trim() || null,
        account_id: accountId,
      });
      const newId = created?.data?.id;
      // Keep the new id so its row can carry the walkthrough hook — see
      // justCreatedId. If the response has no id we simply mark nothing,
      // which is the safe direction: no hook beats the wrong hook.
      if (newId) setJustCreatedId(newId);
      // The role at the company, when both a company and a role were named.
      // Best-effort AFTER the contact exists: a role that fails must not lose
      // the person who was just saved, and the card says who has no role yet.
      if (newId && accountId && role) {
        try {
          await post(`/api/v1/customers/company/${accountId}/people`, {
            person_contact_id: newId, role,
          });
        } catch (e) {
          alert(`Saved ${form.first_name || form.email}, but the role did not stick: ${(e as Error).message}`);
        }
      }
      setDrawer(null);
      setForm({ first_name: "", last_name: "", email: "", phone: "", title: "" });
      setCompany(NO_COMPANY);
      setRole("");
      await load();
    } catch (err) { setError(err); }
    finally { setSaving(false); }
  }

  /** Read the chosen file and show what we found BEFORE anything is sent. */
  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setImportFileError(null);
    setImportFileRows(null);
    setImportFileName("");
    if (!file) return;
    try {
      const grid = await readSpreadsheet(file);
      const rows = gridToRows(grid)
        .map(toContact)
        .filter((c) => c.email || c.first_name);   // skip blank/filler rows
      if (!rows.length) {
        setImportFileError(
          "No contacts found. Check the first row holds column names like First Name and Email.",
        );
        return;
      }
      setImportFileRows(rows);
      setImportFileName(file.name);
    } catch (err) {
      // SheetImportError messages are written for the user; anything else is
      // surfaced verbatim rather than swallowed into a generic failure.
      setImportFileError(String((err as Error)?.message || err));
    }
  }

  async function handleImport() {
    // File wins when one is loaded; otherwise parse the pasted text.
    //
    // The paste path used to be `line.split(",")`, which corrupted any row
    // containing a quoted comma — "Smith, Jane" became two columns and shifted
    // every field after it. Both paths now share the RFC4180 parser in
    // lib/sheetImport.ts.
    const rows = importFileRows
      ?? gridToRows(parseDelimited(importText)).map(toContact).filter((c) => c.email || c.first_name);
    if (!rows.length) return;

    setSaving(true);
    try {
      let count = 0;
      const failures: string[] = [];
      for (const r of rows) {
        try {
          await post("/api/v1/contacts", r);
          count++;
        } catch (err) {
          // Don't let one bad row abort the whole import — collect and report.
          failures.push(`${r.email || r.first_name}: ${String((err as Error)?.message || err).slice(0, 80)}`);
        }
      }
      setDrawer(null);
      setImportText("");
      setImportFileRows(null);
      setImportFileName("");
      await load();
      alert(
        failures.length
          ? `Imported ${count} of ${rows.length} contacts.\n\n${failures.length} didn't import:\n${failures.slice(0, 5).join("\n")}`
          : `Imported ${count} contact${count === 1 ? "" : "s"}`,
      );
    } catch (err) { setError(err); }
    finally { setSaving(false); }
  }

  function handleExport() {
    // The list on screen, exported as it reads: a company row is a company row.
    const csv = ["kind,name,email,phone,domain,people,locations,tier,score"]
      .concat(filtered.map(c => [
        c.customer_kind, c.name, c.email || "", c.phone || "", c.domain || "",
        c.customer_kind === "company" ? c.contact_count : "",
        c.location_count,
        c.contact_intelligence_tier || "", c.contact_intelligence_score ?? "",
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  // ─ Column defs ──────────────────────────────────────────────────────────
  //
  // ONE column set for both kinds of row. A company row differs by what each
  // cell renders — no checkbox, a building mark, its people and location
  // counts — not by being a different table, because the divider between the
  // two groups is the only boundary the user should see.
  const columns: SparkTableColumn<MixedCustomerRow>[] = [
    {
      key: "select", header: "", width: "narrow",
      cell: c => c.customer_kind === "company" ? null : (
        <input
          type="checkbox"
          aria-label={`Select ${c.name}`}
          checked={selected.has(Number(c.customer_id))}
          onChange={() => toggleSelected(Number(c.customer_id))}
          onClick={e => e.stopPropagation()}
          className="cursor-pointer"
        />
      ),
    },
    {
      key: "name", header: <SortHeader label="Name" col="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />,
      cell: c => (
        <div className="flex items-center gap-2 min-w-0">
          {c.customer_kind === "company" ? (
            <div className="h-7 w-7 rounded-md bg-[#E8F4FB] flex items-center justify-center flex-shrink-0">
              <Building2 className="h-3.5 w-3.5 text-[#0C4A60]" />
            </div>
          ) : (
            <div className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
              <span className="text-[11px] font-semibold text-slate-700">{rowInitials(c)}</span>
            </div>
          )}
          <div className="min-w-0">
            <div className="font-medium truncate text-slate-900 flex items-center gap-1.5">
              <span className="truncate">{c.name || "—"}</span>
              <SubscriptionPill status={c.subscription_status} />
            </div>
            {c.email_unsubscribed && <div className="text-[10px] text-rose-600">Unsubscribed</div>}
            {/* Amber, deliberately not rose: rose means unsubscribed — a choice
                to respect — while amber means the address is broken and wants
                a better one. "Bounced" says what happened; "Invalid email"
                read like a validation complaint about something you typed. */}
            {c.email_invalid && (
              <div className="text-[10px] font-medium text-amber-600" title="Mail to this address hard-bounced. Get a current address for this contact.">
                Bounced — needs a new address
              </div>
            )}
          </div>
        </div>
      ),
      width: "wide",
    },
    {
      key: "email", header: <SortHeader label="Email / domain" col="email" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />,
      cell: c => c.customer_kind === "company"
        ? (c.domain ? <span className="font-mono text-xs text-slate-600">{c.domain}</span> : <span className="text-xs text-slate-400">—</span>)
        : (c.email ? <span className="text-sm text-slate-700">{c.email}</span> : <span className="text-xs text-slate-400">—</span>),
      hideOnMobile: true,
    },
    {
      key: "company", header: <SortHeader label="People · locations" col="company" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />,
      cell: c => c.customer_kind === "company"
        ? (
          <span className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
            {c.contact_count > 0
              ? <span className="rounded-full border border-slate-200 px-2 py-px">{c.contact_count === 1 ? "1 person" : `${c.contact_count} people`}</span>
              : <span className="text-slate-400">no people yet</span>}
            {c.location_count > 0
              ? <span className="rounded-full border border-slate-200 px-2 py-px">{c.location_count === 1 ? "1 location" : `${c.location_count} locations`}</span>
              : <span className="text-slate-400">no locations yet</span>}
          </span>
        )
        : c.location_count > 0
          ? <span className="rounded-full border border-slate-200 px-2 py-px text-xs text-slate-600">{c.location_count === 1 ? "1 location" : `${c.location_count} locations`}</span>
          : <span className="text-xs text-slate-400">—</span>,
      hideOnMobile: true,
    },
    {
      key: "score", header: <SortHeader label="Score" col="score" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />,
      width: "compact",
      cell: c => c.customer_kind === "company"
        ? <span className="text-xs text-slate-400">—</span>
        : <ScoreBadge tier={c.contact_intelligence_tier} score={c.contact_intelligence_score} />,
    },
    {
      key: "source", header: "Source", width: "compact",
      cell: c => c.source ? <span className="text-xs text-slate-500 capitalize">{c.source.replace(/_/g, " ")}</span> : <span className="text-xs text-slate-400">—</span>,
      hideOnMobile: true,
    },
  ];

  // ─ Render ───────────────────────────────────────────────────────────────
  return (
    <SparkPageShell
      title="Contacts"
      subtitle={peopleOnlyView
        ? "Everyone in your CRM — people only, ready for bulk actions"
        : "Everyone in your CRM — companies first, then people who are not at a company"}
      help={
        <>
          <strong className="block mb-1">What you can do here:</strong>
          Manage every person in your CRM. Import from a CSV, add manually, or let SPARK forms capture them automatically.
          <br /><br />
          <strong>Tier X / Y / Z:</strong> Contact Intelligence auto-scores each person based on engagement, behavior, and (when OLIVER is connected) job history. <strong>X</strong> = highest value, most engaged. <strong>Y</strong> = warm but not your best. <strong>Z</strong> = stale or cold.
          <br /><br />
          Companies auto-link via email domain. Bulk-select rows to tag, add to a list, or send a campaign.
        </>
      }
      actions={
        <>
          {/* F5 — view toggle [List | Kanban] (Brandon LOCK 2026-06-25). */}
          <div className="inline-flex rounded-md ring-1 ring-slate-200 bg-white p-0.5" role="group" aria-label="View toggle">
            <button
              type="button"
              onClick={() => setView("list")}
              className={`px-2 py-1 text-xs flex items-center gap-1 rounded ${
                view === "list" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
              title="List view"
            >
              <LayoutList className="h-3.5 w-3.5" /> List
            </button>
            <button
              type="button"
              onClick={() => setView("kanban")}
              className={`px-2 py-1 text-xs flex items-center gap-1 rounded ${
                view === "kanban" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
              title="Lifecycle kanban — drag cards between stages"
            >
              <Columns3 className="h-3.5 w-3.5" /> Kanban
            </button>
            {/* D-128 (2026-09-15): Companies is its OWN page again, not a view
                rendered inside this one. It grew a billing card, roles,
                locations, notes and activity — a destination, with its own
                back button — and nesting that inside Contacts is what left
                Brandon "stuck on the Midwest Ag page". The button stays where
                it is, because this is where people look for it; it navigates. */}
            <button
              type="button"
              data-tour="contacts-companies-tab"
              onClick={() => navigate("/app/services/spark_accounts")}
              className="px-2 py-1 text-xs flex items-center gap-1 rounded text-slate-600 hover:bg-slate-100"
              title="Companies — the businesses your contacts belong to"
            >
              <Building2 className="h-3.5 w-3.5" /> Companies
            </button>
          </div>
          <button onClick={handleExport} className="spark-btn spark-btn-secondary" disabled={!rows.length}>
            <Download className="h-3.5 w-3.5" /> Export
          </button>
          <button data-tour="contact-import" onClick={() => setDrawer("import")} className="spark-btn spark-btn-secondary">
            <Upload className="h-3.5 w-3.5" /> Import
          </button>
          <button onClick={() => setTagsOpen(true)} className="spark-btn spark-btn-secondary">
            <TagIcon className="h-3.5 w-3.5" /> Tags
          </button>
          <button onClick={() => setQuickAdd(true)} className="spark-btn spark-btn-secondary">
            <Rows3 className="h-3.5 w-3.5" /> Bulk add
          </button>
          <button data-tour="new-contact" onClick={() => setDrawer("add")} className="spark-btn spark-btn-accent">
            <Plus className="h-3.5 w-3.5" /> New contact
          </button>
        </>
      }
      stats={
        <SparkStatStrip stats={[
          { label: "Companies", value: stats.companies, icon: Building2 },
          { label: "Not at a company", value: stats.notAtACompany, icon: Users },
          { label: "Tier X (top)", value: stats.tierX, accent: "emerald", icon: Sparkles },
          { label: "Bounced", value: stats.invalid, accent: stats.invalid > 0 ? "amber" : "default", icon: AlertTriangle },
        ]} />
      }
      filters={
        <SparkFilterPills
          active={filter}
          onChange={f => { setFilter(f); setPage(1); clearSelection(); }}
          pills={[
            { key: "all", label: "All", count: total },
            // The flatten (spec section 7 point 1). Its own pill, carrying no
            // other predicate: folding it into "Active" would have made "show
            // me the people" quietly also mean "and hide the unsubscribed
            // ones", which is a different list from the one the chip promises.
            { key: "people", label: "People only", count: stats.notAtACompany },
            { key: "subscribed", label: "Active" },
            { key: "tier_x", label: "Tier X", count: stats.tierX },
            { key: "tier_y", label: "Tier Y" },
            { key: "tier_z", label: "Tier Z" },
            { key: "unscored", label: "Unscored" },
            { key: "unsubscribed", label: "Unsubscribed", count: stats.unsubscribed },
            { key: "bounced", label: "Bounced", count: stats.invalid },
            { key: "no_email", label: "No email" },
          ]}
          right={
            <SparkSearchBox
              value={search}
              onChange={v => { setSearch(v); setPage(1); }}
              placeholder="Search name, email, phone, company, location…"
              width="wide"
            />
          }
        />
      }
      loading={loading}
      error={error}
    >
      <SparkUsageCapacityBanner metric="contacts" className="mb-3" />
      <ReportBar product="spark" detail={insightsPayload?.detail} reports={[
        { id: 'spark_list_health', label: 'List health' },
        { id: 'spark_contact_sources', label: 'By source' },
        { id: 'spark_lifecycle_stages', label: 'By lifecycle stage' },
        { id: 'spark_segments', label: 'Segments' },
        { id: 'spark_tag_usage', label: 'Tag usage' },
        { id: 'spark_contact_scoring', label: 'Engagement scores' },
      ]} />
      {/* Bulk action toolbar */}
      {selected.size > 0 && (
        <div className="mb-3 flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-slate-900 text-white text-sm">
          <div className="flex items-center gap-3">
            <span><strong>{selected.size}</strong> selected</span>
            <button onClick={clearSelection} className="text-xs text-slate-400 hover:text-white underline">Clear</button>
          </div>
          <div className="flex items-center gap-1 relative">
            {/* Tag dropdown — applies existing or new tag to selection */}
            <button
              onClick={() => { setTagMenuOpen((v) => !v); if (!availableTags.length) loadTags(); }}
              disabled={bulkBusy !== null}
              className="px-2 py-1 rounded hover:bg-white/10 text-xs flex items-center gap-1 disabled:opacity-40"
              title="Apply a tag to all selected contacts"
            >
              <TagIcon className="h-3 w-3" /> Tag
            </button>
            {tagMenuOpen && (
              <div className="absolute right-32 top-full mt-1 z-50 w-64 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white text-slate-800 shadow-lg p-2">
                <div className="text-[10px] uppercase font-bold text-slate-500 px-2 pb-1">Apply tag</div>
                {availableTags.length === 0 && <div className="text-xs text-slate-400 px-2 py-1">No tags yet. Create one below.</div>}
                {availableTags.map((t) => (
                  <button key={t.id} type="button"
                    onClick={() => { setTagMenuOpen(false); applyBulkTag(t.id, t.name); }}
                    className="w-full text-left px-2 py-1 rounded hover:bg-orange-50 text-xs">
                    {t.name}
                  </button>
                ))}
                <div className="border-t border-slate-100 mt-1 pt-1.5 px-2">
                  <div className="text-[10px] uppercase font-semibold text-slate-500 mb-1">Create new tag</div>
                  <div className="flex gap-1">
                    <input
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      placeholder="Tag name"
                      className="flex-1 rounded border border-slate-300 px-1.5 py-0.5 text-xs text-slate-800"
                    />
                    <button type="button"
                      onClick={createAndApplyTag}
                      disabled={!newTagName.trim()}
                      className="px-2 py-0.5 rounded text-[10px] font-semibold bg-orange-500 text-white disabled:opacity-40">
                      Create
                    </button>
                  </div>
                  {/* Renaming/removing tags is rare enough to live one click
                      away rather than in the nav — but it has to be reachable
                      from here, or hiding the Tags page would strand the
                      taxonomy. */}
                  <button
                    type="button"
                    data-tour="manage-tags"
                    onClick={() => { setTagMenuOpen(false); setTagsOpen(true); }}
                    className="mt-2 w-full rounded px-2 py-1 text-left text-[11px] text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                  >
                    Manage all tags →
                  </button>
                </div>
              </div>
            )}
            <button onClick={markInactive} disabled={bulkBusy !== null}
              className="px-2 py-1 rounded hover:bg-white/10 text-xs flex items-center gap-1 disabled:opacity-40"
              title="Apply the 'inactive' tag to all selected contacts">
              <Activity className="h-3 w-3" /> Mark inactive
            </button>
            <button onClick={() => navigate("/app/services/spark_campaigns")} className="px-2 py-1 rounded hover:bg-white/10 text-xs flex items-center gap-1">
              <Send className="h-3 w-3" /> Send campaign
            </button>
            <button onClick={confirmAndBulkDelete} disabled={bulkBusy !== null}
              className="px-2 py-1 rounded text-xs flex items-center gap-1 text-rose-300 hover:bg-rose-500/20 disabled:opacity-40"
              title="Soft-delete all selected contacts">
              <Trash2 className="h-3 w-3" /> Delete
            </button>
          </div>
        </div>
      )}

      {/* F5 — Kanban view (Brandon LOCK 2026-06-25). The kanban surface
          ignores the list filter pills + search box (its own preset-driven
          server query handles grouping) and clicking a card opens the same
          SparkContactModal the list view uses. */}
      {view === "kanban" ? (
        <SparkLifecycleKanban
          onOpenContact={(id) => { setDetailId(id); setDrawer("detail"); }}
        />
      ) : rows.length === 0 && !loading && !search ? (
        <EmptyContactsState onAdd={() => setDrawer("add")} onImport={() => setDrawer("import")} />
      ) : (
        <SparkTable<MixedCustomerRow>
          rows={filtered}
          getRowKey={c => customerKey(c)}
          onRowClick={c => openRow(c)}
          columns={columns}
          totalCount={filtered.length}
          /* The one boundary in the list, said out loud. Drawn before the
             first person row, and only when the list is actually mixed — the
             "People only" chip has no companies above it to separate from. */
          groupHeader={(row) => (!peopleOnlyView && customerKey(row) === firstPersonKey) ? (
            <>
              People not at a company
              <span className="spark-table-group-note">
                — form intakes, bookings, personal addresses. Set a company from their record when you know it.
              </span>
            </>
          ) : null}
          rowActions={c => c.customer_kind === "company" ? (
            <button
              onClick={() => openRow(c)}
              className="spark-btn-icon"
              title="Open this company"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex items-center gap-1">
              {/* The hook goes ONLY on the contact created in this session, so the
                  walkthrough opens the record it just made — never "whatever is in
                  the first row", which would walk the user into deleting a real
                  customer if the create had failed. */}
              <button data-tour={Number(c.customer_id) === justCreatedId ? "contact-open" : undefined} onClick={() => openRow(c)} className="spark-btn-icon" title="View details">
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {/* Contact 360 deep link (SPARK pack 1, 2026-09-08). The 360 page's
                  only way in used to be typing a database id into a box; this row
                  already knows the id. `stopPropagation` because the row itself
                  opens the drawer. */}
              <Link
                to={`/app/services/spark_contact_360?id=${c.customer_id}`}
                onClick={(e) => e.stopPropagation()}
                className="spark-btn-icon"
                title="See everything about this person"
              >
                <UserSearch className="h-4 w-4" />
              </Link>
            </div>
          )}
          emptyState={search ? <span>No customers match "{search}".</span> : "Nothing in this filter."}
        />
      )}

      {/* Add contact drawer */}
      <SparkDrawer
        open={drawer === "add"}
        onClose={() => setDrawer(null)}
        title="New contact"
        subtitle="A person. Pick their company below, or add a new one."
        footer={
          <>
            <button onClick={() => setDrawer(null)} className="spark-btn spark-btn-secondary">Cancel</button>
            <button data-tour="save-contact" onClick={handleAdd} disabled={saving || (!form.first_name && !form.email)} className="spark-btn spark-btn-primary">
              {saving ? "Saving…" : "Save contact"}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="spark-field">
            <label className="spark-field-label">First name</label>
            <input data-tour="contact-first-name" name="first_name" className="spark-field-input" value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} autoFocus />
          </div>
          <div className="spark-field">
            <label className="spark-field-label">Last name</label>
            <input data-tour="contact-last-name" name="last_name" className="spark-field-input" value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} />
          </div>
        </div>
        <div className="spark-field">
          <label className="spark-field-label">Email</label>
          <input data-tour="contact-email" name="email" type="email" className="spark-field-input" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="name@company.com" />
        </div>
        <div className="spark-field">
          <label className="spark-field-label">Phone</label>
          {/* 2026-06-28 (#245) drop bare input for shared PhoneInput so
              "6414304320" formats to "(641) 430-4320" as the user types. */}
          <PhoneInput className="spark-field-input" value={form.phone}
            onChange={v => setForm({ ...form, phone: v })} />
        </div>
        <CompanyTypeahead value={company} onChange={setCompany} inputTestId="contact-company" />
        <div className="grid grid-cols-2 gap-3">
          <div className="spark-field">
            <label className="spark-field-label">Role at this company</label>
            <select
              className="spark-field-input"
              value={role}
              disabled={!company.name.trim()}
              onChange={e => setRole(e.target.value as CustomerRole | "")}
            >
              <option value="">No role yet</option>
              <option value="primary">{ROLE_LABEL.primary} contact</option>
              <option value="working">{ROLE_LABEL.working} contact</option>
              <option value="billing">{ROLE_LABEL.billing} contact</option>
              <option value="site">{ROLE_LABEL.site} contact</option>
            </select>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {role ? ROLE_HELP[role] : "Roles decide who gets job updates and who gets invoices. You can set one later."}
            </p>
          </div>
          <div className="spark-field">
            <label className="spark-field-label">Title</label>
            <input className="spark-field-input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Facilities Manager" />
          </div>
        </div>
      </SparkDrawer>

      {/* Import drawer — replaces the standalone Import (CSV) nav page.
          Brandon 2026-07-27: "no longer needed this is a feature already
          available in the contacts section. Also, need to expand to xlsx
          file format in the contacts button." The old page's one advantage
          was a file picker; that's here now, plus xlsx. */}
      <SparkDrawer
        open={drawer === "import"}
        onClose={() => setDrawer(null)}
        title="Import contacts"
        subtitle="Upload a spreadsheet, or paste your rows"
        width="wide"
        footer={
          <>
            <button onClick={() => setDrawer(null)} className="spark-btn spark-btn-secondary">Cancel</button>
            <button
              onClick={handleImport}
              disabled={saving || (!importText.trim() && !importFileRows)}
              className="spark-btn spark-btn-primary"
            >
              {saving ? "Importing…" : importFileRows ? `Import ${importFileRows.length}` : "Import"}
            </button>
          </>
        }
      >
        {/* File upload — the primary path. Most people have a file, not text. */}
        <div className="spark-field">
          <label className="spark-field-label">Upload a file</label>
          <p className="text-[11px] text-slate-500 mb-2">
            Excel (<code className="bg-slate-100 px-1 rounded text-[10px]">.xlsx</code>) or
            <code className="bg-slate-100 px-1 rounded text-[10px] ml-1">.csv</code>. We read the first
            sheet and match your column names automatically — "First Name", "E-mail" and
            "Given Name" all work.
          </p>
          <input
            data-tour="contact-import-file"
            type="file"
            accept=".csv,.tsv,.xlsx,text/csv"
            onChange={handleImportFile}
            className="block w-full text-xs text-slate-600 file:mr-3 file:rounded file:border-0 file:bg-[#EF6C33] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-[#d95f2b]"
          />
          {importFileError && (
            <p className="mt-2 rounded border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-700">
              {importFileError}
            </p>
          )}
          {importFileRows && (
            <div className="mt-2 rounded border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-[11px] text-emerald-800">
              <strong>{importFileRows.length}</strong> contact{importFileRows.length === 1 ? "" : "s"} ready
              from <strong>{importFileName}</strong>
              {importFileRows[0] && (
                <span className="block mt-0.5 text-emerald-700">
                  First row: {importFileRows[0].first_name || "—"} {importFileRows[0].last_name || ""} · {importFileRows[0].email || "no email"}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="my-4 flex items-center gap-3 text-[10px] uppercase tracking-wide text-slate-400">
          <span className="h-px flex-1 bg-slate-200" /> or paste <span className="h-px flex-1 bg-slate-200" />
        </div>

        <div className="spark-field">
          <label className="spark-field-label">CSV data</label>
          <p className="text-[11px] text-slate-500 mb-2">
            First row must be headers. Supported columns: <code className="bg-slate-100 px-1 rounded text-[10px]">first_name, last_name, email, phone, company, title</code>
          </p>
          <textarea
            value={importText}
            onChange={e => setImportText(e.target.value)}
            className="spark-field-textarea font-mono text-xs"
            rows={12}
            placeholder={`first_name,last_name,email,phone,company,title\nJane,Smith,jane@acme.com,555-1234,Acme Inc.,VP Marketing\nJohn,Doe,john@acme.com,,Acme Inc.,Engineer`}
          />
        </div>
        <button
          onClick={() => setImportText("first_name,last_name,email,phone,company,title\n")}
          className="spark-btn spark-btn-secondary spark-btn-sm"
        >
          <Download className="h-3 w-3" /> Insert template headers
        </button>
        <div className="mt-4 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-md p-3">
          <strong>Tip:</strong> Duplicate emails will <em>merge</em> with existing contacts rather than create duplicates.
          The contact's company will auto-link if the email domain matches an existing Company.
        </div>
      </SparkDrawer>

      {/* F-88 — Contact detail is now a unified modal (centered, tabbed)
          instead of a side-panel drawer. Mirrors OLIVER's CustomerModal
          pattern: one place to view + edit + see activity + take action,
          so users don't have to bounce between pages to do common work. */}
      {/* #255 (2026-06-21) — the modal's save() and softDelete() already
          fire `onChanged` so the list reloads on success. We also re-fire
          load() on modal close as belt-and-suspenders: in practice users
          edit+close in one motion and a stale React closure on `onChanged`
          (when load was rebuilt between the modal mount and the save) could
          otherwise leave the row showing pre-edit values. Re-fetching on
          close is cheap and guarantees the list reflects the latest state. */}
      <SparkTagsModal
        open={tagsOpen}
        onClose={() => setTagsOpen(false)}
        get={get}
        post={post}
        put={put}
        del={del}
        ready={ready}
        onChanged={() => { loadTags(); load(); }}
      />

      <SparkQuickAddGrid
        open={quickAdd}
        onClose={() => { setQuickAdd(false); load(); }}
        onSaved={() => { load(); }}
      />

      <SparkContactModal
        contactId={drawer === "detail" ? detailId : null}
        open={drawer === "detail" && detailId !== null}
        onClose={() => { setDrawer(null); setDetailId(null); load(); }}
        onChanged={() => { load(); }}
      />

      {/* #355 — Bulk cascade delete confirm modal. Same UX pattern as the
           single-contact confirm in SparkContactModal, but aggregates counts
           across all selected ids. If nothing links back to OLIVER (empty
           totals), we show plain-copy confirmation. */}
      {bulkCascadeOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl ring-1 ring-slate-200">
            <div className="border-b border-slate-200 px-4 py-3">
              <div className="flex items-center gap-2 text-rose-700">
                <AlertTriangle className="h-4 w-4" />
                <h3 className="text-sm font-semibold">
                  Delete {selected.size} contact{selected.size === 1 ? "" : "s"}?
                </h3>
              </div>
            </div>
            <div className="px-4 py-4 text-sm text-slate-700">
              {bulkCascadeLoading || !bulkCascadeTotals ? (
                <div className="text-slate-500">Checking linked records…</div>
              ) : (bulkCascadeTotals.invoices || bulkCascadeTotals.subs || bulkCascadeTotals.proposals || bulkCascadeTotals.docs) ? (
                <div className="space-y-2">
                  <p>This will archive:</p>
                  <ul className="ml-4 list-disc space-y-0.5 text-slate-700">
                    {!!bulkCascadeTotals.invoices && <li>{bulkCascadeTotals.invoices} invoice{bulkCascadeTotals.invoices === 1 ? "" : "s"}</li>}
                    {!!bulkCascadeTotals.subs && (
                      <li>
                        {bulkCascadeTotals.subs} subscription{bulkCascadeTotals.subs === 1 ? "" : "s"}
                        {!!bulkCascadeTotals.stripe_subs_to_cancel && (
                          <> ({bulkCascadeTotals.stripe_subs_to_cancel} Stripe sub{bulkCascadeTotals.stripe_subs_to_cancel === 1 ? "" : "s"} will be cancelled at period end)</>
                        )}
                      </li>
                    )}
                    {!!bulkCascadeTotals.proposals && <li>{bulkCascadeTotals.proposals} proposal{bulkCascadeTotals.proposals === 1 ? "" : "s"}</li>}
                    {!!bulkCascadeTotals.docs && <li>{bulkCascadeTotals.docs} consulting doc{bulkCascadeTotals.docs === 1 ? "" : "s"}</li>}
                  </ul>
                  <p className="text-xs text-slate-500">Reversible from trash for 30 days.</p>
                </div>
              ) : (
                <p>Soft-delete {selected.size} contact{selected.size === 1 ? "" : "s"}? Reversible from trash for 30 days.</p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
              <button
                onClick={() => setBulkCascadeOpen(false)}
                disabled={bulkBusy === "delete"}
                className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={performBulkDelete}
                disabled={bulkBusy === "delete" || bulkCascadeLoading}
                className="inline-flex items-center gap-1 rounded bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {bulkBusy === "delete" ? "Deleting…" : "Confirm delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </SparkPageShell>
  );
}

// ─ Helpers ──────────────────────────────────────────────────────────────────

function SortHeader({ label, col, sortKey, sortDir, onSort }: {
  label: string; col: SortKey; sortKey: SortKey; sortDir: SortDir; onSort: (c: SortKey) => void;
}) {
  const active = sortKey === col;
  return (
    <button onClick={() => onSort(col)} className="flex items-center gap-1 hover:text-slate-900 transition">
      <span>{label}</span>
      {active ? (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
    </button>
  );
}

// #255 (2026-06-21) — inline subscription status pill on the contact row.
// Renders nothing when null/undefined (no Stripe sub on file). Cancelled is
// the headline case (Brandon's report: "no cancelled-sub status pill"),
// past_due/unpaid get amber, trialing/incomplete get slate. Active is
// rendered as a tiny dot rather than a pill so it doesn't dominate the row.
function SubscriptionPill({ status }: { status?: MixedCustomerRow["subscription_status"] }) {
  if (!status) return null;
  if (status === "active") {
    return (
      <span title="Subscription active" aria-label="Subscription active"
        className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
    );
  }
  const styles: Record<string, { label: string; cls: string }> = {
    cancelled:  { label: "Cancelled",  cls: "bg-rose-50 text-rose-700 ring-rose-200" },
    past_due:   { label: "Past due",   cls: "bg-amber-50 text-amber-700 ring-amber-200" },
    unpaid:     { label: "Unpaid",     cls: "bg-amber-50 text-amber-700 ring-amber-200" },
    trialing:   { label: "Trialing",   cls: "bg-blue-50 text-blue-700 ring-blue-200" },
    incomplete: { label: "Incomplete", cls: "bg-slate-100 text-slate-600 ring-slate-200" },
  };
  const s = styles[status];
  if (!s) return null;
  return (
    <span className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-px rounded ring-1 ${s.cls} flex-shrink-0`}>
      {s.label}
    </span>
  );
}

function ScoreBadge({ tier, score }: { tier: string | null; score: number | null }) {
  if (!tier) return <span className="text-xs text-slate-400">Unscored</span>;
  const colors: Record<string, string> = {
    X: "bg-emerald-100 text-emerald-700 ring-emerald-300",
    Y: "bg-blue-100 text-blue-700 ring-blue-300",
    Z: "bg-slate-100 text-slate-600 ring-slate-300",
  };
  return (
    <div className="inline-flex items-center gap-1">
      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold ring-1 ${colors[tier] || colors.Z}`}>
        {tier}
      </span>
      {score != null && <span className="text-[11px] text-slate-500 font-mono">{score}</span>}
    </div>
  );
}

function EmptyContactsState({ onAdd, onImport }: { onAdd: () => void; onImport: () => void }) {
  return (
    <div className="spark-mini-card py-12 text-center">
      <div className="mx-auto w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-3">
        <Users className="h-7 w-7 text-slate-400" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900">No contacts yet</h3>
      <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
        Add your first contact manually, import a CSV, or connect a form on your website to capture leads automatically.
      </p>
      <div className="mt-5 flex items-center justify-center gap-2">
        <button onClick={onAdd} className="spark-btn spark-btn-primary">
          <Plus className="h-3.5 w-3.5" /> Add contact
        </button>
        <button onClick={onImport} className="spark-btn spark-btn-secondary">
          <Upload className="h-3.5 w-3.5" /> Import CSV
        </button>
      </div>
      <div className="mt-6 pt-6 border-t border-slate-100 text-xs text-slate-500">
        <strong>Tip:</strong> Use ARION forms or SPARK forms to capture contacts automatically.
        Email-based dedup means re-importing won't create duplicates.
      </div>
    </div>
  );
}

// F-88 — ContactDetail + DetailRow side-panel helpers removed; replaced
// by the centered SparkContactModal (full tabbed UI) imported above.

export default SparkContactsPage;
