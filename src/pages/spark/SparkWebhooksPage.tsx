// SparkWebhooksPage — Coming Soon placeholder.
//
// Phase 3A (2026-06-16): the original outbound-webhooks UI was a half-built
// CRUD that wired straight at /api/v1/webhook-subscriptions with a JSON
// event picker and a side-drawer modal. Per founder spec we're owning our
// own webhook stack for v1.5 — until then this page shows a Coming Soon
// banner so paying clients don't trip over half-working flows. Power
// users can still hit the underlying API directly.
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { ComingSoonBanner } from "../../components/ComingSoonBanner";

export function SparkWebhooksPage() {
  return (
    <SparkPageShell
      title="Webhooks"
      subtitle="Outbound webhook subscriptions — our own implementation"
    >
      <ComingSoonBanner
        feature="Webhooks"
        eta="SPARK v1.5"
        detail={
          <>
            We&apos;re building our own outbound webhook stack — HMAC-signed
            payloads, automatic retries with backoff, per-event filtering,
            and a delivery log. The temporary pass-through has been removed
            so paying clients don&apos;t see half-finished flows. Available
            in SPARK v1.5.
          </>
        }
      />
    </SparkPageShell>
  );
}

export default SparkWebhooksPage;
