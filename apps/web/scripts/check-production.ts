import { loadEnvConfig } from "@next/env";
import { deploymentErrors } from "../src/lib/deployment";

loadEnvConfig(process.cwd(), false);
const errors = deploymentErrors({
  NEXT_PUBLIC_APP_MODE: process.env.NEXT_PUBLIC_APP_MODE,
  TIGERDATA_DATABASE_URL: process.env.TIGERDATA_DATABASE_URL,
  BACKBOARD_API_KEY: process.env.BACKBOARD_API_KEY,
  NESSIE_API_KEY: process.env.NESSIE_API_KEY,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  PYANNOTE_API_KEY: process.env.PYANNOTE_API_KEY,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
  APP_ORIGIN: process.env.APP_ORIGIN,
});
if (errors.length) {
  console.error("Production configuration is blocked:\n" + errors.map((error) => `- ${error}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("Production configuration passed structural checks. This does not verify database/provider connectivity or processing workers. Complete docs/PRODUCTION.md before release.");
}
