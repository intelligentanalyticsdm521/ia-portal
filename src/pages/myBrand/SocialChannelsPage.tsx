// SocialChannelsPage — My Brand > Social Channels (wave 2).
//
// Connect/disconnect the four core social channels: Facebook, Instagram,
// X, and LinkedIn. 2x2 grid of platform cards. Each card has three
// distinct visual states:
//
//   1. Not connected            → primary "Connect" button
//   2. Connected as @handle     → status pill + last-refreshed timestamp
//                                 + "Disconnect" button
//   3. Expired — reconnect      → red status pill + primary "Reconnect" button
//
// Clicking Connect opens an OAuth popup pointed at the platform-api
// social-oauth start URL. The popup's callback page postMessages back
// (see platform-api lib/socialOAuth/callbackHtml.js → postMessage shape
// is `{ type: "social-oauth", status: "success" | "error", platform,
// connectionId?, displayName?, error? }`). We refetch the connection
// list when the popup signals success.
//
// LIST source is platform-api (`/social-oauth/connections`) because that's
// where the canonical core.tenant_social_connection table lives + where
// the OAuth tokens (in Key Vault) are written. The LUMEN-API My Brand
// surface itself never sees the tokens.
//
// DELETE source is platform-api too — `/social-oauth/:platform/:connectionId`.

import { useCallback, useEffect, useState } from "react";
import { Plug, Unplug, AlertTriangle, RefreshCcw, Lock, ShieldCheck, Loader2 } from "lucide-react";
import { useAccessToken } from "../../auth/useAccessToken";
import { useAppState } from "../../app/AppState";
import { emergencyActAsHeaders } from "../../lib/emergencyActAs";
import { useMyBrandTier, MY_BRAND_FEATURE_TIERS } from "../../hooks/useMyBrandTier";
import { useLumenApi } from "../../hooks/useLumenApi";
import { useUserAccess } from "../../hooks/useUserAccess";

type Platform = "facebook" | "instagram" | "x" | "linkedin";
type ConnectionStatus = "active" | "expired" | "revoked";

interface SocialConnection {
  connection_id: string;
  platform: Platform | string;
  external_account_id: string | null;
  page_id: string | null;
  display_name: string | null;
  account_username: string | null;
  expires_at: string | null;
  scopes_granted: string | null;
  status: ConnectionStatus | string;
  connected_at: string;
  last_refreshed_at: string | null;
  last_refresh_error: string | null;
}

interface PlatformDef {
  key: Platform;
  name: string;
  brand: string;     // brand color for the platform glyph + pills
  initials: string;  // 1-2 char fallback glyph (lucide v1.8 ships no brand icons)
}

// Each platform's connect button is tier-gated. The featureKey here matches
// LUMEN-API src/lib/myBrand/tierCheck.js FEATURE_MIN_TIER:
//   social_connect_facebook  / instagram → standard
//   social_connect_x         / linkedin  → pro
const PLATFORMS: Array<PlatformDef & { featureKey: keyof typeof MY_BRAND_FEATURE_TIERS }> = [
  { key: "facebook",  name: "Facebook",  brand: "#1877F2", initials: "f",  featureKey: "social_connect_facebook" },
  { key: "instagram", name: "Instagram", brand: "#E4405F", initials: "IG", featureKey: "social_connect_instagram" },
  { key: "x",         name: "X",         brand: "#0F1419", initials: "X",  featureKey: "social_connect_x" },
  { key: "linkedin",  name: "LinkedIn",  brand: "#0A66C2", initials: "in", featureKey: "social_connect_linkedin" },
];

function PlatformGlyph({ def, size = 20 }: { def: PlatformDef; size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-md font-bold text-white"
      style={{ background: def.brand, width: size + 8, height: size + 8, fontSize: size * 0.6 }}
      aria-label={def.name}
    >
      {def.initials}
    </span>
  );
}

