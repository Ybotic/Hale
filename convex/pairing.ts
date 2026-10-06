import { claimPairingCodeInputSchema } from "@snow/shared";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { roleClaim } from "./lib/auth";
import { seniorIdValidator } from "./lib/validators";

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const PAIRING_CODE_LIFETIME_MS = 10 * 60 * 1000;

async function hashCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function setClerkSeniorRole(clerkId: string): Promise<void> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error("Set CLERK_SECRET_KEY in the Convex environment to finish pairing.");
  const response = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(clerkId)}/metadata`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ public_metadata: { snowRole: "senior" } }),
  });
  if (!response.ok) throw new Error(`Clerk role update failed (${response.status}). Retry pairing with the same code.`);
}

function createCode(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length] ?? "2").join("");
}

export const createPairingCode = action({
  args: { seniorId: seniorIdValidator },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || roleClaim(identity) !== "caregiver") {
      throw new Error("Only a caregiver can create a pairing code.");
    }
    const caregiver = await ctx.runQuery(internal.users.getActorByClerkId, {
      clerkId: identity.subject,
      expectedRole: "caregiver",
    });

    const code = createCode();
    const expiresAt = Date.now() + PAIRING_CODE_LIFETIME_MS;
    await ctx.runMutation(internal.pairingInternal.storePairingCode, {
      seniorId: args.seniorId,
      caregiverId: caregiver._id,
      codeHash: await hashCode(code),
      expiresAt,
    });
    return { code, expiresAt };
  },
});

export const claimPairingCode = action({
  args: { code: v.string() },
  handler: async (ctx, args): Promise<{ seniorId: Id<"users"> }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Sign in before entering a pairing code.");
    if (roleClaim(identity) === "caregiver") {
      throw new Error("Caregiver accounts cannot claim a senior pairing code.");
    }
    const { code } = claimPairingCodeInputSchema.parse(args);
    const seniorId: Id<"users"> = await ctx.runMutation(internal.pairingInternal.consumePairingCode, {
      codeHash: await hashCode(code),
      clerkId: identity.subject,
    });
    await setClerkSeniorRole(identity.subject);
    return { seniorId };
  },
});
