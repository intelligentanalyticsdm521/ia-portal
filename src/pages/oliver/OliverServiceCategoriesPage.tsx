// F-74 — Service Categories (crew skill taxonomy).
//
// Distinct from `OliverCategoriesPage` which handles product/service catalog
// categories. THIS page is the tenant's skill taxonomy:
//   • A category is a service domain ("Plumbing", "Electrical", "Cleaning",
//     "Lawn care", "Pet grooming", etc.).
//   • Workers get tagged with the categories they cover, plus optional
//     proficiency level. This drives:
//       — auto_assign_worker 'skill_match' strategy
//       — customer "preferred crew" picker (filterable by category)
//       — booking page service routing
//
// Backed by /service-categories on oliver-api (oliver.service_category table).

import { useCallback, useEffect, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { PageHeader, EmptyState, Button } from "../../components/oliver/ui";

interface ServiceCategory {
  category_id: string;
  name: string;
  slug: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  sort_order: number;
  is_active: boolean;
}

export function OliverServiceCategoriesPage() {
  const { get, post, patch, del, ready } = useOliverApi();
  const [cats, setCats] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newColor, setNewColor] = useState("#1A3A4A");
  const [newIcon, setNewIcon] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await get<{ data: ServiceCategory[] } | ServiceCategory[]>("/service-categories");
      const list = Array.isArray(data) ? data : (data?.data ?? []);
      setCats(list);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [get]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  async function add() {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      await post("/service-categories", {
        name: newName.trim(),
        description: newDesc.trim() || null,
        color: newColor,
        icon: newIcon.trim() || null,
        sort_order: cats.length,
      });
      setNewName("");
      setNewDesc("");
      setNewIcon("");
      setNewColor("#1A3A4A");
      await reload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function save(c: ServiceCategory, patchBody: Partial<ServiceCategory>) {
    try {
      await patch(`/service-categories/${c.category_id}`, patchBody);
      await reload();
    } catch (e) {
      setError(e);
    }
  }

  async function remove(c: ServiceCategory) {
    if (!confirm(`Remove the "${c.name}" service category? Workers tagged with it will lose that tag; existing jobs are unaffected.`)) return;
    try {
      await del(`/service-categories/${c.category_id}`);
      await reload();
    } catch (e) {
      setError(e);
    }
  }

  return (
    <OliverPageWrapper title="Service Categories" subtitle="Crew skill taxonomy" error={error} loading={loading}>
      <PageHeader
        title="Service Categories"
        subtitle="Define the service categories your business covers (Plumbing, Electrical, Cleaning, Pet grooming, etc.). Then tag workers with the categories they cover — used by auto-assignment and the customer's preferred-crew picker."
      />

      <div className="card">
        <div className="card-hdr"><div><div className="card-ttl">Add a service category</div></div></div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            style={{ height: 38, width: 48, borderRadius: 6, border: "1px solid #cbd5e1" }}
            title="Display color (used for chips)"
          />
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Service category — e.g. Plumbing, Electrical, HVAC"
            onKeyDown={(e) => e.key === "Enter" && add()}
            style={{ flex: "1 1 220px", borderRadius: 6, border: "1px solid #cbd5e1", padding: "8px 10px", fontSize: 13 }}
          />
          <input
            type="text"
            value={newIcon}
            onChange={(e) => setNewIcon(e.target.value)}
            placeholder="Icon name (optional)"
            style={{ width: 160, borderRadius: 6, border: "1px solid #cbd5e1", padding: "8px 10px", fontSize: 13 }}
          />
          <input
            type="text"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Description (optional)"
            style={{ flex: "1 1 200px", borderRadius: 6, border: "1px solid #cbd5e1", padding: "8px 10px", fontSize: 13 }}
          />
          <Button variant="primary" onClick={add} disabled={busy || !newName.trim()}>Add category</Button>
        </div>
      </div>

      {cats.length === 0 ? (
        <EmptyState title="No service categories yet" description="Add your first service category above. Workers will be able to be tagged with one or more categories on their profile drawer." />
      ) : (
        <div className="card" style={{ marginTop: 12 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 44 }}>Color</th>
                <th>Name</th>
                <th>Description</th>
                <th style={{ width: 120 }}>Icon</th>
                <th style={{ width: 80, textAlign: "right" }}>Order</th>
                <th style={{ width: 80 }} />
              </tr>
            </thead>
            <tbody>
              {cats.map((c) => (
                <tr key={c.category_id}>
                  <td>
                    <input
                      type="color"
                      defaultValue={c.color || "#1A3A4A"}
                      onBlur={(e) => { if (e.target.value !== (c.color || "#1A3A4A")) save(c, { color: e.target.value }); }}
                      style={{ height: 30, width: 38, borderRadius: 5, border: "1px solid #cbd5e1" }}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      defaultValue={c.name}
                      onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== c.name) save(c, { name: v }); }}
                      style={{ width: "100%", borderRadius: 5, border: "1px solid #e2e8f0", padding: "5px 8px", fontSize: 13 }}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      defaultValue={c.description ?? ""}
                      placeholder="—"
                      onBlur={(e) => { if (e.target.value !== (c.description ?? "")) save(c, { description: e.target.value || null }); }}
                      style={{ width: "100%", borderRadius: 5, border: "1px solid #e2e8f0", padding: "5px 8px", fontSize: 13 }}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      defaultValue={c.icon ?? ""}
                      placeholder="—"
                      onBlur={(e) => { if (e.target.value !== (c.icon ?? "")) save(c, { icon: e.target.value || null }); }}
                      style={{ width: "100%", borderRadius: 5, border: "1px solid #e2e8f0", padding: "5px 8px", fontSize: 13 }}
                    />
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <input
                      type="number"
                      defaultValue={c.sort_order}
                      onBlur={(e) => { const n = Number(e.target.value); if (Number.isFinite(n) && n !== c.sort_order) save(c, { sort_order: n }); }}
                      style={{ width: 70, borderRadius: 5, border: "1px solid #e2e8f0", padding: "5px 8px", fontSize: 13, textAlign: "right" }}
                    />
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button onClick={() => remove(c)} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 12 }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card" style={{ marginTop: 12, background: "#F8FAFC" }}>
        <div className="card-hdr"><div><div className="card-ttl">How service categories are used</div></div></div>
        <ul style={{ fontSize: 13, color: "#475569", lineHeight: 1.7, paddingLeft: 18, margin: 0 }}>
          <li><strong>Crew tagging.</strong> On a worker's drawer, pick the categories they cover (with optional proficiency).</li>
          <li><strong>Auto-assignment.</strong> The "Skill-match" auto-assign strategy filters workers to those tagged with the job's category before picking the best fit.</li>
          <li><strong>Customer worker preferences.</strong> On a customer's record, you (or they, in the portal) can lock in a preferred crew + ordered backups. The preferred list is filtered by category match for the job.</li>
          <li><strong>Booking & service request routing.</strong> Service requests and booking submissions inherit the category from the service they're booking — workflow rules can route by category.</li>
        </ul>
      </div>
    </OliverPageWrapper>
  );
}

export default { OliverServiceCategoriesPage };
