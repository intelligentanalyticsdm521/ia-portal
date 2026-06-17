# Cross-Product Phase 1 — Functionality Testing (Founder Tenant)

**Tenant under test:** `Intelligent Analytics & Data Management` (`8c9527b9-8999-4b31-a306-f3d4ccc39fbd`)
**Tier:** Business + every authority add-on (platform owner, never charged)
**Slug:** `intelligent-analytics`
**Preferred name:** `Intelligent Analytics`

This plan exercises **end-to-end flows that touch multiple products**. Single-product CRUD lives in the per-product Phase 1 plans (OLIVER, SPARK). This plan assumes those have already passed.

Format per test: **Pre / Steps / Expected (UI) / Expected (DB) / Pass-Fail / Notes**

---

## 0. Environment & deploy gate

| Item | Value / how to verify |
|---|---|
| Portal URL | `https://portal.intelligentanalyticsdm.com` |
| oliver-api | `https://app-oliver-api-prod-eaffhyhqgrgbcfh0.centralus-01.azurewebsites.net` |
| lumen-api (SPARK) | `https://app-lumen-api-prod-*.centralus-01.azurewebsites.net` |
| arion-api | `https://app-arion-api-prod-e6fuc9gzd8f3hqfe.centralus-01.azurewebsites.net` |
| Founder tenant ID | `8c9527b9-8999-4b31-a306-f3d4ccc39fbd` |
| DB server | `sql-iadm-prod-cus.database.windows.net` |
| Service DB | `iadm_services` (oliver / lumen schemas — SINGLE SOURCE for contacts) |
| Platform DB | `iadm_platform` (core / platform schemas) |
| Stripe mode | **LIVE** (per `kv-IADM-prod`. Test mode runs against `kv-IADM-uat`.) |
| Stripe TEST card (UAT only) | `4242 4242 4242 4242` |
| Test data marker | use `TEST_XP_2026-06-16_*` in names |

### XP.0.1 — Three services up
- **Steps:** `curl <each>/__meta` on oliver-api, lumen-api, arion-api.
- **Expected:** All 200; all show `hasSqlServer: true`, `hasStripeKey: true`; `startedAt` recent.
- **Pass-Fail:** ☐ Pass ☐ Fail

### XP.0.2 — Single-contact-source invariant
- **Steps (DB on `iadm_services`):**
  ```sql
  -- There must be ONLY ONE contact table for the tenant: lumen.contact.
  -- Reject any oliver.contact_cache / spark_contact_shadow / arion_contact existence.
  SELECT s.name + '.' + t.name AS table_name
  FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
  WHERE t.name LIKE '%contact%' AND s.name IN ('oliver','spark','arion');
  -- Expected: 0 rows (or only legacy view-only objects).

  SELECT COUNT(*) AS contacts FROM lumen.contact
   WHERE tenant_id='8C9527B9-8999-4B31-A306-F3D4CCC39FBD';
  -- Expected: ≥ 1 (the founder has prior test contacts)
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail
- **Notes:** [VERIFY] If any per-product contact table exists, escalate — this breaks the cross-product identity invariant locked in the reference doc.

### XP.0.3 — Stripe mode banner
- **Steps:** Open Portal → Plan & Pricing.
- **Expected:** No "TEST MODE" banner. Production live keys in `kv-IADM-prod`.
- **Pass-Fail:** ☐ Pass ☐ Fail

---

## 1. Lead Gen → Contact → Campaign → Reply → Health Score

**End-to-end:** SPARK Lead Gen finds a lead → promotes to a contact → campaign sends → recipient replies → contact intelligence score updates.

### XP.1.1 — Lead Gen run produces leads
- **Pre:** Founder SPARK plan includes Lead Gen Authority.
- **Steps:**
  1. SPARK → Lead Gen → New Search
  2. Category `Commercial Property Managers`, State `Iowa`, City `Des Moines`, radius 30 mi, max 25, mode `balanced`
  3. Save & start
- **Expected (UI):** Job phase reaches `complete` with ≥ 1 lead.
- **Expected (DB):**
  ```sql
  SELECT id, status, delivered_count FROM lumen.leadgen_job
  WHERE tenant_id='8C9527B9-...' ORDER BY created_at DESC;
  -- Expected: status='complete', delivered_count >= 1
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail
- **Notes:** If keys missing, see SPARK SP.12.6 fallback notes. Use a pre-staged lead row if needed.

