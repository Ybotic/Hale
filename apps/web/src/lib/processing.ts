import type { MemoryKind, TranscriptTurn } from "@hale/contracts";
import { isLocalDate } from "@hale/contracts/time";

export interface TimedTranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface DiarizationSegment { start: number; end: number; speaker: string }
export interface SpeakerIdentity { start: number; end: number; diarizationSpeaker: string; match: string | null }
export interface SpeakerConfidence { speaker: string; confidence: Record<string, number> }
export interface VoiceMatch { personId: string; name: string }
export type MergedTurn = Omit<TranscriptTurn, "id"> & { confidence?: number };

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseWhisperSegments(payload: unknown, durationSeconds: number): TimedTranscriptSegment[] {
  if (!isObject(payload)) throw new Error("Whisper returned an invalid transcription response.");
  const segments = Array.isArray(payload.segments) ? payload.segments : [];
  const parsed = segments.flatMap((item) => {
    if (!isObject(item) || typeof item.text !== "string") return [];
    const start = Number(item.start), end = Number(item.end), text = item.text.trim();
    if (!text || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) return [];
    return [{ start, end, text }];
  });
  if (parsed.length) return parsed;
  if (typeof payload.text === "string" && payload.text.trim()) {
    const end = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 1;
    return [{ start: 0, end, text: payload.text.trim() }];
  }
  throw new Error("Whisper returned no transcript text.");
}

function overlap(a: { start: number; end: number }, b: { start: number; end: number }) {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

export function mergeTranscriptAndSpeakers(input: {
  transcript: TimedTranscriptSegment[];
  diarization: DiarizationSegment[];
  identities?: SpeakerIdentity[];
  confidences?: SpeakerConfidence[];
  voices?: VoiceMatch[];
  threshold?: number;
}): MergedTurn[] {
  const voiceById = new Map((input.voices ?? []).map((voice) => [voice.personId, voice]));
  const minimumConfidence = input.threshold ?? 70;
  return input.transcript.map((segment) => {
    const best = input.diarization
      .map((candidate) => ({ candidate, duration: overlap(segment, candidate) }))
      .filter((entry) => entry.duration > 0)
      .sort((a, b) => b.duration - a.duration)[0]?.candidate;
    if (!best) return { speaker: "Unknown speaker", start: segment.start, end: segment.end, text: segment.text, uncertain: true };

    const identity = (input.identities ?? []).find((item) => item.diarizationSpeaker === best.speaker && overlap(segment, item) > 0);
    const person = identity?.match ? voiceById.get(identity.match) : undefined;
    const score = person ? input.confidences?.find((item) => item.speaker === best.speaker)?.confidence[person.personId] : undefined;
    if (!person || (score !== undefined && score < minimumConfidence)) {
      return { speaker: "Unknown speaker", start: segment.start, end: segment.end, text: segment.text, uncertain: true, ...(score === undefined ? {} : { confidence: score }) };
    }
    return { speaker: person.name, personId: person.personId, start: segment.start, end: segment.end, text: segment.text, uncertain: false, ...(score === undefined ? {} : { confidence: score }) };
  });
}

export interface ExtractedMemoryCandidate {
  kind: MemoryKind;
  title: string;
  text: string;
  localDate: string;
  plannedFor?: string;
  occurredAt?: string;
  turnIds: string[];
  people: string[];
}

export function validateMemoryCandidates(payload: unknown, turns: Array<Pick<TranscriptTurn, "id" | "personId">>, localDay: string): ExtractedMemoryCandidate[] {
  const value = typeof payload === "string" ? JSON.parse(payload) as unknown : payload;
  if (!isObject(value) || !Array.isArray(value.memories)) throw new Error("Backboard returned an invalid memory response.");
  const turnIds = new Set(turns.map((turn) => turn.id));
  const people = new Set(turns.flatMap((turn) => turn.personId ? [turn.personId] : []));
  const kinds = new Set<MemoryKind>(["reported_activity", "plan", "personal_fact", "conversation_topic"]);
  return value.memories.flatMap((item): ExtractedMemoryCandidate[] => {
    if (!isObject(item) || typeof item.kind !== "string" || !kinds.has(item.kind as MemoryKind)
      || typeof item.title !== "string" || !item.title.trim() || item.title.length > 160
      || typeof item.text !== "string" || !item.text.trim() || item.text.length > 1200
      || !Array.isArray(item.turnIds) || item.turnIds.length === 0
      || !item.turnIds.every((id) => typeof id === "string" && turnIds.has(id))) return [];
    const day = localDay;
    const plannedFor = typeof item.plannedFor === "string" && isLocalDate(item.plannedFor) ? item.plannedFor : undefined;
    const occurredAt = typeof item.occurredAt === "string" && item.occurredAt.length <= 80 ? item.occurredAt : undefined;
    const linkedPeople = Array.isArray(item.people) ? item.people.filter((person): person is string => typeof person === "string" && people.has(person)) : [];
    return [{ kind: item.kind as MemoryKind, title: item.title.trim(), text: item.text.trim(), localDate: day, plannedFor, occurredAt, turnIds: [...new Set(item.turnIds as string[])], people: [...new Set(linkedPeople)] }];
  });
}

export function validateDailySummary(payload: unknown, allowedTurnIds: string[]) {
  const value = typeof payload === "string" ? JSON.parse(payload) as unknown : payload;
  if (!isObject(value) || typeof value.summary !== "string" || !value.summary.trim() || value.summary.length > 2400
    || !Array.isArray(value.turnIds) || value.turnIds.length === 0 || !value.turnIds.every((id) => typeof id === "string" && allowedTurnIds.includes(id))) {
    throw new Error("Backboard returned an invalid summary or unsupported source references.");
  }
  return { summary: value.summary.trim(), turnIds: [...new Set(value.turnIds as string[])] };
}
