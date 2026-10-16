"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ArrowLeft, ArrowRight, AudioLines, Check, CheckCircle2, FlaskConical, Headphones, LoaderCircle, Mic, RotateCcw, ShieldCheck, Square, Trash2, Volume2 } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { VOICE_MIN_SECONDS, VOICE_TARGET_SECONDS } from "@mnemo/contracts/voice";
import { api, type FamilyProfile } from "@/lib/api";
import { VoiceRecorder, type VoiceSample } from "@/lib/voice-recorder";
import { AuthShell } from "./auth-shell";
import { useHydrated } from "@/lib/use-hydrated";
import { appMode } from "@/lib/app-mode";

interface FlowProps {
  demo?: boolean;
  configured: boolean;
  profile?: FamilyProfile | null;
  onIntroduce?: (name: string, relationship: string) => Promise<unknown>;
  onUpload?: (sample: VoiceSample) => Promise<void>;
  onSkip?: () => Promise<unknown>;
  onRevoke?: () => Promise<unknown>;
}

function VoiceFlow({ demo = false, configured, profile, onIntroduce, onUpload, onSkip, onRevoke }: FlowProps) {
  const hydrated = useHydrated();
  const [recorder] = useState(() => new VoiceRecorder());
  const capture = useSyncExternalStore(recorder.subscribe, recorder.getSnapshot, recorder.getSnapshot);
  useEffect(() => recorder.attach(), [recorder]);
  const [introduced, setIntroduced] = useState(false);
  const [name, setName] = useState(profile?.name ?? (demo ? "Daniel Okafor" : ""));
  const [relationship, setRelationship] = useState(profile?.relationship ?? "");
  const [consent, setConsent] = useState(false);
  const [onlyMe, setOnlyMe] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [demoDone, setDemoDone] = useState<"sample" | "skipped">();
  const [reopen, setReopen] = useState(false);
  const hasProfile = Boolean(profile || introduced);
  const pending = profile?.voiceState === "queued" || profile?.voiceState === "processing";
  const done = Boolean(demoDone || (!reopen && ["enrolled", "skipped"].includes(profile?.voiceState ?? "")));
  const skipped = demoDone === "skipped" || (!demoDone && profile?.voiceState === "skipped");
  const recording = capture.phase === "recording";
  const capturing = ["starting", "recording", "converting"].includes(capture.phase);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError("");
    try { await action(); }
    catch (error) { setError(error instanceof Error ? error.message : "Something went wrong. Please try again."); }
    finally { setBusy(false); }
  };
  const discard = () => { recorder.reset(); setOnlyMe(false); };

  return <AuthShell signup step={done ? 2 : 1}>
    {done ? <div className="voice-complete">
      <span className="voice-complete-icon"><CheckCircle2 size={31} strokeWidth={1.5} /></span>
      <p className="eyebrow">A LITTLE MORE CONNECTED</p>
      <h1>{skipped ? <>Your voice.<br /><span>Your choice.</span></> : <>A familiar voice.<br /><span>A lovely beginning.</span></>}</h1>
      <p>{skipped ? "Voice setup is optional. You can come back here whenever you’re ready." : demo ? "You’ve tried the voice-setup experience. Your sample has been discarded. No account or voiceprint was created." : "Your voiceprint has been created and saved privately. Your original sample has been removed from Mnemo’s storage."}</p>
      <div className="voice-next-note"><ShieldCheck size={20} /><p>{demo ? "Next, explore a fictional family space with synthetic memories." : "Your account still needs patient-space permission. Voice matching in conversations is a separate integration and isn’t connected yet."}</p></div>
      <Link href="/family/overview" className="btn btn-primary auth-submit">{demo ? "Return to workspace" : "Continue to my account"}<ArrowRight size={17} /></Link>
      {skipped ? <button className="text-link voice-secondary" onClick={() => { setDemoDone(undefined); setReopen(true); }}>Set up my voice<Mic size={15} /></button> : !demo && <button disabled={busy} className="text-link voice-secondary voice-remove" onClick={() => void run(async () => { await onRevoke?.(); setConsent(false); setReopen(true); })}><Trash2 size={15} />Delete my voice profile & withdraw consent</button>}
      {error && <p className="error-text" role="alert">{error}</p>}
    </div> : <>
      <div className="auth-intro voice-intro"><p className="eyebrow">{hasProfile ? "A VOICE THEY KNOW. A CONNECTION THAT STAYS." : "FIRST, A LITTLE INTRODUCTION"}</p><h1>{hasProfile ? <>Let’s put a voice<br /><span>to your name.</span></> : <>Every circle starts<br /><span>with someone like you.</span></>}</h1><p>{hasProfile ? "A short sample can help Mnemo recognize your voice in future conversations. It’s optional, and it’s never used to log you in." : "Tell us who you are. This creates your own family profile, not access to someone else’s memories."}</p></div>
      {demo && <div className="auth-demo-note"><FlaskConical size={17} /><p><strong>Local preview only.</strong> Recording uses your microphone, but nothing is uploaded or saved after you leave.</p></div>}
      {!hasProfile ? <form className="auth-form" onSubmit={(event) => { event.preventDefault(); void run(async () => { await onIntroduce?.(name, relationship); setIntroduced(true); }); }}>
        <label>Your full name<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" minLength={2} maxLength={100} required disabled={!hydrated || busy} placeholder="e.g. Daniel Okafor" /></label>
        <label>Your relationship<select value={relationship} disabled={!hydrated || busy} onChange={(event) => setRelationship(event.target.value)} required><option value="" disabled>How are you connected?</option>{["Son", "Daughter", "Partner", "Parent", "Sibling", "Friend", "Other family member", "Trusted supporter"].map((label) => <option key={label}>{label}</option>)}</select></label>
        <button className="btn btn-primary auth-submit" disabled={!hydrated || busy || name.trim().length < 2}>{busy ? "Saving…" : "Continue to voice setup"}<ArrowRight size={17} /></button>
      </form> : pending ? <div className="voice-processing" role="status"><LoaderCircle className="voice-spinner" size={30} /><h2>Getting to know your voice.</h2><p>pyannote.ai is processing your sample. You can leave this page; processing continues securely on the server.</p><Link className="btn btn-quiet" href="/family/overview">Continue to my account<ArrowRight size={16} /></Link><button className="text-link voice-remove" disabled={busy} onClick={() => void run(async () => { await onRevoke?.(); setConsent(false); })}><Trash2 size={15} />Cancel enrollment & delete my sample</button></div> : <>
        {profile?.voiceState === "failed" && <p role="alert" className="voice-error">{profile.message ?? "Please record a new sample."}</p>}
        {!demo && !configured && <div className="auth-demo-note"><AudioLines size={18} /><p>Voice processing hasn’t been configured yet. You can skip this step and return when pyannote.ai is connected.</p></div>}
        <div className="voice-tips"><span><Headphones size={16} />Find a quiet spot</span><span><Volume2 size={16} />Just your voice</span><span><Mic size={16} />Speak naturally</span></div>
        <div className="voice-prompt"><div><span className="eyebrow">SOMETHING TO SAY</span><span className="mono">~25 SEC</span></div><blockquote>“Hi, it’s {name.trim().split(" ")[0] || profile?.name.split(" ")[0] || "me"}. I’m happy to be part of your circle. One of my favourite things we do together is…”</blockquote><p>Then tell a little story, or talk about a favourite place. Any language is welcome. Don’t include private details.</p></div>
        <div className={`voice-capture ${recording ? "is-recording" : ""}`}>
          <div className="voice-capture-heading"><span><i />{recording ? "Recording your sample" : capture.phase === "ready" ? "Your sample is ready" : capture.phase === "converting" ? "Preparing your sample" : "Ready when you are"}</span><span className="mono">00:{String(Math.floor(capture.elapsed)).padStart(2, "0")} <span className="muted">/ 00:25</span></span></div>
          <div className="voice-levels" aria-hidden>{Array.from({ length: 40 }, (_, i) => <i key={i} style={{ height: `${4 + (capture.levels[i] ?? 0) * 45}px` }} />)}</div>
          <progress max={VOICE_TARGET_SECONDS} value={capture.elapsed} aria-label="Voice sample recording progress" />
          <p className="voice-capture-message" role={capture.phase === "failed" ? "alert" : "status"}>{capture.message || "Record 10–25 seconds. We’ll stop automatically at 25 seconds."}</p>
          {capture.sample && <audio aria-label="Listen to your voice sample" src={capture.sample.url} controls preload="metadata" />}
        </div>
        <label className="check-label voice-consent"><input type="checkbox" checked={consent} disabled={capturing || busy} onChange={(event) => { setConsent(event.target.checked); if (!event.target.checked) discard(); }} /><span>{demo ? "I agree to record my voice for this local preview. No biometric profile will be created." : <>I consent to Mnemo sending my sample to <a href="https://docs.pyannote.ai/data-retention" target="_blank" rel="noreferrer">pyannote.ai</a> and storing a biometric voiceprint until I delete it. My sample is removed after processing, or within about 75 minutes if processing stalls. Provider job output expires after 24 hours.</>}</span></label>
        {capture.sample && <label className="check-label voice-consent"><input type="checkbox" checked={onlyMe} disabled={busy} onChange={(event) => setOnlyMe(event.target.checked)} /><span>I listened back. This is only my voice, and I can hear it clearly.</span></label>}
        <div className="voice-actions">
          {recording ? <button className="btn btn-primary auth-submit" onClick={recorder.stop}><Square size={15} fill="currentColor" />Stop recording{capture.elapsed < VOICE_MIN_SECONDS && " (10 sec minimum)"}</button> : capture.sample ? <>
            <button className="btn btn-quiet" disabled={busy} onClick={discard} aria-label="Discard sample and record again"><RotateCcw size={16} />Retake</button>
            <button className="btn btn-primary" disabled={busy || !consent || !onlyMe || (!demo && !configured)} onClick={() => void run(async () => { if (!capture.sample) return; if (demo) { discard(); setDemoDone("sample"); } else { await onUpload?.(capture.sample); discard(); } })}>{busy ? <><LoaderCircle className="voice-spinner" size={16} />Sending…</> : <>{demo ? "Finish voice preview" : "Create my voice profile"}<Check size={16} /></>}</button>
          </> : <button className="btn btn-primary auth-submit" disabled={!consent || capturing || busy || (!demo && !configured)} onClick={() => { setOnlyMe(false); void recorder.start(); }}><Mic size={17} />{capture.phase === "starting" ? "Opening microphone…" : capture.phase === "converting" ? "Preparing sample…" : capture.phase === "failed" ? "Try recording again" : "Start recording"}</button>}
        </div>
        <button className="text-link voice-secondary" disabled={capturing || busy} onClick={() => void run(async () => { discard(); await onSkip?.(); if (demo) setDemoDone("skipped"); setReopen(false); })}>I’ll do this later<ArrowRight size={15} /></button>
        <p className="voice-tech-note"><ShieldCheck size={15} /><span>Your voice is for organizing memories, never for authentication. This setup doesn’t yet enable speaker matching in conversations. <a href="https://github.com/pyannote/pyannote-audio" target="_blank" rel="noreferrer">About pyannote<ArrowRight size={11} /></a></span></p>
      </>}
      {error && <p className="voice-error" role="alert">{error}</p>}
      <Link href="/signup" className="text-link voice-back"><ArrowLeft size={14} />Back to account</Link>
    </>}
  </AuthShell>;
}

