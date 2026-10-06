import { v } from "convex/values";
import { internalMutation, internalQuery, mutation } from "./_generated/server";
import { authorizeSession } from "./lib/access";
import { requireCurrentUser, requireSeniorAccess } from "./lib/auth";
import { sessionIdValidator } from "./lib/validators";

export const generateAudioUploadUrl = mutation({
  args: { sessionId: sessionIdValidator },
  handler: async (ctx, args) => {
    const senior = await requireCurrentUser(ctx, "senior");
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.status !== "active") throw new Error("Active chat session not found.");
    await requireSeniorAccess(ctx, senior, session.seniorId);
    return await ctx.storage.generateUploadUrl();
  },
});

export const registerAudioUpload = mutation({
  args: { sessionId: sessionIdValidator, storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const actor = await requireCurrentUser(ctx, "senior");
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.status !== "active") throw new Error("Active chat session not found.");
    const senior = await requireSeniorAccess(ctx, actor, session.seniorId);
    const existing = await ctx.db.query("voiceUploads")
      .withIndex("by_storage_id", (q) => q.eq("storageId", args.storageId))
      .unique();
    if (existing) throw new Error("This audio file has already been registered.");
    const now = Date.now();
    await ctx.db.insert("voiceUploads", {
      seniorId: senior._id,
      sessionId: session._id,
      storageId: args.storageId,
      uploadedAt: now,
      expiresAt: now + 30 * 24 * 60 * 60 * 1000,
    });
  },
});

export const assertPendingAudio = internalQuery({
  args: { sessionId: sessionIdValidator, actorId: v.id("users"), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const { senior, session } = await authorizeSession(ctx, args.actorId, args.sessionId);
    const upload = await ctx.db.query("voiceUploads")
      .withIndex("by_storage_id", (q) => q.eq("storageId", args.storageId))
      .unique();
    if (!upload || upload.seniorId !== senior._id || upload.sessionId !== session._id || upload.expiresAt <= Date.now()) {
      throw new Error("Audio upload is missing or expired.");
    }
    return null;
  },
});

export const deletePendingAudio = internalMutation({
  args: { sessionId: sessionIdValidator, actorId: v.id("users"), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const { senior, session } = await authorizeSession(ctx, args.actorId, args.sessionId, false, true);
    const upload = await ctx.db.query("voiceUploads")
      .withIndex("by_storage_id", (q) => q.eq("storageId", args.storageId))
      .unique();
    if (!upload || upload.seniorId !== senior._id || upload.sessionId !== session._id) return;
    await ctx.storage.delete(upload.storageId);
    await ctx.db.delete(upload._id);
  },
});
