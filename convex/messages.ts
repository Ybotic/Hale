import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { authorizeSession } from "./lib/access";
import { requireCurrentUser, requireSeniorAccess } from "./lib/auth";
import { cardPayloadValidator } from "./lib/cardValidator";
import { sessionIdValidator } from "./lib/validators";

const AUDIO_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export const listForSession = query({
  args: { sessionId: sessionIdValidator },
  handler: async (ctx, args) => {
    const actor = await requireCurrentUser(ctx, "senior");
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Chat session not found.");
    await requireSeniorAccess(ctx, actor, session.seniorId);
    const messages = await ctx.db.query("messages")
      .withIndex("by_session", (q) => q.eq("sessionId", session._id))
      .order("asc")
      .collect();
    return await Promise.all(messages.map(async (message) => ({
      ...message,
      audioUrl: message.audioStorageId ? await ctx.storage.getUrl(message.audioStorageId) : null,
    })));
  },
});

export const persistUserTurn = internalMutation({
  args: {
    sessionId: sessionIdValidator,
    actorId: v.id("users"),
    text: v.string(),
    audioStorageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const { senior, session } = await authorizeSession(ctx, args.actorId, args.sessionId);
    const upload = await ctx.db.query("voiceUploads")
      .withIndex("by_storage_id", (q) => q.eq("storageId", args.audioStorageId))
      .unique();
    if (!upload || upload.seniorId !== senior._id || upload.sessionId !== session._id) {
      throw new Error("Uploaded audio is not registered to this chat session.");
    }
    await ctx.db.delete(upload._id);
    return await ctx.db.insert("messages", {
      sessionId: session._id,
      seniorId: senior._id,
      role: "user",
      text: args.text,
      audioStorageId: args.audioStorageId,
      audioExpiresAt: Date.now() + AUDIO_RETENTION_MS,
      createdAt: Date.now(),
    });
  },
});

export const persistAssistantTurn = internalMutation({
  args: {
    sessionId: sessionIdValidator,
    actorId: v.id("users"),
    text: v.string(),
    audioStorageId: v.optional(v.id("_storage")),
    card: v.optional(cardPayloadValidator),
  },
  handler: async (ctx, args) => {
    const { senior, session } = await authorizeSession(ctx, args.actorId, args.sessionId);
    const message = {
      sessionId: session._id,
      seniorId: senior._id,
      role: "assistant" as const,
      text: args.text,
      createdAt: Date.now(),
    };
    const withAudio = args.audioStorageId === undefined
      ? message
      : { ...message, audioStorageId: args.audioStorageId, audioExpiresAt: Date.now() + AUDIO_RETENTION_MS };
    return await ctx.db.insert("messages", args.card === undefined ? withAudio : { ...withAudio, card: args.card });
  },
});
