import { Suspense } from "react";
import { Gate } from "@/components/providers";
import { InvitationAcceptance } from "@/components/invitation-acceptance";

export default function AcceptInvitationPage() {
  return <Suspense fallback={<Gate title="Opening your invitation…" />}><InvitationAcceptance /></Suspense>;
}
