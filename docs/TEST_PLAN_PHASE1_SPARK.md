# SPARK Phase 1 — Functionality Testing (Founder Tenant)

**Tenant under test:** `Intelligent Analytics & Data Management` (`8c9527b9-8999-4b31-a306-f3d4ccc39fbd`)
**Tier:** Business + Lead Gen Authority (platform owner, never charged)
**Slug:** `intelligent-analytics`
**Preferred name:** `Intelligent Analytics`

Format per test: **Pre / Steps / Expected (UI) / Expected (DB) / Pass-Fail / Notes**

---

## 0. Environment & deploy gate

| Item | Value / how to verify |
|---|---|
| Portal URL | `https://portal.intelligentanalyticsdm.com` |
| lumen-api | `https://app-lumen-api-prod-*.centralus-01.azurewebsites.net` (per env `VITE_LUMEN_API_BASE_URL`) |
| Founder tenant ID | `8c9527b9-8999-4b31-a306-f3d4ccc39fbd` |
| DB server | `sql-iadm-prod-cus.database.windows.net` |
| Service DB | `iadm_services` (lumen schema) |
| Platform DB | `iadm_platform` (core/platform schemas) |
| Stripe TEST card | `4242 4242 4242 4242` (any future exp, any CVC, any ZIP) |
| Test data marker | use `TEST_SP_2026-06-16_*` in names so we can find / clean up later |

### SP.0.1 — Service health + commit
- **Steps:**
  1. `curl https://<lumen-api>/__meta` — note `startedAt`, env vars
  2. Open Portal → SPARK → Overview
- **Expected:** Both alive, no 5xx. `/__meta` shows `hasSqlServer: true`, `hasStripeKey: true`, `hasAcsConnectionString: true`.
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.0.2 — Migrations applied (latest = 034)
- **Steps (DB on `iadm_services`):**
  ```sql
  -- Customer Flow templates (migration 034)
  SELECT COUNT(*) FROM lumen.customer_flow;            -- Expected: 5
  SELECT COUNT(*) FROM lumen.customer_flow_stage;      -- Expected: 28

  -- Contact intelligence score columns (migration 034)
  SELECT COUNT(*) FROM sys.columns
   WHERE object_id = OBJECT_ID('lumen.contact')
     AND name IN ('contact_intelligence_score','contact_intelligence_tier',
                  'lifecycle_stage','last_engagement_at','source_lead_id');
  -- Expected: 5

  -- Lead Gen V1 schema (migration 034)
  SELECT COUNT(*) FROM sys.tables t
   JOIN sys.schemas s ON s.schema_id=t.schema_id
   WHERE s.name='lumen' AND t.name IN ('lead','lead_contact','search_profile','leadgen_job');
  -- Expected: 4
  ```
- **Steps (DB on `iadm_platform`):**
  ```sql
  SELECT COUNT(*) FROM sys.tables t
   JOIN sys.schemas s ON s.schema_id=t.schema_id
   WHERE s.name='platform'
     AND t.name IN ('lead_cache','lead_cache_assignment','leadgen_blocklist',
                    'keyword_term','keyword_customer_category','keyword_term_category',
                    'term_review_queue','industry_review_queue',
                    'geo_state','geo_county','geo_city','geo_zip');
  -- Expected: 12
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.0.3 — Founder tenant state
- **Steps (DB on `iadm_platform`):**
  ```sql
  SELECT slug, preferred_business_name, business_name, subscription_tier
  FROM core.tenants WHERE tenant_id='8C9527B9-8999-4B31-A306-F3D4CCC39FBD';
  -- Expected: intelligent-analytics, Intelligent Analytics,
  --           Intelligent Analytics & Data Management, business
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

---

## 1. CRM — Contacts (CRUD + search)

**Path:** SPARK → CRM → Contacts (`/app/services/spark_contacts`)

### SP.1.1 — Create contact
- **Steps:**
  1. Click "New contact"
  2. First: `TestSP11`, Last: `Customer`, Email: `test-sp11@ia-dm.com`, Phone: `5551110011`
  3. Save
- **Expected (UI):** Drawer closes; new row in list.
- **Expected (DB):**
  ```sql
  SELECT first_name, last_name, email, phone, lifecycle_stage
  FROM lumen.contact WHERE email='test-sp11@ia-dm.com';
  -- Expected: 1 row, lifecycle_stage='lead' (default from migration 034)
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.1.2 — Edit contact
- **Steps:** Open `TestSP11` row → change Phone to `5559119911` → Save.
- **Expected (DB):** `phone` updated; `updated_at` advanced.
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.1.3 — Search by email
- **Steps:** Filter box → type `test-sp11`.
- **Expected:** Only that row remains.
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.1.4 — Filters (lifecycle stage, owner)
- **Steps:** Apply filter "Lifecycle stage = Lead".
- **Expected:** Only contacts with `lifecycle_stage='lead'` visible.
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.1.5 — Contact 360 drawer / detail page
- **Steps:** Click the row.
- **Expected (UI):** Drawer or Contact360 page shows full info + tabs (Activity, Engagement, Deals, Campaigns, Tags, Notes).
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.1.6 — Contact Intelligence Score visible
- **Steps:** On the Contact360 page or contact row, look for the Intelligence Score badge.
- **Expected (UI):** Numeric score (0–100) + tier label (Cold/Warm/Hot/Champion). New contacts default to Cold.
- **Expected (DB):**
  ```sql
  SELECT contact_intelligence_score, contact_intelligence_tier
  FROM lumen.contact WHERE email='test-sp11@ia-dm.com';
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

