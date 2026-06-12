// @deprecated 2026-06-12 � orphan after refactor. Superseded by F-77 deprecated Workflow Templates feature; replaced by Automations + future Proposal Templates. Confirm with founder before deletion (task #174).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader, DataTable, EmptyState, Button, FilterBar, type Column,
} from "../../components/oliver/ui";
import { Edit3, Trash2, Zap, FileText } from "lucide-react";

interface WorkflowTemplate {
  template_id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  industry: string | null;
  job_type_default: string | null;
  default_duration_minutes: number | null;
  default_price: number | null;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
}

interface Contact {
  contact_id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  company_name?: string;
}

function fmtMoney(n?: number | null) {
  if (n == null) return "—";
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
function fmtDuration(min?: number | null) {
  if (!min) return "—";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function OliverWorkflowTemplatesPage() {
  const { get, post, patch, del, ready } = useOliverApi();
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editTemplate, setEditTemplate] = useState<WorkflowTemplate | null>(null);
  const [instantiateTpl, setInstantiateTpl] = useState<WorkflowTemplate | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await get<WorkflowTemplate[]>("/workflow-templates");
      setTemplates(data || []);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  const filtered = useMemo(() => {
    if (!search.trim()) return templates;
    const q = search.toLowerCase();
    return templates.filter((t) =>
      (t.name || "").toLowerCase().includes(q) ||
      (t.industry || "").toLowerCase().includes(q) ||
      (t.job_type_default || "").toLowerCase().includes(q));
  }, [templates, search]);

  async function handleDelete(t: WorkflowTemplate) {
    if (!confirm(`Delete template "${t.name}"?`)) return;
    try {
      await del(`/workflow-templates/${t.template_id}`);
      setFlash(`Deleted "${t.name}".`);
      setTimeout(() => setFlash(null), 3000);
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    }
  }

  const columns: Column<WorkflowTemplate>[] = [
    {
      key: "name", header: "Template", sortable: true,
      sortAccessor: (t) => t.name,
      render: (t) => (
        <div>
          <div style={{ fontWeight: 600, color: "#1A3A4A", display: "flex", alignItems: "center", gap: 6 }}>
            <FileText size={13} color="#5A7A8A" />
            {t.name}
          </div>
          {t.description && (
            <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 2 }}>{t.description}</div>
          )}
        </div>
      ),
    },
    {
      key: "industry", header: "Industry",
      render: (t) => t.industry ? (
        <span style={{ fontSize: 11, color: "#0B1C24", textTransform: "capitalize" }}>{t.industry}</span>
      ) : <span style={{ color: "#94A3B8", fontSize: 11 }}>—</span>,
    },
    {
      key: "job_type", header: "Job type",
      render: (t) => t.job_type_default ? (
        <span style={{ fontSize: 11, color: "#0B1C24" }}>{t.job_type_default}</span>
      ) : <span style={{ color: "#94A3B8", fontSize: 11 }}>—</span>,
    },
    {
      key: "duration", header: "Duration", align: "right",
      render: (t) => <span style={{ fontSize: 11, fontFamily: "monospace" }}>{fmtDuration(t.default_duration_minutes)}</span>,
    },
    {
      key: "price", header: "Price", align: "right",
      sortable: true, sortAccessor: (t) => Number(t.default_price || 0),
      render: (t) => <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#059669" }}>{fmtMoney(t.default_price)}</span>,
    },
    {
      key: "type", header: "Type",
      render: (t) => t.is_system ? (
        <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 99, background: "#EEF2FF", color: "#4338CA", fontSize: 11, fontWeight: 600 }}>System</span>
      ) : (
        <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 99, background: "#F0FDF4", color: "#15803D", fontSize: 11, fontWeight: 600 }}>Custom</span>
      ),
    },
    {
      key: "actions", header: "", align: "right",
      render: (t) => (
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
          <Button variant="secondary" size="sm" onClick={() => setInstantiateTpl(t)}>
            <Zap size={11} /> Instantiate
          </Button>
          {!t.is_system && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setEditTemplate(t)}><Edit3 size={11} /></Button>
              <Button variant="ghost" size="sm" onClick={() => handleDelete(t)}><Trash2 size={11} color="#dc2626" /></Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <OliverPageWrapper title="Workflow Templates" subtitle="Pre-built job templates with checklists and required proofs" error={error} loading={loading && !templates.length}>
      <PageHeader
        title="Workflow Templates"
        subtitle="Reusable job blueprints. Instantiate to create a fully configured job in one click."
        actions={<Button variant="primary" onClick={() => setShowCreate(true)}>+ New template</Button>}
      />

      {flash && (
        <div style={{ padding: 10, marginBottom: 12, fontSize: 12, background: "#F0FDF4", color: "#15803D", border: "1px solid #BBF7D0", borderRadius: 6 }}>{flash}</div>
      )}

      {!templates.length && !loading ? (
        <EmptyState
          title="No workflow templates yet"
          description="Templates let you standardize common service types — define the checklist, required proofs, default price and duration once, then spin up jobs in seconds."
          action={<Button variant="primary" onClick={() => setShowCreate(true)}>+ Create your first template</Button>}
        />
      ) : (
        <>
          <FilterBar search={search} onSearchChange={setSearch} searchPlaceholder="Search templates, industry, or job type…" />
          <DataTable rows={filtered} columns={columns} rowKey={(t) => t.template_id} initialSort={{ key: "name", direction: "asc" }} emptyMessage="No templates match your search." />
        </>
      )}

      {(showCreate || editTemplate) && (
        <TemplateDrawer
          template={editTemplate}
          onClose={() => { setShowCreate(false); setEditTemplate(null); }}
          onSaved={(msg) => { setShowCreate(false); setEditTemplate(null); reload(); setFlash(msg); setTimeout(() => setFlash(null), 3000); }}
          api={{ post, patch }}
        />
      )}

      {instantiateTpl && (
        <InstantiateModal
          template={instantiateTpl}
          onClose={() => setInstantiateTpl(null)}
          onCreated={(msg) => { setInstantiateTpl(null); setFlash(msg); setTimeout(() => setFlash(null), 3000); }}
          api={{ get, post }}
        />
      )}
    </OliverPageWrapper>
  );
}

