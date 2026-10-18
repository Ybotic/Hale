"use client";

import Link from "next/link";
import { ArrowRight, AudioLines, ChevronRight, Clock3, Leaf, LockKeyhole, ShieldCheck } from "lucide-react";
import type { Conversation, Memory } from "@hale/contracts";
import { memoryLabels } from "@hale/contracts";
import { clockLabel, dateLabel, localDate } from "@hale/contracts/time";
import { useWorkspace } from "./providers";
import type { ReactNode } from "react";
import { Expander } from "./ui-primitives";
import { Badge } from "./ui/badge";

export function PageIntro({ eyebrow, title, description, aside, className }: { eyebrow: string; title: ReactNode; description?: string; aside?: ReactNode; className?: string }) {
  return <header className={`page-intro${className ? ` ${className}` : ""}`}><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description && <p className="intro-description">{description}</p>}</div>{aside && <div className="intro-aside">{aside}</div>}</header>;
}

export function SectionHeading({ title, href, link }: { title: ReactNode; href?: string; link?: string }) {
  return <div className="section-heading"><h2>{title}</h2>{href && <Link href={href} className="text-link">{link ?? "View all"}<ArrowRight size={16} /></Link>}</div>;
}

export function StatusPill({ state }: { state: Conversation["state"] }) {
  const label = { ready: "Ready", queued: "Awaiting worker", processing: "Processing", failed: "Processing failed" }[state];
  return <Badge variant={state === "failed" ? "danger" : state === "ready" ? "success" : "neutral"} className="status-pill"><span aria-hidden className={state === "ready" ? "status-dot" : "status-ring"} />{label}</Badge>;
}

export function PeopleStack({ ids, names = false }: { ids: string[]; names?: boolean }) {
  const { space } = useWorkspace();
  const people = space.people.filter((person) => ids.includes(person.id));
  return <span className="people-stack"><span className="avatar-stack">{people.map((person) => <span key={person.id} title={person.name} className={`avatar avatar-${person.color}`}>{person.initials}</span>)}</span>{names && <span>{people.map((person) => person.name.split(" ")[0]).join(" & ") || "Not yet identified"}</span>}</span>;
}

export function ConversationList({ conversations, base = "/family", compact = false }: { conversations: Conversation[]; base?: string; compact?: boolean }) {
  const { space, today } = useWorkspace();
  if (!conversations.length) return <EmptyState title="A little space for new memories." description="There are no recordings here yet. That doesn’t mean nothing happened." />;
  return <div className={`conversation-list ${compact ? "conversation-list-compact" : ""}`}>
    {conversations.map((conversation) => {
      const day = localDate(conversation.startedAt, space.timezone);
      return <Link className="conversation-row" href={`${base}/conversations/${conversation.id}`} key={conversation.id}>
        <div className="conversation-when"><span>{day === today ? "Today" : dateLabel(day, { weekday: "short", month: "short", day: "numeric" })}</span><span className="mono">{clockLabel(conversation.startedAt, space.timezone)} · {Math.max(1, Math.round(conversation.duration / 60))} min</span></div>
        <div className="conversation-description"><h3>{conversation.title}</h3><p>{conversation.summary}</p></div>
        <PeopleStack ids={conversation.people} /><StatusPill state={conversation.state} /><ChevronRight className="row-chevron" size={18} />
      </Link>;
    })}
  </div>;
}

export function MemoryCard({ memory, base = "/family" }: { memory: Memory; base?: string }) {
  const { space } = useWorkspace();
  const conversation = space.conversations.find((item) => item.id === memory.conversationId);
  if (!conversation) return null;
  return <Link className="memory-card" href={`${base}/conversations/${memory.conversationId}#${memory.turnIds[0]}`}>
    <div className="memory-card-top"><span className={`memory-type ${memory.kind === "plan" ? "memory-type-plan" : ""}`}>{memoryLabels[memory.kind]}</span><span className="mono muted">{clockLabel(conversation.startedAt, space.timezone)}</span></div>
    <h3>{memory.title}</h3><p>{memory.text}</p>
    <div className="memory-source"><AudioLines size={15} /><span>From a recorded conversation</span><ArrowRight size={16} /></div>
  </Link>;
}

export function EmptyState({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><Leaf size={25} /></span><h3>{title}</h3><p>{description}</p>{children}</div>;
}

export function PrivacyNote({ children, editorial = false }: { children?: ReactNode; editorial?: boolean }) {
  return <div className={`notice${editorial ? " notice-editorial" : ""}`}><p>{children}</p></div>;
}

export function Coverage({ conversations }: { conversations: Conversation[] }) {
  const { space } = useWorkspace();
  const seconds = conversations.reduce((sum, conversation) => sum + conversation.duration, 0);
  return <div className="coverage"><div className="coverage-heading"><span className="eyebrow">Recording coverage</span><span><Clock3 size={24} />{Math.floor(seconds / 60)} min recorded</span></div><div className="coverage-track" role="img" aria-label={`${conversations.length} recording ${conversations.length === 1 ? "segment" : "segments"} across the day. ${Math.floor(seconds / 60)} minutes recorded. Gaps are not recorded activity.`}>
    {conversations.map((conversation) => {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone: space.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(conversation.startedAt));
      const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
      const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
      return <span key={conversation.id} style={{ left: `${(hour * 60 + minute) / 14.4}%`, width: `${Math.max(0.7, conversation.duration / 864)}%` }} title={`${clockLabel(conversation.startedAt, space.timezone)} · ${Math.round(conversation.duration / 60)} min`} />;
    })}
  </div><div className="coverage-times"><span>12 AM</span><span>6 AM</span><span>12 PM</span><span>6 PM</span><span>12 AM</span></div><p className="coverage-legend"><i aria-hidden />Recorded audio · {conversations.length} {conversations.length === 1 ? "conversation" : "conversations"}</p><p>Only recorded moments are shown. The spaces in between are simply unrecorded. Plans are not completed events.</p>{conversations.length > 0 && <Expander className="coverage-details" summary="Show recording times"><ul>{conversations.map((conversation) => <li key={conversation.id}>{clockLabel(conversation.startedAt, space.timezone)} · {Math.max(1, Math.round(conversation.duration / 60))} min</li>)}</ul></Expander>}</div>;
}
