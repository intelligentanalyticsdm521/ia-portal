// pages/admin/ErrorLogPage.tsx — Sept 2026 Release A (F7).
//
// Founder-only viewer over core.error_log: every >=400 response from all four
// APIs, newest first. The point: when a client says "I can't add clients",
// the failed attempt is HERE — api, path, status, error code, request id —
// instead of being reverse-engineered from a support ticket.
//
// Route: /app/admin/error-log (RequireFounderRoute; backend 403s non-founders
// independently). Data: platform-api GET /admin/error-log.
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useMsal } from "@azure/msal-react";
import { RefreshCw, AlertTriangle, Filter, X } from "lucide-react";
import { useActiveAccount } from "../../auth/useAccessToken";
import { acquireApiToken } from "../../lib/msalToken";
import { useAppState } from "../../app/AppState";
import { getErrorLog, type ErrorLogRow } from "../../lib/platformApi";

const APIS = ["", "platform", "lumen", "oliver", "arion"] as const;
const PAGE = 200;

function statusTone(status: number): string {
  if (status >= 500) return "#dc2626"; // red — server fault
  if (status === 401 || status === 403) return "#d97706"; // amber — access
  return "#6b7280"; // gray — client 4xx
}

export default function ErrorLogPage() {
  const { instance } = useMsal();
  const account = useActiveAccount();
  const { active } = useAppState();

  const [rows, setRows] = useState<ErrorLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tenant, setTenant] = useState("");
  const [api, setApi] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);

  const filters = useMemo(
    () => ({
      tenant: tenant || undefined,
      api: api || undefined,
      status: status ? parseInt(status) : undefined,
      from: from || undefined,
      to: to || undefined,
      q: q || undefined,
      limit: PAGE,
      offset,
    }),
    [tenant, api, status, from, to, q, offset]
  );

  const load = useCallback(
    async (append: boolean) => {
      if (!account || !active?.tenant?.tenantId) return;
      setLoading(true);
      setError(null);
      try {
        const token = await acquireApiToken(instance, account);
        const r = await getErrorLog({
          baseUrl: import.meta.env.VITE_PLATFORM_API_BASE_URL,
          bearerToken: token,
          tenantId: active.tenant.tenantId,
          filters,
        });
        setTotal(r.total);
        setRows((prev) => (append ? [...prev, ...r.rows] : r.rows));
      } catch (e: any) {
        setError(e?.message || "Failed to load the error log.");
      } finally {
        setLoading(false);
      }
    },
    [instance, account, active?.tenant?.tenantId, filters]
  );

  useEffect(() => {
    load(offset > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const resetAnd = (fn: () => void) => {
    setOffset(0);
    fn();
  };

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <AlertTriangle size={22} style={{ color: "#dc2626" }} />
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Client-Facing Error Log</h1>
        <button
          // When offset > 0, setOffset(0) alone re-triggers the effect at the
          // new offset; calling load(false) directly too would race a stale
          // offset-200 replace-fetch against the offset-0 one
          // (adversarial-review finding).
          onClick={() => { if (offset === 0) load(false); else setOffset(0); }}
          disabled={loading}
          style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>
      <p style={{ color: "#6b7280", marginTop: 0, marginBottom: 16 }}>
        Every 4xx/5xx response across platform, SPARK, OLIVER and ARION APIs. {total.toLocaleString()} matching row{total === 1 ? "" : "s"}.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 16 }}>
        <Filter size={14} style={{ color: "#6b7280" }} />
        <select value={api} onChange={(e) => resetAnd(() => setApi(e.target.value))} style={inp}>
          {APIS.map((a) => (
            <option key={a} value={a}>{a === "" ? "All APIs" : a}</option>
          ))}
        </select>
        <input placeholder="Status (e.g. 500)" value={status} onChange={(e) => resetAnd(() => setStatus(e.target.value.replace(/\D/g, "")))} style={{ ...inp, width: 120 }} />
        <input type="date" value={from} onChange={(e) => resetAnd(() => setFrom(e.target.value))} style={inp} title="From" />
        <input type="date" value={to} onChange={(e) => resetAnd(() => setTo(e.target.value))} style={inp} title="To" />
        <input placeholder="Search path / message / code / request id" value={q} onChange={(e) => resetAnd(() => setQ(e.target.value))} style={{ ...inp, minWidth: 260, flex: 1 }} />
        {tenant && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 999, padding: "4px 10px", fontSize: 12 }}>
            Business: {rows.find((r) => r.tenant_id === tenant)?.tenant_name || tenant.slice(0, 8)}
            <X size={12} style={{ cursor: "pointer" }} onClick={() => resetAnd(() => setTenant(""))} />
          </span>
        )}
      </div>

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", borderRadius: 8, padding: 12, marginBottom: 16 }}>{error}</div>
      )}

      <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f9fafb", textAlign: "left" }}>
              {["When", "Business", "User", "API", "Status", "Method + Path", "Error", "Request id"].map((h) => (
                <th key={h} style={{ padding: "8px 10px", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid #f3f4f6", verticalAlign: "top" }}>
                <td style={{ padding: "8px 10px", whiteSpace: "nowrap", color: "#6b7280" }}>{new Date(r.created_at).toLocaleString()}</td>
                <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                  {r.tenant_id ? (
                    <button
                      onClick={() => resetAnd(() => setTenant(r.tenant_id!))}
                      title="Filter to this business"
                      style={{ background: "none", border: "none", color: "#4f46e5", cursor: "pointer", padding: 0, font: "inherit" }}
                    >
                      {r.tenant_name || r.tenant_id.slice(0, 8)}
                    </button>
                  ) : (
                    <span style={{ color: "#9ca3af" }}>—</span>
                  )}
                </td>
                <td style={{ padding: "8px 10px", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>{r.user_email || "—"}</td>
                <td style={{ padding: "8px 10px" }}>{r.api}</td>
                <td style={{ padding: "8px 10px", fontWeight: 700, color: statusTone(r.status) }}>{r.status}</td>
                <td style={{ padding: "8px 10px", fontFamily: "monospace", fontSize: 12, maxWidth: 340, wordBreak: "break-all" }}>{r.method} {r.path}</td>
                <td style={{ padding: "8px 10px", maxWidth: 320 }}>
                  {r.error_code && <code style={{ background: "#f3f4f6", borderRadius: 4, padding: "1px 5px", marginRight: 6 }}>{r.error_code}</code>}
                  <span style={{ color: "#374151" }}>{r.message || ""}</span>
                </td>
                <td style={{ padding: "8px 10px", fontFamily: "monospace", fontSize: 11, color: "#9ca3af" }}>{r.request_id.slice(0, 8)}</td>
              </tr>
            ))}
            {!rows.length && !loading && (
              <tr><td colSpan={8} style={{ padding: 24, textAlign: "center", color: "#9ca3af" }}>No errors match these filters. That's the good outcome.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {rows.length < total && (
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <button onClick={() => setOffset(rows.length)} disabled={loading} style={{ padding: "8px 20px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}>
            Load more ({rows.length} of {total.toLocaleString()})
          </button>
        </div>
      )}
    </div>
  );
}

const inp: CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  fontSize: 13,
  background: "#fff",
};
