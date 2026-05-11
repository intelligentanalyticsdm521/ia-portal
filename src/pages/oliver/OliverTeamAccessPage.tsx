import { useCallback, useEffect, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader,
  DataTable,
  EmptyState,
  Button,
  type Column,
} from "../../components/oliver/ui";

interface TenantUser {
  userId: string;
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
  const { get, patch, ready } = useOliverApi();
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
      </div>
    </OliverPageWrapper>
  );
}
