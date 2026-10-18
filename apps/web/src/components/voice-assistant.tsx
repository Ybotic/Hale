"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, AudioLines, CalendarDays, Check, CircleAlert, LoaderCircle, Mic, Pause, Pill, Send, Volume2 } from "lucide-react";
import { isCareRecordCitation, recallDemo } from "@hale/contracts/recall";
import { apiPath, apiRequest, useApiQuery } from "@/lib/api-client";
import { useWorkspace } from "./providers";
import { Timeline, TimelineItem } from "./ui-primitives";
import { Button } from "./ui/button";

type AgentSource = { id: string; kind: string; label: string; date: string | null; conversationId: string | null; turnId: string | null };
type AgentReply = { reply: string; citations: AgentSource[]; fallback: boolean; offerMedicationReport: boolean; suggestedCareSection: "rides" | "appointments" | "medications" | null };
type AgentMessage = { id: string; role: "user" | "assistant"; text: string; citations?: AgentSource[]; fallback?: boolean; suggestedCareSection?: AgentReply["suggestedCareSection"] };
type AgentStatus = { openRouterConfigured: boolean; elevenLabsConfigured: boolean };
type UpcomingReminders = { items: Array<{ id: string; type: "medication" | "appointment"; title: string; dueAt: number }> };
type VoicePhase = "off" | "listening" | "thinking" | "speaking";
type SpeechResultLike = { isFinal: boolean; length: number; 0?: { transcript: string } };
type SpeechEventLike = { resultIndex: number; results: ArrayLike<SpeechResultLike> };
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

const MAX_AUDIO_BYTES = 10_000_000;

function careHref(kind: string) {
  if (kind === "appointment") return "/patient/care#appointments";
  if (kind === "medication") return "/patient/care#medications";
  if (kind === "ride") return "/patient/care#rides";
  return "/patient/care#costs";
}

