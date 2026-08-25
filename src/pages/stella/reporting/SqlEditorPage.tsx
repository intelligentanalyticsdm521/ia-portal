// SqlEditorPage — the Pro+ sandbox.
//
// A plain textarea, not Monaco. The June scope named Monaco, but it is ~5MB of
// editor for a surface most tenants will open twice, and the Portal has no
// other use for it. A textarea with the schema beside it and clear rejection
// messages does the job; Monaco is a later upgrade if anyone asks.
//
// The page states the two rules up front — bare table names, already scoped —
// because the alternative is a user hitting a rejection and guessing why.
import { useCallback, useEffect, useState } from "react";
import { Play, Database, History, Download } from "lucide-react";
import { StellaShell, STELLA_INDIGO, STELLA_LAVENDER } from "../StellaShell";
import { useStellaApi } from "../../../hooks/useStellaApi";
import {
  DbCard, DbError, DbLoading, DbButton, DbTable, DbEmpty, Pill,
} from "../dbmanager/DbManagerKit";

type SchemaRow = { table: string; note: string };
type HistoryRow = {
  sql_query_log_id: string; sql_text: string; row_count: number | null;
  duration_ms: number | null; status: string; error_message: string | null; executed_at: string;
};
type Result = {
  data: Record<string, unknown>[];
  columns: { key: string; label: string }[];
  meta: { row_count: number; returned: number; truncated: boolean; max_rows: number; duration_ms: number; tables: string[] };
};

const SAMPLE = `SELECT TOP 20
       c.name  AS account,
       SUM(t.amount_signed) AS total
  FROM [transaction] t
  JOIN coa_account c ON c.coa_account_id = t.coa_account_id
 WHERE t.status <> 'void'
 GROUP BY c.name
 ORDER BY total`;

export function StellaSqlEditorPage() {
  const api = useStellaApi();
  const [sqlText, setSqlText] = useState(SAMPLE);
  const [schema, setSchema] = useState<SchemaRow[] | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [gateError, setGateError] = useState<unknown>(null);
  const [running, setRunning] = useState(false);

  const loadHistory = useCallback(() => {
    if (!api.ready) return;
    api.get<HistoryRow[]>("/reporting/sql/history").then(setHistory).catch(() => setHistory([]));
  }, [api]);

  useEffect(() => {
    if (!api.ready) return;
    // The schema call is the tier probe: a 403 here means Pro+ is required, and
    // the whole page should show the upgrade panel rather than a broken editor.
    api.get<SchemaRow[]>("/reporting/sql/schema").then((r) => { setSchema(r); loadHistory(); }).catch(setGateError);
  }, [api, loadHistory]);

  async function run() {
    setRunning(true); setError(null); setResult(null);
    try {
      setResult(await api.postFull<Result>("/reporting/sql/execute", { sql: sqlText }));
    } catch (e) {
      const d = (e as { details?: string })?.details;
      const m = (e as { message?: string })?.message;
      setError(d ? { message: `${m} ${d}` } : e);
    } finally { setRunning(false); loadHistory(); }
  }

  if (gateError) {
    return (
      <StellaShell title="SQL Editor" subtitle="Query your own data directly.">
        <DbError error={gateError} />
      </StellaShell>
    );
  }

  return (
    <StellaShell
      title="SQL Editor"
      subtitle="Ask anything of your own data, in SQL. Read-only, and limited to your business."
      actions={
        <DbButton onClick={run} disabled={running || !sqlText.trim()}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Play size={13} /> {running ? "Running…" : "Run"}
          </span>
        </DbButton>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr minmax(210px, 240px)", gap: 16, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
          <DbCard title="Query">
            <div style={{
              fontSize: 11, color: "#475569", background: "#FAFBFF", border: `1px solid ${STELLA_LAVENDER}`,
              borderRadius: 7, padding: "8px 11px", marginBottom: 10, lineHeight: 1.55,
            }}>
              Write table names <strong>without a schema</strong> — <code>[transaction]</code>, not
              {" "}<code>stella.transaction</code>. Every table is already limited to your business, so you never need
              a <code>tenant_id</code> filter. SELECT only.
            </div>
            <textarea
              value={sqlText}
              onChange={(e) => setSqlText(e.target.value)}
              onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") run(); }}
              spellCheck={false}
              rows={12}
              style={{
                width: "100%", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12,
                lineHeight: 1.55, padding: 12, borderRadius: 8, border: `1px solid ${STELLA_LAVENDER}`,
                color: "#0B1C24", resize: "vertical", tabSize: 2,
              }}
            />
            <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 6 }}>Ctrl/⌘ + Enter runs it.</div>
          </DbCard>

          <DbCard
            title="Result"
            actions={result ? (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <Pill>{result.meta.returned} of {result.meta.row_count} rows</Pill>
                <Pill>{result.meta.duration_ms} ms</Pill>
                {result.meta.truncated && <Pill tone="warn">capped at {result.meta.max_rows}</Pill>}
              </div>
            ) : null}
          >
            <DbError error={error} />
            {running ? <DbLoading /> : result ? (
              <DbTable columns={result.columns} rows={result.data}
                empty={<DbEmpty title="No rows" reason="The query ran fine — it just matched nothing." />} />
            ) : !error ? (
              <DbEmpty title="Nothing run yet" reason="Press Run to execute the query above." />
            ) : null}
          </DbCard>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <DbCard title="Tables you can query">
            {!schema ? <DbLoading /> : (
              <div style={{ display: "grid", gap: 2, maxHeight: 300, overflowY: "auto" }}>
                {schema.map((s) => (
                  <button
                    key={s.table}
                    onClick={() => setSqlText((p) => `${p}${p.endsWith("\n") ? "" : "\n"}-- ${s.table}\n`)}
                    title={s.note}
                    style={{
                      textAlign: "left", padding: "5px 8px", borderRadius: 6, border: 0, cursor: "pointer",
                      background: "transparent", fontSize: 11, color: "#334155",
                      fontFamily: "ui-monospace, monospace",
                    }}
                  >
                    <Database size={10} color="#94A3B8" style={{ verticalAlign: -1, marginRight: 6 }} />
                    {s.table}
                  </button>
                ))}
              </div>
            )}
          </DbCard>

          <DbCard title="Recent queries">
            {!history.length ? (
              <div style={{ fontSize: 11, color: "#94A3B8" }}>Nothing yet.</div>
            ) : (
              <div style={{ display: "grid", gap: 6, maxHeight: 320, overflowY: "auto" }}>
                {history.slice(0, 15).map((h) => (
                  <button
                    key={h.sql_query_log_id} onClick={() => setSqlText(h.sql_text)}
                    style={{
                      textAlign: "left", padding: "7px 9px", borderRadius: 7, cursor: "pointer",
                      border: `1px solid ${STELLA_LAVENDER}`, background: "#fff",
                    }}
                  >
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 3 }}>
                      <Pill tone={h.status === "ok" ? "good" : h.status === "rejected" ? "warn" : "bad"}>{h.status}</Pill>
                      <span style={{ fontSize: 9, color: "#94A3B8" }}>
                        {h.row_count != null ? `${h.row_count} rows · ` : ""}{h.duration_ms ?? 0} ms
                      </span>
                    </div>
                    <div style={{
                      fontFamily: "ui-monospace, monospace", fontSize: 10, color: "#5A7A8A",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>{h.sql_text.replace(/\s+/g, " ").slice(0, 80)}</div>
                  </button>
                ))}
              </div>
            )}
          </DbCard>
        </div>
      </div>
    </StellaShell>
  );
}
