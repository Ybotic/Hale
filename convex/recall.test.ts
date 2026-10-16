import { describe, expect, test } from "bun:test";
import { defineTestApp } from "convex-test";
import schema from "./schema";
import * as patients from "./patients";
import * as conversations from "./conversations";
import * as assistant from "./assistant";
import * as privacy from "./privacy";

const app = defineTestApp({ schema }).defineModules({ patients, conversations, assistant, privacy });

async function setup() {
  const t = app.createTest();
  const owner = t.withIdentity({ subject: "owner" });
  const patientId = await owner.mutation(app.api.patients.create, { name: "Fictional Person", timezone: "UTC", recordingConsent: true });
  const seeded = await t.run(async (ctx) => {
    const sessionId = await ctx.db.insert("recordingSessions", { patientId, subject: "owner", startedAt: Date.now(), timezone: "UTC", state: "stopped", consentConfirmedAt: Date.now() });
    const chunkId = await ctx.db.insert("audioChunks", { patientId, sessionId, sequence: 0, capturedAt: Date.now(), endedAt: Date.now() + 1000, mimeType: "audio/mp4", state: "ready", expiresAt: Date.now() + 10000 });
    const conversationId = await ctx.db.insert("conversations", { patientId, chunkId, title: "A conversation", summary: "An available recording", startedAt: Date.parse("2026-10-14T12:00:00Z"), duration: 60, localDate: "2026-10-14", people: [], state: "ready" });
    const turnId = await ctx.db.insert("transcriptTurns", { patientId, conversationId, speaker: "Unknown speaker", start: 0, end: 5, text: "I would bring the photo album on Sunday.", uncertain: true });
    await ctx.db.insert("memories", { patientId, conversationId, kind: "plan", title: "A photo album for Sunday", text: "Someone said they would bring the photo album on Sunday.", localDate: "2026-10-14", plannedFor: "2026-10-18", turnIds: [turnId], people: [] });
    return { conversationId, turnId, chunkId };
  });
  return { t, owner, patientId, ...seeded };
}

