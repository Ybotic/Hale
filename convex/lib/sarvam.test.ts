import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { completeChat, SarvamApiError, synthesizeSpeech, transcribeAudio, translateText } from "./sarvam";

const originalFetch = globalThis.fetch;
let previousKey: string | undefined;
const calls: Array<{ url: string; init?: RequestInit }> = [];

function mockFetch(response: Response | ((url: string, init?: RequestInit) => Response | Promise<Response>)) {
  globalThis.fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return typeof response === "function" ? response(String(input), init) : response;
  }, { preconnect: originalFetch.preconnect });
}

beforeEach(() => {
  previousKey = process.env.SARVAM_API_KEY;
  process.env.SARVAM_API_KEY = "sarvam-test-key";
  calls.length = 0;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (previousKey === undefined) delete process.env.SARVAM_API_KEY;
  else process.env.SARVAM_API_KEY = previousKey;
});

describe("Sarvam API adapter", () => {
  test("sends Saaras v4 multipart audio with language and timestamp options", async () => {
    mockFetch(Response.json({
      transcript: "வணக்கம்",
      language_code: "ta-IN",
      language_probability: 0.98,
      request_id: "request-1",
      timestamps: { words: ["வணக்கம்"], start_time_seconds: [0], end_time_seconds: [1.2] },
    }));
    const result = await transcribeAudio(new Blob(["audio"], { type: "audio/webm" }), {
      durationSeconds: 2, filename: "clip.webm", languageCode: "ta-IN", keyterms: ["Chennai"],
    });

    expect(calls[0].url).toBe("https://api.sarvam.ai/speech-to-text");
    expect(calls[0].init?.headers).toEqual({ "api-subscription-key": "sarvam-test-key" });
    const body = calls[0].init?.body as FormData;
    expect(body.get("model")).toBe("saaras:v4");
    expect(body.get("language_code")).toBe("ta-IN");
    expect(body.get("mode")).toBe("transcribe");
    expect(body.get("with_timestamps")).toBe("true");
    expect(body.get("keyterms")).toBe('["Chennai"]');
    expect(result).toMatchObject({ transcript: "வணக்கம்", languageCode: "ta-IN", languageProbability: 0.98, requestId: "request-1" });
    expect(result.timestamps?.segments).toEqual(["வணக்கம்"]);
    expect(result.timestamps?.startTimeSeconds).toEqual([0]);
  });

  test("uses Sarvam Translate for the full language set", async () => {
    mockFetch(Response.json({ translated_text: "Hello, how are you?" }));
    await expect(translateText("नमस्ते", "hi-IN", "en-IN")).resolves.toBe("Hello, how are you?");
    expect(calls[0].url).toBe("https://api.sarvam.ai/translate");
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({
      model: "sarvam-translate:v1", source_language_code: "hi-IN", target_language_code: "en-IN",
    });
  });

  test("uses Sarvam's conversational LLM endpoint and returns only assistant text", async () => {
    mockFetch(Response.json({ choices: [{ message: { content: "I found one relevant memory." } }] }));
    await expect(completeChat([{ role: "user", content: "What happened yesterday?" }])).resolves.toBe("I found one relevant memory.");
    expect(calls[0].url).toBe("https://api.sarvam.ai/v1/chat/completions");
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({ model: "sarvam-105b-conversations", reasoning_effort: "low", stream: false });
  });

  test("decodes Bulbul v3 WAV audio and rejects languages without TTS coverage", async () => {
    mockFetch(Response.json({ audios: [btoa("RIFF-wave-bytes")] }));
    const audio = await synthesizeSpeech("வணக்கம்", "ta-IN");
    expect(new TextDecoder().decode(audio)).toBe("RIFF-wave-bytes");
    expect(calls[0].url).toBe("https://api.sarvam.ai/text-to-speech");
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({ language_code: "ta-IN", model: "bulbul:v3", speaker: "shubh" });
    await expect(synthesizeSpeech("Hello", "as-IN")).rejects.toThrow("does not support this language");
    expect(calls).toHaveLength(1);
  });

  test("rejects invalid inputs before calling Sarvam", async () => {
    mockFetch(Response.json({ transcript: "" }));
    await expect(transcribeAudio(new Blob([]), { durationSeconds: 1 })).rejects.toThrow("Audio is required");
    await expect(transcribeAudio(new Blob(["audio"]), { durationSeconds: 31 })).rejects.toThrow("batch API");
    await expect(translateText("x".repeat(2_001), "en-IN", "hi-IN")).rejects.toThrow("2,000 characters");
    await expect(synthesizeSpeech("x".repeat(2_501), "hi-IN")).rejects.toThrow("2,500 characters");
    await expect(transcribeAudio(new Blob(["audio"]), { durationSeconds: 1, keyterms: ["x".repeat(65)] })).rejects.toThrow("64 characters");
    expect(calls).toHaveLength(0);
  });

  test("does not expose provider response bodies or require credentials in client code", async () => {
    mockFetch(new Response("sensitive provider response", { status: 429 }));
    let thrown: unknown;
    try { await completeChat([{ role: "user", content: "hello" }]); } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(SarvamApiError);
    expect((thrown as Error).message).not.toContain("sensitive provider response");
  });

  test("fails closed when the server key is missing", async () => {
    delete process.env.SARVAM_API_KEY;
    await expect(completeChat([{ role: "user", content: "hello" }])).rejects.toThrow("not configured");
    expect(calls).toHaveLength(0);
  });
});
