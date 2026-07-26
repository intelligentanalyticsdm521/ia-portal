// walkthroughLaunchBus — lets any surface (engagement alerts, insights CTAs)
// start an interactive walkthrough without importing the launcher's state.
// Module singleton beats a DOM CustomEvent here: HMR keeps both sides on the
// same module instance, and there's nothing to mistype.
type Listener = (flowId: string) => void;

// STACK, not a single slot: the header renders more than one launcher
// instance (desktop/mobile variants, StrictMode remounts). Launch targets the
// most recently mounted LIVE subscriber; unmounts remove only themselves.
const listeners: Listener[] = [];

export function onWalkthroughLaunch(l: Listener): () => void {
  listeners.push(l);
  return () => {
    const i = listeners.indexOf(l);
    if (i >= 0) listeners.splice(i, 1);
  };
}

export function launchWalkthrough(flowId: string): void {
  console.info(`[walkthroughLaunchBus] launch ${flowId} → ${listeners.length} subscriber(s)`);
  const top = listeners[listeners.length - 1];
  if (top) top(flowId);
}

// Dev-only probe so the state of THIS module instance (the one the app
// actually imports, HMR queries and all) is inspectable from the console.
if (import.meta.env.DEV) {
  (window as any).__iadmWalkthroughBus = {
    count: () => listeners.length,
    launch: launchWalkthrough,
  };
}
