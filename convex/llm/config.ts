import { createOpenAI } from "@ai-sdk/openai";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error("Set OPENAI_API_KEY in the Convex environment.");

const openai = createOpenAI({ apiKey });

// Provider and model selection live here so swapping either does not touch callers.
export const llmModel = openai("gpt-4o-mini");
