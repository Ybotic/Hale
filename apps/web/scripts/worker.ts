import { loadEnvConfig } from "@next/env";
import { getDb } from "../src/lib/server/db";
import { runWorker } from "../src/lib/server/processing-worker";

loadEnvConfig(process.cwd());

const controller = new AbortController();
process.on("SIGINT", () => controller.abort());
process.on("SIGTERM", () => controller.abort());

void runWorker(controller.signal)
  .catch((error) => {
    console.error("Hale worker stopped", { message: error instanceof Error ? error.message : "unknown_error" });
    process.exitCode = 1;
  })
  .finally(async () => { if (process.env.TIGERDATA_DATABASE_URL) await getDb().end({ timeout: 5 }); });
