// SparkContactBulkPage — Bulk operations on a list of contact IDs (v2.6).
//
// Paste contact IDs (one per line or comma-separated) and apply a single
// operation: set locale, add/remove tag, add to list, opt-out SMS, soft-delete.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Users, Tag, List as ListIcon, Globe2, MessageSquare, Trash2, Play, Check } from "lucide-react";

type Op = "locale" | "tag" | "untag" | "list-add" | "opt-out-sms" | "delete";

interface Tag { id: number; name: string; color: string | null; }
interface ListRow { id: number; name: string; }

const COMMON_LOCALES = [
  "en-US", "es-US", "es-MX", "fr-CA", "fr-FR", "de-DE", "pt-BR", "it-IT", "zh-CN", "ja-JP",
];

export function SparkContactBulkPage() {
  const { get, post, ready } = useSparkApi();
  const [op, setOp] = useState<Op>("locale");
  const [idsRaw, setIdsRaw] = useState("");
  const [locale, setLocale] = useState("en-US");
  const [tagId, setTagId] = useState<number | null>(null);
  const [listId, setListId] = useState<number | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [lists, setLists] = useState<ListRow[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const fetchLookups = useCallback(async () => {
    if (!ready) return;
    try {
      const [t, l] = await Promise.all([
        get<{ data: Tag[] }>("/api/v1/tags").catch(() => ({ data: [] })),
        get<{ data: ListRow[] }>("/api/v1/lists").catch(() => ({ data: [] })),
      ]);
      setTags(t?.data || []);
      setLists(l?.data || []);
    } catch { /* swallow */ }
  }, [get, ready]);
  useEffect(() => { fetchLookups(); }, [fetchLookups]);

  const ids = useMemo(() => {
    return idsRaw
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0);
  }, [idsRaw]);

  const canRun =
    ids.length > 0 &&
    !running &&
    (op === "locale" ? true :
     op === "tag" || op === "untag" ? tagId != null :
     op === "list-add" ? listId != null :
     true);

  async function run() {
    if (!canRun) return;
    if (!confirm(`Apply "${op}" to ${ids.length} contacts? This cannot be undone for delete/opt-out.`)) return;
    setRunning(true);
    setResult(null);
    try {
      let endpoint = "";
      let body: Record<string, unknown> = { contact_ids: ids };
      if (op === "locale") { endpoint = "/api/v1/contacts/bulk/locale"; body.locale = locale; }
      else if (op === "tag") { endpoint = "/api/v1/contacts/bulk/tag"; body.tag_id = tagId; }
      else if (op === "untag") { endpoint = "/api/v1/contacts/bulk/untag"; body.tag_id = tagId; }
      else if (op === "list-add") { endpoint = "/api/v1/contacts/bulk/list-add"; body.list_id = listId; }
      else if (op === "opt-out-sms") { endpoint = "/api/v1/contacts/bulk/opt-out-sms"; }
      else if (op === "delete") { endpoint = "/api/v1/contacts/bulk/delete"; }
      const r = await post<Record<string, unknown>>(endpoint, body);
      setResult(JSON.stringify(r, null, 2));
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
    finally { setRunning(false); }
  }

  return (
    <SparkPageShell
      title="Bulk Contact Operations"
      subtitle={`${ids.length} contact ID${ids.length === 1 ? "" : "s"} parsed`}
      help="Apply the same change to many contacts at once. Paste contact IDs (one per line, comma-, semicolon-, or space-separated). Operations are non-transactional — partial failures don't roll back."
      loading={false}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <label className="block text-xs">
            <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Contact IDs</div>
            <textarea
              value={idsRaw}
              onChange={(e) => setIdsRaw(e.target.value)}
              rows={14}
              placeholder="1234&#10;5678, 9012&#10;...or paste from a spreadsheet"
              className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 font-mono"
            />
          </label>
          <div className="mt-1 text-[10px] text-slate-400">
            Max 5,000 IDs per operation. Non-numeric tokens are silently ignored.
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-[10px] uppercase font-semibold text-slate-600 tracking-wide mb-2">Operation</div>
          <div className="grid grid-cols-2 gap-1 mb-3">
            <OpBtn op="locale" curr={op} setOp={setOp} icon={Globe2} label="Set locale" />
            <OpBtn op="tag" curr={op} setOp={setOp} icon={Tag} label="Add tag" />
            <OpBtn op="untag" curr={op} setOp={setOp} icon={Tag} label="Remove tag" />
            <OpBtn op="list-add" curr={op} setOp={setOp} icon={ListIcon} label="Add to list" />
            <OpBtn op="opt-out-sms" curr={op} setOp={setOp} icon={MessageSquare} label="Opt-out SMS" />
            <OpBtn op="delete" curr={op} setOp={setOp} icon={Trash2} label="Soft-delete" />
          </div>

          {/* Op-specific config */}
          {op === "locale" && (
            <label className="block text-xs mb-3">
              <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Locale</div>
              <select value={locale} onChange={(e) => setLocale(e.target.value)} className="w-full text-sm border border-slate-300 rounded px-2 py-1.5">
                {COMMON_LOCALES.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
          )}
          {(op === "tag" || op === "untag") && (
            <label className="block text-xs mb-3">
              <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Tag</div>
              <select value={tagId ?? ""} onChange={(e) => setTagId(parseInt(e.target.value) || null)} className="w-full text-sm border border-slate-300 rounded px-2 py-1.5">
                <option value="">— pick a tag —</option>
                {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          )}
          {op === "list-add" && (
            <label className="block text-xs mb-3">
              <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">List</div>
              <select value={listId ?? ""} onChange={(e) => setListId(parseInt(e.target.value) || null)} className="w-full text-sm border border-slate-300 rounded px-2 py-1.5">
                <option value="">— pick a list —</option>
                {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
          )}
          {op === "delete" && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2 mb-3">
              Soft-deletes flip <code>is_deleted=1</code>. Records remain in the database and can be restored via SQL.
            </div>
          )}

          <button
            onClick={run}
            disabled={!canRun}
            className="w-full text-sm px-3 py-2 rounded bg-[#EF6C33] text-white disabled:opacity-50 flex items-center justify-center gap-1"
          >
            <Play className="h-4 w-4" /> {running ? "Running…" : `Apply to ${ids.length} contacts`}
          </button>

          {result && (
            <div className="mt-3 rounded border border-emerald-200 bg-emerald-50 p-2">
              <div className="flex items-center gap-1 text-xs font-semibold text-emerald-800">
                <Check className="h-3.5 w-3.5" /> Result
              </div>
              <pre className="mt-1 text-[10px] text-emerald-900 font-mono whitespace-pre-wrap overflow-auto max-h-40">
                {result}
              </pre>
            </div>
          )}
        </div>
      </div>
    </SparkPageShell>
  );
}

function OpBtn({ op, curr, setOp, icon: Icon, label }: { op: Op; curr: Op; setOp: (op: Op) => void; icon: typeof Users; label: string }) {
  const active = op === curr;
  return (
    <button
      onClick={() => setOp(op)}
      className={`text-xs flex items-center gap-1 px-2 py-1.5 rounded border transition-colors ${active ? "border-[#EF6C33] bg-orange-50 text-[#EF6C33] font-semibold" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

export default SparkContactBulkPage;
