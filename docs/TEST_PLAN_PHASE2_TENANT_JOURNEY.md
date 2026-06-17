# Phase 2 — Full New-Tenant Journey (Non-Founder)

**Goal:** exercise the full lifecycle of a fresh prospect from discovery → cancellation, against a NEW tenant that does NOT have founder bypass. This is where IA platform fees, provisioning, CIAM, and retention surfaces actually fire.

**Tenant under test:** new tenant created at test start. Slug `phase2-test-<DATE>`.
**Test buyer email:** `phase2-buyer-<DATE>@ia-dm.com` (alias).
**Mode:** prefer UAT (`https://uat.intelligentanalyticsdm.com` if available, against `kv-IADM-uat` Stripe test keys). For production validation, repeat the critical paths in prod with `$1` charges.

Format per test: **Pre / Steps / Expected (UI) / Expected (DB) / Pass-Fail / Notes**

---

## 0. Environment & deploy gate

| Item | Value / how to verify |
|---|---|
| Marketing site | `https://intelligentanalyticsdm.com` (pricing → /pricing on Portal) |
| Portal URL | `https://portal.intelligentanalyticsdm.com` |
| Pricing page | `https://portal.intelligentanalyticsdm.com/pricing` |
| Onboarding (post-checkout) | `/pricing/onboarding?session_id=cs_...` |
| Status page | `/pricing/status` |
| oliver-api | `https://app-oliver-api-prod-eaffhyhqgrgbcfh0.centralus-01.azurewebsites.net` |
| lumen-api | `https://app-lumen-api-prod-*.centralus-01.azurewebsites.net` |
| arion-api | `https://app-arion-api-prod-e6fuc9gzd8f3hqfe.centralus-01.azurewebsites.net` |
| ciam-api (F-115) | `func-iadm-ciam-prod` (NEW; verify exists before running) |
| Stripe (UAT) | `kv-IADM-uat` test keys; card `4242 4242 4242 4242` |
| Founder tenant ID | `8c9527b9-8999-4b31-a306-f3d4ccc39fbd` (for impersonation guardrails only) |
| Test data marker | `phase2-buyer-<DATE>@ia-dm.com`; tenant slug `phase2-test-<DATE>` |

### P2.0.1 — Services up + CIAM presence
- **Steps:** curl `/__meta` on oliver/lumen/arion. List CIAM function app.
- **Expected (oliver/lumen/arion):** 200, `hasStripeKey: true`.
- **Expected (CIAM):** [VERIFY] `func-iadm-ciam-prod` exists. Per the Portal Auth Architecture memory, per-tenant CIAM was NOT yet built as of 2026-05-29 — re-check before assuming F-115 is live.
- **Pass-Fail:** ☐ Pass ☐ Fail

### P2.0.2 — Plan catalog endpoints
- **Steps:**
  ```bash
  curl https://<oliver-api>/signup/catalog | jq '.products | keys'
  ```
- **Expected:** `["oliver","spark","arion"]` (per `pages/signup/SignupPage.tsx`).
- **Pass-Fail:** ☐ Pass ☐ Fail

---

## 1. Discovery → Pricing → Cart

### P2.1.1 — Visit pricing page (anonymous)
- **Steps:** Open `/pricing` from incognito.
- **Expected (UI):** Platform grid: ARION, SPARK, OLIVER (priced); STELLA/FORGE/ARGUS (greyed coming-soon); CONSULTING (off-site quote form).
- **Pass-Fail:** ☐ Pass ☐ Fail

### P2.1.2 — Select OLIVER plan
- **Steps:** Click OLIVER `Standard` → State 2 detail panel opens.
- **Expected (UI):** Standard features listed, monthly/annual toggle, "Add to cart" + "Buy now".
- **Pass-Fail:** ☐ Pass ☐ Fail

