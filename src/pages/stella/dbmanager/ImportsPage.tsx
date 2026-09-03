// ImportsPage — "Uploads & Import History" (one nav item, two tabs, per the
// 8-child nav cap the house set on 2026-07-30).
//
// The three-step shape is the product: upload validates and shows you exactly
// what will happen, commit promotes, rollback reverses. Nothing canonical
// moves until you press Commit, and every commit stays reversible.
import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Check, Undo2, FileSpreadsheet } from "lucide-react";
import { StellaShell, StellaTabs, STELLA_INDIGO, STELLA_LAVENDER } from "../StellaShell";
import { useStellaApi } from "../../../hooks/useStellaApi";
import { stellaUpload } from "../../../lib/stellaApi";
import { useMsal } from "@azure/msal-react";
import { useActiveAccount } from "../../../auth/useAccessToken";
import { useClientTenantIdOverride } from "../../../lib/clientTenantContext";
import {
  DbCard, DbError, DbLoading, DbButton, DbSelect, DbField, DbTable, DbEmpty,
  DbNotice, useNotice, Pill, DbModal,
} from "./DbManagerKit";

type Entity = { entity: string; label: string; fields: { key: string; label: string; required: boolean; type: string }[] };
type PreviewRow = { rowNumber: number; payload: Record<string, unknown>; errors: string[] };
type Batch = {
  raw_import_batch_id: string; kind: string; target_entity: string; status: string;
  row_count: number; row_success: number; row_failed: number;
  committed_at: string | null; rolled_back_at: string | null; created_at: string;
  validation_summary?: { file?: string } | null;
};

const statusTone = (s: string) =>
  s === "committed" ? "good" : s === "rolled_back" ? "warn" : s === "validated" ? "brand" : "neutral";

