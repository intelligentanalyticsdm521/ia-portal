// SparkCalendarSyncPage — Two-way iCal calendar sync (v1.17).
//
// Two tabs:
//   - "Outbound shares" — publish the tenant's content calendar as iCal
//     URL that users subscribe to from Google Calendar / Outlook.
//   - "Inbound subscriptions" — paste an external iCal URL and we poll it
//     every N minutes, upserting events into the content calendar.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import {
  CalendarDays,
  Plus,
  Trash2,
  Copy,
  Check,
  RefreshCw,
  Globe,
  Share2,
  Link as LinkIcon,
} from "lucide-react";

interface Share {
  id: number;
  token: string;
  label: string | null;
  owner_user: string | null;
  is_active: boolean;
  last_pulled_at: string | null;
  pull_count: number;
  created_at: string;
}

interface Subscription {
  id: number;
  label: string;
  feed_url: string;
  sync_interval_minutes: number;
  last_synced_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  events_imported: number;
  is_active: boolean;
  created_at: string;
}

export function SparkCalendarSyncPage() {
  const { get, post, del, ready } = useSparkApi();
  const [tab, setTab] = useState<"outbound" | "inbound">("outbound");
  const [shares, setShares] = useState<Share[]>([]);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const apiBase = useMemo(() => {
    // Best-effort: derive the public LUMEN-API URL for the share link the user copies.
    // Fall back to placeholder if we don't know.
    const host = typeof window !== "undefined" ? window.location.host : "";
    if (host.includes("localhost")) return "http://localhost:8080";
    return ""; // platform deploys configure VITE_LUMEN_API_BASE_URL via the sparkApi helper
  }, []);

  const fetchAll = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const [s, u] = await Promise.all([
        get<{ data: Share[] }>("/api/v1/calendar-shares"),
        get<{ data: Subscription[] }>("/api/v1/calendar-subscriptions"),
      ]);
      setShares(s?.data || []);
      setSubs(u?.data || []);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Outbound (shares) ────────────────────────────────────────────
  const [shareLabel, setShareLabel] = useState("");
  async function createShare() {
    if (!shareLabel.trim()) return;
    try {
      await post("/api/v1/calendar-shares", { label: shareLabel.trim() });
      setShareLabel("");
      await fetchAll();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }
  async function deactivateShare(id: number) {
    if (!confirm("Deactivate this share? Subscribers who use the link will stop receiving updates.")) return;
    try { await del(`/api/v1/calendar-shares/${id}`); await fetchAll(); }
    catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }
  async function copy(text: string, key: string) {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1500); }
    catch (e) { alert(`Copy failed: ${(e as Error).message}`); }
  }

  // ── Inbound (subscriptions) ──────────────────────────────────────
  const [subForm, setSubForm] = useState({ label: "", feed_url: "", interval: 60 });
  async function createSub() {
    if (!subForm.label.trim() || !subForm.feed_url.trim()) return;
    try {
      await post("/api/v1/calendar-subscriptions", {
        label: subForm.label.trim(),
        feed_url: subForm.feed_url.trim(),
        sync_interval_minutes: subForm.interval,
      });
      setSubForm({ label: "", feed_url: "", interval: 60 });
      await fetchAll();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }
  async function deactivateSub(id: number) {
    if (!confirm("Deactivate this subscription? Imported events stay; new syncs will stop.")) return;
    try { await del(`/api/v1/calendar-subscriptions/${id}`); await fetchAll(); }
    catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }
  async function syncNow(id: number) {
    try {
      const r = await post<{ ok: boolean; imported?: number; updated?: number; total?: number }>(`/api/v1/calendar-subscriptions/${id}/sync`, {});
      alert(`Synced. Imported ${r.imported || 0}, updated ${r.updated || 0} of ${r.total || 0} events.`);
      await fetchAll();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  return (
    <SparkPageShell
      title="Calendar Sync"
      subtitle={`${shares.filter(s => s.is_active).length} shares · ${subs.filter(s => s.is_active).length} subscriptions`}
      help="Outbound: publish the SPARK content calendar as an iCal URL you (or your team) subscribe to in Google Calendar / Outlook. Inbound: paste an external iCal feed URL and we poll it every N minutes, importing events into the content calendar."
      loading={loading}
      error={error}
    >
      <div className="mb-4 flex gap-1 border-b border-slate-200">
        <button
          onClick={() => setTab("outbound")}
          className={`px-3 py-2 text-sm border-b-2 -mb-px ${tab === "outbound" ? "border-[#EF6C33] text-[#EF6C33] font-semibold" : "border-transparent text-slate-600"}`}
        >
          <Share2 className="inline h-4 w-4 mr-1" /> Outbound Shares ({shares.filter(s => s.is_active).length})
        </button>
        <button
          onClick={() => setTab("inbound")}
          className={`px-3 py-2 text-sm border-b-2 -mb-px ${tab === "inbound" ? "border-[#EF6C33] text-[#EF6C33] font-semibold" : "border-transparent text-slate-600"}`}
        >
          <Globe className="inline h-4 w-4 mr-1" /> Inbound Subscriptions ({subs.filter(s => s.is_active).length})
        </button>
      </div>

      {tab === "outbound" ? (
        <>
          <div className="rounded-lg border border-slate-200 bg-white p-4 mb-4">
            <div className="text-sm font-semibold text-slate-900 mb-2">Create a share link</div>
            <div className="flex gap-2">
              <input
                value={shareLabel}
                onChange={(e) => setShareLabel(e.target.value)}
                placeholder="Label (e.g. 'My personal Google Calendar')"
                className="flex-1 text-sm border border-slate-300 rounded px-2 py-1.5 focus:border-[#EF6C33]"
              />
              <button onClick={createShare} disabled={!shareLabel.trim()} className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white disabled:opacity-50 flex items-center gap-1">
                <Plus className="h-4 w-4" /> Create
              </button>
            </div>
            <div className="text-[10px] text-slate-500 mt-2">
              Each share has a unique random token in its URL. Anyone with the URL can subscribe — treat the link like a password.
            </div>
          </div>

          {shares.filter(s => s.is_active).length === 0 ? (
            <EmptyState text="No active shares yet." />
          ) : (
            <ul className="space-y-2">
              {shares.filter(s => s.is_active).map((s) => {
                const url = `${apiBase}/api/v1/calendar.ics/${s.token}`;
                return (
                  <li key={s.id} className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-sm text-slate-900 truncate">{s.label || "(no label)"}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Created {new Date(s.created_at).toLocaleDateString()} · pulled {s.pull_count}× · last {s.last_pulled_at ? new Date(s.last_pulled_at).toLocaleString() : "never"}
                        </div>
                      </div>
                      <button onClick={() => deactivateShare(s.id)} className="text-xs flex items-center gap-1 px-2 py-1 rounded border border-red-200 bg-white text-red-600 hover:bg-red-50">
                        <Trash2 className="h-3 w-3" /> Deactivate
                      </button>
                    </div>
                    <div className="mt-2 flex items-center gap-1">
                      <code className="flex-1 font-mono text-[10px] bg-slate-50 border border-slate-200 rounded px-2 py-1 truncate">
                        {url}
                      </code>
                      <button onClick={() => copy(url, `share-${s.id}`)} className="text-xs px-2 py-1 rounded bg-slate-700 text-white flex items-center gap-1">
                        {copied === `share-${s.id}` ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : (
        <>
          <div className="rounded-lg border border-slate-200 bg-white p-4 mb-4">
            <div className="text-sm font-semibold text-slate-900 mb-2">Add an external iCal feed</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <input
                value={subForm.label}
                onChange={(e) => setSubForm({ ...subForm, label: e.target.value })}
                placeholder="Label (e.g. 'Holidays')"
                className="text-sm border border-slate-300 rounded px-2 py-1.5"
              />
              <input
                value={subForm.feed_url}
                onChange={(e) => setSubForm({ ...subForm, feed_url: e.target.value })}
                placeholder="https://calendar.google.com/calendar/ical/..."
                className="md:col-span-2 text-sm border border-slate-300 rounded px-2 py-1.5 font-mono"
              />
            </div>
            <div className="flex items-center gap-2 mt-2">
              <label className="text-xs text-slate-600">
                Sync every
                <input
                  type="number"
                  min={5} max={1440}
                  value={subForm.interval}
                  onChange={(e) => setSubForm({ ...subForm, interval: parseInt(e.target.value) || 60 })}
                  className="ml-1 w-16 text-xs border border-slate-300 rounded px-1 py-0.5 tabular-nums"
                />
                <span className="ml-1">minutes (min 5)</span>
              </label>
              <button onClick={createSub} disabled={!subForm.label.trim() || !subForm.feed_url.trim()} className="ml-auto text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white disabled:opacity-50 flex items-center gap-1">
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>
          </div>

          {subs.filter(s => s.is_active).length === 0 ? (
            <EmptyState text="No active subscriptions yet." />
          ) : (
            <ul className="space-y-2">
              {subs.filter(s => s.is_active).map((s) => (
                <li key={s.id} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-slate-900 truncate">{s.label}</span>
                        {s.last_sync_status === "ok" && (
                          <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">OK</span>
                        )}
                        {s.last_sync_status === "error" && (
                          <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-700">Error</span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-1">
                        <LinkIcon className="h-3 w-3 text-slate-400 flex-shrink-0" />
                        <code className="font-mono text-[10px] text-slate-500 truncate flex-1">{s.feed_url}</code>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Every {s.sync_interval_minutes} min · last {s.last_synced_at ? new Date(s.last_synced_at).toLocaleString() : "never"} · {s.events_imported.toLocaleString()} imported
                      </div>
                      {s.last_sync_error && (
                        <div className="mt-1 text-[10px] text-red-700 bg-red-50 rounded px-2 py-1">
                          {s.last_sync_error.slice(0, 200)}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => syncNow(s.id)} className="text-xs flex items-center gap-1 px-2 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50">
                        <RefreshCw className="h-3 w-3" /> Sync now
                      </button>
                      <button onClick={() => deactivateSub(s.id)} className="text-xs flex items-center gap-1 px-2 py-1 rounded border border-red-200 bg-white text-red-600 hover:bg-red-50">
                        <Trash2 className="h-3 w-3" /> Deactivate
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </SparkPageShell>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-10 text-center">
      <CalendarDays className="h-8 w-8 mx-auto text-slate-300 mb-2" />
      <div className="text-sm font-medium text-slate-700">{text}</div>
    </div>
  );
}

export default SparkCalendarSyncPage;
