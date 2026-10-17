import { describe, expect, test } from "bun:test";
import { pollPyannoteJob, ProcessingError, submitPyannoteJob, transcribeAudio } from "../src/lib/server/processing-providers";

type MockFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

describe("mocked audio provider flows", () => {
  test("submits audio to OpenRouter and parses timestamped transcript segments", async () => {
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    const fetcher: MockFetch = async (input, init) => {
      requestUrl = String(input);
      requestInit = init;
      return jsonResponse({ segments: [{ start: 0.5, end: 1.8, text: " remember this " }] });
    };
    const segments = await transcribeAudio({
      audio: new Uint8Array([1, 2, 3]), mimeType: "audio/webm", duration: 2, apiKey: "test-openrouter-key",
      appOrigin: "https://hale.example", fetcher,
    });
    const headers = new Headers(requestInit?.headers);
    const form = requestInit?.body as FormData;
    expect(requestUrl).toBe("https://openrouter.ai/api/v1/audio/transcriptions");
    expect(requestInit?.method).toBe("POST");
    expect(headers.get("Authorization")).toBe("Bearer test-openrouter-key");
    expect(headers.get("HTTP-Referer")).toBe("https://hale.example");
    expect(form.get("model")).toBe("openai/whisper-1");
    expect(form.get("response_format")).toBe("verbose_json");
    expect(form.get("timestamp_granularities[]")).toBe("segment");
    expect((form.get("file") as File).name).toBe("recording.webm");
    expect(segments).toEqual([{ start: 0.5, end: 1.8, text: "remember this" }]);
  });

  test("classifies transient and invalid transcription responses", async () => {
    const unavailable: MockFetch = async () => jsonResponse({ error: "busy" }, 429);
    const invalidTranscript: MockFetch = async () => jsonResponse({ segments: [], text: "" });
    await expect(transcribeAudio({ audio: new Uint8Array([1]), mimeType: "audio/wav", duration: 1, apiKey: "key", fetcher: unavailable }))
      .rejects.toMatchObject({ code: "openrouter_http_429", retryable: true });
    await expect(transcribeAudio({ audio: new Uint8Array([1]), mimeType: "audio/wav", duration: 1, apiKey: "key", fetcher: invalidTranscript }))
      .rejects.toMatchObject({ code: "openrouter_invalid_transcript", retryable: false });
  });

  test("submits diarization without voiceprints and identification only with consented voiceprints", async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetcher: MockFetch = async (input, init) => {
      requests.push({ url: String(input), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      return jsonResponse({ jobId: `job-${requests.length}` });
    };
    const diarizeId = await submitPyannoteJob({ apiKey: "test-pyannote-key", audioUrl: "https://hale.example/worker-audio/token", voiceprints: [], fetcher });
    const identifyId = await submitPyannoteJob({
      apiKey: "test-pyannote-key", audioUrl: "https://hale.example/worker-audio/token",
      voiceprints: [{ personId: "person-1", voiceprint: "opaque-consented-voiceprint" }], fetcher,
    });
    expect(diarizeId).toBe("job-1");
    expect(identifyId).toBe("job-2");
    expect(requests[0].url).toBe("https://api.pyannote.ai/v1/diarize");
    expect(requests[0].body).not.toHaveProperty("voiceprints");
    expect(requests[1].url).toBe("https://api.pyannote.ai/v1/identify");
    expect(requests[1].body).toMatchObject({
      voiceprints: [{ label: "person-1", voiceprint: "opaque-consented-voiceprint" }],
      matching: { threshold: 70, exclusive: true },
    });
  });

  test("polls queued jobs, accepts successful results, and rejects mismatched or failed jobs", async () => {
    const pending: MockFetch = async () => jsonResponse({ jobId: "job-1", status: "running" });
    const succeeded: MockFetch = async () => jsonResponse({ jobId: "job-1", status: "succeeded", output: { diarization: [] } });
    const mismatch: MockFetch = async () => jsonResponse({ jobId: "job-other", status: "succeeded", output: {} });
    const failed: MockFetch = async () => jsonResponse({ jobId: "job-1", status: "failed" });
    expect(await pollPyannoteJob({ apiKey: "key", jobId: "job-1", fetcher: pending })).toBeNull();
    expect(await pollPyannoteJob({ apiKey: "key", jobId: "job-1", fetcher: succeeded })).toEqual({ diarization: [] });
    await expect(pollPyannoteJob({ apiKey: "key", jobId: "job-1", fetcher: mismatch }))
      .rejects.toMatchObject({ code: "pyannote_job_mismatch", retryable: false });
    await expect(pollPyannoteJob({ apiKey: "key", jobId: "job-1", fetcher: failed }))
      .rejects.toMatchObject({ code: "pyannote_job_failed", retryable: false });
  });

  test("rejects transient submission failures as retryable", async () => {
    const unavailable: MockFetch = async () => jsonResponse({}, 503);
    await expect(submitPyannoteJob({ apiKey: "key", audioUrl: "https://hale.example/audio", voiceprints: [], fetcher: unavailable }))
      .rejects.toBeInstanceOf(ProcessingError);
    await expect(submitPyannoteJob({ apiKey: "key", audioUrl: "https://hale.example/audio", voiceprints: [], fetcher: unavailable }))
      .rejects.toMatchObject({ code: "pyannote_submit_http_503", retryable: true });
  });
});
