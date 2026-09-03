// consultingPages.ts — teaching copy for every page in the Consulting nav.
//
// Added 2026-09-01. Consulting had ZERO authored pages, so the whole surface —
// the one clients actually live in when they work with us — offered no help at
// all. Brandon: "every step of every process should be easy… if it's not
// covered in the tour then we need to add it to our tours."
//
// The nav is role-split: a client sees Service Requests / Deliverables /
// Projects, while the founder-only pages (Clients, Document Library, Work) are
// filtered out for them. Copy here is written so it reads correctly to whoever
// can actually see the page.
import type { PageContentMap } from "../pageGuide";

export const CONSULTING_PAGES: PageContentMap = {
  consulting_overview: {
    title: "Consulting — the work we're doing for you",
    body:
      "One place for everything we have in flight together: what's active, what's waiting on you, and what's been delivered. If you only ever open one page here, make it this one — it's the honest state of play rather than a status email you have to trust.",
  },

  consulting_tickets: {
    title: "Work — the recurring jobs",
    body:
      "The ongoing work that repeats: blog posts, monthly SEO reviews, quarterly refreshes. Closing one automatically raises the next on its cadence, which is what stops recurring work quietly lapsing when everyone gets busy.",
  },

  consulting_projects: {
    title: "Projects — work with a beginning and an end",
    body:
      "Each project shows its phases and where it has got to. Open one to see the milestones, the tasks inside them, and anything currently sitting with you. Progress here is derived from the actual tasks, not typed in by hand, so it can't flatter itself.",
    onPage: [
      {
        title: "Phases tell you what happens next",
        body:
          "A project moves through phases, and the current one is named on the card. When something reaches a phase that needs your input, it shows up under Service Requests rather than waiting silently for you to notice.",
      },
    ],
  },

  consulting_deliverables: {
    title: "Deliverables — your library of finished work",
    body:
      "Designs, documents, logos and code, kept in one place with the project they came from. Note that this is the library of APPROVED work: anything still waiting on your review lives on the service request it belongs to, where you can approve it or ask for changes.",
  },

  consulting_documents: {
    title: "Document Library — the templates behind client documents",
    body:
      "Where intake forms, proposals, reports and scopes of work are authored once and reused. The intake builder is drag-and-drop with scoring; the rest are rich-text with merge tags, so a client's name and details fill themselves in rather than being retyped into every document.",
  },

  consulting_workspace: {
    title: "Clients — every business you work with",
    body:
      "The list of client businesses. Opening one gives you their workspace, scoped to their tenant, so you can do the work in their context without them having to hand over a login. Everything you change there is attributed to you.",
  },
};
