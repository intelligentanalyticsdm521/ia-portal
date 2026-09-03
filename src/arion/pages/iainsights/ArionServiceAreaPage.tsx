// ArionServiceAreaPage — Tenant service area config (v5.15).
//
// Visibility & Reach trend engine performs a geographic relevance check
// against this config. Sessions from outside the service area are flagged
// as non-converting noise so the engine can compute the "effective local-
// only impression-to-visit ratio" called out in the handoff doc.
import { useCallback, useEffect, useState } from "react";
import { useArionContext } from "../../useArionContext";
import { useAccessToken } from "../../../auth/useAccessToken";
import { useAppState } from "../../../app/AppState";
import { MapPin, Save, Check, Trash2, Briefcase } from "lucide-react";
import { getIaInsightsServiceArea, putIaInsightsServiceArea } from "../../../lib/arionApi";

interface ServiceArea {
  city?: string;
  state?: string;
  regions?: string[];
  zips?: string[];
}

const SERVICE_CATEGORIES: Array<{ value: string; label: string; description: string }> = [
  { value: "home_services", label: "Home Services", description: "Plumbing, HVAC, roofing, landscaping, cleaning, etc." },
  { value: "legal", label: "Legal Services", description: "Law firms, attorneys, paralegal services." },
  { value: "health", label: "Healthcare", description: "Dental, chiropractic, physical therapy, clinics." },
  { value: "b2b", label: "B2B Services", description: "SaaS, professional services, consulting." },
  { value: "default", label: "Generic / Other", description: "Use generic baseline benchmarks." },
];

