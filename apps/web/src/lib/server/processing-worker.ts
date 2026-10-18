import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { RECORDING_CONSENT_POLICY_VERSION, type TranscriptTurn } from "@hale/contracts";
import { localDate } from "@hale/contracts/time";
import { backboardProcessingEnabled, extractMemoryCandidates, summarizePatientDay } from "./backboard";
import { getDb } from "./db";
import { dispatchDueCareReminders } from "./care-reminder-worker";
import { localGpuEnabled, MAX_PROCESSING_ATTEMPTS, processingFailureOutcome, speakerIdentificationConfigured, transcriptionOnlyEnabled } from "./processing-policy";
import { deploymentVoiceOrigin } from "../voice-origin-policy";
import { conversationTitleFromTurns } from "../conversation-title";
import { pollPyannoteJob as pollPyannoteProviderJob, ProcessingError, submitPyannoteJob, transcribeAudio, transcribeLocalGpuAudio } from "./processing-providers";
import {
  mergeTranscriptAndSpeakers,
  validateDailySummary,
  validateMemoryCandidates,
  type ExtractedMemoryCandidate,
  type DiarizationSegment,
  type SpeakerConfidence,
  type SpeakerIdentity,
  type TimedTranscriptSegment,
  type VoiceMatch,
} from "../processing";

const LEASE_MS = 5 * 60_000;
const PYANNOTE_POLL_MS = 5_000;
const AUDIO_TOKEN_LIFETIME_MS = 60 * 60_000;
const transcriptionOnly = () => transcriptionOnlyEnabled();

type Job = {
  id: string;
  patientId: string;
  chunkId: string;
  conversationId: string;
  localDate: string;
  timezone: string;
  stage: "transcribe" | "diarize" | "merge" | "extract";
  attempts: number;
  pyannoteJobId: string | null;
  transcriptPayload: unknown;
  diarizationPayload: unknown;
};

function parsePayload<T>(payload: unknown): T {
  if (typeof payload === "string") return JSON.parse(payload) as T;
  return payload as T;
}

function nowMs() { return Date.now(); }

function invalidStructuredOutput(error: unknown) {
  return error instanceof SyntaxError || (error instanceof Error && /Backboard returned an (invalid (memory response|summary or unsupported source references)|empty structured response)/.test(error.message));
}

async function assertJobActive(job: Job) {
  const rows = await getDb()`SELECT j.id FROM processing_jobs j
    JOIN conversations c ON c.chunk_id = j.chunk_id
    JOIN audio_chunks a ON a.id = j.chunk_id
    WHERE j.id = ${job.id}::uuid AND j.state = 'processing'
      AND c.deleted_at IS NULL AND a.deleted_at IS NULL AND a.audio IS NOT NULL LIMIT 1`;
  if (!rows.length) throw new ProcessingError("job_cancelled", false);
}

async function failAudioUnavailable() {
  const sql = getDb();
  const now = nowMs();
  await sql`UPDATE processing_jobs j SET state = 'failed', error = 'recording_consent_update_required', lease_expires_at = NULL, updated_at = ${now}
    FROM audio_chunks a JOIN recording_sessions s ON s.id = a.session_id
    WHERE a.id = j.chunk_id AND j.state IN ('queued', 'processing') AND s.consent_policy_version <> ${RECORDING_CONSENT_POLICY_VERSION}`;
  await sql`UPDATE conversations c SET state = 'failed', summary = 'Updated recording consent is required before this audio can be processed.'
    FROM audio_chunks a JOIN recording_sessions s ON s.id = a.session_id
    WHERE a.id = c.chunk_id AND s.consent_policy_version <> ${RECORDING_CONSENT_POLICY_VERSION}
      AND c.state IN ('queued', 'processing') AND c.deleted_at IS NULL`;
  await sql`UPDATE audio_chunks SET audio = NULL, processing_token_hash = NULL, processing_token_expires_at = NULL
    WHERE audio IS NOT NULL AND expires_at <= ${now}`;
  await sql`UPDATE processing_jobs j SET state = 'failed', error = 'audio_unavailable', lease_expires_at = NULL, updated_at = ${now}
    FROM audio_chunks a WHERE a.id = j.chunk_id AND j.state IN ('queued', 'processing')
      AND (a.audio IS NULL OR a.deleted_at IS NOT NULL OR a.expires_at <= ${now})`;
  await sql`UPDATE conversations c SET state = 'failed', summary = 'Recording audio expired before processing.'
    FROM audio_chunks a WHERE a.id = c.chunk_id AND (a.audio IS NULL OR a.deleted_at IS NOT NULL)
      AND c.state IN ('queued', 'processing') AND c.deleted_at IS NULL`;
  await sql`UPDATE audio_chunks SET processing_token_hash = NULL, processing_token_expires_at = NULL
    WHERE processing_token_expires_at <= ${now}`;
}

