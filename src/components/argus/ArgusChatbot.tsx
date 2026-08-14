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
import { MessageSquare, Send, X, ExternalLink, Play, Ticket, MousePointerClick } from "lucide-react";
import { matchIntent, type ArgusIntent } from "./argusIntents";
import { ALL_TOURS, GuidedTour, type TourDef } from "../GuidedTour";
import { useAppState } from "../../app/AppState";
import { emergencyActAsHeaders } from "../../lib/emergencyActAs";
import { searchJourneySteps } from "../../journeys";
import { launchJourneyStep } from "../walkthroughs/walkthroughLaunchBus";
import { useSparkApi } from "../../hooks/useSparkApi";

type Sender = "user" | "argus";

/** A journey step ARGUS is offering to teach — the "how do I…" answer. */
export interface HelpOffer {
  stepId: string;
  label: string;
  productLabel: string;
  hasDoIt: boolean;
}

interface Message {
  id: string;
  sender: Sender;
  text: string;
  cta?: { label: string; to: string };
  tourId?: string;
  openTicket?: boolean;
  /** Primary "show me / walk me through it" offer for a matched step. */
  help?: HelpOffer;
  /** Near-miss alternatives the user can pick instead. */
  alsoTry?: HelpOffer[];
}

interface TicketDraft {
  subject: string;
  description: string;
  severity: "low" | "medium" | "high";
}

