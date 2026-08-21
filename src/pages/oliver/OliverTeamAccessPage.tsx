import { useCallback, useEffect, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { useOliverLocations } from "../../hooks/useOliverLocations";
import { useOliverRole } from "../../hooks/useOliverRole";
import { membershipUpdates, parseMembers, userLocationIds, type LocationMembership, type OliverLocation, type OliverLocationMembers } from "../../lib/oliverLocations";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader,
  DataTable,
  EmptyState,
  Button,
  type Column,
} from "../../components/oliver/ui";

/** GET /tenant-users row. `tenantUserId` (core.tenant_users) is what /members stores — see MemberIdentity. */
interface TenantUser {
  userId: string;
  tenantUserId?: string | null;
  email: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  joinedAt: string;
  role: "admin" | "accountant";
  isSelf: boolean;
}

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  accountant: "Accountant",
};

const ROLE_DESCRIPTION: Record<string, string> = {
  admin: "Full access to every OLIVER surface — jobs, dispatch, billing, settings.",
  accountant: "Read-only view of Billing, Invoices, Payments, Reports, and Reminders.",
};

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return "—";
  }
}

export function OliverTeamAccessPage() {
  const { get, patch, put, ready } = useOliverApi();
  // Multi-location: admins can limit a user to specific locations. The
  // column only exists for a business with 2+ active locations.
  const loc = useOliverLocations();
  const { roleInfo } = useOliverRole();
  const scopeEnabled = loc.multi && roleInfo.role === "admin";
  const [membership, setMembership] = useState<LocationMembership>({});
  const [membershipLoaded, setMembershipLoaded] = useState(false);
  const [scopeUser, setScopeUser] = useState<TenantUser | null>(null);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  // Pending optimistic change state — keyed by userId, holds the role the
  // user is being moved to. Cleared when the patch resolves.
  const [pending, setPending] = useState<Record<string, "admin" | "accountant">>({});

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await get<{ users: TenantUser[] }>("/tenant-users");
      setUsers(data?.users || []);
    } catch (err: unknown) {
      // 403 here means the caller isn't an admin — the nav already hides
      // this page from accountants, but guard for direct-link access.
      const msg = err instanceof Error ? err.message : "Failed to load team access";
      setError(msg.includes("403") ? "Admin role required to view this page." : msg);
    } finally {
      setLoading(false);
    }
  }, [get]);

  useEffect(() => {
    if (!ready) return;
    reload();
  }, [ready, reload]);

  // location_id -> members, one small GET per active location. Entries are
  // tenant_user_ids (core.tenant_users) — matched to a /tenant-users row via
  // its tenantUserId, or its userId when the API joins user_ids.
  useEffect(() => {
    if (!ready || !scopeEnabled) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(loc.activeLocations.map(async (l) => {
        try {
          const m = await get<OliverLocationMembers>(`/locations/${l.location_id}/members`);
          return [l.location_id, parseMembers(m)] as const;
        } catch {
          return [l.location_id, parseMembers(null)] as const;
        }
      }));
      if (!cancelled) { setMembership(Object.fromEntries(entries)); setMembershipLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, [ready, scopeEnabled, loc.activeLocations, get]);

  const changeRole = useCallback(
    async (user: TenantUser, role: "admin" | "accountant") => {
      if (user.isSelf && role !== "admin") return; // self-demote guard
      if (user.role === role) return;
      setSavingUserId(user.userId);
      setPending((p) => ({ ...p, [user.userId]: role }));
      try {
        await patch<{ userId: string; role: string }>(
          `/tenant-users/${user.userId}/role`,
          { role },
        );
        setUsers((prev) =>
          prev.map((u) => (u.userId === user.userId ? { ...u, role } : u)),
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to update role";
        setError(msg);
      } finally {
        setSavingUserId(null);
        setPending((p) => {
          const next = { ...p };
          delete next[user.userId];
          return next;
        });
      }
    },
    [patch],
  );

  const columns: Column<TenantUser>[] = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      sortAccessor: (u) => (u.fullName || u.email).toLowerCase(),
      render: (u) => (
        <div>
          <div style={{ fontWeight: 600, color: "#1A3A4A" }}>
            {u.fullName || `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email}
            {u.isSelf && (
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 11,
                  background: "#E0F2FE",
                  color: "#075985",
                  padding: "1px 6px",
                  borderRadius: 99,
                }}
              >
                You
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: "#5A7A8A" }}>{u.email}</div>
        </div>
      ),
    },
    {
      key: "joinedAt",
      header: "Joined",
      sortable: true,
      sortAccessor: (u) => u.joinedAt,
      render: (u) => <span style={{ color: "#5A7A8A", fontSize: 13 }}>{fmtDate(u.joinedAt)}</span>,
    },
    {
      key: "role",
      header: "Role",
      width: "260px",
      render: (u) => {
        const isSaving = savingUserId === u.userId;
        const pendingRole = pending[u.userId];
        const effectiveRole = pendingRole ?? u.role;
        const canDemote = !u.isSelf;
        return (
          <div style={{ display: "flex", gap: 6 }}>
            {(["admin", "accountant"] as const).map((r) => {
              const active = effectiveRole === r;
              const disabled = isSaving || (r === "accountant" && !canDemote);
              return (
                <button
                  key={r}
                  type="button"
                  disabled={disabled}
                  onClick={() => changeRole(u, r)}
                  title={
                    r === "accountant" && !canDemote
                      ? "You cannot demote your own role. Ask another admin to do it."
                      : ROLE_DESCRIPTION[r]
                  }
                  style={{
                    padding: "5px 12px",
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 999,
                    border: active ? "1px solid #1A3A4A" : "1px solid #D5E2E8",
                    background: active ? "#1A3A4A" : "#FFFFFF",
                    color: active ? "#FFFFFF" : "#1A3A4A",
                    cursor: disabled ? "not-allowed" : "pointer",
                    opacity: disabled ? 0.55 : 1,
                  }}
                >
                  {ROLE_LABEL[r]}
                </button>
              );
            })}
          </div>
        );
      },
    },
    ...(scopeEnabled ? [{
      key: "locations",
      header: "Location scope",
      width: "200px",
      render: (u: TenantUser) => {
        const ids = userLocationIds(membership, u);
        const label = !membershipLoaded ? "…" : ids.length === 0 ? "All locations" : `${ids.length} of ${loc.activeLocations.length}`;
        return (
          <button
            type="button"
            disabled={!membershipLoaded}
            onClick={() => setScopeUser(u)}
            title="Limit this user to specific locations"
            style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600, borderRadius: 999, border: "1px solid #D5E2E8", background: "#fff", color: "#1A3A4A", cursor: membershipLoaded ? "pointer" : "wait" }}
          >
            {label}
          </button>
        );
      },
    } satisfies Column<TenantUser>] : []),
  ];

  // Surface a load failure through the wrapper so it gets the standard
  // error card. Inline action errors (single-row PATCH failures) are
  // shown as a dismissible banner instead so the table stays visible.
  const wrapperError = !users.length && error ? error : null;

  return (
    <OliverPageWrapper
      title="Team Access"
      subtitle="Choose who has full OLIVER admin access and who has a read-only accountant view."
      error={wrapperError}
      loading={loading && !users.length}
    >
      <PageHeader
        title="Team Access"
        subtitle="Choose who has full OLIVER admin access and who has a read-only accountant view."
      />

      {error && users.length > 0 && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            background: "#FEF2F2",
            color: "#991B1B",
            border: "1px solid #FECACA",
            borderRadius: 8,
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>{error}</span>
          <Button variant="ghost" onClick={() => setError(null)}>Dismiss</Button>
        </div>
      )}

      <div style={{ marginTop: 16, background: "#FFFFFF", borderRadius: 12, padding: 0 }}>
        {users.length === 0 ? (
          <EmptyState
            title="No users yet"
            description="Once you invite a teammate to OLIVER, they'll show up here so you can pick their role."
          />
        ) : (
          <DataTable
            rows={users}
            columns={columns}
            rowKey={(u) => u.userId}
            initialSort={{ key: "name", direction: "asc" }}
          />
        )}
      </div>

      <div
        style={{
          marginTop: 16,
          padding: 16,
          background: "#F8FAFC",
          border: "1px solid #E2E8F0",
          borderRadius: 8,
          fontSize: 13,
          color: "#475569",
          lineHeight: 1.6,
        }}
      >
        <div style={{ fontWeight: 600, color: "#1A3A4A", marginBottom: 6 }}>About the roles</div>
        <div>
          <strong>Admin</strong> — {ROLE_DESCRIPTION.admin}
        </div>
        <div>
          <strong>Accountant</strong> — {ROLE_DESCRIPTION.accountant}
        </div>
        {scopeEnabled && (
          <div style={{ marginTop: 6 }}>
            <strong>Location scope</strong> — limit a user to specific locations. Users with no limit see every location.
          </div>
        )}
      </div>

      {scopeUser && (
        <LocationScopeModal
          user={scopeUser}
          locations={loc.activeLocations}
          current={userLocationIds(membership, scopeUser)}
          onClose={() => setScopeUser(null)}
          onSave={async (desired) => {
            const updates = membershipUpdates(membership, scopeUser, desired);
            for (const u of updates) {
              await put(`/locations/${u.location_id}/members`, { tenant_user_ids: u.tenant_user_ids } satisfies OliverLocationMembers);
            }
            setMembership((prev) => {
              const next = { ...prev };
              for (const u of updates) next[u.location_id] = u.members;
              return next;
            });
            setScopeUser(null);
          }}
        />
      )}
    </OliverPageWrapper>
  );
}

// ─── Location scope modal ────────────────────────────────────────────────────
function LocationScopeModal({ user, locations, current, onClose, onSave }: {
  user: TenantUser;
  locations: OliverLocation[];
  current: string[];
  onClose: () => void;
  onSave: (desired: string[]) => Promise<void>;
}) {
  const [mode, setMode] = useState<"all" | "selected">(current.length ? "selected" : "all");
  const [picked, setPicked] = useState<Set<string>>(new Set(current.map((s) => s.toLowerCase())));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const name = user.fullName || `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email;

  function toggle(id: string) {
    const k = id.toLowerCase();
    setPicked((cur) => { const n = new Set(cur); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  }

  async function save() {
    setErr(null);
    const desired = mode === "all" ? [] : locations.filter((l) => picked.has(l.location_id.toLowerCase())).map((l) => l.location_id);
    if (mode === "selected" && desired.length === 0) { setErr("Pick at least one location, or choose All locations."); return; }
    setSaving(true);
    try { await onSave(desired); }
    catch (e) { setErr(e instanceof Error ? e.message : "Save failed"); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(11,28,36,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 440, maxWidth: "94vw", background: "#fff", borderRadius: 8 }}>
        <div style={{ padding: 18, borderBottom: "1px solid #E2E8F0" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1A3A4A" }}>Location scope — {name}</h2>
          <div style={{ fontSize: 12, color: "#5A7A8A", marginTop: 4 }}>Which locations this user can see and work in.</div>
        </div>
        <div style={{ padding: 18, display: "grid", gap: 10, fontSize: 13, color: "#334155" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="radio" checked={mode === "all"} onChange={() => setMode("all")} /> All locations
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="radio" checked={mode === "selected"} onChange={() => setMode("selected")} /> Only these locations
          </label>
          {mode === "selected" && (
            <div style={{ border: "1px solid #E2E8F0", borderRadius: 6, padding: 8, marginLeft: 22 }}>
              {locations.map((l) => (
                <label key={l.location_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 2px", fontSize: 12 }}>
                  <input type="checkbox" checked={picked.has(l.location_id.toLowerCase())} onChange={() => toggle(l.location_id)} />
                  {l.name}{l.is_default ? " (default)" : ""}
                </label>
              ))}
            </div>
          )}
          {err && <div style={{ padding: 10, fontSize: 12, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 6 }}>{err}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
