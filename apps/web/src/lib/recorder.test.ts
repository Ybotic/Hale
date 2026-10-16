import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { chooseMimeType, ForegroundRecorder } from "./recorder";

let cleanup: (() => void) | undefined;
const original = new Map<string, PropertyDescriptor | undefined>();
let visibility = "visible";
let track: { stop: ReturnType<typeof mock>; onended: (() => void) | null; onmute: (() => void) | null };
let getUserMedia: ReturnType<typeof mock>;
let documentEvents: EventTarget;

class FakeRecorder {
  static isTypeSupported = (mime: string) => mime === "audio/mp4";
  state = "inactive";
  mimeType = "audio/mp4";
  ondataavailable?: (event: { data: Blob }) => void;
  onstop?: () => void;
  onerror?: () => void;
  start() { this.state = "recording"; }
  stop() {
    this.state = "inactive";
    queueMicrotask(() => { this.ondataavailable?.({ data: new Blob(["complete mock media"], { type: this.mimeType }) }); this.onstop?.(); });
  }
}

function global(name: string, value: unknown) {
  original.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { configurable: true, value });
}

beforeEach(() => {
  visibility = "visible";
  track = { stop: mock(() => {}), onended: null, onmute: null };
  getUserMedia = mock(async () => ({ getTracks: () => [track] }));
  documentEvents = new EventTarget();
  Object.defineProperty(documentEvents, "visibilityState", { get: () => visibility });
  const windowEvents = new EventTarget();
  Object.defineProperty(windowEvents, "isSecureContext", { value: true });
  global("document", documentEvents); global("window", windowEvents);
  global("navigator", { mediaDevices: { getUserMedia } }); global("MediaRecorder", FakeRecorder);
});

afterEach(() => {
  cleanup?.(); cleanup = undefined;
  for (const [name, descriptor] of original) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  original.clear();
});

function setup(mode: "live" | "demo" = "demo") {
  let nextSession = 0;
  const beginSession = mock(async () => `session-${++nextSession}`);
  const setSessionState = mock(async () => {});
  const uploadSegment = mock(async () => {});
  const controller = new ForegroundRecorder({ mode, beginSession, setSessionState, uploadSegment });
  cleanup = controller.attach();
  return { controller, beginSession, setSessionState, uploadSegment };
}
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("foreground capture lifecycle", () => {
  test("detects a supported MIME type rather than hardcoding WebM", () => {
    expect(chooseMimeType((mime) => mime.includes("mp4"))).toBe("audio/mp4");
    expect(chooseMimeType(() => false)).toBeUndefined();
  });
  test("pause finalizes a segment, retains its actual MIME type, and releases the microphone", async () => {
    const { controller } = setup();
    await controller.start(); expect(controller.getSnapshot().phase).toBe("recording");
    await controller.pause();
    const snapshot = controller.getSnapshot();
    expect(snapshot.phase).toBe("paused"); expect(snapshot.segments).toHaveLength(1);
    expect(snapshot.segments[0].blob.type).toBe("audio/mp4");
    expect(snapshot.segments[0].sessionId).toBe("session-1");
    expect(track.stop).toHaveBeenCalled();
  });
  test("backgrounding interrupts; returning never resumes automatically", async () => {
    const { controller, beginSession } = setup();
    await controller.start();
    visibility = "hidden"; documentEvents.dispatchEvent(new Event("visibilitychange")); await flush();
    expect(controller.getSnapshot().phase).toBe("interrupted");
    visibility = "visible"; documentEvents.dispatchEvent(new Event("visibilitychange")); await flush();
    expect(controller.getSnapshot().phase).toBe("interrupted");
    expect(beginSession).toHaveBeenCalledTimes(1);
  });
  test("permission denial is a failure, never a pretend recording", async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"));
    const { controller, beginSession } = setup(); await controller.start();
    expect(controller.getSnapshot().phase).toBe("failed");
    expect(controller.getSnapshot().message).toContain("denied");
    expect(controller.getSnapshot().segments).toHaveLength(0);
    expect(beginSession).not.toHaveBeenCalled();
  });
  test("a microphone permission resolved after unmount cannot start capture", async () => {
    let resolve!: (stream: unknown) => void;
    getUserMedia.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const { controller, beginSession } = setup();
    const starting = controller.start(); cleanup?.(); cleanup = undefined;
    resolve({ getTracks: () => [track] }); await starting;
    expect(beginSession).not.toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalled();
  });
  test("a page hidden during permission acquisition cannot start recording later", async () => {
    let resolve!: (stream: unknown) => void;
    getUserMedia.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const { controller, beginSession } = setup();
    const starting = controller.start(); visibility = "hidden";
    documentEvents.dispatchEvent(new Event("visibilitychange"));
    resolve({ getTracks: () => [track] }); await starting;
    expect(controller.getSnapshot().phase).toBe("interrupted");
    expect(beginSession).not.toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalled();
  });
  test("demo capture is never uploaded or turned into invented transcript evidence", async () => {
    const { controller, uploadSegment } = setup();
    await controller.start(); await controller.stop();
    expect(uploadSegment).not.toHaveBeenCalled();
    expect(controller.getSnapshot().uploaded).toBe(0);
    expect(controller.getSnapshot().segments).toHaveLength(1);
  });
  test("pending audio remains attached to its original session after Stop and a new recording", async () => {
    const { controller, uploadSegment } = setup("live");
    uploadSegment.mockRejectedValue(new Error("offline"));
    await controller.start(); await controller.stop(); await flush();
    await controller.start();
    uploadSegment.mockResolvedValue(undefined); controller.retry(); await flush();
    const calls = uploadSegment.mock.calls as unknown as [string, unknown][];
    expect(calls.at(-1)?.[0]).toBe("session-1");
    expect(controller.getSnapshot().uploaded).toBe(1);
    await controller.stop();
  });
  test("the local queue is bounded and requires an explicit user choice to continue", async () => {
    const { controller } = setup();
    for (let index = 0; index < 3; index++) { await controller.start(); await controller.pause(); }
    expect(controller.getSnapshot().segments).toHaveLength(3);
    await controller.start();
    expect(controller.getSnapshot().phase).toBe("paused");
    expect(controller.getSnapshot().message).toContain("Save or discard");
  });
});
