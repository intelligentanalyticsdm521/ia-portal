// OliverPortalDesignerPage — the "White Label Design Editor".
//
// Config form (NOT a WYSIWYG) — same philosophy as the invoice template
// editor: structured fields the customer portal reads at render time. Gated
// on the Client Experience add-on (portal_design_editor). Locked state sends
// the tenant to the Client Experience page to subscribe.
import { useCallback, useEffect, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { Lock } from "lucide-react";

interface BtnCfg { visible: boolean; label: string }
interface DesignCfg {
  buttons: Record<string, BtnCfg>;
  theme: { fontFamily: string; headerText: string; footerText: string; customCss: string };
}

const BUTTONS: { key: string; defaultLabel: string }[] = [
  { key: "viewJobs",     defaultLabel: "My Jobs" },
  { key: "payInvoice",   defaultLabel: "Pay Invoice" },
  { key: "acceptQuotes", defaultLabel: "Review Quote" },
  { key: "requestWork",  defaultLabel: "Request Work" },
  { key: "messaging",    defaultLabel: "Messages" },
  { key: "reschedule",   defaultLabel: "Reschedule" },
];

const FONTS = ["System default", "Inter", "Roboto", "Lato", "Merriweather", "Poppins"];

function withDefaults(d: Partial<DesignCfg> | undefined): DesignCfg {
  const buttons: Record<string, BtnCfg> = {};
  for (const b of BUTTONS) {
    buttons[b.key] = {
      visible: d?.buttons?.[b.key]?.visible ?? true,
      label: d?.buttons?.[b.key]?.label ?? b.defaultLabel,
    };
  }
  return {
    buttons,
    theme: {
      fontFamily: d?.theme?.fontFamily ?? "System default",
      headerText: d?.theme?.headerText ?? "",
      footerText: d?.theme?.footerText ?? "",
      customCss: d?.theme?.customCss ?? "",
    },
  };
}

export function OliverPortalDesignerPage() {
  const { get, post, ready } = useOliverApi();
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [cfg, setCfg] = useState<DesignCfg>(withDefaults(undefined));
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await get<{ data: { unlocked: boolean; design: Partial<DesignCfg> } }>(
        "/client-experience/portal-design");
      setUnlocked(!!res?.data?.unlocked);
      setCfg(withDefaults(res?.data?.design));
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  async function save() {
    setSaving(true); setSaved(false);
    try {
      await post("/client-experience/portal-design", { design: cfg });
      setSaved(true);
    } catch (err) { setError(err); }
    finally { setSaving(false); }
  }

  return (
    <OliverPageWrapper
      title="Portal Designer"
      subtitle="White Label Design Editor — full control of the customer portal"
      error={error}
      loading={loading}
    >
      {unlocked === false && (
        <div className="card">
          <div className="px-5 py-8 text-center">
            <Lock className="h-8 w-8 text-slate-300 mx-auto mb-3" />
            <div className="font-semibold text-slate-800">This is a Client Experience feature</div>
            <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
              The White Label Design Editor is included with the Client
              Experience add-on (Essentials and above). Your base plan keeps
              your logo, colors, custom domain and welcome message.
            </p>
            <a href="/app/services/oliver_client_experience"
               className="inline-block mt-4 px-4 py-2 rounded-md bg-[#FEC82C] hover:bg-[#e3b424] text-[#1A3A4A] text-sm font-semibold">
              View Client Experience plans →
            </a>
          </div>
        </div>
      )}

      {unlocked && (
        <div className="space-y-4">
          {/* Buttons */}
          <div className="card">
            <div className="card-hdr">
              <div>
                <div className="card-ttl">Portal buttons</div>
                <div className="card-sub">Show/hide each action and rename it</div>
              </div>
            </div>
            <div className="px-4 pb-4 divide-y divide-slate-100">
              {BUTTONS.map((b) => (
                <div key={b.key} className="py-2.5 flex items-center gap-3">
                  <label className="flex items-center gap-2 w-32 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={cfg.buttons[b.key].visible}
                      onChange={(e) => setCfg((c) => ({
                        ...c, buttons: { ...c.buttons, [b.key]: { ...c.buttons[b.key], visible: e.target.checked } },
                      }))}
                    />
                    Visible
                  </label>
                  <input
                    type="text"
                    value={cfg.buttons[b.key].label}
                    onChange={(e) => setCfg((c) => ({
                      ...c, buttons: { ...c.buttons, [b.key]: { ...c.buttons[b.key], label: e.target.value } },
                    }))}
                    className="flex-1 border border-slate-200 rounded-md px-3 py-1.5 text-sm"
                    placeholder={b.defaultLabel}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Theme */}
          <div className="card">
            <div className="card-hdr">
              <div>
                <div className="card-ttl">Theme</div>
                <div className="card-sub">Font, header/footer, and advanced CSS</div>
              </div>
            </div>
            <div className="px-4 pb-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600">Font</label>
                <select
                  value={cfg.theme.fontFamily}
                  onChange={(e) => setCfg((c) => ({ ...c, theme: { ...c.theme, fontFamily: e.target.value } }))}
                  className="mt-1 w-full border border-slate-200 rounded-md px-3 py-1.5 text-sm"
                >
                  {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Header text</label>
                <input
                  type="text"
                  value={cfg.theme.headerText}
                  onChange={(e) => setCfg((c) => ({ ...c, theme: { ...c.theme, headerText: e.target.value } }))}
                  className="mt-1 w-full border border-slate-200 rounded-md px-3 py-1.5 text-sm"
                  placeholder="Shown at the top of the customer portal"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Footer text</label>
                <input
                  type="text"
                  value={cfg.theme.footerText}
                  onChange={(e) => setCfg((c) => ({ ...c, theme: { ...c.theme, footerText: e.target.value } }))}
                  className="mt-1 w-full border border-slate-200 rounded-md px-3 py-1.5 text-sm"
                  placeholder="Shown at the bottom of the customer portal"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Custom CSS</label>
                <textarea
                  value={cfg.theme.customCss}
                  onChange={(e) => setCfg((c) => ({ ...c, theme: { ...c.theme, customCss: e.target.value } }))}
                  rows={6}
                  className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-xs font-mono"
                  placeholder="/* advanced — applied to the customer portal */"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="px-4 py-2 rounded-md bg-[#1A3A4A] hover:bg-[#15303d] text-white text-sm font-semibold disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save design"}
            </button>
            {saved && <span className="text-sm text-emerald-600">Saved</span>}
          </div>
        </div>
      )}
    </OliverPageWrapper>
  );
}

export default OliverPortalDesignerPage;
