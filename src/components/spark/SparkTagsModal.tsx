// SparkTagsModal — manage tags from where you actually think about them.
//
// Tags had their own nav page that could only CREATE. No rename, no delete, no
// merge — though the API supported all three — and no sense of how many people
// carried each one. Founder 2026-08-19: "I'd just put a Tags button on the
// CRM>Contacts page and that brings up the Tags Modal... they can edit current
// tags, create a new tag, delete tags, etc."
//
// That is the right home. Contacts is where you are standing when a tag
// question occurs to you, and SPARK's nav needs cutting rather than growing.
//
// WHY THERE IS NO "TRIGGER" FIELD ON A TAG
// ---------------------------------------
// The natural next thought is "let me set here what causes this tag" — and no
// serious CRM does that. Mailchimp, HubSpot, Klaviyo and ActiveCampaign all
// keep a tag as a dumb label and put "apply these tags" on the SOURCE: the
// form, the journey step, the import.
//
// The reason is direction. A tag gets applied from many places. Put the
// trigger on the tag and you open "Newsletter" to find a pile of unrelated
// triggers, and STILL cannot answer "what does my newsletter form do?" without
// opening every tag to check. Source-owns-the-mapping means the form is
// self-describing: open it, see what it adds.
//
// What people genuinely need from the tag side is the read-only inverse —
// "where does this come from" — which is what the Used by panel below is for.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Merge, Check, X, AlertTriangle, Lock, Users, Search } from "lucide-react";
import { IadmModal, IadmButton } from "../IadmModal";

const SPARK_ORANGE = "#EF6C33";

// A small, legible palette. Free colour choice produces twelve indistinguishable
// greys within a month; a fixed set keeps a tag list scannable.
const COLORS = [
  { name: "Orange", value: "#EF6C33" },
  { name: "Blue",   value: "#2563EB" },
  { name: "Green",  value: "#059669" },
  { name: "Purple", value: "#7C3AED" },
  { name: "Rose",   value: "#E11D48" },
  { name: "Amber",  value: "#D97706" },
  { name: "Slate",  value: "#475569" },
];

export interface SparkTag {
  id: number;
  name: string;
  color?: string | null;
  category?: string | null;
  is_system?: boolean;
  contact_count?: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  get: <T>(p: string) => Promise<T>;
  post: <T>(p: string, body?: unknown) => Promise<T>;
  put: <T>(p: string, body?: unknown) => Promise<T>;
  del: <T>(p: string) => Promise<T>;
  ready: boolean;
  /** Fired whenever tags changed, so the contact list can refresh its chips. */
  onChanged?: () => void;
}

