// src/lib/authRetry.ts
//
// Bootstrap retry policy for the Portal login gate (AppGate).
//
// WHY: platform-api warms itself on boot now, but there's still a brief window
// right after a deploy/restart where the first requests can be slow or 5xx while
// the instance finishes warming. Before, AppGate did ONE retry (network-shape
// errors only) and then showed a hard error — so a user who loaded the Portal in
// that window got dumped on "Clear State & Retry", and the aborted flow often
// left MSAL interaction state stuck. This rides the window out silently instead.
//
// It retries ONLY transient failures. A 401/403/400 is a real auth/authz/bad-
// request outcome — retrying only delays the honest error, so we surface it fast.

import { PlatformApiError } from './platformApi';

/**
 * True for errors a bootstrap retry can plausibly ride out — a warming/restarting
 * API, a transient network blip, or our own client-side timeout. False for a
 * genuine rejection (401/403/400/404), which retrying cannot fix.
 */
export function isTransientAuthError(err: unknown): boolean {
  // Network-shape: fetch failed, connection reset, DNS blip.
  if (err instanceof TypeError && /fetch|network|load failed/i.test(err.message)) return true;
  // Aborted request, or our own withAuthTimeout wrapper firing.
  if (err instanceof Error && (err.name === 'AbortError' || (err as { isAuthTimeout?: boolean }).isAuthTimeout)) {
    return true;
  }
  // platform-api: status 0 = client-side timeout (see platformApi.ts); 5xx =
  // server restarting/warming. Everything else (401/403/400/404/…) is a real,
  // non-transient outcome — do NOT loop on it.
  if (err instanceof PlatformApiError) {
    if (err.status === 0) return true;
    return err.status >= 500 && err.status <= 599;
  }
  return false;
}

export interface RetryOpts {
  /** Total attempts including the first. Default 4. */
  attempts?: number;
  /** First backoff in ms; doubles each retry. Default 500 (→ ~500/1000/2000 + jitter). */
  baseDelayMs?: number;
  label?: string;
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
}

/**
 * Run `fn`, retrying ONLY transient failures with exponential backoff + jitter.
 * Re-throws immediately on a non-transient error, and re-throws the last error
 * once attempts are exhausted (so the caller's error UI still fires for a genuine
 * outage — this only removes the false failures during the warm-up window).
 */
export async function retryWithBackoff<T>(fn: () => Promise<T>, opts: RetryOpts = {}): Promise<T> {
  const attempts = Math.max(1, opts.attempts ?? 4);
  const base = opts.baseDelayMs ?? 500;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isLast = i === attempts - 1;
      if (isLast || !isTransientAuthError(err)) throw err;
      const delayMs = Math.round(base * 2 ** i + Math.random() * 250);
      opts.onRetry?.({ attempt: i + 1, delayMs, error: err });
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  // Unreachable (the loop either returns or throws), but satisfies the type checker.
  throw lastErr;
}
