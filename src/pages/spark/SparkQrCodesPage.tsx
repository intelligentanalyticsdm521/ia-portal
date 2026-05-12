import { useEffect, useState, useCallback } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

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
  const [showCreate, setShowCreate] = useState(false);
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
      setShowCreate(false);
      setForm({ label: "", target_url: "", utm_source: "", utm_medium: "qr", utm_campaign: "" });
      await load();
    } catch (err) { setError(err); }
  }

  return (
    <OliverPageWrapper title="QR Codes" subtitle="Dynamic QR codes with scan tracking + UTM" error={error} loading={loading}>
      <div className="arion-page">
        <div className="card">
          <div className="card-hdr flex items-center justify-between">
            <div className="card-ttl">All codes</div>
            <button onClick={() => setShowCreate(true)} className="px-3 py-1.5 rounded-md text-sm bg-blue-600 text-white">+ New QR</button>
          </div>
          <table className="data-table">
            <thead><tr><th>Label</th><th>Short code</th><th>Target</th><th>UTM</th><th>Scans</th></tr></thead>
            <tbody>
              {list.map(q => (
                <tr key={q.id}>
                  <td className="font-medium">{q.label}</td>
                  <td className="font-mono text-xs">{q.short_code}</td>
                  <td className="text-xs text-blue-700 truncate max-w-[280px]">{q.target_url}</td>
                  <td className="text-xs text-gray-500">{[q.utm_source, q.utm_medium, q.utm_campaign].filter(Boolean).join(" / ") || "—"}</td>
                  <td className="text-sm font-medium">{q.scan_count}</td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={5} className="text-center py-4 text-gray-500">No QR codes yet</td></tr>}
            </tbody>
          </table>
        </div>

        {showCreate && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-5">
              <div className="text-lg font-semibold mb-3">Create QR code</div>
              <div className="space-y-3">
                <input placeholder="Label (e.g. Flyer Q2 2026)" value={form.label}
                  onChange={e => setForm({ ...form, label: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
                <input placeholder="Target URL" value={form.target_url}
                  onChange={e => setForm({ ...form, target_url: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
                <div className="grid grid-cols-3 gap-2">
                  <input placeholder="utm_source" value={form.utm_source} onChange={e => setForm({ ...form, utm_source: e.target.value })}
                    className="border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
                  <input placeholder="utm_medium" value={form.utm_medium} onChange={e => setForm({ ...form, utm_medium: e.target.value })}
                    className="border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
                  <input placeholder="utm_campaign" value={form.utm_campaign} onChange={e => setForm({ ...form, utm_campaign: e.target.value })}
                    className="border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 rounded-md text-sm border">Cancel</button>
                <button onClick={create} className="px-3 py-1.5 rounded-md text-sm bg-emerald-600 text-white">Create</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </OliverPageWrapper>
  );
}

export default SparkQrCodesPage;
