// DocumentBrandFrame — edit the document ON the document.
//
// Founder 2026-08-19: "show the real fucking branded style that it is going to
// look like in the quote/invoice send... for mine it would have like my logo
// and name and whatnot. Like I just want to see what it's going to look like
// while it's being edited."
//
// So this renders the SAME chrome the sent document carries — accent bar, logo,
// business name and contact line up top, footer note at the bottom — and the
// editor's fields sit inside it. Branding comes from the one place it is
// configured: Business Setup's invoice template plus the business profile.
// Nothing here is a mock; if the logo is missing on the page, it is missing in
// Business Setup, which is exactly the prompt to go set it.
import { useEffect, useState, type ReactNode } from "react";

interface BrandData {
  businessName: string;
  email?: string;
  phone?: string;
  website?: string;
  logoUrl?: string | null;
  accentColor: string;
  footerNote?: string;
}

const FALLBACK: BrandData = { businessName: "Your business", accentColor: "#1A7DB5" };

export function DocumentBrandFrame({
  get, docLabel, docNumber, children,
}: {
  get: <T>(p: string) => Promise<T>;
  /** "QUOTE" | "PROPOSAL" | "INVOICE" — the document's own name, top right. */
  docLabel: string;
  docNumber?: string | null;
  children: ReactNode;
}) {
  const [brand, setBrand] = useState<BrandData | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [settings, tpl] = await Promise.all([
          get<{ tenantName?: string; tenantFullName?: string; email?: string; phone?: string; website?: string; logoUrl?: string | null }>("/settings"),
          get<{ logoUrl: string | null; accentColor: string; footerNote: string }>("/settings/invoice-template"),
        ]);
        if (cancelled) return;
        setBrand({
          businessName: settings.tenantFullName || settings.tenantName || FALLBACK.businessName,
          email: settings.email,
          phone: settings.phone,
          website: settings.website,
          // The invoice template's logo wins (it is the document logo); the
          // business profile logo is the fallback.
          logoUrl: tpl.logoUrl || settings.logoUrl || null,
          accentColor: tpl.accentColor || FALLBACK.accentColor,
          footerNote: tpl.footerNote,
        });
      } catch {
        // The editor must not be blocked by a branding fetch — render the
        // frame with fallbacks rather than nothing.
        if (!cancelled) setBrand(FALLBACK);
      }
    })();
    return () => { cancelled = true; };
  }, [get]);

  const b = brand || FALLBACK;
  const contact = [b.email, b.phone, b.website].filter(Boolean).join("  ·  ");

  return (
    <div style={{
      background: "#fff", borderRadius: 8, overflow: "hidden",
      border: "1px solid #E2E8F0", boxShadow: "0 1px 4px rgba(11,28,36,0.08)",
    }}>
      {/* Accent bar — the first thing the customer's eye hits on the sent doc. */}
      <div style={{ height: 6, background: b.accentColor }} />

      {/* Branded header, exactly as the send renders it. */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "18px 24px 14px", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          {b.logoUrl && (
            <img src={b.logoUrl} alt="" style={{ height: 44, maxWidth: 140, objectFit: "contain" }} />
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#0B1C24", lineHeight: 1.2 }}>{b.businessName}</div>
            {contact && <div style={{ fontSize: 10, color: "#5A7A8A", marginTop: 2 }}>{contact}</div>}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 2, color: b.accentColor }}>{docLabel}</div>
          {docNumber && <div style={{ fontSize: 11, color: "#5A7A8A", fontFamily: "monospace" }}>{docNumber}</div>}
        </div>
      </div>

      <div style={{ borderTop: `2px solid ${b.accentColor}22`, padding: "18px 24px" }}>
        {children}
      </div>

      {/* Footer, as sent. */}
      <div style={{ borderTop: "1px solid #E2E8F0", padding: "10px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 10, color: "#8AA6B4" }}>{b.footerNote || " "}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: b.accentColor }}>{b.businessName}</span>
      </div>
    </div>
  );
}
