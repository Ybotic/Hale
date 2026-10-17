import { describe, expect, test } from "bun:test";
import { deploymentErrors } from "./deployment";

const configured = {
  NEXT_PUBLIC_APP_MODE: "live",
  TIGERDATA_DATABASE_URL: "postgresql://hale:secret@hale.tigerdata.invalid/hale?sslmode=require",
  BACKBOARD_API_KEY: "backboard-test-key",
  NESSIE_API_KEY: "nessie-test-key",
  OPENROUTER_API_KEY: "openrouter-test-key",
  PYANNOTE_API_KEY: "pyannote-test-key",
  APP_ORIGIN: "https://hale.invalid",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_fixture",
  CLERK_SECRET_KEY: "sk_live_fixture",
};

describe("production configuration preflight (not a connectivity check)", () => {
  test("absent configuration and demo mode fail", () => {
    expect(deploymentErrors({})).toHaveLength(9);
    expect(deploymentErrors({ ...configured, NEXT_PUBLIC_APP_MODE: "demo" })).toContain("NEXT_PUBLIC_APP_MODE must explicitly be live for deployment.");
  });
  test("configured live services pass structural checks", () => {
    expect(deploymentErrors(configured)).toEqual([]);
  });
  test("placeholder or invalid database URL fails", () => {
    for (const url of ["postgresql://user:password@localhost/hale", "https://example.invalid", "postgresql://user:password@your-db.example/hale"]) {
      expect(deploymentErrors({ ...configured, TIGERDATA_DATABASE_URL: url }).some((error) => error.startsWith("TIGERDATA_DATABASE_URL"))).toBe(true);
    }
  });
  test("placeholder, credential-bearing, local, and non-HTTPS origins fail", () => {
    for (const origin of ["http://hale.invalid", "https://localhost:3001", "https://user:secret@hale.invalid", "https://hale.invalid/path", "https://your-app.example", "https://hale.example", "https://hale.invalid/?token=secret"]) {
      expect(deploymentErrors({ ...configured, APP_ORIGIN: origin }).some((error) => error.startsWith("APP_ORIGIN"))).toBe(true);
    }
  });
  test("test Clerk keys and absent provider keys fail", () => {
    expect(deploymentErrors({ ...configured, CLERK_SECRET_KEY: "sk_test_fixture" }).some((error) => error.includes("sk_live_"))).toBe(true);
    expect(deploymentErrors({ ...configured, BACKBOARD_API_KEY: undefined }).some((error) => error.startsWith("BACKBOARD_API_KEY"))).toBe(true);
    expect(deploymentErrors({ ...configured, NESSIE_API_KEY: undefined }).some((error) => error.startsWith("NESSIE_API_KEY"))).toBe(true);
    expect(deploymentErrors({ ...configured, OPENROUTER_API_KEY: undefined }).some((error) => error.startsWith("OPENROUTER_API_KEY"))).toBe(true);
    expect(deploymentErrors({ ...configured, PYANNOTE_API_KEY: undefined }).some((error) => error.startsWith("PYANNOTE_API_KEY"))).toBe(true);
  });
});
