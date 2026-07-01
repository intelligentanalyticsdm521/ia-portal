import { useEffect, useState, useCallback, useRef } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { useAppState } from "../../app/AppState";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { SparkStatStrip } from "../../components/spark/SparkStatStrip";
import { SparkDrawer } from "../../components/spark/SparkDrawer";
import { SparkTable } from "../../components/spark/SparkTable";
import { Plus, QrCode, ExternalLink, Eye, User, Sparkles, Wand2, Pencil, Trash2, Download, X, Send, Copy, Mail, MessageSquare } from "lucide-react";
import { PhoneInput } from "../../components/PhoneInput";

interface QrCode {
  id: number;
  label: string;
  target_url: string;
  short_code: string;
  kind: "url" | "vcard";
  utm_source: string | null; utm_medium: string | null; utm_campaign: string | null;
  scan_count: number; is_active: boolean; created_at: string;
  vcard_first_name: string | null;
  vcard_last_name: string | null;
  vcard_title: string | null;
  vcard_company: string | null;
  vcard_phone: string | null;
  vcard_email: string | null;
  vcard_website: string | null;
  vcard_address: string | null;
  vcard_logo_url: string | null;
}

interface VCardForm {
  first_name: string; last_name: string;
  title: string; company: string;
  phone: string; email: string;
  website: string; address: string;
  logo_url: string;
}

interface AccountProfile {
  businessName: string | null;
  primaryContactEmail: string | null;
  primaryContactPhone: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
  brandColor: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
}

const EMPTY_VCARD: VCardForm = {
  first_name: "", last_name: "", title: "", company: "",
  phone: "", email: "", website: "", address: "", logo_url: "",
};

const LUMEN_API_BASE = (import.meta as { env: { VITE_LUMEN_API_BASE?: string } }).env.VITE_LUMEN_API_BASE
  || "https://app-lumen-api-prod-c6afftekgua4axh9.centralus-01.azurewebsites.net";

function publicCardUrl(shortCode: string) {
  return `${window.location.origin}/card/${shortCode}`;
}
function qrSvgUrl(shortCode: string) {
  return `${LUMEN_API_BASE}/api/v1/qr/render/${encodeURIComponent(shortCode)}.svg`;
}

function joinAddress(p: AccountProfile | null): string {
  if (!p) return "";
  const parts = [
    [p.addressLine1, p.addressLine2].filter(Boolean).join(", "),
    [p.city, p.state, p.postalCode].filter(Boolean).join(" "),
  ].filter(Boolean);
  return parts.join(", ");
}