### Edge cases
- ☐ Invalid email format → inline validation error, no row created
- ☐ Duplicate email on create → 409 conflict OR auto-merge per dedupe policy

---

## 2. CRM — Bulk Import (`/app/services/spark_contact_import`)

### SP.2.1 — CSV import dry-run
- **Steps:**
  1. Prepare CSV with 5 rows (`first,last,email,phone,company`). Include one row with email matching `test-sp11@ia-dm.com` (existing) and one duplicate-in-file.
  2. Open Bulk import → upload CSV → map fields → click "Dry run".
- **Expected (UI):** Preview shows: 5 rows parsed, 1 will dedupe (existing), 1 in-file duplicate flagged.
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.2.2 — CSV import commit
- **Steps:** From dry-run page → "Import for real".
- **Expected (UI):** Toast "Import complete: X added, Y updated, Z skipped".
- **Expected (DB):**
  ```sql
  SELECT COUNT(*) FROM lumen.contact
   WHERE tenant_id='8C9527B9-...' AND email LIKE 'test-sp-import-%';
  -- Expected: 3 (or whatever 5 minus dupes resolves to)
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.2.3 — Bulk page (`/app/services/spark_contact_bulk`)
- **Steps:** Open Bulk page → select all imported contacts → bulk apply tag `TEST_SP_2`.
- **Expected:** Bulk action toast; tag visible on all rows on reload.
- **Pass-Fail:** ☐ Pass ☐ Fail

---

## 3. CRM — Merge (`/app/services/spark_contact_merge`)

### SP.3.1 — Merge two contacts
- **Steps:**
  1. Create two contacts: `TestSP31a` / `test-sp31@ia-dm.com` and `TestSP31b` / `test-sp31@ia-dm.com` (force-allow dup, or create via API).
  2. Open Merge → select the pair → preview → "Keep oldest, merge newer".
- **Expected (UI):** Merge wizard shows side-by-side fields with conflict highlights. After commit, one row remains.
- **Expected (DB):**
  ```sql
  SELECT COUNT(*) FROM lumen.contact WHERE email='test-sp31@ia-dm.com';
  -- Expected: 1
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

---

## 4. CRM — Custom Fields, Tags, Segments, Lists

### SP.4.1 — Custom Fields (`/app/services/spark_custom_fields`)
- **Steps:** Define a custom field `LinkedIn URL`, type `url`. Save. Open a contact and set value.
- **Expected (DB):**
  ```sql
  SELECT custom_fields_json FROM lumen.contact WHERE email='test-sp11@ia-dm.com';
  -- Expected: JSON containing the new key
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.4.2 — Tags (`/app/services/spark_tags`)
- **Steps:** Create tag `TEST_SP_4_tag`. Apply to `TestSP11`. Filter contacts by that tag.
- **Expected:** `TestSP11` appears in tag-filtered list.
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.4.3 — Segments (`/app/services/spark_segments`)
- **Steps:** Create dynamic segment `TEST_SP_4_seg` = "Lifecycle stage = Lead AND Tag = TEST_SP_4_tag".
- **Expected (UI):** Segment count updates live as members match.
- **Expected (DB):** `lumen.segment` row + `definition_json` populated.
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.4.4 — Lists (`/app/services/spark_lists`)
- **Steps:** Create static list `TEST_SP_4_list`. Add `TestSP11` manually.
- **Expected:** Membership persists across reloads.
- **Expected (DB):**
  ```sql
  SELECT l.name, COUNT(*) AS members
  FROM lumen.list l
  JOIN lumen.list_member lm ON lm.list_id=l.id
  WHERE l.name='TEST_SP_4_list' GROUP BY l.name;
  -- Expected: 1 member
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

---

## 5. CRM — Companies / Accounts

**Path:** SPARK → CRM → Companies (`/app/services/spark_accounts`)

