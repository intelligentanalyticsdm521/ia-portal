// lib/leadgenSavedSearch.ts — the pure half of saved lead searches: the short
// lines the Lead Inbox strip shows, and "Edit and run" (Brandon, 2026-10-01: he
// saved "Home Services - Des Moines" and expects to open it later, change it and
// run it again).
//
// Pure on purpose — pinned by test/leadgen-saved-searches-inbox.test.mjs, so the
// form a saved search opens into can never disagree with what was saved.
//
// Where things live (Brandon, 2026-10-01: "The lead inbox should be the only
// place I have to go to get a new or saved search"): saved searches are the
// Saved Searches tab of the Lead Inbox. The old Saved Lead Searches page is
// gone; its address sends people to that tab.

import type { ExpandedKeyword } from "./leadgenCategories";

export const LEAD_INBOX_PATH = "/app/services/spark_lead_inbox";
/** The Lead Inbox's Saved Searches tab. */
export const SAVED_SEARCHES_PATH = `${LEAD_INBOX_PATH}?tab=saved`;
export const NEW_SEARCH_PATH = "/app/spark/leadgen/b2b_new";

/** The address that opens a saved search in the form, ready to change. */
export function editSearchPath(id: string | number): string {
  return `${NEW_SEARCH_PATH}?edit=${encodeURIComponent(String(id))}`;
}

/** One saved category as GET /api/v1/leadgen/profiles returns it: the topics it searched. */
export interface SavedCategory {
  id: number | null;
  name: string;
  custom: boolean;
  terms: string[];
}

/** A saved search as GET /api/v1/leadgen/profiles returns it. */
export interface SavedSearch {
  id: string;
  name: string;
  customer_category_id?: number | null;
  customer_category_name?: string | null;
  category_names?: string[] | null;
  search_mode?: string | null;
  state?: string | null;
  /** "Des Moines, IA" — the display strings the search runs on. */
  cities?: string[] | null;
  city_count?: number | null;
  term_count?: number | null;
  max_leads?: number | null;
  include_cold_leads?: boolean;
  last_run_at: string | null;
  last_run_lead_count: number | null;
  created_at: string;
  // ── what the form prefills from ──
  categories?: SavedCategory[];
  expanded_terms?: string[];
  city_hits?: Array<{ id: number; name: string; state: string }>;
  zip_codes?: string[];
  radius_miles?: number | null;
  max_results_per_run?: number | null;
  industry_id?: number | null;
  /** A search that was run without "Save this search" (the job still needed a row). */
  auto_saved?: boolean;
}

type SearchMode = "strict" | "focused" | "balanced" | "broad";
const MODES: readonly SearchMode[] = ["strict", "focused", "balanced", "broad"];

/** The form fields a saved search fills in — the same shape as the page's FormState. */
export interface PrefilledForm {
  categories: Array<{ id: number; name: string; industry_id: number | null; custom: boolean }>;
  terms: Array<{ id: number; term: string }>;
  searchMode: SearchMode;
  state: string;
  cities: Array<{ id: number; name: string; state: string }>;
  radiusMiles: number;
  zipMode: "auto" | "specify";
  zips: Array<{ zip: string }>;
  includeCold: boolean;
  maxLeads: number;
}

const norm = (s: string) => String(s || "").trim().toLowerCase();

/** The categories a saved search searched, oldest shape included. */
export function savedCategoriesOf(p: SavedSearch): SavedCategory[] {
  // A search run with typed topics only is stored as one NAMELESS group; it is
  // not a category, and its topics read back as typed ones.
  const named = (Array.isArray(p.categories) ? p.categories : []).filter((c) => c && String(c.name || "").trim());
  if (named.length) return named.map((c) => ({ ...c, terms: Array.isArray(c.terms) ? c.terms : [] }));
  // A row saved before categories were stored: its one taxonomy category, and
  // every topic it ran filed under it.
  if (p.customer_category_id && p.customer_category_name) {
    return [{ id: p.customer_category_id, name: p.customer_category_name, custom: false, terms: p.expanded_terms || [] }];
  }
  return [];
}

/**
 * The form a saved search opens into.
 *
 *   • every category, a custom one as custom (its name is also its first topic,
 *     exactly as typing it in would have done)
 *   • topics the person typed outside every category — the saved topics no
 *     category claims — back in the Search Topics box
 *   • state, cities (by id), radius, ZIPs (ZIP mode "specify" when there are any),
 *     mode, max leads, cold leads
 *
 * Removed topics are not stored; savedCategoriesOf(p)[i].terms are the topics
 * still ticked when it was saved, and excludedFromSaved() unticks the rest once
 * the categories have been expanded again.
 */
