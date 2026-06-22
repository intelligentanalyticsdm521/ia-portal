// MyBrandLandingPage — overview hub for the My Brand product area.
//
// "My Brand" is the in-house, IL-powered creative studio: image generation,
// brand voice monitoring, template (mini-canva) studio, asset library, and
// the social channels stack (connections, composer, calendar, analytics).
// Schema landed in LUMEN-API migration 050 (brand_voice_profile,
// brand_image_generation_job, template_studio_template, brand_asset,
// social_post_metric…) and core.tenant_social_connection / post / target.
//
// This landing page is the "front door" — 8 tile cards, one per sub-feature.
// Click a tile to deep-link into the dedicated page. The page intentionally
// fetches nothing (no API call) so first-paint is instant; per-tile counts
// can be wired in a follow-up wave once the LUMEN-API summary endpoint
// stabilises.
import { Link } from "react-router-dom";
import {
  Image as ImageIcon,
  Mic2,
  LayoutTemplate,
  FolderOpen,
  Share2,
  Edit3,
  Calendar,
  BarChart3,
  Palette,
  ArrowRight,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

interface BrandTile {
  key: string;
  name: string;
  description: string;
  route: string;
  icon: LucideIcon;
  // Optional badge — e.g. "Pro+", "New", "Beta". Rendered as a small pill in
  // the top-right of the tile so users see tier-gating before they click.
  badge?: { label: string; color: string };
}

const TILES: BrandTile[] = [
  {
    key: "my_brand_image_studio",
    name: "Image Studio",
    description: "Generate on-brand images from a prompt — uses your brand colors, fonts, and logo.",
    route: "/app/services/my_brand_image_studio",
    icon: ImageIcon,
  },
  {
    key: "my_brand_voice",
    name: "Brand Voice",
    description: "Capture your voice profile and check any copy for drift before you publish.",
    route: "/app/services/my_brand_voice",
    icon: Mic2,
  },
  {
    key: "my_brand_templates",
    name: "Template Studio",
    description: "Mini-canva: design social posts, ads, and email banners from reusable templates.",
    route: "/app/services/my_brand_templates",
    icon: LayoutTemplate,
  },
  {
    key: "my_brand_assets",
    name: "Asset Library",
    description: "Central library for logos, photos, generated images, and finished designs.",
    route: "/app/services/my_brand_assets",
    icon: FolderOpen,
  },
  {
    key: "my_brand_social_channels",
    name: "Social Channels",
    description: "Connect Facebook, Instagram, LinkedIn, X, TikTok, YouTube, and Google Business.",
    route: "/app/services/my_brand_social_channels",
    icon: Share2,
    badge: { label: "Standard+", color: "#1A3A4A" },
  },
  {
    key: "my_brand_compose",
    name: "Composer",
    description: "Compose once, publish to every connected channel with per-channel preview.",
    route: "/app/services/my_brand_compose",
    icon: Edit3,
    badge: { label: "Standard+", color: "#1A3A4A" },
  },
  {
    key: "my_brand_calendar",
    name: "Calendar",
    description: "Schedule and re-arrange upcoming posts across every connected channel.",
    route: "/app/services/my_brand_calendar",
    icon: Calendar,
    badge: { label: "Standard+", color: "#1A3A4A" },
  },
  {
    key: "my_brand_analytics",
    name: "Analytics",
    description: "Per-channel and per-post engagement, reach, and follower trends.",
    route: "/app/services/my_brand_analytics",
    icon: BarChart3,
    badge: { label: "Pro+", color: "#9333EA" },
  },
  {
    key: "my_brand_approvals",
    name: "Approval Inbox",
    description: "Founder/admin review queue for team-submitted posts when approval gating is on.",
    route: "/app/services/my_brand_approvals",
    icon: ShieldCheck,
    badge: { label: "Admin", color: "#1A3A4A" },
  },
];

export function MyBrandLandingPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex items-center gap-3">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-xl"
          style={{ background: "#FEC82C22" }}
        >
          <Palette className="h-6 w-6" style={{ color: "#1A3A4A" }} />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">My Brand</h1>
          <p className="mt-1 text-sm text-slate-600">
            Your creative studio — generate visuals, lock in your voice, design templates, and publish to every social channel from one place.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {TILES.map((tile) => (
          <TileCard key={tile.key} tile={tile} />
        ))}
      </div>
    </div>
  );
}

function TileCard({ tile }: { tile: BrandTile }) {
  const Icon = tile.icon;
  return (
    <Link
      to={tile.route}
      className="group relative flex flex-col rounded-xl border border-slate-200 bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
    >
      {tile.badge && (
        <span
          className="absolute right-3 top-3 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase text-white"
          style={{ background: tile.badge.color }}
        >
          {tile.badge.label}
        </span>
      )}

      <div
        className="mb-3 flex h-10 w-10 items-center justify-center rounded-md"
        style={{ background: "#1A3A4A11" }}
      >
        <Icon className="h-5 w-5" style={{ color: "#1A3A4A" }} />
      </div>

      <div className="mb-1 text-base font-semibold text-slate-900">{tile.name}</div>
      <div className="mb-4 flex-1 text-xs text-slate-600">{tile.description}</div>

      <div className="inline-flex items-center gap-1 text-xs font-semibold text-[#1A3A4A] group-hover:gap-2 transition-all">
        Open
        <ArrowRight className="h-3 w-3" />
      </div>
    </Link>
  );
}

// ComingSoonOverlay HOC removed 2026-06-22 — see VoicePage.tsx note.
export default MyBrandLandingPage;
