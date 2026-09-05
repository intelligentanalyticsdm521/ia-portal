/**
 * QuickBooksCard — OLIVER → Business Setup → QuickBooks Online.
 *
 * Ops scope O-5 step (a). The business keeps its accountant on QuickBooks;
 * OLIVER sends the customers, invoices and payments over so nobody re-types
 * anything. One direction: nothing comes back the other way, and the card says
 * so rather than leaving an owner to assume it is a two-way sync.
 *
 * It lives on Business Setup beside Stripe Connect for two reasons: that is
 * where the money plumbing already is, and adding a nav row would need a
 * `core.services` migration for a card (nav rows are platform-pool-only).
 *
 * Four things this card has to get right:
 *
 *  1. "Not set up yet" and "not connected" are different sentences. Until
 *     Intelligent Analytics registers its Intuit app (T-INTUIT) nobody can
 *     connect, and offering a button that dead-ends on an Intuit error page
 *     teaches the owner that their QuickBooks is broken. The API says
 *     `configured: false`; the button is disabled and the card says why, in
 *     words the owner can forward.
 *
 *  2. "Connected" must mean connected. A connection whose token renewal has
 *     failed still has a row. It renders amber with the reason, never a green
 *     tick — the lesson the calendar card paid for.
 *
 *  3. Something that did not sync has to be visible, named, and retryable.
 *     A working connection with three refused invoices is not a working
 *     connection as far as the accountant is concerned.
 *
 *  4. The word is Business, never tenant.
 */
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, RefreshCw } from "lucide-react";
import { Button } from "../../components/oliver/ui";
import {
  type QboStatus, type QboAttentionItem,
  PUSHES, DOES_NOT_PUSH, NOT_CONFIGURED_FALLBACK, REFUND_CREDIT_NOTE,
  cardState, stateLabel, stateDetail, lastSyncLine, attentionLine,
  attentionItemLabel, environmentNote, errorMessageOf,
} from "../../lib/quickbooksConnection";

interface Api {
  get: <T>(path: string) => Promise<T>;
  post: <T>(path: string, body?: unknown) => Promise<T>;
  del: <T>(path: string) => Promise<T>;
}

const MUTED = "#5A7A8A";
const INK = "#0B1C24";

