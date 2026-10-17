"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, Sun } from "lucide-react";
import { dateLabel, localDate } from "@hale/contracts/time";
import { useWorkspace } from "./providers";
import { RecorderCard } from "./recorder";
import { ConversationList, EmptyState, MemoryCard, SectionHeading } from "./ui";
import { VoiceAssistant } from "./voice-assistant";
import { Expander } from "./ui-primitives";

export function PatientToday() {
  const { space, today } = useWorkspace();
  const memories = space.memories.filter((memory) => memory.localDate === today);
  const conversations = space.conversations.filter((conversation) => localDate(conversation.startedAt, space.timezone) === today);
  const visibleMemories = memories.slice(0, 3);
  const moreMemories = memories.slice(3);
  const visibleConversations = conversations.slice(0, 3);
  const moreConversations = conversations.slice(3);
  return <><header className="patient-greeting"><p className="eyebrow icon-label"><Sun size={24} />{dateLabel(today)}</p><h1>Good to see you,<br /><span>{space.name.split(" ")[0]}.</span></h1><p>Your day, a little easier to come back to.</p></header><RecorderCard /><VoiceAssistant /><section className="patient-section"><SectionHeading title="A little of today" href={`/patient/memories?date=${today}`} link="See the day" />{memories.length ? <><div className="patient-memories">{visibleMemories.map((memory) => <MemoryCard memory={memory} base="/patient" key={memory.id} />)}</div>{moreMemories.length > 0 && <Expander className="patient-see-all" summary={`See all ${memories.length} memories`}><div className="patient-memories">{moreMemories.map((memory) => <MemoryCard memory={memory} base="/patient" key={memory.id} />)}</div></Expander>}</> : <EmptyState title="A new day, a little space." description="Your memories will appear when a recording is processed. An empty page doesn’t mean nothing happened." />}</section><section className="patient-section"><SectionHeading title="Recent conversations" /><ConversationList base="/patient" conversations={visibleConversations} compact />{moreConversations.length > 0 && <Expander className="patient-see-all" summary={`See all ${conversations.length} conversations`}><ConversationList base="/patient" conversations={moreConversations} compact /></Expander>}</section><Link href="/patient/care" className="patient-care-link"><CalendarDays size={24} /><div><h3>Rides, appointments & medication records</h3><p>A little help with everyday tasks.</p></div><ArrowRight size={24} /></Link></>;
}
