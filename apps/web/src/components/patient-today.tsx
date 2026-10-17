"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, Sparkles, Sun } from "lucide-react";
import { dateLabel, localDate } from "@hale/contracts/time";
import { useWorkspace } from "./providers";
import { RecorderCard } from "./recorder";
import { ConversationList, EmptyState, MemoryCard, SectionHeading } from "./ui";
import { VoiceAssistant } from "./voice-assistant";

export function PatientToday() {
  const { space, today } = useWorkspace();
  const memories = space.memories.filter((memory) => memory.localDate === today);
  const conversations = space.conversations.filter((conversation) => localDate(conversation.startedAt, space.timezone) === today);
  return <><header className="patient-greeting"><p className="eyebrow icon-label"><Sun size={16} />{dateLabel(today)}</p><h1>Good to see you,<br /><span>{space.name.split(" ")[0]}.</span></h1><p>Your day, a little easier to come back to.</p></header><RecorderCard /><VoiceAssistant /><Link href="/patient/ask" className="patient-ask-card"><span className="ask-orb"><Sparkles size={23} /></span><div><h2>A question on your mind?</h2><p>Let’s find a memory together.</p></div><ArrowRight size={21} /></Link><section className="patient-section"><SectionHeading title="A little of today" href={`/patient/memories?date=${today}`} link="See the day" />{memories.length ? <div className="patient-memories">{memories.slice(0, 2).map((memory) => <MemoryCard memory={memory} base="/patient" key={memory.id} />)}</div> : <EmptyState title="A new day, a little space." description="Your memories will appear when a recording is processed. An empty page doesn’t mean nothing happened." />}</section><section className="patient-section"><SectionHeading title="Recent conversations" /><ConversationList base="/patient" conversations={conversations} compact /></section><Link href="/patient/care" className="patient-care-link"><CalendarDays size={22} /><div><h3>Rides, appointments & medication records</h3><p>A little help with everyday tasks.</p></div><ArrowRight size={19} /></Link></>;
}
