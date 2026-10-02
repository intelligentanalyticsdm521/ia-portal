// StellaBankPage — "Bank and card accounts" (SETTINGS hub, key
// stella_settings_bank). LIVE Plaid connect surface (2026-08-13):
//
//   GET  /ledger/plaid/status  → { configured, itemCount }   (keyless, DB-only)
//   GET  /ledger/plaid/items   → connected items             (keyless, DB-only)
//   POST /ledger/plaid/link-token → { link_token }           (503 until keys)
//   POST /ledger/plaid/exchange   → persist item             (503 until keys)
//   POST /ledger/plaid/sync       → pull transactions        (503 until keys)
//
// Three honest states, gated on /status.configured — never a fake row:
//   (a) configured:false → explainer stays; the connect button is DISABLED,
//       with one plain line pointing at Import a bank statement (2 Oct 2026
//       review: the button and its note talked about the provider's keys and
//       a setup guide — words for us, not for an owner).
//   (b) configured:true, no items → live "Connect a bank or card" button that
//       requests a link token and opens Plaid Link (react-plaid-link);
//       onSuccess → POST /exchange → reload.
//   (c) items exist → list with institution, connected date, last synced, a
//       per-item "Sync now", and the "Personal card — business use"
//       designation chip (UI-only for now — see PERSONAL-USE TODO below).
//
// THE BANK SENDS YOU BACK (1 Oct 2026). Banks that sign you in on their own
// site (Chase, Capital One, Amex, Bank of America …) leave this page and come
// back to it with ?oauth_state_id=… on the address. Link can only finish if it
// is opened again with the SAME link token plus that address, so the token is
// kept in sessionStorage when Link first opens (lib/plaidReturn.ts). On a
// return: a fresh token → Link reopens at once with receivedRedirectUri and
// finishes exactly like an ordinary connect; no usable token → one plain line
// to start again. Either way the token is forgotten and oauth_state_id is
// taken off the address afterwards.
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CreditCard, Landmark, RefreshCw, Wallet } from "lucide-react";
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import { Button } from "../../components/oliver/ui";
import { useStellaApi } from "../../hooks/useStellaApi";
import { StellaShell, STELLA_INDIGO, STELLA_LAVENDER } from "./StellaShell";
import {
  clearToken, readReturn, rememberToken, stripReturnParam, type PlaidReturn, type TokenStorage,
} from "../../lib/plaidReturn";
import { PLAID_SENTENCES, plaidErrorSentence, plaidItemProblem } from "../../lib/plaidConnectError";

// { data } envelope is unwrapped by stellaApi.
interface PlaidStatus {
  configured: boolean;
  itemCount: number;
}

// GET /ledger/plaid/items row (access_token_kvref is never selected server-side).
interface PlaidItem {
  raw_plaid_item_id: string;
  item_id: string;
  institution_id?: string | null;
  institution_name?: string | null;
  status?: string | null;
  error_code?: string | null;
  last_synced_at?: string | null;
  created_at?: string | null;
  is_personal_card?: boolean | number | null;
}

function fmtDateTime(d?: string | null): string | null {
  if (!d) return null;
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function fmtDate(d?: string | null): string | null {
  if (!d) return null;
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.toLocaleDateString(undefined, { dateStyle: "medium" });
}

// A failed connect / finish / sync is ONE plain sentence from
// lib/plaidConnectError — never the provider's code, never the raw message
// (2 Oct 2026: the page printed the bare text INVALID_LINK_CUSTOMIZATION).

// The disabled button's tooltip when bank connections are not switched on.
const NOT_SWITCHED_ON_TITLE = "Bank connections aren't switched on here yet";

// sessionStorage can throw (blocked site data, some private windows); a page
// that cannot keep the token simply reads every return as expired.
function linkTokenStore(): TokenStorage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

// Take oauth_state_id off the address without a navigation (and without
// dropping React Router's history entry state), so a refresh does not try to
// finish the connection a second time.
function stripReturnFromAddress() {
  try {
    const next = stripReturnParam(window.location.href);
    if (next !== window.location.href) window.history.replaceState(window.history.state, "", next);
  } catch {
    /* address stays as it is — harmless */
  }
}

/**
 * Inline iOS-style switch (36×20 track, sliding knob) — no dependency.
 * role="switch" + aria-checked; native <button> gives Enter/Space keyboard
 * toggling for free. Indigo when on.
 */
function SwitchToggle({
  on,
  disabled,
  label,
  onToggle,
}: {
  on: boolean;
  disabled?: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8, padding: 0,
        background: "transparent", border: 0, cursor: disabled ? "wait" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 600, color: on ? STELLA_INDIGO : "#5A7A8A", whiteSpace: "nowrap" }}>
        {label}
      </span>
      <span
        aria-hidden
        style={{
          position: "relative", width: 36, height: 20, borderRadius: 99, flexShrink: 0,
          background: on ? STELLA_INDIGO : "#CBD5E1", transition: "background 120ms ease",
        }}
      >
        <span
          style={{
            position: "absolute", top: 2, left: on ? 18 : 2, width: 16, height: 16,
            borderRadius: 99, background: "#fff", boxShadow: "0 1px 2px rgba(11,28,36,0.3)",
            transition: "left 120ms ease",
          }}
        />
      </span>
    </button>
  );
}

