import { encodeVoiceWav, validateVoiceWav, VOICE_SAMPLE_RATE, VOICE_TARGET_SECONDS } from "@hale/contracts/voice";
import { chooseMimeType } from "./recorder";

export interface VoiceSample { blob: Blob; url: string; duration: number; requestId: string }
interface Snapshot {
  phase: "idle" | "starting" | "recording" | "converting" | "ready" | "failed";
  elapsed: number; levels: number[]; message: string; sample?: VoiceSample;
}

/** One intentional, foreground-only take. Nothing is uploaded by this controller. */
export class VoiceRecorder {
  private snapshot: Snapshot = { phase: "idle", elapsed: 0, levels: [], message: "" };
  private listeners = new Set<() => void>();
  private stream?: MediaStream;
  private recorder?: MediaRecorder;
  private context?: AudioContext;
  private timer?: ReturnType<typeof setInterval>;
  private alive = true;
  private generation = 0;
  private discardTake = false;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  private update(patch: Partial<Snapshot>) {
    if (!this.alive) return;
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private release() {
    clearInterval(this.timer);
    this.stream?.getTracks().forEach((track) => { track.onended = null; track.onmute = null; track.stop(); });
    this.stream = undefined;
    void this.context?.close().catch(() => {}); this.context = undefined;
  }
  reset = () => {
    this.generation++;
    this.discardTake = true;
    if (this.recorder?.state === "recording") this.recorder.stop();
    if (this.recorder) { this.recorder.ondataavailable = null; this.recorder.onstop = null; this.recorder.onerror = null; }
    this.recorder = undefined;
    this.release();
    if (this.snapshot.sample) URL.revokeObjectURL(this.snapshot.sample.url);
    this.update({ phase: "idle", elapsed: 0, levels: [], sample: undefined, message: "" });
  };
  async start() {
    if (["starting", "recording", "converting"].includes(this.snapshot.phase)) return;
    this.reset(); const generation = this.generation;
    this.update({ phase: "starting", message: "Allow microphone access when your browser asks." });
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined" || typeof AudioContext === "undefined" || typeof OfflineAudioContext === "undefined") throw new Error("Recording isn’t available here. Try Safari or Chrome on HTTPS or localhost.");
      const pendingStream = navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true } });
      const context = new AudioContext();
      this.context = context;
      void context.resume().catch(() => {});
      const stream = await pendingStream;
      if (!this.alive || generation !== this.generation || document.visibilityState !== "visible") { stream.getTracks().forEach((track) => track.stop()); void context.close().catch(() => {}); return; }
      this.stream = stream;
      const analyser = context.createAnalyser(); analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);
      const values = new Uint8Array(analyser.fftSize);
      const mime = typeof MediaRecorder.isTypeSupported === "function" ? chooseMimeType((type) => MediaRecorder.isTypeSupported(type)) : undefined;
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      this.recorder = recorder; this.discardTake = false;
      const parts: Blob[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) parts.push(event.data); };
      recorder.onerror = () => this.interrupt("The microphone was interrupted. Please record a new sample.");
      recorder.onstop = () => {
        if (generation !== this.generation) return;
        this.release();
        if (this.alive && !this.discardTake && generation === this.generation) void this.convert(new Blob(parts, { type: recorder.mimeType || parts[0]?.type }), generation);
      };
      stream.getTracks().forEach((track) => {
        track.onended = () => this.interrupt("Your microphone disconnected. Please try again.");
        track.onmute = () => this.interrupt("Your microphone was muted. Please try again.");
      });
      recorder.start();
      const started = Date.now();
      this.update({ phase: "recording", message: "Speak naturally. Keep this page open and your screen unlocked." });
      this.timer = setInterval(() => {
        analyser.getByteTimeDomainData(values);
        const rms = Math.sqrt(values.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / values.length);
        const elapsed = Math.min(VOICE_TARGET_SECONDS, (Date.now() - started) / 1000);
        this.update({ elapsed, levels: [...this.snapshot.levels.slice(-39), Math.min(1, rms * 5)] });
        if (elapsed >= VOICE_TARGET_SECONDS) this.stop();
      }, 100);
    } catch (error) {
      if (generation !== this.generation || !this.alive) return;
      this.release();
      this.update({ phase: "failed", message: error instanceof DOMException && error.name === "NotAllowedError" ? "Microphone access was denied. Allow it in your browser’s site settings, then try again." : error instanceof Error ? error.message : "We couldn’t start your microphone. Please try again." });
    }
  }
  stop = () => {
    if (this.recorder?.state !== "recording") return;
    this.update({ phase: "converting", message: "Preparing your sample for playback…" });
    this.recorder.stop(); this.release();
  };
  private interrupt(message: string) {
    if (!["recording", "starting"].includes(this.snapshot.phase)) return;
    this.reset(); this.update({ phase: "failed", message });
  }
  private async convert(blob: Blob, generation: number) {
    const context = new AudioContext();
    try {
      const decoded = await context.decodeAudioData(await blob.arrayBuffer());
      const frames = Math.floor(Math.min(decoded.duration, VOICE_TARGET_SECONDS) * VOICE_SAMPLE_RATE);
      const offline = new OfflineAudioContext(1, Math.max(1, frames), VOICE_SAMPLE_RATE);
      const source = offline.createBufferSource(); source.buffer = decoded; source.connect(offline.destination); source.start();
      const normalized = await offline.startRendering();
      const buffer = encodeVoiceWav(normalized.getChannelData(0));
      const { duration } = validateVoiceWav(buffer);
      if (!this.alive || generation !== this.generation) return;
      const sampleBlob = new Blob([buffer], { type: "audio/wav" });
      this.update({ phase: "ready", elapsed: duration, message: "Listen back. Make sure it’s only your voice and you can hear it clearly.", sample: { blob: sampleBlob, url: URL.createObjectURL(sampleBlob), duration, requestId: crypto.randomUUID() } });
    } catch (error) {
      if (generation === this.generation) this.update({ phase: "failed", message: error instanceof Error ? error.message : "We couldn’t prepare this sample. Try recording again." });
    } finally { await context.close().catch(() => {}); }
  }
  attach() {
    this.alive = true;
    const hidden = () => { if (document.visibilityState !== "visible") this.interrupt("Recording stopped when you left this page. Keep Hale open and try again."); };
    const pagehide = () => this.interrupt("Recording was interrupted. Please record again.");
    document.addEventListener("visibilitychange", hidden); window.addEventListener("pagehide", pagehide);
    return () => { this.reset(); this.alive = false; document.removeEventListener("visibilitychange", hidden); window.removeEventListener("pagehide", pagehide); };
  }
}
