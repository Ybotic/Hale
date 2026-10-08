"use client";

import { APP_NAME } from "@care/shared";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";

export function TranscriptReview({ sessionId: routeSessionId }: { sessionId?: string }) {
  const { seniorId: rawSeniorId } = useParams<{ seniorId: string }>();
  const seniorId = rawSeniorId as Id<"users">;
  const sessions = useQuery(api.sessions.listForDashboard, { seniorId });
  const transcript = useQuery(
    api.sessions.transcriptForDashboard,
    routeSessionId ? { sessionId: routeSessionId as Id<"sessions"> } : "skip",
  );
  const selectedSession = routeSessionId ? sessions?.find((item) => item.sessionId === routeSessionId) : undefined;

  if (routeSessionId) return <section className="mx-auto max-w-5xl space-y-6 px-5 py-6">
    <Link href={`/seniors/${seniorId}/transcripts`} className="text-sm font-semibold text-hale-700 underline">Back to sessions</Link>
    <header>
      <p className="text-sm font-semibold uppercase tracking-wide text-hale-700">Transcript review</p>
      <h1 className="mt-1 text-3xl font-bold">{transcript ? new Date(transcript.session.startedAt).toLocaleString() : "Session transcript"}</h1>
      {selectedSession ? <p className="mt-2 text-sm text-slate-600">{selectedSession.flaggedMarkerCount} flagged marker{selectedSession.flaggedMarkerCount === 1 ? "" : "s"}</p> : null}
    </header>
    {transcript === undefined ? <p className="text-slate-600">Loading transcript…</p> : <>
      {transcript.flaggedMarkers.length > 0 ? <section aria-label="Flagged markers" className="rounded-xl border bg-white p-4">
        <h2 className="font-semibold">Flagged markers ({transcript.flaggedMarkerCount})</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{transcript.flaggedMarkers.map((marker) => <li key={marker.key}>{marker.label} — threshold: {marker.threshold}</li>)}</ul>
      </section> : <p className="rounded-xl border bg-white p-4 text-sm text-slate-600">No markers were flagged for this session.</p>}
      <ol className="space-y-3">{transcript.messages.map((message) => <li key={message.messageId} className={`rounded-xl border p-4 ${message.role === "user" ? "bg-white" : "bg-hale-50"}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">{message.role === "user" ? "Senior" : APP_NAME}</h2>
          <time className="text-xs text-slate-500">{new Date(message.createdAt).toLocaleTimeString()}</time>
        </div>
        <p className="mt-2 whitespace-pre-wrap text-slate-800">{message.text}</p>
      </li>)}</ol>
    </>}
  </section>;

  return <section className="mx-auto max-w-6xl space-y-6 px-5 py-6">
    <header>
      <p className="text-sm font-semibold uppercase tracking-wide text-hale-700">Session records</p>
      <h1 className="mt-1 text-3xl font-bold">Transcript review</h1>
    </header>
    {sessions === undefined ? <p className="text-slate-600">Loading sessions…</p> : sessions.length === 0 ? (
      <p className="rounded-xl border bg-white p-5 text-slate-600">No sessions are available.</p>
    ) : <div className="space-y-3">{sessions.map((session) => <article key={session.sessionId} className="rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">{new Date(session.startedAt).toLocaleString()}</h2>
        <span className="text-sm text-slate-600">{session.flaggedMarkerCount} flagged marker{session.flaggedMarkerCount === 1 ? "" : "s"} · {session.wordCount} words</span>
      </div>
      <p className="mt-2 text-sm text-slate-700">{session.summary}</p>
      <Link href={`/seniors/${seniorId}/transcripts/${session.sessionId}`} className="mt-3 inline-block text-sm font-semibold text-hale-700 underline">Open transcript</Link>
    </article>)}</div>}
  </section>;
}
