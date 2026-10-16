"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { ArrowLeft, AudioLines, Play, ShieldCheck, Trash2 } from "lucide-react";
import type { Conversation, Memory, TranscriptTurn } from "@mnemo/contracts";
import { clockLabel, dateLabel, durationLabel, localDate } from "@mnemo/contracts/time";
import { useWorkspace } from "./providers";
import { api } from "@/lib/api";
import { EmptyState, MemoryCard, PeopleStack, StatusPill } from "./ui";

export function ConversationDetail({ id, patient = false }: { id: string; patient?: boolean }) {
  const { space, mode } = useWorkspace();
  if (mode === "live") return <LiveDetail id={id} patient={patient} />;
  const conversation = space.conversations.find((item) => item.id === id);
  if (!conversation) return <EmptyState title="This conversation isn’t available." description="It may have been deleted, or you may not have access to it."><Link className="text-link" href={patient ? "/patient/memories" : "/family/conversations"}>Return to your memories</Link></EmptyState>;
  return <DetailView conversation={conversation} turns={conversation.turns} audioUrl={null} patient={patient} />;
}

function LiveDetail({ id, patient }: { id: string; patient: boolean }) {
  const { space } = useWorkspace();
  const detail = useQuery(api.detail, { conversationId: id });
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
  const base = patient ? "/patient" : "/family";
  const memories = savedMemories ?? space.memories.filter((memory) => memory.conversationId === conversation.id);
  return <>
    <Link className="back-link" href={patient ? "/patient/memories" : "/family/conversations"}><ArrowLeft size={16} />All conversations</Link>
    <header className="detail-heading"><div><p className="eyebrow">{dateLabel(localDate(conversation.startedAt, space.timezone))} · {clockLabel(conversation.startedAt, space.timezone)}</p><h1>{conversation.title}</h1><div className="detail-meta"><StatusPill state={conversation.state} /><span>{Math.round(conversation.duration / 60)} min</span><span>{turns.length} speaker turns</span>{conversation.synthetic && <span>Synthetic transcript</span>}</div></div>{space.capabilities.includes("evidence:delete") && <button className="btn btn-quiet delete-trigger" onClick={() => dialog.current?.showModal()}><Trash2 size={15} />Delete</button>}</header>
    <div className="transcript-layout"><section className="transcript-main" aria-label="Conversation transcript"><div className="audio-player"><AudioLines size={23} /><div><strong>Original recording</strong><span>{audioUrl ? "Select a timestamp to play from that moment." : conversation.synthetic ? "No audio is attached to this synthetic example." : conversation.state === "queued" ? "Uploaded audio is waiting for the audio worker." : "Audio may be expired, deleted, or unavailable."}</span></div>{audioUrl && <audio ref={audio} controls preload="metadata" src={audioUrl}>Your browser does not support audio playback.</audio>}</div>
      {error && <p className="error-text" role="alert">{error}</p>}
      {turns.length ? <ol className="transcript-turns">{turns.map((turn) => <li id={turn.id} key={turn.id} className={`transcript-turn ${turn.uncertain ? "turn-uncertain" : ""}`}><button className="turn-timestamp mono" disabled={!audioUrl} aria-label={`Play ${turn.speaker} at ${durationLabel(turn.start)}`} onClick={() => { if (audio.current) { audio.current.currentTime = turn.start; void audio.current.play().catch(() => setError("Playback could not start. Use the recording controls to try again.")); } }}>{durationLabel(turn.start)}{audioUrl && <Play size={11} />}</button><div className="turn-content"><p className="turn-speaker eyebrow">{turn.speaker}{turn.uncertain && <span> · Attribution uncertain</span>}</p><p>{turn.text}</p></div></li>)}</ol> : <EmptyState title={loading ? "Loading the transcript…" : conversation.state === "queued" ? "The words are on their way." : "No transcript available yet."} description="No text or speaker identity is invented while processing is incomplete." />}
      <p className="transcript-end mono">END OF AVAILABLE TRANSCRIPT · {turns.length} TURNS</p>
    </section><aside className="transcript-aside"><section><p className="eyebrow">A FEW WORDS ABOUT THIS CONVERSATION</p><p className="aside-summary">{conversation.summary}</p></section><section><p className="eyebrow">VOICES IN THIS RECORDING</p><PeopleStack ids={conversation.people} names /><p className="small muted">Unknown speakers stay unnamed. A spoken name alone doesn’t identify a voice.</p></section><section><p className="eyebrow">SAVED FROM THIS CONVERSATION</p><div className="aside-memories">{memories.length ? memories.map((memory) => <MemoryCard key={memory.id} memory={memory} base={base} />) : <p className="small muted">Sourced memories will appear after processing.</p>}</div></section><div className="notice"><ShieldCheck size={18} /><p>{mode === "demo" ? "This is a fictional example, not a real patient recording." : "Raw audio is retained for up to 7 days. Text remains until you delete it."} A recording is evidence of words, not proof of an activity.</p></div></aside></div>
    <dialog ref={dialog} className="confirm-dialog" aria-labelledby="delete-conversation-title"><h2 id="delete-conversation-title">Delete this conversation?</h2><p>This removes its audio, transcript, and extracted memories from this space. It does not cancel a ride or appointment, or change a medication record.</p>{mode === "demo" && <p className="small muted">Demo changes last until you reload or reset the demo.</p>}<div className="dialog-actions"><button className="btn btn-quiet" disabled={busy} onClick={() => dialog.current?.close()}>Keep conversation</button><button className="btn btn-danger" disabled={busy} onClick={async () => { setBusy(true); try { await deleteConversation(conversation.id); dialog.current?.close(); router.push(patient ? "/patient/memories" : "/family/conversations"); } catch { setError("Deletion failed. Your conversation is still available. Please try again."); dialog.current?.close(); } finally { setBusy(false); } }}>{busy ? "Deleting…" : "Delete conversation"}</button></div></dialog>
  </>;
}
