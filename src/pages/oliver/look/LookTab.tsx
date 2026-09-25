/**
 * LookTab — Customer & Crew Portals → Edit portal (customer) → Look.
 *
 * CUSTOMER_PORTAL_LOOK_SCOPE_2026-09-25 §5.3 C. Replaces the Design tab, whose
 * colour pickers, font list, header/footer copy and custom CSS box saved to
 * portal_design and were read by nothing. What a business chooses here:
 *
 *   1. one of five styles (presets.ts), shown as cards: the name in the
 *      style's own heading font, one line on how it feels, and a swatch strip;
 *   2. "Use my brand colours and fonts" (Standard and above), which lays the
 *      Brand Identity kit over the style;
 *   3. Buttons & functions: which of the ten features customers get.
 *
 * The right-hand side is the REAL customer portal in a phone (390×780) or
 * desktop (1024 wide) frame at <portal>/?look=preview. It signs in as a sample
 * customer and nothing it does is saved (the customer portal's half of §5.2).
 * Every change here is posted to it as { type: "oliver-look", look } once it
 * has said { type: "oliver-look-ready" }, so the preview repaints without a
 * reload. Only the unsaved preview is resolved here; the look customers get is
 * resolved by oliver-api from what Save look stores:
 *
 *   PATCH /portals/design?kind=customer   { preset, use_brand, features }
 *
 * The GET and PATCH answers also carry the plan's allowances (brand colours
 * Standard+, "Powered by OLIVER" off Pro+) and the brand kit oliver-api merges
 * from, and the tab uses those instead of asking the plan and the kit itself,
 * so the preview and the real look are built from the same inputs.
 *
 * The editor state lives in useLookEditor(), called by the portal editor modal
 * rather than by this tab, so switching to Signup form and back keeps an
 * unsaved choice and the modal footer can say "Unsaved changes".
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ExternalLink, Lock, Monitor, RefreshCw, Smartphone, AlertTriangle } from "lucide-react";
import { useOliverApi } from "../../../hooks/useOliverApi";
import { apiErrorMessage } from "../../../lib/apiErrorMessage";
import { PRESETS, PRESET_INFO, PRESET_KEYS, type PresetKey } from "./presets";
import {
  FEATURES,
  allowancesFromSaved,
  brandFromSaved,
  chosenBrandColour,
  chosenBrandFont,
  choiceFromSaved,
  googleFontHref,
  isLookReady,
  lookMessage,
  lookProblems,
  normalizeFeatures,
  resolvePreviewLook,
  sameChoice,
  type BrandForLook,
  type FeatureKey,
  type LookAllowances,
  type LookChoice,
  type LookProblem,
  type PortalLook,
} from "./lookModel";

const DESIGN_PATH = "/portals/design?kind=customer";

// ── State ──────────────────────────────────────────────────────────────────

export interface LookEditor {
  /** The choice as saved; null until the first read answers. */
  saved: LookChoice | null;
  /** The choice on screen. */
  draft: LookChoice | null;
  loadError: string | null;
  reload: () => void;
  saving: boolean;
  saveError: string | null;
  toast: string | null;
  dirty: boolean;
  /** The resolved look the preview is painted with. */
  look: PortalLook | null;
  /** Pairs under 4.5:1. Save is off while there are any. */
  problems: LookProblem[];
  /** What the plan includes, as oliver-api decides it. */
  allowances: LookAllowances;
  /** The brand kit oliver-api merges from; null when it sent none. */
  brand: BrandForLook | null;
  setPreset: (p: PresetKey) => void;
  setUseBrand: (on: boolean) => void;
  setFeature: (k: FeatureKey, on: boolean) => void;
  save: () => Promise<void>;
  discard: () => void;
}

/**
 * GET /portals/design?kind=customer answers the saved choice AND, beside it,
 * the plan's allowances and the brand kit oliver-api merges from (routes/
 * portals.js customerDesign). The tab reads those rather than asking the plan
 * and the brand kit itself, so the preview is built from exactly what the
 * server will build the real look from.
 */
