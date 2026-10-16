import { v, ConvexError } from "convex/values";
import { mutation, internalMutation, internalQuery } from "./lib/functions";
import { requireMember, requireRecordingConsent } from "./authz";
import { localDate } from "@mnemo/contracts/time";

export const authorizeUpload = internalQuery({
  args: { sessionId: v.id("recordingSessions") },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) throw new ConvexError("Session unavailable.");
    const { identity } = await requireMember(ctx, session.patientId, "recordings:create");
    if (identity.subject !== session.subject) throw new ConvexError("Session owner mismatch.");
    await requireRecordingConsent(ctx, session.patientId, identity.subject);
    return null;
  },
});

export const start = mutation({
  args: { patientId: v.id("patients"), participantsConsented: v.boolean() },
  handler: async (ctx, { patientId, participantsConsented }) => {
    const { identity, patient } = await requireMember(ctx, patientId, "recordings:create");
    await requireRecordingConsent(ctx, patientId, identity.subject);
    if (!participantsConsented) throw new ConvexError("Confirm consent from everyone taking part before recording.");
    return ctx.db.insert("recordingSessions", { patientId, subject: identity.subject, timezone: patient.timezone, startedAt: Date.now(), consentConfirmedAt: Date.now(), state: "recording" });
  },
});

export const setState = mutation({
  args: { sessionId: v.id("recordingSessions"), state: v.union(v.literal("recording"), v.literal("paused"), v.literal("interrupted"), v.literal("stopped")) },
  handler: async (ctx, { sessionId, state }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) throw new ConvexError("Session unavailable.");
    const { identity } = await requireMember(ctx, session.patientId, "recordings:create");
    if (session.subject !== identity.subject) throw new ConvexError("This session belongs to another user.");
    if (session.state === "stopped") throw new ConvexError("This session has ended. Start a new one.");
    await requireRecordingConsent(ctx, session.patientId, identity.subject);
    await ctx.db.patch(sessionId, { state, ...(state === "stopped" ? { endedAt: Date.now() } : {}) });
  },
});

// Only the authenticated HTTP upload action supplies storage IDs. Clients cannot attach guessed files.
export const acceptChunk = internalMutation({
  args: {
    sessionId: v.id("recordingSessions"), sequence: v.number(), storageId: v.id("_storage"),
    capturedAt: v.number(), endedAt: v.number(), mimeType: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new ConvexError("Session unavailable.");
    const { identity, patient } = await requireMember(ctx, session.patientId, "recordings:create");
    if (identity.subject !== session.subject) throw new ConvexError("Session owner mismatch.");
    await requireRecordingConsent(ctx, session.patientId, identity.subject);
    if (!Number.isInteger(args.sequence) || args.sequence < 0 || !Number.isFinite(args.capturedAt) || !Number.isFinite(args.endedAt) || args.endedAt <= args.capturedAt || args.endedAt - args.capturedAt > 120_000 || args.capturedAt < session.startedAt - 10_000 || args.endedAt > Date.now() + 10_000) throw new ConvexError("Invalid segment timing.");
    if (session.endedAt && args.endedAt > session.endedAt + 1000) throw new ConvexError("This audio was captured after the session ended.");
    const existing = await ctx.db.query("audioChunks").withIndex("by_session_sequence", (q) => q.eq("sessionId", args.sessionId).eq("sequence", args.sequence)).unique();
    if (existing) {
      if (existing.deletedAt) throw new ConvexError("This evidence has been deleted.");
      return { chunkId: existing._id, duplicate: true };
    }
    const chunkId = await ctx.db.insert("audioChunks", { ...args, patientId: session.patientId, state: "queued", expiresAt: Date.now() + patient.audioRetentionDays * 86_400_000 });
    await ctx.db.insert("processingJobs", { patientId: session.patientId, chunkId, state: "queued", createdAt: Date.now() });
    await ctx.db.insert("conversations", {
      patientId: session.patientId, chunkId, title: "New recording", summary: "Audio uploaded. Waiting for the audio worker; no transcript has been generated yet.",
      startedAt: args.capturedAt, duration: (args.endedAt - args.capturedAt) / 1000,
      localDate: localDate(args.capturedAt, session.timezone), people: [], state: "queued",
    });
    return { chunkId, duplicate: false };
  },
});
