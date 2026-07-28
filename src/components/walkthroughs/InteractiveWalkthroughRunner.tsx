// InteractiveWalkthroughRunner — #256 Part 2 (LOCKED 2026-07-03)
//
// Click-wait, chain-across-modals walkthrough runner. Different from the
// existing WalkthroughRunner ("explain + route" per Brandon 2026-06-19):
// this one HIGHLIGHTS a target, waits for the user to ACTUALLY CLICK it,
// then advances to the next step. Steps can target elements inside a
// modal that just opened.
//
// Design principles (Brandon 2026-07-03):
//   - Smaller than guided tours: 5-10 steps per flow, not 25-34
//   - Highlight → tooltip → wait for click (or input, or route change)
//   - Chain across modals — waitForMs lets the runner wait for a
//     modal-open animation before spotlighting the next target
//   - Only for "create your first X" flows, not every page
//   - Retriggerable from Help menu
//
// Reuses the visual language of GuidedTour (spotlight cut-out via
// box-shadow, tooltip beside target) but wires interaction listeners
// instead of Next-button-only.

import { useEffect, useLayoutEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { X, ChevronLeft } from "lucide-react";

export type InteractiveAdvanceMode = "click" | "input" | "route" | "next";

export interface InteractiveStep {
  /** CSS selector for the element to spotlight + wait-for-click on. */
  targetSelector: string;
  /** Optional route to navigate to before rendering the step. */
  route?: string;
  /** Tooltip title. */
  title: string;
  /** Tooltip body. */
  body: string;
  /** Tooltip placement relative to target. */
  placement?: "top" | "bottom" | "left" | "right" | "auto";
  /**
   * What advances the step:
   *   'click'  — wait for click on the target element (default)
   *   'input'  — wait for user to type into the target (change event)
   *   'route'  — wait for URL to change (user clicked through)
   *   'next'   — informational step, user clicks Next button
   */
  advance?: InteractiveAdvanceMode;
  /**
   * Poll for target element up to this many ms. Modal-open animations
   * can be 300-500ms; use 1500 as safe default. Default 4000.
   */
  waitForMs?: number;
}

export interface InteractiveFlow {
  id: string;
  product: "oliver" | "spark" | "arion" | "consulting" | "platform";
  title: string;
  oneLiner: string;
  estimatedMinutes: number;
  steps: InteractiveStep[];
}

function completedKey(id: string) { return `walkthrough:interactive:completed:${id}`; }
export function isInteractiveCompleted(id: string): boolean {
  try { return localStorage.getItem(completedKey(id)) === "1"; }
  catch { return false; }
}
export function markInteractiveCompleted(id: string) {
  try { localStorage.setItem(completedKey(id), "1"); } catch { /* ignore */ }
}
export function resetInteractive(id: string) {
  try { localStorage.removeItem(completedKey(id)); } catch { /* ignore */ }
}

interface RunnerProps {
  flow: InteractiveFlow;
  open: boolean;
  onClose: () => void;
  accent?: string;
}

export function InteractiveWalkthroughRunner({ flow, open, onClose, accent = "#EF6C33" }: RunnerProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [stepIdx, setStepIdx] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [ready, setReady] = useState(false);
  /** For input steps: they've typed something, so Next is available. */
  const [typedOk, setTypedOk] = useState(false);
  /** Target never appeared. We SHOW this rather than skipping past it. */
  const [notFound, setNotFound] = useState(false);

  const step = flow.steps[stepIdx];

  // Reset when opening
  useEffect(() => { if (open) setStepIdx(0); }, [open, flow.id]);

  // Navigate to step.route if we're not already there
  useEffect(() => {
    if (!open || !step) return;
    if (step.route && location.pathname !== step.route) {
      navigate(step.route);
    }
  }, [open, step, location.pathname, navigate]);

  // Locate the target element, spotlight it, and wire the advance listener.
  useLayoutEffect(() => {
    if (!open || !step) return;
    setReady(false);
    setTargetRect(null);
    setTypedOk(false);
    setNotFound(false);

    // If we still need to navigate, wait for the URL to match before
    // looking for the target.
    if (step.route && location.pathname !== step.route) return;

    let cancelled = false;
    // setTimeout, not rAF — rAF is suspended entirely while the tab is
    // hidden, which would freeze the walkthrough mid-step. See GuidedTour.
    let raf = 0;
    let advanceListenerCleanup: (() => void) | null = null;
    const start = performance.now();
    const maxWait = step.waitForMs ?? 4000;
    const advance = step.advance ?? "click";

    function findAndWire() {
      if (cancelled) return;
      const el = document.querySelector(step.targetSelector) as HTMLElement | null;
      const elapsed = performance.now() - start;
      if (!el) {
        if (elapsed < maxWait) {
          raf = window.setTimeout(findAndWire, 16);
          return;
        }
        // Target never appeared.
        //
        // Brandon 2026-07-28: "we got to the start a campaign and then nothing
        // popped up afterwards."
        //
        // This used to AUTO-ADVANCE, and that turned one bad selector into a
        // silent detonation of the whole rest of the flow: the campaign step
        // opened the composer on its channel picker, so the next three targets
        // (name, subject, save) were all unrendered, each waited its timeout,
        // each skipped — and ~9s later the walkthrough "completed" and
        // vanished. From the user's seat the thing simply died, with the only
        // evidence in a console nobody has open.
        //
        // Auto-advancing is fail-open: it hides our bug and strands the user.
        // Now we STOP and say so. The step's own teaching text still shows —
        // so the explanation lands even when the button doesn't — and Next is
        // always available, so a missing hook costs one manual click instead
        // of the remainder of the walkthrough.
        console.warn(
          `[InteractiveWalkthrough] Target "${step.targetSelector}" not found within ${maxWait}ms for flow "${flow.id}" step ${stepIdx + 1}/${flow.steps.length}.`,
        );
        setNotFound(true);
        setReady(true);
        return;
      }

      // Scroll into view if needed
      const rect = el.getBoundingClientRect();
      const inViewport = rect.top >= 0 && rect.bottom <= window.innerHeight - 20;
      if (!inViewport) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => {
          if (cancelled) return;
          const r = el.getBoundingClientRect();
          setTargetRect(r);
          setReady(true);
        }, 350);
      } else {
        setTargetRect(rect);
        setReady(true);
      }

      // Wire the advance listener.
      //
      // DELEGATED, not bound to `el`. Binding to the node we happened to find
      // looks right and fails silently: saving a contact refetches the list,
      // React swaps the row nodes, and our listener is stranded on a detached
      // element. The user then clicks the button they can see, the modal
      // opens — and the walkthrough sits on the same step forever, with no
      // Next button to escape (click steps don't render one). Verified: the
      // create→delete exercise stalled dead at "Now open it back up".
      //
      // Listening on the document and matching with closest() means we react
      // to whatever node is live at click time, so re-renders can't break it.
      if (advance === "click") {
        const onClick = (e: MouseEvent) => {
          if (cancelled) return;
          const hit = (e.target as HTMLElement | null)?.closest?.(step.targetSelector);
          if (!hit) return;
          setTimeout(nextOrFinish, 250); // let the button's own handler run first
        };
        document.addEventListener("click", onClick, true); // capture: fires even if a handler stops propagation
        advanceListenerCleanup = () => document.removeEventListener("click", onClick, true);
      } else if (advance === "input") {
        // Brandon 2026-07-28: "as soon as I hit a space or a character it
        // moves on instead of waiting for a tab or enter or me to click
        // next." The old handler fired on the FIRST input event, so the step
        // vanished mid-word. Now the user signals they're DONE: Enter or Tab,
        // or clicking out of the field. Typing alone never advances — it just
        // enables the Next button (see footer).
        //
        // Delegated for the same reason as click, above — resolve the field
        // from the event so a re-render can't strand us. `focusout` rather
        // than `blur`, because blur doesn't bubble.
        const field = (e: Event) =>
          (e.target as HTMLElement | null)?.closest?.(step.targetSelector) as
            | HTMLInputElement
            | null;
        const isDone = (f: HTMLInputElement | null) => !!f?.value?.trim().length;
        const onInput = (e: Event) => {
          const f = field(e);
          if (cancelled || !f) return;
          setTypedOk(isDone(f)); // lights up Next; does NOT advance
        };
        const onKey = (e: KeyboardEvent) => {
          const f = field(e);
          if (cancelled || !f) return;
          if ((e.key === "Enter" || e.key === "Tab") && isDone(f)) {
            e.preventDefault();
            setTimeout(nextOrFinish, 120);
          }
        };
        const onFocusOut = (e: Event) => {
          const f = field(e);
          if (cancelled || !f) return;
          if (isDone(f)) setTimeout(nextOrFinish, 200);
        };
        document.addEventListener("input", onInput, true);
        document.addEventListener("keydown", onKey as EventListener, true);
        document.addEventListener("focusout", onFocusOut, true);
        advanceListenerCleanup = () => {
          document.removeEventListener("input", onInput, true);
          document.removeEventListener("keydown", onKey as EventListener, true);
          document.removeEventListener("focusout", onFocusOut, true);
        };
      } else if (advance === "route") {
        // Handled via location.pathname change effect below
        advanceListenerCleanup = null;
      }
      // 'next' mode doesn't wire anything — user clicks Next button
    }

    findAndWire();

    function onResize() {
      if (cancelled) return;
      const el = document.querySelector(step.targetSelector) as HTMLElement | null;
      if (el) setTargetRect(el.getBoundingClientRect());
    }
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);

    // Keep tracking the target while the step is open (Brandon 2026-07-28:
    // the highlight sat in empty space above the New-campaign button). Pages
    // finish loading async content AFTER we measure — a chart or table
    // renders, everything below shifts down, and a one-shot rect leaves the
    // spotlight stranded where the element USED to be. Resize/scroll handlers
    // don't fire for that. Cheap poll; stops with the step.
    const track = window.setInterval(() => {
      if (cancelled) return;
      const el = document.querySelector(step.targetSelector) as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setTargetRect((prev) =>
        !prev || Math.abs(prev.top - r.top) > 1 || Math.abs(prev.left - r.left) > 1 ||
        Math.abs(prev.width - r.width) > 1 || Math.abs(prev.height - r.height) > 1 ? r : prev);
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(raf);
      clearInterval(track);
      advanceListenerCleanup?.();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, location.pathname]);

  // For advance === 'route', watch pathname change and advance when it does
  useEffect(() => {
    if (!open || !step || (step.advance ?? "click") !== "route") return;
    // Only advance if we already navigated to step.route (previous step)
    // then the URL changes to something else.
    if (!step.route) return;
    if (location.pathname !== step.route) {
      nextOrFinish();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, location.pathname]);

  function nextOrFinish() {
    if (stepIdx + 1 >= flow.steps.length) {
      finish();
    } else {
      setStepIdx((i) => i + 1);
    }
  }

  function finish() {
    markInteractiveCompleted(flow.id);
    onClose();
  }

  function back() {
    setStepIdx((i) => Math.max(0, i - 1));
  }

  if (!open || !step) return null;

  const spotlightStyle: React.CSSProperties = targetRect ? {
    position: "fixed",
    top: targetRect.top - 6,
    left: targetRect.left - 6,
    width: targetRect.width + 12,
    height: targetRect.height + 12,
    borderRadius: 8,
    boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.55)",
    pointerEvents: "none",
    transition: "all 200ms ease",
    border: `2px solid ${accent}`,
    zIndex: 9998,
  } : {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.55)",
    zIndex: 9998,
    pointerEvents: "none",
  };

  const tooltipW = 320;
  const tooltipH = 200;
  const pad = 12;
  const tooltipStyle: React.CSSProperties = (() => {
    if (!targetRect) {
      return { left: `calc(50% - ${tooltipW / 2}px)`, top: `calc(50% - ${tooltipH / 2}px)`, width: tooltipW };
    }
    const placement = step.placement === "auto" || !step.placement
      ? (targetRect.top > window.innerHeight / 2 ? "top" : "bottom")
      : step.placement;
    let top = targetRect.top;
    let left = targetRect.left;
    if (placement === "bottom") { top = targetRect.bottom + pad; }
    else if (placement === "top") { top = targetRect.top - tooltipH - pad; }
    else if (placement === "right") { left = targetRect.right + pad; }
    else if (placement === "left") { left = targetRect.left - tooltipW - pad; }
    left = Math.max(8, Math.min(left, window.innerWidth - tooltipW - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - tooltipH - 8));
    return { top, left, width: tooltipW };
  })();

  const advanceCopy = (() => {
    if (notFound) return null; // nothing to click — see the note instead
    switch (step.advance ?? "click") {
      case "click": return "Click the highlighted element";
      case "input": return "Type your answer, then press Enter (or click Next)";
      case "route": return "Follow the highlighted link";
      case "next": return null;
    }
  })();

  return (
    // pointer-events NONE on the root (Brandon 2026-07-28: "it says to add a
    // new contact but I can't actually click the button").
    //
    // This overlay is fixed inset-0, so with default pointer-events it sat on
    // top of the entire page and swallowed every click — including the click
    // on the highlighted element that the step is literally waiting for. The
    // walkthrough could never advance by real interaction. It escaped notice
    // because verification dispatched synthetic events, which bypass
    // hit-testing entirely; only a real cursor (or elementFromPoint) reveals it.
    //
    // The spotlight is already pointer-events:none; the tooltip re-enables
    // them so its own Skip/Back/Next stay clickable.
    <div
      className="fixed inset-0 z-[9997]"
      style={{ pointerEvents: "none" }}
      role="dialog"
      aria-modal="false"
      aria-label={flow.title}
    >
      <div style={spotlightStyle} />
      {ready && (
        <div
          className="fixed z-[9999] rounded-xl bg-white shadow-2xl border-2"
          style={{ ...tooltipStyle, borderColor: accent, pointerEvents: "auto" }}
        >
          <div
            className="flex items-center justify-between rounded-t-lg px-3 py-2"
            style={{ background: accent, color: "#fff" }}
          >
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider">
                {flow.title} · {stepIdx + 1} of {flow.steps.length}
              </span>
            </div>
            <button onClick={finish} className="rounded p-0.5 hover:bg-black/10" aria-label="Skip walkthrough">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="p-4">
            <div className="text-sm font-bold text-slate-900 mb-1.5">{step.title}</div>
            <div className="text-xs text-slate-600 leading-relaxed mb-3">{step.body}</div>
            {advanceCopy && (
              <div
                className="text-[11px] font-semibold italic"
                style={{ color: accent }}
              >
                {advanceCopy} to continue
              </div>
            )}
            {notFound && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-900">
                I can't find that control on this screen — it may not be
                available on your plan, or it may have moved. Click{" "}
                <span className="font-semibold">Next</span> to carry on with the
                walkthrough.
              </div>
            )}
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2">
            <button onClick={finish} className="text-[11px] text-slate-500 hover:text-slate-700">
              Skip
            </button>
            <div className="flex items-center gap-1.5">
              {stepIdx > 0 && (
                <button
                  onClick={back}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <ChevronLeft className="h-3 w-3" /> Back
                </button>
              )}
              {/* Input steps get a Next button too, enabled once they've
                  actually typed something — so nobody is trapped in a field
                  wondering what the magic keystroke is. */}
              {(notFound || step.advance === "next" || step.advance === "input") && (
                <button
                  onClick={nextOrFinish}
                  disabled={!notFound && step.advance === "input" && !typedOk}
                  className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
                  style={{ background: accent }}
                >
                  {stepIdx + 1 === flow.steps.length ? "Finish" : "Next"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default InteractiveWalkthroughRunner;