export function useLookEditor(enabled: boolean): LookEditor {
  const { get, patch, ready } = useOliverApi();

  const [saved, setSaved] = useState<LookChoice | null>(null);
  const [draft, setDraft] = useState<LookChoice | null>(null);
  const [allowances, setAllowances] = useState<LookAllowances>(() => allowancesFromSaved(null));
  const [brand, setBrand] = useState<BrandForLook | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadNonce, setLoadNonce] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !ready) return;
    let cancelled = false;
    setLoadError(null);
    get<unknown>(DESIGN_PATH)
      .then((r) => {
        if (cancelled) return;
        const c = choiceFromSaved(r);
        setSaved(c);
        setDraft(c);
        setAllowances(allowancesFromSaved(r));
        setBrand(brandFromSaved(r));
      })
      // Named, never a silent default: a look we could not read must not be
      // offered for a save that would overwrite it.
      .catch((e) => { if (!cancelled) setLoadError(apiErrorMessage(e)); });
    return () => { cancelled = true; };
  }, [enabled, ready, get, loadNonce]);

  // Brand Identity opens in its own tab. Coming back re-reads the brand and
  // the plan (never the choice, so an unsaved edit survives), and the preview
  // shows the colours just saved there.
  useEffect(() => {
    if (!enabled || !ready) return;
    const onFocus = () => {
      get<unknown>(DESIGN_PATH)
        .then((r) => { setAllowances(allowancesFromSaved(r)); setBrand(brandFromSaved(r)); })
        .catch(() => { /* the brand already on screen stays; the next save re-reads */ });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [enabled, ready, get]);

  const look = useMemo(
    () => (draft ? resolvePreviewLook(draft, brand, { brandAllowed: allowances.brand, removePoweredBy: allowances.remove_powered_by }) : null),
    [draft, brand, allowances],
  );
  const problems = useMemo(() => (look ? lookProblems(look.colors) : []), [look]);
  const dirty = !!draft && !!saved && !sameChoice(draft, saved);

  const edit = useCallback((fn: (d: LookChoice) => LookChoice) => {
    setToast(null);
    setSaveError(null);
    setDraft((d) => (d ? fn(d) : d));
  }, []);

  const save = useCallback(async () => {
    if (!draft || saving || problems.length) return;
    setSaving(true);
    setSaveError(null);
    setToast(null);
    const body: LookChoice = {
      preset: draft.preset,
      // Below Standard the switch is off on screen; send what is on screen.
      use_brand: draft.use_brand && allowances.brand,
      features: normalizeFeatures(draft.features),
    };
    try {
      const r = await patch<unknown>(DESIGN_PATH, body);
      const answered = r && typeof r === "object" && "preset" in (r as object);
      const next = answered ? choiceFromSaved(r) : body;
      setSaved(next);
      setDraft(next);
      if (answered) {
        setAllowances(allowancesFromSaved(r));
        setBrand(brandFromSaved(r) ?? brand);
      }
      setToast("Saved. Your customers see this look the next time they open your portal.");
    } catch (e) {
      // 400 look_unreadable names the pair; 403 feature_not_available names the plan.
      setSaveError(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }, [draft, saving, problems.length, allowances.brand, patch, brand]);

  const discard = useCallback(() => {
    setDraft(saved);
    setSaveError(null);
    setToast(null);
  }, [saved]);

  return {
    saved, draft, loadError,
    reload: () => setLoadNonce((n) => n + 1),
    saving, saveError, toast, dirty, look, problems, allowances, brand,
    setPreset: (p) => edit((d) => ({ ...d, preset: p })),
    setUseBrand: (on) => edit((d) => ({ ...d, use_brand: on })),
    setFeature: (k, on) => edit((d) => ({ ...d, features: normalizeFeatures({ ...d.features, [k]: on }) })),
    save, discard,
  };
}

// ── Fonts ──────────────────────────────────────────────────────────────────

/** One Google Fonts <link> per family, added once and left for the session. */
function useGoogleFonts(families: string[]) {
  const key = families.join("|");
  useEffect(() => {
    for (const family of key.split("|").filter(Boolean)) {
      const exists = Array.from(document.head.querySelectorAll<HTMLLinkElement>("link[data-look-font]"))
        .some((l) => l.dataset.lookFont === family);
      if (exists) continue;
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = googleFontHref(family);
      link.dataset.lookFont = family;
      document.head.appendChild(link);
    }
  }, [key]);
}

// ── The tab ────────────────────────────────────────────────────────────────

type Device = "phone" | "desktop";

export function LookTab({
  editor, previewSrc, accent,
}: {
  editor: LookEditor;
  /** <portal>/?look=preview, or null when the portal has no address yet. */
  previewSrc: string | null;
  accent: string;
}) {
  const [device, setDevice] = useState<Device>("phone");
  useGoogleFonts(PRESET_KEYS.map((k) => PRESETS[k].fonts.heading));

  if (editor.loadError) {
    return (
      <div className="p-5">
        <div className="rounded-md border-2 border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          We couldn't read your portal's saved look, so nothing here can be changed yet. {editor.loadError}
          <button type="button" onClick={editor.reload} className="ml-2 font-semibold underline">Try again</button>
        </div>
      </div>
    );
  }
  if (!editor.draft || !editor.look) {
    return <div className="p-5 text-xs text-slate-500">Loading your portal's look…</div>;
  }

  const draft = editor.draft;
  const useBrandOn = draft.use_brand && editor.allowances.brand;

  return (
    <div className="flex h-full flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
      {/* ── Left: the choices ─────────────────────────────────────────── */}
      <div className="space-y-6 p-5 lg:min-w-0 lg:flex-1 lg:overflow-y-auto">
        {editor.saveError && (
          <div className="rounded-md border-2 border-red-200 bg-red-50 px-4 py-2 text-sm text-red-900">{editor.saveError}</div>
        )}
        {editor.toast && (
          <div className="rounded-md border-2 border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">{editor.toast}</div>
        )}

        <section>
          <h3 className="text-sm font-semibold text-slate-900">Style</h3>
          <p className="mb-3 text-xs text-slate-600">
            Five looks built on the same screens. Pick the one that feels like your business; the preview changes as you click.
          </p>
          <div role="radiogroup" aria-label="Portal style" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {PRESET_KEYS.map((key) => (
              <PresetCard
                key={key}
                presetKey={key}
                selected={draft.preset === key}
                accent={accent}
                onPick={() => editor.setPreset(key)}
              />
            ))}
          </div>
        </section>

        <section>
          <BrandSwitch editor={editor} on={useBrandOn} />
          {editor.problems.length > 0 && (
            <div role="alert" className="mt-3 rounded-md border-2 border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900">
              <div className="mb-1 flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="h-3.5 w-3.5" /> Hard to read, so this look can't be saved yet
              </div>
              <ul className="list-disc space-y-0.5 pl-5">
                {editor.problems.map((p) => <li key={p.pair}>{p.message}</li>)}
              </ul>
              <p className="mt-1.5">
                Choose a darker colour in{" "}
                <a href="/app/settings/brand-identity" target="_blank" rel="noreferrer" className="font-semibold underline">Brand Identity</a>
                {useBrandOn ? ", or turn off “Use my brand colours and fonts”." : "."}
              </p>
            </div>
          )}
        </section>

        <section>
          <h3 className="text-sm font-semibold text-slate-900">Buttons &amp; functions</h3>
          <p className="mb-3 text-xs text-slate-600">
            What your customers can do in the portal. Anything you turn off disappears from their menu, their home screen and every button, and the portal refuses it too.
          </p>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {FEATURES.map((f) => {
              const checked = draft.features[f.key];
              return (
                <li key={f.key}>
                  <label className={`flex items-start gap-3 px-3 py-2.5 ${f.locked ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-slate-50"}`}>
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4"
                      checked={checked}
                      disabled={f.locked}
                      onChange={(e) => editor.setFeature(f.key, e.target.checked)}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-900">
                        {f.label}
                        {f.locked && <Lock className="ml-1.5 inline h-3 w-3 text-slate-400" aria-label="Always on" />}
                      </span>
                      <span className="block text-xs text-slate-500">{f.what}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[11px] text-slate-500">
            {editor.look.powered_by
              ? "A small “Powered by OLIVER” line shows at the bottom of your portal. It comes off on OLIVER Pro and above."
              : "Your portal carries no “Powered by OLIVER” line on your plan."}
          </p>
        </section>
      </div>

      {/* ── Right: the live preview ───────────────────────────────────── */}
      <div
        className={`flex shrink-0 flex-col border-t border-slate-200 bg-slate-50 p-4 lg:border-l lg:border-t-0 ${
          device === "phone" ? "lg:w-[440px]" : "lg:w-[58%]"
        }`}
      >
        <LookPreview src={previewSrc} look={editor.look} device={device} setDevice={setDevice} />
      </div>
    </div>
  );
}

// ── Preset card ────────────────────────────────────────────────────────────

const SWATCHES: Array<{ slot: "background" | "surface" | "primary" | "accent" | "text"; label: string }> = [
  { slot: "background", label: "Background" },
  { slot: "surface", label: "Cards" },
  { slot: "primary", label: "Main colour" },
  { slot: "accent", label: "Highlight" },
  { slot: "text", label: "Text" },
];

function PresetCard({
  presetKey, selected, accent, onPick,
}: {
  presetKey: PresetKey;
  selected: boolean;
  accent: string;
  onPick: () => void;
}) {
  const p = PRESETS[presetKey];
  const info = PRESET_INFO[presetKey];
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onPick}
      title={`Use the ${info.name} style`}
      className={`relative flex flex-col overflow-hidden rounded-lg border-2 bg-white text-left transition hover:shadow-sm ${
        selected ? "shadow-sm" : "border-slate-200 hover:border-slate-300"
      }`}
      style={selected ? { borderColor: accent } : undefined}
    >
      <div className="px-3 pb-2 pt-3" style={{ background: p.colors.background }}>
        <div
          className="text-lg leading-tight"
          style={{ fontFamily: `"${p.fonts.heading}", system-ui, sans-serif`, fontWeight: 700, color: p.colors.text }}
        >
          {info.name}
        </div>
        <div className="mt-2 flex h-5 overflow-hidden rounded border border-black/10">
          {SWATCHES.map((s) => (
            <span
              key={s.slot}
              className="flex-1"
              style={{ background: p.colors[s.slot] }}
              title={`${s.label} ${p.colors[s.slot]}`}
            />
          ))}
        </div>
      </div>
      <div className="flex-1 px-3 py-2">
        <div className="text-xs text-slate-700">{info.feel}</div>
        <div className="mt-1 text-[11px] text-slate-500">Good for: {info.suits}</div>
      </div>
      {selected && (
        <span
          className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full text-white"
          style={{ background: accent }}
          aria-hidden
        >
          <Check className="h-3 w-3" />
        </span>
      )}
    </button>
  );
}

// ── Brand switch ───────────────────────────────────────────────────────────

function BrandSwitch({ editor, on }: { editor: LookEditor; on: boolean }) {
  const locked = !editor.allowances.brand;
  const brand = editor.brand;
  const colourSlots: Array<["primary" | "secondary" | "text" | "background", string]> = [
    ["primary", "Main colour"],
    ["secondary", "Highlight"],
    ["text", "Text"],
    ["background", "Background"],
  ];
  const heading = chosenBrandFont(brand, "heading");
  const body = chosenBrandFont(brand, "body");

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Use my brand colours and fonts"
          disabled={locked}
          onClick={() => editor.setUseBrand(!on)}
          title={locked ? "Brand colours and fonts come with OLIVER Standard and above" : on ? "Turn off your brand colours and fonts" : "Use your brand colours and fonts"}
          className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${
            on ? "bg-emerald-600" : "bg-slate-300"
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition ${on ? "translate-x-4" : "translate-x-0.5"}`} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-900">Use my brand colours and fonts</div>
          {locked ? (
            <p className="text-xs text-slate-600">
              Brand colours and fonts come with OLIVER Standard and above. Your plan doesn't include them, so your portal uses the style's own colours and fonts.{" "}
              <a href="/app/services/oliver_usage" target="_blank" rel="noreferrer" className="font-semibold text-slate-800 underline">See plans</a>
            </p>
          ) : (
            <p className="text-xs text-slate-600">
              The colours and fonts you chose in Brand Identity take the place of the style's own; its corners, cards and spacing stay. Included on OLIVER Standard and above.
            </p>
          )}
          {!locked && (
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600">
              {!brand ? (
                <span className="text-amber-800">Your brand couldn't be read just now, so the preview shows the style's colours.</span>
              ) : (
                <>
                  {colourSlots.map(([slot, label]) => {
                    const hex = chosenBrandColour(brand, slot);
                    return (
                      <span key={slot} className="inline-flex items-center gap-1">
                        <span
                          className="inline-block h-3 w-3 rounded-sm border border-black/10"
                          style={{ background: hex || "transparent" }}
                        />
                        {label}{hex ? "" : " (not set yet, the style's is used)"}
                      </span>
                    );
                  })}
                  <span>Fonts: {heading || "not set yet"} / {body || "not set yet"}</span>
                </>
              )}
              <a href="/app/settings/brand-identity" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-slate-800 underline">
                Change them in Brand Identity <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Live preview (contract §5.2) ───────────────────────────────────────────

const FRAMES: Record<Device, { w: number; h: number }> = {
  phone: { w: 390, h: 780 },
  desktop: { w: 1024, h: 768 },
};
const PHONE_BEZEL = 12;
const DESKTOP_BAR = 28;

function LookPreview({
  src, look, device, setDevice,
}: {
  src: string | null;
  look: PortalLook;
  device: Device;
  setDevice: (d: Device) => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const lookRef = useRef(look);
  lookRef.current = look;
  const [ready, setReady] = useState(false);
  const [slow, setSlow] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [box, setBox] = useState({ w: 0, h: 0 });

  const childOrigin = useMemo(() => {
    if (!src) return null;
    try { return new URL(src).origin; } catch { return null; }
  }, [src]);

  const send = useCallback(() => {
    const win = frameRef.current?.contentWindow;
    if (!win || !childOrigin) return;
    win.postMessage(lookMessage(lookRef.current), childOrigin);
  }, [childOrigin]);

  // A new address or a reload starts the handshake again.
  useEffect(() => {
    setReady(false);
    setSlow(false);
    if (!src) return;
    const t = window.setTimeout(() => setSlow(true), 10_000);
    return () => window.clearTimeout(t);
  }, [src, nonce]);

  // Both ends checked: only OUR frame, from the portal's own origin, is heard.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!childOrigin || e.origin !== childOrigin) return;
      if (e.source !== frameRef.current?.contentWindow) return;
      if (isLookReady(e.data)) {
        setReady(true);
        setSlow(false);
        send();
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [childOrigin, send]);

  // Every change, once the portal is listening.
  useEffect(() => { if (ready) send(); }, [ready, look, send]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      setBox({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const frame = FRAMES[device];
  const outerW = device === "phone" ? frame.w + PHONE_BEZEL * 2 : frame.w + 2;
  const outerH = device === "phone" ? frame.h + PHONE_BEZEL * 2 : frame.h + DESKTOP_BAR + 2;
  const scale = box.w > 0 && box.h > 0 ? Math.min(1, box.w / outerW, box.h / outerH) : 1;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">Live preview</div>
          <div className="text-[11px] text-slate-500">Your real portal with a sample customer. Nothing in it is saved.</div>
        </div>
        <div className="flex items-center gap-1">
          <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5" role="group" aria-label="Preview size">
            {(["phone", "desktop"] as Device[]).map((d) => {
              const Icon = d === "phone" ? Smartphone : Monitor;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDevice(d)}
                  aria-pressed={device === d}
                  title={d === "phone" ? "Preview on a phone" : "Preview on a computer"}
                  className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium ${
                    device === d ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" /> {d === "phone" ? "Phone" : "Desktop"}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setNonce((n) => n + 1)}
            disabled={!src}
            title="Reload the preview"
            aria-label="Reload the preview"
            className="rounded-md border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div ref={boxRef} className="relative h-[640px] min-h-0 lg:h-auto lg:flex-1">
        {!src ? (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-xs text-slate-500">
            Your portal has no address yet, so there is nothing to preview. Publish the portal first.
          </div>
        ) : (
          <div className="mx-auto" style={{ width: outerW * scale, height: outerH * scale }}>
            <div
              style={{ width: outerW, height: outerH, transform: `scale(${scale})`, transformOrigin: "top left" }}
              className={device === "phone"
                ? "rounded-[40px] bg-slate-900 shadow-xl"
                : "overflow-hidden rounded-lg border border-slate-300 bg-white shadow-xl"}
            >
              {device === "desktop" && (
                <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-100 px-3" style={{ height: DESKTOP_BAR }}>
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                </div>
              )}
              <div
                className={device === "phone" ? "overflow-hidden rounded-[28px] bg-white" : ""}
                style={device === "phone" ? { margin: PHONE_BEZEL, width: frame.w, height: frame.h } : { width: frame.w, height: frame.h }}
              >
                <iframe
                  key={`${src}#${nonce}`}
                  ref={frameRef}
                  src={src}
                  title="Customer portal preview"
                  width={frame.w}
                  height={frame.h}
                  style={{ border: 0, display: "block", width: frame.w, height: frame.h }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {src && (
        <p className="mt-2 text-[11px] text-slate-500">
          {ready
            ? `Showing the ${PRESET_INFO[look.preset].name} style${look.use_brand ? " with your brand" : ""}.`
            : slow
              ? "The preview hasn't answered yet. If it stays blank, your portal may still be starting up; press reload to try again."
              : "Opening your portal…"}
        </p>
      )}
    </div>
  );
}
