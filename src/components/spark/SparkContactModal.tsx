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
  Plus, X,
} from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { IadmModal, IadmButton } from "../IadmModal";
import { PhoneInput } from "../PhoneInput";

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
  // F5 — lumen.contact.lifecycle_stage + optimistic-concurrency version
  // (migration 110). Surfaced in the modal as a dropdown; legal options
  // come from GET /lifecycle/preset (tenant-level preset visible set).
  lifecycle_stage?: string | null;
  lifecycle_stage_version?: number;
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

  // Tag management (uses lumen-api bulk endpoints with single id)
  const [allTags, setAllTags] = useState<Array<{ id: number; name: string }>>([]);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [tagBusy, setTagBusy] = useState<null | "add" | "remove" | "create" | "inactive">(null);

  // F5 — Lifecycle dropdown. Preset + visible stage list come from
  // GET /api/v1/lifecycle/preset; stage change goes through POST
  // /api/v1/contacts/:id/lifecycle-stage (server enforces preset gating +
  // optimistic concurrency).
  const [lifecyclePreset, setLifecyclePreset] = useState<{ preset: string; stages: string[] } | null>(null);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);

  // #355 — Cascade delete preview. Fetched on demand when the user clicks
  // Delete. If the API returns counts (invoices/subs/proposals/docs), we render
  // an itemised confirm. If it returns {} (feature flag off or no linked oliver
  // rows) we fall back to the plain "reversible from trash" copy.
  interface CascadePreview {
    invoices?: number;
    subs?: number;
    proposals?: number;
    docs?: number;
    stripe_subs_to_cancel?: number;
  }
  const [cascadePreview, setCascadePreview] = useState<CascadePreview | null>(null);
  const [cascadePreviewOpen, setCascadePreviewOpen] = useState(false);
  const [cascadePreviewLoading, setCascadePreviewLoading] = useState(false);
  const [cascadeDeleting, setCascadeDeleting] = useState(false);

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

  // F5 — load the tenant's lifecycle preset once per open. The preset
  // determines which stages render as <option>s in the Lifecycle dropdown
  // (server also re-validates on POST so a stale local copy can't bypass).
  useEffect(() => {
    if (!open || !ready) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await get<{ data: { preset: string; stages: string[] } }>("/api/v1/lifecycle/preset");
        if (!cancelled) setLifecyclePreset(r.data);
      } catch {
        // Best-effort — if preset can't load we hide the dropdown rather than 500 the modal.
        if (!cancelled) setLifecyclePreset(null);
      }
    })();
    return () => { cancelled = true; };
  }, [open, ready, get]);

  async function setLifecycleStage(nextStage: string) {
    if (!contactId || !nextStage || nextStage === contact?.lifecycle_stage) return;
    setLifecycleBusy(true);
    try {
      await post(`/api/v1/contacts/${contactId}/lifecycle-stage`, { stage: nextStage });
      await reload();
      onChanged?.();
    } catch (err) {
      alert(`Lifecycle change failed: ${(err as Error)?.message || "unknown"}`);
    } finally {
      setLifecycleBusy(false);
    }
  }

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

  // #355 — Fetch cascade preview counts before showing the confirm modal.
  // If preview returns any non-zero count OR the endpoint is enabled at all,
  // we open the itemised cascade modal. Otherwise fall back to plain-copy
  // confirm modal (still an in-component overlay for consistency).
  async function softDelete() {
    if (!contactId || !contact) return;
    setCascadePreviewLoading(true);
    setCascadePreview(null);
    try {
      const r = await get<CascadePreview>(`/api/v1/contacts/${contactId}/archive-cascade/preview`);
      setCascadePreview(r || {});
    } catch {
      setCascadePreview({});
    } finally {
      setCascadePreviewLoading(false);
      setCascadePreviewOpen(true);
    }
  }

  async function confirmCascadeDelete() {
    if (!contactId) return;
    setCascadeDeleting(true);
    try {
      await del(`/api/v1/contacts/${contactId}`);
      setCascadePreviewOpen(false);
      onChanged?.();
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setCascadeDeleting(false);
    }
  }

  // ── Tag management — uses lumen-api bulk endpoints with single contact_id.
  // GET /tags → list / POST /tags { name } → create
  // POST /contacts/bulk/tag   { contact_ids: [id], tag_id }
  // POST /contacts/bulk/untag { contact_ids: [id], tag_id }
  const loadAllTags = useCallback(async () => {
    try {
      const r = await get<{ data: Array<{ id: number; name: string }> }>("/api/v1/tags");
      setAllTags((r as { data?: Array<{ id: number; name: string }> })?.data || []);
    } catch { /* tolerate empty */ }
  }, [get]);

  async function addTag(tagId: number) {
    if (!contactId) return;
    setTagBusy("add");
    try {
      await post("/api/v1/contacts/bulk/tag", { contact_ids: [contactId], tag_id: tagId });
      setTagPickerOpen(false);
      await reload();
    } catch (err) { alert(`Add tag failed: ${(err as Error)?.message || "unknown"}`); }
    finally { setTagBusy(null); }
  }

  async function createAndAddTag() {
    const name = newTagName.trim();
    if (!name || !contactId) return;
    setTagBusy("create");
    try {
      const created = await post<{ data: { id: number; name: string } }>("/api/v1/tags", { name });
      const tagId = (created as { data?: { id: number } })?.data?.id;
      if (!tagId) throw new Error("Tag create returned no id");
      setAllTags((tags) => [...tags, { id: tagId, name }]);
      setNewTagName("");
      await post("/api/v1/contacts/bulk/tag", { contact_ids: [contactId], tag_id: tagId });
      setTagPickerOpen(false);
      await reload();
    } catch (err) { alert(`Create tag failed: ${(err as Error)?.message || "unknown"}`); }
    finally { setTagBusy(null); }
  }

  async function removeTag(tagId: number) {
    if (!contactId) return;
    setTagBusy("remove");
    try {
      await post("/api/v1/contacts/bulk/untag", { contact_ids: [contactId], tag_id: tagId });
      await reload();
    } catch (err) { alert(`Remove tag failed: ${(err as Error)?.message || "unknown"}`); }
    finally { setTagBusy(null); }
  }

  async function markInactive() {
    if (!contactId) return;
    setTagBusy("inactive");
    try {
      // Ensure tag exists.
      if (!allTags.length) await loadAllTags();
      let tag = allTags.find((t) => t.name.toLowerCase() === "inactive");
      if (!tag) {
        const created = await post<{ data: { id: number; name: string } }>("/api/v1/tags", { name: "inactive" });
        const id = (created as { data?: { id: number } })?.data?.id;
        if (!id) throw new Error("Could not create 'inactive' tag");
        tag = { id, name: "inactive" };
        setAllTags((tags) => [...tags, tag!]);
      }
      // Apply only if not already tagged.
      const already = contact?.tags?.some((t) => t.id === tag!.id);
      if (!already) {
        await post("/api/v1/contacts/bulk/tag", { contact_ids: [contactId], tag_id: tag.id });
        await reload();
      }
    } catch (err) { alert(`Mark inactive failed: ${(err as Error)?.message || "unknown"}`); }
    finally { setTagBusy(null); }
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
            // G4-S2: renamed 'More' → 'Delete' for discoverability. Position kept last (danger zone convention).
            { key: "danger",   label: "Delete", icon: AlertTriangle },
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
                    onChange={(v) => setDraft({ ...draft, phone: v })} draft={draft.phone}
                    as="phone" />
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

              {/* F5 — Lifecycle dropdown (Brandon LOCK 2026-06-25). The
                  visible stage list is gated by the tenant's preset; LUMEN
                  enforces preset gating + optimistic-concurrency on POST. */}
              {lifecyclePreset && (
                <div>
                  <h3 className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-2 flex items-center gap-1">
                    <ActivityIcon className="h-3 w-3" /> Lifecycle
                  </h3>
                  <div className="flex items-center gap-2">
                    <select
                      value={contact.lifecycle_stage || ""}
                      onChange={(e) => setLifecycleStage(e.target.value)}
                      disabled={lifecycleBusy}
                      className="text-xs px-2 py-1 rounded-md border border-slate-300 bg-white text-slate-800 disabled:opacity-40 capitalize"
                    >
                      {!contact.lifecycle_stage && <option value="">— unset —</option>}
                      {lifecyclePreset.stages.map((s) => (
                        <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                      ))}
                      {/* If the persisted stage isn't in the preset's visible
                          set (a cutover edge case) render it as a read-only
                          option so the dropdown shows the truth without
                          forcing a save. */}
                      {contact.lifecycle_stage && !lifecyclePreset.stages.includes(contact.lifecycle_stage) && (
                        <option value={contact.lifecycle_stage}>
                          {contact.lifecycle_stage.replace(/_/g, " ")} (outside preset)
                        </option>
                      )}
                    </select>
                    <span className="text-[10px] uppercase text-slate-400 tracking-wider">
                      preset: {lifecyclePreset.preset}
                    </span>
                    {lifecycleBusy && <span className="text-[10px] text-slate-500">Saving…</span>}
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
            <div className="space-y-3">
              {/* Quick actions */}
              <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
                <button
                  onClick={markInactive}
                  disabled={tagBusy !== null}
                  className="text-xs px-3 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 inline-flex items-center gap-1 disabled:opacity-50"
                  title="Apply the 'inactive' tag (creates it if missing)"
                >
                  {tagBusy === "inactive" ? "Marking…" : "Mark inactive"}
                </button>
                <button
                  onClick={() => { setTagPickerOpen((v) => !v); if (!allTags.length) loadAllTags(); }}
                  disabled={tagBusy !== null}
                  className="text-xs px-3 py-1.5 rounded bg-[#EF6C33] text-white hover:bg-[#d85a25] inline-flex items-center gap-1 disabled:opacity-50"
                >
                  <TagIcon className="h-3 w-3" /> Add tag
                </button>
              </div>

              {/* Active tags with remove button each */}
              <div>
                <div className="text-[10px] uppercase font-semibold text-slate-500 mb-1">Active tags</div>
                {contact.tags && contact.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {contact.tags.map((t) => (
                      <span key={t.id} className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200 inline-flex items-center gap-1">
                        {t.name}
                        <button
                          onClick={() => removeTag(t.id)}
                          disabled={tagBusy !== null}
                          className="hover:bg-rose-100 hover:text-rose-700 rounded p-0.5 disabled:opacity-50"
                          title={`Remove "${t.name}"`}
                          aria-label={`Remove tag ${t.name}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500 italic">No tags on this contact.</div>
                )}
              </div>

              {/* Tag picker */}
              {tagPickerOpen && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                  <div className="text-[10px] uppercase font-semibold text-slate-500">Pick a tag</div>
                  <div className="max-h-40 overflow-auto space-y-0.5">
                    {allTags.length === 0 ? (
                      <div className="text-xs text-slate-500 italic">No tags exist yet. Create one below.</div>
                    ) : (
                      allTags
                        .filter((t) => !contact.tags?.some((ct) => ct.id === t.id))
                        .map((t) => (
                          <button
                            key={t.id}
                            onClick={() => addTag(t.id)}
                            disabled={tagBusy !== null}
                            className="w-full text-left px-2 py-1 rounded text-xs hover:bg-orange-50 hover:text-orange-900 disabled:opacity-50"
                          >
                            {t.name}
                          </button>
                        ))
                    )}
                  </div>
                  <div className="pt-2 border-t border-slate-200">
                    <div className="text-[10px] uppercase font-semibold text-slate-500 mb-1">Create new tag</div>
                    <div className="flex gap-1">
                      <input
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        placeholder="Tag name"
                        className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
                        onKeyDown={(e) => { if (e.key === "Enter") createAndAddTag(); }}
                      />
                      <button
                        onClick={createAndAddTag}
                        disabled={!newTagName.trim() || tagBusy !== null}
                        className="px-2 py-1 rounded text-[10px] font-semibold bg-orange-500 text-white disabled:opacity-40"
                      >
                        {tagBusy === "create" ? "Creating…" : "Create + add"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <p className="text-[11px] text-slate-500">
                Manage tag taxonomy + auto-tag rules on the <a href="/app/services/spark_tags" className="text-[#EF6C33] hover:underline">Tags page</a>.
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

        {/* #355 — cascade-delete confirm overlay. Plain inline overlay
             (no extra dep) shown on top of the modal body. Copy varies by
             whether the preview endpoint returned counts. */}
        {cascadePreviewOpen && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <div className="w-full max-w-md rounded-lg bg-white shadow-xl ring-1 ring-slate-200">
              <div className="border-b border-slate-200 px-4 py-3">
                <div className="flex items-center gap-2 text-rose-700">
                  <AlertTriangle className="h-4 w-4" />
                  <h3 className="text-sm font-semibold">Delete {fullName}?</h3>
                </div>
              </div>
              <div className="px-4 py-4 text-sm text-slate-700">
                {cascadePreviewLoading ? (
                  <div className="text-slate-500">Checking linked records…</div>
                ) : cascadePreview && (
                  (cascadePreview.invoices || cascadePreview.subs || cascadePreview.proposals || cascadePreview.docs)
                    ? (
                      <div className="space-y-2">
                        <p>This will archive:</p>
                        <ul className="ml-4 list-disc space-y-0.5 text-slate-700">
                          {!!cascadePreview.invoices && <li>{cascadePreview.invoices} invoice{cascadePreview.invoices === 1 ? "" : "s"}</li>}
                          {!!cascadePreview.subs && (
                            <li>
                              {cascadePreview.subs} subscription{cascadePreview.subs === 1 ? "" : "s"}
                              {!!cascadePreview.stripe_subs_to_cancel && (
                                <> ({cascadePreview.stripe_subs_to_cancel} Stripe sub{cascadePreview.stripe_subs_to_cancel === 1 ? "" : "s"} will be cancelled at period end)</>
                              )}
                            </li>
                          )}
                          {!!cascadePreview.proposals && <li>{cascadePreview.proposals} proposal{cascadePreview.proposals === 1 ? "" : "s"}</li>}
                          {!!cascadePreview.docs && <li>{cascadePreview.docs} consulting doc{cascadePreview.docs === 1 ? "" : "s"}</li>}
                        </ul>
                        <p className="text-xs text-slate-500">Reversible from trash for 30 days.</p>
                      </div>
                    )
                    : (
                      <p>Delete this contact? Reversible from trash for 30 days.</p>
                    )
                )}
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
                <IadmButton
                  variant="ghost"
                  onClick={() => setCascadePreviewOpen(false)}
                  disabled={cascadeDeleting}
                >
                  Cancel
                </IadmButton>
                <IadmButton
                  variant="primary"
                  onClick={confirmCascadeDelete}
                  disabled={cascadeDeleting || cascadePreviewLoading}
                >
                  {cascadeDeleting ? "Deleting…" : "Confirm delete"}
                </IadmButton>
              </div>
            </div>
          </div>
        )}
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
  as,
}: {
  label: string;
  value?: string | null;
  draft?: string | null;
  editing: boolean;
  onChange: (v: string) => void;
  icon?: typeof Mail;
  /** 2026-06-28 (#245) — render PhoneInput for phone fields so input
      auto-formats to (XXX) XXX-XXXX as the user types. */
  as?: "phone";
}) {
  const editingClassName =
    "mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-sm focus:border-[#EF6C33] focus:outline-none focus:ring-1 focus:ring-[#EF6C33]";
  return (
    <div>
      <div className="text-[10px] uppercase text-slate-500 font-semibold">{label}</div>
      {editing ? (
        as === "phone" ? (
          <PhoneInput
            value={draft ?? ""}
            onChange={(v) => onChange(v)}
            className={editingClassName}
          />
        ) : (
          <input
            value={draft ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className={editingClassName}
          />
        )
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
