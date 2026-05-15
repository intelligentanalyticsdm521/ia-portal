// OliverTemplateLibraryPage — the home for invoice / quote / proposal
// templates. Branding (logo, accent, business name) is pulled from the SHARED
// business profile (core.tenants) and is read-only here — changed in
// Organization Settings. One template config powers all three document types;
// the doc-type tabs show the same template applied to each.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { PageHeader, Button } from "../../components/oliver/ui";

interface Settings { tenantFullName?: string; email?: string; phone?: string; logoUrl?: string | null; brandColor?: string | null; }
interface Template {
  logoUrl: string | null;
  accentColor: string;
  invoiceNumberPrefix: string;
  terms: string;
  footerNote: string;
  googleReviewUrl: string | null;
}
type DocType = "invoice" | "quote" | "proposal";

const DOC_LABEL: Record<DocType, string> = { invoice: "INVOICE", quote: "QUOTE", proposal: "PROPOSAL" };
const DOC_ACTION: Record<DocType, string> = { invoice: "PAY THIS INVOICE ONLINE", quote: "ACCEPT THIS QUOTE", proposal: "ACCEPT THIS PROPOSAL" };

function DocPreview({ doc, tpl, businessName, email, phone }: { doc: DocType; tpl: Template; businessName: string; email?: string; phone?: string }) {
  const accent = tpl.accentColor || "#1A3A4A";
  const num = `${doc === "invoice" ? (tpl.invoiceNumberPrefix || "INV-") : doc === "quote" ? "QTE-" : "PRO-"}00042`;
  return (
    <div style={{ background: "#fff", borderRadius: 6, overflow: "hidden", fontSize: 11, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
      <div style={{ padding: "16px 18px", background: accent, color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          {tpl.logoUrl ? <img src={tpl.logoUrl} alt="logo" style={{ height: 28, marginBottom: 6, background: "#fff", borderRadius: 3, padding: 2 }} onError={(e) => (e.currentTarget.style.display = "none")} /> : null}
          <div style={{ fontWeight: 700, fontSize: 14 }}>{businessName}</div>
          <div style={{ fontSize: 10, opacity: 0.9, marginTop: 2 }}>{email}{email && phone ? " · " : ""}{phone}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 1 }}>{DOC_LABEL[doc]}</div>
          <div style={{ fontSize: 10, opacity: 0.9, marginTop: 2 }}>{num}</div>
        </div>
      </div>
      <div style={{ padding: "10px 18px", fontSize: 10, color: "#5A7A8A" }}>
        <div style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 }}>Bill to</div>
        <div style={{ color: "#0B1C24", marginTop: 2 }}>Sample Customer Inc.</div>
        <div>123 Main St, Springfield IL 62701</div>
      </div>
      <table style={{ width: "100%", fontSize: 10, borderCollapse: "collapse" }}>
        <thead style={{ background: accent, color: "#fff" }}>
          <tr><th style={{ padding: "5px 12px", textAlign: "left" }}>Description</th><th style={{ padding: "5px 8px", textAlign: "right", width: 56 }}>Amount</th></tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: "1px solid #f0f4f6" }}><td style={{ padding: "5px 12px" }}>Premium service package</td><td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "monospace" }}>$299.00</td></tr>
          <tr style={{ borderBottom: "1px solid #f0f4f6" }}><td style={{ padding: "5px 12px" }}>Setup fee (one-time)</td><td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "monospace" }}>$99.00</td></tr>
        </tbody>
      </table>
      <div style={{ margin: "10px 18px 12px", background: accent, color: "#fff", textAlign: "center", padding: "6px 0", borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>
        {DOC_ACTION[doc]}
      </div>
      {(tpl.terms || tpl.footerNote) && (
        <div style={{ padding: "8px 18px 14px", fontSize: 9, color: "#5A7A8A", borderTop: "1px solid #f0f4f6" }}>
          {tpl.terms && <div><strong>Terms:</strong> {tpl.terms}</div>}
          {tpl.footerNote && <div style={{ marginTop: 2 }}>{tpl.footerNote}</div>}
        </div>
      )}
    </div>
  );
}

