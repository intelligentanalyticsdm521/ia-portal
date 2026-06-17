import { useEffect, useState, useCallback } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { SparkStatStrip } from "../../components/spark/SparkStatStrip";
import { SparkTable } from "../../components/spark/SparkTable";
import { SparkSearchBox } from "../../components/spark/SparkSearchBox";
import { SparkListDetailModal } from "../../components/spark/SparkListDetailModal";
import { IadmModal, IadmButton } from "../../components/IadmModal";
import { List as ListIcon, Plus, Users, Send } from "lucide-react";

interface ContactList {
  id: number;
  name: string;
  description?: string | null;
  contact_count: number;
  created_at: string;
  updated_at?: string;
}

export function SparkListsPage() {
  const { get, post, ready } = useSparkApi();
  const [lists, setLists] = useState<ContactList[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });
  const [saving, setSaving] = useState(false);
  // F-96 — click any list row to open the detail modal (was a dead row).
  const [detailListId, setDetailListId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<{ data: ContactList[] }>("/api/v1/lists");
      setLists(r.data || []);
    } catch (err) { setError(err); } finally { setLoading(false); }
  }, [get, ready]);
  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await post("/api/v1/lists", form);
      setDrawerOpen(false);
      setForm({ name: "", description: "" });
      await load();
    } catch (err) { setError(err); } finally { setSaving(false); }
  }

  const filtered = search ? lists.filter(l => l.name.toLowerCase().includes(search.toLowerCase())) : lists;
  const totalContacts = lists.reduce((s, l) => s + (l.contact_count || 0), 0);
  const populated = lists.filter(l => l.contact_count > 0).length;

  return (
    <SparkPageShell
      title="Lists"
      subtitle="Static contact groups for campaign targeting"
      help={
        <>
          <strong className="block mb-1">When to use Lists vs Segments:</strong>
          A <strong>List</strong> is a static, manually-curated group of contacts. You add and remove people by hand. Good for: a specific campaign send, a conference attendee list, a one-off mailing.
          <br /><br />
          A <strong>Segment</strong> is dynamic — it's a filter (like "everyone tagged VIP who hasn't bought in 90 days") that auto-updates as contacts match the rules.
          <br /><br />
          Use Lists when membership shouldn't change. Use Segments when you want "everyone who currently matches X."
        </>
      }
      actions={
        <button onClick={() => setDrawerOpen(true)} className="spark-btn spark-btn-accent">
          <Plus className="h-3.5 w-3.5" /> New list
        </button>
      }
      stats={
        <SparkStatStrip stats={[
          { label: "Total lists", value: lists.length, icon: ListIcon },
          { label: "Populated", value: populated, accent: "emerald" },
          { label: "Total members", value: totalContacts.toLocaleString(), icon: Users, accent: "blue" },
        ]} />
      }
      filters={
        <div className="flex justify-between w-full">
          <span className="text-xs text-slate-500">Pick a list to target a specific campaign send</span>
          <SparkSearchBox value={search} onChange={setSearch} placeholder="Search lists…" />
        </div>
      }
      loading={loading}
      error={error}
    >
      {lists.length === 0 && !loading ? (
        <div className="spark-mini-card py-12 text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-3">
            <ListIcon className="h-7 w-7 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900">No lists yet</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
            Create a list to manually group contacts for a specific campaign. For
            dynamic groups based on filters, use <strong>Segments</strong> instead.
          </p>
          <button onClick={() => setDrawerOpen(true)} className="spark-btn spark-btn-primary mt-4">
            <Plus className="h-3.5 w-3.5" /> Create your first list
          </button>
        </div>
      ) : (
        <SparkTable<ContactList>
          rows={filtered}
          getRowKey={l => l.id}
          totalCount={filtered.length}
          emptyState={search ? `No lists match "${search}"` : "No lists"}
          onRowClick={l => setDetailListId(l.id)}
          columns={[
            {
              key: "name", header: "List", width: "wide",
              cell: l => (
                <div>
                  <div className="font-medium">{l.name}</div>
                  {l.description && <div className="text-xs text-slate-500 truncate max-w-md">{l.description}</div>}
                </div>
              ),
            },
            {
              key: "count", header: "Members", width: "compact",
              cell: l => (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium">
                  <Users className="h-3 w-3" /> {l.contact_count.toLocaleString()}
                </span>
              ),
            },
            {
              key: "created", header: "Created", width: "compact", hideOnMobile: true,
              cell: l => <span className="text-xs text-slate-500">{new Date(l.created_at).toLocaleDateString()}</span>,
            },
          ]}
          rowActions={l => (
            <button
              onClick={() => alert(`Send campaign to ${l.name} — flow connects in v2`)}
              className="spark-btn spark-btn-sm spark-btn-secondary"
              disabled={l.contact_count === 0}
              title={l.contact_count === 0 ? "Add contacts first" : "Send a campaign"}
            >
              <Send className="h-3 w-3" /> Send
            </button>
          )}
        />
      )}

      <IadmModal
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        product="spark"
        title="New list"
        subtitle="Static lists hold a manually-curated set of contacts. For dynamic filtering, use Segments."
        size="info"
        footer={
          <>
            <IadmButton variant="ghost" onClick={() => setDrawerOpen(false)}>Cancel</IadmButton>
            <IadmButton variant="accent" product="spark" onClick={handleCreate} disabled={saving || !form.name.trim()}>
              {saving ? "Creating…" : "Create list"}
            </IadmButton>
          </>
        }
      >
        <div className="p-5 space-y-3">
          <div className="spark-field">
            <label className="spark-field-label">List name</label>
            <input className="spark-field-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Holiday VIPs / Conference attendees" autoFocus />
          </div>
          <div className="spark-field">
            <label className="spark-field-label">Description</label>
            <textarea className="spark-field-textarea" rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What this list is for (optional)" />
          </div>
          <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-md p-3">
            After creating the list, add contacts to it from the <strong>Contacts</strong> page using the bulk-action toolbar.
          </div>
        </div>
      </IadmModal>

      <SparkListDetailModal
        open={detailListId !== null}
        onClose={() => setDetailListId(null)}
        listId={detailListId}
        onChanged={() => { load(); }}
      />
    </SparkPageShell>
  );
}

export default SparkListsPage;
