/**
 * AppLinksCard — "here are your three apps, and here is how to hand them out".
 *
 * Q-APPS-PWA / APP-8. Three addresses, permanent (APP-9):
 *
 *     book.ia-dm.com/<business>/        the public booking page
 *     crew.ia-dm.com/<business>/        the field crew
 *     customer.ia-dm.com/<business>/    their customers
 *
 * The business is in the PATH, which is what lets one Static Web App serve
 * every client — Azure binds a handful of custom domains per app, so a
 * subdomain per client ran out at roughly the sixth.
 *
 * WHAT THIS PAGE IS FOR: a business owner who wants the app on their
 * customers' phones has to give them something. A URL to type is not that. So
 * every app gets a QR code — on a van door, an invoice, a door hanger — plus
 * copy-link and the two sentences that are the actual install instructions,
 * because Android and iPhone do not work the same way and pretending they do
 * turns into a support call.
 *
 * THE QR IS OURS. It is rendered by oliver-api from a vendored matrix
 * generator and this platform's own PNG encoder — not an <img> pointed at a
 * public QR service (feedback_no_third_party_product_surface). A third party
 * in the path of a client's branding would also be a list, held by somebody
 * else, of which of our clients exist and how often their codes are printed.
 */

import { useMemo, useState } from "react";
import { Copy, Check, ExternalLink, Share2, Mail, MessageSquare, QrCode, Smartphone } from "lucide-react";
// The ONE place this repo decides where oliver-api lives. Four private copies
// of that fallback used to exist; do not make a fifth.
import { OLIVER_API_BASE } from "../../lib/oliverApi";

type AppKind = "customer" | "crew" | "booking";

const APPS: Array<{ kind: AppKind; host: string; name: string; who: string }> = [
  { kind: "customer", host: "customer.ia-dm.com", name: "Customer app", who: "Your customers — jobs, quotes, invoices" },
  { kind: "crew", host: "crew.ia-dm.com", name: "Crew app", who: "Your team in the field — today's jobs, proof of work" },
  { kind: "booking", host: "book.ia-dm.com", name: "Booking page", who: "Anyone — book an appointment with you" },
];

// On a dev machine the three apps run on their Vite / built-bundle ports, so
// Open goes somewhere that answers (Brandon, 30 Sep 2026: "the open buttons
// don't appear to work" — they carried the production addresses on dev).
const DEV_PORTS: Record<AppKind, number> = { customer: 5175, crew: 5176, booking: 5407 };
const onDevMachine = () => typeof window !== "undefined" && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);

function appUrl(kind: AppKind, slug: string): string {
  if (onDevMachine()) return `http://localhost:${DEV_PORTS[kind]}/${slug}/`;
  const host = APPS.find((a) => a.kind === kind)!.host;
  // Trailing slash on purpose: it is the manifest's start_url, and a scanned
  // code that lands one redirect away from the install scope installs nothing.
  return `https://${host}/${slug}/`;
}

/**
 * One Share button per app (Brandon, 30 Sep 2026: "change that to a share
 * button and then they can text it if on a mobile or email it or whatever
 * normal share functionality is there"). On a phone it opens the device's own
 * share sheet (text, email, every app); on a desktop it offers Email and Text
 * message links and a copy of the link.
 */
function ShareButton({ url, name }: { url: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const text = `${name}: ${url}`;
  const canSheet = typeof navigator !== "undefined" && typeof navigator.share === "function";
  async function share() {
    if (canSheet) {
      try { await navigator.share({ title: name, text: name, url }); } catch { /* the person closed the sheet */ }
      return;
    }
    setOpen((o) => !o);
  }
  async function copy() {
    try { await navigator.clipboard.writeText(url); setNote("Link copied"); } catch { setNote("Copy the address shown above"); }
    setTimeout(() => setNote(null), 2500);
    setOpen(false);
  }
  return (
    <div className="relative">
      <button
        type="button"
        onClick={share}
        aria-haspopup={canSheet ? undefined : "menu"}
        aria-expanded={canSheet ? undefined : open}
        className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        <Share2 className="h-3 w-3" /> Share
      </button>
      {open && !canSheet && (
        <div role="menu" className="absolute left-0 z-20 mt-1 w-48 rounded-md border border-slate-200 bg-white p-1 text-xs shadow-lg">
          <a role="menuitem" href={`mailto:?subject=${encodeURIComponent(name)}&body=${encodeURIComponent(text)}`} onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded px-2 py-1.5 text-slate-700 hover:bg-slate-50"><Mail className="h-3 w-3" /> Email the link</a>
          <a role="menuitem" href={`sms:?&body=${encodeURIComponent(text)}`} onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded px-2 py-1.5 text-slate-700 hover:bg-slate-50"><MessageSquare className="h-3 w-3" /> Text the link</a>
          <button role="menuitem" type="button" onClick={copy}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-slate-700 hover:bg-slate-50"><Copy className="h-3 w-3" /> Copy the link</button>
        </div>
      )}
      {note && <span className="ml-2 text-xs text-emerald-700">{note}</span>}
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        try {
          void navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        } catch {
          /* an old browser or a denied permission — the link is on screen anyway */
        }
      }}
      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}

