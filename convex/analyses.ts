import { v } from "convex/values";
import { type AnalysisBand, type AnalysisMarker, type CognitiveMetrics } from "@care/shared";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { authorizeSession } from "./lib/access";
import { requireCurrentUser, requireSeniorAccess } from "./lib/auth";
import { sessionIdValidator } from "./lib/validators";

const bandValidator = v.union(v.literal("no_flags"), v.literal("some_flags"), v.literal("many_flags"));
const metricsValidator = v.object({
  totalWords: v.number(),
  uniqueWords: v.number(),
  hapaxLegomena: v.number(),
  typeTokenRatio: v.union(v.number(), v.null()),
  movingAverageTypeTokenRatio: v.union(v.number(), v.null()),
  movingAverageWindowCount: v.number(),
  fillerWordCount: v.number(),
  fillerWordRate: v.number(),
  falseStartCount: v.number(),
  falseStartRate: v.number(),
  immediateRepetitionCount: v.number(),
  immediateRepetitionRate: v.number(),
  pronounCount: v.number(),
  pronounRatio: v.number(),
  genericPronounCount: v.number(),
  genericPronounRatio: v.number(),
  wordFindingPhraseCount: v.number(),
  pauseMarkerCount: v.number(),
  repeatedStatementCount: v.number(),
  sampleAdequate: v.boolean(),
});
const markerValidator = v.object({
  key: v.string(),
  label: v.string(),
  value: v.union(v.number(), v.null()),
  threshold: v.string(),
  flagged: v.boolean(),
  points: v.number(),
  evidence: v.array(v.string()),
});

export const getCompletedTranscriptForAnalysis = internalQuery({
  args: { sessionId: sessionIdValidator, actorId: v.id("users") },
  handler: async (ctx, args) => {
    const { actor, senior, session } = await authorizeSession(ctx, args.actorId, args.sessionId, false);
    if (actor.role !== "senior" || actor._id !== senior._id) {
      throw new Error("Only the session's senior may request its analysis.");
    }
    if (session.status !== "completed") throw new Error("Only completed sessions can be analyzed.");
    const messages = await ctx.db.query("messages")
      .withIndex("by_session", (q) => q.eq("sessionId", session._id))
      .order("asc")
      .collect();
    return { seniorId: senior._id, utterances: messages.filter((message) => message.role === "user").map((message) => message.text) };
  },
});

export const storeIfMissing = internalMutation({
  args: {
    sessionId: sessionIdValidator,
    actorId: v.id("users"),
    riskScore: v.number(),
    band: bandValidator,
    sampleAdequate: v.boolean(),
    metrics: metricsValidator,
    markers: v.array(markerValidator),
    interpretation: v.string(),
    suggestions: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const { actor, senior, session } = await authorizeSession(ctx, args.actorId, args.sessionId, false);
    if (actor.role !== "senior" || actor._id !== senior._id) {
      throw new Error("Only the session's senior may store its analysis.");
    }
    if (session.status !== "completed") throw new Error("Only completed sessions can be analyzed.");
    const existing = await ctx.db.query("analyses")
      .withIndex("by_session", (q) => q.eq("sessionId", session._id))
      .first();
    if (existing) return { analysisId: existing._id, created: false };
    const analysisId = await ctx.db.insert("analyses", {
      seniorId: senior._id,
      sessionId: session._id,
      riskScore: args.riskScore,
      band: args.band,
      sampleAdequate: args.sampleAdequate,
      metrics: args.metrics,
      markers: args.markers,
      interpretation: args.interpretation,
      suggestions: args.suggestions,
      analyzedAt: Date.now(),
    });
    return { analysisId, created: true };
  },
});

export const updateNarrative = internalMutation({
  args: {
    analysisId: v.id("analyses"),
    actorId: v.id("users"),
    interpretation: v.string(),
    suggestions: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const analysis = await ctx.db.get(args.analysisId);
    if (!analysis) throw new Error("Analysis not found.");
    const { actor, senior } = await authorizeSession(ctx, args.actorId, analysis.sessionId, false);
    if (actor.role !== "senior" || actor._id !== senior._id || senior._id !== analysis.seniorId) {
      throw new Error("Only the session's senior may update its analysis.");
    }
    await ctx.db.patch(analysis._id, {
      interpretation: args.interpretation,
      suggestions: args.suggestions,
    });
  },
});

export const listForSenior = query({
  args: { seniorId: v.id("users") },
  handler: async (ctx, args) => {
    const actor = await requireCurrentUser(ctx);
    await requireSeniorAccess(ctx, actor, args.seniorId);
    const analyses = await ctx.db.query("analyses")
      .withIndex("by_senior", (q) => q.eq("seniorId", args.seniorId))
      .collect();
    return analyses.sort((left, right) => right.analyzedAt - left.analyzedAt);
  },
});

export type { AnalysisBand, AnalysisMarker, CognitiveMetrics };
