import { createOpenAI } from "@ai-sdk/openai";

// Provider, credential lookup, and model selection live here.
export function getLlmModel() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Set OPENAI_API_KEY in the Convex environment.");
  return createOpenAI({ apiKey })("gpt-4o-mini");
}
