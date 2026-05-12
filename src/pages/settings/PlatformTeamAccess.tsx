import { useEffect, useState, useCallback } from "react";
import { useMsal } from "@azure/msal-react";
import { authScopes } from "../../auth/msalConfig";
import { useAppState } from "../../app/AppState";
import { useUserAccess } from "../../hooks/useUserAccess";
import {
  listTenantUsers, updateTenantUserRole, updateTenantUserProducts,
  type PlatformTenantUser, type PlatformRole,
} from "../../lib/platformApi";

const PRODUCT_OPTIONS = ["arion", "oliver", "spark", "stella", "forge", "argus", "consulting"];

export function PlatformTeamAccess() {
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  const { active } = useAppState();
  const { isAdmin, canManageUsers, access } = useUserAccess();
  const [users, setUsers] = useState<PlatformTenantUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!account || !active?.tenant?.tenantId || !canManageUsers) return;
    setLoading(true);
    setError(null);
    try {
      const r = await instance.acquireTokenSilent({ scopes: authScopes, account });
      const res = await listTenantUsers({
        baseUrl: import.meta.env.VITE_PLATFORM_API_BASE_URL,
        bearerToken: r.accessToken,
        tenantId: active.tenant.tenantId,
      });
      setUsers(res.users);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [account, active?.tenant?.tenantId, canManageUsers, instance]);

  useEffect(() => { load(); }, [load]);

  async function changeRole(user: PlatformTenantUser, role: PlatformRole) {
    setSavingUserId(user.userId);
    try {
      const r = await instance.acquireTokenSilent({ scopes: authScopes, account: account! });
      await updateTenantUserRole({
        baseUrl: import.meta.env.VITE_PLATFORM_API_BASE_URL,
        bearerToken: r.accessToken,
        tenantId: active!.tenant!.tenantId,
        userId: user.userId,
        role,
      });
      await load();
    } catch (err) { setError(err); } finally { setSavingUserId(null); }
  }

  async function toggleProduct(user: PlatformTenantUser, key: string) {
    setSavingUserId(user.userId);
    try {
      const newList = user.products.includes(key)
        ? user.products.filter(p => p !== key)
        : [...user.products, key];
      const r = await instance.acquireTokenSilent({ scopes: authScopes, account: account! });
      await updateTenantUserProducts({
        baseUrl: import.meta.env.VITE_PLATFORM_API_BASE_URL,
        bearerToken: r.accessToken,
        tenantId: active!.tenant!.tenantId,
        userId: user.userId,
        products: newList,
      });
      await load();
    } catch (err) { setError(err); } finally { setSavingUserId(null); }
  }

  if (!access) {
    return <div className="p-6 text-sm text-gray-500">Loading access…</div>;
  }

  if (!isAdmin || !canManageUsers) {
    return (
      <div className="p-6">
        <div className="iadm-card">
          <div className="iadm-card-body">
            <h2 className="text-lg font-semibold">Team access</h2>
            <p className="mt-2 text-sm text-gray-600">
              Only tenant admins can manage team access. Your current role is{" "}
              <span className="font-medium">{access.role}</span>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Team access</h1>
        <p className="mt-1 text-sm text-gray-600">Manage platform roles + per-product access for users in this tenant.</p>
      </div>

      <div className="iadm-card">
        <div className="iadm-card-body">
          {loading && <div className="text-sm text-gray-500 py-4">Loading users…</div>}
          {error ? <div className="text-sm text-rose-600 py-2">Error loading users.</div> : null}
          {!loading && users.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2">User</th>
                  <th className="text-left py-2">Role</th>
                  <th className="text-left py-2">Product access</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.userId} className="border-b border-gray-100 align-top">
                    <td className="py-3 pr-4">
                      <div className="font-medium">{u.displayName || u.email}</div>
                      <div className="text-xs text-gray-500">{u.email}</div>
                      {u.isSelf && <div className="text-xs text-blue-600 mt-0.5">You</div>}
                      {!u.hasExplicitRole && <div className="text-xs text-gray-400 mt-0.5">Default (no explicit role set)</div>}
                    </td>
                    <td className="py-3 pr-4">
                      <select
                        value={u.role}
                        disabled={savingUserId === u.userId || u.isSelf}
                        onChange={e => changeRole(u, e.target.value as PlatformRole)}
                        className="border border-gray-300 rounded-md px-2 py-1 text-sm"
                      >
                        <option value="admin">Admin</option>
                        <option value="user">User</option>
                        <option value="read_only">Read only</option>
                      </select>
                      {u.isSelf && <div className="text-xs text-gray-400 mt-1">You can't change your own role.</div>}
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-1">
                        {PRODUCT_OPTIONS.map(p => {
                          const has = u.products.includes(p);
                          return (
                            <button key={p}
                              disabled={savingUserId === u.userId}
                              onClick={() => toggleProduct(u, p)}
                              className={`px-2 py-1 rounded text-xs border ${has ? "bg-emerald-100 text-emerald-700 border-emerald-300" : "bg-gray-50 text-gray-500 border-gray-200"}`}>
                              {p}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default PlatformTeamAccess;
