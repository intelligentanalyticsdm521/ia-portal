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
import {
  EMAIL_WIDTH, makeEmailContext, makeFooterProps, renderEmailDocument, type EmailBusiness,
} from "./emailRender";
import { fill } from "../../merge";
import type { PremadeSection } from "../../templates";
import {
  SAMPLE_MERGE, blankEntry, type TemplateEntry, type TemplatePreview,
} from "../../templateLibraryModel";

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

/**
 * A shipped email template, as the library (§11.9, D-146) shows it.
 *
 * `description` is gone, for the reason D-146 gives: the picture says what it
 * looks like, so the words say what it is FOR and who should send it.
 */
export interface EmailTemplate {
  key: string;
  name: string;
  /** The badge — what kind of send this is, in the client's words. */
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
  /** The subject line the template suggests, merge tags and all. */
  subject: string;
  preheader: string;
  /** Present when the starting screen should ask "how many?" before building. */
  askArticles?: boolean;
  askProducts?: boolean;
  build: (business: EmailBusiness, accent: string) => BuilderDocument;
}

/**
 * A pre-made section carrying THIS template's own words.
 *
 * §11.9/D-146 wanted a picture of every template, and a picture of an email
 * whose every slot is empty is a picture of a masthead and a footer. So the
 * shipped templates arrive with trade-typical words already in them — generic,
 * true of any business, and editable in place like everything else. No client
 * of ours is named in any of it.
 */
function say(section: Section, props: Record<string, unknown>, widgetIndex = 0): Section {
  const w = section.columns[0].widgets[widgetIndex];
  if (w) w.props = { ...w.props, ...props };
  return section;
}

/** Three stories in the shape a small business actually writes them. */
function sampleArticles() {
  return [
    {
      title: "A job we finished this month",
      excerpt: "A few lines about the work, what made it interesting, and how it turned out. A photograph does most of the work here.",
      image: "", alt: "", url: "", linkLabel: "See the pictures",
    },
    {
      title: "The question we are asked most",
      excerpt: "Answer the thing customers always ring up about. It saves you the call and it shows you know your trade.",
      image: "", alt: "", url: "", linkLabel: "Read it",
    },
    {
      title: "What to look out for this season",
      excerpt: "One useful tip for the time of year, ending with what to do if they spot it. Helpful first, selling second.",
      image: "", alt: "", url: "", linkLabel: "Read it",
    },
  ];
}

