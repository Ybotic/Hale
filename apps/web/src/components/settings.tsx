"use client";

import Link from "next/link";
import { ArrowUpRight, Database, FlaskConical, LockKeyhole, RotateCcw, ShieldCheck, Smartphone } from "lucide-react";
import { useWorkspace } from "./providers";
import { PageScrollReveal } from "./motion-primitives";
import { PageIntro } from "./ui";
import { SpeakerMatchingConsent } from "./speaker-matching-consent";
import { AppearanceSettings } from "./appearance";
import { Button } from "./ui/button";

export function SettingsView({ patient = false }: { patient?: boolean }) {
  const { mode, space, resetDemo } = useWorkspace();
  return <PageScrollReveal>
    <PageIntro eyebrow="Your space, your choices" title={<>A little more <span className="heading-light">peace of mind.</span></>} description="Understand what is saved, who can see it, and what this first build can do." />
    <AppearanceSettings patient={patient} />
    <div className="settings-grid">
      <SpeakerMatchingConsent patientId={space.id} demo={mode === "demo"} editorial={!patient} />
      <section className="settings-card">
        <div className="icon-label"><ShieldCheck size={21} /><h2>Access & privacy</h2></div>
        <dl className="settings-rows">
          <div><dt>Patient space</dt><dd>{space.name}</dd></div>
          <div><dt>Patient timezone</dt><dd>{space.timezone}</dd></div>
          <div><dt>Permission checks</dt><dd>{mode === "demo" ? "Synthetic demo only" : "Server-side TigerData membership"}</dd></div>
          <div><dt>Family invitations</dt><dd>Manage in People</dd></div>
        </dl>
        <p>No blanket family access. Patient-owned records require an active membership and the appropriate capability. Voice enrollment never authorizes an account.</p>
      </section>
      <section className="settings-card">
        <div className="icon-label"><Database size={21} /><h2>What stays, and for how long</h2></div>
        <dl className="settings-rows">
          <div><dt>Raw conversation audio</dt><dd>Up to 7 days after upload</dd></div>
          <div><dt>Transcripts & memories</dt><dd>Until you delete the conversation</dd></div>
          <div><dt>Browser recording queue</dt><dd>In-memory only · up to 3 segments</dd></div>
          <div><dt>Offline cache</dt><dd>Public fallback & icons only</dd></div>
        </dl>
        <p>Cloud processing is not end-to-end encrypted. Unsent audio can be lost when the page closes. Deleting a conversation clears its Backboard assistant context; voice enrollment is separate.</p>
      </section>
      <section className="settings-card">
        <div className="icon-label"><Smartphone size={21} /><h2>Hale on your iPhone</h2></div>
        <ol className="install-steps">
          <li>Open the patient experience in a supported browser over HTTPS.</li>
          <li>Use Install Hale, or open the browser menu and choose Add to Home Screen.</li>
          <li>Open Hale from its icon and sign in.</li>
          <li>Keep Hale visible and your screen unlocked while recording.</li>
        </ol>
        <Link className="text-link" href="/patient/today">{patient ? "Return to Today" : "Open patient experience"}<ArrowUpRight size={15} /></Link>
        <p>Home Screen installation doesn’t allow background microphone capture. Calls, screen lock, or another app may interrupt recording.</p>
      </section>
      <section className="settings-card">
        <div className="icon-label">{mode === "demo" ? <FlaskConical size={21} /> : <LockKeyhole size={21} />}<h2>{mode === "demo" ? "About this demo" : "Live connection"}</h2></div>
        <p>{mode === "demo"
          ? "Every person and transcript is fictional. The fixed demo date is October 15, 2026. Recall is deterministic and offline. Demo changes reset on reload."
          : "Clerk authenticates your account and TigerData stores application records and audio. Ask and the patient care assistant use OpenRouter’s free model after you opt in. Voice transcription and spoken replies use ElevenLabs after separate consent. Backboard remains available for optional server-side memory processing."}</p>
        <p>No automatic ride dispatch, no medical advice, and no clinical validation or HIPAA-compliance claim.</p>
        {resetDemo && <Button variant="secondary" onClick={resetDemo}><RotateCcw aria-hidden />Reset demo memories</Button>}
      </section>
    </div>
  </PageScrollReveal>;
}
