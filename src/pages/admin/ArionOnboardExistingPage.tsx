/**
 * Founder admin — onboard an ARION client whose site was built outside the
 * standard signup flow (manual Hostinger Kodee build, migration from another
 * host, etc.). Calls lumen-api /admin/arion-onboard-existing which proxies to
 * arion-api with the FOUNDER_ADMIN_TOKEN (kept server-side).
 *
 * Single-screen form. No Stripe coupon, no multi-platform — narrow scope: get
 * a tenant + arion.site + provision code + welcome email out the door.
 */

import { useState } from "react";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { PageHeader, Button } from "../../components/oliver/ui";
import { useOliverApi } from "../../hooks/useOliverApi";

interface OnboardResult {
  tenant_id: string;
  site_id: string;
  domain: string;
  provision_code: string;
  plugin_download_url: string;
  wp_admin_url: string;
  steps: Array<{ step: string; status: string; detail: string }>;
  handoff: {
    arion?: {
      site_url: string;
      site_id: string;
      plugin_install_link: string;
      activation_email_sent: boolean;
    };
  };
}

export function ArionOnboardExistingPage() {
  const { post } = useOliverApi();
  const [form, setForm] = useState({
    name: "",
    brandName: "",
    email: "",
    firstName: "",
    lastName: "",
    domain: "",
    tier: "standard",
    wpAdminUrl: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<OnboardResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      // 2026-09-01 — useOliverApi unwraps; reading .data gave undefined, so a
      // successful onboard showed no result at all.
      const r = await post<OnboardResult>("/admin/arion-onboard-existing", {
        ...form,
        // brandName falls back to legal name if blank
        brandName: form.brandName.trim() || form.name.trim(),
      });
      setResult(r);
    } catch (e) {
      setError((e as Error).message || "Onboarding failed");
    } finally {
      setBusy(false);
    }
  };

  const valid = form.name.trim() && form.email.trim() && form.domain.trim();

  return (
    <OliverPageWrapper title="Onboard existing ARION client" subtitle="Manual onboarding for sites built outside the standard flow" error={error} loading={busy}>
      <PageHeader
        title="Onboard existing ARION client"
        subtitle="For clients whose WordPress site was built manually (e.g., Hostinger Kodee) or migrated from elsewhere. Creates tenant + ARION site row + provisioning code + sends welcome email with IA Plugin install link."
      />

      {result ? (
        <div className="card" style={{ background: "#D1FAE5", border: "1px solid #6EE7B7" }}>
          <h3 className="card-ttl" style={{ marginTop: 0 }}>✓ Onboarded {form.name}</h3>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: "#065F46" }}>
            <p><strong>Tenant ID:</strong> <code>{result.tenant_id}</code></p>
            <p><strong>Site ID:</strong> <code>{result.site_id}</code></p>
            <p><strong>Domain:</strong> {result.domain}</p>
            <p><strong>WP admin URL:</strong> <a href={result.wp_admin_url} target="_blank" rel="noreferrer">{result.wp_admin_url}</a></p>
            <p>
              <strong>IA Plugin install link (send to customer if email failed):</strong><br />
              <input
                className="ia-input"
                readOnly
                value={result.plugin_download_url}
                style={{ width: "100%", fontFamily: "monospace", fontSize: 12 }}
              />
            </p>
            <p><strong>Welcome email:</strong> {result.handoff.arion?.activation_email_sent ? "✓ Sent" : "✗ Failed — copy plugin link above"}</p>
          </div>
          <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: "pointer", fontSize: 13 }}>View steps log</summary>
            <ul style={{ fontSize: 12, marginTop: 8 }}>
              {result.steps.map((s, i) => (
                <li key={i}><code>{s.step}</code>: <strong>{s.status}</strong> — {s.detail}</li>
              ))}
            </ul>
          </details>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <Button variant="primary" onClick={() => { setResult(null); setForm({ name: "", brandName: "", email: "", firstName: "", lastName: "", domain: "", tier: "standard", wpAdminUrl: "" }); }}>
              Onboard another
            </Button>
          </div>
        </div>
      ) : (
        <div className="card">
          {error && (
            <div style={{ background: "#FEE2E2", color: "#7F1D1D", padding: 12, borderRadius: 8, marginBottom: 16 }}>
              {error}
            </div>
          )}
          <div style={{ display: "grid", gap: 14 }}>
            <Field label="Tenant legal name *">
              <input className="ia-input" value={form.name} onChange={set("name")} placeholder="Acme Plumbing LLC" />
            </Field>
            <Field label="Brand name (public-facing, optional)">
              <input className="ia-input" value={form.brandName} onChange={set("brandName")} placeholder="Acme Plumbing — uses legal name if blank" />
            </Field>
            <Field label="Customer email *">
              <input className="ia-input" type="email" value={form.email} onChange={set("email")} placeholder="owner@acme-plumbing.com" />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="First name">
                <input className="ia-input" value={form.firstName} onChange={set("firstName")} />
              </Field>
              <Field label="Last name">
                <input className="ia-input" value={form.lastName} onChange={set("lastName")} />
              </Field>
            </div>
            <Field label="Domain *">
              <input className="ia-input" value={form.domain} onChange={set("domain")} placeholder="acme-plumbing.com" />
            </Field>
            <Field label="WP admin URL (optional)">
              <input className="ia-input" value={form.wpAdminUrl} onChange={set("wpAdminUrl")} placeholder="Defaults to https://<domain>/wp-admin/" />
            </Field>
            <Field label="ARION tier">
              <select className="ia-input" value={form.tier} onChange={set("tier")}>
                <option value="lite">Lite</option>
                <option value="standard">Standard</option>
                <option value="pro">Pro</option>
                <option value="business">Business</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </Field>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <Button variant="primary" onClick={submit} disabled={!valid || busy}>
              {busy ? "Onboarding…" : "Onboard client"}
            </Button>
          </div>
        </div>
      )}
    </OliverPageWrapper>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 600, color: "#1A3A4A", display: "block", marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

export default ArionOnboardExistingPage;
