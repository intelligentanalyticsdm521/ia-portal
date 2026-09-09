import { useEffect, useState, useCallback, useMemo } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { SparkStatStrip } from "../../components/spark/SparkStatStrip";
import { SparkDrawer } from "../../components/spark/SparkDrawer";
import { SparkTable, type SparkTableColumn } from "../../components/spark/SparkTable";
import { SparkFilterPills } from "../../components/spark/SparkFilterPills";
import { SparkSearchBox } from "../../components/spark/SparkSearchBox";
import { Building2, Users, ExternalLink, Plus, ArrowLeft, Edit3, Save, Trash2, X } from "lucide-react";

import { ReportBar } from '../../components/insights/ReportBar';
import { useProductInsightsPayload } from '../../hooks/useProductInsightsPayload';
interface Account {
  id: number;
  name: string;
  industry: string | null;
  employee_count: string | null;
  annual_revenue: number | null;
  website: string | null;
  domain: string | null;
  health_score: number | null;
  health_band: string | null;
  last_engagement_at: string | null;
  contact_count: number;
  created_at: string;
}
interface AccountContact {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  title?: string | null;
}

const HEALTH_COLORS: Record<string, string> = {
  thriving: "bg-emerald-100 text-emerald-700",
  healthy: "bg-blue-100 text-blue-700",
  at_risk: "bg-amber-100 text-amber-700",
  churning: "bg-rose-100 text-rose-700",
};


/**
 * Page chrome that steps aside when embedded.
 *
 * Standalone this is a full SparkPageShell; inside Contacts the surrounding
 * page already supplies the title, search and stats, so a second shell would
 * nest two headers. Embedded keeps the parts that DO work (the New company
 * action, the stat strip) and drops the duplicated chrome.
 */
