export type InvitationAcceptanceDecision =
  | { kind: "accept" | "already_accepted" }
  | { kind: "reject"; status: number; message: string };

export function verifiedPrimaryEmail(email: unknown, verified: boolean): string | null {
  if (!verified || typeof email !== "string" || !email.trim()) return null;
  return email.trim().toLowerCase();
}

export function authorizeInvitationAcceptance(input: {
  invitedEmail: string;
  primaryEmail: string;
  status: string;
  acceptedBy: string | null;
  subject: string;
  expiresAt: number;
  now: number;
}): InvitationAcceptanceDecision {
  if (input.status === "accepted" && input.acceptedBy === input.subject) {
    return { kind: "already_accepted" };
  }
  if (input.status !== "pending" || input.expiresAt <= input.now) {
    return { kind: "reject", status: 410, message: "Invitation link is invalid or expired." };
  }
  if (input.invitedEmail.trim().toLowerCase() !== input.primaryEmail) {
    return { kind: "reject", status: 403, message: "Sign in with the invited email address to accept this invitation." };
  }
  return { kind: "accept" };
}

export function mayJoinAsFamily(existingRole: unknown): boolean {
  return existingRole !== "patient";
}

export function voiceMatchingConsentIsAvailable(input: {
  requested: boolean;
  pyannoteConfigured: boolean;
  voiceState: unknown;
  hasVoiceprint: boolean;
}): boolean {
  return !input.requested || (input.pyannoteConfigured && input.voiceState === "enrolled" && input.hasVoiceprint);
}