### XP.1.2 — Accept lead → promote to contact
- **Steps:** From the job page review queue → accept 1 lead.
- **Expected (DB):**
  ```sql
  SELECT c.email, c.source_lead_id, c.lifecycle_stage
  FROM lumen.contact c WHERE c.source_lead_id IS NOT NULL
   AND c.tenant_id='8C9527B9-...' ORDER BY c.created_at DESC;
  -- Expected: 1 new row, source_lead_id IS NOT NULL, lifecycle_stage='lead'
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

### XP.1.3 — Send campaign to that contact
- **Steps:**
  1. Add the new contact to list `TEST_XP_1_leads`
  2. SPARK → Campaigns → new campaign `TEST_XP_1 LeadOutreach` targeting that list
  3. Schedule for now+2 min
- **Expected (DB):** `lumen.campaign_event` row with `event_type='sent'`.
- **Pass-Fail:** ☐ Pass ☐ Fail

### XP.1.4 — Recipient replies → reply ingested
- **Steps:** From `test-xp1-lead@ia-dm.com` (the lead's email if test-controlled), reply to the campaign email.
- **Expected (DB):**
  ```sql
  SELECT TOP 5 inbound_type, contact_id, body_excerpt FROM lumen.inbound_email
   ORDER BY received_at DESC;
  -- Expected: 1 row, contact_id matches the promoted lead, inbound_type='reply'
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail
- **Notes:** [VERIFY] Inbound email ingestion path — confirm route `/webhooks/email/inbound` is wired to ACS event grid.

### XP.1.5 — Contact intelligence score advances
- **Steps:** After reply ingestion → reload Contact360.
- **Expected (UI):** Score went up (e.g., Cold → Warm). Score history shows `+10` for `replied_to_email`.
- **Expected (DB):**
  ```sql
  SELECT contact_intelligence_score, contact_intelligence_tier, last_engagement_at
  FROM lumen.contact WHERE email='test-xp1-lead@ia-dm.com';
  -- Expected: score increased; last_engagement_at within last 5 min; tier upgraded
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail
- **Notes:** Per-tenant weights live in `lumen.tenant_contact_score_weights`. Migration 034 seeds defaults.

---

## 2. ARION Form → SPARK Contact → OLIVER Job → Invoice → Review Request → Review

**End-to-end:** website visitor submits an ARION-hosted form → SPARK creates contact → owner assigns the lead in OLIVER as a job → invoice → review request after job done → public review collected.

### XP.2.1 — Submit ARION website form
- **Pre:** ARION site provisioned for founder tenant with a contact form. If not, mock by calling the form-submit API directly.
- **Steps:**
  ```bash
  curl -X POST "https://<arion-api>/public/form-submit" \
    -H "Content-Type: application/json" \
    -d '{
      "tenant_id":"8c9527b9-8999-4b31-a306-f3d4ccc39fbd",
      "form_slug":"contact",
      "data":{
        "first_name":"TEST",
        "last_name":"ArionForm",
        "email":"test-xp2-arion@ia-dm.com",
        "phone":"5552220002",
        "message":"Quoting a kitchen remodel."
      }
    }'
  ```
- **Expected:** 200/201 response with submission id.
- **Pass-Fail:** ☐ Pass ☐ Fail
- **Notes:** [VERIFY] Confirm exact ARION public form-submit endpoint shape. If ARION-side form-submit lives in arion-func instead, hit the corresponding HTTP-triggered function URL.

### XP.2.2 — SPARK contact created
- **Steps:** SPARK → Contacts.
- **Expected (UI):** New contact `TEST ArionForm` appears with source = `arion_form`.
- **Expected (DB):**
  ```sql
  SELECT email, source, source_metadata_json FROM lumen.contact
  WHERE email='test-xp2-arion@ia-dm.com';
  -- Expected: 1 row, source='arion', source_metadata_json contains form_slug
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

### XP.2.3 — Assign to OLIVER as a job
- **Steps:**
  1. OLIVER → Customers → Service Requests
  2. Find the new inquiry → click "Create job"
  3. Job type: `Quote`, title `TEST_XP_2 Kitchen quote`, customer auto-populated
- **Expected (DB):**
  ```sql
  SELECT j.title, j.status, j.customer_contact_id
  FROM oliver.job j WHERE j.title='TEST_XP_2 Kitchen quote';
  -- Expected: 1 row, customer_contact_id points back to lumen.contact via the same id
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

### XP.2.4 — Create + pay invoice
- **Steps:** OLIVER → Billing → New invoice → customer = the above contact → line `Kitchen quote` @ `$2.00` → Save → Send → Pay via Stripe Checkout.
- **Expected (DB):**
  ```sql
  SELECT i.status, i.amount_paid FROM oliver.invoice i
  WHERE i.title LIKE '%TEST_XP_2%';
  -- Expected: status='paid', amount_paid=2.00
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail
- **Notes:** Founder application_fee = $0 (per OLIVER Plan Strategy). Verify in Stripe Dashboard.

