// GlobalSearch — F-117.
//
// Static-only route lookup palette opened with Cmd/Ctrl+K from anywhere.
// Filters routes by what the tenant has access to (enabledServices). Pure
// navigation — no records, no actions, no quick-actions. The ARGUS chatbot
// (F-120) handles dynamic help with records and actions.
//
// IadmModal at size="nav" (560×50vh) per F-107.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { IadmModal } from "./IadmModal";
import { useAppState } from "../app/AppState";
import { SERVICE_CATALOG, type PortalService } from "../config/serviceCatalog";

interface SearchableRoute {
  key: string;
  label: string;
  product: string;
  route: string;
  description: string;
  keywords: string;
}

// Map a service's `section` to the underlying tenant service-key that
// indicates the tenant is on that product. SERVICE_CATALOG uses 'LUMEN'
// as the section tag for SPARK (legacy).
const SECTION_TO_SERVICE_KEY: Record<PortalService["section"], string | null> = {
  Shared: null,        // always available
  ARION: "arion",
  OLIVER: "oliver",
  LUMEN: "lumen",      // SPARK on the backend is still 'lumen'
  STELLA: "stella",
  FORGE: "forge",
  ARGUS: "argus",
  CONSULTING: "consulting",
};

function buildSearchableRoutes(activeServices: Set<string>): SearchableRoute[] {
  return SERVICE_CATALOG
    .filter((s) => {
      if (s.defaultStatus === "coming_soon") return false;
      const required = SECTION_TO_SERVICE_KEY[s.section];
      if (!required) return true; // Shared section always visible
      return activeServices.has(required);
    })
    .map((s) => ({
      key: s.key,
      label: s.displayName,
      product: s.section,
      route: s.route,
      description: s.description,
      keywords: `${s.displayName} ${s.section} ${s.description}`.toLowerCase(),
    }));
}

function score(item: SearchableRoute, query: string): number {
  if (!query) return 0;
  const q = query.toLowerCase().trim();
  const label = item.label.toLowerCase();
  if (label === q) return 1000;
  if (label.startsWith(q)) return 500;
  if (label.includes(q)) return 100;
  // Word boundary in description / product / keywords
  if (item.keywords.includes(q)) return 50;
  // Multi-word query: each word must appear somewhere
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length > 1 && words.every((w) => item.keywords.includes(w))) return 30;
  return 0;
}

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { active } = useAppState();
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);

  // Section-level filter: any product the tenant has an active subscription
  // for shows ALL its routes (not just the coarse keys that enabledServices
  // carries). active.services has serviceKey ('oliver', 'arion', 'lumen').
  const activeServices = useMemo(() => {
    const s = new Set<string>();
    for (const svc of active?.services || []) {
      const k = String(svc.serviceKey || "").trim().toLowerCase();
      if (k) s.add(k);
    }
    return s;
  }, [active]);

  const routes = useMemo(() => buildSearchableRoutes(activeServices), [activeServices]);

  const results = useMemo(() => {
    if (!query.trim()) {
      // No query: show ~12 most-common entry points (Overview, Plan & Pricing,
      // each product's main board). Fixed sort for predictability.
      const featured = [
        "portal_overview", "settings_business_profile", "settings_plan_pricing",
        "oliver_job_board", "oliver_contacts", "oliver_portals_hub",
        "spark_overview", "spark_contacts", "spark_campaigns",
        "arion_dashboard", "arion_seo_overview",
      ];
      const set = new Set(featured);
      return routes.filter((r) => set.has(r.key)).slice(0, 12);
    }
    return routes
      .map((r) => ({ r, s: score(r, query) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 12)
      .map((x) => x.r);
  }, [query, routes]);

  useEffect(() => { setSelectedIdx(0); }, [query]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && results[selectedIdx]) {
        e.preventDefault();
        navigate(results[selectedIdx].route);
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, results, selectedIdx, navigate, onClose]);

  const productAccent: Record<string, string> = {
    OLIVER: "#FEC82C", SPARK: "#EF6C33", ARION: "#38BDF8",
    LUMEN: "#EF6C33", STELLA: "#7C3AED", FORGE: "#0F766E",
    ARGUS: "#84CC16", Shared: "#64748B", CONSULTING: "#1A3A4A",
  };

  return (
    <IadmModal
      open={open}
      onClose={onClose}
      product="argus"
      eyebrow="QUICK NAV · ⌘K"
      title="Where do you want to go?"
      subtitle="Search any page across your platform"
      size="nav"
    >
      <div className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a page name (Plan, Contacts, Booking…)"
            autoFocus
            className="w-full rounded-md border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-[#84CC16] focus:ring-1 focus:ring-[#84CC16]"
          />
        </div>
        <div className="mt-2 -mx-1 max-h-[36vh] overflow-y-auto">
          {results.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-slate-500">
              No matching routes. Try the ARGUS chatbot for help finding what you need.
            </div>
          )}
          {results.map((r, i) => (
            <button
              key={r.key}
              type="button"
              onClick={() => { navigate(r.route); onClose(); }}
              onMouseEnter={() => setSelectedIdx(i)}
              className={`w-full text-left px-3 py-2 rounded-md flex items-center gap-3 ${
                i === selectedIdx ? "bg-slate-100" : "hover:bg-slate-50"
              }`}
            >
              <span
                className="inline-block h-2 w-2 rounded-full flex-shrink-0"
                style={{ background: productAccent[r.product] || "#94A3B8" }}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-900 truncate">{r.label}</div>
                <div className="text-[11px] text-slate-500 truncate">{r.product} · {r.route}</div>
              </div>
              <kbd className="text-[10px] text-slate-400 font-mono">↵</kbd>
            </button>
          ))}
        </div>
        <div className="mt-2 px-2 text-[10px] text-slate-400 flex items-center justify-between">
          <span>↑↓ to navigate · ↵ to open</span>
          <span>Need help? Ask ARGUS →</span>
        </div>
      </div>
    </IadmModal>
  );
}

export default GlobalSearch;