### SP.5.1 — Create company
- **Steps:** New account → Name `TEST_SP_5 Co`, Domain `test-sp5.example.com`, Industry `Consulting`.
- **Expected (DB):**
  ```sql
  SELECT name, domain FROM lumen.account
  WHERE name='TEST_SP_5 Co' AND tenant_id='8C9527B9-...';
  -- Expected: 1 row
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.5.2 — Link contact to company
- **Steps:** Open `TestSP11` → set `Company = TEST_SP_5 Co`.
- **Expected:** Company appears on contact detail; contact count on company = 1.
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.5.3 — Account profile page (`/app/services/spark_account_profile`)
- **Steps:** Open the page.
- **Expected:** Shows the tenant's own shared business profile (name, address, branding) — single source across all products.
- **Pass-Fail:** ☐ Pass ☐ Fail

---

## 6. Customer Lifecycle Flow (NEW)

**Path:** SPARK → CRM → Customer Flow (`/app/services/spark_customer_flow`)
**API:** `GET /api/v1/customer-flows`, `GET/POST /api/v1/tenant/customer-flow`

### SP.6.1 — Default flow displayed
- **Steps:** Open the page.
- **Expected (UI):** "Current flow: Standard". 5 stages visible: Lead, Engaged, Qualified, Customer, Past Customer. Each shows score_weight.
- **Expected (DB):**
  ```sql
  SELECT cf.code, cfs.code, cfs.label, cfs.sort_order, cfs.score_weight
  FROM lumen.customer_flow cf
  JOIN lumen.customer_flow_stage cfs ON cfs.flow_id=cf.id
  WHERE cf.code='standard' ORDER BY cfs.sort_order;
  -- Expected: 5 rows (Lead/Engaged/Qualified/Customer/Past Customer)
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.6.2 — Switch to a different template
- **Steps:** Click `Subscription` flow card → Save.
- **Expected (UI):** "Saved" toast. Active flow card highlighted.
- **Expected (DB):**
  ```sql
  SELECT tcf.flow_id, cf.code
  FROM lumen.tenant_customer_flow tcf
  JOIN lumen.customer_flow cf ON cf.id=tcf.flow_id
  WHERE tcf.tenant_id='8C9527B9-...';
  -- Expected: code='subscription'
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.6.3 — Rename stage labels
- **Steps:** Click "Edit labels" → rename stage `Customer` → `Active Member` → Save.
- **Expected (DB):**
  ```sql
  SELECT stage_overrides_json FROM lumen.tenant_customer_flow
  WHERE tenant_id='8C9527B9-...';
  -- Expected: JSON {"customer":"Active Member"}
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.6.4 — Pipeline / Deals page reflects rename
- **Steps:** Open SPARK → Pipelines (`/app/services/spark_pipelines`) or Deals (`/app/services/spark_deals`).
- **Expected (UI):** Column heading shows `Active Member` instead of `Customer`.
- **Pass-Fail:** ☐ Pass ☐ Fail
- **Cleanup:** Revert overrides back to defaults.

---

## 7. Campaigns (Email)

**Path:** SPARK → Outreach → Campaigns (`/app/services/spark_campaigns`)

### SP.7.1 — Create + schedule campaign
- **Steps:**
  1. New campaign → name `TEST_SP_7 Welcome`
  2. Audience: list `TEST_SP_4_list`
  3. Template: pick a basic template or create inline subject `TEST_SP_7 Hello`
  4. Schedule for 2 min from now
  5. Save & Schedule
- **Expected (DB):**
  ```sql
  SELECT id, name, status, scheduled_for
  FROM lumen.campaign WHERE name='TEST_SP_7 Welcome';
  -- Expected: status='scheduled', scheduled_for ~ now+2m
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.7.2 — Send fires
- **Steps:** Wait for scheduled time + 30s. Refresh.
- **Expected (UI):** Status → `sent`. Send count = 1 (the test contact).
- **Expected (DB):**
  ```sql
  SELECT TOP 5 channel, to_address, status FROM platform.notification_event
   WHERE source_entity_type='campaign' AND source_product='spark'
   ORDER BY created_at DESC;
  -- Expected: 1 row, status in ('queued','sent','delivered')
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.7.3 — Open / click / bounce tracking
- **Steps:** Open the email in `test-sp11@ia-dm.com` inbox. Click a link.
- **Expected (UI):** Campaign analytics shows 1 open + 1 click after webhook latency (~30s).
- **Expected (DB):**
  ```sql
  SELECT event_type, COUNT(*) FROM lumen.campaign_event
  WHERE campaign_id=(SELECT id FROM lumen.campaign WHERE name='TEST_SP_7 Welcome')
  GROUP BY event_type;
  -- Expected: delivered, open, click rows
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail
- **Notes:** Bounce/unsub edge cases run in SP.16 (Deliverability) instead.

---

## 8. Email Templates + Newsletter Studio

### SP.8.1 — Email template CRUD (`/app/services/spark_email_templates`)
- **Steps:** New template → name `TEST_SP_8 Tmpl`, subject `Hello {{first_name}}`, body with merge fields. Save.
- **Expected (DB):**
  ```sql
  SELECT name, subject FROM lumen.email_template
   WHERE name='TEST_SP_8 Tmpl' AND tenant_id='8C9527B9-...';
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.8.2 — Template preview with merge data
- **Steps:** Click `Preview` → pick contact `TestSP11`.
- **Expected:** Subject renders `Hello TestSP11`.
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.8.3 — Newsletter Studio (`/app/services/spark_newsletter`)
- **Steps:** Open Newsletter Studio. Create a new issue `TEST_SP_8 Issue 1` with 2 sections.
- **Expected (UI):** Editorial calendar shows the draft. Save persists across reload.
- **Pass-Fail:** ☐ Pass ☐ Fail
- **Notes:** [VERIFY] Newsletter analytics per-issue may still be stubbed.

