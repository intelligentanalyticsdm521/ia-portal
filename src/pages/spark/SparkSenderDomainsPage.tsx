// SparkSenderDomainsPage — Sender Setup, as two step-by-step walkthroughs.
//
// REBUILT 2026-09-01. The previous version had two paths and neither of them
// finished:
//
//   * Option 1 told the customer they would send from
//     welcome@send.intelligentanalyticsdm.com. That domain does not exist —
//     not in ACS, not in DNS, nowhere. It saved a preference and stopped, so
//     mail actually went out as noreply@ia-dm.com and the screen was simply
//     wrong about what the recipient would see.
//
//   * Option 2 registered a domain and showed DNS records, but never created
//     the lumen.sender_address row the send path resolves against — so even a
//     customer who published every record perfectly still sent as the platform
//     default. It also never linked the domain to the sending resource, which
//     is a separate ACS step from verification.
//
// What each path does now:
//
//   OPTION 1 — "Use Intelligent Analytics" (3 steps: pick → confirm → done).
//     Gives the business its OWN address on ia-dm.com, our already-registered,
//     already-verified, already-linked domain: coldstarttestco@ia-dm.com, not
//     a shared noreply. The API provisions that username with ACS and only
//     then writes our rows, so "done" means the address can genuinely send.
//     No DNS, no waiting, no administrator.
//
//   OPTION 2 — "Send from my own business email" (7 steps, recommended).
//     Send from → Reply to → Display name → can that domain RECEIVE mail →
//     DNS → verify → finish. Each step confirms before it advances. The final
//     step links + provisions; if linking is refused it says an administrator
//     has to finish it rather than showing a green tick.
//
// Tone: no acronyms in the primary copy. "SPF" is "the record that lists who
// is allowed to send as you", with the record type shown alongside for the
// person who actually publishes it.
//
// The list + detail UI for already-registered senders is preserved below the
// wizard so an admin can manage several.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { useAppState } from "../../app/AppState";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { IadmModal, IadmButton } from "../../components/IadmModal";
import {
  Globe, Check, X, Plus, Copy, RefreshCw, Star, Trash2, Mail, Sparkles, Wand2,
  Send, AlertTriangle, Inbox, ShieldCheck, Loader2,
} from "lucide-react";

type Status = "pending" | "verified" | "failed";

// The thing a person actually means by "sender": the address mail goes out as.
// This page used to list only DOMAINS, which is the plumbing underneath.
interface SenderAddress {
  id: number;
  local_part: string;
  domain: string;
  display_name: string | null;
  email_address: string;
  is_default: boolean;
  domain_status: Status;
  sender_domain_id: number;
}

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
// always returned it; an older version of this page listed only spf/dkim/dmarc,
// so the one record the ownership check reads was invisible — and no domain
// could ever verify. It stays first in every list below.
type RecordKey = "domain_ownership" | "spf" | "dkim_1" | "dkim_2" | "dmarc";
const RECORD_KEYS: RecordKey[] = ["domain_ownership", "spf", "dkim_1", "dkim_2", "dmarc"];

interface RecordsResp {
  domain: string;
  source?: string;
  warning?: string;
  states?: Record<string, { status?: string }>;
  records: Record<RecordKey, DnsRecord | null>;
}

interface VerifyData {
  id: number;
  domain: string;
  status: Status;
  checks: Record<string, { found: boolean; ok?: boolean; value: unknown; includes_acs?: boolean }>;
  /** ACS's own per-record verdict, keyed Domain / SPF / DKIM / DKIM2. Authoritative. */
  acs?: Record<string, { status?: string; errorCode?: string }> | null;
  acs_sendable?: boolean | null;
  sendReady?: boolean | null;
  platform_domain?: boolean;
}
interface VerifyResp { data: VerifyData; }

interface SparkSettingsResp {
  data?: {
    sender_mode?: "ia_default" | "white_label" | null;
    hostinger_managed?: boolean;
  };
}

interface PlatformAddressResp {
  data: {
    domain: string;
    current: { id: number; local_part: string; display_name: string | null; address: string } | null;
    local_part: string | null;
    address: string | null;
    available: boolean | null;
    reason: string | null;
  };
}

interface PlatformCreateResp {
  data: { domain: string; local_part: string; address: string; display_name: string | null; send_ready: boolean };
}

interface MxResp {
  data: {
    domain: string;
    checked: boolean;
    can_receive: boolean | null;
    records: Array<{ exchange: string; priority: number }>;
    message: string;
  };
}

interface SetupResp {
  data: {
    domain: string;
    mode?: "automatic" | "manual" | "unavailable";
    dns_managed_by_us?: boolean;
    dns_reason?: string;
    message?: string;
  };
}

interface ActivateResp {
  data: {
    address: string;
    display_name: string | null;
    reply_to: string | null;
    send_ready: boolean | null;
    link_blocked: boolean;
    reason: string | null;
  };
}

type WizardStep =
  | "pick"
  // Option 1 — short by design: pick the address, confirm, done.
  | "ia_address" | "ia_confirm" | "ia_done"
  // Option 2 — one question per screen, each confirmed before advancing.
  | "wl_from" | "wl_reply" | "wl_name" | "wl_mx" | "wl_dns" | "wl_verify" | "wl_finish";

// Plain-English names, with the technical name kept in brackets for whoever
// actually types these into a DNS panel. Both audiences are real and they are
// rarely the same person.
const RECORD_COPY: Record<RecordKey, { label: string; plain: string; optional?: boolean }> = {
  domain_ownership: {
    label: "Proof you own the domain",
    plain: "Lets us confirm the domain is really yours before we send anything as you. Most setups fail because this one gets missed.",
  },
  spf: {
    label: "Who is allowed to send as you",
    plain: "A public list of the mail systems permitted to send using your address. Ours has to be on it. (SPF)",
  },
  dkim_1: {
    label: "Signature key",
    plain: "Lets us sign each message so the receiving inbox can tell nothing was altered on the way. (DKIM)",
  },
  dkim_2: {
    label: "Backup signature key",
    plain: "A second key, so signing keeps working while the first one is being rotated. (DKIM)",
  },
  dmarc: {
    label: "What to do with fakes",
    plain: "Tells inboxes what to do with mail that pretends to be you. Optional — add it later once everything else is green. (DMARC)",
    optional: true,
  },
};

// Which ACS check backs which record card. ACS is the authority on all four;
// our own DNS probe has no result at all for the ownership record, which is
// why the page used to be able to show only three of them as pass/fail.
const ACS_KEY_FOR: Record<RecordKey, string | null> = {
  domain_ownership: "Domain",
  spf: "SPF",
  dkim_1: "DKIM",
  dkim_2: "DKIM2",
  dmarc: null,
};

function statusPill(s: Status) {
  if (s === "verified") return <span className="px-2 py-0.5 rounded text-[10px] border bg-emerald-50 text-emerald-700 border-emerald-200 inline-flex items-center gap-1"><Check className="h-3 w-3" /> Ready</span>;
  if (s === "failed")   return <span className="px-2 py-0.5 rounded text-[10px] border bg-rose-50 text-rose-700 border-rose-200 inline-flex items-center gap-1"><X className="h-3 w-3" /> Failed</span>;
  return <span className="px-2 py-0.5 rounded text-[10px] border bg-amber-50 text-amber-700 border-amber-200 inline-flex items-center gap-1"><RefreshCw className="h-3 w-3" /> Waiting</span>;
}

