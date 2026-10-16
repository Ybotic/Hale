import { ConvexError, type GenericId } from "convex/values";
import type { Capability } from "@mnemo/contracts";
import type { QueryCtx } from "./lib/functions";

export async function requireIdentity(ctx: Pick<QueryCtx, "auth">) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Please sign in.");
  return identity;
}

export async function requireMember(ctx: QueryCtx, patientId: GenericId<"patients">, capability: Capability) {
  const identity = await requireIdentity(ctx);
  const membership = await ctx.db.query("memberships").withIndex("by_patient_subject", (q) =>
    q.eq("patientId", patientId).eq("subject", identity.subject),
  ).unique();
  if (!membership?.active || !membership.capabilities.includes(capability)) {
    throw new ConvexError("You don’t have permission to access this patient space.");
  }
  const patient = await ctx.db.get(patientId);
  if (!patient) throw new ConvexError("Patient space unavailable.");
  return { identity, membership, patient };
}

export async function requireRecordingConsent(ctx: QueryCtx, patientId: GenericId<"patients">, subject: string) {
  const consents = await ctx.db.query("consents").withIndex("by_patient_subject", (q) =>
    q.eq("patientId", patientId).eq("subject", subject),
  ).collect();
  if (!consents.some((consent) => consent.purpose === "recording" && !consent.revokedAt)) {
    throw new ConvexError("Recording consent is required.");
  }
}
