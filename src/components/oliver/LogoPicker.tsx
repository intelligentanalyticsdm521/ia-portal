// LogoPicker — three ways to set the shared brand logo:
//   1. Upload a file (base64 → POST /settings/logo → blob → core.tenants.logo_url)
//   2. Pull from the business website (GET /settings/logo/suggestions)
//   3. Paste a URL directly
//
// The resolved URL is the SHARED platform logo (core.tenants.logo_url) — the
// same value OLIVER invoices, ARION, and the customer portal all read. The
// parent decides when/if to persist via PATCH /settings; upload persists
// immediately server-side and returns the hosted URL.
import { useId, useRef, useState } from "react";
import { Button } from "./ui";

interface Api {
  get: <T>(p: string) => Promise<T>;
  post: <T>(p: string, body?: unknown) => Promise<T>;
}

interface Props {
  value: string | null;
  onChange: (url: string | null) => void;
  api: Api;
  /** Tenant website — enables the "from website" tab when present. */
  website?: string | null;
}

type Tab = "upload" | "website" | "url";

const ACCEPT = "image/png,image/jpeg,image/svg+xml,image/webp,image/gif";
const MAX_BYTES = 1_500_000;

function readAsBase64(file: File): Promise<{ contentType: string; dataBase64: string }> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("Could not read file"));
    fr.onload = () => {
      const res = String(fr.result || "");
      const m = /^data:([^;]+);base64,(.*)$/s.exec(res);
      if (!m) return reject(new Error("Unexpected file encoding"));
      resolve({ contentType: m[1], dataBase64: m[2] });
    };
    fr.readAsDataURL(file);
  });
}

