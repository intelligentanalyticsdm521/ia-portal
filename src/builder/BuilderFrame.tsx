/**
 * builder/BuilderFrame.tsx — THE builder surface, with no opinion about the model.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §5 step 5 pulled this out of BuilderShell.
 *
 * ── WHY IT EXISTS ─────────────────────────────────────────────────────────
 * BuilderShell owns two different things at once: the CHROME every builder has
 * (a full-viewport modal, three panes, a widget pane, one undo control) and the
 * ENGINE for a section/column/widget DOCUMENT. Proposals, websites, newsletters
 * and landing pages all want both. My Brand's Template Studio wants the first
 * and cannot use the second: its canvas is absolute pixels, a layer is not a
 * widget in a column, and "add a section" means nothing on a 1080×1080 square.
 *
 * Before this file the only two answers were (a) bend the pixel scene into the
 * document model, which would lose rotation, z-order and free placement, or
 * (b) let the Template Studio keep its own three-pane layout — the duplicate
 * this scope exists to delete. So the chrome became a component:
 *
 *   BuilderFrame   the modal, the header, ONE undo/redo pair, the three panes
 *   BuilderShell   BuilderFrame + the document engine (sections and widgets)
 *   StudioBuilder  BuilderFrame + the pixel engine (layers on a Fabric canvas)
 *
 * Both engines drive the SAME pane (WidgetPane over registry.ts) and the SAME
 * history (history.ts, now generic over its value), so "one builder" is a fact
 * about the code and not a claim in a document.
 *
 * ── WHAT STAYS HERE, FOREVER ──────────────────────────────────────────────
 * The things SD-010 states as numbers or as rules, so an adapter cannot opt
 * out of them by accident: the `builder` modal size (≥80% of the viewport),
 * IadmBuilderPanes' three columns, and exactly one undo control in the header
 * — never one per pane, never a second stack inside a canvas library.
 *
 * ── THE PHONE (2026-09-16, scope §12.7) ───────────────────────────────────
 * §12.7 recorded the honest state: "the builder is a desktop and tablet
 * surface: below the tablet breakpoint the shell HIDES the 320px pane". Hiding
 * a pane is not a narrow layout — it is a builder with the widget list and the
 * settings simply gone, and no way to reach either.
 *
 * Elementor's answer, which is the one the convention file names
 * (convention_builders_elementor_model): the canvas takes the whole width and
 * the two panes become SLIDE-OVER DRAWERS opened from a bottom bar. Same
 * panes, same components, same props — only where they sit changes. That is
 * why the drawers render `p.pane` and `p.inspector` unmodified: a narrow
 * layout that re-implemented either would be a second builder.
 *
 * ONE responsive layout lives here and nowhere else, off ONE number
 * (responsive.ts CHROME_DRAWER_MAX). No adapter forks it.
 *
 * ── THE PREVIEW TOGGLE ────────────────────────────────────────────────────
 * Desktop / Tablet / Phone sets the CANVAS PAPER WIDTH, not the window. It is
 * in the header for every adapter that hands in a `preview` pair, because the
 * customer opens the proposal on a phone and the author has no other way to
 * find that out before sending it. The width itself is one function in
 * responsive.ts, so no adapter decides what "phone" means.
 */
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ChevronDown, Clock, Eye, Layers, Menu, Monitor, PanelLeft, Plus, Search, Settings2,
  SlidersHorizontal, Smartphone, Tablet, X,
} from "lucide-react";
import { IadmModal, IadmBuilderPanes, type IadmModalProduct } from "../components/IadmModal";
import { NARROW_MEDIA_QUERY, PREVIEW_DEVICES, type PreviewKey } from "./responsive";
import { focusablesIn, firstTabTarget, nextTrapIndex } from "./focusTrap";
import {
  matchShortcut, preventsDefault, shortcutsIn, SHORTCUT_GROUPS, type BuilderAction,
} from "./shortcuts";

export interface BuilderFrameProps {
  open: boolean;
  onClose: () => void;
  /** Which product owns the modal chrome — drives the accent. */
  product: IadmModalProduct;
  /* THE EYEBROW IS DELETED (D-172). "OLIVER · DOCUMENT BUILDER" sat above
     the document's name; the reference editor's bar has no such line, and a
     bar whose page name is centred has nowhere to put one. `subtitle` went
     with it for the same reason. */
  title: ReactNode;
  /** Buttons on the right of the header, AFTER undo/redo. */
  headerActions?: ReactNode;
  footer?: ReactNode;