/** Business name → a sensible address to suggest. "Cold Start Test Co" → "coldstarttestco". */
function suggestLocalPart(businessName: string | null | undefined): string {
  const base = (businessName || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  return base.slice(0, 32) || "hello";
}

function emailLooksValid(s: string) {
  return /^[^\s@]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(s.trim());
}
function domainOf(email: string) {
  return (email.trim().toLowerCase().split("@")[1] || "").replace(/^www\./, "");
}
function localOf(email: string) {
  return email.trim().toLowerCase().split("@")[0] || "";
}

export function SparkSenderDomainsPage() {
  const { get, post, del, ready } = useSparkApi();
  const { ownedProducts, active } = useAppState();
  const businessName = active?.tenant?.tenantFullName || active?.tenant?.tenantName || "";

  const [list, setList] = useState<Domain[]>([]);
  const [senders, setSenders] = useState<SenderAddress[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [records, setRecords] = useState<RecordsResp | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoNote, setAutoNote] = useState<string | null>(null);
  const [autoLog, setAutoLog] = useState<Array<{ record: string; action: string; before?: string; after?: string }> | null>(null);

  // ── Wizard state ─────────────────────────────────────────────────────────
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState<WizardStep>("pick");
  const [busy, setBusy] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);

  // Option 1
  const [platformDomain, setPlatformDomain] = useState<string>("ia-dm.com");
  const [iaLocal, setIaLocal] = useState("");
  const [iaDisplayName, setIaDisplayName] = useState("");
  const [iaAvail, setIaAvail] = useState<{ checking: boolean; available: boolean | null; reason: string | null }>({ checking: false, available: null, reason: null });
  const [iaCreated, setIaCreated] = useState<PlatformCreateResp["data"] | null>(null);

  // Option 2
  const [wlFrom, setWlFrom] = useState("");
  const [wlReplySame, setWlReplySame] = useState(true);
  const [wlReply, setWlReply] = useState("");
  const [wlName, setWlName] = useState("");
  const [mx, setMx] = useState<MxResp["data"] | null>(null);
  const [wlDomainRow, setWlDomainRow] = useState<Domain | null>(null);
  const [wlRecords, setWlRecords] = useState<RecordsResp | null>(null);
  const [wlSetup, setWlSetup] = useState<SetupResp["data"] | null>(null);
  const [wlVerify, setWlVerify] = useState<VerifyData | null>(null);
  const [wlActivate, setWlActivate] = useState<ActivateResp["data"] | null>(null);

  const effectiveReplyTo = wlReplySame ? wlFrom.trim().toLowerCase() : wlReply.trim().toLowerCase();

  // Tenant-level prefs.
  const [senderMode, setSenderMode] = useState<"ia_default" | "white_label" | null>(null);
  const hasArion = ownedProducts?.has?.("arion") ?? false;
  // Surfaced when persisting sender_mode fails. Previously a silent
  // .catch(()=>null) swallowed the 404 so a missing/broken /spark-settings
  // endpoint left the picker looking saved when it wasn't (#116).
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const [d, s] = await Promise.all([
        get<{ data: Domain[] }>("/api/v1/sender-domains"),
        get<SparkSettingsResp>("/api/v1/spark-settings").catch(() => null),
      ]);
      setList(d?.data || []);
      // The addresses are what this page is FOR. Non-fatal: a failure here must
      // not blank the page, but it is surfaced rather than swallowed.
      try {
        const sres = await get<{ data: SenderAddress[] }>("/api/v1/senders");
        setSenders(sres?.data || []);
      } catch (e) {
        console.warn("[senders] address list failed:", (e as Error).message);
      }
      setSenderMode(s?.data?.sender_mode ?? "ia_default");
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /**
   * Refresh the list WITHOUT touching the page-level loading/error flags.
   *
   * This is not a nicety. SparkPageShell renders `{!loading && !error ? children : null}`
   * and the wizard modal is one of those children — so every fetchAll() call
   * made from inside a wizard step unmounted the modal mid-flow and threw away
   * everything the customer had typed. The old page called fetchAll() right in
   * the middle of registering a domain, which is a large part of why walking
   * this screen end to end was not possible.
   */
  const refreshList = useCallback(async () => {
    try {
      const d = await get<{ data: Domain[] }>("/api/v1/sender-domains");
      setList(d?.data || []);
      // The addresses are what this page is FOR. Non-fatal: a failure here must
      // not blank the page, but it is surfaced rather than swallowed.
      try {
        const sres = await get<{ data: SenderAddress[] }>("/api/v1/senders");
        setSenders(sres?.data || []);
      } catch (e) {
        console.warn("[senders] address list failed:", (e as Error).message);
      }
    } catch (err) {
      // Never promote a background refresh into a full-page error state.
      console.warn("[sender-setup] list refresh failed:", (err as Error).message);
    }
  }, [get]);

  // Which domain we actually send from. Asked once, so the page can stop
  // guessing — the previous version hard-coded a domain that doesn't exist.
  useEffect(() => {
    if (!ready) return;
    get<PlatformAddressResp>("/api/v1/sender-domains/platform-address")
      .then((r) => { if (r?.data?.domain) setPlatformDomain(r.data.domain); })
      .catch(() => { /* keep the default; the create call is the real gate */ });
  }, [get, ready]);

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

  // ── Availability probe for Option 1 ──────────────────────────────────────
  const availTimer = useRef<number | null>(null);
  useEffect(() => {
    if (step !== "ia_address") return;
    const local = iaLocal.trim().toLowerCase();
    if (!local) { setIaAvail({ checking: false, available: null, reason: null }); return; }
    setIaAvail((a) => ({ ...a, checking: true }));
    if (availTimer.current) window.clearTimeout(availTimer.current);
    availTimer.current = window.setTimeout(async () => {
      try {
        const r = await get<PlatformAddressResp>(`/api/v1/sender-domains/platform-address?local_part=${encodeURIComponent(local)}`);
        setIaAvail({ checking: false, available: r?.data?.available ?? null, reason: r?.data?.reason ?? null });
        if (r?.data?.domain) setPlatformDomain(r.data.domain);
      } catch (err) {
        setIaAvail({ checking: false, available: null, reason: `We couldn't check that address right now: ${(err as Error).message}` });
      }
    }, 400);
    return () => { if (availTimer.current) window.clearTimeout(availTimer.current); };
  }, [iaLocal, step, get]);

  // ── Wizard control ───────────────────────────────────────────────────────

  function openWizard() {
    setStep("pick");
    setStepError(null);
    setIaLocal(suggestLocalPart(businessName));
    setIaDisplayName(businessName);
    setIaCreated(null);
    setIaAvail({ checking: false, available: null, reason: null });
    setWlFrom("");
    setWlReplySame(true);
    setWlReply("");
    setWlName(businessName);
    setMx(null);
    setWlDomainRow(null);
    setWlRecords(null);
    setWlSetup(null);
    setWlVerify(null);
    setWlActivate(null);
    setWizardOpen(true);
  }

  async function saveMode(mode: "ia_default" | "white_label") {
    setSettingsError(null);
    try {
      await post("/api/v1/spark-settings", { sender_mode: mode });
      setSenderMode(mode);
    } catch (err) {
      // Honour the choice in the UI, but say the preference didn't stick (#116).
      setSenderMode(mode);
      setSettingsError(`Your choice may not have been saved: ${(err as Error).message}`);
    }
  }

  async function pickIaDefault() {
    setBusy(true);
    await saveMode("ia_default");
    setBusy(false);
    setStepError(null);
    setStep("ia_address");
  }

  async function pickWhiteLabel() {
    setBusy(true);
    await saveMode("white_label");
    setBusy(false);
    setStepError(null);
    setStep("wl_from");
  }

  // Option 1 — create the address. The API provisions it with the email
  // provider FIRST and only writes rows if that worked, so a success here is
  // an address that can actually send.
  async function createPlatformAddress() {
    setBusy(true); setStepError(null);
    try {
      const r = await post<PlatformCreateResp>("/api/v1/sender-domains/platform-address", {
        local_part: iaLocal.trim().toLowerCase(),
        display_name: iaDisplayName.trim() || businessName || null,
      });
      if (!r?.data?.address) throw new Error("The server didn't return an address.");
      setIaCreated(r.data);
      await refreshList();
      setStep("ia_done");
    } catch (err) {
      setStepError((err as Error).message);
    } finally { setBusy(false); }
  }

  // ── Option 2 steps ───────────────────────────────────────────────────────

  const runMxCheck = useCallback(async () => {
    setBusy(true); setStepError(null); setMx(null);
    try {
      const r = await post<MxResp>("/api/v1/sender-domains/mx-check", { email: effectiveReplyTo });
      setMx(r?.data || null);
    } catch (err) {
      setStepError(`We couldn't run that check: ${(err as Error).message}`);
    } finally { setBusy(false); }
  }, [post, effectiveReplyTo]);

  // Arriving at the reply-address check runs it straight away — the step
  // exists to answer a question, not to make someone press a button first.
  const mxFired = useRef(false);
  useEffect(() => {
    if (step !== "wl_mx") { mxFired.current = false; return; }
    if (mxFired.current) return;
    mxFired.current = true;
    runMxCheck();
  }, [step, runMxCheck]);

  // Register the domain behind the send-from address and pull its records.
  // Re-entrant: a domain already on file comes back as a 409, which is a
  // perfectly normal thing to happen when someone walks the wizard twice.
  async function registerDomainAndLoadDns() {
    setBusy(true); setStepError(null);
    const wanted = domainOf(wlFrom);
    try {
      let row: Domain | null = null;
      try {
        const r = await post<{ data: Domain }>("/api/v1/sender-domains/from-email", {
          email: wlFrom.trim().toLowerCase(),
          display_name: wlName.trim() || null,
          reply_to: effectiveReplyTo || null,
        });
        row = r?.data || null;
      } catch (err) {
        const msg = (err as Error).message || "";
        if (!/already registered|409/i.test(msg)) throw err;
        const fresh = await get<{ data: Domain[] }>("/api/v1/sender-domains?include_inactive=1");
        row = (fresh?.data || []).find((d) => d.domain === wanted) || null;
        if (!row) throw err;
      }
      if (!row) throw new Error("We couldn't register that domain.");
      setWlDomainRow(row);

      const [rec, setup] = await Promise.all([
        get<RecordsResp>(`/api/v1/sender-domains/${row.id}/records`),
        // Live answer to "do we hold this DNS?" — the stored tenant flag goes
        // stale, and this is decided per domain.
        get<SetupResp>(`/api/v1/sender-domains/${row.id}/setup`).catch(() => null),
      ]);
      setWlRecords(rec);
      setWlSetup(setup?.data || null);
      await refreshList();
      setStep("wl_dns");
    } catch (err) {
      setStepError((err as Error).message);
    } finally { setBusy(false); }
  }

  async function publishDnsForThem() {
    if (!wlDomainRow) return;
    setBusy(true); setStepError(null);
    try {
      const r = await post<{ data?: { changed: boolean; written: number; sendable: boolean; note?: string } }>(
        `/api/v1/sender-domains/${wlDomainRow.id}/auto-configure`, {}
      );
      setAutoNote(r?.data?.note || "Records published.");
      await refreshList();
      setStep("wl_verify");
    } catch (err) {
      const msg = (err as Error).message || "";
      setStepError(/409|manual/i.test(msg)
        ? "That domain's DNS isn't on an account we hold, so we can't publish for you. Use the records below instead."
        : `We couldn't publish those records: ${msg}`);
    } finally { setBusy(false); }
  }

  async function runWizardVerify() {
    if (!wlDomainRow) return;
    setBusy(true); setStepError(null);
    try {
      const r = await post<VerifyResp>(`/api/v1/sender-domains/${wlDomainRow.id}/verify`, {});
      setWlVerify(r?.data || null);
      await refreshList();
    } catch (err) {
      setStepError(`The check couldn't run: ${(err as Error).message}`);
    } finally { setBusy(false); }
  }

  // Final step: link the domain to the sending service and provision the
  // address on it. This is where the missing role assignment shows up, and it
  // is reported as ours to fix rather than dressed up as success.
  const runActivate = useCallback(async () => {
    if (!wlDomainRow) return;
    setBusy(true); setStepError(null);
    try {
      const r = await post<ActivateResp>(`/api/v1/sender-domains/${wlDomainRow.id}/activate`, {
        local_part: localOf(wlFrom),
        display_name: wlName.trim() || null,
        reply_to: effectiveReplyTo || null,
      });
      setWlActivate(r?.data || null);
      await refreshList();
    } catch (err) {
      setStepError((err as Error).message);
    } finally { setBusy(false); }
  }, [wlDomainRow, wlFrom, wlName, effectiveReplyTo, post, refreshList]);

  // Entering the finish step kicks the activation off once.
  const activateFired = useRef(false);
  useEffect(() => {
    if (step !== "wl_finish") { activateFired.current = false; return; }
    if (activateFired.current) return;
    activateFired.current = true;
    runActivate();
  }, [step, runActivate]);

  // ── List actions ─────────────────────────────────────────────────────────

  async function autoConfigure(id: number) {
    setAutoRunning(true); setAutoLog(null);
    try {
      const r = await post<{ data?: { changed: boolean; written: number; sendable: boolean; note?: string; log?: Array<{ record: string; action: string; before?: string; after?: string }> } }>(
        `/api/v1/sender-domains/${id}/auto-configure`, {}
      );
      const d = r?.data;
      setAutoLog(d?.log || []);
      setAutoNote(
        d?.note
        || (d?.sendable ? "Checks passed — this domain can send now."
        : d?.changed ? `${d.written} record(s) written. Checks can take a few minutes to catch up.`
        : "No changes were needed.")
      );
      await refreshList();
    } catch (err) {
      const msg = (err as Error).message || "";
      setAutoNote(
        /409|manual/i.test(msg)
          ? "We don't hold the DNS for this domain, so the records have to be added by hand — they're listed below."
          : `Could not set this up automatically: ${msg}`
      );
    } finally { setAutoRunning(false); }
  }

  async function verifyNow(id: number) {
    setVerifying(true);
    try {
      const r = await post<VerifyResp>(`/api/v1/sender-domains/${id}/verify`, {});
      setVerifyResult(r?.data || null);
      await refreshList();
    } catch (err) { alert(`The check couldn't run: ${(err as Error).message}`); }
    finally { setVerifying(false); }
  }

  async function setDefault(id: number) {
    try {
      await post(`/api/v1/sender-domains/${id}/default`, {});
      await refreshList();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function deactivate(id: number) {
    if (!confirm("Remove this sender? Emails will go back to using the Intelligent Analytics address.")) return;
    try {
      await del(`/api/v1/sender-domains/${id}`);
      if (selectedId === id) setSelectedId(null);
      await refreshList();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function copyText(text: string, key: string) {
    try { await navigator.clipboard.writeText(text); setCopiedKey(key); setTimeout(() => setCopiedKey(null), 2000); }
    catch (e) { alert(`Copy failed: ${(e as Error).message}`); }
  }

  async function copyAllDns(recs: RecordsResp | null) {
    if (!recs) return;
    const lines: string[] = [];
    RECORD_KEYS.forEach((k) => {
      const r = recs.records[k];
      if (!r) return;
      lines.push(`${RECORD_COPY[k].label}  (${r.type})`);
      lines.push(`  Host : ${r.host}`);
      lines.push(`  Value: ${r.value}`);
      if (r.note) lines.push(`  Note : ${r.note}`);
      lines.push("");
    });
    await copyText(lines.join("\n"), "all-dns");
  }

  function mailToWebAdmin(recs: RecordsResp | null, dom: string | null) {
    if (!recs || !dom) return;
    const subject = encodeURIComponent(`DNS records to add for ${dom}`);
    const body = encodeURIComponent(
      [
        "Hi,",
        "",
        `Please add these DNS records to the ${dom} zone so we can send email from our own address.`,
        "Once they're live, reply to this email and I'll run the check.",
        "",
        ...RECORD_KEYS.flatMap((k) => {
          const r = recs.records[k];
          if (!r) return [];
          return [
            `--- ${RECORD_COPY[k].label} (${r.type})${RECORD_COPY[k].optional ? " — optional" : ""} ---`,
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

  // ── Derived render helpers ───────────────────────────────────────────────

  const readyCount = list.filter((d) => d.status === "verified").length;
  const subtitle = `${list.length} sender${list.length === 1 ? "" : "s"} · ${readyCount} ready to send`;

  const iaLocalClean = iaLocal.trim().toLowerCase();
  const iaAddress = `${iaLocalClean || "yourbusiness"}@${platformDomain}`;
  const dnsManaged = wlSetup?.dns_managed_by_us === true;
  const wlVerified = wlVerify?.status === "verified";

  const titleFor: Record<WizardStep, string> = {
    pick: "How should your emails arrive?",
    ia_address: "Step 1 of 3 — choose your address",
    ia_confirm: "Step 2 of 3 — check this is right",
    ia_done: "Step 3 of 3 — you're set up",
    wl_from: "Step 1 of 7 — the address emails come from",
    wl_reply: "Step 2 of 7 — where replies should go",
    wl_name: "Step 3 of 7 — the name people see",
    wl_mx: "Step 4 of 7 — can that address receive mail?",
    wl_dns: "Step 5 of 7 — four records on your domain",
    wl_verify: "Step 6 of 7 — check the records are live",
    wl_finish: "Step 7 of 7 — switch sending on",
  };
  const subtitleFor: Record<WizardStep, string> = {
    pick: "Two ways to do this. Both work; one takes a minute, one looks more professional.",
    ia_address: "Your own address on our email domain. Nothing to set up on your side.",
    ia_confirm: "This is exactly what a recipient will see in their inbox.",
    ia_done: "",
    wl_from: "For example hello@yourbusiness.com — the address in the From line.",
    wl_reply: "Where a reply lands when somebody hits Reply.",
    wl_name: "The name shown above the address in an inbox.",
    wl_mx: "We'll look up whether that domain accepts incoming mail.",
    wl_dns: "Whoever runs your domain adds these. It's a one-off.",
    wl_verify: "Records take a few minutes to spread. Waiting is normal.",
    wl_finish: "Linking your domain to the sending service and switching on your address.",
  };

  return (
    <SparkPageShell
      title="Sender setup"
      subtitle={subtitle}
      help="Decide what address your emails come from. Option 1 gives your business its own address on our email domain — nothing to set up. Option 2 sends from your own domain, which looks more professional but needs four records added to that domain once."
      actions={
        <button data-tour="sender-add" onClick={openWizard} className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white flex items-center gap-1">
          <Plus className="h-4 w-4" /> Add sender
        </button>
      }
      loading={loading}
      error={error}
    >
      {settingsError && (
        <div className="mb-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 flex items-center justify-between gap-2">
          <span>{settingsError}</span>
          <button onClick={() => setSettingsError(null)} className="text-xs px-2 py-1 rounded border border-amber-300 text-amber-700 hover:bg-white shrink-0">
            Dismiss
          </button>
        </div>
      )}

      {senderMode && (
        <div className="mb-3 rounded border border-slate-200 bg-slate-50 p-3 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-700">
            {senderMode === "ia_default" ? (
              <><Sparkles className="h-4 w-4 text-[#EF6C33]" /> Sending from an Intelligent Analytics address.</>
            ) : (
              <><Send className="h-4 w-4 text-[#EF6C33]" /> Sending from your own business address.</>
            )}
          </div>
          <button onClick={openWizard} className="text-xs px-2 py-1 rounded border border-slate-300 text-slate-600 hover:bg-white">
            Change
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* List */}
        <div className="lg:col-span-1 space-y-3">
          {/* 2026-09-01 — the addresses now lead. This page listed only sender
              DOMAINS while a separate "Senders" page listed the addresses and
              refused to let you add one until you had visited this page first.
              Two menu entries for one job, ordered back to front. */}
          <div className="border border-slate-200 rounded">
            <div className="px-3 py-2 border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Your sending addresses
            </div>
            {senders.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">
                No sending addresses yet. Click <span className="font-medium">Add sender</span> — it walks you through
                the whole thing, including the domain.
              </div>
            ) : senders.map((sa) => (
              <button
                key={sa.id}
                onClick={() => setSelectedId(sa.sender_domain_id)}
                className={`w-full text-left p-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 ${selectedId === sa.sender_domain_id ? "bg-[#FFF6F0]" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate flex items-center gap-2">
                      <Send className="h-3.5 w-3.5 text-slate-500" />
                      {sa.email_address}
                      {sa.is_default && <Star className="h-3 w-3 text-[#EF6C33]" />}
                    </div>
                    <div className="text-[11px] text-slate-500">{sa.display_name || "(no display name)"}</div>
                  </div>
                  {statusPill(sa.domain_status)}
                </div>
              </button>
            ))}
          </div>

          <div className="border border-slate-200 rounded">
            <div className="px-3 py-2 border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Domains they send from
            </div>
            {list.length === 0 && <div className="p-6 text-center text-sm text-slate-500">Nothing set up yet.</div>}
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
        </div>

        {/* Detail */}
        <div className="lg:col-span-2">
          {!selectedId && (
            <div className="border border-slate-200 rounded p-12 text-center text-sm text-slate-500">
              Pick a sender on the left, or click "Set up sending".
            </div>
          )}
          {selectedId && selected && (
            <div className="space-y-3">
              <div className="border border-slate-200 rounded p-3 flex items-center justify-between bg-slate-50">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{selected.domain}</div>
                  <div className="text-[11px] text-slate-500">
                    {selected.display_name || "(no display name)"}
                    {selected.last_verified_at ? ` · Last checked ${new Date(selected.last_verified_at).toLocaleString()}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {selected.domain !== platformDomain && (
                    <button disabled={autoRunning || verifying} onClick={() => autoConfigure(selectedId)}
                      title="Add the records for you — only possible for domains whose DNS we hold"
                      className="text-xs px-2.5 py-1 rounded border border-[#EF6C33] text-[#EF6C33] flex items-center gap-1 disabled:opacity-50">
                      {autoRunning ? "Working…" : "Add records for me"}
                    </button>
                  )}
                  <button disabled={verifying || autoRunning} onClick={() => verifyNow(selectedId)}
                    className="text-xs px-2.5 py-1 rounded bg-[#EF6C33] text-white flex items-center gap-1 disabled:opacity-50">
                    <RefreshCw className="h-3 w-3" /> {verifying ? "Checking…" : "Check now"}
                  </button>
                  {selected.status === "verified" && !selected.is_default && (
                    <button onClick={() => setDefault(selectedId)}
                      className="text-xs px-2.5 py-1 rounded border border-[#EF6C33] text-[#EF6C33] flex items-center gap-1">
                      <Star className="h-3 w-3" /> Use by default
                    </button>
                  )}
                  <button onClick={() => deactivate(selectedId)}
                    className="text-xs px-2.5 py-1 rounded text-rose-600 hover:bg-rose-50 flex items-center gap-1">
                    <Trash2 className="h-3 w-3" /> Remove
                  </button>
                </div>
              </div>

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

              {/* The platform domain needs none of this — it's ours and it's done. */}
              {selected.domain === platformDomain ? (
                <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 flex items-start gap-2">
                  <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    This is the Intelligent Analytics email domain. It's already set up and checked — there's nothing for you
                    to add anywhere, and no waiting.
                  </div>
                </div>
              ) : (
                <>
                  {records && !hasArion && (
                    <div className="rounded-lg border p-3 text-xs" style={{ borderColor: "#38BDF855", background: "#38BDF80D" }}>
                      <div className="font-semibold text-slate-800">Don&apos;t want to touch DNS?</div>
                      <div className="mt-1 text-slate-600">
                        Add <span className="font-semibold">Digital Presence</span> and we add these records for you — setup finishes
                        on its own, and stays correct if anything changes later.
                      </div>
                      <a href="/app/settings/plan-pricing" className="mt-2 inline-block font-semibold" style={{ color: "#38BDF8" }}>
                        See Digital Presence →
                      </a>
                    </div>
                  )}
                  {records && hasArion && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-slate-700">
                      <span className="font-semibold">This domain isn&apos;t on the DNS we hold.</span>{" "}
                      You have Digital Presence, so we add these automatically for any domain in your account — this one is
                      hosted elsewhere. Move its DNS to us, or add the records below by hand.
                    </div>
                  )}

                  {records && (
                    <div className="space-y-2">
                      <div className="text-xs uppercase font-semibold text-slate-600">Add these records where your domain is managed:</div>
                      {RECORD_KEYS.map(key => {
                        const rec = records.records[key];
                        if (!rec) return null;
                        return (
                          <RecordCard
                            key={key}
                            rk={key}
                            rec={rec}
                            state={recordState(key, verifyResult)}
                            copiedKey={copiedKey}
                            onCopy={copyText}
                            prefix="det"
                          />
                        );
                      })}
                    </div>
                  )}

                  {verifyResult && (
                    <div className={`rounded p-3 ${verifyResult.status === "verified" ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-amber-50 border border-amber-200 text-amber-800"}`}>
                      <div className="text-sm font-semibold">
                        {verifyResult.status === "verified"
                          ? "Every record checked out. This domain can send."
                          : "Not everything is live yet. Records usually take a few minutes to spread — check again shortly."}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Wizard ─────────────────────────────────────────────────────── */}
      <IadmModal
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        product="spark"
        size="info"
        title={titleFor[step]}
        subtitle={subtitleFor[step]}
        footer={renderFooter()}
      >
        {stepError && (
          <div className="mx-6 mt-4 rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{stepError}</span>
          </div>
        )}

        {step === "pick" && renderPick()}
        {step === "ia_address" && renderIaAddress()}
        {step === "ia_confirm" && renderIaConfirm()}
        {step === "ia_done" && renderIaDone()}
        {step === "wl_from" && renderWlFrom()}
        {step === "wl_reply" && renderWlReply()}
        {step === "wl_name" && renderWlName()}
        {step === "wl_mx" && renderWlMx()}
        {step === "wl_dns" && renderWlDns()}
        {step === "wl_verify" && renderWlVerify()}
        {step === "wl_finish" && renderWlFinish()}
      </IadmModal>
    </SparkPageShell>
  );

  // ── Wizard bodies ────────────────────────────────────────────────────────

  function renderPick() {
    return (
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={pickIaDefault}
          disabled={busy}
          className="text-left rounded-xl border-2 border-slate-200 hover:border-[#EF6C33] hover:bg-[#FFF6F0] p-5 transition disabled:opacity-50"
        >
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-5 w-5 text-[#EF6C33]" />
            <div className="text-base font-semibold text-slate-900">Use an Intelligent Analytics address</div>
          </div>
          <p className="text-sm text-slate-600">
            You get your own address on our email domain — something like{" "}
            <code className="text-[12px] bg-slate-100 px-1 rounded">{suggestLocalPart(businessName)}@{platformDomain}</code>.
            We already own and have checked that domain, so there is nothing for you to set up and nothing to wait for.
          </p>
          <div className="mt-3 text-[11px] uppercase tracking-wider font-semibold text-emerald-700">
            About a minute · Works straight away
          </div>
        </button>

        <button
          type="button"
          data-tour="sender-own-email"
          onClick={pickWhiteLabel}
          disabled={busy}
          className="relative text-left rounded-xl border-2 p-5 transition disabled:opacity-50 border-[#EF6C33] bg-[#FFF6F0] hover:bg-[#ffeee4]"
        >
          <span className="absolute -top-2 right-4 text-[10px] uppercase tracking-wider font-bold text-white bg-[#EF6C33] px-2 py-0.5 rounded">
            Recommended
          </span>
          <div className="flex items-center gap-2 mb-2">
            <Wand2 className="h-5 w-5 text-[#EF6C33]" />
            <div className="text-base font-semibold text-slate-900">Send from my own business email</div>
          </div>
          <p className="text-sm text-slate-600">
            Emails arrive from <code className="text-[12px] bg-white border border-slate-200 px-1 rounded">hello@yourbusiness.com</code>,
            so people see your name, not ours. Someone has to add four records to your domain once — we walk you through
            it and you can hand the records to whoever looks after your website.
          </p>
          <div className="mt-3 text-[11px] uppercase tracking-wider font-semibold text-[#EF6C33]">
            Seven short steps · Best for your brand
          </div>
        </button>
      </div>
    );
  }

  function renderIaAddress() {
    const ok = iaAvail.available === true;
    return (
      <div className="p-6 space-y-4 max-w-2xl">
        <p className="text-sm text-slate-600">
          Pick the word that goes before the @. Most businesses use their own name so it's obvious who the email is from.
        </p>
        <Labeled
          label="Your address"
          hint={`Letters, numbers, dots and dashes. For example "${suggestLocalPart(businessName)}" gives you ${suggestLocalPart(businessName)}@${platformDomain}.`}
        >
          <div className="flex items-stretch">
            <input
              data-tour="sender-ia-local"
              value={iaLocal}
              autoFocus
              placeholder={suggestLocalPart(businessName)}
              onChange={(e) => setIaLocal(e.target.value.replace(/\s+/g, "").toLowerCase())}
              className="flex-1 text-sm border border-slate-300 rounded-l p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33] outline-none"
            />
            <span className="inline-flex items-center px-3 text-sm text-slate-600 bg-slate-100 border border-l-0 border-slate-300 rounded-r font-mono">
              @{platformDomain}
            </span>
          </div>
        </Labeled>

        <div className="text-sm min-h-[20px]">
          {iaAvail.checking && <span className="text-slate-500 inline-flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking…</span>}
          {!iaAvail.checking && ok && (
            <span className="text-emerald-700 inline-flex items-center gap-1"><Check className="h-4 w-4" /> {iaAddress} is free — it's yours.</span>
          )}
          {!iaAvail.checking && iaAvail.available === false && (
            <span className="text-rose-700 inline-flex items-start gap-1"><X className="h-4 w-4 mt-0.5 shrink-0" /> {iaAvail.reason}</span>
          )}
          {!iaAvail.checking && iaAvail.available === null && iaAvail.reason && (
            <span className="text-amber-700 inline-flex items-start gap-1"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> {iaAvail.reason}</span>
          )}
        </div>

        <Labeled label="The name people see" hint='Shown above the address in an inbox. Usually just your business name.'>
          <input
            value={iaDisplayName}
            placeholder={businessName || "Your Business"}
            onChange={(e) => setIaDisplayName(e.target.value)}
            className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33] outline-none"
          />
        </Labeled>
      </div>
    );
  }

  function renderIaConfirm() {
    return (
      <div className="p-6 space-y-4 max-w-2xl">
        <InboxPreview name={iaDisplayName.trim() || businessName || "Your Business"} address={iaAddress} />
        <ul className="text-sm text-slate-600 space-y-1.5 list-disc pl-5">
          <li>This address is on <span className="font-mono">{platformDomain}</span>, a domain we own and have already checked. Nothing to add to your own domain.</li>
          <li>Replies come back to whatever you set as your reply address on a campaign — this address does not have a mailbox of its own.</li>
          <li>You can move to your own business address later without losing your contacts, campaigns or history.</li>
        </ul>
        <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          Press <span className="font-semibold">Create this address</span> and we set it up with our email provider straight away.
          If anything goes wrong we'll tell you rather than saving something that can't send.
        </div>
      </div>
    );
  }

  function renderIaDone() {
    const addr = iaCreated?.address || iaAddress;
    const name = iaCreated?.display_name || iaDisplayName.trim() || businessName || "Your Business";
    return (
      <div className="p-6 space-y-4 max-w-2xl">
        <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3">
          <Check className="h-6 w-6 text-emerald-600 shrink-0" />
          <div>
            <div className="text-base font-semibold text-slate-900">{addr} is live.</div>
            <div className="text-sm text-slate-700 mt-1">
              It's registered with our email provider and set as the address your campaigns go out from. You can send now.
            </div>
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1">This is what lands in a recipient's inbox</div>
          <InboxPreview name={name} address={addr} />
        </div>
        <div className="text-sm text-slate-600">
          Want people to see your own domain instead? Come back to this page any time and choose{" "}
          <span className="font-semibold">Send from my own business email</span>.
        </div>
      </div>
    );
  }

  function renderWlFrom() {
    return (
      <div className="p-6 space-y-4 max-w-2xl">
        <p className="text-sm text-slate-600">
          This is the address printed on every email you send. It has to be on a domain you control — usually the same
          domain as your website.
        </p>
        <Labeled
          label="Send emails from"
          hint="Example: hello@yourbusiness.com. Use your own domain, not a Gmail or Outlook address — those providers won't let us send as them."
        >
          <input
            data-tour="sender-email"
            value={wlFrom}
            autoFocus
            placeholder="hello@yourbusiness.com"
            onChange={(e) => setWlFrom(e.target.value)}
            className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33] outline-none"
          />
        </Labeled>
        {wlFrom.trim() && !emailLooksValid(wlFrom) && (
          <div className="text-sm text-amber-700">That doesn't look like an email address yet — it needs an @ and a domain.</div>
        )}
        {emailLooksValid(wlFrom) && (
          <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            We'll set up sending for <span className="font-mono font-semibold">{domainOf(wlFrom)}</span>. That's the part
            after the @, and it's what the four records get added to.
          </div>
        )}
      </div>
    );
  }

  function renderWlReply() {
    return (
      <div className="p-6 space-y-4 max-w-2xl">
        <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          The address you send from doesn't have to be a real mailbox — but replies have to go somewhere a person actually
          reads, or you'll lose them.
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-800">
          <input
            type="checkbox"
            checked={wlReplySame}
            onChange={(e) => setWlReplySame(e.target.checked)}
            className="h-4 w-4 accent-[#EF6C33]"
          />
          Replies go to <span className="font-mono">{wlFrom.trim().toLowerCase() || "the same address"}</span> — the address I just entered
        </label>
        {!wlReplySame && (
          <Labeled
            label="Send replies to"
            hint="Example: sarah@yourbusiness.com, or the inbox you check every day. It must be a real mailbox."
          >
            <input
              value={wlReply}
              autoFocus
              placeholder="sarah@yourbusiness.com"
              onChange={(e) => setWlReply(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33] outline-none"
            />
          </Labeled>
        )}
        {!wlReplySame && wlReply.trim() && !emailLooksValid(wlReply) && (
          <div className="text-sm text-amber-700">That doesn't look like an email address yet.</div>
        )}
        {emailLooksValid(effectiveReplyTo) && (
          <div className="text-sm text-slate-600">
            When someone hits Reply, their message goes to <span className="font-mono font-semibold">{effectiveReplyTo}</span>.
            We check that address can receive mail in a moment.
          </div>
        )}
      </div>
    );
  }

  function renderWlName() {
    return (
      <div className="p-6 space-y-4 max-w-2xl">
        <p className="text-sm text-slate-600">
          In an inbox people see a name first and the address second. Use the name your customers know you by.
        </p>
        <Labeled label="Show this name" hint='Example: "Cold Start Test Co" or "Sarah at Cold Start". Keep it short — inboxes cut off long names.'>
          <input
            data-tour="sender-display-name"
            value={wlName}
            autoFocus
            placeholder={businessName || "Your Business"}
            onChange={(e) => setWlName(e.target.value)}
            className="w-full text-sm border border-slate-300 rounded p-2 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33] outline-none"
          />
        </Labeled>
        <div>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1">Preview</div>
          <InboxPreview name={wlName.trim() || businessName || "Your Business"} address={wlFrom.trim().toLowerCase() || "hello@yourbusiness.com"} />
        </div>
      </div>
    );
  }

  function renderWlMx() {
    return (
      <div className="p-6 space-y-4 max-w-2xl">
        <p className="text-sm text-slate-600">
          Sending and receiving are separate things. The records we set up later prove you're allowed to <em>send</em>.
          This check asks a different question: if somebody replies to{" "}
          <span className="font-mono font-semibold">{effectiveReplyTo}</span>, will the message actually arrive?
        </p>

        {!mx && !busy && (
          <div className="text-sm text-slate-500">Press <span className="font-semibold">Check now</span> below.</div>
        )}
        {busy && <div className="text-sm text-slate-500 inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Looking up {domainOf(effectiveReplyTo)}…</div>}

        {mx && (
          <div className={`rounded-lg border-2 p-4 ${
            mx.can_receive === true ? "border-emerald-200 bg-emerald-50"
            : mx.can_receive === false ? "border-rose-200 bg-rose-50"
            : "border-amber-200 bg-amber-50"}`}>
            <div className="flex items-start gap-2">
              {mx.can_receive === true ? <Inbox className="h-5 w-5 text-emerald-600 shrink-0" />
                : mx.can_receive === false ? <X className="h-5 w-5 text-rose-600 shrink-0" />
                : <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />}
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  {mx.can_receive === true ? "Replies will arrive."
                    : mx.can_receive === false ? "Replies would go nowhere."
                    : "We couldn't check."}
                </div>
                <div className="text-sm text-slate-700 mt-1">{mx.message}</div>
                {mx.records.length > 0 && (
                  <div className="text-[11px] font-mono text-slate-500 mt-2">
                    {mx.records.map((r) => `${r.exchange} (priority ${r.priority})`).join(" · ")}
                  </div>
                )}
              </div>
            </div>
            {mx.can_receive === false && (
              <button
                onClick={() => { setMx(null); setWlReplySame(false); setStep("wl_reply"); }}
                className="mt-3 text-xs px-2.5 py-1 rounded border border-rose-300 text-rose-700 bg-white hover:bg-rose-50"
              >
                Use a different reply address
              </button>
            )}
            {mx.checked === false && (
              <button onClick={runMxCheck} className="mt-3 text-xs px-2.5 py-1 rounded border border-amber-300 text-amber-800 bg-white hover:bg-amber-50">
                Try again
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderWlDns() {
    const dom = wlDomainRow?.domain || domainOf(wlFrom);
    return (
      <div className="p-6 space-y-4">
        {dnsManaged ? (
          <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50 p-4">
            <div className="text-sm font-semibold text-slate-900">We look after DNS for {dom} — we can add these for you.</div>
            <div className="text-sm text-slate-700 mt-1">
              Press the button below and we'll write all four records ourselves. Nothing for you to copy anywhere.
            </div>
            <button
              onClick={publishDnsForThem}
              disabled={busy}
              className="mt-3 text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white disabled:opacity-50 inline-flex items-center gap-1"
            >
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Adding…</> : "Add the records for me"}
            </button>
          </div>
        ) : (
          <div className="rounded border border-slate-200 bg-slate-50 p-3">
            <div className="text-sm text-slate-700">
              These four go on <span className="font-mono font-semibold">{dom}</span>, wherever that domain is managed —
              your website host, your registrar, or whoever built your site.
              {wlSetup?.dns_reason ? <span className="text-slate-500"> ({wlSetup.dns_reason})</span> : null}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <button onClick={() => copyAllDns(wlRecords)} className="text-xs px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 flex items-center gap-1">
                <Copy className="h-3 w-3" /> {copiedKey === "all-dns" ? "Copied" : "Copy all four"}
              </button>
              <button onClick={() => mailToWebAdmin(wlRecords, dom)} className="text-xs px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 flex items-center gap-1">
                <Mail className="h-3 w-3" /> Email these to my web admin
              </button>
            </div>
          </div>
        )}

        {wlRecords?.warning && (
          <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{wlRecords.warning}</div>
        )}

        <div className="space-y-2">
          {RECORD_KEYS.map((key) => {
            const rec = wlRecords?.records?.[key];
            if (!rec) return null;
            return <RecordCard key={key} rk={key} rec={rec} state={null} copiedKey={copiedKey} onCopy={copyText} prefix="wiz" />;
          })}
        </div>

        <div className="rounded border border-slate-200 bg-white p-3 text-sm text-slate-600">
          <span className="font-semibold text-slate-800">One thing to watch:</span> a domain may only have ONE record listing
          who can send as it. If there's already one there — for Google Workspace, or your website host — add our part to
          the existing record instead of replacing it. Replacing it is how businesses accidentally stop their own email.
        </div>
      </div>
    );
  }

  function renderWlVerify() {
    const acs = wlVerify?.acs || null;
    return (
      <div className="p-6 space-y-4">
        <p className="text-sm text-slate-600">
          This asks the internet whether each record is live yet. Records spread slowly — a few minutes is normal, and
          occasionally longer. <span className="font-semibold">Waiting is not a failure.</span>
        </p>

        <div className="space-y-2">
          {RECORD_KEYS.map((key) => {
            const rec = wlRecords?.records?.[key];
            if (!rec) return null;
            return <RecordCard key={key} rk={key} rec={rec} state={recordState(key, wlVerify)} copiedKey={copiedKey} onCopy={copyText} prefix="ver" />;
          })}
        </div>

        {wlVerify && (
          <div className={`rounded-lg border-2 p-4 ${wlVerified ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
            <div className="text-sm font-semibold text-slate-900">
              {wlVerified
                ? "All the required records are live."
                : "Not everything is live yet — that's normal this soon after adding them."}
            </div>
            <div className="text-sm text-slate-700 mt-1">
              {wlVerified
                ? "One step left: switching sending on."
                : "Leave it a few minutes and check again. If a record is still missing after an hour, it usually means it was pasted into the wrong field — the Host and the Value are easy to swap."}
            </div>
            {!wlVerified && acs && (
              <ul className="mt-2 text-[11px] text-slate-600 space-y-0.5">
                {Object.entries(acs).map(([k, v]) => (
                  <li key={k}><span className="font-semibold">{k}</span>: {v?.status || "not checked"}{v?.errorCode ? ` (${v.errorCode})` : ""}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderWlFinish() {
    const a = wlActivate;
    return (
      <div className="p-6 space-y-4 max-w-2xl">
        {busy && !a && (
          <div className="text-sm text-slate-600 inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Connecting your domain to the sending service…
          </div>
        )}

        {/* The call itself failed (not "it isn't ready" — it never answered).
            Without a retry here the only way out is closing the wizard and
            starting over, which is how a customer gives up. */}
        {!busy && !a && (
          <div className="space-y-3">
            <div className="text-sm text-slate-600">
              We couldn't finish switching sending on. Nothing is lost — your records and your address are saved.
            </div>
            <button onClick={runActivate} className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white">
              Try again
            </button>
          </div>
        )}

        {a && a.send_ready === true && (
          <>
            <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3">
              <Check className="h-6 w-6 text-emerald-600 shrink-0" />
              <div>
                <div className="text-base font-semibold text-slate-900">{a.address} can send.</div>
                <div className="text-sm text-slate-700 mt-1">
                  Your domain is connected to the sending service and this address is registered on it. Campaigns will go
                  out from here.
                </div>
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1">This is what lands in a recipient's inbox</div>
              <InboxPreview name={a.display_name || wlName.trim() || businessName || "Your Business"} address={a.address} />
              {a.reply_to && <div className="text-sm text-slate-600 mt-2">Replies go to <span className="font-mono font-semibold">{a.reply_to}</span>.</div>}
            </div>
          </>
        )}

        {/* false = we tried and it isn't ready. null is a different screen
            below — "we never got to try" must not read as "it failed". */}
        {a && a.send_ready === false && (
          <div className={`rounded-lg border-2 p-4 ${a.link_blocked ? "border-amber-200 bg-amber-50" : "border-rose-200 bg-rose-50"}`}>
            <div className="flex items-start gap-3">
              <AlertTriangle className={`h-6 w-6 shrink-0 ${a.link_blocked ? "text-amber-600" : "text-rose-600"}`} />
              <div>
                <div className="text-base font-semibold text-slate-900">
                  {a.link_blocked
                    ? "Your side is done. Ours isn't — yet."
                    : "We saved your address, but it can't send yet."}
                </div>
                <div className="text-sm text-slate-700 mt-1">
                  {a.link_blocked
                    ? `Your records are correct and ${a.address} is saved. The last step happens on our side — connecting ${wlDomainRow?.domain || domainOf(wlFrom)} to the sending service — and it needs an Intelligent Analytics administrator to grant one permission. We can see it's pending; nothing more is needed from you. Until then your emails keep going out from the Intelligent Analytics address.`
                    : a.reason || "We couldn't switch sending on."}
                </div>
                {!a.link_blocked && a.reason && (
                  <div className="text-[11px] font-mono text-slate-500 mt-2 break-all">{a.reason}</div>
                )}
              </div>
            </div>
            <button onClick={runActivate} disabled={busy} className="mt-3 text-xs px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50">
              {busy ? "Trying…" : "Try again"}
            </button>
          </div>
        )}

        {a && a.send_ready === null && (
          <div className="text-sm text-slate-600">
            Sending isn't configured on this environment, so we couldn't switch the address on here.
          </div>
        )}
      </div>
    );
  }

  // ── Footer ───────────────────────────────────────────────────────────────

  function renderFooter() {
    const back = (to: WizardStep) => (
      <IadmButton variant="ghost" onClick={() => { setStepError(null); setStep(to); }}>Back</IadmButton>
    );

    switch (step) {
      case "pick":
        return null;

      case "ia_address":
        return (
          <>
            {back("pick")}
            {/* Blocked on a KNOWN collision only. When the availability probe
                itself failed we still let them through — the create call
                re-checks server-side and refuses honestly, whereas a dead
                Continue button on a failed lookup is a wall with no way past. */}
            <IadmButton
              variant="accent"
              product="spark"
              disabled={!iaLocalClean || iaAvail.checking || iaAvail.available === false}
              onClick={() => { setStepError(null); setStep("ia_confirm"); }}
            >
              Continue
            </IadmButton>
          </>
        );
      case "ia_confirm":
        return (
          <>
            {back("ia_address")}
            <IadmButton data-tour="sender-continue" variant="accent" product="spark" disabled={busy} onClick={createPlatformAddress}>
              {busy ? "Creating…" : "Create this address"}
            </IadmButton>
          </>
        );
      case "ia_done":
        return <IadmButton variant="accent" product="spark" onClick={() => setWizardOpen(false)}>Done</IadmButton>;

      case "wl_from":
        return (
          <>
            {back("pick")}
            <IadmButton variant="accent" product="spark" disabled={!emailLooksValid(wlFrom)} onClick={() => { setStepError(null); setStep("wl_reply"); }}>
              Continue
            </IadmButton>
          </>
        );
      case "wl_reply":
        return (
          <>
            {back("wl_from")}
            <IadmButton variant="accent" product="spark" disabled={!emailLooksValid(effectiveReplyTo)} onClick={() => { setStepError(null); setMx(null); setStep("wl_name"); }}>
              Continue
            </IadmButton>
          </>
        );
      case "wl_name":
        return (
          <>
            {back("wl_reply")}
            <IadmButton variant="accent" product="spark" onClick={() => { setStepError(null); setStep("wl_mx"); }}>Continue</IadmButton>
          </>
        );
      case "wl_mx":
        return (
          <>
            {back("wl_name")}
            {/* A domain with no mail server is a dead end for replies, so
                Continue stays shut until they pick an address that works. */}
            {!mx || mx.can_receive === false ? (
              <IadmButton variant="primary" disabled={busy} onClick={runMxCheck}>
                {busy ? "Checking…" : mx ? "Check again" : "Check now"}
              </IadmButton>
            ) : (
              <IadmButton variant="accent" product="spark" disabled={busy} onClick={registerDomainAndLoadDns}>
                {busy ? "Setting up…" : "Continue"}
              </IadmButton>
            )}
          </>
        );
      case "wl_dns":
        return (
          <>
            {back("wl_mx")}
            <IadmButton data-tour="sender-verify" variant="accent" product="spark" onClick={() => { setStepError(null); setStep("wl_verify"); }}>
              I've added them — check
            </IadmButton>
          </>
        );
      case "wl_verify":
        return (
          <>
            {back("wl_dns")}
            <IadmButton variant="primary" disabled={busy} onClick={runWizardVerify}>{busy ? "Checking…" : wlVerify ? "Check again" : "Check now"}</IadmButton>
            <IadmButton variant="accent" product="spark" disabled={!wlVerified} onClick={() => { setStepError(null); setStep("wl_finish"); }}>
              Continue
            </IadmButton>
          </>
        );
      case "wl_finish":
        return <IadmButton variant="accent" product="spark" disabled={busy} onClick={() => setWizardOpen(false)}>Done</IadmButton>;

      default:
        return null;
    }
  }
}

/**
 * Pass/fail for one record card.
 *
 * ACS's verdict wins wherever it exists — it is the thing that decides whether
 * a send is accepted, and it is the ONLY source with a result for the
 * ownership record. Our own DNS probe is the fallback for the optional DMARC
 * row and for the case where ACS was unreachable.
 */
function recordState(key: RecordKey, v: VerifyData | null): boolean | null {
  if (!v) return null;
  const acsKey = ACS_KEY_FOR[key];
  if (acsKey && v.acs && v.acs[acsKey]) return String(v.acs[acsKey]?.status) === "Verified";
  const c = v.checks?.[key === "domain_ownership" ? "domain" : key];
  if (!c) return null;
  return !!c.found && c.ok !== false && (key !== "spf" || c.includes_acs !== false);
}

function RecordCard({ rk, rec, state, copiedKey, onCopy, prefix }: {
  rk: RecordKey; rec: DnsRecord; state: boolean | null;
  copiedKey: string | null; onCopy: (v: string, k: string) => void; prefix: string;
}) {
  const meta = RECORD_COPY[rk];
  const border = state === null ? "border-slate-200 bg-white"
    : state ? "border-emerald-200 bg-emerald-50/40"
    : "border-amber-200 bg-amber-50/40";
  return (
    <div className={`border-2 rounded p-3 ${border}`}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <div>
          <div className="text-sm font-semibold text-slate-800">
            {meta.label}
            {meta.optional && <span className="ml-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">optional</span>}
            <span className="ml-2 text-[10px] text-slate-500 font-mono">record type: {rec.type}</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">{meta.plain}</div>
        </div>
        {state !== null && (state
          ? <span className="text-[10px] shrink-0 inline-flex items-center gap-1 text-emerald-700 font-semibold"><Check className="h-3.5 w-3.5" /> Live</span>
          : <span className="text-[10px] shrink-0 inline-flex items-center gap-1 text-amber-700 font-semibold"><RefreshCw className="h-3.5 w-3.5" /> Not yet</span>)}
      </div>
      <div className="grid grid-cols-3 gap-2 mt-2">
        <Field label="Name / Host" value={rec.host} copyKey={`${prefix}-${rk}-host`} onCopy={onCopy} copiedKey={copiedKey} />
        <Field label="Value" value={rec.value} copyKey={`${prefix}-${rk}-value`} onCopy={onCopy} copiedKey={copiedKey} wide />
      </div>
      {rec.note && <div className="text-[10px] text-slate-500 italic mt-1">{rec.note}</div>}
    </div>
  );
}

function InboxPreview({ name, address }: { name: string; address: string }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-3">
      <div className="text-sm text-slate-900">
        <span className="font-semibold">{name}</span>
      </div>
      <div className="text-[12px] font-mono text-slate-500">{address}</div>
      <div className="text-sm text-slate-700 mt-1.5">Your subject line goes here</div>
      <div className="text-[12px] text-slate-400">The first line of the email shows up next to it…</div>
    </div>
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
