import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { authorizeSession } from "./lib/access";
import { sessionIdValidator } from "./lib/validators";

const RATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 30;

export const reserveRequest = internalMutation({
  args: { sessionId: sessionIdValidator, actorId: v.id("users") },
  handler: async (ctx, args) => {
    const { actor, senior, session } = await authorizeSession(ctx, args.actorId, args.sessionId);
    if (actor.role !== "senior" || actor._id !== senior._id) {
      throw new Error("Only the session's senior can use the voice assistant.");
    }

    const now = Date.now();
    const current = await ctx.db.query("voiceRateLimits")
      .withIndex("by_senior", (q) => q.eq("seniorId", senior._id))
      .unique();
    if (!current || now - current.windowStartedAt >= RATE_WINDOW_MS) {
      if (current) {
        await ctx.db.patch(current._id, { windowStartedAt: now, requestCount: 1 });
      } else {
        await ctx.db.insert("voiceRateLimits", {
          seniorId: senior._id,
          windowStartedAt: now,
          requestCount: 1,
        });
      }
      return { remaining: MAX_REQUESTS_PER_WINDOW - 1, sessionId: session._id };
    }
    if (current.requestCount >= MAX_REQUESTS_PER_WINDOW) {
      throw new Error("Voice request limit reached. Please wait a few minutes and try again.");
    }
    await ctx.db.patch(current._id, { requestCount: current.requestCount + 1 });
    return { remaining: MAX_REQUESTS_PER_WINDOW - current.requestCount - 1, sessionId: session._id };
  },
});
