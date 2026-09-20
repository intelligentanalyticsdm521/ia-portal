/**
 * families/f2-pictures/index.ts - PICTURES.
 *
 * image, image-box, image-carousel, image-gallery, gallery, video,
 * video-playlist, audio, lottie, hotspot. All share the media picker, the
 * image-size select and the lightbox.
 *
 * BUILDER_FULL_WIDGET_PLAN_2026-09-19 section C.1: one widget, one file in
 * this folder; this index is the only thing that knows them as a SET. Nothing
 * in here ever opens registry.ts, render.ts or another family's folder, which
 * is what makes ten agents on ten families safe.
 *
 * -- THE FAMILY IS NOW WHOLE: ALL TEN --------------------------------------
 * Wave 1 built the five the panel did not have at all. Wave 2 (D-168,
 * 2026-09-19) took over the five it DID have and which were thin - between two
 * and four controls each out of Elementor's twenty-eight to sixty-one, and not
 * one Style tab between them. They are the widgets an author reaches for first.
 *
 *   Image                `image`            Basic    was 3 controls of 53
 *   Image Box            `image_box`        General  Content only, 3 invented Style keys
 *   Image Carousel       `image_carousel`   General  was 4 of 61
 *   Basic Gallery        `basic_gallery`    General  was 2 of 28
 *   Video                `video`            Basic    was 4 of 57
 *   Gallery (Pro)        `pro_gallery`      General  wave 1
 *   Video Playlist (Pro) `video_playlist`   General  wave 1
 *   SoundCloud           `audio`            General  wave 1
 *   Lottie (Pro)         `lottie`           General  wave 1
 *   Hotspot (Pro)        `hotspot`          General  wave 1
 *
 * -- HOW THE FIVE REPLACE WHAT WAS THERE -----------------------------------
 * Each keeps the SAME kind id - `image`, not `image_v2`. `mergeWidgetDefs`
 * (D-168 "OVERRIDE") drops the legacy definition of that kind from the list the
 * panel, the renderers, the upgrade and every stored document read, and puts
 * this one in the old one's PLACE on the panel. So:
 *
 *   · a proposal saved in July still opens and still draws, because the kind
 *     never changed - which is the whole reason a family reuses the id;
 *   · every property the legacy definition stored is still READ. `src`, `url`,
 *     `items`, `images`, `title`, `alt` are all read beside Elementor's own
 *     spellings, in one reader per widget, named at the top of each file;
 *   · this folder does not open registry.ts, widgets/pageOnly.ts,
 *     widgets/boxes.ts, render.ts or any adapter. The lander deletes the
 *     shadowed copies that `shadowedLegacyKinds()` prints, and deleting them
 *     changes nothing at run time, which is how you know it is safe.
 *
 * -- FOUR SURFACES, DECLARED HERE AND NOWHERE ELSE -------------------------
 * The offer file gives these widgets more than a website page, so the family
 * declares more than a page renderer (D-168 item 5b):
 *
 *   renderers        the page and the proposal canvas   all ten
 *   emailRenderers   the mailbox                        image, image_box, video
 *   landingRenderers a hosted landing page              the five of wave 2
 *   studioInserts    the My Brand canvas                none - see below
 *
 * My Brand is offered `image` alone out of this family, and the studio already
 * places it: `adapters/mybrand/insert.ts` has a `case "image"` that builds an
 * absolute-positioned ImageLayer out of `opts`, not out of widget properties,
 * so it does not care what this family calls anything. A second insert here
 * would be a second mechanism for a job already done once. Said plainly rather
 * than left as a silent absence.
 *
 * -- WHAT MAY BE ADDED HERE ------------------------------------------------
 * An ELEMENTOR widget, by Elementor's own name, group, icon, panel sections,
 * control labels and defaults - or an IA widget named in
 * test/fixtures/BUILDER_OFFERS_2026-09-19.json. Nothing else, ever. If you
 * think something is missing, write it in the handoff; do not build it.
 * test/builder-offers.test.mjs fails the build on an extra tile.
 *
 * -- HOW TO ADD ONE --------------------------------------------------------
 *   1. f2-pictures/<widget>.ts exports <WIDGET>_DEF: FamilyWidgetDef and
 *      render<Widget>(w, ctx): string.
 *   2. import both here; the def goes in `defs`, the renderer in `renderers`
 *      under the def's own `kind`.
 *   3. npm test -- test/families-f2-pictures.test.mjs
 */
import type { Family } from "../types";
import { AUDIO_DEF, renderAudio } from "./audio";
import { BASIC_GALLERY_DEF, landingBasicGallery, renderBasicGallery } from "./basicGallery";
import { PRO_GALLERY_DEF, renderProGallery } from "./gallery";
import { HOTSPOT_DEF, renderHotspot } from "./hotspot";
import { IMAGE_DEF, emailImage, landingImage, renderImage } from "./image";
import { IMAGE_BOX_DEF, emailImageBox, landingImageBox, renderImageBox } from "./imageBox";
import { IMAGE_CAROUSEL_DEF, landingImageCarousel, renderImageCarousel } from "./imageCarousel";
import { LOTTIE_DEF, renderLottie } from "./lottie";
import { VIDEO_DEF, emailVideo, emailVideoText, landingVideo, renderVideo } from "./video";
import { VIDEO_PLAYLIST_DEF, renderVideoPlaylist } from "./videoPlaylist";

