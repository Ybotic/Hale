import type { SegmentUpload } from "@/components/providers";

export const SEGMENT_MS = 45_000;
export const MAX_PENDING_SEGMENTS = 3;
const MAX_LOCAL_BYTES = 20_000_000;
export const MIME_CANDIDATES = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
export function chooseMimeType(supported: (mime: string) => boolean) {
  return MIME_CANDIDATES.find(supported);
}

type Phase = "idle" | "starting" | "recording" | "paused" | "interrupted" | "stopped" | "failed";
export interface LocalSegment extends SegmentUpload { sessionId: string; url: string; error?: string; attempts: number }
export interface CaptureSnapshot {
  phase: Phase;
  elapsed: number;
  uploaded: number;
  uploading: boolean;
  segments: LocalSegment[];
  message: string;
  mimeType: string;
  gaps: number;
}

interface Adapter {
  mode: "demo" | "live";
  beginSession: () => Promise<string>;
  setSessionState: (id: string, state: "recording" | "paused" | "interrupted" | "stopped") => Promise<void>;
  uploadSegment: (sessionId: string, segment: SegmentUpload) => Promise<void>;
}

/** Foreground-only. Each stop finalizes a complete media container; no timeslice fragments. */
export class ForegroundRecorder {
  private snapshot: CaptureSnapshot = { phase: "idle", elapsed: 0, uploaded: 0, uploading: false, segments: [], message: "", mimeType: "", gaps: 0 };
  private listeners = new Set<() => void>();
  private stream?: MediaStream;
  private recorder?: MediaRecorder;
  private session?: string;
  private sequence = 0;
  private segmentStarted = 0;
  private finalizedMs = 0;
  private lastEnd = 0;
  private heartbeatAt = 0;
  private rotation?: ReturnType<typeof setTimeout>;
  private heartbeat?: ReturnType<typeof setInterval>;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private stopped?: () => void;
  private alive = true;
  private generation = 0;
  private transitioning = false;

