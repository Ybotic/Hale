import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { authorizeSession } from "./lib/access";
import { requireCurrentUser, requireSeniorAccess, roleClaim } from "./lib/auth";
import { seniorIdValidator, sessionIdValidator } from "./lib/validators";
import { tokenizeTranscript } from "@care/shared";

export const start = mutation({
  args: {},
  handler: async (ctx) => {
    const senior = await requireCurrentUser(ctx, "senior");
    const active = await ctx.db.query("sessions")
      .withIndex("by_senior_status", (q) => q.eq("seniorId", senior._id).eq("status", "active"))
      .first();
    if (active) return active._id;
    return await ctx.db.insert("sessions", {
      seniorId: senior._id,
      status: "active",
      startedAt: Date.now(),
    });
  },
});

export const current = query({
  args: {},
  handler: async (ctx) => {
    const senior = await requireCurrentUser(ctx, "senior");
    return await ctx.db.query("sessions")
      .withIndex("by_senior_status", (q) => q.eq("seniorId", senior._id).eq("status", "active"))
      .first();
  },
});

export const end = action({
  args: { sessionId: sessionIdValidator },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || roleClaim(identity) !== "senior") {
      throw new Error("Only the session's senior can end this chat.");
    }
    const actor = await ctx.runQuery(internal.users.getActorByClerkId, {
      clerkId: identity.subject,
      expectedRole: "senior",
    });
    await ctx.runMutation(internal.sessions.completeForActor, {
      sessionId: args.sessionId,
      actorId: actor._id,
    });
    await ctx.runAction(internal.analysisActions.analyzeCompletedSession, {
      sessionId: args.sessionId,
      actorId: actor._id,
    });
  },
});

export const completeForActor = internalMutation({
  args: { sessionId: sessionIdValidator, actorId: v.id("users") },
  handler: async (ctx, args) => {
    const { actor, senior, session } = await authorizeSession(ctx, args.actorId, args.sessionId, false);
    if (actor.role !== "senior" || actor._id !== senior._id) {
      throw new Error("Only the session's own senior can complete it.");
    }
    if (session.status === "completed") return;
    await ctx.db.patch(session._id, { status: "completed", completedAt: Date.now() });
  },
});

export const getContextForVoice = internalQuery({
  args: { sessionId: sessionIdValidator, actorId: v.id("users") },
  handler: async (ctx, args) => {
    const { actor, senior, session } = await authorizeSession(ctx, args.actorId, args.sessionId);
    const [medications, contacts, bills, messages] = await Promise.all([
      ctx.db.query("medications").withIndex("by_senior", (q) => q.eq("seniorId", senior._id)).collect(),
      ctx.db.query("emergencyContacts").withIndex("by_senior", (q) => q.eq("seniorId", senior._id)).collect(),
      ctx.db.query("bills").withIndex("by_senior", (q) => q.eq("seniorId", senior._id)).collect(),
      ctx.db.query("messages").withIndex("by_session", (q) => q.eq("sessionId", session._id)).order("desc").take(12),
    ]);
    return {
      actorId: actor._id,
      session,
      senior,
      medications: medications.filter((item) => item.active),
      contacts,
      unpaidBills: bills.filter((bill) => bill.status === "unpaid"),
      messages: messages.reverse(),
    };
  },
});

export const getSessionForActor = internalQuery({
  args: { sessionId: sessionIdValidator, actorId: v.id("users"), activeOnly: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const result = await authorizeSession(ctx, args.actorId, args.sessionId, args.activeOnly ?? true);
    return { actorId: result.actor._id, seniorId: result.senior._id, session: result.session };
  },
});

export const getSeniorSessions = query({
  args: { seniorId: seniorIdValidator },
  handler: async (ctx, args) => {
    const actor = await requireCurrentUser(ctx);
    await requireSeniorAccess(ctx, actor, args.seniorId);
    return await ctx.db.query("sessions")
      .withIndex("by_senior", (q) => q.eq("seniorId", args.seniorId))
      .order("desc")
      .collect();
  },
});

export const listForDashboard = query({
  args: { seniorId: seniorIdValidator },
  handler: async (ctx, args) => {
    const actor = await requireCurrentUser(ctx);
    await requireSeniorAccess(ctx, actor, args.seniorId);
    const sessions = await ctx.db.query("sessions")
      .withIndex("by_senior", (q) => q.eq("seniorId", args.seniorId))
      .collect();
    const ordered = sessions.sort((left, right) => right.startedAt - left.startedAt).slice(0, 100);
    return await Promise.all(ordered.map(async (session) => {
      const [analysis, messages] = await Promise.all([
        ctx.db.query("analyses").withIndex("by_session", (q) => q.eq("sessionId", session._id)).first(),
        ctx.db.query("messages").withIndex("by_session", (q) => q.eq("sessionId", session._id)).collect(),
      ]);
      const userMessages = messages.filter((message) => message.role === "user");
      const wordCount = analysis?.metrics.totalWords ?? tokenizeTranscript(userMessages.map((message) => message.text).join(" ")).length;
      return {
        sessionId: session._id,
        status: session.status,
        startedAt: session.startedAt,
        completedAt: session.completedAt ?? null,
        wordCount,
        summary: analysis?.interpretation ?? "Analysis is not available for this session yet.",
        riskScore: analysis?.riskScore ?? null,
        band: analysis?.band ?? null,
        sampleAdequate: analysis?.sampleAdequate ?? false,
        flaggedMarkerCount: analysis?.markers.filter((marker) => marker.flagged).length ?? 0,
        flaggedMarkers: analysis?.markers.filter((marker) => marker.flagged).map((marker) => ({
          key: marker.key,
          label: marker.label,
          threshold: marker.threshold,
          evidence: marker.evidence,
        })) ?? [],
      };
    }));
  },
});

export const transcriptForDashboard = query({
  args: { sessionId: sessionIdValidator },
  handler: async (ctx, args) => {
    const actor = await requireCurrentUser(ctx);
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Chat session not found.");
    await requireSeniorAccess(ctx, actor, session.seniorId);
    const [messages, analysis] = await Promise.all([
      ctx.db.query("messages")
        .withIndex("by_session", (q) => q.eq("sessionId", session._id))
        .order("asc")
        .collect(),
      ctx.db.query("analyses")
        .withIndex("by_session", (q) => q.eq("sessionId", session._id))
        .first(),
    ]);
    return {
      session: { sessionId: session._id, startedAt: session.startedAt, completedAt: session.completedAt ?? null },
      messages: messages.map((message) => ({
        messageId: message._id,
        role: message.role,
        text: message.text,
        createdAt: message.createdAt,
      })),
      flaggedMarkerCount: analysis?.markers.filter((marker) => marker.flagged).length ?? 0,
      flaggedMarkers: analysis?.markers.filter((marker) => marker.flagged).map((marker) => ({
        key: marker.key,
        label: marker.label,
        threshold: marker.threshold,
        evidence: marker.evidence,
      })) ?? [],
    };
  },
});
