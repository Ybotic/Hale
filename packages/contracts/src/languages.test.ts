import { describe, expect, test } from "bun:test";
import { isLanguageCode, SUPPORTED_LANGUAGES } from "./languages";

describe("shared language codes", () => {
  test("lists unique Indian language locale codes", () => {
    expect(SUPPORTED_LANGUAGES).toHaveLength(23);
    expect(new Set(SUPPORTED_LANGUAGES.map(({ code }) => code)).size).toBe(23);
  });

  test("validates locale codes", () => {
    expect(isLanguageCode("ta-IN")).toBe(true);
    expect(isLanguageCode("xx-IN")).toBe(false);
  });
});
