"use client";

import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";
import { ScreeningNotice } from "./ScreeningNotice";

function bandLabel(band: "no_flags" | "some_flags" | "many_flags"): string {
  switch (band) {
    case "no_flags": return "No flags";
    case "some_flags": return "Some flags";
    case "many_flags": return "Many flags";
  }
}

export function CognitiveOverview() {
  const { seniorId: rawSeniorId } = useParams<{ seniorId: string }>();
  const seniorId = rawSeniorId as Id<"users">;
  const sessions = useQuery(api.sessions.listForDashboard, { seniorId });
  const latestScored = sessions?.find((session) => session.sampleAdequate && session.riskScore !== null && session.band !== null);
  const flagged = sessions?.flatMap((session) => session.flaggedMarkers.map((marker) => ({
    ...marker,
    sessionId: session.sessionId,
    startedAt: session.startedAt,
  }))).slice(0, 8);

  return <section className="mx-auto max-w-6xl space-y-7 px-5 py-6">
    <header>
      <p className="text-sm font-semibold uppercase tracking-wide text-hale-700">Care overview</p>
      <h1 className="mt-1 text-3xl font-bold">Overview</h1>
    </header>

    <ScreeningNotice />

    <section aria-labelledby="latest-score-title" className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="latest-score-title" className="text-xl font-semibold">Latest cognitive screening</h2>
          {sessions === undefined ? <p className="mt-2 text-slate-600">Loading screening score…</p> : latestScored ? <>
            <p className="mt-2 text-2xl font-bold">{bandLabel(latestScored.band as "no_flags" | "some_flags" | "many_flags")}</p>
            <p className="mt-1 text-sm text-slate-600">Cognitive score (100 − risk): {100 - (latestScored.riskScore ?? 0)} / 100</p>
            <p className="mt-1 text-sm text-slate-600">Session from {new Date(latestScored.startedAt).toLocaleString()}</p>
          </> : <p className="mt-2 text-slate-600">No scored session is available yet.</p>}
        </div>
        <Link href={`/seniors/${seniorId}/cognitive`} className="font-semibold text-hale-700 underline">View cognitive page</Link>
      </div>
    </section>

    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Recent screening flags</h2>
        <Link href={`/seniors/${seniorId}/cognitive`} className="text-sm font-semibold text-hale-700 underline">Review markers</Link>
      </div>
      {flagged === undefined ? <p className="text-slate-600">Loading screening flags…</p> : flagged.length === 0 ? (
        <p className="rounded-xl border bg-white p-5 text-slate-600">No markers are currently flagged.</p>
      ) : <div className="grid gap-3">{flagged.map((marker, index) => <article key={`${marker.sessionId}-${marker.key}-${index}`} className="rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">{marker.label}</h3>
          <time className="text-xs text-slate-500">{new Date(marker.startedAt).toLocaleDateString()}</time>
        </div>
        <p className="mt-1 text-sm text-slate-600">Threshold: {marker.threshold}</p>
        {marker.evidence.map((excerpt, excerptIndex) => <blockquote key={excerptIndex} className="mt-2 border-l-2 border-hale-700 pl-3 text-sm text-slate-700">“{excerpt}”</blockquote>)}
      </article>)}</div>}
    </section>

    <section className="space-y-3">
      <h2 className="text-xl font-semibold">Recent sessions</h2>
      {sessions === undefined ? <p className="text-slate-600">Loading sessions…</p> : sessions.length === 0 ? (
        <p className="rounded-xl border bg-white p-5 text-slate-600">No sessions have been completed yet.</p>
      ) : <div className="grid gap-3">{sessions.slice(0, 8).map((session) => <article key={session.sessionId} className="rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">{new Date(session.startedAt).toLocaleString()}</h3>
          <span className="text-sm text-slate-600">{session.wordCount} senior words</span>
        </div>
        <p className="mt-2 text-sm text-slate-700">{session.summary}</p>
        <p className="mt-2 text-xs text-slate-600">{session.flaggedMarkerCount} flagged marker{session.flaggedMarkerCount === 1 ? "" : "s"}</p>
        <Link href={`/seniors/${seniorId}/transcripts/${session.sessionId}`} className="mt-3 inline-block text-sm font-semibold text-hale-700 underline">Review transcript</Link>
      </article>)}</div>}
    </section>
  </section>;
}
