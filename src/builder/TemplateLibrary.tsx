/**
 * builder/TemplateLibrary.tsx — THE start screen, for every builder.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §11.9, decision D-146 (Brandon,
 * 2026-09-16). One component: a search box, two rows of category chips, and a
 * grid of cards each showing a REAL RENDER of the template, its title, a small
 * badge saying what it is for, and one line of use case — with the full use
 * case and a "Best for" line on hover or keyboard focus.
 *
 * ── WHY IT IS ONE COMPONENT ───────────────────────────────────────────────
 * Before this there were four starting screens — the proposal's three text
 * cards, the email builder's four, the landing page's three and the website
 * page list — each with its own hand-drawn sketch of grey bars pretending to
 * be a document, and none of them searchable. Four copies of one idea is the
 * duplication this whole rebuild exists to delete, so the four grids are gone
 * and each adapter now hands this component a list (`TemplateEntry[]`) and a
 * callback. The adapter still owns what a template IS; this owns how you find
 * one.
 *
 * The My Brand studio's own gallery (adapters/mybrand/TemplateGallery.tsx) is
 * deliberately untouched: its previews are already real Fabric scenes, and a
 * 1080×1080 square is not a document with sections.
 *
 * ── THE PICTURE IS THE DOCUMENT ───────────────────────────────────────────
 * Not a PNG in the repo, not a screenshot service: the template's own document
 * through the one renderer, dropped into a sandboxed `<iframe srcdoc>` and
 * scaled down. Built at most once per template (`makePreviewCache`) and only
 * for cards that have actually been scrolled to (IntersectionObserver +
 * `nextMounted`). A preview that throws costs its own card its picture and
 * nothing else.
 *
 * Every RULE this screen follows — the search, the chips, the sort, the
 * mounting — is in templateLibraryModel.ts under `node --test`. This file draws.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { IadmModal, type IadmModalProduct } from "../components/IadmModal";
import {
  ALL, THUMB_RATIO, THUMB_ROOT_MARGIN, buildPreview, businessTypeChips,
  filterAndSort, firstSentence, makePreviewCache, nextMounted, purposeChips,
  type TemplateEntry,
} from "./templateLibraryModel";

export interface TemplateLibraryProps {
  open: boolean;
  onClose: () => void;
  product: IadmModalProduct;
  eyebrow: string;
  title: string;
  subtitle: string;
  entries: TemplateEntry[];
  /** The entry's own id, handed straight back. The adapter knows what it means. */
  onPick: (id: string) => void;
  /** A note above the grid, when the adapter has one to make. */
  notice?: ReactNode;
  /** Buttons before Cancel in the footer. */
  footerExtra?: ReactNode;
}

export function TemplateLibrary(p: TemplateLibraryProps) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState(ALL);
  const [purpose, setPurpose] = useState(ALL);

  const types = useMemo(() => businessTypeChips(p.entries), [p.entries]);
  const purposes = useMemo(() => purposeChips(p.entries), [p.entries]);
  const shown = useMemo(
    () => filterAndSort(p.entries, { query, businessType: type, purpose }),
    [p.entries, query, type, purpose]);

  if (!p.open) return null;

  return (
    <IadmModal
      open
      onClose={p.onClose}
      product={p.product}
      eyebrow={p.eyebrow}
      title={p.title}
      subtitle={p.subtitle}
      size="report"
      footer={<>{p.footerExtra}<button type="button" style={ghost} onClick={p.onClose} title="Close without starting anything">Cancel</button></>}
    >
      <style>{CSS}</style>
      <div className="tl-wrap">
        {p.notice}

        <div className="tl-controls">
          <label className="tl-search">
            <Search size={14} color="#94A3B8" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search — try “maintenance”, “seasonal” or “quote”"
              aria-label="Search the template library"
              title="Search by name, by what the template is for, or by trade"
            />
          </label>
          <span className="tl-count">{shown.length} template{shown.length === 1 ? "" : "s"}</span>
        </div>

        <ChipRow label="Business type" chips={types} value={type} onChange={setType} />
        <ChipRow label="What it is for" chips={purposes} value={purpose} onChange={setPurpose} />

        <Grid entries={shown} onPick={p.onPick} query={query} />
      </div>
    </IadmModal>
  );
}

