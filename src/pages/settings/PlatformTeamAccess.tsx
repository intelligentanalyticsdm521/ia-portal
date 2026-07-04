import { useEffect, useState, useCallback } from "react";
import { useMsal } from "@azure/msal-react";
import { authScopes } from "../../auth/msalConfig";
import { useAppState } from "../../app/AppState";
import { useUserAccess } from "../../hooks/useUserAccess";
import {
  listTenantUsers, updateTenantUserRole, updateTenantUserProducts,
  listPendingInvitations, inviteTenantUser,
  type PlatformTenantUser, type PlatformRole, type PendingInvitation,
} from "../../lib/platformApi";

const PRODUCT_OPTIONS = ["arion", "oliver", "spark", "stella", "forge", "argus", "consulting"];

const ROLE_LABEL: Record<string, string> = { admin: "Admin", user: "User", read_only: "Read only" };

export function PlatformTeamAccess() {
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  const { active } = useAppState();
  const { isAdmin, canManageUsers, access } = useUserAccess();
  const [users, setUsers] = useState<PlatformTenantUser[]>([]);
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  // Invite form
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<PlatformRole>("user");
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!account || !active?.tenant?.tenantId || !canManageUsers) return;
    setLoading(true);
    setError(null);
    try {
      const r = await instance.acquireTokenSilent({ scopes: authScopes, account });
      const common = {
        baseUrl: import.meta.env.VITE_PLATFORM_API_BASE_URL,
        bearerToken: r.accessToken,
        tenantId: active.tenant.tenantId,
      };
      const [usersRes, invRes] = await Promise.all([
        listTenantUsers(common),
        listPendingInvitations(common).catch(() => ({ invitations: [] as PendingInvitation[] })),
      ]);
      setUsers(usersRes.users);
      setInvitations(invRes.invitations);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [account, active?.tenant?.tenantId, canManageUsers, instance]);

  useEffect(() => { load(); }, [load]);

  async function submitInvite() {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) { setInviteMsg({ kind: "err", text: "Enter an email address." }); return; }
    setInviting(true);
    setInviteMsg(null);
    try {
      const r = await instance.acquireTokenSilent({ scopes: authScopes, account: account! });
      const res = await inviteTenantUser({
        baseUrl: import.meta.env.VITE_PLATFORM_API_BASE_URL,
        bearerToken: r.accessToken,
        tenantId: active!.tenant!.tenantId,
        email,
        role: inviteRole,
      });
      setInviteMsg({ kind: "ok", text: res.note || "Invitation created." });
      setInviteEmail("");
      setInviteRole("user");
      await load();
    } catch (err: any) {
      setInviteMsg({ kind: "err", text: err?.message || "Could not create the invitation." });
    } finally { setInviting(false); }
  }

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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Team access</h1>
          <p className="mt-1 text-sm text-gray-600">Invite teammates and manage their roles + per-product access.</p>
        </div>
        <button
          onClick={() => { setShowInvite(v => !v); setInviteMsg(null); }}
          className="shrink-0 rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          {showInvite ? "Close" : "Invite teammate"}
        </button>
      </div>

      {showInvite && (
        <div className="iadm-card">
          <div className="iadm-card-body space-y-3">
            <h2 className="text-sm font-semibold text-gray-800">Invite a teammate</h2>
            <p className="text-xs text-gray-500">
              They'll join your team automatically the first time they sign in with this email.
              You can adjust their product access once they've joined.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col text-xs text-gray-600">
                Email
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="teammate@business.com"
                  className="mt-1 w-64 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="flex flex-col text-xs text-gray-600">
                Role
                <select
                  value={inviteRole}
                  onChange={e => setInviteRole(e.target.value as PlatformRole)}
                  className="mt-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                >
                  <option value="admin">Admin — full access, can manage the team</option>
                  <option value="user">User — day-to-day work, no settings/billing</option>
                  <option value="read_only">Read only — view, no changes</option>
                </select>
              </label>
              <button
                onClick={submitInvite}
                disabled={inviting}
                className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {inviting ? "Sending…" : "Send invite"}
              </button>
            </div>
            {inviteMsg && (
              <div className={`text-xs ${inviteMsg.kind === "ok" ? "text-emerald-700" : "text-rose-600"}`}>
                {inviteMsg.text}
              </div>
            )}
          </div>
        </div>
      )}

      {invitations.length > 0 && (
        <div className="iadm-card">
          <div className="iadm-card-body">
            <h2 className="text-sm font-semibold text-gray-800">Pending invitations</h2>
            <p className="text-xs text-gray-500 mb-2">Waiting for the invitee to sign in for the first time.</p>
            <ul className="divide-y divide-gray-100">
              {invitations.map(inv => (
                <li key={inv.email} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-gray-700">{inv.email}</span>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                    {ROLE_LABEL[inv.role_key] || inv.role_key} · pending
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

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
