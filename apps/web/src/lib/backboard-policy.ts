export function shouldUseBackboardProcessing(enabled: string | undefined, apiKeyConfigured: boolean) {
  return enabled === "true" && apiKeyConfigured;
}