### XP.2.5 — Mark job done → review request fires
- **Steps:** Drag the job to `Done` column.
- **Expected (UI):** Review request auto-queued. Activity log shows automation trigger.
- **Expected (DB):**
  ```sql
  SELECT TOP 5 channel, to_address, subject, source_entity_type, source_product
  FROM platform.notification_event
  WHERE source_entity_type='review_request'
    AND tenant_id='8C9527B9-...'
  ORDER BY created_at DESC;
  -- Expected: 1 queued/sent row for test-xp2-arion@ia-dm.com from product='spark' or 'oliver'
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

### XP.2.6 — Public review submission
- **Steps:** Click the review link in the email → submit 5 stars + comment "Great job, TEST_XP_2".
- **Expected (DB):**
  ```sql
  SELECT rating, comment, contact_id FROM lumen.review
  WHERE comment LIKE '%TEST_XP_2%';
  -- Expected: 1 row, rating=5, contact_id matches
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail
- **Notes:** [VERIFY] Whether 5-star reviews auto-route to the public destination (Google Business Profile URL) per `lumen.review_widget_config`.

---

## 3. OLIVER Customer Portal → Service Request → SPARK Merge → Campaign Segment

**End-to-end:** existing customer logs into OLIVER customer portal, submits a service request, that record reconciles with their existing SPARK contact (merge), then a new SPARK segment picks them up.

### XP.3.1 — Existing SPARK contact + matching customer portal record
- **Steps:**
  1. SPARK → Contacts → ensure `TEST_XP_3 Customer` / `test-xp3@ia-dm.com` exists (create if missing).
  2. OLIVER customer-portal sign-up using the same email.
- **Expected (DB):**
  ```sql
  SELECT COUNT(*) FROM lumen.contact WHERE email='test-xp3@ia-dm.com';
  -- Expected: 1 (merge happened on portal signup, not duplicated)
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail
- **Notes:** [VERIFY] Customer-portal signup hits LUMEN-API merge logic — confirm `POST /api/v1/contacts/upsert-by-email` collapses duplicates.

### XP.3.2 — Submit service request from customer portal
- **Steps:** Customer portal → "Request service" → category `Consulting`, message `TEST_XP_3 from portal`.
- **Expected (DB):**
  ```sql
  SELECT title, status, source FROM oliver.job
  WHERE title LIKE '%TEST_XP_3 from portal%';
  -- Expected: 1 row, source='customer_portal', status='inquiry'
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

### XP.3.3 — Service Request inbox surfaces it
- **Steps:** OLIVER → Customers → Service Requests.
- **Expected (UI):** Row visible with badge "Portal", title, contact name.
- **Pass-Fail:** ☐ Pass ☐ Fail

### XP.3.4 — Dynamic segment picks up the contact
- **Steps:** SPARK → Segments → create `TEST_XP_3 Portal users` = "source = customer_portal" OR "has open job".
- **Expected (UI):** Segment count includes the new contact.
- **Expected (DB):**
  ```sql
  -- Hydrated count helper (depends on segment engine impl)
  SELECT COUNT(*) FROM lumen.segment_member sm
  JOIN lumen.segment s ON s.id=sm.segment_id
  WHERE s.name='TEST_XP_3 Portal users';
  -- Expected: >= 1
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

### XP.3.5 — Campaign targets that segment
- **Steps:** New SPARK campaign → audience = `TEST_XP_3 Portal users` → send 1 test email.
- **Expected (DB):** `lumen.campaign_event` includes one `sent` row to the contact.
- **Pass-Fail:** ☐ Pass ☐ Fail

---

## 4. Newsletter submission via ARION → IA Insights Cross-Channel

**End-to-end:** ARION website embeds a newsletter signup form (SPARK Newsletter Studio source) → submission → cross-channel insights surface it.

### XP.4.1 — Newsletter form on ARION site
- **Steps:** Submit:
  ```bash
  curl -X POST "https://<lumen-api>/public/newsletter/subscribe" \
    -H "Content-Type: application/json" \
    -d '{
      "tenant_id":"8c9527b9-...",
      "email":"test-xp4-news@ia-dm.com",
      "source":"arion_website"
    }'
  ```
- **Expected:** 201.
- **Expected (DB):**
  ```sql
  SELECT email, source, status FROM lumen.newsletter_subscriber
  WHERE email='test-xp4-news@ia-dm.com';
  -- Expected: status='confirmed' (single opt-in) or 'pending' (double opt-in)
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail
- **Notes:** [VERIFY] Confirm newsletter subscribe endpoint path. May live under `/api/v1/newsletter` not `/public/newsletter`.