async function updateWorkerHeartbeat(id: string) {
  const speakerIdentificationEnabled = speakerIdentificationConfigured({
    transcriptionOnly: transcriptionOnly(),
    pyannoteConfigured: Boolean(process.env.PYANNOTE_API_KEY),
    audioOriginConfigured: Boolean(deploymentVoiceOrigin(process.env.APP_ORIGIN, process.env.VERCEL_URL)),
  });
  await getDb()`INSERT INTO worker_heartbeats (id, last_seen, transcription_only, local_gpu, speaker_identification_enabled)
    VALUES (${id}, ${nowMs()}, ${transcriptionOnly()}, ${localGpuEnabled()}, ${speakerIdentificationEnabled})
    ON CONFLICT (id) DO UPDATE SET last_seen = EXCLUDED.last_seen,
      transcription_only = EXCLUDED.transcription_only, local_gpu = EXCLUDED.local_gpu,
      speaker_identification_enabled = EXCLUDED.speaker_identification_enabled`;
}

async function claimAudioJob(): Promise<Job | null> {
  const sql = getDb();
  const now = nowMs();
  return await sql.begin(async (tx) => {
    const rows = await tx`
      SELECT j.id::text AS id, j.patient_id::text AS patient_id, j.chunk_id::text AS chunk_id,
        j.stage, j.attempts, j.pyannote_job_id, j.transcript_payload, j.diarization_payload,
        c.id::text AS conversation_id, c.local_date, p.timezone
      FROM processing_jobs j
      JOIN audio_chunks a ON a.id = j.chunk_id
      JOIN recording_sessions s ON s.id = a.session_id AND s.consent_policy_version = ${RECORDING_CONSENT_POLICY_VERSION}
      JOIN conversations c ON c.chunk_id = a.id AND c.deleted_at IS NULL
      JOIN patients p ON p.id = j.patient_id
      WHERE j.state IN ('queued', 'processing') AND j.next_attempt_at <= ${now}
        AND (j.state = 'queued' OR j.lease_expires_at IS NULL OR j.lease_expires_at <= ${now})
        AND a.audio IS NOT NULL AND a.deleted_at IS NULL AND a.expires_at > ${now}
      ORDER BY j.created_at LIMIT 1 FOR UPDATE OF j SKIP LOCKED
    `;
    const row = rows[0];
    if (!row) return null;
    await tx`UPDATE processing_jobs SET state = 'processing', lease_expires_at = ${now + LEASE_MS}, updated_at = ${now}
      WHERE id = ${String(row.id)}::uuid`;
    if (row.stage !== "extract") {
      await tx`UPDATE audio_chunks SET state = 'processing' WHERE id = ${String(row.chunk_id)}::uuid AND deleted_at IS NULL`;
      await tx`UPDATE conversations SET state = 'processing' WHERE id = ${String(row.conversation_id)}::uuid AND deleted_at IS NULL`;
    }
    return {
      id: String(row.id), patientId: String(row.patient_id), chunkId: String(row.chunk_id),
      conversationId: String(row.conversation_id), localDate: String(row.local_date), timezone: String(row.timezone),
      stage: String(row.stage) as Job["stage"], attempts: Number(row.attempts),
      pyannoteJobId: row.pyannote_job_id ? String(row.pyannote_job_id) : null,
      transcriptPayload: row.transcript_payload, diarizationPayload: row.diarization_payload,
    };
  });
}

async function readAudio(chunkId: string) {
  const rows = await getDb()`SELECT audio, mime_type, captured_at, ended_at FROM audio_chunks
    WHERE id = ${chunkId}::uuid AND audio IS NOT NULL AND deleted_at IS NULL AND expires_at > ${nowMs()} LIMIT 1`;
  const row = rows[0];
  if (!row) throw new ProcessingError("audio_unavailable", false);
  return { audio: Buffer.from(row.audio as Buffer), mimeType: String(row.mime_type), duration: Math.max(0.1, (Number(row.ended_at) - Number(row.captured_at)) / 1000) };
}

