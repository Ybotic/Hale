import { createOpenAI, type OpenAIProviderSettings } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export const PRIMARY_MODEL_ID = "nex-agi/nex-n2-pro:free";
// Paid fallback for primary-model errors or invalid tool calls.
export const FALLBACK_MODEL_ID = "openai/gpt-4o-mini";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

// Free models log prompts and outputs. Use only fake test data with the free model;
// switch to the paid fallback before real users use Hale.
async function addMinimalReasoning(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (typeof init?.body !== "string") return await fetch(input, init);

  const body: unknown = JSON.parse(init.body);
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return await fetch(input, init);
  }

  return await fetch(input, {
    ...init,
    body: JSON.stringify({
      ...body,
      reasoning: { effort: "minimal" },
    }),
  });
}

function createOpenRouterProvider(apiKey: string, reasoning: boolean) {
  const settings: OpenAIProviderSettings = {
    apiKey,
    baseURL: OPENROUTER_BASE_URL,
    compatibility: "compatible",
    name: "openrouter",
    ...(reasoning ? { fetch: addMinimalReasoning } : {}),
  };
  return createOpenAI(settings);
}

function openRouterApiKey(): string {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("Set OPENROUTER_API_KEY in the Convex environment.");
  return apiKey;
}

// Provider and both model IDs are selected here; callers use these accessors only.
export function getLlmModel(): LanguageModel {
  return createOpenRouterProvider(openRouterApiKey(), true)(PRIMARY_MODEL_ID);
}

export function getFallbackLlmModel(): LanguageModel {
  return createOpenRouterProvider(openRouterApiKey(), false)(FALLBACK_MODEL_ID);
}

export async function retryWithFallback<Model, Result>(
  primaryModel: Model,
  fallbackModel: Model,
  generate: (model: Model) => Promise<Result>,
  isValid: (result: Result) => boolean,
  shouldRetry: () => boolean = () => true,
): Promise<Result> {
  try {
    const primaryResult = await generate(primaryModel);
    if (isValid(primaryResult)) return primaryResult;
  } catch {
    // One fallback attempt handles provider and invalid-tool-call errors.
  }

  if (!shouldRetry()) throw new Error("A tool update succeeded, so the voice request was not repeated.");

  const fallbackResult = await generate(fallbackModel);
  if (!isValid(fallbackResult)) throw new Error("The fallback model did not produce a valid response.");
  return fallbackResult;
}
