import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, Check, AlertTriangle, Loader2 } from "lucide-react";
import { useMsal } from "@azure/msal-react";
import { useAppState } from "../app/AppState";
import { useAccessToken } from "../auth/useAccessToken";
import {
  listFounderTenants,
  actAsTenant,
  type FounderTenant,
} from "../lib/founderApi";
import { selectTenant } from "../lib/platformApi";

/**
 * FounderTenantPicker — Design Option C scaffold.
 *
 * Header dropdown rendered ONLY when bootstrap.user.isSuperUser is true.
 * Shows "Acting as: <tenant name> ▾" with a click-to-open list of every
 * tenant in core.tenants. Selecting a tenant:
 *   1. POST /super/tenants/:id/act-as     (audit row + tenant existence check)
 *   2. POST /session/select-tenant        (load services + features for new ctx)
 *   3. setActiveTenantId + setActive in   (every API call now sends new x-tenant-key)
 *      AppState
 *
 * Founder identity is preserved server-side: the JWT still belongs to Brandon.
 * Audit columns + core.tenant_actas_log stamp the founder's user_id alongside
 * the target tenant_id. See routes/admin/superUser.js + migration 092.
 *
 * NON-super-users never see this component — gating is in HeaderBar.tsx.
 */
export function FounderTenantPicker() {
  const { instance: msal } = useMsal();
  const { activeAccount, getToken } = useAccessToken();
  const appState = useAppState();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tenants, setTenants] = useState<FounderTenant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);

  const activeTenantId = appState.activeTenantId;
  const activeTenantLabel =
    appState.active?.tenant?.tenantFullName ||
    appState.active?.tenant?.tenantName ||
    "(no tenant)";

  // Lazy-load the tenant list the first time the picker opens. Re-load on
  // every open is overkill — refresh button below covers manual refresh.
  useEffect(() => {
    if (!open) return;
    if (tenants.length > 0) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        if (!activeAccount) throw new Error("No active account");
        const res = await listFounderTenants(msal, activeAccount, activeTenantId);
        if (!cancelled) setTenants(res.tenants);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Outside-click + Esc close, matching AccountMenu's pattern.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!open) return;
      const target = e.target as Node | null;
      if (target && rootRef.current && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    }
    function onDocKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onDocKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onDocKeyDown);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return tenants;
    return tenants.filter((t) => {
      const a = (t.name || "").toLowerCase();
      const b = (t.full_name || "").toLowerCase();
      const c = (t.primary_contact_email || "").toLowerCase();
      const d = (t.tenant_id || "").toLowerCase();
      return a.includes(q) || b.includes(q) || c.includes(q) || d.includes(q);
    });
  }, [tenants, filter]);

  async function handleRefresh() {
    setTenants([]);
    setError(null);
    // Trigger the load effect by closing+reopening.
    if (open) {
      setOpen(false);
      setTimeout(() => setOpen(true), 0);
    }
  }

  async function handleSelect(targetTenantId: string) {
    if (!activeAccount) return;
    if (targetTenantId === activeTenantId) {
      setOpen(false);
      return;
    }
    setSwitchingTo(targetTenantId);
    setError(null);

    try {
      // 1. Audit + validate.
      await actAsTenant(msal, activeAccount, activeTenantId, targetTenantId);

      // 2. Re-fetch active-tenant context (services, features, roles) under
      // the new tenant. Mirrors AppGate's handleSelectTenant flow.
      const { accessToken } = await getToken();
      const selected = await selectTenant({
        baseUrl: import.meta.env.VITE_PLATFORM_API_BASE_URL,
        bearerToken: accessToken,
        tenantId: targetTenantId,
      });

      appState.setActive(selected);
      appState.setActiveTenantId(targetTenantId);
      setOpen(false);

      // Hard navigate to the overview so per-page caches/data fetched under
      // the old tenant aren't surfaced under the new one. Cheaper than
      // invalidating every useOliverApi/useSparkApi cache by hand.
      window.location.assign("/app/overview");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSwitchingTo(null);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-md border border-amber-300/40 bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-400/20 transition-colors"
        title="Founder super-user: switch active tenant"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="hidden md:inline text-amber-200/80">Acting as:</span>
        <span className="max-w-[12rem] truncate font-semibold">{activeTenantLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-80" />
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-[28rem] max-w-[90vw] rounded-md border border-gray-200 bg-white shadow-xl z-50"
          role="listbox"
        >
          <div className="border-b border-gray-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Founder · Switch tenant
          </div>

          <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
            <Search className="h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search by name, email, or id…"
              className="w-full bg-transparent text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
              autoFocus
            />
            <button
              type="button"
              onClick={handleRefresh}
              className="text-[10px] uppercase tracking-wide text-gray-500 hover:text-gray-700"
              title="Reload tenant list"
            >
              Refresh
            </button>
          </div>

          {loading && (
            <div className="flex items-center gap-2 px-3 py-6 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading tenants…
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 border-b border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span style={{ whiteSpace: "pre-wrap" }}>{error}</span>
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <div className="px-3 py-6 text-sm text-gray-500">
              No tenants match "{filter}".
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <ul className="max-h-96 overflow-y-auto py-1">
              {filtered.map((t) => {
                const isActive = t.tenant_id === activeTenantId;
                const isSwitching = t.tenant_id === switchingTo;
                return (
                  <li key={t.tenant_id}>
                    <button
                      type="button"
                      disabled={isSwitching}
                      onClick={() => handleSelect(t.tenant_id)}
                      className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:opacity-50 ${
                        isActive ? "bg-amber-50" : ""
                      }`}
                    >
                      <div className="mt-0.5 w-4 flex-shrink-0">
                        {isActive && <Check className="h-4 w-4 text-amber-600" />}
                        {isSwitching && (
                          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium text-gray-900">
                            {t.full_name || t.name || "(unnamed)"}
                          </span>
                          {t.is_founder_tenant && (
                            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700">
                              Founder
                            </span>
                          )}
                          {t.status && t.status !== "active" && (
                            <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-gray-600">
                              {t.status}
                            </span>
                          )}
                        </div>
                        <div className="truncate text-xs text-gray-500">
                          {t.primary_contact_email || t.tenant_id}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="border-t border-gray-100 px-3 py-2 text-[10px] text-gray-500">
            Founder identity preserved in audit log (core.tenant_actas_log).
          </div>
        </div>
      )}
    </div>
  );
}
