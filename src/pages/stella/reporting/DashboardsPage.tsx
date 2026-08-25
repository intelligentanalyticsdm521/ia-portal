// DashboardsPage — pin saved reports onto a board and see them together.
//
// Every tile RUNS its report when the board opens. A dashboard of stale numbers
// is worse than no dashboard, and these reports are cheap: the compiler already
// caps and aggregates server-side.
import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, LayoutDashboard } from "lucide-react";
import { StellaShell, STELLA_INDIGO, STELLA_LAVENDER } from "../StellaShell";
import { useStellaApi } from "../../../hooks/useStellaApi";
import {
  DbCard, DbError, DbLoading, DbButton, DbInput, DbSelect, DbField,
  DbEmpty, DbNotice, useNotice, Pill, DbModal, CapLine,
} from "../dbmanager/DbManagerKit";
import { ReportChart, CHART_LABEL, type RunResult } from "./ReportKit";

type Tile = { dashboard_tile_id: string; saved_report_id: string; chart_type: string | null; report_name: string | null };
type Board = { dashboard_id: string; name: string; tiles: Tile[] };
type Saved = { saved_report_id: string; name: string; chart_type: string | null };

export function StellaDashboardsPage() {
  const api = useStellaApi();
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [meta, setMeta] = useState<{ limit: number | null; used: number } | null>(null);
  const [reports, setReports] = useState<Saved[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [notice, showNotice] = useNotice();
  const [creating, setCreating] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!api.ready) return;
    api.getFull<{ data: Board[]; meta: typeof meta }>("/reporting/dashboards")
      .then((r) => {
        setBoards(r.data); setMeta(r.meta);
        setActive((p) => p ?? r.data[0]?.dashboard_id ?? null);
      })
      .catch(setError);
  }, [api]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!api.ready) return;
    api.getFull<{ data: Saved[] }>("/reporting/saved").then((r) => setReports(r.data)).catch(() => setReports([]));
  }, [api]);

  const board = boards?.find((b) => b.dashboard_id === active) || null;

  async function create() {
    setBusy(true); setError(null);
    try {
      const r = await api.post<{ dashboard_id: string }>("/reporting/dashboards", { name: name.trim() });
      showNotice(`Created “${name.trim()}”.`);
      setCreating(false); setName(""); setActive(r.dashboard_id); load();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  async function addTile() {
    if (!active || !pick) return;
    setBusy(true); setError(null);
    try {
      await api.post(`/reporting/dashboards/${active}/tiles`, { saved_report_id: pick });
      setAdding(false); setPick(""); load();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  async function removeTile(t: Tile) {
    if (!active) return;
    try { await api.del(`/reporting/dashboards/${active}/tiles/${t.dashboard_tile_id}`); load(); }
    catch (e) { setError(e); }
  }

  async function removeBoard(b: Board) {
    if (!window.confirm(`Delete the dashboard “${b.name}”? The reports on it are not deleted.`)) return;
    setBusy(true);
    try {
      await api.del(`/reporting/dashboards/${b.dashboard_id}`);
      showNotice(`Deleted “${b.name}”.`);
      setActive(null); load();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  return (
    <StellaShell
      title="Dashboards"
      subtitle="Put the reports you check often on one page."
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          {board && <DbButton variant="ghost" onClick={() => setAdding(true)}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Plus size={13} /> Add a report</span>
          </DbButton>}
          <DbButton onClick={() => setCreating(true)}>New dashboard</DbButton>
        </div>
      }
    >
      <DbNotice text={notice} />
      <DbError error={error} />

      {!boards ? <DbLoading /> : boards.length === 0 ? (
        <DbCard>
          <DbEmpty
            title="No dashboards yet"
            reason="Create one, then pin the reports you look at every week so they're all in one place."
          />
        </DbCard>
      ) : (
        <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
            {boards.map((b) => (
              <button
                key={b.dashboard_id} onClick={() => setActive(b.dashboard_id)}
                style={{
                  padding: "6px 13px", borderRadius: 99, fontSize: 12, cursor: "pointer",
                  fontWeight: b.dashboard_id === active ? 700 : 500,
                  border: `1px solid ${b.dashboard_id === active ? STELLA_INDIGO : "#E2E8F0"}`,
                  background: b.dashboard_id === active ? "#E8E9FA" : "#fff",
                  color: b.dashboard_id === active ? STELLA_INDIGO : "#475569",
                }}
              >{b.name} <span style={{ color: "#94A3B8", fontWeight: 500 }}>· {b.tiles.length}</span></button>
            ))}
            <span style={{ flex: 1 }} />
            {meta && <CapLine used={meta.used} limit={meta.limit} noun="dashboards" />}
            {board && <DbButton variant="danger" onClick={() => removeBoard(board)} disabled={busy}><Trash2 size={12} /></DbButton>}
          </div>

          {!board ? null : board.tiles.length === 0 ? (
            <DbCard>
              <DbEmpty title={`“${board.name}” is empty`} reason="Add a saved report to it with the button above." />
            </DbCard>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 16 }}>
              {board.tiles.map((t) => <TileCard key={t.dashboard_tile_id} tile={t} onRemove={() => removeTile(t)} />)}
            </div>
          )}
        </>
      )}

      {creating && (
        <DbModal title="New dashboard" onClose={() => setCreating(false)} width={400}>
          <div style={{ display: "grid", gap: 12 }}>
            <DbField label="Name">
              <DbInput autoFocus value={name} maxLength={300} placeholder="e.g. Monday morning"
                onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") create(); }} />
            </DbField>
            <div style={{ display: "flex", gap: 8 }}>
              <DbButton onClick={create} disabled={busy || !name.trim()}>{busy ? "Creating…" : "Create"}</DbButton>
              <DbButton variant="ghost" onClick={() => setCreating(false)}>Cancel</DbButton>
            </div>
          </div>
        </DbModal>
      )}

      {adding && (
        <DbModal title="Add a report" onClose={() => setAdding(false)} width={440}>
          <div style={{ display: "grid", gap: 12 }}>
            <DbField label="Which report?">
              <DbSelect value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">— pick a saved report —</option>
                {reports.map((r) => <option key={r.saved_report_id} value={r.saved_report_id}>{r.name}</option>)}
              </DbSelect>
            </DbField>
            {!reports.length && (
              <div style={{ fontSize: 11, color: "#B54708" }}>
                You have no saved reports yet — build one first and save it.
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <DbButton onClick={addTile} disabled={busy || !pick}>Add</DbButton>
              <DbButton variant="ghost" onClick={() => setAdding(false)}>Cancel</DbButton>
            </div>
          </div>
        </DbModal>
      )}
    </StellaShell>
  );
}

/** One tile: runs its report on mount. */
function TileCard({ tile, onRemove }: { tile: Tile; onRemove: () => void }) {
  const api = useStellaApi();
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!api.ready) return;
    api.postFull<RunResult>(`/reporting/saved/${tile.saved_report_id}/run`, {})
      .then(setResult).catch(setError);
  }, [api, tile.saved_report_id]);

  return (
    <DbCard
      title={tile.report_name || "Report"}
      actions={
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Pill>{CHART_LABEL[tile.chart_type || "table"] || tile.chart_type}</Pill>
          <DbButton variant="ghost" onClick={onRemove} title="Remove from this dashboard"><Trash2 size={12} /></DbButton>
        </div>
      }
    >
      <DbError error={error} />
      {!result && !error ? <DbLoading /> : result ? (
        <ReportChart result={result} chartType={tile.chart_type || "table"} height={220} />
      ) : null}
    </DbCard>
  );
}
