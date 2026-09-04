/**
 * push.ts — browser side of Foundation A2 (web push).
 *
 * WHAT WAS WRONG
 * --------------
 * "Enable push notifications" wrote localStorage['iadm.personal.pushNotifications']
 * and nothing else — no service worker, no permission prompt, no subscription,
 * no sender. The switch reported success and the owner got no alerts. That
 * toggle has since been deleted; this module is what the real one is built on.
 *
 * THE MODEL, BECAUSE IT SURPRISES PEOPLE
 * --------------------------------------
 * A push subscription belongs to a BROWSER, not to a person. Signing in on a
 * second laptop does not carry it across; clearing site data destroys it.
 * So the honest question the settings row asks is "alerts on THIS device",
 * and the source of truth is a two-part answer:
 *
 *   the browser  — does `pushManager.getSubscription()` return something?
 *   the server   — is that endpoint in core.push_subscription?
 *
 * Both have to be true. Only checking the browser is how you get a toggle that
 * says ON while the server has no idea where to send anything (which is the
 * localStorage bug wearing a better costume). Only checking the server is how
 * you get a toggle that says ON after the user revoked permission in Chrome.
 */

/** base64url (what VAPID public keys are) -> the Uint8Array subscribe() wants. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/** ArrayBuffer key material -> the base64url string the API stores. */
function arrayBufferToBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export type PushSupport =
  | { supported: true }
  | { supported: false; reason: 'insecure' | 'no-service-worker' | 'no-push' | 'no-notifications' };

/**
 * Can this browser do web push at all? Four independent reasons it cannot, kept
 * separate so the settings row can say WHICH one rather than "unsupported".
 */
export function checkSupport(): PushSupport {
  // localhost counts as a secure context, which is why dev works over http.
  if (!window.isSecureContext) return { supported: false, reason: 'insecure' };
  if (!('serviceWorker' in navigator)) return { supported: false, reason: 'no-service-worker' };
  if (!('PushManager' in window)) return { supported: false, reason: 'no-push' };
  if (!('Notification' in window)) return { supported: false, reason: 'no-notifications' };
  return { supported: true };
}

export function isSupported(): boolean {
  return checkSupport().supported;
}

/**
 * iOS/iPadOS 16.4+ can do web push, but ONLY from a site the user has added to
 * the Home Screen — in a normal Safari tab `PushManager` is not even defined.
 * Detecting "iPhone, and not already installed" lets the settings row explain
 * that instead of showing an inert switch.
 */
export function isIosBrowserWithoutHomeScreen(): boolean {
  const ua = navigator.userAgent || '';
  const iOS = /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports itself as a Mac; the touch points give it away.
    (/Macintosh/.test(ua) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1);
  if (!iOS) return false;
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // Safari's own non-standard flag, still the only reliable one on iOS.
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  return !standalone;
}

export type PermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

export function permissionState(): PermissionState {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission as PermissionState;
}

/** Register (or reuse) the worker that receives pushes. */
export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing) return existing;
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

/** The subscription this browser currently holds, if any. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!isSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

export interface SubscriptionPayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** The wire shape platform-api's POST /me/push/subscribe expects. */
export function toPayload(sub: PushSubscription): SubscriptionPayload {
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  return {
    endpoint: sub.endpoint,
    keys: {
      // toJSON() carries the keys in every current browser; getKey() is the
      // spec-guaranteed path and the fallback for the ones that don't.
      p256dh: json.keys?.p256dh || arrayBufferToBase64Url(sub.getKey('p256dh')),
      auth: json.keys?.auth || arrayBufferToBase64Url(sub.getKey('auth')),
    },
  };
}

export class PushError extends Error {
  constructor(message: string, public readonly kind: 'permission-denied' | 'unsupported' | 'failed') {
    super(message);
    this.name = 'PushError';
  }
}

/**
 * Ask permission (if we haven't already), register the worker, and subscribe.
 *
 * Returns the payload to POST. It does NOT talk to the API — the caller owns
 * that, so a failed POST can immediately un-subscribe the browser again rather
 * than leaving a subscription the server has never heard of.
 */
export async function subscribe(vapidPublicKey: string): Promise<SubscriptionPayload> {
  const support = checkSupport();
  if (!support.supported) throw new PushError('This browser cannot receive push notifications.', 'unsupported');
  if (!vapidPublicKey) throw new PushError('Push is not configured on this environment.', 'unsupported');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    // Denied is denied — the toggle must go back to off. A switch that stays on
    // after the browser said no is the same lie as the localStorage one.
    throw new PushError('Notifications are blocked for this site.', 'permission-denied');
  }

  const reg = await ensureServiceWorker();
  // Wait for the worker to be usable; subscribing against an installing worker
  // throws in Firefox.
  await navigator.serviceWorker.ready;

  const existing = await reg.pushManager.getSubscription();
  if (existing) return toPayload(existing);

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true, // required by Chrome; we only ever send visible alerts
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as unknown as BufferSource,
  });
  return toPayload(sub);
}

/**
 * Drop this browser's subscription. Returns the endpoint that was removed so
 * the caller can tell the server which row to delete — after unsubscribe()
 * resolves, the endpoint is no longer reachable from the registration.
 */
export async function unsubscribe(): Promise<string | null> {
  const sub = await currentSubscription();
  if (!sub) return null;
  const { endpoint } = sub;
  try {
    await sub.unsubscribe();
  } catch {
    // Even if the browser refuses to drop it, deleting the server row stops the
    // sends — which is what the person actually asked for.
  }
  return endpoint;
}
