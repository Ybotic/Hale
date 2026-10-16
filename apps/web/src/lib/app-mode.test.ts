import { describe, expect, test } from "bun:test";
import { resolveAppMode } from "./app-mode";

describe("application data source", () => {
  test("production and unknown environments never implicitly open synthetic records", () => {
    expect(resolveAppMode(undefined, "production")).toBe("live");
    expect(resolveAppMode("", "production")).toBe("live");
    expect(resolveAppMode(undefined, undefined)).toBe("live");
  });
  test("local development and test runners may use fixtures", () => {
    expect(resolveAppMode(undefined, "development")).toBe("demo");
    expect(resolveAppMode(undefined, "test")).toBe("demo");
  });
  test("explicit modes are respected and typos fail closed", () => {
    expect(resolveAppMode("live", "development")).toBe("live");
    expect(resolveAppMode("demo", "production")).toBe("demo");
    expect(resolveAppMode("liv", "development")).toBe("invalid");
    expect(resolveAppMode("LIVE", "production")).toBe("invalid");
  });
});
