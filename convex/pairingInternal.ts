import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { authorizeActorAndSenior } from "./lib/access";
import { seniorIdValidator } from "./lib/validators";

export const storePairingCode = internalMutation({
  args: {
    seniorId: seniorIdValidator,
    caregiverId: v.id("users"),
    codeHash: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const { senior } = await authorizeActorAndSenior(ctx, args.caregiverId, args.seniorId);
    if (senior.clerkId !== undefined) throw new Error("This senior record has already been paired.");
    const existingCodes = await ctx.db.query("pairingCodes")
      .withIndex("by_senior", (q) => q.eq("seniorId", args.seniorId))
      .collect();
    for (const existing of existingCodes) {
      if (existing.consumedAt === undefined && existing.revokedAt === undefined) {
        await ctx.db.patch(existing._id, { revokedAt: Date.now() });
      }
    }
    await ctx.db.insert("pairingCodes", {
      seniorId: args.seniorId,
      createdByCaregiverId: args.caregiverId,
      codeHash: args.codeHash,
      createdAt: Date.now(),
      expiresAt: args.expiresAt,
    });
  },
});

export const consumePairingCode = internalMutation({
  args: { codeHash: v.string(), clerkId: v.string() },
  handler: async (ctx, args) => {
    const pairing = await ctx.db.query("pairingCodes")
      .withIndex("by_hash", (q) => q.eq("codeHash", args.codeHash))
      .unique();
    if (!pairing) throw new Error("Pairing code is invalid or expired.");

    if (pairing.consumedAt !== undefined) {
      if (pairing.claimedByClerkId === args.clerkId) return pairing.seniorId;
      throw new Error("Pairing code has already been used.");
    }
    if (pairing.revokedAt !== undefined || pairing.expiresAt <= Date.now()) {
      throw new Error("Pairing code is invalid or expired.");
    }

    const { senior } = await authorizeActorAndSenior(ctx, pairing.createdByCaregiverId, pairing.seniorId);
    if (senior.clerkId !== undefined) throw new Error("This senior record has already been claimed.");
    const existingUser = await ctx.db.query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique();
    if (existingUser) throw new Error("This Clerk account already has a Snow profile.");

    const now = Date.now();
    await ctx.db.patch(senior._id, { clerkId: args.clerkId, updatedAt: now });
    await ctx.db.patch(pairing._id, { consumedAt: now, claimedByClerkId: args.clerkId });
    return senior._id;
  },
});