### P2.1.3 — Multi-product cart (F-108)
- **Steps:**
  1. Add OLIVER `Standard` (annual).
  2. Add SPARK `5k volume`, leads addon `essentials`.
  3. Add ARION `Essentials` + SEO `essentials`.
- **Expected (UI):** Cart shows 3 items; bundle discount line item appears.
- **Expected (sessionStorage):**
  ```js
  JSON.parse(sessionStorage.getItem('iadm.signup.cart.v1'))
  // Expected: 3-element array
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

### P2.1.4 — Bundle discount math
- **Steps:** Inspect order summary.
- **Expected (UI):** Discount percent matches `bundleDiscountPercent(items)` from `signupCart.ts`. (Eyeball today; assert exact % once spec is wired.)
- **Pass-Fail:** ☐ Pass ☐ Fail

### P2.1.5 — Coupon application
- **Steps:** Apply test coupon `PHASE2-TEST20` (create in Stripe Dashboard if missing).
- **Expected (UI):** Coupon applied, % discount shown.
- **Pass-Fail:** ☐ Pass ☐ Fail
- **Notes:** [VERIFY] Coupon UI may live on Stripe Checkout side only if Portal cart doesn't have a coupon field.

### P2.1.6 — Buyer info
- **Steps:** Enter buyer name + email `phase2-buyer-<DATE>@ia-dm.com`.
- **Expected:** Persists to sessionStorage keys `iadm.signup.cart.email.v1`, `iadm.signup.cart.name.v1`.
- **Pass-Fail:** ☐ Pass ☐ Fail

---

## 2. Stripe Checkout → Welcome

### P2.2.1 — Proceed to Checkout
- **Steps:** Click "Checkout".
- **Expected (UI):** Stripe Checkout opens (test mode) with line items matching cart.
- **API check:** `POST /signup/checkout-cart` returns `{ url: "https://checkout.stripe.com/..." }`.
- **Pass-Fail:** ☐ Pass ☐ Fail

### P2.2.2 — Pay with test card
- **Steps:** Use `4242 4242 4242 4242`, any future exp, any CVC, any ZIP.
- **Expected (UI):** Redirects back to `/pricing/onboarding?session_id=cs_test_...`.
- **Pass-Fail:** ☐ Pass ☐ Fail

### P2.2.3 — Welcome email queued
- **Expected (DB):**
  ```sql
  SELECT TOP 5 channel, to_address, subject FROM platform.notification_event
   WHERE to_address='phase2-buyer-<DATE>@ia-dm.com'
   ORDER BY created_at DESC;
  -- Expected: 1 row, subject contains "Welcome" or "Get started"
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

### P2.2.4 — Stripe customer + subscription rows
- **Expected (DB):**
  ```sql
  SELECT TOP 5 stripe_customer_id, stripe_subscription_id, status, product
  FROM core.subscription ORDER BY created_at DESC;
  -- Expected: 3 rows (oliver, spark, arion), each status='active' or 'trialing'
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

---

## 3. CIAM signup → First Login

### P2.3.1 — Signup link from welcome email
- **Steps:** Open the welcome email → click "Create your password" / "Activate".
- **Expected (UI):** Lands on CIAM signup form (Microsoft Entra External ID flow).
- **Pass-Fail:** ☐ Pass ☐ Fail
- **Notes:** [VERIFY] Per-tenant CIAM (F-115) status — if not yet live, shared CIAM is used (per Portal Auth memory).

### P2.3.2 — Set password + verify email
- **Steps:** Set password `Phase2!Test#2026`. Confirm email.
- **Expected:** Email-verified, redirected to Portal.
- **Pass-Fail:** ☐ Pass ☐ Fail

### P2.3.3 — MSAL token acquired
- **Steps:** Browser devtools → Application → Session Storage → search `msal`.
- **Expected:** `accessToken` present; `tenant_id` claim matches the freshly-provisioned tenant.
- **Pass-Fail:** ☐ Pass ☐ Fail