// Pretty-print "Xh ago" / "Xd ago" — used by the last-refreshed timestamp
// + the connected-on date. Browser locale handles the absolute date when
// the relative window blows out (>30 days).
function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "never";
  const deltaSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (deltaSec < 60) return "just now";
  if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)}m ago`;
  if (deltaSec < 86400) return `${Math.floor(deltaSec / 3600)}h ago`;
  if (deltaSec < 2592000) return `${Math.floor(deltaSec / 86400)}d ago`;
  try {
    return new Date(ts).toLocaleDateString();
  } catch {
    return "a while ago";
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

export function SocialChannelsPage() {
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  // Per-platform tier gate. We don't lock the whole page (the connection list
  // is informational); instead each card shows its own Lite/Pro lock. Backend
  // mirrors this with requireTier(featureKeyForProvider()) on POST /social-accounts.
  const gate = useMyBrandTier();
  const [connections, setConnections] = useState<SocialConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Track which platform card is currently waiting on its OAuth popup so
  // we can show a transient "Opening…" state and disable the button.
  const [popupBusy, setPopupBusy] = useState<Platform | null>(null);
  // Per-platform disconnect spinner. Reset on success/failure.
  const [disconnectBusy, setDisconnectBusy] = useState<string | null>(null);

  const platformBase = (import.meta.env.VITE_PLATFORM_API_BASE_URL as string || "").replace(/\/$/, "");

  // ── Data loaders ────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!activeTenantId || !platformBase) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${platformBase}/social-oauth/connections`, {
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          "x-tenant-key": activeTenantId,
          ...emergencyActAsHeaders(),
        },
      });
      if (!res.ok) throw new Error(`Failed to load connections (${res.status})`);
      const body = await res.json();
      const rows: SocialConnection[] = Array.isArray(body?.data) ? body.data : [];
      // Only show the four core platforms (defensive — backend may add more).
      const allowed = new Set<string>(PLATFORMS.map((p) => p.key));
      setConnections(rows.filter((r) => allowed.has(String(r.platform))));
    } catch (err: unknown) {
      setError((err as Error)?.message || "Failed to load connections");
    } finally {
      setLoading(false);
    }
  }, [activeTenantId, getToken, platformBase]);

  useEffect(() => { load(); }, [load]);

  // ── postMessage listener for OAuth popup completion ─────────────────────
  // The callback HTML emits `{ type: "social-oauth", status, platform, ... }`
  // via window.opener.postMessage. We listen here, refetch on success, and
  // surface the error inline if the popup failed.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const data = e?.data;
      if (!data || typeof data !== "object") return;
      if (data.type !== "social-oauth") return;
      // Drop any in-flight "Opening…" busy state regardless of outcome.
      setPopupBusy(null);
      if (data.status === "success") {
        setError(null);
        load();
      } else if (data.status === "error") {
        const platform = typeof data.platform === "string" ? data.platform : "channel";
        const reason = typeof data.error === "string" ? data.error : "unknown_error";
        setError(`Could not connect ${platform}: ${reason}`);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [load]);

  // ── Actions ─────────────────────────────────────────────────────────────
  // Build the start URL for the requested platform. The platform-api start
  // endpoint is intentionally public (state HMAC binds the tenant) — see
  // platform-api routes/social-oauth/meta.js for the rationale.
  function openOAuthPopup(platform: Platform) {
    if (!activeTenantId || !platformBase) return;
    setPopupBusy(platform);
    // Centered ~600x720 popup. We accept the browser may block this if
    // the click isn't a direct user action — the page button IS a user
    // click so blockers should let it through.
    const w = 600;
    const h = 720;
    const top = Math.max(0, (window.outerHeight - h) / 2 + window.screenY);
    const left = Math.max(0, (window.outerWidth - w) / 2 + window.screenX);
    const url = `${platformBase}/social-oauth/${platform}/start?tenantId=${encodeURIComponent(activeTenantId)}`;
    const popup = window.open(
      url,
      "iadm-social-oauth",
      `width=${w},height=${h},top=${top},left=${left},menubar=no,toolbar=no,location=no,status=no`,
    );
    if (!popup) {
      setPopupBusy(null);
      setError("Your browser blocked the OAuth popup. Allow popups for this site and try again.");
      return;
    }
    // Poll for popup-closed-without-message — if the user closes the popup
    // manually we want to clear the busy state instead of leaving the
    // button stuck on "Opening…".
    const interval = window.setInterval(() => {
      if (popup.closed) {
        window.clearInterval(interval);
        // Only clear busy if we haven't already received a postMessage
        // (the message handler clears popupBusy on its own).
        setPopupBusy((prev) => (prev === platform ? null : prev));
      }
    }, 700);
  }

  async function disconnectConnection(conn: SocialConnection) {
    if (!platformBase || !activeTenantId) return;
    const ok = window.confirm(`Disconnect ${conn.platform}${conn.account_username ? ` (@${conn.account_username})` : ""}?`);
    if (!ok) return;
    setDisconnectBusy(conn.connection_id);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(
        `${platformBase}/social-oauth/${conn.platform}/${encodeURIComponent(conn.connection_id)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token.accessToken}`,
            "x-tenant-key": activeTenantId,
            ...emergencyActAsHeaders(),
          },
        },
      );
      if (!res.ok && res.status !== 204) {
        const text = await res.text().catch(() => "");
        throw new Error(`Disconnect failed (${res.status}): ${text || res.statusText}`);
      }
      await load();
    } catch (err: unknown) {
      setError((err as Error)?.message || "Disconnect failed");
    } finally {
      setDisconnectBusy(null);
    }
  }

  // For each platform, pick the most recent active connection (or fall
  // back to the most recent expired/revoked one so the card still shows
  // "Expired — reconnect" without forgetting the user used to be connected).
  const byPlatform = new Map<Platform, SocialConnection | null>();
  for (const p of PLATFORMS) byPlatform.set(p.key, null);
  for (const c of connections) {
    const k = c.platform as Platform;
    if (!byPlatform.has(k)) continue;
    const cur = byPlatform.get(k);
    if (!cur) { byPlatform.set(k, c); continue; }
    // Active beats expired/revoked; newer connected_at beats older.
    const curActive = cur.status === "active";
    const cActive = c.status === "active";
    if (cActive && !curActive) { byPlatform.set(k, c); continue; }
    if (!cActive && curActive) continue;
    if (Date.parse(c.connected_at) > Date.parse(cur.connected_at)) byPlatform.set(k, c);
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Social Channels</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Connect your social channels to schedule posts, run brand-voice checks, and see cross-platform engagement.
          You stay signed in to the provider — we only store the access token needed to publish on your behalf.
        </p>
      </header>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div className="flex-1">{error}</div>
          <button type="button" onClick={() => setError(null)} className="text-xs font-semibold text-rose-700 hover:underline">Dismiss</button>
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Loading connections…
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {PLATFORMS.map((def) => {
            const conn = byPlatform.get(def.key) ?? null;
            const locked = gate.ready && !gate.meets(def.featureKey);
            const requiredTier = gate.requiredTier(def.featureKey);
            return (
              <ChannelCard
                key={def.key}
                def={def}
                connection={conn}
                busy={popupBusy === def.key}
                disconnectBusy={!!conn && disconnectBusy === conn.connection_id}
                onConnect={() => openOAuthPopup(def.key)}
                onDisconnect={() => conn && disconnectConnection(conn)}
                locked={locked}
                requiredTier={requiredTier}
              />
            );
          })}
        </div>
      )}

      <ApprovalWorkflowToggle />

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
        <strong className="block text-slate-700">Where do tokens live?</strong>
        Access tokens are stored in IADM's Key Vault — never in our SQL database. SQL only records that a connection
        exists. Disconnecting revokes the token at the provider (best-effort), deletes the Key Vault secrets, and marks
        the row revoked.
      </div>
    </div>
  );
}

