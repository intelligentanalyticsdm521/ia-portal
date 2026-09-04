// test/push-client.test.mjs — Foundation A2, browser half.
//
// src/lib/push.ts is a pure module (no React, no MSAL, no import.meta.env), so
// it belongs under this runner. Everything it touches — window, navigator,
// Notification, PushManager — is stubbed here, which is the only way to
// rehearse the cases that matter and are impossible to click reliably:
// permission denied, iPhone-without-Home-Screen, an unsupported browser.
//
// The behaviour being pinned, in one line: the switch must never end up ON
// because of something this code remembered. That was the A2 defect
// (localStorage), and the replacement's job is to make the browser and the
// server both say yes.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  checkSupport,
  isSupported,
  isIosBrowserWithoutHomeScreen,
  permissionState,
  toPayload,
  subscribe,
  unsubscribe,
  PushError,
} from "../src/lib/push.ts";

/* ------------------------------------------------------------------ */
/*  A stub browser                                                     */
/* ------------------------------------------------------------------ */

const SAVED = {};
const GLOBAL_KEYS = ["window", "navigator", "Notification", "PushManager"];

function setBrowser({
  secure = true,
  serviceWorker = true,
  pushManager = true,
  notifications = true,
  permission = "default",
  requestPermissionResult = "granted",
  userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0 Safari/537.36",
  maxTouchPoints = 0,
  standalone = false,
  displayModeStandalone = false,
  existingSubscription = null,
  registration = undefined,
} = {}) {
  const calls = { requestPermission: 0, subscribe: 0, register: 0, unsubscribe: 0 };

  const subscription =
    existingSubscription === null
      ? null
      : existingSubscription;

  const reg = registration || {
    pushManager: {
      getSubscription: async () => subscription,
      subscribe: async (opts) => {
        calls.subscribe += 1;
        calls.subscribeOptions = opts;
        return makeSubscription("https://fcm.googleapis.com/fcm/send/NEW");
      },
    },
  };

  const win = {
    isSecureContext: secure,
    matchMedia: () => ({ matches: displayModeStandalone }),
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
  };
  if (pushManager) win.PushManager = function PushManagerStub() {};

  const nav = { userAgent, maxTouchPoints, standalone };
  if (serviceWorker) {
    nav.serviceWorker = {
      ready: Promise.resolve(reg),
      getRegistration: async () => reg,
      register: async () => {
        calls.register += 1;
        return reg;
      },
    };
  }

  globalThis.window = win;
  globalThis.navigator = nav;
  if (notifications) {
    globalThis.Notification = {
      permission,
      requestPermission: async () => {
        calls.requestPermission += 1;
        return requestPermissionResult;
      },
    };
    win.Notification = globalThis.Notification;
  } else {
    delete globalThis.Notification;
  }
  if (pushManager) globalThis.PushManager = win.PushManager;
  else delete globalThis.PushManager;

  return { calls, reg };
}

function makeSubscription(endpoint, keys = { p256dh: "PUB", auth: "AUTH" }) {
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys }),
    getKey: () => null,
    unsubscribe: async () => true,
  };
}

function saveGlobals() {
  for (const k of GLOBAL_KEYS) SAVED[k] = globalThis[k];
}
function restoreGlobals() {
  for (const k of GLOBAL_KEYS) {
    if (SAVED[k] === undefined) delete globalThis[k];
    else globalThis[k] = SAVED[k];
  }
}

saveGlobals();

/* ------------------------------------------------------------------ */
/*  Support detection                                                  */
/* ------------------------------------------------------------------ */

test("a modern browser on https is supported", () => {
  setBrowser();
  assert.deepEqual(checkSupport(), { supported: true });
  assert.equal(isSupported(), true);
  restoreGlobals();
});

test("each unsupported reason is reported separately, not as one shrug", () => {
  setBrowser({ secure: false });
  assert.equal(checkSupport().reason, "insecure");

  setBrowser({ serviceWorker: false });
  assert.equal(checkSupport().reason, "no-service-worker");

  setBrowser({ pushManager: false });
  assert.equal(checkSupport().reason, "no-push");

  setBrowser({ notifications: false });
  assert.equal(checkSupport().reason, "no-notifications");
  restoreGlobals();
});

/* ------------------------------------------------------------------ */
/*  iPhone                                                             */
/* ------------------------------------------------------------------ */

test("iPhone in a Safari tab needs Add to Home Screen first", () => {
  setBrowser({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1",
    pushManager: false, // exactly what iOS Safari looks like outside a PWA
  });
  assert.equal(isIosBrowserWithoutHomeScreen(), true);
  restoreGlobals();
});

test("the same iPhone, once installed to the Home Screen, does NOT show the hint", () => {
  setBrowser({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1",
    standalone: true,
  });
  assert.equal(isIosBrowserWithoutHomeScreen(), false);

  setBrowser({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1",
    displayModeStandalone: true,
  });
  assert.equal(isIosBrowserWithoutHomeScreen(), false);
  restoreGlobals();
});

test("an iPad reporting itself as a Mac is still an iPad", () => {
  setBrowser({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
    maxTouchPoints: 5,
  });
  assert.equal(isIosBrowserWithoutHomeScreen(), true);
  restoreGlobals();
});

