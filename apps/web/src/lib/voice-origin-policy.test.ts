import { describe, expect, test } from "bun:test";
import { deploymentVoiceOrigin, publicVoiceOrigin, voiceConfigurationMessage } from "./voice-origin-policy";

describe("voice sample origin validation", () => {
  test("accepts a public HTTPS origin without path or credentials", () => {
    expect(publicVoiceOrigin("https://hale.example.com/")).toBe("https://hale.example.com");
    expect(publicVoiceOrigin("https://voice-tunnel.example.net")).toBe("https://voice-tunnel.example.net");
  });

  test("rejects local, private, insecure, and path-bearing origins", () => {
    for (const origin of ["http://localhost:3000", "https://127.0.0.1", "https://10.0.0.2", "https://hale.example.com/app", "https://user:pass@hale.example.com"]) {
      expect(publicVoiceOrigin(origin)).toBeNull();
    }
  });

  test("explains whether the API key or public origin is missing", () => {
    expect(voiceConfigurationMessage(false, "https://hale.example.com")).toContain("not available yet");
    expect(voiceConfigurationMessage(true, "http://localhost:3000")).toContain("public HTTPS");
    expect(voiceConfigurationMessage(true, "https://hale.example.com")).toBeNull();
  });

  test("uses Vercel's public deployment host when APP_ORIGIN is unset or local", () => {
    expect(deploymentVoiceOrigin(undefined, "hale-preview.vercel.app")).toBe("https://hale-preview.vercel.app");
    expect(voiceConfigurationMessage(true, "http://localhost:3000", "hale-preview.vercel.app")).toBeNull();
  });
});
