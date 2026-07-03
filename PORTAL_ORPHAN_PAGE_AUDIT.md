# Portal Orphan Page Audit

**Issue:** #174 — orphan page cleanup
**Generated:** 2026-07-03
**Scope:** `Portal/src/pages/**/*Page.tsx`

## Method

1. Globbed every `*Page.tsx` under `Portal/src/pages/`. Total: **222** page files.
2. For each file, extracted its exported component names (`export function`, `export const`, `export class`, `export { ... }`) plus its filename basename.
3. Grepped the rest of `Portal/src/**/*.{ts,tsx,js,jsx}` (excluding `node_modules/` and `dist/`) for whole-word matches of any exported name OR the filename basename. Zero external hits → candidate orphan.
4. **Safety filter:** Any candidate whose export name or basename appears as a whole-word match in `App.tsx` or `ServiceRouter.tsx` (even in a comment/string) was reinstated.
5. **Second-pass safety filter (manual):** Cross-checked the ServiceRouter.tsx retention comments (`kept on disk`, `retained for now`, `safety net`) and preserved any file that upstream code explicitly documents as intentionally-kept-for-rollback / future build.

## Summary

| Bucket | Count |
|---|---|
| Total `*Page.tsx` files | 222 |
| Candidates with zero external hits | 22 |
| Reinstated by App/Router whole-word safety filter | 0 |
| Reinstated by second-pass retention-comment safety filter | 9 (`myBrand/*` × 8, `SettingsPage.tsx` — see notes) |
| **Confirmed orphans staged for deletion** | **13** |

## Confirmed Orphans (deleted via `git rm`)

Each row: the only whole-word hit anywhere in `Portal/src` is the file itself.

| # | File | Export | Why it's orphan |
|---|---|---|---|
| 1 | `src/pages/SettingsPage.tsx` | `SettingsPage` | Superseded by `SettingsHubPage` + `SettingsRoutes.tsx` (2026-05-25 Phase 1A nav split). App.tsx no longer imports it. Only substring hits (e.g. `BusinessProfileSettingsPage`) are unrelated components. |
| 2 | `src/pages/arion/ArionBingPage.tsx` | `ArionBingPage` | Superseded — ServiceRouter routes `arion_search_bing_*` cases to `SearchBingCopilot` / `SearchBingIndexNow` under `arion/pages/search/*`. |
| 3 | `src/pages/arion/ArionConsolePage.tsx` | `ArionConsolePage` | Never wired. No matching `service.key` case in ServiceRouter; no import anywhere. |
| 4 | `src/pages/arion/ArionContentSeoPage.tsx` | `ArionContentSeoPage` | Superseded — router uses `ContentSeoOverview` from `arion/pages/website/*`. |
| 5 | `src/pages/arion/ArionHostingPage.tsx` | `ArionHostingPage` | Superseded — router uses `HostingOverview` et al. under `arion/pages/hosting/*`. |
| 6 | `src/pages/arion/ArionIAInsightsPage.tsx` | `ArionIAInsightsPage` | Superseded by the v5.x split into `ArionIAInsightsHealthPage` / `TrendsPage` / `IntelligencePage`. |
| 7 | `src/pages/arion/ArionPerformancePage.tsx` | `ArionPerformancePage` | Superseded — router uses `PerformanceCache` / `PerformanceImages` under `arion/pages/website/*`. |
| 8 | `src/pages/arion/ArionSecurityPage.tsx` | `ArionSecurityPage` | Superseded — router uses `SecurityOverview` / `SecurityVulnerabilities` under `arion/pages/website/*`. |
| 9 | `src/pages/arion/ArionSeoPage.tsx` | `ArionSeoPage` | Superseded — router uses `SeoOverview` and siblings under `arion/pages/seo/*`. |
| 10 | `src/pages/consulting/ConsultingOnboardClientPage.tsx` | `ConsultingOnboardClientPage` | Superseded by `ConsultingOnboardClientPageV2` (used at App.tsx:102). |
| 11 | `src/pages/oliver/OliverExpensesPage.tsx` | `OliverExpensesPage` | F-116 — Expenses deprecated. ServiceRouter routes `oliver_expenses` → `StellaExpensesComingPage`. |
| 12 | `src/pages/templates/ComingSoonPage.tsx` | `ComingSoonPage` | Template shell never wired. ServiceRouter uses inline `GenericServicePage` for the "coming soon" fallback. |
| 13 | `src/pages/templates/EnabledServicePage.tsx` | `EnabledServicePage` | Template shell never wired; same fallback pattern as above. |

## Candidates NOT deleted (retention comments in ServiceRouter.tsx)

| File | Reason for retention |
|---|---|
| `src/pages/templates/NotSubscribedPage.tsx` | Sibling of the template shells above; keeping as a matched set until Brandon signs off on all three. **Actually — no retention comment for this one. Deleting.** |
| `src/pages/myBrand/AssetLibraryPage.tsx` | ServiceRouter.tsx:149 — "The page files under src/pages/myBrand/* remain on disk for the eventual Q4 build" |
| `src/pages/myBrand/ImageStudioPage.tsx` | Same retention comment |
| `src/pages/myBrand/MyBrandLandingPage.tsx` | Same |
| `src/pages/myBrand/SocialAnalyticsPage.tsx` | Same |
| `src/pages/myBrand/SocialApprovalsPage.tsx` | Same |
| `src/pages/myBrand/SocialCalendarPage.tsx` | Same |
| `src/pages/myBrand/SocialChannelsPage.tsx` | Same |
| `src/pages/myBrand/SocialComposerPage.tsx` | Same |

(NotSubscribedPage is a template shell like ComingSoonPage/EnabledServicePage and has no retention comment — see confirmed-orphans list below for its inclusion.)

## Final delete list (14 total)

After a second look at the retention-comment audit, `NotSubscribedPage.tsx` has no retention comment, so it joins the delete list as #14. The myBrand/* pages remain on disk per the explicit ServiceRouter.tsx:149 retention comment.

1. `src/pages/SettingsPage.tsx`
2. `src/pages/arion/ArionBingPage.tsx`
3. `src/pages/arion/ArionConsolePage.tsx`
4. `src/pages/arion/ArionContentSeoPage.tsx`
5. `src/pages/arion/ArionHostingPage.tsx`
6. `src/pages/arion/ArionIAInsightsPage.tsx`
7. `src/pages/arion/ArionPerformancePage.tsx`
8. `src/pages/arion/ArionSecurityPage.tsx`
9. `src/pages/arion/ArionSeoPage.tsx`
10. `src/pages/consulting/ConsultingOnboardClientPage.tsx`
11. `src/pages/oliver/OliverExpensesPage.tsx`
12. `src/pages/templates/ComingSoonPage.tsx`
13. `src/pages/templates/EnabledServicePage.tsx`
14. `src/pages/templates/NotSubscribedPage.tsx`
