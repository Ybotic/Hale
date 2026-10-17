interface DeploymentEnvironment {
  NEXT_PUBLIC_APP_MODE?: string;
  TIGERDATA_DATABASE_URL?: string;
  BACKBOARD_API_KEY?: string;
  NESSIE_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  PYANNOTE_API_KEY?: string;
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?: string;
  CLERK_SECRET_KEY?: string;
  APP_ORIGIN?: string;
}

function validOrigin(value: string | undefined) {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash
      && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      && !url.hostname.includes("your-") && !url.hostname.endsWith(".example");
  } catch { return false; }
}

export function deploymentErrors(env: DeploymentEnvironment): string[] {
  const errors: string[] = [];
  if (env.NEXT_PUBLIC_APP_MODE !== "live") errors.push("NEXT_PUBLIC_APP_MODE must explicitly be live for deployment.");
  try {
    const database = new URL(env.TIGERDATA_DATABASE_URL ?? "");
    if (!["postgres:", "postgresql:"].includes(database.protocol) || !database.hostname || !database.username || !database.password
      || ["localhost", "127.0.0.1", "[::1]"].includes(database.hostname) || database.hostname.includes("your-") || database.hostname.endsWith(".example")) {
      throw new Error("invalid database URL");
    }
  } catch { errors.push("TIGERDATA_DATABASE_URL must be a configured TigerData PostgreSQL connection string."); }
  if (!validOrigin(env.APP_ORIGIN)) errors.push("APP_ORIGIN must be a real HTTPS origin without credentials, a path, or query parameters.");
  if (!env.BACKBOARD_API_KEY || env.BACKBOARD_API_KEY.includes("your-")) errors.push("BACKBOARD_API_KEY must be configured as a server-only secret.");
  if (!env.NESSIE_API_KEY || env.NESSIE_API_KEY.includes("your-")) errors.push("NESSIE_API_KEY must be configured as a server-only secret.");
  if (!env.OPENROUTER_API_KEY || env.OPENROUTER_API_KEY.includes("your-")) errors.push("OPENROUTER_API_KEY must be configured as a server-only secret.");
  if (!env.PYANNOTE_API_KEY || env.PYANNOTE_API_KEY.includes("your-")) errors.push("PYANNOTE_API_KEY must be configured as a server-only secret for transcription processing.");
  if (!env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_live_")) errors.push("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must use a production Clerk application (pk_live_).");
  if (!env.CLERK_SECRET_KEY?.startsWith("sk_live_")) errors.push("CLERK_SECRET_KEY must use a production Clerk application (sk_live_).");
  return errors;
}
