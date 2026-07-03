/**
 * OliverPortalDomainsPage — Portals & Domains hub (F-60 + F-61).
 *
 * Shows the tenant's current portal URLs (customer + crew + booking) with:
 *   - Default URL (xxx.customer.ia-dm.com) — auto-bound on click
 *   - Custom Domain entry — for Pro+ tenants who want to use their own
 *   - Status indicator: Pending DNS / Validating / Ready / Failed
 *   - Setup instructions (TXT + CNAME) when manual DNS is required
 *
 * Backend: /portal-domains/* (oliver-api commit f6f62b6).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { PageHeader, Button } from "../../components/oliver/ui";
import { Users, HardHat, Calendar as CalendarIcon, ExternalLink, Copy, RefreshCw } from "lucide-react";

type PortalKind = "customer" | "crew" | "booking";

interface PortalDomain {
  domain_id: string;
  portal_kind: PortalKind;
  hostname: string;
  status: "pending" | "validating" | "ready" | "failed" | "removed";
  is_active: boolean;
  azure_status?: string | null;
  failure_reason?: string | null;
  last_validation_at?: string | null;
  created_at: string;
}

interface AzureLiveStatus {
  status?: string;
  errorMessage?: string;
  validationToken?: string;
}

interface BindResponse {
  hostname: string;
  status: string;
  azure_status?: string;
  requires_manual_dns?: boolean;
  instructions?: {
    txt_record: { host: string; type: string; value: string; ttl: number };
    cname_record: { host: string; type: string; value: string; ttl: number };
    message: string;
  } | null;
  validation_token?: string | null;
  error?: string | null;
}

const PORTAL_META: Record<PortalKind, { label: string; icon: typeof Users; defaultSuffix: string; available: boolean; tierGate: string }> = {
  customer: { label: "Customer Portal", icon: Users, defaultSuffix: "customer.ia-dm.com", available: true, tierGate: "Standard+" },
  crew:     { label: "Crew Portal",     icon: HardHat, defaultSuffix: "crew.ia-dm.com", available: true, tierGate: "Pro+" },
  booking:  { label: "Booking",         icon: CalendarIcon, defaultSuffix: "book.ia-dm.com", available: true, tierGate: "Standard+ (no custom domain)" },
};

// F-58 — simple text-column preference for per-tenant custom portal
// domains, exposed via /settings/portals/custom-domains. Pro+ only.
interface F58CustomDomains {
  tier: string;
  canUseCustomDomain: boolean;
  minTier: string;
  customerPortalCustomDomain: string | null;
  crewPortalCustomDomain: string | null;
}

export function OliverPortalDomainsPage() {
  const { get, post, patch, del, ready } = useOliverApi();
  const [domains, setDomains] = useState<PortalDomain[]>([]);
  const [tenantSlug, setTenantSlug] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busyPortal, setBusyPortal] = useState<PortalKind | null>(null);
  const [customInputs, setCustomInputs] = useState<Record<PortalKind, string>>({ customer: "", crew: "", booking: "" });
  const [activeInstructions, setActiveInstructions] = useState<{ kind: PortalKind; data: BindResponse } | null>(null);
  // F-58 state — read once, PATCH on Save.
  const [f58, setF58] = useState<F58CustomDomains | null>(null);
  const [f58Draft, setF58Draft] = useState<{ customer: string; crew: string }>({ customer: "", crew: "" });
  const [f58Saving, setF58Saving] = useState(false);
  const [f58Msg, setF58Msg] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [list, slugRes, f58Res] = await Promise.all([
        get<PortalDomain[]>("/portal-domains"),
        get<{ slug: string | null }>("/portal-domains/tenant-slug").catch(() => ({ slug: null })),
        // F-58 — non-fatal if the endpoint is missing on older deploys.
        get<F58CustomDomains>("/settings/portals/custom-domains").catch(() => null),
      ]);
      setDomains(list || []);
      setTenantSlug(slugRes?.slug || "");
      if (f58Res) {
        setF58(f58Res);
        setF58Draft({
          customer: f58Res.customerPortalCustomDomain || "",
          crew: f58Res.crewPortalCustomDomain || "",
        });
      }
    } catch (e) { setError(e); }
    finally { setLoading(false); }
  }, [get]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  // Group by portal kind
  const byKind = useMemo(() => {
    const out: Record<PortalKind, PortalDomain[]> = { customer: [], crew: [], booking: [] };
    for (const d of domains) {
      if (d.is_active) out[d.portal_kind]?.push(d);
    }
    return out;
  }, [domains]);

  async function bindDefault(kind: PortalKind) {
    if (!tenantSlug) {
      alert("Tenant slug not loaded yet — refresh and try again.");
      return;
    }
    setBusyPortal(kind);
    try {
      await post(`/portal-domains/bind-default`, { portal_kind: kind });
      await reload();
    } catch (e) {
      alert(`Bind failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally { setBusyPortal(null); }
  }

  async function bindCustom(kind: PortalKind) {
    const hostname = customInputs[kind].trim().toLowerCase();
    if (!hostname || !/\./.test(hostname)) {
      alert("Enter a full hostname like customer.yourcompany.com");
      return;
    }
    setBusyPortal(kind);
    try {
      const r = await post<BindResponse>(`/portal-domains/custom`, { portal_kind: kind, hostname });
      if (r.requires_manual_dns && r.instructions) {
        setActiveInstructions({ kind, data: r });
      }
      await reload();
    } catch (e) {
      alert(`Connect failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally { setBusyPortal(null); }
  }

  async function refreshStatus(d: PortalDomain) {
    setBusyPortal(d.portal_kind);
    try {
      await get<AzureLiveStatus>(`/portal-domains/status?portal_kind=${d.portal_kind}&hostname=${encodeURIComponent(d.hostname)}`);
      await reload();
    } finally { setBusyPortal(null); }
  }

  async function disconnect(d: PortalDomain) {
    if (!confirm(`Disconnect ${d.hostname}? This removes the SWA binding + DNS record. The default subdomain will continue to work.`)) return;
    setBusyPortal(d.portal_kind);
    try {
      await del(`/portal-domains/${d.domain_id}`);
      await reload();
    } catch (e) {
      alert(`Disconnect failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally { setBusyPortal(null); }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  // F-58 save. PATCHes ONLY the fields that changed vs the loaded state so we
  // don't accidentally clear a domain the user didn't touch. Empty-string
  // sent explicitly = intentional clear (matches backend normalize()).
  async function saveF58() {
    if (!f58) return;
    const patchBody: Record<string, string> = {};
    if (f58Draft.customer !== (f58.customerPortalCustomDomain || "")) {
      patchBody.customerPortalCustomDomain = f58Draft.customer;
    }
    if (f58Draft.crew !== (f58.crewPortalCustomDomain || "")) {
      patchBody.crewPortalCustomDomain = f58Draft.crew;
    }
    if (Object.keys(patchBody).length === 0) {
      setF58Msg("No changes to save.");
      setTimeout(() => setF58Msg(null), 2500);
      return;
    }
    setF58Saving(true); setF58Msg(null);
    try {
      const r = await patch<F58CustomDomains>("/settings/portals/custom-domains", patchBody);
      setF58(r);
      setF58Draft({
        customer: r.customerPortalCustomDomain || "",
        crew: r.crewPortalCustomDomain || "",
      });
      setF58Msg("Saved.");
      setTimeout(() => setF58Msg(null), 3000);
    } catch (e) {
      setF58Msg(`Error: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setF58Saving(false);
    }
  }

  return (
    <OliverPageWrapper title="Portals & Domains" subtitle="Customer + crew portal URLs" error={error} loading={loading && !domains.length}>
      <PageHeader
        title="Portals & Domains"
        subtitle="Manage the URLs your customers and crew use to access their portals. Default subdomains are free; bring your own domain on Pro+."
      />

      {/* F-58 — simple text-column preference for per-tenant custom portal
          domains. Sits above the automated /portal-domains card set so a
          tenant can declare intent even before running through the SWA
          binding flow. Pro+ only (server 402s below-tier PATCHes). */}
      {f58 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <div className="card-ttl">Per-tenant custom portal domain</div>
            {f58.canUseCustomDomain ? (
              <span style={{
                padding: "1px 6px", borderRadius: 999,
                background: "#D1FAE5", color: "#065F46",
                fontSize: 9, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase",
              }}>Pro+ · Available</span>
            ) : (
              <span style={{
                padding: "1px 6px", borderRadius: 999,
                background: "#FEF3C7", color: "#92400E",
                fontSize: 9, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase",
              }}>Pro+ · Locked</span>
            )}
          </div>
          <div className="card-sub" style={{ marginBottom: 10 }}>
            Store the hostname you want your customer + crew portals to answer on.
            You still need to add a <code style={{ fontFamily: "monospace", background: "#F1F5F9", padding: "1px 4px", borderRadius: 3 }}>CNAME</code> at your DNS provider pointing at the value shown on the portal-specific card below — this field just persists your choice. Requires the <strong>Pro</strong> plan or higher.
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ display: "block" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>
                Customer portal domain
              </div>
              <input
                type="text"
                value={f58Draft.customer}
                onChange={(e) => setF58Draft({ ...f58Draft, customer: e.target.value })}
                placeholder="portal.yourbusiness.com"
                disabled={!f58.canUseCustomDomain || f58Saving}
                style={{
                  width: "100%", padding: "8px 10px", border: "1px solid #E5E7EB",
                  borderRadius: 6, fontSize: 13, fontFamily: "monospace",
                  background: !f58.canUseCustomDomain ? "#F8FAFC" : "#fff",
                  color: !f58.canUseCustomDomain ? "#94A3B8" : "#0B1C24",
                }}
              />
              <div style={{ fontSize: 10, color: "#5A7A8A", marginTop: 4 }}>
                DNS: <code style={{ fontFamily: "monospace" }}>CNAME</code> {f58Draft.customer || "portal.yourbusiness.com"} → <code style={{ fontFamily: "monospace" }}>{tenantSlug || "&lt;your-slug&gt;"}.customer.ia-dm.com</code>
              </div>
            </label>

            <label style={{ display: "block" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>
                Crew portal domain
              </div>
              <input
                type="text"
                value={f58Draft.crew}
                onChange={(e) => setF58Draft({ ...f58Draft, crew: e.target.value })}
                placeholder="crew.yourbusiness.com"
                disabled={!f58.canUseCustomDomain || f58Saving}
                style={{
                  width: "100%", padding: "8px 10px", border: "1px solid #E5E7EB",
                  borderRadius: 6, fontSize: 13, fontFamily: "monospace",
                  background: !f58.canUseCustomDomain ? "#F8FAFC" : "#fff",
                  color: !f58.canUseCustomDomain ? "#94A3B8" : "#0B1C24",
                }}
              />
              <div style={{ fontSize: 10, color: "#5A7A8A", marginTop: 4 }}>
                DNS: <code style={{ fontFamily: "monospace" }}>CNAME</code> {f58Draft.crew || "crew.yourbusiness.com"} → <code style={{ fontFamily: "monospace" }}>{tenantSlug || "&lt;your-slug&gt;"}.crew.ia-dm.com</code>
              </div>
            </label>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
            <Button
              variant="primary"
              onClick={saveF58}
              disabled={!f58.canUseCustomDomain || f58Saving}
            >
              {f58Saving ? "Saving…" : "Save"}
            </Button>
            {f58Msg && <span style={{ fontSize: 11, color: f58Msg.startsWith("Error") ? "#B91C1C" : "#065F46" }}>{f58Msg}</span>}
            {!f58.canUseCustomDomain && (
              <span style={{ fontSize: 11, color: "#92400E" }}>
                Your plan is <strong>{f58.tier}</strong> — upgrade to Pro to unlock custom portal domains.
              </span>
            )}
          </div>
        </div>
      )}

      {(["customer", "crew", "booking"] as PortalKind[]).map((kind) => {
        const meta = PORTAL_META[kind];
        const Icon = meta.icon;
        const list = byKind[kind];
        const defaultHostname = tenantSlug ? `${tenantSlug}.${meta.defaultSuffix}` : `<your-slug>.${meta.defaultSuffix}`;
        const defaultRow = list.find((d) => d.hostname === defaultHostname);
        const customRows = list.filter((d) => d.hostname !== defaultHostname);

        return (
          <div key={kind} className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <Icon size={20} color="#1A7DB5" />
              <div>
                <div className="card-ttl">{meta.label}</div>
                <div className="card-sub">Available on {meta.tierGate}</div>
              </div>
            </div>

            {/* Default subdomain */}
            <div style={{ marginTop: 14, padding: "12px 14px", background: "#F8FAFC", borderRadius: 8, border: "1px solid #E5E7EB" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>
                    Default URL
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "monospace", fontSize: 13, color: "#0B1C24" }}>
                    https://{defaultHostname}
                    {defaultRow && <StatusBadge status={defaultRow.status} />}
                  </div>
                  {defaultRow?.failure_reason && (
                    <div style={{ fontSize: 11, color: "#B91C1C", marginTop: 6 }}>{defaultRow.failure_reason}</div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {defaultRow?.status === "ready" ? (
                    <a href={`https://${defaultHostname}`} target="_blank" rel="noreferrer">
                      <Button variant="secondary"><ExternalLink size={12} style={{ marginRight: 4 }} /> Open</Button>
                    </a>
                  ) : defaultRow ? (
                    <Button variant="ghost" onClick={() => refreshStatus(defaultRow)} disabled={busyPortal === kind}>
                      <RefreshCw size={12} style={{ marginRight: 4 }} /> {busyPortal === kind ? "Checking…" : "Refresh"}
                    </Button>
                  ) : (
                    <Button variant="primary" onClick={() => bindDefault(kind)} disabled={busyPortal === kind || !tenantSlug}>
                      {busyPortal === kind ? "Binding…" : "Activate"}
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Custom domain — not for booking (wildcard-only) */}
            {kind !== "booking" && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>
                  Use Your Own Domain  <span style={{ marginLeft: 6, padding: "1px 6px", borderRadius: 999, background: "#FEF3C7", color: "#92400E", fontSize: 9 }}>PRO+</span>
                </div>

                {customRows.length > 0 && customRows.map((d) => (
                  <div key={d.domain_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "#fff", border: "1px solid #E5E7EB", borderRadius: 6, marginBottom: 6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "monospace", fontSize: 13, color: "#0B1C24" }}>
                        https://{d.hostname}
                        <StatusBadge status={d.status} />
                      </div>
                      {d.failure_reason && (
                        <div style={{ fontSize: 11, color: "#B91C1C", marginTop: 4 }}>{d.failure_reason}</div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {d.status === "ready" ? (
                        <a href={`https://${d.hostname}`} target="_blank" rel="noreferrer">
                          <Button variant="ghost"><ExternalLink size={12} /></Button>
                        </a>
                      ) : (
                        <Button variant="ghost" onClick={() => refreshStatus(d)} disabled={busyPortal === kind}>
                          <RefreshCw size={12} />
                        </Button>
                      )}
                      <Button variant="ghost" onClick={() => disconnect(d)} disabled={busyPortal === kind}>Disconnect</Button>
                    </div>
                  </div>
                ))}

                {/* New custom domain entry */}
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <input
                    type="text"
                    value={customInputs[kind]}
                    onChange={(e) => setCustomInputs({ ...customInputs, [kind]: e.target.value })}
                    placeholder={`${kind}.yourcompany.com`}
                    style={{ flex: 1, padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 13, fontFamily: "monospace" }}
                  />
                  <Button variant="primary" onClick={() => bindCustom(kind)} disabled={busyPortal === kind || !customInputs[kind].trim()}>
                    Connect
                  </Button>
                </div>
                <div style={{ fontSize: 10, color: "#5A7A8A", marginTop: 4 }}>
                  If we manage your DNS (ARION client), we'll set it up automatically. Otherwise we'll show you the records to add at your registrar.
                </div>
              </div>
            )}

            {/* Setup instructions modal */}
            {activeInstructions?.kind === kind && activeInstructions.data.instructions && (
              <div style={{ marginTop: 12, padding: 14, background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#78350F", marginBottom: 8 }}>
                  DNS records to add at your registrar:
                </div>
                <div style={{ fontFamily: "monospace", fontSize: 12, marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <strong>CNAME:</strong> {activeInstructions.data.instructions.cname_record.host} →
                    <code style={{ background: "#fff", padding: "1px 5px", borderRadius: 3 }}>{activeInstructions.data.instructions.cname_record.value}</code>
                    <Button variant="ghost" onClick={() => copyToClipboard(activeInstructions.data.instructions!.cname_record.value)}><Copy size={11} /></Button>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                    <strong>TXT:</strong> {activeInstructions.data.instructions.txt_record.host} →
                    <code style={{ background: "#fff", padding: "1px 5px", borderRadius: 3 }}>{activeInstructions.data.instructions.txt_record.value}</code>
                    <Button variant="ghost" onClick={() => copyToClipboard(activeInstructions.data.instructions!.txt_record.value)}><Copy size={11} /></Button>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "#78350F", marginTop: 6 }}>
                  Once propagated (usually 5-30 min), click "Refresh" above to check status. Azure issues a free managed SSL cert after validation succeeds.
                </div>
                <Button variant="ghost" onClick={() => setActiveInstructions(null)} style={{ marginTop: 6 }}>Dismiss</Button>
              </div>
            )}
          </div>
        );
      })}
    </OliverPageWrapper>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; bg: string; label: string }> = {
    pending:    { color: "#78350F", bg: "#FEF3C7", label: "Pending DNS" },
    validating: { color: "#92400E", bg: "#FEF3C7", label: "Validating" },
    ready:      { color: "#065F46", bg: "#D1FAE5", label: "Ready" },
    failed:     { color: "#991B1B", bg: "#FEE2E2", label: "Failed" },
    removed:    { color: "#475569", bg: "#F1F5F9", label: "Removed" },
  };
  const m = map[status] || { color: "#475569", bg: "#F1F5F9", label: status };
  return (
    <span style={{
      display: "inline-block", padding: "1px 8px", fontSize: 10, fontWeight: 700,
      borderRadius: 999, color: m.color, background: m.bg, textTransform: "uppercase", letterSpacing: 0.4,
    }}>
      {m.label}
    </span>
  );
}

export default OliverPortalDomainsPage;
