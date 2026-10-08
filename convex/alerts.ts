import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { authorizeSession } from "./lib/access";
import { requireCurrentUser, requireSeniorAccess } from "./lib/auth";
import { sessionIdValidator } from "./lib/validators";

export const recordEmergencyAlert = internalMutation({
  args: {
    sessionId: sessionIdValidator,
    actorId: v.id("users"),
    matchedPhrases: v.array(v.string()),
    excerpt: v.string(),
  },
  handler: async (ctx, args) => {
    const { actor, senior, session } = await authorizeSession(ctx, args.actorId, args.sessionId, false);
    if (actor.role !== "senior" || actor._id !== senior._id) {
      throw new Error("Only the session's senior can create an emergency alert.");
    }
    if (args.matchedPhrases.length === 0) throw new Error("Emergency alert requires a matched phrase.");
    return await ctx.db.insert("alerts", {
      seniorId: senior._id,
      sessionId: session._id,
      matchedPhrases: args.matchedPhrases,
      excerpt: args.excerpt.slice(0, 300),
      createdAt: Date.now(),
    });
  },
});

export const listUnacknowledgedForSenior = query({
  args: { seniorId: v.id("users") },
  handler: async (ctx, args) => {
    const caregiver = await requireCurrentUser(ctx, "caregiver");
    await requireSeniorAccess(ctx, caregiver, args.seniorId);
    const alerts = await ctx.db.query("alerts")
      .withIndex("by_senior", (q) => q.eq("seniorId", args.seniorId))
      .order("desc")
      .collect();
    return alerts.filter((alert) => alert.acknowledgedAt === undefined);
  },
});

export const acknowledge = mutation({
  args: { alertId: v.id("alerts") },
  handler: async (ctx, args) => {
    const caregiver = await requireCurrentUser(ctx, "caregiver");
    const alert = await ctx.db.get(args.alertId);
    if (!alert) throw new Error("Emergency alert not found.");
    await requireSeniorAccess(ctx, caregiver, alert.seniorId);
    if (alert.acknowledgedAt !== undefined) return;
    await ctx.db.patch(alert._id, {
      acknowledgedAt: Date.now(),
      acknowledgedBy: caregiver._id,
    });
  },
});
