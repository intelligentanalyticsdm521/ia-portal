/**
 * PublicRevisionPage.tsx — the customer's copy of a REVISION, at /p/revisions/:token.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §8 item 6 and §11.5.
 *
 * ── WHAT THIS REPLACES ────────────────────────────────────────────────────
 * What stood here was the pre-builder revision page: a branded header, the
 * parent proposal's total, a delta in cents, the founder's scope-change note as
 * a paragraph, and an Accept button with a typed-name box. It could not show
 * the document, because a revision had no document — §11.5 recorded exactly
 * that ("the page the customer signs it on shows the delta and the notes rather
 * than the rebuilt document").
 *
 * A revision is a document now. So this page is PublicProposalPage with two
 * additions and no third renderer:
 *
 *   · `src/builder/render.ts` paints it — the ONE renderer, the same function
 *     the author edited on and the same one the signed PDF is painted from.
 *   · every section that differs from the version they last read wears a badge,
 *     from `src/builder/diff.ts` — the SAME function the author's canvas uses,
 *     so the two surfaces cannot badge different sections.
 *
 * The signature is not a formality here: §8 item 6 says "required sign-off on
 * EVERY revision". The customer signed v1; this is v2 and it is unsigned, so
 * they sign again. The button disabling is a courtesy — oliver-api's
 * `signatureRefusal()` is the guard, and a mutation test that skips it goes red.
 *
 * No auth: the token IS the auth, as with /p/proposals/:token.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { deserialise, type BuilderDocument } from "../../builder/model";
import { DEFAULT_CONSENT, DOCUMENT_CSS, makeContext, renderDocument } from "../../builder/render";
import { diffDocuments, diffSummary } from "../../builder/diff";

const OLIVER_API_BASE =
  (import.meta.env.VITE_OLIVER_API_BASE as string) ||
  "https://app-oliver-api-prod-eaffhyhqgrgbcfh0.centralus-01.azurewebsites.net";

interface Signature {
  party: string; signer_name: string; signed_at: string;
  consent_text: string; document_version: number;
}

interface RevisionPayload {
  revision_id: string;
  revision_number: number;
  document_version: number;
  status: "draft" | "sent" | "accepted" | "rejected" | "lapsed";
  delta_cents: number | null;
  scope_change_notes: string | null;
  request_note: string | null;
  request_items: Array<{ text: string; done: boolean }>;
  requested_by: string | null;
  requires_payment: boolean;
  paused_for_payment: boolean;
  sent_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  public_token_expires_at: string | null;
  document: unknown | null;
  base_document: unknown | null;
  render_context: any | null;
  signatures: Signature[];
  proposal: {
    proposal_id: string; proposal_number: string; title: string;
    subtotal: number; tax_amount: number; discount_amount: number;
    total: number; currency: string; is_paused: boolean;
  };
  customer: { name: string | null; company: string | null; email: string | null };
  branding: { tenantName?: string; logoUrl?: string | null; accentColor?: string; supportEmail?: string | null };
}

function fmtMoneyDollars(value: number | null | undefined, currency = "USD") {
  if (value == null) return "—";
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(value));
}

export function PublicRevisionPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<RevisionPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [done, setDone] = useState<"accepted" | "rejected" | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${OLIVER_API_BASE}/p/revisions/${token}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message || body?.error || `HTTP ${res.status}`);
      setData(body.data ?? body);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const doc: BuilderDocument | null = useMemo(
    () => (data?.document ? deserialise(data.document) : null), [data?.document]);
  const base: BuilderDocument | null = useMemo(
    () => (data?.base_document ? deserialise(data.base_document) : null), [data?.base_document]);

  const diff = useMemo(() => diffDocuments(base, doc), [base, doc]);

  const html = useMemo(() => {
    if (!doc) return "";
    const rc = data?.render_context || {};
    return renderDocument(doc, makeContext(doc, {
      mode: "view",
      merge: rc.merge || {},
      accent: rc.accent,
      headingFont: rc.headingFont,
      bodyFont: rc.bodyFont,
      currency: rc.currency || data?.proposal?.currency || "USD",
      business: rc.business || { name: data?.branding?.tenantName || "" },
      locations: rc.locations || {},
      // The API's own totals, so the page and the signed PDF cannot disagree
      // about a number.
      totals: rc.totals,
      // §11.5's "diff-aware": the SAME map the author's canvas painted.
      changed: diff.sections,
    }));
  }, [doc, data, diff]);

  const consent = useMemo(() => {
    const fromDoc = doc?.sections
      .flatMap((s) => s.columns.flatMap((c) => c.widgets))
      .find((w) => w.kind === "signature");
    return String((fromDoc?.props as any)?.consent || DEFAULT_CONSENT);
  }, [doc]);

  // The signatures the API returns are THIS version's only, so "already signed"
  // can never be answered by v1's name.
  const alreadySigned = !!data?.signatures?.find((s) => s.party === "customer");

  async function accept() {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`${OLIVER_API_BASE}/p/revisions/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature: signature.trim(), consent }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message || body?.error || `HTTP ${res.status}`);
      setDone("accepted");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  }

  async function reject() {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`${OLIVER_API_BASE}/p/revisions/${token}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || null }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message || body?.error || `HTTP ${res.status}`);
      setDone("rejected");
      setRejecting(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  }

  if (error && !data) {
    return <Shell><p style={{ color: "#B91C1C" }}>This update could not be opened: {error}</p></Shell>;
  }
  if (!data) return <Shell><p>Loading your updated document…</p></Shell>;

  const accent = data.render_context?.accent || data.branding?.accentColor || "#0C4A60";
  const isAccepted = !!data.accepted_at || done === "accepted";
  const isRejected = !!data.rejected_at || done === "rejected";
  const canSign = data.status === "sent" && !alreadySigned && !isAccepted && !isRejected;

  return (
    <Shell accent={accent}>
      <style>{DOCUMENT_CSS}</style>

      <div style={{ maxWidth: 820, margin: "0 auto", padding: "24px 16px 60px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, color: "#5A7A8A" }}>
            {data.proposal.proposal_number} · <strong>version {data.document_version}</strong> — an update to the document you were sent
          </div>
          <a href={`${OLIVER_API_BASE}/p/revisions/${token}/pdf`} target="_blank" rel="noreferrer"
            title={isAccepted ? "Open the signed PDF of this version" : "Open this version as a PDF"}
            style={{ fontSize: 12, fontWeight: 600, color: "#0C4A60" }}>
            {isAccepted ? "Signed PDF" : "PDF"}
          </a>
        </div>

        {/* What moved, before the document rather than after it: the reader
            needs to know what to look for before they start reading. */}
        <div style={{
          border: "1px solid #FCD34D", background: "#FFFBEB", borderRadius: 8,
          padding: "12px 14px", marginBottom: 14, fontSize: 13, color: "#451A03",
        }}>
          <div style={{ fontWeight: 700, color: "#92400E", marginBottom: 4 }}>What has changed</div>
          <div>{base ? diffSummary(diff) : "This is an updated version of your document."}</div>
          {/* A customer-requested revision copies their words into
              scope_change_notes as well, so printing both showed the same
              paragraph twice — found by walking it. Their own words win, and
              are labelled as theirs. */}
          {data.requested_by === "customer" && data.request_note ? (
            <div style={{ marginTop: 6, fontSize: 12, color: "#78716C" }}>
              You asked for: <span style={{ whiteSpace: "pre-wrap" }}>{data.request_note}</span>
            </div>
          ) : data.scope_change_notes ? (
            <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{data.scope_change_notes}</div>
          ) : null}
          {data.delta_cents != null && data.delta_cents > 0 && (
            <div style={{ marginTop: 6, fontWeight: 600 }}>
              Change to the price: {fmtMoneyDollars(Number(data.delta_cents) / 100, data.proposal.currency)}
              {data.requires_payment ? " — payable when you accept." : ""}
            </div>
          )}
          {Object.keys(diff.sections).length > 0 && (
            <div style={{ marginTop: 6, fontSize: 12, color: "#78716C" }}>
              Changed parts are marked on the document below.
            </div>
          )}
        </div>

        <div style={{ background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,.06), 0 8px 24px rgba(0,0,0,.08)" }}>
          {doc
            ? <div className="bx-doc" dangerouslySetInnerHTML={{ __html: html }} />
            : <LegacyRevision data={data} />}
        </div>

        {isAccepted ? (
          <div style={{ marginTop: 18, border: "1px solid #BBF7D0", background: "#F0FDF4", borderRadius: 8, padding: 16 }}>
            <div style={{ fontWeight: 700, color: "#15803D" }}>Signed and accepted. Thank you.</div>
            <div style={{ fontSize: 12, color: "#166534", marginTop: 4 }}>
              Version {data.document_version}, signed by{" "}
              {data.signatures?.find((s) => s.party === "customer")?.signer_name || signature.trim()}
              {data.signatures?.find((s) => s.party === "customer")?.signed_at
                ? ` on ${new Date(data.signatures.find((s) => s.party === "customer")!.signed_at).toLocaleString()}`
                : ""}
            </div>
            {data.requires_payment && (
              <div style={{ fontSize: 12, color: "#166534", marginTop: 6 }}>
                {data.branding?.tenantName || "The business"} will send you the payment for the change.
              </div>
            )}
            <a href={`${OLIVER_API_BASE}/p/revisions/${token}/pdf`} target="_blank" rel="noreferrer"
              title="Open the signed PDF of this version, with your signature on it"
              style={{ display: "inline-block", marginTop: 10, background: "#0C4A60", color: "#fff", borderRadius: 4, padding: "9px 14px", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
              Open the signed PDF
            </a>
          </div>
        ) : isRejected ? (
          <div style={{ marginTop: 18, fontSize: 13, color: "#5A7A8A" }}>
            You told {data.branding?.tenantName || "the business"} this update does not work for you. They will be in touch.
          </div>
        ) : canSign ? (
          <div style={{ marginTop: 18, border: "1px solid #E2E8F0", background: "#fff", borderRadius: 8, padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>Sign to accept this version</div>
            <div style={{ fontSize: 12, color: "#5A7A8A", marginBottom: 8 }}>
              The document has changed since you last signed, so it needs your signature again.
            </div>
            <label style={{ display: "block", fontSize: 12, color: "#5A7A8A", marginBottom: 4 }}>Type your full name</label>
            <input
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder="Your full name"
              title="Your typed name becomes your signature on this version"
              style={{
                width: "100%", maxWidth: 420, border: "1px solid #CBD5E1", borderRadius: 4, padding: "10px 12px",
                fontFamily: '"Segoe Script","Brush Script MT",cursive', fontSize: 22,
              }}
            />
            <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: "#334155", marginTop: 10, maxWidth: 560, lineHeight: 1.5 }}>
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)}
                title="You must agree before you can accept" />
              <span>{consent}</span>
            </label>
            {error && <div style={{ fontSize: 12, color: "#B91C1C", marginTop: 8 }}>{error}</div>}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
              <button
                type="button"
                disabled={busy || signature.trim().length < 2 || !agreed}
                onClick={accept}
                title={signature.trim().length < 2 ? "Type your name first" : !agreed ? "Tick the box to agree first" : "Accept this version"}
                style={{
                  background: signature.trim().length >= 2 && agreed ? "#EF6C33" : "#CBD5E1",
                  color: "#fff", border: "none", borderRadius: 4, padding: "11px 18px",
                  fontSize: 14, fontWeight: 700, cursor: signature.trim().length >= 2 && agreed ? "pointer" : "not-allowed",
                }}
              >
                {busy ? "Signing…" : "Sign and accept"}
              </button>
              <button type="button" onClick={() => setRejecting((v) => !v)} disabled={busy}
                title="Tell them this update does not work for you"
                style={{ background: "transparent", border: "1px solid #CBD5E1", borderRadius: 4, padding: "10px 14px", fontSize: 13, color: "#334155", cursor: "pointer" }}>
                This doesn't work for me
              </button>
            </div>
            {rejecting && (
              <div style={{ marginTop: 12 }}>
                <label style={{ display: "block", fontSize: 12, color: "#5A7A8A", marginBottom: 4 }}>
                  What is wrong with it? (optional, but it helps)
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  title="Your reason goes straight to the business"
                  style={{ width: "100%", maxWidth: 560, border: "1px solid #CBD5E1", borderRadius: 4, padding: "8px 10px", fontSize: 13 }}
                />
                <button type="button" onClick={reject} disabled={busy}
                  title="Send this back to the business"
                  style={{ display: "block", marginTop: 8, background: "#0C4A60", color: "#fff", border: "none", borderRadius: 4, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  {busy ? "Sending…" : "Send it back"}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div style={{ marginTop: 18, fontSize: 12, color: "#5A7A8A" }}>
            {alreadySigned
              ? "You have already signed this version."
              : "This update is not open for signature."}
          </div>
        )}
      </div>
    </Shell>
  );
}

/**
 * A revision raised before a revision had a document.
 *
 * Rendered honestly, not re-imagined: the delta and the note are all there ever
 * was on these rows, and inventing a document for them would be a picture of
 * something that was never agreed.
 */
function LegacyRevision({ data }: { data: RevisionPayload }) {
  return (
    <div style={{ padding: 32 }}>
      <h1 style={{ fontSize: 22, marginTop: 0 }}>{data.proposal.title}</h1>
      <p style={{ color: "#5A7A8A", fontSize: 13 }}>
        This update was raised before documents were versioned, so there is no full copy to show —
        only what changed.
      </p>
      {data.scope_change_notes && <p style={{ whiteSpace: "pre-wrap" }}>{data.scope_change_notes}</p>}
      <p style={{ fontWeight: 700 }}>
        Current total: {fmtMoneyDollars(data.proposal.total, data.proposal.currency)}
      </p>
    </div>
  );
}

function Shell({ children, accent = "#0C4A60" }: { children: React.ReactNode; accent?: string }) {
  return (
    <div style={{ minHeight: "100vh", background: "#F2F6F9", fontFamily: "Inter, system-ui, sans-serif", color: "#0B1C24" }}>
      <div style={{ height: 4, background: accent }} />
      {children}
    </div>
  );
}

export default PublicRevisionPage;
