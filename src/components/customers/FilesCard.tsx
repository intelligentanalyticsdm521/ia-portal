// FilesCard — "Files and measurements".
//
// D-136, CUSTOMER_MODEL_MULTISITE_2026-09-15 §12.4.2: the one card the Location
// page asks for that the customer-model UI named and did not build, because
// there was nowhere to put the bytes. oliver-api migration 216 and
// routes/customerFiles.js are that somewhere.
//
// ONE CARD, TWO OWNERS. A location's files (the site map, the snow-relocation
// plan, the photos) and the customer's own files (the signed contract, the COI)
// are the same list of the same rows with a different owner, so this takes the
// API path rather than a kind — the same move NotesCard made for the three
// owners migration 183 gave lumen.note, and for the same reason: two copies
// would be two answers to "is 20 MB too big" the first time one was fixed.
//
// ── WHY THE THUMBNAIL IS AN OBJECT URL ────────────────────────────────────
// The container is PRIVATE and the API streams the bytes behind its tenant
// guard, so `<img src=".../content">` is a request with no bearer token and a
// 401. Each image row fetches once, holds an object URL, and REVOKES it on
// unmount — an object URL that is never revoked keeps its bytes for the life of
// the tab, and a location with twenty site photos is how you would find out.
//
// ── NOT IN THE CUSTOMER PORTAL ────────────────────────────────────────────
// There is no customer-facing version of this card. §9.5's visibility rules say
// nothing about files and D-136 leaves "may a site contact see the site map"
// open, so this pass fails closed: office-side only.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, Image as ImageIcon, Paperclip, Trash2, Upload, X } from "lucide-react";
import { useOliverApi } from "../../hooks/useOliverApi";
import {
  type CustomerFile, type FileKind,
  ACCEPT_ATTR, FILE_KINDS, KIND_HELP, KIND_LABEL,
  fileProblem, formatBytes, kindLabel, orderFiles, showsThumbnail,
  titleFromFileName, uploaderLine,
} from "../../lib/customerFiles";

const cardCls = "rounded-lg border border-slate-200 bg-white p-4";
const headCls = "flex items-start justify-between gap-3";
const titleCls = "text-[13px] font-semibold text-slate-900";
const subCls = "text-[11px] text-slate-500";
const btnCls = "inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const labelCls = "text-[10px] font-semibold uppercase tracking-wide text-slate-500";
const inputCls = "w-full rounded border border-slate-300 px-2 py-1.5 text-[13px]";

export interface FilesCardProps {
  /** The owner's files endpoint — a location's or a customer's. */
  path: string;
  title?: string;
  subtitle?: string;
  emptyText?: string;
  accent?: string;
  /** Hides Upload and Remove for a read-only viewer. */
  readOnly?: boolean;
}

