// SparkSenderDomainsPage — 2-card sender-mode picker + email-first wizard.
//
// Locked redesign 2026-06-24 (feedback_spark_sender_ux_fix): the user
// never sees the word "domain" as the primary label. Two paths:
//
//   1) IA default — send from welcome@send.intelligentanalyticsdm.com.
//      No DNS work. We persist sender_mode='ia_default' on the tenant
//      settings row and we're done.
//
//   2) White-label — collect ONE field ("Sender email address" like
//      welcome@yourbusiness.com) + optional display name. Backend
//      extracts the domain from the email (POST /sender-domains/from-email).
//      Then branch on whether the tenant's website is ARION-hosted:
//        * Hosting auto-managed → "We'll add the DNS records for you
//          automatically — give us 2-5 minutes" and poll verify.
//        * Not auto-managed     → render the 4 DNS record cards with
//          Copy All + "Email these to my web admin" + "I've added them
//          — Verify now" buttons.
//
// The list + detail UI for already-registered senders is preserved
// below the wizard so admins can manage multiple domains.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { useAppState } from "../../app/AppState";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { IadmModal, IadmButton } from "../../components/IadmModal";
import {
  Globe, Check, X, Plus, Copy, RefreshCw, Star, Trash2, Mail, Sparkles, Wand2, Send,
} from "lucide-react";

type Status = "pending" | "verified" | "failed";

interface Domain {
  id: number;
  domain: string;
  display_name: string | null;
  reply_to: string | null;
  status: Status;
  last_verified_at: string | null;
  last_verify_result: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
}

interface DnsRecord { type: string; host: string; value: string; note?: string; }
// domain_ownership is the TXT that PROVES you own the domain. The API has
// always returned it; this page listed only spf/dkim/dmarc, so the one record
// ACS's Domain check reads was invisible — and no domain could ever verify.
interface RecordsResp { domain: string; records: { domain_ownership: DnsRecord; spf: DnsRecord; dkim_1: DnsRecord; dkim_2: DnsRecord; dmarc: DnsRecord }; }
interface VerifyResp {
  data: { id: number; domain: string; status: Status; checks: Record<string, { found: boolean; ok?: boolean; value: unknown; includes_acs?: boolean }> };
}

interface SparkSettingsResp {
  data?: {
    sender_mode?: "ia_default" | "white_label" | null;
    hostinger_managed?: boolean;
  };
}

type WizardStep = "pick" | "collect" | "dns" | "done";

function statusPill(s: Status) {
  if (s === "verified") return <span className="px-2 py-0.5 rounded text-[10px] border bg-emerald-50 text-emerald-700 border-emerald-200 inline-flex items-center gap-1"><Check className="h-3 w-3" /> Verified</span>;
  if (s === "failed")   return <span className="px-2 py-0.5 rounded text-[10px] border bg-rose-50 text-rose-700 border-rose-200 inline-flex items-center gap-1"><X className="h-3 w-3" /> Failed</span>;
  return <span className="px-2 py-0.5 rounded text-[10px] border bg-amber-50 text-amber-700 border-amber-200 inline-flex items-center gap-1"><RefreshCw className="h-3 w-3" /> Pending</span>;
}