async function currentConsentedVoiceprints(patientId: string) {
  const rows = await getDb()`
    SELECT p.id::text AS person_id, p.name, f.voiceprint
    FROM people p
    JOIN consents c ON c.patient_id = p.patient_id AND c.subject = p.subject
      AND c.purpose = 'speaker_identification' AND c.revoked_at IS NULL
    JOIN family_profiles f ON f.subject = p.subject AND f.voice_state = 'enrolled'
    WHERE p.patient_id = ${patientId}::uuid AND p.subject IS NOT NULL AND p.enrollment = 'enrolled'
      AND f.voiceprint IS NOT NULL LIMIT 50
  `;
  return rows.map((row) => ({ personId: String(row.person_id), name: String(row.name), voiceprint: String(row.voiceprint) }));
}

async function createPyannoteJob(job: Job) {
  await assertJobActive(job);
  const key = process.env.PYANNOTE_API_KEY;
  const appOrigin = deploymentVoiceOrigin(process.env.APP_ORIGIN, process.env.VERCEL_URL);
  if (!key || !appOrigin) throw new ProcessingError("pyannote_not_configured", false);
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = nowMs() + AUDIO_TOKEN_LIFETIME_MS;
  const rows = await getDb()`UPDATE audio_chunks SET processing_token_hash = ${tokenHash}, processing_token_expires_at = ${expiresAt}
    WHERE id = ${job.chunkId}::uuid AND audio IS NOT NULL AND deleted_at IS NULL RETURNING id`;
  if (!rows.length) throw new ProcessingError("audio_unavailable", false);
  const url = new URL(`/api/backend/worker-audio/${token}`, appOrigin).toString();
  const voiceprints = await currentConsentedVoiceprints(job.patientId);
  try {
    return await submitPyannoteJob({
      apiKey: key,
      audioUrl: url,
      voiceprints: voiceprints.map(({ personId, voiceprint }) => ({ personId, voiceprint })),
    });
  } catch (error) {
    await getDb()`UPDATE audio_chunks SET processing_token_hash = NULL, processing_token_expires_at = NULL WHERE id = ${job.chunkId}::uuid`;
    throw error;
  }
}

async function runDiarization(job: Job) {
  if (!job.pyannoteJobId) {
    const pyannoteJobId = await createPyannoteJob(job);
    await persistStage(job, { stage: "diarize", pyannoteJobId, nextAttemptAt: nowMs() + PYANNOTE_POLL_MS });
    return;
  }
  await assertJobActive(job);
  const output = await pollPyannoteProviderJob({ apiKey: process.env.PYANNOTE_API_KEY, jobId: job.pyannoteJobId });
  if (!output) {
    await persistStage(job, { stage: "diarize", nextAttemptAt: nowMs() + PYANNOTE_POLL_MS });
    return;
  }
  await getDb()`UPDATE audio_chunks SET processing_token_hash = NULL, processing_token_expires_at = NULL WHERE id = ${job.chunkId}::uuid`;
  await persistStage(job, { stage: "merge", diarizationPayload: output, pyannoteJobId: null });
}

async function persistStage(job: Job, patch: { stage: Job["stage"]; transcriptPayload?: unknown; diarizationPayload?: unknown; pyannoteJobId?: string | null; nextAttemptAt?: number }) {
  const now = nowMs();
  const transcriptJson = patch.transcriptPayload === undefined ? null : JSON.stringify(patch.transcriptPayload);
  const diarizationJson = patch.diarizationPayload === undefined ? null : JSON.stringify(patch.diarizationPayload);
  await getDb()`UPDATE processing_jobs SET state = 'queued', stage = ${patch.stage},
    transcript_payload = COALESCE(${transcriptJson}::jsonb, transcript_payload),
    diarization_payload = COALESCE(${diarizationJson}::jsonb, diarization_payload),
    pyannote_job_id = ${patch.pyannoteJobId === undefined ? job.pyannoteJobId : patch.pyannoteJobId},
    attempts = 0, lease_expires_at = NULL, next_attempt_at = ${patch.nextAttemptAt ?? now}, error = NULL, updated_at = ${now}
    WHERE id = ${job.id}::uuid AND state = 'processing'`;
}

