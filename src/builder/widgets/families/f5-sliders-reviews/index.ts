/**
 * families/f5-sliders-reviews/index.ts - SLIDERS AND REVIEWS.
 *
 * slides, nested-carousel, media-carousel, testimonial-carousel,
 * loop-carousel, reviews, testimonial. All one carousel engine - building them
 * apart means building it five times.
 *
 * BUILDER_FULL_WIDGET_PLAN_2026-09-19 section C.1: one widget, one file in
 * this folder; this index is the only thing that knows them as a SET. Nothing
 * in here ever opens registry.ts, render.ts or another family's folder, which
 * is what makes ten agents on ten families safe.
 *
 * -- WHAT MAY BE ADDED HERE ------------------------------------------------
 * An ELEMENTOR widget, by Elementor's own name, group, icon, panel sections,
 * control labels and defaults - or an IA widget named in
 * test/fixtures/BUILDER_OFFERS_2026-09-19.json. Nothing else, ever. If you
 * think something is missing, write it in the handoff; do not build it.
 * test/builder-offers.test.mjs fails the build on an extra tile.
 *
 * -- WHAT IS HERE, AND WHAT IS NOT -----------------------------------------
 * Six of the family's eight, in the order plan section C.3 asks for (cheapest
 * first): Testimonial, Reviews, IA Reviews, Testimonial Carousel, Slides,
 * Media Carousel.
 *
 * TWO ARE DELIBERATELY ABSENT, and each for a reason the seam enforces rather
 * than a preference. Both are written up in D168_HANDOFF_2026-09-19.md:
 *
 *   `nested-carousel` (Carousel)  its slides are real CONTAINERS -
 *     `carousel_items` is a `nested-elements-repeater` and the published node
 *     carries `elements: [container, ...]`. An arion emitter row is
 *     `settings(props, ctx)` and returns SETTINGS; there is no way through this
 *     seam to publish a widget with children, and our own tree only allows
 *     children on `container`. Offering the tile would publish a carousel of
 *     empty boxes on a live website, which is the green-toast-over-a-blank-page
 *     failure. It needs the box family's tree, not a workaround here.
 *
 *   `loop-carousel`  every slide is drawn by a saved LOOP TEMPLATE
 *     (`template_id`) over a post QUERY (39 query keys). The template library
 *     and the query block are F7's, and without a template the widget publishes
 *     a carousel with nothing in it.
 */
import type { Family } from "../types";
import { MEDIA_CAROUSEL_DEF, renderMediaCarousel } from "./mediaCarousel";
import { IA_REVIEWS_DEF, REVIEWS_DEF, emailIaReviews, renderIaReviews, renderReviews } from "./reviews";
import { SLIDES_DEF, renderSlides } from "./slides";
import { TESTIMONIAL_CAROUSEL_DEF, renderTestimonialCarousel } from "./testimonialCarousel";
import { TESTIMONIAL_DEF, emailTestimonial, renderTestimonial } from "./testimonial";

export const FAMILY: Family = {
  /* Elementor's own registration order inside a group, then ours last - which
     is how `families/index.ts` says the panel reads. */
  defs: [
    TESTIMONIAL_DEF,
    REVIEWS_DEF,
    TESTIMONIAL_CAROUSEL_DEF,
    SLIDES_DEF,
    MEDIA_CAROUSEL_DEF,
    IA_REVIEWS_DEF,
  ],
  renderers: {
    testimonial: renderTestimonial,
    reviews: renderReviews,
    testimonial_carousel: renderTestimonialCarousel,
    slides: renderSlides,
    media_carousel: renderMediaCarousel,
    ia_reviews: renderIaReviews,
  },
  /* THE MAILBOX HALF, for the two widgets the offer file gives the newsletter
     and for no others (D-168 item 5b). Both were `case` arms in
     `adapters/email/emailRender.ts` and are MOVED, not copied — that file no
     longer has either function. `familySurfaceGaps()` is the guard: a widget
     whose `builders` include `newsletter` and whose family declares no mailbox
     renderer is named by kind, and the list has to be empty.

     There is no `landingRenderers` entry and that is not a gap: the seam falls
     back to the family's PAGE renderer for a hosted landing page, which is the
     same drawing with the same controls, so a second one here would be a second
     answer to one question. There is no `studioInserts` entry either — see
     TESTIMONIAL_DEF's own note about the absolute-pixel canvas. */
  emailRenderers: {
    testimonial: emailTestimonial,
    ia_reviews: emailIaReviews,
  },
};

export {
  MEDIA_CAROUSEL_DEF, IA_REVIEWS_DEF, REVIEWS_DEF, SLIDES_DEF, TESTIMONIAL_CAROUSEL_DEF,
  TESTIMONIAL_DEF, emailIaReviews, emailTestimonial,
};
