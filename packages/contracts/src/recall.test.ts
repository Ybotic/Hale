import { describe, expect, test } from "bun:test";
import { demoSpace, DEMO_TODAY } from "./demo";
import { recallDemo } from "./recall";
import { isLocalDate, localDate, resolveDayQuestion, shiftDate } from "./time";

describe("evidence-backed demo recall", () => {
  test("keeps Sunday as a plan and cites the actual speaker turn", () => {
    const answer = recallDemo(demoSpace, "What did we discuss about Sunday?", DEMO_TODAY);
    expect(answer.text).toContain("would bring");
    expect(answer.text).not.toContain("brought the old family");
    expect(answer.citations[0].turnId).toBe("lunch-4");
  });
  test("cannot invent evidence for missing keys", () => {
    expect(recallDemo(demoSpace, "Where did I leave my keys?", DEMO_TODAY).insufficient).toBe(true);
  });
  test("never claims a recording establishes a physical encounter", () => {
    const answer = recallDemo(demoSpace, "Who did I meet today?", DEMO_TODAY);
    expect(answer.text).toContain("doesn’t establish");
    expect(answer.text).toContain("Grace");
    expect(answer.text).toContain("Daniel");
    expect(answer.citations).toHaveLength(2);
  });
  test("yesterday does not leak today's sources", () => {
    const answer = recallDemo(demoSpace, "What did I do yesterday?", DEMO_TODAY);
    expect(answer.citations.every((citation) => citation.conversationId === "wednesday-walk")).toBe(true);
    expect(answer.text).toContain("lake");
  });
  test("selected-day scope cannot be overridden by question text", () => {
    const answer = recallDemo(demoSpace, "What did I do today?", DEMO_TODAY, "2026-10-14");
    expect(answer.citations.every((citation) => citation.conversationId === "wednesday-walk")).toBe(true);
  });
  test("generated answers contain only valid source references", () => {
    for (const question of ["What did I do today?", "What about Sunday?", "What did Grace say?", "Who did I meet?", "What about the soup?"]) {
      const answer = recallDemo(demoSpace, question, DEMO_TODAY);
      for (const citation of answer.citations) {
        const conversation = demoSpace.conversations.find((item) => item.id === citation.conversationId);
        expect(conversation?.turns.some((turn) => turn.id === citation.turnId && turn.text === citation.excerpt)).toBe(true);
      }
    }
  });
  test("deleting sources removes them from subsequent answers", () => {
    const removed = new Set(["garden-lunch", "sunday-photos"]);
    const space = {
      ...demoSpace,
      conversations: demoSpace.conversations.filter((item) => !removed.has(item.id)),
      memories: demoSpace.memories.filter((item) => !removed.has(item.conversationId)),
    };
    expect(recallDemo(space, "What about the photo album on Sunday?", DEMO_TODAY).insufficient).toBe(true);
    expect(recallDemo(space, "What did Grace say about Sunday?", DEMO_TODAY).insufficient).toBe(true);
  });
  test("a person name alone cannot make an unrelated topic relevant", () => {
    expect(recallDemo(demoSpace, "What did Grace say about my keys?", DEMO_TODAY).insufficient).toBe(true);
  });
  test("the noun book is not mistaken for a booking request", () => {
    const answer = recallDemo(demoSpace, "What book did Daniel mention?", DEMO_TODAY);
    expect(answer.text).toContain("book about the coast");
  });
  test("a question about medication never becomes a dose recommendation", () => {
    const answer = recallDemo(demoSpace, "Should I take another dose?", DEMO_TODAY);
    expect(answer.insufficient).toBe(true);
    expect(answer.text).toContain("pharmacist");
  });
  test("empty days are unknown, not evidence of inactivity", () => {
    const answer = recallDemo(demoSpace, "What did I do today?", DEMO_TODAY, "2026-10-08");
    expect(answer.insufficient).toBe(true);
    expect(answer.text).toContain("doesn’t mean");
  });
  test("last week is scoped to the seven completed local dates before today", () => {
    const answer = recallDemo(demoSpace, "What did I do last week?", DEMO_TODAY);
    expect(answer.insufficient).toBe(false);
    expect(answer.citations.length).toBeGreaterThan(0);
    expect(answer.citations.every((citation) => citation.conversationId !== "garden-lunch" && citation.conversationId !== "morning-call")).toBe(true);
  });
  test("unsupported older ranges are explicit instead of querying every date", () => {
    const answer = recallDemo(demoSpace, "What happened last month?", DEMO_TODAY);
    expect(answer.insufficient).toBe(true);
    expect(answer.citations).toHaveLength(0);
  });
  test("orphaned memories never produce an uncited answer", () => {
    const space = { ...demoSpace, conversations: demoSpace.conversations.map((conversation) => ({ ...conversation, turns: [] })) };
    const answer = recallDemo(space, "What about Sunday?", DEMO_TODAY);
    expect(answer.insufficient).toBe(true);
    expect(answer.citations).toHaveLength(0);
  });
  test("uncertain attribution is not a confirmed familiar voice", () => {
    const space = { ...demoSpace, conversations: demoSpace.conversations.map((conversation) => ({ ...conversation, turns: conversation.turns.map((turn) => ({ ...turn, uncertain: true })) })) };
    expect(recallDemo(space, "Who did I meet today?", DEMO_TODAY).insufficient).toBe(true);
  });
  test("names containing regular-expression characters cannot crash recall", () => {
    const space = { ...demoSpace, people: [...demoSpace.people, { ...demoSpace.people[0], id: "special", name: "[ Fictional" }] };
    expect(() => recallDemo(space, "What about Sunday?", DEMO_TODAY)).not.toThrow();
  });
  test("urgent requests direct to real help without claiming anyone was contacted", () => {
    for (const question of ["This is an emergency", "I have chest pain", "I can't breathe"]) {
      const answer = recallDemo(demoSpace, question, DEMO_TODAY);
      expect(answer.text).toContain("local emergency number");
      expect(answer.text).toContain("has not contacted anyone");
      expect(answer.citations).toHaveLength(0);
    }
  });
});

describe("patient-local date handling", () => {
  test("invalid dates cannot silently roll into another calendar day", () => {
    expect(isLocalDate("2026-02-31")).toBe(false);
    expect(isLocalDate("2026-13-01")).toBe(false);
    expect(isLocalDate("2026-02-28")).toBe(true);
    expect(isLocalDate("2028-02-29")).toBe(true);
  });
  test("UTC midnight does not change a New York patient's day", () => {
    expect(localDate("2026-10-15T01:00:00Z", "America/New_York")).toBe("2026-10-14");
  });
  test("calendar arithmetic handles year changes and daylight saving", () => {
    expect(shiftDate("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftDate("2026-03-08", 1)).toBe("2026-03-09");
    expect(localDate("2026-11-01T05:30:00Z", "America/New_York")).toBe("2026-11-01");
    expect(localDate("2026-11-01T06:30:00Z", "America/New_York")).toBe("2026-11-01");
  });
  test("fixed scope wins over relative dates", () => {
    expect(resolveDayQuestion("yesterday", "2026-10-15", "2026-10-13")).toBe("2026-10-13");
  });
});
