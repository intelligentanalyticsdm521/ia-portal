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
import { Link, useNavigate } from "react-router-dom";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { LeadGenTermsLink, LeadGenTermsNotice } from "../../components/spark/LeadGenTermsLink";
import {
  type LeadGenCredits, type LeadGenForecast,
  BILLING_SETTINGS_ROUTE, fmtUsd, friendlyApiError, hasLeadsPackage, splitRun,
} from "../../lib/leadgenBilling";
import {
  type ExpandedKeyword, withTypedTopics, mergeExpansions, categoryPayloadFrom,
} from "../../lib/leadgenCategories";
import {
  Search, MapPin, Sparkles, DollarSign, Clock, Play, Save,
  X, ChevronDown, Check, Tag, Snowflake, Building2, Info, CreditCard, CalendarClock,
  Mailbox, Users, Lock,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type SearchMode = "strict" | "focused" | "balanced" | "broad";

// `custom: true` (id 0) = the customer typed a category the taxonomy does not have
// (Brandon 2026-09-04: "snow removal"). It is searchable through its topics and is
// queued for the category review server-side.
interface CategoryHit { id: number; name: string; industry_id?: number | null; is_curated?: boolean | number | null; custom?: boolean }
interface TermHit { id: number; term: string; weight?: number }
interface CityHit { id: number; name: string; state: string }
interface ZipHit { zip: string; city?: string; state?: string }
// Backend (/api/v1/leadgen/states) returns { id, abbr, name }. The form binds
// to `abbr` (the 2-letter postal code) because /leadgen/cities/autocomplete
// expects ?state=ABBR.
interface StateRow { id: number; abbr: string; name: string }

// A13 — the keyword shape and the three merge/attribution rules live in
// lib/leadgenCategories (pure, and pinned by test/leadgenCategories.test.mjs)
// so the preview can never disagree with what the server will actually run.
// Backend (/api/v1/leadgen/locations/expand) returns
// { data: { cities: [{id, name, lat, lon, miles}], zips, origin } }.
// Cities don't carry a state in the response (the request scoped them), but
// the page needs one for display — fill it from form.state on read.
interface ExpandedCity { city_id: number; name: string; state: string; miles: number }
interface ExpandLocResponse { cities: ExpandedCity[]; zip_count: number }

// ─────────────────────────────────────────────────────────────────────────────
// B18 — the search model chooser.
//
// SCOPE_GROWTH_GAPS §3B: a Find run looks for BUSINESSES or for HOUSEHOLDS, and
// that is a choice made here, before anything else on the form. Only B2B can be
// picked today. The other two cards are visible and locked on purpose: the model
// split is the honest answer to "can you find me homeowners", and a client who
// can see what is coming (and when, and with which limits) does not have to ask.
//
// The B2C card states the hard rule in the client's own words, because it is the
// rule they will be held to: direct mail only, and the system cannot store an
// email address or phone number for those records at all (C2/N2 + the CHECK
// constraints in LUMEN migration 164).
type SearchModel = "b2b" | "b2c_mail" | "blended";

const SEARCH_MODELS: Array<{
  key: SearchModel; label: string; blurb: string; note?: string;
  icon: typeof Building2; available: boolean;
}> = [
  {
    key: "b2b",
    label: "B2B (businesses)",
    blurb: "Businesses with a verified work email. Reach them by email, phone or post.",
    icon: Building2,
    available: true,
  },
  {
    key: "b2c_mail",
    label: "B2C direct mail only",
    blurb: "Households from a licensed list. We find households, you reach them by mail — no email or text, ever; the system cannot store them.",
    note: "Coming in October",
    icon: Mailbox,
    available: false,
  },
  {
    key: "blended",
    label: "Blended",
    blurb: "Businesses and households in one run.",
    note: "Coming",
    icon: Users,
    available: false,
  },
];

function ModelChooser({ value, onChange }: { value: SearchModel; onChange: (m: SearchModel) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {SEARCH_MODELS.map((m) => {
        const Icon = m.icon;
        const selected = value === m.key;
        return (
          <button
            key={m.key}
            type="button"
            disabled={!m.available}
            aria-pressed={selected}
            onClick={() => m.available && onChange(m.key)}
            className={[
              "text-left rounded-lg border p-3 transition",
              selected ? "border-[#EF6C33] bg-orange-50" : "border-slate-200 bg-white",
              m.available ? "hover:border-slate-300 cursor-pointer" : "opacity-60 cursor-not-allowed",
            ].join(" ")}
          >
            <div className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-800">
              <Icon className="h-3.5 w-3.5 text-slate-500" />
              {m.label}
              {!m.available && <Lock className="h-3 w-3 text-slate-400" />}
            </div>
            <p className="mt-1 text-[11px] leading-snug text-slate-600">{m.blurb}</p>
            {m.note && (
              <span className="mt-1.5 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                {m.note}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface FormState {
  // A13 — more than one Business Category in one search (D31).
  categories: CategoryHit[];
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
  categories: [],
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

// Slider bounds until /leadgen/credits answers (then the real package drives them).
const MAX_LEADS_CAP = 100;
// Slider step (Brandon 2026-09-04: one-off minimum 10, steps of 5). The server
// caps a run at 1000.
const LEADS_STEP = 5;
const LEADS_HARD_CAP = 1000;

const PACKAGE_LABEL: Record<string, string> = {
  essentials: "Essentials 50",
  growth: "Growth 100",
  authority: "Authority 150",
  override: "Sponsored allotment",
  none: "Pay per lead",
};

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
  /** Brandon 2026-09-04: "I should just be able to select this and it should say
   *  custom option." When set, the dropdown always offers a selectable row that
   *  hands the typed text back (label from customLabel). */
  onPickCustom?: (value: string) => void;
  customLabel?: (value: string) => string;
  /** A second, differently-typed suggestion list rendered under its own heading
   *  (e.g. matching search TOPICS while the user is in the CATEGORY box). */
  secondary?: { title: string; items: { key: string; label: React.ReactNode }[]; onPick: (key: string) => void };
  emptyText?: string;
  /** Enter key. Brandon 2026-09-04: "it says press Enter to add it as a custom
   *  term, but it doesn't accept me pressing enter" — it was never wired. */
  onEnter?: (value: string, firstResult: T | null) => void;
}

function AutocompleteCombo<T>({
  placeholder, value, onChange, results, loading, onPick, renderItem, disabled, icon,
  onPickCustom, customLabel, secondary, emptyText, onEnter,
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
          onKeyDown={(e) => {
            if (e.key === "Escape") { setOpen(false); return; }
            if (e.key !== "Enter") return;
            e.preventDefault();
            const txt = value.trim();
            if (!txt) return;
            if (onEnter) { onEnter(txt, results.length ? results[0] : null); setOpen(false); return; }
            if (results.length) { onPick(results[0]); setOpen(false); }
          }}
          placeholder={placeholder}
          className={`w-full text-sm border border-slate-300 rounded px-3 py-2 focus:outline-none focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33] disabled:bg-slate-50 disabled:text-slate-400 ${icon ? "pl-8" : ""}`}
        />
      </div>
      {open && (value.length > 0 || results.length > 0) && (
        <div className="absolute z-30 mt-1 w-full bg-white rounded-md border border-slate-200 shadow-lg max-h-60 overflow-y-auto">
          {loading && (
            <div className="px-3 py-2 text-xs text-slate-400">Searching…</div>
          )}
          {!loading && results.length === 0 && value.trim() && !onPickCustom && !(secondary && secondary.items.length) && (
            <div className="px-3 py-2 text-xs text-slate-400">{emptyText || "No matches — press Enter to add it as a custom term."}</div>
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
          {!loading && secondary && secondary.items.length > 0 && (
            <>
              <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide font-semibold text-slate-400 border-t border-slate-100">{secondary.title}</div>
              {secondary.items.map((it) => (
                <button
                  key={it.key}
                  type="button"
                  onClick={() => { secondary.onPick(it.key); setOpen(false); }}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-orange-50 hover:text-orange-900 flex items-center justify-between"
                >
                  {it.label}
                </button>
              ))}
            </>
          )}
          {!loading && onPickCustom && value.trim().length >= 2 && (
            <button
              type="button"
              onClick={() => { onPickCustom(value.trim()); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm border-t border-slate-100 text-[#EF6C33] hover:bg-orange-50 flex items-center gap-2"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>{customLabel ? customLabel(value.trim()) : `Use "${value.trim()}" as a custom option`}</span>
            </button>
          )}
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
  // B18 — the search model. Only "b2b" is selectable, so this is the value the
  // job is created with today; the B2C form and its adapter are step B19, after
  // the vendor contract. Held in its own state rather than in FormState because
  // nothing in the form below depends on it yet, and a field the submit payload
  // does not carry has no business pretending to be part of the form.
  const [model, setModel] = useState<SearchModel>("b2b");
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
  // Brandon 2026-09-04: "we should be able to deselect cities and expanded
  // keywords … so someone can say oh I don't want this general contractor."
  // Exclusions are kept by value so they survive a preview refresh; the job
  // runs exactly the ACTIVE lists (server prefers expanded_terms / expanded_city_ids).
  const [excludedTerms, setExcludedTerms] = useState<Set<string>>(new Set());
  const [excludedCityIds, setExcludedCityIds] = useState<Set<number>>(new Set());
  const toggleTerm = (term: string) => setExcludedTerms((prev) => { const n = new Set(prev); if (n.has(term)) n.delete(term); else n.add(term); return n; });
  const toggleCity = (id: number) => setExcludedCityIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const activeKw = useMemo(() => previewKw.filter((k) => !excludedTerms.has(k.term)), [previewKw, excludedTerms]);
  const activeCities = useMemo(() => previewLoc.cities.filter((c) => !excludedCityIds.has(c.city_id)), [previewLoc, excludedCityIds]);

  // Tenant billing facts — package, included/remaining leads this period, the
  // per-lead rate for extras (from Stripe), card on file. Drives the slider,
  // the live estimate and the Start gate. GET /leadgen/credits (LUMEN-API).
  const [credits, setCredits] = useState<LeadGenCredits | null>(null);

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

  // Load the billing facts once on mount. Silent-fail leaves credits=null so
  // the UI falls back to the legacy fixed cap; the server still enforces.
  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        // GET /api/v1/leadgen/credits → { data: LeadGenCredits }
        const r = await get<{ data: LeadGenCredits }>("/api/v1/leadgen/credits");
        if (r?.data) {
          const d = r.data;
          setCredits({
            ...d,
            included: Number(d.included) || 0,
            remaining: Number(d.remaining) || 0,
            delivered_this_period: Number(d.delivered_this_period) || 0,
            reserved_in_flight: Number(d.reserved_in_flight) || 0,
            rate_cents: Number(d.rate_cents) || 0,
            one_off_min: Number(d.one_off_min) || 10,
            card_on_file: !!d.card_on_file,
          });
          // A one-off run can't go under the minimum — lift the default if needed.
          const min = hasLeadsPackage(d) ? LEADS_STEP : Number(d.one_off_min) || 10;
          setForm((f) => (f.maxLeads < min ? { ...f, maxLeads: min } : f));
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

  // Search TOPICS that match what is typed in the CATEGORY box — so "snow" shows
  // "snow removal services" even though no category matches (Brandon 2026-09-04).
  const [catTermSuggestions, setCatTermSuggestions] = useState<TermHit[]>([]);
  useEffect(() => {
    if (!ready || catTop25Only || debouncedCat.trim().length < 2) { setCatTermSuggestions([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const r = await get<{ data: TermHit[] }>(`/api/v1/leadgen/terms/autocomplete?q=${encodeURIComponent(debouncedCat)}`);
        if (!cancelled) setCatTermSuggestions((r?.data || []).slice(0, 6));
      } catch {
        if (!cancelled) setCatTermSuggestions([]);
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
        const scoped = form.categories.find((c) => c.id > 0 && c.industry_id);
        const indParam = scoped?.industry_id ? `industry_id=${scoped.industry_id}&` : "";
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
  }, [debouncedTerm, get, ready, form.categories]);

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
  // A13 — one expansion PER selected category, so the preview shows what each
  // one contributes and the job can search them in rotation. A custom category
  // (id 0) has no taxonomy expansion; its own name is the seed.
  const kwInputs = useMemo(() => ({
    cats: form.categories.map((c) => ({ id: c.id > 0 ? c.id : null, name: c.name, custom: !!c.custom })),
    termTexts: form.terms.map((t) => t.term).sort(),
    mode: form.searchMode,
  }), [form.categories, form.terms, form.searchMode]);

  const debouncedKw = useDebounced(kwInputs, 350);

  useEffect(() => {
    if (!ready) return;
    // Custom-only searches (no taxonomy category, typed topics) still get a preview.
    if (!debouncedKw.cats.length && debouncedKw.termTexts.length === 0) {
      setPreviewKw([]); return;
    }
    let cancelled = false;
    setPreviewKwLoading(true);
    (async () => {
      // POST /api/v1/leadgen/expand body { keywords: [string], mode, category_id }
      // → { data: { terms: [{id, term, weight, source}], unknown, mode, threshold, stats } }
      type ExpandResp = { data: { terms: ExpandedKeyword[] } };
      const expandFor = async (cat: { id: number | null; name: string; custom: boolean } | null, first = false) => {
        // A custom category is seeded from its own NAME; a taxonomy category from
        // its id. The typed topics are sent with the first call only — sending them
        // with every category would file the same topic under whichever category
        // happened to be listed first, which is a guess, and we do not guess.
        const keywords = cat && cat.custom ? [cat.name] : (first || !cat ? debouncedKw.termTexts : []);
        try {
          const r = await post<ExpandResp>("/api/v1/leadgen/expand", {
            keywords,
            mode: debouncedKw.mode,
            category_id: cat ? cat.id : null,
          });
          const rows = (r?.data?.terms || []).map((k) => ({ ...k, category: cat ? cat.name : null }));
          // The typed topics themselves are always searched (the server seeds the
          // job from them when expansion has nothing) — show them in the preview
          // so a custom topic like "snow" never previews as "0 keywords".
          return withTypedTopics(rows, cat && cat.custom ? [cat.name] : [], cat ? cat.name : null);
        } catch {
          return withTypedTopics([], cat && cat.custom ? [cat.name] : [], cat ? cat.name : null);
        }
      };
      const lists = debouncedKw.cats.length
        ? await Promise.all(debouncedKw.cats.map((c, i) => expandFor(c, i === 0)))
        : [await expandFor(null, true)];
      // Topics the customer typed outside every category are still searched.
      const merged = withTypedTopics(mergeExpansions(lists), debouncedKw.termTexts, null);
      if (!cancelled) { setPreviewKw(merged); setPreviewKwLoading(false); }
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

  // ── derived (billing model, Brandon 2026-09-04) ────────────────────────
  // The slider may run PAST the included leads: extras are metered per run at
  // the tier rate ("20 more at $1.15 = $23.00 on your card ending 4242"). A
  // tenant without a Leads package pays per delivered lead, minimum 10 per run.
  const subscriber = hasLeadsPackage(credits);
  const minLeads = credits ? (subscriber ? LEADS_STEP : credits.one_off_min) : 10;
  const dynamicMaxCap = credits
    ? Math.min(LEADS_HARD_CAP, Math.max(100, Math.ceil((credits.remaining + 100) / 50) * 50))
    : MAX_LEADS_CAP;
  const split = useMemo(() => splitRun(credits, form.maxLeads), [credits, form.maxLeads]);
  const needsCard = !!credits && split.metered > 0 && !credits.card_on_file;
  const pricingUnavailable = !!credits && split.metered > 0 && credits.rate_source !== "stripe";

  // Estimated cost = the metered portion at the real per-lead rate (delivered
  // leads only — fewer delivered means a smaller invoice).
  // A13 — each selected category travels with the terms it actually contributed,
  // taken from the ACTIVE preview so a keyword the customer switched off is not
  // searched under any category. The server round-robins these lists.
  const categoryPayload = useMemo(
    () => categoryPayloadFrom(form.categories, activeKw),
    [form.categories, activeKw],
  );

  const estCostUsd = split.meteredCents / 100;
  const estTimeStr = "4–7 min";

  // ── X1 pre-run forecast ────────────────────────────────────────────────
  // The server measures the pool with a handful of FREE Hunter Discover calls
  // and answers with a BAND and, when the search looks tight, one soft sentence.
  // We show the sentence and nothing else — there is never a count in here, and
  // it never blocks Start Search or widens anything on the customer's behalf.
  // The server caches its measurement for 10 minutes, so re-previewing is free.
  const [forecast, setForecast] = useState<LeadGenForecast | null>(null);
  const forecastInputs = useMemo(() => ({
    cats: categoryPayload,
    terms: activeKw.map((k) => k.term),
    cityIds: activeCities.map((c) => c.city_id),
    state: form.state,
    target: form.maxLeads,
  }), [categoryPayload, activeKw, activeCities, form.state, form.maxLeads]);
  const debouncedForecast = useDebounced(forecastInputs, 700);

  useEffect(() => {
    if (!ready) return;
    const f = debouncedForecast;
    if (!f.terms.length || !f.cityIds.length) { setForecast(null); return; }
    let cancelled = false;
    (async () => {
      try {
        // POST /api/v1/leadgen/estimate → { data: { …, forecast: { band, message } } }
        type EstimateResp = { data?: { forecast?: LeadGenForecast | null } };
        const r = await post<EstimateResp>("/api/v1/leadgen/estimate", {
          target_count: f.target,
          max_leads: f.target,
          categories: f.cats,
          expanded_terms: f.terms,
          expanded_city_ids: f.cityIds,
          state: f.state,
        });
        if (!cancelled) setForecast(r?.data?.forecast ?? null);
      } catch {
        // A forecast is a courtesy. Losing it must never colour the page.
        if (!cancelled) setForecast(null);
      }
    })();
    return () => { cancelled = true; };
  }, [debouncedForecast, post, ready]);

  // Brandon 2026-09-04: a topic that is not a taxonomy category ("snow removal")
  // must still be searchable — a custom search topic is enough; the server seeds
  // the job from it and queues it for the quarterly category review.
  const hasSeed = form.categories.length > 0 || form.terms.length > 0;
  const canSubmit =
    hasSeed &&
    !!form.state &&
    (form.cities.length > 0 || form.zips.length > 0) &&
    (previewKw.length === 0 || activeKw.length > 0) &&
    (previewLoc.cities.length === 0 || activeCities.length > 0) &&
    form.maxLeads >= minLeads &&
    !needsCard &&
    !pricingUnavailable &&
    !submitting;

  // ── handlers ───────────────────────────────────────────────────────────
  function addTerm(t: TermHit) {
    if (form.terms.some((x) => x.id === t.id || x.term.toLowerCase() === t.term.toLowerCase())) return;
    setForm({ ...form, terms: [...form.terms, t] });
    setTermQuery("");
  }
  function addCustomTermText(raw: string) {
    const txt = raw.trim();
    if (!txt) return;
    if (form.terms.some((x) => x.term.toLowerCase() === txt.toLowerCase())) { setTermQuery(""); return; }
    // Custom terms use a synthetic negative id so the backend knows it's free-text.
    setForm({ ...form, terms: [...form.terms, { id: -Date.now(), term: txt }] });
    setTermQuery("");
  }
  function addCustomTerm() { addCustomTermText(termQuery); }
  // Enter in the topics box: an exact taxonomy match is taken as-is, anything else
  // is added as a custom term (the placeholder always promised this).
  function onTopicEnter(txt: string, first: TermHit | null) {
    if (first && first.term.toLowerCase() === txt.toLowerCase()) { addTerm(first); return; }
    addCustomTermText(txt);
  }
  // A13 — add a category to the list; picking the same one twice is a no-op.
  function addCategory(c: CategoryHit) {
    const dup = form.categories.some((x) => (c.id > 0 ? x.id === c.id : x.name.toLowerCase() === c.name.toLowerCase()));
    if (!dup) setForm({ ...form, categories: [...form.categories, c] });
    setCatQuery("");
  }
  function removeCategory(c: CategoryHit) {
    setForm({
      ...form,
      categories: form.categories.filter((x) => x !== c),
      // A custom category put its own name in as a topic; take it back out with it.
      terms: c.custom ? form.terms.filter((t) => t.term.toLowerCase() !== c.name.toLowerCase()) : form.terms,
    });
  }
  // Enter in the category box: exact category match wins, else custom category.
  function onCategoryEnter(txt: string, first: CategoryHit | null) {
    if (first && first.name.toLowerCase() === txt.toLowerCase()) { addCategory(first); return; }
    if (!catTop25Only) pickCustomCategory(txt);
    else if (first) addCategory(first);
  }
  // Brandon 2026-09-04: a typed category with no taxonomy match becomes a CUSTOM
  // category — and its text is also the first search topic, so the preview and the
  // job have a seed. Server-side the term is queued for the category review.
  function pickCustomCategory(txt: string) {
    const name = txt.trim();
    if (!name) return;
    if (form.categories.some((x) => x.name.toLowerCase() === name.toLowerCase())) { setCatQuery(""); return; }
    const already = form.terms.some((x) => x.term.toLowerCase() === name.toLowerCase());
    setForm({
      ...form,
      categories: [...form.categories, { id: 0, name, industry_id: null, custom: true }],
      terms: already ? form.terms : [...form.terms, { id: -Date.now(), term: name }],
    });
    setCatQuery("");
  }
  // A search TOPIC picked from the category box: custom category named after it,
  // and the taxonomy term itself (positive id) becomes the seed for expansion.
  function pickTermAsCategory(t: TermHit) {
    if (form.categories.some((x) => x.name.toLowerCase() === t.term.toLowerCase())) { setCatQuery(""); return; }
    const already = form.terms.some((x) => x.id === t.id || x.term.toLowerCase() === t.term.toLowerCase());
    setForm({
      ...form,
      categories: [...form.categories, { id: 0, name: t.term, industry_id: null, custom: true }],
      terms: already ? form.terms : [...form.terms, t],
    });
    setCatQuery("");
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
    // Legacy single-category keys: kept so an older server (and the saved-profile
    // row's own columns) still see the first taxonomy category.
    customer_category_id: form.categories.find((c) => c.id > 0)?.id ?? null,
    industry_id: form.categories.find((c) => c.id > 0)?.industry_id ?? null,
    // custom category (no taxonomy match) — the server queues it for the category review
    custom_category_text: form.categories.find((c) => c.custom)?.name ?? null,
    categories: categoryPayload,
    terms: form.terms.map((t) => ({ id: t.id > 0 ? t.id : null, term: t.term })),
    // 2026-09-04 — the job must run exactly what the Live Preview showed. The
    // preview's expanded keyword list and radius-resolved cities go with the
    // request; the raw form (manual topics, anchor cities) stays for the record.
    // Only the ACTIVE (not deselected) keywords and cities go to the job.
    expanded_terms: activeKw.map((t) => t.term),
    expanded_city_ids: activeCities.map((c) => c.city_id),
    search_mode: form.searchMode,
    state: form.state,
    city_ids: form.cities.map((c) => c.id),
    radius_miles: form.radiusMiles,
    zip_mode: form.zipMode,
    zips: form.zips.map((z) => z.zip),
    include_cold_leads: form.includeCold,
    max_leads: form.maxLeads,
  }), [form, activeKw, activeCities, categoryPayload]);

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
      // 400 under the one-off minimum · 402 no card on file · 503 pricing not set up
      setError(friendlyApiError(err));
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
      help="Set your categories, location, and search mode. Pick more than one category and the search asks each of them in turn. The live preview on the right shows expanded keywords, resolved cities/ZIPs, estimated cost and estimated runtime, and tells you when a search looks too strict to fill your order. Nothing runs (and you're not charged) until you click Start Search."
      actions={<LeadGenTermsLink />}
      error={error}
      loading={false}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 p-1">
        {/* ─── LEFT: form ──────────────────────────────────────────────── */}
        <div className="space-y-6">
          {/* B18 — what kind of thing are we looking for? First question on the
              form, because it changes every answer under it. Only B2B runs
              today; the B2C card is the explainer, not a form. */}
          <Section
            title="What are we looking for?"
            hint="Businesses today. Household lists for postcards arrive in October — and they stay postcard-only."
          >
            <ModelChooser value={model} onChange={setModel} />
          </Section>

          {/* Business Categories (A13 — more than one per run) */}
          <Section
            title="Business Categories"
            hint="Add one or more. Each category brings its own search topics, and the search asks them in turn so one category cannot crowd out another. Remove any topic you don't want in the preview pane."
          >
            {form.categories.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {form.categories.map((c) => (
                  <Chip
                    key={`${c.id}:${c.name}`}
                    label={c.custom ? `${c.name} · custom` : c.name}
                    onRemove={() => removeCategory(c)}
                    icon={<Building2 className="h-3 w-3" />}
                  />
                ))}
              </div>
            )}
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
                    : form.categories.length
                      ? "Add another business category"
                      : "Start typing a business category (e.g. plumbing contractors)"}
                  value={catQuery}
                  onChange={setCatQuery}
                  results={catResults}
                  loading={catLoading}
                  onPick={addCategory}
                  renderItem={(c) => (
                    <span className="flex-1 flex items-center justify-between">
                      <span className="font-medium">{c.name}</span>
                      {c.is_curated ? (
                        <span className="text-[10px] text-amber-300 ml-2">Top 25</span>
                      ) : null}
                    </span>
                  )}
                  icon={<Building2 className="h-3.5 w-3.5" />}
                  secondary={catTermSuggestions.length ? {
                    title: "Search topics that match",
                    items: catTermSuggestions.map((t) => ({ key: String(t.id), label: <span className="flex-1 flex items-center gap-2"><Tag className="h-3 w-3 text-slate-400" /><span>{t.term}</span></span> })),
                    onPick: (key) => { const t = catTermSuggestions.find((x) => String(x.id) === key); if (t) pickTermAsCategory(t); },
                  } : undefined}
                  onPickCustom={catTop25Only ? undefined : pickCustomCategory}
                  customLabel={(v) => `Use "${v}" as a custom category`}
                  onEnter={onCategoryEnter}
                />
            </>
          </Section>

          {/* Search Topics */}
          <Section
            title="Search Topics"
            hint="Specific topics you want searched. Type one and press Enter."
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
              onEnter={onTopicEnter}
              onPickCustom={addCustomTermText}
              customLabel={(v) => `Add "${v}" as a custom topic`}
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
                    ? subscriber
                      ? `${credits.remaining.toLocaleString()} of ${credits.included.toLocaleString()} included left this period`
                      : `${fmtUsd(credits.rate_cents)} per lead · minimum ${credits.one_off_min}`
                    : `Tier cap: ${MAX_LEADS_CAP}`}
                </span>
              </label>
              <div className="mt-0.5 flex items-center gap-2">
                <input
                  type="range"
                  min={minLeads}
                  max={dynamicMaxCap}
                  step={LEADS_STEP}
                  value={form.maxLeads}
                  onChange={(e) => setForm({ ...form, maxLeads: Number(e.target.value) })}
                  className="flex-1 accent-[#EF6C33]"
                />
                <span className="text-sm font-semibold text-slate-900 tabular-nums w-12 text-right">{form.maxLeads}</span>
              </div>
              {/* Live estimate — the same split the server bills: included first, then metered. */}
              {credits && (
                <p className="text-[11px] mt-1.5 text-slate-700" data-testid="leadgen-estimate-line">
                  {subscriber ? (
                    <>
                      <span className="font-semibold">{split.fromCredits.toLocaleString()}</span> included this period
                      {split.metered > 0 ? (
                        <>
                          {" · "}<span className="font-semibold">{split.metered.toLocaleString()}</span> more at {fmtUsd(credits.rate_cents)} ={" "}
                          <span className="font-semibold">{fmtUsd(split.meteredCents)}</span>
                          {credits.card_on_file ? ` on your card ending ${credits.card_last4 ?? "····"}` : ""}
                        </>
                      ) : " — no charge for this run"}
                    </>
                  ) : (
                    <>
                      {fmtUsd(credits.rate_cents)} per lead · minimum {credits.one_off_min} · up to{" "}
                      <span className="font-semibold">{fmtUsd(split.meteredCents)}</span>
                      {credits.card_on_file ? ` on your card ending ${credits.card_last4 ?? "····"}` : ""}
                    </>
                  )}
                </p>
              )}
              {needsCard && (
                <p className="text-[11px] text-amber-800 mt-1 font-medium flex items-center gap-1.5">
                  <CreditCard className="h-3 w-3" />
                  {subscriber
                    ? `${split.metered} of these leads are beyond your included ${credits!.included}. `
                    : "Pay-per-lead searches need a card on file. "}
                  <Link to={BILLING_SETTINGS_ROUTE} className="underline text-[#B84817] hover:text-[#EF6C33]">Add a card in Billing</Link>
                  {subscriber ? " or lower the max." : "."}
                </p>
              )}
              {pricingUnavailable && !needsCard && (
                <p className="text-[11px] text-amber-800 mt-1 font-medium">
                  Per-lead pricing isn't available right now — runs within your included leads still work.
                </p>
              )}
              <p className="text-[11px] text-slate-500 mt-1">
                Billed per <strong>delivered</strong> lead only. {subscriber
                  ? "Leads beyond your included allowance are invoiced when the run finishes."
                  : "A SPARK Leads package includes leads every month at a lower rate and unlocks scheduled searches."}
              </p>
            </div>
          </Section>
        </div>

        {/* ─── RIGHT: live preview panel ───────────────────────────────── */}
        <aside className="lg:sticky lg:top-4 self-start space-y-4">
          {/* Usage / plan pool — visible at the TOP so the customer always
              sees what they have available before they commit to a run. */}
          {credits && subscriber && (() => {
            const used = Math.max(0, credits.included - credits.remaining);
            const pct = credits.included > 0
              ? Math.min(100, Math.round((used / credits.included) * 100))
              : 0;
            const barColor = pct >= 90 ? "bg-rose-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";
            const periodEnd = credits.period_end ? new Date(credits.period_end).toLocaleDateString() : null;
            return (
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-700">Included leads</div>
                  <div className="text-[10px] text-slate-400">{PACKAGE_LABEL[credits.package] ?? credits.package}</div>
                </div>
                <div className="flex items-baseline gap-1.5 mb-2">
                  <span className="text-2xl font-bold text-slate-900 tabular-nums">{credits.remaining.toLocaleString()}</span>
                  <span className="text-xs text-slate-500">/ {credits.included.toLocaleString()} left{periodEnd ? ` · renews ${periodEnd}` : " this period"}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                  <span>{used.toLocaleString()} used</span>
                  <span>Extra leads {fmtUsd(credits.rate_cents)} each, per run</span>
                </div>
              </div>
            );
          })()}
          {credits && !subscriber && (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-700">Pay per lead</div>
                <div className="text-[10px] text-slate-400">no Leads package</div>
              </div>
              <div className="flex items-baseline gap-1.5 mb-1">
                <span className="text-2xl font-bold text-slate-900 tabular-nums">{fmtUsd(credits.rate_cents)}</span>
                <span className="text-xs text-slate-500">per delivered lead · minimum {credits.one_off_min} per run</span>
              </div>
              <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                <CreditCard className="h-3 w-3" />
                {credits.card_on_file
                  ? `Card on file ending ${credits.card_last4 ?? "····"}`
                  : <>No card on file — <Link to={BILLING_SETTINGS_ROUTE} className="underline hover:text-slate-800">add one in Billing</Link></>}
              </div>
            </div>
          )}
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
                <span className="text-slate-400 tabular-nums">
                  {previewKwLoading ? "…" : excludedTerms.size ? `${activeKw.length} of ${previewKw.length}` : previewKw.length}
                </span>
              </div>
              {previewKw.length === 0 && !previewKwLoading && (
                <div className="text-[11px] text-slate-400 italic">Pick a category or add a search topic to see expansion.</div>
              )}
              {previewKw.length > 0 && (
                <div className="text-[10px] text-slate-400 mb-1">Click a keyword to leave it out of this search.</div>
              )}
              <ul className="space-y-0.5 max-h-44 overflow-y-auto">
                {previewKw.map((k) => {
                  const off = excludedTerms.has(k.term);
                  return (
                    <li key={k.term}>
                      <button
                        type="button"
                        onClick={() => toggleTerm(k.term)}
                        title={off ? "Excluded — click to include" : "Included — click to exclude"}
                        className={`w-full flex items-center gap-2 text-[12px] text-left rounded px-1 -mx-1 hover:bg-slate-50 ${off ? "text-slate-400 line-through" : "text-slate-800"}`}
                      >
                        {off ? <X className="h-3 w-3 text-slate-400 flex-shrink-0" /> : <Check className="h-3 w-3 text-emerald-600 flex-shrink-0" />}
                        <span className="truncate">{k.term}</span>
                        {form.categories.length > 1 && k.category && (
                          <span className="text-[9px] text-slate-500 bg-slate-100 rounded px-1 py-px flex-shrink-0 ml-auto max-w-[9rem] truncate" title={k.category}>{k.category}</span>
                        )}
                        {k.weight < 1 && <span className={`text-[9px] text-slate-400 tabular-nums ${form.categories.length > 1 && k.category ? "" : "ml-auto"}`}>w {k.weight.toFixed(2)}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {previewKw.length > 0 && activeKw.length === 0 && (
                <div className="text-[11px] text-red-600 mt-1">Keep at least one keyword.</div>
              )}
            </div>

            {/* Locations */}
            <div className="px-4 py-3 border-b border-slate-100">
              <div className="text-[11px] font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5"><MapPin className="h-3 w-3" /> Locations</span>
                <span className="text-slate-400 tabular-nums">
                  {previewLocLoading
                    ? "…"
                    : `${excludedCityIds.size ? `${activeCities.length} of ` : ""}${previewLoc.cities.length} cit${previewLoc.cities.length === 1 ? "y" : "ies"} · ${previewLoc.zip_count} ZIPs`}
                </span>
              </div>
              {previewLoc.cities.length === 0 && !previewLocLoading && (
                <div className="text-[11px] text-slate-400 italic">Add a state and at least one city or ZIP.</div>
              )}
              {previewLoc.cities.length > 0 && (
                <div className="text-[10px] text-slate-400 mb-1">Click a city to leave it out of this search.</div>
              )}
              <ul className="space-y-0.5 max-h-44 overflow-y-auto">
                {previewLoc.cities.map((c) => {
                  const off = excludedCityIds.has(c.city_id);
                  return (
                    <li key={c.city_id}>
                      <button
                        type="button"
                        onClick={() => toggleCity(c.city_id)}
                        title={off ? "Excluded — click to include" : "Included — click to exclude"}
                        className={`w-full flex items-center gap-2 text-[12px] text-left rounded px-1 -mx-1 hover:bg-slate-50 ${off ? "text-slate-400 line-through" : "text-slate-800"}`}
                      >
                        {off ? <X className="h-3 w-3 text-slate-400 flex-shrink-0" /> : <Check className="h-3 w-3 text-emerald-600 flex-shrink-0" />}
                        <span className="truncate">{c.name}, {c.state}</span>
                        <span className="text-[9px] text-slate-400 tabular-nums ml-auto">{c.miles.toFixed(0)} mi</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {previewLoc.cities.length > 0 && activeCities.length === 0 && (
                <div className="text-[11px] text-red-600 mt-1">Keep at least one city.</div>
              )}
            </div>

            {/* Cost + time */}
            <div className="px-4 py-3 grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide flex items-center gap-1"><DollarSign className="h-3 w-3" /> Est. cost</div>
                <div className="text-lg font-bold text-slate-900 tabular-nums mt-0.5">${estCostUsd.toFixed(2)}</div>
                <div className="text-[10px] text-slate-400 leading-tight">
                  {credits
                    ? split.metered > 0
                      ? `${split.metered} × ${fmtUsd(credits.rate_cents)} · delivered leads only`
                      : "Within your included leads"
                    : "Loading your plan…"}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide flex items-center gap-1"><Clock className="h-3 w-3" /> Est. time</div>
                <div className="text-lg font-bold text-slate-900 mt-0.5">{estTimeStr}</div>
                <div className="text-[10px] text-slate-400 leading-tight">Average for V1 jobs</div>
              </div>
            </div>

            {/* X1 — the pre-run forecast. Quiet when the search looks fine, and
                quiet when we could not take a reading; one soft, directional
                sentence when it looks tight. Never a number, never a blocker,
                and we never widen the search ourselves. Same slate card as the
                job page's "About this search". */}
            {forecast?.message && (
              <div className="mx-4 mb-3 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 flex items-start gap-2">
                <Sparkles className="h-4 w-4 text-slate-600 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-[12px] font-semibold text-slate-900">About this search</div>
                  <p className="text-[11px] text-slate-700 mt-0.5 leading-relaxed">{forecast.message}</p>
                </div>
              </div>
            )}

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
              {needsCard && (
                <p className="text-[11px] text-amber-800 text-center flex items-center justify-center gap-1">
                  <CreditCard className="h-3 w-3" />
                  <Link to={BILLING_SETTINGS_ROUTE} className="underline font-medium">Add a card in Billing</Link> to start this search.
                </p>
              )}
              <LeadGenTermsNotice />
              <button
                type="button"
                onClick={() => setShowSaveModal(true)}
                disabled={!hasSeed}
                className="w-full rounded-md border border-slate-300 bg-white text-slate-700 text-xs font-medium py-1.5 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                <Save className="h-3 w-3" /> Save this search
              </button>
              {/* Decision B5: scheduled (recurring) searches are a subscriber feature. */}
              {credits && !subscriber && (
                <p className="text-[11px] text-slate-500 text-center flex items-center justify-center gap-1.5">
                  <CalendarClock className="h-3 w-3 text-slate-400" />
                  Recurring (scheduled) searches are included with a SPARK Leads package.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-[11px] text-slate-500 leading-relaxed">
            <Info className="h-3 w-3 inline-block mr-1 text-slate-400" />
            Billed per delivered lead. If we find fewer than your max, you&apos;re only charged for what we deliver — the invoice
            and receipt arrive by email when the run finishes and are listed under Lead Inbox → Billing.
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

function Section({ title, children, required, requiredLabel, hint, icon }: { title: string; children: React.ReactNode; required?: boolean; requiredLabel?: string; hint?: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
          {icon}{title}
          {required && <span className="text-[10px] text-rose-500 font-normal normal-case tracking-normal">{requiredLabel || "required"}</span>}
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