async function parseDiarization(output: Record<string, unknown>) {
  const diarization = Array.isArray(output.diarization) ? output.diarization.flatMap((item): DiarizationSegment[] => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const start = Number(row.start), end = Number(row.end), speaker = row.speaker;
    return typeof speaker === "string" && Number.isFinite(start) && Number.isFinite(end) && end > start ? [{ start, end, speaker }] : [];
  }) : [];
  const identities = Array.isArray(output.identification) ? output.identification.flatMap((item): SpeakerIdentity[] => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const start = Number(row.start), end = Number(row.end), diarizationSpeaker = row.diarizationSpeaker, match = row.match;
    return typeof diarizationSpeaker === "string" && Number.isFinite(start) && Number.isFinite(end) && end > start
      ? [{ start, end, diarizationSpeaker, match: typeof match === "string" ? match : null }]
      : [];
  }) : [];
  const confidences = Array.isArray(output.voiceprints) ? output.voiceprints.flatMap((item): SpeakerConfidence[] => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.speaker !== "string" || !row.confidence || typeof row.confidence !== "object") return [];
    return [{ speaker: row.speaker, confidence: row.confidence as Record<string, number> }];
  }) : [];
  return { diarization, identities, confidences };
}

async function mergeTranscript(job: Job) {
  const transcript = parsePayload<TimedTranscriptSegment[]>(job.transcriptPayload);
  const output = parsePayload<Record<string, unknown>>(job.diarizationPayload);
  const { diarization, identities, confidences } = await parseDiarization(output);
  const voicesRows = await currentConsentedVoiceprints(job.patientId);
  const voices: VoiceMatch[] = voicesRows.map(({ personId, name }) => ({ personId, name }));
  const merged = mergeTranscriptAndSpeakers({ transcript, diarization, identities, confidences, voices, threshold: 70 });
  if (!merged.length) throw new ProcessingError("empty_merged_transcript", false);
  const transcriptTitle = conversationTitleFromTurns(merged);
  const sql = getDb();
  await sql.begin(async (tx) => {
    const activeRows = await tx`SELECT j.id FROM processing_jobs j
      JOIN conversations c ON c.chunk_id = j.chunk_id
      WHERE j.id = ${job.id}::uuid AND j.state = 'processing' AND c.deleted_at IS NULL
      FOR UPDATE OF j, c`;
    if (!activeRows.length) throw new ProcessingError("job_cancelled", false);
    for (const [segmentIndex, turn] of merged.entries()) {
      await tx`INSERT INTO transcript_turns (id, patient_id, conversation_id, segment_index, speaker, person_id,
        start_seconds, end_seconds, speaker_confidence, text, uncertain)
        VALUES (${crypto.randomUUID()}::uuid, ${job.patientId}::uuid, ${job.conversationId}::uuid, ${segmentIndex},
          ${turn.speaker}, ${turn.personId ?? null}::uuid, ${turn.start}, ${turn.end}, ${turn.confidence ?? null}, ${turn.text}, ${turn.uncertain ?? true})
        ON CONFLICT (conversation_id, segment_index) DO UPDATE SET speaker = EXCLUDED.speaker, person_id = EXCLUDED.person_id,
          start_seconds = EXCLUDED.start_seconds, end_seconds = EXCLUDED.end_seconds, speaker_confidence = EXCLUDED.speaker_confidence,
          text = EXCLUDED.text, uncertain = EXCLUDED.uncertain`;
    }
    const peopleRows = await tx`SELECT COALESCE(array_agg(DISTINCT person_id) FILTER (WHERE person_id IS NOT NULL), '{}'::uuid[]) AS people
      FROM transcript_turns WHERE conversation_id = ${job.conversationId}::uuid`;
    const people = peopleRows[0].people as string[];
    await tx`UPDATE conversations SET state = 'ready', people = ${people}::uuid[],
      title = CASE WHEN title IN ('New recording', 'Processing conversation') THEN COALESCE(${transcriptTitle ?? null}, title) ELSE title END,
      summary = 'Transcript ready. Open to review the conversation.'
      WHERE id = ${job.conversationId}::uuid AND deleted_at IS NULL`;
    await tx`UPDATE daily_summaries SET state = 'queued', summary = NULL, source_turn_ids = '{}'::uuid[], coverage = 'partial',
      attempts = 0, lease_expires_at = NULL, next_attempt_at = ${nowMs()}, error = NULL, updated_at = ${nowMs()}
      WHERE patient_id = ${job.patientId}::uuid AND local_date = ${job.localDate} AND state IN ('ready', 'failed')`;
    await tx`UPDATE audio_chunks SET state = 'ready', processing_token_hash = NULL, processing_token_expires_at = NULL
      WHERE id = ${job.chunkId}::uuid AND deleted_at IS NULL`;
    await tx`UPDATE processing_jobs SET state = 'queued', stage = 'extract', attempts = 0,
      lease_expires_at = NULL, next_attempt_at = ${nowMs()}, error = NULL, updated_at = ${nowMs()}
      WHERE id = ${job.id}::uuid AND state = 'processing'`;
  });
}

