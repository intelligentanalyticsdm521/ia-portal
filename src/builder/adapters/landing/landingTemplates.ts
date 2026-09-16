/**
 * builder/adapters/landing/landingTemplates.ts — the landing page never opens
 * blank either.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §7, the template principle. The old
 * stacked-card editor already half-knew this: it seeded a new page with
 * "hero, text, cta, form … so nobody faces an empty screen wondering what a
 * 'block' is". That instinct was right and is kept; what it lacked was more
 * than one shape, and a way to see the page while building it.
 *
 * Pure: no React, no fetch.
 */
import {
  makeSection, makeWidget, emptyDocument,
  type BuilderDocument, type Section, type Widget,
} from "../../model";
import { LANDING_CSS, defaultFormFields, makeLandingContext, renderLandingSection } from "./landingRender";
import type { TemplateEntry, TemplatePreview } from "../../templateLibraryModel";
import type { PremadeSection } from "../../templates";

const one = (widgets: Widget[], extra: Partial<Section> = {}) =>
  makeSection({ ...extra, columns: [{ id: `c_${Math.random().toString(36).slice(2, 8)}`, widgets }], layout: 1 });

export interface LandingBusiness {
  name: string;
  address?: string;
  email?: string;
  phone?: string;
}

/* ══════════════════════════════════════════════════════════════════════════
   Pre-made sections
   ══════════════════════════════════════════════════════════════════════════ */

export const LANDING_PREMADE_SECTIONS: PremadeSection[] = [
  {
    key: "lp_hero",
    name: "Headline & picture",
    description: "The top of the page — one line saying what you do, over a photo.",
    tags: ["Top"],
    build: () => one([makeWidget("hero", { headline: "", sub: "", image: "", alt: "", align: "Centre" })],
      { label: "Headline", padding: 32 }),
  },
  {
    key: "lp_words",
    name: "Some words",
    description: "A heading and a paragraph or two. The part that explains the offer.",
    tags: ["Middle"],
    build: () => one([
      makeWidget("heading", { text: "", level: "Section" }),
      makeWidget("paragraph", { text: "" }),
    ], { label: "Words", padding: 16 }),
  },
  {
    key: "lp_reasons",
    name: "Reasons to choose you",
    description: "Short points, one per line. Three or four is what people read.",
    tags: ["Middle"],
    build: () => one([
      makeWidget("heading", { text: "Why us", level: "Section" }),
      makeWidget("list", { items: ["", "", ""] }),
    ], { label: "Reasons", padding: 16 }),
  },
  {
    key: "lp_two_up",
    name: "Picture beside words",
    description: "A photo on one side and the copy on the other. Stacks on a phone.",
    tags: ["Middle", "Layout"],
    build: () => makeSection({
      label: "Picture beside words",
      layout: 2,
      padding: 16,
      columns: [
        { id: `c_${Math.random().toString(36).slice(2, 8)}`, widgets: [makeWidget("image", { src: "", alt: "" })] },
        { id: `c_${Math.random().toString(36).slice(2, 8)}`, widgets: [makeWidget("paragraph", { text: "" })] },
      ],
    }),
  },
  {
    key: "lp_quote",
    name: "What a customer said",
    description: "One quote with a name under it. Worth more than a page of your own copy.",
    tags: ["Trust"],
    build: () => one([makeWidget("testimonial", { quote: "", attribution: "", rating: 5 })],
      { label: "What a customer said", padding: 16 }),
  },
  {
    key: "lp_gallery",
    name: "Photos",
    description: "A grid of pictures — before-and-afters, a portfolio, what you have done.",
    tags: ["Trust"],
    build: () => one([makeWidget("gallery", { items: ["", "", "", "", "", ""] })], { label: "Photos", padding: 16 }),
  },
  {
    key: "lp_cta",
    name: "One button",
    description: "The thing you want them to do, on its own so it cannot be missed.",
    tags: ["Bottom"],
    build: () => one([makeWidget("button", { label: "Get a quote", url: "#form", style: "Solid", align: "Centre" })],
      { label: "Button", padding: 16 }),
  },
  {
    key: "lp_form",
    name: "Contact form",
    description: "Name, email and a message. Every submission becomes a contact, automatically.",
    tags: ["Bottom"],
    build: () => one([makeWidget("form", {
      heading: "Get in touch", submit_label: "Send", fields: defaultFormFields(),
    })], { label: "Contact form", padding: 16 }),
  },
  {
    key: "lp_footer",
    name: "Footer",
    description: "Your business name, how to reach you, and any small print.",
    tags: ["Bottom"],
    build: () => one([
      makeWidget("social_links", { links: [] }),
      makeWidget("footer_note", { text: "" }),
    ], { label: "Footer", padding: 20 }),
  },
];

