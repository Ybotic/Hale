export type AnalysisBand = "no_flags" | "some_flags" | "many_flags";

export type CognitiveMetrics = {
  totalWords: number;
  uniqueWords: number;
  hapaxLegomena: number;
  typeTokenRatio: number | null;
  movingAverageTypeTokenRatio: number | null;
  movingAverageWindowCount: number;
  fillerWordCount: number;
  fillerWordRate: number;
  falseStartCount: number;
  falseStartRate: number;
  immediateRepetitionCount: number;
  immediateRepetitionRate: number;
  pronounCount: number;
  pronounRatio: number;
  genericPronounCount: number;
  genericPronounRatio: number;
  wordFindingPhraseCount: number;
  pauseMarkerCount: number;
  repeatedStatementCount: number;
  sampleAdequate: boolean;
};

export type AnalysisMarker = {
  key: string;
  label: string;
  value: number | null;
  threshold: string;
  flagged: boolean;
  points: number;
  evidence: string[];
};

export type CognitiveAnalysis = {
  riskScore: number;
  band: AnalysisBand;
  metrics: CognitiveMetrics;
  markers: AnalysisMarker[];
};

export type CognitiveTrend = {
  latestScore: number;
  baselineScore: number;
  difference: number;
  scoredSessionCount: number;
};

export const COGNITIVE_THRESHOLDS = {
  // Below 50 words, transcript-level ratios are too unstable for a scored session.
  minimumWords: 50,
  // Fixing a 50-token window makes TTR values more comparable across sessions.
  movingAverageWindowWords: 50,
  // A 25-token stride samples overlapping local vocabulary windows.
  movingAverageStrideWords: 25,
  // Overall TTR below 0.45 flags unusually limited vocabulary variety after the minimum sample.
  typeTokenRatio: 0.45,
  // Moving-window TTR below 0.40 flags consistently low local vocabulary variety.
  movingAverageTypeTokenRatio: 0.4,
  // Four or more counted filler events per hundred words flags a higher filler rate.
  fillerWordRate: 0.04,
  // Two or more marked word cut-offs per hundred words flags false starts.
  falseStartRate: 0.02,
  // Two or more adjacent repeated words per hundred words flags immediate repetition.
  immediateRepetitionRate: 0.02,
  // One pronoun in every four words flags a high overall pronoun ratio for review.
  pronounRatio: 0.25,
  // Generic references ("it", "thing", "stuff") at eight percent of words are flagged.
  genericPronounRatio: 0.08,
  // Two recognized word-finding phrases in one session are flagged.
  wordFindingPhrases: 2,
  // Three explicit pause markers per hundred words are flagged.
  pauseMarkersPerHundredWords: 3,
  // One exact repeated statement of at least four words is flagged.
  repeatedStatements: 1,
} as const;

const WORD_PATTERN = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
const FILLER_PATTERN = /\b(?:um+|uh+|erm+|er+|ah+)\b|\byou\s+know\b/giu;
const FALSE_START_PATTERN = /\b[\p{L}]{1,8}[-–—]\s+(?=[\p{L}])/gu;
const WORD_FINDING_PATTERN = /\b(?:what(?:'|’)s\s+it\s+called|what\s+is\s+it\s+called|that\s+thing|i(?:'|’)m\s+not\s+sure|i\s+am\s+not\s+sure|what\s+do\s+you\s+call\s+it)\b/giu;
const PAUSE_PATTERN = /\[(?:long\s+)?pause\]|\((?:long\s+)?pause\)|<break\b[^>]*>|\.{3,}|…{1,}/giu;
const PRONOUNS = new Set([
  "i", "me", "my", "mine", "we", "us", "our", "ours", "you", "your", "yours",
  "he", "him", "his", "she", "her", "hers", "they", "them", "their", "theirs",
  "it", "its",
]);
const GENERIC_PRONOUNS = new Set(["it", "thing", "stuff"]);
const MAX_EVIDENCE_EXCERPTS = 3;
const MAX_EXCERPT_LENGTH = 220;

function normalizedWords(text: string): string[] {
  return Array.from(text.matchAll(WORD_PATTERN), (match) => (match[0] ?? "").toLowerCase().replace("’", "'"));
}

