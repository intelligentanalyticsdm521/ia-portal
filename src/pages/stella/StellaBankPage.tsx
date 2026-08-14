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
//   (a) configured:false → explainer stays; the connect button is a DISABLED
//       "Plaid keys pending" with a subtitle pointing at the readiness pack.
//   (b) configured:true, no items → live "Connect a bank or card" button that
//       requests a link token and opens Plaid Link (react-plaid-link);
//       onSuccess → POST /exchange → reload.
//   (c) items exist → list with institution, connected date, last synced, a
//       per-item "Sync now", and the "Personal card — business use"
//       designation chip (UI-only for now — see PERSONAL-USE TODO below).
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CreditCard, Landmark, RefreshCw, Wallet } from "lucide-react";
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import { Button } from "../../components/oliver/ui";
import { useStellaApi } from "../../hooks/useStellaApi";
import { StellaShell, STELLA_INDIGO, STELLA_LAVENDER } from "./StellaShell";

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

// Turn a stellaApi throw into copy a business owner can read.
function friendlyPlaidError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("plaid_not_configured")) {
    return "Plaid isn't configured on this environment yet — the connect flow unlocks once sandbox keys land.";
  }
  return msg;
}

/**
 * Mount-and-open wrapper around usePlaidLink. The hook needs the token at
 * mount, so the page fetches /link-token first and only then renders this —
 * it auto-opens as soon as the Link script is ready and renders nothing.
 */
function PlaidLinkLauncher({
  token,
  onSuccess,
  onExit,
}: {
  token: string;
  onSuccess: (publicToken: string | null, metadata: PlaidLinkOnSuccessMetadata) => void;
  onExit: (message?: string) => void;
}) {
  const { open, ready, error } = usePlaidLink({ token, onSuccess, onExit: () => onExit() });

  useEffect(() => {
    if (ready) open();
  }, [ready, open]);

  useEffect(() => {
    if (error) onExit(`Plaid Link failed to load: ${error.message}`);
  }, [error, onExit]);

  return null;
}

