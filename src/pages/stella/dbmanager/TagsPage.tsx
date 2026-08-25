// TagsPage — tag CRUD plus the assignment browser.
//
// Tags are first-class filter fields elsewhere in STELLA, so the important
// thing this page shows is not the tag list but WHAT each tag is on. Deleting
// a tag removes its assignments too, and the confirm says so.
import { useCallback, useEffect, useState } from "react";
import { Tag as TagIcon, Trash2, Plus } from "lucide-react";
import { StellaShell, STELLA_INDIGO, STELLA_LAVENDER } from "../StellaShell";
import { useStellaApi } from "../../../hooks/useStellaApi";
import {
  DbCard, DbError, DbLoading, DbButton, DbInput, DbField, DbEmpty,
  DbNotice, useNotice, Pill, DbModal, DbTable,
} from "./DbManagerKit";

type Tag = {
  tag_id: string; name: string; color: string | null; scope: string | null;
  assigned_count: number; created_at: string;
};
type Assignment = {
  tag_assignment_id: string; tag_id: string; target_schema: string;
  target_table: string; target_id: string; tag_name: string; tag_color: string | null;
};

export function StellaTagsPage() {
  const api = useStellaApi();
  const [tags, setTags] = useState<Tag[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [notice, showNotice] = useNotice();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#4C5BD4");
  const [busy, setBusy] = useState(false);
  const [inspect, setInspect] = useState<Tag | null>(null);
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);

  const load = useCallback(() => {
    if (!api.ready) return;
    api.get<Tag[]>("/db-manager/tags").then(setTags).catch(setError);
  }, [api]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!inspect || !api.ready) { setAssignments(null); return; }
    api.get<Assignment[]>("/db-manager/tag-assignments")
      .then((rows) => setAssignments(rows.filter((a) => a.tag_id === inspect.tag_id)))
      .catch(setError);
  }, [inspect, api]);

  async function create() {
    if (!name.trim()) return;
    setBusy(true); setError(null);
    try {
      await api.post<Tag>("/db-manager/tags", { name: name.trim(), color });
      showNotice(`Tag “${name.trim()}” is ready to use.`);
      setName(""); setCreating(false); load();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  async function remove(t: Tag) {
    const extra = t.assigned_count > 0
      ? ` It is currently on ${t.assigned_count} row${t.assigned_count === 1 ? "" : "s"}, and will be removed from ${t.assigned_count === 1 ? "it" : "them"}.`
      : "";
    if (!window.confirm(`Delete the tag “${t.name}”?${extra}`)) return;
    setBusy(true); setError(null);
    try {
      await api.del(`/db-manager/tags/${t.tag_id}`);
      showNotice(`Deleted “${t.name}”.`);
      setInspect(null); load();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  async function unassign(a: Assignment) {
    setBusy(true);
    try {
      await api.del(`/db-manager/tag-assignments/${a.tag_assignment_id}`);
      setAssignments((prev) => prev?.filter((x) => x.tag_assignment_id !== a.tag_assignment_id) ?? null);
      load();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  if (error && !tags) {
    return <StellaShell title="Tags" subtitle="Label anything in your books."><DbError error={error} /></StellaShell>;
  }

  return (
    <StellaShell
      title="Tags"
      subtitle="Label transactions, vendors, accounts and documents — then filter and report on those labels."
      actions={<DbButton onClick={() => setCreating(true)}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Plus size={13} /> New tag</span>
      </DbButton>}
    >
      <DbNotice text={notice} />
      <DbError error={error} />

      <DbCard>
        {!tags ? <DbLoading /> : tags.length === 0 ? (
          <DbEmpty
            title="No tags yet"
            reason="Tags let you group things your chart of accounts doesn't — a property, a crew, a grant, a season. Create one and it becomes a filter everywhere."
          />
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {tags.map((t) => (
              <div key={t.tag_id} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 8,
              }}>
                <span style={{
                  width: 12, height: 12, borderRadius: 3, flexShrink: 0,
                  background: t.color || STELLA_INDIGO,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0B1C24" }}>{t.name}</div>
                  {t.scope && <div style={{ fontSize: 10, color: "#94A3B8" }}>{t.scope}</div>}
                </div>
                <Pill tone={t.assigned_count ? "brand" : "neutral"}>
                  {t.assigned_count} {t.assigned_count === 1 ? "row" : "rows"}
                </Pill>
                <DbButton variant="ghost" onClick={() => setInspect(t)}>See where</DbButton>
                <DbButton variant="danger" onClick={() => remove(t)} disabled={busy} title="Delete tag">
                  <Trash2 size={13} />
                </DbButton>
              </div>
            ))}
          </div>
        )}
      </DbCard>

      {creating && (
        <DbModal title="New tag" onClose={() => setCreating(false)} width={420}>
          <div style={{ display: "grid", gap: 12 }}>
            <DbField label="Name">
              <DbInput
                value={name} autoFocus maxLength={120}
                placeholder="e.g. Grant — Community Fund"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") create(); }}
              />
            </DbField>
            <DbField label="Colour">
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                style={{ width: 60, height: 32, border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 7, background: "#fff" }} />
            </DbField>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <DbButton onClick={create} disabled={busy || !name.trim()}>{busy ? "Saving…" : "Create tag"}</DbButton>
              <DbButton variant="ghost" onClick={() => setCreating(false)}>Cancel</DbButton>
            </div>
          </div>
        </DbModal>
      )}

      {inspect && (
        <DbModal title={`“${inspect.name}” is on…`} onClose={() => setInspect(null)} width={620}>
          {!assignments ? <DbLoading /> : assignments.length === 0 ? (
            <DbEmpty
              title="Not applied to anything yet"
              reason="Open a transaction, vendor or document and add this tag from there."
            />
          ) : (
            <DbTable
              columns={[
                { key: "target_table", label: "Kind" },
                { key: "target_id", label: "Row", type: "guid" },
                { key: "action", label: "" },
              ]}
              rows={assignments.map((a) => ({
                ...a,
                target_table: <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <TagIcon size={11} color={a.tag_color || STELLA_INDIGO} />
                  {a.target_table.replace(/[[\]]/g, "")}
                </span>,
                action: <DbButton variant="ghost" onClick={() => unassign(a)} disabled={busy}>Remove</DbButton>,
              })) as never}
            />
          )}
        </DbModal>
      )}
    </StellaShell>
  );
}
