// ReportKit — the shared pieces of Custom Reporting: the chart renderer and
// the field-catalog hook that every reporting page needs.
//
// Charts use recharts, already a Portal dependency and already the house
// charting library (StellaOverviewPage, the ARION dashboards). Nothing new is
// introduced for this surface.
import { useEffect, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { useStellaApi } from "../../../hooks/useStellaApi";
import { STELLA_INDIGO, fmtMoney } from "../StellaShell";
import { DbTable, DbEmpty, type DbColumn } from "../dbmanager/DbManagerKit";

export type FieldCol = {
  key: string; label: string; type: string;
  filterable: boolean; sortable: boolean; numeric: boolean; dateish: boolean;
};
export type FieldView = { view_key: string; display_name: string; description: string; columns: FieldCol[] };
export type FieldCatalog = {
  views: FieldView[];
  aggregations: { key: string; label: string; numeric_only: boolean }[];
  date_buckets: { key: string; label: string }[];
  chart_types: string[];
};
export type CatalogMeta = {
  current_tier: string;
  limits: { saved_reports: number | null; dashboards: number | null; scheduled_reports: number | null };
  sql_sandbox: boolean;
};

export type ReportConfig = {
  view_key: string;
  dimensions: { column: string; bucket?: string | null }[];
  metrics: { column: string; agg: string }[];
  filters: { column: string; op: string; value?: string }[];
  sort?: { key: string; dir: string } | null;
  limit?: number;
};

export type RunResult = { data: Record<string, unknown>[]; columns: DbColumn[] };

/** One fetch of the field catalog, shared by the builder and the library. */
export function useFieldCatalog() {
  const api = useStellaApi();
  const [catalog, setCatalog] = useState<FieldCatalog | null>(null);
  const [meta, setMeta] = useState<CatalogMeta | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (!api.ready) return;
    api.getFull<{ data: FieldCatalog; meta: CatalogMeta }>("/reporting/fields")
      .then((r) => { setCatalog(r.data); setMeta(r.meta); })
      .catch(setError);
  }, [api]);
  return { catalog, meta, error };
}

// A categorical palette that stays legible in a legend and does not rely on
// hue alone for adjacent series.
const SERIES = ["#4C5BD4", "#0BA5A5", "#B54708", "#7A5AF8", "#0E7490", "#B42318", "#5A7A8A", "#027A48"];

/**
 * Render a result set as the chosen chart, or as a table.
 *
 * The FIRST column is the category axis and every numeric column after it is a
 * series — which is exactly how the builder arranges dimensions then metrics,
 * so what you picked is what you see.
 */
export function ReportChart({ result, chartType, height = 280 }: {
  result: RunResult; chartType: string; height?: number;
}) {
  const { data, columns } = result;
  if (!data.length) {
    return <DbEmpty title="No rows" reason="Nothing matched this report. Try widening the filters or the date range." />;
  }
  if (chartType === "table" || !chartType) {
    return <DbTable columns={columns} rows={data} />;
  }

  const cat = columns[0];
  const series = columns.slice(1).filter((c) => c.type === "decimal" || c.type === "int");
  if (!cat || !series.length) {
    // A chart needs a category and at least one number. Saying so beats
    // rendering empty axes and letting the user wonder what they did wrong.
    return (
      <>
        <div style={{ fontSize: 11, color: "#B54708", marginBottom: 10 }}>
          This report has no numeric column to plot, so it is shown as a table.
        </div>
        <DbTable columns={columns} rows={data} />
      </>
    );
  }

  // recharts wants plain numbers; a decimal arriving as a string plots as 0.
  const rows = data.map((r) => {
    const o: Record<string, unknown> = { __cat: String(r[cat.key] ?? "") };
    for (const s of series) o[s.key] = Number(r[s.key] ?? 0);
    return o;
  });

  const axis = { fontSize: 11, fill: "#5A7A8A" };
  const common = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F6" />
      <XAxis dataKey="__cat" tick={axis} />
      <YAxis tick={axis} />
      <Tooltip formatter={(v, name) => [fmtMoney(Number(v ?? 0)), series.find((s) => s.key === String(name))?.label || String(name)]} />
      <Legend formatter={(name) => series.find((s) => s.key === String(name))?.label || String(name)} wrapperStyle={{ fontSize: 11 }} />
    </>
  );

  if (chartType === "kpi") {
    return (
      <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
        {series.map((s) => {
          const total = rows.reduce((acc, r) => acc + Number(r[s.key] || 0), 0);
          return (
            <div key={s.key}>
              <div style={{ fontSize: 11, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.4 }}>{s.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: STELLA_INDIGO, fontVariantNumeric: "tabular-nums" }}>
                {fmtMoney(total)}
              </div>
              <div style={{ fontSize: 10, color: "#94A3B8" }}>across {rows.length} {cat.label.toLowerCase()}</div>
            </div>
          );
        })}
      </div>
    );
  }

  if (chartType === "pie") {
    const s = series[0];
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={rows} dataKey={s.key} nameKey="__cat" outerRadius={height / 2.8} label={false}>
            {rows.map((_, i) => <Cell key={i} fill={SERIES[i % SERIES.length]} />)}
          </Pie>
          <Tooltip formatter={(v) => fmtMoney(Number(v ?? 0))} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      {chartType === "line" ? (
        <LineChart data={rows}>
          {common}
          {series.map((s, i) => <Line key={s.key} type="monotone" dataKey={s.key} stroke={SERIES[i % SERIES.length]} strokeWidth={2} dot={false} />)}
        </LineChart>
      ) : chartType === "area" ? (
        <AreaChart data={rows}>
          {common}
          {series.map((s, i) => (
            <Area key={s.key} type="monotone" dataKey={s.key} stroke={SERIES[i % SERIES.length]} fill={SERIES[i % SERIES.length]} fillOpacity={0.18} />
          ))}
        </AreaChart>
      ) : (
        <BarChart data={rows}>
          {common}
          {series.map((s, i) => <Bar key={s.key} dataKey={s.key} fill={SERIES[i % SERIES.length]} radius={[3, 3, 0, 0]} />)}
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}

export const CHART_LABEL: Record<string, string> = {
  table: "Table", bar: "Bar", line: "Line", area: "Area", pie: "Pie", kpi: "Big number",
};
