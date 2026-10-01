// OliverPortalsHubPage — F-114.
//
// Single consolidated admin page that replaces the 3 scattered surfaces:
//   - oliver_portal_designer (white-label / theme; the page itself was deleted
//     2026-09-25, its job is the Look tab)
//   - oliver_portal_domains  (subdomain + custom domain binding)
//   - signup-form portion of oliver_workflow_settings
//
// Layout: two side-by-side cards (Customer Portal + Crew Portal) showing
// status + URL + "Edit portal" button. Clicking Edit opens the extra-large
// modal ("xl", 90vw × 90vh — Brandon, 1 Oct 2026: "since there is so much
// with this customer portal settings … lets make this our extra large modal")
// with the tabs Look (customer portal only) / Signup form / Domain / Workflow.
//
// 2026-09-25 (CUSTOMER_PORTAL_LOOK_SCOPE §5.3 C): the Design tab became Look
// (./look/LookTab.tsx) — five styles, the brand switch, Buttons & functions and
// a live preview of the real customer portal. The Design tab's colour pickers,
// font list, header/footer copy and custom CSS box are gone: they saved to
// portal_design and nothing read them. The crew portal has no look to choose
// (the contract's look is the customer portal's), so its editor opens on
// Signup form.
import { useCallback, useEffect, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { IadmModal, IadmButton } from "../../components/IadmModal";
import { SignupFormBuilder, type SignupConfig as SignupConfigFull } from "../../components/oliver/SignupFormBuilder";
import { PortalActivationWizard } from "../../components/oliver/PortalActivationWizard";
import { AppLinksCard } from "../../components/oliver/AppLinksCard";
import { LookTab, useLookEditor } from "./look/LookTab";
import { lookPreviewSrc } from "./look/lookModel";
import {
  depositPercentFromSettings, depositPercentText, parseDepositPercent, workflowPatchBody,
  depositSaveNote, depositSaveError,
} from "../../lib/onsiteMoney";
import {
  COMPLETION_OFF_NOTICE, completionPatchPart, completionSaveProblem, completionSavedSentence,
  completionSignatureFromSettings,
} from "../../lib/onsiteJob";
import {
  Users, Wrench, ExternalLink, Globe, Settings, Brush, FileText,
  AlertTriangle, CheckCircle2, Clock, Palette,
} from "lucide-react";

type PortalKind = "customer" | "crew";
type Tab = "look" | "signup" | "domain" | "workflow";

interface PortalStatus {
  subdomain_slug: string | null;
  custom_domain: string | null;
  custom_domain_status: "none" | "pending" | "ready" | "failed";
  is_published: boolean;
  member_count: number;
}

interface HubData {
  customer: PortalStatus;
  crew: PortalStatus;
}

const DEFAULT_CUSTOMER_HOST = "customer.ia-dm.com";
const DEFAULT_CREW_HOST = "crew.ia-dm.com";

/**
 * Q-APPS-PWA — the business is in the PATH now, not the host.
 *
 * `https://customer.ia-dm.com/summit-lawn/`, not
 * `https://summit-lawn.customer.ia-dm.com/`. Azure Static Web Apps binds a
 * handful of custom domains per app, so a subdomain per client ran out at
 * roughly the sixth; three domains for the whole platform does not.
 *
 * The old subdomains stay bound and 301 to this shape (SEAM-5-B), so anything
 * already printed still works — but this is the address we now SHOW, because
 * it is the one that installs as its own app.
 *
 * A business on its own domain is unchanged: they own that whole origin.
 */
function portalUrl(p: PortalStatus, kind: PortalKind): string {
  if (p.custom_domain && p.custom_domain_status === "ready") return `https://${p.custom_domain}`;
  const slug = p.subdomain_slug || "your-tenant-slug";
  return `https://${kind === "customer" ? DEFAULT_CUSTOMER_HOST : DEFAULT_CREW_HOST}/${slug}/`;
}

/**
 * Where the Look tab's live preview loads the customer portal: the address
 * portalUrl() prints, with ?look=preview on it. Local dev runs the customer app
 * on :5175 (dev-stack start-portals-dev.cmd) rather than customer.ia-dm.com, so
 * a dev build swaps the origin and keeps the /<slug>/ path. Build-time constant:
 * a production bundle never carries the localhost branch.
 */
const DEV_CUSTOMER_PORTAL_ORIGIN = "http://localhost:5175";

function customerPreviewSrc(p: PortalStatus): string | null {
  return lookPreviewSrc(portalUrl(p, "customer"), p.subdomain_slug, import.meta.env.DEV ? DEV_CUSTOMER_PORTAL_ORIGIN : null);
}

export function OliverPortalsHubPage() {
  const { get, ready } = useOliverApi();
  const [data, setData] = useState<HubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [editing, setEditing] = useState<{ kind: PortalKind; tab: Tab } | null>(null);
  // F-127 — first-run activation wizard. Opens automatically the FIRST time
  // a tenant clicks Edit on an un-published portal; can be re-opened later
  // via the Publish button on the card.
  const [activating, setActivating] = useState<PortalKind | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    // `loading` is the FIRST read only (it starts true). A refresh after a tab
    // saves must not flip it back: OliverPageWrapper swaps its children for
    // "Loading…" while it is true, which unmounted the open editor on every
    // save and reopened it on its first tab with the unsaved state gone.
    setError(null);
    try {
      // lib/oliverApi already strips the { data: ... } envelope; reading .data
      // again yielded undefined and this page rendered empty.
      const r = await get<HubData>("/portals/hub");
      setData(r || null);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready]);
  useEffect(() => { load(); }, [load]);

  // Fallback for older deploys where /portals/hub isn't wired yet — show
  // skeleton with no data so the page itself is still usable.
  const customer: PortalStatus = data?.customer || { subdomain_slug: null, custom_domain: null, custom_domain_status: "none", is_published: false, member_count: 0 };
  const crew: PortalStatus = data?.crew || { subdomain_slug: null, custom_domain: null, custom_domain_status: "none", is_published: false, member_count: 0 };

  return (
    <OliverPageWrapper
      title="Customer & Crew Portals"
      subtitle="One place for your customer portal's look, both portals' signup forms, custom domains and workflow."
      error={error}
      loading={loading}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <PortalCard
          kind="customer"
          icon={Users}
          accent="#1A3A4A"
          name="Customer Portal"
          tagline="Self-serve experience for your customers"
          status={customer}
          memberLabel="customers"
          onEdit={(tab) => {
            // F-127 — first-run: bounce to activation wizard before editor.
            if (!customer.is_published) setActivating("customer");
            else setEditing({ kind: "customer", tab });
          }}
        />
        <PortalCard
          kind="crew"
          icon={Wrench}
          accent="#FEC82C"
          name="Crew Portal"
          tagline="Field workers' job board + actions"
          status={crew}
          memberLabel="workers"
          onEdit={(tab) => {
            if (!crew.is_published) setActivating("crew");
            else setEditing({ kind: "crew", tab });
          }}
        />
      </div>

      {/* Q-APPS-PWA / APP-8 — the three app addresses, their QR codes, and the
          install instructions a business owner actually has to give somebody.
          Below the two portal cards because it is about handing the apps OUT,
          not about configuring them. */}
      <div className="mb-4">
        <AppLinksCard slug={customer.subdomain_slug || crew.subdomain_slug} />
      </div>

      {editing && (
        <PortalEditorModal
          portalKind={editing.kind}
          status={editing.kind === "customer" ? customer : crew}
          initialTab={editing.tab}
          onClose={() => setEditing(null)}
          onSaved={() => { load(); }}
        />
      )}

      {activating && (
        <PortalActivationWizard
          open
          portalKind={activating}
          initialSlug={(activating === "customer" ? customer : crew).subdomain_slug}
          initialPublished={(activating === "customer" ? customer : crew).is_published}
          onClose={() => setActivating(null)}
          onPublished={() => { load(); }}
        />
      )}
    </OliverPageWrapper>
  );
}

