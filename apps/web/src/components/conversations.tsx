"use client";

import { useDeferredValue, useState } from "react";
import { CalendarDays, Download, Search, X } from "lucide-react";
import type { Conversation } from "@hale/contracts";
import { dateLabel, localDate, shiftDate } from "@hale/contracts/time";
import { useWorkspace } from "./providers";
import { ConversationList, PageIntro } from "./ui";
import { apiPath, useApiQuery } from "@/lib/api-client";
import { Button } from "./ui/button";
import { SwitchField } from "./ui/switch";

export function ConversationsView() {
  const { space, today, mode } = useWorkspace();
  const [query, setQuery] = useState("");
  const [person, setPerson] = useState("");
  const [range, setRange] = useState("all");
  const [downloading, setDownloading] = useState(false);
  const [reportError, setReportError] = useState("");
  const [summaryConsent, setSummaryConsent] = useState(false);
  const fromDay = shiftDate(today, -6);
  const filtered = [...space.conversations].filter((conversation) =>
    (!person || conversation.people.includes(person)) &&
    (range !== "today" || localDate(conversation.startedAt, space.timezone) === today) &&
    (!query || `${conversation.title} ${conversation.summary} ${conversation.turns.map((turn) => turn.text).join(" ")}`.toLowerCase().includes(query.toLowerCase())),
  ).sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  async function downloadWeeklySummary() {
    setDownloading(true);
    setReportError("");
    try {
      const response = await fetch("/api/backend/weekly-summary.pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId: space.id, fromDay, throughDay: today, consent: summaryConsent }),
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) {
        let message = "The weekly conversation summary could not be prepared. Try again.";
        try { const body = await response.json() as { error?: unknown }; if (typeof body.error === "string") message = body.error; } catch { /* Use the generic message. */ }
        throw new Error(message);
      }
      if (!response.headers.get("content-type")?.includes("application/pdf")) throw new Error("The weekly summary file is unavailable. Try again.");
      const pdf = await response.blob();
      const url = URL.createObjectURL(pdf);
      const link = document.createElement("a");
      link.href = url;
      link.download = `hale-weekly-summary-${fromDay}-to-${today}.pdf`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setReportError("The weekly conversation summary could not be prepared. Try again.");
    } finally {
      setDownloading(false);
    }
  }

  return <>
     <PageIntro eyebrow="" title={<>Conversations,<br /><span className="heading-light">worth coming back to.</span></>} description="" />
     <section className="weekly-summary-card" aria-labelledby="weekly-summary-title">
       <span className="weekly-summary-icon"><CalendarDays aria-hidden /></span>
       <div className="weekly-summary-copy"><p className="eyebrow">Past seven days</p><h2 id="weekly-summary-title">Weekly conversation summary</h2><p>{dateLabel(fromDay, { weekday: undefined, month: "short", day: "numeric" })} – {dateLabel(today, { weekday: undefined, month: "short", day: "numeric", year: "numeric" })}. Includes transcript excerpts and saved highlights.</p>{mode === "live" && <SwitchField id="weekly-online-summary" checked={summaryConsent} onCheckedChange={setSummaryConsent} label="Use an online summary" description="Available transcripts and saved highlights will be shared to prepare this PDF." />}</div>
       {mode === "demo"
         ? <Button asChild variant="secondary"><a href="/demo-weekly-summary.pdf" download="hale-weekly-summary-demo.pdf"><Download aria-hidden />Download PDF</a></Button>
         : <Button type="button" variant="secondary" pending={downloading} disabled={downloading || !summaryConsent} onClick={() => void downloadWeeklySummary()}><Download aria-hidden />{downloading ? "Preparing PDF…" : "Download PDF"}</Button>}
       {reportError && <p className="weekly-summary-error" role="alert">{reportError}</p>}
     </section>
     <div className="filter-bar"><label className="search-input"><Search aria-hidden size={24} /><input type="search" aria-label="Search conversations" placeholder="Search conversations…" maxLength={200} value={query} onChange={(event) => setQuery(event.target.value)} /></label><select aria-label="Filter by person" value={person} onChange={(event) => setPerson(event.target.value)}><option value="">All people</option>{space.people.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label="Filter date range" value={range} onChange={(event) => setRange(event.target.value)}><option value="all">All available dates</option><option value="today">Today</option></select>{(query || person || range !== "all") && <Button variant="ghost" onClick={() => { setQuery(""); setPerson(""); setRange("all"); }}><X aria-hidden />Clear</Button>}</div>
      {mode === "live" ? <LiveResults patientId={space.id} text={query} day={range === "today" ? today : undefined} personId={person || undefined} /> : <><div className="results-label" role="status">{filtered.length} {filtered.length === 1 ? "conversation" : "conversations"}{query && ` matching “${query}”`}</div><ConversationList conversations={filtered} /></>}
   </>;
}

function LiveResults({ patientId, text, day, personId }: { patientId: string; text: string; day?: string; personId?: string }) {
  const term = useDeferredValue(text.trim());
  const path = apiPath("search", { patientId, text: term, day, personId });
  const { data: result, error } = useApiQuery<{ conversations: Conversation[]; limited: boolean }>(path);
  if (error) return <p role="alert" className="results-label">Search is temporarily unavailable.</p>;
  if (!result) return <p className="results-label muted" role="status">Searching your conversations…</p>;
  return <div aria-busy={term !== text.trim()}><p className="results-label" role="status">{result.conversations.length} {result.conversations.length === 1 ? "conversation" : "conversations"}{result.limited && " · Limited results"}</p><ConversationList conversations={result.conversations} /></div>;
}