function isMedicationSelfReport(text: string) {
  return /\b(i (?:took|skipped|missed|forgot|did not take|didn't take|have taken)|record (?:that )?i (?:took|skipped|missed)|log (?:that )?i (?:took|skipped|missed))\b/i.test(text);
}

function likelySpeechEcho(transcript: string, spokenText: string) {
  const heard = transcript.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const spoken = spokenText.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return heard.split(/\s+/).filter(Boolean).length >= 3 && spoken.includes(heard);
}

export function VoiceAssistant() {
  const { mode, space, today, careRecords } = useWorkspace();
  const patientId = space.id;
  const statusPath = apiPath("voice-agent/status", { patientId });
  const remindersPath = apiPath("care/reminders/upcoming", { patientId });
  const { data: status, isLoading: statusLoading, error: statusError } = useApiQuery<AgentStatus>(statusPath, mode === "live", 60_000);
  const { data: upcoming } = useApiQuery<UpcomingReminders>(remindersPath, mode === "live", 60_000);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [voicePhase, setVoicePhase] = useState<VoicePhase>("off");
  const [voiceDraft, setVoiceDraft] = useState("");
  const [ttsLoadingId, setTtsLoadingId] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingMedicationReport, setPendingMedicationReport] = useState("");
  const [savingReport, setSavingReport] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const cancelVoiceSend = useRef(false);
  const audio = useRef<HTMLAudioElement>(null);
  const voiceModeRef = useRef(false);
  const voicePhaseRef = useRef<VoicePhase>("off");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recognitionRestartRef = useRef(false);
  const voiceTurnRef = useRef("");
  const voiceDebounceRef = useRef<number | null>(null);
  const spokenTextRef = useRef("");
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const playbackRequestRef = useRef(0);
  const busyRef = useRef(false);
  const messagesRef = useRef<AgentMessage[]>([]);
  const voiceRestartTimerRef = useRef<number | null>(null);
  const canRecordMedication = space.capabilities.includes("medications:read") && space.capabilities.includes("medications:record");
  const reminderItems = [...(upcoming?.items ?? [])].sort((first, second) => first.dueAt - second.dueAt);

  useEffect(() => { messagesRef.current = messages; }, [messages]);

  function updateVoicePhase(next: VoicePhase) {
    voicePhaseRef.current = next;
    setVoicePhase(next);
  }

  function closeVoiceMode() {
    voiceModeRef.current = false;
    recognitionRestartRef.current = false;
    if (voiceRestartTimerRef.current !== null) window.clearTimeout(voiceRestartTimerRef.current);
    voiceRestartTimerRef.current = null;
    if (voiceDebounceRef.current !== null) window.clearTimeout(voiceDebounceRef.current);
    voiceDebounceRef.current = null;
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    voiceTurnRef.current = "";
    setVoiceDraft("");
    setVoiceMode(false);
    updateVoicePhase("off");
    stopCurrentSpeech();
  }

  function startVoiceRecognition() {
    if (!voiceModeRef.current || recognitionRef.current) return;
    const speechWindow = window as SpeechWindow;
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setError("Continuous voice isn’t supported in this browser. Use a voice message or type instead.");
      closeVoiceMode();
      return;
    }
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";
    recognitionRef.current = recognition;
    recognition.onresult = (event) => {
      if (!voiceModeRef.current || !["listening", "speaking"].includes(voicePhaseRef.current)) return;
      let finalText = "";
      let interimText = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript?.trim() ?? "";
        if (result?.isFinal) finalText = [finalText, transcript].filter(Boolean).join(" ");
        else interimText = [interimText, transcript].filter(Boolean).join(" ");
      }
      const candidate = [finalText, interimText].filter(Boolean).join(" ");
      if (!candidate) return;
      if (voicePhaseRef.current === "speaking") {
        if (likelySpeechEcho(candidate, spokenTextRef.current)) return;
        stopCurrentSpeech();
        updateVoicePhase("listening");
      }
      if (finalText) voiceTurnRef.current = [voiceTurnRef.current, finalText].filter(Boolean).join(" ");
      setVoiceDraft([voiceTurnRef.current, interimText].filter(Boolean).join(" "));
      if (!finalText) return;
      if (voiceDebounceRef.current !== null) window.clearTimeout(voiceDebounceRef.current);
      voiceDebounceRef.current = window.setTimeout(() => {
        voiceDebounceRef.current = null;
        const recognized = voiceTurnRef.current.trim();
        voiceTurnRef.current = "";
        setVoiceDraft("");
        if (!recognized || !voiceModeRef.current || busyRef.current) return;
        recognitionRestartRef.current = false;
        const activeRecognition = recognitionRef.current;
        recognitionRef.current = null;
        activeRecognition?.stop();
        void sendMessage(recognized, true);
      }, 750);
    };
    recognition.onerror = (event) => {
      if (!voiceModeRef.current || event.error === "aborted" || event.error === "no-speech") return;
      const message = event.error === "not-allowed" || event.error === "service-not-allowed"
        ? "Allow microphone access for continuous voice, or use a voice message or type instead."
        : event.error === "network"
          ? "The browser’s speech-recognition service is unavailable. Use a voice message or type instead."
          : "Continuous voice stopped unexpectedly. Use a voice message or type instead.";
      closeVoiceMode();
      setError(message);
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      if (!voiceModeRef.current || !recognitionRestartRef.current || voiceRestartTimerRef.current !== null) return;
      voiceRestartTimerRef.current = window.setTimeout(() => {
        voiceRestartTimerRef.current = null;
        if (voiceModeRef.current && recognitionRestartRef.current) startVoiceRecognition();
      }, 250);
    };
    try { recognition.start(); }
    catch (reason) {
      recognitionRef.current = null;
      if (!(reason instanceof DOMException && reason.name === "InvalidStateError")) {
        closeVoiceMode();
        setError("The microphone could not start. Allow microphone access or type your message.");
      }
    }
  }

  function resumeVoiceRecognition() {
    if (!voiceModeRef.current) return;
    recognitionRestartRef.current = true;
    if (recognitionRef.current || voiceRestartTimerRef.current !== null) return;
    voiceRestartTimerRef.current = window.setTimeout(() => {
      voiceRestartTimerRef.current = null;
      if (voiceModeRef.current && recognitionRestartRef.current) startVoiceRecognition();
    }, 150);
  }

  function startVoiceMode() {
    if (mode !== "live") return;
    const speechWindow = window as SpeechWindow;
    if (!(speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition)) {
      setError("Continuous voice isn’t supported in this browser. Use a voice message or type instead.");
      return;
    }
    setError(""); setNotice(""); setMessage("");
    stopCurrentSpeech();
    voiceModeRef.current = true;
    recognitionRestartRef.current = true;
    setVoiceMode(true);
    updateVoicePhase("listening");
    startVoiceRecognition();
  }

  useEffect(() => () => {
    cancelVoiceSend.current = true;
    voiceModeRef.current = false;
    recognitionRestartRef.current = false;
    if (voiceDebounceRef.current !== null) window.clearTimeout(voiceDebounceRef.current);
    if (voiceRestartTimerRef.current !== null) window.clearTimeout(voiceRestartTimerRef.current);
    recognitionRef.current?.abort();
    window.speechSynthesis?.cancel();
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
    stream.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  async function sendMessage(raw: string, speakReply = false) {
    const text = raw.trim();
    if (!text || text.length > 2000 || busyRef.current) return;
    setError(""); setNotice(""); setPendingMedicationReport("");
    if (speakReply) {
      updateVoicePhase("thinking");
      recognitionRestartRef.current = false;
      const activeRecognition = recognitionRef.current;
      recognitionRef.current = null;
      activeRecognition?.stop();
    }
    const userMessage: AgentMessage = { id: crypto.randomUUID(), role: "user", text };
    const prior = messagesRef.current.slice(-8).map(({ role, text: content }) => ({ role, content }));
    messagesRef.current = [...messagesRef.current, userMessage];
    setMessages((items) => [...items, userMessage]);
    setMessage("");
    busyRef.current = true;
    setBusy(true);
    try {
      if (mode === "demo") {
        const visibleCareRecords = careRecords.filter((record) => record.source !== "nessie_demo" || record.sharedWithPatient);
        const result = recallDemo(space, text, today, undefined, visibleCareRecords);
        const assistantId = crypto.randomUUID();
        const assistantMessage: AgentMessage = { id: assistantId, role: "assistant", text: result.text, citations: result.citations.map((citation) => isCareRecordCitation(citation)
          ? { id: citation.recordId, kind: citation.recordType, label: citation.label, date: citation.date ?? null, conversationId: null, turnId: null }
          : { id: citation.turnId, kind: "transcript", label: citation.label, date: null, conversationId: citation.conversationId, turnId: citation.turnId }) };
        messagesRef.current = [...messagesRef.current, assistantMessage];
        setMessages((items) => [...items, assistantMessage]);
        if (speakReply && voiceModeRef.current) void speak(result.text, assistantId);
        return;
      }
      const result = await apiRequest<AgentReply>("voice-agent/chat", { json: { patientId, message: text, history: prior } });
      const assistantId = crypto.randomUUID();
      const assistantMessage: AgentMessage = { id: assistantId, role: "assistant", text: result.reply, citations: result.citations, fallback: result.fallback, suggestedCareSection: result.suggestedCareSection };
      messagesRef.current = [...messagesRef.current, assistantMessage];
      setMessages((items) => [...items, assistantMessage]);
      if (speakReply && voiceModeRef.current) void speak(result.reply, assistantId);
      if (result.offerMedicationReport && canRecordMedication && isMedicationSelfReport(text)) setPendingMedicationReport(text);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The assistant could not answer just now.");
      messagesRef.current = messagesRef.current.filter((item) => item.id !== userMessage.id);
      setMessages((items) => items.filter((item) => item.id !== userMessage.id));
      setMessage(text);
      if (speakReply && voiceModeRef.current) {
        updateVoicePhase("listening");
        resumeVoiceRecognition();
      }
    } finally { busyRef.current = false; setBusy(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendMessage(message, voiceModeRef.current);
  }

  function finishSpeech(messageId: string) {
    setSpeakingId((current) => current === messageId ? null : current);
    spokenTextRef.current = "";
    if (voiceModeRef.current) {
      updateVoicePhase("listening");
      resumeVoiceRecognition();
    }
  }

  function stopCurrentSpeech() {
    playbackRequestRef.current += 1;
    setTtsLoadingId(null);
    window.speechSynthesis?.cancel();
    speechUtteranceRef.current = null;
    if (audio.current) {
      audio.current.onended = null;
      audio.current.onerror = null;
      audio.current.pause();
      audio.current.removeAttribute("src");
      audio.current.load();
    }
    setAudioUrl("");
    setSpeakingId(null);
    spokenTextRef.current = "";
  }

  function stopSpeaking() {
    stopCurrentSpeech();
    if (voiceModeRef.current) {
      updateVoicePhase("listening");
      resumeVoiceRecognition();
    }
  }

  function speakOnDevice(text: string, messageId: string) {
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return false;
    stopCurrentSpeech();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = navigator.language || "en-US";
    utterance.rate = 1;
    utterance.onend = () => {
      if (speechUtteranceRef.current !== utterance) return;
      speechUtteranceRef.current = null;
      finishSpeech(messageId);
    };
    utterance.onerror = () => {
      if (speechUtteranceRef.current !== utterance) return;
      speechUtteranceRef.current = null;
      finishSpeech(messageId);
      setError("Your device could not play the spoken reply. The text is still available above.");
    };
    speechUtteranceRef.current = utterance;
    spokenTextRef.current = text;
    setSpeakingId(messageId);
    if (voiceModeRef.current) updateVoicePhase("speaking");
    window.speechSynthesis.speak(utterance);
    return true;
  }

  function playRemoteSpeech(blob: Blob, text: string, messageId: string, playbackRequest: number) {
    const player = audio.current;
    if (!player) return false;
    const url = URL.createObjectURL(blob);
    spokenTextRef.current = text;
    setAudioUrl(url);
    setSpeakingId(messageId);
    if (voiceModeRef.current) updateVoicePhase("speaking");
    player.src = url;
    player.onended = () => finishSpeech(messageId);
    player.onerror = () => {
      if (playbackRequest !== playbackRequestRef.current) return;
      setAudioUrl("");
      finishSpeech(messageId);
      setError("The browser could not decode the ElevenLabs audio. The text is still available above.");
    };
    void player.play().catch((reason: unknown) => {
      if (playbackRequest !== playbackRequestRef.current) return;
      const reasonName = reason && typeof reason === "object" && "name" in reason ? String(reason.name) : "";
      if (reasonName === "NotAllowedError" || reasonName === "AbortError") {
        finishSpeech(messageId);
        setNotice("Automatic playback was blocked. Tap Play in the audio player to hear the reply.");
        return;
      }
      setAudioUrl("");
      finishSpeech(messageId);
      setError(reasonName === "NotSupportedError"
        ? "Your browser does not support the ElevenLabs audio format. The text is still available above."
        : "ElevenLabs returned audio, but your browser could not play it. The text is still available above.");
    });
    return true;
  }

  async function speak(text: string, messageId = "response") {
    setError(""); setNotice("");
    stopCurrentSpeech();
    if (mode === "demo") {
      if (!speakOnDevice(text, messageId)) setError("Spoken replies are not available in this browser.");
      return;
    }
    if (!status) {
      setError(statusError ? "The ElevenLabs voice settings could not be checked. Try again in a moment." : statusLoading ? "The ElevenLabs voice is still loading. Try again in a moment." : "ElevenLabs speech is not available right now.");
      return;
    }
    if (!status.elevenLabsConfigured) {
      setError("ElevenLabs speech is not configured. Check the server’s voice settings.");
      return;
    }
    const playbackRequest = ++playbackRequestRef.current;
    setTtsLoadingId(messageId);
    try {
      const response = await fetch("/api/backend/voice-agent/speak", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, text }), cache: "no-store", credentials: "same-origin",
      });
      if (playbackRequest !== playbackRequestRef.current) return;
      const contentType = response.headers.get("content-type") ?? "";
      const contentLength = response.headers.get("content-length");
      let unavailableMessage = "ElevenLabs speech is unavailable. Try again in a moment.";
      if (!response.ok) {
        try {
          const result = await response.json() as { error?: unknown };
          if (typeof result.error === "string" && result.error.length < 240) unavailableMessage = result.error;
        } catch { /* Use the safe fallback message. */ }
      }
      if (!response.ok || !contentType.startsWith("audio/") || (contentLength !== null && Number(contentLength) === 0)) {
        throw new Error(unavailableMessage);
      }
      const blob = await response.blob();
      if (playbackRequest !== playbackRequestRef.current) return;
      if (!blob.size) {
        throw new Error("ElevenLabs returned an empty audio reply.");
      }
      if (!playRemoteSpeech(blob, text, messageId, playbackRequest)) throw new Error("Audio playback is not available in this browser.");
    } catch (reason) {
      if (playbackRequest !== playbackRequestRef.current) return;
      setError(reason instanceof Error ? reason.message : "ElevenLabs speech is unavailable. The text is still available above.");
    } finally {
      if (playbackRequest === playbackRequestRef.current) setTtsLoadingId(null);
    }
  }

  async function transcribe(blob: Blob) {
    if (blob.size > MAX_AUDIO_BYTES) throw new Error("Keep voice messages under 10 MB.");
    const form = new FormData();
    form.set("patientId", patientId);
    form.set("file", blob, blob.type.includes("mp4") ? "hale-voice-message.m4a" : "hale-voice-message.webm");
    const result = await apiRequest<{ text: string }>("voice-agent/transcribe", { body: form });
    if (!result.text.trim()) throw new Error("No speech was recognized. You can type your message instead.");
    await sendMessage(result.text);
  }

  async function startRecording() {
    setError(""); setNotice("");
    if (!status?.elevenLabsConfigured) { setError("Voice isn’t available right now. You can type your message instead."); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setError("This browser cannot record voice here. Type your message instead."); return; }
    try {
      const inputStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = inputStream;
      cancelVoiceSend.current = false;
      chunks.current = [];
      const mimeType = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find((type) => MediaRecorder.isTypeSupported?.(type));
      const instance = new MediaRecorder(inputStream, mimeType ? { mimeType } : undefined);
      recorder.current = instance;
      instance.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      instance.onerror = () => setError("The voice recording stopped unexpectedly. Try again or type your message.");
      instance.onstop = () => {
        const blob = new Blob(chunks.current, { type: instance.mimeType || "audio/webm" });
        inputStream.getTracks().forEach((track) => track.stop());
        stream.current = null;
        setRecording(false);
        if (!cancelVoiceSend.current && blob.size) { setBusy(true); void transcribe(blob).catch((reason) => setError(reason instanceof Error ? reason.message : "Voice transcription failed.")).finally(() => setBusy(false)); }
      };
      instance.start();
      setRecording(true);
    } catch (reason) {
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
      setError(reason instanceof DOMException && reason.name === "NotAllowedError" ? "Allow microphone access to use voice, or type your message." : "The microphone could not start.");
    }
  }

  function stopRecording() {
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  }

  async function saveMedicationReport() {
    if (!pendingMedicationReport || !canRecordMedication) return;
    setSavingReport(true); setError(""); setNotice("");
    try {
      await apiRequest("care/records", { json: {
        patientId, type: "medication", title: "Medication self-report",
        details: `Patient self-report (not independently verified): ${pendingMedicationReport}`,
        scheduledAt: new Date().toISOString(), amount: null, currency: "USD",
      } });
      setNotice("Saved as your note. It doesn’t confirm medication use.");
      setPendingMedicationReport("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The self-report could not be saved."); }
    finally { setSavingReport(false); }
  }

  function speakUpcomingReminders() {
    const nextReminder = reminderItems[0];
    if (!nextReminder) return;
    const label = nextReminder.type === "medication" ? "Medication reminder" : "Appointment reminder";
    const when = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: space.timezone }).format(new Date(nextReminder.dueAt));
    void speak(`${label}: ${nextReminder.title}, ${when}.`);
  }

  return <section className="voice-assistant patient-chat-interface" aria-label="Ask Hale">
    <header className="patient-chat-heading"><p className="eyebrow">Ask Hale</p><h1>What would you like to remember?</h1></header>
    {mode === "live" && status && !status.openRouterConfigured && <p className="small muted patient-chat-status" role="status">Online answers aren’t available right now. Your saved conversations are still here.</p>}
    {mode === "demo" && <p className="small muted patient-chat-status" role="status">Fictional demo responses stay on this device.</p>}
    {mode === "live" && reminderItems.length > 0 && <details className="patient-chat-reminders"><summary>{reminderItems.length === 1 ? "One upcoming reminder" : `${reminderItems.length} upcoming reminders`}</summary><Timeline label="Upcoming medication and appointment reminders" className="patient-timeline-list">{reminderItems.slice(0, 4).map((item) => <TimelineItem key={item.id} Icon={item.type === "medication" ? Pill : CalendarDays} title={item.title} dateTime={new Date(item.dueAt).toISOString()} time={new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short", timeZone: space.timezone }).format(new Date(item.dueAt))} status="Upcoming" StatusIcon={CalendarDays} />)}</Timeline><Button type="button" variant="secondary" disabled={busy} onClick={speakUpcomingReminders}><Volume2 aria-hidden />Speak reminders</Button></details>}
    <div className="voice-assistant-messages" aria-live="polite">{messages.length ? messages.map((item) => <article className={`voice-assistant-message ${item.role === "user" ? "voice-assistant-user" : ""}`} key={item.id}>
       <p className="eyebrow">{item.role === "user" ? "You" : "Hale"}</p><p>{item.text}</p>
       {item.role === "assistant" && item.citations?.length ? <div className="voice-assistant-sources"><span className="small muted">Related patient records</span>{item.citations.slice(0, 4).map((source) => <Link key={`${source.kind}-${source.id}`} href={source.conversationId && source.turnId ? `/patient/conversations/${source.conversationId}#${source.turnId}` : careHref(source.kind)} className="text-link">{source.label}<ArrowRight size={13} /></Link>)}</div> : null}
        {item.role === "assistant" && item.suggestedCareSection && <Button asChild variant="secondary" className="voice-assistant-action"><Link href={`/patient/care#${item.suggestedCareSection}`}>Open {item.suggestedCareSection === "rides" ? "ride options" : item.suggestedCareSection === "appointments" ? "appointments" : "medication records"}<ArrowRight aria-hidden /></Link></Button>}
        {item.role === "assistant" && <Button type="button" variant="ghost" aria-label={speakingId === item.id ? "Stop speaking" : ttsLoadingId === item.id ? "Preparing spoken reply" : "Listen to reply"} disabled={busy || ttsLoadingId === item.id} onClick={() => speakingId === item.id ? stopSpeaking() : void speak(item.text, item.id)}>{ttsLoadingId === item.id ? <LoaderCircle className="voice-spinner" aria-hidden /> : speakingId === item.id ? <Pause aria-hidden /> : <Volume2 aria-hidden />}{speakingId === item.id ? "Stop speaking" : ttsLoadingId === item.id ? "Preparing…" : "Listen"}</Button>}
     </article>) : <div className="patient-chat-empty"><AudioLines aria-hidden /><p>Your saved conversations and details are ready when you need them.</p></div>}</div>
     {voiceMode && <div className="voice-session-panel" data-phase={voicePhase} role="status" aria-live="polite"><span className="voice-phase-indicator" aria-hidden="true" /><div className="voice-session-copy"><strong>{voicePhase === "thinking" ? "Hale is thinking…" : voicePhase === "speaking" ? "Hale is speaking" : "Listening"}</strong><p>{voicePhase === "speaking" ? "Speak any time to interrupt." : voicePhase === "thinking" ? "Preparing a spoken reply." : "Speak naturally. Hale will answer when you pause."}</p>{voiceDraft && <p className="voice-session-draft">You: {voiceDraft}</p>}</div><Button type="button" variant="ghost" className="voice-session-end" onClick={closeVoiceMode}>End</Button></div>}
     {busy && !voiceMode && <p role="status" className="small muted voice-assistant-status"><LoaderCircle className="voice-spinner" size={15} />{recording ? "Recording…" : "Working on that…"}</p>}
     {pendingMedicationReport && <div className="voice-medication-confirm"><div><strong>Save this medication note?</strong><p>“{pendingMedicationReport}”</p><span>This saves what you said; it doesn’t verify medication use or dose.</span></div><div className="button-group"><Button variant="secondary" disabled={savingReport} onClick={() => setPendingMedicationReport("")}>Cancel</Button><Button variant="primary" pending={savingReport} onClick={() => void saveMedicationReport()}>{savingReport ? "Saving…" : <>Save note<Check aria-hidden /></>}</Button></div></div>}
     {error && <p role="alert" className="small error-text"><CircleAlert aria-hidden />{error}</p>}{notice && <p role="status" className="small handoff-status"><Check size={15} />{notice}</p>}
        <form className="voice-assistant-form" onSubmit={(event) => void submit(event)}><label className="sr-only" htmlFor="care-assistant-message">Message Hale</label><textarea id="care-assistant-message" ref={input} value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2000} rows={1} placeholder="Message Hale..." onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void sendMessage(message, voiceModeRef.current); } }} /><Button variant="primary" type="submit" className="send-button" aria-label="Send message" disabled={busy || !message.trim()}><Send aria-hidden /><span>Send</span></Button><Button type="button" variant={voiceMode ? "primary" : "secondary"} className="voice-mode-control" aria-label={voiceMode ? "End voice conversation" : "Start voice conversation"} aria-pressed={voiceMode} disabled={!voiceMode && (busy || recording || mode !== "live")} onClick={() => voiceMode ? closeVoiceMode() : startVoiceMode()}>{voiceMode ? <Pause aria-hidden /> : <Mic aria-hidden />}<span>{voiceMode ? "End voice" : "Talk"}</span></Button><Button type="button" variant="secondary" className="voice-message-control" aria-label={recording ? "Stop voice message" : "Record a voice message"} disabled={busy || voiceMode || mode !== "live" || !status?.elevenLabsConfigured} onClick={() => recording ? stopRecording() : void startRecording()}>{recording ? <Pause aria-hidden /> : <AudioLines aria-hidden />}<span>{recording ? "Stop note" : "Voice note"}</span></Button></form>
      {recording && <p className="small handoff-status" role="status" aria-live="polite"><AudioLines aria-hidden size={24} />Recording a voice message. Tap the microphone control to finish.</p>}
      <audio ref={audio} controls={Boolean(audioUrl)} aria-label="Spoken assistant reply" hidden={!audioUrl} />
  </section>;
}