  /** ONE undo control, in the shell. An adapter supplies the stack, not the buttons. */
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /**
   * The magnifier (M-22) and the clock (M-7), beside Undo.
   *
   * Both are keyboard shortcuts first — `Ctrl+E` and `Ctrl+Shift+H` — and a
   * shortcut with nothing on screen to press is a shortcut only the person who
   * wrote it knows about. Optional, so a frame with no Find (the Studio, whose
   * canvas has no sections to find) simply does not draw one.
   */
  onFind?: () => void;
  onHistory?: () => void;
  /**
   * STRUCTURE and the PANEL TOGGLE (§11.13.1 items 3 and 4, D-165).
   *
   * The reference editor's top bar carries both: a layers button that opens the
   * floating tree, and the "+" that brings the widgets panel back. Ctrl+I and
   * Ctrl+P are the same two doors from the keyboard, and a shortcut with
   * nothing on screen to press is one only its author knows about.
   *
   * Optional, so a frame with no tree — the pixel studio, whose canvas has
   * no sections — simply does not draw one.
   */
  onStructure?: () => void;
  structureOpen?: boolean;
  onTogglePanel?: () => void;
  panelOpen?: boolean;

  /** LEFT — the widget pane (WidgetPane, from the registry). */
  pane: ReactNode;
  /** RIGHT — the inspector for whatever is selected. null hides the column. */
  inspector?: ReactNode;
  /** CENTRE — the canvas, whatever kind of canvas this builder has. */
  children: ReactNode;
  canvasBackground?: string;
  /** Rendered over everything (galleries, pickers) so an adapter can nest modals. */
  overlays?: ReactNode;

  /**
   * Desktop / Tablet / Phone. Both together or neither — an adapter whose
   * canvas has no paper width (the pixel studio: an artboard is 1080×1080
   * whatever you are holding) passes neither and gets no toggle, which is the
   * one place a document type genuinely differs.
   */
  preview?: PreviewKey;
  onPreview?: (key: PreviewKey) => void;

  /* ── THE USABILITY REBUILD (§11.10, D-02 / D-18 / D-19) ────────────────── */
  /**
   * Is there work on the page that has not been saved?
   *
   * D-02: Escape closed the builder and threw everything away, with no
   * confirmation. The frame never closes silently now — this is what it asks
   * about. The ENGINE decides what dirty means (it owns the history); the
   * frame only knows whether to ask.
   */
  dirty?: boolean;
  /**
   * A keystroke the map recognised (shortcuts.ts).
   *
   * Return TRUE when it was consumed. Escape is the one that matters: the
   * engine returns true for "I deselected something" and false for "there was
   * nothing to let go of", and only then does the frame offer to close.
   */
  onShortcut?: (action: BuilderAction) => boolean | void;
  /** The main menu's "Show me the walk-through again". */
  onReplayHelp?: () => void;
  /**
   * PAGE SETTINGS (D-172) — the reference's own top-bar button, left of
   * centre, and the chevron beside the page's name. Both do the same thing:
   * deselect, so the panel on the right is the document's own settings.
   */
  onPageSettings?: () => void;
  /**
   * PREVIEW CHANGES (D-172) — the eye in the right-hand group, beside the
   * verb. Optional: a builder with nothing to preview does not draw one.
   */
  onPreviewDoc?: () => void;
  /**
   * OUR COUNTERPART OF Angie, in the bar and NOWHERE ELSE (D-172).
   *
   * Three doors to the AI on one screen — the bar, a gold button in the
   * settings panel's header and a floating bubble over the canvas — is two
   * more than the reference has. This is the one that stays.
   */
  askArgus?: ReactNode;
}

/**
 * How far above the bottom of the WINDOW the bar's last row has to finish.
 *
 * The Ask ARGUS bubble is `fixed bottom-5 right-5 z-[9000]`
 * (components/argus/ArgusChatbot.tsx), so it floats OVER the modal rather than
 * inside it and nothing in the builder can lay itself out around it. It sat
 * exactly on "Send to customer".
 *
 * Cleared DOWNWARDS and not sideways: reserving the bubble's width was fine at
 * 850px and took 150 of a 390px phone's 390, which pushed a button off the
 * screen — measured, 2026-09-16. Its height is the same at every width.
 * 20px inset + a 44px pill, rounded up.
 *
 * EXPORTED (C-A-1). The Studio is on this frame but supplies its own footer,
 * so the bottom-bar padding below does not reach it and it needs the same
 * number — and one number written in two files is the thing this platform's
 * rules say not to do.
 */
