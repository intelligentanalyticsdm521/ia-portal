/**
 * builder/WidgetPane.tsx — THE LEFT PANEL. Widgets, and nothing else.
 *
 * Scope §11.13.1 (D-165), agreed with Brandon 2026-09-19:
 *
 *   "Widgets on the side — all the widgets should be on the left side. This is
 *    the 5th time that I have explained this. You have all this random details
 *    on the side. I never asked for any of that."
 *
 * ── WHAT THE REAL EDITOR DOES ─────────────────────────────────────────────
 * Looked at on 2026-09-19 in a live Elementor 4.2.4 (WordPress Playground,
 * `post.php?post=2&action=elementor`), screenshots under
 * `overnight-report/d165-screens/`:
 *
 *   · a title — "Elements"
 *   · a search box — placeholder "Search Widget..."
 *   · groups as ACCORDIONS, each with a chevron, first one open
 *   · tiles TWO ACROSS: a line-icon above, the name under it, nothing else
 *   · drag a tile onto the page, or click it to insert at the selection
 *
 * Nothing else is in that panel. No outline, no totals, no customer box, no
 * templates list, no "still to fill in" counter.
 *
 * ── WHAT WAS DELETED HERE, AND WHY IT IS NOT HIDDEN ───────────────────────
 *   · `LeftPane.tsx`, the two-tab wrapper (Add | Outline) — the outline is now
 *     the floating Structure window (Navigator.tsx), so the wrapper had one tab
 *     left and no reason to exist.
 *   · the `header` slot — the door adapters injected their own left-pane
 *     groups through. The proposal builder pushed its Details group through it;
 *     that group was invented on 2026-09-16 and was never scope. Removing the
 *     slot is what stops it coming back. Told to the proposal stream in
 *     D165_HANDOFF_2026-09-19.md.
 *   · the picture strip — the 12×8 thumbnail of the SHAPE each widget makes — and the
 *     one-line description on every row. Elementor shows an icon and a name;
 *     the sentence is the tooltip. Twenty-six rows of picture-plus-paragraph is
 *     four screens of scrolling for a panel you are meant to scan.
 *   · the `hint` line under the search box — the adapter's words about dragging.
 *     One sentence at the top of a panel nobody reads twice.
 */
import { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Lock, Search } from "lucide-react";
import * as Icons from "lucide-react";
/* `widgetTooltip` WAS IMPORTED HERE and is gone with the tile's title
   attribute (D-172, round 2) — the reference puts no tooltip on a tile. */
import { type BuilderAdapter, type WidgetDef, widgetLabel } from "./registry";
import type { WidgetLock } from "./tier";
import { openGroups, panelGroups, type PanelGroup } from "./widgetGroups";

/** Resolve a lucide icon by NAME — registry.ts stays pure and importable. */
function WidgetIcon({ name, className }: { name: string; className?: string }) {
  const map = Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>;
  const Cmp = map[name] || Icons.Square;
  return <Cmp className={className} />;
}

/**
 * The panel's title — the reference editor's own word (D-172).
 *
 * Driven in a live Elementor 4.2.4 on 2026-09-19 (the capture is
 * `elementor-reference/widgets/_zz_screen_round1.json`): the panel is titled
 * "Elements", its search says "Search Widget...", its group headings are Title
 * Case, and the panel is 300px wide with 85px tiles. "Widgets" was ours.
 */
export const PANE_TITLE = "Elements";

/** The reference editor's own placeholder, to the character. */
export const PANE_SEARCH_PLACEHOLDER = "Search Widget...";

export interface WidgetPaneProps {
  /** Which builder this is. Decides which widgets are offered at all. */
  adapter: BuilderAdapter;
  /** Called when the author picks a widget — inserted at the selection. */
  onInsert: (widget: WidgetDef) => void;
  /**
   * DRAG TO POSITION (§11.8).
   *
   * A tile can be dragged onto the canvas and dropped between two things
   * rather than only clicked and landed at the selection. The pane reports
   * what is in the air and the canvas draws the indicator, because the canvas
   * is the only thing that knows where the columns are.
   *
   * `null` means the drag is over. Told on `dragend` whatever the outcome, so
   * a drag that ends on the panel itself cannot leave the canvas believing
   * something is still in the air.
   */
  onDragWidget?: (widget: WidgetDef | null) => void;
  /**
   * WIDGETS THIS PLAN CANNOT HAVE — kind → the sentence the client reads.
   *
   * The three states of §11.12: offered, not on this plan, or needs a product
   * this business does not have. A locked tile stays IN the group, greyed,
   * with the reason as its tooltip, and neither the click nor the DRAG does
   * anything — a drag that landed and was then refused looks like a broken
   * canvas rather than a plan.
   */
  lockedKinds?: Record<string, WidgetLock>;
  /**
   * THE EDGE HANDLE (D-172). The reference editor puts a small chevron tab
   * halfway down the panel's right border that folds the panel away. Optional,
   * so a frame that has no panel toggle simply does not draw one.
   */
  onCollapse?: () => void;
}

