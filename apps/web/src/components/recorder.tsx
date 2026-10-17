"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { Download, Mic, Pause, Play, RotateCcw, Square, Trash2 } from "lucide-react";
import { durationLabel } from "@hale/contracts/time";
import { ForegroundRecorder } from "@/lib/recorder";
import { useWorkspace } from "./providers";

const CaptureContext = createContext<ForegroundRecorder | null>(null);
export const useRecordingController = () => useContext(CaptureContext);

export function RecordingProvider({ children }: { children: React.ReactNode }) {
  const workspace = useWorkspace();
  const [controller] = useState(() => new ForegroundRecorder(workspace));
  useEffect(() => controller.attach(), [controller]);
  return <CaptureContext.Provider value={controller}>{children}</CaptureContext.Provider>;
}

export function RecorderCard({ compact = false }: { compact?: boolean }) {
  const controller = useContext(CaptureContext);
  if (!controller) throw new Error("Recording provider missing.");
  return <CaptureControls controller={controller} compact={compact} />;
}

function CaptureControls({ controller, compact }: { controller: ForegroundRecorder; compact: boolean }) {
  const { mode, space } = useWorkspace();
  const capture = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [consent, setConsent] = useState(false);
  const active = capture.phase === "recording";
  const resumable = ["paused", "interrupted"].includes(capture.phase);
  const hasSession = active || resumable;
  if (compact && !hasSession && !capture.segments.length && !capture.uploading) return null;
  if (!space.capabilities.includes("recordings:create")) return compact ? null : <div className="info-strip">This account doesn’t have permission to record in this patient space.</div>;
  return <section className={`recorder-card ${compact ? "recorder-compact" : ""} ${active ? "recorder-active" : ""}`} aria-label="Foreground recording controls">
    <div className="recorder-card-head"><span className={`record-icon ${active ? "record-icon-active" : ""}`}><Mic size={compact ? 18 : 25} /></span><div><h2>{active ? "Recording your conversation" : capture.phase === "interrupted" ? "Recording interrupted" : capture.phase === "paused" ? "A little pause" : "Keep a little of this moment."}</h2><p>{active ? "Keep Hale open. Pause or stop at any time." : resumable ? "Nothing is recording until you tap Resume." : "Record a conversation, with everyone’s permission."}</p></div>{hasSession && <span className="recording-time mono">{durationLabel(capture.elapsed)}</span>}</div>
    {capture.message && <p className={`capture-message ${capture.phase === "failed" || capture.phase === "interrupted" ? "error-text" : ""}`} role="status">{capture.message}</p>}
     {!compact && !hasSession && <label className="check-label recording-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>Everyone taking part agrees to recording and cloud processing by TigerData, OpenRouter, and pyannote.ai. Voice matching is separate opt-in. Recording remains foreground-only.</span></label>}
    <div className="recording-actions">{active ? <><button className="btn btn-quiet" onClick={() => void controller.pause()}><Pause size={17} />Pause</button><button className="btn btn-ink" onClick={() => void controller.stop()}><Square size={15} fill="currentColor" />Stop recording</button></> : resumable ? <><button className="btn btn-primary" onClick={() => void controller.start()}><Play size={17} />Resume recording</button><button className="btn btn-quiet" onClick={() => void controller.stop()}><Square size={15} />Finish</button></> : !compact && <button className="btn btn-primary" disabled={!consent || capture.phase === "starting" || capture.uploading} onClick={() => void controller.start()}><Mic size={18} />{capture.phase === "starting" ? "Opening microphone…" : "Start a conversation"}</button>}</div>
    {!compact && mode === "demo" && <p className="capture-footnote">Demo capture: audio stays in this page’s memory. Download it to save a consented file; it is not uploaded or transcribed.</p>}
    {(capture.segments.length > 0 || capture.uploaded > 0) && <div className="capture-segments"><p className="eyebrow">{capture.uploading ? "UPLOADING…" : `${capture.segments.length} LOCAL SEGMENTS · ${capture.uploaded} UPLOADED`}</p>{capture.segments.map((segment) => <div className="capture-segment" key={segment.sequence}><span><strong>Segment {segment.sequence + 1}</strong><span className="mono">{durationLabel((segment.endedAt - segment.capturedAt) / 1000)} · {segment.blob.type}</span>{segment.error && <span className="error-text">{segment.error}</span>}</span><a className="icon-button" href={segment.url} download={`hale-consented-segment-${segment.sequence + 1}.${segment.blob.type.includes("mp4") ? "m4a" : segment.blob.type.includes("ogg") ? "ogg" : "webm"}`} aria-label={`Download segment ${segment.sequence + 1}`}><Download size={17} /></a><button className="icon-button" disabled={capture.uploading} aria-label={`Discard segment ${segment.sequence + 1}`} onClick={() => controller.discard(segment.sequence)}><Trash2 size={17} /></button></div>)}{mode === "live" && capture.segments.length > 0 && <button className="btn btn-quiet" disabled={capture.uploading} onClick={controller.retry}><RotateCcw size={15} />Retry uploads</button>}
      <p className="small muted">Unsent audio is lost if this page closes. Queue limit: 3 segments. Recorder rotations and interruptions can leave gaps{capture.gaps > 0 ? ` (at least ${capture.gaps.toFixed(1)}s observed)` : ""}. Displayed duration is wall-clock capture time, not decoded-media coverage.</p>
    </div>}
  </section>;
}
