/**
 * PublicProposalPage.tsx — the customer's copy, at /p/proposals/:token.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §8 item 6.
 *
 * ── THE POINT OF THIS FILE ────────────────────────────────────────────────
 * The inventory found that oliver.proposal.blocks_json was stored and served
 * and NOBODY RENDERED IT: /p/proposals/:token had no route in the Portal, and
 * the customer's page lived in a separate application that read a different
 * projection. So the document the author built and the document the customer
 * read were two different things by construction.
 *
 * This page renders the document with `src/builder/render.ts` — the ONE
 * renderer, the same function the canvas paints with — from the SAME
 * `render_context` the API builds for the signed PDF. The author's screen, the
 * customer's screen and the PDF are one document three times, not three
 * documents.
 *
 * No auth: the token IS the auth, as with /p/revisions/:token.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { deserialise, type BuilderDocument } from "../../builder/model";
import { DEFAULT_CONSENT, DOCUMENT_CSS, makeContext, renderDocument, walkDocumentTree } from "../../builder/render";

const OLIVER_API_BASE =
  (import.meta.env.VITE_OLIVER_API_BASE as string) ||
  "https://app-oliver-api-prod-eaffhyhqgrgbcfh0.centralus-01.azurewebsites.net";

interface Payload {
  proposal_number: string;
  title: string;
  document: unknown | null;
  render_context: any | null;
  signatures: Array<{ party: string; signer_name: string; signed_at: string; consent_text: string; document_version: number }>;
  version_number: number;
  scope_html: string | null;
  terms_html: string | null;
  status: string;
  total: number;
  currency: string;
  valid_until: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  customer_name: string | null;
  customer_company: string | null;
  branding: { tenantName?: string; logoUrl?: string | null; accentColor?: string; footerNote?: string | null };
}

export function PublicProposalPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState<{ signer: string; at: string } | null>(null);
  // "Ask for a change" — the customer's half of a revision. Before this the
  // only way a revision existed was the business inventing one, so a customer
  // who wanted a different price sent an email and hoped; what they asked for
  // then lived in a mailbox rather than beside the document.
  const [askOpen, setAskOpen] = useState(false);
  const [askText, setAskText] = useState("");
  const [asked, setAsked] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${OLIVER_API_BASE}/p/proposals/${token}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      setData(body.data ?? body);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const doc: BuilderDocument | null = useMemo(
    () => (data?.document ? deserialise(data.document) : null), [data?.document]);

  const html = useMemo(() => {
    if (!doc) return "";
    const rc = data?.render_context || {};
    return renderDocument(doc, makeContext(doc, {
      mode: "view",
      merge: rc.merge || {},
      accent: rc.accent,
      headingFont: rc.headingFont,
      bodyFont: rc.bodyFont,
      currency: rc.currency || data?.currency || "USD",
      business: rc.business || { name: data?.branding?.tenantName || "" },
      locations: rc.locations || {},
      // The API's own totals, so the page and the signed PDF cannot disagree
      // about a number. It computes them once, in lib/documentModel.js.
      totals: rc.totals,
    }));
  }, [doc, data]);

  const alreadySigned = !!data?.signatures?.find((s) => s.party === "customer");
  const consent = useMemo(() => {
    // The exact words stored on the record are the exact words shown.
    // THE WHOLE TREE (D-156). A signature block the author dragged into a box
    // is still the signature block, and the words the customer agrees to are
    // the words on it — a two-level scan would have silently fallen back to
    // the default consent for any document with one.
    const fromDoc = doc
      ? walkDocumentTree(doc).find((w) => w.kind === "signature")
      : undefined;
    return String((fromDoc?.props as any)?.consent || DEFAULT_CONSENT);
  }, [doc]);

  async function accept() {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`${OLIVER_API_BASE}/p/proposals/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature: signature.trim(), consent }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message || body?.error || `HTTP ${res.status}`);
      setAccepted({ signer: body.data?.signature?.signer_name || signature.trim(), at: body.data?.signature?.signed_at || new Date().toISOString() });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  }

  async function requestChanges() {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`${OLIVER_API_BASE}/p/proposals/${token}/request-changes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: askText.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message || body?.error || `HTTP ${res.status}`);
      setAsked(true);
      setAskOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  }

  if (error && !data) {
    return <Shell><p style={{ color: "#B91C1C" }}>This document could not be opened: {error}</p></Shell>;
  }
  if (!data) return <Shell><p>Loading your document…</p></Shell>;

  const isAccepted = !!data.accepted_at || !!accepted;
  const canSign = ["sent", "viewed"].includes(data.status) && !alreadySigned && !isAccepted;

  return (
    <Shell accent={data.render_context?.accent || data.branding?.accentColor}>
      <style>{DOCUMENT_CSS}</style>

      <div style={{ maxWidth: 820, margin: "0 auto", padding: "24px 16px 60px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, color: "#5A7A8A" }}>
            {data.proposal_number} · version {data.version_number}
            {data.valid_until ? ` · valid until ${new Date(data.valid_until).toLocaleDateString(undefined, { timeZone: "UTC" })}` : ""}
          </div>
          <a href={`${OLIVER_API_BASE}/p/proposals/${token}/pdf`} target="_blank" rel="noreferrer"
            title={isAccepted ? "Open the signed PDF" : "Open this document as a PDF"}
            style={{ fontSize: 12, fontWeight: 600, color: "#0C4A60" }}>
            {isAccepted ? "Signed PDF" : "PDF"}
          </a>
        </div>

        <div style={{ background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,.06), 0 8px 24px rgba(0,0,0,.08)" }}>
          {doc
            // The ONE renderer's output. Nothing is re-laid-out here.
            ? <div className="bx-doc" dangerouslySetInnerHTML={{ __html: html }} />
            : <LegacyDocument data={data} />}
        </div>

        {isAccepted ? (
          <div style={{ marginTop: 18, border: "1px solid #BBF7D0", background: "#F0FDF4", borderRadius: 8, padding: 16 }}>
            <div style={{ fontWeight: 700, color: "#15803D" }}>Signed and accepted. Thank you.</div>
            <div style={{ fontSize: 12, color: "#166534", marginTop: 4 }}>
              Signed by {accepted?.signer || data.signatures?.find((s) => s.party === "customer")?.signer_name}
              {" on "}
              {new Date(accepted?.at || data.signatures?.find((s) => s.party === "customer")?.signed_at || Date.now()).toLocaleString()}
            </div>
            <a href={`${OLIVER_API_BASE}/p/proposals/${token}/pdf`} target="_blank" rel="noreferrer"
              title="Open the signed PDF, with your signature on it"
              style={{ display: "inline-block", marginTop: 10, background: "#0C4A60", color: "#fff", borderRadius: 4, padding: "9px 14px", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
              Open the signed PDF
            </a>
          </div>
        ) : canSign ? (
          <div style={{ marginTop: 18, border: "1px solid #E2E8F0", background: "#fff", borderRadius: 8, padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Sign to accept</div>
            <label style={{ display: "block", fontSize: 12, color: "#5A7A8A", marginBottom: 4 }}>Type your full name</label>
            <input
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder="Your full name"
              title="Your typed name becomes your signature on this document"
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
            <button
              type="button"
              disabled={busy || signature.trim().length < 2 || !agreed}
              onClick={accept}
              title={signature.trim().length < 2 ? "Type your name first" : !agreed ? "Tick the box to agree first" : "Accept this document"}
              style={{
                marginTop: 12, background: signature.trim().length >= 2 && agreed ? "#EF6C33" : "#CBD5E1",
                color: "#fff", border: "none", borderRadius: 4, padding: "11px 18px",
                fontSize: 14, fontWeight: 700, cursor: signature.trim().length >= 2 && agreed ? "pointer" : "not-allowed",
              }}
            >
              {busy ? "Signing…" : "Sign and accept"}
            </button>
            <button
              type="button"
              onClick={() => setAskOpen((v) => !v)}
              disabled={busy}
              title="Ask for something to be changed before you sign"
              style={{
                marginTop: 12, marginLeft: 8, background: "transparent", border: "1px solid #CBD5E1",
                borderRadius: 4, padding: "10px 14px", fontSize: 13, color: "#334155", cursor: "pointer",
              }}
            >
              Ask for a change
            </button>

            {asked && (
              <div style={{ marginTop: 12, border: "1px solid #BBF7D0", background: "#F0FDF4", borderRadius: 6, padding: "10px 12px", fontSize: 12, color: "#166534" }}>
                Sent. {data.branding?.tenantName || "They"} will update the document and send it back for you to sign.
              </div>
            )}

            {askOpen && !asked && (
              <div style={{ marginTop: 12 }}>
                <label style={{ display: "block", fontSize: 12, color: "#5A7A8A", marginBottom: 4 }}>
                  What would you like changed? One thing per line.
                </label>
                <textarea
                  value={askText}
                  onChange={(e) => setAskText(e.target.value)}
                  rows={4}
                  placeholder={"e.g.\nDrop the salting line for the back lot\nCan the per-push rate come down?"}
                  title="Your words go straight to the business, exactly as you type them"
                  style={{ width: "100%", maxWidth: 560, border: "1px solid #CBD5E1", borderRadius: 4, padding: "8px 10px", fontSize: 13, fontFamily: "inherit" }}
                />
                <button
                  type="button"
                  onClick={requestChanges}
                  disabled={busy || askText.trim().length < 3}
                  title={askText.trim().length < 3 ? "Tell them what to change first" : "Send this to the business"}
                  style={{
                    display: "block", marginTop: 8, background: askText.trim().length >= 3 ? "#0C4A60" : "#CBD5E1",
                    color: "#fff", border: "none", borderRadius: 4, padding: "9px 14px", fontSize: 13, fontWeight: 600,
                    cursor: askText.trim().length >= 3 ? "pointer" : "not-allowed",
                  }}
                >
                  {busy ? "Sending…" : "Send my request"}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div style={{ marginTop: 18, fontSize: 12, color: "#5A7A8A" }}>
            {data.declined_at ? "This document was declined." : "This document is not open for signature."}
          </div>
        )}
      </div>
    </Shell>
  );
}

/** A proposal written before the builder. Rendered honestly, not re-imagined. */
function LegacyDocument({ data }: { data: Payload }) {
  return (
    <div style={{ padding: 32 }}>
      <h1 style={{ fontSize: 24, marginTop: 0 }}>{data.title}</h1>
      {data.scope_html && <div dangerouslySetInnerHTML={{ __html: data.scope_html }} />}
      {data.terms_html && <p style={{ fontSize: 12, color: "#5A7A8A", whiteSpace: "pre-wrap" }}>{data.terms_html}</p>}
      <p style={{ fontWeight: 700 }}>Total: {new Intl.NumberFormat("en-US", { style: "currency", currency: data.currency || "USD" }).format(Number(data.total || 0))}</p>
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

export default PublicProposalPage;