function AppRow({ kind, slug }: { kind: AppKind; slug: string }) {
  const meta = APPS.find((a) => a.kind === kind)!;
  const url = appUrl(kind, slug);
  const qrBase = `${OLIVER_API_BASE.replace(/\/$/, "")}/public/portal/${encodeURIComponent(slug)}/qr`;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-start">
      <img
        src={`${qrBase}.png?app=${kind}&size=256`}
        alt={`QR code for ${meta.name}`}
        width={104}
        height={104}
        // Not lazy: three 104px images in one card, all above the fold when
        // the section is open. Deferring them only makes the page look broken
        // for a beat.
        decoding="async"
        className="h-26 w-26 flex-none self-center rounded-md border border-slate-200 sm:self-start"
        style={{ width: 104, height: 104 }}
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-slate-900">{meta.name}</div>
        <div className="text-xs text-slate-500">{meta.who}</div>
        <div className="mt-2 break-all rounded-md bg-slate-50 px-2 py-1.5 font-mono text-xs text-slate-700">
          {url.replace(/^https:\/\//, "")}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <CopyButton value={url} />
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <ExternalLink className="h-3 w-3" /> Open
          </a>
          <ShareButton url={url} name={meta.name} />
        </div>
      </div>
    </div>
  );
}

export function AppLinksCard({ slug }: { slug: string | null }) {
  const clean = useMemo(() => (slug || "").toLowerCase().trim(), [slug]);

  if (!clean) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 text-base font-bold text-slate-900">
          <QrCode className="h-4 w-4" /> Your apps
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Publish a portal first. Your apps get their addresses from your business's short name, and
          there isn't one yet.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2 text-base font-bold text-slate-900">
        <QrCode className="h-4 w-4" /> Your apps
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Three addresses, each one installable to a phone's home screen with your name, your logo and
        your colour on the icon. Print the QR code on an invoice, a van or a door hanger.
      </p>

      <div className="mt-4 grid gap-3">
        {APPS.map((a) => (
          <AppRow key={a.kind} kind={a.kind} slug={clean} />
        ))}
      </div>

      {/* The two sentences that stop the support call. They are different
          sentences because the two platforms are genuinely different: Android
          has an install button, Safari has never had one and is not getting
          one. Do not compress this into "one tap". */}
      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Smartphone className="h-4 w-4" /> How someone puts it on their phone
        </div>
        <dl className="mt-2 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">iPhone / iPad</dt>
            <dd className="mt-1 text-sm text-slate-700">
              Open the link in <span className="font-medium">Safari</span>, tap{" "}
              <span className="font-medium">Share</span>, scroll down and choose{" "}
              <span className="font-medium">Add to Home Screen</span>. Safari has no install button —
              this is the only way, and it does not work in Chrome on an iPhone.
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Android</dt>
            <dd className="mt-1 text-sm text-slate-700">
              Open the link in <span className="font-medium">Chrome</span>. The app offers an{" "}
              <span className="font-medium">Add to home screen</span> button; if it hasn't appeared
              yet, it is also in Chrome's ⋮ menu as <span className="font-medium">Install app</span>.
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-slate-500">
          Someone who works with two businesses on our platform gets two separate icons, two separate
          sign-ins, and nothing shared between them.
        </p>
      </div>
    </div>
  );
}

export default AppLinksCard;
