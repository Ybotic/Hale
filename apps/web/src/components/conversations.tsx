"use client";

import { useDeferredValue, useState } from "react";
import { Search, X } from "lucide-react";
import type { Conversation } from "@hale/contracts";
import { localDate } from "@hale/contracts/time";
import { useWorkspace } from "./providers";
import { ConversationList, PageIntro, PrivacyNote } from "./ui";
import { apiPath, useApiQuery } from "@/lib/api-client";

export function ConversationsView() {
  const { space, today, mode } = useWorkspace();
  const [query, setQuery] = useState("");
  const [person, setPerson] = useState("");
  const [range, setRange] = useState("all");
  const filtered = [...space.conversations].filter((conversation) =>
    (!person || conversation.people.includes(person)) &&
    (range !== "today" || localDate(conversation.startedAt, space.timezone) === today) &&
    (!query || `${conversation.title} ${conversation.summary} ${conversation.turns.map((turn) => turn.text).join(" ")}`.toLowerCase().includes(query.toLowerCase())),
  ).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return <>
    <PageIntro eyebrow="THE WORDS BEHIND YOUR MEMORIES" title={<>Conversations,<br /><span className="heading-light">worth coming back to.</span></>} description="Every memory has a source. Start with the conversation." />
    <div className="filter-bar"><label className="search-input"><Search size={18} /><input type="search" aria-label="Search conversations" placeholder="Search conversations…" maxLength={200} value={query} onChange={(event) => setQuery(event.target.value)} /></label><select aria-label="Filter by person" value={person} onChange={(event) => setPerson(event.target.value)}><option value="">All people</option>{space.people.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label="Filter date range" value={range} onChange={(event) => setRange(event.target.value)}><option value="all">All available dates</option><option value="today">Today</option></select>{(query || person || range !== "all") && <button className="btn btn-text" onClick={() => { setQuery(""); setPerson(""); setRange("all"); }}><X size={15} />Clear</button>}</div>
    {mode === "live" ? <LiveResults patientId={space.id} text={query} day={range === "today" ? today : undefined} personId={person || undefined} /> : <><div className="results-label eyebrow" role="status">{filtered.length} {filtered.length === 1 ? "CONVERSATION" : "CONVERSATIONS"}{query && ` MATCHING “${query}”`}</div><ConversationList conversations={filtered} /></>}
    <div className="bottom-callout"><PrivacyNote>{mode === "live" ? "Search includes authorized transcript text and memories. Results are bounded to 100 conversations; narrow your search if results are limited." : "Search covers the fictional records in this workspace."} No recording is proof that an activity happened.</PrivacyNote></div>
  </>;
}

function LiveResults({ patientId, text, day, personId }: { patientId: string; text: string; day?: string; personId?: string }) {
  const term = useDeferredValue(text.trim());
  const path = apiPath("search", { patientId, text: term, day, personId });
  const { data: result, error } = useApiQuery<{ conversations: Conversation[]; limited: boolean }>(path);
  if (error) return <p role="alert" className="results-label">Search is temporarily unavailable.</p>;
  if (!result) return <p className="results-label muted" role="status">Searching your conversations…</p>;
  return <div aria-busy={term !== text.trim()}><p className="results-label eyebrow" role="status">{result.conversations.length} {result.conversations.length === 1 ? "CONVERSATION" : "CONVERSATIONS"}{result.limited && " · LIMITED RESULTS"}</p><ConversationList conversations={result.conversations} /></div>;
}
