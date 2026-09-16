/**
 * builder/adapters/email/emailTemplates.ts — never a blank canvas.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §7, THE TEMPLATE PRINCIPLE, agreed by
 * Brandon 2026-09-15: "open with pre-made sections and pre-made templates,
 * NEVER a blank page. The header is pre-placed and already shows the
 * business's information; the footer is pre-placed."
 *
 * For an email the footer is not merely pre-placed, it is LOCKED — see
 * emailRender.ts. Every template below ends with it, and the "blank" starting
 * point is not blank either: it is a header, a personal note and the footer,
 * because that is the smallest thing that is legal to send.
 *
 * ── WHERE THE COUNTS COME FROM ────────────────────────────────────────────
 * SD-010's guided count is asked ONCE, by the widget pane, before the widget
 * is inserted. A template that ships three empty article slots has answered
 * the question on the author's behalf; `withArticleCount()` is how the
 * "How many articles?" answer on the starting screen rewrites the template
 * before it reaches the canvas, so the author types into exactly as many
 * slots as they asked for.
 *
 * Pure: no React, no fetch. The adapter supplies the brand kit and the
 * business's own details.
 */
import {
  makeSection, makeWidget, emptyDocument,
  type BuilderDocument, type Section, type Widget,
} from "../../model";
import { makeFooterProps, type EmailBusiness } from "./emailRender";
import type { PremadeSection } from "../../templates";

/* ══════════════════════════════════════════════════════════════════════════
   Building blocks
   ══════════════════════════════════════════════════════════════════════════ */

const sec = (widgets: Widget[], extra: Partial<Section> = {}) =>
  makeSection({
    ...extra,
    columns: [{ id: `c_${Math.random().toString(36).slice(2, 8)}`, widgets }],
    layout: 1,
  });

/**
 * The masthead: the business's own logo and name, from the brand kit.
 *
 * Not a placeholder to fill in. §7's words are "the header is pre-placed and
 * already shows the business's information", and the business's information is
 * something we already hold.
 */
export function headerSection(business: EmailBusiness, accent: string): Section {
  const widgets: Widget[] = [];
  if (business.logoUrl) {
    widgets.push(makeWidget("image", {
      src: business.logoUrl,
      alt: `${business.name || "Our"} logo`,
      width: 160,
      align: "Centre",
      url: business.website || "",
    }));
  } else {
    widgets.push(makeWidget("heading", {
      text: business.name || "",
      level: "Page title",
      align: "Centre",
      colour: accent,
    }));
  }
  return sec(widgets, { label: "Header", padding: 24, width: "contained" });
}

