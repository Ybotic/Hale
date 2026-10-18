"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, CalendarDays, CarFront, ChevronRight, CircleHelp, MessageCircle } from "lucide-react";
import type { Conversation, Memory } from "@hale/contracts";
import { clockLabel, dateLabel, localDate } from "@hale/contracts/time";
import { useWorkspace } from "./providers";
import { RecorderCard } from "./recorder";
import { EmptyState, PeopleStack, StatusPill } from "./ui";
import { Expander } from "./ui-primitives";
import { PatientTileLink } from "./patient-ui";
import { ScrollRevealList } from "./motion-primitives";

const EASE = [0.16, 1, 0.3, 1] as const;

const rise = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0 },
};

export function PatientToday() {
  const { space, today } = useWorkspace();
  const prefersReducedMotion = useReducedMotion();
  const memories = space.memories.filter((memory) => memory.localDate === today);
  const conversations = space.conversations.filter((conversation) => localDate(conversation.startedAt, space.timezone) === today);
  const visibleMemories = memories.slice(0, 3);
  const visibleConversations = conversations.slice(0, 3);
  const moreConversations = conversations.slice(3);

  return <div className="patient-today-screen">
    <motion.header
      className="patient-greeting"
      initial={prefersReducedMotion ? false : "hidden"}
      animate="visible"
      variants={{ visible: { transition: { staggerChildren: 0.07 } } }}
    >
      <motion.p className="patient-greeting-eyebrow" variants={rise} transition={{ duration: 0.55, ease: EASE }}>{dateLabel(today)}</motion.p>
      <motion.h1 variants={rise} transition={{ duration: 0.55, ease: EASE }}>Good to see you, <span>{space.name.split(" ")[0]}.</span></motion.h1>
      <motion.p variants={rise} transition={{ duration: 0.55, ease: EASE }}>Your day, a little easier to come back to.</motion.p>
    </motion.header>

    <motion.div
      className="patient-recorder-slot"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: EASE, delay: 0.12 }}
    >
      <RecorderCard />
    </motion.div>

    <motion.section
      className="patient-quick-grid"
      aria-label="Quick actions"
      initial={prefersReducedMotion ? false : "hidden"}
      animate="visible"
      variants={{ visible: { transition: { staggerChildren: 0.07, delayChildren: 0.2 } } }}
    >
      {[
        { href: "/patient/ask", icon: <CircleHelp />, title: "Ask about your care", description: "Answers drawn from your own memories." },
        { href: "/patient/memories", icon: <CalendarDays />, title: "Memories", description: "Everything kept from today.", className: "patient-memories-action" },
        { href: "#recent-conversations", icon: <MessageCircle />, title: "Conversations", description: "What was recorded today." },
      ].map((tile) => (
        <motion.div
          key={tile.href}
          variants={rise}
          transition={{ duration: 0.5, ease: EASE }}
        >
          <PatientTileLink href={tile.href} icon={tile.icon} title={tile.title} description={tile.description} className={tile.className} />
        </motion.div>
      ))}
      <motion.div
        variants={rise}
        transition={{ duration: 0.5, ease: EASE }}
        className="patient-care-grid-tile"
      >
        <PatientTileLink
          href="/patient/care"
          icon={<CarFront />}
          title="Rides, appointments & medication"
          description="A little help with everyday tasks."
        />
      </motion.div>
    </motion.section>

    <motion.section
      className="patient-section patient-today-memories"
      aria-labelledby="patient-memories-heading"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: EASE, delay: 0.35 }}
    >
      <h2 id="patient-memories-heading">A little of today</h2>
      {memories.length ? <>
        <ScrollRevealList>
          {visibleMemories.map((memory) => <PatientMemoryTile memory={memory} key={memory.id} />)}
        </ScrollRevealList>
        <PatientTileLink className="patient-see-all-tile" href={`/patient/memories?date=${today}`} icon={<CalendarDays />} title={`See all ${memories.length} memories`} />
      </> : <EmptyState title="A new day, a little space." description="Your memories will appear when a recording is processed. An empty page doesn’t mean nothing happened." />}
    </motion.section>

    <motion.section
      id="recent-conversations"
      className="patient-section patient-today-conversations"
      aria-labelledby="patient-conversations-heading"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: EASE, delay: 0.42 }}
    >
      <h2 id="patient-conversations-heading">Recent conversations</h2>
      {visibleConversations.length ? <>
        <ScrollRevealList>
          {visibleConversations.map((conversation) => <PatientConversationTile conversation={conversation} key={conversation.id} />)}
        </ScrollRevealList>
        {moreConversations.length > 0 && <Expander className="patient-see-all" summary={`See all ${conversations.length} conversations`}><div className="patient-conversation-list">{moreConversations.map((conversation) => <PatientConversationTile conversation={conversation} key={conversation.id} />)}</div></Expander>}
      </> : <EmptyState title="A little space for new memories." description="There are no recordings here yet. That doesn’t mean nothing happened." />}
    </motion.section>
  </div>;
}

function PatientMemoryTile({ memory }: { memory: Memory }) {
  const { space } = useWorkspace();
  const conversation = space.conversations.find((item) => item.id === memory.conversationId);
  if (!conversation) return null;
  const kindLabel = memory.kind === "reported_activity" ? "Something you did" : memory.kind === "plan" ? "Coming up" : memory.kind === "personal_fact" ? "Personal detail" : "Conversation topic";
  return <Link className="patient-memory-tile" href={`/patient/conversations/${memory.conversationId}#${memory.turnIds[0]}`}>
    <div className="patient-memory-meta"><span className="patient-memory-kind">{kindLabel}</span><time>{clockLabel(conversation.startedAt, space.timezone)}</time></div>
    <h3>{memory.title}</h3>
    <p>{memory.text}</p>
    <span className="patient-memory-source">From a recorded conversation<ArrowRight aria-hidden /></span>
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
