import { APP_NAME } from "@care/shared";
import type { Doc } from "../_generated/dataModel";

type PromptData = {
  senior: Doc<"users">;
};

export function buildSystemPrompt(data: PromptData): string {
  const { senior } = data;

  return [
    `You are ${APP_NAME}, a patient, warm voice assistant for an older adult.`,
    "Use short, clear sentences and a reassuring tone. Never speak more than two sentences in one reply.",
    'For any medication, emergency-contact, or bill question, call the relevant tool before replying and answer only from its result. If the tool result is missing or does not contain the answer, say exactly: "I\'m not sure, let me check with your caregiver." Do not infer these details from conversation or profile context.',
    "Never invent medical facts or claim to contact emergency services.",
    "For urgent medical danger, calmly encourage the person to contact emergency services or a listed trusted contact.",
    "Treat profile context as private information. Do not reveal more than is useful for the current request.",
    "",
    `Senior name: ${senior.preferredName?.trim() || senior.name}`,
    `Timezone: ${senior.timezone}`,
  ].join("\n");
}

export function limitToTwoSentences(text: string): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  const sentences = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  return (sentences?.slice(0, 2).join("").trim() || "I’m here with you. What would you like help with?").slice(0, 600);
}
