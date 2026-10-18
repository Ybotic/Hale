"use client";

import Link from "next/link";
import { ArrowUpRight, Smartphone } from "lucide-react";
import { useWorkspace } from "./providers";
import { PageIntro } from "./ui";
import { SpeakerMatchingConsent } from "./speaker-matching-consent";
import { AppearanceSettings } from "./appearance";

export function SettingsView({ patient = false }: { patient?: boolean }) {
  const { mode, space } = useWorkspace();
  return <>
    <PageIntro eyebrow="Your space, your choices" title={<>A little more <span className="heading-light">peace of mind.</span></>} description="Understand what is saved, who can see it, and what this first build can do." className="settings-page-intro" />
    <AppearanceSettings patient={patient} />
    <div className="settings-grid">
      <SpeakerMatchingConsent patientId={space.id} patient={patient} demo={mode === "demo"} />
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
    </div>
  </>;
}