export function QuickBooksCard({ api }: { api: Api }) {
  const { get, post, del } = api;

  const [status, setStatus] = useState<QboStatus | null>(null);
  const [items, setItems] = useState<QboAttentionItem[]>([]);
  const [busy, setBusy] = useState<null | "connect" | "disconnect" | "push" | number>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const reload = useCallback(async () => {
    try {
      const s = await get<QboStatus>("/accounting/qbo/status");
      setStatus(s);
      if (s?.connected && s.needs_attention > 0) {
        const r = await get<{ items: QboAttentionItem[] }>("/accounting/qbo/needs-attention");
        setItems(r?.items || []);
      } else {
        setItems([]);
      }
    } catch {
      // An older oliver-api has no /accounting route at all. Absence of the
      // feature is not an error worth a red banner over Business Setup.
      setStatus(null);
    }
  }, [get]);

  useEffect(() => { void reload(); }, [reload]);

  // The OAuth callback sends the owner back here carrying the outcome. Read it
  // once, show it, and strip it from the URL so a refresh does not replay a
  // stale "connected" or a stale error.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("qbo");
    if (!outcome) return;
    if (outcome === "connected") setNotice("QuickBooks connected.");
    else setError(params.get("message") || "QuickBooks could not be connected.");
    params.delete("qbo"); params.delete("code"); params.delete("message");
    const qs = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    void reload();
  }, [reload]);

  const state = cardState(status);
  const detail = stateDetail(status);
  const envNote = environmentNote(status);
  const attention = attentionLine(status?.needs_attention || 0);

  async function connect() {
    setBusy("connect"); setError(null); setNotice(null);
    try {
      const r = await post<{ auth_url: string }>("/accounting/qbo/connect", {});
      window.location.href = r.auth_url;
    } catch (e) {
      // The one case an owner can do something about is the one-time Intuit
      // registration. Print the sentence the API sent, verbatim.
      setError(errorMessageOf(e, "Could not start the connection. Please try again."));
      setBusy(null);
    }
  }

  async function disconnect() {
    if (!window.confirm(
      "Disconnect QuickBooks? New customers, invoices, payments and refunds will stop being sent to your QuickBooks company. "
      + "Nothing already in QuickBooks is removed.",
    )) return;
    setBusy("disconnect"); setError(null); setNotice(null);
    try {
      await del("/accounting/qbo");
      setNotice("QuickBooks disconnected.");
      await reload();
    } catch (e) {
      setError(errorMessageOf(e, "Could not disconnect QuickBooks."));
    } finally {
      setBusy(null);
    }
  }

  async function pushNow() {
    setBusy("push"); setError(null); setNotice(null);
    try {
      const r = await post<{ pushed: number; skipped: number; failed: number }>("/accounting/qbo/push-now", {});
      setNotice(
        r.pushed || r.failed
          ? `Sent ${r.pushed} to QuickBooks${r.failed ? `, ${r.failed} could not be sent` : ""}.`
          : "Everything is already up to date in QuickBooks.",
      );
      await reload();
    } catch (e) {
      setError(errorMessageOf(e, "Could not sync with QuickBooks right now."));
    } finally {
      setBusy(null);
    }
  }

  async function retry(item: QboAttentionItem) {
    setBusy(item.queue_id); setError(null); setNotice(null);
    try {
      await post(`/accounting/qbo/needs-attention/${item.queue_id}/retry`, {});
      await reload();
    } catch (e) {
      setError(errorMessageOf(e, "Could not retry that one."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card">
      <div className="card-hdr">
        <div>
          <div className="card-ttl">Accounting — QuickBooks Online</div>
          <div className="card-sub">
            Send your customers, invoices, payments and refunds to QuickBooks so your accountant works from the
            same numbers you do. One direction only — nothing in QuickBooks changes anything in OLIVER.
          </div>
        </div>
        <StatePill state={state} />
      </div>

      {notice && (
        <div style={{ marginBottom: 10, fontSize: 11, color: "#047857", padding: "8px 10px", background: "#D1FAE5", borderRadius: 6 }}>
          {notice}
        </div>
      )}
      {error && (
        <div style={{ marginBottom: 10, display: "flex", gap: 8, alignItems: "flex-start", fontSize: 11, color: "#B45309", padding: "8px 10px", background: "#FEF3C7", borderRadius: 6 }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}

      {/* Not set up yet — the honest state before T-INTUIT. */}
      {state === "not_configured" && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: "8px 0" }}>
          <div style={{ flex: 1, fontSize: 12, color: INK, lineHeight: 1.5 }}>
            {detail || NOT_CONFIGURED_FALLBACK}. We will let you know as soon as it is available.
          </div>
          <Button variant="secondary" disabled>Connect QuickBooks</Button>
        </div>
      )}

      {state === "not_connected" && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: "8px 0" }}>
          <div style={{ flex: 1, fontSize: 12, color: INK, lineHeight: 1.5 }}>
            You will sign in to QuickBooks and choose which company to connect. It takes about a minute, and you
            can disconnect at any time.
          </div>
          <Button variant="primary" onClick={connect} disabled={busy !== null}>
            {busy === "connect" ? "Opening QuickBooks…" : "Connect QuickBooks"}
          </Button>
        </div>
      )}

      {(state === "connected" || state === "needs_reconnect") && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
            <div style={{ flex: 1 }}>
              {state === "needs_reconnect" && (
                <div style={{ marginBottom: 10, fontSize: 11, color: "#B45309", padding: "8px 10px", background: "#FEF3C7", borderRadius: 6 }}>
                  {detail}
                </div>
              )}
              <div style={{ fontSize: 11, color: MUTED }}>{lastSyncLine(status)}</div>
              {envNote && (
                <div style={{ marginTop: 6, fontSize: 11, color: "#B45309" }}>{envNote}</div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
              {state === "needs_reconnect" && (
                <Button variant="primary" onClick={connect} disabled={busy !== null}>
                  {busy === "connect" ? "Opening QuickBooks…" : "Reconnect QuickBooks"}
                </Button>
              )}
              <Button variant="secondary" onClick={pushNow} disabled={busy !== null}>
                <RefreshCw size={12} /> {busy === "push" ? "Syncing…" : "Sync now"}
              </Button>
              <Button variant="ghost" onClick={disconnect} disabled={busy !== null}>
                {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
              </Button>
            </div>
          </div>

          {/* Things that did not reach QuickBooks: named, explained, retryable. */}
          {attention && (
            <div style={{ marginTop: 14, border: "1px solid #FDE68A", borderRadius: 8, background: "#FFFBEB" }}>
              <div style={{ padding: "8px 10px", fontSize: 11, fontWeight: 600, color: "#92400E", display: "flex", alignItems: "center", gap: 6 }}>
                <AlertTriangle size={13} /> {attention}
              </div>
              <div>
                {items.map((item) => (
                  <div
                    key={item.queue_id}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12,
                      padding: "8px 10px", borderTop: "1px solid #FDE68A",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: INK }}>{attentionItemLabel(item)}</div>
                      <div style={{ fontSize: 11, color: "#92400E", marginTop: 2 }}>{item.reason}</div>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => retry(item)} disabled={busy !== null}>
                      {busy === item.queue_id ? "Retrying…" : "Try again"}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* What gets pushed. Collapsed by default, because it is the question an
          owner asks once — and it is the whole answer when they do. */}
      <div style={{ marginTop: 14, borderTop: "1px solid rgba(45,156,219,0.18)", paddingTop: 10 }}>
        <button
          type="button"
          onClick={() => setShowDetail((v) => !v)}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 11, fontWeight: 600, color: "#2D9CDB" }}
        >
          {showDetail ? "Hide what gets sent" : "What gets sent to QuickBooks?"}
        </button>
        {showDetail && (
          <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: INK, marginBottom: 4 }}>Sent to QuickBooks</div>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: MUTED, lineHeight: 1.6 }}>
                {PUSHES.map((line) => <li key={line}>{line}</li>)}
              </ul>
              {/* QB-1 — the one refund case an owner would otherwise read as a
                  missing refund. */}
              <p style={{ margin: "6px 0 0", fontSize: 11, color: MUTED, lineHeight: 1.5 }}>{REFUND_CREDIT_NOTE}</p>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: INK, marginBottom: 4 }}>Never sent</div>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: MUTED, lineHeight: 1.6 }}>
                {DOES_NOT_PUSH.map((line) => <li key={line}>{line}</li>)}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatePill({ state }: { state: ReturnType<typeof cardState> }) {
  const label = stateLabel(state);
  if (state === "connected") {
    return (
      <span style={pill("#D1FAE5", "#047857")}><Check size={11} /> {label}</span>
    );
  }
  if (state === "needs_reconnect") {
    return (
      <span style={pill("#FEF3C7", "#92400E")}><AlertTriangle size={11} /> {label}</span>
    );
  }
  return <span style={pill("#F1F5F9", "#475569")}>{label}</span>;
}

function pill(background: string, color: string) {
  return {
    display: "inline-flex", alignItems: "center", gap: 4,
    borderRadius: 999, padding: "2px 8px",
    fontSize: 11, fontWeight: 600, background, color, whiteSpace: "nowrap" as const,
  };
}
