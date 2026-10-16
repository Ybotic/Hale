import { makeFunctionReference } from "convex/server";
import { ConvexError, v } from "convex/values";
import { VOICE_POLICY } from "@mnemo/contracts/voice";
import { requireIdentity } from "./authz";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./lib/functions";

const startRef = makeFunctionReference<"action">("voices:start");
const pollRef = makeFunctionReference<"action">("voices:poll");
const claimRef = makeFunctionReference<"mutation">("voices:claim");
const jobRef = makeFunctionReference<"mutation">("voices:setJob");
const finishRef = makeFunctionReference<"mutation">("voices:finish");
const readRef = makeFunctionReference<"query">("voices:readJob");
const jobArgs = { profileId: v.id("familyProfiles"), requestId: v.string() };

export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const profile = await ctx.db.query("familyProfiles").withIndex("by_subject", (q) => q.eq("subject", identity.subject)).unique();
    return {
      configured: Boolean(process.env.PYANNOTE_API_KEY),
      profile: profile ? { name: profile.name, relationship: profile.relationship, voiceState: profile.voiceState, message: profile.message } : null,
    };
  },
});

export const saveProfile = mutation({
  args: { name: v.string(), relationship: v.string() },
  handler: async (ctx, args) => {
    const { subject } = await requireIdentity(ctx);
    const name = args.name.trim(), relationship = args.relationship.trim();
    if (name.length < 2 || name.length > 100 || relationship.length < 2 || relationship.length > 80) throw new ConvexError("Enter your name and relationship.");
    const profile = await ctx.db.query("familyProfiles").withIndex("by_subject", (q) => q.eq("subject", subject)).unique();
    if (profile) await ctx.db.patch(profile._id, { name, relationship });
    else await ctx.db.insert("familyProfiles", { subject, name, relationship, voiceState: "not_enrolled", updatedAt: Date.now() });
    // Deliberately creates no patient space, person association, or membership.
    return null;
  },
});

export const skip = mutation({
  args: {},
  handler: async (ctx) => {
    const { subject } = await requireIdentity(ctx);
    const profile = await ctx.db.query("familyProfiles").withIndex("by_subject", (q) => q.eq("subject", subject)).unique();
    if (!profile) throw new ConvexError("Introduce yourself first.");
    if (["queued", "processing", "enrolled"].includes(profile.voiceState)) throw new ConvexError("Remove your existing voice profile first.");
    await ctx.db.patch(profile._id, { voiceState: "skipped", updatedAt: Date.now(), enrollmentVersion: (profile.enrollmentVersion ?? 0) + 1 });
    return null;
  },
});

export const revoke = mutation({
  args: {},
  handler: async (ctx) => {
    const { subject } = await requireIdentity(ctx);
    const profile = await ctx.db.query("familyProfiles").withIndex("by_subject", (q) => q.eq("subject", subject)).unique();
    if (!profile) return null;
    if (profile.storageId) await ctx.storage.delete(profile.storageId);
    await ctx.db.patch(profile._id, {
      voiceState: "revoked", revokedAt: Date.now(), updatedAt: Date.now(),
      enrollmentVersion: (profile.enrollmentVersion ?? 0) + 1,
      voiceprint: undefined, storageId: undefined, jobId: undefined, requestId: undefined, message: undefined,
    });
    return null;
  },
});

export const authorizeUpload = internalQuery({
  args: {},
  handler: async (ctx) => {
    const { subject } = await requireIdentity(ctx);
    const profile = await ctx.db.query("familyProfiles").withIndex("by_subject", (q) => q.eq("subject", subject)).unique();
    if (!profile) throw new ConvexError("Introduce yourself first.");
    if (!process.env.PYANNOTE_API_KEY) throw new ConvexError("Voice processing is not configured.");
    return { version: profile.enrollmentVersion ?? 0 };
  },
});

// Only authenticated HTTP ingestion can supply a storage ID. Ownership comes from the JWT, never the URL.
export const accept = internalMutation({
  args: { storageId: v.id("_storage"), requestId: v.string(), consent: v.boolean(), expectedVersion: v.number() },
  handler: async (ctx, args) => {
    const { subject } = await requireIdentity(ctx);
    if (!args.consent) throw new ConvexError("Separate voice enrollment consent is required.");
    if (!/^[\da-f-]{36}$/i.test(args.requestId)) throw new ConvexError("Invalid sample identifier.");
    if (!process.env.PYANNOTE_API_KEY) throw new ConvexError("Voice processing is not configured.");
    const profile = await ctx.db.query("familyProfiles").withIndex("by_subject", (q) => q.eq("subject", subject)).unique();
    if (!profile) throw new ConvexError("Introduce yourself first.");
    if (profile.requestId === args.requestId) return { duplicate: true };
    if ((profile.enrollmentVersion ?? 0) !== args.expectedVersion) throw new ConvexError("Your voice consent changed. Please try again.");
    if (["queued", "processing", "enrolled"].includes(profile.voiceState)) throw new ConvexError("Remove the existing voice profile before replacing it.");
    if (profile.storageId) await ctx.storage.delete(profile.storageId);
    await ctx.db.patch(profile._id, {
      voiceState: "queued", storageId: args.storageId, requestId: args.requestId,
      consentAt: Date.now(), policyVersion: VOICE_POLICY, revokedAt: undefined,
      message: undefined, voiceprint: undefined, jobId: undefined, model: "precision-2", updatedAt: Date.now(),
      enrollmentVersion: args.expectedVersion + 1,
    });
    await ctx.scheduler.runAfter(0, startRef, { profileId: profile._id, requestId: args.requestId });
    return { duplicate: false };
  },
});