### P2.3.4 — First Portal load
- **Steps:** Portal landing.
- **Expected (UI):** ARION + SPARK + OLIVER nav entries all visible. Onboarding banner across the top.
- **Pass-Fail:** ☐ Pass ☐ Fail

---

## 4. Tenant Provisioning (per product)

### P2.4.1 — Tenant row exists with correct slug + tier
- **Expected (DB):**
  ```sql
  SELECT slug, preferred_business_name, business_name,
         subscription_tier, spark_subscription_tier, arion_subscription_tier
  FROM core.tenants
  WHERE business_name LIKE 'phase2-test%';
  -- Expected: tier = 'standard' (OLIVER), spark volume row, arion essentials row
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

### P2.4.2 — ARION website provisioning
- **Steps:** ARION → Websites.
- **Expected (UI):** New WP site being provisioned (status = `provisioning` → `live`). Hostinger subdomain shows.
- **Expected (DB):**
  ```sql
  SELECT site_id, status, subdomain FROM arion.sites
  WHERE tenant_id=<new_tenant_id>;
  -- Expected: status moves to 'live' within ~5 min
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail
- **Notes:** Per memory, Kodee fallback creates 6 pages if Kodee soft-fails.

### P2.4.3 — SPARK seed
- **Steps:** SPARK → Overview.
- **Expected:**
  - `lumen.tenant_customer_flow` row pointing at `standard` flow (default)
  - Default scoring rules seeded (lifecycle defaults from migration 034)
  - `lumen.contact` empty (no founder data leakage)
- **Pass-Fail:** ☐ Pass ☐ Fail

### P2.4.4 — OLIVER ops setup
- **Steps:** OLIVER → Job Board, Service Categories, Workflow Settings.
- **Expected:**
  - Default service categories seeded
  - Default job statuses (inquiry/scheduled/in_progress/done/cancelled)
  - Empty `oliver.job` for this tenant
- **Pass-Fail:** ☐ Pass ☐ Fail

