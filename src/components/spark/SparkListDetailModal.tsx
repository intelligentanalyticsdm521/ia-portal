// SparkListDetailModal — view + edit a contact list (F-96).
//
// User reported on SparkListsPage: "I can't select a list for editing."
// The page only had create + send — no way to drill into a list, see its
// members, rename it, or remove members.
//
// This modal handles all of that in the standard IadmModal chrome. Three
// tabs: Overview (name + description + meta), Members (paginated contact
// list with remove), Send (preview campaign send — placeholder for now).
import { useCallback, useEffect, useState } from "react";
import { Save, Trash2, Users, Edit3, X as XIcon, AlertTriangle } from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { IadmModal, IadmButton } from "../IadmModal";

interface ContactList {
  id: number;
  name: string;
  description?: string | null;
  contact_count: number;
  created_at?: string;
  updated_at?: string;
}

interface Member {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  added_at?: string;
}

type Tab = "overview" | "members";

interface Props {
  open: boolean;
  onClose: () => void;
  listId: number | null;
  onChanged?: () => void;
}

export function SparkListDetailModal({ open, onClose, listId, onChanged }: Props) {
  // API verified against routes/lists.js: GET /lists/:id, PUT /lists/:id
  // (NOT patch), DELETE /lists/:id, DELETE /lists/:id/contacts/:contact_id.
  const { get, put, del, ready } = useSparkApi() as {
    get: <T>(p: string) => Promise<T>;
    put: <T>(p: string, body?: unknown) => Promise<T>;
    del: <T>(p: string) => Promise<T>;
    ready: boolean;
  };

  const [tab, setTab] = useState<Tab>("overview");
  const [list, setList] = useState<ContactList | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inline edit state
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDesc, setDraftDesc] = useState("");

  const reload = useCallback(async () => {
    if (!ready || !listId) return;
    setLoading(true); setError(null);
    try {
      const r = await get<{ data: ContactList }>(`/api/v1/lists/${listId}`);
      setList(r.data);
      setDraftName(r.data.name);
      setDraftDesc(r.data.description || "");
    } catch (err) {
      setError(String((err as Error)?.message || err));
    } finally {
      setLoading(false);
    }
  }, [get, listId, ready]);

  const loadMembers = useCallback(async () => {
    if (!ready || !listId) return;
    try {
      const r = await get<{ data: Member[] }>(`/api/v1/lists/${listId}/contacts?limit=100`);
      setMembers(r.data || []);
    } catch {
      setMembers([]);
    }
  }, [get, listId, ready]);

  useEffect(() => {
    if (open && listId) {
      setTab("overview");
      setEditing(false);
      reload();
    } else {
      setList(null);
      setMembers(null);
    }
  }, [open, listId, reload]);

  useEffect(() => {
    if (open && tab === "members" && members === null) loadMembers();
  }, [open, tab, members, loadMembers]);

  async function save() {
    if (!listId) return;
    if (!draftName.trim()) { setError("Name is required."); return; }
    setSaving(true); setError(null);
    try {
      await put(`/api/v1/lists/${listId}`, { name: draftName.trim(), description: draftDesc.trim() || null });
      setEditing(false);
      await reload();
      onChanged?.();
    } catch (err) {
      setError(String((err as Error)?.message || err));
    } finally {
      setSaving(false);
    }
  }

  async function removeList() {
    if (!listId || !list) return;
    if (!confirm(`Delete list "${list.name}"? Members stay in your CRM. This action cannot be undone.`)) return;
    try {
      await del(`/api/v1/lists/${listId}`);
      onChanged?.();
      onClose();
    } catch (err) {
      setError(String((err as Error)?.message || err));
    }
  }

  async function removeMember(contactId: number) {
    if (!listId) return;
    if (!confirm("Remove this contact from the list?")) return;
    try {
      await del(`/api/v1/lists/${listId}/contacts/${contactId}`);
      await loadMembers();
      await reload();
    } catch (err) {
      setError(String((err as Error)?.message || err));
    }
  }

  if (!open) return null;

  return (
    <IadmModal
      open={open}
      onClose={onClose}
      product="spark"
      eyebrow="SPARK · LIST"
      title={loading ? "Loading…" : (list?.name || "List")}
      subtitle={list ? `${list.contact_count.toLocaleString()} member${list.contact_count === 1 ? "" : "s"}` : undefined}
      size="lg"
      footer={
        <>
          <button onClick={removeList} className="mr-auto text-xs text-rose-600 hover:text-rose-700 inline-flex items-center gap-1">
            <Trash2 className="h-3 w-3" /> Delete list
          </button>
          {editing ? (
            <>
              <IadmButton variant="ghost" onClick={() => { setEditing(false); if (list) { setDraftName(list.name); setDraftDesc(list.description || ""); } }}>
                Cancel
              </IadmButton>
              <IadmButton variant="accent" product="spark" onClick={save} disabled={saving} icon={<Save className="h-3 w-3" />}>
                {saving ? "Saving…" : "Save"}
              </IadmButton>
            </>
          ) : (
            <IadmButton variant="ghost" onClick={onClose}>Close</IadmButton>
          )}
        </>
      }
    >
      <div className="flex h-full flex-col">
        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1 flex-shrink-0">
          {([
            { key: "overview", label: "Overview", icon: Edit3 },
            { key: "members",  label: members ? `Members (${members.length})` : "Members", icon: Users },
          ] as Array<{ key: Tab; label: string; icon: typeof Edit3 }>).map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  tab === t.key ? "bg-white text-slate-900 shadow-sm border border-slate-200" : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
                }`}
              >
                <Icon className="h-3.5 w-3.5" /><span>{t.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="mb-3 rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {tab === "overview" && list && (
            <div className="space-y-4 max-w-2xl">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Details</h3>
                {!editing && (
                  <button onClick={() => setEditing(true)} className="text-xs text-[#EF6C33] hover:underline inline-flex items-center gap-1">
                    <Edit3 className="h-3 w-3" /> Edit
                  </button>
                )}
              </div>
              <div>
                <label className="block text-[10px] uppercase font-semibold text-slate-500 mb-1">Name</label>
                {editing ? (
                  <input value={draftName} onChange={(e) => setDraftName(e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1 text-sm" />
                ) : (
                  <div className="text-sm text-slate-900 font-medium">{list.name}</div>
                )}
              </div>
              <div>
                <label className="block text-[10px] uppercase font-semibold text-slate-500 mb-1">Description</label>
                {editing ? (
                  <textarea value={draftDesc} onChange={(e) => setDraftDesc(e.target.value)} rows={3} className="w-full rounded border border-slate-300 px-2 py-1 text-sm" />
                ) : (
                  <div className="text-sm text-slate-700">{list.description || <span className="text-slate-400 italic">No description</span>}</div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3 text-xs pt-2">
                <div>
                  <div className="text-slate-500 uppercase font-semibold text-[10px]">Members</div>
                  <div className="font-medium text-slate-900 tabular-nums">{list.contact_count.toLocaleString()}</div>
                </div>
                {list.created_at && (
                  <div>
                    <div className="text-slate-500 uppercase font-semibold text-[10px]">Created</div>
                    <div className="font-medium text-slate-900">{new Date(list.created_at).toLocaleDateString()}</div>
                  </div>
                )}
                {list.updated_at && (
                  <div>
                    <div className="text-slate-500 uppercase font-semibold text-[10px]">Updated</div>
                    <div className="font-medium text-slate-900">{new Date(list.updated_at).toLocaleDateString()}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "members" && (
            <div>
              {members === null && <div className="text-sm text-slate-500">Loading…</div>}
              {members && members.length === 0 && (
                <div className="text-sm text-slate-500 italic">
                  No contacts in this list yet. Open any contact and use the <strong>Lists</strong> tab to add them.
                </div>
              )}
              {members && members.length > 0 && (
                <table className="min-w-full text-left text-sm">
                  <thead className="text-[10px] text-slate-500 uppercase">
                    <tr>
                      <th className="px-2 py-2">Name</th>
                      <th className="px-2 py-2">Email</th>
                      <th className="px-2 py-2">Added</th>
                      <th className="px-2 py-2 w-16 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {members.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50">
                        <td className="px-2 py-2 text-slate-900">{[m.first_name, m.last_name].filter(Boolean).join(" ") || <span className="text-slate-400 italic">—</span>}</td>
                        <td className="px-2 py-2 text-slate-600 text-xs">{m.email || "—"}</td>
                        <td className="px-2 py-2 text-[10px] text-slate-400">{m.added_at ? new Date(m.added_at).toLocaleDateString() : "—"}</td>
                        <td className="px-2 py-2 text-right">
                          <button onClick={() => removeMember(m.id)} className="text-[11px] text-rose-600 hover:text-rose-700 inline-flex items-center gap-0.5">
                            <XIcon className="h-3 w-3" /> Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </IadmModal>
  );
}

export default SparkListDetailModal;
