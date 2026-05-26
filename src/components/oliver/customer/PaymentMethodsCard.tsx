/**
 * PaymentMethodsCard — embedded Stripe Elements for admin-side card entry.
 *
 * Founder spec LOCKED 2026-05-25 — hybrid Stripe model:
 *   admin tenants enter card details right in the modal (Stripe Elements
 *   iframe — PCI-safe but no domain hop); their customers get Stripe-
 *   hosted Checkout via payment links.
 *
 * Backend contract:
 *   GET    /payments/contacts/:id/methods           list cards
 *   POST   /payments/contacts/:id/setup-intent      returns client_secret
 *   DELETE /payments/contacts/:id/methods/:pmId     detach a card
 */
import { useCallback, useEffect, useState } from "react";
import {
  loadStripe, type Stripe as StripeClient, type StripeElements as StripeElementsT,
} from "@stripe/stripe-js";
import {
  Elements, CardElement, useStripe, useElements,
} from "@stripe/react-stripe-js";
import { Button } from "../ui";

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  exp_month?: number;
  exp_year?: number;
  is_default?: boolean;
}

interface SetupIntentResponse {
  client_secret: string;
  publishable_key: string;
  stripe_account: string | null;
  customer_id: string;
}

type Api = {
  get: <T>(p: string) => Promise<T>;
  post: <T>(p: string, b?: unknown) => Promise<T>;
  del: <T>(p: string) => Promise<T>;
};

function brandLabel(brand: string): string {
  const map: Record<string, string> = {
    visa: "Visa", mastercard: "Mastercard", amex: "American Express",
    discover: "Discover", diners: "Diners Club", jcb: "JCB", unionpay: "UnionPay",
  };
  return map[brand?.toLowerCase()] || (brand || "Card");
}