test("a desktop never sees the iPhone hint", () => {
  setBrowser();
  assert.equal(isIosBrowserWithoutHomeScreen(), false);
  restoreGlobals();
});

/* ------------------------------------------------------------------ */
/*  Payload shape                                                      */
/* ------------------------------------------------------------------ */

test("toPayload produces exactly what POST /me/push/subscribe expects", () => {
  setBrowser();
  const payload = toPayload(makeSubscription("https://fcm.googleapis.com/fcm/send/E1"));
  assert.deepEqual(payload, {
    endpoint: "https://fcm.googleapis.com/fcm/send/E1",
    keys: { p256dh: "PUB", auth: "AUTH" },
  });
  restoreGlobals();
});

test("toPayload falls back to getKey() when toJSON carries no keys", () => {
  setBrowser();
  const sub = {
    endpoint: "https://example.push/e",
    toJSON: () => ({ endpoint: "https://example.push/e" }),
    getKey: (name) => new Uint8Array(name === "p256dh" ? [1, 2, 3] : [4, 5]).buffer,
  };
  const payload = toPayload(sub);
  assert.equal(payload.keys.p256dh, "AQID"); // base64url of 01 02 03
  assert.equal(payload.keys.auth, "BAU");
  restoreGlobals();
});

/* ------------------------------------------------------------------ */
/*  subscribe / unsubscribe                                            */
/* ------------------------------------------------------------------ */

test("subscribe asks permission, registers the worker, and returns the payload", async () => {
  const { calls } = setBrowser();
  const payload = await subscribe("BKxQ-vapid-public-key_test");
  assert.equal(calls.requestPermission, 1);
  assert.equal(calls.subscribe, 1);
  assert.equal(calls.subscribeOptions.userVisibleOnly, true, "Chrome refuses a silent subscription");
  assert.ok(calls.subscribeOptions.applicationServerKey instanceof Uint8Array);
  assert.equal(payload.endpoint, "https://fcm.googleapis.com/fcm/send/NEW");
  restoreGlobals();
});

test("MUTATION: a DENIED prompt throws and never subscribes — the switch must go back to off", async () => {
  // If subscribe() ever "helpfully" continued past a denied prompt, calls.subscribe
  // would be 1 and this fails. That is the localStorage bug's exact shape:
  // reporting success for something that did not happen.
  const { calls } = setBrowser({ requestPermissionResult: "denied" });
  await assert.rejects(
    () => subscribe("BKxQ-vapid-public-key_test"),
    (err) => err instanceof PushError && err.kind === "permission-denied",
  );
  assert.equal(calls.subscribe, 0, "nothing may be subscribed after a denial");
  restoreGlobals();
});

test("subscribe refuses when the environment has no VAPID key rather than half-subscribing", async () => {
  const { calls } = setBrowser();
  await assert.rejects(
    () => subscribe(""),
    (err) => err instanceof PushError && err.kind === "unsupported",
  );
  assert.equal(calls.requestPermission, 0, "do not prompt a person for something we cannot deliver");
  restoreGlobals();
});

test("subscribe refuses outright on a browser that cannot do push", async () => {
  setBrowser({ pushManager: false });
  await assert.rejects(
    () => subscribe("BKxQ"),
    (err) => err instanceof PushError && err.kind === "unsupported",
  );
  restoreGlobals();
});

test("subscribe reuses an existing subscription instead of minting a second one", async () => {
  const { calls } = setBrowser({ existingSubscription: makeSubscription("https://existing/endpoint") });
  const payload = await subscribe("BKxQ");
  assert.equal(payload.endpoint, "https://existing/endpoint");
  assert.equal(calls.subscribe, 0);
  restoreGlobals();
});

test("unsubscribe returns the endpoint so the server row can be deleted", async () => {
  let unsubscribed = false;
  const sub = makeSubscription("https://fcm.googleapis.com/fcm/send/BYE");
  sub.unsubscribe = async () => {
    unsubscribed = true;
    return true;
  };
  setBrowser({ existingSubscription: sub });
  const endpoint = await unsubscribe();
  assert.equal(endpoint, "https://fcm.googleapis.com/fcm/send/BYE");
  assert.equal(unsubscribed, true);
  restoreGlobals();
});

test("unsubscribe still reports the endpoint when the browser refuses to drop it", async () => {
  // The person asked for alerts to stop. Deleting the server row does that even
  // if the browser keeps a dead subscription around, so the endpoint must still
  // come back rather than the whole call throwing.
  const sub = makeSubscription("https://fcm.googleapis.com/fcm/send/STUBBORN");
  sub.unsubscribe = async () => {
    throw new Error("no");
  };
  setBrowser({ existingSubscription: sub });
  assert.equal(await unsubscribe(), "https://fcm.googleapis.com/fcm/send/STUBBORN");
  restoreGlobals();
});

test("unsubscribe on a device that never subscribed is a no-op, not an error", async () => {
  setBrowser();
  assert.equal(await unsubscribe(), null);
  restoreGlobals();
});

test("permissionState reports 'unsupported' rather than guessing", () => {
  setBrowser({ notifications: false });
  assert.equal(permissionState(), "unsupported");
  setBrowser({ permission: "denied" });
  assert.equal(permissionState(), "denied");
  restoreGlobals();
});
