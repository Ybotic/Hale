"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { ArrowLeft, ArrowRight, AudioLines, Check, CheckCircle2, FlaskConical, Headphones, LoaderCircle, Mic, RotateCcw, ShieldCheck, Square, Trash2, Volume2 } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { VOICE_MIN_SECONDS, VOICE_TARGET_SECONDS } from "@hale/contracts/voice";
import { type FamilyProfile } from "@/lib/api";
import { apiRequest, useApiQuery } from "@/lib/api-client";
import { VoiceRecorder, type VoiceSample } from "@/lib/voice-recorder";
import { AuthShell } from "./auth-shell";
import { useHydrated } from "@/lib/use-hydrated";
import { appMode } from "@/lib/app-mode";
import { Button } from "./ui/button";
import { SwitchField } from "./ui/switch";

interface FlowProps {
  demo?: boolean;
  configured: boolean;
  configurationMessage?: string | null;
  patientSpaceNames?: string[];
  profile?: FamilyProfile | null;
  onIntroduce?: (name: string, relationship: string) => Promise<unknown>;
  onUpload?: (sample: VoiceSample) => Promise<void>;
  onSkip?: () => Promise<unknown>;
  onRevoke?: () => Promise<unknown>;
}

function VoiceFlow({ demo = false, configured, configurationMessage, patientSpaceNames = [], profile, onIntroduce, onUpload, onSkip, onRevoke }: FlowProps) {
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
      <p className="eyebrow">A little more connected</p>
      <h1>{skipped ? <>Your voice.<br /><span>Your choice.</span></> : <>A familiar voice.<br /><span>A lovely beginning.</span></>}</h1>
      <p>{skipped ? "Voice setup is optional. You can come back here whenever you’re ready." : demo ? "You’ve tried the voice-setup experience. Your sample has been discarded. No account or voiceprint was created." : "Your voiceprint has been created and saved privately. Your original sample has been removed from Hale’s storage."}</p>
       <div className="voice-next-note"><ShieldCheck size={20} /><p>{demo
         ? "Next, explore a fictional family space with synthetic memories."
         : skipped
           ? "No voiceprint was created. You can enroll later; matching stays off until you separately opt in for a patient space."
           : patientSpaceNames.length
             ? `Your voice profile is linked to ${patientSpaceNames.join(", ")}. Open Settings → Family voice profiles to opt into matching separately for each space.`
             : "Your voiceprint is saved privately to your account, but it is not linked to a patient space yet. Ask a patient-space owner to invite this verified email, then accept the invite to link your profile."}</p></div>
       <Button asChild variant="primary" size="lg" className="auth-submit"><Link href="/family/overview">{demo ? "Return to workspace" : "Continue to my account"}<ArrowRight aria-hidden /></Link></Button>
       {skipped ? <Button variant="ghost" className="voice-secondary" onClick={() => { setDemoDone(undefined); setReopen(true); }}>Set up my voice<Mic aria-hidden /></Button> : !demo && <Button variant="ghost" className="voice-secondary voice-remove" disabled={busy} onClick={() => void run(async () => { await onRevoke?.(); setConsent(false); setReopen(true); })}><Trash2 aria-hidden />Delete my voice profile &amp; withdraw consent</Button>}
      {error && <p className="error-text" role="alert">{error}</p>}
    </div> : <>
      <div className="auth-intro voice-intro"><p className="eyebrow">{hasProfile ? "A voice they know. A connection that stays." : "First, a little introduction"}</p><h1>{hasProfile ? <>Let’s put a voice<br /><span>to your name.</span></> : <>Every circle starts<br /><span>with someone like you.</span></>}</h1><p>{hasProfile ? "A short sample can help Hale recognize your voice in future conversations. It’s optional, and it’s never used to log you in." : "Tell us who you are. This creates your own family profile, not access to someone else’s memories."}</p></div>
      {demo && <div className="auth-demo-note"><FlaskConical size={17} /><p><strong>Local preview only.</strong> Recording uses your microphone, but nothing is uploaded or saved after you leave.</p></div>}
      {!hasProfile ? <form className="auth-form" onSubmit={(event) => { event.preventDefault(); void run(async () => { await onIntroduce?.(name, relationship); setIntroduced(true); }); }}>
        <label>Your full name<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" minLength={2} maxLength={100} required disabled={!hydrated || busy} placeholder="e.g. Daniel Okafor" /></label>
        <label>Your relationship<select value={relationship} disabled={!hydrated || busy} onChange={(event) => setRelationship(event.target.value)} required><option value="" disabled>How are you connected?</option>{["Son", "Daughter", "Partner", "Parent", "Sibling", "Friend", "Other family member", "Trusted supporter"].map((label) => <option key={label}>{label}</option>)}</select></label>
        <Button variant="primary" size="lg" className="auth-submit" disabled={!hydrated || busy || name.trim().length < 2}>{busy ? "Saving…" : "Continue to voice setup"}<ArrowRight aria-hidden /></Button>
       </form> : pending ? <div className="voice-processing" role="status"><LoaderCircle className="voice-spinner" size={30} /><h2>Getting to know your voice.</h2><p>An external voice service is processing your sample. You can leave this page; processing continues securely.</p><Button asChild variant="secondary"><Link href="/family/overview">Continue to my account<ArrowRight aria-hidden /></Link></Button><Button variant="ghost" className="voice-remove" disabled={busy} onClick={() => void run(async () => { await onRevoke?.(); setConsent(false); })}><Trash2 aria-hidden />Cancel enrollment &amp; delete my sample</Button></div> : <>
        {configured && profile?.voiceState === "failed" && <p role="alert" className="voice-error">{profile.message ?? "Please record a new sample."}</p>}
         {!demo && !configured && <div className="auth-demo-note"><AudioLines size={18} /><p>{configurationMessage ?? "Voice processing isn’t available yet. You can skip this step and return later."}</p></div>}
        <div className="voice-tips"><span><Headphones size={16} />Find a quiet spot</span><span><Volume2 size={16} />Just your voice</span><span><Mic size={16} />Speak naturally</span></div>
        <div className="voice-prompt"><div><span className="eyebrow">Something to say</span><span className="mono">~25 sec</span></div><blockquote>“Hi, it’s {name.trim().split(" ")[0] || profile?.name.split(" ")[0] || "me"}. I’m happy to be part of your circle. One of my favourite things we do together is…”</blockquote><p>Then tell a little story, or talk about a favourite place. Any language is welcome. Don’t include private details.</p></div>
        <div className={`voice-capture ${recording ? "is-recording" : ""}`}>
          <div className="voice-capture-heading"><span><i />{recording ? "Recording your sample" : capture.phase === "ready" ? "Your sample is ready" : capture.phase === "converting" ? "Preparing your sample" : "Ready when you are"}</span><span className="mono">00:{String(Math.floor(capture.elapsed)).padStart(2, "0")} <span className="muted">/ 00:25</span></span></div>
          <div className="voice-levels" aria-hidden>{Array.from({ length: 40 }, (_, i) => <i key={i} style={{ height: `${4 + (capture.levels[i] ?? 0) * 45}px` }} />)}</div>
          <progress max={VOICE_TARGET_SECONDS} value={capture.elapsed} aria-label="Voice sample recording progress" />
          <p className="voice-capture-message" role={capture.phase === "failed" ? "alert" : "status"}>{capture.message || "Record 10–25 seconds. We’ll stop automatically at 25 seconds."}</p>
          {capture.sample && <audio aria-label="Listen to your voice sample" src={capture.sample.url} controls preload="metadata" />}
        </div>
         <SwitchField id="voice-sample-consent" className="voice-consent-toggle" checked={consent} disabled={capturing || busy} onCheckedChange={(next) => { setConsent(next); if (!next) discard(); }} label={demo ? "I agree to record my voice for this local preview" : "I consent to sending my sample to an external voice service and storing a voiceprint until I delete it"} description={demo ? "No biometric profile will be created." : "The sample is removed after processing or within about 75 minutes if processing stalls. Processing output expires after 24 hours. Matching requires a separate opt-in for each patient space."} />
          {capture.sample && <SwitchField id="voice-sample-confirm" className="voice-consent-toggle" checked={onlyMe} disabled={busy} onCheckedChange={setOnlyMe} label="I listened back to my sample" description="This sample contains only my voice, and I can hear it clearly." />}
        <div className="voice-actions">
          {recording ? <Button variant="destructive" size="lg" className="auth-submit" onClick={recorder.stop}><Square aria-hidden fill="currentColor" />Stop recording{capture.elapsed < VOICE_MIN_SECONDS && " (10 sec minimum)"}</Button> : capture.sample ? <>
            <Button variant="secondary" disabled={busy} onClick={discard}><RotateCcw aria-hidden />Retake</Button>
            <Button variant="primary" disabled={busy || !consent || !onlyMe || (!demo && !configured)} onClick={() => void run(async () => { if (!capture.sample) return; if (demo) { discard(); setDemoDone("sample"); } else { await onUpload?.(capture.sample); discard(); } })}>{busy ? "Sending…" : <>{demo ? "Finish voice preview" : "Create my voice profile"}<Check aria-hidden /></>}</Button>
          </> : <Button variant="primary" size="lg" className="auth-submit" disabled={!consent || capturing || busy || (!demo && !configured)} onClick={() => { setOnlyMe(false); void recorder.start(); }}><Mic aria-hidden />{capture.phase === "starting" ? "Opening microphone…" : capture.phase === "converting" ? "Preparing sample…" : capture.phase === "failed" ? "Try recording again" : "Start recording"}</Button>}
        </div>
        <Button variant="ghost" className="voice-secondary" disabled={capturing || busy} onClick={() => void run(async () => { discard(); await onSkip?.(); if (demo) setDemoDone("skipped"); setReopen(false); })}>I’ll do this later<ArrowRight aria-hidden /></Button>
        <p className="voice-tech-note"><ShieldCheck size={15} /><span>Your voice is for organizing memories, never for authentication. It is matched in a patient space only if you separately opt in there. <a href="https://github.com/pyannote/pyannote-audio" target="_blank" rel="noreferrer">About pyannote<ArrowRight size={11} /></a></span></p>
      </>}
      {error && <p className="voice-error" role="alert">{error}</p>}
      <Link href="/signup" className="text-link voice-back"><ArrowLeft size={14} />Back to account</Link>
    </>}
  </AuthShell>;
}

