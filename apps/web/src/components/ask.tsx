"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { ArrowRight, ArrowUp, AudioLines, CalendarDays, MessageCircle, Sparkles, X } from "lucide-react";
import type { RecallAnswer } from "@mnemo/contracts";
import { recallDemo } from "@mnemo/contracts/recall";
import { dateLabel, durationLabel, isLocalDate, resolveDayQuestion } from "@mnemo/contracts/time";
import { useWorkspace } from "./providers";
import { PageIntro, PrivacyNote } from "./ui";
import { api } from "@/lib/api";

interface Exchange { id: string; question: string; answer?: RecallAnswer; day?: string }

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
  const input = useRef<HTMLTextAreaElement>(null);
  const suggestions = ["What did I do today?", "What did Grace say about Sunday?", "Who did I speak with yesterday?", "Where did I leave my keys?"];

  function ask(value: string) {
    const text = value.trim();
    if (!text) return;
    if (text.length > 1000) return;
    const answer = mode === "demo" ? recallDemo(space, text, today, day) : undefined;
    setExchanges((current) => [...current.slice(-19), { id: crypto.randomUUID(), question: text, answer, day: resolveDayQuestion(text, today, day) }]);
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

  return <div className="ask-page"><PageIntro eyebrow="A LITTLE HELP REMEMBERING" title={<>Let’s find <span className="heading-light">that memory.</span></>} description="Ask in your own words. We’ll start with what’s been recorded." />
    <div className="ask-layout"><section className="chat-column" aria-label="Ask Mnemo"><div className="chat-toolbar"><span className="icon-label"><span className="mini-orb"><Sparkles size={15} /></span>Ask Mnemo</span><span className="scope-pill"><CalendarDays size={13} />{day ? dateLabel(day, { weekday: undefined, month: "short" }) : "All available memories"}{day && <Link href={`${base}/ask`} aria-label="Clear selected day"><X size={13} /></Link>}</span></div>
      {!exchanges.length && <div className="chat-welcome"><div className="welcome-orb"><Sparkles size={27} strokeWidth={1.4} /></div><h2>A familiar moment<br />is a question away.</h2><p>“What did we talk about?”<br />“What am I looking forward to?”</p><div className="question-suggestions">{suggestions.map((text) => <button key={text} onClick={() => ask(text)}>{text}<ArrowRight size={15} /></button>)}</div></div>}
      <div className="chat-exchanges" aria-live="polite">{exchanges.map((exchange) => {
        return <article className="chat-exchange" id={`exchange-${exchange.id}`} key={exchange.id}><div className="user-message"><span className="eyebrow">YOU ASKED</span><p>{exchange.question}</p></div><div className="assistant-message"><span className="eyebrow icon-label"><Sparkles size={14} />MNEMO · EXTRACTIVE RECALL</span>{exchange.day && <p className="resolved-scope mono">Looking at {dateLabel(exchange.day, { year: "numeric" })}</p>}{mode === "live" ? <LiveAnswer patientId={space.id} exchange={exchange} base={base} /> : exchange.answer && <AnswerBody answer={exchange.answer} base={base} checkLoadedSources />}</div></article>;
      })}</div>
      <form className="ask-form" onSubmit={(event) => { event.preventDefault(); ask(question); }}><label className="sr-only" htmlFor="memory-question">Your question</label><textarea id="memory-question" ref={input} value={question} maxLength={1000} rows={1} placeholder="What would you like to remember?" onChange={(event) => { setQuestion(event.target.value); grow(event.target); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); ask(question); } }} /><button className="send-button" type="submit" aria-label="Ask Mnemo" disabled={!question.trim()}><ArrowUp size={20} /></button></form><p className="chat-disclaimer">Source-bound text recall · no semantic search or AI generation. Answers are not saved as memories. The latest 20 questions stay on this screen only.</p>
    </section><aside className="ask-sidebar"><div><p className="eyebrow">A NOTE ON REMEMBERING</p><h3>Grounded in your words.<br />Honest about the gaps.</h3><p>When there’s a memory to share, you can go back to the original conversation. When there isn’t, we’ll say so.</p></div><div className="ask-sidebar-links"><Link href={`${base}/${patient ? "memories" : "calendar"}`}><CalendarDays size={18} /><span>Explore a day</span><ArrowRight size={16} /></Link><Link href={`${base}/${patient ? "memories" : "conversations"}`}><MessageCircle size={18} /><span>Read a conversation</span><ArrowRight size={16} /></Link></div><PrivacyNote>Chats stay separate from your evidence. A plan is not proof that something happened.</PrivacyNote><Link href={`${base}/care`} className="text-link">Rides, appointments & medication records<ArrowRight size={16} /></Link></aside></div>
  </div>;
}

function LiveAnswer({ patientId, exchange, base }: { patientId: string; exchange: Exchange; base: string }) {
  const answer = useQuery(api.recall, { patientId, question: exchange.question, day: exchange.day });
  return answer ? <AnswerBody answer={answer} base={base} /> : <p role="status">Looking through your recorded words…</p>;
}

function AnswerBody({ answer, base, checkLoadedSources = false }: { answer: RecallAnswer; base: string; checkLoadedSources?: boolean }) {
  const { space } = useWorkspace();
  const missing = checkLoadedSources && answer.citations.some((citation) => !space.conversations.some((conversation) => conversation.id === citation.conversationId && conversation.turns.some((turn) => turn.id === citation.turnId)));
  return <><p>{missing ? "A source for this answer has been deleted. Ask again to use only the remaining memories." : answer.text}</p>{!missing && answer.citations.length > 0 && <div className="citation-list">{answer.citations.map((citation, index) => <Link key={`${citation.turnId}-${index}`} href={`${base}/conversations/${citation.conversationId}#${citation.turnId}`} className="citation"><AudioLines size={15} /><span><strong>{citation.label}</strong><span>{durationLabel(citation.timestamp)} · “{citation.excerpt}”</span></span><ArrowRight size={15} /></Link>)}</div>}</>;
}