export function SparkSenderDomainsPage() {
  const { get, post, del, ready } = useSparkApi();
  const [list, setList] = useState<Domain[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [records, setRecords] = useState<RecordsResp | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResp["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoNote, setAutoNote] = useState<string | null>(null);
  const [autoLog, setAutoLog] = useState<Array<{ record: string; action: string; before?: string; after?: string }> | null>(null);

  // Wizard state — replaces the old "+ Add domain" modal.
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>("pick");
  const [senderEmail, setSenderEmail] = useState("");
  const [senderDisplayName, setSenderDisplayName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdDomain, setCreatedDomain] = useState<Domain | null>(null);
  const [createdRecords, setCreatedRecords] = useState<RecordsResp | null>(null);
  const [autoDnsState, setAutoDnsState] = useState<"idle" | "running" | "verified" | "failed">("idle");

  // Tenant-level prefs. sender_mode persists which option the tenant picked,
  // hostinger_managed signals that we control DNS for this tenant's
  // primary website (ARION hosting on Hostinger via API).
  const [senderMode, setSenderMode] = useState<"ia_default" | "white_label" | null>(null);
  const [hostingerManaged, setHostingerManaged] = useState<boolean>(false);
  // Real product ownership, not the stored hostinger_managed flag — that flag is
  // tenant-level and set at onboarding, so it goes stale. Whether we can write
  // the DNS is decided per-domain and live by the API; this is only used to
  // decide which message to show when we can't.
  const { ownedProducts } = useAppState();
  const hasArion = ownedProducts?.has?.("arion") ?? false;
  const [savingMode, setSavingMode] = useState(false);
  // Surfaced when persisting sender_mode fails. Previously a silent
  // .catch(()=>null) swallowed the 404 so a missing/broken /spark-settings
  // endpoint left the picker looking saved when it wasn't (#116). We now show
  // a small inline message so a future regression is visible.
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const [d, s] = await Promise.all([
        get<{ data: Domain[] }>("/api/v1/sender-domains"),
        // Best-effort on read: if /spark-settings is unreachable we fall back
        // to the IA default rather than crashing the whole page. `null` here
        // means "read failed"; we distinguish that below from a genuine empty.
        get<SparkSettingsResp>("/api/v1/spark-settings").catch(() => null),
      ]);
      setList(d?.data || []);
      // On a failed read, default to 'ia_default' (safe, no-DNS mode) instead
      // of leaving the mode null / banner blank.
      setSenderMode(s?.data?.sender_mode ?? "ia_default");
      setHostingerManaged(!!s?.data?.hostinger_managed);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const selected = useMemo(() => list.find(d => d.id === selectedId) || null, [list, selectedId]);

  useEffect(() => {
    if (!selectedId) { setRecords(null); setVerifyResult(null); return; }
    (async () => {
      try {
        const r = await get<RecordsResp>(`/api/v1/sender-domains/${selectedId}/records`);
        setRecords(r);
      } catch (err) { console.error(err); }
    })();
  }, [selectedId, get]);

  // ─ Wizard helpers ────────────────────────────────────────────────────────

  function openWizard() {
    setWizardStep("pick");
    setSenderEmail("");
    setSenderDisplayName("");
    setCreatedDomain(null);
    setCreatedRecords(null);
    setAutoDnsState("idle");
    setWizardOpen(true);
  }

  async function pickIaDefault() {
    setSavingMode(true);
    setSettingsError(null);
    try {
      // Persist the choice. If the endpoint fails we still advance the wizard
      // (the tenant's intent is honored client-side) but surface an inline
      // error so a persistence regression is visible instead of silent (#116).
      await post("/api/v1/spark-settings", { sender_mode: "ia_default" });
      setSenderMode("ia_default");
      setWizardStep("done");
    } catch (err) {
      setSenderMode("ia_default");
      setSettingsError(`Your choice may not have been saved: ${(err as Error).message}`);
      setWizardStep("done");
    } finally { setSavingMode(false); }
  }

  async function pickWhiteLabel() {
    setSavingMode(true);
    setSettingsError(null);
    try {
      await post("/api/v1/spark-settings", { sender_mode: "white_label" });
      setSenderMode("white_label");
      setWizardStep("collect");
    } catch (err) {
      setSenderMode("white_label");
      setSettingsError(`Your choice may not have been saved: ${(err as Error).message}`);
      setWizardStep("collect");
    } finally { setSavingMode(false); }
  }

  function emailLooksValid(s: string) {
    return /^[^\s@]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(s.trim());
  }

  async function submitWhiteLabel() {
    if (!emailLooksValid(senderEmail)) return;
    setCreating(true);
    try {
      // Backend extracts the domain server-side. Endpoint: POST
      // /api/v1/sender-domains/from-email — keeps the user-facing flow
      // about the sender address, never about "domains".
      const r = await post<{ data: Domain }>("/api/v1/sender-domains/from-email", {
        email: senderEmail.trim(),
        display_name: senderDisplayName.trim() || null,
      });
      const created = r?.data;
      if (!created) throw new Error("Server returned no sender domain");
      setCreatedDomain(created);
      // Pull DNS records so the wizard can render them (manual path) or
      // hand them off to the auto-publish endpoint (managed path).
      const rec = await get<RecordsResp>(`/api/v1/sender-domains/${created.id}/records`);
      setCreatedRecords(rec);
      await fetchAll();
      setWizardStep("dns");

      // If this tenant is ARION-hosted, kick off auto-publish + poll.
      if (hostingerManaged) {
        runAutoDnsPublish(created.id);
      }
    } catch (err) {
      alert(`Couldn't register that sender: ${(err as Error).message}`);
    } finally { setCreating(false); }
  }

  async function runAutoDnsPublish(senderDomainId: number) {
    setAutoDnsState("running");
    try {
      // Best-effort — endpoint may not be wired yet on every tenant.
      await post(`/api/v1/sender-domains/${senderDomainId}/auto-publish`, {}).catch(() => null);
      // Poll verify every ~10s for up to 5 minutes.
      const deadline = Date.now() + 5 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise((res) => setTimeout(res, 10000));
        try {
          const v = await post<VerifyResp>(`/api/v1/sender-domains/${senderDomainId}/verify`, {});
          if (v?.data?.status === "verified") {
            setAutoDnsState("verified");
            await fetchAll();
            return;
          }
        } catch { /* keep polling */ }
      }
      setAutoDnsState("failed");
    } catch {
      setAutoDnsState("failed");
    }
  }

  // Automatic path: register with the email provider, write the DNS ourselves,
  // then verify. Only offered for zones we actually host — the API decides that
  // with a live lookup and answers 409 + mode:"manual" when the domain is not
  // on our account, so the button cannot be used to touch someone else's DNS.
  async function autoConfigure(id: number) {
    setAutoRunning(true); setAutoLog(null);
    try {
      const r = await post<{ data?: { changed: boolean; written: number; sendable: boolean; note?: string; log?: Array<{ record: string; action: string; before?: string; after?: string }> } }>(
        `/api/v1/sender-domains/${id}/auto-configure`, {}
      );
      const d = r?.data;
      setAutoLog(d?.log || []);
      // Say what actually happened. "Configured" over a no-op is how a feature
      // ends up looking done when it never ran.
      setAutoNote(
        d?.sendable ? "Verified — this domain can send now."
        : d?.changed ? `${d.written} DNS record(s) written. ${d.note || "Verification can take a few minutes to propagate."}`
        : "No DNS changes were needed."
      );
      await fetchAll();
    } catch (err) {
      const msg = (err as Error).message || "";
      setAutoNote(
        /409|manual/i.test(msg)
          ? "We don't host DNS for this domain, so it has to be added manually — the records are listed below."
          : `Could not configure automatically: ${msg}`
      );
    } finally { setAutoRunning(false); }
  }

  async function verifyNow(id: number) {
    setVerifying(true);
    try {
      const r = await post<VerifyResp>(`/api/v1/sender-domains/${id}/verify`, {});
      setVerifyResult(r?.data || null);
      await fetchAll();
    } catch (err) { alert(`Verify failed: ${(err as Error).message}`); }
    finally { setVerifying(false); }
  }

  // ─ List actions ──────────────────────────────────────────────────────────

  async function setDefault(id: number) {
    try {
      await post(`/api/v1/sender-domains/${id}/default`, {});
      await fetchAll();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function deactivate(id: number) {
    if (!confirm("Deactivate this sender? Future emails will fall back to the platform default.")) return;
    try {
      await del(`/api/v1/sender-domains/${id}`);
      if (selectedId === id) setSelectedId(null);
      await fetchAll();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function copyText(text: string, key: string) {
    try { await navigator.clipboard.writeText(text); setCopiedKey(key); setTimeout(() => setCopiedKey(null), 2000); }
    catch (e) { alert(`Copy failed: ${(e as Error).message}`); }
  }

  async function copyAllDns(records: RecordsResp | null) {
    if (!records) return;
    const lines: string[] = [];
    (["domain_ownership", "spf", "dkim_1", "dkim_2", "dmarc"] as const).forEach((k) => {
      const r = records.records[k];
      if (!r) return;   // ACS-unavailable fallback omits domain_ownership
      lines.push(`${k.toUpperCase()}  (${r.type})`);
      lines.push(`  Host : ${r.host}`);
      lines.push(`  Value: ${r.value}`);
      if (r.note) lines.push(`  Note : ${r.note}`);
      lines.push("");
    });
    await copyText(lines.join("\n"), "all-dns");
  }

  function mailToWebAdmin(records: RecordsResp | null, senderDomain: Domain | null) {
    if (!records || !senderDomain) return;
    const subject = encodeURIComponent(`DNS records to publish for ${senderDomain.domain}`);
    const body = encodeURIComponent(
      [
        "Hi,",
        "",
        `Please publish these DNS records on the ${senderDomain.domain} zone so we can send branded email.`,
        "Once they're live, reply to this email and I'll click Verify.",
        "",
        ...(["domain_ownership", "spf", "dkim_1", "dkim_2", "dmarc"] as const).flatMap((k) => {
          const r = records.records[k];
          if (!r) return [];
          return [
            `--- ${k.toUpperCase()} (${r.type}) ---`,
            `Host : ${r.host}`,
            `Value: ${r.value}`,
            r.note ? `Note : ${r.note}` : "",
            "",
          ];
        }),
        "Thanks!",
      ].join("\n")
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  // ─ Render ────────────────────────────────────────────────────────────────

  const verifiedCount = list.filter((d) => d.status === "verified").length;
  const subtitle =
    senderMode === "ia_default"
      ? "Using the Intelligent Analytics default sender"
      : `${list.length} sender${list.length === 1 ? "" : "s"} · ${verifiedCount} verified`;

  return (
    <SparkPageShell
      title="Sender setup"
      subtitle={subtitle}
      help="Pick where your campaigns send from: the Intelligent Analytics default, or your own business email (white-label). White-label needs 4 DNS records published on your domain — we'll either add them automatically (if we host your site) or give you copy-paste records to hand off to your web admin."
      actions={
        <button data-tour="sender-add" onClick={openWizard} className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white flex items-center gap-1">
          <Plus className="h-4 w-4" /> Add sender
        </button>
      }
      loading={loading}
      error={error}
    >
      {/* Persistence error — sender_mode couldn't be saved (#116). */}
      {settingsError && (
        <div className="mb-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 flex items-center justify-between gap-2">
          <span>{settingsError}</span>
          <button
            onClick={() => setSettingsError(null)}
            className="text-xs px-2 py-1 rounded border border-amber-300 text-amber-700 hover:bg-white shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Current mode banner */}
      {senderMode && (
        <div className="mb-3 rounded border border-slate-200 bg-slate-50 p-3 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-700">
            {senderMode === "ia_default" ? (
              <><Sparkles className="h-4 w-4 text-[#EF6C33]" /> Sending from the Intelligent Analytics default address.</>
            ) : (
              <><Send className="h-4 w-4 text-[#EF6C33]" /> Sending from your own business email (white-label).</>
            )}
          </div>
          <button
            onClick={openWizard}
            className="text-xs px-2 py-1 rounded border border-slate-300 text-slate-600 hover:bg-white"
          >
            Change
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* List */}
        <div className="lg:col-span-1 border border-slate-200 rounded">
          {list.length === 0 && <div className="p-6 text-center text-sm text-slate-500">No sender addresses yet. Click "Add sender" to start.</div>}
          {list.map(d => (
            <button key={d.id} onClick={() => setSelectedId(d.id)}
              className={`w-full text-left p-3 border-b border-slate-100 hover:bg-slate-50 ${selectedId === d.id ? "bg-[#FFF6F0]" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900 truncate flex items-center gap-2">
                    <Globe className="h-3.5 w-3.5 text-slate-500" />
                    {d.domain}
                    {d.is_default && <Star className="h-3 w-3 text-[#EF6C33]" />}
                  </div>
                  <div className="text-[11px] text-slate-500">{d.display_name || "(no display name)"}</div>
                </div>
                {statusPill(d.status)}
              </div>
            </button>
          ))}
        </div>

        {/* Detail */}
        <div className="lg:col-span-2">
          {!selectedId && (
            <div className="border border-slate-200 rounded p-12 text-center text-sm text-slate-500">
              Select a sender on the left, or click "Add sender" to register one.
            </div>
          )}
          {selectedId && selected && (
            <div className="space-y-3">
              {/* Toolbar */}
              <div className="border border-slate-200 rounded p-3 flex items-center justify-between bg-slate-50">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{selected.domain}</div>
                  <div className="text-[11px] text-slate-500">
                    {selected.display_name || "(no display name)"}
                    {selected.last_verified_at ? ` · Last checked ${new Date(selected.last_verified_at).toLocaleString()}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button disabled={autoRunning || verifying} onClick={() => autoConfigure(selectedId)}
                    title="Register the domain, write the DNS records, and verify — for domains we host"
                    className="text-xs px-2.5 py-1 rounded border border-[#EF6C33] text-[#EF6C33] flex items-center gap-1 disabled:opacity-50">
                    {autoRunning ? "Configuring…" : "Configure automatically"}
                  </button>
                  <button disabled={verifying || autoRunning} onClick={() => verifyNow(selectedId)}
                    className="text-xs px-2.5 py-1 rounded bg-[#EF6C33] text-white flex items-center gap-1 disabled:opacity-50">
                    <RefreshCw className="h-3 w-3" /> {verifying ? "Checking…" : "Verify"}
                  </button>
                  {selected.status === "verified" && !selected.is_default && (
                    <button onClick={() => setDefault(selectedId)}
                      className="text-xs px-2.5 py-1 rounded border border-[#EF6C33] text-[#EF6C33] flex items-center gap-1">
                      <Star className="h-3 w-3" /> Set default
                    </button>
                  )}
                  <button onClick={() => deactivate(selectedId)}
                    className="text-xs px-2.5 py-1 rounded text-rose-600 hover:bg-rose-50 flex items-center gap-1">
                    <Trash2 className="h-3 w-3" /> Deactivate
                  </button>
                </div>
              </div>

              {/* What "Configure automatically" actually did. Reporting the
                  per-record before/after matters here more than most places:
                  this writes to a live DNS zone, and "Configured ✓" with no
                  detail is indistinguishable from having done nothing. */}
              {(autoNote || autoLog) && (
                <div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs">
                  {autoNote && <div className="font-medium text-slate-800">{autoNote}</div>}
                  {autoLog && autoLog.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {autoLog.map((l, i) => (
                        <li key={i} className="font-mono text-[11px] text-slate-600">
                          <span className="font-semibold uppercase">{l.record}</span>{" "}
                          <span className="text-slate-500">{l.action}</span>
                          {l.before && <div className="pl-4 text-slate-400">− {l.before}</div>}
                          {l.after && <div className="pl-4 text-emerald-700">+ {l.after}</div>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Why are we asking you to do this by hand?
                  Two very different reasons, and conflating them is why this
                  screen read as broken: either the tenant has no ARION (so we
                  don't hold their DNS and genuinely can't), or they do and the
                  specific domain still isn't on our account. */}
              {records && !hasArion && (
                <div className="rounded-lg border p-3 text-xs" style={{ borderColor: "#38BDF855", background: "#38BDF80D" }}>
                  <div className="font-semibold text-slate-800">Don&apos;t want to touch DNS?</div>
                  <div className="mt-1 text-slate-600">
                    Add <span className="font-semibold">Digital Presence</span> and our Intelligence Layer publishes these
                    records for you — sender setup finishes on its own, and stays correct if anything changes later.
                  </div>
                  <a href="/app/settings/plan-pricing" className="mt-2 inline-block font-semibold" style={{ color: "#38BDF8" }}>
                    See Digital Presence →
                  </a>
                </div>
              )}
              {records && hasArion && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-slate-700">
                  <span className="font-semibold">This domain isn&apos;t on the DNS we manage.</span>{" "}
                  You have Digital Presence, so we publish these automatically for any domain in your account — this one
                  is hosted elsewhere. Move its DNS to us, or add the records below by hand.
                </div>
              )}

              {/* DNS records */}
              {records && (
                <div className="space-y-2">
                  <div className="text-xs uppercase font-semibold text-slate-600">Publish these DNS records at your registrar:</div>
                  {(["domain_ownership", "spf", "dkim_1", "dkim_2", "dmarc"] as const).map(key => {
                    const rec = records.records[key];
                    if (!rec) return null;   // ACS-unavailable fallback omits domain_ownership
                    const v = verifyResult?.checks?.[key];
                    const ok = v?.found && (v.ok !== false) && (key !== "spf" || v.includes_acs !== false);
                    return (
                      <div key={key} className={`border-2 rounded p-3 ${verifyResult ? (ok ? "border-emerald-200 bg-emerald-50/30" : "border-rose-200 bg-rose-50/30") : "border-slate-200 bg-white"}`}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-xs font-semibold uppercase text-slate-700">{key === "domain_ownership" ? "Domain ownership" : key.replace("_", " ")} <span className="ml-2 text-[10px] text-slate-500 font-mono">({rec.type})</span></div>
                          {verifyResult && (ok ? <Check className="h-4 w-4 text-emerald-600" /> : <X className="h-4 w-4 text-rose-600" />)}
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-1">
                          <Field label="Host" value={rec.host} copyKey={`${key}-host`} onCopy={copyText} copiedKey={copiedKey} />
                          <Field label="Value" value={rec.value} copyKey={`${key}-value`} onCopy={copyText} copiedKey={copiedKey} wide />
                        </div>
                        {rec.note && <div className="text-[10px] text-slate-500 italic mt-1">{rec.note}</div>}
                      </div>
                    );
                  })}
                </div>
              )}

              {verifyResult && (
                <div className={`rounded p-3 ${verifyResult.status === "verified" ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-amber-50 border border-amber-200 text-amber-800"}`}>
                  <div className="text-sm font-semibold">
                    {verifyResult.status === "verified" ? "All records verified! You can now set this sender as your default." : "Some records aren't published yet. DNS changes can take up to 24h to propagate."}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Wizard modal */}
      <IadmModal
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        product="spark"
        size="info"
        title={
          wizardStep === "pick"    ? "How do you want your emails to look?" :
          wizardStep === "collect" ? "What email address should we send from?" :
          wizardStep === "dns"     ? "Publish DNS records on your domain" :
                                     "All set"
        }
        subtitle={
          wizardStep === "pick"    ? "Pick the default Intelligent Analytics sender, or send from your own business email." :
          wizardStep === "collect" ? "We'll figure out the domain from the email — no need to copy anything." :
          wizardStep === "dns"     ? (hostingerManaged ? "We host your site — we're publishing these for you automatically." : "Hand these off to your web admin, then click Verify.") :
                                     ""
        }
        footer={
          wizardStep === "collect" ? (
            <>
              <IadmButton variant="ghost" onClick={() => setWizardStep("pick")}>Back</IadmButton>
              <IadmButton
                data-tour="sender-continue"
                variant="accent"
                product="spark"
                onClick={submitWhiteLabel}
                disabled={!emailLooksValid(senderEmail) || creating}
              >
                {creating ? "Setting up…" : "Continue"}
              </IadmButton>
            </>
          ) : wizardStep === "dns" ? (
            <>
              <IadmButton variant="ghost" onClick={() => setWizardOpen(false)}>Close</IadmButton>
              {!hostingerManaged && createdDomain && (
                <IadmButton
                  data-tour="sender-verify"
                  variant="accent"
                  product="spark"
                  onClick={() => verifyNow(createdDomain.id)}
                  disabled={verifying}
                >
                  {verifying ? "Checking…" : "I've added them — verify now"}
                </IadmButton>
              )}
            </>
          ) : wizardStep === "done" ? (
            <IadmButton variant="accent" product="spark" onClick={() => setWizardOpen(false)}>Done</IadmButton>
          ) : null
        }
      >
        {wizardStep === "pick" && (
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={pickIaDefault}
              disabled={savingMode}
              className="text-left rounded-xl border-2 border-slate-200 hover:border-[#EF6C33] hover:bg-[#FFF6F0] p-5 transition disabled:opacity-50"
            >
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-5 w-5 text-[#EF6C33]" />
                <div className="text-base font-semibold text-slate-900">Use Intelligent Analytics' default sender</div>
              </div>
              <p className="text-sm text-slate-600">
                Send from <code className="text-[12px] bg-slate-100 px-1 rounded">welcome@send.intelligentanalyticsdm.com</code>.
                Zero setup. Perfect for getting started — you can switch to a white-label sender later without losing anything.
              </p>
              <div className="mt-3 text-[11px] uppercase tracking-wider font-semibold text-emerald-700">
                ✓ No DNS · ✓ Send right now
              </div>
            </button>

            <button
              type="button"
              onClick={pickWhiteLabel}
              disabled={savingMode}
              className="text-left rounded-xl border-2 border-slate-200 hover:border-[#EF6C33] hover:bg-[#FFF6F0] p-5 transition disabled:opacity-50"
            >
              <div className="flex items-center gap-2 mb-2">
                <Wand2 className="h-5 w-5 text-[#EF6C33]" />
                <div className="text-base font-semibold text-slate-900">Send from my own business email</div>
              </div>
              <p className="text-sm text-slate-600">
                Send from <code className="text-[12px] bg-slate-100 px-1 rounded">welcome@yourbusiness.com</code>.
                Recipients see your brand in the From line. Requires 4 DNS records on your domain — we'll
                {hostingerManaged ? " add them for you automatically." : " give you the records to hand off to your web admin."}
              </p>
              <div className="mt-3 text-[11px] uppercase tracking-wider font-semibold text-[#EF6C33]">
                White-label · {hostingerManaged ? "Auto-managed" : "2-5 min DNS hand-off"}
              </div>
            </button>
          </div>
        )}

        {wizardStep === "collect" && (
          <div className="p-6 space-y-4 max-w-xl">
            <Labeled label="Sender email address" hint="e.g. welcome@yourbusiness.com or hello@acme.com.">
              <input
                data-tour="sender-email"
                value={senderEmail}
                placeholder="welcome@yourbusiness.com"
                onChange={(e) => setSenderEmail(e.target.value)}
                autoFocus
                className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]"
              />
            </Labeled>
            <Labeled label="Display name (optional)" hint="The name your recipients see in their inbox — usually your business name.">
              <input
                data-tour="sender-display-name"
                value={senderDisplayName}
                placeholder="Acme Co."
                onChange={(e) => setSenderDisplayName(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]"
              />
            </Labeled>
            <div className="rounded border border-slate-200 bg-slate-50 p-3">
              <div className="text-[10px] uppercase font-semibold text-slate-500 mb-1">Preview</div>
              <div className="text-sm font-mono text-slate-800">
                <span className="text-slate-500">From: </span>
                {(senderDisplayName.trim() || "(display name)")} &lt;{senderEmail.trim() || "you@yourbusiness.com"}&gt;
              </div>
            </div>
          </div>
        )}

        {wizardStep === "dns" && createdDomain && (
          <div className="p-6 space-y-4">
            {/* ARION-hosted: auto-publish path */}
            {hostingerManaged ? (
              <div className={`rounded p-4 border-2 ${
                autoDnsState === "verified" ? "border-emerald-200 bg-emerald-50" :
                autoDnsState === "failed"   ? "border-rose-200 bg-rose-50"   :
                                              "border-amber-200 bg-amber-50"
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  {autoDnsState === "verified" ? <Check className="h-5 w-5 text-emerald-600" /> :
                   autoDnsState === "failed"   ? <X className="h-5 w-5 text-rose-600" /> :
                                                  <RefreshCw className="h-5 w-5 text-amber-600 animate-spin" />}
                  <div className="text-sm font-semibold text-slate-900">
                    {autoDnsState === "verified" ? "DNS records verified! You're ready to send." :
                     autoDnsState === "failed"   ? "Automatic DNS publish didn't complete. Use the manual records below as a fallback." :
                                                    "We're adding the DNS records for you automatically — give us 2-5 minutes."}
                  </div>
                </div>
                <div className="text-xs text-slate-600">
                  Domain: <code className="bg-white px-1 rounded">{createdDomain.domain}</code>
                </div>
              </div>
            ) : (
              <div className="rounded border border-slate-200 bg-slate-50 p-3 flex items-center justify-between">
                <div className="text-sm text-slate-700">
                  Domain: <code className="bg-white border border-slate-200 px-1 rounded">{createdDomain.domain}</code>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyAllDns(createdRecords)}
                    className="text-xs px-2.5 py-1 rounded border border-slate-300 hover:bg-white flex items-center gap-1"
                  >
                    <Copy className="h-3 w-3" /> {copiedKey === "all-dns" ? "Copied!" : "Copy all"}
                  </button>
                  <button
                    onClick={() => mailToWebAdmin(createdRecords, createdDomain)}
                    className="text-xs px-2.5 py-1 rounded border border-slate-300 hover:bg-white flex items-center gap-1"
                  >
                    <Mail className="h-3 w-3" /> Email these to my web admin
                  </button>
                </div>
              </div>
            )}

            {/* The records — shown in BOTH paths so the auto path has a
                fallback view if anything goes sideways. */}
            {createdRecords && (
              <div className="space-y-2">
                {(["domain_ownership", "spf", "dkim_1", "dkim_2", "dmarc"] as const).map(key => {
                  const rec = createdRecords.records[key];
                  if (!rec) return null;   // ACS-unavailable fallback omits domain_ownership
                  return (
                    <div key={key} className="border border-slate-200 rounded p-3 bg-white">
                      <div className="text-xs font-semibold uppercase text-slate-700">
                        {key.replace("_", " ")}{" "}
                        <span className="ml-2 text-[10px] text-slate-500 font-mono">({rec.type})</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-1">
                        <Field label="Host" value={rec.host} copyKey={`wiz-${key}-host`} onCopy={copyText} copiedKey={copiedKey} />
                        <Field label="Value" value={rec.value} copyKey={`wiz-${key}-value`} onCopy={copyText} copiedKey={copiedKey} wide />
                      </div>
                      {rec.note && <div className="text-[10px] text-slate-500 italic mt-1">{rec.note}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {wizardStep === "done" && (
          <div className="p-8 text-center space-y-2">
            <Sparkles className="h-10 w-10 text-[#EF6C33] mx-auto" />
            <div className="text-base font-semibold text-slate-900">You're using the Intelligent Analytics default sender.</div>
            <div className="text-sm text-slate-600 max-w-md mx-auto">
              You can start sending right away. Switch to your own business email anytime — your campaigns, lists, and history carry over.
            </div>
          </div>
        )}
      </IadmModal>
    </SparkPageShell>
  );
}

function Field({ label, value, copyKey, onCopy, copiedKey, wide }: { label: string; value: string; copyKey: string; onCopy: (v: string, k: string) => void; copiedKey: string | null; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <div className="text-[10px] uppercase font-semibold text-slate-500">{label}</div>
      <div className="flex gap-1 mt-0.5">
        <code className="flex-1 text-[11px] font-mono bg-slate-100 px-2 py-1 rounded truncate">{value}</code>
        <button onClick={() => onCopy(value, copyKey)} className="text-[10px] px-1.5 py-1 rounded border border-slate-200 hover:bg-slate-50">
          {copiedKey === copyKey ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>
    </div>
  );
}

function Labeled({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">{label}</label>
      <div className="mt-0.5">{children}</div>
      {hint && <div className="text-[11px] text-slate-500 mt-0.5">{hint}</div>}
    </div>
  );
}

export default SparkSenderDomainsPage;