// F-MB.SOC.7 (2026-06-22) — founder/admin-only Approval Workflow toggle.
// Hidden entirely for non-admins. Backend writes to lumen.tenant_brand_setting
// (separate from the wave-4 settings JSON in lumen.tenant_settings; the
// dispatcher reads exclusively from the new table — see migration 057 +
// LUMEN-API src/lib/myBrand/approvalGate.js).
function ApprovalWorkflowToggle() {
  const lumen = useLumenApi();
  const access = useUserAccess();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<{ approval_required: boolean; agency_managed: boolean; locked: boolean }>({
    approval_required: false,
    agency_managed: false,
    locked: false,
  });
  const [error, setError] = useState<string | null>(null);

  const isAdmin = !access.loading && access.isAdmin;

  useEffect(() => {
    if (!lumen.ready || !isAdmin) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const data = await lumen.get<typeof state>("/api/v1/my-brand/social/approval-settings");
        if (!cancelled) {
          setState({
            approval_required: !!data?.approval_required,
            agency_managed: !!data?.agency_managed,
            locked: !!data?.locked,
          });
        }
      } catch (err) {
        if (!cancelled) setError((err as Error)?.message || "Failed to load approval setting");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [lumen, isAdmin]);

  async function toggle(next: boolean) {
    if (state.locked || saving) return;
    setSaving(true);
    setError(null);
    const prev = state.approval_required;
    setState((s) => ({ ...s, approval_required: next })); // optimistic
    try {
      const data = await lumen.put<typeof state>("/api/v1/my-brand/social/approval-settings", { approval_required: next });
      setState({
        approval_required: !!data?.approval_required,
        agency_managed: !!data?.agency_managed,
        locked: !!data?.locked,
      });
    } catch (err) {
      setState((s) => ({ ...s, approval_required: prev })); // rollback
      setError((err as Error)?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (!isAdmin) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: "#FEC82C22" }}>
          <ShieldCheck className="h-5 w-5" style={{ color: "#1A3A4A" }} />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Approval Workflow</h3>
              <p className="mt-0.5 text-xs text-slate-600">
                When on, posts submitted by non-admin team members park in the Approval Inbox for founder/admin review before they publish.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={state.approval_required}
              disabled={loading || saving || state.locked}
              onClick={() => toggle(!state.approval_required)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
                state.approval_required ? "bg-emerald-500" : "bg-slate-300"
              }`}
              title={state.locked ? "Locked on for agency-managed tenants" : undefined}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                  state.approval_required ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
              {(loading || saving) && (
                <Loader2 className="absolute -right-6 h-3.5 w-3.5 animate-spin text-slate-400" />
              )}
            </button>
          </div>
          {state.locked && (
            <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
              <Lock className="h-3 w-3" />
              Locked on — this tenant is agency-managed
            </div>
          )}
          {error && (
            <div className="mt-2 text-[11px] font-medium text-rose-700">{error}</div>
          )}
        </div>
      </div>
    </div>
  );
}

interface ChannelCardProps {
  def: PlatformDef;
  connection: SocialConnection | null;
  busy: boolean;
  disconnectBusy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  locked?: boolean;
  requiredTier?: string;
}

function ChannelCard({ def, connection, busy, disconnectBusy, onConnect, onDisconnect, locked = false, requiredTier = "standard" }: ChannelCardProps) {
  const state: "none" | "active" | "expired" =
    !connection ? "none" :
    connection.status === "active" ? "active" :
    "expired";

  const handle = connection?.account_username || connection?.display_name || connection?.external_account_id || "";

  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center gap-3">
        <PlatformGlyph def={def} size={18} />
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold text-slate-900">{def.name}</div>
          <div className="text-xs">
            {state === "none" && <span className="text-slate-500">Not connected</span>}
            {state === "active" && (
              <span className="font-medium text-emerald-700">
                Connected{handle ? ` as @${handle}` : ""}
              </span>
            )}
            {state === "expired" && (
              <span className="font-medium text-amber-700">Expired — reconnect</span>
            )}
          </div>
        </div>
      </div>

      {state !== "none" && connection && (
        <dl className="mb-4 grid grid-cols-2 gap-y-1 text-[11px]">
          <dt className="text-slate-500">Connected on</dt>
          <dd className="text-slate-700">{formatDate(connection.connected_at)}</dd>
          <dt className="text-slate-500">Last refreshed</dt>
          <dd className="text-slate-700">{relativeTime(connection.last_refreshed_at)}</dd>
          {connection.last_refresh_error && (
            <>
              <dt className="text-slate-500">Last error</dt>
              <dd className="truncate text-rose-700" title={connection.last_refresh_error}>{connection.last_refresh_error}</dd>
            </>
          )}
        </dl>
      )}

      <div className="mt-auto flex items-center gap-2">
        {locked && state === "none" && (
          <a
            href={`/pricing?platform=my_brand&required=${encodeURIComponent(requiredTier)}`}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#1A3A4A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0B1C24]"
          >
            <Lock className="h-3.5 w-3.5" />
            Upgrade to {requiredTier.charAt(0).toUpperCase() + requiredTier.slice(1)}
          </a>
        )}
        {!locked && state === "none" && (
          <button
            type="button"
            onClick={onConnect}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#2563eb] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-60"
          >
            <Plug className="h-3.5 w-3.5" />
            {busy ? "Opening…" : "Connect"}
          </button>
        )}
        {state === "active" && (
          <button
            type="button"
            onClick={onDisconnect}
            disabled={disconnectBusy}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
          >
            <Unplug className="h-3.5 w-3.5" />
            {disconnectBusy ? "Disconnecting…" : "Disconnect"}
          </button>
        )}
        {state === "expired" && (
          <>
            <button
              type="button"
              onClick={onConnect}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#2563eb] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-60"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              {busy ? "Opening…" : "Reconnect"}
            </button>
            <button
              type="button"
              onClick={onDisconnect}
              disabled={disconnectBusy}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
            >
              <Unplug className="h-3.5 w-3.5" />
              {disconnectBusy ? "Removing…" : "Remove"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

import { withMyBrandComingSoon } from "./ComingSoonOverlay";
export default withMyBrandComingSoon(SocialChannelsPage);
