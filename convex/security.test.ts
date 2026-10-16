import { describe, expect, test } from "bun:test";
import { defineTestApp } from "convex-test";
import schema from "./schema";
import * as patients from "./patients";
import * as recordings from "./recordings";
import * as conversations from "./conversations";
import * as privacy from "./privacy";
import * as http from "./http";

const app = defineTestApp({ schema }).defineModules({ patients, recordings, conversations, privacy, http });

async function setup() {
  const t = app.createTest();
  const patient = t.withIdentity({ subject: "patient-a", issuer: "https://test.clerk.accounts.dev" });
  const patientId = await patient.mutation(app.api.patients.create, { name: "Fictional Patient", timezone: "America/New_York", recordingConsent: true });
  const sessionId = await patient.mutation(app.api.recordings.start, { patientId, participantsConsented: true });
  const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["consented test bytes"], { type: "audio/mp4" })));
  const capturedAt = Date.now();
  const args = { sessionId, sequence: 0, storageId, capturedAt, endedAt: capturedAt + 1, mimeType: "audio/mp4" };
  return { t, patient, patientId, sessionId, args };
}

describe("Convex authentication, isolation, and upload ownership", () => {
  test("unauthenticated accounts cannot create or list spaces", async () => {
    const t = app.createTest();
    await expect(t.query(app.api.patients.list)).rejects.toThrow("sign in");
    await expect(t.mutation(app.api.patients.create, { name: "Test", timezone: "UTC", recordingConsent: true })).rejects.toThrow("sign in");
  });
  test("patient creation validates timezone and is logically unique", async () => {
    const t = app.createTest().withIdentity({ subject: "patient-a" });
    await expect(t.mutation(app.api.patients.create, { name: "Test", timezone: "Not/A_Timezone", recordingConsent: true })).rejects.toThrow("timezone");
    await t.mutation(app.api.patients.create, { name: "Test", timezone: "UTC", recordingConsent: true });
    await expect(t.mutation(app.api.patients.create, { name: "Test", timezone: "UTC", recordingConsent: true })).rejects.toThrow("already");
  });
  test("an uninvited identity cannot read a guessed patient ID", async () => {
    const { t, patientId } = await setup();
    const outsider = t.withIdentity({ subject: "outsider" });
    await expect(outsider.query(app.api.conversations.space, { patientId })).rejects.toThrow("permission");
    expect(await outsider.query(app.api.patients.list)).toEqual([]);
  });
  test("a family reader cannot start a recording or finalize another user's upload", async () => {
    const { t, patientId, args } = await setup();
    await t.run((ctx) => ctx.db.insert("memberships", { patientId, subject: "family", role: "family", capabilities: ["memories:read"], active: true }));
    const family = t.withIdentity({ subject: "family" });
    expect((await family.query(app.api.conversations.space, { patientId })).name).toBe("Fictional Patient");
    await expect(family.mutation(app.api.recordings.start, { patientId, participantsConsented: true })).rejects.toThrow("permission");
    await expect(family.mutation(app.internal.recordings.acceptChunk, args)).rejects.toThrow("permission");
  });
  test("recording consent and session participant confirmation are separate requirements", async () => {
    const t = app.createTest().withIdentity({ subject: "patient-a" });
    const patientId = await t.mutation(app.api.patients.create, { name: "Test", timezone: "UTC", recordingConsent: false });
    await expect(t.mutation(app.api.recordings.start, { patientId, participantsConsented: true })).rejects.toThrow("consent");
    const other = await setup();
    await expect(other.patient.mutation(app.api.recordings.start, { patientId: other.patientId, participantsConsented: false })).rejects.toThrow("everyone");
  });
  test("same session/sequence is idempotent and creates only one visible conversation", async () => {
    const { t, patient, patientId, args } = await setup();
    const first = await patient.mutation(app.internal.recordings.acceptChunk, args);
    const second = await patient.mutation(app.internal.recordings.acceptChunk, args);
    expect(second.chunkId).toBe(first.chunkId);
    expect(second.duplicate).toBe(true);
    expect((await patient.query(app.api.conversations.space, { patientId })).conversations).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.query("processingJobs").collect())).toHaveLength(1);
  });
  test("session ownership is checked even for another capable member", async () => {
    const { t, patientId, args } = await setup();
    await t.run((ctx) => ctx.db.insert("memberships", { patientId, subject: "recorder-b", role: "family", capabilities: ["recordings:create"], active: true }));
    await expect(t.withIdentity({ subject: "recorder-b" }).mutation(app.internal.recordings.acceptChunk, args)).rejects.toThrow("owner mismatch");
  });
  test("a revoked consent blocks uploads already in flight", async () => {
    const { t, patient, args } = await setup();
    await t.run(async (ctx) => { const consent = (await ctx.db.query("consents").collect())[0]; await ctx.db.patch(consent._id, { revokedAt: Date.now() }); });
    await expect(patient.mutation(app.internal.recordings.acceptChunk, args)).rejects.toThrow("consent");
  });
  test("invalid segment timing is rejected", async () => {
    const { patient, args } = await setup();
    await expect(patient.mutation(app.internal.recordings.acceptChunk, { ...args, endedAt: args.capturedAt - 1 })).rejects.toThrow("timing");
    await expect(patient.mutation(app.internal.recordings.acceptChunk, { ...args, sequence: 0.5 })).rejects.toThrow("timing");
  });
  test("HTTP audio uploads fail closed for an unknown origin", async () => {
    const { t } = await setup();
    const response = await t.fetch("/audio", { method: "POST", headers: { Origin: "https://untrusted.invalid", "Content-Type": "audio/mp4" }, body: "fake audio" });
    expect(response.status).toBe(403);
  });
  test("authenticated HTTP ingestion rechecks identity and cleans up duplicate upload files", async () => {
    const { t, patient, patientId, sessionId } = await setup();
    const previousOrigin = process.env.APP_ORIGIN;
    process.env.APP_ORIGIN = "https://mnemo.example";
    try {
      const capturedAt = Date.now();
      const params = new URLSearchParams({ sessionId, sequence: "1", capturedAt: String(capturedAt), endedAt: String(capturedAt + 1) });
      const upload = () => patient.fetch(`/audio?${params}`, { method: "POST", headers: { Origin: "https://mnemo.example", "Content-Type": "audio/mp4" }, body: new Blob(["synthetic audio bytes"]) });
      const first = await upload();
      expect(first.status).toBe(200);
      const firstResult = await first.json();
      const second = await upload();
      expect(second.status).toBe(200);
      expect((await second.json()).chunkId).toBe(firstResult.chunkId);
      const outsider = await t.withIdentity({ subject: "outsider" }).fetch(`/audio?${params}`, { method: "POST", headers: { Origin: "https://mnemo.example", "Content-Type": "audio/mp4" }, body: "unauthorized bytes" });
      expect(outsider.status).toBe(400);
      expect((await patient.query(app.api.conversations.space, { patientId })).conversations).toHaveLength(1);
      const files = await t.run((ctx) => ctx.db.system.query("_storage").collect());
      expect(files).toHaveLength(2); // One setup fixture + one accepted file, no duplicate or unauthorized orphan.
    } finally {
      if (previousOrigin === undefined) delete process.env.APP_ORIGIN;
      else process.env.APP_ORIGIN = previousOrigin;
    }
  });
});