function ChipRow({ label, chips, value, onChange }: {
  label: string; chips: string[]; value: string; onChange: (v: string) => void;
}) {
  if (chips.length <= 1) return null;
  return (
    <div className="tl-chips" role="group" aria-label={label}>
      <span className="tl-chips-label">{label}</span>
      {chips.map((c) => (
        <button
          key={c}
          type="button"
          aria-pressed={value === c}
          title={c === ALL ? `Show every ${label.toLowerCase()}` : `Show only ${c}`}
          className={`tl-chip${value === c ? " tl-chip-on" : ""}`}
          onClick={() => onChange(c)}
        >{c}</button>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   The grid, and the one observer that feeds it
   ══════════════════════════════════════════════════════════════════════════ */

function Grid({ entries, onPick, query }: {
  entries: TemplateEntry[]; onPick: (id: string) => void; query: string;
}) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState<Set<string>>(() => new Set());
  // One cache for the life of the grid: a filter change re-uses what has
  // already been rendered rather than paying for it twice.
  const cache = useMemo(makePreviewCache, []);

  useEffect(() => {
    const root = gridRef.current;
    if (!root || typeof IntersectionObserver === "undefined") {
      // No observer (an old browser, or a test renderer): show everything
      // rather than show nothing. A missing optimisation is not a missing
      // feature.
      setMounted(new Set(entries.map((e) => e.id)));
      return;
    }
    // The VIEWPORT is the root, not the grid. A modal's grid can still be
    // laying out when this effect runs, and an observer whose root has no area
    // at that moment reports nothing and is never re-created. The viewport is
    // re-evaluated on every layout change, and a card scrolled out of the
    // grid is clipped by it either way — so this is lazy AND cannot wedge.
    const io = new IntersectionObserver((records) => {
      const entering = records.filter((r) => r.isIntersecting)
        .map((r) => (r.target as HTMLElement).dataset.tid || "")
        .filter(Boolean);
      if (entering.length) setMounted((prev) => nextMounted(prev, entering));
    }, { rootMargin: THUMB_ROOT_MARGIN });
    root.querySelectorAll<HTMLElement>("[data-tid]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [entries]);

  if (!entries.length) {
    return (
      <div className="tl-grid" ref={gridRef}>
        <div className="tl-empty">
          {query.trim()
            ? <>Nothing here matches “{query.trim()}”. Try a different word, or clear the search to see everything again.</>
            : <>No templates match those filters. Choose “All” to see everything again.</>}
        </div>
      </div>
    );
  }

  return (
    <div className="tl-grid" ref={gridRef}>
      {entries.map((e) => (
        <Card key={e.id} entry={e} onPick={onPick} show={mounted.has(e.id)} cache={cache} />
      ))}
    </div>
  );
}

function Card({ entry, onPick, show, cache }: {
  entry: TemplateEntry;
  onPick: (id: string) => void;
  show: boolean;
  cache: ReturnType<typeof makePreviewCache>;
}) {
  const [width, setWidth] = useState(0);
  const boxRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const built = useMemo(() => {
    if (!show) return null;
    try {
      // The preview itself is memoised by id; the entry's build is never run
      // twice for the same template however often the grid re-renders.
      return cache.get(entry.id, () => buildPreview(entry));
    } catch (err) {
      // One template's renderer throwing must not take the library down.
      console.error(`[template library] could not draw “${entry.title}”`, err);
      return null;
    }
  }, [show, entry, cache]);

  const scale = built && width ? width / built.width : 1;
  const one = firstSentence(entry.useCase);

  return (
    <button
      type="button"
      className="tl-card"
      data-tid={entry.id}
      title={`${entry.title} — ${entry.useCase}`}
      onClick={() => onPick(entry.id)}
    >
      <span className="tl-thumb" ref={boxRef} style={{ aspectRatio: String(THUMB_RATIO) }}>
        {built ? (
          <iframe
            className="tl-frame"
            title=""
            aria-hidden="true"
            tabIndex={-1}
            sandbox=""
            srcDoc={built.srcdoc}
            style={{
              width: built.width,
              height: width ? (width / THUMB_RATIO) / (scale || 1) : 0,
              transform: `scale(${scale})`,
            }}
          />
        ) : (
          <span className="tl-thumb-wait" aria-hidden="true" />
        )}
        <span className="tl-detail">
          <span className="tl-detail-use">{entry.useCase}</span>
          <span className="tl-detail-best"><b>Best for</b> {entry.bestFor}</span>
        </span>
      </span>
      <span className="tl-body">
        <span className="tl-badge">{entry.purpose}</span>
        <span className="tl-title">{entry.title}</span>
        <span className="tl-one">{one}</span>
      </span>
    </button>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   Styles
   ══════════════════════════════════════════════════════════════════════════ */

const ghost: React.CSSProperties = {
  border: "1px solid #CBD5E1", background: "#fff", color: "#334155", borderRadius: 4,
  padding: "7px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer",
};

/**
 * Hover AND focus reveal the detail — a keyboard has to be able to read
 * everything a mouse can, so `:focus-within` sits beside `:hover` on the same
 * rule rather than being someone's follow-up ticket.
 */
const CSS = `
.tl-wrap { display: flex; flex-direction: column; gap: 10px; padding: 16px; height: 100%; min-height: 0; }
.tl-controls { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.tl-search { display: flex; align-items: center; gap: 6px; border: 1px solid #CBD5E1; border-radius: 6px; padding: 7px 10px; background: #fff; flex: 1; max-width: 420px; }
.tl-search input { border: none; outline: none; font-size: 12px; flex: 1; background: transparent; color: #0B1C24; }
.tl-count { font-size: 11px; color: #5A7A8A; white-space: nowrap; }
.tl-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.tl-chips-label { font-size: 10px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: #5A7A8A; margin-right: 2px; }
.tl-chip { font-size: 11px; font-weight: 600; border-radius: 999px; padding: 4px 10px; cursor: pointer; border: 1px solid #CBD5E1; background: #fff; color: #334155; }
.tl-chip:hover { border-color: #94A3B8; }
.tl-chip-on { background: #0B1C24; border-color: #0B1C24; color: #fff; }
.tl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 14px; overflow-y: auto; padding: 2px; align-content: start; }
.tl-card { position: relative; display: flex; flex-direction: column; text-align: left; background: #fff; border: 1px solid #E2E8F0; border-radius: 10px; overflow: hidden; padding: 0; cursor: pointer; }
.tl-card:hover { border-color: #0C4A60; box-shadow: 0 8px 24px rgba(0,0,0,0.08); }
.tl-card:focus-visible { outline: 3px solid #0C4A60; outline-offset: 2px; }
.tl-thumb { position: relative; display: block; width: 100%; overflow: hidden; background: #F2F6F9; border-bottom: 1px solid #E2E8F0; }
.tl-frame { border: 0; display: block; transform-origin: top left; pointer-events: none; background: #fff; }
.tl-thumb-wait { position: absolute; inset: 0; background: repeating-linear-gradient(135deg, #F2F6F9, #F2F6F9 10px, #EAF1F5 10px, #EAF1F5 20px); }
.tl-detail { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: flex-end; gap: 6px; padding: 12px; background: linear-gradient(to top, rgba(11,28,36,.96), rgba(11,28,36,.86) 60%, rgba(11,28,36,.55)); color: #fff; opacity: 0; transition: opacity .12s ease-in-out; }
.tl-card:hover .tl-detail, .tl-card:focus .tl-detail, .tl-card:focus-visible .tl-detail, .tl-card:focus-within .tl-detail { opacity: 1; }
.tl-detail-use { font-size: 11px; line-height: 1.45; }
.tl-detail-best { font-size: 10px; line-height: 1.4; color: #CBD5E1; }
.tl-detail-best b { color: #fff; text-transform: uppercase; letter-spacing: .06em; font-size: 9px; margin-right: 4px; }
.tl-body { display: block; padding: 10px 12px 12px; }
.tl-badge { display: inline-block; font-size: 9px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; color: #0C4A60; background: #E8F1F5; border-radius: 999px; padding: 2px 8px; }
.tl-title { display: block; font-size: 13px; font-weight: 700; color: #0B1C24; margin-top: 6px; }
.tl-one { display: block; font-size: 11px; color: #5A7A8A; line-height: 1.35; margin-top: 3px; }
.tl-empty { grid-column: 1 / -1; border: 1px dashed #CBD5E1; border-radius: 8px; padding: 28px; text-align: center; font-size: 12px; color: #5A7A8A; }
`;

export default TemplateLibrary;
