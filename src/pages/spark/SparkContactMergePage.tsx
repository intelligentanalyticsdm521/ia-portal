// SparkContactMergePage — Find and merge duplicate contacts (v3.0).
//
// Lists groups of contacts that share the same email or phone, lets the
// user pick a canonical contact, and merges each other contact into it.
// Merges are non-reversible — all activities/deals move to the kept
// contact and empty fields fill in from the merged source.
import { useCallback, useEffect, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Users, Mail, Phone, RefreshCw, AlertCircle, Check } from "lucide-react";

type DupKind = "email" | "phone";

interface ContactRow {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  lead_score: number | null;
  created_at: string;
  updated_at: string;
}

interface DupGroup {
  key: string;
  count: number;
  contacts: ContactRow[];
}

interface DupResponse {
  data: DupGroup[];
  kind: DupKind;
  total_groups: number;
}

interface MergeResponse {
  ok: boolean;
  kept_id: number;
  merged_id: number;
  moves: Record<string, number>;
  fills: Record<string, number>;
}

function fullName(c: ContactRow): string {
  const n = `${c.first_name || ""} ${c.last_name || ""}`.trim();
  return n || "(no name)";
}

export function SparkContactMergePage() {
  const { get, post, ready } = useSparkApi();
  const [kind, setKind] = useState<DupKind>("email");
  const [groups, setGroups] = useState<DupGroup[]>([]);
  const [totalGroups, setTotalGroups] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  // Per-group selected canonical contact ID
  const [selectedByGroup, setSelectedByGroup] = useState<Record<string, number>>({});
  // Per-group ephemeral merge progress
  const [busyGroup, setBusyGroup] = useState<string | null>(null);
  const [busyMergeId, setBusyMergeId] = useState<number | null>(null);
  // Groups that have been resolved (count <= 1 after refetch) — hide them.
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());

  const fetchGroups = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<DupResponse>(`/api/v1/contacts/duplicates?kind=${kind}&limit=100`);
      const items = r?.data || [];
      setGroups(items);
      setTotalGroups(r?.total_groups || items.length);
      // Default-select the first contact in each group (usually the oldest/lowest id).
      const defaults: Record<string, number> = {};
      for (const g of items) {
        if (g.contacts.length > 0) defaults[g.key] = g.contacts[0].id;
      }
      setSelectedByGroup(defaults);
      setHiddenKeys(new Set());
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready, kind]);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  async function refetchSingleGroup(key: string) {
    try {
      const r = await get<DupResponse>(`/api/v1/contacts/duplicates?kind=${kind}&limit=100`);
      const fresh = (r?.data || []).find((g) => g.key === key);
      if (!fresh || fresh.contacts.length <= 1) {
        setHiddenKeys((prev) => { const n = new Set(prev); n.add(key); return n; });
        return;
      }
      setGroups((prev) => prev.map((g) => (g.key === key ? fresh : g)));
      setSelectedByGroup((prev) => {
        if (fresh.contacts.find((c) => c.id === prev[key])) return prev;
        return { ...prev, [key]: fresh.contacts[0].id };
      });
    } catch {
      // Refetch failure is non-critical — leave the group as-is.
    }
  }

  async function doMerge(groupKey: string, keepId: number, mergeId: number) {
    if (!confirm(
      `This merge is NOT reversible.\n\n` +
      `All activities, deals, list memberships and tags from the merged contact will move to the kept contact, ` +
      `and the merged contact will be soft-deleted. Continue?`
    )) return;
    setBusyGroup(groupKey);
    setBusyMergeId(mergeId);
    try {
      await post<MergeResponse>(`/api/v1/contacts/${keepId}/merge`, { merge_id: mergeId });
      await refetchSingleGroup(groupKey);
    } catch (err) {
      alert(`Merge failed: ${(err as Error).message}`);
    } finally {
      setBusyGroup(null);
      setBusyMergeId(null);
    }
  }

  const visibleGroups = groups.filter((g) => !hiddenKeys.has(g.key) && g.contacts.length > 1);

  return (
    <SparkPageShell
      title="Contact Merge"
      subtitle={`${visibleGroups.length} duplicate group${visibleGroups.length === 1 ? "" : "s"} loaded${totalGroups !== visibleGroups.length ? ` of ${totalGroups} total` : ""}`}
      help="Contacts that share the same email or phone number are surfaced here. Pick a canonical contact, then click 'Merge into selected' on each duplicate row. All activities, deals, and tags move to the kept contact. This action is non-reversible."
      actions={
        <button onClick={fetchGroups} className="text-sm px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 flex items-center gap-1">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      }
      filters={
        <div className="flex items-center gap-1">
          <button
            onClick={() => setKind("email")}
            className={`text-xs px-3 py-1.5 rounded-l border flex items-center gap-1 ${
              kind === "email"
                ? "bg-[#EF6C33] border-[#EF6C33] text-white"
                : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
            }`}
          >
            <Mail className="h-3.5 w-3.5" /> By email
          </button>
          <button
            onClick={() => setKind("phone")}
            className={`text-xs px-3 py-1.5 rounded-r border flex items-center gap-1 -ml-px ${
              kind === "phone"
                ? "bg-[#EF6C33] border-[#EF6C33] text-white"
                : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
            }`}
          >
            <Phone className="h-3.5 w-3.5" /> By phone
          </button>
        </div>
      }
      loading={loading}
      error={error}
    >
      {visibleGroups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-12 text-center">
          <Users className="h-8 w-8 mx-auto text-slate-300 mb-2" />
          <div className="text-sm font-medium text-slate-700">No duplicate {kind === "email" ? "emails" : "phone numbers"}</div>
          <div className="text-xs text-slate-500 mt-1">Your contact list is clean on this dimension.</div>
        </div>
      ) : (
        <div className="space-y-4">
          {visibleGroups.map((g) => {
            const selectedId = selectedByGroup[g.key] ?? g.contacts[0]?.id;
            const busy = busyGroup === g.key;
            return (
              <div key={g.key} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {kind === "email" ? <Mail className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" /> : <Phone className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />}
                    <code className="text-xs font-mono text-slate-700 truncate">{g.key}</code>
                  </div>
                  <span className="text-[10px] uppercase tracking-wide font-semibold text-slate-500 flex-shrink-0">
                    {g.count} duplicate{g.count === 1 ? "" : "s"}
                  </span>
                </div>
                <ul className="divide-y divide-slate-100">
                  {g.contacts.map((c) => {
                    const isCanonical = c.id === selectedId;
                    const isBusyRow = busy && busyMergeId === c.id;
                    return (
                      <li
                        key={c.id}
                        className={`px-4 py-2.5 flex items-center gap-3 ${isCanonical ? "bg-orange-50" : "bg-white"}`}
                      >
                        <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                          <input
                            type="radio"
                            name={`canonical-${g.key}`}
                            checked={isCanonical}
                            onChange={() => setSelectedByGroup((prev) => ({ ...prev, [g.key]: c.id }))}
                            className="accent-[#EF6C33]"
                            disabled={busy}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-slate-900 truncate">
                                {fullName(c)}
                              </span>
                              <span className="text-[10px] text-slate-400 tabular-nums flex-shrink-0">#{c.id}</span>
                              {c.lead_score != null && (
                                <span className="text-[10px] font-medium bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full flex-shrink-0">
                                  Score {c.lead_score}
                                </span>
                              )}
                              {isCanonical && (
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-[#EF6C33] flex items-center gap-0.5 flex-shrink-0">
                                  <Check className="h-3 w-3" /> Canonical
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {c.email || "—"}{c.phone ? ` · ${c.phone}` : ""}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              Created {new Date(c.created_at).toLocaleDateString()} · Updated {new Date(c.updated_at).toLocaleDateString()}
                            </div>
                          </div>
                        </label>
                        <div className="flex-shrink-0">
                          {!isCanonical && (
                            <button
                              type="button"
                              disabled={busy || selectedId == null}
                              onClick={() => selectedId != null && doMerge(g.key, selectedId, c.id)}
                              className="text-xs px-2.5 py-1.5 rounded border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 disabled:opacity-50 flex items-center gap-1"
                              title="Merge this contact into the canonical contact above"
                            >
                              {isBusyRow ? (
                                <><RefreshCw className="h-3 w-3 animate-spin" /> Merging…</>
                              ) : (
                                <><AlertCircle className="h-3 w-3" /> Merge into selected</>
                              )}
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </SparkPageShell>
  );
}

export default SparkContactMergePage;