function PortalCard({
  kind, icon: Icon, accent, name, tagline, status, memberLabel, onEdit,
}: {
  kind: PortalKind;
  icon: typeof Users;
  accent: string;
  name: string;
  tagline: string;
  status: PortalStatus;
  memberLabel: string;
  onEdit: (tab: Tab) => void;
}) {
  const url = portalUrl(status, kind);
  const domainBadge = (() => {
    if (status.custom_domain && status.custom_domain_status === "ready")
      return { label: "Custom domain", color: "emerald", icon: CheckCircle2 };
    if (status.custom_domain && status.custom_domain_status === "pending")
      return { label: "Verifying domain", color: "amber", icon: Clock };
    if (status.custom_domain && status.custom_domain_status === "failed")
      return { label: "Domain failed", color: "rose", icon: AlertTriangle };
    return { label: "Default subdomain", color: "slate", icon: Globe };
  })();
  const BadgeIcon = domainBadge.icon;

  return (
    <div className="rounded-xl border-2 bg-white p-5" style={{ borderLeftColor: accent, borderLeftWidth: 4 }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-md flex items-center justify-center" style={{ background: `${accent}22` }}>
            <Icon className="h-5 w-5" style={{ color: accent }} />
          </div>
          <div>
            <div className="text-base font-bold text-slate-900">{name}</div>
            <div className="text-xs text-slate-500">{tagline}</div>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase border ${
            domainBadge.color === "emerald" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
            domainBadge.color === "amber" ? "bg-amber-50 text-amber-700 border-amber-200" :
            domainBadge.color === "rose" ? "bg-rose-50 text-rose-700 border-rose-200" :
            "bg-slate-100 text-slate-600 border-slate-200"
          }`}
        >
          <BadgeIcon className="h-3 w-3" /> {domainBadge.label}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-md bg-slate-50 border border-slate-200 p-2">
          <div className="text-[10px] uppercase font-semibold text-slate-500">URL</div>
          <a href={url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline truncate block">{url.replace(/^https:\/\//, "")}</a>
        </div>
        <div className="rounded-md bg-slate-50 border border-slate-200 p-2">
          <div className="text-[10px] uppercase font-semibold text-slate-500">{memberLabel}</div>
          <div className="text-sm font-semibold text-slate-900 tabular-nums">{status.member_count.toLocaleString()}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <a
          href={url} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <ExternalLink className="h-3 w-3" /> Open portal
        </a>
        <button onClick={() => onEdit(kind === "customer" ? "look" : "signup")} className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold text-white" style={{ background: accent, color: accent === "#FEC82C" ? "#1A3A4A" : "#fff" }}>
          <Brush className="h-3 w-3" /> Edit portal
        </button>
      </div>
    </div>
  );
}

// ── The editor modal ──────────────────────────────────────────────────────────

// ── Signup form editor state (1 Oct 2026) ─────────────────────────────────
//
// Lives in the window, not the tab, for the same reason the look does: the
// footer's "Save signup form" sits beside Done (Brandon: "I missed it because
// you have to scroll down to do it"), and an edit survives a trip to another
// tab. The tab's panel (SignupFormBuilder inline) is controlled by this draft.
interface SignupEditor {
  config: SignupConfigFull | null;
  draft: SignupConfigFull | null;
  setDraft: (next: SignupConfigFull) => void;
  dirty: boolean;
  saving: boolean;
  /** "Saved." for a moment after a save; the footer shows it. */
  savedMsg: string | null;
  error: string | null;
  save: () => Promise<void>;
}

function copyConfig(c: SignupConfigFull): SignupConfigFull {
  return { ...c, fields: [...c.fields], custom_fields: [...c.custom_fields] };
}

function useSignupEditor(onSaved: () => void): SignupEditor {
  const { get, patch, ready } = useOliverApi();
  const [config, setConfig] = useState<SignupConfigFull | null>(null);
  const [draft, setDraft] = useState<SignupConfigFull | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    get<SignupConfigFull>("/customer-signup/config")
      .then((r) => { setConfig(r); setDraft(copyConfig(r)); })
      .catch(() => { setConfig(null); setError("The signup form could not be loaded. Close the window and try again."); });
  }, [ready, get]);

  const dirty = !!config && !!draft && JSON.stringify(draft) !== JSON.stringify(config);

  const save = useCallback(async () => {
    if (!draft || saving) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await patch<SignupConfigFull>("/customer-signup/config", draft);
      setConfig(saved);
      setDraft(copyConfig(saved));
      setSavedMsg("Saved.");
      setTimeout(() => setSavedMsg(null), 3000);
      onSaved();
    } catch {
      setError("The signup form could not be saved. Try again.");
    } finally {
      setSaving(false);
    }
  }, [draft, saving, patch, onSaved]);

  return { config, draft, setDraft, dirty, saving, savedMsg, error, save };
}

function PortalEditorModal({
  portalKind, status, initialTab, onClose, onSaved,
}: {
  portalKind: PortalKind;
  status: PortalStatus;
  initialTab: Tab;
  onClose: () => void;
  onSaved: () => void;
}) {
  const hasLook = portalKind === "customer";
  const [tab, setTab] = useState<Tab>(initialTab === "look" && !hasLook ? "signup" : initialTab);
  const [confirmClose, setConfirmClose] = useState(false);
  const accent = portalKind === "customer" ? "#1A3A4A" : "#FEC82C";
  // The Look tab's state lives here, not in the tab, so an unsaved choice
  // survives a trip to another tab and the footer can say so.
  const look = useLookEditor(hasLook);
  const signup = useSignupEditor(onSaved);

  const tabs: Array<{ key: Tab; label: string; icon: typeof Brush }> = [
    ...(hasLook ? [{ key: "look" as Tab, label: "Look", icon: Palette }] : []),
    { key: "signup",   label: "Signup form", icon: FileText },
    { key: "domain",   label: "Domain",      icon: Globe },
    { key: "workflow", label: "Workflow",    icon: Settings },
  ];

  // Closing with an unsaved look or signup form asks first, like the booking page editor.
  const unsavedLook = look.dirty && !look.saving;
  const unsavedSignup = signup.dirty && !signup.saving;
  const unsavedWhat = unsavedLook && unsavedSignup ? "look and signup form" : unsavedLook ? "look" : "signup form";
  const unsavedTabs = [look.dirty && "Look", signup.dirty && "Signup form"].filter(Boolean).join(" and ");
  function requestClose() {
    if (unsavedLook || unsavedSignup) setConfirmClose(true);
    else onClose();
  }

  const wordingBlocked = Object.keys(look.wordingProblems).length > 0;
  const saveBlocked = !look.dirty || look.saving || look.problems.length > 0 || wordingBlocked;

  return (
    <>
    <IadmModal
      open
      onClose={requestClose}
      product="oliver"
      eyebrow={`${portalKind === "customer" ? "CUSTOMER" : "CREW"} PORTAL · EDIT`}
      title={`${portalKind === "customer" ? "Customer" : "Crew"} portal settings`}
      subtitle={hasLook ? "Look, signup form, domain and workflow." : "Signup form, domain and workflow."}
      size="xl"
      footer={
        <>
          {tab === "signup" && (
            <>
              <span className={`mr-auto text-xs ${signup.error ? "text-red-700" : "text-slate-500"}`}>
                {signup.saving ? "Saving…" : signup.error ? signup.error : signup.savedMsg ? signup.savedMsg : signup.dirty ? "Unsaved changes" : "All changes saved"}
              </span>
              <button
                type="button"
                onClick={() => { void signup.save(); }}
                disabled={!signup.draft || signup.saving}
                title="Save this signup form for your customers"
                className="rounded-md bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
              >
                {signup.saving ? "Saving…" : "Save signup form"}
              </button>
            </>
          )}
          {tab === "look" ? (
            <>
              <span className="mr-auto text-xs text-slate-500">
                {look.saving ? "Saving…" : look.dirty ? "Unsaved changes" : "All changes saved"}
              </span>
              <button
                type="button"
                onClick={look.discard}
                disabled={!look.dirty || look.saving}
                title="Put back the look as it was last saved"
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={() => { void look.save(); }}
                disabled={saveBlocked}
                title={look.problems.length > 0
                  ? "Some colours are too hard to read to save; see the warning above"
                  : wordingBlocked
                    ? "A wording line can't be saved as it is; see the note under it in Wording"
                    : "Save this look for your customers"}
                className="rounded-md bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
              >
                {look.saving ? "Saving…" : "Save look"}
              </button>
            </>
          ) : (
            unsavedTabs && (tab !== "signup" || look.dirty) && (
              <span className="mr-auto text-xs text-slate-500">
                {tab === "signup" ? "Unsaved changes on the Look tab" : `Unsaved changes on the ${unsavedTabs} tab${look.dirty && signup.dirty ? "s" : ""}`}
              </span>
            )
          )}
          <IadmButton variant="ghost" onClick={requestClose}>Done</IadmButton>
        </>
      }
    >
      <div className="flex h-full flex-col">
        {/* Scrolls sideways on its own at phone width rather than widening the modal. */}
        <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50 px-3 py-1">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  tab === t.key ? "bg-white text-slate-900 shadow-sm border border-slate-200" : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
                }`}
              >
                <Icon className="h-3.5 w-3.5" /><span>{t.label}</span>
                {((t.key === "look" && look.dirty) || (t.key === "signup" && signup.dirty)) && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-label="Unsaved changes" />}
              </button>
            );
          })}
        </div>

        {tab === "look" ? (
          // The Look tab lays out its own two scrolling columns (choices, preview).
          <div className="min-h-0 flex-1 overflow-hidden">
            <LookTab editor={look} previewSrc={customerPreviewSrc(status)} accent={accent} />
          </div>
        ) : tab === "signup" ? (
          // The signup panel is three columns as tall as the window, each
          // scrolling on its own; Save is in the footer beside Done.
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <SignupTab portalKind={portalKind} editor={signup} />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5">
            {tab === "domain" && <DomainTabStub portalKind={portalKind} status={status} accent={accent} onSaved={onSaved} />}
            {tab === "workflow" && <WorkflowTabStub portalKind={portalKind} accent={accent} onSaved={onSaved} />}
          </div>
        )}
      </div>
    </IadmModal>

    {confirmClose && (
      <IadmModal
        open
        onClose={() => setConfirmClose(false)}
        product="oliver"
        eyebrow="OLIVER · CUSTOMER PORTAL"
        title="Close without saving?"
        subtitle={`Your portal's ${unsavedWhat}`}
        size="confirm"
        z={60}
        footer={
          <>
            <button type="button" onClick={() => setConfirmClose(false)}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">
              Keep editing
            </button>
            <button type="button" onClick={() => { setConfirmClose(false); onClose(); }}
                    className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800">
              Close without saving
            </button>
          </>
        }
      >
        <div className="p-5 text-sm leading-relaxed text-slate-700">
          You changed your customer portal's {unsavedWhat} and have not saved it. If you close now, those changes are lost and your customers keep what you saved before.
        </div>
      </IadmModal>
    )}
    </>
  );
}