export function PaymentMethodsCard({
  customerId, api,
}: {
  customerId: string;
  api: Api;
}) {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const data = await api.get<{ data: PaymentMethod[] } | PaymentMethod[]>(`/payments/contacts/${customerId}/methods`);
      setMethods(Array.isArray(data) ? data : ((data as any).data ?? []));
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }, [api, customerId]);

  useEffect(() => { reload(); }, [reload]);

  async function detach(pmId: string) {
    if (!confirm(`Remove card ending ${methods.find((m) => m.id === pmId)?.last4 || ""}?`)) return;
    try {
      await api.del(`/payments/contacts/${customerId}/methods/${pmId}`);
      await reload();
    } catch (e) { setErr((e as Error).message); }
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <div className="card-ttl">Payment methods</div>
          <div className="card-sub">Cards saved on this customer's Stripe profile. Charges run against the default card.</div>
        </div>
        {!addOpen && (
          <Button variant="secondary" onClick={() => setAddOpen(true)}>+ Add card</Button>
        )}
      </div>

      {err && (
        <div style={{ background: "#FEE2E2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: 6, padding: "8px 12px", fontSize: 12, marginTop: 10 }}>
          {err}
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 12, color: "#5A7A8A", padding: "8px 0" }}>Loading…</div>
      ) : methods.length === 0 ? (
        <div style={{ fontSize: 12, color: "#5A7A8A", fontStyle: "italic", padding: "8px 0" }}>
          No cards on file. Click "+ Add card" to save one (entered securely via Stripe — your portal never sees the number).
        </div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0" }}>
          {methods.map((m) => (
            <li key={m.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 4px", borderTop: "1px solid #F1F5F9", fontSize: 12,
            }}>
              <span style={{ display: "inline-block", padding: "2px 6px", background: "#F1F5F9", borderRadius: 4, fontSize: 10, fontWeight: 700 }}>
                {brandLabel(m.brand)}
              </span>
              <span style={{ fontFamily: "monospace", color: "#0B1C24" }}>
                •••• •••• •••• {m.last4}
              </span>
              {m.exp_month && m.exp_year && (
                <span style={{ color: "#5A7A8A", fontSize: 11 }}>
                  {String(m.exp_month).padStart(2, "0")}/{String(m.exp_year).slice(2)}
                </span>
              )}
              {m.is_default && (
                <span style={{ fontSize: 10, fontWeight: 700, color: "#047857" }}>DEFAULT</span>
              )}
              <button
                onClick={() => detach(m.id)}
                style={{ marginLeft: "auto", background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 11 }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {addOpen && (
        <AddCardForm
          customerId={customerId}
          api={api}
          onCancel={() => setAddOpen(false)}
          onAdded={() => { setAddOpen(false); reload(); }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AddCardForm — fetches a SetupIntent, mounts Stripe Elements, confirms
// the setup. All card data goes Stripe → Stripe; the portal never sees it.
// ─────────────────────────────────────────────────────────────────────────────
function AddCardForm({
  customerId, api, onCancel, onAdded,
}: {
  customerId: string;
  api: Api;
  onCancel: () => void;
  onAdded: () => void;
}) {
  const [intent, setIntent] = useState<SetupIntentResponse | null>(null);
  const [stripe, setStripe] = useState<StripeClient | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.post<SetupIntentResponse>(`/payments/contacts/${customerId}/setup-intent`);
        if (cancelled) return;
        if (!r?.publishable_key) throw new Error("Stripe publishable key not configured on the server");
        setIntent(r);
        const s = await loadStripe(r.publishable_key, r.stripe_account ? { stripeAccount: r.stripe_account } : undefined);
        if (!cancelled) setStripe(s);
      } catch (e) { if (!cancelled) setErr((e as Error).message); }
    })();
    return () => { cancelled = true; };
  }, [customerId, api]);

  if (err) {
    return (
      <div style={{ marginTop: 12, padding: 12, background: "#FEE2E2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: 6, fontSize: 12 }}>
        {err}
        <div style={{ marginTop: 8 }}>
          <Button variant="ghost" onClick={onCancel}>Close</Button>
        </div>
      </div>
    );
  }
  if (!intent || !stripe) {
    return <div style={{ marginTop: 12, fontSize: 12, color: "#5A7A8A" }}>Loading secure card entry…</div>;
  }

  return (
    <div style={{ marginTop: 12, padding: 14, border: "1px solid #E5E7EB", borderRadius: 8, background: "#F8FAFC" }}>
      <div style={{ fontSize: 12, color: "#0B1C24", marginBottom: 10 }}>
        <strong>Add a card</strong> — entered securely via Stripe. Your portal never sees the number.
      </div>
      <Elements stripe={stripe} options={{ clientSecret: intent.client_secret }}>
        <CardCapture
          clientSecret={intent.client_secret}
          onCancel={onCancel}
          onAdded={onAdded}
        />
      </Elements>
    </div>
  );
}

function CardCapture({
  clientSecret, onCancel, onAdded,
}: {
  clientSecret: string;
  onCancel: () => void;
  onAdded: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!stripe || !elements) return;
    setBusy(true); setErr(null);
    try {
      const card = elements.getElement(CardElement);
      if (!card) throw new Error("Card element not mounted");
      const result = await stripe.confirmCardSetup(clientSecret, {
        payment_method: { card },
      });
      if (result.error) throw new Error(result.error.message || "Card setup failed");
      onAdded();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <div style={{ padding: "12px 14px", background: "#fff", border: "1px solid #E5E7EB", borderRadius: 6 }}>
        <CardElement options={{ hidePostalCode: false, style: { base: { fontSize: "14px", color: "#0B1C24" } } }} />
      </div>
      {err && (
        <div style={{ marginTop: 8, fontSize: 12, color: "#991B1B" }}>{err}</div>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={busy || !stripe || !elements}>
          {busy ? "Saving card…" : "Save card"}
        </Button>
      </div>
    </div>
  );
}
