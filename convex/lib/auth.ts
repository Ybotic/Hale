import { userRoleSchema, type UserRole } from "@snow/shared";
import type { UserIdentity } from "convex/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type DatabaseContext = QueryCtx | MutationCtx;

export function roleClaim(identity: UserIdentity): UserRole | null {
  const claims = identity as unknown as Record<string, unknown>;
  const direct = userRoleSchema.safeParse(claims.snowRole);
  if (direct.success) return direct.data;
  const customClaims = claims.customClaims;
  if (typeof customClaims !== "object" || customClaims === null) return null;
  const nested = userRoleSchema.safeParse((customClaims as Record<string, unknown>).snowRole);
  return nested.success ? nested.data : null;
}

export async function requireIdentity(ctx: DatabaseContext): Promise<UserIdentity> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Sign in is required.");
  return identity;
}

export async function requireCurrentUser(
  ctx: DatabaseContext,
  expectedRole?: UserRole,
) {
  const identity = await requireIdentity(ctx);
  const claimedRole = roleClaim(identity);
  if (!claimedRole) throw new Error("Your Snow account role is not configured.");
  if (expectedRole && claimedRole !== expectedRole) {
    throw new Error("You do not have permission to perform this action.");
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();
  if (!user || user.role !== claimedRole) {
    throw new Error("Your Snow profile is not available for this account.");
  }
  if (user.deletingAt !== undefined) throw new Error("This Snow profile is being deleted.");
  return user;
}

export async function requireSeniorAccess(
  ctx: DatabaseContext,
  actor: { _id: import("../_generated/dataModel").Id<"users">; role: UserRole },
  seniorId: import("../_generated/dataModel").Id<"users">,
) {
  const senior = await ctx.db.get(seniorId);
  if (!senior || senior.role !== "senior") throw new Error("Senior record not found.");
  if (senior.deletingAt !== undefined) throw new Error("This senior profile is being deleted.");

  if (actor.role === "senior") {
    if (actor._id !== seniorId) throw new Error("You can only access your own data.");
  } else {
    const link = await ctx.db
      .query("caregiverLinks")
      .withIndex("by_caregiver_senior", (q) =>
        q.eq("caregiverId", actor._id).eq("seniorId", seniorId),
      )
      .unique();
    if (!link) throw new Error("You are not linked to this senior.");
  }

  return senior;
}
