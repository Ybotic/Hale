import { makeFunctionReference } from "convex/server";
import type { Capability, Conversation, Memory, PatientSpace, RecallAnswer, TranscriptTurn } from "@hale/contracts";
import type { VoiceState } from "@hale/contracts/voice";

export interface PatientInfo { id: string; name: string; timezone: string; capabilities: Capability[] }
export interface FamilyProfile { name: string; relationship: string; voiceState: VoiceState; message?: string }
export const api = {
  voiceProfile: makeFunctionReference<"query", Record<string, never>, { configured: boolean; profile: FamilyProfile | null }>("voices:me"),
  saveFamilyProfile: makeFunctionReference<"mutation", { name: string; relationship: string }, null>("voices:saveProfile"),
  skipVoice: makeFunctionReference<"mutation", Record<string, never>, null>("voices:skip"),
  revokeVoice: makeFunctionReference<"mutation", Record<string, never>, null>("voices:revoke"),
  patients: makeFunctionReference<"query", Record<string, never>, PatientInfo[]>("patients:list"),
  createPatient: makeFunctionReference<"mutation", { name: string; timezone: string; recordingConsent: boolean }, string>("patients:create"),
  space: makeFunctionReference<"query", { patientId: string }, PatientSpace>("conversations:space"),
  searchConversations: makeFunctionReference<"query", { patientId: string; text: string; day?: string; personId?: string }, { conversations: Conversation[]; limited: boolean }>("conversations:search"),
  recall: makeFunctionReference<"query", { patientId: string; question: string; day?: string }, RecallAnswer>("assistant:recall"),
  detail: makeFunctionReference<"query", { conversationId: string }, { patientId: string; conversation: Conversation; memories: Memory[]; turns: TranscriptTurn[]; audioUrl: string | null }>("conversations:detail"),
  deleteConversation: makeFunctionReference<"mutation", { conversationId: string }, null>("privacy:deleteConversation"),
  startRecording: makeFunctionReference<"mutation", { patientId: string; participantsConsented: boolean }, string>("recordings:start"),
  recordingState: makeFunctionReference<"mutation", { sessionId: string; state: "recording" | "paused" | "interrupted" | "stopped" }, null>("recordings:setState"),
};
