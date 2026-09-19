/**
 * builder/widgets/audience.ts — WHICH BUILDERS OFFER A WIDGET, said once.
 *
 * D-165, scope §11.13.3. Four lists, and every widget declares itself with one
 * of them rather than with a hand-typed array. A hand-typed array is how the
 * same widget came to be offered in three builders and drawn in two.
 *
 * This module imports only a TYPE, so it is erased at runtime and cannot take
 * part in the registry ⇄ widgets cycle (see `kinds.ts` for what that cost the
 * first time).
 */
import type { BuilderAdapter } from "../registry";

/** Every builder, the studio included. The standard set of §11.13.3. */
export const EVERY_BUILDER: BuilderAdapter[] = ["proposal", "website", "email", "landing", "brand"];

/**
 * The two HTML page builders.
 *
 * §11.13.3 gives the website "Elementor's whole free panel" and the landing
 * page "website's list without the menus", so everything past the standard set
 * — video, maps, tabs, carousels, embeds — is these two and nobody else. A
 * proposal becomes a PDF and an email is drawn with tables a mailbox accepts.
 */
export const PAGES: BuilderAdapter[] = ["website", "landing"];

/** Customer documents: proposals, quotes, agreements. */
export const DOCUMENTS: BuilderAdapter[] = ["proposal"];

/** SPARK campaigns, templates and newsletters. */
export const SENDS: BuilderAdapter[] = ["email"];

/** The website only — the two menus a landing page has no use for. */
export const SITE_ONLY: BuilderAdapter[] = ["website"];