export function StellaBankPage() {
  const { get, post, ready } = useStellaApi();
  const [status, setStatus] = useState<PlaidStatus | null>(null);
  const [items, setItems] = useState<PlaidItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  // Connect/sync failures render inline (the page itself loaded fine).
  const [actionError, setActionError] = useState<string | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [syncingItemId, setSyncingItemId] = useState<string | null>(null);
  // PERSONAL-USE TODO: stella.raw_plaid_item has no designation column yet, so
  // the "Personal card — business use" chip is UI-only local state (item_id →
  // designated). Persisting it needs a backend field — likely account-level
  // once /sync lands raw_plaid_account rows — then this becomes a PATCH.
  // The hint under the list says so honestly; nothing pretends to save.
  const [personalUse, setPersonalUse] = useState<Record<string, boolean>>({});

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
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [get]);

  useEffect(() => {
    if (ready) reload();
  }, [ready, reload]);

  // (b) live connect: link token → Plaid Link → exchange → reload.
  const startConnect = useCallback(async () => {
    setActionError(null);
    setConnecting(true);
    try {
      const r = await post<{ link_token: string; expiration?: string }>("/ledger/plaid/link-token");
      if (!r?.link_token) throw new Error("Plaid didn't return a link token.");
      setLinkToken(r.link_token);
    } catch (e) {
      setConnecting(false);
      setActionError(friendlyPlaidError(e));
    }
  }, [post]);

  const onLinkSuccess = useCallback(
    async (publicToken: string | null, metadata: PlaidLinkOnSuccessMetadata) => {
      setLinkToken(null);
      if (!publicToken) {
        setConnecting(false);
        setActionError("Plaid Link closed without a public token — nothing was connected.");
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
        setActionError(friendlyPlaidError(e));
      } finally {
        setConnecting(false);
      }
    },
    [post, reload]
  );

  const onLinkExit = useCallback((message?: string) => {
    setLinkToken(null);
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
        setActionError(friendlyPlaidError(e));
      } finally {
        setSyncingItemId(null);
      }
    },
    [post, reload]
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
          <div style={{ textAlign: "right" }}>
            <Button variant="primary" disabled title="Plaid keys are not configured on this environment yet">
              Plaid keys pending
            </Button>
            <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 4, maxWidth: 250, lineHeight: 1.45 }}>
              Sandbox keys unlock this — setup guide in the Plaid readiness pack
            </div>
          </div>
        ) : (
          <Button
            variant="primary"
            style={{ background: STELLA_INDIGO }}
            onClick={startConnect}
            disabled={!status || connecting}
            loading={connecting}
          >
            {connecting ? "Opening Plaid Link…" : "Connect a bank or card"}
          </Button>
        )
      }
    >
      {actionError && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 14px", marginBottom: 12, fontSize: 12, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 8, lineHeight: 1.5 }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{actionError}</span>
        </div>
      )}

      {/* Connected accounts — real rows when items exist, honest empty state otherwise */}
      <div style={bankCard}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0B1C24" }}>Connected accounts</div>
          {items.length === 0 && (
            <span style={pill}>{configured ? "Ready to connect" : "Lands with bank feeds"}</span>
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
                : "Connect your bank and cards to pull balances and transactions automatically. New activity lands in the Ledger Inbox for a one-tap review on your tier's cadence."}
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 6 }}>
            {items.map((it, i) => {
              const designated = !!personalUse[it.item_id];
              const synced = fmtDateTime(it.last_synced_at);
              const syncing = syncingItemId === it.item_id;
              return (
                <div
                  key={it.raw_plaid_item_id || it.item_id}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: i === items.length - 1 ? "none" : "1px solid #F1F5F9", flexWrap: "wrap" }}
                >
                  <span style={bankIconDisc}><Landmark size={18} color={STELLA_INDIGO} /></span>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#0B1C24" }}>
                        {it.institution_name || "Bank connection"}
                      </span>
                      {it.error_code && (
                        <span style={{ ...pill, color: "#B91C1C", background: "#FEF2F2" }}>{it.error_code}</span>
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
                  <button
                    onClick={() => setPersonalUse((p) => ({ ...p, [it.item_id]: !p[it.item_id] }))}
                    title="Designate this as a personal card used for the business — its expenses default to needs-reimbursement"
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", fontSize: 10,
                      fontWeight: 700, borderRadius: 99, cursor: "pointer",
                      color: designated ? "#fff" : STELLA_INDIGO,
                      background: designated ? STELLA_INDIGO : `${STELLA_INDIGO}14`,
                      border: `1px solid ${designated ? STELLA_INDIGO : "transparent"}`,
                    }}
                  >
                    <Wallet size={11} /> Personal card — business use
                  </button>
                  <Button variant="secondary" size="sm" onClick={() => syncNow(it.item_id)} disabled={syncing} loading={syncing}>
                    {!syncing && <RefreshCw size={11} />} {syncing ? "Syncing…" : "Sync now"}
                  </Button>
                </div>
              );
            })}
            <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 8, lineHeight: 1.5 }}>
              Personal-card designation isn't saved yet — the account-level field lands with the feeds schema, and
              designated cards will then default their expenses to needs-reimbursement.
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
        <div style={{ ...bankCard, border: `1px solid ${STELLA_INDIGO}55` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={bankIconDisc}><Wallet size={18} color={STELLA_INDIGO} /></span>
            <span style={pill}>Personal card — business use</span>
          </div>
          <div style={bankTypeTitle}>Personal card you use for the business</div>
          <div style={bankTypeCopy}>
            Designate a personal card as business-use and its expenses default to "needs reimbursement" — they roll into
            the Owed to you total on the Overview until you pay yourself back and mark them reimbursed.
          </div>
        </div>
      </div>

      {/* Plaid Link mounts only while a fetched link token is in hand */}
      {linkToken && <PlaidLinkLauncher token={linkToken} onSuccess={onLinkSuccess} onExit={onLinkExit} />}
    </StellaShell>
  );
}

const bankCard: React.CSSProperties = { background: "#fff", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 12, padding: "16px 18px" };
const bankIconDisc: React.CSSProperties = { width: 40, height: 40, borderRadius: 99, background: STELLA_LAVENDER, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };
const bankTypeTitle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: "#0B1C24", marginTop: 10 };
const bankTypeCopy: React.CSSProperties = { fontSize: 11.5, color: "#5A7A8A", lineHeight: 1.55, marginTop: 4 };
const pill: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: STELLA_INDIGO, background: `${STELLA_INDIGO}14`, padding: "2px 8px", borderRadius: 99, whiteSpace: "nowrap" };
