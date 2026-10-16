import { describe, expect, test } from "bun:test";
import { deploymentErrors } from "./deployment";

const configured = { NEXT_PUBLIC_APP_MODE: "live", NEXT_PUBLIC_CONVEX_URL: "https://fictional-deployment.convex.cloud", NEXT_PUBLIC_CONVEX_SITE_URL: "https://fictional-deployment.convex.site", APP_ORIGIN: "https://hale.invalid", NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_fixture", CLERK_SECRET_KEY: "sk_live_fixture" };

describe("production configuration preflight (not a connectivity check)", () => {
  test("absent configuration and demo mode fail", () => {
    expect(deploymentErrors({})).toHaveLength(6);
    expect(deploymentErrors({ ...configured, NEXT_PUBLIC_APP_MODE: "demo" })).toContain("NEXT_PUBLIC_APP_MODE must explicitly be live for deployment.");
  });
  test("HTTPS live configuration passes structural checks", () => {
    expect(deploymentErrors(configured)).toEqual([]);
  });
  test("placeholder, credential-bearing, local, and non-HTTPS origins fail", () => {
    for (const origin of ["http://hale.invalid", "https://localhost:3001", "https://user:secret@hale.invalid", "https://hale.invalid/path", "https://your-deployment.convex.cloud", "https://hale.example", "https://hale.invalid/?token=secret"]) {
      expect(deploymentErrors({ ...configured, APP_ORIGIN: origin }).some((error) => error.startsWith("APP_ORIGIN"))).toBe(true);
    }
  });
  test("test keys and confusing the Convex HTTP/client origins fail", () => {
    expect(deploymentErrors({ ...configured, CLERK_SECRET_KEY: "sk_test_fixture" }).some((error) => error.includes("sk_live_"))).toBe(true);
    expect(deploymentErrors({ ...configured, NEXT_PUBLIC_CONVEX_SITE_URL: configured.NEXT_PUBLIC_CONVEX_URL }).some((error) => error.includes("distinct"))).toBe(true);
  });
});