function stableMemoryKey(conversationId: string, memory: { kind: string; turnIds: string[] }) {
  return createHash("sha256").update(`${conversationId}:${memory.kind}:${[...memory.turnIds].sort().join(",")}`).digest("hex");
}

async function extractMemories(job: Job) {
  await assertJobActive(job);
  const sql = getDb();
  const rows = await sql`SELECT id::text, speaker, person_id::text, start_seconds, end_seconds, text, uncertain
    FROM transcript_turns WHERE conversation_id = ${job.conversationId}::uuid
    ORDER BY segment_index LIMIT 500`;
  const turns: TranscriptTurn[] = rows.map((row) => ({
    id: String(row.id), speaker: String(row.speaker), personId: row.person_id ? String(row.person_id) : undefined,
    start: Number(row.start_seconds), end: Number(row.end_seconds), text: String(row.text), uncertain: Boolean(row.uncertain),
  }));
  if (!turns.length) throw new ProcessingError("no_transcript_turns", false);
  let memories: ExtractedMemoryCandidate[];
  if (!backboardProcessingEnabled()) {
    memories = [];
  } else {
    const raw = await extractMemoryCandidates(turns, job.localDate);
    try { memories = validateMemoryCandidates(raw, turns, job.localDate); }
    catch (error) {
      if (!invalidStructuredOutput(error)) throw error;
      // A non-JSON model reply cannot safely become a memory; preserve the transcript and finish without candidates.
      memories = [];
      console.error("Hale memory extraction returned no structured candidates", { jobId: job.id, errorCode: "invalid_structured_output" });
    }
  }
  await sql.begin(async (tx) => {
    const activeRows = await tx`SELECT j.id FROM processing_jobs j
      JOIN conversations c ON c.chunk_id = j.chunk_id
      WHERE j.id = ${job.id}::uuid AND j.state = 'processing' AND c.deleted_at IS NULL
      FOR UPDATE OF j, c`;
    if (!activeRows.length) throw new ProcessingError("job_cancelled", false);
    for (const memory of memories) {
      const key = stableMemoryKey(job.conversationId, memory);
      await tx`INSERT INTO memories (id, idempotency_key, patient_id, conversation_id, kind, title, text, local_date,
        planned_for, occurred_at, turn_ids, people)
        VALUES (${crypto.randomUUID()}::uuid, ${key}, ${job.patientId}::uuid, ${job.conversationId}::uuid,
          ${memory.kind}, ${memory.title}, ${memory.text}, ${memory.localDate}, ${memory.plannedFor ?? null},
          ${memory.occurredAt ?? null}, ${memory.turnIds}::uuid[], ${memory.people}::uuid[])
        ON CONFLICT (idempotency_key) DO UPDATE SET title = EXCLUDED.title, text = EXCLUDED.text,
          local_date = EXCLUDED.local_date, planned_for = EXCLUDED.planned_for, occurred_at = EXCLUDED.occurred_at,
          turn_ids = EXCLUDED.turn_ids, people = EXCLUDED.people`;
    }
    const summary = memories.slice(0, 3).map((memory) => memory.text).join(" ") || "Transcript ready. Review the original conversation for details.";
    await tx`UPDATE conversations SET summary = ${summary} WHERE id = ${job.conversationId}::uuid AND deleted_at IS NULL`;
    await tx`UPDATE processing_jobs SET state = 'ready', attempts = 0, lease_expires_at = NULL,
      next_attempt_at = 0, error = NULL, updated_at = ${nowMs()} WHERE id = ${job.id}::uuid AND state = 'processing'`;
  });
}

