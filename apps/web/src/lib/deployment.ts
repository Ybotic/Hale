interface DeploymentEnvironment {
  NEXT_PUBLIC_APP_MODE?: string;
  NEXT_PUBLIC_CONVEX_URL?: string;
  NEXT_PUBLIC_CONVEX_SITE_URL?: string;
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?: string;
  CLERK_SECRET_KEY?: string;
  APP_ORIGIN?: string;
}

export function deploymentErrors(env: DeploymentEnvironment): string[] {
  const errors: string[] = [];
  if (env.NEXT_PUBLIC_APP_MODE !== "live") errors.push("NEXT_PUBLIC_APP_MODE must explicitly be live for deployment.");
  for (const key of ["NEXT_PUBLIC_CONVEX_URL", "NEXT_PUBLIC_CONVEX_SITE_URL", "APP_ORIGIN"] as const) {
    try {
      const url = new URL(env[key] ?? "");
      if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.hostname.includes("your-") || url.hostname.endsWith(".example")) throw new Error("invalid origin");
    } catch { errors.push(`${key} must be a real HTTPS origin without credentials, a path, or query parameters.`); }
  }
  if (!env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_live_")) errors.push("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must use a production Clerk application (pk_live_).");
  if (!env.CLERK_SECRET_KEY?.startsWith("sk_live_")) errors.push("CLERK_SECRET_KEY must use a production Clerk application (sk_live_).");
  if (env.NEXT_PUBLIC_CONVEX_URL === env.NEXT_PUBLIC_CONVEX_SITE_URL && env.NEXT_PUBLIC_CONVEX_URL) errors.push("Convex client and HTTP action origins must be distinct (.cloud and .site by default).");
  return errors;
}
