import { generateObject } from "ai";
import { z } from "zod";
import type { CognitiveMetrics } from "@care/shared";
import { getLlmModel } from "./config";

const narrativeSchema = z.object({
  interpretation: z.string().trim().min(1).max(500),
  suggestions: z.array(z.string().trim().min(1).max(180)).min(2).max(3),
});

export type AnalysisNarrative = z.infer<typeof narrativeSchema>;

export function fallbackAnalysis(metrics: CognitiveMetrics, flagNames: readonly string[]): AnalysisNarrative {
  const interpretation = !metrics.sampleAdequate
    ? "There was not enough senior speech in this session to calculate a screening score."
    : flagNames.length === 0
    ? "This session did not cross the screening thresholds. A single conversation cannot establish a pattern."
    : `This session showed ${flagNames.length} screening marker${flagNames.length === 1 ? "" : "s"}. A single conversation cannot establish a pattern.`;
  return {
    interpretation,
    suggestions: [
      "Keep familiar daily routines and make time for relaxed conversation.",
      "Support regular sleep, hydration, and enjoyable social activities.",
      "If changes persist, consider sharing the pattern with a healthcare professional.",
    ],
  };
}

export async function interpretComputedAnalysis(
  metrics: CognitiveMetrics,
  flagNames: readonly string[],
): Promise<AnalysisNarrative> {
  const result = await generateObject({
    model: getLlmModel(),
    schema: narrativeSchema,
    system: [
      "Write a short plain-language screening interpretation and 2 or 3 general preventative-care suggestions.",
      "This is not a medical diagnosis. Do not diagnose, predict disease, recommend medication, or suggest tests.",
      "Use only the computed metrics and marker names supplied by the user message. Never request or infer transcript wording.",
      "If sampleAdequate is false, clearly say there is not enough speech to calculate a screening score.",
      "Keep suggestions practical and non-clinical; encourage discussing persistent concerns with a healthcare professional.",
    ].join(" "),
    prompt: JSON.stringify({ metrics, flagNames }),
    maxTokens: 220,
    temperature: 0.2,
  });
  return narrativeSchema.parse(result.object);
}