describe("live, authorized source-bound recall and search", () => {
  test("search and recall require an active capability, not a guessed ID", async () => {
    const { t, patientId } = await setup();
    for (const client of [t, t.withIdentity({ subject: "outsider" })]) {
      await expect(client.query(app.api.assistant.recall, { patientId, question: "Sunday?" })).rejects.toThrow();
      await expect(client.query(app.api.conversations.search, { patientId, text: "album" })).rejects.toThrow();
    }
    await t.run((ctx) => ctx.db.insert("memberships", { patientId, subject: "no-reader", role: "family", capabilities: ["recordings:create"], active: true }));
    await expect(t.withIdentity({ subject: "no-reader" }).query(app.api.assistant.recall, { patientId, question: "Sunday?" })).rejects.toThrow("permission");
  });
  test("answers preserve plans and cite real private source turns", async () => {
    const { owner, patientId, turnId } = await setup();
    const answer = await owner.query(app.api.assistant.recall, { patientId, question: "What about Sunday?", day: "2026-10-14" });
    expect(answer.insufficient).toBe(false);
    expect(answer.text).toContain("would bring");
    expect(answer.citations[0].turnId).toBe(turnId);
    expect(answer.citations[0].excerpt).toBe("I would bring the photo album on Sunday.");
  });
  test("a selected calendar day cannot leak another day's evidence", async () => {
    const { owner, patientId } = await setup();
    const answer = await owner.query(app.api.assistant.recall, { patientId, question: "What about Sunday?", day: "2026-10-13" });
    expect(answer.insufficient).toBe(true);
    expect(answer.citations).toHaveLength(0);
  });
  test("deletion removes sources from both subsequent recall and indexed search", async () => {
    const { owner, patientId, conversationId } = await setup();
    expect((await owner.query(app.api.conversations.search, { patientId, text: "album" })).conversations).toHaveLength(1);
    await owner.mutation(app.api.privacy.deleteConversation, { conversationId });
    expect((await owner.query(app.api.assistant.recall, { patientId, question: "Sunday?" })).insufficient).toBe(true);
    expect((await owner.query(app.api.conversations.search, { patientId, text: "album" })).conversations).toHaveLength(0);
  });
  test("revoked memberships cannot keep querying recall or search", async () => {
    const { t, owner, patientId } = await setup();
    await t.run(async (ctx) => { const member = (await ctx.db.query("memberships").collect())[0]; await ctx.db.patch(member._id, { active: false }); });
    await expect(owner.query(app.api.assistant.recall, { patientId, question: "Sunday?" })).rejects.toThrow("permission");
    await expect(owner.query(app.api.conversations.search, { patientId, text: "album" })).rejects.toThrow("permission");
  });
  test("transcript-only evidence returns verbatim words, never an invented recap", async () => {
    const { t, owner, patientId } = await setup();
    await t.run(async (ctx) => { for (const memory of await ctx.db.query("memories").collect()) await ctx.db.delete(memory._id); });
    const answer = await owner.query(app.api.assistant.recall, { patientId, question: "What about Sunday?" });
    expect(answer.text).toContain("Unknown speaker: “I would bring the photo album on Sunday.”");
    expect(answer.text).toContain("not verified events");
    expect(answer.citations).toHaveLength(1);
  });
  test("full-text search and source details work beyond the initial 100-conversation window", async () => {
    const { t, owner, patientId, chunkId, conversationId } = await setup();
    await t.run(async (ctx) => {
      for (let index = 0; index < 105; index++) await ctx.db.insert("conversations", { patientId, chunkId, title: "Newer recording", summary: "No relevant words", startedAt: Date.parse("2026-10-15T12:00:00Z") + index, duration: 1, localDate: "2026-10-15", people: [], state: "queued" });
    });
    expect((await owner.query(app.api.conversations.space, { patientId })).conversations.some((item) => item.id === conversationId)).toBe(false);
    const result = await owner.query(app.api.conversations.search, { patientId, text: "album" });
    expect(result.conversations.map((item) => item.id)).toEqual([conversationId]);
    expect((await owner.query(app.api.conversations.detail, { conversationId })).turns).toHaveLength(1);
    const answer = await owner.query(app.api.assistant.recall, { patientId, question: "Sunday?", day: "2026-10-14" });
    expect(answer.citations).toHaveLength(1);
  });
  test("search respects person/date filters and rejects invalid input", async () => {
    const { owner, patientId } = await setup();
    expect((await owner.query(app.api.conversations.search, { patientId, text: "album", day: "2026-10-13" })).conversations).toHaveLength(0);
    expect((await owner.query(app.api.conversations.search, { patientId, text: "album", personId: "not-a-participant" })).conversations).toHaveLength(0);
    await expect(owner.query(app.api.conversations.search, { patientId, text: "x".repeat(201) })).rejects.toThrow("200");
    await expect(owner.query(app.api.conversations.search, { patientId, text: "", day: "2026-02-31" })).rejects.toThrow("calendar");
    await expect(owner.query(app.api.assistant.recall, { patientId, question: " " })).rejects.toThrow("question");
    await expect(owner.query(app.api.assistant.recall, { patientId, question: "x".repeat(1001) })).rejects.toThrow("question");
    await expect(owner.query(app.api.assistant.recall, { patientId, question: "Sunday?", day: "2026-02-31" })).rejects.toThrow("calendar");
  });
  test("another patient's transcript cannot appear in full-text results", async () => {
    const { t, owner, patientId } = await setup();
    const otherId = await t.withIdentity({ subject: "other" }).mutation(app.api.patients.create, { name: "Another Fictional Person", timezone: "UTC", recordingConsent: true });
    expect((await owner.query(app.api.conversations.search, { patientId, text: "album" })).conversations).toHaveLength(1);
    expect((await t.withIdentity({ subject: "other" }).query(app.api.conversations.search, { patientId: otherId, text: "album" })).conversations).toHaveLength(0);
  });
  test("cross-patient source references fail closed even if a stored association is corrupt", async () => {
    const { t, owner, patientId, conversationId, chunkId } = await setup();
    const otherId = await t.withIdentity({ subject: "other" }).mutation(app.api.patients.create, { name: "Another Fictional Person", timezone: "UTC", recordingConsent: true });
    await t.run(async (ctx) => {
      await ctx.db.insert("transcriptTurns", { patientId: otherId, conversationId, speaker: "Private other patient", start: 10, end: 15, text: "Other patient's secret words about Sunday.", uncertain: true });
      await ctx.db.insert("memories", { patientId: otherId, conversationId, kind: "conversation_topic", title: "Private other patient", text: "Other patient's secret words", localDate: "2026-10-14", turnIds: [], people: [] });
      await ctx.db.patch(chunkId, { patientId: otherId });
    });
    const detail = await owner.query(app.api.conversations.detail, { conversationId });
    expect(detail.turns).toHaveLength(1);
    expect(detail.memories).toHaveLength(1);
    expect(detail.audioUrl).toBeNull();
    const answer = await owner.query(app.api.assistant.recall, { patientId, question: "Sunday?" });
    expect(JSON.stringify(answer)).not.toContain("secret words");
  });
  test("bounded recall explicitly discloses partial coverage", async () => {
    const { t, owner, patientId, conversationId } = await setup();
    await t.run(async (ctx) => {
      for (let index = 0; index < 105; index++) await ctx.db.insert("transcriptTurns", { patientId, conversationId, speaker: "Unknown speaker", start: index + 20, end: index + 21, text: "Additional recorded words.", uncertain: true });
    });
    const answer = await owner.query(app.api.assistant.recall, { patientId, question: "Sunday?", day: "2026-10-14" });
    expect(answer.text).toContain("limited set of available records");
    expect(answer.text).toContain("not the whole day");
  });
});
