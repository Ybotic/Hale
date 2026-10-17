import "server-only";
import { execFileSync, spawn } from "node:child_process";
import { delimiter } from "node:path";
import { fileURLToPath } from "node:url";
import { parseWhisperSegments, type TimedTranscriptSegment } from "../processing";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class ProcessingError extends Error {
  constructor(readonly code: string, readonly retryable = true) {
    super(code);
    this.name = "ProcessingError";
  }
}

function audioFilename(mime: string) {
  if (mime.includes("wav")) return "recording.wav";
  if (mime.includes("mp4")) return "recording.m4a";
  if (mime.includes("ogg")) return "recording.ogg";
  if (mime.includes("mpeg")) return "recording.mp3";
  return "recording.webm";
}

export async function transcribeAudio(input: {
  audio: Uint8Array;
  mimeType: string;
  duration: number;
  apiKey: string | undefined;
  appOrigin?: string;
  fetcher?: Fetcher;
}): Promise<TimedTranscriptSegment[]> {
  if (!input.apiKey) throw new ProcessingError("openrouter_not_configured", false);
  const form = new FormData();
  form.set("model", "openai/whisper-1");
  form.set("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  form.append("file", new Blob([new Uint8Array(input.audio)], { type: input.mimeType }), audioFilename(input.mimeType));
  const response = await (input.fetcher ?? fetch)("https://openrouter.ai/api/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "HTTP-Referer": input.appOrigin ?? "http://localhost:3000",
      "X-Title": "Hale",
    },
    body: form,
    signal: AbortSignal.timeout(90_000),
    cache: "no-store",
  });
  if (!response.ok) throw new ProcessingError(`openrouter_http_${response.status}`, response.status >= 500 || response.status === 429);
  let payload: unknown;
  try { payload = await response.json(); }
  catch { throw new ProcessingError("openrouter_invalid_json", false); }
  try { return parseWhisperSegments(payload, input.duration); }
  catch { throw new ProcessingError("openrouter_invalid_transcript", false); }
}

function localGpuEnvironment(python: string) {
  let libraryPath: string;
  try {
    libraryPath = execFileSync(python, ["-c", "import os, nvidia.cublas, nvidia.cudnn; print(os.path.join(list(nvidia.cublas.__path__)[0], 'lib') + os.pathsep + os.path.join(list(nvidia.cudnn.__path__)[0], 'lib'))"], {
      encoding: "utf8", timeout: 15_000, stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    throw new ProcessingError("local_gpu_runtime_unavailable", false);
  }
  return { ...process.env, LD_LIBRARY_PATH: [libraryPath, process.env.LD_LIBRARY_PATH].filter(Boolean).join(delimiter) };
}

export async function transcribeLocalGpuAudio(input: {
  audio: Uint8Array;
  mimeType: string;
  duration: number;
  python?: string;
}): Promise<TimedTranscriptSegment[]> {
  const python = input.python ?? process.env.LOCAL_WHISPER_PYTHON ?? "python3";
  const scriptPath = fileURLToPath(new URL("../../../scripts/transcribe_gpu.py", import.meta.url));
  const extension = input.mimeType.includes("mp4") ? ".m4a" : input.mimeType.includes("ogg") ? ".ogg" : input.mimeType.includes("wav") ? ".wav" : input.mimeType.includes("mpeg") ? ".mp3" : ".webm";
  const env = { ...localGpuEnvironment(python), HALE_AUDIO_SUFFIX: extension };
  return await new Promise((resolve, reject) => {
    const process = spawn(python, [scriptPath], { env, stdio: ["pipe", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    let stdoutLength = 0;
    const timeout = setTimeout(() => process.kill("SIGKILL"), 240_000);
    process.stdout.on("data", (chunk: Buffer) => {
      stdoutLength += chunk.length;
      if (stdoutLength > 4_000_000) process.kill("SIGKILL");
      else stdout.push(chunk);
    });
    process.stderr.on("data", () => {});
    process.on("error", () => {
      clearTimeout(timeout);
      reject(new ProcessingError("local_gpu_runtime_unavailable", false));
    });
    process.on("close", (code, signal) => {
      clearTimeout(timeout);
      if (signal === "SIGKILL") { reject(new ProcessingError("local_gpu_timeout", true)); return; }
      if (code !== 0) { reject(new ProcessingError("local_gpu_transcription_failed", true)); return; }
      try {
        const payload = JSON.parse(Buffer.concat(stdout).toString("utf8")) as unknown;
        resolve(parseWhisperSegments(payload, input.duration));
      } catch {
        reject(new ProcessingError("local_gpu_invalid_transcript", false));
      }
    });
    process.stdin.on("error", () => {});
    process.stdin.end(Buffer.from(input.audio));
  });
}

export interface ConsentedVoiceprint {
  personId: string;
  voiceprint: string;
}

export async function submitPyannoteJob(input: {
  apiKey: string | undefined;
  audioUrl: string;
  voiceprints: ConsentedVoiceprint[];
  fetcher?: Fetcher;
}): Promise<string> {
  if (!input.apiKey) throw new ProcessingError("pyannote_not_configured", false);
  const identified = input.voiceprints.length > 0;
  const body: Record<string, unknown> = {
    url: input.audioUrl,
    model: "precision-2",
    exclusive: true,
    turnLevelConfidence: true,
    ...(identified ? {
      voiceprints: input.voiceprints.map(({ personId, voiceprint }) => ({ label: personId, voiceprint })),
      matching: { threshold: 70, exclusive: true },
    } : {}),
  };
  const response = await (input.fetcher ?? fetch)(`https://api.pyannote.ai/v1/${identified ? "identify" : "diarize"}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!response.ok) throw new ProcessingError(`pyannote_submit_http_${response.status}`, response.status >= 500 || response.status === 429);
  let result: { jobId?: unknown };
  try { result = await response.json() as { jobId?: unknown }; }
  catch { throw new ProcessingError("pyannote_invalid_job_response", false); }
  if (typeof result.jobId !== "string" || !result.jobId) throw new ProcessingError("pyannote_invalid_job_response", false);
  return result.jobId;
}

export async function pollPyannoteJob(input: {
  apiKey: string | undefined;
  jobId: string;
  fetcher?: Fetcher;
}): Promise<Record<string, unknown> | null> {
  if (!input.apiKey) throw new ProcessingError("pyannote_not_configured", false);
  const response = await (input.fetcher ?? fetch)(`https://api.pyannote.ai/v1/jobs/${encodeURIComponent(input.jobId)}`, {
    headers: { Authorization: `Bearer ${input.apiKey}` },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!response.ok) throw new ProcessingError(`pyannote_poll_http_${response.status}`, response.status >= 500 || response.status === 429);
  let result: { jobId?: unknown; status?: unknown; output?: unknown };
  try { result = await response.json() as typeof result; }
  catch { throw new ProcessingError("pyannote_invalid_job_response", false); }
  if (result.jobId !== input.jobId) throw new ProcessingError("pyannote_job_mismatch", false);
  if (result.status === "failed" || result.status === "canceled") throw new ProcessingError("pyannote_job_failed", false);
  if (result.status !== "succeeded") return null;
  if (!result.output || typeof result.output !== "object") throw new ProcessingError("pyannote_invalid_output", false);
  return result.output as Record<string, unknown>;
}