function LiveVoiceOnboarding() {
  const { isLoaded, isSignedIn } = useAuth();
  const authenticated = isLoaded && Boolean(isSignedIn);
  const { data, isLoading, error } = useApiQuery<{ configured: boolean; configurationMessage?: string | null; patientSpaceNames?: string[]; profile: FamilyProfile | null }>("voice-profile", authenticated, 5000);
  if (!isLoaded || (isSignedIn && isLoading && !error)) return <AuthShell signup step={1}><p role="status">Opening your voice setup…</p></AuthShell>;
  if (error) return <AuthShell signup step={1}><p role="alert">Voice setup is unavailable. Check the database connection and try again.</p></AuthShell>;
  if (!isSignedIn) return <AuthShell signup step={1}><div className="auth-intro"><h1>Your account comes first.</h1><p>Create an account or log in before setting up your voice.</p></div><Button asChild variant="primary"><Link href="/signup">Create an account<ArrowRight aria-hidden /></Link></Button></AuthShell>;
  if (!data) return <AuthShell signup step={1}><p role="status">Opening your voice setup…</p></AuthShell>;
  return <VoiceFlow configured={data!.configured} configurationMessage={data!.configurationMessage} patientSpaceNames={data!.patientSpaceNames} profile={data!.profile}
    onIntroduce={(name, relationship) => apiRequest("voice-profile", { json: { name, relationship } })}
    onSkip={() => apiRequest("voice-profile/skip", { json: {} })} onRevoke={() => apiRequest("voice-profile", { method: "DELETE" })}
    onUpload={async (sample) => {
      const query = new URLSearchParams({ requestId: sample.requestId, consent: "true" });
      await apiRequest(`voice?${query}`, { method: "POST", headers: { "Content-Type": "audio/wav" }, body: sample.blob });
    }} />;
}

export function VoiceOnboarding() {
  return appMode === "live" ? <LiveVoiceOnboarding /> : <VoiceFlow demo configured />;
}
