import { isIP } from "node:net";

function isPrivateOriginHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const ipVersion = isIP(host);
  const octets = ipVersion === 4 ? host.split(".").map(Number) : [];
  const privateIpv4 = ipVersion === 4 && (
    octets[0] === 0 || octets[0] === 10 || octets[0] === 127
    || (octets[0] === 169 && octets[1] === 254)
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168)
  );
  const privateIpv6 = ipVersion === 6 && (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:"));
  return privateIpv4 || privateIpv6 || ["localhost", "::1"].includes(host) || /\.(local|internal|example|test)$/.test(host);
}

export function publicVoiceOrigin(value: string | undefined) {
  try {
    const url = new URL(value ?? "");
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash || isPrivateOriginHost(url.hostname)) return null;
    return url.origin;
  } catch { return null; }
}

export function deploymentVoiceOrigin(appOrigin: string | undefined, vercelUrl: string | undefined) {
  return publicVoiceOrigin(appOrigin) ?? publicVoiceOrigin(vercelUrl ? `https://${vercelUrl}` : undefined);
}

export function voiceConfigurationMessage(apiKeyConfigured: boolean, origin: string | undefined, vercelUrl?: string) {
  if (!apiKeyConfigured) return "Voice processing is not available yet. You can skip this step and return later.";
  if (!deploymentVoiceOrigin(origin, vercelUrl)) return "Voice processing needs a public HTTPS site address before it can run. You can skip this step and return later.";
  return null;
}
