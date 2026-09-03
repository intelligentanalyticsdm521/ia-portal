// SparkLeadGenNewPage — F-150/F-163 Lead Gen V1 search form (Option 3 layout).
//
// Two-column page: form on the LEFT, live preview panel on the RIGHT.
// Preview updates as the form changes — calls /leadgen/expand and
// /leadgen/locations/expand on a debounce so the customer sees what their
// search will actually do BEFORE they pay.
//
// On submit: POSTs to /leadgen/jobs and navigates to the progress page.
//
// Reference: C:\dev\claude code\overnight-report\30_LEADGEN_V1_SPEC.md
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { LeadGenTermsLink, LeadGenTermsNotice } from "../../components/spark/LeadGenTermsLink";
import {
  Search, MapPin, Sparkles, DollarSign, Clock, Play, Save,
  X, ChevronDown, Check, Tag, Snowflake, Building2, Info,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type SearchMode = "strict" | "focused" | "balanced" | "broad";

interface CategoryHit { id: number; name: string; industry_id?: number | null; is_curated?: boolean | number | null }
interface TermHit { id: number; term: string; weight?: number }
interface CityHit { id: number; name: string; state: string }
interface ZipHit { zip: string; city?: string; state?: string }
// Backend (/api/v1/leadgen/states) returns { id, abbr, name }. The form binds
// to `abbr` (the 2-letter postal code) because /leadgen/cities/autocomplete
// expects ?state=ABBR.
interface StateRow { id: number; abbr: string; name: string }

interface ExpandedKeyword { term: string; weight: number; source: string }
// Backend (/api/v1/leadgen/locations/expand) returns
// { data: { cities: [{id, name, lat, lon, miles}], zips, origin } }.
// Cities don't carry a state in the response (the request scoped them), but
// the page needs one for display — fill it from form.state on read.
interface ExpandedCity { city_id: number; name: string; state: string; miles: number }
interface ExpandLocResponse { cities: ExpandedCity[]; zip_count: number }

interface FormState {
  category: CategoryHit | null;
  terms: TermHit[];
  searchMode: SearchMode;
  state: string;
  cities: CityHit[];
  radiusMiles: number;
  zipMode: "auto" | "specify";
  zips: ZipHit[];
  includeCold: boolean;
  maxLeads: number;
}

const EMPTY_FORM: FormState = {
  category: null,
  terms: [],
  searchMode: "balanced",
  state: "",
  cities: [],
  radiusMiles: 30,
  zipMode: "auto",
  zips: [],
  includeCold: false,
  maxLeads: 100,
};

const SEARCH_MODES: Array<{ value: SearchMode; label: string; help: string }> = [
  { value: "strict",   label: "Strict",   help: "Only the exact terms you provide. Narrowest results, highest precision." },
  { value: "focused",  label: "Focused",  help: "Direct synonyms only (~3 terms). Tight relevance, fewer misses." },
  { value: "balanced", label: "Balanced", help: "Closely related business types (10–15 terms). Recommended default." },
  { value: "broad",    label: "Broad",    help: "Adjacent industries too (25–40 terms). More volume, less precision." },
];

const RADIUS_STEPS = [0, 5, 10, 25, 30, 50, 100];

// V1.1 will pull this from /usage/tier-caps. Hardcoded for V1 launch.
const MAX_LEADS_CAP = 100;
const COST_PER_LEAD_USD = 0.18; // rough rule-of-thumb estimate, "subject to actual Hunter spend"

// ─────────────────────────────────────────────────────────────────────────────
// Hooks: debounced value + autocomplete helpers
// ─────────────────────────────────────────────────────────────────────────────

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic autocomplete combobox
// ─────────────────────────────────────────────────────────────────────────────

interface ComboProps<T> {
  placeholder: string;
  value: string;
  onChange: (s: string) => void;
  results: T[];
  loading: boolean;
  onPick: (item: T) => void;
  renderItem: (item: T) => React.ReactNode;
  disabled?: boolean;
  icon?: React.ReactNode;
}

function AutocompleteCombo<T>({
  placeholder, value, onChange, results, loading, onPick, renderItem, disabled, icon,
}: ComboProps<T>) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={wrapRef}>
      <div className="relative">
        {icon && <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">{icon}</div>}
        <input
          type="text"
          disabled={disabled}
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className={`w-full text-sm border border-slate-300 rounded px-3 py-2 focus:outline-none focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33] disabled:bg-slate-50 disabled:text-slate-400 ${icon ? "pl-8" : ""}`}
        />
      </div>
      {open && (value.length > 0 || results.length > 0) && (
        <div className="absolute z-30 mt-1 w-full bg-white rounded-md border border-slate-200 shadow-lg max-h-60 overflow-y-auto">
          {loading && (
            <div className="px-3 py-2 text-xs text-slate-400">Searching…</div>
          )}
          {!loading && results.length === 0 && value.trim() && (
            <div className="px-3 py-2 text-xs text-slate-400">No matches — your term will be added as a custom keyword.</div>
          )}
          {results.map((r, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { onPick(r); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-orange-50 hover:text-orange-900 flex items-center justify-between"
            >
              {renderItem(r)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export function SparkLeadGenNewPage() {
  const { get, post, ready } = useSparkApi();
  const navigate = useNavigate();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [error, setError] = useState<unknown>(null);

  // ── autocomplete state ──────────────────────────────────────────────────
  const [catQuery, setCatQuery] = useState("");
  const [catResults, setCatResults] = useState<CategoryHit[]>([]);
  const [catLoading, setCatLoading] = useState(false);
  const debouncedCat = useDebounced(catQuery, 200);
  // F-LG.158: "Top 25" curated-only filter for the category autocomplete.
  const [catTop25Only, setCatTop25Only] = useState(false);

  const [termQuery, setTermQuery] = useState("");
  const [termResults, setTermResults] = useState<TermHit[]>([]);
  const [termLoading, setTermLoading] = useState(false);
  const debouncedTerm = useDebounced(termQuery, 200);

  const [states, setStates] = useState<StateRow[]>([]);

  const [cityQuery, setCityQuery] = useState("");
  const [cityResults, setCityResults] = useState<CityHit[]>([]);
  const [cityLoading, setCityLoading] = useState(false);
  const debouncedCity = useDebounced(cityQuery, 200);

  const [zipQuery, setZipQuery] = useState("");
  const [zipResults, setZipResults] = useState<ZipHit[]>([]);
  const [zipLoading, setZipLoading] = useState(false);
  const debouncedZip = useDebounced(zipQuery, 200);

  // ── live preview state ──────────────────────────────────────────────────
  const [previewKw, setPreviewKw] = useState<ExpandedKeyword[]>([]);
  const [previewKwLoading, setPreviewKwLoading] = useState(false);
  const [previewLoc, setPreviewLoc] = useState<ExpandLocResponse>({ cities: [], zip_count: 0 });
  const [previewLocLoading, setPreviewLocLoading] = useState(false);

  // Tenant Lead Gen credit pool. Drives the max-leads cap + the Usage card in
  // the right sidebar. Endpoint = GET /leadgen/credits (LUMEN-API), returns
  // { monthly_allotment, remaining, overage_per_lead_cents }.
  const [credits, setCredits] = useState<{
    monthly_allotment: number;
    remaining: number;
    overage_per_lead_cents: number;
  } | null>(null);

  // Load states once on mount.
  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        // GET /api/v1/leadgen/states → { data: [{ id, abbr, name }] }
        const r = await get<{ data: StateRow[] }>("/api/v1/leadgen/states");
        setStates(r?.data || []);
      } catch {
        // Endpoint not live yet — leave empty so the dropdown renders disabled.
      }
    })();
  }, [get, ready]);

  // Load tenant credit pool once on mount. Silent-fail leaves credits=null so
  // the UI falls back to the legacy fixed cap; better than blocking the form.
  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        // GET /api/v1/leadgen/credits → { data: { monthly_allotment, remaining, overage_per_lead_cents, ... } }
        type CreditsResp = { data: { monthly_allotment: number; remaining: number; overage_per_lead_cents: number } };
        const r = await get<CreditsResp>("/api/v1/leadgen/credits");
        if (r?.data) {
          setCredits({
            monthly_allotment: Number(r.data.monthly_allotment) || 0,
            remaining: Number(r.data.remaining) || 0,
            overage_per_lead_cents: Number(r.data.overage_per_lead_cents) || 100,
          });
        }
      } catch {
        // Silent — cap stays at legacy fallback, no user-facing error.
      }
    })();
  }, [get, ready]);

  // Category autocomplete.
  useEffect(() => {
    // When "Top 25 only" is on, allow empty query (we want to browse the list).
    const minLen = catTop25Only ? 0 : 2;
    if (!ready || debouncedCat.trim().length < minLen) {
      if (!catTop25Only) setCatResults([]);
      return;
    }
    let cancelled = false;
    setCatLoading(true);
    (async () => {
      try {
        // F-LG.158: curated=1 → only the locked Top-25 categories.
        const curatedParam = catTop25Only ? "&curated=1" : "";
        const r = await get<{ data: CategoryHit[] }>(`/api/v1/leadgen/categories/autocomplete?q=${encodeURIComponent(debouncedCat)}${curatedParam}`);
        if (!cancelled) setCatResults(r?.data || []);
      } catch {
        if (!cancelled) setCatResults([]);
      } finally {
        if (!cancelled) setCatLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [debouncedCat, get, ready, catTop25Only]);

  // Term autocomplete (scoped to category if present).
  useEffect(() => {
    if (!ready || debouncedTerm.trim().length < 2) { setTermResults([]); return; }
    let cancelled = false;
    setTermLoading(true);
    (async () => {
      try {
        const indParam = form.category?.industry_id ? `industry_id=${form.category.industry_id}&` : "";
        // GET /api/v1/leadgen/terms/autocomplete?industry_id=&q=
        const r = await get<{ data: TermHit[] }>(`/api/v1/leadgen/terms/autocomplete?${indParam}q=${encodeURIComponent(debouncedTerm)}`);
        if (!cancelled) setTermResults(r?.data || []);
      } catch {
        if (!cancelled) setTermResults([]);
      } finally {
        if (!cancelled) setTermLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [debouncedTerm, get, ready, form.category]);

  // City autocomplete (requires a state).
  useEffect(() => {
    if (!ready || !form.state || debouncedCity.trim().length < 2) { setCityResults([]); return; }
    let cancelled = false;
    setCityLoading(true);
    (async () => {
      try {
        // GET /api/v1/leadgen/cities/autocomplete?state=&q=
        const r = await get<{ data: CityHit[] }>(`/api/v1/leadgen/cities/autocomplete?state=${form.state}&q=${encodeURIComponent(debouncedCity)}`);
        if (!cancelled) setCityResults(r?.data || []);
      } catch {
        if (!cancelled) setCityResults([]);
      } finally {
        if (!cancelled) setCityLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [debouncedCity, form.state, get, ready]);

  // ZIP autocomplete (only in specify mode). Backend requires &state= and
  // returns { zip5, lat, lon, city_name } — adapt to ZipHit shape on read.
  useEffect(() => {
    if (!ready || form.zipMode !== "specify" || !form.state || debouncedZip.trim().length < 3) { setZipResults([]); return; }
    let cancelled = false;
    setZipLoading(true);
    (async () => {
      try {
        // GET /api/v1/leadgen/zips/autocomplete?state=ABBR&q=
        const r = await get<{ data: Array<{ zip5: string; city_name?: string }> }>(`/api/v1/leadgen/zips/autocomplete?state=${form.state}&q=${encodeURIComponent(debouncedZip)}`);
        if (!cancelled) {
          const rows: ZipHit[] = (r?.data || []).map((z) => ({
            zip: z.zip5,
            city: z.city_name,
            state: form.state,
          }));
          setZipResults(rows);
        }
      } catch {
        if (!cancelled) setZipResults([]);
      } finally {
        if (!cancelled) setZipLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [debouncedZip, form.zipMode, form.state, get, ready]);

  // ── live keyword expansion preview ──────────────────────────────────────
  const kwInputs = useMemo(() => ({
    categoryId: form.category?.id ?? null,
    industryId: form.category?.industry_id ?? null,
    termIds: form.terms.map((t) => t.id).sort(),
    termTexts: form.terms.map((t) => t.term).sort(),
    mode: form.searchMode,
  }), [form.category, form.terms, form.searchMode]);

  const debouncedKw = useDebounced(kwInputs, 350);

  useEffect(() => {
    if (!ready) return;
    if (!debouncedKw.categoryId && debouncedKw.termIds.length === 0) {
      setPreviewKw([]); return;
    }
    let cancelled = false;
    setPreviewKwLoading(true);
    (async () => {
      try {
        // POST /api/v1/leadgen/expand body { keywords: [string], mode, category_id }
        // → { data: { terms: [{id, term, weight, source}], unknown, mode, threshold, stats } }
        type ExpandResp = { data: { terms: ExpandedKeyword[] } };
        const r = await post<ExpandResp>("/api/v1/leadgen/expand", {
          keywords: debouncedKw.termTexts,
          mode: debouncedKw.mode,
          category_id: debouncedKw.categoryId,
        });
        if (!cancelled) setPreviewKw(r?.data?.terms || []);
      } catch {
        if (!cancelled) setPreviewKw([]);
      } finally {
        if (!cancelled) setPreviewKwLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [debouncedKw, post, ready]);

  // ── live location expansion preview ─────────────────────────────────────
  const locInputs = useMemo(() => ({
    state: form.state,
    cityIds: form.cities.map((c) => c.id).sort(),
    radiusMiles: form.radiusMiles,
    zipMode: form.zipMode,
    zips: form.zips.map((z) => z.zip).sort(),
  }), [form.state, form.cities, form.radiusMiles, form.zipMode, form.zips]);

  const debouncedLoc = useDebounced(locInputs, 350);

  useEffect(() => {
    if (!ready) return;
    if (!debouncedLoc.state || (debouncedLoc.cityIds.length === 0 && debouncedLoc.zips.length === 0)) {
      setPreviewLoc({ cities: [], zip_count: 0 });
      return;
    }
    let cancelled = false;
    setPreviewLocLoading(true);
    (async () => {
      try {
        // POST /api/v1/leadgen/locations/expand → { data: { cities, zips, zip_count, origin } }
        type LocResp = { data: { cities: ExpandedCity[]; zip_count: number } };
        const r = await post<LocResp>("/api/v1/leadgen/locations/expand", {
          state: debouncedLoc.state,
          city_ids: debouncedLoc.cityIds,
          radius_miles: debouncedLoc.radiusMiles,
          zip_mode: debouncedLoc.zipMode,
          zips: debouncedLoc.zips,
        });
        if (!cancelled) {
          const cities = (r?.data?.cities || []).map((c) => ({
            ...c,
            state: c.state || debouncedLoc.state,
          }));
          setPreviewLoc({ cities, zip_count: r?.data?.zip_count || 0 });
        }
      } catch {
        if (!cancelled) setPreviewLoc({ cities: [], zip_count: 0 });
      } finally {
        if (!cancelled) setPreviewLocLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [debouncedLoc, post, ready]);

  // ── derived ────────────────────────────────────────────────────────────
  // Max = whatever the tenant's subscription allotment currently provides.
  // In Brandon's billing model there is NO per-lead overage. Extra volume
  // comes from either (a) increasing the subscription's Extra-Leads add-on
  // quantity (per-tier pack sizes: Essentials=5, Growth/Authority=10) or
  // (b) an ad-hoc lead-pack product — not yet built. So the slider is a
  // hard stop at remaining; the "buy more" affordance sits below.
  const dynamicMaxCap = credits ? credits.remaining : MAX_LEADS_CAP;

  // Estimated cost is $0 for leads within the monthly allotment (they're
  // already paid for by the subscription). Kept as a stable computed for
  // the sidebar; when we wire ad-hoc purchase the response will drive
  // cost directly from Stripe.
  const estCostUsd = 0;
  const estTimeStr = "4–7 min";

  const canSubmit =
    !!form.category &&
    !!form.state &&
    (form.cities.length > 0 || form.zips.length > 0) &&
    form.maxLeads > 0 &&
    !submitting;

  // ── handlers ───────────────────────────────────────────────────────────
  function addTerm(t: TermHit) {
    if (form.terms.some((x) => x.id === t.id || x.term.toLowerCase() === t.term.toLowerCase())) return;
    setForm({ ...form, terms: [...form.terms, t] });
    setTermQuery("");
  }
  function addCustomTerm() {
    const txt = termQuery.trim();
    if (!txt) return;
    if (form.terms.some((x) => x.term.toLowerCase() === txt.toLowerCase())) return;
    // Custom terms use a synthetic negative id so the backend knows it's free-text.
    setForm({ ...form, terms: [...form.terms, { id: -Date.now(), term: txt }] });
    setTermQuery("");
  }
  function addCity(c: CityHit) {
    if (form.cities.some((x) => x.id === c.id)) return;
    setForm({ ...form, cities: [...form.cities, c] });
    setCityQuery("");
  }
  function addZip(z: ZipHit) {
    if (form.zips.some((x) => x.zip === z.zip)) return;
    setForm({ ...form, zips: [...form.zips, z] });
    setZipQuery("");
  }

  const buildPayload = useCallback(() => ({
    customer_category_id: form.category?.id ?? null,
    industry_id: form.category?.industry_id ?? null,
    terms: form.terms.map((t) => ({ id: t.id > 0 ? t.id : null, term: t.term })),
    // 2026-09-04 — the job must run exactly what the Live Preview showed. The
    // preview's expanded keyword list and radius-resolved cities go with the
    // request; the raw form (manual topics, anchor cities) stays for the record.
    expanded_terms: previewKw.map((t) => t.term),
    expanded_city_ids: previewLoc.cities.map((c) => c.city_id),
    search_mode: form.searchMode,
    state: form.state,
    city_ids: form.cities.map((c) => c.id),
    radius_miles: form.radiusMiles,
    zip_mode: form.zipMode,
    zips: form.zips.map((z) => z.zip),
    include_cold_leads: form.includeCold,
    max_leads: form.maxLeads,
  }), [form, previewKw, previewLoc]);

  async function handleStart() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      // POST /api/v1/leadgen/jobs returns { data: { job_id, status, ... } }
      type JobsResp = { data?: { job_id?: string | number; payment_required?: boolean } };
      const r = await post<JobsResp>("/api/v1/leadgen/jobs", buildPayload());
      const jobId = r?.data?.job_id;
      if (jobId != null) {
        navigate(`/app/spark/leadgen/jobs/${jobId}`);
      } else {
        setError(new Error("Backend returned no job_id. Endpoint may not be live yet."));
      }
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveProfile() {
    const name = profileName.trim();
    if (!name) return;
    setSavingProfile(true);
    try {
      // POST /api/v1/leadgen/profiles → { data: { id } }
      await post("/api/v1/leadgen/profiles", { name, ...buildPayload() });
      setShowSaveModal(false);
      setProfileName("");
    } catch (err) {
      setError(err);
    } finally {
      setSavingProfile(false);
    }
  }

  // ── render ─────────────────────────────────────────────────────────────
  return (
    <SparkPageShell
      title="New B2B Lead Search"
      subtitle="Find verified B2B leads — see exactly what you're searching for before you pay"
      help="Set your category, location, and search mode. The live preview on the right shows expanded keywords, resolved cities/ZIPs, estimated cost, and estimated runtime. Nothing runs (and you're not charged) until you click Start Search."
      actions={<LeadGenTermsLink />}
      error={error}
      loading={false}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 p-1">
        {/* ─── LEFT: form ──────────────────────────────────────────────── */}
        <div className="space-y-6">
          {/* Business Category */}
          <Section title="Business Category" required>
            {form.category ? (
              <Chip label={form.category.name} onRemove={() => setForm({ ...form, category: null })} icon={<Building2 className="h-3 w-3" />} />
            ) : (
              <>
                {/* F-LG.158: Top-25 curated filter toggle */}
                <label className="flex items-center gap-2 text-[12px] text-slate-300 mb-2 select-none cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-amber-400"
                    checked={catTop25Only}
                    onChange={(e) => setCatTop25Only(e.target.checked)}
                  />
                  <span>Show <span className="font-medium text-amber-300">Top 25 categories</span> only</span>
                </label>
                <AutocompleteCombo
                  placeholder={catTop25Only
                    ? "Browse the curated Top 25 — type to filter"
                    : "Start typing a business category (e.g. plumbing contractors)"}
                  value={catQuery}
                  onChange={setCatQuery}
                  results={catResults}
                  loading={catLoading}
                  onPick={(c) => { setForm({ ...form, category: c }); setCatQuery(""); }}
                  renderItem={(c) => (
                    <span className="flex-1 flex items-center justify-between">
                      <span className="font-medium">{c.name}</span>
                      {c.is_curated ? (
                        <span className="text-[10px] text-amber-300 ml-2">Top 25</span>
                      ) : null}
                    </span>
                  )}
                  icon={<Building2 className="h-3.5 w-3.5" />}
                />
              </>
            )}
          </Section>

          {/* Search Topics */}
          <Section
            title="Search Topics"
            hint="Optional. Leave blank to search on the category alone, or add specific service types to narrow."
          >
            <div className="flex flex-wrap gap-1.5 mb-2">
              {form.terms.map((t) => (
                <Chip
                  key={t.id}
                  label={t.term}
                  onRemove={() => setForm({ ...form, terms: form.terms.filter((x) => x.id !== t.id) })}
                  icon={<Tag className="h-3 w-3" />}
                />
              ))}
            </div>
            <AutocompleteCombo
              placeholder="Type a service, product, or topic — press Enter to add as custom"
              value={termQuery}
              onChange={setTermQuery}
              results={termResults}
              loading={termLoading}
              onPick={addTerm}
              renderItem={(t) => (
                <span className="flex-1 flex items-center justify-between">
                  <span>{t.term}</span>
                  {typeof t.weight === "number" && (
                    <span className="text-[10px] text-slate-400 tabular-nums ml-2">w {t.weight.toFixed(2)}</span>
                  )}
                </span>
              )}
              icon={<Tag className="h-3.5 w-3.5" />}
            />
            <button
              type="button"
              onClick={addCustomTerm}
              disabled={!termQuery.trim()}
              className="mt-1 text-[11px] text-slate-500 hover:text-[#EF6C33] disabled:opacity-40"
            >
              + Add "{termQuery || "…"}" as custom term
            </button>
          </Section>

          {/* Search Mode */}
          <Section title="Search Mode">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SEARCH_MODES.map((m) => {
                const active = form.searchMode === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setForm({ ...form, searchMode: m.value })}
                    className={`text-left rounded-lg border p-3 transition ${active ? "border-[#EF6C33] bg-orange-50 ring-1 ring-[#EF6C33]" : "border-slate-200 bg-white hover:border-slate-300"}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`h-3.5 w-3.5 rounded-full border-2 flex items-center justify-center ${active ? "border-[#EF6C33]" : "border-slate-300"}`}>
                        {active && <span className="h-1.5 w-1.5 rounded-full bg-[#EF6C33]" />}
                      </span>
                      <span className="text-sm font-semibold text-slate-900">{m.label}</span>
                      {m.value === "balanced" && <span className="text-[9px] uppercase tracking-wide text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded">Default</span>}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 leading-snug">{m.help}</p>
                  </button>
                );
              })}
            </div>
          </Section>

          {/* Location */}
          <Section title="Location" required icon={<MapPin className="h-3.5 w-3.5" />}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide">State</label>
                <div className="relative mt-0.5">
                  <select
                    value={form.state}
                    onChange={(e) => setForm({ ...form, state: e.target.value, cities: [] })}
                    className="w-full text-sm border border-slate-300 rounded px-3 py-2 appearance-none focus:outline-none focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]"
                    disabled={states.length === 0}
                  >
                    <option value="">{states.length === 0 ? "Loading states…" : "Select a state"}</option>
                    {states.map((s) => (
                      <option key={s.abbr} value={s.abbr}>{s.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide">Radius (miles)</label>
                <div className="mt-0.5 flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={RADIUS_STEPS.length - 1}
                    step={1}
                    value={RADIUS_STEPS.indexOf(form.radiusMiles) === -1 ? 4 : RADIUS_STEPS.indexOf(form.radiusMiles)}
                    onChange={(e) => setForm({ ...form, radiusMiles: RADIUS_STEPS[Number(e.target.value)] })}
                    className="flex-1 accent-[#EF6C33]"
                  />
                  <span className="text-sm font-semibold text-slate-900 tabular-nums w-16 text-right">
                    {form.radiusMiles === 0 ? "Exact" : `${form.radiusMiles} mi`}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-3">
              <label className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide">Cities</label>
              <div className="flex flex-wrap gap-1.5 mt-0.5 mb-1">
                {form.cities.map((c) => (
                  <Chip
                    key={c.id}
                    label={`${c.name}${c.state ? `, ${c.state}` : ""}`}
                    onRemove={() => setForm({ ...form, cities: form.cities.filter((x) => x.id !== c.id) })}
                    icon={<MapPin className="h-3 w-3" />}
                  />
                ))}
              </div>
              <AutocompleteCombo
                placeholder={form.state ? "Add cities in this state" : "Pick a state first"}
                value={cityQuery}
                onChange={setCityQuery}
                results={cityResults}
                loading={cityLoading}
                onPick={addCity}
                renderItem={(c) => <span>{c.name}<span className="text-[10px] text-slate-400 ml-1">{c.state}</span></span>}
                disabled={!form.state}
                icon={<Search className="h-3.5 w-3.5" />}
              />
            </div>

            <div className="mt-3">
              <label className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide flex items-center gap-2">
                ZIP codes
                <div className="flex rounded border border-slate-200 overflow-hidden">
                  {(["auto", "specify"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setForm({ ...form, zipMode: mode })}
                      className={`text-[10px] px-2 py-0.5 capitalize ${form.zipMode === mode ? "bg-[#EF6C33] text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                    >
                      {mode === "auto" ? "Auto from cities" : "Specify ZIPs"}
                    </button>
                  ))}
                </div>
              </label>
              {form.zipMode === "specify" && (
                <>
                  <div className="flex flex-wrap gap-1.5 mt-1 mb-1">
                    {form.zips.map((z) => (
                      <Chip
                        key={z.zip}
                        label={z.zip}
                        onRemove={() => setForm({ ...form, zips: form.zips.filter((x) => x.zip !== z.zip) })}
                      />
                    ))}
                  </div>
                  <AutocompleteCombo
                    placeholder="Type a ZIP code to add"
                    value={zipQuery}
                    onChange={setZipQuery}
                    results={zipResults}
                    loading={zipLoading}
                    onPick={addZip}
                    renderItem={(z) => <span><span className="font-mono">{z.zip}</span>{z.city ? <span className="text-[10px] text-slate-400 ml-2">{z.city}, {z.state}</span> : null}</span>}
                    icon={<Search className="h-3.5 w-3.5" />}
                  />
                </>
              )}
              {form.zipMode === "auto" && (
                <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5">
                  <Info className="h-3 w-3" />
                  ZIPs will be resolved automatically from your cities + radius.
                </p>
              )}
            </div>
          </Section>

          {/* Cold leads + max */}
          <Section title="Volume & filters">
            <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 cursor-pointer hover:border-slate-300">
              <input
                type="checkbox"
                checked={form.includeCold}
                onChange={(e) => setForm({ ...form, includeCold: e.target.checked })}
                className="mt-0.5 accent-[#EF6C33]"
              />
              <div>
                <div className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                  <Snowflake className="h-3.5 w-3.5 text-blue-500" />
                  Search cold leads
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">Includes leads you&apos;ve seen before that haven&apos;t been contacted in 90+ days.</p>
              </div>
            </label>

            <div className="mt-3">
              <label className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide flex items-center justify-between">
                <span>Max leads</span>
                <span className="text-[11px] normal-case text-slate-400">
                  {credits
                    ? `${credits.remaining.toLocaleString()} available this month`
                    : `Tier cap: ${MAX_LEADS_CAP}`}
                </span>
              </label>
              <div className="mt-0.5 flex items-center gap-2">
                <input
                  type="range"
                  min={10}
                  max={dynamicMaxCap}
                  step={10}
                  value={form.maxLeads}
                  onChange={(e) => setForm({ ...form, maxLeads: Number(e.target.value) })}
                  className="flex-1 accent-[#EF6C33]"
                />
                <span className="text-sm font-semibold text-slate-900 tabular-nums w-12 text-right">{form.maxLeads}</span>
              </div>
              {credits && credits.remaining < credits.monthly_allotment * 0.25 && (
                <p className="text-[11px] text-amber-700 mt-1 font-medium">
                  Running low. Add an Extra Leads pack to your subscription — or top up ad-hoc for this run (coming soon).
                </p>
              )}
              <p className="text-[11px] text-slate-500 mt-1">Included in your subscription. Need more? Increase your Extra Leads add-on quantity on your plan.</p>
            </div>
          </Section>
        </div>

        {/* ─── RIGHT: live preview panel ───────────────────────────────── */}
        <aside className="lg:sticky lg:top-4 self-start space-y-4">
          {/* Usage / plan pool — visible at the TOP so the customer always
              sees what they have available before they commit to a run. */}
          {credits && (() => {
            const used = Math.max(0, credits.monthly_allotment - credits.remaining);
            const pct = credits.monthly_allotment > 0
              ? Math.min(100, Math.round((used / credits.monthly_allotment) * 100))
              : 0;
            const barColor = pct >= 90 ? "bg-rose-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";
            return (
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-700">Lead Gen usage</div>
                  <div className="text-[10px] text-slate-400 tabular-nums">this month</div>
                </div>
                <div className="flex items-baseline gap-1.5 mb-2">
                  <span className="text-2xl font-bold text-slate-900 tabular-nums">{credits.remaining.toLocaleString()}</span>
                  <span className="text-xs text-slate-500">/ {credits.monthly_allotment.toLocaleString()} remaining</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                  <span>{used.toLocaleString()} used</span>
                  <span>Need more? Add pack on your plan</span>
                </div>
              </div>
            );
          })()}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100 bg-gradient-to-br from-orange-50/60 to-white">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#EF6C33]">Live preview</div>
              <div className="text-sm font-semibold text-slate-900 flex items-center gap-1.5 mt-0.5">
                <Sparkles className="h-3.5 w-3.5" /> Your search
              </div>
            </div>

            {/* Keywords */}
            <div className="px-4 py-3 border-b border-slate-100">
              <div className="text-[11px] font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5"><Search className="h-3 w-3" /> Expanded keywords</span>
                <span className="text-slate-400 tabular-nums">{previewKwLoading ? "…" : previewKw.length}</span>
              </div>
              {previewKw.length === 0 && !previewKwLoading && (
                <div className="text-[11px] text-slate-400 italic">Pick a category to see expansion.</div>
              )}
              <ul className="space-y-0.5 max-h-44 overflow-y-auto">
                {previewKw.slice(0, 15).map((k, i) => (
                  <li key={i} className="flex items-center gap-2 text-[12px]">
                    <Check className="h-3 w-3 text-emerald-600" />
                    <span className="truncate" title={k.term}>{k.term}</span>
                    {k.weight < 1 && <span className="text-[9px] text-slate-400 tabular-nums ml-auto">w {k.weight.toFixed(2)}</span>}
                  </li>
                ))}
              </ul>
              {previewKw.length > 15 && (
                <div className="text-[11px] text-slate-400 mt-1">+ {previewKw.length - 15} more (uncheckable)</div>
              )}
            </div>

            {/* Locations */}
            <div className="px-4 py-3 border-b border-slate-100">
              <div className="text-[11px] font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5"><MapPin className="h-3 w-3" /> Locations</span>
                <span className="text-slate-400 tabular-nums">
                  {previewLocLoading ? "…" : `${previewLoc.cities.length} cit${previewLoc.cities.length === 1 ? "y" : "ies"} · ${previewLoc.zip_count} ZIPs`}
                </span>
              </div>
              {previewLoc.cities.length === 0 && !previewLocLoading && (
                <div className="text-[11px] text-slate-400 italic">Add a state and at least one city or ZIP.</div>
              )}
              <ul className="space-y-0.5 max-h-44 overflow-y-auto">
                {previewLoc.cities.slice(0, 10).map((c) => (
                  <li key={c.city_id} className="flex items-center gap-2 text-[12px]">
                    <Check className="h-3 w-3 text-emerald-600" />
                    <span className="truncate">{c.name}, {c.state}</span>
                    <span className="text-[9px] text-slate-400 tabular-nums ml-auto">{c.miles.toFixed(0)} mi</span>
                  </li>
                ))}
              </ul>
              {previewLoc.cities.length > 10 && (
                <div className="text-[11px] text-slate-400 mt-1">+ {previewLoc.cities.length - 10} more</div>
              )}
            </div>

            {/* Cost + time */}
            <div className="px-4 py-3 grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide flex items-center gap-1"><DollarSign className="h-3 w-3" /> Est. cost</div>
                <div className="text-lg font-bold text-slate-900 tabular-nums mt-0.5">${estCostUsd.toFixed(2)}</div>
                <div className="text-[10px] text-slate-400 leading-tight">Subject to actual Hunter spend</div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide flex items-center gap-1"><Clock className="h-3 w-3" /> Est. time</div>
                <div className="text-lg font-bold text-slate-900 mt-0.5">{estTimeStr}</div>
                <div className="text-[10px] text-slate-400 leading-tight">Average for V1 jobs</div>
              </div>
            </div>

            {/* Actions */}
            <div className="px-4 py-3 border-t border-slate-100 space-y-2">
              <button
                type="button"
                onClick={handleStart}
                disabled={!canSubmit}
                className="w-full rounded-md bg-[#EF6C33] text-white text-sm font-semibold py-2 hover:bg-[#D85F2A] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                <Play className="h-3.5 w-3.5" /> {submitting ? "Starting…" : "Start Search"}
              </button>
              <LeadGenTermsNotice />
              <button
                type="button"
                onClick={() => setShowSaveModal(true)}
                disabled={!form.category}
                className="w-full rounded-md border border-slate-300 bg-white text-slate-700 text-xs font-medium py-1.5 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                <Save className="h-3 w-3" /> Save this search
              </button>
            </div>
          </div>

          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-[11px] text-slate-500 leading-relaxed">
            <Info className="h-3 w-3 inline-block mr-1 text-slate-400" />
            Billed per delivered lead. If we find fewer than your max, you&apos;re only charged for what we deliver.
          </div>
        </aside>
      </div>

      {/* Save profile modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-slate-900/30 z-50 flex items-center justify-center p-4" onClick={() => setShowSaveModal(false)}>
          <div className="bg-white rounded-xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold flex items-center gap-2">
                <Save className="h-4 w-4" /> Save this search
              </div>
              <button onClick={() => setShowSaveModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-[12px] text-slate-500">Saved searches appear under SPARK → Lead Gen → Saved Searches. Re-run any time without re-configuring.</p>
            <div>
              <label className="text-[10px] uppercase font-semibold text-slate-500">Name</label>
              <input
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="e.g. Des Moines property managers (Balanced)"
                className="w-full text-sm border border-slate-300 rounded p-1.5 mt-0.5 focus:border-[#EF6C33] focus:outline-none focus:ring-1 focus:ring-[#EF6C33]"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setShowSaveModal(false)} className="text-sm px-3 py-1.5 rounded border border-slate-200">Cancel</button>
              <button
                onClick={handleSaveProfile}
                disabled={!profileName.trim() || savingProfile}
                className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white disabled:opacity-50 flex items-center gap-1"
              >
                <Save className="h-3.5 w-3.5" /> {savingProfile ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </SparkPageShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small primitives used only by this page
// ─────────────────────────────────────────────────────────────────────────────

function Section({ title, children, required, hint, icon }: { title: string; children: React.ReactNode; required?: boolean; hint?: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
          {icon}{title}
          {required && <span className="text-[10px] text-rose-500 font-normal">required</span>}
        </div>
      </div>
      {hint && <p className="text-[11px] text-slate-500 mb-2">{hint}</p>}
      {children}
    </div>
  );
}

function Chip({ label, onRemove, icon }: { label: string; onRemove: () => void; icon?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 border border-orange-200 px-2 py-0.5 text-xs text-orange-900">
      {icon}
      <span>{label}</span>
      <button onClick={onRemove} className="text-orange-600 hover:text-orange-900 leading-none" aria-label="Remove">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

export default SparkLeadGenNewPage;
