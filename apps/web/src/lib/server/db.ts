import "server-only";
import postgres from "postgres";
import { RECORDING_CONSENT_POLICY_VERSION } from "@hale/contracts";

type SqlClient = ReturnType<typeof postgres>;
const globalForDb = globalThis as typeof globalThis & { haleTigerSql?: SqlClient };

export class BackendError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "BackendError";
  }
}

export function getDb(): SqlClient {
  const url = process.env.TIGERDATA_DATABASE_URL;
  if (!url) throw new BackendError("Private memory storage is not available right now.", 503);
  if (!globalForDb.haleTigerSql) {
    globalForDb.haleTigerSql = postgres(url, {
      ssl: "require",
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });
  }
  return globalForDb.haleTigerSql;
}

export async function requireUserId(): Promise<string> {
  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  if (!userId) throw new BackendError("Please sign in.", 401);
  return userId;
}

export function isUuid(value: string | null | undefined): value is string {
  return Boolean(value && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value));
}

export async function requireMember(subject: string, patientId: string, capability: string) {
  if (!isUuid(patientId)) throw new BackendError("Patient space unavailable.", 404);
  const sql = getDb();
  const rows = await sql`
    SELECT p.id::text AS id, p.name, p.timezone, p.audio_retention_days,
           m.capabilities, m.active
    FROM memberships m
    JOIN patients p ON p.id = m.patient_id
    WHERE m.patient_id = ${patientId}::uuid AND m.subject = ${subject}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row || !row.active || !(row.capabilities as string[]).includes(capability)) {
    throw new BackendError("You don’t have permission to access this patient space.", 403);
  }
  return {
    patient: { id: String(row.id), name: String(row.name), timezone: String(row.timezone), audioRetentionDays: Number(row.audio_retention_days) },
    capabilities: row.capabilities as string[],
  };
}

export async function requireRecordingConsent(subject: string, patientId: string) {
  const rows = await getDb()`
    SELECT id FROM consents
    WHERE patient_id = ${patientId}::uuid AND subject = ${subject}
      AND purpose = 'recording' AND policy_version = ${RECORDING_CONSENT_POLICY_VERSION} AND revoked_at IS NULL
    LIMIT 1
  `;
  if (!rows.length) throw new BackendError("Recording consent is required.", 403);
}

export function jsonError(error: unknown): Response {
  if (error instanceof BackendError) return Response.json({ error: error.message }, { status: error.status });
  return Response.json({ error: "The request could not be completed." }, { status: 500 });
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  let value: unknown;
  try { value = await request.json(); }
  catch { throw new BackendError("Request body must be valid JSON."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BackendError("Request body must be a JSON object.");
  return value as Record<string, unknown>;
}
