import { query } from "./_generated/server";
import { requireCurrentUser, requireSeniorAccess } from "./lib/auth";
import { seniorIdValidator } from "./lib/validators";

export const listForSenior = query({
  args: { seniorId: seniorIdValidator },
  handler: async (ctx, args) => {
    const actor = await requireCurrentUser(ctx);
    await requireSeniorAccess(ctx, actor, args.seniorId);
    return await ctx.db.query("medicationLogs")
      .withIndex("by_senior", (q) => q.eq("seniorId", args.seniorId))
      .order("desc")
      .take(50);
  },
});