export const ARGUS_BUBBLE_CLEARANCE = 68;

/**
 * Is the window narrow enough for drawers?
 *
 * `matchMedia` and not a resize listener: the browser already knows, and a
 * resize listener that runs on every pixel is the thing that makes a builder
 * feel slow while somebody drags a window.
 */
function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(NARROW_MEDIA_QUERY).matches
      : false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(NARROW_MEDIA_QUERY);
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return narrow;
}

export function BuilderFrame(p: BuilderFrameProps) {
  const narrow = useNarrowViewport();
  /** Which drawer is open. Only one at a time — two over a 390px canvas is none. */
  const [drawer, setDrawer] = useState<"pane" | "inspector" | null>(null);
  /** "Close and discard the changes?" — D-02. Never closes silently. */
  const [confirmClose, setConfirmClose] = useState(false);
  const [help, setHelp] = useState(false);
  /** The main menu at the far left — where Exit and the shortcuts live. */
  const [menu, setMenu] = useState(false);
  /**
   * A node INSIDE the modal, so the frame can find the dialog it is in.
   *
   * `display: contents` because the wrapper must not become a box in a flex
   * layout that was written without it — the panes are sized by the modal's
   * own grid, and an extra div with a size would fold the canvas.
   */
  const rootRef = useRef<HTMLDivElement | null>(null);

  // A window dragged back to full width must not leave a drawer stranded over
  // the canvas with no bottom bar left to close it.
  useEffect(() => { if (!narrow) setDrawer(null); }, [narrow]);

  /** The dialog element the trap works inside. Found from a node within it. */
  const dialogRoot = useCallback((): HTMLElement | null =>
    rootRef.current?.closest<HTMLElement>('[role="dialog"]') ?? null, []);

  /**
   * CLOSING IS ALWAYS A QUESTION WHEN THERE IS WORK ON THE PAGE (D-02).
   *
   * Every route out goes through here — Escape, the modal's own X, and the
   * backdrop — because the walk proved the point the hard way: "Open a draft,
   * add a widget, press Escape. Builder closes instantly; reopening shows the
   * widget gone."
   */
  const requestClose = useCallback(() => {
    if (p.dirty) { setConfirmClose(true); return; }
    p.onClose();
  }, [p]);

  /**
   * THE KEYBOARD, in one listener (D-18), and THE FOCUS TRAP (D-19).
   *
   * Capture phase on the document, so the frame sees a key before IadmModal's
   * own Escape handler does and can decide whether the modal should ever hear
   * it. That is the same mechanism the drawer's Escape already used; extending
   * it rather than adding a second listener is the rule.
   *
   * Tab is handled here rather than with `onKeyDown` on a wrapper, because the
   * header's buttons are IadmModal's children and a wrapper inside the body
   * would not contain them — the trap has to be the whole dialog or it is a
   * trap with a hole in it.
   */
  useEffect(() => {
    if (!p.open) return;
    const onKey = (e: KeyboardEvent) => {
      const root = dialogRoot();
      if (!root) return;

      if (e.key === "Tab") {
        const items = focusablesIn(root);
        if (!items.length) return;
        const canvas = root.querySelector<HTMLElement>('[data-builder-slot="canvas"]');
        const current = items.indexOf(document.activeElement as HTMLElement);
        if (firstTabTarget(current >= 0, !!canvas) === "canvas" && canvas) {
          e.preventDefault();
          canvas.tabIndex = -1;
          canvas.focus();
          return;
        }
        e.preventDefault();
        items[nextTrapIndex(items.length, current, e.shiftKey)]?.focus();
        return;
      }

      // A drawer, the confirm and the help panel each swallow Escape before
      // anything else can: the first reflex for "get this off my screen" must
      // never be "lose your work".
      if (e.key === "Escape") {
        if (menu) { e.stopPropagation(); setMenu(false); return; }
        if (help) { e.stopPropagation(); setHelp(false); return; }
        if (confirmClose) { e.stopPropagation(); setConfirmClose(false); return; }
        if (drawer) { e.stopPropagation(); setDrawer(null); return; }
      }

      const action = matchShortcut(e, e.target as unknown as { tagName?: string; isContentEditable?: boolean });
      if (!action) return;
      const consumed = p.onShortcut?.(action) === true;
      /* SHIFT+? OPENS THE SHORTCUTS LIST (D-172 round 2). The reference lists
         the chord in its own shortcuts panel and ours answered with nothing.
         The FRAME answers it, because the frame is what owns that panel — the
         same door the main menu opens, not a second one. */
      if (action === "shortcuts" && !consumed) {
        e.preventDefault(); e.stopPropagation(); setHelp(true); return;
      }
      if (action === "escape") {
        // ALWAYS stopped: the modal's own listener would close the builder
        // without asking, which is the defect.
        e.stopPropagation();
        if (!consumed) requestClose();
        return;
      }
      if (consumed && preventsDefault(action)) { e.preventDefault(); e.stopPropagation(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [confirmClose, dialogRoot, drawer, help, menu, p, requestClose]);

  /**
   * THE undo control. Defined once and rendered in exactly one place at a
   * time — the header when there are three panes, the bottom bar when there
   * are drawers. SD-010's rule is "exactly one undo control", and two copies
   * of this markup is how a second one arrives.
   */
  /**
   * UNDO AND REDO ARE NOT BUTTONS (D-172).
   *
   * The reference editor's top bar has neither: undo is Ctrl+Z and the History
   * panel, which is exactly what `shortcuts.ts` and `HistoryPanel.tsx` already
   * give us. Two arrow buttons in the bar were ours. `canUndo` / `canRedo` /
   * `onUndo` / `onRedo` stay on the props because the KEYBOARD needs them and
   * `dirty` is computed from them — what went is the chrome.
   *
   * What the narrow bar keeps is History, because a drawer layout still needs
   * a way to reach it with a thumb.
   */
  const barHistory = () => (p.onHistory ? (
    <button type="button" data-builder-historybtn title="History" aria-label="History"
      onClick={p.onHistory} style={barIcon(true)}>
      <Clock size={15} />
    </button>
  ) : null);

  /**
   * THE DEVICE SWITCHER — three ICONS, centred, the active one UNDERLINED.
   *
   * The reference's are icons with aria-labels "Desktop", "Tablet Portrait (up
   * to 1024px)" and "Mobile Portrait (up to 767px)", read out of the live
   * editor. Ours were three text buttons in a white pill, left of centre.
   */
  const previewToggle = p.preview && p.onPreview ? (
    <div
      role="group"
      aria-label="Preview width"
      data-builder-preview={p.preview}
      style={{ display: "flex", alignItems: "center", gap: 2 }}
    >
      {PREVIEW_DEVICES.map((d) => {
        const Icon = d.key === "desktop" ? Monitor : d.key === "tablet" ? Tablet : Smartphone;
        const on = p.preview === d.key;
        return (
          <button
            key={d.key}
            type="button"
            title={d.label}
            aria-label={d.label}
            aria-pressed={on}
            onClick={() => p.onPreview?.(d.key)}
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 30, height: 26, border: "none", background: "transparent", cursor: "pointer",
              color: on ? "#FFFFFF" : "rgba(255,255,255,0.65)",
              borderBottom: `2px solid ${on ? "#FFFFFF" : "transparent"}`,
            }}
          >
            <Icon size={15} />
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <>
      <IadmModal
        open={p.open}
        /* EVERY route out asks when there is unsaved work — the X and the
           backdrop as well as Escape (D-02). */
        onClose={requestClose}
        product={p.product}
        title=""
        /* SD-010 addendum: every builder opens as the largest surface we have. */
        size="builder"
        /* THE TOP BAR IS ONE STRIP, AND THE FRAME OWNS IT (D-172).
           An eyebrow, a title, a row of actions and a close X cannot be made
           to read like the reference editor's bar: its page name is CENTRED
           with a chevron, its device switcher is centred beside it, and the
           way out is the menu's Exit rather than an X on the end. So the
           modal takes the whole strip through `chrome`. */
        chrome={
          <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", minWidth: 0 }}>
            {/* ── LEFT: the menu, then the reference's four ─────────────── */}
            <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 4, flex: "0 0 auto" }}>
              <button type="button" data-builder-menubtn={menu ? "open" : "closed"}
                title="Menu" aria-label="Menu" aria-expanded={menu}
                onClick={() => setMenu((v) => !v)} style={ghost(true)}>
                <Menu size={15} />
              </button>
              {menu && (
                <>
                  <div onMouseDown={() => setMenu(false)}
                    style={{ position: "fixed", inset: 0, zIndex: 9490 }} />
                  <div role="menu" data-builder-mainmenu="open"
                    style={{
                      position: "absolute", top: 34, left: 0, zIndex: 9500, width: 220,
                      background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8,
                      boxShadow: "0 18px 44px rgba(11,28,36,0.24)", padding: "5px 0",
                    }}>
                    <button type="button" role="menuitem" data-mainmenu="shortcuts"
                      onClick={() => { setMenu(false); setHelp(true); }} style={menuRow}>
                      Keyboard Shortcuts
                    </button>
                    {p.onReplayHelp && (
                      <button type="button" role="menuitem" data-mainmenu="walkthrough"
                        onClick={() => { setMenu(false); p.onReplayHelp?.(); }} style={menuRow}>
                        Show me the walk-through again
                      </button>
                    )}
                    <div style={{ height: 1, background: "#EEF2F6", margin: "4px 0" }} />
                    <button type="button" role="menuitem" data-mainmenu="exit"
                      onClick={() => { setMenu(false); requestClose(); }} style={menuRow}>
                      Exit
                    </button>
                  </div>
                </>
              )}

              {p.onTogglePanel && !narrow && (
                <button type="button" data-builder-panelbtn={p.panelOpen === false ? "off" : "on"}
                  title="Add Element" aria-label="Add Element" aria-pressed={p.panelOpen !== false}
                  onClick={p.onTogglePanel} style={ghost(true)}>
                  <Plus size={15} />
                </button>
              )}
              {/* Our counterpart of Angie, in the bar and nowhere else. */}
              {!narrow && p.askArgus}
              {p.onPageSettings && !narrow && (
                <button type="button" data-builder-pagesettingsbtn
                  title="Page Settings" aria-label="Page Settings"
                  onClick={p.onPageSettings} style={ghost(true)}>
                  <Settings2 size={14} />
                </button>
              )}
              {p.onHistory && !narrow && (
                <button type="button" data-builder-historybtn
                  title="History" aria-label="History"
                  onClick={p.onHistory} style={ghost(true)}>
                  <Clock size={14} />
                </button>
              )}
            </div>

            {/* ── CENTRE: the page's name, then the device switcher ─────── */}
            <div style={{
              flex: "1 1 auto", minWidth: 0, display: "flex", alignItems: "center",
              justifyContent: "center", gap: 10,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 2, minWidth: 0, maxWidth: 420 }}>
                <div style={{ minWidth: 0, fontSize: 13, fontWeight: 600 }} data-builder-doctitle>
                  {p.title}
                </div>
                {p.onPageSettings && (
                  <button type="button" data-builder-titlechevron
                    title="Page Settings" aria-label="Page Settings"
                    onClick={p.onPageSettings}
                    style={{ border: "none", background: "transparent", color: "rgba(255,255,255,0.7)", cursor: "pointer", display: "inline-flex", padding: 2 }}>
                    <ChevronDown size={13} />
                  </button>
                )}
              </div>
              {!narrow && previewToggle}
            </div>

            {/* ── RIGHT: Finder, Structure, Preview, then the verb ──────── */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "0 0 auto" }}>
              {p.onFind && !narrow && (
                <button type="button" data-builder-findbtn
                  title="Finder" aria-label="Finder" onClick={p.onFind} style={ghost(true)}>
                  <Search size={14} />
                </button>
              )}
              {p.onStructure && (
                <button type="button" data-builder-structurebtn={p.structureOpen ? "open" : "closed"}
                  title="Structure" aria-label="Structure" aria-pressed={!!p.structureOpen}
                  onClick={p.onStructure} style={ghost(true)}>
                  <Layers size={14} />
                </button>
              )}
              {p.onPreviewDoc && !narrow && (
                <button type="button" data-builder-previewbtn
                  title="Preview Changes" aria-label="Preview Changes"
                  onClick={p.onPreviewDoc} style={ghost(true)}>
                  <Eye size={14} />
                </button>
              )}
              {narrow ? null : p.headerActions}
            </div>
          </div>
        }
        footer={p.footer}
      >
        <div ref={rootRef} style={{ display: "contents" }} />
        {narrow ? (
          <div data-builder-layout="narrow" className="relative flex h-full min-h-0 w-full flex-col">
            {/* THE CANVAS, full width. Same node, same props as the wide case. */}
            <main
              data-builder-slot="canvas"
              className="min-h-0 min-w-0 flex-1 overflow-y-auto"
              style={{ background: p.canvasBackground ?? "#E6ECF1" }}
            >
              {p.children}
            </main>

            {/* THE BOTTOM BAR — the way in to everything the panes held.
                THE HEADER, MOVED, and painted with the header's own ink for
                that reason: an adapter's buttons are styled for the dark strip
                they were written for (ProposalBuilder's `ghostBtn` is white
                text on a 25%-white border), and on a white bar "Save draft"
                and "Save as template" were white on white. Found by driving it
                at 850px, 2026-09-16 — as was the wrap: with `overflow-x-auto`
                "Send to customer", the entire point of the screen, was
                reachable only by knowing to swipe the bar sideways. */}
            <div
              data-builder-slot="bottombar"
              className="flex flex-shrink-0 flex-wrap items-center gap-2 px-3 py-2 text-white"
              style={{
                background: "linear-gradient(to right, #0B1C24, #1a3540)",
                // Room UNDER the buttons for the Ask ARGUS bubble — see the
                // constant. Without it the bubble sits on "Send to customer".
                paddingBottom: ARGUS_BUBBLE_CLEARANCE,
              }}
            >
              <button type="button" title="Widgets — the things you can add to this page"
                onClick={() => setDrawer(drawer === "pane" ? null : "pane")} style={barBtn(drawer === "pane")}>
                <PanelLeft size={14} /> Widgets
              </button>
              <button type="button" title="Settings for whatever is selected"
                disabled={p.inspector === null || p.inspector === undefined}
                onClick={() => setDrawer(drawer === "inspector" ? null : "inspector")}
                style={barBtn(drawer === "inspector", p.inspector === null || p.inspector === undefined)}>
                <SlidersHorizontal size={14} /> Settings
              </button>
              <span style={{ width: 1, height: 20, background: "rgba(255,255,255,0.2)", flex: "0 0 auto" }} />
              {barHistory()}
              {/* The adapter's own Save / Send / Preview, exactly as handed
                  in — the frame never re-implements an adapter's buttons. The
                  one thing it imposes is the 40px thumb target, because those
                  buttons were written for a header a mouse points at. */}
              <div className="ml-auto flex flex-wrap items-center justify-end gap-2 [&_button]:min-h-[40px]">{p.headerActions}</div>
            </div>

            {/* THE DRAWERS. p.pane and p.inspector go in untouched — a narrow
                layout that re-implemented either would be a second builder. */}
            {drawer && (
              <div className="absolute inset-0 z-20 flex" style={{ background: "rgba(11,28,36,0.45)" }}
                onClick={() => setDrawer(null)}>
                <aside
                  data-builder-slot={drawer === "pane" ? "pane" : "inspector"}
                  data-builder-drawer="open"
                  className={`flex h-full w-[min(88vw,360px)] flex-col bg-white shadow-2xl ${drawer === "pane" ? "mr-auto" : "ml-auto"}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 px-3 py-2">
                    <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                      {drawer === "pane" ? <><PanelLeft size={13} /> Widgets</> : <><Layers size={13} /> Settings</>}
                    </span>
                    <button type="button" onClick={() => setDrawer(null)} aria-label="Close" title="Close"
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                      <X size={15} />
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {drawer === "pane" ? p.pane : p.inspector}
                  </div>
                </aside>
              </div>
            )}
          </div>
        ) : (
          <IadmBuilderPanes
            canvasBackground={p.canvasBackground ?? "#E6ECF1"}
            pane={p.pane}
            inspector={p.inspector ?? null}
          >
            {p.children}
          </IadmBuilderPanes>
        )}
      </IadmModal>

      {/* D-02. "Open a draft, add a widget, press Escape → builder closes
          instantly; reopening shows the widget gone." Never again: the way out
          is a question, and Keep editing is what the Escape key lands on. */}
      {confirmClose && (
        <div role="dialog" aria-label="Close and discard the changes?" data-builder-confirmclose
          style={{ position: "fixed", inset: 0, zIndex: 9600, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(11,28,36,0.5)" }}>
          <div style={{ width: "min(400px, calc(100vw - 32px))", background: "#fff", borderRadius: 10, padding: 20, boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#0B1C24" }}>Close and discard the changes?</div>
            <p style={{ fontSize: 13, lineHeight: 1.5, color: "#334155", marginTop: 8 }}>
              You have changes on this page that have not been saved. Closing now throws them away.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
              <button type="button" autoFocus title="Go back to the page — nothing is lost"
                onClick={() => setConfirmClose(false)}
                style={{ border: "1px solid #CBD5E1", background: "#fff", color: "#0B1C24", borderRadius: 5, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                Keep editing
              </button>
              <button type="button" title="Close and lose the changes you have made"
                onClick={() => { setConfirmClose(false); p.onClose(); }}
                style={{ border: "none", background: "#B91C1C", color: "#fff", borderRadius: 5, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                Close and discard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KEYBOARD SHORTCUTS, and nothing else (D-172). The heading was "How
          this works", with a three-sentence paragraph and a "Show me the
          walk-through again" button above the table; the reference's shortcuts
          panel is a shortcuts panel. The walk-through moved into the main
          menu, where the reference keeps that kind of thing. */}
      {help && (
        <div data-builder-shortcuts role="dialog" aria-label="Keyboard Shortcuts"
          style={{ position: "fixed", inset: 0, zIndex: 9550, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(11,28,36,0.5)" }}
          onClick={() => setHelp(false)}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: "min(420px, calc(100vw - 32px))", background: "#fff", borderRadius: 10, padding: 20, boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <strong style={{ fontSize: 15, color: "#0B1C24" }}>Keyboard Shortcuts</strong>
              <button type="button" onClick={() => setHelp(false)} aria-label="Close" title="Close"
                style={{ marginLeft: "auto", border: "none", background: "transparent", cursor: "pointer", color: "#64748B" }}>
                <X size={15} />
              </button>
            </div>
            {/* TWO HEADINGS, Actions then Panels (D-172 round 2) — the
                reference's own split, driven on 2026-09-19. One flat table of
                sixteen rows was ours. */}
            <table style={{ width: "100%", marginTop: 14, fontSize: 12, borderCollapse: "collapse" }}>
              <tbody>
                {SHORTCUT_GROUPS.map((group) => (
                  <Fragment key={group}>
                    <tr data-shortcut-group={group}>
                      <th colSpan={2} style={{ padding: "12px 0 4px", textAlign: "left", fontSize: 12.5, fontWeight: 700, color: "#0B1C24" }}>
                        {group}
                      </th>
                    </tr>
                    {shortcutsIn(group).map((row) => (
                      <tr key={row.keys}>
                        <td style={{ padding: "4px 0", color: "#334155" }}>{row.what}</td>
                        <td style={{ padding: "4px 0 4px 10px", whiteSpace: "nowrap", textAlign: "right", fontWeight: 700, color: "#0B1C24" }}>{row.keys}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {p.overlays}
    </>
  );
}

/** One row of the main menu. */
const menuRow: React.CSSProperties = {
  display: "block", width: "100%", textAlign: "left", border: "none",
  background: "transparent", padding: "7px 12px", fontSize: 12.5,
  color: "#0B1C24", cursor: "pointer",
};

function ghost(enabled: boolean): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28,
    borderRadius: 4, border: "1px solid rgba(255,255,255,0.25)", background: "transparent",
    color: "#fff", opacity: enabled ? 1 : 0.35, cursor: enabled ? "pointer" : "default",
  };
}

/* The bar's own controls, in the header's clothes (see the bar's comment).
   40px minimum, the number IadmButton's own phone pass settled on: 28px is a
   comfortable button under a mouse and a miss under a thumb. */
function barBtn(on: boolean, disabled = false): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 6, flex: "0 0 auto",
    minHeight: 40, padding: "0 14px", borderRadius: 4, fontSize: 12, fontWeight: 600,
    border: `1px solid ${on ? "#FFFFFF" : "rgba(255,255,255,0.25)"}`,
    background: on ? "#FFFFFF" : "transparent",
    color: on ? "#0B1C24" : "#FFFFFF",
    opacity: disabled ? 0.35 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

function barIcon(enabled: boolean): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto",
    minHeight: 40, minWidth: 40, borderRadius: 4, border: "1px solid rgba(255,255,255,0.25)",
    background: "transparent",
    color: "#FFFFFF", opacity: enabled ? 1 : 0.35, cursor: enabled ? "pointer" : "default",
  };
}

export default BuilderFrame;
