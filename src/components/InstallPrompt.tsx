/**
 * InstallPrompt — "add the Portal to your home screen". Ops scope P5.
 *
 * WHAT THIS REPLACED
 * ------------------
 * Personal → Notifications carried an amber box that said, correctly, that
 * Apple only sends alerts to apps on the Home Screen — and then stopped. It
 * was iPhone-only, it was advice with no button, and on Android (where a
 * single tap installs the app) it said nothing at all, so the person most able
 * to act on it never saw it.
 *
 * Same component, two paths:
 *   Android / desktop Chrome / Edge — replay the captured
 *     `beforeinstallprompt` from a real button. One tap.
 *   iPhone / iPad Safari — no event exists, so the honest thing is the
 *     instruction, in the same words the share sheet uses. Kept from the box
 *     it replaces, because that wording was right.
 *   Already installed, or a browser that can do neither — render nothing.
 *
 * The two portal SPAs carry the same component. Copied, not shared.
 */

import { useEffect, useState } from 'react';
import { isStandalone, isIosSafari, canInstallNow, onInstallStateChange, promptInstall } from '../lib/pwaInstall';

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="inline h-4 w-4 align-text-bottom" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L8 8m4-4 4 4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
    </svg>
  );
}

function PlusSquareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="inline h-4 w-4 align-text-bottom" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path strokeLinecap="round" d="M12 8.5v7M8.5 12h7" />
    </svg>
  );
}

/**
 * @param reason  optional line explaining WHY it is worth installing, shown
 *                above the instruction. Notifications passes the iPhone-push
 *                reason; anywhere else can leave it out.
 */
export function InstallPrompt({ reason }: { reason?: string }) {
  // Read once: `isStandalone` cannot change without a reload.
  const [installed] = useState(() => isStandalone());
  const [canInstall, setCanInstall] = useState(() => canInstallNow());

  // beforeinstallprompt usually fires after the first render.
  useEffect(() => onInstallStateChange(() => setCanInstall(canInstallNow())), []);

  const [working, setWorking] = useState(false);
  const iosHint = isIosSafari();

  if (installed) return null;
  if (!canInstall && !iosHint) return null;

  async function install() {
    setWorking(true);
    try {
      await promptInstall();
    } finally {
      setWorking(false);
      setCanInstall(canInstallNow());
    }
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-medium">Add the Portal to your home screen</p>
      {reason && <p className="mt-1">{reason}</p>}
      {canInstall ? (
        <button
          type="button"
          onClick={() => void install()}
          disabled={working}
          className="mt-3 rounded-md bg-amber-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
        >
          {working ? 'Adding…' : 'Add to home screen'}
        </button>
      ) : (
        <p className="mt-1">
          In Safari, tap the share button <ShareIcon />, choose{' '}
          <span className="font-medium">Add to Home Screen</span> <PlusSquareIcon />, then open the Portal
          from that icon.
        </p>
      )}
    </div>
  );
}

export default InstallPrompt;
