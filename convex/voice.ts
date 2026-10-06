"use node";

import { generateText } from "ai";
import { v } from "convex/values";
import { z } from "zod";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { roleClaim } from "./lib/auth";
import { llmModel } from "./llm/config";
import { buildSystemPrompt, limitToTwoSentences } from "./llm/prompts";
import { buildSessionTools } from "./llm/tools";
import { sessionIdValidator } from "./lib/validators";

const transcriptionSchema = z.object({ text: z.string().trim().min(1).max(5000) });
const AUDIO_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

async function transcribe(audio: Blob): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ElevenLabs is not configured in Convex.");
  const form = new FormData();
  form.append("file", audio, "snow-voice-turn.m4a");
  form.append("model_id", "scribe_v1");
  form.append("tag_audio_events", "false");
  form.append("diarize", "false");
  const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
  });
  if (!response.ok) throw new Error(`Speech transcription failed (${response.status}).`);
  const payload: unknown = await response.json();
  return transcriptionSchema.parse(payload).text;
}

async function synthesize(text: string): Promise<Blob | undefined> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) return undefined;
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: "eleven_flash_v2_5",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
  if (!response.ok) return undefined;
  return await response.blob();
}

export const processVoiceTurn = action({
  args: { sessionId: sessionIdValidator, audioStorageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || roleClaim(identity) !== "senior") {
      throw new Error("Only a paired senior can use the voice assistant.");
    }
    const actor = await ctx.runQuery(internal.users.getActorByClerkId, {
      clerkId: identity.subject,
      expectedRole: "senior",
    });
    await ctx.runQuery(internal.sessions.getSessionForActor, {
      sessionId: args.sessionId,
      actorId: actor._id,
      activeOnly: true,
    });
    const audioStorageId = args.audioStorageId;
    await ctx.runQuery(internal.storage.assertPendingAudio, {
      sessionId: args.sessionId,
      actorId: actor._id,
      storageId: audioStorageId,
    });
    const audioUrl = await ctx.storage.getUrl(audioStorageId);
    if (!audioUrl) throw new Error("Uploaded audio could not be found.");
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) throw new Error("Uploaded audio could not be read.");

    let transcript: string;
    try {
      transcript = await transcribe(await audioResponse.blob());
    } catch (error) {
      await ctx.runMutation(internal.storage.deletePendingAudio, {
        sessionId: args.sessionId,
        actorId: actor._id,
        storageId: audioStorageId,
      });
      throw error;
    }

    try {
      await ctx.runMutation(internal.messages.persistUserTurn, {
        sessionId: args.sessionId,
        actorId: actor._id,
        text: transcript,
        audioStorageId,
      });
    } catch (error) {
      await ctx.runMutation(internal.storage.deletePendingAudio, {
        sessionId: args.sessionId,
        actorId: actor._id,
        storageId: audioStorageId,
      });
      throw error;
    }

    const context: {
      senior: Doc<"users">;
      medications: Doc<"medications">[];
      contacts: Doc<"emergencyContacts">[];
      unpaidBills: Doc<"bills">[];
      messages: Doc<"messages">[];
    } = await ctx.runQuery(internal.sessions.getContextForVoice, {
      sessionId: args.sessionId,
      actorId: actor._id,
    });
    let cardPayload: import("@snow/shared").CardPayload | undefined;
    const tools = buildSessionTools({
      ctx,
      actorId: actor._id,
      sessionId: args.sessionId,
      setCard: (card) => { cardPayload = card; },
    });
    const response = await generateText({
      model: llmModel,
      system: buildSystemPrompt(context),
      messages: context.messages.map((message) => ({ role: message.role, content: message.text })),
      tools,
      maxSteps: 4,
      maxTokens: 140,
      temperature: 0.4,
    });
    const reply = limitToTwoSentences(response.text);
    let replyAudioStorageId: Id<"_storage"> | undefined;
    try {
      const audio = await synthesize(reply);
      if (audio) replyAudioStorageId = await ctx.storage.store(audio);
    } catch {
      // Preserve the text reply if speech synthesis is temporarily unavailable.
    }
    let messageId: Id<"messages">;
    try {
      messageId = await ctx.runMutation(internal.messages.persistAssistantTurn, {
        sessionId: args.sessionId,
        actorId: actor._id,
        text: reply,
        ...(replyAudioStorageId === undefined ? {} : { audioStorageId: replyAudioStorageId }),
        ...(cardPayload === undefined ? {} : { card: cardPayload }),
      });
    } catch (error) {
      if (replyAudioStorageId) await ctx.storage.delete(replyAudioStorageId);
      throw error;
    }
    return { messageId, transcript, text: reply, audioExpiresAt: Date.now() + AUDIO_RETENTION_MS };
  },
});
