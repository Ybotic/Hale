-- Hale's TigerData schema. TigerData is PostgreSQL-compatible; run with:
-- psql "$TIGERDATA_DATABASE_URL" -f db/schema.sql

CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL,
  created_by TEXT NOT NULL,
  audio_retention_days INTEGER NOT NULL DEFAULT 7 CHECK (audio_retention_days > 0),
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
  id UUID PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('patient', 'family')),
  capabilities TEXT[] NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (patient_id, subject)
);
CREATE INDEX IF NOT EXISTS memberships_subject_idx ON memberships(subject, active);

CREATE TABLE IF NOT EXISTS consents (
  id UUID PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  purpose TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  granted_at BIGINT NOT NULL,
  revoked_at BIGINT,
  UNIQUE (patient_id, subject, purpose)
);

CREATE TABLE IF NOT EXISTS people (
  id UUID PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  subject TEXT,
  name TEXT NOT NULL,
  relationship TEXT NOT NULL,
  enrollment TEXT NOT NULL CHECK (enrollment IN ('not_enrolled', 'enrolled', 'revoked'))
);
ALTER TABLE people ADD COLUMN IF NOT EXISTS subject TEXT;
CREATE INDEX IF NOT EXISTS people_patient_idx ON people(patient_id);
CREATE UNIQUE INDEX IF NOT EXISTS people_patient_subject_idx ON people(patient_id, subject) WHERE subject IS NOT NULL;

CREATE TABLE IF NOT EXISTS family_profiles (
  id UUID PRIMARY KEY,
  subject TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  relationship TEXT NOT NULL,
  voice_state TEXT NOT NULL DEFAULT 'not_enrolled'
    CHECK (voice_state IN ('not_enrolled', 'skipped', 'queued', 'processing', 'enrolled', 'failed', 'revoked')),
  consent_at BIGINT,
  policy_version TEXT,
  revoked_at BIGINT,
  request_id UUID,
  sample_audio BYTEA,
  sample_token_hash TEXT,
  sample_expires_at BIGINT,
  job_id TEXT,
  voiceprint TEXT,
  model TEXT,
  message TEXT,
  updated_at BIGINT NOT NULL,
  enrollment_version INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS family_profiles_voice_state_idx ON family_profiles(voice_state, updated_at);

CREATE TABLE IF NOT EXISTS recording_sessions (
  id UUID PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  started_at BIGINT NOT NULL,
  ended_at BIGINT,
  timezone TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('recording', 'paused', 'interrupted', 'stopped')),
  consent_confirmed_at BIGINT,
  consent_policy_version TEXT NOT NULL DEFAULT 'legacy',
  synthetic BOOLEAN NOT NULL DEFAULT FALSE
);
ALTER TABLE recording_sessions ADD COLUMN IF NOT EXISTS consent_policy_version TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE recording_sessions ALTER COLUMN consent_confirmed_at DROP NOT NULL;
ALTER TABLE recording_sessions ADD COLUMN IF NOT EXISTS synthetic BOOLEAN NOT NULL DEFAULT FALSE;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'recording_sessions_consent_timestamp_check'
      AND conrelid = 'recording_sessions'::regclass
  ) THEN
    ALTER TABLE recording_sessions ADD CONSTRAINT recording_sessions_consent_timestamp_check
      CHECK (synthetic OR consent_confirmed_at IS NOT NULL);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS recording_sessions_patient_idx ON recording_sessions(patient_id, started_at DESC);

