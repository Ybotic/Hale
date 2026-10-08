import { describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import type { UserIdentity } from "convex/server";
import { analyzeCognitiveTranscript } from "@care/shared";
import schema from "../schema";
import { api, internal } from "../_generated/api";

const modules = {
  "../_generated/api.js": () => import("../_generated/api.js"),
  "../_generated/server.js": () => import("../_generated/server.js"),
  "../alerts.ts": () => import("../alerts"),
  "../analysisActions.ts": () => import("../analysisActions"),
  "../analyses.ts": () => import("../analyses"),
  "../bills.ts": () => import("../bills"),
  "../deletion.ts": () => import("../deletion"),
  "../emergencyContacts.ts": () => import("../emergencyContacts"),
  "../medicationLogs.ts": () => import("../medicationLogs"),
  "../medications.ts": () => import("../medications"),
  "../messages.ts": () => import("../messages"),
  "../pairing.ts": () => import("../pairing"),
  "../pairingInternal.ts": () => import("../pairingInternal"),
  "../retention.ts": () => import("../retention"),
  "../sessions.ts": () => import("../sessions"),
  "../storage.ts": () => import("../storage"),
  "../users.ts": () => import("../users"),
  "../voice.ts": () => import("../voice"),
  "../voiceRateLimit.ts": () => import("../voiceRateLimit"),
};

function testBackend() {
  return convexTest(schema, modules);
}

function withRole(backend: ReturnType<typeof testBackend>, subject: string, role: "senior" | "caregiver") {
  const identity = {
    subject,
    tokenIdentifier: `test|${subject}`,
    haleRole: role,
  } as unknown as Partial<UserIdentity>;
  return backend.withIdentity(identity);
}

async function seedLinkedUsers(backend: ReturnType<typeof testBackend>) {
  return await backend.run(async (ctx) => {
    const now = Date.now();
    const caregiverA = await ctx.db.insert("users", {
      clerkId: "caregiver-a",
      role: "caregiver",
      name: "Caregiver A",
      timezone: "UTC",
      allergies: [],
      createdAt: now,
      updatedAt: now,
    });
    const caregiverB = await ctx.db.insert("users", {
      clerkId: "caregiver-b",
      role: "caregiver",
      name: "Caregiver B",
      timezone: "UTC",
      allergies: [],
      createdAt: now,
      updatedAt: now,
    });
    const seniorA = await ctx.db.insert("users", {
      clerkId: "senior-a",
      role: "senior",
      name: "Senior A",
      timezone: "UTC",
      allergies: [],
      createdAt: now,
      updatedAt: now,
    });
    const seniorB = await ctx.db.insert("users", {
      clerkId: "senior-b",
      role: "senior",
      name: "Senior B",
      timezone: "UTC",
      allergies: [],
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("caregiverLinks", { caregiverId: caregiverA, seniorId: seniorA, createdAt: now });
    await ctx.db.insert("caregiverLinks", { caregiverId: caregiverB, seniorId: seniorB, createdAt: now });
    const sessionA = await ctx.db.insert("sessions", { seniorId: seniorA, status: "active", startedAt: now });
    const sessionB = await ctx.db.insert("sessions", { seniorId: seniorB, status: "active", startedAt: now });
    const medicationA = await ctx.db.insert("medications", {
      seniorId: seniorA,
      name: "Medicine A",
      dosage: "1 tablet",
      instructions: "Morning",
      schedule: [{ daysOfWeek: [1], times: ["08:00"] }],
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    const medicationB = await ctx.db.insert("medications", {
      seniorId: seniorB,
      name: "Medicine B",
      dosage: "2 tablets",
      instructions: "Evening",
      schedule: [{ daysOfWeek: [1], times: ["20:00"] }],
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("emergencyContacts", {
      seniorId: seniorA,
      name: "Contact A",
      relationship: "Family",
      phone: "111",
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("emergencyContacts", {
      seniorId: seniorB,
      name: "Contact B",
      relationship: "Family",
      phone: "222",
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    });
    const billA = await ctx.db.insert("bills", {
      seniorId: seniorA,
      payee: "Payee A",
      description: "Bill A",
      amountCents: 1000,
      dueAt: now,
      status: "unpaid",
      createdAt: now,
      updatedAt: now,
    });
    const billB = await ctx.db.insert("bills", {
      seniorId: seniorB,
      payee: "Payee B",
      description: "Bill B",
      amountCents: 2000,
      dueAt: now,
      status: "unpaid",
      createdAt: now,
      updatedAt: now,
    });
    return { caregiverA, caregiverB, seniorA, seniorB, sessionA, sessionB, medicationA, medicationB, billA, billB };
  });
}

describe("role and caregiver-link authorization", () => {
  it("rejects caregiver-only operations for a senior role", async () => {
    const backend = testBackend();
    await seedLinkedUsers(backend);
    const senior = withRole(backend, "senior-a", "senior");
    await expect(senior.mutation(api.users.createSenior, {
      profile: { name: "Unauthorized", timezone: "UTC", allergies: [] },
    })).rejects.toThrow();
  });

  it("allows caregiver A to access their linked senior and denies caregiver B", async () => {
    const backend = testBackend();
    const users = await seedLinkedUsers(backend);
    const caregiverA = withRole(backend, "caregiver-a", "caregiver");
    const caregiverB = withRole(backend, "caregiver-b", "caregiver");

    const profile = await caregiverA.query(api.users.getSeniorProfile, { seniorId: users.seniorA });
    expect(profile.name).toBe("Senior A");
    await expect(caregiverB.query(api.users.getSeniorProfile, { seniorId: users.seniorA })).rejects.toThrow();
  });
});

describe("pairing-code claim protection", () => {
  async function seedPairingCode(backend: ReturnType<typeof testBackend>, expiresAt: number) {
    return await backend.run(async (ctx) => {
      const now = Date.now();
      const caregiverId = await ctx.db.insert("users", {
        clerkId: "pairing-caregiver",
        role: "caregiver",
        name: "Caregiver",
        timezone: "UTC",
        allergies: [],
        createdAt: now,
        updatedAt: now,
      });
      const seniorId = await ctx.db.insert("users", {
        role: "senior",
        name: "Pairing Senior",
        timezone: "UTC",
        allergies: [],
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("caregiverLinks", { caregiverId, seniorId, createdAt: now });
      const pairingCodeId = await ctx.db.insert("pairingCodes", {
        seniorId,
        createdByCaregiverId: caregiverId,
        codeHash: "pairing-hash",
        createdAt: now,
        expiresAt,
      });
      return { seniorId, pairingCodeId };
    });
  }

  it("rejects an expired pairing code", async () => {
    const backend = testBackend();
    await seedPairingCode(backend, Date.now() - 1);
    await expect(backend.mutation(internal.pairingInternal.consumePairingCode, {
      codeHash: "pairing-hash",
      clerkId: "claimant-a",
    })).rejects.toThrow(/invalid or expired/u);
  });

  it("is single-use across claimants while allowing the same claimant to retry", async () => {
    const backend = testBackend();
    const { seniorId } = await seedPairingCode(backend, Date.now() + 60_000);
    const input = { codeHash: "pairing-hash", clerkId: "claimant-a" };
    expect(await backend.mutation(internal.pairingInternal.consumePairingCode, input)).toBe(seniorId);
    expect(await backend.mutation(internal.pairingInternal.consumePairingCode, input)).toBe(seniorId);
    await expect(backend.mutation(internal.pairingInternal.consumePairingCode, {
      codeHash: "pairing-hash",
      clerkId: "claimant-b",
    })).rejects.toThrow(/already been used/u);
  });

  it("allows only one claimant in a concurrent double-claim", async () => {
    const backend = testBackend();
    await seedPairingCode(backend, Date.now() + 60_000);
    const outcomes = await Promise.allSettled([
      backend.mutation(internal.pairingInternal.consumePairingCode, { codeHash: "pairing-hash", clerkId: "claimant-a" }),
      backend.mutation(internal.pairingInternal.consumePairingCode, { codeHash: "pairing-hash", clerkId: "claimant-b" }),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
  });
});

describe("session-bound LLM tool data access", () => {
  it("returns only the active session senior's records and rejects cross-senior reads and writes", async () => {
    const backend = testBackend();
    const users = await seedLinkedUsers(backend);

    const medications = await backend.query(internal.medications.listForActiveSession, {
      sessionId: users.sessionA,
      actorId: users.seniorA,
    });
    expect(medications.map((medication) => medication.name)).toEqual(["Medicine A"]);
    const contacts = await backend.query(internal.emergencyContacts.listForActiveSession, {
      sessionId: users.sessionA,
      actorId: users.seniorA,
    });
    expect(contacts.map((contact) => contact.name)).toEqual(["Contact A"]);
    const bills = await backend.query(internal.bills.listUnpaidForActiveSession, {
      sessionId: users.sessionA,
      actorId: users.seniorA,
    });
    expect(bills.map((bill) => bill.payee)).toEqual(["Payee A"]);
    const context = await backend.query(internal.sessions.getContextForVoice, {
      sessionId: users.sessionA,
      actorId: users.seniorA,
    });
    expect(context.senior._id).toBe(users.seniorA);
    expect(context.medications.every((medication) => medication.seniorId === users.seniorA)).toBe(true);

    await expect(backend.query(internal.medications.listForActiveSession, {
      sessionId: users.sessionB,
      actorId: users.seniorA,
    })).rejects.toThrow();
    await expect(backend.query(internal.emergencyContacts.listForActiveSession, {
      sessionId: users.sessionB,
      actorId: users.seniorA,
    })).rejects.toThrow();
    await expect(backend.query(internal.bills.listUnpaidForActiveSession, {
      sessionId: users.sessionB,
      actorId: users.seniorA,
    })).rejects.toThrow();
    await expect(backend.query(internal.sessions.getContextForVoice, {
      sessionId: users.sessionB,
      actorId: users.seniorA,
    })).rejects.toThrow();

    await expect(backend.mutation(internal.medications.logFromActiveSession, {
      sessionId: users.sessionA,
      actorId: users.seniorA,
      medicationId: users.medicationB,
      status: "taken",
    })).rejects.toThrow();
    await expect(backend.mutation(internal.medications.logFromActiveSession, {
      sessionId: users.sessionB,
      actorId: users.seniorA,
      medicationId: users.medicationB,
      status: "taken",
    })).rejects.toThrow();
    await expect(backend.mutation(internal.bills.markPaidFromActiveSession, {
      sessionId: users.sessionA,
      actorId: users.seniorA,
      billId: users.billB,
    })).rejects.toThrow();
    await expect(backend.mutation(internal.bills.markPaidFromActiveSession, {
      sessionId: users.sessionB,
      actorId: users.seniorA,
      billId: users.billB,
    })).rejects.toThrow();
    await expect(backend.mutation(internal.voiceRateLimit.reserveRequest, {
      sessionId: users.sessionB,
      actorId: users.seniorA,
    })).rejects.toThrow();
    expect(users.medicationA).toBeDefined();
    expect(users.billA).toBeDefined();
  });
});

describe("voice rate limiting and emergency alerts", () => {
  it("allows 30 non-emergency reservations in a 10-minute window and then rejects", async () => {
    const backend = testBackend();
    const users = await seedLinkedUsers(backend);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    try {
      for (let index = 0; index < 30; index += 1) {
        await backend.mutation(internal.voiceRateLimit.reserveRequest, {
          sessionId: users.sessionA,
          actorId: users.seniorA,
        });
      }
      await expect(backend.mutation(internal.voiceRateLimit.reserveRequest, {
        sessionId: users.sessionA,
        actorId: users.seniorA,
      })).rejects.toThrow(/limit reached/u);
      vi.advanceTimersByTime(10 * 60 * 1000);
      await expect(backend.mutation(internal.voiceRateLimit.reserveRequest, {
        sessionId: users.sessionA,
        actorId: users.seniorA,
      })).resolves.toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("records and speaks a fixed emergency response without consuming a rate-limit slot", async () => {
    const backend = testBackend();
    const users = await seedLinkedUsers(backend);
    const audioStorageId = await backend.run(async (ctx) => {
      const storageId = await ctx.storage.store(new Blob(["test audio"]));
      const now = Date.now();
      await ctx.db.insert("voiceUploads", {
        seniorId: users.seniorA,
        sessionId: users.sessionA,
        storageId,
        uploadedAt: now,
        expiresAt: now + 60_000,
      });
      return storageId;
    });
    const fetchMock: typeof fetch = async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/speech-to-text")) {
        return new Response(JSON.stringify({ text: "I fell near the door." }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/text-to-speech/")) return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      return new Response(new Uint8Array([4, 5, 6]), { status: 200 });
    };
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
    vi.stubEnv("ELEVENLABS_VOICE_ID", "test-voice");
    vi.stubGlobal("fetch", fetchMock);
    try {
      const senior = withRole(backend, "senior-a", "senior");
      const result = await senior.action(api.voice.processVoiceTurn, {
        sessionId: users.sessionA,
        audioStorageId,
      });
      expect(result.text).toBe("Please call emergency services now, or contact your emergency contact. I will stay here with you.");
      const alerts = await backend.run(async (ctx) => await ctx.db.query("alerts")
        .withIndex("by_senior", (q) => q.eq("seniorId", users.seniorA)).collect());
      const rateLimits = await backend.run(async (ctx) => await ctx.db.query("voiceRateLimits")
        .withIndex("by_senior", (q) => q.eq("seniorId", users.seniorA)).collect());
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.matchedPhrases).toEqual(["I fell"]);
      expect(rateLimits).toHaveLength(0);
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it("limits alert acknowledgement to linked caregivers and removes acknowledged alerts from the banner query", async () => {
    const backend = testBackend();
    const users = await seedLinkedUsers(backend);
    const alertId = await backend.run(async (ctx) => await ctx.db.insert("alerts", {
      seniorId: users.seniorA,
      sessionId: users.sessionA,
      matchedPhrases: ["I fell"],
      excerpt: "I fell near the door.",
      createdAt: Date.now(),
    }));
    const caregiverA = withRole(backend, "caregiver-a", "caregiver");
    const caregiverB = withRole(backend, "caregiver-b", "caregiver");
    await expect(caregiverB.mutation(api.alerts.acknowledge, { alertId })).rejects.toThrow();
    expect(await caregiverA.query(api.alerts.listUnacknowledgedForSenior, { seniorId: users.seniorA })).toHaveLength(1);
    await caregiverA.mutation(api.alerts.acknowledge, { alertId });
    expect(await caregiverA.query(api.alerts.listUnacknowledgedForSenior, { seniorId: users.seniorA })).toHaveLength(0);
  });
});

describe("session completion and analysis idempotency", () => {
  it("allows only the session's own senior to complete and stores one analysis on repeated requests", async () => {
    const backend = testBackend();
    const users = await seedLinkedUsers(backend);
    await expect(backend.mutation(internal.sessions.completeForActor, {
      sessionId: users.sessionB,
      actorId: users.seniorA,
    })).rejects.toThrow();
    await backend.mutation(internal.sessions.completeForActor, {
      sessionId: users.sessionA,
      actorId: users.seniorA,
    });
    await backend.mutation(internal.sessions.completeForActor, {
      sessionId: users.sessionA,
      actorId: users.seniorA,
    });

    const computed = analyzeCognitiveTranscript(["Today I went to the park and enjoyed a quiet walk."]);
    const analysisArgs = {
      sessionId: users.sessionA,
      actorId: users.seniorA,
      riskScore: computed.riskScore,
      band: computed.band,
      sampleAdequate: computed.metrics.sampleAdequate,
      metrics: computed.metrics,
      markers: computed.markers,
      interpretation: "Fallback interpretation.",
      suggestions: ["Keep familiar routines.", "Talk with a clinician if changes persist."],
    };
    const first = await backend.mutation(internal.analyses.storeIfMissing, analysisArgs);
    const second = await backend.mutation(internal.analyses.storeIfMissing, analysisArgs);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.analysisId).toBe(first.analysisId);
    const analyses = await backend.run(async (ctx) => await ctx.db.query("analyses")
      .withIndex("by_session", (q) => q.eq("sessionId", users.sessionA)).collect());
    expect(analyses).toHaveLength(1);
  });

  it("completes and analyzes once when the public end action is retried", async () => {
    const backend = testBackend();
    const users = await seedLinkedUsers(backend);
    const senior = withRole(backend, "senior-a", "senior");
    const transcript = Array.from({ length: 60 }, (_, index) => `word${index}`).join(" ");
    await backend.run(async (ctx) => {
      await ctx.db.insert("messages", {
        sessionId: users.sessionA,
        seniorId: users.seniorA,
        role: "user",
        text: transcript,
        createdAt: Date.now(),
      });
    });

    vi.stubEnv("OPENROUTER_API_KEY", "");
    try {
      await senior.action(api.sessions.end, { sessionId: users.sessionA });
      const firstCompletion = await backend.run(async (ctx) => await ctx.db.get(users.sessionA));
      await senior.action(api.sessions.end, { sessionId: users.sessionA });
      const secondCompletion = await backend.run(async (ctx) => await ctx.db.get(users.sessionA));
      const analyses = await backend.run(async (ctx) => await ctx.db.query("analyses")
        .withIndex("by_session", (q) => q.eq("sessionId", users.sessionA)).collect());

      expect(firstCompletion?.status).toBe("completed");
      expect(secondCompletion?.completedAt).toBe(firstCompletion?.completedAt);
      expect(analyses).toHaveLength(1);
      expect(analyses[0]?.interpretation).toContain("screening");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