export function StellaImportsPage() {
  const api = useStellaApi();
  const { instance } = useMsal();
  const account = useActiveAccount();
  const tenantOverride = useClientTenantIdOverride();

  const [tab, setTab] = useState("upload");
  const [entities, setEntities] = useState<Entity[] | null>(null);
  const [target, setTarget] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, showNotice] = useNotice();
  const fileInput = useRef<HTMLInputElement>(null);

  const [result, setResult] = useState<{
    raw_import_batch_id: string; row_count: number; row_success: number; row_failed: number; preview: PreviewRow[];
  } | null>(null);

  const [history, setHistory] = useState<Batch[] | null>(null);
  const [detail, setDetail] = useState<Batch | null>(null);

  useEffect(() => {
    if (!api.ready) return;
    api.get<Entity[]>("/db-manager/manual-entry")
      .then((rows) => { setEntities(rows); setTarget((p) => p || rows[0]?.entity || ""); })
      .catch(setError);
  }, [api]);

  const loadHistory = useCallback(() => {
    if (!api.ready) return;
    api.get<Batch[]>("/db-manager/imports").then(setHistory).catch(setError);
  }, [api]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  async function doUpload() {
    if (!file || !target) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("target_entity", target);
      const r = await stellaUpload<{ data: typeof result }>(instance, account, "/db-manager/import", fd, tenantOverride);
      setResult(r.data);
      loadHistory();
    } catch (e) {
      const d = (e as { details?: string[] })?.details;
      setError(d?.length ? { message: d.join(" · ") } : e);
    } finally { setBusy(false); }
  }

  async function commit(id: string) {
    setBusy(true); setError(null);
    try {
      const r = await api.post<{ promoted: number }>(`/db-manager/import/${id}/commit`, {});
      showNotice(`Committed — ${r.promoted} row${r.promoted === 1 ? "" : "s"} added to your books.`);
      setResult(null); setFile(null); if (fileInput.current) fileInput.current.value = "";
      loadHistory();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  async function rollback(id: string) {
    // A rollback deletes real ledger rows. Asking first is the whole point.
    if (!window.confirm("Roll this import back? Every row it created will be deleted from your books.")) return;
    setBusy(true); setError(null);
    try {
      const r = await api.post<{ deleted: number }>(`/db-manager/import/${id}/rollback`, { reason: "Rolled back from Import History" });
      showNotice(`Rolled back — ${r.deleted} row${r.deleted === 1 ? "" : "s"} removed.`);
      setDetail(null);
      loadHistory();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  const entity = entities?.find((e) => e.entity === target);

  return (
    <StellaShell
      title="Uploads & Import History"
      subtitle="Bring data in from a spreadsheet — validated first, committed on your say-so, reversible after."
    >
      <DbNotice text={notice} />
      <DbError error={error} />
      <StellaTabs
        tabs={[{ key: "upload", label: "Upload" }, { key: "history", label: "Import history" }]}
        active={tab} onChange={setTab}
      />

      {tab === "upload" ? (
        <div style={{ display: "grid", gap: 16 }}>
          <DbCard title="1 · Choose what you're importing">
            {!entities ? <DbLoading /> : (
              <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16, alignItems: "start" }}>
                <DbField label="Import into">
                  <DbSelect value={target} onChange={(e) => { setTarget(e.target.value); setResult(null); }}>
                    {entities.map((e) => <option key={e.entity} value={e.entity}>{e.label}</option>)}
                  </DbSelect>
                </DbField>
                {entity && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 6 }}>
                      Your file needs these column headings
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {entity.fields.map((f) => (
                        <span key={f.key} style={{
                          border: `1px solid ${f.required ? STELLA_INDIGO : STELLA_LAVENDER}`,
                          borderRadius: 6, padding: "4px 8px", fontSize: 11,
                          color: f.required ? STELLA_INDIGO : "#334155", background: "#FAFBFF",
                        }}>
                          {f.label}{f.required ? " *" : ""}
                        </span>
                      ))}
                    </div>
                    <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 8 }}>
                      * required. Headings are matched loosely — “Posted Date”, “posted_date” and “POSTEDDATE” all work.
                      CSV, TSV and XLSX are all accepted.
                    </div>
                  </div>
                )}
              </div>
            )}
          </DbCard>

          <DbCard title="2 · Pick your file">
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <input
                ref={fileInput} type="file" accept=".csv,.tsv,.xlsx"
                onChange={(e) => { setFile(e.target.files?.[0] || null); setResult(null); }}
                style={{ fontSize: 12 }}
              />
              <DbButton onClick={doUpload} disabled={!file || !target || busy}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Upload size={13} /> {busy ? "Checking…" : "Check the file"}
                </span>
              </DbButton>
            </div>
            <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 8 }}>
              Nothing is added to your books at this step — we only read the file and tell you what we found.
            </div>
          </DbCard>

          {result && (
            <DbCard
              title="3 · Review, then commit"
              actions={
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Pill tone="good">{result.row_success} ready</Pill>
                  {result.row_failed > 0 && <Pill tone="bad">{result.row_failed} skipped</Pill>}
                  <DbButton onClick={() => commit(result.raw_import_batch_id)} disabled={busy || result.row_success === 0}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <Check size={13} /> Commit {result.row_success} row{result.row_success === 1 ? "" : "s"}
                    </span>
                  </DbButton>
                </div>
              }
            >
              {result.row_failed > 0 && (
                <div style={{
                  background: "#FFFAEB", border: "1px solid #FEDF89", borderRadius: 8,
                  padding: "9px 12px", fontSize: 11, color: "#B54708", marginBottom: 12,
                }}>
                  {result.row_failed} row{result.row_failed === 1 ? "" : "s"} will be skipped — the reasons are below.
                  Fix them in your file and upload again if you need them.
                </div>
              )}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr>
                      <th style={th}>Row</th><th style={th}>Status</th><th style={th}>What we read</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.preview.map((p) => (
                      <tr key={p.rowNumber} style={{ borderBottom: "1px solid #F1F5F9" }}>
                        <td style={td}>{p.rowNumber}</td>
                        <td style={td}>{p.errors.length ? <Pill tone="bad">Skipped</Pill> : <Pill tone="good">Ready</Pill>}</td>
                        <td style={{ ...td, whiteSpace: "normal", color: p.errors.length ? "#B42318" : "#334155" }}>
                          {p.errors.length
                            ? p.errors.join(" · ")
                            : Object.entries(p.payload).filter(([, v]) => v !== null && v !== "")
                                .map(([k, v]) => `${k}: ${v}`).join("  ·  ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.row_count > result.preview.length && (
                <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 8 }}>
                  Showing the first {result.preview.length} of {result.row_count} rows.
                </div>
              )}
            </DbCard>
          )}
        </div>
      ) : (
        <DbCard title="Every import">
          {!history ? <DbLoading /> : (
            <DbTable
              columns={[
                { key: "created_at", label: "When", type: "datetime" },
                { key: "target_entity", label: "Into" },
                { key: "kind", label: "Type" },
                { key: "row_count", label: "Rows", type: "int" },
                { key: "row_success", label: "OK", type: "int" },
                { key: "row_failed", label: "Skipped", type: "int" },
                { key: "status", label: "Status" },
              ]}
              rows={history.map((b) => ({ ...b, status: b.status }))}
              onRowClick={(r) => setDetail(history.find((b) => b.raw_import_batch_id === r.raw_import_batch_id) || null)}
              empty={<DbEmpty title="No imports yet" reason="Upload a spreadsheet on the Upload tab and it will appear here." />}
            />
          )}
        </DbCard>
      )}

      {detail && (
        <DbModal title="Import detail" onClose={() => setDetail(null)}>
          <div style={{ display: "grid", gap: 8, fontSize: 12, color: "#334155" }}>
            <Row k="File" v={detail.validation_summary?.file || "—"} />
            <Row k="Into" v={detail.target_entity} />
            <Row k="Uploaded" v={new Date(detail.created_at).toLocaleString()} />
            <Row k="Rows" v={`${detail.row_count} total · ${detail.row_success} ok · ${detail.row_failed} skipped`} />
            <Row k="Status" v={<Pill tone={statusTone(detail.status) as never}>{detail.status.replace("_", " ")}</Pill>} />
            {detail.committed_at && <Row k="Committed" v={new Date(detail.committed_at).toLocaleString()} />}
            {detail.rolled_back_at && <Row k="Rolled back" v={new Date(detail.rolled_back_at).toLocaleString()} />}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
            {detail.status === "validated" && (
              <DbButton onClick={() => commit(detail.raw_import_batch_id)} disabled={busy}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Check size={13} /> Commit</span>
              </DbButton>
            )}
            {detail.status === "committed" && (
              <DbButton variant="danger" onClick={() => rollback(detail.raw_import_batch_id)} disabled={busy}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Undo2 size={13} /> Roll this import back</span>
              </DbButton>
            )}
            {detail.status === "rolled_back" && (
              <div style={{ fontSize: 11, color: "#5A7A8A", display: "flex", alignItems: "center", gap: 6 }}>
                <FileSpreadsheet size={13} /> This import has already been reversed.
              </div>
            )}
          </div>
        </DbModal>
      )}
    </StellaShell>
  );
}

const th: React.CSSProperties = {
  textAlign: "left", padding: "7px 9px", fontSize: 10, fontWeight: 700, color: "#5A7A8A",
  textTransform: "uppercase", letterSpacing: 0.4, borderBottom: `1px solid ${STELLA_LAVENDER}`,
};
const td: React.CSSProperties = { padding: "7px 9px", verticalAlign: "top", whiteSpace: "nowrap" };

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 10 }}>
      <div style={{ width: 100, color: "#94A3B8", fontSize: 11 }}>{k}</div>
      <div style={{ flex: 1 }}>{v}</div>
    </div>
  );
}
