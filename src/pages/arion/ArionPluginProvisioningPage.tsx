// ArionPluginProvisioningPage — Mint plugin provisioning codes + show install paths.
//
// Three install options after minting:
//   1. Zero-touch WP-CLI: pre-seed ia_pending_provision_code at site creation
//      (Hostinger first-boot script). Plugin auto-redeems on admin_init.
//   2. Magic link: send the URL to the customer; one click redeems in browser.
//   3. Manual code: customer pastes into plugin Settings → Connect to ARION.
import { useEffect, useMemo, useState } from "react";
import type { PortalService, ServiceStatus } from "../../config/serviceCatalog";
import { useAccessToken } from "../../auth/useAccessToken";
import { useAppState } from "../../app/AppState";
import { ArionApiError, mintProvisionCode, type ProvisionCodeResponse } from "../../lib/arionApi";
import { useArionSites } from "./useArionSites";
import { Copy, Check, Sparkles, Link as LinkIcon, Terminal, Key, Globe } from "lucide-react";

interface Props { service: PortalService; status: ServiceStatus; }

export function ArionPluginProvisioningPage(_: Props) {
  const apiBaseUrl = (import.meta.env.VITE_ARION_API_BASE_URL as string) || "";
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const { sites, selectedSiteId, setSelectedSiteId } = useArionSites();
  const [mint, setMint] = useState<ProvisionCodeResponse["data"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const selectedSite = useMemo(() => sites.find(s => s.siteId === selectedSiteId) || null, [sites, selectedSiteId]);

  async function doMint() {
    if (!activeTenantId || !apiBaseUrl || !selectedSiteId) return;
    setBusy(true); setError(null);
    try {
      const token = await getToken();
      const r = await mintProvisionCode({
        baseUrl: apiBaseUrl, bearerToken: token.accessToken, tenantId: activeTenantId,
        siteId: selectedSiteId, ttl_days: 7,
      });
      setMint(r.data);
    } catch (err) {
      setError(err instanceof ArionApiError ? `${err.message} (${err.status})` : (err as Error).message);
    } finally { setBusy(false); }
  }

  async function copy(text: string, key: string) {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 2000); }
    catch (e) { alert(`Copy failed: ${(e as Error).message}`); }
  }

  // Clear mint when switching sites
  useEffect(() => { setMint(null); }, [selectedSiteId]);

  return (
    <div className="arion-page">
      <div className="card">
        <div className="card-hdr">
          <div>
            <div className="card-ttl">Plugin Provisioning</div>
            <div className="card-sub">Mint a one-time code so the IA plugin can self-configure</div>
          </div>
        </div>

        <div className="px-1 pb-3 text-xs text-slate-600">
          <strong className="text-slate-800">How it works:</strong>{" "}
          A provisioning code maps the plugin to this tenant + site + tier. Codes are single-use and expire in 7 days.
          Hostinger sites can use the WP-CLI snippet during first-boot for zero-touch setup. Manual sites can paste the code into the plugin Settings page.
        </div>

        <div className="px-1 pb-3">
          <label className="text-[10px] uppercase font-semibold text-slate-600 mb-1 block">Site</label>
          <select value={selectedSiteId || ""} onChange={(e) => setSelectedSiteId(e.target.value)}
            className="w-full max-w-md text-sm border border-slate-300 rounded p-1.5">
            <option value="">Pick a site…</option>
            {sites.map(s => <option key={s.siteId} value={s.siteId}>{s.primaryDomain || s.wpUrl}</option>)}
          </select>
        </div>

        <div className="px-1 pb-4">
          <button disabled={!selectedSiteId || busy} onClick={doMint}
            className="text-sm px-4 py-1.5 rounded bg-[#1A7DB5] text-white disabled:opacity-50 flex items-center gap-1">
            <Sparkles className="h-4 w-4" /> {busy ? "Minting…" : "Mint code"}
          </button>
          {error && <div className="text-xs text-rose-700 mt-2">{error}</div>}
        </div>
      </div>

      {mint && (
        <>
          <div className="card mt-3">
            <div className="card-hdr">
              <div>
                <div className="card-ttl flex items-center gap-2">
                  <Key className="h-4 w-4 text-[#FFD166]" /> Code generated
                </div>
                <div className="card-sub">For <code className="text-xs">{mint.site.domain}</code> · expires {new Date(mint.expires_at).toLocaleString()}</div>
              </div>
            </div>
            <div className="px-1 pb-3">
              <div className="text-2xl font-mono font-bold tracking-wider text-center bg-slate-900 text-amber-200 p-4 rounded">
                {mint.code}
              </div>
            </div>
          </div>

          {/* Option 1: Zero-touch via WP-CLI */}
          <Option icon={Terminal} title="Zero-touch (Hostinger / WP-CLI)" badge="recommended"
            body="Run this WP-CLI command during site creation. The plugin auto-redeems on first admin pageview."
            value={mint.install_options.zero_touch_wp_cli} copyKey="wp-cli" copied={copied} onCopy={copy} />

          <Option icon={Terminal} title="Zero-touch (alternate via wp eval)"
            body="If wp option doesn't accept the value cleanly (e.g. unusual escaping in your pipeline), use this form."
            value={mint.install_options.zero_touch_wp_cli_alt} copyKey="wp-eval" copied={copied} onCopy={copy} />

          {/* Option 2: Magic link */}
          <Option icon={LinkIcon} title="Magic link"
            body="Send this URL to the customer. One click opens WP-admin and redeems the code automatically."
            value={mint.install_options.magic_link} copyKey="magic" copied={copied} onCopy={copy} />

          {/* Option 3: Manual */}
          <Option icon={Globe} title="Manual paste"
            body="If WP-CLI and email aren't options, the customer can paste this code into plugin Settings → Connect to ARION."
            value={mint.install_options.manual_code} copyKey="manual" copied={copied} onCopy={copy} />
        </>
      )}
    </div>
  );
}

function Option({ icon: Icon, title, badge, body, value, copyKey, copied, onCopy }: {
  icon: typeof Terminal; title: string; badge?: string; body: string; value: string; copyKey: string;
  copied: string | null; onCopy: (v: string, k: string) => void;
}) {
  return (
    <div className="card mt-3">
      <div className="card-hdr">
        <div>
          <div className="card-ttl flex items-center gap-2">
            <Icon className="h-4 w-4 text-[#1A7DB5]" /> {title}
            {badge && <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">{badge}</span>}
          </div>
          <div className="card-sub">{body}</div>
        </div>
      </div>
      <div className="px-1 pb-3">
        <div className="relative">
          <pre className="font-mono text-xs bg-slate-100 border border-slate-200 rounded p-3 overflow-x-auto whitespace-pre-wrap break-all">{value}</pre>
          <button onClick={() => onCopy(value, copyKey)}
            className="absolute top-2 right-2 text-xs px-2 py-1 rounded bg-white border border-slate-200 hover:bg-slate-50 flex items-center gap-1">
            {copied === copyKey ? <><Check className="h-3 w-3 text-emerald-600" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ArionPluginProvisioningPage;
