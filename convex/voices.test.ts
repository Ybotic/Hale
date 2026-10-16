import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { defineTestApp } from "convex-test";
import { v } from "convex/values";
import { encodeVoiceWav, VOICE_SAMPLE_RATE } from "@hale/contracts/voice";
import schema from "./schema";
import * as voices from "./voices";
import * as http from "./http";
import * as patients from "./patients";

// State/HTTP tests leave workers under explicit control. No test makes a provider call.
const builders = defineTestApp({ schema });
const noopStart = builders.internalAction({ args: { profileId: v.id("familyProfiles"), requestId: v.string() }, handler: async () => null });
const app = builders.defineModules({ voices: { ...voices, start: noopStart }, http, patients });
const workers = defineTestApp({ schema }).defineModules({ voices });
const tests: ReturnType<typeof app.createTest>[] = [];
let oldOrigin: string | undefined, oldKey: string | undefined;
let originalFetch: typeof fetch;
function mockProvider(handler: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>) {
  globalThis.fetch = Object.assign(handler, { preconnect: originalFetch.preconnect });
}

beforeEach(() => {
  oldOrigin = process.env.APP_ORIGIN; oldKey = process.env.PYANNOTE_API_KEY;
  originalFetch = globalThis.fetch;
  process.env.APP_ORIGIN = "https://hale.example"; process.env.PYANNOTE_API_KEY = "test-key-not-real";
});
afterEach(async () => {
  for (const t of tests.splice(0)) {
    await t.run(async (ctx) => {
      for (const job of await ctx.db.system.query("_scheduled_functions").collect()) {
        if (job.state.kind === "pending") await ctx.scheduler.cancel(job._id);
      }
    });
    await t.finishInProgressScheduledFunctions();
  }
  globalThis.fetch = originalFetch;
  if (oldOrigin === undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN = oldOrigin;
  if (oldKey === undefined) delete process.env.PYANNOTE_API_KEY; else process.env.PYANNOTE_API_KEY = oldKey;
});

const wav = () => encodeVoiceWav(Float32Array.from({ length: VOICE_SAMPLE_RATE * 10 }, (_, i) => .1 * Math.sin(i * 2 * Math.PI * 440 / VOICE_SAMPLE_RATE)));
async function setup() {
  const t = app.createTest(); tests.push(t);
  const family = t.withIdentity({ subject: "family-a" });
  await family.mutation(app.api.voices.saveProfile, { name: "Fictional Family", relationship: "Sibling" });
  const profile = (await t.run((ctx) => ctx.db.query("familyProfiles").collect()))[0];
  const storageId = await t.run((ctx) => ctx.storage.store(new Blob([wav()], { type: "audio/wav" })));
  const args = { storageId, requestId: crypto.randomUUID(), consent: true, expectedVersion: 0 };
  return { t, family, profileId: profile._id, args };
}

describe("family account and voice enrollment boundaries", () => {
  test("requires an authenticated identity for all public profile operations", async () => {
    const t = app.createTest(); tests.push(t);
    await expect(t.query(app.api.voices.me)).rejects.toThrow("sign in");
    await expect(t.mutation(app.api.voices.saveProfile, { name: "Test", relationship: "Friend" })).rejects.toThrow("sign in");
    await expect(t.mutation(app.api.voices.skip)).rejects.toThrow("sign in");
    await expect(t.mutation(app.api.voices.revoke)).rejects.toThrow("sign in");
  });
  test("profile creation is idempotent and never grants patient membership", async () => {
    const { t, family } = await setup();
    await family.mutation(app.api.voices.saveProfile, { name: "Updated Name", relationship: "Friend" });
    expect(await t.run((ctx) => ctx.db.query("familyProfiles").collect())).toHaveLength(1);
    expect(await family.query(app.api.patients.list)).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("patients").collect())).toEqual([]);
    await expect(family.mutation(app.api.voices.saveProfile, { name: " ", relationship: "Friend" })).rejects.toThrow("name");
  });
  test("skipping needs no biometric consent and collects no voiceprint", async () => {
    const { t, family } = await setup();
    await family.mutation(app.api.voices.skip);
    const profile = (await t.run((ctx) => ctx.db.query("familyProfiles").collect()))[0];
    expect(profile.voiceState).toBe("skipped");
    expect(profile.consentAt).toBeUndefined(); expect(profile.voiceprint).toBeUndefined();
  });
  test("rejects enrollment without separate consent or server configuration", async () => {
    const { family, args } = await setup();
    await expect(family.mutation(app.internal.voices.accept, { ...args, consent: false })).rejects.toThrow("consent");
    delete process.env.PYANNOTE_API_KEY;
    expect((await family.query(app.api.voices.me)).configured).toBe(false);
    await expect(family.mutation(app.internal.voices.accept, args)).rejects.toThrow("configured");
  });
  test("an unintroduced account cannot submit a guessed storage ID", async () => {
    const { t, args } = await setup();
    await expect(t.withIdentity({ subject: "outsider" }).mutation(app.internal.voices.accept, args)).rejects.toThrow("first");
  });
  test("retries are idempotent and another take cannot overwrite an active profile", async () => {
    const { family, args } = await setup();
    expect(await family.mutation(app.internal.voices.accept, args)).toEqual({ duplicate: false });
    expect(await family.mutation(app.internal.voices.accept, args)).toEqual({ duplicate: true });
    await expect(family.mutation(app.internal.voices.accept, { ...args, expectedVersion: 1, requestId: crypto.randomUUID() })).rejects.toThrow("existing");
  });
  test("revocation invalidates an upload already in flight", async () => {
    const { family, args } = await setup();
    await family.mutation(app.api.voices.revoke);
    await expect(family.mutation(app.internal.voices.accept, args)).rejects.toThrow("consent changed");
  });
  test("revocation deletes bytes and prevents a late worker result from restoring a voiceprint", async () => {
    const { t, family, profileId, args } = await setup();
    await family.mutation(app.internal.voices.accept, args);
    await t.mutation(app.internal.voices.claim, { profileId, requestId: args.requestId });
    await family.mutation(app.api.voices.revoke);
    await t.mutation(app.internal.voices.finish, { profileId, requestId: args.requestId, voiceprint: "late-private-voiceprint" });
    const profile = await t.run((ctx) => ctx.db.get(profileId));
    expect(profile?.voiceState).toBe("revoked"); expect(profile?.voiceprint).toBeUndefined();
    expect(await t.run((ctx) => ctx.storage.getUrl(args.storageId))).toBeNull();
  });
  test("public reads are owner-only and never return private artifacts", async () => {
    const { t, family, profileId } = await setup();
    await t.run((ctx) => ctx.db.patch(profileId, { voiceState: "enrolled", voiceprint: "private-voiceprint", jobId: "private-job" }));
    const result = await family.query(app.api.voices.me);
    expect(result.profile?.voiceState).toBe("enrolled");
    expect(JSON.stringify(result)).not.toContain("private-");
    expect(JSON.stringify(result)).not.toContain("storageId");
    expect((await t.withIdentity({ subject: "outsider" }).query(app.api.voices.me)).profile).toBeNull();
    await t.withIdentity({ subject: "outsider" }).mutation(app.api.voices.revoke);
    expect((await family.query(app.api.voices.me)).profile?.voiceState).toBe("enrolled");
  });
  test("completion and expiry remove enrollment source audio", async () => {
    const { t, family, profileId, args } = await setup();
    await family.mutation(app.internal.voices.accept, args);
    await t.mutation(app.internal.voices.claim, { profileId, requestId: args.requestId });
    await t.mutation(app.internal.voices.finish, { profileId, requestId: args.requestId, voiceprint: "private-result" });
    expect((await family.query(app.api.voices.me)).profile?.voiceState).toBe("enrolled");
    expect(await t.run((ctx) => ctx.storage.getUrl(args.storageId))).toBeNull();
    const other = await setup();
    await other.family.mutation(app.internal.voices.accept, other.args);
    await other.t.run((ctx) => ctx.db.patch(other.profileId, { updatedAt: Date.now() - 61 * 60_000 }));
    await other.t.mutation(app.internal.voices.expireSamples);
    expect((await other.family.query(app.api.voices.me)).profile?.voiceState).toBe("failed");
    expect(await other.t.run((ctx) => ctx.storage.getUrl(other.args.storageId))).toBeNull();
  });
});