### P2.4.5 — Stripe Connect (tenant's own account, for payments)
- **Steps:** OLIVER → Billing → Stripe Connect setup → "Connect existing" (Standard) OR "Set up Express".
- **Expected (UI):** Stripe-hosted Connect flow opens.
- **Expected (DB):**
  ```sql
  SELECT stripe_connect_account_id, stripe_connect_type, charges_enabled
  FROM oliver.tenant_stripe_connect WHERE tenant_id=<new_tenant_id>;
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail
- **Notes:** Per OLIVER Stripe Strategy memory: Standard for tenants with own Stripe, Express for tenants without. Express IS built.

---

## 5. Onboarding Wizards per product

### P2.5.1 — Shared Business Profile prefill
- **Steps:** Settings → Organization. Verify name/email/phone prefilled from Stripe checkout buyer info.
- **Expected:** Business name, contact email, phone NOT empty.
- **Pass-Fail:** ☐ Pass ☐ Fail

### P2.5.2 — SPARK Onboarding checklist (`spark_onboarding`)
- **Steps:** SPARK → Get Started.
- **Expected (UI):** 5-step checklist:
  - Review profile (auto-done if §2.5.1 passed)
  - Verify sender domain
  - Import contacts (need 10+)
  - Build first campaign
  - Build first automation
- **API:** `GET /api/v1/onboarding/checklist` returns `{ steps, progress }`.
- **Pass-Fail:** ☐ Pass ☐ Fail

### P2.5.3 — Customer Flow picker on first SPARK visit
- **Steps:** SPARK → Customer Flow.
- **Expected:** Default = Standard. Tenant can switch to Simple / Subscription / Quote-Driven / Enterprise B2B (5 templates).
- **Pass-Fail:** ☐ Pass ☐ Fail

### P2.5.4 — Sender domain verification
- **Steps:** Add domain `phase2-test-<DATE>.ia-dm.com`. Add the displayed DNS records.
- **Expected:** Status moves `pending` → `verified` once DNS resolves.
- **Pass-Fail:** ☐ Pass ☐ Fail

### P2.5.5 — Contacts import
- **Steps:** Upload 10-row CSV. Map fields. Commit.
- **Expected (DB):** 10 rows in `lumen.contact` for this tenant.
- **Pass-Fail:** ☐ Pass ☐ Fail

### P2.5.6 — First SPARK campaign
- **Steps:** Build a 1-step campaign to the imported list. Send to self.
- **Expected:** Campaign event row + ACS notification.
- **Pass-Fail:** ☐ Pass ☐ Fail

### P2.5.7 — First SPARK automation
- **Steps:** Build via unified Workflows page (Phase 3A merger). Welcome email on form submit.
- **Expected (DB):** `lumen.automation` row, `is_active=1`.
- **Pass-Fail:** ☐ Pass ☐ Fail

### P2.5.8 — ARION onboarding (`/pricing/onboarding` for ARION purchase)
- **Steps:** Walk the 3 steps: Domain → Questionnaire → Branding. Submit.
- **Expected:** `POST /onboarding/submit`. Redirects to `/pricing/status` showing build progress.
- **Pass-Fail:** ☐ Pass ☐ Fail

### P2.5.9 — OLIVER first-job hint
- **Steps:** OLIVER → Job Board.
- **Expected (UI):** Empty-state with "Create your first job" CTA + sample flow.
- **Pass-Fail:** ☐ Pass ☐ Fail

---

## 6. Tour Discovery (F-119)

### P2.6.1 — GuidedTourLauncher visible
- **Steps:** Any page → look for the `?` icon in the page header.
- **Expected (UI):** Dropdown with available tours for the current product. SPARK shows `SPARK — Full Tour` (~22 steps), OLIVER shows `OLIVER — Full Tour`, ARION shows `ARION — Full Tour`.
- **Pass-Fail:** ☐ Pass ☐ Fail

### P2.6.2 — Run SPARK full tour
- **Steps:** Launch SPARK tour → step through.
- **Expected (UI):** Spotlight overlays each nav item; auto-routes between pages. Reaches the final step without errors.
- **Pass-Fail:** ☐ Pass ☐ Fail

### P2.6.3 — Completed tour does NOT auto-launch next visit
- **Steps:** Finish a tour → reload.
- **Expected:** Tour does not re-fire (localStorage `tour:completed:<id>` set to "1").
- **Pass-Fail:** ☐ Pass ☐ Fail

### P2.6.4 — Reset tour
- **Steps:** From the launcher dropdown → "Reset" on a completed tour.
- **Expected:** Tour eligible to auto-launch again.
- **Pass-Fail:** ☐ Pass ☐ Fail

### P2.6.5 — Auto-launch on first visit
- **Steps:** Brand-new tenant lands on each product overview the first time.
- **Expected (UI):** Centered hero "Welcome to SPARK / OLIVER / ARION" with `Take a tour` / `Skip` buttons (per `GuidedTour` component).
- **Pass-Fail:** ☐ Pass ☐ Fail
- **Notes:** [VERIFY] Auto-launch logic may live in service overview pages — confirm trigger.

---

## 7. First-Week Activation

### P2.7.1 — Dashboard banners
- **Steps:** Each product overview (ARION/SPARK/OLIVER).
- **Expected (UI):** Top-of-page banner reflecting outstanding setup items (e.g. "Verify your sender domain", "Connect Stripe").
- **Pass-Fail:** ☐ Pass ☐ Fail

### P2.7.2 — Setup hints inline
- **Steps:** Visit a page where the user hasn't completed an action (e.g., Campaigns with no list).
- **Expected (UI):** `SetupHints` component shows contextual nudge with `Take me there` CTA.
- **Pass-Fail:** ☐ Pass ☐ Fail

### P2.7.3 — Onboarding nudge on adjacent surfaces
- **Steps:** Visit Forms, Landing Pages, Pipelines while checklist is incomplete.
- **Expected (UI):** Banner / hint links back to `spark_onboarding`.
- **Pass-Fail:** ☐ Pass ☐ Fail
- **Notes:** Per OLIVER Onboarding memory, onboarding nudge should appear on MORE surfaces post-Phase 1 — verify which.

---

## 8. Day-30 / 60 / 90 Retention

### P2.8.1 — Day-30 email
- **Steps:** Time-travel: set `core.subscription.created_at` to 30 days ago for this tenant (UAT only). Trigger the daily timer manually.
- **Expected (DB):**
  ```sql
  SELECT TOP 5 channel, to_address, subject FROM platform.notification_event
   WHERE source_entity_type='retention_milestone'
     AND tenant_id=<test_tenant_id>;
  -- Expected: 1 'day_30' email
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail
- **Notes:** [VERIFY] Day-30/60/90 retention surfaces — confirm exact timer schedule (per memory, timers fire 05:XX UTC).

