import { billInputSchema } from "@snow/shared";
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { authorizeSession } from "./lib/access";
import { requireCurrentUser, requireSeniorAccess } from "./lib/auth";
import { billIdValidator, seniorIdValidator, sessionIdValidator } from "./lib/validators";

const billInputValidator = v.object({
  payee: v.string(),
  description: v.string(),
  amountCents: v.number(),
  dueAt: v.number(),
  status: v.union(v.literal("unpaid"), v.literal("paid")),
  paidAt: v.optional(v.number()),
  notes: v.optional(v.string()),
});

export const list = query({
  args: { seniorId: seniorIdValidator },
  handler: async (ctx, args) => {
    const actor = await requireCurrentUser(ctx);
    await requireSeniorAccess(ctx, actor, args.seniorId);
    return await ctx.db.query("bills")
      .withIndex("by_senior", (q) => q.eq("seniorId", args.seniorId))
      .collect();
  },
});

export const create = mutation({
  args: { seniorId: seniorIdValidator, bill: billInputValidator },
  handler: async (ctx, args) => {
    const caregiver = await requireCurrentUser(ctx, "caregiver");
    await requireSeniorAccess(ctx, caregiver, args.seniorId);
    const bill = billInputSchema.parse(args.bill);
    const now = Date.now();
    const record = {
      seniorId: args.seniorId,
      payee: bill.payee,
      description: bill.description,
      amountCents: bill.amountCents,
      dueAt: bill.dueAt,
      status: bill.status,
      createdAt: now,
      updatedAt: now,
    };
    const withOptional = {
      ...record,
      ...(bill.paidAt === undefined ? {} : { paidAt: bill.paidAt }),
      ...(bill.notes === undefined ? {} : { notes: bill.notes }),
    };
    return await ctx.db.insert("bills", withOptional);
  },
});

export const update = mutation({
  args: { seniorId: seniorIdValidator, billId: billIdValidator, bill: billInputValidator },
  handler: async (ctx, args) => {
    const caregiver = await requireCurrentUser(ctx, "caregiver");
    await requireSeniorAccess(ctx, caregiver, args.seniorId);
    const existing = await ctx.db.get(args.billId);
    if (!existing || existing.seniorId !== args.seniorId) throw new Error("Bill not found.");
    const bill = billInputSchema.parse(args.bill);
    await ctx.db.patch(existing._id, {
      payee: bill.payee,
      description: bill.description,
      amountCents: bill.amountCents,
      dueAt: bill.dueAt,
      status: bill.status,
      paidAt: bill.status === "paid" ? bill.paidAt ?? Date.now() : undefined,
      notes: bill.notes,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { seniorId: seniorIdValidator, billId: billIdValidator },
  handler: async (ctx, args) => {
    const caregiver = await requireCurrentUser(ctx, "caregiver");
    await requireSeniorAccess(ctx, caregiver, args.seniorId);
    const existing = await ctx.db.get(args.billId);
    if (!existing || existing.seniorId !== args.seniorId) throw new Error("Bill not found.");
    await ctx.db.delete(existing._id);
  },
});

export const listUnpaidForActiveSession = internalQuery({
  args: { sessionId: sessionIdValidator, actorId: v.id("users") },
  handler: async (ctx, args) => {
    const { senior } = await authorizeSession(ctx, args.actorId, args.sessionId);
    const bills = await ctx.db.query("bills")
      .withIndex("by_senior", (q) => q.eq("seniorId", senior._id))
      .collect();
    return bills.filter((bill) => bill.status === "unpaid");
  },
});

export const markPaidFromActiveSession = internalMutation({
  args: { sessionId: sessionIdValidator, actorId: v.id("users"), billId: billIdValidator },
  handler: async (ctx, args) => {
    const { senior } = await authorizeSession(ctx, args.actorId, args.sessionId);
    const bill = await ctx.db.get(args.billId);
    if (!bill || bill.seniorId !== senior._id) throw new Error("Bill not found for this senior.");
    if (bill.status === "paid") return { payee: bill.payee, alreadyPaid: true };
    await ctx.db.patch(bill._id, { status: "paid", paidAt: Date.now(), updatedAt: Date.now() });
    return { payee: bill.payee, alreadyPaid: false };
  },
});
