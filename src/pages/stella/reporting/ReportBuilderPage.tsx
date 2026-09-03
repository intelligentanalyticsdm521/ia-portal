// ReportBuilderPage — the field-picker builder (62_STELLA_v3 §3.1 Mode B).
//
// Three rails: fields on the left, live preview in the middle, chart and
// filters on the right. Picking a field adds it as a grouping or a measure
// depending on what it is — a text column groups, a number measures — because
// asking a small-business owner to know the difference between a dimension and
// a metric is asking the wrong question.
//
// The preview runs the SAME compiler a saved report and a scheduled run use, so
// what you see while building is exactly what arrives in your inbox.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Save, Play, Plus, X, BarChart3 } from "lucide-react";
import { StellaShell, STELLA_INDIGO, STELLA_LAVENDER } from "../StellaShell";
import { useStellaApi } from "../../../hooks/useStellaApi";
import {
  DbCard, DbError, DbLoading, DbButton, DbInput, DbSelect, DbField,
  DbNotice, useNotice, Pill, DbModal,
} from "../dbmanager/DbManagerKit";
import { useFieldCatalog, ReportChart, CHART_LABEL, type ReportConfig, type RunResult, type FieldCol } from "./ReportKit";

const OPS = [
  { key: "eq", label: "is" }, { key: "ne", label: "is not" },
  { key: "contains", label: "contains" },
  { key: "gte", label: "is on or after / at least" }, { key: "lte", label: "is on or before / at most" },
  { key: "isnull", label: "is empty" }, { key: "notnull", label: "is not empty" },
];