function Frame({
  embedded, title, subtitle, actions, stats, filters, error, loading, children,
}: {
  embedded: boolean; title: string; subtitle?: string;
  actions?: React.ReactNode; stats?: React.ReactNode; filters?: React.ReactNode;
  error?: unknown; loading?: boolean; children: React.ReactNode;
}) {
  if (!embedded) {
    return (
      <SparkPageShell title={title} subtitle={subtitle} actions={actions} stats={stats} filters={filters} error={error} loading={loading}>
        {children}
      </SparkPageShell>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">{subtitle}</p>
        {actions}
      </div>
      {stats}
      {filters}
      {children}
    </div>
  );
}

interface SparkAccountsPageProps {
  /**
   * Render WITHOUT its own page shell, for use inside another page.
   *
   * Companies moved from a top-level nav item to a view on Contacts (feature
   * map 2026-07-27: "Companies -> tab/filter under Contacts"). Rendering this
   * same component there — rather than copying its table — means one
   * implementation, so the two can never drift apart.
   */
  embedded?: boolean;
}

export function SparkAccountsPage({ embedded = false }: SparkAccountsPageProps = {}) {
  const insightsPayload = useProductInsightsPayload('spark').payload;
  const { get, post, put, del, ready } = useSparkApi();

  // List state
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState({ name: "", domain: "", industry: "", website: "" });
  const [saving, setSaving] = useState(false);

  // Detail state — when a row is clicked, drill into one account
  const [selected, setSelected] = useState<Account | null>(null);
  const [selectedContacts, setSelectedContacts] = useState<AccountContact[]>([]);
  const [selectedLoading, setSelectedLoading] = useState(false);

  // #255-A2 (2026-07-03) — edit + delete on the Companies detail view.
  // Previously the detail view was read-only with no way to fix a bad
  // name / delete a duplicate — the SPARK CRM edit/delete gap Brandon
  // reported.
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "", domain: "", industry: "", website: "",
    employee_count: "", annual_revenue: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [detailErr, setDetailErr] = useState<string | null>(null);

  // ─ Load list ─────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const r = await get<{ data: Account[] }>(`/api/v1/lumen-accounts${params.toString() ? "?" + params : ""}`);
      setAccounts(r.data || []);
    } catch (err) { setError(err); } finally { setLoading(false); }
  }, [get, ready, search]);
  useEffect(() => { load(); }, [load]);

  // ─ Load contacts when an account is selected ────────────────────────────
  useEffect(() => {
    if (!selected || !ready) return;
    setSelectedLoading(true);
    get<{ data: AccountContact[] }>(`/api/v1/lumen-accounts/${selected.id}/contacts`)
      .then(r => setSelectedContacts(r.data || []))
      .catch(() => setSelectedContacts([]))
      .finally(() => setSelectedLoading(false));
  }, [get, ready, selected]);

  // ─ Filters ───────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (filter === "all") return accounts;
    if (filter === "with_contacts") return accounts.filter(a => a.contact_count > 0);
    if (filter === "no_contacts") return accounts.filter(a => a.contact_count === 0);
    if (filter === "at_risk") return accounts.filter(a => a.health_band === "at_risk" || a.health_band === "churning");
    return accounts;
  }, [accounts, filter]);

  const stats = useMemo(() => {
    const totalContacts = accounts.reduce((s, a) => s + (a.contact_count || 0), 0);
    const atRisk = accounts.filter(a => a.health_band === "at_risk" || a.health_band === "churning").length;
    const totalRevenue = accounts.reduce((s, a) => s + Number(a.annual_revenue || 0), 0);
    return { total: accounts.length, totalContacts, atRisk, totalRevenue };
  }, [accounts]);

  // ─ Create ────────────────────────────────────────────────────────────────
  async function createAccount() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await post("/api/v1/lumen-accounts", form);
      setForm({ name: "", domain: "", industry: "", website: "" });
      setDrawerOpen(false);
      await load();
    } catch (err) { setError(err); } finally { setSaving(false); }
  }

  // ─ #255-A2 edit + delete helpers ─────────────────────────────────────────
  function startEdit() {
    if (!selected) return;
    setEditForm({
      name: selected.name || "",
      domain: selected.domain || "",
      industry: selected.industry || "",
      website: selected.website || "",
      employee_count: selected.employee_count || "",
      annual_revenue: selected.annual_revenue != null ? String(selected.annual_revenue) : "",
    });
    setDetailErr(null);
    setEditing(true);
  }
  async function saveEdit() {
    if (!selected) return;
    if (!editForm.name.trim()) { setDetailErr("Name is required."); return; }
    setSavingEdit(true);
    setDetailErr(null);
    try {
      const payload: Record<string, unknown> = {
        name: editForm.name.trim(),
        domain: editForm.domain.trim() || null,
        industry: editForm.industry.trim() || null,
        website: editForm.website.trim() || null,
        employee_count: editForm.employee_count.trim() || null,
      };
      if (editForm.annual_revenue.trim()) {
        const n = Number(editForm.annual_revenue.replace(/[,\s$]/g, ""));
        if (!Number.isFinite(n)) { setDetailErr("Annual revenue must be a number."); setSavingEdit(false); return; }
        payload.annual_revenue = n;
      } else {
        payload.annual_revenue = null;
      }
      const r = await put<{ data: Account }>(`/api/v1/lumen-accounts/${selected.id}`, payload);
      setSelected(r?.data || selected);
      setEditing(false);
      await load();
    } catch (err) {
      setDetailErr((err as Error).message || "Save failed");
    } finally {
      setSavingEdit(false);
    }
  }
  async function deleteAccount() {
    if (!selected) return;
    if (!confirm(`Delete "${selected.name}"? Contacts stay in your CRM — only the company grouping is removed.`)) return;
    setDetailErr(null);
    try {
      await del(`/api/v1/lumen-accounts/${selected.id}`);
      setSelected(null);
      setEditing(false);
      await load();
    } catch (err) {
      setDetailErr((err as Error).message || "Delete failed");
    }
  }

  // ─ Render: DETAIL view when an account is selected ──────────────────────
  if (selected) {
    return (
      <Frame embedded={embedded}
        title={selected.name}
        subtitle={selected.domain || selected.industry || "Company detail"}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => { setSelected(null); setEditing(false); }} className="spark-btn spark-btn-secondary">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to list
            </button>
            {!editing && (
              <>
                <button onClick={startEdit} className="spark-btn spark-btn-secondary">
                  <Edit3 className="h-3.5 w-3.5" /> Edit
                </button>
                <button
                  onClick={deleteAccount}
                  className="spark-btn spark-btn-secondary text-rose-600 hover:bg-rose-50 border-rose-200"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </>
            )}
          </div>
        }
        stats={
          <SparkStatStrip stats={[
            { label: "Contacts", value: selected.contact_count, icon: Users, accent: "blue" },
            { label: "Industry", value: selected.industry || "—" },
            { label: "Annual revenue", value: selected.annual_revenue ? `$${Number(selected.annual_revenue).toLocaleString()}` : "—" },
            { label: "Health", value: selected.health_band ? selected.health_band.replace("_", " ") : "—",
              accent: selected.health_band === "thriving" || selected.health_band === "healthy" ? "emerald" :
                      selected.health_band === "at_risk" ? "amber" : selected.health_band === "churning" ? "rose" : "default" },
          ]} />
        }
      >
        {detailErr && (
          <div className="mb-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
            {detailErr}
          </div>
        )}

        {editing && (
          <div className="spark-mini-card mb-3">
            <div className="spark-mini-card-header">
              <span className="spark-mini-card-title">Edit company</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setEditing(false); setDetailErr(null); }}
                  className="spark-btn spark-btn-secondary"
                  disabled={savingEdit}
                >
                  <X className="h-3.5 w-3.5" /> Cancel
                </button>
                <button onClick={saveEdit} className="spark-btn spark-btn-primary" disabled={savingEdit}>
                  <Save className="h-3.5 w-3.5" /> {savingEdit ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3">
              <div className="spark-field">
                <label className="spark-field-label">Name</label>
                <input
                  className="spark-field-input"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </div>
              <div className="spark-field">
                <label className="spark-field-label">Domain</label>
                <input
                  className="spark-field-input"
                  value={editForm.domain}
                  onChange={(e) => setEditForm({ ...editForm, domain: e.target.value })}
                  placeholder="acme.com"
                />
              </div>
              <div className="spark-field">
                <label className="spark-field-label">Industry</label>
                <input
                  className="spark-field-input"
                  value={editForm.industry}
                  onChange={(e) => setEditForm({ ...editForm, industry: e.target.value })}
                />
              </div>
              <div className="spark-field">
                <label className="spark-field-label">Website</label>
                <input
                  className="spark-field-input"
                  value={editForm.website}
                  onChange={(e) => setEditForm({ ...editForm, website: e.target.value })}
                  placeholder="https://acme.com"
                />
              </div>
              <div className="spark-field">
                <label className="spark-field-label">Employee count</label>
                <input
                  className="spark-field-input"
                  value={editForm.employee_count}
                  onChange={(e) => setEditForm({ ...editForm, employee_count: e.target.value })}
                  placeholder="1-10, 11-50, etc."
                />
              </div>
              <div className="spark-field">
                <label className="spark-field-label">Annual revenue (USD)</label>
                <input
                  className="spark-field-input"
                  value={editForm.annual_revenue}
                  onChange={(e) => setEditForm({ ...editForm, annual_revenue: e.target.value })}
                  placeholder="500000"
                />
              </div>
            </div>
          </div>
        )}

        <div className="spark-mini-card">
          <div className="spark-mini-card-header">
            <span className="spark-mini-card-title">Contacts at this company</span>
            {selectedContacts.length > 0 && <span className="text-xs text-slate-500">{selectedContacts.length} contacts</span>}
          </div>
          {selectedLoading ? (
            <div className="py-6 text-center text-sm text-slate-500">Loading…</div>
          ) : selectedContacts.length === 0 ? (
            <div className="py-6 text-center text-sm text-slate-500">No contacts associated with this company yet. New contacts created with this domain will auto-link.</div>
          ) : (
            <SparkTable<AccountContact>
              rows={selectedContacts}
              getRowKey={c => c.id}
              columns={[
                { key: "name", header: "Name", cell: c => <span className="font-medium">{c.first_name} {c.last_name}</span> },
                { key: "title", header: "Title", cell: c => c.title || "—" },
                { key: "email", header: "Email", cell: c => <span className="text-slate-600">{c.email || "—"}</span>, width: "wide" },
                { key: "phone", header: "Phone", cell: c => c.phone || "—", hideOnMobile: true },
              ]}
            />
          )}
        </div>
      </Frame>
    );
  }

  // ─ Render: LIST view ────────────────────────────────────────────────────
  const columns: SparkTableColumn<Account>[] = [
    {
      key: "name", header: "Name", cell: a => (
        <div className="flex items-center gap-2 min-w-0">
          <Building2 className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
          <span className="font-medium truncate">{a.name}</span>
          {a.website && (
            <a href={a.website} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-slate-400 hover:text-blue-600">
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      ), width: "wide",
    },
    { key: "domain", header: "Domain", cell: a => <span className="text-xs text-slate-500 font-mono">{a.domain || "—"}</span>, hideOnMobile: true },
    { key: "industry", header: "Industry", cell: a => a.industry || "—", hideOnMobile: true },
    {
      key: "contacts", header: "Contacts",
      cell: a => (
        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium">
          <Users className="h-3 w-3" /> {a.contact_count}
        </span>
      ), width: "narrow", align: "left",
    },
    {
      key: "health", header: "Health",
      cell: a => a.health_band
        ? <span className={`text-xs px-2 py-0.5 rounded capitalize ${HEALTH_COLORS[a.health_band] || "bg-slate-100 text-slate-600"}`}>{a.health_band.replace("_", " ")}</span>
        : <span className="text-xs text-slate-400">—</span>,
      width: "compact",
    },
    {
      key: "revenue", header: "Revenue",
      cell: a => a.annual_revenue ? `$${(Number(a.annual_revenue) / 1000).toFixed(0)}k` : "—",
      width: "compact", align: "right", hideOnMobile: true,
    },
  ];

  return (
    <Frame embedded={embedded}
      title="Companies"
      subtitle="Group contacts by company — auto-matched by email domain"
      actions={
        <button onClick={() => setDrawerOpen(true)} className="spark-btn spark-btn-accent">
          <Plus className="h-3.5 w-3.5" /> New company
        </button>
      }
      stats={
        <SparkStatStrip stats={[
          { label: "Total", value: stats.total.toLocaleString(), icon: Building2 },
          { label: "Contacts", value: stats.totalContacts.toLocaleString(), icon: Users, accent: "blue" },
          { label: "At-risk", value: stats.atRisk, accent: stats.atRisk > 0 ? "rose" : "default" },
          { label: "Tracked revenue", value: stats.totalRevenue ? `$${(stats.totalRevenue / 1000).toFixed(0)}k` : "—", accent: "emerald" },
        ]} />
      }
      filters={
        <SparkFilterPills
          active={filter}
          onChange={setFilter}
          pills={[
            { key: "all", label: "All", count: accounts.length },
            { key: "with_contacts", label: "With contacts", count: accounts.filter(a => a.contact_count > 0).length },
            { key: "no_contacts", label: "Empty", count: accounts.filter(a => a.contact_count === 0).length },
            { key: "at_risk", label: "At risk", count: stats.atRisk },
          ]}
          right={<SparkSearchBox value={search} onChange={setSearch} placeholder="Search companies…" />}
        />
      }
      loading={loading}
      error={error}
    >
      <ReportBar product="spark" detail={insightsPayload?.detail} reports={[
        { id: 'spark_accounts', label: 'Account health' },
      ]} />
      <SparkTable<Account>
        rows={filtered}
        getRowKey={a => a.id}
        columns={columns}
        onRowClick={setSelected}
        totalCount={filtered.length}
        emptyState={
          search ? (
            <span>No companies match "{search}".</span>
          ) : (
            <span>No companies yet. They auto-create when you add contacts with company email addresses.</span>
          )
        }
      />

      <SparkDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="New company"
        subtitle="Companies are auto-created from contact email domains. Create one manually if needed."
        footer={
          <>
            <button onClick={() => setDrawerOpen(false)} className="spark-btn spark-btn-secondary">Cancel</button>
            <button onClick={createAccount} disabled={saving || !form.name.trim()} className="spark-btn spark-btn-primary">
              {saving ? "Creating…" : "Create company"}
            </button>
          </>
        }
      >
        <div className="spark-field">
          <label className="spark-field-label">Name</label>
          <input className="spark-field-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Acme Inc." autoFocus />
        </div>
        <div className="spark-field">
          <label className="spark-field-label">Domain</label>
          <input className="spark-field-input" value={form.domain} onChange={e => setForm({ ...form, domain: e.target.value })} placeholder="acme.com" />
          <p className="text-[11px] text-slate-500 mt-0.5">Contacts with emails @this-domain auto-link to this company.</p>
        </div>
        <div className="spark-field">
          <label className="spark-field-label">Industry</label>
          <input className="spark-field-input" value={form.industry} onChange={e => setForm({ ...form, industry: e.target.value })} placeholder="SaaS, Plumbing, Real Estate…" />
        </div>
        <div className="spark-field">
          <label className="spark-field-label">Website</label>
          <input className="spark-field-input" value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} placeholder="https://acme.com" />
        </div>
      </SparkDrawer>
    </Frame>
  );
}

export default SparkAccountsPage;
