import "server-only";
import { BackendError, getDb, isUuid, readJson, requireMember } from "./db";

const MATCHING_POLICY = "speaker-identification-2026-10-16-v1";

async function getVoiceMatching(subject: string, request: Request) {
  const patientId = new URL(request.url).searchParams.get("patientId");
  if (!isUuid(patientId)) throw new BackendError("Patient space unavailable.", 404);
  await requireMember(subject, patientId, "memories:read");
  const sql = getDb();
  const rows = await sql`
    SELECT p.id::text AS person_id, p.name, p.relationship, p.subject, p.enrollment,
      f.voice_state, f.voiceprint IS NOT NULL AS has_voiceprint,
      EXISTS (SELECT 1 FROM consents c WHERE c.patient_id = p.patient_id AND c.subject = p.subject
        AND c.purpose = 'speaker_identification' AND c.revoked_at IS NULL) AS matching_consent
    FROM people p
    LEFT JOIN family_profiles f ON f.subject = p.subject
    WHERE p.patient_id = ${patientId}::uuid
    ORDER BY COALESCE((p.subject = ${subject}), FALSE) DESC, p.name LIMIT 100
  `;
  const workerRows = await sql`SELECT last_seen, transcription_only, local_gpu, speaker_identification_enabled
    FROM worker_heartbeats ORDER BY last_seen DESC LIMIT 1`;
  const worker = workerRows[0];
  const lastSeen = worker?.last_seen ? Number(worker.last_seen) : null;
  const workerOnline = lastSeen !== null && Date.now() - lastSeen < 45_000;
  const profiles = rows.map((row) => ({
    personId: String(row.person_id),
    name: String(row.name),
    relationship: String(row.relationship),
    isSelf: row.subject === subject,
    voiceState: row.voice_state ? String(row.voice_state) : null,
    enrolled: row.voice_state === "enrolled" && Boolean(row.has_voiceprint),
    matchingEnabled: Boolean(row.matching_consent),
  }));
  const ownProfile = profiles.find((profile) => profile.isSelf) ?? null;
  const consentedProfileCount = profiles.filter((profile) => profile.enrolled && profile.matchingEnabled).length;
  return Response.json({
    configured: Boolean(process.env.PYANNOTE_API_KEY),
    workerOnline,
    workerLastSeen: lastSeen,
    identificationAvailable: workerOnline && Boolean(worker?.speaker_identification_enabled),
    transcriptionOnly: Boolean(worker?.transcription_only),
    localGpu: Boolean(worker?.local_gpu),
    consentedProfileCount,
    profiles,
    person: ownProfile ? { id: ownProfile.personId, name: ownProfile.name } : null,
    enrolled: Boolean(ownProfile?.enrolled),
    enabled: Boolean(ownProfile?.matchingEnabled),
  });
}

async function setVoiceMatching(subject: string, request: Request) {
  const args = await readJson(request);
  const patientId = typeof args.patientId === "string" ? args.patientId : "";
  if (!isUuid(patientId)) throw new BackendError("Patient space unavailable.", 404);
  if (typeof args.enabled !== "boolean") throw new BackendError("Choose whether to enable voice matching.");
  await requireMember(subject, patientId, "memories:read");
  const sql = getDb();
  const rows = await sql`SELECT p.id::text, f.voice_state, f.voiceprint IS NOT NULL AS has_voiceprint
    FROM people p LEFT JOIN family_profiles f ON f.subject = p.subject
    WHERE p.patient_id = ${patientId}::uuid AND p.subject = ${subject} LIMIT 1`;
  const person = rows[0];
  if (!person) throw new BackendError("This account is not linked to a person in the patient space.", 404);
  if (args.enabled && (person.voice_state !== "enrolled" || !person.has_voiceprint)) {
    throw new BackendError("Create your voice profile before enabling matching.", 409);
  }
  const now = Date.now();
  await sql.begin(async (tx) => {
    if (args.enabled) {
      await tx`INSERT INTO consents (id, patient_id, subject, purpose, policy_version, granted_at, revoked_at)
        VALUES (${crypto.randomUUID()}::uuid, ${patientId}::uuid, ${subject}, 'speaker_identification', ${MATCHING_POLICY}, ${now}, NULL)
        ON CONFLICT (patient_id, subject, purpose) DO UPDATE SET policy_version = EXCLUDED.policy_version, granted_at = EXCLUDED.granted_at, revoked_at = NULL`;
      await tx`UPDATE people SET enrollment = 'enrolled' WHERE id = ${String(person.id)}::uuid`;
    } else {
      await tx`UPDATE consents SET revoked_at = ${now}
        WHERE patient_id = ${patientId}::uuid AND subject = ${subject} AND purpose = 'speaker_identification' AND revoked_at IS NULL`;
      await tx`UPDATE people SET enrollment = 'not_enrolled' WHERE id = ${String(person.id)}::uuid`;
    }
    await tx`INSERT INTO audit_events (id, patient_id, actor, operation, target, timestamp)
      VALUES (${crypto.randomUUID()}::uuid, ${patientId}::uuid, ${subject}, ${args.enabled ? "speaker.matching.enabled" : "speaker.matching.revoked"}, ${String(person.id)}, ${now})`;
  });
  return Response.json({ enabled: args.enabled });
}

export async function handleVoiceMatchingRoute(request: Request, path: string[], subject: string): Promise<Response | null> {
  const route = path.join("/");
  if (route === "voice-matching" && request.method === "GET") return await getVoiceMatching(subject, request);
  if (route === "voice-matching" && request.method === "POST") return await setVoiceMatching(subject, request);
  return null;
}
