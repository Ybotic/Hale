import { medicationInputSchema } from "@care/shared";
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { authorizeSession } from "./lib/access";
import { requireCurrentUser, requireSeniorAccess } from "./lib/auth";
import { medicationIdValidator, scheduleValidator, seniorIdValidator, sessionIdValidator } from "./lib/validators";

const medicationInputValidator = v.object({
  name: v.string(),
  dosage: v.string(),
  instructions: v.string(),
  schedule: scheduleValidator,
  active: v.boolean(),
});

export const list = query({
  args: { seniorId: seniorIdValidator },
  handler: async (ctx, args) => {
    const actor = await requireCurrentUser(ctx);
    await requireSeniorAccess(ctx, actor, args.seniorId);
    return await ctx.db.query("medications")
      .withIndex("by_senior", (q) => q.eq("seniorId", args.seniorId))
      .collect();
  },
});

export const create = mutation({
  args: { seniorId: seniorIdValidator, medication: medicationInputValidator },
  handler: async (ctx, args) => {
    const caregiver = await requireCurrentUser(ctx, "caregiver");
    await requireSeniorAccess(ctx, caregiver, args.seniorId);
    const medication = medicationInputSchema.parse(args.medication);
    const now = Date.now();
    return await ctx.db.insert("medications", { ...medication, seniorId: args.seniorId, createdAt: now, updatedAt: now });
  },
});

export const update = mutation({
  args: { medicationId: medicationIdValidator, seniorId: seniorIdValidator, medication: medicationInputValidator },
  handler: async (ctx, args) => {
    const caregiver = await requireCurrentUser(ctx, "caregiver");
    await requireSeniorAccess(ctx, caregiver, args.seniorId);
    const existing = await ctx.db.get(args.medicationId);
    if (!existing || existing.seniorId !== args.seniorId) throw new Error("Medication not found.");
    const medication = medicationInputSchema.parse(args.medication);
    await ctx.db.patch(existing._id, { ...medication, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { medicationId: medicationIdValidator, seniorId: seniorIdValidator },
  handler: async (ctx, args) => {
    const caregiver = await requireCurrentUser(ctx, "caregiver");
    await requireSeniorAccess(ctx, caregiver, args.seniorId);
    const existing = await ctx.db.get(args.medicationId);
    if (!existing || existing.seniorId !== args.seniorId) throw new Error("Medication not found.");
    const logs = await ctx.db.query("medicationLogs")
      .withIndex("by_medication", (q) => q.eq("medicationId", existing._id))
      .collect();
    for (const log of logs) await ctx.db.delete(log._id);
    await ctx.db.delete(existing._id);
  },
});

export const listForActiveSession = internalQuery({
  args: { sessionId: sessionIdValidator, actorId: v.id("users") },
  handler: async (ctx, args) => {
    const { senior } = await authorizeSession(ctx, args.actorId, args.sessionId);
    return await ctx.db.query("medications")
      .withIndex("by_senior", (q) => q.eq("seniorId", senior._id))
      .collect()
      .then((items) => items.filter((item) => item.active));
  },
});

export const logFromActiveSession = internalMutation({
  args: {
    sessionId: sessionIdValidator,
    actorId: v.id("users"),
    medicationId: medicationIdValidator,
    status: v.union(v.literal("taken"), v.literal("skipped")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { actor, senior } = await authorizeSession(ctx, args.actorId, args.sessionId);
    const medication = await ctx.db.get(args.medicationId);
    if (!medication || medication.seniorId !== senior._id || !medication.active) {
      throw new Error("That medication is not active for this senior.");
    }
    const log = {
      seniorId: senior._id,
      medicationId: medication._id,
      status: args.status,
      occurredAt: Date.now(),
      loggedByUserId: actor._id,
    };
    const logId = await ctx.db.insert("medicationLogs", args.note === undefined ? log : { ...log, note: args.note });
    return { logId, medicationName: medication.name, status: args.status };
  },
});
