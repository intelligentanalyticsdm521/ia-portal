import { useEffect, useState, useCallback } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { SparkStatStrip } from "../../components/spark/SparkStatStrip";
import { SparkDrawer } from "../../components/spark/SparkDrawer";
import { SparkTable } from "../../components/spark/SparkTable";
import { Plus, QrCode, ExternalLink, Eye } from "lucide-react";

interface QrCode {
  id: number; label: string; target_url: string; short_code: string;
  utm_source: string | null; utm_medium: string | null; utm_campaign: string | null;
  scan_count: number; is_active: boolean; created_at: string;
}

export function SparkQrCodesPage() {
  const { get, post, ready } = useSparkApi();
  const [list, setList] = useState<QrCode[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState({ label: "", target_url: "", utm_source: "", utm_medium: "qr", utm_campaign: "" });

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
      setDrawerOpen(false);
      await load();
    } catch (err) { setError(err); }
  }

  const totalScans = list.reduce((s, q) => s + q.scan_count, 0);
  const active = list.filter(q => q.is_active).length;

  return (
    <SparkPageShell
      title="QR Codes"
      subtitle="Dynamic QR codes with scan tracking + UTM"
      actions={
        <button onClick={() => setDrawerOpen(true)} className="spark-btn spark-btn-accent">
          <Plus className="h-3.5 w-3.5" /> New QR
        </button>
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
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Create QR code"
        subtitle="Dynamic redirect with scan tracking. Add UTM params for marketing attribution."
        footer={
          <>
            <button onClick={() => setDrawerOpen(false)} className="spark-btn spark-btn-secondary">Cancel</button>
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
    </SparkPageShell>
  );
}

export default SparkQrCodesPage;
