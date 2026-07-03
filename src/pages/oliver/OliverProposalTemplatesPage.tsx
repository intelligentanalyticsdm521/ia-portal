/**
 * OliverProposalTemplatesPage — Proposal Templates (#77).
 *
 * Named reusable proposal templates per tenant. The tenant can mark ONE
 * template as the default; the backend enforces uniqueness via a filtered
 * unique index.
 *
 * Talks to oliver-api routes/proposalTemplates.js:
 *   GET    /proposal-templates
 *   GET    /proposal-templates/:id
 *   POST   /proposal-templates
 *   PUT    /proposal-templates/:id
 *   DELETE /proposal-templates/:id
 *   POST   /proposal-templates/:id/duplicate
 *
 * Style mirrors OliverAutomationsPage (list + inline card + modal editor).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { PageHeader, Button } from "../../components/oliver/ui";
import { FileText, Copy, Edit3, Trash2, Star } from "lucide-react";

interface ProposalTemplate {
  proposal_template_id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  body: unknown;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function OliverProposalTemplatesPage() {
  const { get, post, put, del, ready } = useOliverApi();
  const [templates, setTemplates] = useState<ProposalTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<ProposalTemplate | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await get<ProposalTemplate[]>("/proposal-templates");
      setTemplates(data || []);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [get]);

  useEffect(() => {
    if (ready) reload();
  }, [ready, reload]);

  const filtered = useMemo(() => {
    if (!search.trim()) return templates;
    const q = search.toLowerCase();
    return templates.filter(
      (t) =>
        (t.name || "").toLowerCase().includes(q) ||
        (t.description || "").toLowerCase().includes(q)
    );
  }, [templates, search]);

  function pushFlash(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(null), 3000);
  }

  async function handleDelete(t: ProposalTemplate) {
    if (!confirm(`Delete template "${t.name}"?`)) return;
    try {
      await del(`/proposal-templates/${t.proposal_template_id}`);
      pushFlash(`Deleted "${t.name}".`);
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function handleDuplicate(t: ProposalTemplate) {
    try {
      await post(`/proposal-templates/${t.proposal_template_id}/duplicate`);
      pushFlash(`Duplicated "${t.name}".`);
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Duplicate failed");
    }
  }

  async function handleMakeDefault(t: ProposalTemplate) {
    try {
      await put(`/proposal-templates/${t.proposal_template_id}`, { is_default: true });
      pushFlash(`"${t.name}" is now the default.`);
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Update failed");
    }
  }

  return (
    <OliverPageWrapper
      title="Proposal Templates"
      subtitle="Reusable proposal bodies you can drop into any new proposal"
      error={error}
      loading={loading && !templates.length}
    >
      <PageHeader
        title="Proposal Templates"
        subtitle="Save your best proposal content as a template. Start new proposals in seconds by picking one from the list."
        actions={
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            + New template
          </Button>
        }
      />

      {flash && (
        <div
          style={{
            padding: 10,
            marginBottom: 12,
            fontSize: 12,
            background: "#F0FDF4",
            color: "#15803D",
            border: "1px solid #BBF7D0",
            borderRadius: 6,
          }}
        >
          {flash}
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search templates…"
          style={{
            width: "100%",
            maxWidth: 320,
            padding: "8px 12px",
            fontSize: 12,
            border: "1px solid #E5E7EB",
            borderRadius: 6,
          }}
        />
      </div>

      {!templates.length && !loading ? (
        <div
          className="card"
          style={{
            padding: 40,
            textAlign: "center",
            color: "#5A7A8A",
            fontSize: 13,
          }}
        >
          <div style={{ marginBottom: 6, fontWeight: 600, color: "#1A3A4A" }}>
            No proposal templates yet
          </div>
          <div style={{ marginBottom: 14 }}>
            Templates let you standardize your best-performing proposal content.
            Create one once, then use it as the starting point for future proposals.
          </div>
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            + Create your first template
          </Button>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {filtered.map((t) => (
            <TemplateRow
              key={t.proposal_template_id}
              template={t}
              onEdit={() => setEditing(t)}
              onDuplicate={() => handleDuplicate(t)}
              onDelete={() => handleDelete(t)}
              onMakeDefault={() => handleMakeDefault(t)}
            />
          ))}
          {!filtered.length && (
            <div
              style={{
                padding: 24,
                textAlign: "center",
                color: "#5A7A8A",
                fontSize: 12,
                fontStyle: "italic",
              }}
            >
              No templates match your search.
            </div>
          )}
        </div>
      )}

      {(showCreate || editing) && (
        <TemplateEditorModal
          template={editing}
          onClose={() => {
            setShowCreate(false);
            setEditing(null);
          }}
          onSaved={(msg) => {
            setShowCreate(false);
            setEditing(null);
            pushFlash(msg);
            reload();
          }}
          api={{ post, put }}
        />
      )}
    </OliverPageWrapper>
  );
}

function TemplateRow({
  template,
  onEdit,
  onDuplicate,
  onDelete,
  onMakeDefault,
}: {
  template: ProposalTemplate;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMakeDefault: () => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        gap: 12,
        padding: "14px 16px",
        borderBottom: "1px solid #F1F5F9",
        alignItems: "center",
      }}
    >
      <FileText size={18} color="#5A7A8A" />
      <div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "#0B1C24",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {template.name}
          {template.is_default && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                fontSize: 9,
                fontWeight: 700,
                padding: "2px 7px",
                borderRadius: 999,
                background: "#FEF3C7",
                color: "#92400E",
                textTransform: "uppercase",
                letterSpacing: 0.4,
              }}
            >
              <Star size={9} /> Default
            </span>
          )}
        </div>
        {template.description && (
          <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 3 }}>
            {template.description}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {!template.is_default && (
          <Button variant="ghost" size="sm" onClick={onMakeDefault} title="Set as default">
            <Star size={12} />
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onDuplicate} title="Duplicate">
          <Copy size={12} />
        </Button>
        <Button variant="ghost" size="sm" onClick={onEdit} title="Edit">
          <Edit3 size={12} />
        </Button>
        <Button variant="ghost" size="sm" onClick={onDelete} title="Delete">
          <Trash2 size={12} color="#dc2626" />
        </Button>
      </div>
    </div>
  );
}

function TemplateEditorModal({
  template,
  onClose,
  onSaved,
  api,
}: {
  template: ProposalTemplate | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
  api: {
    post: <T>(p: string, b?: unknown) => Promise<T>;
    put: <T>(p: string, b: unknown) => Promise<T>;
  };
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [bodyText, setBodyText] = useState(
    template?.body ? JSON.stringify(template.body, null, 2) : ""
  );
  const [isDefault, setIsDefault] = useState(!!template?.is_default);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) {
      setErr("Name is required");
      return;
    }
    // Parse body if provided — send as an object so the server stores tidy JSON.
    // If parse fails, send the raw string; server will re-stringify it.
    let body: unknown = null;
    if (bodyText.trim()) {
      try {
        body = JSON.parse(bodyText);
      } catch {
        body = bodyText;
      }
    }
    setErr(null);
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        body,
        is_default: isDefault,
      };
      if (template) {
        await api.put(`/proposal-templates/${template.proposal_template_id}`, payload);
        onSaved(`Updated "${name}".`);
      } else {
        await api.post("/proposal-templates", payload);
        onSaved(`Created "${name}".`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(11,28,36,0.4)",
        zIndex: 1000,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        style={{
          width: 520,
          height: "100%",
          background: "#fff",
          overflowY: "auto",
          boxShadow: "-4px 0 24px rgba(0,0,0,0.1)",
        }}
      >
        <div
          style={{
            padding: 20,
            borderBottom: "1px solid #E2E8F0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1A3A4A" }}>
            {template ? "Edit template" : "New proposal template"}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: 0,
              fontSize: 22,
              color: "#5A7A8A",
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: 20, display: "grid", gap: 14 }}>
          <label>
            <span style={pLabel}>Name</span>
            <input
              style={pInput}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              maxLength={200}
            />
          </label>
          <label>
            <span style={pLabel}>Description</span>
            <textarea
              rows={2}
              style={{ ...pInput, resize: "vertical" }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this template for? (optional)"
            />
          </label>
          <label>
            <span style={pLabel}>Template body (JSON)</span>
            <textarea
              rows={12}
              style={{ ...pInput, resize: "vertical", fontFamily: "monospace", fontSize: 11 }}
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder={'e.g. { "sections": [ ... ] }'}
            />
            <div style={{ marginTop: 4, fontSize: 10, color: "#94A3B8" }}>
              Stored as JSON. Leave empty if you only want a named placeholder for now.
            </div>
          </label>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              color: "#0B1C24",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
            />
            Make this my default template
          </label>
          {err && <div style={errBox}>{err}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={saving || !name.trim()}>
              {saving ? "Saving…" : template ? "Save changes" : "Create template"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const pLabel: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: "#5A7A8A",
  marginBottom: 4,
};
const pInput: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  fontSize: 12,
  border: "1px solid rgba(45,156,219,0.28)",
  borderRadius: 6,
  background: "#fff",
  color: "#0B1C24",
};
const errBox: React.CSSProperties = {
  padding: 10,
  fontSize: 12,
  background: "#FEF2F2",
  color: "#991B1B",
  border: "1px solid #FECACA",
  borderRadius: 6,
};

export default OliverProposalTemplatesPage;
