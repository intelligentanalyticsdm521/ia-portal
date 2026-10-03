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
import { DOCUMENT_CSS, makeContext, renderDocument } from "../../render";
import { toDocument } from "./siteModel";
import { SITE_CSS, renderSiteWidget } from "./siteRender";
import type { TemplateEntry, TemplatePreview } from "../../templateLibraryModel";

export interface SitePageTemplate {
  key: string;
  name: string;
  /** ARION section kinds, in page order. */
  kinds: string[];
  /** The badge — what kind of page this is. */
  purpose: string;
  /**
   * Which SEGMENTS this is for, from templateLibraryModel.BUSINESS_TYPES
   * (D-153: segments, not trades). "Any business" answers every chip; the
   * trade words live in `tags`, where the search reads them.
   */
  businessTypes: string[];
  tags: string[];
  useCase: string;
  bestFor: string;
  featured?: boolean;
  /**
   * The "start from almost nothing" card — FIRST in the grid and the footer
   * button (D-153). It replaces D-146's `last`, which pinned it to the end.
   */
  blank?: boolean;
  /**
   * Words for the GALLERY PICTURE ONLY, per ARION kind.
   *
   * §12's rule stands: a page template is a list of kinds and arion-api fills
   * each one from the business's own details. Nothing here is ever sent to
   * `createSitePage` — it exists so the card can show a lawn company's home
   * page looking like a lawn company's home page instead of a grey box.
   */
  preview?: Record<string, Record<string, unknown>>;
}

/**
 * The pages a small business actually has, plus one per trade.
 *
 * Chosen from what the live ARION sites are made of, not invented. The
 * per-trade homes carry the SAME sections in a DIFFERENT ORDER, because the
 * order is the argument: a snow or heating customer is in a hurry and wants
 * the call-to-action under the banner, a landscaper sells on photographs, and
 * a cleaner sells on price.
 */
