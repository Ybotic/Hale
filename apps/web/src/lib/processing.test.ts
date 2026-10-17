import { describe, expect, test } from "bun:test";
import { mergeTranscriptAndSpeakers, parseWhisperSegments, validateDailySummary, validateMemoryCandidates } from "./processing";

describe("memory processing data guards", () => {
  test("parses timestamped Whisper segments and falls back to one source segment", () => {
    expect(parseWhisperSegments({ text: "whole", segments: [{ start: 0.2, end: 1.4, text: " hello " }] }, 4)).toEqual([
      { start: 0.2, end: 1.4, text: "hello" },
    ]);
    expect(parseWhisperSegments({ text: "whole transcript" }, 3)).toEqual([{ start: 0, end: 3, text: "whole transcript" }]);
    expect(() => parseWhisperSegments({ text: "", segments: [] }, 3)).toThrow("no transcript text");
  });

  test("matches only overlapping diarization turns with a consented, above-threshold voiceprint", () => {
    const transcript = [{ start: 1, end: 3, text: "Hello" }, { start: 5, end: 6, text: "Unknown" }];
    const turns = mergeTranscriptAndSpeakers({
      transcript,
      diarization: [{ start: 0, end: 3.5, speaker: "SPEAKER_00" }, { start: 4, end: 7, speaker: "SPEAKER_01" }],
      identities: [{ start: 0, end: 3.5, diarizationSpeaker: "SPEAKER_00", match: "person-1" }],
      confidences: [{ speaker: "SPEAKER_00", confidence: { "person-1": 88 } }],
      voices: [{ personId: "person-1", name: "Alex" }],
      threshold: 70,
    });
    expect(turns[0]).toMatchObject({ speaker: "Alex", personId: "person-1", uncertain: false, confidence: 88 });
    expect(turns[1]).toMatchObject({ speaker: "Unknown speaker", uncertain: true });
  });

  test("drops Backboard memories with missing or invented source-turn references", () => {
    const memories = validateMemoryCandidates({ memories: [
      { kind: "plan", title: "Lunch", text: "Alex plans to meet next week.", localDate: "2026-10-16", plannedFor: "2026-10-20", turnIds: ["turn-1"], people: ["person-1", "invented"] },
      { kind: "reported_activity", title: "Unsupported", text: "No source", localDate: "2026-10-16", turnIds: ["invented"], people: [] },
    ] }, [{ id: "turn-1", personId: "person-1" }], "2026-10-16");
    expect(memories).toEqual([{
      kind: "plan", title: "Lunch", text: "Alex plans to meet next week.", localDate: "2026-10-16",
      plannedFor: "2026-10-20", occurredAt: undefined, turnIds: ["turn-1"], people: ["person-1"],
    }]);
  });

  test("rejects daily summaries that cite a turn outside the supplied day", () => {
    expect(() => validateDailySummary({ summary: "A summary", turnIds: ["other-day"] }, ["turn-1"])).toThrow("unsupported source references");
  });
});
