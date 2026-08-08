// IdleLogout — auto sign-out after a fixed idle window.
//
// Brandon 2026-07-27: sessions never expired; log a user out after 90 min idle
// (was 2h). This is IDLE timeout (resets on activity), not an absolute session
// cap — a user actively working is never kicked mid-task; only a truly
// inactive tab times out, and then must sign back in through CIAM.
//
// Cross-tab: last-activity is written to localStorage, so activity in ANY tab
// keeps ALL tabs alive, and the countdown is shared. A 60s warning overlay
// gives a "Stay signed in" escape hatch before the redirect.
//
// Mounted inside AppGate (authenticated area only) — never runs pre-login.
import { useCallback, useEffect, useRef, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { hardLogout } from "../auth/pca";

const IDLE_MS = 90 * 60 * 1000; // 90 minutes
const WARN_MS = 60 * 1000; // warn 60s before logout
const CHECK_MS = 15 * 1000; // poll cadence
const LS_KEY = "iadm.lastActivityAt";

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"] as const;

export function IdleLogout() {
  const { instance } = useMsal();
  const [warnOpen, setWarnOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const loggingOut = useRef(false);

  const now = () => Date.now();
  const readLast = () => {
    const v = Number(localStorage.getItem(LS_KEY) || "0");
    return Number.isFinite(v) && v > 0 ? v : now();
  };
  const bump = useCallback(() => {
    // Don't let activity behind the warning silently extend the session —
    // the user must click "Stay signed in". Outside the warning, any activity
    // refreshes the shared clock.
    if (warnOpen) return;
    try { localStorage.setItem(LS_KEY, String(now())); } catch { /* private mode */ }
  }, [warnOpen]);

  const doLogout = useCallback(() => {
    if (loggingOut.current) return;
    loggingOut.current = true;
    try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
    // Idle timeout signs the user straight out — no "pick an account to sign
    // out of" chooser (which, if the user has walked away, leaves
    // interaction_in_progress and wedges the next sign-in). hardLogout() sends
    // `logoutHint`, which is what actually suppresses Entra's picker, and is
    // shared with the account-menu Sign out so both behave identically.
    hardLogout(instance);
  }, [instance]);

  const staySignedIn = useCallback(() => {
    setWarnOpen(false);
    try { localStorage.setItem(LS_KEY, String(now())); } catch { /* ignore */ }
  }, []);

  // Seed the clock on mount + wire activity listeners.
  useEffect(() => {
    if (!localStorage.getItem(LS_KEY)) {
      try { localStorage.setItem(LS_KEY, String(now())); } catch { /* ignore */ }
    }
    const handler = () => bump();
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    return () => ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, handler));
  }, [bump]);

  // The tick: decide warn vs logout from the shared last-activity stamp.
  useEffect(() => {
    const id = window.setInterval(() => {
      const idle = now() - readLast();
      if (idle >= IDLE_MS) {
        doLogout();
      } else if (idle >= IDLE_MS - WARN_MS) {
        setWarnOpen(true);
        setSecondsLeft(Math.max(0, Math.ceil((IDLE_MS - idle) / 1000)));
      } else if (warnOpen) {
        // Another tab refreshed the clock — clear the warning here too.
        setWarnOpen(false);
      }
    }, CHECK_MS);
    return () => window.clearInterval(id);
  }, [doLogout, warnOpen]);

  // Smooth 1s countdown while the warning is open.
  useEffect(() => {
    if (!warnOpen) return;
    const id = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((IDLE_MS - (now() - readLast())) / 1000));
      setSecondsLeft(left);
      if (left <= 0) doLogout();
    }, 1000);
    return () => window.clearInterval(id);
  }, [warnOpen, doLogout]);

  if (!warnOpen) return null;

  return (
    <div
      role="alertdialog"
      aria-label="Session expiring"
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(15,23,42,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, maxWidth: 380, boxShadow: "0 10px 40px rgba(0,0,0,0.2)" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#0B1C24" }}>Still there?</div>
        <p style={{ marginTop: 8, fontSize: 13, color: "#5A7A8A", lineHeight: 1.5 }}>
          You&apos;ve been inactive for a while. For your security we&apos;ll sign you out in{" "}
          <strong>{secondsLeft}s</strong>.
        </p>
        <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={doLogout}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", fontSize: 13, fontWeight: 600, color: "#334155", cursor: "pointer" }}
          >
            Sign out now
          </button>
          <button
            type="button"
            onClick={staySignedIn}
            style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: "#0B5FFF", fontSize: 13, fontWeight: 600, color: "#fff", cursor: "pointer" }}
          >
            Stay signed in
          </button>
        </div>
      </div>
    </div>
  );
}

export default IdleLogout;
