// LeadGenCategoryTopics — a picked Business Category's search topics, shown
// directly under its chip on New B2B Lead Search (Brandon, 2026-10-01).
//
// The topics ARE what the search runs. They come from the same expand call as
// the Live Preview and every remove / put-back goes through the same
// excludedTerms the Live Preview reads, so removing a topic here drops it from
// the "Expanded keywords" count on the right at once — one list, two views.
//
// Presentational only (props in, callbacks out), so it is pinned by
// test/leadgen-form-categories-only.test.mjs without a browser.
import { Plus, X } from "lucide-react";
import type { ExpandedKeyword } from "../../lib/leadgenCategories";

export interface LeadGenCategoryTopicsProps {
  /** This category's topics from the expansion (first claim wins across categories). */
  topics: ExpandedKeyword[];
  /** The page's excludedTerms — the same set the Live Preview reads. */
  excluded: ReadonlySet<string>;
  loading: boolean;
  /** The page's toggleTerm — removes a topic, or puts a removed one back. */
  onToggle: (term: string) => void;
}

export function LeadGenCategoryTopics({ topics, excluded, loading, onToggle }: LeadGenCategoryTopicsProps) {
  if (!topics.length) {
    return (
      <p className="mt-1.5 text-[11px] text-slate-500" data-testid="category-topics-empty">
        {loading ? "Finding search topics…" : "No search topics for this category yet"}
      </p>
    );
  }
  const active = topics.filter((k) => !excluded.has(k.term)).length;
  return (
    <div className="mt-1.5" data-testid="category-topics">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Search topics · {active} of {topics.length}
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {topics.map((k) => {
          const off = excluded.has(k.term);
          return (
            <li
              key={k.term}
              className={off
                ? "inline-flex max-w-full items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-400"
                : "inline-flex max-w-full items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[11px] text-orange-900"}
            >
              <span className={`truncate ${off ? "line-through" : ""}`}>{k.term}</span>
              <button
                type="button"
                onClick={() => onToggle(k.term)}
                aria-label={off ? `Put back ${k.term}` : `Remove ${k.term}`}
                title={off ? "Put this topic back in the search" : "Leave this topic out of the search"}
                className={off ? "leading-none text-slate-400 hover:text-slate-700" : "leading-none text-orange-600 hover:text-orange-900"}
              >
                {off ? <Plus className="h-3 w-3" /> : <X className="h-3 w-3" />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default LeadGenCategoryTopics;
