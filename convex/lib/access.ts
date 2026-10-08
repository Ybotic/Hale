import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type DatabaseContext = QueryCtx | MutationCtx;

export async function authorizeActorAndSenior(
  ctx: DatabaseContext,
  actorId: Id<"users">,
  seniorId: Id<"users">,
  allowDeleting = false,
) {
  const actor = await ctx.db.get(actorId);
  if (!actor || !actor.clerkId) throw new Error("Authenticated Hale user not found.");
  const senior = await ctx.db.get(seniorId);
  if (!senior || senior.role !== "senior") throw new Error("Senior record not found.");
  if (!allowDeleting && senior.deletingAt !== undefined) throw new Error("This senior profile is being deleted.");

  if (actor.role === "senior") {
    if (actor._id !== senior._id) throw new Error("You can only access your own data.");
  } else {
    const link = await ctx.db
      .query("caregiverLinks")
      .withIndex("by_caregiver_senior", (q) =>
        q.eq("caregiverId", actor._id).eq("seniorId", senior._id),
      )
      .unique();
    if (!link) throw new Error("You are not linked to this senior.");
  }

  return { actor, senior };
}

export async function authorizeSession(
  ctx: DatabaseContext,
  actorId: Id<"users">,
  sessionId: Id<"sessions">,
  activeOnly = true,
  allowDeleting = false,
) {
  const session = await ctx.db.get(sessionId);
  if (!session) throw new Error("Chat session not found.");
  if (activeOnly && session.status !== "active") throw new Error("This chat has ended.");
  const authorized = await authorizeActorAndSenior(ctx, actorId, session.seniorId, allowDeleting);
  return { ...authorized, session };
}