export function OliverTemplateLibraryPage() {
  const { get, patch, ready } = useOliverApi();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tpl, setTpl] = useState<Template | null>(null);
  const [draft, setDraft] = useState<Template | null>(null);
  const [doc, setDoc] = useState<DocType>("invoice");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [s, t] = await Promise.all([
        get<Settings>("/settings"),
        get<Template>("/settings/invoice-template"),
      ]);
      setSettings(s); setTpl(t); setDraft(t);
    } catch (e) { setError(e); }
    finally { setLoading(false); }
  }, [get]);

  useEffect(() => { if (ready) refresh(); }, [ready, refresh]);

  async function save() {
    if (!draft) return;
    setSaving(true); setMsg(null);
    try {
      await patch("/settings/invoice-template", draft);
      setTpl(draft);
      setMsg("Template saved — applies to invoices, quotes, and proposals.");
      setTimeout(() => setMsg(null), 3000);
    } catch (e) { setMsg(`Save failed: ${(e as Error).message}`); }
    finally { setSaving(false); }
  }

  const changed = !!tpl && !!draft && JSON.stringify(tpl) !== JSON.stringify(draft);

  return (
    <OliverPageWrapper title="Template Library" subtitle="Invoice, quote & proposal templates" error={error} loading={loading}>
      <PageHeader title="Template Library" subtitle="One branded template powers your invoices, quotes, and proposals." />

      {msg && (
        <div className="card" style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
          <div style={{ fontSize: 12, color: "#15803D" }}>{msg}</div>
        </div>
      )}

      <div className="card" style={{ background: "#E8F4FB", border: "1px solid rgba(45,156,219,0.3)" }}>
        <div style={{ fontSize: 12, color: "#0C4A60", lineHeight: 1.5 }}>
          Logo, brand color, and business name come from your{" "}
          <Link to="/app/settings?tab=Organization" style={{ fontWeight: 700, color: "#0C4A60", textDecoration: "underline" }}>
            business profile
          </Link>{" "}
          and are shared everywhere. Edit the template details below — they apply to all three document types.
        </div>
      </div>

      {draft && (
        <div className="card">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Field label="Invoice number prefix">
                <input style={{ ...inp, fontFamily: "monospace" }} value={draft.invoiceNumberPrefix}
                  onChange={(e) => setDraft({ ...draft, invoiceNumberPrefix: e.target.value })} placeholder="INV-" />
              </Field>
              <Field label="Payment / acceptance terms">
                <input style={inp} value={draft.terms}
                  onChange={(e) => setDraft({ ...draft, terms: e.target.value })} placeholder="Due upon receipt" />
              </Field>
              <Field label="Footer note">
                <textarea rows={2} style={{ ...inp, resize: "vertical" }} value={draft.footerNote}
                  onChange={(e) => setDraft({ ...draft, footerNote: e.target.value })} placeholder="Thank you for your business!" />
              </Field>
              <Field label="Google review URL (review-request automation)">
                <input style={inp} value={draft.googleReviewUrl ?? ""}
                  onChange={(e) => setDraft({ ...draft, googleReviewUrl: e.target.value || null })} placeholder="https://g.page/r/.../review" />
              </Field>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <Button variant="primary" onClick={save} disabled={saving || !changed}>
                  {saving ? "Saving…" : "Save template"}
                </Button>
              </div>
            </div>

            <div style={{ background: "#f3f6f8", padding: 12, borderRadius: 8 }}>
              <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
                {(["invoice", "quote", "proposal"] as DocType[]).map((d) => (
                  <button key={d} onClick={() => setDoc(d)}
                    style={{
                      fontSize: 11, fontWeight: 600, padding: "5px 12px", borderRadius: 5, border: 0, cursor: "pointer",
                      background: doc === d ? "#0C4A60" : "#fff", color: doc === d ? "#fff" : "#5A7A8A",
                      textTransform: "capitalize",
                    }}>{d}</button>
                ))}
              </div>
              <DocPreview
                doc={doc}
                tpl={draft}
                businessName={settings?.tenantFullName || "Your Business"}
                email={settings?.email}
                phone={settings?.phone}
              />
            </div>
          </div>
        </div>
      )}
    </OliverPageWrapper>
  );
}

const inp: React.CSSProperties = {
  width: "100%", padding: "7px 10px", fontSize: 12, boxSizing: "border-box",
  border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6, background: "#fff", color: "#0B1C24",
};
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  );
}

export default OliverTemplateLibraryPage;