export function WidgetPane({ adapter, onInsert, onDragWidget, lockedKinds, onCollapse }: WidgetPaneProps) {
  const [query, setQuery] = useState("");
  /* NO BOX PRESETS AND NO SPECIAL CASE (integration, 2026-09-19). The Layout
     group holds two real WIDGETS — Container and Grid — so a search for "row"
     matches one of them and the group is there on its own. The pane used to
     add the group back when only a PRESET matched; the presets are gone from
     this panel, and with them the rule that existed for them. */
  const groups = useMemo(() => panelGroups(adapter, query), [adapter, query]);
  /* `total` WAS HERE and is deleted with the empty-search sentence it fed. */

  /**
   * WHICH ACCORDIONS ARE OPEN.
   *
   * `null` means "nobody has clicked a heading yet", so the default from
   * widgetGroups applies — EVERY group open, as the reference editor's panel
   * is. The moment the author opens or shuts one themselves, their set wins,
   * and clearing the search puts the default back because `open` is reset with
   * the query.
   */
  const [open, setOpen] = useState<PanelGroup[] | null>(null);
  const shown = open ?? openGroups(groups, query);
  const toggle = (g: PanelGroup) =>
    setOpen(shown.includes(g) ? shown.filter((x) => x !== g) : [...shown, g]);

  /**
   * A SEARCH IS ONE FLAT GRID (D-172).
   *
   * Driven in the reference on 2026-09-19: typing "heading" gives two Heading
   * tiles and NO group heading above them. Ours kept "BASIC" over the matches,
   * which turns a two-result search into a list of headings.
   */
  const searching = query.trim().length > 0;
  const flat = useMemo(() => groups.flatMap((g) => g.widgets), [groups]);

  /** One tile. The same markup whether it is in a group or in a search. */
  const tile = (w: WidgetDef) => {
    const lock = lockedKinds?.[w.kind] ?? null;
    const label = widgetLabel(w, adapter);
    return (
      <button
        key={w.kind}
        type="button"
        onClick={() => { if (!lock) onInsert(w); }}
        disabled={!!lock}
        {...(lock ? {
          "data-widget-locked": lock.sentence,
          "data-widget-state": lock.reason,
          "data-widget-tier": lock.tier,
        } : { "data-widget-state": "offered" })}
        /* NO TOOLTIP ON A TILE (D-172, round 2). Driven in the reference on
           2026-09-19: hovering Heading gives cursor `move`, background
           #F1F2F3, `titleAttr: null` and no tooltip node anywhere. Ours put a
           full sentence on every single tile — "Container - A box you drop
           things into. Set it to a row for columns, or a column for a stack."
           — so the panel you are meant to SCAN answered every glance with a
           paragraph. The name under the icon is the whole label.

           A LOCKED tile keeps its sentence, and only a locked tile: the
           reference's own locked tile is the one place the panel explains
           itself, and "why can I not press this" has no other answer. */
        {...(lock ? { title: lock.sentence, "aria-label": lock.sentence } : {})}
        data-widget-kind={w.kind}
        /* HTML5 drag, the events Canvas already uses to reorder.
           No library: a second drag mechanism is a second set of
           rules about what a drop means. */
        draggable={!!onDragWidget && !lock}
        onDragStart={(e) => {
          if (lock) { e.preventDefault(); return; }
          e.dataTransfer.effectAllowed = "copy";
          // Some browsers refuse to start a drag with no payload.
          e.dataTransfer.setData("text/plain", label);
          onDragWidget?.(w);
        }}
        onDragEnd={() => onDragWidget?.(null)}
        /* SEPARATE CARDS, NOT A SHEET OF CELLS (D-172, round 2).
           Driven in the reference on 2026-09-19: the tile is a 130x85 button
           with `1px solid rgb(213,216,220)` on ALL FOUR sides, the grid is
           `130px 130px` with a `10px` gap, and the panel has a 15px gutter
           each side — 15+130+10+130+15 = the panel's own 300px, exactly.
           Ours was edge to edge: bottom and right hairlines only, no gap, no
           gutter, so the panel read as a spreadsheet rather than a tray of
           cards. Hover is #F1F2F3 and the cursor is `move`, both measured. */
        className={`relative flex h-[85px] flex-col items-center justify-center gap-1.5 rounded-[3px] border border-[#D5D8DC] px-1 text-center transition-colors ${
          lock
            ? "cursor-not-allowed bg-white opacity-60"
            : "cursor-move bg-white hover:bg-[#F1F2F3]"}`}
      >
        {/* THE PADLOCK BADGE (D-172) — the reference draws one in a locked
            tile's top-right corner. Ours only greyed the tile, so "not on this
            plan" and "still loading" looked the same. */}
        {lock && (
          <span data-widget-padlock className="absolute right-1 top-1 text-slate-400">
            <Lock className="h-3 w-3" />
          </span>
        )}
        <WidgetIcon name={w.icon} className="h-5 w-5 text-slate-500" />
        <span className="w-full truncate text-[10.5px] font-medium leading-tight text-slate-700">
          {label}
        </span>
      </button>
    );
  };

  return (
    <div className="relative flex h-full flex-col" data-builder-pane={adapter}>
      {/* 15px, weight 400, text-align start — the reference's own H2,
          measured 2026-09-19 (`_zz_r2_panel_topbar_ref_b.json`: id
          `elementor-panel-header-title`, `align: "start 15px none"`). Ours was
          12px bold and centred, which read as a section label rather than the
          panel's name. */}
      <div className="flex-shrink-0 border-b border-slate-200 px-[15px] py-2.5 text-left text-[15px] font-normal text-slate-700">
        {PANE_TITLE}
      </div>

      <div className="flex-shrink-0 border-b border-slate-100 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(null); }}
            placeholder={PANE_SEARCH_PLACEHOLDER}
            aria-label={PANE_SEARCH_PLACEHOLDER}
            data-pane-search
            className="w-full rounded border border-slate-200 py-1.5 pl-7 pr-2 text-xs focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* A SEARCH THAT MATCHES NOTHING SHOWS NOTHING (D-172, round 2).
            Driven in the reference: type "zzzzqqq" and the whole panel reads
            "Widgets Components Globals Search Widget: … Upgrade Now" — an
            empty grid, and not one word about the search. Ours drew a dashed
            box saying "Nothing matches […]. Clear the search to see every
            widget.", which is a paragraph telling you what the empty grid
            already told you. The box, its copy and its `total === 0` branch
            are deleted, not hidden. */}
        {searching ? (
          <div data-pane-flat="1" className="grid grid-cols-2 gap-[10px] px-[15px] py-[10px]">
            {flat.map(tile)}
          </div>
        ) : groups.map((g) => {
          const isOpen = shown.includes(g.group);
          return (
            <div key={g.group} data-pane-group={g.group} data-pane-group-open={isOpen ? "1" : "0"}>
              <button
                type="button"
                data-pane-group-toggle={g.group}
                aria-expanded={isOpen}
                title={isOpen ? `Hide the ${g.group} widgets` : `Show the ${g.group} widgets`}
                onClick={() => toggle(g.group)}
                /* TITLE CASE, not UPPERCASE (D-172). The reference's headings
                   are "Atomic Elements", "Layout", "Basic", "General" —
                   measured `text-transform: none` on every one of them.

                   NO GREY BAND, 13.3px, weight 400 (D-172, round 2). Ours was
                   11.5px weight 700 on a grey band the full width of the
                   panel, so six headings read as six toolbars. The reference's
                   heading is a line of plain text with a caret on its left. */
                className="flex w-full items-center gap-1.5 px-[15px] py-2 text-left text-[13.3px] font-normal tracking-normal text-slate-700 hover:text-slate-900"
              >
                {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                {g.group}
              </button>

              {isOpen && (
                /* TWO ACROSS, icon over name. Elementor's tile, and the reason
                   the picture and the sentence went: this panel is scanned, not
                   read. */
                <div className="grid grid-cols-2 gap-[10px] px-[15px] pb-[15px]">
                  {/* THE BOX PRESETS LIVED HERE and are GONE (integration,
                      2026-09-19). The Layout group held Box / Row / Grid as
                      presets AND Container / Grid as widgets, so "Grid" was
                      two tiles side by side and the two inserted different
                      things — the preset a real box, the widget a node nothing
                      draws. §11.13.1: "Layout holds exactly Container and
                      Grid, as the reference editor's does", and
                      `registry.presetFor` is what makes the Grid TILE insert a
                      grid container. A row is a Container with its direction
                      set, which is the reference editor's own answer. */}
                  {g.widgets.map(tile)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* THE EDGE HANDLE (D-172) — the reference's chevron tab, halfway down
          the panel's right border, which folds the panel away. */}
      {onCollapse && (
        <button
          type="button"
          data-pane-collapse
          onClick={onCollapse}
          title="Hide Panel"
          aria-label="Hide Panel"
          className="absolute -right-3 top-1/2 z-10 flex h-9 w-3 -translate-y-1/2 items-center justify-center rounded-r border border-l-0 border-slate-300 bg-white text-slate-500 hover:text-slate-800"
        >
          <ChevronLeft className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

export default WidgetPane;
