import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/shared/**/*.test.ts", "convex/tests/**/*.test.ts"],
  },
});
