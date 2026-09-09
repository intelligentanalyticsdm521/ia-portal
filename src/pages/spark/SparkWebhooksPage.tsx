// SparkWebhooksPage — outbound webhook subscriptions.
//
// WHAT WAS HERE UNTIL 2026-09-08
// ─────────────────────────────────────────────────────────────────────────────
// A Coming Soon banner: "We're building our own outbound webhook stack — HMAC-
// signed payloads, automatic retries with backoff, per-event filtering, and a
// delivery log … Available in SPARK v1.5."
//
// All four of those things already existed. LUMEN routes/webhookSubscriptions.js
// has the full CRUD, a reveal-once signing secret, a test fire, a per-subscription
// delivery list with payload + response, a tenant-wide delivery dashboard and a
// one-click retry — and lib/webhookDispatcher signs every payload and backs off on
// failure. The banner's own comment said the page had been reduced because the old
// UI was "a half-built CRUD"; what shipped instead was a promise, and the note
// that "power users can still hit the underlying API directly" is not something a
// client can act on.
//
// This is that API. Nothing new was built on the server for it.
//
// THE SIGNING SECRET IS SHOWN ONCE, on create, and never again — the server
// returns it from POST and stores it for verification, so this page cannot fetch
// it back later and says so plainly rather than leaving somebody hunting.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Webhook, Plus, Trash2, Send, X, Copy as CopyIcon, Check, AlertTriangle, ChevronRight,
} from "lucide-react";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { useSparkApi } from "../../hooks/useSparkApi";

interface Subscription {
  id: number;
  name: string;
  target_url: string;
  /** JSON array as stored. */
  events: string | string[];
  is_active: boolean;
  last_fire_at: string | null;
  last_status: number | null;
  consecutive_failures: number;
  created_at: string;
  created_by: string | null;
}

interface Delivery {
  id: number;
  event_type: string;
  event_id: string | null;
  status_code: number | null;
  error_message: string | null;
  attempt_count: number;
  next_retry_at: string | null;
  delivered_at: string | null;
  occurred_at: string;
  duration_ms: number | null;
}

function parseEvents(e: Subscription["events"]): string[] {
  if (Array.isArray(e)) return e;
  try { const v = JSON.parse(String(e || "[]")); return Array.isArray(v) ? v : []; }
  catch { return []; }
}

function when(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

/** 2xx green, anything else red, nothing yet grey. */
function StatusPill({ code }: { code: number | null }) {
  if (code == null) return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">Not fired yet</span>;
  const ok = code >= 200 && code < 300;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
      {code}
    </span>
  );
}

