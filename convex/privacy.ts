import { v, ConvexError } from "convex/values";
import { mutation, internalMutation } from "./lib/functions";
import { requireMember } from "./authz";

export const deleteConversation = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const conversation = await ctx.db.get(conversationId);
    if (!conversation) throw new ConvexError("Conversation unavailable.");
    const { identity } = await requireMember(ctx, conversation.patientId, "evidence:delete");
    if (conversation.deletedAt) return;
    // Tombstones survive retries, so late ingestion can never recreate deleted evidence.
    await ctx.db.patch(conversationId, { deletedAt: Date.now() });
    const chunk = await ctx.db.get(conversation.chunkId);
    if (chunk) {
      if (chunk.storageId) await ctx.storage.delete(chunk.storageId);
      await ctx.db.patch(chunk._id, { deletedAt: Date.now(), storageId: undefined, state: "failed" });
      const jobs = await ctx.db.query("processingJobs").withIndex("by_chunk", (q) => q.eq("chunkId", chunk._id)).collect();
      for (const job of jobs) await ctx.db.patch(job._id, { state: "failed", error: "Source deleted." });
    }
    const turns = await ctx.db.query("transcriptTurns").withIndex("by_conversation", (q) => q.eq("conversationId", conversationId)).collect();
    const memories = await ctx.db.query("memories").withIndex("by_conversation", (q) => q.eq("conversationId", conversationId)).collect();
    for (const turn of turns) await ctx.db.delete(turn._id);
    for (const memory of memories) await ctx.db.delete(memory._id);
    await ctx.db.patch(conversationId, { title: "Deleted conversation", summary: "", people: [] });
    await ctx.db.insert("auditEvents", { patientId: conversation.patientId, actor: identity.subject, operation: "conversation.deleted", target: conversationId, timestamp: Date.now() });
  },
});

export const expireAudio = internalMutation({
  args: {},
  handler: async (ctx) => {
    const chunks = await ctx.db.query("audioChunks").withIndex("by_expiry", (q) => q.lte("expiresAt", Date.now()))
      .filter((q) => q.neq(q.field("storageId"), undefined)).take(50);
    for (const chunk of chunks) {
      if (chunk.storageId) await ctx.storage.delete(chunk.storageId);
      await ctx.db.patch(chunk._id, { storageId: undefined });
    }
  },
});