function countMatches(text: string, pattern: RegExp): number {
  pattern.lastIndex = 0;
  let count = 0;
  while (pattern.exec(text) !== null) count += 1;
  pattern.lastIndex = 0;
  return count;
}

function excerpt(text: string): string {
  const normalized = text.trim().replace(/\s+/gu, " ");
  return normalized.length > MAX_EXCERPT_LENGTH ? `${normalized.slice(0, MAX_EXCERPT_LENGTH - 1)}…` : normalized;
}

function uniqueExcerpts(texts: string[]): string[] {
  return [...new Set(texts.map(excerpt).filter(Boolean))].slice(0, MAX_EVIDENCE_EXCERPTS);
}

function evidenceFor(utterances: string[], predicate: (text: string) => boolean): string[] {
  const matching = utterances.filter(predicate);
  return uniqueExcerpts(matching.length > 0 ? matching : utterances.slice(0, 1));
}

export function tokenizeTranscript(text: string): string[] {
  return normalizedWords(text);
}

export function countUniqueWords(words: readonly string[]): number {
  return new Set(words.map((word) => word.toLowerCase().replace("’", "'")).filter(Boolean)).size;
}

export function calculateTypeTokenRatio(words: readonly string[]): number | null {
  return words.length === 0 ? null : countUniqueWords(words) / words.length;
}

export function countHapaxLegomena(words: readonly string[]): number {
  const frequencies = new Map<string, number>();
  for (const word of words) {
    const normalized = word.toLowerCase().replace("’", "'");
    if (normalized) frequencies.set(normalized, (frequencies.get(normalized) ?? 0) + 1);
  }
  return [...frequencies.values()].filter((frequency) => frequency === 1).length;
}

export function calculateMovingAverageTypeTokenRatio(
  words: readonly string[],
  windowSize: number = COGNITIVE_THRESHOLDS.movingAverageWindowWords,
  stride: number = COGNITIVE_THRESHOLDS.movingAverageStrideWords,
): { value: number | null; windowCount: number } {
  if (!Number.isInteger(windowSize) || windowSize < 1 || !Number.isInteger(stride) || stride < 1) {
    throw new Error("Moving-average window size and stride must be positive integers.");
  }
  if (words.length < windowSize) return { value: null, windowCount: 0 };

  const ratios: number[] = [];
  for (let start = 0; start + windowSize <= words.length; start += stride) {
    const ratio = calculateTypeTokenRatio(words.slice(start, start + windowSize));
    if (ratio !== null) ratios.push(ratio);
  }
  return {
    value: ratios.length === 0 ? null : ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length,
    windowCount: ratios.length,
  };
}

export function calculateFillerWordRate(text: string, totalWords = tokenizeTranscript(text).length): { count: number; rate: number } {
  const count = countMatches(text, FILLER_PATTERN);
  return { count, rate: totalWords === 0 ? 0 : count / totalWords };
}

export function countFalseStarts(text: string): number {
  return countMatches(text, FALSE_START_PATTERN);
}

export function countImmediateWordRepetitions(text: string): number {
  const words = normalizedWords(text);
  return words.slice(1).reduce((count, word, index) => count + (words[index] === word ? 1 : 0), 0);
}

export function calculatePronounRatios(words: readonly string[]): {
  pronounCount: number;
  pronounRatio: number;
  genericPronounCount: number;
  genericPronounRatio: number;
} {
  const pronounCount = words.filter((word) => PRONOUNS.has(word.toLowerCase())).length;
  const genericPronounCount = words.filter((word) => GENERIC_PRONOUNS.has(word.toLowerCase())).length;
  const denominator = words.length || 1;
  return {
    pronounCount,
    pronounRatio: pronounCount / denominator,
    genericPronounCount,
    genericPronounRatio: genericPronounCount / denominator,
  };
}

export function findWordFindingPhrases(text: string): string[] {
  WORD_FINDING_PATTERN.lastIndex = 0;
  const phrases = Array.from(text.matchAll(WORD_FINDING_PATTERN), (match) => match[0] ?? "");
  WORD_FINDING_PATTERN.lastIndex = 0;
  return phrases;
}

export function countPauseMarkers(text: string): number {
  return countMatches(text, PAUSE_PATTERN);
}