export function SparkQrCodesPage() {
  const { get, post, put, del, ready } = useSparkApi();
  const { active: appActive } = useAppState();
  const [list, setList] = useState<QrCode[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState<"url" | "vcard" | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewing, setViewing] = useState<QrCode | null>(null);
  const [form, setForm] = useState({ label: "", target_url: "", utm_source: "", utm_medium: "qr", utm_campaign: "" });
  const [vcard, setVcard] = useState<VCardForm>(EMPTY_VCARD);
  const [vcardLabel, setVcardLabel] = useState("");

  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [prefilled, setPrefilled] = useState(false);
  const profileLoadedRef = useRef(false);

  // Send-card-by-channel state (inside viewer modal).
  const [sendChannel, setSendChannel] = useState<"email" | "sms">("email");
  const [sendRecipient, setSendRecipient] = useState("");
  const [sendMessage, setSendMessage] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<{ data: QrCode[] }>("/api/v1/qr-codes");
      setList(r.data || []);
    } catch (err) { setError(err); } finally { setLoading(false); }
  }, [get, ready]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!ready || profileLoadedRef.current) return;
    profileLoadedRef.current = true;
    (async () => {
      try {
        const r = await get<{ data: { profile: AccountProfile } }>("/api/v1/account/profile");
        if (r?.data?.profile) setProfile(r.data.profile);
      } catch { /* silent */ }
    })();
  }, [get, ready]);

  const buildPrefillFromProfile = useCallback((): VCardForm => {
    const u = appActive?.user;
    const p = profile;
    return {
      first_name: u?.firstName || "",
      last_name:  u?.lastName  || "",
      title:      "",
      company:    p?.businessName || "",
      phone:      p?.primaryContactPhone || "",
      email:      u?.email || p?.primaryContactEmail || "",
      website:    p?.websiteUrl || "",
      address:    joinAddress(p),
      logo_url:   p?.logoUrl || "",
    };
  }, [appActive, profile]);

  // Auto-prefill the vCard form on first open of a CREATE drawer (not edit).
  useEffect(() => {
    if (drawer !== "vcard" || editingId !== null) return;
    const isEmpty = !vcard.first_name && !vcard.last_name && !vcard.company
      && !vcard.email && !vcard.phone && !vcard.website && !vcard.title
      && !vcard.address && !vcard.logo_url;
    if (!isEmpty) return;
    const next = buildPrefillFromProfile();
    const filledSomething = !!(next.first_name || next.last_name || next.company
      || next.email || next.phone || next.website || next.address || next.logo_url);
    if (filledSomething) {
      setVcard(next);
      setPrefilled(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawer, editingId]);

  function resetVcardToProfile() {
    setVcard(buildPrefillFromProfile());
    setPrefilled(true);
  }

  function openCreateVcard() {
    setEditingId(null);
    setVcard(EMPTY_VCARD);
    setVcardLabel("");
    setPrefilled(false);
    setDrawer("vcard");
  }
  function openCreateUrl() {
    setEditingId(null);
    setForm({ label: "", target_url: "", utm_source: "", utm_medium: "qr", utm_campaign: "" });
    setDrawer("url");
  }
  function openEdit(q: QrCode) {
    setEditingId(q.id);
    setViewing(null);
    if (q.kind === "vcard") {
      setVcard({
        first_name: q.vcard_first_name || "",
        last_name:  q.vcard_last_name  || "",
        title:      q.vcard_title      || "",
        company:    q.vcard_company    || profile?.businessName || "",
        phone:      q.vcard_phone      || "",
        email:      q.vcard_email      || "",
        website:    q.vcard_website    || "",
        address:    q.vcard_address    || joinAddress(profile),
        // Logo always falls back to business profile so the card never ships
        // without the user's brand mark when one is on file.
        logo_url:   q.vcard_logo_url   || profile?.logoUrl || "",
      });
      setVcardLabel(q.label);
      setPrefilled(false);
      setDrawer("vcard");
    } else {
      setForm({
        label: q.label,
        target_url: q.target_url,
        utm_source: q.utm_source || "",
        utm_medium: q.utm_medium || "qr",
        utm_campaign: q.utm_campaign || "",
      });
      setDrawer("url");
    }
  }
  function closeDrawer() {
    setDrawer(null);
    setEditingId(null);
  }

  async function saveUrl() {
    if (!form.label.trim() || !form.target_url.trim()) return;
    try {
      if (editingId) {
        await put(`/api/v1/qr-codes/${editingId}`, form);
      } else {
        await post("/api/v1/qr-codes", form);
      }
      closeDrawer();
      await load();
    } catch (err) { setError(err); }
  }

  async function saveVcard() {
    if (!vcard.first_name && !vcard.email && !vcard.phone) return;
    const label = vcardLabel.trim()
      || `Business card — ${[vcard.first_name, vcard.last_name].filter(Boolean).join(" ")}`.trim();
    const payload = {
      label,
      kind: "vcard" as const,
      vcard_first_name: vcard.first_name || null,
      vcard_last_name:  vcard.last_name  || null,
      vcard_title:      vcard.title      || null,
      vcard_company:    vcard.company    || null,
      vcard_phone:      vcard.phone      || null,
      vcard_email:      vcard.email      || null,
      vcard_website:    vcard.website    || null,
      vcard_address:    vcard.address    || null,
      vcard_logo_url:   vcard.logo_url   || null,
      utm_source: "vcard", utm_medium: "qr", utm_campaign: "business_card",
    };
    try {
      if (editingId) {
        await put(`/api/v1/qr-codes/${editingId}`, payload);
      } else {
        await post("/api/v1/qr-codes", payload);
      }
      setVcard(EMPTY_VCARD);
      setVcardLabel("");
      setPrefilled(false);
      closeDrawer();
      await load();
    } catch (err) { setError(err); }
  }

  async function deleteQr(q: QrCode) {
    if (!confirm(`Delete "${q.label}"? This cannot be undone.`)) return;
    try {
      await del(`/api/v1/qr-codes/${q.id}`);
      setViewing(null);
      await load();
    } catch (err) { setError(err); }
  }

  async function downloadPng(shortCode: string, label: string) {
    try {
      const r = await fetch(qrSvgUrl(shortCode));
      const svgText = await r.text();
      const img = new Image();
      const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);
      img.onload = () => {
        const size = 1024;
        const canvas = document.createElement("canvas");
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, 0, 0, size, size);
        canvas.toBlob((blob) => {
          if (!blob) return;
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = `${label.replace(/[^a-z0-9-_]+/gi, "_")}-qr.png`;
          a.click();
          URL.revokeObjectURL(a.href);
        }, "image/png");
        URL.revokeObjectURL(url);
      };
      img.src = url;
    } catch (err) { setError(err); }
  }

  function copyCardUrl(shortCode: string) {
    const url = publicCardUrl(shortCode);
    navigator.clipboard?.writeText(url);
  }

  async function sendCard(q: QrCode) {
    if (!sendRecipient.trim()) return;
    setSendBusy(true); setSendResult(null);
    try {
      await post(`/api/v1/qr-codes/${q.id}/send`, {
        channel: sendChannel,
        recipient: sendRecipient.trim(),
        personalMessage: sendMessage.trim() || undefined,
      });
      setSendResult({ ok: true, text: `Sent to ${sendRecipient.trim()}.` });
      setSendRecipient("");
      setSendMessage("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Send failed";
      setSendResult({ ok: false, text: msg });
    } finally {
      setSendBusy(false);
    }
  }

  // Reset send-card state whenever the viewer opens/closes a different card.
  useEffect(() => {
    setSendChannel("email");
    setSendRecipient("");
    setSendMessage("");
    setSendResult(null);
    setSendBusy(false);
  }, [viewing?.id]);

  const totalScans = list.reduce((s, q) => s + q.scan_count, 0);
  const active = list.filter(q => q.is_active).length;

  return (
    <SparkPageShell
      title="QR Codes"
      subtitle="Dynamic QR codes with scan tracking + UTM"
      help={
        <>
          <strong className="block mb-1">Two QR code types:</strong>
          <strong>URL QR</strong> — scans redirect through SPARK and bump the scan counter, so you can track offline-to-online attribution (flyer, trade show, sign).
          <br /><br />
          <strong>Business Card QR</strong> — opens a mobile card page with your logo, contact info, and a "Save to Contacts" button. Edit your info anytime — the printed QR keeps working.
        </>
      }
      actions={
        <>
          <button onClick={openCreateVcard} className="spark-btn spark-btn-secondary">
            <User className="h-3.5 w-3.5" /> Business card
          </button>
          <button onClick={openCreateUrl} className="spark-btn spark-btn-accent">
            <Plus className="h-3.5 w-3.5" /> New URL QR
          </button>
        </>
      }
      stats={
        <SparkStatStrip stats={[
          { label: "Total codes", value: list.length, icon: QrCode },
          { label: "Active", value: active, accent: "emerald" },
          { label: "Total scans", value: totalScans.toLocaleString(), icon: Eye, accent: "blue" },
        ]} />
      }
      loading={loading}
      error={error}
    >
      <SparkTable<QrCode>
        rows={list}
        getRowKey={q => q.id}
        onRowClick={q => setViewing(q)}
        emptyState="No QR codes yet. Create one to start tracking offline-to-online attribution."
        totalCount={list.length}
        columns={[
          { key: "label", header: "Label", width: "wide",
            cell: q => (
              <span className="flex items-center gap-2">
                {q.kind === "vcard"
                  ? <User className="h-3.5 w-3.5 text-[#EF6C33]" />
                  : <QrCode className="h-3.5 w-3.5 text-slate-400" />}
                <span className="font-medium">{q.label}</span>
              </span>
            ),
          },
          { key: "short", header: "Short code", width: "compact",
            cell: q => <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">{q.short_code}</span>,
          },
          { key: "target", header: "Target", width: "wide", hideOnMobile: true,
            cell: q => (
              <a href={q.target_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                className="text-xs text-blue-600 truncate flex items-center gap-1 max-w-[280px]">
                <span className="truncate">{q.kind === "vcard" ? `card/${q.short_code}` : q.target_url}</span>
                <ExternalLink className="h-3 w-3 flex-shrink-0" />
              </a>
            ),
          },
          { key: "scans", header: "Scans", width: "narrow", align: "right",
            cell: q => <span className="font-semibold text-slate-900">{q.scan_count.toLocaleString()}</span>,
          },
          { key: "actions", header: "", width: "compact", align: "right",
            cell: q => (
              <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                <button onClick={() => setViewing(q)} title="View" className="p-1.5 hover:bg-slate-100 rounded">
                  <Eye className="h-3.5 w-3.5 text-slate-600" />
                </button>
                <button onClick={() => openEdit(q)} title="Edit" className="p-1.5 hover:bg-slate-100 rounded">
                  <Pencil className="h-3.5 w-3.5 text-slate-600" />
                </button>
                <button onClick={() => deleteQr(q)} title="Delete" className="p-1.5 hover:bg-red-50 rounded">
                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                </button>
              </div>
            ),
          },
        ]}
      />

      {/* VIEWER MODAL — shows the QR + actions */}
      {viewing && (
        <div className="fixed inset-0 z-[100] bg-slate-900/70 flex items-center justify-center p-4" onClick={() => setViewing(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <div>
                <div className="text-sm font-semibold text-slate-900">{viewing.label}</div>
                <div className="text-xs text-slate-500 font-mono">{viewing.short_code}</div>
              </div>
              <button onClick={() => setViewing(null)} className="p-1.5 hover:bg-slate-100 rounded">
                <X className="h-4 w-4 text-slate-500" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-white border-2 border-slate-100 rounded-lg p-4 flex justify-center">
                <img src={qrSvgUrl(viewing.short_code)} alt="QR code" className="w-full max-w-[320px] h-auto" />
              </div>

              {viewing.kind === "vcard" && (
                <div className="bg-slate-50 border border-slate-200 rounded-md p-3 text-xs space-y-1.5">
                  {(viewing.vcard_first_name || viewing.vcard_last_name) && (
                    <div><span className="text-slate-500">Name:</span> <span className="font-medium text-slate-900">{[viewing.vcard_first_name, viewing.vcard_last_name].filter(Boolean).join(" ")}</span></div>
                  )}
                  {viewing.vcard_title && <div><span className="text-slate-500">Title:</span> <span className="text-slate-900">{viewing.vcard_title}</span></div>}
                  {viewing.vcard_company && <div><span className="text-slate-500">Business:</span> <span className="text-slate-900">{viewing.vcard_company}</span></div>}
                  {viewing.vcard_phone && <div><span className="text-slate-500">Phone:</span> <span className="text-slate-900">{viewing.vcard_phone}</span></div>}
                  {viewing.vcard_email && <div><span className="text-slate-500">Email:</span> <span className="text-slate-900">{viewing.vcard_email}</span></div>}
                  {viewing.vcard_website && <div><span className="text-slate-500">Website:</span> <span className="text-slate-900">{viewing.vcard_website}</span></div>}
                  {viewing.vcard_address && <div><span className="text-slate-500">Address:</span> <span className="text-slate-900">{viewing.vcard_address}</span></div>}
                </div>
              )}

              {viewing.kind === "vcard" && (
                <div className="border border-slate-200 rounded-md p-3 text-xs bg-white">
                  <div className="flex items-center gap-1.5 font-semibold mb-2 text-slate-900">
                    <Send className="h-3.5 w-3.5 text-[#EF6C33]" /> Send my card
                  </div>
                  <div className="flex gap-1.5 mb-2">
                    <button onClick={() => setSendChannel("email")}
                      className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded border text-xs ${sendChannel === "email" ? "bg-[#EF6C33] text-white border-[#EF6C33]" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`}>
                      <Mail className="h-3 w-3" /> Email
                    </button>
                    <button onClick={() => setSendChannel("sms")} disabled
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded border text-xs bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed"
                      title="SMS arrives with SPARK 1.0.1">
                      <MessageSquare className="h-3 w-3" /> SMS <span className="text-[10px]">(soon)</span>
                    </button>
                  </div>
                  <input
                    type={sendChannel === "email" ? "email" : "tel"}
                    placeholder={sendChannel === "email" ? "recipient@example.com" : "(555) 123-4567"}
                    value={sendRecipient}
                    onChange={e => setSendRecipient(e.target.value)}
                    className="w-full mb-1.5 px-2 py-1.5 border border-slate-200 rounded text-xs"
                  />
                  <textarea
                    placeholder="Optional message…"
                    value={sendMessage}
                    onChange={e => setSendMessage(e.target.value)}
                    rows={2}
                    className="w-full mb-2 px-2 py-1.5 border border-slate-200 rounded text-xs resize-none"
                  />
                  <button onClick={() => sendCard(viewing)} disabled={!sendRecipient.trim() || sendBusy}
                    className="w-full spark-btn spark-btn-primary justify-center disabled:opacity-50">
                    <Send className="h-3.5 w-3.5" /> {sendBusy ? "Sending…" : "Send card"}
                  </button>
                  {sendResult && (
                    <div className={`mt-2 px-2 py-1.5 rounded text-xs ${sendResult.ok ? "bg-emerald-50 text-emerald-900 border border-emerald-200" : "bg-red-50 text-red-900 border border-red-200"}`}>
                      {sendResult.text}
                    </div>
                  )}
                  <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                    <span className="truncate">Or share the link:</span>
                    <button onClick={() => copyCardUrl(viewing.short_code)} className="inline-flex items-center gap-1 text-[#EF6C33] hover:underline font-medium flex-shrink-0">
                      <Copy className="h-3 w-3" /> Copy
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => downloadPng(viewing.short_code, viewing.label)} className="spark-btn spark-btn-secondary justify-center">
                  <Download className="h-3.5 w-3.5" /> Download PNG
                </button>
                <a href={publicCardUrl(viewing.short_code)} target="_blank" rel="noreferrer" className="spark-btn spark-btn-secondary justify-center">
                  <ExternalLink className="h-3.5 w-3.5" /> Open card
                </a>
                <button onClick={() => openEdit(viewing)} className="spark-btn spark-btn-primary justify-center">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                <button onClick={() => deleteQr(viewing)} className="spark-btn spark-btn-secondary justify-center text-red-600 hover:bg-red-50">
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* URL QR DRAWER */}
      <SparkDrawer
        open={drawer === "url"}
        onClose={closeDrawer}
        title={editingId ? "Edit URL QR code" : "Create URL QR code"}
        subtitle="Dynamic redirect with scan tracking. Add UTM params for marketing attribution."
        footer={
          <>
            <button onClick={closeDrawer} className="spark-btn spark-btn-secondary">Cancel</button>
            <button onClick={saveUrl} disabled={!form.label.trim() || !form.target_url.trim()} className="spark-btn spark-btn-primary">
              {editingId ? "Save changes" : "Create QR code"}
            </button>
          </>
        }
      >
        <div className="spark-field">
          <label className="spark-field-label">Label</label>
          <input className="spark-field-input" value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="Spring flyer / Trade show 2026" autoFocus />
        </div>
        <div className="spark-field">
          <label className="spark-field-label">Target URL</label>
          <input className="spark-field-input" value={form.target_url} onChange={e => setForm({ ...form, target_url: e.target.value })} placeholder="https://your-site.com/landing-page" />
        </div>
        <div className="spark-field">
          <label className="spark-field-label">UTM parameters</label>
          <div className="grid grid-cols-3 gap-2">
            <input className="spark-field-input" placeholder="source" value={form.utm_source} onChange={e => setForm({ ...form, utm_source: e.target.value })} />
            <input className="spark-field-input" placeholder="medium" value={form.utm_medium} onChange={e => setForm({ ...form, utm_medium: e.target.value })} />
            <input className="spark-field-input" placeholder="campaign" value={form.utm_campaign} onChange={e => setForm({ ...form, utm_campaign: e.target.value })} />
          </div>
        </div>
      </SparkDrawer>

      {/* BUSINESS CARD vCard drawer */}
      <SparkDrawer
        open={drawer === "vcard"}
        onClose={closeDrawer}
        title={editingId ? "Edit business card" : "Business card QR"}
        subtitle="Scan opens a mobile card page with your logo + contact info. Edit anytime — the QR keeps working."
        footer={
          <>
            <button onClick={closeDrawer} className="spark-btn spark-btn-secondary">Cancel</button>
            <button onClick={saveVcard} disabled={!vcard.first_name && !vcard.email && !vcard.phone} className="spark-btn spark-btn-primary">
              <Sparkles className="h-3.5 w-3.5" /> {editingId ? "Save changes" : "Generate business card QR"}
            </button>
          </>
        }
      >
        {!editingId && prefilled && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 mb-1">
            <div className="text-xs text-emerald-800 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 flex-shrink-0" />
              <span>Auto-filled from your account &amp; business profile — edit anything below.</span>
            </div>
            <button type="button" onClick={resetVcardToProfile}
              className="text-[11px] text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1 flex-shrink-0 font-medium"
              title="Reset to profile defaults">
              <Wand2 className="h-3 w-3" /> Reset
            </button>
          </div>
        )}
        {!editingId && !prefilled && profile && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 mb-1">
            <span className="text-xs text-slate-600">Want to start from your account info?</span>
            <button type="button" onClick={resetVcardToProfile}
              className="text-[11px] text-[#EF6C33] hover:underline inline-flex items-center gap-1 flex-shrink-0 font-medium">
              <Wand2 className="h-3 w-3" /> Fill from my profile
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="spark-field">
            <label className="spark-field-label">First name</label>
            <input className="spark-field-input" value={vcard.first_name} onChange={e => setVcard({ ...vcard, first_name: e.target.value })} autoFocus />
          </div>
          <div className="spark-field">
            <label className="spark-field-label">Last name</label>
            <input className="spark-field-input" value={vcard.last_name} onChange={e => setVcard({ ...vcard, last_name: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="spark-field">
            <label className="spark-field-label">Title</label>
            <input className="spark-field-input" value={vcard.title} onChange={e => setVcard({ ...vcard, title: e.target.value })} placeholder="Founder" />
          </div>
          <div className="spark-field">
            <label className="spark-field-label">Business</label>
            <input className="spark-field-input" value={vcard.company} onChange={e => setVcard({ ...vcard, company: e.target.value })} />
          </div>
        </div>
        <div className="spark-field">
          <label className="spark-field-label">Phone (mobile)</label>
          <PhoneInput className="spark-field-input" value={vcard.phone} onChange={v => setVcard({ ...vcard, phone: v })} placeholder="(555) 867-5309" />
        </div>
        <div className="spark-field">
          <label className="spark-field-label">Email</label>
          <input type="email" className="spark-field-input" value={vcard.email} onChange={e => setVcard({ ...vcard, email: e.target.value })} />
        </div>
        <div className="spark-field">
          <label className="spark-field-label">Website</label>
          <input className="spark-field-input" value={vcard.website} onChange={e => setVcard({ ...vcard, website: e.target.value })} placeholder="https://yourcompany.com" />
        </div>
        <div className="spark-field">
          <label className="spark-field-label">Address</label>
          <input className="spark-field-input" value={vcard.address} onChange={e => setVcard({ ...vcard, address: e.target.value })} placeholder="123 Main St, Des Moines IA 50309" />
        </div>
        <div className="spark-field">
          <label className="spark-field-label">Logo</label>
          {vcard.logo_url ? (
            <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-3">
              <img src={vcard.logo_url} alt="" className="h-14 w-14 object-contain rounded bg-white border border-slate-100" />
              <div className="flex-1 min-w-0 text-xs text-slate-600">
                <div className="font-medium text-slate-900">From your business profile</div>
                <div className="text-slate-500">Change in Settings → Business Profile to update everywhere.</div>
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-600">
              No logo on your business profile yet. Upload one in
              <span className="font-medium text-slate-800"> Settings → Business Profile</span> and it appears here automatically.
            </div>
          )}
        </div>
        {editingId && (
          <div className="spark-field">
            <label className="spark-field-label">Label (internal)</label>
            <input className="spark-field-input" value={vcardLabel} onChange={e => setVcardLabel(e.target.value)} placeholder="Business card — Brandon Sheriff" />
          </div>
        )}
        <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-md p-3">
          <strong className="block text-slate-700 mb-1">How this works:</strong>
          The QR encodes a public link to your card page. When scanned, the recipient sees your logo + contact info + a "Save to Contacts" button. Update your info anytime — the printed QR keeps pointing to the latest version.
        </div>
      </SparkDrawer>
    </SparkPageShell>
  );
}

export default SparkQrCodesPage;