### XP.4.2 — Cross-channel insights surface it
- **Steps:** SPARK → Insights → Health (`spark_ia_insights_health`).
- **Expected (UI):** Cross-Channel Breakdown bar chart shows new ARION-sourced subscriber today (after data refresh — may be next cycle).
- **Pass-Fail:** ☐ Pass ☐ Fail
- **Notes:** Cross-channel aggregation may be cached/batched. Allow up to 15 min lag, or trigger the recompute job if available.

---

## 5. ARGUS Chatbot → Consulting Ticket → Invoice

**End-to-end:** Bottom-right chatbot intent for "submit a ticket" → ACS email to founder + `core.support_ticket` row + invoice generation.

### XP.5.1 — Open chatbot
- **Steps:** From any page, click bottom-right ARGUS chatbot.
- **Expected (UI):** Floating widget opens with quick chips (My Account, Subscriptions, Help, Take a tour, Submit ticket).
- **Pass-Fail:** ☐ Pass ☐ Fail

### XP.5.2 — Submit ticket intent
- **Steps:** Click "Submit ticket" chip → fill subject `TEST_XP_5 Sub`, body `consulting hours request`, urgency `low` → Submit.
- **Expected (UI):** Confirmation "We received it".
- **Expected (DB):**
  ```sql
  SELECT subject, status, source FROM core.support_ticket
  WHERE subject='TEST_XP_5 Sub' AND tenant_id='8C9527B9-...';
  -- Expected: 1 row, source='argus_chatbot', status='open'
  ```
- **Expected (notifications):**
  ```sql
  SELECT TOP 3 channel, to_address, subject FROM platform.notification_event
   WHERE source_entity_type='support_ticket' ORDER BY created_at DESC;
  -- Expected: ACS email to founder (intelligentanalyticsdm@gmail.com)
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

### XP.5.3 — Founder converts ticket → consulting ticket → invoice
- **Steps:** Portal → Consulting Tickets kanban (`/app/services/consulting_tickets`) → drag the ticket through columns. At `approved`, click "Generate invoice".
- **Expected (DB):**
  ```sql
  SELECT i.title, i.total, i.status FROM oliver.invoice i
  WHERE i.title LIKE '%TEST_XP_5%';
  -- Expected: 1 row, status='draft' or 'sent'
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail
- **Notes:** Consulting kanban built F-138. If kanban columns differ from spec, document actual columns. F-137 onboarding wizard is separate.

---

## 6. Same-contact identity across products

**Goal:** verify `lumen.contact` is THE single contact source. No shadow tables or duplicate writes per product.

### XP.6.1 — No per-product contact tables
- **Steps (DB):**
  ```sql
  SELECT s.name + '.' + t.name AS table_name
  FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
  WHERE s.name IN ('oliver','spark','arion')
    AND (t.name LIKE '%contact%' OR t.name LIKE '%customer%cache%'
         OR t.name LIKE '%shadow%');
  -- Expected: 0 rows
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

### XP.6.2 — OLIVER customer_contact_id FK points at lumen.contact
- **Steps (DB):**
  ```sql
  SELECT OBJECT_NAME(parent_object_id) AS table_name,
         OBJECT_NAME(referenced_object_id) AS ref_table,
         SCHEMA_NAME((SELECT schema_id FROM sys.tables WHERE object_id = referenced_object_id)) AS ref_schema
  FROM sys.foreign_keys
  WHERE referenced_object_id = OBJECT_ID('lumen.contact');
  -- Expected: oliver.job, oliver.invoice, oliver.quote, lumen.* all reference lumen.contact
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail
- **Notes:** [VERIFY] If any oliver.* table uses a string copy of email instead of an FK, escalate.

### XP.6.3 — Edit in SPARK reflects in OLIVER
- **Steps:**
  1. SPARK → open contact `TestSP11` from SPARK Phase 1 plan
  2. Change phone to `5559999999`. Save.
  3. OLIVER → open the same customer drawer
- **Expected (UI):** Phone is `5559999999` (no stale cache).
- **Pass-Fail:** ☐ Pass ☐ Fail