/**
 * Mount-and-open wrapper around usePlaidLink. The hook needs the token at
 * mount, so the page fetches /link-token first and only then renders this —
 * it auto-opens as soon as the Link script is ready and renders nothing.
 */
function PlaidLinkLauncher({
  token,
  receivedRedirectUri,
  onSuccess,
  onExit,
}: {
  token: string;
  /** Only when the bank has just sent the person back: the address it sent them to. */
  receivedRedirectUri?: string;
  onSuccess: (publicToken: string | null, metadata: PlaidLinkOnSuccessMetadata) => void;
  onExit: (message?: string) => void;
}) {
  const { open, ready, error } = usePlaidLink({ token, receivedRedirectUri, onSuccess, onExit: () => onExit() });

  useEffect(() => {
    if (ready) open();
  }, [ready, open]);

  useEffect(() => {
    // The script's own error text is for the console, not the owner.
    if (error) {
      console.error("[stella.bank] Plaid Link failed to load", error);
      onExit(PLAID_SENTENCES.connect);
    }
  }, [error, onExit]);

  return null;
}

export function StellaBankPage() {
  const { get, post, patch, del, ready } = useStellaApi();
  const [status, setStatus] = useState<PlaidStatus | null>(null);
  const [items, setItems] = useState<PlaidItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  // Connect/sync failures render inline (the page itself loaded fine).
  const [actionError, setActionError] = useState<string | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [syncingItemId, setSyncingItemId] = useState<string | null>(null);
  // Personal-card designation persists (migration 156: raw_plaid_item.
  // is_personal_card) — the chip reflects the API row and toggles via
  // PATCH /ledger/plaid/items/:rawPlaidItemId. New outflows promoted from a
  // designated item default to needs-reimbursement. (The overnight verify
  // caught the earlier UI-only local state that never saved.)
  const [designating, setDesignating] = useState<string | null>(null);
  // Disconnect is asked twice, in the row itself: the first press shows what
  // will happen, the second does it (DELETE /ledger/plaid/items/:id — the
  // bank network drops the connection and the access key is deleted for good).
  const [askDisconnect, setAskDisconnect] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Read ONCE, on the first render, before anything strips the address.
  const [bankReturn] = useState<PlaidReturn>(() =>
    typeof window === "undefined" ? { kind: "none" } : readReturn(window.location.href, linkTokenStore(), Date.now())
  );
  // The address the bank sent the person back to — handed to Link while the
  // returned connection finishes, then dropped.
  const [receivedRedirectUri, setReceivedRedirectUri] = useState<string | null>(null);
  const [returnExpired, setReturnExpired] = useState(false);

  // Act on the return once: reopen Link with the kept token, or say it expired.
  useEffect(() => {
    if (bankReturn.kind === "resume") {
      setReceivedRedirectUri(bankReturn.receivedRedirectUri);
      setLinkToken(bankReturn.token);
      setConnecting(true);
    } else if (bankReturn.kind === "expired") {
      clearToken(linkTokenStore());
      stripReturnFromAddress();
      setReturnExpired(true);
    }
  }, [bankReturn]);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [s, it] = await Promise.all([
        get<PlaidStatus>("/ledger/plaid/status"),
        get<PlaidItem[]>("/ledger/plaid/items"),
      ]);
      setStatus({ configured: !!s?.configured, itemCount: Number(s?.itemCount || 0) });
      setItems(Array.isArray(it) ? it : []);
    } catch (e) {
      // The server's 500 text is a database message, not a sentence for the
      // owner — the page says one plain line (2 Oct 2026 review).
      console.error("[stella.bank] load failed", e);
      setError(new Error(PLAID_SENTENCES.loadFailed));
    } finally {
      setLoading(false);
    }
  }, [get]);

  useEffect(() => {
    if (ready) reload();
  }, [ready, reload]);

  // Persisted personal-card designation — PATCH then reload so the chip, the
  // Overview accounts card, and future promotions all reflect the same truth.
  const toggleDesignation = useCallback(
    async (it: PlaidItem) => {
      setDesignating(it.raw_plaid_item_id);
      setActionError(null);
      try {
        await patch(`/ledger/plaid/items/${it.raw_plaid_item_id}`, { is_personal_card: !it.is_personal_card });
        await reload();
      } catch (e) {
        // The server's 500 text is a database message, not a sentence for the owner.
        console.error("[stella.bank] personal-card switch failed", e);
        setActionError("That switch couldn't be saved — please try again.");
      } finally {
        setDesignating(null);
      }
    },
    [patch, reload]
  );

  // (b) live connect: link token → Plaid Link → exchange → reload.
  const startConnect = useCallback(async () => {
    setActionError(null);
    setReturnExpired(false);
    setReceivedRedirectUri(null);
    setConnecting(true);
    try {
      const r = await post<{ link_token: string; expiration?: string }>("/ledger/plaid/link-token");
      if (!r?.link_token) throw new Error("no link token in the answer");
      // Kept for the bank that sends the person back (lib/plaidReturn.ts).
      rememberToken(linkTokenStore(), r.link_token, Date.now());
      setLinkToken(r.link_token);
    } catch (e) {
      console.error("[stella.bank] link token failed", e);
      setConnecting(false);
      setActionError(plaidErrorSentence(e, "connect"));
    }
  }, [post]);

  const onLinkSuccess = useCallback(
    async (publicToken: string | null, metadata: PlaidLinkOnSuccessMetadata) => {
      setLinkToken(null);
      setReceivedRedirectUri(null);
      clearToken(linkTokenStore());
      stripReturnFromAddress();
      if (!publicToken) {
        setConnecting(false);
        setActionError(PLAID_SENTENCES.closedEarly);
        return;
      }
      try {
        await post("/ledger/plaid/exchange", {
          public_token: publicToken,
          institution_id: metadata.institution?.institution_id || null,
          institution_name: metadata.institution?.name || null,
        });
        await reload();
      } catch (e) {
        console.error("[stella.bank] exchange failed", e);
        setActionError(plaidErrorSentence(e, "finish"));
      } finally {
        setConnecting(false);
      }
    },
    [post, reload]
  );

  const onLinkExit = useCallback((message?: string) => {
    setLinkToken(null);
    setReceivedRedirectUri(null);
    clearToken(linkTokenStore());
    stripReturnFromAddress();
    setConnecting(false);
    if (message) setActionError(message);
  }, []);

  const syncNow = useCallback(
    async (itemId: string) => {
      setActionError(null);
      setSyncingItemId(itemId);
      try {
        await post("/ledger/plaid/sync", { item_id: itemId });
        await reload();
      } catch (e) {
        console.error("[stella.bank] sync failed", e);
        setActionError(plaidErrorSentence(e, "sync"));
      } finally {
        setSyncingItemId(null);
      }
    },
    [post, reload]
  );

  const disconnect = useCallback(
    async (it: PlaidItem) => {
      setActionError(null);
      setNotice(null);
      setDisconnecting(it.raw_plaid_item_id);
      try {
        await del(`/ledger/plaid/items/${it.raw_plaid_item_id}`);
        setAskDisconnect(null);
        setNotice(`${it.institution_name || "That account"} is disconnected. Nothing new will come in from it; your books keep everything already there.`);
        await reload();
      } catch (e) {
        console.error("[stella.bank] disconnect failed", e);
        setActionError(plaidErrorSentence(e, "disconnect"));
      } finally {
        setDisconnecting(null);
      }
    },
    [del, reload]
  );

  const configured = !!status?.configured;

  return (
    <StellaShell
      title="Bank and card accounts"
      subtitle="Link the accounts your business runs on — balances and transactions pull in automatically."
      error={error}
      loading={loading && !status}
      actions={
        status && !configured ? (
          // (a) keys not on this environment yet — honest disabled state.
          <div data-tour="stella-bank-connect" style={{ textAlign: "right" }}>
            <Button variant="primary" disabled title={NOT_SWITCHED_ON_TITLE}>
              Connect a bank or card
            </Button>
            <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 4, maxWidth: 260, lineHeight: 1.45 }}>
              {PLAID_SENTENCES.notSwitchedOn}
            </div>
          </div>
        ) : (
          <Button
            data-tour="stella-bank-connect"
            variant="primary"
            style={{ background: STELLA_INDIGO }}
            onClick={startConnect}
            disabled={!status || connecting}
            loading={connecting}
          >
            {connecting ? "Opening the bank window…" : "Connect a bank or card"}
          </Button>
        )
      }
    >
      {returnExpired && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "10px 14px", marginBottom: 12, fontSize: 12, background: "#FFFAEB", color: "#92400E", border: "1px solid #FEDF89", borderRadius: 8, lineHeight: 1.5 }}>
          <span>The bank sent you back, but the connection had expired. Start again.</span>
          <Button
            variant="primary"
            size="sm"
            style={configured ? { background: STELLA_INDIGO } : undefined}
            onClick={startConnect}
            disabled={!status || !configured || connecting}
            title={status && !configured ? NOT_SWITCHED_ON_TITLE : undefined}
          >
            Connect a bank or card
          </Button>
        </div>
      )}

      {actionError && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 14px", marginBottom: 12, fontSize: 12, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 8, lineHeight: 1.5 }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{actionError}</span>
        </div>
      )}

      {notice && (
        <div role="status" style={{ padding: "10px 14px", marginBottom: 12, fontSize: 12, background: "#ECFDF3", color: "#05603A", border: "1px solid #ABEFC6", borderRadius: 8, lineHeight: 1.5 }}>
          {notice}
        </div>
      )}

      {/* Connected accounts — real rows when items exist, honest empty state otherwise */}
      <div style={bankCard}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0B1C24" }}>Connected accounts</div>
          {items.length === 0 && (
            <span style={pill}>{configured ? "Ready to connect" : "Not available yet"}</span>
          )}
        </div>

        {items.length === 0 ? (
          <div style={{ padding: "20px 0 8px", textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 12 }}>
              <span style={bankIconDisc}><Landmark size={18} color={STELLA_INDIGO} /></span>
              <span style={bankIconDisc}><CreditCard size={18} color={STELLA_INDIGO} /></span>
            </div>
            <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.55, maxWidth: 380, margin: "0 auto" }}>
              {configured
                ? "Nothing linked yet. Use Connect a bank or card to link your first account — transactions pull in automatically and queue in the Ledger Inbox for a one-tap review."
                : "Connecting your bank and cards isn't available on this account yet. Once it is, balances and transactions come in by themselves and wait in your Inbox for a quick review."}
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 6 }}>
            {items.map((it, i) => {
              const designated = !!it.is_personal_card;
              const synced = fmtDateTime(it.last_synced_at);
              const syncing = syncingItemId === it.item_id;
              return (
                <div
                  key={it.raw_plaid_item_id || it.item_id}
                  style={{ padding: "12px 0", borderBottom: i === items.length - 1 ? "none" : "1px solid #F1F5F9" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <span style={bankIconDisc}><Landmark size={18} color={STELLA_INDIGO} /></span>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#0B1C24" }}>
                          {it.institution_name || "Bank connection"}
                        </span>
                        {plaidItemProblem(it.error_code, it.status) && (
                          <span style={{ ...pill, color: "#B91C1C", background: "#FEF2F2" }}>{plaidItemProblem(it.error_code, it.status)}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 2 }}>
                        {[
                          fmtDate(it.created_at) ? `Connected ${fmtDate(it.created_at)}` : null,
                          synced ? `Last synced ${synced}` : "Not synced yet — balances land after first sync",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                    <SwitchToggle
                      on={designated}
                      disabled={designating === it.raw_plaid_item_id}
                      label="Personal card — business use"
                      onToggle={() => toggleDesignation(it)}
                    />
                    <Button variant="secondary" size="sm" onClick={() => syncNow(it.item_id)} disabled={syncing} loading={syncing}>
                      {!syncing && <RefreshCw size={11} />} {syncing ? "Syncing…" : "Sync now"}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => { setNotice(null); setAskDisconnect(it.raw_plaid_item_id); }}
                      disabled={disconnecting === it.raw_plaid_item_id || askDisconnect === it.raw_plaid_item_id}
                      title="Stop pulling transactions from this account and remove its access key"
                    >
                      Disconnect
                    </Button>
                  </div>
                  {askDisconnect === it.raw_plaid_item_id && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 8, marginLeft: 52, padding: "10px 12px", fontSize: 12, color: "#7A2E0E", background: "#FFFAEB", border: "1px solid #FEDF89", borderRadius: 8, lineHeight: 1.5, maxWidth: 640 }}>
                      <span>
                        Disconnect {it.institution_name || "this account"}? New transactions stop coming in and we delete
                        our access to it. Everything already in your books stays.
                      </span>
                      <span style={{ display: "inline-flex", gap: 8 }}>
                        <Button
                          variant="primary"
                          size="sm"
                          style={{ background: "#B42318" }}
                          onClick={() => disconnect(it)}
                          disabled={disconnecting === it.raw_plaid_item_id}
                          loading={disconnecting === it.raw_plaid_item_id}
                        >
                          {disconnecting === it.raw_plaid_item_id ? "Disconnecting…" : "Yes, disconnect"}
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => setAskDisconnect(null)} disabled={disconnecting === it.raw_plaid_item_id}>
                          Keep it connected
                        </Button>
                      </span>
                    </div>
                  )}
                  {designated && (
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 8, marginLeft: 52, padding: "8px 12px", fontSize: 11, color: "#3730A3", background: "#EEF0FB", border: `1px solid ${STELLA_INDIGO}33`, borderRadius: 8, lineHeight: 1.5, maxWidth: 640 }}>
                      <Wallet size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                      <span>
                        This is a personal card you also use for business. New charges arrive flagged
                        "needs reimbursement" so you can pay yourself back — and anything that's purely
                        personal can be excluded from your books entirely.
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
            <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 8, lineHeight: 1.5 }}>
              The switch saves instantly. Turn it on for the scenario where you put business expenses on a
              personal card and reimburse yourself later — new charges from that card default to
              "needs reimbursement" and roll into the Owed to you total. Already-imported transactions
              are never re-flagged automatically.
            </div>
          </div>
        )}
      </div>

      {/* Account types explainer */}
      <div style={{ margin: "16px 0 8px", fontSize: 12, fontWeight: 700, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.4 }}>
        Account types
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
        <div style={bankCard}>
          <span style={bankIconDisc}><Landmark size={18} color={STELLA_INDIGO} /></span>
          <div style={bankTypeTitle}>Checking &amp; savings</div>
          <div style={bankTypeCopy}>
            Your operating accounts. Deposits post as income candidates, withdrawals as expense candidates — everything
            reviewable in the Inbox before it touches a report.
          </div>
        </div>
        <div style={bankCard}>
          <span style={bankIconDisc}><CreditCard size={18} color={STELLA_INDIGO} /></span>
          <div style={bankTypeTitle}>Business credit card</div>
          <div style={bankTypeCopy}>
            Card charges flow straight into the ledger as business expenses, matched to receipts once OCR lands.
          </div>
        </div>
        <div data-tour="stella-bank-personal" style={{ ...bankCard, border: `1px solid ${STELLA_INDIGO}55` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={bankIconDisc}><Wallet size={18} color={STELLA_INDIGO} /></span>
            <span style={pill}>Personal card — business use</span>
          </div>
          <div style={bankTypeTitle}>Personal card you use for the business</div>
          <div style={bankTypeCopy}>
            For when you put business expenses on your personal card and pay yourself back later. Flip the switch on a
            connected card and its new charges arrive flagged "needs reimbursement" — they roll into the Owed to you
            total on the Overview until you reimburse yourself and mark them settled. Charges that are purely personal
            can be excluded from your books entirely.
          </div>
        </div>
      </div>

      {/* Plaid Link mounts only while a fetched link token is in hand */}
      {linkToken && ready && (
        <PlaidLinkLauncher
          token={linkToken}
          receivedRedirectUri={receivedRedirectUri || undefined}
          onSuccess={onLinkSuccess}
          onExit={onLinkExit}
        />
      )}
    </StellaShell>
  );
}

const bankCard: React.CSSProperties = { background: "#fff", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 12, padding: "16px 18px" };
const bankIconDisc: React.CSSProperties = { width: 40, height: 40, borderRadius: 99, background: STELLA_LAVENDER, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };
const bankTypeTitle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: "#0B1C24", marginTop: 10 };
const bankTypeCopy: React.CSSProperties = { fontSize: 11.5, color: "#5A7A8A", lineHeight: 1.55, marginTop: 4 };
const pill: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: STELLA_INDIGO, background: `${STELLA_INDIGO}14`, padding: "2px 8px", borderRadius: 99, whiteSpace: "nowrap" };
