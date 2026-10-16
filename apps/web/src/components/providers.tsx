"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import { ClerkProvider, UserButton, useAuth } from "@clerk/nextjs";
import type { PatientSpace } from "@hale/contracts";
import { demoSpace, DEMO_TODAY } from "@hale/contracts/demo";
import { localDate } from "@hale/contracts/time";
import { type FamilyProfile, type PatientInfo } from "@/lib/api";
import { apiPath, apiRequest, useApiQuery } from "@/lib/api-client";
import { ArrowRight, Leaf, ShieldCheck } from "lucide-react";
import { appMode } from "@/lib/app-mode";

export interface SegmentUpload { blob: Blob; sequence: number; capturedAt: number; endedAt: number }
interface Workspace {
  mode: "demo" | "live";
  space: PatientSpace;
  today: string;
  patients: PatientInfo[];
  selectPatient: (id: string) => void;
  deleteConversation: (id: string) => Promise<void>;
  resetDemo?: () => void;
  account: ReactNode;
  beginSession: () => Promise<string>;
  setSessionState: (id: string, state: "recording" | "paused" | "interrupted" | "stopped") => Promise<void>;
  uploadSegment: (sessionId: string, segment: SegmentUpload) => Promise<void>;
}

const WorkspaceContext = createContext<Workspace | null>(null);
export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("Workspace provider missing.");
  return value;
}

function DemoProvider({ children }: { children: ReactNode }) {
  const [space, setSpace] = useState<PatientSpace>(demoSpace);
  return <WorkspaceContext.Provider value={{
    mode: "demo", space, today: DEMO_TODAY,
    patients: [{ id: space.id, name: space.name, timezone: space.timezone, capabilities: space.capabilities }],
    selectPatient: () => {},
    deleteConversation: async (id) => setSpace((current) => ({ ...current, conversations: current.conversations.filter((item) => item.id !== id), memories: current.memories.filter((item) => item.conversationId !== id) })),
    resetDemo: () => setSpace(demoSpace),
    account: <Link href="/login" className="avatar avatar-ink" aria-label="Account and sign in" title="Fictional family member · Daniel Okafor">DO</Link>,
    beginSession: async () => crypto.randomUUID(),
    setSessionState: async () => {},
    uploadSegment: async () => { throw new Error("Demo recordings stay on this device. Configure TigerData to upload in live mode."); },
  }}>{children}</WorkspaceContext.Provider>;
}

function LiveSpace({ patientId, patients, selectPatient, children }: { patientId: string; patients: PatientInfo[]; selectPatient: (id: string) => void; children: ReactNode }) {
  const { data: space } = useApiQuery<PatientSpace>(`spaces/${patientId}`);
  if (!space) return <Gate title="Opening your memory space…" />;
  return <WorkspaceContext.Provider value={{
    mode: "live", space, today: localDate(new Date(), space.timezone), patients, selectPatient,
    account: <UserButton />,
    deleteConversation: async (conversationId) => { await apiRequest(`conversations/${conversationId}`, { method: "DELETE" }); },
    beginSession: async () => (await apiRequest<{ sessionId: string }>("recordings", { json: { patientId, participantsConsented: true } })).sessionId,
    setSessionState: async (sessionId, state) => { await apiRequest(`recordings/${sessionId}`, { method: "PATCH", json: { state } }); },
    uploadSegment: async (sessionId, segment) => {
      const query = new URLSearchParams({ sessionId, sequence: String(segment.sequence), capturedAt: String(segment.capturedAt), endedAt: String(segment.endedAt) });
      await apiRequest(`audio?${query}`, { method: "POST", headers: { "Content-Type": segment.blob.type }, body: segment.blob });
    },
  }}>{children}</WorkspaceContext.Provider>;
}

function LiveGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const authenticated = isLoaded && Boolean(isSignedIn);
  const [patientRefresh, setPatientRefresh] = useState(0);
  const patientPath = apiPath("patients", { refresh: String(patientRefresh) });
  const { data: patients, error: patientsError } = useApiQuery<PatientInfo[]>(patientPath, authenticated);
  const { data: family, error: familyError } = useApiQuery<{ configured: boolean; profile: FamilyProfile | null }>("voice-profile", authenticated, 5000);
  const [selected, setSelected] = useState<string>();
  if (!isLoaded) return <Gate title="A moment for your memories…" />;
  if (!isSignedIn) return <Gate title="Your memories. Your space." description="Sign in to open your private memory bank. Only people you authorize can access it."><div className="button-group"><Link href="/login" className="btn btn-primary">Log in <ArrowRight size={17} /></Link><Link href="/signup" className="btn btn-quiet">Create an account</Link></div></Gate>;
  if (patientsError || familyError) return <Gate title="Your memory connection needs attention." description="Check your TigerData connection, apply db/schema.sql, and confirm Clerk is configured." />;
  if (!patients || !family) return <Gate title="Finding your memory space…" description="Connecting to your private TigerData workspace…" />;
  if (!patients.length && family.profile) return <Gate title="You’re part of the circle." description="Your family account is ready. A patient-space administrator still needs to give your account access. Creating an account or a voice profile never grants access to someone’s memories. Invitation management isn’t connected in this prototype."><div className="button-group"><Link href="/signup/voice" className="btn btn-primary">Manage my voice profile <ArrowRight size={17} /></Link><UserButton /></div></Gate>;
  if (!patients.length) return <Onboarding onCreated={() => setPatientRefresh((current) => current + 1)} />;
  const patientId = patients.find((patient) => patient.id === selected)?.id ?? patients[0].id;
  return <LiveSpace key={patientId} patientId={patientId} patients={patients} selectPatient={setSelected}>{children}</LiveSpace>;
}

function Onboarding({ onCreated }: { onCreated: () => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return <Gate title="A little introduction." description="Create your own patient space. For this prototype, use a fictional name and consented test audio only.">
    <form className="onboarding-form" onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setError("");
      const data = new FormData(event.currentTarget);
      try {
        await apiRequest("patients", { json: { name: String(data.get("name")), timezone: String(data.get("timezone")), recordingConsent: data.get("consent") === "on" } });
        onCreated();
      }
      catch { setError("We couldn’t create your space. Check your details and try again."); }
      finally { setBusy(false); }
    }}>
      <label>Your display name<input name="name" required minLength={2} maxLength={100} placeholder="e.g. Margaret Okafor" /></label>
      <label>Your timezone<input name="timezone" required defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone} /></label>
      <div className="notice"><ShieldCheck size={20} /><p>Raw audio is stored in TigerData and expires after 7 days. When you use Ask Hale, selected source text is sent to Backboard AI, whose assistant memory is scoped to this patient space and your account. Cloud processing is not end-to-end encrypted. This prototype is not a medical service.</p></div>
      <label className="check-label"><input type="checkbox" name="consent" required /><span>I understand this cloud processing and consent to test recordings. Everyone in each conversation must also agree.</span></label>
      {error && <p role="alert" className="error-text">{error}</p>}
      <button className="btn btn-primary" disabled={busy}>{busy ? "Creating…" : "Create my space"}<ArrowRight size={17} /></button>
    </form>
  </Gate>;
}

export function Gate({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return <main className="gate"><Link className="wordmark" href="/"><Leaf size={23} />hale.</Link><p className="eyebrow">YOUR MEMORIES, ALWAYS WITHIN REACH.</p><h1>{title}</h1>{description && <p className="gate-description">{description}</p>}{children}</main>;
}

function configuredLiveApp() {
  return appMode === "live" && Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}
const liveConfigured = configuredLiveApp();
export function AppProviders({ children }: { children: ReactNode }) {
  if (appMode === "demo") return <DemoProvider>{children}</DemoProvider>;
  if (appMode === "invalid") return <Gate title="Choose a valid app mode." description="NEXT_PUBLIC_APP_MODE must be demo or live. An invalid configuration never silently opens a different data source." />;
  if (!liveConfigured) return <Gate title="Your live connection isn’t configured." description="Set the Clerk and TigerData environment variables, or explicitly select demo mode. Private data is never replaced with demo data after a connection error." />;
  return <ClerkProvider signInUrl="/login" signUpUrl="/signup" signInFallbackRedirectUrl="/family/overview" signUpFallbackRedirectUrl="/signup/voice">{children}</ClerkProvider>;
}

// Public auth/onboarding routes need identity/backend providers, not a patient workspace.
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  if (appMode !== "live") return children;
  return <LiveGate>{children}</LiveGate>;
}
