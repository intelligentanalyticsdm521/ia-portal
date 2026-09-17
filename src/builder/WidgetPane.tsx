/**
 * builder/WidgetPane.tsx — the side pane SD-010 describes, once, for every builder.
 *
 * "A side pane of widgets/blocks with a picture and one line of what each is
 *  for; tooltips on every button."
 *
 * Drop it into IadmBuilderPanes' `pane` slot. It reads ./registry.ts and
 * nothing else, so a builder gets the right widget set by passing its adapter
 * name — no per-builder list to keep in step.
 *
 * ── PATTERN IT COMES FROM ─────────────────────────────────────────────────
 * SparkFormBuilderPage's field palette (the only pane on the platform whose
 * buttons carried a description, via FIELD_TYPE_META) and the Template Studio's
 * InsertRail (the only one grouped under headings). This is both, plus the two
 * things SD-010 asks for that neither had: a picture of the SHAPE each widget
 * makes, and a search box — twenty-five widgets is more than a person scans.
 *
 * ── STEP 0 SCOPE ──────────────────────────────────────────────────────────
 * Definitions only. `onInsert` hands the caller the widget definition and the
 * count the pane asked for; what a builder DOES with that is the engine, which
 * is step 2. Nothing here renders a widget.
 */
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import * as Icons from "lucide-react";
import {
  widgetTooltip,
  type BuilderAdapter,
  type WidgetDef,
  widgetDescription,
  widgetLabel,
} from "./registry";
import { groupByTask } from "./widgetTasks";

/** Resolve a lucide icon by NAME — registry.ts stays pure and importable. */
function WidgetIcon({ name, className }: { name: string; className?: string }) {
  const map = Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>;
  const Cmp = map[name] || Icons.Square;
  return <Cmp className={className} />;
}

export interface WidgetPaneProps {
  /** Which builder this is. Decides which widgets are offered at all. */
  adapter: BuilderAdapter;
  /**
   * Called when the author picks a widget. `count` is present only for a
   * widget that declares one, and is what the author answered to the guided
   * question ("How many cards?") — asked ONCE, before insert, per SD-010.
   */
  onInsert: (widget: WidgetDef, count?: number) => void;
  /** Rendered above the search box — an "Ask ARGUS" action, typically. */
  header?: React.ReactNode;
  /**
   * DRAG TO POSITION (§11.8).
   *
   * A card can be dragged onto the canvas and dropped between two widgets
   * rather than only clicked and landed at the end. The pane reports what is
   * being dragged and the canvas draws the indicator, because the canvas is
   * the only thing that knows where the columns are; the shell holds the one
   * piece of state between them.
   *
   * `null` means the drag is over. Told on `dragend` whatever the outcome, so
   * a drag that ends on the widget list itself cannot leave the canvas
   * believing something is still in the air.
   */
  onDragWidget?: (widget: WidgetDef | null) => void;
  /**
   * The line under the search box, in the adapter's words (copy.ts, D-30).
   *
   * "drop it exactly where you want it" is true of a page and of an email, but
   * the NOUN differs, and a proposal builder that says "page" is the leak this
   * prop exists to stop. Absent, the generic sentence is used.
   */
  hint?: string;
}

export function WidgetPane({ adapter, onInsert, header, onDragWidget, hint }: WidgetPaneProps) {
  const [query, setQuery] = useState("");
  // Which widget is mid-question, and the number showing in its stepper.

  /* GROUPED BY THE JOB, NOT BY THE TYPE (D-147). "Information" and "Trust"
     are words a developer wrote down; "Customer & property" and "Products &
     services" are the two sentences the business owner said. The picker uses
     the same call, so the two surfaces cannot drift — widgetTasks.ts. */
  const groups = useMemo(() => groupByTask(adapter, query), [adapter, query]);
  const total = useMemo(() => groups.reduce((n, g) => n + g.widgets.length, 0), [groups]);

  /* THE "HOW MANY?" QUESTION IS GONE (D-156, item 4).
     It only existed because the cards inside a composite could not be added or
     removed once the widget was on the page. They can now: a card is a widget
     with the same duplicate and delete as everything else, so the thing arrives
     with its default rows and the author changes them where they can see them.
     The picker lost the same control in the same pass — two surfaces, one
     deletion, or one of them keeps asking. */
  function pick(w: WidgetDef) {
    onInsert(w);
  }

  return (
    <div className="flex h-full flex-col" data-builder-pane={adapter}>
      {header && <div className="border-b border-slate-100 p-3">{header}</div>}

      {/* Search — twenty-five widgets is past the point of scanning. Matches
          the description too, because people type what they want, not what we
          decided to call it. */}
      <div className="border-b border-slate-100 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search — try “price” or “photo”"
            aria-label="Search widgets"
            className="w-full rounded border border-slate-200 py-1.5 pl-7 pr-2 text-xs focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
          />
        </div>
      </div>

      {/* DRAG TO POSITION (§11.8), said once rather than appended to every
          tooltip — the tooltips are the widget's own words and stay that way. */}
      <div className="border-b border-slate-100 px-3 pb-2 text-[10px] leading-snug text-slate-400">
        {hint ?? <>Click one to add it where you are, or <strong className="font-semibold text-slate-500">drag it onto the page</strong> to
        drop it exactly where you want it.</>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {total === 0 && (
          <div className="rounded border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs text-slate-500">
            Nothing matches “{query}”. Clear the search to see everything this builder can add.
          </div>
        )}

        {groups.map((group) => (
          <div key={group.task} className="mb-4 last:mb-0">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {group.task}
            </div>
            <div className="space-y-1.5">
              {group.widgets.map((w) => (
                <div key={w.kind}>
                  <button
                    type="button"
                    onClick={() => pick(w)}
                    /* TOOLTIP ON EVERY BUTTON — SD-010, not optional. */
                    title={widgetTooltip(w, adapter)}
                    aria-label={widgetTooltip(w, adapter)}
                    data-widget-kind={w.kind}
                    /* HTML5 drag, the events Canvas already uses to reorder
                       sections. No library: a second drag mechanism is a
                       second set of rules about what a drop means. */
                    draggable={!!onDragWidget}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "copy";
                      // Some browsers refuse to start a drag with no payload.
                      e.dataTransfer.setData("text/plain", w.label);
                      onDragWidget?.(w);
                    }}
                    onDragEnd={() => onDragWidget?.(null)}
                    className="flex w-full items-start gap-2.5 rounded border border-slate-200 bg-white p-2 text-left transition-colors hover:border-slate-400 hover:bg-slate-50"
                  >
                    {/* The PICTURE: the shape this widget makes on the page. */}
                    <img
                      src={w.picture}
                      alt=""
                      aria-hidden="true"
                      className="mt-0.5 h-8 w-12 flex-shrink-0 rounded-sm bg-slate-50"
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                        <WidgetIcon name={w.icon} className="h-3 w-3 text-slate-400" />
                        {widgetLabel(w, adapter)}
                      </span>
                      {/* ONE line, in a business owner's words. */}
                      <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">
                        {widgetDescription(w, adapter)}
                      </span>
                    </span>
                  </button>

                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default WidgetPane;
