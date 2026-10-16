import type { Metadata } from "next";
import { VoiceOnboarding } from "@/components/voice-onboarding";

export const metadata: Metadata = { title: "Set up your voice" };
export default function VoiceSetupPage() { return <VoiceOnboarding />; }
