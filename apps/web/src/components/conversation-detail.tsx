"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, AudioLines, LoaderCircle, Play, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import type { Conversation, Memory, TranscriptTurn } from "@hale/contracts";
import { clockLabel, dateLabel, durationLabel, localDate } from "@hale/contracts/time";
import { useWorkspace } from "./providers";
import { apiPath, apiRequest, useApiQuery } from "@/lib/api-client";
import { EmptyState, MemoryCard, PeopleStack, StatusPill } from "./ui";

export function ConversationDetail({ id, patient = false }: { id: string; patient?: boolean }) {
  const { space, mode } = useWorkspace();
  if (mode === "live") return <LiveDetail id={id} patient={patient} />;
  const conversation = space.conversations.find((item) => item.id === id);
  if (!conversation) return <EmptyState title="This conversation isn’t available." description="It may have been deleted, or you may not have access to it."><Link className="text-link" href={patient ? "/patient/memories" : "/family/conversations"}>Return to your memories</Link></EmptyState>;
  return <DetailView conversation={conversation} turns={conversation.turns} audioUrl={null} patient={patient} />;
}

type ProcessingStatus = {
  state: string;
  stage: string;
  attempts: number;
  error: string | null;
  audioAvailable: boolean;
  retryAvailable: boolean;
  workerOnline: boolean;
  workerLastSeen: number | null;
  transcriptionOnly: boolean;
  localGpu: boolean;
  speakerIdentificationAvailable: boolean;
  consentedVoiceProfiles: number;
};

const PROCESSING_ERROR_LABELS: Record<string, string> = {
  openrouter_not_configured: "The transcription provider is not configured on the worker.",
  openrouter_http_401: "The transcription provider rejected its API key.",
  openrouter_http_429: "The transcription provider is busy or rate-limited.",
  pyannote_not_configured: "Speaker processing is not configured on the worker.",
  pyannote_job_failed: "Speaker processing did not complete. You can retry or switch to transcript-only mode.",
  backboard_not_configured: "Memory extraction is not configured on the worker.",
  local_gpu_runtime_unavailable: "The local GPU transcription runtime is missing or CUDA libraries could not load.",
  local_gpu_transcription_failed: "The local GPU model could not transcribe this audio.",
  local_gpu_invalid_transcript: "The local GPU model returned an invalid transcript.",
  local_gpu_timeout: "Local GPU transcription took too long and can be retried.",
  audio_unavailable: "This recording’s audio is no longer available to process.",
  recording_consent_update_required: "Review the updated recording consent before recording again.",
  processing_unavailable: "A processing provider did not complete this recording.",
};

function LiveDetail({ id, patient }: { id: string; patient: boolean }) {
  const { space } = useWorkspace();
  const { data: detail, error } = useApiQuery<{ patientId: string; conversation: Conversation; memories: Memory[]; turns: TranscriptTurn[]; audioUrl: string | null }>(`conversations/${id}`, true, 5_000);
  if (error) return <EmptyState title="This conversation isn’t available." description="It may have been deleted, or you may not have access to it." />;
  if (!detail) return <p className="results-label muted" role="status">Loading the conversation…</p>;
  if (detail.patientId !== space.id) return <EmptyState title="This conversation belongs to a different patient space." description="Select the matching patient space to review its conversation." />;
  return <DetailView conversation={detail.conversation} turns={detail.turns} audioUrl={detail.audioUrl} savedMemories={detail.memories} patient={patient} />;
}

