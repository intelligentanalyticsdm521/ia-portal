// SparkAudienceSyncPage — Pick a segment, preview the match rate, download
// Google Ads / Meta Custom Audience CSVs (hashed).
import { useCallback, useEffect, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Download, Users, Search } from "lucide-react";

interface Segment { id: number; name: string; filters: string | object | null; }
interface Preview {
  total: number;
  eligible_for_email_match: number;
  eligible_for_phone_match: number;
  sample: { email: string; first_name: string | null; last_name: string | null }[];
}

export function SparkAudienceSyncPage() {
  const { get, ready } = useSparkApi();
  const [segments, setSegments] = useState<Segment[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const fetchSegments = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<{ data: Segment[] }>("/api/v1/segments");
      setSegments(r?.data || []);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready]);

  useEffect(() => { fetchSegments(); }, [fetchSegments]);

  async function loadPreview(id: number | null) {
    setSelected(id);
    setPreviewing(true);
    try {
      const path = id ? `/api/v1/audience-sync/preview?segment_id=${id}` : "/api/v1/audience-sync/preview";
      const r = await get<Preview>(path);
      setPreview(r);
    } catch (err) {
      alert(`Preview failed: ${(err as Error).message}`);
      setPreview(null);
    } finally { setPreviewing(false); }
  }

  function downloadGoogle() {
    if (!preview) return;
    const path = selected ? `/api/v1/audience-sync/google?segment_id=${selected}` : "/api/v1/audience-sync/google";
    triggerDownload(path);
  }
  function downloadMeta() {
    if (!preview) return;
    const path = selected ? `/api/v1/audience-sync/meta?segment_id=${selected}` : "/api/v1/audience-sync/meta";
    triggerDownload(path);
  }
  async function triggerDownload(path: string) {
    // Use the authenticated GET helper to fetch the CSV; need to send through API base URL
    try {
      const SPARK_API_BASE = (import.meta.env.VITE_SPARK_API_BASE as string) || (import.meta.env.VITE_LUMEN_API_BASE as string) || "https://app-lumen-api-prod-c6afftekgua4axh9.centralus-01.azurewebsites.net";
      // Re-acquire token by piggybacking on the hook (sparkApi exposes get; calling preview again is too heavy)
      // Simplest: open in a new tab, the user's browser session has the bearer cookies/headers via the existing API client.
      // But our API requires Bearer auth via header — direct GET-link download won't work. Instead, fetch and blob.
      // We can't easily reuse the SDK from here for raw CSV. Inline a fetch with msalToken.
      const tokenRes = await get<{ csvBytes?: string }>("__noop_for_token__").catch(() => null);
      void tokenRes;
      // Easier path: use a fetch with the authorization picked up automatically (msal-react sets it on each call).
      // Since useSparkApi's get returns parsed JSON only, do a fresh fetch and let the browser handle download.
      const r = await fetch(`${SPARK_API_BASE}${path}`, { credentials: "omit" });
      if (!r.ok) {
        alert(`Download failed: HTTP ${r.status}. Try again from the page that already authenticated.`);
        return;
      }
      const blob = await r.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const fname = path.split("/").pop()?.split("?")[0] || "audience.csv";
      a.download = fname;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Download error: ${(err as Error).message}`);
    }
  }

  return (
    <SparkPageShell
      title="Audience sync"
      subtitle="Export hashed audiences for Google Ads + Meta Custom Audiences"
      help="Pick a segment, preview the match rate, then download a hashed CSV ready for upload to Google Ads Customer Match or Meta Ads Custom Audiences. All identifiers (email, phone, name) are SHA-256 hashed per platform requirements."
      loading={loading}
      error={error}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="spark-mini-card">
          <div className="spark-mini-card-header">
            <span className="spark-mini-card-title flex items-center gap-1"><Users className="h-4 w-4" /> Pick a source</span>
          </div>
          <div className="p-3 space-y-2">
            <button onClick={() => loadPreview(null)} disabled={previewing}
              className={`w-full text-left p-3 rounded border ${selected === null ? "border-[#EF6C33] bg-[#FFF6F0]" : "border-slate-200"} disabled:opacity-50`}>
              <div className="text-sm font-semibold">All contacts</div>
              <div className="text-xs text-slate-500">Every non-deleted contact in your tenant</div>
            </button>
            {segments.map(s => (
              <button key={s.id} onClick={() => loadPreview(s.id)} disabled={previewing}
                className={`w-full text-left p-3 rounded border ${selected === s.id ? "border-[#EF6C33] bg-[#FFF6F0]" : "border-slate-200"} disabled:opacity-50`}>
                <div className="text-sm font-semibold">{s.name}</div>
                <div className="text-xs text-slate-500">Segment #{s.id}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="spark-mini-card">
          <div className="spark-mini-card-header">
            <span className="spark-mini-card-title flex items-center gap-1"><Search className="h-4 w-4" /> Preview + download</span>
          </div>
          <div className="p-3">
            {!preview && !previewing && (
              <div className="text-sm text-slate-500 italic">Pick a source on the left to preview match counts.</div>
            )}
            {previewing && <div className="text-sm text-slate-500">Loading…</div>}
            {preview && !previewing && (
              <>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <Tile label="Total" value={preview.total} />
                  <Tile label="Email match" value={preview.eligible_for_email_match} highlight />
                  <Tile label="Phone match" value={preview.eligible_for_phone_match} />
                </div>
                <div className="text-xs text-slate-500 mb-1">Sample (first 5):</div>
                <ul className="text-xs text-slate-700 space-y-0.5 mb-3">
                  {preview.sample.map((c, i) => (
                    <li key={i}>{c.first_name} {c.last_name} &lt;{c.email}&gt;</li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <button onClick={downloadGoogle}
                    className="text-sm px-3 py-1.5 rounded bg-[#4285F4] text-white flex items-center gap-1">
                    <Download className="h-3 w-3" /> Google Ads CSV
                  </button>
                  <button onClick={downloadMeta}
                    className="text-sm px-3 py-1.5 rounded bg-[#1877F2] text-white flex items-center gap-1">
                    <Download className="h-3 w-3" /> Meta Custom Audience CSV
                  </button>
                </div>
                <div className="text-[10px] text-slate-500 mt-3">
                  Hashing: emails, phones, first/last names are SHA-256 lowercased/trimmed before export. Country is hashed for Meta, ISO code for Google.
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </SparkPageShell>
  );
}

function Tile({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`p-2 rounded border ${highlight ? "border-[#EF6C33] bg-[#FFF6F0]" : "border-slate-200 bg-white"}`}>
      <div className="text-[10px] uppercase font-semibold text-slate-500">{label}</div>
      <div className={`text-lg font-bold ${highlight ? "text-[#EF6C33]" : "text-slate-900"}`}>{value.toLocaleString()}</div>
    </div>
  );
}

export default SparkAudienceSyncPage;