export const LANDING_PREMADE_TAGS = ["All", "Top", "Middle", "Trust", "Bottom", "Layout"];

function premade(key: string): Section {
  const p = LANDING_PREMADE_SECTIONS.find((x) => x.key === key);
  if (!p) throw new Error(`no pre-made landing section "${key}"`);
  return p.build();
}

/**
 * A pre-made section carrying THIS template’s own words.
 *
 * §11.9/D-146 asked for a picture of every template, and a picture of a page
 * whose every field is empty is a picture of nothing. The words are generic,
 * true of any trade, and editable in place like everything else. The pre-made
 * sections themselves stay empty — they are what you add to a page you are
 * already writing.
 */
function say(section: Section, props: Record<string, unknown>, widgetIndex = 0): Section {
  const w = section.columns[0].widgets[widgetIndex];
  if (w) w.props = { ...w.props, ...props };
  return section;
}

function premadeSaying(key: string, props: Record<string, unknown>, widgetIndex = 0): Section {
  return say(premade(key), props, widgetIndex);
}
/* ══════════════════════════════════════════════════════════════════════════
   The shipped templates
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * A shipped landing page, as the library (§11.9, D-146) shows it.
 *
 * `description` is gone: the card carries a real render, so the words say
 * what the page is FOR and who should point traffic at it.
 */
export interface LandingTemplate {
  key: string;
  name: string;
  purpose: string;
  businessTypes: string[];
  tags: string[];
  useCase: string;
  bestFor: string;
  featured?: boolean;
  build: (business: LandingBusiness, accent: string) => BuilderDocument;
}

function withFooter(sections: Section[], business: LandingBusiness): Section[] {
  const f = premade("lp_footer");
  const note = f.columns[0].widgets.find((w) => w.kind === "footer_note");
  if (note) {
    // The business's own line, pre-filled — §7's "the footer is pre-placed and
    // already shows the business's information". Not required by law here the
    // way an email's is, so it is editable and removable like anything else.
    (note.props as any).text = [business.name, business.address, business.phone, business.email]
      .filter(Boolean).join(" · ");
  }
  return [...sections, f];
}

