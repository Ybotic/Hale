"use client";

import { useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { dateLabel, isLocalDate, localDate, shiftDate } from "@hale/contracts/time";
import { useWorkspace } from "./providers";
import { ConversationList, EmptyState, MemoryCard, PageIntro, SectionHeading } from "./ui";

export function CalendarView({ patient = false }: { patient?: boolean }) {
  const { space, today, mode } = useWorkspace();
  const router = useRouter();
  const params = useSearchParams();
  const rawDate = params.get("date");
  const selected = isLocalDate(rawDate) ? rawDate : today;
  const [month, setMonth] = useState(selected.slice(0, 7));
  const [focused, setFocused] = useState(selected);
  const [observedDate, setObservedDate] = useState(selected);
  // Back/Forward and external date links must restore the visible month as well as the timeline.
  if (observedDate !== selected) {
    setObservedDate(selected);
    setMonth(selected.slice(0, 7));
    setFocused(selected);
  }
  const base = patient ? "/patient" : "/family";
  const path = patient ? "/patient/memories" : "/family/calendar";
  const monthStart = `${month}-01`;
  const firstWeekday = new Date(`${monthStart}T12:00:00Z`).getUTCDay();
  const gridStart = shiftDate(monthStart, -((firstWeekday + 6) % 7));
  const dates = Array.from({ length: 42 }, (_, index) => shiftDate(gridStart, index));
  const conversations = space.conversations.filter((conversation) => localDate(conversation.startedAt, space.timezone) === selected).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const memories = space.memories.filter((memory) => memory.localDate === selected);
  const recordedDays = new Set(space.conversations.map((conversation) => localDate(conversation.startedAt, space.timezone)));

  function select(date: string) { setFocused(date); router.push(`${path}?date=${date}`, { scroll: false }); }
  function changeMonth(offset: number) {
    const instant = new Date(`${monthStart}T12:00:00Z`);
    instant.setUTCMonth(instant.getUTCMonth() + offset);
    const next = instant.toISOString().slice(0, 7);
    setMonth(next); setFocused(`${next}-01`);
  }
  function onGridKey(event: KeyboardEvent<HTMLButtonElement>, date: string) {
    const offsets: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowUp: -7, ArrowDown: 7 };
    let next: string | undefined;
    if (event.key in offsets) next = shiftDate(date, offsets[event.key]);
    if (event.key === "Home") next = shiftDate(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));
    if (event.key === "End") next = shiftDate(date, 6 - ((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));
    if (!next) return;
    event.preventDefault(); setFocused(next);
    if (!dates.includes(next)) setMonth(next.slice(0, 7));
    const focusDate = next;
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-calendar-date="${focusDate}"]`)?.focus());
  }

  return <>
    <PageIntro eyebrow="YOUR MEMORY BANK" title={<>A day to <span className="heading-light">come back to.</span></>} description="Conversations, familiar voices, and little moments. All in one place." />
    <div className="calendar-layout"><aside className="calendar-panel"><div className="calendar-heading"><h2>{dateLabel(monthStart, { weekday: undefined, month: "long", day: undefined, year: "numeric" })}</h2><div className="button-group"><button className="icon-button" onClick={() => changeMonth(-1)} aria-label="Previous month"><ChevronLeft size={19} /></button><button className="icon-button" onClick={() => changeMonth(1)} aria-label="Next month"><ChevronRight size={19} /></button></div></div><div className="calendar-weekdays" aria-hidden>{["M", "T", "W", "T", "F", "S", "S"].map((day, index) => <span key={index}>{day}</span>)}</div><div className="calendar-grid" role="group" aria-label="Choose a day. Use arrow keys to move between dates.">
      {dates.map((date) => <button key={date} type="button" data-calendar-date={date} tabIndex={date === focused ? 0 : -1} aria-pressed={date === selected} aria-current={date === today ? "date" : undefined} aria-label={`${dateLabel(date, { year: "numeric" })}${recordedDays.has(date) ? ", has recordings" : ", no recordings"}`} className={`${date.slice(0, 7) !== month ? "outside-month" : ""} ${date === selected ? "selected-day" : ""} ${date === today ? "today-day" : ""}`} onKeyDown={(event) => onGridKey(event, date)} onClick={() => select(date)} onFocus={() => setFocused(date)}><span>{Number(date.slice(-2))}</span>{recordedDays.has(date) && <i aria-hidden />}</button>)}
    </div><div className="calendar-legend"><span><i className="status-dot" />Has recordings</span><button className="text-link" onClick={() => { setMonth(today.slice(0, 7)); select(today); }}>Go to today</button></div><p className="small muted calendar-timezone">Dates shown in {space.timezone.replaceAll("_", " ")}.{mode === "demo" && " Demo date: October 15, 2026."}</p><div className="calendar-note"><Sparkles size={19} /><p>Some days have more recordings than others. An empty day is simply a day we haven’t captured.</p></div></aside>
      <section key={selected} className="day-timeline swap-in" aria-label={`Timeline for ${dateLabel(selected)}`}><div className="day-heading"><div><p className="eyebrow">{selected === today ? "TODAY’S TIMELINE" : "A DAY IN YOUR MEMORIES"}</p><h2>{dateLabel(selected, { weekday: "long", month: "long", day: "numeric" })}</h2><p>{conversations.length} conversations · {memories.length} saved memories</p></div><Link className="btn btn-quiet" href={`${base}/ask?date=${selected}`}><Sparkles size={15} />Ask about this day</Link></div>
        {conversations.length ? <><div className="day-recap"><p className="eyebrow">AVAILABLE DAY NOTES {mode === "demo" ? "· EXTRACTIVE DEMO" : ""}</p><p>{memories.length ? memories.map((memory) => memory.text).join(" ") : "Audio has been uploaded but is not yet processed. A recap will need transcript evidence."}</p><span className="small muted">Not a saved nightly summary. Describes available evidence, not the whole day.</span></div><div className="timeline-memories">{memories.map((memory) => <MemoryCard key={memory.id} memory={memory} base={base} />)}</div><SectionHeading title="The original conversations" /><ConversationList conversations={conversations} base={base} compact /></> : <EmptyState title="Nothing recorded on this day." description="That doesn’t mean nothing happened. Choose a day with a dot to explore the memories available."><Link href={patient ? "/patient/today" : "/family/overview"} className="text-link">Back to today<ArrowRight size={16} /></Link></EmptyState>}
      </section>
    </div>
  </>;
}
