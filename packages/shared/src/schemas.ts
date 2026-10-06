import { z } from "zod";

export const userRoleSchema = z.enum(["senior", "caregiver"]);
export const medicationLogStatusSchema = z.enum(["taken", "skipped"]);
export const sessionStatusSchema = z.enum(["active", "completed"]);
export const billStatusSchema = z.enum(["unpaid", "paid"]);
export const messageRoleSchema = z.enum(["user", "assistant"]);

export const scheduleEntrySchema = z.object({
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1),
  times: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).min(1),
});

export const seniorProfileSchema = z.object({
  name: z.string().trim().min(1).max(120),
  preferredName: z.string().trim().max(120).optional(),
  dateOfBirth: z.string().date().optional(),
  timezone: z.string().trim().min(1).max(80).default("UTC"),
  allergies: z.array(z.string().trim().min(1).max(200)).default([]),
  primaryDoctor: z.string().trim().max(240).optional(),
  pharmacy: z.string().trim().max(240).optional(),
  address: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(4000).optional(),
});

export const medicationInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  dosage: z.string().trim().min(1).max(160),
  instructions: z.string().trim().max(1000).default(""),
  schedule: z.array(scheduleEntrySchema).min(1),
  active: z.boolean().default(true),
});

export const emergencyContactInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  relationship: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(3).max(40),
  notes: z.string().trim().max(1000).optional(),
  sortOrder: z.number().int().default(0),
});

export const billInputSchema = z.object({
  payee: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(500),
  amountCents: z.number().int().nonnegative(),
  dueAt: z.number().int().nonnegative(),
  status: billStatusSchema.default("unpaid"),
  paidAt: z.number().int().nonnegative().optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const logMedicationToolInputSchema = z.object({
  medicationId: z.string().min(1),
  status: medicationLogStatusSchema,
  note: z.string().trim().max(500).optional(),
});

export const markBillPaidToolInputSchema = z.object({
  billId: z.string().min(1),
});

export const emptyToolInputSchema = z.object({});

export const pairingCodeInputSchema = z.object({
  seniorId: z.string().min(1),
});

export const claimPairingCodeInputSchema = z.object({
  code: z.string().trim().min(6).max(12).transform((value) => value.toUpperCase()),
});

export const cardPayloadSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("medication_schedule"),
    title: z.string(),
    items: z.array(z.object({
      medicationId: z.string(),
      name: z.string(),
      dosage: z.string(),
      instructions: z.string(),
      schedule: z.array(scheduleEntrySchema),
    })),
  }),
  z.object({
    type: z.literal("emergency_contacts"),
    title: z.string(),
    items: z.array(z.object({
      name: z.string(),
      relationship: z.string(),
      phone: z.string(),
    })),
  }),
  z.object({
    type: z.literal("unpaid_bills"),
    title: z.string(),
    items: z.array(z.object({
      billId: z.string(),
      payee: z.string(),
      description: z.string(),
      amountCents: z.number().int(),
      dueAt: z.number().int(),
    })),
  }),
]);

export const startSessionInputSchema = z.object({});
export const endSessionInputSchema = z.object({ sessionId: z.string().min(1) });

export type UserRole = z.infer<typeof userRoleSchema>;
export type SeniorProfileInput = z.infer<typeof seniorProfileSchema>;
export type MedicationInput = z.infer<typeof medicationInputSchema>;
export type EmergencyContactInput = z.infer<typeof emergencyContactInputSchema>;
export type BillInput = z.infer<typeof billInputSchema>;
export type CardPayload = z.infer<typeof cardPayloadSchema>;