### XP.6.4 — No duplicate write on cross-product creation
- **Steps:** Create a contact from OLIVER (Customers → New contact). Verify in SPARK.
- **Expected (DB):**
  ```sql
  SELECT COUNT(*) FROM lumen.contact WHERE email='test-xp6-cross@ia-dm.com';
  -- Expected: 1 (NOT 2)
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

---

## 7. Stripe live mode operations across products

### XP.7.1 — Live keys in KV (no test keys leaked to prod)
- **Steps:**
  ```bash
  az keyvault secret show --vault-name kv-IADM-prod --name STRIPE-SECRET-KEY --query value -o tsv | head -c 8
  # Expected: starts with "sk_live_" — NOT "sk_test_"
  az keyvault secret show --vault-name kv-IADM-prod --name STRIPE-PUBLIC-KEY --query value -o tsv | head -c 8
  # Expected: starts with "pk_live_"
  az keyvault secret show --vault-name kv-IADM-prod --name STRIPE-WEBHOOK-SECRET --query value -o tsv | head -c 6
  # Expected: starts with "whsec_"
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail
- **Notes:** Per the Stripe Production Mode memory: test keys should be in `kv-IADM-uat`. Verify rotation timestamps too — `STRIPE-SECRET-KEY` should NOT be older than the prod cutover.

### XP.7.2 — OLIVER invoice → live charge $1.00
- **Pre:** Use a real (small) live charge OR run this only in the parallel UAT environment if a live charge is undesirable.
- **Steps:** Create invoice `TEST_XP_7 Live` @ $1.00 → send → pay with a real card.
- **Expected (DB):**
  ```sql
  SELECT status, amount_paid, stripe_payment_intent_id FROM oliver.invoice
  WHERE title='TEST_XP_7 Live';
  -- Expected: status='paid', stripe_payment_intent_id begins 'pi_'
  ```
- **Expected (Stripe Dashboard):** Charge appears in LIVE mode. application_fee = $0 (founder is platform owner).
- **Pass-Fail:** ☐ Pass ☐ Fail

### XP.7.3 — SPARK lead-gen overage charge (if exercised)
- **Pre:** Founder bypasses pay gate — to truly exercise this, use a non-founder UAT tenant. Skip on prod.
- **Pass-Fail:** ☐ Skip on founder (cover in Phase 2 non-founder runs)

### XP.7.4 — ARION website-build one-time charge
- **Steps:** Confirm a recent ARION `core.subscription` row paid in live mode.
- **Expected (DB):**
  ```sql
  SELECT TOP 5 stripe_subscription_id, status, current_period_end
  FROM core.subscription
  WHERE product='arion' ORDER BY created_at DESC;
  -- Expected: stripe_subscription_id starts with 'sub_' (live, not test)
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

### XP.7.5 — Webhook signature accepted
- **Steps:** Trigger a benign event from Stripe Dashboard ("Resend"). Check oliver-api logs for `Webhook signature verified`.
- **Expected:** No `Webhook Error: No signatures found matching the expected signature for payload`.
- **Pass-Fail:** ☐ Pass ☐ Fail

---

## 8. Cleanup (optional)

```sql
-- Cross-product test residue.
DELETE FROM platform.notification_event WHERE subject LIKE '%TEST_XP_%';
DELETE FROM core.support_ticket WHERE subject LIKE 'TEST_XP_5%';
DELETE FROM oliver.invoice WHERE title LIKE '%TEST_XP_%';
DELETE FROM oliver.job WHERE title LIKE '%TEST_XP_%';
DELETE FROM lumen.review WHERE comment LIKE '%TEST_XP_2%';
DELETE FROM lumen.campaign WHERE name LIKE 'TEST_XP_%';
DELETE FROM lumen.segment WHERE name LIKE 'TEST_XP_%';
DELETE FROM lumen.list WHERE name LIKE 'TEST_XP_%';
DELETE FROM lumen.newsletter_subscriber WHERE email='test-xp4-news@ia-dm.com';
DELETE FROM lumen.contact WHERE email LIKE 'test-xp%@ia-dm.com';
```

---

## Summary

| Section | Tests | Pass | Fail |
|---|---|---|---|
| 0 — Deploy gate | 3 | | |
| 1 — Lead Gen → Health Score | 5 | | |
| 2 — ARION form → review | 6 | | |
| 3 — Portal → Service Request → segment | 5 | | |
| 4 — Newsletter → cross-channel | 2 | | |
| 5 — ARGUS chatbot → invoice | 3 | | |
| 6 — Contact identity invariant | 4 | | |
| 7 — Stripe live mode | 5 | | |
| **Total** | **33** | | |
