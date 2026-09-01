// SenderDomainPage — F-79 per-tenant custom email sender domain.
//
// Settings-level surface (hamburger ☰ → "Email Sender Domain"). This page is
// intentionally lean: list the tenant's registered domains, add a new one,
// see the DNS records they need to publish, and click Verify to re-run the
// DKIM/SPF/DMARC checks.
//
// The full SPARK-branded wizard (2-card IA default vs white-label picker,
// ARION auto-DNS publish, mail-my-web-admin) lives at
// /app/services/spark/sender-domains — that's the "getting started"
// experience. This settings page is for admins who already know what a
// sender domain is and just want to manage the list.
//
// Endpoints (LUMEN-API):
//   GET  /api/v1/sender-domains              → list
//   POST /api/v1/sender-domains              → register {domain, display_name?, reply_to?}
//   GET  /api/v1/sender-domains/:id/records  → DNS records to publish
//   POST /api/v1/sender-domains/:id/verify   → run DNS check
//   POST /api/v1/sender-domains/:id/default  → mark as default From
//   DELETE /api/v1/sender-domains/:id        → deactivate
//
// If a tenant has NO verified domain, sends fall back to the platform default
// noreply@ia-dm.com — surfaced in the top banner so admins understand what's
// happening today vs. what's about to happen after they verify.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, Copy, Check, X, RefreshCw, Plus, Star, Trash2, Mail } from "lucide-react";
import { useLumenApi } from "../../hooks/useLumenApi";

type Status = "pending" | "verified" | "failed";

interface Domain {
  id: number;
  domain: string;
  display_name: string | null;
  reply_to: string | null;
  status: Status;
  last_verified_at: string | null;
  dkim_verified_at: string | null;
  dkim_selector: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
}

interface DnsRecord { type: string; host: string; value: string; note?: string }
interface RecordsResp { domain: string; records: { spf: DnsRecord; dkim_1: DnsRecord; dkim_2: DnsRecord; dmarc: DnsRecord } }

interface VerifyResp {
  data: {
    id: number;
    domain: string;
    status: Status;
    dkim_verified: boolean;
    checks: Record<string, { found: boolean; ok?: boolean; value: unknown; includes_acs?: boolean; selector?: string }>;
  };
}

function StatusPill({ s }: { s: Status }) {
  if (s === "verified") {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700">
        <Check className="h-3 w-3" /> Verified
      </span>
    );
  }
  if (s === "failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] text-rose-700">
        <X className="h-3 w-3" /> Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">
      <RefreshCw className="h-3 w-3" /> Pending
    </span>
  );
}