export function ArionServiceAreaPage() {
  const { activeSiteId } = useArionContext();
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const [form, setForm] = useState<ServiceArea>({ city: "", state: "", regions: [], zips: [] });
  const [serviceCategory, setServiceCategory] = useState<string>("home_services");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [regionsInput, setRegionsInput] = useState("");
  const [zipsInput, setZipsInput] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  // 2026-09-01 — `if (!activeSiteId) return;` used to bail BEFORE the
  // `finally { setLoading(false) }`, and `loading` starts true. A tenant with
  // no ARION site (or before the site id resolved) therefore sat on
  // "Loading service area config…" forever with nothing else on screen. The
  // load error was swallowed too, so a 500 looked identical to an empty form.
  // Both now end in a state the page can actually render and explain.
  const fetchArea = useCallback(async () => {
    if (!activeTenantId || !activeSiteId) { setLoading(false); return; }
    setLoading(true);
    setLoadError(null);
    try {
      const token = await getToken();
      const base = import.meta.env.VITE_ARION_API_BASE_URL as string;
      const body = await getIaInsightsServiceArea({
        baseUrl: base, bearerToken: token.accessToken, tenantId: activeTenantId, siteId: activeSiteId,
      });
      const cur: ServiceArea = body?.data || { city: "", state: "", regions: [], zips: [] };
      setForm(cur);
      setRegionsInput((cur.regions || []).join(", "));
      setZipsInput((cur.zips || []).join(", "));
      if (body?.service_category) setServiceCategory(body.service_category);
    } catch (err) { setLoadError((err as Error).message || "Could not load your service area."); }
    finally { setLoading(false); }
  }, [activeSiteId, activeTenantId, getToken]);
  useEffect(() => { fetchArea(); }, [fetchArea]);

  async function save() {
    // Silently doing nothing on click is how this page used to behave with no
    // site selected. Say why instead.
    if (!activeTenantId || !activeSiteId) {
      alert("No website is selected yet, so there's nothing to save this against. Pick a site first.");
      return;
    }
    setSaving(true);
    try {
      const token = await getToken();
      const base = import.meta.env.VITE_ARION_API_BASE_URL as string;
      await putIaInsightsServiceArea({
        baseUrl: base,
        bearerToken: token.accessToken,
        tenantId: activeTenantId,
        body: {
          siteId: activeSiteId,
          serviceArea: {
            city: form.city || undefined,
            state: form.state || undefined,
            regions: regionsInput.split(/[,;]/).map((s) => s.trim()).filter(Boolean),
            zips: zipsInput.split(/[,;\s]/).map((s) => s.trim()).filter(Boolean),
          },
          serviceCategory,
        },
      });
      setSavedAt(new Date());
    } catch (err) { alert(`Save failed: ${(err as Error).message}`); }
    finally { setSaving(false); }
  }

  async function clear() {
    if (!confirm("Clear all service-area config? The Visibility & Reach engine will treat all US traffic as local until reconfigured.")) return;
    setForm({ city: "", state: "", regions: [], zips: [] });
    setRegionsInput("");
    setZipsInput("");
    setSavedAt(null);
    // Also persist the clear
    if (activeSiteId && activeTenantId) {
      try {
        const token = await getToken();
        const base = import.meta.env.VITE_ARION_API_BASE_URL as string;
        await putIaInsightsServiceArea({
          baseUrl: base,
          bearerToken: token.accessToken,
          tenantId: activeTenantId,
          body: { siteId: activeSiteId, serviceArea: null },
        });
      } catch { /* swallow */ }
    }
  }

  if (loading) {
    return <div className="p-4 text-sm text-slate-500">Loading service area config…</div>;
  }

  const noSite = !activeTenantId || !activeSiteId;

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <MapPin className="h-6 w-6 text-[#1A7DB5]" /> Service Area
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Where your business actually serves customers. The Visibility &amp; Reach trend engine uses this to flag traffic from outside your service area — that traffic doesn't convert for a local service business, so its presence inflates impression counts without contributing real opportunity.
        </p>
      </div>

      {noSite && (
        <div className="mb-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          No website is selected, so there's nothing to save this against yet. Add or pick a site in ARION first — this page can't store a service area without one.
        </div>
      )}
      {loadError && (
        <div className="mb-3 rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          Couldn't load your saved service area: {loadError} The form below is empty — saving now would overwrite whatever is stored. Reload the page first.
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4 mb-3">
        <div className="flex items-center gap-2 mb-2">
          <Briefcase className="h-4 w-4 text-[#1A7DB5]" />
          <h2 className="text-sm font-bold text-slate-900">Service Category</h2>
        </div>
        <p className="text-xs text-slate-500 mb-2">Drives which industry benchmarks the IA Insights engines compare your performance against (e.g. typical impression-to-visit %, mobile share, form-conversion rate).</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
          {SERVICE_CATEGORIES.map((c) => (
            <label key={c.value} className={`flex items-start gap-2 cursor-pointer rounded border p-2 text-xs ${serviceCategory === c.value ? "border-[#1A7DB5] bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
              <input type="radio" name="service_category" value={c.value} checked={serviceCategory === c.value} onChange={() => setServiceCategory(c.value)} className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-900">{c.label}</div>
                <div className="text-[10px] text-slate-500">{c.description}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-xs">
            <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Primary city</div>
            <input
              value={form.city || ""}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              placeholder="e.g. Des Moines"
              className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
            />
          </label>
          <label className="text-xs">
            <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">State</div>
            <input
              value={form.state || ""}
              onChange={(e) => setForm({ ...form, state: e.target.value })}
              placeholder="e.g. Iowa"
              className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
            />
          </label>
        </div>
        <label className="block text-xs">
          <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Additional regions / metros (comma-separated)</div>
          <input
            value={regionsInput}
            onChange={(e) => setRegionsInput(e.target.value)}
            placeholder="e.g. Polk County, Dallas County, Ankeny"
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5"
          />
          <div className="text-[10px] text-slate-500 mt-1">Used for fuzzy matching against GA4 city/region/country breakdowns.</div>
        </label>
        <label className="block text-xs">
          <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">ZIP codes (comma- or space-separated)</div>
          <textarea
            value={zipsInput}
            onChange={(e) => setZipsInput(e.target.value)}
            rows={3}
            placeholder="e.g. 50309 50311 50312 50314"
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 font-mono"
          />
        </label>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <button
            onClick={save}
            disabled={saving}
            className="text-sm px-4 py-1.5 rounded bg-[#1A7DB5] text-white flex items-center gap-1 disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save service area"}
          </button>
          <button onClick={clear} className="text-xs px-3 py-1.5 rounded border border-red-200 bg-white text-red-600 hover:bg-red-50 flex items-center gap-1">
            <Trash2 className="h-3 w-3" /> Clear
          </button>
        </div>
        {savedAt && (
          <div className="text-xs text-emerald-700 flex items-center gap-1">
            <Check className="h-3.5 w-3.5" /> Saved at {savedAt.toLocaleTimeString()}. The next IA Insights load picks up the change.
          </div>
        )}
      </div>

      <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
        <strong>How this is used:</strong> The Visibility &amp; Reach engine compares GA4's geography breakdown against your service area. Sessions from outside the area are quantified ("37% of sessions came from geographies outside your service area"), excluded from the effective impression-to-visit ratio, and surfaced as recommended actions ("Add a country filter to your GA4 reports").
      </div>
    </div>
  );
}

export default ArionServiceAreaPage;
