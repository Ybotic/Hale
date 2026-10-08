"use node";

import { generateText } from "ai";
import { v } from "convex/values";
import { z } from "zod";
import { APP_NAME, detectEmergencyPhrases } from "@care/shared";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { roleClaim } from "./lib/auth";
import { getFallbackLlmModel, getLlmModel, retryWithFallback } from "./llm/config";
import { buildSystemPrompt, limitToTwoSentences } from "./llm/prompts";
import { buildSessionTools } from "./llm/tools";
import { sessionIdValidator } from "./lib/validators";

const transcriptionSchema = z.object({ text: z.string().trim().min(1).max(5000) });
const AUDIO_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const FIXED_EMERGENCY_REPLY = "Please call emergency services now, or contact your emergency contact. I will stay here with you.";
const CARE_DATA_QUERY_PATTERN = /\b(?:medications?|medicines?|meds?|pills?|doses?|dosage|took|skipped|emergency contacts?|contacts?|phone numbers?|bills?|payments?|paid|due|appointments?|profile|name|address|allerg(?:y|ies)|doctor|pharmacy)\b/iu;
const CARE_DATA_FALLBACK_REPLY = "I'm not sure, let me check with your caregiver.";
const TEMPORARY_MODEL_FAILURE_REPLY = "I'm sorry, I'm having trouble answering right now. Please try again.";

async function transcribe(audio: Blob): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ElevenLabs is not configured in Convex.");
  const form = new FormData();
  form.append("file", audio, `${APP_NAME.toLocaleLowerCase()}-voice-turn.m4a`);
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

    const emergencyPhrases = detectEmergencyPhrases(transcript);
    if (emergencyPhrases.length === 0) {
      try {
        await ctx.runMutation(internal.voiceRateLimit.reserveRequest, {
          sessionId: args.sessionId,
          actorId: actor._id,
        });
      } catch (error) {
        await ctx.runMutation(internal.storage.deletePendingAudio, {
          sessionId: args.sessionId,
          actorId: actor._id,
          storageId: audioStorageId,
        });
        throw error;
      }
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

    let cardPayload: import("@care/shared").CardPayload | undefined;
    let reply: string;
    if (emergencyPhrases.length > 0) {
      await ctx.runMutation(internal.alerts.recordEmergencyAlert, {
        sessionId: args.sessionId,
        actorId: actor._id,
        matchedPhrases: emergencyPhrases,
        excerpt: transcript,
      });
      reply = FIXED_EMERGENCY_REPLY;
    } else {
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
      let successfulToolWrite = false;
      const tools = buildSessionTools({
        ctx,
        actorId: actor._id,
        sessionId: args.sessionId,
        setCard: (card) => { cardPayload = card; },
        onSuccessfulWrite: () => { successfulToolWrite = true; },
      });
      const requiresCareDataTool = CARE_DATA_QUERY_PATTERN.test(transcript);
      try {
        const response = await retryWithFallback(
          getLlmModel(),
          getFallbackLlmModel(),
          (model) => generateText({
            model,
            system: buildSystemPrompt(context),
            messages: context.messages.map((message) => ({ role: message.role, content: message.text })),
            tools,
            maxSteps: 4,
            maxTokens: 150,
            maxRetries: 0,
            temperature: 0.4,
          }),
          (result) => {
            const toolCalls = result.steps.flatMap((step) => step.toolCalls);
            const toolResults = result.steps.flatMap((step) => step.toolResults);
            const everyToolCallHasResult = toolCalls.every((toolCall) =>
              toolResults.some((toolResult) => toolResult.toolCallId === toolCall.toolCallId),
            );
            return result.finishReason !== "error"
              && result.text.trim().length > 0
              && everyToolCallHasResult
              && (!requiresCareDataTool || toolCalls.length > 0);
          },
          () => !successfulToolWrite,
        );
        reply = limitToTwoSentences(response.text);
      } catch {
        reply = successfulToolWrite
          ? "I checked that for you."
          : requiresCareDataTool
            ? CARE_DATA_FALLBACK_REPLY
            : TEMPORARY_MODEL_FAILURE_REPLY;
      }
    }
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
