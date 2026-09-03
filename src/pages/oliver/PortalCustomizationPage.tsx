// PortalCustomizationPage — Onboarding V3 Phase 3 (#290) initial scaffold.
//
// STATUS: Backend-only pass. The full 3-panel constrained WYSIWYG editor
// (welcome copy rich-text / hero image upload / brand-color pickers with
// live preview) is scoped for the next pass — see followups.
//
// This page currently:
//   • Loads the tenant's core.portal_customization row from
//     GET /portal-customization (creates the row on first read).
//   • Renders a "Coming Soon" state with a read-only summary of what's
//     already saved so a tenant that lands here isn't confused.
//   • Ships the fetch/save plumbing (useOliverApi hooks, envelope handling)
//     so the next pass just adds the three editor panels + preview.
//
// NOT included in this scaffold:
//   • Rich-text editor for welcome HTML (needs a constrained toolbar — bold,
//     italic, link, bullet, heading; no raw HTML, no fonts, no colors).
//   • Hero image upload UI (needs the blob-upload endpoint that portal
//     designer already uses for logos — reuse, don't reinvent).
//   • Brand color pickers (colors live on oliver.tenant_brand_settings, so
//     wire the existing settings endpoint here rather than duplicating).
//   • Live preview iframe (loads the customer/crew portal SWA in an isolated
//     iframe with the pending edits POST'd as postMessage state).
//
// Colors intentionally do NOT live on core.portal_customization to avoid a
// parallel structure — see migration 126_portal_customization.sql header.
import { useCallback, useEffect, useState } from "react";
import { Paintbrush, Image as ImageIcon, Type, Clock } from "lucide-react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

interface PortalCustomization {
  tenant_id: string;
  customer_portal_welcome_html: string | null;
  crew_portal_welcome_html: string | null;
  portal_hero_bg_url: string | null;
  created_at: string;
  updated_at: string;
}

function hasContent(html: string | null): boolean {
  if (!html) return false;
  // Strip tags for a truthiness check — "<p></p>" should read as empty.
  return html.replace(/<[^>]*>/g, "").trim().length > 0;
}

export function PortalCustomizationPage() {
  const { get, ready } = useOliverApi();
  const [data, setData] = useState<PortalCustomization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      // lib/oliverApi already strips the { data: ... } envelope; reading .data
      // again yielded undefined and this page rendered empty.
      const r = await get<PortalCustomization>("/portal-customization");
      setData(r || null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [get, ready]);

  useEffect(() => { load(); }, [load]);

  return (
    <OliverPageWrapper
      title="Portal customization"
      subtitle="Customize the welcome copy, hero image, and brand feel of your customer & crew portals."
      error={error}
      loading={loading}
    >
      <div className="card mb-4">
        <div className="card-hdr">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-amber-600" />
            <div>
              <div className="card-ttl">Editor coming soon</div>
              <div className="card-sub">
                The constrained 3-panel WYSIWYG editor for welcome copy, hero
                image, and brand colors ships in the next pass. Your saved
                settings will carry forward — nothing to redo.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <div className="card-hdr">
            <div className="flex items-center gap-2">
              <Type className="w-4 h-4 text-slate-600" />
              <div className="card-ttl">Welcome copy</div>
            </div>
            <div className="card-sub">Shown at the top of each portal.</div>
          </div>
          <div className="text-sm" style={{ marginTop: 8 }}>
            <div className="mb-2">
              <span className="text-slate-500">Customer portal:</span>{" "}
              {hasContent(data?.customer_portal_welcome_html || null) ? (
                <span className="text-emerald-700">Saved</span>
              ) : (
                <span className="text-slate-400">Not set (default copy shown)</span>
              )}
            </div>
            <div>
              <span className="text-slate-500">Crew portal:</span>{" "}
              {hasContent(data?.crew_portal_welcome_html || null) ? (
                <span className="text-emerald-700">Saved</span>
              ) : (
                <span className="text-slate-400">Not set (default copy shown)</span>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-hdr">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-slate-600" />
              <div className="card-ttl">Hero image</div>
            </div>
            <div className="card-sub">Background at the top of the portal.</div>
          </div>
          <div className="text-sm" style={{ marginTop: 8 }}>
            {data?.portal_hero_bg_url ? (
              <div className="text-emerald-700 break-all">Uploaded</div>
            ) : (
              <div className="text-slate-400">Not set (default hero shown)</div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-hdr">
            <div className="flex items-center gap-2">
              <Paintbrush className="w-4 h-4 text-slate-600" />
              <div className="card-ttl">Brand colors</div>
            </div>
            <div className="card-sub">Managed on the Portal Designer page.</div>
          </div>
          <div className="text-sm text-slate-500" style={{ marginTop: 8 }}>
            Brand colors live on the existing Portal Designer surface. The next
            pass will surface the pickers here alongside the welcome copy and
            hero editors for a single 3-panel view.
          </div>
        </div>
      </div>
    </OliverPageWrapper>
  );
}

export default PortalCustomizationPage;
