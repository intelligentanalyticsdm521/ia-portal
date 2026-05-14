// SparkSmokeTestPage — Per-tenant smoke-test runner (v6.11).
//
// A checklist of self-tests against the live SPARK + IA Insights + cross-
// product endpoints. Each test fires the relevant GET (read-only — we don't
// create data here) and grades the response. Useful during manual testing
// sessions or "is everything still wired correctly?" sanity checks.
//
// Results are kept in localStorage per tenant so a refresh doesn't wipe
// the last green-light timestamp.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { useAccessToken } from "../../auth/useAccessToken";
import { useAppState } from "../../app/AppState";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { CheckCircle, XCircle, Circle, Play, RefreshCw, Activity, AlertCircle } from "lucide-react";

type Status = "idle" | "running" | "pass" | "fail" | "skipped";

interface TestCase {
  key: string;
  section: string;
  label: string;
  /** Optional notes shown under the test row. */
  notes?: string;
  /** Returns true on success, false on failure. Throws on hard error. */
  run: () => Promise<{ pass: boolean; detail?: string }>;
}

interface TestResult {
  status: Status;
  detail?: string;
  durationMs?: number;
  ranAt?: string;
}

export function SparkSmokeTestPage() {
  const { get, ready, post: _post } = useSparkApi();
  void _post;
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();

  // ── Test catalog ─────────────────────────────────────────────────────
  const tests: TestCase[] = useMemo(() => [
    // ── Auth & basics ──
    { key: "tenant_id_present", section: "Auth", label: "Active tenant ID is set", run: async () => ({ pass: !!activeTenantId, detail: activeTenantId || "no tenant" }) },
    { key: "token_acquire", section: "Auth", label: "MSAL token acquires", run: async () => {
      const t = await getToken();
      return { pass: !!t?.accessToken, detail: t?.accessToken ? `length ${t.accessToken.length}` : "no token" };
    } },
    // ── Core SPARK reads ──
    { key: "contacts_list", section: "SPARK CRM", label: "GET /api/v1/contacts", run: async () => {
      const r = await get<{ data: any[] }>("/api/v1/contacts?limit=1");
      return { pass: Array.isArray(r?.data), detail: `${r?.data?.length ?? 0} contact(s) returned` };
    } },
    { key: "forms_list", section: "SPARK CRM", label: "GET /api/v1/forms", run: async () => {
      const r = await get<{ data: any[] }>("/api/v1/forms");
      return { pass: Array.isArray(r?.data), detail: `${r?.data?.length ?? 0} form(s)` };
    } },
    { key: "campaigns_list", section: "SPARK Outreach", label: "GET /api/v1/campaigns", run: async () => {
      const r = await get<{ data: any[] }>("/api/v1/campaigns");
      return { pass: Array.isArray(r?.data), detail: `${r?.data?.length ?? 0} campaign(s)` };
    } },
    { key: "sms_campaigns_list", section: "SPARK Outreach", label: "GET /api/v1/sms-campaigns (v1.15)", run: async () => {
      const r = await get<{ data: any[] }>("/api/v1/sms-campaigns");
      return { pass: Array.isArray(r?.data), detail: `${r?.data?.length ?? 0} SMS campaign(s)` };
    } },
    { key: "automations_list", section: "SPARK Outreach", label: "GET /api/v1/automations", run: async () => {
      const r = await get<{ data: any[] }>("/api/v1/automations");
      return { pass: Array.isArray(r?.data), detail: `${r?.data?.length ?? 0} automation(s)` };
    } },
    // ── Usage / activity ──
    { key: "usage_monthly", section: "Usage", label: "GET /api/v1/usage", run: async () => {
      const r = await get<{ data: { tier?: string } }>("/api/v1/usage");
      return { pass: !!r?.data, detail: `tier=${r?.data?.tier ?? "?"}` };
    } },
    { key: "usage_realtime", section: "Usage", label: "GET /api/v1/usage/realtime (v4.5)", run: async () => {
      const r = await get<{ today?: object }>("/api/v1/usage/realtime?minutes=60");
      return { pass: !!r?.today, detail: r?.today ? "today payload present" : "no today block" };
    } },
    { key: "activity_stream", section: "Usage", label: "GET /api/v1/activity (v1.12)", run: async () => {
      const r = await get<{ data: any[] }>("/api/v1/activity?limit=1");
      return { pass: Array.isArray(r?.data), detail: `${r?.data?.length ?? 0} activity event(s)` };
    } },
    // ── IA Insights ──
    { key: "ia_inputs_spark", section: "IA Insights", label: "GET /ia-insights/inputs?product=spark (v5.16)", run: async () => {
      const r = await get<{ period_days?: number }>("/api/v1/ia-insights/inputs?product=spark&days=90");
      return { pass: typeof r?.period_days === "number", detail: `period_days=${r?.period_days}` };
    } },
    { key: "ia_inputs_oliver", section: "IA Insights", label: "GET /ia-insights/inputs?product=oliver (v5.17)", run: async () => {
      const r = await get<{ period_days?: number }>("/api/v1/ia-insights/inputs?product=oliver&days=90");
      return { pass: typeof r?.period_days === "number", detail: `period_days=${r?.period_days}` };
    } },
    { key: "ia_prior_spark", section: "IA Insights", label: "GET /ia-insights/prior-scores?product=spark", run: async () => {
      const r = await get<{ data: object }>("/api/v1/ia-insights/prior-scores?product=spark");
      return { pass: !!r?.data, detail: `${Object.keys(r?.data || {}).length} report(s) with history` };
    } },
    { key: "ia_benchmarks", section: "IA Insights", label: "GET /ia-insights/benchmarks?category=home_services (v5.13)", run: async () => {
      const r = await get<{ data: any[] }>("/api/v1/ia-insights/benchmarks?category=home_services");
      return { pass: Array.isArray(r?.data) && r.data.length > 0, detail: `${r?.data?.length ?? 0} benchmark row(s)` };
    } },
    // ── Workflow + Anomaly ──
    { key: "anomaly_rules", section: "Workflow", label: "GET /api/v1/anomaly-rules (v1.19)", run: async () => {
      const r = await get<{ data: any[] }>("/api/v1/anomaly-rules");
      return { pass: Array.isArray(r?.data), detail: `${r?.data?.length ?? 0} rule(s)` };
    } },
    { key: "anomaly_subs", section: "Workflow", label: "GET /api/v1/anomaly-subscribers (v2.5)", run: async () => {
      const r = await get<{ data: any[] }>("/api/v1/anomaly-subscribers");
      return { pass: Array.isArray(r?.data), detail: `${r?.data?.length ?? 0} subscriber(s)` };
    } },
    { key: "workflow_triggers", section: "Workflow", label: "GET /api/v1/workflow-triggers (v4.1)", run: async () => {
      const r = await get<{ data: any[] }>("/api/v1/workflow-triggers");
      return { pass: Array.isArray(r?.data), detail: `${r?.data?.length ?? 0} trigger(s)` };
    } },
    // ── Admin & config ──
    { key: "tenant_secrets", section: "Admin", label: "GET /api/v1/tenant-secrets (v1.11)", run: async () => {
      const r = await get<{ data: any[] }>("/api/v1/tenant-secrets");
      return { pass: Array.isArray(r?.data), detail: `${r?.data?.length ?? 0} secret(s)` };
    } },
    { key: "tenant_settings", section: "Admin", label: "GET /api/v1/tenant-settings (v5.23)", run: async () => {
      const r = await get<{ data: object }>("/api/v1/tenant-settings");
      return { pass: typeof r?.data === "object", detail: `${Object.keys(r?.data || {}).length} setting(s)` };
    } },
    { key: "rate_limits", section: "Admin", label: "GET /api/v1/rate-limits (v3.5)", run: async () => {
      const r = await get<{ data: { requests_per_minute?: number } }>("/api/v1/rate-limits");
      return { pass: typeof r?.data?.requests_per_minute === "number", detail: `rpm=${r?.data?.requests_per_minute}` };
    } },
    { key: "quiet_hours", section: "Admin", label: "GET /api/v1/quiet-hours (v3.3)", run: async () => {
      const r = await get<{ data: { enabled?: boolean } }>("/api/v1/quiet-hours");
      return { pass: typeof r?.data?.enabled === "boolean", detail: r?.data?.enabled ? "enabled" : "disabled" };
    } },
    { key: "config_export", section: "Admin", label: "GET /api/v1/config/export (v4.4)", run: async () => {
      const r = await get<{ version?: number }>("/api/v1/config/export");
      return { pass: typeof r?.version === "number", detail: `export version=${r?.version}` };
    } },
    // ── Webhooks ──
    { key: "webhook_subs", section: "Webhooks", label: "GET /api/v1/webhook-subscriptions", run: async () => {
      const r = await get<{ data: any[] }>("/api/v1/webhook-subscriptions");
      return { pass: Array.isArray(r?.data), detail: `${r?.data?.length ?? 0} subscription(s)` };
    } },
    { key: "webhook_deliveries", section: "Webhooks", label: "GET /api/v1/webhook-deliveries (v3.1)", run: async () => {
      const r = await get<{ data: any[] }>("/api/v1/webhook-deliveries?days=7&limit=1");
      return { pass: Array.isArray(r?.data), detail: `${r?.data?.length ?? 0} recent delivery(s)` };
    } },
    // ── Audit log (proxy) ──
    { key: "audit_log", section: "Audit", label: "GET /api/v1/audit-log (v1.16)", run: async () => {
      const r = await get<{ data: any[] }>("/api/v1/audit-log?days=7&limit=1");
      return { pass: Array.isArray(r?.data), detail: `${r?.data?.length ?? 0} entry(s)` };
    } },
  ], [get, getToken, activeTenantId]);

  // ── Result state (per-test) ─────────────────────────────────────────
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [running, setRunning] = useState(false);

  const lsKey = activeTenantId ? `iadm.smoketest.${activeTenantId}` : "";
  // Load saved results
  useEffect(() => {
    if (!lsKey) return;
    try {
      const raw = window.localStorage.getItem(lsKey);
      if (raw) setResults(JSON.parse(raw));
    } catch { /* swallow */ }
  }, [lsKey]);

  function setResult(key: string, partial: TestResult) {
    setResults((curr) => {
      const next = { ...curr, [key]: partial };
      if (lsKey) {
        try { window.localStorage.setItem(lsKey, JSON.stringify(next)); } catch { /* swallow */ }
      }
      return next;
    });
  }

  const runOne = useCallback(async (t: TestCase) => {
    if (!ready) return;
    setResult(t.key, { ...results[t.key], status: "running" });
    const started = performance.now();
    try {
      const r = await t.run();
      setResult(t.key, {
        status: r.pass ? "pass" : "fail",
        detail: r.detail,
        durationMs: Math.round(performance.now() - started),
        ranAt: new Date().toISOString(),
      });
    } catch (err) {
      setResult(t.key, {
        status: "fail",
        detail: (err as Error).message?.slice(0, 200) || "Unknown error",
        durationMs: Math.round(performance.now() - started),
        ranAt: new Date().toISOString(),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  async function runAll() {
    if (!ready || running) return;
    setRunning(true);
    for (const t of tests) {
      // Sequential to avoid hammering the API
      // eslint-disable-next-line no-await-in-loop
      await runOne(t);
    }
    setRunning(false);
  }

  function clearResults() {
    setResults({});
    if (lsKey) {
      try { window.localStorage.removeItem(lsKey); } catch { /* swallow */ }
    }
  }

  // ── Aggregate stats ─────────────────────────────────────────────────
  const passCount = Object.values(results).filter((r) => r.status === "pass").length;
  const failCount = Object.values(results).filter((r) => r.status === "fail").length;
  const totalRun = passCount + failCount;
  const sections = Array.from(new Set(tests.map((t) => t.section)));
  const lastRunAt = Object.values(results)
    .map((r) => r.ranAt)
    .filter(Boolean)
    .sort()
    .pop();

  return (
    <SparkPageShell
      title="Tenant Smoke Test"
      subtitle={`${tests.length} read-only checks across ${sections.length} feature areas`}
      help="Run every check to verify your tenant's backend wiring is healthy. All tests are GET-only — no data is created. Results persist in localStorage per-tenant so you can leave the page and come back."
      actions={
        <div className="flex items-center gap-2">
          {lastRunAt && <span className="text-[10px] text-slate-500">Last run {new Date(lastRunAt).toLocaleString()}</span>}
          <button onClick={clearResults} className="text-xs px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50">
            Clear
          </button>
          <button onClick={runAll} disabled={!ready || running} className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white flex items-center gap-1 disabled:opacity-50">
            <Play className="h-4 w-4" /> {running ? "Running…" : "Run all"}
          </button>
        </div>
      }
    >
      {/* Summary banner */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        <SummaryTile label="Total tests" value={tests.length} color="#64748B" />
        <SummaryTile label="Run" value={totalRun} color="#0F766E" />
        <SummaryTile label="Pass" value={passCount} color="#16A34A" />
        <SummaryTile label="Fail" value={failCount} color={failCount > 0 ? "#DC2626" : "#94A3B8"} />
      </div>

      {sections.map((sec) => {
        const sectionTests = tests.filter((t) => t.section === sec);
        return (
          <div key={sec} className="rounded-lg border border-slate-200 bg-white p-3 mb-3">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4 text-[#EF6C33]" />
              <span className="font-semibold text-sm text-slate-900">{sec}</span>
              <span className="text-[10px] text-slate-500">({sectionTests.length})</span>
            </div>
            <ul className="divide-y divide-slate-100">
              {sectionTests.map((t) => {
                const r = results[t.key];
                return <TestRow key={t.key} test={t} result={r} onRun={() => runOne(t)} disabled={running} />;
              })}
            </ul>
          </div>
        );
      })}

      {failCount > 0 && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900">
          <div className="flex items-center gap-1 font-semibold mb-1">
            <AlertCircle className="h-3.5 w-3.5" /> {failCount} test{failCount === 1 ? "" : "s"} failed
          </div>
          <p>Expand each failing row to see the failure detail. Common causes: missing tenant role, deploy lag (recently-shipped endpoint not live yet), or migrated table missing on a stale environment.</p>
        </div>
      )}
    </SparkPageShell>
  );
}

function TestRow({
  test, result, onRun, disabled,
}: {
  test: TestCase; result: TestResult | undefined; onRun: () => void; disabled: boolean;
}) {
  const status = result?.status || "idle";
  const Icon = status === "pass" ? CheckCircle : status === "fail" ? XCircle : status === "running" ? RefreshCw : Circle;
  const color = status === "pass" ? "#16A34A" : status === "fail" ? "#DC2626" : status === "running" ? "#EF6C33" : "#94A3B8";
  return (
    <li className="py-2 flex items-center gap-2">
      <Icon className={`h-4 w-4 flex-shrink-0 ${status === "running" ? "animate-spin" : ""}`} style={{ color }} />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-slate-900">{test.label}</div>
        {result?.detail && (
          <div className={`text-[10px] mt-0.5 ${status === "fail" ? "text-red-700" : "text-slate-500"}`}>
            {result.detail}
            {result.durationMs != null && <span className="text-slate-400"> · {result.durationMs}ms</span>}
          </div>
        )}
        {test.notes && <div className="text-[10px] text-slate-400 italic mt-0.5">{test.notes}</div>}
      </div>
      <button
        onClick={onRun}
        disabled={disabled}
        className="text-[10px] px-2 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1 flex-shrink-0"
      >
        <Play className="h-3 w-3" /> Run
      </button>
    </li>
  );
}

function SummaryTile({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide mb-1">{label}</div>
      <div className="text-3xl font-bold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

export default SparkSmokeTestPage;
