import { Suspense } from "react";
import { AskView } from "@/components/ask";
import { VoiceAssistant } from "@/components/voice-assistant";
export default function PatientAskPage() { return <><Suspense fallback={<p className="loading-text">Opening your assistant…</p>}><AskView patient /></Suspense><VoiceAssistant /></>; }
