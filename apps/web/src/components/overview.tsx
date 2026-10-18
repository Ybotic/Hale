"use client";

import { useState } from "react";
import Link from "next/link";
import { memoryLabels, type Memory } from "@hale/contracts";
import { clockLabel, dateLabel, localDate, shiftDate } from "@hale/contracts/time";
import { ArrowRight, ArrowUpRight, CalendarDays, CarFront, ChevronLeft, ChevronRight, CircleAlert, Clock3, MessageCircle, Mic, Users } from "lucide-react";
import { useWorkspace } from "./providers";
import { PageScrollReveal } from "./motion-primitives";
import { EmptyState, PageIntro, PeopleStack, PrivacyNote, StatusPill } from "./ui";
import styles from "./overview-dashboard.module.css";

function memorySourceHref(memory: Memory) {
  const turn = memory.turnIds[0];
  return `/family/conversations/${memory.conversationId}${turn ? `#${turn}` : ""}`;
}

export function Overview() {
  const { space, today, mode } = useWorkspace();
  const [calendarMonth, setCalendarMonth] = useState(today.slice(0, 7));
  const conversations = space.conversations.filter((conversation) => localDate(conversation.startedAt, space.timezone) === today);
  const memories = space.memories.filter((memory) => memory.localDate === today);
  const people = space.people.filter((person) => person.relationship !== "You · patient" && conversations.some((conversation) => conversation.people.includes(person.id)));
  const recent = [...space.conversations].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 4);
  const pending = conversations.filter((conversation) => conversation.state === "queued" || conversation.state === "processing").length;
  const failed = conversations.filter((conversation) => conversation.state === "failed").length;
  const calendarMonthStart = `${calendarMonth}-01`;
  const firstWeekday = new Date(`${calendarMonthStart}T12:00:00Z`).getUTCDay();
  const calendarStart = shiftDate(calendarMonthStart, -((firstWeekday + 6) % 7));
  const calendarDates = Array.from({ length: 42 }, (_, index) => shiftDate(calendarStart, index));
  const recordedDays = new Set(space.conversations.map((conversation) => localDate(conversation.startedAt, space.timezone)));
  const quote = mode === "demo" ? conversations.find((conversation) => conversation.id === "garden-lunch")?.turns.find((turn) => turn.id === "lunch-3") : undefined;

  function changeCalendarMonth(offset: number) {
    const instant = new Date(`${calendarMonthStart}T12:00:00Z`);
    instant.setUTCMonth(instant.getUTCMonth() + offset);
    setCalendarMonth(instant.toISOString().slice(0, 7));
  }

  return <PageScrollReveal>
    <div className={styles.dashboard}>
      <PageIntro eyebrow={dateLabel(today)} title="Family dashboard" />

      <nav className={styles.stats} aria-label="Family dashboard summary">
        <Link className={styles.stat} href={`/family/calendar?date=${today}`}><span>Recordings today</span><strong>{conversations.length}</strong></Link>
        <Link className={styles.stat} href={`/family/calendar?date=${today}`}><span>Memories today</span><strong>{memories.length}</strong></Link>
        <Link className={styles.stat} href="/family/people"><span>People profiles</span><strong>{space.people.length}</strong></Link>
        <Link className={styles.stat} href="/family/conversations"><span>Pending</span><strong>{pending}</strong></Link>
      </nav>

      {failed > 0 && <div className={styles.attention} role="status"><CircleAlert aria-hidden size={20} /><p><strong>{failed} {failed === 1 ? "recording needs" : "recordings need"} review.</strong> Check its processing status in Conversations.</p><Link href="/family/conversations">Review recordings<ArrowRight size={16} /></Link></div>}

      <div className={styles.supportGrid}>
        <section className={styles.panel} aria-labelledby="overview-calendar-title">
          <div className={styles.panelHeading}>
            <div><h2 id="overview-calendar-title">Calendar</h2><p>Choose a date to explore its timeline</p></div>
            <Link href={`/family/calendar?date=${today}`}>Open calendar<ArrowRight aria-hidden size={16} /></Link>
          </div>
          <div className={styles.calendarPanel}>
            <div className={styles.calendarMonthHeading}>
              <h3>{dateLabel(calendarMonthStart, { weekday: undefined, month: "long", day: undefined, year: "numeric" })}</h3>
              <div className={styles.calendarMonthControls}>
                <button type="button" aria-label="Previous month" onClick={() => changeCalendarMonth(-1)}><ChevronLeft aria-hidden size={18} /></button>
                <button type="button" aria-label="Next month" onClick={() => changeCalendarMonth(1)}><ChevronRight aria-hidden size={18} /></button>
              </div>
            </div>
            <div className={styles.calendarWeekdays} aria-hidden="true">{["M", "T", "W", "T", "F", "S", "S"].map((day, index) => <span key={index}>{day}</span>)}</div>
            <div className={styles.calendarGrid} role="group" aria-label={`Choose a date in ${dateLabel(calendarMonthStart, { month: "long", year: "numeric" })}`}>
              {calendarDates.map((date) => {
                const hasRecordings = recordedDays.has(date);
                return <Link key={date} href={`/family/calendar?date=${date}`} className={`${styles.calendarDay}${date.slice(0, 7) !== calendarMonth ? ` ${styles.outsideMonth}` : ""}${date === today ? ` ${styles.todayDay}` : ""}`} aria-current={date === today ? "date" : undefined} aria-label={`${dateLabel(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}${hasRecordings ? ", recordings available" : ""}`}>
                  <span>{Number(date.slice(-2))}</span>{hasRecordings && <i aria-hidden="true" />}
                </Link>;
              })}
            </div>
          </div>
        </section>

        <aside className={styles.panel} aria-labelledby="overview-quick-access-title">
          <div className={styles.panelHeading}><div><h2 id="overview-quick-access-title">Quick access</h2><p>Helpful places in this family space</p></div></div>
          <nav className={`overview-actions ${styles.quickAccess}`} aria-label="Main features">
            <Link href={`/family/ask?date=${today}`}><MessageCircle aria-hidden size={20} /><span>Ask Hale</span><ChevronRight aria-hidden size={17} /></Link>
            <Link href={`/family/calendar?date=${today}`}><CalendarDays aria-hidden size={20} /><span>Calendar</span><ChevronRight aria-hidden size={17} /></Link>
            <Link href="/family/people"><Users aria-hidden size={20} /><span>People</span><ChevronRight aria-hidden size={17} /></Link>
            <Link href="/family/care"><CarFront aria-hidden size={20} /><span>Care &amp; Tasks</span><ChevronRight aria-hidden size={17} /></Link>
            <Link href="/patient/today"><Mic aria-hidden size={20} /><span>Recording view</span><ChevronRight aria-hidden size={17} /></Link>
          </nav>
        </aside>
      </div>

      <section className={`today-band ${styles.dailyBand}`}><div className="today-quote"><p className="eyebrow">{quote ? "In her own words" : "A gentle reminder"}</p><blockquote>“{quote ? quote.text : "You don’t have to remember everything on your own."}”</blockquote><span className="quote-attribution">{quote ? "Margaret · Today, 12:15 PM · Synthetic transcript" : "Hale keeps a little context close."}</span>{quote && <Link className="text-link" href="/family/conversations/garden-lunch#lunch-3">Read the conversation<ArrowUpRight size={24} /></Link>}</div><div className="today-connections"><p className="eyebrow">Familiar voices</p>{people.length ? people.map((person) => <Link href="/family/people" key={person.id} className="person-mini"><span className={`avatar avatar-${person.color}`}>{person.initials}</span><span><strong>{person.name}</strong><span>{person.relationship} · In today’s recordings</span></span><ArrowUpRight size={24} /></Link>) : <p className="muted">Known speakers will appear after processing and identification.</p>}<p className="small muted"></p></div></section>

      <div className={styles.dataGrid}>
        <section className={`${styles.panel} ${styles.featurePanel}`} aria-labelledby="overview-memories-title">
          <div className={styles.panelHeading}><div><h2 id="overview-memories-title">Memories today</h2><p>Source-linked notes from today’s recordings</p></div><Link href={`/family/calendar?date=${today}`} aria-label="View today's memories">View day<ArrowRight aria-hidden size={16} /></Link></div>
          {memories.length ? <ul className={styles.memoryList}>{memories.slice(0, 3).map((memory) => {
            const source = space.conversations.find((conversation) => conversation.id === memory.conversationId);
            return <li key={memory.id}><Link className={styles.memoryRow} href={memorySourceHref(memory)}>
              <span className={`${styles.memoryKind}${memory.kind === "plan" ? ` ${styles.memoryPlan}` : ""}`}>{memoryLabels[memory.kind]}</span>
              <span className={styles.memoryCopy}><strong>{memory.title}</strong><span>{memory.text}</span>{memory.kind === "plan" && <small className={styles.memoryCaveat}>Plan, not confirmed event</small>}<small className={styles.memorySource}><Clock3 aria-hidden size={15} />{source ? clockLabel(source.startedAt, space.timezone) : "Source unavailable"} · Open source</small></span>
              <ChevronRight aria-hidden size={18} />
            </Link></li>;
          })}</ul> : <EmptyState title="No memories saved today" description={conversations.length ? "You can still review each recording and its status." : "Available notes will appear here after a conversation is recorded and processed."}>{!conversations.length && <Link className="text-link" href="/patient/today"><Mic aria-hidden size={17} />Open recording view</Link>}</EmptyState>}
        </section>

        <section className={`${styles.panel} ${styles.featurePanel}`} aria-labelledby="overview-conversations-title">
          <div className={styles.panelHeading}><div><h2 id="overview-conversations-title">Recent conversations</h2><p>Transcripts and processing status</p></div><Link href="/family/conversations">View all<ArrowRight aria-hidden size={16} /></Link></div>
          {recent.length ? <ul className={styles.conversationList}>{recent.map((conversation) => {
            const day = localDate(conversation.startedAt, space.timezone);
            return <li key={conversation.id}><Link className={styles.conversationRow} href={`/family/conversations/${conversation.id}`}>
              <span className={styles.conversationDate}>{day === today ? "Today" : dateLabel(day, { weekday: "short", month: "short", day: "numeric" })}<small>{clockLabel(conversation.startedAt, space.timezone)} · {Math.max(1, Math.round(conversation.duration / 60))} min</small></span>
              <span className={styles.conversationCopy}><strong>{conversation.title}</strong><small>{conversation.summary}</small></span>
              <span className={styles.conversationPeople}><PeopleStack ids={conversation.people} /></span>
              <StatusPill state={conversation.state} />
              <ChevronRight className={styles.rowChevron} aria-hidden size={18} />
            </Link></li>;
          })}</ul> : <EmptyState title="No conversations yet" description="There are no recordings available in this family space."><Link className="text-link" href="/patient/today"><Mic aria-hidden size={17} />Open recording view</Link></EmptyState>}
        </section>
      </div>

      <section className="bottom-callout"><PrivacyNote editorial /><Link href="/family/care" className="text-link"><CalendarDays size={17} />Care & everyday tasks<ArrowRight size={16} /></Link></section>
    </div>
  </PageScrollReveal>;
}
