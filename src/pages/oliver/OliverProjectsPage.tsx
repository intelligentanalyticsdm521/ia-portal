import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader, DataTable, EmptyState, Button, FilterBar, type Column,
} from "../../components/oliver/ui";

interface Project {
  project_id: string;
  project_number: string;
  name: string;
  description: string | null;
  contact_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  status: "active" | "on_hold" | "completed" | "cancelled";
  start_date: string | null;
  target_end_date: string | null;
  actual_end_date: string | null;
  budget: number | null;
  job_count: number;
  jobs_completed: number;
  revenue: number;
  outstanding: number;
  next_scheduled: string | null;
}

interface Contact { contact_id: string; first_name?: string; last_name?: string; email?: string; company_name?: string; }

function fmtMoney(n?: number | null) {
  return `$${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_PILL: Record<string, { bg: string; color: string }> = {
  active:    { bg: "#DBEAFE", color: "#1E40AF" },
  on_hold:   { bg: "#FEF3C7", color: "#92400E" },
  completed: { bg: "#D1FAE5", color: "#047857" },
  cancelled: { bg: "#F1F5F9", color: "#5A7A8A" },
};

const FILTER_PILLS = [
  { key: "", label: "All" },
  { key: "active", label: "Active" },
  { key: "on_hold", label: "On hold" },
  { key: "completed", label: "Completed" },
];

export function OliverProjectsPage() {
  const { get, post, ready } = useOliverApi();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await get<Project[]>("/projects");
      setProjects(data || []);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  const filtered = useMemo(() => {
    let out = projects;
    if (filter) out = out.filter((p) => p.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter((p) =>
        (p.name || "").toLowerCase().includes(q) ||
        (p.project_number || "").toLowerCase().includes(q) ||
        (p.customer_name || "").toLowerCase().includes(q));
    }
    return out;
  }, [projects, filter, search]);

  // Summary KPIs
  const summary = useMemo(() => {
    const active = projects.filter((p) => p.status === "active");
    const totalRevenue = projects.reduce((s, p) => s + Number(p.revenue || 0), 0);
    const totalOutstanding = projects.reduce((s, p) => s + Number(p.outstanding || 0), 0);
    return {
      active_count: active.length,
      total_count: projects.length,
      total_revenue: totalRevenue,
      total_outstanding: totalOutstanding,
    };
  }, [projects]);

  const columns: Column<Project>[] = [
    {
      key: "project_number",
      header: "Project",
      sortable: true,
      sortAccessor: (p) => p.project_number,
      render: (p) => (
        <div>
          <div style={{ fontWeight: 600, color: "#1A3A4A" }}>{p.name}</div>
          <div style={{ fontSize: 11, color: "#5A7A8A", fontFamily: "monospace" }}>{p.project_number}</div>
        </div>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      render: (p) => p.customer_name ? (
        <div>
          <div style={{ fontSize: 12, color: "#0B1C24" }}>{p.customer_name}</div>
          {p.customer_email && <div style={{ fontSize: 10, color: "#5A7A8A" }}>{p.customer_email}</div>}
        </div>
      ) : <span style={{ color: "#94A3B8", fontSize: 11 }}>—</span>,
    },
    {
      key: "progress",
      header: "Jobs",
      render: (p) => (
        <div>
          <div style={{ color: "#0B1C24", fontSize: 12 }}>
            {p.jobs_completed} / {p.job_count} done
          </div>
          {p.next_scheduled && (
            <div style={{ fontSize: 10, color: "#5A7A8A", marginTop: 2 }}>
              Next: {fmtDate(p.next_scheduled)}
            </div>
          )}
          {p.job_count > 0 && (
            <div style={{ marginTop: 4, height: 4, background: "#F1F5F9", borderRadius: 99, width: 100 }}>
              <div style={{
                width: `${(p.jobs_completed / p.job_count) * 100}%`,
                height: "100%", borderRadius: 99,
                background: "linear-gradient(90deg, #1A7DB5 0%, #059669 100%)",
              }} />
            </div>
          )}
        </div>
      ),
    },
    {
      key: "revenue",
      header: "Revenue",
      align: "right",
      sortable: true,
      sortAccessor: (p) => Number(p.revenue),
      render: (p) => (
        <div>
          <div style={{ fontFamily: "monospace", fontWeight: 600, color: "#059669" }}>{fmtMoney(p.revenue)}</div>
          {Number(p.outstanding) > 0 && (
            <div style={{ fontSize: 10, color: "#B91C1C", fontFamily: "monospace", marginTop: 2 }}>
              {fmtMoney(p.outstanding)} due
            </div>
          )}
        </div>
      ),
    },
    {
      key: "dates",
      header: "Timeline",
      render: (p) => (
        <div style={{ fontSize: 11 }}>
          <div style={{ color: "#5A7A8A" }}>Start: {fmtDate(p.start_date)}</div>
          <div style={{ color: "#5A7A8A" }}>Target: {fmtDate(p.target_end_date)}</div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (p) => {
        const pill = STATUS_PILL[p.status] || STATUS_PILL.active;
        return (
          <span style={{
            display: "inline-block", padding: "3px 9px", borderRadius: 99,
            background: pill.bg, color: pill.color, fontSize: 11, fontWeight: 600,
          }}>
            {STATUS_LABEL[p.status]}
          </span>
        );
      },
    },
  ];

  return (
    <OliverPageWrapper title="Projects" subtitle="Multi-job customer engagements" error={error} loading={loading && !projects.length}>
      <PageHeader
        title="Projects"
        subtitle="Group multiple jobs under a single customer engagement (remodels, multi-day service, recurring work)."
        actions={<Button variant="primary" onClick={() => setShowCreate(true)}>+ New project</Button>}
      />

      {flash && (
        <div style={{ padding: 10, marginBottom: 12, fontSize: 12, background: "#F0FDF4", color: "#15803D", border: "1px solid #BBF7D0", borderRadius: 6 }}>
          {flash}
        </div>
      )}

      <div className="stat-row" style={{ marginBottom: 14 }}>
        <div className="stat-card">
          <div className="stat-lbl">Active projects</div>
          <div className="stat-val">{summary.active_count}</div>
          <div className="stat-delta neu">of {summary.total_count} total</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Total revenue</div>
          <div className="stat-val" style={{ color: "#059669" }}>{fmtMoney(summary.total_revenue)}</div>
          <div className="stat-delta neu">across all projects</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Total outstanding</div>
          <div className="stat-val" style={{ color: summary.total_outstanding > 0 ? "#B91C1C" : undefined }}>
            {fmtMoney(summary.total_outstanding)}
          </div>
          <div className="stat-delta neu">across project invoices</div>
        </div>
      </div>

      {!projects.length && !loading ? (
        <EmptyState
          title="No projects yet"
          description="Group multi-stage customer work into a single project. Useful for remodels, multi-day service, or any engagement that spans several jobs."
          action={<Button variant="primary" onClick={() => setShowCreate(true)}>+ Create your first project</Button>}
        />
      ) : (
        <>
          <FilterBar
            pills={FILTER_PILLS}
            activePill={filter}
            onPillChange={setFilter}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search projects, project number, or customer…"
          />
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(p) => p.project_id}
            initialSort={{ key: "project_number", direction: "desc" }}
            emptyMessage="No projects match these filters."
            onRowClick={(p) => window.location.href = `/app/services/oliver_job_board?project=${p.project_id}`}
          />
        </>
      )}

      {showCreate && (
        <CreateProjectDrawer
          onClose={() => setShowCreate(false)}
          onCreated={(msg) => {
            setShowCreate(false);
            reload();
            setFlash(msg);
            setTimeout(() => setFlash(null), 3000);
          }}
          api={{ get, post }}
        />
      )}
    </OliverPageWrapper>
  );
}

// ─── Create drawer ──────────────────────────────────────────────────────
function CreateProjectDrawer({
  onClose, onCreated, api,
}: {
  onClose: () => void;
  onCreated: (msg: string) => void;
  api: {
    get: <T>(p: string) => Promise<T>;
    post: <T>(p: string, body?: unknown) => Promise<T>;
  };
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactId, setContactId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [targetEnd, setTargetEnd] = useState("");
  const [budget, setBudget] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<{ data: Contact[]; meta: unknown } | Contact[]>("/contacts?per_page=100");
        const list = Array.isArray(data) ? data : (data as { data: Contact[] }).data;
        setContacts(list || []);
      } catch {
        setContacts([]);
      }
    })();
  }, [api]);

  async function submit() {
    if (!name.trim()) { setErr("Name is required"); return; }
    setErr(null);
    setSaving(true);
    try {
      const result = await api.post<{ project_number: string }>("/projects", {
        name: name.trim(),
        description: description.trim() || null,
        contact_id: contactId || null,
        start_date: startDate || null,
        target_end_date: targetEnd || null,
        budget: budget ? Number(budget) : null,
      });
      onCreated(`Created project ${result.project_number}.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(11,28,36,0.4)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}>
      <div style={{ width: 480, height: "100%", background: "#fff", overflowY: "auto", boxShadow: "-4px 0 24px rgba(0,0,0,0.1)" }}>
        <div style={{ padding: 20, borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1A3A4A" }}>New project</h2>
          <button onClick={onClose} style={{ background: "transparent", border: 0, fontSize: 22, color: "#5A7A8A", cursor: "pointer" }}>×</button>
        </div>

        <div style={{ padding: 20, display: "grid", gap: 14 }}>
          <label style={{ display: "block" }}>
            <span style={pLabel}>Project name</span>
            <input type="text" style={pInput} placeholder="Smith Kitchen Remodel"
              value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>

          <label style={{ display: "block" }}>
            <span style={pLabel}>Customer (optional)</span>
            <select style={pInput} value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">No customer linked</option>
              {contacts.map((c) => (
                <option key={c.contact_id} value={c.contact_id}>
                  {c.company_name || `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.email || "(no name)"}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "block" }}>
            <span style={pLabel}>Description (optional)</span>
            <textarea rows={3} style={{ ...pInput, resize: "vertical" }}
              placeholder="Scope, key milestones, special notes…"
              value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ display: "block" }}>
              <span style={pLabel}>Start date</span>
              <input type="date" style={pInput} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <label style={{ display: "block" }}>
              <span style={pLabel}>Target end date</span>
              <input type="date" style={pInput} value={targetEnd} onChange={(e) => setTargetEnd(e.target.value)} />
            </label>
          </div>

          <label style={{ display: "block" }}>
            <span style={pLabel}>Budget (optional)</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "#5A7A8A" }}>$</span>
              <input type="number" min="0" step="100" style={{ ...pInput, flex: 1 }}
                placeholder="0" value={budget} onChange={(e) => setBudget(e.target.value)} />
            </div>
            <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 4 }}>
              Internal target — not shown to the customer.
            </div>
          </label>

          {err && (
            <div style={{ padding: 10, fontSize: 12, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 6 }}>
              {err}
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={submit} disabled={saving || !name.trim()}>
              {saving ? "Creating…" : "Create project"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const pLabel: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 };
const pInput: React.CSSProperties = {
  width: "100%", padding: "7px 10px", fontSize: 12,
  border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6,
  background: "#fff", color: "#0B1C24",
};
