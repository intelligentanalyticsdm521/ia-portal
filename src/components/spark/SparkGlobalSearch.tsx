import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, User, Building2, Briefcase, List as ListIcon, ArrowRight } from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";

interface ContactHit { id: number; first_name: string; last_name: string; email: string; company: string; account_name: string | null; }
interface CompanyHit { id: number; name: string; domain: string | null; industry: string | null; contact_count: number; }
interface DealHit { id: number; title: string; value: number; currency: string; status: string; stage_name: string | null; }
interface ListHit { id: number; name: string; description: string | null; contact_count: number; }

interface SearchResults {
  contacts: ContactHit[];
  companies: CompanyHit[];
  deals: DealHit[];
  lists: ListHit[];
}

/**
 * SparkGlobalSearch — top-bar search across contacts / companies / deals / lists.
 *
 * Cmd/Ctrl+K opens, Esc closes, arrow keys navigate results, Enter goes to
 * the selected one. Debounced 200ms.
 */
export function SparkGlobalSearch() {
  const navigate = useNavigate();
  const { get, ready } = useSparkApi();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd/Ctrl+K to open
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Focus when opened
  useEffect(() => {
    if (open) inputRef.current?.focus();
    else setQ("");
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!q || q.length < 2 || !ready) {
      setResults(null);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await get<{ data: SearchResults }>(`/api/v1/search?q=${encodeURIComponent(q)}`);
        setResults(r.data);
      } catch {
        setResults(null);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q, get, ready]);

  const go = useCallback((url: string) => {
    setOpen(false);
    navigate(url);
  }, [navigate]);

  const totalHits = results
    ? results.contacts.length + results.companies.length + results.deals.length + results.lists.length
    : 0;

  return (
    <>
      {/* Trigger — inline in the page header (or anywhere) */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-3 h-8 text-xs text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-md transition"
      >
        <Search className="h-3.5 w-3.5" />
        <span>Search</span>
        <kbd className="ml-2 px-1.5 py-0.5 text-[10px] font-mono bg-white border border-slate-300 rounded">⌘K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]">
          {/* Backdrop */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40"
            aria-label="Close"
          />

          {/* Modal */}
          <div className="relative w-[640px] max-w-[92vw] bg-white rounded-xl shadow-2xl overflow-hidden">
            {/* Search input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
              <Search className="h-4 w-4 text-slate-400 flex-shrink-0" />
              <input
                ref={inputRef}
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Search contacts, companies, deals, lists…"
                className="flex-1 text-sm bg-transparent border-0 outline-none placeholder:text-slate-400"
              />
              {loading && <span className="text-xs text-slate-400">Searching…</span>}
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-slate-100">
                <X className="h-4 w-4 text-slate-400" />
              </button>
            </div>

            {/* Results */}
            <div className="max-h-[60vh] overflow-y-auto">
              {q.length < 2 ? (
                <div className="px-4 py-8 text-center text-xs text-slate-400">
                  Type at least 2 characters to search
                </div>
              ) : !results || totalHits === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-slate-400">
                  {loading ? "Searching…" : `No results for "${q}"`}
                </div>
              ) : (
                <div>
                  {results.contacts.length > 0 && (
                    <ResultGroup title="Contacts" count={results.contacts.length}>
                      {results.contacts.map(c => (
                        <ResultRow key={c.id} icon={User} onClick={() => go("/app/services/spark_contacts")}>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{c.first_name} {c.last_name}</div>
                            <div className="text-xs text-slate-500 truncate">{c.email} {c.account_name && <span className="ml-1">· {c.account_name}</span>}</div>
                          </div>
                        </ResultRow>
                      ))}
                    </ResultGroup>
                  )}

                  {results.companies.length > 0 && (
                    <ResultGroup title="Companies" count={results.companies.length}>
                      {results.companies.map(c => (
                        <ResultRow key={c.id} icon={Building2} onClick={() => go("/app/services/spark_accounts")}>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{c.name}</div>
                            <div className="text-xs text-slate-500 truncate">
                              {c.domain && <span className="font-mono">{c.domain}</span>}
                              {c.industry && <span> · {c.industry}</span>}
                              <span className="ml-1">· {c.contact_count} contact{c.contact_count === 1 ? "" : "s"}</span>
                            </div>
                          </div>
                        </ResultRow>
                      ))}
                    </ResultGroup>
                  )}

                  {results.deals.length > 0 && (
                    <ResultGroup title="Deals" count={results.deals.length}>
                      {results.deals.map(d => (
                        <ResultRow key={d.id} icon={Briefcase} onClick={() => go("/app/services/spark_deals")}>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{d.title}</div>
                            <div className="text-xs text-slate-500 truncate">${Number(d.value).toLocaleString()} · {d.stage_name || d.status}</div>
                          </div>
                        </ResultRow>
                      ))}
                    </ResultGroup>
                  )}

                  {results.lists.length > 0 && (
                    <ResultGroup title="Lists" count={results.lists.length}>
                      {results.lists.map(l => (
                        <ResultRow key={l.id} icon={ListIcon} onClick={() => go("/app/services/spark_lists")}>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{l.name}</div>
                            <div className="text-xs text-slate-500 truncate">{l.contact_count} contacts</div>
                          </div>
                        </ResultRow>
                      ))}
                    </ResultGroup>
                  )}
                </div>
              )}
            </div>

            {/* Footer hint */}
            <div className="px-4 py-2 border-t border-slate-200 bg-slate-50 text-[10px] text-slate-500 flex items-center justify-between">
              <span>Use ↑↓ to navigate · Enter to open · Esc to close</span>
              <span><kbd className="px-1 bg-white border border-slate-300 rounded">⌘K</kbd> from anywhere</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ResultGroup({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-4 py-1 text-[10px] uppercase tracking-wide font-semibold text-slate-500 bg-slate-50 border-y border-slate-100 flex items-center justify-between">
        <span>{title}</span>
        <span>{count}</span>
      </div>
      <div>{children}</div>
    </div>
  );
}

function ResultRow({ icon: Icon, onClick, children }: { icon: typeof User; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 border-b border-slate-100 text-left transition">
      <Icon className="h-4 w-4 text-slate-400 flex-shrink-0" />
      {children}
      <ArrowRight className="h-3.5 w-3.5 text-slate-300 flex-shrink-0" />
    </button>
  );
}