const FOUNDER_FALLBACK_MAILTO = "info@intelligentanalyticsdm.com";

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
  const [greeted, setGreeted] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const spark = useSparkApi();

  // Alert-aware greeting. The engagement alerts already know what's wrong for
  // this tenant, so ARGUS opens with that instead of a blank "how can I
  // help?" — the assistant should know what's going on before you tell it.
  useEffect(() => {
    if (!open || greeted || !spark.ready) return;
    setGreeted(true);
    let cancelled = false;
    (async () => {
      try {
        const r = await spark.get<{ data: { alerts: Array<{ title: string; platform: string; walkthroughId?: string | null }> } }>(
          "/api/v1/engagement-alerts",
        );
        const alerts = r.data?.alerts || [];
        if (cancelled || !alerts.length) return;
        const top = alerts.slice(0, 3);
        const lines = top.map((a) => `• ${a.title} (${a.platform.toUpperCase()})`).join("\n");
        setMessages((m) => [
          ...m,
          {
            id: uid(),
            sender: "argus",
            text:
              `Before you ask — I've been keeping an eye on things. ${alerts.length === 1 ? "There's 1 thing" : `There are ${alerts.length} things`} worth a look:\n\n${lines}\n\nAsk me about any of them and I'll walk you through it.`,
          },
        ]);
      } catch {
        /* alerts are a bonus, never a blocker */
      }
    })();
    return () => { cancelled = true; };
  }, [open, greeted, spark]);

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
    // Journey search — the expansive "how do I…" layer. Every step of every
    // platform curriculum is an answerable question, and the answer IS the
    // consultant's explanation for that step. Deterministic keyword scoring,
    // no LLM (per KB_intelligence_layer: the IL is in-house and free; Claude
    // is adjacent and always metered — that lives in SPARK_IL P7, not here).
    const hits = searchJourneySteps(text, 3);
    const toOffer = (h: (typeof hits)[number]): HelpOffer => ({
      stepId: h.step.id,
      label: h.step.label,
      productLabel: h.journey.productLabel,
      hasDoIt: (h.step.doIt?.length ?? 0) > 0,
    });

    let replyText = "";
    let intent: ArgusIntent | null = null;
    let openTicket = false;
    let tourId: string | undefined;
    let cta: Message["cta"] | undefined;
    let help: HelpOffer | undefined;
    let alsoTry: HelpOffer[] | undefined;

    if (m.smalltalk) {
      replyText = m.smalltalk.reply;
    } else if (hits.length && hits[0].score >= 12) {
      // Strong curriculum match — answer the question directly.
      const top = hits[0];
      replyText = `${top.step.explain.title}\n\n${top.step.explain.body}`;
      help = toOffer(top);
      if (hits.length > 1) alsoTry = hits.slice(1).map(toOffer);
    } else if (m.intent && m.score >= 10) {
      intent = m.intent;
      replyText = intent.reply;
      cta = intent.cta;
      tourId = intent.tour;
      openTicket = !!intent.openTicket;
    } else if (hits.length) {
      // Weaker match — still better than a shrug.
      const top = hits[0];
      replyText = `${top.step.explain.title}\n\n${top.step.explain.body}`;
      help = toOffer(top);
      if (hits.length > 1) alsoTry = hits.slice(1).map(toOffer);
    } else {
      replyText =
        "I didn't quite catch that. Try naming the thing you're trying to do — \"create an email list\", \"send an invoice\", \"claim my Google listing\" — or hit \"I'm stuck\" to reach the founder directly.";
    }

    const argusMsg: Message = {
      id: uid(),
      sender: "argus",
      text: replyText,
      cta,
      tourId,
      openTicket,
      help,
      alsoTry,
    };
    setMessages((m2) => [...m2, argusMsg]);
    if (openTicket) setTicketOpen(true);
    if (tourId) {
      const t = ALL_TOURS.find((t) => t.id === tourId);
      if (t) {
        // F-127 fix — close the chat panel BEFORE launching the tour so
        // its z-index doesn't sit over the nav links the spotlight is
        // trying to highlight. Brief delay so users see ARGUS's "starting…"
        // message before the chat collapses.
        setTimeout(() => {
          setOpen(false);
          setActiveTour(t);
        }, 800);
      }
    }
  };

  const handleCtaClick = (to: string) => {
    navigate(to);
    setOpen(false);
  };

  // Launch a journey step in either mode. Close the panel first so the chat
  // z-index doesn't cover the element the spotlight is trying to highlight
  // (same reason the tour handoff below delays before opening).
  const handleHelp = (stepId: string, mode: "explain" | "doIt") => {
    setOpen(false);
    setTimeout(() => launchJourneyStep(stepId, mode), 250);
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
                <div className="text-[10px] text-white/70">Online</div>
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
                onHelp={handleHelp}
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
  message, onCta, onStartTicket, onHelp,
}: {
  message: Message;
  onCta: (to: string) => void;
  onStartTicket: () => void;
  onHelp: (stepId: string, mode: "explain" | "doIt") => void;
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
        {/* Curriculum answer — offer both modes, same as the Learn menu. */}
        {message.help && !isUser && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              onClick={() => onHelp(message.help!.stepId, "explain")}
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold text-white"
              style={{ background: "#84CC16" }}
            >
              <Play className="h-3 w-3" /> Show me
            </button>
            {message.help.hasDoIt && (
              <button
                onClick={() => onHelp(message.help!.stepId, "doIt")}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
              >
                <MousePointerClick className="h-3 w-3" /> Walk me through it
              </button>
            )}
          </div>
        )}
        {message.alsoTry?.length && !isUser ? (
          <div className="mt-2 border-t border-slate-100 pt-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
              Or did you mean
            </div>
            <div className="flex flex-col gap-0.5">
              {message.alsoTry.map((alt) => (
                <button
                  key={alt.stepId}
                  onClick={() => onHelp(alt.stepId, "explain")}
                  className="text-left text-[11px] text-slate-600 hover:text-slate-900 hover:underline"
                >
                  {alt.label} <span className="text-slate-400">· {alt.productLabel}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
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
  const { active } = useAppState();

  // F-127 — enrich the ticket with business + user context so the
  // founder doesn't have to guess who/where from.
  const context = useMemo(() => ({
    business_name: active?.tenant?.tenantFullName || active?.tenant?.tenantName || null,
    tenant_id:    active?.tenant?.tenantId || null,
    user_name:    active?.user?.displayName || [active?.user?.firstName, active?.user?.lastName].filter(Boolean).join(" ") || null,
    user_email:   active?.user?.email || null,
    user_phone:   null as string | null,                  // not currently in the session payload
    current_url:  typeof window !== "undefined" ? window.location.href : null,
    user_agent:   typeof navigator !== "undefined" ? navigator.userAgent : null,
  }), [active]);

  const submit = async () => {
    if (!draft.subject.trim() || !draft.description.trim()) {
      setError("Subject and description are required.");
      return;
    }
    setSubmitting(true); setError(null);
    try {
      const payload = { ...draft, context };
      const res = await fetch(`${apiBase}/api/v1/argus/tickets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Founder emergency act-as: ticket creation is a write — if the
          // founder is in 30-min read-only mode, LUMEN-API will 403 once its
          // middleware lands (followup). No-op outside emergency mode.
          ...emergencyActAsHeaders(),
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      onSubmitted(body?.ticket_id || body?.id || "pending");
      onClose();
    } catch (err) {
      // Fallback: open the user's email client with a richer prefilled message.
      const subj = encodeURIComponent(`[ARGUS Ticket] ${draft.subject}`);
      const ctxLines = [
        `Severity:  ${draft.severity}`,
        `Business:  ${context.business_name || '(unknown)'}`,
        `Tenant:    ${context.tenant_id || ''}`,
        `User:      ${context.user_name || ''} <${context.user_email || ''}>`,
        context.user_phone ? `Phone:     ${context.user_phone}` : null,
        `URL:       ${context.current_url || ''}`,
        '',
        '---',
        draft.description,
        '',
        '— Submitted from ARGUS chat',
      ].filter(Boolean).join('\n');
      window.location.href = `mailto:${FOUNDER_FALLBACK_MAILTO}?subject=${subj}&body=${encodeURIComponent(ctxLines)}`;
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