export function SparkTagsModal({ open, onClose, get, post, put, del, ready, onChanged }: Props) {
  const [tags, setTags] = useState<SparkTag[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(COLORS[0].value);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");

  const [mergingId, setMergingId] = useState<number | null>(null);
  const [mergeInto, setMergeInto] = useState<number | "">("");

  const load = useCallback(async () => {
    if (!ready) return;
    try {
      const r = await get<{ data: SparkTag[] }>("/api/v1/tags");
      setTags(r.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tags could not be loaded.");
      setTags([]);
    }
  }, [get, ready]);

  useEffect(() => { if (open) { load(); setError(null); } }, [open, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = tags || [];
    return q ? list.filter((t) => t.name.toLowerCase().includes(q)) : list;
  }, [tags, query]);

  // Near-duplicates are the reason merge exists, so point them out rather than
  // waiting for someone to notice "VIP" and "vip" sitting two rows apart.
  const duplicateNames = useMemo(() => {
    const seen = new Map<string, number>();
    for (const t of tags || []) {
      const k = t.name.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
      seen.set(k, (seen.get(k) || 0) + 1);
    }
    return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k));
  }, [tags]);
  const isDuplicate = (t: SparkTag) =>
    duplicateNames.has(t.name.trim().toLowerCase().replace(/[^a-z0-9]/g, ""));

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try {
      await fn();
      await load();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  const create = () => run(async () => {
    await post("/api/v1/tags", { name: newName.trim(), color: newColor });
    setNewName(""); setCreating(false);
  });

  const saveEdit = (id: number) => run(async () => {
    await put(`/api/v1/tags/${id}`, { name: editName.trim(), color: editColor });
    setEditingId(null);
  });

  const remove = (t: SparkTag) => {
    const n = t.contact_count || 0;
    if (!confirm(
      n
        ? `Delete "${t.name}"? It will be removed from ${n} contact${n === 1 ? "" : "s"}. The contacts themselves are not affected.`
        : `Delete "${t.name}"?`
    )) return;
    return run(async () => { await del(`/api/v1/tags/${t.id}`); });
  };

  const merge = (from: SparkTag) => run(async () => {
    await post(`/api/v1/tags/${from.id}/merge`, { into_tag_id: Number(mergeInto) });
    setMergingId(null); setMergeInto("");
  });

  if (!open) return null;

  return (
    <IadmModal
      open={open}
      onClose={onClose}
      product="spark"
      eyebrow="SPARK · CONTACTS"
      title="Tags"
      subtitle="A tag is a fact about a person — newsletter subscriber, VIP, OLIVER client."
      size="info"
      footer={
        <>
          <button
            onClick={() => { setCreating(true); setMergingId(null); setEditingId(null); }}
            className="mr-auto inline-flex items-center gap-1 text-xs font-medium hover:underline"
            style={{ color: SPARK_ORANGE }}
          >
            <Plus className="h-3 w-3" /> New tag
          </button>
          <IadmButton variant="ghost" onClick={onClose}>Done</IadmButton>
        </>
      }
    >
      <div className="flex h-full flex-col p-5">
        {error && (
          <div className="mb-3 flex items-start gap-2 rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
            <AlertTriangle className="mt-px h-3.5 w-3.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {creating && (
          <div className="mb-3 rounded-lg border p-3" style={{ borderColor: `${SPARK_ORANGE}66`, backgroundColor: `${SPARK_ORANGE}0D` }}>
            <div className="text-sm font-medium text-slate-800">New tag</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) { e.preventDefault(); create(); } }}
                placeholder="Newsletter subscriber"
                className="min-w-[14rem] flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
              />
              <ColorPicker value={newColor} onChange={setNewColor} />
              <IadmButton variant="accent" product="spark" onClick={create} disabled={busy || !newName.trim()}>
                Create
              </IadmButton>
              <button onClick={() => { setCreating(false); setNewName(""); }} className="text-xs text-slate-500 hover:text-slate-700">
                Cancel
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">
              Tags are for facts that only <em>some</em> contacts have. If every contact would
              need a value, it belongs on the contact as a field instead.
            </p>
          </div>
        )}

        {(tags?.length ?? 0) > 8 && (
          <div className="mb-2 flex items-center gap-1.5 rounded border border-slate-300 px-2 py-1">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a tag"
              className="w-full border-0 text-xs outline-none"
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {tags === null && <div className="text-sm text-slate-500">Loading…</div>}

          {tags !== null && !tags.length && !creating && (
            <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center">
              <p className="text-sm font-medium text-slate-700">No tags yet</p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
                Tags mark a fact about someone — newsletter subscriber, VIP, came from the
                golf outing. Segments and campaigns can then target them.
              </p>
            </div>
          )}

          {filtered.map((t) => (
            <div key={t.id} className="border-b border-slate-100 py-2">
              {editingId === t.id ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveEdit(t.id); } }}
                    className="min-w-[12rem] flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
                  />
                  <ColorPicker value={editColor} onChange={setEditColor} />
                  <button onClick={() => saveEdit(t.id)} disabled={busy} className="p-1 text-emerald-600 hover:text-emerald-700" title="Save">
                    <Check className="h-4 w-4" />
                  </button>
                  <button onClick={() => setEditingId(null)} className="p-1 text-slate-400 hover:text-slate-600" title="Cancel">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : mergingId === t.id ? (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-slate-600">Merge <strong>{t.name}</strong> into</span>
                  <select
                    value={mergeInto}
                    onChange={(e) => setMergeInto(Number(e.target.value))}
                    className="rounded border border-slate-300 px-2 py-1 text-xs"
                  >
                    <option value="">Choose a tag…</option>
                    {(tags || []).filter((x) => x.id !== t.id).map((x) => (
                      <option key={x.id} value={x.id}>{x.name}</option>
                    ))}
                  </select>
                  <IadmButton variant="accent" product="spark" onClick={() => merge(t)} disabled={busy || !mergeInto}>
                    Merge
                  </IadmButton>
                  <button onClick={() => { setMergingId(null); setMergeInto(""); }} className="text-slate-500 hover:text-slate-700">
                    Cancel
                  </button>
                  <span className="basis-full text-[11px] text-slate-500">
                    Everyone tagged <strong>{t.name}</strong> keeps the tag they are merged into.
                    <strong> {t.name}</strong> is then deleted.
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{ color: t.color || SPARK_ORANGE, backgroundColor: `${t.color || SPARK_ORANGE}1A` }}
                  >
                    {t.is_system && <Lock className="h-2.5 w-2.5" />}
                    {t.name}
                  </span>
                  {isDuplicate(t) && (
                    <span className="text-[10px] text-amber-600" title="Another tag has almost the same name — consider merging them">
                      possible duplicate
                    </span>
                  )}
                  <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-slate-500">
                    <Users className="h-3 w-3" /> {(t.contact_count ?? 0).toLocaleString()}
                  </span>
                  {t.is_system ? (
                    <span className="text-[10px] italic text-slate-400" title="Applied automatically by the platform">
                      managed
                    </span>
                  ) : (
                    <>
                      <button
                        onClick={() => { setEditingId(t.id); setEditName(t.name); setEditColor(t.color || SPARK_ORANGE); setMergingId(null); }}
                        className="text-[11px] text-slate-500 hover:text-slate-800"
                      >
                        Rename
                      </button>
                      <button
                        onClick={() => { setMergingId(t.id); setMergeInto(""); setEditingId(null); }}
                        title="Fold this tag into another"
                        className="p-1 text-slate-400 hover:text-slate-700"
                      >
                        <Merge className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => remove(t)} title="Delete" className="p-1 text-slate-400 hover:text-rose-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <p className="mt-3 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
          What <em>applies</em> a tag is set where it happens — on the form, or as a step in a
          journey — not here. That way one form tells you everything it does.
        </p>
      </div>
    </IadmModal>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      {COLORS.map((c) => (
        <button
          key={c.value}
          onClick={() => onChange(c.value)}
          title={c.name}
          aria-label={c.name}
          aria-pressed={value === c.value}
          className={`h-5 w-5 rounded-full border-2 transition-transform ${
            value === c.value ? "scale-110 border-slate-700" : "border-transparent"
          }`}
          style={{ backgroundColor: c.value }}
        />
      ))}
    </div>
  );
}
