// ArgusChatbot — F-120 Phase 1 (rule-based).
//
// Floating lime-green chat button bottom-right. Clicking opens a 380×600
// panel with an ink-gradient header and a chat area. Messages are matched
// against `argusIntents.ARGUS_INTENTS`; the highest-scoring intent's reply
// is shown, optionally with a "Take me there" CTA (route) or a tour kick-off
// button. If the user says they're stuck, an inline ticket form opens and
// posts to /argus/tickets (LUMEN-API). On error the form falls back to a
// mailto: link so the user always has a path.
//
// Phase 2 (not in this commit): if no intent matches above threshold, fall
// back to a backend Claude call streaming the response. We leave a clear
// hook for that — `tryServerFallback()`.
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageSquare, Send, X, ExternalLink, Play, Ticket } from "lucide-react";
import { matchIntent, type ArgusIntent } from "./argusIntents";
import { ALL_TOURS, GuidedTour, type TourDef } from "../GuidedTour";

type Sender = "user" | "argus";

interface Message {
  id: string;
  sender: Sender;
  text: string;
  cta?: { label: string; to: string };
  tourId?: string;
  openTicket?: boolean;
}

interface TicketDraft {
  subject: string;
  description: string;
  severity: "low" | "medium" | "high";
}

const FOUNDER_FALLBACK_MAILTO = "support@intelligentanalyticsdm.com";

function uid() { return Math.random().toString(36).slice(2, 9); }

const SUGGESTIONS = [
  { label: "📊 My Account", message: "see my plan" },
  { label: "💳 Subscriptions & Billing", message: "billing history" },
  { label: "🎯 Help with a feature", message: "where do I add a customer" },
  { label: "🚀 Take a tour", message: "show me how oliver works" },
  { label: "✋ I'm stuck — submit a ticket", message: "I'm stuck" },
];