### P2.8.2 — Day-60 milestone surface
- **Steps:** Repeat for 60 days. Open Portal.
- **Expected (UI):** "You've been with us 60 days" banner or Intelligence report unlock.
- **Pass-Fail:** ☐ Pass ☐ Fail

### P2.8.3 — Day-90 expansion offer
- **Steps:** Repeat for 90 days.
- **Expected (UI):** "Upgrade to Pro" CTA or feature-add prompt.
- **Pass-Fail:** ☐ Pass ☐ Fail

---

## 9. Subscription Downgrade / Cancel

### P2.9.1 — Open Plan & Pricing manage mode
- **Steps:** OLIVER → Plan & Pricing.
- **Expected (UI):** "Current plan: Standard" badge. "Change plan" available.
- **Pass-Fail:** ☐ Pass ☐ Fail

### P2.9.2 — Downgrade to Lite
- **Steps:** Click Lite → confirm.
- **Expected (UI):** Confirmation modal explains schedule (effective end of billing period), tier-caps-after change.
- **Expected (DB):**
  ```sql
  SELECT pending_tier, pending_change_effective_at, pending_subscription_schedule_id
  FROM core.tenants WHERE tenant_id=<test_tenant_id>;
  -- Expected: pending_tier='lite', schedule id populated, effective_at = period_end
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

### P2.9.3 — Downgrade banner appears
- **Steps:** Re-open Plan & Pricing.
- **Expected (UI):** Top banner: "Downgrading to Lite on YYYY-MM-DD" with "Cancel downgrade" link.
- **Pass-Fail:** ☐ Pass ☐ Fail

### P2.9.4 — Cancel downgrade
- **Steps:** Click "Cancel downgrade".
- **Expected (DB):** All `pending_*` cleared.
- **Pass-Fail:** ☐ Pass ☐ Fail

### P2.9.5 — Cancel subscription entirely
- **Steps:** Plan & Pricing → "Cancel plan" → confirm.
- **Expected:** Subscription set to cancel at period end. Tenant remains active until then.
- **Expected (DB):**
  ```sql
  SELECT cancel_at_period_end, current_period_end FROM core.subscription
  WHERE tenant_id=<test_tenant_id>;
  -- Expected: cancel_at_period_end=1
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

### P2.9.6 — Resubscribe before period end
- **Steps:** Click "Restore plan".
- **Expected:** Cancellation revoked, `cancel_at_period_end=0`.
- **Pass-Fail:** ☐ Pass ☐ Fail

---

## 10. Account Deletion Lifecycle (F-71)

**Spec:** 30/60/90 retention windows with cascade.

