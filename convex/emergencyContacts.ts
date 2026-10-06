import { emergencyContactInputSchema } from "@snow/shared";
import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { authorizeSession } from "./lib/access";
import { requireCurrentUser, requireSeniorAccess } from "./lib/auth";
import { contactIdValidator, seniorIdValidator, sessionIdValidator } from "./lib/validators";

const contactInputValidator = v.object({
  name: v.string(),
  relationship: v.string(),
  phone: v.string(),
  notes: v.optional(v.string()),
  sortOrder: v.number(),
});

export const list = query({
  args: { seniorId: seniorIdValidator },
  handler: async (ctx, args) => {
    const actor = await requireCurrentUser(ctx);
    await requireSeniorAccess(ctx, actor, args.seniorId);
    return await ctx.db.query("emergencyContacts")
      .withIndex("by_senior", (q) => q.eq("seniorId", args.seniorId))
      .collect();
  },
});

export const create = mutation({
  args: { seniorId: seniorIdValidator, contact: contactInputValidator },
  handler: async (ctx, args) => {
    const caregiver = await requireCurrentUser(ctx, "caregiver");
    await requireSeniorAccess(ctx, caregiver, args.seniorId);
    const contact = emergencyContactInputSchema.parse(args.contact);
    const now = Date.now();
    return await ctx.db.insert("emergencyContacts", {
      name: contact.name,
      relationship: contact.relationship,
      phone: contact.phone,
      seniorId: args.seniorId,
      createdAt: now,
      updatedAt: now,
      ...(contact.notes === undefined ? {} : { notes: contact.notes }),
      sortOrder: contact.sortOrder,
    });
  },
});

export const update = mutation({
  args: { seniorId: seniorIdValidator, contactId: contactIdValidator, contact: contactInputValidator },
  handler: async (ctx, args) => {
    const caregiver = await requireCurrentUser(ctx, "caregiver");
    await requireSeniorAccess(ctx, caregiver, args.seniorId);
    const existing = await ctx.db.get(args.contactId);
    if (!existing || existing.seniorId !== args.seniorId) throw new Error("Emergency contact not found.");
    const contact = emergencyContactInputSchema.parse(args.contact);
    await ctx.db.patch(existing._id, { ...contact, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { seniorId: seniorIdValidator, contactId: contactIdValidator },
  handler: async (ctx, args) => {
    const caregiver = await requireCurrentUser(ctx, "caregiver");
    await requireSeniorAccess(ctx, caregiver, args.seniorId);
    const existing = await ctx.db.get(args.contactId);
    if (!existing || existing.seniorId !== args.seniorId) throw new Error("Emergency contact not found.");
    await ctx.db.delete(existing._id);
  },
});

export const listForActiveSession = internalQuery({
  args: { sessionId: sessionIdValidator, actorId: v.id("users") },
  handler: async (ctx, args) => {
    const { senior } = await authorizeSession(ctx, args.actorId, args.sessionId);
    return await ctx.db.query("emergencyContacts")
      .withIndex("by_senior", (q) => q.eq("seniorId", senior._id))
      .collect();
  },
});