CREATE TABLE IF NOT EXISTS audio_chunks (
  id UUID PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES recording_sessions(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence >= 0),
  audio BYTEA,
  captured_at BIGINT NOT NULL,
  ended_at BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('queued', 'processing', 'ready', 'failed')),
  expires_at BIGINT NOT NULL,
  deleted_at BIGINT,
  processing_token_hash TEXT,
  processing_token_expires_at BIGINT,
  UNIQUE (session_id, sequence)
);
ALTER TABLE audio_chunks ADD COLUMN IF NOT EXISTS processing_token_hash TEXT;
ALTER TABLE audio_chunks ADD COLUMN IF NOT EXISTS processing_token_expires_at BIGINT;
CREATE INDEX IF NOT EXISTS audio_chunks_expiry_idx ON audio_chunks(expires_at) WHERE audio IS NOT NULL;
CREATE INDEX IF NOT EXISTS audio_chunks_processing_token_idx ON audio_chunks(processing_token_hash) WHERE processing_token_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS processing_jobs (
  id UUID PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  chunk_id UUID NOT NULL REFERENCES audio_chunks(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('queued', 'processing', 'ready', 'failed')),
  stage TEXT NOT NULL DEFAULT 'transcribe' CHECK (stage IN ('transcribe', 'diarize', 'merge', 'extract')),
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_expires_at BIGINT,
  next_attempt_at BIGINT NOT NULL DEFAULT 0,
  pyannote_job_id TEXT,
  transcript_payload JSONB,
  diarization_payload JSONB,
  error TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL DEFAULT 0
);
ALTER TABLE processing_jobs ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'transcribe';
ALTER TABLE processing_jobs ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE processing_jobs ADD COLUMN IF NOT EXISTS lease_expires_at BIGINT;
ALTER TABLE processing_jobs ADD COLUMN IF NOT EXISTS next_attempt_at BIGINT NOT NULL DEFAULT 0;
ALTER TABLE processing_jobs ADD COLUMN IF NOT EXISTS pyannote_job_id TEXT;
ALTER TABLE processing_jobs ADD COLUMN IF NOT EXISTS transcript_payload JSONB;
ALTER TABLE processing_jobs ADD COLUMN IF NOT EXISTS diarization_payload JSONB;
ALTER TABLE processing_jobs ADD COLUMN IF NOT EXISTS updated_at BIGINT NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS processing_jobs_chunk_idx ON processing_jobs(chunk_id);
CREATE INDEX IF NOT EXISTS processing_jobs_queue_idx ON processing_jobs(state, next_attempt_at, created_at);

CREATE TABLE IF NOT EXISTS worker_heartbeats (
  id TEXT PRIMARY KEY,
  last_seen BIGINT NOT NULL,
  transcription_only BOOLEAN NOT NULL DEFAULT FALSE,
  local_gpu BOOLEAN NOT NULL DEFAULT FALSE,
  speaker_identification_enabled BOOLEAN NOT NULL DEFAULT FALSE
);
ALTER TABLE worker_heartbeats ADD COLUMN IF NOT EXISTS local_gpu BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE worker_heartbeats ADD COLUMN IF NOT EXISTS speaker_identification_enabled BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS worker_heartbeats_last_seen_idx ON worker_heartbeats(last_seen DESC);

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  chunk_id UUID NOT NULL REFERENCES audio_chunks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  started_at BIGINT NOT NULL,
  duration DOUBLE PRECISION NOT NULL,
  local_date TEXT NOT NULL,
  people UUID[] NOT NULL DEFAULT '{}',
  state TEXT NOT NULL CHECK (state IN ('queued', 'processing', 'ready', 'failed')),
  synthetic BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at BIGINT
);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS synthetic BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS conversations_patient_date_idx ON conversations(patient_id, local_date, started_at DESC);
CREATE INDEX IF NOT EXISTS conversations_chunk_idx ON conversations(chunk_id);

