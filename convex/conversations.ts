import { v, ConvexError } from "convex/values";
import type { PatientSpace } from "@hale/contracts";
import { query, type QueryCtx, type DataModel } from "./lib/functions";
import type { GenericId } from "convex/values";
import { requireMember } from "./authz";
import { isLocalDate } from "@hale/contracts/time";

export async function loadSpace(ctx: QueryCtx, patientId: GenericId<"patients">, options: { day?: string; includeTurns?: boolean } = {}): Promise<{ space: PatientSpace; limited: boolean }> {
    const { patient, membership } = await requireMember(ctx, patientId, "memories:read");
    const conversations = await ctx.db.query("conversations").withIndex("by_patient_date", (q) => options.day ? q.eq("patientId", patientId).eq("localDate", options.day) : q.eq("patientId", patientId)).order("desc").take(101);
    const people = await ctx.db.query("people").withIndex("by_patient", (q) => q.eq("patientId", patientId)).take(100);
    const memories = await ctx.db.query("memories").withIndex("by_patient_date", (q) => options.day ? q.eq("patientId", patientId).eq("localDate", options.day) : q.eq("patientId", patientId)).order("desc").take(501);
    const visible = conversations.slice(0, 100).filter((conversation) => !conversation.deletedAt);
    const visibleIds = new Set(visible.map((item) => item._id));
    let limited = conversations.length > 100 || memories.length > 500;
    let budget = 500;
    const records: PatientSpace["conversations"] = [];
    for (const conversation of visible) {
      const record = conversationRecord(conversation);
      if (options.includeTurns && conversation.state === "ready") {
        if (budget === 0) limited = true;
        else {
          const turns = await ctx.db.query("transcriptTurns").withIndex("by_conversation", (q) => q.eq("conversationId", conversation._id)).take(Math.min(budget, 100) + 1);
          const included = turns.slice(0, Math.min(budget, 100));
          limited ||= turns.length > included.length;
          budget -= included.length;
          record.turns = included.filter((turn) => turn.patientId === patientId).map((turn) => ({ id: turn._id, speaker: turn.speaker, personId: turn.personId, start: turn.start, end: turn.end, text: turn.text, uncertain: turn.uncertain }));
        }
      }
      records.push(record);
    }
    return { limited, space: {
      id: patientId, name: patient.name, timezone: patient.timezone,
      capabilities: membership.capabilities as PatientSpace["capabilities"],
      people: people.map((person) => ({ id: person._id, name: person.name, relationship: person.relationship, enrollment: person.enrollment, initials: person.name.split(" ").map((part) => part[0]).slice(0, 2).join(""), color: "green" })),
      conversations: records,
      memories: memories.slice(0, 500).filter((memory) => visibleIds.has(memory.conversationId)).map((memory) => ({
        id: memory._id, kind: memory.kind, title: memory.title, text: memory.text,
        localDate: memory.localDate, plannedFor: memory.plannedFor, occurredAt: memory.occurredAt,
        conversationId: memory.conversationId, turnIds: memory.turnIds, people: memory.people,
      })),
    } };
}

function conversationRecord(conversation: DataModel["conversations"]["document"]): PatientSpace["conversations"][number] {
  return { id: conversation._id, title: conversation.title, summary: conversation.summary, startedAt: new Date(conversation.startedAt).toISOString(), duration: conversation.duration, people: conversation.people, state: conversation.state, turns: [], audioAvailable: false, synthetic: false };
}

export const space = query({
  args: { patientId: v.id("patients") },
  handler: async (ctx, { patientId }) => (await loadSpace(ctx, patientId)).space,
});

export const search = query({
  args: { patientId: v.id("patients"), text: v.string(), day: v.optional(v.string()), personId: v.optional(v.string()) },
  handler: async (ctx, { patientId, text, day, personId }) => {
    await requireMember(ctx, patientId, "memories:read");
    const term = text.trim();
    if (term.length > 200) throw new ConvexError("Search must be at most 200 characters.");
    if (day !== undefined && !isLocalDate(day)) throw new ConvexError("Choose a valid calendar day.");
    const recent = await ctx.db.query("conversations").withIndex("by_patient_date", (q) => day ? q.eq("patientId", patientId).eq("localDate", day) : q.eq("patientId", patientId)).order("desc").take(101);
    const matches = new Map(recent.filter((item) => !term || `${item.title} ${item.summary}`.toLocaleLowerCase().includes(term.toLocaleLowerCase())).map((item) => [item._id, item]));
    let limited = recent.length > 100;
    if (term) {
      const turns = await ctx.db.query("transcriptTurns").withSearchIndex("search_text", (q) => q.search("text", term).eq("patientId", patientId)).take(101);
      const memories = await ctx.db.query("memories").withSearchIndex("search_text", (q) => q.search("text", term).eq("patientId", patientId)).take(101);
      limited ||= turns.length > 100 || memories.length > 100;
      for (const id of new Set([...turns.slice(0, 100), ...memories.slice(0, 100)].map((item) => item.conversationId))) {
        const conversation = await ctx.db.get(id);
        if (conversation?.patientId === patientId) matches.set(id, conversation);
      }
    }
    const visible = [...matches.values()].filter((item) => !item.deletedAt && (!day || item.localDate === day) && (!personId || item.people.some((id) => id === personId))).sort((a, b) => b.startedAt - a.startedAt);
    return { conversations: visible.slice(0, 100).map(conversationRecord), limited: limited || visible.length > 100 };
  },
});

export const detail = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const conversation = await ctx.db.get(conversationId);
    if (!conversation || conversation.deletedAt) throw new ConvexError("Conversation unavailable.");
    await requireMember(ctx, conversation.patientId, "memories:read");
    const turns = await ctx.db.query("transcriptTurns").withIndex("by_conversation", (q) => q.eq("conversationId", conversationId)).take(500);
    const chunk = await ctx.db.get(conversation.chunkId);
    const audioUrl = chunk?.patientId === conversation.patientId && chunk.storageId && !chunk.deletedAt && chunk.expiresAt > Date.now() ? await ctx.storage.getUrl(chunk.storageId) : null;
    const memories = await ctx.db.query("memories").withIndex("by_conversation", (q) => q.eq("conversationId", conversationId)).take(100);
    return {
      patientId: conversation.patientId,
      conversation: conversationRecord(conversation),
      memories: memories.filter((memory) => memory.patientId === conversation.patientId).map((memory) => ({ id: memory._id, kind: memory.kind, title: memory.title, text: memory.text, localDate: memory.localDate, plannedFor: memory.plannedFor, occurredAt: memory.occurredAt, conversationId: memory.conversationId, turnIds: memory.turnIds, people: memory.people })),
      turns: turns.filter((turn) => turn.patientId === conversation.patientId).map((turn) => ({ id: turn._id, speaker: turn.speaker, personId: turn.personId, start: turn.start, end: turn.end, text: turn.text, uncertain: turn.uncertain })),
      audioUrl,
    };
  },
});