---

## 9. Workflows & Automations (NEW unified page)

**Path:** SPARK → Automation → Workflows & Automations (`/app/services/spark_workflows_automations`)
**Reference:** Phase 3A merger 2026-06-16 (overnight log §3A).

### SP.9.1 — Unified inventory loads
- **Steps:** Open the page.
- **Expected (UI):** Segmented filter "All / Automations (Triggers) / Rules" with counts. Single `New workflow` button (orange).
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.9.2 — Filter toggling
- **Steps:** Click `Automations (Triggers)` → click `Rules` → click `All`.
- **Expected:** List re-renders for each filter; counts match per type.
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.9.3 — New workflow chooser modal
- **Steps:** Click `New workflow`.
- **Expected (UI):** `SparkUnifiedWorkflowModal` (size=nav) opens with two tiles: "Trigger-based automation" and "Rule-based".
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.9.4 — Create trigger-based automation (JSON-free)
- **Steps:**
  1. Chooser → "Trigger-based automation"
  2. Step 1: Trigger = "Form Submission"
  3. Step 2: pick form `TEST_SP_12 Form` (created in §12) + Action = "Send Email"
  4. Step 3: Subject `TEST_SP_9 Auto`, From name, From email, body. Name = `TEST_SP_9 Welcome auto`. Save.
- **Expected (UI):** No JSON textarea anywhere. Modal closes; new row appears in `Automations (Triggers)` segment.
- **Expected (DB):**
  ```sql
  SELECT name, trigger_type, is_active FROM lumen.automation
  WHERE name='TEST_SP_9 Welcome auto' AND tenant_id='8C9527B9-...';
  -- Expected: is_active=1, trigger_type='form_submission'
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.9.5 — Create rule-based (scoring)
- **Steps:** Chooser → "Rule-based" → pick `Scoring` → name `TEST_SP_9 Open scores`, event=`email_open`, points=5. Save.
- **Expected (DB):**
  ```sql
  SELECT name, event_trigger, points FROM lumen.scoring_rule
  WHERE name='TEST_SP_9 Open scores';
  -- Expected: event_trigger='email_open', points=5
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.9.6 — Toggle active
- **Steps:** On the unified list, toggle the new automation off → on.
- **Expected (DB):** `is_active` round-trips on each toggle.
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.9.7 — Webhook action is gated "Coming Soon"
- **Steps:** Open the automation modal action picker.
- **Expected (UI):** `Webhook` tile shows `Soon` chip and cannot be selected.
- **Pass-Fail:** ☐ Pass ☐ Fail

### Edge cases
- ☐ Old deep links `/app/services/spark_automations`, `spark_workflow_triggers`, `spark_rules` all redirect to the unified page (back-compat aliases in `ServiceRouter.tsx`).
- ☐ `/app/services/spark_webhooks` shows "Coming Soon" banner (Phase 3A demoted to `coming_soon`).

---

## 10. Forms (Form Builder + hosted + submissions)

**Path:** SPARK → Capture → Forms (`/app/services/spark_forms`)

### SP.10.1 — Build a form (`/app/services/spark_form_builder`)
- **Steps:**
  1. New form → name `TEST_SP_10 Form`
  2. Add fields: First Name, Last Name, Email, Company, multi-select "Interest" (Sales/Support/Other)
  3. Set destination tag = `TEST_SP_10_inbound`
  4. Save
- **Expected (DB):**
  ```sql
  SELECT name, hosted_slug, fields_json FROM lumen.form
  WHERE name='TEST_SP_10 Form' AND tenant_id='8C9527B9-...';
  -- Expected: 1 row, hosted_slug populated
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.10.2 — Hosted form renders
- **Steps:** Copy the hosted URL from the form detail → open in incognito.
- **Expected:** Public form page renders all fields; tenant branding (logo + colors) applied.
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.10.3 — Public submit
- **Steps:**
  1. Fill the public form: first=`TEST`, last=`Submit10`, email=`test-sp10-submit@ia-dm.com`, company=`TestCo`, interest=`Sales`
  2. Submit
- **Expected (UI):** Thank-you screen.
- **Expected (DB):**
  ```sql
  SELECT s.payload_json, s.created_at FROM lumen.form_submission s
   WHERE s.form_id=(SELECT id FROM lumen.form WHERE name='TEST_SP_10 Form');
  -- Expected: 1 row
  SELECT email, lifecycle_stage FROM lumen.contact
   WHERE email='test-sp10-submit@ia-dm.com';
  -- Expected: 1 row, tag TEST_SP_10_inbound applied, lifecycle_stage='lead'
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.10.4 — Submission appears in inbox/list
- **Steps:** Back in Portal → Forms → submissions tab.
- **Expected:** New row visible with timestamp + payload preview.
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.10.5 — Automation fires off submission
- **Steps:** Wait 30s (uses §9.4 automation `TEST_SP_9 Welcome auto` targeting this form).
- **Expected (DB):** `lumen.automation_run` row for the submission; `platform.notification_event` row for the welcome email.
- **Pass-Fail:** ☐ Pass ☐ Fail