async function failAudioJob(job: Job, error: unknown) {
  if (error instanceof ProcessingError && error.code === "job_cancelled") return;
  const sql = getDb();
  const retryable = !(error instanceof ProcessingError) || error.retryable;
  const outcome = processingFailureOutcome({ attempts: job.attempts, retryable, now: nowMs(), maxAttempts: MAX_PROCESSING_ATTEMPTS });
  const errorCode = error instanceof ProcessingError ? error.code : "processing_unavailable";
  await sql.begin(async (tx) => {
    await tx`UPDATE processing_jobs SET state = ${outcome.state}, attempts = ${outcome.attempts},
      lease_expires_at = NULL, next_attempt_at = ${outcome.nextAttemptAt}, error = ${errorCode}, updated_at = ${nowMs()}
      WHERE id = ${job.id}::uuid AND state = 'processing'`;
    if (job.stage !== "extract" && outcome.state === "failed") {
      await tx`UPDATE audio_chunks SET state = 'failed', processing_token_hash = NULL, processing_token_expires_at = NULL WHERE id = ${job.chunkId}::uuid`;
      await tx`UPDATE conversations SET state = 'failed',
        title = CASE WHEN title IN ('New recording', 'Processing conversation') THEN 'Transcript unavailable' ELSE title END,
        summary = 'Transcript processing did not finish. Start a new recording to try again.'
        WHERE id = ${job.conversationId}::uuid AND deleted_at IS NULL`;
    }
  });
  console.error("Hale audio processing job", { jobId: job.id, stage: job.stage, errorCode, failed: outcome.state === "failed" });
}

export async function processNextAudioJob() {
  const job = await claimAudioJob();
  if (!job) return false;
  try {
    if (job.stage === "transcribe") {
      await assertJobActive(job);
      const audio = await readAudio(job.chunkId);
      await assertJobActive(job);
      const segments = localGpuEnabled()
        ? await transcribeLocalGpuAudio({ audio: audio.audio, mimeType: audio.mimeType, duration: audio.duration })
        : await transcribeAudio({
          audio: audio.audio, mimeType: audio.mimeType, duration: audio.duration,
          apiKey: process.env.OPENROUTER_API_KEY, appOrigin: process.env.APP_ORIGIN,
        });
      if (transcriptionOnly()) {
        await persistStage(job, {
          stage: "merge", transcriptPayload: segments,
          diarizationPayload: { diarization: [], identification: [], voiceprints: [] }, pyannoteJobId: null,
        });
      } else {
        await persistStage(job, { stage: "diarize", transcriptPayload: segments, pyannoteJobId: null });
      }
    } else if (job.stage === "diarize") {
      await runDiarization(job);
    } else if (job.stage === "merge") {
      await mergeTranscript(job);
    } else if (job.stage === "extract") {
      await extractMemories(job);
    }
  } catch (error) {
    await failAudioJob(job, error);
  }
  return true;
}

async function queueMissingDailySummaries() {
  const sql = getDb();
  const patients = await sql`SELECT id::text, timezone FROM patients ORDER BY created_at LIMIT 500`;
  const now = nowMs();
  for (const patient of patients) {
    const today = localDate(new Date(now), String(patient.timezone));
    const conversationDays = await sql`SELECT DISTINCT local_date FROM conversations
      WHERE patient_id = ${String(patient.id)}::uuid AND local_date < ${today} AND deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM daily_summaries d WHERE d.patient_id = conversations.patient_id AND d.local_date = conversations.local_date)
      ORDER BY local_date DESC LIMIT 20`;
    for (const day of conversationDays) {
      await sql`INSERT INTO daily_summaries (id, patient_id, local_date, coverage, state, created_at, updated_at)
        VALUES (${crypto.randomUUID()}::uuid, ${String(patient.id)}::uuid, ${String(day.local_date)}, 'partial', 'queued', ${now}, ${now})
        ON CONFLICT (patient_id, local_date) DO NOTHING`;
    }
  }
}

