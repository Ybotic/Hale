"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { AudioLines, CircleAlert, Download, Mic, Pause, Play, RotateCcw, Square, Trash2 } from "lucide-react";
import { durationLabel } from "@hale/contracts/time";
import { ForegroundRecorder } from "@/lib/recorder";
import { useWorkspace } from "./providers";
import { Expander, RecorderIndicator } from "./ui-primitives";
import { Button } from "./ui/button";
import { hasSpaceCapability } from "@/lib/ui-permissions";

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
  const active = capture.phase === "recording";
  const resumable = ["paused", "interrupted"].includes(capture.phase);
  const hasSession = active || resumable;
  const captureError = capture.phase === "failed" || capture.phase === "interrupted";
  if (compact && !hasSession && !capture.segments.length && !capture.uploading) return null;
  if (!hasSpaceCapability(space.capabilities, "recordings:create")) return compact ? null : <div className="info-strip">This account doesn’t have permission to record in this patient space.</div>;
  return <section className={`recorder-card ${compact ? "recorder-compact" : ""} ${active ? "recorder-active" : ""}`} aria-label="Foreground recording controls">
     <div className="recorder-card-head"><span className={`record-icon ${active ? "record-icon-active" : ""}`}><Mic aria-hidden size={24} /></span><div><h2 aria-live="polite">{active ? "Recording" : capture.phase === "interrupted" ? "Recording interrupted" : capture.phase === "paused" ? "A little pause" : "Keep a little of this moment."}</h2>{(active || resumable) && <p>{active ? "Keep Hale open. Pause or stop at any time." : "Nothing is recording until you tap Resume."}</p>}</div>{hasSession && <RecorderIndicator label={active ? "Recording" : capture.phase === "paused" ? "Paused" : "Interrupted"} duration={durationLabel(capture.elapsed)} elapsedSeconds={capture.elapsed} />}</div>
      {capture.message && <p className={`capture-message ${captureError ? "error-text" : ""}`} role={captureError ? "alert" : "status"} aria-live={captureError ? "assertive" : "polite"}>{captureError ? <CircleAlert aria-hidden /> : <AudioLines aria-hidden />}{capture.message}</p>}
     <div className="recording-actions">{active ? <><Button variant="secondary" onClick={() => void controller.pause()}><Pause aria-hidden />Pause</Button><Button variant="primary" size="lg" className="patient-recording-stop" onClick={() => void controller.stop()}><Square aria-hidden fill="currentColor" />Stop recording</Button></> : resumable ? <><Button variant="primary" size="lg" onClick={() => void controller.start()}><Play aria-hidden />Resume recording</Button><Button variant="secondary" onClick={() => void controller.stop()}><Square aria-hidden />Finish</Button></> : !compact && <>
       <Button variant="primary" size="lg" className="patient-recording-start" pending={capture.phase === "starting" || capture.uploading} disabled={capture.phase === "starting" || capture.uploading} onClick={() => void controller.start()}><Mic aria-hidden />{capture.phase === "starting" ? "Opening microphone…" : capture.uploading ? "Saving recording…" : "Start a conversation"}</Button>
     </>}</div>
    {!compact && !hasSession && <Expander className="patient-recording-explainer" summary="What this means">
      <p>Keep Hale open while recording. Pause or stop at any time.</p>
      {mode === "live" && <p>Raw audio is kept for up to seven days. Transcripts and saved memories remain until you delete them. Consented audio may be processed by external services to create transcripts and identify speakers.</p>}
      {mode === "demo" && <p className="capture-footnote">Demo capture: audio stays in this page’s memory. Download it to save a consented file; it is not uploaded or transcribed.</p>}
    </Expander>}
     {(capture.segments.length > 0 || capture.uploaded > 0) && <div className="capture-segments"><p className="eyebrow">{capture.uploading ? "Saving your recording…" : `${capture.uploaded} parts saved`}</p><p className="small muted">Keep Hale open until your recording is saved.</p>{capture.segments.some((segment) => segment.error) && mode === "live" && <Button variant="secondary" disabled={capture.uploading} onClick={controller.retry}><RotateCcw aria-hidden />Retry saving</Button>}<details className="capture-details"><summary>Audio details</summary>{capture.segments.map((segment) => <div className="capture-segment" key={segment.sequence}><span><strong>Part {segment.sequence + 1}</strong><span className="mono">{durationLabel((segment.endedAt - segment.capturedAt) / 1000)}</span>{segment.error && <span className="error-text">{segment.error}</span>}</span><a className="icon-button" href={segment.url} download={`hale-consented-segment-${segment.sequence + 1}.${segment.blob.type.includes("mp4") ? "m4a" : segment.blob.type.includes("ogg") ? "ogg" : "webm"}`} aria-label={`Download part ${segment.sequence + 1}`} data-visible-label="Download"><Download aria-hidden /></a><Button variant="ghost" className="icon-button" disabled={capture.uploading} aria-label={`Discard part ${segment.sequence + 1}`} data-visible-label="Discard" onClick={() => controller.discard(segment.sequence)}><Trash2 aria-hidden /></Button></div>)}{mode === "live" && capture.segments.length > 0 && <Button variant="secondary" disabled={capture.uploading} onClick={controller.retry}><RotateCcw aria-hidden />Retry saving</Button>}<p className="small muted">Unsent audio is lost if Hale closes. Recordings stay in the foreground.</p></details></div>}
  </section>;
}