### P2.10.1 — Initiate deletion
- **Steps:** Settings → Account → "Delete account" → confirmation modal (type tenant slug).
- **Expected (UI):** Confirmation requires typing slug; explains 30-day soft-delete, 60-day data export window, 90-day hard purge.
- **Expected (DB):**
  ```sql
  SELECT deletion_requested_at, deletion_purge_at, status
  FROM core.tenants WHERE tenant_id=<test_tenant_id>;
  -- Expected: deletion_requested_at = now, deletion_purge_at = now+90d, status='deletion_pending'
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail
- **Notes:** [VERIFY] Account deletion appears to be placeholder only — `SettingsEditPage.tsx` reads "Delete account will be implemented later. This placeholder requires confirmation." Confirm F-71 is actually built before running this section.

### P2.10.2 — Day-30 soft delete
- **Steps:** Wait 30 days (or time-travel) → daily timer.
- **Expected:**
  - Tenant disabled (cannot log in)
  - `core.tenants.status='deletion_soft_deleted'`
  - All product services return 403 for this tenant
  - Subscriptions cancelled in Stripe
- **Pass-Fail:** ☐ Pass ☐ Fail

### P2.10.3 — Export data within day-30 to day-60 window
- **Steps:** Founder admin tools → "Export tenant data" by tenant_id.
- **Expected:** ZIP of CSV exports (contacts, jobs, invoices, campaigns) generated.
- **Pass-Fail:** ☐ Pass ☐ Fail

### P2.10.4 — Day-90 hard purge cascade
- **Steps:** Time-travel to day-90 → daily timer.
- **Expected (DB):**
  ```sql
  SELECT COUNT(*) FROM core.tenants WHERE tenant_id=<test_tenant_id>;
  -- Expected: 0

  SELECT COUNT(*) FROM lumen.contact WHERE tenant_id=<test_tenant_id>;
  -- Expected: 0
  SELECT COUNT(*) FROM oliver.job WHERE tenant_id=<test_tenant_id>;
  -- Expected: 0
  SELECT COUNT(*) FROM arion.sites WHERE tenant_id=<test_tenant_id>;
  -- Expected: 0
  -- ... every per-product table cascades to 0
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

### P2.10.5 — Idempotency / re-run
- **Steps:** Re-run daily timer.
- **Expected:** No errors. No-op on already-purged tenant.
- **Pass-Fail:** ☐ Pass ☐ Fail

### P2.10.6 — Revoke deletion (within day-30 grace)
- **Steps:** Initiate deletion → before day-30, click "Cancel deletion".
- **Expected:** All `deletion_*` columns cleared; tenant active again.
- **Pass-Fail:** ☐ Pass ☐ Fail

---

## 11. Cleanup

```sql
-- Wipe any test residue on UAT only.
-- For prod runs, prefer to leave the test tenant in 'deletion_pending' and let
-- the natural day-90 cascade do the work.

DELETE FROM platform.notification_event WHERE to_address LIKE 'phase2-buyer-%@ia-dm.com';
DELETE FROM core.subscription WHERE tenant_id=<test_tenant_id>;
DELETE FROM lumen.contact WHERE tenant_id=<test_tenant_id>;
DELETE FROM oliver.job WHERE tenant_id=<test_tenant_id>;
DELETE FROM arion.sites WHERE tenant_id=<test_tenant_id>;
DELETE FROM core.tenants WHERE tenant_id=<test_tenant_id>;
```

---

## Summary

| Section | Tests | Pass | Fail |
|---|---|---|---|
| 0 — Deploy gate | 2 | | |
| 1 — Discovery + cart | 6 | | |
| 2 — Checkout + welcome | 4 | | |
| 3 — CIAM signup | 4 | | |
| 4 — Provisioning | 5 | | |
| 5 — Onboarding wizards | 9 | | |
| 6 — Tour discovery | 5 | | |
| 7 — First-week activation | 3 | | |
| 8 — Day-30/60/90 retention | 3 | | |
| 9 — Downgrade / cancel | 6 | | |
| 10 — Account deletion (F-71) | 6 | | |
| **Total** | **53** | | |
