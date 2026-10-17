import { describe, expect, test } from "bun:test";
import {
  authorizeInvitationAcceptance,
  mayJoinAsFamily,
  verifiedPrimaryEmail,
  voiceMatchingConsentIsAvailable,
} from "./invitation-policy";

const pendingInvitation = {
  invitedEmail: "caregiver@example.com",
  primaryEmail: "caregiver@example.com",
  status: "pending",
  acceptedBy: null,
  subject: "user-1",
  expiresAt: 2_000,
  now: 1_000,
};

describe("family invitation authorization", () => {
  test("requires a verified primary email and normalizes it", () => {
    expect(verifiedPrimaryEmail(" Caregiver@Example.com ", true)).toBe("caregiver@example.com");
    expect(verifiedPrimaryEmail("caregiver@example.com", false)).toBeNull();
    expect(verifiedPrimaryEmail(null, true)).toBeNull();
  });

  test("accepts only a pending, unexpired invitation addressed to the verified user", () => {
    expect(authorizeInvitationAcceptance(pendingInvitation)).toEqual({ kind: "accept" });
    expect(authorizeInvitationAcceptance({ ...pendingInvitation, primaryEmail: "other@example.com" })).toMatchObject({ kind: "reject", status: 403 });
    expect(authorizeInvitationAcceptance({ ...pendingInvitation, expiresAt: 1_000 })).toMatchObject({ kind: "reject", status: 410 });
    expect(authorizeInvitationAcceptance({ ...pendingInvitation, status: "revoked" })).toMatchObject({ kind: "reject", status: 410 });
  });

  test("allows idempotent acceptance only for the same Clerk subject", () => {
    const accepted = { ...pendingInvitation, status: "accepted", acceptedBy: "user-1" };
    expect(authorizeInvitationAcceptance(accepted)).toEqual({ kind: "already_accepted" });
    expect(authorizeInvitationAcceptance({ ...accepted, subject: "user-2" })).toMatchObject({ kind: "reject", status: 410 });
  });

  test("prevents patient owners from joining as family and gates optional voice consent", () => {
    expect(mayJoinAsFamily("family")).toBe(true);
    expect(mayJoinAsFamily("patient")).toBe(false);
    expect(voiceMatchingConsentIsAvailable({ requested: false, pyannoteConfigured: false, voiceState: "not_enrolled", hasVoiceprint: false })).toBe(true);
    expect(voiceMatchingConsentIsAvailable({ requested: true, pyannoteConfigured: true, voiceState: "enrolled", hasVoiceprint: true })).toBe(true);
    expect(voiceMatchingConsentIsAvailable({ requested: true, pyannoteConfigured: true, voiceState: "not_enrolled", hasVoiceprint: false })).toBe(false);
    expect(voiceMatchingConsentIsAvailable({ requested: true, pyannoteConfigured: false, voiceState: "enrolled", hasVoiceprint: true })).toBe(false);
  });
});
