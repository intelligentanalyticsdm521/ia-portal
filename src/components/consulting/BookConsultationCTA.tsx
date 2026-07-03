// BookConsultationCTA — G4-CLIENT-CONSULTING-GATE (2026-07-03)
//
// Renders a "Book your consultation" card that deep-links to
// book.intelligentanalyticsdm.com. Used on the client-side consulting
// surfaces when the tenant doesn't have an active BYB subscription, an
// open project, or (for the "C-only" path) has deliverables but nothing
// else. Also renders as a full-page shell when the tenant hits a
// consulting URL that's fully gated.
//
// Two visual modes:
//   compact   — inline card underneath page content (rules C)
//   full      — full-page shell (NONE rule; user hit consulting URL)

import { Calendar, ExternalLink } from "lucide-react";

interface Props {
  variant?: "compact" | "full";
  bookUrl?: string;
}

const DEFAULT_BOOK_URL = "https://book.intelligentanalyticsdm.com";

export function BookConsultationCTA({ variant = "compact", bookUrl }: Props) {
  const href = bookUrl || DEFAULT_BOOK_URL;

  if (variant === "full") {
    return (
      <div className="arion-page">
        <div className="max-w-2xl mx-auto py-16">
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-10 text-center">
            <div className="mx-auto w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center mb-5">
              <Calendar className="w-7 h-7 text-slate-700" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">
              Book a consultation to unlock consulting
            </h1>
            <p className="text-sm text-slate-600 mb-8 leading-relaxed">
              Our consulting workspace — Service Requests, Projects, and
              Deliverables — becomes available once you have an active Build
              Your Brand subscription or an open project with our team. Book
              a free consultation to talk through what you need.
            </p>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
            >
              Book my consultation
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 flex items-center gap-4">
      <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center flex-shrink-0">
        <Calendar className="w-5 h-5 text-slate-700" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-900">
          Need more consulting support?
        </div>
        <div className="text-xs text-slate-600 mt-0.5">
          Book a free consultation to start a new project or add Build Your
          Brand to your account.
        </div>
      </div>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors flex-shrink-0"
      >
        Book consultation
        <ExternalLink className="w-3.5 h-3.5" />
      </a>
    </div>
  );
}

export default BookConsultationCTA;
