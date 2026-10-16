export const CONTRACT_VERSION = 1 as const;

export type Capability =
  | "memories:read"
  | "recordings:create"
  | "evidence:delete"
  | "people:manage"
  | "sharing:manage"
  | "rides:prepare"
  | "appointments:book"
  | "medications:read"
  | "medications:record";

export type MemoryKind = "reported_activity" | "plan" | "personal_fact" | "conversation_topic";
export type ProcessingState = "queued" | "processing" | "ready" | "failed";

export interface Person {
  id: string;
  name: string;
  relationship: string;
  initials: string;
  enrollment: "not_enrolled" | "enrolled" | "revoked";
  color: "green" | "blue" | "sand";
}

export interface TranscriptTurn {
  id: string;
  speaker: string;
  personId?: string;
  start: number;
  end: number;
  text: string;
  uncertain?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  summary: string;
  startedAt: string;
  duration: number;
  people: string[];
  state: ProcessingState;
  turns: TranscriptTurn[];
  audioAvailable: boolean;
  synthetic: boolean;
}

export interface Memory {
  id: string;
  kind: MemoryKind;
  title: string;
  text: string;
  localDate: string;
  occurredAt?: string;
  plannedFor?: string;
  conversationId: string;
  turnIds: string[];
  people: string[];
}

export interface Citation {
  conversationId: string;
  turnId: string;
  timestamp: number;
  label: string;
  excerpt: string;
}

export interface RecallAnswer {
  text: string;
  citations: Citation[];
  insufficient: boolean;
}

export interface PatientSpace {
  id: string;
  name: string;
  timezone: string;
  capabilities: Capability[];
  people: Person[];
  conversations: Conversation[];
  memories: Memory[];
}

export const memoryLabels: Record<MemoryKind, string> = {
  reported_activity: "Reported activity",
  plan: "Future plan",
  personal_fact: "Personal detail",
  conversation_topic: "Conversation topic",
};

export const PATIENT_CAPABILITIES: Capability[] = [
  "memories:read", "recordings:create", "evidence:delete", "people:manage",
  "sharing:manage", "rides:prepare", "appointments:book", "medications:read", "medications:record",
];