---

## 11. Landing Pages

**Path:** SPARK → Capture → Landing Pages (`/app/services/spark_landing_pages`)

### SP.11.1 — Create landing page
- **Steps:** New page → title `TEST_SP_11 LP`, pick a template, embed `TEST_SP_10 Form`, save.
- **Expected (DB):**
  ```sql
  SELECT name, public_slug, status FROM lumen.landing_page
  WHERE name='TEST_SP_11 LP' AND tenant_id='8C9527B9-...';
  -- Expected: status='draft' or 'published', public_slug not null
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.11.2 — Publish + visit
- **Steps:** Publish → click public URL.
- **Expected:** Page renders with embedded form. Submission flows into same form_submission table.
- **Pass-Fail:** ☐ Pass ☐ Fail

---

## 12. Lead Gen V1 (NEW)

**Path:** SPARK → Lead Gen
**Reference:** `C:\dev\claude code\overnight-report\30_LEADGEN_V1_SPEC.md`
**Pages:** `/app/services/spark_lead_gen_new`, `spark_lead_gen_job/:id`, `spark_lead_gen_saved`, `spark_leads`

### SP.12.1 — Search form loads (`spark_lead_gen_new`)
- **Steps:** Open the page.
- **Expected (UI):** Two-column layout. LEFT: Business Category autocomplete, Search Topics chip input, Search Mode (Strict/Focused/Balanced/Broad), State + Cities, radius (default 30 mi), ZIP auto/specify, "Search cold leads" toggle (default off), Max leads slider (cap 100). RIGHT: live preview of expanded keywords + locations + est. cost + est. time.
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.12.2 — Category autocomplete works
- **Steps:** Type `property` in Business Category.
- **Expected (UI):** Dropdown shows matches from `platform.keyword_customer_category` (e.g., "Commercial Property Managers", "Residential Property Managers").
- **API check:** Network tab — `GET /api/v1/leadgen/categories/search?q=property` returns 200.
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.12.3 — Live preview updates on form change
- **Steps:** Pick category `Commercial Property Managers`. Pick state `Iowa`. Add city `Des Moines`. Set radius 30 mi.
- **Expected (UI):** RIGHT panel updates within ~500ms — shows expanded keywords (count + sample list), expanded cities (count + sample list), est. cost ≈ `100 × $0.18 ≈ $18.00`, est. time `4-7 min`.
- **API check:** `POST /leadgen/expand` and `POST /leadgen/locations/expand` fire on debounce.
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.12.4 — Save search profile
- **Steps:** Click "Save search" → name `TEST_SP_12 IA Search`.
- **Expected (DB):**
  ```sql
  SELECT name, search_mode, max_leads, include_cold_leads, customer_category_id
  FROM lumen.search_profile WHERE name='TEST_SP_12 IA Search';
  -- Expected: 1 row, search_mode='balanced', max_leads=100, include_cold_leads=0
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.12.5 — Saved searches page lists it (`spark_lead_gen_saved`)
- **Steps:** Open Saved Searches.
- **Expected (UI):** `TEST_SP_12 IA Search` row with category, mode, state, city count, last-run (null), "Run again" button.
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.12.6 — Start a search (founder bypasses payment)
- **Steps:** Click "Start Search" on the new-search page. For founder, payment gate should auto-approve (platform owner).
- **Expected (UI):** Navigates to `spark_lead_gen_job/:id`. Live phase tracker shows: Queued → Expanding keywords → Resolving locations → Discovery → Scoring → Enriching → Finalizing → Complete.
- **Expected (DB):**
  ```sql
  SELECT id, status, phase, target_count FROM lumen.leadgen_job
  WHERE tenant_id='8C9527B9-...' ORDER BY created_at DESC;
  -- Expected: 1 row, target_count=100
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail
- **Notes:** [VERIFY] If Hunter/CSE keys are missing, job phase may stop at `enriching`. Check KV `LEADGEN-GOOGLE-CSE-KEY`, `LEADGEN-HUNTER-API-KEY`, `BRAVE-SEARCH-API-KEY`. If those are not yet stocked, expect `failed` status with explicit error string.

### SP.12.7 — Review queue (post-completion)
- **Steps:** After job → `complete`, scroll to Review queue section.
- **Expected (UI):** Lead rows show domain, primary contact email/phone, score, "Accept" / "Reject" thumb buttons; bulk-action checkboxes.
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.12.8 — Accept lead → auto-promote to contact
- **Steps:** Check 3 leads → click "Accept selected".
- **Expected (UI):** Confirmation: "3 leads promoted to contacts."
- **Expected (DB):**
  ```sql
  SELECT COUNT(*) FROM lumen.contact
  WHERE source_lead_id IN (SELECT lead_id FROM lumen.lead
                           WHERE leadgen_job_id=(SELECT id FROM lumen.leadgen_job
                                                 ORDER BY created_at DESC OFFSET 0 ROWS FETCH FIRST 1 ROW ONLY))
    AND tenant_id='8C9527B9-...';
  -- Expected: 3
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.12.9 — Delivered < target shows "try expanding" prompt
- **Steps:** If a search returns < target_count.
- **Expected (UI):** Yellow callout: "Delivered X of Y — try Broader search mode or expand radius."
- **Pass-Fail:** ☐ Pass ☐ Fail
- **Notes:** Hard to reproduce on founder tenant — flag for non-founder Phase 2.