export function prefillFromSaved(p: SavedSearch, fallbackMaxLeads = 100): PrefilledForm {
  const cats = savedCategoriesOf(p);
  let synthetic = -1;
  const categories = cats.map((c) => ({
    id: !c.custom && c.id && c.id > 0 ? c.id : 0,
    name: c.name,
    industry_id: !c.custom && p.industry_id && c.id === p.customer_category_id ? p.industry_id : null,
    custom: !!c.custom || !(c.id && c.id > 0),
  }));
  const claimed = new Set(cats.flatMap((c) => c.terms.map(norm)));
  const terms: Array<{ id: number; term: string }> = [];
  const seen = new Set<string>();
  const addTerm = (t: string) => {
    const k = norm(t);
    if (!k || seen.has(k)) return;
    seen.add(k);
    terms.push({ id: synthetic--, term: t.trim() });
  };
  for (const c of categories) if (c.custom) addTerm(c.name);
  for (const t of p.expanded_terms || []) if (!claimed.has(norm(t))) addTerm(t);

  const zips = (p.zip_codes || []).map((z) => ({ zip: String(z) }));
  const mode = MODES.includes(p.search_mode as SearchMode) ? (p.search_mode as SearchMode) : "balanced";
  const maxLeads = Number(p.max_results_per_run ?? p.max_leads) || fallbackMaxLeads;
  return {
    categories,
    terms,
    searchMode: mode,
    state: p.state || "",
    cities: (p.city_hits || []).map((c) => ({ id: c.id, name: c.name, state: c.state || p.state || "" })),
    // A radius of 0 ("Exact") is saved as nothing, so nothing reads back as 0.
    radiusMiles: Number(p.radius_miles) || 0,
    zipMode: zips.length ? "specify" : "auto",
    zips,
    includeCold: !!p.include_cold_leads,
    maxLeads,
  };
}

/**
 * The topics to untick once a saved search's categories are expanded again: a
 * topic a saved category offers that is not among the topics it saved. Topics
 * outside every saved category (typed ones) are never unticked.
 */
export function excludedFromSaved(preview: ExpandedKeyword[], saved: SavedCategory[]): Set<string> {
  const keep = new Map(saved.map((c) => [norm(c.name), new Set(c.terms.map(norm))]));
  const out = new Set<string>();
  for (const k of preview) {
    const own = keep.get(norm(k.category || ""));
    if (own && !own.has(norm(k.term))) out.add(k.term);
  }
  return out;
}

/**
 * Which request a save makes. "Save" on a saved search that is open updates THAT
 * search (PATCH, same row). "Save as new search" — and Save on a fresh form —
 * creates a new one (POST) and leaves any original untouched.
 */
export function saveRequestFor(
  editingId: string | null,
  how: "save" | "save_as_new",
): { method: "patch" | "post"; path: string } {
  if (editingId && how === "save") {
    return { method: "patch", path: `/api/v1/leadgen/profiles/${encodeURIComponent(editingId)}` };
  }
  return { method: "post", path: "/api/v1/leadgen/profiles" };
}

/** "Electricians · Plumbers · snow removal" — every category the search asks. */
export function categoriesLine(p: SavedSearch): string {
  const cats = (p.category_names && p.category_names.length
    ? p.category_names
    : savedCategoriesOf(p).map((c) => c.name)).filter(Boolean);
  return cats.length ? cats.join(" · ") : "No category";
}

/** "IA · 4 cities · 15 mi radius" / "IA · 1 city · exact" / "IA · 2 ZIP codes". */
export function areaLine(p: SavedSearch): string {
  const parts: string[] = [];
  const list = Array.isArray(p.cities) ? p.cities : [];
  const cities = list.length || Number(p.city_count) || 0;
  const zips = (p.zip_codes || []).length;
  // One anchor city is named ("Des Moines, IA · 30 mi radius" — the run
  // searches every town within the radius); several are counted.
  const oneCity = cities === 1 && list.length === 1 ? String(list[0]) : null;
  if (p.state && !oneCity) parts.push(p.state);
  if (cities) {
    parts.push(oneCity || `${cities} cities`);
    const r = Number(p.radius_miles) || 0;
    parts.push(r > 0 ? `${r} mi radius` : "exact");
  }
  if (zips) parts.push(`${zips} ZIP code${zips === 1 ? "" : "s"}`);
  return parts.length ? parts.join(" · ") : "No area set";
}

/** "Last run 1 Oct 2026 · 12 leads found" / "4 leads found last time" / "Not run yet". */
export function lastRunLine(p: SavedSearch, locale?: string): string {
  const n0 = p.last_run_lead_count;
  if (!p.last_run_at) {
    // A run started from the form (not "Run again") leaves no date on the
    // saved search, but its result is still known.
    return typeof n0 === "number" ? `${n0} lead${n0 === 1 ? "" : "s"} found last time` : "Not run yet";
  }
  const d = new Date(p.last_run_at);
  const date = Number.isNaN(d.getTime())
    ? String(p.last_run_at)
    : d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  const n = p.last_run_lead_count;
  if (typeof n !== "number") return `Last run ${date}`;
  return `Last run ${date} · ${n} lead${n === 1 ? "" : "s"} found`;
}

/** Named searches first; searches that were run without saving kept apart. */
export function splitSavedSearches(list: SavedSearch[]): { named: SavedSearch[]; quick: SavedSearch[] } {
  const named: SavedSearch[] = [];
  const quick: SavedSearch[] = [];
  for (const p of list || []) (p.auto_saved ? quick : named).push(p);
  return { named, quick };
}
