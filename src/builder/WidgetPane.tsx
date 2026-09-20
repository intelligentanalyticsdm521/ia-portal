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
import { ChevronDown, ChevronRight, Lock, Search } from "lucide-react";
import * as Icons from "lucide-react";
import { widgetTooltip, type BuilderAdapter, type WidgetDef, widgetLabel } from "./registry";
import type { WidgetLock } from "./tier";
import type { ContainerPreset } from "./treeOps";
import { boxMatches } from "./WidgetPicker";
import { openGroups, panelGroups, type PanelGroup } from "./widgetGroups";

/** Resolve a lucide icon by NAME — registry.ts stays pure and importable. */
function WidgetIcon({ name, className }: { name: string; className?: string }) {
  const map = Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>;
  const Cmp = map[name] || Icons.Square;
  return <Cmp className={className} />;
}

/** The panel's title. Elementor says "Elements"; a client says "Widgets". */
export const PANE_TITLE = "Widgets";

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
   * A BOX WAS CHOSEN (§11.12) — "box", "row" or "grid".
   *
   * The reference editor's Layout group holds Container and Grid, and a panel
   * whose Layout group has no container in it is a Layout group in name only.
   * A separate handler and not a fake `WidgetDef`, because a container is not
   * a widget: it has no registry entry, no adapter decides whether to offer
   * it, and the shell puts it on the page with `makePreset` rather than
   * `buildWidget`. Exactly the door WidgetPicker already has — the same
   * prop, the same `boxMatches`, so the panel and the "+" cannot offer
   * different boxes.
   */
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
   * WHERE "UPGRADE" GOES, when a whole group is behind a bigger plan.
   *
   * D-168 item 6. On a website plan that carries no paid page widgets, every
   * tile in the **Pro** and **Site** groups is refused, and a column of greyed
   * tiles with no way forward is the screen
   * `reference_nav_visibility_semantics` calls the defect: the client can see
   * there is something there and cannot find out what to do about it. The
   * heading of a group whose every tile is refused ON PLAN carries one link.
   *
   * Absent means no link is drawn at all, which is right for a surface that has
   * nowhere to send somebody — a link that goes nowhere is worse than none.
   */
  upgradeHref?: string;
}

/**
 * IS EVERY TILE IN THIS GROUP REFUSED, AND REFUSED ON PLAN?
 *
 * Only then is "Upgrade" the true answer. A group where ONE tile is refused
 * because the business does not own OLIVER is not a group a bigger website plan
 * opens, and `reference_nav_visibility_semantics` is explicit that collapsing
 * those two answers into one word is the defect. Exported so the test can run
 * it rather than read the JSX.
 */
export function groupLockedOnPlan(
  group: { widgets: WidgetDef[] },
  lockedKinds?: Record<string, WidgetLock> | null,
): boolean {
  if (!group.widgets.length) return false;
  return group.widgets.every((w) => lockedKinds?.[w.kind]?.reason === "plan");
}