export const SITE_PAGE_TEMPLATES: SitePageTemplate[] = [
  {
    key: "home",
    name: "Service business home",
    purpose: "Home page",
    businessTypes: ["Any business"],
    tags: ["home", "front page", "landing", "main"],
    useCase: "The front page every service business needs: a banner saying what you do, the services themselves, why people trust you, and how to get hold of you. Everything on it is filled in from your own business details.",
    bestFor: "Any trade that has not got a home page yet, or has one that does not say what it does.",
    featured: true,
    kinds: ["hero", "services", "stats", "testimonials", "cta", "contact"],
  },
  {
    key: "home_lawn",
    name: "Lawn & landscape home",
    purpose: "Home page",
    businessTypes: ["Service industry"],
    tags: ["lawn", "garden", "landscaping", "grounds", "mowing", "home", "lawn & landscape"],
    useCase: "A home page that sells on the work you can see: the banner, what you do, then a gallery of finished jobs before the prices and the reviews. Photographs win landscaping work, so they come early.",
    bestFor: "Lawn care rounds, landscaping and grounds maintenance — anyone whose best argument is a picture of a finished garden.",
    kinds: ["hero", "services", "gallery", "testimonials", "pricing", "cta", "contact"],
    preview: {
      hero: {
        headline: "Lawns and gardens, kept the way you want them",
        subheadline: "Weekly cuts, seasonal tidy-ups and full landscaping, from a crew that turns up when it says it will.",
        cta_text: "Get a price",
      },
      services: {
        headline: "What we do",
        services: [
          { title: "Weekly lawn care", description: "Cut, edged and cleared, on the same day every week.", icon_name: "🌿" },
          { title: "Seasonal tidy-ups", description: "Beds cleared, hedges cut back, everything taken away.", icon_name: "🍂" },
          { title: "Landscaping", description: "Patios, planting and turfing, designed with you first.", icon_name: "🧱" },
        ],
      },
    },
  },
  {
    key: "home_snow",
    name: "Snow & ice home",
    purpose: "Home page",
    businessTypes: ["Service industry"],
    tags: ["snow", "plowing", "ice", "winter", "gritting", "home", "snow & ice"],
    useCase: "Built for the week it snows: the banner, then the call-to-action band straight underneath, because somebody reading this at six in the morning wants a number, not your story.",
    bestFor: "Snow plowing and ice management, commercial or residential, where contracts are signed in a hurry.",
    kinds: ["hero", "cta", "services", "faq", "stats", "testimonials", "contact"],
    preview: {
      hero: {
        headline: "Clear lots and safe walkways, all winter",
        subheadline: "Plowing, salting and sidewalk clearing on a contract, with a crew on call the moment it starts.",
        cta_text: "Get a winter quote",
      },
      cta: {
        headline: "Snow on the way?",
        subheadline: "Contracts signed before the first storm get first call-out. Tell us your site and we will price it.",
        primary_cta_text: "Request a quote",
        secondary_cta_text: "Call us",
      },
    },
  },
  {
    key: "home_cleaning",
    name: "Cleaning services home",
    purpose: "Home page",
    businessTypes: ["Service industry"],
    tags: ["cleaning", "janitorial", "housekeeping", "office", "home"],
    useCase: "A home page that answers the two questions a cleaning customer has — what does it include and what does it cost — before anything else. Prices sit high up, with the questions people ask underneath.",
    bestFor: "Domestic and commercial cleaning rounds, end-of-tenancy work, office contracts.",
    kinds: ["hero", "services", "pricing", "testimonials", "faq", "cta", "contact"],
    preview: {
      hero: {
        headline: "A clean you do not have to check",
        subheadline: "Homes and offices, cleaned by the same vetted team every visit. Weekly, fortnightly or one-off.",
        cta_text: "See prices",
      },
      pricing: {
        headline: "Straightforward prices",
        plans: [
          { name: "Weekly", price: "$95", period: "per visit", summary: "Two to three hours, everything on the checklist.", features: ["Same cleaner each week", "Products included", "Key held securely"], cta_text: "Book weekly" },
          { name: "Fortnightly", price: "$120", period: "per visit", summary: "The same clean, every other week.", features: ["Same cleaner", "Products included", "Easy to pause"], cta_text: "Book fortnightly" },
          { name: "One-off deep clean", price: "$280", period: "one-off", summary: "Top to bottom, for a move or a fresh start.", features: ["Inside cupboards and appliances", "Windows inside", "Two cleaners"], cta_text: "Book a deep clean" },
        ],
      },
    },
  },
  {
    key: "home_hvac",
    name: "HVAC & plumbing home",
    purpose: "Home page",
    businessTypes: ["Service industry"],
    tags: ["heating", "plumbing", "hvac", "boiler", "emergency", "home", "hvac & plumbing"],
    useCase: "An emergency-first home page: banner, then how to get somebody out today, then the services, how long you have been doing it and what customers say. The questions section catches the ones that ring up to ask.",
    bestFor: "Heating, cooling and plumbing firms who win work on how fast they answer.",
    kinds: ["hero", "cta", "services", "stats", "faq", "testimonials", "contact"],
    preview: {
      hero: {
        headline: "Heating and plumbing, fixed properly",
        subheadline: "Repairs, servicing and installation by engineers who tidy up after themselves.",
        cta_text: "Book an engineer",
      },
      cta: {
        headline: "No heating? No hot water?",
        subheadline: "Call before noon and we will do our best to be with you the same day.",
        primary_cta_text: "Call now",
        secondary_cta_text: "Book online",
      },
    },
  },
  {
    key: "services",
    name: "Services overview",
    purpose: "Services page",
    businessTypes: ["Any business"],
    tags: ["services", "what we do", "prices", "packages"],
    useCase: "Everything you do on one page, with what each thing costs and the questions people ask before they book. The page you send somebody who asks 'do you also do…?'.",
    bestFor: "Any business with more than two services and a habit of explaining them over the phone.",
    featured: true,
    kinds: ["hero", "services", "pricing", "faq", "cta"],
  },
  {
    key: "about",
    name: "About the business",
    purpose: "About page",
    businessTypes: ["Any business"],
    tags: ["about", "story", "team", "history", "values"],
    useCase: "Your story, the people who do the work, the numbers that prove it and what customers say. It is the page people read just before they call, and the one most small sites never get round to writing.",
    bestFor: "Any business where who you are is part of why they choose you — which is most of them.",
    kinds: ["hero", "about", "team", "stats", "testimonials", "cta"],
  },
  {
    key: "contact",
    name: "Contact and booking",
    purpose: "Contact page",
    businessTypes: ["Any business"],
    tags: ["contact", "booking", "enquiry", "form", "phone"],
    useCase: "How to reach you, next to a form that lands in your inbox, with the questions people always ask underneath so the easy ones never become a phone call.",
    bestFor: "Every website. It is the page your adverts and your email signature should point at.",
    featured: true,
    kinds: ["hero", "contact", "faq"],
  },
  {
    key: "landing",
    name: "Seasonal offer landing page",
    purpose: "Landing page",
    businessTypes: ["Any business"],
    tags: ["offer", "campaign", "advert", "seasonal", "promotion", "landing"],
    useCase: "One offer and one form, with nothing else to click. Point an advert, an email or a postcard at it and you can tell exactly what it brought in.",
    bestFor: "A seasonal push — winter contracts, spring tidy-ups, a launch — that should not live on your home page.",
    kinds: ["hero", "content", "testimonials", "contact"],
    preview: {
      hero: {
        headline: "Book your autumn tidy-up",
        subheadline: "Beds cleared, hedges cut and everything taken away — booked in before the leaves are down.",
        cta_text: "Get my price",
      },
    },
  },
  {
    // 2 Oct 2026, Brandon: the website's library gets the same empty page the
    // proposal's has - nothing on it. It used to open on a banner.
    key: "blank",
    name: "Start from an empty page",
    purpose: "Empty page",
    businessTypes: ["Any business"],
    tags: ["blank", "empty", "nothing", "from scratch"],
    useCase: "A banner and nothing else. You add every other section yourself from the panel, which is the long way round unless you already know exactly what this page is.",
    bestFor: "A page that is nothing like the others — a policy page, a one-off notice, something you are rebuilding by hand.",
    blank: true,
    kinds: [],
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

/* ══════════════════════════════════════════════════════════════════════════
   The library (§11.9, D-146)
   ══════════════════════════════════════════════════════════════════════════ */

/** A page preview is drawn at desktop width and scaled down by the card. */
export const SITE_PREVIEW_WIDTH = 1100;

/**
 * Trade-neutral words for the GALLERY PICTURE, one set per ARION kind.
 *
 * Not content. §12's rule is that arion-api builds every section from the
 * business's own details, and nothing in this map is ever sent to the server —
 * `createSitePage` still posts `{ kind }` and only `{ kind }`. This exists so a
 * card can show a page rather than a stack of empty bands, and a template with
 * words of its own (`preview`) layers over the top.
 */
export const PREVIEW_DEFAULTS: Record<string, Record<string, unknown>> = {
  hero: {
    headline: "Work done properly, when we said we would",
    subheadline: "Serving the area for years, with a crew that turns up, tidies up and answers the phone.",
    cta_text: "Get a price",
  },
  services: {
    headline: "What we do",
    services: [
      { title: "Regular service", description: "The work you book in and forget about, on a schedule that suits you.", icon_name: "✓" },
      { title: "One-off jobs", description: "Priced before we start, with no surprises at the end.", icon_name: "✦" },
      { title: "Emergencies", description: "When something has gone wrong and it cannot wait until next week.", icon_name: "!" },
    ],
  },
  pricing: {
    headline: "What it costs",
    plans: [
      { name: "Standard", price: "$95", period: "per visit", summary: "The regular job, done properly.", features: ["Booked in advance", "Same crew each time"], cta_text: "Book it" },
      { name: "Full service", price: "$160", period: "per visit", summary: "Everything in standard, plus the extras.", features: ["Priority booking", "Everything taken away"], cta_text: "Book it" },
      { name: "Contract", price: "$79", period: "per month", summary: "Spread over the year, cancel any time.", features: ["Two visits a year", "No call-out charge"], cta_text: "Ask us" },
    ],
  },
  testimonials: {
    headline: "What customers say",
    testimonials: [
      { quote: "Turned up on time, did exactly what was quoted and left the place spotless.", attribution: "A customer", role: "Regular since last year", rating: 5 },
      { quote: "Straight answer on the phone and a price the same day. Rare these days.", attribution: "A customer", role: "One-off job", rating: 5 },
      { quote: "We have used them across three sites now and never had to chase them once.", attribution: "A property manager", role: "Commercial contract", rating: 5 },
    ],
  },
  stats: {
    headline: "The numbers",
    stats: [
      { value: "17", suffix: "", label: "Years in business" },
      { value: "2,400", suffix: "+", label: "Jobs completed" },
      { value: "2", suffix: "h", label: "Average time to answer" },
      { value: "98", suffix: "%", label: "Customers who book again" },
    ],
  },
  faq: {
    headline: "Questions people ask",
    faqs: [
      { question: "How quickly can you come out?", answer: "Most jobs within a week; emergencies the same day where we can." },
      { question: "Do you give a fixed price?", answer: "Yes. We price before we start and that is what you pay unless you change the job." },
      { question: "Are you insured?", answer: "Fully, and we will send the certificates before the first visit." },
    ],
  },
  about: {
    headline: "About us",
    subheadline: "A family business, still run by the people who started it",
    story_paragraphs: [
      "We started with one van and a list of neighbours. The list got longer, the vans multiplied, and the way we work never changed: turn up when we say we will, do it properly, and leave the place tidy.",
      "Everyone who works here is trained, insured and known to us. There are no subcontractors on your property that we have not met.",
    ],
    values: [
      { title: "We turn up", description: "A time we give you is a time we keep." },
      { title: "We price first", description: "Nothing gets added to your bill without a yes." },
      { title: "We tidy up", description: "You should not be able to tell we were there, except for the work." },
    ],
  },
  team: {
    headline: "The people",
    members: [
      { name: "The owner", role: "Runs the jobs and answers the phone" },
      { name: "Crew lead", role: "On site, every day" },
      { name: "Office", role: "Bookings, quotes and invoices" },
    ],
  },
  gallery: {
    headline: "Recent work",
    images: [{ caption: "Before and after" }, { caption: "A finished job" }, { caption: "On site" }],
  },
  cta: {
    headline: "Ready when you are",
    subheadline: "Tell us what you need and we will come back with a price.",
    primary_cta_text: "Get a quote",
    secondary_cta_text: "Call us",
  },
  contact: {
    headline: "Get in touch",
    contact_methods: [
      { label: "Phone", value: "(555) 0192" },
      { label: "Email", value: "office@example.test" },
      { label: "Hours", value: "Monday to Friday, 7am to 6pm" },
    ],
    form_fields: ["Name", "Email", "Phone", "What do you need?"],
    submit_text: "Send it",
    email_to: "office@example.test",
  },
  content: {
    headline: "A bit more detail",
    subheadline: "The free section: headings, words, pictures and buttons, in one to three columns.",
  },
};

/** The sample fields one section of a template is drawn with. */
export function previewFieldsFor(template: SitePageTemplate, kind: string): Record<string, unknown> {
  return { ...(PREVIEW_DEFAULTS[kind] || {}), ...(template.preview?.[kind] || {}) };
}

/**
 * One page template's picture: the real page, through THE renderer.
 *
 * The same `toDocument` the builder itself uses, rendered by `render.ts` with
 * the website adapter plugged in at `ctx.extra` — exactly as the canvas does
 * it, so the card cannot show a layout the builder would not.
 */
export function sitePagePreview(
  template: SitePageTemplate,
  accent = "#0C4A60",
): TemplatePreview {
  const doc = toDocument(template.kinds.map((kind, index) => ({
    index, handle: null, kind, editable: true,
    label: kind, fields: previewFieldsFor(template, kind), node: null,
  })));
  const ctx = makeContext(doc, { mode: "view", accent, extra: renderSiteWidget });
  return {
    html: renderDocument(doc, ctx),
    css: `${DOCUMENT_CSS}\n${SITE_CSS}`,
    width: SITE_PREVIEW_WIDTH,
  };
}

/** Every page template as a library entry, with "one section" first (D-153). */
export function siteLibrary(accent = "#0C4A60"): TemplateEntry[] {
  return SITE_PAGE_TEMPLATES.map((t) => ({
    id: t.key,
    title: t.name,
    purpose: t.purpose,
    businessTypes: t.businessTypes,
    tags: t.tags,
    useCase: t.useCase,
    bestFor: t.bestFor,
    featured: t.featured,
    blank: t.blank,
    preview: () => sitePagePreview(t, accent),
  }));
}
