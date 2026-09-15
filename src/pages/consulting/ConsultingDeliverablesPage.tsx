// ConsultingDeliverablesPage — the agency's list of every document sent to
// every client.
//
// 2026-09-15 — the top half of this page is gone. It was a "cross-cutting
// library" over lumen.consulting_project_artifact and oliver.deliverable (via
// the lumen ticket link), with an inline Approve that posted to OLIVER's job
// deliverable route. Both stores hold 0 rows in prod, and the endpoint it read
// (/consulting-deliverables) is now the CLIENT's own library. What stays is the
// section that was already the real one: consulting.deliverable, every client.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

export function ConsultingDeliverablesPage() {
  return (
    <OliverPageWrapper
      title="Deliverables"
      subtitle="IA Consulting · Every document sent to every client"
      error={null}
      loading={false}
    >
      <ClientDocumentsSection />
    </OliverPageWrapper>
  );
}

// ─── Client documents (consulting.deliverable, agency-wide) ───────────────
// Upload a document for ANY client outside a project; attached rows from
// projects and tasks appear here too, searchable by client. Downloads stream
// through the API (the blob container is private).
interface ClientDoc {
  deliverable_id: string;
  tenant_id: string;
  project_id?: string | null;
  title?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  status: string;
  created_at?: string | null;
  sent_at?: string | null;
  approved_at?: string | null;
  project_name?: string | null;
  milestone_name?: string | null;
}

const shortDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString() : "");

function ClientDocumentsSection() {
  const { getFounder, uploadFounder, download } = useOliverApi();
  const [docs, setDocs] = useState<ClientDoc[]>([]);
  const [clientNames, setClientNames] = useState<Record<string, string>>({});
  const [clientOptions, setClientOptions] = useState<Array<{ tenant_id: string; name: string }>>([]);
  const [search, setSearch] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState(false);
  const [dlId, setDlId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getFounder<ClientDoc[]>("/consulting/deliverables/all")
      .then((r) => setDocs(Array.isArray(r) ? r : []))
      .catch((e) => setError((e as Error).message));
  }, [getFounder]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    getFounder<{ clients?: Array<{ tenant_id?: string | null; business_name?: string | null; display_name?: string | null; company_name?: string | null }> }>(
      "/consulting/_/active-oliver-clients",
    )
      .then((r) => {
        const map: Record<string, string> = {};
        const opts: Array<{ tenant_id: string; name: string }> = [];
        (r?.clients || []).forEach((c) => {
          if (!c.tenant_id) return;
          const name =
            (c.business_name && c.business_name !== "(unnamed)" ? c.business_name : null) ||
            c.display_name || c.company_name || c.tenant_id;
          map[String(c.tenant_id).toUpperCase()] = name;
          opts.push({ tenant_id: c.tenant_id, name });
        });
        setClientNames(map);
        setClientOptions(opts.sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch(() => { /* raw ids remain usable */ });
  }, [getFounder]);

  async function handleUpload() {
    if (!file || !clientId) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("tenant_id", clientId);
      form.append("title", title.trim() || file.name);
      await uploadFounder("/consulting/deliverables", form);
      setFile(null); setTitle(""); setClientId("");
      load();
    } catch (e) {
      setError((e as Error).message || "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload(d: ClientDoc) {
    setDlId(d.deliverable_id);
    try {
      await download(`/consulting/deliverables/${d.deliverable_id}/download`, d.file_name || d.title || "document");
    } catch (e) {
      setError((e as Error).message || "Download failed.");
    } finally {
      setDlId(null);
    }
  }

  const shown = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return docs;
    return docs.filter((d) => {
      const client = clientNames[String(d.tenant_id).toUpperCase()] || "";
      return (
        client.toLowerCase().includes(s) ||
        (d.title || "").toLowerCase().includes(s) ||
        (d.file_name || "").toLowerCase().includes(s) ||
        (d.project_name || "").toLowerCase().includes(s)
      );
    });
  }, [docs, search, clientNames]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-bold text-slate-900">Client documents</div>
          <div className="text-xs text-slate-500">
            Upload a document for a client outside any project. It&apos;s sent to them straight away and they get an email.
          </div>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by client, title, file…"
          className="w-56 rounded border border-slate-300 px-2 py-1.5 text-xs"
        />
      </div>

      {error && <div className="mb-2 rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}

      <div className="mb-3 grid gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50/60 p-3 sm:grid-cols-[1fr_1fr_auto_auto]">
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs"
        >
          <option value="">Client…</option>
          {clientOptions.map((c) => (
            <option key={c.tenant_id} value={c.tenant_id}>{c.name}</option>
          ))}
        </select>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={file?.name || "Title (defaults to file name)"}
          className="rounded border border-slate-300 px-2 py-1.5 text-xs"
        />
        <input
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="text-xs text-slate-600 file:mr-2 file:rounded file:border-0 file:bg-slate-900 file:px-2.5 file:py-1.5 file:text-xs file:font-semibold file:text-white"
        />
        <button
          type="button"
          onClick={handleUpload}
          disabled={busy || !file || !clientId}
          className="rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:bg-slate-300"
        >
          {busy ? "Sending…" : "Send"}
        </button>
      </div>

      {shown.length === 0 ? (
        <div className="py-4 text-center text-xs italic text-slate-400">
          {docs.length === 0 ? "No client documents yet." : "No matches."}
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {shown.map((d) => (
            <li key={d.deliverable_id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-900">{d.title || d.file_name}</div>
                <div className="text-[11px] text-slate-500">
                  {clientNames[String(d.tenant_id).toUpperCase()] || d.tenant_id}
                  {d.project_name ? ` · ${d.project_name}${d.milestone_name ? ` / ${d.milestone_name}` : ""}` : " · Standalone"}
                  {" · "}{String(d.status).replace(/_/g, " ")}
                  {d.sent_at ? ` · sent ${shortDate(d.sent_at)}` : ""}
                  {d.approved_at ? ` · approved ${shortDate(d.approved_at)}` : ""}
                </div>
              </div>
              {d.file_url && (
                <button
                  type="button"
                  onClick={() => handleDownload(d)}
                  disabled={dlId === d.deliverable_id}
                  className="flex-shrink-0 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  {dlId === d.deliverable_id ? "Downloading…" : "Download"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ConsultingDeliverablesPage;
