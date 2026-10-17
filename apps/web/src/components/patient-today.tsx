"use client";

import Link from "next/link";
import { ArrowRight, AudioLines, CalendarDays, CarFront, Check, ChevronRight, MessageCircle, Pill, Sparkles } from "lucide-react";
import type { Conversation, Memory } from "@hale/contracts";
import { clockLabel, dateLabel, localDate } from "@hale/contracts/time";
import { useWorkspace } from "./providers";
import { RecorderCard } from "./recorder";
import { EmptyState, PeopleStack, StatusPill } from "./ui";
import { Expander } from "./ui-primitives";
import { PatientTileLink } from "./patient-ui";

export function PatientToday() {
  const { space, today } = useWorkspace();
  const memories = space.memories.filter((memory) => memory.localDate === today);
  const conversations = space.conversations.filter((conversation) => localDate(conversation.startedAt, space.timezone) === today);
  const visibleMemories = memories.slice(0, 3);
  const visibleConversations = conversations.slice(0, 3);
  const moreConversations = conversations.slice(3);

  return <div className="patient-today-screen">
    <header className="patient-greeting">
      <h1>Good to see you, <em>{space.name.split(" ")[0]}.</em></h1>
      <p>Your day, a little easier to come back to.</p>
    </header>

    <RecorderCard />

    <section className="patient-quick-grid" aria-label="Quick actions">
      <PatientTileLink href="/patient/ask" icon={<Sparkles />} title="Ask about your care" />
      <PatientTileLink href="/patient/memories" icon={<CalendarDays />} title="Memories" />
      <PatientTileLink href="#recent-conversations" icon={<MessageCircle />} title="Conversations" />
      <PatientTileLink
        className="patient-care-grid-tile"
        href="/patient/care"
        icon={<span className="patient-icon-cluster"><CarFront /><CalendarDays /><Pill /></span>}
        title="Rides, appointments & medication"
        description="A little help with everyday tasks."
      />
    </section>

    <section className="patient-section patient-today-memories" aria-labelledby="patient-memories-heading">
      <h2 id="patient-memories-heading">A little of today</h2>
      {memories.length ? <>
        <div className="patient-memory-list">{visibleMemories.map((memory) => <PatientMemoryTile memory={memory} key={memory.id} />)}</div>
        <PatientTileLink className="patient-see-all-tile" href={`/patient/memories?date=${today}`} icon={<CalendarDays />} title={`See all ${memories.length} memories`} />
      </> : <EmptyState title="A new day, a little space." description="Your memories will appear when a recording is processed. An empty page doesn’t mean nothing happened." />}
    </section>

    <section id="recent-conversations" className="patient-section patient-today-conversations" aria-labelledby="patient-conversations-heading">
      <h2 id="patient-conversations-heading">Recent conversations</h2>
      {visibleConversations.length ? <>
        <div className="patient-conversation-list">{visibleConversations.map((conversation) => <PatientConversationTile conversation={conversation} key={conversation.id} />)}</div>
        {moreConversations.length > 0 && <Expander className="patient-see-all" summary={`See all ${conversations.length} conversations`}><div className="patient-conversation-list">{moreConversations.map((conversation) => <PatientConversationTile conversation={conversation} key={conversation.id} />)}</div></Expander>}
      </> : <EmptyState title="A little space for new memories." description="There are no recordings here yet. That doesn’t mean nothing happened." />}
    </section>
  </div>;
}

function PatientMemoryTile({ memory }: { memory: Memory }) {
  const { space } = useWorkspace();
  const conversation = space.conversations.find((item) => item.id === memory.conversationId);
  if (!conversation) return null;
  const kindLabel = memory.kind === "reported_activity" ? "Something you did" : memory.kind === "plan" ? "Coming up" : memory.kind === "personal_fact" ? "Personal detail" : "Conversation topic";
  const KindIcon = memory.kind === "plan" ? CalendarDays : memory.kind === "reported_activity" ? Check : AudioLines;
  return <Link className="patient-memory-tile" href={`/patient/conversations/${memory.conversationId}#${memory.turnIds[0]}`}>
    <div className="patient-memory-meta"><span className="patient-memory-kind"><KindIcon aria-hidden />{kindLabel}</span><time>{clockLabel(conversation.startedAt, space.timezone)}</time></div>
    <h3>{memory.title}</h3>
    <p>{memory.text}</p>
    <span className="patient-memory-source"><AudioLines aria-hidden />From a recorded conversation<ArrowRight aria-hidden /></span>
  </Link>;
}

function PatientConversationTile({ conversation }: { conversation: Conversation }) {
  const { space, today } = useWorkspace();
  const companions = conversation.people
    .map((id) => space.people.find((person) => person.id === id))
    .filter((person) => person && person.relationship !== "You · patient")
    .map((person) => person!.name.split(" ")[0]);
  const day = localDate(conversation.startedAt, space.timezone);
  return <Link className="patient-conversation-tile" href={`/patient/conversations/${conversation.id}`}>
    <div className="patient-conversation-copy">
      <div className="patient-conversation-meta"><span>{day === today ? "Today" : dateLabel(day, { weekday: "short", month: "short", day: "numeric" })}</span><span>{clockLabel(conversation.startedAt, space.timezone)} · {Math.max(1, Math.round(conversation.duration / 60))} min</span><StatusPill state={conversation.state} /></div>
      <h3>{conversation.title}</h3>
      <p>{conversation.summary}</p>
      {companions.length ? <span className="patient-conversation-people">With {companions.join(" and ")}</span> : <PeopleStack ids={conversation.people} />}
    </div>
    <ChevronRight className="patient-conversation-chevron" aria-hidden />
  </Link>;
}
