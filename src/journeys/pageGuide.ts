// pageGuide.ts — page-by-page walkthrough, GENERATED from the live nav.
//
// Brandon 2026-07-28: "Each navigation page does something specific on each
// platform. The walkthrough should go page by page — if you click on Digital
// Presence you go to your dashboard, here's what is important on this page,
// next let's click on Websites, here are the key pieces for websites, and
// then go in whatever order makes sense but probably top to bottom."
//
// WHY GENERATE INSTEAD OF HAND-LISTING
// The first cut hand-picked ~12 "curriculum" pages per product, which meant
// most of the nav was never explained and the list silently drifted whenever
// nav changed. Walking SUB_NAV_CONFIGS guarantees COMPLETE, IN-ORDER
// coverage of every page a user can actually click, forever — while the
// teaching copy stays hand-written per page (the whole point; a generic
// "Opens the X page" blurb is what made the old derived tours useless).
//
// Anything without authored copy is reported by missingPageContent() rather
// than quietly shipping filler.
import { SUB_NAV_CONFIGS } from "../components/SubNav";
import type { TourStep } from "../components/GuidedTour";
import type { InteractiveStep } from "../components/walkthroughs/InteractiveWalkthroughRunner";
import type { JourneyProduct, JourneyStep } from "./types";

/** Hand-written teaching content for ONE nav page. */
export interface PageContent {
  /** What this page is and why it exists. 1-2 sentences — the tour is a walk,
   *  not a manual. */
  body: string;
  /** Optional headline override; defaults to the nav label. */
  title?: string;
  /** Extra stops ON this page — the specific things worth pointing at. */
  onPage?: Array<{
    title: string;
    body: string;
    targetSelector?: string;
    placement?: TourStep["placement"];
    waitMs?: number;
  }>;
  /** Hands-on sub-steps for the interactive walkthrough. */
  doIt?: InteractiveStep[];
  /**
   * Skip this page in the INTERACTIVE walkthrough even if doIt exists.
   * Brandon 2026-07-28 on OLIVER: "we need to be a little more careful there
   * since that's actual payment data" — we never walk a user into creating,
   * refunding or deleting anything financial as a practice exercise.
   */
  readOnly?: boolean;
  /** Why it's read-only, shown in the tour so the caution is explicit. */
  readOnlyNote?: string;
}

export type PageContentMap = Record<string, PageContent>;

/**
 * Build the page-by-page steps for a product, in nav order, top to bottom.
 * Group headers become the section label, so the tooltip always says which
 * part of the nav you're in.
 */
export function buildPageSteps(
  product: JourneyProduct,
  content: PageContentMap,
): JourneyStep[] {
  const config = SUB_NAV_CONFIGS[product];
  if (!config) return [];
  const steps: JourneyStep[] = [];

  for (const group of config.groups) {
    const sectionLabel = group.label || "Overview";
    for (const item of group.items) {
      // Never teach a page the user can't see.
      //
      // The tour is generated from the nav so coverage can't drift — but that
      // cuts both ways: once the SPARK feature wall hid ~20 surfaces, the tour
      // would happily walk someone to Contact 360 or Social Scheduler and then
      // stall, because the nav link it wants to highlight isn't rendered.
      //
      // `hidden` and `addon` are static facts, so they're filtered here.
      // (Tier-gated items still appear; a Standard user on a Pro step gets the
      // runner's honest "can't find that control" rather than a dead end.)
      if (item.hidden || item.addon) continue;
      const c = content[item.key];
      if (!c) continue; // unauthored pages are reported, never filled with noise
      steps.push({
        id: `${product}.${item.key}`,
        label: item.label,
        sectionLabel,
        route: item.route,
        keywords: [item.label.toLowerCase()],
        explain: {
          title: c.title || item.label,
          body: c.body,
          // Spotlight the nav link itself — that's what teaches people WHERE
          // this page lives, which is the thing they actually forget.
          targetSelector: `a[href='${item.route}']`,
          placement: "right",
        },
        onPage: c.onPage,
        doIt: c.readOnly ? undefined : c.doIt,
      });
    }
  }
  return steps;
}

/** Nav pages with no authored copy yet — the honest to-do list. */
export function missingPageContent(
  product: JourneyProduct,
  content: PageContentMap,
): Array<{ key: string; label: string; section: string }> {
  const config = SUB_NAV_CONFIGS[product];
  if (!config) return [];
  const out: Array<{ key: string; label: string; section: string }> = [];
  for (const group of config.groups) {
    for (const item of group.items) {
      if (!content[item.key]) {
        out.push({ key: item.key, label: item.label, section: group.label || "—" });
      }
    }
  }
  return out;
}

/** Coverage summary — used by the dev audit script. */
export function pageCoverage(product: JourneyProduct, content: PageContentMap) {
  const config = SUB_NAV_CONFIGS[product];
  const total = config ? config.groups.reduce((n, g) => n + g.items.length, 0) : 0;
  const missing = missingPageContent(product, content).length;
  return { total, authored: total - missing, missing };
}
