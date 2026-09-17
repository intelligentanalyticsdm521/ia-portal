/**
 * builder/FirstRun.tsx — three sentences, on every open, until you say stop.
 *
 * The steps and the "should it show" rule are `firstRunModel.ts`; this draws
 * them. Skippable at every step, replayable from the "?" in the header, and it
 * never blocks the page behind it for longer than it takes to read.
 *
 * ── THE CHECKBOX (D-154) ──────────────────────────────────────────────────
 * "Don't show me this again", unticked, at the bottom left. Whichever way the
 * box is left — Skip, the ×, or Next through to "Start building" — the answer
 * travels with it: `onDone(dontShowAgain)`. Ticked once and this person never
 * sees it open on its own again, on any computer they sign in on, until they
 * turn "Builder tips" back on in Settings → Tutorials.
 *
 * It says nothing about where the answer is kept, because this component does
 * not know: the shell holds the switch.
 */
import { useState } from "react";
import { X } from "lucide-react";
import { FIRST_RUN_STEPS, nextStep } from "./firstRunModel";

export interface FirstRunProps {
  /** Closed — and whether "Don't show me this again" was ticked on the way out. */
  onDone: (dontShowAgain: boolean) => void;
  /** What is being built, so the last step names it. From the adapter's copy. */
  noun?: string;
}

export function FirstRun({ onDone, noun }: FirstRunProps) {
  const [i, setI] = useState(0);
  // Unticked by default, deliberately: the tips stay unless somebody asks for
  // them to stop. A pre-ticked box turns "I read it" into "never again".
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const step = FIRST_RUN_STEPS[i];
  const last = nextStep(i) === null;
  const close = () => onDone(dontShowAgain);

  return (
    <div
      data-builder-firstrun={String(i + 1)}
      role="dialog"
      aria-label="How this works"
      style={{
        position: "fixed", inset: 0, zIndex: 9400, display: "flex",
        alignItems: "center", justifyContent: "center", background: "rgba(11,28,36,0.55)",
      }}
    >
      <div style={{
        width: "min(440px, calc(100vw - 32px))", background: "#fff", borderRadius: 12,
        boxShadow: "0 24px 64px rgba(0,0,0,0.3)", padding: 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#5A7A8A" }}>
            Step {i + 1} of {FIRST_RUN_STEPS.length}
          </span>
          <button type="button" onClick={close} title="Skip this — you can bring it back with the ? at the top"
            aria-label="Skip"
            style={{ marginLeft: "auto", border: "none", background: "transparent", cursor: "pointer", color: "#64748B" }}>
            <X size={16} />
          </button>
        </div>

        <h2 style={{ fontSize: 19, fontWeight: 700, color: "#0B1C24", margin: "10px 0 6px" }}>{step.title}</h2>
        <p style={{ fontSize: 13, lineHeight: 1.55, color: "#334155", margin: 0 }}>
          {last && noun ? step.body.replace(/this draft/i, `this ${noun}`) : step.body}
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 18 }}>
          {FIRST_RUN_STEPS.map((_, n) => (
            <span key={n} aria-hidden="true" style={{
              width: 7, height: 7, borderRadius: 999, background: n === i ? "#0C4A60" : "#CBD5E1",
            }} />
          ))}
          <button type="button" onClick={close} title="Skip this — you can bring it back with the ? at the top"
            style={{ marginLeft: "auto", border: "1px solid #CBD5E1", background: "#fff", color: "#334155", borderRadius: 5, padding: "7px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            Skip
          </button>
          <button type="button"
            onClick={() => { const n = nextStep(i); if (n === null) close(); else setI(n); }}
            title={last ? "Start building" : "Next"}
            style={{ border: "none", background: "#EF6C33", color: "#fff", borderRadius: 5, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            {last ? "Start building" : "Next"}
          </button>
        </div>

        <label
          data-builder-firstrun-dismiss="1"
          style={{
            display: "flex", alignItems: "center", gap: 7, marginTop: 14,
            paddingTop: 12, borderTop: "1px solid #E2E8F0",
            fontSize: 12, color: "#475569", cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
            style={{ width: 14, height: 14, cursor: "pointer", accentColor: "#0C4A60" }}
          />
          Don't show me this again
        </label>
      </div>
    </div>
  );
}

export default FirstRun;