export function WidgetPane({
  adapter, onInsert, onDragWidget, lockedKinds, upgradeHref,
}: WidgetPaneProps) {
  const [query, setQuery] = useState("");
  const found = useMemo(() => panelGroups(adapter, query), [adapter, query]);
  /**
   * LAYOUT IS SHOWN WHEN EITHER HALF MATCHES.
   *
   * `panelGroups` returns the groups holding a matching WIDGET, and a box is
   * not a widget — so typing "row", which matches the Row box and no
   * widget at all, would drop Layout out of the list while the panel was
   * holding exactly the thing asked for. The picker had this defect and it was
   * found by driving it (2026-09-17); the same fix, in the same shape.
   */
  /* NO BOX PRESETS AND NO SPECIAL CASE (integration, 2026-09-19). The Layout
     group holds two real WIDGETS — Container and Grid — so a search for "row"
     matches one of them and the group is there on its own. The pane used to
     add the group back when only a PRESET matched; the presets are gone from
     this panel, and with them the rule that existed for them. */
  const groups = found;
  const total = useMemo(
    () => groups.reduce((n, g) => n + g.widgets.length, 0),
    [groups]);

  /**
   * WHICH ACCORDIONS ARE OPEN.
   *
   * `null` means "nobody has clicked a heading yet", so the default from
   * widgetGroups applies and follows the search: first group open when the box
   * is empty, every matching group open when it is not. The moment the author
   * opens or shuts one themselves, their set wins — and clearing the search
   * puts the default back, because `shut` is reset with the query.
   */
  const [open, setOpen] = useState<PanelGroup[] | null>(null);
  const shown = open ?? openGroups(groups, query);
  const toggle = (g: PanelGroup) =>
    setOpen(shown.includes(g) ? shown.filter((x) => x !== g) : [...shown, g]);

  return (
    <div className="flex h-full flex-col" data-builder-pane={adapter}>
      <div className="flex-shrink-0 border-b border-slate-200 px-3 py-2.5 text-center text-[12px] font-bold tracking-wide text-slate-700">
        {PANE_TITLE}
      </div>

      <div className="flex-shrink-0 border-b border-slate-100 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(null); }}
            placeholder="Search widgets"
            aria-label="Search widgets"
            data-pane-search
            className="w-full rounded border border-slate-200 py-1.5 pl-7 pr-2 text-xs focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {total === 0 && (
          <div className="m-3 rounded border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs text-slate-500">
            Nothing matches “{query}”. Clear the search to see every widget.
          </div>
        )}

        {groups.map((g) => {
          const isOpen = shown.includes(g.group);
          return (
            <div key={g.group} data-pane-group={g.group} data-pane-group-open={isOpen ? "1" : "0"}>
              <button
                type="button"
                data-pane-group-toggle={g.group}
                aria-expanded={isOpen}
                title={isOpen ? `Hide the ${g.group} widgets` : `Show the ${g.group} widgets`}
                onClick={() => toggle(g.group)}
                className="flex w-full items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-600 hover:bg-slate-100"
              >
                {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                {g.group}
                {upgradeHref && groupLockedOnPlan(g, lockedKinds) && (
                  /* D-168 item 6 — ONE link, on the heading of a group whose
                     every tile this plan refuses. It is a real anchor and not a
                     button, so it works with the middle mouse button and with
                     the keyboard, and `stopPropagation` keeps a click on it
                     from also collapsing the group it is explaining. */
                  <a
                    href={upgradeHref}
                    data-pane-group-upgrade={g.group}
                    onClick={(e) => e.stopPropagation()}
                    className="ml-auto rounded px-1.5 py-0.5 text-[10px] font-semibold normal-case text-sky-700 underline hover:bg-sky-50"
                  >
                    Upgrade
                  </a>
                )}
              </button>

              {isOpen && (
                /* TWO ACROSS, icon over name. Elementor's tile, and the reason
                   the picture and the sentence went: this panel is scanned, not
                   read. */
                <div className="grid grid-cols-2 gap-px bg-slate-200 p-px">
                  {/* THE BOX PRESETS LIVED HERE and are GONE (integration,
                      2026-09-19). The Layout group held Box / Row / Grid as
                      presets AND Container / Grid as widgets, so "Grid" was
                      two tiles side by side and the two inserted different
                      things — the preset a real box, the widget a node nothing
                      draws. §11.13.1: "Layout holds exactly Container and
                      Grid, as Elementor's does", and `registry.presetFor` is
                      what makes the Grid TILE insert a grid container. A row
                      is a Container with its direction set, which is the
                      reference editor's own answer.
                      `onPickBox` stays for the PICKER and the slash command,
                      where typing "/row" has to reach something. */}
                  {g.widgets.map((w) => {
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
                        /* TOOLTIP ON EVERY BUTTON — SD-010, not optional. It is
                           where the widget's one line went. */
                        title={lock?.sentence || widgetTooltip(w, adapter)}
                        aria-label={lock?.sentence || widgetTooltip(w, adapter)}
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
                        /* 86px tall, the reference editor's own tile height
                           (measured 2026-09-19). An aspect ratio looks right
                           at one panel width and makes a 120px tower at the
                           next, which is four screens for twenty-six widgets. */
                        className={`flex h-[86px] flex-col items-center justify-center gap-1.5 px-1 text-center transition-colors ${
                          lock
                            ? "cursor-not-allowed bg-slate-50 opacity-50"
                            : "cursor-grab bg-white hover:bg-slate-50 active:cursor-grabbing"}`}
                      >
                        {/* D-168 item 6 — THE PADLOCK. A greyed tile alone says
                            "broken"; a padlock says "not yours yet", which is
                            the difference between the three states of §11.12
                            being on the screen and being only in the tooltip.
                            The reason is still the tooltip, in plain words. */}
                        {lock
                          ? <Lock className="h-5 w-5 text-slate-400" data-widget-padlock={w.kind} />
                          : <WidgetIcon name={w.icon} className="h-5 w-5 text-slate-500" />}
                        <span className="w-full truncate text-[10.5px] font-medium leading-tight text-slate-700">
                          {label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default WidgetPane;