export function SparkWebhooksPage() {
  const { get, post, patch, del, ready } = useSparkApi();

  const [rows, setRows] = useState<Subscription[]>([]);
  const [knownEvents, setKnownEvents] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Drawer state — create, or edit one.
  const [drawer, setDrawer] = useState<null | { mode: "create" } | { mode: "edit"; row: Subscription }>(null);
  const [form, setForm] = useState<{ name: string; target_url: string; events: string[] }>({ name: "", target_url: "", events: [] });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  /** Shown ONCE, right after create. Never re-fetchable. */
  const [freshSecret, setFreshSecret] = useState<{ name: string; secret: string } | null>(null);

  // The delivery log for whichever subscription is expanded.
  const [openLog, setOpenLog] = useState<number | null>(null);
  const [deliveries, setDeliveries] = useState<Record<number, Delivery[]>>({});

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<{ data: Subscription[]; known_events: string[] }>("/api/v1/webhook-subscriptions");
      setRows(r.data || []);
      setKnownEvents(r.known_events || []);
    } catch (err) {
      // Shown, not swallowed: an empty list and a failed list are different things.
      setError(err);
    } finally { setLoading(false); }
  }, [get, ready]);
  useEffect(() => { load(); }, [load]);

  const active = useMemo(() => rows.filter((r) => r.is_active), [rows]);
  const failing = useMemo(() => rows.filter((r) => r.is_active && r.consecutive_failures > 0), [rows]);

  function openCreate() {
    setForm({ name: "", target_url: "", events: [] });
    setFormError(null);
    setDrawer({ mode: "create" });
  }
  function openEdit(row: Subscription) {
    setForm({ name: row.name, target_url: row.target_url, events: parseEvents(row.events) });
    setFormError(null);
    setDrawer({ mode: "edit", row });
  }

  function toggleEvent(ev: string) {
    setForm((f) => ({
      ...f,
      events: f.events.includes(ev) ? f.events.filter((x) => x !== ev) : [...f.events, ev],
    }));
  }

  async function save() {
    if (!drawer) return;
    setFormError(null);
    if (!form.name.trim()) return setFormError("Give it a name so you can tell it apart later.");
    if (!form.target_url.trim()) return setFormError("Where should we send it?");
    try { new URL(form.target_url.trim()); } catch { return setFormError("That is not a full web address — it needs to start with https://"); }
    if (!form.events.length) return setFormError("Pick at least one thing to be told about.");

    setSaving(true);
    try {
      if (drawer.mode === "create") {
        const r = await post<{ data: { name: string; signing_secret: string } }>("/api/v1/webhook-subscriptions", {
          name: form.name.trim(), target_url: form.target_url.trim(), events: form.events,
        });
        // The one moment the secret exists on this screen.
        setFreshSecret({ name: r.data.name, secret: r.data.signing_secret });
      } else {
        await patch(`/api/v1/webhook-subscriptions/${drawer.row.id}`, {
          name: form.name.trim(), target_url: form.target_url.trim(), events: form.events,
        });
      }
      setDrawer(null);
      await load();
    } catch (err) {
      setFormError((err as Error)?.message || "That did not save.");
    } finally { setSaving(false); }
  }

  async function setActive(row: Subscription, is_active: boolean) {
    try {
      await patch(`/api/v1/webhook-subscriptions/${row.id}`, { is_active });
      await load();
    } catch (err) { setError(err); }
  }

  async function remove(row: Subscription) {
    try {
      await del(`/api/v1/webhook-subscriptions/${row.id}`);
      setNotice(`${row.name} is switched off. Nothing else will be sent to it.`);
      await load();
    } catch (err) { setError(err); }
  }

  async function sendTest(row: Subscription) {
    setNotice(null);
    try {
      await post(`/api/v1/webhook-subscriptions/${row.id}/test`, {});
      setNotice(`Test sent to ${row.name}. Open its log below to see what came back.`);
      // The delivery row lands a moment later; re-read both.
      await load();
      if (openLog === row.id) await loadDeliveries(row.id);
    } catch (err) {
      setNotice(null);
      setError(err);
    }
  }

  const loadDeliveries = useCallback(async (id: number) => {
    try {
      const r = await get<{ data: Delivery[] }>(`/api/v1/webhook-subscriptions/${id}/deliveries?limit=25`);
      setDeliveries((d) => ({ ...d, [id]: r.data || [] }));
    } catch (err) { setError(err); }
  }, [get]);

  async function toggleLog(row: Subscription) {
    if (openLog === row.id) { setOpenLog(null); return; }
    setOpenLog(row.id);
    if (!deliveries[row.id]) await loadDeliveries(row.id);
  }

  return (
    <SparkPageShell
      title="Webhooks"
      subtitle="Tell another system when something happens here"
      help="A webhook is a message we POST to a web address you own, the moment something happens — a contact is created, a campaign is opened, a lead arrives. Every payload is signed so the receiving system can prove it came from us."
      loading={loading && !rows.length}
      error={error}
      actions={
        <button type="button" onClick={openCreate} className="spark-btn spark-btn-primary">
          <Plus className="h-4 w-4" /> New webhook
        </button>
      }
      stats={
        rows.length ? (
          <div className="flex items-center gap-3 text-xs text-slate-600">
            <span><strong className="text-slate-900">{active.length}</strong> on</span>
            {failing.length > 0 && (
              <span className="text-red-700">
                <strong>{failing.length}</strong> failing — check the log
              </span>
            )}
            <Link to="/app/services/spark_webhook_deliveries" className="text-[#EF6C33] hover:underline">
              Every delivery, across all of them →
            </Link>
          </div>
        ) : undefined
      }
    >
      {notice && (
        <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{notice}</div>
      )}

      {/* THE SECRET. Once. */}
      {freshSecret && (
        <div className="mb-4 rounded-lg border-2 border-amber-400 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-700" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-amber-900">Copy this now — you cannot see it again</div>
              <p className="mt-1 text-xs text-amber-800">
                This is the signing secret for <strong>{freshSecret.name}</strong>. The system
                receiving your webhooks uses it to check the <code>X-IADM-Signature</code>
                {" "}header. We keep only a form of it we can verify against, so nobody —
                including us — can show it to you later. Lost it? Make a new webhook.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded border border-amber-300 bg-white px-2 py-1 font-mono text-xs text-slate-800">
                  {freshSecret.secret}
                </code>
                <CopyOnce text={freshSecret.secret} />
                <button type="button" onClick={() => setFreshSecret(null)} className="rounded border border-amber-300 bg-white px-2 py-1 text-xs font-semibold text-amber-900">
                  I have it
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {!loading && !rows.length ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <Webhook className="mx-auto mb-2 h-8 w-8 text-slate-300" />
          <div className="text-sm font-semibold text-slate-800">No webhooks yet</div>
          <p className="mx-auto mt-1 max-w-lg text-xs text-slate-600">
            Add one if you have another system that should hear about things as they
            happen — an accounts package, a spreadsheet script, a Zap. You give us a
            web address, pick what to be told about, and we sign every message we send
            it.
          </p>
          <button type="button" onClick={openCreate} className="mt-3 rounded-lg bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#D85F2A]">
            New webhook
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const events = parseEvents(row.events);
            const logOpen = openLog === row.id;
            return (
              <li key={row.id} className={`rounded-lg border bg-white ${row.is_active ? "border-slate-200" : "border-slate-200 opacity-60"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">{row.name}</span>
                      {!row.is_active && (
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700">Off</span>
                      )}
                      <StatusPill code={row.last_status} />
                      {row.consecutive_failures > 0 && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                          {row.consecutive_failures} in a row failed
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate font-mono text-xs text-slate-600">{row.target_url}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {events.map((ev) => (
                        <span key={ev} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700">{ev}</span>
                      ))}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">Last sent {when(row.last_fire_at)}</div>
                  </div>
                  <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5">
                    <button type="button" onClick={() => sendTest(row)} className="rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">
                      <Send className="mr-1 inline h-3 w-3" /> Send test
                    </button>
                    <button type="button" onClick={() => openEdit(row)} className="rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">
                      Edit
                    </button>
                    <button type="button" onClick={() => setActive(row, !row.is_active)} className="rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">
                      {row.is_active ? "Turn off" : "Turn on"}
                    </button>
                    <button type="button" onClick={() => remove(row)} title="Switch it off for good" className="rounded border border-red-200 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                <button type="button" onClick={() => toggleLog(row)} className="flex w-full items-center gap-1 border-t border-slate-100 px-3 py-2 text-left text-[11px] font-semibold text-slate-600 hover:bg-slate-50">
                  <ChevronRight className={`h-3 w-3 transition-transform ${logOpen ? "rotate-90" : ""}`} />
                  What we sent it
                </button>
                {logOpen && (
                  <div className="overflow-x-auto border-t border-slate-100">
                    {(deliveries[row.id] || []).length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-500">Nothing sent yet. Press Send test above.</div>
                    ) : (
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold">When</th>
                            <th className="px-3 py-2 text-left font-semibold">What happened</th>
                            <th className="px-3 py-2 text-left font-semibold">Answer</th>
                            <th className="px-3 py-2 text-left font-semibold">Tries</th>
                            <th className="px-3 py-2 text-left font-semibold">Problem</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(deliveries[row.id] || []).map((d) => (
                            <tr key={d.id} className="border-t border-slate-100">
                              <td className="whitespace-nowrap px-3 py-1.5 text-slate-600">{when(d.occurred_at)}</td>
                              <td className="px-3 py-1.5 font-mono text-slate-700">{d.event_type}</td>
                              <td className="px-3 py-1.5"><StatusPill code={d.status_code} /></td>
                              <td className="px-3 py-1.5 tabular-nums text-slate-600">{d.attempt_count}</td>
                              <td className="max-w-[280px] truncate px-3 py-1.5 text-red-700" title={d.error_message || undefined}>
                                {d.error_message || ""}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Create / edit drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setDrawer(null)}>
          <div className="h-full w-full max-w-md overflow-y-auto bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-bold text-slate-900">
                {drawer.mode === "create" ? "New webhook" : `Edit ${drawer.row.name}`}
              </h2>
              <button type="button" onClick={() => setDrawer(null)} className="text-slate-400 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-4">
              <label className="block">
                <span className="block text-xs font-semibold text-slate-700">Name</span>
                <span className="block text-[11px] text-slate-500">For you, so you can tell it apart later.</span>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Accounts package"
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-[#EF6C33] focus:outline-none" />
              </label>

              <label className="block">
                <span className="block text-xs font-semibold text-slate-700">Where should we send it?</span>
                <span className="block text-[11px] text-slate-500">The full web address, starting https://</span>
                <input value={form.target_url} onChange={(e) => setForm({ ...form, target_url: e.target.value })}
                  placeholder="https://example.com/hooks/iadm"
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-xs focus:border-[#EF6C33] focus:outline-none" />
              </label>

              <div>
                <span className="block text-xs font-semibold text-slate-700">What should we tell it about?</span>
                <span className="block text-[11px] text-slate-500">
                  {form.events.length} of {knownEvents.length} picked. Pick only what the other
                  system actually uses — every extra one is a message it has to ignore.
                </span>
                <div className="mt-1.5 max-h-64 space-y-0.5 overflow-y-auto rounded border border-slate-200 p-2">
                  {knownEvents.map((ev) => (
                    <label key={ev} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-slate-50">
                      <input type="checkbox" checked={form.events.includes(ev)} onChange={() => toggleEvent(ev)}
                        className="rounded border-slate-300" />
                      <span className="font-mono text-slate-700">{ev}</span>
                    </label>
                  ))}
                </div>
              </div>

              {drawer.mode === "create" && (
                <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                  When you save, we show you a signing secret <strong>once</strong>. Copy it
                  then — it cannot be shown again.
                </p>
              )}

              {formError && (
                <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{formError}</div>
              )}
            </div>

            <div className="sticky bottom-0 flex items-center gap-2 border-t border-slate-200 bg-white px-4 py-3">
              <button type="button" onClick={save} disabled={saving}
                className="rounded-lg bg-[#EF6C33] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#D85F2A] disabled:opacity-50">
                {saving ? "Saving…" : drawer.mode === "create" ? "Create webhook" : "Save changes"}
              </button>
              <button type="button" onClick={() => setDrawer(null)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </SparkPageShell>
  );
}

function CopyOnce({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard?.writeText(text).then(
        () => { setDone(true); setTimeout(() => setDone(false), 2000); },
        () => { /* nothing to promise */ },
      )}
      className="flex-shrink-0 rounded border border-amber-300 bg-white px-2 py-1 text-xs font-semibold text-amber-900"
    >
      {done ? <Check className="inline h-3 w-3 text-emerald-600" /> : <CopyIcon className="inline h-3 w-3" />}
      <span className="ml-1">{done ? "Copied" : "Copy"}</span>
    </button>
  );
}

export default SparkWebhooksPage;
