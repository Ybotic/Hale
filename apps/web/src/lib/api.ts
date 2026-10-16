import type { Capability } from "@hale/contracts";
import type { VoiceState } from "@hale/contracts/voice";

export interface PatientInfo { id: string; name: string; timezone: string; capabilities: Capability[] }
export interface FamilyProfile { name: string; relationship: string; voiceState: VoiceState; message?: string }
