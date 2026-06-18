// SparkContactModal — unified contact modal (F-88).
//
// Replaces the SparkDrawer side-panel contact detail with a centered modal
// that holds EVERYTHING about a contact in one place. Mirrors OLIVER's
// CustomerModal pattern: tabbed sections, inline edit, related entities,
// quick actions — so you never have to navigate away to do common work.
//
// Tabs:
//   Overview  — profile, status flags, inline edit
//   Activity  — recent email/SMS/form events
//   Notes     — add/read internal notes
//   Tags      — manage taxonomy
//   Danger    — soft-delete + unsubscribe controls
//
// Why a modal, not a drawer:
//   - Drawers compete with main content; users lose context of the list
//     they were filtering. A centered modal puts the contact front-and-center.
//   - Modal layout scales to richer tabs (Activity timeline, Notes thread).
//   - Same interaction model OLIVER uses → users recognise the pattern.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Mail, Phone, Building2, MapPin, Tag as TagIcon, List as ListIcon,
  Activity as ActivityIcon, FileText, AlertTriangle, Edit3, Save, Trash2,
  Plus,
} from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { IadmModal, IadmButton } from "../IadmModal";

export interface ContactLite {
  id: number;
  /** F-184 — Stripe's top-level customer.name. Appears on invoices. */
  display_name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  company?: string;
  title?: string;
  source?: string;
  account_name?: string | null;
  account_domain?: string | null;
  contact_intelligence_tier?: string | null;
  contact_intelligence_score?: number | null;
  email_unsubscribed?: boolean;
  email_invalid?: boolean;
  sms_unsubscribed?: boolean;
  tag_names?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface ContactFull extends ContactLite {
  address_street?: string;
  address_city?: string;
  address_state?: string;
  address_zip?: string;
  tags?: Array<{ id: number; name: string; color?: string | null }>;
  // API shape (verified against routes/contacts.js GET /:id):
  //   { id, content, author, created_at, ... }
  // (Previously I had wrong field names body/author_email — D-06/D-07.)
  notes?: Array<{ id: number; content: string; created_at: string; author?: string | null }>;
}

interface ListMembership {
  id: number;
  name: string;
  description?: string | null;
  contact_count?: number;
  added_at: string;
}

interface AvailableList {
  id: number;
  name: string;
  contact_count?: number;
}

interface ActivityEvent {
  // API shape (verified against routes/contacts.js GET /:id/activity):
  //   { id, event_type, channel, metadata, occurred_at }
  // metadata is a JSON column. (Previously I had wrong field 'detail' — D-05.)
  id?: number;
  event_type: string;
  occurred_at: string;
  channel?: string | null;
  metadata?: string | null;
}

type Tab = "overview" | "activity" | "notes" | "lists" | "tags" | "danger";

interface Props {
  contactId: number | null;
  open: boolean;
  onClose: () => void;
  /** Called after a successful save/delete so the parent list can refresh. */
  onChanged?: () => void;
}

const TIER_COLORS: Record<string, string> = {
  X: "bg-emerald-100 text-emerald-700 ring-emerald-300",
  Y: "bg-blue-100 text-blue-700 ring-blue-300",
  Z: "bg-slate-100 text-slate-600 ring-slate-300",
};

export function SparkContactModal({ contactId, open, onClose, onChanged }: Props) {
  const { get, post, put, del, ready } = useSparkApi() as {
    get: <T>(p: string) => Promise<T>;
    post: <T>(p: string, body?: unknown) => Promise<T>;
    put: <T>(p: string, body?: unknown) => Promise<T>;
    del: <T>(p: string) => Promise<T>;
    ready: boolean;
  };

  const [tab, setTab] = useState<Tab>("overview");
  const [contact, setContact] = useState<ContactFull | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[] | null>(null);
  const [lists, setLists] = useState<ListMembership[] | null>(null);
  const [availableLists, setAvailableLists] = useState<AvailableList[]>([]);
  const [pickerListId, setPickerListId] = useState<number | "">("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // Inline edit state — local copies while editing, commit on Save.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<ContactFull>>({});
  const [saving, setSaving] = useState(false);

  // Notes
  const [newNote, setNewNote] = useState("");
  const [postingNote, setPostingNote] = useState(false);

  const reload = useCallback(async () => {
    if (!ready || !contactId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await get<{ data: ContactFull }>(`/api/v1/contacts/${contactId}`);
      setContact(r.data);
      setDraft(r.data);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [get, contactId, ready]);

  const loadActivity = useCallback(async () => {
    if (!ready || !contactId) return;
    try {
      const r = await get<{ data: ActivityEvent[] }>(`/api/v1/contacts/${contactId}/activity`);
      setActivity(r.data || []);
    } catch {
      setActivity([]);
    }
  }, [get, contactId, ready]);

  const loadLists = useCallback(async () => {
    if (!ready || !contactId) return;
    try {
      const r = await get<{ data: ListMembership[] }>(`/api/v1/contacts/${contactId}/lists`);
      setLists(r.data || []);
      // Also load the catalog of all lists so the picker is populated.
      const all = await get<{ data: AvailableList[] }>("/api/v1/lists");
      setAvailableLists(all.data || []);
    } catch {
      setLists([]);
      setAvailableLists([]);
    }
  }, [get, contactId, ready]);

  useEffect(() => {
    if (open && contactId) {
      setTab("overview");
      setEditing(false);
      reload();
    } else {
      setContact(null);
      setActivity(null);
      setLists(null);
      setAvailableLists([]);
    }
  }, [open, contactId, reload]);

  useEffect(() => {
    if (open && tab === "activity" && activity === null) loadActivity();
    if (open && tab === "lists" && lists === null) loadLists();
  }, [open, tab, activity, lists, loadActivity, loadLists]);

  async function addToList() {
    if (!contactId || pickerListId === "") return;
    try {
      await post(`/api/v1/contacts/${contactId}/lists`, { list_id: pickerListId });
      setPickerListId("");
      await loadLists();
    } catch (err) { setError(err); }
  }

  async function removeFromList(listId: number) {
    if (!contactId) return;
    if (!confirm("Remove from this list?")) return;
    try {
      await del(`/api/v1/contacts/${contactId}/lists/${listId}`);
      await loadLists();
    } catch (err) { setError(err); }
  }

  // Esc closes
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const fullName = useMemo(() => {
    if (!contact) return "";
    return `${contact.first_name || ""} ${contact.last_name || ""}`.trim() || contact.email || `Contact #${contact.id}`;
  }, [contact]);

  async function save() {
    if (!contactId) return;
    setSaving(true);
    try {
      const payload: Partial<ContactFull> = {};
      const fields: (keyof ContactFull)[] = [
        "display_name", "first_name", "last_name", "email", "phone", "company", "title",
        "address_street", "address_city", "address_state", "address_zip",
      ];
      for (const f of fields) {
        if (draft[f] !== contact?.[f]) payload[f] = draft[f] as never;
      }
      if (Object.keys(payload).length === 0) {
        setEditing(false);
        return;
      }
      await put(`/api/v1/contacts/${contactId}`, payload);
      setEditing(false);
      await reload();
      onChanged?.();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  async function addNote() {
    if (!contactId || !newNote.trim()) return;
    setPostingNote(true);
    try {
      // D-04 — API requires `content`, NOT `body`. Earlier shipped version
      // sent {body:...} → 400. Verified against routes/contacts.js POST /:id/notes.
      await post(`/api/v1/contacts/${contactId}/notes`, { content: newNote.trim() });
      setNewNote("");
      await reload();
    } catch (err) {
      setError(err);
    } finally {
      setPostingNote(false);
    }
  }

  async function softDelete() {
    if (!contactId || !contact) return;
    if (!confirm(`Delete ${fullName}? This is reversible from the trash for 30 days.`)) return;
    try {
      await del(`/api/v1/contacts/${contactId}`);
      onChanged?.();
      onClose();
    } catch (err) {
      setError(err);
    }
  }

  if (!open) return null;

  // Tier badge in the header right-side slot.
  const tierBadge = contact?.contact_intelligence_tier ? (
    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-bold ring-1 ${TIER_COLORS[contact.contact_intelligence_tier] || TIER_COLORS.Z}`}>
      {contact.contact_intelligence_tier}
    </span>
  ) : null;

  return (
    <IadmModal
      open={open}
      onClose={onClose}
      product="spark"
      eyebrow="SPARK · CONTACT"
      title={loading ? "Loading…" : fullName}
      subtitle={
        <>
          {contact?.email || contact?.phone || "—"}
          {contact?.account_name ? ` · ${contact.account_name}` : ""}
        </>
      }
      headerActions={tierBadge}
      size="info"
    >
      <div className="flex h-full flex-col">
        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1 flex-shrink-0">
          {([
            { key: "overview", label: "Overview", icon: Edit3 },
            { key: "activity", label: "Activity", icon: ActivityIcon },
            { key: "notes",    label: contact?.notes?.length ? `Notes (${contact.notes.length})` : "Notes", icon: FileText },
            { key: "lists",    label: lists?.length ? `Lists (${lists.length})` : "Lists", icon: ListIcon },
            { key: "tags",     label: contact?.tags?.length ? `Tags (${contact.tags.length})` : "Tags", icon: TagIcon },
            { key: "danger",   label: "More", icon: AlertTriangle },
          ] as Array<{ key: Tab; label: string; icon: typeof Edit3 }>).map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  tab === t.key
                    ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                    : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {Boolean(error) && (
            <div className="mb-3 rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
              {String((error as Error)?.message || error)}
            </div>
          )}

          {tab === "overview" && contact && (
            <div className="space-y-4">
              {/* Status flags */}
              {(contact.email_unsubscribed || contact.email_invalid || contact.sms_unsubscribed) && (
                <div className="space-y-1">
                  {contact.email_unsubscribed && <Flag color="rose">Email unsubscribed — campaigns will be suppressed</Flag>}
                  {contact.email_invalid && <Flag color="amber">Email marked invalid — past delivery failures</Flag>}
                  {contact.sms_unsubscribed && <Flag color="rose">SMS unsubscribed</Flag>}
                </div>
              )}

              {/* Profile grid */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Profile</h3>
                  {!editing ? (
                    <button onClick={() => setEditing(true)} className="text-xs text-[#EF6C33] hover:underline flex items-center gap-1">
                      <Edit3 className="h-3 w-3" /> Edit
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setDraft(contact); setEditing(false); }} className="text-xs text-slate-500 hover:text-slate-700">Cancel</button>
                      <button onClick={save} disabled={saving} className="text-xs px-2 py-0.5 rounded bg-[#EF6C33] text-white inline-flex items-center gap-1">
                        <Save className="h-3 w-3" /> {saving ? "Saving…" : "Save"}
                      </button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                  <div className="col-span-2">
                    <Field label="Display name (invoice / billing)" value={contact.display_name} editing={editing}
                      onChange={(v) => setDraft({ ...draft, display_name: v })} draft={draft.display_name} />
                  </div>
                  <div className="col-span-2">
                    <Field label="Business name" value={contact.account_name || contact.company} editing={editing} icon={Building2}
                      onChange={(v) => setDraft({ ...draft, company: v })} draft={draft.company} />
                  </div>
                  <Field label="First name" value={contact.first_name} editing={editing}
                    onChange={(v) => setDraft({ ...draft, first_name: v })} draft={draft.first_name} />
                  <Field label="Last name" value={contact.last_name} editing={editing}
                    onChange={(v) => setDraft({ ...draft, last_name: v })} draft={draft.last_name} />
                  <Field label="Email" value={contact.email} editing={editing} icon={Mail}
                    onChange={(v) => setDraft({ ...draft, email: v })} draft={draft.email} />
                  <Field label="Phone" value={contact.phone} editing={editing} icon={Phone}
                    onChange={(v) => setDraft({ ...draft, phone: v })} draft={draft.phone} />
                  <Field label="Title" value={contact.title} editing={editing}
                    onChange={(v) => setDraft({ ...draft, title: v })} draft={draft.title} />
                </div>
              </div>

              {/* Address (only show if editing or any value present) */}
              {(editing || contact.address_street || contact.address_city) && (
                <div>
                  <h3 className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-2 flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> Address
                  </h3>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                    <Field label="Street" value={contact.address_street} editing={editing}
                      onChange={(v) => setDraft({ ...draft, address_street: v })} draft={draft.address_street} />
                    <Field label="City" value={contact.address_city} editing={editing}
                      onChange={(v) => setDraft({ ...draft, address_city: v })} draft={draft.address_city} />
                    <Field label="State" value={contact.address_state} editing={editing}
                      onChange={(v) => setDraft({ ...draft, address_state: v })} draft={draft.address_state} />
                    <Field label="ZIP" value={contact.address_zip} editing={editing}
                      onChange={(v) => setDraft({ ...draft, address_zip: v })} draft={draft.address_zip} />
                  </div>
                </div>
              )}

              {/* Meta */}
              <div>
                <h3 className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-2">Meta</h3>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <div className="text-slate-500">Source</div>
                    <div className="font-medium text-slate-900 capitalize">{contact.source?.replace(/_/g, " ") || "—"}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Score</div>
                    <div className="font-medium text-slate-900 font-mono">{contact.contact_intelligence_score ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Added</div>
                    <div className="font-medium text-slate-900">{contact.created_at ? new Date(contact.created_at).toLocaleDateString() : "—"}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === "activity" && (
            <div>
              {activity === null && <div className="text-sm text-slate-500">Loading…</div>}
              {activity && activity.length === 0 && (
                <div className="text-sm text-slate-500 italic">No activity recorded yet. As you send campaigns and the contact engages, events land here.</div>
              )}
              {activity && activity.length > 0 && (
                <ul className="space-y-2">
                  {activity.map((e, i) => {
                    // metadata is a JSON column on lumen.communication_event.
                    // Try to parse and surface a short detail line.
                    let detail: string | null = null;
                    if (e.metadata) {
                      try {
                        const m = typeof e.metadata === "string" ? JSON.parse(e.metadata) : e.metadata;
                        detail = m?.subject || m?.body || m?.title || m?.summary || null;
                      } catch { /* keep null */ }
                    }
                    return (
                      <li key={i} className="flex items-start gap-3 border-l-2 border-slate-200 pl-3 py-1">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-slate-900 flex items-center gap-1.5">
                            <span>{e.event_type}</span>
                            {e.channel && <span className="text-[9px] uppercase font-bold px-1 py-px rounded bg-slate-200 text-slate-600">{e.channel}</span>}
                          </div>
                          {detail && <div className="text-[11px] text-slate-600 truncate">{detail}</div>}
                        </div>
                        <div className="text-[10px] text-slate-400 tabular-nums whitespace-nowrap">
                          {new Date(e.occurred_at).toLocaleString()}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {tab === "notes" && contact && (
            <div className="space-y-3">
              <div>
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add an internal note…"
                  rows={3}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-[#EF6C33] focus:outline-none focus:ring-1 focus:ring-[#EF6C33]"
                />
                <div className="mt-1 flex justify-end">
                  <button
                    onClick={addNote}
                    disabled={postingNote || !newNote.trim()}
                    className="text-xs px-3 py-1 rounded bg-[#EF6C33] text-white disabled:opacity-50 inline-flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" /> {postingNote ? "Adding…" : "Add note"}
                  </button>
                </div>
              </div>
              {contact.notes && contact.notes.length > 0 ? (
                <ul className="space-y-2">
                  {contact.notes.map((n) => (
                    <li key={n.id} className="rounded bg-slate-50 border border-slate-200 p-2.5">
                      <div className="text-xs text-slate-700 whitespace-pre-wrap">{n.content}</div>
                      <div className="mt-1 text-[10px] text-slate-400">
                        {n.author || "—"} · {new Date(n.created_at).toLocaleString()}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-slate-500 italic">No notes yet.</div>
              )}
            </div>
          )}

          {tab === "lists" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-2">Membership</h3>
                {lists === null ? (
                  <div className="text-sm text-slate-500">Loading…</div>
                ) : lists.length === 0 ? (
                  <div className="text-sm text-slate-500 italic">Not in any list.</div>
                ) : (
                  <ul className="space-y-1.5">
                    {lists.map((l) => (
                      <li key={l.id} className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-white p-2.5">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900 truncate">{l.name}</div>
                          {l.description && <div className="text-[11px] text-slate-500 truncate">{l.description}</div>}
                          <div className="text-[10px] text-slate-400">Added {new Date(l.added_at).toLocaleDateString()}</div>
                        </div>
                        <button
                          onClick={() => removeFromList(l.id)}
                          className="text-[11px] text-rose-600 hover:text-rose-700 inline-flex items-center gap-1"
                        >
                          <Trash2 className="h-3 w-3" /> Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-2">Add to a list</h3>
                <div className="flex items-center gap-2">
                  <select
                    value={pickerListId}
                    onChange={(e) => setPickerListId(e.target.value === "" ? "" : Number(e.target.value))}
                    className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm bg-white focus:border-[#EF6C33] focus:outline-none focus:ring-1 focus:ring-[#EF6C33]"
                  >
                    <option value="">— Pick a list —</option>
                    {availableLists
                      .filter((al) => !lists?.some((l) => l.id === al.id))
                      .map((l) => (
                        <option key={l.id} value={l.id}>{l.name}{l.contact_count != null ? ` (${l.contact_count})` : ""}</option>
                      ))}
                  </select>
                  <IadmButton
                    variant="accent"
                    product="spark"
                    onClick={addToList}
                    disabled={pickerListId === ""}
                    icon={<Plus className="h-3 w-3" />}
                  >
                    Add
                  </IadmButton>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Lists are static, manually-curated groups. Segments are dynamic (auto-updated by filter rules) — manage those on the Segments page.
                </p>
              </div>
            </div>
          )}

          {tab === "tags" && contact && (
            <div>
              {contact.tags && contact.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {contact.tags.map((t) => (
                    <span key={t.id} className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                      {t.name}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-slate-500 italic">No tags on this contact.</div>
              )}
              <p className="mt-3 text-[11px] text-slate-500">
                Manage tag taxonomy on the <a href="/app/services/spark_tags" className="text-[#EF6C33] hover:underline">Tags page</a> · auto-tag rules live under Workflow & Automations.
              </p>
            </div>
          )}

          {tab === "danger" && contact && (
            <div className="space-y-4">
              <div>
                <h3 className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-2">Communication preferences</h3>
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2"><span className={`inline-block w-2 h-2 rounded-full ${contact.email_unsubscribed ? "bg-rose-500" : "bg-emerald-500"}`} /> Email: <strong className={contact.email_unsubscribed ? "text-rose-700" : "text-emerald-700"}>{contact.email_unsubscribed ? "unsubscribed" : "active"}</strong></div>
                  <div className="flex items-center gap-2"><span className={`inline-block w-2 h-2 rounded-full ${contact.sms_unsubscribed ? "bg-rose-500" : "bg-emerald-500"}`} /> SMS: <strong className={contact.sms_unsubscribed ? "text-rose-700" : "text-emerald-700"}>{contact.sms_unsubscribed ? "unsubscribed" : "active"}</strong></div>
                  <div className="flex items-center gap-2"><span className={`inline-block w-2 h-2 rounded-full ${contact.email_invalid ? "bg-amber-500" : "bg-emerald-500"}`} /> Email validity: <strong className={contact.email_invalid ? "text-amber-700" : "text-emerald-700"}>{contact.email_invalid ? "invalid" : "ok"}</strong></div>
                </div>
              </div>
              <div className="rounded border border-rose-200 bg-rose-50 p-3">
                <h3 className="text-xs font-bold text-rose-800 mb-1 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> Danger zone
                </h3>
                <p className="text-[11px] text-rose-700 mb-2">
                  Soft-deletes the contact. Reversible from the trash for 30 days, then permanently purged.
                </p>
                <button
                  onClick={softDelete}
                  className="text-xs px-3 py-1.5 rounded bg-rose-600 text-white hover:bg-rose-700 inline-flex items-center gap-1"
                >
                  <Trash2 className="h-3 w-3" /> Delete contact
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </IadmModal>
  );
}

function Flag({ color, children }: { color: "rose" | "amber" | "emerald"; children: React.ReactNode }) {
  const colors = {
    rose: "bg-rose-50 border-rose-200 text-rose-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
  };
  return <div className={`text-xs rounded border px-2 py-1 ${colors[color]}`}>{children}</div>;
}

function Field({
  label, value, draft, editing, onChange, icon: Icon,
}: {
  label: string;
  value?: string | null;
  draft?: string | null;
  editing: boolean;
  onChange: (v: string) => void;
  icon?: typeof Mail;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase text-slate-500 font-semibold">{label}</div>
      {editing ? (
        <input
          value={draft ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-sm focus:border-[#EF6C33] focus:outline-none focus:ring-1 focus:ring-[#EF6C33]"
        />
      ) : (
        <div className="mt-0.5 flex items-center gap-1 text-sm text-slate-900">
          {Icon && <Icon className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />}
          <span className="truncate">{value || <span className="text-slate-400 italic">—</span>}</span>
        </div>
      )}
    </div>
  );
}

export default SparkContactModal;