async function claimDailySummary() {
  const sql = getDb();
  const now = nowMs();
  return await sql.begin(async (tx) => {
    const rows = await tx`SELECT d.id::text, d.patient_id::text, d.local_date, d.attempts, p.timezone
      FROM daily_summaries d JOIN patients p ON p.id = d.patient_id
      WHERE d.state IN ('queued', 'processing') AND d.next_attempt_at <= ${now}
        AND (d.state = 'queued' OR d.lease_expires_at IS NULL OR d.lease_expires_at <= ${now})
      ORDER BY d.local_date LIMIT 1 FOR UPDATE OF d SKIP LOCKED`;
    const row = rows[0];
    if (!row) return null;
    await tx`UPDATE daily_summaries SET state = 'processing', lease_expires_at = ${now + LEASE_MS}, updated_at = ${now}
      WHERE id = ${String(row.id)}::uuid`;
    return { id: String(row.id), patientId: String(row.patient_id), localDate: String(row.local_date), timezone: String(row.timezone), attempts: Number(row.attempts) };
  });
}

async function runDailySummary() {
  const summaryJob = await claimDailySummary();
  if (!summaryJob) return false;
  const sql = getDb();
  try {
    const activity = await sql`SELECT COUNT(DISTINCT c.id)::int AS conversations,
        COUNT(DISTINCT c.id) FILTER (WHERE j.state IN ('queued', 'processing'))::int AS active,
        COUNT(DISTINCT c.id) FILTER (WHERE j.state = 'failed')::int AS failed
      FROM conversations c
      LEFT JOIN processing_jobs j ON j.chunk_id = c.chunk_id
      WHERE c.patient_id = ${summaryJob.patientId}::uuid AND c.local_date = ${summaryJob.localDate} AND c.deleted_at IS NULL`;
    if (!Number(activity[0].conversations)) {
      await sql`UPDATE daily_summaries SET state = 'ready', summary = NULL, coverage = 'partial', source_turn_ids = '{}',
        lease_expires_at = NULL, updated_at = ${nowMs()} WHERE id = ${summaryJob.id}::uuid`;
      return true;
    }
    if (Number(activity[0].active) > 0) {
      await sql`UPDATE daily_summaries SET state = 'queued', lease_expires_at = NULL,
        next_attempt_at = ${nowMs() + 60_000}, updated_at = ${nowMs()} WHERE id = ${summaryJob.id}::uuid`;
      return true;
    }
    const turnsRows = await sql`SELECT t.id::text, t.speaker, t.person_id::text, t.start_seconds, t.end_seconds, t.text, t.uncertain
      FROM transcript_turns t JOIN conversations c ON c.id = t.conversation_id
      WHERE c.patient_id = ${summaryJob.patientId}::uuid AND c.local_date = ${summaryJob.localDate} AND c.deleted_at IS NULL
      ORDER BY c.started_at, t.start_seconds LIMIT 1000`;
    const turns: TranscriptTurn[] = turnsRows.map((row) => ({ id: String(row.id), speaker: String(row.speaker), personId: row.person_id ? String(row.person_id) : undefined, start: Number(row.start_seconds), end: Number(row.end_seconds), text: String(row.text), uncertain: Boolean(row.uncertain) }));
    if (!turns.length) {
      await sql`UPDATE daily_summaries SET state = 'ready', summary = NULL, coverage = 'partial', source_turn_ids = '{}',
        lease_expires_at = NULL, updated_at = ${nowMs()} WHERE id = ${summaryJob.id}::uuid`;
      return true;
    }
    const coverage = Number(activity[0].failed) > 0 || turnsRows.length >= 1000 ? "partial" : "complete";
    if (!backboardProcessingEnabled()) {
      await sql`UPDATE daily_summaries SET state = 'ready', summary = NULL, coverage = 'partial', source_turn_ids = '{}',
        attempts = 0, lease_expires_at = NULL, next_attempt_at = 0, error = NULL, updated_at = ${nowMs()}
        WHERE id = ${summaryJob.id}::uuid`;
      return true;
    }
    const summaryPayload = await summarizePatientDay(turns, summaryJob.localDate, coverage);
    let validated: ReturnType<typeof validateDailySummary>;
    try { validated = validateDailySummary(summaryPayload, turns.map((turn) => turn.id)); }
    catch (error) {
      if (!invalidStructuredOutput(error)) throw error;
      await sql`UPDATE daily_summaries SET state = 'ready', summary = NULL, coverage = 'partial', source_turn_ids = '{}',
        attempts = 0, lease_expires_at = NULL, next_attempt_at = 0, error = NULL, updated_at = ${nowMs()}
        WHERE id = ${summaryJob.id}::uuid`;
      return true;
    }
    await sql`UPDATE daily_summaries SET state = 'ready', summary = ${validated.summary}, coverage = ${coverage},
      source_turn_ids = ${validated.turnIds}::uuid[], attempts = 0, lease_expires_at = NULL, next_attempt_at = 0, error = NULL,
      updated_at = ${nowMs()} WHERE id = ${summaryJob.id}::uuid`;
  } catch (error) {
    const retryable = !(error instanceof ProcessingError) || error.retryable;
    const outcome = processingFailureOutcome({ attempts: summaryJob.attempts, retryable, now: nowMs(), maxAttempts: MAX_PROCESSING_ATTEMPTS });
    await sql`UPDATE daily_summaries SET state = ${outcome.state}, attempts = ${outcome.attempts}, lease_expires_at = NULL,
      next_attempt_at = ${outcome.nextAttemptAt},
      error = ${error instanceof ProcessingError ? error.code : "summary_unavailable"}, updated_at = ${nowMs()}
      WHERE id = ${summaryJob.id}::uuid`;
    console.error("Hale daily summary job", { jobId: summaryJob.id, patientId: summaryJob.patientId, errorCode: error instanceof ProcessingError ? error.code : "summary_unavailable", failed: outcome.state === "failed" });
  }
  return true;
}

