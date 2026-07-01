// InfraHealthPage — Founder-only Infra Health snapshot for IA Azure resources.
//
// 2026-06-30 (G5-S8 of CRITICAL_DEFECTS_SCOPE_2026-06-30.md): Backend route
// at oliver-api/routes/admin/infraHealth.js → `/admin/infra-health/summary`.
// This page calls that route, renders DB sizes/DTU + tenant counts +
// SPARK 24h sends, and surfaces any ADR-001/002 upgrade-trigger warnings.
//
// No charts library — just plain divs + the existing Portal CSS variables.
// Refresh is manual (button). Auto-refresh + nightly digest are deferred to
// INFRA-MON-001 phase 2 (G5-S10).

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, AlertTriangle, ShieldCheck, Database, Users, Send } from "lucide-react";
import { useOliverApi } from "../../hooks/useOliverApi";

interface DbStats {
  tier: string;
  max_size_gb: number;
  current_size_gb: number | null;
  max_cpu_7d_pct: number | null;
  avg_cpu_7d_pct: number | null;
  as_of: string | null;
  error?: string;
}

interface TenantStats {
  total: number;
  active: number;
  with_finished_onboarding: number;
  error?: string;
}

interface SparkStats {
  sends_last_24h_total: number;
  by_tenant: Array<{ tenant_id: string; campaigns_24h: number; sends_24h: number }>;
  error?: string;
}

interface InfraHealthSummary {
  generated_at: string;
  db: { iadm_services: DbStats; iadm_platform: DbStats };
  active_tenants: TenantStats;
  spark: SparkStats;
  warnings: string[];
  notes: string;
}

