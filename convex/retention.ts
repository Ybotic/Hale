import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

const BATCH_SIZE = 100;
const MAX_BATCHES_PER_RUN = 10;

export const removeExpiredAudioBatch = internalMutation({
  args: {},
  handler: async (ctx) => {
    const expired = await ctx.db.query("messages")
      .withIndex("by_audio_expiration", (q) => q.lte("audioExpiresAt", Date.now()))
      .take(BATCH_SIZE);
    for (const message of expired) {
      if (message.audioStorageId) await ctx.storage.delete(message.audioStorageId);
      await ctx.db.patch(message._id, { audioStorageId: undefined, audioExpiresAt: undefined });
    }
    const abandonedUploads = await ctx.db.query("voiceUploads")
      .withIndex("by_expiration", (q) => q.lte("expiresAt", Date.now()))
      .take(BATCH_SIZE);
    for (const upload of abandonedUploads) {
      await ctx.storage.delete(upload.storageId);
      await ctx.db.delete(upload._id);
    }
    return { expiredMessages: expired.length, abandonedUploads: abandonedUploads.length };
  },
});

export const purgeExpiredAudio = internalAction({
  args: {},
  handler: async (ctx) => {
    let total = 0;
    for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch += 1) {
      const batchResult = await ctx.runMutation(internal.retention.removeExpiredAudioBatch, {});
      total += batchResult.expiredMessages + batchResult.abandonedUploads;
      if (batchResult.expiredMessages < BATCH_SIZE && batchResult.abandonedUploads < BATCH_SIZE) break;
    }
    return { deletedAudioCount: total };
  },
});
