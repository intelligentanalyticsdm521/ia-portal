// DocumentsPage — the document library.
//
// Downloads go through the API, not the stored blob URL: the container is
// private and the URL is provenance. Clicking a row fetches through the tenant
// guard and hands the browser a blob.
import { useCallback, useEffect, useState } from "react";
import { Upload, Download, Trash2, FileText } from "lucide-react";
import { StellaShell } from "../StellaShell";
import { useStellaApi } from "../../../hooks/useStellaApi";
import { stellaUpload } from "../../../lib/stellaApi";
import { useMsal } from "@azure/msal-react";
import { useActiveAccount } from "../../../auth/useAccessToken";
import { useClientTenantIdOverride } from "../../../lib/clientTenantContext";
import { downloadStellaFile } from "./downloadHelper";
import {
  DbCard, DbError, DbLoading, DbButton, DbInput, DbSelect, DbField, DbEmpty,
  DbNotice, useNotice, Pill, DbModal, DbTable,
} from "./DbManagerKit";

type Doc = {
  document_id: string; title: string; type: string | null; content_type: string | null;
  file_size_bytes: number | null; expires_on: string | null; created_at: string;
};

const TYPES = ["", "receipt", "invoice", "contract", "w9", "insurance", "licence", "tax", "other"];

function sizeLabel(b: number | null) {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function StellaDocumentsPage() {
  const api = useStellaApi();
  const { instance } = useMsal();
  const account = useActiveAccount();
  const tenantOverride = useClientTenantIdOverride();

  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [notice, showNotice] = useNotice();
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: "", type: "", expires_on: "" });
  const [file, setFile] = useState<File | null>(null);
  const [filterType, setFilterType] = useState("");

  const load = useCallback(() => {
    if (!api.ready) return;
    const qs = filterType ? `?type=${encodeURIComponent(filterType)}` : "";
    api.get<Doc[]>(`/db-manager/documents${qs}`).then(setDocs).catch(setError);
  }, [api, filterType]);

  useEffect(() => { load(); }, [load]);

  async function submit() {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", form.title.trim() || file.name);
      if (form.type) fd.append("type", form.type);
      if (form.expires_on) fd.append("expires_on", form.expires_on);
      await stellaUpload(instance, account, "/db-manager/documents", fd, tenantOverride);
      showNotice(`“${form.title.trim() || file.name}” uploaded.`);
      setUploading(false); setFile(null); setForm({ title: "", type: "", expires_on: "" });
      load();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  async function download(d: Doc) {
    setError(null);
    try {
      await downloadStellaFile(instance, account, `/db-manager/documents/${d.document_id}/download`, d.title, tenantOverride);
    } catch (e) { setError(e); }
  }

  async function remove(d: Doc) {
    if (!window.confirm(`Delete “${d.title}”?`)) return;
    setBusy(true); setError(null);
    try {
      await api.del(`/db-manager/documents/${d.document_id}`);
      showNotice(`Deleted “${d.title}”.`);
      load();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  if (error && !docs) {
    return <StellaShell title="Documents" subtitle="Your document library."><DbError error={error} /></StellaShell>;
  }

  return (
    <StellaShell
      title="Documents"
      subtitle="Receipts, contracts, W-9s and anything else that belongs with your books."
      actions={<DbButton onClick={() => setUploading(true)}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Upload size={13} /> Add document</span>
      </DbButton>}
    >
      <DbNotice text={notice} />
      <DbError error={error} />

      <DbCard
        title="Library"
        actions={
          <div style={{ width: 180 }}>
            <DbSelect value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="">All types</option>
              {TYPES.filter(Boolean).map((t) => <option key={t} value={t}>{t}</option>)}
            </DbSelect>
          </div>
        }
      >
        {!docs ? <DbLoading /> : (
          <DbTable
            columns={[
              { key: "title", label: "Document" },
              { key: "type", label: "Type" },
              { key: "size", label: "Size" },
              { key: "expires_on", label: "Expires", type: "date" },
              { key: "created_at", label: "Added", type: "datetime" },
              { key: "action", label: "" },
            ]}
            rows={docs.map((d) => {
              const soon = d.expires_on && new Date(d.expires_on).getTime() - Date.now() < 60 * 86400_000;
              return {
                ...d,
                title: <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                  <FileText size={13} color="#94A3B8" />{d.title}
                </span>,
                type: d.type ? <Pill>{d.type}</Pill> : null,
                size: sizeLabel(d.file_size_bytes),
                expires_on: d.expires_on
                  ? <span style={{ color: soon ? "#B54708" : undefined, fontWeight: soon ? 700 : 400 }}>
                      {String(d.expires_on).slice(0, 10)}
                    </span>
                  : null,
                action: <span style={{ display: "inline-flex", gap: 6 }}>
                  <DbButton variant="ghost" onClick={() => download(d)}><Download size={13} /></DbButton>
                  <DbButton variant="danger" onClick={() => remove(d)} disabled={busy}><Trash2 size={13} /></DbButton>
                </span>,
              };
            }) as never}
            empty={<DbEmpty
              title="No documents yet"
              reason="Keep receipts, signed contracts and W-9s here so they're with the books they belong to."
            />}
          />
        )}
      </DbCard>

      {uploading && (
        <DbModal title="Add a document" onClose={() => setUploading(false)} width={460}>
          <div style={{ display: "grid", gap: 12 }}>
            <DbField label="File">
              <input type="file" onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setFile(f);
                // Pre-fill the title from the filename — most of the time it is
                // already what the customer would have typed.
                if (f && !form.title) setForm((p) => ({ ...p, title: f.name.replace(/\.[^.]+$/, "") }));
              }} style={{ fontSize: 12 }} />
            </DbField>
            <DbField label="Title">
              <DbInput value={form.title} maxLength={400} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </DbField>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <DbField label="Type">
                <DbSelect value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="">—</option>
                  {TYPES.filter(Boolean).map((t) => <option key={t} value={t}>{t}</option>)}
                </DbSelect>
              </DbField>
              <DbField label="Expires" hint="Optional — shows a renewal warning">
                <DbInput type="date" value={form.expires_on} onChange={(e) => setForm({ ...form, expires_on: e.target.value })} />
              </DbField>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <DbButton onClick={submit} disabled={busy || !file}>{busy ? "Uploading…" : "Upload"}</DbButton>
              <DbButton variant="ghost" onClick={() => setUploading(false)}>Cancel</DbButton>
            </div>
          </div>
        </DbModal>
      )}
    </StellaShell>
  );
}
