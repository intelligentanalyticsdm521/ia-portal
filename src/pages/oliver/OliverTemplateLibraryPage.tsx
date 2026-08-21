// OliverTemplateLibraryPage — real document template builder.
// Create/edit named branded templates, assign each to Invoice / Quote /
// Proposal / Recurring (those documents then render with it). Tier-capped
// (Invoicing [lite] 1 / Standard 3 / Pro 10 / Business unlimited).
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { PageHeader, Button } from "../../components/oliver/ui";
import { TemplateEditor, type Tpl, DOC_TYPES } from "../../components/oliver/TemplateEditor";

interface ListResp {
  templates: Tpl[];
  assignments: Record<string, string | null>;
  limit: number | null;
  used: number;
  canCreate: boolean;
}

export function OliverTemplateLibraryPage() {
  const { get, post, patch, del, ready } = useOliverApi();
  const [data, setData] = useState<ListResp | null>(null);
  const [shared, setShared] = useState<{ tenantFullName?: string; email?: string; phone?: string; logoUrl?: string | null; brandColor?: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [editing, setEditing] = useState<Tpl | "new" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [d, s] = await Promise.all([
        get<ListResp>("/templates"),
        get<typeof shared>("/settings").catch(() => null),
      ]);
      setData(d); setShared(s);
    } catch (e) { setError(e); }
    finally { setLoading(false); }
  }, [get]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  function assignedTypes(id: string): string[] {
    if (!data) return [];
    return DOC_TYPES.filter((t) => data.assignments[t] === id);
  }

  async function save(tpl: Tpl, assignTo: string[]) {
    setMsg(null);
    try {
      if (tpl.template_id) {
        await patch(`/templates/${tpl.template_id}`, { ...tpl, assignTo });
      } else {
        await post("/templates", { ...tpl, assignTo });
      }
      setEditing(null);
      await reload();
      setMsg("Template saved.");
      setTimeout(() => setMsg(null), 2500);
    } catch (e) {
      setMsg(`Save failed: ${(e as Error).message}`);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this template? Documents using it fall back to your brand defaults.")) return;
    try { await del(`/templates/${id}`); await reload(); }
    catch (e) { setMsg(`Delete failed: ${(e as Error).message}`); }
  }

  return (
    <OliverPageWrapper title="Template Library" subtitle="Invoice, quote, proposal & recurring templates" error={error} loading={loading}>
      <PageHeader
        title="Template Library"
        subtitle="Build branded templates and choose which documents use each one."
        actions={
          <Button
            variant="primary"
            disabled={!data?.canCreate}
            title={!data?.canCreate ? "Tier limit reached — upgrade for more templates" : undefined}
            onClick={() => setEditing("new")}
          >
            + New template
          </Button>
        }
      />

      {msg && (
        <div className="card" style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
          <div style={{ fontSize: 12, color: "#15803D" }}>{msg}</div>
        </div>
      )}

      {data && (
        <div className="card" style={{ background: "#E8F4FB", border: "1px solid rgba(45,156,219,0.3)" }}>
          <div style={{ fontSize: 12, color: "#0C4A60" }}>
            {data.used} of {data.limit == null ? "unlimited" : data.limit} templates used.
            {data.limit != null && !data.canCreate && (
              <> Tier limit reached — <Link to="/app/services/oliver_usage" style={{ fontWeight: 700, textDecoration: "underline", color: "#0C4A60" }}>upgrade</Link> for more.</>
            )}{" "}
            Logo & brand color come from your{" "}
            <Link to="/app/settings?tab=Organization" style={{ fontWeight: 700, textDecoration: "underline", color: "#0C4A60" }}>business profile</Link>{" "}
            unless a template overrides them.
          </div>
        </div>
      )}

      {data?.templates.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 32 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#1A3A4A" }}>No templates yet</div>
          <div style={{ fontSize: 12, color: "#5A7A8A", margin: "6px 0 14px" }}>
            Create your first template and pick which documents use it.
          </div>
          <Button variant="primary" onClick={() => setEditing("new")}>+ Create your first template</Button>
        </div>
      )}

      {data?.templates.map((t) => (
        <div key={t.template_id} className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1A3A4A" }}>
                {t.name}{t.isDefault && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, color: "#5A7A8A" }}>DEFAULT</span>}
              </div>
              <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 4 }}>
                Used for:{" "}
                {assignedTypes(t.template_id!).length
                  ? assignedTypes(t.template_id!).map((d) => d[0].toUpperCase() + d.slice(1)).join(", ")
                  : <span style={{ color: "#94A3B8" }}>not assigned to any document</span>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="secondary" onClick={() => setEditing(t)}>Edit</Button>
              <Button variant="ghost" onClick={() => remove(t.template_id!)}>Delete</Button>
            </div>
          </div>
        </div>
      ))}

      {editing && (
        <TemplateEditor
          initial={editing === "new" ? null : editing}
          initialAssign={editing === "new" ? [] : assignedTypes((editing as Tpl).template_id!)}
          brand={{
            businessName: shared?.tenantFullName,
            email: shared?.email,
            phone: shared?.phone,
            logoUrl: shared?.logoUrl ?? null,
            accentColor: shared?.brandColor ?? null,
          }}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      )}
    </OliverPageWrapper>
  );
}

export default OliverTemplateLibraryPage;
