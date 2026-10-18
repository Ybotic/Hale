import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { clerkClient } from "@clerk/nextjs/server";
import { authorizeInvitationAcceptance, mayJoinAsFamily, verifiedPrimaryEmail, voiceMatchingConsentIsAvailable } from "../invitation-policy";
import { deploymentVoiceOrigin } from "../voice-origin-policy";
import { BackendError, getDb, isUuid, readJson, requireMember } from "./db";

const FAMILY_CAPABILITIES = ["memories:read", "medications:read", "medications:record"] as const;
const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60_000;

function normalizedEmail(value: unknown) {
  if (typeof value !== "string") throw new BackendError("Enter a valid email address.");
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BackendError("Enter a valid email address.");
  return email;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function logClerkInvitationFailure(error: unknown) {
  if (!error || typeof error !== "object") {
    console.error("Clerk family invitation email failed.");
    return;
  }
  const details = error as { status?: unknown; errors?: unknown };
  const codes = Array.isArray(details.errors)
    ? details.errors.flatMap((item) => item && typeof item === "object" && "code" in item && typeof item.code === "string" ? [item.code] : [])
    : [];
  console.error("Clerk family invitation email failed.", {
    status: typeof details.status === "number" ? details.status : undefined,
    codes,
  });
}

async function listInvitations(subject: string, request: Request) {
  const patientId = new URL(request.url).searchParams.get("patientId") ?? "";
  if (!isUuid(patientId)) throw new BackendError("Patient space unavailable.", 404);
  await requireMember(subject, patientId, "sharing:manage");
  const sql = getDb();
  const now = Date.now();
  await sql`UPDATE family_invitations SET status = 'expired'
    WHERE patient_id = ${patientId}::uuid AND status = 'pending' AND expires_at <= ${now}`;
  const rows = await sql`SELECT id::text, email, expires_at, created_at
    FROM family_invitations WHERE patient_id = ${patientId}::uuid AND status = 'pending'
    ORDER BY created_at DESC LIMIT 50`;
  return Response.json({ invitations: rows.map((row) => ({
    id: String(row.id), email: String(row.email), expiresAt: Number(row.expires_at), createdAt: Number(row.created_at),
  })) });
}

async function createInvitation(subject: string, request: Request) {
  const args = await readJson(request);
  const patientId = typeof args.patientId === "string" ? args.patientId : "";
  if (!isUuid(patientId)) throw new BackendError("Patient space unavailable.", 404);
  await requireMember(subject, patientId, "sharing:manage");
  const email = normalizedEmail(args.email);
  const capabilities = [...FAMILY_CAPABILITIES];
  const clerk = await clerkClient();
  const inviter = await clerk.users.getUser(subject);
  const inviterPrimary = inviter.emailAddresses.find((address) => address.id === inviter.primaryEmailAddressId);
  if (inviterPrimary?.emailAddress.toLowerCase() === email) throw new BackendError("You already have access to this account.", 409);

  const origin = deploymentVoiceOrigin(process.env.APP_ORIGIN, process.env.VERCEL_URL);
  if (!origin) throw new BackendError("A public HTTPS APP_ORIGIN is required to create an invitation link.", 503);
  const now = Date.now();
  const invitationId = crypto.randomUUID();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = now + INVITE_LIFETIME_MS;
  const sql = getDb();
  await sql`UPDATE family_invitations SET status = 'expired'
    WHERE patient_id = ${patientId}::uuid AND email = ${email} AND status = 'pending' AND expires_at <= ${now}`;
  try {
    await sql`INSERT INTO family_invitations (id, patient_id, email, token_hash, capabilities, status, created_by, expires_at, created_at)
      VALUES (${invitationId}::uuid, ${patientId}::uuid, ${email}, ${tokenHash}, ${capabilities}, 'pending', ${subject}, ${expiresAt}, ${now})`;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      throw new BackendError("An invitation is already pending for this email.", 409);
    }
    throw error;
  }

  const acceptUrl = new URL("/invite/accept", origin);
  acceptUrl.searchParams.set("token", token);
  try {
    const clerkInvitation = await clerk.invitations.createInvitation({
      emailAddress: email,
      expiresInDays: 7,
      ignoreExisting: true,
      notify: true,
      redirectUrl: acceptUrl.toString(),
    });
    await sql`UPDATE family_invitations SET clerk_invitation_id = ${clerkInvitation.id}
      WHERE id = ${invitationId}::uuid AND status = 'pending'`;
  } catch (error) {
    logClerkInvitationFailure(error);
    await sql`UPDATE family_invitations SET status = 'failed' WHERE id = ${invitationId}::uuid AND status = 'pending'`;
    throw new BackendError("The invitation email could not be sent. Use the copyable link or try again later.", 502);
  }
  return Response.json({ id: invitationId, email, expiresAt, acceptUrl: acceptUrl.toString() });
}

