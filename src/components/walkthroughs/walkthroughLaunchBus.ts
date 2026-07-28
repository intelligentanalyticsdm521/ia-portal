// walkthroughLaunchBus — lets any surface (engagement alerts, insights CTAs,
// ARGUS chat) start help without importing the launcher's state.
//
// Module singleton beats a DOM CustomEvent here: HMR keeps both sides on the
// same module instance, and there's nothing to mistype.
//
// Two shapes (2026-07-27):
//   { flowId }                     — a raw InteractiveFlow id (legacy)
//   { journeyStepId, mode }        — a journey step in either mode:
//                                    "explain" (tour) or "doIt" (interactive)
export type HelpMode = "explain" | "doIt";

export interface LaunchRequest {
  /** Legacy: a registered InteractiveFlow id. */
  flowId?: string;
  /** Journey step id, e.g. "spark.contacts". */
  journeyStepId?: string;
  /** Which mode to open the journey step in. Default "explain". */
  mode?: HelpMode;
}

type Listener = (req: LaunchRequest) => void;

// STACK, not a single slot: the header can render more than one launcher
// instance (StrictMode remounts, mobile/desktop variants). Launch targets the
// most recently mounted LIVE subscriber; unmounts remove only themselves.
const listeners: Listener[] = [];

export function onWalkthroughLaunch(l: Listener): () => void {
  listeners.push(l);
  return () => {
    const i = listeners.indexOf(l);
    if (i >= 0) listeners.splice(i, 1);
  };
}

function dispatch(req: LaunchRequest): void {
  const top = listeners[listeners.length - 1];
  if (top) top(req);
}

/** Legacy entry point — launch a raw interactive flow by id. */
export function launchWalkthrough(flowId: string): void {
  dispatch({ flowId });
}

/** Launch a journey step in either mode. This is the one new code should use. */
export function launchJourneyStep(journeyStepId: string, mode: HelpMode = "explain"): void {
  dispatch({ journeyStepId, mode });
}

if (import.meta.env.DEV) {
  (window as any).__iadmWalkthroughBus = {
    count: () => listeners.length,
    launch: launchWalkthrough,
    launchStep: launchJourneyStep,
  };
}
