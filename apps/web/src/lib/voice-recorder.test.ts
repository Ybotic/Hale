import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { VOICE_SAMPLE_RATE } from "@hale/contracts/voice";
import { VoiceRecorder } from "./voice-recorder";

const originals = new Map<string, PropertyDescriptor | undefined>();
let cleanup: (() => void) | undefined;
let visibility: string;
let documentEvents: EventTarget;
let getUserMedia: ReturnType<typeof mock>;
let duration: number;
let amplitude: number;
let tracks: { stop: ReturnType<typeof mock>; onended: (() => void) | null; onmute: (() => void) | null }[];
const closed: ReturnType<typeof mock>[] = [];

class FakeRecorder {
  static isTypeSupported = (mime: string) => mime === "audio/webm";
  mimeType = "audio/webm";
  state = "inactive";
  ondataavailable?: ((event: { data: Blob }) => void) | null;
  onstop?: (() => void) | null;
  onerror?: (() => void) | null;
  start() { this.state = "recording"; }
  stop() {
    this.state = "inactive";
    queueMicrotask(() => { this.ondataavailable?.({ data: new Blob(["fake complete container"]) }); this.onstop?.(); });
  }
}
class FakeContext {
  close = mock(async () => {});
  constructor() { closed.push(this.close); }
  resume = async () => {};
  createAnalyser = () => ({ fftSize: 256, getByteTimeDomainData: (values: Uint8Array) => values.fill(135) });
  createMediaStreamSource = () => ({ connect: () => {} });
  decodeAudioData = async () => ({ duration });
}
class FakeOfflineContext {
  destination = {};
  constructor(_channels: number, private length: number) {}
  createBufferSource = () => ({ buffer: undefined, connect: () => {}, start: () => {} });
  startRendering = async () => ({ getChannelData: () => Float32Array.from({ length: this.length }, (_, i) => amplitude * Math.sin(i * 2 * Math.PI * 440 / VOICE_SAMPLE_RATE)) });
}
function global(name: string, value: unknown) {
  originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { configurable: true, value });
}
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
function setup() {
  const controller = new VoiceRecorder(); cleanup = controller.attach(); return controller;
}
beforeEach(() => {
  visibility = "visible"; duration = 12; amplitude = .1; tracks = []; closed.length = 0;
  documentEvents = new EventTarget();
  Object.defineProperty(documentEvents, "visibilityState", { get: () => visibility });
  const windowEvents = new EventTarget(); Object.defineProperty(windowEvents, "isSecureContext", { value: true });
  getUserMedia = mock(async () => {
    const track = { stop: mock(() => {}), onended: null, onmute: null }; tracks.push(track);
    return { getTracks: () => [track] };
  });
  global("window", windowEvents); global("document", documentEvents); global("navigator", { mediaDevices: { getUserMedia } });
  global("MediaRecorder", FakeRecorder); global("AudioContext", FakeContext); global("OfflineAudioContext", FakeOfflineContext);
});
afterEach(() => {
  cleanup?.(); cleanup = undefined;
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name);
  }
  originals.clear();
});

describe("single-take voice setup capture", () => {
  test("does not request microphone access until Start, releases tracks at Stop, and makes a real WAV", async () => {
    const controller = setup(); expect(getUserMedia).not.toHaveBeenCalled();
    await controller.start(); expect(controller.getSnapshot().phase).toBe("recording");
    controller.stop(); await flush();
    const sample = controller.getSnapshot().sample;
    expect(controller.getSnapshot().phase).toBe("ready");
    expect(sample?.duration).toBe(12); expect(sample?.blob.type).toBe("audio/wav");
    expect(new TextDecoder().decode((await sample!.blob.arrayBuffer()).slice(0, 4))).toBe("RIFF");
    expect(tracks[0].stop).toHaveBeenCalled();
    expect(closed.every((close) => close.mock.calls.length > 0)).toBe(true);
    controller.reset(); expect(controller.getSnapshot().sample).toBeUndefined();
  });
  test("permission denial fails without creating a sample", async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"));
    const controller = setup(); await controller.start();
    expect(controller.getSnapshot().phase).toBe("failed");
    expect(controller.getSnapshot().message).toContain("denied"); expect(controller.getSnapshot().sample).toBeUndefined();
  });
  test("a short or silent sample cannot become ready", async () => {
    const controller = setup(); duration = 5;
    await controller.start(); controller.stop(); await flush();
    expect(controller.getSnapshot().phase).toBe("failed"); expect(controller.getSnapshot().message).toContain("10 and 30");
    duration = 12; amplitude = 0;
    await controller.start(); controller.stop(); await flush();
    expect(controller.getSnapshot().message).toContain("too quiet"); expect(controller.getSnapshot().sample).toBeUndefined();
  });
  test("backgrounding discards the take and never automatically resumes", async () => {
    const controller = setup(); await controller.start();
    visibility = "hidden"; documentEvents.dispatchEvent(new Event("visibilitychange")); await flush();
    expect(controller.getSnapshot().phase).toBe("failed"); expect(controller.getSnapshot().sample).toBeUndefined();
    expect(tracks[0].stop).toHaveBeenCalled();
    visibility = "visible"; documentEvents.dispatchEvent(new Event("visibilitychange"));
    expect(controller.getSnapshot().phase).toBe("failed"); expect(getUserMedia).toHaveBeenCalledTimes(1);
  });
  test("a late permission grant after leaving cannot start recording", async () => {
    let resolve!: (stream: unknown) => void;
    getUserMedia.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const controller = setup(); const pending = controller.start();
    cleanup?.(); cleanup = undefined;
    const stop = mock(() => {}); resolve({ getTracks: () => [{ stop }] }); await pending;
    expect(stop).toHaveBeenCalled(); expect(controller.getSnapshot().sample).toBeUndefined();
  });
  test("track interruption discards audio instead of presenting an incomplete take", async () => {
    const controller = setup(); await controller.start(); tracks[0].onmute?.(); await flush();
    expect(controller.getSnapshot().phase).toBe("failed"); expect(controller.getSnapshot().sample).toBeUndefined();
  });
  test("a reset and immediate new take cannot have its microphone released by an old stop callback", async () => {
    const controller = setup(); await controller.start(); controller.reset(); await controller.start(); await flush();
    expect(controller.getSnapshot().phase).toBe("recording"); expect(tracks[1].stop).not.toHaveBeenCalled();
  });
});
