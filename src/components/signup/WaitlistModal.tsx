// WaitlistModal — F-110.
//
// Replaces the "Pricing announced soon" disabled state on the STELLA /
// FORGE / ARGUS cards on /pricing with a real lead-capture flow. Sized
// `nav` per the modal standards doc since this is a short focused form
// (email + optional name + company + note).
//
// POSTs to oliver-api /api/v1/waitlist. No auth — the lead may not have a
// tenant yet.
import { useEffect, useState } from "react";
import { IadmModal, IadmButton } from "../IadmModal";

const OLIVER_API_BASE =
  (import.meta.env.VITE_OLIVER_API_BASE as string) ||
  "https://app-oliver-api-prod-eaffhyhqgrgbcfh0.centralus-01.azurewebsites.net";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Lowercase product slug: "stella" | "forge" | "argus". */
  productKey: string;
  /** Display name shown in the modal title. */
  productName: string;
  /** Optional seed email + name so the parent can hand off what it already has. */
  defaultEmail?: string;
  defaultName?: string;
}

export function WaitlistModal({ open, onClose, productKey, productName, defaultEmail, defaultName }: Props) {
  const [email, setEmail] = useState(defaultEmail || "");
  const [name, setName] = useState(defaultName || "");
  const [company, setCompany] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Reset state every time the modal opens so re-opening for a different
  // product starts clean (but defaults are re-applied).
  useEffect(() => {
    if (!open) return;
    setError(null);
    setDone(false);
    setEmail(defaultEmail || "");
    setName(defaultName || "");
    setCompany("");
    setNote("");
  }, [open, defaultEmail, defaultName]);

  async function submit() {
    setError(null);
    if (!email.includes("@")) { setError("Please enter a valid email address."); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`${OLIVER_API_BASE}/api/v1/waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product: productKey,
          email: email.trim(),
          name: name.trim() || undefined,
          company: company.trim() || undefined,
          note: note.trim() || undefined,
          source_url: typeof window !== "undefined" ? window.location.href : undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.message || j?.error || `HTTP ${res.status}`);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send your request — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <IadmModal
      open={open}
      onClose={onClose}
      product="argus"
      eyebrow={`${productName.toUpperCase()} · WAITLIST`}
      title={done ? "You're on the list" : `Get notified when ${productName} launches`}
      subtitle={done ? undefined : "Drop your email and we'll email you the moment self-serve opens — usually a week or two before public launch."}
      size="nav"
      footer={done ? (
        <IadmButton variant="primary" onClick={onClose}>Done</IadmButton>
      ) : (
        <>
          <IadmButton variant="ghost" onClick={onClose}>Cancel</IadmButton>
          <IadmButton variant="accent" product="argus" onClick={submit} disabled={submitting || !email.includes("@")}>
            {submitting ? "Joining…" : "Join the waitlist"}
          </IadmButton>
        </>
      )}
    >
      <div className="p-5 space-y-3">
        {done ? (
          <div className="text-center py-4">
            <div className="text-3xl mb-2">✓</div>
            <p className="text-sm text-slate-700">
              Thanks — we'll let you know when <strong>{productName}</strong> is ready. In the meantime,
              feel free to start with ARION, SPARK, or OLIVER from the cards on this page.
            </p>
          </div>
        ) : (
          <>
            <Field label="Email *">
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus
                placeholder="you@yourbusiness.com"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[#84CC16] focus:ring-1 focus:ring-[#84CC16]"
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Name (optional)">
                <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </Field>
              <Field label="Company (optional)">
                <input type="text" value={company} onChange={(e) => setCompany(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </Field>
            </div>
            <Field label={`What problem are you hoping ${productName} will solve? (optional)`}>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
                placeholder="So we can prioritize the right features for launch"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </Field>
            {error && <div className="text-xs text-rose-600">{error}</div>}
            <p className="text-[10px] text-slate-500">
              We'll only email you about {productName}. Unsubscribe anytime.
            </p>
          </>
        )}
      </div>
    </IadmModal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase font-semibold text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

export default WaitlistModal;