describe("voice HTTP ingestion", () => {
  test("checks origin, identity, MIME, consent, size, and actual audio before storing bytes", async () => {
    const { t, family } = await setup();
    const headers = { Origin: "https://hale.example", "Content-Type": "audio/wav" };
    const url = `/voice?consent=true&requestId=${crypto.randomUUID()}`;
    expect((await family.fetch(url, { method: "POST", headers: { ...headers, Origin: "https://wrong.invalid" }, body: wav() })).status).toBe(403);
    expect((await t.fetch(url, { method: "POST", headers, body: wav() })).status).toBe(401);
    expect((await family.fetch(url, { method: "POST", headers: { ...headers, "Content-Type": "audio/webm" }, body: wav() })).status).toBe(415);
    expect((await family.fetch("/voice", { method: "POST", headers, body: wav() })).status).toBe(400);
    expect((await family.fetch(url, { method: "POST", headers, body: new Uint8Array(1_000_000) })).status).toBe(413);
    expect((await family.fetch(url, { method: "POST", headers, body: "renamed container" })).status).toBe(400);
    expect(await t.run((ctx) => ctx.db.system.query("_storage").collect())).toHaveLength(1); // setup fixture only
  });
  test("accepts valid audio, handles CORS, and deletes duplicate upload files", async () => {
    const { t, family } = await setup();
    const headers = { Origin: "https://hale.example", "Content-Type": "audio/wav" };
    const url = `/voice?consent=true&requestId=${crypto.randomUUID()}`;
    const preflight = await t.fetch("/voice", { method: "OPTIONS", headers });
    expect(preflight.headers.get("access-control-allow-origin")).toBe("https://hale.example");
    const result = await family.fetch(url, { method: "POST", headers, body: wav() });
    expect(result.status).toBe(200); expect(result.headers.get("cache-control")).toBe("no-store");
    expect((await family.fetch(url, { method: "POST", headers, body: wav() })).status).toBe(200);
    expect(await t.run((ctx) => ctx.db.system.query("_storage").collect())).toHaveLength(2); // fixture plus one accepted take
    expect((await family.query(app.api.voices.me)).profile?.voiceState).toBe("queued");
  });
});

