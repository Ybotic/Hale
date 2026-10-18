"use client";

import { AudioLines, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { useWorkspace } from "./providers";
import { PageScrollReveal } from "./motion-primitives";
import { FamilyInvitations } from "./family-invitations";
import { PageIntro, PrivacyNote } from "./ui";
import { hasSpaceCapability } from "@/lib/ui-permissions";

export function PeopleView() {
  const { space, mode } = useWorkspace();
  const canInvite = hasSpaceCapability(space.capabilities, "sharing:manage");
  return <PageScrollReveal>
    <PageIntro eyebrow="" title={<>The voices <span className="heading-light">you know.</span></>} />
    <div className="people-grid">{space.people.map((person) => {
      const count = space.conversations.filter((conversation) => conversation.people.includes(person.id)).length;
      return <article className="person-card" key={person.id}>
        <span className={`avatar avatar-large avatar-${person.color}`}>{person.initials}</span>
        <h2>{person.name}</h2><p className="muted">{person.relationship}</p>
        <div className="person-enrollment"><AudioLines size={17} /><span>{mode === "demo" ? "Demo enrollment · no real voiceprint" : person.enrollment === "enrolled" ? "Voice matching enabled here" : person.enrollment === "revoked" ? "Voice matching withdrawn" : "Matching off in this space"}</span></div>
        <span className="small muted">{count} linked {count === 1 ? "conversation" : "conversations"}</span>
      </article>;
    })}</div>
    <div className="people-explainer">
      <div><Users size={22} /><h3>A person is more than a voice match.</h3><p>Profiles help organize memories. They don’t grant account access, establish recording consent, or prove someone was physically present.</p></div>
      <div><ShieldCheck size={22} /><h3>Consent comes first. Every time.</h3><p>An accepted family invitation links an account’s profile to its person card. Each person separately opts in to matching for this patient space; manage profiles and review recognition readiness in Settings.</p><Link className="text-link" href="/signup/voice">{mode === "demo" ? "Try voice setup" : "Manage my voice profile"}<AudioLines size={15} /></Link></div>
    </div>
    <FamilyInvitations patientId={space.id} enabled={canInvite} demo={mode === "demo"} />
    <div className="bottom-callout"><PrivacyNote editorial>Uncertain speakers stay unnamed. No one is identified solely because their name is mentioned.</PrivacyNote></div>
  </PageScrollReveal>;
}
