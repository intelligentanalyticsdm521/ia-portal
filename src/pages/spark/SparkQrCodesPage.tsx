import { useEffect, useState, useCallback } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { SparkStatStrip } from "../../components/spark/SparkStatStrip";
import { SparkDrawer } from "../../components/spark/SparkDrawer";
import { SparkTable } from "../../components/spark/SparkTable";
import { Plus, QrCode, ExternalLink, Eye, User, Sparkles } from "lucide-react";

interface QrCode {
  id: number; label: string; target_url: string; short_code: string;
  utm_source: string | null; utm_medium: string | null; utm_campaign: string | null;
  scan_count: number; is_active: boolean; created_at: string;
}

interface VCardForm {
  first_name: string; last_name: string;
  title: string; company: string;
  phone: string; email: string;
  website: string;
}

/**
 * Build a vCard 3.0 data URI from the form. When the QR is scanned the phone
 * recognizes the BEGIN:VCARD payload and offers "Add to contacts" automatically.
 *
 * This is the "Intelligent Analytics Business Card" pattern — encode the vCard
 * directly into the QR's target instead of going through a redirect URL.
 */
function buildVcardDataUri(v: VCardForm): string {
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${v.last_name};${v.first_name}`,
    `FN:${v.first_name} ${v.last_name}`.trim(),
    v.company && `ORG:${v.company}`,
    v.title && `TITLE:${v.title}`,
    v.phone && `TEL;TYPE=CELL:${v.phone}`,
    v.email && `EMAIL:${v.email}`,
    v.website && `URL:${v.website}`,
    "END:VCARD",
  ].filter(Boolean).join("\n");
  return "data:text/vcard;charset=utf-8," + encodeURIComponent(lines);
}

export function SparkQrCodesPage() {
  const { get, post, ready } = useSparkApi();
  const [list, setList] = useState<QrCode[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState<"url" | "vcard" | null>(null);
  const [form, setForm] = useState({ label: "", target_url: "", utm_source: "", utm_medium: "qr", utm_campaign: "" });
  const [vcard, setVcard] = useState<VCardForm>({
    first_name: "", last_name: "", title: "", company: "",
    phone: "", email: "", website: "",
  });

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<{ data: QrCode[] }>("/api/v1/qr-codes");
      setList(r.data || []);
    } catch (err) { setError(err); } finally { setLoading(false); }
  }, [get, ready]);
  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!form.label.trim() || !form.target_url.trim()) return;
    try {
      await post("/api/v1/qr-codes", form);
      setForm({ label: "", target_url: "", utm_source: "", utm_medium: "qr", utm_campaign: "" });
      setDrawer(null);
      await load();
    } catch (err) { setError(err); }
  }

  async function createVcard() {
    if (!vcard.first_name && !vcard.email && !vcard.phone) return;
    const dataUri = buildVcardDataUri(vcard);
    try {
      await post("/api/v1/qr-codes", {
        label: `Business card — ${vcard.first_name} ${vcard.last_name}`.trim(),
        target_url: dataUri,
        utm_source: "vcard",
        utm_medium: "qr",
        utm_campaign: "business_card",
      });
      setVcard({ first_name: "", last_name: "", title: "", company: "", phone: "", email: "", website: "" });
      setDrawer(null);
      await load();
    } catch (err) { setError(err); }
  }

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
          <strong>Business Card QR</strong> — encodes a vCard directly. When scanned, the phone offers "Add to Contacts" with your name / title / phone / email / company — no app needed.
        </>
      }
      actions={
        <>
          <button onClick={() => setDrawer("vcard")} className="spark-btn spark-btn-secondary">
            <User className="h-3.5 w-3.5" /> Business card
          </button>
          <button onClick={() => setDrawer("url")} className="spark-btn spark-btn-accent">
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
        emptyState="No QR codes yet. Create one to start tracking offline-to-online attribution."
        totalCount={list.length}
        columns={[
          { key: "label", header: "Label", width: "wide",
            cell: q => <span className="font-medium">{q.label}</span>,
          },
          { key: "short", header: "Short code", width: "compact",
            cell: q => <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">{q.short_code}</span>,
          },
          { key: "target", header: "Target URL", width: "wide", hideOnMobile: true,
            cell: q => (
              <a href={q.target_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                className="text-xs text-blue-600 truncate flex items-center gap-1 max-w-[280px]">
                <span className="truncate">{q.target_url}</span>
                <ExternalLink className="h-3 w-3 flex-shrink-0" />
              </a>
            ),
          },
          { key: "utm", header: "UTM", hideOnMobile: true,
            cell: q => <span className="text-xs text-slate-500">{[q.utm_source, q.utm_medium, q.utm_campaign].filter(Boolean).join(" / ") || "—"}</span>,
          },
          { key: "scans", header: "Scans", width: "narrow", align: "right",
            cell: q => <span className="font-semibold text-slate-900">{q.scan_count.toLocaleString()}</span>,
          },
        ]}
      />

      <SparkDrawer
        open={drawer === "url"}
        onClose={() => setDrawer(null)}
        title="Create URL QR code"
        subtitle="Dynamic redirect with scan tracking. Add UTM params for marketing attribution."
        footer={
          <>
            <button onClick={() => setDrawer(null)} className="spark-btn spark-btn-secondary">Cancel</button>
            <button onClick={create} disabled={!form.label.trim() || !form.target_url.trim()} className="spark-btn spark-btn-primary">Create QR code</button>
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
        onClose={() => setDrawer(null)}
        title="Business card QR"
        subtitle="When scanned, the recipient's phone offers 'Add to Contacts' with your info — no app required."
        footer={
          <>
            <button onClick={() => setDrawer(null)} className="spark-btn spark-btn-secondary">Cancel</button>
            <button onClick={createVcard} disabled={!vcard.first_name && !vcard.email && !vcard.phone} className="spark-btn spark-btn-primary">
              <Sparkles className="h-3.5 w-3.5" /> Generate business card QR
            </button>
          </>
        }
      >
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
            <label className="spark-field-label">Company</label>
            <input className="spark-field-input" value={vcard.company} onChange={e => setVcard({ ...vcard, company: e.target.value })} />
          </div>
        </div>
        <div className="spark-field">
          <label className="spark-field-label">Phone (mobile)</label>
          <input type="tel" className="spark-field-input" value={vcard.phone} onChange={e => setVcard({ ...vcard, phone: e.target.value })} placeholder="+1 555-867-5309" />
        </div>
        <div className="spark-field">
          <label className="spark-field-label">Email</label>
          <input type="email" className="spark-field-input" value={vcard.email} onChange={e => setVcard({ ...vcard, email: e.target.value })} />
        </div>
        <div className="spark-field">
          <label className="spark-field-label">Website</label>
          <input className="spark-field-input" value={vcard.website} onChange={e => setVcard({ ...vcard, website: e.target.value })} placeholder="https://yourcompany.com" />
        </div>
        <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-md p-3">
          <strong className="block text-slate-700 mb-1">How this works:</strong>
          The QR encodes a vCard 3.0 payload directly (BEGIN:VCARD…END:VCARD). When scanned, iOS / Android offers an "Add to Contacts" prompt with everything pre-filled. No tracking redirect — the QR is a self-contained business card.
        </div>
      </SparkDrawer>
    </SparkPageShell>
  );
}

export default SparkQrCodesPage;