describe("pyannoteAI adapter (mocked HTTP, no live calls)", () => {
  async function workerSetup() {
    const t = workers.createTest(); tests.push(t);
    const requestId = crypto.randomUUID();
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob([wav()], { type: "audio/wav" })));
    const profileId = await t.run((ctx) => ctx.db.insert("familyProfiles", { subject: "family-a", name: "Test Family", relationship: "Friend", voiceState: "queued", storageId, requestId, consentAt: Date.now(), updatedAt: Date.now() }));
    return { t, profileId, requestId, storageId };
  }
  test("submits precision-2 voiceprints, persists output privately, and deletes source", async () => {
    const { t, profileId, requestId, storageId } = await workerSetup();
    const calls: { url: string; init?: RequestInit }[] = [];
    mockProvider(async (url, init) => {
      calls.push({ url: String(url), init });
      return Response.json(calls.length === 1 ? { jobId: "job-123", status: "created" } : { jobId: "job-123", status: "succeeded", output: { voiceprint: "opaque-private-result" } });
    });
    await t.action(workers.internal.voices.start, { profileId, requestId });
    expect(calls[0].url).toBe("https://api.pyannote.ai/v1/voiceprint");
    expect(JSON.parse(String(calls[0].init?.body)).model).toBe("precision-2");
    expect(calls[0].init?.headers).toMatchObject({ Authorization: "Bearer test-key-not-real" });
    await t.action(workers.internal.voices.poll, { profileId, requestId, attempt: 0 });
    expect(calls[1].url).toBe("https://api.pyannote.ai/v1/jobs/job-123");
    const profile = await t.run((ctx) => ctx.db.get(profileId));
    expect(profile?.voiceState).toBe("enrolled"); expect(profile?.voiceprint).toBe("opaque-private-result");
    expect(await t.run((ctx) => ctx.storage.getUrl(storageId))).toBeNull();
  });
  test("provider errors fail safely without exposing provider bodies", async () => {
    const { t, profileId, requestId, storageId } = await workerSetup();
    mockProvider(async () => new Response("private-provider-diagnostics", { status: 402 }));
    await t.action(workers.internal.voices.start, { profileId, requestId });
    const profile = await t.run((ctx) => ctx.db.get(profileId));
    expect(profile?.voiceState).toBe("failed"); expect(profile?.message).not.toContain("private-provider");
    expect(await t.run((ctx) => ctx.storage.getUrl(storageId))).toBeNull();
  });
  test("provider warnings and exhausted polling do not become successful enrollment", async () => {
    const { t, profileId, requestId } = await workerSetup();
    await t.run((ctx) => ctx.db.patch(profileId, { voiceState: "processing", jobId: "job-warning" }));
    mockProvider(async () => Response.json({ jobId: "job-warning", status: "succeeded", output: { voiceprint: "untrusted", warning: "low quality" } }));
    await t.action(workers.internal.voices.poll, { profileId, requestId, attempt: 0 });
    expect((await t.run((ctx) => ctx.db.get(profileId)))?.voiceState).toBe("failed");
    await t.run((ctx) => ctx.db.patch(profileId, { voiceState: "processing", jobId: "job-slow" }));
    await t.action(workers.internal.voices.poll, { profileId, requestId, attempt: 60 });
    expect((await t.run((ctx) => ctx.db.get(profileId)))?.message).toContain("timed out");
  });
});
