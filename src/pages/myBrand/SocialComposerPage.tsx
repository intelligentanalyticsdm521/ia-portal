// SocialComposerPage — thin route shim for `my_brand_compose`.
//
// The composer itself is now a centered IadmModal — SocialComposerModal
// (src/components/myBrand/SocialComposerModal.tsx) — launched from the
// Social Calendar library page, per the platform rule that create/edit
// flows live in centered modals, not bare pages. This route survives so
// existing deep links keep working: it renders the calendar with the
// composer pre-opened and forwards the documented URL params:
//
//   ?destination=facebook,instagram   — pre-checks destinations
//   ?asset_ids=<a>,<b>                — pre-attaches assets
//
// Tier note: the calendar gates at social_calendar_list (Standard) — the
// same minimum tier as the old page-level social_compose_30d gate, so Lite
// still lands on the upgrade card. The 90-day/unlimited scheduling horizons
// remain enforced server-side per-post.
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { SocialCalendarPage } from "./SocialCalendarPage";
import type { Platform } from "../../components/myBrand/SocialComposerModal";

const VALID_PLATFORMS: readonly Platform[] = ["facebook", "instagram", "x", "linkedin"];

export function SocialComposerPage() {
  const [searchParams] = useSearchParams();

  const destinations = useMemo<Platform[]>(() => {
    const raw = (searchParams.get("destination") || "").toLowerCase();
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter((s): s is Platform => VALID_PLATFORMS.includes(s as Platform));
  }, [searchParams]);

  const assetIds = useMemo<string[]>(() => {
    const raw = (searchParams.get("asset_ids") || "").trim();
    return raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
  }, [searchParams]);

  return (
    <SocialCalendarPage
      initialComposerOpen
      composerDefaults={{ destinations, assetIds }}
    />
  );
}

export default SocialComposerPage;
