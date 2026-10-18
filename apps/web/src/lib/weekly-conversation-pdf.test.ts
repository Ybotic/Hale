import { describe, expect, it } from "bun:test";
import type { Conversation } from "@hale/contracts";
import { demoSpace, DEMO_TODAY } from "@hale/contracts/demo";
import { shiftDate } from "@hale/contracts/time";
import { buildDemoWeeklyAiSummary, buildWeeklyConversationPdf, findRepeatedQuestionPhrases } from "./weekly-conversation-pdf";

function conversation(id: string, day: string, text: string): Conversation {
  return {
    id,
    title: `Conversation ${id}`,
    summary: "Transcript available.",
    startedAt: `${day}T12:00:00.000Z`,
    duration: 120,
    people: [],
    state: "ready",
    turns: [{ id: `turn-${id}`, speaker: "Unknown", start: 0, end: 4, text, uncertain: true }],
    audioAvailable: false,
    synthetic: true,
  };
}

describe("weekly conversation PDF", () => {
  it("creates a valid PDF from the selected week of transcript fixtures", async () => {
    const fromDay = shiftDate(DEMO_TODAY, -6);
    const bytes = await buildWeeklyConversationPdf({
      name: demoSpace.name,
      timezone: demoSpace.timezone,
      people: demoSpace.people,
      conversations: demoSpace.conversations,
      memories: demoSpace.memories,
      fromDay,
      throughDay: DEMO_TODAY,
      limited: false,
      demo: true,
      aiSummary: buildDemoWeeklyAiSummary(demoSpace),
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("reports exact question wording repeated across separate conversations with source dates", () => {
    const repeated = findRepeatedQuestionPhrases([
      conversation("first", "2026-10-14", "Where did I leave my keys?"),
      conversation("second", "2026-10-15", "Where did I leave my keys?"),
      conversation("third", "2026-10-16", "We went out for lunch."),
    ], "UTC");
    expect(repeated).toHaveLength(1);
    expect(repeated[0].occurrences).toBe(2);
    expect(repeated[0].sources.map((source) => source.date)).toEqual(["2026-10-14", "2026-10-15"]);
  });
});
