import { describe, expect, it, vi } from "vitest";
import { APP_NAME } from "@care/shared";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { FALLBACK_MODEL_ID, PRIMARY_MODEL_ID, retryWithFallback } from "../llm/config";
import { buildSystemPrompt, formatCurrentDateTime } from "../llm/prompts";
import { buildSessionTools } from "../llm/tools";

describe("voice system prompt", () => {
  it("fills every placeholder with the preferred name and local date and time", () => {
    const now = new Date("2026-04-05T14:08:00.000Z");
    const localDateTime = formatCurrentDateTime(now, "America/Los_Angeles");
    const senior = {
      name: "Pat Example",
      preferredName: "Pat",
      timezone: "America/Los_Angeles",
      seniorId: "senior-private-id",
    };
    const prompt = buildSystemPrompt({ senior, currentDateTime: now });

    expect(localDateTime).toContain("Sunday, April 5, 2026");
    expect(localDateTime).toContain("7:08 AM");
    expect(prompt).toContain(`You are ${APP_NAME}, a warm, patient voice companion for Pat`);
    expect(prompt).toContain(`Today's date and local time: ${localDateTime}.`);
    expect(prompt).toContain("Person's name: Pat.");
    expect(prompt).not.toMatch(/\{\{[^}]+\}\}/u);
    expect(prompt).not.toContain("seniorId");
    expect(prompt).not.toContain("senior-private-id");
  });
});

describe("LLM tool parameters", () => {
  it("does not expose seniorId in any model-facing tool schema", () => {
    const tools = buildSessionTools({
      ctx: {} as unknown as ActionCtx,
      actorId: "users:senior-a" as Id<"users">,
      sessionId: "sessions:senior-a" as Id<"sessions">,
      setCard: () => undefined,
    });
    const toolParameters = [
      tools.get_medications.parameters,
      tools.log_medication.parameters,
      tools.get_emergency_contacts.parameters,
      tools.get_unpaid_bills.parameters,
      tools.mark_bill_paid.parameters,
    ];

    for (const parameters of toolParameters) {
      expect(Object.keys(parameters.shape)).not.toContain("seniorId");
    }
  });
});

describe("OpenRouter fallback", () => {
  it("uses the fallback model once when the primary model fails", async () => {
    type MockModel = { modelId: string };
    const primary: MockModel = { modelId: PRIMARY_MODEL_ID };
    const fallback: MockModel = { modelId: FALLBACK_MODEL_ID };
    const attemptedModels: string[] = [];
    const generate = vi.fn(async (model: MockModel) => {
      attemptedModels.push(model.modelId);
      if (model.modelId === PRIMARY_MODEL_ID) throw new Error("primary model failed");
      return { text: "Fallback response", valid: true };
    });

    const result = await retryWithFallback(primary, fallback, generate, (candidate) => candidate.valid);

    expect(result.text).toBe("Fallback response");
    expect(attemptedModels).toEqual([PRIMARY_MODEL_ID, FALLBACK_MODEL_ID]);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("uses the fallback once when the primary response is invalid", async () => {
    const attemptedModels: string[] = [];
    const result = await retryWithFallback(
      { modelId: PRIMARY_MODEL_ID },
      { modelId: FALLBACK_MODEL_ID },
      async (model) => {
        attemptedModels.push(model.modelId);
        return { modelId: model.modelId, valid: model.modelId === FALLBACK_MODEL_ID };
      },
      (candidate) => candidate.valid,
    );

    expect(result.modelId).toBe(FALLBACK_MODEL_ID);
    expect(attemptedModels).toEqual([PRIMARY_MODEL_ID, FALLBACK_MODEL_ID]);
  });
});
