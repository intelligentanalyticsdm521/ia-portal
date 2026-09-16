/**
 * builder/adapters/website/siteTemplates.ts — never a blank page.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §7, THE TEMPLATE PRINCIPLE:
 *   "Open with pre-made sections and pre-made templates, never a blank page.
 *    The header is pre-placed and already shows the business's information;
 *    the footer is pre-placed … Templates are guidelines: open one, adjust it,
 *    save as a new template."
 *
 * ── WHAT A WEBSITE TEMPLATE IS, EXACTLY ───────────────────────────────────
 * A LIST OF ARION SECTION KINDS, and nothing else. It is not a bag of copy:
 * every section the template names is built by arion-api from the business's
 * OWN details (lib/websiteBuilder/starterSections.js — its name, its tagline,
 * its services, its real prices out of the catalogue, its booking link). A
 * template that carried words would be publishing somebody else's story on a
 * client's website, which is the defect `starterSections` exists to stop.
 *
 * So the adapter walks the list, asks the server for each section in turn, and
 * lays them out. The header and footer are not in the list because they come
 * from the site's theme and are drawn as chrome (siteRender).
 *
 * Pure: no React, no fetch.
 */

export interface SitePageTemplate {
  key: string;
  name: string;
  /** One line, in a business owner's words. */
  description: string;
  /** ARION section kinds, in page order. */
  kinds: string[];
  /** What the gallery card draws. */
  tag: string;
}

/**
 * The five pages a small business actually has.
 *
 * Chosen from what the five live ARION sites are made of, not invented: every
 * one of them has a home page with a hero and services, an about page, a
 * services page and a contact page, and landing pages are what SPARK sends
 * traffic to.
 */
export const SITE_PAGE_TEMPLATES: SitePageTemplate[] = [
  {
    key: "home",
    name: "Home page",
    description: "Banner, what you do, why people trust you, and how to reach you.",
    tag: "Pages",
    kinds: ["hero", "services", "stats", "testimonials", "cta", "contact"],
  },
  {
    key: "services",
    name: "Services page",
    description: "Everything you do, what it costs, and the questions people ask.",
    tag: "Pages",
    kinds: ["hero", "services", "pricing", "faq", "cta"],
  },
  {
    key: "about",
    name: "About page",
    description: "Your story, the people, the numbers, and what customers say.",
    tag: "Pages",
    kinds: ["hero", "about", "team", "stats", "testimonials", "cta"],
  },
  {
    key: "contact",
    name: "Contact page",
    description: "How to reach you, next to a form that lands in your inbox.",
    tag: "Pages",
    kinds: ["hero", "contact", "faq"],
  },
  {
    key: "landing",
    name: "Landing page",
    description: "One offer, one form. For an advert or a campaign to point at.",
    tag: "Pages",
    kinds: ["hero", "content", "testimonials", "contact"],
  },
  {
    key: "blank",
    name: "Start from one section",
    description: "A banner and nothing else. Add what you want from the panel.",
    tag: "Pages",
    kinds: ["hero"],
  },
];

export function sitePageTemplate(key: string): SitePageTemplate | undefined {
  return SITE_PAGE_TEMPLATES.find((t) => t.key === key);
}

/* ══════════════════════════════════════════════════════════════════════════
   Pre-made sections, for the gallery
   ══════════════════════════════════════════════════════════════════════════ */

export interface SitePremade {
  key: string;
  name: string;
  description: string;
  tags: string[];
  /** The ARION kind the server builds. */
  kind: string;
  /** How many repeats to ask for, when the kind has a list. */
  count?: { min: number; max: number; label: string; default: number };
}

/**
 * The gallery's "Pre-made sections" tab.
 *
 * One card per ARION section kind — the same twelve the pane offers, shown as
 * whole sections with a picture, because a business owner thinks in "a prices
 * page", not in "a widget". Both routes add the same thing the same way.
 *
 * `SECTION_KIND_CARDS` is generated from the shared fixture the two repos
 * pin (`test/fixtures/website-section-kinds.json`), so a kind added in
 * arion-api and not here fails a test rather than quietly going missing.
 */
