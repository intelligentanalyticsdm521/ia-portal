import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { PageHeader, Button } from "../../components/oliver/ui";
import { OliverOnboardingWizard } from "../../components/oliver/OliverOnboardingWizard";

interface OnboardingStep {
  key: string;
  title: string;
  description: string;
  complete: boolean;
  optional?: boolean;
}

interface OnboardingStatus {
  onboarding_completed_at: string | null;
  all_required_complete: boolean;
  completed_count: number;
  total_steps: number;
  required_step_count: number;
  steps: OnboardingStep[];
}

const STEP_DEST: Record<string, string> = {
  business_profile: "/app/services/oliver_settings",
  stripe_connect: "/app/services/oliver_settings",
  invoice_template: "/app/services/oliver_settings",
  service_catalog: "/app/services/oliver_catalog",
  team: "/app/services/oliver_workers",
};
const STEP_CTA: Record<string, string> = {
  business_profile: "Update profile",
  stripe_connect: "Connect Stripe",
  invoice_template: "Customize template",
  service_catalog: "Add offering",
  team: "Invite worker",
};

export function OliverOnboardingPage() {
  const { get, post, patch, ready } = useOliverApi();
  const navigate = useNavigate();
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<"complete" | "skip" | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setStatus(await get<OnboardingStatus>("/onboarding/status"));
    } catch (e) { setError(e); }
    finally { setLoading(false); }
  }, [get]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  async function finish(kind: "complete" | "skip") {
    setBusy(kind);
    try {
      await post(`/onboarding/${kind}`);
      navigate("/app/services/oliver_dashboard");
    } catch {
      setBusy(null);
    }
  }

  const pct = status ? Math.round((status.completed_count / status.total_steps) * 100) : 0;
  const alreadyDone = !!status?.onboarding_completed_at;

  return (
    <OliverPageWrapper title="Welcome to OLIVER" subtitle="Get started in 5 minutes" error={error} loading={loading}>
      <PageHeader
        title="Welcome to OLIVER"
        subtitle="A guided checklist to get your business running. You can revisit any step from this page."
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="primary" onClick={() => setWizardOpen(true)}>
              {alreadyDone ? "Re-run guided setup" : "Start guided setup"}
            </Button>
            {alreadyDone ? (
              <Button variant="secondary" onClick={() => navigate("/app/services/oliver_dashboard")}>Back to dashboard</Button>
            ) : (
              <Button variant="ghost" onClick={() => finish("skip")} disabled={busy === "skip"}>
                {busy === "skip" ? "Skipping…" : "Skip for now"}
              </Button>
            )}
          </div>
        }
      />

      {alreadyDone && (
        <div className="card" style={{ background: "#D1FAE5", border: "1px solid #6EE7B7" }}>
          <div style={{ fontSize: 12, color: "#065F46" }}>
            <strong>Onboarding complete!</strong> Marked done {new Date(status!.onboarding_completed_at!).toLocaleDateString()}. You can still revisit any step below.
          </div>
        </div>
      )}

      {/* Progress bar */}
      {status && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div>
              <div className="card-ttl">Setup progress</div>
              <div className="card-sub">{status.completed_count} of {status.total_steps} steps complete</div>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: pct === 100 ? "#059669" : "#0C4A60" }}>{pct}%</div>
          </div>
          <div style={{ height: 8, background: "#f1f5f9", borderRadius: 999, overflow: "hidden" }}>
            <div style={{
              width: `${pct}%`, height: "100%",
              background: pct === 100 ? "#059669" : "#1A7DB5",
              transition: "width 300ms ease",
            }} />
          </div>
        </div>
      )}

      {/* Step cards */}
      {status?.steps.map((step, i) => (
        <div key={step.key} className="card" style={{
          borderLeft: `4px solid ${step.complete ? "#059669" : step.optional ? "#94A3B8" : "#F59E0B"}`,
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: 26, height: 26, borderRadius: "50%",
                  background: step.complete ? "#059669" : "#e5e7eb",
                  color: step.complete ? "#fff" : "#5A7A8A",
                  fontWeight: 700, fontSize: 12,
                }}>
                  {step.complete ? "✓" : i + 1}
                </span>
                <div className="card-ttl" style={{ margin: 0 }}>{step.title}</div>
                {step.optional && (
                  <span style={{ fontSize: 10, fontWeight: 500, padding: "2px 8px", borderRadius: 999, background: "#F1F5F9", color: "#5A7A8A" }}>
                    Optional
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: "#5A7A8A", lineHeight: 1.5, marginLeft: 36 }}>
                {step.description}
              </div>
            </div>
            <Button
              variant={step.complete ? "secondary" : "primary"}
              onClick={() => navigate(STEP_DEST[step.key] || "/app/services/oliver_dashboard")}
            >
              {step.complete ? "Review" : STEP_CTA[step.key] || "Set up"}
            </Button>
          </div>
        </div>
      ))}

      {/* Final action bar */}
      {status && !alreadyDone && (
        <div className="card" style={{ background: status.all_required_complete ? "#D1FAE5" : "#FEF3C7", border: `1px solid ${status.all_required_complete ? "#6EE7B7" : "#FCD34D"}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14 }}>
            <div style={{ fontSize: 12, color: status.all_required_complete ? "#065F46" : "#78350F", lineHeight: 1.5 }}>
              {status.all_required_complete ? (
                <><strong>You're ready to go.</strong> All required steps are done. Mark onboarding complete to dismiss the dashboard banner.</>
              ) : (
                <><strong>Required steps remaining.</strong> Complete the highlighted steps to start sending invoices and accepting payments.</>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <Button variant="ghost" onClick={() => finish("skip")} disabled={!!busy}>
                {busy === "skip" ? "Saving…" : "I'll finish later"}
              </Button>
              <Button variant="primary" onClick={() => finish("complete")} disabled={!!busy || !status.all_required_complete}>
                {busy === "complete" ? "Saving…" : "Mark complete"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {wizardOpen && (
        <OliverOnboardingWizard
          api={{ get, post, patch }}
          onClose={() => { setWizardOpen(false); reload(); }}
          onFinished={() => { setWizardOpen(false); navigate("/app/services/oliver_dashboard"); }}
        />
      )}
    </OliverPageWrapper>
  );
}
