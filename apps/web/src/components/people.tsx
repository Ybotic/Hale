"use client";

import { AudioLines, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { useWorkspace } from "./providers";
import { FamilyInvitations } from "./family-invitations";
import { SpeakerMatchingConsent } from "./speaker-matching-consent";
import { PageIntro, PrivacyNote } from "./ui";

export function PeopleView() {
  const { space, mode } = useWorkspace();
  const canInvite = space.capabilities.includes("sharing:manage");
  return <>
    <PageIntro eyebrow="YOUR CIRCLE" title={<>The voices <span className="heading-light">you know.</span></>} description="Familiar people, their connection to you, and the conversations you share." />
    <div className="people-grid">{space.people.map((person) => {
      const count = space.conversations.filter((conversation) => conversation.people.includes(person.id)).length;
      return <article className="person-card" key={person.id}>
        <span className={`avatar avatar-large avatar-${person.color}`}>{person.initials}</span>
        <h2>{person.name}</h2><p className="muted">{person.relationship}</p>
        <div className="person-enrollment"><AudioLines size={17} /><span>{mode === "demo" ? "Demo enrollment · no real voiceprint" : person.enrollment === "enrolled" ? "Voice enrolled with consent" : "Voice not enrolled"}</span></div>
        <span className="small muted">{count} linked {count === 1 ? "conversation" : "conversations"}</span>
      </article>;
    })}</div>
    <div className="people-explainer">
      <div><Users size={22} /><h3>A person is more than a voice match.</h3><p>Profiles help organize memories. They don’t grant account access, establish recording consent, or prove someone was physically present.</p></div>
      <div><ShieldCheck size={22} /><h3>Consent comes first. Every time.</h3><p>Voiceprints are linked to a person only through an accepted family invitation. Each person separately opts in to matching for this patient space.</p><Link className="text-link" href="/signup/voice">{mode === "demo" ? "Try voice setup" : "Manage my voice profile"}<AudioLines size={15} /></Link></div>
    </div>
    <FamilyInvitations patientId={space.id} enabled={canInvite} demo={mode === "demo"} />
    <SpeakerMatchingConsent patientId={space.id} demo={mode === "demo"} />
    <div className="bottom-callout"><PrivacyNote>Uncertain speakers stay unnamed. No one is identified solely because their name is mentioned.</PrivacyNote></div>
  </>;
}