/** The block the law asks for, locked so nothing can take it off the page. */
export function footerSection(business: EmailBusiness): Section {
  return sec(
    [makeWidget("email_footer", makeFooterProps(business), { locked: true })],
    { label: "Footer", padding: 16, width: "contained" },
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Pre-made sections — the gallery
   ══════════════════════════════════════════════════════════════════════════ */

export const EMAIL_PREMADE_SECTIONS: PremadeSection[] = [
  {
    key: "email_note",
    name: "A note from you",
    description: "Greets each person by their own name and signs off from you. The most-read part of any newsletter.",
    tags: ["Opening"],
    build: () => sec([
      makeWidget("personal_note", {
        greeting: "Hi {{first name}},",
        text: "",
        signoff: "",
        align: "Left",
      }),
    ], { label: "A note from you" }),
  },
  {
    key: "email_articles",
    name: "Articles",
    description: "Your stories with a picture, a few lines and a link. Bring them in from your website in one click.",
    tags: ["Stories"],
    build: () => sec([
      makeWidget("article_card", {
        items: [blankArticle(), blankArticle(), blankArticle()],
        layout: "Picture beside the words",
      }),
    ], { label: "Articles" }),
  },
  {
    key: "email_products",
    name: "Products & prices",
    description: "Two or three things you sell, each with its price and how it is billed, from your catalogue.",
    tags: ["Offer"],
    build: () => sec([
      makeWidget("product_card", { items: [blankProduct(), blankProduct()], layout: "Cards side by side" }),
    ], { label: "What's on offer" }),
  },
  {
    key: "email_offer",
    name: "One big offer",
    description: "A headline, a line of copy and one button. When the email has exactly one thing to say.",
    tags: ["Offer"],
    build: () => sec([
      makeWidget("heading", { text: "", level: "Section", align: "Centre" }),
      makeWidget("paragraph", { text: "", align: "Centre" }),
      makeWidget("button", { label: "", url: "", style: "Solid", align: "Centre" }),
    ], { label: "The offer", padding: 28 }),
  },
  {
    key: "email_details",
    name: "The details",
    description: "When, where and what to bring — as short lines under a heading. For an event or an appointment.",
    tags: ["Event"],
    build: () => sec([
      makeWidget("heading", { text: "The details", level: "Section" }),
      makeWidget("list", { items: ["", "", ""] }),
    ], { label: "The details" }),
  },
  {
    key: "email_two_up",
    name: "Two side by side",
    description: "Two short things next to each other — a picture beside a paragraph, or two small notices.",
    tags: ["Layout"],
    build: () => makeSection({
      label: "Two side by side",
      layout: 2,
      columns: [
        { id: `c_${Math.random().toString(36).slice(2, 8)}`, widgets: [makeWidget("image", { src: "", alt: "" })] },
        { id: `c_${Math.random().toString(36).slice(2, 8)}`, widgets: [makeWidget("paragraph", { text: "" })] },
      ],
    }),
  },
  {
    key: "email_review",
    name: "What a customer said",
    description: "One quote with a name under it. Nothing sells a service like somebody else saying it.",
    tags: ["Trust"],
    build: () => sec([
      makeWidget("testimonial", { quote: "", attribution: "", rating: 5 }),
    ], { label: "What a customer said" }),
  },
  {
    key: "email_social",
    name: "Follow us",
    description: "A row of links to your accounts, taken from the ones already connected in My Brand.",
    tags: ["Trust"],
    build: () => sec([
      makeWidget("social_links", { links: [], align: "Centre" }),
    ], { label: "Follow us", padding: 12 }),
  },
];

export const EMAIL_PREMADE_TAGS = ["All", "Opening", "Stories", "Offer", "Event", "Layout", "Trust"];

function blankArticle() {
  return { title: "", excerpt: "", image: "", alt: "", url: "", linkLabel: "Read it" };
}
function blankProduct() {
  return { name: "", blurb: "", price: "", cadence: "", image: "", alt: "", url: "", ctaLabel: "" };
}

function premade(key: string): Section {
  const p = EMAIL_PREMADE_SECTIONS.find((x) => x.key === key);
  if (!p) throw new Error(`no pre-made email section "${key}"`);
  return p.build();
}

/* ══════════════════════════════════════════════════════════════════════════
   The shipped templates
   ══════════════════════════════════════════════════════════════════════════ */

export interface EmailTemplate {
  key: string;
  name: string;
  description: string;
  /** The subject line the template suggests, merge tags and all. */
  subject: string;
  preheader: string;
  /** Present when the starting screen should ask "how many?" before building. */
  askArticles?: boolean;
  askProducts?: boolean;
  build: (business: EmailBusiness, accent: string) => BuilderDocument;
}

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    key: "monthly_update",
    name: "Monthly update",
    description: "A note from you, then your stories with pictures and links. The newsletter most businesses send.",
    subject: "{{business name}} — what's new this month",
    preheader: "A short note, and what we've been up to.",
    askArticles: true,
    build: (business, accent) => {
      const doc = emptyDocument({ style: "newsletter", accent });
      doc.sections = [
        headerSection(business, accent),
        sec([makeWidget("heading", { text: "", level: "Page title", align: "Left" })], { label: "Title" }),
        premade("email_note"),
        sec([makeWidget("divider", { style: "Line" })], { label: "Divider", padding: 4 }),
        premade("email_articles"),
        premade("email_social"),
        footerSection(business),
      ];
      return doc;
    },
  },
  {
    key: "promo",
    name: "Promotion",
    description: "One offer, said once, with the price and a button. For a sale, a seasonal deal or a new service.",
    subject: "{{first name}}, this one's for you",
    preheader: "A limited offer from us.",
    askProducts: true,
    build: (business, accent) => {
      const doc = emptyDocument({ style: "newsletter", accent });
      doc.sections = [
        headerSection(business, accent),
        premade("email_offer"),
        premade("email_products"),
        premade("email_review"),
        footerSection(business),
      ];
      return doc;
    },
  },
  {
    key: "event",
    name: "Event invitation",
    description: "What it is, when and where, and a button to say you're coming. With a date to count down to.",
    subject: "You're invited — {{business name}}",
    preheader: "The date, the place, and how to let us know.",
    build: (business, accent) => {
      const doc = emptyDocument({ style: "newsletter", accent });
      doc.sections = [
        headerSection(business, accent),
        sec([
          makeWidget("heading", { text: "", level: "Page title", align: "Centre" }),
          makeWidget("paragraph", { text: "", align: "Centre" }),
        ], { label: "The invitation", padding: 28 }),
        sec([makeWidget("countdown", { ends_at: "" })], { label: "When", padding: 8 }),
        premade("email_details"),
        sec([makeWidget("button", { label: "Count me in", url: "", style: "Solid", align: "Centre" })], { label: "Reply", padding: 8 }),
        footerSection(business),
      ];
      return doc;
    },
  },
  {
    key: "announcement",
    name: "Announcement",
    description: "One thing you need people to know — a change of hours, a new location, a price change.",
    subject: "A quick note from {{business name}}",
    preheader: "Something we want you to know about.",
    build: (business, accent) => {
      const doc = emptyDocument({ style: "newsletter", accent });
      doc.sections = [
        headerSection(business, accent),
        sec([makeWidget("heading", { text: "", level: "Page title" })], { label: "Title" }),
        premade("email_note"),
        sec([makeWidget("list", { items: ["", "", ""] })], { label: "What changes" }),
        sec([makeWidget("button", { label: "", url: "", style: "Outline", align: "Left" })], { label: "If they need to act", padding: 8 }),
        footerSection(business),
      ];
      return doc;
    },
  },
];

