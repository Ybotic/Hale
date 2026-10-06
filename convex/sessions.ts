import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { authorizeSession } from "./lib/access";
import { requireCurrentUser, requireSeniorAccess } from "./lib/auth";
import { seniorIdValidator, sessionIdValidator } from "./lib/validators";

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

export const end = mutation({
  args: { sessionId: sessionIdValidator },
  handler: async (ctx, args) => {
    const actor = await requireCurrentUser(ctx, "senior");
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Chat session not found.");
    await requireSeniorAccess(ctx, actor, session.seniorId);
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
