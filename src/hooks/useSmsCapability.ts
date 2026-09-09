/**
 * useSmsCapability — "can a text actually leave, and if not, what do we tell the
 * owner?", from the gate that stops the send.
 *
 * WHAT THIS REPLACES
 * ------------------
 * Three SPARK pages (SMS Inbox, SMS Templates, SMS Campaigns) carried a
 * hand-written amber "Coming Soon" banner each. Their wording:
 *
 *   "outbound replies via ACS may go to a stub until v1.1"
 *   "sending may go to a stub until v1.1"
 *   "ACS SMS dispatch is still being wired up. Sends may go to a stub until v1.1"
 *
 * Three different sentences, all naming a version instead of a reason, all still
 * on the screen months after v1.1 was a plan, and none of them true: there is no
 * stub. Texting is switched OFF at one master switch, waiting on the mobile
 * carriers' verification of the toll-free number, and the honest sentence names
 * exactly that.
 *
 * The banners are deleted. This asks GET /api/v1/sms/capability instead, so the
 * page and the sender cannot disagree — and when texting is switched on, the
 * notice disappears from all three pages without anybody editing three files.
 *
 * FAIL DIRECTION: an unresolved answer shows NOTHING. A page that cannot reach
 * the API must not invent a reason texting is off, and the send path refuses on
 * its own regardless.
 */
import { useEffect, useState } from 'react';
import { useSparkApi } from './useSparkApi';

export type SmsCapability = {
  /** null = not resolved yet. Render no notice. */
  enabled: boolean | null;
  /** The sentence to show when enabled === false. */
  reason: string | null;
  /** carrier_verification_pending | no_sender_number | null */
  reasonCode: string | null;
};

const UNRESOLVED: SmsCapability = { enabled: null, reason: null, reasonCode: null };

type Payload = { data?: { enabled?: boolean; reason?: string | null; reason_code?: string | null } };

// One answer for the whole platform, so it is cached for the tab rather than
// re-fetched by each of the pages that mention texting.
let cached: SmsCapability | null = null;
export function _clearSmsCapabilityCache() { cached = null; }

export function useSmsCapability(): SmsCapability {
  const { get, ready } = useSparkApi();
  const [state, setState] = useState<SmsCapability>(() => cached || UNRESOLVED);

  useEffect(() => {
    if (!ready || cached) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await get<Payload>('/api/v1/sms/capability');
        const d = r?.data || {};
        const resolved: SmsCapability = {
          enabled: !!d.enabled,
          reason: d.reason ?? null,
          reasonCode: d.reason_code ?? null,
        };
        cached = resolved;
        if (!cancelled) setState(resolved);
      } catch (err) {
        // Not swallowed into a made-up reason.
        console.error('[useSmsCapability] could not read the texting switch — no notice shown.', err);
      }
    })();
    return () => { cancelled = true; };
  }, [get, ready]);

  return state;
}