function MetricCard({
  icon: Icon, title, children,
}: { icon: typeof Database; title: string; children: React.ReactNode }) {
  return (
    <div style={{
      border: "1px solid var(--ink-200, #e5e7eb)",
      borderRadius: 12,
      padding: 16,
      background: "var(--ink-0, #fff)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Icon size={18} color="var(--ink-500, #6b7280)" />
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-700, #374151)" }}>
          {title}
        </div>
      </div>
      <div style={{ fontSize: 13, color: "var(--ink-700, #374151)" }}>{children}</div>
    </div>
  );
}

function DbCard({ name, stats }: { name: string; stats: DbStats }) {
  if (stats.error) {
    return (
      <MetricCard icon={Database} title={name}>
        <div style={{ color: "var(--danger-600, #b91c1c)" }}>Error: {stats.error}</div>
      </MetricCard>
    );
  }
  const pctSize = stats.current_size_gb != null && stats.max_size_gb > 0
    ? Math.min(100, (stats.current_size_gb / stats.max_size_gb) * 100)
    : 0;
  return (
    <MetricCard icon={Database} title={name}>
      <div style={{ marginBottom: 8 }}>
        <strong>Tier:</strong> {stats.tier}
      </div>
      <div style={{ marginBottom: 8 }}>
        <strong>Storage:</strong> {stats.current_size_gb ?? "?"} / {stats.max_size_gb} GB ({pctSize.toFixed(1)}%)
        <div style={{
          height: 6, background: "var(--ink-100, #f3f4f6)", borderRadius: 3,
          marginTop: 4, overflow: "hidden",
        }}>
          <div style={{
            height: "100%",
            width: `${pctSize}%`,
            background: pctSize > 75 ? "var(--danger-500, #ef4444)" : pctSize > 50 ? "var(--warning-500, #f59e0b)" : "var(--success-500, #10b981)",
          }} />
        </div>
      </div>
      <div style={{ marginBottom: 4 }}>
        <strong>CPU 7d:</strong> max {stats.max_cpu_7d_pct?.toFixed(1) ?? "?"}% · avg {stats.avg_cpu_7d_pct?.toFixed(1) ?? "?"}%
      </div>
      {stats.as_of && (
        <div style={{ fontSize: 11, color: "var(--ink-500, #6b7280)", marginTop: 8 }}>
          as of {new Date(stats.as_of).toLocaleString()}
        </div>
      )}
    </MetricCard>
  );
}

export function InfraHealthPage() {
  const { getFounder, ready } = useOliverApi();
  const [data, setData] = useState<InfraHealthSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const r = await getFounder<InfraHealthSummary>("/admin/infra-health/summary");
      setData(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "fetch failed");
    } finally {
      setLoading(false);
    }
  }, [getFounder, ready]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "var(--ink-900, #111827)" }}>
            Infra Health
          </h1>
          <p style={{ fontSize: 13, color: "var(--ink-500, #6b7280)", margin: "4px 0 0" }}>
            Founder-only snapshot of Azure DB + tenant + SPARK metrics. Trigger thresholds per ADR-001/002.
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 16px",
            background: "var(--brand-600, #4f46e5)",
            color: "#fff", border: "none", borderRadius: 8,
            fontSize: 14, cursor: loading ? "wait" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div style={{
          padding: 16,
          background: "var(--danger-50, #fef2f2)",
          border: "1px solid var(--danger-200, #fecaca)",
          borderRadius: 8, marginBottom: 24,
          color: "var(--danger-700, #991b1b)",
        }}>
          <AlertTriangle size={16} style={{ display: "inline", marginRight: 6 }} />
          {error}
        </div>
      )}

      {data && data.warnings.length > 0 && (
        <div style={{
          padding: 16,
          background: "var(--warning-50, #fffbeb)",
          border: "1px solid var(--warning-200, #fde68a)",
          borderRadius: 8, marginBottom: 24,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 8, color: "var(--warning-800, #92400e)" }}>
            <AlertTriangle size={16} style={{ display: "inline", marginRight: 6 }} />
            {data.warnings.length} warning{data.warnings.length === 1 ? "" : "s"}:
          </div>
          <ul style={{ margin: 0, paddingLeft: 24, color: "var(--warning-800, #92400e)" }}>
            {data.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {data && data.warnings.length === 0 && (
        <div style={{
          padding: 12,
          background: "var(--success-50, #f0fdf4)",
          border: "1px solid var(--success-200, #bbf7d0)",
          borderRadius: 8, marginBottom: 24,
          color: "var(--success-700, #15803d)",
          fontSize: 13,
        }}>
          <ShieldCheck size={14} style={{ display: "inline", marginRight: 6 }} />
          All within ADR thresholds. No action required.
        </div>
      )}

      {data && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          <DbCard name="iadm_services (multi-tenant data)" stats={data.db.iadm_services} />
          <DbCard name="iadm_platform (signup + onboarding)" stats={data.db.iadm_platform} />
          <MetricCard icon={Users} title="Tenants">
            {data.active_tenants.error ? (
              <div style={{ color: "var(--danger-600, #b91c1c)" }}>Error: {data.active_tenants.error}</div>
            ) : (
              <>
                <div><strong>Total:</strong> {data.active_tenants.total}</div>
                <div><strong>Active:</strong> {data.active_tenants.active}</div>
                <div><strong>Finished onboarding:</strong> {data.active_tenants.with_finished_onboarding}</div>
                <div style={{ fontSize: 11, color: "var(--ink-500, #6b7280)", marginTop: 8 }}>
                  Re-baseline tier strategy at 30+ active.
                </div>
              </>
            )}
          </MetricCard>
          <MetricCard icon={Send} title="SPARK sends (24h)">
            {data.spark.error ? (
              <div style={{ color: "var(--danger-600, #b91c1c)" }}>Error: {data.spark.error}</div>
            ) : (
              <>
                <div><strong>Total:</strong> {data.spark.sends_last_24h_total}</div>
                <div style={{ fontSize: 11, color: "var(--ink-500, #6b7280)", marginTop: 8 }}>
                  ACS default cap: 2,400/day. File quota ticket if approaching.
                </div>
                {data.spark.by_tenant.length > 0 && (
                  <div style={{ marginTop: 12, fontSize: 12 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>By tenant:</div>
                    {data.spark.by_tenant.slice(0, 5).map((t) => (
                      <div key={t.tenant_id} style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontFamily: "monospace", fontSize: 11 }}>{t.tenant_id.slice(0, 8)}…</span>
                        <span>{t.sends_24h} ({t.campaigns_24h} campaigns)</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </MetricCard>
        </div>
      )}

      {data && (
        <div style={{ fontSize: 11, color: "var(--ink-500, #6b7280)", marginTop: 24 }}>
          Generated at {new Date(data.generated_at).toLocaleString()}. {data.notes}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
