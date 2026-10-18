import { describe, expect, it } from "bun:test";
import { parseWeeklyAiSummary } from "./weekly-summary-policy";

describe("weekly AI summary validation", () => {
  const allowed = new Set(["turn-1", "turn-2"]);

  it("keeps only source-cited summary items", () => {
    const result = parseWeeklyAiSummary(JSON.stringify({
      overview: { text: "The week includes conversations about family visits and a garden walk.", turnIds: ["turn-1"] },
      highlights: [
        { title: "A garden walk", text: "A walk by the lake was described.", turnIds: ["turn-2"] },
        { title: "Unsupported", text: "This invented turn is not a source.", turnIds: ["missing-turn"] },
      ],
      plans: [{ text: "A family visit was mentioned for Saturday.", turnIds: ["turn-1"] }],
    }), allowed);
    expect(result?.highlights).toHaveLength(1);
    expect(result?.plans).toHaveLength(1);
  });

  it("rejects a summary that makes a disease or diagnosis claim", () => {
    const result = parseWeeklyAiSummary(JSON.stringify({
      overview: { text: "These words show signs of amnesia.", turnIds: ["turn-1"] },
      highlights: [],
      plans: [],
    }), allowed);
    expect(result).toBeUndefined();
  });

  it("rejects malformed JSON and empty sources", () => {
    expect(parseWeeklyAiSummary("not json", allowed)).toBeUndefined();
    expect(parseWeeklyAiSummary(JSON.stringify({ overview: { text: "A short overview", turnIds: [] } }), allowed)).toBeUndefined();
  });
});