export const LANDING_TEMPLATES: LandingTemplate[] = [
  {
    key: "lead_capture",
    name: "Get in touch",
    purpose: "Lead capture",
    businessTypes: ["Any business"],
    tags: ["enquiry", "form", "leads", "campaign", "contact"],
    useCase: "Headline, what you do, why you, and a form. The page most campaigns should point at, because everything on it is arranged to get one enquiry out of one visitor.",
    bestFor: "Any advert, email or postcard where the only thing you want back is a name and a number.",
    featured: true,
    build: (business, accent) => {
      const doc = emptyDocument({ style: "landing", accent });
      doc.sections = withFooter([
        premadeSaying("lp_hero", {
          headline: "Tidy, reliable work — booked in this week",
          sub: "Tell us what you need and we will come back with a price the same day.",
        }), say(premadeSaying("lp_words", { text: "What we do" }, 0), {
          text: "We do the job you booked, at the time we said, for the price we quoted. No subcontractors you have never met, no extras added at the end, and the site left clean.",
        }, 1), premadeSaying("lp_reasons", {
          items: [
            "A fixed price before we start",
            "Fully insured, and happy to prove it",
            "The same crew, every visit",
            "We tidy up before we leave",
          ],
        }, 1),
        premadeSaying("lp_quote", {
          quote: "Quoted on the Monday, done by the Thursday, and the price was the price. I have already recommended them twice.",
          attribution: "A customer, this year",
        }), premade("lp_form"),
      ], business);
      return doc;
    },
  },
  {
    key: "offer",
    name: "One offer",
    purpose: "One offer",
    businessTypes: ["Any business", "Retail & hospitality"],
    tags: ["offer", "deal", "discount", "seasonal", "promotion"],
    useCase: "A single deal, said plainly, with one button and the form underneath. Nothing else on the page competes with it, which is the whole point of sending traffic somewhere other than your home page.",
    bestFor: "A seasonal push, a launch price, or a limited run you want gone by the end of the month.",
    build: (business, accent) => {
      const doc = emptyDocument({ style: "landing", accent });
      doc.sections = withFooter([
        premadeSaying("lp_hero", {
          headline: "Ten per cent off, booked this month",
          sub: "The same work, the same crew, a better price — if the job goes in the diary before the month is out.",
        }),
        say(premadeSaying("lp_words", { text: "What is on offer" }, 0), {
          text: "Book any job before the end of the month and we will take ten per cent off the quoted price. Nothing to print, no code to remember: the discount is on the quote when it reaches you.",
        }, 1),
        premadeSaying("lp_cta", { label: "Get my price" }), premade("lp_form"),
      ], business);
      return doc;
    },
  },
  {
    key: "showcase",
    name: "Show the work",
    purpose: "Showcase",
    businessTypes: ["Lawn & landscape", "Home services", "Cleaning"],
    tags: ["gallery", "photos", "portfolio", "before and after", "work"],
    useCase: "Photographs of what you have done, a quote from a customer, then the form. For trades where the work sells itself as soon as somebody can see it.",
    bestFor: "Landscaping, building, cleaning and anything else with a striking before and after.",
    build: (business, accent) => {
      const doc = emptyDocument({ style: "landing", accent });
      doc.sections = withFooter([
        premadeSaying("lp_hero", {
          headline: "See what we have been doing",
          sub: "Recent jobs, photographed the day we finished them. Yours could be next.",
        }),
        premadeSaying("lp_gallery", { items: ["", "", "", "", "", ""] }), premade("lp_two_up"),
        premadeSaying("lp_quote", {
          quote: "Quoted on the Monday, done by the Thursday, and the price was the price. I have already recommended them twice.",
          attribution: "A customer, this year",
        }), premade("lp_form"),
      ], business);
      return doc;
    },
  },
];

export function landingTemplateByKey(key: string): LandingTemplate | undefined {
  return LANDING_TEMPLATES.find((t) => t.key === key);
}

/** The brand kit pre-fills; it never overrules a colour the author chose. */
export function applyLandingBrand(
  doc: BuilderDocument,
  kit: { accent?: string; headingFont?: string; bodyFont?: string },
): BuilderDocument {
  return {
    ...doc,
    settings: {
      ...doc.settings,
      accent: doc.settings.accent || kit.accent,
      headingFont: doc.settings.headingFont || kit.headingFont,
      bodyFont: doc.settings.bodyFont || kit.bodyFont,
    },
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   The library (§11.9, D-146)
   ══════════════════════════════════════════════════════════════════════════ */

/** A hosted landing page is drawn at the width the page itself uses. */
export const LANDING_PREVIEW_WIDTH = 900;

/**
 * One landing page’s picture: the real page, through the landing renderer.
 *
 * The same `renderLandingSection` the canvas draws with, so the card and the
 * builder cannot disagree about what the page looks like.
 */
export function landingPreview(
  doc: BuilderDocument,
  business: LandingBusiness,
  accent: string,
): TemplatePreview {
  const ctx = makeLandingContext(doc, { mode: "view", accent, business });
  return {
    html: doc.sections.map((s) => renderLandingSection(s, ctx)).join(""),
    css: LANDING_CSS.replace(/__ACCENT__/g, accent),
    width: LANDING_PREVIEW_WIDTH,
  };
}

/**
 * Every landing page as a library entry.
 *
 * There is deliberately no "empty page" card here: a landing page with no
 * form is not a landing page, and the three shapes below are the three ways
 * a campaign page is built. The builder never offered a blank one either.
 */
export function landingLibrary(business: LandingBusiness, accent: string): TemplateEntry[] {
  return LANDING_TEMPLATES.map((t) => ({
    id: t.key,
    title: t.name,
    purpose: t.purpose,
    businessTypes: t.businessTypes,
    tags: t.tags,
    useCase: t.useCase,
    bestFor: t.bestFor,
    featured: t.featured,
    preview: () => landingPreview(t.build(business, accent), business, accent),
  }));
}