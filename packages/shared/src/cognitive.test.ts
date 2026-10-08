import { describe, expect, it } from "vitest";
import {
  analyzeCognitiveTranscript,
  calculateCognitiveTrend,
  calculateFillerWordRate,
  calculateMovingAverageTypeTokenRatio,
  calculatePronounRatios,
  calculateTypeTokenRatio,
  countFalseStarts,
  countHapaxLegomena,
  countImmediateWordRepetitions,
  countPauseMarkers,
  countUniqueWords,
  detectEmergencyPhrases,
  findRepeatedStatements,
  findWordFindingPhrases,
  tokenizeTranscript,
} from "./cognitive";

describe("transcript metrics", () => {
  it("calculates unique words, hapax legomena, TTR, and moving-average TTR", () => {
    const words = tokenizeTranscript("Bird sings. Bird rests; fox runs.");
    expect(words).toEqual(["bird", "sings", "bird", "rests", "fox", "runs"]);
    expect(countUniqueWords(words)).toBe(5);
    expect(countHapaxLegomena(words)).toBe(4);
    expect(calculateTypeTokenRatio(words)).toBeCloseTo(5 / 6);
    expect(calculateTypeTokenRatio([])).toBeNull();

    const moving = calculateMovingAverageTypeTokenRatio(["a", "b", "a", "c", "d", "e"], 3, 2);
    expect(moving.windowCount).toBe(2);
    expect(moving.value).toBeCloseTo(5 / 6);
    expect(calculateMovingAverageTypeTokenRatio(["a", "b"], 3, 1)).toEqual({ value: null, windowCount: 0 });
  });

  it("counts filler words and their token rate", () => {
    expect(calculateFillerWordRate("Um, I, uh, think so. You know?", 7)).toEqual({ count: 3, rate: 3 / 7 });
    expect(calculateFillerWordRate("", 0)).toEqual({ count: 0, rate: 0 });
  });

  it("detects false starts and adjacent repeated words case-insensitively", () => {
    expect(countFalseStarts("I wa- I was going to th— the store.")).toBe(2);
    expect(countImmediateWordRepetitions("I, I think think we can go.")).toBe(2);
  });

  it("computes overall and generic-pronoun ratios", () => {
    expect(calculatePronounRatios(["I", "saw", "it", "thing", "stuff", "there"])).toEqual({
      pronounCount: 2,
      pronounRatio: 2 / 6,
      genericPronounCount: 3,
      genericPronounRatio: 3 / 6,
    });
    expect(calculatePronounRatios([])).toEqual({
      pronounCount: 0,
      pronounRatio: 0,
      genericPronounCount: 0,
      genericPronounRatio: 0,
    });
  });

  it("finds word-finding phrases, pause markers, and repeated statements", () => {
    expect(findWordFindingPhrases("What's it called? That thing. I'm not sure.")).toHaveLength(3);
    expect(countPauseMarkers("I… [pause] (long pause) <break time=\"1s\"/> yes...")).toBe(5);
    expect(findRepeatedStatements(["I went to the store today. It was a nice day.", "I went to the store today."])).toEqual({
      count: 1,
      repeatedTexts: ["I went to the store today."],
    });
  });

  it("produces weighted flags, neutral bands, and evidence excerpts", () => {
    const result = analyzeCognitiveTranscript([
      "Um, um, I I saw it, that thing. What's it called? [pause]",
      "I am not sure. What's it called? I went to the store today.",
      "I went to the store today.",
    ]);
    expect(result.band).toBe("many_flags");
    expect(result.riskScore).toBeGreaterThan(0);
    expect(result.metrics.uniqueWords).toBeGreaterThan(0);
    expect(result.metrics.hapaxLegomena).toBeGreaterThan(0);
    expect(result.metrics.fillerWordCount).toBe(2);
    expect(result.metrics.immediateRepetitionCount).toBe(2);
    expect(result.metrics.wordFindingPhraseCount).toBe(4);
    expect(result.metrics.pauseMarkerCount).toBe(1);
    expect(result.metrics.repeatedStatementCount).toBe(1);
    expect(result.markers.filter((marker) => marker.flagged).every((marker) => marker.evidence.length > 0)).toBe(true);

    expect(analyzeCognitiveTranscript(["A short transcript."]).band).toBe("no_flags");
  });
});

describe("emergency detection and baseline trend", () => {
  it("matches only the requested emergency phrases without matching substrings", () => {
    expect(detectEmergencyPhrases("I FELL yesterday, now chest pain; can't breathe, help me.")).toEqual([
      "I fell", "chest pain", "can't breathe", "help me",
    ]);
    expect(detectEmergencyPhrases("I fellacy with a chest painted picture.")).toEqual([]);
  });

  it("uses the latest session against the mean of prior sessions and waits for three scores", () => {
    expect(calculateCognitiveTrend([80, 70])).toBeNull();
    expect(calculateCognitiveTrend([80, 70, 90])).toEqual({
      latestScore: 80,
      baselineScore: 80,
      difference: 0,
      scoredSessionCount: 3,
    });
  });
});