CREATE TABLE IF NOT EXISTS transcript_turns (
  id UUID PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  segment_index INTEGER NOT NULL DEFAULT 0,
  speaker TEXT NOT NULL,
  person_id UUID REFERENCES people(id) ON DELETE SET NULL,
  start_seconds DOUBLE PRECISION NOT NULL,
  end_seconds DOUBLE PRECISION NOT NULL,
  speaker_confidence DOUBLE PRECISION,
  text TEXT NOT NULL,
  uncertain BOOLEAN NOT NULL DEFAULT FALSE
);
ALTER TABLE transcript_turns ADD COLUMN IF NOT EXISTS segment_index INTEGER;
ALTER TABLE transcript_turns ADD COLUMN IF NOT EXISTS speaker_confidence DOUBLE PRECISION;
WITH ranked_turns AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY start_seconds, id) - 1 AS segment_index
  FROM transcript_turns WHERE segment_index IS NULL
)
UPDATE transcript_turns SET segment_index = ranked_turns.segment_index
FROM ranked_turns WHERE transcript_turns.id = ranked_turns.id;
ALTER TABLE transcript_turns ALTER COLUMN segment_index SET DEFAULT 0;
ALTER TABLE transcript_turns ALTER COLUMN segment_index SET NOT NULL;
CREATE INDEX IF NOT EXISTS transcript_turns_conversation_idx ON transcript_turns(conversation_id, start_seconds);
CREATE UNIQUE INDEX IF NOT EXISTS transcript_turns_conversation_segment_idx ON transcript_turns(conversation_id, segment_index);
CREATE INDEX IF NOT EXISTS transcript_turns_search_idx ON transcript_turns USING GIN (to_tsvector('simple', text));

CREATE TABLE IF NOT EXISTS memories (
  id UUID PRIMARY KEY,
  idempotency_key TEXT UNIQUE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('reported_activity', 'plan', 'personal_fact', 'conversation_topic')),
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  local_date TEXT NOT NULL,
  planned_for TEXT,
  occurred_at TEXT,
  turn_ids UUID[] NOT NULL DEFAULT '{}',
  people UUID[] NOT NULL DEFAULT '{}'
);
ALTER TABLE memories ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS memories_idempotency_key_idx ON memories(idempotency_key);
CREATE INDEX IF NOT EXISTS memories_patient_date_idx ON memories(patient_id, local_date DESC);
CREATE INDEX IF NOT EXISTS memories_conversation_idx ON memories(conversation_id);
CREATE INDEX IF NOT EXISTS memories_search_idx ON memories USING GIN (to_tsvector('simple', text));

