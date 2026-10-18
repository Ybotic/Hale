"use client";

import { useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import type { Citation } from "@hale/contracts";
import { dateLabel, isLocalDate, localDate, shiftDate } from "@hale/contracts/time";
import { apiPath, useApiQuery } from "@/lib/api-client";
import { useWorkspace } from "./providers";
import { PageScrollReveal } from "./motion-primitives";
import { ConversationList, EmptyState, MemoryCard, PageIntro, SectionHeading } from "./ui";
import { Button } from "./ui/button";

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
  const recordingCounts = new Map<string, number>();
  for (const conversation of space.conversations) {
    const date = localDate(conversation.startedAt, space.timezone);
    recordingCounts.set(date, (recordingCounts.get(date) ?? 0) + 1);
  }
  const summaryPath = apiPath("daily-summary", { patientId: space.id, day: selected });
  const { data: dailySummary } = useApiQuery<{ state: string; summary: string | null; coverage: "complete" | "partial" | null; citations: Citation[] }>(summaryPath, mode === "live", 30_000);

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

  return <PageScrollReveal>
    <PageIntro eyebrow="" title={<>A day to <span className="heading-light">come back to.</span></>} description="Conversations, familiar voices, and little moments. All in one place." />
    <div className="calendar-layout"><aside className="calendar-panel"><div className="calendar-heading"><h2>{dateLabel(monthStart, { weekday: undefined, month: "long", day: undefined, year: "numeric" })}</h2><div className="button-group"><Button variant="ghost" className="calendar-month-button" onClick={() => changeMonth(-1)} aria-label="Previous month"><ChevronLeft aria-hidden className="size-6" /><span>Previous month</span></Button><Button variant="ghost" className="calendar-month-button" onClick={() => changeMonth(1)} aria-label="Next month"><ChevronRight aria-hidden className="size-6" /><span>Next month</span></Button></div></div><div className="calendar-weekdays" aria-hidden>{["M", "T", "W", "T", "F", "S", "S"].map((day, index) => <span key={index}>{day}</span>)}</div><div className="calendar-grid" role="group" aria-label="Choose a day. Use arrow keys to move between dates.">
       {dates.map((date) => {
         const count = recordingCounts.get(date) ?? 0;
          return <Button key={date} type="button" variant="ghost" data-calendar-date={date} tabIndex={date === focused ? 0 : -1} aria-pressed={date === selected} aria-current={date === today ? "date" : undefined} aria-label={`${dateLabel(date, { year: "numeric" })}${count ? `, ${count} ${count === 1 ? "conversation" : "conversations"} recorded` : ", no recordings"}`} className={`calendar-day ${date.slice(0, 7) !== month ? "text-muted" : ""} ${date === selected ? "border-primary bg-surface-2" : "border-transparent"} ${date === today ? "ring-1 ring-border" : ""}`} onKeyDown={(event) => onGridKey(event, date)} onClick={() => select(date)} onFocus={() => setFocused(date)}><span>{Number(date.slice(-2))}</span>{count > 0 && <><i aria-hidden /><span className="calendar-day-count" aria-hidden="true">{count}</span></>}</Button>;
       })}
    </div><div className="calendar-legend"><span><i className="status-dot" />Has recordings</span><Button variant="ghost" onClick={() => { setMonth(today.slice(0, 7)); select(today); }}>Go to today</Button></div><p className="small muted calendar-timezone">Dates shown in {space.timezone.replaceAll("_", " ")}.{mode === "demo" && " Demo date: October 15, 2026."}</p><div className="calendar-note"></div></aside>
       <section key={selected} className="day-timeline swap-in" aria-label={`Timeline for ${dateLabel(selected)}`}><div className="day-heading"><div><p className="eyebrow">{selected === today ? "Today’s timeline" : "A day in your memories"}</p><h2>{dateLabel(selected, { weekday: "long", month: "long", day: "numeric" })}</h2><p>{conversations.length} conversations · {memories.length} saved memories</p></div><Button asChild variant="secondary"><Link href={`${base}/ask?date=${selected}`}><Sparkles aria-hidden className="size-6" />Ask about this day</Link></Button></div>
        {conversations.length ? <>
          {dailySummary?.summary ? <div className="day-recap">
             <p className="eyebrow">Nightly summary · {dailySummary.coverage === "partial" ? "Partial records" : "Processed records"}</p>
            <p>{dailySummary.summary}</p>
            <span className="small muted">Generated from {dailySummary.citations.length} cited transcript turns. Open a citation to review the original words.</span>
            {dailySummary.citations.length > 0 && <div className="citation-list">{dailySummary.citations.slice(0, 4).map((citation) => <Link key={citation.turnId} href={`${base}/conversations/${citation.conversationId}#${citation.turnId}`} className="citation"><span><strong>{citation.label}</strong><span>“{citation.excerpt}”</span></span><ArrowRight size={15} /></Link>)}</div>}
          </div> : <div className="day-recap">
             <p className="eyebrow">Available day notes {mode === "demo" ? "· Extractive demo" : ""}</p>
            <p>{memories.length ? memories.map((memory) => memory.text).join(" ") : "Audio has been uploaded but is not yet processed. A recap will need transcript evidence."}</p>
            <span className="small muted">{dailySummary?.state === "queued" || dailySummary?.state === "processing" ? "The nightly summary is being prepared." : "No nightly summary is available for this date yet."} Available notes describe recorded evidence, not the whole day.</span>
          </div>}
           <div className="timeline-memories">{memories.map((memory) => <MemoryCard key={memory.id} memory={memory} base={base} />)}</div><SectionHeading title={patient ? "The original conversations" : <>The original <em>conversations</em></>} /><ConversationList conversations={conversations} base={base} compact />
        </> : <EmptyState title="Nothing recorded on this day." description="That doesn’t mean nothing happened. Choose a day with a dot to explore the memories available."><Link href={patient ? "/patient/today" : "/family/overview"} className="text-link">Back to today<ArrowRight size={16} /></Link></EmptyState>}
      </section>
    </div>
  </PageScrollReveal>;
}
