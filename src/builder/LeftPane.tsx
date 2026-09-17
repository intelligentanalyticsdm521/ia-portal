/**
 * builder/LeftPane.tsx — the left column: what you can add, and what is there.
 *
 * Two tabs over ONE column, because the builder has two questions to answer
 * and they belong in the same place:
 *
 *   Add      the widget list (WidgetPane) — what can go on the page
 *   Outline  the page as a list (Navigator) — what IS on the page  (D-12)
 *
 * And above both, the thing D-35 asked for: the "still to fill in" counter as a
 * BUTTON that takes you to the first one, instead of a `<div>` with a cursor of
 * `auto` that named nothing until a failed Send told you.
 *
 * The frame renders whatever is handed to its `pane` slot — including inside
 * the narrow layout's drawer, untouched — so this is one component and not a
 * second narrow version of itself.
 */
import { useState } from "react";
import { LayoutList, ListTree } from "lucide-react";
import { WidgetPane, type WidgetPaneProps } from "./WidgetPane";
import { Navigator, type NavigatorProps } from "./Navigator";
import { PROBLEMS_CTA, problemsLabel, type BuilderProblem } from "./problems";
import type { BuilderCopy } from "./copy";

export interface LeftPaneProps {
  copy: BuilderCopy;
  pane: WidgetPaneProps;
  navigator: NavigatorProps;
  /** What is still missing, from the adapter. See problems.ts. */
  problems?: BuilderProblem[];
  onJumpToProblem?: () => void;
  /** The adapter's own header — a total, a revision checklist. */
  header?: React.ReactNode;
  /**
   * WHICH TAB IS SHOWING, when something outside decides (M-8).
   *
   * The right-click menu's "Show it in the outline" has to be able to bring the
   * Outline forward, and a component that owns its own tab cannot be told. The
   * pane still keeps the tab when nothing is passed, so nothing else had to
   * change to add this.
   */
  tab?: Tab;
  onTab?: (tab: Tab) => void;
}

export type Tab = "add" | "outline";

export function LeftPane(p: LeftPaneProps) {
  const [own, setOwn] = useState<Tab>("add");
  const tab = p.tab ?? own;
  const setTab = (t: Tab) => { setOwn(t); p.onTab?.(t); };
  const count = p.problems?.length ?? 0;

  return (
    <div className="flex h-full min-h-0 flex-col" data-builder-leftpane={tab}>
      {p.header && <div className="border-b border-slate-100 p-3">{p.header}</div>}

      {count > 0 && (
        <div className="border-b border-amber-200 bg-amber-50 p-2.5">
          <button
            type="button"
            data-builder-problems={String(count)}
            title={p.problems!.map((x) => x.message).join(" · ")}
            onClick={p.onJumpToProblem}
            className="w-full rounded border border-amber-400 bg-white px-2.5 py-1.5 text-left text-[11px] font-semibold text-amber-900 hover:bg-amber-100"
          >
            {problemsLabel(count)}
            <span className="mt-0.5 block text-[10px] font-normal text-amber-700">{PROBLEMS_CTA} →</span>
          </button>
        </div>
      )}

      <div className="flex flex-shrink-0 gap-1 border-b border-slate-200 px-2 pt-2">
        {([["add", "Add", LayoutList], ["outline", p.copy.outlineHeading, ListTree]] as Array<[Tab, string, typeof LayoutList]>)
          .map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              data-pane-tab={key}
              aria-pressed={tab === key}
              title={key === "add" ? p.copy.paneHeading : "Everything on the page, in order"}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 rounded-t border-b-2 px-3 py-1.5 text-[11px] font-semibold ${
                tab === key
                  ? "border-slate-800 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700"}`}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "add" ? <WidgetPane {...p.pane} /> : <Navigator {...p.navigator} />}
      </div>
    </div>
  );
}

export default LeftPane;
