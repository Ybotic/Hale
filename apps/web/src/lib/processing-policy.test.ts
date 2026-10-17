import { describe, expect, test } from "bun:test";
import { localGpuEnabled, MAX_PROCESSING_ATTEMPTS, processingFailureOutcome, transcriptionOnlyEnabled } from "./server/processing-policy";

describe("processing job retry policy", () => {
  test("requeues retryable failures with capped exponential delay", () => {
    expect(processingFailureOutcome({ attempts: 0, retryable: true, now: 10_000 })).toEqual({
      attempts: 1, state: "queued", nextAttemptAt: 15_000,
    });
    expect(processingFailureOutcome({ attempts: 4, retryable: true, now: 10_000 })).toEqual({
      attempts: 5, state: "failed", nextAttemptAt: 0,
    });
    expect(processingFailureOutcome({ attempts: 4, retryable: true, now: 10_000, maxAttempts: 10 })).toEqual({
      attempts: 5, state: "queued", nextAttemptAt: 70_000,
    });
  });

  test("fails non-retryable provider or validation errors immediately", () => {
    expect(processingFailureOutcome({ attempts: 0, retryable: false, now: 10_000 })).toEqual({
      attempts: 1, state: "failed", nextAttemptAt: 0,
    });
    expect(MAX_PROCESSING_ATTEMPTS).toBe(5);
  });

  test("enables local GPU transcription without diarization or speaker identification", () => {
    expect(localGpuEnabled("true")).toBe(true);
    expect(localGpuEnabled("0")).toBe(false);
    expect(transcriptionOnlyEnabled("false", "true")).toBe(true);
    expect(transcriptionOnlyEnabled("1", "false")).toBe(true);
    expect(transcriptionOnlyEnabled("false", "false")).toBe(false);
  });
});