### SP.12.10 — Lead Suppression / Blocklist (`spark_lead_suppression`)
- **Steps:** Open page → add domain `example-block.com` to suppression list.
- **Expected (DB):**
  ```sql
  SELECT domain, reason FROM lumen.suppression_list
   WHERE tenant_id='8C9527B9-...' AND domain='example-block.com';
  -- Expected: 1 row
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

---

## 13. Reviews + Review Requests

**Path:** SPARK → Outreach → Reviews (`/app/services/spark_reviews`, `spark_review_widget`)

### SP.13.1 — Reviews list page
- **Steps:** Open page.
- **Expected:** Page loads. If reviews integration not yet wired, shows empty-state with "Add destinations" CTA.
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.13.2 — Review widget config (`spark_review_widget`)
- **Steps:** Add at least one public review destination (e.g., Google Business Profile URL). Save.
- **Expected (DB):**
  ```sql
  SELECT config_json FROM lumen.review_widget_config
   WHERE tenant_id='8C9527B9-...';
  -- Expected: JSON contains the URL
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.13.3 — Trigger review request from contact
- **Steps:** Open `TestSP11` → Actions → "Send review request".
- **Expected:** ACS email queued.
- **Expected (DB):**
  ```sql
  SELECT TOP 3 channel, to_address, subject FROM platform.notification_event
   WHERE source_entity_type='review_request' AND source_product='spark'
   ORDER BY created_at DESC;
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail
- **Notes:** [VERIFY] Review-request UI lives in Reviews page OR a per-contact action drawer — confirm trigger location.

---

## 14. NPS Surveys

**Path:** SPARK → Outreach → NPS (`/app/services/spark_nps`)

### SP.14.1 — Create NPS schedule (`spark_nps_schedules`)
- **Steps:** New schedule → name `TEST_SP_14 NPS Q1`, audience = list `TEST_SP_4_list`, cadence = once.
- **Expected (DB):** `lumen.nps_schedule` row with status `scheduled`.
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.14.2 — NPS dashboard
- **Steps:** Open NPS page.
- **Expected (UI):** Score gauge (NPS = % promoters - % detractors). Responses list (likely empty on fresh tenant).
- **Pass-Fail:** ☐ Pass ☐ Fail

---

## 15. SMS Inbox + Sending

**Path:** SPARK → Outreach → SMS Inbox (`/app/services/spark_sms_inbox`, `spark_sms_campaigns`, `spark_sms_templates`)

### SP.15.1 — SMS inbox loads
- **Steps:** Open inbox.
- **Expected:** Page loads with thread list (likely empty for founder). No 5xx.
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.15.2 — Send a 1:1 SMS (if TwilioConnect / ACS-SMS provisioned)
- **Steps:** Open `TestSP11` contact → SMS action → message `TEST_SP_15 hi`. Send.
- **Expected (DB):**
  ```sql
  SELECT to_phone, body, status FROM lumen.sms_message
   WHERE to_phone='+15551110011' ORDER BY created_at DESC;
  -- Expected: 1 row, status in ('queued','sent','delivered')
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail
- **Notes:** [VERIFY] SMS sender provisioning status on founder tenant — if no Twilio number, expect 400 with explicit "no sender configured".

### SP.15.3 — SMS templates CRUD
- **Steps:** Create template `TEST_SP_15 Tmpl`. Body: `Hi {{first_name}}, your appt is {{appt_time}}.`
- **Expected (DB):** `lumen.sms_template` row.
- **Pass-Fail:** ☐ Pass ☐ Fail

---

## 16. Deliverability

**Path:** SPARK → Outreach → Deliverability (`/app/services/spark_deliverability`)