export const SITE_PREMADE: SitePremade[] = [
  { key: "hero", kind: "hero", name: "Hero banner", tags: ["Top of page"], description: "The big banner at the top of a page — one headline, one line of support, one button." },
  { key: "services", kind: "services", name: "What you do", tags: ["What you offer"], description: "A row of cards, one per service, each with a short description.", count: { min: 1, max: 8, label: "How many services?", default: 3 } },
  { key: "about", kind: "about", name: "About the business", tags: ["Your story"], description: "Your story beside a picture, then the things you stand for." },
  { key: "pricing", kind: "pricing", name: "What it costs", tags: ["What you offer"], description: "Your prices, one card per package, with what each one includes.", count: { min: 1, max: 6, label: "How many packages?", default: 3 } },
  { key: "testimonials", kind: "testimonials", name: "What customers say", tags: ["Trust"], description: "Quotes from real customers, with who said them.", count: { min: 1, max: 8, label: "How many reviews?", default: 3 } },
  { key: "gallery", kind: "gallery", name: "Picture gallery", tags: ["Trust"], description: "A grid of photographs of your work." },
  { key: "team", kind: "team", name: "The people", tags: ["Your story"], description: "Who works here, with a photograph and what they do.", count: { min: 1, max: 12, label: "How many people?", default: 3 } },
  { key: "stats", kind: "stats", name: "Numbers that matter", tags: ["Trust"], description: "A band of figures — years in business, jobs done, how fast you answer.", count: { min: 1, max: 6, label: "How many numbers?", default: 3 } },
  { key: "faq", kind: "faq", name: "Questions and answers", tags: ["Trust"], description: "The questions customers keep asking, with your answers.", count: { min: 1, max: 20, label: "How many questions?", default: 4 } },
  { key: "cta", kind: "cta", name: "Call to action", tags: ["Get in touch"], description: "A wide band with a headline and one or two buttons." },
  { key: "contact", kind: "contact", name: "Contact and form", tags: ["Get in touch"], description: "How to reach you, next to a form that sends straight to your inbox." },
  { key: "content", kind: "content", name: "Words and pictures", tags: ["Your story"], description: "A free section: headings, paragraphs, pictures, buttons and video, in one to three columns.", count: { min: 1, max: 3, label: "How many columns?", default: 1 } },
];

export const SITE_PREMADE_TAGS = ["All", "Top of page", "What you offer", "Your story", "Trust", "Get in touch"];

export function sitePremade(key: string): SitePremade | undefined {
  return SITE_PREMADE.find((p) => p.key === key);
}

/**
 * Which list a counted section repeats — so "how many? 3" can be applied to
 * the section the server just built without a second question.
 */
export function repeatFieldFor(kind: string): string | null {
  switch (kind) {
    case "services": return "services";
    case "pricing": return "plans";
    case "testimonials": return "testimonials";
    case "team": return "members";
    case "stats": return "stats";
    case "faq": return "faqs";
    case "gallery": return "images";
    default: return null;
  }
}

/** One blank row of a counted list, shaped for the kind it belongs to. */
export function blankRow(kind: string): Record<string, unknown> {
  switch (kind) {
    case "services": return { title: "", description: "", icon_name: "check" };
    case "pricing": return { name: "", price: "", period: "", summary: "", features: [""], cta_text: "", cta_href: "#contact", offering_id: "" };
    case "testimonials": return { quote: "", attribution: "", role: "", rating: 5 };
    case "team": return { name: "", role: "", photo_url: "", photo_alt: "", photo_id: "" };
    case "stats": return { value: "", prefix: "", suffix: "", label: "" };
    case "faq": return { question: "", answer: "" };
    case "gallery": return { url: "", id: "", alt: "", caption: "", category: "" };
    default: return {};
  }
}

/**
 * Grow or shrink a counted list to `n`, keeping what is already there.
 *
 * "How many?" is asked ONCE, before the section is added, and can be changed
 * afterwards from the inspector — same function both times, so the two cannot
 * disagree.
 */
export function withCount(fields: Record<string, any>, kind: string, n: number): Record<string, any> {
  const key = repeatFieldFor(kind);
  if (!key) return fields;
  const current: any[] = Array.isArray(fields[key]) ? fields[key] : [];
  if (current.length === n) return fields;
  const next = Array.from({ length: n }, (_, i) => current[i] ?? blankRow(kind));
  return { ...fields, [key]: next };
}
