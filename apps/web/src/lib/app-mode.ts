export type AppMode = "demo" | "live" | "invalid";

// Local fixtures are a development convenience, never an implicit production data source.
export function resolveAppMode(value: string | undefined, environment: string | undefined): AppMode {
  if (value === "demo" || value === "live") return value;
  if (value !== undefined && value !== "") return "invalid";
  return environment === "development" || environment === "test" ? "demo" : "live";
}

export const appMode = resolveAppMode(process.env.NEXT_PUBLIC_APP_MODE, process.env.NODE_ENV);
