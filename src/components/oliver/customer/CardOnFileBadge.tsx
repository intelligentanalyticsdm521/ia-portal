/**
 * CardOnFileBadge — "Card on file •••• 1234" (on-site flow v1, Phase B,
 * 1 Oct 2026). On the customer modal header and the job modal, so the office
 * can see at a glance that the customer saved a card (on the crew's tablet,
 * from the one-time link, or in the office) before pressing Charge.
 *
 * Reads GET /payments/contacts/:id/methods (the same list PaymentMethodsCard
 * shows) once per contact, through lib/cardMethods fetchMethodsOnce — the
 * same request the Payment methods card shares — and reads again when a card
 * is added or removed there. Nothing while loading; nothing when there is no
 * card; a short sentence when the lookup failed, because a missing badge
 * would read as "no card" when we simply do not know.
 *
 * Colours come from the modal header's foreground tokens, so on the ink
 * header it is light, and anywhere else (the job panel) it is ink — the rule
 * test/job-status-colors.test.mjs enforces for everything in a dark header.
 */
import { useEffect, useRef, useState } from "react";
import { fetchMethodsOnce, onMethodsChanged } from "../../../lib/cardMethods";
import {
  CARD_CHECK_FAILED, cardOnFileLabel, cardOnFileTitle, pickCardOnFile, readMethods, type SavedCard,
} from "../../../lib/onsiteMoney";

export function CardOnFileBadge({
  contactId, api,
}: {
  contactId: string | null | undefined;
  api: { get: <T>(p: string) => Promise<T> };
}) {
  const [card, setCard] = useState<SavedCard | null>(null);
  const [failed, setFailed] = useState(false);
  const [round, setRound] = useState(0);
  // The api object may be rebuilt on every render of the window; the read is
  // keyed on the customer, not on it.
  const apiRef = useRef(api);
  apiRef.current = api;

  useEffect(() => {
    if (!contactId) return;
    return onMethodsChanged(contactId, () => setRound((n) => n + 1));
  }, [contactId]);

  useEffect(() => {
    setCard(null); setFailed(false);
    if (!contactId) return;
    let live = true;
    fetchMethodsOnce(apiRef.current.get, contactId)
      .then((r) => { if (live) setCard(pickCardOnFile(readMethods(r))); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [contactId, round]);

  if (failed) {
    return (
      <span data-testid="card-on-file-unknown" style={{ fontSize: 11, color: "var(--iadm-head-fg, #5A7A8A)", opacity: 0.8 }}>
        {CARD_CHECK_FAILED}
      </span>
    );
  }
  if (!card) return null;
  return (
    <span
      data-testid="card-on-file"
      title={cardOnFileTitle(card)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
        padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600,
        color: "var(--iadm-head-fg, #0B1C24)",
        background: "var(--iadm-head-btn-bg, #ECFDF5)",
        border: "1px solid var(--iadm-head-btn-border, #A7F3D0)",
      }}
    >
      <svg viewBox="0 0 20 14" width="16" height="11" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="0.75" y="0.75" width="18.5" height="12.5" rx="2" />
        <path d="M1 4.5h18" />
      </svg>
      {cardOnFileLabel(card)}
    </span>
  );
}