export function ArgusChatbot() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: uid(),
      sender: "argus",
      text:
        "Hi! I'm ARGUS, your IA assistant. How can I help you today?\n\nTry one of the quick options below, or type a question.",
    },
  ]);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [activeTour, setActiveTour] = useState<TourDef | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new message.
  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [messages.length, ticketOpen]);

  const send = (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text) return;
    setInput("");
    const userMsg: Message = { id: uid(), sender: "user", text };
    setMessages((m) => [...m, userMsg]);

    const m = matchIntent(text);
    let replyText = "";
    let intent: ArgusIntent | null = null;
    let openTicket = false;
    let tourId: string | undefined;
    let cta: Message["cta"] | undefined;

    if (m.smalltalk) {
      replyText = m.smalltalk.reply;
    } else if (m.intent && m.score >= 10) {
      intent = m.intent;
      replyText = intent.reply;
      cta = intent.cta;
      tourId = intent.tour;
      openTicket = !!intent.openTicket;
    } else {
      // Below threshold — Phase 1 polite fallback. Phase 2 hooks in here.
      replyText =
        "I didn't quite catch that. Try wording it differently, tap one of the quick options below, or hit ‘I'm stuck — submit a ticket' to reach the founder directly.";
    }

    const argusMsg: Message = {
      id: uid(),
      sender: "argus",
      text: replyText,
      cta,
      tourId,
      openTicket,
    };
    setMessages((m2) => [...m2, argusMsg]);
    if (openTicket) setTicketOpen(true);
    if (tourId) {
      const t = ALL_TOURS.find((t) => t.id === tourId);
      if (t) setActiveTour(t);
    }
  };

  const handleCtaClick = (to: string) => {
    navigate(to);
    setOpen(false);
  };

  return (
    <>
      {/* Floating launch button (always visible) */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open ARGUS Agent"
          title="ARGUS Agent"
          className="fixed bottom-5 right-5 z-[9000] flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:shadow-xl transition-shadow"
          style={{ background: "linear-gradient(135deg, #84CC16 0%, #65A30D 100%)" }}
        >
          <MessageSquare className="h-4 w-4" />
          <span className="hidden md:inline">Ask ARGUS</span>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-5 right-5 z-[9000] flex flex-col rounded-xl bg-white shadow-2xl border-2 overflow-hidden"
          style={{
            width: 380,
            height: 600,
            maxHeight: "calc(100vh - 40px)",
            maxWidth: "calc(100vw - 40px)",
            borderColor: "#84CC16",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 text-white"
            style={{ background: "linear-gradient(135deg, #1A3A4A 0%, #0F2530 100%)" }}
          >
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: "#84CC16", boxShadow: "0 0 8px #84CC16" }}
              />
              <div>
                <div className="text-sm font-bold">ARGUS Agent</div>
                <div className="text-[10px] text-white/70">Online · Rule-based v1</div>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded p-1 hover:bg-white/10"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollerRef} className="flex-1 overflow-y-auto bg-slate-50 px-3 py-3 space-y-2">
            {messages.map((m) => (
              <ChatBubble
                key={m.id}
                message={m}
                onCta={handleCtaClick}
                onStartTicket={() => setTicketOpen(true)}
              />
            ))}
            {!ticketOpen && messages.length <= 2 && (
              <div className="pt-1">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Quick options</div>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s.label}
                      onClick={() => send(s.message)}
                      className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {ticketOpen && <InlineTicketForm onClose={() => setTicketOpen(false)} onSubmitted={(id) => {
              setMessages((m) => [...m, { id: uid(), sender: "argus", text: `Your ticket #${id} has been submitted. I emailed the founder — you'll get a reply at your account email.` }]);
            }} />}
          </div>

          {/* Composer */}
          <div className="border-t border-slate-200 bg-white p-2">
            <form
              onSubmit={(e) => { e.preventDefault(); send(); }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message…"
                className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-[#84CC16] focus:ring-1 focus:ring-[#84CC16]"
                aria-label="Message ARGUS"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-semibold text-white"
                style={{ background: "#84CC16" }}
              >
                <Send className="h-3.5 w-3.5" /> Send
              </button>
            </form>
            <div className="mt-1 text-[9px] text-slate-400 text-center">
              ARGUS · F-120 v1 · rule-based intents
            </div>
          </div>
        </div>
      )}

      {/* Tour overlay if user kicked one off */}
      {activeTour && (
        <GuidedTour
          tour={activeTour}
          open
          onClose={() => setActiveTour(null)}
        />
      )}
    </>
  );
}

function ChatBubble({
  message, onCta, onStartTicket,
}: {
  message: Message;
  onCta: (to: string) => void;
  onStartTicket: () => void;
}) {
  const isUser = message.sender === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 text-[13px] leading-snug whitespace-pre-line ${
          isUser ? "bg-[#1A3A4A] text-white" : "bg-white border border-slate-200 text-slate-800"
        }`}
      >
        {message.text}
        {message.cta && !isUser && (
          <div className="mt-2">
            <button
              onClick={() => onCta(message.cta!.to)}
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold text-white"
              style={{ background: "#84CC16" }}
            >
              <ExternalLink className="h-3 w-3" /> {message.cta.label}
            </button>
          </div>
        )}
        {message.tourId && !isUser && (
          <div className="mt-2 text-[10px] text-slate-500 italic flex items-center gap-1">
            <Play className="h-3 w-3" /> Tour starting…
          </div>
        )}
        {message.openTicket && !isUser && (
          <div className="mt-2">
            <button
              onClick={onStartTicket}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Ticket className="h-3 w-3" /> Open ticket form
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function InlineTicketForm({ onClose, onSubmitted }: { onClose: () => void; onSubmitted: (id: string | number) => void }) {
  const [draft, setDraft] = useState<TicketDraft>({ subject: "", description: "", severity: "medium" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const apiBase = useMemo(() => (import.meta.env.VITE_LUMEN_API_BASE_URL || "").replace(/\/$/, ""), []);

  const submit = async () => {
    if (!draft.subject.trim() || !draft.description.trim()) {
      setError("Subject and description are required.");
      return;
    }
    setSubmitting(true); setError(null);
    try {
      // Best-effort POST. Endpoint may not exist yet — fall back to mailto.
      const res = await fetch(`${apiBase}/api/v1/argus/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      onSubmitted(body?.ticket_id || body?.id || "pending");
      onClose();
    } catch (err) {
      // Fallback: open the user's email client with a prefilled message.
      const subj = encodeURIComponent(`[ARGUS Ticket] ${draft.subject}`);
      const body = encodeURIComponent(`Severity: ${draft.severity}\n\n${draft.description}\n\n— Submitted from ARGUS chat`);
      window.location.href = `mailto:${FOUNDER_FALLBACK_MAILTO}?subject=${subj}&body=${body}`;
      setError("Backend unavailable — opened your email client as a fallback.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
          <Ticket className="h-3.5 w-3.5 text-[#84CC16]" /> Submit a ticket
        </div>
        <button onClick={onClose} className="rounded p-0.5 text-slate-400 hover:bg-slate-100"><X className="h-3 w-3" /></button>
      </div>
      <div className="space-y-2">
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">Subject</label>
          <input
            type="text"
            value={draft.subject}
            onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
            placeholder="Quick summary"
            className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">Description</label>
          <textarea
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder="What were you trying to do? What happened?"
            rows={3}
            className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">Severity</label>
          <select
            value={draft.severity}
            onChange={(e) => setDraft({ ...draft, severity: e.target.value as TicketDraft["severity"] })}
            className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs bg-white"
          >
            <option value="low">Low — wishlist / question</option>
            <option value="medium">Medium — blocking me right now</option>
            <option value="high">High — production / payments down</option>
          </select>
        </div>
        {error && <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 px-2 py-1 rounded">{error}</div>}
        <div className="flex justify-end gap-1.5">
          <button onClick={onClose} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
          <button
            disabled={submitting}
            onClick={submit}
            className="rounded-md px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
            style={{ background: "#84CC16" }}
          >
            {submitting ? "Sending…" : "Submit ticket"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ArgusChatbot;
