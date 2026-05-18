import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { PageHeader, EmptyState, Button } from "../../components/oliver/ui";

interface Category {
  category_id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  sort_order: number;
  is_active: boolean;
}
interface OfferingLite { category_id?: string | null }

export function OliverCategoriesPage() {
  const { get, post, patch, del, ready } = useOliverApi();
  const [cats, setCats] = useState<Category[]>([]);
  const [offerings, setOfferings] = useState<OfferingLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#1A3A4A");
  const [newDesc, setNewDesc] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [c, o] = await Promise.all([
        get<Category[]>("/catalog/categories"),
        get<OfferingLite[]>("/catalog/offerings").catch(() => [] as OfferingLite[]),
      ]);
      setCats(c || []);
      setOfferings(o || []);
    } catch (e) { setError(e); }
    finally { setLoading(false); }
  }, [get]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  const countFor = useMemo(() => {
    const m: Record<string, number> = {};
    for (const o of offerings) if (o.category_id) m[o.category_id] = (m[o.category_id] || 0) + 1;
    return m;
  }, [offerings]);

  async function add() {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      await post("/catalog/categories", { name: newName.trim(), color: newColor, description: newDesc.trim() || null });
      setNewName(""); setNewDesc(""); setNewColor("#1A3A4A");
      await reload();
    } catch (e) { setError(e); }
    finally { setBusy(false); }
  }
  async function save(c: Category, patchBody: Partial<Category>) {
    try { await patch(`/catalog/categories/${c.category_id}`, patchBody); await reload(); }
    catch (e) { setError(e); }
  }
  async function remove(c: Category) {
    if (!confirm(`Delete category "${c.name}"? Products/services in it become uncategorized (they are not deleted).`)) return;
    try { await del(`/catalog/categories/${c.category_id}`); await reload(); }
    catch (e) { setError(e); }
  }

  return (
    <OliverPageWrapper title="Categories" subtitle="Organize your products & services into categories" error={error} loading={loading}>
      <PageHeader
        title="Categories"
        subtitle="Group products & services so they're easy to browse on invoices, quotes and the customer portal"
      />

      <div className="card">
        <div className="card-hdr"><div><div className="card-ttl">Add a category</div></div></div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)}
            style={{ height: 38, width: 48, borderRadius: 6, border: "1px solid #cbd5e1" }} title="Color" />
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
            placeholder="Category name — e.g. SEO, Web Hosting, Consulting, Retainers"
            onKeyDown={(e) => e.key === "Enter" && add()}
            style={{ flex: "1 1 220px", borderRadius: 6, border: "1px solid #cbd5e1", padding: "8px 10px", fontSize: 13 }} />
          <input type="text" value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Description (optional)"
            style={{ flex: "1 1 200px", borderRadius: 6, border: "1px solid #cbd5e1", padding: "8px 10px", fontSize: 13 }} />
          <Button variant="primary" onClick={add} disabled={busy || !newName.trim()}>Add category</Button>
        </div>
      </div>

      {cats.length === 0 ? (
        <EmptyState title="No categories yet" description="Add your first category above. Products & services can also stay uncategorized." />
      ) : (
        <div className="card" style={{ marginTop: 12 }}>
          <table className="tbl">
            <thead><tr>
              <th style={{ width: 44 }}>Color</th><th>Name</th><th>Description</th>
              <th style={{ textAlign: "right" }}>Items</th><th style={{ width: 80 }} />
            </tr></thead>
            <tbody>
              {cats.map((c) => (
                <tr key={c.category_id}>
                  <td>
                    <input type="color" defaultValue={c.color || "#1A3A4A"}
                      onBlur={(e) => { if (e.target.value !== (c.color || "#1A3A4A")) save(c, { color: e.target.value }); }}
                      style={{ height: 30, width: 38, borderRadius: 5, border: "1px solid #cbd5e1" }} />
                  </td>
                  <td>
                    <input type="text" defaultValue={c.name}
                      onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== c.name) save(c, { name: v }); }}
                      style={{ width: "100%", borderRadius: 5, border: "1px solid #e2e8f0", padding: "5px 8px", fontSize: 13 }} />
                  </td>
                  <td>
                    <input type="text" defaultValue={c.description ?? ""}
                      placeholder="—"
                      onBlur={(e) => { if (e.target.value !== (c.description ?? "")) save(c, { description: e.target.value || null }); }}
                      style={{ width: "100%", borderRadius: 5, border: "1px solid #e2e8f0", padding: "5px 8px", fontSize: 13 }} />
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "monospace", color: "#5A7A8A" }}>{countFor[c.category_id] || 0}</td>
                  <td style={{ textAlign: "right" }}>
                    <button onClick={() => remove(c)} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 12 }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </OliverPageWrapper>
  );
}
