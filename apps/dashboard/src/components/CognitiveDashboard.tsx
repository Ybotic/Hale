"use client";

import { calculateCognitiveTrend } from "@care/shared";
import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
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

function markerValue(key: string, value: number | null): string {
  if (value === null) return "Not available";
  if (["type_token_ratio", "moving_average_ttr", "filler_word_rate", "false_starts", "immediate_repetition", "pronoun_ratio", "generic_pronoun_ratio"].includes(key)) {
    return `${(value * 100).toFixed(1)}%`;
  }
  if (key === "pause_markers") return `${value.toFixed(1)} per 100 words`;
  return String(value);
}

export function CognitiveDashboard() {
  const { seniorId: rawSeniorId } = useParams<{ seniorId: string }>();
  const seniorId = rawSeniorId as Id<"users">;
  const analyses = useQuery(api.analyses.listForSenior, { seniorId });
  const scored = analyses?.filter((analysis) => analysis.sampleAdequate) ?? [];
  const trend = calculateCognitiveTrend(scored.map((analysis) => 100 - analysis.riskScore));
  const latest = scored[0];
  const newest = analyses?.[0];

  return <section className="mx-auto max-w-6xl space-y-7 px-5 py-6">
    <header>
      <p className="text-sm font-semibold uppercase tracking-wide text-hale-700">Cognitive screening</p>
      <h1 className="mt-1 text-3xl font-bold">Cognitive page</h1>
    </header>
    <ScreeningNotice />

    <section aria-labelledby="trend-title" className="rounded-xl border bg-white p-5 shadow-sm">
      <h2 id="trend-title" className="text-xl font-semibold">Trend against this senior’s own baseline</h2>
      {analyses === undefined ? <p className="mt-3 text-slate-600">Loading session trend…</p> : trend ? <>
        <p className="mt-3 text-2xl font-bold">
          {trend.difference === 0 ? "At baseline" : `${Math.abs(trend.difference).toFixed(1)} points ${trend.difference > 0 ? "above" : "below"} baseline`}
        </p>
        <p className="mt-1 text-sm text-slate-600">
          Latest screening score {trend.latestScore.toFixed(1)}; baseline average {trend.baselineScore.toFixed(1)} across {trend.scoredSessionCount - 1} earlier scored sessions.
        </p>
      </> : <p className="mt-3 text-slate-600">Trend is shown after at least 3 scored sessions. {scored.length} scored session{scored.length === 1 ? "" : "s"} available.</p>}
    </section>

    <section className="rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold">Most recent scored session</h2>
      {analyses === undefined ? <p className="mt-2 text-slate-600">Loading analysis…</p> : latest ? <>
        <p className="mt-2 text-lg font-semibold">{bandLabel(latest.band)}</p>
        <p className="mt-1 text-sm text-slate-600">Cognitive score (100 − risk): {100 - latest.riskScore} / 100 · {latest.metrics.totalWords} senior words</p>
        <p className="mt-3 text-slate-700">{latest.interpretation}</p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">{latest.suggestions.map((suggestion, index) => <li key={index}>{suggestion}</li>)}</ul>
      </> : <p className="mt-2 text-slate-600">No session has enough speech for a screening score yet.</p>}
    </section>

    <section className="space-y-3">
      <h2 className="text-xl font-semibold">Scored sessions</h2>
      {analyses === undefined ? <p className="text-slate-600">Loading session history…</p> : scored.length === 0 ? (
        <p className="rounded-xl border bg-white p-5 text-slate-600">No scored sessions are available.</p>
      ) : <div className="space-y-3">{scored.map((analysis) => {
        const score = 100 - analysis.riskScore;
        return <article key={analysis._id} className="rounded-xl border bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="font-semibold">{new Date(analysis.analyzedAt).toLocaleString()}</h3><p className="text-sm text-slate-600">{bandLabel(analysis.band)} · {analysis.metrics.totalWords} words</p></div>
            <div className="min-w-36" aria-label={`Cognitive score ${score} out of 100`}>
              <div className="h-2 overflow-hidden rounded bg-slate-200"><div className="h-full bg-hale-700" style={{ width: `${score}%` }} /></div>
              <p className="mt-1 text-right text-xs text-slate-600">Score {score}/100</p>
            </div>
          </div>
        </article>;
      })}</div>}
    </section>

    <section className="space-y-3">
      <h2 className="text-xl font-semibold">Per-marker metrics and thresholds</h2>
      {analyses === undefined ? <p className="text-slate-600">Loading markers…</p> : !newest ? (
        <p className="rounded-xl border bg-white p-5 text-slate-600">No session analysis is available yet.</p>
      ) : <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b bg-hale-50"><tr><th className="p-3">Marker</th><th className="p-3">Measured</th><th className="p-3">Heuristic threshold</th><th className="p-3">Status</th><th className="p-3">Evidence</th></tr></thead>
          <tbody>{newest.markers.map((marker) => <tr key={marker.key} className="border-b align-top last:border-0">
            <th scope="row" className="p-3 font-medium">{marker.label}</th>
            <td className="p-3">{markerValue(marker.key, marker.value)}</td>
            <td className="p-3">{marker.threshold}</td>
            <td className="p-3">{marker.flagged ? "Flagged" : "Not flagged"}</td>
            <td className="p-3">{marker.evidence.length === 0 ? <span className="text-slate-500">—</span> : marker.evidence.map((evidence, index) => <blockquote key={index} className="mb-2 border-l-2 border-hale-700 pl-2 last:mb-0">“{evidence}”</blockquote>)}</td>
          </tr>)}</tbody>
        </table>
        {!newest.sampleAdequate ? <p className="border-t p-3 text-sm text-slate-600">This session has too few words for a scored screening result.</p> : null}
      </div>}
    </section>
  </section>;
}
