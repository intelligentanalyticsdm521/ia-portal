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
import { defaultFormFields } from "./landingRender";
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

/* ══════════════════════════════════════════════════════════════════════════
   The shipped templates
   ══════════════════════════════════════════════════════════════════════════ */

export interface LandingTemplate {
  key: string;
  name: string;
  description: string;
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
    description: "Headline, what you do, why you, and a form. The page most campaigns point at.",
    build: (business, accent) => {
      const doc = emptyDocument({ style: "landing", accent });
      doc.sections = withFooter([
        premade("lp_hero"), premade("lp_words"), premade("lp_reasons"),
        premade("lp_quote"), premade("lp_form"),
      ], business);
      return doc;
    },
  },
  {
    key: "offer",
    name: "One offer",
    description: "A single deal, said plainly, with one button and the form underneath.",
    build: (business, accent) => {
      const doc = emptyDocument({ style: "landing", accent });
      doc.sections = withFooter([
        premade("lp_hero"), premade("lp_words"), premade("lp_cta"), premade("lp_form"),
      ], business);
      return doc;
    },
  },
  {
    key: "showcase",
    name: "Show the work",
    description: "Photos of what you have done, a quote from a customer, then the form.",
    build: (business, accent) => {
      const doc = emptyDocument({ style: "landing", accent });
      doc.sections = withFooter([
        premade("lp_hero"), premade("lp_gallery"), premade("lp_two_up"),
        premade("lp_quote"), premade("lp_form"),
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
