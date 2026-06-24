// SparkSignaturesPage — CRUD UI for /api/v1/signatures (LUMEN-API track building it).
//
// A signature is a named block of prose appended to the bottom of an email
// body. The SPARK Composer v1.1 Signature picker reads from this list.
//
// Body input is plain prose / rich-text via the shared SparkBodyEditor
// component (composer track is building it). NEVER raw HTML or markdown
// exposed to the user.
//
// Locked 2026-06-24: signatures live in lumen.spark_signature; default
// signature surfaces in onboarding-1.0.0 IA welcome emails as the
// hardcoded simplified value, replaced by tenant signatures once SPARK
// Composer v1.1 ships.
import { useCallback, useEffect, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { IadmModal, IadmButton } from "../../components/IadmModal";
import { SparkBodyEditor } from "../../components/spark/SparkBodyEditor";
import { Plus, Star, Trash2, Pencil } from "lucide-react";

interface Signature {
  id: number;
  name: string;
  body: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
}

interface SignatureForm {
  id?: number;
  name: string;
  body: string;
  is_default: boolean;
}

const EMPTY_FORM: SignatureForm = { name: "", body: "", is_default: false };

function previewSnippet(body: string): string {
  // SparkBodyEditor stores sanitised HTML; strip tags + whitespace + clip
  // for the at-a-glance preview column.
  const oneLine = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (oneLine.length <= 80) return oneLine;
  return oneLine.slice(0, 77) + "…";
}

export function SparkSignaturesPage() {
  const { get, post, put, del, ready } = useSparkApi();
  const [list, setList] = useState<Signature[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<SignatureForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const fetchList = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<{ data: Signature[] }>("/api/v1/signatures");
      setList(r?.data || []);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready]);

  useEffect(() => { fetchList(); }, [fetchList]);

  function openAdd() {
    setForm({ ...EMPTY_FORM, is_default: list.length === 0 });
    setModalOpen(true);
  }

  function openEdit(s: Signature) {
    setForm({ id: s.id, name: s.name, body: s.body, is_default: s.is_default });
    setModalOpen(true);
  }

  async function save() {
    if (!form.name.trim() || !form.body.trim()) return;
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        body: form.body,
        is_default: form.is_default,
      };
      if (form.id) {
        await put(`/api/v1/signatures/${form.id}`, body);
      } else {
        await post("/api/v1/signatures", body);
      }
      setModalOpen(false);
      await fetchList();
    } catch (err) {
      alert(`Save failed: ${(err as Error).message}`);
    } finally { setSaving(false); }
  }

  async function setDefault(id: number) {
    try {
      await post(`/api/v1/signatures/${id}/default`, {});
      await fetchList();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function remove(id: number) {
    if (!confirm("Delete this signature? Campaigns using it will fall back to the default.")) return;
    try {
      await del(`/api/v1/signatures/${id}`);
      await fetchList();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  const canSave = !!form.name.trim() && !!form.body.trim();

  return (
    <SparkPageShell
      title="Signatures"
      subtitle={`${list.length} signature${list.length === 1 ? "" : "s"}`}
      help={
        <>
          A <strong>signature</strong> is a reusable closing block (e.g. "Thanks, the Acme Team") that
          you can pick from the SPARK Composer Signature dropdown. The default signature is appended
          whenever a campaign doesn't specify one.
        </>
      }
      actions={
        <button
          onClick={openAdd}
          className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white flex items-center gap-1"
        >
          <Plus className="h-4 w-4" /> Add signature
        </button>
      }
      loading={loading}
      error={error}
    >
      <div className="border border-slate-200 rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="text-left p-2 font-semibold">Name</th>
              <th className="text-left p-2 font-semibold">Preview</th>
              <th className="text-center p-2 font-semibold">Default</th>
              <th className="text-right p-2 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr><td colSpan={4} className="p-6 text-center text-slate-500">
                No signatures yet. Click "Add signature" to create your first one.
              </td></tr>
            )}
            {list.map(s => (
              <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="p-2 font-medium text-slate-900">{s.name}</td>
                <td className="p-2 text-slate-600 text-xs italic">{previewSnippet(s.body)}</td>
                <td className="p-2 text-center">
                  {s.is_default && <Star className="h-4 w-4 text-[#EF6C33] inline" />}
                </td>
                <td className="p-2">
                  <div className="flex items-center justify-end gap-1">
                    {!s.is_default && (
                      <button
                        onClick={() => setDefault(s.id)}
                        className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center gap-1"
                      >
                        <Star className="h-3 w-3" /> Set default
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(s)}
                      className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center gap-1"
                    >
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                    <button
                      onClick={() => remove(s.id)}
                      className="text-xs px-2 py-1 rounded text-rose-600 hover:bg-rose-50 flex items-center gap-1"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <IadmModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        product="spark"
        size="info"
        title={form.id ? "Edit signature" : "Add signature"}
        subtitle="Reusable closing block — picked from the SPARK Composer Signature dropdown."
        footer={
          <>
            <IadmButton variant="ghost" onClick={() => setModalOpen(false)}>Cancel</IadmButton>
            <IadmButton
              variant="accent"
              product="spark"
              onClick={save}
              disabled={!canSave || saving}
            >
              {saving ? "Saving…" : form.id ? "Save changes" : "Create signature"}
            </IadmButton>
          </>
        }
      >
        <div className="p-5 grid grid-cols-2 gap-4">
          <div className="space-y-4">
            <Labeled label="Name" hint="Internal label so you can pick this signature later (e.g. 'Friendly', 'Formal').">
              <input
                value={form.name}
                placeholder="Friendly closer"
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]"
              />
            </Labeled>
            <Labeled label="Body" hint="Plain prose. Use merge tags like {{first name}} or {{business name}}.">
              <SparkBodyEditor
                value={form.body}
                onChange={(html) => setForm({ ...form, body: html })}
                minHeight={180}
                placeholder={"Thanks, the {{business name}} team"}
              />
            </Labeled>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.is_default}
                onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
                className="accent-[#EF6C33]"
              />
              Set as default signature
            </label>
          </div>

          <div className="space-y-2">
            <div className="text-[10px] uppercase font-semibold text-slate-500">Live preview</div>
            <div className="rounded border border-slate-200 bg-slate-50 p-4 min-h-[220px] text-sm text-slate-800">
              {form.body.trim() ? (
                // SparkBodyEditor produces sanitised HTML — render as-is so
                // the writer sees their formatting (bold/links/lists) in
                // the preview pane.
                <div dangerouslySetInnerHTML={{ __html: form.body }} />
              ) : (
                <span className="text-slate-400 italic">Your signature appears here as recipients will see it.</span>
              )}
            </div>
            <div className="text-[11px] text-slate-500">
              Merge tags render with sample values in the composer. Use natural-language tag names like{" "}
              <code>{`{{first name}}`}</code> — not schema names.
            </div>
          </div>
        </div>
      </IadmModal>
    </SparkPageShell>
  );
}

function Labeled({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">{label}</label>
      <div className="mt-0.5">{children}</div>
      {hint && <div className="text-[11px] text-slate-500 mt-0.5">{hint}</div>}
    </div>
  );
}

export default SparkSignaturesPage;
