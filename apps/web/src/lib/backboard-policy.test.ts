import { describe, expect, test } from "bun:test";
import { shouldUseBackboardProcessing } from "./backboard-policy";

describe("Backboard processing credit gate", () => {
  test("does not call paid processing by default or without server credentials", () => {
    expect(shouldUseBackboardProcessing(undefined, true)).toBe(false);
    expect(shouldUseBackboardProcessing("true", false)).toBe(false);
  });

  test("enables memory extraction and summaries only after server-side opt-in", () => {
    expect(shouldUseBackboardProcessing("true", true)).toBe(true);
    expect(shouldUseBackboardProcessing("false", true)).toBe(false);
    expect(shouldUseBackboardProcessing("1", true)).toBe(false);
  });
});