export function StellaReportBuilderPage() {
  const api = useStellaApi();
  const { catalog, meta, error: catalogError } = useFieldCatalog();
  const [notice, showNotice] = useNotice();

  const [viewKey, setViewKey] = useState("");
  const [dimensions, setDimensions] = useState<{ column: string; bucket?: string | null }[]>([]);
  const [metrics, setMetrics] = useState<{ column: string; agg: string }[]>([]);
  const [filters, setFilters] = useState<{ column: string; op: string; value?: string }[]>([]);
  const [chartType, setChartType] = useState("bar");
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveForm, setSaveForm] = useState({ name: "", description: "", folder: "" });

  useEffect(() => {
    if (catalog && !viewKey) setViewKey(catalog.views[0]?.view_key || "");
  }, [catalog, viewKey]);

  const view = useMemo(() => catalog?.views.find((v) => v.view_key === viewKey) || null, [catalog, viewKey]);

  const config: ReportConfig | null = useMemo(() => {
    if (!viewKey || (!dimensions.length && !metrics.length)) return null;
    return { view_key: viewKey, dimensions, metrics, filters: filters.filter((f) => f.column), limit: 500 };
  }, [viewKey, dimensions, metrics, filters]);

  // Debounced so dragging through fields does not fire a query per keystroke.
  // 400ms is short enough to feel live and long enough to skip the noise.
  useEffect(() => {
    if (!config || !api.ready) { setResult(null); return; }
    const t = window.setTimeout(async () => {
      setRunning(true); setError(null);
      try {
        // POST because a config is a body, not a query string — and the preview
        // must go through the SAME compiler a saved run uses, or the builder is
        // showing you something a schedule will never send.
        const r = await api.postFull<RunResult>("/reporting/preview", { config });
        setResult(r);
      } catch (e) { setError(e); setResult(null); }
      finally { setRunning(false); }
    }, 400);
    return () => window.clearTimeout(t);
  }, [config, api]);

  function reset() { setDimensions([]); setMetrics([]); setFilters([]); setResult(null); }

  function addField(c: FieldCol) {
    // A number becomes a measure, anything else becomes a grouping. The user
    // picks "Amount" and means "total the amounts"; they pick "Vendor" and mean
    // "split it by vendor".
    if (c.numeric) {
      if (metrics.some((m) => m.column === c.key)) return;
      setMetrics((p) => [...p, { column: c.key, agg: "sum" }]);
    } else {
      if (dimensions.some((d) => d.column === c.key)) return;
      setDimensions((p) => [...p, { column: c.key, bucket: c.dateish ? "month" : null }]);
    }
  }

  async function save() {
    if (!config) return;
    setSaving(true); setError(null);
    try {
      await api.post("/reporting/saved", {
        name: saveForm.name.trim(), description: saveForm.description.trim() || null,
        folder: saveForm.folder.trim() || null, config, chart_type: chartType,
      });
      showNotice(`Saved “${saveForm.name.trim()}” to your report library.`);
      setSaveOpen(false); setSaveForm({ name: "", description: "", folder: "" });
    } catch (e) { setError(e); } finally { setSaving(false); }
  }

  if (catalogError) {
    return <StellaShell title="Report Builder" subtitle="Build a report from your own data."><DbError error={catalogError} /></StellaShell>;
  }

  return (
    <StellaShell
      title="Report Builder"
      subtitle="Pick what you want to see. STELLA writes the query, shows you the answer, and saves it if it's useful."
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          {(dimensions.length > 0 || metrics.length > 0) && <DbButton variant="ghost" onClick={reset}>Start over</DbButton>}
          <DbButton onClick={() => setSaveOpen(true)} disabled={!config}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Save size={13} /> Save report</span>
          </DbButton>
        </div>
      }
    >
      <DbNotice text={notice} />
      {!catalog ? <DbLoading /> : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(200px, 240px) 1fr minmax(210px, 250px)", gap: 16, alignItems: "start" }}>
          {/* Fields */}
          <DbCard title="Fields">
            <DbField label="From">
              <DbSelect value={viewKey} onChange={(e) => { setViewKey(e.target.value); reset(); }}>
                {catalog.views.map((v) => <option key={v.view_key} value={v.view_key}>{v.display_name}</option>)}
              </DbSelect>
            </DbField>
            <div style={{ fontSize: 10, color: "#94A3B8", margin: "8px 0 10px", lineHeight: 1.5 }}>
              Click a field to add it. Numbers are totalled; everything else groups the results.
            </div>
            <div style={{ display: "grid", gap: 2, maxHeight: 420, overflowY: "auto" }}>
              {view?.columns.map((c) => {
                const used = dimensions.some((d) => d.column === c.key) || metrics.some((m) => m.column === c.key);
                return (
                  <button
                    key={c.key} onClick={() => addField(c)} disabled={used}
                    style={{
                      textAlign: "left", padding: "6px 9px", borderRadius: 6, border: 0, cursor: used ? "default" : "pointer",
                      background: used ? "#F1F5F9" : "transparent", opacity: used ? 0.55 : 1,
                      display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#334155",
                    }}
                  >
                    <span style={{
                      width: 16, textAlign: "center", fontSize: 9, fontWeight: 700,
                      color: c.numeric ? "#027A48" : c.dateish ? "#B54708" : "#5A7A8A",
                    }}>{c.numeric ? "#" : c.dateish ? "◷" : "A"}</span>
                    {c.label}
                  </button>
                );
              })}
            </div>
          </DbCard>

          {/* Preview */}
          <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
            <DbCard
              title="Preview"
              actions={running ? <Pill tone="brand">running…</Pill> : result ? <Pill>{result.data.length} rows</Pill> : null}
            >
              <DbError error={error} />
              {!config ? (
                <div style={{ textAlign: "center", padding: "44px 20px", color: "#5A7A8A" }}>
                  <BarChart3 size={26} color="#C7D0DB" />
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#334155", marginTop: 10 }}>Pick a field to begin</div>
                  <div style={{ fontSize: 11, marginTop: 6, maxWidth: 380, margin: "6px auto 0", lineHeight: 1.5 }}>
                    Try <strong>Amount</strong> and <strong>Date</strong> from Transactions — that is “what did we spend, by month”.
                  </div>
                </div>
              ) : !result ? <DbLoading /> : (
                <ReportChart result={result} chartType={chartType} height={300} />
              )}
            </DbCard>

            {/* Shelves */}
            <DbCard title="What this report shows">
              <Shelf
                label="Grouped by" empty="Nothing — the report will show one total row."
                items={dimensions.map((d, i) => {
                  const c = view?.columns.find((x) => x.key === d.column);
                  return {
                    key: `${d.column}-${i}`,
                    label: c?.label || d.column,
                    extra: c?.dateish ? (
                      <DbSelect
                        value={d.bucket || "month"} style={{ width: 92, padding: "2px 6px", fontSize: 10 }}
                        onChange={(e) => setDimensions((p) => p.map((x, xi) => xi === i ? { ...x, bucket: e.target.value } : x))}
                      >
                        {catalog.date_buckets.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
                      </DbSelect>
                    ) : null,
                    onRemove: () => setDimensions((p) => p.filter((_, xi) => xi !== i)),
                  };
                })}
              />
              <Shelf
                label="Measuring" empty="Nothing — add a number to total."
                items={metrics.map((m, i) => {
                  const c = view?.columns.find((x) => x.key === m.column);
                  return {
                    key: `${m.column}-${i}`,
                    label: c?.label || m.column,
                    extra: (
                      <DbSelect
                        value={m.agg} style={{ width: 118, padding: "2px 6px", fontSize: 10 }}
                        onChange={(e) => setMetrics((p) => p.map((x, xi) => xi === i ? { ...x, agg: e.target.value } : x))}
                      >
                        {catalog.aggregations
                          .filter((a) => !a.numeric_only || c?.numeric)
                          .map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                      </DbSelect>
                    ),
                    onRemove: () => setMetrics((p) => p.filter((_, xi) => xi !== i)),
                  };
                })}
              />
            </DbCard>
          </div>

          {/* Chart + filters */}
          <div style={{ display: "grid", gap: 16 }}>
            <DbCard title="Show it as">
              <div style={{ display: "grid", gap: 4 }}>
                {catalog.chart_types.map((t) => (
                  <button
                    key={t} onClick={() => setChartType(t)}
                    style={{
                      textAlign: "left", padding: "7px 10px", borderRadius: 7, cursor: "pointer", fontSize: 12,
                      border: `1px solid ${t === chartType ? STELLA_INDIGO : "transparent"}`,
                      background: t === chartType ? "#E8E9FA" : "transparent",
                      color: t === chartType ? STELLA_INDIGO : "#334155",
                      fontWeight: t === chartType ? 700 : 500,
                    }}
                  >{CHART_LABEL[t] || t}</button>
                ))}
              </div>
            </DbCard>

            <DbCard
              title="Only include"
              actions={
                <DbButton variant="ghost" onClick={() => setFilters((p) => [...p, { column: "", op: "eq", value: "" }])}>
                  <Plus size={12} />
                </DbButton>
              }
            >
              {!filters.length ? (
                <div style={{ fontSize: 11, color: "#94A3B8" }}>Everything. Add a filter to narrow it down.</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {filters.map((f, i) => {
                    const needsValue = f.op !== "isnull" && f.op !== "notnull";
                    return (
                      <div key={i} style={{ display: "grid", gap: 4, paddingBottom: 8, borderBottom: "1px solid #F1F5F9" }}>
                        <div style={{ display: "flex", gap: 4 }}>
                          <DbSelect
                            value={f.column} style={{ fontSize: 11 }}
                            onChange={(e) => setFilters((p) => p.map((x, xi) => xi === i ? { ...x, column: e.target.value } : x))}
                          >
                            <option value="">— field —</option>
                            {view?.columns.filter((c) => c.filterable).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                          </DbSelect>
                          <DbButton variant="ghost" onClick={() => setFilters((p) => p.filter((_, xi) => xi !== i))}>
                            <X size={11} />
                          </DbButton>
                        </div>
                        <DbSelect
                          value={f.op} style={{ fontSize: 11 }}
                          onChange={(e) => setFilters((p) => p.map((x, xi) => xi === i ? { ...x, op: e.target.value } : x))}
                        >
                          {OPS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                        </DbSelect>
                        {needsValue && (
                          <DbInput
                            value={f.value || ""} placeholder="value" style={{ fontSize: 11 }}
                            onChange={(e) => setFilters((p) => p.map((x, xi) => xi === i ? { ...x, value: e.target.value } : x))}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </DbCard>

            {meta && (
              <div style={{ fontSize: 10, color: "#94A3B8", lineHeight: 1.5, padding: "0 4px" }}>
                {meta.limits.saved_reports === null
                  ? "Unlimited saved reports on your plan."
                  : `Up to ${meta.limits.saved_reports} saved reports on your plan.`}
              </div>
            )}
          </div>
        </div>
      )}

      {saveOpen && (
        <DbModal title="Save this report" onClose={() => setSaveOpen(false)} width={440}>
          <div style={{ display: "grid", gap: 12 }}>
            <DbField label="Name">
              <DbInput autoFocus value={saveForm.name} maxLength={300} placeholder="e.g. Spend by month"
                onChange={(e) => setSaveForm({ ...saveForm, name: e.target.value })} />
            </DbField>
            <DbField label="Description" hint="Optional — what question does this answer?">
              <DbInput value={saveForm.description} maxLength={1000}
                onChange={(e) => setSaveForm({ ...saveForm, description: e.target.value })} />
            </DbField>
            <DbField label="Folder" hint="Optional — groups it in the library">
              <DbInput value={saveForm.folder} maxLength={200} placeholder="e.g. Month end"
                onChange={(e) => setSaveForm({ ...saveForm, folder: e.target.value })} />
            </DbField>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <DbButton onClick={save} disabled={saving || !saveForm.name.trim()}>
                {saving ? "Saving…" : "Save"}
              </DbButton>
              <DbButton variant="ghost" onClick={() => setSaveOpen(false)}>Cancel</DbButton>
            </div>
          </div>
        </DbModal>
      )}
    </StellaShell>
  );
}

function Shelf({ label, items, empty }: {
  label: string; empty: string;
  items: { key: string; label: string; extra?: React.ReactNode; onRemove: () => void }[];
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>
        {label}
      </div>
      {!items.length ? (
        <div style={{ fontSize: 11, color: "#94A3B8" }}>{empty}</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {items.map((it) => (
            <span key={it.key} style={{
              display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 6px 4px 10px",
              border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 7, background: "#FAFBFF", fontSize: 11, color: "#334155",
            }}>
              {it.label}
              {it.extra}
              <button onClick={it.onRemove} style={{ background: "none", border: 0, cursor: "pointer", color: "#94A3B8", padding: 0, lineHeight: 1 }}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
