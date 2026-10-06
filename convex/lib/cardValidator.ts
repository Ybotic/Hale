import { v } from "convex/values";

export const cardPayloadValidator = v.union(
  v.object({
    type: v.literal("medication_schedule"),
    title: v.string(),
    items: v.array(v.object({
      medicationId: v.string(),
      name: v.string(),
      dosage: v.string(),
      instructions: v.string(),
      schedule: v.array(v.object({ daysOfWeek: v.array(v.number()), times: v.array(v.string()) })),
    })),
  }),
  v.object({
    type: v.literal("emergency_contacts"),
    title: v.string(),
    items: v.array(v.object({ name: v.string(), relationship: v.string(), phone: v.string() })),
  }),
  v.object({
    type: v.literal("unpaid_bills"),
    title: v.string(),
    items: v.array(v.object({
      billId: v.string(),
      payee: v.string(),
      description: v.string(),
      amountCents: v.number(),
      dueAt: v.number(),
    })),
  }),
);
