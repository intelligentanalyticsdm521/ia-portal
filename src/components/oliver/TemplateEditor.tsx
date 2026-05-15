// TemplateEditor — shared modal editor for a document template. Used by the
// Template Library page and the onboarding "create your first template" step.
import { useState } from "react";
import { Button } from "./ui";

export const DOC_TYPES = ["invoice", "quote", "proposal", "recurring"] as const;
export type DocType = (typeof DOC_TYPES)[number];

export interface Tpl {
  template_id?: string;
  name: string;
  accentColor?: string | null;
  logoUrl?: string | null;
  numberPrefix?: string | null;
  headerNote?: string | null;
  terms?: string | null;
  footerNote?: string | null;
  paymentInstructions?: string | null;
  showLineItemDetail?: boolean;
  isDefault?: boolean;
}

interface Brand {
  businessName?: string;
  email?: string;
  phone?: string;
  logoUrl?: string | null;
  accentColor?: string | null;
}

const EMPTY: Tpl = {
  name: "", accentColor: "", logoUrl: "", numberPrefix: "INV-",
  headerNote: "", terms: "Due upon receipt", footerNote: "",
  paymentInstructions: "", showLineItemDetail: true,
};

const DOC_LABEL: Record<DocType, string> = {
  invoice: "Invoice", quote: "Quote", proposal: "Proposal", recurring: "Recurring subscription",
};

