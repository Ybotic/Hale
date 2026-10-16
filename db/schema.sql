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
  name TEXT NOT NULL,
  relationship TEXT NOT NULL,
  enrollment TEXT NOT NULL CHECK (enrollment IN ('not_enrolled', 'enrolled', 'revoked'))
);
CREATE INDEX IF NOT EXISTS people_patient_idx ON people(patient_id);

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
  consent_confirmed_at BIGINT NOT NULL
);
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
  UNIQUE (session_id, sequence)
);
CREATE INDEX IF NOT EXISTS audio_chunks_expiry_idx ON audio_chunks(expires_at) WHERE audio IS NOT NULL;

CREATE TABLE IF NOT EXISTS processing_jobs (
  id UUID PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  chunk_id UUID NOT NULL REFERENCES audio_chunks(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('queued', 'processing', 'ready', 'failed')),
  error TEXT,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS processing_jobs_chunk_idx ON processing_jobs(chunk_id);

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
  deleted_at BIGINT
);
CREATE INDEX IF NOT EXISTS conversations_patient_date_idx ON conversations(patient_id, local_date, started_at DESC);
CREATE INDEX IF NOT EXISTS conversations_chunk_idx ON conversations(chunk_id);

CREATE TABLE IF NOT EXISTS transcript_turns (
  id UUID PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  speaker TEXT NOT NULL,
  person_id UUID REFERENCES people(id) ON DELETE SET NULL,
  start_seconds DOUBLE PRECISION NOT NULL,
  end_seconds DOUBLE PRECISION NOT NULL,
  text TEXT NOT NULL,
  uncertain BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS transcript_turns_conversation_idx ON transcript_turns(conversation_id, start_seconds);
CREATE INDEX IF NOT EXISTS transcript_turns_search_idx ON transcript_turns USING GIN (to_tsvector('simple', text));

CREATE TABLE IF NOT EXISTS memories (
  id UUID PRIMARY KEY,
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
CREATE INDEX IF NOT EXISTS memories_patient_date_idx ON memories(patient_id, local_date DESC);
CREATE INDEX IF NOT EXISTS memories_conversation_idx ON memories(conversation_id);
CREATE INDEX IF NOT EXISTS memories_search_idx ON memories USING GIN (to_tsvector('simple', text));

CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  operation TEXT NOT NULL,
  target TEXT NOT NULL,
  timestamp BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_events_patient_idx ON audit_events(patient_id, timestamp DESC);

-- Each Backboard assistant is scoped to one signed-in member and patient space.
CREATE TABLE IF NOT EXISTS backboard_contexts (
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  assistant_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (patient_id, subject)
);