function LiveVoiceOnboarding() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const data = useQuery(api.voiceProfile, isAuthenticated ? {} : "skip");
  const introduce = useMutation(api.saveFamilyProfile);
  const skip = useMutation(api.skipVoice);
  const revoke = useMutation(api.revokeVoice);
  if (!isLoaded || (isSignedIn && isLoading) || (isAuthenticated && !data)) return <AuthShell signup step={1}><p role="status">Opening your voice setup…</p></AuthShell>;
  if (!isSignedIn || !isAuthenticated) return <AuthShell signup step={1}><div className="auth-intro"><h1>{!isSignedIn ? "Your account comes first." : "Your connection needs attention."}</h1><p>{!isSignedIn ? "Create an account or log in before setting up your voice." : "Check the Clerk Convex JWT template and deployment issuer before continuing. No audio has been uploaded."}</p></div><Link className="btn btn-primary" href={!isSignedIn ? "/signup" : "/login"}>{!isSignedIn ? "Create an account" : "Back to login"}<ArrowRight size={16} /></Link></AuthShell>;
  return <VoiceFlow configured={data!.configured} profile={data!.profile}
    onIntroduce={(name, relationship) => introduce({ name, relationship })}
    onSkip={() => skip({})} onRevoke={() => revoke({})}
    onUpload={async (sample) => {
      const token = await getToken({ template: "convex" });
      if (!token) throw new Error("Your session ended. Sign in again before uploading.");
      const origin = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
      if (!origin) throw new Error("The voice upload connection is not configured.");
      const url = new URL("/voice", origin);
      url.searchParams.set("requestId", sample.requestId); url.searchParams.set("consent", "true");
      const response = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "audio/wav" }, body: sample.blob, cache: "no-store" });
      if (!response.ok) throw new Error(await response.text() || "The sample couldn’t be sent. Keep this page open and try again.");
    }} />;
}

export function VoiceOnboarding() {
  return appMode === "live" ? <LiveVoiceOnboarding /> : <VoiceFlow demo configured />;
}
