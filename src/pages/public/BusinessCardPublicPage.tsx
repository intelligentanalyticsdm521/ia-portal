import { useEffect, useState, useMemo } from "react";
import { useParams } from "react-router-dom";

// Public, no-auth route — anyone with the short_code can view this card.
// Renders a mobile-first "tap to add" page that:
//   - shows owner's logo + name + business + title + contact tiles
//   - displays the QR for re-share (rendered by LUMEN-API)
//   - exposes a "Save to contacts" button using an INLINE `data:text/vcard` URI
//     (iOS Safari + Android Chrome both open this directly — no file download)
//   - registers a dynamic PWA manifest so the owner can Add to Home Screen
//   - shows expandable iOS + Android instructions on how to install as a widget

interface CardData {
  short_code: string;
  kind: string;
  label: string;
  vcard_first_name: string | null;
  vcard_last_name: string | null;
  vcard_title: string | null;
  vcard_company: string | null;
  vcard_phone: string | null;
  vcard_email: string | null;
  vcard_website: string | null;
  vcard_address: string | null;
  vcard_logo_url: string | null;
}

const LUMEN_API_BASE = (import.meta as { env: { VITE_LUMEN_API_BASE?: string } }).env.VITE_LUMEN_API_BASE
  || "https://app-lumen-api-prod-c6afftekgua4axh9.centralus-01.azurewebsites.net";

function escVcard(v: string | null | undefined): string {
  return String(v || "").replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\r?\n/g, "\\n");
}