export function SenderDomainPage() {
  const { get, post, del, ready } = useLumenApi();

  const [list, setList] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [records, setRecords] = useState<RecordsResp | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResp["data"] | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newReplyTo, setNewReplyTo] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      // 2026-09-01 — useLumenApi ALREADY strips the { data: ... } envelope
      // (lib/lumenApi.ts:145, same as oliverApi). Declaring the envelope here
      // and then reading `r.data` produced undefined every time, so this list
      // was permanently empty and the Email Sender Domain settings page showed
      // no domains for anyone. Note the records fetch a few lines below always
      // did it correctly — the two calls disagreed in the same file.
      const r = await get<Domain[]>("/api/v1/sender-domains");
      setList(Array.isArray(r) ? r : []);
    } catch (err) {
      setError((err as Error).message || "Failed to load sender domains.");
    } finally {
      setLoading(false);
    }
  }, [get, ready]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Load records for the selected row.
  useEffect(() => {
    if (!selectedId) { setRecords(null); setVerifyResult(null); return; }
    (async () => {
      try {
        const r = await get<RecordsResp>(`/api/v1/sender-domains/${selectedId}/records`);
        setRecords(r);
      } catch (err) {
        console.error("records fetch failed", err);
        setRecords(null);
      }
    })();
  }, [selectedId, get]);

  const selected = useMemo(() => list.find((d) => d.id === selectedId) || null, [list, selectedId]);
  const verifiedCount = list.filter((d) => d.status === "verified").length;
  const defaultRow = list.find((d) => d.is_default && d.status === "verified");

  function domainLooksValid(s: string) {
    // Accept bare domain or an email — matches backend extractDomain().
    return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s.trim())
      || /^[^\s@]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(s.trim());
  }

  async function submitAdd() {
    const trimmed = newDomain.trim();
    if (!domainLooksValid(trimmed)) {
      setCreateError("Enter a domain (example.com) or a full sender email (welcome@example.com).");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const r = await post<Domain>("/api/v1/sender-domains", {
        domain: trimmed,
        display_name: newDisplayName.trim() || null,
        reply_to: newReplyTo.trim() || null,
      });
      const created = r;
      await fetchAll();
      if (created?.id) setSelectedId(created.id);
      setAddOpen(false);
      setNewDomain("");
      setNewDisplayName("");
      setNewReplyTo("");
    } catch (err) {
      setCreateError((err as Error).message || "Failed to register domain.");
    } finally {
      setCreating(false);
    }
  }

  async function verifyNow(id: number) {
    setVerifying(true);
    try {
      const r = await post<VerifyResp>(`/api/v1/sender-domains/${id}/verify`, {});
      setVerifyResult(r?.data || null);
      await fetchAll();
    } catch (err) {
      alert(`Verify failed: ${(err as Error).message}`);
    } finally {
      setVerifying(false);
    }
  }

  async function setDefault(id: number) {
    try {
      await post(`/api/v1/sender-domains/${id}/default`, {});
      await fetchAll();
    } catch (err) {
      alert(`Failed: ${(err as Error).message}`);
    }
  }

  async function deactivate(id: number) {
    if (!confirm("Deactivate this sender domain? Future emails will fall back to the platform default noreply@ia-dm.com.")) return;
    try {
      await del(`/api/v1/sender-domains/${id}`);
      if (selectedId === id) setSelectedId(null);
      await fetchAll();
    } catch (err) {
      alert(`Failed: ${(err as Error).message}`);
    }
  }

  async function copyText(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (e) {
      alert(`Copy failed: ${(e as Error).message}`);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <Link
          to="/app/settings"
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          All settings
        </Link>
      </div>

      <section className="rounded-lg border bg-white p-5">
        <h1 className="text-2xl font-semibold">Email Sender Domain</h1>
        <p className="mt-1 text-sm text-gray-500">
          Send campaigns and transactional emails from your own domain so recipients see your brand
          in the From line. Publish 4 DNS records (SPF, DKIM ×2, DMARC), click Verify, and mark the
          domain as your default. Until then, emails go out from the platform default{" "}
          <code className="rounded bg-gray-100 px-1 text-[12px]">noreply@ia-dm.com</code>.
        </p>
      </section>

      {/* Current default banner */}
      <section className="rounded-lg border bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm">
            {defaultRow ? (
              <>
                <span className="text-gray-500">Sending from</span>{" "}
                <strong className="text-gray-900">{defaultRow.domain}</strong>
                {defaultRow.display_name && (
                  <span className="text-gray-500"> · {defaultRow.display_name}</span>
                )}
              </>
            ) : (
              <>
                <span className="text-gray-500">Sending from platform default</span>{" "}
                <code className="rounded bg-gray-100 px-1">noreply@ia-dm.com</code>
                <span className="ml-2 text-xs text-amber-700">
                  Add + verify your own domain below to send branded.
                </span>
              </>
            )}
          </div>
          <button
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1 rounded bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700"
          >
            <Plus className="h-4 w-4" /> Add domain
          </button>
        </div>
      </section>

      {loading && <div className="text-sm text-gray-500">Loading domains…</div>}
      {error && (
        <div className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
      )}

      {!loading && !error && (
        <section className="grid gap-4 lg:grid-cols-3">
          {/* Left: list */}
          <div className="rounded-lg border bg-white lg:col-span-1">
            <div className="border-b bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {list.length} {list.length === 1 ? "domain" : "domains"} · {verifiedCount} verified
            </div>
            {list.length === 0 && (
              <div className="p-6 text-center text-sm text-gray-500">
                No domains yet. Click <strong>Add domain</strong> to register one.
              </div>
            )}
            {list.map((d) => (
              <button
                key={d.id}
                onClick={() => setSelectedId(d.id)}
                className={`w-full border-b border-gray-100 p-3 text-left last:border-b-0 hover:bg-gray-50 ${
                  selectedId === d.id ? "bg-gray-50" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1 truncate text-sm font-semibold text-gray-900">
                      {d.domain}
                      {d.is_default && <Star className="h-3 w-3 text-amber-500" aria-label="default" />}
                    </div>
                    <div className="truncate text-[11px] text-gray-500">
                      {d.display_name || "(no display name)"}
                    </div>
                  </div>
                  <StatusPill s={d.status} />
                </div>
              </button>
            ))}
          </div>

          {/* Right: detail */}
          <div className="lg:col-span-2">
            {!selectedId && (
              <div className="rounded-lg border bg-white p-10 text-center text-sm text-gray-500">
                Select a domain to see its DNS records and verification status.
              </div>
            )}
            {selectedId && selected && (
              <div className="space-y-3">
                {/* Toolbar */}
                <div className="flex items-center justify-between rounded-lg border bg-gray-50 p-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{selected.domain}</div>
                    <div className="text-[11px] text-gray-500">
                      {selected.display_name || "(no display name)"}
                      {selected.last_verified_at &&
                        ` · Last checked ${new Date(selected.last_verified_at).toLocaleString()}`}
                      {selected.dkim_verified_at &&
                        ` · DKIM last good ${new Date(selected.dkim_verified_at).toLocaleDateString()}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      disabled={verifying}
                      onClick={() => verifyNow(selectedId)}
                      className="inline-flex items-center gap-1 rounded bg-gray-900 px-3 py-1 text-xs text-white hover:bg-gray-700 disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3 w-3 ${verifying ? "animate-spin" : ""}`} />
                      {verifying ? "Checking…" : "Verify"}
                    </button>
                    {selected.status === "verified" && !selected.is_default && (
                      <button
                        onClick={() => setDefault(selectedId)}
                        className="inline-flex items-center gap-1 rounded border border-amber-400 px-3 py-1 text-xs text-amber-700 hover:bg-amber-50"
                      >
                        <Star className="h-3 w-3" /> Set default
                      </button>
                    )}
                    <button
                      onClick={() => deactivate(selectedId)}
                      className="inline-flex items-center gap-1 rounded px-3 py-1 text-xs text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3 w-3" /> Deactivate
                    </button>
                  </div>
                </div>

                {/* Result banner */}
                {verifyResult && (
                  <div
                    className={`rounded p-3 text-sm ${
                      verifyResult.status === "verified"
                        ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border border-amber-200 bg-amber-50 text-amber-800"
                    }`}
                  >
                    {verifyResult.status === "verified" ? (
                      <>All records verified. You can now set this domain as your default.</>
                    ) : (
                      <>
                        Some records aren't published yet. DNS changes can take up to 24h to
                        propagate — try Verify again in a bit.
                      </>
                    )}
                  </div>
                )}

                {/* DNS records */}
                {records && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Publish these DNS records at your registrar
                      </div>
                      <a
                        href={`mailto:?subject=${encodeURIComponent(
                          `DNS records for ${records.domain}`
                        )}&body=${encodeURIComponent(
                          [
                            `Please publish these 4 DNS records on the ${records.domain} zone:`,
                            "",
                            ...(["spf", "dkim_1", "dkim_2", "dmarc"] as const).flatMap((k) => {
                              const r = records.records[k];
                              return [
                                `--- ${k.toUpperCase()} (${r.type}) ---`,
                                `Host : ${r.host}`,
                                `Value: ${r.value}`,
                                r.note ? `Note : ${r.note}` : "",
                                "",
                              ];
                            }),
                          ].join("\n")
                        )}`}
                        className="inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs hover:bg-white"
                      >
                        <Mail className="h-3 w-3" /> Email to web admin
                      </a>
                    </div>
                    {(["spf", "dkim_1", "dkim_2", "dmarc"] as const).map((key) => {
                      const rec = records.records[key];
                      const v = verifyResult?.checks?.[key];
                      const ok =
                        v?.found &&
                        v.ok !== false &&
                        (key !== "spf" || v.includes_acs !== false);
                      return (
                        <div
                          key={key}
                          className={`rounded border p-3 ${
                            verifyResult
                              ? ok
                                ? "border-emerald-200 bg-emerald-50/40"
                                : "border-rose-200 bg-rose-50/40"
                              : "border-gray-200 bg-white"
                          }`}
                        >
                          <div className="mb-1 flex items-center justify-between">
                            <div className="text-xs font-semibold uppercase text-gray-700">
                              {key.replace("_", " ")}
                              <span className="ml-2 font-mono text-[10px] text-gray-500">
                                ({rec.type})
                              </span>
                            </div>
                            {verifyResult &&
                              (ok ? (
                                <Check className="h-4 w-4 text-emerald-600" />
                              ) : (
                                <X className="h-4 w-4 text-rose-600" />
                              ))}
                          </div>
                          <RecordField
                            label="Host"
                            value={rec.host}
                            copyKey={`${key}-host`}
                            copiedKey={copiedKey}
                            onCopy={copyText}
                          />
                          <RecordField
                            label="Value"
                            value={rec.value}
                            copyKey={`${key}-value`}
                            copiedKey={copiedKey}
                            onCopy={copyText}
                            wide
                          />
                          {rec.note && (
                            <div className="mt-1 text-[10px] italic text-gray-500">{rec.note}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Add modal (inline lightweight — settings page shouldn't pull IadmModal) */}
      {addOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !creating && setAddOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3">
              <h2 className="text-lg font-semibold">Add sender domain</h2>
              <p className="mt-1 text-xs text-gray-500">
                Enter your business domain (or a sender email — we'll extract the domain).
              </p>
            </div>
            <div className="space-y-3">
              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  Domain or sender email
                </span>
                <input
                  autoFocus
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  placeholder="example.com  or  welcome@example.com"
                  className="mt-1 w-full rounded border border-gray-300 p-2 text-sm focus:border-gray-500 focus:ring-1 focus:ring-gray-500"
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  Display name (optional)
                </span>
                <input
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  placeholder="Acme Co."
                  className="mt-1 w-full rounded border border-gray-300 p-2 text-sm focus:border-gray-500 focus:ring-1 focus:ring-gray-500"
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  Reply-to (optional)
                </span>
                <input
                  value={newReplyTo}
                  onChange={(e) => setNewReplyTo(e.target.value)}
                  placeholder="support@example.com"
                  className="mt-1 w-full rounded border border-gray-300 p-2 text-sm focus:border-gray-500 focus:ring-1 focus:ring-gray-500"
                />
              </label>
              {createError && (
                <div className="rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
                  {createError}
                </div>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                disabled={creating}
                onClick={() => setAddOpen(false)}
                className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                disabled={creating || !domainLooksValid(newDomain.trim())}
                onClick={submitAdd}
                className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
              >
                {creating ? "Registering…" : "Register"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RecordField({
  label,
  value,
  copyKey,
  copiedKey,
  onCopy,
  wide,
}: {
  label: string;
  value: string;
  copyKey: string;
  copiedKey: string | null;
  onCopy: (v: string, k: string) => void;
  wide?: boolean;
}) {
  return (
    <div className={`mt-1 ${wide ? "" : ""}`}>
      <div className="text-[10px] font-semibold uppercase text-gray-500">{label}</div>
      <div className="mt-0.5 flex gap-1">
        <code className="flex-1 truncate rounded bg-gray-100 px-2 py-1 text-[11px] font-mono">
          {value}
        </code>
        <button
          onClick={() => onCopy(value, copyKey)}
          className="rounded border border-gray-200 px-1.5 py-1 hover:bg-gray-50"
          aria-label={`Copy ${label}`}
        >
          {copiedKey === copyKey ? (
            <Check className="h-3 w-3 text-emerald-600" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </button>
      </div>
    </div>
  );
}

export default SenderDomainPage;