async function revokeInvitation(subject: string, request: Request, invitationId: string) {
  const patientId = new URL(request.url).searchParams.get("patientId") ?? "";
  if (!isUuid(patientId) || !isUuid(invitationId)) throw new BackendError("Invitation unavailable.", 404);
  await requireMember(subject, patientId, "sharing:manage");
  const sql = getDb();
  const rows = await sql`UPDATE family_invitations SET status = 'revoked', revoked_at = ${Date.now()}
    WHERE id = ${invitationId}::uuid AND patient_id = ${patientId}::uuid AND status = 'pending'
    RETURNING clerk_invitation_id`;
  if (!rows[0]) throw new BackendError("Invitation unavailable or already used.", 404);
  if (rows[0].clerk_invitation_id) {
    try { await (await clerkClient()).invitations.revokeInvitation(String(rows[0].clerk_invitation_id)); }
    catch { /* The TigerData invitation is revoked, so its acceptance token cannot grant access. */ }
  }
  return Response.json({ revoked: true });
}

async function acceptInvitation(subject: string, request: Request) {
  const args = await readJson(request);
  const token = typeof args.token === "string" && /^[A-Za-z0-9_-]{40,64}$/.test(args.token) ? args.token : null;
  if (!token) throw new BackendError("Invitation link is invalid or expired.", 400);
  if (args.voiceMatchingConsent !== undefined && typeof args.voiceMatchingConsent !== "boolean") throw new BackendError("Voice matching consent must be explicit.");
  const voiceMatchingConsent = args.voiceMatchingConsent === true;
  const user = await (await clerkClient()).users.getUser(subject);
  const primary = user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId);
  const email = verifiedPrimaryEmail(primary?.emailAddress, primary?.verification?.status === "verified");
  if (!email) throw new BackendError("Verify your primary email before accepting a family invitation.", 403);
  const tokenHash = hashToken(token);
  const now = Date.now();
  const result = await getDb().begin(async (tx) => {
    const rows = await tx`SELECT id::text, patient_id::text, email, capabilities, status, expires_at, accepted_by
      FROM family_invitations WHERE token_hash = ${tokenHash} FOR UPDATE`;
    const invitation = rows[0];
    if (!invitation) throw new BackendError("Invitation link is invalid or expired.", 404);
    const authorization = authorizeInvitationAcceptance({
      invitedEmail: String(invitation.email), primaryEmail: email, status: String(invitation.status),
      acceptedBy: invitation.accepted_by ? String(invitation.accepted_by) : null, subject,
      expiresAt: Number(invitation.expires_at), now,
    });
    if (authorization.kind === "reject") {
      if (invitation.status === "pending" && Number(invitation.expires_at) <= now) {
        await tx`UPDATE family_invitations SET status = 'expired' WHERE id = ${String(invitation.id)}::uuid`;
      }
      throw new BackendError(authorization.message, authorization.status);
    }
    if (authorization.kind === "already_accepted") return { patientId: String(invitation.patient_id) };

    const profiles = await tx`SELECT name, relationship, voice_state, voiceprint IS NOT NULL AS has_voiceprint
      FROM family_profiles WHERE subject = ${subject} LIMIT 1`;
    const voiceProfile = profiles[0];
    if (!voiceMatchingConsentIsAvailable({
      requested: voiceMatchingConsent, pyannoteConfigured: Boolean(process.env.PYANNOTE_API_KEY),
      voiceState: voiceProfile?.voice_state, hasVoiceprint: Boolean(voiceProfile?.has_voiceprint),
    })) {
      throw new BackendError("Enroll your voice and configure pyannote before opting into matching.", 409);
    }

    const existing = await tx`SELECT role, active FROM memberships
      WHERE patient_id = ${String(invitation.patient_id)}::uuid AND subject = ${subject} LIMIT 1`;
    if (!mayJoinAsFamily(existing[0]?.role)) throw new BackendError("This account owns the patient space and cannot join it as family.", 409);
    await tx`INSERT INTO memberships (id, patient_id, subject, role, capabilities, active)
      VALUES (${crypto.randomUUID()}::uuid, ${String(invitation.patient_id)}::uuid, ${subject}, 'family', ${invitation.capabilities}, TRUE)
      ON CONFLICT (patient_id, subject) DO UPDATE SET role = 'family', capabilities = EXCLUDED.capabilities, active = TRUE`;
    const profile = voiceProfile;
    const displayName = profile?.name ? String(profile.name) : [user.firstName, user.lastName].filter(Boolean).join(" ") || email.split("@")[0];
    const relationship = profile?.relationship ? String(profile.relationship) : "Family member";
    const people = await tx`SELECT id FROM people WHERE patient_id = ${String(invitation.patient_id)}::uuid AND subject = ${subject} LIMIT 1`;
    if (people[0]) {
      await tx`UPDATE people SET name = ${displayName}, relationship = ${relationship} WHERE patient_id = ${String(invitation.patient_id)}::uuid AND subject = ${subject}`;
    } else {
      await tx`INSERT INTO people (id, patient_id, subject, name, relationship, enrollment)
        VALUES (${crypto.randomUUID()}::uuid, ${String(invitation.patient_id)}::uuid, ${subject}, ${displayName}, ${relationship}, ${voiceMatchingConsent ? "enrolled" : "not_enrolled"})`;
    }
    if (voiceMatchingConsent) {
      await tx`INSERT INTO consents (id, patient_id, subject, purpose, policy_version, granted_at, revoked_at)
        VALUES (${crypto.randomUUID()}::uuid, ${String(invitation.patient_id)}::uuid, ${subject}, 'speaker_identification', 'speaker-identification-2026-10-16-v1', ${now}, NULL)
        ON CONFLICT (patient_id, subject, purpose) DO UPDATE SET policy_version = EXCLUDED.policy_version, granted_at = EXCLUDED.granted_at, revoked_at = NULL`;
      await tx`UPDATE people SET enrollment = 'enrolled'
        WHERE patient_id = ${String(invitation.patient_id)}::uuid AND subject = ${subject}`;
    }
    await tx`UPDATE family_invitations SET status = 'accepted', accepted_by = ${subject}, accepted_at = ${now}
      WHERE id = ${String(invitation.id)}::uuid AND status = 'pending'`;
    await tx`INSERT INTO audit_events (id, patient_id, actor, operation, target, timestamp)
      VALUES (${crypto.randomUUID()}::uuid, ${String(invitation.patient_id)}::uuid, ${subject}, 'family.invitation.accepted', ${String(invitation.id)}, ${now})`;
    return { patientId: String(invitation.patient_id) };
  });
  return Response.json({ accepted: true, patientId: result.patientId });
}

export async function handleInvitationRoute(request: Request, path: string[], subject: string): Promise<Response | null> {
  const method = request.method.toUpperCase();
  const route = path.join("/");
  if (route === "invitations" && method === "GET") return await listInvitations(subject, request);
  if (route === "invitations" && method === "POST") return await createInvitation(subject, request);
  if (route === "invitations/accept" && method === "POST") return await acceptInvitation(subject, request);
  if (path[0] === "invitations" && path[1] && method === "DELETE") return await revokeInvitation(subject, request, path[1]);
  return null;
}
