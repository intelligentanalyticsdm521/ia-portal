// SparkServiceCategoryPage — Tenant service category for IA Insights
// benchmark selection (v5.23). Mirrors the ARION service-category radio
// group but persists into lumen.tenant_settings under the service_category
// key. The same setting is read by both SPARK and OLIVER IA Insights
// Trends pages.
import { useCallback, useEffect, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Briefcase, Save, Check } from "lucide-react";

// The values here MUST be ones the benchmark ladder can resolve. That ladder
// lives in LUMEN-API routes/iaInsightsInputs.js (the PARENT map) and reads
// arion.ia_insights_benchmark.
//
// 2026-09-01 — this list used to hold only the 5 broad categories. Every real
// tenant in production is stored as a NARROW one (pressure_washing,
// dental_practice, ag_services, software_agency), so on load no radio matched,
// the page rendered with nothing selected, and the only way to save was to
// overwrite a specific category with a broad one — quietly downgrading the
// benchmarks. The narrow rows below are exactly the ones the PARENT map knows
// how to roll up, so each still resolves even where a vertical has few rows.
const SERVICE_CATEGORIES: Array<{ value: string; label: string; description: string }> = [
  { value: "home_services",  label: "Home Services",  description: "General home services. Pick a specific trade below if one fits." },
  { value: "plumbing",       label: "Plumbing",       description: "Plumbers and drain services." },
  { value: "hvac",           label: "HVAC",           description: "Heating, ventilation, air conditioning." },
  { value: "roofing",        label: "Roofing",        description: "Roofers and exterior contractors." },
  { value: "electrician",    label: "Electrical",     description: "Electricians and electrical contracting." },
  { value: "lawn_landscape", label: "Lawn & Landscape", description: "Lawn care, landscaping, tree service." },
  { value: "pressure_washing", label: "Pressure Washing", description: "Exterior and surface cleaning." },
  { value: "junk_removal",   label: "Junk Removal",   description: "Hauling and junk removal." },
  { value: "snow_removal",   label: "Snow Removal",   description: "Seasonal snow and ice services." },
  { value: "medical_practice", label: "Medical Practice", description: "Clinics and medical offices generally." },
  { value: "dental_practice", label: "Dental Practice", description: "Dental and orthodontic practices." },
  { value: "chiropractic",   label: "Chiropractic",   description: "Chiropractors and physical therapy." },
  { value: "veterinary",     label: "Veterinary",     description: "Vet clinics and animal hospitals." },
  { value: "med_spa",        label: "Med Spa",        description: "Aesthetics and med-spa services." },
  { value: "health",         label: "Healthcare (other)", description: "Any other healthcare business." },
  { value: "legal",          label: "Legal Services", description: "Law firms, attorneys, paralegal services." },
  { value: "accounting",     label: "Accounting",     description: "Accountants, bookkeepers, tax preparers." },
  { value: "software_agency", label: "Software / Agency", description: "SaaS, dev shops, marketing agencies." },
  { value: "professional_services", label: "Professional Services", description: "Consulting and other professional services." },
  { value: "b2b",            label: "B2B Services",   description: "Other business-to-business services." },
  { value: "ag_services",    label: "Agricultural Services", description: "Ag services and suppliers." },
  { value: "agriculture",    label: "Agriculture",    description: "Farming and agricultural operations." },
  { value: "cafe_coffee",    label: "Cafe / Coffee",  description: "Food and beverage retail." },
  { value: "default",        label: "Generic / Other", description: "Use generic baseline benchmarks." },
];

export function SparkServiceCategoryPage() {
  const { get, put, ready } = useSparkApi();
  const [current, setCurrent] = useState<string>("home_services");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  // A failed load used to be swallowed, leaving the page showing "Home
  // Services" as though that were the saved value. Surface it instead.
  const [error, setError] = useState<unknown>(null);

  const fetchSetting = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const r = await get<{ data: { setting_value: string | null } | null }>("/api/v1/tenant-settings/service_category");
      const v = r?.data?.setting_value;
      if (v) setCurrent(v);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready]);
  useEffect(() => { fetchSetting(); }, [fetchSetting]);

  async function save() {
    setSaving(true);
    try {
      await put("/api/v1/tenant-settings/service_category", { value: current });
      setSavedAt(new Date());
    } catch (err) {
      alert(`Save failed: ${(err as Error).message}`);
    } finally { setSaving(false); }
  }

  return (
    <SparkPageShell
      title="Service Category"
      subtitle="Industry classification for IA Insights benchmarks"
      help="Drives which industry benchmarks SPARK and OLIVER IA Insights compare your performance against (e.g. typical email open rate, lead win rate, on-time job completion). Setting this correctly makes the scoring meaningful for your business type."
      loading={loading}
      error={error}
    >
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-3">
          <Briefcase className="h-5 w-5 text-[#EF6C33]" />
          <h2 className="text-sm font-bold text-slate-900">Choose your industry category</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {/* Never hide what is actually saved. If the stored value predates
              this list (or was set by another surface), show it as its own
              selected row so the page reflects reality instead of rendering
              an empty radio group. */}
          {current && !SERVICE_CATEGORIES.some((c) => c.value === current) && (
            <label className="flex items-start gap-2 cursor-pointer rounded border p-3 text-xs border-[#EF6C33] bg-orange-50">
              <input type="radio" name="service_category" value={current} checked readOnly className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-900">{current}</div>
                <div className="text-[10px] text-slate-500">Currently saved. Pick another row below to change it.</div>
              </div>
            </label>
          )}
          {SERVICE_CATEGORIES.map((c) => (
            <label
              key={c.value}
              className={`flex items-start gap-2 cursor-pointer rounded border p-3 text-xs transition-colors ${
                current === c.value
                  ? "border-[#EF6C33] bg-orange-50"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name="service_category"
                value={c.value}
                checked={current === c.value}
                onChange={() => setCurrent(c.value)}
                className="mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-900">{c.label}</div>
                <div className="text-[10px] text-slate-500">{c.description}</div>
              </div>
            </label>
          ))}
        </div>

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
          <div className="text-[10px] text-slate-500">
            Saves to <code className="font-mono">lumen.tenant_settings</code> · key <code className="font-mono">service_category</code>
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="text-sm px-4 py-1.5 rounded bg-[#EF6C33] text-white flex items-center gap-1 disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
          </button>
        </div>
        {savedAt && (
          <div className="mt-2 text-xs text-emerald-700 flex items-center gap-1">
            <Check className="h-3.5 w-3.5" /> Saved at {savedAt.toLocaleTimeString()}. The next IA Insights load picks up the change.
          </div>
        )}
      </div>

      <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
        <strong>How this is used:</strong> Both SPARK and OLIVER IA Insights Trend pages fetch this setting on load, then look up the matching benchmark set from <code className="font-mono">arion.ia_insights_benchmark</code>. Each trend engine compares your actual numbers against the category-appropriate baseline (e.g. legal services tolerate longer session durations and higher conversion rates than home services).
      </div>
    </SparkPageShell>
  );
}

export default SparkServiceCategoryPage;
