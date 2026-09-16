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
import { useEffect, useState, type ReactNode } from "react";
import { Layers, PanelLeft, Redo2, SlidersHorizontal, Undo2, X } from "lucide-react";
import { IadmModal, IadmBuilderPanes, type IadmModalProduct } from "../components/IadmModal";
import { NARROW_MEDIA_QUERY, PREVIEW_DEVICES, type PreviewKey } from "./responsive";

export interface BuilderFrameProps {
  open: boolean;
  onClose: () => void;
  /** Which product owns the modal chrome — drives the eyebrow and accent. */
  product: IadmModalProduct;
  eyebrow: string;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Buttons on the right of the header, AFTER undo/redo. */
  headerActions?: ReactNode;
  footer?: ReactNode;

  /** ONE undo control, in the shell. An adapter supplies the stack, not the buttons. */
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;

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
 */
const ARGUS_BUBBLE_CLEARANCE = 68;

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

  // A window dragged back to full width must not leave a drawer stranded over
  // the canvas with no bottom bar left to close it.
  useEffect(() => { if (!narrow) setDrawer(null); }, [narrow]);

  /**
   * Escape closes the DRAWER, and only then the builder.
   *
   * Found by driving it (2026-09-16): IadmModal listens for Escape on the
   * document, so pressing it with the widget drawer open threw away the whole
   * document instead of the drawer — the first reflex anybody has for "get
   * this panel off my screen" was "lose your work". Capture phase, and only
   * while a drawer is open, so the modal's own Escape is untouched otherwise.
   */
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setDrawer(null);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [drawer]);

  /**
   * THE undo control. Defined once and rendered in exactly one place at a
   * time — the header when there are three panes, the bottom bar when there
   * are drawers. SD-010's rule is "exactly one undo control", and two copies
   * of this markup is how a second one arrives.
   */
  const undoRedo = (where: "header" | "bar") => {
    const style = where === "header" ? ghost : barIcon;
    const size = where === "header" ? 14 : 15;
    return (
      <>
        <button type="button" title="Undo (Ctrl+Z)" aria-label="Undo (Ctrl+Z)" disabled={!p.canUndo} onClick={p.onUndo} style={style(p.canUndo)}>
          <Undo2 size={size} />
        </button>
        <button type="button" title="Redo (Ctrl+Shift+Z)" aria-label="Redo (Ctrl+Shift+Z)" disabled={!p.canRedo} onClick={p.onRedo} style={style(p.canRedo)}>
          <Redo2 size={size} />
        </button>
      </>
    );
  };

  const previewToggle = p.preview && p.onPreview ? (
    <div
      role="group"
      aria-label="Preview width"
      data-builder-preview={p.preview}
      style={{ display: "flex", alignItems: "center", gap: 2, borderRadius: 5, padding: 2, background: "rgba(255,255,255,0.10)" }}
    >
      {PREVIEW_DEVICES.map((d) => (
        <button
          key={d.key}
          type="button"
          title={d.title}
          aria-pressed={p.preview === d.key}
          onClick={() => p.onPreview?.(d.key)}
          style={{
            border: "none", borderRadius: 4, padding: "3px 8px", fontSize: 11, fontWeight: 600, cursor: "pointer",
            background: p.preview === d.key ? "#FFFFFF" : "transparent",
            color: p.preview === d.key ? "#0B1C24" : "rgba(255,255,255,0.75)",
          }}
        >
          {d.label}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <>
      <IadmModal
        open={p.open}
        onClose={p.onClose}
        product={p.product}
        eyebrow={p.eyebrow}
        title={p.title}
        subtitle={p.subtitle}
        /* SD-010 addendum: every builder opens as the largest surface we have. */
        size="builder"
        headerActions={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {previewToggle}
            {/* Narrow: undo/redo and the adapter's own buttons move to the
                bottom bar, where a thumb can reach them. Never both places. */}
            {narrow ? null : undoRedo("header")}
            {narrow ? null : p.headerActions}
          </div>
        }
        footer={p.footer}
      >
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
              {undoRedo("bar")}
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
      {p.overlays}
    </>
  );
}

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