// ── Tab content (F-114 Phase 2) ──────────────────────────────────────────────
//
// Signup form, Domain and Workflow are fully inline — no deep-links to legacy
// /portal-* pages. Each loads its own slice on mount, edits in place, and
// PATCHes on Save. (Look is ./look/LookTab.tsx; Layout is PortalLayoutTab.)

// ── SignupTab → the signup form builder as a panel of the window ──────────
//
// 30 Sep 2026 (Brandon, Section 21: "sign up form I can't close it, cancel it
// or save anything"): the builder used to open as a second window inside this
// one, with a Cancel that did nothing. 1 Oct: its draft and Save moved up into
// the window (useSignupEditor), so "Save signup form" sits in the footer next
// to Done and the panel fills the extra-large window.
function SignupTab({ portalKind, editor }: { portalKind: PortalKind; editor: SignupEditor }) {
  if (editor.error && !editor.config) return <div className="p-5 text-xs text-red-700">{editor.error}</div>;
  if (!editor.config) return <div className="p-5 text-xs text-slate-500">Loading signup form…</div>;

  return (
    <>
      <div className="shrink-0 px-5 pt-4">
        <h3 className="text-sm font-semibold text-slate-900">Signup form</h3>
        <p className="text-xs text-slate-600">
          {portalKind === "customer"
            ? "Fields a customer fills out to create their portal account. Save with the button at the bottom right."
            : "Fields a worker fills out when invited (customer-portal builder shares this config). Save with the button at the bottom right."}
        </p>
      </div>
      <div className="min-h-0 flex-1">
        <SignupFormBuilder
          open
          inline
          config={editor.config}
          draft={editor.draft}
          onDraftChange={editor.setDraft}
          saving={editor.saving}
          onClose={() => { /* inline: the window's own Done closes it */ }}
          onSave={() => editor.save()}
        />
      </div>
    </>
  );
}