  constructor(private adapter: Adapter) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  private update(patch: Partial<CaptureSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  async start() {
    if (this.transitioning || ["starting", "recording"].includes(this.snapshot.phase)) return;
    if (this.snapshot.segments.length >= MAX_PENDING_SEGMENTS) { this.update({ message: "Save or discard local segments before recording more." }); return; }
    const attempt = ++this.generation;
    this.update({ phase: "starting", message: "Requesting microphone access…" });
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("This browser can’t record here. Use Safari over HTTPS or localhost.");
      const mimeType = typeof MediaRecorder.isTypeSupported === "function" ? chooseMimeType((mime) => MediaRecorder.isTypeSupported(mime)) : undefined;
      // Keep the microphone request directly in the user's intentional start/resume interaction.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!this.alive || attempt !== this.generation || document.visibilityState !== "visible") {
        stream.getTracks().forEach((track) => track.stop());
        if (this.alive && attempt === this.generation) this.update({ phase: "interrupted", message: "Return to Hale and tap Resume to record." });
        return;
      }
      this.stream = stream;
      const resuming = !!this.session;
      const session = this.session ?? await this.adapter.beginSession();
      if (!this.alive || attempt !== this.generation || document.visibilityState !== "visible") {
        stream.getTracks().forEach((track) => track.stop());
        await this.adapter.setSessionState(session, "stopped").catch(() => {});
        if (this.alive && attempt === this.generation) this.update({ phase: "interrupted", message: "Return to Hale and tap Resume to record." });
        return;
      }
      this.session = session;
      if (resuming) await this.adapter.setSessionState(session, "recording");
      if (!this.alive || attempt !== this.generation || document.visibilityState !== "visible") { this.releaseStream(); return; }
      for (const track of this.stream.getTracks()) {
        track.onended = () => { void this.interrupt("The microphone was interrupted. Tap Resume when you’re ready."); };
        track.onmute = () => { void this.interrupt("Microphone input was muted. Recording has stopped; tap Resume to try again."); };
      }
      this.update({ phase: "recording", message: "Keep Hale open and your screen unlocked.", mimeType: mimeType ?? "Browser default" });
      this.beginSegment(mimeType);
      this.heartbeatAt = Date.now();
      this.heartbeat = setInterval(() => {
        const now = Date.now();
        if (this.snapshot.phase === "recording" && now - this.heartbeatAt > 5000) { void this.interrupt("Recording may have been suspended. Coverage is uncertain; tap Resume to continue."); }
        this.heartbeatAt = now;
        if (this.snapshot.phase === "recording") this.update({ elapsed: Math.floor((this.finalizedMs + now - this.segmentStarted) / 1000) });
      }, 1000);
    } catch (error) {
      this.releaseStream();
      this.update({ phase: "failed", message: error instanceof DOMException && error.name === "NotAllowedError" ? "Microphone access was denied. Allow it in Safari’s website settings, then try again." : error instanceof Error ? error.message : "The microphone couldn’t start. Try again." });
    }
  }

  private beginSegment(mimeType?: string) {
    if (!this.stream || this.snapshot.phase !== "recording") return;
    const recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    const parts: Blob[] = [];
    this.recorder = recorder;
    this.segmentStarted = Date.now();
    if (this.lastEnd && this.segmentStarted > this.lastEnd) this.update({ gaps: this.snapshot.gaps + (this.segmentStarted - this.lastEnd) / 1000 });
    const capturedAt = this.segmentStarted;
    const sessionId = this.session!;
    let endedAt = capturedAt;
    const sequence = this.sequence++;
    recorder.ondataavailable = (event) => { if (event.data.size) parts.push(event.data); };
    recorder.onerror = () => { void this.interrupt("The browser stopped recording. Some audio may be missing. Tap Resume to continue."); };
    recorder.onstop = () => {
      if (this.alive) {
        endedAt = Math.max(capturedAt + 1, endedAt === capturedAt ? Date.now() : endedAt);
        const actualType = recorder.mimeType || parts[0]?.type || mimeType;
        const blob = new Blob(parts, { type: actualType ?? "" });
        this.finalizedMs += endedAt - capturedAt; this.lastEnd = endedAt;
        if (!blob.size || !actualType || blob.size > MAX_LOCAL_BYTES) {
          this.releaseStream();
          this.update({ phase: "failed", message: !blob.size ? "The browser returned no audio for this segment. Some audio may be missing. Try a new recording." : !actualType ? "The browser didn’t identify its audio format. This segment can’t be safely uploaded; try another supported browser." : "This audio segment exceeded the local size limit and could not be kept. Recording has stopped." });
          void this.adapter.setSessionState(sessionId, "interrupted").catch(() => {});
        } else {
          const segment: LocalSegment = { blob, sessionId, sequence, capturedAt, endedAt, url: URL.createObjectURL(blob), attempts: 0 };
          this.update({ segments: [...this.snapshot.segments, segment], elapsed: Math.floor(this.finalizedMs / 1000), mimeType: blob.type });
          void this.drain();
        }
      }
      this.stopped?.(); this.stopped = undefined;
    };
    // Set the capture end at stop request, not a delayed dataavailable event.
    const nativeStop = recorder.stop.bind(recorder);
    recorder.stop = () => { endedAt = Date.now(); nativeStop(); };
    recorder.start();
    this.rotation = setTimeout(async () => {
      await this.finalizeSegment();
      if (this.snapshot.phase !== "recording") return;
      if (this.snapshot.segments.length >= MAX_PENDING_SEGMENTS || this.snapshot.segments.reduce((sum, segment) => sum + segment.blob.size, 0) >= MAX_LOCAL_BYTES) {
        await this.interrupt("Local upload queue is full. Recording stopped to protect your audio. Save or retry your segments before resuming.");
        return;
      }
      this.beginSegment(mimeType);
    }, SEGMENT_MS);
  }

  private async finalizeSegment() {
    clearTimeout(this.rotation);
    const recorder = this.recorder;
    if (!recorder || recorder.state === "inactive") return;
    await new Promise<void>((resolve) => { this.stopped = resolve; recorder.stop(); });
  }

  private releaseStream() {
    for (const track of this.stream?.getTracks() ?? []) { track.onended = null; track.onmute = null; track.stop(); }
    this.stream = undefined;
    clearInterval(this.heartbeat); clearTimeout(this.rotation);
  }

  private async changePhase(phase: "paused" | "interrupted" | "stopped", message: string) {
    if (this.transitioning) return;
    this.transitioning = true;
    this.generation++;
    const session = this.session;
    if (phase === "stopped") this.session = undefined;
    this.update({ phase, message });
    await this.finalizeSegment(); this.releaseStream();
    if (session) {
      try { await this.adapter.setSessionState(session, phase); }
      catch { this.update({ message: `${message} The server state could not be updated; capture is stopped on this device.` }); }
    }
    this.transitioning = false;
  }
  pause = () => this.changePhase("paused", "Recording is paused. Tap Resume when everyone is ready.");
  interrupt = (message: string) => ["starting", "recording"].includes(this.snapshot.phase) ? this.changePhase("interrupted", message) : Promise.resolve();
  stop = () => this.changePhase("stopped", "Recording stopped. Check any pending uploads before closing Hale.");

  private async drain() {
    if (this.adapter.mode === "demo" || this.snapshot.uploading || !this.alive || document.visibilityState !== "visible") return;
    const next = this.snapshot.segments.find((segment) => !segment.error && segment.attempts < 3);
    if (!next) return;
    this.update({ uploading: true }); next.attempts++;
    try {
      await this.adapter.uploadSegment(next.sessionId, next);
      URL.revokeObjectURL(next.url);
      this.update({ segments: this.snapshot.segments.filter((segment) => segment !== next), uploaded: this.snapshot.uploaded + 1 });
    } catch {
      next.error = "Upload failed. Keep this page open and retry.";
      this.update({ segments: [...this.snapshot.segments] });
      if (next.attempts < 3) this.retryTimer = setTimeout(() => { next.error = undefined; void this.drain(); }, next.attempts * 2000);
    } finally {
      this.update({ uploading: false });
      if (!next.error) void this.drain();
    }
  }
  retry = () => { for (const segment of this.snapshot.segments) { segment.error = undefined; segment.attempts = 0; } void this.drain(); };
  discard = (sequence: number) => {
    if (this.snapshot.uploading) return;
    const segment = this.snapshot.segments.find((item) => item.sequence === sequence);
    if (segment) URL.revokeObjectURL(segment.url);
    this.update({ segments: this.snapshot.segments.filter((item) => item.sequence !== sequence) });
  };

  attach() {
    this.alive = true;
    const visibility = () => { if (document.visibilityState !== "visible") void this.interrupt("Hale left the foreground. Recording stopped; there may be a gap. Tap Resume when you return."); else void this.drain(); };
    const pagehide = () => { void this.interrupt("The page was interrupted. Audio not uploaded may be lost."); };
    const unload = (event: BeforeUnloadEvent) => { if (this.snapshot.phase === "recording" || this.snapshot.segments.length) { event.preventDefault(); event.returnValue = ""; } };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", pagehide); window.addEventListener("beforeunload", unload);
    window.addEventListener("online", this.retry);
    return () => {
      this.alive = false; this.generation++; clearTimeout(this.retryTimer);
      if (this.session && ["starting", "recording", "paused"].includes(this.snapshot.phase)) void this.adapter.setSessionState(this.session, "interrupted").catch(() => {});
      if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
      this.releaseStream();
      for (const segment of this.snapshot.segments) URL.revokeObjectURL(segment.url);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", pagehide); window.removeEventListener("beforeunload", unload); window.removeEventListener("online", this.retry);
    };
  }
}