export function FilesCard({
  path, title = "Files and measurements", subtitle, emptyText,
  accent = "#2D9CDB", readOnly = false,
}: FilesCardProps) {
  const { get, uploadClient, del, fetchBlob, ready } = useOliverApi();

  const [files, setFiles] = useState<CustomerFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [picked, setPicked] = useState<File | null>(null);
  const [kind, setKind] = useState<FileKind>("site_map");
  const [fileTitle, setFileTitle] = useState("");
  const fileInput = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setErr(null);
    try {
      // useOliverApi strips the { data: … } envelope on the way through.
      const rows = await get<CustomerFile[]>(path);
      setFiles(Array.isArray(rows) ? rows : []);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }, [get, ready, path]);
  useEffect(() => { load(); }, [load]);

  const ordered = useMemo(() => orderFiles(files), [files]);

  function choose(f: File | null) {
    setErr(null);
    setPicked(f);
    if (f && !fileTitle.trim()) setFileTitle(titleFromFileName(f.name));
    if (f) {
      // Guess the kind from the type so the common case is one click: a picture
      // is a photo, a PDF is whatever the person says it is.
      if (f.type.startsWith("image/") && kind === "site_map") setKind("photo");
    }
  }

  async function upload() {
    const problem = fileProblem(picked);
    if (problem) { setErr(problem); return; }
    if (!fileTitle.trim()) { setErr("Give the file a name."); return; }
    setBusy(true); setErr(null);
    try {
      const form = new FormData();
      form.append("file", picked as File);
      form.append("kind", kind);
      form.append("title", fileTitle.trim());
      await uploadClient<CustomerFile>(path, form);
      setPicked(null); setFileTitle(""); setAdding(false);
      if (fileInput.current) fileInput.current.value = "";
      await load();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  async function remove(file: CustomerFile) {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Remove "${file.title}"? It stays on the record — it just stops showing here.`)) return;
    setBusy(true); setErr(null);
    try {
      await del(`/customers/files/${file.customer_file_id}`);
      await load();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  async function open(file: CustomerFile) {
    setErr(null);
    try {
      const blob = await fetchBlob(file.content_path);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      // Long enough for the new tab to have taken the bytes.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) { setErr((e as Error).message); }
  }

  return (
    <div className={cardCls} data-testid="files-card">
      <div className={headCls}>
        <div>
          <div className={titleCls}>{title}</div>
          <div className={subCls}>
            {subtitle ?? "Site maps, snow-relocation plans, measurements and photos. The crew reads these before they drive out."}
          </div>
        </div>
        {!readOnly && (
          <button type="button" className={btnCls} data-testid="add-file" onClick={() => { setAdding((v) => !v); setErr(null); }}>
            {adding ? <><X className="h-3.5 w-3.5" /> Cancel</> : <><Upload className="h-3.5 w-3.5" /> Upload</>}
          </button>
        )}
      </div>

      {err && <div className="mt-2 rounded border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-700" data-testid="files-error">{err}</div>}

      {adding && !readOnly && (
        <div className="mt-3 rounded-md border border-dashed border-[#A8CDD8] bg-[#FBFDFF] p-3">
          <div
            data-testid="file-dropzone"
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault(); setDragging(false);
              choose(e.dataTransfer.files?.[0] || null);
            }}
            onClick={() => fileInput.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed px-3 py-5 text-center ${dragging ? "border-[#2D9CDB] bg-[#EAF6FD]" : "border-slate-300"}`}
          >
            <Paperclip className="h-4 w-4 text-slate-400" />
            <span className="mt-1 text-[12px] font-semibold text-slate-700">
              {picked ? picked.name : "Drop a file here, or click to choose"}
            </span>
            <span className="text-[11px] text-slate-500">
              {picked ? formatBytes(picked.size) : "PNG, JPG, WEBP, GIF or PDF · up to 20 MB"}
            </span>
          </div>
          <input
            ref={fileInput}
            data-testid="file-input"
            type="file"
            accept={ACCEPT_ATTR}
            className="hidden"
            onChange={(e) => choose(e.target.files?.[0] || null)}
          />

          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <label className="text-xs">
              <div className={labelCls}>What is it</div>
              <select
                data-testid="file-kind"
                className={inputCls}
                value={kind}
                onChange={(e) => setKind(e.target.value as FileKind)}
              >
                {FILE_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
              <p className="mt-0.5 text-[11px] text-slate-500">{KIND_HELP[kind]}</p>
            </label>
            <label className="text-xs">
              <div className={labelCls}>Name</div>
              <input
                data-testid="file-title"
                className={inputCls}
                value={fileTitle}
                onChange={(e) => setFileTitle(e.target.value)}
                placeholder="Ankeny site map"
              />
            </label>
          </div>

          <div className="mt-2 flex justify-end">
            <button
              type="button"
              data-testid="file-upload"
              onClick={upload}
              disabled={busy || !picked || !fileTitle.trim()}
              style={{ background: accent }}
              className="rounded px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              {busy ? "Uploading…" : "Upload"}
            </button>
          </div>
        </div>
      )}

      <div className="mt-2 divide-y divide-slate-100" data-testid="files-list">
        {loading && <div className="py-3 text-xs text-slate-500">Loading…</div>}
        {!loading && ordered.length === 0 && (
          <div className="py-3 text-xs text-slate-500">
            {emptyText ?? "Nothing here yet. The site map, the snow-relocation plan and the measurement sheet all live on this card."}
          </div>
        )}
        {ordered.map((f) => (
          <FileRow
            key={f.customer_file_id}
            file={f}
            readOnly={readOnly}
            busy={busy}
            onOpen={() => open(f)}
            onRemove={() => remove(f)}
            fetchBlob={fetchBlob}
          />
        ))}
      </div>
    </div>
  );
}

function FileRow({
  file, readOnly, busy, onOpen, onRemove, fetchBlob,
}: {
  file: CustomerFile;
  readOnly: boolean;
  busy: boolean;
  onOpen: () => void;
  onRemove: () => void;
  fetchBlob: (path: string) => Promise<Blob>;
}) {
  const [thumb, setThumb] = useState<string | null>(null);
  const isImage = showsThumbnail(file);

  useEffect(() => {
    if (!isImage) return;
    let live = true;
    let url: string | null = null;
    fetchBlob(file.content_path)
      .then((blob) => {
        if (!live) return;
        url = URL.createObjectURL(blob);
        setThumb(url);
      })
      // A thumbnail that will not load is not worth an error banner; the row
      // still opens, and the icon says what it is.
      .catch(() => {});
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [isImage, file.content_path, fetchBlob]);

  return (
    <div className="flex items-center gap-3 py-2" data-testid="file-row">
      <button
        type="button"
        onClick={onOpen}
        title="Open"
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-50"
      >
        {thumb
          ? <img src={thumb} alt="" className="h-full w-full object-cover" />
          : isImage
            ? <ImageIcon className="h-4 w-4 text-slate-400" />
            : <FileText className="h-4 w-4 text-[#B3401F]" />}
      </button>

      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-2">
          <span className="truncate text-[12px] font-semibold text-slate-900">{file.title}</span>
          <span className="flex-shrink-0 rounded-full bg-[#E8F4FB] px-2 py-px text-[10px] font-semibold text-[#0C4A60]">
            {file.kind_label || kindLabel(file.kind)}
          </span>
        </div>
        <div className="truncate text-[11px] text-slate-500">
          {formatBytes(file.size_bytes)} · {uploaderLine(file)}
        </div>
      </button>

      {!readOnly && (
        <button
          type="button"
          data-testid="file-remove"
          onClick={onRemove}
          disabled={busy}
          title="Remove"
          className="flex-shrink-0 rounded border border-slate-300 bg-white p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export default FilesCard;
