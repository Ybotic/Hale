export const MAX_PROCESSING_ATTEMPTS = 5;

export function processingFailureOutcome(input: {
  attempts: number;
  retryable: boolean;
  now: number;
  maxAttempts?: number;
}) {
  const attempts = input.attempts + 1;
  const failed = !input.retryable || attempts >= (input.maxAttempts ?? MAX_PROCESSING_ATTEMPTS);
  const delay = Math.min(5_000 * (2 ** Math.max(0, attempts - 1)), 60_000);
  return {
    attempts,
    state: failed ? "failed" as const : "queued" as const,
    nextAttemptAt: failed ? 0 : input.now + delay,
  };
}
