// cardMethods — one read of a customer's saved cards per customer open.
//
// GET /payments/contacts/:id/methods was fired 4 times for one open of the
// customer window (pane walk 1 Oct 2026, M12): the header's CardOnFileBadge
// and the Payment methods card each read it, and each effect runs twice in a
// development build. Both now read through fetchMethodsOnce: a read already
// in flight, or answered in the last few seconds, is shared rather than sent
// again. Adding or removing a card calls methodsChanged, which forgets the
// shared answer and tells every reader to read again, so the badge follows
// the card list.
//
// Pure apart from the module-level map; test/card-methods-once.test.mjs runs it.

type Getter = <T>(p: string) => Promise<T>;

/** How long one answer is shared between readers, in ms. */
export const METHODS_SHARE_MS = 10_000;

export const methodsPath = (contactId: string) => `/payments/contacts/${encodeURIComponent(contactId)}/methods`;

const shared = new Map<string, { at: number; promise: Promise<unknown> }>();
const listeners = new Map<string, Set<() => void>>();

/** The saved cards for one customer: one request shared by every reader that asks within METHODS_SHARE_MS. */
export function fetchMethodsOnce(get: Getter, contactId: string, now: number = Date.now()): Promise<unknown> {
  const hit = shared.get(contactId);
  if (hit && now - hit.at < METHODS_SHARE_MS) return hit.promise;
  const promise = get<unknown>(methodsPath(contactId));
  shared.set(contactId, { at: now, promise });
  // A failed read is not shared: the next reader asks again.
  promise.catch(() => { if (shared.get(contactId)?.promise === promise) shared.delete(contactId); });
  return promise;
}

/** A card was added or removed: forget the shared answer and tell every reader. */
export function methodsChanged(contactId: string): void {
  shared.delete(contactId);
  for (const fn of listeners.get(contactId) ?? []) fn();
}

/** Run `fn` whenever methodsChanged(contactId) is called. Returns the unsubscribe. */
export function onMethodsChanged(contactId: string, fn: () => void): () => void {
  let set = listeners.get(contactId);
  if (!set) { set = new Set(); listeners.set(contactId, set); }
  set.add(fn);
  return () => { set!.delete(fn); };
}

/** For tests. */
export function _resetMethodsCache(): void {
  shared.clear();
  listeners.clear();
}
