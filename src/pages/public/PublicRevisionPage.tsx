// PublicRevisionPage.tsx — F3 Scope Change Revisions public surface.
//
// Mounted at /p/revisions/:token in App.tsx (alongside the other public
// signup / proposal pages — no auth, the token IS the auth).
//
// Renders:
//   1. Tenant branding header (logo + accent color + business name).
//   2. Parent proposal summary (number, title, current total).
//   3. Revision delta + scope-change notes the founder wrote.
//   4. Accept / Reject CTA.
//      - Accept opens a signature dialog (typed-name).  If the revision
//        requires_payment, the post-accept screen shows a "Pay now"
//        button that links to the F2 charge layer (founder must hit
//        Approve on the spawned milestone — this page just shows status).
//      - Reject opens a reason textarea.
//
// All API calls go DIRECTLY to oliver-api's /p/revisions/:token endpoints
// (no MSAL, no bearer token).  CORS already opens /p/* to *.

import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";

// Pull the API base from the same env var the authenticated portal uses
// — the public router on oliver-api lives on the same hostname under /p.
const OLIVER_API_BASE =
  (import.meta.env.VITE_OLIVER_API_BASE as string) ||
  "https://app-oliver-api-prod-eaffhyhqgrgbcfh0.centralus-01.azurewebsites.net";

interface RevisionDetail {
  revision_id: string;
  revision_number: number;
  status: "draft" | "sent" | "accepted" | "rejected" | "lapsed";
  delta_cents: number | null;
  scope_change_notes: string | null;
  requires_payment: boolean;
  paused_for_payment: boolean;
  sent_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  public_token_expires_at: string | null;
  proposal: {
    proposal_id: string;
    proposal_number: string;
    title: string;
    subtotal: number;
    tax_amount: number;
    discount_amount: number;
    total: number;
    currency: string;
    is_paused: boolean;
  };
  customer: {
    name: string | null;
    company: string | null;
    email: string | null;
  };
  branding: {
    tenantName: string;
    logoUrl: string | null;
    accentColor: string;
    supportEmail: string | null;
  };
}

function fmtMoney(cents: number | null | undefined, currency = "USD") {
  if (cents == null) return "—";
  const dollars = Number(cents) / 100;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}

