/**
 * pwaInstall.ts — "add the Portal to your home screen". Ops scope P5.
 *
 * Foundation A2 shipped web push and index.html already carries the manifest
 * and the apple-* meta tags it needs. What was missing is the other half of
 * the sentence: on an iPhone, push only works from a Home-Screen app, so
 * Personal → Notifications tells people that — and then leaves them to work
 * out how, on every platform.
 *
 * This is the install half. Deliberately separate from src/lib/push.ts
 * (Foundation's file) rather than bolted onto it: installing an app and
 * subscribing to notifications are two different decisions, and one of them
 * makes the other possible rather than being part of it.
 *
 * Same shape as the copies in the two portal SPAs. Copied, not shared — three
 * repos with three deploy pipelines is a bad trade for sixty lines.
 */

/** True when the page is running as an installed app rather than in a tab. */
export function isStandalone(): boolean {
  try {
    return (
      window.matchMedia?.('(display-mode: standalone)').matches === true ||
      window.matchMedia?.('(display-mode: fullscreen)').matches === true ||
      window.matchMedia?.('(display-mode: minimal-ui)').matches === true ||
      // Safari's own non-standard flag — still the only reliable one on iOS.
      (navigator as unknown as { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

/** iPhone/iPad, where "install" means Share → Add to Home Screen and nothing else. */
export function isIos(): boolean {
  const ua = navigator.userAgent || '';
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports itself as a Mac; the touch points give it away.
    (/Macintosh/.test(ua) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1)
  );
}

/** Safari specifically — Chrome and Firefox on iOS cannot add to the Home Screen. */
export function isIosSafari(): boolean {
  const ua = navigator.userAgent || '';
  return isIos() && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* one bad listener must not stop the others */
    }
  });
}

if (typeof window !== 'undefined') {
  // Chrome fires this once, early, and it can only be replayed from inside a
  // user gesture — so it is captured at module load, not in a component that
  // may not have mounted yet.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // suppress Chrome's own mini-infobar; we have a button
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

export function canInstallNow(): boolean {
  return deferredPrompt !== null;
}

export function onInstallStateChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Show the browser's own install dialog. True if they went through with it. */
export async function promptInstall(): Promise<boolean> {
  const evt = deferredPrompt;
  if (!evt) return false;
  try {
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    deferredPrompt = null; // single-use whichever way they answered
    notify();
    return outcome === 'accepted';
  } catch {
    deferredPrompt = null;
    notify();
    return false;
  }
}
