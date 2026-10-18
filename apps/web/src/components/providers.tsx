"use client";

import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import Link from "next/link";
import { ClerkProvider, UserButton, useAuth } from "@clerk/nextjs";
import type { CareRecord, PatientSpace } from "@hale/contracts";
import { demoCareRecords, demoSpace, DEMO_TODAY } from "@hale/contracts/demo";
import { localDate } from "@hale/contracts/time";
import { type FamilyProfile, type PatientInfo } from "@/lib/api";
import { ApiClientError, apiPath, apiRequest, useApiQuery } from "@/lib/api-client";
import { ArrowRight, Leaf, RefreshCw, ShieldCheck } from "lucide-react";
import { appMode } from "@/lib/app-mode";
import { Button } from "./ui/button";
import { SwitchField } from "./ui/switch";

export interface SegmentUpload { blob: Blob; sequence: number; capturedAt: number; endedAt: number }
interface Workspace {
  mode: "demo" | "live";
  space: PatientSpace;
  careRecords: CareRecord[];
  setCareRecords: Dispatch<SetStateAction<CareRecord[]>>;
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
  const [careRecords, setCareRecords] = useState<CareRecord[]>(demoCareRecords);
  return <WorkspaceContext.Provider value={{
    mode: "demo", space, careRecords, setCareRecords, today: DEMO_TODAY,
    patients: [{ id: space.id, name: space.name, timezone: space.timezone, capabilities: space.capabilities }],
    selectPatient: () => {},
    deleteConversation: async (id) => setSpace((current) => ({ ...current, conversations: current.conversations.filter((item) => item.id !== id), memories: current.memories.filter((item) => item.conversationId !== id) })),
    resetDemo: () => { setSpace(demoSpace); setCareRecords(demoCareRecords); },
    account: <Link href="/login" className="avatar avatar-ink" aria-label="Account and sign in" title="Fictional family member · Daniel Okafor">DO</Link>,
    beginSession: async () => crypto.randomUUID(),
    setSessionState: async () => {},
    uploadSegment: async () => { throw new Error("Demo recordings stay on this device. Uploads are available in live mode."); },
  }}>{children}</WorkspaceContext.Provider>;
}

function LiveSpace({ patientId, patients, selectPatient, children }: { patientId: string; patients: PatientInfo[]; selectPatient: (id: string) => void; children: ReactNode }) {
  const { data: space } = useApiQuery<PatientSpace>(`spaces/${patientId}`);
  if (!space) return <Gate title="Opening your memory space…" />;
  return <WorkspaceContext.Provider value={{
    mode: "live", space, careRecords: [], setCareRecords: () => {}, today: localDate(new Date(), space.timezone), patients, selectPatient,
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
  const [familyRefresh, setFamilyRefresh] = useState(0);
  const patientPath = apiPath("patients", { refresh: String(patientRefresh) });
  const familyPath = apiPath("voice-profile", { refresh: String(familyRefresh) });
  const { data: patients, error: patientsError } = useApiQuery<PatientInfo[]>(patientPath, authenticated);
  const { data: family, error: familyError } = useApiQuery<{ configured: boolean; profile: FamilyProfile | null }>(familyPath, authenticated && patients?.length === 0, 5000);
  const [selected, setSelected] = useState<string>();
  if (!isLoaded) return <Gate title="A moment for your memories…" />;
  if (!isSignedIn) return <Gate title="Your memories. Your space." description="Sign in to open your private memory bank. Only people you authorize can access it."><div className="button-group"><Button asChild variant="primary"><Link href="/login">Log in <ArrowRight aria-hidden className="size-6" /></Link></Button><Button asChild variant="secondary"><Link href="/signup">Create an account</Link></Button></div></Gate>;
  if (patientsError) {
    const needsSignIn = patientsError instanceof ApiClientError && patientsError.status === 401;
    return <Gate title={needsSignIn ? "Your sign-in needs refreshing." : "Your memory space needs attention."} description={needsSignIn ? "Please sign in again to open your private space." : "We couldn’t load your private spaces. Check your connection or try again."}>
      <div className="button-group">{needsSignIn && <Button asChild variant="secondary"><Link href="/login">Sign in again</Link></Button>}<Button variant="primary" onClick={() => setPatientRefresh((current) => current + 1)}><RefreshCw aria-hidden className="size-6" />Try again</Button></div>
    </Gate>;
  }
  if (!patients) return <Gate title={patientRefresh ? "Checking your access…" : "Finding your memory space…"} description={patientRefresh ? "Checking whether your account has access to a patient space…" : "Connecting to your private memory space…"} />;
  if (patients.length) {
    const patientId = patients.find((patient) => patient.id === selected)?.id ?? patients[0].id;
    return <LiveSpace key={patientId} patientId={patientId} patients={patients} selectPatient={setSelected}>{children}</LiveSpace>;
  }
  if (familyError) return <Gate title="Your account profile couldn’t be checked." description="Retry before creating a space so we can confirm your account setup."><Button variant="primary" onClick={() => setFamilyRefresh((current) => current + 1)}><RefreshCw aria-hidden className="size-6" />Try again</Button></Gate>;
  if (!family) return <Gate title="Finding your memory space…" description="Checking your account setup…" />;
  if (family.profile) return <Gate title="Your family account is ready." description="You don’t have access to a patient space yet. Ask its administrator to open People → Invite family and send an invitation to your verified email. Open the invitation link and accept while signed in with that same email. Creating an account or voice profile never grants access to someone’s memories."><div className="button-group"><Button variant="primary" onClick={() => setPatientRefresh((current) => current + 1)}><RefreshCw aria-hidden className="size-6" />I accepted an invite — check access</Button><UserButton /></div></Gate>;
  return <Onboarding onCreated={() => setPatientRefresh((current) => current + 1)} />;
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
      <div className="notice"><ShieldCheck size={20} /><p>Raw audio is kept for up to seven days. Transcripts and saved memories remain until you delete them. Voice messages and speaker matching may send selected audio to external services after separate consent. Cloud processing is not end-to-end encrypted.</p></div>
      <SwitchField id="patient-onboarding-recording-consent" name="consent" required label="Accept the recording terms for this space" description="I will only record conversations when everyone taking part has agreed." />
      {error && <p role="alert" className="error-text">{error}</p>}
       <Button variant="primary" disabled={busy}>{busy ? "Creating…" : "Create my space"}<ArrowRight aria-hidden className="size-6" /></Button>
    </form>
  </Gate>;
}

export function Gate({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return <main className="gate"><Link className="wordmark" href="/"><Leaf size={24} />hale.</Link><p className="eyebrow">Your memories, always within reach.</p><h1>{title}</h1>{description && <p className="gate-description">{description}</p>}{children}</main>;
}

function configuredLiveApp() {
  return appMode === "live" && Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}
const liveConfigured = configuredLiveApp();
export function AppProviders({ children }: { children: ReactNode }) {
  if (appMode === "demo") return <DemoProvider>{children}</DemoProvider>;
  if (appMode === "invalid") return <Gate title="Hale needs an account setup choice." description="Choose the demo workspace or connect your private account to continue." />;
  if (!liveConfigured) return <Gate title="Your private space isn’t available yet." description="Hale couldn’t connect to your account and memory space. Try again later." />;
  return <ClerkProvider signInUrl="/login" signUpUrl="/signup" signInFallbackRedirectUrl="/family/overview" signUpFallbackRedirectUrl="/signup/voice">{children}</ClerkProvider>;
}

// Public auth/onboarding routes need identity/backend providers, not a patient workspace.
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  if (appMode !== "live") return children;
  return <LiveGate>{children}</LiveGate>;
}
