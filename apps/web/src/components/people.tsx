"use client";

import { AudioLines } from "lucide-react";
import { useWorkspace } from "./providers";
import { FamilyInvitations } from "./family-invitations";
import { PageIntro } from "./ui";
import { hasSpaceCapability } from "@/lib/ui-permissions";

export function PeopleView() {
  const { space, mode } = useWorkspace();
  const canInvite = hasSpaceCapability(space.capabilities, "sharing:manage");
  return <>
    <PageIntro eyebrow="Your circle" title={<>The voices <span className="heading-light">you know.</span></>} description="Familiar people, their connection to you, and the conversations you share." />
    <div className="people-grid">{space.people.map((person) => {
      const count = space.conversations.filter((conversation) => conversation.people.includes(person.id)).length;
      return <article className="person-card" key={person.id}>
        <span className={`avatar avatar-large avatar-${person.color}`}>{person.initials}</span>
        <h2>{person.name}</h2><p className="muted">{person.relationship}</p>
        <div className="person-enrollment"><AudioLines size={17} /><span>{mode === "demo" ? "Demo enrollment · no real voiceprint" : person.enrollment === "enrolled" ? "Voice matching enabled here" : person.enrollment === "revoked" ? "Voice matching withdrawn" : "Matching off in this space"}</span></div>
        <span className="small muted">{count} linked {count === 1 ? "conversation" : "conversations"}</span>
      </article>;
    })}</div>
    <FamilyInvitations patientId={space.id} enabled={canInvite} demo={mode === "demo"} />
  </>;
}
