"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, ArrowUp, AudioLines, CalendarDays, MessageCircle, Sparkles, X } from "lucide-react";
import type { RecallAnswer } from "@hale/contracts";
import { recallDemo } from "@hale/contracts/recall";
import { dateLabel, durationLabel, isLocalDate, resolveDayQuestion } from "@hale/contracts/time";
import { useWorkspace } from "./providers";
import { PageIntro, PrivacyNote } from "./ui";
import { apiPath, useApiQuery } from "@/lib/api-client";
import { canUseOnlineAsk } from "@/lib/ui-permissions";
import { AskProviderConsent } from "./ask-provider-consent";
import { Button } from "./ui/button";

interface Exchange { id: string; question: string; answer?: RecallAnswer; day?: string; openRouterConsent: boolean }

export function AskView({ patient = false }: { patient?: boolean }) {
  const params = useSearchParams();
  const rawDate = params.get("date");
  const day = isLocalDate(rawDate) ? rawDate : undefined;
  return <AskThread key={day ?? "all"} patient={patient} day={day} />;
}

function AskThread({ patient, day }: { patient: boolean; day?: string }) {
  const { space, mode, today } = useWorkspace();
  const base = patient ? "/patient" : "/family";
  const [question, setQuestion] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [openRouterConsent, setOpenRouterConsent] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const suggestions = ["What did I do today?", "What did Grace say about Sunday?", "Who did I speak with yesterday?", "Where did I leave my keys?"];

  function ask(value: string) {
    const text = value.trim();
    if (!text) return;
    if (text.length > 1000) return;
    const useOpenRouter = canUseOnlineAsk(mode, openRouterConsent);
    const answer = mode === "demo" ? recallDemo(space, text, today, day) : undefined;
    setExchanges((current) => [...current.slice(-19), { id: crypto.randomUUID(), question: text, answer, day: resolveDayQuestion(text, today, day), openRouterConsent: useOpenRouter }]);
    setQuestion(""); input.current?.focus();
    if (input.current) input.current.style.height = "";
  }

  useEffect(() => {
    if (!exchanges.length) return;
    const latest = document.getElementById(`exchange-${exchanges[exchanges.length - 1].id}`);
    latest?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
  }, [exchanges]);

  function grow(element: HTMLTextAreaElement) {
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 120)}px`;
  }

  return <div className="ask-page"><PageIntro eyebrow="A little help remembering" title={<>Let’s find <span className="heading-light">that memory.</span></>} description="Ask in your own words. We’ll start with what’s been recorded." />
    <div className="ask-layout"><section className="chat-column" aria-label="Ask Hale"><div className="chat-toolbar"><span className="icon-label"><span className="mini-orb"><Sparkles size={24} /></span>Ask Hale</span><span className="scope-pill"><CalendarDays size={24} />{day ? dateLabel(day, { weekday: undefined, month: "short" }) : "All available memories"}{day && <Link href={`${base}/ask`} aria-label="Clear selected day"><X aria-hidden size={24} /><span>Clear day</span></Link>}</span></div>
       {!exchanges.length && <div className="chat-welcome"><div className="welcome-orb"><Sparkles size={24} strokeWidth={2} /></div><h2>A familiar moment<br />is a question away.</h2><p>“What did we talk about?”<br />“What am I looking forward to?”</p><div className="question-suggestions">{suggestions.map((text) => <Button variant="secondary" key={text} onClick={() => ask(text)}>{text}<ArrowRight aria-hidden /></Button>)}</div></div>}
       <div className="chat-exchanges" aria-live="polite">{exchanges.map((exchange) => {
          return <article className="chat-exchange" id={`exchange-${exchange.id}`} key={exchange.id}><div className="user-message"><span className="eyebrow">You asked</span><p>{exchange.question}</p></div><div className="assistant-message"><span className="eyebrow icon-label"><Sparkles size={24} />{mode === "live" ? exchange.openRouterConsent ? "Hale · OpenRouter free model" : "Hale · Local source recall" : "Hale · Extractive recall"}</span>{exchange.day && <p className="resolved-scope mono">Looking at {dateLabel(exchange.day, { year: "numeric" })}</p>}{!exchange.day && /\blast week\b/i.test(exchange.question) && <p className="resolved-scope mono">Looking across the last seven complete days</p>}{mode === "live" ? <LiveAnswer patientId={space.id} exchange={exchange} base={base} /> : exchange.answer && <AnswerBody answer={exchange.answer} base={base} checkLoadedSources />}</div></article>;
       })}</div>
        {mode === "live" && <AskProviderConsent checked={openRouterConsent} onChange={setOpenRouterConsent} />}
        <form className="ask-form" onSubmit={(event) => { event.preventDefault(); ask(question); }}><label className="sr-only" htmlFor="memory-question">Your question</label><textarea id="memory-question" ref={input} value={question} maxLength={1000} rows={1} placeholder="What would you like to remember?" onChange={(event) => { setQuestion(event.target.value); grow(event.target); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); ask(question); } }} /><Button variant="primary" type="submit" className="send-button" aria-label="Ask Hale" disabled={!question.trim()}><ArrowUp aria-hidden /><span>Ask</span></Button></form><p className="chat-disclaimer">OpenRouter uses the free model for conversational wording when you opt in; otherwise answers are formed locally from cited records. Answers do not perform actions or become saved evidence.</p>
    </section><aside className="ask-sidebar"><div><p className="eyebrow">A note on remembering</p><h3>Grounded in your words.<br />{patient ? "Honest about the gaps." : <em>Honest about the gaps.</em>}</h3><p>When there’s a memory to share, you can go back to the original conversation. When there isn’t, we’ll say so.</p></div><div className="ask-sidebar-links"><Link href={`${base}/${patient ? "memories" : "calendar"}`}><CalendarDays size={24} /><span>Explore a day</span><ArrowRight size={24} /></Link><Link href={`${base}/${patient ? "memories" : "conversations"}`}><MessageCircle size={24} /><span>Read a conversation</span><ArrowRight size={24} /></Link></div><PrivacyNote editorial={!patient}>Chats stay separate from your evidence. A plan is not proof that something happened.</PrivacyNote><Link href={`${base}/care`} className="text-link">Rides, appointments & medication records<ArrowRight size={24} /></Link></aside></div>
  </div>;
}

function LiveAnswer({ patientId, exchange, base }: { patientId: string; exchange: Exchange; base: string }) {
  const path = apiPath("recall", { patientId, question: exchange.question, day: exchange.day, openRouterConsent: String(exchange.openRouterConsent) });
  const { data: answer, error } = useApiQuery<RecallAnswer>(path);
  if (error) return <p role="alert">Recall is temporarily unavailable. Please try again.</p>;
  return answer ? <AnswerBody answer={answer} base={base} /> : <p role="status">Looking through your recorded words…</p>;
}

function AnswerBody({ answer, base, checkLoadedSources = false }: { answer: RecallAnswer; base: string; checkLoadedSources?: boolean }) {
  const { space } = useWorkspace();
  const missing = checkLoadedSources && answer.citations.some((citation) => !space.conversations.some((conversation) => conversation.id === citation.conversationId && conversation.turns.some((turn) => turn.id === citation.turnId)));
  return <><p>{missing ? "A source for this answer has been deleted. Ask again to use only the remaining memories." : answer.text}</p>{!missing && answer.citations.length > 0 && <div className="citation-list">{answer.citations.map((citation, index) => <Link key={`${citation.turnId}-${index}`} href={`${base}/conversations/${citation.conversationId}#${citation.turnId}`} className="citation"><AudioLines size={15} /><span><strong>{citation.label}</strong><span>{durationLabel(citation.timestamp)} · “{citation.excerpt}”</span></span><ArrowRight size={15} /></Link>)}</div>}</>;
}