// ── DomainTabStub → inline domain binding (F-114 Phase 2) ─────────────────
interface BindResponse {
  hostname: string;
  portal_kind: string;
  status: string;
  azure_status: string | null;
  requires_manual_dns: boolean;
  instructions: { type?: string; host?: string; target?: string; txt_name?: string; txt_value?: string } | null;
  validation_token: string | null;
  error: string | null;
}

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }).catch(() => { /* clipboard blocked — silent */ });
      }}
      className="text-[10px] font-semibold px-2 py-0.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
    >
      {copied ? "Copied!" : label}
    </button>
  );
}

function DomainTabStub({ portalKind, status, accent, onSaved }: { portalKind: PortalKind; status: PortalStatus; accent: string; onSaved: () => void }) {
  const { get, post, del, ready } = useOliverApi();
  const [unbinding, setUnbinding] = useState(false);

  const unbind = async () => {
    if (!status.custom_domain) return;
    if (!window.confirm(`Remove ${status.custom_domain}? This unbinds it from Azure + removes the DNS validation record. Your default subdomain stays bound.`)) {
      return;
    }
    setUnbinding(true);
    try {
      const list = await get<{ data: Array<{ domain_id: string; hostname: string; portal_kind: string }> }>("/portal-domains");
      const rows = (list as { data?: Array<{ domain_id: string; hostname: string; portal_kind: string }> }).data || [];
      const match = rows.find((r) => r.hostname === status.custom_domain && r.portal_kind === portalKind);
      if (!match) {
        window.alert("Couldn't find that domain in the list — it may have already been removed. Refreshing.");
        onSaved();
        return;
      }
      await del(`/portal-domains/${match.domain_id}`);
      onSaved();
    } catch (e) {
      window.alert(`Unbind failed: ${(e as Error).message}`);
    } finally {
      setUnbinding(false);
    }
  };
  const [customDomain, setCustomDomain] = useState(status.custom_domain || "");
  const [binding, setBinding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [bindResult, setBindResult] = useState<BindResponse | null>(null);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);

  // Poll /portal-domains/status while a bind is in-flight so the user sees
  // the row flip from "validating…" → "ready" without manually refreshing.
  // Azure cert issuance usually takes 1–5 min after DNS is in place; we
  // poll every 20s and stop on terminal state (ready / failed) or after
  // 5 min (15 polls) to avoid burning quota forever.
  useEffect(() => {
    if (!bindResult?.hostname || !ready) return;
    if (bindResult.status === "ready" || bindResult.status === "failed") {
      setLiveStatus(bindResult.status);
      return;
    }
    let polls = 0;
    let cancelled = false;
    const tick = async () => {
      polls += 1;
      try {
        const r = await get<{ data?: { status?: string; ok?: boolean } }>(
          `/portal-domains/status?hostname=${encodeURIComponent(bindResult.hostname)}&portal_kind=${bindResult.portal_kind}`
        );
        const azure = r?.data?.status || null;
        if (cancelled) return;
        if (azure === "Ready") {
          setLiveStatus("ready");
          onSaved();
          return;
        }
        if (azure === "Failed") {
          setLiveStatus("failed");
          onSaved();
          return;
        }
        if (polls < 15) setTimeout(tick, 20_000);
      } catch {
        if (polls < 15 && !cancelled) setTimeout(tick, 20_000);
      }
    };
    const id = setTimeout(tick, 20_000);
    return () => { cancelled = true; clearTimeout(id); };
  }, [bindResult, get, ready, onSaved]);

  const bind = async () => {
    // Permissive hostname regex matches what the backend accepts. Normalize
    // to lowercase before validating so users typing "Portal.Acme.com" work.
    const normalized = customDomain.toLowerCase().trim();
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(normalized)) {
      setMsg("Enter a valid hostname like portal.acme.com");
      return;
    }
    if (normalized.endsWith(".ia-dm.com")) {
      setMsg("That's an IA hostname — use the default subdomain card above instead.");
      return;
    }
    setBinding(true); setMsg(null); setBindResult(null);
    try {
      // useOliverApi unwraps — this is already the BindResponse.
      const data = await post<BindResponse>(`/portal-domains/custom`, { portal_kind: portalKind, hostname: normalized });
      setBindResult(data);
      if (data?.error) {
        setMsg(`Error: ${data.error}`);
      } else if (data?.requires_manual_dns) {
        setMsg("Add the DNS records below at your provider, then refresh — Azure will validate within 1–5 min.");
      } else {
        setMsg("Binding submitted — Azure is validating (1–5 min).");
      }
      onSaved();
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`);
    } finally {
      setBinding(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Domain</h3>
        <p className="text-xs text-slate-600">
          Your portal address is <code className="font-mono text-[11px] bg-slate-100 px-1 rounded">{portalKind}.ia-dm.com/your-business/</code>, or bring your own custom domain (Pro+).
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        {/* OLD ADDRESS, LABELLED AS OLD (OLIVER pack 1).
            This card used to sit beside the correct one showing
            `{slug}.{kind}.ia-dm.com` under the words "Auto-bound. No DNS
            required." Neither half was true: there is no wildcard binding for
            these hosts, Azure Static Web Apps binds roughly five custom domains
            per app, and an owner reading two addresses for one portal prints the
            one that claims it needs no setup. It stays visible because links in
            that shape were handed out and are 301'd, and it now says which it is. */}
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="text-[10px] uppercase font-semibold text-slate-500 mb-1">Older address (still redirects)</div>
          <div className="font-mono text-slate-500 text-sm line-through">{status.subdomain_slug || "(not set)"}<span className="text-slate-400">.{portalKind}.ia-dm.com</span></div>
          <div className="text-[10px] text-slate-500 mt-1">
            Links already handed out in this shape keep working, they redirect to the address
            above. Don't print this one on anything new.
          </div>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase font-semibold text-slate-500 mb-1">Custom domain status</div>
            {status.custom_domain && (
              <button
                type="button"
                onClick={unbind}
                disabled={unbinding}
                className="text-[10px] font-semibold px-2 py-0.5 rounded border border-rose-300 bg-white hover:bg-rose-50 text-rose-700 disabled:opacity-50"
                title="Remove this custom domain (default subdomain stays bound)"
              >
                {unbinding ? "Removing…" : "Unbind"}
              </button>
            )}
          </div>
          <div className="font-mono text-slate-900 text-sm">{status.custom_domain || "—"}</div>
          <div className="text-[10px] text-slate-500 mt-1">{status.custom_domain_status === "ready" ? "✓ Live" : status.custom_domain_status === "pending" ? "Validating…" : status.custom_domain_status === "failed" ? "Failed — check CNAME" : "Not configured"}</div>
          {status.custom_domain && status.custom_domain_status === "ready" && (
            <a
              href={`https://${status.custom_domain}`}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] text-blue-600 hover:underline inline-flex items-center gap-1 mt-1"
            >
              Open portal in new tab →
            </a>
          )}
        </div>
      </div>

      <div className="rounded-md border border-slate-200 bg-white p-3">
        <div className="text-[10px] uppercase font-semibold text-slate-500 mb-2">Bind a custom domain (Pro+)</div>
        <div className="text-[11px] text-slate-600 mb-2">
          Enter the hostname you want to use (e.g. <code className="font-mono bg-slate-100 px-1">portal.acme.com</code>).
          After you click Bind, the exact CNAME + TXT records you need to add at your DNS provider will appear below — with Copy buttons.
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={customDomain}
            onChange={(e) => setCustomDomain(e.target.value)}
            placeholder={`portal.yourcompany.com`}
            className="flex-1 text-xs px-2 py-1.5 rounded border border-slate-300 font-mono"
            disabled={!ready}
          />
          <button onClick={bind} disabled={binding || !ready || !customDomain} className="rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50" style={{ background: accent, color: accent === "#FEC82C" ? "#1A3A4A" : "#fff" }}>
            {binding ? "Binding…" : "Bind"}
          </button>
        </div>
        {msg && <div className="text-[11px] text-slate-700 mt-2">{msg}</div>}

        {bindResult && (bindResult.instructions || bindResult.validation_token) && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-900">Add these DNS records</div>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase border ${
                  liveStatus === "ready" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                  liveStatus === "failed" ? "bg-rose-50 text-rose-700 border-rose-200" :
                  "bg-amber-100 text-amber-800 border-amber-300"
                }`}
              >
                {liveStatus === "ready" ? "✓ Live" : liveStatus === "failed" ? "Failed" : "Validating…"}
              </span>
            </div>
            {bindResult.instructions?.host && bindResult.instructions?.target && (
              <div className="grid grid-cols-[60px_1fr_auto] items-center gap-2 text-[11px]">
                <span className="font-semibold text-slate-600">CNAME</span>
                <code className="font-mono bg-white border border-amber-200 rounded px-2 py-1 break-all">{bindResult.instructions.host}</code>
                <CopyButton value={bindResult.instructions.host} />
                <span />
                <code className="font-mono bg-white border border-amber-200 rounded px-2 py-1 break-all">→ {bindResult.instructions.target}</code>
                <CopyButton value={bindResult.instructions.target} />
              </div>
            )}
            {bindResult.instructions?.txt_name && bindResult.instructions?.txt_value && (
              <div className="grid grid-cols-[60px_1fr_auto] items-center gap-2 text-[11px]">
                <span className="font-semibold text-slate-600">TXT</span>
                <code className="font-mono bg-white border border-amber-200 rounded px-2 py-1 break-all">{bindResult.instructions.txt_name}</code>
                <CopyButton value={bindResult.instructions.txt_name} />
                <span />
                <code className="font-mono bg-white border border-amber-200 rounded px-2 py-1 break-all">{bindResult.instructions.txt_value}</code>
                <CopyButton value={bindResult.instructions.txt_value} />
              </div>
            )}
            {bindResult.validation_token && !bindResult.instructions?.txt_value && (
              <div className="grid grid-cols-[60px_1fr_auto] items-center gap-2 text-[11px]">
                <span className="font-semibold text-slate-600">Token</span>
                <code className="font-mono bg-white border border-amber-200 rounded px-2 py-1 break-all">{bindResult.validation_token}</code>
                <CopyButton value={bindResult.validation_token} />
              </div>
            )}
            <div className="text-[10px] text-amber-900/70">DNS propagation typically takes 1–5 min; refresh this page once you've added the records.</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── WorkflowTabStub → inline workflow rules (F-114 Phase 2) ───────────────
type WorkflowShape = { reschedule_mode: string; reschedule_advance_notice_hours: number; reschedule_cutoff_hours: number; reschedule_max_count: number; booking_auto_create_invoice: string; booking_auto_send_confirmation: boolean; booking_auto_assign_worker: string; default_deposit_percent?: number | null; require_completion_signature?: boolean };

const WORKFLOW_DEFAULTS: WorkflowShape = {
  reschedule_mode: "admin_approval",
  reschedule_advance_notice_hours: 24,
  reschedule_cutoff_hours: 4,
  reschedule_max_count: 2,
  booking_auto_create_invoice: "on_confirm",
  booking_auto_send_confirmation: true,
  booking_auto_assign_worker: "none",
};

function WorkflowTabStub({ portalKind: _portalKind, accent, onSaved }: { portalKind: PortalKind; accent: string; onSaved: () => void }) {
  const { get, patch, ready } = useOliverApi();
  const [wf, setWf] = useState<WorkflowShape | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(true);
  // On-site flow Phase B (1 Oct 2026): "Ask for a deposit when a quote is
  // signed: __ %". Lives on oliver.tenant_settings.default_deposit_percent and
  // travels on GET / PATCH /workflow-settings as `default_deposit_percent`
  // (the API's name is canonical — decided 1 Oct). It rides the same one
  // Save as the other workflow rules. `undefined` = not loaded yet.
  const [depositStored, setDepositStored] = useState<number | null | undefined>(undefined);
  const [depositText, setDepositText] = useState("");
  // On-site flow Phase C (G6): "Ask the customer to sign when a job is
  // finished" — oliver.tenant_settings.require_completion_signature, ON by
  // default, on GET / PATCH /workflow-settings under the API's name. `null` =
  // the server did not send the field (the switch is not offered then);
  // `undefined` = not loaded yet. Turning it off shows the notice, and the
  // change only lands on Save workflow — the second tap.
  const [completion, setCompletion] = useState<boolean | null | undefined>(undefined);

  useEffect(() => {
    if (!ready) return;
    get<WorkflowShape>("/workflow-settings")
      .then((r) => {
        setWf(r);
        const v = depositPercentFromSettings(r);
        setDepositStored(v);
        setDepositText(depositPercentText(v));
        setCompletion(completionSignatureFromSettings(r));
      })
      .catch(() => setWf(null));
  }, [ready, get]);

  if (!wf) return <div className="text-xs text-slate-500">Loading workflow…</div>;

  const reset = () => {
    if (!window.confirm("Reset workflow rules to the platform defaults? You'll still need to click Save to persist.")) return;
    setWf({ ...WORKFLOW_DEFAULTS });
    // The platform default is ON (oliver 227: DEFAULT 1).
    if (completion !== null && completion !== undefined) setCompletion(true);
  };

  const save = async () => {
    // The deposit box is checked first, so a typo stops the save before
    // anything is written rather than half-way through it.
    const deposit = parseDepositPercent(depositText);
    if (!deposit.ok) { setSavedOk(false); setSavedMsg(deposit.message); return; }
    setSaving(true);
    try {
      await patch("/workflow-settings", { ...workflowPatchBody(wf, deposit.value), ...completionPatchPart(completion ?? null) });
    } catch (e) {
      setSavedOk(false);
      setSavedMsg(depositSaveError(e));
      setSaving(false);
      return;
    }
    // PATCH answers { ok: true } only, so the deposit is read back from
    // GET /workflow-settings: "Saved" only when the server kept what we sent.
    let note: { ok: boolean; text: string };
    try {
      const back = await get<WorkflowShape>("/workflow-settings");
      note = depositSaveNote(deposit.value, back);
      const completionProblem = completionSaveProblem(completion ?? null, back);
      if (note.ok && completionProblem) note = { ok: false, text: completionProblem };
      else if (note.ok && completion !== null && completion !== undefined) note = { ok: true, text: `${note.text} ${completionSavedSentence(completion)}` };
      if (note.ok) { setWf(back); setDepositStored(deposit.value); }
    } catch {
      note = { ok: false, text: "Workflow rules sent, but they could not be read back to check. Close and reopen this window to see what was kept." };
    }
    setSavedOk(note.ok);
    setSavedMsg(note.text);
    if (note.ok) setTimeout(() => setSavedMsg(null), 4000);
    onSaved();
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Workflow rules</h3>
        <p className="text-xs text-slate-600">Customer-initiated reschedules + what happens automatically after a booking confirms.</p>
      </div>

      <div className="rounded-md border border-slate-200 bg-white p-3 space-y-2">
        <div className="text-[10px] uppercase font-semibold text-slate-500">Reschedule policy</div>
        <label className="flex items-center gap-2 text-xs">
          <span className="w-32">Allow reschedules</span>
          <select value={wf.reschedule_mode} onChange={(e) => setWf({ ...wf, reschedule_mode: e.target.value })} className="flex-1 text-xs px-2 py-1 rounded border border-slate-300 bg-white">
            <option value="disabled">Disabled — admin manages all changes</option>
            <option value="auto_confirm">Auto-confirm — customer picks new time, instantly confirmed</option>
            <option value="admin_approval">Require admin approval — customer requests, you approve</option>
          </select>
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="block text-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Advance notice (hr)</span>
            <input type="number" value={wf.reschedule_advance_notice_hours} onChange={(e) => setWf({ ...wf, reschedule_advance_notice_hours: Number(e.target.value) })} className="w-full mt-1 text-xs px-2 py-1 rounded border border-slate-300" />
          </label>
          <label className="block text-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Cutoff (hr before)</span>
            <input type="number" value={wf.reschedule_cutoff_hours} onChange={(e) => setWf({ ...wf, reschedule_cutoff_hours: Number(e.target.value) })} className="w-full mt-1 text-xs px-2 py-1 rounded border border-slate-300" />
          </label>
          <label className="block text-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Max per booking</span>
            <input type="number" value={wf.reschedule_max_count} onChange={(e) => setWf({ ...wf, reschedule_max_count: Number(e.target.value) })} className="w-full mt-1 text-xs px-2 py-1 rounded border border-slate-300" />
          </label>
        </div>
      </div>

      <div className="rounded-md border border-slate-200 bg-white p-3 space-y-2">
        <div className="text-[10px] uppercase font-semibold text-slate-500">After booking confirms</div>
        <label className="flex items-center gap-2 text-xs">
          <span className="w-32">Auto-create invoice</span>
          <select value={wf.booking_auto_create_invoice} onChange={(e) => setWf({ ...wf, booking_auto_create_invoice: e.target.value })} className="flex-1 text-xs px-2 py-1 rounded border border-slate-300 bg-white">
            <option value="never">Never — manual invoicing only</option>
            <option value="on_confirm">When booking confirms</option>
            <option value="on_completion">When job marked complete</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={wf.booking_auto_send_confirmation} onChange={(e) => setWf({ ...wf, booking_auto_send_confirmation: e.target.checked })} />
          <span>Send confirmation email + .ics calendar invite</span>
        </label>
        <label className="flex items-center gap-2 text-xs">
          <span className="w-32">Auto-assign worker</span>
          <select value={wf.booking_auto_assign_worker} onChange={(e) => setWf({ ...wf, booking_auto_assign_worker: e.target.value })} className="flex-1 text-xs px-2 py-1 rounded border border-slate-300 bg-white">
            <option value="none">Don't auto-assign — admin assigns</option>
            <option value="preferred">Customer's preferred worker if available</option>
            <option value="round_robin">Round-robin across active workers</option>
            <option value="skill_match">Match worker by service category</option>
          </select>
        </label>
      </div>

      <div className="rounded-md border border-slate-200 bg-white p-3 space-y-2" data-testid="deposit-default">
        <div className="text-[10px] uppercase font-semibold text-slate-500">Deposits</div>
        <label className="flex items-center gap-2 text-xs">
          <span>Ask for a deposit when a quote is signed:</span>
          <input
            type="text"
            inputMode="decimal"
            aria-label="Deposit percent asked when a quote is signed"
            value={depositText}
            onChange={(e) => setDepositText(e.target.value)}
            disabled={depositStored === undefined || saving}
            placeholder="none"
            className="w-20 text-xs px-2 py-1 rounded border border-slate-300 text-right"
          />
          <span>%</span>
        </label>
        <p className="text-[11px] text-slate-500">
          The customer is offered this deposit on the crew's tablet and on the quote link after signing. It is charged to their card and taken off the final bill. Leave it empty to ask for no deposit.
        </p>
      </div>

      <div className="rounded-md border border-slate-200 bg-white p-3 space-y-2" data-testid="completion-signature">
        <div className="text-[10px] uppercase font-semibold text-slate-500">When a job is finished</div>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={completion !== false}
            onChange={(e) => setCompletion(e.target.checked)}
            disabled={completion === null || completion === undefined || saving}
          />
          <span>Ask the customer to sign when a job is finished</span>
        </label>
        {completion === null ? (
          <p className="text-[11px] text-slate-500">This setting is not available yet: the server did not say whether it is on.</p>
        ) : (
          <p className="text-[11px] text-slate-500">
            Before the crew marks a job finished, the customer sees what was done, the photos and the total on the tablet (or on their phone from a link) and signs.
          </p>
        )}
        {completion === false && (
          <p role="status" data-testid="completion-off-notice" className="rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
            {COMPLETION_OFF_NOTICE}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-slate-200">
        {savedMsg && <span className={`text-xs ${savedOk ? "text-emerald-700" : "text-red-700"}`} role={savedOk ? "status" : "alert"}>{savedMsg}</span>}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={reset}
            disabled={saving}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            title="Revert workflow rules to platform defaults"
          >
            Reset to defaults
          </button>
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50" style={{ background: accent, color: accent === "#FEC82C" ? "#1A3A4A" : "#fff" }}>
            <Settings className="h-3 w-3" /> {saving ? "Saving…" : "Save workflow"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default OliverPortalsHubPage;
