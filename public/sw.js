/* sw.js — the Portal's service worker. Foundation A2 (web push).
 *
 * DELIBERATELY DOES NOT CACHE ANYTHING.
 *
 * A service worker that caches is a service worker that can serve a stale
 * build, and the Portal already has a stale-chunk problem it handles in
 * main.tsx (the `vite:preloadError` reload). Adding an offline cache here
 * would fight that. The full PWA — offline shell, install prompt, icons — is
 * the ops PWA pack's job. This file exists for one reason: a browser can only
 * receive a push through a service worker.
 *
 * It handles exactly three events:
 *   install / activate — take over immediately, so a returning user is not
 *                        stuck on a worker from three deploys ago.
 *   push              — show the notification.
 *   notificationclick — focus an already-open Portal tab if there is one,
 *                        otherwise open a new one, at the url the payload
 *                        carried.
 */

self.addEventListener('install', () => {
  // No waiting: there is no cache to migrate, so an old worker has no reason
  // to keep running.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/** Same shape lib/webPush.js sends: { title, body, url, tag }. */
function readPayload(event) {
  const fallback = { title: 'Intelligent Analytics', body: '', url: '/app' };
  if (!event.data) return fallback;
  try {
    const data = event.data.json();
    return {
      title: typeof data.title === 'string' && data.title ? data.title : fallback.title,
      body: typeof data.body === 'string' ? data.body : '',
      url: typeof data.url === 'string' && data.url ? data.url : fallback.url,
      tag: typeof data.tag === 'string' && data.tag ? data.tag : undefined,
    };
  } catch (err) {
    // A payload we cannot parse still gets shown — the alert matters more than
    // its formatting, and a silent drop here is invisible to everyone.
    return { ...fallback, body: event.data.text ? event.data.text() : '' };
  }
}

self.addEventListener('push', (event) => {
  const payload = readPayload(event);
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      // The favicon is the only square-ish asset guaranteed to be there; the
      // ops PWA pack replaces these with real icons.
      icon: '/icon-ia.svg',
      badge: '/icon-ia.svg',
      // A tag collapses repeats of the same kind of alert instead of stacking
      // five "your search is done" notifications.
      tag: payload.tag,
      renotify: Boolean(payload.tag),
      data: { url: payload.url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/app';

  event.waitUntil(
    (async () => {
      const url = new URL(target, self.location.origin).href;
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

      // Prefer a Portal tab that is already open — opening a second copy of an
      // app the owner already has running is the most annoying thing a
      // notification can do.
      for (const client of all) {
        if (new URL(client.url).origin === self.location.origin) {
          if ('navigate' in client) {
            try {
              await client.navigate(url);
            } catch (err) {
              /* a cross-document navigate can be refused; focusing is enough */
            }
          }
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })()
  );
});