export const FAMILY: Family = {
  /* Panel position is Elementor's own and comes off the machine files by LABEL
     (`registry.panelAt`), so the order here is only the order of the file. */
  defs: [
    IMAGE_DEF,
    VIDEO_DEF,
    IMAGE_BOX_DEF,
    IMAGE_CAROUSEL_DEF,
    BASIC_GALLERY_DEF,
    PRO_GALLERY_DEF,
    VIDEO_PLAYLIST_DEF,
    AUDIO_DEF,
    LOTTIE_DEF,
    HOTSPOT_DEF,
  ],
  renderers: {
    [IMAGE_DEF.kind]: renderImage,
    [VIDEO_DEF.kind]: renderVideo,
    [IMAGE_BOX_DEF.kind]: renderImageBox,
    [IMAGE_CAROUSEL_DEF.kind]: renderImageCarousel,
    [BASIC_GALLERY_DEF.kind]: renderBasicGallery,
    [PRO_GALLERY_DEF.kind]: renderProGallery,
    [VIDEO_PLAYLIST_DEF.kind]: renderVideoPlaylist,
    [AUDIO_DEF.kind]: renderAudio,
    [LOTTIE_DEF.kind]: renderLottie,
    [HOTSPOT_DEF.kind]: renderHotspot,
  },
  /* THE MAILBOX — one row, and the reason for exactly one is worth reading.
     ---------------------------------------------------------------------
     The offer file gives the newsletter three of this family: Image, Image Box
     and Video. `emailRender.ts` already draws the first two, in tables, with
     the newsletter's own type, and forty golden cases hold those bytes. A row
     here takes the kind over from that switch, so writing one for Image would
     have restyled every newsletter already written to get at a property name.
     The property name is the whole problem, so the property name is what was
     fixed: that file now reads a picture through THIS family's `pictureOf`,
     `boxTitle` and the rest, which is one reader per question and no second
     look. It fixed two quiet blanks while it was there — the mailbox was
     reading `title` for an Image Box that stores `title_text`.
     VIDEO is different: the switch has no case for it at all, so a video in a
     newsletter drew "this part needs a newer version of the builder". There is
     nothing to preserve, so the family draws it. */
  emailRenderers: {
    [VIDEO_DEF.kind]: emailVideo,
  },
  /* THE PLAIN-TEXT TWIN. A video's mailbox half is a PICTURE, so reading the
     words back out of it gives "▶ Watch the video" and a text part with no
     address in it — a link a reader cannot follow. This says the address. */
  emailTexts: {
    [VIDEO_DEF.kind]: (props) => emailVideoText(props),
  },
  /* A HOSTED LANDING PAGE — one row, for the same reason.
     `landingRender.ts` has a hand-written case for Image, Image Box, Image
     Carousel and Video with goldens on all four, and it now reads the
     properties through this family too (three more quiet blanks closed: it
     looked for `images` on a carousel that stores `carousel`).
     BASIC GALLERY is the one with nothing to preserve: `LANDING_KIND_ALIASES`
     sent it to the legacy Photo gallery, whose renderer reads `p.items`, so it
     drew an empty band however many photographs were chosen. The alias is gone
     and the family draws it. */
  landingRenderers: {
    [BASIC_GALLERY_DEF.kind]: landingBasicGallery,
  },
};

export {
  AUDIO_DEF, BASIC_GALLERY_DEF, HOTSPOT_DEF, IMAGE_BOX_DEF, IMAGE_CAROUSEL_DEF, IMAGE_DEF,
  LOTTIE_DEF, PRO_GALLERY_DEF, VIDEO_DEF, VIDEO_PLAYLIST_DEF,
};
export {
  renderAudio, renderBasicGallery, renderHotspot, renderImage, renderImageBox,
  renderImageCarousel, renderLottie, renderProGallery, renderVideo, renderVideoPlaylist,
};
export { emailImage, emailImageText, landingImage, pictureOf, altOf, captionOf, linkOf } from "./image";
export { emailImageBox, emailImageBoxText, landingImageBox, boxAlt, boxPicture, boxTitle, boxWords } from "./imageBox";
export { landingImageCarousel, carouselSlides, slideAlt, slideCaption } from "./imageCarousel";
export { landingBasicGallery, galleryPictures, galleryForPrint, showsCaption } from "./basicGallery";
export { emailVideo, emailVideoText, landingVideo, videoEmbed, aspectPadding, rawUrl, sourceOf, overlayPicture } from "./video";
export { soundcloudPlayer, soundcloudUrl } from "./audio";
export { lottieSource } from "./lottie";