export function findRepeatedStatements(utterances: readonly string[]): { count: number; repeatedTexts: string[] } {
  const seen = new Map<string, string>();
  const repeatedTexts: string[] = [];
  for (const utterance of utterances) {
    for (const sentence of utterance.split(/(?<=[.!?])\s+|\n+/u)) {
      const statementWords = normalizedWords(sentence);
      if (statementWords.length < 4) continue;
      const key = statementWords.join(" ");
      if (seen.has(key)) repeatedTexts.push(sentence.trim());
      else seen.set(key, sentence.trim());
    }
  }
  return { count: repeatedTexts.length, repeatedTexts };
}

function createMarker(
  key: string,
  label: string,
  value: number | null,
  threshold: string,
  flagged: boolean,
  points: number,
  evidence: string[],
): AnalysisMarker {
  return { key, label, value, threshold, flagged, points: flagged ? points : 0, evidence: flagged ? evidence : [] };
}

export function analyzeCognitiveTranscript(utterances: readonly string[]): CognitiveAnalysis {
  const texts = [...utterances];
  const transcript = texts.join(" ");
  const words = tokenizeTranscript(transcript);
  const wordCount = words.length;
  const ttr = calculateTypeTokenRatio(words);
  const movingTtr = calculateMovingAverageTypeTokenRatio(words);
  const fillers = calculateFillerWordRate(transcript, wordCount);
  const falseStarts = countFalseStarts(transcript);
  const immediateRepetitions = texts.reduce((count, text) => count + countImmediateWordRepetitions(text), 0);
  const pronouns = calculatePronounRatios(words);
  const wordFindingPhrases = findWordFindingPhrases(transcript);
  const pauses = countPauseMarkers(transcript);
  const repeatedStatements = findRepeatedStatements(texts);
  const safeDenominator = wordCount || 1;
  const falseStartRate = falseStarts / safeDenominator;
  const immediateRepetitionRate = immediateRepetitions / safeDenominator;
  const pauseRate = pauses / safeDenominator;
  const sampleAdequate = wordCount >= COGNITIVE_THRESHOLDS.minimumWords;

  const metrics: CognitiveMetrics = {
    totalWords: wordCount,
    uniqueWords: countUniqueWords(words),
    hapaxLegomena: countHapaxLegomena(words),
    typeTokenRatio: ttr,
    movingAverageTypeTokenRatio: movingTtr.value,
    movingAverageWindowCount: movingTtr.windowCount,
    fillerWordCount: fillers.count,
    fillerWordRate: fillers.rate,
    falseStartCount: falseStarts,
    falseStartRate,
    immediateRepetitionCount: immediateRepetitions,
    immediateRepetitionRate,
    pronounCount: pronouns.pronounCount,
    pronounRatio: pronouns.pronounRatio,
    genericPronounCount: pronouns.genericPronounCount,
    genericPronounRatio: pronouns.genericPronounRatio,
    wordFindingPhraseCount: wordFindingPhrases.length,
    pauseMarkerCount: pauses,
    repeatedStatementCount: repeatedStatements.count,
    sampleAdequate,
  };

  // Thresholds below are transparent screening heuristics, not diagnostic cutoffs.
  // TTR comparisons are withheld for short transcripts because estimates are unstable.
  const markers: AnalysisMarker[] = [
    createMarker("type_token_ratio", "Type-token ratio", ttr, `< ${COGNITIVE_THRESHOLDS.typeTokenRatio.toFixed(2)} at ${COGNITIVE_THRESHOLDS.minimumWords}+ words`, sampleAdequate && ttr !== null && ttr < COGNITIVE_THRESHOLDS.typeTokenRatio, 12, evidenceFor(texts, (text) => tokenizeTranscript(text).length > 0)),
    createMarker("moving_average_ttr", "Moving-average type-token ratio", movingTtr.value, `< ${COGNITIVE_THRESHOLDS.movingAverageTypeTokenRatio.toFixed(2)} across 50-word windows`, sampleAdequate && movingTtr.value !== null && movingTtr.value < COGNITIVE_THRESHOLDS.movingAverageTypeTokenRatio, 12, evidenceFor(texts, (text) => tokenizeTranscript(text).length >= COGNITIVE_THRESHOLDS.movingAverageWindowWords)),
    createMarker("filler_word_rate", "Filler-word rate", fillers.rate, `≥ ${(COGNITIVE_THRESHOLDS.fillerWordRate * 100).toFixed(0)}% of words`, fillers.rate >= COGNITIVE_THRESHOLDS.fillerWordRate, 8, evidenceFor(texts, (text) => countMatches(text, FILLER_PATTERN) > 0)),
    createMarker("false_starts", "False starts", falseStartRate, `≥ ${(COGNITIVE_THRESHOLDS.falseStartRate * 100).toFixed(0)}% of words`, falseStartRate >= COGNITIVE_THRESHOLDS.falseStartRate, 10, evidenceFor(texts, (text) => countFalseStarts(text) > 0)),
    createMarker("immediate_repetition", "Immediate word repetition", immediateRepetitionRate, `≥ ${(COGNITIVE_THRESHOLDS.immediateRepetitionRate * 100).toFixed(0)}% of words`, immediateRepetitionRate >= COGNITIVE_THRESHOLDS.immediateRepetitionRate, 8, evidenceFor(texts, (text) => countImmediateWordRepetitions(text) > 0)),
    createMarker("pronoun_ratio", "Pronoun ratio", pronouns.pronounRatio, `≥ ${(COGNITIVE_THRESHOLDS.pronounRatio * 100).toFixed(0)}% of words`, pronouns.pronounRatio >= COGNITIVE_THRESHOLDS.pronounRatio, 5, evidenceFor(texts, (text) => normalizedWords(text).some((word) => PRONOUNS.has(word)))),
    createMarker("generic_pronoun_ratio", "Generic-pronoun ratio", pronouns.genericPronounRatio, `≥ ${(COGNITIVE_THRESHOLDS.genericPronounRatio * 100).toFixed(0)}% of words`, pronouns.genericPronounRatio >= COGNITIVE_THRESHOLDS.genericPronounRatio, 10, evidenceFor(texts, (text) => normalizedWords(text).some((word) => GENERIC_PRONOUNS.has(word)))),
    createMarker("word_finding_phrases", "Word-finding phrases", wordFindingPhrases.length, `≥ ${COGNITIVE_THRESHOLDS.wordFindingPhrases} in a session`, wordFindingPhrases.length >= COGNITIVE_THRESHOLDS.wordFindingPhrases, 15, evidenceFor(texts, (text) => findWordFindingPhrases(text).length > 0)),
    createMarker("pause_markers", "Pause markers", pauseRate * 100, `≥ ${COGNITIVE_THRESHOLDS.pauseMarkersPerHundredWords} per 100 words`, pauseRate * 100 >= COGNITIVE_THRESHOLDS.pauseMarkersPerHundredWords, 8, evidenceFor(texts, (text) => countPauseMarkers(text) > 0)),
    createMarker("repeated_statements", "Repeated statements", repeatedStatements.count, `≥ ${COGNITIVE_THRESHOLDS.repeatedStatements} repeated statement`, repeatedStatements.count >= COGNITIVE_THRESHOLDS.repeatedStatements, 12, uniqueExcerpts(repeatedStatements.repeatedTexts)),
  ];

  const flaggedCount = markers.filter((marker) => marker.flagged).length;
  const riskScore = Math.min(100, markers.reduce((total, marker) => total + marker.points, 0));
  // Neutral display bands report only the count of flagged metrics: none, one or two, or three-plus.
  const band: AnalysisBand = flaggedCount === 0 ? "no_flags" : flaggedCount <= 2 ? "some_flags" : "many_flags";
  return { riskScore, band, metrics, markers };
}

export function detectEmergencyPhrases(text: string): string[] {
  const phrases = ["I fell", "chest pain", "can't breathe", "help me"] as const;
  const normalized = text.toLowerCase().replace(/[’]/gu, "'");
  return phrases.filter((phrase) => {
    const escaped = phrase.toLowerCase().replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    return new RegExp(`\\b${escaped}\\b`, "u").test(normalized);
  });
}

export function calculateCognitiveTrend(scores: readonly number[]): CognitiveTrend | null {
  if (scores.length < 3) return null;
  const latestScore = scores[0];
  if (latestScore === undefined) return null;
  const baselineScores = scores.slice(1);
  const baselineScore = baselineScores.reduce((sum, score) => sum + score, 0) / baselineScores.length;
  return {
    latestScore,
    baselineScore,
    difference: latestScore - baselineScore,
    scoredSessionCount: scores.length,
  };
}
