// WarningsPage — the Data Engineer warning queue.
//
// SCOPE, stated plainly on the page: this milestone builds the QUEUE. The
// trust-layer rules that RAISE warnings are a later piece of work, so a healthy
// tenant sees an empty list — and that is correct, not broken. The API says so
// too (`meta.producers_live`), and the empty state reads differently depending
// on it. An empty queue that looks like a bug costs a support conversation.
import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, Check, Eye } from "lucide-react";
import { StellaShell, StellaTabs, STELLA_INDIGO, STELLA_LAVENDER } from "../StellaShell";
import { useStellaApi } from "../../../hooks/useStellaApi";
import {
  DbCard, DbError, DbLoading, DbButton, DbEmpty, DbNotice, useNotice, Pill, DbTable,
} from "./DbManagerKit";

type Warning = {
  data_engineer_warning_id: string; severity: string; rule_key: string;
  entity_ref: string | null; message: string | null; status: string; created_at: string;
};
type Meta = { statuses: string[]; counts: Record<string, number>; producers_live: boolean };

export function StellaWarningsPage() {
  const api = useStellaApi();
  const [tab, setTab] = useState("open");
  const [items, setItems] = useState<Warning[] | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [notice, showNotice] = useNotice();
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!api.ready) return;
    setItems(null);
    api.getFull<{ data: Warning[]; meta: Meta }>(`/db-manager/warnings?status=${tab}`)
      .then((r) => { setItems(r.data); setMeta(r.meta); })
      .catch(setError);
  }, [api, tab]);

  useEffect(() => { load(); }, [load]);

  async function setStatus(w: Warning, status: string) {
    setBusy(true); setError(null);
    try {
      await api.patch(`/db-manager/warnings/${w.data_engineer_warning_id}`, { status });
      showNotice(status === "resolved" ? "Marked resolved." : "Acknowledged.");
      load();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  if (error && !items) {
    return <StellaShell title="Data Engineer Warnings" subtitle="Data quality checks."><DbError error={error} /></StellaShell>;
  }

  return (
    <StellaShell
      title="Data Engineer Warnings"
      subtitle="Anything about your data that looks off — duplicates, gaps, numbers that don't reconcile."
    >
      <DbNotice text={notice} />
      <DbError error={error} />

      {meta && !meta.producers_live && (
        <div style={{
          display: "flex", gap: 9, alignItems: "flex-start", background: "#FAFBFF",
          border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 8, padding: "10px 12px", marginBottom: 14,
        }}>
          <ShieldCheck size={15} color={STELLA_INDIGO} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.55 }}>
            <strong style={{ color: "#0B1C24" }}>The queue is live; the checks that fill it are not yet.</strong>{" "}
            This page is ready and will show warnings the moment the data-quality rules start running. Until then an
            empty list means exactly that — no checks have run, not that your data is confirmed clean.
          </div>
        </div>
      )}

      <StellaTabs
        tabs={[
          { key: "open", label: `Open${meta?.counts.open ? ` (${meta.counts.open})` : ""}` },
          { key: "acknowledged", label: "Acknowledged" },
          { key: "resolved", label: "Resolved" },
        ]}
        active={tab} onChange={setTab}
      />

      <DbCard>
        {!items ? <DbLoading /> : (
          <DbTable
            columns={[
              { key: "severity", label: "Severity" },
              { key: "rule_key", label: "Check" },
              { key: "message", label: "What we found" },
              { key: "created_at", label: "Raised", type: "datetime" },
              { key: "action", label: "" },
            ]}
            rows={items.map((w) => ({
              ...w,
              severity: <Pill tone={(w.severity === "high" ? "bad" : w.severity === "medium" ? "warn" : "neutral") as never}>
                {w.severity}
              </Pill>,
              rule_key: <code style={{ fontSize: 10, color: "#64748B" }}>{w.rule_key}</code>,
              message: <span style={{ whiteSpace: "normal" }}>{w.message || "—"}</span>,
              action: tab === "resolved" ? null : (
                <span style={{ display: "inline-flex", gap: 6 }}>
                  {tab === "open" && (
                    <DbButton variant="ghost" onClick={() => setStatus(w, "acknowledged")} disabled={busy} title="Acknowledge">
                      <Eye size={13} />
                    </DbButton>
                  )}
                  <DbButton variant="ghost" onClick={() => setStatus(w, "resolved")} disabled={busy} title="Mark resolved">
                    <Check size={13} />
                  </DbButton>
                </span>
              ),
            })) as never}
            empty={<DbEmpty
              title={tab === "open" ? "No warnings" : `Nothing ${tab}`}
              reason={tab === "open" && meta && !meta.producers_live
                ? "No data-quality checks have run yet, so there is nothing here to review."
                : tab === "open"
                  ? "Nothing about your data currently looks off."
                  : undefined}
            />}
          />
        )}
      </DbCard>
    </StellaShell>
  );
}
