"use node";

import { analyzeCognitiveTranscript } from "@care/shared";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { fallbackAnalysis, interpretComputedAnalysis } from "./llm/analysis";
import { sessionIdValidator } from "./lib/validators";
import { v } from "convex/values";

export const analyzeCompletedSession = internalAction({
  args: { sessionId: sessionIdValidator, actorId: v.id("users") },
  handler: async (ctx, args): Promise<Id<"analyses">> => {
    const { utterances } = await ctx.runQuery(internal.analyses.getCompletedTranscriptForAnalysis, args);
    const result = analyzeCognitiveTranscript(utterances);
    const flaggedNames = result.markers.filter((marker) => marker.flagged).map((marker) => marker.label);
    const fallback = fallbackAnalysis(result.metrics, flaggedNames);
    const stored: { analysisId: Id<"analyses">; created: boolean } = await ctx.runMutation(internal.analyses.storeIfMissing, {
      ...args,
      riskScore: result.riskScore,
      band: result.band,
      sampleAdequate: result.metrics.sampleAdequate,
      metrics: result.metrics,
      markers: result.markers,
      interpretation: fallback.interpretation,
      suggestions: fallback.suggestions,
    });
    if (!stored.created) return stored.analysisId;

    try {
      // The interpretation model receives metrics and marker names only—never transcript text or excerpts.
      const narrative = await interpretComputedAnalysis(result.metrics, flaggedNames);
      await ctx.runMutation(internal.analyses.updateNarrative, {
        analysisId: stored.analysisId,
        actorId: args.actorId,
        ...narrative,
      });
    } catch {
      // The deterministic fallback was stored atomically before the optional LLM call.
    }
    return stored.analysisId;
  },
});