CREATE TABLE IF NOT EXISTS daily_summaries (
  id UUID PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  local_date TEXT NOT NULL,
  summary TEXT,
  source_turn_ids UUID[] NOT NULL DEFAULT '{}',
  coverage TEXT NOT NULL DEFAULT 'partial' CHECK (coverage IN ('complete', 'partial')),
  state TEXT NOT NULL CHECK (state IN ('queued', 'processing', 'ready', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_expires_at BIGINT,
  next_attempt_at BIGINT NOT NULL DEFAULT 0,
  error TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE (patient_id, local_date)
);
CREATE INDEX IF NOT EXISTS daily_summaries_queue_idx ON daily_summaries(state, next_attempt_at, local_date);
CREATE INDEX IF NOT EXISTS daily_summaries_patient_date_idx ON daily_summaries(patient_id, local_date DESC);

CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  operation TEXT NOT NULL,
  target TEXT NOT NULL,
  timestamp BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_events_patient_idx ON audit_events(patient_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS family_invitations (
  id UUID PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  capabilities TEXT[] NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'revoked', 'expired', 'failed')),
  clerk_invitation_id TEXT UNIQUE,
  created_by TEXT NOT NULL,
  accepted_by TEXT,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  accepted_at BIGINT,
  revoked_at BIGINT
);
CREATE INDEX IF NOT EXISTS family_invitations_patient_status_idx ON family_invitations(patient_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS family_invitations_pending_email_idx ON family_invitations(patient_id, email) WHERE status = 'pending';

-- Each Backboard assistant is scoped to one signed-in member and patient space.
CREATE TABLE IF NOT EXISTS backboard_contexts (
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  assistant_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (patient_id, subject)
);

CREATE TABLE IF NOT EXISTS nessie_connections (
  id UUID PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  account_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  nickname TEXT NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'Unknown',
  linked_at BIGINT NOT NULL,
  UNIQUE (patient_id, subject),
  UNIQUE (patient_id, account_id)
);
CREATE INDEX IF NOT EXISTS nessie_connections_patient_idx ON nessie_connections(patient_id, linked_at);

CREATE TABLE IF NOT EXISTS care_cost_shares (
  id UUID PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES nessie_connections(id) ON DELETE SET NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('bill', 'purchase')),
  resource_id TEXT NOT NULL,
  merchant_id TEXT,
  merchant_name TEXT NOT NULL,
  label TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  occurred_on TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'shared',
  shared_by TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE (patient_id, connection_id, resource_type, resource_id)
);
CREATE INDEX IF NOT EXISTS care_cost_shares_patient_idx ON care_cost_shares(patient_id, occurred_on DESC);

CREATE TABLE IF NOT EXISTS care_records (
  id UUID PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL,
  record_type TEXT NOT NULL CHECK (record_type IN ('ride', 'appointment', 'medication', 'care_cost')),
  title TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  scheduled_at BIGINT,
  amount NUMERIC(12, 2) CHECK (amount IS NULL OR amount >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  source TEXT NOT NULL DEFAULT 'manual',
  recurrence TEXT NOT NULL DEFAULT 'none',
  reminder_times TEXT[] NOT NULL DEFAULT '{}',
  reminder_days SMALLINT[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',
  reminder_offsets INTEGER[] NOT NULL DEFAULT '{1440,60}',
  reminders_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  created_at BIGINT NOT NULL
);
ALTER TABLE care_records ADD COLUMN IF NOT EXISTS recurrence TEXT NOT NULL DEFAULT 'none';
ALTER TABLE care_records ADD COLUMN IF NOT EXISTS reminder_times TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE care_records ADD COLUMN IF NOT EXISTS reminder_days SMALLINT[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}';
ALTER TABLE care_records ADD COLUMN IF NOT EXISTS reminder_offsets INTEGER[] NOT NULL DEFAULT '{1440,60}';
ALTER TABLE care_records ADD COLUMN IF NOT EXISTS reminders_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE care_records ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';
CREATE INDEX IF NOT EXISTS care_records_patient_type_date_idx ON care_records(patient_id, record_type, scheduled_at DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS web_push_subscriptions (
  id UUID PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS web_push_subscriptions_patient_idx ON web_push_subscriptions(patient_id, subject);

CREATE TABLE IF NOT EXISTS care_reminder_deliveries (
  id UUID PRIMARY KEY,
  record_id UUID NOT NULL REFERENCES care_records(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES web_push_subscriptions(id) ON DELETE CASCADE,
  reminder_key TEXT NOT NULL,
  scheduled_for BIGINT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  sent_at BIGINT,
  UNIQUE (record_id, subscription_id, reminder_key)
);
CREATE INDEX IF NOT EXISTS care_reminder_deliveries_state_idx ON care_reminder_deliveries(state, created_at);

CREATE TABLE IF NOT EXISTS nessie_transfer_events (
  id UUID PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES nessie_connections(id) ON DELETE SET NULL,
  share_id UUID REFERENCES care_cost_shares(id) ON DELETE SET NULL,
  request_id UUID NOT NULL UNIQUE,
  provider_transfer_id TEXT,
  source_account_id TEXT NOT NULL,
  recipient_account_id TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'needs_review')),
  error_message TEXT,
  created_by TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS nessie_transfer_events_patient_idx ON nessie_transfer_events(patient_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS nessie_transfer_active_share_idx ON nessie_transfer_events(share_id)
  WHERE share_id IS NOT NULL AND status IN ('pending', 'succeeded', 'needs_review');