export function TemplateEditor({
  initial, initialAssign, brand, onCancel, onSave,
}: {
  initial: Tpl | null;
  initialAssign: string[];
  brand: Brand;
  onCancel: () => void;
  onSave: (tpl: Tpl, assignTo: string[]) => void | Promise<void>;
}) {
  const [t, setT] = useState<Tpl>(initial ? { ...initial } : { ...EMPTY });
  const [assign, setAssign] = useState<string[]>(initialAssign);
  const [saving, setSaving] = useState(false);
  const set = (p: Partial<Tpl>) => setT((x) => ({ ...x, ...p }));
  const toggle = (d: DocType) =>
    setAssign((a) => (a.includes(d) ? a.filter((x) => x !== d) : [...a, d]));

  const accent = t.accentColor || brand.accentColor || "#1A3A4A";
  const logo = t.logoUrl || brand.logoUrl || null;

  async function submit() {
    if (!t.name.trim()) return;
    setSaving(true);
    try { await onSave(t, assign); } finally { setSaving(false); }
  }

  return (
    <div style={overlay} onClick={onCancel}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "16px 22px", borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1A3A4A" }}>
            {initial ? "Edit template" : "Create template"}
          </h2>
          <button onClick={onCancel} style={{ background: "none", border: 0, fontSize: 22, color: "#5A7A8A", cursor: "pointer" }}>×</button>
        </div>

        <div style={{ padding: 22, overflowY: "auto", flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Template name">
              <input style={inp} value={t.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Standard Invoice" autoFocus />
            </Field>
            <Field label="Document number prefix">
              <input style={{ ...inp, fontFamily: "monospace" }} value={t.numberPrefix || ""} onChange={(e) => set({ numberPrefix: e.target.value })} placeholder="INV-" />
            </Field>
            <Field label="Accent color (blank = your brand color)">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="color" value={accent} onChange={(e) => set({ accentColor: e.target.value })}
                  style={{ width: 40, height: 30, padding: 0, border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6 }} />
                <input style={{ ...inp, flex: 1, fontFamily: "monospace" }} value={t.accentColor || ""} onChange={(e) => set({ accentColor: e.target.value })} placeholder={brand.accentColor || "#1A3A4A"} />
              </div>
            </Field>
            <Field label="Header note (top of document)">
              <input style={inp} value={t.headerNote || ""} onChange={(e) => set({ headerNote: e.target.value })} placeholder="Thanks for your business!" />
            </Field>
            <Field label="Terms">
              <input style={inp} value={t.terms || ""} onChange={(e) => set({ terms: e.target.value })} placeholder="Due upon receipt" />
            </Field>
            <Field label="Payment instructions">
              <textarea rows={2} style={{ ...inp, resize: "vertical" }} value={t.paymentInstructions || ""} onChange={(e) => set({ paymentInstructions: e.target.value })} placeholder="Pay online via the link, or mail a check to…" />
            </Field>
            <Field label="Footer note">
              <textarea rows={2} style={{ ...inp, resize: "vertical" }} value={t.footerNote || ""} onChange={(e) => set({ footerNote: e.target.value })} placeholder="Questions? support@yourbiz.com" />
            </Field>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#0B1C24" }}>
              <input type="checkbox" checked={t.showLineItemDetail !== false} onChange={(e) => set({ showLineItemDetail: e.target.checked })} />
              Show itemized line-item detail
            </label>

            <div style={{ marginTop: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#5A7A8A", marginBottom: 6 }}>Use this template for</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {DOC_TYPES.map((d) => (
                  <label key={d} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#0B1C24", border: "1px solid #E2E8F0", borderRadius: 6, padding: "7px 10px", cursor: "pointer" }}>
                    <input type="checkbox" checked={assign.includes(d)} onChange={() => toggle(d)} />
                    {DOC_LABEL[d]}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Live preview */}
          <div style={{ background: "#f3f6f8", padding: 12, borderRadius: 8, alignSelf: "start" }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>Preview</div>
            <div style={{ background: "#fff", borderRadius: 6, overflow: "hidden", fontSize: 11, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
              <div style={{ padding: "14px 16px", background: accent, color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  {logo ? <img src={logo} alt="" style={{ height: 26, marginBottom: 6, background: "#fff", borderRadius: 3, padding: 2 }} onError={(e) => (e.currentTarget.style.display = "none")} /> : null}
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{brand.businessName || "Your Business"}</div>
                  <div style={{ fontSize: 10, opacity: 0.9 }}>{brand.email}{brand.email && brand.phone ? " · " : ""}{brand.phone}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: 1 }}>{assign[0] ? DOC_LABEL[assign[0] as DocType].toUpperCase() : "DOCUMENT"}</div>
                  <div style={{ fontSize: 10, opacity: 0.9 }}>{t.numberPrefix || "INV-"}00042</div>
                </div>
              </div>
              {t.headerNote ? <div style={{ padding: "8px 16px", fontSize: 10, color: "#5A7A8A" }}>{t.headerNote}</div> : null}
              <table style={{ width: "100%", fontSize: 10, borderCollapse: "collapse" }}>
                <thead style={{ background: accent, color: "#fff" }}>
                  <tr><th style={{ padding: "5px 12px", textAlign: "left" }}>Description</th><th style={{ padding: "5px 8px", textAlign: "right" }}>Amount</th></tr>
                </thead>
                <tbody>
                  {t.showLineItemDetail !== false ? (
                    <>
                      <tr style={{ borderBottom: "1px solid #f0f4f6" }}><td style={{ padding: "5px 12px" }}>Premium service package</td><td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "monospace" }}>$299.00</td></tr>
                      <tr style={{ borderBottom: "1px solid #f0f4f6" }}><td style={{ padding: "5px 12px" }}>Setup fee</td><td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "monospace" }}>$99.00</td></tr>
                    </>
                  ) : (
                    <tr style={{ borderBottom: "1px solid #f0f4f6" }}><td style={{ padding: "5px 12px" }}>Services rendered</td><td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "monospace" }}>$398.00</td></tr>
                  )}
                </tbody>
              </table>
              {t.paymentInstructions ? <div style={{ padding: "8px 16px", fontSize: 9, color: "#5A7A8A", borderTop: "1px solid #f0f4f6" }}>{t.paymentInstructions}</div> : null}
              {(t.terms || t.footerNote) && (
                <div style={{ padding: "8px 16px 12px", fontSize: 9, color: "#5A7A8A" }}>
                  {t.terms && <div><strong>Terms:</strong> {t.terms}</div>}
                  {t.footerNote && <div style={{ marginTop: 2 }}>{t.footerNote}</div>}
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ padding: "14px 22px", borderTop: "1px solid #E2E8F0", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={saving} disabled={!t.name.trim()}>
            {initial ? "Save template" : "Create template"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(11,28,36,0.5)", zIndex: 1100,
  display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
};
const modal: React.CSSProperties = {
  width: 900, maxWidth: "100%", maxHeight: "92vh", background: "#fff",
  borderRadius: 12, boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
  display: "flex", flexDirection: "column", overflow: "hidden",
};
const inp: React.CSSProperties = {
  width: "100%", padding: "7px 10px", fontSize: 12, boxSizing: "border-box",
  border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6, background: "#fff", color: "#0B1C24",
};