function TemplateDrawer({ template, onClose, onSaved, api }: {
  template: WorkflowTemplate | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
  api: { post: <T>(p: string, b?: unknown) => Promise<T>; patch: <T>(p: string, b: unknown) => Promise<T> };
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [industry, setIndustry] = useState(template?.industry ?? "");
  const [jobType, setJobType] = useState(template?.job_type_default ?? "");
  const [duration, setDuration] = useState(template?.default_duration_minutes?.toString() ?? "");
  const [price, setPrice] = useState(template?.default_price?.toString() ?? "");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) { setErr("Name is required"); return; }
    setErr(null); setSaving(true);
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        industry: industry.trim() || null,
        job_type_default: jobType.trim() || null,
        default_duration_minutes: duration ? Number(duration) : null,
        default_price: price ? Number(price) : null,
        notes_template: notes.trim() || null,
      };
      if (template) {
        await api.patch(`/workflow-templates/${template.template_id}`, body);
        onSaved(`Updated template "${name}".`);
      } else {
        await api.post("/workflow-templates", body);
        onSaved(`Created template "${name}".`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally { setSaving(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(11,28,36,0.4)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}>
      <div style={{ width: 480, height: "100%", background: "#fff", overflowY: "auto", boxShadow: "-4px 0 24px rgba(0,0,0,0.1)" }}>
        <div style={{ padding: 20, borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1A3A4A" }}>{template ? "Edit template" : "New template"}</h2>
          <button onClick={onClose} style={{ background: "transparent", border: 0, fontSize: 22, color: "#5A7A8A", cursor: "pointer" }}>×</button>
        </div>
        <div style={{ padding: 20, display: "grid", gap: 14 }}>
          <label><span style={pLabel}>Name</span><input style={pInput} value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
          <label><span style={pLabel}>Description</span><textarea rows={2} style={{ ...pInput, resize: "vertical" }} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label><span style={pLabel}>Industry</span><input style={pInput} placeholder="e.g. hvac" value={industry} onChange={(e) => setIndustry(e.target.value)} /></label>
            <label><span style={pLabel}>Default job type</span><input style={pInput} placeholder="e.g. tune-up" value={jobType} onChange={(e) => setJobType(e.target.value)} /></label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label><span style={pLabel}>Duration (min)</span><input type="number" min="0" style={pInput} value={duration} onChange={(e) => setDuration(e.target.value)} /></label>
            <label><span style={pLabel}>Default price ($)</span><input type="number" min="0" step="0.01" style={pInput} value={price} onChange={(e) => setPrice(e.target.value)} /></label>
          </div>
          <label><span style={pLabel}>Notes template</span><textarea rows={3} style={{ ...pInput, resize: "vertical" }} placeholder="Default notes prepopulated on each instantiated job" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
          {err && <div style={errBox}>{err}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={submit} disabled={saving || !name.trim()}>{saving ? "Saving…" : (template ? "Save changes" : "Create template")}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InstantiateModal({ template, onClose, onCreated, api }: {
  template: WorkflowTemplate;
  onClose: () => void;
  onCreated: (msg: string) => void;
  api: { get: <T>(p: string) => Promise<T>; post: <T>(p: string, b?: unknown) => Promise<T> };
}) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactId, setContactId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<Contact[]>("/contacts?per_page=100");
        setContacts(data || []);
      } catch { setContacts([]); }
    })();
  }, [api]);

  async function submit() {
    if (!contactId) { setErr("Pick a contact"); return; }
    setErr(null); setSaving(true);
    try {
      const result = await api.post<{ job_id: string }>(`/workflow-templates/${template.template_id}/instantiate`, {
        contact_id: contactId,
        scheduled_at: scheduledAt || null,
      });
      onCreated(`Created job ${result.job_id} from "${template.name}".`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally { setSaving(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(11,28,36,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 440, background: "#fff", borderRadius: 8, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
        <div style={{ padding: 18, borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1A3A4A" }}>Instantiate "{template.name}"</h2>
          <button onClick={onClose} style={{ background: "transparent", border: 0, fontSize: 22, color: "#5A7A8A", cursor: "pointer" }}>×</button>
        </div>
        <div style={{ padding: 18, display: "grid", gap: 12 }}>
          <label><span style={pLabel}>Contact</span>
            <select style={pInput} value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">— Pick a contact —</option>
              {contacts.map((c) => (
                <option key={c.contact_id} value={c.contact_id}>
                  {c.company_name || `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.email || "(no name)"}
                </option>
              ))}
            </select>
          </label>
          <label><span style={pLabel}>Scheduled at (optional)</span><input type="datetime-local" style={pInput} value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /></label>
          {err && <div style={errBox}>{err}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={submit} disabled={saving || !contactId}>{saving ? "Creating…" : "Create job"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const pLabel: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 };
const pInput: React.CSSProperties = { width: "100%", padding: "7px 10px", fontSize: 12, border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6, background: "#fff", color: "#0B1C24" };
const errBox: React.CSSProperties = { padding: 10, fontSize: 12, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 6 };
