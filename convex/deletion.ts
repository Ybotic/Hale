import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { authorizeActorAndSenior } from "./lib/access";
import { seniorIdValidator } from "./lib/validators";

const batchKindValidator = v.union(
  v.literal("messages"),
  v.literal("medicationLogs"),
  v.literal("medications"),
  v.literal("emergencyContacts"),
  v.literal("bills"),
  v.literal("pairingCodes"),
  v.literal("sessions"),
  v.literal("voiceUploads"),
);
const BATCH_SIZE = 100;

export const deleteBatch = internalMutation({
  args: { seniorId: seniorIdValidator, caregiverId: v.id("users"), kind: batchKindValidator },
  handler: async (ctx, args) => {
    await authorizeActorAndSenior(ctx, args.caregiverId, args.seniorId, true);
    switch (args.kind) {
      case "messages": {
        const rows = await ctx.db.query("messages")
          .withIndex("by_senior", (q) => q.eq("seniorId", args.seniorId)).take(BATCH_SIZE);
        for (const row of rows) {
          if (row.audioStorageId) await ctx.storage.delete(row.audioStorageId);
          await ctx.db.delete(row._id);
        }
        return rows.length;
      }
      case "medicationLogs": {
        const rows = await ctx.db.query("medicationLogs")
          .withIndex("by_senior", (q) => q.eq("seniorId", args.seniorId)).take(BATCH_SIZE);
        for (const row of rows) await ctx.db.delete(row._id);
        return rows.length;
      }
      case "medications": {
        const rows = await ctx.db.query("medications")
          .withIndex("by_senior", (q) => q.eq("seniorId", args.seniorId)).take(BATCH_SIZE);
        for (const row of rows) await ctx.db.delete(row._id);
        return rows.length;
      }
      case "emergencyContacts": {
        const rows = await ctx.db.query("emergencyContacts")
          .withIndex("by_senior", (q) => q.eq("seniorId", args.seniorId)).take(BATCH_SIZE);
        for (const row of rows) await ctx.db.delete(row._id);
        return rows.length;
      }
      case "bills": {
        const rows = await ctx.db.query("bills")
          .withIndex("by_senior", (q) => q.eq("seniorId", args.seniorId)).take(BATCH_SIZE);
        for (const row of rows) await ctx.db.delete(row._id);
        return rows.length;
      }
      case "pairingCodes": {
        const rows = await ctx.db.query("pairingCodes")
          .withIndex("by_senior", (q) => q.eq("seniorId", args.seniorId)).take(BATCH_SIZE);
        for (const row of rows) await ctx.db.delete(row._id);
        return rows.length;
      }
      case "sessions": {
        const rows = await ctx.db.query("sessions")
          .withIndex("by_senior", (q) => q.eq("seniorId", args.seniorId)).take(BATCH_SIZE);
        for (const row of rows) await ctx.db.delete(row._id);
        return rows.length;
      }
      case "voiceUploads": {
        const rows = await ctx.db.query("voiceUploads")
          .withIndex("by_senior", (q) => q.eq("seniorId", args.seniorId)).take(BATCH_SIZE);
        for (const row of rows) {
          await ctx.storage.delete(row.storageId);
          await ctx.db.delete(row._id);
        }
        return rows.length;
      }
      default:
        throw new Error("Unsupported senior deletion batch.");
    }
  },
});

export const beginSeniorDeletion = internalMutation({
  args: { seniorId: seniorIdValidator, caregiverId: v.id("users") },
  handler: async (ctx, args) => {
    const { senior } = await authorizeActorAndSenior(ctx, args.caregiverId, args.seniorId, true);
    const links = await ctx.db.query("caregiverLinks")
      .withIndex("by_senior", (q) => q.eq("seniorId", senior._id))
      .collect();
    if (links.length !== 1 || links[0]?.caregiverId !== args.caregiverId) {
      throw new Error("A senior profile can be deleted only by its sole linked caregiver.");
    }
    const activeSessions = await ctx.db.query("sessions")
      .withIndex("by_senior_status", (q) => q.eq("seniorId", senior._id).eq("status", "active"))
      .collect();
    const now = Date.now();
    for (const session of activeSessions) {
      await ctx.db.patch(session._id, { status: "completed", completedAt: now });
    }
    if (senior.deletingAt === undefined) {
      await ctx.db.patch(senior._id, { deletingAt: now, updatedAt: now });
    }
  },
});

export const finishSeniorDeletion = internalMutation({
  args: { seniorId: seniorIdValidator, caregiverId: v.id("users") },
  handler: async (ctx, args) => {
    const { senior } = await authorizeActorAndSenior(ctx, args.caregiverId, args.seniorId, true);
    const links = await ctx.db.query("caregiverLinks")
      .withIndex("by_senior", (q) => q.eq("seniorId", senior._id)).collect();
    if (links.length !== 1 || links[0]?.caregiverId !== args.caregiverId) {
      throw new Error("A senior profile can be deleted only by its sole linked caregiver.");
    }
    await ctx.db.delete(links[0]._id);
    await ctx.db.delete(senior._id);
  },
});

export const deleteSeniorData = internalAction({
  args: { seniorId: seniorIdValidator, caregiverId: v.id("users") },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.deletion.beginSeniorDeletion, args);
    const kinds = ["messages", "voiceUploads", "medicationLogs", "medications", "emergencyContacts", "bills", "pairingCodes", "sessions"] as const;
    for (const kind of kinds) {
      while (true) {
        const deleted = await ctx.runMutation(internal.deletion.deleteBatch, { ...args, kind });
        if (deleted < BATCH_SIZE) break;
      }
    }
    await ctx.runMutation(internal.deletion.finishSeniorDeletion, args);
  },
});