export const claim = internalMutation({
  args: jobArgs,
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (!profile || profile.requestId !== args.requestId || profile.voiceState !== "queued" || profile.revokedAt || !profile.consentAt) return null;
    await ctx.db.patch(profile._id, { voiceState: "processing" });
    return profile.storageId ?? null;
  },
});

export const readJob = internalQuery({
  args: jobArgs,
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (!profile || profile.requestId !== args.requestId || profile.voiceState !== "processing" || profile.revokedAt || !profile.consentAt) return null;
    return profile.jobId ?? null;
  },
});

export const setJob = internalMutation({
  args: { ...jobArgs, jobId: v.string() },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (!profile || profile.requestId !== args.requestId || profile.voiceState !== "processing" || profile.revokedAt) return;
    await ctx.db.patch(profile._id, { jobId: args.jobId });
    await ctx.scheduler.runAfter(5000, pollRef, { profileId: profile._id, requestId: args.requestId, attempt: 0 });
  },
});

export const finish = internalMutation({
  args: { ...jobArgs, voiceprint: v.optional(v.string()), message: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (!profile || profile.requestId !== args.requestId || profile.voiceState !== "processing" || profile.revokedAt || !profile.consentAt) return;
    if (profile.storageId) await ctx.storage.delete(profile.storageId);
    await ctx.db.patch(profile._id, {
      voiceState: args.voiceprint ? "enrolled" : "failed", voiceprint: args.voiceprint,
      message: args.message, storageId: undefined, jobId: undefined, updatedAt: Date.now(),
    });
  },
});

async function provider(path: string, body?: object) {
  const key = process.env.PYANNOTE_API_KEY;
  if (!key) throw new Error("Voice processing is not configured.");
  const response = await fetch(`https://api.pyannote.ai/v1/${path}`, {
    method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("Voice service unavailable.");
  return response.json();
}

export const start = internalAction({
  args: jobArgs,
  handler: async (ctx, args) => {
    const storageId = await ctx.runMutation(claimRef, args);
    if (!storageId) return;
    try {
      const url = await ctx.storage.getUrl(storageId);
      if (!url) throw new Error("Sample expired.");
      const result = await provider("voiceprint", { url, model: "precision-2" });
      if (typeof result.jobId !== "string" || !result.jobId) throw new Error("Invalid job response.");
      await ctx.runMutation(jobRef, { ...args, jobId: result.jobId });
    } catch {
      // Never log audio URLs, keys, voiceprints, or provider error bodies.
      await ctx.runMutation(finishRef, { ...args, message: "Your voice profile couldn’t be created. Record a new sample and try again." });
    }
  },
});

export const poll = internalAction({
  args: { ...jobArgs, attempt: v.number() },
  handler: async (ctx, { attempt, ...args }) => {
    const jobId = await ctx.runQuery(readRef, args);
    if (!jobId) return;
    if (attempt >= 60) {
      await ctx.runMutation(finishRef, { ...args, message: "Voice processing timed out. Please record a new sample." });
      return;
    }
    try {
      const result = await provider(`jobs/${encodeURIComponent(jobId)}`);
      if (result.jobId !== jobId) throw new Error("Job mismatch.");
      if (result.status === "succeeded") {
        const voiceprint = result.output?.voiceprint;
        if (result.output?.error || result.output?.warning || typeof voiceprint !== "string" || !voiceprint.length || voiceprint.length > 200_000) {
          await ctx.runMutation(finishRef, { ...args, message: "This sample needs another take. Use a quiet room and only your own voice." });
        } else await ctx.runMutation(finishRef, { ...args, voiceprint });
        return;
      }
      if (["failed", "canceled"].includes(result.status)) {
        await ctx.runMutation(finishRef, { ...args, message: "Your sample couldn’t be processed. Record a new sample and try again." });
        return;
      }
    } catch { /* Transient errors get a bounded retry; no provider payloads are exposed. */ }
    await ctx.scheduler.runAfter(5000, pollRef, { ...args, attempt: attempt + 1 });
  },
});

// Recovery if a scheduled action fails before it can finalize its sample.
export const expireSamples = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const state of ["queued", "processing"] as const) {
      const profiles = await ctx.db.query("familyProfiles").withIndex("by_voice_state", (q) => q.eq("voiceState", state).lt("updatedAt", Date.now() - 60 * 60_000)).take(100);
      for (const profile of profiles) {
        if (profile.storageId) await ctx.storage.delete(profile.storageId);
        await ctx.db.patch(profile._id, { voiceState: "failed", storageId: undefined, jobId: undefined, updatedAt: Date.now(), message: "This sample expired. Please record a new one." });
      }
    }
  },
});
