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
    <PageIntro eyebrow="Your space, your choices" title={<>A little more <span className="heading-light">peace of mind.</span></>} description="Understand what is saved, who can see it, and what this first build can do." className="settings-page-intro" />
    <AppearanceSettings patient={patient} />
    <div className="settings-grid">
      <SpeakerMatchingConsent patientId={space.id} patient={patient} demo={mode === "demo"} />
      <section className="settings-card">
        <div className="icon-label"><ShieldCheck size={21} /><h2>Access &amp; privacy</h2></div>
        <dl className="settings-rows">
          <div><dt>Patient space</dt><dd>{space.name}</dd></div>
          <div><dt>Patient timezone</dt><dd>{space.timezone}</dd></div>
          <div><dt>Permission checks</dt><dd>{mode === "demo" ? "Synthetic demo only" : "Server-side membership and capabilities"}</dd></div>
          <div><dt>Family invitations</dt><dd><Link href={patient ? "/patient/people" : "/family/people"}>Manage in People</Link></dd></div>
        </dl>
        <p>Patient-owned records require an active membership and the appropriate capability. A family account or voice profile does not grant access to a patient space.</p>
      </section>
      <section className="settings-card">
        <div className="icon-label"><Database size={21} /><h2>Storage &amp; external processing</h2></div>
        <dl className="settings-rows">
          <div><dt>Raw conversation audio</dt><dd>Up to 7 days</dd></div>
          <div><dt>Transcripts &amp; memories</dt><dd>Until you delete them</dd></div>
          <div><dt>Unsent browser audio</dt><dd>Temporary; closing Hale can lose it</dd></div>
        </dl>
        <p>Cloud processing is not end-to-end encrypted. Some features send selected records or audio to external providers. See the <Link href="/terms">service terms</Link> for provider and consent details.</p>
      </section>
      <section className="settings-card iphone-settings">
        <div className="icon-label"><Smartphone size={21} /><h2>Hale on your iPhone</h2></div>
        <ol className="install-steps">
          <li>Open the patient experience in a supported browser over HTTPS.</li>
          <li>Use Install Hale, or open the browser menu and choose Add to Home Screen.</li>
          <li>{mode === "demo" ? "Open Hale from its icon; the fictional demo account loads automatically." : "Open Hale from its icon and sign in."}</li>
          <li>Keep Hale visible and your screen unlocked while recording.</li>
        </ol>
        <Link className="text-link" href="/patient/today">{patient ? "Return to Today" : "Open patient experience"}<ArrowUpRight size={15} /></Link>
        <p>Home Screen installation doesn’t allow background microphone capture. Calls, screen lock, or another app may interrupt recording.</p>
      </section>
      <section className="settings-card">
        <div className="icon-label">{mode === "demo" ? <FlaskConical size={21} /> : <LockKeyhole size={21} />}<h2>{mode === "demo" ? "About this demo" : "About this connection"}</h2></div>
        <p>{mode === "demo"
          ? "This space contains fictional people and conversations. Demo changes stay in this browser session and reset when the page reloads; recall uses local example data."
          : "Clerk handles sign-in and TigerData stores patient-space records. Depending on the feature, selected information may be processed by external providers; see the service terms for details."}</p>
        <p>Hale is not medical advice and does not automatically book rides or appointments.</p>
        <Link className="text-link" href="/terms">Read the service terms<ArrowUpRight size={15} /></Link>
        {resetDemo && <Button variant="secondary" onClick={resetDemo}><RotateCcw aria-hidden />Reset demo data</Button>}
      </section>
    </div>
  </PageScrollReveal>;
}
