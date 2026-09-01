// forgePages.ts — teaching copy for the FORGE nav.
//
// Added 2026-09-01. Two of these three pages are honest placeholders and say
// so; writing confident teaching copy for a screen that does nothing yet is how
// a walkthrough starts lying to the reader.
import type { PageContentMap } from "../pageGuide";

export const FORGE_PAGES: PageContentMap = {
  forge_catalog: {
    title: "Custom software — when the product doesn't fit the business",
    body:
      "FORGE is where we build software specific to one business, rather than bending a standard product until it almost fits. It lives alongside your other products and shares the same login, data and permissions — so a bespoke tool doesn't become an island your team has to remember separately.",
  },

  forge_integrations: {
    title: "Integrations — placeholder",
    body:
      "Intended for integration health and sync status. It is a placeholder today: there is nothing to read here yet, and it is listed so the shape of what's coming is visible rather than hidden.",
  },

  forge_coming: {
    title: "The integration hub — not built yet",
    body:
      "The planned home for cross-product integrations and the data plumbing between them. Nothing runs from this page today.",
  },
};
