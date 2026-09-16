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
// THE brand kit. The colour and the fonts come from here now; /settings still
// supplies the contact line and /settings/invoice-template the document's own
// logo/accent override, which deliberately still beats the kit
// (BUILDER_PLATFORM_SCOPE_2026-09-15 §2, step 0).
import { useBrandKit } from "../../brand/BrandKitProvider";
import { fontStack } from "../../lib/brandKit";

interface BrandData {
  businessName: string;
  email?: string;
  phone?: string;
  website?: string;
  logoUrl?: string | null;
  accentColor: string;
  footerNote?: string;
  /** Chosen in Brand Identity. Captured since 2026-06-24 but consumed by
      nothing until now, so picking a font changed no pixel anywhere. */
  headingFont?: string | null;
  bodyFont?: string | null;
}

/**
 * What the frame shows before anything has loaded. The accent used to be
 * "#1A7DB5" — a FIFTH brand colour that belongs to nobody, not even us, and
 * that a client could see on their own proposal with no idea where it came
 * from. There is no colour here at all now: the kit supplies it, and the kit
 * is the platform neutral until the business's own is loaded.
 */
const FALLBACK_NAME = "Your business";

export function DocumentBrandFrame({
  get, docLabel, docNumber, children,
}: {
  get: <T>(p: string) => Promise<T>;
  /** "QUOTE" | "PROPOSAL" | "INVOICE" — the document's own name, top right. */
  docLabel: string;
  docNumber?: string | null;
  children: ReactNode;
}) {
  // ONE fetch for the whole shell, shared with every other builder on screen,
  // and it repaints the moment Brand Identity saves — that live round trip is
  // the walk row (GAP_SPRINT_WALK BK-3).
  const { kit } = useBrandKit();
  const [brand, setBrand] = useState<BrandData | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [settings, tpl] = await Promise.all([
          get<{ tenantName?: string; tenantFullName?: string; email?: string; phone?: string; website?: string; logoUrl?: string | null; headingFont?: string | null; bodyFont?: string | null }>("/settings"),
          get<{ logoUrl: string | null; accentColor: string; footerNote: string }>("/settings/invoice-template"),
        ]);
        if (cancelled) return;
        setBrand({
          businessName: settings.tenantFullName || settings.tenantName || FALLBACK_NAME,
          email: settings.email,
          phone: settings.phone,
          website: settings.website,
          // The invoice template's logo wins (it is the document logo); the
          // business profile logo is the fallback.
          logoUrl: tpl.logoUrl || settings.logoUrl || null,
          // The document template override wins (it is the DOCUMENT accent a
          // business set for its paperwork); the kit is behind it. Neither is
          // a literal any more.
          accentColor: tpl.accentColor || kit.colours.primary,
          footerNote: tpl.footerNote,
          headingFont: settings.headingFont || kit.fonts.heading,
          bodyFont: settings.bodyFont || kit.fonts.body,
        });
      } catch {
        // The editor must not be blocked by a branding fetch — render the
        // frame on the kit alone rather than nothing. Degraded, but still the
        // business's own colour, never a stray blue.
        if (!cancelled) setBrand({ businessName: FALLBACK_NAME, accentColor: kit.colours.primary });
      }
    })();
    return () => { cancelled = true; };
  }, [get, kit]);

  const b: BrandData = brand || { businessName: FALLBACK_NAME, accentColor: kit.colours.primary };
  const contact = [b.email, b.phone, b.website].filter(Boolean).join("  ·  ");
  // Same stack the public proposal page uses, so the editor is honest about
  // what the customer will actually see.
  const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  // The catalog the kit carries knows each face's real CSS stack, so the
  // editor renders what the sent document renders instead of guessing one.
  const headingFamily = b.headingFont ? `'${b.headingFont}', ${SANS}` : fontStack(kit, "heading");
  const bodyFamily = b.bodyFont ? `'${b.bodyFont}', ${SANS}` : fontStack(kit, "body");

  return (
    <div style={{
      background: "#fff", borderRadius: 8, overflow: "hidden",
      border: "1px solid #E2E8F0", boxShadow: "0 1px 4px rgba(11,28,36,0.08)",
      fontFamily: bodyFamily,
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
            <div style={{ fontSize: 17, fontWeight: 700, color: "#0B1C24", lineHeight: 1.2, fontFamily: headingFamily }}>{b.businessName}</div>
            {contact && <div style={{ fontSize: 10, color: "#5A7A8A", marginTop: 2 }}>{contact}</div>}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 2, color: b.accentColor, fontFamily: headingFamily }}>{docLabel}</div>
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