/** Two things off the shelf, priced the way a customer asks about them. */
function sampleProducts() {
  return [
    {
      name: "Standard visit", blurb: "The regular job, done properly, by the crew you already know.",
      price: "$120", cadence: "per visit", image: "", alt: "", url: "", ctaLabel: "Book it",
    },
    {
      name: "Full service", blurb: "Everything in the standard visit, plus the extras people usually ask for afterwards.",
      price: "$195", cadence: "per visit", image: "", alt: "", url: "", ctaLabel: "Book it",
    },
  ];
}

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    key: "monthly_update",
    name: "Monthly update",
    purpose: "Newsletter",
    businessTypes: ["Any business"],
    tags: ["newsletter", "monthly", "update", "stories", "articles"],
    useCase: "The regular email that keeps you in front of people who already know you: a short note from you, then your recent stories with a picture and a link each. If your website is with us the articles come in at the press of a button.",
    bestFor: "Any business sending something once a month — and anyone who keeps meaning to start.",
    featured: true,
    subject: "{{business name}} — what's new this month",
    preheader: "A short note, and what we've been up to.",
    askArticles: true,
    build: (business, accent) => {
      const doc = emptyDocument({ style: "newsletter", accent });
      doc.sections = [
        headerSection(business, accent),
        sec([makeWidget("heading", { text: "What we have been up to", level: "Page title", align: "Left" })], { label: "Title" }),
        say(premade("email_note"), {
          text: "A quick round-up of the month — what we have been working on, and one or two things worth knowing if you have a job coming up.",
          signoff: "Thanks for reading,",
        }),
        sec([makeWidget("divider", { style: "Line" })], { label: "Divider", padding: 4 }),
        say(premade("email_articles"), { items: sampleArticles() }),
        premade("email_social"),
        footerSection(business),
      ];
      return doc;
    },
  },
  {
    key: "promo",
    name: "Promotion",
    purpose: "Promotion",
    businessTypes: ["Any business"],
    tags: ["offer", "sale", "discount", "deal", "promotion"],
    useCase: "One offer, said once, with the price and a button. Everything on the page points at the same thing, which is why it sells better than a newsletter with an offer buried halfway down it.",
    bestFor: "A seasonal deal, a clearance, a new price, or a limited run you want gone this month.",
    featured: true,
    subject: "{{first name}}, this one's for you",
    preheader: "A limited offer from us.",
    askProducts: true,
    build: (business, accent) => {
      const doc = emptyDocument({ style: "newsletter", accent });
      const offer = premade("email_offer");
      say(offer, { text: "Ten per cent off, this month only" }, 0);
      say(offer, { text: "Book anything before the end of the month and we will take ten per cent off the bill. No code to remember — the price comes off when we quote." }, 1);
      say(offer, { label: "Claim the offer" }, 2);
      doc.sections = [
        headerSection(business, accent),
        offer,
        say(premade("email_products"), { items: sampleProducts() }),
        say(premade("email_review"), {
          quote: "They turned up when they said they would, did the job properly and left the place tidy. I have already booked them again.",
          attribution: "A customer, this year",
        }),
        footerSection(business),
      ];
      return doc;
    },
  },
  {
    key: "event",
    name: "Event invitation",
    purpose: "Event",
    businessTypes: ["Any business", "Non-profit", "Retail & hospitality"],
    tags: ["invite", "event", "rsvp", "date", "countdown"],
    useCase: "What it is, when and where, and a button to say you are coming — with a countdown so the date does not sink to the bottom of the inbox and get forgotten.",
    bestFor: "An open day, a fundraiser, a demonstration evening, a customer thank-you.",
    subject: "You're invited — {{business name}}",
    preheader: "The date, the place, and how to let us know.",
    build: (business, accent) => {
      const doc = emptyDocument({ style: "newsletter", accent });
      doc.sections = [
        headerSection(business, accent),
        sec([
          makeWidget("heading", { text: "You are invited", level: "Page title", align: "Centre" }),
          makeWidget("paragraph", {
            text: "We are opening the doors for the afternoon and we would like you there. Come and see how the work is done, meet the crew, and stay for something to eat.",
            align: "Centre",
          }),
        ], { label: "The invitation", padding: 28 }),
        sec([makeWidget("countdown", { ends_at: "" })], { label: "When", padding: 8 }),
        say(premade("email_details"), {
          items: [
            "Saturday afternoon, from two until five",
            "At our yard — parking on site, follow the signs",
            "Bring the family; there is something for the children",
          ],
        }, 1),
        sec([makeWidget("button", { label: "Count me in", url: "", style: "Solid", align: "Centre" })], { label: "Reply", padding: 8 }),
        footerSection(business),
      ];
      return doc;
    },
  },
  {
    key: "announcement",
    name: "Announcement",
    purpose: "Announcement",
    businessTypes: ["Any business"],
    tags: ["news", "change", "hours", "notice", "closure"],
    useCase: "One thing people need to know — new hours, a new address, a price change, a holiday closure. Short and plain, with a button only if they actually have to do something.",
    bestFor: "Any business with news that is not an offer and should not be dressed up as one.",
    subject: "A quick note from {{business name}}",
    preheader: "Something we want you to know about.",
    build: (business, accent) => {
      const doc = emptyDocument({ style: "newsletter", accent });
      doc.sections = [
        headerSection(business, accent),
        sec([makeWidget("heading", { text: "A change you should know about", level: "Page title" })], { label: "Title" }),
        say(premade("email_note"), {
          text: "Nothing dramatic, but it affects how you book with us, so we would rather you heard it from us than found out on the day.",
          signoff: "",
        }),
        sec([makeWidget("list", {
          items: [
            "What is changing, in one line",
            "When it starts",
            "What you need to do, if anything",
          ],
        })], { label: "What changes" }),
        sec([makeWidget("button", { label: "", url: "", style: "Outline", align: "Left" })], { label: "If they need to act", padding: 8 }),
        footerSection(business),
      ];
      return doc;
    },
  },
  {
    key: "seasonal_reminder",
    name: "Seasonal reminder",
    purpose: "Seasonal",
    businessTypes: ["Service industry"],
    tags: ["season", "book early", "reminder", "diary", "weather",
      "lawn & landscape", "snow & ice", "hvac & plumbing", "cleaning", "home services"],
    useCase: "The email you send a few weeks before the season turns, to fill the diary before the phone starts ringing. It says why booking now is worth it and gives one button to do it.",
    bestFor: "Anyone whose work has a season — heating checks before the cold, the first cut of spring, a snow contract before November.",
    subject: "Book before the season turns",
    preheader: "The diary fills up fast once the weather changes.",
    build: (business, accent) => {
      const doc = emptyDocument({ style: "newsletter", accent });
      doc.sections = [
        headerSection(business, accent),
        sec([makeWidget("heading", { text: "Book before the season turns", level: "Page title", align: "Left" })], { label: "Title" }),
        sec([makeWidget("personal_note", {
          greeting: "Hi {{first name}},",
          text: "Every year the same thing happens: the weather turns overnight and the diary fills in a week. If you would like your usual slot, now is the moment to say so — we book in the order people ask.",
          signoff: "Thanks for being a customer,",
          align: "Left",
        })], { label: "A note from you" }),
        sec([makeWidget("list", {
          items: [
            "Pick the week that suits you, before the good ones go",
            "The same crew who were here last time",
            "Nothing to pay until the work is done",
          ],
        })], { label: "Why book now" }),
        sec([makeWidget("button", { label: "Book my visit", url: "", style: "Solid", align: "Centre" })], { label: "Book", padding: 8 }),
        premade("email_review"),
        footerSection(business),
      ];
      return doc;
    },
  },
  {
    key: "review_request",
    name: "Review request",
    purpose: "Reviews",
    businessTypes: ["Any business"],
    tags: ["review", "rating", "feedback", "reputation", "stars"],
    useCase: "Sent a day or two after a job is finished, while it is still fresh. One question, one button, and a quiet line offering to put things right instead if it did not go well.",
    bestFor: "Any trade that lives on local reputation and wants more recent reviews without chasing people by phone.",
    subject: "How did we do?",
    preheader: "Two minutes, and it helps us more than you know.",
    build: (business, accent) => {
      const doc = emptyDocument({ style: "newsletter", accent });
      doc.sections = [
        headerSection(business, accent),
        sec([makeWidget("personal_note", {
          greeting: "Hi {{first name}},",
          text: "Thank you for having us out. If you were happy with the work, a short review helps other people nearby decide who to call — it takes about two minutes and it makes a real difference to a small business.",
          signoff: "Thank you,",
          align: "Left",
        })], { label: "The ask" }),
        sec([makeWidget("button", { label: "Leave a review", url: "", style: "Solid", align: "Centre" })], { label: "Review", padding: 8 }),
        sec([makeWidget("paragraph", {
          text: "And if something was not right, please reply to this email instead of leaving a review. We would far rather hear it from you and fix it.",
          align: "Left",
        })], { label: "If it went wrong" }),
        footerSection(business),
      ];
      return doc;
    },
  },
  {
    key: "winback",
    name: "We miss you",
    purpose: "Win-back",
    businessTypes: ["Any business"],
    tags: ["win-back", "lapsed", "re-engagement", "come back", "offer"],
    useCase: "For customers who used you once and have gone quiet. It admits it has been a while, gives them one reason to come back, and does not pretend nothing happened.",
    bestFor: "Any business with a list of past customers who have not booked in a year — the cheapest work you will ever win.",
    subject: "It has been a while",
    preheader: "Something to bring you back.",
    build: (business, accent) => {
      const doc = emptyDocument({ style: "newsletter", accent });
      doc.sections = [
        headerSection(business, accent),
        sec([makeWidget("heading", { text: "It has been a while", level: "Page title", align: "Centre" })], { label: "Title" }),
        sec([makeWidget("personal_note", {
          greeting: "Hi {{first name}},",
          text: "We have not seen you for a bit, and we would like to change that. Nothing has changed about how we work — same people, same standard — and if something went wrong last time, tell us and we will make it right.",
          signoff: "Hope to see you soon,",
          align: "Left",
        })], { label: "A note from you" }),
        sec([
          makeWidget("paragraph", { text: "Book anything in the next thirty days and we will take ten per cent off the bill. No code to remember — just reply or use the button.", align: "Centre" }),
          makeWidget("button", { label: "Book again", url: "", style: "Solid", align: "Centre" }),
        ], { label: "The offer", padding: 24 }),
        premade("email_review"),
        footerSection(business),
      ];
      return doc;
    },
  },
  {
    key: "new_service",
    name: "New service announcement",
    purpose: "Announcement",
    businessTypes: ["Service industry", "Retail & hospitality"],
    tags: ["new service", "launch", "now offering", "expanded", "price",
      "lawn & landscape", "snow & ice", "cleaning", "hvac & plumbing", "home services"],
    useCase: "For telling your existing customers you now do something you did not do before. It says what it is, who it suits and what it costs, and asks for the booking in the same breath.",
    bestFor: "A trade adding a line — gutter clearing, a maintenance plan, a second van, an extra season.",
    subject: "Something new from us",
    preheader: "A new service, what it is for, and what it costs.",
    askProducts: true,
    build: (business, accent) => {
      const doc = emptyDocument({ style: "newsletter", accent });
      doc.sections = [
        headerSection(business, accent),
        sec([makeWidget("heading", { text: "We do this now too", level: "Page title", align: "Left" })], { label: "Title" }),
        sec([makeWidget("personal_note", {
          greeting: "Hi {{first name}},",
          text: "Enough of you have asked that we have gone and set it up properly — trained, equipped and insured for it, not doing it as a favour on the side. Here is what it is and what it costs.",
          signoff: "",
          align: "Left",
        })], { label: "A note from you" }),
        premade("email_products"),
        sec([makeWidget("list", {
          items: [
            "Booked the same way as everything else you have from us",
            "The same crew you already know",
            "Priced up front, before we start",
          ],
        })], { label: "Who it suits" }),
        sec([makeWidget("button", { label: "Ask about it", url: "", style: "Solid", align: "Centre" })], { label: "Get in touch", padding: 8 }),
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
  if (has) return settleFooter(doc);
  return settleFooter({ ...doc, sections: [...doc.sections, footerSection(business)] });
}

/**
 * NOTHING COMES AFTER THE UNSUBSCRIBE FOOTER (D-11, the email case).
 *
 * BUILDER_USER_TEST_2026-09-16: *"the product cards landed after the footer.
 * Nothing was selected, so they were appended to the last section — which in an
 * email is the unsubscribe footer. The canvas ended: Summit Lawn & Landscape ·
 * Des Moines, IA · Unsubscribe · Update your preferences, and then two product
 * cards below it."*
 *
 * The engine now puts an un-anchored widget in the section the author is
 * LOOKING AT rather than at the end (insertPosition.ts), which fixes the common
 * case — but an author scrolled to the bottom is looking at the footer, and an
 * email's footer is not a place content can go. This is the email's own
 * structural rule, so it lives with the email:
 *
 *   · the footer section is LAST;
 *   · it holds the footer and nothing else — anything that lands in it moves
 *     up into the last real section, or into a new one if there is none.
 *
 * Applied on every change, so there is one rule rather than a guard on each of
 * the seven ways a widget can arrive. Pure, and a no-op on a document that is
 * already right, so the reference is unchanged and React does not re-render.
 */
export function settleFooter(doc: BuilderDocument): BuilderDocument {
  const at = doc.sections.findIndex((s) =>
    s.columns.some((c) => c.widgets.some((w) => w.kind === "email_footer")));
  if (at < 0) return doc;

  const footer = doc.sections[at];
  // Anything in the footer section that is NOT the footer itself.
  const strays = footer.columns.flatMap((c) => c.widgets.filter((w) => w.kind !== "email_footer"));
  const alreadyLast = at === doc.sections.length - 1;
  if (!strays.length && alreadyLast) return doc;

  const cleaned: Section = {
    ...footer,
    columns: footer.columns.map((c) => ({ ...c, widgets: c.widgets.filter((w) => w.kind === "email_footer") })),
  };
  const rest = doc.sections.filter((_, i) => i !== at);

  if (strays.length) {
    if (rest.length) {
      // Into the bottom of the last real section — which is where the author
      // was looking, minus the one place content cannot live.
      const last = rest[rest.length - 1];
      rest[rest.length - 1] = {
        ...last,
        columns: last.columns.map((c, i) =>
          (i === 0 ? { ...c, widgets: [...c.widgets, ...strays] } : c)),
      };
    } else {
      // An email that is nothing but a footer: the strays get a section.
      rest.push({
        ...footer,
        id: `${footer.id}-body`,
        label: "Section",
        columns: [{ id: `${footer.id}-body-c0`, widgets: strays }],
      });
    }
  }
  return { ...doc, sections: [...rest, cleaned] };
}

/* ══════════════════════════════════════════════════════════════════════════
   The library (§11.9, D-146)
   ══════════════════════════════════════════════════════════════════════════ */

/** An email preview is rendered at the width a mailbox gives it. */
export const EMAIL_PREVIEW_WIDTH = EMAIL_WIDTH;

/**
 * One template's picture: the REAL email, through the email renderer.
 *
 * `renderEmailDocument` already returns a whole HTML document — tables,
 * doctype, the locked footer and all — so the card shows the thing a mailbox
 * would show and not an impression of it. `previewSrcDoc` passes a document
 * through untouched, which is why this returns one.
 */
export function emailPreview(
  doc: BuilderDocument,
  business: EmailBusiness,
  accent: string,
  subject = "",
  preheader = "",
): TemplatePreview {
  // The unsubscribe link is minted per recipient at send time; in a PICTURE it
  // is a dead "#" rather than the {{unsubscribe_url}} token, because a card
  // showing a raw merge tag is exactly what §11.9 exists to stop.
  const ctx = makeEmailContext(doc, {
    mode: "view", merge: SAMPLE_MERGE, accent, business, unsubscribeUrl: "#",
  });
  return {
    // The subject reaches the <title>; it is filled here rather than escaped
    // raw, so a picture never carries {{business name}} in it either.
    html: renderEmailDocument(doc, ctx, {
      subject: fill(subject, SAMPLE_MERGE), preheader: fill(preheader, SAMPLE_MERGE),
    }),
    width: EMAIL_PREVIEW_WIDTH,
  };
}

/**
 * Every email template as a library entry, with the basics FIRST (D-153).
 *
 * The "empty page" card is not empty here and says so: the smallest email it
 * is legal to send is a masthead, a note and the unsubscribe footer
 * (`startingEmail`), so that is what the card offers and what its picture
 * shows — and why the footer button here reads "Just the basics" rather than
 * promising an empty page it cannot give.
 *
 * It is listed last and SORTED first: `sortTemplates` owns the order, so no
 * adapter has to remember to put it anywhere.
 */
export function emailLibrary(business: EmailBusiness, accent: string): TemplateEntry[] {
  const entries: TemplateEntry[] = EMAIL_TEMPLATES.map((t) => ({
    id: t.key,
    title: t.name,
    purpose: t.purpose,
    businessTypes: t.businessTypes,
    tags: t.tags,
    useCase: t.useCase,
    bestFor: t.bestFor,
    featured: t.featured,
    preview: () => emailPreview(t.build(business, accent), business, accent, t.subject, t.preheader),
  }));
  return [
    ...entries,
    blankEntry({
      title: "Just the basics",
      purpose: "Start simple",
      tags: ["blank", "empty", "basic", "plain", "from scratch"],
      useCase: "Your masthead, a note from you, and the unsubscribe footer the law asks for. The smallest email it is legal to send, and the right start when you only want to say one thing in your own words.",
      bestFor: "A quick note to the list when none of the shapes above is what you mean.",
      preview: () => emailPreview(startingEmail(business, accent), business, accent, "", ""),
    }),
  ];
}
