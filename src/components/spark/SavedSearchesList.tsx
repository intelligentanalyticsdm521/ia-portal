// SavedSearchesList — the body of the Lead Inbox's Saved Searches tab.
//
// Brandon, 2026-10-01: "The lead inbox should be the only place I have to go to
// get a new or saved search." One row per saved search: its name, the
// categories it asks, the area (cities / radius), when it last ran and how many
// leads it found, and "Run again". CLICKING A ROW opens New B2B Lead Search
// filled in from that search, ready to change, run or save. "New B2B Lead
// Search" starts a fresh one.
//
// Presentational only: the Lead Inbox's tab owns the fetch and the handlers, so
// this renders from props and is pinned by
// test/leadgen-saved-searches-inbox.test.mjs without a browser.
//
// Searches that were run without "Save this search" still get a row on the
// server (the job needs one). They are kept apart behind one line, so the
// searches a person NAMED are what the tab shows.
import { useState } from "react";
import { Play, Plus, Trash2, ChevronRight } from "lucide-react";
import {
  type SavedSearch, categoriesLine, areaLine, lastRunLine, splitSavedSearches,
} from "../../lib/leadgenSavedSearch";

export interface SavedSearchesListProps {
  searches: SavedSearch[];
  loading?: boolean;
  /** A plain sentence when the list could not be loaded. */
  error?: string | null;
  /** The search whose "Run again" is in flight. */
  runningId?: string | null;
  /** Clicking a row: open the search screen filled in from it. */
  onOpen: (s: SavedSearch) => void;
  onRunAgain: (s: SavedSearch) => void;
  onDelete: (s: SavedSearch) => void;
  onNewSearch: () => void;
}

function Row({ s, runningId, onOpen, onRunAgain, onDelete }: {
  s: SavedSearch;
  runningId?: string | null;
  onOpen: (s: SavedSearch) => void;
  onRunAgain: (s: SavedSearch) => void;
  onDelete: (s: SavedSearch) => void;
}) {
  const running = runningId === s.id;
  return (
    <li className="flex flex-col gap-2 py-1.5 sm:flex-row sm:items-center sm:gap-3" data-testid="saved-search-row">
      <button
        type="button"
        onClick={() => onOpen(s)}
        title="Open this search to change it, run it or save it"
        className="group flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-orange-50"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-900 group-hover:text-[#B84817]">{s.name}</span>
          <span className="block truncate text-[12px] text-slate-600">{categoriesLine(s)}</span>
          <span className="block truncate text-[11px] text-slate-500">{areaLine(s)}</span>
          <span className="block text-[11px] text-slate-400">{lastRunLine(s)}</span>
        </span>
        <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-300 group-hover:text-[#EF6C33]" />
      </button>
      <div className="flex flex-shrink-0 items-center gap-1.5 px-2 sm:px-0">
        <button
          type="button"
          onClick={() => onRunAgain(s)}
          disabled={running}
          className="inline-flex min-h-[36px] items-center gap-1 rounded bg-[#EF6C33] px-2.5 py-1 text-[12px] font-medium text-white hover:bg-[#D85F2A] disabled:opacity-50"
        >
          <Play className="h-3 w-3" /> {running ? "Starting…" : "Run again"}
        </button>
        <button
          type="button"
          onClick={() => onDelete(s)}
          aria-label={`Delete ${s.name}`}
          title="Delete this saved search"
          className="inline-flex min-h-[36px] items-center rounded border border-slate-200 bg-white px-2 py-1 text-slate-400 hover:border-rose-200 hover:text-rose-700"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

export function SavedSearchesList({
  searches, loading, error, runningId, onOpen, onRunAgain, onDelete, onNewSearch,
}: SavedSearchesListProps) {
  const [showQuick, setShowQuick] = useState(false);
  const { named, quick } = splitSavedSearches(searches);
  const rowProps = { runningId, onOpen, onRunAgain, onDelete };
  const newButton = (
    <button
      type="button"
      onClick={onNewSearch}
      className="inline-flex min-h-[36px] items-center gap-1 rounded bg-[#EF6C33] px-3 py-1 text-[12px] font-medium text-white hover:bg-[#D85F2A]"
    >
      <Plus className="h-3.5 w-3.5" /> New B2B Lead Search
    </button>
  );

  return (
    <section className="rounded-xl border border-slate-200 bg-white px-3 py-3 sm:px-4" data-testid="saved-searches-list">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-[12px] text-slate-500">Click a search to change it, run it, or save a copy.</p>
        {newButton}
      </div>

      {loading && !searches.length ? (
        <p className="mt-3 px-1 text-[12px] text-slate-400">Loading saved searches…</p>
      ) : error ? (
        <p className="mt-3 px-1 text-[12px] text-rose-700">{error}</p>
      ) : (
        <>
          {named.length > 0 ? (
            <ul className="mt-2 divide-y divide-slate-100">
              {named.map((s) => <Row key={s.id} s={s} {...rowProps} />)}
            </ul>
          ) : (
            <p className="mt-3 px-1 text-sm text-slate-600" data-testid="saved-searches-empty">No saved searches yet</p>
          )}
          {quick.length > 0 && (
            <div className="mt-2 border-t border-slate-100 px-1 pt-2">
              <button
                type="button"
                onClick={() => setShowQuick((v) => !v)}
                className="text-[11px] text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
              >
                {showQuick
                  ? "Hide searches you ran without saving"
                  : `Show ${quick.length} search${quick.length === 1 ? "" : "es"} you ran without saving`}
              </button>
              {showQuick && (
                <ul className="mt-1 divide-y divide-slate-100">
                  {quick.map((s) => <Row key={s.id} s={s} {...rowProps} />)}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default SavedSearchesList;
