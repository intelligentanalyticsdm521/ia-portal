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
 * -- WHAT IS IN THIS FOLDER TODAY, AND WHAT IS NOT ------------------------
 * FIVE of the family's ten: the ones the panel did not have at all.
 *
 *   Gallery (Pro)        `pro_gallery`
 *   Video Playlist (Pro) `video_playlist`
 *   SoundCloud           `audio`
 *   Lottie (Pro)         `lottie`
 *   Hotspot (Pro)        `hotspot`
 *
 * The other five - Image, Image Box, Image Carousel, Basic Gallery, Video -
 * ALREADY EXIST, built by D-165, and they are NOT re-declared here. Two defs
 * with one `kind` fails `test/builder-registry.test.mjs` ("kinds are unique")
 * and would put two identical tiles on the panel; the old copy can only be
 * removed from `registry.ts` (Image) and from the shared atom files
 * `widgets/pageOnly.ts` and `widgets/boxes.ts`, which this agent must not open
 * because four other families are editing them in parallel. They are listed in
 * D168_HANDOFF_2026-09-19.md under "Land: move these into f2-pictures", with
 * what each one still owes Elementor, for the agent who lands the families.
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
import { PRO_GALLERY_DEF, renderProGallery } from "./gallery";
import { HOTSPOT_DEF, renderHotspot } from "./hotspot";
import { LOTTIE_DEF, renderLottie } from "./lottie";
import { VIDEO_PLAYLIST_DEF, renderVideoPlaylist } from "./videoPlaylist";

export const FAMILY: Family = {
  /* Panel order inside the General group follows Elementor's own: the two
     galleries sit with the pictures, the players after them. */
  defs: [
    PRO_GALLERY_DEF,
    VIDEO_PLAYLIST_DEF,
    AUDIO_DEF,
    LOTTIE_DEF,
    HOTSPOT_DEF,
  ],
  renderers: {
    [PRO_GALLERY_DEF.kind]: renderProGallery,
    [VIDEO_PLAYLIST_DEF.kind]: renderVideoPlaylist,
    [AUDIO_DEF.kind]: renderAudio,
    [LOTTIE_DEF.kind]: renderLottie,
    [HOTSPOT_DEF.kind]: renderHotspot,
  },
};

export { AUDIO_DEF, HOTSPOT_DEF, LOTTIE_DEF, PRO_GALLERY_DEF, VIDEO_PLAYLIST_DEF };
export { renderAudio, renderHotspot, renderLottie, renderProGallery, renderVideoPlaylist };
export { soundcloudPlayer, soundcloudUrl } from "./audio";
export { lottieSource } from "./lottie";