export function LogoPicker({ value, onChange, api, website }: Props) {
  const [tab, setTab] = useState<Tab>("upload");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState(value || "");
  const [candidates, setCandidates] = useState<Array<{ url: string; label: string }> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  async function handleFile(file: File) {
    setErr(null);
    if (file.size > MAX_BYTES) {
      setErr("That file is larger than 1.5MB. Please use a smaller logo.");
      return;
    }
    setBusy(true);
    try {
      const { contentType, dataBase64 } = await readAsBase64(file);
      const r = await api.post<{ logoUrl: string }>("/settings/logo", {
        filename: file.name, contentType, dataBase64,
      });
      onChange(r.logoUrl);
    } catch (e) {
      setErr((e as Error).message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function loadSuggestions() {
    setErr(null); setBusy(true); setCandidates(null);
    try {
      const r = await api.get<{ website: string; candidates: Array<{ url: string; label: string }> }>(
        `/settings/logo/suggestions${website ? `?website=${encodeURIComponent(website)}` : ""}`
      );
      setCandidates(r.candidates || []);
      if (!r.candidates?.length) setErr("No logo candidates found on that site. Try upload or paste a URL.");
    } catch (e) {
      setErr((e as Error).message || "Couldn't read the website");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ border: "1px solid rgba(45,156,219,0.28)", borderRadius: 8, padding: 14, background: "#fff" }}>
      {/* Current logo preview */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
        <div style={{
          width: 92, height: 64, borderRadius: 6, border: "1px dashed #CBD8DE",
          background: "#F8FAFC", display: "flex", alignItems: "center", justifyContent: "center",
          overflow: "hidden", flexShrink: 0,
        }}>
          {value ? (
            <img src={value} alt="Logo" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
              onError={(e) => { (e.currentTarget.style.display = "none"); }} />
          ) : (
            <span style={{ fontSize: 10, color: "#94A3B8" }}>No logo</span>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>Brand logo</div>
          <div style={{ fontSize: 11, color: "#5A7A8A", lineHeight: 1.5 }}>
            Shared across OLIVER invoices, ARION, and your customer portal. Set it once.
          </div>
          {value && (
            <button
              onClick={() => { onChange(null); setUrlDraft(""); }}
              style={{ marginTop: 4, fontSize: 11, color: "#B91C1C", background: "none", border: 0, padding: 0, cursor: "pointer" }}
            >
              Remove logo
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12, background: "#F1F5F9", padding: 3, borderRadius: 7, width: "fit-content" }}>
        {([
          ["upload", "Upload"],
          ["website", "From website"],
          ["url", "Paste URL"],
        ] as [Tab, string][]).map(([k, label]) => (
          <button
            key={k}
            onClick={() => { setTab(k); setErr(null); }}
            disabled={k === "website" && !website}
            title={k === "website" && !website ? "Add your website first" : undefined}
            style={{
              fontSize: 11, fontWeight: 600, padding: "5px 12px", borderRadius: 5, border: 0,
              cursor: k === "website" && !website ? "not-allowed" : "pointer",
              opacity: k === "website" && !website ? 0.5 : 1,
              background: tab === k ? "#fff" : "transparent",
              color: tab === k ? "#0B1C24" : "#5A7A8A",
              boxShadow: tab === k ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {err && (
        <div style={{ padding: "7px 10px", marginBottom: 10, fontSize: 11, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 6 }}>
          {err}
        </div>
      )}

      {tab === "upload" && (
        <div>
          {/* Native <label htmlFor> opens the file dialog with zero JS — the
              previous div+programmatic .click() didn't fire reliably inside
              the modal. Drag/drop kept on the same label. */}
          <input
            id={inputId}
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            style={{ position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden", clip: "rect(0 0 0 0)" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
          />
          <label
            htmlFor={inputId}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f && !busy) handleFile(f); }}
            style={{
              display: "block", border: "1.5px dashed #CBD8DE", borderRadius: 8, padding: "20px 16px",
              textAlign: "center", cursor: busy ? "wait" : "pointer", background: "#F8FAFC",
            }}
          >
            <span style={{
              display: "inline-block", marginBottom: 8, padding: "6px 14px", borderRadius: 6,
              background: "#0C4A60", color: "#fff", fontSize: 12, fontWeight: 600,
            }}>
              {busy ? "Uploading…" : "Choose file"}
            </span>
            <div style={{ fontSize: 11, color: "#5A7A8A" }}>…or drag &amp; drop here</div>
            <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 3 }}>
              PNG, JPG, SVG, WEBP or GIF · up to 1.5MB
            </div>
          </label>
        </div>
      )}

      {tab === "website" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: "#5A7A8A", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              Scan {website || "your website"} for logos & icons
            </span>
            <Button variant="secondary" size="sm" onClick={loadSuggestions} loading={busy} disabled={busy}>
              {candidates ? "Rescan" : "Find logos"}
            </Button>
          </div>
          {candidates && candidates.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 8 }}>
              {candidates.map((c) => {
                const selected = value === c.url;
                return (
                  <button
                    key={c.url}
                    onClick={() => onChange(c.url)}
                    title={c.label}
                    style={{
                      border: `2px solid ${selected ? "#0C4A60" : "#E2E8F0"}`,
                      borderRadius: 6, padding: 6, background: "#fff", cursor: "pointer",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                    }}
                  >
                    <div style={{ height: 46, display: "flex", alignItems: "center", justifyContent: "center", width: "100%" }}>
                      <img src={c.url} alt={c.label}
                        style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                        onError={(e) => { e.currentTarget.parentElement!.parentElement!.style.display = "none"; }} />
                    </div>
                    <span style={{ fontSize: 9, color: selected ? "#0C4A60" : "#94A3B8", fontWeight: selected ? 700 : 500 }}>
                      {selected ? "Selected" : c.label.slice(0, 18)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "url" && (
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="url"
            placeholder="https://yourdomain.com/logo.png"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            style={{
              flex: 1, padding: "7px 10px", fontSize: 12, borderRadius: 6,
              border: "1px solid rgba(45,156,219,0.28)", background: "#fff", color: "#0B1C24",
            }}
          />
          <Button variant="secondary" onClick={() => onChange(urlDraft.trim() || null)} disabled={!urlDraft.trim()}>
            Use this
          </Button>
        </div>
      )}
    </div>
  );
}
