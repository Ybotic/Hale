"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, AudioLines, Check, LoaderCircle, Mic, Pause, Send, Volume2 } from "lucide-react";
import { recallDemo } from "@hale/contracts/recall";
import { apiPath, apiRequest, useApiQuery } from "@/lib/api-client";
import { useWorkspace } from "./providers";

type AgentSource = { id: string; kind: string; label: string; date: string | null; conversationId: string | null; turnId: string | null };
type AgentReply = { reply: string; citations: AgentSource[]; fallback: boolean; offerMedicationReport: boolean; suggestedCareSection: "rides" | "appointments" | "medications" | null };
type AgentMessage = { id: string; role: "user" | "assistant"; text: string; citations?: AgentSource[]; fallback?: boolean; suggestedCareSection?: AgentReply["suggestedCareSection"] };
type AgentStatus = { openRouterConfigured: boolean; elevenLabsConfigured: boolean };
type UpcomingReminders = { items: Array<{ id: string; type: "medication" | "appointment"; title: string; dueAt: number }> };

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

export function VoiceAssistant() {
  const { mode, space, today } = useWorkspace();
  const patientId = space.id;
  const statusPath = apiPath("voice-agent/status", { patientId });
  const remindersPath = apiPath("care/reminders/upcoming", { patientId });
  const { data: status } = useApiQuery<AgentStatus>(statusPath, mode === "live", 60_000);
  const { data: upcoming } = useApiQuery<UpcomingReminders>(remindersPath, mode === "live", 60_000);
  const [consented, setConsented] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
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
  const canRecordMedication = space.capabilities.includes("medications:read") && space.capabilities.includes("medications:record");

  useEffect(() => () => {
    cancelVoiceSend.current = true;
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
    stream.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  async function sendMessage(raw: string) {
    const text = raw.trim();
    if (!text || text.length > 2000 || busy) return;
    setError(""); setNotice(""); setPendingMedicationReport("");
    const userMessage: AgentMessage = { id: crypto.randomUUID(), role: "user", text };
    const prior = messages.slice(-8).map(({ role, text: content }) => ({ role, content }));
    setMessages((items) => [...items, userMessage]);
    setMessage("");
    setBusy(true);
    try {
      if (mode === "demo") {
        const result = recallDemo(space, text, today);
        setMessages((items) => [...items, { id: crypto.randomUUID(), role: "assistant", text: result.text, citations: result.citations.map((citation) => ({ id: citation.turnId, kind: "transcript", label: citation.label, date: null, conversationId: citation.conversationId, turnId: citation.turnId })) }]);
        return;
      }
      if (!consented) throw new Error("Choose whether to use Hale’s online assistant first.");
      const result = await apiRequest<AgentReply>("voice-agent/chat", { json: { patientId, message: text, history: prior, consent: true } });
      setMessages((items) => [...items, { id: crypto.randomUUID(), role: "assistant", text: result.reply, citations: result.citations, fallback: result.fallback, suggestedCareSection: result.suggestedCareSection }]);
      if (result.offerMedicationReport && canRecordMedication && isMedicationSelfReport(text)) setPendingMedicationReport(text);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The assistant could not answer just now.");
      setMessages((items) => items.filter((item) => item.id !== userMessage.id));
      setMessage(text);
    } finally { setBusy(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendMessage(message);
  }

  async function speak(text: string) {
    if (mode !== "live" || !consented || !status?.elevenLabsConfigured) return;
    setError(""); setNotice("");
    try {
      const response = await fetch("/api/backend/voice-agent/speak", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, consent: true, text }), cache: "no-store", credentials: "same-origin",
      });
      if (!response.ok) {
        let reason = "ElevenLabs could not speak this response.";
        try { const result = await response.json() as { error?: unknown }; if (typeof result.error === "string") reason = result.error; } catch { /* Use safe fallback. */ }
        throw new Error(reason);
      }
      const url = URL.createObjectURL(await response.blob());
      setAudioUrl((old) => { if (old) URL.revokeObjectURL(old); return url; });
      window.setTimeout(() => { if (audio.current) void audio.current.play().catch(() => {}); }, 0);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Voice playback is unavailable."); }
  }

  async function transcribe(blob: Blob) {
    if (blob.size > MAX_AUDIO_BYTES) throw new Error("Keep voice messages under 10 MB.");
    const form = new FormData();
    form.set("patientId", patientId);
    form.set("consent", "true");
    form.set("file", blob, blob.type.includes("mp4") ? "hale-voice-message.m4a" : "hale-voice-message.webm");
    const result = await apiRequest<{ text: string }>("voice-agent/transcribe", { body: form });
    if (!result.text.trim()) throw new Error("No speech was recognized. You can type your message instead.");
    await sendMessage(result.text);
  }

  async function startRecording() {
    setError(""); setNotice("");
    if (!consented) { setError("Choose whether to use Hale’s online assistant first."); return; }
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
    const message = (upcoming?.items ?? []).map((item) => {
      const label = item.type === "medication" ? "Medication reminder" : "Appointment reminder";
      const when = new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short", timeZone: space.timezone }).format(new Date(item.dueAt));
      return `${label}: ${item.title}, ${when}.`;
    }).join(" ");
    if (message) void speak(message);
  }

  return <section className="voice-assistant" aria-label="Care voice assistant">
    <header className="voice-assistant-heading"><span className="feature-icon"><AudioLines size={22} /></span><div><p className="eyebrow">CARE ASSISTANT</p><h2>Ask about your care.</h2><p>Ask about your saved records or reminders.</p></div></header>
    {mode === "live" && !consented && <label className="check-label voice-assistant-consent"><input type="checkbox" checked={consented} onChange={(event) => setConsented(event.target.checked)} /><span>Use the online assistant? Messages and relevant records go to OpenRouter. Voice audio and spoken replies use ElevenLabs.</span></label>}
    {mode === "live" && consented && <p className="small muted voice-assistant-enabled">Online assistant is on for this visit. <button type="button" className="text-link" onClick={() => setConsented(false)}>Turn off</button></p>}
    {mode === "live" && status && (!status.elevenLabsConfigured || !status.openRouterConfigured) && <div className="info-strip"><AudioLines size={17} /><p>{!status.openRouterConfigured ? "Online answers aren’t available right now. Your saved memories are still here." : "Voice isn’t available right now. You can type your message instead."}</p></div>}
    {mode === "demo" && <div className="info-strip"><AudioLines size={17} /><p>Demo replies use fictional, local examples and do not contact AI or voice providers.</p></div>}
    {mode === "live" && upcoming?.items.length ? <section className="upcoming-care-reminders" aria-label="Upcoming care reminders"><div><p className="eyebrow">COMING UP</p><strong>{upcoming.items.length === 1 ? "A reminder is nearing" : `${upcoming.items.length} reminders are nearing`}</strong></div><ul>{upcoming.items.slice(0, 4).map((item) => <li key={item.id}><span>{item.type === "medication" ? "Medication" : "Appointment"} · {item.title}</span><time>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: space.timezone }).format(new Date(item.dueAt))}</time></li>)}</ul>{status?.elevenLabsConfigured && <button type="button" className="btn btn-quiet" disabled={!consented || busy} onClick={speakUpcomingReminders}><Volume2 size={15} />Speak these reminders</button>}</section> : null}
    <div className="voice-assistant-messages" aria-live="polite">{messages.map((item) => <article className={`voice-assistant-message ${item.role === "user" ? "voice-assistant-user" : ""}`} key={item.id}>
      <p className="eyebrow">{item.role === "user" ? "YOU" : "HALE"}</p><p>{item.text}</p>
      {item.role === "assistant" && item.citations?.length ? <div className="voice-assistant-sources"><span className="small muted">Related patient records</span>{item.citations.slice(0, 4).map((source) => <Link key={`${source.kind}-${source.id}`} href={source.conversationId && source.turnId ? `/patient/conversations/${source.conversationId}#${source.turnId}` : careHref(source.kind)} className="text-link">{source.label}<ArrowRight size={13} /></Link>)}</div> : null}
      {item.role === "assistant" && item.suggestedCareSection && <Link className="btn btn-quiet voice-assistant-action" href={`/patient/care#${item.suggestedCareSection}`}>Open {item.suggestedCareSection === "rides" ? "ride options" : item.suggestedCareSection === "appointments" ? "appointments" : "medication records"}<ArrowRight size={15} /></Link>}
      {item.role === "assistant" && status?.elevenLabsConfigured && <button type="button" className="text-link" disabled={!consented || busy} onClick={() => void speak(item.text)}><Volume2 size={15} />Listen</button>}
    </article>)}</div>
    {busy && <p role="status" className="small muted voice-assistant-status"><LoaderCircle className="voice-spinner" size={15} />{recording ? "Recording…" : "Working on that…"}</p>}
    {pendingMedicationReport && <div className="voice-medication-confirm"><div><strong>Save this medication note?</strong><p>“{pendingMedicationReport}”</p><span>This saves what you said; it doesn’t verify medication use or dose.</span></div><div className="button-group"><button className="btn btn-quiet" disabled={savingReport} onClick={() => setPendingMedicationReport("")}>Cancel</button><button className="btn btn-primary" disabled={savingReport} onClick={() => void saveMedicationReport()}>{savingReport ? "Saving…" : "Save note"}<Check size={15} /></button></div></div>}
    {error && <p role="alert" className="small error-text">{error}</p>}{notice && <p role="status" className="small handoff-status"><Check size={15} />{notice}</p>}
    <form className="voice-assistant-form" onSubmit={(event) => void submit(event)}><label className="sr-only" htmlFor="care-assistant-message">Ask the care assistant</label><textarea id="care-assistant-message" ref={input} value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2000} rows={1} placeholder="Ask about a record, or tell Hale what to track…" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void sendMessage(message); } }} /><button className="send-button" type="submit" aria-label="Send message" disabled={busy || !message.trim() || (mode === "live" && !consented)}><Send size={17} /></button><button type="button" className="icon-button" aria-label={recording ? "Stop voice message" : "Record a voice message"} disabled={busy || mode !== "live" || !consented || !status?.elevenLabsConfigured} onClick={() => recording ? stopRecording() : void startRecording()}>{recording ? <Pause size={17} /> : <Mic size={17} />}</button></form>
    {recording && <p className="small handoff-status" role="status"><AudioLines size={15} />Recording a voice message. Tap the microphone control to finish.</p>}
    {audioUrl && <audio ref={audio} controls src={audioUrl} aria-label="Spoken assistant reply" />}
  </section>;
}