### SP.16.1 — Sender domains page (`spark_sender_domains`)
- **Steps:** Open page.
- **Expected (UI):** List of sender domains (likely IA's domain). Each shows DKIM/SPF/DMARC status badges.
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.16.2 — Add a sender domain
- **Steps:** Add domain `test-sp16.ia-dm.com`. Save.
- **Expected (UI):** Wizard shows DNS records to add (DKIM CNAME, SPF TXT). Status = `pending`.
- **Expected (DB):** `lumen.sender_domain` row.
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.16.3 — Deliverability dashboard
- **Steps:** Open Deliverability.
- **Expected:** KPIs (bounce rate, complaint rate, reputation). Loads without 5xx.
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.16.4 — Bounce processing
- **Steps:** Use known invalid recipient `bounce@simulator.amazonses.com` (or ACS test) in a one-off campaign.
- **Expected (DB):**
  ```sql
  SELECT event_type, COUNT(*) FROM lumen.campaign_event
   WHERE event_type IN ('bounce','complaint','unsubscribe')
   GROUP BY event_type;
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

---

## 17. Notification Preferences (Unsubscribe)

**Path:** SPARK contact detail → Notification preferences; public unsubscribe link in email footer

### SP.17.1 — Preferences page loads for contact
- **Steps:** Click the public unsubscribe link from the test campaign email.
- **Expected (UI):** Preferences page lists subscription topics. Already-subscribed toggles ON.
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.17.2 — Unsubscribe persists
- **Steps:** Toggle "Marketing emails" off → Save.
- **Expected (DB):**
  ```sql
  SELECT topic, status FROM lumen.contact_notification_pref
   WHERE contact_id=(SELECT id FROM lumen.contact WHERE email='test-sp11@ia-dm.com')
     AND topic='marketing';
  -- Expected: status='unsubscribed'
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.17.3 — Subsequent send respects opt-out
- **Steps:** Re-run §7.1 campaign targeting same list.
- **Expected:** Contact suppressed. `lumen.campaign_event` shows `suppressed` reason.
- **Pass-Fail:** ☐ Pass ☐ Fail

---

## 18. IA Insights — Trends

**Path:** SPARK → Insights → Trends (`/app/services/spark_ia_insights_trends`)

### SP.18.1 — Trends page renders
- **Steps:** Open page.
- **Expected (UI):** Header KPI gauges (4 or 5), trend chart, comparison vs. prior period.
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.18.2 — Time range selector
- **Steps:** Switch between Last 7 / Last 30 / Last 90 days.
- **Expected:** Chart and KPIs update. No 5xx.
- **Pass-Fail:** ☐ Pass ☐ Fail

---

## 19. IA Insights — Intelligence

**Path:** SPARK → Insights → Intelligence (`/app/services/spark_ia_insights_intelligence`)

### SP.19.1 — Intelligence reports list
- **Steps:** Open page.
- **Expected (UI):** Cards for each Intelligence report (6 per product per Platform Intelligence spec). Each card has title + "Run report" button.
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.19.2 — Run one report
- **Steps:** Click a report card.
- **Expected:** Report drawer / detail page renders with sample data or empty-state.
- **Pass-Fail:** ☐ Pass ☐ Fail

---

## 20. IA Insights — Health (Cross-Platform)

**Path:** SPARK → Insights → Health (`/app/services/spark_ia_insights_health`)

### SP.20.1 — Cross-platform page renders
- **Steps:** Open page.
- **Expected (UI):** Cross-platform breakdown bar chart, Business Pulse / Health overview, surfaces from ARION + OLIVER + SPARK.
- **Pass-Fail:** ☐ Pass ☐ Fail

---

## 21. Dashboards + Analytics + Activity Stream + Audit Log

### SP.21.1 — Dashboards (`/app/services/spark_dashboards`)
- **Steps:** Open. Create dashboard `TEST_SP_21 Dash`. Add 2 widgets (e.g., Campaign performance + Contact growth).
- **Expected (DB):** `lumen.dashboard` row + `lumen.dashboard_widget` rows.
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.21.2 — Analytics reports (`spark_analytics_reports`)
- **Steps:** Open. Inspect report library.
- **Expected:** Multiple pre-built reports listed; each runnable.
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.21.3 — Activity stream (`spark_activity_stream`)
- **Steps:** Open.
- **Expected (UI):** Recent events from §1–§17 visible — contact created, campaign sent, form submitted, automation fired, lead accepted, etc.
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.21.4 — Audit log (`spark_audit_log`)
- **Steps:** Open.
- **Expected (UI):** Mutation events with actor, timestamp, entity_type, entity_id, before/after.
- **Expected (DB):**
  ```sql
  SELECT TOP 20 actor_user_id, action, entity_type, created_at
  FROM platform.audit_log
  WHERE tenant_id='8C9527B9-...' AND product='spark'
  ORDER BY created_at DESC;
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

---

## 22. API Keys Management

**Path:** SPARK → Settings → API Keys (`/app/services/spark_api_keys`)

### SP.22.1 — Issue API key
- **Steps:** New key → label `TEST_SP_22 Key`, scope = read-only contacts. Save.
- **Expected (UI):** Key value shown ONCE in a copy-only modal. Subsequent list shows only the prefix + last 4.
- **Expected (DB):**
  ```sql
  SELECT label, prefix, scope_json, revoked_at FROM lumen.api_key
  WHERE label='TEST_SP_22 Key' AND tenant_id='8C9527B9-...';
  -- Expected: 1 row, revoked_at IS NULL, key_hash stored (not plaintext)
  ```
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.22.2 — Use key against API
- **Steps:**
  ```bash
  curl -H "Authorization: Bearer <THE_KEY_FROM_22.1>" \
       https://<lumen-api>/api/v1/contacts?limit=1
  ```
- **Expected:** 200, JSON list with at least the test contact.
- **Pass-Fail:** ☐ Pass ☐ Fail

### SP.22.3 — Revoke
- **Steps:** Revoke the key. Re-run curl.
- **Expected:** 401 unauthorized.
- **Expected (DB):** `revoked_at IS NOT NULL`.
- **Pass-Fail:** ☐ Pass ☐ Fail

---

## 23. Cleanup (optional — re-runnability)

```sql
-- Run after Phase 1 SPARK testing if you want a clean slate.
DELETE FROM lumen.api_key WHERE label='TEST_SP_22 Key';
DELETE FROM lumen.dashboard WHERE name='TEST_SP_21 Dash';
DELETE FROM lumen.suppression_list WHERE domain='example-block.com'
  AND tenant_id='8C9527B9-8999-4B31-A306-F3D4CCC39FBD';
DELETE FROM lumen.contact WHERE source_lead_id IN
  (SELECT lead_id FROM lumen.lead
   WHERE leadgen_job_id IN (SELECT id FROM lumen.leadgen_job
                            WHERE tenant_id='8C9527B9-8999-4B31-A306-F3D4CCC39FBD'
                              AND created_at > DATEADD(day,-1,SYSUTCDATETIME())));
DELETE FROM lumen.lead WHERE leadgen_job_id IN
  (SELECT id FROM lumen.leadgen_job WHERE tenant_id='8C9527B9-...'
                                       AND created_at > DATEADD(day,-1,SYSUTCDATETIME()));
DELETE FROM lumen.leadgen_job WHERE tenant_id='8C9527B9-...'
                                AND created_at > DATEADD(day,-1,SYSUTCDATETIME());
DELETE FROM lumen.search_profile WHERE name='TEST_SP_12 IA Search';
DELETE FROM lumen.nps_schedule WHERE name='TEST_SP_14 NPS Q1';
DELETE FROM lumen.sms_template WHERE name='TEST_SP_15 Tmpl';
DELETE FROM lumen.sender_domain WHERE domain='test-sp16.ia-dm.com';
DELETE FROM lumen.landing_page WHERE name='TEST_SP_11 LP';
DELETE FROM lumen.form_submission WHERE form_id IN
  (SELECT id FROM lumen.form WHERE name='TEST_SP_10 Form');
DELETE FROM lumen.form WHERE name='TEST_SP_10 Form';
DELETE FROM lumen.scoring_rule WHERE name='TEST_SP_9 Open scores';
DELETE FROM lumen.automation WHERE name='TEST_SP_9 Welcome auto';
DELETE FROM lumen.email_template WHERE name='TEST_SP_8 Tmpl';
DELETE FROM lumen.campaign_event WHERE campaign_id IN
  (SELECT id FROM lumen.campaign WHERE name='TEST_SP_7 Welcome');
DELETE FROM lumen.campaign WHERE name='TEST_SP_7 Welcome';
DELETE FROM lumen.list_member WHERE list_id IN
  (SELECT id FROM lumen.list WHERE name='TEST_SP_4_list');
DELETE FROM lumen.list WHERE name='TEST_SP_4_list';
DELETE FROM lumen.segment WHERE name='TEST_SP_4_seg';
DELETE FROM lumen.account WHERE name='TEST_SP_5 Co';
DELETE FROM lumen.contact WHERE email LIKE 'test-sp%@ia-dm.com';
```

---

## Summary

| Section | Tests | Pass | Fail |
|---|---|---|---|
| 0 — Deploy gate | 3 | | |
| 1 — Contacts | 6 | | |
| 2 — Bulk import | 3 | | |
| 3 — Merge | 1 | | |
| 4 — Custom fields / tags / segments / lists | 4 | | |
| 5 — Companies | 3 | | |
| 6 — Customer Lifecycle Flow | 4 | | |
| 7 — Campaigns | 3 | | |
| 8 — Templates + Newsletter | 3 | | |
| 9 — Workflows & Automations (NEW) | 7 | | |
| 10 — Forms | 5 | | |
| 11 — Landing Pages | 2 | | |
| 12 — Lead Gen V1 (NEW) | 10 | | |
| 13 — Reviews | 3 | | |
| 14 — NPS | 2 | | |
| 15 — SMS | 3 | | |
| 16 — Deliverability | 4 | | |
| 17 — Notification preferences | 3 | | |
| 18 — Insights Trends | 2 | | |
| 19 — Insights Intelligence | 2 | | |
| 20 — Insights Health | 1 | | |
| 21 — Dashboards / activity / audit | 4 | | |
| 22 — API Keys | 3 | | |
| **Total** | **81** | | |