describe("revocation, deletion, and retention", () => {
  test("revocation denies subsequent source and audio retrieval", async () => {
    const { t, patient, patientId, args } = await setup();
    await patient.mutation(app.internal.recordings.acceptChunk, args);
    const conversationId = await t.run(async (ctx) => (await ctx.db.query("conversations").collect())[0]._id);
    await t.run(async (ctx) => { const membership = (await ctx.db.query("memberships").collect())[0]; await ctx.db.patch(membership._id, { active: false }); });
    await expect(patient.query(app.api.conversations.space, { patientId })).rejects.toThrow("permission");
    await expect(patient.query(app.api.conversations.detail, { conversationId })).rejects.toThrow("permission");
  });
  test("deletion purges source records and tombstones uploads against resurrection", async () => {
    const { t, patient, patientId, args } = await setup();
    await patient.mutation(app.internal.recordings.acceptChunk, args);
    const conversation = await t.run(async (ctx) => (await ctx.db.query("conversations").collect())[0]);
    await t.run(async (ctx) => {
      const turnId = await ctx.db.insert("transcriptTurns", { patientId, conversationId: conversation._id, speaker: "Unknown speaker", start: 0, end: 1, text: "Consented synthetic test evidence.", uncertain: true });
      await ctx.db.insert("memories", { patientId, conversationId: conversation._id, kind: "conversation_topic", title: "Test", text: "Test evidence", localDate: conversation.localDate, turnIds: [turnId], people: [] });
    });
    await patient.mutation(app.api.privacy.deleteConversation, { conversationId: conversation._id });
    expect((await patient.query(app.api.conversations.space, { patientId })).conversations).toHaveLength(0);
    await expect(patient.query(app.api.conversations.detail, { conversationId: conversation._id })).rejects.toThrow("unavailable");
    await expect(patient.mutation(app.internal.recordings.acceptChunk, args)).rejects.toThrow("deleted");
    expect(await t.run((ctx) => ctx.db.query("transcriptTurns").collect())).toHaveLength(0);
    expect(await t.run((ctx) => ctx.db.query("memories").collect())).toHaveLength(0);
    expect(await t.run((ctx) => ctx.storage.getUrl(args.storageId))).toBeNull();
    const audit = await t.run((ctx) => ctx.db.query("auditEvents").collect());
    expect(JSON.stringify(audit)).not.toContain("synthetic test evidence");
  });
  test("audio expiry removes playback without deleting the conversation text", async () => {
    const { t, patient, patientId, args } = await setup();
    const { chunkId } = await patient.mutation(app.internal.recordings.acceptChunk, args);
    await t.run((ctx) => ctx.db.patch(chunkId, { expiresAt: Date.now() - 1 }));
    await t.mutation(app.internal.privacy.expireAudio);
    expect(await t.run((ctx) => ctx.storage.getUrl(args.storageId))).toBeNull();
    expect((await patient.query(app.api.conversations.space, { patientId })).conversations).toHaveLength(1);
  });
});
