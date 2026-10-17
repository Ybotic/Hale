"use client";

import { useEffect, useRef, useState } from "react";
import { SignInButton, SignUpButton, useAuth } from "@clerk/nextjs";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiRequest } from "@/lib/api-client";
import { appMode } from "@/lib/app-mode";
import { Gate } from "./providers";
import { Button } from "./ui/button";

function LiveInvitationAcceptance() {
  const { isLoaded, isSignedIn } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token");
  const attemptedToken = useRef<string | null>(null);
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !token || attemptedToken.current === token) return;
    attemptedToken.current = token;
    void apiRequest<{ patientId: string }>("invitations/accept", { json: { token } })
      .then(() => { setAccepted(true); router.replace("/family/overview"); })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Invitation could not be accepted."));
  }, [isLoaded, isSignedIn, token, router]);

  if (!isLoaded) return <Gate title="Checking your invitation…" />;
  if (!token) return <Gate title="This invitation link is invalid." description="Ask the patient-space owner to send a new invitation." />;
  if (!isSignedIn) return <Gate title="You’re invited into a care circle." description="Sign in or create an account with the email address that received this invitation.">
    <div className="button-group">
       <SignInButton mode="modal" forceRedirectUrl={`/invite/accept?token=${encodeURIComponent(token)}`}><Button variant="primary">Sign in<ArrowRight aria-hidden /></Button></SignInButton>
       <SignUpButton mode="modal" forceRedirectUrl={`/invite/accept?token=${encodeURIComponent(token)}`}><Button variant="secondary">Create an account</Button></SignUpButton>
    </div>
  </Gate>;
  if (error) return <Gate title="This invitation couldn’t be accepted." description={error}><p className="small muted">Check that you signed in with the invited, verified email, or ask the patient-space owner for a fresh link.</p></Gate>;
  if (accepted) return <Gate title="You’re in the circle." description="Your family access is ready."><p className="icon-label"><ShieldCheck size={18} /><span>Opening the family space…</span><Check size={16} /></p></Gate>;
  return <Gate title="Accepting your invitation…" description="We’re checking the invitation and your verified email." />;
}

export function InvitationAcceptance() {
  if (appMode !== "live") return <Gate title="Family invitations need live mode." description="Sign-in and invitation acceptance are disabled in the fictional demo." />;
  return <LiveInvitationAcceptance />;
}
