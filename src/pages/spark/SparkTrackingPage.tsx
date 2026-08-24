// SparkTrackingPage — Install the visitor tracking pixel + page-visit triggers.
//
// Shows the copy-paste script tag with the tenant's ID baked in, plus an
// activity feed of recent tracked events so the user can verify it's working.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { useMsal } from "@azure/msal-react";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Copy, Check, Eye, Globe } from "lucide-react";

interface Touchpoint {
  id: number;
  contact_id: number;
  channel: string;
  source: string | null;
  campaign: string | null;
  page_url: string | null;
  occurred_at: string;
}

function tenantIdFromMsalToken(token: string | undefined): string {
  if (!token) return "";
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.tid || "";
  } catch { return ""; }
}

export function SparkTrackingPage() {
  const { get, ready } = useSparkApi();
  const { instance, accounts } = useMsal();
  const [tenantId, setTenantId] = useState<string>("");
  const [touchpoints, setTouchpoints] = useState<Touchpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [copied, setCopied] = useState<"snippet" | "url" | null>(null);

  const apiBase = useMemo(() => {
    return (import.meta.env.VITE_SPARK_API_BASE as string) ||
           (import.meta.env.VITE_LUMEN_API_BASE as string) ||
           "https://app-lumen-api-prod-c6afftekgua4axh9.centralus-01.azurewebsites.net";
  }, []);

  // Resolve tenant ID from MSAL token without making a network call
  useEffect(() => {
    (async () => {
      const account = accounts[0];
      if (!account) return;
      try {
        const r = await instance.acquireTokenSilent({ account, scopes: [] });
        setTenantId(tenantIdFromMsalToken(r.accessToken));
      } catch { /* no-op */ }
    })();
  }, [instance, accounts]);

  const fetchRecent = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      // Pull a small recent feed of touchpoints to verify the pixel is firing.
      // We use the first contact with recent journey data as a proxy.
      const r = await get<{ data: Touchpoint[] }>("/api/v1/attribution/journey/0").catch(() => null);
      setTouchpoints(r?.data || []);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready]);

  useEffect(() => { fetchRecent(); }, [fetchRecent]);

  const pixelUrl = tenantId ? `${apiBase}/api/v1/tracking/pixel.js?t=${tenantId}` : "";
  const snippet = tenantId
    ? `<!-- IADM SPARK visitor tracking -->\n<script async src="${pixelUrl}"></script>`
    : "<!-- Loading… -->";

  async function copyText(text: string, kind: "snippet" | "url") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind); setTimeout(() => setCopied(null), 2000);
    } catch (e) { alert("Copy failed: " + (e as Error).message); }
  }

  return (
    <SparkPageShell
      title="Visitor tracking"
      subtitle="Install a 1-line snippet to track page visits, attribute touches, and fire scoring rules"
      help="Paste the snippet into your website's HTML (before the closing </body> tag, or via Google Tag Manager). Every pageview becomes an attribution_touchpoint correlated to the visitor's email (if known from a campaign link) and fires any page.visited scoring rules you've defined."
      loading={loading}
      error={error}
    >
      {/* Snippet card */}
      <div className="spark-mini-card">
        <div className="spark-mini-card-header">
          <span className="spark-mini-card-title flex items-center gap-1"><Globe className="h-4 w-4" /> Install snippet</span>
          <span className="text-xs text-slate-500">Paste before <code>&lt;/body&gt;</code></span>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">HTML snippet</label>
            <div className="relative">
              <pre className="font-mono text-xs bg-slate-900 text-slate-100 p-3 rounded border border-slate-700 overflow-x-auto whitespace-pre-wrap">{snippet}</pre>
              <button onClick={() => copyText(snippet, "snippet")}
                className="absolute top-2 right-2 text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white flex items-center gap-1">
                {copied === "snippet" ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
              </button>
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Or use this URL with Google Tag Manager</label>
            <div className="flex gap-1">
              <input readOnly value={pixelUrl} className="flex-1 text-xs font-mono bg-slate-50 border border-slate-200 rounded p-1.5" />
              <button onClick={() => copyText(pixelUrl, "url")}
                className="text-xs px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 flex items-center gap-1">
                {copied === "url" ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
        <Card title="1. Cookie drop" body="Sets a first-party __ia_vid cookie so we can stitch repeat visits before the visitor identifies themselves." />
        <Card title="2. Email correlation" body="When a visitor arrives via a campaign link with ?em=jane@acme.com, that email is cached and used to look up their contact record." />
        {/* Sept-A F5: sessionized. Was "every pageview creates a touchpoint",
            which stopped being true when repeat views on one channel started
            collapsing into a single touch — otherwise a visitor reading ten
            pages would swamp the attribution models. */}
        <Card title="3. Touchpoint + scoring" body="A visit records an attribution touchpoint — repeat views on the same channel within 30 minutes count once, so a browsing session is a single touch. Each pageview still fires any page.visited scoring rule whose url_contains condition matches." />
      </div>

      {/* Recent activity */}
      <div className="spark-mini-card mt-3">
        <div className="spark-mini-card-header">
          <span className="spark-mini-card-title flex items-center gap-1"><Eye className="h-4 w-4" /> Recent tracked events</span>
          <button onClick={fetchRecent} className="text-xs text-[#EF6C33] hover:underline">Refresh</button>
        </div>
        <div className="p-3">
          {touchpoints.length === 0 ? (
            <div className="text-sm text-slate-500 italic text-center py-4">
              No tracked events yet. Once the snippet is live and a contact-identified visit happens, it'll show up here.
              <br /><span className="text-[10px]">Use ?em=test@example.com in a URL to manually identify a visit during testing.</span>
            </div>
          ) : (
            <ul className="text-xs space-y-1">
              {touchpoints.slice(0, 10).map(t => (
                <li key={t.id} className="border-b border-slate-100 pb-1">
                  <span className="font-semibold capitalize">{t.channel}</span>
                  <span className="text-slate-400 mx-1">·</span>
                  <span className="text-slate-700">{t.page_url || "(no url)"}</span>
                  <span className="text-slate-400 mx-1">·</span>
                  <span className="text-[10px] text-slate-500">{new Date(t.occurred_at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </SparkPageShell>
  );
}

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div className="border border-slate-200 rounded p-3 bg-white">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="text-xs text-slate-600 mt-1">{body}</div>
    </div>
  );
}

export default SparkTrackingPage;