export function emailTemplateByKey(key: string): EmailTemplate | undefined {
  return EMAIL_TEMPLATES.find((t) => t.key === key);
}

/**
 * The smallest email it is legal to send: a masthead, a note, a footer.
 *
 * Offered where other builders offer "Blank", and deliberately not blank —
 * a blank canvas is the interface this rebuild exists to delete.
 */
export function startingEmail(business: EmailBusiness, accent: string): BuilderDocument {
  const doc = emptyDocument({ style: "newsletter", accent });
  doc.sections = [headerSection(business, accent), premade("email_note"), footerSection(business)];
  return doc;
}

/* ══════════════════════════════════════════════════════════════════════════
   The guided counts, applied before the canvas opens
   ══════════════════════════════════════════════════════════════════════════ */

/** Resize one repeating widget's list, keeping whatever is already typed. */
export function setRepeatCount(
  doc: BuilderDocument,
  kind: string,
  count: number,
  blank: () => unknown,
): BuilderDocument {
  const n = Math.max(1, Math.min(12, Math.floor(count)));
  return {
    ...doc,
    sections: doc.sections.map((s) => ({
      ...s,
      columns: s.columns.map((c) => ({
        ...c,
        widgets: c.widgets.map((w) => {
          if (w.kind !== kind) return w;
          const current = Array.isArray((w.props as any).items) ? [...((w.props as any).items as unknown[])] : [];
          return { ...w, props: { ...w.props, items: Array.from({ length: n }, (_, i) => current[i] ?? blank()) } };
        }),
      })),
    })),
  };
}

export const withArticleCount = (doc: BuilderDocument, n: number) =>
  setRepeatCount(doc, "article_card", n, blankArticle);

export const withProductCount = (doc: BuilderDocument, n: number) =>
  setRepeatCount(doc, "product_card", n, blankProduct);

/**
 * Put the business's own colours on a document that has not chosen its own.
 *
 * The same rule as the proposal adapter's `applyBrandDefaults`: the brand kit
 * PRE-FILLS, it does not overrule. An author who picked a colour keeps it.
 */
export function applyEmailBrand(
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

/**
 * Make sure the document has its footer, wherever it came from.
 *
 * An issue written before the builder existed, or one imported from a website,
 * arrives as prose with nothing at the bottom. Rather than refuse it, the
 * builder gives it the block it needs, locked, so the author sees it on the
 * page and cannot lose it again.
 */
export function ensureFooter(doc: BuilderDocument, business: EmailBusiness): BuilderDocument {
  const has = doc.sections.some((s) => s.columns.some((c) => c.widgets.some((w) => w.kind === "email_footer")));
  if (has) return doc;
  return { ...doc, sections: [...doc.sections, footerSection(business)] };
}
