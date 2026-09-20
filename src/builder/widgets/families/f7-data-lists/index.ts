/**
 * families/f7-data-lists/index.ts - LISTS THAT COME FROM DATA.
 *
 * posts, portfolio, loop-grid, archive-posts, taxonomy-filter, search,
 * sitemap, post-info, post-navigation, post-comments, author-box, template and
 * the theme-* title / excerpt / logo / featured-image widgets. One query
 * block, one pagination block, both in `shared.ts`.
 *
 * -- BREADCRUMBS IS NOT HERE, AND THE REASON IS EVIDENCE ---------------------
 * The offer file lists it, and it is NOT BUILT. In the 2026-09-17 Pro scrape
 * the widget is ABSENT: Elementor Pro only registers Breadcrumbs when Yoast
 * SEO is installed, and that site has no Yoast. In the free scrape the entry
 * that carries the name is a Pro_Widget_Promotion - the advert Elementor shows
 * a free install - with no sections and no controls. So there is no widget to
 * copy and nothing for a published node to be drawn by; a tile would put a
 * blank band on a live page. Written up in the handoff with the four facts.
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
 * -- WHICH BUILDER GETS WHICH ----------------------------------------------
 * Straight off the offer file, and the family test re-reads it rather than
 * trusting this comment:
 *
 *   website only .... search, sitemap, post-info, post-navigation,
 *                     post-comments, author-box, archive-posts, and every
 *                     theme-* widget. A hosted landing page has no blog, no
 *                     archive and no site furniture.
 *   website+landing . posts, portfolio, loop-grid, taxonomy-filter, template.
 *   newsletter ...... NONE of them. The offer gives the newsletter `ia_posts`,
 *                     and the panel already has it: the mailbox draws it under
 *                     the kind `article_card`, labelled "IA Posts". So this
 *                     family ships no email half, and LUMEN's
 *                     `emailFamilies/f7-data-lists.js` is deliberately empty.
 *   proposal ........ NONE of them, so there is no PDF half either.
 *
 * -- IA POSTS IS NOT MOVED HERE, AND THAT IS ON PURPOSE --------------------
 * `ia_posts` is the family's IA twin and it ALREADY EXISTS, in
 * `widgets/iaBlocks.ts`, offered on the website and the landing page. Moving it
 * would mean editing `registry.ts` (its place in `PANEL_ORDER`), `kinds.ts`,
 * `style.ts` and the landing adapter - and `registry.ts` is the one file a
 * family agent must never open. Two copies of the kind would also turn
 * `test/builder-registry.test.mjs`'s "kinds are unique" red on the same commit.
 * It is written up in the handoff instead. See item 1 of "What I could not
 * verify".
 *
 * -- HOW TO ADD ONE --------------------------------------------------------
 *   1. f7-data-lists/<widget>.ts exports <WIDGET>_DEF: FamilyWidgetDef and
 *      render<Widget>(w, ctx): string.
 *   2. import both here; the def goes in `defs`, the renderer in `renderers`
 *      under the def's own `kind`.
 *   3. npm test -- test/families-f7-data-lists.test.mjs
 */
import type { Family } from "../types";

import { ARCHIVE_POSTS_DEF, renderArchivePosts } from "./archivePosts";
import { AUTHOR_BOX_DEF, renderAuthorBox } from "./authorBox";
import { LOOP_GRID_DEF, renderLoopGrid } from "./loopGrid";
import { PORTFOLIO_DEF, renderPortfolio } from "./portfolio";
import { POST_COMMENTS_DEF, renderPostComments } from "./postComments";
import { POST_INFO_DEF, renderPostInfo } from "./postInfo";
import { POST_NAVIGATION_DEF, renderPostNavigation } from "./postNavigation";
import { POSTS_DEF, renderPosts } from "./posts";
import { SEARCH_DEF, renderSearch } from "./search";
import { SITEMAP_DEF, renderSitemap } from "./sitemap";
import { TAXONOMY_FILTER_DEF, renderTaxonomyFilter } from "./taxonomyFilter";
import { TEMPLATE_DEF, renderTemplate } from "./template";
import {
  THEME_ARCHIVE_TITLE_DEF, THEME_PAGE_TITLE_DEF, THEME_POST_TITLE_DEF, THEME_SITE_TITLE_DEF,
  renderThemeArchiveTitle, renderThemePageTitle, renderThemePostTitle, renderThemeSiteTitle,
} from "./themeHeadings";
import {
  THEME_POST_FEATURED_IMAGE_DEF, THEME_SITE_LOGO_DEF,
  renderThemePostFeaturedImage, renderThemeSiteLogo,
} from "./themeImages";
import { THEME_POST_EXCERPT_DEF, renderThemePostExcerpt } from "./themePostExcerpt";

/**
 * THE ORDER IS THE PANEL'S ORDER.
 *
 * Elementor's own registration order for these, read off the two 2026-09-17
 * catalogues: the Pro list widgets first (Posts, Portfolio, Loop Grid), then
 * the archive one, then the two that narrow a list, then the site furniture,
 * then the single-story pieces, then the theme-* headings and pictures.
 */
export const FAMILY: Family = {
  defs: [
    POSTS_DEF,
    PORTFOLIO_DEF,
    LOOP_GRID_DEF,
    ARCHIVE_POSTS_DEF,
    TAXONOMY_FILTER_DEF,
    SEARCH_DEF,
    SITEMAP_DEF,
    TEMPLATE_DEF,
    POST_INFO_DEF,
    POST_NAVIGATION_DEF,
    POST_COMMENTS_DEF,
    AUTHOR_BOX_DEF,
    THEME_SITE_LOGO_DEF,
    THEME_SITE_TITLE_DEF,
    THEME_PAGE_TITLE_DEF,
    THEME_POST_TITLE_DEF,
    THEME_POST_EXCERPT_DEF,
    THEME_POST_FEATURED_IMAGE_DEF,
    THEME_ARCHIVE_TITLE_DEF,
  ],
  renderers: {
    posts: renderPosts,
    portfolio: renderPortfolio,
    loop_grid: renderLoopGrid,
    archive_posts: renderArchivePosts,
    taxonomy_filter: renderTaxonomyFilter,
    search: renderSearch,
    sitemap: renderSitemap,
    template: renderTemplate,
    post_info: renderPostInfo,
    post_navigation: renderPostNavigation,
    post_comments: renderPostComments,
    author_box: renderAuthorBox,
    theme_site_logo: renderThemeSiteLogo,
    theme_site_title: renderThemeSiteTitle,
    theme_page_title: renderThemePageTitle,
    theme_post_title: renderThemePostTitle,
    theme_post_excerpt: renderThemePostExcerpt,
    theme_post_featured_image: renderThemePostFeaturedImage,
    theme_archive_title: renderThemeArchiveTitle,
  },
};