export async function runWorker(signal?: AbortSignal) {
  if (!process.env.TIGERDATA_DATABASE_URL) throw new Error("TIGERDATA_DATABASE_URL is required for the worker.");
  if (!localGpuEnabled() && !process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is required for hosted transcription. Set LOCAL_WHISPER_GPU=true to transcribe with the local GPU runtime.");
  if (!transcriptionOnly() && !process.env.PYANNOTE_API_KEY) throw new Error("PYANNOTE_API_KEY is required for diarization. Set TRANSCRIPTION_ONLY=true to produce transcripts with unnamed speakers instead.");
  if (!transcriptionOnly() && !deploymentVoiceOrigin(process.env.APP_ORIGIN, process.env.VERCEL_URL)) throw new Error("Set APP_ORIGIN to the public HTTPS web-app origin so pyannote can fetch recording audio.");
  if (process.env.BACKBOARD_PROCESSING_ENABLED === "true" && !process.env.BACKBOARD_API_KEY) throw new Error("BACKBOARD_API_KEY is required when BACKBOARD_PROCESSING_ENABLED=true.");
  const workerId = crypto.randomUUID();
  await updateWorkerHeartbeat(workerId);
  const heartbeat = setInterval(() => { void updateWorkerHeartbeat(workerId).catch(() => {}); }, 10_000);
  const reminderTimer = setInterval(() => {
    void dispatchDueCareReminders().catch(() => console.error("Hale reminder scheduler failed"));
  }, 30_000);
  void dispatchDueCareReminders().catch(() => console.error("Hale reminder scheduler failed"));
  let lastSummaryQueue = 0;
  let lastAudioCleanup = 0;
  try {
    while (!signal?.aborted) {
      try {
        if (nowMs() - lastSummaryQueue > 60_000) {
          await queueMissingDailySummaries();
          lastSummaryQueue = nowMs();
        }
        if (nowMs() - lastAudioCleanup > 60_000) {
          await failAudioUnavailable();
          lastAudioCleanup = nowMs();
        }
        const didAudio = await processNextAudioJob();
        const didSummary = await runDailySummary();
        if (!didAudio && !didSummary) await new Promise((resolve) => setTimeout(resolve, 2_000));
      } catch (error) {
        console.error("Hale worker loop failed", { errorCode: error instanceof ProcessingError ? error.code : "worker_loop_unavailable" });
        await new Promise((resolve) => setTimeout(resolve, 5_000));
      }
    }
  } finally {
    clearInterval(heartbeat);
    clearInterval(reminderTimer);
    await getDb()`DELETE FROM worker_heartbeats WHERE id = ${workerId}`.catch(() => {});
  }
}