function DetailView({ conversation, turns, audioUrl, loading, patient, savedMemories }: { conversation: Conversation; turns: TranscriptTurn[]; audioUrl: string | null; loading?: boolean; patient: boolean; savedMemories?: Memory[] }) {
  const { space, mode, deleteConversation } = useWorkspace();
  const router = useRouter();
  const audio = useRef<HTMLAudioElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryMessage, setRetryMessage] = useState("");
  const base = patient ? "/patient" : "/family";
  const memories = savedMemories ?? space.memories.filter((memory) => memory.conversationId === conversation.id);
  const statusPath = apiPath("processing-status", { patientId: space.id, conversationId: conversation.id });
  const { data: processing } = useApiQuery<ProcessingStatus>(statusPath, mode === "live", 5_000);

  async function retryProcessing() {
    setRetrying(true); setError(""); setRetryMessage("");
    try {
      await apiRequest(`conversations/${conversation.id}/retry-processing`, { method: "POST" });
      setRetryMessage("Recording queued again. This page will update as processing runs.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The recording could not be queued again.");
    } finally { setRetrying(false); }
  }

  const processingStage = processing?.stage === "transcribe" ? "Transcribing audio"
    : processing?.stage === "diarize" ? "Separating speakers"
      : processing?.stage === "merge" ? "Building timestamped transcript"
        : processing?.stage === "extract" ? "Saving source-linked memories" : "Processing recording";
  const processingPending = conversation.state === "queued" || conversation.state === "processing"
    || processing?.state === "queued" || processing?.state === "processing";
  const processingFailed = conversation.state === "failed" || processing?.state === "failed";
  const processingMessage = !processing?.workerOnline
    ? "No audio worker has checked in recently. Recordings stay queued until bun run worker is running."
    : processing.transcriptionOnly
      ? "Transcript-only mode is on. This recording will not be diarized or matched to voice profiles."
      : !processing.speakerIdentificationAvailable
        ? `${processingStage}. The worker cannot reach pyannote for speaker identification; check its API key and public APP_ORIGIN.`
        : processing.consentedVoiceProfiles === 0
          ? `${processingStage}. No enrolled profiles have matching consent in this patient space, so speakers will stay unidentified.`
          : `${processingStage}. Pyannote will compare this recording against ${processing.consentedVoiceProfiles} consented voice ${processing.consentedVoiceProfiles === 1 ? "profile" : "profiles"}; uncertain matches stay unnamed.`;
  return <>
    <Link className="back-link" href={patient ? "/patient/memories" : "/family/conversations"}><ArrowLeft size={16} />All conversations</Link>
    <header className="detail-heading"><div><p className="eyebrow">{dateLabel(localDate(conversation.startedAt, space.timezone))} · {clockLabel(conversation.startedAt, space.timezone)}</p><h1>{conversation.title}</h1><div className="detail-meta"><StatusPill state={conversation.state} /><span>{Math.round(conversation.duration / 60)} min</span><span>{turns.length} speaker turns</span>{conversation.synthetic && <span>Synthetic transcript</span>}</div></div>{space.capabilities.includes("evidence:delete") && <button className="btn btn-quiet delete-trigger" onClick={() => dialog.current?.showModal()}><Trash2 size={15} />Delete</button>}</header>
    <div className="transcript-layout"><section className="transcript-main" aria-label="Conversation transcript"><div className="audio-player"><AudioLines size={23} /><div><strong>Original recording</strong><span>{audioUrl ? "Select a timestamp to play from that moment." : conversation.synthetic ? "No audio is attached to this synthetic example." : conversation.state === "queued" ? "Uploaded audio is waiting for the audio worker." : "Audio may be expired, deleted, or unavailable."}</span></div>{audioUrl && <audio ref={audio} controls preload="metadata" src={audioUrl}>Your browser does not support audio playback.</audio>}</div>
      {mode === "live" && processingPending && <div className="info-strip" role="status"><AudioLines size={17} /><p>{processingMessage}{processing?.localGpu && !processing.transcriptionOnly ? " Transcription is running locally; the consented audio is sent to pyannote for speaker matching." : ""}</p></div>}
      {mode === "live" && processingFailed && <div className="info-strip" role="status"><ShieldCheck size={17} /><div><p>{processing?.error === "processing_unavailable" && processing.stage === "extract" ? "The transcript is available, but source-linked memory extraction did not finish. You can retry it." : processing?.error ? PROCESSING_ERROR_LABELS[processing.error] ?? "Audio processing did not complete." : "Audio processing did not complete."}{processing && !processing.workerOnline ? " No worker is currently connected." : ""}</p>{processing?.retryAvailable && <button className="btn btn-quiet" disabled={retrying} onClick={() => void retryProcessing()}>{retrying ? <LoaderCircle className="voice-spinner" size={15} /> : <RotateCcw size={15} />}{retrying ? "Queueing…" : "Retry processing"}</button>}</div></div>}
      {retryMessage && <p className="small handoff-status" role="status">{retryMessage}</p>}
      {error && <p className="error-text" role="alert">{error}</p>}
      {turns.length ? <ol className="transcript-turns">{turns.map((turn) => <li id={turn.id} key={turn.id} className={`transcript-turn ${turn.uncertain ? "turn-uncertain" : ""}`}><button className="turn-timestamp mono" disabled={!audioUrl} aria-label={`Play ${turn.speaker} at ${durationLabel(turn.start)}`} onClick={() => { if (audio.current) { audio.current.currentTime = turn.start; void audio.current.play().catch(() => setError("Playback could not start. Use the recording controls to try again.")); } }}>{durationLabel(turn.start)}{audioUrl && <Play size={11} />}</button><div className="turn-content"><p className="turn-speaker eyebrow">{turn.speaker}{turn.uncertain && <span> · Attribution uncertain</span>}</p><p>{turn.text}</p></div></li>)}</ol> : <EmptyState title={loading ? "Loading the transcript…" : conversation.state === "queued" ? "The words are on their way." : "No transcript available yet."} description="No text or speaker identity is invented while processing is incomplete." />}
      <p className="transcript-end mono">END OF AVAILABLE TRANSCRIPT · {turns.length} TURNS</p>
    </section><aside className="transcript-aside"><section><p className="eyebrow">A FEW WORDS ABOUT THIS CONVERSATION</p><p className="aside-summary">{conversation.summary}</p></section><section><p className="eyebrow">VOICES IN THIS RECORDING</p><PeopleStack ids={conversation.people} names /><p className="small muted">Unknown speakers stay unnamed. A spoken name alone doesn’t identify a voice.</p></section><section><p className="eyebrow">SAVED FROM THIS CONVERSATION</p><div className="aside-memories">{memories.length ? memories.map((memory) => <MemoryCard key={memory.id} memory={memory} base={base} />) : <p className="small muted">Sourced memories will appear after processing.</p>}</div></section><div className="notice"><ShieldCheck size={18} /><p>{mode === "demo" ? "This is a fictional example, not a real patient recording." : "Raw audio is retained for up to 7 days. Text remains until you delete it."} A recording is evidence of words, not proof of an activity.</p></div></aside></div>
    <dialog ref={dialog} className="confirm-dialog" aria-labelledby="delete-conversation-title"><h2 id="delete-conversation-title">Delete this conversation?</h2><p>This removes its audio, transcript, and extracted memories from this space. It does not cancel a ride or appointment, or change a medication record.</p>{mode === "demo" && <p className="small muted">Demo changes last until you reload or reset the demo.</p>}<div className="dialog-actions"><button className="btn btn-quiet" disabled={busy} onClick={() => dialog.current?.close()}>Keep conversation</button><button className="btn btn-danger" disabled={busy} onClick={async () => { setBusy(true); try { await deleteConversation(conversation.id); dialog.current?.close(); router.push(patient ? "/patient/memories" : "/family/conversations"); } catch { setError("Deletion failed. Your conversation is still available. Please try again."); dialog.current?.close(); } finally { setBusy(false); } }}>{busy ? "Deleting…" : "Delete conversation"}</button></div></dialog>
  </>;
}
