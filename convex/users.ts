import { seniorProfileSchema } from "@snow/shared";
import { v } from "convex/values";
import { action, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireCurrentUser, requireIdentity, roleClaim, requireSeniorAccess } from "./lib/auth";
import { seniorIdValidator } from "./lib/validators";

const profileValidator = v.object({
  name: v.string(),
  preferredName: v.optional(v.string()),
  dateOfBirth: v.optional(v.string()),
  timezone: v.string(),
  allergies: v.array(v.string()),
  primaryDoctor: v.optional(v.string()),
  pharmacy: v.optional(v.string()),
  address: v.optional(v.string()),
  notes: v.optional(v.string()),
});

export const ensureCurrentCaregiver = mutation({
  args: { name: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    if (roleClaim(identity) !== "caregiver") {
      throw new Error("Only a provisioned caregiver can create a caregiver profile.");
    }
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (existing) {
      if (existing.role !== "caregiver") throw new Error("Account role does not match its profile.");
      return existing._id;
    }

    const now = Date.now();
    const validatedName = args.name?.trim() || identity.name?.trim() || "Caregiver";
    return await ctx.db.insert("users", {
      clerkId: identity.subject,
      role: "caregiver",
      name: validatedName,
      timezone: "UTC",
      allergies: [],
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const listMySeniors = query({
  args: {},
  handler: async (ctx) => {
    const caregiver = await requireCurrentUser(ctx, "caregiver");
    const links = await ctx.db
      .query("caregiverLinks")
      .withIndex("by_caregiver", (q) => q.eq("caregiverId", caregiver._id))
      .collect();
    const seniors = await Promise.all(links.map(async (link) => {
      const senior = await ctx.db.get(link.seniorId);
      if (!senior || senior.role !== "senior") return null;
      return { ...senior, paired: senior.clerkId !== undefined };
    }));
    return seniors.filter((senior) => senior !== null);
  },
});

export const getSeniorProfile = query({
  args: { seniorId: seniorIdValidator },
  handler: async (ctx, args) => {
    const actor = await requireCurrentUser(ctx);
    return await requireSeniorAccess(ctx, actor, args.seniorId);
  },
});

export const hasCurrentSeniorProfile = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    if (roleClaim(identity) !== "senior") return false;
    const user = await ctx.db.query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    return user?.role === "senior" && user.deletingAt === undefined;
  },
});

export const createSenior = mutation({
  args: { profile: profileValidator },
  handler: async (ctx, args) => {
    const caregiver = await requireCurrentUser(ctx, "caregiver");
    const profile = seniorProfileSchema.parse(args.profile);
    const now = Date.now();
    const seniorId = await ctx.db.insert("users", {
      name: profile.name,
      timezone: profile.timezone,
      allergies: profile.allergies,
      role: "senior",
      createdAt: now,
      updatedAt: now,
      ...(profile.preferredName === undefined ? {} : { preferredName: profile.preferredName }),
      ...(profile.dateOfBirth === undefined ? {} : { dateOfBirth: profile.dateOfBirth }),
      ...(profile.primaryDoctor === undefined ? {} : { primaryDoctor: profile.primaryDoctor }),
      ...(profile.pharmacy === undefined ? {} : { pharmacy: profile.pharmacy }),
      ...(profile.address === undefined ? {} : { address: profile.address }),
      ...(profile.notes === undefined ? {} : { notes: profile.notes }),
    });
    await ctx.db.insert("caregiverLinks", {
      caregiverId: caregiver._id,
      seniorId,
      createdAt: now,
    });
    return seniorId;
  },
});

export const updateSeniorProfile = mutation({
  args: { seniorId: seniorIdValidator, profile: profileValidator },
  handler: async (ctx, args) => {
    const actor = await requireCurrentUser(ctx);
    const senior = await requireSeniorAccess(ctx, actor, args.seniorId);
    const profile = seniorProfileSchema.parse(args.profile);
    await ctx.db.patch(senior._id, { ...profile, updatedAt: Date.now() });
  },
});

export const deleteSenior = action({
  args: { seniorId: seniorIdValidator },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || roleClaim(identity) !== "caregiver") {
      throw new Error("Only a caregiver can delete a senior profile.");
    }
    const caregiver = await ctx.runQuery(internal.users.getActorByClerkId, {
      clerkId: identity.subject,
      expectedRole: "caregiver",
    });
    await ctx.runAction(internal.deletion.deleteSeniorData, {
      seniorId: args.seniorId,
      caregiverId: caregiver._id,
    });
  },
});

export const getActorByClerkId = internalQuery({
  args: { clerkId: v.string(), expectedRole: v.union(v.literal("senior"), v.literal("caregiver")) },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique();
    if (!user || user.role !== args.expectedRole) throw new Error("Snow profile not found.");
    return user;
  },
});
