/**
 * OliverAddonsPage — manage SMS Add-on subscriptions (and future Apps tier).
 *
 * Reads catalog from oliver-api /addons/catalog and tenant's current
 * subscriptions from /addons/subscriptions. Subscribe via Stripe Checkout
 * (POST /addons/subscribe → redirect to Stripe Checkout); cancel at period
 * end via POST /addons/cancel/:key.
 *
 * If a Stripe Price ID isn't configured for an add-on, the "Subscribe"
 * button is disabled with a tooltip pointing the founder at the env var
 * that needs setting.
 */
import { useCallback, useEffect, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { PageHeader, Button } from "../../components/oliver/ui";
import { MessageSquare, Check, ExternalLink } from "lucide-react";

interface AddonCatalogEntry {
  key: string;
  family: string;
  tier: string;
  name: string;
  price_monthly: number;
  included_units: number;
  unit_label: string;
  overage_per_unit: number;
  description: string;
  stripe_price_configured: boolean;
}

interface AddonSubscription {
  addon_key: string;
  is_active: boolean;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  included_units: number | null;
  used_units_this_period: number;
}

export function OliverAddonsPage() {
  const { get, post, ready } = useOliverApi();
  const [catalog, setCatalog] = useState<AddonCatalogEntry[]>([]);
  const [subs, setSubs] = useState<AddonSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [c, s] = await Promise.all([
        get<AddonCatalogEntry[]>("/addons/catalog"),
        get<AddonSubscription[]>("/addons/subscriptions"),
      ]);
      setCatalog(c || []);
      setSubs(s || []);
    } catch (e) { setError(e); }
    finally { setLoading(false); }
  }, [get]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  async function subscribe(addonKey: string) {
    setBusy(addonKey);
    try {
      const r = await post<{ checkout_url: string; session_id: string }>(
        "/addons/subscribe",
        { addon_key: addonKey }
      );
      // Redirect to Stripe Checkout
      window.location.href = r.checkout_url;
    } catch (e) {
      alert(`Subscribe failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally { setBusy(null); }
  }

  async function cancel(addonKey: string) {
    if (!confirm(`Cancel ${addonKey} at the end of the current billing period? You'll keep access until then.`)) return;
    setBusy(addonKey);
    try {
      await post(`/addons/cancel/${addonKey}`);
      reload();
    } catch (e) {
      alert(`Cancel failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally { setBusy(null); }
  }

  // Group by family — SMS first, future Apps below
  const smsCatalog = catalog.filter((a) => a.family === "sms");
  const otherCatalog = catalog.filter((a) => a.family !== "sms");
  const activeKeys = new Set(subs.filter((s) => s.is_active).map((s) => s.addon_key));

  return (
    <OliverPageWrapper title="Add-ons" subtitle="SMS, Apps, and future extras" error={error} loading={loading && !catalog.length}>
      <PageHeader
        title="Add-ons"
        subtitle="Stack these on top of your OLIVER plan. Each is its own opt-in subscription."
      />

      <FamilySection
        family="SMS"
        icon={<MessageSquare className="h-5 w-5" />}
        intro="Send booking confirmations, 24h reminders, on-the-way alerts, and overdue invoice texts. Decoupled from SPARK marketing SMS — different products, different counters."
        catalog={smsCatalog}
        activeKeys={activeKeys}
        subs={subs}
        busy={busy}
        onSubscribe={subscribe}
        onCancel={cancel}
      />

      {otherCatalog.length > 0 && (
        <FamilySection
          family="Other"
          intro=""
          catalog={otherCatalog}
          activeKeys={activeKeys}
          subs={subs}
          busy={busy}
          onSubscribe={subscribe}
          onCancel={cancel}
        />
      )}

      {!catalog.length && !loading && (
        <div className="card" style={{ padding: 24, textAlign: "center", color: "#5A7A8A" }}>
          No add-ons available yet.
        </div>
      )}
    </OliverPageWrapper>
  );
}

function FamilySection({
  family, icon, intro, catalog, activeKeys, subs, busy, onSubscribe, onCancel,
}: {
  family: string;
  icon?: React.ReactNode;
  intro: string;
  catalog: AddonCatalogEntry[];
  activeKeys: Set<string>;
  subs: AddonSubscription[];
  busy: string | null;
  onSubscribe: (k: string) => void;
  onCancel: (k: string) => void;
}) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        {icon && <span style={{ color: "#5A7A8A" }}>{icon}</span>}
        <div className="card-ttl">{family}</div>
      </div>
      {intro && <div className="card-sub" style={{ marginBottom: 16 }}>{intro}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
        {catalog.map((a) => {
          const isActive = activeKeys.has(a.key);
          const sub = subs.find((s) => s.addon_key === a.key);
          return (
            <AddonCard
              key={a.key} addon={a} sub={sub} isActive={isActive}
              busy={busy === a.key}
              onSubscribe={() => onSubscribe(a.key)}
              onCancel={() => onCancel(a.key)}
            />
          );
        })}
      </div>
    </div>
  );
}

function AddonCard({
  addon, sub, isActive, busy, onSubscribe, onCancel,
}: {
  addon: AddonCatalogEntry;
  sub?: AddonSubscription;
  isActive: boolean;
  busy: boolean;
  onSubscribe: () => void;
  onCancel: () => void;
}) {
  return (
    <div style={{
      border: isActive ? "2px solid #FEC82C" : "1px solid #E5E7EB",
      borderRadius: 8, padding: 14, background: isActive ? "#FFFBEB" : "#fff",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0B1C24" }}>{addon.name}</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#1A3A4A", marginTop: 4, fontFamily: "monospace" }}>
            ${addon.price_monthly.toFixed(2)}
            <span style={{ fontSize: 11, color: "#5A7A8A", fontWeight: 500 }}> /mo</span>
          </div>
        </div>
        {isActive && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 999, background: "#10B981", color: "#fff", fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>
            <Check size={10} /> Active
          </span>
        )}
      </div>
      <div style={{ fontSize: 12, color: "#5A7A8A", marginTop: 8, lineHeight: 1.5 }}>
        {addon.description}
      </div>
      <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 8, paddingTop: 8, borderTop: "1px solid #F1F5F9" }}>
        <div><strong>{addon.included_units.toLocaleString()}</strong> {addon.unit_label} included</div>
        <div>Overage: <strong>${addon.overage_per_unit.toFixed(3)}</strong> per {addon.unit_label.split("/")[0].trim().toLowerCase()}</div>
        {isActive && sub?.used_units_this_period != null && addon.included_units && (
          <div style={{ marginTop: 4 }}>
            Usage this period: <strong>{sub.used_units_this_period.toLocaleString()}</strong> / {addon.included_units.toLocaleString()}
          </div>
        )}
        {isActive && sub?.current_period_end && (
          <div style={{ marginTop: 4, fontStyle: "italic" }}>
            Renews {new Date(sub.current_period_end).toLocaleDateString()}
          </div>
        )}
      </div>
      <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
        {isActive ? (
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {busy ? "Working…" : "Cancel at period end"}
          </Button>
        ) : (
          <Button
            variant={addon.stripe_price_configured ? "primary" : "ghost"}
            onClick={onSubscribe}
            disabled={busy || !addon.stripe_price_configured}
            title={addon.stripe_price_configured
              ? "Subscribe via Stripe Checkout"
              : "Stripe Price ID not yet configured for this add-on. Founder must set the STRIPE_PRICE_* env var."}
          >
            {busy ? "Loading…" : addon.stripe_price_configured ? (
              <>Subscribe <ExternalLink size={12} style={{ marginLeft: 4 }} /></>
            ) : "Not yet available"}
          </Button>
        )}
      </div>
    </div>
  );
}

export default OliverAddonsPage;
