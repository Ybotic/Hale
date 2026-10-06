import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { cardPayloadValidator } from "./lib/cardValidator";

export default defineSchema({
  users: defineTable({
    clerkId: v.optional(v.string()),
    role: v.union(v.literal("senior"), v.literal("caregiver")),
    name: v.string(),
    preferredName: v.optional(v.string()),
    dateOfBirth: v.optional(v.string()),
    timezone: v.string(),
    allergies: v.array(v.string()),
    primaryDoctor: v.optional(v.string()),
    pharmacy: v.optional(v.string()),
    address: v.optional(v.string()),
    notes: v.optional(v.string()),
    deletingAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_role", ["role"]),

  caregiverLinks: defineTable({
    caregiverId: v.id("users"),
    seniorId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_caregiver", ["caregiverId"])
    .index("by_senior", ["seniorId"])
    .index("by_caregiver_senior", ["caregiverId", "seniorId"]),

  pairingCodes: defineTable({
    seniorId: v.id("users"),
    createdByCaregiverId: v.id("users"),
    codeHash: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    consumedAt: v.optional(v.number()),
    claimedByClerkId: v.optional(v.string()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_hash", ["codeHash"])
    .index("by_senior", ["seniorId"]),

  medications: defineTable({
    seniorId: v.id("users"),
    name: v.string(),
    dosage: v.string(),
    instructions: v.string(),
    schedule: v.array(v.object({
      daysOfWeek: v.array(v.number()),
      times: v.array(v.string()),
    })),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_senior", ["seniorId"]),

  medicationLogs: defineTable({
    seniorId: v.id("users"),
    medicationId: v.id("medications"),
    status: v.union(v.literal("taken"), v.literal("skipped")),
    occurredAt: v.number(),
    loggedByUserId: v.id("users"),
    note: v.optional(v.string()),
  })
    .index("by_senior", ["seniorId"])
    .index("by_medication", ["medicationId"]),

  emergencyContacts: defineTable({
    seniorId: v.id("users"),
    name: v.string(),
    relationship: v.string(),
    phone: v.string(),
    notes: v.optional(v.string()),
    sortOrder: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_senior", ["seniorId"]),

  bills: defineTable({
    seniorId: v.id("users"),
    payee: v.string(),
    description: v.string(),
    amountCents: v.number(),
    dueAt: v.number(),
    status: v.union(v.literal("unpaid"), v.literal("paid")),
    paidAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_senior", ["seniorId"]),

  sessions: defineTable({
    seniorId: v.id("users"),
    status: v.union(v.literal("active"), v.literal("completed")),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_senior", ["seniorId"])
    .index("by_senior_status", ["seniorId", "status"]),

  messages: defineTable({
    sessionId: v.id("sessions"),
    seniorId: v.id("users"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    text: v.string(),
    audioStorageId: v.optional(v.id("_storage")),
    audioExpiresAt: v.optional(v.number()),
    card: v.optional(cardPayloadValidator),
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_senior", ["seniorId"])
    .index("by_audio_expiration", ["audioExpiresAt"]),

  voiceUploads: defineTable({
    seniorId: v.id("users"),
    sessionId: v.id("sessions"),
    storageId: v.id("_storage"),
    uploadedAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_storage_id", ["storageId"])
    .index("by_senior", ["seniorId"])
    .index("by_expiration", ["expiresAt"]),
});