// Same formatter but the parent proposal totals come from the API as
// DECIMAL dollars (not cents) — the route returns the raw column value.
function fmtMoneyDollars(value: number | null | undefined, currency = "USD") {
  if (value == null) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

export function PublicRevisionPage() {
  const { token } = useParams<{ token: string }>();
  const [detail, setDetail] = useState<RevisionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Accept / reject dialogs.
  const [showAccept, setShowAccept] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [signatureName, setSignatureName] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${OLIVER_API_BASE}/p/revisions/${token}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      const body = await res.json();
      setDetail(body.data || null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { reload(); }, [reload]);

  async function submitAccept() {
    if (!token) return;
    if (!signatureName.trim()) {
      setError("Type your full name to acknowledge");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${OLIVER_API_BASE}/p/revisions/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature_name: signatureName.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      const body = await res.json();
      setShowAccept(false);
      if (body.data?.requires_payment) {
        setActionMessage(
          "Accepted. We have prepared an invoice for the additional charge — you will receive a separate email with the payment link shortly.",
        );
      } else {
        setActionMessage("Accepted. The business has been notified.");
      }
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitReject() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${OLIVER_API_BASE}/p/revisions/${token}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason.trim() || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      setShowReject(false);
      setActionMessage("Revision rejected. The business has been notified.");
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div style={page}>
        <div style={{ padding: 40, textAlign: "center", color: "#5A7A8A" }}>Loading…</div>
      </div>
    );
  }
  if (error && !detail) {
    return (
      <div style={page}>
        <div style={{ ...card, padding: 40, textAlign: "center" }}>
          <h1 style={{ margin: 0, marginBottom: 8, color: "#0B1C24" }}>Revision unavailable</h1>
          <p style={{ color: "#5A7A8A" }}>{error}</p>
        </div>
      </div>
    );
  }
  if (!detail) return null;

  const accent = detail.branding.accentColor || "#1A3A4A";
  const status = detail.status;
  const canRespond = status === "sent";
  const deltaPositive = (detail.delta_cents ?? 0) > 0;

  return (
    <div style={page}>
      <div style={card}>
        {/* Branded header */}
        <div style={{
          padding: "20px 28px",
          borderBottom: `3px solid ${accent}`,
          display: "flex", alignItems: "center", gap: 16,
        }}>
          {detail.branding.logoUrl && (
            <img
              src={detail.branding.logoUrl}
              alt={detail.branding.tenantName}
              style={{ height: 36, maxWidth: 160, objectFit: "contain" }}
            />
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.6 }}>
              {detail.branding.tenantName || "Scope change"}
            </div>
            <h1 style={{ margin: 0, fontSize: 20, color: accent, fontWeight: 700 }}>
              Scope change v{detail.revision_number}
            </h1>
          </div>
        </div>

        <div style={{ padding: 28 }}>
          {/* Parent proposal summary */}
          <div style={{
            marginBottom: 24, padding: 16,
            background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8,
          }}>
            <div style={{ fontSize: 11, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
              For proposal
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#0B1C24" }}>
                  {detail.proposal.title}
                </div>
                <div style={{ fontSize: 12, color: "#5A7A8A", fontFamily: "monospace" }}>
                  {detail.proposal.proposal_number}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: "#5A7A8A" }}>Current total</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#0B1C24", fontFamily: "monospace" }}>
                  {fmtMoneyDollars(detail.proposal.total, detail.proposal.currency)}
                </div>
              </div>
            </div>
          </div>

          {/* Scope change details */}
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 14, color: accent, fontWeight: 700, margin: 0, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.6 }}>
              What's changing
            </h2>
            <div style={{
              fontSize: 14, color: "#0B1C24", lineHeight: 1.55,
              whiteSpace: "pre-wrap",
              padding: 12, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 6,
            }}>
              {detail.scope_change_notes || <em style={{ color: "#94A3B8" }}>(no notes from the business)</em>}
            </div>
          </div>

          {/* Delta amount */}
          {deltaPositive && (
            <div style={{
              marginBottom: 24, padding: 16,
              background: detail.requires_payment ? "#FEF3C7" : "#F8FAFC",
              border: `1px solid ${detail.requires_payment ? "#FCD34D" : "#E2E8F0"}`, borderRadius: 8,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div>
                  <div style={{ fontSize: 11, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.6 }}>
                    Additional amount
                  </div>
                  {detail.requires_payment && (
                    <div style={{ fontSize: 11, color: "#92400E", marginTop: 4, fontWeight: 600 }}>
                      Payment required to accept this revision
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#0B1C24", fontFamily: "monospace" }}>
                  +{fmtMoney(detail.delta_cents, detail.proposal.currency)}
                </div>
              </div>
            </div>
          )}

          {/* Action message after accept / reject */}
          {actionMessage && (
            <div style={{
              marginBottom: 16, padding: 12,
              background: "#F0FDF4", color: "#15803D",
              border: "1px solid #BBF7D0", borderRadius: 6,
              fontSize: 13,
            }}>{actionMessage}</div>
          )}

          {/* Error surface */}
          {error && (
            <div style={{
              marginBottom: 16, padding: 12,
              background: "#FEF2F2", color: "#991B1B",
              border: "1px solid #FECACA", borderRadius: 6,
              fontSize: 13,
            }}>{error}</div>
          )}

          {/* CTAs */}
          {canRespond ? (
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                onClick={() => { setShowReject(true); setError(null); }}
                style={btnGhost}
                disabled={busy}
              >Reject</button>
              <button
                onClick={() => { setShowAccept(true); setError(null); }}
                style={{ ...btnPrimary, background: accent }}
                disabled={busy}
              >
                {detail.requires_payment ? "Accept & arrange payment" : "Accept"}
              </button>
            </div>
          ) : (
            <div style={{
              padding: 16, textAlign: "center",
              background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8,
              fontSize: 13, color: "#5A7A8A",
            }}>
              {status === "accepted" && "You accepted this revision."}
              {status === "rejected" && "You rejected this revision."}
              {status === "lapsed" && "This revision is no longer available."}
              {status === "draft" && "This revision has not been sent yet."}
            </div>
          )}

          {detail.branding.supportEmail && (
            <div style={{ marginTop: 28, fontSize: 11, color: "#94A3B8", textAlign: "center" }}>
              Questions? <a href={`mailto:${detail.branding.supportEmail}`} style={{ color: accent }}>{detail.branding.supportEmail}</a>
            </div>
          )}
        </div>
      </div>

      {/* Accept dialog */}
      {showAccept && (
        <div style={modalBackdrop}>
          <div style={{ ...modal, padding: 24 }}>
            <h2 style={{ margin: 0, marginBottom: 12, fontSize: 16, color: "#0B1C24" }}>
              Accept scope change v{detail.revision_number}
            </h2>
            <p style={{ fontSize: 13, color: "#5A7A8A", marginTop: 0, marginBottom: 16 }}>
              Type your full name to acknowledge you have read and accept the scope change above.
              {detail.requires_payment && (
                <span> A separate invoice will follow for the additional <strong>{fmtMoney(detail.delta_cents, detail.proposal.currency)}</strong>.</span>
              )}
            </p>
            <input
              type="text"
              placeholder="Your full name"
              value={signatureName}
              onChange={(e) => setSignatureName(e.target.value)}
              style={input}
              autoFocus
            />
            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
              <button onClick={() => setShowAccept(false)} style={btnGhost} disabled={busy}>Cancel</button>
              <button onClick={submitAccept} style={{ ...btnPrimary, background: accent }} disabled={busy || !signatureName.trim()}>
                {busy ? "Submitting…" : "Confirm acceptance"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject dialog */}
      {showReject && (
        <div style={modalBackdrop}>
          <div style={{ ...modal, padding: 24 }}>
            <h2 style={{ margin: 0, marginBottom: 12, fontSize: 16, color: "#0B1C24" }}>
              Reject scope change v{detail.revision_number}
            </h2>
            <p style={{ fontSize: 13, color: "#5A7A8A", marginTop: 0, marginBottom: 16 }}>
              Optionally let the business know why so they can revise.
            </p>
            <textarea
              rows={4}
              placeholder="Reason (optional)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              style={{ ...input, resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
              <button onClick={() => setShowReject(false)} style={btnGhost} disabled={busy}>Cancel</button>
              <button onClick={submitReject} style={btnPrimary} disabled={busy}>
                {busy ? "Submitting…" : "Reject revision"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── styles ──────────────────────────────────────────────────────────────────
const page: React.CSSProperties = {
  minHeight: "100vh", background: "#F1F5F9", padding: "32px 16px",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};
const card: React.CSSProperties = {
  maxWidth: 720, margin: "0 auto",
  background: "#fff", borderRadius: 12,
  boxShadow: "0 4px 24px rgba(11,28,36,0.08)",
  overflow: "hidden",
};
const btnPrimary: React.CSSProperties = {
  padding: "10px 18px",
  background: "#1A3A4A", color: "#fff",
  border: 0, borderRadius: 6,
  fontSize: 13, fontWeight: 600,
  cursor: "pointer",
};
const btnGhost: React.CSSProperties = {
  padding: "10px 18px",
  background: "transparent", color: "#5A7A8A",
  border: "1px solid #D5E2E8", borderRadius: 6,
  fontSize: 13, fontWeight: 600,
  cursor: "pointer",
};
const modalBackdrop: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(11,28,36,0.4)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 1200,
};
const modal: React.CSSProperties = {
  width: 460, background: "#fff", borderRadius: 10,
  boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
};
const input: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  fontSize: 13,
  border: "1px solid #D5E2E8",
  borderRadius: 6,
  background: "#fff",
  color: "#0B1C24",
  boxSizing: "border-box",
};
