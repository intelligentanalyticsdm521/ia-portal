// SparkAccountProfilePage — review-and-save business profile for SPARK.
//
// Mirrors OLIVER's onboarding step 1: the org/business profile lives in ONE
// shared platform record (core.tenants) reused by every product. This screen
// prefills from that shared record (nothing re-typed) and saves straight back
// to it, so core.tenants stays the single source of truth. Only "Send from
// email" is SPARK-local (the campaign sending identity).
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Check, ArrowRight, Info } from "lucide-react";

interface Profile {
  businessName: string | null;
  primaryContactEmail: string | null;
  primaryContactPhone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  stateProvince: string | null;
  postalCode: string | null;
  countryRegion: string | null;
  logoUrl: string | null;
  brandColor: string | null;
  websiteUrl: string | null;
  fromEmail: string | null;
}

type ProfileResp = { data: { profile: Profile; prefilled?: boolean; source?: string } };

const EMPTY: Profile = {
  businessName: "", primaryContactEmail: "", primaryContactPhone: "",
  addressLine1: "", addressLine2: "", city: "", stateProvince: "",
  postalCode: "", countryRegion: "", logoUrl: "", brandColor: "",
  websiteUrl: "", fromEmail: "",
};

function merge(p: Profile): Profile {
  const out = { ...EMPTY };
  (Object.keys(EMPTY) as (keyof Profile)[]).forEach((k) => {
    out[k] = (p[k] ?? "") as never;
  });
  return out;
}

export function SparkAccountProfilePage() {
  const { get, put, ready } = useSparkApi();
  const [form, setForm] = useState<Profile>(EMPTY);
  const [prefilled, setPrefilled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<ProfileResp>("/api/v1/account/profile");
      setForm(merge(r?.data?.profile || EMPTY));
      setPrefilled(!!r?.data?.prefilled);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready]);

  useEffect(() => { load(); }, [load]);

  const set = <K extends keyof Profile>(k: K, v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null); setSaved(false);
    try {
      const r = await put<ProfileResp>("/api/v1/account/profile", form);
      setForm(merge(r?.data?.profile || form));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) { setError(err); }
    finally { setSaving(false); }
  }

  return (
    <SparkPageShell
      title="Business profile"
      subtitle="Shared across every IADM product — entered once"
      help="This is your one shared business profile. OLIVER invoices, ARION reports, and SPARK emails all read it. Edit it here and the change flows everywhere — you never re-enter it per product."
      loading={loading}
      error={error}
    >
      <div className="max-w-2xl">
        {prefilled && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-sm text-emerald-800">
            <Check className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>
              We prefilled this from your shared organization profile. Review it,
              make any changes, and save — it stays the single source of truth
              for every product.
            </span>
          </div>
        )}

        <form onSubmit={save} className="space-y-5">
          <Section title="Business">
            <Row>
              <Field label="Business name">
                <input className="spark-input" value={form.businessName ?? ""}
                  onChange={(e) => set("businessName", e.target.value)} />
              </Field>
              <Field label="Website">
                <input className="spark-input" value={form.websiteUrl ?? ""}
                  onChange={(e) => set("websiteUrl", e.target.value)}
                  placeholder="https://" />
              </Field>
            </Row>
            <Row>
              <Field label="Contact email">
                <input className="spark-input" type="email" value={form.primaryContactEmail ?? ""}
                  onChange={(e) => set("primaryContactEmail", e.target.value)} />
              </Field>
              <Field label="Contact phone">
                <input className="spark-input" value={form.primaryContactPhone ?? ""}
                  onChange={(e) => set("primaryContactPhone", e.target.value)} />
              </Field>
            </Row>
          </Section>

          <Section title="Address">
            <Field label="Address line 1">
              <input className="spark-input" value={form.addressLine1 ?? ""}
                onChange={(e) => set("addressLine1", e.target.value)} />
            </Field>
            <Field label="Address line 2">
              <input className="spark-input" value={form.addressLine2 ?? ""}
                onChange={(e) => set("addressLine2", e.target.value)} />
            </Field>
            <Row>
              <Field label="City">
                <input className="spark-input" value={form.city ?? ""}
                  onChange={(e) => set("city", e.target.value)} />
              </Field>
              <Field label="State / Province">
                <input className="spark-input" value={form.stateProvince ?? ""}
                  onChange={(e) => set("stateProvince", e.target.value)} />
              </Field>
            </Row>
            <Row>
              <Field label="Postal code">
                <input className="spark-input" value={form.postalCode ?? ""}
                  onChange={(e) => set("postalCode", e.target.value)} />
              </Field>
              <Field label="Country / Region">
                <input className="spark-input" value={form.countryRegion ?? ""}
                  onChange={(e) => set("countryRegion", e.target.value)} />
              </Field>
            </Row>
          </Section>

          <Section title="Branding">
            <Row>
              <Field label="Brand color">
                <div className="flex items-center gap-2">
                  <input type="color" className="h-9 w-12 cursor-pointer rounded border border-slate-300"
                    value={/^#[0-9a-fA-F]{6}$/.test(form.brandColor || "") ? (form.brandColor as string) : "#1A3A4A"}
                    onChange={(e) => set("brandColor", e.target.value)} />
                  <input className="spark-input font-mono" value={form.brandColor ?? ""}
                    onChange={(e) => set("brandColor", e.target.value)} placeholder="#1A3A4A" />
                </div>
              </Field>
              <Field label="Logo URL">
                <input className="spark-input" value={form.logoUrl ?? ""}
                  onChange={(e) => set("logoUrl", e.target.value)} placeholder="https://" />
              </Field>
            </Row>
          </Section>

          <Section title="SPARK email sending">
            <Field label="Send from email">
              <input className="spark-input" type="email" value={form.fromEmail ?? ""}
                onChange={(e) => set("fromEmail", e.target.value)}
                placeholder="Defaults to your contact email" />
              <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                <Info className="h-3 w-3" /> SPARK-specific: the address campaigns send from. Everything else above is shared.
              </p>
            </Field>
          </Section>

          <div className="flex items-center gap-3 pt-1">
            <button type="submit" disabled={saving}
              className="spark-btn spark-btn-primary disabled:opacity-60">
              {saving ? "Saving…" : "Save profile"}
            </button>
            {saved && <span className="text-sm text-emerald-700 flex items-center gap-1"><Check className="h-4 w-4" /> Saved</span>}
            <Link to="/app/services/spark_onboarding"
              className="ml-auto text-sm text-slate-600 hover:text-slate-900 inline-flex items-center gap-1">
              Back to setup <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </form>
      </div>
    </SparkPageShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">{title}</div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      {children}
    </label>
  );
}

export default SparkAccountProfilePage;