// Build the inline vCard text + data URI on the client. iOS Safari and Android
// Chrome both honor `data:text/vcard` URIs as direct "Add Contact" intents —
// no file download step. This sidesteps the LUMEN-API .vcf endpoint entirely.
function buildVcardDataUri(c: CardData): string {
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${escVcard(c.vcard_last_name)};${escVcard(c.vcard_first_name)};;;`,
    `FN:${escVcard([c.vcard_first_name, c.vcard_last_name].filter(Boolean).join(" "))}`,
    c.vcard_company && `ORG:${escVcard(c.vcard_company)}`,
    c.vcard_title && `TITLE:${escVcard(c.vcard_title)}`,
    c.vcard_phone && `TEL;TYPE=CELL,VOICE:${escVcard(c.vcard_phone)}`,
    c.vcard_email && `EMAIL;TYPE=INTERNET:${escVcard(c.vcard_email)}`,
    c.vcard_website && `URL:${escVcard(c.vcard_website)}`,
    c.vcard_address && `ADR;TYPE=WORK:;;${escVcard(c.vcard_address)};;;;`,
    c.vcard_logo_url && `PHOTO;VALUE=URI:${c.vcard_logo_url}`,
    "END:VCARD",
  ].filter(Boolean).join("\r\n") + "\r\n";
  return "data:text/vcard;charset=utf-8," + encodeURIComponent(lines);
}

export function BusinessCardPublicPage() {
  const { shortCode } = useParams<{ shortCode: string }>();
  const [data, setData] = useState<CardData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android">("ios");

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    setPlatform(/android/.test(ua) ? "android" : "ios");
  }, []);

  useEffect(() => {
    if (!shortCode) return;
    fetch(`${LUMEN_API_BASE}/api/v1/qr/card/${encodeURIComponent(shortCode)}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(j => setData(j.data))
      .catch(e => setErr(e.message || "Failed to load"));
  }, [shortCode]);

  // Dynamic PWA manifest — built per card from the data. SVG-data-URI icon so
  // we don't need to host PNG icons per card.
  const manifestUrl = useMemo(() => {
    if (!data) return null;
    const name = [data.vcard_first_name, data.vcard_last_name].filter(Boolean).join(" ") || data.label || "Business Card";
    const initials = (data.vcard_first_name?.[0] || "") + (data.vcard_last_name?.[0] || "");
    const iconSvg = data.vcard_logo_url
      ? null
      : `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'><rect width='512' height='512' rx='80' fill='%230F172A'/><rect x='72' y='72' width='368' height='368' rx='32' fill='white'/><g fill='%230F172A'><rect x='112' y='112' width='88' height='88'/><rect x='312' y='112' width='88' height='88'/><rect x='112' y='312' width='88' height='88'/><rect x='224' y='224' width='24' height='24'/><rect x='264' y='224' width='24' height='24'/><rect x='224' y='264' width='24' height='24'/><rect x='264' y='264' width='24' height='24'/></g><text x='256' y='460' font-family='-apple-system,Segoe UI,sans-serif' font-weight='700' font-size='40' fill='white' text-anchor='middle'>${initials.toUpperCase() || "QR"}</text></svg>`;
    const manifest = {
      name: `${name} — Card`,
      short_name: data.vcard_first_name || name.split(" ")[0] || "Card",
      start_url: `/card/${data.short_code}`,
      scope: `/card/${data.short_code}`,
      display: "standalone",
      background_color: "#0F172A",
      theme_color: "#0F172A",
      icons: [
        data.vcard_logo_url
          ? { src: data.vcard_logo_url, sizes: "any", type: "image/png", purpose: "any" }
          : { src: `data:image/svg+xml;utf8,${iconSvg}`, sizes: "512x512", type: "image/svg+xml", purpose: "any maskable" },
      ],
    };
    const blob = new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" });
    return URL.createObjectURL(blob);
  }, [data]);

  useEffect(() => {
    if (!manifestUrl) return;
    const existing = document.querySelector('link[rel="manifest"]');
    const link = existing || document.createElement("link");
    link.setAttribute("rel", "manifest");
    link.setAttribute("href", manifestUrl);
    if (!existing) document.head.appendChild(link);
    return () => { URL.revokeObjectURL(manifestUrl); };
  }, [manifestUrl]);

  useEffect(() => {
    const themeColor = document.querySelector('meta[name="theme-color"]') || document.createElement("meta");
    themeColor.setAttribute("name", "theme-color");
    themeColor.setAttribute("content", "#0F172A");
    if (!themeColor.parentElement) document.head.appendChild(themeColor);
  }, []);

  useEffect(() => {
    if (!data) return;
    const name = [data.vcard_first_name, data.vcard_last_name].filter(Boolean).join(" ") || data.label || "Business Card";
    document.title = `${name} — Card`;
  }, [data]);

  if (err) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif", color: "#475569" }}>
        Card not found.
      </div>
    );
  }
  if (!data) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif", color: "#94a3b8" }}>
        Loading…
      </div>
    );
  }

  const fullName = [data.vcard_first_name, data.vcard_last_name].filter(Boolean).join(" ");
  const qrSrc = `${LUMEN_API_BASE}/api/v1/qr/render/${encodeURIComponent(data.short_code)}.svg`;
  const vcardUri = buildVcardDataUri(data);
  const filename = (fullName.replace(/[^a-z0-9-_]+/gi, "-") || "contact") + ".vcf";

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #0F172A 0%, #1E293B 100%)",
      color: "#F8FAFC",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      padding: "32px 20px env(safe-area-inset-bottom,32px)",
      boxSizing: "border-box",
    }}>
      <div style={{ maxWidth: 420, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>

        {data.vcard_logo_url && (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <img src={data.vcard_logo_url} alt="" style={{ width: 96, height: 96, objectFit: "contain", borderRadius: 16, background: "white", padding: 8 }} />
          </div>
        )}

        <div style={{ textAlign: "center" }}>
          {fullName && <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>{fullName}</h1>}
          {data.vcard_title && <div style={{ fontSize: 15, color: "#CBD5E1", marginTop: 4 }}>{data.vcard_title}</div>}
          {data.vcard_company && <div style={{ fontSize: 16, color: "#94A3B8", marginTop: 8, fontWeight: 500 }}>{data.vcard_company}</div>}
        </div>

        <div style={{ background: "white", borderRadius: 20, padding: 18, boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)" }}>
          <img src={qrSrc} alt="QR code" style={{ width: "100%", height: "auto", display: "block" }} />
        </div>

        <a href={vcardUri} download={filename} style={{
          display: "block", background: "#EF6C33", color: "white", textAlign: "center",
          padding: "16px 20px", borderRadius: 12, fontWeight: 600, fontSize: 16,
          textDecoration: "none", boxShadow: "0 10px 25px -5px rgba(239,108,51,0.5)",
        }}>
          Save to contacts
        </a>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 15 }}>
          {data.vcard_phone && (
            <a href={`tel:${data.vcard_phone}`} style={tile()}>
              <span style={tileLabel()}>Phone</span>
              <span style={tileValue()}>{data.vcard_phone}</span>
            </a>
          )}
          {data.vcard_email && (
            <a href={`mailto:${data.vcard_email}`} style={tile()}>
              <span style={tileLabel()}>Email</span>
              <span style={tileValue()}>{data.vcard_email}</span>
            </a>
          )}
          {data.vcard_website && (
            <a href={data.vcard_website.startsWith("http") ? data.vcard_website : `https://${data.vcard_website}`}
               target="_blank" rel="noreferrer" style={tile()}>
              <span style={tileLabel()}>Website</span>
              <span style={tileValue()}>{data.vcard_website}</span>
            </a>
          )}
          {data.vcard_address && (
            <a href={`https://maps.google.com/?q=${encodeURIComponent(data.vcard_address)}`}
               target="_blank" rel="noreferrer" style={tile()}>
              <span style={tileLabel()}>Address</span>
              <span style={tileValue()}>{data.vcard_address}</span>
            </a>
          )}
        </div>

        {/* Owner: how to keep this card one tap away on your phone. */}
        <div style={{ border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, background: "rgba(255,255,255,.04)", padding: "14px 16px" }}>
          <button
            type="button"
            onClick={() => setShowInstall(s => !s)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
              background: "transparent", border: 0, color: "#F8FAFC", padding: 0,
              fontSize: 14, fontWeight: 600, cursor: "pointer", textAlign: "left",
            }}
          >
            <span>📱 Add this card to your phone home screen</span>
            <span style={{ color: "#94A3B8" }}>{showInstall ? "−" : "+"}</span>
          </button>
          {showInstall && (
            <div style={{ marginTop: 12, fontSize: 13, color: "#CBD5E1", lineHeight: 1.6 }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                <button onClick={() => setPlatform("ios")} style={tabBtn(platform === "ios")}>iPhone</button>
                <button onClick={() => setPlatform("android")} style={tabBtn(platform === "android")}>Android</button>
              </div>
              {platform === "ios" ? (
                <ol style={{ margin: 0, paddingLeft: 18 }}>
                  <li>Make sure you're in Safari (not Chrome on iPhone).</li>
                  <li>Tap the <strong>Share</strong> icon (square with ↑) at the bottom.</li>
                  <li>Scroll down → tap <strong>Add to Home Screen</strong>.</li>
                  <li>Tap <strong>Add</strong> (top right). Done.</li>
                </ol>
              ) : (
                <ol style={{ margin: 0, paddingLeft: 18 }}>
                  <li>Open in Chrome.</li>
                  <li>Tap the <strong>⋮ menu</strong> (top right).</li>
                  <li>Tap <strong>Install app</strong> (or "Add to Home screen").</li>
                  <li>If the icon doesn't appear: long-press a blank spot on your home screen → <strong>Home settings</strong> → enable <strong>"Add app icons to Home screen"</strong>, then retry.</li>
                </ol>
              )}
            </div>
          )}
        </div>

        <div style={{ textAlign: "center", color: "#64748B", fontSize: 11, marginTop: 4 }}>
          Powered by SPARK
        </div>

      </div>
    </div>
  );
}

function tile(): React.CSSProperties {
  return {
    display: "flex", flexDirection: "column", gap: 2,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    padding: "12px 16px",
    borderRadius: 12,
    color: "#F8FAFC",
    textDecoration: "none",
  };
}
function tileLabel(): React.CSSProperties {
  return { fontSize: 11, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 };
}
function tileValue(): React.CSSProperties {
  return { fontSize: 15, color: "#F8FAFC", fontWeight: 500, wordBreak: "break-word" };
}
function tabBtn(active: boolean): React.CSSProperties {
  return {
    padding: "6px 12px", borderRadius: 8, border: 0, cursor: "pointer",
    background: active ? "#EF6C33" : "rgba(255,255,255,.08)",
    color: active ? "white" : "#CBD5E1",
    fontSize: 12, fontWeight: 600,
  };
}

export default BusinessCardPublicPage;
